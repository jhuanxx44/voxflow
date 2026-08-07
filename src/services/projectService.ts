import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  AttachSpeechReplacementV1,
  EditOperationV1,
  EditPreviewV1,
  JobV1,
  ProjectEditorSnapshot,
  ProjectV1,
  SearchMatchV1,
  SpeechDurationPolicy,
  SpeechReplacementCandidateV1,
  TimelineV1,
  TranscriptV1,
} from '@/types/project';

export class ProjectApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ProjectApiError';
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiErrorEnvelope
    | null;
  if (!response.ok || !payload || 'error' in payload) {
    const error = payload && 'error' in payload ? payload.error : null;
    throw new ProjectApiError(
      error?.message || `VoxFlow API request failed (HTTP ${response.status})`,
      error?.code || 'HTTP_ERROR',
      response.status,
      error?.details || {}
    );
  }
  return payload.data;
}

export async function createProject(options: {
  file?: File;
  materialName?: string;
  name?: string;
}): Promise<ProjectV1> {
  const form = new FormData();
  if (options.file) form.append('media', options.file);
  if (options.materialName) form.append('material_name', options.materialName);
  if (options.name) form.append('name', options.name);
  return api<ProjectV1>('/api/v1/projects', { method: 'POST', body: form });
}

export function getProject(projectId: string): Promise<ProjectV1> {
  return api<ProjectV1>(`/api/v1/projects/${projectId}`);
}

export function startTranscription(
  projectId: string,
  options: { model: 'basic' | 'advanced'; hotwords: string }
): Promise<JobV1> {
  return api<JobV1>(`/api/v1/projects/${projectId}/transcriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
}

export function getJob(jobId: string): Promise<JobV1> {
  return api<JobV1>(`/api/v1/jobs/${jobId}`);
}

export async function waitForJob(
  jobId: string,
  options: { timeoutMs?: number; intervalMs?: number; onProgress?: (job: JobV1) => void } = {}
): Promise<JobV1> {
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 350;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    options.onProgress?.(job);
    if (job.status === 'succeeded') return job;
    if (['failed', 'cancelled', 'interrupted'].includes(job.status)) {
      throw new ProjectApiError(
        job.error?.message || `任务结束：${job.status}`,
        job.error?.code || 'JOB_FAILED',
        409,
        job.error?.details || {}
      );
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  throw new ProjectApiError('等待任务超时', 'JOB_TIMEOUT', 408);
}

async function getAllPages<T extends { items: unknown[]; total: number }>(
  url: string
): Promise<T> {
  const first = await api<T>(`${url}${url.includes('?') ? '&' : '?'}offset=0&limit=200`);
  const items = [...first.items];
  while (items.length < first.total) {
    const page = await api<T>(
      `${url}${url.includes('?') ? '&' : '?'}offset=${items.length}&limit=200`
    );
    items.push(...page.items);
  }
  return { ...first, items };
}

export function getTranscript(projectId: string): Promise<TranscriptV1> {
  return getAllPages<TranscriptV1>(`/api/v1/projects/${projectId}/transcript`);
}

export function getTimeline(projectId: string): Promise<TimelineV1> {
  return getAllPages<TimelineV1>(`/api/v1/projects/${projectId}/timeline`);
}

export async function loadProjectEditor(projectId: string): Promise<ProjectEditorSnapshot> {
  const [project, transcript, timeline] = await Promise.all([
    getProject(projectId),
    getTranscript(projectId),
    getTimeline(projectId),
  ]);
  return { project, transcript, timeline };
}

export function applyEdit(
  projectId: string,
  expectedRevision: number,
  operations: EditOperationV1[],
  reason: string
): Promise<{ revision: number }> {
  return api<{ revision: number }>(`/api/v1/projects/${projectId}/edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_version: 1,
      project_id: projectId,
      expected_revision: expectedRevision,
      client_request_id: `web-${crypto.randomUUID()}`,
      reason,
      operations,
    }),
  });
}

export function previewEdit(
  projectId: string,
  expectedRevision: number,
  operations: EditOperationV1[],
  reason: string
): Promise<EditPreviewV1> {
  return api<EditPreviewV1>(`/api/v1/projects/${projectId}/edits/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_version: 1,
      project_id: projectId,
      expected_revision: expectedRevision,
      client_request_id: `web-preview-${crypto.randomUUID()}`,
      reason,
      operations,
    }),
  });
}

export async function startSpeechReplacement(
  projectId: string,
  expectedRevision: number,
  clipId: string,
  text: string,
  options: {
    durationPolicy?: SpeechDurationPolicy;
    onProgress?: (job: JobV1) => void;
  } = {}
): Promise<SpeechReplacementCandidateV1> {
  const submitted = await api<JobV1>(
    `/api/v1/projects/${projectId}/speech-replacements`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_revision: expectedRevision,
        clip_id: clipId,
        text,
        duration_policy: options.durationPolicy,
      }),
    }
  );
  const job = await waitForJob(submitted.id, { onProgress: options.onProgress });
  const result = job.result;
  const artifactId = result?.artifact_id;
  const rawOperation = result?.recommended_operation;
  if (
    typeof artifactId !== 'string' ||
    !rawOperation ||
    typeof rawOperation !== 'object' ||
    (rawOperation as { op?: unknown }).op !== 'attach_speech_replacement'
  ) {
    throw new ProjectApiError(
      '语音候选任务缺少 artifact 或推荐操作',
      'INVALID_JOB_RESULT',
      500
    );
  }
  const operation = rawOperation as AttachSpeechReplacementV1;
  const warnings = Array.isArray(result?.warnings)
    ? result.warnings.map((warning) => String(warning))
    : [];
  const durationMs = Number(result?.duration_ms);
  return {
    artifactId,
    previewUrl:
      typeof result?.download_url === 'string'
        ? result.download_url
        : `/api/v1/artifacts/${artifactId}/content`,
    durationMs: Number.isFinite(durationMs) ? durationMs : operation.replacement_duration_ms,
    baseRevision: expectedRevision,
    operation,
    warnings,
    safeStretch: result?.safe_stretch !== false,
  };
}

export function restoreRevision(
  projectId: string,
  expectedRevision: number,
  toRevision: number
): Promise<{ revision: number }> {
  return api<{ revision: number }>(`/api/v1/projects/${projectId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expected_revision: expectedRevision,
      to_revision: toRevision,
      client_request_id: `web-restore-${crypto.randomUUID()}`,
    }),
  });
}

export async function exportProject(
  projectId: string,
  format: 'mp4' | 'mp3' | 'wav' | 'srt' | 'vtt',
  onProgress?: (job: JobV1) => void
): Promise<{ downloadUrl: string; artifactId: string }> {
  const submitted = await api<JobV1>(`/api/v1/projects/${projectId}/exports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  });
  const job = await waitForJob(submitted.id, { onProgress });
  const artifactId = job.result?.artifact_id;
  if (typeof artifactId !== 'string') {
    throw new ProjectApiError('导出任务缺少 artifact ID', 'INVALID_JOB_RESULT', 500);
  }
  return {
    artifactId,
    downloadUrl:
      typeof job.result?.download_url === 'string'
        ? job.result.download_url
        : `/api/v1/artifacts/${artifactId}/content`,
  };
}

export async function searchTranscript(
  projectId: string,
  query: string
): Promise<SearchMatchV1[]> {
  const result = await api<{ matches: SearchMatchV1[] }>(
    `/api/v1/projects/${projectId}/transcript/search?q=${encodeURIComponent(query)}`
  );
  return result.matches;
}
