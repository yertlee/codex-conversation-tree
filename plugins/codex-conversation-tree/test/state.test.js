import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { CodexClient } from '../server/codex-client.js';
import { readBranches, saveBranch } from '../server/branch-store.js';

test('fork anchor records survive reload and preserve separate children', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'codex-tree-'));
  const file = join(dir, 'branches.json');
  try {
    await saveBranch('child-a', { parentThreadId: 'root', sourceTurnId: 'turn-2' }, file);
    await saveBranch('child-b', { parentThreadId: 'root', sourceTurnId: 'turn-3' }, file);
    assert.deepEqual(await readBranches(file), {
      'child-a': { parentThreadId: 'root', sourceTurnId: 'turn-2' },
      'child-b': { parentThreadId: 'root', sourceTurnId: 'turn-3' }
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('app-server responses, notifications and approval requests stay distinct', () => {
  const client = Object.create(CodexClient.prototype);
  EventEmitter.call(client);
  client.pending = new Map();
  let response, notification, request;
  client.pending.set(1, { resolve: value => { response = value; }, timer: setTimeout(() => {}, 5000) });
  client.on('notification', value => { notification = value; });
  client.on('serverRequest', value => { request = value; });
  client.handleMessage({ id: 1, result: { turn: { id: 't1' } } });
  client.handleMessage({ method: 'turn/completed', params: { turnId: 't1' } });
  client.handleMessage({ id: 42, method: 'item/commandExecution/requestApproval', params: { turnId: 't1' } });
  assert.equal(response.turn.id, 't1');
  assert.equal(notification.method, 'turn/completed');
  assert.equal(request.id, 42);
});
