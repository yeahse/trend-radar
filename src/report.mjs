import fs from 'node:fs/promises';
import path from 'node:path';
import { REPORTS_DIR, ensureDirs } from './store.mjs';
import { summary, reviewMarkdown } from './feedback.mjs';
import { globalTrendsMarkdown, crossCountryLeaders } from './globalmatch.mjs';
import { redact, quotaSummary } from './util.mjs';

const icon = { ACT: '🔴', WATCH: '🟡', IGNORE: '⚪' };

function table(rows, head) {
  if (!rows.length) return '_데이터 없음_\n';
  return (
    `| ${head.join(' | ')} |\n` +
    `|${head.map(() => '---').join('|')}|\n` +
    rows.map((r) => `| ${r.join(' | ')} |`).join('\n') +
    '\n'
  );
}

export async function writeReport(snapshot, meta) {
  await ensureDirs();
  const d = snapshot.date;
  const L = [];

  L.push(`# 📡 트렌드 레이더 브리핑 — ${d}`);
  L.push('');
  L.push(`> 수집 ${snapshot.collectedAt} | 소스 ${meta.okSourceCount}개 정상 / ${meta.errors.length}개 이슈`);
  L.push('');

  // ════════════════════════════════════════════════════════════
  // ★ 1. 🌍 글로벌 트렌드 — 가장 먼저 (세상이 먼저, 내 채널은 그 다음)
  // ════════════════════════════════════════════════════════════
  if (snapshot.global) {
    const g = snapshot.global;
    const gAll = meta.globalAll && meta.globalAll.length
      ? meta.globalAll.map((x) => ({
          source: x.source, geo: x.geo, term: x.term, channel: x.channel,
          metric: x.metric, fitScore: x.fitScore, fitLevel: x.fitLevel,
          format: x.format, formatLabel: x.formatLabel,
          coreGroups: x.coreGroups, fmtGroups: x.fmtGroups, url: x.url,
          // ★ 2026-10-24 수정 — 아래 5개가 빠지면 리포트에서 순위/속도가 깨진다.
          //   rank      : "12. 제목" 형식의 번호
          //   vel       : 상대속도(views/h) → 이게 빠지면 전부 "0/h" 로 표시됨
          //   hoursOld  : 게시 후 경과시간
          //   metricNum : 절대 수치(metric 은 문자열이라 숫자 정렬 불가)
          //   publishedAt: 게시 시각 (속도 계산 기준)
          rank: x.rank, vel: x.vel, hoursOld: x.hoursOld,
          metricNum: x.metricNum, publishedAt: x.publishedAt,
        }))
      : g.top || [];
    L.push('---');
    L.push('');
    L.push(
      globalTrendsMarkdown({
        all: gAll,
        ideas: g.ideas || [],
        formatMix: g.formatMix || [],
        geos: g.geos,
        total: g.total,
        matchedCount: g.matchedCount,
        perCountry: g.perCountry || 10,
        perCountryMax: g.perCountryMax || 20,
      })
    );
  }

  // ════════════════════════════════════════════════════════════
  // 2. 📌 내 감시 키워드 (watchlist) — 특정 IP를 밀어주는 게 아니라
  //    "내가 이미 추적 중인 키워드"의 상태만 따로 보는 보조 구간
  // ════════════════════════════════════════════════════════════
  L.push('---');
  L.push('');
  L.push('## 📌 내 감시 키워드 현황');
  L.push('');
  L.push('> 아래는 **네가 지정한 키워드**의 공급/수요 상태. 위 🌍 글로벌은 watchlist와 무관하다.');
  L.push('');

  // ── 2-1. 즉시 행동(ACT)
  const act = snapshot.watch.filter((x) => x.action === 'ACT');
  const watch = snapshot.watch.filter((x) => x.action === 'WATCH');
  L.push('### 🔴 ACT — 48시간 안에 1화');
  L.push('');
  if (!act.length) L.push('_오늘은 점수 기준 ACT 없음. 대신 신규 발견 후보를 아래에서 확인._\n');
  else {
    L.push(
      table(
        act.map((x) => [
          `**${x.term}**`,
          x.score,
          `V${x.velocity}`,
          `${x.crossPlatform}플랫폼`,
          x.ytUploads === ''
            ? (x.supplySource === 'proxy' ? `${x.supplyRecent}편(근사)` : '-')
            : `${x.ytUploads}편`,
          x.wikiGrowth === '' ? '-' : `위키 ${x.wikiGrowth}%`,
          x.naverGrowth === '' ? '-' : `네이버 ${x.naverGrowth}%`,
          x.fit || '-',
        ]),
        ['키워드', '점수', '속도', '크로스플랫폼', '최근업로드', 'IP트래픽', '한국수요', '적합']
      )
    );
    for (const x of act) {
      L.push(`### ▸ ${x.term} (${x.score}점)`);
      if (x.titles?.length) x.titles.forEach((t) => L.push(`- 관련: ${t}`));
      if (x.sources) L.push(`- 링크: ${x.sources}`);
      const warn = [];
      if (x.lowVolume) warn.push(`한국 검색 수요 저볼륨(7일합 ${x.naverLast7 ?? '-'} → %성장률 무효)`);
      if (x.supplyUnknown) warn.push('공급량 미측정(YouTube API 키 없음)');
      if (x.supplySource === 'proxy') warn.push(`공급량 근사치 ${x.supplyRecent}편/주 (YouTube 검색필터 기반, ±1~5% 오차)`);
      if (x.crossPlatform < 2) warn.push('단일 플랫폼 신호');
      if (warn.length) L.push(`- ⚠️ ${warn.join(' / ')}`);
      L.push('');
    }
    if (snapshot.watch.some((x) => x.supplyUnknown)) {
      L.push('> ⚠️ **공급량(최근업로드) 미측정** — YouTube API 키 없음 → SupplyDeficit는 기본값 60 가정값.');
      L.push('> 키를 넣으면 `config.json` → `youtube.apiKey` 설정 후 재실행.');
      L.push('');
    }
  }

  // ── 2. 신규 발견 후보
  L.push('### 🆕 신규 발견 후보 (감시 키워드 밖)');
  L.push('');
  L.push(
    table(
      snapshot.discoveries.slice(0, 12).map((c) => [
        `**${c.term}**`,
        c.score,
        c.hits,
        c.platforms.join(',') || '-',
        c.fit || '-',
        c.action,
      ]),
      ['키워드', '점수', '멘션', '플랫폼', '내 포맷 적합', '판정']
    )
  );

  // ── 3. WATCH
  L.push('### 🟡 WATCH — 7일 안에 재확인');
  L.push('');
  L.push(
    table(
      watch.map((x) => [x.term, x.score, `V${x.velocity}`, x.platforms.join(',') || '-', x.momentum]),
      ['키워드', '점수', '속도', '플랫폼', '어제대비']
    )
  );

  // ── 4. 티어별 원천 신호
  L.push('### 🧬 티어별 원천 신호');
  L.push('');
  const tier = snapshot.raw;
  L.push('### Tier1 — 원천 커뮤니티');
  L.push('');
  L.push(
    table(
      (tier.itch || []).slice(0, 8).map((i) => [i.title, i.link]),
      ['itch.io 신규 인기', '링크']
    )
  );
  L.push('### Tier2 — 밈/증폭');
  L.push('');
  L.push(
    table(
      (tier.kym || []).slice(0, 10).map((i) => [i.title, i.link]),
      ['Know Your Meme trending', '링크']
    )
  );
  L.push('### Reddit 최근 반응 (7일)');
  L.push('');
  L.push(
    table(
      (tier.reddit || []).slice(0, 12).map((i) => [
        (i.title || '').slice(0, 90),
        i.source,
        i.link,
      ]),
      ['제목', '출처', '링크']
    )
  );
  L.push('### Bluesky');
  L.push('');
  L.push(
    table(
      (tier.bluesky || []).slice(0, 10).map((i) => [
        (i.title || '').slice(0, 90),
        `${i.author || ''} ❤️${i.likes || 0}`,
        i.link,
      ]),
      ['내용', '작성자', '링크']
    )
  );

  // ── 5. 네이버 검색 수요 (한국)
  L.push('### 🇰🇷 네이버 검색 수요 (데이터랩, 30일)');
  L.push('');
  const nv = snapshot.naver || [];
  L.push(
    table(
      nv.map((n) => [
        n.term,
        `${n.last7 ?? '-'}`,
        `${n.prev7 ?? '-'}`,
        `${n.growth ?? 0}%`,
        n.demandShare !== undefined && n.demandShare !== null ? `${n.demandShare}%` : '-',
        n.lowVolume ? '⚠️저볼륨' : '',
        n.peak ? `${n.peak.period} (${Number(n.peak.ratio).toFixed(1)})` : '-',
      ]),
      ['키워드', '최근7일합', '이전7일합', '성장률', '수요점유율', '주의', '피크']
    )
  );
  L.push(
    '> 합계는 기간 내 최대 검색량을 100으로 정규화한 상대값. **REF 앵커 그룹 기준**이라 배치 간 비교 가능.\n' +
      '> ⚠️저볼륨 = 7일합이 기준 미달 → %성장률이 분모 0 근처라 수치로 볼 수 없다(점수에서도 감쇠).\n'
  );
  L.push('');

  // ── 6. 경쟁 채널
  if (snapshot.competitorHits?.length) {
    L.push('### 🎯 경쟁 채널 신규 업로드 (감시 키워드 매칭)');
    L.push('');
    L.push(
      table(
        snapshot.competitorHits.map((h) => [
          (h.title || '').slice(0, 80),
          h.matched.join(', '),
          h.ts,
          h.link,
        ]),
        ['제목', '매칭', '게시일', '링크']
      )
    );
  }

  // ── 6-1. 유튜브 경쟁 영상 (최근 7일 실제 공급 내용)
  const comp = snapshot.competitors || {};
  const compKeys = Object.keys(comp).filter((k) => comp[k]?.length);
  if (compKeys.length) {
    L.push('### ▶ 유튜브 경쟁 영상 (최근 7일 실제 업로드) — 포화의 진짜 증거');
    L.push('');
    for (const k of compKeys) {
      L.push(`### ${k} (${comp[k].length}편)`);
      L.push('');
      L.push(
        table(
          comp[k].slice(0, 8).map((v) => [
            (v.title || '').slice(0, 60),
            (v.channel || '').slice(0, 22),
            v.publishedAt ? v.publishedAt.slice(5, 10) : '-',
            v.url,
          ]),
          ['제목', '채널', '게시일', '링크']
        )
      );
    }
    L.push('> 이 목록이 바로 "지금 누가 뭘 만드는가"다. 같은 포맷이 이미 올라오고 있으면 그 포맷은 포화다.');
    L.push('');
  }

  // ── 7. 이슈
  L.push('## ⚙️ 수집 이슈 / 스킵');
  L.push('');
  if (!meta.errors.length) L.push('_없음_\n');
  // ★ 2026-10-24 — 방어적 마스킹 (run.mjs 에서도 redact 하지만 리포트 단독 호출 대비 이중 처리)
  else L.push(meta.errors.map((e) => `- ${redact(e)}`).join('\n') + '\n');
  if (snapshot.supplySource?.startsWith('api')) {
    L.push(
      `> **YouTube 쿼터 (실측)**: ${quotaSummary()} · 일일 한도는 10,000유닛, 미국태평양시간 자정(KST 오후 4~5시경) 리셋.` +
        ` search.list = 100유닛/호출, videos.list(mostPopular) = 1유닛/호출.` +
        ` → **하루 1회 실행이면 20% 내외로 안전.** 같은 날 여러 번 실행하면 소진된다.` +
        ` 공급량(10 term)·크로스오버(8 keyword)는 12시간 캐시되어 같은 날 재실행해도 다시 안 탄다.`
    );
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push('### 다음 액션 체크리스트');
  L.push('');
  L.push('1. ACT 항목을 오늘 안에 1화 기획 확정 (제작 시간 역산)');
  L.push('2. 신규 발견 후보 중 내 포맷 맞는 것 → watchlist에 추가');
  L.push('3. Reddit/Bluesky 원본 링크를 직접 확인 → 원작자 크레딧 확보');
  L.push('4. 어제 ACT로 올린 영상 조회수/구독자 변화 기록 → 적중/실패 회고');
  L.push('5. **결정을 시스템에 기록**: `node src/record.mjs --term "제비차" --status made --note "..."`');
  L.push('');

  // ── 7-0. 🌍 글로벌 트렌드 (watchlist 무관 축)
  if (snapshot.global) {
    const g = snapshot.global;
    // ⚠️ 스냅샷은 1,500건 캡 → 리포트는 전체 목록(meta.globalAll)을 쓴다
    const gAll = meta.globalAll && meta.globalAll.length
      ? meta.globalAll.map((x) => ({
          source: x.source, geo: x.geo, term: x.term, channel: x.channel,
          metric: x.metric, fitScore: x.fitScore, fitLevel: x.fitLevel,
          format: x.format, formatLabel: x.formatLabel,
          coreGroups: x.coreGroups, fmtGroups: x.fmtGroups, url: x.url,
          // ★ 2026-10-24 수정 — 아래 5개가 빠지면 리포트에서 순위/속도가 깨진다.
          //   rank      : "12. 제목" 형식의 번호
          //   vel       : 상대속도(views/h) → 이게 빠지면 전부 "0/h" 로 표시됨
          //   hoursOld  : 게시 후 경과시간
          //   metricNum : 절대 수치(metric 은 문자열이라 숫자 정렬 불가)
          //   publishedAt: 게시 시각 (속도 계산 기준)
          rank: x.rank, vel: x.vel, hoursOld: x.hoursOld,
          metricNum: x.metricNum, publishedAt: x.publishedAt,
        }))
      : g.top || [];
    L.push('---');
    L.push('');
    L.push(
      globalTrendsMarkdown({
        all: gAll,
        ideas: g.ideas || [],
        formatMix: g.formatMix || [],
        geos: g.geos,
        total: g.total,
        matchedCount: g.matchedCount,
        perCountry: g.perCountry || 10,
        perCountryMax: g.perCountryMax || 20,
        crossCountry: meta.crossCountry || g.crossCountry || [],
        crossover: meta.crossover || g.crossover || [],
      })
    );
  }

  // ── 8. 지난 결정 회고 (적중률)
  try {
    const s = await summary();
    L.push('---');
    L.push('');
    L.push(reviewMarkdown(s));
  } catch (e) {
    L.push(`> 회고 섹션 생성 실패: ${e.message}`);
    L.push('');
  }

  const md = L.join('\n');
  const p = path.join(REPORTS_DIR, `${d}.md`);
  await fs.writeFile(p, md, 'utf8');
  await fs.writeFile(path.join(REPORTS_DIR, 'latest.md'), md, 'utf8');
  return p;
}

/**
 * Discord 브리핑 — "알림"이 아니라 "오늘 뭘 만들지"가 되도록.
 *
 * ⚠️ embeds를 쓴다: 일반 메시지는 2000자에서 잘려서 글로벌 트렌드 섹션이 통째로 날아간다.
 *    embed는 description 4096자 + field 25개까지 → A축/글로벌축을 분리해서 안정적으로 전달.
 *
 * 순서: ①결론(공급부족순 후보) ②ACT ③경쟁현실 ④내 적중률 ⑤신규 ⑥글로벌(별도 embed)
 */
export async function postDiscord(snapshot, webhookUrl, globalWebhookUrl, globalAll) {
  const act = snapshot.watch.filter((x) => x.action === 'ACT');
  const disc = snapshot.discoveries.slice(0, 4);
  const comp = snapshot.competitors || {};
  const g = snapshot.global || {};

  // ★ 후보 정렬: 점수가 아니라 **공급부족도** 기준 (공급 0에 가까운 칸이 기회)
  // 동점이면 한국 검색 수요가 큰 순. 수요 0인 건 "바이럴로 승부할 포맷"이라 따로 표기.
  const cand = [...act].sort((a, b) => {
    const sd = (b.supplyDeficit ?? 60) - (a.supplyDeficit ?? 60);
    if (sd !== 0) return sd;
    return (b.naverLast7 || 0) - (a.naverLast7 || 0);
  });

  const fields = [];

  // ① 후보 3개 — 공급 vs 수요를 나란히
  if (cand.length) {
    fields.push({
      name: '🎯 후보 (공급부족 × 수요)',
      value: cand
        .slice(0, 3)
        .map((t) => {
          const sup = t.ytUploads !== '' && t.ytUploads != null
            ? `${Number(t.ytUploads).toLocaleString('ko-KR')}편/주`
            : '미측정';
          const bar = t.supplyDeficit >= 88 ? '🟢' : t.supplyDeficit >= 70 ? '🟡' : t.supplyDeficit >= 40 ? '🟠' : '🔴';
          const dem = t.naverLast7 ? `한국수요 ${t.naverLast7} (${t.demandShare ?? 0}%)` : '한국수요 0';
          const warn = !t.naverLast7 ? ' ⚠️검색수요0=바이럴승부형' : '';
          return `**${t.term}** ${t.score}점 ${bar} 공급 ${sup} · ${dem}${warn}`;
        })
        .join('\n'),
    });
  }

  // ② ACT 전체
  fields.push({
    name: '🔴 ACT (감시 키워드)',
    value: act.length
      ? act
          .slice(0, 8)
          .map((x) => {
            const s = x.ytUploads !== '' && x.ytUploads != null ? ` 공급${Number(x.ytUploads).toLocaleString('ko-KR')}` : '';
            const w = x.lowVolume ? ' ⚠️저수요' : '';
            return `• **${x.term}** ${x.score}점${s}${w}`;
          })
          .join('\n')
      : '• 없음',
  });

  // ③ 경쟁현실 — 포화의 직접 증거
  const compKeys = Object.keys(comp).filter((k) => comp[k]?.length);
  if (compKeys.length) {
    const k = compKeys[0];
    fields.push({
      name: `👥 최근 7일 경쟁 영상 (${k})`,
      value: comp[k]
        .slice(0, 3)
        .map((v) => `• ${(v.title || '').slice(0, 42)} — ${v.channel || ''}`)
        .join('\n'),
    });
  }

  // ④ 내 적중률
  try {
    const s = await summary();
    if (s.actTotal) {
      const persist = s.persisting.length
        ? `\n📈 지속신호: ${s.persisting.slice(0, 3).map((p) => `${p.term}(${p.days}일)`).join(', ')}`
        : '';
      fields.push({
        name: '📊 내 적중률',
        value: `**${s.hitRate}%** — ACT ${s.actTotal}건 중 착수 ${s.actActed}건 · 업로드 ${s.posted}건${persist}`,
      });
    }
  } catch { /* 무시 */ }

  // ⑤ 신규 발견
  if (disc.length) {
    fields.push({
      name: '🆕 신규 발견',
      value: disc.map((c) => `• ${c.term} (${c.score}점)`).join('\n'),
    });
  }

  // ⚠️ A축(감시 키워드) embed는 **Discord에 보내지 않는다** (2026-10-23 사용자 지시).
  //    Discord = 🌍 글로벌 트렌드만. A축(공급량·경쟁영상·적중률)은 리포트 + tracker CSV 참조.
  const embedA = {
    title: `📌 내 감시 키워드 현황 — ${snapshot.date}`,
    color: 0x5865f2,
    fields,
    footer: { text: `📄 reports/${snapshot.date}.md  ·  ✍️ node src/record.mjs --term "키워드" --status made --note "메모"` },
    timestamp: new Date().toISOString(),
  };

  // ⑥ 글로벌 트렌드 embed (여러 개로 분할) — watchlist 무관 축
  // ⚠️ 스냅샷은 1,500건으로 캡돼 있으므로 전체 목록을 직접 받는다 (37개국 전부 담아야 함)
  const gBundles = buildGlobalEmbeds(g, globalAll);
  const gEmbeds = gBundles.all;

  // ★ 메시지 1 = 🌍 글로벌 (세상이 먼저)
  //   ⚠️ 감시 키워드(A축) 블록은 Discord에 넣지 않는다 (2026-10-23 사용자 지시:
  //      "왜자꾸 해리포터섹션이 따로 딸려오냐" → A축은 리포트 + tracker CSV 로만)
  //   12개국으로 줄인 뒤엔 embed가 2개 → **메시지 1개로 전부 전달 가능**
  const embedsAll = [...gEmbeds, ...gBundles.extra];
  const one = trimEmbedsForDiscord(embedsAll).slice(0, 10);
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '트렌드 레이더', embeds: one }),
  });
  const okA = res.ok;

  // 여분 embed가 남으면 2번째 메시지로
  if (embedsAll.length > one.length) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: '트렌드 레이더',
          embeds: trimEmbedsForDiscord(embedsAll.slice(one.length)).slice(0, 10),
        }),
      });
    } catch { /* 2번째 메시지 실패는 무시 (1번째는 정상) */ }
  }

  // 별도 채널이 지정돼 있으면 글로벌만 그쪽으로
  if (globalWebhookUrl && gEmbeds.length) {
    try {
      const r2 = await fetch(globalWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: '트렌드 레이더', embeds: gEmbeds.slice(0, 9) }),
      });
      return okA && r2.ok;
    } catch {
      return okA;
    }
  }
  return okA;
}

/**
 * 🌍 글로벌 트렌드 embed (복수)
 * ⚠️ Discord 메시지 총 6000자 한계 → embed 2~3개로 나눠 담는다.
 *    전체 50위 랭킹은 리포트/CSV에 있고, Discord는 "국가 1위" 요약.
 */
function buildGlobalEmbeds(g, globalAll) {
  if (!g || !g.total) return { all: [], extra: [] };
  const ideas = g.ideas || [];
  const mix = g.formatMix || [];
  // ★ 국가별 N위 (2026-10-24) — mostPopular 가 국가당 50개를 1유닛에 받으므로 추가 비용 0
  const ytPerCountry = Math.max(1, Math.min(20, g.perCountry || 10));
  const gtPerCountry = Math.max(2, Math.min(20, g.perCountry || 10));
  const top = globalAll && globalAll.length
    ? globalAll.map((x) => ({
        source: x.source, geo: x.geo, term: x.term, channel: x.channel,
        metric: x.metric, fitScore: x.fitScore, fitLevel: x.fitLevel,
        format: x.format, formatLabel: x.formatLabel,
        coreGroups: x.coreGroups, fmtGroups: x.fmtGroups, url: x.url,
        // ★ 2026-10-24 수정 — rank/hoursOld/metricNum 누락 보완 (리포트 쪽과 동일)
        rank: x.rank, vel: x.vel, hoursOld: x.hoursOld,
        metricNum: x.metricNum, publishedAt: x.publishedAt,
      }))
    : g.top || [];
  const all = [];
  const extra = [];
  const cross = crossCountryLeaders(top.filter((x) => x.source === 'youtube-popular'));

  // ── embed 1: 요약 (형식 분포 + 직격 매칭)
  const f1 = [];
  if (mix.length) {
    f1.push({
      name: '🧭 지금 유행하는 미디어 형식',
      value: mix
        .slice(0, 10)
        .map((f) => `**${f.label}** ${f.n}건${f.views ? ` · ${(f.views / 10000).toFixed(0)}만뷰` : ''}`)
        .join('\n'),
    });
  }
  if (ideas.length) {
    f1.push({
      name: '🎯 지금 올릴 수 있는 것 (글로벌 × 내 포맷)',
      value: ideas
        .slice(0, 6)
        .map((x) => {
          const lvl = x.fitLevel === 'HIGH' ? '🟢' : x.fitLevel === 'MID' ? '🟡' : '🔵';
          const idea = x.idea ? '\n   ↳ ' + x.idea.slice(0, 90) : '';
          return `${lvl} **${x.term}** [${x.geo}] ${x.metric || ''}${idea}`;
        })
        .join('\n'),
    });
  }

  // ★ N개국 동시 1등 = 진짜 글로벌 트렌드 (1개국 1등은 그 나라 뉴스)
  if (cross.length) {
    f1.push({
      name: '🌐 지금 세계가 같이 먹고 있는 것 (N개국 동시 1등)',
      value: cross
        .slice(0, 6)
        .map((c) => `**${c.geos.length}개국** ${(c.title || '').slice(0, 40)}\n   ${Math.round(c.vel).toLocaleString('ko-KR')}/h · ${c.geos.join(' ')}`)
        .join('\n'),
    });
  }
  all.push({
    title: `🌍 글로벌 트렌드 — 전 세계 지금 뜨는 것 (${snapshot_date_of(g)})`,
    description:
      `수집 **${g.total}건** · 국가 ${(g.geos || []).length}곳 · **내 포맷 직격 ${ideas.length}건**\n` +
      `> 원본은 100% 중립(수집 단계는 watchlist 무관). 채널 매칭은 원본 위에 얹는 레이어.`,
    color: 0x57f287,
    fields: f1,
    footer: { text: '틱톡/인스타는 공개 API 없음 → 브라우저 직접 확인 필요' },
    timestamp: new Date().toISOString(),
  });

  // ── embed 2: 국가별 급상승 검색어 (12개국 → 1개 embed)
  const gt = top.filter((x) => x.source === 'google-trends');
  const gtGeos = [...new Set(gt.map((x) => x.geo))];
  for (let i = 0; i < gtGeos.length; i += 18) {
    const chunk = gtGeos.slice(i, i + 18);
    all.push({
      title: `🗺 국가별 급상승 검색어${gtGeos.length > 18 ? ` (${i / 18 + 1}/${Math.ceil(gtGeos.length / 18)})` : ''}`,
      color: 0x9b59b6,
      fields: chunk.map((geo) => {
        // ★ 2026-10-24 — 2개만 보여주지 말고 국가당 전부(기본 10) 노출 (수집 비용 0)
        const rows = gt.filter((x) => x.geo === geo).slice(0, gtPerCountry);
        return {
          name: geo,
          value: rows.map((x) => `${x.term}${x.metric ? ` _(${x.metric})_` : ''}`).join(' · ').slice(0, 1024) || '-',
          inline: true,
        };
      }),
    });
  }

  // ── embed 3: 국가별 YT **속도 TOP N** (전 국가, 6개국/embed) → ★ 2번째 메시지로 분리
  //    ⚠️ 절대조회수 1등이 아니라 속도 순위. 절대조회수는 뮤비가 항상 1등이라 의미가 없다.
  //    ★ 2026-10-24 — "1등"만 보내지 말고 국가별 N개(기본 10, 최대 20)를 보낸다.
  //      mostPopular 는 국가당 50개를 1유닛에 받아오므로 **추가 API 비용 0**.
  const yt = top.filter((x) => x.source === 'youtube-popular');
  const ytGeos = [...new Set(yt.map((x) => x.geo))];
  const ytPer = Math.max(1, Math.min(20, ytPerCountry));
  for (let i = 0; i < ytGeos.length; i += 6) {
    const chunk = ytGeos.slice(i, i + 6);
    const rows = chunk.map((geo) => {
      const list = yt
        .filter((y) => y.geo === geo)
        .sort((a, b) => (b.vel || 0) - (a.vel || 0))
        .slice(0, ytPer);
      const lines = list.map(
        (x, k) =>
          `${k + 1}. ${(x.term || '').slice(0, 42)} _${Math.round(x.vel || 0).toLocaleString('ko-KR')}/h_`
      );
      return { geo, value: (lines.join('\n') || '-').slice(0, 1024) };
    });
    extra.push({
      title:
        `▶ 국가별 지금 뜨는 것 (속도 TOP ${ytPer})` +
        `${ytGeos.length > 6 ? ` (${i / 6 + 1}/${Math.ceil(ytGeos.length / 6)})` : ''}`,
      color: 0xe74c3c,
      fields: rows.map((r) => ({ name: r.geo, value: r.value, inline: true })),
    });
  }

  return { all, extra };
}

/**
 * Discord 총 6000자 제한 안전장치 — 초과하면 뒤쪽 embed부터 제거
 * (A축 embed + 요약 embed는 절대 안 뺀다)
 */
function trimEmbedsForDiscord(embeds, limit = 5600) {
  const size = (arr) => JSON.stringify(arr).length;
  const out = [...embeds];
  while (out.length > 2 && size(out) > limit) out.pop();
  return out;
}
function snapshot_date_of(g) {
  return g.date || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function postTelegram(snapshot, botToken, chatId) {
  const act = snapshot.watch.filter((x) => x.action === 'ACT').slice(0, 5);
  const disc = snapshot.discoveries.slice(0, 5);
  const g = snapshot.global || {};
  const ideas = g.ideas || [];
  const mix = g.formatMix || [];
  const text = [
    `📡 트렌드 레이더 — ${snapshot.date}`,
    '',
    '🔴 ACT',
    ...(act.length ? act.map((x) => `• ${x.term} (${x.score}점)`) : ['• 없음']),
    '',
    '🆕 신규 발견',
    ...(disc.length ? disc.map((c) => `• ${c.term} (${c.score}점)`) : ['• 없음']),
  ];
  if (g.total) {
    text.push('', `🌍 글로벌 트렌드 (${g.total}건 수집)`);
    if (mix.length) {
      text.push('🧭 유행 형식: ' + mix.slice(0, 5).map((f) => `${f.label} ${f.n}`).join(' · '));
    }
    if (ideas.length) {
      text.push('', '🎯 지금 올릴 수 있는 것:');
      for (const i of ideas.slice(0, 5)) {
        text.push(`• [${i.geo}] ${i.term} — ${(i.angles || []).join(' / ') || ''}`);
      }
    }
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.join('\n').slice(0, 4000) }),
  });
  return res.ok;
}
