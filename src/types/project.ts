export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
}

export interface ProjectV1 {
  id: string;
  name: string;
  revision: number;
  source_url: string;
  source: {
    artifact_id: string;
    original_name: string;
    sha256: string;
    reference_source: boolean;
    media: {
      duration_ms: number;
      has_video: boolean;
      has_audio: boolean;
      video_codec: string | null;
      audio_codec: string | null;
    };
  };
  transcript: {
    status: 'none' | 'queued' | 'running' | 'ready' | 'failed';
    segment_count: number;
    job_id: string | null;
  };
}

export interface TranscriptTokenV1 {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  type: 'word' | 'number' | 'char';
}

export interface TranscriptSegmentV1 {
  id: string;
  ordinal: number;
  start_ms: number;
  end_ms: number;
  text: string;
  speaker_id: string | null;
  tokens: TranscriptTokenV1[];
  edit_precision: 'token' | 'segment';
}

export interface TimelineClipV1 {
  id: string;
  kind: 'source' | 'replacement';
  source_segment_id: string;
  source_in_ms: number;
  source_out_ms: number;
  transcript_text: string;
  speaker_id: string | null;
  token_ids: string[];
  replacement_artifact_id: string | null;
}

export interface TimelineV1 {
  project_id: string;
  revision: number;
  duration_ms: number;
  items: TimelineClipV1[];
  speaker_labels: Record<string, string>;
  speaker_merges: Record<string, string>;
  total: number;
}

export interface TranscriptV1 {
  project_id: string;
  model: string;
  language: string | null;
  items: TranscriptSegmentV1[];
  total: number;
}

export interface JobV1 {
  id: string;
  kind: 'transcribe' | 'export';
  project_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
  progress: number;
  phase: string;
  result: {
    artifact_id?: string;
    download_url?: string;
    [key: string]: unknown;
  } | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
}

export type EditOperationV1 =
  | { op: 'delete_clips'; clip_ids: string[] }
  | {
      op: 'delete_ranges';
      clip_id: string;
      start_token_id: string;
      end_token_id: string;
    }
  | {
      op: 'move_clip';
      clip_id: string;
      anchor_clip_id: string;
      position: 'before' | 'after';
    }
  | { op: 'correct_transcript'; clip_id: string; text: string }
  | { op: 'rename_speaker'; speaker_id: string; name: string }
  | {
      op: 'merge_speakers';
      from_speaker_id: string;
      to_speaker_id: string;
    };

export interface ProjectEditorSnapshot {
  project: ProjectV1;
  transcript: TranscriptV1;
  timeline: TimelineV1;
}

export interface SearchMatchV1 {
  segment: TranscriptSegmentV1;
  clip_ids: string[];
  before: TranscriptSegmentV1[];
  after: TranscriptSegmentV1[];
}
