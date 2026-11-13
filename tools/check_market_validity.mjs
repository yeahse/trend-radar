/**
 * 시장 랭킹 검증 — "1인당 순위"가 실제로 유효한지.
 *
 * 핵심 의심: mostPopular 50편이 대부분 글로벌 영어 콘텐츠면
 *   ① 절대순은 왜곡되고
 *   ② 1인당 순위는 "유니크 표본 5~11편"으로 나눠서 부풀려진다.
 *
 * 검증 항목
 *   localRatio = 그 국가에 배정된 유니크 영상수 / raw 50편  (자국 콘텐츠 점유율)
 *   koreanCnt = top50 중 한국어 제목 또는 한국 채널 영상 수     (한국 콘텐츠 실전 점유율)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const file = fs.readdirSync(path.join(root, 'data')).filter((f) => /^yt_decode_.*\.csv$/.test(f)).sort().pop();

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

const rows = parseCsv(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
const h = rows[0];
const ix = Object.fromEntries(h.map((x, i) => [x, i]));
const byGeo = {};
for (const r of rows.slice(1)) {
  const g = r[ix.geo]; if (!g) continue;
  (byGeo[g] = byGeo[g] || []).push({
    title: r[ix.title], ch: r[ix.channel], views: Number(r[ix.views]) || 0,
    url: r[ix.url],
  });
}

const KO_CHANNELS = /(smtown|hybe|yg ent|yg娱乐|jyp|big hit|bts|blackpink|twice|nct dream|ive|babymonster|aespa|newjeans|nmixx|seventeen|en hyp|brave girls|dreamcatcher|loona|secret number|woo!ah!|fromm|powerhouse|wooah|bang|rebel|ador|pledis|kakao m|bright|spicy|antenna|han bing|brave|new beat|stone music|oden|ador)/i;
const hasKoText = (t) => /[가-힣]/.test(t);
const hasKoChan = (ch) => KO_CHANNELS.test(ch || '');

// vid -> 어느 국가에 배정될지
const vidOwner = {};
for (const [g, list] of Object.entries(byGeo)) {
  for (const v of list) {
    const vid = (v.url || '').match(/[?&]v=([\w-]{11})/)?.[1] || (v.url || '').split('/').filter(Boolean).pop();
    if (!vidOwner[vid]) vidOwner[vid] = { g, views: v.views };
    else if (v.views > vidOwner[vid].views) vidOwner[vid] = { g, views: v.views };
  }
}

const KO_NAME = { US: '미국', IN: '인도', ID: '인도네시아', BR: '브라질', MX: '멕시코', KR: '한국', JP: '일본', GB: '영국', DE: '독일', FR: '프랑스', TR: '터키', TH: '태국', VN: '베트남', PH: '필리핀', TW: '대만', CA: '캐나다', AU: '호주', IT: '이탈리아', ES: '스페인', PL: '폴란드', SA: '사우디', AE: 'UAE', EG: '이집트', NG: '나이지리아' };

const summary = [];
for (const [g, list] of Object.entries(byGeo)) {
  const uniqN = Object.entries(vidOwner).filter(([, v]) => v.g === g).length;
  const raw = list.length;
  const koCnt = list.filter((v) => hasKoText(v.title) || hasKoChan(v.ch)).length;
  const koViews = list.filter((v) => hasKoText(v.title) || hasKoChan(v.ch)).reduce((s, v) => s + v.views, 0);
  const totalViews = list.reduce((s, v) => s + v.views, 0);
  summary.push({ g, raw, uniqN, localRatio: uniqN / raw, koCnt, koViews, koShare: koCnt / raw, totalViews });
}
summary.sort((a, b) => b.localRatio - a.localRatio);

console.log('=== 자국 콘텐츠 점유율(유니크/raw) 높은 순 ===');
console.log('#'.padStart(3) + '국가'.padEnd(14) + '유니크/raw'.padStart(12) + '자국점유율'.padStart(11) + '한국어영상'.padStart(11) + '한국어점유율'.padStart(12) + '한국어조회수'.padStart(14));
for (const s of summary) {
  console.log(
    String(summary.indexOf(s) + 1).padStart(3) + ` ${KO_NAME[s.g] || s.g} (${s.g})`.padEnd(14) +
    `${s.uniqN}/${s.raw}`.padStart(12) + (s.localRatio * 100).toFixed(0).padStart(10) + '%' +
    String(s.koCnt).padStart(11) + (s.koShare * 100).toFixed(1).padStart(11) + '%' +
    s.koViews.toLocaleString('ko-KR').padStart(14)
  );
}

console.log('\n\n=== 검증 대상국 top 8 (자국인지 글로벌인지) ===');
for (const g of ['VN', 'TW', 'AU', 'AE', 'CA', 'KR', 'US', 'IN']) {
  const list = (byGeo[g] || []).sort((a, b) => b.views - a.views);
  console.log(`\n--- ${KO_NAME[g]} (${g}) | 유니크 ${summary.find((s) => s.g === g)?.uniqN}/${list.length} | 한국어 ${summary.find((s) => s.g === g)?.koCnt}편 ---`);
  for (const v of list.slice(0, 8)) {
    const ko = hasKoText(v.title) || hasKoChan(v.ch);
    console.log(`  ${ko ? '★' : ' '} ${String(v.views).padStart(10)}  ${String(v.title).slice(0, 60)}  [${String(v.ch).slice(0, 22)}]`);
  }
}
