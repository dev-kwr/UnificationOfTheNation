// ============================================
// Unification of the Nation - 定数定義
// ============================================

import { readPhysicalScreen, computeScreenWidth } from './screenGeometry.js?v=screen-safe-20260812q';

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
        // 算出式は screenGeometry.js に集約（game.js の再読み込み案内が同じ式で
        // 「再計算しても値が変わるか」を判定するため）。
        const s = readPhysicalScreen();
        if (!s) return;
        SCREEN_WIDTH = computeScreenWidth(s, CANVAS_WIDTH, CANVAS_HEIGHT);
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
    STAGE_SELECT: 'stageSelect',   // 全体マップからの行き先選択（クリア演出→ここ→ステータス画面）
    SIDE_RESULT: 'sideResult',     // 寄り道(小判蔵/道場)の刻限切れ→結果発表
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
    // スティック中心からの相対配置（左下）。この相対関係は崩さない
    // ＝左端を揃えるときはポーズだけでなくスティックごと動かす
    // （ポーズだけ寄せるとスティックの円に食い込む）。
    PAUSE_BUTTON: { x: -104, y: 50 },

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
// uiScale / fontScale: HUD・仮想パッド・文字の物理サイズアンカー
// (screen_adaptation_plan.md §2.6)
//
// 実寸(css-px) = 論理px × スケール × fitScale なので、スケールを K/fitScale と
// 置くと「1論理px が常に K css-px に見える」。K がそのまま実寸の設計値になる。
//   - UI_SIZE_ANCHOR = 0.72: 幾何(パネル/ゲージ/ボタン)。従来値を踏襲。
//   - TEXT_SIZE_ANCHOR = 1.0: 文字。HUD 本文16論理px が 16css-px で見える。
// 幾何と文字を分けるのは、幾何を文字に合わせて上げると仮想パッドが画面を
// 覆い尽くすため（よろず屋が先に fs で採っていた手法の一般化）。
// 上限は幾何1.45／文字1.9。fitScale が UI_SIZE_ANCHOR 以上＝画面が十分大きい
// (iPad/PC)端末は両方 1.0 で従来とピクセル不変。
// game.js configureCanvasResolution が fitScale 確定のたびに更新する。
// ============================================
export const UI_SIZE_ANCHOR = 0.72;
export const TEXT_SIZE_ANCHOR = 1.0;
let _uiScale = 1;
let _fontScale = 1;
// 論理px → 実寸css-px の倍率。「実寸で何css-px に見せたいか」から論理px を
// 逆算する用途（デバッグメニューの行高など、収まりを実寸で設計したいとき）。
let _fitScale = 1;
export function getFitScale() { return _fitScale; }
export function setUiScaleFromFitScale(fitScale) {
    _fitScale = (Number.isFinite(fitScale) && fitScale > 0) ? fitScale : 1;
    const p = getDeviceProfile();
    const enlarge = (p.isTouchDevice || p.isMobileUA) && fitScale > 0 && fitScale < UI_SIZE_ANCHOR;
    _uiScale = enlarge ? Math.min(1.45, UI_SIZE_ANCHOR / fitScale) : 1.0;
    // 文字が幾何より小さくなることはない（1行の中でラベルだけ縮む事故を防ぐ）。
    _fontScale = enlarge ? Math.max(_uiScale, Math.min(1.9, TEXT_SIZE_ANCHOR / fitScale)) : 1.0;
}
export function getUiScale() { return _uiScale; }
export function getFontScale() { return _fontScale; }

// ============================================
// 画面端の退避量 ＝ 端末ディスプレイの角丸クリアランスのみ
// ============================================
// 退避の判断基準は「端末の角丸に食われないこと」だけ（ユーザー確定方針 2026-08-09）。
// 必要最小限だけ動かし、被らない位置にある要素は動かさない。
//
// env(safe-area-inset-*) は一律の配置退避には使わない。横向きの iOS は左右へ対称に
// 大きな値（実測 iPhone 16 Pro で左右とも 59css-px）を返すが、Dynamic Island は
// 片側の縦中央にしか無く、角丸回避に要る量（下記 16.8css-px）を遥かに超えて全UIを
// 内側へ押し込む。実際「画面下の操作ボタン・HUD が余分に内側へ寄った」と実機で
// 差し戻された。DOM側(#sound-gate 等)の env() 退避は別系統なのでそのまま。
//
// 角丸 R は JS から読めないため game.js 側で画面短辺から推定する（env() が 0 の
// Android でも角丸で欠けるため、推定は必須）。
// UI の配置は必ず getScreenSafeArea() を経由すること（描画と当たり判定の単一導出）。
let _cornerInsetX = 0;
let _cornerInsetY = 0;
export function setCornerInsets(xPx, yPx) {
    const px = (v) => (Number.isFinite(v) ? Math.max(0, v) : 0);
    _cornerInsetX = px(xPx);
    _cornerInsetY = px(yPx);
}
// UI を置いてよい内側矩形の各辺マージン（スクリーン論理px）。
export function getScreenSafeArea() {
    return {
        left: _cornerInsetX,
        right: _cornerInsetX,
        top: _cornerInsetY,
        bottom: _cornerInsetY,
    };
}

// ノッチ/Dynamic Island の帯幅（左右方向・スクリーン論理px）。env の実値。
// 横向きでは画面の縦中央にしか無いので、上下いっぱいに伸びる大きな要素
// （＝左上HUDパネル）だけが避ける必要がある。上の一律退避には混ぜないこと。
// game.js configureCanvasResolution が env を論理pxへ換算して設定する。
let _notchInsetX = 0;
export function setNotchInsetX(px) {
    _notchInsetX = Number.isFinite(px) ? Math.max(0, px) : 0;
}
export function getNotchInsetX() { return _notchInsetX; }

// 左上HUDパネルの自前左余白（論理px・uiScale 前）。ui.js の panelX と同値。
// 下の getUiLeftEdge が「角丸＋この余白」と「ノッチ帯」を比べるためここに置く。
export const HUD_PANEL_X = 26;

// 画面左に貼り付くUIの共通左端ライン（スクリーン論理px）。
// 左上HUDパネルの左端と、仮想パッドのポーズボタンの左端がここで揃う
// （揃っていないと実機で目立つ、という実機フィードバック 2026-08-09）。
// HUD は縦に大きく横向きの Dynamic Island 帯に掛かるため、その帯の外側が下限。
export function getUiLeftEdge() {
    return Math.max(_cornerInsetX + HUD_PANEL_X * _uiScale, _notchInsetX);
}

// 画面の縦いっぱいに広がるパネル（タイトルのデバッグウィンドウ等）の左右退避。
// 縦中央のノッチ帯に必ず掛かるうえ、横持ちの向きで帯が左右どちらにも来るため
// 両側とも避ける。下部パッドのような「帯に掛からないUI」には使わないこと。
export function getFullHeightSideInset() {
    return Math.max(_cornerInsetX, _notchInsetX);
}

// 右上BGMボタンを描いているか（デバッグウィンドウ表示中は隠す）の単一ソース。
// 描画(game.render)が毎フレーム申告し、判定(input.getBgmButtonHitArea)が読む。
// 隠しているのに判定だけ生きていると、メニュー項目を押したつもりが消音になる。
let _bgmButtonVisible = true;
export function setBgmButtonVisible(visible) { _bgmButtonVisible = !!visible; }
export function isBgmButtonVisible() { return _bgmButtonVisible; }

// 仮想パッド／タップUIを描く端末か（従来 ui.js にあった判定の単一ソース）。
// getPadLayout の BGM ボタン位置がこれで変わるため constants 側へ移した。
export function isTouchOverlayMode() {
    const p = getDeviceProfile();
    return p.isTouchDevice || p.isMobileUA || SCREEN_WIDTH <= 800;
}

// 仮想パッドが「実際に画面に描かれているか」の単一ソース。
// 描画(ui.js renderVirtualPad)が毎フレーム申告し、判定(input.js getTouchActions)が読む。
// タイトル/よろず屋/幕間などパッド非表示の画面では、見えないスティックやボタンの
// 当たり判定が生きたままになり、ボタン以外をクリック/タップすると難易度が変わる・
// カーソルが動く・そのまま出陣してしまう（＝押したはずの操作が無反応に見える）ため。
// game.js render() が毎フレーム false へ戻し、パッドを描いたフレームだけ true になる。
let _virtualPadVisible = false;
export function setVirtualPadVisible(visible) { _virtualPadVisible = !!visible; }
export function isVirtualPadVisible() { return _virtualPadVisible; }

// 仮想パッド幾何の単一導出。描画(ui.js)と判定(input.js)は必ずこれを読むこと
// （clamp式や座標式を両ファイルへ複製するとヒットと見た目が必ずズレる）。
// s=1 のとき全値が従来定数と数値同一＝ピクセル不変。
export function getPadLayout() {
    const s = _uiScale;
    const pad = VIRTUAL_PAD;
    // 下部パッド(スティック/ポーズ/攻撃/忍具/奥義/転身)は端の退避を一切かけない。
    // 自前のマージン(横 SAFE_MARGIN_X=150・下 BOTTOM_MARGIN=140 論理px、s倍)だけで
    // 既に角丸の外側にあるため（拡大時の実クリアランスは 0.72×76≒55css-px 一定、
    // 角丸R≒短辺11%≒44css-px より大きい）。実機でも「元の位置で問題なかった」。
    // 上端の BGM ボタンだけは画面端に貼り付くので角丸退避をかける。
    const safe = getScreenSafeArea();
    const bottomY = CANVAS_HEIGHT - pad.BOTTOM_MARGIN * s;
    const rightX = SCREEN_WIDTH - pad.SAFE_MARGIN_X * s;
    // 左側は「ポーズボタンの左端が画面左の共通ライン(getUiLeftEdge)に乗る」位置へ
    // クラスタごと寄せる。ポーズだけ寄せるとスティックの円に食い込むため
    // （実機で重なりを指摘された 2026-08-09）、相対配置は崩さない。
    // パッドを描かないPCは従来式のまま＝ピクセル不変。
    const stickX = isTouchOverlayMode()
        ? getUiLeftEdge() + (pad.PAUSE_BUTTON_RADIUS - pad.PAUSE_BUTTON.x) * s
        : (pad.SAFE_MARGIN_X + pad.STICK.x) * s;
    const stickY = bottomY + pad.STICK.y * s;
    // 操作ボタン群の右端ライン（＝画面端から 76*s）。BGMボタンの右揃え先。
    const padRightEdge = rightX + (pad.ATTACK.x + pad.ATTACK_BUTTON_RADIUS) * s;
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
        // ポーズはスティック相対（上の stickX が左端ラインを担保している）。
        pause:   { x: stickX + pad.PAUSE_BUTTON.x * s, y: stickY + pad.PAUSE_BUTTON.y * s, r: pad.PAUSE_BUTTON_RADIUS * s },
        attack:  { x: rightX + pad.ATTACK.x * s,     y: bottomY + pad.ATTACK.y * s,     r: pad.ATTACK_BUTTON_RADIUS * s },
        sub:     { x: rightX + pad.SUB_WEAPON.x * s, y: bottomY + pad.SUB_WEAPON.y * s, r: pad.AUX_BUTTON_RADIUS * s },
        special: { x: rightX + pad.SPECIAL.x * s,    y: bottomY + pad.SPECIAL.y * s,    r: pad.AUX_BUTTON_RADIUS * s },
        switch:  { x: rightX + pad.SWITCH.x * s,     y: bottomY + pad.SWITCH.y * s,     r: pad.AUX_BUTTON_RADIUS * s },
        // 右上のBGMボタンは操作ボタンの右端ライン(padRightEdge)へ揃える。
        // 攻撃(Z)と転身(C)は元から右揃え(26+48 = 36+38 = 74)なのでその線が右端。
        // パッドを描かない端末(PC)は揃える相手が居ないので従来の端マージン。
        bgm: {
            x: isTouchOverlayMode()
                ? padRightEdge - pad.BGM_BUTTON_RADIUS * s
                : SCREEN_WIDTH - safe.right - pad.BGM_BUTTON_MARGIN_RIGHT * s,
            y: safe.top + pad.BGM_BUTTON_MARGIN_TOP * s,
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
    ZONE_WIDTH: 9000,               // 一〜三巡目(周回登城)の各ゾーン幅。角=[9000,18000,27000]
    ARENA_WIDTH: 2880,              // 四巡目=大屋根アリーナの全幅。実体端480pxずつ+可動域1920px
                                    // (2048→2400→2880。決戦の可動域は1.5画面。屋根らしさは
                                    //  大棟の短さではなく左右の隅棟480pxで出す)
    ARENA_EDGE_INSET_PX: 480,       // 実体端=水平な大棟の端。反った隅棟の斜面は足場に含めない
    ARENA_LANDING_INSET_PX: 1000,   // 大棟の左端から内側へ。カメラのクランプ(=屋根の左外側)に
                                    // 張り付かない位置に降りることで、着地直後から歩けばスクロールする。
                                    // 560だと546px歩くまでカメラが動かず「スクロールしない」に見えた
    // 角3の登攀演出(鉤縄で頭上の軒へ):
    // 廻縁の突き当たりで足が止まる→鉤縄が軒の垂木に掛かる→引き上げられて屋根の上へ。
    // 忍者の身体能力の範囲で、建築的な嘘(廻縁から屋根への階段など)を作らない導線。
    // 4ビート構成: 振りかぶり → 飛ぶ → 噛む → 引き上げ。
    // 「噛んだ瞬間にたるみが消える1フレーム」が説得力の核なので BITE を独立させている。
    GRAPPLE_WINDUP_MS: 180,         // 振りかぶり(縄を後ろへ引き、鉤を溜める)
    GRAPPLE_ROPE_MS: 260,           // 鉤が飛ぶ(彗星リボンが伸びる)
    GRAPPLE_BITE_MS: 140,           // 噛んだ! 火花 + たるみが消えて張る
    GRAPPLE_PULL_MS: 520,           // 引き上げられて画面上へ消えるまで
    EAVE_WORLD_Y: 150,              // 軒先の先端(鉤が噛む高さ)の画面y
    EAVE_TIP_DX: -330,              // 角3の境界から最上重の軒先先端まで
    EAVE_HOOK_INSET: 16,            // 軒先から内側へ入った鉤の噛み位置
    EAVE_TRIGGER_INSET: 430,        // 角3専用。壁の手前で軒を見上げられる位置から発火
    FINAL_FRAME_LEFT_PX: 560,       // 角3統合アセットの境界より左側
    FINAL_FRAME_RIGHT_PX: 592,      // 角3統合アセットの境界より右側(合計1152=2304×0.5)
    WALL_LEFT_PX: 200,              // 壁の左端（境界からの距離）
    WALL_RIGHT_PX: 610,             // 壁の右端。門中心(-79)で発火した時の画面右端(+561)を確実に覆う幅
                                    // (壁アセットv5は2304×1456=枠810×512。v4(2048)は暫定で横に伸びる)
    DOOR_TRIGGER_INSET: 55,         // 通用門のトリガーx（境界からの手前距離）。
                                    // 門洞中心=cornerX-79に対し、プレイヤー中心(=probe-24)が門中心に
                                    // 達した瞬間(probe=cornerX-55)に発火=門の正面に立ってから暗転する。
    SNAP_AFTER_PX: 700,             // 暗転中に壁の先へ置くプレイヤーx（境界基準、壁右端+90）
    POST_FADE_CAMERA_LAG: 150,      // 暗転明けのカメラ位置（プレイヤーの手前距離）。
                                    // 小さいほどプレイヤーが画面左端寄りから始まる=進む余地が広い。
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
