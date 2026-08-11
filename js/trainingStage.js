// ============================================
// Unification of the Nation - 修行ステージ（修行道場）
// ============================================
// 刻限60秒のスコアアタック。固定画面の板の間に門下生(敵)が絶え間なく
// 湧き続け、時間内に何人倒せるかを競う無双稽古。左右から歩き入るほか、
// 天井裏から忍者が降ってくる。時間切れで結果発表(game.beginSideResult)
// →討伐数がスコア。最高記録は saveGlobal(sideBest.training) に残る。
//
// 敵は本編と同じ createEnemy 製。被弾判定・撃破報酬(expGem/小判/ゲージ)は
// game 側が getAllEnemies() 経由で処理するので、ここでは「湧かせる・
// update で除去する・討伐を数える・描く」だけを持つ。
//
// 背景: images/training_dojo_bg.png（床まで焼き込んだ一枚絵。固定画面なので
// パララックス不要。読めない環境では板の間のコード描画にフォールバック）。

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET, ENEMY_TYPES } from './constants.js?v=screen-safe-20260811g';
import { createEnemy } from './enemy.js?v=screen-safe-20260811g';
import { getImage } from './imageCache.js?v=screen-safe-20260811g';

// 開始前に読み込む画像（game.requestStageStart が本編と同じ暗幕待ちに使う）
export const TRAINING_STAGE_IMAGES = ['images/training_dojo_bg.png'];

// 一枚絵の中で床(板の間)が始まる縦位置の比率。ワールドの地平線(groundY-2)に
// この線を合わせて cover 描画する。絵を差し替えたらここを合わせ直す。
const FLOOR_LINE_V = 0.615;

// 刻限（秒）
const TIME_LIMIT_SEC = 60;
// 場に維持する敵の数（無双の密度。倒すそばから補充される）
const TARGET_ACTIVE = 12;
// 補充の間合い（秒）。小さいほど途切れない
const RESPAWN_INTERVAL_SEC = 0.14;
// 師範代(武将)が出る経過秒。場に1体だけ、節目で腕試しに現れる
const MASTER_AT_SEC = [14, 32, 48];

function getBgImage() {
    const img = getImage(TRAINING_STAGE_IMAGES[0]);
    return (img && img.complete && img.naturalWidth) ? img : null;
}

export class TrainingStage {
    constructor() {
        this.stageNumber = 0;          // 本編の stage 番号分岐(===3/5/6 等)をすべて回避する値
        this.name = '修行道場';        // HUD右上のステージ名がこれを読む
        this.sideKind = 'training';    // 結果発表(beginSideResult)のスコア種別
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

        this.timeLeft = TIME_LIMIT_SEC;
        this.timeLimit = TIME_LIMIT_SEC;   // HUD の残量バーが総量として読む
        this.killCount = 0;            // 討伐数（結果発表のスコア）
        this._timeUp = false;
        this.spawnTimer = 0.6;         // 入場直後の一拍（すぐ囲まれない）
        this._spawnSide = false;       // 左右交互の湧き分け
        this._masterIndex = 0;         // 次に出す師範代（MASTER_AT_SEC の添字）
        this.time = 0;
        // 獲得演出: HUD のカウントアップ用(直近の加算)と、倒した位置から浮く「+1」
        this.lastGain = null;
        this.gainPops = [];
    }

    // --- Stage 互換の界面（PLAYING ループが呼ぶ） ---
    getAllEnemies() { return this.enemies; }
    getShadowCasters() { return this.enemies; }
    isCleared() { return false; }
    isStage6Grappling() { return false; }
    isTimeUp() { return this._timeUp; }
    getScore() { return this.killCount; }
    getHudTimerSec() { return this.timeLeft; }

    update(deltaTime, player) {
        if (!player) return;
        this.time += deltaTime;
        for (let i = this.gainPops.length - 1; i >= 0; i--) {
            this.gainPops[i].life -= deltaTime;
            this.gainPops[i].y -= deltaTime * 46;
            if (this.gainPops[i].life <= 0) this.gainPops.splice(i, 1);
        }

        // 固定画面の左端。game 側の「戻りなし」左クランプは currentStageNumber
        // に依存する(=Stage5帰りだと素通りする)ため、道場では自前で閉じる。
        if (player.x < 0) {
            player.x = 0;
            if (player.vx < 0) player.vx = 0;
        }

        // 敵の更新。討伐(hp<=0)は死亡アニメを待たずその場で数える。
        // 除去(update が true)は死亡アニメ完了後 — 報酬は game 側の撃破処理が持つ。
        // 同じフレームで複数倒したぶんは1つにまとめる(「+1」が重なって読めなくなる)
        const next = [];
        let killedThisFrame = 0;
        let killX = 0, killY = 0;
        for (const enemy of this.enemies) {
            if (enemy.hp <= 0 && !enemy._dojoCounted) {
                enemy._dojoCounted = true;
                this.killCount++;
                killedThisFrame++;
                killX += enemy.x + (enemy.width || 36) * 0.5;
                killY += enemy.y + (enemy.height || 72) * 0.4;
            }
            if (!enemy.update(deltaTime, player, [])) next.push(enemy);
        }
        this.enemies = next;
        if (killedThisFrame > 0) {
            this.pushGain(killedThisFrame, killX / killedThisFrame, killY / killedThisFrame);
        }

        if (this._timeUp) return;
        this.timeLeft = Math.max(0, this.timeLeft - deltaTime);
        if (this.timeLeft <= 0) {
            this._timeUp = true;
            return;
        }

        // 師範代(武将)の投入。場に1体まで＝雑魚の波と混ざって的が絞れる
        const elapsed = TIME_LIMIT_SEC - this.timeLeft;
        if (this._masterIndex < MASTER_AT_SEC.length && elapsed >= MASTER_AT_SEC[this._masterIndex]) {
            this._masterIndex++;
            if (!this.enemies.some((e) => e.type === ENEMY_TYPES.BUSHO && e.hp > 0)) {
                this.spawnMaster(player);
            }
        }

        // 無双の補充: 生きている敵が減ったそばから間断なく足す
        const alive = this.enemies.reduce((n, e) => n + (e.hp > 0 ? 1 : 0), 0);
        if (alive < TARGET_ACTIVE) {
            this.spawnTimer -= deltaTime;
            if (this.spawnTimer <= 0) {
                this.spawnOne(player);
                this.spawnTimer = RESPAWN_INTERVAL_SEC;
            }
        }
    }

    // 師範代(武将)。プレイヤーから遠い側の袖から、地に足を着けて現れる。
    spawnMaster(player) {
        const px = player ? player.x + player.getWorldWidth() * 0.5 : CANVAS_WIDTH * 0.5;
        const fromLeft = px > CANVAS_WIDTH * 0.5;
        const x = fromLeft ? -80 : CANVAS_WIDTH + 80;
        const enemy = createEnemy(ENEMY_TYPES.BUSHO, x, this.groundY, this.groundY);
        if (!enemy) return;
        enemy.y = this.groundY + LANE_OFFSET - enemy.height;
        enemy.facingRight = fromLeft;
        this.enemies.push(enemy);
    }

    // 獲得の集約。連続で倒している間(GAIN_MERGE_SEC以内)は同じ表示へ足し込み、
    // 「+1 +1 +1」が重なる代わりに「+3」と育てる(無双の手応え)。
    pushGain(value, x, y) {
        const MERGE = 0.35;
        if (this.lastGain && this.time - this.lastGain.at < MERGE) {
            this.lastGain.value += value;
            this.lastGain.at = this.time;
        } else {
            this.lastGain = { value, at: this.time };
        }
        // 浮き文字も直近のものが近ければ合流させる(同じ場所に重ならない)
        const near = this.gainPops.find((p) => p.life > 0.55 && Math.hypot(p.x - x, p.y - y) < 90);
        if (near) {
            near.value += value;
            near.life = 0.9;
        } else {
            this.gainPops.push({ x, y, value, life: 0.9 });
        }
    }

    // 1体湧かせる。7割は左右から歩き入り、3割は天井裏から忍者が降ってくる。
    // 時間が進むほど侍・忍者の比率が上がる（終盤の追い込み）。
    spawnOne(player) {
        const elapsed = TIME_LIMIT_SEC - this.timeLeft;
        const fromSky = Math.random() < 0.3;
        let type;
        let x;
        if (fromSky) {
            type = Math.random() < 0.6 ? ENEMY_TYPES.NINJA : ENEMY_TYPES.ASHIGARU;
            // プレイヤーの真上を避けた屋内のどこか
            const px = player ? player.x + player.getWorldWidth() * 0.5 : CANVAS_WIDTH * 0.5;
            let tries = 0;
            do {
                x = 180 + Math.random() * (CANVAS_WIDTH - 360);
            } while (Math.abs(x - px) < 130 && ++tries < 8);
        } else {
            const samuraiChance = Math.min(0.15 + elapsed * 0.005, 0.42);
            const ninjaChance = Math.min(0.06 + elapsed * 0.003, 0.2);
            const roll = Math.random();
            type = roll < ninjaChance ? ENEMY_TYPES.NINJA
                : roll < ninjaChance + samuraiChance ? ENEMY_TYPES.SAMURAI
                : ENEMY_TYPES.ASHIGARU;
            this._spawnSide = !this._spawnSide;
            x = this._spawnSide ? -60 - Math.random() * 90 : CANVAS_WIDTH + 60 + Math.random() * 90;
        }
        const enemy = createEnemy(type, x, this.groundY, this.groundY);
        if (!enemy) return;
        if (fromSky) {
            // 天井裏からの降下: 上空に置いて重力に任せる
            enemy.y = -160 - Math.random() * 140;
            enemy.vy = 2;
            enemy.isGrounded = false;
        } else {
            enemy.y = this.groundY + LANE_OFFSET - enemy.height;
        }
        enemy.facingRight = x < CANVAS_WIDTH * 0.5;
        this.enemies.push(enemy);
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

    // 床は背景の一枚絵に焼き込み済み。出口の戸は撤去（刻限制になったため）。
    // 討伐の手応えを返す浮き文字だけをここで描く。
    renderGround(ctx) {
        for (const p of this.gainPops) {
            const t = Math.max(0, Math.min(1, p.life / 0.9));
            ctx.save();
            ctx.globalAlpha = Math.min(1, t * 1.6);
            ctx.translate(p.x, p.y);
            ctx.scale(1 + (1 - t) * 0.25, 1 + (1 - t) * 0.25);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 22px "Helvetica Neue", Arial, sans-serif';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(6, 12, 26, 0.85)';
            const label = `+${p.value || 1}`;
            ctx.strokeText(label, 0, 0);
            ctx.fillStyle = '#dfeaff';
            ctx.fillText(label, 0, 0);
            ctx.restore();
        }
    }

    renderObstacles() {}

    renderEnemies(ctx) {
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }
    }
}
