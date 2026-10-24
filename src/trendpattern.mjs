/**
 * 🧩 트렌드 구조 추출 → 내 채널 적용 템플릿
 *
 * "Female Malfoy로 바꿔라"만으로는 actionable이 아니다.
 * 트렌드의 "구조"(형식 패턴)를 뽑아서 → 그대로 내 포맷에 옮긴 구체적 제안을 만든다.
 *
 * 예: "If You Escape, You Win $1,000,000" (10개국 동시 1등)
 *   → 구조: [대량 규모] + [상금/제약]
 *   → 적용: "1,000명이 동시에 [TS 말포이 버전]에서 탈출하면 $1M" 같은 포맷
 */

const T = {
  mass: 'AI로 {N}명을 한 장면에 (TS 말포이 버전으로) → 짧은 컷 {N}개로 구성',
  prize: '상금 걸기 포맷: "탈출에 성공하면 $${AMT}" — 규칙·리스크를 본떠서',
  escape: '"말포이가 X에서 빠져나오라" — 원작 세계관 규칙 안에서 탈출하는 구조 (TS 시점)',
  fusion: '두 캐릭터가 하나가 되는 장면 (말포이 + 해리 / 원작 + 신작). "말포이/해리가 합쳐지면?" 식',
  versus: '"A vs B" 구도 — (말포이 vs 원작 남성캐릭터)로 즉석에서 만들 수 있음',
  challenge: '"○○ 하면 ○○" 규칙 챌린지 포맷 — 참가자가 따라하게 (AI 애니로 규칙 실행 장면 생성)',
  series: '연작화 — 1편=1화 구조로 원작 AU 전개 (TS 시점 고정)',
  music: '음악에 맞춘 AI 애니 (원작 세계관 오리지널 BGM 사용)',
  robot: 'AI/로봇이 등장하는 오리지널 — "말포이 AI 버전" 처럼 세계관 확장',
  horror: '공포 포맷 (원작 세계관의 저주/유령 규칙 활용)',
  game: '게임 세계관 재현 — "Minecraft 속에서 1000명이 ○○" 식',
  live: '라이브형 / 리액션 포맷',
};

export const PATTERNS = [
  {
    id: '대량_시뮬레이션',
    re: /\b(\d[\d,]*)\s*(players|people|heroes|characters|npcs|avatars|users|contestants)\b/i,
    axis: '브랜드/인물 대량 등장',
    template: (m) => T.mass.replaceAll('{N}', m[1]),
  },
  {
    id: '상금_제약',
    re: /\$\s*([\d,]+(?:\.\d+)?)/i,
    axis: '큰 상금 = 참여 동기',
    template: (m) => T.prize.replace('${AMT}', m[1]),
  },
  {
    id: '탈출_생존',
    re: /\b(escape|escaped|escaping|flee|running away|survive|survival|last one standing)\b/i,
    axis: '귀환/생존 서바이벌',
    template: () => T.escape,
  },
  {
    id: '융합_변신',
    re: /\b(fused|merged|become|becomes|combined|turned into|transformed|morphed)\b/i,
    axis: '두 개가 하나가 됨',
    template: () => T.fusion,
  },
  {
    id: '성별전환_버전',
    re: /\b(female version|male version|genderbend|gender swap|genderswap|女体化|version of)\b/i,
    axis: '성별전환 버전',
    template: () => '원작 캐릭터 성별전환 버전 (TS 시점) — 세계관만 가져오면 설정만 바꾸면 됨',
  },
  {
    id: '대결',
    re: /\bvs\.?\b|\bversus\b/i,
    axis: '대결 구도',
    template: () => T.versus,
  },
  {
    id: '숏폼_밈_챌린지',
    re: /\b(challenge|contest|competition|game|reaction|tutorial|how to|hack|secret)\b/i,
    axis: '참여형 챌린지',
    template: () => T.challenge,
  },
  {
    id: '이야기_시리즈',
    re: /\b(part \d|ep(isode)? ?\d|chapter \d|season \d|finale|series|story of)\b/i,
    axis: '연작/시리즈',
    template: () => T.series,
  },
  {
    id: '음악_MV',
    re: /\b(official (music )?video|lyric video|m\/v|visualizer|remix)\b/i,
    axis: '음악/비디오',
    template: () => T.music,
  },
  {
    id: '로봇_AI',
    re: /\b(robot|android|mecha|cyborg|ai art|ai video)\b/i,
    axis: 'AI/로봇',
    template: () => T.robot,
  },
  {
    id: '공포_호러',
    re: /\b(horror|scary|creepy|haunted|chase|monster|zombie)\b/i,
    axis: '공포/서바이벌',
    template: () => T.horror,
  },
  {
    id: '게임_연출',
    re: /\b(minecraft|roblox|fortnite|gta|simulator|sim)\b/i,
    axis: '게임 세계 기반',
    template: () => T.game,
  },
  {
    id: '실시간_라이브',
    re: /\b(live|going live|stream|streamed|reaction to)\b/i,
    axis: '라이브/리액션',
    template: () => T.live,
  },
];

/**
 * 제목 하나에서 구조 패턴을 뽑는다.
 * @returns {Array<{id:string,axis:string,template:string,match:string}>}
 */
export function extractPatterns(term, channelHint = '') {
  const t = String(term || '');
  const out = [];
  for (const p of PATTERNS) {
    const m = t.match(p.re);
    if (!m) continue;
    let tpl = '';
    try { tpl = p.template(m); } catch { tpl = p.axis; }
    out.push({
      id: p.id,
      axis: p.axis,
      template: channelHint ? tpl + '  [' + channelHint + ']' : tpl,
      match: (m[0] || '').slice(0, 40),
    });
  }
  return out;
}

/**
 * 직격 후보에 "구조 → 적용" 을 붙인다.
 * @param {Array} ideas  buildIdeas() 결과
 */
export function attachPatterns(ideas, { channelHint = '' } = {}) {
  return (ideas || []).map((i) => {
    const pats = extractPatterns(i.term, channelHint);
    const axes = i.angles?.length ? i.angles : pats.map((p) => p.template);
    return {
      ...i,
      patterns: pats,
      idea: axes[0] || '',
      axes: axes.slice(0, 2),
    };
  });
}
