# digital laundry

공개 웹에 남은 과거 별칭의 흔적을 찾고, 지우개 서비스로 갈 수 있는 검토용 초안까지 정리할 때 사용합니다. 게시물을 대신 삭제하거나 신고를 제출하지 않습니다.

## tools

- get_service_status
- preview_search_queries
- run_digital_laundry_audit
- analyze_footprint_candidate
- check_eraser_eligibility
- get_erasure_guidance
- create_evidence_checklist
- draft_erasure_request
- draft_platform_report
- create_cleanup_report

## steps

1. get_service_status를 먼저 호출하고, 데모 모드이면 시연용 가상 데이터라고 말합니다. 라이브 모드가 아니면 실제 검색 성공으로 설명하지 않습니다.
2. 별칭이 검색 제공자에게 전송된다고 알리고 동의를 받습니다. 동의가 없으면 confirmExternalSearch를 true로 두지 않습니다.
3. preview_search_queries로 검색어를 보여 줍니다. 전화번호, 주소, 주민등록번호, 비밀번호는 검색어로 만들지 않습니다.
4. 동의가 있으면 run_digital_laundry_audit를 호출합니다.
5. 일치 신뢰도와 위험 점수를 따로 설명합니다. 퍼센트 확률을 만들지 않습니다.
6. 작성자, 작성 당시 나이, 식별 정보 포함, 직접 삭제 가능 여부를 사용자가 확인하게 합니다. 모르는 값은 unknown입니다.
7. check_eraser_eligibility, create_evidence_checklist, draft_erasure_request 순서로 검토 초안을 만듭니다. 만 14세 미만이면 성인용 온라인 신청을 기본 경로로 제시하지 않습니다.
8. create_cleanup_report로 보고서를 보여 주고 공식 링크를 함께 안내합니다.

## confirmation

- 외부 검색 전 동의
- 작성자와 작성 당시 나이, 식별 정보
- 저장, 내보내기, 삭제는 각 확인 값이 true일 때만

## forbidden

- 동의 없이 검색하거나 사진을 전송하지 않습니다.
- 신청, 삭제, 신고를 자동으로 제출하지 않습니다.
- 확인하지 않은 작성자, 날짜, 본문, 증거를 만들어 넣지 않습니다.
- user_submitted를 서버가 제출을 확인한 상태처럼 말하지 않습니다.

## demo

DL_DEMO_MODE=true이거나 demoMode가 true이면 결과는 시연용 가상 데이터입니다. isDemo가 true인지 확인하고, 라이브 검색으로 말하지 않습니다.

## done

사용자가 검토할 수 있는 초안과 공식 안내 링크를 갖고 있으면 완료입니다. 제출 여부는 사용자가 직접 공식 경로에서 마친 뒤에만 기록합니다.
