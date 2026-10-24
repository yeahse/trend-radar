import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, ensureDirs } from './store.mjs';

const STATE_PATH = () => path.join(DATA_DIR, 'state.json');

export async function loadState() {
  await ensureDirs();
  try {
    return JSON.parse(await fs.readFile(STATE_PATH(), 'utf8'));
  } catch {
    return { lastRunAt: null, sources: {} };
  }
}

export async function saveState(state) {
  await ensureDirs();
  await fs.writeFile(STATE_PATH(), JSON.stringify(state, null, 2), 'utf8');
}

/**
 * TTL 캐시 판정.
 * @param {string} key      소스 키 (예: 'reddit:r/HarryPotter')
 * @param {number} ttlMs    재수집 허용 간격
 * @param {boolean} force   강제 재수집
 */
export function shouldFetch(state, key, ttlMs, force = false) {
  if (force) return true;
  const last = state.sources?.[key];
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > ttlMs;
}

export function markFetched(state, key) {
  state.sources = state.sources || {};
  state.sources[key] = new Date().toISOString();
}

/** 마지막 수집 결과 보관 (TTL로 건너뛸 때 재사용) */
export function saveResult(state, key, value) {
  state.results = state.results || {};
  state.results[key] = value;
}

export function getResult(state, key) {
  return state.results?.[key] ?? null;
}

/** 해당 키를 마지막으로 수집한 시각 (epoch ms). 없으면 0 */
export function getSourceTime(state, key) {
  const t = state.sources?.[key];
  return t ? new Date(t).getTime() : 0;
}

/**
 * TTL 기반 get-or-fetch.
 * - TTL 만료 → fetcher() 실행 후 결과 저장
 * - TTL 안됨 → 저장된 마지막 결과 재사용 (cached=true)
 */
export async function getOrFetch(state, key, ttlMs, fetcher, force = false) {
  if (!force && !shouldFetch(state, key, ttlMs)) {
    const cached = getResult(state, key);
    if (cached !== null) return { value: cached, cached: true };
  }
  const value = await fetcher();
  saveResult(state, key, value);
  markFetched(state, key);
  return { value, cached: false };
}

/** 오늘 실행에서 아직 안 돈 소스만 회전 실행 */
export function rotate(state, keys, perRun) {
  const fresh = keys.filter((k) => shouldFetch(state, k, 0)); // 마지막 수집 시각 확인용
  const lastRun = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
  const sameDayRun = Date.now() - lastRun < 6 * 3600 * 1000;
  if (!sameDayRun || fresh.length === 0) return keys.slice(0, perRun);
  return fresh.slice(0, perRun);
}

/**
 * 가장 오래전에 수집한 키부터 N개 선택.
 * 2026-10-23 수정: 기존 `filter(shouldFetch).slice(0,N)` 은 TTL(6h) < 실행간격(24h) 이므로
 * 항상 shouldFetch=true → 매일 같은 앞쪽 N개만 수집되고 나머지는 영영 회전하지 않았다.
 */
export function pickLeastRecent(state, keys, perRun) {
  const last = (k) => {
    const t = state.sources?.[k];
    return t ? new Date(t).getTime() : 0;
  };
  return [...keys]
    .sort((a, b) => last(a) - last(b))
    .slice(0, perRun);
}
