// ============================================
// Unification of the Nation - ボーナスステージ（小判蔵）
// ============================================
// 敵の出ない短い蔵の中を駆け抜け、小判を拾って出口へ。終わるとセレクトへ戻る。
// game.js の PLAYING ループをそのまま使うため、Stage クラスと同じ描画/更新の
// 界面（renderBackground / renderGround / getAllEnemies / isCleared ...）を持つ
// 軽量クラスとして実装する。isCleared() は常に false（本編のクリア遷移＝
// セーブや武器解放へ乗せない）。終了は isBonusFinished() を game 側が見る。
//
// 背景: images/bonus_kura_bg.png（Codex/gpt-image 生成。無ければ土蔵風の
// フォールバック描画）。床はコード描画（タイル画像はループの継ぎ目が出るため）。

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET } from './constants.js?v=screen-safe-20260810h';
import { audio } from './audio.js?v=screen-safe-20260810h';
import { getImage } from './imageCache.js?v=screen-safe-20260810h';

// 小判1枚の価値（両）。よろず屋の相場に合わせてここだけで調整する。
const KOBAN_VALUE = 20;

// 開始前に読み込む画像（game.requestStageStart が本編と同じ暗幕待ちに使う）
export const BONUS_STAGE_IMAGES = ['images/bonus_kura_bg.png'];

// imageCache 経由で取得（game.requestStageStart の preload と同じ Image を共有し、
// settled 判定と実描画が食い違わないようにする）
function getBgImage() {
    return getImage(BONUS_STAGE_IMAGES[0]);
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

        // 小判の配置: 走り抜けるレーンに沿って、地上と小ジャンプの高さへ交互に。
        this.kobans = [];
        const laneY = this.groundY + LANE_OFFSET;
        let x = 460;
        for (let i = 0; i < 26; i++) {
            const high = (i % 4 === 2);
            this.kobans.push({
                x,
                y: laneY - (high ? 132 : 40),
                taken: false,
                phase: (i * 0.7) % (Math.PI * 2)
            });
            x += 88 + (i % 3) * 16;
        }
        this.collected = 0;
        this.totalKobans = this.kobans.length;
    }

    // --- Stage 互換の界面（PLAYING ループが呼ぶ） ---
    getAllEnemies() { return []; }
    getShadowCasters() { return []; }
    isCleared() { return false; }
    isStage6Grappling() { return false; }
    isBonusFinished() { return this._finished; }

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
        // 出口（右端の蔵の扉）に届いたら終了。game.updatePlaying が isBonusFinished を見る。
        if (!this._finished && px >= this.maxProgress - 110) {
            this._finished = true;
        }
    }

    // --- 描画（renderPlaying から呼ばれる。ctx はワールド変換済み） ---
    renderBackground(ctx) {
        const scrollX = (window.game && window.game.scrollX) || 0;
        const img = getBgImage();
        ctx.save();
        // 蔵の中は閉所なので、背景は淡いパララックス(0.35)で流す
        const par = scrollX * 0.35;
        if (img && img.complete && img.naturalWidth) {
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

        // 床（板張り）。ワールド全幅ぶんを一括で描く
        const floorTop = this.groundY - 2;
        const grad = ctx.createLinearGradient(0, floorTop, 0, CANVAS_HEIGHT + 220);
        grad.addColorStop(0, '#3a2d1c');
        grad.addColorStop(0.25, '#2c2115');
        grad.addColorStop(1, '#17110a');
        ctx.fillStyle = grad;
        ctx.fillRect(scrollX - 40, floorTop, CANVAS_WIDTH + 80, CANVAS_HEIGHT);
        // 板の目地
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

        // 出口の扉（右端）: 蔵の重い引き戸と光
        const doorX = this.maxProgress - 96;
        ctx.fillStyle = '#0c0a07';
        ctx.fillRect(doorX, this.groundY - 210, 84, 210 + LANE_OFFSET);
        ctx.strokeStyle = 'rgba(214, 186, 120, 0.5)';
        ctx.lineWidth = 3;
        ctx.strokeRect(doorX + 6, this.groundY - 204, 72, 204 + LANE_OFFSET - 6);
        const glow = ctx.createLinearGradient(doorX, 0, doorX + 84, 0);
        glow.addColorStop(0, 'rgba(255, 226, 150, 0)');
        glow.addColorStop(1, 'rgba(255, 226, 150, 0.16)');
        ctx.fillStyle = glow;
        ctx.fillRect(doorX, this.groundY - 210, 84, 210 + LANE_OFFSET);

        // 小判（自前描画: 楕円の小判 + 揺れる輝き）
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
        ctx.restore();
    }

    renderObstacles() {}
    renderEnemies() {}
}
