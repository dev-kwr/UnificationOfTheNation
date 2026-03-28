// ============================================
// Unification of the Nation - プレイヤーデータ・定数
// ============================================

// アニメーション状態
export const ANIM_STATE = {
    IDLE: 'idle',
    RUN: 'run',
    JUMP: 'jump',
    FALL: 'fall',
    WALL_SLIDE: 'wall_slide',
    DASH: 'dash',
    ATTACK_SLASH: 'attack_slash',       // 横斬り
    ATTACK_UPPERCUT: 'attack_uppercut', // 斬り上げ
    ATTACK_THRUST: 'attack_thrust',     // 突き
    ATTACK_SPIN: 'attack_spin',         // 回転斬り
    ATTACK_DOWN: 'attack_down',         // 振り下ろし
    SPECIAL: 'special'
};

// 連撃パターン
export const COMBO_ATTACKS = [
    { type: ANIM_STATE.ATTACK_SLASH, name: '一ノ太刀・閃返し', damage: 1.02, range: 84, durationMs: 100, cooldownScale: 0.5, chainWindowMs: 98, impulse: -0.66 },
    { type: ANIM_STATE.ATTACK_SLASH, name: '二ノ太刀・影走り袈裟', damage: 1.22, range: 80, durationMs: 140, cooldownScale: 0.46, chainWindowMs: 108, impulse: 1.08 },
    { type: ANIM_STATE.ATTACK_SPIN, name: '三ノ太刀・燕返横薙ぎ', damage: 1.5, range: 96, durationMs: 208, cooldownScale: 0.58, chainWindowMs: 108, impulse: 0.84 },
    { type: ANIM_STATE.ATTACK_UPPERCUT, name: '四ノ太刀・天穿返り', damage: 2.2, range: 96, durationMs: 248, cooldownScale: 0.62, chainWindowMs: 126, impulse: 0.68 },
    { type: ANIM_STATE.ATTACK_DOWN, name: '五ノ太刀・落天水平叩き', damage: 2.52, range: 112, durationMs: 336, cooldownScale: 0.72, chainWindowMs: 136, impulse: 0.2 }
];

export const BASE_EXP_TO_NEXT = 100;
export const TEMP_NINJUTSU_MAX_STACK_MS = 300000;
export const LEVEL_UP_MAX_HP_GAIN = 2;
export const PLAYER_HEADBAND_LINE_WIDTH = 4.2;
export const PLAYER_SPECIAL_HEADBAND_LINE_WIDTH = 5.4;
export const PLAYER_PONYTAIL_CONNECT_LIFT_Y = 2.2;
export const PLAYER_PONYTAIL_ROOT_ANGLE_RIGHT = Math.PI * 1.10;
export const PLAYER_PONYTAIL_ROOT_ANGLE_LEFT = -Math.PI * 0.10;
export const PLAYER_PONYTAIL_ROOT_SHIFT_X = 2.2;
export const PLAYER_PONYTAIL_NODE_ROOT_OFFSET_X = 1.0;
export const PLAYER_PONYTAIL_NODE_ROOT_OFFSET_Y = 6.0;

export function calcExpToNextForLevel(level) {
    const lv = Math.max(1, Math.floor(Number(level) || 1));
    const n = lv - 1;
    // Lvが上がるほど必要経験値を増やす（緩やか）
    return Math.max(
        BASE_EXP_TO_NEXT,
        Math.floor(BASE_EXP_TO_NEXT + n * 10 + n * n * 0.9)
    );
}
