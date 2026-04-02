#!/bin/bash
# ============================================
# ZENSAI ERP 백업 복원 스크립트
# ============================================
#
# 사용법:
#   1) 최신 일별 백업 복원:
#      ./scripts/restore-backup.sh daily
#
#   2) 특정 월별 스냅샷 복원:
#      ./scripts/restore-backup.sh monthly 202604
#
#   3) 특정 일별 백업 복원:
#      ./scripts/restore-backup.sh daily 20260402
#
# 필수 환경변수:
#   SUPABASE_URL              - Supabase 프로젝트 URL
#   SUPABASE_SERVICE_ROLE_KEY - 서비스 역할 키
#   DATABASE_URL              - 복원 대상 PostgreSQL 연결 문자열
#
# ============================================

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 환경변수 확인
check_env() {
  local missing=0
  for var in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DATABASE_URL; do
    if [ -z "${!var:-}" ]; then
      echo -e "${RED}❌ 환경변수 ${var}이(가) 설정되지 않았습니다.${NC}"
      missing=1
    fi
  done
  if [ $missing -eq 1 ]; then
    echo ""
    echo "환경변수를 설정해주세요:"
    echo "  export SUPABASE_URL=https://xxx.supabase.co"
    echo "  export SUPABASE_SERVICE_ROLE_KEY=eyJ..."
    echo "  export DATABASE_URL=postgresql://user:pass@host:5432/dbname"
    exit 1
  fi
}

# 사용법 출력
usage() {
  echo "사용법: $0 <daily|monthly> [날짜]"
  echo ""
  echo "예시:"
  echo "  $0 daily           # 최신 일별 백업 목록 조회"
  echo "  $0 daily 20260402  # 특정 일자 백업 복원"
  echo "  $0 monthly         # 월별 스냅샷 목록 조회"
  echo "  $0 monthly 202604  # 특정 월 스냅샷 복원"
  exit 1
}

# 백업 목록 조회
list_backups() {
  local folder=$1
  echo -e "${YELLOW}📋 ${folder}/ 폴더 백업 목록:${NC}"
  echo ""

  curl -s \
    -X POST \
    "${SUPABASE_URL}/storage/v1/object/list/db-backups" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"prefix\":\"${folder}/\",\"limit\":100,\"sortBy\":{\"column\":\"name\",\"order\":\"desc\"}}" | \
    python3 -c "
import json, sys
files = json.load(sys.stdin)
if not files:
    print('  (백업 파일 없음)')
else:
    for f in files:
        name = f.get('name', '')
        size = f.get('metadata', {}).get('size', 0)
        size_mb = size / (1024*1024) if size else 0
        updated = f.get('updated_at', 'N/A')
        print(f'  {name}  ({size_mb:.1f} MB)  {updated}')
"
}

# 백업 다운로드
download_backup() {
  local folder=$1
  local filename=$2
  local output_file="restore_${filename}"

  echo -e "${YELLOW}📥 다운로드 중: ${folder}/${filename}${NC}"

  curl -s -o "${output_file}" \
    "${SUPABASE_URL}/storage/v1/object/db-backups/${folder}/${filename}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

  if [ ! -s "${output_file}" ]; then
    echo -e "${RED}❌ 다운로드 실패: 파일이 비어있습니다.${NC}"
    rm -f "${output_file}"
    exit 1
  fi

  echo -e "${GREEN}✅ 다운로드 완료: ${output_file} ($(ls -lh "${output_file}" | awk '{print $5}'))${NC}"
  echo "${output_file}"
}

# 복원 실행
restore_backup() {
  local dump_file=$1

  echo ""
  echo -e "${RED}⚠️  경고: 이 작업은 대상 데이터베이스를 덮어씁니다!${NC}"
  echo -e "대상: ${DATABASE_URL}"
  echo ""
  read -p "정말 복원하시겠습니까? (yes/no): " confirm

  if [ "$confirm" != "yes" ]; then
    echo "복원이 취소되었습니다."
    exit 0
  fi

  echo -e "${YELLOW}🔄 복원 중...${NC}"

  pg_restore \
    --dbname="${DATABASE_URL}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    "${dump_file}"

  echo -e "${GREEN}✅ 복원 완료!${NC}"
}

# --- 메인 ---

check_env

TYPE=${1:-}
DATE_ARG=${2:-}

if [ -z "$TYPE" ] || { [ "$TYPE" != "daily" ] && [ "$TYPE" != "monthly" ]; }; then
  usage
fi

# 날짜 인자 없으면 목록만 표시
if [ -z "$DATE_ARG" ]; then
  list_backups "$TYPE"
  echo ""
  echo "복원하려면: $0 $TYPE <날짜>"
  exit 0
fi

# 파일명 구성
FILENAME="zensai_erp_${DATE_ARG}.dump"

# 다운로드 후 복원
OUTPUT=$(download_backup "$TYPE" "$FILENAME")
restore_backup "$OUTPUT"

# 임시 파일 정리
rm -f "$OUTPUT"
echo -e "${GREEN}🧹 임시 파일 정리 완료${NC}"
