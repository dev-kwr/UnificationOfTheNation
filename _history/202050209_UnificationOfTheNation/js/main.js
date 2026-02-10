// ============================================
// Unification of the Nation - メインエントリーポイント
// ============================================

import { game } from './game.js?v=39';

// DOMロード後に初期化
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    
    // ゲーム初期化
    game.init(canvas);
    
    // ゲームループ開始
    requestAnimationFrame((t) => game.loop(t));
    
    console.log('Unification of the Nation - Game Loaded!');
});
