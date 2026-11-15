/**
 * ★ 한국어 콘텐츠 시장 — 지표 정정 (2026-11-15)
 *
 * [문제] 이전 지표는 "한국어 영상 조회수 ÷ 한국어 영상 수" = 편당 평균.
 *   n=1 이면 그 1편의 값이 그대로 "평균"이 되어 통계적 의미가 없다.
 *   특히 태국 1편은 SMTOWN NCT DREAM MV = K-pop이라 태국에서 원래 터지는 영상.
 *   → "한국어 콘텐츠가 먹힌다"는 근거가 되지 못한다. (사용자 지적이 맞았다)
 *
 * [정정] 한국어 영상을 두 갈래로 나눈다
 *   A) K-pop (한국 레이블/아이돌)  → 그 나름의既有 수요. 신규 수요 증거 아님
 *   B) 순수 한국어 콘텐츠 (한국어 제목/내레이션, 비아이돌) → ★진짜 신규 수요 지표
 *   지표 = (B 총 조회수) 를 신뢰도(자국 콘텐츠 점유율)와 함께 사용, n 가드 적용
 *
 * 사용: node tools\korean_market_fixed.mjs [YYYY-MM-DD]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const KO_NAME = { US: '미국', IN: '인도', ID: '인도네시아', BR: '브라질', MX: '멕시코', KR: '한국', JP: '일본', GB: '영국', DE: '독일', FR: '프랑스', TR: '터키', TH: '태국', VN: '베트남', PH: '필리핀', TW: '대만', CA: '캐나다', AU: '호주', IT: '이탈리아', ES: '스페인', PL: '폴란드', SA: '사우디', AE: 'UAE', EG: '이집트', NG: '나이지리아' };
// K-pop/한국 아이돌 레이블·채널 (기존 수요. 신규 지표에서 제외)
const KPOP = /(smtown|hybe|jyp entertainment|jyp\b|bang\b|ador|pledis|yg ent|fromm|brave girls|secret number|woo!ah!|powerhouse|big hit|bigbang|bts|blackpink|twice|nct ?dream|nct ?wish|ive\b|aespa|newjeans|nmixx|seventeen|en hyp|dreamcatcher|loona|new beat|stone music|oden\b|kakao m|bright\b|mnet|music core|musicbank|inkigayo|show! music core|kq ?entertainment|ateez|stray kids|skz|itzy|le sserafim|nm|ive|enhyp|baekhyun|taeyong|taeyang|seventeen|kang daniel|dbdk|atlee|haewon|jisung|chaeyoung)/i;

const dateArg = process.argv[2];
const files = fs.readdirSync(path.join(root, 'data')).filter((f) => /^yt_decode_\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
const file = dateArg ? `yt_decode_${dateArg}.csv` : files[files.length - 1];
if (!fs.existsSync(path.join(root, 'data', file))) { console.error('파일 없음:', file); process.exit(1); }
console.log(`데이터: ${file}\n`);

const rows = parseCsv(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
const h = rows[0];
const ix = Object.fromEntries(h.map((x, i) => [x, i]));

// 국가별 원본 집계
const byGeo = {};
for (const r of rows.slice(1)) {
  const g = r[ix.geo]; if (!g) continue;
  (byGeo[g] = byGeo[g] || []).push({
    title: r[ix.title] || '', ch: r[ix.channel] || '',
    views: Number(r[ix.views]) || 0, vel: Number(r[ix.vel]) || 0, url: r[ix.url] || '',
  });
}

// 유니크 영상 → 홈 국가 배정 (중복 제거)
const vidOwner = {};
for (const [g, list] of Object.entries(byGeo)) {
  for (const v of list) {
    const vid = (v.url || '').match(/[?&]v=([\w-]{11})/)?.[1] || (v.url || '').split('/').filter(Boolean).pop();
    if (!vidOwner[vid]) vidOwner[vid] = { g, views: v.views };
    else if (v.views > vidOwner[vid].views) vidOwner[vid] = { g, views: v.views };
  }
}

const out = [];
for (const [g, list] of Object.entries(byGeo)) {
  const ko = list.filter((v) => /[가-힣]/.test(v.title) || KPOP.test(v.ch));
  const kpop = ko.filter((v) => KPOP.test(v.ch) || /[가-힣]/.test(v.title) === false);
  const pure = ko.filter((v) => !KPOP.test(v.ch) && /[가-힣]/.test(v.title));
  const uniqN = Object.values(vidOwner).filter((o) => o.g === g).length;
  out.push({
    g, name: KO_NAME[g] || g,
    raw: list.length, uniqN, localRatio: uniqN / list.length,
    koN: ko.length,
    kpopN: kpop.length, kpopViews: kpop.reduce((s, v) => s + v.views, 0),
    pureN: pure.length, pureViews: pure.reduce((s, v) => s + v.views, 0),
    pureMax: pure.length ? Math.max(...pure.map((v) => v.views)) : 0,
    koItems: ko.map((v) => ({ t: v.title, c: v.ch, v: v.views, kpop: KPOP.test(v.ch) })),
  });
}

console.log('='.repeat(116));
console.log('【 A 】 K-pop 분리 — 한국어 영상을 "K-pop" 과 "순수 한국어" 로 나눈다');
console.log('='.repeat(116));
console.log('#'.padStart(4) + '국가'.padEnd(15) + '한국어편'.padStart(8) + '├K-pop'.padStart(9) + 'K-pop조회'.padStart(13) + '└순한국어'.padStart(9) + '순한국어조회'.padStart(14) + '자국점유율'.padStart(11));
const sorted = [...out].sort((a, b) => b.pureViews - a.pureViews);
for (const o of sorted) {
  if (o.koN === 0 && o.pureViews === 0) continue;
  console.log(
    String(sorted.indexOf(o) + 1).padStart(4) + ` ${o.name} (${o.g})`.padEnd(15) +
    String(o.koN).padStart(8) + String(o.kpopN).padStart(9) +
    o.kpopViews.toLocaleString('ko-KR').padStart(13) + String(o.pureN).padStart(9) +
    o.pureViews.toLocaleString('ko-KR').padStart(14) + (o.localRatio * 100).toFixed(0).padStart(10) + '%'
  );
}

console.log('\n' + '='.repeat(116));
console.log('【 B 】 순수 한국어 콘텐츠 상세 (K-pop 제외) — 어떤 영상이 한국어 콘텐츠인가');
console.log('='.repeat(116));
for (const o of sorted) {
  if (!o.pureN) continue;
  console.log(`\n--- ${o.name} (${o.g}) | 순한국어 ${o.pureN}편, ${o.pureViews.toLocaleString('ko-KR')}뷰 | 자국점유율 ${(o.localRatio * 100).toFixed(0)}% ---`);
  for (const k of o.koItems.filter((x) => !x.kpop)) {
    console.log(`   ${String(k.v).padStart(10)}  ${k.t.slice(0, 58)}  |${k.c.slice(0, 24)}`);
  }
}

console.log('\n' + '='.repeat(116));
console.log('【 C 】 한국어 콘텐츠 시장 최종 랭킹 (n>=2 가드, 자국점유율>=60% 신뢰)');
console.log('='.repeat(116));
const finalRank = sorted
  .filter((o) => o.pureN >= 2 && o.localRatio >= 0.6)
  .map((o) => ({ ...o, score: o.pureViews * (0.6 + o.localRatio * 0.4) }));
finalRank.forEach((o, i) => {
  console.log(`${String(i + 1).padStart(3)} ${o.name} (${o.g})  순한국어 ${String(o.pureN).padStart(2)}편 ${String(o.pureViews.toLocaleString('ko-KR')).padStart(12)}뷰  편당 ${String(Math.round(o.pureViews / o.pureN).toLocaleString('ko-KR')).padStart(10)}  점수 ${Math.round(o.score).toLocaleString('ko-KR')}`);
});
if (!finalRank.length) console.log('(n>=2 + 신뢰도 통과한 국가 없음 — 표본 부족)');
