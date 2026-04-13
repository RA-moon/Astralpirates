#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)

usage() {
  cat <<'EOF'
Usage: scripts/ci/run-continuous-verification.sh [options]

Runs continuous post-deploy verification gates against a live origin, writes
normalized artifacts, and optionally posts a Slack summary.

Options:
  --origin <url>             Frontend origin to verify (default: https://astralpirates.com)
  --api-base <url>           API/CMS base for API probes (default: <origin>)
  --output-dir <path>        Output directory (default: deploy-logs/continuous-verification-<timestamp>)
  --slack-webhook <url>      Slack webhook for summary notifications (optional)
  --skip-crawler-shield      Skip crawler-shield probe
  --skip-legacy-media-parity Skip legacy /media parity probe
  -h, --help                 Show help

Environment:
  CONTINUOUS_VERIFICATION_ROLLBACK_SIGNAL
                             Optional rollback signal label for summary context (default: not-applicable)
EOF
}

ORIGIN="https://astralpirates.com"
API_BASE=""
OUTPUT_DIR=""
SLACK_WEBHOOK=""
SKIP_CRAWLER_SHIELD=0
SKIP_LEGACY_MEDIA_PARITY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin)
      ORIGIN=$2
      shift 2
      ;;
    --api-base)
      API_BASE=$2
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR=$2
      shift 2
      ;;
    --slack-webhook)
      SLACK_WEBHOOK=$2
      shift 2
      ;;
    --skip-crawler-shield)
      SKIP_CRAWLER_SHIELD=1
      shift
      ;;
    --skip-legacy-media-parity)
      SKIP_LEGACY_MEDIA_PARITY=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$API_BASE" ]]; then
  API_BASE="$ORIGIN"
fi

timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$REPO_ROOT/deploy-logs/continuous-verification-$timestamp"
fi
mkdir -p "$OUTPUT_DIR"

json_escape() {
  local raw=${1:-}
  raw=${raw//\\/\\\\}
  raw=${raw//\"/\\\"}
  raw=${raw//$'\n'/ }
  raw=${raw//$'\r'/ }
  printf '%s' "$raw"
}

RESULTS_TSV="$OUTPUT_DIR/check-results.tsv"
: >"$RESULTS_TSV"

run_gate() {
  local id=$1
  local description=$2
  shift 2

  local log_file="$OUTPUT_DIR/${id}.log"
  local status_file="$OUTPUT_DIR/${id}.status"

  echo "→ Gate: $id ($description)"
  set +e
  (
    cd "$REPO_ROOT"
    "$@"
  ) >"$log_file" 2>&1
  local exit_code=$?
  set -e

  printf '%s\n' "$exit_code" >"$status_file"

  local status_label="pass"
  if [[ "$exit_code" -ne 0 ]]; then
    status_label="fail"
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$description" "$status_label" "$exit_code" "$log_file" >>"$RESULTS_TSV"

  if [[ "$status_label" == "pass" ]]; then
    echo "✓ $id passed"
  else
    echo "✗ $id failed (exit=$exit_code)"
  fi
}

run_gate "uptime" "Homepage, bridge route, and CMS health checks" \
  node scripts/check-astral-uptime.mjs --base "$ORIGIN" --cms-base "$API_BASE" --route "/bridge"

run_gate "roadmap-api" "Roadmap API returns 2xx" \
  bash -lc "set -euo pipefail; curl -fsS '${API_BASE%/}/api/roadmap' >/dev/null"

run_gate "flight-plans-api" "Flight plans API returns 2xx" \
  bash -lc "set -euo pipefail; curl -fsS '${API_BASE%/}/api/flight-plans?limit=1' >/dev/null"

if [[ "$SKIP_CRAWLER_SHIELD" != "1" ]]; then
  run_gate "crawler-shield" "Crawler shield policy enforcement" \
    node scripts/check-crawler-shield.mjs --origin "$ORIGIN" --blocked-path "/bridge/" --api-path "/api/pages/health"
else
  echo "→ Gate: crawler-shield (skipped)"
fi

if [[ "$SKIP_LEGACY_MEDIA_PARITY" != "1" ]]; then
  run_gate "legacy-media-route-parity" "Legacy /media route parity against canonical /api routes" \
    node scripts/check-legacy-media-route-parity.mjs --base "$ORIGIN"
else
  echo "→ Gate: legacy-media-route-parity (skipped)"
fi

total_count=0
passed_count=0
failed_count=0
checks_json=""

while IFS=$'\t' read -r id description status_label exit_code log_file; do
  [[ -z "$id" ]] && continue
  total_count=$((total_count + 1))
  if [[ "$status_label" == "pass" ]]; then
    passed_count=$((passed_count + 1))
  else
    failed_count=$((failed_count + 1))
  fi

  if [[ -n "$checks_json" ]]; then
    checks_json+=","
  fi
  checks_json+=$'\n    '
  checks_json+="{\"id\":\"$(json_escape "$id")\",\"description\":\"$(json_escape "$description")\",\"status\":\"$(json_escape "$status_label")\",\"exitCode\":${exit_code},\"logFile\":\"$(json_escape "$log_file")\"}"
done <"$RESULTS_TSV"

if [[ -n "$checks_json" ]]; then
  checks_json+=$'\n  '
fi

run_url="${GITHUB_SERVER_URL:-}"
if [[ -n "$run_url" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
  run_url="${run_url%/}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
else
  run_url=""
fi

rollback_signal="${CONTINUOUS_VERIFICATION_ROLLBACK_SIGNAL:-not-applicable}"
overall_status="pass"
if [[ "$failed_count" -gt 0 ]]; then
  overall_status="fail"
fi

SUMMARY_JSON="$OUTPUT_DIR/continuous-verification-summary.json"
cat >"$SUMMARY_JSON" <<EOF
{
  "status": "$(json_escape "$overall_status")",
  "origin": "$(json_escape "$ORIGIN")",
  "apiBase": "$(json_escape "$API_BASE")",
  "ref": "$(json_escape "${GITHUB_REF_NAME:-local}")",
  "sha": "$(json_escape "${GITHUB_SHA:-local}")",
  "runUrl": "$(json_escape "$run_url")",
  "rollbackSignal": "$(json_escape "$rollback_signal")",
  "counts": {
    "total": $total_count,
    "passed": $passed_count,
    "failed": $failed_count
  },
  "checks": [${checks_json}]
}
EOF

SUMMARY_MD="$OUTPUT_DIR/continuous-verification-summary.md"
{
  echo "# Continuous Verification Summary"
  echo
  echo "- status: \`$overall_status\`"
  echo "- origin: \`$ORIGIN\`"
  echo "- apiBase: \`$API_BASE\`"
  echo "- ref: \`${GITHUB_REF_NAME:-local}\`"
  echo "- sha: \`${GITHUB_SHA:-local}\`"
  if [[ -n "$run_url" ]]; then
    echo "- runUrl: $run_url"
  else
    echo "- runUrl: n/a"
  fi
  echo "- rollbackSignal: \`$rollback_signal\`"
  echo "- checks: \`$passed_count/$total_count\` passed"
  echo
  echo "## Gate Results"
  while IFS=$'\t' read -r id description status_label exit_code log_file; do
    [[ -z "$id" ]] && continue
    echo "- \`$id\`: \`$status_label\` (exit=$exit_code) — $description"
    echo "  log: \`$log_file\`"
  done <"$RESULTS_TSV"
} >"$SUMMARY_MD"

if [[ -n "$SLACK_WEBHOOK" ]]; then
  icon=":large_green_circle:"
  if [[ "$overall_status" != "pass" ]]; then
    icon=":rotating_light:"
  fi

  slack_text="${icon} Continuous verification ${overall_status} | ref=${GITHUB_REF_NAME:-local} | sha=${GITHUB_SHA:-local} | checks=${passed_count}/${total_count} | rollbackSignal=${rollback_signal}"
  if [[ -n "$run_url" ]]; then
    slack_text="${slack_text} | run=${run_url}"
  fi

  curl -fsS -X POST "$SLACK_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$(json_escape "$slack_text")\"}" >/dev/null \
    || echo "⚠ Slack summary notification failed" >&2
fi

echo "→ Continuous verification summary: $SUMMARY_JSON"
echo "→ Continuous verification markdown: $SUMMARY_MD"

if [[ "$failed_count" -gt 0 ]]; then
  exit 1
fi
