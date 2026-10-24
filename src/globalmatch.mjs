import { attachPatterns } from './trendpattern.mjs';

/**
 * 🌍 글로벌 트렌드 → (1) 지금 유행하는 미디어 형식 (2) 내 채널 포맷 매칭
 *
 * 2026-10-23 실측에서 배운 것:
 *   - YouTube 인기영상은 "Official Trailer"가佔多数 → 이걸 그대로 "내 포맷 적합"으로 잡으면
 *     노이즈 폭탄. → 'trailer' 같은 극일반 단어는 신호에서 뺀다.
 *   - 그래서 신호를 두 갈래로 나눈다:
 *       CORE  (성별전환/AI애니/원작IP/TS남주/커뮤니티) = 하나만 맞으면 내 포맷으로 직격
 *       FORMAT(시리즈/숏폼)                        = 코어와 함께 맞을 때만 가산
 */

/** 코어 신호 — 하나만 맞아도 내 포맷으로 바로 옮길 수 있다 */
export const CORE_SIGNALS = {
  성별전환: ['genderbend', 'gender swap', 'genderswap', 'female version', 'male version', 'body swap', 'genderbent', 'femboy', 'tsundere', '女体化', '재성별', 'gender change', 'male to female', 'female to male'],
  AI애니: ['ai art', 'aiart', 'ai anime', 'ai animation', 'ai video', 'aigenerated', 'aigc', 'animation', 'animated', 'anime', 'cartoon', 'comic', 'webtoon', 'manhwa', 'vtuber', 'motion comic'],
  // ⚠️ IP 고유어(브랜드·특정작품명)는 **전부 제외** (2026-10-23 사용자 지시).
  //    "harry potter"만 빼면 "marvel"·"nintendo"·"pokemon"이 같은 자리로 들어오므로
  //    브랜드명을 전부 걷어내고, **장르/포맷 일반어만** 남긴다.
  //    → 적합성은 특정 IP가 아니라 "fantasy·마법·애니·성별전환·시리즈" 같은 포맷으로만 결정된다.
  원작IP: ['fantasy', 'magic', 'wizard', 'witch', 'dragon', 'anime series', 'manga', '마법', '마술', '魔法', '원작', '판타지', '판타지세계', '완전新作', '신작', '개작', '마법소녀', 'isekai', 'wuxia'],
  TS남주: ['tsundere', 'male lead', 'romance', 'romcom', 'yuri', 'otome', 'love story', 'confession', 'kiss', 'bl reader', 'x reader'],
  커뮤니티: ['fanfic', 'ao3', 'fanfiction', 'headcanon', 'wattpad', 'fanart', 'rpf', 'ao3', 'bl series', 'reader insert'],
};

/** 포맷 신호 — 코어와 곁들일 때만 의미가 있다 (단독으로는 약함) */
export const FORMAT_SIGNALS = {
  시리즈연작: ['episode', 'ep1', 'ep2', 'ep01', 'season 2', 'season 3', 'part 1', 'part 2', 'chapter 1', 'webtoon series', 'comic series', 'manga series', 'final episode', 'episode 1'],
  숏폼트렌드: ['tiktok', 'shorts', 'reels', 'viral', 'meme', 'challenge', 'trend', 'template', 'satisfying', 'asmr', 'glow up', 'transformation', 'aesthetic', 'sound', 'edit', 'dance', 'core', 'brainrot'],
  밈커뮤니티: ['reaction', 'troll', 'drama', 'exposed', 'gone wrong', 'satisfying', 'cursed', 'dark humor'],
};

/** 콘텐츠 형식 분류 — "지금 어떤 종류의 미디어가 유행하는가" */
export const FORMAT_CLASSIFIERS = [
  { name: '공식_trailer', label: '공식 예고편/티저', words: ['official trailer', 'trailer', 'teaser', 'first look', 'announcement', 'gameplay', 'game play', '予告', '예고', '예고편', '공식', 'ティザー', 'pv', 'calling all', 'meet the', 'reveal', 'launch trailer'] },
  { name: '시리즈_연작', label: '시리즈/연작 화', words: ['episode', 'ep1', 'ep2', 'season 2', 'season 3', 'part 1', 'part 2', 'chapter', 'finale', '화', '_CALLBACK', 'callback', 're:'] },
  { name: '애니_만화', label: '애니/만화/웹툰', words: ['anime', 'manga', 'webtoon', 'manhwa', 'animation', 'animated', 'comic', 'cartoon', 'dub', 'sub', 'アニメ', '漫画', 'アニメ化'] },
  { name: '음악_MV', label: '음악/MV', words: ['official music video', 'mv', 'm/v', 'lyric video', 'audio', 'song', 'remix', 'live performance', 'freestyle', 'the first take', 'kpop', 'idol', 'comeback', 'stage', '舞蹈', '歌', 'mv', 'music video', 'lyrics', 'letra', 'video oficial', 'official audio', 'visualizer', 'original mix', 'acoustic', 'feat.', 'remix', ' song ', ' dance '] },
  { name: '댄스_퍼포먼스', label: '댄스/퍼포먼스', words: ['dance', 'choreography', 'performance', 'breakdance', 'waack', '기(ev)', '댄스', '웹스텝', '踊', 'ダンス', '퍼포먼스'] },
  { name: 'VTuber_스트리밍', label: 'VTuber/스트리밍', words: ['vtuber', 'hololive', 'stream', 'livestream', 'clip', '고라', 'ホロライブ', '配信', '生放送', '.stream'] },
  { name: '게임_챌린지', label: '게임/챌린지', words: ['roblox', 'fortnite', 'minecraft', 'gameplay', 'challenge', 'lets play', 'speedrun', 'skit', 'gacha', 'pull', 'майн크래프트', 'マイクラ', 'ゲーム', 'gaming', 'plays ', 'squad builder', 'gamers won', 'robux', 'showdown', 'modern warfare', 'valheim', 'prop hunt', 'open box', 'loot', 'takeover', ' fc 2'] },
  { name: '숏폼_밈', label: '숏폼/밈', words: ['shorts', 'tiktok', 'reels', 'meme', 'viral', 'trend', 'template', 'satisfying', 'asmr', 'glow up', 'transformation', 'reaction', 'troll', 'brainrot', 'core', 'aesthetic', 'relatable', 'irl', 'irl', 'when you', 'meirl', 'pov', 'watch me', 'do not ', 'ate them', 'messed up', 'i made', 'i took', 'i tried', 'i spent', 'i ranked', 'i bought', 'i opened', 'i played'] },
  { name: 'AI제작', label: 'AI 생성 콘텐츠', words: ['ai ', 'ai-', 'aigenerated', 'aigc', 'aiart', 'ai art', 'sora', 'veo', 'midjourney', 'stable diffusion', 'ai animation', 'ai video', 'ai song'] },
  { name: '성별전환', label: '성별전환/TS', words: ['genderbend', 'gender swap', 'genderswap', 'female version', 'male version', 'tsundere', 'femboy', 'body swap', '女体化', 'mf', 'ff', 'ts ', '女', '男子', '女子'] },
  { name: '원작_판타지', label: '원작/판타지/마법', words: ['harry potter', 'hogwarts', 'wizarding', 'fantasy', 'magic', 'wizard', 'witch', 'dragon', 'marvel', 'dc comics', 'star wars', 'nintendo', 'pokemon', 'ghibli', 'jujutsu', 'demon slayer', 'ハリー・ポター', '마법', '마술', '魔法', 'nirah', '呪い', '원작', '보드게임', 'board game', 'narnia'] },
  { name: '뉴스_시사', label: '뉴스/시사', words: ['news', 'breaking', 'official statement', 'speech', 'press conference', 'interview', 'live', 'ニュース', '報道', '사건', '사고', '뉴스'] },
  { name: '시즌_이벤트', label: '시즌/이벤트', words: ['halloween', 'christmas', 'spooky', 'thanksgiving', 'new year', 'valentine', 'haloween', '할로윈', '크리스마스', 'ホalloween', '크리سم스', 'advent'] },
  { name: '음식_브이로그', label: '음식/브이로그/리뷰', words: ['recipe', 'cooking', 'mukbang', 'vlog', 'review', 'unboxing', 'podcast', 'haul', 'asmr', '리뷰', '먹방', '브이로그', '요리', '烹饪'] },
  { name: '드라마_영화', label: '드라마/영화', words: ['movie', 'film', 'drama', '映画', '드라마', 'ドラマ', '시네마', '연출'] },
  { name: '교육_상식', label: '교육/상식', words: ['explained', 'physics', 'newton', 'law', 'facts', 'learn', 'tutorial', 'how to', '왜', '원리', '物理学', '解説'] },
  { name: '스포츠_경기', label: '스포츠/경기', words: [' vs ', 'football', 'soccer', 'nba', 'nfl', 'ufc', 'boxing', 'match', 'highlights', 'standings', 'playoffs', 'futbol', ' champions ', 'league', 'gol'] },
];

export function classifyFormat(text) {
  const t = String(text || '').toLowerCase();
  for (const c of FORMAT_CLASSIFIERS) {
    if (c.words.some((w) => t.includes(w))) return c;
  }
  return { name: '기타', label: '기타' };
}

/** 트렌드 규모 정규화 */
function magnitudeScore(n, source) {
  if (!n) return 0;
  if (source === 'google-trends') return Math.min(3, Math.log10(n + 1) * 1.2);
  if (source === 'youtube-popular') return Math.min(3, Math.log10(n + 1) * 1.0);
  if (source === 'wikipedia') return Math.min(3, Math.log10(n + 1) * 1.1);
  return 0;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 단어 매칭 — 알파벳 단어는 **단어 경계**를 요구한다.
 * 2026-10-23 실측 버그: 'witch' 가 "Nintendo Swi[tch] 2" 에서도 걸려
 * Zelda 트레일러가 '원작IP' 로 오탐 → 부분문자열 매칭이 위험.
 * 한글/일본어/중국어는 어절 경계가 애매하므로 부분문자열로 간다.
 */
function hitWord(text, w) {
  const lw = w.toLowerCase();
  if (/^[a-z][a-z0-9 '&.+-]*$/.test(lw)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRe(lw)}([^a-z0-9]|$)`, 'i').test(text);
  }
  return text.includes(lw);
}

/**
 * 매칭 — 코어/포맷 분리 점수
 * @returns {{matched:Array, all:Array, formatMix:Array}}
 */
export function matchGlobalTrends(items, { coreSignals, formatSignals, fitTerms = [] } = {}) {
  const core = coreSignals || CORE_SIGNALS;
  const fmt = formatSignals || FORMAT_SIGNALS;
  const fit = (fitTerms || []).map((f) => f.toLowerCase());
  const all = [];

  for (const it of items || []) {
    // ⚠️ 채널명은 매칭에 넣지 않는다 (reddit 채널명이 'r/popular'면 'r/' 패턴에 전부 걸린다)
    const text = String(it.term || '').toLowerCase();
    const coreHits = [];
    for (const [group, words] of Object.entries(core)) {
      if (!Array.isArray(words)) continue;
      const m = words.filter((w) => hitWord(text, w));
      if (m.length) coreHits.push({ group, matched: m.slice(0, 3) });
    }
    const fmtHits = [];
    for (const [group, words] of Object.entries(fmt)) {
      if (!Array.isArray(words)) continue;
      const m = words.filter((w) => hitWord(text, w));
      if (m.length) fmtHits.push({ group, matched: m.slice(0, 3) });
    }
    const fitHit = fit.filter((f) => hitWord(text, f));

    // 코어 1그룹 = 12점, 포맷 1그룹 = 6점(코어가 있을 때만), fitTerm = 10점
    const coreScore = coreHits.length * 12 + fitHit.length * 10;
    const fmtScore = coreHits.length > 0 ? fmtHits.length * 6 : 0;
    const score = Math.round(coreScore + fmtScore + magnitudeScore(it.metricNum, it.source) * 3);

    const cls = classifyFormat(text);
    all.push({
      ...it,
      format: cls.name,
      formatLabel: cls.label,
      coreGroups: coreHits.map((h) => h.group),
      coreMatched: coreHits.flatMap((h) => h.matched),
      fmtGroups: fmtHits.map((h) => h.group),
      fitHit,
      fitScore: score,
      fitLevel: coreScore >= 24 ? 'HIGH' : coreScore >= 12 ? 'MID' : coreScore > 0 ? 'LOW' : 'NONE',
    });
  }

  const matched = all
    .filter((x) => x.fitScore > 0)
    .sort((a, b) => b.fitScore - a.fitScore || (b.metricNum || 0) - (a.metricNum || 0));

  // 유행하는 미디어 형식 분포
  // ⚠️ wikipedia(토픽/인물)·google-trends(검색어)·reddit(밈/뉴스)는 "미디어"가 아니라
  //    "관심사" 축이라 형식 집계에서 제외 (YouTube 인기영상만 집계)
  const mixMap = new Map();
  for (const it of all) {
    if (it.source !== 'youtube-popular') continue;
    const c = mixMap.get(it.format) || { name: it.format, label: it.formatLabel, n: 0, views: 0 };
    c.n++;
    c.views += it.metricNum || 0;
    mixMap.set(it.format, c);
  }
  const formatMix = [...mixMap.values()].sort((a, b) => b.n - a.n || b.views - a.views);

  return { matched, all, formatMix };
}

/** 변환 축 힌트 */
export const ANGLE_HINTS = {
  성별전환: '원작 캐릭터 성별전환 / "TS(남자 주인공) 시점" 으로 뒤집기',
  AI애니: 'AI 애니메이션으로 변환 (1~3초 숏폼)',
  원작IP: '원작 세계관/연출 그대로 가져오기',
  TS남주: '남자 주인공 POV + 설렘/고백 장면',
  커뮤니티: '팬픽/커뮤니티 취향(fic/headcanon) 그대로 소화',
  시리즈연작: '연작/시리즈로 만들기 (1편=1화)',
  숏폼트렌드: '그 틱톡/숏폼 포맷 그대로 적용 (템플릿/사운드)',
  밈커뮤니티: '밈/리액션 포맷 그대로 적용',
};

/** 추천 아이디어 (판단은 네가 하는 거 — 아이디어 자동생성 아님) */
export function buildIdeas(matched, { max = 8, channelHint = '' } = {}) {
  // ⚠️ 같은 영상/트렌드가 여러 국가에 동시에 올라올 수 있다 (예: NARNIA 트레일러 5개국).
  //    국가별로 중복 노출하면 후보가 같은 걸로 꽉 차므로 **term 단위로 중복 제거**한다.
  const seen = new Set();
  const picked = [];
  for (const m of matched) {
    if (!m.coreGroups.length && !m.fitHit.length) continue;
    const key = (m.term || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    picked.push(m);
    if (picked.length >= max) break;
  }
  const pats = attachPatterns(picked, { channelHint });
  return pats.map((m) => {
      const groups = [...m.coreGroups, ...m.fmtGroups];
      const angles = groups.map((g) => ANGLE_HINTS[g]).filter(Boolean);
      const metric =
        m.source === 'google-trends'
          ? `검색 ${m.metric || '-'}`
          : m.source === 'youtube-popular'
            ? `${Number(m.metric || 0).toLocaleString('ko-KR')}뷰`
            : m.source === 'wikipedia'
              ? `${Number(m.metric || 0).toLocaleString('ko-KR')}뷰`
              : m.source === 'reddit-popular'
                ? `r/${String(m.channel || 'popular').replace('r/', '')}`
                : '';
      return {
        term: m.term,
        source: m.source,
        geo: m.geo,
        metric,
        fitScore: m.fitScore,
        fitLevel: m.fitLevel,
        groups,
        angles: angles.slice(0, 2),
        // ★ 구조→제안 (attachPatterns 결과) — 여기서 실수로 떨어뜨리지 말 것
        idea: m.idea || angles[0] || '',
        axes: m.axes || angles.slice(0, 2),
        patterns: m.patterns || [],
        formatLabel: m.formatLabel,
        url: m.url,
      };
  });
}

/**
 * ★ 상대속도(velocity) — views / 게시 후 경과시간
 *
 * 왜 필요한가 (2026-10-23 실측):
 *   YouTube mostPopular 의 "1등"은 **절대 조회수 최대** = "가장 크게 키웠던 과거 콘텐츠".
 *   → 뮤비가 1등을 독차지 (국가 1등 중 51%가 음악, 전체는 18% = 2.9배 과잉).
 *   → 근데 뮤비의 조회수 **중앙값은 48만으로 공식예고편(97만)보다 낮다**.
 *   → 즉 뮤비가 이기는 건 "평균이 크다"가 아니라 **tail(금요일 신작 폭발)** 때문이다.
 *   → 절대 조회수를 버리고 상대속도로 재랭킹하면 음악 비중이 51% → 14%로 떨어지고
 *      진짜 "지금 뜨는 것"(Minecraft 챌린지, $1M 챌린지, 숏폼)이 드러난다.
 */
export function addVelocity(items, now = Date.now()) {
  for (const it of items || []) {
    if (!it.publishedAt) { it.vel = 0; it.hoursOld = null; continue; }
    const t = new Date(it.publishedAt).getTime();
    const h = Math.max(0.2, (now - t) / 3600000);
    it.hoursOld = Math.round(h * 10) / 10;
    it.vel = (it.metricNum || it.metric || 0) / h;
  }
  return items;
}

/**
 * ★ N개국 동시 1등 = 진짜 글로벌 트렌드
 *
 * 1개국 1등 = 그 나라 뉴스.
 * **여러 국가에서 동시에 1등이면 = 세계가 지금 같이 먹고 있는 포맷.**
 * 2026-10-23 실측: "If You Escape, You Win $1,000,000" 이 10개국 동시 1등 (영미권 통틀어),
 * "GTA VI Launch Trailer" 6개국, "CHICOS vs CHICAS" 4개국(스페인어권).
 */
export function crossCountryLeaders(items) {
  const geos = [...new Set((items || []).map((x) => x.geo))];
  const total = geos.length || 1;
  const byKey = new Map();
  for (const g of geos) {
    const rows = (items || []).filter((x) => x.geo === g);
    if (!rows.length) continue;
    const top = [...rows].sort((a, b) => (b.vel || 0) - (a.vel || 0))[0];
    if (!top.vel) continue;
    const key = (top.term || '').toLowerCase().replace(/[^a-z0-9가-힣一-龥぀-ヿ]/gi, '').slice(0, 40);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, { title: top.term, channel: top.channel, vel: top.vel, format: top.formatLabel, url: top.url, geos: [] });
    }
    byKey.get(key).geos.push(g);
  }
  return [...byKey.values()]
    .filter((v) => v.geos.length >= 2)
    .map((v) => {
      const coverage = v.geos.length / total;
      // ⚠️ 12개국 전부(=거의 전부)면 "각국 신호"가 아니라 **글로벌 동시 히트**다.
      //    지역 확산 신호로 볼 수 있는 건 2~5개국 구간이다.
      const kind =
        coverage >= 0.6 ? '글로벌 동시 히트' : v.geos.length <= 5 ? '지역 확산 신호' : '광범위';
      return { ...v, coverage: Math.round(coverage * 100), kind, isGlobalHit: coverage >= 0.6 };
    })
    .sort((a, b) => b.geos.length - a.geos.length || b.vel - a.vel);
}

/** 리포트 마크다운 — 길고 넓게 */
export function globalTrendsMarkdown({ all, ideas, formatMix, geos, total, matchedCount, crossCountry = [], crossover = [] }) {
  const L = [];
  L.push('## 🌍 글로벌 트렌드 — 전 세계 지금 뜨는 것');
  L.push('');
  L.push(
    `> 수집 **${total ?? (all || []).length}건** · 국가 ${(geos || []).length}곳 · ` +
      `**내 포맷으로 옮길 수 있는 후보 ${ideas?.length || 0}건**`
  );
  L.push('');
  L.push(
    '> **원본은 100% 중립이다.** 채널 매칭은 "원본 위에 얹는 레이어"일 뿐이며, ' +
      '수집 단계는 watchlist를 참조하지 않는다. 원본만 보려면 `node src\\run.mjs --neutral` (매칭 OFF).'
  );
  L.push('');

  // ⓪⓪ ★ 크로스오버 (Reddit 대체) — 지금 퍼지는 중인지
  if (crossover.length) {
    L.push('### 🔀 크로스오버 — 지금 퍼지는 중인 포맷');
    L.push('');
    L.push('> YouTube `search(order=date)` 기준. **최근7일 비율 = 최신 50편 중 최근 7일 비율**, **신규채널 = 그 안에 새로 등장한 채널 수**.');
    L.push('> → 비율 90%+ & 신규채널 많음 = 지금 퍼지는 중 | 비율 낮음 = 이미 사그라든 포맷');
    L.push('');
    L.push('| 키워드 | 총공급 | 최근7일 | 채널(신규) | 점수 | 판정 |');
    L.push('|---|---|---|---|---|---|');
    for (const c of [...crossover].sort((a, b) => b.crossoverScore - a.crossoverScore)) {
      const hot = c.recentRatio >= 80 && c.newChannelCount >= 5;
      const cold = c.recentRatio <= 20;
      const judge = hot ? '🔥 **퍼지는 중**' : cold ? '💀 사그라듦' : '· 보통';
      L.push(
        `| **${(c.keyword || '').slice(0, 40)}** | ${Number(c.totalSupply).toLocaleString('ko-KR')} | ${c.recentCount}/${c.sampled} (**${c.recentRatio}%**) | ${c.channelCount} (신규 ${c.newChannelCount}) | ${c.crossoverScore} | ${judge} |`
      );
    }
    L.push('');
  }

  // ⓪ ★ N개국 동시 1등 = 진짜 글로벌 트렌드
  if (crossCountry.length) {
    L.push('### 🌐 지금 세계가 같이 먹고 있는 것 (N개국 동시 1등)');
    L.push('');
    L.push('> 1개국 1등 = 그 나라 뉴스. **여러 국가에서 동시에 1등이면 = 세계가 지금 같이 뜨는 포맷.**');
    L.push('');
    L.push('| 국가 수 | 콘텐츠 | 속도 | 형식 | 국 |');
    L.push('|---|---|---|---|---|');
    for (const c of crossCountry) {
      const kindTag = c.isGlobalHit ? '🌍' : c.geos.length <= 5 ? '🔀' : '·';
      L.push(
        `| ${kindTag} **${c.geos.length}개국** (${c.coverage}%) | ${(c.title || '').slice(0, 44)} | ${Math.round(c.vel).toLocaleString('ko-KR')}/h | ${c.format || '-'} | ${c.geos.join(' ')} |`
      );
    }
    L.push('');
    L.push('> **🌍 = 글로벌 동시 히트**(각국 신호 아님, 세계 전체가 같이 보는 것) · **🔀 = 지역 확산 신호**(따로 퍼지는 것 = 따라해도 안 따라함)');
    L.push('');
  }

  // ① 지금 유행하는 미디어 형식
  if (formatMix?.length) {
    L.push('### 🧭 지금 유행하는 미디어 형식 (무엇이 뜨나)');
    L.push('');
    L.push('| 형식 | 등장 건수 | 합산뷰 |');
    L.push('|---|---|---|');
    for (const f of formatMix.slice(0, 14)) {
      L.push(`| **${f.label}** | ${f.n} | ${f.views ? f.views.toLocaleString('ko-KR') : '-'} |`);
    }
    L.push('');
  }

  // ② 내 포맷으로 옮길 수 있는 것
  if (ideas?.length) {
    L.push('### 🎯 지금 올릴 수 있는 것 (글로벌 트렌드 × 내 포맷)');
    L.push('');
    L.push('| 순위 | 트렌드 | 지역 | 지표 | 형식 | 적합도 | 구조 → 적용 |');
    L.push('|---|---|---|---|---|---|---|');
    ideas.forEach((i, idx) => {
      const lvl = { HIGH: '🟢HIGH', MID: '🟡MID', LOW: '🔵LOW' }[i.fitLevel] || i.fitLevel;
      L.push(
        `| ${idx + 1} | **${i.term}** | ${i.geo} | ${i.metric || '-'} | ${i.formatLabel || '-'} | ${lvl} (${i.fitScore}) | ${(i.idea || i.angles?.join(' / ') || '-').replace(/\|/g, '/').slice(0, 110)} |`
      );
    });
    L.push('');
    L.push('> **구조 → 적용** = 그 트렌드의 형식 구조를 그대로 내 포맷에 옮긴 구체적 제안.');
    L.push('');
  } else {
    L.push('### 🎯 지금 올릴 수 있는 것');
    L.push('');
    L.push('_이번 수집에서 내 포맷과 직격으로 겹치는 트렌드가 없다._ (아래 원본 목록은 그대로 참고 가능)');
    L.push('');
  }

  // ③ 국가별 한눈에 보기
  const ytAll = (all || []).filter((x) => x.source === 'youtube-popular');
  const gtAll = (all || []).filter((x) => x.source === 'google-trends');
  const byCountry = new Map();
  for (const it of ytAll) {
    if (!byCountry.has(it.geo)) byCountry.set(it.geo, { yt: [], gt: [] });
    byCountry.get(it.geo).yt.push(it);
  }
  for (const it of gtAll) {
    if (!byCountry.has(it.geo)) byCountry.set(it.geo, { yt: [], gt: [] });
    byCountry.get(it.geo).gt.push(it);
  }
  if (byCountry.size) {
    L.push('### 📊 국가별 한눈에 보기');
    L.push('');
    L.push('| 국가 | YT 인기 #1 | YT뷰 | 급상승 검색어 #1 |');
    L.push('|---|---|---|---|');
    for (const [geo, v] of byCountry) {
      const y1 = v.yt[0];
      const g1 = v.gt[0];
      L.push(
        `| **${geo}** | ${(y1?.term || '-').slice(0, 42)} | ${y1 ? Number(y1.metric).toLocaleString('ko-KR') : '-'} | ${(g1?.term || '-').slice(0, 28)}${g1?.metric ? ` _(${g1.metric})_` : ''} |`
      );
    }
    L.push('');
  }

  // ④ 국가별 YouTube 인기 (속도 1등 = "지금 뜨는 것")
  if (ytAll.length) {
    L.push('### ▶ 국가별 지금 뜨는 것 (속도 1등 — 게시 후 시간당 조회수)');
    L.push('');
    L.push('> ⚠️ **절대 조회수 1등이 아니라 속도 1등.** 절대조회수는 "과거에 가장 크게 키웠던 것"이라');
    L.push('> 뮤비(금요일 신작)가 항상 1등을 차지한다(국가 1등 중 51% 음악 vs 전체 18%). 속도 순위는 그게 14%로 떨어진다.');
    L.push('');
    for (const geo of [...new Set(ytAll.map((x) => x.geo))]) {
      const rows = ytAll.filter((x) => x.geo === geo);
      const top = [...rows].sort((a, b) => (b.vel || 0) - (a.vel || 0)).slice(0, 5);
      L.push(`**${geo}**`);
      L.push('');
      L.push(
        top
          .map(
            (x) =>
              `${String(x.rank).padStart(2)}. ${(x.term || '').slice(0, 58)} — ${(x.channel || '').slice(0, 20)} ` +
              `**${Math.round(x.vel || 0).toLocaleString('ko-KR')}/h** _(${Number(x.metric || 0).toLocaleString('ko-KR')}뷰)_`
          )
          .join('\n')
      );
      L.push('');
    }
  }

  // ⑤ 국가별 급상승 검색어
  if (gtAll.length) {
    L.push('### 🗺 국가별 급상승 검색어 (관심사)');
    L.push('');
    for (const geo of [...new Set(gtAll.map((x) => x.geo))]) {
      const rows = gtAll.filter((x) => x.geo === geo);
      L.push(`**${geo}** — ` + rows.map((x) => `${x.term}${x.metric ? ` _(${x.metric})_` : ''}`).join(' · '));
      L.push('');
    }
  }

  // ⑥ Wikipedia 언어별 mostread
  const wiki = (all || []).filter((x) => x.source === 'wikipedia');
  if (wiki.length) {
    L.push('### 📚 Wikipedia 언어별 mostread (지금 화제)');
    L.push('');
    for (const lang of [...new Set(wiki.map((x) => x.geo))]) {
      const rows = wiki.filter((x) => x.geo === lang);
      L.push(`**${lang}** (${rows.length}건)`);
      L.push('');
      L.push(
        rows
          .map((x) => `${String(x.rank).padStart(2)}. ${(x.term || '').slice(0, 58)} _(${Number(x.metric || 0).toLocaleString('ko-KR')})_`)
          .join('\n')
      );
      L.push('');
    }
  }

  // ⑦ Reddit
  const rd = (all || []).filter((x) => x.source === 'reddit-popular');
  if (rd.length) {
    L.push('### 🔥 Reddit r/popular (지금 뜨는 콘텐츠)');
    L.push('');
    L.push(rd.map((x) => `${String(x.rank).padStart(2)}. ${x.term} _(${x.channel || ''})_`).join('\n'));
    L.push('');
  }

  L.push('> ⚠️ **TikTok / Instagram 은 공개 API 가 없다** (2026-10-23 실측: Creative Center API 404, IG는 SPA).');
  L.push('> → 틱톡/인스타는 `ads.tiktok.com/business/creativecenter` 와 `instagram.com/explore/tags` 를 브라우저로 직접 확인해야 한다 (수동 3분).');
  L.push('');
  return L.join('\n');
}
