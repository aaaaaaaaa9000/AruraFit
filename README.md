# AruraFit - Ghost Mannequin Studio

تطبيق بيحوّل صورة قطعة ملابس لصورة "مانيكان خفي" (Ghost Mannequin) على جسم أنثوي بمقاسات وألوان وإضاءة تختارها، باستخدام Gemini.

- الواجهة: React + Vite + Tailwind
- السيرفر: Express (`server.ts`) - مفتاح Gemini موجود على السيرفر بس، ومش بيوصل للمتصفح.

## التشغيل على جهازك

المتطلبات: Node.js 22 أو أحدث.

```bash
npm install
cp .env.example .env.local   # وحط GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

أوامر تانية:

| الأمر | بيعمل إيه |
|---|---|
| `npm run lint` | فحص TypeScript |
| `npm run build` | بيبني الواجهة في `dist/client` والسيرفر في `dist/server.mjs` |
| `npm start` | بيشغّل نسخة الإنتاج بعد الـ build |

## متغيرات البيئة

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `GEMINI_API_KEY` | - | **مطلوب.** مفتاح Gemini API |
| `GEMINI_MODEL` | `gemini-3.1-flash-image` | موديل توليد الصور (الجودة العادية) |
| `GEMINI_PRO_MODEL` | `gemini-3-pro-image` | الموديل لما تختار "جودة عالية" (أبطأ وتكلفته حوالي الضعف) |
| `GEMINI_FALLBACK_MODEL` | فاضي | موديل احتياطي لو الأول فشل (اختياري) |
| `APP_USERNAME` | `user` | اسم المستخدم لو الباسورد مفعّل |
| `APP_PASSWORD` | فاضي | لو اتحط، الموقع كله بيطلب باسورد (Basic Auth). فاضي = الموقع عام |
| `RATE_LIMIT_PER_MINUTE` | `5` | أقصى عدد صور لكل IP في الدقيقة |
| `MAX_IMAGE_MB` | `8` | أقصى حجم لكل صورة مرفوعة (الصور بتتصغّر في المتصفح لـ 1536px قبل الرفع) |
| `PORT` | `3000` | البورت |
| `APP_DOMAIN` | `arurafit.aaaaaaaaa9000.cloud` | الدومين اللي Traefik بيستخدمه في `docker-compose.yml` |

## الرفع على السيرفر (Portainer + Traefik)

1. Portainer → **Stacks → Add stack → Repository**
   - Name: `ai-app-arurafit`
   - Repository URL: `https://github.com/aaaaaaaaa9000/AruraFit`
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
2. في **Environment variables** حط `GEMINI_API_KEY` (وأي متغير تاني من الجدول لو عايز تغيّر الافتراضي).
3. فعّل **GitOps updates** (مثلاً كل 24 ساعة) عشان أي تحديث على `main` ينزل لوحده.
4. **Deploy the stack**، وبعد البناء افتح `https://arurafit.aaaaaaaaa9000.cloud`.

الكونتينر فيه `HEALTHCHECK` على `/api/health`، فلو Portainer عرضه `healthy` يبقى السيرفر شغال. لو الصفحة بتقول إن المفتاح ناقص، راجع `GEMINI_API_KEY` في إعدادات الـ stack واعمل Redeploy.
