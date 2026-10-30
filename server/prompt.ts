import { findGarmentType, type Measure } from '../garmentTypes';

export const FIT_TYPES = ['slim', 'athletic', 'relaxed', 'plus'] as const;
export const LIGHTING_MODES = ['sunlight', 'night', 'office', 'studio'] as const;
export const LAYER_POSITIONS = ['under', 'over'] as const;
export const QUALITIES = ['standard', 'high'] as const;
export const DISPLAY_STYLES = ['ghost', 'flatlay'] as const;
const NAMED_COLORS = ['Black', 'White', 'Red', 'Navy', 'Beige', 'Pink', 'Emerald'];

const FIT_DESCRIPTIONS: Record<(typeof FIT_TYPES)[number], string> = {
  slim: 'Slim, petite female figure with narrow shoulders and a slender frame.',
  athletic: 'Balanced, toned hourglass female figure.',
  relaxed: 'Average female figure; the garment is worn relaxed with an easy, roomy drape.',
  plus: 'Full-figured plus-size female body with natural fuller curves at bust, waist and hips.',
};

const LIGHTING_DESCRIPTIONS: Record<(typeof LIGHTING_MODES)[number], string> = {
  studio: 'Soft, even studio lighting with neutral white balance and minimal shadows.',
  sunlight: 'Warm natural daylight, soft directional light as if from a large window, gentle shadows.',
  night: 'Warm evening ambience: lower-key warm light with deeper soft shadows and a subtle glow on the fabric.',
  office: 'Cool, crisp neutral daylight, bright and clean.',
};

const MEASURE_LINES: Record<Measure, (v: number) => string> = {
  shoulders: (v) => `Shoulder width: ${v}/100`,
  chest: (v) => `Bust volume: ${v}/100`,
  waist: (v) => `Waist definition: ${v}/100`,
  hips: (v) => `Hip curve: ${v}/100`,
};

export function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function isAllowedColor(value: unknown): value is string {
  return typeof value === 'string' && (NAMED_COLORS.includes(value) || /^#[0-9a-fA-F]{6}$/.test(value));
}

// Validated render settings; anything unknown falls back to a safe default
export interface RenderSettings {
  garmentType: string;
  displayStyle: (typeof DISPLAY_STYLES)[number];
  quality: (typeof QUALITIES)[number];
  fitType: (typeof FIT_TYPES)[number];
  lighting: (typeof LIGHTING_MODES)[number];
  layerPosition: (typeof LAYER_POSITIONS)[number];
  garmentColor: string;
  measures: Record<Measure, number>;
}

export function parseSettings(raw: any): RenderSettings {
  const profile = raw?.profile ?? {};
  return {
    garmentType: findGarmentType(raw?.garmentType).id,
    displayStyle: oneOf(DISPLAY_STYLES, raw?.displayStyle, 'ghost'),
    quality: oneOf(QUALITIES, raw?.quality, 'standard'),
    fitType: oneOf(FIT_TYPES, profile.fitType, 'athletic'),
    lighting: oneOf(LIGHTING_MODES, raw?.studio?.lighting, 'studio'),
    layerPosition: oneOf(LAYER_POSITIONS, raw?.layerPosition, 'under'),
    garmentColor: isAllowedColor(profile.garmentColor) ? profile.garmentColor : '',
    measures: {
      shoulders: clampPercent(profile.shoulders),
      chest: clampPercent(profile.chest),
      waist: clampPercent(profile.waist),
      hips: clampPercent(profile.hips),
    },
  };
}

export function buildPrompt(s: RenderSettings, hasLayer: boolean): string {
  const garment = findGarmentType(s.garmentType);
  const measures = garment.measures.map((m) => `  - ${MEASURE_LINES[m](s.measures[m])}`).join('\n');
  const flatlay = s.displayStyle === 'flatlay';

  const ghostSections = [
    `GHOST MANNEQUIN EFFECT:
  - The garment is shaped as if worn by an invisible woman: a hollow 3D form with natural volume and folds.
  - Give every piece clear, rounded 3D volume as if filled by the body: cups and bust are rounded, hips are curved, pant legs and sleeves are filled out, with soft shading that shows depth. Never lay the garment flat.
  - No skin, face, hands, legs or any body part. No mannequin, hanger, clips, hang tags or price stickers.
  - Where openings allow (neckline, armholes), show the inside back of the garment.`,
    `INVISIBLE BODY:
  - Figure: ${FIT_DESCRIPTIONS[s.fitType]}
${measures}${
      garment.loose
        ? '\n  - This garment is loose-fitting: the body only shows where the fabric naturally rests (shoulders, bust). Do not tighten it, cinch the waist or change its cut.'
        : ''
    }`,
  ];
  const flatlaySections = [
    `FLAT LAY:
  - The garment lies flat on the surface, photographed from directly above, neatly arranged, symmetrical and smoothed with no messy wrinkles.
  - Sleeves, straps and ties are arranged naturally and fully visible. Sets are arranged as an outfit (top above bottoms, pieces side by side) without hiding important details.
  - No body, mannequin, hanger, clips, hang tags, price stickers or props.`,
  ];

  const sections = [
    `Create a professional e-commerce ${flatlay ? 'flat-lay' : '"ghost mannequin"'} product photo of the women's garment in the ${hasLayer ? 'first ' : ''}image.`,
    `GARMENT TYPE: ${garment.en}. ${garment.guidance}
  The photo is the source of truth: if anything in this description does not match the photo, follow the photo.`,
    `FIDELITY (highest priority):
  - This is a re-photograph of the provided product, not a new design. Reproduce exactly the same garment as in the photo. Keep every design detail identical: color, print/pattern scale and placement, lace and embroidery motifs, sequins, beads, stones, trims, ruffles, bows, buttons, zips, straps and hardware, seams and logos.
  - Sheer, lace and mesh fabrics keep the same transparency.
  - Do not add, remove, simplify or invent anything: no extra jewelry, chains, straps, layers or accessories.
  - Keep the original length and cut.`,
    ...(flatlay ? flatlaySections : ghostSections),
    s.garmentColor
      ? `COLOR CHANGE: Change only the main fabric base color to ${s.garmentColor}. Keep the print, lace pattern, embroidery and embellishment designs unchanged, and keep the fabric texture, sheen, shadows and highlights.`
      : 'COLOR: Keep the exact original colors; do not desaturate or shift them.',
    `LIGHTING: ${LIGHTING_DESCRIPTIONS[s.lighting]}`,
    flatlay
      ? 'BACKGROUND: Seamless pure white surface with a very soft, even shadow under the garment. Garment centered with comfortable margins, fully in frame.'
      : 'BACKGROUND: Seamless pure white studio background with a soft natural contact shadow. Garment centered with comfortable margins, fully in frame.',
  ];

  if (hasLayer) {
    sections.push(
      flatlay
        ? `LAYERING:
  - The second image is another women's garment, laid ${s.layerPosition === 'under' ? 'UNDER' : 'OVER'} the first one as a styled outfit, partly overlapping so both stay recognizable.
  - Apply the same fidelity rules to both garments.`
        : `LAYERING:
  - The second image is another women's garment, worn ${s.layerPosition === 'under' ? 'UNDER' : 'OVER'} the first one on the same invisible body.
  - Apply the same fidelity rules to both garments; they must interact physically (overlaps, tucks, shadows).`
    );
  }
  return sections.join('\n\n');
}
