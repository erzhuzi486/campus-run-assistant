#!/bin/bash
# 一键：生成一趟新数据 -> 自检 -> 1 Hz 投喂
# 用法: bash run_once.sh [距离米=1200]
# 环境变量: LDCONSOLE=<ldconsole.exe 路径>  可手动指定模拟器
set -u
cd "$(dirname "$0")" || exit 1
export MSYS_NO_PATHCONV=1

M=${1:-1200}
CSV="${TMPDIR:-/tmp}/run_stream.csv"

# ---------- 定位 ldconsole.exe ----------
CANDIDATES=(
  "${LDCONSOLE:-}"
  "/d/leidian/LDPlayer9/ldconsole.exe"
  "/d/leidian/LDPlayer14/ldconsole.exe"
  "/d/LDPlayer/LDPlayer9/ldconsole.exe"
  "/d/LDPlayer/LDPlayer14/ldconsole.exe"
  "/c/LDPlayer/LDPlayer9/ldconsole.exe"
  "/c/LDPlayer/LDPlayer14/ldconsole.exe"
  "/d/雷电模拟器/leidian/LDPlayer9/ldconsole.exe"
  "/d/雷电模拟器/leidian/LDPlayer14/ldconsole.exe"
)

LD=""
FIRST=""
for c in "${CANDIDATES[@]}"; do
  [ -n "$c" ] || continue
  [ -f "$c" ] || continue
  [ -z "$FIRST" ] && FIRST="$c"
  st=$("$c" list2 2>/dev/null | head -1 | cut -d, -f5 | tr -d '\r')
  if [ "$st" = "1" ]; then LD="$c"; break; fi
done
[ -z "$LD" ] && LD="$FIRST"
if [ -z "$LD" ]; then
  echo "[错误] 找不到 ldconsole.exe"
  echo "       请安装雷电模拟器，或设置环境变量 LDCONSOLE 指定路径"
  exit 1
fi
echo "使用模拟器: $LD"

echo "[1] 生成新一趟（随机种子）"
node gen_run.js --m="$M" --out="$CSV" || { echo '[错误] 生成失败，检查 Node.js 是否安装'; exit 1; }
echo "[2] 自检"
node validate_run.js "$CSV" | tail -3
echo "[3] 投喂"
n=0
tail -n +2 "$CSV" > "${TMPDIR:-/tmp}/rs_feed.csv"
while IFS="," read -r t dist speed pace lat lng lane <&3; do
  [ -z "${t:-}" ] && continue
  "$LD" locate --index 0 --LLI "$lng,$lat" >/dev/null 2>&1 < /dev/null
  n=$((n+1))
  if [ $((n % 100)) -eq 0 ]; then echo "  $n 点"; fi
  sleep 0.76
done 3< "${TMPDIR:-/tmp}/rs_feed.csv"
echo "[4] 完成 $n 点"