import { defaultGeminiClient } from '../utils/gemini-api';
import type { GeminiMessage } from '../utils/gemini-api/types';
import type { ModelRef } from '../utils/settings-manager';

export interface GenerateTextOptions {
  model?: string;
  modelRef?: ModelRef | null;
  referenceImages?: string[];
  signal?: AbortSignal;
}

export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {}
): Promise<string> {
  const content: GeminiMessage['content'] = [{ type: 'text', text: prompt }];

  for (const imageUrl of options.referenceImages || []) {
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
    });
  }

  const messages: GeminiMessage[] = [{ role: 'user', content }];
  let fullContent = '';

  await defaultGeminiClient.sendChat(
    messages,
    (accumulatedContent) => {
      fullContent = accumulatedContent;
    },
    options.signal,
    options.modelRef || options.model || undefined
  );

  return fullContent.trim();
}
