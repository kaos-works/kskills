---
name: kskills:remove
description: kskills remove — 스킬을 이름·주소 또는 소스 단위로 제거하고 lock·캐시·투영까지 정리한다. 마지막 기록 소멸 시 캐시 정리 원칙, --all/--broken, 소스 재설치 시점을 다룬다. "스킬 삭제", "이 소스 전부 빼줘", "끊어진 심볼릭 정리" 요청에 사용.
---

# kskills:remove — 제거

```sh
kskills remove <name|addr>…        # 이름·주소 단위
kskills remove <owner/repo|URL|./dir>   # 소스 단위 — 그 소스의 전 스킬
kskills remove                     # 무인자 = 끊어진 심볼릭 정리 (기본 동작)
kskills remove --all               # 전체
```

## 제거 불변식

1. lock 레코드를 지우고 farm 디렉터리(심볼릭이면 링크만)를 제거한다.
2. 소스의 **마지막 lock 기록**이 사라지면 캐시 클론(`~/.kskills/repos/`)도 같이
   정리 — "lock이 장부"의 완결. 재설치 예정이면 remove 대신 update를 쓰거나
   곧바로 add 하라(캐시 재클론 비용이 돌아온다).
3. 제거 후 투영이 자동 재생성 — 커맨드 파일·라우터가 prune된다.

## foreign 보호

lock에 기록되지 않은 디렉터리(수동 cp 잔여 등)는 제거를 거부한다. 진본이 소스
리포에 있으면 디렉터리를 직접 지우고 add로 다시; 없는 자산이면 내용 확인 후 수동 삭제.

## 사후 확인

```sh
kskills list | grep <name>        # 소멸
ls ~/.omp/agent/commands/         # 커맨드 prune 확인
```
