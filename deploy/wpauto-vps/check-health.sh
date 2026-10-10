#!/usr/bin/env bash
set -Eeuo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
origin="https://auth.wpauto.cc"

fail() {
  printf 'WEPUU_MONITOR_FAIL check=%s\n' "$1" >&2
  exit 1
}

for command in curl df docker openssl awk jq; do
  command -v "$command" >/dev/null 2>&1 || fail "dependency_${command}"
done

for container in wpauto-postgres-1 wpauto-control-1 wpauto-authorization-1; do
  state="$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}|{{.RestartCount}}' "$container" 2>/dev/null)" \
    || fail "container_missing"
  IFS='|' read -r status health restarts <<<"$state"
  [[ "$status" == "running" && "$health" == "healthy" ]] || fail "container_health"
  if (( restarts > 0 )); then
    printf 'WEPUU_MONITOR_WARN check=container_restart count=%s\n' "$restarts"
  fi
done

disk_percent="$(df -P / | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"
[[ "$disk_percent" =~ ^[0-9]+$ ]] || fail "disk_parse"
if (( disk_percent >= 90 )); then
  fail "disk_critical"
elif (( disk_percent >= 80 )); then
  printf 'WEPUU_MONITOR_WARN check=disk percent=%s\n' "$disk_percent"
fi

for path in \
  /health/ready \
  /terms \
  /privacy \
  /support \
  /status; do
  curl --fail --silent --show-error --output /dev/null --max-time 10 "${origin}${path}" \
    || fail "public_endpoint"
done

oidc="$(curl --fail --silent --show-error --max-time 10 "${origin}/.well-known/openid-configuration")" \
  || fail "oidc_metadata"
oauth="$(curl --fail --silent --show-error --max-time 10 "${origin}/.well-known/oauth-authorization-server")" \
  || fail "oauth_metadata"
jwks="$(curl --fail --silent --show-error --max-time 10 "${origin}/jwks")" \
  || fail "jwks"
jq -e --arg origin "$origin" \
  '.issuer == $origin and .jwks_uri == ($origin + "/jwks") and
   (.authorization_endpoint | startswith($origin + "/")) and
   (.token_endpoint | startswith($origin + "/"))' \
  <<<"$oidc" >/dev/null || fail "oidc_contract"
jq -e --arg origin "$origin" \
  '.issuer == $origin and .jwks_uri == ($origin + "/jwks") and
   (.authorization_endpoint | startswith($origin + "/")) and
   (.token_endpoint | startswith($origin + "/"))' \
  <<<"$oauth" >/dev/null || fail "oauth_contract"
jq -e \
  '(.keys | type == "array" and length > 0) and
   all(.keys[];
     .kty == "RSA" and .alg == "RS256" and .use == "sig" and
     (.kid | type == "string" and length > 0) and
     (.n | type == "string" and length > 0) and
     (.e | type == "string" and length > 0) and
     (has("d") or has("p") or has("q") or has("dp") or has("dq") or has("qi") or has("oth") | not))' \
  <<<"$jwks" >/dev/null || fail "jwks_contract"

metrics_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 10 "${origin}/internal/metrics")" \
  || fail "metrics_probe"
[[ "$metrics_status" == "404" ]] || fail "metrics_exposure"

openssl s_client -connect 127.0.0.1:443 -servername auth.wpauto.cc </dev/null 2>/dev/null \
  | openssl x509 -checkend 2592000 -noout >/dev/null 2>&1 \
  || fail "certificate_expiry"

printf 'WEPUU_MONITOR_OK disk_percent=%s\n' "$disk_percent"
