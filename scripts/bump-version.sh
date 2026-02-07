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

# 需要更新的文件列表
FILES=(
  "index.html"
  "js/main.js"
  "js/three-scene.js"
  "js/star-ring.js"
  "js/card-animations.js"
  "js/tarot-data.js"
  "js/ai-service.js"
  "js/debug-controls.js"
)

CHANGED=0
for FILE in "${FILES[@]}"; do
  FULL_PATH="$PROJECT_DIR/$FILE"
  if [ -f "$FULL_PATH" ]; then
    # 替换所有 ?v=数字 为新版本号
    if grep -q '?v=[0-9]' "$FULL_PATH"; then
      sed -i '' "s/?v=[0-9][0-9]*/?v=$NEW/g" "$FULL_PATH"
      COUNT=$(grep -c "?v=$NEW" "$FULL_PATH")
      echo "  ✓ $FILE ($COUNT 处)"
      CHANGED=$((CHANGED + COUNT))
    fi
  fi
done

echo ""
echo "完成! 共更新 $CHANGED 处 → ?v=$NEW"
