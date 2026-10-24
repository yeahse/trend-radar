import { get } from '../util.mjs';

/**
 * YouTube Data API 키가 없을 때 쓰는 공급량(proxy) 측정
 *
 * ⚠️ 왜 `estimatedResults` 전체값은 쓸 수 없는가 (2026-10-23 실측):
 *   `sp=CAISAhAB`(타입=동영상)만 쓰면 '말포이' = 764,775. 키워드가 느슨하게 매칭돼서 부풀려진다.
 *   반대로 '업로드=이번주' 필터만 쓰면 96,109 — 채널까지 섞여서 더 부풀려진다.
 *
 * ✅ 정답: 두 필터를 **결합**한다 → `sp=CAISAhAB+EgIIAw%3D%3D`
 *   = "동영상 타입 + 이번 주 업로드" → **최근 7일 업로드 수의 근사값**
 *
 * 실측 안정성 (같은 요청 3회):
 *   말포이  7,268 / 6,926 / 6,927   (±5%)
 *   TS 말포이 2,036 / 2,036 / 2,036 (✅)
 *   해리포터 AI 185 / 187 / 187      (✅)
 *   female draco 1,344 ×3           (✅)
 *   malfoid 23,382 / 23,382 / 23,383 (✅)
 *
 *   → 절대값은 API `totalResults` 와 근사적으로 같고, 재현성이 높아 트래커에 쓸 수 있다.
 */

const SEARCH = 'https://www.youtube.com/results';
// CAISAhAB = 타입:동영상, EgIIAw%3D%3D = 업로드:이번주
const FILTER_VIDEO_THIS_WEEK = 'CAISAhAB+EgIIAw%3D%3D';

/**
 * @returns {Promise<{count:number,total:number,sample:string[]}>}
 *   count  = 최근 7일 업로드 영상 수 근사값 (안정 ±1~5%)
 *   total  = 검색 결과 페이지에 렌더된 결과 수 (신선도는 요청마다 흔들림 → 참고용)
 */
export async function supplyProxy(term) {
  const url = `${SEARCH}?search_query=${encodeURIComponent(term)}&sp=${FILTER_VIDEO_THIS_WEEK}`;
  const r = await get(url, {
    minGapMs: 2200,
    retries: 2,
    timeoutMs: 25000,
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });
  const est = r.text.match(/"estimatedResults":"(\d+)"/);
  const times = [...r.text.matchAll(/"publishedTimeText":\{"simpleText":"([^"]+)"\}/g)].map((x) => x[1]);
  return {
    count: est ? Number(est[1]) : null,
    total: times.length,
    sample: times.slice(0, 3),
  };
}

/**
 * proxy 기반 SupplyDeficit (0~100)
 * 최근 7일 업로드 수가 적을수록 = 공급 부족 = 공짜 시장 → 높은 점수
 * (YouTube API 모드의 임계값과 같은 스케일)
 */
export function proxySupplyDeficit(count) {
  if (count === null || count === undefined) return 60; // 측정 실패 → 중립
  if (count <= 300) return 100;   // 사실상 없음 = 완전한 공짜 시장
  if (count <= 1500) return 88;
  if (count <= 7000) return 72;
  if (count <= 25000) return 55;
  if (count <= 60000) return 40;
  return 25;                      // 포화
}
