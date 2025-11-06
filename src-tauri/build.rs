fn main() {
    use std::path::PathBuf;
    use std::fs;

    // Download FFmpeg binaries and copy to binaries directory for bundling
    #[cfg(not(debug_assertions))]
    {
        println!("cargo:warning=Downloading FFmpeg binaries for production build...");

        // Ensure FFmpeg binaries are downloaded
        if let Err(e) = ffmpeg_sidecar::download::auto_download() {
            println!("cargo:warning=Failed to download FFmpeg: {}", e);
        } else {
            // Get the sidecar directory where ffmpeg-sidecar downloads binaries
            if let Ok(sidecar_dir) = ffmpeg_sidecar::paths::sidecar_dir() {
                println!("cargo:warning=FFmpeg downloaded to: {}", sidecar_dir.display());

                // Create binaries directory in src-tauri
                let target_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
                if let Err(e) = fs::create_dir_all(&target_dir) {
                    println!("cargo:warning=Failed to create binaries directory: {}", e);
                } else {
                    // Platform-specific binary names
                    #[cfg(target_os = "windows")]
                    let binaries = vec![("ffmpeg.exe", "ffmpeg.exe"), ("ffprobe.exe", "ffprobe.exe")];

                    #[cfg(target_os = "macos")]
                    let binaries = vec![("ffmpeg", "ffmpeg-x86_64-apple-darwin"), ("ffprobe", "ffprobe-x86_64-apple-darwin")];

                    #[cfg(target_os = "linux")]
                    let binaries = vec![("ffmpeg", "ffmpeg-x86_64-unknown-linux-gnu"), ("ffprobe", "ffprobe-x86_64-unknown-linux-gnu")];

                    // Copy binaries to target directory
                    for (src_name, target_name) in binaries {
                        let src_path = sidecar_dir.join(src_name);
                        let target_path = target_dir.join(target_name);

                        if src_path.exists() {
                            if let Err(e) = fs::copy(&src_path, &target_path) {
                                println!("cargo:warning=Failed to copy {}: {}", src_name, e);
                            } else {
                                println!("cargo:warning=Copied {} to {}", src_name, target_path.display());

                                // Make executable on Unix systems
                                #[cfg(unix)]
                                {
                                    use std::os::unix::fs::PermissionsExt;
                                    if let Ok(mut perms) = fs::metadata(&target_path).map(|m| m.permissions()) {
                                        perms.set_mode(0o755);
                                        let _ = fs::set_permissions(&target_path, perms);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    tauri_build::build()
}
