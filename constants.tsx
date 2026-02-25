
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
    compare: "Side-by-side Comparison",
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
    clearLayer: "Remove Layer"
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
    compare: "مقارنة حية",
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
    clearLayer: "إزالة الطبقة"
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
  Palette: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  )
};
