import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

// Load environment variables from .env.local and .env
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Allow large image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Google Gen AI client with required User-Agent
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper to extract base64 data and MIME type safely
function parseImageData(dataUri: string): { mimeType: string; data: string } {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (matches) {
    return {
      mimeType: matches[1],
      data: matches[2],
    };
  }
  const commaIdx = dataUri.indexOf(',');
  if (commaIdx !== -1) {
    return {
      mimeType: 'image/jpeg',
      data: dataUri.slice(commaIdx + 1),
    };
  }
  return {
    mimeType: 'image/jpeg',
    data: dataUri,
  };
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(apiKey),
  });
});

// API endpoint for Ghost Mannequin rendering
app.post('/api/render', async (req, res) => {
  try {
    const { primaryImage, profile, studio, layerImage, layerPosition = 'under' } = req.body;

    if (!primaryImage) {
      return res.status(400).json({ error: 'Primary garment image is required.' });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Gemini API key is not configured on the server. Please check your Settings > Secrets panel.',
      });
    }

    // Silhouette definitions
    let fitDescription = '';
    switch (profile?.fitType) {
      case 'slim':
        fitDescription =
          "FEMININE SLIM FIT: A slender female silhouette. The garment should tightly hug a petite female frame, emphasizing a high waist and narrow shoulders. Very delicate fabric tension.";
        break;
      case 'athletic':
        fitDescription =
          "FEMININE ATHLETIC/HOURGLASS FIT: A toned female physique with a clear V-taper to the waist and slightly broader, defined feminine shoulders. Strong bust definition and a cinched waistline.";
        break;
      case 'relaxed':
        fitDescription =
          "FEMININE OVERSIZED/BOXY FIT: Modern oversized women's aesthetic. The garment should drape loosely over a female frame, appearing stylishly large with soft, voluminous folds.";
        break;
      case 'plus':
        fitDescription =
          "FEMININE PLUS SIZE / FULL FIGURE: A voluptuous female silhouette with realistic fuller curves. Emphasize a broader hip-to-waist ratio, a more prominent bust area, and a softer, rounded torso. Realistic stretching appropriate for plus-size garments.";
        break;
      default:
        fitDescription =
          "FEMININE ATHLETIC/HOURGLASS FIT: A toned female physique with a clear V-taper to the waist and slightly broader, defined feminine shoulders. Strong bust definition and a cinched waistline.";
    }

    // Color instruction
    const colorInstruction = profile?.garmentColor
      ? `RECOLOR MANDATE: Change the primary garment's color strictly to ${profile.garmentColor}. Maintain all fabric textures, shadows, and highlights but shift the base hue and saturation to match ${profile.garmentColor} exactly.`
      : '';

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
      - Shoulder Breadth: ${profile?.shoulders ?? 50}% female scale.
      - Bust/Chest Volume: ${profile?.chest ?? 50}% scale (emphasize 3D female bust curve).
      - Waist Taper: ${profile?.waist ?? 50}% scale (deep feminine waist curve).
      
      LIGHTING & ENVIRONMENT:
      - Lighting: ${studio?.lighting ?? 'sunlight'} professional fashion photography lighting.
      - Background: Clean minimalist white studio.
      - Cleanup: Remove all hangers, original background artifacts, and any visible mannequin parts.
    `;

    if (layerImage) {
      prompt += `
      COMPOSITE LAYERING:
      - Integrate second women's garment ${String(layerPosition).toUpperCase()} the primary one.
      - Both must adhere to the same female silhouette and interact physically.
      `;
    }

    const primaryParsed = parseImageData(primaryImage);
    const parts: any[] = [
      {
        inlineData: {
          data: primaryParsed.data,
          mimeType: primaryParsed.mimeType || 'image/jpeg',
        },
      },
    ];

    if (layerImage) {
      const layerParsed = parseImageData(layerImage);
      parts.push({
        inlineData: {
          data: layerParsed.data,
          mimeType: layerParsed.mimeType || 'image/jpeg',
        },
      });
    }

    parts.push({ text: prompt });

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: '3:4',
          },
        },
      });
    } catch (primaryErr: any) {
      console.warn('Initial model attempt note:', primaryErr?.message || primaryErr);
      // Fallback to gemini-3.1-flash-lite-image if model not found or unavailable
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: '3:4',
          },
        },
      });
    }

    let imageUrl = '';
    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/jpeg';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }
      if (imageUrl) break;
    }

    if (!imageUrl) {
      return res.status(500).json({ error: 'Gemini returned no image content.' });
    }

    return res.json({ imageUrl });
  } catch (error: any) {
    console.error('Server rendering error:', error);
    return res.status(500).json({
      error: error?.message || 'An error occurred during ghost mannequin rendering.',
    });
  }
});

// Production vs Development setup
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
