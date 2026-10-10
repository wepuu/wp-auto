#!/usr/bin/env bash
set -Eeuo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
umask 077

backup_root="/opt/wpauto/backups"
daily_dir="${backup_root}/daily"
weekly_dir="${backup_root}/weekly"
container="wpauto-postgres-1"
stamp="$(date -u +%Y%m%d)"
name="wpauto-${stamp}.dump"
container_tmp="/tmp/${name}"
final="${daily_dir}/${name}"

[[ "$(realpath -m "$daily_dir")" == "/opt/wpauto/backups/daily" ]] || exit 1
[[ "$(realpath -m "$weekly_dir")" == "/opt/wpauto/backups/weekly" ]] || exit 1
install -d -m 0700 -o root -g root "$daily_dir" "$weekly_dir"
if [[ -f "$final" && -f "${final}.sha256" ]]; then
  sha256sum --check "${final}.sha256" >/dev/null \
    || { printf 'WEPUU_BACKUP_FAIL reason=existing_checksum\n' >&2; exit 1; }
  printf 'WEPUU_BACKUP_OK date=%s reused=true\n' "$stamp"
  exit 0
fi
[[ ! -e "$final" && ! -e "${final}.sha256" ]] || {
  printf 'WEPUU_BACKUP_FAIL reason=destination_exists\n' >&2
  exit 1
}

cleanup() {
  docker exec "$container" rm -f "$container_tmp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$container" pg_dump -Fc --no-owner --no-privileges \
  -U wpauto -d wpauto -f "$container_tmp"
docker exec "$container" pg_restore -l "$container_tmp" >/dev/null
docker cp "${container}:${container_tmp}" "$final" >/dev/null
chown root:root "$final"
chmod 0600 "$final"
sha256sum "$final" >"${final}.sha256"
chown root:root "${final}.sha256"
chmod 0600 "${final}.sha256"

if [[ "$(date -u +%u)" == "7" ]]; then
  weekly="${weekly_dir}/${name}"
  install -m 0600 -o root -g root "$final" "$weekly"
  sha256sum "$weekly" >"${weekly}.sha256"
  chown root:root "${weekly}.sha256"
  chmod 0600 "${weekly}.sha256"
fi

find "$daily_dir" -maxdepth 1 -type f -name 'wpauto-*.dump' -mtime +7 -delete
find "$daily_dir" -maxdepth 1 -type f -name 'wpauto-*.dump.sha256' -mtime +7 -delete
find "$weekly_dir" -maxdepth 1 -type f -name 'wpauto-*.dump' -mtime +28 -delete
find "$weekly_dir" -maxdepth 1 -type f -name 'wpauto-*.dump.sha256' -mtime +28 -delete

printf 'WEPUU_BACKUP_OK date=%s\n' "$stamp"
