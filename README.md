# Digital Laundry MCP

공개 웹에 남은 과거 흔적을 찾고, 한국 개인정보 포털 지우개 서비스로 갈 수 있는 경로와 검토용 초안을 만드는 MCP 서버입니다. 게시물을 대신 삭제하거나 신고를 제출하지 않습니다.

정책 기준일: 2026-10-25

- 지우개 서비스 소개: https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=260
- 신청 유형: https://www.privacy.go.kr/front/rghtFrgtFrt/selectRequestType.do
- 만 14세 이상 온라인 안내: https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=273
- 14세 미만 안내: https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=275

## 설치

Node.js 22.13 이상이 필요합니다.

```bash
npm install
cp .env.example .env
npm run build
```

개발 중에는 `npm run dev`, 빌드 결과는 `npm start`로 실행합니다. 기본 전송은 stdio입니다.

## 환경 변수

`.env.example`의 이름을 바꾸지 말고 값만 `.env`에 넣습니다. API 키는 Cursor 설정 JSON에 넣지 않습니다.

암호화 키:

```bash
npm run generate-encryption-key
```

출력된 한 줄을 `DL_DATA_ENCRYPTION_KEY`에 붙여 넣습니다. 키는 데이터베이스 옆에 저장하지 않습니다.

## 라이브 검색 설정

`BRAVE_SEARCH_API_KEY`가 있고 `DL_DEMO_MODE=false`일 때만 Brave Search를 호출합니다. 키가 없으면 검색은 실패로 반환되고, 데모 모드가 성공한 라이브 검색처럼 보이면 안 됩니다.

문서: https://api-dashboard.search.brave.com/app/documentation/web-search/get-started

호출 전에 `confirmExternalSearch`가 true여야 합니다. 별칭이 검색 제공자에게 전송됩니다.

## 이미지 역검색 설정

`GOOGLE_CLOUD_VISION_API_KEY`가 있을 때만 웹 탐지를 호출합니다. 키가 없어도 텍스트 검색과 다른 도구는 동작합니다.

문서: https://docs.cloud.google.com/vision/docs/detecting-web

`confirmExternalImageProcessing`이 true일 때만 사진을 전송합니다. JPEG, PNG, WebP와 5MB 이하만 허용합니다. 원본은 저장하지 않습니다.

## 로컬 저장 설정

기본값은 저장 안 함입니다. `DL_ENABLE_PERSISTENCE=true`와 올바른 `DL_DATA_ENCRYPTION_KEY`가 모두 있어야 SQLite 파일을 엽니다. 보존 기간 기본값은 30일이고, 사용자는 그 안에서 더 짧게만 줄일 수 있습니다. 별칭, 검색어, 이미지 바이트는 저장하지 않습니다.

## 보고서 내보내기

`DL_EXPORT_DIR` 안의 파일 이름만 허용합니다. `confirmedExport`가 true일 때만 파일을 쓰며, 내보낸 파일은 평문입니다. 도구 응답은 파일 이름만 반환합니다.

## Cursor

`npm run build` 뒤에 절대 경로를 확인합니다.

```bash
npm run print-cursor-config
```

예시:

```json
{
  "mcpServers": {
    "digital-laundry": {
      "command": "node",
      "args": ["/절대/경로/digital-laundry-mcp/dist/index.js"]
    }
  }
}
```

키는 `.env`에만 둡니다.

## 데모

`DL_DEMO_MODE=true`이면 네트워크 검색 없이 `example.test`의 시연용 가상 데이터만 반환합니다. 제목에 `시연용 가상 데이터`가 있고 `isDemo`는 true입니다. 순서 예시는 `docs/DEMO_SCRIPT.md`에 있습니다.

## 문제 해결

- 라이브 검색이 `provider_not_configured`이면 Brave 키 또는 데모 모드를 확인합니다.
- 이미지 도구만 실패하면 Vision 키를 확인합니다. 다른 도구는 그대로 사용할 수 있습니다.
- 저장이 `storage_disabled`이면 영구 저장 스위치와 32바이트 키를 확인합니다.
- 점검 식별자를 찾지 못하면 프로세스가 다시 시작됐거나 60분이 지난 메모리 캐시입니다.
- 검사기: `npx @modelcontextprotocol/inspector node dist/index.js`

## 개인정보와 한계

검색어와 사진은 사용자가 동의한 외부 제공자에게 전송될 수 있습니다. 로그에는 도구 이름, 소요 시간, 결과 수, 오류 코드만 남깁니다.

이 서버는 비공개 페이지, 로그인 이후 화면, 얼굴 데이터베이스, 백그라운드 감시, 자동 삭제, 자동 신고를 하지 않습니다. 위험 점수는 검토 순서이고 법적 판단이 아닙니다. 만 14세 미만은 법정대리인 동의와 14세 미만 공식 안내를 사용합니다.

자세한 구조는 `docs/ARCHITECTURE.md`, 데이터 처리는 `docs/PRIVACY.md`를 보세요.
