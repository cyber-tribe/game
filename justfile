# 開発でよく使う手順集。`just --list` で一覧が出る。
#
# 目的: 毎回同じコマンド列を組み立て直さずに済むようにする
# (Claude のセッションでも人間でも、`just <レシピ名>` の一言で済む)。

set shell := ["bash", "-euo", "pipefail", "-c"]

# レシピ一覧を表示する
default:
    @just --list --unsorted

# ---- 検証(push 前の最低ライン。CI と同じ内容) ----

# 型チェック + ユニットテスト全部
check: typecheck test

# 型チェックだけ
typecheck:
    npm run typecheck

# ユニットテスト。ファイル指定で絞れる: just test tests/barrel.test.ts
test *files:
    npx vitest run {{files}}

# 本番ビルド(型チェック込み、dist/ に書き出す)
build:
    npm run build

# 開発サーバー (http://127.0.0.1:5173/)
dev:
    npm run dev

# ---- 通しプレイ・自動テスト(ヘッドレスブラウザ) ----

# イベント駆動待ちの通しプレイ
playtest:
    npm run playtest

# 自動テスター(スクリーンショットは auto-tester-shots/ に出る)
auto-tester:
    npm run auto-tester

# ---- 3Dモデル (Blender) ----

# bpy 入り venv を作る(初回のみ。Python 3.11 必須、約1GB)
blender-setup:
    bash tools/setup_blender.sh

# モデルをビルド。名前指定で1体だけ: just models garudo
models *names:
    npm run models -- {{names}}

# プレビュー画像を省いて速くビルド(CI と同じ)
models-fast *names:
    npm run models -- --no-preview {{names}}

# モデルの検証テストだけ回す
models-test:
    npx vitest run tests/models.test.ts

# ---- サウンド ----

# 効果音・BGM をビルド
audio:
    npm run audio

# ---- PR サイクル(1決定 = 1PR の運用。CLAUDE.md 参照) ----

# 新しい作業ブランチを origin/main から作る(PRごとに新しい名前で。使い回さない): just fresh claude/my-branch
fresh branch:
    git fetch origin main
    git checkout -B {{branch}} origin/main

# コミット→push→PR作成→オートマージ(squash)設定まで一括: just ship "コミットメッセージ"
# (gh が無い環境では push まで行い、PR作成とオートマージ設定は別の手段で行う)
ship message:
    git add -A
    git commit -m "{{message}}"
    git push -u origin "$(git branch --show-current)"
    @if command -v gh >/dev/null 2>&1; then \
      gh pr create --title "{{message}}" --body "" --base main && \
      gh pr merge --auto --squash; \
    else \
      echo "gh なし: PR作成とオートマージ有効化は別の手段で行うこと"; \
    fi
