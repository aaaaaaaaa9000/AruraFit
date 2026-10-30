import React, { useCallback, useEffect, useState } from 'react';
import { TRANSLATIONS, Icons } from './constants';
import { GARMENT_TYPES, findGarmentType } from './garmentTypes';
import type { Language } from './types';
import {
  api,
  downloadUrl,
  historyFilename,
  historyUrls,
  type HistoryItem,
  type StorageStats,
  type UsageStats,
} from './services/geminiService';

interface Props {
  t: (typeof TRANSLATIONS)['en'];
  lang: Language;
  usage: UsageStats | null;
  onChanged: () => void;
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0)} MB`;

const HistoryView: React.FC<Props> = ({ t, lang, usage, onChanged }) => {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [type, setType] = useState('');
  const [days, setDays] = useState(0);
  const [starredOnly, setStarredOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<HistoryItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.history({ type, days, starred: starredOnly });
      setItems(data.items);
      setStorage(data.storage);
      setSelected((prev) => new Set([...prev].filter((id) => data.items.some((i) => i.id === id))));
    } catch {
      setItems([]);
    }
  }, [type, days, starredOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const typeLabel = (id: string) => {
    const g = findGarmentType(id);
    return lang === 'ar' ? g.ar : g.en;
  };
  const dateLabel = (ms: number) =>
    new Date(ms).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const afterDelete = async () => {
    setOpen(null);
    await load();
    onChanged();
  };

  const deleteSelected = async () => {
    if (!selected.size || !window.confirm(t.confirmDeleteSelected.replace('{n}', String(selected.size)))) return;
    setBusy(true);
    await api.deleteItems([...selected]).catch(() => {});
    setSelected(new Set());
    setBusy(false);
    afterDelete();
  };

  const deleteEverything = async () => {
    const total = storage?.count ?? 0;
    if (!total || !window.confirm(t.confirmDeleteAll.replace('{n}', String(total)))) return;
    setBusy(true);
    await api.deleteAll().catch(() => {});
    setSelected(new Set());
    setBusy(false);
    afterDelete();
  };

  const deleteOne = async (item: HistoryItem) => {
    if (!window.confirm(t.confirmDeleteOne)) return;
    await api.deleteItems([item.id]).catch(() => {});
    afterDelete();
  };

  const downloadSelected = async () => {
    const chosen = (items ?? []).filter((i) => selected.has(i.id));
    for (const item of chosen) {
      downloadUrl(historyUrls(item.id).image, historyFilename(item));
      // Small gap so the browser doesn't drop rapid consecutive downloads
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const toggleStar = async (item: HistoryItem) => {
    const updated = await api.star(item.id, !item.starred).catch(() => null);
    if (!updated) return;
    setItems((prev) => prev?.map((i) => (i.id === item.id ? updated : i)) ?? null);
    if (open?.id === item.id) setOpen(updated);
  };

  const usedPct = storage ? Math.min(100, (storage.bytes / storage.maxBytes) * 100) : 0;
  const filterClass =
    'bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-black';

  return (
    <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-4">
      <div className="glass rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-lg">{t.historyTitle}</h2>
          {usage && (
            <p className="text-xs text-gray-500">
              {t.usageToday} <span dir="ltr">{usage.today}/{usage.dailyLimit}</span>
              {' · '}
              {t.usageWeek} <span dir="ltr">{usage.week}/{usage.weeklyLimit}</span>
            </p>
          )}
        </div>
        {storage && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-gray-600">
              <span>{t.storageUsed}</span>
              <span dir="ltr">
                {formatMb(storage.bytes)} / {formatMb(storage.maxBytes)}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-black rounded-full" style={{ width: `${usedPct}%` }} />
            </div>
            <p className="text-[11px] text-gray-400">{t.storageNote.replace('{days}', String(storage.maxDays))}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label={t.garmentType} value={type} onChange={(e) => setType(e.target.value)} className={filterClass}>
          <option value="">{t.filterAllTypes}</option>
          {GARMENT_TYPES.map((g) => (
            <option key={g.id} value={g.id}>
              {lang === 'ar' ? g.ar : g.en}
            </option>
          ))}
        </select>
        <select aria-label={t.dateLabel} value={days} onChange={(e) => setDays(Number(e.target.value))} className={filterClass}>
          <option value={0}>{t.filterAllTime}</option>
          <option value={1}>{t.filterToday}</option>
          <option value={7}>{t.filter7}</option>
          <option value={30}>{t.filter30}</option>
        </select>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 px-2">
          <input type="checkbox" checked={starredOnly} onChange={(e) => setStarredOnly(e.target.checked)} className="accent-black" />
          {t.filterStarred}
        </label>
      </div>

      {items && items.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <button
            onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white font-semibold hover:border-black"
          >
            {selected.size === items.length ? t.selectNone : t.selectAll}
          </button>
          {selected.size > 0 && (
            <>
              <span className="text-gray-500 font-semibold">{t.selectedCount.replace('{n}', String(selected.size))}</span>
              <button onClick={downloadSelected} className="px-3 py-2 rounded-lg bg-black text-white font-semibold">
                {t.downloadSelected}
              </button>
              <button
                onClick={deleteSelected}
                disabled={busy}
                className="px-3 py-2 rounded-lg border border-red-200 text-red-600 bg-white font-semibold hover:bg-red-50"
              >
                {t.deleteSelected}
              </button>
            </>
          )}
          <button
            onClick={deleteEverything}
            disabled={busy}
            className="ms-auto px-3 py-2 rounded-lg text-red-600 font-semibold hover:underline"
          >
            {t.deleteAll}
          </button>
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-gray-400 py-12 text-center">{t.loading}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">{t.emptyHistory}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`relative bg-white rounded-xl overflow-hidden border-2 transition-all ${
                selected.has(item.id) ? 'border-black' : 'border-transparent shadow-sm'
              }`}
            >
              <button onClick={() => setOpen(item)} className="block w-full aspect-[3/4] bg-gray-50">
                <img src={historyUrls(item.id).thumb} alt={typeLabel(item.settings.garmentType)} loading="lazy" className="w-full h-full object-contain" />
              </button>
              <label className="absolute top-2 start-2 bg-white/90 rounded-md p-1 shadow cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={t.selectAll}
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="accent-black w-4 h-4 block"
                />
              </label>
              <button
                onClick={() => toggleStar(item)}
                aria-label={item.starred ? t.unstar : t.star}
                className={`absolute top-2 end-2 w-7 h-7 rounded-full bg-white/90 shadow text-sm leading-none ${
                  item.starred ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
                }`}
              >
                ★
              </button>
              <div className="px-2 py-1.5 text-[10px] text-gray-500 leading-tight">
                <div className="font-bold text-gray-700 truncate">{typeLabel(item.settings.garmentType)}</div>
                <div className="truncate">{dateLabel(item.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{typeLabel(open.settings.garmentType)}</h3>
              <button onClick={() => setOpen(null)} aria-label={t.close} className="text-2xl leading-none px-2">
                &times;
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <img src={historyUrls(open.id).image} alt={typeLabel(open.settings.garmentType)} className="flex-1 min-w-0 max-h-[65vh] object-contain bg-gray-50 rounded-xl" />
              <div className="sm:w-40 shrink-0 space-y-2 text-xs text-gray-600">
                <div>
                  <div className="font-bold text-gray-400 mb-1">{t.original}</div>
                  <img src={historyUrls(open.id).source} alt={t.original} className="w-24 sm:w-full rounded-lg bg-gray-50" />
                </div>
                <div><span className="font-bold">{t.styleLabel}:</span> {open.settings.displayStyle === 'flatlay' ? t.styleFlatlay : t.styleGhost}</div>
                <div><span className="font-bold">{t.qualityLabel}:</span> {open.settings.quality === 'high' ? t.qualityHigh : t.qualityStandard}</div>
                {open.settings.garmentColor && (
                  <div><span className="font-bold">{t.colorLabel}:</span> <span dir="ltr">{t.colors[open.settings.garmentColor] || open.settings.garmentColor}</span></div>
                )}
                <div><span className="font-bold">{t.dateLabel}:</span> {dateLabel(open.createdAt)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadUrl(historyUrls(open.id).image, historyFilename(open))}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-xs font-bold"
              >
                <Icons.Download />
                {t.download}
              </button>
              <button onClick={() => toggleStar(open)} className="px-4 py-2 rounded-full border border-gray-200 text-xs font-bold">
                <span className={open.starred ? 'text-amber-500' : 'text-gray-400'}>★</span> {open.starred ? t.unstar : t.star}
              </button>
              <button onClick={() => deleteOne(open)} className="px-4 py-2 rounded-full border border-red-200 text-red-600 text-xs font-bold">
                {t.deleteOne}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default HistoryView;
