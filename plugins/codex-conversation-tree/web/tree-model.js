export function treeRootId(id, catalog) {
  const byId = new Map(catalog.map(thread => [thread.id, thread]));
  let current = byId.get(id);
  const seen = new Set();
  while (current?.forkedFromId && byId.has(current.forkedFromId) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.forkedFromId);
  }
  return current?.id || id;
}

export function projectForkTurns(parentTurns, childTurns, savedAnchor) {
  let common = 0;
  while (common < parentTurns.length && common < childTurns.length &&
    parentTurns[common].id === childTurns[common].id) common++;
  const shared = new Set(childTurns.map(turn => turn.id));
  const anchorId = savedAnchor && parentTurns.some(turn => turn.id === savedAnchor)
    ? savedAnchor
    : common ? parentTurns[common - 1].id
      : [...parentTurns].reverse().find(turn => shared.has(turn.id))?.id ?? null;
  if (!anchorId) return { anchorId: null, turns: childTurns, inherited: 0 };
  const anchorIndex = parentTurns.findIndex(turn => turn.id === anchorId);
  const inheritedIds = new Set(parentTurns.slice(0, anchorIndex + 1).map(turn => turn.id));
  const turns = childTurns.filter(turn => !inheritedIds.has(turn.id));
  return { anchorId, turns, inherited: childTurns.length - turns.length };
}
