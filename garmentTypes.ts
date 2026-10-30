// Garment types, mirroring the product types on the Shop Up store.
// Shared by the UI (labels, which sliders to show) and the server (prompt guidance).

export type Measure = 'shoulders' | 'chest' | 'waist' | 'hips';

export interface GarmentType {
  id: string;
  ar: string;
  en: string;
  // Body measurements that affect this garment (others are hidden in the UI and left out of the prompt)
  measures: Measure[];
  // Loose garments keep their own cut; the body profile must not tighten them
  loose?: boolean;
  guidance: string;
}

export const GARMENT_TYPES: GarmentType[] = [
  {
    id: 'general',
    ar: 'عام (غير محدد)',
    en: 'General (unspecified)',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    guidance: 'Women\'s garment. Infer the garment category from the photo and show it as worn.',
  },
  {
    id: 'bra',
    ar: 'براهات',
    en: 'Bras',
    measures: ['shoulders', 'chest'],
    guidance:
      'Bra only. Show the cups with realistic 3D volume as if filled by an invisible bust, straps and band in their natural worn position. Frame the bust area.',
  },
  {
    id: 'underwear',
    ar: 'أندرات',
    en: 'Panties',
    measures: ['waist', 'hips'],
    guidance:
      'Panties / brief / thong only. Frame the hip area. Show the waistband and leg openings in a worn 3D shape; thin straps follow the invisible hips naturally.',
  },
  {
    id: 'lingerie',
    ar: 'لانجري',
    en: 'Lingerie',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    guidance:
      'Lingerie piece (nightdress, babydoll, chemise or lingerie set). Keep the exact length. Tulle, chiffon and lace stay translucent with a soft natural drape, never stiff. If a matching panty is part of the set, show it in place.',
  },
  {
    id: 'mesh_lingerie',
    ar: 'لانجري شبك',
    en: 'Mesh lingerie',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    guidance:
      'Fishnet / mesh lingerie (bodystocking, mesh dress or stockings). Keep the exact net size and pattern with open holes showing the white background through them. Do not add any lining or solid fabric.',
  },
  {
    id: 'costume_lingerie',
    ar: 'لانجيرى تنكرى',
    en: 'Costume lingerie',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    guidance:
      'Costume / role-play lingerie set. Include every piece and accessory shown in the photo (for example collar, apron, cuffs, headpiece), each in its worn position. Do not add or drop pieces.',
  },
  {
    id: 'swim_bodysuit',
    ar: 'كاش مايوه',
    en: 'Lingerie bodysuit',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    guidance: 'One-piece lingerie bodysuit / teddy, fitted from bust to hips with the leg openings cut exactly as shown.',
  },
  {
    id: 'bodysuit',
    ar: 'كاشات حريمي',
    en: 'Bodysuits & tops',
    measures: ['shoulders', 'chest', 'waist'],
    guidance: 'Women\'s fitted bodysuit / top. Keep the neckline, sleeve length and hem exactly as shown.',
  },
  {
    id: 'swimwear',
    ar: 'مايوهات',
    en: 'Swimwear',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    guidance:
      'Swimsuit: one-piece or bikini exactly as in the photo. Show all pieces together as worn, top above bottom, with matching 3D volume.',
  },
  {
    id: 'modest_swimwear',
    ar: 'مايوه محجبات',
    en: 'Modest swimwear',
    measures: ['shoulders', 'chest', 'hips'],
    loose: true,
    guidance:
      'Modest swimwear / burkini: long tunic top over full-length leggings, plus the hood or cap if included. Show the full length. The tunic keeps its loose cut.',
  },
  {
    id: 'belly_dance',
    ar: 'بدلة رقص',
    en: 'Belly-dance costume',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    guidance:
      'Belly-dance costume (top, hip belt and skirt or dress as shown). Reproduce every sequin, bead, coin, fringe and tassel precisely with their sparkle. Fringes hang naturally with gravity.',
  },
  {
    id: 'robe',
    ar: 'روب حريمى',
    en: 'Robes',
    measures: ['shoulders', 'chest'],
    loose: true,
    guidance:
      'Robe / dressing gown, possibly with a matching lingerie piece underneath. Show it open or belted exactly as in the photo, with the exact sleeve and body length and a flowing drape.',
  },
  {
    id: 'abaya',
    ar: 'عبايات حريمي',
    en: 'Abayas',
    measures: ['shoulders', 'chest'],
    loose: true,
    guidance:
      'Home abaya / kaftan: a full-length loose garment. Keep its straight or A-line cut with natural vertical folds. Never cinch the waist or make it fitted. Exact sleeve length.',
  },
  {
    id: 'pajamas',
    ar: 'بيجامات',
    en: 'Pajamas',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    loose: true,
    guidance: 'Pajama set: top and bottoms (pants or shorts) shown together as worn, top above bottoms, relaxed fit.',
  },
  {
    id: 'tracksuit',
    ar: 'ترنجات حريمى',
    en: 'Tracksuits',
    measures: ['shoulders', 'chest', 'waist', 'hips'],
    loose: true,
    guidance:
      'Tracksuit set (3-4 pieces such as jacket, top and pants). Show every piece layered as worn: jacket open over the top, pants below.',
  },
  {
    id: 'bermuda',
    ar: 'برمودا',
    en: 'Bermuda shorts',
    measures: ['waist', 'hips'],
    guidance: 'Bermuda shorts only, knee length. Frame from waist to knees with the waistband, pockets and hem exactly as shown.',
  },
  {
    id: 'hot_shorts',
    ar: 'هوت شورت',
    en: 'Hot shorts',
    measures: ['waist', 'hips'],
    guidance: 'Very short shorts only. Frame the hip area with the waistband and leg hems exactly as shown.',
  },
];

export const DEFAULT_GARMENT_TYPE = 'general';

export function findGarmentType(id: unknown): GarmentType {
  return GARMENT_TYPES.find((g) => g.id === id) ?? GARMENT_TYPES[0];
}
