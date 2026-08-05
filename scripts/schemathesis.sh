#!/usr/bin/env bash
# Property-based conformance fuzzing: Schemathesis generates test cases
# directly from openapi/openapi.yaml and fails if the running server ever
# responds outside the contract. Zero per-endpoint maintenance — new spec
# paths are fuzzed automatically.
#
# Requires the test stack:
#   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d api_test
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${TEST_API_URL:-http://127.0.0.1:3101}"

if ! curl -fsS "$BASE_URL/up" >/dev/null 2>&1; then
  echo "Test API not reachable at $BASE_URL." >&2
  echo "Start it with: docker compose -f docker-compose.yml -f docker-compose.test.yml up -d api_test" >&2
  exit 1
fi

curl -fsS -X POST "$BASE_URL/api/test/reset" -o /dev/null

USER_ID=$(curl -fsS -X POST "$BASE_URL/api/test/factory" \
  -H "Content-Type: application/json" \
  -d '{"users":[{"email":"schemathesis@example.com"}]}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["users"][0]["id"])')

JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
curl -fsS -c "$JAR" -X POST "$BASE_URL/api/test/login_as" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\": ${USER_ID}}" -o /dev/null

COOKIE=$(awk '$6 == "_online_library_session" { print $7 }' "$JAR")
CSRF=$(curl -fsS -b "$JAR" "$BASE_URL/api/csrf" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrf_token"])')

# Core conformance checks (server errors, status/content-type/schema
# conformance) all run. Four opinion checks are excluded deliberately:
# - negative_data_rejection: Rails coerces malformed query params
#   (page=abc -> page 1) by design instead of rejecting them.
# - positive_data_acceptance: schema-valid requests are still rejected by
#   business rules (checkout caps, missing records) with documented 4xxs.
# - ignored_auth: the session cookie rides in a raw header for the whole
#   run, so Schemathesis cannot actually de-authenticate requests.
# - unsupported_method: Rails routes answer 404, not 405, for undefined
#   verbs on existing paths; that is framework convention.
if command -v uvx >/dev/null 2>&1; then
  SCHEMATHESIS=(uvx schemathesis)
elif command -v schemathesis >/dev/null 2>&1; then
  SCHEMATHESIS=(schemathesis)
else
  echo "Neither uvx nor schemathesis found. Install uv, or: pip install schemathesis" >&2
  exit 1
fi

"${SCHEMATHESIS[@]}" run openapi/openapi.yaml \
  --url "$BASE_URL" \
  --header "Cookie: _online_library_session=${COOKIE}" \
  --header "X-CSRF-Token: ${CSRF}" \
  --checks all \
  --exclude-checks negative_data_rejection,positive_data_acceptance,ignored_auth,unsupported_method \
  --max-examples "${SCHEMATHESIS_EXAMPLES:-50}" \
  "$@"

curl -fsS -X POST "$BASE_URL/api/test/reset" -o /dev/null
