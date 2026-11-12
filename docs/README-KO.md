# Vellum

카메라 화면 위에 사진을 반투명하게 겹쳐, 종이 위에서 따라 그릴 수 있게 하는 트레이싱 보조 웹앱입니다.

- 버전: `js/version.js`의 `VELLUM_VERSION` 참고
- 기준 문서: `WebApp_House_Style.md`
- 공개 앱: https://jennie-verse.github.io/vellum/
- 공개 저장소: https://github.com/jennie-verse/vellum
- 배포: GitHub Pages Actions (`.github/workflows/deploy.yml`), 빌드 도구 없음
- 화면 언어: 영문 / 문서 언어: 한국어

---

## 동작 방식

한 페이지짜리 정적 앱입니다. 후면 카메라 영상을 전체 화면 배경으로 깔고, 그 위에 사진을 얹은 뒤 투명도·위치·배율을 조절합니다. 기기를 거치대로 고정해 두고 쓰는 것을 전제로 하며, AR 추적이나 평면 인식은 하지 않습니다.

서버, 로그인, 외부 CDN, 분석 도구를 쓰지 않습니다. 카메라 영상은 화면에 표시만 하고 저장하거나 내보내지 않습니다.

---

## 파일 구조

```
vellum/
├── .nojekyll                  GitHub Pages가 Jekyll 처리를 건너뛰게 함
├── index.html                 화면 구조 전체 (인라인 스크립트·스타일 없음)
├── manifest.webmanifest       PWA 설정
├── service-worker.js          오프라인 캐시
├── css/
│   └── app.css                색·글꼴·레이아웃
├── js/
│   ├── version.js             버전 단일 정의 (여기만 고치면 됨)
│   └── app.js                 카메라·사진·제스처·저장
├── fonts/
│   ├── lexend-400.woff2       라틴 서브셋 (11KB)
│   └── lexend-600.woff2       라틴 서브셋 (11KB)
├── icons/
│   ├── icon-180.png           apple-touch-icon
│   ├── icon-192.png
│   └── icon-512.png
├── licenses/
│   └── lexend-ofl.txt         SIL Open Font License 원문
└── docs/
    ├── README-KO.md           이 문서
    ├── USER-GUIDE-KO.md       사용 방법
    ├── GITHUB-PAGES-KO.md     배포 방법
    └── TEST-REPORT.md         검증 결과
```

모든 경로는 상대 경로입니다. `https://<계정>.github.io/vellum/` 같은 하위 경로에서 그대로 동작합니다.

### 버전 파일을 나눈 이유

`APP_VERSION`을 한 곳에서만 정의하기 위해, 빌드 도구 없이 Service Worker가 `js/version.js`를 `importScripts`로 함께 읽습니다.

---

## 직접 바꾸기 쉬운 곳

### 버전

`js/version.js` 한 줄입니다.

```js
self.VELLUM_VERSION = "2026.11.12-foldable2";
```

이 값을 올리면 세 가지가 함께 따라갑니다.

- Service Worker 캐시 이름이 `vellum-v<version>` 으로 바뀌고 이전 캐시가 지워집니다
- Service Worker 등록 주소의 `?v=<version>` 값이 바뀌어 iOS가 갱신을 확실히 인식합니다
- Settings → About의 표시 버전이 바뀝니다

**Service Worker나 앱 파일을 고쳤다면 이 값을 반드시 함께 올립니다.**

### 색상

`css/app.css` 맨 위 `:root` 블록입니다. 기본값은 기준 문서의 연분홍입니다.

```css
--rose: #EFB3C1;        /* 대표색: 주요 버튼, 슬라이더 손잡이, 선택 상태 */
--rose-deep: #713145;   /* 대표색 위 글자: 작은 글자 대비 보강 */
--rose-tint: #FBE4EA;   /* 대표색 연한 배경 */
--bg: #FDF7F8;          /* 기본 배경 */
--text: #4A3A40;        /* 본문 글자 */
--line: #EDE3E6;        /* 경계선 */
--danger: #9E403D;      /* Clear 버튼 글자: 작은 글자 대비 보강 */
```

`--rose` 와 `--rose-deep` 두 개만 바꿔도 전체 인상이 바뀝니다. 다만 대표색을 바꾸면 `manifest.webmanifest` 의 `theme_color` 와 `index.html` 의 `<meta name="theme-color">` 도 같이 맞춰 주십시오.

### 글꼴

같은 파일 위쪽 `@font-face` 두 개와 `body` 의 `font-family` 입니다.

```css
font-family: "Lexend", Verdana, "Trebuchet MS", "Segoe UI", Arial, sans-serif;
```

Lexend 파일을 지우면 자동으로 Verdana로 내려갑니다. 화면은 깨지지 않습니다. 한글은 어느 경우든 iOS 시스템 글꼴로 표시됩니다.

### 앱 이름

세 곳입니다.

- `manifest.webmanifest` 의 `name`, `short_name`
- `index.html` 의 `<title>` 과 `<meta name="apple-mobile-web-app-title">`
- `index.html` 시작 화면의 `<h1 class="screen-title">`

폴더 이름과 저장소 이름은 계획서에서 확정한 대로 바꾸지 않습니다.

### 저장소 주소 표시

GitHub Pages에서 실행하면 현재 주소의 계정명과 첫 번째 경로를 읽어 Settings → About에 `github.com/<account>/vellum` 형식으로 자동 표시합니다. 소스 파일을 수동으로 바꿀 필요가 없습니다. 로컬에서는 아직 배포 전이라는 중립 문구가 표시됩니다.

---

## 기술 메모

| 항목 | 내용 |
|---|---|
| 카메라 | `getUserMedia` 로 후면 카메라 요청. `facingMode: exact` 가 실패하면 `ideal` 로 1회 재시도. 해상도는 1280 수준으로 제한해 발열·배터리를 줄임 |
| 사진 | `<input type="file" accept="image/*">`. EXIF 방향은 브라우저가 `<img>` 에 자동 적용. 긴 변 3000px 초과 시 canvas로 축소하며, 투명도를 가질 수 있는 형식은 PNG로 유지 |
| 확대·이동 | Pointer Events. Fit 상태를 배율 1.0으로 두고 0.2~8배. 위치는 화면 크기 대비 비율로 저장해 회전해도 상대 위치가 유지됨 |
| 저장 | 사진 Blob은 IndexedDB(`vellum` / `photo` / `current`), 나머지는 localStorage(`vellum.` 접두사) |
| 화면 꺼짐 방지 | Screen Wake Lock. 화면 복귀 시 재요청. 미지원 기기에서는 Settings에 비활성 표시 |
| 보안 | CSP 메타 태그로 외부 요청 차단. 인라인 스크립트·스타일 없음. 사용자 문자열은 `textContent` 로만 삽입 |
| 오프라인 | Service Worker가 앱 파일만 Vellum 전용 캐시에 저장. 동일 출처 GET만 처리. 버전 파일은 네트워크 우선·오프라인 캐시 대체, 나머지는 캐시 우선. `skipWaiting` 미사용 |

### 왜 `skipWaiting` 을 쓰지 않는가

그리는 도중 새 버전이 감지되어 화면이 새로고침되면 맞춰 둔 정렬이 흐트러집니다. 새 버전은 앱을 완전히 종료했다 다시 열 때 적용됩니다.

### 왜 카메라 영역에서만 확대 제스처를 가로채는가

앱이 사진 확대 기능을 직접 제공하므로 브라우저의 페이지 확대와 충돌합니다. `touch-action: none` 과 `touchmove` 기본 동작 차단을 카메라·사진 영역에만 적용했고, 조작부와 Settings에서는 iOS 기본 확대가 그대로 동작합니다.

---

## 라이선스

앱 코드는 개인 용도입니다. 포함된 Lexend 글꼴은 SIL Open Font License 1.1이며 원문은 `licenses/lexend-ofl.txt` 에 있습니다.
