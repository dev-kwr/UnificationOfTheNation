// ============================================
// Unification of the Nation - ボーナスステージ（小判蔵）
// ============================================
// 刻限60秒のスコアアタック。蔵の中の吹き抜けを、木箱の棚(一方通行足場)を
// 伝って上へ上へと登り、小判と最上部の千両箱を集める縦アスレチック。
// 時間切れで結果発表(game.beginSideResult)→獲得両がスコア。最高記録は
// saveGlobal(sideBest.bonus) に残る。何度でも挑める(記録更新が目的)。
//
// 塔は入るたびに手続き生成(buildTower)。固定配置だと数回で覚えて飽きるため。
// ジャンプ性能から到達可能性を保証したうえで、段数・高さ・幅・動く棚を散らす。
//
// カメラ: 横は固定(maxProgress=CANVAS_WIDTH で scrollX は常に0)。縦は
// game.updateCameraLift の stage フック(useFeetCameraLift +
// getCameraMinVisTop)で【プレイヤーが画面の上下中央】に来るよう追い、
// 頂き(getCameraMinVisTop)と床でだけ止まる。
//
// Stage 互換の軽量クラス(isCleared()常false)。終了は isTimeUp() を
// game.updatePlaying が見る。
//
// 画像: images/bonus_kura_*.png（Codex/gpt-image 生成。読めない環境では
// コード描画にフォールバック）。

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET } from './constants.js?v=screen-safe-20260818f';
import { audio } from './audio.js?v=screen-safe-20260818f';
import { getImage } from './imageCache.js?v=screen-safe-20260818f';
import { drawKobanImage } from './ui.js?v=screen-safe-20260818f';
import { pushGain, updateGainPops, renderGainPops, tickTimeLimit, clampToLeftEdge } from './sideStageCommon.js?v=screen-safe-20260818f';

// 小判1枚の価値（両）。よろず屋の相場に合わせてここだけで調整する。
const KOBAN_VALUE = 10;
// 千両箱（塔の頂上）。登り切ったご褒美。
const CHEST_VALUE = 300;
// 刻限（秒）
const TIME_LIMIT_SEC = 60;
// 木箱1個の見た目サイズ。棚は箱を横に並べて描く。
const CRATE_SIZE = 96;

// 開始前に読み込む画像（game.requestStageStart が本編と同じ暗幕待ちに使う）
export const BONUS_STAGE_IMAGES = [
    'images/bonus_kura_bg.png',          // 0: 1階の壁（床の絵と暗がり）
    'images/bonus_kura_floor.png',       // 1: 床の板張り
    'images/bonus_kura_crate.png',       // 2: 木箱（棚）
    'images/bonus_kura_chest.png',       // 3: 千両箱
    'images/bonus_kura_wall_upper.png'   // 4: 上層の壁（縦横タイル）
];

function getAsset(index) {
    const img = getImage(BONUS_STAGE_IMAGES[index]);
    return (img && img.complete && img.naturalWidth) ? img : null;
}

// --- 塔の型（5パターンのローテーション） ------------------------------
// 完全ランダムだと小判が増えすぎ、構成の良し悪しも揺れた(実機フィードバック
// 2026-08-11)。手で組んだ5つの型から入るたびに1つ選ぶ。どれも
// 「縦の段差 ≦145 / 横の隙間 ≦215 / 画面内」を満たすよう設計してあり、
// 変更したら scratch/design_towers.mjs で再検証すること
// (単発ジャンプ=高さ160px・水平240px、2段=282px・384px から引いた上限)。
//
// 【段差は共通の刻み表(TOWER_STEPS)から出す】。14段・段差115の一定刻みでは
// 60秒に対して塔が短く、登りも単調で緩かった(実機フィードバック 2026-08-12)。
// 19段へ伸ばし、下は112・上は145と登るほど詰めて難度を上げる。
//
// 最下段だけは dy = -CRATE_SIZE ＝【木箱の底が足元レーンに接する高さ】。
// 中途半端な高さだと箱が床の上に浮き、背景の絵へ減り込んで見えた。
// 刻みは「普」の値。難易度で stepScale が掛かる(buildTower)。
const TOWER_STEPS = [112, 118, 122, 126, 130, 132, 134, 136, 138, 140, 141, 142, 142, 143, 143, 144, 144, 145];

// 各行: [x, 木箱の数, 動く棚の設定?]（高さは TOWER_STEPS を積んだ行番号ぶん）
const TOWER_PATTERNS = [
    // ジグザグ: 左右へ大きく振る素直な塔
    [
        [140, 3], [620, 2], [1000, 2], [590, 3], [210, 2],
        [560, 2, { amp: 140, period: 4.2 }], [940, 2], [560, 3], [200, 2],
        [560, 2, { amp: 170, period: 3.6 }], [960, 2], [590, 3], [200, 2],
        [560, 2, { amp: 150, period: 4.0 }], [980, 2], [620, 2], [240, 2],
        [600, 2, { amp: 160, period: 3.7 }], [500, 4]
    ],
    // 螺旋: 左→右へ一方向に流れ、上で折り返す
    [
        [110, 3], [420, 2], [730, 2], [1010, 2], [760, 2],
        [430, 2, { amp: 150, period: 4.0 }], [110, 3], [430, 2], [750, 2],
        [1000, 2], [700, 2], [390, 2], [690, 2, { amp: 150, period: 4.0 }],
        [1000, 2], [690, 2], [380, 2], [110, 2], [400, 2, { amp: 140, period: 4.3 }], [420, 4]
    ],
    // 中央軸: 足場が中央に集まり、細かい踏み替えが続く
    [
        [500, 3], [290, 2], [600, 2], [370, 2, { amp: 180, period: 3.8 }],
        [270, 2], [560, 2], [430, 3], [290, 2], [590, 2],
        [390, 2, { amp: 200, period: 3.2 }], [300, 2], [560, 2], [320, 2],
        [580, 2], [300, 2], [560, 2, { amp: 170, period: 3.5 }], [280, 2], [540, 2], [430, 4]
    ],
    // 両翼: 左右の壁沿いを大きく渡る
    [
        [80, 3], [560, 3], [960, 2], [600, 2], [200, 2],
        [520, 2, { amp: 190, period: 3.6 }], [940, 2], [600, 2], [200, 2],
        [560, 2], [940, 2], [610, 2], [210, 2],
        [560, 2, { amp: 180, period: 3.4 }], [980, 2], [620, 2], [220, 2], [560, 2], [540, 4]
    ],
    // 吊り棚づくし: 動く棚が多く、渡りの見極めが要る
    [
        [170, 3], [600, 2], [980, 2], [560, 2, { amp: 160, period: 4.4 }],
        [180, 2], [560, 2, { amp: 180, period: 3.8 }], [930, 2], [600, 2],
        [210, 2], [560, 2, { amp: 200, period: 3.4 }], [950, 2],
        [600, 2, { amp: 170, period: 3.9 }], [190, 2], [540, 2, { amp: 190, period: 3.3 }],
        [940, 2], [590, 2, { amp: 150, period: 4.1 }], [200, 2], [560, 2, { amp: 180, period: 3.6 }], [500, 4]
    ]
];

// --- 難易度 ---------------------------------------------------------
// 蔵には敵も障害物も居ないので、difficulty の damageMult / hpMult は一切効かない
// (適用先は enemy.js と boss.js だけ)。易/普/難で中身が完全に同じなのに記録だけ
// 3つに分かれていたので、蔵に効く軸をここで持つ。
//
//   stepScale  段差の刻み。上限145(単発ジャンプ160から引いた到達保証)を超えない範囲で
//   ampScale   吊り棚の振れ幅。画面内(0..CANVAS_WIDTH)へクランプする
//   periodScale 吊り棚の周期。小さいほど速い
//   valueScale 小判1枚の価値。難いほど1枚が高い＝上を目指す価値が出る
//
// 段差は普で既に上限へ張り付いているので、難は段差ではなく【吊り棚】で上げる。
const BONUS_DIFFICULTY = {
    easy:   { stepScale: 0.86, ampScale: 0.70, periodScale: 1.22, valueScale: 0.8 },
    normal: { stepScale: 1.00, ampScale: 1.00, periodScale: 1.00, valueScale: 1.0 },
    hard:   { stepScale: 1.00, ampScale: 1.28, periodScale: 0.80, valueScale: 1.4 },
};
const TOWER_STEP_MAX = 145;

export function getBonusDifficultyTuning(difficultyId) {
    return BONUS_DIFFICULTY[difficultyId] || BONUS_DIFFICULTY.normal;
}

function buildTower(laneY, tuning) {
    const rows = TOWER_PATTERNS[Math.floor(Math.random() * TOWER_PATTERNS.length)];
    // 段差は刻み表から積み直す(易だけ緩む。普/難は据え置き＝上限に張り付いている)
    const dy = [-CRATE_SIZE];
    for (const step of TOWER_STEPS) {
        const scaled = Math.min(TOWER_STEP_MAX, Math.round(step * tuning.stepScale));
        dy.push(dy[dy.length - 1] - scaled);
    }
    return rows.map(([x, crates, move], index) => {
        const width = crates * CRATE_SIZE;
        let scaledMove = null;
        if (move) {
            // 振れ幅は画面内に収まる範囲でだけ広げる(左右どちらかがはみ出す型がある)
            const room = Math.min(x, CANVAS_WIDTH - (x + width));
            const amp = Math.max(0, Math.min(Math.round(move.amp * tuning.ampScale), room));
            scaledMove = {
                amp,
                period: move.period * tuning.periodScale,
                // 位相だけは毎回ずらす(同じ型でも吊り棚の位置関係が変わる)
                phase: Math.random() * Math.PI * 2
            };
        }
        return { x, y: laneY + dy[index], crates, width, move: scaledMove };
    });
}

// 高さ帯ごとの小判の価値。登るほど実入りが増え、上を目指す動機になる。
// 塔の高さは毎回変わるので、絶対値ではなく【塔全体に対する割合】で決める。
const HEIGHT_TIERS = [
    { above: 0.62, mult: 3 },
    { above: 0.3, mult: 2 },
    { above: 0, mult: 1 }
];

export class BonusStage {
    constructor(difficultyId = 'normal') {
        // 難易度は【塔の組み方と小判の価値】に効く。敵が居ないので
        // damageMult / hpMult は蔵には一切届かない。
        this.difficultyId = difficultyId;
        const tuning = getBonusDifficultyTuning(difficultyId);
        this.difficultyTuning = tuning;
        this.stageNumber = 0;          // 本編の stage 番号分岐(===3/5/6 等)をすべて回避する値
        this.name = '小判蔵';          // HUD右上のステージ名がこれを読む
        this.sideKind = 'bonus';       // 結果発表(beginSideResult)のスコア種別
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        this.maxProgress = CANVAS_WIDTH;   // 横は固定画面（カメラは縦だけ動く）
        this.progress = 0;
        this.lastProgress = 0;
        this.obstacles = [];
        this.boss = null;
        this.bossSpawned = false;
        this.bossDefeated = false;
        this.bossEncounterBlend = 0;
        this.skyVisTop = 0;
        this.isFloorTransitioning = false;
        this.useFeetCameraLift = true;   // カメラはプレイヤーを画面中央に置いて追う

        this.timeLeft = TIME_LIMIT_SEC;
        this.timeLimit = TIME_LIMIT_SEC;   // HUD の残量バーが総量として読む
        this.scoreValue = 0;           // 獲得両の合計（結果発表のスコア）
        this._timeUp = false;
        this.time = 0;                 // 演出用の経過時間

        const laneY = this.groundY + LANE_OFFSET;

        // 棚（描画用）と一方通行コライダー（上面のみ）。
        // 動く棚は毎フレーム x を書き換え、同じ値をコライダーにも書き戻す
        // (描画と判定を一つの値から出す。別々に計算するとすり抜ける)。
        this.shelves = buildTower(laneY, tuning).map((s) => ({
            baseX: s.x,
            x: s.x,
            y: s.y,
            crates: s.crates,
            width: s.width,
            move: s.move
        }));
        this.platformColliders = this.shelves.map((s) => ({
            x: s.x,
            y: s.y,
            width: s.width,
            height: 12,
            isDestroyed: false,
            isOneWayPlatform: true
        }));
        const topShelf = this.shelves[this.shelves.length - 1];
        this._topY = topShelf.y;

        // 千両箱: 頂上の棚の中央。baseY(棚の天面)を正本にして、描画は絵の縦横比から
        // 高さを出して baseY へ座らせる。y は取得判定の中心にだけ使う。
        this.chest = {
            x: topShelf.x + topShelf.width * 0.5,
            baseY: topShelf.y,
            y: topShelf.y - 42,
            taken: false,
            phase: 0
        };

        // 小判: 地上の列 + 各棚の上 + 棚間の空中（ジャンプの弧）。
        // value は高さ帯で決まる(上ほど高い)。動く棚の上の小判は棚と一緒に動く。
        this.kobans = [];
        const towerH = Math.max(1, laneY - this._topY);
        const valueAt = (y) => {
            const ratio = (laneY - y) / towerH;
            const tier = HEIGHT_TIERS.find((t) => ratio > t.above) || HEIGHT_TIERS[HEIGHT_TIERS.length - 1];
            // 難易度で1枚の値打ちが変わる（難いほど高い＝上を目指す価値）
            return Math.max(1, Math.round(KOBAN_VALUE * tier.mult * tuning.valueScale));
        };
        const addKoban = (x, y, shelfIndex = -1) => {
            this.kobans.push({
                x, y,
                offsetX: shelfIndex >= 0 ? x - this.shelves[shelfIndex].baseX : 0,
                shelfIndex,
                value: valueAt(y),
                taken: false,
                phase: (this.kobans.length * 0.7) % (Math.PI * 2)
            });
        };
        // 地上は5枚だけ(走り出しの合図)。面に置く=浮かせない(実機フィードバック)。
        // 最下段の木箱は床に接しているので、その足元は避けて置く
        // (等間隔で並べると箱の中に隠れて見えない小判ができる)。
        const bottomShelf = this.shelves[0];
        const blocked = { left: bottomShelf.baseX - 24, right: bottomShelf.baseX + bottomShelf.width + 24 };
        const freeSpans = [
            { from: 120, to: Math.min(1160, blocked.left) },
            { from: Math.max(120, blocked.right), to: 1160 }
        ].filter((span) => span.to - span.from > 60);
        const totalFree = freeSpans.reduce((sum, span) => sum + (span.to - span.from), 0);
        let placed = 0;
        for (const span of freeSpans) {
            const share = Math.round(5 * (span.to - span.from) / Math.max(1, totalFree));
            const n = Math.min(share, 5 - placed);
            for (let i = 0; i < n; i++) {
                addKoban(span.from + (span.to - span.from) * ((i + 1) / (n + 1)), laneY - 14);
                placed++;
            }
        }
        for (let i = placed; i < 5 && freeSpans.length > 0; i++) {
            const span = freeSpans[freeSpans.length - 1];
            addKoban(span.from + (span.to - span.from) * ((i - placed + 1) / 6), laneY - 14);
        }
        for (let si = 0; si < this.shelves.length; si++) {
            // 頂上の棚は千両箱の座。小判を置くと箱と重なって何があるのか読めない
            // (実機フィードバック 2026-08-11)
            if (si === this.shelves.length - 1) continue;
            const s = this.shelves[si];
            // 棚あたり1〜2枚。広い棚だけ2枚に増やす
            const n = s.crates >= 3 ? 2 : 1;
            for (let k = 0; k < n; k++) {
                addKoban(s.baseX + s.width * ((k + 1) / (n + 1)), s.y - 14, s.move ? si : -1);
            }
        }
        // 棚間の空中（隣の棚へ跳ぶ弧の頂点あたり）。動く棚が絡む区間と、
        // 一段おきに限って置く(全部に置くと数が倍になる)
        for (let si = 0; si + 1 < this.shelves.length; si += 2) {
            const a = this.shelves[si], b = this.shelves[si + 1];
            if (a.move || b.move) continue;
            addKoban((a.baseX + a.width * 0.5 + b.baseX + b.width * 0.5) * 0.5, Math.min(a.y, b.y) - 66);
        }
        // 行灯: 棚の脇の壁に掛かる灯り。登る道筋が縦に連なって見えるようにし、
        // 真っ暗な吹き抜けに手掛かりを与える(2段おきに左右へ振り分ける)。
        this.lanterns = [];
        for (let si = 1; si < this.shelves.length; si += 2) {
            const s = this.shelves[si];
            const onLeft = (si % 4 === 1);
            this.lanterns.push({
                x: onLeft ? Math.max(52, s.baseX - 74) : Math.min(CANVAS_WIDTH - 52, s.baseX + s.width + 74),
                y: s.y - 46,
                phase: si * 1.7
            });
        }

        this.collected = 0;
        this.totalKobans = this.kobans.length;
        // 獲得演出: HUD のカウントアップ用(直近の加算)と、拾った位置から浮く「+n両」
        this.lastGain = null;
        this.gainPops = [];
        // 蔵浚え(すべて拾い切った)後の褒美: タイムアップまで小判が降り続ける。
        // 塔が短く感じる回でも、残り時間が「降る小判を追う時間」になる。
        this.rainKobans = [];
        this.rainDust = [];
        this._rainMode = false;
        this._rainTimer = 0;
    }

    // --- Stage 互換の界面（PLAYING ループが呼ぶ） ---
    getAllEnemies() { return []; }
    getShadowCasters() { return []; }
    isCleared() { return false; }
    isStage6Grappling() { return false; }
    getPlatformColliders() { return this.platformColliders; }
    isTimeUp() { return this._timeUp; }
    getScore() { return this.scoreValue; }
    getHudTimerSec() { return this.timeLeft; }
    // 縦カメラの上限: 頂上の棚に立った時に頭上へ余白が残る高さまで
    getCameraMinVisTop() { return this._topY - 260; }

    // 可視域(ワールドy)。塔は高さ1400px超に対し画面は720px弱なので、
    // 棚も小判も大半が画面外にある。描画側はこの窓で間引く。
    getVisibleBand(margin = 120) {
        const top = this.skyVisTop - margin;
        return { top, bottom: this.skyVisTop + CANVAS_HEIGHT + margin };
    }

    update(deltaTime, player) {
        if (!player) return;
        this.time += deltaTime;
        updateGainPops(this, deltaTime);
        clampToLeftEdge(player);
        if (tickTimeLimit(this, deltaTime)) return;

        // 動く棚(吊り棚)を進める。描画・当たり判定・棚上の小判は同じ x から出す。
        for (let i = 0; i < this.shelves.length; i++) {
            const s = this.shelves[i];
            if (!s.move) continue;
            s.x = s.baseX + Math.sin(this.time * (Math.PI * 2 / s.move.period) + s.move.phase) * s.move.amp;
            this.platformColliders[i].x = s.x;
        }
        for (const k of this.kobans) {
            if (k.shelfIndex >= 0) k.x = this.shelves[k.shelfIndex].x + k.offsetX;
        }
        // 動く棚に乗っている間は一緒に運ぶ(足元だけ滑って置いていかれるのを防ぐ)
        if (player.isGrounded) {
            const feetY = player.y + player.getWorldHeight();
            const pxMid = player.x + player.getWorldWidth() * 0.5;
            for (let i = 0; i < this.shelves.length; i++) {
                const s = this.shelves[i];
                if (!s.move) continue;
                if (Math.abs(feetY - s.y) > 6) continue;
                if (pxMid < s.x - 8 || pxMid > s.x + s.width + 8) continue;
                const prev = s._prevX !== undefined ? s._prevX : s.x;
                player.x += s.x - prev;
                break;
            }
        }
        for (const s of this.shelves) { if (s.move) s._prevX = s.x; }

        const px = player.x + player.getWorldWidth() * 0.5;
        const py = player.y + player.getWorldHeight() * 0.5;
        // 拾い手は【本体＋生きている分身】。奥義を使うと分身が塔を散って登るので、
        // 本体の座標だけで判定すると「分身が触れているのに取れない」ことになる
        // (実機フィードバック 2026-08-11)。
        const pickers = this.getKobanPickers(player, px, py);
        for (const k of this.kobans) {
            if (k.taken) continue;
            if (!this.touchesAny(pickers, k.x, k.y, 48)) continue;
            k.taken = true;
            this.collected++;
            this.grantScore(player, k.value, k.x, k.y);
        }
        if (this.chest && !this.chest.taken) {
            this.chest.phase += deltaTime * 3;
            if (this.touchesAny(pickers, this.chest.x, this.chest.y, 74)) {
                this.chest.taken = true;
                const chestValue = Math.max(1, Math.round(CHEST_VALUE * this.difficultyTuning.valueScale));
                this.grantScore(player, chestValue, this.chest.x, this.chest.y);
            }
        }

        // 蔵浚え達成 → 降り注ぎモード開始
        if (!this._rainMode && this.collected >= this.totalKobans && this.chest && this.chest.taken) {
            this._rainMode = true;
            this._rainTimer = 0.5;
        }
        if (this._rainMode) this.updateRain(deltaTime, player, px, py, pickers);
    }

    // 小判を拾える点(ワールド座標の中心)を集める。本体は常に1つ目。
    // 分身は奥義中だけ現れ、getSpecialCloneAnchors() が足元ではなく
    // 【中心】のアンカーを返すので、本体と同じ基準で比べられる。
    getKobanPickers(player, px, py) {
        const pts = [{ x: px, y: py }];
        if (!player.isUsingSpecial || typeof player.getSpecialCloneAnchors !== 'function') return pts;
        const anchors = player.getSpecialCloneAnchors() || [];
        for (const a of anchors) {
            if (!a || a.alpha === 0) continue;
            if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
            pts.push({ x: a.x, y: a.y });
        }
        return pts;
    }

    touchesAny(pickers, x, y, radius) {
        for (const p of pickers) {
            if (Math.hypot(p.x - x, p.y - y) < radius) return true;
        }
        return false;
    }

    // 降り注ぐ小判。ただ落とすと無機質なので「舞い落ちて弾む」までを演出する:
    //   ①上空に光の筋(予兆) → ②木の葉のように左右へ揺れながら回転して落ちる
    //   → ③着地で1回小さく弾む → ④埃が立つ → ⑤面の上で余韻の揺り戻し
    // 一度に1枚ずつではなく2〜3枚を少しずらして降らせ、「降り注ぐ」量感を出す。
    updateRain(deltaTime, player, px, py, pickers = [{ x: px, y: py }]) {
        const laneY = this.groundY + LANE_OFFSET;
        this._rainTimer -= deltaTime;
        if (this._rainTimer <= 0) {
            this._rainTimer = 0.9 + Math.random() * 0.35;
            const burst = 2 + Math.floor(Math.random() * 2);   // 一度に2〜3枚
            for (let i = 0; i < burst; i++) this.spawnRainKoban(player, px, py, laneY, i * 0.16);
        }

        for (const rk of this.rainKobans) {
            if (rk.taken) continue;
            rk.age += deltaTime;
            if (rk.delay > 0) { rk.delay -= deltaTime; continue; }

            if (!rk.landed) {
                // 空気を含んだ落ち方: 終端速度で頭打ちにし、左右へ揺らす
                rk.vy = Math.min(rk.vy + 900 * deltaTime, 430);
                rk.y += rk.vy * deltaTime;
                rk.swayPhase += deltaTime * rk.swaySpeed;
                rk.x = rk.baseX + Math.sin(rk.swayPhase) * rk.swayAmp;
                rk.spin += deltaTime * rk.spinSpeed;
                if (rk.y >= rk.landY) {
                    rk.y = rk.landY;
                    if (rk.bounces > 0) {
                        // 1回だけ小さく弾む
                        rk.bounces--;
                        rk.vy = -rk.vy * 0.32;
                        rk.y = rk.landY - 1;
                        this.spawnLandingDust(rk.x, rk.landY);
                    } else {
                        rk.landed = true;
                        rk.vy = 0;
                        rk.settle = 1;
                        this.spawnLandingDust(rk.x, rk.landY);
                    }
                }
            } else {
                // 着地後: 揺り戻しが減衰し、面に落ち着く
                rk.settle = Math.max(0, rk.settle - deltaTime * 3.2);
                rk.spin += deltaTime * rk.spinSpeed * rk.settle * 0.5;
            }

            if (this.touchesAny(pickers, rk.x, rk.y, 48)) {
                rk.taken = true;
                this.grantScore(player, rk.value, rk.x, rk.y);
            }
        }

        // 埃の寿命
        for (let i = this.rainDust.length - 1; i >= 0; i--) {
            const d = this.rainDust[i];
            d.life -= deltaTime;
            d.x += d.vx * deltaTime;
            d.y += d.vy * deltaTime;
            d.vy += 120 * deltaTime;
            if (d.life <= 0) this.rainDust.splice(i, 1);
        }

        // 拾い終えたものは間引く(配列を無限に伸ばさない)
        if (this.rainKobans.length > 90) {
            this.rainKobans = this.rainKobans.filter((rk) => !rk.taken);
        }
    }

    spawnRainKoban(player, px, py, laneY, delay) {
        const x = Math.max(60, Math.min(CANVAS_WIDTH - 60, px + (Math.random() * 2 - 1) * 420));
        // 着地面は【プレイヤーと同じ高さ帯】から選ぶ。単純に一番高い棚へ載せると
        // 塔の上へ行ってしまい、床で待つプレイヤーには取れない(検証で発覚)。
        const feet = player.y + player.getWorldHeight();
        let landY = laneY - 14;
        let best = Infinity;
        for (const s of this.shelves) {
            if (x >= s.x - 4 && x <= s.x + s.width + 4 && s.y >= feet - 30 && s.y < best) best = s.y;
        }
        if (best < Infinity) landY = best - 14;
        this.rainKobans.push({
            x,
            baseX: x,
            y: Math.min(py, landY) - 560 - Math.random() * 160,
            vy: 40 + Math.random() * 60,
            landY,
            delay,
            age: 0,
            swayPhase: Math.random() * Math.PI * 2,
            swaySpeed: 2.0 + Math.random() * 1.4,
            swayAmp: 16 + Math.random() * 18,
            spin: 0,
            spinSpeed: (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 1.2),
            bounces: 1,
            landed: false,
            settle: 0,
            value: Math.max(1, Math.round(KOBAN_VALUE * (1 + Math.floor(Math.random() * 3)) * this.difficultyTuning.valueScale)),   // 普で 10/20/30
            taken: false
        });
    }

    // 着地の埃。舞い上がって落ちる小さな粒。
    spawnLandingDust(x, y) {
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.9;
            const sp = 40 + Math.random() * 70;
            this.rainDust.push({
                x, y: y + 6,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp * 0.7,
                life: 0.32 + Math.random() * 0.2,
                r: 1.4 + Math.random() * 1.8
            });
        }
    }

    // 加算を1か所に集約。HUD のカウントアップ演出(lastGain)と、拾った場所から
    // 湧く「+n両」の浮き文字(gainPops)もここで積む。
    grantScore(player, value, x, y) {
        this.scoreValue += value;
        if (typeof player.setMoney === 'function') player.setMoney(player.money + value);
        else player.money = (player.money || 0) + value;
        audio.playMoney();
        pushGain(this, value, x, y);
    }

    // --- 描画（renderPlaying から呼ばれる。ctx はワールド変換済み） ---
    renderBackground(ctx) {
        const visTop = this.skyVisTop;
        ctx.save();

        // 1階の壁(bg画像)。横幅に合わせて1枚だけ、絵の下端を画面下端(床帯)に揃える。
        const bg = getAsset(0);
        const bgH = bg ? CANVAS_WIDTH * (bg.naturalHeight / bg.naturalWidth) : Math.round(CANVAS_HEIGHT * (2 / 3));
        const bgTop = CANVAS_HEIGHT - bgH;
        if (bg) {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(bg, 0, bgTop, CANVAS_WIDTH, bgH);
        } else {
            ctx.fillStyle = '#241e15';
            ctx.fillRect(0, bgTop, CANVAS_WIDTH, bgH);
        }

        // 上層の壁: bg の上端から可視上端まで、壁テクスチャを縦横タイル。
        // タイルの縦境界に梁(横木)を重ねて継ぎ目を隠す。
        if (visTop < bgTop) {
            const wall = getAsset(4);
            const tile = 640;               // 表示タイルサイズ(1024→0.625倍)。横2枚=1280
            const firstBand = Math.floor((visTop - bgTop) / tile);
            for (let band = firstBand; band < 0; band++) {
                const y = bgTop + band * tile;
                for (let cx = 0; cx < CANVAS_WIDTH; cx += tile) {
                    if (wall) {
                        ctx.imageSmoothingEnabled = true;
                        const mirror = (((cx / tile + band) % 2) + 2) % 2 === 1;
                        if (mirror) {
                            ctx.save();
                            ctx.translate(cx + tile, y);
                            ctx.scale(-1, 1);
                            ctx.drawImage(wall, 0, 0, tile, tile);
                            ctx.restore();
                        } else {
                            ctx.drawImage(wall, cx, y, tile, tile);
                        }
                    } else {
                        ctx.fillStyle = '#1c1710';
                        ctx.fillRect(cx, y, tile, tile);
                        ctx.fillStyle = '#2c2318';
                        ctx.fillRect(cx + 200, y, 26, tile);
                        ctx.fillRect(cx + 520, y, 26, tile);
                    }
                }
                // 梁（タイル境界の継ぎ目隠し + 蔵の構造の見立て）
                ctx.fillStyle = '#181008';
                ctx.fillRect(0, y - 8, CANVAS_WIDTH, 16);
                ctx.fillStyle = 'rgba(214, 186, 120, 0.08)';
                ctx.fillRect(0, y - 8, CANVAS_WIDTH, 2);
            }
        }

        // 行灯の光溜まり（壁側に描くので背景層。灯体そのものは renderGround で描く）
        const lampBand = this.getVisibleBand(260);
        for (const l of this.lanterns) {
            if (l.y < lampBand.top || l.y > lampBand.bottom) continue;
            const flick = 0.9 + Math.sin(this.time * 6 + l.phase) * 0.1;
            const glow = ctx.createRadialGradient(l.x, l.y, 8, l.x, l.y, 230);
            glow.addColorStop(0, `rgba(255, 206, 130, ${(0.28 * flick).toFixed(3)})`);
            glow.addColorStop(0.45, `rgba(255, 186, 104, ${(0.09 * flick).toFixed(3)})`);
            glow.addColorStop(1, 'rgba(255, 186, 104, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(l.x - 240, l.y - 240, 480, 480);
        }

        // 頂上の月明かり: 千両箱の上から降る淡い光溜まり（登る先を示す灯）
        if (this.chest) {
            const cx = this.chest.x;
            const flick = 0.16 + Math.sin(this.time * 1.3) * 0.02;
            const topGlow = ctx.createRadialGradient(cx, this._topY - 120, 20, cx, this._topY - 120, 460);
            topGlow.addColorStop(0, `rgba(214, 226, 255, ${flick.toFixed(3)})`);
            topGlow.addColorStop(1, 'rgba(214, 226, 255, 0)');
            ctx.fillStyle = topGlow;
            ctx.fillRect(cx - 470, this._topY - 590, 940, 940);
        }

        // 降る小判に光の筋は敷かない。fillRect の左右と下が硬い縁として残り、
        // 「小判に長方形がくっついている」ように見えた(実機フィードバック 2026-08-11)。
        // 落下の手掛かりは小判自身の落ち影(renderKobans)で足りている。

        // 全体をわずかに沈めて手前の小判を立てる
        ctx.fillStyle = 'rgba(6, 5, 3, 0.14)';
        ctx.fillRect(0, visTop - 8, CANVAS_WIDTH, CANVAS_HEIGHT * 4);
        ctx.restore();
    }

    renderGround(ctx) {
        ctx.save();
        this.renderFloor(ctx);
        this.renderLanterns(ctx);
        this.renderShelves(ctx);
        this.renderChest(ctx);
        this.renderKobans(ctx);
        renderGainPops(ctx, this, { stroke: 'rgba(24, 14, 2, 0.85)', fill: '#f0d78a', bigFill: '#ffd970' });
        ctx.restore();
    }

    // 行灯の灯体（壁掛けの木枠と障子。光溜まりは renderBackground 側）
    renderLanterns(ctx) {
        const band = this.getVisibleBand(80);
        for (const l of this.lanterns) {
            if (l.y < band.top || l.y > band.bottom) continue;
            const flick = 0.9 + Math.sin(this.time * 6 + l.phase) * 0.1;
            const w = 26, h = 34;
            const x = l.x - w / 2, y = l.y - h / 2;
            // 壁の掛け金
            ctx.fillStyle = '#2a1f12';
            ctx.fillRect(l.x - 2, y - 12, 4, 12);
            // 障子（灯る面）
            ctx.fillStyle = `rgba(255, 226, 158, ${(0.86 * flick).toFixed(3)})`;
            ctx.fillRect(x, y, w, h);
            // 木枠
            ctx.strokeStyle = '#3a2a17';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(58, 42, 23, 0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
            ctx.moveTo(l.x, y); ctx.lineTo(l.x, y + h);
            ctx.stroke();
            // 屋根と台
            ctx.fillStyle = '#241a0f';
            ctx.fillRect(x - 5, y - 5, w + 10, 6);
            ctx.fillRect(x - 4, y + h - 1, w + 8, 5);
        }
    }

    // 床（板張り）。固定画面なのでスクロール補正なしで敷く（ミラータイル）。
    renderFloor(ctx) {
        const floorTop = this.groundY - 2;
        const img = getAsset(1);
        if (img) {
            const drawH = CANVAS_HEIGHT - floorTop + 24;
            const drawW = Math.max(120, img.naturalWidth * (drawH / img.naturalHeight));
            for (let i = 0; i * drawW < CANVAS_WIDTH + 40; i++) {
                const dx = i * drawW;
                if (i % 2 === 1) {
                    ctx.save();
                    ctx.translate(dx + drawW, 0);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img, 0, floorTop, drawW, drawH);
                    ctx.restore();
                } else {
                    ctx.drawImage(img, dx, floorTop, drawW, drawH);
                }
            }
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-40, floorTop + 1);
            ctx.lineTo(CANVAS_WIDTH + 40, floorTop + 1);
            ctx.stroke();
            const shade = ctx.createLinearGradient(0, floorTop, 0, floorTop + drawH);
            shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
            shade.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
            ctx.fillStyle = shade;
            ctx.fillRect(-40, floorTop, CANVAS_WIDTH + 80, drawH);
            return;
        }
        // フォールバック
        const grad = ctx.createLinearGradient(0, floorTop, 0, CANVAS_HEIGHT + 220);
        grad.addColorStop(0, '#3a2d1c');
        grad.addColorStop(1, '#17110a');
        ctx.fillStyle = grad;
        ctx.fillRect(-40, floorTop, CANVAS_WIDTH + 80, CANVAS_HEIGHT);
    }

    // 棚 = 木箱を横に並べた足場。位置で時々反転させ単調さを消す。
    // 生成画像は箱の周囲に黒マージンがあるため、ソース矩形で箱本体だけを切り出す。
    renderShelves(ctx) {
        const img = getAsset(2);
        const srcInsetX = img ? img.naturalWidth * 0.035 : 0;
        const srcInsetTop = img ? img.naturalHeight * 0.055 : 0;
        const srcW = img ? img.naturalWidth - srcInsetX * 2 : 0;
        const srcH = img ? img.naturalHeight - srcInsetTop - img.naturalHeight * 0.02 : 0;
        const band = this.getVisibleBand(CRATE_SIZE + 40);
        for (const s of this.shelves) {
            if (s.y + CRATE_SIZE < band.top || s.y > band.bottom) continue;   // 画面外は描かない
            for (let c = 0; c < s.crates; c++) {
                const bx = s.x + c * CRATE_SIZE;
                if (img) {
                    ctx.imageSmoothingEnabled = true;
                    if ((c + Math.round(s.y / CRATE_SIZE)) % 2 === 1) {
                        ctx.save();
                        ctx.translate(bx + CRATE_SIZE, s.y);
                        ctx.scale(-1, 1);
                        ctx.drawImage(img, srcInsetX, srcInsetTop, srcW, srcH, 0, 0, CRATE_SIZE, CRATE_SIZE);
                        ctx.restore();
                    } else {
                        ctx.drawImage(img, srcInsetX, srcInsetTop, srcW, srcH, bx, s.y, CRATE_SIZE, CRATE_SIZE);
                    }
                } else {
                    ctx.fillStyle = '#4a3820';
                    ctx.fillRect(bx, s.y, CRATE_SIZE, CRATE_SIZE);
                    ctx.strokeStyle = 'rgba(20, 14, 6, 0.85)';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(bx + 2, s.y + 2, CRATE_SIZE - 4, CRATE_SIZE - 4);
                }
            }
            // 上面の月明かりの照りと、棚下の影で立体感を出す
            ctx.fillStyle = 'rgba(214, 226, 255, 0.06)';
            ctx.fillRect(s.x, s.y, s.width, 3);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(s.x - 3, s.y + CRATE_SIZE, s.width + 6, 6);
        }
    }

    // 千両箱（生成画像）。塔の終着点なので、遠目にも「あそこが目的」と分かるよう
    // 大きく据え、金の光柱と輪で囲う。小判は重ねない(重なると何か読めない)。
    renderChest(ctx) {
        const c = this.chest;
        if (!c || c.taken) return;
        const img = getAsset(3);
        const tw = (Math.sin(c.phase * 1.7) + 1) * 0.5;
        // 縦横比は絵から取る(横長 384x242)。正方形で描くと箱が潰れて四角い塊になる。
        const w = 132;
        const h = img ? Math.round(w * (img.naturalHeight / img.naturalWidth)) : 84;
        const baseY = c.baseY;         // 棚の天面＝箱の下端
        const x = c.x - w * 0.5;
        const y = baseY - h;
        const cy = baseY - h * 0.5;    // 箱の中心（後光の中心）

        // 上から降る光柱（頂上の月明かりと呼応させる）。
        // 光は必ず【放射グラデーション＋グラデーションが0になる大きさの矩形】で描く。
        // 線形グラデーションを矩形へ流すと左右と下が硬い縁として残り、
        // 「光ではなく長方形が乗っている」ように見える(実機フィードバック 2026-08-11)。
        // 縦に伸ばしたいときは scale で潰す ― 矩形を細くして代用しない。
        ctx.save();
        ctx.translate(c.x, baseY - 150);
        ctx.scale(1, 2.6);
        const shaft = ctx.createRadialGradient(0, 0, 6, 0, 0, 130);
        shaft.addColorStop(0, `rgba(255, 220, 140, ${(0.13 + tw * 0.05).toFixed(3)})`);
        shaft.addColorStop(0.6, `rgba(255, 214, 120, ${(0.05 + tw * 0.02).toFixed(3)})`);
        shaft.addColorStop(1, 'rgba(255, 214, 120, 0)');
        ctx.fillStyle = shaft;
        ctx.fillRect(-130, -130, 260, 260);
        ctx.restore();

        // 足元の光溜まり（矩形は半径の2倍を確保する）
        const glow = ctx.createRadialGradient(c.x, baseY - 6, 8, c.x, baseY - 6, 190);
        glow.addColorStop(0, `rgba(255, 214, 120, ${(0.3 + tw * 0.14).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255, 214, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(c.x - 190, baseY - 196, 380, 380);

        if (img) {
            ctx.imageSmoothingEnabled = true;
            // 生成画像の黒マージンを軽く切り詰める
            const inX = img.naturalWidth * 0.02;
            const inY = img.naturalHeight * 0.02;
            const sw = img.naturalWidth - inX * 2;
            const sh = img.naturalHeight - inY * 2;
            // 背後の後光。箱の絵は暗い木と黒い金具なので、暗い壁の前だと輪郭が溶けて
            // 「何か分からない」(実機フィードバック)。まず光の面を敷いて形を起こす。
            const haloR = w * 0.78;
            const halo = ctx.createRadialGradient(c.x, cy, 10, c.x, cy, haloR);
            halo.addColorStop(0, `rgba(255, 226, 158, ${(0.34 + tw * 0.1).toFixed(3)})`);
            halo.addColorStop(0.55, 'rgba(255, 206, 120, 0.16)');
            halo.addColorStop(1, 'rgba(255, 206, 120, 0)');
            ctx.fillStyle = halo;
            ctx.fillRect(c.x - haloR, cy - haloR, haloR * 2, haloR * 2);
            ctx.drawImage(img, inX, inY, sw, sh, x, y, w, h);
            // 同じ絵を加算で薄く重ね、暗部を持ち上げる（filter 非対応環境でも効く）
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.4;
            ctx.drawImage(img, inX, inY, sw, sh, x, y, w, h);
            ctx.restore();
        } else {
            ctx.fillStyle = '#5c4222';
            ctx.fillRect(x + 14, y + 40, w - 28, h - 54);
            ctx.fillStyle = '#d9b24a';
            ctx.fillRect(x + 30, y + 32, 13, h - 46);
            ctx.fillRect(x + w - 43, y + 32, 13, h - 46);
        }
    }

    // 小判。立てた姿(縦向き)で面に静かに置く ― 浮遊・回転・きらめきは付けない
    // (安っぽく見える、と実機フィードバック 2026-08-11)。降り注ぎの小判も同じ絵。
    renderKobans(ctx) {
        const drawOne = (x, y) => {
            ctx.save();
            ctx.translate(x, y);
            if (!drawKobanImage(ctx, 0, 0, 17, 26)) {
                // フォールバック: シンプルな楕円の小判
                ctx.fillStyle = '#c9a23c';
                ctx.beginPath();
                ctx.ellipse(0, 0, 7.5, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#e0be5e';
                ctx.beginPath();
                ctx.ellipse(0, 0, 5.5, 9.5, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        };
        const band = this.getVisibleBand(60);
        for (const k of this.kobans) {
            if (k.taken || k.y < band.top || k.y > band.bottom) continue;
            drawOne(k.x, k.y);
        }
        // 降る小判: 落下中は回転しながら舞い、着地後は揺り戻しが収まる。
        // 真下に落ち影を敷いて「どこに着くか」を見せる(空中の物の距離感が出る)。
        for (const rk of this.rainKobans) {
            if (rk.taken || rk.delay > 0) continue;
            if (!rk.landed) {
                const fall = Math.max(0, Math.min(1, (rk.landY - rk.y) / 420));
                ctx.save();
                ctx.globalAlpha = 0.28 * (1 - fall);
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.ellipse(rk.baseX, rk.landY + 5, 9 * (1 - fall * 0.5), 3.2 * (1 - fall * 0.5), 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            ctx.save();
            ctx.translate(rk.x, rk.y);
            // 落下中は横回転(縦の潰れ)で「舞う」。着地後は揺り戻しが減衰する
            const tilt = rk.landed ? Math.sin(rk.spin) * rk.settle * 0.35 : Math.sin(rk.spin);
            ctx.scale(1, Math.max(0.24, Math.abs(Math.cos(tilt * 1.2))));
            ctx.rotate(rk.landed ? Math.sin(rk.spin) * rk.settle * 0.12 : Math.sin(rk.spin * 0.6) * 0.16);
            if (!drawKobanImage(ctx, 0, 0, 17, 26)) {
                ctx.fillStyle = '#c9a23c';
                ctx.beginPath();
                ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        // 着地の埃
        for (const d of this.rainDust) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, d.life * 2.4)) * 0.5;
            ctx.fillStyle = '#c9bda2';
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderObstacles() {}
    renderEnemies() {}
}
