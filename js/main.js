// ============================================
// Unification of the Nation - メインエントリーポイント
// ============================================

import { game } from './game.js?v=42';

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
    } catch (err) {
        failStartup('init', err);
    }
});
