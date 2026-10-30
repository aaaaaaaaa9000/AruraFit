import { findGarmentType, type Measure } from '../garmentTypes';

export const FIT_TYPES = ['slim', 'athletic', 'relaxed', 'plus'] as const;
export const LIGHTING_MODES = ['sunlight', 'night', 'office', 'studio'] as const;
export const LAYER_POSITIONS = ['under', 'over'] as const;
export const QUALITIES = ['standard', 'high'] as const;
export const DISPLAY_STYLES = ['ghost', 'flatlay'] as const;
export const ASPECT_RATIOS = ['3:4', '1:1', '4:5', '9:16'] as const;
export const ANGLES = ['front', 'back', 'side'] as const;
const BACKGROUND_PRESETS: Record<string, string> = { white: 'pure white (#FFFFFF)', gray: 'light gray (#EDEDED)' };
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
  aspectRatio: (typeof ASPECT_RATIOS)[number];
  background: string; // 'white' | 'gray' | '#rrggbb'
  garmentColor: string;
  measures: Record<Measure, number>;
  angle: (typeof ANGLES)[number];
  // Side view inferred from the front (and back) renders because no side photo was given
  approximate: boolean;
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
    aspectRatio: oneOf(ASPECT_RATIOS, raw?.aspectRatio, '3:4'),
    background:
      typeof raw?.background === 'string' && (raw.background in BACKGROUND_PRESETS || /^#[0-9a-fA-F]{6}$/.test(raw.background))
        ? raw.background
        : 'white',
    garmentColor: isAllowedColor(profile.garmentColor) ? profile.garmentColor : '',
    measures: {
      shoulders: clampPercent(profile.shoulders),
      chest: clampPercent(profile.chest),
      waist: clampPercent(profile.waist),
      hips: clampPercent(profile.hips),
    },
    angle: oneOf(ANGLES, raw?.angle, 'front'),
    approximate: raw?.approximate === true,
  };
}

// intro replaces the opening instruction (used for back/side views); extra sections are appended
export function buildPrompt(s: RenderSettings, hasLayer: boolean, intro?: string, extra: string[] = []): string {
  const garment = findGarmentType(s.garmentType);
  const measures = garment.measures.map((m) => `  - ${MEASURE_LINES[m](s.measures[m])}`).join('\n');
  const flatlay = s.displayStyle === 'flatlay';
  const background = BACKGROUND_PRESETS[s.background] ?? `solid color ${s.background}`;
  const framing =
    s.aspectRatio === '9:16'
      ? 'Tall vertical frame: center the garment with extra space above and below.'
      : s.aspectRatio === '1:1'
        ? 'Square frame: center the garment with balanced margins on all sides.'
        : 'Garment centered with comfortable margins.';

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
    intro ??
      `Create a professional e-commerce ${flatlay ? 'flat-lay' : '"ghost mannequin"'} product photo of the women's garment in the ${hasLayer ? 'first ' : ''}image.`,
    `GARMENT TYPE: ${garment.en}. ${garment.guidance}
  The photo is the source of truth: if anything in this description does not match the photo, follow the photo.`,
    `FIDELITY (highest priority):
  - This is a re-photograph of the provided product, not a new design. Reproduce exactly the same garment as in the photo. Keep every design detail identical: color, print/pattern scale and placement, lace and embroidery motifs, sequins, beads, stones, trims, ruffles, bows, buttons, zips, straps and hardware, seams and logos.
  - Sheer, lace and mesh fabrics keep the same transparency.
  - Do not add, remove, simplify or invent anything: no extra jewelry, chains, straps, layers or accessories.
  - Remove any watermark, store logo, website address or text overlaid on the photo (often in the corners); it is not part of the garment and must not appear in the result. Labels, logos and prints that are physically on the garment stay.
  - Keep the original length and cut.`,
    ...(flatlay ? flatlaySections : ghostSections),
    s.garmentColor
      ? `COLOR CHANGE: Change only the main fabric base color to ${s.garmentColor}. Keep the print, lace pattern, embroidery and embellishment designs unchanged, and keep the fabric texture, sheen, shadows and highlights.`
      : 'COLOR: Keep the exact original colors; do not desaturate or shift them.',
    `LIGHTING: ${LIGHTING_DESCRIPTIONS[s.lighting]}`,
    flatlay
      ? `BACKGROUND: Seamless ${background} surface with a very soft, even shadow under the garment. ${framing} Fully in frame.`
      : `BACKGROUND: Seamless ${background} studio background with a soft natural contact shadow. ${framing} Fully in frame.`,
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
  sections.push(...extra);
  return sections.join('\n\n');
}

// Back / side view that must match an already generated front render.
// Image order: [angle photo?] [front render] [back render?]
export function buildAnglePrompt(s: RenderSettings, hasPhoto: boolean, hasBackRef: boolean): string {
  const style = s.displayStyle === 'flatlay' ? 'flat-lay' : '"ghost mannequin"';
  const view = s.angle === 'back' ? 'BACK view' : 'three-quarter SIDE view';
  const frontIdx = hasPhoto ? 2 : 1;
  const intro = hasPhoto
    ? `Image 1 is a photo of the ${s.angle === 'back' ? 'back' : 'side'} of a women's garment. Image ${frontIdx} is the finished FRONT ${style} product photo of the same garment${
        hasBackRef ? `, and image ${frontIdx + 1} is its finished BACK view` : ''
      }. Create the matching ${view} ${style} product photo of this garment.`
    : `Image 1 is the finished FRONT ${style} product photo of a women's garment${
        hasBackRef ? ', and image 2 is its finished BACK view' : ''
      }. Create a ${view} ${style} product photo of the same garment, inferred from these views.`;
  const reference = `MATCH THE REFERENCE:
  - Same garment color, scale, invisible-body shape, lighting, background and framing as the FRONT image, so the photos look like one set.
  - ${
    hasPhoto
      ? `Reproduce the ${s.angle} design exactly from image 1 (fastenings, straps, cut-outs, seams, prints, lace).`
      : 'Do not invent details that are not visible in the reference views; keep unseen areas plain and consistent with them.'
  }`;
  return buildPrompt(s, false, intro, [reference]);
}

export const MAX_INSTRUCTION_CHARS = 300;

// Normalize a free-text edit request: single line, no control characters or quote fences, bounded length
export function sanitizeInstruction(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/"{3,}/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_INSTRUCTION_CHARS);
}

// Apply the shop owner's text request to an existing product photo (one input image)
export function buildEditPrompt(instruction: string): string {
  return `Edit the provided e-commerce product photo according to this request from the shop owner (it may be written in Arabic):
"""${instruction}"""
Apply only what is asked. Keep everything else identical: the garment's design, print, lace, embellishments, colors, shape, size and framing, the lighting and the background, unless the request explicitly asks to change them.
The result must stay a clean product photo: no people, body parts, mannequin, added text or watermarks.`;
}

// Change only the base color of an already generated product photo (one input image)
export function buildRecolorPrompt(color: string): string {
  return `Edit the provided product photo. Change ONLY the main fabric base color of the garment to ${color}.
Keep everything else identical: the garment's shape, folds, volume, size, position and framing, the lighting and shadows, and the background.
Keep every design detail unchanged: print/pattern design, lace and embroidery motifs, embellishments, trims, hardware, labels and transparency. Prints and lace keep their design; only the base fabric hue and saturation shift.
Do not add, remove or move anything.`;
}
