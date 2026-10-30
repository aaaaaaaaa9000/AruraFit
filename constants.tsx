
import React from 'react';

export const TRANSLATIONS = {
  en: {
    title: "AruraFit",
    subtitle: "Women's Phantom Studio",
    uploadBtn: "Upload Primary Garment",
    layerBtn: "Add Layering Piece",
    generate: "Render Phantom",
    settings: "Body Profile (Female)",
    studio: "Virtual Studio",
    chest: "Bust Definition",
    shoulders: "Shoulder Breadth",
    waist: "Waist Taper",
    fit: "Silhouette Type",
    color: "Garment Color",
    customColor: "Custom",
    lighting: "Environment Lighting",
    sunlight: "Natural Sunlight",
    night: "Evening Ambient",
    office: "Corporate Lighting",
    studioMode: "Clean Studio",
    download: "Export Image",
    reset: "Reset Profile",
    slim: "Petite/Slim",
    athletic: "Curvy/Athletic",
    relaxed: "Relaxed/Oversized",
    plus: "Plus Size/Fuller",
    ghostTech: "Ghost Mannequin Technology",
    layeringTitle: "Layering Configuration",
    layerUnder: "Layer Underneath",
    layerOver: "Layer Over Top",
    clearLayer: "Remove Layer",
    primaryLoaded: "Primary piece loaded — tap to change",
    primaryHint: "Main garment for the invisible profile",
    shoulderSub: "Shoulder Span",
    chestSub: "Bust Definition",
    waistSub: "Waist Taper",
    selectedColor: "Selected",
    clearColor: "Clear Color",
    source: "Source",
    layer: "Layer",
    result: "Render",
    generating: "Generating...",
    creating: "Creating Phantom Render...",
    emptyHint: "Upload your garment and adjust the fit and color to see the differences.",
    preparing: "Preparing image...",
    footer: "AruraFit Laboratory. Precision Tailoring Engine.",
    colors: { Black: "Black", White: "White", Red: "Red", Navy: "Navy", Beige: "Beige", Pink: "Pink", Emerald: "Emerald" } as Record<string, string>,
    errors: {
      invalid_input: "The request was not valid. Please try again.",
      invalid_image: "Unsupported image. Please use a JPG, PNG or WebP photo.",
      unreadable_image: "This image could not be read. Please use a JPG, PNG or WebP photo.",
      image_too_large: "The image is too large. Please use a smaller photo.",
      rate_limited: "Too many renders in a short time. Please wait a minute and try again.",
      not_configured: "The server is not configured yet (missing Gemini API key).",
      no_image_returned: "The AI did not return an image. Try another photo or different settings.",
      server_error: "An error occurred during rendering. Please try again.",
      network: "Could not reach the server. Check your connection and try again."
    } as Record<string, string>
  },
  ar: {
    title: "أرورا فيت",
    subtitle: "استوديو التجسيد النسائي",
    uploadBtn: "رفع القطعة الأساسية",
    layerBtn: "إضافة قطعة ثانوية",
    generate: "تجسيد الهيكل",
    settings: "أبعاد الجسم (أنثوي)",
    studio: "الاستوديو الافتراضي",
    chest: "بروز الصدر",
    shoulders: "عرض الكتفين",
    waist: "تخصير الخصر",
    fit: "نوع القالب",
    color: "لون الملابس",
    customColor: "يدوي",
    lighting: "بيئة الإضاءة",
    sunlight: "ضوء الشمس",
    night: "إضاءة ليلية",
    office: "إضاءة مكتبية",
    studioMode: "إضاءة استوديو",
    download: "تصدير الصورة",
    reset: "إعادة ضبط",
    slim: "نحيف / صغير",
    athletic: "رياضي / متناسق",
    relaxed: "مريح / فضفاض",
    plus: "مقاس كبير / ممتلئ",
    ghostTech: "تقنية المانيكان الخفي",
    layeringTitle: "إعدادات الطبقات",
    layerUnder: "ارتداء تحت الأساسية",
    layerOver: "ارتداء فوق الأساسية",
    clearLayer: "إزالة الطبقة",
    primaryLoaded: "تم رفع القطعة الأساسية — اضغط للتغيير",
    primaryHint: "القطعة الأساسية اللي هتظهر على القالب الخفي",
    shoulderSub: "توسيع الكتفين",
    chestSub: "بروز الصدر",
    waistSub: "تخصير القماش",
    selectedColor: "اللون المختار",
    clearColor: "إلغاء اللون",
    source: "الأصل",
    layer: "الطبقة",
    result: "النتيجة",
    generating: "جارٍ التوليد...",
    creating: "جارٍ التجسيد الخفي...",
    emptyHint: "اختر صورة ملابسك ثم اضبط القالب واللون لمشاهدة الفوارق.",
    preparing: "جارٍ تجهيز الصورة...",
    footer: "مختبر أرورا فيت. محرك التفصيل الدقيق.",
    colors: { Black: "أسود", White: "أبيض", Red: "أحمر", Navy: "كحلي", Beige: "بيج", Pink: "وردي", Emerald: "زمردي" } as Record<string, string>,
    errors: {
      invalid_input: "الطلب غير صالح. حاول مرة أخرى.",
      invalid_image: "صيغة الصورة غير مدعومة. استخدم صورة JPG أو PNG أو WebP.",
      unreadable_image: "تعذّر قراءة الصورة. استخدم صورة JPG أو PNG أو WebP.",
      image_too_large: "الصورة كبيرة جداً. استخدم صورة أصغر.",
      rate_limited: "طلبات كثيرة في وقت قصير. انتظر دقيقة ثم حاول مرة أخرى.",
      not_configured: "السيرفر غير مُعد بعد (مفتاح Gemini غير موجود).",
      no_image_returned: "الذكاء الاصطناعي لم يرجّع صورة. جرّب صورة أخرى أو إعدادات مختلفة.",
      server_error: "حدث خطأ أثناء التجسيد. يرجى المحاولة مرة أخرى.",
      network: "تعذّر الوصول للسيرفر. تأكد من الاتصال وحاول مرة أخرى."
    } as Record<string, string>
  }
};

export const Icons = {
  Upload: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  Layer: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  Render: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Settings: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  ),
  Download: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  Palette: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  )
};
