import React, { useEffect, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { TRANSLATIONS, Icons } from './constants';
import { GARMENT_TYPES, DEFAULT_GARMENT_TYPE, findGarmentType } from './garmentTypes';
import type { AspectRatio, DisplayStyle, Language, LightingMode, Quality } from './types';
import { RenderError, api, downloadUrl, historyUrls, prepareImage, type JobTask, type UsageStats } from './services/geminiService';

interface Props {
  t: (typeof TRANSLATIONS)['en'];
  lang: Language;
  usage: UsageStats | null;
  onChanged: () => void;
}

type Status = 'idle' | 'pending' | 'running' | 'done' | 'failed';

interface BatchItem {
  id: string;
  name: string;
  image: string | null; // null after resuming a batch from an earlier visit (photos aren't kept)
  garmentType: string;
  status: Status;
  historyId?: string;
  error?: string;
}

const MAX_ITEMS = 30;
const STORAGE_KEY = 'arurafit.batch';

// Remember the running batch (without photos) so a reload can still show its progress and results
function saveBatch(jobId: string, items: BatchItem[], taskItemIds: string[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobId, taskItemIds, items: items.map(({ image: _image, ...rest }) => rest) })
    );
  } catch {
    // Storage may be unavailable (private mode); the batch still runs
  }
}

function loadBatch(): { jobId: string; taskItemIds: string[]; items: Omit<BatchItem, 'image'>[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearBatch() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const BatchView: React.FC<Props> = ({ t, lang, usage, onChanged }) => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [garmentType, setGarmentType] = useState(DEFAULT_GARMENT_TYPE);
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('ghost');
  const [quality, setQuality] = useState<Quality>('standard');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');
  const [background, setBackground] = useState('white');
  const [lighting, setLighting] = useState<LightingMode>('studio');
  const [running, setRunning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const typeLabel = (id: string) => {
    const g = findGarmentType(id);
    return lang === 'ar' ? g.ar : g.en;
  };
  const errorText = (code?: string) => (code ? t.errors[code] || t.errors.server_error : '');

  const track = async (jobId: string, taskItemIds: string[]) => {
    setRunning(true);
    try {
      await api.waitForJob(jobId, (job) => {
        setItems((prev) =>
          prev.map((item) => {
            const i = taskItemIds.indexOf(item.id);
            if (i === -1) return item;
            const task = job.tasks[i];
            return { ...item, status: task.status, historyId: task.historyId, error: task.error };
          })
        );
      });
    } catch (err) {
      // The server forgets finished jobs after an hour; drop the stale record
      if (err instanceof RenderError && err.code === 'not_found') {
        clearBatch();
        setItems([]);
        setResumed(false);
      } else {
        setNotice(errorText(err instanceof RenderError ? err.code : 'network'));
      }
    } finally {
      setRunning(false);
      onChanged();
    }
  };

  // Resume a batch started on an earlier visit
  useEffect(() => {
    const saved = loadBatch();
    if (!saved) return;
    setItems(saved.items.map((item) => ({ ...item, image: null })));
    setResumed(true);
    track(saved.jobId, saved.taskItemIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!files.length) return;
    setNotice(null);
    const room = MAX_ITEMS - items.length;
    if (files.length > room) setNotice(t.batchMax.replace('{max}', String(MAX_ITEMS)));
    setAdding(true);
    const added: BatchItem[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        added.push({
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ''),
          image: await prepareImage(file),
          garmentType,
          status: 'idle',
        });
      } catch {
        setNotice(t.errors.unreadable_image);
      }
    }
    setItems((prev) => [...prev, ...added]);
    setAdding(false);
  };

  const start = async (only?: (item: BatchItem) => boolean) => {
    const chosen = items.filter((item) => item.image && (only ? only(item) : item.status !== 'done'));
    if (!chosen.length) return;
    setNotice(null);
    setResumed(false);
    const images: Record<string, string> = {};
    const tasks: JobTask[] = chosen.map((item, i) => {
      images[`i${i}`] = item.image!;
      return {
        kind: 'render',
        primary: `i${i}`,
        garmentType: item.garmentType,
        displayStyle,
        quality,
        aspectRatio,
        background,
        studio: { lighting },
        profile: { chest: 50, shoulders: 50, waist: 50, hips: 50, fitType: 'athletic' },
      };
    });
    const taskItemIds = chosen.map((item) => item.id);
    try {
      const { jobId } = await api.createJob(images, tasks);
      const next = items.map((item) =>
        taskItemIds.includes(item.id) ? { ...item, status: 'pending' as Status, historyId: undefined, error: undefined } : item
      );
      setItems(next);
      saveBatch(jobId, next, taskItemIds);
      await track(jobId, taskItemIds);
    } catch (err) {
      const code = err instanceof RenderError ? err.code : 'server_error';
      const remaining = err instanceof RenderError ? err.remaining : undefined;
      setNotice(errorText(code).replace('{remaining}', String(remaining ?? 0)));
    }
  };

  const downloadZip = async () => {
    const done = items.filter((item) => item.historyId);
    if (!done.length) return;
    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      for (const [i, item] of done.entries()) {
        const res = await fetch(historyUrls(item.historyId!).image);
        const ext = (res.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
        const safeName = item.name.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'image';
        files[`${String(i + 1).padStart(2, '0')}-${safeName}-${item.garmentType}.${ext}`] = new Uint8Array(await res.arrayBuffer());
      }
      // Images are already compressed, so store them without recompressing
      const zip = zipSync(files, { level: 0 });
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      downloadUrl(url, `AruraFit-batch-${new Date().toISOString().slice(0, 10)}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setNotice(t.errors.network);
    } finally {
      setZipping(false);
    }
  };

  const reset = () => {
    clearBatch();
    setItems([]);
    setResumed(false);
    setNotice(null);
  };

  const count = (s: Status) => items.filter((item) => item.status === s).length;
  const failedRetryable = items.filter((item) => item.status === 'failed' && item.image).length;
  const toRun = items.filter((item) => item.image && item.status !== 'done').length;
  const finished = count('done') + count('failed');
  const inJob = items.filter((item) => item.status !== 'idle').length;

  const statusStyle: Record<Status, string> = {
    idle: 'bg-gray-100 text-gray-500',
    pending: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  const statusLabel: Record<Status, string> = {
    idle: '',
    pending: t.statusPending,
    running: t.statusRunning,
    done: t.statusDone,
    failed: t.statusFailed,
  };
  const btn = (active: boolean) =>
    `py-2 px-1 rounded-lg text-[11px] font-semibold border transition-all ${
      active ? 'bg-black text-white border-black shadow-md' : 'bg-white text-gray-600 border-gray-100 hover:border-gray-300'
    }`;
  const selectClass = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-black';

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-4">
      <div className="glass rounded-2xl p-5 shadow-sm space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-lg">{t.batchTitle}</h2>
          {usage && (
            <p className="text-xs text-gray-500">
              {t.usageToday} <span dir="ltr">{usage.today}/{usage.dailyLimit}</span>
              {' · '}
              {t.usageWeek} <span dir="ltr">{usage.week}/{usage.weeklyLimit}</span>
            </p>
          )}
        </div>
        <p className="text-xs text-gray-500">{t.batchHint.replace('{max}', String(MAX_ITEMS))}</p>
        {resumed && <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">{t.batchResumed}</p>}
        {notice && (
          <p role="alert" className="text-xs font-semibold text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <section className="lg:w-80 shrink-0 glass rounded-2xl p-5 shadow-sm space-y-4 h-fit">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t.sharedSettings}</h3>
          <div className="space-y-1">
            <label htmlFor="batch-type" className="text-[11px] font-bold text-gray-500">{t.garmentType}</label>
            <select
              id="batch-type"
              value={garmentType}
              onChange={(e) => {
                const value = e.target.value;
                setGarmentType(value);
                // Apply to photos that haven't run yet
                setItems((prev) => prev.map((item) => (item.status === 'idle' ? { ...item, garmentType: value } : item)));
              }}
              className={selectClass}
            >
              {GARMENT_TYPES.map((g) => (
                <option key={g.id} value={g.id}>
                  {lang === 'ar' ? g.ar : g.en}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-500">{t.displayStyle}</span>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDisplayStyle('ghost')} className={btn(displayStyle === 'ghost')}>{t.styleGhost}</button>
              <button onClick={() => setDisplayStyle('flatlay')} className={btn(displayStyle === 'flatlay')}>{t.styleFlatlay}</button>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-500">{t.quality}</span>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setQuality('standard')} className={btn(quality === 'standard')}>{t.qualityStandard}</button>
              <button onClick={() => setQuality('high')} className={btn(quality === 'high')}>{t.qualityHigh}</button>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="batch-ratio" className="text-[11px] font-bold text-gray-500">{t.aspectRatio}</label>
            <select id="batch-ratio" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className={selectClass}>
              <option value="3:4">{t.ratioProduct}</option>
              <option value="1:1">{t.ratioSquare}</option>
              <option value="4:5">{t.ratioPost}</option>
              <option value="9:16">{t.ratioStory}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="batch-bg" className="text-[11px] font-bold text-gray-500">{t.background}</label>
              <select id="batch-bg" value={background} onChange={(e) => setBackground(e.target.value)} className={selectClass}>
                <option value="white">{t.bgWhite}</option>
                <option value="gray">{t.bgGray}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="batch-light" className="text-[11px] font-bold text-gray-500">{t.lighting}</label>
              <select id="batch-light" value={lighting} onChange={(e) => setLighting(e.target.value as LightingMode)} className={selectClass}>
                <option value="studio">{t.studioMode}</option>
                <option value="sunlight">{t.sunlight}</option>
                <option value="night">{t.night}</option>
                <option value="office">{t.office}</option>
              </select>
            </div>
          </div>
        </section>

        <section className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={adding || running || items.length >= MAX_ITEMS}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 text-xs font-bold hover:border-black disabled:opacity-40"
            >
              <Icons.Upload />
              {adding ? t.preparing : t.addPhotos}
              <span dir="ltr" className="text-gray-400">{items.length}/{MAX_ITEMS}</span>
            </button>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={addFiles} />
            {items.length > 0 && !running && (
              <button onClick={reset} className="px-3 py-2 rounded-full text-xs font-bold text-red-600 hover:underline">
                {count('done') ? t.newBatch : t.clearList}
              </button>
            )}
            {inJob > 0 && (
              <span className="text-xs font-semibold text-gray-500 ms-auto" dir="auto">
                {t.batchProgress.replace('{done}', String(finished)).replace('{total}', String(inJob))}
              </span>
            )}
          </div>

          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex flex-col">
                  <div className="relative aspect-[3/4] bg-gray-50">
                    {item.historyId ? (
                      <a href={historyUrls(item.historyId).image} target="_blank" rel="noreferrer">
                        <img src={historyUrls(item.historyId).thumb} alt={item.name} className="w-full h-full object-contain" />
                      </a>
                    ) : item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-contain opacity-70" />
                    ) : null}
                    {item.status !== 'idle' && (
                      <span className={`absolute top-2 start-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle[item.status]}`}>
                        {statusLabel[item.status]}
                      </span>
                    )}
                    {item.status === 'idle' && !running && (
                      <button
                        onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                        aria-label={t.removeItem}
                        className="absolute top-1 end-1 w-6 h-6 rounded-full bg-white shadow text-red-500 text-sm leading-none"
                      >
                        &times;
                      </button>
                    )}
                    {item.historyId && (
                      <button
                        onClick={() => downloadUrl(historyUrls(item.historyId!).image, `${item.name}-${item.garmentType}.jpg`)}
                        aria-label={t.download}
                        className="absolute bottom-2 end-2 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shadow"
                      >
                        <Icons.Download />
                      </button>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="text-[10px] font-bold text-gray-700 truncate" title={item.name}>{item.name}</div>
                    {item.status === 'idle' ? (
                      <select
                        aria-label={t.garmentType}
                        value={item.garmentType}
                        onChange={(e) => {
                          const value = e.target.value;
                          setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, garmentType: value } : x)));
                        }}
                        className="w-full bg-white border border-gray-200 rounded-lg px-1.5 py-1 text-[10px] font-semibold"
                      >
                        {GARMENT_TYPES.map((g) => (
                          <option key={g.id} value={g.id}>
                            {lang === 'ar' ? g.ar : g.en}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-[10px] text-gray-500 truncate">{typeLabel(item.garmentType)}</div>
                    )}
                    {item.error && <div className="text-[10px] text-red-600 leading-tight">{errorText(item.error)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {toRun > 0 && !items.some((item) => item.status === 'failed') && (
              <button
                onClick={() => start()}
                disabled={running || adding}
                className="px-6 py-3 rounded-2xl bg-black text-white text-sm font-bold disabled:bg-gray-200 disabled:text-gray-400"
              >
                {running ? t.generating : t.startBatch.replace('{n}', String(toRun))}
              </button>
            )}
            {failedRetryable > 0 && !running && (
              <button
                onClick={() => start((item) => item.status === 'failed')}
                className="px-5 py-3 rounded-2xl border border-red-200 bg-white text-red-600 text-sm font-bold"
              >
                {t.retryFailed.replace('{n}', String(failedRetryable))}
              </button>
            )}
            {count('done') > 0 && (
              <button
                onClick={downloadZip}
                disabled={zipping}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-bold hover:border-black"
              >
                <Icons.Download />
                {zipping ? t.zipping : t.downloadZip}
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default BatchView;
