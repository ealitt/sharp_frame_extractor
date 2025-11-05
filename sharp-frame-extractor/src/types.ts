export interface VideoInfo {
  duration: number;
  fps: number;
  width: number;
  height: number;
  total_frames: number;
}

export interface FrameData {
  frame_number: number;
  timestamp: number;
  sharpness: number;
  path?: string;
}

export interface AnalysisResult {
  video_info: VideoInfo;
  frames: FrameData[];
  suggested_threshold: number;
  suggested_frame_count: number;
}

export interface AnalysisProgress {
  current_frame: number;
  total_frames: number;
  percentage: number;
}

export interface ExportOptions {
  format: string;
  threshold?: number;
  max_frames?: number;
  min_frame_distance: number;
}

export type ExportFormat = 'jpg' | 'png';
