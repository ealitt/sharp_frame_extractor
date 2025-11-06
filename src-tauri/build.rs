fn main() {
    // FFmpeg binaries will be downloaded at runtime by ffmpeg-sidecar
    // No need to download at build time
    tauri_build::build()
}
