#!/usr/bin/env python3
"""プレビュー用 no-cache 静的サーバ。
ブラウザがJSモジュール(player.js等)をキャッシュして修正が反映されない問題を防ぐため、
すべてのレスポンスに no-store を付けて毎回最新ファイルを配信する。

使い方:  python3 preview_nocache_server.py [port]   (デフォルト 8777)
        → http://localhost:8777/character_preview.html を開く
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'No-cache preview server: http://localhost:{PORT}/character_preview.html')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
