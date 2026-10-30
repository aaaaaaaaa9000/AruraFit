import React, { useState, useRef, useEffect } from 'react';
import { BodyProfile, StudioConfig, Language, LayerPosition, Quality, DisplayStyle, AspectRatio } from './types';
import { TRANSLATIONS, Icons } from './constants';
import { GARMENT_TYPES, DEFAULT_GARMENT_TYPE, findGarmentType, type Measure } from './garmentTypes';
import { RenderError, prepareImage, api, downloadUrl, historyFilename, historyUrls, type HistoryItem, type JobTask, type UsageStats } from './services/geminiService';
import HistoryView from './HistoryView';
import BatchView from './BatchView';

const COMMON_COLORS = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#E11D48' },
  { name: 'Navy', hex: '#1E3A8A' },
  { name: 'Beige', hex: '#F5F5DC' },
  { name: 'Pink', hex: '#DB2777' },
  { name: 'Emerald', hex: '#059669' },
];

const MAX_COLORS = 6;
type Angle = 'front' | 'back' | 'side';

const DEFAULT_PROFILE: BodyProfile = {
  chest: 50,
  shoulders: 50,
  waist: 50,
  hips: 50,
  fitType: 'athletic',
  garmentColor: undefined
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('ar');
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [layerImage, setLayerImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [sideImage, setSideImage] = useState<string | null>(null);
  const [wantBack, setWantBack] = useState(false);
  const [wantSide, setWantSide] = useState(false);
  // Selected garment colors in order; '' is the photo's original color
  const [colors, setColors] = useState<string[]>(['']);
  const backInputRef = useRef<HTMLInputElement>(null);
  const sideInputRef = useRef<HTMLInputElement>(null);
  const [layerPosition, setLayerPosition] = useState<LayerPosition>('under');
  const [results, setResults] = useState<HistoryItem[]>([]);
  const [activeResult, setActiveResult] = useState(0);
  const resultItem = results[activeResult] ?? null;
  const setResultItem = (item: HistoryItem | null) => {
    setResults(item ? [item] : []);
    setActiveResult(0);
  };
  const resultImage = resultItem ? historyUrls(resultItem.id).image : null;
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');
  const [background, setBackground] = useState<string>('white');
  const [variations, setVariations] = useState(1);
  const [progressCount, setProgressCount] = useState({ done: 0, total: 0 });
  const [partialNote, setPartialNote] = useState<string | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'studio' | 'batch' | 'history'>('studio');
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [progress, setProgress] = useState<'queued' | 'running' | null>(null);
  
  const [profile, setProfile] = useState<BodyProfile>(DEFAULT_PROFILE);
  const [garmentType, setGarmentType] = useState<string>(DEFAULT_GARMENT_TYPE);
  const [quality, setQuality] = useState<Quality>('standard');
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('ghost');
  const isFlatlay = displayStyle === 'flatlay';

  const [studio, setStudio] = useState<StudioConfig>({
    lighting: 'studio'
  });

  const t = TRANSLATIONS[lang];
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const refreshUsage = () => api.usage().then(setUsage).catch(() => {});
  useEffect(() => {
    refreshUsage();
  }, []);

  const customColors = colors.filter((c) => c && !COMMON_COLORS.find((cc) => cc.name === c));
  const colorLabel = (color: string) => (color ? t.colors[color] || color : t.colorOriginal);
  const colorSwatch = (color: string) => COMMON_COLORS.find((c) => c.name === color)?.hex || color || 'transparent';
  const toggleColor = (color: string) =>
    setColors((prev) => {
      if (prev.includes(color)) {
        const next = prev.filter((c) => c !== color);
        return next.length ? next : [''];
      }
      return prev.length >= MAX_COLORS ? prev : [...prev, color];
    });
  const angleLabel = (item: HistoryItem) =>
    item.settings.angle === 'back'
      ? t.angleBack
      : item.settings.angle === 'side'
        ? item.settings.approximate ? t.angleSideApprox : t.angleSide
        : t.angleFront;
  const includeBack = wantBack && Boolean(backImage);
  const includeSide = wantSide && !isFlatlay;
  // Original color must be the base render (it can't be produced by recoloring)
  const orderedColors = colors.includes('') ? ['', ...colors.filter((c) => c)] : colors;
  const totalImages = variations * (1 + (includeBack ? 1 : 0) + (includeSide ? 1 : 0)) * orderedColors.length;
  const garment = findGarmentType(garmentType);
  const [errorRemaining, setErrorRemaining] = useState<number | undefined>(undefined);
  const errorMessage = errorCode
    ? (t.errors[errorCode] || t.errors.server_error).replace('{remaining}', String(errorRemaining ?? 0))
    : null;
  const showError = (err: unknown, fallback: string) => {
    setErrorCode(err instanceof RenderError ? err.code : fallback);
    setErrorRemaining(err instanceof RenderError ? err.remaining : undefined);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'primary' | 'layer' | 'back' | 'side') => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    setErrorCode(null);
    try {
      const dataUrl = await prepareImage(file);
      if (type === 'primary') {
        setSourceImage(dataUrl);
      } else if (type === 'back') {
        setBackImage(dataUrl);
        setWantBack(true);
      } else if (type === 'side') {
        setSideImage(dataUrl);
        setWantSide(true);
      } else {
        setLayerImage(dataUrl);
      }
      setResultItem(null);
    } catch (err) {
      showError(err, 'unreadable_image');
    } finally {
      setPreparing(false);
    }
  };

  const clearLayer = () => {
    setLayerImage(null);
    setResultItem(null);
  };

  const downloadResult = () => {
    if (resultItem) downloadUrl(historyUrls(resultItem.id).image, historyFilename(resultItem));
  };

  const [editText, setEditText] = useState('');
  const [editing, setEditing] = useState(false);

  // Text edit of the shown result: saved as a new version right after it in the strip
  const runEdit = async () => {
    const instruction = editText.trim();
    if (!resultItem || !instruction) return;
    setEditing(true);
    setErrorCode(null);
    setPartialNote(null);
    try {
      const { jobId } = await api.createJob({}, [{ kind: 'edit', sourceHistoryId: resultItem.id, instruction, quality }]);
      const task = (await api.waitForJob(jobId)).tasks[0];
      if (task.status === 'done' && task.historyId) {
        const item = await api.historyItem(task.historyId);
        const at = activeResult + 1;
        setResults((prev) => [...prev.slice(0, at), item, ...prev.slice(at)]);
        setActiveResult(at);
        setEditText('');
      } else {
        setErrorCode(task.error || 'server_error');
      }
    } catch (err) {
      showError(err, 'server_error');
    } finally {
      setEditing(false);
      refreshUsage();
    }
  };

  const undoEdit = async () => {
    const parentId = resultItem?.parentId;
    if (!parentId) return;
    const existing = results.findIndex((r) => r.id === parentId);
    if (existing !== -1) return setActiveResult(existing);
    const parent = await api.historyItem(parentId).catch(() => null);
    if (!parent) return setErrorCode('not_found');
    setResults((prev) => [...prev.slice(0, activeResult), parent, ...prev.slice(activeResult)]);
  };

  const toggleResultStar = async () => {
    if (!resultItem) return;
    const updated = await api.star(resultItem.id, !resultItem.starred).catch(() => null);
    if (updated) setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const runRender = async () => {
    if (!sourceImage) return;
    
    setLoading(true);
    setProgress('queued');
    setProgressCount({ done: 0, total: variations });
    setErrorCode(null);
    setPartialNote(null);

    try {
      const images: Record<string, string> = { primary: sourceImage };
      if (layerImage) images.layer = layerImage;
      if (includeBack) images.back = backImage!;
      if (includeSide && sideImage) images.side = sideImage;

      // Plan: per version, render the front in the first color, build back/side views on it,
      // then recolor every angle into each remaining color
      const common = (color: string, angle: Angle) => ({
        profile: { ...profile, garmentColor: color || undefined },
        studio,
        garmentType,
        quality,
        displayStyle,
        aspectRatio,
        background,
        layerPosition,
        angle,
      });
      const tasks: JobTask[] = [];
      const push = (task: JobTask) => tasks.push(task) - 1;
      const [baseColor, ...otherColors] = orderedColors;
      for (let v = 0; v < variations; v++) {
        const idx: Partial<Record<Angle, number>> = {};
        idx.front = push({ kind: 'render', primary: 'primary', layer: layerImage ? 'layer' : undefined, ...common(baseColor, 'front') });
        if (includeBack) idx.back = push({ kind: 'angle', primary: 'back', refs: [idx.front], ...common(baseColor, 'back') });
        if (includeSide) {
          idx.side = push({
            kind: 'angle',
            primary: sideImage ? 'side' : undefined,
            approximate: !sideImage,
            refs: idx.back !== undefined ? [idx.front, idx.back] : [idx.front],
            ...common(baseColor, 'side'),
          });
        }
        for (const color of otherColors) {
          for (const angle of ['front', 'back', 'side'] as Angle[]) {
            if (idx[angle] === undefined) continue;
            // A recolored approximate side view is still approximate
            push({ kind: 'recolor', refs: [idx[angle]!], approximate: angle === 'side' && !sideImage, ...common(color, angle) });
          }
        }
      }
      if (tasks.length >= 8 && !window.confirm(t.confirmTotal.replace('{n}', String(tasks.length)))) return;
      const { jobId } = await api.createJob(images, tasks);
      const job = await api.waitForJob(jobId, (j) => {
        setProgress(j.tasks.every((t) => t.status === 'pending') ? 'queued' : 'running');
        setProgressCount({ done: j.done + j.failed, total: j.total });
      });
      const doneIds = job.tasks.filter((t) => t.status === 'done' && t.historyId).map((t) => t.historyId!);
      const failed = job.tasks.filter((t) => t.status === 'failed');
      if (doneIds.length) {
        setResults(await Promise.all(doneIds.map((id) => api.historyItem(id))));
        setActiveResult(0);
        if (failed.length) {
          const reason = t.errors[failed[0].error || 'server_error'] || t.errors.server_error;
          setPartialNote(t.partialFailed.replace('{n}', String(failed.length)).replace('{reason}', reason));
        }
      } else {
        setErrorCode(failed[0]?.error || 'server_error');
      }
    } catch (err) {
      showError(err, 'server_error');
    } finally {
      setLoading(false);
      setProgress(null);
      refreshUsage();
    }
  };

  const toggleLang = () => setLang(prev => prev === 'en' ? 'ar' : 'en');

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 glass border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
            A
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">
              {t.subtitle}
            </p>
          </div>
        </div>

        <button 
          onClick={toggleLang}
          className="text-xs font-semibold px-4 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          {lang === 'en' ? 'العربية' : 'English'}
        </button>
      </nav>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
        <div role="tablist" className="inline-flex bg-gray-100 rounded-full p-1">
          {(['studio', 'batch', 'history'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                view === v ? 'bg-black text-white shadow' : 'text-gray-500 hover:text-black'
              }`}
            >
              {v === 'studio' ? t.tabStudio : v === 'batch' ? t.tabBatch : t.tabHistory}
            </button>
          ))}
        </div>
      </div>

      {view === 'batch' && <BatchView t={t} lang={lang} usage={usage} onChanged={refreshUsage} />}
      {view === 'history' ? (
        <HistoryView t={t} lang={lang} usage={usage} onChanged={refreshUsage} />
      ) : view === 'batch' ? null : (
      <main className="flex-1 flex flex-col lg:flex-row p-4 sm:p-6 gap-6 max-w-7xl mx-auto w-full">
        <section className="flex-1 min-w-0 space-y-6">
          <div className="space-y-4">
            <button 
              onClick={() => primaryInputRef.current?.click()}
              disabled={preparing}
              className={`w-full group glass p-8 rounded-2xl flex flex-col items-center justify-center gap-4 border-2 border-dashed transition-all ${sourceImage ? 'border-black bg-gray-50/50 shadow-inner' : 'border-gray-200 hover:border-black'}`}
            >
              <div className="p-4 bg-gray-50 rounded-full group-hover:scale-110 transition-transform">
                <Icons.Upload />
              </div>
              <div className="text-center">
                <span className="text-sm font-bold block">{t.uploadBtn}</span>
                <span className="text-[11px] text-gray-400 mt-1 block">{preparing ? t.preparing : sourceImage ? t.primaryLoaded : t.primaryHint}</span>
              </div>
              <input 
                type="file" 
                ref={primaryInputRef} 
                className="hidden" 
                accept="image/jpeg,image/png,image/webp" 
                onChange={(e) => handleFileUpload(e, 'primary')}
              />
            </button>

            <div className="grid grid-cols-2 gap-3">
              {([
                ['back', backImage, setBackImage, backInputRef, t.backPhoto, setWantBack],
                ['side', sideImage, setSideImage, sideInputRef, t.sidePhoto, setWantSide],
              ] as const).map(([key, img, setImg, ref, label, setWant]) => (
                <div key={key} className="relative">
                  <button
                    onClick={() => ref.current?.click()}
                    disabled={preparing}
                    className={`w-full h-24 glass rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-gray-500 overflow-hidden ${
                      img ? 'border-black' : 'border-gray-200 hover:border-black'
                    }`}
                  >
                    {img ? <img src={img} alt={label} className="h-full w-full object-contain" /> : <><Icons.Upload />{label}</>}
                    <input
                      type="file"
                      ref={ref}
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleFileUpload(e, key)}
                    />
                  </button>
                  {img && (
                    <button
                      onClick={() => { setImg(null); if (key === 'back') setWant(false); }}
                      aria-label={t.clearLayer}
                      className="absolute top-1 end-1 w-6 h-6 rounded-full bg-white shadow text-red-500 text-sm leading-none"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="glass rounded-2xl p-4 space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">{t.angles}</label>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-black text-white">{t.angleFront}</span>
                <button
                  onClick={() => backImage && setWantBack(!wantBack)}
                  disabled={!backImage}
                  title={backImage ? undefined : t.needsBackPhoto}
                  aria-pressed={includeBack}
                  className={`px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                    includeBack ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200'
                  } ${backImage ? '' : 'opacity-40 cursor-not-allowed'}`}
                >
                  {t.angleBack}
                </button>
                <button
                  onClick={() => !isFlatlay && setWantSide(!wantSide)}
                  disabled={isFlatlay}
                  aria-pressed={includeSide}
                  className={`px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                    includeSide ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200'
                  } ${isFlatlay ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {sideImage ? t.angleSide : t.angleSideApprox}
                </button>
              </div>
              {!backImage && <p className="text-[11px] text-gray-400">{t.needsBackPhoto}</p>}
              {isFlatlay && <p className="text-[11px] text-gray-400">{t.flatlayNoSide}</p>}
              {includeSide && !sideImage && <p className="text-[11px] text-amber-600">{t.sideApproxNote}</p>}
            </div>
          </div>

          <div className="glass p-6 rounded-2xl space-y-3 shadow-sm border-gray-200">
            <label htmlFor="garment-type" className="text-xs font-bold text-gray-400 uppercase tracking-widest block">{t.garmentType}</label>
            <select
              id="garment-type"
              value={garmentType}
              onChange={(e) => setGarmentType(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-black"
            >
              {GARMENT_TYPES.map((g) => (
                <option key={g.id} value={g.id}>{lang === 'ar' ? g.ar : g.en}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400">{t.garmentTypeHint}</p>

            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block pt-3">{t.displayStyle}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['ghost', 'flatlay'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDisplayStyle(d)}
                  className={`py-2 px-1 rounded-lg text-[11px] font-semibold border transition-all ${
                    displayStyle === d
                      ? 'bg-black text-white border-black shadow-md'
                      : 'bg-white text-gray-600 border-gray-100 hover:border-gray-300'
                  }`}
                >
                  {d === 'ghost' ? t.styleGhost : t.styleFlatlay}
                </button>
              ))}
            </div>
            {isFlatlay && <p className="text-[11px] text-gray-400">{t.styleHint}</p>}
          </div>

          <div className="glass p-6 rounded-2xl space-y-6 shadow-sm border-gray-200">
            {!isFlatlay && (<>
            <div className="flex items-center gap-2 border-b border-gray-100 pb-4">
              <Icons.Settings />
              <h2 className="font-bold flex-1">{t.settings}</h2>
              <button
                onClick={() => setProfile(DEFAULT_PROFILE)}
                className="text-[10px] font-bold text-gray-500 hover:text-black hover:underline"
              >
                {t.reset}
              </button>
            </div>

            <div className="space-y-4">
              {([
                { label: t.shoulders, key: 'shoulders', sub: t.shoulderSub },
                { label: t.chest, key: 'chest', sub: t.chestSub },
                { label: t.waist, key: 'waist', sub: t.waistSub },
                { label: t.hips, key: 'hips', sub: t.hipsSub }
              ] as { label: string; key: Measure; sub: string }[]).filter((slider) => garment.measures.includes(slider.key)).map((slider) => (
                <div key={slider.key} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold text-gray-600">
                    <div className="flex flex-col">
                      <span>{slider.label}</span>
                      <span className="text-[9px] text-gray-400 font-normal uppercase">{slider.sub}</span>
                    </div>
                    <span dir="ltr" className="bg-gray-100 px-2 py-0.5 rounded text-gray-800">{profile[slider.key]}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" max="100" 
                    value={profile[slider.key]}
                    aria-label={slider.label}
                    onChange={(e) => setProfile({...profile, [slider.key]: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-black"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">{t.fit}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['slim', 'athletic', 'relaxed', 'plus'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setProfile({...profile, fitType: f})}
                    className={`flex flex-col items-center py-3 px-1 rounded-xl text-[10px] font-bold border transition-all ${
                      profile.fitType === f 
                        ? 'bg-black text-white border-black shadow-xl ring-2 ring-black ring-offset-2' 
                        : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <span className="mb-1 text-xs">
                      {f === 'slim' && "S"}
                      {f === 'athletic' && "A"}
                      {f === 'relaxed' && "R"}
                      {f === 'plus' && "P"}
                    </span>
                    {t[f]}
                  </button>
                ))}
              </div>
            </div>
            </>)}

            <div className={isFlatlay ? '' : 'pt-4 border-t border-gray-50'}>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">{t.color}</label>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => toggleColor('')}
                  aria-pressed={colors.includes('')}
                  className={`h-8 px-3 rounded-full border-2 text-[10px] font-bold transition-all ${
                    colors.includes('') ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  {t.colorOriginal}
                </button>
                {[...COMMON_COLORS.map((c) => c.name), ...customColors].map((name) => {
                  const order = orderedColors.indexOf(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggleColor(name)}
                      title={colorLabel(name)}
                      aria-label={colorLabel(name)}
                      aria-pressed={order !== -1}
                      className={`relative w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        order !== -1 ? 'border-black scale-110 shadow-lg' : 'border-gray-200 shadow-sm'
                      }`}
                      style={{ backgroundColor: colorSwatch(name) }}
                    >
                      {order !== -1 && (
                        <span dir="ltr" className="absolute -top-1.5 -end-1.5 w-4 h-4 rounded-full bg-black text-white text-[9px] leading-4 font-bold">
                          {order + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={() => colorInputRef.current?.click()}
                  title={t.customColor}
                  aria-label={t.customColor}
                  disabled={colors.length >= MAX_COLORS}
                  className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center bg-gray-50 transition-all hover:bg-gray-100"
                >
                  <Icons.Palette />
                </button>
                <input
                  type="color"
                  ref={colorInputRef}
                  className="hidden"
                  onChange={(e) => {
                    const hex = e.target.value.toUpperCase();
                    setColors((prev) => (prev.includes(hex) || prev.length >= MAX_COLORS ? prev : [...prev, hex]));
                  }}
                />
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">{t.colorsHint}</p>
            </div>
          </div>

          <div className="glass p-6 rounded-2xl space-y-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-4">
              <div className="p-1.5 bg-gray-900 rounded text-white"><Icons.Layer /></div>
              <h2 className="font-bold">{t.studio}</h2>
            </div>
            
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t.lighting}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['studio', 'sunlight', 'night', 'office'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setStudio({...studio, lighting: l})}
                    className={`py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                      studio.lighting === l 
                        ? 'bg-black text-white border-black shadow-md' 
                        : 'bg-white text-gray-600 border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    {t[l === 'studio' ? 'studioMode' : l]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-50">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">{t.quality}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['standard', 'high'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                      quality === q
                        ? 'bg-black text-white border-black shadow-md'
                        : 'bg-white text-gray-600 border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    {q === 'standard' ? t.qualityStandard : t.qualityHigh}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">{t.qualityHint}</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-50">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">{t.aspectRatio}</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['3:4', t.ratioProduct],
                  ['1:1', t.ratioSquare],
                  ['4:5', t.ratioPost],
                  ['9:16', t.ratioStory],
                ] as [AspectRatio, string][]).map(([r, label]) => (
                  <button
                    key={r}
                    onClick={() => setAspectRatio(r)}
                    className={`py-2 px-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      aspectRatio === r
                        ? 'bg-black text-white border-black shadow-md'
                        : 'bg-white text-gray-600 border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-50">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">{t.background}</label>
              <div className="grid grid-cols-3 gap-2">
                {(['white', 'gray', 'custom'] as const).map((b) => {
                  const isCustom = b === 'custom';
                  const active = isCustom ? background.startsWith('#') : background === b;
                  return (
                    <button
                      key={b}
                      onClick={() => (isCustom ? bgInputRef.current?.click() : setBackground(b))}
                      className={`py-2 px-1 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                        active ? 'bg-black text-white border-black shadow-md' : 'bg-white text-gray-600 border-gray-100 hover:border-gray-300'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-gray-300 shrink-0"
                        style={{ backgroundColor: b === 'white' ? '#ffffff' : b === 'gray' ? '#ededed' : background.startsWith('#') ? background : 'transparent' }}
                      />
                      {b === 'white' ? t.bgWhite : b === 'gray' ? t.bgGray : t.bgCustom}
                    </button>
                  );
                })}
              </div>
              <input
                type="color"
                ref={bgInputRef}
                className="hidden"
                onChange={(e) => setBackground(e.target.value)}
              />
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-50">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">{t.variations}</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setVariations(n)}
                    aria-label={`${t.variations}: ${n}`}
                    aria-pressed={variations === n}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                      variations === n
                        ? 'bg-black text-white border-black shadow-md'
                        : 'bg-white text-gray-600 border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <span dir="ltr">{n}</span>
                  </button>
                ))}
              </div>
              {variations > 1 && <p className="text-[11px] text-gray-400 leading-relaxed">{t.variationsHint}</p>}
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-50">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t.layeringTitle}</label>
                {layerImage && (
                  <button 
                    onClick={clearLayer}
                    className="text-[10px] font-bold text-red-500 hover:underline"
                  >
                    {t.clearLayer}
                  </button>
                )}
              </div>

              {!layerImage ? (
                <button 
                  onClick={() => layerInputRef.current?.click()}
                  disabled={preparing}
                  className="w-full py-4 border-2 border-dashed border-blue-200 bg-blue-50/20 rounded-xl flex items-center justify-center gap-3 group hover:border-blue-400 hover:bg-blue-50/40 transition-all"
                >
                  <div className="text-blue-600"><Icons.Layer /></div>
                  <span className="text-xs font-bold text-blue-700">{t.layerBtn}</span>
                  <input 
                    type="file" 
                    ref={layerInputRef} 
                    className="hidden" 
                    accept="image/jpeg,image/png,image/webp" 
                    onChange={(e) => handleFileUpload(e, 'layer')}
                  />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button 
                    onClick={() => setLayerPosition('under')}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                      layerPosition === 'under' 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg' 
                        : 'bg-white text-blue-700 border-blue-100 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-lg opacity-50">⇣</span>
                    {t.layerUnder}
                  </button>
                  <button 
                    onClick={() => setLayerPosition('over')}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                      layerPosition === 'over' 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg' 
                        : 'bg-white text-blue-700 border-blue-100 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-lg opacity-50">⇡</span>
                    {t.layerOver}
                  </button>
                </div>
              )}
            </div>
          </div>

          <button 
            disabled={!sourceImage || loading || preparing}
            onClick={runRender}
            className={`w-full py-5 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${
              !sourceImage || loading || preparing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-black text-white hover:bg-gray-800 shadow-2xl scale-100 hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Icons.Render />
            )}
            {loading
              ? progress === 'queued'
                ? t.queued
                : progressCount.total > 1
                  ? t.generatingCount.replace('{done}', String(progressCount.done)).replace('{total}', String(progressCount.total))
                  : t.generating
              : t.generate}
          </button>
          {totalImages > 1 && !loading && (
            <p className="text-xs font-bold text-gray-700 text-center">{t.totalImages.replace('{n}', String(totalImages))}</p>
          )}
          {usage && (
            <p className="text-[11px] text-gray-500 text-center">
              {t.usageToday} <span dir="ltr">{usage.today}/{usage.dailyLimit}</span>
              {' · '}
              {t.usageWeek} <span dir="ltr">{usage.week}/{usage.weeklyLimit}</span>
            </p>
          )}
        </section>

        <section className="flex-[1.5] min-w-0 flex flex-col gap-4">
          <div className="flex-1 glass rounded-3xl overflow-hidden relative min-h-[420px] sm:min-h-[500px] flex items-center justify-center bg-gray-50 border border-gray-100 shadow-inner">
            {!sourceImage && !loading && (
              <div className="text-center p-8">
                <div className="w-24 h-24 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-6 text-gray-300">
                  <Icons.Upload />
                </div>
                <h3 className="font-bold text-gray-400 text-lg">{t.ghostTech}</h3>
                <p className="text-sm text-gray-400 max-w-[300px] mx-auto mt-2 leading-relaxed">
                  {t.emptyHint}
                </p>
              </div>
            )}

            {(loading || editing) && (
              <div className="absolute inset-0 z-10 glass flex flex-col items-center justify-center gap-6 text-center p-12">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-black/10 border-t-black rounded-full animate-spin"></div>
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">
                    {editing ? t.editing : t.creating}
                  </h3>
                  <p className="text-sm text-gray-500 mt-2 uppercase tracking-widest font-bold">
                    {lang === 'ar' ? garment.ar : garment.en} · {isFlatlay ? t.styleFlatlay : t[profile.fitType]} | {orderedColors.map(colorLabel).join('، ')}
                  </p>
                </div>
              </div>
            )}

            {errorMessage && (
              <div role="alert" className="absolute top-4 inset-x-4 sm:top-6 sm:inset-x-6 z-20 bg-red-50 border border-red-100 text-red-600 p-5 rounded-2xl text-sm font-semibold flex justify-between items-center gap-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 shrink-0 bg-red-500 rounded-full"></span>
                  {errorMessage}
                </div>
                <button onClick={() => setErrorCode(null)} aria-label="Close" className="text-xl leading-none">&times;</button>
              </div>
            )}

            <div className="flex flex-col w-full h-full">
              {sourceImage && !resultImage && (
                <div className="flex-1 flex flex-col md:flex-row bg-white/50">
                  <div className="relative flex-1 border-b md:border-b-0 md:border-e border-gray-100 flex items-center justify-center">
                    <img src={sourceImage} className="max-w-full max-h-full object-contain p-6 sm:p-10 drop-shadow-xl opacity-80" alt={t.source} />
                    <div className="absolute top-6 start-6 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">{t.source}</div>
                  </div>
                  {layerImage && (
                    <div className="relative flex-1 flex items-center justify-center bg-blue-50/10">
                      <img src={layerImage} className="max-w-full max-h-full object-contain p-6 sm:p-10 drop-shadow-xl opacity-80" alt={t.layer} />
                      <div className="absolute top-6 start-6 bg-blue-500 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">{t.layer}</div>
                    </div>
                  )}
                </div>
              )}
              
              {resultImage && (
                <div className="relative flex-1 bg-white">
                  <div className="w-full h-full flex items-center justify-center">
                     <img src={resultImage} className="max-w-full max-h-full object-contain p-6 sm:p-10 drop-shadow-2xl" alt={t.result} />
                  </div>
                  
                  <button
                    onClick={toggleResultStar}
                    aria-label={resultItem?.starred ? t.unstar : t.star}
                    className={`absolute top-6 end-6 sm:top-8 sm:end-8 w-10 h-10 rounded-full bg-white shadow-xl text-lg leading-none ${
                      resultItem?.starred ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
                    }`}
                  >
                    ★
                  </button>

                  <div className="absolute top-6 start-6 sm:top-8 sm:start-8 flex flex-col gap-3">
                    <div className="bg-black text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] shadow-2xl">
                      {t.result}: {resultItem ? `${angleLabel(resultItem)} · ${colorLabel(resultItem.settings.garmentColor)}${resultItem.instruction ? ` · ${t.editedBadge}` : ''}` : ''}
                    </div>
                  </div>
                  
                  <div className="absolute bottom-6 end-6 sm:bottom-8 sm:end-8">
                    <button 
                      onClick={downloadResult}
                      className="bg-black text-white p-4 rounded-full hover:scale-110 active:scale-95 transition-all shadow-2xl flex items-center gap-2"
                    >
                      <Icons.Download />
                      <span className="text-[10px] font-bold uppercase pe-2">{t.download}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {partialNote && (
            <p role="status" className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
              {partialNote}
            </p>
          )}

          {results.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {results.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => setActiveResult(i)}
                  aria-label={t.versionN.replace('{n}', String(i + 1))}
                  className={`relative shrink-0 w-20 sm:w-24 aspect-[3/4] rounded-xl overflow-hidden border-2 bg-white ${
                    i === activeResult ? 'border-black' : 'border-transparent shadow-sm'
                  }`}
                >
                  <img src={historyUrls(r.id).thumb} alt="" className="w-full h-full object-contain" />
                  {r.starred && <span className="absolute top-1 end-1 text-amber-500 text-sm leading-none">★</span>}
                  {r.instruction && <span className="absolute top-1 start-1 bg-blue-600 text-white rounded px-1 text-[8px] font-bold">{t.editedBadge}</span>}
                  <span className="absolute bottom-1 inset-x-1 bg-white/90 rounded px-1 text-[9px] font-bold flex items-center gap-1 truncate">
                    <span className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: colorSwatch(r.settings.garmentColor) }} />
                    {angleLabel(r)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {resultItem && (
            <div className="glass rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="edit-text" className="text-xs font-bold text-gray-500">{t.editTitle}</label>
                {resultItem.parentId && (
                  <button onClick={undoEdit} className="text-[11px] font-bold text-gray-500 hover:text-black hover:underline">
                    ↶ {t.undoEdit}
                  </button>
                )}
              </div>
              {resultItem.instruction && (
                <p className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 break-words">
                  {t.instructionLabel}: {resultItem.instruction}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {t.editChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setEditText(chip)}
                    className="px-2.5 py-1 rounded-full border border-gray-200 bg-white text-[11px] font-semibold text-gray-600 hover:border-black"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <textarea
                id="edit-text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder={t.editPlaceholder}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-black resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-gray-400">{t.editHint}</p>
                <button
                  onClick={runEdit}
                  disabled={!editText.trim() || editing || loading}
                  className={`shrink-0 px-5 py-2 rounded-full text-xs font-bold ${
                    !editText.trim() || editing || loading ? 'bg-gray-100 text-gray-400' : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  {editing ? t.editing : t.editButton}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
      )}

      <footer className="p-8 text-center text-[10px] text-gray-400 uppercase tracking-[0.3em] font-bold border-t border-gray-50">
        &copy; {new Date().getFullYear()} {t.footer}
      </footer>
    </div>
  );
};

export default App;
