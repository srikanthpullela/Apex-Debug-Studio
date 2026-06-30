// Splec Note — Tauri backend entry point.
// Wires core plugins (store, fs, dialog, window-state) and the session/backup engine.

mod search;
mod session;

#[cfg(target_os = "macos")]
mod menu;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init());

    // window-state and autostart are desktop-only.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_autostart::MacosLauncher;
        builder = builder
            .plugin(tauri_plugin_window_state::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                None,
            ));
    }

    // Native menu bar (macOS): required for standard Edit shortcuts (Cmd+A/C/V)
    // to reach the webview, and provides the full app menu.
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .menu(|app| menu::build(app))
            .on_menu_event(|app, event| menu::on_event(app, event.id().0.as_str()));
    }

    builder
        .invoke_handler(tauri::generate_handler![
            session::session_paths,
            session::read_text_file,
            session::write_text_file,
            session::stat_file,
            session::autosave_backup,
            session::read_backup,
            session::delete_backup,
            session::write_session,
            session::load_session,
            session::cleanup_backups,
            search::find_in_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Splec Note");
}
