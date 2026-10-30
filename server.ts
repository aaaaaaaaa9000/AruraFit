import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { findGarmentType, type Measure } from './garmentTypes';

// Load environment variables from .env.local and .env (no-op in Docker)
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image';
const proModel = process.env.GEMINI_PRO_MODEL || 'gemini-3-pro-image';
const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || '';
const appUsername = process.env.APP_USERNAME || 'user';
const appPassword = process.env.APP_PASSWORD || '';
const rateLimitPerMinute = Number(process.env.RATE_LIMIT_PER_MINUTE) || 5;
const maxImageMb = Number(process.env.MAX_IMAGE_MB) || 8;
const maxImageBytes = maxImageMb * 1024 * 1024;

const FIT_TYPES = ['slim', 'athletic', 'relaxed', 'plus'] as const;
const LIGHTING_MODES = ['sunlight', 'night', 'office', 'studio'] as const;
const LAYER_POSITIONS = ['under', 'over'] as const;
const QUALITIES = ['standard', 'high'] as const;
const NAMED_COLORS = ['Black', 'White', 'Red', 'Navy', 'Beige', 'Pink', 'Emerald'];
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const FIT_DESCRIPTIONS: Record<(typeof FIT_TYPES)[number], string> = {
  slim: 'Slim, petite female figure with narrow shoulders and a slender frame.',
  athletic: 'Balanced, toned hourglass female figure.',
  relaxed: 'Average female figure; the garment is worn relaxed with an easy, roomy drape.',
  plus: 'Full-figured plus-size female body with natural fuller curves at bust, waist and hips.',
};

const LIGHTING_DESCRIPTIONS: Record<(typeof LIGHTING_MODES)[number], string> = {
  studio: 'Soft, even studio lighting with neutral white balance and minimal shadows.',
  sunlight: 'Warm natural daylight, soft directional light as if from a large window, gentle shadows.',
  night: 'Warm evening ambience: lower-key warm light with deeper soft shadows and a subtle glow on the fabric.',
  office: 'Cool, crisp neutral daylight, bright and clean.',
};

const MEASURE_LINES: Record<Measure, (v: number) => string> = {
  shoulders: (v) => `Shoulder width: ${v}/100`,
  chest: (v) => `Bust volume: ${v}/100`,
  waist: (v) => `Waist definition: ${v}/100`,
  hips: (v) => `Hip curve: ${v}/100`,
};

// Error codes are translated on the client (see constants.tsx → ERRORS)
type ErrorCode =
  | 'invalid_input'
  | 'invalid_image'
  | 'image_too_large'
  | 'rate_limited'
  | 'not_configured'
  | 'no_image_returned'
  | 'server_error';

const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  invalid_image: 400,
  image_too_large: 413,
  rate_limited: 429,
  not_configured: 503,
  no_image_returned: 502,
  server_error: 500,
};

function sendError(res: Response, code: ErrorCode) {
  return res.status(ERROR_STATUS[code]).json({ error: code });
}

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

// Parse and validate a data URI image. Returns null when the input is not an accepted image.
function parseImage(value: unknown): { mimeType: string; data: string } | 'too_large' | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !IMAGE_MIME_TYPES.includes(match[1])) return null;
  if (Math.floor((match[2].length * 3) / 4) > maxImageBytes) return 'too_large';
  return { mimeType: match[1], data: match[2] };
}

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function isAllowedColor(value: unknown): value is string {
  return typeof value === 'string' && (NAMED_COLORS.includes(value) || /^#[0-9a-fA-F]{6}$/.test(value));
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

// Simple in-memory per-IP rate limiter (single container, so no shared store needed)
const requestLog = new Map<string, number[]>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const recent = (requestLog.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= rateLimitPerMinute) {
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
  if (!appPassword) return next();
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    const sep = decoded.indexOf(':');
    if (sep !== -1 && safeEqual(decoded.slice(0, sep), appUsername) && safeEqual(decoded.slice(sep + 1), appPassword)) {
      return next();
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="AruraFit", charset="UTF-8"');
  return res.status(401).send('Authentication required');
}

function buildPrompt(body: any, hasLayer: boolean): string {
  const profile = body?.profile ?? {};
  const garment = findGarmentType(body?.garmentType);
  const fitType = oneOf(FIT_TYPES, profile.fitType, 'athletic');
  const lighting = oneOf(LIGHTING_MODES, body?.studio?.lighting, 'studio');
  const layerPosition = oneOf(LAYER_POSITIONS, body?.layerPosition, 'under');
  const garmentColor = isAllowedColor(profile.garmentColor) ? profile.garmentColor : '';
  const measures = garment.measures.map((m) => `  - ${MEASURE_LINES[m](clampPercent(profile[m]))}`).join('\n');

  const sections = [
    `Create a professional e-commerce "ghost mannequin" product photo of the women's garment in the ${hasLayer ? 'first ' : ''}image.`,
    `GARMENT TYPE: ${garment.en}. ${garment.guidance}
  The photo is the source of truth: if anything in this description does not match the photo, follow the photo.`,
    `FIDELITY (highest priority):
  - This is a re-photograph of the provided product, not a new design. Reproduce exactly the same garment as in the photo. Keep every design detail identical: color, print/pattern scale and placement, lace and embroidery motifs, sequins, beads, stones, trims, ruffles, bows, buttons, zips, straps and hardware, seams and logos.
  - Sheer, lace and mesh fabrics keep the same transparency.
  - Do not add, remove, simplify or invent anything: no extra jewelry, chains, straps, layers or accessories.
  - Keep the original length and cut.`,
    `GHOST MANNEQUIN EFFECT:
  - The garment is shaped as if worn by an invisible woman: a hollow 3D form with natural volume and folds.
  - No skin, face, hands, legs or any body part. No mannequin, hanger, clips, hang tags or price stickers.
  - Where openings allow (neckline, armholes), show the inside back of the garment.`,
    `INVISIBLE BODY:
  - Figure: ${FIT_DESCRIPTIONS[fitType]}
${measures}${
      garment.loose
        ? '\n  - This garment is loose-fitting: the body only shows where the fabric naturally rests (shoulders, bust). Do not tighten it, cinch the waist or change its cut.'
        : ''
    }`,
    garmentColor
      ? `COLOR CHANGE: Change only the main fabric base color to ${garmentColor}. Keep the print, lace pattern, embroidery and embellishment designs unchanged, and keep the fabric texture, sheen, shadows and highlights.`
      : 'COLOR: Keep the exact original colors; do not desaturate or shift them.',
    `LIGHTING: ${LIGHTING_DESCRIPTIONS[lighting]}`,
    'BACKGROUND: Seamless pure white studio background with a soft natural contact shadow. Garment centered with comfortable margins, fully in frame.',
  ];

  if (hasLayer) {
    sections.push(`LAYERING:
  - The second image is another women's garment, worn ${layerPosition === 'under' ? 'UNDER' : 'OVER'} the first one on the same invisible body.
  - Apply the same fidelity rules to both garments; they must interact physically (overlaps, tucks, shadows).`);
  }
  return sections.join('\n\n');
}

async function generate(modelName: string, parts: any[]) {
  return getAi().models.generateContent({
    model: modelName,
    contents: { parts },
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } },
  });
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Health check (registered before auth so Docker/Traefik can reach it)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: Boolean(apiKey), model, proModel });
});

app.use(basicAuth);

// Two images as base64 (~4/3 overhead) plus the rest of the payload
app.use('/api', express.json({ limit: `${Math.ceil(maxImageMb * 2 * 1.4) + 1}mb` }));

// API endpoint for Ghost Mannequin rendering
app.post('/api/render', rateLimit, async (req, res) => {
  const primary = parseImage(req.body?.primaryImage);
  const layer = req.body?.layerImage ? parseImage(req.body.layerImage) : undefined;

  if (primary === 'too_large' || layer === 'too_large') return sendError(res, 'image_too_large');
  if (!primary || layer === null) return sendError(res, 'invalid_image');
  if (!apiKey) return sendError(res, 'not_configured');

  const parts: any[] = [{ inlineData: primary }];
  if (layer) parts.push({ inlineData: layer });
  parts.push({ text: buildPrompt(req.body, Boolean(layer)) });

  const selectedModel = oneOf(QUALITIES, req.body?.quality, 'standard') === 'high' ? proModel : model;

  try {
    let response;
    try {
      response = await generate(selectedModel, parts);
    } catch (err: any) {
      if (!fallbackModel) throw err;
      console.warn(`Model ${selectedModel} failed (${err?.message || err}), retrying with ${fallbackModel}`);
      response = await generate(fallbackModel, parts);
    }

    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return res.json({ imageUrl: `data:${mime};base64,${part.inlineData.data}` });
        }
      }
    }
    console.warn('Gemini returned no image. Finish reason:', response.candidates?.[0]?.finishReason);
    return sendError(res, 'no_image_returned');
  } catch (error: any) {
    console.error('Render error:', error?.message || error);
    return sendError(res, 'server_error');
  }
});

// Malformed / oversized JSON bodies
app.use('/api', (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.type === 'entity.too.large') return sendError(res, 'image_too_large');
  if (err?.type === 'entity.parse.failed') return sendError(res, 'invalid_input');
  next(err);
});

if (isProduction) {
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

app.listen(port, '0.0.0.0', () => {
  console.log(
    `AruraFit listening on :${port} | model=${model} pro=${proModel}${fallbackModel ? ` fallback=${fallbackModel}` : ''} | ` +
      `rateLimit=${rateLimitPerMinute}/min | auth=${appPassword ? 'on' : 'off'} | apiKey=${apiKey ? 'set' : 'MISSING'}`
  );
});
