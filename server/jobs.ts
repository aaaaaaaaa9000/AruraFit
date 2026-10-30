import { randomUUID } from 'crypto';
import { config } from './config';
import { generateImage, RenderFailure, type InputImage } from './gemini';
import { addItem, makeSourceThumb } from './history';
import type { RenderSettings } from './prompt';
import { settle } from './usage';

export interface TaskInput {
  primary: string; // key into the job's images
  layer?: string;
  settings: RenderSettings;
}

interface Task extends TaskInput {
  status: 'pending' | 'running' | 'done' | 'failed';
  historyId?: string;
  error?: string;
}

interface Job {
  id: string;
  createdAt: number;
  images: Map<string, InputImage> | null; // dropped once every task has finished
  tasks: Task[];
}

const jobs = new Map<string, Job>();
const queue: { job: Job; task: Task }[] = [];
let running = 0;
const sourceThumbs = new Map<string, Promise<Buffer>>();

export function createJob(images: Map<string, InputImage>, tasks: TaskInput[]): Job {
  const job: Job = {
    id: randomUUID(),
    createdAt: Date.now(),
    images,
    tasks: tasks.map((t) => ({ ...t, status: 'pending' })),
  };
  jobs.set(job.id, job);
  for (const task of job.tasks) queue.push({ job, task });
  pump();
  return job;
}

function pump() {
  while (running < config.concurrency && queue.length) {
    const next = queue.shift()!;
    running++;
    runTask(next.job, next.task).finally(() => {
      running--;
      if (next.job.tasks.every((t) => t.status === 'done' || t.status === 'failed')) {
        next.job.images = null;
        for (const key of [...sourceThumbs.keys()]) if (key.startsWith(next.job.id)) sourceThumbs.delete(key);
      }
      pump();
    });
  }
}

function sourceThumb(job: Job, key: string, image: InputImage) {
  const cacheKey = `${job.id}:${key}`;
  if (!sourceThumbs.has(cacheKey)) sourceThumbs.set(cacheKey, makeSourceThumb(Buffer.from(image.data, 'base64')));
  return sourceThumbs.get(cacheKey)!;
}

async function runTask(job: Job, task: Task) {
  task.status = 'running';
  let ok = false;
  try {
    const primary = job.images!.get(task.primary)!;
    const layer = task.layer ? job.images!.get(task.layer) : undefined;
    const image = await generateImage(task.settings, primary, layer);
    const item = await addItem(job.id, task.settings, image, await sourceThumb(job, task.primary, primary));
    task.historyId = item.id;
    task.status = 'done';
    ok = true;
  } catch (err) {
    if (!(err instanceof RenderFailure)) console.error('Task failed:', err);
    task.error = err instanceof RenderFailure ? err.code : 'server_error';
    task.status = 'failed';
  } finally {
    await settle(ok).catch((e) => console.error('Usage update failed:', e));
  }
}

export function getJob(id: string) {
  const job = jobs.get(id);
  if (!job) return null;
  const count = (s: Task['status']) => job.tasks.filter((t) => t.status === s).length;
  return {
    id: job.id,
    total: job.tasks.length,
    done: count('done'),
    failed: count('failed'),
    finished: job.tasks.every((t) => t.status === 'done' || t.status === 'failed'),
    tasks: job.tasks.map((t) => ({ status: t.status, historyId: t.historyId, error: t.error })),
  };
}

// Forget finished jobs after an hour (their images live on in the history)
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.createdAt < cutoff && !job.images) jobs.delete(id);
}, 10 * 60 * 1000).unref();
