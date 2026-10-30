import { BodyProfile, StudioConfig } from "../types";

export class GeminiService {
  static async renderGhostMannequin(
    primaryImage: string,
    profile: BodyProfile,
    studio: StudioConfig,
    layerImage?: string,
    layerPosition: 'under' | 'over' = 'under'
  ): Promise<string> {
    const response = await fetch('/api/render', {
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

    if (!response.ok) {
      let errorMessage = `Server error (${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        if (response.statusText) {
          errorMessage = response.statusText;
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.imageUrl) {
      throw new Error("API returned no image.");
    }

    return data.imageUrl;
  }
}
