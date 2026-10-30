export type Language = 'en' | 'ar';

export type FitType = 'slim' | 'athletic' | 'relaxed' | 'plus';

export interface BodyProfile {
  chest: number; // 1-100
  shoulders: number; // 1-100
  waist: number; // 1-100
  hips: number; // 1-100
  fitType: FitType;
  garmentColor?: string; // Named color from the palette or a #rrggbb hex
}

export type LightingMode = 'sunlight' | 'night' | 'office' | 'studio';

export interface StudioConfig {
  lighting: LightingMode;
}

export type LayerPosition = 'under' | 'over';

export type Quality = 'standard' | 'high';

export type DisplayStyle = 'ghost' | 'flatlay';

export type AspectRatio = '3:4' | '1:1' | '4:5' | '9:16';
