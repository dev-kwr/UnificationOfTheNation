// ============================================
// Unification of the Nation - 定数定義
// ============================================

// キャンバスサイズ
// CANVAS_WIDTH = 可視ワールド幅（ゲームプレイ窓）。世界ロジック(カメラ/クランプ/
// アリーナ/カリング/スポーン)は必ずこちらを参照する。恒久に1280固定。
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;
// SCREEN_WIDTH = キャンバス実論理幅（プレゼンテーション層: 表示変換/フルスクリーン塗り/
// スクリーンUI/入力変換が参照）。タッチ端末のみ、端末の横長アスペクトから起動時に1回だけ
// 決定しセッション固定（回転・リサイズで再計算しない）。世界ズーム z = SCREEN_WIDTH /
// CANVAS_WIDTH の恒等式により可視ワールド幅は常に1280（端末別の難易度差を構成的に排除）。
// 注意: let のためモジュールスコープで `const HALF = SCREEN_WIDTH/2` の様な派生定数を
// 作らないこと（凍結値バグ）。スクリーン寸法は必ず関数内で毎回参照する。
export let SCREEN_WIDTH = CANVAS_WIDTH;
(function initScreenWidth() {
    try {
        if (typeof window === 'undefined') return;
        // ?wide=0/1 はキルスイッチ(localStorage)を書き換えるエントリポイント。
        // PWA standalone では URL を打てないため localStorage が正本。
        try {
            const q = new URLSearchParams(window.location.search).get('wide');
            if (q === '0' || q === '1') window.localStorage.setItem('uon_wide_mode', q);
        } catch { /* localStorage不可環境では無視 */ }
        let wideFlag = null;
        try { wideFlag = window.localStorage.getItem('uon_wide_mode'); } catch { /* noop */ }
        if (wideFlag === '0') return; // キルスイッチ: 従来の1280固定へ退避
        const p = getDeviceProfile();
        if (!p.isTouchDevice && !p.isMobileUA) return; // 非タッチPCは1280固定
        // screen 基準（物理・回転不変）。visualViewport/innerサイズは Safari のURLバー等で
        // 縦が痩せてアスペクトを誤認するためフォールバック限定。
        const sw = (window.screen && window.screen.width) || window.innerWidth || 0;
        const sh = (window.screen && window.screen.height) || window.innerHeight || 0;
        if (!(sw > 0 && sh > 0)) return;
        const aspect = Math.max(sw, sh) / Math.min(sw, sh); // 横長比（縦持ち起動でも同値）
        SCREEN_WIDTH = Math.max(CANVAS_WIDTH, Math.min(1600, Math.round((CANVAS_HEIGHT * aspect) / 2) * 2));
    } catch { /* 失敗時は1280のまま（安全側） */ }
})();

// 端末プロファイル判定の単一ソース（従来4ファイルに複製されていた式を一元化）。
// P2b（可変スクリーン幅）で pointer:coarse 併用の複合判定へ精緻化する予定
// (screen_adaptation_plan.md §2.8)。それまでは従来と同一の式を維持する。
export function getDeviceProfile() {
    const isTouchDevice = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return { isTouchDevice, isMobileUA };
}

// 物理定数
export const GRAVITY = 0.8;
export const FRICTION = 0.85;

// レーンY軸オフセット（groundY からの相対値）
// プレイヤー・敵・影・分身・ジェム・障害物等の標準接地レーン
export const LANE_OFFSET = 32;
// 旧互換用。ワールド側は疑似拡大せず、各エンティティの実寸で大きさを持つ。
export const WORLD_ENTITY_RENDER_SCALE = 1;

// プレイヤー定数
export const PLAYER = {
    WIDTH: 48,
    HEIGHT: 72,
    SPEED: 6,
    JUMP_FORCE: -16,
    DOUBLE_JUMP_FORCE: -14,
    DASH_SPEED: 12,
    MAX_HP: 10,
    MONEY_MAX: 9999,
    ATTACK_COMBO_MAX: 5,
    ATTACK_COOLDOWN: 150,  // ミリ秒
    // 大薙(大凪)の前方リーチ。剣筋の見た目と当たり判定の前方到達距離をこの2値だけで揃える（調整はここ）。
    // 実リーチ = min(OONAGI_REACH_MAX_PX, OONAGI_REACH_PX * max(1, scaleMultiplier*0.86))。
    OONAGI_REACH_PX: 112,       // 忍者基準の前方リーチ(px)。小さくすると剣筋・判定とも短くなる。
    OONAGI_REACH_MAX_PX: 158,   // 体格倍率(将軍など)込みの上限(px)。
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
    SPIKE: { WIDTH: 36, HEIGHT: 36, DAMAGE: 5 },
    ROCK: { WIDTH: 60, HEIGHT: 60, HP: 3 }
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
    EASY: { id: 'easy', name: '易', damageMult: 0.5, hpMult: 0.8, stage3ScrollMult: 0.94 },
    NORMAL: { id: 'normal', name: '普', damageMult: 1.1, hpMult: 1.15, stage3ScrollMult: 1.0 },
    HARD: { id: 'hard', name: '難', damageMult: 2.0, hpMult: 1.8, stage3ScrollMult: 1.08 },
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
    SPECIAL: ['s', 'S'],
    SWITCH_WEAPON: ['c', 'C'],
    DASH: ['Shift'],
    PAUSE: ['Escape'],
    DEBUG_TOGGLE: ['q', 'Q'],
    DEBUG_START: ['Enter'],
    CONFIRM: [' ', 'Enter'],  // 決定（Space/Enter）。↑(ArrowUp)は含めない＝決定にしない（↑はジャンプ専用）
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
    STICK: { x: 32, y: 34 }, // さらに右へ移動し、右側ボタン群と下揃え
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
    PAUSE_BUTTON: { x: -104, y: 50 }, // 左スティック左下（Dパッドと非重なり）

    // 上部UIボタン（全画面共通・右上固定）
    BGM_BUTTON_MARGIN_TOP: 40,
    BGM_BUTTON_MARGIN_RIGHT: 40,
    BGM_BUTTON_RADIUS: 22,
    
    // 右側：Z基準の扇形（隣接余白を同値で統一）
    // 条件:
    // - ZとCは右揃え
    // - ZとXは下揃え
    // - SはXとCの間
    // - 隣接余白(Z-X / Z-C / X-S / C-S) ≒ 16px
    ATTACK: { x: 26, y: 58 },        // Z: 主攻撃（基準）
    SUB_WEAPON: { x: -76, y: 68 },   // X: 左下
    SPECIAL: { x: -53, y: -21 },     // S: 中間
    SWITCH: { x: 36, y: -44 }        // C: 右上
};

// ============================================
// uiScale: HUD/仮想パッドの物理サイズアンカー (screen_adaptation_plan.md §2.6)
// スマホは fitScale≈0.52-0.60 でボタン41.5css-px/文字13css-pxまで縮み
// 44pt/18px基準を割るため、タッチ端末のみ 0.72/fitScale (1.0〜1.45) で拡大する。
// game.js configureCanvasResolution が fitScale 確定のたびに更新する。
// ============================================
let _uiScale = 1;
export function setUiScaleFromFitScale(fitScale) {
    const p = getDeviceProfile();
    _uiScale = ((p.isTouchDevice || p.isMobileUA) && fitScale > 0)
        ? Math.min(1.45, Math.max(1.0, 0.72 / fitScale))
        : 1.0;
}
export function getUiScale() { return _uiScale; }

// セーフエリア(ノッチ/Dynamic Island)の論理pxインセット (P3)。
// game.js configureCanvasResolution が env(safe-area-inset-*) を getComputedStyle で読み、
// fitScale で除して論理pxへ換算してから設定する。描画(ui.js)と判定(input.js)は
// getPadLayout 経由で同じ値を共有する。
let _safeInsetL = 0;
let _safeInsetR = 0;
export function setSafeInsets(leftPx, rightPx) {
    _safeInsetL = Number.isFinite(leftPx) ? Math.max(0, leftPx) : 0;
    _safeInsetR = Number.isFinite(rightPx) ? Math.max(0, rightPx) : 0;
}
export function getSafeInsets() { return { left: _safeInsetL, right: _safeInsetR }; }

// 仮想パッド幾何の単一導出。描画(ui.js)と判定(input.js)は必ずこれを読むこと
// （clamp式や座標式を両ファイルへ複製するとヒットと見た目が必ずズレる）。
// s=1 のとき全値が従来定数と数値同一＝ピクセル不変。
export function getPadLayout() {
    const s = _uiScale;
    const pad = VIRTUAL_PAD;
    const bottomY = CANVAS_HEIGHT - pad.BOTTOM_MARGIN * s;
    // 左右アンカーはセーフエリア(ノッチ)内へ退避。スクリーン右端は SCREEN_WIDTH 基準。
    const rightX = SCREEN_WIDTH - _safeInsetR - pad.SAFE_MARGIN_X * s;
    const stickX = _safeInsetL + (pad.SAFE_MARGIN_X + pad.STICK.x) * s;
    const stickY = bottomY + pad.STICK.y * s;
    return {
        s,
        touchScale: pad.BUTTON_TOUCH_SCALE || 1.14,
        stick: {
            x: stickX, y: stickY,
            baseRadius: pad.STICK_BASE_RADIUS * s,
            knobRadius: pad.STICK_KNOB_RADIUS * s,
            maxDistance: pad.STICK_MAX_DISTANCE * s,
            touchRadius: pad.STICK_TOUCH_RADIUS * s
        },
        pause:   { x: stickX + pad.PAUSE_BUTTON.x * s, y: stickY + pad.PAUSE_BUTTON.y * s, r: pad.PAUSE_BUTTON_RADIUS * s },
        attack:  { x: rightX + pad.ATTACK.x * s,     y: bottomY + pad.ATTACK.y * s,     r: pad.ATTACK_BUTTON_RADIUS * s },
        sub:     { x: rightX + pad.SUB_WEAPON.x * s, y: bottomY + pad.SUB_WEAPON.y * s, r: pad.AUX_BUTTON_RADIUS * s },
        special: { x: rightX + pad.SPECIAL.x * s,    y: bottomY + pad.SPECIAL.y * s,    r: pad.AUX_BUTTON_RADIUS * s },
        switch:  { x: rightX + pad.SWITCH.x * s,     y: bottomY + pad.SWITCH.y * s,     r: pad.AUX_BUTTON_RADIUS * s },
        bgm: {
            x: SCREEN_WIDTH - _safeInsetR - pad.BGM_BUTTON_MARGIN_RIGHT * s,
            y: pad.BGM_BUTTON_MARGIN_TOP * s,
            r: pad.BGM_BUTTON_RADIUS * s
        }
    };
}

// Stage 5 フロア制の定数
export const STAGE5_FLOOR = {
    COUNT: 5,
    PROGRESS_PER_FLOOR: 8100,
    STAIR_WIDTH: 360,               // 階段区間の幅（プレビュー画像を drawScale=0.4 で描画）
    STAIR_HEIGHT: 320,              // 階段で登る高さ（= 800 * 0.4 : プレビューのアスペクト比を維持）
    STAIR_STEP_COUNT: 36,           // 段数（密度を大幅に増加）
    TRANSITION_FADE_MS: 400,
    TRANSITION_WAIT_MS: 600,
    TRANSITION_FADEIN_MS: 400,
    DIFFICULTY_SCALE: [1.0, 1.1, 1.2, 1.35, 1.5],
    PREVIOUS_STAIR_VISIBLE_WIDTH: 200,
};

// Stage 6 螺旋回廊（廻縁）の定数
// 天守外周を1周ごとに巡り、角=ゾーン境界(maxProgress/4 の倍数)の全高壁の通用門をくぐって次の面へ。
// 壁が境界の先を視界から隠すことで「向こう側は一段上」という省略が成立する。
export const STAGE6_CORNER = {
    CORNER_XS: [6000, 12000, 18000],
    WALL_LEFT_PX: 200,              // 壁の左端（境界からの距離）
    WALL_RIGHT_PX: 610,             // 壁の右端。門中心(-79)で発火した時の画面右端(+561)を確実に覆う幅
                                    // (壁アセットv5は2304×1456=枠810×512。v4(2048)は暫定で横に伸びる)
    DOOR_TRIGGER_INSET: 55,         // 通用門のトリガーx（境界からの手前距離）。
                                    // 門洞中心=cornerX-79に対し、プレイヤー中心(=probe-24)が門中心に
                                    // 達した瞬間(probe=cornerX-55)に発火=門の正面に立ってから暗転する。
    SNAP_AFTER_PX: 850,             // 暗転中に壁の先へ置くプレイヤーx（境界基準、壁右端+240）
    POST_FADE_CAMERA_LAG: 380,      // 暗転明けのカメラ位置（プレイヤーの手前距離。壁が画面左に140px残る）
    SPAWN_BUFFER: 250,              // 角帯の敵/障害物スポーン禁止バッファ
    TRANSITION_FADE_MS: 400,
    TRANSITION_WAIT_MS: 650,
    TRANSITION_FADEIN_MS: 450,
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
