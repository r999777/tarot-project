#!/bin/bash
# bump-version.sh — 一键更新所有 ?v=N 版本号
# 用法: ./scripts/bump-version.sh        (自动 +1)
#       ./scripts/bump-version.sh 50     (指定版本号)

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 获取当前版本号（从 index.html 的 main.js?v=N 提取）
CURRENT=$(grep -o '?v=[0-9]*' "$PROJECT_DIR/index.html" | head -1 | sed 's/?v=//')

if [ -z "$CURRENT" ]; then
  echo "错误: 无法从 index.html 中读取当前版本号"
  exit 1
fi

# 计算新版本号
if [ -n "$1" ]; then
  NEW="$1"
else
  NEW=$((CURRENT + 1))
fi

echo "版本更新: ?v=$CURRENT → ?v=$NEW"
echo ""

# 自动扫描所有含 ?v= 的文件（index.html + js/*.js）
CHANGED=0
for FULL_PATH in "$PROJECT_DIR/index.html" "$PROJECT_DIR"/js/*.js; do
  [ -f "$FULL_PATH" ] || continue
  if grep -q '?v=[0-9]' "$FULL_PATH"; then
    FILE="${FULL_PATH#$PROJECT_DIR/}"
    sed -i '' "s/?v=[0-9][0-9]*/?v=$NEW/g" "$FULL_PATH"
    COUNT=$(grep -c "?v=$NEW" "$FULL_PATH")
    echo "  ✓ $FILE ($COUNT 处)"
    CHANGED=$((CHANGED + COUNT))
  fi
done

echo ""
echo "完成! 共更新 $CHANGED 处 → ?v=$NEW"
