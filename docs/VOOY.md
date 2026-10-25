# Vooy 연결

이 서버의 기본 실행은 stdio입니다. Vooy처럼 URL로 MCP를 붙일 때만 HTTP를 켭니다.

## 실행

`.env`에 다음을 넣습니다. 토큰은 16자 이상이어야 하고, 이 값보다 짧으면 프로세스가 포트를 열지 않습니다.

```bash
DL_HTTP_ENABLED=true
DL_HTTP_PORT=8787
DL_HTTP_AUTH_TOKEN=긴-임의의-토큰
DL_DEMO_MODE=true
```

```bash
npm run build
npm run start:http
```

수신 주소는 `127.0.0.1`입니다. 인증 없는 공개 서버로 열리지 않습니다. 모든 `/mcp` 요청은 `Authorization: Bearer` 헤더가 있어야 합니다. 토큰을 URL 쿼리에 넣지 않습니다.

## 외부에서 도달

Vooy가 이 컴퓨터의 localhost에 직접 닿지 않으면, 사용자가 HTTPS 터널이나 호스팅의 공개 주소로 `/mcp`를 노출합니다. 서버 코드에는 공개 주소를 넣지 않습니다.

Vooy의 커스텀 MCP 화면에는 터널이 만든 HTTPS URL과 `Authorization: Bearer <토큰>` 헤더를 넣습니다. 헤더 칸이 없으면 토큰을 쿼리로 옮기지 않습니다. 그 경우에는 헤더를 주입하는 비공개 터널을 사용하고, 서버는 Bearer 검사를 유지합니다.

감사 결과는 프로세스 메모리에 60분만 있습니다. 시연은 인스턴스 하나로 하고, 프로세스를 다시 시작하면 auditId가 사라집니다.

## 레시피

`recipes/digital-laundry.md` 원문을 Vooy Studio의 레시피에 붙여 넣습니다. 데모 별칭으로 상태 확인, 동의, 점검, 자격, 초안, 보고서까지 진행합니다. 초안이 생겼다고 제출된 것은 아닙니다.

## 제출 전

- 데모 결과가 시연용 가상 데이터로 보이는지
- 동의 없이 검색하지 않는지
- 자동 제출이라고 말하지 않는지
- 토큰과 API 키가 레시피 원문이나 URL에 없는지
