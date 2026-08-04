// ============================================
// Unification of the Nation - ボス部屋の演出パラメータ
// ============================================
// constants.js ではなく専用モジュールに置く理由:
// constants.js は 17 箇所から【無バージョン】で import されているため、
// ここに定数を足すと「ブラウザが古い constants.js をキャッシュから返し、
// 新しい stage.js/game.js だけが読み込まれる」組み合わせで参照が undefined になり
// 即クラッシュする。専用ファイルなら import 側に ?v= を付けて連鎖を切れる。
// ボス部屋の演出パラメータ。
// 大原則: 背景の色相は変えない。ボス戦の特別感は薄い無彩色の陰影と構図、
// 各ステージ色の細い舞台枠、固有の空気粒子、登場/撃破の間で作る。
// 彩度を持つ全画面オーバーレイは、どのステージも夕方に見せるため使わない。
export const BOSS_STAGING = {
    // --- Phase 2: 空間演出(すべて黒 or 無彩色の白) ---
    // 「暗い印象になる」と感じたら上げるのではなく下げる。ボス部屋の特別感は
    // 画面を暗くすることではなく、視線を中央に集めることで作る。内径を広く取って
    // 中央は素の明るさを保ち、端だけ静かに落とすのが正解。
    FAR_SINK_TOP: 0.075,         // 遠景は僅かに締めるだけ。暗さではなく舞台枠で特別感を作る
    FAR_SINK_HORIZON: 0.018,
    VIGNETTE_ALPHA: 0.095,
    VIGNETTE_INNER: 0.52,
    VIGNETTE_OUTER: 0.90,
    PILLAR_WIDTH_RATIO: 0.06,
    PILLAR_ALPHA: 0.085,
    SPOT_ALPHA: 0.09,
    SPOT_ALPHA_PLAYER: 0.065,
    PARTICLE_DENSITY: 0.82,

    // --- Phase 3: 登場演出 ---
    INTRO_APPROACH_MS: 600,      // 接近(右からのダッシュ)
    INTRO_IMPACT_MS: 150,        // 着地の衝撃(土煙 + 黒フラッシュ)
    // Stage6の将軍は【右の金鯱の頭の上に立って待つ】。開戦の合図は「大屋根へ飛び降りる」
    // 一動作で、落下が approach、着地が impact に対応する(専用フェーズは持たない)。
    // 待機位置は最上階に上がった時点で確定しているので、湧いた瞬間は画面外＝見えない。
    INTRO_NAME_MS: 980,          // 横組みの名乗り。視線を中央へ集めて一度だけ名前を見せる
    INTRO_READY_MS: 460,         // 名乗りが消えてからHPゲージを開くための間
    INTRO_IMPACT_FLASH: 0.20,

    // --- Phase 4: 撃破演出 ---
    DEFEAT_HITSTOP_MS: 120,      // ヒットストップ(タイムスケール0)
    DEFEAT_SLOW_MS: 500,         // スローモーションの長さ
    DEFEAT_SLOW_SCALE: 0.45,     // 同: タイムスケール
    DEFEAT_FLASH_ALPHA: 0.34,
    DEFEAT_CLOSING_MS: 520,
    DEFEAT_BLEND_FADE_MS: 620,
                                 // stage.bossDefeatLingerDuration と同値にして、
                                 // 「晴れ切った瞬間に突破アナウンス」へ繋ぐ。長くすると
                                 // ボスが消えた画面で待たされる空白になる。
};
