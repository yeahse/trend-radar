import { get, getJson, getBuffer, daysAgoKST } from '../util.mjs';
import { xlsxToRows } from '../lib/xlsx.mjs';

const OPEN_API = 'https://openapi.naver.com/v2/datalab/search';
const INTERNAL_HASH = 'https://datalab.naver.com/qcHash.naver';
const INTERNAL_XLSX = 'https://datalab.naver.com/qcExcel.naver';

/**
 * ─────────────────────────────────────────────────────────────
 * 방법 A (권장): 공식 Open API
 *   developers.naver.com > 데이터랩 검색어트렌드 사용동의 > client id/secret
 * ─────────────────────────────────────────────────────────────
 */
export async function dataLabOpenApi(cfg, groups, { days = 30 } = {}) {
  const { clientId, clientSecret } = cfg.naver || {};
  if (!clientId || !clientSecret) throw new Error('naver.clientId/Secret 미설정');

  const endDate = daysAgoKST(0);
  const startDate = daysAgoKST(days);
  const body = {
    startDate,
    endDate,
    timeUnit: 'date',
    data: groups.map((g) => ({ title: g.title, keywords: g.keywords.slice(0, 20) })),
  };
  const url =
    `${OPEN_API}?startDate=${startDate}&endDate=${endDate}&timeUnit=date&key1=${clientId}&key2=${clientSecret}`;
  const res = await getJson(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-naver-client-id': clientId,
      'x-naver-client-secret': clientSecret,
    },
    body: JSON.stringify(body),
    minGapMs: 500,
  });
  return (res.results || []).map((r) => {
    const series = (r.data || []).map((d) => ({ period: d.period, ratio: d.ratio }));
    const last7 = series.slice(-7).reduce((a, b) => a + b.ratio, 0);
    const prev7 = series.slice(-14, -7).reduce((a, b) => a + b.ratio, 0);
    return {
      title: r.title,
      keywords: r.keywords || [],
      series,
      last7,
      prev7,
      growth: prev7 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? 100 : 0,
    };
  });
}

/**
 * ─────────────────────────────────────────────────────────────
 * 방법 B (키 불필요): 데이터랩 웹 내부 엔드포인트 사용
 *   POST /qcHash.naver → hashKey → GET /qcExcel.naver → xlsx → 일별 비율
 *   공식 API와 동일한 데이터를 키 없이 가져온다.
 * ─────────────────────────────────────────────────────────────
 */
export async function dataLabInternal(groups, { days = 30 } = {}) {
  const qg = groups
    .map((g) => `${g.title}__SZLIG__${g.keywords.slice(0, 20).join(',')}`)
    .join('__OUML__');
  const ymd = (d) => d.replace(/-/g, '');
  const body = new URLSearchParams({
    queryGroups: qg,
    startDate: ymd(daysAgoKST(days)),
    endDate: ymd(daysAgoKST(0)),
    timeUnit: 'date',
    gender: '',
    age: '',
    device: '',
  });
  const r = await get(INTERNAL_HASH, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: 'https://datalab.naver.com/keyword/trendSearch.naver',
    },
    body: body.toString(),
    minGapMs: 1200,
  });
  const j = JSON.parse(r.text);
  if (!j.success) throw new Error(`qcHash 실패: ${j.code || ''} ${j.message || ''}`);
  const hashKey = j.hashKey;

  const buf = await getBuffer(`${INTERNAL_XLSX}?hashKey=${hashKey}`, {
    headers: { referer: `https://datalab.naver.com/keyword/trendResult.naver?hashKey=${hashKey}` },
    minGapMs: 1200,
  });
  const rows = xlsxToRows(buf);
  return parseDatalabRows(rows, groups);
}

/** xlsx 행 → 그룹별 일별 시계열 */
export function parseDatalabRows(rows, groups) {
  // 헤더 행 찾기: '날짜' 포함
  let headerIdx = rows.findIndex((r) => r.some((c) => String(c).trim() === '날짜'));
  if (headerIdx < 0) return [];
  const header = rows[headerIdx];
  const data = rows.slice(headerIdx + 1);

  const result = groups.map((g) => {
    const col = header.indexOf(g.title);
    const series = [];
    if (col >= 0) {
      for (const row of data) {
        const period = String(row[0] || '').trim();
        const ratio = Number(row[col]);
        if (/^\d{4}-\d{2}-\d{2}$/.test(period) && !Number.isNaN(ratio)) series.push({ period, ratio });
      }
    }
    const last7 = series.slice(-7).reduce((a, b) => a + b.ratio, 0);
    const prev7 = series.slice(-14, -7).reduce((a, b) => a + b.ratio, 0);
    return {
      title: g.title,
      keywords: g.keywords,
      series,
      last7: Number(last7.toFixed(2)),
      prev7: Number(prev7.toFixed(2)),
      growth: prev7 ? Number((((last7 - prev7) / prev7) * 100).toFixed(1)) : last7 > 0 ? 100 : 0,
      peak: series.reduce((m, s) => (s.ratio > (m?.ratio ?? -1) ? s : m), null),
    };
  });
  return result;
}

/** watchlist를 그룹(1주제어 = 1그룹)으로 → 최대 5개씩 요청 */
export function chunk(groups, size = 5) {
  const out = [];
  for (let i = 0; i < groups.length; i += size) out.push(groups.slice(i, i + size));
  return out;
}

/**
 * ─────────────────────────────────────────────────────────────
 * 정규화 앵커(REF) — 교차 배치 정규화 버그 해결
 *
 * 데이터랩 비율은 "한 번의 요청 안에 들어온 모든 그룹의 최댓값 = 100"으로 정규화된다.
 * 그래서 서로 다른 요청(배치)에서 얻은 term의 ratio는 서로 비교할 수 없다.
 * 예: tsundere 는 자기 배치의 유일한 최대치 → 100 (= "절대량 0"인데 "성장률 +100%"으로 보임).
 *
 * 해결: 모든 요청에 "기준 단어 모음" 그룹(__REF_ALL__)을 1개 같이 넣는다.
 *   - REF는 언제나 개별 term 합계보다 크다 → 배치 내 최대치 → 정규화 분모 고정
 *   - 모든 배치가 같은 분모를 쓰므로 term 간 절대 비교가 가능해진다
 *   - REF 자체는 결과에서 제외
 *
 * REF 단어 목록은 **고정**한다 (config.json → naver.refScaleTerms).
 * watchlist를 바꿔도 스케일이 흔들리지 않아야 날짜 간 추세 비교가 성립하기 때문.
 * ─────────────────────────────────────────────────────────────
 */
export const REF_TERM = '__REF_ALL__';
export const REF_GROUP_SIZE = 4; // REF 1개 + term 4개 = 요청당 그룹 5개 (API 제한)

/** 기본 스케일 기준 단어 (config.json → naver.refScaleTerms 로 대체 가능) */
export const DEFAULT_REF_SCALE = [
  '말포이', 'TS 말포이', 'malfoid', 'malfoy', 'fem draco', 'female draco',
  'draco malfoy', 'genderbend', 'tsundere', '해리포터', 'harry potter',
  '해리포터 AI', 'AI 팬애니', 'rule 63',
];

/** 저볼륨 기준: REF 정규화 스케일에서 7일합이 이 값 미만이면 %성장률은 노이즈 */
export const LOW_VOLUME_THRESHOLD = 10;

export async function collectNaver(cfg, terms, { days = 30 } = {}) {
  const errors = [];
  const items = [];
  const groups = (terms || []).map((t) => ({ title: t, keywords: [t] }));
  if (!groups.length) return { items, errors };

  const useOpenApi = !!(cfg.naver?.clientId && cfg.naver?.clientSecret);
  const label = useOpenApi ? 'openapi' : 'internal(키 불필요)';
  const scaleTerms = (cfg.naver?.refScaleTerms?.length ? cfg.naver.refScaleTerms : DEFAULT_REF_SCALE)
    .filter((t) => typeof t === 'string' && t.trim())
    .slice(0, 20);
  const refGroup = { title: REF_TERM, keywords: scaleTerms };

  try {
    for (const g of chunk(groups, REF_GROUP_SIZE)) {
      const withRef = [refGroup, ...g];
      const res = useOpenApi
        ? await dataLabOpenApi(cfg, withRef, { days })
        : await dataLabInternal(withRef, { days });
      const ref = res.find((r) => r.title === REF_TERM);
      const refPeak = ref?.peak?.ratio ?? 0;
      for (const r of res) {
        if (r.title === REF_TERM) continue; // 앵커는 결과에 넣지 않음
        // 스케일 무결성: REF보다 큰 값이 나오면 REF에 빠진 대형 단어가 있다는 뜻
        if (refPeak && r.peak && r.peak.ratio > refPeak + 0.5) {
          errors.push(
            `naver 스케일 주의: '${r.title}' peak ${r.peak.ratio.toFixed(1)} > REF peak ${refPeak.toFixed(1)} ` +
              `→ naver.refScaleTerms 에 대형 단어를 추가하세요`
          );
        }
        items.push({
          platform: 'naver',
          source: `datalab:${label}`,
          term: r.title,
          growth: r.growth,
          last7: r.last7,
          prev7: r.prev7,
          peak: r.peak,
          series: r.series,
          // 기준 수요 전체(REF) 대비 이 term의 점유율 (%)
          demandShare: ref?.last7 ? Number(((r.last7 / ref.last7) * 100).toFixed(2)) : null,
          lowVolume: r.last7 < LOW_VOLUME_THRESHOLD,
        });
      }
    }
  } catch (e) {
    errors.push(`naver datalab(${label}): ${e.message}`);
  }
  return { items, errors };
}
