import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openPath } from '@tauri-apps/plugin-dialog';
import { X, Check, AlertCircle, FileSearch, Info } from 'lucide-react';

interface AppSettings {
  ffmpeg_path: string | null;
  ffprobe_path: string | null;
  first_run: boolean;
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstRun?: boolean;
}

export function SettingsDialog({ isOpen, onClose, isFirstRun = false }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>({
    ffmpeg_path: null,
    ffprobe_path: null,
    first_run: true,
  });
  const [ffmpegPath, setFfmpegPath] = useState('');
  const [ffprobePath, setFfprobePath] = useState('');
  const [ffmpegValid, setFfmpegValid] = useState<boolean | null>(null);
  const [ffprobeValid, setFfprobeValid] = useState<boolean | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [showInstructions, setShowInstructions] = useState(isFirstRun);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadInstructions();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const loaded = await invoke<AppSettings>('get_settings');
      setSettings(loaded);
      setFfmpegPath(loaded.ffmpeg_path || '');
      setFfprobePath(loaded.ffprobe_path || '');

      // Validate existing paths
      if (loaded.ffmpeg_path) {
        const valid = await invoke<boolean>('validate_ffmpeg_path', {
          path: loaded.ffmpeg_path,
        });
        setFfmpegValid(valid);
      }
      if (loaded.ffprobe_path) {
        const valid = await invoke<boolean>('validate_ffmpeg_path', {
          path: loaded.ffprobe_path,
        });
        setFfprobeValid(valid);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadInstructions = async () => {
    try {
      const inst = await invoke<string[]>('get_ffmpeg_install_instructions');
      setInstructions(inst);
    } catch (error) {
      console.error('Failed to load instructions:', error);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const [detectedFfmpeg, detectedFfprobe] = await invoke<[string | null, string | null]>('detect_ffmpeg');

      if (detectedFfmpeg) {
        setFfmpegPath(detectedFfmpeg);
        setFfmpegValid(true);
      }
      if (detectedFfprobe) {
        setFfprobePath(detectedFfprobe);
        setFfprobeValid(true);
      }

      if (!detectedFfmpeg || !detectedFfprobe) {
        alert('Could not auto-detect FFmpeg. Please set the paths manually or install FFmpeg.');
        setShowInstructions(true);
      }
    } catch (error) {
      console.error('Detection failed:', error);
      alert('Failed to detect FFmpeg installation');
    } finally {
      setDetecting(false);
    }
  };

  const handleBrowseFFmpeg = async () => {
    const selected = await openPath({
      multiple: false,
      title: 'Select FFmpeg binary',
    });

    if (selected) {
      const path = selected as string;
      setFfmpegPath(path);

      // Validate the selected path
      const valid = await invoke<boolean>('validate_ffmpeg_path', { path });
      setFfmpegValid(valid);
    }
  };

  const handleBrowseFFprobe = async () => {
    const selected = await openPath({
      multiple: false,
      title: 'Select FFprobe binary',
    });

    if (selected) {
      const path = selected as string;
      setFfprobePath(path);

      // Validate the selected path
      const valid = await invoke<boolean>('validate_ffmpeg_path', { path });
      setFfprobeValid(valid);
    }
  };

  const handleSave = async () => {
    try {
      const newSettings: AppSettings = {
        ffmpeg_path: ffmpegPath || null,
        ffprobe_path: ffprobePath || null,
        first_run: false,
      };

      await invoke('save_settings', { settings: newSettings });
      alert('Settings saved successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings: ' + error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold">
            {isFirstRun ? 'Welcome! FFmpeg Configuration Required' : 'FFmpeg Settings'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            disabled={isFirstRun && (!ffmpegValid || !ffprobeValid)}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isFirstRun && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info size={24} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    FFmpeg is required
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    This application requires FFmpeg to analyze and extract frames from videos.
                    Click "Auto-Detect" to find an existing installation, or install FFmpeg and
                    configure the paths manually.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Auto-detect button */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="btn-primary flex items-center space-x-2"
            >
              <FileSearch size={18} />
              <span>{detecting ? 'Detecting...' : 'Auto-Detect FFmpeg'}</span>
            </button>
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="btn-secondary flex items-center space-x-2"
            >
              <Info size={18} />
              <span>Installation Instructions</span>
            </button>
          </div>

          {/* Installation instructions */}
          {showInstructions && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold mb-2">FFmpeg Installation Instructions:</h3>
              <pre className="text-sm font-mono whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {instructions.join('\n')}
              </pre>
            </div>
          )}

          {/* FFmpeg Path */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              FFmpeg Path
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={ffmpegPath}
                onChange={(e) => setFfmpegPath(e.target.value)}
                placeholder="/path/to/ffmpeg"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleBrowseFFmpeg}
                className="btn-secondary"
              >
                Browse
              </button>
              {ffmpegValid !== null && (
                ffmpegValid ? (
                  <Check size={20} className="text-green-500" />
                ) : (
                  <AlertCircle size={20} className="text-red-500" />
                )
              )}
            </div>
            {ffmpegValid === false && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Invalid FFmpeg path or FFmpeg is not executable
              </p>
            )}
          </div>

          {/* FFprobe Path */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              FFprobe Path
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={ffprobePath}
                onChange={(e) => setFfprobePath(e.target.value)}
                placeholder="/path/to/ffprobe"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleBrowseFFprobe}
                className="btn-secondary"
              >
                Browse
              </button>
              {ffprobeValid !== null && (
                ffprobeValid ? (
                  <Check size={20} className="text-green-500" />
                ) : (
                  <AlertCircle size={20} className="text-red-500" />
                )
              )}
            </div>
            {ffprobeValid === false && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Invalid FFprobe path or FFprobe is not executable
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          {!isFirstRun && (
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isFirstRun && (!ffmpegValid || !ffprobeValid)}
            className="btn-primary"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
