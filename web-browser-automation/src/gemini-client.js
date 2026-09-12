import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let cachedKeys = null;
let currentKeyIndex = 0;

function getApiKeys() {
  // Read dynamically so changes to process.env.GEMINI_API_KEY are reflected (especially in tests)
  const rawKeys = process.env.GEMINI_API_KEY || '';
  const parsedKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
  return parsedKeys;
}

/**
 * Returns a new GoogleGenAI client instance using the current active API key.
 */
export function getGeminiClient() {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is empty. Please set it in your .env file.");
  }
  // Clamp index in case the list length changed dynamically
  currentKeyIndex = currentKeyIndex % keys.length;
  const key = keys[currentKeyIndex];
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 30000 } });
}

/**
 * Rotates to the next API key in the list.
 * Returns true if rotated to a different key, false otherwise.
 */
export function rotateGeminiKey() {
  const keys = getApiKeys();
  if (keys.length <= 1) return false;
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  const nextKey = keys[currentKeyIndex];
  const maskedKey = nextKey.slice(0, 6) + '...' + nextKey.slice(-4);
  console.warn(`[Gemini Client] Rotated to API Key #${currentKeyIndex + 1}: ${maskedKey}`);
  return true;
}

/**
 * Gemini API client helper with key rotation and exponential backoff retry.
 * Takes a creator function that receives the client to run.
 */
export async function callGeminiWithRetry(apiCallCreator, maxRetries = 5, initialDelay = 1500) {
  if (process.env.USE_GEMINI_WEB === 'true') {
    console.log('[Gemini Client] USE_GEMINI_WEB is enabled. Routing via Playwright Web client...');
    const { callGeminiWeb } = await import('./gemini-web-client.js');
    
    const mockClient = {
      models: {
        generateContent: async (params) => {
          const systemInstruction = params.config?.systemInstruction || '';
          const contents = params.contents || '';
          const fullPrompt = `${systemInstruction}\n\n--- INPUT REQUEST ---\n${contents}\n\nRemember: Return ONLY valid JSON matching the requested schema. Do not output conversational text or markdown code fences like \`\`\`json.`;
          
          const resultText = await callGeminiWeb(fullPrompt);
          return {
            text: resultText
          };
        }
      }
    };
    
    return await apiCallCreator(mockClient);
  }

  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      const client = getGeminiClient();
      return await apiCallCreator(client);
    } catch (error) {
      attempt++;

      const isQuotaOrRateLimit =
        error.status === 429 ||
        error.code === 429 ||
        (error.message && (
          error.message.includes('429') ||
          error.message.includes('quota') ||
          error.message.includes('Rate limit') ||
          error.message.includes('RESOURCE_EXHAUSTED') ||
          error.message.includes('limit exceeded')
        ));

      // Attempt key rotation if it's a rate limit / quota error
      if (isQuotaOrRateLimit && rotateGeminiKey()) {
        console.warn(`[Gemini Client] Quota/Rate Limit hit. Rotated API key and retrying immediately (Attempt ${attempt}/${maxRetries})...`);
        continue;
      }

      // Otherwise determine if error is transient
      const isTransient =
        isQuotaOrRateLimit ||
        error.status === 503 ||
        error.code === 503 ||
        error.status === 408 ||
        error.code === 408 ||
        (error.message && (
          error.message.includes('503') ||
          error.message.includes('408') ||
          error.message.includes('UNAVAILABLE') ||
          error.message.includes('high demand') ||
          error.message.includes('overloaded') ||
          error.message.includes('temporary') ||
          error.message.toLowerCase().includes('timeout') ||
          error.message.toLowerCase().includes('deadline') ||
          error.message.toLowerCase().includes('abort')
        ));

      if (isTransient && attempt < maxRetries) {
        console.warn(`[Gemini Client] Transient error encountered (Attempt ${attempt}/${maxRetries}): ${error.message || error}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      } else {
        console.error(`[Gemini Client] Permanent error or retries exhausted:`, error);
        throw error;
      }
    }
  }
}
