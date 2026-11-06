# kskills CLI 계약 — 프로세스 경계 소비자용 (kaos 등)

작성: 스킬장인 2026-11-06. 기준 버전: **0.3.3**(list --emit 탑재). 이 문서가 유일한 선언적 계약이다.

## 원칙

1. kskills 는 **CLI 로 발행되는 패키지**다. `kskills/bin/kskills.mjs` 의 내부 export(runCommand·readLock·AGENT_TABLE 등)는 **미선언 계약** — 존재는 하지만 형태를 보증하지 않는다. 0.2→0.3 원장·설치 모델 전환에서 실제로 깨졌다(kaos api.test 7건, 2026-11-06).
2. 소비자는 **자식 프로세스로 CLI 를 spawn 하고 stdout JSON 을 파싱**한다. in-process import 금지.
3. **stdout 순수성**: `--emit` 경로의 stdout 은 JSON 만 — 진행 안내·경고는 전부 stderr(#9 원칙). 소비자는 stdout 전체를 그대로 `JSON.parse` 할 수 있어야 한다.
4. 조회(`--emit`)는 부수효과 없음 — 네트워크 갱신·원장 쓰기를 하지 않는다.

## 계약 엔드포인트

### `kskills list --emit` (0.3.3~)

- stdout: 설치 스킬 행의 JSON 배열(들여쓰기 2). **빈 경우 `[]`**.
- 행 스키마(계약 필드 — 마이너 내 동결):

| 필드 | 형 | 의미 |
|---|---|---|
| `name` | string | 스킬 이름(=farm 디렉터리명) |
| `kind` | string | `original`(원장·farm 정규화 원본) · `link`(live 원본 — 소스가 로컬 경로) · `kskills`(캐시 내부 live) · `broken`(깨진 링크) · `dir`(원장 밖 foreign 디렉터리) |
| `agents` | string[] | 링크된 하네스 목록 |
| `source` | string | 소스(원장 표기 그대로 — owner/repo·URL·경로) |
| `dir` | string\|undefined | farm 원본 절대경로 |
| `description` | string | SKILL.md frontmatter description(없으면 "") |
| `requiresEnv` | string[]\|null | frontmatter requires-env 파싱 결과 |

- 부속 필드(`rec` 등)는 비계약 — 소비자는 의존 금지.

### `kskills harnesses --emit` (0.3.2~)

- 행: `{agent, status: installed|trace|absent, dir, managed, defaultTarget, rank|null}` — rank 는 시장 순위(정렬 키), 비시장은 null.

### `kskills catalog --emit <src>` (기존)

- 소스 1개의 catalog fragment(name/address/family/description/source).

## 버전·변경 정책

- `kskills --version` 으로 확인. kaos 는 번들 엔진 1개(npm `^0.3.3+`)만 쓴다.
- 계약 필드의 제거·타입 변경은 메이저(0.x 에서는 차기 마이너라도 이 문서 부록으로 공지 후). 필드 추가는 자유 — 소비자는 무지식(ignore-unknown)이어야 한다.
- 사람 대상 표 형식(`--emit` 없는 출력)은 **비계약** — 언제든 바뀐다.
