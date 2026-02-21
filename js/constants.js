// ============================================
// Unification of the Nation - 定数定義
// ============================================

// キャンバスサイズ
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

// 物理定数
export const GRAVITY = 0.8;
export const FRICTION = 0.85;

// レーンY軸オフセット（groundY からの相対値）
// プレイヤー・敵・影・分身・ジェム・障害物等の標準接地レーン
export const LANE_OFFSET = 32;

// プレイヤー定数
export const PLAYER = {
    WIDTH: 40,
    HEIGHT: 60,
    SPEED: 6,
    JUMP_FORCE: -16,
    DOUBLE_JUMP_FORCE: -14,
    DASH_SPEED: 12,
    MAX_HP: 10,
    MONEY_MAX: 9999,
    ATTACK_COMBO_MAX: 5,
    ATTACK_COOLDOWN: 150,  // ミリ秒
};

// 敵の種類
export const ENEMY_TYPES = {
    ASHIGARU: 'ashigaru',   // 足軽（雑魚）
    SAMURAI: 'samurai',      // 侍（普通）
    BUSHO: 'busho',          // 武将（中ボス）
    NINJA: 'ninja',          // 忍者（特殊、飛び道具）
    BOSS: 'boss',            // ボス
};

// 障害物タイプ
export const OBSTACLE_TYPES = {
    SPIKE: 'spike',
    ROCK: 'rock'
};

// 障害物設定
export const OBSTACLE_SETTINGS = {
    SPIKE: { WIDTH: 30, HEIGHT: 30, DAMAGE: 5 },
    ROCK: { WIDTH: 50, HEIGHT: 50, HP: 3 }
};

// ゲーム状態
export const GAME_STATE = {
    TITLE: 'title',
    PLAYING: 'playing',
    DEFEAT: 'defeat',
    PAUSED: 'paused',
    SHOP: 'shop',
    LEVEL_UP: 'levelUp',
    STAGE_CLEAR: 'stageClear',
    GAME_CLEAR: 'gameClear',
    ENDING: 'ending',
    GAME_OVER: 'gameOver',
    INTRO: 'intro',
};

// 難易度
export const DIFFICULTY = {
    EASY: { id: 'easy', name: '易', damageMult: 0.5, hpMult: 0.8 },
    NORMAL: { id: 'normal', name: '普', damageMult: 1.1, hpMult: 1.15 },
    HARD: { id: 'hard', name: '難', damageMult: 2.0, hpMult: 1.8 },
};

// キーマッピング
export const KEYS = {
    LEFT: ['ArrowLeft'],
    RIGHT: ['ArrowRight'],
    UP: ['ArrowUp'],
    DOWN: ['ArrowDown'],
    JUMP: [' ', 'ArrowUp'],  // Space or ↑ (SpaceをIDにするため先頭へ)
    ATTACK: ['z', 'Z'],
    SUB_WEAPON: ['x', 'X'],
    SPECIAL: ['s', 'S', 'a', 'A'],
    SWITCH_WEAPON: ['d', 'D'],
    DASH: ['Shift'],
    PAUSE: ['Escape'],
    DEBUG_TOGGLE: ['q', 'Q'],
    DEBUG_START: ['Enter'],
};

// ステージ情報
export const STAGES = [
    { id: 1, name: '竹林', boss: '火薬玉の武将', weapon: '火薬玉' },
    { id: 2, name: '街道', boss: '槍持ちの侍大将', weapon: '大槍' },
    { id: 3, name: '山道', boss: '二刀流の剣豪', weapon: '二刀流' },
    { id: 4, name: '城下町', boss: '鎖鎌使いの暗殺者', weapon: '鎖鎌' },
    { id: 5, name: '城内', boss: '大太刀の武将', weapon: '大太刀' },
    { id: 6, name: '天守閣', boss: '将軍', weapon: null },
];

// 色定義（レトロ風パレット）
export const COLORS = {
    // 背景
    SKY: '#87CEEB',
    GROUND: '#654321',
    
    // プレイヤー（忍者）
    PLAYER: '#1a1a1a',
    PLAYER_OUTLINE: '#000000',
    PLAYER_GI: '#1a1a1a',     // 忍装束
    PLAYER_BELT: '#8b0000',   // 帯（深紅）
    PLAYER_SKIN: '#ffdbac',   // 肌

    // 敵・装身具
    CLOTH_RED: '#b22222',     // 赤い布（足軽など）
    CLOTH_BLUE: '#1e90ff',    // 青い布
    ARMOR_IRON: '#4a4a4a',    // 鉄の鎧
    ARMOR_GOLD: '#ffd700',    // 金の装飾
    WOOD_BROWN: '#8b4513',    // 木製パーツ
    
    // 武器
    STEEL: '#e0e0e0',         // 鋼鉄（刀身）
    STEEL_DARK: '#a0a0a0',    // 鋼鉄（暗部）
    HANDLE: '#333333',        // 柄
    
    // UI
    HP_BAR: '#FF4444',
    HP_BAR_BG: '#440000',
    EXP_BAR: '#44FF44',
    EXP_BAR_BG: '#004400',
    SPECIAL_GAUGE: '#FFFF44',
    SPECIAL_GAUGE_BG: '#444400',
    MONEY: '#FFD700',
    
    // エフェクト
    ATTACK_SLASH: '#FFFFFF',
    EXPLOSION: '#FF6600',
};

// 仮想パッド配置
export const VIRTUAL_PAD = {
    BUTTON_SIZE: 40, // 互換用ベース半径
    ATTACK_BUTTON_RADIUS: 48, // Z（主攻撃）は一回り大きく
    AUX_BUTTON_RADIUS: 38, // 周辺3ボタン
    PAUSE_BUTTON_RADIUS: 22, // 左スティック横の小サイズ
    BUTTON_TOUCH_SCALE: 1.14, // タップ判定の拡張率
    SAFE_MARGIN_X: 150, // 右端が見切れないように十分なマージンを確保
    BOTTOM_MARGIN: 140,
    
    // 左側：丸型アナログスティック
    STICK: { x: 0, y: 0 },
    STICK_BASE_RADIUS: 72,
    STICK_KNOB_RADIUS: 34,
    STICK_MAX_DISTANCE: 56,
    STICK_TOUCH_RADIUS: 110,
    STICK_DEADZONE: 0.22,
    STICK_HORIZONTAL_THRESHOLD: 0.28,
    STICK_DASH_ENGAGE_THRESHOLD: 0.93,
    STICK_DASH_RELEASE_THRESHOLD: 0.82,
    STICK_UP_THRESHOLD: -0.44,
    STICK_DOWN_THRESHOLD: 0.38,
    PAUSE_BUTTON: { x: 104, y: 50 }, // 左スティック右下（下揃え）

    // 上部UIボタン（全画面共通・右上固定）
    BGM_BUTTON_MARGIN_TOP: 30,
    BGM_BUTTON_MARGIN_RIGHT: 30,
    BGM_BUTTON_RADIUS: 18,
    
    // 右側：Z基準の扇形（隣接余白を同値で統一）
    // 条件:
    // - ZとDは右揃え
    // - ZとXは下揃え
    // - SはXとDの間
    // - 隣接余白(Z-X / Z-D / X-S / D-S) ≒ 16px
    ATTACK: { x: 26, y: 58 },        // Z: 主攻撃（基準）
    SUB_WEAPON: { x: -76, y: 68 },   // X: 左下
    SPECIAL: { x: -53, y: -21 },     // S: 中間
    SWITCH: { x: 36, y: -44 }        // D: 右上
};

// 各ステージの初期装備（デフォルト武器）
export const STAGE_DEFAULT_WEAPON = {
    1: '手裏剣',
    2: '火薬玉',
    3: '大槍',
    4: '二刀流',
    5: '鎖鎌',
    6: '大太刀'
};
