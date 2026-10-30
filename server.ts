import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

// Load environment variables from .env.local and .env (no-op in Docker)
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image';
const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || '';
const appUsername = process.env.APP_USERNAME || 'user';
const appPassword = process.env.APP_PASSWORD || '';
const rateLimitPerMinute = Number(process.env.RATE_LIMIT_PER_MINUTE) || 5;
const maxImageMb = Number(process.env.MAX_IMAGE_MB) || 8;
const maxImageBytes = maxImageMb * 1024 * 1024;

const FIT_TYPES = ['slim', 'athletic', 'relaxed', 'plus'] as const;
const LIGHTING_MODES = ['sunlight', 'night', 'office', 'studio'] as const;
const LAYER_POSITIONS = ['under', 'over'] as const;
const NAMED_COLORS = ['Black', 'White', 'Red', 'Navy', 'Beige', 'Pink', 'Emerald'];
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const FIT_DESCRIPTIONS: Record<(typeof FIT_TYPES)[number], string> = {
  slim: 'FEMININE SLIM FIT: A slender female silhouette. The garment should tightly hug a petite female frame, emphasizing a high waist and narrow shoulders. Very delicate fabric tension.',
  athletic:
    'FEMININE ATHLETIC/HOURGLASS FIT: A toned female physique with a clear V-taper to the waist and slightly broader, defined feminine shoulders. Strong bust definition and a cinched waistline.',
  relaxed:
    "FEMININE OVERSIZED/BOXY FIT: Modern oversized women's aesthetic. The garment should drape loosely over a female frame, appearing stylishly large with soft, voluminous folds.",
  plus: 'FEMININE PLUS SIZE / FULL FIGURE: A voluptuous female silhouette with realistic fuller curves. Emphasize a broader hip-to-waist ratio, a more prominent bust area, and a softer, rounded torso. Realistic stretching appropriate for plus-size garments.',
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
  const fitType = oneOf(FIT_TYPES, profile.fitType, 'athletic');
  const lighting = oneOf(LIGHTING_MODES, body?.studio?.lighting, 'sunlight');
  const layerPosition = oneOf(LAYER_POSITIONS, body?.layerPosition, 'under');
  const garmentColor = isAllowedColor(profile.garmentColor) ? profile.garmentColor : '';

  const colorInstruction = garmentColor
    ? `RECOLOR MANDATE: Change the primary garment's color strictly to ${garmentColor}. Maintain all fabric textures, shadows, and highlights but shift the base hue and saturation to match ${garmentColor} exactly.`
    : '';

  let prompt = `
      ULTRA-STRICT GHOST MANNEQUIN RENDER - WOMEN'S FASHION ONLY.

      CORE MANDATE:
      - 100% INVISIBLE FEMALE MODEL: Render the garment as if worn by an invisible woman.
      - SILHOUETTE: Must be EXCLUSIVELY FEMALE (waist-to-hip ratio, bust protrusion, feminine shoulder slope).
      - NO HUMAN TRACES: Delete all skin, hands, feet, neck, or face. Total phantom effect.
      - HOLLOW 3D SHELL: Show internal collar labels and inner back fabric through the openings.

      ${colorInstruction}

      SILHOUETTE SPECIFICATIONS (EXAGGERATED FEMININE FORM):
      - PROFILE: ${FIT_DESCRIPTIONS[fitType]}
      - Shoulder Breadth: ${clampPercent(profile.shoulders)}% female scale.
      - Bust/Chest Volume: ${clampPercent(profile.chest)}% scale (emphasize 3D female bust curve).
      - Waist Taper: ${clampPercent(profile.waist)}% scale (deep feminine waist curve).

      LIGHTING & ENVIRONMENT:
      - Lighting: ${lighting} professional fashion photography lighting.
      - Background: Clean minimalist white studio.
      - Cleanup: Remove all hangers, original background artifacts, and any visible mannequin parts.
    `;

  if (hasLayer) {
    prompt += `
      COMPOSITE LAYERING:
      - Integrate second women's garment ${layerPosition.toUpperCase()} the primary one.
      - Both must adhere to the same female silhouette and interact physically.
      `;
  }
  return prompt;
}

async function generate(modelName: string, parts: any[]) {
  return getAi().models.generateContent({
    model: modelName,
    contents: { parts },
    config: { imageConfig: { aspectRatio: '3:4' } },
  });
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Health check (registered before auth so Docker/Traefik can reach it)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: Boolean(apiKey), model });
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

  try {
    let response;
    try {
      response = await generate(model, parts);
    } catch (err: any) {
      if (!fallbackModel) throw err;
      console.warn(`Model ${model} failed (${err?.message || err}), retrying with ${fallbackModel}`);
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
    `AruraFit listening on :${port} | model=${model}${fallbackModel ? ` fallback=${fallbackModel}` : ''} | ` +
      `rateLimit=${rateLimitPerMinute}/min | auth=${appPassword ? 'on' : 'off'} | apiKey=${apiKey ? 'set' : 'MISSING'}`
  );
});
