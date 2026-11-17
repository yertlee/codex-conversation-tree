// A match identifies a Turn by both IDs: inherited Turns can occur in several sessions.
export function searchTurns(source, query) {
  const needle = String(query ?? '').trim().normalize('NFKC').toLocaleLowerCase();
  if (!needle || !source?.threads) return [];
  const matches = [];
  for (const thread of source.threads) {
    for (const turn of thread.turns ?? []) {
      const content = `${turn.question ?? ''}\n${turn.answer ?? ''}`.normalize('NFKC').toLocaleLowerCase();
      if (content.includes(needle)) matches.push({ threadId: thread.id, turnId: turn.id, turn });
    }
  }
  return matches;
}

// Return the path from the root to the containing branch, excluding the root.
export function ancestorBranches(source, threadId) {
  const byId = new Map((source?.threads ?? []).map(thread => [thread.id, thread]));
  const path = [];
  const seen = new Set();
  let current = byId.get(threadId);
  while (current && current.id !== source.root && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.id);
    current = byId.get(current.parentId);
  }
  return current?.id === source.root ? path : [];
}

export function expandToTurn(source, match, expanded = new Set()) {
  return new Set([...expanded, ...ancestorBranches(source, match.threadId)]);
}

// Call after layout has been rebuilt with the matching branch expanded.
export function centerTurn(layout, match, viewport, scale, cardSize) {
  const node = layout.nodes.find(entry => entry.thread.id === match.threadId && entry.turn.id === match.turnId);
  if (!node) return null;
  return {
    panX: viewport.width / 2 - (node.x + cardSize.width / 2) * scale,
    panY: viewport.height / 2 - (node.y + cardSize.height / 2) * scale
  };
}

export function treeViewStorageKey(rootId) {
  return `tree-view:${rootId}`;
}

export function serializeTreeView({ expanded, scale, panX, panY }) {
  return JSON.stringify({ expanded: [...expanded], scale, panX, panY });
}

export function restoreTreeView(raw, source) {
  let stored;
  try { stored = JSON.parse(raw); } catch { return null; }
  if (!stored || !Array.isArray(stored.expanded) ||
    ![stored.scale, stored.panX, stored.panY].every(Number.isFinite)) return null;
  const validBranches = new Set((source?.threads ?? []).filter(thread => thread.id !== source.root).map(thread => thread.id));
  return {
    expanded: new Set(stored.expanded.filter(id => validBranches.has(id))),
    scale: Math.max(.28, Math.min(1.8, stored.scale)),
    panX: stored.panX,
    panY: stored.panY
  };
}
