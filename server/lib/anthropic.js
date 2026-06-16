// AI code-editing wrapper around Claude for the Site Editor chat.
// Given the site's current HTML + a natural-language instruction, Claude
// returns the FULL updated HTML document. We stream the text back so the
// editor can refresh its live preview as the code is written.
import Anthropic from '@anthropic-ai/sdk';
import { anthropic as anthropicCfg } from './config.js';

let client = null;
function getClient() {
  if (!anthropicCfg.live) return null;
  if (!client) client = new Anthropic({ apiKey: anthropicCfg.apiKey });
  return client;
}

export function isAiEnabled() {
  return anthropicCfg.live;
}

const SYSTEM_PROMPT = `You are an elite front-end engineer editing a single self-contained HTML page for a local business website (the page already has inline <style> and any needed <script>).

RULES — follow exactly:
1. You will be given the CURRENT full HTML of the page and an edit instruction.
2. Apply ONLY the requested change while keeping everything else byte-for-byte identical.
3. Preserve the overall structure, design system, fonts, colors, and responsiveness. The site must stay mobile-consistent, desktop-consistent, and brand-consistent.
4. Keep the page fully self-contained (inline CSS/JS, no external build steps).
5. Never invent broken links or remove existing sections unless explicitly asked.
6. Output the COMPLETE updated HTML document and NOTHING else — no explanations, no markdown fences, no commentary. Start at <!DOCTYPE html> (or <html>) and end at </html>.`;

function buildUserContent(html, instruction, history = []) {
  const convo = (history || [])
    .filter((m) => m && m.role && m.content)
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'You previously' : 'User asked'}: ${m.content}`)
    .join('\n');

  return [
    convo ? `Recent conversation context:\n${convo}\n` : '',
    'CURRENT HTML:',
    '```html',
    html,
    '```',
    '',
    `EDIT INSTRUCTION: ${instruction}`,
    '',
    'Return the complete updated HTML document only.',
  ]
    .filter(Boolean)
    .join('\n');
}

// Strip accidental markdown fences if the model wraps output despite instructions.
export function cleanHtmlOutput(text) {
  let out = (text || '').trim();
  const fence = out.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) out = fence[1].trim();
  return out;
}

/**
 * Stream an AI edit. Calls onChunk(textDelta) as tokens arrive.
 * Returns the full accumulated text when done.
 */
export async function streamEdit({ html, instruction, history }, onChunk) {
  const c = getClient();
  if (!c) throw new Error('AI editor is not configured (missing ANTHROPIC_API_KEY).');

  const stream = await c.messages.stream({
    model: anthropicCfg.model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildUserContent(html, instruction, history) },
    ],
  });

  let full = '';
  stream.on('text', (delta) => {
    full += delta;
    if (onChunk) onChunk(delta);
  });

  await stream.finalMessage();
  return full;
}
