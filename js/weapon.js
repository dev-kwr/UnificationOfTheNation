// ============================================
// Unification of the Nation - 武器クラス
// ============================================

import { GRAVITY, CANVAS_WIDTH, LANE_OFFSET } from './constants.js';
import { audio } from './audio.js';

function clampEnhanceTier(tier) {
    const value = Number.isFinite(tier) ? tier : Number(tier);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(3, Math.floor(value)));
}

function resolveSubWeaponEnhanceTier(owner, fallbackTier = 0) {
    if (owner && typeof owner.getSubWeaponEnhanceTier === 'function') {
        return clampEnhanceTier(owner.getSubWeaponEnhanceTier());
    }
    if (owner && owner.progression) {
        return clampEnhanceTier(owner.progression.subWeapon);
    }
    return clampEnhanceTier(fallbackTier);
}

// 爆弾クラス
export class Bomb {
    constructor(x, y, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.vx = velocityX;
        this.vy = velocityY;
        this.radius = 8;
        this.isExploding = false;
        this.explosionTimer = 0;
        this.explosionDuration = 300;
        this.explosionRadius = 60;
        this.damage = 30;
        this.isDestroyed = false;
        this.id = Math.random().toString(36).substr(2, 9); // 一意なID
    }
    
    update(deltaTime, groundY, enemies = []) {
        if (this.isExploding) {
            this.explosionTimer += deltaTime * 1000;
            if (this.explosionTimer >= this.explosionDuration) {
                this.isDestroyed = true;
            }
            return;
        }
        
        // 物理演算
        this.vy += GRAVITY * 0.5;
        this.x += this.vx;
        this.y += this.vy;
        
        // 地面に当たったら爆発
        if (this.y + this.radius >= groundY + LANE_OFFSET) {
            this.explode();
        }
        
        // 敵に当たったら爆発
        for (const enemy of enemies) {
            if (this.intersectsEnemy(enemy)) {
                this.explode();
                break;
            }
        }
    }
    
    intersectsEnemy(enemy) {
        const closestX = Math.max(enemy.x, Math.min(this.x, enemy.x + enemy.width));
        const closestY = Math.max(enemy.y, Math.min(this.y, enemy.y + enemy.height));
        const distanceX = this.x - closestX;
        const distanceY = this.y - closestY;
        return (distanceX * distanceX + distanceY * distanceY) < (this.radius * this.radius);
    }
    
    explode() {
        this.isExploding = true;
        this.explosionTimer = 0;
        this.vx = 0;
        this.vy = 0;
        audio.playExplosion();
    }
    
    // 爆発範囲内の敵を取得
    getEnemiesInExplosion(enemies) {
        if (!this.isExploding) return [];
        
        return enemies.filter(enemy => {
            const centerX = enemy.x + enemy.width / 2;
            const centerY = enemy.y + enemy.height / 2;
            const dx = this.x - centerX;
            const dy = this.y - centerY;
            return Math.sqrt(dx * dx + dy * dy) <= this.explosionRadius;
        });
    }
    
    render(ctx) {
        if (this.isExploding) {
            // リッチな多層爆炎エフェクト
            const progress = this.explosionTimer / this.explosionDuration;
            const currentRadius = this.explosionRadius * Math.pow(progress, 0.4); // 急速に広がり、ゆっくり消える
            const alpha = 1 - Math.pow(progress, 1.5);
            
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // 外側の熱波（ダークオレンジ～黒）
            const outerGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, currentRadius * 1.2);
            outerGrad.addColorStop(0.3, `rgba(255, 80, 0, ${alpha * 0.7})`);
            outerGrad.addColorStop(0.8, `rgba(150, 20, 0, ${alpha * 0.4})`);
            outerGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = outerGrad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius * 1.2, 0, Math.PI * 2);
            ctx.fill();
            
            // 内側の爆発のコア（白～黄～強烈なオレンジ）
            const innerGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, currentRadius);
            innerGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
            innerGrad.addColorStop(0.2, `rgba(255, 255, 150, ${alpha})`);
            innerGrad.addColorStop(0.6, `rgba(255, 120, 0, ${alpha * 0.9})`);
            innerGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
            ctx.fillStyle = innerGrad;

            // 星型のギザギザした爆発ポリゴンをつくる
            ctx.beginPath();
            const spikes = 12 + Math.floor(Math.random() * 6);
            for (let i = 0; i < spikes * 2; i++) {
                const angle = (Math.PI * 2 / (spikes * 2)) * i + progress;
                const r = (i % 2 === 0) ? currentRadius : currentRadius * (0.4 + Math.random() * 0.3);
                const px = this.x + Math.cos(angle) * r;
                const py = this.y + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();

            // 飛び散る火花（ランダムパーティクル）
            if (progress < 0.6) {
                ctx.fillStyle = `rgba(255, 200, 100, ${alpha})`;
                for(let i=0; i<8; i++) {
                    const sparkDist = currentRadius * (0.5 + Math.random());
                    const sparkAngle = Math.random() * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(this.x + Math.cos(sparkAngle)*sparkDist, this.y + Math.sin(sparkAngle)*sparkDist, 1.5 + Math.random()*2, 0, Math.PI*2);
                    ctx.fill();
                }
            }
            
            ctx.restore();

        } else {
            ctx.save();
            
            // 立体的な爆弾本体（球体グラデーション）
            const bodyGrad = ctx.createRadialGradient(
                this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.1,
                this.x, this.y, this.radius
            );
            bodyGrad.addColorStop(0, '#555555'); // ハイライト
            bodyGrad.addColorStop(0.4, '#242424'); // 基本色
            bodyGrad.addColorStop(1, '#0a0a0a'); // 影
            
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            
            // 金属のリング（口金部分）
            ctx.fillStyle = '#6b7075';
            ctx.fillRect(this.x - 3, this.y - this.radius - 2, 6, 3);
            ctx.fillStyle = '#42454a';
            ctx.fillRect(this.x - 3, this.y - this.radius - 0.5, 6, 1.5);
            
            // 導火線
            const fuseLen = 14;
            const fuseWiggle = Math.sin(this.lifeTime || performance.now() * 0.01) * 3;
            const fuseEndX = this.x + 4 + fuseWiggle;
            const fuseEndY = this.y - this.radius - fuseLen;
            
            ctx.strokeStyle = '#8B5A2B';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - this.radius - 2);
            ctx.quadraticCurveTo(this.x + 8, this.y - this.radius - 6, fuseEndX, fuseEndY);
            ctx.stroke();
            
            // 燃え盛る火花（ランダムなパーティクル）
            const time = performance.now();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.arc(fuseEndX, fuseEndY, 3 + Math.sin(time*0.05)*1, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#ff3300';
            for(let i=0; i<3; i++) {
                const ox = (Math.random()-0.5)*6;
                const oy = (Math.random()-0.5)*6;
                ctx.beginPath();
                ctx.arc(fuseEndX + ox, fuseEndY - 2 + oy, 1 + Math.random()*1.5, 0, Math.PI*2);
                ctx.fill();
            }
            
            ctx.restore();
        }
    }
}

// サブ武器ベースクラス
export class SubWeapon {
    constructor(name, damage, range, cooldown) {
        this.name = name;
        this.damage = damage;
        this.range = range;
        this.cooldown = cooldown;
        this.baseDamage = damage;
        this.baseRange = range;
        this.baseCooldown = cooldown;
        this.enhanceTier = 0;
    }

    applyEnhanceTier(tier) {
        this.enhanceTier = clampEnhanceTier(tier);
    }

    canUse() {
        return true; // デフォルトは常に使用可能
    }
    
    use() {
        // オーバーライド用
    }
    
    render() {
        // オーバーライド用
    }

    getHitbox() {
        // 判定を持たない武器（例: 火薬玉）は null を返す
        return null;
    }
}

// 手裏剣クラス
/**
 * 手裏剣の共通描画関数（手持ち・飛翔体・UIアイコンすべて統一）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - 中心X
 * @param {number} cy - 中心Y
 * @param {number} radius - 描画半径
 * @param {number|null} rotation - 回転角（null なら回転しない）
 */
export function drawShurikenShape(ctx, cx, cy, radius, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rotation !== undefined && rotation !== null) {
        ctx.rotate(rotation);
    }

    const r = radius;

    // 金属的なグラデーションを追加
    const bladeGrad = ctx.createLinearGradient(-r, -r, r, r);
    bladeGrad.addColorStop(0, '#e0e5ec'); // 明るい反射
    bladeGrad.addColorStop(0.5, '#7a8599'); // 基本色
    bladeGrad.addColorStop(1, '#3d485c'); // 暗い影
    
    ctx.fillStyle = bladeGrad;
    ctx.strokeStyle = '#2a3441';
    ctx.lineWidth = Math.max(0.8, r * 0.1);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const cos45 = Math.cos(angle + Math.PI / 4);
        const sin45 = Math.sin(angle + Math.PI / 4);
        if (i === 0) ctx.moveTo(cos * r * 0.85, sin * r * 0.85);
        else ctx.lineTo(cos * r * 0.85, sin * r * 0.85);
        ctx.lineTo(cos45 * r * 0.3, sin45 * r * 0.3);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // 鋭いハイライトエッジ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = Math.max(0.5, r * 0.08);
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * r * 0.25, Math.sin(angle) * r * 0.25);
        ctx.lineTo(Math.cos(angle) * r * 0.75, Math.sin(angle) * r * 0.75);
        ctx.stroke();
    }

    ctx.restore();
}

// 手裏剣の飛翔体
export class ShurikenProjectile {
    constructor(x, y, vx, vy, damage, radius, pierce = false, homing = false, targetIndex = 0) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.radius = radius;
        this.rotation = 0;
        this.rotationSpeed = 18;
        this.life = homing ? 2500 : 1200;
        this.maxLife = this.life;
        this.isDestroyed = false;
        this.targetIndex = targetIndex;
        this.pierce = pierce;
        this.homing = homing;
        this.hitEnemies = new Set();
        this.lastHitMap = new Map();
        this.id = Math.random().toString(36).substr(2, 9);
        this.initialDirection = Math.sign(vx) || 1; // ★修正: 発射時の向きを記憶
    }

    update(deltaTime, enemies = []) {
        if (this.isDestroyed) return;

        // ★二重更新ガードを完全撤廃
        //   呼び出しは Shuriken.update() からの1回に統一する。
        //   （外部から直接呼ばれても致命的な副作用はない）

        const dt = deltaTime;

        // --- 追尾 ---
        if (this.homing && enemies.length > 0) {
            const validEnemies = enemies.filter(e => {
                if (!e || e.isDead) return false;
                return true;           // ★フィルタなし – 生存敵すべてを候補にする
            });

            if (validEnemies.length > 0) {
                // 最も近い敵を追尾
                let closest = validEnemies[0];
                let closestDist = Infinity;
                for (const e of validEnemies) {
                    const ex = (e.x + (e.width || 30) / 2) - this.x;
                    const ey = (e.y + (e.height || 30) / 2) - this.y;
                    const d = ex * ex + ey * ey;
                    if (d < closestDist) {
                        closestDist = d;
                        closest = e;
                    }
                }
                const dx = (closest.x + (closest.width || 30) / 2) - this.x;
                const dy = (closest.y + (closest.height || 30) / 2) - this.y;
                const targetAngle = Math.atan2(dy, dx);
                const currentAngle = Math.atan2(this.vy, this.vx);
                let angleDiff = targetAngle - currentAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                const turnRate = 6.0 * dt;
                const turn = Math.max(-turnRate, Math.min(turnRate, angleDiff));
                const newAngle = currentAngle + turn;
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                this.vx = Math.cos(newAngle) * speed;
                this.vy = Math.sin(newAngle) * speed;
            }
        }

        // --- 移動 ---
        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;
        this.rotation += this.rotationSpeed * dt;
        this.life -= dt * 1000;

        // --- 地面判定（少し余裕を持たせる） ---
        const groundY = (window.game && window.game.groundY) ? window.game.groundY : 480;
        if (this.y >= groundY + LANE_OFFSET) this.isDestroyed = true;

        // --- 画面外判定（左右） ---
        const scrollX = (window.game && window.game.scrollX) || 0;
        if (this.x < scrollX - 40 || this.x > scrollX + CANVAS_WIDTH + 40) {
            this.isDestroyed = true;
        }

        // ★追尾中は地面スレスレで下向き速度を抑える（突き刺さり防止）
        if (this.homing && (groundY - this.y) < 50 && this.vy > 0) {
            this.vy *= 0.3;
        }

        if (this.life <= 0) this.isDestroyed = true;
    }

    getHitbox() {
        return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }

    render(ctx) {
        if (this.isDestroyed) return;
        const lifeRatio = this.life / this.maxLife;
        const speed = Math.hypot(this.vx, this.vy);
        
        // モーションブラー（残像エフェクト）
        if (speed > 2 && lifeRatio > 0.1) {
            ctx.save();
            const blurSteps = 3;
            for (let i = 1; i <= blurSteps; i++) {
                const alpha = (1 - (i / blurSteps)) * 0.4 * Math.min(1, lifeRatio * 2);
                ctx.globalAlpha = alpha;
                const pastX = this.x - this.vx * (i * 0.5);
                const pastY = this.y - this.vy * (i * 0.5);
                const pastRot = this.rotation - (Math.sign(this.vx) * 0.3 * i);
                drawShurikenShape(ctx, pastX, pastY, this.radius * 0.9, pastRot);
            }
            ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = Math.min(1, lifeRatio * 3);
        drawShurikenShape(ctx, this.x, this.y, this.radius, this.rotation);
        ctx.restore();

        // 追尾時の中心線エフェクトは表示しない（穴から伸びる青線を削除）
    }
}

// 手裏剣サブ武器
export class Shuriken extends SubWeapon {
    constructor() {
        super('手裏剣', 10, 200, 320); // Lv0: 初期状態
        this.baseDamage = 10;
        this.baseSpeed = 16;
        this.projectiles = [];
        this.pendingShots = [];
        this.projectileRadius = 12;
        this.projectileRadiusHoming = 16;
        this.heldRotation = 0;
        this.maxOnScreen = 1; // 画面上最大同時存在数
    }

    renderHeld(ctx, handX, handY, scale = 1.0) {
        const r = this.projectileRadius * scale;
        drawShurikenShape(ctx, handX, handY, r, this.heldRotation);
    }

    renderHeldLocal(ctx, localX, localY) {
        const r = this.projectileRadius;
        drawShurikenShape(ctx, localX, localY, r, this.heldRotation);
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        const damages = [10, 12, 13, 14];
        const speeds = [20, 22, 24, 26];
        const maxCounts = [1, 2, 3, 5]; // 画面上最大同時存在数

        this.damage = damages[this.enhanceTier] || damages[0];
        this.bulletSpeed = speeds[this.enhanceTier] || speeds[0];
        this.maxOnScreen = maxCounts[this.enhanceTier] || maxCounts[0];
        this.cooldown = 150; // 投擲モーションのみ
        // Lv3: サイズアップ
        this.sizeUp = (this.enhanceTier >= 3);
    }

    canUse() {
        // 画面上の在空数が最大数未満なら使用可能
        return this.projectiles.length < this.maxOnScreen;
    }

    use(player) {
        if (!this.canUse()) return;

        const tier = this.enhanceTier;
        const pierce = tier >= 2;
        const homing = tier >= 3;
        const direction = player.facingRight ? 1 : -1;

        const baseX = player.x + player.width / 2;
        const baseY = player.y;

        // 1発発射
        this._spawnProjectile(baseX, baseY, direction, pierce, homing);

        // 奥義分身
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            const cloneOffsets = player.getSubWeaponCloneOffsets();
            if (Array.isArray(cloneOffsets) && cloneOffsets.length > 0) {
                for (const clone of cloneOffsets) {
                    player.triggerCloneSubWeapon(clone.index);
                    this._spawnProjectile(
                        baseX + clone.dx, baseY + clone.dy,
                        direction, pierce, homing
                    );
                }
            }
        }

        player.subWeaponAction = 'throw';
        audio.playShuriken();
    }

    _spawnProjectile(baseX, baseY, direction, pierce, homing) {
        const spawnX = baseX + direction * 18;
        const spawnY = baseY + 16;
        const speed = this.bulletSpeed || 20;
        const r = this.sizeUp
            ? (homing ? 20 : 16)
            : (homing ? this.projectileRadiusHoming : this.projectileRadius);

        const proj = new ShurikenProjectile(
            spawnX,
            spawnY,
            direction * speed,
            0,
            this.damage,
            r,
            pierce,
            homing,
            0
        );
        this.projectiles.push(proj);
    }

    update(deltaTime, enemies = []) {
        this.heldRotation += 1.2 * deltaTime;

        // ★projectile は必ずここからだけ更新（enemies を確実に渡す）
        for (const proj of this.projectiles) {
            proj.update(deltaTime, enemies);
        }
        this.projectiles = this.projectiles.filter(p => !p.isDestroyed);
    }

    getHitbox() {
        if (this.projectiles.length === 0) return null;
        const hitboxes = [];
        for (const proj of this.projectiles) {
            if (!proj.isDestroyed) {
                const hb = proj.getHitbox();
                hb._sourceProjectile = proj;
                hitboxes.push(hb);
            }
        }
        return hitboxes.length > 0 ? hitboxes : null;
    }

    render(ctx) {
        for (const proj of this.projectiles) {
            proj.render(ctx);
        }
    }
}

// 火薬玉（爆弾を忍具として扱う）
export class Firebomb extends SubWeapon {
    constructor() {
        super('火薬玉', 25, 70, 700); // Lv0
        this.baseDamage = 25;
        this.baseCooldown = 700;
        this.trackedBombs = []; // 画面上に存在する自分のBomb
        this.maxOnScreen = 1;   // 画面上最大同時存在数
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        
        const damages = [18, 22, 24, 28];
        const ranges = [70, 70, 70, 90];
        const maxCounts = [1, 2, 3, 3]; // 画面上最大同時存在数

        this.damage = damages[this.enhanceTier] || damages[0];
        this.range = ranges[this.enhanceTier] || ranges[0];
        this.maxOnScreen = maxCounts[this.enhanceTier] || maxCounts[0];
        this.cooldown = 150; // 投擲モーションのみ
        this.totalDuration = this.cooldown;
    }

    canUse() {
        // 爆発開始したBombは枠を空ける（爆風が出た瞬間に次を投げられる）
        this.trackedBombs = this.trackedBombs.filter(b => !b.isExploding && !b.isDestroyed);
        return this.trackedBombs.length < this.maxOnScreen;
    }

    render() {
        return;
    }

    use(player) {
        if (!this.canUse()) return;

        const g = window.game;
        if (!g) return;

        const direction = player.facingRight ? 1 : -1;
        let vx = direction * 8;
        let vy = -8;
        let bombY = player.y + 10;

        if (player.isCrouching) {
            vx = direction * 8;
            vy = -4.0;
            bombY = player.y + player.height - 15;
        }

        const tier = this.enhanceTier;
        const sizeUp = tier >= 3;
        const attackMultiplier = Math.max(1, Number(player && player.attackPower) || 1);

        // 1発発射
        const bomb = new Bomb(
            player.x + player.width / 2 + direction * 15,
            bombY,
            vx,
            vy
        );
        const baseBombDamage = sizeUp ? Math.round(this.damage * 1.22) : this.damage;
        bomb.damage = Math.max(1, Math.round(baseBombDamage * attackMultiplier));
        bomb.radius = sizeUp ? 14 : 11;
        bomb.explosionRadius = sizeUp ? Math.round(this.range * 1.16) : this.range;
        bomb.explosionDuration = sizeUp ? 380 : 300;
        g.bombs.push(bomb);
        this.trackedBombs.push(bomb);

        // 奥義分身中は分身位置からも同時投擲
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            const cloneOffsets = player.getSubWeaponCloneOffsets();
            if (Array.isArray(cloneOffsets) && cloneOffsets.length > 0) {
                for (const clone of cloneOffsets) {
                    player.triggerCloneSubWeapon(clone.index);
                    const cloneBomb = new Bomb(
                        player.x + clone.dx + player.width / 2 + direction * 15,
                        bombY + clone.dy,
                        vx + (clone.index % 2 === 0 ? 0.5 : -0.5),
                        vy
                    );
                    cloneBomb.damage = Math.max(1, Math.round(baseBombDamage * attackMultiplier));
                    cloneBomb.radius = sizeUp ? 13 : 10;
                    cloneBomb.explosionRadius = sizeUp ? Math.round(this.range * 1.16) : this.range;
                    cloneBomb.explosionDuration = sizeUp ? 360 : 280;
                    g.bombs.push(cloneBomb);
                }
            }
        }
        audio.playDash();
    }

    update(deltaTime) {
        // 消滅済みBombを追跡リストから除去
        this.trackedBombs = this.trackedBombs.filter(b => !b.isDestroyed);
    }
}

// 大槍
export class Spear extends SubWeapon {
    constructor() {
        // 差し込み特化: 先端火力を高め、やや長射程に
        super('大槍', 20, 132, 360); // Lv0
        this.isAttacking = false;
        this.attackTimer = 0;
        this.baseAttackDuration = 270; 
        this.attackDuration = this.baseAttackDuration;
        this.baseDashBoost = 60;
        this.dashBoost = this.baseDashBoost;
        this.fixedRangeScale = 1.48; // 見た目長
        this.attackDirection = 1;
        this.thrustPulse = 0;
        this.hitEnemies = new Set();
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        const baseRange = Number.isFinite(this.baseRange) ? this.baseRange : this.range;
        this.range = Math.max(24, Math.round(baseRange * this.fixedRangeScale));
        
        // Lv別パラメータ設計
        const damages = [20, 24, 26, 28];
        const cooldowns = [360, 345, 330, 315];
        const durations = [270, 255, 240, 225];
        const dashByTier = [60, 76, 106, 140];

        this.damage = damages[this.enhanceTier] || damages[0];
        this.attackDuration = durations[this.enhanceTier] || durations[0];
        // クールタイムをモーション時間と一致させる（待機時間を撤廃）
        this.cooldown = this.attackDuration;
        this.dashBoost = dashByTier[this.enhanceTier] || dashByTier[0];
    }
    
    use(player) {
        this.isAttacking = true;
        this.attackTimer = this.attackDuration;
        this.thrustPulse = 180;
        this.hitEnemies.clear();
        this.attackDirection = player.facingRight ? 1 : -1;
        audio.playSpear(); 
        
        // Lvごとの横っ飛び差を強く出す
        player.vx += this.attackDirection * this.dashBoost;

        // 分身連動
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            player.getSubWeaponCloneOffsets().forEach(c => player.triggerCloneSubWeapon(c.index));
        }
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.hitEnemies.clear();
            }
        }
        if (this.thrustPulse > 0) {
            this.thrustPulse -= deltaTime * 1000;
        }
    }

    getThrustState(player) {
        const direction = this.isAttacking
            ? (this.attackDirection || (player.facingRight ? 1 : -1))
            : (player.facingRight ? 1 : -1);
        const duration = Math.max(1, this.attackDuration || 250);
        const playerPoseActive = !!(
            player &&
            player.subWeaponAction === '大槍' &&
            player.subWeaponTimer > 0
        );
        const progress = playerPoseActive
            ? Math.max(0, Math.min(1, 1 - (player.subWeaponTimer / duration)))
            : (this.isAttacking
                ? Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)))
                : 0);
        const windup = Math.max(0, 1 - (progress / 0.34));
        const extend = Math.max(0, Math.min(1, (progress - 0.22) / 0.56));
        const thrustDrive = Math.sin(extend * (Math.PI * 0.5));
        // 初動はしっかり引き、そこから押し出す
        const spearPush = -windup * 11.2 + thrustDrive * 12.6;
        const centerX = player.x + player.width / 2 + direction * (8 + spearPush);
        // しゃがみ時も同じ高さ感を維持するため、足元基準で決める
        const footY = player.y + player.height;
        const y = footY - 27;
        // 槍本体は常に最大到達長で維持し、突きは腕/体のモーションで表現する
        const thrust = this.range * 0.84;
        const spearEnd = centerX + direction * thrust;
        const shaftStartX = centerX - direction * 2;
        const shaftStartY = y + 1;
        const shaftEndX = spearEnd - direction * 23;
        const shaftEndY = y;
        const tipLen = 52;
        const tipWidth = 7.4;
        const tipBaseX = spearEnd - direction * tipLen;
        const tipBackX = spearEnd - direction * (tipLen + 10);
        return {
            direction,
            progress,
            centerX,
            y,
            thrust,
            spearEnd,
            shaftStartX,
            shaftStartY,
            shaftEndX,
            shaftEndY,
            tipLen,
            tipWidth,
            tipBaseX,
            tipBackX
        };
    }

    getTubeLayout(shaftLen) {
        // 紫布はさらに根本寄りに、短めに配置
        const tubeStart = Math.max(0.12, shaftLen * 0.006);
        const targetLen = Math.max(22, Math.min(30, shaftLen * 0.2));
        const maxEnd = Math.max(tubeStart + 18, shaftLen - 25);
        const tubeEnd = Math.min(maxEnd, tubeStart + targetLen);
        return {
            tubeStart,
            tubeEnd,
            tubeWidth: Math.max(16, tubeEnd - tubeStart)
        };
    }

    getGripAnchors(player) {
        const st = this.getThrustState(player);
        const shaftDX = st.shaftEndX - st.shaftStartX;
        const shaftDY = st.shaftEndY - st.shaftStartY;
        const shaftLen = Math.max(1, Math.hypot(shaftDX, shaftDY));
        const shaftUX = shaftDX / shaftLen;
        const shaftUY = shaftDY / shaftLen;
        const tube = this.getTubeLayout(shaftLen);

        // 両手とも少し後ろ寄りを握る（奥手が紫布外へ出ないように）
        const rearDist = tube.tubeStart + tube.tubeWidth * 0.54;
        const frontDist = tube.tubeStart + tube.tubeWidth * 0.12;

        return {
            progress: st.progress,
            direction: st.direction,
            rear: {
                x: st.shaftStartX + shaftUX * rearDist,
                y: st.shaftStartY + shaftUY * rearDist + 0.9
            },
            front: {
                x: st.shaftStartX + shaftUX * frontDist,
                y: st.shaftStartY + shaftUY * frontDist + 1.2
            }
        };
    }
    
    getHitbox(player) {
        if (!this.isAttacking) return null;

        const st = this.getThrustState(player);
        const shaftThickness = 13;
        const shaftMinX = Math.min(st.shaftStartX, st.shaftEndX) - shaftThickness * 0.5;
        const shaftMinY = Math.min(st.shaftStartY, st.shaftEndY) - shaftThickness * 0.5;
        const mainHitbox = {
            x: shaftMinX,
            y: shaftMinY,
            width: Math.max(10, Math.abs(st.shaftEndX - st.shaftStartX) + shaftThickness),
            height: Math.max(10, Math.abs(st.shaftEndY - st.shaftStartY) + shaftThickness),
            part: 'shaft'
        };
        const tipPadding = 8;
        const tipHitbox = {
            x: Math.min(st.spearEnd, st.tipBaseX, st.tipBackX) - tipPadding,
            y: st.y - st.tipWidth - tipPadding,
            width: Math.max(st.tipLen + 9, Math.abs(st.spearEnd - st.tipBackX) + tipPadding * 2),
            height: st.tipWidth * 2 + tipPadding * 2,
            part: 'tip'
        };
        const hitboxes = [mainHitbox, tipHitbox];
        if (this.enhanceTier >= 3 && st.progress >= 0.74 && st.progress <= 0.98) {
            const scrollX = window.game ? window.game.scrollX : 0;
            const screenLeft = scrollX;
            const screenRight = scrollX + CANVAS_WIDTH;
            const shockHalfH = 8;
            const shockStartX = st.spearEnd + st.direction * 2;
            const shockEndX = st.direction > 0 ? screenRight + 6 : screenLeft - 6;
            hitboxes.push({
                x: Math.min(shockStartX, shockEndX),
                y: st.y - shockHalfH,
                width: Math.abs(shockEndX - shockStartX),
                height: shockHalfH * 2,
                part: 'shock'
            });
        }
        return hitboxes;
    }
    
    render(ctx, player) {
        const actionVisible = !!(
            player &&
            player.subWeaponAction === '大槍' &&
            player.subWeaponTimer > 0
        );
        if (!this.isAttacking && !actionVisible && (!player || !player.forceSubWeaponRender)) return;

        const st = this.getThrustState(player);
        const shaftDX = st.shaftEndX - st.shaftStartX;
        const shaftDY = st.shaftEndY - st.shaftStartY;
        const shaftLen = Math.max(1, Math.hypot(shaftDX, shaftDY));
        const shaftAngle = Math.atan2(shaftDY, shaftDX);
        const ux = shaftDX / shaftLen;
        const uy = shaftDY / shaftLen;
        const projectLocalX = (x, y) => {
            const dx = x - st.shaftStartX;
            const dy = y - st.shaftStartY;
            return dx * ux + dy * uy;
        };

        const localShaftEnd = projectLocalX(st.shaftEndX, st.shaftEndY);
        const localTip = Math.max(localShaftEnd + 8, projectLocalX(st.spearEnd, st.y));
        const localBladeBase = localTip - 50;
        const localSocketFront = localBladeBase - 1.0;
        const localSocketBack = localSocketFront - 7.8;
        const tube = this.getTubeLayout(localShaftEnd);
        const tubeStart = tube.tubeStart;
        const tubeEnd = tube.tubeEnd;
        const tubeWidth = tube.tubeWidth;

        ctx.save();
        ctx.translate(st.shaftStartX, st.shaftStartY);
        ctx.rotate(shaftAngle);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const drawMetalRing = (xPos, ringW = 4.4, ringH = 4.2) => {
            const ringGrad = ctx.createLinearGradient(0, -ringH, 0, ringH);
            ringGrad.addColorStop(0, '#c8d0db');
            ringGrad.addColorStop(0.5, '#737c89');
            ringGrad.addColorStop(1, '#f0f4fa');
            ctx.fillStyle = ringGrad;
            ctx.fillRect(xPos - ringW * 0.5, -ringH, ringW, ringH * 2);
            ctx.strokeStyle = 'rgba(25, 30, 40, 0.65)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(xPos - ringW * 0.5, -ringH, ringW, ringH * 2);
        };
        // 柄(え): 木製の管をベースに描画
        const shaftStartX = -30;
        const shaftRadius = 2.3;
        const shaftGrad = ctx.createLinearGradient(shaftStartX, 0, localShaftEnd, 0);
        shaftGrad.addColorStop(0, '#3a1f0f');
        shaftGrad.addColorStop(0.38, '#704526');
        shaftGrad.addColorStop(0.7, '#5e351a');
        shaftGrad.addColorStop(1, '#2f170b');
        ctx.strokeStyle = shaftGrad;
        ctx.lineWidth = shaftRadius * 2;
        ctx.beginPath();
        ctx.moveTo(shaftStartX, 0);
        ctx.lineTo(localShaftEnd, 0);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(242, 208, 156, 0.46)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(shaftStartX + 1.2, -1.0);
        ctx.lineTo(localShaftEnd - 10, -0.9);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(30, 12, 7, 0.5)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(shaftStartX + 0.4, 1.6);
        ctx.lineTo(localShaftEnd - 12, 1.4);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(110, 66, 36, 0.62)';
        ctx.lineWidth = 0.9;
        const grainCount = 8;
        for (let i = 0; i < grainCount; i++) {
            const t = (i + 0.8) / (grainCount + 1);
            const gx = shaftStartX + (localShaftEnd - shaftStartX) * t;
            const gl = 5 + (i % 3) * 2;
            ctx.beginPath();
            ctx.moveTo(gx - gl * 0.55, -1.1);
            ctx.quadraticCurveTo(gx, -2.1, gx + gl * 0.55, -0.1);
            ctx.stroke();
        }

        // 紫の管（布巻き） + 銀装飾
        const tubeHalfW = shaftRadius * 0.84;
        const tubeGrad = ctx.createLinearGradient(tubeStart, 0, tubeEnd, 0);
        tubeGrad.addColorStop(0, '#3a2a70');
        tubeGrad.addColorStop(0.42, '#5a48a2');
        tubeGrad.addColorStop(1, '#2f255f');
        ctx.fillStyle = tubeGrad;
        ctx.fillRect(tubeStart, -tubeHalfW, tubeWidth, tubeHalfW * 2);
        ctx.strokeStyle = 'rgba(214, 206, 240, 0.34)';
        ctx.lineWidth = 0.82;
        ctx.strokeRect(tubeStart + 0.3, -tubeHalfW + 0.3, Math.max(1, tubeWidth - 0.6), tubeHalfW * 2 - 0.6);

        // 左側リングは細め、右側リングは太め
        drawMetalRing(tubeStart - 0.52, 1.55, shaftRadius * 0.9);
        drawMetalRing(tubeEnd - 0.14, 5.2, 4.25);

        // 胴金・管留め
        drawMetalRing(localShaftEnd - 17.6, 4.8, 3.7);
        drawMetalRing(localShaftEnd - 9.6, 4.6, 4.0);

        // 逆輪付きの口金ソケット
        const socketRearW = 3.55;
        const socketFrontW = 2.75;
        const socketGrad = ctx.createLinearGradient(localSocketBack, 0, localSocketFront, 0);
        socketGrad.addColorStop(0, '#6e7785');
        socketGrad.addColorStop(0.5, '#c8d2df');
        socketGrad.addColorStop(1, '#798391');
        ctx.fillStyle = socketGrad;
        ctx.beginPath();
        ctx.moveTo(localSocketBack, -socketRearW);
        ctx.lineTo(localSocketFront, -socketFrontW);
        ctx.lineTo(localSocketFront, socketFrontW);
        ctx.lineTo(localSocketBack, socketRearW);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(34, 40, 49, 0.7)';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // 刃: 参照画像寄りの槍穂（葉形、鋭い先端）
        const bladeHalfW = 8.4;
        const bladeSpan = localTip - localBladeBase;
        const bladeBellyX = localBladeBase + bladeSpan * 0.58;
        const bladeBaseHalf = 1.68;
        const bladeGrad = ctx.createLinearGradient(localBladeBase, 0, localTip, 0);
        bladeGrad.addColorStop(0, '#778291');
        bladeGrad.addColorStop(0.34, '#b9c4cf');
        bladeGrad.addColorStop(0.68, '#8f9aa7');
        bladeGrad.addColorStop(1, '#626d7c');

        const traceBladePath = () => {
            ctx.beginPath();
            ctx.moveTo(localTip, 0);
            ctx.bezierCurveTo(
                localTip - bladeSpan * 0.22, -bladeHalfW * 0.06,
                bladeBellyX, -bladeHalfW * 1.0,
                localBladeBase, -bladeBaseHalf
            );
            ctx.lineTo(localBladeBase, bladeBaseHalf);
            ctx.bezierCurveTo(
                bladeBellyX, bladeHalfW * 1.0,
                localTip - bladeSpan * 0.22, bladeHalfW * 0.06,
                localTip, 0
            );
            ctx.closePath();
        };

        ctx.fillStyle = bladeGrad;
        traceBladePath();
        ctx.fill();

        // 刃断面の陰影（崩れ防止のためレイヤーを整理）
        ctx.save();
        traceBladePath();
        ctx.clip();
        const bladeCrossGrad = ctx.createLinearGradient(localBladeBase, -bladeHalfW, localBladeBase, bladeHalfW);
        bladeCrossGrad.addColorStop(0, 'rgba(56, 66, 80, 0.34)');
        bladeCrossGrad.addColorStop(0.46, 'rgba(236, 242, 248, 0.23)');
        bladeCrossGrad.addColorStop(1, 'rgba(52, 62, 78, 0.38)');
        ctx.fillStyle = bladeCrossGrad;
        ctx.fillRect(localBladeBase - 1, -bladeHalfW - 1, bladeSpan + 2, bladeHalfW * 2 + 2);

        const specGrad = ctx.createLinearGradient(localBladeBase + 5, -bladeHalfW * 0.8, localTip - 1.5, bladeHalfW * 0.55);
        specGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        specGrad.addColorStop(0.45, 'rgba(230, 238, 247, 0.24)');
        specGrad.addColorStop(0.62, 'rgba(246, 250, 255, 0.33)');
        specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = specGrad;
        ctx.fillRect(localBladeBase + 1.5, -bladeHalfW - 1, bladeSpan + 1, bladeHalfW * 2 + 2);
        ctx.restore();

        ctx.strokeStyle = '#5a6676';
        ctx.lineWidth = 0.95;
        traceBladePath();
        ctx.stroke();

        // 中央鎬線と面ラインは刃の内側だけに描き、崩れを防止
        ctx.save();
        traceBladePath();
        ctx.clip();
        ctx.strokeStyle = 'rgba(98, 113, 132, 0.74)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(localBladeBase + bladeSpan * 0.09, 0);
        ctx.quadraticCurveTo(localBladeBase + bladeSpan * 0.62, -0.3, localTip - 1.0, 0);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(173, 186, 202, 0.5)';
        ctx.lineWidth = 0.52;
        ctx.beginPath();
        ctx.moveTo(localBladeBase + bladeSpan * 0.18, -bladeHalfW * 0.38);
        ctx.quadraticCurveTo(localBladeBase + bladeSpan * 0.62, -bladeHalfW * 0.14, localTip - bladeSpan * 0.2, -0.28);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(localBladeBase + bladeSpan * 0.18, bladeHalfW * 0.38);
        ctx.quadraticCurveTo(localBladeBase + bladeSpan * 0.62, bladeHalfW * 0.14, localTip - bladeSpan * 0.2, 0.28);
        ctx.stroke();
        ctx.restore();

        // 突き先の残光
        if (this.thrustPulse > 0) {
            const pulseRatio = this.thrustPulse / 180;
            ctx.strokeStyle = `rgba(184, 246, 255, ${pulseRatio * 0.85})`;
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.arc(localTip + 3.8, 0, 10 + (1 - pulseRatio) * 14, -0.92, 0.92);
            ctx.stroke();
        }

        ctx.restore();

        // 突きのエフェクト(衝撃波・風切り)
        if (this.isAttacking && st.progress > 0) {
            ctx.save();
            ctx.translate(st.spearEnd, st.y);
            ctx.scale(st.direction, 1);
            const tier = this.enhanceTier || 0;
            const attackWave = Math.max(0, Math.sin(st.progress * Math.PI));
            const thrustSnap = Math.max(0, Math.min(1, (st.progress - 0.16) / 0.34));
            const fadeOut = 1 - Math.max(0, (st.progress - 0.76) / 0.24);
            const alpha = attackWave * fadeOut;
            if (alpha <= 0.001) {
                ctx.restore();
                return;
            }

            const streakBase = 86 + tier * 20;
            const burstReach = 56 + thrustSnap * (34 + tier * 10);
            ctx.globalCompositeOperation = 'lighter';

            // コアの刺突光
            const coreGrad = ctx.createLinearGradient(0, 0, streakBase + 90, 0);
            coreGrad.addColorStop(0, `rgba(244, 255, 255, ${(alpha * 0.92).toFixed(3)})`);
            coreGrad.addColorStop(0.36, `rgba(190, 246, 255, ${(alpha * 0.64).toFixed(3)})`);
            coreGrad.addColorStop(1, 'rgba(112, 210, 255, 0)');
            ctx.strokeStyle = coreGrad;
            ctx.lineWidth = 2.8 + tier * 0.65;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(streakBase + 90, 0);
            ctx.stroke();

            // 多層ストリーク（速度感）
            for (let i = 0; i < 4; i++) {
                const lane = i - 1.5;
                const laneAlpha = alpha * (0.5 - i * 0.07);
                const laneLen = streakBase + 28 + i * 15 + thrustSnap * (18 + i * 6);
                ctx.strokeStyle = `rgba(186, 236, 255, ${Math.max(0.08, laneAlpha).toFixed(3)})`;
                ctx.lineWidth = Math.max(0.9, 1.6 - i * 0.2);
                ctx.beginPath();
                ctx.moveTo(6 + i * 2.2, lane * 3.8);
                ctx.quadraticCurveTo(laneLen * 0.44, lane * (6.2 + i * 1.0), laneLen, lane * (8.8 + i * 1.5));
                ctx.stroke();
            }

            // 先端の圧縮衝撃（コーン）
            const burstGrad = ctx.createLinearGradient(0, 0, burstReach + 56, 0);
            burstGrad.addColorStop(0, `rgba(236, 255, 255, ${(alpha * 0.86).toFixed(3)})`);
            burstGrad.addColorStop(0.52, `rgba(158, 226, 255, ${(alpha * 0.42).toFixed(3)})`);
            burstGrad.addColorStop(1, 'rgba(108, 192, 255, 0)');
            ctx.fillStyle = burstGrad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(burstReach * 0.56, -6.8 - thrustSnap * 8.0);
            ctx.lineTo(burstReach + 56 + thrustSnap * 24, 0);
            ctx.lineTo(burstReach * 0.56, 6.8 + thrustSnap * 8.0);
            ctx.closePath();
            ctx.fill();

            // 先端周辺のリング状ショック
            ctx.strokeStyle = `rgba(224, 248, 255, ${(alpha * 0.66).toFixed(3)})`;
            ctx.lineWidth = 1.7;
            ctx.beginPath();
            ctx.arc(8 + thrustSnap * 8, 0, 7 + thrustSnap * 14, -0.78, 0.78);
            ctx.stroke();

            if (tier >= 3 && st.progress > 0.74 && st.progress < 0.98) {
                const shockAlpha = alpha * 0.72;
                ctx.strokeStyle = `rgba(216, 246, 255, ${shockAlpha})`;
                ctx.lineWidth = 4.8;
                ctx.lineCap = 'round';
                const far = CANVAS_WIDTH + 120;
                ctx.beginPath();
                ctx.moveTo(8, -6.4);
                ctx.lineTo(far, -6.4);
                ctx.moveTo(8, 6.4);
                ctx.lineTo(far, 6.4);
                ctx.stroke();
            }

            ctx.restore();
        }
    }
}

// 二刀
export class DualBlades extends SubWeapon {
    constructor() {
        // 手数特化: 一撃は軽め、連撃でDPSを出す（合体技を最強にするため基本値を底上げ）
        super('二刀流', 22, 64, 180);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackType = 'combined'; // 'main', 'left', 'right', 'combined'
        this.projectiles = []; 
        this.comboIndex = 0; // 連撃パターン用
        this.mainDuration = 204;
        this.baseMainMotionSpeedScale = 1.7;
        this.mainMotionSpeedScale = this.baseMainMotionSpeedScale; // 通常Z連撃と近い体感速度に合わせる
        this.baseCombinedDuration = 740; // 1.3x速 (初期900に対して 1060->740まで追い込む)
        this.baseSideDuration = 150;
        this.combinedDuration = this.baseCombinedDuration;
        this.sideDuration = this.baseSideDuration;
        this.attackDirection = 1;
        this.pendingCombinedProjectile = null;
        this.prevMainRightAngle = null;
        this.prevMainLeftAngle = null;
        this.activeSideDuration = this.sideDuration;
        this.activeCombinedDuration = this.combinedDuration;
        this.mainTrailFadeSnapshot = [];
        this.mainTrailFadeAgeMs = 0;
        this.mainTrailFadeLifeMs = 320;
        this.mainTrailFadeMaxScale = 1;
        this.mainTrailFadeActive = false;
        // 二刀Zの次段受付猶予（この時間を過ぎると1段目に戻る）
        this.mainComboLinkTimer = 0;
        this.mainComboLinkGraceMs = 170;
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        
        // Z連撃（通常攻撃）の段数ごと威力：Lv0(2連), Lv1(3連), Lv2(4連), Lv3(5連)
        const zDamages = [
            [14, 16],
            [15, 17, 19],
            [16, 18, 20, 22],
            [17, 19, 21, 24, 28]
        ];
        // X合体技（大太刀の1.3倍：44, 52, 56, 60）
        const xDamages = [44, 52, 56, 60];
        
        const cooldowns = [220, 200, 190, 180];
        const motionScales = [1.0, 1.05, 1.10, 1.15];
        const xMotionScales = [1.0, 1.05, 1.10, 1.20];

        this.comboDamages = zDamages[this.enhanceTier] || zDamages[0];
        this.xDamage = xDamages[this.enhanceTier] || xDamages[0];

        // 速度向上を廃止 (1.0 固定)
        this.motionScale = 1.0;
        this.xMotionScale = 1.0;
        this.xSizeUp = (this.enhanceTier >= 3);
        
        // 合体技の動作時間をLv別に短縮（一律15ms刻み）
        const combinedDurations = [560, 545, 530, 515];
        this.combinedDuration = combinedDurations[this.enhanceTier] || combinedDurations[0];
        this.activeCombinedDuration = this.combinedDuration;
        this.cooldown = this.combinedDuration;
        this.totalDuration = this.cooldown;
    }

    getMainDurationByStep(step) {
        let base = 220;
        switch (step) {
            case 1: base = 148; break; // 初段: 抜き打ち
            case 2: base = 262; break; // 二段: 逆袈裟
            case 3: base = 186; break; // 三段: クロスステップ薙ぎ
            case 4: base = 286; break; // 四段: 胸前クロスから払い上げ
            default: base = 358; break; // 五段(0): 落下断ち
        }
        // 4〜5撃目は一段速いテンポに寄せる
        if (step === 4 || step === 0) {
            base *= 0.6;
        }
        return Math.round(base * this.mainMotionSpeedScale);
    }

    getLeftSwingArc() {
        if (this.comboIndex === 1) {
            return { start: -Math.PI * 0.5, end: Math.PI * 0.5 };
        }
        if (this.comboIndex === 2) {
            return { start: Math.PI * 0.28, end: -Math.PI * 0.55 };
        }
        if (this.comboIndex === 3) {
            return { start: 0, end: Math.PI * 2 };
        }
        return { start: -Math.PI * 0.75, end: Math.PI * 0.22 };
    }

    getLeftSwingProgress() {
        const duration = Math.max(1, this.activeSideDuration || this.sideDuration || 150);
        return Math.max(0, Math.min(1, this.attackTimer / duration));
    }

    getLeftSwingAngle() {
        const { start, end } = this.getLeftSwingArc();
        const progress = this.getLeftSwingProgress();
        return start + (end - start) * (1 - progress);
    }

    getCombinedSwingProgress() {
        const duration = Math.max(1, this.activeCombinedDuration || this.combinedDuration || 320);
        return Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
    }

    getMainSwingProgress(options = {}) {
        const timer = options.attackTimer !== undefined ? options.attackTimer : this.attackTimer;
        let duration = this.mainDuration;
        if (options.comboIndex !== undefined) {
            duration = this.getMainDurationByStep(options.comboIndex);
        }
        return Math.max(0, Math.min(1, 1 - (timer / duration)));
    }

    remapMainSwingProgress(step, progress) {
        const p = Math.max(0, Math.min(1, progress));
        if (step === 1) {
            // 初段: ほぼ即出しの抜き打ち
            return p < 0.1
                ? (p / 0.1) * 0.3
                : 0.3 + ((p - 0.1) / 0.9) * 0.7;
        }
        if (step === 2) {
            // 二段: 引きつけて一気に返す
            return p < 0.38
                ? (p / 0.38) * 0.08
                : 0.08 + ((p - 0.38) / 0.62) * 0.92;
        }
        if (step === 3) {
            // 三段: 踏み替えの間を挟んだ二拍子
            if (p < 0.22) return (p / 0.22) * 0.42;
            if (p < 0.4) return 0.42 + ((p - 0.22) / 0.18) * 0.1;
            if (p < 0.84) return 0.52 + ((p - 0.4) / 0.44) * 0.4;
            return 0.92 + ((p - 0.84) / 0.16) * 0.08;
        }
        if (step === 4) {
            // 四段: 胸前でクロスを作って一拍止め、斜めに切り上げる
            if (p < 0.18) return (p / 0.18) * 0.2;
            if (p < 0.44) return 0.2 + ((p - 0.18) / 0.26) * 0.18;
            if (p < 0.86) return 0.38 + ((p - 0.44) / 0.42) * 0.5;
            return 0.88 + ((p - 0.86) / 0.14) * 0.12;
        }
        // 五段目(0): 頭上で溜めて落下断ち
        if (p < 0.34) return (p / 0.34) * 0.1;
        if (p < 0.82) return 0.1 + ((p - 0.34) / 0.48) * 0.74;
        return 0.84 + ((p - 0.82) / 0.18) * 0.16;
    }

    getMainSwingArcs(options = {}) {
        const index = options.comboIndex !== undefined ? options.comboIndex : this.comboIndex;
        switch (index) {
            case 1:
                return {
                    rightStart: -2.36, rightEnd: -0.16,
                    leftStart: 2.46, leftEnd: -0.14,
                    effectRadius: 88,
                    hit: 'drawDash'
                };
            case 2:
                return {
                    rightStart: 0.84, rightEnd: 2.46,
                    leftStart: -2.68, leftEnd: -0.26,
                    effectRadius: 98,
                    hit: 'reverseCounter'
                };
            case 3:
                return {
                    rightStart: -0.22, rightEnd: 1.42,
                    leftStart: 2.86, leftEnd: 1.2,
                    effectRadius: 102,
                    hit: 'crossStepSweep'
                };
            case 4:
                return {
                    rightStart: 1.48, rightEnd: -1.88,
                    leftStart: 1.16, leftEnd: -1.02,
                    effectRadius: 106,
                    hit: 'risingX'
                };
            default:
                return {
                    rightStart: -1.82, rightEnd: 1.24,
                    leftStart: -1.08, leftEnd: 1.98,
                    effectRadius: 118,
                    hit: 'fallingBreak'
                };
        }
    }

    getMainSwingPose(options = {}) {
        const progress = this.getMainSwingProgress(options);
        const index = options.comboIndex !== undefined ? options.comboIndex : this.comboIndex;
        const remapped = this.remapMainSwingProgress(index, progress);
        const eased = remapped * remapped * (3 - 2 * remapped);
        const arcs = this.getMainSwingArcs(options);
        return {
            progress,
            remapped,
            eased,
            comboIndex: index,
            arcs,
            rightAngle: arcs.rightStart + (arcs.rightEnd - arcs.rightStart) * eased,
            leftAngle: arcs.leftStart + (arcs.leftEnd - arcs.leftStart) * eased
        };
    }
    
    use(player, type = 'combined') {
        this.isAttacking = true;
        this.attackType = type;
        this.attackDirection = player.facingRight ? 1 : -1;
        this.prevMainRightAngle = null;
        this.prevMainLeftAngle = null;
        const enemyTempoScale = player && player.isEnemy ? 0.76 : 1.0;
        const enemyCombinedTempoScale = player && player.isEnemy ? 0.84 : 1.0;
        this.activeSideDuration = Math.max(78, Math.round(this.sideDuration * enemyTempoScale));
        this.activeCombinedDuration = Math.max(170, Math.round(this.combinedDuration * enemyCombinedTempoScale));
        
        if (type === 'combined') {
            this.attackTimer = this.activeCombinedDuration;
            this.mainComboLinkTimer = 0;
            this.comboIndex = 0;
            // 振り下ろしタイミングで発射するため、一旦保留。座標は発射時に計算する
            this.pendingCombinedProjectile = {
                vx: this.attackDirection * (11.4 + this.enhanceTier * 1.15),
                life: 700 + this.enhanceTier * 90,
                maxLife: 700 + this.enhanceTier * 90,
                direction: this.attackDirection,
                sizeScale: this.enhanceTier >= 3 ? 1.14 : 1.0,
                _owner: player // 発射時に座標を取得するために保持
            };
            audio.playDualBladeCombined();
        } else if (type === 'main') {
        // 5段コンボのループ
        if (this.mainComboLinkTimer <= 0) {
            this.comboIndex = 0;
        }
        this.comboIndex = (this.comboIndex + 1) % this.comboDamages.length;
        const damage = this.comboDamages[this.comboIndex] || this.comboDamages[0];
        this.mainDuration = Math.max(
            112,
            Math.round(this.getMainDurationByStep(this.comboIndex) * enemyTempoScale)
        );
        this.attackTimer = this.mainDuration;
        this.mainComboLinkTimer = this.mainDuration + this.mainComboLinkGraceMs;
        audio.playSlash(this.comboIndex);
        // ここでdamageを使用する処理があれば追記（現在はspawnEffect側で判定）
    } else if (type === 'left') {
            this.attackTimer = this.activeSideDuration;
            // 4段コンボのループ (0 -> 1 -> 2 -> 3 -> 0)
            this.comboIndex = (this.comboIndex + 1) % 4;
            audio.playSlash(1);
        } else {
            this.attackTimer = this.activeSideDuration;
            audio.playSlash(0);
        }

        // 分身連動
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            player.getSubWeaponCloneOffsets().forEach(c => player.triggerCloneSubWeapon(c.index));
        }
    }
    
    update(deltaTime) {
        if (this.mainComboLinkTimer > 0) {
            this.mainComboLinkTimer -= deltaTime * 1000;
            if (this.mainComboLinkTimer <= 0) {
                this.mainComboLinkTimer = 0;
                this.comboIndex = 0;
            }
        }

        if (this.isAttacking) {
            // 合体攻撃は前半を溜め、新タイミング（0.68: 振り下ろし開始）の瞬間に飛翔斬撃を出す
            if (this.attackType === 'combined' && this.pendingCombinedProjectile && this.getCombinedSwingProgress() >= 0.68) {
                const p = this.pendingCombinedProjectile;
                const owner = p._owner;
                if (owner) {
                    // 発射の瞬間のプレイヤー座標から基点を計算（移動に追従させる）
                    p.x = owner.x + owner.width / 2;
                    p.y = owner.y + owner.height / 2;
                }
                this.projectiles.push(p);
                this.pendingCombinedProjectile = null;
            }
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 20) { // わずかなマージンを持たせて終了判定
                this.isAttacking = false;
                this.pendingCombinedProjectile = null;
                this.prevMainRightAngle = null;
                this.prevMainLeftAngle = null;
                this.activeSideDuration = this.sideDuration;
                this.activeCombinedDuration = this.combinedDuration;
            }
        }
        if (!this.isAttacking && this.mainTrailFadeActive) {
            this.mainTrailFadeAgeMs += deltaTime * 1000;
            const fadeLife = Math.max(1, (this.mainTrailFadeLifeMs || 320) * (this.mainTrailFadeMaxScale || 1));
            if (this.mainTrailFadeAgeMs >= fadeLife) {
                this.mainTrailFadeAgeMs = fadeLife;
                this.mainTrailFadeActive = false;
                this.mainTrailFadeSnapshot = [];
                this.mainTrailFadeMaxScale = 1;
            }
        }
        
        // 飛ぶ斬撃の移動と寿命更新
        if (this.projectiles.length > 0) {
            this.projectiles = this.projectiles.filter(p => {
                p.x += p.vx;
                p.life -= deltaTime * 1000;
                return p.life > 0;
            });
        }
    }
    
    getHitbox(player) {
        const hitboxes = [];
        if (this.isAttacking) {
            const direction = this.attackDirection;
            const centerX = player.x + player.width / 2;
            const centerY = player.y + player.height / 2;

            if (this.attackType === 'main') {
                const arcs = this.getMainSwingArcs();
                const frontX = player.x + (direction > 0 ? player.width : -this.range * 1.4);
                const backX = player.x + (direction > 0 ? -this.range * 1.35 : player.width);
                const coreW = this.range * 0.75;
                if (arcs.hit === 'drawDash') {
                    hitboxes.push({
                        x: frontX,
                        y: player.y - 24,
                        width: this.range * 1.48,
                        height: 86
                    });
                    hitboxes.push({
                        x: centerX - coreW * 0.5,
                        y: centerY - 54,
                        width: coreW * 0.98,
                        height: 106
                    });
                } else if (arcs.hit === 'reverseCounter') {
                    hitboxes.push({
                        x: frontX - this.range * 0.16,
                        y: player.y - 72,
                        width: this.range * 1.4,
                        height: 118
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.66,
                        y: player.y - 84,
                        width: this.range * 1.26,
                        height: 92
                    });
                } else if (arcs.hit === 'crossStepSweep') {
                    hitboxes.push({
                        x: backX - this.range * 0.16,
                        y: centerY - 30,
                        width: this.range * 1.74,
                        height: 66
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.92,
                        y: centerY - 22,
                        width: this.range * 1.84,
                        height: 56
                    });
                } else if (arcs.hit === 'risingX') {
                    hitboxes.push({
                        x: centerX - this.range * 0.74,
                        y: centerY - this.range * 0.86,
                        width: this.range * 1.82,
                        height: this.range * 1.7
                    });
                    hitboxes.push({
                        x: frontX - this.range * 0.1,
                        y: player.y - 34,
                        width: this.range * 1.52,
                        height: 92
                    });
                } else {
                    const sRange = this.range * 1.82;
                    hitboxes.push({
                        x: centerX - sRange,
                        y: centerY - sRange * 0.98,
                        width: sRange * 2,
                        height: sRange * 2.14
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.48,
                        y: centerY + 4,
                        width: this.range * 0.96,
                        height: this.range * 1.24
                    });
                }
            } else {
            
                // 旧X攻撃（後方）
                if (this.attackType === 'left') {
                    if (this.comboIndex === 3) {
                        const sRange = this.range * 1.5;
                        hitboxes.push({
                            x: player.x + player.width / 2 - sRange,
                            y: player.y + player.height / 2 - sRange,
                            width: sRange * 2,
                            height: sRange * 2
                        });
                    } else {
                        hitboxes.push({
                            x: player.x + (direction > 0 ? -this.range * 1.2 : player.width),
                            y: player.y - 10,
                            width: this.range * 1.2,
                            height: 60
                        });
                    }
                } else {
                    // 前方（右手 or 合体）
                    if (this.comboIndex === 3) {
                        const sRange = this.range * 1.5;
                        hitboxes.push({
                            x: player.x + player.width / 2 - sRange,
                            y: player.y + player.height / 2 - sRange,
                            width: sRange * 2,
                            height: sRange * 2
                        });
                    } else {
                        hitboxes.push({
                            x: player.x + (direction > 0 ? player.width : -this.range * 1.2),
                            y: player.y - 10,
                            width: this.range * 1.2,
                            height: 60
                        });
                    }
                }
            }

            const dualZBoostScale = (
                this.attackType === 'main' &&
                player &&
                typeof player.isXAttackBoostActive === 'function' &&
                player.isXAttackBoostActive() &&
                player.subWeaponAction === '二刀_Z' &&
                typeof player.getXAttackHitboxScale === 'function'
            ) ? Math.max(1, player.getXAttackHitboxScale()) : 1;
            if (dualZBoostScale > 1.001 && this.attackType === 'main' && hitboxes.length > 0) {
                for (let i = 0; i < hitboxes.length; i++) {
                    const hb = hitboxes[i];
                    if (!hb) continue;
                    const cx = hb.x + hb.width * 0.5;
                    const cy = hb.y + hb.height * 0.5;
                    const nextW = hb.width * dualZBoostScale;
                    const nextH = hb.height * dualZBoostScale;
                    hitboxes[i] = {
                        ...hb,
                        x: cx - nextW * 0.5,
                        y: cy - nextH * 0.5,
                        width: nextW,
                        height: nextH
                    };
                }
            }
        }
        for (const p of this.projectiles) {
            const sizeScale = Number.isFinite(p.sizeScale) ? p.sizeScale : 1.0;
            const half = 42 * sizeScale;
            hitboxes.push({
                x: p.x - half, y: p.y - half,
                width: half * 2, height: half * 2,
                part: 'projectile'
            });
        }
        return hitboxes.length > 0 ? hitboxes : null;
    }
    
    render(ctx, player) {
        const direction = this.isAttacking ? this.attackDirection : (player.facingRight ? 1 : -1);
        const enemyTrailBoost = player && player.type === 'boss' ? 1.2 : 1;
        const xTrailBoost = (
            player &&
            typeof player.isXAttackBoostActive === 'function' &&
            player.isXAttackBoostActive() &&
            player.subWeaponAction === '二刀_Z' &&
            typeof player.getXAttackTrailWidthScale === 'function'
        ) ? Math.max(1, player.getXAttackTrailWidthScale()) : 1;
        const trailScale = enemyTrailBoost * xTrailBoost;
        const resolveHitboxCenter = (boxes) => {
            if (!boxes) return null;
            const arr = Array.isArray(boxes) ? boxes : [boxes];
            let sumX = 0;
            let sumY = 0;
            let sumW = 0;
            for (let i = 0; i < arr.length; i++) {
                const hb = arr[i];
                if (!hb || hb.part === 'projectile') continue;
                if (!Number.isFinite(hb.x) || !Number.isFinite(hb.y) || !Number.isFinite(hb.width) || !Number.isFinite(hb.height)) continue;
                const area = Math.max(1, hb.width * hb.height);
                sumX += (hb.x + hb.width * 0.5) * area;
                sumY += (hb.y + hb.height * 0.5) * area;
                sumW += area;
            }
            if (sumW <= 0) return null;
            return { x: sumX / sumW, y: sumY / sumW };
        };
        
        const drawStoredMainTrailFade = () => {
            if (!this.mainTrailFadeActive || !Array.isArray(this.mainTrailFadeSnapshot) || this.mainTrailFadeSnapshot.length <= 0) return;
            for (let i = 0; i < this.mainTrailFadeSnapshot.length; i++) {
                const seg = this.mainTrailFadeSnapshot[i];
                if (!seg) continue;
                const segLifeScale = Number.isFinite(seg.fadeLifeScale) ? Math.max(0.5, seg.fadeLifeScale) : 1;
                const life = Math.max(1, (this.mainTrailFadeLifeMs || 320) * segLifeScale);
                const t = Math.max(0, Math.min(1, 1 - (this.mainTrailFadeAgeMs / life)));
                if (t <= 0.01) continue;
                const fade = t * t * (3 - 2 * t);
                const frontAlpha = Math.max(0, Math.min(1, (seg.frontAlpha || 0) * fade));
                if (frontAlpha <= 0.01) continue;
                ctx.save();
                ctx.translate(seg.pivotX, seg.pivotY);
                ctx.scale(seg.direction, 1);
                ctx.lineCap = 'round';
                ctx.strokeStyle = `rgba(${seg.frontColor[0]}, ${seg.frontColor[1]}, ${seg.frontColor[2]}, ${frontAlpha})`;
                ctx.lineWidth = seg.width;
                ctx.beginPath();
                ctx.arc(seg.localCenterX, 0, seg.radius, seg.start, seg.end, seg.ccw);
                ctx.stroke();
                ctx.strokeStyle = `rgba(255, 255, 255, ${frontAlpha * 0.46})`;
                ctx.lineWidth = Math.max(1.4, seg.width * 0.18);
                ctx.beginPath();
                ctx.arc(seg.localCenterX + 1.4, -1.2, Math.max(2, seg.radius - 2.2), seg.start + 0.03, seg.end + 0.03, seg.ccw);
                ctx.stroke();
                ctx.restore();
            }
        };

        // 1. 飛翔する交差斬撃（高輝度の三日月クロス）
        for (const p of this.projectiles) {
            const alpha = p.life / p.maxLife;
            const sizeScale = Number.isFinite(p.sizeScale) ? p.sizeScale : 1.0;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(p.direction * 1.35 * sizeScale, 1.35 * sizeScale);

            const travelRatio = 1 - alpha;
            const forward = travelRatio * 18;
            const drawCrescent = (color, angle) => {
                ctx.save();
                ctx.translate(forward, 0);
                ctx.rotate(angle);
                ctx.globalAlpha = alpha;
                // ctx.shadowColor = color;
                // ctx.shadowBlur = 20;
                ctx.fillStyle = color;

                ctx.beginPath();
                ctx.moveTo(0, -46);
                ctx.bezierCurveTo(24, -22, 24, 22, 0, 46);
                ctx.bezierCurveTo(7, 22, 7, -22, 0, -46);
                ctx.fill();

                ctx.restore();
            };

            // 近接の剣筋と色対応を揃える（奥の刀=青→上の三日月が青、手前の刀=赤→下の三日月が赤）
            drawCrescent('rgba(80, 200, 255, 0.98)', -Math.PI / 4);
            drawCrescent('rgba(255, 80, 80, 0.98)', Math.PI / 4);

            ctx.restore();
        }

        if (!this.isAttacking) {
            this.prevMainRightAngle = null;
            this.prevMainLeftAngle = null;
            drawStoredMainTrailFade();
            return;
        }
        
        const isMain = this.attackType === 'main';
        const isCombined = this.attackType === 'combined';
        if (isMain) {
            const liveTrailSnapshot = [];
            const centerX = player.x + player.width / 2;
            const centerY = player.y + player.height / 2;
            const boostHitboxCenter = xTrailBoost > 1.001
                ? resolveHitboxCenter(this.getHitbox(player))
                : null;
            const poseOptions = (
                player &&
                player.subWeaponAction === '二刀_Z' &&
                player.subWeaponPoseOverride
            ) ? player.subWeaponPoseOverride : undefined;
            const pose = this.getMainSwingPose(poseOptions || {});
            const alpha = Math.max(0.38, 1 - pose.progress * 0.42);
            const toAdjustedAngle = (rawAngle) => rawAngle + ((-Math.PI / 2) - rawAngle) * 0.28;
            const trailAnchorPack = (
                player &&
                player.subWeaponAction === '二刀_Z' &&
                player.dualBladeTrailAnchors &&
                player.dualBladeTrailAnchors.direction === direction
            ) ? player.dualBladeTrailAnchors : null;
            const backTrailAnchor = trailAnchorPack ? trailAnchorPack.back : null;
            const frontTrailAnchor = trailAnchorPack ? trailAnchorPack.front : null;

            const drawTrackedArcSlash = (
                palette,
                currentAngle,
                swingDelta,
                traversedSpan,
                fullSwingSpan,
                radius,
                width,
                yOffset = 0,
                spanGain = 1,
                xOffset = 0,
                tipAnchor = null,
                completeThenTrim = false,
                trailBackScale = 1.55,
                leadScale = 1,
                sweepSign = 0,
                startAnchorAngle = null
            ) => {
                const swingSpeed = Math.abs(swingDelta);
                const motionProgress = Math.max(0, Math.min(1, pose.progress));
                const visibilityPhase = Math.max(0, Math.sin(motionProgress * Math.PI));
                if (swingSpeed < 0.004 && visibilityPhase < 0.28) return;

                const tipLocked = !boostHitboxCenter && !!(
                    tipAnchor &&
                    Number.isFinite(tipAnchor.tipX) &&
                    Number.isFinite(tipAnchor.tipY)
                );
                if (tipLocked && Number.isFinite(tipAnchor.angle)) {
                    // 腕描画と同じ角度を優先し、剣筋の先端を切っ先へ正確に合わせる
                    currentAngle = tipAnchor.angle;
                }
                const mainArcCenterX = -5 + xOffset;
                const mainArcCenterY = 0;
                let pivotX = centerX;
                let pivotY = centerY + yOffset;
                if (boostHitboxCenter) {
                    pivotX = boostHitboxCenter.x;
                    pivotY = boostHitboxCenter.y + yOffset;
                } else if (tipLocked) {
                    const tipLocalX = mainArcCenterX + Math.cos(currentAngle) * radius;
                    const tipLocalY = mainArcCenterY + Math.sin(currentAngle) * radius;
                    pivotX = tipAnchor.tipX - direction * tipLocalX;
                    pivotY = tipAnchor.tipY - tipLocalY;
                }

                ctx.save();
                ctx.translate(pivotX, pivotY);
                ctx.scale(direction, 1);
                ctx.lineCap = 'round';
                const movingForward = (Number.isFinite(sweepSign) && Math.abs(sweepSign) > 0.001)
                    ? (sweepSign >= 0)
                    : (swingDelta >= 0);
                const dynamicSpan = swingSpeed * 14.6 * spanGain;
                const lingerSpan = (0.18 + visibilityPhase * 0.28) * spanGain;
                const desiredBackSpan = Math.min(1.28, Math.max(lingerSpan, dynamicSpan));
                const traversed = Math.max(0.001, Number.isFinite(traversedSpan) ? traversedSpan : desiredBackSpan);
                const fullSpan = Math.max(
                    traversed + 0.001,
                    Number.isFinite(fullSwingSpan) ? Math.abs(fullSwingSpan) : traversed
                );
                let backSpan = Math.min(desiredBackSpan, traversed + 0.02);
                if (completeThenTrim) {
                    // モーション中は通過済み角度を保持し、途中で縮まないようにする
                    backSpan = Math.max(backSpan, traversed);
                    backSpan = Math.min(backSpan, fullSpan + 0.03);
                }
                const leadRatio = Math.max(0, Number.isFinite(leadScale) ? leadScale : 1);
                const leadCap = leadRatio > 0
                    ? Math.min(0.014, Math.max(0.0025, traversed * 0.06))
                    : 0;
                const leadSpan = leadRatio > 0
                    ? Math.min(
                        leadCap,
                        Math.max(0.0002, backSpan * (0.06 + visibilityPhase * 0.04) * leadRatio)
                    )
                    : 0;
                let start = movingForward ? (currentAngle - backSpan) : (currentAngle - leadSpan);
                let end = movingForward ? (currentAngle + leadSpan) : (currentAngle + backSpan);
                if (completeThenTrim && Number.isFinite(startAnchorAngle)) {
                    const full = Math.PI * 2;
                    let anchored = startAnchorAngle;
                    while (anchored - currentAngle > Math.PI) anchored -= full;
                    while (anchored - currentAngle < -Math.PI) anchored += full;
                    if (movingForward) start = anchored;
                    else end = anchored;
                }
                const ccw = end < start;
                const backAlpha = alpha * 0.42;
                const frontAlpha = alpha;
                const segment = {
                    pivotX,
                    pivotY,
                    direction,
                    localCenterX: -5 + xOffset,
                    radius,
                    start,
                    end,
                    ccw,
                    width,
                    frontColor: palette.front,
                    frontAlpha,
                    fadeLifeScale: 1
                };
                liveTrailSnapshot.push(segment);

                // ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(${palette.front[0]}, ${palette.front[1]}, ${palette.front[2]}, ${frontAlpha})`;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.arc(-5 + xOffset, 0, radius, start, end, ccw);
                ctx.stroke();

                ctx.strokeStyle = `rgba(255, 255, 255, ${frontAlpha * 0.46})`;
                ctx.lineWidth = Math.max(1.4, width * 0.18);
                ctx.beginPath();
                ctx.arc(-3.6 + xOffset, -1.2, Math.max(2, radius - 2.2), start + 0.03, end + 0.03, ccw);
                ctx.stroke();
                ctx.restore();
            };

            const bluePalette = { front: [130, 234, 255], back: [76, 154, 226] };
            const redPalette = { front: [255, 90, 90], back: [214, 74, 74] };
            const sampleStep = 0.055;
            const prevProgress = Math.max(0, pose.progress - sampleStep);
            const prevRemapped = this.remapMainSwingProgress(pose.comboIndex, prevProgress);
            const prevEased = prevRemapped * prevRemapped * (3 - 2 * prevRemapped);
            const prevRightRaw = pose.arcs.rightStart + (pose.arcs.rightEnd - pose.arcs.rightStart) * prevEased;
            const prevLeftRaw = pose.arcs.leftStart + (pose.arcs.leftEnd - pose.arcs.leftStart) * prevEased;
            const rightAngle = toAdjustedAngle(pose.rightAngle);
            const leftAngle = toAdjustedAngle(pose.leftAngle);
            const prevRightAngle = toAdjustedAngle(prevRightRaw);
            const prevLeftAngle = toAdjustedAngle(prevLeftRaw);
            const rightStartAngle = toAdjustedAngle(pose.arcs.rightStart);
            const leftStartAngle = toAdjustedAngle(pose.arcs.leftStart);
            const rightEndAngle = toAdjustedAngle(pose.arcs.rightEnd);
            const leftEndAngle = toAdjustedAngle(pose.arcs.leftEnd);
            const rightDelta = rightAngle - prevRightAngle;
            const leftDelta = leftAngle - prevLeftAngle;
            const rightFullSpanSigned = rightEndAngle - rightStartAngle;
            const leftFullSpanSigned = leftEndAngle - leftStartAngle;
            const rightFullSpan = Math.abs(rightFullSpanSigned);
            const leftFullSpan = Math.abs(leftFullSpanSigned);
            const rightTraversed = Math.min(rightFullSpan, Math.max(0, Math.abs(rightAngle - rightStartAngle)));
            const leftTraversed = Math.min(leftFullSpan, Math.max(0, Math.abs(leftAngle - leftStartAngle)));
            const rightSweepSign = Math.sign(rightFullSpanSigned) || Math.sign(rightDelta) || 1;
            const leftSweepSign = Math.sign(leftFullSpanSigned) || Math.sign(leftDelta) || 1;
            const dualTrailWidth = 13.8 * trailScale;
            const redRadiusScale = 0.56;
            const redYOffsetBias = -34;
            const redSpanScale = 0.82;
            const redXOffsetBias = 18;
            const redLeadScale = 0.1;
            const risingRedRadiusScale = redRadiusScale * 1.58;
            const risingRedSpanScale = redSpanScale * 1.44;
            const risingBlueRadiusScale = 0.9;
            const risingBlueSpanGain = 0.66;
            const risingBlueTrailBackScale = 1.2;
            const fallingBlueRadiusScale = 0.78;
            const fallingBlueSpanGain = 0.66;
            const fallingBlueTrailBackScale = 1.12;
            if (pose.arcs.hit === 'drawDash') {
                drawTrackedArcSlash(bluePalette, rightAngle, rightDelta, rightTraversed, rightFullSpan, (pose.arcs.effectRadius + 10) * trailScale, dualTrailWidth, -6, 0.82, 0, backTrailAnchor, true, 1.55, 0, rightSweepSign, rightStartAngle);
                drawTrackedArcSlash(redPalette, leftAngle, leftDelta, leftTraversed, leftFullSpan, (pose.arcs.effectRadius + 2) * trailScale * redRadiusScale, dualTrailWidth, 5 + redYOffsetBias, 0.74 * redSpanScale, redXOffsetBias, frontTrailAnchor, true, 1.55, redLeadScale, leftSweepSign, leftStartAngle);
            } else if (pose.arcs.hit === 'reverseCounter') {
                drawTrackedArcSlash(redPalette, leftAngle, leftDelta, leftTraversed, leftFullSpan, (pose.arcs.effectRadius + 14) * trailScale * redRadiusScale, dualTrailWidth, -9 + redYOffsetBias, 0.9 * redSpanScale, redXOffsetBias, frontTrailAnchor, true, 1.55, redLeadScale, leftSweepSign, leftStartAngle);
                drawTrackedArcSlash(bluePalette, rightAngle, rightDelta, rightTraversed, rightFullSpan, (pose.arcs.effectRadius + 7) * trailScale, dualTrailWidth, 7, 0.76, 0, backTrailAnchor, true, 1.55, 0, rightSweepSign, rightStartAngle);
            } else if (pose.arcs.hit === 'crossStepSweep') {
                drawTrackedArcSlash(bluePalette, rightAngle, rightDelta, rightTraversed, rightFullSpan, (pose.arcs.effectRadius + 18) * trailScale, dualTrailWidth, -3, 0.72, 0, backTrailAnchor, true, 1.55, 0, rightSweepSign, rightStartAngle);
                drawTrackedArcSlash(redPalette, leftAngle, leftDelta, leftTraversed, leftFullSpan, (pose.arcs.effectRadius + 16) * trailScale * redRadiusScale, dualTrailWidth, 4 + redYOffsetBias, 0.72 * redSpanScale, redXOffsetBias, frontTrailAnchor, true, 1.55, redLeadScale, leftSweepSign, leftStartAngle);
            } else if (pose.arcs.hit === 'risingX') {
                drawTrackedArcSlash(bluePalette, rightAngle, rightDelta, rightTraversed, rightFullSpan, (pose.arcs.effectRadius + 10) * trailScale * risingBlueRadiusScale, dualTrailWidth, -10, risingBlueSpanGain, 0, backTrailAnchor, true, risingBlueTrailBackScale, 0, rightSweepSign, rightStartAngle);
                drawTrackedArcSlash(redPalette, leftAngle, leftDelta, leftTraversed, leftFullSpan, (pose.arcs.effectRadius + 7) * trailScale * risingRedRadiusScale, dualTrailWidth, -3 + redYOffsetBias, 0.76 * risingRedSpanScale, redXOffsetBias, frontTrailAnchor, true, 1.55, redLeadScale, leftSweepSign, leftStartAngle);
            } else if (pose.arcs.hit === 'fallingBreak') {
                drawTrackedArcSlash(bluePalette, rightAngle, rightDelta, rightTraversed, rightFullSpan, (pose.arcs.effectRadius + 16) * trailScale * fallingBlueRadiusScale, dualTrailWidth, -5, fallingBlueSpanGain, 0, backTrailAnchor, true, fallingBlueTrailBackScale, 0, rightSweepSign, rightStartAngle);
                drawTrackedArcSlash(redPalette, leftAngle, leftDelta, leftTraversed, leftFullSpan, (pose.arcs.effectRadius + 12) * trailScale * redRadiusScale, dualTrailWidth, 5 + redYOffsetBias, 0.86 * redSpanScale, redXOffsetBias, frontTrailAnchor, true, 1.55, redLeadScale, leftSweepSign, leftStartAngle);
            } else {
                drawTrackedArcSlash(bluePalette, rightAngle, rightDelta, rightTraversed, rightFullSpan, (pose.arcs.effectRadius + 16) * trailScale, dualTrailWidth, -5, 0.84, 0, backTrailAnchor, true, 1.55, 0, rightSweepSign, rightStartAngle);
                drawTrackedArcSlash(redPalette, leftAngle, leftDelta, leftTraversed, leftFullSpan, (pose.arcs.effectRadius + 12) * trailScale * redRadiusScale, dualTrailWidth, 5 + redYOffsetBias, 0.86 * redSpanScale, redXOffsetBias, frontTrailAnchor, true, 1.55, redLeadScale, leftSweepSign, leftStartAngle);
            }
            this.mainTrailFadeMaxScale = liveTrailSnapshot.reduce((max, seg) => {
                const s = Number.isFinite(seg.fadeLifeScale) ? seg.fadeLifeScale : 1;
                return Math.max(max, s);
            }, 1);
            this.mainTrailFadeSnapshot = liveTrailSnapshot;
            this.mainTrailFadeAgeMs = 0;
            this.mainTrailFadeActive = liveTrailSnapshot.length > 0;
            return;
        }

        // 合体攻撃(X)は飛翔斬撃のみ表示（手前の剣筋は描かない）
        if (isCombined) return;

        const progress = Math.max(0, this.attackTimer / Math.max(1, this.sideDuration || 150));
        const centerX = player.x + player.width / 2;
        const centerY = player.y + player.height / 2;
        
        // 共通描画関数
        const drawAttack = (slashColor, angleStart, angleEnd, isBackwards, drawModel) => {
            ctx.save();
            ctx.translate(centerX, centerY);
            
            // 向き設定 (isBackwardsなら背後を向く)
            const dir = direction * (isBackwards ? -1 : 1);
            ctx.scale(dir, 1);
            
            // 剣の角度
            const currentAngle = angleStart + (angleEnd - angleStart) * (1 - progress);
            
            // --- 1. 剣の描画 (完全に白、発光なし) ---
            // 右手(Z)の場合はプレイヤー本体が描画しているので、ここでは描画しない (重複防止)
            // 左手(X)の場合は描画する
            if (drawModel) {
                ctx.save();
                ctx.rotate(currentAngle);
                
                const swordLen = this.range;
                
                // 鍔
                ctx.fillStyle = '#111';
                ctx.fillRect(10, -2.2, 3.2, 4.4);
                // はばき
                ctx.fillStyle = '#c9a545';
                ctx.fillRect(12.7, -1.9, 1.6, 3.8);
                
                // 刀身（日本刀: 上側は直線、下側は反り）
                // ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(14, -1.35);
                ctx.lineTo(swordLen - 2.2, -1.35); // 上側(棟側)はまっすぐ
                ctx.lineTo(swordLen + 0.8, 0);      // 切先
                ctx.quadraticCurveTo(swordLen - 8.5, 1.95, 14, 1.25); // 下側(刃側)は反る
                ctx.fill();
                
                // 峰
                ctx.fillStyle = '#aaa';
                ctx.beginPath();
                ctx.moveTo(14, -0.55);
                ctx.lineTo(swordLen - 4.8, -0.55);
                ctx.quadraticCurveTo(swordLen - 8.5, 0.15, 14, 0.35);
                ctx.fill();
                
                ctx.restore(); 
            }
            
            // --- 2. 斬撃エフェクト (キャラ手前の円弧) ---
            // ユーザー要望: Zキー(stroke arc)と全く同じ見た目に合わせる
            
            ctx.save();
            ctx.rotate(currentAngle);
            
            const slashAlpha = 0.8 * (1 - progress); // フェードアウト
            
            // 色のセットアップ (alpha適用)
            const baseColorPrefix = slashColor.substring(0, slashColor.lastIndexOf(','));
            const finalColor = `${baseColorPrefix}, ${slashAlpha})`;
            
            // ctx.shadowBlur = 10;
            // ctx.shadowColor = finalColor;
            
            // 外側の太いライン (色付き)
            ctx.strokeStyle = finalColor;
            ctx.lineWidth = 13;
            ctx.lineCap = 'round';
            ctx.beginPath();
            // 1本の剣につき剣筋は常に1本だけ表示する
            ctx.arc(-6, 0, this.range + 10, -0.72, 0.72);
            ctx.stroke();
            
            // 内側の細いハイライト (白)
            // ctx.shadowBlur = 5;
            // ctx.shadowColor = 'white';
            ctx.strokeStyle = `rgba(255, 255, 255, ${slashAlpha * 0.8})`;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(-3, 0, this.range + 8, -0.68, 0.68);
            ctx.stroke();
            
            ctx.restore();
            
            ctx.restore(); // 【重要】drawAttack冒頭のctx.save()に対するrestore
        };

        // --- 左手攻撃 (Xキー相当) - 後方・赤色 ---
        if (this.attackType === 'left') {
            ctx.save();
            const redSlash = 'rgba(255, 90, 90, 0.9)';
            
            let start = -Math.PI * 0.5;
            let end = Math.PI * 0.2;
            
            const leftArc = this.getLeftSwingArc();
            start = leftArc.start;
            end = leftArc.end;
            
            drawAttack(redSlash, start, end, true, false);
            ctx.restore();
        }

        // --- 右手攻撃 (Zキー相当) - 前方・水色 ---
        if (this.attackType === 'right' && player && player.type === 'boss') {
            // ボス側はプレイヤー本体描画フローがないため、右手斬撃もここで描画する
            drawAttack('rgba(80, 190, 255, 0.9)', -Math.PI * 0.92, Math.PI * 0.2, false, false);
        }
    }
}

// 鎖鎌
export class Kusarigama extends SubWeapon {
    constructor() {
        // 制圧寄り: 間合い管理の武器として中火力を強化
        super('鎖鎌', 20, 340, 369); // 射程を 340 に微調整（380から少し短縮）
        this.isAttacking = false;
        this.attackTimer = 0;
        this.baseTotalDuration = 538; // 動作時間を延長 (700msベース)
        // モーション速度係数（0.5 = 約半速）
        this.motionSpeedScale = 0.5;
        this.totalDuration = this.scaleMotionDuration(this.baseTotalDuration);
        this.owner = null;
        this.attackDirection = 1;
        this.baseWindupEnd = 0.1;
        this.baseExtendEnd = 0.32;
        this.baseOrbitEnd = 0.74;
        this.baseThrowHoldRatio = 0.2;
        this.windupEnd = this.baseWindupEnd;
        this.extendEnd = this.baseExtendEnd;
        this.orbitEnd = this.baseOrbitEnd;
        this.throwHoldRatio = this.baseThrowHoldRatio;
        this.rangeScale = 1.0;
        this.multiHitCount = 0;
        this.tipX = null;
        this.tipY = null;
        this.echoHitEnemies = new Set();
        this.autoTrackCooldownMs = 95;
        this.nextAutoTrackTime = 0;
    }

    scaleMotionDuration(baseDurationMs) {
        const speed = Number.isFinite(this.motionSpeedScale) ? this.motionSpeedScale : 1;
        const safeSpeed = Math.max(0.1, speed);
        return Math.max(1, Math.round(baseDurationMs / safeSpeed));
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        
        const damages = [18, 20, 22, 24];
        const cooldowns = [680, 665, 650, 635];
        const tierMap = [
            { rangeScale: 1.0, multiHitCount: 0, extendEnd: 0.32, windupEnd: 0.1, orbitEnd: 0.74, throwHoldRatio: 0.2 },
            { rangeScale: 1.0, multiHitCount: 1, extendEnd: 0.32, windupEnd: 0.1, orbitEnd: 0.74, throwHoldRatio: 0.2 },
            { rangeScale: 1.15, multiHitCount: 2, extendEnd: 0.35, windupEnd: 0.12, orbitEnd: 0.78, throwHoldRatio: 0.25 },
            { rangeScale: 1.34, multiHitCount: 4, extendEnd: 0.38, windupEnd: 0.15, orbitEnd: 0.82, throwHoldRatio: 0.3 }
        ];

        const cfg = tierMap[this.enhanceTier] || tierMap[0];
        this.damage = damages[this.enhanceTier] || damages[0];
        // クールタイムをモーション時間と一致させる
        this.cooldown = cooldowns[this.enhanceTier] || cooldowns[0];
        this.rangeScale = cfg.rangeScale;
        this.multiHitCount = cfg.multiHitCount;
        this.extendEnd = cfg.extendEnd;
        this.windupEnd = cfg.windupEnd;
        this.orbitEnd = cfg.orbitEnd;
        if (this.orbitEnd <= this.extendEnd + 0.02) {
            // orbitフェーズが潰れないよう最低限の区間を確保
            this.orbitEnd = Math.min(0.92, this.extendEnd + 0.18);
        }
        this.throwHoldRatio = cfg.throwHoldRatio;
        this.totalDuration = this.cooldown;
    }
    
    use(player) {
        this.isAttacking = true;
        this.owner = player;
        this.attackDirection = player.facingRight ? 1 : -1;
        this.attackTimer = this.totalDuration;
        this.echoHitEnemies.clear();
        this.nextAutoTrackTime = 0;
        const init = this.getMotionState(player);
        this.tipX = init.tipX;
        this.tipY = init.tipY;
        audio.playDash(); // 鎖のシュルシュル音代用

        // 分身連動
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            player.getSubWeaponCloneOffsets().forEach(c => player.triggerCloneSubWeapon(c.index));
        }
    }

    getMotionState(player) {
        const direction = this.attackDirection;
        const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / this.totalDuration)));
        const centerX = player.x + player.width / 2;
        const shoulderX = centerX - direction * 3; // player.js の frontShoulderX に合わせる
        const shoulderY = player.y + 17; // player.js の pivotY (idle想定) に合わせる

        let radius = 0;
        let angle = 0;
        let phase = 'windup';
        let phaseT = 0;

        if (progress < this.windupEnd) {
            phase = 'windup';
            phaseT = progress / Math.max(0.001, this.windupEnd);
            const ease = phaseT * phaseT * (3 - 2 * phaseT);
            const localX = 5.8 + (-17.2 - 5.8) * ease;
            const localY = 1.6 + (-15.2 - 1.6) * ease;
            // 振りかぶり中は鎖をほぼ伸ばさない
            radius = this.range * this.rangeScale * (0.006 + 0.006 * ease);
            angle = -0.72 + ease * 0.18;
            const handX = shoulderX + direction * localX;
            const handY = shoulderY + localY;
            const chainDirX = direction * Math.cos(angle);
            const chainDirY = Math.sin(angle);
            const tipX = handX + chainDirX * radius;
            const tipY = handY + chainDirY * radius;
            return {
                handX,
                handY,
                tipX,
                tipY,
                radius,
                angle,
                progress,
                direction,
                phase,
                phaseT,
                tension: 0.06 + ease * 0.04,
                chainDirX,
                chainDirY,
                chainHeading: Math.atan2(chainDirY, chainDirX)
            };
        } else if (progress < this.extendEnd) {
            phase = 'throw';
            const throwRaw = (progress - this.windupEnd) / Math.max(0.001, (this.extendEnd - this.windupEnd));
            // 溜めを長めに取り、振り下ろし開始で鎖が伸びる
            const holdRatio = Math.max(0.28, Math.min(0.62, (this.throwHoldRatio || 0) + 0.24));
            const holdT = holdRatio > 0 ? Math.min(1, throwRaw / holdRatio) : 1;
            const throwT = holdRatio < 1
                ? Math.max(0, Math.min(1, (throwRaw - holdRatio) / Math.max(0.001, (1 - holdRatio))))
                : 1;
            const holdEase = holdT * holdT * (3 - 2 * holdT);
            const snapEase = 1 - Math.pow(1 - throwT, 3.4);
            const settleEase = throwT * throwT * (3 - 2 * throwT);
            const launchEase = snapEase * 0.86 + settleEase * 0.14;
            const whip = Math.sin(throwT * Math.PI) * (1 - throwT) * 0.75;
            phaseT = throwRaw;
            const holdX = -17.2 + 1.1 * holdEase;
            const holdY = -15.2 + 6.2 * holdEase;
            const localX = holdX + (18.4 - holdX) * launchEase + whip;
            const localY = holdY + (8.6 - holdY) * launchEase + Math.pow(throwT, 1.2) * 0.8;
            const handX = shoulderX + direction * localX;
            const handY = shoulderY + localY;
            const radiusEase = 1 - Math.pow(1 - throwT, 2.5);
            radius = this.range * this.rangeScale * (0.015 + 0.985 * radiusEase);
            angle = -0.56 + 0.66 * throwT - Math.sin(throwT * Math.PI) * 0.04;
            const chainDirX = direction * Math.cos(angle);
            const chainDirY = Math.sin(angle);
            const tipX = handX + chainDirX * radius;
            const tipY = handY + chainDirY * radius;
            return {
                handX,
                handY,
                tipX,
                tipY,
                radius,
                angle,
                progress,
                direction,
                phase,
                phaseT,
                tension: 0.1 + radiusEase * 0.9,
                chainDirX,
                chainDirY,
                chainHeading: Math.atan2(chainDirY, chainDirX)
            };
        } else if (progress < this.orbitEnd) {
            phase = 'orbit';
            phaseT = (progress - this.extendEnd) / (this.orbitEnd - this.extendEnd);
            radius = this.range * this.rangeScale;
            // 前方へ投げ放った後に遠心力を感じるよう、ゆっくり回し始める
            const eased = Math.pow(phaseT, 1.22);
            angle = 0.05 + (-Math.PI * 1.22 - 0.05) * eased; // 終点を斜め後方 (-1.22PI) まで延長
        } else {
            phase = 'retract';
            phaseT = (progress - this.orbitEnd) / (1 - this.orbitEnd);
            // 縮退も常に円弧上（角度と半径を同時補間）
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            radius = this.range * this.rangeScale * (1 - eased * 0.9);
            const startAngle = -Math.PI * 1.22; // 回転終点に合わせて開始角も後方にずらす
            const endAngle = -Math.PI * 0.18;
            angle = startAngle + (endAngle - startAngle) * eased;
        }

        const chainDirX = direction * Math.cos(angle);
        const chainDirY = Math.sin(angle);
        const chainHeading = Math.atan2(chainDirY, chainDirX);

        let handX = shoulderX;
        let handY = shoulderY;
        if (phase === 'orbit') {
            const eased = Math.pow(phaseT, 1.22);
            const orbitStart = 0.14;
            const orbitEnd = -Math.PI * 1.22;
            const orbit = orbitStart + (orbitEnd - orbitStart) * eased;
            const reach = 20.2;
            handX = shoulderX + direction * (Math.cos(orbit) * reach);
            handY = shoulderY + Math.sin(orbit) * reach - 0.4;
        } else {
            // 回し終わりから収納へ戻す
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            const fromOrbit = -Math.PI * 1.22;
            const fromX = shoulderX + direction * (Math.cos(fromOrbit) * 20.2);
            const fromY = shoulderY + Math.sin(fromOrbit) * 20.2 - 0.4;
            const toX = shoulderX + direction * 6.5;
            const toY = shoulderY - 3.0;
            handX = fromX + (toX - fromX) * eased;
            handY = fromY + (toY - fromY) * eased;
        }
        const tipX = handX + chainDirX * radius;
        const tipY = handY + chainDirY * radius;

        return {
            handX,
            handY,
            tipX,
            tipY,
            radius,
            angle,
            progress,
            direction,
            phase,
            phaseT,
            tension: phase === 'orbit' ? 1.0 : (0.82 + (1 - phaseT) * 0.18),
            chainDirX,
            chainDirY,
            chainHeading
        };
    }

    getHandAnchor(player) {
        const st = this.getMotionState(player);
        return {
            x: st.handX,
            y: st.handY,
            direction: st.direction,
            progress: st.progress,
            phase: st.phase,
            phaseT: st.phaseT
        };
    }

    getRenderState(player) {
        return this.getMotionState(player);
    }

    getCurrentState(player) {
        return this.getMotionState(player);
    }

    getSickleGeometry(state) {
        const travelHeading = state.phase === 'orbit'
            ? (state.chainHeading - state.direction * Math.PI * 0.5)
            : state.chainHeading;
        const rotation = travelHeading + state.direction * Math.PI * 0.28;
        const reach = 16;
        return { rotation, reach };
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            if (this.owner) {
                const st = this.getMotionState(this.owner);
                // 先端位置は常に円弧式から直接決定（直線ドリフトを防止）
                this.tipX = st.tipX;
                this.tipY = st.tipY;
            }

            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.tipX = null;
                this.tipY = null;
                this.echoHitEnemies.clear();
            }
        }
    }
    
    getHitbox(player) {
        if (!this.isAttacking) return null;

        const st = this.getRenderState(player);
        if (st.radius < 16) return null;
        const sickle = this.getSickleGeometry(st);

        const chainThickness = 12;
        const minX = Math.min(st.handX, st.tipX) - chainThickness * 0.5;
        const minY = Math.min(st.handY, st.tipY) - chainThickness * 0.5;
        const width = Math.max(8, Math.abs(st.tipX - st.handX) + chainThickness);
        const height = Math.max(8, Math.abs(st.tipY - st.handY) + chainThickness);
        const chainHitbox = { x: minX, y: minY, width, height, part: 'chain' };
        const sickleTipX = st.tipX + Math.cos(sickle.rotation) * sickle.reach;
        const sickleTipY = st.tipY + Math.sin(sickle.rotation) * sickle.reach;
        const tipRadius = 15;
        const tipHitbox = {
            x: Math.min(st.tipX, sickleTipX) - tipRadius,
            y: Math.min(st.tipY, sickleTipY) - tipRadius,
            width: Math.max(22, Math.abs(sickleTipX - st.tipX) + tipRadius * 2),
            height: Math.max(22, Math.abs(sickleTipY - st.tipY) + tipRadius * 2),
            part: 'tip'
        };
        const hitboxes = [chainHitbox, tipHitbox];
        // Lvが上がるほど鎌先まわりの追撃判定を増やして制圧力を上げる
        if (this.multiHitCount > 0) {
            const tipReach = 18;
            const normalX = -Math.sin(st.chainHeading) * tipReach;
            const normalY = Math.cos(st.chainHeading) * tipReach;
            for (let i = 1; i <= this.multiHitCount; i++) {
                const offset = (i - (this.multiHitCount + 1) * 0.5) * 10;
                hitboxes.push({
                    x: tipHitbox.x + normalX * 0.4 + offset * st.direction * 0.15,
                    y: tipHitbox.y + normalY * 0.4 + offset * 0.18,
                    width: tipHitbox.width,
                    height: tipHitbox.height,
                    part: 'tip_multi'
                });
            }
        }
        if (this.enhanceTier >= 3 && st.phase === 'retract' && st.phaseT >= 0.38) {
            const echoRadius = 18;
            hitboxes.push({
                x: st.tipX - echoRadius,
                y: st.tipY - echoRadius,
                width: echoRadius * 2,
                height: echoRadius * 2,
                part: 'echo'
            });
        }
        return hitboxes;
    }
    
    render(ctx, player) {
        if (!this.isAttacking && (!player || !player.forceSubWeaponRender)) return;

        const st = this.getRenderState(player);
        if (st.radius < 4) return;

        ctx.save();

        const drawSmoothTrail = (points, width, color) => {
            if (!points || points.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length - 1; i++) {
                const next = points[i + 1];
                const midX = (points[i].x + next.x) * 0.5;
                const midY = (points[i].y + next.y) * 0.5;
                ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
            }
            const last = points[points.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
        };

        // 軌跡は円弧のみ。厚みを分けて視認性を上げる
        if (st.progress > this.extendEnd && st.radius > 22) {
            const trailSweep = st.phase === 'orbit' ? Math.PI * 0.58 : Math.PI * 0.34;
            const trailEnd = st.angle;
            const trailStart = Math.min(0.12, trailEnd + trailSweep);
            const samples = st.phase === 'orbit' ? 24 : 16;
            const points = [];
            for (let i = 0; i <= samples; i++) {
                const t = i / samples;
                const a = trailStart + (trailEnd - trailStart) * t;
                points.push({
                    x: st.handX + st.direction * Math.cos(a) * st.radius,
                    y: st.handY + Math.sin(a) * st.radius
                });
            }
            const tier = this.enhanceTier || 0;
            const baseAlpha = st.phase === 'orbit' ? 0.42 : 0.28;
            const baseColor = tier >= 3 ? '255, 194, 142' : '130, 225, 255';
            const edgeColor = tier >= 3 ? '255, 236, 206' : '210, 250, 255';
            drawSmoothTrail(points, 10, `rgba(${baseColor}, ${baseAlpha})`);
            drawSmoothTrail(points, 4.5, `rgba(${edgeColor}, ${baseAlpha * 0.92})`);
            if (tier >= 2) {
                // Lv2+: 軌跡を1本追加
                drawSmoothTrail(points, 2.2, `rgba(${edgeColor}, ${baseAlpha * 0.8})`);
                drawSmoothTrail(points, 1.4, `rgba(${edgeColor}, ${baseAlpha * 0.62})`);
            }
        }

        // 鎖（投擲前半はたるみ、加速とともに張る）
        const chainGradient = ctx.createLinearGradient(st.handX, st.handY, st.tipX, st.tipY);
        chainGradient.addColorStop(0, 'rgba(170, 176, 188, 0.95)');
        chainGradient.addColorStop(0.55, 'rgba(128, 136, 150, 0.98)');
        chainGradient.addColorStop(1, 'rgba(92, 102, 118, 0.95)');
        const chainDx = st.tipX - st.handX;
        const chainDy = st.tipY - st.handY;
        const chainLen = Math.max(0.001, Math.hypot(chainDx, chainDy));
        const chainNx = -chainDy / chainLen;
        const chainNy = chainDx / chainLen;
        const chainTension = Number.isFinite(st.tension) ? Math.max(0, Math.min(1, st.tension)) : 1;
        const throwPhase = st.phase === 'throw';
        const slackScale = throwPhase ? 0.42 : 1.0;
        const slackBase = (1 - chainTension) * (10 + Math.min(8, chainLen * 0.05)) * slackScale;
        const midX = (st.handX + st.tipX) * 0.5;
        const midY = (st.handY + st.tipY) * 0.5;
        const ctrlX = midX - st.chainDirX * (chainLen * 0.1) + chainNx * (slackBase * (throwPhase ? 0.18 : 0.48));
        const ctrlY = midY
            - st.chainDirY * (chainLen * 0.1)
            + chainNy * (slackBase * (throwPhase ? 0.08 : 0.24))
            + slackBase * (throwPhase ? 0.24 : 0.62);
        ctx.lineDashOffset = -st.progress * 150; // 鎖が動いているような視覚効果
        ctx.strokeStyle = chainGradient;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(st.handX, st.handY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, st.tipX, st.tipY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(230, 245, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(st.handX + st.chainDirY * 1.4, st.handY - st.chainDirX * 1.4);
        ctx.quadraticCurveTo(
            ctrlX + st.chainDirY * 1.4,
            ctrlY - st.chainDirX * 1.4,
            st.tipX + st.chainDirY * 1.4,
            st.tipY - st.chainDirX * 1.4
        );
        ctx.stroke();

        // 鎖コマを等間隔で描いて、金属鎖らしい実体感を出す
        const chainLinks = Math.max(8, Math.min(24, Math.round(chainLen / 13)));
        ctx.fillStyle = 'rgba(106, 114, 128, 0.95)';
        ctx.strokeStyle = 'rgba(220, 230, 244, 0.46)';
        ctx.lineWidth = 0.7;
        for (let i = 1; i < chainLinks; i++) {
            const t = i / chainLinks;
            const inv = 1 - t;
            const px = inv * inv * st.handX + 2 * inv * t * ctrlX + t * t * st.tipX;
            const py = inv * inv * st.handY + 2 * inv * t * ctrlY + t * t * st.tipY;
            const tx = 2 * inv * (ctrlX - st.handX) + 2 * t * (st.tipX - ctrlX);
            const ty = 2 * inv * (ctrlY - st.handY) + 2 * t * (st.tipY - ctrlY);
            const angle = Math.atan2(ty, tx);
            const linkR = 1.25 + (1 - chainTension) * 0.35;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.ellipse(0, 0, linkR * 1.25, linkR * 0.78, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 鎌ヘッド
        ctx.save();
        ctx.translate(st.tipX, st.tipY);
        const sickle = this.getSickleGeometry(st);
        ctx.rotate(sickle.rotation);
        
        // 分銅（根元）
        const pommelGrad = ctx.createRadialGradient(-4, 0, 0.2, -4, 0, 3.2);
        pommelGrad.addColorStop(0, '#b6bcc8');
        pommelGrad.addColorStop(0.55, '#636d7e');
        pommelGrad.addColorStop(1, '#2a2f38');
        ctx.fillStyle = pommelGrad;
        ctx.beginPath();
        ctx.arc(-4, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // 刃の金属グラデーション（キャッシュ）
        if (!this._cachedSickleGrad) {
            this._cachedSickleGrad = ctx.createLinearGradient(0, -12, 30, 6);
            this._cachedSickleGrad.addColorStop(0, '#f6f8fb');
            this._cachedSickleGrad.addColorStop(0.22, '#c9d0d8');
            this._cachedSickleGrad.addColorStop(0.55, '#8f99a9');
            this._cachedSickleGrad.addColorStop(1, '#4a5565');
        }
        ctx.fillStyle = this._cachedSickleGrad;
        ctx.strokeStyle = '#313943';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // 鎌の形状をシャープに
        ctx.quadraticCurveTo(20, -13, 30, -1.6);
        ctx.quadraticCurveTo(18, 3.0, 3, 5.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // ハイライト線
        ctx.strokeStyle = 'rgba(255,255,255,0.68)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(2.4, -1.6);
        ctx.quadraticCurveTo(15.5, -7.2, 26.5, -2.2);
        ctx.stroke();
        
        // 柄
        const handleGrad = ctx.createLinearGradient(-3.2, -1.8, 3.2, 1.8);
        handleGrad.addColorStop(0, '#3b2a1c');
        handleGrad.addColorStop(1, '#1f140c');
        ctx.fillStyle = handleGrad;
        ctx.fillRect(-3.2, -1.7, 6.4, 3.4);
        ctx.strokeStyle = 'rgba(255, 230, 188, 0.26)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(-2.8, -1.2, 5.6, 2.4);
        ctx.strokeStyle = 'rgba(24, 12, 5, 0.72)';
        ctx.lineWidth = 0.6;
        for (let x = -2.2; x <= 2.2; x += 1.2) {
            ctx.beginPath();
            ctx.moveTo(x, -1.7);
            ctx.lineTo(x + 0.9, 1.7);
            ctx.stroke();
        }
        ctx.restore();

        // 鎌先の風切り
        if ((st.phase === 'orbit' || st.phase === 'retract') && st.radius > 20) {
            const sweepAlpha = st.phase === 'orbit' ? 0.34 : 0.22;
            const tangentX = -st.direction * Math.sin(st.angle);
            const tangentY = Math.cos(st.angle);
            ctx.strokeStyle = `rgba(184, 244, 255, ${sweepAlpha})`;
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            for (let i = 0; i < 3; i++) {
                const back = 8 + i * 6;
                const spread = (i - 1) * 2.4;
                const startX = st.tipX - st.chainDirX * back + tangentX * spread;
                const startY = st.tipY - st.chainDirY * back + tangentY * spread;
                const endX = startX + tangentX * (9 + i * 2);
                const endY = startY + tangentY * (9 + i * 2);
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
}

// 大太刀
export class Odachi extends SubWeapon {
    constructor() {
        super('大太刀', 34, 74, 580); // Lv0
        this.isAttacking = false;
        this.attackTimer = 0;
        this.baseTotalDuration = 580; 
        this.totalDuration = this.baseTotalDuration;
        this.owner = null;
        this.impactX = 0;
        this.impactY = 0;
        this.hasImpacted = false;
        this.impactFlashTimer = 0;
        this.groundWaves = [];
        this.impactDebris = [];
        this.liftEnd = 0.32;
        this.stallEnd = 0.46;
        this.flipEnd = 0.78;
        this.baseImpactStart = 0.92;
        this.impactStart = 0.92;
        this.impactEnd = 1.0;
        this.attackDirection = 1;
        // 着地後の「刺さり演出」用タイマー
        this.plantedTimer = 0;
        this.basePlantedDuration = 320;
        this.plantedDuration = this.basePlantedDuration; // 衝撃波が消えるまで刀を地面に刺したまま見せる
        this.impactSoundPlayed = false; // 着地爆発音の重複防止
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        
        const damages = [34, 40, 43, 46];
        const cooldowns = [580, 565, 550, 535];
        const jumps = [-22, -26, -28, -30];

        this.damage = damages[this.enhanceTier] || damages[0];
        // 待機時間を撤廃し、モーション時間自体をCDとする
        this.cooldown = cooldowns[this.enhanceTier] || cooldowns[0];
        this.totalDuration = this.cooldown;
        this.odachiJumpVy = jumps[this.enhanceTier] || jumps[0];

        this.impactStart = Math.max(0.78, this.baseImpactStart - this.enhanceTier * 0.025);
        this.plantedDuration = Math.round(this.basePlantedDuration * (1 + this.enhanceTier * 0.12));
    }
    
    use(player) {
        this.isAttacking = true;
        this.owner = player;
        this.attackTimer = this.totalDuration;
        this.hasImpacted = false;
        this.impactFlashTimer = 0;
        this.plantedTimer = 0;
        this.impactSoundPlayed = false;
        this.groundWaves = [];
        this.impactDebris = [];
        this.attackDirection = player.facingRight ? 1 : -1;

        // ボス（敵）の場合は跳躍力を抑える
        if (player.isEnemy) {
            player.vy = (this.odachiJumpVy || -30) * 0.55;
        } else {
            player.vy = this.odachiJumpVy || -30;
        }
        player.isGrounded = false;
        player.vx *= 0.35;

        audio.playSlash(4);

        // 分身連動
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            player.getSubWeaponCloneOffsets().forEach(c => player.triggerCloneSubWeapon(c.index));
        }
    }

    getProgress() {
        return Math.max(0, Math.min(1, 1 - (this.attackTimer / this.totalDuration)));
    }

    // 着地後の「刺さり状態」かどうか
    isPlanted() {
        return this.hasImpacted && this.plantedTimer > 0;
    }

    getPose(player) {
        const direction = this.isAttacking ? this.attackDirection : (player.facingRight ? 1 : -1);
        const progress = this.isAttacking ? this.getProgress() : 0;
        const centerX = player.x + player.width / 2;
        let rotation = -Math.PI * 0.5;
        let phase = 'rise';
        let flipT = 0;

        // 刀身の長さ
        const bladeLen = this.range + 18;
        const bladeEnd = bladeLen + 8; // getBladeGeometry と完全に同期

        // --- 地面判定の基準 ---
        const baseGroundY = (player.previewMode && typeof player.groundY === 'number') ? player.groundY : player.groundY;
        const maxTipY = baseGroundY + LANE_OFFSET;

        // 非攻撃時は「構え」ポーズ
        if (!this.isAttacking) {
            phase = 'ready';
            // 刃を下・峰を上にして前方斜め上に構える（約-60度＝右斜め上方向）
            // ctx.scale(direction, 1) が水平反転を担うため、左右ともに同じ angle を使う
            // ほぼ水平のやや上向き＋前方に構える
            const baseAngle = -Math.PI * 0.10 + Math.sin(player.motionTime * 0.0078) * 0.03;
            rotation = baseAngle;
            
            const handX = centerX + direction * (player.width * 0.48);
            const handY = player.y + player.height * 0.40 + (player.bob || 0) * 0.8;
            
            return { progress, phase, direction, rotation, handX, handY, bladeLen };
        }

        // 着地後は刺さりポーズ
        if (this.hasImpacted) {
            phase = 'planted';
            rotation = Math.PI * 0.5;
            const handX = centerX + direction * (player.width * 0.325);
            // 身長比率に基づいて手の高さを計算 (プレイヤー 60px に対し 7.5px = 0.125)
            const handY = player.y + player.height * 0.125;
            
            // 地面固定：剣の先端（bladeEnd）を地面（maxTipY）に揃える
            const tipY = handY + Math.sin(rotation) * bladeEnd;
            let adjustedHandY = handY;
            if (tipY > maxTipY) {
                adjustedHandY -= (tipY - maxTipY);
            }
            return { progress, phase, direction, rotation, handX, handY: adjustedHandY, bladeLen };
        }

        if (progress < this.liftEnd) {
            phase = 'rise';
            rotation = -Math.PI * 0.5;
        } else if (progress < this.stallEnd) {
            phase = 'stall';
            const t = (progress - this.liftEnd) / (this.stallEnd - this.liftEnd);
            rotation = -Math.PI * 0.5 + Math.sin(t * Math.PI) * 0.03;
        } else if (progress < this.flipEnd) {
            phase = 'flip';
            const t = (progress - this.stallEnd) / (this.flipEnd - this.stallEnd);
            const eased = t * t * (3 - 2 * t);
            flipT = t;
            const startRotation = -Math.PI * 0.5;
            const targetRotation = Math.PI * 0.5;
            rotation = startRotation + (targetRotation - startRotation) * eased;
        } else {
            phase = 'plunge';
            rotation = Math.PI * 0.5;
        }
        
        // 振り上げフェーズでの上昇は物理(update)で行うため、描画オフセットは安定させる
        // サイズ比率に基づいて手の位置を計算
        const forwardOffset = player.width * (phase === 'rise' ? 0.3 : (phase === 'stall' ? 0.325 : (phase === 'flip' ? 0.275 : 0.35)));
        const heightOffset = player.height * (phase === 'plunge' ? 0.266 : 0.283);

        let handX = centerX + direction * forwardOffset;
        let handY = player.y + heightOffset;

        if (phase === 'flip') {
            const lift = Math.sin(flipT * Math.PI);
            handX += direction * lift * 2.2;
            handY -= lift * 1.6;
        }

        // 接地判定制限：剣の先端が地面を絶対に突き抜けないように
        const tipY = handY + Math.sin(rotation) * bladeEnd;
        if (tipY > maxTipY) {
            handY -= (tipY - maxTipY);
        }

        return { progress, phase, direction, rotation, handX, handY, bladeLen };
    }

    getHandleMetrics() {
        const back = -34;
        const front = 21;
        return {
            back,
            front,
            center: (back + front) * 0.5
        };
    }

    localToWorldOnPose(pose, localX, localY = 0) {
        const cosR = Math.cos(pose.rotation);
        const sinR = Math.sin(pose.rotation);
        return {
            x: pose.handX + pose.direction * (localX * cosR - localY * sinR),
            y: pose.handY + (localX * sinR + localY * cosR)
        };
    }

    getDualGripAnchors(player) {
        const pose = this.getPose(player);
        const handle = this.getHandleMetrics();
        const centerX = handle.center;
        // 柄の中心付近を両手で挟む配置（長手方向に少しずらし、左右から包む）
        const halfSpan = 3.2;
        const pinch = 2.3;
        return {
            center: this.localToWorldOnPose(pose, centerX, 0),
            rear: this.localToWorldOnPose(pose, centerX - halfSpan, -pinch),
            front: this.localToWorldOnPose(pose, centerX + halfSpan, pinch),
            rotation: pose.rotation,
            direction: pose.direction,
            phase: pose.phase
        };
    }

    getHandAnchor(player) {
        const pose = this.getPose(player);
        // 刃の部分にかからないよう、柄の端方向（負の方向）へオフセットを拡大
        // ready（構え）時は柄の中央寄りをしっかり握る
        const gripOffset = (pose.phase === 'plunge' || pose.phase === 'planted') ? -26
                         : (pose.phase === 'ready') ? -10
                         : -18;
        return {
            x: pose.handX + Math.cos(pose.rotation) * gripOffset,
            y: pose.handY + Math.sin(pose.rotation) * gripOffset,
            rotation: pose.rotation,
            direction: pose.direction
        };
    }

    getBladeGeometry(pose) {
        const bladeStart = 22;
        const bladeEnd = pose.bladeLen + 8;
        const cosR = Math.cos(pose.rotation);
        const sinR = Math.sin(pose.rotation);
        const rootX = pose.handX + cosR * bladeStart;
        const rootY = pose.handY + sinR * bladeStart;
        const tipX = pose.handX + cosR * bladeEnd;
        const tipY = pose.handY + sinR * bladeEnd;
        return {
            bladeStart,
            bladeEnd,
            rootX,
            rootY,
            tipX,
            tipY,
            hitThickness: 22
        };
    }

    spawnImpactWaves() {
        const baseRange = Math.max(1, this.baseRange || this.range || 74);
        const rangeScale = Math.max(1, this.range / baseRange);
        const subWeaponTier = resolveSubWeaponEnhanceTier(this.owner, this.enhanceTier);
        const tierLifeScale = [1.0, 1.25, 1.6, 2.9][subWeaponTier];
        const tierSpeedScale = [1.0, 1.08, 1.2, 1.5][subWeaponTier];
        const speedScale = 1 + (rangeScale - 1) * 0.9;
        const lifeScale = 1 + (rangeScale - 1) * 1.25;
        const mainLife = Math.round(420 * lifeScale * tierLifeScale);
        const subLife = Math.round(320 * lifeScale * tierLifeScale);
        const mainSpeed = 7.8 * speedScale * tierSpeedScale;
        const subSpeed = 9.4 * speedScale * tierSpeedScale;
        this.groundWaves.push(
            { x: this.impactX, y: this.impactY, dir: -1, life: mainLife, maxLife: mainLife, speed: mainSpeed, thickness: 28, core: 11 },
            { x: this.impactX, y: this.impactY, dir: 1, life: mainLife, maxLife: mainLife, speed: mainSpeed, thickness: 28, core: 11 },
            { x: this.impactX, y: this.impactY, dir: -1, life: subLife, maxLife: subLife, speed: subSpeed, thickness: 20, core: 8 },
            { x: this.impactX, y: this.impactY, dir: 1, life: subLife, maxLife: subLife, speed: subSpeed, thickness: 20, core: 8 }
        );
    }

    spawnImpactDebris() {
        for (let i = 0; i < 16; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const speed = 2.8 + Math.random() * 4.8;
            this.impactDebris.push({
                x: this.impactX,
                y: this.impactY - 6,
                vx: side * speed * (0.6 + Math.random() * 0.6),
                vy: -2.8 - Math.random() * 4.2,
                size: 1.8 + Math.random() * 2.8,
                life: 320 + Math.random() * 220,
                maxLife: 520
            });
        }
    }
    
    update(deltaTime) {
        if (this.isAttacking) {
            const progress = this.getProgress();
            const subWeaponTier = (typeof resolveSubWeaponEnhanceTier === 'function') 
                ? resolveSubWeaponEnhanceTier(this.owner, this.enhanceTier) 
                : 0;

            // 着地後は刺さり演出へ移行
            if (this.hasImpacted) {
                this.plantedTimer -= deltaTime * 1000;
                
                // 接地中はオーナーを「ぶら下がり位置」で空中に固定
                if (this.owner && this.plantedTimer > 0) {
                    const bladeEnd = (this.range + 18) + 8;
                    const maxTipY = this.owner.groundY + LANE_OFFSET;
                    // オーナーのy = 地面 - 剣の長さ - 肩までのオフセット(比率計算)
                    const offsetRate = this.owner.isEnemy ? 0.125 : 0.125; // 共通化
                    const targetY = maxTipY - bladeEnd - (this.owner.height * offsetRate);
                    this.owner.y = targetY;
                    this.owner.vy = 0;
                    this.owner.isGrounded = false; // 足元は浮いている
                }

                if (this.plantedTimer <= 0) {
                    this.isAttacking = false;
                    this.plantedTimer = 0;
                    this.attackDirection = this.owner && this.owner.facingRight ? 1 : -1;
                }
            } else {
                if (this.owner) {
                    // 1. 上昇時 (rise フェーズ): Lv に応じて物理的に上昇
                    if (progress < this.liftEnd) {
                        const liftPower = -12 - (subWeaponTier * 8.5); // Lv3 で最大上昇力
                        // 最初の一撃で勢いをつけ、残りは維持
                        if (progress < 0.1) {
                            this.owner.vy = liftPower;
                        } else {
                            this.owner.vy = Math.min(this.owner.vy, liftPower * 0.4);
                        }
                    } else if (progress < this.stallEnd) {
                        // 滞空 (stall)
                        this.owner.vy *= 0.78;
                        if (Math.abs(this.owner.vy) < 1.0) this.owner.vy = 0;
                    } else if (progress < this.flipEnd) {
                        // 回転中 (flip) — 空中に留まる
                        this.owner.vy *= 0.7;
                        if (Math.abs(this.owner.vy) < 1.5) this.owner.vy = 0;
                    }
                    
                    // 2. 下降時 (flipEnd 以降)
                    if (progress >= this.flipEnd && progress < this.impactStart && this.owner.vy < 18) {
                        this.owner.vy = 24;
                    }
                    this.owner.vx *= 0.86;

                    // 接地判定の精密計算
                    const pose = this.getPose(this.owner);
                    const bladeEnd = pose.bladeLen + 8;
                    const maxTipY = this.owner.groundY + LANE_OFFSET;
                    const tipY = pose.handY + Math.sin(pose.rotation) * bladeEnd;

                    if (tipY >= maxTipY - 2) {
                        // 接地した瞬間に「ぶら下がり高度」で停止
                        const targetY = maxTipY - bladeEnd - (pose.phase === 'plunge' ? 16 : 7.5);
                        if (this.owner.y > targetY) {
                            this.owner.y = targetY;
                            this.owner.vy = 0;
                            this.hasImpacted = true;
                            this.plantedTimer = this.plantedDuration;
                            this.impactX = pose.handX + Math.cos(pose.rotation) * bladeEnd;
                            this.impactY = maxTipY;
                            this.impactFlashTimer = 170;
                            this.spawnImpactWaves();
                            this.spawnImpactDebris();
                            if (!this.impactSoundPlayed) {
                                this.impactSoundPlayed = true;
                                audio.playExplosion();
                                if (window.game && typeof window.game.queueHitFeedback === 'function') {
                                    window.game.queueHitFeedback(8.8, 92);
                                }
                            }
                        }
                    }
                }

                const landed = this.owner && this.owner.isGrounded;
                if (!this.hasImpacted && (landed || progress >= 0.98)) {
                    this.hasImpacted = true;
                    this.plantedTimer = this.plantedDuration;
                    if (this.owner) {
                        const pose = this.getPose(this.owner);
                        const bladeEnd = pose.bladeLen + 8;
                        this.impactX = pose.handX + Math.cos(pose.rotation) * bladeEnd;
                        this.impactY = this.owner.groundY + LANE_OFFSET;
                    }
                    this.impactFlashTimer = 170;
                    this.spawnImpactWaves();
                    this.spawnImpactDebris();
                    if (!this.impactSoundPlayed) {
                        this.impactSoundPlayed = true;
                        audio.playExplosion();
                    }
                }

                this.attackTimer -= deltaTime * 1000;
                if (this.attackTimer <= 0 && !this.hasImpacted) {
                    this.hasImpacted = true;
                    this.plantedTimer = this.plantedDuration;
                    if (this.owner) {
                        const pose = this.getPose(this.owner);
                        const bladeEnd = pose.bladeLen + 8;
                        this.impactX = pose.handX + Math.cos(pose.rotation) * bladeEnd;
                        this.impactY = this.owner.groundY + LANE_OFFSET;
                    }
                    this.impactFlashTimer = 170;
                    this.spawnImpactWaves();
                    this.spawnImpactDebris();
                    if (!this.impactSoundPlayed) {
                        this.impactSoundPlayed = true;
                        audio.playExplosion();
                    }
                }
            }
        }

        if (this.impactFlashTimer > 0) {
            this.impactFlashTimer -= deltaTime * 1000;
        }

        if (this.groundWaves.length > 0) {
            this.groundWaves = this.groundWaves.filter(w => {
                const lifeRatio = w.life / w.maxLife;
                const speed = w.speed + (1 - lifeRatio) * 3.5;
                w.x += w.dir * speed;
                w.life -= deltaTime * 1000;
                return w.life > 0;
            });
        }

        if (this.impactDebris.length > 0) {
            this.impactDebris = this.impactDebris.filter((p) => {
                p.vy += 0.42;
                p.x += p.vx;
                p.y += p.vy;
                p.life -= deltaTime * 1000;
                return p.life > 0;
            });
        }
    }
    
    getHitbox(player) {
        const hitboxes = [];

        // 着地前の刀身判定
        if (this.isAttacking && !this.hasImpacted) {
            const pose = this.getPose(player);
            const blade = this.getBladeGeometry(pose);
            const minX = Math.min(blade.rootX, blade.tipX) - blade.hitThickness * 0.5;
            const minY = Math.min(blade.rootY, blade.tipY) - blade.hitThickness * 0.5;
            hitboxes.push({
                x: minX,
                y: minY,
                width: Math.max(12, Math.abs(blade.tipX - blade.rootX) + blade.hitThickness),
                height: Math.max(12, Math.abs(blade.tipY - blade.rootY) + blade.hitThickness)
            });
        }

        if (this.impactFlashTimer > 0) {
            hitboxes.push({
                x: this.impactX - 52,
                y: this.impactY - 26,
                width: 104,
                height: 52
            });
        }

        if (this.groundWaves.length > 0) {
            for (const sw of this.groundWaves) {
                hitboxes.push({
                    x: sw.x - 26,
                    y: sw.y - 26,
                    width: 52,
                    height: 28
                });
            }
        }

        return hitboxes.length > 0 ? hitboxes : null;
    }
    
    render(ctx, player) {
        // 攻撃中 OR 刺さり中 OR 強制描画指定時は刀身を描画
        if (this.isAttacking || (player && player.forceSubWeaponRender)) {
            const pose = this.getPose(player);
            const blade = this.getBladeGeometry(pose);
            const handle = this.getHandleMetrics();
            ctx.save();
            ctx.translate(pose.handX, pose.handY);
            ctx.scale(pose.direction, 1);
            ctx.rotate(pose.rotation);

            // 柄（色を濃く、重厚に）
            const handleBack = handle.back;
            const handleFront = handle.front;
            ctx.fillStyle = '#3d2310';
            ctx.beginPath();
            ctx.rect(handleBack, -4.5, handleFront - handleBack, 9);
            ctx.fill();

            // 柄の巻紐表現（ひし形の重なり）
            ctx.fillStyle = '#221105';
            for (let x = handleBack + 4; x < handleFront - 4; x += 8) {
                ctx.beginPath();
                ctx.moveTo(x, -4.5);
                ctx.lineTo(x + 4, 0);
                ctx.lineTo(x, 4.5);
                ctx.lineTo(x - 4, 0);
                ctx.closePath();
                ctx.fill();
            }

            // 柄の縁取り
            ctx.strokeStyle = '#1a0d04';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(handleBack, -4.5, handleFront - handleBack, 9);

            // 鍔（少し使い込まれた金の色）
            ctx.fillStyle = '#b59345';
            ctx.beginPath();
            ctx.moveTo(16.5, -5.8);
            ctx.quadraticCurveTo(21.5, -8.0, 24.5, -1.1);
            ctx.quadraticCurveTo(21.5, 5.8, 16.2, 5.2);
            ctx.closePath();
            ctx.fill();
            
            // 鍔の厚み表現
            ctx.fillStyle = '#8c6b2a';
            ctx.fillRect(13.2, -4.8, 3.2, 9.6);

            // 鎺（はばき）
            ctx.fillStyle = '#c2a762';
            ctx.beginPath();
            ctx.moveTo(18.8, -5.0);
            ctx.lineTo(22.2, -4.0);
            ctx.lineTo(22.2, 4.0);
            ctx.lineTo(18.8, 5.0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 233, 185, 0.58)';
            ctx.lineWidth = 0.7;
            ctx.stroke();

            // 刀身
            const bladeStart = blade.bladeStart;
            const bladeEnd = blade.bladeEnd;
            const bladeGrad = ctx.createLinearGradient(bladeStart, -6, bladeEnd, 6);
            bladeGrad.addColorStop(0, '#e5e7eb');
            bladeGrad.addColorStop(0.15, '#9ca3af');
            bladeGrad.addColorStop(0.4, '#ffffff');
            bladeGrad.addColorStop(0.7, '#4b5563');
            bladeGrad.addColorStop(1, '#1f2937');
            
            ctx.fillStyle = bladeGrad;
            ctx.beginPath();
            const tipX = blade.bladeEnd + 5.0;
            const tipY = -0.8;
            ctx.moveTo(blade.bladeStart, -5.2);
            // 峰側（上側）を切先に向かって収束させる
            ctx.quadraticCurveTo(blade.bladeStart + 28, -12.4, blade.bladeEnd - 18, -6.8);
            ctx.quadraticCurveTo(blade.bladeEnd - 4.2, -4.2, tipX, tipY);
            // 刃側（下側）も同じ切先へ収束させ、二股に見える形状を避ける
            ctx.quadraticCurveTo(blade.bladeEnd - 4.8, 2.6, blade.bladeEnd - 22, 6.3);
            ctx.quadraticCurveTo(blade.bladeStart + 38, 8.4, blade.bladeStart + 7, 5.8);
            ctx.quadraticCurveTo(blade.bladeStart - 2, 2.8, blade.bladeStart, -5.2);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 1.0;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.stroke();

            // 峰のハイライト
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(blade.bladeStart + 10, -2.5);
            ctx.quadraticCurveTo(blade.bladeStart + 60, -5.0, blade.bladeEnd - 15, -1.5);
            ctx.stroke();

            // 刃文（はもん）
            ctx.strokeStyle = 'rgba(219, 232, 246, 0.56)';
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(blade.bladeStart + 12, 2.4);
            ctx.quadraticCurveTo(blade.bladeStart + 44, 4.1, blade.bladeStart + 70, 2.8);
            ctx.quadraticCurveTo(blade.bladeStart + 94, 1.7, blade.bladeEnd - 14, 3.2);
            ctx.stroke();

            // 切先の一点ハイライト（削除）
            // ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
            // ctx.beginPath();
            // ctx.arc(bladeEnd + 2.8, -0.75, 1.3, 0, Math.PI * 2);
            // ctx.fill();

            ctx.restore();

            // --- 空中斬撃エフェクト (Air Slash) ---
            if (this.isAttacking && !this.hasImpacted && pose.progress > this.stallEnd) {
                const slashPhase = Math.max(0, Math.min(1, (pose.progress - this.stallEnd) / (this.impactStart - this.stallEnd)));
                const slashAlpha = Math.sin(slashPhase * Math.PI) * 0.85;
                
                if (slashAlpha > 0.01) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    
                    ctx.translate(pose.handX, pose.handY);
                    ctx.scale(pose.direction, 1);

                    const arcRadius = pose.bladeLen + 6;
                    
                    // 剣は真上(-PI/2)から真下(PI/2)へ振り下ろす
                    // 剣筋の起点は常に真上（振り始めの位置）に固定
                    const swingOrigin = -Math.PI * 0.5;
                    const arcLead = 0.15;
                    
                    const startAngle = swingOrigin;
                    const endAngle = pose.rotation + arcLead;
                    
                    const arcSpan = endAngle - startAngle;
                    if (arcSpan > 0.05) {
                        // 外側の発光
                        ctx.strokeStyle = `rgba(255, 210, 160, ${slashAlpha * 0.3})`;
                        ctx.lineWidth = 22;
                        ctx.beginPath();
                        ctx.arc(0, 0, arcRadius, startAngle, endAngle, false);
                        ctx.stroke();
                        
                        // メインの鋭い光（尾側30%をフェード）
                        const fadeStart = startAngle + arcSpan * 0.3;
                        ctx.strokeStyle = `rgba(255, 250, 230, ${slashAlpha * 0.85})`;
                        ctx.lineWidth = 6;
                        ctx.beginPath();
                        ctx.arc(0, 0, arcRadius, fadeStart, endAngle, false);
                        ctx.stroke();
                        
                        // 芯のハイライト（先端50%のみ）
                        const coreStart = startAngle + arcSpan * 0.5;
                        ctx.strokeStyle = `rgba(255, 255, 255, ${slashAlpha})`;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(0, 0, arcRadius, coreStart, endAngle - 0.05, false);
                        ctx.stroke();
                    }
                    
                    ctx.restore();
                }
            }
        }

        // 着地インパクト
        if (this.impactFlashTimer > 0) {
            const alpha = Math.max(0, this.impactFlashTimer / 170);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            
            ctx.strokeStyle = `rgba(255, 200, 100, ${alpha})`;
            ctx.lineWidth = 6 + (1 - alpha) * 4;
            ctx.beginPath();
            ctx.ellipse(this.impactX, this.impactY, 20 + (1 - alpha) * 45, 8 + (1-alpha)*12, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            const coreAlpha = Math.pow(alpha, 0.5);
            ctx.fillStyle = `rgba(255, 230, 200, ${coreAlpha * 0.8})`;
            ctx.beginPath();
            ctx.arc(this.impactX, this.impactY, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 衝撃波
        if (this.groundWaves && this.groundWaves.length > 0) {
            for (let i = 0; i < this.groundWaves.length; i++) {
                const sw = this.groundWaves[i];
                if (!sw) continue;

                const ratio = Math.max(0, Math.min(1, sw.life / sw.maxLife));
                const px = sw.x;
                const py = sw.y - 3;
                
                ctx.save();
                ctx.translate(px, py);
                ctx.scale(sw.dir || 1, 1);
                ctx.globalAlpha = ratio * 1.5;
                ctx.globalCompositeOperation = 'lighter';
                
                const thickness = sw.thickness || 8;
                const waveGrad = ctx.createLinearGradient(0, -thickness, 0, thickness);
                waveGrad.addColorStop(0, 'rgba(255, 200, 50, 0)');
                waveGrad.addColorStop(0.5, 'rgba(255, 255, 200, 1)');
                waveGrad.addColorStop(1, 'rgba(255, 200, 50, 0)');
            
                ctx.fillStyle = waveGrad;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(24, -thickness * 0.6, 50, 0);
                ctx.quadraticCurveTo(24, thickness * 0.4, 0, 2);
                ctx.fill();

                const coreValue = sw.core || 4;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.beginPath();
                ctx.moveTo(0, -0.5);
                ctx.quadraticCurveTo(15, -coreValue * 0.5, 35, -0.5);
                ctx.quadraticCurveTo(15, coreValue * 0.2, 0, 0.8);
                ctx.fill();
                
                ctx.restore();
            }
        }

        if (this.impactDebris.length > 0) {
            for (const p of this.impactDebris) {
                const life = Math.max(0, p.life / p.maxLife);
                ctx.save();
                ctx.globalAlpha = life;
                ctx.fillStyle = 'rgba(198, 166, 116, 0.72)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (0.75 + life * 0.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }
}

// 武器ファクトリー
export function createSubWeapon(type) {
    switch (type) {
        case '手裏剣': return new Shuriken();
        case '火薬玉': return new Firebomb();
        case '大槍': return new Spear();
        case '二刀流': return new DualBlades();
        case '鎖鎌': return new Kusarigama();
        case '大太刀': return new Odachi();
        default: return null;
    }
}
