#!/usr/bin/env bash
set -Eeuo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
umask 077

root="/opt/wpauto"
runtime="${root}/config/runtime.env"
rollback_dir="${root}/rollback"
lock="/var/lock/wpauto-deploy.lock"

fail() {
  printf 'WEPUU_DEPLOY_FAIL check=%s\n' "$1" >&2
  exit 1
}

[[ $# -ge 2 ]] || fail "arguments"
action="$1"
service="$2"

case "$service" in
  control)
    variable="WEPUU_CONTROL_IMAGE"
    repository="ghcr.io/wepuu/wp-auto-control"
    local_health="http://127.0.0.1:3000/health/ready"
    ;;
  authorization)
    variable="WEPUU_AUTHORIZATION_IMAGE"
    repository="ghcr.io/wepuu/wp-auto-authorization"
    local_health="http://127.0.0.1:3001/health/ready"
    ;;
  *) fail "service" ;;
esac

cd "$root"
[[ -f "$runtime" && ! -L "$runtime" ]] || fail "runtime_file"
[[ "$(stat -c '%a:%u:%g' "$runtime")" == "600:0:0" ]] || fail "runtime_permissions"
install -d -m 0700 -o root -g root "$rollback_dir"
exec 9>"$lock"
flock -n 9 || fail "concurrent_deploy"

read_value() {
  local count
  count="$(grep -c "^${variable}=" "$runtime")"
  [[ "$count" == "1" ]] || fail "runtime_image_entry"
  grep "^${variable}=" "$runtime" | cut -d= -f2-
}

replace_value() {
  local value="$1" temporary
  temporary="$(mktemp "${root}/config/runtime.env.XXXXXX")"
  trap 'rm -f "${temporary:-}"' RETURN
  awk -v key="$variable" -v value="$value" \
    'index($0, key "=") == 1 { print key "=" value; next } { print }' \
    "$runtime" >"$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  mv -f "$temporary" "$runtime"
  trap - RETURN
}

rollback_file="${rollback_dir}/${service}.image"
current="$(read_value)"

case "$action" in
  deploy)
    [[ $# == 3 ]] || fail "arguments"
    target="$3"
    digest="${target#"${repository}@sha256:"}"
    [[ "$target" == "${repository}@sha256:${digest}" && "$digest" =~ ^[0-9a-f]{64}$ ]] || fail "image_reference"
    [[ "$target" != "$current" ]] || fail "image_unchanged"
    docker pull "$target" >/dev/null
    printf '%s\n' "$current" >"$rollback_file"
    chmod 0600 "$rollback_file"
    replace_value "$target"
    if ! docker compose --env-file config/runtime.env up -d --no-deps --wait "$service" >/dev/null \
      || ! curl --fail --silent --show-error --output /dev/null --max-time 10 "$local_health" \
      || ! curl --fail --silent --show-error --output /dev/null --max-time 10 https://auth.wpauto.cc/health/ready; then
      replace_value "$current"
      docker compose --env-file config/runtime.env up -d --no-deps --wait "$service" >/dev/null || true
      fail "health_rollback_applied"
    fi
    printf 'WEPUU_DEPLOY_OK service=%s\n' "$service"
    ;;
  rollback)
    [[ $# == 2 && -f "$rollback_file" && ! -L "$rollback_file" ]] || fail "rollback_reference"
    target="$(<"$rollback_file")"
    digest="${target#"${repository}@sha256:"}"
    [[ "$target" == "${repository}@sha256:${digest}" && "$digest" =~ ^[0-9a-f]{64}$ ]] || fail "rollback_image_reference"
    docker image inspect "$target" >/dev/null 2>&1 || docker pull "$target" >/dev/null
    replace_value "$target"
    docker compose --env-file config/runtime.env up -d --no-deps --wait "$service" >/dev/null
    curl --fail --silent --show-error --output /dev/null --max-time 10 "$local_health" || fail "rollback_health"
    printf 'WEPUU_ROLLBACK_OK service=%s\n' "$service"
    ;;
  *) fail "action" ;;
esac
