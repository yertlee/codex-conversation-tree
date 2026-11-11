export async function completeCatalog(listed, branches, readThread) {
  const threads = listed.map(thread => ({
    ...thread, forkedFromId: branches[thread.id]?.parentThreadId ?? thread.forkedFromId
  }));
  const seen = new Set(threads.map(thread => thread.id));
  for (const [childId, record] of Object.entries(branches)) {
    if (seen.has(childId)) continue;
    try {
      const thread = await readThread(childId);
      threads.push({ ...thread, forkedFromId: record.parentThreadId });
      seen.add(childId);
    } catch { /* Missing or inaccessible forks remain out of the catalog. */ }
  }
  return threads;
}
