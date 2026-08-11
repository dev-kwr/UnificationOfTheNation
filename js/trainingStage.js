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

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET, ENEMY_TYPES } from './constants.js?v=screen-safe-20260811j';
import { createEnemy } from './enemy.js?v=screen-safe-20260811j';
import { getImage } from './imageCache.js?v=screen-safe-20260811j';
import { pushGain, updateGainPops, renderGainPops, tickTimeLimit, clampToLeftEdge } from './sideStageCommon.js?v=screen-safe-20260811j';

// 開始前に読み込む画像（game.requestStageStart が本編と同じ暗幕待ちに使う）
export const TRAINING_STAGE_IMAGES = ['images/training_dojo_bg.png'];

// 一枚絵の中で床(板の間)が始まる縦位置の比率。ワールドの地平線(groundY-2)に
// この線を合わせて cover 描画する。絵を差し替えたらここを合わせ直す。
const FLOOR_LINE_V = 0.615;

// 刻限（秒）
const TIME_LIMIT_SEC = 60;
// 板の間に据えた稽古用の台(一方通行足場)。左右対称に低い台、中央にやや高い台。
// 囲まれた時の逃げ場と、天井から降る忍者への迎撃点になる。
// 縦の間隔はジャンプ(単発160px)の範囲。背景絵の壁位置(左右の柱)を避けて置く。
const DOJO_PLATFORMS = [
    { x: 150, y: 400, w: 210 },
    { x: 920, y: 400, w: 210 },
    { x: 520, y: 310, w: 240 }
];
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

        // 稽古台。game.updatePlaying の extraColliders が getPlatformColliders() で読む
        this.platformColliders = DOJO_PLATFORMS.map((p) => ({
            x: p.x, y: p.y, width: p.w, height: 12,
            isDestroyed: false, isOneWayPlatform: true
        }));

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
    getPlatformColliders() { return this.platformColliders; }
    getScore() { return this.killCount; }
    getHudTimerSec() { return this.timeLeft; }

    update(deltaTime, player) {
        if (!player) return;
        this.time += deltaTime;
        updateGainPops(this, deltaTime);
        clampToLeftEdge(player);

        // 敵の更新。討伐(hp<=0)は死亡アニメを待たずその場で数える。
        // 除去(update が true)は死亡アニメ完了後 — 報酬は game 側の撃破処理が持つ。
        // 同じフレームで複数倒したぶんは1つにまとめる(「+1」が重なって読めなくなる)
        const next = [];
        let killedThisFrame = 0;
        let killX = 0, killY = 0;
        // 稽古台は敵にも足場として渡す。渡さないと台の上のプレイヤーへ手が届かず、
        // 全員が真下に集まって団子になる(実機フィードバック 2026-08-11)。
        for (const enemy of this.enemies) {
            if (enemy.hp <= 0 && !enemy._dojoCounted) {
                enemy._dojoCounted = true;
                this.killCount++;
                killedThisFrame++;
                killX += enemy.x + (enemy.width || 36) * 0.5;
                killY += enemy.y + (enemy.height || 72) * 0.4;
            }
            if (!enemy.update(deltaTime, player, this.platformColliders)) next.push(enemy);
        }
        this.enemies = next;
        if (killedThisFrame > 0) {
            pushGain(this, killedThisFrame, killX / killedThisFrame, killY / killedThisFrame);
        }
        this.spreadEnemies();
        this.chasePlayerUpward(player);

        if (tickTimeLimit(this, deltaTime)) return;

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

    // 敵同士を横へ押し退ける。本編は敵が疎らなので不要だが、無双の密度では
    // 全員が同じ的へ真っ直ぐ寄るため、そのままだと1点に重なって「団子」になる。
    // 位置だけを最小限ずらす(速度やAIには触れない＝間合いの判断は本編のまま)。
    spreadEnemies() {
        const list = this.enemies.filter((e) => e.hp > 0 && !e.isDying);
        const MIN_GAP = 46;      // これ以下に近づいたら押し退ける
        // 1フレームあたりの押し退け量(px)。AIの寄せ足(1〜2px/frame)より弱いと
        // 押し負けて結局重なるので、それを上回る値を入れる。強すぎると痙攣して見える。
        const PUSH = 1.5;
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                // 同じ高さ帯にいる者どうしだけ(上下に離れていれば重なって見えない)
                if (Math.abs(a.y - b.y) > 40) continue;
                const dx = (b.x + b.width * 0.5) - (a.x + a.width * 0.5);
                const dist = Math.abs(dx);
                if (dist >= MIN_GAP) continue;
                // 完全に重なった時は index の偶奇で開く向きを決める(0除算とハマり回避)
                const dir = dist < 0.01 ? (i % 2 ? 1 : -1) : Math.sign(dx);
                const push = PUSH * (1 - dist / MIN_GAP);
                a.x -= dir * push;
                b.x += dir * push;
            }
        }
    }

    // プレイヤーが稽古台の上にいる時、接地している敵をたまに跳ばせる。
    // 本編のAIは高低差を詰めないので、これが無いと台の上が安全地帯になる。
    chasePlayerUpward(player) {
        if (!player) return;
        const pFoot = player.y + player.getWorldHeight();
        for (const e of this.enemies) {
            if (e.hp <= 0 || e.isDying || !e.isGrounded) continue;
            const eFoot = e.y + e.height;
            if (eFoot - pFoot < 60) continue;              // 同じ高さならそのまま歩かせる
            if (Math.abs((e.x + e.width * 0.5) - (player.x + player.getWorldWidth() * 0.5)) > 220) continue;
            if (Math.random() > 0.012) continue;            // 全員が一斉に跳ぶと不自然
            // 台の高さ(80/170px)を越える初速。GRAVITY=0.8 → v=√(2gh)
            e.vy = -Math.min(17, Math.sqrt(2 * 0.8 * (eFoot - pFoot + 30)));
            e.isGrounded = false;
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

    // 床は背景の一枚絵に焼き込み済み。稽古台と、討伐の手応えを返す浮き文字を描く。
    renderGround(ctx) {
        for (const p of this.platformColliders) this.renderShelf(ctx, p);
        renderGainPops(ctx, this, { stroke: 'rgba(6, 12, 26, 0.85)', fill: '#dfeaff' });
    }

    // 稽古台＝壁に取り付けた板棚。床から脚を立てるのではなく、
    // 【壁の柱へ方杖(斜めの支え)で留めた板】として描く。宙に浮いた棒に見えると
    // 「背景に対して不自然でチープ」になる(実機フィードバック 2026-08-11)。
    // 部材は上から順に: 壁の影 → 方杖 → 幕板 → 天板 → 天板の照り。
    renderShelf(ctx, p) {
        const x = p.x;
        const y = p.y;                 // 天板の上面＝当たり判定の面
        const w = p.width;
        const TOP_H = 13;              // 天板の厚み
        const APRON_H = 9;             // 幕板(天板の下に回す横板)
        const BRACE_LEN = 34;          // 方杖の落ち幅
        const BRACE_IN = 26;           // 方杖の付け根を端から内へ寄せる量

        ctx.save();

        // --- 壁に落ちる影。板の裏側の暗がりを作って壁から浮かせる ---
        const shade = ctx.createLinearGradient(0, y + TOP_H, 0, y + TOP_H + BRACE_LEN + 18);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shade;
        ctx.fillRect(x - 10, y + TOP_H, w + 20, BRACE_LEN + 18);

        // --- 方杖(左右2本)。天板の下から壁側へ斜めに落ちる ---
        ctx.strokeStyle = '#2f2213';
        ctx.lineCap = 'butt';
        ctx.lineWidth = 9;
        for (const sign of [1, -1]) {
            const bx = sign > 0 ? x + BRACE_IN : x + w - BRACE_IN;
            ctx.beginPath();
            ctx.moveTo(bx, y + TOP_H + APRON_H - 1);
            ctx.lineTo(bx + sign * BRACE_LEN * 0.62, y + TOP_H + APRON_H + BRACE_LEN);
            ctx.stroke();
        }
        // 方杖の受け(壁側の小さな座)
        ctx.fillStyle = '#241a0e';
        for (const sign of [1, -1]) {
            const bx = sign > 0 ? x + BRACE_IN : x + w - BRACE_IN;
            ctx.fillRect(bx + sign * BRACE_LEN * 0.62 - 7, y + TOP_H + APRON_H + BRACE_LEN - 4, 14, 7);
        }

        // --- 幕板(天板の下に回した横板)。天板の厚みを二段にして重さを出す ---
        const apron = ctx.createLinearGradient(0, y + TOP_H, 0, y + TOP_H + APRON_H);
        apron.addColorStop(0, '#3a2a17');
        apron.addColorStop(1, '#1d1409');
        ctx.fillStyle = apron;
        ctx.fillRect(x + 6, y + TOP_H, w - 12, APRON_H);

        // --- 天板 ---
        const top = ctx.createLinearGradient(0, y, 0, y + TOP_H);
        top.addColorStop(0, '#6b5130');
        top.addColorStop(0.4, '#4a3620');
        top.addColorStop(1, '#241a0e');
        ctx.fillStyle = top;
        ctx.fillRect(x, y, w, TOP_H);
        // 木口(左右の切り口は明るい)
        ctx.fillStyle = 'rgba(150, 118, 74, 0.5)';
        ctx.fillRect(x, y + 1, 4, TOP_H - 2);
        ctx.fillRect(x + w - 4, y + 1, 4, TOP_H - 2);
        // 上面の照り(天井の灯りを受ける面)
        ctx.fillStyle = 'rgba(232, 208, 158, 0.24)';
        ctx.fillRect(x, y, w, 3);
        // 板の継ぎ目
        ctx.fillStyle = 'rgba(16, 11, 5, 0.5)';
        ctx.fillRect(x, y + 5, w, 1);
        // 縁の締め
        ctx.strokeStyle = 'rgba(10, 7, 3, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, TOP_H - 1.5);

        ctx.restore();
    }

    renderObstacles() {}

    renderEnemies(ctx) {
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }
    }
}
