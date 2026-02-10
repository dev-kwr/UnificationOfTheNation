#!/bin/bash
cd "$(dirname "$0")"

# ポート8080を使用しているプロセスがあれば終了させる
lsof -ti:8080 | xargs kill -9 2>/dev/null

echo "Starting game server..."
python3 -m http.server 8080 &
SERVER_PID=$!

# サーバー起動待ち
echo "Waiting for server to launch..."
sleep 2

# ローカルIPアドレスを取得して表示
IP_ADDR=$(ipconfig getifaddr en0)
if [ -z "$IP_ADDR" ]; then
    IP_ADDR=$(ipconfig getifaddr en1)
fi

echo "=================================================="
echo "Game Server Started!"
echo ""
echo "Play on this PC: http://localhost:8080"
echo ""
if [ ! -z "$IP_ADDR" ]; then
    echo "Play on iPhone/iPad (same Wi-Fi): http://$IP_ADDR:8080"
else
    echo "Could not detect local IP. Please check Network Settings."
fi
echo "=================================================="

open http://localhost:8080

# サーバープロセスが終了するのを待つ
wait $SERVER_PID
