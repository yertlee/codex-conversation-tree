import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { CodexClient } from './codex-client.js';
import { readBranches, saveBranch } from './branch-store.js';
import { completeCatalog } from './catalog.js';
import { projectTurns } from './projection.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const uiUri = 'ui://codex-conversation-tree/v4.html';
const codex = new CodexClient();
const server = new McpServer({ name: 'codex-conversation-tree', version: '0.3.3' });
const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const activities = new Map();
const approvals = new Map();

function activity(threadId, turnId) {
  const key = `${threadId}:${turnId}`;
  if (!activities.has(key)) activities.set(key, { threadId, turnId, status: 'inProgress', seq: 0, events: [] });
  return activities.get(key);
}
function append(threadId, turnId, method, params) {
  if (!threadId || !turnId) return;
  const run = activity(threadId, turnId);
  run.events.push({ seq: ++run.seq, method, params });
  if (run.events.length > 500) run.events.shift();
  if (method === 'turn/completed') run.status = params.turn?.status ?? 'completed';
}
codex.on('notification', ({ method, params = {} }) => {
  if (method === 'serverRequest/resolved') approvals.delete(String(params.requestId));
  append(params.threadId, params.turnId ?? params.turn?.id, method, params);
});
codex.on('serverRequest', request => {
  approvals.set(String(request.id), request);
  append(request.params?.threadId, request.params?.turnId, 'approval/requested', {
    requestId: request.id, method: request.method, ...request.params
  });
});

registerAppResource(server, 'conversation-tree-ui', uiUri, {}, async () => ({
  contents: [{
    uri: uiUri,
    mimeType: RESOURCE_MIME_TYPE,
    text: readFileSync(join(root, 'web', 'index.html'), 'utf8').replace('/* BUNDLE */', () => readFileSync(join(root, 'web', 'bundle.js'), 'utf8'))
  }]
}));

registerAppTool(server, 'list_conversations', {
  title: 'List Codex conversations',
  description: 'List local Codex conversations available to the current app-server.',
  inputSchema: { limit: z.number().int().min(1).max(100).default(30) },
  _meta: { ui: { resourceUri: uiUri }, 'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } },
  annotations: { readOnlyHint: true }
}, async ({ limit }) => {
  const result = await codex.call('thread/list', {
    limit, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'appServer']
  });
  const branches = await readBranches();
  const threads = await completeCatalog(result.data ?? [], branches, async threadId =>
    (await codex.call('thread/read', { threadId })).thread);
  return reply({ threads, nextCursor: result.nextCursor ?? null, branches });
});

registerAppTool(server, 'get_conversation_tree', {
  title: 'Read a conversation tree',
  description: 'Read completed turns from one Codex conversation, including its parent fork identity.',
  inputSchema: { threadId: z.string().min(1), limit: z.number().int().min(1).max(100).default(50), cursor: z.string().optional() },
  _meta: {},
  annotations: { readOnlyHint: true }
}, async ({ threadId, limit, cursor }) => {
  const [threadResult, turnsResult] = await Promise.all([
    codex.call('thread/read', { threadId }),
    codex.call('thread/turns/list', { threadId, limit, cursor, sortDirection: 'desc', itemsView: 'full' })
  ]);
  return reply({ thread: threadResult.thread, turns: projectTurns(threadId, turnsResult.data ?? []), nextCursor: turnsResult.nextCursor ?? null });
});

registerAppTool(server, 'fork_conversation_at_turn', {
  title: 'Fork Codex conversation',
  description: 'Create a new Codex conversation inheriting history through one completed turn. Only call after explicit user selection of the source conversation and turn.',
  inputSchema: { threadId: z.string().min(1), turnId: z.string().min(1) },
  _meta: {},
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
}, async ({ threadId, turnId }) => {
  let cursor;
  let selected;
  do {
    const page = await codex.call('thread/turns/list', { threadId, limit: 100, cursor, sortDirection: 'desc', itemsView: 'notLoaded' });
    selected = (page.data ?? []).find(turn => turn.id === turnId);
    cursor = page.nextCursor ?? null;
  } while (!selected && cursor);
  if (selected?.status !== 'completed') {
    throw new Error('Selected turn is unavailable or has not completed.');
  }
  const result = await codex.call('thread/fork', { threadId, lastTurnId: turnId, excludeTurns: true });
  let saveError = null;
  try {
    await saveBranch(result.thread.id, { parentThreadId: threadId, sourceTurnId: turnId, createdAt: new Date().toISOString() });
  } catch (error) { saveError = error.message; }
  return reply({ sourceThreadId: threadId, sourceTurnId: turnId, fork: result.thread, saveError });
});

registerAppTool(server, 'continue_conversation', {
  title: 'Continue Codex conversation',
  description: 'Append a new user Turn to the selected existing Codex conversation.',
  inputSchema: { threadId: z.string().min(1), text: z.string().trim().min(1) },
  _meta: {},
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
}, async ({ threadId, text }) => {
  await codex.call('thread/resume', { threadId, excludeTurns: true });
  const result = await codex.call('turn/start', { threadId, input: [{ type: 'text', text }] });
  activity(threadId, result.turn.id);
  return reply({ threadId, turnId: result.turn.id, status: result.turn.status });
});

registerAppTool(server, 'get_turn_activity', {
  title: 'Read Codex Turn activity',
  description: 'Read activity and pending approvals for a Turn started by this plugin.',
  inputSchema: { threadId: z.string().min(1), turnId: z.string().min(1), afterSeq: z.number().int().min(0).default(0) },
  _meta: {},
  annotations: { readOnlyHint: true }
}, async ({ threadId, turnId, afterSeq }) => {
  const run = activities.get(`${threadId}:${turnId}`);
  let recoveredStatus = 'unknown';
  if (!run) {
    const page = await codex.call('thread/turns/list', { threadId, limit: 20, sortDirection: 'desc', itemsView: 'notLoaded' });
    recoveredStatus = page.data?.find(turn => turn.id === turnId)?.status ?? 'unknown';
  }
  const pending = [...approvals.values()].filter(request => request.params?.threadId === threadId && request.params?.turnId === turnId)
    .map(request => ({ requestId: request.id, method: request.method, ...request.params }));
  return reply({ threadId, turnId, status: run?.status ?? recoveredStatus, seq: run?.seq ?? 0,
    events: run?.events.filter(event => event.seq > afterSeq) ?? [], pending });
});

registerAppTool(server, 'respond_to_approval', {
  title: 'Respond to Codex approval',
  description: 'Apply the user decision to one pending command or file-change approval.',
  inputSchema: { requestId: z.union([z.string(), z.number()]), threadId: z.string().min(1),
    decision: z.enum(['accept', 'decline', 'cancel']) },
  _meta: {},
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
}, async ({ requestId, threadId, decision }) => {
  const request = approvals.get(String(requestId));
  if (!request || request.params?.threadId !== threadId) throw new Error('Approval request is no longer pending.');
  if (!['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval'].includes(request.method)) {
    throw new Error(`This approval type is not supported yet: ${request.method}`);
  }
  const result=request.method==='item/permissions/requestApproval'
    ? { permissions: decision==='accept' ? request.params.permissions : {}, scope: 'turn' }
    : { decision };
  codex.respond(request.id, result);
  approvals.delete(String(requestId));
  return reply({ requestId, decision });
});

registerAppTool(server, 'interrupt_turn', {
  title: 'Interrupt Codex Turn',
  description: 'Stop the selected in-progress Turn.',
  inputSchema: { threadId: z.string().min(1), turnId: z.string().min(1) },
  _meta: {},
  annotations: { readOnlyHint: false, destructiveHint: false }
}, async ({ threadId, turnId }) => {
  await codex.call('turn/interrupt', { threadId, turnId });
  return reply({ threadId, turnId });
});

await server.connect(new StdioServerTransport());
process.on('SIGINT', () => { codex.close(); process.exit(0); });
