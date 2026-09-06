# Vellum 검증 결과

## 첫 릴리스 검증

- 첫 실행 시 한 번만 Vellum 자체 localStorage(`vellum.` 접두사)와 IndexedDB(`vellum`)를 지우는 fresh-start 마이그레이션이 있습니다 — 공용 sync 네임스페이스(`shared/v1` 등)는 이 앱에 존재하지 않아 손대지 않습니다.
- `tests/`에서 버전 단일 기준, 카메라 후면 선호와 fallback, 사진 선택 복귀, Wake Lock 수명주기, Service Worker 캐시 격리 및 fetch 범위를 자동 검증합니다.
- GitHub Actions는 모든 push에서 회귀 검사와 JavaScript 문법 검사를 통과한 뒤 명시적 runtime allowlist만 Pages에 배포합니다.
- 실제 카메라 권한, iPhone/iPad Home Screen PWA, 장시간 Wake Lock은 아래 실기기 Pending 범위로 유지합니다.

- 앱 버전: 2026.09.05-initial
- 검증 대상: `Published/vellum/` 정적 PWA 배포 원본
- 브라우저: Codex 인앱 브라우저(로컬 HTTP·공개 HTTPS), 실제 앱 + `/tmp` 격리 가짜 카메라 QA 복사본
- 결과: 정적 검사, Service Worker 단위 검사, 핵심 사용자 흐름, 데스크톱·모바일 반응형 검사, GitHub Pages 실배포 검사 통과
- 검증 중 콘솔 오류·경고: 0건

## 결론

`jennie-verse/vellum` 공개 저장소와 GitHub Pages 배포가 완료됐습니다. 공개 주소 `https://jennie-verse.github.io/vellum/`의 HTTPS 200 응답, 주요 자산 MIME, 배포본과 로컬 원본의 SHA-256 일치, 데스크톱·모바일 첫 화면, 콘솔 오류·경고 0건을 확인했습니다. 실제 카메라 권한과 홈 화면 설치 등 아래 15개 항목은 iPhone·iPad 실기기에서 확인해야 최종 운영 검증이 끝납니다.

실제 카메라 권한을 임의로 승인하지 않고, 배포 코드에는 포함되지 않는 `/tmp` QA 복사본에서 canvas 기반 1280×720 MediaStream을 주입해 Start 이후 흐름을 검증했습니다. QA 보조 파일은 `Published/vellum/`, `Deliverable/vellum/`, `Backup/vellum/`, ZIP 어디에도 포함하지 않습니다.

---

## 1. 이번 재검토에서 발견하고 고친 문제

### 다른 GitHub Pages 프로젝트 캐시 삭제 가능성 — 수정 완료

GitHub Pages 프로젝트 사이트는 `https://<account>.github.io` origin을 공유합니다. 기존 Service Worker는 활성화 때 `caches.keys()`의 현재 캐시를 제외한 **모든 캐시**를 삭제해, 같은 계정의 다른 웹앱 캐시까지 지울 수 있었습니다.

`vellum-v` 접두사의 이전 캐시만 삭제하도록 제한했고, 조회도 현재 Vellum 캐시에서만 수행하도록 바꿨습니다. Node mock 단위 검사로 `vellum-v1`은 삭제되고 `other-app-v9`는 남는 것을 확인했습니다.

### 새 버전 감지 경로가 캐시 우선이었음 — 수정 완료

버전의 단일 기준인 `js/version.js`까지 캐시 우선이면 온라인에서도 이전 값이 먼저 읽힐 수 있습니다. 이 파일만 네트워크 우선·오프라인 캐시 대체로 바꾸고 나머지 앱 셸은 캐시 우선을 유지했습니다.

단위 검사에서 일반 앱 파일은 캐시 hit 시 네트워크 요청 0회, 버전 파일은 온라인 네트워크 요청 1회, 오프라인에서는 캐시 복귀, 문서 이동은 오프라인 `index.html` 복귀를 확인했습니다.

### Start 전 조작부와 무사진 버튼 상태 — 수정 완료

기존 초기 화면에는 Start 카드와 전체 조작부가 동시에 보였고, 사진이 없어도 Fit·Lock·Clear가 활성화되어 있었습니다. Start 성공 전에는 조작부를 숨기고, 사진이 없을 때 Fit·Lock·Clear를 비활성화했습니다. 사진을 고르면 세 버튼이 활성화되고 Clear 뒤 다시 비활성화되는 것을 확인했습니다.

### 손상 Blob 복원 검증 부족 — 수정 완료

IndexedDB 값에 크기가 있으면 실제 이미지 디코딩 없이 복원 상태로 진입했습니다. 유효하지 않은 `image/png` Blob과 저장된 잠금·정렬을 미리 넣은 격리 테스트에서 다음을 확인했습니다.

- `The saved photo could not be restored.` Toast 표시
- 사진 없음 상태 유지
- 잠금 해제
- 위치 0/0, 배율 1.0 초기화
- 콘솔 오류 0건

### 사진 교체 저장 실패 시 이전 사진 재등장 가능성 — 수정 완료

새 사진 저장이 용량 부족 등으로 실패하면 IndexedDB의 이전 사진이 다음 실행에 다시 나타날 수 있었습니다. 저장 실패 시 오래된 저장본을 삭제해, 화면의 새 사진은 현재 세션에서 계속 쓰되 다음 실행에 예전 정렬이 되살아나지 않게 했습니다.

### 사진 선택 취소 뒤 카메라 점검이 막힐 수 있음 — 수정 완료

기존 4초 안전 타이머는 `pickerOpen` 상태에서 카메라 점검 함수가 즉시 반환해 실제 복구를 수행하지 못했습니다. 파일 입력의 `cancel`, window `focus`, document `visibilitychange` 복귀를 `onPickerReturned` 한 경로로 모아 선택·취소 모두 `pickerOpen`을 해제한 뒤 카메라를 점검하도록 바꿨습니다.

### 접근성 — 수정 완료

- 실제 파일 입력을 `hidden` 처리해 접근성 트리와 Tab 순서의 중복 `Choose a photo` 버튼을 제거했습니다.
- Settings와 확인 대화상자에 Tab·Shift+Tab 포커스 순환을 추가했습니다.
- Settings에서 Close → Shift+Tab → Keep screen on, Keep screen on → Tab → Close 순환을 확인했습니다.
- 주요 버튼·보조문구·Clear 글자색을 같은 계열의 더 짙은 값으로 바꿔 일반 텍스트 대비 4.5:1 이상을 확보했습니다.

### 운영 화면의 계정 placeholder — 수정 완료

About에 `github.com/<account>/vellum`이 그대로 노출되던 구조를 없앴습니다. `*.github.io/<repo>/`에서 실행하면 현재 hostname과 첫 경로로 Source 문구를 자동 구성하고, 로컬에서는 배포 전 중립 문구를 표시합니다.

---

## 2. 정적·전달물 검사

| 확인 항목 | 결과 |
|---|---|
| `node --check` — `js/version.js`, `js/app.js`, `service-worker.js` | 통과 |
| `manifest.webmanifest` JSON 파싱 | 통과 |
| 아이콘 실제 크기 180×180 / 192×192 / 512×512 | 통과 |
| Lexend 400·600 WOFF2 파일 식별 | 통과 |
| 상대 자산 경로와 `/vellum/` 하위 경로 구성 | 통과 |
| 인라인 스크립트·스타일 없음 | 통과 |
| `innerHTML`, `eval`, 외부 API·분석 요청 없음 | 통과 |
| CSP와 실제 Blob 이미지·MediaStream 사용 방식 일치 | 통과 |
| Service Worker가 동일 출처 GET만 처리 | 통과 |
| 이전 Vellum 캐시만 삭제, 타 앱 캐시 보존 | 통과 |
| 버전 파일 온라인 우선·오프라인 대체 | 통과 |
| Published 원본·Deliverable·Backup·ZIP 내용 동기화 | 통과 |

이 앱은 빌드 도구가 없는 정적 앱이므로 별도 production build 산출물은 없습니다. `vellum/` 폴더 자체가 production artifact입니다.

---

## 3. 브라우저 검증

### 필수 상태 검사

| 검사 | 결과 | 근거 |
|---|---|---|
| Page identity | 통과 | URL `http://127.0.0.1:<격리 포트>/`, title `Vellum` |
| 빈 화면 아님 | 통과 | Start 카드와 설명이 DOM·화면에 표시 |
| Framework overlay 없음 | 통과 | 프레임워크 미사용, 오류 overlay 없음 |
| Console health | 통과 | 실제 초기 화면과 QA 핵심 흐름 모두 오류·경고 0건 |
| Screenshot evidence | 통과 | 초기, 카메라+사진, 접은 상태, iPhone 세로·가로, 최대 글자 크기 상태 확인 |
| Interaction proof | 통과 | 아래 핵심 흐름과 상태 변경 확인 |

### 핵심 흐름

검증 흐름: 앱 로드 → Start → 가짜 카메라 프레임 표시 → 사진 선택 → 드래그 정렬 → Opacity 0% → Lock → 접기·펼치기 → 새로고침 복원 → Settings → Clear → 새로고침 후 삭제 유지.

| 동작 | 확인 결과 |
|---|---|
| Start 전 조작부 | 숨김, `--bottom-ui: 0px` |
| Start 후 가짜 카메라 | video `readyState: 4`, 1280×720 grid 프레임 표시 |
| 사진 없음 | `Choose a photo` 표시, Fit·Lock·Clear 비활성 |
| PNG 선택 | Blob 사진 표시, Fit·Lock·Clear 활성 |
| 한 손가락/마우스 드래그 | 위치 `0/0` → `40px/25px` 변경 |
| Opacity 0% | `0%`, `Photo hidden` 배지 표시 |
| Lock | `aria-pressed=true`, Fit 비활성, 재드래그 후 위치 불변 |
| 조작부 접기 | 조작부 숨김, 44×44px 펼치기 버튼 유지 |
| 새로고침 복원 | 사진, 0% 투명도, 40px/25px 정렬, 잠금 상태 복원 |
| Settings 포커스 | Tab·Shift+Tab이 dialog 내부에서 순환 |
| Clear | 사진·정렬·잠금 제거, 관련 버튼 비활성 |
| Clear 후 새로고침 | 사진 없음·잠금 해제 유지 |

### 반응형과 터치 영역

| 화면 | 결과 |
|---|---|
| 393×852 iPhone 세로 | 가로·세로 overflow 0, 모든 조작 대상 높이 44px 이상 |
| 852×393 iPhone 가로 | 한 줄 조작부, overflow 0, 모든 조작 대상 44px 이상 |
| 667×375 iPhone SE 가로 + 17px | overflow 0, 최소 터치 대상 44px |
| 기본 데스크톱 viewport | Start·사진·Settings·접기 상태 정상 |

세로 조작부 높이는 147px, 가로는 55px으로 측정됐고, `ResizeObserver`가 이 값을 Toast·상태 화면 하단 여백에 반영합니다.

---

## 4. 공식 문서 교차 확인

- GitHub Free의 Public Repository에서 Pages를 사용할 수 있고, branch의 `/(root)`를 publishing source로 선택하는 현재 안내와 배포 문서가 일치합니다.
- WebKit은 iOS·iPadOS 18.4에서 Home Screen Web App의 Screen Wake Lock이 동작한다고 명시합니다.
- WebKit은 Home Screen Web App의 first-party domain이 ITP 7일 script-writable storage cap에서 제외된다고 명시하지만, 저장 공간 압박에 따른 eviction 가능성은 남습니다.
- iOS 26부터 Add to Home Screen 시 `Open as Web App`이 기본으로 켜진다는 안내와 사용자 문서가 일치합니다.

---

## 5. 실제 GitHub Pages 배포 검증

| 확인 항목 | 결과 |
|---|---|
| 공개 저장소 | `https://github.com/jennie-verse/vellum` Public 확인 |
| Pages publishing source | GitHub Actions (`.github/workflows/deploy.yml`) |
| 공개 주소 | `https://jennie-verse.github.io/vellum/` HTTPS 200 |
| HTTPS 강제 | 활성 |
| MIME | HTML, JavaScript, Web App Manifest, WOFF2, PNG 정상 |
| Service Worker | `service-worker.js` 200, 등록 경로 기준 scope `/vellum/` |
| 배포 무결성 | HTML·CSS·앱 JS·Service Worker·버전 파일 SHA-256이 로컬과 일치 |
| 공개 화면 | 기본 데스크톱·390×844 모바일 렌더링 정상 |
| 콘솔 | 공개 URL error/warn 0건 |

---

## 6. 실기기 Pending

아래 항목은 데스크톱 브라우저와 가짜 MediaStream으로 확정할 수 없습니다.

1. Safari에서 카메라 권한 허용 후 실제 영상 표시
2. Add to Home Screen 후 카메라 동작과 재실행 시 권한 요청 빈도
3. 후면 카메라 선택, 특히 iPad의 `facingMode` 처리
4. HEIC와 세로 촬영 사진의 방향
5. 투명 배경 PNG 선화의 iOS canvas 축소 결과
6. 48MP 사진 처리 시간과 메모리 압박
7. Wake Lock 10분 이상 유지
8. 백그라운드 복귀와 `Tap to resume camera`
9. 사진 선택창 취소·`Take Photo` 후 카메라 재개
10. Safari 두 손가락 확대와 앱 pinch의 충돌 여부
11. `black-translucent` 상태바와 상단 그라데이션의 실기기 가독성
12. Safe Area, Dynamic Island, 홈 인디케이터 실기기 여백
13. 실제 거치 환경의 반사·밝기·발열·배터리
14. 카메라 권한 거부 후 iOS 설정 경로 문구
15. 새 버전 배포 후 홈 화면 앱 완전 종료·재실행 시 캐시가 새 버전으로 전환되는지

GitHub 저장소 `jennie-verse/vellum`의 `main` 브랜치와 로컬 `Published/vellum/`을 authoritative source로 확정했습니다. `Deliverable/vellum/`은 성공한 정적 배포 스냅샷, `Backup/vellum/`은 Git 기록을 제외한 복구용 사본이며, 핵심 live asset과 로컬 artifact의 SHA-256 일치를 확인했습니다.

---

## 7. 핵심 검증 명령·API

```text
node --check Published/vellum/js/version.js
node --check Published/vellum/js/app.js
node --check Published/vellum/service-worker.js
node /tmp/vellum-sw-test.js
python3 -m http.server <격리 포트> --bind 127.0.0.1
gh api repos/jennie-verse/vellum/pages/builds/latest
curl -fsSI https://jennie-verse.github.io/vellum/
```

브라우저에서는 page identity, DOM snapshot, error/warn logs, viewport 393×852·852×393·667×375, file chooser, slider, drag, dialog focus, reload 복원을 같은 탭 흐름에서 확인했습니다.
