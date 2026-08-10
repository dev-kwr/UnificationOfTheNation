// ============================================
// Unification of the Nation - ボーナスステージ（小判蔵）
// ============================================
// 敵の出ない短い蔵の中を駆け抜け、小判を拾って出口へ。終わるとセレクトへ戻る。
// game.js の PLAYING ループをそのまま使うため、Stage クラスと同じ描画/更新の
// 界面（renderBackground / renderGround / getAllEnemies / isCleared ...）を持つ
// 軽量クラスとして実装する。isCleared() は常に false（本編のクリア遷移＝
// セーブや武器解放へ乗せない）。終了は isBonusFinished() を game 側が見る。
//
// 蔵は一度踏破すると空になり、本編ステージをどこか踏破するまで補充されない
// (game.bonusAvailable)。地上を走り抜けるだけでも小判は拾えるが、木箱の
// 一方通行足場（getPlatformColliders）を登る上ルートに高所の小判と千両箱を
// 置き、アスレチックの寄り道で実入りが増える構成にする。
//
// 背景/床/扉/木箱: images/bonus_kura_*.png（Codex/gpt-image 生成。読めない
// 環境では従来のコード描画にフォールバック）。

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET } from './constants.js?v=screen-safe-20260810j';
import { audio } from './audio.js?v=screen-safe-20260810j';
import { getImage } from './imageCache.js?v=screen-safe-20260810j';

// 小判1枚の価値（両）。よろず屋の相場に合わせてここだけで調整する。
const KOBAN_VALUE = 20;
// 千両箱（最上段の木箱の上）。上ルートを登り切ったご褒美。
const CHEST_VALUE = 100;
// 木箱1個の見た目サイズ＝スタックの段差。ジャンプ(単発~160px/2段~280px)に対し
// 1段=直接乗れる / 2段=2段ジャンプ / 3段=隣のスタックから階段状に登る高さ。
const CRATE_SIZE = 96;

// 開始前に読み込む画像（game.requestStageStart が本編と同じ暗幕待ちに使う）
export const BONUS_STAGE_IMAGES = [
    'images/bonus_kura_bg.png',
    'images/bonus_kura_floor.png',
    'images/bonus_kura_door.png',
    'images/bonus_kura_crate.png'
];

// imageCache 経由で取得（game.requestStageStart の preload と同じ Image を共有し、
// settled 判定と実描画が食い違わないようにする）
function getAsset(index) {
    const img = getImage(BONUS_STAGE_IMAGES[index]);
    return (img && img.complete && img.naturalWidth) ? img : null;
}

export class BonusStage {
    constructor() {
        this.stageNumber = 0;          // 本編の stage 番号分岐(===3/5/6 等)をすべて回避する値
        this.name = '小判蔵';          // HUD右上のステージ名がこれを読む
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        this.maxProgress = Math.round(CANVAS_WIDTH * 2.4);   // 短い一本の蔵廊下
        this.progress = 0;
        this.lastProgress = 0;
        this.obstacles = [];
        this.boss = null;
        this.bossSpawned = false;
        this.bossDefeated = false;
        this.bossEncounterBlend = 0;
        this.skyVisTop = 0;
        this.isFloorTransitioning = false;
        this._finished = false;

        const laneY = this.groundY + LANE_OFFSET;

        // 木箱スタック（x=左端, stack=段数）。1560〜1752 は千両箱へ続く階段。
        this.crates = [
            { x: 700, stack: 1 },
            { x: 1120, stack: 2 },
            { x: 1560, stack: 1 },
            { x: 1656, stack: 2 },
            { x: 1752, stack: 3 },
            { x: 2300, stack: 2 }
        ];
        // 各スタックの最上面だけ足場にする（中段に乗れると上の箱にめり込むため）
        this.platformColliders = this.crates.map((c) => ({
            x: c.x,
            y: laneY - CRATE_SIZE * c.stack,
            width: CRATE_SIZE,
            height: 12,
            isDestroyed: false,
            isOneWayPlatform: true
        }));

        // 千両箱: 3段スタックの真上。取ると +100両。
        const chestStack = this.crates[4];
        this.chest = {
            x: chestStack.x + CRATE_SIZE * 0.5,
            y: laneY - CRATE_SIZE * chestStack.stack - 26,   // 箱の中心あたり
            taken: false,
            phase: 0
        };

        // 小判の配置: 地上の列（走り抜けでも拾える）+ 上ルートの高所配置。
        this.kobans = [];
        const addKoban = (x, y) => {
            this.kobans.push({ x, y, taken: false, phase: (this.kobans.length * 0.7) % (Math.PI * 2) });
        };
        // 地上列: 木箱スタックの帯は避けて敷く
        let x = 460;
        while (x < this.maxProgress - 380) {
            const onCrate = this.crates.some((c) => x > c.x - 40 && x < c.x + CRATE_SIZE + 40);
            if (!onCrate) addKoban(x, laneY - 40);
            x += 92 + (this.kobans.length % 3) * 14;
        }
        // 高所: 各スタックの上
        addKoban(726, laneY - CRATE_SIZE - 36);
        addKoban(770, laneY - CRATE_SIZE - 36);
        addKoban(1146, laneY - CRATE_SIZE * 2 - 36);
        addKoban(1190, laneY - CRATE_SIZE * 2 - 36);
        addKoban(2326, laneY - CRATE_SIZE * 2 - 36);
        addKoban(2370, laneY - CRATE_SIZE * 2 - 36);
        // 空中アーチ（2段スタック→階段の間。2段ジャンプの滞空で拾う）
        addKoban(1300, laneY - 182);
        addKoban(1380, laneY - 204);
        addKoban(1460, laneY - 182);
        this.collected = 0;
        this.totalKobans = this.kobans.length;
    }

    // --- Stage 互換の界面（PLAYING ループが呼ぶ） ---
    getAllEnemies() { return []; }
    getShadowCasters() { return []; }
    isCleared() { return false; }
    isStage6Grappling() { return false; }
    isBonusFinished() { return this._finished; }
    getPlatformColliders() { return this.platformColliders; }

    update(deltaTime, player) {
        if (!player) return;
        const px = player.x + player.getWorldWidth() * 0.5;
        const py = player.y + player.getWorldHeight() * 0.5;
        for (const k of this.kobans) {
            if (k.taken) continue;
            k.phase += deltaTime * 4;
            if (Math.hypot(px - k.x, py - k.y) < 46) {
                k.taken = true;
                this.collected++;
                if (typeof player.setMoney === 'function') player.setMoney(player.money + KOBAN_VALUE);
                else player.money = (player.money || 0) + KOBAN_VALUE;
                audio.playMoney();
            }
        }
        // 千両箱（少し大きめの取得半径）
        if (this.chest && !this.chest.taken) {
            this.chest.phase += deltaTime * 3;
            if (Math.hypot(px - this.chest.x, py - this.chest.y) < 56) {
                this.chest.taken = true;
                if (typeof player.setMoney === 'function') player.setMoney(player.money + CHEST_VALUE);
                else player.money = (player.money || 0) + CHEST_VALUE;
                audio.playMoney();
            }
        }
        // 出口（右端の蔵の扉）に届いたら終了。game.updatePlaying が isBonusFinished を見る。
        if (!this._finished && px >= this.maxProgress - 110) {
            this._finished = true;
        }
    }

    // --- 描画（renderPlaying から呼ばれる。ctx はワールド変換済み） ---
    renderBackground(ctx) {
        const scrollX = (window.game && window.game.scrollX) || 0;
        const img = getAsset(0);
        ctx.save();
        // 蔵の中は閉所なので、背景は淡いパララックス(0.35)で流す
        const par = scrollX * 0.35;
        if (img) {
            // cover で縦を合わせ、横はパララックス位置から切り出す
            const s = CANVAS_HEIGHT / img.naturalHeight;
            const drawW = img.naturalWidth * s;
            const off = -(par % drawW);
            ctx.imageSmoothingEnabled = true;
            for (let x = off - drawW; x < CANVAS_WIDTH + drawW; x += drawW) {
                ctx.drawImage(img, x, this.skyVisTop, drawW, CANVAS_HEIGHT);
            }
        } else {
            // フォールバック: 土蔵の壁（漆喰と梁）
            ctx.fillStyle = '#241e15';
            ctx.fillRect(0, this.skyVisTop, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.fillStyle = '#382c1b';
            for (let i = 0; i < 6; i++) {
                const bx = ((i * 260 - par) % (CANVAS_WIDTH + 260) + CANVAS_WIDTH + 260) % (CANVAS_WIDTH + 260) - 130;
                ctx.fillRect(bx, this.skyVisTop, 30, CANVAS_HEIGHT);
            }
        }
        // 全体をわずかに沈めて手前の小判を立てる
        ctx.fillStyle = 'rgba(6, 5, 3, 0.14)';
        ctx.fillRect(0, this.skyVisTop, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
    }

    renderGround(ctx) {
        const scrollX = (window.game && window.game.scrollX) || 0;
        const laneY = this.groundY + LANE_OFFSET;
        ctx.save();
        ctx.translate(-scrollX, 0);

        this.renderFloor(ctx, scrollX);
        this.renderExitWallAndDoor(ctx);
        this.renderCrates(ctx);
        this.renderChest(ctx);
        this.renderKobans(ctx);

        ctx.restore();
    }

    // 床（板張り）。画像をミラータイルで敷く（偶奇で水平反転すると継ぎ目が必ず合う）
    renderFloor(ctx, scrollX) {
        const floorTop = this.groundY - 2;
        const img = getAsset(1);
        if (img) {
            const drawH = CANVAS_HEIGHT - floorTop + 24;   // 可視の床帯(478..720)+余白
            const drawW = Math.max(120, img.naturalWidth * (drawH / img.naturalHeight));
            const first = Math.floor((scrollX - 40) / drawW);
            ctx.imageSmoothingEnabled = true;
            for (let i = first; i * drawW < scrollX + CANVAS_WIDTH + 40; i++) {
                const dx = i * drawW;
                if (((i % 2) + 2) % 2 === 1) {
                    ctx.save();
                    ctx.translate(dx + drawW, 0);
                    ctx.scale(-1, 1);
                    ctx.drawImage(img, 0, floorTop, drawW, drawH);
                    ctx.restore();
                } else {
                    ctx.drawImage(img, dx, floorTop, drawW, drawH);
                }
            }
            // 奥端(地平線)の締めと、手前へ沈む陰影で床帯に奥行きを付ける
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(scrollX - 40, floorTop + 1);
            ctx.lineTo(scrollX + CANVAS_WIDTH + 40, floorTop + 1);
            ctx.stroke();
            const shade = ctx.createLinearGradient(0, floorTop, 0, floorTop + drawH);
            shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
            shade.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
            ctx.fillStyle = shade;
            ctx.fillRect(scrollX - 40, floorTop, CANVAS_WIDTH + 80, drawH);
            return;
        }
        // フォールバック: 従来のコード描画（板張り）
        const grad = ctx.createLinearGradient(0, floorTop, 0, CANVAS_HEIGHT + 220);
        grad.addColorStop(0, '#3a2d1c');
        grad.addColorStop(0.25, '#2c2115');
        grad.addColorStop(1, '#17110a');
        ctx.fillStyle = grad;
        ctx.fillRect(scrollX - 40, floorTop, CANVAS_WIDTH + 80, CANVAS_HEIGHT);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 2;
        const firstPlank = Math.floor((scrollX - 40) / 96) * 96;
        for (let x = firstPlank; x < scrollX + CANVAS_WIDTH + 80; x += 96) {
            ctx.beginPath();
            ctx.moveTo(x, floorTop);
            ctx.lineTo(x - 26, CANVAS_HEIGHT + 200);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(214, 186, 120, 0.14)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(scrollX - 40, floorTop + 1);
        ctx.lineTo(scrollX + CANVAS_WIDTH + 80, floorTop + 1);
        ctx.stroke();
    }

    // 出口: 廊下の突き当たりの暗がり + 蔵の重い扉（画像）。扉の底は歩行線に接地。
    renderExitWallAndDoor(ctx) {
        const laneY = this.groundY + LANE_OFFSET;
        // 突き当たり感: 右端に近づくほど沈む暗がり（パララックス背景との継ぎ目を隠す）
        const wallX = this.maxProgress - 430;
        const dark = ctx.createLinearGradient(wallX, 0, this.maxProgress - 40, 0);
        dark.addColorStop(0, 'rgba(4, 3, 2, 0)');
        dark.addColorStop(1, 'rgba(4, 3, 2, 0.66)');
        ctx.fillStyle = dark;
        ctx.fillRect(wallX, this.skyVisTop, 430, CANVAS_HEIGHT);

        const img = getAsset(2);
        const doorH = 300;
        const doorW = img ? doorH * (img.naturalWidth / img.naturalHeight) : 200;
        const doorX = this.maxProgress - 110 - doorW * 0.5;   // 終了判定(maxProgress-110)と中心を揃える
        const doorY = laneY - doorH;
        if (img) {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, doorX, doorY, doorW, doorH);
            // 扉の縁から漏れる月明かり（絵と床を繋ぐ）
            const glow = ctx.createRadialGradient(doorX + doorW * 0.5, laneY - 8, 10, doorX + doorW * 0.5, laneY - 8, doorW * 0.9);
            glow.addColorStop(0, 'rgba(255, 234, 170, 0.18)');
            glow.addColorStop(1, 'rgba(255, 234, 170, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(doorX - doorW * 0.5, doorY, doorW * 2, doorH + 30);
        } else {
            // フォールバック: 従来のコード描画
            ctx.fillStyle = '#0c0a07';
            ctx.fillRect(doorX, doorY, doorW, doorH);
            ctx.strokeStyle = 'rgba(214, 186, 120, 0.5)';
            ctx.lineWidth = 3;
            ctx.strokeRect(doorX + 6, doorY + 6, doorW - 12, doorH - 12);
        }
    }

    // 木箱スタック（一方通行足場の見た目）。x+段数で時々反転させ単調さを消す。
    // 生成画像は箱の周囲に黒マージンがあるため、ソース矩形で箱本体だけを切り出す。
    renderCrates(ctx) {
        const laneY = this.groundY + LANE_OFFSET;
        const img = getAsset(3);
        const srcInsetX = img ? img.naturalWidth * 0.035 : 0;
        const srcInsetTop = img ? img.naturalHeight * 0.055 : 0;
        const srcW = img ? img.naturalWidth - srcInsetX * 2 : 0;
        const srcH = img ? img.naturalHeight - srcInsetTop - img.naturalHeight * 0.02 : 0;
        for (const c of this.crates) {
            for (let s = 0; s < c.stack; s++) {
                const top = laneY - CRATE_SIZE * (s + 1);
                if (img) {
                    ctx.imageSmoothingEnabled = true;
                    if ((s + Math.round(c.x / CRATE_SIZE)) % 2 === 1) {
                        ctx.save();
                        ctx.translate(c.x + CRATE_SIZE, top);
                        ctx.scale(-1, 1);
                        ctx.drawImage(img, srcInsetX, srcInsetTop, srcW, srcH, 0, 0, CRATE_SIZE, CRATE_SIZE);
                        ctx.restore();
                    } else {
                        ctx.drawImage(img, srcInsetX, srcInsetTop, srcW, srcH, c.x, top, CRATE_SIZE, CRATE_SIZE);
                    }
                } else {
                    // フォールバック: 板箱
                    ctx.fillStyle = '#4a3820';
                    ctx.fillRect(c.x, top, CRATE_SIZE, CRATE_SIZE);
                    ctx.strokeStyle = 'rgba(20, 14, 6, 0.85)';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(c.x + 2, top + 2, CRATE_SIZE - 4, CRATE_SIZE - 4);
                    ctx.strokeStyle = 'rgba(214, 186, 120, 0.18)';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(c.x + 10, top + 10, CRATE_SIZE - 20, CRATE_SIZE - 20);
                }
            }
            // 接地と段の重なりを締める影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.fillRect(c.x - 4, laneY - 3, CRATE_SIZE + 8, 5);
        }
    }

    // 千両箱（コード描画: 木の胴 + 金の帯。取ると消える）
    renderChest(ctx) {
        const c = this.chest;
        if (!c || c.taken) return;
        const bob = Math.sin(c.phase) * 2;
        const w = 64;
        const h = 44;
        const x = c.x - w * 0.5;
        const y = c.y - h * 0.5 + bob;
        ctx.save();
        // 胴
        ctx.fillStyle = '#5c4222';
        ctx.fillRect(x, y + 8, w, h - 8);
        // 蓋（上面のアーチ）
        ctx.fillStyle = '#6b4e29';
        ctx.beginPath();
        ctx.moveTo(x, y + 10);
        ctx.quadraticCurveTo(c.x, y - 6 + bob * 0.2, x + w, y + 10);
        ctx.lineTo(x + w, y + 16);
        ctx.lineTo(x, y + 16);
        ctx.closePath();
        ctx.fill();
        // 金の帯と鋲
        ctx.fillStyle = '#d9b24a';
        ctx.fillRect(x + 10, y + 2, 7, h - 2);
        ctx.fillRect(x + w - 17, y + 2, 7, h - 2);
        ctx.fillStyle = '#e8c86a';
        ctx.beginPath();
        ctx.arc(c.x, y + h * 0.55, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30, 20, 8, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y + 8, w, h - 8);
        // 輝き
        const tw = (Math.sin(c.phase * 1.7) + 1) * 0.5;
        ctx.fillStyle = `rgba(255, 244, 200, ${(0.3 + tw * 0.45).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x + 14, y + 4, 2 + tw * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
            // 中央の刻み
            ctx.strokeStyle = 'rgba(120, 88, 24, 0.6)';
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(0, 5);
            ctx.stroke();
            // 輝き
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
