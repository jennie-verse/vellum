# GitHub Pages 배포 방법

GitHub를 자주 쓰지 않아도 따라 할 수 있도록 순서대로 적었습니다. 무료 계정으로 충분합니다.

현재 `jennie-verse/vellum` 공개 저장소는 `.github/workflows/deploy.yml`의 테스트와 runtime allowlist 배포를 통해 운영되며, 실제 사용 주소는 아래와 같습니다.

```
https://jennie-verse.github.io/vellum/
```

---

## 준비

- GitHub 계정
- `vellum` 폴더 (이 문서가 들어 있는 폴더의 상위 폴더)

배포가 끝나면 주소는 이렇게 됩니다.

```
https://jennie-verse.github.io/vellum/
```

**이 주소는 한 번 정하면 바꾸지 않습니다.** 홈 화면에 추가한 아이콘과 저장된 데이터가 주소에 묶여 있어서, 주소가 바뀌면 사진과 설정이 전부 사라집니다.

---

## 1. 저장소 만들기

1. GitHub에 로그인합니다.
2. 오른쪽 위 **+** → **New repository** 를 누릅니다.
3. 다음과 같이 채웁니다.
   - **Repository name**: `vellum` (소문자 그대로)
   - **Public** 을 선택합니다. 무료 계정은 Public에서만 Pages를 쓸 수 있습니다.
   - **Add a README file** 은 **체크하지 않습니다.**
4. **Create repository** 를 누릅니다.

---

## 2. 파일 올리기

1. 만들어진 저장소 화면에서 **uploading an existing file** 링크를 누릅니다.
   (이미 파일이 있다면 **Add file** → **Upload files**)
2. 컴퓨터에서 `vellum` 폴더를 **연 다음, 그 안의 항목 전부**를 드래그해 넣습니다.
   - 폴더째로 올리지 말고 **안의 내용**을 올립니다. `index.html` 이 저장소 최상단에 있어야 합니다.
   - `.nojekyll` 도 반드시 포함합니다. 이름이 점으로 시작해 파일 탐색기에서 숨겨져 있을 수 있습니다.
     - macOS Finder: `Command + Shift + .` 로 숨김 파일 표시
     - Windows 탐색기: **보기** → **숨긴 항목** 체크
3. 아래 **Commit changes** 를 누릅니다.

올린 뒤 저장소 첫 화면이 이렇게 보이면 맞습니다.

```
.nojekyll   css/   docs/   fonts/   icons/   js/   licenses/
index.html   manifest.webmanifest   service-worker.js
```

`vellum` 폴더가 하나 더 들어가 `vellum/vellum/index.html` 이 되었다면 주소가 어긋납니다. 그 경우 잘못 올라간 폴더를 지우고 다시 올리십시오.

---

## 3. Pages 켜기

### 현재 Published 저장소를 Git으로 배포할 때

1. `.github/workflows/deploy.yml`까지 포함해 `main`에 push합니다.
2. 저장소 **Settings** → **Pages**의 Source를 **GitHub Actions**로 둡니다.
3. `Test and deploy Vellum` workflow의 `test`와 `deploy`가 모두 성공했는지 확인합니다.

### Backup 정적 사본을 수동으로 올릴 때

1. 저장소 위쪽 **Settings** 를 누릅니다.
2. 왼쪽 메뉴에서 **Pages** 를 누릅니다.
3. **Source** 를 **Deploy from a branch** 로 둡니다.
4. **Branch** 를 `main`, 폴더를 `/ (root)` 로 고르고 **Save** 를 누릅니다.
5. 1~2분 기다립니다. 같은 화면 위쪽에 주소가 나타납니다.

---

## 4. 확인

Safari에서 `https://jennie-verse.github.io/vellum/` 을 엽니다.

- 시작 화면에 **Start** 버튼이 보이면 정상입니다.
- **Start** 를 누르고 **허용(Allow)** 하면 카메라 화면이 나옵니다.

카메라는 HTTPS에서만 열립니다. GitHub Pages는 HTTPS이므로 조건을 만족합니다. 파일을 더블클릭해 여는 방식(`file://`)이나 집 안 IP 주소(`http://192.168...`)로는 카메라가 열리지 않습니다.

주소가 열리는 것을 확인한 다음에야 앱을 홈 화면에 추가하십시오. 자세한 방법은 `USER-GUIDE-KO.md` 에 있습니다.

---

## 5. 수정한 뒤 다시 올리기

### 순서

1. **`js/version.js` 의 숫자를 올립니다.** 이것을 빠뜨리면 iOS가 예전 파일을 계속 씁니다.

   ```js
   self.VELLUM_VERSION = "4";
   ```

2. Published 저장소에서 `npm test`와 `npm run test:syntax`를 실행합니다.
3. 변경을 `main`에 push합니다.
4. `Test and deploy Vellum` workflow의 테스트와 배포가 성공한 뒤 공개 주소를 확인합니다.

### 왜 버전을 올려야 하는가

앱은 오프라인에서도 쓸 수 있도록 파일을 기기에 저장해 둡니다. 버전이 그대로면 기기는 저장해 둔 예전 파일을 계속 씁니다. 버전을 올리면 캐시 이름이 바뀌면서 예전 것이 정리되고 새 파일을 받습니다.

`js/version.js` 한 곳만 고치면 Service Worker 캐시 이름, 갱신 감지, 화면에 보이는 버전이 함께 바뀝니다.

### 새 버전이 언제 보이나

새 버전은 **앱을 완전히 종료했다 다시 열 때** 적용됩니다. 앱 전환기에서 Vellum을 위로 밀어 종료한 뒤 다시 여십시오.

그리는 도중 화면이 저절로 새로고침되면 맞춰 둔 정렬이 흐트러지기 때문에, 일부러 즉시 갱신하지 않도록 만들었습니다.

---

## 6. 잘 안 될 때

**404가 뜹니다**
`index.html` 이 저장소 최상단에 있는지 확인하십시오. Published 저장소는 Settings → Pages의 Source가 **GitHub Actions**인지, Backup 수동 복원은 Branch가 `main`, 폴더가 `/ (root)`인지 확인합니다. 방금 켰다면 1~2분 더 기다려 보십시오.

**화면이 흰색이고 아무것도 없습니다**
`css/`, `js/` 폴더가 통째로 올라갔는지 확인하십시오. 폴더 이름은 전부 소문자입니다. 대소문자가 다르면 GitHub Pages에서 파일을 찾지 못합니다.

**글꼴이 달라 보입니다**
`fonts/` 폴더가 빠졌을 때 나타납니다. 이 경우에도 앱은 Verdana로 정상 동작합니다.

**아이콘이 기본 모양입니다**
`icons/` 폴더와 `manifest.webmanifest` 가 올라갔는지 확인하고, 홈 화면 아이콘을 지웠다가 다시 추가하십시오.

**고쳤는데 예전 화면이 나옵니다**
`js/version.js` 의 숫자를 올렸는지 확인하고, 앱을 완전히 종료했다 다시 여십시오. 그래도 그대로면 홈 화면 아이콘을 지우고 Safari에서 주소를 연 뒤 다시 추가합니다.

---

## 7. 배포 뒤 할 일

- 배포 주소가 실제로 열리는 것을 확인합니다.
- `Published/vellum/`을 수정과 배포의 기준 원본으로 유지합니다.
- 성공한 정적 배포본은 `Deliverable/vellum/`, 복구용 사본은 `Backup/vellum/`에 동기화합니다.
- Settings → About의 Source 문구가 `github.com/<계정명>/vellum` 으로 자동 표시되는지 확인합니다. 배포 주소에서 계산하므로 소스 파일을 수동으로 바꿀 필요가 없습니다.
