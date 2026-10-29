/** Test helper: a streamed Ollama /api/chat reply, one JSON object per line. */
export function ollamaStream(...chunks: string[]): Response {
  const lines = [...chunks.map((c) => JSON.stringify({ message: { role: 'assistant', content: c }, done: false })), JSON.stringify({ done: true })];
  return new Response(lines.join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}
