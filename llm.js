// Pluggable LLM client. Default: Ollama running open-source models locally (free).
// Any OpenAI-compatible server (LM Studio, vLLM, llama.cpp, Groq/OpenRouter free tiers) also works.

function extractJson(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON');
  return JSON.parse(s.slice(start, end + 1));
}

export function llmProvider() {
  return (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
}

export async function chatJSON(system, user, { timeout = 180_000 } = {}) {
  const provider = llmProvider();
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  if (provider === 'none') throw new Error('LLM disabled');

  if (provider === 'ollama') {
    const base = process.env.OLLAMA_URL || 'http://localhost:11434';
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
        stream: false,
        format: 'json',
        options: { temperature: 0.6, num_ctx: 8192 },
        messages,
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = await res.json();
    return { json: extractJson(data.message?.content || ''), model: data.model };
  }

  // OpenAI-compatible
  const base = (process.env.LLM_BASE_URL || 'http://localhost:1234/v1').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LLM_API_KEY}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'llama-3.1-8b-instruct',
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages,
    }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const data = await res.json();
  return { json: extractJson(data.choices?.[0]?.message?.content || ''), model: data.model };
}
