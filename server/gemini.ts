import { GoogleGenAI } from '@google/genai';
import { config } from './config';
import { buildPrompt, type RenderSettings } from './prompt';

export interface InputImage {
  mimeType: string;
  data: string; // base64
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  model: string;
}

// Failure with an error code the UI can translate (see constants.tsx → errors)
export class RenderFailure extends Error {
  constructor(public code: 'not_configured' | 'no_image_returned' | 'quota_exceeded' | 'server_error') {
    super(code);
  }
}

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: config.baseUrl ? { baseUrl: config.baseUrl } : undefined });
  }
  return aiClient;
}

async function callModel(model: string, parts: any[]) {
  return getAi().models.generateContent({
    model,
    contents: { parts },
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } },
  });
}

export async function generateImage(settings: RenderSettings, primary: InputImage, layer?: InputImage): Promise<GeneratedImage> {
  if (!config.apiKey) throw new RenderFailure('not_configured');

  const parts: any[] = [{ inlineData: primary }];
  if (layer) parts.push({ inlineData: layer });
  parts.push({ text: buildPrompt(settings, Boolean(layer)) });

  let model = settings.quality === 'high' ? config.proModel : config.model;
  try {
    let response;
    try {
      response = await callModel(model, parts);
    } catch (err: any) {
      if (!config.fallbackModel) throw err;
      console.warn(`Model ${model} failed (${err?.message || err}), retrying with ${config.fallbackModel}`);
      model = config.fallbackModel;
      response = await callModel(model, parts);
    }

    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return {
            buffer: Buffer.from(part.inlineData.data, 'base64'),
            mimeType: part.inlineData.mimeType || 'image/png',
            model,
          };
        }
      }
    }
    console.warn('Gemini returned no image. Finish reason:', response.candidates?.[0]?.finishReason);
    throw new RenderFailure('no_image_returned');
  } catch (error: any) {
    if (error instanceof RenderFailure) throw error;
    console.error('Render error:', error?.message || error);
    // Gemini answers 429 RESOURCE_EXHAUSTED when the project's spend cap or quota is reached
    const quota = error?.status === 429 || /RESOURCE_EXHAUSTED|spending cap|quota/i.test(String(error?.message));
    throw new RenderFailure(quota ? 'quota_exceeded' : 'server_error');
  }
}
