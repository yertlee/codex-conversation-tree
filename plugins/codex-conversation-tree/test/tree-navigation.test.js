import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchTurns, ancestorBranches, expandToTurn, centerTurn,
  treeViewStorageKey, serializeTreeView, restoreTreeView
} from '../web/tree-navigation.js';

const source = { root: 'root', threads: [
  { id: 'root', parentId: null, turns: [{ id: 'r1', question: '研究方案', answer: '可以这样做' }] },
  { id: 'branch', parentId: 'root', anchorId: 'r1', turns: [{ id: 'b1', question: '试试 RAG', answer: '检索增强生成' }] },
  { id: 'nested', parentId: 'branch', anchorId: 'b1', turns: [{ id: 'n1', question: '向量索引', answer: '选择 FAISS' }] }
] };

test('searches question and answer text across nested branches', () => {
  assert.deepEqual(searchTurns(source, 'ＲＡＧ').map(match => match.turnId), ['b1']);
  assert.deepEqual(searchTurns(source, 'faiss').map(match => match.turnId), ['n1']);
  assert.deepEqual(searchTurns(source, '  '), []);
});

test('opens only the ancestor path needed to reveal a matching Turn', () => {
  const match = searchTurns(source, 'FAISS')[0];
  assert.deepEqual(ancestorBranches(source, match.threadId), ['branch', 'nested']);
  assert.deepEqual([...expandToTurn(source, match, new Set(['other']))], ['other', 'branch', 'nested']);
  assert.deepEqual(ancestorBranches(source, 'missing'), []);
});

test('centers a visible Turn and reports when it is still folded', () => {
  const match = searchTurns(source, 'FAISS')[0];
  const layout = { nodes: [{ thread: source.threads[2], turn: source.threads[2].turns[0], x: 500, y: 200 }] };
  const position = centerTurn(layout, match, { width: 1000, height: 600 }, .8, { width: 286, height: 146 });
  assert.ok(Math.abs(position.panX + 14.4) < 1e-9);
  assert.ok(Math.abs(position.panY - 81.6) < 1e-9);
  assert.equal(centerTurn({ nodes: [] }, match, { width: 1000, height: 600 }, 1, { width: 286, height: 146 }), null);
});

test('restores only valid expanded branches and finite camera values', () => {
  const raw = serializeTreeView({ expanded: new Set(['branch', 'removed']), scale: 1.2, panX: 20, panY: -40 });
  assert.equal(treeViewStorageKey('root'), 'tree-view:root');
  assert.deepEqual(restoreTreeView(raw, source), { expanded: new Set(['branch']), scale: 1.2, panX: 20, panY: -40 });
  assert.equal(restoreTreeView('{', source), null);
  assert.equal(restoreTreeView('{"expanded":[],"scale":"1","panX":0,"panY":0}', source), null);
});
