#!/bin/bash
# 下载 Mihomo 订阅配置到 ./config/config.yaml
# 用法: ./update-config.sh <订阅URL>
# 示例: ./update-config.sh "https://your-worker.workers.dev/sub/YOUR_TOKEN"

set -euo pipefail

SUB_URL="https://mihomo.wangxy.us.kg/sub/a8f06eb3cbe5cde63dd46460ac0ad739"
OUTPUT="./config/config.yaml"
TMP_FILE="${OUTPUT}.tmp"

# Mihomo REST API 地址（external-controller），留空则跳过 API 热重载
MIHOMO_API="http://127.0.0.1:9090"
# Mihomo external-controller secret（对应配置文件 secret 字段）
MIHOMO_SECRET="z88S6UPoiSPKKEYUEZp_kA"
# Docker 容器名（API 不可用时用 SIGHUP 兜底），留空则跳过
MIHOMO_CONTAINER="mihomo"

# ---- 参数检查 ----
if [[ -z "$SUB_URL" ]]; then
  # 也可以在此硬编码 URL，方便直接运行
  # SUB_URL="https://your-worker.workers.dev/sub/YOUR_TOKEN"
  echo "[ERROR] 请提供订阅 URL，或在脚本中硬编码 SUB_URL" >&2
  echo "用法: $0 <订阅URL>" >&2
  exit 1
fi

# ---- 创建目录 ----
mkdir -p "$(dirname "$OUTPUT")"

echo "[INFO] 正在下载订阅: $SUB_URL"

# ---- 用公共 DNS 预解析，绕过本地 SmartDNS（NAS 上本地 DNS 可能把 CF Worker 域名打到内网）----
_host=$(echo "$SUB_URL" | sed -E 's|https?://([^/:]+).*|\1|')
_port=$(echo "$SUB_URL" | grep -q '^https' && echo 443 || echo 80)
_real_ip=""
if command -v dig &>/dev/null; then
  _real_ip=$(dig +short "$_host" @1.1.1.1 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | tail -1)
fi
if [[ -z "$_real_ip" ]] && command -v nslookup &>/dev/null; then
  _real_ip=$(nslookup "$_host" 1.1.1.1 2>/dev/null | awk '/^Address: /{print $2}' | grep -E '^[0-9]+\.' | tail -1)
fi
RESOLVE_OPT=""
if [[ -n "$_real_ip" ]]; then
  echo "[INFO] 公共 DNS 解析 $_host → $_real_ip（绕过本地 SmartDNS）"
  RESOLVE_OPT="--resolve ${_host}:${_port}:${_real_ip}"
else
  echo "[WARN] 无法通过公共 DNS 解析 $_host，使用系统默认 DNS"
fi

# ---- 下载（支持重定向，超时 30s） ----
HTTP_CODE=$(curl -sSL \
  --connect-timeout 10 \
  --max-time 30 \
  -A "clash.meta" \
  $RESOLVE_OPT \
  -o "$TMP_FILE" \
  -w "%{http_code}" \
  "$SUB_URL")

if [[ "$HTTP_CODE" != "200" ]]; then
  rm -f "$TMP_FILE"
  echo "[ERROR] 下载失败，HTTP 状态码: $HTTP_CODE" >&2
  exit 1
fi

# ---- 基础内容校验（包含 proxy-providers 或 proxies 关键字即视为有效） ----
if ! grep -qE "(proxy-providers|proxies):" "$TMP_FILE"; then
  echo "[ERROR] 下载内容不是有效的 Clash/Mihomo 配置，内容预览：" >&2
  head -10 "$TMP_FILE" >&2
  rm -f "$TMP_FILE"
  exit 1
fi

# ---- 原子替换 ----
mv "$TMP_FILE" "$OUTPUT"
echo "[OK] 配置已更新: $OUTPUT ($(wc -l < "$OUTPUT") 行)"

# ---- 热重载 Mihomo ----
if [[ -n "$MIHOMO_API" ]]; then
  RELOAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "${MIHOMO_API}/configs?force=true" \
    -H "Content-Type: application/json" \
    ${MIHOMO_SECRET:+-H "Authorization: Bearer ${MIHOMO_SECRET}"} \
    -d '{}')
  if [[ "$RELOAD_CODE" == "204" ]]; then
    echo "[OK] Mihomo 已通过 REST API 热重载"
    exit 0
  else
    echo "[WARN] REST API 热重载失败（HTTP $RELOAD_CODE），尝试 SIGHUP..."
  fi
fi

if [[ -n "$MIHOMO_CONTAINER" ]]; then
  if docker kill --signal=SIGHUP "$MIHOMO_CONTAINER" &>/dev/null; then
    echo "[OK] 已向容器 '$MIHOMO_CONTAINER' 发送 SIGHUP"
  else
    echo "[WARN] 无法向容器 '$MIHOMO_CONTAINER' 发送信号，请手动重启" >&2
  fi
fi
