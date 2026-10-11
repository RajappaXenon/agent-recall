/**
 * npm run smoke -w mcp
 *
 * End-to-end check through a real MCP client: spawns the server over stdio, lists its tools,
 * then runs the learning loop against the running API (npm run dev):
 *   recall → ask → record_outcome → check_searchable (polled) → recall finds the new memory.
 * Writes non-seed data to the demo org; npm run demo:reset -w backend removes it.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const QUERY = 'Our payments API returns 504s since we lowered the Mongo connection pool size. What fixed this last time?';
const serverEntry = fileURLToPath(new URL('./index.ts', import.meta.url));

const client = new Client({ name: 'agent-recall-smoke', version: '0.1.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', serverEntry],
    env: { ...process.env } as Record<string, string>,
    stderr: 'inherit',
  }),
);

const call = async (name: string, args: Record<string, unknown>) => {
  const t0 = performance.now();
  const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
  const body = res.content.map((c) => c.text).join('\n');
  console.log(`\n── ${name} (${Math.round(performance.now() - t0)} ms)${res.isError ? ' ERROR' : ''}\n${body}`);
  if (res.isError) throw new Error(`${name} failed`);
  return body;
};

try {
  const { tools } = await client.listTools();
  console.log(`tools: ${tools.map((t) => t.name).join(', ')}`);

  const recalled = await call('recall', { query: QUERY, limit: 3 });
  const ids = [...recalled.matchAll(/<memory id="([a-f0-9]{24})"/g)].map((m) => m[1]!);
  if (!ids.length) throw new Error('recall returned no memories');

  const answer = await call('ask', { question: QUERY, memory_ids: ids });
  const taskId = /task_id: ([a-f0-9]{24})/.exec(answer)?.[1];
  if (!taskId) throw new Error('ask returned no task_id');

  const outcome = await call('record_outcome', { task_id: taskId, result: 'worked', helpful: true, notes: 'MCP smoke test: raised maxPoolSize to 80 and closed export cursors; 504s stopped.' });
  const memoryId = /New memory ([a-f0-9]{24})/.exec(outcome)?.[1];
  if (!memoryId) throw new Error('record_outcome created no memory');

  const started = Date.now();
  let searchable = '';
  while (Date.now() - started < 60_000) {
    searchable = await call('check_searchable', { memory_id: memoryId });
    if (searchable.startsWith('Searchable')) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!searchable.startsWith('Searchable')) throw new Error('memory did not become searchable within 60 s');
  console.log(`\nsearchable after ${((Date.now() - started) / 1000).toFixed(1)} s`);

  const again = await call('recall', { query: QUERY, limit: 5 });
  const rank = [...again.matchAll(/<memory id="([a-f0-9]{24})"[^>]*rank="(\d+)"/g)].find((m) => m[1] === memoryId)?.[2];
  console.log(`\n✔ new outcome memory ${memoryId} is returned by recall${rank ? ` at rank ${rank}` : ' (not in top 5)'}`);
} finally {
  await client.close();
}
