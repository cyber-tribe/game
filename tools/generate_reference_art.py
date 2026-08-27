"""Gemini APIで参考イラスト(設定画のベース)を生成する下ごしらえ。

design/characters/<名前>/concept.mdに書いた三語コンセプト・設定を基に、
塗り込み品質のイラストをGemini APIへ発注するための最小スクリプト。
SVGベジェ曲線による手描き(tools/render_svg.mjs)では「線画+平坦な色面」
止まりで、ユーザーが求める塗り込みイラストの水準に届かないと判明した
ため、外部の画像生成APIを使う前提で用意した(plan/models/
turnaround-drawing-craft.md参照)。

このリポジトリの環境からの到達性確認済み: generativelanguage.googleapis.com
(OpenAI・Stability AIの各APIはこの環境のネットワークポリシーでブロック
されているため選べない)。

前提: 環境変数 GEMINI_API_KEY にAPIキーが必要(ユーザー提供)。
キーが無い状態では実行できない(このスクリプト自体はキー無しでも
文法的に読める・--list-models等の使い方は確認できる)。

使い方:
    # 画像生成に使えるモデルを確認する(キーが必要)
    python3 tools/generate_reference_art.py --list-models

    # 生成する
    python3 tools/generate_reference_art.py \\
        --prompt-file design/characters/garudo/prompts/front-hero-pose.txt \\
        --out tools/preview/generated/garudo-hero-pose.png \\
        --model gemini-2.5-flash-image

環境変数:
    GEMINI_API_KEY  必須。Google AI StudioのAPIキー。
"""
import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.error

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-2.5-flash-image"


def api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        print(
            "エラー: 環境変数 GEMINI_API_KEY が設定されていません。"
            "Google AI StudioのAPIキーを用意してから実行してください。",
            file=sys.stderr,
        )
        sys.exit(1)
    return key


def list_models() -> None:
    key = api_key()
    url = f"{API_ROOT}/models?key={key}"
    with urllib.request.urlopen(url) as resp:
        data = json.load(resp)
    print("画像生成に使えそうなモデル(名前に image/imagen を含むもの):")
    for m in data.get("models", []):
        name = m.get("name", "")
        methods = m.get("supportedGenerationMethods", [])
        if "image" in name.lower() or "imagen" in name.lower():
            print(f"  {name}  (methods={methods})")


def generate(prompt: str, out_path: str, model: str) -> None:
    key = api_key()
    url = f"{API_ROOT}/models/{model}:generateContent?key={key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"APIエラー ({e.code}): {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
        sys.exit(1)

    images = []
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                images.append(inline["data"])

    if not images:
        print("画像が返ってこなかった。レスポンス全文:", file=sys.stderr)
        print(json.dumps(data, ensure_ascii=False, indent=2), file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(images[0]))
    print(f"生成: {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-models", action="store_true", help="画像生成モデルの一覧を表示する")
    parser.add_argument("--prompt", help="プロンプト文字列を直接渡す")
    parser.add_argument("--prompt-file", help="プロンプトを書いたテキストファイルのパス")
    parser.add_argument("--out", help="出力するPNGのパス")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"使うモデル名(既定: {DEFAULT_MODEL})")
    args = parser.parse_args()

    if args.list_models:
        list_models()
        return

    if not args.out or not (args.prompt or args.prompt_file):
        parser.error("--prompt か --prompt-file と --out の組が必要です(--list-models と併用可)")

    prompt = args.prompt
    if args.prompt_file:
        with open(args.prompt_file, encoding="utf-8") as f:
            prompt = f.read()

    generate(prompt, args.out, args.model)


if __name__ == "__main__":
    main()
