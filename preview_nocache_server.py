#!/usr/bin/env python3
"""キャッシュ無効の静的プレビューサーバ。

- 用途: 検証/プレビュー用。ES module の推移的 import (例: playerSlashTrail.js) が
  ブラウザにキャッシュされて古いコードが読まれるのを防ぐため、全レスポンスに
  no-store ヘッダを付ける。
- ポート: 第1引数 > 環境変数 PORT > 既定 8777。
  [重要] localhost:8080 はユーザーのデバッグサーバ専用。ここでは絶対に使わない。
  8080 が指定された場合は安全な別ポート(8777)へ退避する。
- 配信ディレクトリ: このファイルのある場所(リポジトリ直下)。
"""
import functools
import http.server
import os
import sys

DEFAULT_PORT = 8777
FORBIDDEN_PORT = 8080  # ユーザーのデバッグサーバ。占有禁止。


def resolve_port():
    raw = None
    if len(sys.argv) > 1:
        raw = sys.argv[1]
    elif os.environ.get("PORT"):
        raw = os.environ["PORT"]
    try:
        port = int(raw) if raw is not None else DEFAULT_PORT
    except (TypeError, ValueError):
        port = DEFAULT_PORT
    if port == FORBIDDEN_PORT:
        print(f"[preview] port {FORBIDDEN_PORT} はユーザー専用のため {DEFAULT_PORT} へ退避します", flush=True)
        port = DEFAULT_PORT
    return port


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 静かに動かす（必要ならコメントアウト）
        pass


def main():
    port = resolve_port()
    serve_dir = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=serve_dir)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"[preview] no-cache server: http://localhost:{port}  (dir: {serve_dir})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
