---
name: kskills-web
address: kskills:web
description: kskills 웹 어드민 — 기동·접근·UI 구성. 서버 띄우기(1회 토큰·127.0.0.1), 상단 하네스 체크리스트, 소스별 그룹 뷰, 업데이트 잡 로그, 스킬 본문 패널, ⏫ 웹 종료를 다룬다. "kskills 웹", "웹 어드민", "관리자 웹 열어", "어드민 켜줘" 요청에 사용.
---

# kskills:web — 웹 어드민

```sh
kskills web-ui        # foreground 기동 (인자 없이 kskills 실행과 동일), 종료 Ctrl-C
```

kskills가 자체 수반한 웹 어드민(`kskills/app/` — server.mjs·index.html)을 띄운다 — 별도 앱
설치 불필요, kskills CLI가 있으면 어디서나 기동된다. 127.0.0.1 전용, 기동 로그에 1회 토큰이
붙은 URL이 나온다. `KSKILLS_APP` env는 개발용 커스텀 앱 경로 오버라이드(빈 문자열은 미설정 취급).

## 접근

- 브라우저: 기동 로그의 `http://127.0.0.1:<port>/?token=…` (토큰은 쿠키로 1회 정착)
- 토큰 없는 접근은 401, 위조 Host 헤더는 403

## UI 구성

- **상단 하네스 체크리스트** — `kskills harnesses` 감지 결과. installed 자동 체크·
  trace 회색·kskills farm ⌂ 표시. install 시 체크된 하네스에만 설치(`-a` 다중).
- **소스별 그룹 테이블** — 체크박스로 소스 선택 갱신(⤓), 소스 전체 제거(✕),
  스킬 이름 클릭 → SKILL.md 본문 패널
- **카탈로그** — 소스 입력 → catalog 목록 체크 → install
- **로그 패널** — 업데이트 잡 stdout 라인 스트리밍(자식 프로세스)
- **⏫ 버튼** — 웹에서 서버 자체 종료

## 배경 지식

- 서버 구현은 kskills 패키지 내 `kskills/app/server.mjs`(CLI는 자체 수반 app/ 우선
  기동, kskills-app Electron 셸은 패키지 것을 import) — 셸 쪽 서버 문제는
  `node_modules/kskills` 갱신(`rm -rf node_modules/kskills && npm install`)으로 해소
- **"미설치"로 죽으면 CLI 카피 낡음 의심** — `kskills --help` 버전과 원본 repo
  (kaos-works/kskills) `package.json` 대조. 타 프로젝트(kaos 등) `node_modules/kskills`
  카피를 물고 있으면 옛 탐색 경로만 안다 — 심볼릭을 원본 `bin/kskills.mjs`로 재지정.
- 서버 프로세스는 hub/터미널로 관리: 재기동 시 포트·토큰이 바뀐다
- API: state·harnesses·skill/<name>·catalog·add(agents[])·update(잡)·shutdown
