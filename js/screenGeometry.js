// ============================================
// Unification of the Nation - スクリーン幾何（起動時スクリーン幅の算出）
// ============================================
// SCREEN_WIDTH の算出式を constants.js（起動時に1回決める側）と game.js
// （再読み込み案内の要否を判定する側）で共有するための単独モジュール。
//
// constants.js を import しないこと。constants.js 側からこのモジュールを読むため
// 循環参照になり TDZ で落ちる。基準寸法(canvasWidth/canvasHeight)は呼び出し側から
// 引数で受け取る。

// screen 基準の物理寸法を回転不変な形（長辺/短辺）で読む。
// visualViewport / inner* は Safari の URL バー伸縮で縦が痩せてアスペクトを
// 誤認するため、screen が取れない環境でのフォールバックに限定する。
export function readPhysicalScreen() {
    if (typeof window === 'undefined') return null;
    const sw = (window.screen && window.screen.width) || window.innerWidth || 0;
    const sh = (window.screen && window.screen.height) || window.innerHeight || 0;
    if (!(sw > 0 && sh > 0)) return null;
    return { long: Math.max(sw, sh), short: Math.min(sw, sh) };
}

// スクリーン論理幅。端末の横長比から高さ基準で引き伸ばし、canvasWidth を下限・
// 1600 を上限にクランプする（偶数丸め）。
//
// クランプに張り付く端末では戻り値が canvasWidth と一致する。4:3〜1.44 の iPad は
// 素の計算値が 960〜1036 にしかならず全機種が下限に張り付くため、この関数を通した
// 値を比較すれば「再読み込みしても表示は変わらない」ことを呼び出し側で判定できる。
export function computeScreenWidth(screen, canvasWidth, canvasHeight) {
    if (!screen || !(screen.short > 0)) return canvasWidth;
    const aspect = screen.long / screen.short; // 横長比（縦持ち起動でも同値）
    return Math.max(canvasWidth, Math.min(1600, Math.round((canvasHeight * aspect) / 2) * 2));
}
