// ============================================
// Unification of the Nation - メインエントリーポイント
// ============================================

import { game } from './game.js';

// DOMロード後に初期化
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }

    let startupFailed = false;

    const cleanupStartupGuards = () => {
        window.removeEventListener('error', onStartupError);
        window.removeEventListener('unhandledrejection', onStartupRejected);
    };

    const failStartup = (label, reason) => {
        if (startupFailed) return;
        startupFailed = true;
        cleanupStartupGuards();
        document.body.classList.remove('game-ready');
        console.error(`[Startup] ${label}:`, reason);
    };

    const onStartupError = (event) => {
        failStartup('error', event?.error || event?.message || event);
    };

    const onStartupRejected = (event) => {
        failStartup('unhandledrejection', event?.reason || event);
    };

    window.addEventListener('error', onStartupError);
    window.addEventListener('unhandledrejection', onStartupRejected);

    try {
        // 明朝webフォント(Zen Old Mincho)をcanvas描画前にロード開始（フォールバックのちらつき防止）
        if (document.fonts && document.fonts.load) {
            const sample = '昇段強化選択効果時間秒初級中上特連撃忍具奥義分身引寄大薙隠身術天下統一';
            ['400', '500', '700', '900'].forEach((w) => {
                try { document.fonts.load(`${w} 24px "Zen Old Mincho"`, sample); } catch (e) { /* noop */ }
            });
            // タイトル英字ロゴの筆書体(Rock Salt)も先読み
            try { document.fonts.load('400 48px "Rock Salt"', 'UNIFICATION OF THE NATION'); } catch (e) { /* noop */ }
            // 天下統一サブの毛筆(Yuji Mai/Boku)も先読み（スプライト生成時のフォールバック防止）
            try { document.fonts.load('400 34px "Yuji Mai"', '天下統一'); document.fonts.load('400 34px "Yuji Boku"', '天下統一'); } catch (e) { /* noop */ }
        }

        // フォントの読み込み完了を待機（タイトルロゴのフラッシング防止）
        const fontReadyPromise = (document.fonts && document.fonts.ready)
            ? document.fonts.ready
            : Promise.resolve();
        
        // 念のため最大2秒でタイムアウトするようにしておく
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));

        Promise.race([fontReadyPromise, timeoutPromise]).then(() => {
            if (startupFailed) return;
            
            // ゲーム初期化
            game.init(canvas);

            // 初回フレーム描画が終わってから表示
            requestAnimationFrame((t) => {
                try {
                    if (startupFailed) return;
                    game.loop(t);

                    requestAnimationFrame(() => {
                        if (startupFailed) return;
                        document.body.classList.add('game-ready');
                        cleanupStartupGuards();
                        console.log('Unification of the Nation - Game Loaded!');
                    });
                } catch (err) {
                    failStartup('first-frame', err);
                }
            });
        }).catch(err => {
            failStartup('font-load', err);
        });
    } catch (err) {
        failStartup('init', err);
    }
});
