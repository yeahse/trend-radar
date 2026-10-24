/**
 * 토큰 만료 시 자동 갱신 경로 검증.
 * ~/.devvit/token 의 expiresAt 을 과거로 되돌려넣고 → 수집이 여전히 성공하는지 확인.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const p = path.join(os.homedir(), '.devvit', 'token');
const raw = fs.readFileSync(p, 'utf8').trim();
const obj = JSON.parse(raw);
const inner = JSON.parse(Buffer.from(obj.token, 'base64').toString('utf8'));

console.log('=== 갱신 전 ===');
const isMs = Number(inner.expiresAt) > 1e11;
console.log('expiresAt=' + inner.expiresAt + ' (' + new Date(Number(inner.expiresAt) * (isMs ? 1 : 1000)).toISOString() + ') 단위=' + (isMs ? 'ms' : 's'));
console.log('refreshToken 존재=' + !!inner.refreshToken + ' len=' + String(inner.refreshToken || '').length);

// 만료 위조 (원본과 같은 단위 유지)
const expired = { ...inner, expiresAt: isMs ? Date.now() - 3600 * 1000 : Math.floor(Date.now() / 1000) - 3600 };
fs.writeFileSync(p, JSON.stringify({ token: Buffer.from(JSON.stringify(expired), 'utf8').toString('base64'), copyPaste: 'false' }), 'utf8');
console.log('\n→ expiresAt 을 1시간 전으로 위조 저장 (단위 ' + (isMs ? 'ms' : 's') + ')');

// 새 프로세스에서 인증 시도 (모듈 캐시 초기화 상태)
const { collectReddit } = await import('../src/sources/reddit.mjs');
const cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'config.json'), 'utf8'));

const t0 = Date.now();
const rd = await collectReddit(cfg, { subs: ['MALfoid'], queries: ['malfoid'] });
console.log(`\n=== 수집 결과 === authMode=${rd.authMode} items=${rd.items.length} ${Date.now() - t0}ms`);
console.log('errors=' + JSON.stringify(rd.errors));

// 파일이 다시 쓰였는지 (갱신 성공 시 expiresAt 이 미래로 갱신됨)
const after = JSON.parse(fs.readFileSync(p, 'utf8').trim());
const inner2 = JSON.parse(Buffer.from(after.token, 'base64').toString('utf8'));
const isMs2 = Number(inner2.expiresAt) > 1e11;
console.log('\n=== 갱신 후 ===');
console.log('expiresAt=' + inner2.expiresAt + ' (' + new Date(Number(inner2.expiresAt) * (isMs2 ? 1 : 1000)).toISOString() + ') 단위=' + (isMs2 ? 'ms' : 's'));
console.log('accessToken 변경됨=' + (inner2.accessToken !== inner.accessToken));
console.log('단위 유지=' + (isMs2 === isMs));
console.log('남은분=' + Math.round((Number(inner2.expiresAt) * (isMs2 ? 1 : 1000) - Date.now()) / 60000));

if (rd.items.length > 0 && Number(inner2.expiresAt) * (isMs2 ? 1 : 1000) > Date.now()) {
  console.log('\n✅ 자동갱신 경로 정상 동작');
} else {
  console.log('\n❌ 자동갱신 실패');
  process.exit(1);
}
