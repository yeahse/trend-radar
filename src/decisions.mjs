/**
 * 결정 기록 스토리지 — record.mjs(CLI)와 feedback.mjs(통계) 양쪽이 공유.
 * (둘이 서로 import하면 순환 참조가 되므로 여기서 분리)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, ensureDirs } from './store.mjs';
import { todayKST } from './util.mjs';

export const DECISIONS_LOG = path.join(DATA_DIR, 'decisions.jsonl');

export async function recordDecision({ term, status = 'made', note = '', url = '', views = null, date }) {
  await ensureDirs();
  const entry = {
    ts: new Date().toISOString(),
    date: date || todayKST(),
    term,
    status,
    note,
    url,
    views,
  };
  await fs.appendFile(DECISIONS_LOG, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

export async function loadDecisions() {
  try {
    const raw = await fs.readFile(DECISIONS_LOG, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function listDecisions(limit = 50) {
  const rows = await loadDecisions();
  return rows.slice(-limit).reverse();
}
