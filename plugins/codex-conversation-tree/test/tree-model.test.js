import test from 'node:test';
import assert from 'node:assert/strict';
import { treeRootId, projectForkTurns } from '../web/tree-model.js';
import { completeCatalog } from '../server/catalog.js';

test('catalog restores a completed fork and two empty forks under their parent', async () => {
  const branches = {
    answered: { parentThreadId: 'root', sourceTurnId: 't2' },
    emptyA: { parentThreadId: 'root', sourceTurnId: 't3' },
    emptyB: { parentThreadId: 'root', sourceTurnId: 't4' }
  };
  const listed = [
    { id: 'root', forkedFromId: null },
    { id: 'answered', sessionId: 'answered', forkedFromId: null }
  ];
  const catalog = await completeCatalog(listed, branches, async id => ({ id, sessionId: id, forkedFromId: 'root' }));
  assert.deepEqual(catalog.map(t => [t.id, t.forkedFromId]), [
    ['root', null], ['answered', 'root'], ['emptyA', 'root'], ['emptyB', 'root']
  ]);
});

test('a fork remains in its parent tree when its own sessionId looks like a root', () => {
  const catalog = [
    { id: 'root', sessionId: 'root', forkedFromId: null },
    { id: 'child', sessionId: 'child', forkedFromId: 'root' },
    { id: 'grandchild', sessionId: 'grandchild', forkedFromId: 'child' }
  ];
  assert.equal(treeRootId('grandchild', catalog), 'root');
  assert.deepEqual(catalog.filter(thread => treeRootId(thread.id, catalog) === 'root').map(t => t.id),
    ['root', 'child', 'grandchild']);
});

test('an empty fork appears at its source Turn without repeating inherited cards', () => {
  const parent = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];
  const empty = projectForkTurns(parent, parent.slice(0, 3), 't3');
  assert.equal(empty.anchorId, 't3');
  assert.deepEqual(empty.turns, []);
  const answered = projectForkTurns(parent, [...parent.slice(0, 3), { id: 'new-turn' }], 't3');
  assert.deepEqual(answered.turns, [{ id: 'new-turn' }]);
  const compacted = projectForkTurns(parent, [{ id: 't1' }, { id: 't3' }], 't3');
  assert.equal(compacted.anchorId, 't3');
  assert.deepEqual(compacted.turns, []);
});
