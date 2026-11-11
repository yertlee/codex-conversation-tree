import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transform } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { projectTurns } from '../server/projection.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = process.env.CODEX_TREE_PLUGIN_ROOT || root;

test('project completed Codex turns into readable messages', () => {
  const turns = projectTurns('thread-1', [
    { id: 'turn-1', status: 'completed', items: [
      { type: 'userMessage', content: [{ type: 'text', text: '你好' }] },
      { type: 'agentMessage', text: '你好！' },
      { type: 'commandExecution', command: 'pwd' },
      { type: 'reasoning', content: [{ type: 'text', text: 'hidden' }] }
    ] },
    { id: 'turn-2', status: 'inProgress', items: [] }
  ]);
  assert.deepEqual(turns, [{ id: 'turn-1', threadId: 'thread-1', status: 'completed', messages: [
    { role: 'user', text: '你好' }, { role: 'assistant', text: '你好！' }
  ], tools: ['命令 · pwd'] }]);
});

test('MCP tools and UI resource connect to the local Codex app-server', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(pluginRoot, 'dist', 'server.js')], cwd: pluginRoot });
  const client = new Client({ name: 'codex-tree-smoke', version: '0.1.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [
      'continue_conversation', 'fork_conversation_at_turn', 'get_conversation_tree',
      'get_turn_activity', 'interrupt_turn', 'list_conversations', 'respond_to_approval'
    ]);
    const resource = await client.readResource({ uri: 'ui://codex-conversation-tree/v4.html' });
    assert.match(resource.contents[0].text, /Conversation Tree/);
    const html = resource.contents[0].text;
    assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    await transform(script, { loader: 'js', format: 'esm', target: 'es2022' });
    const listed = await client.callTool({ name: 'list_conversations', arguments: { limit: 1 } });
    assert.equal(listed.isError, undefined);
    assert.ok(Array.isArray(listed.structuredContent.threads));
    const first = listed.structuredContent.threads[0];
    if (first) {
      const tree = await client.callTool({ name: 'get_conversation_tree', arguments: { threadId: first.id, limit: 2 } });
      assert.equal(tree.isError, undefined);
      assert.equal(tree.structuredContent.thread.id, first.id);
      assert.ok(Array.isArray(tree.structuredContent.turns));
    }
  } finally {
    await client.close();
  }
});
