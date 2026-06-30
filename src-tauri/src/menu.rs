// Native application menu (primarily for macOS).
//
// On macOS a Tauri/WKWebView window only receives the standard Edit-menu
// keyboard shortcuts (Select All, Cut/Copy/Paste, …) when a native menu with
// the corresponding items exists. Without this menu, Cmd+A/Cmd+C/Cmd+V never
// reach the webview (and therefore CodeMirror).
//
// Design:
//   * Cut/Copy/Paste use *predefined* items so macOS routes the standard
//     selectors to the webview, where CodeMirror's DOM clipboard handlers act.
//   * Undo/Redo/Select All are *custom* items wired (via accelerators) to
//     emit a `splec-menu` event that the frontend maps onto CodeMirror's own
//     history/selection commands — predefined Undo would instead drive the
//     webview's contenteditable history and bypass CodeMirror.
//   * Every other custom item simply emits `splec-menu` with an id equal to a
//     frontend `runMenuAction` act string.

use tauri::menu::{
    AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Runtime};

/// Build a custom menu item whose id mirrors a frontend action string.
fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    label: &str,
    accel: Option<&str>,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let mut b = MenuItemBuilder::with_id(id, label);
    if let Some(a) = accel {
        b = b.accelerator(a);
    }
    b.build(app)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let version = pkg.version.to_string();

    let about_meta = AboutMetadata {
        name: Some("Splec Note".into()),
        version: Some(version),
        copyright: Some("© Splec Developers".into()),
        authors: Some(vec!["Splec Developers".into()]),
        comments: Some(
            "A lightweight, distinctive editor for notes and code.".into(),
        ),
        website: Some("https://splecdevelopers.com".into()),
        ..Default::default()
    };

    // ---- App menu (first submenu = the application menu on macOS) ----------
    let app_menu = SubmenuBuilder::new(app, "Splec Note")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About Splec Note"),
            Some(about_meta),
        )?)
        .separator()
        .item(&item(app, "checkUpdates", "Check for Updates…", None)?)
        .separator()
        .item(&item(app, "prefs", "Preferences…", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("Services"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Hide Splec Note"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Hide Others"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Show All"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Quit Splec Note"))?)
        .build()?;

    // ---- File --------------------------------------------------------------
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&item(app, "new", "New Note", Some("CmdOrCtrl+T"))?)
        .item(&item(app, "newWindow", "New Window", Some("CmdOrCtrl+Shift+N"))?)
        .separator()
        .item(&item(app, "open", "Open…", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item(app, "save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item(app, "saveAs", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&item(app, "close", "Close Tab", Some("CmdOrCtrl+W"))?)
        .build()?;

    // ---- Edit --------------------------------------------------------------
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&item(app, "undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("Cut"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Copy"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Paste"))?)
        .item(&item(app, "selectAll", "Select All", Some("CmdOrCtrl+A"))?)
        .separator()
        .item(&item(app, "toggleComment", "Toggle Comment", Some("CmdOrCtrl+/"))?)
        .item(&item(app, "duplicateLine", "Duplicate Line", None)?)
        .item(&item(app, "moveLineUp", "Move Line Up", Some("Alt+ArrowUp"))?)
        .item(&item(app, "moveLineDown", "Move Line Down", Some("Alt+ArrowDown"))?)
        .build()?;

    // ---- Find --------------------------------------------------------------
    let find_menu = SubmenuBuilder::new(app, "Find")
        .item(&item(app, "find", "Find…", Some("CmdOrCtrl+F"))?)
        .item(&item(app, "replace", "Replace…", Some("CmdOrCtrl+H"))?)
        .item(&item(app, "findInFiles", "Find in Files…", Some("CmdOrCtrl+Shift+F"))?)
        .separator()
        .item(&item(app, "gotoLine", "Go to Line…", Some("CmdOrCtrl+G"))?)
        .item(&item(app, "toggleBookmark", "Toggle Bookmark", Some("CmdOrCtrl+B"))?)
        .item(&item(app, "nextBookmark", "Next Bookmark", Some("F2"))?)
        .build()?;

    // ---- View --------------------------------------------------------------
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&item(app, "wrap", "Toggle Word Wrap", None)?)
        .item(&item(app, "whitespace", "Show Whitespace", None)?)
        .item(&item(app, "indentGuides", "Indent Guides", None)?)
        .separator()
        .item(&item(app, "toggleOutline", "Outline Panel", None)?)
        .item(&item(app, "toggleMinimap", "Minimap", None)?)
        .separator()
        .item(&item(app, "toggleSplit", "Split Editor", None)?)
        .item(&item(app, "splitOrientation", "Toggle Split Orientation", None)?)
        .item(&item(app, "cloneToOther", "Clone to Other Pane", None)?)
        .separator()
        .item(&item(app, "toggleZen", "Distraction-Free", Some("Ctrl+CmdOrCtrl+F"))?)
        .item(&item(app, "commandPalette", "Command Palette…", Some("CmdOrCtrl+Shift+P"))?)
        .build()?;

    // ---- Macros ------------------------------------------------------------
    let macros_menu = SubmenuBuilder::new(app, "Macros")
        .item(&item(app, "macroToggleRecord", "Start / Stop Recording", Some("CmdOrCtrl+Shift+R"))?)
        .item(&item(app, "macroPlayLast", "Play Last Macro", None)?)
        .item(&item(app, "macroManager", "Manage Macros…", None)?)
        .build()?;

    // ---- Plugins -----------------------------------------------------------
    let plugins_menu = SubmenuBuilder::new(app, "Plugins")
        .item(&item(app, "pluginManager", "Manage Plugins…", None)?)
        .build()?;

    // ---- Window ------------------------------------------------------------
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, Some("Minimize"))?)
        .item(&PredefinedMenuItem::maximize(app, Some("Zoom"))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some("Enter Full Screen"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?)
        .build()?;

    // ---- Help --------------------------------------------------------------
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&item(app, "helpWebsite", "Splec Developers Website", None)?)
        .build()?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &find_menu,
            &view_menu,
            &macros_menu,
            &plugins_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

/// Handle a native-menu selection by forwarding the item id to the frontend.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if id == "helpWebsite" {
        // Best-effort: let the frontend decide how to surface external links.
        let _ = app.emit("splec-menu", id);
        return;
    }
    let _ = app.emit("splec-menu", id);
}
