---
name: kskills:update
description: kskills update — 캐시를 pull하고 설치 copy를 새 소스로 갱신한다. 캐시는 origin만 따라간다는 원칙, 개명·이관 소스의 재정렬 절차(구명 remove → update → add), kskills-app 의존 재설치를 다룬다. "스킬 업데이트", "소스 변경 당겨줘", "개명됐는데 팜 정리" 요청에 사용.
---

# kskills:update — 갱신

```sh
kskills update              # 전 소스
kskills update <src>        # 한 소스만
```

## 갱신 흐름

캐시 클론 pull → 설치된 copy를 소스 내용으로 다시 복사(설치명 불변) → 심볼릭 검증
→ 투영 재생성. 업스트림에서 스킬 **이름이 바뀌면** 자동 추적되지 않는다 — 아래 절차로.

## 캐시는 origin만 따라간다

로컬 리포의 미푸시 커밋은 캐시에 안 온다. "갱신됐는데도 옛 내용"이면 먼저:

```sh
cd <소스 리포> && git push origin main
kskills update <src>
```

## 개명·이관 소스 재정렬

소스에서 스킬을 개명/이동했다면(예: review:loop → revu:loop):

```sh
kskills remove <구이름들>            # lock의 옛 기록 제거
kskills update <src>                 # 캐시를 새 커밋으로
kskills add <src> -a agents -a claude-code
```

라우터·커맨드 투영은 자동 — 개명 주소가 기존 패밀리에 합류하면 라우터 멤버가
병합된다.

## kskills-app 의존 갱신

file: 카피는 낡은 엔진을 물 수 있다 — 갱신 후 앱 재기동 전에:

```sh
cd kskills-app && rm -rf node_modules/kskills && npm install
```
