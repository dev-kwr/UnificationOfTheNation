// ============================================
// Unification of the Nation - 修行ステージ（修行道場）
// ============================================
// 山道の上に建つ剣術道場。固定画面(スクロールなし)の板の間で、際限なく
// 湧く門下生(敵)を相手に経験値を稼ぐ。左端の戸の前にしばらく立つと
// 切り上げてセレクトへ戻る。BonusStage と同じく Stage 互換の軽量クラスで、
// isCleared() は常に false。終了は isTrainingFinished() を game 側が見る。
//
// 敵は本編と同じ createEnemy 製。被弾判定・撃破報酬(expGem/小判/ゲージ)は
// game 側が getAllEnemies() 経由で処理するので、ここでは「湧かせる・
// update で除去する・描く」だけを持つ。
//
// 背景: images/training_dojo_bg.png（床まで焼き込んだ一枚絵。固定画面なので
// パララックス不要。読めない環境では板の間のコード描画にフォールバック）。

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET, ENEMY_TYPES } from './constants.js?v=screen-safe-20260810i';
import { createEnemy } from './enemy.js?v=screen-safe-20260810i';
import { getImage } from './imageCache.js?v=screen-safe-20260810i';

// 開始前に読み込む画像（game.requestStageStart が本編と同じ暗幕待ちに使う）
export const TRAINING_STAGE_IMAGES = ['images/training_dojo_bg.png'];

// 一枚絵の中で床(板の間)が始まる縦位置の比率。ワールドの地平線(groundY-2)に
// この線を合わせて cover 描画する。絵を差し替えたらここを合わせ直す。
const FLOOR_LINE_V = 0.615;

// 戸の前に立ち続けて退出が成立するまでの秒数
const EXIT_HOLD_SEC = 0.6;
// 退出判定ゾーンの右端(ワールドx)。左端の戸の前あたり。
const EXIT_ZONE_X = 100;

function getBgImage() {
    const img = getImage(TRAINING_STAGE_IMAGES[0]);
    return (img && img.complete && img.naturalWidth) ? img : null;
}

export class TrainingStage {
    constructor() {
        this.stageNumber = 0;          // 本編の stage 番号分岐(===3/5/6 等)をすべて回避する値
        this.name = '修行道場';        // HUD右上のステージ名がこれを読む
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        this.maxProgress = CANVAS_WIDTH;   // 固定画面: カメラは動かない(scrollX=0)
        this.progress = 0;
        this.lastProgress = 0;
        this.obstacles = [];
        this.enemies = [];
        this.boss = null;
        this.bossSpawned = false;
        this.bossDefeated = false;
        this.bossEncounterBlend = 0;
        this.skyVisTop = 0;
        this.isFloorTransitioning = false;
        this._finished = false;

        this.wave = 0;
        this.waveTimer = 1.0;          // 開始の間合い(入場直後に囲まれない)
        this.exitHold = 0;             // 戸の前に立っている累計秒
    }

    // --- Stage 互換の界面（PLAYING ループが呼ぶ） ---
    getAllEnemies() { return this.enemies; }
    getShadowCasters() { return this.enemies; }
    isCleared() { return false; }
    isStage6Grappling() { return false; }
    isTrainingFinished() { return this._finished; }

    update(deltaTime, player) {
        if (!player) return;

        // 固定画面の左端。game 側の「戻りなし」左クランプは currentStageNumber
        // に依存する(=Stage5帰りだと素通りする)ため、道場では自前で閉じる。
        if (player.x < 0) {
            player.x = 0;
            if (player.vx < 0) player.vx = 0;
        }

        // 敵の更新。true が返ったら(死亡アニメ完了など)取り除く。
        // 撃破報酬や被弾判定は game 側が getAllEnemies() 経由で行う。
        const next = [];
        for (const enemy of this.enemies) {
            if (!enemy.update(deltaTime, player, [])) next.push(enemy);
        }
        this.enemies = next;

        // 立ち会いの間合い: 全員倒すと一拍おいて次の稽古(ウェーブ)が始まる
        if (this.enemies.length === 0 && !this._finished) {
            this.waveTimer -= deltaTime;
            if (this.waveTimer <= 0) {
                this.spawnWave();
                this.waveTimer = 1.2;
            }
        }

        // 退出: 左端の戸の前(接地)に立ち続けると切り上げる
        const px = player.x + player.getWorldWidth() * 0.5;
        const inExitZone = px <= EXIT_ZONE_X && player.isGrounded;
        if (inExitZone) {
            this.exitHold += deltaTime;
            if (this.exitHold >= EXIT_HOLD_SEC) this._finished = true;
        } else {
            this.exitHold = Math.max(0, this.exitHold - deltaTime * 2);
        }
    }

    // 稽古一巡ぶんの門下生を湧かせる。回を重ねるほど数と質が上がり、
    // 五巡ごとに武将(師範代)が交じる。上限は控えめにして乱戦になりすぎない。
    spawnWave() {
        this.wave++;
        const count = Math.min(3 + Math.floor((this.wave - 1) / 2), 5);
        const samuraiChance = Math.min(0.2 + this.wave * 0.05, 0.4);
        const ninjaChance = Math.min(0.04 + this.wave * 0.03, 0.22);
        for (let i = 0; i < count; i++) {
            let type = ENEMY_TYPES.ASHIGARU;
            const roll = Math.random();
            if (roll < ninjaChance) type = ENEMY_TYPES.NINJA;
            else if (roll < ninjaChance + samuraiChance) type = ENEMY_TYPES.SAMURAI;
            if (this.wave % 5 === 0 && i === 0) type = ENEMY_TYPES.BUSHO;

            const fromLeft = (i % 2 === 1);
            const x = fromLeft ? -80 - i * 46 : CANVAS_WIDTH + 80 + i * 46;
            const enemy = createEnemy(type, x, this.groundY, this.groundY);
            if (!enemy) continue;
            enemy.y = this.groundY + LANE_OFFSET - enemy.height;
            enemy.facingRight = fromLeft;
            this.enemies.push(enemy);
        }
    }

    // --- 描画（renderPlaying から呼ばれる。ctx はワールド変換済み） ---
    renderBackground(ctx) {
        const img = getBgImage();
        ctx.save();
        if (img) {
            // 幅基準の cover。絵の床境界(FLOOR_LINE_V)がワールドの地平線
            // (groundY-2)に乗るよう縦位置を合わせる。固定画面なのでスクロール補正なし。
            const drawW = CANVAS_WIDTH;
            const drawH = img.naturalHeight * (CANVAS_WIDTH / img.naturalWidth);
            const offY = (this.groundY - 2) - drawH * FLOOR_LINE_V;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, 0, offY, drawW, drawH);
            // カメラが上へ持ち上がった時に絵の上端より上が映る隙間を天井裏の闇で埋める
            if (this.skyVisTop < offY) {
                ctx.fillStyle = '#14100c';
                ctx.fillRect(0, this.skyVisTop - 8, CANVAS_WIDTH, (offY - this.skyVisTop) + 9);
            }
        } else {
            // フォールバック: 板の間と障子のコード描画
            ctx.fillStyle = '#1b150e';
            ctx.fillRect(0, this.skyVisTop, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.fillStyle = 'rgba(146, 168, 208, 0.16)';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(140 + i * 300, 150, 200, 240);
            }
            const floorTop = this.groundY - 2;
            const grad = ctx.createLinearGradient(0, floorTop, 0, CANVAS_HEIGHT);
            grad.addColorStop(0, '#3a2c1a');
            grad.addColorStop(1, '#191209');
            ctx.fillStyle = grad;
            ctx.fillRect(0, floorTop, CANVAS_WIDTH, CANVAS_HEIGHT - floorTop);
        }
        ctx.restore();
    }

    renderGround(ctx) {
        // 床は背景の一枚絵に焼き込み済み。ここでは出口の戸と退出ゲージだけ描く。
        // 固定画面(scrollX=0)なのでワールド座標=画面座標。
        const laneY = this.groundY + LANE_OFFSET;
        ctx.save();

        // 出口の戸(左端の木の引き戸)。絵の壁にコード描画で重ねる。
        const doorW = 84;
        const doorH = 250;
        const doorX = 4;
        const doorY = laneY - doorH;
        ctx.fillStyle = '#241a10';
        ctx.fillRect(doorX, doorY, doorW, doorH);
        ctx.strokeStyle = 'rgba(10, 7, 4, 0.9)';
        ctx.lineWidth = 3;
        ctx.strokeRect(doorX + 1.5, doorY + 1.5, doorW - 3, doorH - 3);
        // 格子と桟
        ctx.strokeStyle = 'rgba(90, 68, 40, 0.55)';
        ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(doorX + (doorW / 4) * i, doorY + 6);
            ctx.lineTo(doorX + (doorW / 4) * i, doorY + doorH - 6);
            ctx.stroke();
        }
        for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(doorX + 6, doorY + (doorH / 5) * i);
            ctx.lineTo(doorX + doorW - 6, doorY + (doorH / 5) * i);
            ctx.stroke();
        }
        // 戸の縁から漏れる夜気
        const leak = ctx.createLinearGradient(doorX, 0, doorX + doorW * 1.6, 0);
        leak.addColorStop(0, 'rgba(168, 190, 230, 0.10)');
        leak.addColorStop(1, 'rgba(168, 190, 230, 0)');
        ctx.fillStyle = leak;
        ctx.fillRect(doorX, doorY, doorW * 1.6, doorH);

        // 退出ゲージ: 戸の前に立っている間、戸の中心に円弧が満ちる
        const hold01 = Math.max(0, Math.min(1, this.exitHold / EXIT_HOLD_SEC));
        if (hold01 > 0 && !this._finished) {
            const cx = doorX + doorW * 0.5;
            const cy = doorY + doorH * 0.42;
            ctx.strokeStyle = 'rgba(20, 14, 8, 0.6)';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.arc(cx, cy, 26, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(232, 200, 106, 0.9)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + hold01 * Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    renderObstacles() {}

    renderEnemies(ctx) {
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }
    }
}
