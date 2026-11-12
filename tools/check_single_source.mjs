/**
 * 신규 발견 키워드의 "단일 소스" 여부 점검.
 * 1인 공지에서 파생된 키워드가 100점으로 올라오면 신호가 아니라 노이즈다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const L = fs.readFileSync(path.join(root, 'data', 'snapshot.jsonl'), 'utf8').trim().split('\n');
const s = JSON.parse(L[L.length - 1]);

// 신규 발견 후보가 들어있는 배열 찾기
function findDisc(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const r = findDisc(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === 'object') {
    if (obj.term && Array.isArray(obj.links) && typeof obj.score === 'number' && obj.links.length) return obj;
    for (const k of Object.keys(obj)) {
      const r = findDisc(obj[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

// 발견 후보 배열을 통째로 모으기
const all = [];
(function walk(o, d = 0) {
  if (!o || d > 8) return;
  if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
  if (typeof o === 'object') {
    if (o.term && Array.isArray(o.links) && typeof o.score === 'number') all.push(o);
    Object.values(o).forEach((x) => walk(x, d + 1));
  }
})(s);

const uniq = new Map();
for (const d of all) if (!uniq.has(d.term)) uniq.set(d.term, d);

console.log('=== 신규 발견 키워드별 "서로 다른 작성자 수" ===');
console.log('(1인이면 공지 1개 → 시장 신호 아님)\n');
const rows = [];
for (const d of uniq.values()) {
  const authors = new Set();
  const plats = new Set();
  for (const l of d.links || []) {
    const m = l.match(/(?:bsky\.app\/profile|deviantart\.com|reddit\.com\/user)\/([^/]+)/i);
    if (m) authors.add(m[1].toLowerCase());
    if (l.includes('bsky.app')) plats.add('bluesky');
    else if (l.includes('deviantart')) plats.add('deviantart');
    else if (l.includes('reddit')) plats.add('reddit');
  }
  rows.push({ term: d.term, score: d.score, hits: d.hits, authors: authors.size, plats: [...plats].join(','), links: (d.links || []).length, titles: (d.titles || []).slice(0, 1)[0] || '' });
}
rows.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
console.log('점수'.padStart(5) + '키워드'.padEnd(24) + '작성자'.padStart(7) + '링크'.padStart(6) + '플랫폼'.padStart(14) + '  제목샘플');
for (const r of rows.slice(0, 30)) {
  console.log(`${String(r.score).padStart(5)} ${r.term.slice(0, 23).padEnd(24)} ${String(r.authors).padStart(7)} ${String(r.links).padStart(6)} ${r.plats.padEnd(14)}  ${String(r.titles).slice(0, 46)}`);
}
const single = rows.filter((r) => r.authors <= 1);
console.log(`\n★ 작성자 1명인 키워드: ${single.length}/${rows.length} → ${single.map((r) => r.term).join(', ')}`);
