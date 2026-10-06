# kskills

개인 스킬 CLI와 스킬 컬렉션을 함께 담는 리포. 두 요소:

1. **kskills CLI** (`bin/kskills.mjs`) — 스킬을 에이전트 스킬 디렉터리에
   설치·갱신·제거·검색하는 도구. vercel-labs/skills 기능 패리티, 의존성 0,
   Node 18 이상, 단일 파일.
2. **컬렉션** (`skills/`) — 반복 작업 방식을 스킬로 축적하는 저장소.

실행은 npm 패키지로 한다: `npx kskills <command>` (Node 18 이상).
git 소스 직접 실행도 가능하다 — private 소스 설치 시 gh/SSH 인증이 필요하다.

## 사용

```sh
npx kskills add   # kaos-works/kskills → ~/.agents/skills (farm)
```

명령:

| 명령 | 동작 |
|---|---|
| `kskills add [source]` | 소스의 스킬을 farm(`~/.agents/skills`)에 설치 — 원격 소스는 정규화 copy 설치, 로컬 `./path` 는 라이브 심볼릭. 기본 소스 `kaos-works/kskills`. 설치 후 커맨드·라우터 투영 |
| `kskills list` | 설치된 스킬 전체 조회 (global+project, 관리 주체·에이전트·소스 표시) |
| `kskills remove [names]` | 설치 제거. `--all` 전체 · `--broken` dangling symlink만(대상 소실분 — 정의상 안전) · 잠금 기록 없는 디렉터리는 보호 |
| `kskills update [source]` | 캐시 리포 pull + copy 설치분 원본 재동기화 + 링크 점검 |
| `kskills use <source>` | 설치 없이 스킬 프롬프트 출력. `--agent <cmd>`면 stdin으로 파이프 |
| `kskills find [query]` | 설치분·캐시 스킬 이름/설명 검색 |
| `kskills init [name]` | `./(name)/SKILL.md` scaffold |
| `kskills env [skill]` | 스킬 env 기대·해소 — `metadata.requires-env` 키 조회 · `--load` 셸 프리앰블 · `--check` 전수 감사. 소스는 공용 `~/.local/state/skills/.env` (`--source` 로 지정, 값 미출력) |
| `kskills catalog --emit <src>` | 소스의 카탈로그 조각 출력 — `name·address·family·description·source` |
| `kskills harnesses` | 이 머신에 감지된 하네스 목록 — 기본 설치 타깃 확인 |
| `kskills registry [name]` | 레지스트리 카탈로그 조회 (`~/.kskills/registries.json` 으로 등록) |
| `kskills web-ui` | 웹 어드민 기동 (별도 앱 — `KSKILLS_APP` 경로, 미설치 시 도움말 폴백) |
| `kskills` (인자 없음) | TTY면 웹 어드민 · 파이프면 도움말 |

소스 형식 (skills CLI 패리티):

- `<skill>[@<registry>]` / `family:slug` / bare 이름 — 레지스트리 카탈로그 해소
  (`~/.kskills/registries.json` 등록, `registry --refresh` 갱신)

- `owner/repo` — GitHub shorthand. 인증: **ssh 우선**(BatchMode 키) → 실패 시
  명시적 토큰 https(`GITHUB_TOKEN`/`GH_TOKEN` env, 없으면 `gh auth token` 1회
  호출). git 앰비언트 credential helper는 kskills git 호출에서 차단한다 —
  헬퍼의 간헐적 무한 대기가 전체 업데이트를 얼리기 때문이다. 캐시 원격은
  ssh 로 자동 전환된다

ssh 키 주입 (BatchMode 전제):
- 로컬: `~/.ssh` 키 + ssh-agent — 패스프레이즈 키는 `ssh-add` 선행 (미션 시
  BatchMode 즉시 실패가 정상 동작)
- CI·컨테이너: `GIT_SSH_COMMAND='ssh -i /path/key -o IdentitiesOnly=yes'`
  로 키 경로 주입, 또는 Actions 의 `GITHUB_TOKEN` 이 자동으로 토큰 경로를
  탄다 (ssh 불필요)
- 임시 키: `SSH_KEY` 환경변수 → 파일 화 후 `GIT_SSH_COMMAND` 지정 패턴
- `https://github.com/o/r/tree/<ref>/<path>` — 리포 내 특정 스킬 서브트리
- git URL — `https://…`(비-.git http는 다운로드 시도 후 git fallback) · `git@…` · `file://…`
- `host` / `https://host/` — well-known discovery
  (`/.well-known/agent-skills/metadata.json`)
- `https://…` (아카이브·SKILL.md) — 직접 다운로드. tar/tgz/zip(bsdtar),
  크기·파일수 제한 상류 동일. 항상 copy로 설치
- 로컬 경로 — `kskills add ./my-repo`. 해당 경로를 직접 가리키는 symlink가
  깔린다(개발·실시간 추적용). 캐시 복제 없음
- ssh fallback은 기본 BatchMode(대화형 프롬프트 금지) — passphrase 키 등
  별도 인증이 필요하면 `GIT_SSH_COMMAND` 환경변수로 재정의한다.

주요 옵션: `-a/--agent`(반복·`'\*'` 전체) · `-s/--skill`(선택 설치) ·
`-g/-p`(scope, 기본 global — 상류와 다른 유일한 의도적 차이) ·
`-l/--list`(발견만).

에이전트: vercel-labs/skills와 동일한 id 전부(참조 기준 1.5.23의 77개) + 공유 디렉터리 별칭
`agents`(`~/.agents/skills`).

기본 타깃: `-a` 미지정 시 `agents`(공용 farm) + **시장 점유율 상위 하네스 중
이 머신에 감지된 것** (claude-code → codex → github-copilot → gemini-cli →
cursor → opencode → amp 순, + pi). 감지 = PATH binary 또는 desktop app 번들
(cursor: `Cursor.app`). 스킬 디렉터리 흔적은 설치 증거가 아니다(설치가 mkdir
로 만들어버리므로 자기증식). omp 는 별도 타깃 없이 farm projection 으로
상시 커버. `KSKILLS_DEFAULT_AGENTS`로 고정(콤마 목록, 빈 값 = farm 만).

설치 모델: git 소스는 `~/.kskills/repos/<owner>__<repo>`에 canonical clone을
두고 그 스킬을 각 에이전트 디렉터리에 설치한다(원격=정규화 copy, 로컬=라이브
심볼릭). 링크 대상 곧 메타데이터 — `list`·`update`가 전부 파생한다. 다운로드
설치는 `~/.kskills/installs.json`에 출처를 기록하고 `update`가 재동기화한다.
이미 존재하는 비-symlink·비-잠금 경로는 덮어쓰지 않고 건너뛴다.

## 스킬 카탈로그

| 스킬 | 용도 |
|---|---|
| [kskills:create-skill](skills/kskills-create-skill/) | 스킬 생성 — 레이아웃 계약·스캐폴드 |
| [kskills:add](skills/kskills-add/) | 설치 — 소스 표기·대상 하네스·foreign 스킵 수습 |
| [kskills:remove](skills/kskills-remove/) | 제거 — 이름/소스 단위·캐시 정리 원칙 |
| [kskills:update](skills/kskills-update/) | 갱신 — 캐시 origin 의존·개명 재정렬·앱 의존 |
| [kskills:list](skills/kskills-list/) | 조회·공통 — 장부 모델·투영·검증(발견·테스트·상류 호환·패키징) |
| [kskills:web](skills/kskills-web/) | 웹 어드민 — 기동·체크리스트·잡 로그·⏫ |

## 구조

```
bin/kskills.mjs               CLI — 단일 파일, 의존성 0
skills/<kebab-name>/SKILL.md  스킬 단위 = 디렉터리 1개
  ├─ SKILL.md                 필수. frontmatter(name, description)가 매니페스트
  ├─ reference.md             선택. 에이전트가 필요할 때 여는 부가 문서
  ├─ scripts/                 선택. 실행 헬퍼
  └─ templates/               선택. 복사용 스니펫
_template/*.tmpl              스킬 생성용 템플릿. 발견 대상 아님
test/                         CLI 계약 테스트 — 개발 트리 한정 (릴리스 미포함)
```

## 새 스킬 작성

에이전트에서 `create-skill` 스킬을 로드하여 생성을 지시하거나, 직접:

```sh
cp _template/SKILL.md.tmpl skills/<kebab-name>/SKILL.md
cp _template/reference.md.tmpl skills/<kebab-name>/reference.md
$EDITOR skills/<kebab-name>/SKILL.md
npx skills add . --list   # 발견 확인 후 커밋
```

카탈로그 테이블에도 한 줄 추가. 자세한 절차는 `skills/kskills-create-skill/`.

## 유지 규칙 (레이아웃 계약)
- 우선 컨테이너(`skills/`·`.claude-plugin` 매니페스트가 가리키는 plugin 스킬 경로)에서
  3 depth까지 발견. 우선 탐색이 0건이면 전체 재귀(depth 5) 폴백 — plugin
  marketplace 배치(`plugins/*/skills/*`)도 설치 가능. 이 리포는 플랫 1-depth 사용.
- SKILL.md를 찾으면 그 아래로는 내려가지 않는다(shadowing) → 스킬 디렉터리
  내부에 SKILL.md 중첩 금지.
- frontmatter는 YAML 전용. `name`(= 디렉터리명, kebab-case)과
  `description`(what + when-to-use 트리거 문장) 필수.
- 루트에 SKILL.md를 두지 않는다 — 컬렉션 전체가 단일 스킬로 오인된다.
- 탐색 제외 디렉터리: `node_modules` `.git` `dist` `build` `__pycache__`
  `_template`. 설치는 스킬 디렉터리 단위라 내부 파일별 제외는 없다.
- 비공개/WIP: frontmatter에 `metadata: { internal: true }` — 기본 설치에서
  제외되고 `-s` 명시 시에만 설치된다.
- 서드파티 스킬을 도입할 때는 출처를 스킬 frontmatter 아래 명시.

## 배포·상태 불변식 (farm/state 계약)

CLI 어디에도 강제하는 코드는 없다 — 설치 루프의 성질 자체가 계약이고, 스킬
작성자가 지켜야 한다. 고정 5항:

| # | 고정 항목 | 위반 시 실패 모드 |
|---|---|---|
| 1 | farm 경로 `$HOME/.agents/skills/<name>/` | 소비 스킬·훅·스크립트의 참조 전반이 깨짐 |
| 2 | 설치 단위 = 소스 `skills/<name>/` 디렉터리 1개 | 리포 루트 자산(README·docs·루트 스크립트)은 farm에 도달하지 못함 — 바이너리는 스킬 내부 `bin/`에 둘 것 |
| 3 | 스킬 디렉터리는 소스의 파생물 | copy 설치는 rm 후 전체 재복사(내부 소멸) · symlink 설치는 실체가 캐시/소스 리포(내부 기록은 리포 오염·갱신 충돌) |
| 4 | 상태 루트 `$HOME/.local/state/skills/<name>/` | update 생존 자산(토큰·인덱스·DB·레지스트리)의 집 주소가 스킬마다 갈라짐 → 백업 제외·완전 제거·스킬 간 공유가 전부 낱개 규약화 |
| 5 | 실행·복사 대상 경로는 `"$HOME/..."` 표기 | `"~/x"`는 따옴표 안에서 전개되지 않음 — 복사 시 조용히 깨짐 |

경로 표기: 에이전트가 복사해 실행하는 자리(코드블록·프롬프트 템플릿)는
`"$HOME/..."` — 따옴표 안에서도 전개된다. `~` 는 사람 대상 서술에만 쓴다.

## 검증

```sh
node bin/kskills.mjs add . -l      # CLI 발견 동작
npx skills add . --list            # 기존 discovery 경고 0건 (호환 유지)
```

계약 테스트(`npm test`)는 개발 트리에서만 — 릴리스 트리에 `test/`는 미포함.

커밋 메시지: CLI는 `cli: <요약>`, 스킬은 `skill: add|update <name>`,
문서는 `docs: <요약>`.

## 서드파티 스킬 정책

- **업스트림 추적**: 유명 컬렉션(vercel-labs/agent-skills, anthropics/skills)은
  원본 소스로 직접 설치(`kskills add <owner>/<repo>`) — 갱신을 받는다.
- **도입(vendoring)**: 수정했거나 private 맥락이 필요한 것만 이 리포에
  도입한다. 도입 시 출처를 스킬 frontmatter 아래 명시한다.

## 출처

- 레이아웃 계약과 템플릿 구조는 [vercel-labs/skills](https://github.com/vercel-labs/skills)
  (MIT)의 init 템플릿·discovery 규칙을 참고해 재작성한 것이다.
- pi 에이전트 경로(`~/.pi/agent/skills`)는 [Pi skills 문서](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
  기준. 이 리포에는 그 소스 코드가 포함되어 있지 않다.
