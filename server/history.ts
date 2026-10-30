import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { config } from './config';
import type { RenderSettings } from './prompt';

export interface HistoryItem {
  id: string;
  createdAt: number;
  jobId: string;
  settings: RenderSettings;
  model: string;
  ext: string;
  mimeType: string;
  bytes: number; // image + thumbnail + source thumbnail
  starred: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dirs = {
  images: path.join(config.dataDir, 'images'),
  thumbs: path.join(config.dataDir, 'thumbs'),
  sources: path.join(config.dataDir, 'sources'),
};
const indexFile = path.join(config.dataDir, 'history.json');

let items: HistoryItem[] = [];
// Serialize index writes so concurrent jobs never interleave them
let writeChain: Promise<void> = Promise.resolve();

export const ID_PATTERN = /^[0-9a-f-]{36}$/;

export async function initHistory() {
  await Promise.all(Object.values(dirs).map((d) => fs.mkdir(d, { recursive: true })));
  try {
    items = JSON.parse(await fs.readFile(indexFile, 'utf8'));
  } catch {
    items = [];
  }
  await cleanup();
  setInterval(() => cleanup().catch((e) => console.error('History cleanup failed:', e)), 60 * 60 * 1000).unref();
}

function persist() {
  const snapshot = JSON.stringify(items);
  writeChain = writeChain.then(async () => {
    const tmp = `${indexFile}.tmp`;
    await fs.writeFile(tmp, snapshot);
    await fs.rename(tmp, indexFile);
  });
  return writeChain;
}

export function imagePath(item: HistoryItem) {
  return path.join(dirs.images, `${item.id}.${item.ext}`);
}
export function thumbPath(id: string) {
  return path.join(dirs.thumbs, `${id}.webp`);
}
export function sourcePath(id: string) {
  return path.join(dirs.sources, `${id}.webp`);
}

export async function addItem(
  jobId: string,
  settings: RenderSettings,
  image: { buffer: Buffer; mimeType: string; model: string },
  sourceThumb: Buffer
): Promise<HistoryItem> {
  const id = randomUUID();
  const ext = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const thumb = await sharp(image.buffer).resize(360, 480, { fit: 'inside' }).webp({ quality: 78 }).toBuffer();
  const item: HistoryItem = {
    id,
    createdAt: Date.now(),
    jobId,
    settings,
    model: image.model,
    ext,
    mimeType: image.mimeType,
    bytes: image.buffer.length + thumb.length + sourceThumb.length,
    starred: false,
  };
  await Promise.all([
    fs.writeFile(imagePath(item), image.buffer),
    fs.writeFile(thumbPath(id), thumb),
    fs.writeFile(sourcePath(id), sourceThumb),
  ]);
  items.unshift(item);
  await persist();
  await cleanup();
  return item;
}

export function makeSourceThumb(buffer: Buffer) {
  return sharp(buffer).resize(240, 320, { fit: 'inside' }).webp({ quality: 70 }).toBuffer();
}

export function getItem(id: string) {
  return items.find((i) => i.id === id);
}

export function listItems(filter: { garmentType?: string; days?: number; starred?: boolean }) {
  const since = filter.days ? Date.now() - filter.days * DAY_MS : 0;
  return items.filter(
    (i) =>
      i.createdAt >= since &&
      (!filter.garmentType || i.settings.garmentType === filter.garmentType) &&
      (!filter.starred || i.starred)
  );
}

export async function setStarred(id: string, starred: boolean) {
  const item = getItem(id);
  if (!item) return null;
  item.starred = starred;
  await persist();
  return item;
}

async function removeFiles(item: HistoryItem) {
  await Promise.all([imagePath(item), thumbPath(item.id), sourcePath(item.id)].map((f) => fs.rm(f, { force: true })));
}

export async function deleteItems(ids: string[]) {
  const set = new Set(ids);
  const removed = items.filter((i) => set.has(i.id));
  items = items.filter((i) => !set.has(i.id));
  await Promise.all(removed.map(removeFiles));
  await persist();
  return removed.length;
}

export async function deleteAll() {
  return deleteItems(items.map((i) => i.id));
}

export function storageStats() {
  return {
    count: items.length,
    bytes: items.reduce((sum, i) => sum + i.bytes, 0),
    maxBytes: config.historyMaxMb * 1024 * 1024,
    maxDays: config.historyMaxDays,
  };
}

// Retention: drop non-starred items older than HISTORY_MAX_DAYS, then the oldest items
// (starred or not) until the total size fits under HISTORY_MAX_MB.
// The newest item is never removed by the size rule.
export async function cleanup() {
  const cutoff = Date.now() - config.historyMaxDays * DAY_MS;
  const expired = new Set(items.filter((i) => !i.starred && i.createdAt < cutoff).map((i) => i.id));

  const maxBytes = config.historyMaxMb * 1024 * 1024;
  let total = items.filter((i) => !expired.has(i.id)).reduce((sum, i) => sum + i.bytes, 0);
  const oldestFirst = [...items].slice(1).reverse().filter((i) => !expired.has(i.id));
  for (const item of oldestFirst) {
    if (total <= maxBytes) break;
    expired.add(item.id);
    total -= item.bytes;
  }
  if (expired.size) {
    console.log(`History cleanup: removing ${expired.size} item(s)`);
    await deleteItems([...expired]);
  }
}
