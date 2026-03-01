import { apiFetch } from '../api';

export type LLMProvider = 'openai' | 'anthropic' | 'gemini';

export class LLMBridge {
  provider: LLMProvider = 'anthropic';
  model = '';

  /** Send a chat message and get a response from the LLM */
  async chat(prompt: string, context: string): Promise<string | null> {
    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt, context }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const data = await res.json() as { response: string };
        return data.response || null;
      }

      if (res.status !== 503) {
        console.warn('[LLMBridge] Server returned', res.status);
      }
    } catch (err) {
      console.warn('[LLMBridge] Server call failed:', err);
    }

    return null;
  }
}
