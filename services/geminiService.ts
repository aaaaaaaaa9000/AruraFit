import { BodyProfile, LayerPosition, StudioConfig } from "../types";

// Error carrying a code the UI can translate (codes come from server.ts → ErrorCode)
export class RenderError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const MAX_DIMENSION = 1536;

// Downscale large photos in the browser before upload: smaller payload, faster and cheaper render.
export async function prepareImage(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new RenderError('unreadable_image');
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new RenderError('unreadable_image');
  // White background so transparent PNGs don't turn black in JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.9);
}

export class GeminiService {
  static async renderGhostMannequin(
    primaryImage: string,
    profile: BodyProfile,
    studio: StudioConfig,
    layerImage?: string,
    layerPosition: LayerPosition = 'under'
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch('/api/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryImage,
          profile,
          studio,
          layerImage,
          layerPosition,
        }),
      });
    } catch {
      throw new RenderError('network');
    }

    // Error bodies may not be JSON (e.g. a proxy 502 page), so parse defensively
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new RenderError(data?.error || (response.status === 429 ? 'rate_limited' : 'server_error'));
    }
    if (!data?.imageUrl) {
      throw new RenderError('no_image_returned');
    }
    return data.imageUrl;
  }
}
