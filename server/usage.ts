import fs from 'fs/promises';
import path from 'path';
import { config } from './config';

// Daily (calendar day in TZ_LIMITS) and rolling 7-day image counts, persisted so restarts keep them
const usageFile = path.join(config.dataDir, 'usage.json');
let days: Record<string, number> = {};
// Images promised to queued tasks but not finished yet, so parallel jobs can't overshoot the limits
let reserved = 0;

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

function lastDays(n: number) {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) keys.push(dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  return keys;
}

export async function initUsage() {
  try {
    days = JSON.parse(await fs.readFile(usageFile, 'utf8'));
  } catch {
    days = {};
  }
}

async function persist() {
  const keep = new Set(lastDays(14));
  for (const key of Object.keys(days)) if (!keep.has(key)) delete days[key];
  const tmp = `${usageFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(days));
  await fs.rename(tmp, usageFile);
}

export function usageStats() {
  const today = days[dayKey(new Date())] || 0;
  const week = lastDays(7).reduce((sum, key) => sum + (days[key] || 0), 0);
  return {
    today,
    week,
    reserved,
    dailyLimit: config.dailyImageLimit,
    weeklyLimit: config.weeklyImageLimit,
  };
}

// Reserve room for `count` images; returns which limit would be exceeded, or null when allowed
export function reserve(count: number): { limit: 'limit_daily' | 'limit_weekly'; remaining: number } | null {
  const s = usageStats();
  const dailyLeft = s.dailyLimit - s.today - reserved;
  const weeklyLeft = s.weeklyLimit - s.week - reserved;
  if (count > dailyLeft) return { limit: 'limit_daily', remaining: Math.max(0, dailyLeft) };
  if (count > weeklyLeft) return { limit: 'limit_weekly', remaining: Math.max(0, weeklyLeft) };
  reserved += count;
  return null;
}

// Called once per reserved image when its task finishes; only successful images count
export async function settle(succeeded: boolean) {
  reserved = Math.max(0, reserved - 1);
  if (!succeeded) return;
  const key = dayKey(new Date());
  days[key] = (days[key] || 0) + 1;
  await persist();
}
