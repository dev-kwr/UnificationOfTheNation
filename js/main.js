// ============================================
// Unification of the Nation - メインエントリーポイント
// ============================================

import { game } from './game.js?v=20260630-castle-ai';
import { preloadCinematicBgImages } from './ui.js';

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
        }

        // フォントの読み込み完了を待機（タイトルロゴのフラッシング防止）
        const fontReadyPromise = (document.fonts && document.fonts.ready)
            ? document.fonts.ready
            : Promise.resolve();
        
        // オープニング/エンディング背景画像も先読み（intro/endingで読込前の下地が一瞬出るのを防ぐ）
        const bgReadyPromise = (typeof preloadCinematicBgImages === 'function')
            ? preloadCinematicBgImages()
            : Promise.resolve();

        // 念のため最大2秒でタイムアウトするようにしておく
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));

        Promise.race([Promise.all([fontReadyPromise, bgReadyPromise]), timeoutPromise]).then(() => {
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
