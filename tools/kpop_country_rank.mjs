/**
 * ★ K-pop 인기 국가 랭킹 — 2개 기준
 *   ① 총량   : K-pop 영상 조회수 합 (국가별 mostPopular 50편 안에서)
 *   ② 인구대비 : 1인당 K-pop 조회수 (실제 인구 기준 — 금액 아님)
 *   + 보조   : K-pop 점유율 (top50 중 K-pop 비중)
 *
 * [왜 mostPopular 인가]
 *   search 의 regionCode 는 국가 구분이 거의 안 되고(전국 동일 집합 반환 확인됨),
 *   mostPopular 의 regionCode 는 **진짜 그 나라 인기 차트**다.
 *   → 국가별 K-pop 소비를 재려면 mostPopular 이 맞다.
 *
 * [K-pop 판별]
 *   ① 한국 레이블/아이돌 그룹 채널명
 *   ② 아티스트 "- Topic" 채널 + 한글 제목
 *   ③ 한글 제목 + MV/M/V/Music Video/컴백
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');

// ── 한국 레이블 / 아이돌 그룹 ──────────────────────────────────────
// ★ 단어 분리 매칭 (short token 금지)
//   'Enter**nt**ainment' , 'Sal**man** K**han**' , 'L**IVE**' 오매칭 방지
const KR_LABEL_WORDS = new Set([
  'smtown', 'hybe', 'big', 'hit', 'jyp', 'pledis', 'ador', 'rbw', 'fnc', 'cube',
  'source', 'ist', 'woollim', 'aomg', 'koz', 'antenna', 'belift', 'mnh', 'magic',
  'nation', 'l1ve', 'razor', 'bravo', 'blitz', 'beyond', 'anmain', 'axis', 'mhq',
  'abel', 'oomg', 'kq', 'kqent', 'kkq', 'crem', 'dust', 'beliftlab', 'label',
  'sowon', 'more', 'vision', 'reposts', 'blk', 'oool', 'modhaus', 'bh', 'starship',
  'kakao', 'm', 'fantagio', 'giant', 'cj', 'trot', 'euronext', 'milkgirl', 'r8', 'nineone',
]);
const KR_GROUP_WORDS = new Set([
  'nct', 'dream', 'wish', '127', 'ive', 'aespa', 'twice', 'blackpink', 'babymonster',
  'newjeans', 'new', 'jeans', 'seventeen', 'itzy', 'lesserafim', 'stray', 'kids',
  'skz', 'ateez', 'txt', 'tomorrow', 'x', 'together', 'riize', 'nmixx', 'illit',
  'boynextdoor', 'plave', 'izna', 'izone', 'kep1er', 'unis', 'oddinary', 'hearts2hearts',
  'we', 'ki', 'mek', 'loona', 'karina', 'winter', 'taeyeon', 'jeongyeon', 'jihyo',
  'nayeon', 'mina', 'ryujin', 'chaeyoung', 'luka', 'chaerin', 'sakura', 'bakkom',
  'gidle', 'mamamoo', 'fifty', 'stay', 'nm', 'IVE', 'LSF', 'RIIZING', 'ATBO', '82MAJOR',
]);
const KR_LABEL_PHRASES = ['smtown', 'hybe labels', 'big hit', 'jyp entertainment', 'kq entertainment', 'pledis', 'ador', 'rbw', 'fnc entertainment', 'cube entertainment', 'bighit', 'source media', 'woollim', 'top media', 'aomg', 'koz ent', 'antenna music', 'belift lab', 'starship', 'kakao m', 'more vision', 'modhaus', 'blk', 'loverse', 'reposts'];

// 아티스트 "Topic" 채널 (한국어 제목일 때만 한국 아티스트로 간주)
const TOPIC_CH = /-\s*topic$/i;

function isKPOP(title, ch) {
  const t = String(title || '');
  const cRaw = String(ch || '');
  const c = cRaw.toLowerCase();
  const cl = cRaw.replace(/[^A-Za-z0-9가-힣]+/g, ' ').trim().toLowerCase();
  const words = cl.split(/\s+/).filter(Boolean);
  const hasKo = /[가-힣]/.test(t);

  // 1) 한국 레이블
  if (KR_LABEL_PHRASES.some((p) => c.includes(p))) return 'label';
  if (words.some((w) => KR_LABEL_WORDS.has(w))) return 'label';
  // 2) 아이돌 그룹 (단어 단위)
  if (words.some((w) => KR_GROUP_WORDS.has(w))) return 'group';
  // 3) 아티스트 Topic 채널 + 한글 제목
  if (TOPIC_CH.test(cRaw.trim()) && hasKo) return 'topic-ko';
  // 4) 한글 제목 + MV 표기
  if (hasKo && /\b(mv|m\/v|music video|official video|컴백|comeback|뮤직비디오)\b/i.test(t)) return 'title-mv';
  return null;
}

// ── 데이터 로드 (최신 디코 CSV) ────────────────────────────────────
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

const files = fs.readdirSync(path.join(root, 'data')).filter((f) => /^yt_decode_\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
const file = files[files.length - 1];
console.log(`데이터: ${file}\n`);

const rows = parseCsv(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
const h = rows[0];
const ix = Object.fromEntries(h.map((x, i) => [x, i]));

const byGeo = {};
for (const r of rows.slice(1)) {
  const g = r[ix.geo]; if (!g) continue;
  (byGeo[g] = byGeo[g] || []).push({
    title: r[ix.title] || '', ch: r[ix.channel] || '',
    views: Number(r[ix.views]) || 0,
  });
}

// ── K-pop 판별 ────────────────────────────────────────────────────

// ── 인구 (World Bank) ──────────────────────────────────────────────
const POP = {};
try {
  const r = await fetch('https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&date=2024', { headers: { 'user-agent': 'trend-radar/1.0' } });
  const j = await r.json();
  for (const c of (Array.isArray(j) && j[1]) || []) if (c.country?.id && c.value) POP[c.country.id] = Number(c.value);
  console.log(`인구: ${Object.keys(POP).length}개국 (World Bank 2024)`);
} catch (e) { console.log('인구 로드 실패:', e.message); }
POP.TW = POP.TW || 23400000;

// ── 집계 ───────────────────────────────────────────────────────────
const NAME = { US: '미국', IN: '인도', ID: '인도네시아', BR: '브라질', MX: '멕시코', KR: '한국', JP: '일본', GB: '영국', DE: '독일', FR: '프랑스', TR: '터키', TH: '태국', VN: '베트남', PH: '필리핀', TW: '대만', CA: '캐나다', AU: '호주', IT: '이탈리아', ES: '스페인', PL: '폴란드', SA: '사우디', AE: 'UAE', EG: '이집트', NG: '나이지리아' };

const agg = [];
for (const [g, list] of Object.entries(byGeo)) {
  const kp = list.filter((v) => isKPOP(v.title, v.ch));
  const kpViews = kp.reduce((s, v) => s + v.views, 0);
  const pop = POP[g] || 0;
  agg.push({
    g, name: NAME[g] || g, n: list.length, kpN: kp.length,
    kpViews, pop,
    share: (kp.length / list.length) * 100,
    perM: pop ? (kpViews / pop) * 1e6 : 0,
    items: kp.sort((a, b) => b.views - a.views).slice(0, 4).map((v) => ({ t: v.title.slice(0, 46), c: v.ch.slice(0, 20), v: v.views })),
  });
}

function table(title, rows, key, label, extra) {
  console.log('\n' + '='.repeat(104));
  console.log(title);
  console.log('='.repeat(104));
  console.log('#'.padStart(4) + '국가'.padEnd(16) + label.padStart(16) + 'K-pop편'.padStart(9) + '점유율'.padStart(9) + '인구'.padStart(10) + (extra ? extra.padStart(13) : ''));
  rows.forEach((r, i) => {
    console.log(
      String(i + 1).padStart(4) + ` ${r.name} (${r.g})`.padEnd(16) +
      (key === 'kpViews' ? Math.round(r.kpViews / 1e6) + 'M' : Math.round(r.perM).toLocaleString('ko-KR')).padStart(16) +
      String(r.kpN).padStart(9) + r.share.toFixed(0).padStart(8) + '%' +
      (r.pop ? (r.pop / 1e6).toFixed(1) + 'M' : '-').padStart(10) +
      (extra ? (r.kpN ? r.kpN + '편' : '-').padStart(13) : '')
    );
  });
}

const byTotal = [...agg].sort((a, b) => b.kpViews - a.kpViews);
const byPer = [...agg].sort((a, b) => b.perM - a.perM);
const byShare = [...agg].sort((a, b) => b.share - a.share || b.kpViews - a.kpViews);

table('【 랭킹 ① 】 K-pop 총량 (국가별 mostPopular 50편 중 K-pop 조회수 합)', byTotal, 'kpViews', '총조회수');
table('【 랭킹 ② 】 K-pop 인구 대비 (1인당 K-pop 조회수 — 인구수 기준, 금액 아님)', byPer, 'perM', '1인당조회수');
table('【 랭킹 ③ 】 K-pop 점유율 (그 나라 popular 50편 중 K-pop 이 차지하는 비중 = 실제 소비 비중)', byShare, 'kpViews', '총조회수');

console.log('\n★ 주의: ① 총량은 글로벌 K-pop 히트(ATEEZ \'UP\' 2,140만 + ENHYPEN 1,430만)가');
console.log('  13개국 mostPopular 에 동시 등장해 조회수 합이 뭉개진다(전국 36M).');
console.log('  → 국가 차별축은 ③ 점유율(K-pop 편수)과 ② 1인당 조회수다.');

console.log('\n=== 국가별 K-pop 상위 영상 ===');
for (const r of byTotal.filter((x) => x.kpN > 0)) {
  console.log(`\n--- ${r.name} (${r.g}) | K-pop ${r.kpN}/${r.n}편, ${Math.round(r.kpViews / 1e6)}M | 점유율 ${r.share.toFixed(0)}% | 1인당 ${Math.round(r.perM).toLocaleString('ko-KR')}`);
  for (const k of r.items) console.log(`   ${String(k.v).padStart(10)}  ${k.t}  |${k.c}`);
}

// 저장
const md = [];
md.push(`# K-pop 인기 국가 랭킹 — 총량 + 인구 대비`);
md.push('');
md.push(`> 데이터: ${file} (국가별 mostPopular 50편) · 인구: World Bank SP.POP.TOTL 2024 · ${new Date().toISOString().slice(0, 10)}`);
md.push('');
md.push('## ① 총량 — K-pop 조회수 합');
md.push('');
md.push('| # | 국가 | K-pop 조회수 | K-pop편/50 | 점유율 | 인구 |');
md.push('|---|---|---|---|---|---|');
byTotal.forEach((r, i) => md.push(`| ${i + 1} | ${r.name} (${r.g}) | ${Math.round(r.kpViews / 1e6)}M | ${r.kpN}/${r.n} | ${r.share.toFixed(0)}% | ${r.pop ? (r.pop / 1e6).toFixed(1) + 'M' : '-'} |`));
md.push('');
md.push('## ② 인구 대비 — 1인당 K-pop 조회수');
md.push('');
md.push('| # | 국가 | 1인당 K-pop 조회수 | K-pop편/50 | 점유율 | 인구 |');
md.push('|---|---|---|---|---|---|');
byPer.forEach((r, i) => md.push(`| ${i + 1} | ${r.name} (${r.g}) | ${Math.round(r.perM).toLocaleString('ko-KR')} | ${r.kpN}/${r.n} | ${r.share.toFixed(0)}% | ${r.pop ? (r.pop / 1e6).toFixed(1) + 'M' : '-'} |`));
md.push('');
md.push('## ③ K-pop 점유율 (실제 소비 비중 — 총량이 뭉개지는 진짜 차별축)');
md.push('');
md.push('| # | 국가 | K-pop 편수/50 | 점유율 | K-pop 조회수 |');
md.push('|---|---|---|---|---|');
byShare.forEach((r, i) => md.push(`| ${i + 1} | ${r.name} (${r.g}) | ${r.kpN}/${r.n} | ${r.share.toFixed(0)}% | ${Math.round(r.kpViews / 1e6)}M |`));
md.push('');
md.push('> **주의**: 총량(①)은 글로벌 K-pop 히트(ATEEZ \'UP\' 2,140만 + ENHYPEN 1,430만)가');
md.push('> 13개국 mostPopular 에 동시 등장해 조회수 합이 전부 36M 으로 뭉개진다.');
md.push('> → **국가 차별축은 ③ 점유율과 ② 1인당 조회수다.**');
md.push('');
md.push('> 금액이 아니라 **인구수** 기준. 선진국은 CPM(광고 단가)이 높지만');
md.push('> 광고 예산 배분은 시청자 규모(인구)에 비례하는 편이라 수입 기준이 실무적으로 맞다.');
fs.writeFileSync(path.join(root, 'reports', `kpop_country_${new Date().toISOString().slice(0, 10)}.md`), md.join('\n'), 'utf8');
console.log(`\n저장: reports/kpop_country_${new Date().toISOString().slice(0, 10)}.md`);
