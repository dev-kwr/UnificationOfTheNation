#!/usr/bin/env python3
"""
天下統一 - 開発用ローカルサーバー
ダブルクリックで起動し、表示されるURLをブラウザで開いてください。
同じWi-Fi内の別端末（iPhone, iPad等）からもアクセスできます。
すべてのJSファイルにキャッシュ無効化ヘッダーを付与します。
"""
import http.server
import os
import socket
import functools

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    
    def log_message(self, format, *args):
        # アクセスログを簡潔に（JSファイルのみ表示）
        if args and '.js' in str(args[0]):
            super().log_message(format, *args)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '（取得できませんでした）'

PORT = 8080
# 0.0.0.0 にバインドすることで、LAN内の他端末からもアクセス可能
server = http.server.HTTPServer(('0.0.0.0', PORT),
    functools.partial(NoCacheHandler, directory='.'))

local_ip = get_local_ip()

print(f'\n🏯 天下統一 - 開発サーバー起動')
print(f'')
print(f'   このMacから : http://localhost:{PORT}')
print(f'   他の端末から: http://{local_ip}:{PORT}')
print(f'')
print(f'   停止するには Ctrl+C\n')

import webbrowser
webbrowser.open(f'http://localhost:{PORT}')

try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\nサーバーを停止しました。')
    server.server_close()
