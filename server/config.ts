import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local and .env (no-op in Docker)
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 3000),
  apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-image',
  proModel: process.env.GEMINI_PRO_MODEL || 'gemini-3-pro-image',
  fallbackModel: process.env.GEMINI_FALLBACK_MODEL || '',
  // Optional API endpoint override (proxies, local testing)
  baseUrl: process.env.GEMINI_BASE_URL || '',
  concurrency: num(process.env.GEMINI_CONCURRENCY, 2),
  appUsername: process.env.APP_USERNAME || 'user',
  appPassword: process.env.APP_PASSWORD || '',
  rateLimitPerMinute: num(process.env.RATE_LIMIT_PER_MINUTE, 10),
  maxImageMb: num(process.env.MAX_IMAGE_MB, 8),
  maxJobPayloadMb: num(process.env.MAX_JOB_PAYLOAD_MB, 60),
  maxTasksPerJob: num(process.env.MAX_TASKS_PER_JOB, 40),
  dailyImageLimit: num(process.env.DAILY_IMAGE_LIMIT, 300),
  weeklyImageLimit: num(process.env.WEEKLY_IMAGE_LIMIT, 600),
  historyMaxMb: num(process.env.HISTORY_MAX_MB, 2048),
  historyMaxDays: num(process.env.HISTORY_MAX_DAYS, 30),
  dataDir: path.resolve(process.env.DATA_DIR || 'data'),
  timeZone: process.env.TZ_LIMITS || 'Africa/Cairo',
};
