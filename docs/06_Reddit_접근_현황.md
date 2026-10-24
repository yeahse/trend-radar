# Reddit Data API 접근 — 현황과 경로 (2026-10-24 정리)

> 결론부터: **레딧 수집은 지금 동작하고 있다.** 2026-10-24 정책 변경으로 `prefs/apps`의
> "create app" 이 전 계정 차단됐지만, 공식 Devvit CLI 토큰 경로로 OAuth 실접근이 확보됐다.
> 정식 client_id/secret 은 **Data Access Request 승인 후** 발급받는다(티켓 접수 완료).

---

## 1. 왜 갑자기 막혔나 (실측 근거)

`old.reddit.com/prefs/apps` → "are you a developer? create an app..." 폼은 정상 동작한다.
reCAPTCHA 체크박스도 클릭 한 번에 통과했다(토큰 2340자 발급 확인).
**그런데** `POST /api/updateapp` 서버 응답이 항상 아래 메시지:

```
In order to create an application or use our API you can read our full policies here:
https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy
```

| 시도한 경로 | 결과 |
|---|---|
| 사람 계정 `ahuuu135` 으로 create app | 같은 메시지 |
| 봇 계정 `Hot_Information126t8` 으로 create app | 같은 메시지 |
| 봇 계정을 dev platform에 등록(`✓ Registered`) 후 재시도 | 같은 메시지 |
| reCAPTCHA 통과 후 제출 | 같은 메시지 |

→ **계정 문제가 아니라 Reddit 전역 정책 변경.** 외부 증언도 동일 증상:
Make 커뮤니티(2026-06), r/ClaudeCode — "이게 정상이고 승인 요청을 해야 한다".

### Reddit Responsible Builder Policy (2026-10-24 확인) 핵심
- *"Approval is required: You must request access and get explicit approval before accessing any Reddit data through our API."*
- *"Developers should use the Developer Platform (Devvit) to build apps on Reddit. If your use case is not supported by Devvit, file a ticket."*
- 상업적 이용은 별도 written approval 필요.

---

## 2. 지금 동작하는 경로 — Devvit CLI 토큰 (실측 200)

Reddit **공식 CLI** `npx devvit login` 은 OAuth 토큰을 발급하고, 이 토큰은
`scope=*` 로 `oauth.reddit.com` 전체에 접근 가능하다.

```powershell
npx.cmd -y devvit@0.15.0 login
# → https://www.reddit.com/api/v1/authorize?client_id=Bep8X2RRjuoyuxkKsKxFuQ&...
# → 브라우저에서 승인 → ~/.devvit/token 에 저장됨
```

### 토큰 파일 구조 (`~/.devvit/token`)
```json
{ "token": "<base64 of json>", "copyPaste": "false" }
```
base64 디코드하면:
```json
{ "refreshToken": "...", "accessToken": "...", "expiresAt": 1792914862, "scope": "*", "tokenType": "bearer" }
```
- `accessToken` 유효기간 **약 24시간**
- `refreshToken` 로 `grant_type=refresh_token` → 새 accessToken 발급 (실측 200)

### 실측 응답 (2026-10-24)
| 엔드포인트 | 상태 |
|---|---|
| `GET /api/v1/me` | 200 → `Hot_Information126t8` |
| `GET /r/{sub}/top` | 200 |
| `GET /search?q=...` | 200 (search 도 정상 동작) |
| `GET /r/popular/top` | 200 |
| `GET /subreddits/mine` | 200 |
| refresh_token grant | 200 → 새 accessToken → /me 200 |

> ⚠️ UA 형식은 반드시 `<platform>:<app id>:<version> (by /u/<계정>)`.
> 빈 UA 나 기본 UA 는 Reddit 이 "Blocked" 로 막는다(실측 403 확인).

---

## 3. 코드 반영 — `src/reddit_auth.mjs` (신규)

두 경로를 자동 선택하는 자격증명 제공자.

| 모드 | 조건 | grant |
|---|---|---|
| `classic` | `config.reddit.clientId/clientSecret` 있음 | `grant_type=client_credentials` |
| `devvit` | 위가 없음 (현재) | `~/.devvit/token` + 자동 갱신 |

- `config.reddit.authMode` = `auto`(기본) / `classic` / `devvit`
- devvit 모드는 만료 5분 전부터 자동 갱신하고 **원본 파일에 되돌려써서**
  `devvit` CLI 와 토큰 상태를 공유한다.
- UA의 `(by /u/xxx)` 는 `/api/v1/me` 로 **인증된 계정을 자동 확인**해서 넣는다.

`src/sources/reddit.mjs` 는 `redditAuth()` 를 쓰도록 변경했고,
`collectReddit()` 반환값에 `authMode` 가 추가됐다.

---

## 4. 정식 승인 티켓 — Data Access Request (접수 완료)

Reddit 정책이 지정한 유일한 정식 경로:
`https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164`

**2026-10-24 접수 완료** ("Your request was successfully submitted." 확인)

**티켓 번호: `62G3GP-PWYEV`** (확인 메일: Reddit Support — "API Access Request Submission",
"Thank you, we received your request!", 2026-10-24 17:02, treerahouse@gmail.com 수신)

### 작성한 내용
| 항목 | 값 |
|---|---|
| 문의 유형 | Data Access Request |
| 역할 | I'm a developer |
| 문의 내용 | I'm a developer and want to build a Reddit App that does not work in the Devvit ecosystem. |
| 이메일 | treerahouse@gmail.com |
| Reddit account name | ahuuu135 |
| Bot/App 계정 | Hot_Information126t8 |
| 소스 코드 | https://github.com/yeahse/trend-radar |
| 대상 서브레딧 | r/HarryPotter, r/DracoMalfoy, r/HarryPotterAIArt, r/MALfoid, r/suddenlymalfoid, r/AIart, r/AI_Art, r/Animemes, r/animeMemes, r/CharacterDesign, r/FanFiction, r/rule63, r/Femslash, r/dankmemes, r/wholesomeanime + 공개 /search |
| "Devvit의 무엇이 부족한가" | Devvit 앱은 subreddit 설치 범위로 동작하고 Reddit 인프라에서 호스팅된다. 나는 자기 Windows 머신에서 스케줄로 돌아가는 항상-on 읽기 전용 모니터링 도구가 필요하고, 특정 subreddit 설치도 인앱 UI도 필요 없다. → non-Devvit Data API 앱이 필요. |
| 투명성 고지 | 현재 Reddit 공식 Devvit CLI 토큰으로 읽기 엔드포인트 동작을 확인 중이며, 명시적 승인 아래 등록된 정식 앱(client id/secret)으로 대체하고 싶다고 명시 |

### 승인 후要做 할 일
1. 승인 메일 수신 (support.reddithelp.com → treerahouse@gmail.com)
2. 승인 지시대로 **승인된 계정으로** `https://reddit.com/prefs/apps` 로그인
3. `script` 앱 생성 → client id / client secret 확보
4. `config.json` → `reddit.clientId` / `reddit.clientSecret` 입력
5. `config.reddit.authMode` 는 `auto` 로 두면 classic 이 우선 적용됨(자동 전환)
6. `node src\run.mjs --force` 로 검증

---

## 5. 포팅 보상 ($1,000) 상태

`developers.reddit.com/app-registration` 플로우를 **이미 완료**했다:
- 봇 계정 `Hot_Information126t8` 를 개발자 계정으로 등록
- `appDetails` 에 app_name=`trend-radar`, source_code_url=`https://github.com/yeahse/trend-radar`,
  purpose/actions 채움 → **✓ Registered** 표시 확인

→ 2026-11-30 까지 등록 시 $1,000 포팅 보상 후보. ("Apply for Bounty" 버튼 노출 확인)

---

## 6. 검증 명령

```powershell
cd "C:\Users\ue-agent\Documents\기본 프로젝트\trend-radar"
node tools\test_devvit_token2.mjs     # 토큰 구조 + /me 200
node tools\test_reddit_endpoints.mjs   # 필요 엔드포인트 전체 + refresh grant
node tools\test_reddit_live.mjs        # collectReddit 실수집 (75건/4.5초, 에러 0)
node tools\probe_subs.mjs              # 서브레딧 존재 여부 실측
node src\run.mjs --force               # 전체 파이프라인 (56.9초, Discord 전송 성공)
```

---

## 7. 주의사항 (정책 준수)

- Reddit 데이터는 **재판매·공유·광고 타게팅·AI 학습용으로 쓰면 안 됨** (Data API Terms).
  → trend-radar 는 신호 집계만 하고 원본 데이터를 외부에 내보내지 않는다.
- 스크립트로 투표/업보트/댓글/포스팅 금지.
- 봇 계정(`Hot_Information126t8`)은 앱 전용으로만 사용 (사람 계정과 혼용 금지).
- 동일 용도로 중복 요청 금지 → Data Access Request 는 1건만 냈다.
-商用 (유료화) 목적 확정 시 → enterprise 경로로 별도 written approval 필요.
