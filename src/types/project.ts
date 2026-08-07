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
  replacement_duration_ms: number | null;
  render_duration_ms: number | null;
  duration_policy: SpeechDurationPolicy | null;
  stretch_ratio: number | null;
  replacement_warnings: string[];
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
  kind: 'transcribe' | 'export' | 'speech_replace';
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
    }
  | {
      op: 'attach_speech_replacement';
      clip_id: string;
      artifact_id: string;
      clip_fingerprint: string;
      text: string;
      duration_policy: SpeechDurationPolicy;
      replacement_duration_ms: number;
      render_duration_ms: number;
      stretch_ratio: number;
    };

export type SpeechDurationPolicy = 'natural' | 'fit_source' | 'pad_or_trim';

export type AttachSpeechReplacementV1 = Extract<
  EditOperationV1,
  { op: 'attach_speech_replacement' }
>;

export interface EditPreviewV1 {
  project_id: string;
  timeline: TimelineV1;
  diff: {
    base_revision: number;
    result_revision: number;
    duration_before_ms: number;
    duration_after_ms: number;
    duration_delta_ms: number;
    warnings: string[];
  };
}

export interface SpeechReplacementCandidateV1 {
  artifactId: string;
  previewUrl: string;
  durationMs: number;
  baseRevision: number;
  operation: AttachSpeechReplacementV1;
  warnings: string[];
  safeStretch: boolean;
}

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
