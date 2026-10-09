---
name: kskills:web
description: kskills 웹 어드민 — 기동·접근·UI 구성. 서버 띄우기(1회 토큰·127.0.0.1), 상단 하네스 체크리스트, 소스별 그룹 뷰, 업데이트 잡 로그, 스킬 본문 패널, ⏫ 웹 종료를 다룬다. "kskills 웹", "웹 어드민", "관리자 웹 열어", "어드민 켜줘" 요청에 사용.
---

# kskills:web — 웹 어드민

```sh
kskills web-ui        # foreground 기동 (인자 없이 kskills 실행과 동일), 종료 Ctrl-C
```

kskills-app(웹 어드민 앱 — KSKILLS_APP 으로 경로 지정)의 `server.mjs`를 띄운다 — 127.0.0.1 전용, 기동
로그에 1회 토큰이 붙은 URL이 나온다. `KSKILLS_APP`으로 앱 경로 오버라이드.

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

- 엔진은 `kskills` npm file: 의존 — CLI 갱신 후 앱 재기동 전에
  `rm -rf node_modules/kskills && npm install` (낡은 카피가 낡은 엔진을 무는 주 원인)
- 서버 프로세스는 hub/터미널로 관리: 재기동 시 포트·토큰이 바뀐다
- API: state·harnesses·skill/<name>·catalog·add(agents[])·update(잡)·shutdown
