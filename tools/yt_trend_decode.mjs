/**
 * YouTube 트렌드 디코더 (2026-11-09).
 *
 *  - 큰 시장 24개국 × mostPopular(50개, 1유닛/국가) → 국가별 상위 30
 *  - 스포츠 / 정치 제외 (제목 + 채널명, 단어경계 매칭)
 *  - 엔터테이먼트·음악·밈 중심 해석
 *  - 속도(views/h) 기준 랭킹 — 절대 조회수가 아니라 상승세
 *  - 산출물: reports/yt_decode_YYYY-MM-DD.md + data/yt_decode_YYYY-MM-DD.csv
 *
 * 사용: node tools\yt_trend_decode.mjs [--countries 24] [--top 30]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFormat } from '../src/globalmatch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;

// ── 큰 시장 24개국 ────────────────────────────────────────────────────
const COUNTRIES = [
  ['US', '미국'], ['IN', '인도'], ['ID', '인도네시아'], ['BR', '브라질'], ['MX', '멕시코'],
  ['KR', '한국'], ['JP', '일본'], ['GB', '영국'], ['DE', '독일'], ['FR', '프랑스'],
  ['TR', '터키'], ['TH', '태국'], ['VN', '베트남'], ['PH', '필리핀'], ['TW', '대만'],
  ['CA', '캐나다'], ['AU', '호주'], ['IT', '이탈리아'], ['ES', '스페인'], ['PL', '폴란드'],
  ['SA', '사우디'], ['AE', 'UAE'], ['EG', '이집트'], ['NG', '나이지리아'],
];

// ── 제외: 스포츠 ──────────────────────────────────────────────────────
const SPORTS_TITLE = /\b(nfl|nba|nhl|mlb|nhl|soccer|football|basketball|baseball|hockey|golf|tennis|cricket|rugby|olympic|world cup|super bowl|fifa|uefa|champions league|premier league|la liga|bundesliga|serie a|formula ?1|motogp|nascar|wwe|mma|boxing|ufc|fight night|goal[s]?\s*\d|highlights?|full game|full match|game day|game\s*\d+\s*vs|post[- ]game|player transfer|transfer news|free agent|draft pick|playoffs?|standings?|box score|playoffs|knockout|quarter ?final|semi ?final|finals?\b|gameplay|walkthrough|let's play|lets play|speedrun|roblox|fortnite|minecraft|game trailer|gameplay)\b/i;
const SPORTS_CHANNEL = /^(espn|skysports|sky sports|nba|nfl|nhl|mlb|ufc|tko|wwe|formula ?1|motogp|dazn|bein ?sports|fox sports|cbs sports|nbc sports|sportscenter|marca|as\s|goal\.com|fc barcelona|real madrid|manchester united|fc bayern|juventus|inter milan|chelsea|arsenal|liverpool fc|olympics?|red bull|world athletics|ufc\b|nba\b|kings|hawks|warriors|heat\b|celtics|lakers|bulls|knicks|pacers|falcons|49ers|cowboys|patriots|packers|giants\b|jets\b|eagles\b|steelers|broncos|raiders\b|chargers\b|commanders)/i;

// ── 제외: 정치 ────────────────────────────────────────────────────────
const POLITICS_TITLE = /\b(election|elections|president(?:ial)?|vice ?president|prime minister|parliament|congress|senate|ballot|voting|voter|campaign|referendum|impeach|supreme court|debate|press conference|official statement|breaking news|protest|rally|riot|war in|invasion|sanction|treaty|diplomac|ceasefire|ukrain|russia|israel|gaza|iran|nato|supreme leader|kremlin|white house|state department|immigration|border crisis|tax bill|shutdown|aid package|sanctions)\b/i;
const POLITICS_CHANNEL = /^(msnbc|cnn|fox news|sky news|reuters|ap news|al ?jazeera|abc news|nbc news|cbs news|bbc news|cnbc|politico|the hill|bloomberg|new york times|washington post|pbs newshour|euronews|abc\.com news|nbcnews|foxnews|cnbc|vox|the daily beast|huffpost|buzzfeed news|independent|guardian|telegraph|times of india|hindustan times|ndtv|aaj tak|zee news|times now|business standard|mint|economictimes|tradingview)\b/i;

const isExcluded = (t, ch) => ({
  sport: SPORTS_TITLE.test(t) || SPORTS_CHANNEL.test(ch || ''),
  politics: POLITICS_TITLE.test(t) || POLITICS_CHANNEL.test(ch || ''),
});

// ── 음악/엔터 판별 보강 (classifyFormat 은 키워드 기반이라 popular 영상 절반을 '기타'로 놓친다) ──
const MUSIC_CHANNEL = /(vevo|official|\bmv\b|music|entertainment|records?|label|netflix|hulu|disney\+|marvel|dc|animation studio)/i;
const MUSIC_HINT = /(\bmv\b|\bm\/v\b|music video|offici(al)?\s+(audio|video|visualizer)|lyrics?|lirik|가사|歌词|歌詞|remix|acoustic|feat\.|live\s+(session|performance)|dance\s+(practice|cover|video)| choreography| teaser\s+trailer)/i;
const ENTERTAIN_HINT = /(official|trailer|teaser|clip\s+from|episode|season\s*[0-9]|season\s+final|behind the scenes|interview|reaction|talk show|late night|variety|memes?|funny|cute\s+pets|animals?|prank|challenge|try\s+not\s+to|emotional|storytime|animation|anime|manga|fan\s?art|fanart)/i;

/** classifyFormat 결과를 보정: 음악/엔터/밈을 정확히 판별 */
function classifyEnhanced(title, ch, base) {
  const t = `${title} ${ch || ''}`;
  if (base.name === '숏폼_밈') return { name: '숏폼_밈', label: '숏폼/밈' };
  if (base.name === '성별전환') return base;
  if (base.name === '음악_MV') return base;
  if (base.name === '공식_trailer') return base;
  if (base.name === '애니_만화') return base;
  if (base.name === '시리즈_연작') return base;
  if (MUSIC_HINT.test(t) && MUSIC_CHANNEL.test(t)) return { name: '음악_MV', label: '음악/MV' };
  if (MUSIC_HINT.test(t)) return { name: '음악_MV', label: '음악/MV' };
  if (ENTERTAIN_HINT.test(t)) return { name: '기타_엔터', label: '엔터테인먼트/밈' };
  return base;
}

/** 추가로 제외할 포맷 (포맷 판정 결과 기준) */
const EXCLUDE_FORMATS = new Set(['스포츠_경기', '뉴스_시사']);
const EXCLUDE_LABELS = new Set(['스포츠/경기', '뉴스/시사']);

async function fetchPopular(regionCode, max = 50) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=${max}&key=${KEY}`;
  const r = await fetch(url, { headers: { 'user-agent': 'trend-radar/1.0' } });
  if (!r.ok) return { items: [], status: r.status };
  const j = await r.json();
  return { items: j.items || [], status: 200 };
}

const TOP = 30;
const now = Date.now();

console.log(`=== YouTube 트렌드 디코 — ${COUNTRIES.length}개국 × TOP ${TOP} (스포츠/정치 제외) ===\n`);

const all = [];
const stats = [];
for (const [rc, ko] of COUNTRIES) {
  const { items, status } = await fetchPopular(rc, 50);
  const nowSec = now / 1000;
  let exSport = 0, exPol = 0, exFmt = 0;
  const rows = [];
  for (const v of items) {
    const t = v.snippet?.title || '';
    const ch = v.snippet?.channelTitle || '';
    const ex = isExcluded(t, ch);
    if (ex.sport) { exSport++; continue; }
    if (ex.politics) { exPol++; continue; }
    const base = classifyFormat(t);
    if (EXCLUDE_FORMATS.has(base.name) || EXCLUDE_LABELS.has(base.label)) { exFmt++; continue; }
    const fmt = classifyEnhanced(t, ch, base);
    const pub = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : null;
    const ageH = pub ? Math.max(0.5, (now - pub) / 3600000) : 999;
    const views = Number(v.statistics?.viewCount || 0);
    const likes = Number(v.statistics?.likeCount || 0);
    const comments = Number(v.statistics?.commentCount || 0);
    const row = {
      geo: rc, geoKo: ko, title: t, ch, views, likes, comments,
      ageH: Math.round(ageH * 10) / 10,
      vel: Math.round(views / ageH),
      eng: views ? (likes + comments) / views : 0,
      fmt: fmt.name, fmtLabel: fmt.label,
      publishedAt: v.snippet?.publishedAt || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
    };
    rows.push(row);
    all.push(row);
  }
  rows.sort((a, b) => b.vel - a.vel);
  stats.push({ rc, ko, total: items.length, exSport, exPol, exFmt, kept: rows.length });
  console.log(`${rc}(${ko}) ${items.length} → 제외 스${exSport}/정${exPol}/포맷${exFmt} → 남김 ${rows.length}`);
}

// ── 포맷 분포 (속도합) ───────────────────────────────────────────────
console.log('\n=== 포맷 분포 (속도합 기준) ===');
const byFmt = {};
for (const r of all) {
  byFmt[r.fmtLabel] = byFmt[r.fmtLabel] || { n: 0, vel: 0, views: 0, geos: new Set() };
  byFmt[r.fmtLabel].n++;
  byFmt[r.fmtLabel].vel += r.vel;
  byFmt[r.fmtLabel].views += r.views;
  byFmt[r.fmtLabel].geos.add(r.geo);
}
const fmtRows = Object.entries(byFmt).sort((a, b) => b[1].vel - a[1].vel);
console.log('포맷'.padEnd(22) + '건수'.padStart(6) + '속도합'.padStart(14) + '조회합'.padStart(15) + '국가수'.padStart(7));
for (const [f, v] of fmtRows) {
  console.log(f.padEnd(22) + String(v.n).padStart(6) + Math.round(v.vel).toLocaleString('ko-KR').padStart(14) +
    Math.round(v.views).toLocaleString('ko-KR').padStart(15) + String(v.geos.size).padStart(7));
}

// ── 크로스국 반복 ────────────────────────────────────────────────────
console.log('\n=== 여러 국가에서 동시에 상위 등장 (글로벌 포맷 신호) ===');
const byTitle = {};
for (const r of all) (byTitle[r.title] = byTitle[r.title] || []).push(r);
const multi = Object.entries(byTitle)
  .filter(([, v]) => new Set(v.map((x) => x.geo)).size >= 3)
  .map(([t, v]) => ({ t, geos: new Set(v.map((x) => x.geo)).size, vel: Math.max(...v.map((x) => x.vel)), fmt: v[0].fmtLabel, ch: v[0].ch, url: v[0].url }))
  .sort((a, b) => b.geos - a.geos || b.vel - a.vel);
for (const m of multi.slice(0, 20)) {
  console.log(`${String(m.geos).padStart(2)}개국 ${String(Math.round(m.vel)).padStart(11)}/h ${m.fmt.padEnd(16)} ${m.t.slice(0, 48)}`);
}

// ── 밈/밈 포맷 ──────────────────────────────────────────────────────
const MEME_FMTS = ['숏폼/밈', 'AI 생성 콘텐츠', 'VTuber/스트리밍', '음악/MV', '댄스/퍼포먼스'];
const memeTop = all.filter((r) => MEME_FMTS.includes(r.fmtLabel)).sort((a, b) => b.vel - a.vel).slice(0, 25);
console.log('\n=== 밈 · 음악 · 엔터 상위 (속도) ===');
for (const r of memeTop) {
  console.log(`${r.geo.padEnd(3)} ${String(Math.round(r.vel)).padStart(11)}/h ${r.fmtLabel.padEnd(16)} ${r.title.slice(0, 54)}`);
}

// ── 산출물 저장 ──────────────────────────────────────────────────────
const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
const md = [];
md.push(`# YouTube 트렌드 디코 — ${today}`);
md.push('');
md.push(`> ${COUNTRIES.length}개 큰 시장 × mostPopular(50) → 국가별 상위 ${TOP} (스포츠·정치 제외)`);
md.push(`> 총 ${all.length}건 · 기준 = 상대속도(views/h)`);
md.push('');
md.push(`## 포맷 분포 (속도합)`);
md.push('');
md.push('| 포맷 | 건수 | 속도합 | 조회합 | 국가수 |');
md.push('|---|---|---|---|---|');
const FOCUS = ['음악/MV', '엔터테인먼트/밈', '숏폼/밈', 'AI 생성 콘텐츠', '성별전환/TS', '애니/만화/웹툰', '시리즈/연작 화', 'VTuber/스트리밍', '댄스/퍼포먼스', '공식 예고편/티저'];
const ordered = [
  ...fmtRows.filter(([f]) => FOCUS.includes(f)),
  ...fmtRows.filter(([f]) => !FOCUS.includes(f)),
];
for (const [f, v] of ordered) {
  md.push(`| ${FOCUS.includes(f) ? '**' : ''}${f}${FOCUS.includes(f) ? '**' : ''} | ${v.n} | ${Math.round(v.vel).toLocaleString('ko-KR')} | ${Math.round(v.views).toLocaleString('ko-KR')} | ${v.geos.size} |`);
}
md.push('');
md.push('## 여러 국가 동시 등장 (글로벌 포맷 신호)');
md.push('');
md.push('| 국가수 | 속도/h | 포맷 | 제목 |');
md.push('|---|---|---|---|');
for (const m of multi.slice(0, 20)) md.push(`| ${m.geos} | ${Math.round(m.vel).toLocaleString('ko-KR')} | ${m.fmt} | [${m.t.slice(0, 60)}](${m.url}) |`);
md.push('');
md.push('## 밈 · 음악 · 엔터 상위');
md.push('');
md.push('| 국가 | 속도/h | 포맷 | 제목 | 채널 |');
md.push('|---|---|---|---|---|');
for (const r of memeTop) md.push(`| ${r.geo} | ${Math.round(r.vel).toLocaleString('ko-KR')} | ${r.fmtLabel} | [${r.title.slice(0, 56)}](${r.url}) | ${r.ch.slice(0, 24)} |`);
md.push('');
md.push('## 국가별 상위 ' + TOP);
md.push('');
const FOCUS_LABELS = new Set(['음악/MV', '엔터테인먼트/밈', '숏폼/밈', 'AI 생성 콘텐츠', '성별전환/TS', '애니/만화/웹툰', '시리즈/연작 화', 'VTuber/스트리밍', '댄스/퍼포먼스']);
for (const [rc, ko] of COUNTRIES) {
  const rows = all.filter((r) => r.geo === rc).sort((a, b) => b.vel - a.vel).slice(0, TOP);
  if (!rows.length) continue;
  const focusRows = all.filter((r) => r.geo === rc && FOCUS_LABELS.has(r.fmtLabel)).sort((a, b) => b.vel - a.vel).slice(0, 8);
  md.push(`### ${ko} (${rc})`);
  md.push('');
  if (focusRows.length) {
    md.push('**★ 엔터·음악·밈 TOP**');
    md.push('');
    md.push('| # | 속도/h | 조회수 | 포맷 | 제목 | 채널 |');
    md.push('|---|---|---|---|---|---|');
    focusRows.forEach((r, i) => md.push(`| ${i + 1} | ${Math.round(r.vel).toLocaleString('ko-KR')} | ${r.views.toLocaleString('ko-KR')} | ${r.fmtLabel} | [${r.title.slice(0, 52)}](${r.url}) | ${r.ch.slice(0, 22)} |`));
    md.push('');
  }
  md.push(`**전체 상위 ${TOP}**`);
  md.push('');
  md.push('| # | 속도/h | 조회수 | 포맷 | 제목 | 채널 |');
  md.push('|---|---|---|---|---|---|');
  rows.forEach((r, i) => md.push(`| ${i + 1} | ${Math.round(r.vel).toLocaleString('ko-KR')} | ${r.views.toLocaleString('ko-KR')} | ${r.fmtLabel} | [${r.title.slice(0, 52)}](${r.url}) | ${r.ch.slice(0, 22)} |`));
  md.push('');
}
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', `yt_decode_${today}.md`), md.join('\n'), 'utf8');

const csvHead = 'date,geo,geoKo,rank,vel,views,likes,comments,ageH,fmt,channel,title,url\n';
const csvRows = all.map((r) => {
  const byGeo = all.filter((x) => x.geo === r.geo).sort((a, b) => b.vel - a.vel);
  const rank = byGeo.findIndex((x) => x.url === r.url) + 1;
  return [today, r.geo, r.geoKo, rank, Math.round(r.vel), r.views, r.likes, r.comments, r.ageH, r.fmtLabel, `"${r.ch.replace(/"/g, '""')}"`, `"${r.title.replace(/"/g, '""')}"`, r.url].join(',');
}).join('\n');
fs.writeFileSync(path.join(root, 'data', `yt_decode_${today}.csv`), csvHead + csvRows + '\n', 'utf8');

console.log(`\n저장: reports/yt_decode_${today}.md · data/yt_decode_${today}.csv (${all.length}건)`);
