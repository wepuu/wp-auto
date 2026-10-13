#!/usr/bin/env bash
# Read-only, bounded resource evidence. Never stops services or reads secrets.
set -euo pipefail
stage="${1:-preflight}"
case "$stage" in preflight|wordpress|wpcli|test) ;; *) exit 2 ;; esac
cores=(wpauto-control-1 wpauto-authorization-1 wpauto-postgres-1 wpauto-wordpress-e2e-wordpress-1 wpauto-wordpress-e2e-database-1)
if [ "$stage" != preflight ]; then cores+=(wpauto-wordpress-e2e-b-database-1); fi
if [ "$stage" = wpcli ] || [ "$stage" = test ]; then cores+=(wpauto-wordpress-e2e-b-wordpress-1); fi
declare -A healthy_before oom_before restart_before
read_docker() { timeout 5s docker "$@"; }
cgroup_field() {
  local pid cg
  pid=$(read_docker inspect "$1" --format '{{.State.Pid}}')
  cg=$(awk -F: '$1=="0" {print $3}' "/proc/$pid/cgroup")
  [ -n "$cg" ] && [ -r "/sys/fs/cgroup$cg/$2" ] || return 1
  if [ "$2" = memory.events ]; then awk '$1=="oom_kill" {print $2}' "/sys/fs/cgroup$cg/$2"
  else cat "/sys/fs/cgroup$cg/$2"; fi
}
for name in "${cores[@]}"; do
  healthy_before[$name]=$(read_docker inspect "$name" --format '{{.State.Health.Status}}')
  oom_before[$name]=$(cgroup_field "$name" memory.events)
  restart_before[$name]=$(read_docker inspect "$name" --format '{{.RestartCount}}')
done
database_peak=$(cgroup_field wpauto-wordpress-e2e-database-1 memory.peak)
wordpress_peak=$(cgroup_field wpauto-wordpress-e2e-wordpress-1 memory.peak)
disk=$(df -Pm /opt | awk 'NR==2 {print $4}')
inodes=$(df -Pi /opt | awk 'NR==2 {print $4}')
page_size=$(getconf PAGESIZE)
printf '{"version":1,"stage":"%s","diskAvailableMiB":%s,"inodesAvailable":%s,' "$stage" "$disk" "$inodes"
awk -v db="$database_peak" -v wp="$wordpress_peak" 'BEGIN {printf "\"databasePeakMiB\":%.3f,\"wordpressPeakMiB\":%.3f,",db/1048576,wp/1048576}'
printf '"samples":['
previous_at=0; previous_in=0; previous_out=0
for sample in 1 2 3 4 5 6; do
  [ "$sample" = 1 ] || sleep 5
  at=$(date +%s)
  available=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
  swap_used=$(awk '/^SwapTotal:/ {t=$2} /^SwapFree:/ {f=$2} END {print t-f}' /proc/meminfo)
  read -r psi_some psi_full < <(awk '$1=="some" {split($2,a,"=");s=a[2]} $1=="full" {split($2,a,"=");f=a[2]} END {print s,f}' /proc/pressure/memory)
  read -r swap_in swap_out host_oom < <(awk '$1=="pswpin" {i=$2} $1=="pswpout" {o=$2} $1=="oom_kill" {k=$2} END {print i+0,o+0,k+0}' /proc/vmstat)
  [ "$sample" = 1 ] || printf ','
  awk -v at="$at" -v old_at="$previous_at" -v av="$available" -v sw="$swap_used" -v si="$swap_in" -v so="$swap_out" -v old_si="$previous_in" -v old_so="$previous_out" -v page="$page_size" -v some="$psi_some" -v full="$psi_full" -v oom="$host_oom" 'BEGIN {rate=old_at?((si-old_si)+(so-old_so))*page/1048576/(at-old_at):0;printf "{\"at\":%s,\"availableMiB\":%.3f,\"swapUsedMiB\":%.3f,\"swapIoMiBps\":%.3f,\"someAvg10\":%s,\"fullAvg10\":%s,\"hostOomKills\":%s}",at,av/1024,sw/1024,rate,some,full,oom}'
  previous_at=$at; previous_in=$swap_in; previous_out=$swap_out
done
printf '],"cores":['
separator=''
for name in "${cores[@]}"; do
  after=$(read_docker inspect "$name" --format '{{.State.Health.Status}}')
  oom_after=$(cgroup_field "$name" memory.events)
  oom_flag=$(read_docker inspect "$name" --format '{{.State.OOMKilled}}')
  restarts=$(read_docker inspect "$name" --format '{{.RestartCount}}')
  before=false; healthy=false
  [ "${healthy_before[$name]}" != healthy ] || before=true
  [ "$after" != healthy ] || healthy=true
  printf '%s{"name":"%s","healthyBefore":%s,"healthyAfter":%s,"oomBefore":%s,"oomAfter":%s,"oomFlag":%s,"restartsDelta":%s}' "$separator" "$name" "$before" "$healthy" "${oom_before[$name]}" "$oom_after" "$oom_flag" "$((restarts-${restart_before[$name]}))"
  separator=','
done
printf '],"conflicts":['
conflicts=()
if [ "$stage" = preflight ]; then
  listeners=$(ss -H -ltn)
  project_containers=$(read_docker ps -aq --filter label=com.docker.compose.project=wpauto-wordpress-e2e-b)
  volume_names=$(read_docker volume ls --format '{{.Name}}')
  network_names=$(read_docker network ls --format '{{.Name}}')
  if printf '%s\n' "$listeners" | awk '{print $4}' | grep -Eq ':3201$'; then conflicts+=(port); fi
  if [ -e /opt/wpauto-wordpress-e2e-b ]; then conflicts+=(directory); fi
  if [ -n "$project_containers" ]; then conflicts+=(project); fi
  for name in wpauto_wordpress_e2e_b_database wpauto_wordpress_e2e_b_files; do
    if printf '%s\n' "$volume_names" | grep -Fxq "$name"; then conflicts+=(volume); fi
  done
  if printf '%s\n' "$network_names" | grep -Fxq wpauto_wordpress_e2e_b_internal; then conflicts+=(network); fi
  # Calculate CIDR overlap, including wider prefixes; do not just compare names.
  overlap=$(python3 - <<'PY'
import ipaddress,json,subprocess
target=ipaddress.ip_network('172.30.52.0/24')
names=subprocess.check_output(['docker','network','ls','--format','{{.Name}}'],text=True,timeout=5).split()
nets=json.loads(subprocess.check_output(['docker','network','inspect',*names],text=True,timeout=5))
subnets=[v['Subnet'] for n in nets for v in n.get('IPAM',{}).get('Config',[]) or [] if v.get('Subnet')]
routes=json.loads(subprocess.check_output(['ip','-j','-4','route','show'],text=True,timeout=5))
subnets += [v['dst'] for v in routes if v.get('dst') not in (None,'default')]
print('true' if any((n:=ipaddress.ip_network(s,strict=False)).version==4 and n.overlaps(target) for s in subnets) else 'false')
PY
)
  if [ "$overlap" = true ]; then conflicts+=(subnet); fi
fi
separator=''
for reason in "${conflicts[@]}"; do printf '%s"%s"' "$separator" "$reason"; separator=','; done
printf ']}\n'
