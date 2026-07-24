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

// 走行サイクル（素体フレームpx・スケール非依存）。機構は忍者/将軍共通の「接地ロック式」:
// 接地中の足が地面に正確にロックされるよう、位相速度の導出（player.js updateLegLocomotion）と
// 描画（playerRenderer.js）の両方がここのストライド振幅と接地デューティを共有する。
// 忍者用定数もこの機構の一部としてここに置く（ファイル名は歴史的経緯）。
export const SHOGUN_RUN_STRIDE_AMP = 13.5;  // 将軍: 走行時の足の前後振幅
export const SHOGUN_DASH_STRIDE_AMP = 16.5; // 将軍: ダッシュ時の足の前後振幅
export const SHOGUN_RUN_LIFT_AMP = 7.2;     // 将軍: 走行スイング中の足持ち上げ量
export const SHOGUN_DASH_LIFT_AMP = 9.0;    // 将軍: ダッシュスイング中の足持ち上げ量
export const NINJA_RUN_STRIDE_AMP = 12.5;   // 忍者: 走行時の足の前後振幅(脚が短いぶん将軍より控えめ)
export const NINJA_DASH_STRIDE_AMP = 15.5;  // 忍者: ダッシュ時の足の前後振幅
export const NINJA_RUN_LIFT_AMP = 5.2;      // 忍者: 走行スイング中の足持ち上げ量
export const NINJA_DASH_LIFT_AMP = 6.6;     // 忍者: ダッシュスイング中の足持ち上げ量
export const SHOGUN_RUN_STANCE_DUTY = 0.42; // 共通: 1周期中の接地割合(<0.5で滞空が生まれ歩行→走りになる)
export const SHOGUN_RUN_STRIDE_CENTER_BIAS = 0.12; // 共通: ストライド中心の後方バイアス(着地を体に寄せ前傾の読みにする)

