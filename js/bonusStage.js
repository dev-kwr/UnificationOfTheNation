// ============================================
// Unification of the Nation - ボーナスステージ（小判蔵）
// ============================================
// 刻限60秒のスコアアタック。蔵の中の吹き抜けを、木箱の棚(一方通行足場)を
// 伝って上へ上へと登り、小判と最上部の千両箱を集める縦アスレチック。
// 時間切れで結果発表(game.beginSideResult)→獲得両がスコア。最高記録は
// saveGlobal(sideBest.bonus) に残る。蔵は一度入ると空になり、本編ステージを
// どこか踏破するまで補充されない(game.bonusAvailable)。
//
// カメラ: 横は固定(maxProgress=CANVAS_WIDTH で scrollX は常に0)。縦は
// game.updateCameraLift の stage フック(useFeetCameraLift +
// getCameraMinVisTop)で「接地した足の高さ」に追従して塔を登る。
//
// Stage 互換の軽量クラス(isCleared()常false)。終了は isTimeUp() を
// game.updatePlaying が見る。
//
// 画像: images/bonus_kura_*.png（Codex/gpt-image 生成。読めない環境では
// コード描画にフォールバック）。

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET } from './constants.js?v=screen-safe-20260810j';
import { audio } from './audio.js?v=screen-safe-20260810j';
import { getImage } from './imageCache.js?v=screen-safe-20260810j';

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
const SHELF_LAYOUT = [
    { x: 150, dy: -120, crates: 2 },
    { x: 610, dy: -230, crates: 2 },
    { x: 1000, dy: -340, crates: 2 },
    { x: 540, dy: -455, crates: 3 },
    { x: 120, dy: -575, crates: 2 },
    { x: 610, dy: -690, crates: 2 },
    { x: 1010, dy: -800, crates: 2 },
    { x: 520, dy: -915, crates: 3 },
    { x: 110, dy: -1030, crates: 2 },
    { x: 600, dy: -1145, crates: 2 },
    { x: 1000, dy: -1255, crates: 2 },
    { x: 450, dy: -1380, crates: 4 }    // 頂上の大棚（千両箱と月明かり）
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
        this.useFeetCameraLift = true;   // カメラは接地した足の高さに追従（塔を登る）

        this.timeLeft = TIME_LIMIT_SEC;
        this.scoreValue = 0;           // 獲得両の合計（結果発表のスコア）
        this._timeUp = false;
        this.time = 0;                 // 演出用の経過時間

        const laneY = this.groundY + LANE_OFFSET;

        // 棚（描画用）と一方通行コライダー（上面のみ）
        this.shelves = SHELF_LAYOUT.map((s) => ({
            x: s.x,
            y: laneY + s.dy,
            crates: s.crates,
            width: s.crates * CRATE_SIZE
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
            y: topShelf.y - 54,
            taken: false,
            phase: 0
        };

        // 小判: 地上の列 + 各棚の上 + 棚間の空中（ジャンプの弧）
        this.kobans = [];
        const addKoban = (x, y) => {
            this.kobans.push({ x, y, taken: false, phase: (this.kobans.length * 0.7) % (Math.PI * 2) });
        };
        for (let i = 0; i < 7; i++) addKoban(200 + i * 150, laneY - 40);
        for (let si = 0; si < this.shelves.length; si++) {
            const s = this.shelves[si];
            const n = Math.min(3, s.crates + (si >= 8 ? 1 : 0));
            for (let k = 0; k < n; k++) {
                addKoban(s.x + s.width * ((k + 1) / (n + 1)), s.y - 38);
            }
        }
        // 棚間の空中（隣の棚へ跳ぶ弧の頂点あたり）
        for (let si = 0; si + 1 < this.shelves.length; si++) {
            const a = this.shelves[si], b = this.shelves[si + 1];
            addKoban((a.x + a.width * 0.5 + b.x + b.width * 0.5) * 0.5, Math.min(a.y, b.y) - 66);
        }
        // 行灯: 棚の脇の壁に掛かる灯り。登る道筋が縦に連なって見えるようにし、
        // 真っ暗な吹き抜けに手掛かりを与える(2段おきに左右へ振り分ける)。
        this.lanterns = [];
        for (let si = 1; si < this.shelves.length; si += 2) {
            const s = this.shelves[si];
            const onLeft = (si % 4 === 1);
            this.lanterns.push({
                x: onLeft ? Math.max(52, s.x - 74) : Math.min(CANVAS_WIDTH - 52, s.x + s.width + 74),
                y: s.y - 46,
                phase: si * 1.7
            });
        }

        this.collected = 0;
        this.totalKobans = this.kobans.length;
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

        const px = player.x + player.getWorldWidth() * 0.5;
        const py = player.y + player.getWorldHeight() * 0.5;
        for (const k of this.kobans) {
            if (k.taken) continue;
            k.phase += deltaTime * 4;
            if (Math.hypot(px - k.x, py - k.y) < 48) {
                k.taken = true;
                this.collected++;
                this.scoreValue += KOBAN_VALUE;
                if (typeof player.setMoney === 'function') player.setMoney(player.money + KOBAN_VALUE);
                else player.money = (player.money || 0) + KOBAN_VALUE;
                audio.playMoney();
            }
        }
        if (this.chest && !this.chest.taken) {
            this.chest.phase += deltaTime * 3;
            if (Math.hypot(px - this.chest.x, py - this.chest.y) < 64) {
                this.chest.taken = true;
                this.scoreValue += CHEST_VALUE;
                if (typeof player.setMoney === 'function') player.setMoney(player.money + CHEST_VALUE);
                else player.money = (player.money || 0) + CHEST_VALUE;
                audio.playMoney();
            }
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
        ctx.restore();
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

    // 千両箱（生成画像。取ると消える）
    renderChest(ctx) {
        const c = this.chest;
        if (!c || c.taken) return;
        const img = getAsset(3);
        const bob = Math.sin(c.phase) * 2.5;
        const w = 108;
        const h = 108;
        const x = c.x - w * 0.5;
        const y = c.y - h * 0.5 + bob;
        // 足元の金の輝き
        const tw = (Math.sin(c.phase * 1.7) + 1) * 0.5;
        const glow = ctx.createRadialGradient(c.x, c.y + 30, 6, c.x, c.y + 30, 120);
        glow.addColorStop(0, `rgba(255, 214, 120, ${(0.22 + tw * 0.12).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255, 214, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(c.x - 130, c.y - 100, 260, 240);
        if (img) {
            ctx.imageSmoothingEnabled = true;
            // 生成画像の黒マージンを軽く切り詰める
            const inX = img.naturalWidth * 0.02;
            const inY = img.naturalHeight * 0.02;
            ctx.drawImage(img, inX, inY, img.naturalWidth - inX * 2, img.naturalHeight - inY * 2, x, y, w, h);
        } else {
            ctx.fillStyle = '#5c4222';
            ctx.fillRect(x + 10, y + 30, w - 20, h - 40);
            ctx.fillStyle = '#d9b24a';
            ctx.fillRect(x + 22, y + 24, 10, h - 34);
            ctx.fillRect(x + w - 32, y + 24, 10, h - 34);
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
