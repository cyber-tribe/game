#!/usr/bin/env bash
# 3Dモデルをビルドするための Blender (bpy) 環境を作る。
#
# bpy は Blender 本体を丸ごと含む Python モジュールで、約1GBある。
# リポジトリには入れないので、モデルを作り直したいときにこれを実行する。
#
#   bash tools/setup_blender.sh
#   npm run models
#
# bpy 5.0 の wheel は CPython 3.11 専用。他のバージョンでは入らない。
set -euo pipefail

cd "$(dirname "$0")/.."
VENV="tools/venv"

PYTHON="${PYTHON:-python3}"
version="$("$PYTHON" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [ "$version" != "3.11" ]; then
  echo "bpy 5.0 は Python 3.11 が必要です (見つかったのは $version)。" >&2
  echo "PYTHON=/path/to/python3.11 bash tools/setup_blender.sh のように指定してください。" >&2
  exit 1
fi

if [ ! -d "$VENV" ]; then
  echo "==> 仮想環境を作成: $VENV"
  "$PYTHON" -m venv "$VENV"
fi

echo "==> bpy をインストール(約374MBのダウンロードがあります)"
# ローカルに wheel を置いてあればそれを使い、無ければ PyPI から取る
if [ -d "tools/.wheels" ] && ls tools/.wheels/bpy-*.whl >/dev/null 2>&1; then
  "$VENV/bin/pip" install --quiet --find-links=tools/.wheels bpy
else
  "$VENV/bin/pip" install --quiet bpy
fi

echo "==> 確認"
"$VENV/bin/python" -c 'import bpy; print("Blender", bpy.app.version_string)'
echo "完了。npm run models でモデルをビルドできます。"
