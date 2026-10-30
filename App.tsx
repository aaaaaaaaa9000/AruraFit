import React, { useState, useRef, useEffect } from 'react';
import { BodyProfile, StudioConfig, Language, LayerPosition, Quality, DisplayStyle } from './types';
import { TRANSLATIONS, Icons } from './constants';
import { GARMENT_TYPES, DEFAULT_GARMENT_TYPE, findGarmentType, type Measure } from './garmentTypes';
import { RenderError, prepareImage, api, downloadUrl, historyFilename, historyUrls, type HistoryItem, type UsageStats } from './services/geminiService';
import HistoryView from './HistoryView';

const COMMON_COLORS = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#E11D48' },
  { name: 'Navy', hex: '#1E3A8A' },
  { name: 'Beige', hex: '#F5F5DC' },
  { name: 'Pink', hex: '#DB2777' },
  { name: 'Emerald', hex: '#059669' },
];

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
  const [layerPosition, setLayerPosition] = useState<LayerPosition>('under');
  const [resultItem, setResultItem] = useState<HistoryItem | null>(null);
  const resultImage = resultItem ? historyUrls(resultItem.id).image : null;
  const [view, setView] = useState<'studio' | 'history'>('studio');
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

  const isCustomColor = Boolean(profile.garmentColor && !COMMON_COLORS.find(c => c.name === profile.garmentColor));
  const colorLabel = (color: string) => t.colors[color] || color;
  const garment = findGarmentType(garmentType);
  const [errorRemaining, setErrorRemaining] = useState<number | undefined>(undefined);
  const errorMessage = errorCode
    ? (t.errors[errorCode] || t.errors.server_error).replace('{remaining}', String(errorRemaining ?? 0))
    : null;
  const showError = (err: unknown, fallback: string) => {
    setErrorCode(err instanceof RenderError ? err.code : fallback);
    setErrorRemaining(err instanceof RenderError ? err.remaining : undefined);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'primary' | 'layer') => {
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

  const runRender = async () => {
    if (!sourceImage) return;
    
    setLoading(true);
    setProgress('queued');
    setErrorCode(null);

    try {
      const images: Record<string, string> = { primary: sourceImage };
      if (layerImage) images.layer = layerImage;
      const { jobId } = await api.createJob(images, [
        {
          primary: 'primary',
          layer: layerImage ? 'layer' : undefined,
          profile,
          studio,
          garmentType,
          quality,
          displayStyle,
          layerPosition,
        },
      ]);
      const job = await api.waitForJob(jobId, (j) => setProgress(j.tasks[0]?.status === 'pending' ? 'queued' : 'running'));
      const task = job.tasks[0];
      if (task.status === 'done' && task.historyId) {
        setResultItem(await api.historyItem(task.historyId));
      } else {
        setErrorCode(task.error || 'server_error');
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
          {(['studio', 'history'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                view === v ? 'bg-black text-white shadow' : 'text-gray-500 hover:text-black'
              }`}
            >
              {v === 'studio' ? t.tabStudio : t.tabHistory}
            </button>
          ))}
        </div>
      </div>

      {view === 'history' ? (
        <HistoryView t={t} lang={lang} usage={usage} onChanged={refreshUsage} />
      ) : (
      <main className="flex-1 flex flex-col lg:flex-row p-4 sm:p-6 gap-6 max-w-7xl mx-auto w-full">
        <section className="flex-1 space-y-6">
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
              <div className="flex flex-wrap gap-2 mb-4">
                {COMMON_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setProfile({...profile, garmentColor: c.name})}
                    title={colorLabel(c.name)}
                    aria-label={colorLabel(c.name)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      profile.garmentColor === c.name ? 'border-black scale-110 shadow-lg' : 'border-transparent shadow-sm'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
                <button
                  onClick={() => colorInputRef.current?.click()}
                  title={t.customColor}
                  aria-label={t.customColor}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center bg-gray-50 transition-all hover:bg-gray-100 ${
                    isCustomColor ? 'border-black scale-110 shadow-lg' : 'border-gray-200'
                  }`}
                  style={isCustomColor ? {backgroundColor: profile.garmentColor} : {}}
                >
                  <Icons.Palette />
                </button>
                <input 
                  type="color" 
                  ref={colorInputRef} 
                  className="hidden" 
                  onChange={(e) => setProfile({...profile, garmentColor: e.target.value})} 
                />
              </div>
              {profile.garmentColor && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">{t.selectedColor}: <span dir="ltr">{colorLabel(profile.garmentColor)}</span></span>
                  <button 
                    onClick={() => setProfile({...profile, garmentColor: undefined})}
                    className="text-[10px] font-bold text-red-500 hover:underline uppercase"
                  >
                    {t.clearColor}
                  </button>
                </div>
              )}
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
            {loading ? (progress === 'queued' ? t.queued : t.generating) : t.generate}
          </button>
          {usage && (
            <p className="text-[11px] text-gray-500 text-center">
              {t.usageToday} <span dir="ltr">{usage.today}/{usage.dailyLimit}</span>
              {' · '}
              {t.usageWeek} <span dir="ltr">{usage.week}/{usage.weeklyLimit}</span>
            </p>
          )}
        </section>

        <section className="flex-[1.5] flex flex-col gap-4">
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

            {loading && (
              <div className="absolute inset-0 z-10 glass flex flex-col items-center justify-center gap-6 text-center p-12">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-black/10 border-t-black rounded-full animate-spin"></div>
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">
                    {t.creating}
                  </h3>
                  <p className="text-sm text-gray-500 mt-2 uppercase tracking-widest font-bold">
                    {lang === 'ar' ? garment.ar : garment.en} · {isFlatlay ? t.styleFlatlay : t[profile.fitType]} {profile.garmentColor ? `| ${colorLabel(profile.garmentColor)}` : ''}
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
                  
                  <div className="absolute top-6 start-6 sm:top-8 sm:start-8 flex flex-col gap-3">
                    <div className="bg-black text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] shadow-2xl">
                      {t.result}: {lang === 'ar' ? garment.ar : garment.en} · {isFlatlay ? t.styleFlatlay : t[profile.fitType]}{profile.garmentColor ? ` · ${colorLabel(profile.garmentColor)}` : ''}
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
