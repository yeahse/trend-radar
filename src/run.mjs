import { loadConfig, appendSnapshot, historyMap, writeCSV, ensureDirs } from './store.mjs';
import { loadState, saveState, shouldFetch, markFetched, getOrFetch, pickLeastRecent, getResult, getSourceTime, saveResult } from './cache.mjs';
import { collectReddit } from './sources/reddit.mjs';
import { collectBluesky } from './sources/bluesky.mjs';
import { collectYouTube } from './sources/youtube.mjs';
import { collectNaver } from './sources/naver.mjs';
import { collectGlobalTrends } from './sources/globaltrends.mjs';
import { collectCrossover } from './sources/youtube_xover.mjs';
import { matchGlobalTrends, buildIdeas, addVelocity, crossCountryLeaders } from './globalmatch.mjs';
import { collectWikimedia } from './sources/wikimedia.mjs';
import { collectKYM } from './sources/kym.mjs';
import { collectEarlyCommunity } from './sources/earlycommunity.mjs';
import { scoreWatchlist, discoverCandidates } from './score.mjs';
import { writeReport, postDiscord, postTelegram } from './report.mjs';
import { todayKST } from './util.mjs';

const args = process.argv.slice(2);
const FAST = args.includes('--fast');           // 레딧/무거운 소스 스킵
const FORCE = args.includes('--force');         // TTL 무시하고 전부 새로 수집

const TTL = {
  reddit: 6 * 3600 * 1000,
  bluesky: 3600 * 1000,
  kym: 3600 * 1000,
  naver: 6 * 3600 * 1000,
  wiki: 12 * 3600 * 1000,
  itch: 3 * 3600 * 1000,
  da: 12 * 3600 * 1000,
};

const cfg = await loadConfig();
await ensureDirs();
const state = await loadState();

const terms = cfg.watchlist?.terms || [];
const fitTerms = cfg.fit?.terms || [];
const wikiPairs = Object.entries(cfg.watchlist?.wikiMap || {}).map(([term, article]) => ({ term, article }));
const errors = [];
const raw = { reddit: [], bluesky: [], kym: [], itch: [], deviantart: [] };

const t0 = Date.now();
const budget = 240000; // 4분之内에 끝내기
const overBudget = () => Date.now() - t0 > budget;

// ─────────────────────────────────────────────── Reddit (회전 실행)
const allSubs = cfg.reddit?.subreddits || [];
const allQueries = cfg.reddit?.queries || [];
if (FAST) {
  console.log('▶ Reddit 스킵 (--fast)');
} else {
  // 매번 같은 서브레딧만 보지 않도록 "가장 오래전 수집본"부터 고른다
  const subs = pickLeastRecent(state, allSubs, 3);
  const queries = pickLeastRecent(state, allQueries, 1);
  console.log(`▶ Reddit 수집 중... (${subs.length}개 서브레딧, ${queries.length}개 검색)`);
  const rd = await collectReddit(cfg, { subs, queries });
  raw.reddit = rd.items;
  errors.push(...rd.errors);
  subs.forEach((s) => markFetched(state, `reddit:r/${s}`));
  queries.forEach((q) => markFetched(state, `reddit:q:${q}`));
}

// ─────────────────────────────────────────────── Bluesky
{
  const { value, cached } = await getOrFetch(state, 'bluesky', TTL.bluesky, async () => {
    console.log('▶ Bluesky 수집 중...');
    const bs = await collectBluesky(cfg);
    errors.push(...bs.errors);
    return bs.items;
  }, FORCE);
  raw.bluesky = value || [];
  if (cached) console.log('▶ Bluesky: 마지막 결과 재사용 (TTL)');
}

// ─────────────────────────────────────────────── Know Your Meme
{
  const { value, cached } = await getOrFetch(state, 'kym', TTL.kym, async () => {
    console.log('▶ Know Your Meme 수집 중...');
    const ky = await collectKYM();
    errors.push(...ky.errors);
    return ky.items;
  }, FORCE);
  raw.kym = value || [];
  if (cached) console.log('▶ KYM: 마지막 결과 재사용 (TTL)');
}

// ─────────────────────────────────────────────── itch.io / DeviantArt
{
  const { value, cached } = await getOrFetch(state, 'early', TTL.itch, async () => {
    console.log('▶ itch.io / DeviantArt 수집 중...');
    const ec = await collectEarlyCommunity(cfg);
    errors.push(...ec.errors);
    return { itch: ec.items.filter((i) => i.platform === 'itch'), da: ec.items.filter((i) => i.platform === 'deviantart') };
  }, FORCE);
  raw.itch = value?.itch || [];
  raw.deviantart = value?.da || [];
  if (cached) console.log('▶ itch/DA: 마지막 결과 재사용 (TTL)');
}

// ─────────────────────────────────────────────── Naver DataLab
let nv = [];
{
  const { value, cached } = await getOrFetch(state, 'naver', TTL.naver, async () => {
    console.log('▶ Naver DataLab 수집 중...');
    const res = await collectNaver(cfg, terms);
    errors.push(...res.errors);
    return res.items;
  }, FORCE);
  nv = value || [];
  if (cached) console.log('▶ Naver: 마지막 결과 재사용 (TTL)');
}

// ─────────────────────────────────────────────── YouTube (네이버 다음에 실행)
// 공급량 측정은 검색 호출이 느리므로 "내 포맷에 맞는 단어"만 대상으로 한다.
// 우선순위 = 한국 수요가 있는 단어 먼저 (수요 실체 확인된 곳의 공급량을 재야 의미가 있다)
const naverLast7 = new Map(nv.map((n) => [n.term, n.last7 || 0]));
const proxyPool = terms
  .filter((t) => fitTerms.some((f) => t.toLowerCase().includes(f.toLowerCase())))
  .sort((a, b) => (naverLast7.get(b) || 0) - (naverLast7.get(a) || 0));
const proxyTerms = proxyPool.slice(0, 14);
console.log('▶ YouTube 수집 중...');
const yt = await collectYouTube(cfg, terms, {
  proxyTerms,
  force: FORCE,
  cache: {
    getResult: (k) => getResult(state, k),
    getSourceTime: (k) => getSourceTime(state, k),
    saveResult: (k, v) => saveResult(state, k, v),
    markFetched: (k) => markFetched(state, k),
  },
});
errors.push(...yt.errors);

// ─────────────────────────────────────────────── 🌍 글로벌 트렌드 (watchlist 무관)
// "전 세계 지금 뭐가 유행하는가" — watchlist 분석과 완전히 별개 축.
// TikTok/Instagram/YouTube/Reddit에 올릴 대상을 여기서 찾는다.
let globalItems = [];
let globalBySource = {};
{
  const { value, cached } = await getOrFetch(state, 'globaltrends', TTL.global ?? 3 * 3600 * 1000, async () => {
    console.log('▶ 글로벌 트렌드 수집 중... (GoogleTrends·YouTube·Wikipedia·Reddit)');
    const res = await collectGlobalTrends(cfg);
    errors.push(...res.errors);
    return { items: res.items, bySource: res.bySource };
  }, FORCE);
  globalItems = value?.items || [];
  globalBySource = value?.bySource || {};
  if (cached) console.log('▶ 글로벌 트렌드: 마지막 결과 재사용 (TTL)');
}

// 글로벌 트렌드 → 내 채널 포맷 매칭
// ★ --neutral = 내 채널 어휘군을 전부 끄고 "원본 100%" 만 본다 (중립성 검증용)
const NEUTRAL = process.argv.includes('--neutral');
if (NEUTRAL) console.log('  ⚪ --neutral: 채널 매칭 비활성화 (원본 그대로)');
// ★ 상대속도(views/시간) + N개국 동시 1등 계산 (절대조회수 1등은 의미없음)
addVelocity(globalItems);
const crossCountry = crossCountryLeaders(globalItems.filter((x) => x.source === 'youtube-popular'));
const gmatch = matchGlobalTrends(globalItems, {
  coreSignals: NEUTRAL ? {} : cfg.globalTrends?.coreSignals,
  formatSignals: NEUTRAL ? {} : cfg.globalTrends?.formatSignals,
  fitTerms: NEUTRAL ? [] : cfg.globalTrends?.fitTerms || cfg.fit?.terms || [],
});
const gIdeas = NEUTRAL ? [] : buildIdeas(gmatch.matched, { max: cfg.globalTrends?.maxIdeas || 8 });

// ─────────────────────────────────────────────── 🔀 크로스오버 탐지 (Reddit 대체)
// Reddit 공개 API는 2027-03 종료 예정이라 크로스오버를 Reddit에 의존하지 않는다.
// YouTube search(order=date)로 "주제별 총공급 + 최근7일 비율 + 채널 분산"을 잰다.
//   최근7일 비율 90%+ & 신규 채널 多  = 지금 퍼지는 중 (=진짜 크로스오버)
let crossover = [];
{
  const kw = [];
  const seenKw = new Set();
  // ① 직격 후보 제목
  for (const i of gIdeas) {
    const t = String(i.term || '').replace(/[|#@\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 4 || seenKw.has(t.toLowerCase())) continue;
    seenKw.add(t.toLowerCase());
    kw.push(t);
  }
  // ② 12개국 속도 1등 제목
  for (const it of globalItems.filter((x) => x.source === 'youtube-popular')) {
    const t = String(it.term || '').replace(/[|#@\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 4 || seenKw.has(t.toLowerCase())) continue;
    seenKw.add(t.toLowerCase());
    kw.push(t);
  }
  const xk = kw.slice(0, cfg.globalTrends?.crossoverMax ?? 8);
  if (xk.length) {
    console.log(`▶ 크로스오버 탐지 중... (${xk.length}개 키워드)`);
    const xr = await collectCrossover(cfg, xk, { regionCode: cfg.globalTrends?.crossoverRegion || 'US' });
    crossover = xr.items;
    errors.push(...xr.errors);
  }
}

// ─────────────────────────────────────────────── Wikipedia
let wk = [];
{
  const { value, cached } = await getOrFetch(state, 'wiki', TTL.wiki, async () => {
    console.log('▶ Wikipedia Pageviews 수집 중...');
    const res = await collectWikimedia(wikiPairs);
    errors.push(...res.errors);
    return res.items;
  }, FORCE);
  wk = value || [];
  if (cached) console.log('▶ Wikipedia: 마지막 결과 재사용 (TTL)');
}

// ─────────────────────────────────────────────── 점수화
const allItems = [...raw.reddit, ...raw.bluesky, ...raw.kym, ...raw.itch, ...raw.deviantart];
const history = await historyMap(30);
const watch = scoreWatchlist({
  terms,
  items: allItems,
  naver: nv,
  wiki: wk,
  uploads: yt.uploads,
  supply: yt.supply,
  supplySource: yt.supplySource,
  fitTerms,
  history,
});
const discoveries = discoverCandidates({ items: allItems, fitTerms, watchTerms: terms });

const date = todayKST();
const snapshot = {
  ts: new Date().toISOString(),
  collectedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  date,
  watch,
  discoveries,
  competitorHits: yt.competitorHits,
  supplySource: yt.supplySource,
  supply: yt.supply,
  competitors: yt.competitors,
  naver: nv.map((n) => ({ term: n.term, growth: n.growth, last7: n.last7, prev7: n.prev7, peak: n.peak, demandShare: n.demandShare, lowVolume: n.lowVolume, series: n.series })),
  global: {
    date,
    neutral: NEUTRAL,
    geos: cfg.globalTrends?.geos || ['US', 'KR', 'JP', 'GB', 'IN', 'TW'],
    total: globalItems.length,
    matchedCount: gmatch.matched.length,
    ideas: gIdeas,
    formatMix: gmatch.formatMix,
    crossCountry: (crossCountry || []).map((c) => ({
      title: c.title, channel: c.channel, vel: c.vel, format: c.format, url: c.url,
      geos: c.geos, coverage: c.coverage, kind: c.kind, isGlobalHit: c.isGlobalHit,
    })),
    crossover: crossover.map((c) => ({
      keyword: c.keyword,
      totalSupply: c.totalSupply,
      recentRatio: c.recentRatio,
      recentCount: c.recentCount,
      sampled: c.sampled,
      channelCount: c.channelCount,
      newChannelCount: c.newChannelCount,
      crossoverScore: c.crossoverScore,
      top: c.top.slice(0, 5),
    })),
    // 스냅샷은 용량 제한 → 상위 1,500건만 보관 (전체 목록은 global_trends CSV에 있음)
    top: gmatch.all.slice(0, 1500).map((x) => ({
      source: x.source, geo: x.geo, term: x.term, channel: x.channel,
      metric: x.metric, fitScore: x.fitScore, fitLevel: x.fitLevel,
      format: x.format, formatLabel: x.formatLabel,
      coreGroups: x.coreGroups, fmtGroups: x.fmtGroups, url: x.url,
    })),
    totalAll: gmatch.all.length,
  },
  raw,
};

await appendSnapshot(snapshot);
state.lastRunAt = new Date().toISOString();
await saveState(state);

// ─────────────────────────────────────────────── CSV
const csvRows = watch.map((w) => ({
  date, term: w.term, score: w.score, velocity: w.velocity, crossPlatform: w.crossPlatform,
  supplyDeficit: w.supplyDeficit, fit: w.fit, redditHits: w.redditHits, blueskyHits: w.blueskyHits,
  wikiGrowth: w.wikiGrowth, ytUploads: w.ytUploads,
  supplySource: w.supplySource, supplyRecent: w.supplyRecent, supplyTotal: w.supplyTotal,
  naverGrowth: w.naverGrowth, naverLast7: w.naverLast7, demandShare: w.demandShare,
  lowVolume: w.lowVolume ? 'Y' : '',
  sources: w.sources, action: w.action, note: '', videoUrl: '', publishedAt: '',
}));
for (const c of discoveries) {
  csvRows.push({
    date, term: `[신규] ${c.term}`, score: c.score, velocity: c.hits, crossPlatform: c.platformCount,
    supplyDeficit: '', fit: c.fit, redditHits: '', blueskyHits: '', wikiGrowth: '', ytUploads: '',
    supplySource: '', supplyRecent: '', supplyTotal: '',
    naverGrowth: '', naverLast7: '', demandShare: '', lowVolume: '',
    sources: c.links.join(' | '), action: c.action, note: c.titles.join(' / '), videoUrl: '', publishedAt: '',
  });
}
const csvPath = await writeCSV(csvRows, `tracker_${date}.csv`);

// ─────────────────────────────────────────────── 글로벌 트렌드 CSV (전체 목록)
// watchlist와 무관한 축이라 별도 트래커로 둔다 (엑셀 시트 2개로 분리하기 위함)
// ★ 직격 매칭만이 아니라 "수집된 전부"를 넣는다 (국가별 50위 랭킹 포함)
const globalCsvRows = gmatch.all.map((g) => ({
  date,
  term: g.term,
  score: g.fitScore,
  velocity: '',
  crossPlatform: '',
  supplyDeficit: '',
  fit: (g.coreGroups || []).join('/'),
  redditHits: '',
  blueskyHits: '',
  wikiGrowth: '',
  ytUploads: '',
  supplySource: g.source,
  supplyRecent: g.metric || '',
  supplyTotal: '',
  naverGrowth: '',
  naverLast7: '',
  demandShare: '',
  lowVolume: '',
  sources: g.url || '',
  action: g.fitLevel || '',
  note: `[${g.geo}] ${g.formatLabel || ''} ${(g.coreGroups || []).join(',')}`,
  videoUrl: '',
  publishedAt: '',
}));
const globalCsvPath = globalCsvRows.length
  ? await writeCSV(globalCsvRows, `global_trends_${date}.csv`)
  : null;

// ─────────────────────────────────────────────── 리포트
const okSourceCount = [raw.reddit, raw.bluesky, raw.kym, raw.itch, yt.trending, nv, wk].filter(
  (a) => Array.isArray(a) ? a.length > 0 : !!a
).length;
// ⚠️ 스냅샷은 용량 때문에 1,500건으로 캡한다 → 리포트/Discord는 전체 목록이 필요하므로 직접 넘긴다
const reportPath = await writeReport(snapshot, { errors, okSourceCount, globalAll: gmatch.all, crossCountry, crossover });

console.log('');
console.log('─────────────────────────────');
console.log(`소요시간: ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log(`리포트: ${reportPath}`);
console.log(`CSV    : ${csvPath}`);
console.log('');
console.log('🔴 ACT');
for (const w of watch.filter((x) => x.action === 'ACT')) console.log(`  • ${w.term} (${w.score}점) V${w.velocity} ${w.crossPlatform}플랫폼 yt=${w.ytUploads || '-'}`);
console.log('🟡 WATCH');
for (const w of watch.filter((x) => x.action === 'WATCH')) console.log(`  • ${w.term} (${w.score}점) naver=${w.naverGrowth || '-'}%`);
console.log('🆕 신규 발견');
for (const c of discoveries.slice(0, 10)) console.log(`  • ${c.term} (${c.score}점) ${c.platforms.join(',')}`);
if (gIdeas.length) {
  console.log(`\n🌍 글로벌 트렌드 (수집 ${globalItems.length}건 → 적합 ${gmatch.matched.length}건)`);
  for (const g of gIdeas.slice(0, 6)) {
    console.log(`  • [${g.geo}] ${g.term} — ${g.fitLevel} ${g.fitScore}점 ${g.metric || ''} (${g.groups.join(',')})`);
  }
}
if (errors.length) {
  console.log('\n⚙️ 이슈');
  for (const e of errors) console.log('  - ' + e);
}

// ─────────────────────────────────────────────── 알림
if (cfg.discord?.webhookUrl) {
  try {
    const ok = await postDiscord(snapshot, cfg.discord.webhookUrl, cfg.discord?.globalWebhookUrl, gmatch.all);
    console.log(`\nDiscord 전송: ${ok ? '성공' : '실패'}`);
  } catch (e) { console.log(`\nDiscord 전송 실패: ${e.message}`); }
}
if (cfg.telegram?.botToken && cfg.telegram?.chatId) {
  try {
    const ok = await postTelegram(snapshot, cfg.telegram.botToken, cfg.telegram.chatId);
    console.log(`Telegram 전송: ${ok ? '성공' : '실패'}`);
  } catch (e) { console.log(`Telegram 전송 실패: ${e.message}`); }
}
