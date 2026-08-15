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
// 背景: images/training_dojo_bg.png は【壁(立面)だけ】を使う。地平線より下の
// 板の間は本編と同じ「俯瞰の床帯」なので描画側(renderFloorBand)で敷く ―
// 遠近の付いた床を焼き込んだ絵をそのまま敷くと他ステージと奥行きの文法が食い違う。
// 固定画面なのでパララックス不要。読めない環境ではコード描画にフォールバック。

import { CANVAS_WIDTH, CANVAS_HEIGHT, LANE_OFFSET, ENEMY_TYPES } from './constants.js?v=screen-safe-20260815i';
import { createEnemy } from './enemy.js?v=screen-safe-20260815i';
import { getImage } from './imageCache.js?v=screen-safe-20260815i';
import { pushGain, updateGainPops, renderGainPops, tickTimeLimit, clampToLeftEdge } from './sideStageCommon.js?v=screen-safe-20260815i';

// 開始前に読み込む画像（game.requestStageStart が本編と同じ暗幕待ちに使う）
export const TRAINING_STAGE_IMAGES = [
    'images/training_dojo_bg.png',   // 0: 道場の壁（立面。床は焼き込まず描画側で敷く）
    'images/dojo_prop_low.png',      // 1: 低い稽古台（長持を並べた台。透過）
    'images/dojo_prop_high.png'      // 2: 高い稽古台（大太鼓の櫓。透過）
];

// 一枚絵の中で床(板の間)が始まる縦位置の比率。ワールドの地平線(groundY-2)に
// この線を合わせる。絵は【ワールド幅1280へ1:1】で描くので、絵の中の柱や長押の
// 位置はワールド座標へそのまま換算できる(x_world = x_image * 1280/1536)。
// 絵を差し替えたら実測し直すこと。
const FLOOR_LINE_V = 624 / 1024;

// 刻限（秒）
const TIME_LIMIT_SEC = 60;
// 稽古台(一方通行足場)＝【板の間に据えた道具】。壁付けの棚にすると板が手前へ
// 張り出す＝奥行きが要る絵になり、本編の投影文法(壁は立面・床は俯瞰の帯)と
// 食い違う(実機フィードバック 2026-08-11)。床に据わる物なら奥行きが要らない。
//   低い台 = 長持を並べた台        images/dojo_prop_low.png
//   高い台 = 大太鼓の櫓            images/dojo_prop_high.png
// 足元は本編の添景と同じ groundY + LANE_OFFSET(=512)。天面が当たり判定の面。
// 跳べる高さ: 床512→低い台412 が100px、低い台412→高い台312 が100px(単発160pxの内)。
// w は絵の縦横比から出してある(引き伸ばさない)。絵を差し替えたら
// scratch/fit_dojo_props.py で測り直すこと。
//   低い台 1024x512 (2.000) → 高さ100px なら w=200
//   高い台 1024x1008 (1.016) → 高さ200px なら w=203
const PROP_FOOT_Y = 512;          // 道具の足元(板の間の面)
const DOJO_PLATFORMS = [
    { x: 250, y: 412, w: 200, asset: 1 },
    { x: 830, y: 412, w: 200, asset: 1 },
    { x: 538, y: 312, w: 203, asset: 2 }
];
// 場に維持する敵の数（無双の密度。倒すそばから補充される）
const TARGET_ACTIVE = 12;
// 補充の間合い（秒）。小さいほど途切れない
const RESPAWN_INTERVAL_SEC = 0.14;
// 師範代(武将)が出る経過秒。場に1体だけ、節目で腕試しに現れる
const MASTER_AT_SEC = [14, 32, 48];

function getAsset(index) {
    const img = getImage(TRAINING_STAGE_IMAGES[index]);
    return (img && img.complete && img.naturalWidth) ? img : null;
}
function getBgImage() { return getAsset(0); }

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
            asset: p.asset,
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
        const floorTop = this.groundY - 2;
        ctx.save();
        if (img) {
            // 【壁だけ】を絵から使う。地平線(groundY-2)より下は本編と同じ「俯瞰の床帯」
            // なので、遠近の付いた床が焼き込まれた絵をそのまま敷くと、
            // 他ステージと奥行きの文法が食い違う(実機フィードバック 2026-08-11)。
            // 絵は床境界(FLOOR_LINE_V)の【上まで】を切り出し、その下端を地平線へ合わせる。
            // 幅は1280へ1:1。絵の中の柱の x をワールド座標へそのまま読み替えられる
            // (cover で切ると対応が崩れる)。
            const scale = CANVAS_WIDTH / img.naturalWidth;
            const cutH = Math.round(img.naturalHeight * FLOOR_LINE_V);   // 壁の高さ(絵の側)
            const drawH = cutH * scale;
            const offY = floorTop - drawH;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, 0, 0, img.naturalWidth, cutH, 0, offY, CANVAS_WIDTH, drawH);
            // カメラが上へ持ち上がった時に絵の上端より上が映る隙間を天井裏の闇で埋める
            if (this.skyVisTop < offY) {
                ctx.fillStyle = '#14100c';
                ctx.fillRect(0, this.skyVisTop - 8, CANVAS_WIDTH, (offY - this.skyVisTop) + 9);
            }
        } else {
            // フォールバック: 壁のコード描画
            ctx.fillStyle = '#1b150e';
            ctx.fillRect(0, this.skyVisTop, CANVAS_WIDTH, floorTop - this.skyVisTop);
            ctx.fillStyle = 'rgba(146, 168, 208, 0.16)';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(140 + i * 300, 150, 200, 240);
            }
        }
        this.renderFloorBand(ctx, floorTop);
        ctx.restore();
    }

    // 板の間(俯瞰の床帯)。地平線から画面下まで、水平な板目だけで敷く。
    // 遠近線・消失点は引かない ― 本編の床帯と同じ文法に揃える。
    renderFloorBand(ctx, floorTop) {
        const bottom = CANVAS_HEIGHT + 200;
        ctx.save();
        const base = ctx.createLinearGradient(0, floorTop, 0, bottom);
        base.addColorStop(0, '#2a1d12');
        base.addColorStop(0.28, '#3a281a');
        base.addColorStop(1, '#1a1109');
        ctx.fillStyle = base;
        ctx.fillRect(0, floorTop, CANVAS_WIDTH, bottom - floorTop);

        // 板の継ぎ目。手前ほど間隔を広げるが、線は全て水平のまま(遠近は付けない)
        ctx.strokeStyle = 'rgba(12, 8, 4, 0.55)';
        ctx.lineWidth = 1.5;
        let y = floorTop + 12;
        let gap = 16;
        while (y < bottom) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(CANVAS_WIDTH, y + 0.5);
            ctx.stroke();
            y += gap;
            gap += 2.2;
        }
        // 壁際の暗がり(床と壁の取り合いを締める)
        const foot = ctx.createLinearGradient(0, floorTop, 0, floorTop + 44);
        foot.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        foot.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = foot;
        ctx.fillRect(0, floorTop, CANVAS_WIDTH, 44);
        ctx.restore();
    }

    // 床は背景の一枚絵に焼き込み済み。稽古台と、討伐の手応えを返す浮き文字を描く。
    renderGround(ctx) {
        for (const p of this.platformColliders) this.renderShelf(ctx, p);
        renderGainPops(ctx, this, { stroke: 'rgba(6, 12, 26, 0.85)', fill: '#dfeaff' });
    }

    // 稽古台＝板の間に据えた道具。絵は上端が天面・下端が足元になるよう切り詰めて
    // あるので、当たり判定の面(p.y)から足元(PROP_FOOT_Y)までにそのまま収める。
    renderShelf(ctx, p) {
        const img = getAsset(p.asset);
        const w = p.width;
        const h = PROP_FOOT_Y - p.y;
        ctx.save();
        // 足元の落ち影。床帯の上に据わっていることを示す(これが無いと浮いて見える)
        const shadow = ctx.createRadialGradient(
            p.x + w * 0.5, PROP_FOOT_Y, 4,
            p.x + w * 0.5, PROP_FOOT_Y, w * 0.62
        );
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadow;
        ctx.fillRect(p.x + w * 0.5 - w * 0.62, PROP_FOOT_Y - w * 0.62, w * 1.24, w * 1.24);

        if (img) {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, p.x, p.y, w, h);
        } else if (p.asset === 2) {
            this.drawFallbackDrumTower(ctx, p.x, p.y, w, h);
        } else {
            this.drawFallbackChestStand(ctx, p.x, p.y, w, h);
        }
        ctx.restore();
    }

    // 絵が読めない時の代わり。長持を3つ並べ、その上に厚い一枚板を渡した低い台。
    drawFallbackChestStand(ctx, x, y, w, h) {
        const TOP_H = 14;
        const bodyY = y + TOP_H;
        const bodyH = h - TOP_H;
        const body = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
        body.addColorStop(0, '#3a2917');
        body.addColorStop(1, '#1a1108');
        ctx.fillStyle = body;
        ctx.fillRect(x + 6, bodyY, w - 12, bodyH);
        // 箱の割りと黒鉄の帯金具
        ctx.strokeStyle = 'rgba(10, 7, 3, 0.8)';
        ctx.lineWidth = 2;
        for (let i = 1; i < 3; i++) {
            const bx = x + 6 + (w - 12) * (i / 3);
            ctx.beginPath();
            ctx.moveTo(bx, bodyY + 2);
            ctx.lineTo(bx, bodyY + bodyH);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(14, 12, 10, 0.9)';
        ctx.fillRect(x + 6, bodyY + bodyH * 0.42, w - 12, 4);
        this.drawFallbackTopBoard(ctx, x, y, w, TOP_H);
    }

    // 絵が読めない時の代わり。四本柱の櫓に大太鼓を吊り、天板を渡した高い台。
    drawFallbackDrumTower(ctx, x, y, w, h) {
        const TOP_H = 14;
        const postW = 13;
        const postTop = y + TOP_H;
        const postH = h - TOP_H;
        ctx.fillStyle = '#2c1f11';
        ctx.fillRect(x + 8, postTop, postW, postH);
        ctx.fillRect(x + w - 8 - postW, postTop, postW, postH);
        // 貫(横木)2本
        ctx.fillStyle = '#241a0e';
        ctx.fillRect(x + 8, postTop + postH * 0.34, w - 16, 8);
        ctx.fillRect(x + 8, postTop + postH * 0.78, w - 16, 8);
        // 大太鼓（真正面＝円）
        const dr = Math.min(w * 0.29, postH * 0.29);
        const dcx = x + w * 0.5;
        const dcy = postTop + postH * 0.5;
        ctx.beginPath();
        ctx.arc(dcx, dcy, dr, 0, Math.PI * 2);
        const skin = ctx.createRadialGradient(dcx - dr * 0.3, dcy - dr * 0.3, dr * 0.1, dcx, dcy, dr);
        skin.addColorStop(0, '#6d5a3e');
        skin.addColorStop(1, '#3a2c1a');
        ctx.fillStyle = skin;
        ctx.fill();
        ctx.strokeStyle = '#120d06';
        ctx.lineWidth = Math.max(3, dr * 0.16);
        ctx.stroke();
        this.drawFallbackTopBoard(ctx, x, y, w, TOP_H);
    }

    // 天板（当たり判定の面）。上面だけ灯りを受ける。
    drawFallbackTopBoard(ctx, x, y, w, topH) {
        const top = ctx.createLinearGradient(0, y, 0, y + topH);
        top.addColorStop(0, '#6b5130');
        top.addColorStop(0.45, '#46331d');
        top.addColorStop(1, '#241a0e');
        ctx.fillStyle = top;
        ctx.fillRect(x, y, w, topH);
        ctx.fillStyle = 'rgba(232, 208, 158, 0.24)';
        ctx.fillRect(x, y, w, 3);
        ctx.strokeStyle = 'rgba(10, 7, 3, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, topH - 1.5);
    }

    renderObstacles() {}

    renderEnemies(ctx) {
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }
    }
}
