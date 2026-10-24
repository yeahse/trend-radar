import { clamp } from './util.mjs';
import { LOW_VOLUME_THRESHOLD } from './sources/naver.mjs';
import { proxySupplyDeficit } from './sources/youtube_supply.mjs';

const has = (hay, needle) => hay.includes(needle);

function matchTerm(text, term) {
  if (!text) return false;
  const t = text.toLowerCase();
  const k = term.toLowerCase();
  if (k.includes(' ')) return t.includes(k);
  return t.includes(k);
}

/**
 * TrendScore = Velocity(35) + CrossPlatform(20) + SupplyDeficit(25) + Fit(20)
 * - Velocity        : 최근 7일 반응량(레딧/블루스키/위키/네이버 성장률) 로그 스케일
 * - CrossPlatform  : 동시에 뜨는 플랫폼 수 (1곳뿐이면 가짜일 확률 높음)
 * - SupplyDeficit  : 같은 키워드 콘텐츠가 적을수록 높음 (공짜 시장)
 * - Fit            : 내 포맷으로 즉시 제작 가능한가
 */
export function scoreWatchlist({ terms, items, naver, wiki, uploads, supply, supplySource, fitTerms, history }) {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;

  const byPlatform = {};
  for (const it of items) {
    const text = `${it.title || ''} ${it.body || ''} ${it.term || ''}`;
    for (const term of terms) {
      if (!matchTerm(text, term)) continue;
      const ts = it.ts ? new Date(it.ts).getTime() : 0;
      const recent = ts > sevenDaysAgo;
      const k = `${term}||${it.platform}`;
      byPlatform[k] = byPlatform[k] || { total: 0, recent: 0, likes: 0, links: [], titles: [] };
      byPlatform[k].total++;
      if (recent) byPlatform[k].recent++;
      byPlatform[k].likes += it.likes || 0;
      if (it.link && byPlatform[k].links.length < 5) byPlatform[k].links.push(it.link);
      if (it.title && byPlatform[k].titles.length < 3) byPlatform[k].titles.push(it.title.slice(0, 110));
    }
  }

  const naverMap = new Map((naver || []).map((n) => [n.term.toLowerCase(), n]));
  const wikiMap = new Map((wiki || []).map((w) => [w.term.toLowerCase(), w]));

  return terms.map((term) => {
    const plats = new Set();
    let reddit = 0;
    let bluesky = 0;
    let likes = 0;
    const links = [];
    const titles = [];

    for (const [k, v] of Object.entries(byPlatform)) {
      const [t, p] = k.split('||');
      if (t !== term) continue;
      plats.add(p);
      if (p === 'reddit') reddit += v.recent;
      if (p === 'bluesky') bluesky += v.recent;
      likes += v.likes;
      links.push(...v.links);
      titles.push(...v.titles);
    }

    const na = naverMap.get(term.toLowerCase());
    const wk = wikiMap.get(term.toLowerCase());

    // 1) Velocity
    let rawVelocity = reddit * 3 + bluesky * 2 + likes / 100;
    if (na) {
      // 저볼륨 = 분모 0 근처. %성장률이 100%여도 절대량이 0이면 노이즈 → 볼륨에 비례해 감쇠
      const volFactor = clamp((na.last7 || 0) / LOW_VOLUME_THRESHOLD, 0, 1);
      rawVelocity += Math.max(0, na.growth) * 0.6 * volFactor;
      // 절대 수요 (네이버 REF 앵커 스케일 = 배치 간 비교 가능)
      rawVelocity += Math.min(na.last7 || 0, 400) * 0.09;
    }
    if (wk) rawVelocity += Math.max(0, wk.growth7) * 0.35 + Math.max(0, wk.growth3) * 0.2;
    const velocity = clamp(Math.log10(1 + rawVelocity) * 27, 0, 100);

    // 2) CrossPlatform
    const crossPlatform = clamp(plats.size * 25, 0, 100);

    // 3) SupplyDeficit (uploads가 적을수록 좋은 시장)
    let supplyDeficit = 60;
    let supplySource = 'none';
    let supplyRecent = '';
    let supplyTotal = '';
    const up = uploads?.[term];
    if (typeof up === 'number') {
      // YouTube Data API totalResults 스케일 (2026-10-23 실측 기준점:
      //  제비차 457 · 해리포터AI 16,680 · TS말포이 21,742 · fem!draco 65,920
      //  female draco 71,408 · 말포이 88,656 · harry potter 281,190 · flying tesla 1,000,000+)
      supplyDeficit =
        up <= 1000 ? 100 : up <= 5000 ? 90 : up <= 25000 ? 75 : up <= 75000 ? 55 : up <= 200000 ? 40 : 25;
      supplySource = 'api';
    } else if (supply?.[term]) {
      const p = supply[term];
      supplyDeficit = proxySupplyDeficit(p.count);
      supplySource = 'proxy';
      supplyRecent = p.count;
      supplyTotal = p.total;
    }

    // 4) Fit
    const tl = term.toLowerCase();
    const fitHit = (fitTerms || []).find((f) => tl.includes(f.toLowerCase()));
    const fit = fitHit ? 100 : 35;

    // 5) 모멘텀 (어제 대비 점수 상승)
    let momentum = 0;
    const h = history?.get(tl) || [];
    if (h.length >= 2) {
      const prev = h[h.length - 2].score;
      momentum = clamp((h[h.length - 1].score - prev) * 2, -20, 20);
    }

    const score = Math.round(
      velocity * 0.35 + crossPlatform * 0.2 + supplyDeficit * 0.25 + fit * 0.2 + momentum
    );

    const action = score >= 55 ? 'ACT' : score >= 35 ? 'WATCH' : 'IGNORE';

    return {
      term,
      score: clamp(score, 0, 100),
      velocity: Math.round(velocity),
      crossPlatform: plats.size,
      platforms: [...plats],
      supplyDeficit,
      fit: fitHit || 0,
      momentum: Math.round(momentum),
      redditHits: reddit,
      blueskyHits: bluesky,
      likes,
      wikiGrowth: wk ? Number(wk.growth7?.toFixed(1)) : '',
      naverGrowth: na ? Number(na.growth?.toFixed(1)) : '',
      naverLast7: na ? na.last7 : '',
      demandShare: na?.demandShare ?? '',
      lowVolume: na ? !!na.lowVolume : false,
      ytUploads: typeof up === 'number' ? up : '',
      supplySource,
      supplyRecent,
      supplyTotal,
      supplyUnknown: typeof up !== 'number' && !supply?.[term],
      sources: links.slice(0, 5).join(' | '),
      titles: titles.slice(0, 3),
      action,
      note: '',
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * 신규 발견 — watchlist에 없던 키워드를 콘텐츠/커뮤니티에서 자동 후보로 뽑는다.
 * 노이즈를 줄이기 위해: (1) 광범위한 stopword 제거 (2) 고유명사 우대 (3) 2개 플랫폼 이상 또는 4회 이상 등장
 */
const STOP = new Set([
  'the','and','for','with','that','this','you','from','are','was','not','have','has','had','but','its',
  'his','her','their','they','them','she','him','our','your','my','me','we','us','it','its','who','what',
  'when','where','which','why','how','all','any','can','will','just','like','more','most','some','such',
  'only','other','over','than','then','there','these','those','been','being','into','out','up','down','off',
  'get','got','get','make','made','take','see','know','think','back','now','new','one','two','first','last',
  'does','did','done','even','still','much','many','one','way','well','also','about','after','before','because',
  'if','so','no','yes','say','says','said','see','really','thing','things','people','guy','guys','im','ive',
  'dont','doesnt','didnt','cant','wont','isnt','wasnt','yeah','lol','lmao','omg','wtf','idk','tbh','ngl',
  'full','game','video','official','trailer','shorts','part','ep','eps','vs','ft','am','pm','via','per',
  'time','times','day','days','week','week','year','years','good','great','best','love','hate','cool','nice',
  'left','right','next','last','long','still','even','ever','never','always','often','really','actually',
  'song','show','movie','series','season','episode','channel','video','videos','clip','edit','edits',
  'is','a','an','am','as','at','be','by','do','go','he','if','in','it','me','my','no','of','on','or',
  'so','to','up','us','we','dude','pull','gonna','wanna','goin','nah','yep','nope','stuff','thing','things',
  'guy','guys','boy','girl','girlfriend','boyfriend','people','person','life','world','way','want','need',
  'look','think','know','see','say','tell','feel','keep','put','take','give','let','run','walk','talk',
  'watch','read','write','play','eat','drink','sleep','die','kill','fight','win','lose','try','use','help',
  'girl','lady','moment','mind','face','hand','head','eyes','body','life','friend','friends','family',
  'original','term','please','spell','club','change','story','world','art','fan','fake','real','big',
  'small','old','top','away','here','there','everyone','anyone','someone','nobody','myself','yourself',
  'excerpt','chapter','episode','season','series','title','name','names','part','parts','character',
  'characters','story','stories','scene','scenes','moment','moments','ending','beginnings','first',
  // 2026-10-23 추가: 신규 발견 후보에 'online/maybe/thinking/looking/queer' 등 쓰레기 유입 차단
  'online','offline','maybe','thinking','looking','watching','reading','posting','replying','replied',
  'following','follower','subscribed','subscribe','subscription','upvote','downvote','karma',
  'subreddit','reddit','twitter','tiktok','discord','instagram','thread','posts','comment','commenting',
  'question','questions','idea','ideas','finally','literally','basically','probably','definitely',
  'apparently','honestly','personally','pretty','quite','rather','somewhat','enough','yet','already',
  'sometimes','usually','rarely','barely','hardly','almost','nearly','around','during','until','since',
  'although','though','however','therefore','plus','minus','without','within','onto','towards','toward',
  'under','again','once','twice','where','when','why','whom','whose','whatever','whoever','anybody',
  'everybody','somebody','something','anywhere','everywhere','else','others','another','both','either',
  'neither','few','several','own','such','less','least','lot','lots','bit','little','huge','tiny','past',
  'future','tomorrow','yesterday','hour','hours','minute','minutes','second','seconds','afternoon',
  'evening','night','way','ways','stuff','kid','kids','boy','boys','man','men','woman','women',
  'understand','understands','understood','likes','liked','loves','loved','hates','hated','worse',
  'worst','cutest','weird','strange','funny','hilarious','sad','angry','happy','scared','thinks',
  'thought','knows','knew','wants','wanted','needs','needed','makes','takes','gets','seen','saw',
  'tells','told','uses','used','tries','tried','works','working','plays','played','reads','writes',
  'wrote','comes','came','goes','went','looks','looked','feels','felt','keeps','kept','puts','gives',
  'gave','lets','runs','ran','walks','walked','talks','talked','watches','watched','eats','ate',
  'drinks','slept','sleeps','dies','died','kills','killed','fights','won','wins','loses','lost',
  'helps','helped','starts','started','stops','stopped','turns','turned','moves','moved','draws',
  'drew','paints','creates','created','posted','uploads','uploaded','shares','shared','followed',
  // 2026-10-23 2차 추가: DA/Reddit UI 잔재 + 축약형
  'comments','comment','reply','replies','share','shares','like','unlike','repost','reposts',
  'don\'t','doesn\'t','didn\'t','can\'t','won\'t','isn\'t','wasn\'t','aren\'t','weren\'t','shouldn\'t',
  'couldn\'t','wouldn\'t','that\'s','there\'s','it\'s','i\'m','you\'re','they\'re','we\'re','i\'ve',
  'you\'ve','they\'ve','i\'ll','you\'ll','let\'s','gonna','wanna','gotta','gotcha','yep','nope',
  'yeah','hey','hi','hello','please','thanks','thank','sorry','ok','okay','lol','rofl','lmao',
  'imo','imho','tbh','ngl','idk','iirc','afaik','smh','irl','ftw','gg','wp','np','tl;dr','omg',
  'what\'s','where\'s','who\'s','he\'s','she\'s','when\'s','how\'s','here\'s','why\'s','just',
  // 2026-10-23 3차 추가: DA/Reddit 피드 메타 워드
  'source','link','url','crosspost','original','op','pinned','stickied','archived','deleted',
]);

/**
 * 광범위 포맷/장르 단어 — 단독으로는 행동 지시가 되지 않는다.
 * STOP 과 달리 "bigram"에서는 살아남는다 (예: 'genderbend fanart').
 * 단독으로 후보에 오려면 2개 플랫폼 이상 + 6회 이상 등장해야 한다.
 */
const GENERIC = new Set([
  'fanart','fanarts','art','arts','artwork','anime','manga','cartoon','comic','comics','drawing',
  'drawings','sketch','character','characters','girl','girls','boy','boys','woman','women','man',
  'men','person','people','content','creator','creators','artist','edits','edit','videos','video',
  'post','posts','image','images','photo','photos','scene','scenes','story','storyline','design',
  'style','styleart','animation','animations','fandom','fanfic','fanfiction','inspiration','inspo',
  'oc','ocs','au','aus','selfinsert','headcanon','kink','kinks','poly','polyam','fantasy','fantasies',
]);

// 불필요한 일반 단어 (고유명사 판정 시 제외)

const isCap = (w) => /^[A-Z]/.test(w) && !/^(I|A|An|The|And|But|So|This|That|My|Your|His|Her|Its|What|When|Why|How)$/.test(w);

export function discoverCandidates({ items, fitTerms, watchTerms, max = 20 }) {
  const count = new Map();
  const bump = (key, it, title, proper) => {
    if (!key || key.length < 4) return;
    if (STOP.has(key)) return;
    if (watchTerms.some((t) => t.toLowerCase() === key)) return;
    const c = count.get(key) || { term: key, hits: 0, platforms: new Set(), links: [], titles: [], proper: false };
    c.hits++;
    c.platforms.add(it.platform);
    if (proper) c.proper = true;
    if (it.link && c.links.length < 3) c.links.push(it.link);
    if (c.titles.length < 3) c.titles.push(title.slice(0, 100));
    count.set(key, c);
  };

  for (const it of items) {
    const title = (it.title || '').trim();
    if (!title || title.length < 5 || title.length > 140) continue;
    const raw = title.split(/\s+/);
    const clean = raw.map((w) => w.replace(/[^A-Za-z0-9가-힣'-]/g, ''));
    for (let i = 0; i < clean.length; i++) {
      const w1 = clean[i];
      if (!w1) continue;
      bump(w1.toLowerCase(), it, title, isCap(w1));
      if (i + 1 < clean.length && clean[i + 1]) {
        const w2 = clean[i + 1];
        const bg = `${w1} ${w2}`.toLowerCase();
        const properBg = (isCap(w1) && i > 0) || (isCap(w2) && !STOP.has(w2.toLowerCase()));
        if (bg.split(' ').every((p) => !STOP.has(p))) bump(bg, it, title, properBg);
      }
    }
  }

  return [...count.values()]
    .map((c) => {
      const pl = c.platforms.size;
      const fitHit = (fitTerms || []).find((f) => c.term.includes(f.toLowerCase()));
      const score = clamp(
        c.hits * 5 + pl * 16 + (c.proper ? 12 : 0) + (fitHit ? 22 : 0) + (c.term.includes(' ') ? 8 : 0),
        0,
        100
      );
      return {
        term: c.term,
        hits: c.hits,
        platforms: [...c.platforms],
        platformCount: pl,
        proper: c.proper,
        score: Math.round(score),
        fit: fitHit || '',
        links: c.links,
        titles: c.titles,
        action: score >= 55 ? 'ACT' : score >= 35 ? 'WATCH' : 'IGNORE',
      };
    })
    .filter((c) => {
      // 단일 일반어(고유명사 아님, fit 아님)는 "넓은 신호"여야 후보가 된다
      if (!c.proper && !c.term.includes(' ') && !c.fit) {
        if (GENERIC.has(c.term)) return c.platformCount >= 2 && c.hits >= 6;
        return c.platformCount >= 2 && c.hits >= 4;
      }
      const meaningful = c.proper || c.term.includes(' ') || c.fit;
      const freq = c.platformCount >= 2 || c.hits >= 3;
      return meaningful && freq;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
