// ============================================
// Unification of the Nation - 定数定義
// ============================================

// キャンバスサイズ
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

// 物理定数
export const GRAVITY = 0.8;
export const FRICTION = 0.85;

// プレイヤー定数
export const PLAYER = {
    WIDTH: 40,
    HEIGHT: 60,
    SPEED: 6,
    JUMP_FORCE: -16,
    DOUBLE_JUMP_FORCE: -14,
    DASH_SPEED: 12,
    MAX_HP: 10,
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
    ROCK: { WIDTH: 50, HEIGHT: 50, HP: 6 }
};

// ゲーム状態
export const GAME_STATE = {
    TITLE: 'title',
    PLAYING: 'playing',
    PAUSED: 'paused',
    SHOP: 'shop',
    STAGE_CLEAR: 'stageClear',
    GAME_CLEAR: 'gameClear',
    GAME_OVER: 'gameOver',
    INTRO: 'intro',
};

// 難易度
export const DIFFICULTY = {
    EASY: { id: 'easy', name: '易', damageMult: 0.5, hpMult: 0.8 },
    NORMAL: { id: 'normal', name: '普', damageMult: 1.0, hpMult: 1.0 },
    HARD: { id: 'hard', name: '難', damageMult: 1.5, hpMult: 1.2 },
};

// キーマッピング
export const KEYS = {
    LEFT: ['ArrowLeft'],
    RIGHT: ['ArrowRight'],
    UP: ['ArrowUp'],
    DOWN: ['ArrowDown'],
    JUMP: [' ', 'ArrowUp'],  // Space or ↑ (SpaceをIDにするため先頭へ)
    ATTACK: ['z', 'Z'],
    BOMB: ['x', 'X'],
    SUB_WEAPON: ['c', 'C'],
    SPECIAL: ['s', 'S'],
    SWITCH_WEAPON: ['d', 'D'],
    DASH: ['Shift'],
    PAUSE: ['Escape', 'p', 'P'],
};

// ステージ情報
export const STAGES = [
    { id: 1, name: '竹林', boss: '槍持ちの侍大将', weapon: '大槍' },
    { id: 2, name: '山道', boss: '二刀流の剣豪', weapon: '二刀' },
    { id: 3, name: '城下町', boss: '鎖鎌使いの暗殺者', weapon: '鎖鎌' },
    { id: 4, name: '城内', boss: '大太刀の武将', weapon: '大太刀' },
    { id: 5, name: '天守閣', boss: '将軍', weapon: null },
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
    BUTTON_SIZE: 36, // 少し小さくしてコンパクトに
    SAFE_MARGIN_X: 150, // 右端が見切れないように十分なマージンを確保
    BOTTOM_MARGIN: 140,
    
    // 左側：十字キー配置 + ジャンプ(上)
    // 左右の間に上下を挟み込む配置（わずかに隙間を空ける: Offset 65 -> Wide Gap）
    LEFT: { x: -80, y: 0 },
    RIGHT: { x: 80, y: 0 },
    DOWN: { x: 0, y: 40 },
    JUMP: { x: 0, y: -40 }, 
    
    // 右側：アクションキー (3-2配置)
    // マージン150取っているので、センターから±75くらいなら余裕で収まる
    // (1280 - 150) + 80 = 1210. +36 = 1246 < 1280 OK.
    
    // 下段：Z, X, C
    ATTACK: { x: -80, y: 20 },      // Z (左)
    BOMB: { x: 0, y: 20 },           // X (中)
    SUB_WEAPON: { x: 80, y: 20 },   // C (右)
    
    // 上段：S, D (少し中央寄せ)
    SPECIAL: { x: -45, y: -60 },     // S (左上)
    SWITCH: { x: 45, y: -60 }        // D (右上)
};

// 各ステージの初期装備（デフォルト武器）
export const STAGE_DEFAULT_WEAPON = {
    1: null,
    2: '大槍',
    3: '二刀',
    4: '鎖鎌',
    5: '大太刀'
};
