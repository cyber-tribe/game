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
    npm run --silent typecheck

# ユニットテスト。ファイル指定で絞れる: just test tests/barrel.test.ts
# (dot レポーターで成功時の出力を抑える。失敗の詳細は従来どおり出る)
test *files:
    npx vitest run --reporter=dot {{files}}

# 本番ビルド(型チェック込み、dist/ に書き出す。警告以外の出力は抑える)
build:
    npm run --silent build -- --logLevel warn

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

# 判断密度のプレイテスト(plan/game/archive/decision-density-playtest.md)。
# plan/game/decision-density-findings.md を書き出す
decision-density:
    npm run decision-density

# ---- 3Dモデル (Blender) ----

# bpy 入り venv を作る(初回のみ。Python 3.11 必須、約1GB)
blender-setup:
    bash tools/setup_blender.sh

# モデルをビルド。名前指定で1体だけ: just models garudo
models *names:
    npm run models -- {{names}}

# 商品確認用ターンテーブル(エンジン内6枚)。npm run dev を先に上げておく
turntable *names:
    MODELS="{{names}}" npm run turntable

# プレビュー画像を省いて速くビルド(CI と同じ)
models-fast *names:
    npm run models -- --no-preview {{names}}

# モデルの検証テストだけ回す
models-test:
    npx vitest run --reporter=dot tests/models.test.ts

# ---- サウンド ----

# 効果音・BGM をビルド
audio:
    npm run audio

# ---- PR サイクル(1決定 = 1PR の運用。CLAUDE.md 参照) ----

# 新しい作業ブランチを origin/main から作る(PRごとに新しい名前で。使い回さない): just fresh claude/my-branch
fresh branch:
    git fetch --quiet origin main
    git checkout -q -B {{branch}} origin/main

# コミットして push する。push を受けて Actions(auto-pr.yml)が PR 作成と
# オートマージ設定まで行う: just ship "コミットメッセージ"
# (メッセージの1行目が PR タイトル、本文が説明文になる)
ship message:
    git add -A
    git commit -m "{{message}}"
    git push --quiet -u origin "$(git branch --show-current)"
