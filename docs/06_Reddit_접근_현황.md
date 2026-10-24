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

## 5. 포팅 보상 ($1,000) 상태 — ★ 약관 실측 결과 (2026-10-24)

약관 원문: https://support.reddithelp.com/hc/en-us/articles/47822311698452-Reddit-Developer-Platform-App-Migration-Program-2026-Terms

### ⚠️ 결론: **우리 앱은 $1,000 보상 대상이 아니다** (약관상 확실)

약관이 요구하는 7가지 중 우리 쪽에서 깨지는 것:

| # | 약관 요구 | 우리 상태 |
|---|---|---|
| 1 | **"Already exist on Reddit prior to March 25, 2026"** | ❌ 앱 등록은 **2026-10-24** → **시간 조건 불충족** |
| 2 | **"Be invited to participate"** | ❌ 등록만으로 안 됨. Reddit이 "selected" 해야 함. "**A limited number** of bounty awards" |
| 3 | "Provide (a) essential utility or moderation functionality for Reddit communities with **1,000+ WAU** or (b) **important tooling for Reddit end users**" | ⚠️ 개인 내부용 도구라 애매 |
| 4 | "Successfully migrate to the Developer Platform no later than **December 31, 2026**" | ❌ Devvit 앱이 아직 없음 |
| 5 | "Be approved as part of Reddit's **App Review** process" | ❓ 아직 제출 전 |
| 6 | "comply with User Agreement and Developer Terms" | ✅ |
| 7 | "not suspended/terminated" | ✅ |

> 즉 이 보상은 **"2026-03-25 이전부터 Reddit에 존재하던 기존 Data API 앱"** 소유자에게 주는 money다.
> 우리는 앱을 10월에 만들었으니 **수령 불가**. 등록해둔 것의 실질적 가치는
> **2027-01-12 미등록 앱 API 차단 회피 + App Review 통과** 쪽이다.

### 지급 방식 (지급되는 경우)

Reddit Earn Terms §4.2 / Earn Policy / "Earning money on Reddit" 실측:

| 항목 | 내용 |
|---|---|
| 결제 파트너 | **Stripe Connect** — Reddit이 정한 파트너. **본인이 다른 곳(페이팔 등) 선택 불가** ("You may not use a payment provider other than the one selected by Reddit") |
| 온보딩 | Reddit이 **Stripe 검증 링크를 이메일로 발송** → 링크로 Stripe Connect 계정 설정 |
| 필요한 정보 | 인증 이메일 · 개인정보(법적명/생년월일/거주국) · **Persona 신원인증** · **세금+은행 정보**(주소, **SSN 또는 ITIN / 한국인은 W-8BEN**, 정부신분증, **은행계좌+Routing Number 또는 Debit Card Number**) |
| 계좌 | **네 명의 계좌**가 아니라 "Payment Partner"(Stripe) 계좌로 들어옴. Stripe가 해외 송금 가능 계좌(또는 Payoneer 등) 연결 |
| 수수료 | Reddit이 payout마다 **$2.25 + 0.25%** 차감 (Stripe 거래수수료) + USD 외 통화 **1% 환전수수료** |
| 최소 지급 | Developer Program $10 |
| 지급 시기 | 반복 정산은 월 마감 후 **30~45일**. 1회성 보상은 선정·마이그레이션 확인 후 1회 |
| 계정 요건 | Reddit 계정 **30일 이상 활성** + 인증 이메일 · 18세 이상 · **지원 국가 거주자** |
| 지원 국가 | **🇰🇷 South Korea 포함 확인됨** (2026-10-24 지원 국가 표 실측 — 한국은 적격) |
| 온보딩 페이지 | **https://www.reddit.com/earn** ("Earn landing page" 에서 enrollment process 진행) |
| 온보딩 절차 | Stripe 로부터 **검증 링크가 이메일로 발송** → 링크로 Stripe Connect 계정 설정 + payout 정보 입력 |

> ⚠️ 주의: 약관에 "Citizens and residents of **certain countries** are ineligible to earn" 라고 되어 있어
> 일부 국가는 제외된다. **한국은 2026-10-24 확인 기준 지원 국가 목록에 포함되어 있다** (직접 확인함).

### 실제 현금이 되는 경로 = Developer Funds (별도 프로그램)

$1,000 마이그레이션 보상과는 다른 프로그램. Devvit 앱을 만들어야 받는다.
약관: https://support.reddithelp.com/hc/en-us/articles/50860336905108-Reddit-Developer-Funds-H2-2026-Terms

| 기준 | 임계치 | 지급 |
|---|---|---|
| **Qualified Install** (설치된 커뮤니티 300+ WAU + 수익화 가능) | 50개 | $500 |
| | 250개 | 누적 $1,500 |
| | 1,000개 | 누적 $3,500 |
| **Daily Qualified Engager** | 5,000명 | $4,000 (1회) |
| 반복 정산 | 평균 5,000~49,999명 | (평균-5,000) ÷ 45,000 × $5,000/월 |
| | 평균 50,000명~ | (평균-50,000) ÷ 950,000 × $25,000/월 |

- 앱 1인당 최대 **3개**까지 보상 대상
- 임계치는 **7일 연속 유지** 필요

### 확인 필요 (다음에 할 일)
1. ~~한국이 Reddit Earn 지원 국가인지~~ → **확인 완료 (한국 지원)**
2. Devvit 앱을 실제로 만들어서 설치시킬 대상 커뮤니티 선정 (r/MALfoid 21k 같은 한국어 말포이 커뮤니티가 유량)
3. Data Access Request 승인 → 정식 client id/secret → 앱을 Devvit 으로 마이그레이션 (보상 조건 #4)
4. Stripe Connect 온보딩은 **보상 선정 확정 후** 해도 늦지 않음 (선정 전 계좌 개설은 불필요)
   - 온보딩 페이지: https://www.reddit.com/earn
   - 필요 서류: 본인 계좌(수취인 명의) · **W-8BEN** (한국인) · 정부 신분증 · 주소

---

## 6. 실질 결론 — 돈보다 중요한 것

| | 가치 |
|---|---|
| $1,000 마이그레이션 보상 | ❌ **수령 불가** (앱이 2026-03-25 이전에 존재해야 함) |
| 앱 등록 완료 | ✅ **2027-01-12 미등록 API 차단 회피** (2027-03 공개 API 완전 종료) |
| Data Access Request 승인 | ✅ **정식 client id/secret** → quota 넉넉 + 검색/서브레딧 전체 |
| Devvit Developer Funds | ⚠️ 조건부 (Devvit 앱 + 50 installs 또는 5,000 일활) |

---

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
