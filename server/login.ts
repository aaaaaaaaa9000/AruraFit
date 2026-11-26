// In-page login form + signed session cookie (replaces HTTP Basic Auth).
//
// Why: password managers such as Bitwarden can't fill the browser's Basic Auth
// popup. A normal HTML form with autocomplete="username" / "current-password"
// fields can be filled automatically, and the session cookie keeps the user
// signed in for SESSION_DAYS (default 180) on that device.
//
// The cookie is HttpOnly, SameSite=Lax and Secure (over HTTPS). Its value is
// "<expiry>.<HMAC>" signed with a key derived from the username and password
// (or SESSION_SECRET when set), so changing APP_PASSWORD signs everyone out.
import crypto from 'crypto';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';

export interface LoginOptions {
  /** Shown on the login page, e.g. "FactoryLens". */
  appName: string;
  username: string;
  password: string;
  /** Button / accent colour of the login page. */
  accent?: string;
  /** Paths that stay reachable without a session (health checks etc.). */
  publicPaths?: string[];
}

const COOKIE = 'app_session';
const DAY_MS = 24 * 60 * 60 * 1000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest();
const safeEqual = (a: string, b: string) => crypto.timingSafeEqual(sha256(a), sha256(b));

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Only same-site relative paths, so the login page can't be used as an open redirect. */
function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/login') || value.startsWith('/logout')) return '/';
  return value.slice(0, 2000);
}

export function installLogin(app: Express, opts: LoginOptions): void {
  if (!opts.password) return;

  const sessionDays = Math.max(1, Number(process.env.SESSION_DAYS) || 180);
  const sessionMs = sessionDays * DAY_MS;
  const key = sha256(`login-session:v1:${process.env.SESSION_SECRET || `${opts.username}:${opts.password}`}`);
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(opts.accent || '') ? opts.accent! : '#2563eb';
  const publicPaths = new Set(['/api/health', ...(opts.publicPaths || [])]);

  const sign = (exp: number) => crypto.createHmac('sha256', key).update(`v1.${exp}`).digest('base64url');

  /** Returns the expiry time of a valid session, or 0. */
  function sessionExpiry(req: Request): number {
    const raw = readCookie(req, COOKIE);
    if (!raw) return 0;
    const [expText, mac] = raw.split('.');
    const exp = Number(expText);
    if (!Number.isFinite(exp) || exp < Date.now() || !mac) return 0;
    const expected = Buffer.from(sign(exp));
    const given = Buffer.from(mac);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? exp : 0;
  }

  function setSession(req: Request, res: Response) {
    const exp = Date.now() + sessionMs;
    res.cookie(COOKIE, `${exp}.${sign(exp)}`, {
      httpOnly: true,
      secure: req.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: sessionMs,
    });
  }

  // Failed attempts per IP, to slow down password guessing.
  const fails = new Map<string, number[]>();
  const recentFails = (ip: string) => (fails.get(ip) || []).filter((t) => Date.now() - t < FAIL_WINDOW_MS);
  setInterval(() => {
    for (const [ip] of fails) {
      const recent = recentFails(ip);
      if (recent.length) fails.set(ip, recent);
      else fails.delete(ip);
    }
  }, FAIL_WINDOW_MS).unref();

  function loginPage(res: Response, status: number, next: string, error = '', username = '') {
    const name = escapeHtml(opts.appName);
    res
      .status(status)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'same-origin',
      })
      .send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>تسجيل الدخول · ${name}</title>
<style>
:root{--accent:${accent};--bg:#f4f4f5;--card:#fff;--text:#18181b;--muted:#71717a;--line:#d4d4d8;--err:#b91c1c;--errbg:#fef2f2}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--card:#18181b;--text:#fafafa;--muted:#a1a1aa;--line:#3f3f46;--err:#fca5a5;--errbg:#450a0a}}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
main{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px}
h1{font-size:1.35rem;margin:0 0 4px}
p.sub{margin:0 0 22px;color:var(--muted);font-size:.95rem}
label{display:block;font-size:.9rem;font-weight:600;margin:14px 0 6px}
input{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit}
input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
input[name=username]{direction:ltr;text-align:right}
button{width:100%;margin-top:22px;padding:13px;font:inherit;font-weight:700;font-size:1rem;color:#fff;background:var(--accent);border:0;border-radius:10px;cursor:pointer}
button:hover{filter:brightness(1.08)}
.err{margin:0 0 6px;padding:10px 12px;border-radius:10px;background:var(--errbg);color:var(--err);font-size:.92rem}
</style>
</head>
<body>
<main>
<h1>${name}</h1>
<p class="sub">سجّل الدخول للمتابعة</p>
${error ? `<p class="err" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/login" autocomplete="on">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label for="username">اسم المستخدم</label>
<input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${escapeHtml(username)}"${username ? '' : ' autofocus'}>
<label for="password">كلمة المرور</label>
<input id="password" name="password" type="password" autocomplete="current-password" required${username ? ' autofocus' : ''}>
<button type="submit">دخول</button>
</form>
</main>
</body>
</html>`);
  }

  app.get('/login', (req, res) => {
    const next = safeNext(req.query.next);
    if (sessionExpiry(req)) return res.redirect(303, next);
    loginPage(res, 200, next);
  });

  app.post('/login', express.urlencoded({ extended: false, limit: '10kb' }), (req, res) => {
    const ip = req.ip || 'unknown';
    const next = safeNext(req.body?.next);
    const username = typeof req.body?.username === 'string' ? req.body.username.slice(0, 200) : '';
    const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 500) : '';
    const recent = recentFails(ip);
    if (recent.length >= MAX_FAILS) {
      return loginPage(res, 429, next, 'محاولات دخول خاطئة كثيرة. حاول مرة أخرى بعد 15 دقيقة.', username);
    }
    // Evaluate both comparisons so timing doesn't reveal which one failed.
    const userOk = safeEqual(username, opts.username);
    const passOk = safeEqual(password, opts.password);
    if (!userOk || !passOk) {
      recent.push(Date.now());
      fails.set(ip, recent);
      return loginPage(res, 401, next, 'اسم المستخدم أو كلمة المرور غير صحيحة.', username);
    }
    fails.delete(ip);
    setSession(req, res);
    res.redirect(303, next);
  });

  const logout = (req: Request, res: Response) => {
    res.clearCookie(COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/' });
    res.redirect(303, '/login');
  };
  app.get('/logout', logout);
  app.post('/logout', logout);

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (publicPaths.has(req.path)) return next();
    const exp = sessionExpiry(req);
    if (exp) {
      // Sliding session: renew once less than half of its lifetime is left.
      if (exp - Date.now() < sessionMs / 2) setSession(req, res);
      return next();
    }
    res.set('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'انتهت الجلسة. حدّث الصفحة وسجّل الدخول من جديد.', code: 'unauthorized', login: '/login' });
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    return res.status(401).send('Login required');
  });
}
