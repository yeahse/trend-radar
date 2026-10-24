# 📡 Trend Radar — 트렌드 선행 탐지 시스템

> AI 팬애니 / TS 채널을 위한 **"남들보다 2~4주 먼저 유행을 잡는"** 자동 수집·점수화·브리핑 시스템
> Node.js 22 / 외부 의존성 0개 (npm install 필요 없음)

---

## 1. 이 시스템이 잡아내는 것

```
Tier1 원천(커뮤니티) → Tier2 증폭(밈) → Tier3 포맷 확산 → Tier4 메인스트림 → Tier5 한국 도달
   itch/pixiv/DA       KYM/Reddit        TikTok/유튜브업로드     YT Trending      네이버 검색
        ↑                                                                        ↑
        └─────── 여기가 내 문감(출시 구간) ───────┘                      한국 도달 = 늦음
```

핵심 원리 3가지:

1. **People 먼저, Trends 나중** — 유행은 검색에서 생기지 않고 사람들 사이에서 생긴다. 탐색은 커뮤니티 기반, 검증은 검색량 기반.
2. **크로스오버 = 확산 신호** — 팬덤 안에서 터진 밈이 만체 subreddit/일반 SNS로 넘어가면 그 다음부터 유튜브 콘텐츠가 폭발한다. (말포이: X 9/22 → r/dankmemes 9/29 → 유튜브 AI애니 10월)
3. **공급 < 수요 = 공짜 시장** — 같은 키워드 영상/콘텐츠가 적은 동안에만 노출이 열린다.搜索량은 과거이고 알고리즘은 공급량을 본다.

---

## 2. 빠른 시작

```bash
cd trend-radar
node src/run.mjs            # 수집 + 점수화 + 리포트 생성 (보통 50~90초)
node src/run.mjs --force    # TTL 무시하고 전부 새로
node src/run.mjs --fast     # 레딧/무거운 소스 제외 (30초)
node tools\verify_sources.mjs  # 소스별 수집健全성 점검 (파서 깨짐 감지)
```

> ⏰ **자동 실행 등록 완료** — Windows 작업 스케줄러 태스크 `TrendRadar Daily` (매일 **08:30**).
> `tools\run_daily.bat` 경유 → `logs\run.log`에 exit code 기록. 조회: `Get-ScheduledTask -TaskName "TrendRadar Daily"`

산출물:

| 파일 | 내용 |
|---|---|
| `reports/YYYY-MM-DD.md` | 일일 브리핑 (Markdown) — 이걸 읽으면 됨 |
| `reports/latest.md` | 가장 최근 브리핑 (고정 경로) |
| `data/tracker_YYYY-MM-DD.csv` | 트래커 스프레드시트 (엑셀/시트 바로 import, 한글 BOM 포함) |
| `data/snapshot.jsonl` | 스냅샷 누적 (추세 추적·모멘텀 계산용) |
| `data/state.json` | 소스별 TTL 캐시 |

---

## 3. 수집 소스 (키 필요 없음 vs 키 필요)

### 3-1. 키 불필요 (기본 동작)

| 소스 | 엔드포인트 | 잡히는 신호 | 선행도 |
|---|---|---|---|
| **네이버 데이터랩** | `qcHash.naver` → `qcExcel.naver` (xlsx) | 한국 검색 수요, 7일 성장률 | ★★★ |
| **Reddit** | OAuth 우선 / RSS 폴백(서브레딧 top만) | 밈 크로스오버 | ★★★ |
| **Bluesky** | `api.bsky.app/xrpc/app.bsky.feed.searchPosts` | 팬덤 실시간 반응 | ★★★ |
| **Know Your Meme** | `knowyourmeme.com/trending` | 새 밈의 탄생 | ★★★ |
| **itch.io** | `itch.io/games/new-and-popular` | 밈 → 비주얼노벨 확장 | ★★ |
| **DeviantArt** | 태그 페이지 `aria-label` 파싱 | 신규 팬아트/커미시/연작 | ★★ |
| **Wikipedia** | `wikimedia.org/api/rest_v1/.../pageviews` | IP·캐릭터 관심 급상승 | ★★ |

> **네이버 데이터랩을 키 없이 쓰는 방법** (구현 완료):
> 데이터랩 웹이 내부적으로 쓰는 `POST /qcHash.naver` → `GET /qcExcel.naver?hashKey=...`(xlsx)를 그대로 호출.
> 공식 Open API(client id/secret)를 넣으면 자동으로 그쪽으로 전환됨(`config.json`의 `naver`).
> xlsx 파서는 `src/lib/xlsx.mjs` — 외부 라이브러리 없이 ZIP→XML 직접 해석.
>
> ⚠️ **REF 앵커 그룹 (중요)**: 데이터랩 비율은 "한 요청 안의 최댓값=100"으로 정규화된다.
> 요청을 여러 번 나누면 서로 다른 스케일이 되므로 **모든 요청에 고정 기준 그룹(`__REF_ALL__` = `config.json` → `naver.refScaleTerms`)을 같이 넣는다.**
> 그래야 ①term 간 절대 비교 ②날짜 간 추세 비교가 성립한다. `refScaleTerms`는 절대 바꾸지 말 것.
> 근거와 실측 → [`docs/03_수정내역_2026-10-23.md`](docs/03_수정내역_2026-10-23.md)

> ⚠️ **Reddit RSS 검색은 폐기됨**: 무인증 `search.rss`는 검색을 못 하고 전체 신구 피드를 돌려준다.
> 실측: `genderbend fanart` 검색에 r/MakeFriendsOver30 등 무관 서브레딧 25건이 유입됨.
> → OAuth 키 있을 때만 검색. 키 없으면 서브레딧 top만 수집하고 사유를 리포트에 명시.

### 3-2. 키 필요 (넣으면 강해짐)

| 소스 | 발급 방법 | 얻는 것 | 상태 |
|---|---|---|---|
| **YouTube Data API** | Google Cloud Console → API 활성화 → 키 생성 (하루 10,000 유닛 무료) | 키워드별 최근 7일 업로드 수(공급량), **경쟁 영상 목록(제목·채널·게시일)**, 지역 인기 영상 | ✅ `youtube.apiKey` |
| **Reddit OAuth** | reddit.com/prefs/apps → "script" 앱 → client id/secret | RSS보다 훨씬 안정적·많음, **검색 가능**(크로스오버 탐지의 핵심) | ⏳ 직접 발급 필요 |
| **Discord Webhook** | 서버/채널 → ⚙️ → Integrations → Webhooks | 매일 08:30 브리핑 자동 도착 | ✅ `discord.webhookUrl` |

---

## 4. 점수 해석

```
TrendScore = Velocity(35) + CrossPlatform(20) + SupplyDeficit(25) + Fit(20) + Momentum
```

| 구성 | 계산식 | 의미 |
|---|---|---|
| Velocity | `log10(1+반응량) × 27` | 레딧/블루스키 최근 7일 반응 + 네이버 7일 성장률 + 위키 조회수 성장률 |
| CrossPlatform | `플랫폼 수 × 25` | 한 곳뿐이면 가짜일 확률 높음 |
| SupplyDeficit | 업로드 0~2편→100점 | 같은 키워드 콘텐츠가 적을수록 높은 점수 |
| Fit | fit 키워드 포함→100점 | 내 포맷으로 즉시 제작 가능한가 |
| Momentum | 전일 대비 점수 변화 × 2 | 상승 중인 것만 끌어올림 |

**공급량(SupplyDeficit) 측정 방식 — 2가지**

| 모드 | 방법 | 신뢰도 |
|---|---|---|
| `api` ✅현재 | YouTube Data API `search?part=id&type=video&publishedAfter=7일전` → `totalResults` | ★★☆ (느슨한 매칭 근사치) |
| `proxy` (폴백) | YouTube 검색 URL에 `sp=CAISAhAB+EgIIAw%3D%3D` (동영상+이번주) → `estimatedResults` | ★★☆ (±1~5%, 키 없을 때) |

> ⚠️ **공급 "개수"보다 "실제 경쟁 영상 목록"이 신뢰할 수 있다.**
> 2026-10-23 실측: 같은 term이라도 API(88,596) / proxy(7,268)가 10배 차이 난다.
> 그래서 `search.list`의 **제목·채널·게시일**을 같이 수집해 리포트에 "유튜브 경쟁 영상" 섹션으로 붙인다.
> → 이게 포화의 직접 증거다 (`Harry Potter × Female Malfoy` = 이미 시리즈 소비 중 등).

**판정**: `ACT` ≥ 55점(48시간 안에 1화) / `WATCH` ≥ 35점(7일 재확인) / `IGNORE` < 35점

### ⚠️ 점수 읽을 때 반드시 볼 것

| 표시 | 의미 | 대응 |
|---|---|---|
| `⚠️저볼륨` | 7일합이 기준 미달 → **%성장률이 분모 0 근처라 수치로 볼 수 없음** | 성장률 무시, 절대량만 보기 |
| `수요점유율` | 기준 수요(REF) 중 이 단어가 차지하는 % | **상대적 규모 비교의 유일한 신뢰할 수 있는 지표** |
| `최근업로드 -` | YouTube API 키 없음 → 공급량 미측정 | SupplyDeficit는 가정값 60. 키 넣어야 진짜 판정 |
| `단일 플랫폼` | 1곳에서만 잡힘 | 가짜일 확률 높음 |

> 저볼륨 게이트: `growth × 0.6 × min(1, last7/10)`. 절댓값 0 근처의 +100%는 점수를 부풀리지 않는다.

### 알려진 편향 (2026-10-23 실측)

- **수집 소스가 영어 중심** → 한국어 단어(말포이·해리포터)는 Reddit/Bluesky에 안 떠서 `crossPlatform=0`으로 깎인다.
  → **한국어 단어의 점수는 과소평가된다.** `수요점유율`과 리포트 표를 같이 볼 것.
- `fit`은 "내 포맷으로 즉시 만들 수 있는가"만 잰다. 수요 자체는 재 측정하지 않는다.

---

## 5. 매일 하는 일 (루틴)

| 주기 | 시간 | 할 일 |
|---|---|---|
| 매일 | 20~25분 | `node src/run.mjs` → 리포트 확인 → ACT 항목 기획 |
| 매일 | 5분 | vidIQ trending keywords (views/hr), TikTok Creative Center 해시태그, Google Trends Rising/브레이크아웃 |
| 주 1회 | 2시간 | Pinterest Trends/Predicts, AO3·itch·pixiv, 경쟁 채널 30일 성장률, **틀린 예측 회고** |
| 즉시 | 1분 | 티크톡/레딧/블루스키에서 새로 보인 밈 → `config.json` watchlist에 추가 |

전체 루틴과 각 툴 사용법 → [`docs/00_무료툴_세팅_가이드.md`](docs/00_무료툴_세팅_가이드.md)

---

## 6. 구조

```
trend-radar/
├── config.json              # 감시 대상(fit/키/소스) 설정
├── src/
│   ├── run.mjs              # 오케스트레이터 (매일 08:30 스케줄러)
│   ├── score.mjs            # TrendScore 계산 + 신규 후보 발견
│   ├── report.mjs           # Markdown 브리핑 + Discord/Telegram 전송
│   ├── record.mjs           # ★ 결정 기록 CLI (착수/포기/업로드)
│   ├── feedback.mjs         # ★ 적중률 계산 + 회고 섹션
│   ├── decisions.mjs        # ★ 결정 로그 스토리지 (decisions.jsonl)
│   ├── globalmatch.mjs      # ★ 글로벌 트렌드 → 내 포맷 매칭 + 미디어 형식 분류
│   ├── cache.mjs            # 소스별 TTL 캐시
│   ├── store.mjs            # JSONL/CSV 저장
│   ├── lib/xlsx.mjs         # 의존성 없는 xlsx 파서
│   └── sources/             # reddit, bluesky, naver, youtube, youtube_supply, globaltrends, kym, wikimedia, earlycommunity
├── docs/
│   ├── 00_무료툴_세팅_가이드.md
│   ├── 01_트래커_스키마.md
│   ├── 02_일일_브리핑_자동화.md
│   ├── 03_수정내역_2026-10-23.md
│   ├── 04_키_설정_안내.md
│   └── 05_매일_루틴.md        # ★ 이 프로그램 사용법
├── reports/                 # 일일 리포트
├── data/                    # 스냅샷·CSV·상태·결정로그
└── tools/                   # run_daily.bat, selfcheck.mjs, verify_sources.mjs
```

---

## 4.5 ★ 이 프로그램은 어떻게 쓰는가 (요약)

```
08:30  자동  → [A축] 내 키워드 + [B축] 🌍글로벌 트렌드 → 리포트 + Discord #briefing
09:00  네 판단 → Discord에서 후보 고르기 → 리포트에서 경쟁현실 + 글로벌 확인
09:05  ★기록  → node src/record.mjs --term "제비차" --status made --note "..."
22:00  업로드 → node src/record.mjs --term "제비차" --status posted --url ... --views ...
```

### 두 축
| | A축 (watchlist) | B축 (🌍 글로벌) |
|---|---|---|
| 질문 | "내 키워드가 지금 어때?" | "**세상이 지금 뭐를 원하는가?**" |
| 소스 | 네이버·YouTube 공급량·Reddit·Bluesky·DA·itch·KYM | **GoogleTrends(6지역)·YouTube 인기(6지역)·Wikipedia(3언어)·Reddit popular** |
| 쓰는 곳 | 기존 채널 안에서 치수 | **새 포맷/아이디어 탐색** (틱톡·인스타·유튜브) |
| 산출물 | `tracker_YYYY-MM-DD.csv` | `global_trends_YYYY-MM-DD.csv` |

기록이 쌓이면 리포트에 **적중률 · 지속신호 · 놓친 것 · 평균 조회수**가 자동 생성된다.
상세 → [`docs/05_매일_루틴.md`](docs/05_매일_루틴.md)

> ⚠️ **TikTok / Instagram 은 공개 API가 없다** (2026-10-23 실측: Creative Center API 404, IG는 SPA).
> → 이 두 곳은 브라우저로 직접 봐야 한다 (수동 3분). 시스템이 자동화하는 건 위 4개 소스까지.

---

## 7. 주의

- **Breakout ≠ 지속형 트렌드.** 구글트렌드 "Breakout"(5,000%↑)은 대부분 fad. 영상 1~2편만 테스트 후 확장할 것.
- **RSS 폴백은 Reddit당 1회만 성공**한다. OAuth 키를 넣으면 해결.
- **내부 엔드포인트는 수시로 바뀔 수 있다.** 네이버/틱톡은 공식 API 우선, 내부 API는 폴백으로만.
- **fanfic/AI 생성물 표시와 원작 크레딧**은 채널 신뢰도의 life-or-death. 밈이有毒해져도(말포이 "foid" 논쟁처럼) 대응 태세를 미리 정해둬라.
