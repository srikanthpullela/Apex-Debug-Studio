/**
 * Apex Debug Studio — Update checker (user-initiated, never silent)
 *
 * Design goals (per product decision):
 *  - NEVER download or install anything in the background. The app only *checks*
 *    whether a newer, successfully-built version exists so the renderer can show a
 *    small "Update available" button in the titlebar. Nothing is downloaded or
 *    installed until the user clicks that button.
 *  - Windows & macOS (installed builds): electron-updater runs the full flow on
 *    click — download (with progress) then quitAndInstall / relaunch. macOS uses
 *    Squirrel.Mac, which REQUIRES the app to be Developer ID signed + notarized
 *    (configured in package.json build.mac + the CI signing step). If an install
 *    ever fails (e.g. an unsigned local build), we gracefully fall back to opening
 *    the release download page so the user is never dead-ended.
 *  - Dev / unpackaged runs: electron-updater can't run, so we only *detect* a
 *    newer build by reading the published `latest*.yml` manifest and, on click,
 *    open the release page. This lets the button be verified while developing.
 *
 * The rolling public release keeps a fixed `v1.0.0` tag whose assets are
 * overwritten on every main build; the real build version lives inside the
 * `version` field of the electron-builder manifest (`latest.yml` / `latest-mac.yml`),
 * which CI stamps as `1.0.<run number>` so it strictly increases build-over-build.
 */
const { app, ipcMain, shell, BrowserWindow, dialog } = require('electron');
const https = require('https');

const REPO_OWNER = 'srikanthpullela';
const REPO_NAME = 'Apex-Debug-Studio';
const RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const MAC_MANIFEST = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/latest-mac.yml`;
const WIN_MANIFEST = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/latest.yml`;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // re-check every 30 min while the app runs

// Also run the (read-only) availability check in a dev / unpackaged run, so the
// "Update available" button can be verified end-to-end while developing. In dev
// it only READS the published manifest and, on click, opens the release page —
// it never downloads or installs anything. Set ADS_UPDATE_DEV=0 to silence it
// during normal development.
const DEV_UPDATE_CHECK = process.env.ADS_UPDATE_DEV !== '0';

let getWindow = () => BrowserWindow.getAllWindows()[0] || null;
// Latest known state so a window that opens later (or reloads) can be re-synced.
let lastStatus = { state: 'none', version: null, percent: 0, error: null };
let autoUpdater = null; // lazy — loaded for installed macOS + Windows builds
let userInitiatedDownload = false; // true only after the user clicks (Windows)

/** Push the current update status to the renderer so it can show/hide the button. */
function send(state, version, percent, error) {
  lastStatus = {
    state,
    version: version || lastStatus.version || null,
    percent: percent == null ? 0 : percent,
    error: error || null,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('update:status', lastStatus); } catch (_) { /* window gone */ }
    }
  }
}

/** Compare two dotted numeric versions. Returns 1 if a>b, -1 if a<b, 0 if equal. */
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** GET a URL as text, following GitHub's redirects (releases/latest → tag → CDN). */
function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Apex-Debug-Studio-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
        return resolve(fetchText(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

/**
 * Read a published electron-builder manifest (latest-mac.yml / latest.yml) and
 * compare its version to the running app. Read-only: it only flips the button to
 * "available"; it never downloads or installs. Used for macOS always, and for
 * detection in any dev/unpackaged run.
 */
async function checkViaManifest(manifestUrl) {
  try {
    const yml = await fetchText(manifestUrl);
    const m = yml.match(/^version:\s*['"]?([\w.\-]+)['"]?\s*$/m);
    const remote = m && m[1];
    if (!remote) return; // couldn't parse — leave the current state untouched
    if (compareVersions(remote, app.getVersion()) > 0) send('available', remote);
    else send('none', remote);
  } catch (_) {
    // Transient failure (offline, GitHub hiccup): never nag and never hide a real
    // update — just leave the last state as-is and try again on the next interval.
  }
}

/** Installed builds: electron-updater checks the published release manifest. */
function checkViaUpdater() {
  if (!autoUpdater) return;
  autoUpdater.checkForUpdates().catch(() => {
    // Passive check failed — stay quiet (don't flip the button to an error state).
  });
}

function doCheck() {
  // Installed mac/win builds use electron-updater end-to-end (check → download →
  // install). Dev/unpackaged runs can't run electron-updater, so they fall back to
  // reading the published manifest for DETECTION only (the click opens the release
  // page). Dev detection is opt-out via DEV_UPDATE_CHECK so it can be verified
  // while developing.
  if (autoUpdater) { checkViaUpdater(); return; } // installed macOS or Windows
  if (!app.isPackaged && !DEV_UPDATE_CHECK) return;
  if (process.platform === 'darwin') checkViaManifest(MAC_MANIFEST);
  else if (process.platform === 'win32') checkViaManifest(WIN_MANIFEST);
  // Linux/others: no packaged auto-update channel yet — stay quiet.
}

/**
 * Surface an update error the user can act on — but only if THEY started the
 * download/install. A passive/background failure stays silent so we never show a
 * misleading button.
 */
function onUpdateError(err) {
  if (!userInitiatedDownload) return;
  userInitiatedDownload = false;
  send('error', lastStatus.version, 0, String(err && err.message ? err.message : err));
}

/**
 * The titlebar button's click handler routes here. Behavior depends on platform
 * and current state — but nothing ever happens without this explicit user action.
 */
async function primaryAction() {
  if (autoUpdater) { // installed macOS or Windows
    if (lastStatus.state === 'downloaded') {
      autoUpdater.quitAndInstall(); // relaunches into the new version
      return;
    }
    if (lastStatus.state === 'error') {
      // A previous download/install failed (e.g. a signature/permission problem).
      // Never dead-end the user: open the release page so they can update manually.
      await shell.openExternal(RELEASE_PAGE);
      return;
    }
    if (lastStatus.state === 'available') {
      userInitiatedDownload = true;
      send('downloading', lastStatus.version, 0);
      try {
        await autoUpdater.downloadUpdate();
      } catch (e) {
        onUpdateError(e);
      }
      return;
    }
    // Unknown / 'none' state — re-check so the button reflects reality.
    doCheck();
    return;
  }
  // Dev / unpackaged (or a platform without an updater): we can't self-install, so
  // open the release page for a manual download.
  await shell.openExternal(RELEASE_PAGE);
}

/**
 * Menu-driven "Check for Updates…". Unlike the passive doCheck() that only
 * flips the titlebar button, this always gives the user explicit feedback via a
 * dialog (up-to-date / available → offer download / error), like a normal app.
 */
async function checkForUpdatesInteractive() {
  const win = getWindow();
  const current = app.getVersion();

  // Installed macOS / Windows: electron-updater handles check → download → install.
  if (autoUpdater) {
    try {
      const res = await autoUpdater.checkForUpdates();
      const remote = res && res.updateInfo && res.updateInfo.version;
      if (remote && compareVersions(remote, current) > 0) {
        send('available', remote);
        const { response } = await dialog.showMessageBox(win, {
          type: 'info',
          buttons: ['Download & Install', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Update Available',
          message: `A new version is available: v${String(remote).replace(/^v/, '')}`,
          detail: `You're running v${current}. Download and install it now? The app will restart to finish installing.`,
        });
        if (response === 0) {
          userInitiatedDownload = true;
          send('downloading', remote, 0);
          try {
            await autoUpdater.downloadUpdate();
            const { response: r2 } = await dialog.showMessageBox(win, {
              type: 'info',
              buttons: ['Restart Now', 'Later'],
              defaultId: 0,
              cancelId: 1,
              title: 'Update Ready',
              message: 'Update downloaded',
              detail: `v${String(remote).replace(/^v/, '')} is ready. Restart now to finish installing?`,
            });
            if (r2 === 0) autoUpdater.quitAndInstall();
          } catch (e) {
            onUpdateError(e);
          }
        }
      } else {
        send('none', remote || current);
        await dialog.showMessageBox(win, {
          type: 'info',
          buttons: ['OK'],
          title: "You're Up to Date",
          message: "You're up to date",
          detail: `v${current} is the latest version.`,
        });
      }
    } catch (e) {
      await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['OK'],
        title: 'Update Check Failed',
        message: 'Could not check for updates',
        detail: String((e && e.message) || e),
      });
    }
    return;
  }

  // Dev/unpackaged or a platform without a self-updater: we can't self-install,
  // so offer to open the releases page for a manual download.
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    buttons: ['Open Releases Page', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Check for Updates',
    message: "Automatic updates aren't available in this build",
    detail: `You're running v${current}. Open the releases page to download the latest version.`,
  });
  if (response === 0) await shell.openExternal(RELEASE_PAGE);
}

function initUpdater(opts) {
  if (opts && typeof opts.getWindow === 'function') getWindow = opts.getWindow;

  // electron-updater drives the full download/install flow on INSTALLED macOS and
  // Windows builds. macOS uses Squirrel.Mac, which requires the app to be Developer
  // ID signed + notarized (see package.json build.mac + the CI signing step).
  if (app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')) {
    try {
      autoUpdater = require('electron-updater').autoUpdater;
      autoUpdater.autoDownload = false;          // never fetch bytes without a click
      autoUpdater.autoInstallOnAppQuit = false;  // never install silently on quit
      autoUpdater.on('update-available', (info) => send('available', info && info.version));
      autoUpdater.on('update-not-available', () => send('none'));
      autoUpdater.on('download-progress', (p) => send('downloading', lastStatus.version, Math.round(p.percent || 0)));
      autoUpdater.on('update-downloaded', (info) => { userInitiatedDownload = false; send('downloaded', info && info.version); });
      autoUpdater.on('error', onUpdateError);
    } catch (e) {
      autoUpdater = null;
    }
  }

  // IPC surface for the renderer button.
  ipcMain.handle('updates:current-version', () => app.getVersion());
  ipcMain.handle('updates:get-status', () => lastStatus);
  ipcMain.handle('updates:check', () => { doCheck(); return true; });
  ipcMain.handle('updates:primary-action', async () => { await primaryAction(); return true; });

  // Initial check shortly after launch, then periodically while running.
  setTimeout(doCheck, 8000);
  setInterval(doCheck, CHECK_INTERVAL_MS);
}

module.exports = { initUpdater, checkForUpdatesInteractive };
