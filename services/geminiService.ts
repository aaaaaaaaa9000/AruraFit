import { AspectRatio, BodyProfile, DisplayStyle, LayerPosition, Quality, StudioConfig } from "../types";
import type { RenderSettings } from "../server/prompt";

// Error carrying a code the UI can translate (codes come from server.ts → ErrorCode and server/gemini.ts)
export class RenderError extends Error {
  constructor(public code: string, public remaining?: number) {
    super(code);
  }
}

const MAX_DIMENSION = 1536;

// Downscale large photos in the browser before upload: smaller payload, faster and cheaper render.
export async function prepareImage(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new RenderError('unreadable_image');
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new RenderError('unreadable_image');
  // White background so transparent PNGs don't turn black in JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new RenderError('network');
  }
  // Error bodies may not be JSON (e.g. a proxy 502 page), so parse defensively
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RenderError(data?.error || (response.status === 429 ? 'rate_limited' : 'server_error'), data?.remaining);
  }
  return data as T;
}

const postJson = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export interface RenderRequest {
  profile: BodyProfile;
  studio: StudioConfig;
  garmentType: string;
  quality: Quality;
  displayStyle: DisplayStyle;
  aspectRatio: AspectRatio;
  background: string;
  layerPosition?: LayerPosition;
}

// render: from uploaded photos; angle: back/side view built on earlier results (refs);
// recolor: an earlier result (refs[0]) with only the base color changed
export interface JobTask extends RenderRequest {
  kind: 'render' | 'angle' | 'recolor';
  primary?: string;
  layer?: string;
  refs?: number[];
  angle?: 'front' | 'back' | 'side';
  approximate?: boolean;
}

// Re-render an existing history image from a text instruction
export interface EditTask {
  kind: 'edit';
  sourceHistoryId: string;
  instruction: string;
  quality?: Quality;
}

export interface JobStatus {
  id: string;
  total: number;
  done: number;
  failed: number;
  finished: boolean;
  tasks: { status: 'pending' | 'running' | 'done' | 'failed'; historyId?: string; error?: string }[];
}

export interface HistoryItem {
  id: string;
  createdAt: number;
  settings: RenderSettings;
  model: string;
  ext: string;
  bytes: number;
  starred: boolean;
  parentId?: string;
  instruction?: string;
}

export interface StorageStats {
  count: number;
  bytes: number;
  maxBytes: number;
  maxDays: number;
}

export interface UsageStats {
  today: number;
  week: number;
  dailyLimit: number;
  weeklyLimit: number;
  storage: StorageStats;
}

export const historyUrls = (id: string) => ({
  image: `/api/history/${id}/image`,
  thumb: `/api/history/${id}/thumb`,
  source: `/api/history/${id}/source`,
});

export const api = {
  // Queue renders: each task names its primary/layer image by key and carries its own settings
  createJob: (images: Record<string, string>, tasks: (JobTask | EditTask)[]) =>
    postJson<{ jobId: string; total: number }>('/api/jobs', { images, tasks }),
  getJob: (id: string) => request<JobStatus>(`/api/jobs/${id}`),
  historyItem: (id: string) => request<HistoryItem>(`/api/history/${id}`),
  // Poll a job until every task has finished, reporting progress along the way
  async waitForJob(id: string, onProgress?: (job: JobStatus) => void): Promise<JobStatus> {
    for (;;) {
      const job = await api.getJob(id);
      onProgress?.(job);
      if (job.finished) return job;
      await new Promise((r) => setTimeout(r, 1500));
    }
  },
  usage: () => request<UsageStats>('/api/usage'),
  history: (filter: { type?: string; days?: number; starred?: boolean }) => {
    const q = new URLSearchParams();
    if (filter.type) q.set('type', filter.type);
    if (filter.days) q.set('days', String(filter.days));
    if (filter.starred) q.set('starred', '1');
    return request<{ items: HistoryItem[]; storage: StorageStats }>(`/api/history?${q}`);
  },
  star: (id: string, starred: boolean) => postJson<HistoryItem>(`/api/history/${id}/star`, { starred }),
  deleteItems: (ids: string[]) => postJson<{ deleted: number }>('/api/history/delete', { ids }),
  deleteAll: () => postJson<{ deleted: number }>('/api/history/delete-all', { confirm: true }),
};

export function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function historyFilename(item: HistoryItem) {
  const s = item.settings;
  const style = s.displayStyle === 'flatlay' ? 'flatlay' : s.fitType;
  const ratio = (s.aspectRatio || '3:4').replace(':', 'x');
  const angle = s.angle && s.angle !== 'front' ? `-${s.angle}` : '';
  const color = (s.garmentColor || 'original').replace('#', '');
  const stamp = new Date(item.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `AruraFit-${s.garmentType}-${style}-${color}${angle}-${ratio}-${stamp}.${item.ext}`;
}
