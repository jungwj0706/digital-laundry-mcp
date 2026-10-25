# 데모 순서

1. `DL_DEMO_MODE=true`로 서버를 실행합니다.
2. `get_service_status`에서 데모 모드라고 말합니다.
3. 별칭 예시는 `하늘`처럼 짧은 과거 닉네임만 사용합니다. 전화번호와 주민등록번호는 넣지 않습니다.
4. 외부 전송 동의를 받은 뒤에만 `confirmExternalSearch: true`로 `run_digital_laundry_audit`를 호출합니다.
5. 결과 제목에 `시연용 가상 데이터`가 있고 `isDemo`가 true인지 확인합니다. 이것을 실제 검색 성공으로 설명하지 않습니다.
6. 사용자가 작성자, 작성 당시 나이, 식별 정보, 직접 삭제 가능 여부를 고르면 `check_eraser_eligibility`와 `create_evidence_checklist`를 호출합니다.
7. `draft_erasure_request` 또는 `draft_platform_report`는 검토용입니다. 제출하지 않습니다.
8. `create_cleanup_report`로 보고서를 보여 줍니다. 파일로 남기려면 저장과 내보내기 확인이 따로 필요합니다.
