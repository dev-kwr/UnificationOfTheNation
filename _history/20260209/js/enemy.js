// ============================================
// Unification of the Nation - 敵クラス
// ============================================

import { ENEMY_TYPES, COLORS, GRAVITY, CANVAS_WIDTH } from './constants.js';
import { audio } from './audio.js';

// 敵ベースクラス
export class Enemy {
    constructor(x, y, type, groundY) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.groundY = groundY;
        
        // サイズ（タイプによって変更）
        this.width = 40;
        this.height = 60;
        
        // 速度
        this.vx = 0;
        this.vy = 0;
        
        // ステータス
        this.hp = 10;
        this.maxHp = 10;
        this.damage = 1;
        this.speed = 2;
        this.isDying = false; 
        this.deathTimer = 0;
        this.deathDuration = 800; 
        
        // 報酬
        this.expReward = 10;
        this.moneyReward = 5;
        this.specialGaugeReward = 8; // 5 -> 8
        
        // 飛び道具
        this.projectiles = [];
        this.hitTimer = 0; // 追加
        
        // 状態
        this.isGrounded = true;
        this.facingRight = true;
        this.isAlive = true;
        this.isDying = false; // 死亡演出中フラグ
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        
        // AI
        this.state = 'idle';  // idle, patrol, chase, attack
        this.stateTimer = 0;
        this.patrolDirection = 1;
        this.detectionRange = 300;
        this.attackRange = 50;
        
        // 無敵時間（ノックバック用など）
        this.invincibleTimer = 0;
        
        // アニメーション
        this.animationTimer = 0;
        this.animationFrame = 0;
        this.legAngle = 0;
        this.bob = 0;
        this.animState = 'idle';
        
        // 死亡演出用
        this.deathTimer = 0;
        this.deathDuration = 800; // 0.8秒で素早く昇天
        
        this.init();
        
        // 難易度によるステータス補正
        this.applyDifficultyScaling();
    }
    
    applyDifficultyScaling() {
        // グローバルな game オブジェクト（または初期化時に渡された値）から難易度取得
        const difficulty = window.game ? window.game.difficulty : { damageMult: 1.0, hpMult: 1.0 };
        this.damage = Math.max(1, Math.floor(this.damage * difficulty.damageMult));
        this.maxHp = Math.max(1, Math.floor(this.maxHp * difficulty.hpMult));
        this.hp = this.maxHp;
    }
    
    init() {
        // サブクラスでオーバーライド
    }
    update(deltaTime, player, obstacles = []) {
        if (!this.isAlive || this.isDying) {
            this.deathTimer += deltaTime * 1000;
            // 成仏演出：劇的に速く上昇
            this.y -= 8;
            if (this.deathTimer >= 400) {
                this.isAlive = false;
                this.isDying = false;
                return true; // 完全に消滅
            }
            return false;
        }
        
        // ヒットエフェクト
        if (this.hitTimer > 0) {
            this.hitTimer -= deltaTime * 1000;
        }
        
        // クールダウン
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime * 1000;
        }

        // 攻撃更新
        if (this.isAttacking) {
            this.updateAttack(deltaTime);
        }
        
        // AI更新
        this.updateAI(deltaTime, player);
        
        // 物理演算（障害物判定を含む）
        this.applyPhysics(obstacles);
        
        // 飛び道具更新
        if (this.projectiles) {
            this.projectiles = this.projectiles.filter(p => p.update(deltaTime, player));
        }
        
        // アニメーション更新
        this.updateAnimation(deltaTime);
        
        return false;
    }
    
    updateAnimation(deltaTime) {
        this.animationTimer += deltaTime * 1000;
        
        // 状態の判定
        if (this.isAttacking) {
            this.animState = 'attack';
        } else if (Math.abs(this.vx) > 0.1) {
            this.animState = 'run';
        } else {
            this.animState = 'idle';
        }
        
        // アニメーション定数
        const frameDuration = 100;
        if (this.animationTimer >= frameDuration) {
            this.animationTimer = 0;
            this.animationFrame++;
        }
        
        // 足の動きとボブ
        if (this.animState === 'run') {
            this.legAngle = Math.sin(Date.now() * 0.01) * 0.7;
            this.bob = Math.abs(Math.cos(Date.now() * 0.01)) * 3;
        } else if (this.animState === 'idle') {
            this.legAngle = 0;
            this.bob = Math.sin(Date.now() * 0.002) * 2;
        } else {
            this.legAngle = 0.3; // 攻撃中などは少し踏み込む
            this.bob = 0;
        }
    }
    
    updateAI(deltaTime, player) {
        const distanceToPlayer = this.getDistanceToPlayer(player);
        const playerDirection = player.x > this.x ? 1 : -1;
        
        this.stateTimer += deltaTime * 1000;
        
        // 画面外（右側）にいる場合、索敵範囲に関わらずプレイヤー（左）に向かって進む
        const scrollX = window.game ? window.game.scrollX : 0;
        const screenRight = scrollX + CANVAS_WIDTH;
        if (this.x > screenRight - 20) { // 画面端付近でも追跡開始
            this.state = 'chase';
            this.vx = -this.speed;
            this.facingRight = false;
            return;
        }

        // 攻撃中または攻撃クールダウン中は移動しない
        if (this.isAttacking || this.attackCooldown > 0) {
            this.vx = 0;
            this.facingRight = playerDirection > 0;
            return;
        }

        // 障害物回避AI（さらに手前から検知）
        if (this.isGrounded && Math.abs(this.vx) > 0.1) {
            const checkDist = 60; // 40 -> 60
            const obstacles = window.game ? window.game.stage.obstacles : [];
            const dir = this.vx > 0 ? 1 : -1;
            const nextX = this.x + (dir * checkDist);
            
            for (const obs of obstacles) {
                if (obs.type === 'rock' && !obs.isDestroyed) {
                    const obsLeft = obs.x - 10; // 判定を少し広く
                    const obsRight = obs.x + obs.width + 10;
                    if (nextX + this.width > obsLeft && nextX < obsRight) {
                        // 岩を発見、ジャンプ！
                        this.vy = -12; // ジャンプ力を適正化
                        this.isGrounded = false;
                        break;
                    }
                }
            }
        }
        
        switch (this.state) {
            case 'idle':
                this.vx = 0;
                if (distanceToPlayer < this.detectionRange) {
                    this.state = 'chase';
                    this.stateTimer = 0;
                } else if (this.stateTimer > 2000) {
                    this.state = 'patrol';
                    this.stateTimer = 0;
                }
                break;
                
            case 'patrol':
                this.vx = this.speed * 0.5 * this.patrolDirection;
                this.facingRight = this.patrolDirection > 0;
                
                // 画面端で反転
                if (this.x <= 50 || this.x + this.width >= CANVAS_WIDTH - 50) {
                    this.patrolDirection *= -1;
                }
                
                if (this.stateTimer > 3000) {
                    this.patrolDirection *= -1;
                    this.stateTimer = 0;
                }
                
                if (distanceToPlayer < this.detectionRange) {
                    this.state = 'chase';
                    this.stateTimer = 0;
                }
                break;
                
            case 'chase':
                this.facingRight = playerDirection > 0;
                
                // 攻撃範囲内に入ったら停止して攻撃準備
                if (distanceToPlayer < this.attackRange) {
                    this.vx = 0;
                    this.state = 'attack';
                    this.stateTimer = 0;
                } else {
                    // まだ遠いので追いかける
                    this.vx = this.speed * playerDirection;
                }
                
                // 見失ったら idle に戻る
                if (distanceToPlayer > this.detectionRange * 1.5) {
                    this.state = 'idle';
                    this.stateTimer = 0;
                }
                break;
                
            case 'attack':
                this.vx = 0;
                this.facingRight = playerDirection > 0;
                
                // 予備動作（少し溜め）後に攻撃
                if (this.stateTimer > 300) { // 300ms溜め
                    this.startAttack();
                    this.state = 'chase';
                    this.stateTimer = 0;
                }
                
                // プレイヤーが離れたら追いかける
                if (distanceToPlayer > this.attackRange * 1.5) {
                    this.state = 'chase';
                    this.stateTimer = 0;
                }
                break;
        }

        // 共通：時々ジャンプして回避
        if (this.isGrounded && Math.random() < 0.005 && distanceToPlayer < 200) {
            this.jump();
        }
    }
    
    jump() {
        if (this.isGrounded) {
            this.vy = -22; // ジャンプ力さらに強化
            this.isGrounded = false;
        }
    }
    
    getDistanceToPlayer(player) {
        const dx = (player.x + player.width / 2) - (this.x + this.width / 2);
        const dy = (player.y + player.height / 2) - (this.y + this.height / 2);
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackTimer = 300;
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.attackCooldown = 1000;
        }
    }
    
    applyPhysics(obstacles = []) {
        // 重力
        if (!this.isGrounded) {
            this.vy += GRAVITY;
        }
        
        // 接地判定の初期化（前フレームの状態をリセット）
        // ただし、位置更新前にリセットすると即座に重力がかかるため、
        // 判定処理の中で適切に更新する。
        this.isGrounded = false;
        
        // 位置更新
        this.oldX = this.x;
        this.oldY = this.y;
        this.x += this.vx;
        this.y += this.vy;
        
        // 障害物との当たり判定（進入防止）
        for (const obs of obstacles) {
            if (this.intersects(obs)) {
                // 縦方向の補正（乗る判定を優先）
                if (this.vy >= 0 && this.oldY + this.height <= obs.y + 10) {
                    this.y = obs.y - this.height;
                    this.vy = 0;
                    this.isGrounded = true;
                } else if (this.vy < 0 && this.oldY >= obs.y + obs.height - 10) {
                    this.y = obs.y + obs.height;
                    this.vy = 0;
                } else {
                    // 横方向の補正
                    if (this.vx > 0 && this.oldX + this.width <= obs.x + 5) {
                        this.x = obs.x - this.width;
                        this.vx = 0;
                    } else if (this.vx < 0 && this.oldX >= obs.x + obs.width - 5) {
                        this.x = obs.x + obs.width;
                        this.vx = 0;
                    }
                }
            }
        }
        
        // 地面判定
        if (this.y + this.height >= this.groundY) {
            this.y = this.groundY - this.height;
            this.vy = 0;
            this.isGrounded = true;
        }
        
        // 画面端制限は削除（ワールド座標で自由に動く）
    }

    intersects(rect) {
        return this.x < rect.x + rect.width &&
               this.x + this.width > rect.x &&
               this.y < rect.y + rect.height &&
               this.y + this.height > rect.y;
    }
    
    // ダメージを受ける
    takeDamage(damage, player, attackData) {
        if (!this.isAlive || this.isDying) return false;
        
        this.hp -= damage;
        this.hitTimer = 100; // ヒットエフェクト
        
        // プレイヤーの位置に基づいたノックバック
        if (player) {
            const dir = player.x < this.x ? 1 : -1;
            this.vx = dir * 5;
            
            // 打ち上げ（ダッシュ斬りなど）
            if (attackData && attackData.isLaunch) {
                this.vy = -18; // 空高く打ち上げる
                this.isGrounded = false;
            } else if (this.isGrounded) {
                this.vy = -3; // 軽く浮かす
                this.isGrounded = false;
            }
        }
        
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDying = true; // 死亡演出開始
            return true;
        }
        return false;
    }
    
    getAttackHitbox() {
        if (!this.isAttacking) return null;
        
        const range = this.attackRange;
        if (this.facingRight) {
            return {
                x: this.x + this.width,
                y: this.y + 10,
                width: range,
                height: this.height - 20
            };
        } else {
            return {
                x: this.x - range,
                y: this.y + 10,
                width: range,
                height: this.height - 20
            };
        }
    }
    
    render(ctx) {
        if (!this.isAlive && !this.isDying) return;
        
        ctx.save();
        
        // 死亡演出中（幽体化）
        if (this.isDying) {
            const progress = this.deathTimer / this.deathDuration;
            ctx.globalAlpha = 0.6 * (1 - progress);
            // 白いシルエットにする
            ctx.filter = 'brightness(200%) grayscale(100%)';
            
            this.renderBody(ctx);
            this.renderAscensionEffect(ctx);
            ctx.restore();
            return;
        }

        // 通常の描画
        if (this.hitTimer > 0) {
            // 被弾時は真っ白に光らせる
            ctx.filter = 'brightness(500%) contrast(0%)'; 
        }
        
        this.renderBody(ctx);
        
        // 成仏エフェクト：周囲に光の粒子
        if (this.isDying) { // isAlive ではなく isDying で判定
            this.renderAscensionEffect(ctx);
        }
        
        // HPバー
        if (this.isAlive && !this.isDying) { // 死亡演出中はHPバー非表示
            this.renderHpBar(ctx);
        }
        
        // 飛び道具描画
        if (this.projectiles) {
            for (const p of this.projectiles) p.render(ctx);
        }
        
        ctx.restore();
    }
    
    renderBody(ctx) {
        // サブクラスでオーバーライド
        ctx.fillStyle = '#888';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
    
    renderHpBar(ctx) {
        const barWidth = this.width;
        const barHeight = 4;
        const barY = this.y - 10;
        
        // 背景
        ctx.fillStyle = '#400';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        // HP
        ctx.fillStyle = '#f44';
        ctx.fillRect(this.x, barY, barWidth * (this.hp / this.maxHp), barHeight);
    }
    
    renderAscensionEffect(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const progress = this.deathTimer / this.deathDuration;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - progress)})`;
        
        // 上昇する粒子
        for (let i = 0; i < 8; i++) {
            const seed = (i * 123.45 + this.deathTimer * 0.2) % 100;
            const px = centerX + Math.sin(i + this.deathTimer * 0.01) * 20;
            const py = centerY + 30 - (this.deathTimer * 0.05 + i * 10) % 60;
            const size = 2 + Math.sin(this.deathTimer * 0.01 + i) * 1.5;
            
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // ぼんやりとした光
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 40);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${0.4 * (1 - progress)})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 足軽（雑魚）
export class Ashigaru extends Enemy {
    init() {
        this.width = 35;
        this.height = 55;
        this.hp = 8;      // 一撃で倒せるよう調整
        this.maxHp = 8;
        this.damage = 1;
        this.speed = 3.0; // 1.5 -> 3.0 倍速
        this.expReward = 10;
        this.moneyReward = 5;
        this.specialGaugeReward = 5; // 3 -> 5
        this.detectionRange = 800; // 画面端から気づく
        this.attackRange = 40;
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const bottomY = this.y + this.height;
        const bob = Math.abs(Math.sin(Date.now() * 0.01)) * 3;
        const drawY = bottomY - bob;
        
        const headSize = 12;
        const bodyHeight = 15;
        const headY = drawY - bodyHeight - headSize;

        // 影
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(centerX, bottomY, 10, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // 胴体（雑魚っぽく細い）
        ctx.fillStyle = COLORS.ENEMY_ASHIGARU;
        ctx.beginPath();
        ctx.rect(centerX - 5, drawY - bodyHeight, 10, bodyHeight); // 四角い体
        ctx.fill();
        
        // 足（棒足）
        const legOffset = Math.sin(Date.now() * 0.02) * 4;
        ctx.beginPath();
        ctx.moveTo(centerX - 3, drawY - 2);
        ctx.lineTo(centerX - 3 - legOffset, drawY + 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + 3, drawY - 2);
        ctx.lineTo(centerX + 3 + legOffset, drawY + 2);
        ctx.stroke();

        // 頭（丸）
        ctx.beginPath();
        ctx.arc(centerX, headY, headSize, 0, Math.PI * 2);
        ctx.fill();

        // 笠（三角形のシルエット・特徴）
        ctx.fillStyle = COLORS.ENEMY_ASHIGARU; // 体と同じ色でシルエット化
        // 笠の頂点
        const hatTopY = headY - 5;
        ctx.beginPath();
        ctx.moveTo(centerX, hatTopY - 10);
        ctx.lineTo(centerX - 20, hatTopY + 5);
        ctx.lineTo(centerX + 20, hatTopY + 5);
        ctx.closePath();
        ctx.fill();

        // 目（黄色く光る単眼風）
        ctx.fillStyle = '#ff0';
        ctx.shadowColor = '#ff0';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(centerX, headY + 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 槍（シンプルに）
        // 槍（攻撃時、かつ消滅中でない）
        if (this.isAttacking && !this.isDying) {
            // 槍の柄
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 4;
            const dir = this.facingRight ? 1 : -1;
            const reach = (1 - this.attackTimer / 300) * 40; // リーチ延長
            
            ctx.beginPath();
            ctx.moveTo(centerX, headY + 5);
            ctx.lineTo(centerX + dir * (40 + reach), headY + 5);
            ctx.stroke();

            // 穂先（光らせる）
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            const tipX = centerX + dir * (40 + reach);
            ctx.moveTo(tipX, headY + 5 - 4);
            ctx.lineTo(tipX + dir * 15, headY + 5);
            ctx.lineTo(tipX, headY + 5 + 4);
            ctx.fill();
        }
    }
}

// 侍（普通）
export class Samurai extends Enemy {
    init() {
        this.width = 40;
        this.height = 60;
        this.hp = 30;
        this.maxHp = 30;
        this.damage = 2;
        this.speed = 4.0; // 2.0 -> 4.0 高速移動
        this.expReward = 25;
        this.moneyReward = 15;
        this.specialGaugeReward = 12; // 8 -> 12
        this.detectionRange = 900; // 画面外からでも気づく
        this.attackRange = 50;
        
        // 侍専用
        this.comboCount = 0;
        this.maxCombo = 3;
    }
    
    updateAI(deltaTime, player) {
        // シンプルに親クラスのAIを使用
        super.updateAI(deltaTime, player);
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackTimer = 250;
        this.comboCount++;
        
        if (this.comboCount >= this.maxCombo) {
            this.attackCooldown = 800;
            this.comboCount = 0;
        } else {
            this.attackCooldown = 200;
        }
    }
    
    takeDamage(amount) {
        return super.takeDamage(amount);
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const bottomY = this.y + this.height;
        const bob = Math.abs(Math.sin(Date.now() * 0.015)) * 3;
        const drawY = bottomY - bob;
        const dir = this.facingRight ? 1 : -1;
        
        const headSize = 15;
        const bodyHeight = 18;
        const headY = drawY - bodyHeight - headSize;
        const armY = drawY - bodyHeight * 0.7; // 腕の高さ

        // 影
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(centerX, bottomY, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // 胴体（しっかり）
        ctx.fillStyle = COLORS.ENEMY_BUSHO; // 侍用の色
        ctx.beginPath();
        ctx.moveTo(centerX - 10, drawY);
        ctx.lineTo(centerX + 10, drawY);
        ctx.lineTo(centerX + 8, drawY - bodyHeight);
        ctx.lineTo(centerX - 8, drawY - bodyHeight);
        ctx.closePath();
        ctx.fill();

        // 頭（兜シルエット）
        ctx.beginPath();
        ctx.arc(centerX, headY, headSize, 0, Math.PI * 2);
        ctx.fill();
        
        // 兜の角（鍬形） - 三日月型
        ctx.strokeStyle = COLORS.ENEMY_BUSHO;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(centerX, headY - 5, 20, Math.PI, 0); // 上向きの弧
        ctx.stroke();

        // 目（赤く光る）
        ctx.fillStyle = '#f00';
        ctx.shadowColor = '#f00';
        ctx.shadowBlur = 5;
        
        const eyeX = centerX + dir * 4;
        ctx.beginPath();
        ctx.moveTo(eyeX - 3, headY);
        ctx.lineTo(eyeX + 3, headY - 2);
        ctx.lineTo(eyeX, headY + 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 刀の描画（攻撃中かつ生存中のみ）
        if (this.isAttacking && !this.isDying) {
            // 攻撃（振り下ろし）
            const swingProgress = 1 - (this.attackTimer / 250); // 攻撃アニメーションの進捗
            const angle = (swingProgress * Math.PI * 1.2) - Math.PI / 2; // 振り下ろす角度
            ctx.save();
            ctx.translate(centerX + dir * 10, armY);
            ctx.rotate(dir * angle);
            
            ctx.fillStyle = '#fff'; // 刀は白
            ctx.fillRect(0, -2, 35, 3);
            
            // 軌跡
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-10, 0, 45, -0.5, 0.5);
            ctx.stroke();

            // 斬撃エフェクト（赤く発光）
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(-10, 0, 50, -0.6, 0.6);
            ctx.stroke();
            
            ctx.restore();
        }
    }
}

// 武将（中ボス）
export class Busho extends Enemy {
    init() {
        this.width = 50;
        this.height = 75;
        this.hp = 60;
        this.maxHp = 60;
        this.damage = 3;
        this.speed = 1.5;
        this.expReward = 100;
        this.moneyReward = 50;
        this.specialGaugeReward = 40; // 20 -> 40
        this.detectionRange = 600;
        this.attackRange = 80;
        
        this.attackPattern = 0;
        this.maxPatterns = 3;
        
        // ボス用ステータス
        this.actionTimer = 0;
        this.isEnraged = false;
        this.moveType = 'normal'; // normal, dash, retreat
        this.moveTimer = 0;
    }

    updateAI(deltaTime, player) {
        if (!this.isAlive) return;

        this.actionTimer += deltaTime * 1000;
        this.moveTimer -= deltaTime * 1000;
        
        // HP50%以下で発狂モード
        if (!this.isEnraged && this.hp < this.maxHp * 0.5) {
            this.isEnraged = true;
            this.speed *= 1.3;
        }

        const dist = Math.abs(player.x - this.x);
        const directionToPlayer = player.x > this.x ? 1 : -1;
        
        if (!this.isAttacking) {
            this.facingRight = directionToPlayer > 0;
            
            // 攻撃の意思決定
            const attackInterval = this.isEnraged ? 600 : 1200;
            if (this.actionTimer > attackInterval) {
                if (dist < this.attackRange) {
                    this.startAttack();
                    this.actionTimer = 0;
                    this.moveType = Math.random() < 0.4 ? 'retreat' : 'normal';
                    this.moveTimer = 1000;
                } else if (dist < 350 && Math.random() < 0.4) {
                    this.startAttack(); // 突進
                    this.actionTimer = 0;
                }
            }
            
            // 移動の意思決定
            if (this.moveTimer <= 0) {
                // 定期的に移動スタイルを変更
                const rand = Math.random();
                if (rand < 0.5) this.moveType = 'normal';
                else if (rand < 0.7) this.moveType = 'retreat';
                else this.moveType = 'dash';
                this.moveTimer = 800 + Math.random() * 1200; // タイマーを短くして俊敏に
            }

            if (this.moveType === 'retreat' && dist < 120) {
                // 距離を取る（少し速く）
                this.vx = -this.speed * 1.2 * directionToPlayer;
            } else if (this.moveType === 'dash') {
                // 素早く近づく
                this.vx = this.speed * 1.8 * directionToPlayer;
            } else if (dist > 50) {
                this.vx = this.speed * directionToPlayer;
            } else {
                this.vx = 0;
                // 密着時は時々ダッシュで裏回り狙い
                if (Math.random() < 0.02) this.moveType = 'dash';
            }
            
            // 時々ジャンプ（プレイヤーがジャンプ中なら頻度アップ）
            const jumpChance = (!player.isGrounded) ? 0.03 : 0.01;
            if (this.isGrounded && Math.random() < jumpChance) this.jump();
            
        } else {
            if (this.attackPattern !== 1) { // 突進以外は停止
                this.vx = 0;
            }
        }
    }
    
    startAttack() {
        this.isAttacking = true;
        this.attackPattern = Math.floor(Math.random() * this.maxPatterns);
        
        switch (this.attackPattern) {
            case 0: // 通常斬り
                this.attackTimer = 400;
                this.attackCooldown = 600;
                break;
            case 1: // 突進
                this.attackTimer = 600;
                this.attackCooldown = 1000;
                break;
            case 2: // 回転斬り
                this.attackTimer = 500;
                this.attackCooldown = 800;
                break;
        }
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        
        // 突進パターンは移動を伴う
        if (this.attackPattern === 1 && this.attackTimer > 200) {
            this.vx = (this.facingRight ? 1 : -1) * this.speed * 3;
        }
        
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.vx = 0;
        }
    }
    
    getAttackHitbox() {
        if (!this.isAttacking) return null;
        
        switch (this.attackPattern) {
            case 0: // 通常斬り
                return {
                    x: this.x + (this.facingRight ? this.width : -this.attackRange),
                    y: this.y + 10,
                    width: this.attackRange,
                    height: this.height - 20
                };
            case 1: // 突進（体全体が当たり判定）
                return {
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height
                };
            case 2: // 回転斬り（周囲全体）
                return {
                    x: this.x - 30,
                    y: this.y,
                    width: this.width + 60,
                    height: this.height
                };
        }
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const bottomY = this.y + this.height;
        const bob = Math.abs(Math.sin(Date.now() * 0.01)) * 4;
        const drawY = bottomY - bob;
        const dir = this.facingRight ? 1 : -1;
        
        // 3頭身くらいで巨大感を
        const headSize = 20;
        const bodyHeight = 35;
        const headY = drawY - bodyHeight - headSize;
        const bodyBottomY = drawY; // 胴体の下端

        // 影（巨大）
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(centerX, bottomY, 20, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // マント（シルエット）
        ctx.fillStyle = '#300';
        ctx.beginPath();
        ctx.moveTo(centerX - 15, headY + 10);
        ctx.lineTo(centerX + 15, headY + 10);
        ctx.lineTo(centerX + 25 + Math.sin(Date.now()*0.005)*5, drawY);
        ctx.lineTo(centerX - 25 + Math.sin(Date.now()*0.005+1)*5, drawY);
        ctx.fill();

        // 胴体（ゴツイ）
        ctx.fillStyle = COLORS.ENEMY_BUSHO;
        ctx.beginPath();
        ctx.moveTo(centerX - 15, drawY);
        ctx.lineTo(centerX + 15, drawY);
        ctx.lineTo(centerX + 20, drawY - bodyHeight); // 肩幅広
        ctx.lineTo(centerX - 20, drawY - bodyHeight);
        ctx.closePath();
        ctx.fill();

        // 頭（兜）
        ctx.beginPath();
        ctx.arc(centerX, headY, headSize, 0, Math.PI * 2);
        ctx.fill();
        
        // 兜の飾り（超派手）
        ctx.fillStyle = COLORS.ARMOR_GOLD;
        ctx.beginPath();
        ctx.moveTo(centerX, headY - headSize);
        ctx.lineTo(centerX - 15, headY - headSize - 20);
        ctx.lineTo(centerX + 15, headY - headSize - 20);
        ctx.fill();

        // 目（赤く光る・威圧的）
        ctx.fillStyle = '#f00';
        ctx.shadowColor = '#f00';
        ctx.shadowBlur = 10;
        
        // 2つの目
        ctx.beginPath();
        ctx.arc(centerX - 5, headY + 2, 3, 0, Math.PI * 2);
        ctx.arc(centerX + 5, headY + 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 武器描画（攻撃中かつ生存中のみ表示）
        if (this.isAttacking && !this.isDying) {
            const armX = centerX - dir * 5;
            const armY = bodyBottomY - 15;
            
            // 攻撃中（予備動作含む）は武器を激しく揺らす
            let weaponWobble = Math.sin(Date.now() * 0.05) * 8;

            ctx.strokeStyle = '#444';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(armX, armY);
            
            // 攻撃の進捗（attackTimer: 予備動作〜攻撃終了まで）
            const swingProgress = 1 - (this.attackTimer / 500); 
            let weaponAngle = -0.5 + swingProgress * Math.PI + weaponWobble * 0.02;
            
            const wx = armX + Math.cos(weaponAngle) * dir * 25;
            const wy = armY + Math.sin(weaponAngle) * 25;
            ctx.lineTo(wx, wy);
            ctx.stroke();

            // 大剣の描画
            ctx.save();
            const swordArmY = headY + 15;
            const progress = 1 - this.attackTimer / 400;
            ctx.translate(centerX + dir * 15, swordArmY);
            
            if (this.attackPattern === 2) { // 回転斬り
                ctx.rotate(Date.now() * 0.02);
                ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)';
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.arc(0, 0, 60, 0, Math.PI * 2);
                ctx.stroke();
            } else if (this.attackPattern === 1) { // 突進
                ctx.rotate(dir * Math.PI / 4);
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
                ctx.lineWidth = 5;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(-20 - i * 15, -5);
                    ctx.lineTo(-40 - i * 15, 0);
                    ctx.lineTo(-20 - i * 15, 5);
                    ctx.stroke();
                }
            } else { // 通常斬り
                const angle = progress * Math.PI * 1.2 - Math.PI / 2;
                ctx.rotate(dir * angle);
            }

            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(55, 0);
            ctx.lineTo(0, 6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            
            // 斬撃エフェクト (強化版: 発光と残像)
            if (this.attackPattern === 0 && progress > 0.3) {
                ctx.save();
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#f30';
                
                const arcStart = dir > 0 ? -1.2 : Math.PI - 1.2;
                const arcEnd = dir > 0 ? 1.2 : Math.PI + 1.2;
                
                // メインの斬撃
                ctx.strokeStyle = 'rgba(255, 100, 50, 0.8)';
                ctx.lineWidth = 12;
                ctx.beginPath();
                ctx.arc(centerX + dir * 15, swordArmY, 60, arcStart, arcEnd);
                ctx.stroke();
                
                // 残像１（太め・透明度低）
                ctx.strokeStyle = 'rgba(255, 50, 0, 0.4)';
                ctx.lineWidth = 18;
                ctx.beginPath();
                ctx.arc(centerX + dir * 15, swordArmY, 60, arcStart - 0.2, arcEnd + 0.2);
                ctx.stroke();

                // 残像２（細め・先端強調）
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(centerX + dir * 15, swordArmY, 60, arcStart, arcEnd);
                ctx.stroke();
                
                ctx.restore();
            }
        }
    }

}

// 忍者（特殊）
export class Ninja extends Enemy {
    init() {
        this.width = 35;
        this.height = 55;
        this.hp = 20;
        this.maxHp = 20;
        this.damage = 1;
        this.speed = 3; // 足が速い
        this.expReward = 20;
        this.moneyReward = 10;
        this.specialGaugeReward = 15; // 10 -> 15
        this.detectionRange = 600; // 索敵範囲拡大
        this.attackRange = 400;    // 遠距離攻撃範囲を大幅に拡大
    }

    updateAI(deltaTime, player) {
        const distanceToPlayer = this.getDistanceToPlayer(player);
        const playerDirection = player.x > this.x ? 1 : -1;

        if (this.state === 'chase' && distanceToPlayer < 200) {
            // 近すぎると離れて距離を取る（忍者の立ち回り）
            this.vx = -this.speed * playerDirection;
            this.facingRight = playerDirection > 0;
            if (Math.random() < 0.03) this.jump();
        } else {
            super.updateAI(deltaTime, player);
            // chase状態でも時々ジャンプしてかく乱
            if (this.state === 'chase' && Math.random() < 0.01) this.jump();
        }
    }

    startAttack() {
        this.isAttacking = true;
        this.attackTimer = 400; 

        // 手裏剣の同時出現数を制限 (最大3)
        if (this.projectiles.length >= 3) return;

        // 手裏剣を投げる
        const direction = this.facingRight ? 1 : -1;
        const vy = 0; // まっすぐ飛ばす
        this.projectiles.push(new EnemyProjectile(
            this.x + (this.facingRight ? this.width : 0),
            this.y + 20,
            direction * 10,
            vy,
            this.damage
        ));
        audio.playNoiseSfx(0.1, 0.05, 4000);
    }

    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const topY = this.y + (this.bob || 0);
        const dir = this.facingRight ? 1 : -1;

        ctx.strokeStyle = '#222';
        ctx.fillStyle = '#222';
        ctx.lineWidth = 3;

        // 頭（覆面）
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(centerX - 10, topY + 5, 20, 20, 5);
        } else {
            ctx.rect(centerX - 10, topY + 5, 20, 20);
        }
        ctx.fill();
        
        // 目（スリット）
        ctx.fillStyle = '#ffdbac';
        ctx.fillRect(centerX - 8, topY + 10, 16, 4);

        // 体
        ctx.beginPath();
        ctx.moveTo(centerX, topY + 25);
        ctx.lineTo(centerX, topY + 45);
        ctx.stroke();

        // 四肢
        const swing = Math.sin(Date.now() * 0.01) * 10;
        ctx.beginPath();
        ctx.moveTo(centerX, topY + 30);
        ctx.lineTo(centerX - 15 + swing, topY + 40);
        ctx.moveTo(centerX, topY + 30);
        ctx.lineTo(centerX + 15 - swing, topY + 40);
        ctx.moveTo(centerX, topY + 45);
        ctx.lineTo(centerX - 10 - swing * 0.5, this.y + this.height);
        ctx.moveTo(centerX, topY + 45);
        ctx.lineTo(centerX + 10 + swing * 0.5, this.y + this.height);
        ctx.stroke();

        // 背中の刀 (生存中のみ)
        if (!this.isDying) {
            ctx.save();
            ctx.translate(centerX - dir * 5, topY + 15);
            ctx.rotate(-dir * Math.PI / 4);
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dir * 25, 0);
            ctx.stroke();
            ctx.restore();
        }

        // 手の刀（攻撃中かつ生存中のみ）
        if (this.isAttacking && !this.isDying) {
            ctx.save();
            ctx.translate(centerX + dir * 10, topY + 25);
            const swingProgress = 1 - (this.attackTimer / 400);
            const angle = swingProgress * Math.PI * 1.5 - Math.PI / 2;
            ctx.rotate(dir * angle);
            ctx.strokeStyle = COLORS.STEEL;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(25, 0);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// 敵の飛び道具クラス
class EnemyProjectile {
    constructor(x, y, vx, vy, damage) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.radius = 5;
        this.isAlive = true;
        this.angle = 0;
    }

    update(deltaTime, player) {
        this.x += this.vx;
        this.y += this.vy;
        this.angle += 0.5;

        // プレイヤーとの衝突
        const dx = (player.x + player.width / 2) - this.x;
        const dy = (player.y + player.height / 2) - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // プレイヤーの攻撃で弾く (メイン武器 + サブ武器)
        const hitboxes = [];
        const mainHitbox = player.getAttackHitbox();
        if (mainHitbox) hitboxes.push(mainHitbox);
        
        if (player.currentSubWeapon) {
            const subHitbox = player.currentSubWeapon.getHitbox(player);
            if (subHitbox) {
                if (Array.isArray(subHitbox)) {
                    hitboxes.push(...subHitbox);
                } else {
                    hitboxes.push(subHitbox);
                }
            }
        }

        for (const attackBox of hitboxes) {
             // 簡易衝突判定
             if (this.x < attackBox.x + attackBox.width &&
                 this.x + 10 > attackBox.x &&
                 this.y < attackBox.y + attackBox.height &&
                 this.y + 10 > attackBox.y) {
                 
                 this.isAlive = false;
                 // キン！ (金属音)
                 audio.playSfx(1500, 'square', 0.1, 0.05);
                 audio.playNoiseSfx(0.3, 0.05, 5000);
                 return false;
             }
        }

        if (dist < 25 && player.invincibleTimer <= 0) {
            player.takeDamage(this.damage);
            this.isAlive = false;
        }

        // 画面外（スクロールを考慮）
        const scrollX = window.game ? window.game.scrollX : 0;
        if (this.x < scrollX - 100 || this.x > scrollX + CANVAS_WIDTH + 100) {
            this.isAlive = false;
        }

        return this.isAlive;
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // 発光エフェクト（視認性向上）
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ccffff'; // 明るい水色
        
        // 手裏剣の形
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(0, -10); // 少しサイズアップ (8 -> 10)
            ctx.lineTo(4, 0);
            ctx.lineTo(0, 4);
            ctx.lineTo(-4, 0);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

// 敵ファクトリー
export function createEnemy(type, x, y, groundY) {
    switch (type) {
        case ENEMY_TYPES.ASHIGARU:
            return new Ashigaru(x, y, type, groundY);
        case ENEMY_TYPES.SAMURAI:
            return new Samurai(x, y, type, groundY);
        case ENEMY_TYPES.BUSHO:
            return new Busho(x, y, type, groundY);
        case ENEMY_TYPES.NINJA:
            return new Ninja(x, y, type, groundY);
        default:
            return new Enemy(x, y, type, groundY);
    }
}
