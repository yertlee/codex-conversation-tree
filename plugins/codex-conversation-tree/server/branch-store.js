import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const dataFile = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'conversation-tree', 'branches.json');

export async function readBranches(file = dataFile) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export async function saveBranch(childId, record, file = dataFile) {
  const branches = await readBranches(file);
  branches[childId] = record;
  await mkdir(join(file, '..'), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(branches, null, 2), 'utf8');
  await rename(temporary, file);
  return branches[childId];
}
