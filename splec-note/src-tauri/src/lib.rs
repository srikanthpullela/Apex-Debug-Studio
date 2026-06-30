// Splec Note — Tauri backend entry point.
// Wires core plugins (store, fs, dialog, window-state) and the session/backup engine.

mod session;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init());

    // window-state is desktop-only.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Splec Note");
}
