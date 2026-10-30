import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import { config } from './server/config';
import { parseSettings } from './server/prompt';
import type { InputImage } from './server/gemini';
import { createJob, getJob, type TaskInput } from './server/jobs';
import {
  ID_PATTERN,
  deleteAll,
  deleteItems,
  getItem,
  imagePath,
  initHistory,
  listItems,
  setStarred,
  sourcePath,
  storageStats,
  thumbPath,
} from './server/history';
import { initUsage, reserve, usageStats } from './server/usage';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const maxImageBytes = config.maxImageMb * 1024 * 1024;

// Error codes are translated on the client (see constants.tsx → errors)
type ErrorCode =
  | 'invalid_input'
  | 'invalid_image'
  | 'image_too_large'
  | 'job_too_large'
  | 'rate_limited'
  | 'limit_daily'
  | 'limit_weekly'
  | 'not_configured'
  | 'not_found';

const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  invalid_image: 400,
  image_too_large: 413,
  job_too_large: 413,
  rate_limited: 429,
  limit_daily: 429,
  limit_weekly: 429,
  not_configured: 503,
  not_found: 404,
};

function sendError(res: Response, code: ErrorCode, extra: Record<string, unknown> = {}) {
  return res.status(ERROR_STATUS[code]).json({ error: code, ...extra });
}

// Parse and validate a data URI image. Returns null when the input is not an accepted image.
function parseImage(value: unknown): InputImage | 'too_large' | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !IMAGE_MIME_TYPES.includes(match[1])) return null;
  if (Math.floor((match[2].length * 3) / 4) > maxImageBytes) return 'too_large';
  return { mimeType: match[1], data: match[2] };
}

// Simple in-memory per-IP rate limiter (single container, so no shared store needed)
const requestLog = new Map<string, number[]>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const recent = (requestLog.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= config.rateLimitPerMinute) {
    res.setHeader('Retry-After', '60');
    return sendError(res, 'rate_limited');
  }
  recent.push(now);
  requestLog.set(key, recent);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of requestLog) {
    if (times.every((t) => now - t >= 60_000)) requestLog.delete(key);
  }
}, 60_000).unref();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Optional Basic Auth, enabled only when APP_PASSWORD is set
function basicAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.appPassword) return next();
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    const sep = decoded.indexOf(':');
    if (sep !== -1 && safeEqual(decoded.slice(0, sep), config.appUsername) && safeEqual(decoded.slice(sep + 1), config.appPassword)) {
      return next();
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="AruraFit", charset="UTF-8"');
  return res.status(401).send('Authentication required');
}

await initHistory();
await initUsage();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Health check (registered before auth so Docker/Traefik can reach it)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: Boolean(config.apiKey), model: config.model, proModel: config.proModel });
});

app.use(basicAuth);
app.use('/api', express.json({ limit: `${config.maxJobPayloadMb}mb` }));

app.get('/api/usage', (_req, res) => {
  res.json({ ...usageStats(), storage: storageStats() });
});

// Queue one or more renders. Body: { images: { [key]: dataUri }, tasks: [{ primary, layer?, ...settings }] }
app.post('/api/jobs', rateLimit, (req, res) => {
  const rawImages = req.body?.images;
  const rawTasks = req.body?.tasks;
  if (!rawImages || typeof rawImages !== 'object' || !Array.isArray(rawTasks) || rawTasks.length === 0) {
    return sendError(res, 'invalid_input');
  }
  if (rawTasks.length > config.maxTasksPerJob) return sendError(res, 'job_too_large', { max: config.maxTasksPerJob });
  if (!config.apiKey) return sendError(res, 'not_configured');

  const images = new Map<string, InputImage>();
  for (const [key, value] of Object.entries(rawImages)) {
    const parsed = parseImage(value);
    if (parsed === 'too_large') return sendError(res, 'image_too_large');
    if (!parsed) return sendError(res, 'invalid_image');
    images.set(key, parsed);
  }

  const tasks: TaskInput[] = [];
  for (const raw of rawTasks) {
    if (!images.has(raw?.primary) || (raw?.layer && !images.has(raw.layer))) return sendError(res, 'invalid_input');
    tasks.push({ primary: raw.primary, layer: raw.layer || undefined, settings: parseSettings(raw) });
  }

  const blocked = reserve(tasks.length);
  if (blocked) return sendError(res, blocked.limit, { remaining: blocked.remaining });

  const job = createJob(images, tasks);
  res.status(202).json({ jobId: job.id, total: tasks.length });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return sendError(res, 'not_found');
  res.json(job);
});

app.get('/api/history', (req, res) => {
  const days = Number(req.query.days) || undefined;
  const items = listItems({
    garmentType: typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined,
    days,
    starred: req.query.starred === '1',
  });
  res.json({ items, storage: storageStats() });
});

app.get('/api/history/:id', (req, res) => {
  const item = getItem(String(req.params.id));
  if (!item) return sendError(res, 'not_found');
  res.json(item);
});

const sendHistoryFile = (pick: (id: string) => string | null) => (req: Request, res: Response) => {
  const id = String(req.params.id);
  const file = ID_PATTERN.test(id) && getItem(id) ? pick(id) : null;
  if (!file) return sendError(res, 'not_found');
  // Private: images sit behind the app password, so shared caches must not keep them
  res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
  res.sendFile(file, { cacheControl: false }, (err) => {
    if (err && !res.headersSent) sendError(res, 'not_found');
  });
};
app.get('/api/history/:id/image', sendHistoryFile((id) => imagePath(getItem(id)!)));
app.get('/api/history/:id/thumb', sendHistoryFile(thumbPath));
app.get('/api/history/:id/source', sendHistoryFile(sourcePath));

app.post('/api/history/:id/star', async (req, res) => {
  const item = await setStarred(String(req.params.id), Boolean(req.body?.starred));
  if (!item) return sendError(res, 'not_found');
  res.json(item);
});

app.post('/api/history/delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown) => typeof id === 'string') : [];
  if (!ids.length) return sendError(res, 'invalid_input');
  res.json({ deleted: await deleteItems(ids), storage: storageStats() });
});

app.post('/api/history/delete-all', async (req, res) => {
  if (req.body?.confirm !== true) return sendError(res, 'invalid_input');
  res.json({ deleted: await deleteAll(), storage: storageStats() });
});

app.use('/api', (_req, res) => sendError(res, 'not_found'));

// Malformed / oversized JSON bodies
app.use('/api', (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.type === 'entity.too.large') return sendError(res, 'job_too_large', { max: config.maxTasksPerJob });
  if (err?.type === 'entity.parse.failed') return sendError(res, 'invalid_input');
  next(err);
});

if (config.isProduction) {
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  app.use(
    '/assets',
    express.static(path.join(clientDir, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false })
  );
  app.use(express.static(clientDir, { index: false }));
  app.use((_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDir, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(config.port, '0.0.0.0', () => {
  const s = usageStats();
  console.log(
    `AruraFit listening on :${config.port} | model=${config.model} pro=${config.proModel}${
      config.fallbackModel ? ` fallback=${config.fallbackModel}` : ''
    } | limits=${s.dailyLimit}/day ${s.weeklyLimit}/week | history=${config.historyMaxMb}MB/${config.historyMaxDays}d at ${config.dataDir} | ` +
      `auth=${config.appPassword ? 'on' : 'off'} | apiKey=${config.apiKey ? 'set' : 'MISSING'}`
  );
});
