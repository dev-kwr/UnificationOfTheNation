// ============================================
// Unification of the Nation - メインエントリーポイント
// ============================================

import { game } from './game.js?v=screen-safe-20260810i';
import { preloadCinematicBgImages } from './ui.js?v=screen-safe-20260810i';
import { getDeviceProfile } from './constants.js?v=screen-safe-20260810i';
import { startUpdateWatch } from './appUpdate.js?v=screen-safe-20260810i';

// ============================================
// 音の設定ゲート
// タップデバイスでは自動再生制限により初回タップまでBGMが流れないため、
// 起動時にオン/オフを選ばせ、その選択タップをオーディオ解錠のジェスチャとして使う。
// ============================================
function setupSoundGate() {
    const gate = document.getElementById('sound-gate');
    const btnOn = document.getElementById('sg-btn-on');
    const btnOff = document.getElementById('sg-btn-off');
    const audio = window.gameAudio;
    if (!gate || !btnOn || !btnOff || !audio) return;

    // タップモード（タッチ端末/モバイル）のみ表示。ui.js の isTouchOverlayMode と同じ端末判定。
    // キーボード環境は初回キー入力で既存のBGMリトライが働くためゲート不要。
    const profile = getDeviceProfile();
    // 縦持ちゲート(#rotate-gate)のCSS表示条件もこのクラスで駆動する
    if (profile.isTouchDevice || profile.isMobileUA) {
        document.body.classList.add('touch-device');
    }
    if (!profile.isTouchDevice && !profile.isMobileUA) {
        gate.remove();
        return;
    }

    const buttons = [btnOn, btnOff];
    // 前回の選択（ミュート永続化状態）を初期フォーカスに反映
    let focusIndex = audio.isMuted ? 1 : 0;
    let closed = false;

    const applyFocus = () => {
        buttons.forEach((b, i) => b.classList.toggle('is-active', i === focusIndex));
    };
    applyFocus();

    // ゲート上のポインタ/タッチ操作が window 登録のゲーム入力(input.js)へ
    // バブリングして誤操作にならないよう、ゲート要素で堰き止める
    const stopBubble = (e) => { e.stopPropagation(); };
    ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click']
        .forEach((type) => gate.addEventListener(type, stopBubble));

    const choose = (soundOn) => {
        if (closed) return;
        closed = true;
        // このハンドラはユーザージェスチャ内なので、ここでオーディオを起動・再生する
        if (audio.isMuted === soundOn) {
            audio.toggleMute(); // 選択と現状が食い違う時だけ反転（localStorage永続化込み）
        } else {
            audio.persistMuteState(); // 初回起動でも選択を記憶させる
        }
        audio.init();
        audio.resume();
        if (soundOn) audio.tryPlayCurrentBgm(true);

        focusIndex = soundOn ? 0 : 1;
        applyFocus();
        gate.classList.add('sg-closing');
        setTimeout(() => {
            window.removeEventListener('keydown', onKeyDown, true);
            gate.remove();
        }, 380);
    };

    // キーボード操作（←→/A/Dで切替、Space/Enterで決定）。
    // capture段階で止め、タイトル画面のメニュー決定に貫通させない
    const onKeyDown = (e) => {
        if (closed) return;
        e.stopImmediatePropagation();
        const key = e.key;
        if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'a' || key === 'A' || key === 'd' || key === 'D') {
            focusIndex = focusIndex === 0 ? 1 : 0;
            applyFocus();
            e.preventDefault();
        } else if (key === ' ' || key === 'Enter') {
            choose(focusIndex === 0);
            e.preventDefault();
        }
    };
    window.addEventListener('keydown', onKeyDown, true);

    btnOn.addEventListener('click', () => choose(true));
    btnOff.addEventListener('click', () => choose(false));
    btnOn.addEventListener('pointerenter', () => { if (!closed) { focusIndex = 0; applyFocus(); } });
    btnOff.addEventListener('pointerenter', () => { if (!closed) { focusIndex = 1; applyFocus(); } });

    // マスクはフェードさせず最初から暗いまま表示（起動直後に明るい画面が一瞬見えるのを防ぐ）
    gate.hidden = false;
}

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
                        setupSoundGate();
                        // PWA(standalone)はURLバーが無く手動リロードできないため、
                        // 新版の配信を検知してタイトル画面に更新導線を出す。
                        startUpdateWatch();
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
