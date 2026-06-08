// ============================================================================
// 将軍スケールの単一の真実源（Single Source of Truth）
// ----------------------------------------------------------------------------
// 将軍は「スケールの違う忍者」。実体寸法・ヒット判定・描画はすべて素体フレーム
// (SHOGUN_ACTOR_BASE_WIDTH x SHOGUN_ACTOR_BASE_HEIGHT) を SHOGUN_SCALE で一律
// 拡大して得る。スケールを変えたいときは SHOGUN_SCALE だけを書き換えれば、
// scaleMultiplier 経由で寸法・接地・ヒット判定・描画すべてに漏れなく波及する。
// （ワールド寸法は素体×SHOGUN_SCALE。例: 40x60 × 2.0 = 80x120）
//
// 下の HEAD/HIP/ARM/CROUCH/CLONE 系は「素体に対する相対的な見た目の味付け」で、
// SHOGUN_SCALE には依存しない（スケールを変えても比率は保たれる）。これらも個別の
// マジックナンバーを散らさず必ずここの変数で調整する。
// ============================================================================
export const SHOGUN_SCALE = 2.0;          // 将軍の全身拡大率（唯一の絶対スケール）
export const SHOGUN_HEAD_SCALE = 0.80;    // 頭の相対サイズ（素体比・スケール非依存）
export const SHOGUN_HIP_LIFT_PX = 8.00;   // 腰の持ち上げ（素体フレーム px・スケール非依存）
export const SHOGUN_ARM_REACH_SCALE = 1.08; // 腕のリーチ倍率（相対・スケール非依存）
export const SHOGUN_CROUCH_INTENSITY = 0.35; // しゃがみ圧縮強度（相対・スケール非依存）
export const SHOGUN_ACTOR_BASE_WIDTH = 40;   // 素体フレーム幅（拡大前）
export const SHOGUN_ACTOR_BASE_HEIGHT = 60;  // 素体フレーム高さ（拡大前）
export const SHOGUN_SPECIAL_CLONE_SPACING_SCALE = 1.2; // 分身間隔倍率（相対・スケール非依存）
export const SHOGUN_AIRBORNE_TUCK_SCALE = 0.35; // 将軍の空中膝曲げ抑制倍率（相対・スケール非依存）

