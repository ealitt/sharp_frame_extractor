# Release Guide for Sharp Frame Extractor

This guide covers creating releases with automated multi-platform builds using GitHub Actions.

## 📋 Table of Contents

1. [Pre-Release Checklist](#pre-release-checklist)
2. [Creating a Release](#creating-a-release)
3. [GitHub Actions CI/CD](#github-actions-cicd)
4. [Manual Release Process](#manual-release-process)
5. [Post-Release Tasks](#post-release-tasks)
6. [Troubleshooting](#troubleshooting)

---

## 🔍 Pre-Release Checklist

Before creating a new release:

### 1. **Update Version Numbers**

All version numbers should match. Update these files:

```bash
# package.json
{
  "version": "0.2.0"
}

# src-tauri/Cargo.toml
[package]
version = "0.2.0"

# src-tauri/tauri.conf.json
{
  "version": "0.2.0"
}
```

### 2. **Update CHANGELOG.md**

Document all changes following [Keep a Changelog](https://keepachangelog.com) format:

```markdown
## [0.2.0] - 2025-01-15

### Added
- New feature descriptions

### Changed
- Modified functionality

### Fixed
- Bug fixes

### Removed
- Deprecated features
```

### 3. **Test Thoroughly**

```bash
# Test development build
npm run tauri dev

# Test production build locally
npm run tauri build

# Test the built app
open src-tauri/target/release/bundle/macos/*.app
```

### 4. **Update Documentation**

- README.md
- Installation instructions
- Configuration guides
- Screenshots (if UI changed)

---

## 🚀 Creating a Release

### Option 1: Automated Release (Recommended)

This triggers CI/CD to build for all platforms automatically.

#### Step 1: Merge to Main Branch

```bash
# Switch to main branch
git checkout main

# Merge your feature branch
git merge claude/fix-tauri-build-errors-011CUr2izMjErk2oRiRmsmWK

# Push to main
git push origin main
```

#### Step 2: Create and Push a Version Tag

```bash
# Create an annotated tag
git tag -a v0.2.0 -m "Release v0.2.0: FFmpeg Settings System

Major Features:
- FFmpeg settings system with auto-detection
- First-run setup dialog
- Multi-platform FFmpeg path detection
- Settings persistence

Bug Fixes:
- Fixed FFmpeg not found in production builds
- Fixed video duration loading issues

See CHANGELOG.md for full details."

# Push the tag to GitHub
git push origin v0.2.0
```

#### Step 3: Monitor the Release Build

1. Go to your GitHub repository
2. Click **Actions** tab
3. Watch the "Release" workflow run
4. Builds will run for:
   - macOS (Apple Silicon)
   - macOS (Intel)
   - Linux (Ubuntu 22.04)
   - Windows

#### Step 4: Publish the Draft Release

Once all builds complete:

1. Go to **Releases** tab on GitHub
2. Find the draft release for `v0.2.0`
3. Review the auto-generated release notes
4. Edit the release body with detailed notes:

```markdown
## 🎉 What's New in v0.2.0

### ⭐ Major Features

**FFmpeg Settings System**
- First-run setup dialog guides you through FFmpeg configuration
- One-click auto-detection for macOS, Linux, and Windows
- Manual path configuration with file browser
- Real-time validation with visual feedback
- Settings persist across app restarts

**Enhanced User Experience**
- Clear installation instructions for each platform
- Settings accessible anytime via header button
- Improved error messages

### 🐛 Bug Fixes

- Fixed FFmpeg not found in production builds
- Fixed video duration not loading in production
- Fixed analysis failures due to missing FFprobe

### 📦 Downloads

Choose the installer for your platform:

**macOS**
- `Sharp.Frame.Extractor_0.2.0_aarch64.dmg` - Apple Silicon (M1, M2, M3)
- `Sharp.Frame.Extractor_0.2.0_x64.dmg` - Intel Macs

**Linux**
- `sharp-frame-extractor_0.2.0_amd64.deb` - Debian/Ubuntu
- `sharp-frame-extractor_0.2.0_amd64.AppImage` - Universal

**Windows**
- `Sharp.Frame.Extractor_0.2.0_x64-setup.exe` - Installer
- `Sharp.Frame.Extractor_0.2.0_x64.msi` - MSI Installer

### 📝 Installation

**macOS:**
1. Download the DMG for your Mac type
2. Open the DMG
3. Drag Sharp Frame Extractor to Applications
4. On first launch, click "Auto-Detect FFmpeg" or install via:
   ```bash
   brew install ffmpeg
   ```

**Linux:**
1. Download the AppImage or .deb
2. Make executable: `chmod +x sharp-frame-extractor_*.AppImage`
3. Run or install the .deb: `sudo dpkg -i sharp-frame-extractor_*.deb`
4. Install FFmpeg: `sudo apt install ffmpeg`

**Windows:**
1. Download and run the installer
2. Follow the setup wizard
3. On first launch, install FFmpeg via:
   ```powershell
   choco install ffmpeg
   ```

### 🔗 Links

- [Full Changelog](https://github.com/ealitt/sharp_frame_extractor/blob/main/CHANGELOG.md)
- [Documentation](https://github.com/ealitt/sharp_frame_extractor#readme)
- [Report Issues](https://github.com/ealitt/sharp_frame_extractor/issues)

### ⚠️ Known Issues

- None at this time

### 💝 Acknowledgments

Thanks to all contributors and users who provided feedback!
```

5. Click **Publish release**

---

### Option 2: Manual Release (Local Build Only)

If you want to create a release manually without CI/CD:

```bash
# Clean build
rm -rf node_modules dist src-tauri/target
npm install

# Build for your current platform
npm run tauri build

# Find the built files:
# macOS: src-tauri/target/release/bundle/macos/
# Linux: src-tauri/target/release/bundle/deb/ and appimage/
# Windows: src-tauri/target/release/bundle/msi/ and nsis/
```

Then manually upload to GitHub Releases.

---

## 🤖 GitHub Actions CI/CD

### Workflow File Location

`.github/workflows/release.yml`

### How It Works

1. **Trigger**: Runs when you push a tag starting with `v` (e.g., `v0.2.0`)
2. **Matrix Build**: Builds for all platforms in parallel:
   - macOS (Apple Silicon): `aarch64-apple-darwin`
   - macOS (Intel): `x86_64-apple-darwin`
   - Linux (Ubuntu 22.04): `x86_64-unknown-linux-gnu`
   - Windows: `x86_64-pc-windows-msvc`
3. **Artifacts**: Uploads installers to a draft GitHub Release
4. **Draft Release**: Creates a draft you can edit before publishing

### Platform-Specific Details

**macOS Builds**
- Produces `.dmg` and `.app` bundles
- Code-signed (requires Apple Developer certificate in secrets)
- Notarized for Gatekeeper (optional, requires secrets)

**Linux Builds**
- Produces `.deb` (Debian/Ubuntu)
- Produces `.AppImage` (Universal)
- Requires `webkit2gtk`, `libappindicator3`, `librsvg2`

**Windows Builds**
- Produces `.msi` (Windows Installer)
- Produces `.exe` (NSIS Installer)
- Code-signed (requires certificate in secrets)

### Required Secrets

For a complete automated release, add these secrets in GitHub:

**Repository Settings → Secrets and variables → Actions**

| Secret Name | Description | Required For |
|------------|-------------|--------------|
| `GITHUB_TOKEN` | Auto-generated by GitHub | All (automatic) |
| `APPLE_CERTIFICATE` | Base64-encoded .p12 | macOS signing |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password | macOS signing |
| `APPLE_SIGNING_IDENTITY` | Developer ID | macOS signing |
| `APPLE_ID` | Apple ID email | macOS notarization |
| `APPLE_PASSWORD` | App-specific password | macOS notarization |
| `APPLE_TEAM_ID` | Team ID | macOS notarization |
| `WINDOWS_CERTIFICATE` | Base64-encoded .pfx | Windows signing |
| `WINDOWS_CERTIFICATE_PASSWORD` | Certificate password | Windows signing |

*Note: Code signing is optional. Unsigned builds will work but show security warnings.*

---

## 🏷️ Version Tagging Commands

### Creating Tags

```bash
# Lightweight tag (not recommended for releases)
git tag v0.2.0

# Annotated tag (recommended - includes metadata)
git tag -a v0.2.0 -m "Release v0.2.0"

# Tag with detailed message
git tag -a v0.2.0 -m "$(cat <<EOF
Release v0.2.0: FFmpeg Settings System

New Features:
- FFmpeg configuration UI
- Auto-detection system
- Settings persistence

Bug Fixes:
- Fixed production build issues
- Fixed FFmpeg path resolution

See CHANGELOG.md for details.
EOF
)"
```

### Pushing Tags

```bash
# Push a specific tag
git push origin v0.2.0

# Push all tags
git push origin --tags
```

### Managing Tags

```bash
# List all tags
git tag -l

# Show tag details
git show v0.2.0

# Delete a local tag
git tag -d v0.2.0

# Delete a remote tag
git push origin --delete v0.2.0

# Move a tag (delete old, create new)
git tag -d v0.2.0
git tag -a v0.2.0 -m "New message"
git push origin :refs/tags/v0.2.0  # Delete remote
git push origin v0.2.0              # Push new
```

---

## 📝 Post-Release Tasks

After publishing a release:

### 1. **Update README Badges** (Optional)

```markdown
![Version](https://img.shields.io/github/v/release/ealitt/sharp_frame_extractor)
![Downloads](https://img.shields.io/github/downloads/ealitt/sharp_frame_extractor/total)
```

### 2. **Announce the Release**

- Create a discussion post on GitHub
- Tweet/post on social media
- Update project homepage
- Notify users via mailing list

### 3. **Monitor for Issues**

- Watch GitHub Issues for bug reports
- Check discussions for user feedback
- Monitor download statistics

### 4. **Start Next Version**

```bash
# Create new development branch
git checkout -b develop

# Update version to next planned version
# e.g., 0.3.0-dev in package.json
```

---

## 🔧 Troubleshooting

### Build Fails on CI

**Check the logs:**
1. Go to Actions tab
2. Click the failed workflow
3. Expand the failed step
4. Look for error messages

**Common issues:**

**macOS build fails:**
```
Error: xcrun: error: unable to find utility "altool"
```
→ Remove notarization from workflow or add Apple secrets

**Linux build fails:**
```
Error: webkit2gtk-4.1 not found
```
→ Check dependencies in workflow file

**Windows build fails:**
```
Error: NSIS not found
```
→ Ensure windows-latest runner is being used

### Tag Already Exists

```bash
# Delete the tag
git tag -d v0.2.0
git push origin --delete v0.2.0

# Recreate with new commit
git tag -a v0.2.0 -m "Message"
git push origin v0.2.0
```

### Release Assets Missing

If the release doesn't have all platform binaries:

1. Check if all CI jobs succeeded
2. Re-run failed jobs in Actions tab
3. Or manually upload missing binaries

### Version Mismatch

Ensure all three version files match:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Run this to check:
```bash
grep version package.json
grep version src-tauri/Cargo.toml
grep version src-tauri/tauri.conf.json
```

---

## 📚 Additional Resources

- [Tauri Release Docs](https://tauri.app/v2/guides/distribution/)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

---

## 🎯 Quick Reference

### Complete Release Workflow

```bash
# 1. Update version numbers
# Edit: package.json, Cargo.toml, tauri.conf.json

# 2. Update CHANGELOG.md
# Document all changes

# 3. Commit version bump
git add -A
git commit -m "Bump version to 0.2.0"

# 4. Merge to main
git checkout main
git merge your-feature-branch
git push origin main

# 5. Create and push tag
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0

# 6. Wait for CI/CD to complete
# Check GitHub Actions tab

# 7. Publish draft release
# Edit release notes and publish on GitHub
```

### Version Numbering Guide

**MAJOR.MINOR.PATCH** (e.g., 0.2.0)

- **MAJOR** (0): Breaking changes, major rewrites
- **MINOR** (2): New features, backwards compatible
- **PATCH** (0): Bug fixes only

**Examples:**
- `0.1.0 → 0.2.0`: New features (Settings system)
- `0.2.0 → 0.2.1`: Bug fix (Fixed export crash)
- `0.2.0 → 1.0.0`: Stable release, breaking changes

---

**Last Updated:** 2025-01-XX
**Maintained By:** Sharp Frame Extractor Team
