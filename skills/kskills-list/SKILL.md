---
name: kskills:list
description: kskills 스킬 팜의 공통 관리 원칙 — lock 장부 모델·투영(커맨드·라우터)·검증 4종 게이트·커밋 관례·조회 서브커맨드 레퍼런스(list/harnesses/find/use/catalog). 조작 스킬 kskills:add/remove/update의 공통 기반. "팜 목록", "팜 구조", "어떤 하네스 깔림", "투영",
---

# kskills:list — 조회·팜 공통 원칙

전역 명령 `kskills` 가 설치돼 있다(설치: `npm i -g --allow-git=root kskills`
— private 리포는 gh/SSH 인증 필요). 엔진은 zero-dep 단일 파일(Node ≥18).
lock(`~/.kskills/installs.json`)이 장부 — farm의 모든 copy는 lock 레코드와 1:1이어야 한다.

## 서브커맨드

```
kskills add [source]        설치 (기본 소스 kaos-works/kskills · 기본 대상 agents)
kskills list                설치 목록 (name · kind · agents · source)
kskills harnesses [--emit]  이 PC의 하네스 감지 (installed/trace/managed)
kskills remove [names|src]  이름·주소 또는 소스 단위 제거
kskills update [source]     캐시 pull · copy 갱신 · 심볼릭 검증
kskills use <source>        설치 없이 스킬 프롬프트 출력
kskills find [query]        설치+캐시 스킬 검색
kskills catalog --emit <src> 소스 카탈로그 JSON (name/address/family/desc)
kskills init [name]         ./<name>/ SKILL.md 스캐폴드
kskills web-ui              웹 어드민 기동 (인자 없이 실행과 동일, 종료 Ctrl-C)
```

소스 표기: `owner/repo` · GitHub tree URL · git URL · `./path`(로컬=라이브 심볼릭) ·
아카이브 직접 다운로드. `-a <agent>` 반복 가능(설치 대상 복수), `-s <skill>` 선택 설치.

## 설치 모델 (불변)

- 원격 소스는 **스펙 준수 copy** — 설치명=디렉터리명(하이픈), v1 주소(`fam:name`)는
  frontmatter `address` 필드로 보존. `./path` 로컬만 라이브 심볼릭.
- 근원(provenance)은 링크가 아니라 lock. copy는 반드시 lock 기록을 동반한다.
- remove가 소스의 마지막 기록을 지우면 캐시도 정리된다.
- 투영(add/remove/update 시 자동 재생성, `# kskills:generated` 마커):
  `~/.omp/agent/commands/<base>.md`(커맨드, name=주소) ·
  `~/.omp/agent/agents/<plug>.md`(패밀리 라우터). foreign 파일(무마커 실파일)은 절대 건드리지 않는다.

## 검증 4종 (CLI 행위 변경 시 전부 — exit code로 판정, grep 통과는 무효)

```sh
node bin/kskills.mjs add . -l        # 발견 동작
npm test                             # 계약 테스트 (exit 0 게이트)
npx skills add . --list              # 경고 0 확인
npm pack && tgz=$(ls kskills-*.tgz) && rm -rf /tmp/pt && mkdir /tmp/pt \
  && tar xzf $tgz -C /tmp/pt --strip-components=1 \
  && node /tmp/pt/bin/kskills.mjs --version && rm -rf $tgz /tmp/pt
```

## 관례

- 커밋 prefix: `cli:`(엔진) · `skill: add|update|remove <name>`
- 실사용 팜(`~/.agents/skills` 등)은 CLI 통해서만 변경 — 수동 cp는 lock 밖 이탈(dir 표시)을 만든다.
  이탈 정리: 수동 디렉터리 제거 → `kskills add <src> -a agents -a claude-code`.
- 소스 리포 개명·이동 후에는 반드시 push — 캐시는 origin만 따라간다. 이후
  구명 remove → update → add 로 lock·farm 재정렬.
- kskills-app 의존 갱신: `rm -rf node_modules/kskills && npm install` (file: 카피가
  낡은 엔진을 물고 있는 주 원인).

## 웹 어드민

`kskills web-ui` — 기동·접근·UI 구성은 `kskills:web` 스킬 참조.
