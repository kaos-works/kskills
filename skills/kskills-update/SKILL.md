---
description: kskills update — 캐시를 pull하고 farm 원본을 새 소스로 갱신하며 파손 하네스 링크를 재결성한다. 캐시는 origin만 따라간다는 원칙, 구 원장 마이그레이션, 개명·이관 소스의 재정렬 절차, kskills-app 의존 재설치를 다룬다. "스킬 업데이트", "소스 변경 당겨줘", "개명됐는데 팜 정리" 요청에 사용.
---

# kskills:update — 갱신

```sh
kskills update              # 전 소스
kskills update <src>        # 한 소스만
```

## 갱신 흐름

캐시 클론 pull(소스당 1회) → farm 원본 재적립(스펙 재정규화 포함, 스킬당 1줄 보고)
→ 파손·실종 하네스 링크 재결성 → 원장 밖 고아 링크 청소 → 투영 재생성.
업스트림에서 스킬이 사라지면 원본·링크·레코드가 함께 정리된다. 구 원장(0.2.x
하네스별 dir 스키마)은 시작 시 1회 자동 마이그레이션(백업 후 사본→링크 교체;
`--no-migrate` 회피 — 이번 실행 중단).

## 캐시는 origin만 따라간다

로컬 리포의 미푸시 커밋은 캐시에 안 온다. "갱신됐는데도 옛 내용"이면 먼저:

```sh
cd <소스 리포> && git push origin main
kskills update <src>
```

## 개명·이관 소스 재정렬

소스에서 스킬을 개명/이동했다면(예: review:loop → revu:loop) — 0.3.0부터 update 가
설치명 재정규화를 자동 추적한다(구 dirname 원본 제거 → 신 dirname 이동):

```sh
kskills update <src>                 # 캐시 pull + 원본 재적립(개명 추적)
```

정상 종료 후에도 잔여가 남으면 구 절차(구명 remove → update → add)로 수습.

라우터·커맨드 투영은 자동 — 개명 주소가 기존 패밀리에 합류하면 라우터 멤버가
병합된다.

## kskills-app 의존 갱신

file: 카피는 낡은 엔진을 물 수 있다 — 갱신 후 앱 재기동 전에:

```sh
cd kskills-app && rm -rf node_modules/kskills && npm install
```
