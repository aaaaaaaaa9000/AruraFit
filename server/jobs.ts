import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { config } from './config';
import { generateImage, RenderFailure, type InputImage } from './gemini';
import { addItem, getItem, imagePath, makeSourceThumb, sourcePath } from './history';
import { buildAnglePrompt, buildEditPrompt, buildPrompt, buildRecolorPrompt, type RenderSettings } from './prompt';
import { settle } from './usage';

// render:  a new product photo from the uploaded photo(s)
// angle:   back/side view; refs = [front task, back task?], primary = the angle photo when given
// recolor: the output of refs[0] with only the base color changed to settings.garmentColor
// edit:    an existing history image changed by a free-text instruction
export type TaskKind = 'render' | 'angle' | 'recolor' | 'edit';

export interface TaskInput {
  kind: TaskKind;
  primary?: string; // key into the job's images
  layer?: string;
  refs: number[]; // indexes of earlier tasks in the same job whose outputs this task uses
  settings: RenderSettings;
  sourceHistoryId?: string; // edit only
  instruction?: string; // edit only
}

interface Task extends TaskInput {
  index: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  historyId?: string;
  error?: string;
  output?: InputImage; // kept until the job finishes, for dependent tasks
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

const isFinished = (t: Task) => t.status === 'done' || t.status === 'failed';

export function createJob(images: Map<string, InputImage>, tasks: TaskInput[]): Job {
  const job: Job = {
    id: randomUUID(),
    createdAt: Date.now(),
    images,
    tasks: tasks.map((t, index) => ({ ...t, index, status: 'pending' })),
  };
  jobs.set(job.id, job);
  for (const task of job.tasks) queue.push({ job, task });
  pump();
  return job;
}

function finishJobIfDone(job: Job) {
  if (!job.tasks.every(isFinished)) return;
  job.images = null;
  for (const t of job.tasks) delete t.output;
  for (const key of [...sourceThumbs.keys()]) if (key.startsWith(job.id)) sourceThumbs.delete(key);
}

function pump() {
  // Tasks whose dependencies failed can never run: fail them right away. Dependencies always
  // come earlier in the queue, so one forward pass also fails whole chains.
  for (let i = 0; i < queue.length; ) {
    const { job, task } = queue[i];
    if (task.refs.some((r) => job.tasks[r].status === 'failed')) {
      queue.splice(i, 1);
      task.status = 'failed';
      task.error = 'dependency_failed';
      settle(false).catch((e) => console.error('Usage update failed:', e));
      finishJobIfDone(job);
    } else {
      i++;
    }
  }
  while (running < config.concurrency) {
    const idx = queue.findIndex(({ job, task }) => task.refs.every((r) => job.tasks[r].status === 'done'));
    if (idx === -1) return;
    const [next] = queue.splice(idx, 1);
    running++;
    runTask(next.job, next.task).finally(() => {
      running--;
      finishJobIfDone(next.job);
      pump();
    });
  }
}

function sourceThumb(job: Job, key: string, image: InputImage) {
  const cacheKey = `${job.id}:${key}`;
  if (!sourceThumbs.has(cacheKey)) sourceThumbs.set(cacheKey, makeSourceThumb(Buffer.from(image.data, 'base64')));
  return sourceThumbs.get(cacheKey)!;
}

// The original photo shown next to a result in the history: the task's own photo,
// otherwise the photo of the first task it depends on
function sourceKey(job: Job, task: Task): string | undefined {
  if (task.primary) return task.primary;
  for (const r of task.refs) {
    const key = sourceKey(job, job.tasks[r]);
    if (key) return key;
  }
  return undefined;
}

function buildInputs(job: Job, task: Task): { inputs: InputImage[]; prompt: string } {
  const images = job.images!;
  const refs = task.refs.map((r) => job.tasks[r].output!);
  if (task.kind === 'recolor') {
    return { inputs: [refs[0]], prompt: buildRecolorPrompt(task.settings.garmentColor) };
  }
  if (task.kind === 'angle') {
    const photo = task.primary ? images.get(task.primary) : undefined;
    return {
      inputs: [...(photo ? [photo] : []), ...refs],
      prompt: buildAnglePrompt(task.settings, Boolean(photo), refs.length > 1),
    };
  }
  const primary = images.get(task.primary!)!;
  const layer = task.layer ? images.get(task.layer) : undefined;
  return { inputs: layer ? [primary, layer] : [primary], prompt: buildPrompt(task.settings, Boolean(layer)) };
}

async function runEdit(job: Job, task: Task) {
  const parent = getItem(task.sourceHistoryId!);
  if (!parent) throw new RenderFailure('server_error');
  const [source, thumb] = await Promise.all([fs.readFile(imagePath(parent)), fs.readFile(sourcePath(parent.id))]);
  const image = await generateImage(task.settings, [{ mimeType: parent.mimeType, data: source.toString('base64') }], buildEditPrompt(task.instruction!));
  return { image, item: await addItem(job.id, task.settings, image, thumb, { parentId: parent.id, instruction: task.instruction }) };
}

async function runGeneration(job: Job, task: Task) {
  const { inputs, prompt } = buildInputs(job, task);
  const image = await generateImage(task.settings, inputs, prompt);
  const key = sourceKey(job, task);
  const thumb = key ? await sourceThumb(job, key, job.images!.get(key)!) : await makeSourceThumb(image.buffer);
  return { image, item: await addItem(job.id, task.settings, image, thumb) };
}

async function runTask(job: Job, task: Task) {
  task.status = 'running';
  let ok = false;
  try {
    const { image, item } = task.kind === 'edit' ? await runEdit(job, task) : await runGeneration(job, task);
    task.output = { mimeType: image.mimeType, data: image.buffer.toString('base64') };
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
    finished: job.tasks.every(isFinished),
    tasks: job.tasks.map((t) => ({ status: t.status, historyId: t.historyId, error: t.error })),
  };
}

// Forget finished jobs after an hour (their images live on in the history)
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.createdAt < cutoff && !job.images) jobs.delete(id);
}, 10 * 60 * 1000).unref();
