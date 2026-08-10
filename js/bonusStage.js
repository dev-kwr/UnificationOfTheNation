// ============================================
// Unification of the Nation - ボーナスステージ（小判蔵）
// ============================================
// 刻限60秒のスコアアタック。蔵の中の吹き抜けを、木箱の棚(一方通行足場)を
// 伝って上へ上へと登り、小判と最上部の千両箱を集める縦アスレチック。
// 時間切れで結果発表(game.beginSideResult)→獲得両がスコア。最高記録は
// saveGlobal(sideBest.bonus) に残る。何度でも挑める(記録更新が目的)。
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

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET } from './constants.js?v=screen-safe-20260811b';
import { audio } from './audio.js?v=screen-safe-20260811b';
import { getImage } from './imageCache.js?v=screen-safe-20260811b';
import { drawKobanImage } from './ui.js?v=screen-safe-20260811b';

// 小判1枚の価値（両）。よろず屋の相場に合わせてここだけで調整する。
const KOBAN_VALUE = 20;
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

// 棚(足場)の配置: x=左端 / dy=laneY(512)からの上面の相対高さ / crates=箱の数。
// 縦間隔110〜135(単〜2段ジャンプ圏)、横の跳びは240px以内でジグザグに。
// move を持つ棚は左右に往復する吊り棚(amp=振幅px, period=往復秒, phase=位相)。
// 上段ほど動く棚と細い足場を増やし、登るほど手強くする。
const SHELF_LAYOUT = [
    { x: 150, dy: -120, crates: 2 },
    { x: 610, dy: -230, crates: 2 },
    { x: 1000, dy: -340, crates: 2 },
    { x: 540, dy: -455, crates: 3 },
    { x: 120, dy: -575, crates: 2 },
    { x: 560, dy: -690, crates: 1, move: { amp: 150, period: 4.2, phase: 0 } },
    { x: 1010, dy: -800, crates: 2 },
    { x: 520, dy: -915, crates: 2 },
    { x: 110, dy: -1030, crates: 2 },
    { x: 560, dy: -1145, crates: 1, move: { amp: 190, period: 3.6, phase: 1.6 } },
    { x: 1000, dy: -1255, crates: 2 },
    { x: 480, dy: -1370, crates: 2 },
    { x: 120, dy: -1485, crates: 2 },
    { x: 560, dy: -1600, crates: 1, move: { amp: 210, period: 3.2, phase: 0.8 } },
    { x: 1010, dy: -1715, crates: 2 },
    { x: 540, dy: -1830, crates: 2 },
    { x: 140, dy: -1945, crates: 2 },
    { x: 560, dy: -2060, crates: 1, move: { amp: 230, period: 2.9, phase: 2.4 } },
    { x: 1000, dy: -2175, crates: 2 },
    { x: 450, dy: -2300, crates: 4 }    // 頂上の大棚（千両箱と月明かり）
];

// 高さ帯ごとの小判の価値。登るほど実入りが増え、上を目指す動機になる。
// dy(laneY からの高さ)がこの閾値より上なら、その倍率を掛ける。
const HEIGHT_TIERS = [
    { above: 1500, mult: 3 },
    { above: 800, mult: 2 },
    { above: 0, mult: 1 }
];

export class BonusStage {
    constructor() {
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
        this.shelves = SHELF_LAYOUT.map((s) => ({
            baseX: s.x,
            x: s.x,
            y: laneY + s.dy,
            crates: s.crates,
            width: s.crates * CRATE_SIZE,
            move: s.move || null
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

        // 千両箱: 頂上の棚の中央
        this.chest = {
            x: topShelf.x + topShelf.width * 0.5,
            y: topShelf.y - 52,      // 棚の上に据わる高さ(下端が棚の天面に接する)
            taken: false,
            phase: 0
        };

        // 小判: 地上の列 + 各棚の上 + 棚間の空中（ジャンプの弧）。
        // value は高さ帯で決まる(上ほど高い)。動く棚の上の小判は棚と一緒に動く。
        this.kobans = [];
        const valueAt = (y) => {
            const height = laneY - y;
            const tier = HEIGHT_TIERS.find((t) => height > t.above) || HEIGHT_TIERS[HEIGHT_TIERS.length - 1];
            return KOBAN_VALUE * tier.mult;
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
        for (let i = 0; i < 7; i++) addKoban(200 + i * 150, laneY - 40);
        for (let si = 0; si < this.shelves.length; si++) {
            // 頂上の棚は千両箱の座。小判を置くと箱と重なって何があるのか読めない
            // (実機フィードバック 2026-08-11)
            if (si === this.shelves.length - 1) continue;
            const s = this.shelves[si];
            const n = Math.min(3, s.crates + 1);
            for (let k = 0; k < n; k++) {
                addKoban(s.baseX + s.width * ((k + 1) / (n + 1)), s.y - 38, s.move ? si : -1);
            }
        }
        // 棚間の空中（隣の棚へ跳ぶ弧の頂点あたり）。動く棚が絡む区間は置かない
        for (let si = 0; si + 1 < this.shelves.length; si++) {
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

    update(deltaTime, player) {
        if (!player) return;
        this.time += deltaTime;
        for (let i = this.gainPops.length - 1; i >= 0; i--) {
            this.gainPops[i].life -= deltaTime;
            this.gainPops[i].y -= deltaTime * 46;
            if (this.gainPops[i].life <= 0) this.gainPops.splice(i, 1);
        }

        // 固定画面の左端。game 側の左クランプは currentStageNumber 依存
        // (Stage5帰りだと素通り)のため自前で閉じる。右端は共通処理で閉じる。
        if (player.x < 0) {
            player.x = 0;
            if (player.vx < 0) player.vx = 0;
        }

        if (this._timeUp) return;
        this.timeLeft = Math.max(0, this.timeLeft - deltaTime);
        if (this.timeLeft <= 0) {
            this._timeUp = true;
            return;
        }

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
        for (const k of this.kobans) {
            if (k.taken) continue;
            k.phase += deltaTime * 4;
            if (Math.hypot(px - k.x, py - k.y) < 48) {
                k.taken = true;
                this.collected++;
                this.grantScore(player, k.value, k.x, k.y);
            }
        }
        if (this.chest && !this.chest.taken) {
            this.chest.phase += deltaTime * 3;
            if (Math.hypot(px - this.chest.x, py - this.chest.y) < 74) {
                this.chest.taken = true;
                this.grantScore(player, CHEST_VALUE, this.chest.x, this.chest.y);
            }
        }
    }

    // 加算を1か所に集約。HUD のカウントアップ演出(lastGain)と、拾った場所から
    // 湧く「+n両」の浮き文字(gainPops)もここで積む。
    grantScore(player, value, x, y) {
        this.scoreValue += value;
        if (typeof player.setMoney === 'function') player.setMoney(player.money + value);
        else player.money = (player.money || 0) + value;
        audio.playMoney();
        // 連続で拾っている間(0.35秒以内)は同じ表示へ足し込む。
        // 1枚ずつ「+20」を重ねると数字が被って読めない。
        const MERGE = 0.35;
        if (this.lastGain && this.time - this.lastGain.at < MERGE) {
            this.lastGain.value += value;
            this.lastGain.at = this.time;
        } else {
            this.lastGain = { value, at: this.time };
        }
        const near = this.gainPops.find((p) => p.life > 0.55 && Math.hypot(p.x - x, p.y - y) < 90);
        if (near) {
            near.value += value;
            near.life = 0.9;
        } else {
            this.gainPops.push({ x, y, value, life: 0.9 });
        }
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
        for (const l of this.lanterns) {
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
        this.renderGainPops(ctx);
        ctx.restore();
    }

    // 拾った場所から浮き上がる「+n両」。獲得の手応えを画面の中でも返す。
    renderGainPops(ctx) {
        for (const p of this.gainPops) {
            const t = Math.max(0, Math.min(1, p.life / 0.9));
            const scale = 1 + (1 - t) * 0.25;
            ctx.save();
            ctx.globalAlpha = Math.min(1, t * 1.6);
            ctx.translate(p.x, p.y);
            ctx.scale(scale, scale);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 22px "Helvetica Neue", Arial, sans-serif';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(24, 14, 2, 0.85)';
            ctx.strokeText('+' + p.value, 0, 0);
            ctx.fillStyle = p.value >= 100 ? '#ffd970' : '#f0d78a';
            ctx.fillText('+' + p.value, 0, 0);
            ctx.restore();
        }
    }

    // 行灯の灯体（壁掛けの木枠と障子。光溜まりは renderBackground 側）
    renderLanterns(ctx) {
        for (const l of this.lanterns) {
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
        for (const s of this.shelves) {
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
        const w = 104;
        const h = 104;
        const x = c.x - w * 0.5;
        const y = c.y - h * 0.5;
        const baseY = c.y + h * 0.5;   // 箱の下端＝棚の天面

        // 上から降る光柱（頂上の月明かりと呼応させる）
        const shaft = ctx.createLinearGradient(0, baseY - 420, 0, baseY);
        shaft.addColorStop(0, 'rgba(255, 226, 150, 0)');
        shaft.addColorStop(1, `rgba(255, 214, 120, ${(0.1 + tw * 0.05).toFixed(3)})`);
        ctx.fillStyle = shaft;
        ctx.fillRect(c.x - 110, baseY - 420, 220, 420);

        // 足元の光溜まり
        const glow = ctx.createRadialGradient(c.x, baseY - 6, 8, c.x, baseY - 6, 190);
        glow.addColorStop(0, `rgba(255, 214, 120, ${(0.3 + tw * 0.14).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255, 214, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(c.x - 200, baseY - 200, 400, 260);

        if (img) {
            ctx.imageSmoothingEnabled = true;
            // 生成画像の黒マージンを軽く切り詰める
            const inX = img.naturalWidth * 0.02;
            const inY = img.naturalHeight * 0.02;
            const sw = img.naturalWidth - inX * 2;
            const sh = img.naturalHeight - inY * 2;
            // 背後の後光。箱の絵は暗い木と黒い金具なので、暗い壁の前だと輪郭が溶けて
            // 「何か分からない」(実機フィードバック)。まず光の面を敷いて形を起こす。
            const halo = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, w * 0.78);
            halo.addColorStop(0, `rgba(255, 226, 158, ${(0.34 + tw * 0.1).toFixed(3)})`);
            halo.addColorStop(0.55, 'rgba(255, 206, 120, 0.16)');
            halo.addColorStop(1, 'rgba(255, 206, 120, 0)');
            ctx.fillStyle = halo;
            ctx.fillRect(c.x - w, c.y - h, w * 2, h * 2);
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

    // 小判（自前描画: 楕円の小判 + 揺れる輝き）
    renderKobans(ctx) {
        for (const k of this.kobans) {
            if (k.taken) continue;
            const bob = Math.sin(k.phase) * 4;
            const y = k.y + bob;
            ctx.save();
            ctx.translate(k.x, y);
            ctx.rotate(Math.sin(k.phase * 0.5) * 0.12);
            // 生成画像（HUDのアイコンと同じ絵）。無い環境ではコード描画へ落ちる
            if (drawKobanImage(ctx, 0, 0, 30, 39)) {
                const tw0 = (Math.sin(k.phase * 1.7) + 1) * 0.5;
                ctx.fillStyle = `rgba(255, 244, 200, ${(0.2 + tw0 * 0.3).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(-5, -9, 1.4 + tw0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                continue;
            }
            ctx.fillStyle = '#c9a23c';
            ctx.beginPath();
            ctx.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e8c86a';
            ctx.beginPath();
            ctx.ellipse(0, 0, 6.5, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(120, 88, 24, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(0, 0, 6.5, 10, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(120, 88, 24, 0.6)';
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(0, 5);
            ctx.stroke();
            const tw = (Math.sin(k.phase * 1.7) + 1) * 0.5;
            ctx.fillStyle = `rgba(255, 244, 200, ${(0.35 + tw * 0.45).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(-3, -6, 1.6 + tw, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderObstacles() {}
    renderEnemies() {}
}
