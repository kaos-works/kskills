---
name: kskills:add
description: kskills add — 스킬 소스를 받아 하네스 팜에 설치한다. 소스 표기(owner/repo·tree URL·git·./path·아카이브), 대상 하네스 선택(-a), 선택 설치(-s), "exists and is not ours" 스킵의 원인과 수습을 다룬다. "스킬 설치", "이 리포 스킬 깔아", "claude에도 설치" 요청에 사용.
---

# kskills:add — 설치

```sh
kskills add [source] [-a <agent> …] [-s <skill> …] [-g|-p] [-l]
```

## 소스 표기

| 표기 | 동작 |
|---|---|
| `owner/repo` | GitHub shorthand (https → gh → ssh fallback) |
| `github.com/o/r/tree/<ref>/<path>` | 리포 하위 경로만 |
| git URL (https/git@/file://) | 통째로 클론 |
| `host` · `https://host/` | well-known 발견 (`/.well-known/agent-skills/`) |
| 아카이브/SKILL.md URL | 직접 다운로드 → farm 정규화 원본 |
| `./path` | **로컬만 라이브 심볼릭** — 나머지는 전부 스펙 준수 원본 |

## 대상 선택

- 원본은 항상 공유 팜 `~/.agents/skills` 에 1개 (cline·warp·zed·kimi 등이 함께 읽음)
- `-a claude-code` 반복 가능 — 그 하네스 전용 팜에 farm → symlink 추가
- 설치 감지는 `kskills harnesses` (installed 자동선택 체크리스트는 웹 어드민 상단)
- `-l` 은 설치 없이 발견만

## 설치 불변식

1. 스킬당 farm 원본 1개 + 선택 하네스 symlink(상대경로). 설치명 = 디렉터리명(하이픈),
   v1 주소(`fam:name`)는 frontmatter `address`로 보존.
2. 원장(`~/.kskills/installs.json`)이 장부 — 스킬당 1행 `{skill, source, links, method}`.
   재 add 는 행을 늘리지 않는다(멱등).
3. 설치·제거·갱신마다 투영이 자동 재생성된다(커맨드·패밀리 라우터).

## "exists and is not ours" 스킵

대상 팜에 같은 이름 디렉터리가 lock 밖으로 존재하면 설치를 건너뛴다 — foreign
보호 원칙. 수동 cp가 원인이 거의 전부:

```sh
rm -rf ~/.agents/skills/<name>          # 잔여 제거 (소스 리포에 진본 확인 후)
kskills add <src> -a agents -a claude-code
```

## 사후 확인

```sh
kskills list | grep <name>    # kind=copy · source=owner/repo · agents에 대상 포함
```
