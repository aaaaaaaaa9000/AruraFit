
export type Language = 'en' | 'ar';

export interface BodyProfile {
  chest: number; // 0-100
  shoulders: number; // 0-100
  waist: number; // 0-100
  fitType: 'slim' | 'athletic' | 'relaxed' | 'plus';
  garmentColor?: string; // Hex or color name
}

export type LightingMode = 'sunlight' | 'night' | 'office' | 'studio';

export interface StudioConfig {
  lighting: LightingMode;
  layering?: string;
  is360Mode: boolean;
}

export interface RenderingResult {
  id: string;
  imageUrl: string;
  config: StudioConfig;
  profile: BodyProfile;
  timestamp: number;
}
