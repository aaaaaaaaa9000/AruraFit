import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from './types';

interface Slide {
  icon: string;
  title: { ar: string; en: string };
  intro: { ar: string; en: string };
  points: { ar: string; en: string }[];
}

// One slide per area of the app, in the order the user meets them
export const SLIDES: Slide[] = [
  {
    icon: '👋',
    title: { ar: 'أرورا فيت في دقيقة', en: 'AruraFit in a minute' },
    intro: {
      ar: 'بتصوّر القطعة على الشماعة أو على الأرض، والتطبيق يطلّعها صورة منتج احترافية على مانيكان خفي أو مفرودة.',
      en: 'Photograph the garment on a hanger or the floor and get a professional product image on an invisible mannequin, or laid flat.',
    },
    points: [
      { ar: 'فيه 3 تبويبات فوق: الاستوديو، دفعة، السجل.', en: 'Three tabs on top: Studio, Batch, History.' },
      { ar: 'زرار اللغة في الركن بيبدّل بين العربي والإنجليزي.', en: 'The language button in the corner switches Arabic / English.' },
      { ar: 'الأسهم ← → في الكيبورد بتنقلك بين الشرايح، و Esc بيقفل الدليل.', en: 'Use the ← → keys to move between slides, Esc to close.' },
    ],
  },
  {
    icon: '📤',
    title: { ar: 'رفع الصور', en: 'Uploading photos' },
    intro: {
      ar: 'ابدأ بصورة القطعة الأساسية. بعدها تقدر تضيف صور تانية لنفس القطعة.',
      en: 'Start with the main garment photo, then optionally add more photos of the same piece.',
    },
    points: [
      { ar: 'رفع القطعة الأساسية: صورة JPG أو PNG أو WebP، وبتتصغّر تلقائياً في المتصفح قبل الرفع.', en: 'Upload Primary Garment: JPG, PNG or WebP, downscaled in your browser first.' },
      { ar: 'صورة الضهر وصورة الجنب (اختياري): بتخلّي التطبيق يطلّع الزاوية دي بدقة من صورتها الحقيقية.', en: 'Back photo and Side photo (optional): used to render those angles accurately.' },
      { ar: 'إضافة قطعة ثانوية: لو عايز طبقتين فوق بعض، زي روب فوق قميص نوم، وتحدد فوق ولا تحت الأساسية.', en: 'Add Layering Piece: a second garment worn over or under the main one, e.g. a robe over a nightgown.' },
    ],
  },
  {
    icon: '🏷️',
    title: { ar: 'نوع القطعة', en: 'Garment type' },
    intro: {
      ar: 'اختار نوع المنتج من نفس تصنيفات متجر Shop Up علشان الشكل يطلع مظبوط.',
      en: 'Pick the product type, matching your Shop Up categories, so the shape comes out right.',
    },
    points: [
      { ar: 'الأنواع: سوتيانات، ملابس داخلية، لانجيري، شبك، ملابس تنكرية، قمصان نوم، مايوهات، مايوهات محتشمة، رقص شرقي، روب، عبايات، بيجامات، ترنج، برمودا، شورت.', en: 'Types include bras, underwear, lingerie, nightgowns, swimwear, belly dance, robes, abayas, pajamas, tracksuits, shorts and more.' },
      { ar: 'التطبيق بيستعمل النوع علشان يفهم القصّة والطول والمكان اللي بتتلبس فيه القطعة.', en: 'The type tells the model the cut, length and where the garment sits.' },
      { ar: 'التفاصيل (دانتيل، ترتر، خياطة) بتتاخد من صورتك أنت، مش من النوع.', en: 'Fine details (lace, sequins, stitching) always come from your photo, not the type.' },
    ],
  },
  {
    icon: '🧍‍♀️',
    title: { ar: 'طريقة العرض والمقاسات', en: 'Display style & body profile' },
    intro: {
      ar: 'تتحكم في شكل القطعة: مجسّمة على مانيكان خفي، ولا مفرودة على سطح.',
      en: 'Control how the piece is shown: on an invisible 3D mannequin or laid flat.',
    },
    points: [
      { ar: 'مجسّم: القطعة كأنها متلبّسة، وبتفتح معاها إعدادات الجسم: الأكتاف، الصدر، الوسط، الأرداف.', en: '3D: the garment looks worn, and the body sliders appear: shoulders, bust, waist, hips.' },
      { ar: 'نوع القالب: نحيف، منحني/رياضي، واسع، مقاسات كبيرة.', en: 'Silhouette: petite, curvy/athletic, relaxed, plus size.' },
      { ar: 'مفرود: القطعة مفرودة من فوق، وإعدادات الجسم بتختفي لأنها مش محتاجاها.', en: 'Flat lay: shown flat from above, body settings are hidden as they do not apply.' },
      { ar: 'إعادة ضبط: بترجّع الإعدادات للوضع الأول.', en: 'Reset puts every setting back to default.' },
    ],
  },
  {
    icon: '🎨',
    title: { ar: 'الألوان', en: 'Colors' },
    intro: {
      ar: 'تقدر تطلّع نفس القطعة بأكتر من لون مرة واحدة.',
      en: 'Render the same garment in several colors at once.',
    },
    points: [
      { ar: 'اختار لحد 6 ألوان. أول لون بيتعمل من صورتك، والباقي بيتلوّن من نفس النتيجة فيطلعوا متطابقين في كل حاجة غير اللون.', en: 'Pick up to 6. The first is rendered from your photo; the others are recolored from it so everything but the color matches.' },
      { ar: 'لون مخصص: تختار أي درجة بنفسك.', en: 'Custom: choose any shade you like.' },
      { ar: 'الأصلي: يسيب لون القطعة زي ما هو في الصورة.', en: 'Original keeps the garment color from the photo.' },
    ],
  },
  {
    icon: '🔄',
    title: { ar: 'الزوايا', en: 'Angles' },
    intro: {
      ar: 'اطلب أمامي وضهر وجنب لنفس القطعة في طلب واحد.',
      en: 'Ask for front, back and side of the same piece in one go.',
    },
    points: [
      { ar: 'الضهر محتاج صورة ضهر مرفوعة، ولو مش مرفوعة التطبيق بيطلب منك ترفعها.', en: 'Back needs an uploaded back photo; the app asks for one if missing.' },
      { ar: 'الجنب: لو مفيش صورة جنب، بيتعمل تقريبي من الأمامي وبيظهرلك تنبيه إنه ممكن مايبقاش دقيق 100%.', en: 'Side: without a side photo it is inferred from the front, with a note that it may not be exact.' },
      { ar: 'في الوضع المفرود مفيش زاوية جنب.', en: 'Side view is not available in flat lay.' },
    ],
  },
  {
    icon: '📐',
    title: { ar: 'المقاس والخلفية والإضاءة', en: 'Size, background & lighting' },
    intro: {
      ar: 'جهّز الصورة على مقاس المكان اللي هتنزل فيه.',
      en: 'Prepare the image for where it will be published.',
    },
    points: [
      { ar: 'مقاس الصورة: منتج 3:4، Shopify مربع 1:1، بوست إنستجرام 4:5، ستوري 9:16.', en: 'Image size: product 3:4, Shopify square 1:1, Instagram post 4:5, story 9:16.' },
      { ar: 'الخلفية: أبيض، رمادي فاتح، أو لون براندك.', en: 'Background: white, light gray, or your brand color.' },
      { ar: 'بيئة الإضاءة: استوديو نضيف، شمس طبيعية، مسائية دافية، إضاءة مكتب. الإضاءة بتتظبط مع الخلفية علشان ماتتعارضوش.', en: 'Lighting: clean studio, sunlight, warm evening, office. It is balanced with the background so they never conflict.' },
    ],
  },
  {
    icon: '⚙️',
    title: { ar: 'الجودة وعدد النسخ', en: 'Quality & versions' },
    intro: {
      ar: 'اختار بين السرعة والتكلفة وأعلى تفصيل.',
      en: 'Trade speed and cost against maximum detail.',
    },
    points: [
      { ar: 'جودة عادية: أسرع وأرخص، ومناسبة لمعظم القطع.', en: 'Standard: faster and cheaper, fine for most pieces.' },
      { ar: 'جودة عالية: بتحافظ أكتر على التفاصيل الدقيقة زي الترتر والدانتيل، لكن أبطأ وبتتحسب بحوالي ضعف.', en: 'High: keeps fine detail such as sequins and lace better; slower and counts about double.' },
      { ar: 'عدد النسخ في كل مرة (1 لـ 4): تجيب أكتر من نسخة وتختار أحلاها وتحط عليها نجمة.', en: 'Versions per render (1–4): get several takes, pick the best and star it.' },
      { ar: 'قبل التنفيذ بيظهر إجمالي عدد الصور، وبيسألك تأكيد لو الطلب كبير.', en: 'The total image count is shown before you start, with a confirmation for big requests.' },
    ],
  },
  {
    icon: '🖼️',
    title: { ar: 'النتيجة والتعديل', en: 'Result & editing' },
    intro: {
      ar: 'بعد التوليد تظهر الصورة جنب الأصلية، وتقدر تعدّلها بالكتابة.',
      en: 'The result appears next to your original, and you can edit it with a text instruction.',
    },
    points: [
      { ar: 'تصدير الصورة: بينزّل الصورة باسم فيه النوع والمقاس والتاريخ.', en: 'Export Image: downloads the file named with type, size and date.' },
      { ar: 'عايز تعدّل إيه؟: اكتب طلبك، زي "خلي الكم أطول"، أو اختار اقتراح جاهز. كل تعديل بيتحسب صورة وبيتحفظ نسخة جديدة.', en: 'What should change?: type a request or pick a suggestion. Each edit counts as one image and saves a new version.' },
      { ar: 'رجوع للنسخة السابقة: بيرجّعك لقبل آخر تعديل.', en: 'Back to previous version undoes the last edit.' },
      { ar: 'التطبيق بيشيل أي لوجو أو علامة مائية للمتجر من الصورة الناتجة.', en: 'Any store logo or watermark in the photo is removed from the render.' },
    ],
  },
  {
    icon: '📦',
    title: { ar: 'تبويب دفعة', en: 'Batch tab' },
    intro: {
      ar: 'لما يكون عندك منتجات كتير، ارفعها كلها مرة واحدة.',
      en: 'Got many products? Upload them all at once.',
    },
    points: [
      { ar: 'إضافة صور: كل صورة منتج. وتقدر تغيّر نوع القطعة لكل صورة لوحدها.', en: 'Add photos: one product per photo, with a garment type you can set per photo.' },
      { ar: 'إعدادات الكل: طريقة العرض والجودة والمقاس والخلفية والإضاءة بتتطبّق على كل الصور. الألوان والزوايا مش في الدفعة، هي في الاستوديو بس.', en: 'Settings for all photos: display style, quality, size, background and lighting apply to every item. Colors and angles are Studio-only.' },
      { ar: 'ابدأ الدفعة: بيعرض حالة كل صورة (منتظرة، شغالة، خلصت، فشلت).', en: 'Start batch shows each item as waiting, working, done or failed.' },
      { ar: 'إعادة المحاولة للي فشل، وتحميل الكل (ZIP) في ملف واحد.', en: 'Retry failed items, and Download all (ZIP) in one file.' },
      { ar: 'لو قفلت الصفحة، الدفعة بتفضل شغالة وتلاقيها لما ترجع.', en: 'If you close the page the batch keeps running and is there when you return.' },
    ],
  },
  {
    icon: '🗂️',
    title: { ar: 'تبويب السجل', en: 'History tab' },
    intro: {
      ar: 'كل صورة بتتعمل بتتحفظ هنا، فمش هتضيع.',
      en: 'Every image you make is saved here.',
    },
    points: [
      { ar: 'فلاتر: نوع القطعة، الفترة (النهارده، 7 أيام، 30 يوم)، والمميزة بنجمة بس.', en: 'Filters: garment type, period (today, 7 or 30 days), starred only.' },
      { ar: 'اضغط على أي صورة: تشوفها كبيرة مع الأصلية وكل إعداداتها، وتنزّلها أو تنجّمها أو تمسحها.', en: 'Open any image to see it large with the original and its settings; download, star or delete.' },
      { ar: 'التحديد المتعدد: تحميل المحدد، مسح المحدد، أو مسح الكل.', en: 'Multi-select: download selected, delete selected, or delete all.' },
      { ar: 'التنضيف التلقائي: بيتمسح بعد 30 يوم، أو لما المساحة توصل 2 جيجا (الأقدم الأول). الصور اللي عليها نجمة مابتتمسحش بالوقت.', en: 'Auto-clean: removed after 30 days, or when 2 GB is full (oldest first). Starred images are kept past the time limit.' },
    ],
  },
  {
    icon: '📊',
    title: { ar: 'الحدود والاستخدام', en: 'Limits & usage' },
    intro: {
      ar: 'العدّاد بيوريك استهلاكك علشان التكلفة تفضل تحت السيطرة.',
      en: 'The counters show your usage so cost stays under control.',
    },
    points: [
      { ar: 'الحد اليومي 300 صورة، والأسبوعي 600 صورة، وبيتجدد على توقيت القاهرة.', en: 'Daily limit 300 images, weekly 600, reset on Cairo time.' },
      { ar: 'النهارده / الأسبوع ده: بيظهروا فوق السجل وبيتحدثوا بعد كل طلب.', en: 'Today / This week appear above the history and update after each request.' },
      { ar: 'الصورة اللي فشلت مابتتحسبش عليك.', en: 'Failed images are not counted against you.' },
      { ar: 'التطبيق محمي بكلمة سر، ومفتاح Gemini محفوظ على السيرفر مش في المتصفح.', en: 'The app is password-protected and the Gemini key stays on the server, never in the browser.' },
    ],
  },
];

interface Props {
  lang: Language;
  open: boolean;
  onClose: () => void;
}

const GuideView: React.FC<Props> = ({ lang, open, onClose }) => {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const isAr = lang === 'ar';
  const last = SLIDES.length - 1;

  // In RTL the "next" arrow points left, so key and swipe directions flip with the language
  const go = useCallback((delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta))), [last]);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(isAr ? -1 : 1);
      else if (e.key === 'ArrowLeft') go(isAr ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isAr, go, onClose]);

  if (!open) return null;
  const slide = SLIDES[index];
  const l = isAr ? 'ar' : 'en';
  const labels = isAr
    ? { guide: 'دليل الاستخدام', prev: 'السابق', next: 'التالي', done: 'تمام', close: 'إغلاق' }
    : { guide: 'How to use', prev: 'Previous', next: 'Next', done: 'Done', close: 'Close' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.guide}
      className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 60) go((dx < 0 ? 1 : -1) * (isAr ? -1 : 1));
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4 text-xs font-bold text-gray-400">
          <span>
            {labels.guide} · <span dir="ltr">{index + 1} / {SLIDES.length}</span>
          </span>
          <button onClick={onClose} aria-label={labels.close} className="text-2xl leading-none px-2 text-gray-500 hover:text-black">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 space-y-5" key={index}>
          <div className="text-5xl" aria-hidden>{slide.icon}</div>
          <h2 className="text-2xl font-bold tracking-tight">{slide.title[l]}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{slide.intro[l]}</p>
          <ul className="space-y-3">
            {slide.points.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-black shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{p[l]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-2">
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            className="px-5 py-2 rounded-full border border-gray-200 text-xs font-bold disabled:opacity-30"
          >
            {labels.prev}
          </button>
          <div className="flex flex-wrap justify-center gap-1.5" role="tablist">
            {SLIDES.map((s, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === index}
                aria-label={s.title[l]}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-black' : 'w-2 bg-gray-300 hover:bg-gray-400'}`}
              />
            ))}
          </div>
          <button
            onClick={() => (index === last ? onClose() : go(1))}
            className="px-5 py-2 rounded-full bg-black text-white text-xs font-bold"
          >
            {index === last ? labels.done : labels.next}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuideView;
