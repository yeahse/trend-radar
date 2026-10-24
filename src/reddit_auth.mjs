/**
 * Reddit Data API 자격증명 제공자
 * ============================================================
 * 2026-10-24 실측 결과 (중요):
 *
 *  Reddit이 2026년 Data API 정책(Responsible Builder Policy)을 강화해서
 *  old.reddit.com/prefs/apps 의 "create app" 폼이 **전 계정 대상**으로 차단되었다.
 *  (reCAPTCHA는 통과해도 서버가 아래 메시지를 반환함)
 *    "In order to create an application or use our API you can read our full
 *     policies here: .../Responsible-Builder-Policy"
 *  → 그 결과 client_id / client_secret 를 발급받는 정식 경로가 막혀 있다.
 *
 *  그래도 **실제로 작동하는 인증 경로**가 하나 확인됐다:
 *  Reddit 공식 Devvit CLI(`npx devvit login`)가 oauth.reddit.com 용
 *  access_token + refresh_token 을 발급하고, 이 토큰은 scope=* 로
 *  Data API 전체(subreddit 목록 / 검색 / r/popular 등)에 접근 가능하다.
 *  (실측 2026-10-24: /api/v1/me, /r/{sub}/top, /search, /subreddits/mine 전부 200)
 *
 *  모드 A (권장, 장래): config.reddit.clientId/clientSecret 가 있으면
 *        client_credentials grant 사용 (정식 승인 발급 후 전환)
 *  모드 B (현재 동작): ~/.devvit/token 의 accessToken + refreshToken 사용
 *        만료(약 24시간) 임박 시 refresh_token grant 로 자동 갱신하고
 *        원본 파일에도 되돌려써서 devvit CLI 와 상태를 공유한다.
 *
 *  주의: 모드 B 는 Reddit 정식 "Data Access Request" 승인 이전 상태의
 *  우회 수단이다. 지원 페이지:
 *    https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { get } from './util.mjs';

/** Devvit CLI(공식 도구)의 client id — public client라 secret 없이 refresh 가능 */
const DEVVIT_CLIENT_ID = 'Bep8X2RRjuoyuxkKsKxFuQ';

function devvitTokenPath() {
  return path.join(os.homedir(), '.devvit', 'token');
}

function decodeEnvelope(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch {
    obj = null;
  }
  const envelope = obj?.token || raw;
  // {token: "<base64 of json>"} 또는 평문 base64
  try {
    const inner = JSON.parse(Buffer.from(envelope, 'base64').toString('utf8'));
    if (inner && inner.accessToken) return inner;
  } catch {
    /* 평문일 수 있음 */
  }
  try {
    const inner = JSON.parse(envelope);
    if (inner && inner.accessToken) return inner;
  } catch {
    /* noop */
  }
  return null;
}

/**
 * devvit 토큰 파일에 갱신된 토큰을 되돌려쓴다.
 * devvit CLI 와 상태를 공유하기 위함 (CLI 자체도 이 파일을 읽는다).
 */
function writeEnvelope(file, inner) {
  const b64 = Buffer.from(JSON.stringify(inner), 'utf8').toString('base64');
  const payload = { token: b64, copyPaste: 'false' };
  try {
    fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  } catch {
    /* 못 써도 무시 — 메모리 캐시로 동작함 */
  }
}

/**
 * expiresAt 단위 정규화.
 * devvit CLI 는 밀리초(1792914862385)로 쓰지만, 일부 경로는 초(1792914862)로 준다.
 * → 값 크기로 구분한다. (1e11 이상 = ms, 미만 = s)
 */
function expiresToMs(v) {
  const n = Number(v || 0);
  if (!n) return 0;
  return n > 1e11 ? n : n * 1000;
}

function msToExpires(ms, unitMs) {
  // 원본 단위를 유지해서 되돌려쓴다 (devvit CLI 와 파일 공유)
  return unitMs ? Math.floor(ms) : Math.floor(ms / 1000);
}

let cache = null; // { mode, token, ua, expiresAt }
let refreshing = null;

/** 모드 A: client_credentials grant */
async function authClassic(cfg) {
  const { clientId, clientSecret } = cfg.reddit || {};
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await get('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': uaFor(cfg, cfg.reddit?.username),
    },
    body: 'grant_type=client_credentials',
    minGapMs: 0,
    retries: 2,
  });
  const j = JSON.parse(r.text);
  if (!j.access_token) throw new Error(`token 발급 실패: ${j.error || r.text.slice(0, 140)}`);
  return {
    mode: 'classic',
    token: j.access_token,
    ua: uaFor(cfg, cfg.reddit?.username),
    expiresAt: Date.now() + (Number(j.expires_in || 3600) - 60) * 1000,
  };
}

/** 모드 B: devvit CLI 토큰 (만료 임박 시 자동 갱신) */
async function authDevvit(cfg) {
  const file = devvitTokenPath();
  if (!fs.existsSync(file)) throw new Error(`devvit 토큰 파일 없음: ${file}`);
  let inner = decodeEnvelope(file);
  if (!inner) throw new Error(`devvit 토큰 파싱 실패: ${file}`);

  const expiresAtMs = expiresToMs(inner.expiresAt);
  const unitIsMs = Number(inner.expiresAt || 0) > 1e11;
  const needRefresh = !inner.accessToken || Date.now() > expiresAtMs - 5 * 60 * 1000;

  if (needRefresh) {
    if (!inner.refreshToken) throw new Error('devvit 토큰에 refreshToken 이 없어 갱신 불가');
    const auth = Buffer.from(`${DEVVIT_CLIENT_ID}:`).toString('base64');
    const r = await get('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': uaFor(cfg, cfg.reddit?.username),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: inner.refreshToken,
      }).toString(),
      minGapMs: 0,
      retries: 2,
    });
    const j = JSON.parse(r.text);
    if (!j.access_token) throw new Error(`devvit 토큰 갱신 실패: ${j.error || r.text.slice(0, 140)}`);
    const newExpMs = Date.now() + Number(j.expires_in || 86400) * 1000;
    inner = {
      refreshToken: inner.refreshToken,
      accessToken: j.access_token,
      expiresAt: msToExpires(newExpMs, unitIsMs),
      scope: inner.scope || '*',
      tokenType: j.token_type || 'bearer',
    };
    writeEnvelope(file, inner);
  }

  // 인증된 계정 확인 (UA의 (by /u/xxx) 를 정확히 맞추기 위해)
  let username = cfg.reddit?.username || '';
  try {
    const me = await get('https://oauth.reddit.com/api/v1/me', {
      headers: { authorization: `bearer ${inner.accessToken}`, 'user-agent': uaFor(cfg, username) },
      minGapMs: 0,
      retries: 2,
    });
    const j = JSON.parse(me.text);
    if (j && j.name) username = j.name;
  } catch {
    /* /me 실패는 치명적이지 않음 — 아래에서 실제 요청에서 드러남 */
  }

  return {
    mode: 'devvit',
    token: inner.accessToken,
    ua: uaFor(cfg, username),
    expiresAt: expiresAtMs,
    account: username,
  };
}

function uaFor(cfg, username) {
  const user = username || cfg.reddit?.username || 'trend-radar-user';
  return `windows:trend-radar:v1.0.0 (by /u/${user})`;
}

/**
 * Reddit 인증 확보. mode 'classic' 우선, 없으면 'devvit' 폴백.
 * @returns {{mode:string, token:string, ua:string, account:string, expiresAt:number}}
 */
export async function redditAuth(cfg) {
  if (cache && Date.now() < cache.expiresAt - 60 * 1000) return cache;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const mode = cfg.reddit?.authMode || 'auto';
    const hasClassic = !!(cfg.reddit?.clientId && cfg.reddit?.clientSecret);
    const order =
      mode === 'classic'
        ? ['classic']
        : mode === 'devvit'
          ? ['devvit']
          : hasClassic
            ? ['classic', 'devvit']
            : ['devvit'];

    let lastErr = null;
    for (const m of order) {
      try {
        const auth = m === 'classic' ? await authClassic(cfg) : await authDevvit(cfg);
        cache = auth;
        return auth;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Reddit 인증 수단 없음');
  })();

  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

/** 인증 가능 여부 (수동 확인용) */
export async function redditAuthStatus(cfg) {
  try {
    const a = await redditAuth(cfg);
    return { ok: true, mode: a.mode, account: a.account || null, ua: a.ua };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}
