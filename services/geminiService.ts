
import { GoogleGenAI } from "@google/genai";
import { BodyProfile, StudioConfig } from "../types";

export class GeminiService {
  static async renderGhostMannequin(
    primaryImage: string,
    profile: BodyProfile,
    studio: StudioConfig,
    layerImage?: string,
    layerPosition: 'under' | 'over' = 'under'
  ): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Silhouette definitions
    let fitDescription = "";
    switch(profile.fitType) {
      case 'slim':
        fitDescription = "FEMININE SLIM FIT: A slender female silhouette. The garment should tightly hug a petite female frame, emphasizing a high waist and narrow shoulders. Very delicate fabric tension.";
        break;
      case 'athletic':
        fitDescription = "FEMININE ATHLETIC/HOURGLASS FIT: A toned female physique with a clear V-taper to the waist and slightly broader, defined feminine shoulders. Strong bust definition and a cinched waistline.";
        break;
      case 'relaxed':
        fitDescription = "FEMININE OVERSIZED/BOXY FIT: Modern oversized women's aesthetic. The garment should drape loosely over a female frame, appearing stylishly large with soft, voluminous folds.";
        break;
      case 'plus':
        fitDescription = "FEMININE PLUS SIZE / FULL FIGURE: A voluptuous female silhouette with realistic fuller curves. Emphasize a broader hip-to-waist ratio, a more prominent bust area, and a softer, rounded torso. Realistic stretching appropriate for plus-size garments.";
        break;
    }

    // Color instruction
    const colorInstruction = profile.garmentColor 
      ? `RECOLOR MANDATE: Change the primary garment's color strictly to ${profile.garmentColor}. Maintain all fabric textures, shadows, and highlights but shift the base hue and saturation to match ${profile.garmentColor} exactly.`
      : "";

    let prompt = `
      ULTRA-STRICT GHOST MANNEQUIN RENDER - WOMEN'S FASHION ONLY.
      
      CORE MANDATE:
      - 100% INVISIBLE FEMALE MODEL: Render the garment as if worn by an invisible woman.
      - SILHOUETTE: Must be EXCLUSIVELY FEMALE (waist-to-hip ratio, bust protrusion, feminine shoulder slope).
      - NO HUMAN TRACES: Delete all skin, hands, feet, neck, or face. Total phantom effect.
      - HOLLOW 3D SHELL: Show internal collar labels and inner back fabric through the openings.
      
      ${colorInstruction}

      SILHOUETTE SPECIFICATIONS (EXAGGERATED FEMININE FORM):
      - PROFILE: ${fitDescription}
      - Shoulder Breadth: ${profile.shoulders}% female scale.
      - Bust/Chest Volume: ${profile.chest}% scale (emphasize 3D female bust curve).
      - Waist Taper: ${profile.waist}% scale (deep feminine waist curve).
      
      LIGHTING & ENVIRONMENT:
      - Lighting: ${studio.lighting} professional fashion photography lighting.
      - Background: Clean minimalist white studio.
      - Cleanup: Remove all hangers, original background artifacts, and any visible mannequin parts.
    `;

    if (layerImage) {
      prompt += `
      COMPOSITE LAYERING:
      - Integrate second women's garment ${layerPosition.toUpperCase()} the primary one.
      - Both must adhere to the same female silhouette and interact physically.
      `;
    }

    try {
      const parts: any[] = [
        {
          inlineData: {
            data: primaryImage.split(',')[1],
            mimeType: 'image/jpeg',
          },
        }
      ];

      if (layerImage) {
        parts.push({
          inlineData: {
            data: layerImage.split(',')[1],
            mimeType: 'image/jpeg',
          },
        });
      }

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "3:4"
          }
        },
      });

      let imageUrl = '';
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/jpeg;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (!imageUrl) throw new Error("API returned no image.");
      return imageUrl;
    } catch (error: any) {
      console.error("Rendering Error:", error);
      throw error;
    }
  }
}
