/**
 * Apex Debug Studio — Update checker (user-initiated, never silent)
 *
 * Design goals (per product decision):
 *  - NEVER download or install anything in the background. The app only *checks*
 *    whether a newer, successfully-built version exists so the renderer can show a
 *    small "Update available" button in the titlebar. Nothing is downloaded or
 *    installed until the user clicks that button.
 *  - Windows: electron-updater does the full flow on click — download (with
 *    progress) then quitAndInstall. No code-signing certificate required.
 *  - macOS: an unsigned app CANNOT self-install (Squirrel.Mac requires a Developer
 *    ID signature), so we only *detect* a newer build by reading the published
 *    `latest-mac.yml` manifest, and on click we open the release download page so
 *    the user installs the new .dmg themselves. This avoids electron-updater's
 *    mac signature errors entirely.
 *
 * The rolling public release keeps a fixed `v1.0.0` tag whose assets are
 * overwritten on every main build; the real build version lives inside the
 * `version` field of the electron-builder manifest (`latest.yml` / `latest-mac.yml`),
 * which CI stamps as `1.0.<run number>` so it strictly increases build-over-build.
 */
const { app, ipcMain, shell, BrowserWindow } = require('electron');
const https = require('https');

const REPO_OWNER = 'srikanthpullela';
const REPO_NAME = 'Apex-Debug-Studio';
const RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const MAC_MANIFEST = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/latest-mac.yml`;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // re-check every 30 min while the app runs

let getWindow = () => BrowserWindow.getAllWindows()[0] || null;
// Latest known state so a window that opens later (or reloads) can be re-synced.
let lastStatus = { state: 'none', version: null, percent: 0, error: null };
let autoUpdater = null; // lazy — only loaded on Windows
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

/** macOS: read the published manifest, compare its version to the running app. */
async function checkMac() {
  try {
    const yml = await fetchText(MAC_MANIFEST);
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

/** Windows: electron-updater checks the same release (reads latest.yml). */
function checkWin() {
  if (!autoUpdater) return;
  autoUpdater.checkForUpdates().catch(() => {
    // Passive check failed — stay quiet (don't flip the button to an error state).
  });
}

function doCheck() {
  if (!app.isPackaged) return; // dev build: nothing to update to
  if (process.platform === 'win32') checkWin();
  else if (process.platform === 'darwin') checkMac();
  // Linux/others: no packaged auto-update channel yet — stay quiet.
}

/**
 * The titlebar button's click handler routes here. Behavior depends on platform
 * and current state — but nothing ever happens without this explicit user action.
 */
async function primaryAction() {
  if (process.platform === 'win32' && autoUpdater) {
    if (lastStatus.state === 'downloaded') {
      autoUpdater.quitAndInstall();
    } else if (lastStatus.state === 'available' || lastStatus.state === 'error') {
      userInitiatedDownload = true;
      send('downloading', lastStatus.version, 0);
      autoUpdater.downloadUpdate().catch((e) => send('error', lastStatus.version, 0, String(e && e.message ? e.message : e)));
    }
    return;
  }
  // macOS (and any non-Windows): open the release page so the user downloads the
  // new build and installs it — we can't self-install without an Apple certificate.
  await shell.openExternal(RELEASE_PAGE);
}

function initUpdater(opts) {
  if (opts && typeof opts.getWindow === 'function') getWindow = opts.getWindow;

  if (app.isPackaged && process.platform === 'win32') {
    try {
      autoUpdater = require('electron-updater').autoUpdater;
      autoUpdater.autoDownload = false;          // never fetch bytes without a click
      autoUpdater.autoInstallOnAppQuit = false;  // never install silently on quit
      autoUpdater.on('update-available', (info) => send('available', info && info.version));
      autoUpdater.on('update-not-available', () => send('none'));
      autoUpdater.on('download-progress', (p) => send('downloading', lastStatus.version, Math.round(p.percent || 0)));
      autoUpdater.on('update-downloaded', (info) => { userInitiatedDownload = false; send('downloaded', info && info.version); });
      autoUpdater.on('error', (err) => {
        // Only surface an error the user can act on if THEY started a download.
        // A background/passive check failure stays silent (no misleading button).
        if (userInitiatedDownload) {
          userInitiatedDownload = false;
          send('error', lastStatus.version, 0, String(err && err.message ? err.message : err));
        }
      });
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

module.exports = { initUpdater };
