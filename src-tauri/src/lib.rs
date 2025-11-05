mod commands;
mod sharpness;
mod video;
mod gpu_sharpness;

use commands::{
    analyze_video, calculate_threshold_for_count, export_frames, get_video_metadata,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            analyze_video,
            export_frames,
            get_video_metadata,
            calculate_threshold_for_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
