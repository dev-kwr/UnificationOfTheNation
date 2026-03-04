#!/usr/bin/env python3
"""
天下統一 - 起動・開発サーバー統合コマンド
ダブルクリックで起動し、表示されるURLをブラウザで開いてください。
"""
import http.server
import os
import socket
import functools
import subprocess
import webbrowser
import time
import sys

# 作業ディレクトリをこのファイルの場所に固定
os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 8080

def kill_port_owner(port):
    """指定されたポートを使用しているプロセスがあれば終了させる（macOS用）"""
    try:
        # lsofでPIDを特定
        result = subprocess.check_output(["lsof", "-t", f"-i:{port}"], stderr=subprocess.STDOUT)
        pids = result.decode().strip().split('\n')
        for pid in pids:
            if pid:
                print(f"ポート {port} を使用中の既存プロセス(PID:{pid}) を終了します...")
                subprocess.call(["kill", "-9", pid])
        time.sleep(1) # 解放を待機
    except subprocess.CalledProcessError:
        # ポートが使われていない場合は何もしない
        pass

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """キャッシュを完全に無効化し、index.htmlに動的バージョンを付与する開発用ハンドラ"""
    def do_GET(self):
        # index.html の場合は内容を読み込んで JS のバージョンを動的に書き換える
        if self.path == '/' or self.path == '/index.html':
            try:
                with open('index.html', 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # キャッシュブッスター（現在時刻のタイムスタンプ）を適用
                version = str(int(time.time()))
                import re
                # <script ... src="js/main.js?v=..."> の箇所を置換
                content = re.sub(r'src="js/main\.js\?v=[^"]+"', f'src="js/main.js?v={version}"', content)
                
                self.send_response(200)
                self.send_header('Content-type', 'text/html; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
                return
            except Exception as e:
                print(f"Index dynamic override error: {e}")

        return super().do_GET()

    def end_headers(self):
        # 全てのファイル（JS/CSS等）に対してキャッシュ無効化ヘッダーを付与
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # ブラウザのキャッシュ判断指標を無効化
        if 'Last-Modified' in self.headers: del self.headers['Last-Modified']
        if 'ETag' in self.headers: del self.headers['ETag']
        super().end_headers()
    
    def log_message(self, format, *args):
        # 開発中のコンソールをクリーンに保つため、リクエストログを表示
        if args and any(ext in str(args[0]) for ext in ['.js', '.css', '.html']):
            print(f" [Serving] {args[0]}")

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '（取得できませんでした）'

print(f'\n🏯 天下統一 - サーバー起動準備中...')

# ポートの競合を解決
kill_port_owner(PORT)

# サーバー設定
server = http.server.HTTPServer(('0.0.0.0', PORT),
    functools.partial(NoCacheHandler, directory='.'))

local_ip = get_local_ip()

print(f'==================================================')
print(f'   Game Server Started!')
print(f'')
print(f'   このMacから : http://localhost:{PORT}')
print(f'   他の端末から: http://{local_ip}:{PORT}')
print(f'')
print(f'   ※ キャッシュ無効化は有効です（開発に最適）')
print(f'   停止するには Ctrl+C')
print(f'==================================================\n')

# 自動でブラウザを開く
webbrowser.open(f'http://localhost:{PORT}')

try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\nサーバーを停止しました。')
    server.server_close()
    sys.exit(0)
