import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const REPORTS_DIR = path.join(ROOT, 'reports');

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

export async function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

/** 스냅샷 1건 추가 (JSONL 누적 → 추세 추적용) */
export async function appendSnapshot(snap) {
  await ensureDirs();
  const p = path.join(DATA_DIR, 'snapshot.jsonl');
  await fs.appendFile(p, JSON.stringify(snap) + '\n', 'utf8');
}

/** 최근 N일 스냅샷 로드 */
export async function loadSnapshots(days = 30) {
  await ensureDirs();
  const p = path.join(DATA_DIR, 'snapshot.jsonl');
  try {
    const raw = await fs.readFile(p, 'utf8');
    const cutoff = Date.now() - days * 86400000;
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter((s) => s && new Date(s.ts).getTime() >= cutoff);
  } catch {
    return [];
  }
}

/** 키워드별 과거 점수 이력 */
export async function historyMap(days = 30) {
  const snaps = await loadSnapshots(days);
  const map = new Map();
  for (const s of snaps) {
    // 스냅샷 스키마: run.mjs는 `watch` 배열에 저장한다 (옛 `items` 키는 쓰이지 않음)
    for (const item of s.watch || s.items || []) {
      const k = item.term.toLowerCase();
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ ts: s.ts, score: item.score, velocity: item.velocity });
    }
  }
  for (const v of map.values()) v.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return map;
}

/** CSV 내보내기 (엑셀/시트 바로 import) */
export async function writeCSV(items, fileName) {
  await ensureDirs();
  const cols = [
    'date', 'term', 'score', 'velocity', 'crossPlatform', 'supplyDeficit',
    'fit', 'redditHits', 'blueskyHits', 'wikiGrowth', 'ytUploads',
    'supplySource', 'supplyRecent', 'supplyTotal',
    'naverGrowth', 'naverLast7', 'demandShare', 'lowVolume',
    'sources', 'action', 'note', 'videoUrl', 'publishedAt',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [cols.join(',')];
  for (const it of items) {
    rows.push(cols.map((c) => esc(it[c])).join(','));
  }
  const p = path.join(DATA_DIR, fileName);
  await fs.writeFile(p, '\uFEFF' + rows.join('\n'), 'utf8'); // BOM: 한글 엑셀 인식
  return p;
}
