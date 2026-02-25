// ============================================
// Unification of the Nation - 武器クラス
// ============================================

import { COLORS, GRAVITY, CANVAS_WIDTH, LANE_OFFSET } from './constants.js';
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
    
    use(player) {
        // オーバーライド用
    }
    
    render(ctx, player) {
        // オーバーライド用
    }

    getHitbox(player) {
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

        // 追尾時の軌跡（よりシャープに）
        if (this.homing && lifeRatio > 0.1) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5 * lifeRatio;
            
            // 速度に応じたグラデーションを毎フレーム生成
            const trailGrad = ctx.createLinearGradient(0, 0, -this.vx * 1.5, -this.vy * 1.5);
            trailGrad.addColorStop(0, 'rgba(120, 220, 255, 1)');
            trailGrad.addColorStop(1, 'rgba(0, 100, 255, 0)');
            
            ctx.translate(this.x, this.y); // 原点を描画位置に合わせる
            ctx.strokeStyle = trailGrad;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-this.vx * 1.5, -this.vy * 1.5);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// 手裏剣サブ武器
export class Shuriken extends SubWeapon {
    constructor() {
        super('手裏剣', 12, 200, 300);
        this.projectiles = [];
        this.pendingShots = [];
        this.projectileRadius = 10;
        this.projectileRadiusHoming = 14;
        this.heldRotation = 0;
    }

    renderHeld(ctx, handX, handY, scale = 1.0) {
        const r = this.projectileRadius * scale;
        drawShurikenShape(ctx, handX, handY, r, this.heldRotation);
    }

    renderHeldLocal(ctx, localX, localY) {
        const r = this.projectileRadius;
        drawShurikenShape(ctx, localX, localY, r, this.heldRotation);
    }

    use(player) {
        const tier = (player && typeof player.getSubWeaponEnhanceTier === 'function')
            ? player.getSubWeaponEnhanceTier()
            : 0;

        const pierce = tier >= 2;
        const homing = tier >= 3;
        const shotCount = tier >= 2 ? 3 : (tier >= 1 ? 2 : 1);
        const direction = player.facingRight ? 1 : -1;

        const baseX = player.x + player.width / 2;
        const baseY = player.y;

        // ★1発目は即時生成
        this._spawnProjectile(baseX, baseY, direction, 0, shotCount, pierce, homing);

        for (let i = 1; i < shotCount; i++) {
            this.pendingShots.push({
                delay: i * 60,
                index: i,
                shotCount,
                pierce,
                homing,
                direction,
                baseX,
                baseY,
                isClone: false
            });
        }

        // 奥義分身
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            const cloneOffsets = player.getSubWeaponCloneOffsets();
            if (Array.isArray(cloneOffsets) && cloneOffsets.length > 0) {
                for (const clone of cloneOffsets) {
                    player.triggerCloneSubWeapon(clone.index); // アニメーション誘発
                    this._spawnProjectile(
                        baseX + clone.dx, baseY + clone.dy,
                        direction, 0, shotCount, pierce, homing
                    );
                    for (let i = 1; i < shotCount; i++) {
                        this.pendingShots.push({
                            delay: i * 60,
                            index: i,
                            shotCount,
                            pierce,
                            homing,
                            direction,
                            baseX: baseX + clone.dx,
                            baseY: baseY + clone.dy,
                            isClone: true
                        });
                    }
                }
            }
        }

        player.subWeaponAction = 'throw';
        audio.playShuriken();
    }
    _spawnProjectile(baseX, baseY, direction, index, shotCount, pierce, homing) {
        const spawnX = baseX + direction * 18;
        const spawnY = baseY + 16;
        const speed = 9;
        const spreadIndex = index - (shotCount - 1) / 2;
        const vy = spreadIndex * 0.3;
        const offsetY = spreadIndex * 3;
        const r = homing ? this.projectileRadiusHoming : this.projectileRadius;

        const proj = new ShurikenProjectile(
            spawnX,
            spawnY + offsetY,
            direction * speed,
            vy,
            this.damage,
            r,
            pierce,
            homing,
            index
        );
        this.projectiles.push(proj);
    }

    update(deltaTime, enemies = []) {
        const dtMs = deltaTime * 1000;

        // ★二重更新ガードを撤廃（ゲームループから1回だけ呼ばれる前提）

        this.heldRotation += 1.2 * deltaTime;

        // 遅延発射
        for (let i = this.pendingShots.length - 1; i >= 0; i--) {
            const shot = this.pendingShots[i];
            shot.delay -= dtMs;
            if (shot.delay <= 0) {
                this._spawnProjectile(
                    shot.baseX, shot.baseY,
                    shot.direction, shot.index, shot.shotCount,
                    shot.pierce, shot.homing
                );
                this.pendingShots.splice(i, 1);
            }
        }

        // ★projectile は必ずここからだけ更新（enemies を確実に渡す）
        for (const proj of this.projectiles) {
            proj.update(deltaTime, enemies);
        }
        this.projectiles = this.projectiles.filter(p => !p.isDestroyed);
    }

    getHitbox(player) {
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

    render(ctx, player) {
        for (const proj of this.projectiles) {
            proj.render(ctx);
        }
    }
}

// 火薬玉（爆弾を忍具として扱う）
export class Firebomb extends SubWeapon {
    constructor() {
        // 範囲制圧寄り: 爆風範囲を維持しつつ連投を抑制
        super('火薬玉', 32, 72, 460);
    }

    render(ctx, player) {
        // 投擲後は Bomb オブジェクトとして飛んでいくため、手元への描画は不要
        return;
    }
    use(player) {
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

        const tier = (player && typeof player.getSubWeaponEnhanceTier === 'function')
            ? player.getSubWeaponEnhanceTier()
            : 0;
        const shotCount = tier >= 2 ? 3 : (tier >= 1 ? 2 : 1);
        const sizeUp = tier >= 3; // Lv3でサイズアップ
        for (let shotIndex = 0; shotIndex < shotCount; shotIndex++) {
            const spread = shotCount === 1 ? 0 : (shotIndex - (shotCount - 1) / 2) * 0.9;
            const bomb = new Bomb(
                player.x + player.width / 2 + direction * (15 + shotIndex * 4),
                bombY - shotIndex * 1.5,
                vx + spread,
                vy - Math.abs(spread) * 0.2
            );
            bomb.damage = sizeUp ? Math.round(this.damage * 1.35) : this.damage;
            bomb.radius = sizeUp ? 11.5 : 9;
            bomb.explosionRadius = sizeUp ? Math.round(this.range * 1.28) : this.range;
            bomb.explosionDuration = sizeUp ? 420 : 340;
            g.bombs.push(bomb);
        }

        // 奥義分身中は分身位置からも同時投擲
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            const cloneOffsets = player.getSubWeaponCloneOffsets();
            if (Array.isArray(cloneOffsets) && cloneOffsets.length > 0) {
                for (const clone of cloneOffsets) {
                    player.triggerCloneSubWeapon(clone.index); // アニメーション誘発
                    for (let shotIndex = 0; shotIndex < shotCount; shotIndex++) {
                        const spread = shotCount === 1 ? 0 : (shotIndex - (shotCount - 1) / 2) * 0.9;
                        const cloneBomb = new Bomb(
                            player.x + clone.dx + player.width / 2 + direction * (15 + shotIndex * 4),
                            bombY + clone.dy - shotIndex * 1.5,
                            vx + (clone.index % 2 === 0 ? 0.5 : -0.5) + spread,
                            vy - Math.abs(spread) * 0.2
                        );
                        cloneBomb.damage = sizeUp ? Math.round(this.damage * 1.35) : this.damage;
                        cloneBomb.radius = sizeUp ? 10.5 : 8.5;
                        cloneBomb.explosionRadius = sizeUp ? Math.round(this.range * 1.28) : this.range;
                        cloneBomb.explosionDuration = sizeUp ? 400 : 320;
                        g.bombs.push(cloneBomb);
                    }
                }
            }
        }
        audio.playDash();
    }
}

// 大槍
export class Spear extends SubWeapon {
    constructor() {
        // 差し込み特化: 先端火力を高め、やや長射程に
        super('大槍', 28, 132, 360);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.baseAttackDuration = 270;
        this.attackDuration = this.baseAttackDuration;
        this.baseDashBoost = 76;
        this.dashBoost = this.baseDashBoost;
        this.attackDirection = 1;
        this.thrustPulse = 0;
        this.hitEnemies = new Set();
        this._cachedTipGrad = null; // キャッシュ用
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        this.attackDuration = this.baseAttackDuration;
        // Lv1〜Lv2: 主変化は踏み込み距離。Lv3はさらに大きく伸ばす。
        const dashByTier = [76, 106, 138, 176];
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
        const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
        const centerX = player.x + player.width / 2 + direction * 12;
        const y = player.y + 33;
        const thrust = this.range * (0.72 + 0.28 * Math.sin(progress * Math.PI));
        const spearEnd = centerX + direction * thrust;
        const shaftStartX = centerX - direction * 2;
        const shaftStartY = y + 1;
        const shaftEndX = spearEnd - direction * 15;
        const shaftEndY = y;
        const tipLen = 20;
        const tipWidth = 8;
        const tipBaseX = spearEnd - direction * tipLen;
        const tipBackX = spearEnd - direction * (tipLen + 5);
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

    getGripAnchors(player) {
        const st = this.getThrustState(player);
        const shaftDX = st.shaftEndX - st.shaftStartX;
        const shaftDY = st.shaftEndY - st.shaftStartY;
        const shaftLen = Math.max(1, Math.hypot(shaftDX, shaftDY));
        const shaftUX = shaftDX / shaftLen;
        const shaftUY = shaftDY / shaftLen;

        const rearDist = 8;
        const frontDist = Math.max(18, Math.min(34, shaftLen * 0.34));

        return {
            progress: st.progress,
            direction: st.direction,
            rear: {
                x: st.shaftStartX + shaftUX * rearDist,
                y: st.shaftStartY + shaftUY * rearDist + 1.0
            },
            front: {
                x: st.shaftStartX + shaftUX * frontDist,
                y: st.shaftStartY + shaftUY * frontDist + 1.5
            }
        };
    }
    
    getHitbox(player) {
        if (!this.isAttacking) return null;

        const st = this.getThrustState(player);
        const shaftThickness = 16;
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
        if (!this.isAttacking && (!player || !player.forceSubWeaponRender)) return;

        const st = this.getThrustState(player);
        const tasselSwing = Math.sin(st.progress * Math.PI * 3) * 5;
        
        ctx.save();
        
        // 1. 柄（え）
        ctx.strokeStyle = '#3d2b1f';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(st.shaftStartX, st.shaftStartY);
        ctx.lineTo(st.shaftEndX, st.shaftEndY); // 穂先の手前まで
        ctx.stroke();
        
        // 2. 飾り房（赤い房）
        ctx.fillStyle = '#d32f2f'; // 鮮やかな赤
        ctx.beginPath();
        ctx.arc(st.shaftEndX, st.y + 2, 6, 0, Math.PI, false);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(st.shaftEndX, st.y + 4);
        ctx.lineTo(st.spearEnd - st.direction * (18 + tasselSwing * 0.3), st.y + 13);
        ctx.lineTo(st.spearEnd - st.direction * 12, st.y + 9);
        ctx.closePath();
        ctx.fill();
        
        // 3. 穂先（鋼の鋭い先端）
        if (!this._cachedTipGrad) {
            // パラメータが固定なら、基準座標(0,0)からの相対配置で作りたいため、
            // 描画時にtranslateで合わせる方が汎用性が高いが、ここでは一旦描画時に生成したものをキャッシュする簡易アプローチをとる
            // (座標依存の場合はそのままにはできないので、translateを使った描画に切り替える)
        }
        
        ctx.save();
        ctx.translate(st.tipBaseX, st.y);
        
        if (!this._cachedTipGrad) {
            // ローカル座標でグラデーションを作成 (-tipWidth ～ +tipWidth)
            this._cachedTipGrad = ctx.createLinearGradient(0, -st.tipWidth, st.tipLen, 0);
            this._cachedTipGrad.addColorStop(0, '#c0c5ce');
            this._cachedTipGrad.addColorStop(0.4, '#f4f7fb');
            this._cachedTipGrad.addColorStop(1, '#8a95a5');
        }
        
        ctx.fillStyle = this._cachedTipGrad;
        ctx.strokeStyle = '#788290';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        // 原点を st.tipBaseX, st.y としたローカル座標で描画
        const localSpearEnd = st.spearEnd - st.tipBaseX;
        const localTipBackX = st.tipBackX - st.tipBaseX;
        
        ctx.moveTo(localSpearEnd, 0); // 先端
        ctx.lineTo(0, -st.tipWidth);
        ctx.lineTo(localTipBackX, 0);
        ctx.lineTo(0, st.tipWidth);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // 刃の峰ライン（ハイライト）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(localTipBackX, 0);
        ctx.lineTo(localSpearEnd, 0);
        ctx.stroke();
        
        ctx.restore();

        // 4. 柄の芯線で密度を追加
        ctx.strokeStyle = 'rgba(255, 240, 210, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(st.centerX, st.y - 1);
        ctx.lineTo(st.spearEnd - st.direction * 18, st.y - 1);
        ctx.stroke();

        // 5. 突き先のパルス
        if (this.thrustPulse > 0) {
            const pulseRatio = this.thrustPulse / 180;
            ctx.strokeStyle = `rgba(180, 255, 255, ${pulseRatio * 0.9})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(st.spearEnd + st.direction * 6, st.y, 12 + (1 - pulseRatio) * 16, -0.9, 0.9);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // 6. 突きのエフェクト (衝撃波・風切り)
        const duration = Math.max(1, this.attackDuration || 250);
        const remain = this.attackTimer / duration;
        if (st.progress > 0) {
            ctx.save();
            ctx.translate(st.spearEnd, st.y);
            ctx.scale(st.direction, 1); // 常に右向きとして描画し、directionで反転
            
            const alpha = Math.sin(remain * Math.PI); // ふわっと消える
            const tier = this.enhanceTier || 0;
            const coneReach = tier >= 2 ? 110 + (tier - 2) * 16 : 84;
            const lineReach = tier >= 2 ? 152 + (tier - 2) * 32 : 108;
            const mainLineWidth = tier >= 2 ? 4.6 : 2.2;
            
            // 鋭い衝撃波 (三角形・コーン状)
            if (!this._cachedShockGrad) {
                this._cachedShockGrad = ctx.createLinearGradient(0, 0, coneReach, 0);
                this._cachedShockGrad.addColorStop(0, `rgba(220, 255, 255, 0.9)`); // アルファは描画時に全体にかける
                this._cachedShockGrad.addColorStop(1, 'rgba(100, 200, 255, 0)');
            }
            
            ctx.save();
            ctx.globalAlpha = alpha; // 全体の透明度で制御
            ctx.fillStyle = this._cachedShockGrad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(60 + remain * 20, -15 * remain); // 上へ広がる
            ctx.lineTo(coneReach + remain * 32, 0); // 先端 (遠くへ)
            ctx.lineTo(60 + remain * 20, 15 * remain); // 下へ広がる
            ctx.fill();
            ctx.restore();
            
            // 芯のライン (白く鋭く)
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = mainLineWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(lineReach, 0);
            ctx.stroke();
            
            // 上下の風切り線
            ctx.strokeStyle = `rgba(180, 255, 255, ${alpha * 0.7})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(10, -5);
            ctx.lineTo(74 + Math.max(0, tier - 1) * 8, -22);
            ctx.moveTo(10, 5);
            ctx.lineTo(74 + Math.max(0, tier - 1) * 8, 22);
            ctx.stroke();

            // Lv3: 突き終わりに短い衝撃線を追加
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
        
        ctx.restore();
    }
}

// 二刀
export class DualBlades extends SubWeapon {
    constructor() {
        // 手数特化: 一撃は軽め、連撃でDPSを出す
        super('二刀流', 18, 64, 180);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackType = 'combined'; // 'main', 'left', 'right', 'combined'
        this.projectiles = []; 
        this.comboIndex = 0; // 連撃パターン用
        this.mainDuration = 204;
        this.baseMainMotionSpeedScale = 1.7;
        this.mainMotionSpeedScale = this.baseMainMotionSpeedScale; // 通常Z連撃と近い体感速度に合わせる
        this.baseCombinedDuration = 220;
        this.baseSideDuration = 150;
        this.combinedDuration = this.baseCombinedDuration;
        this.sideDuration = this.baseSideDuration;
        this.attackDirection = 1;
        this.pendingCombinedProjectile = null;
        this.prevMainRightAngle = null;
        this.prevMainLeftAngle = null;
        this.activeSideDuration = this.sideDuration;
        this.activeCombinedDuration = this.combinedDuration;
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        this.mainMotionSpeedScale = Math.max(
            1.05,
            this.baseMainMotionSpeedScale - this.enhanceTier * 0.11
        );
        this.combinedDuration = Math.max(
            136,
            Math.round(this.baseCombinedDuration * (1 - this.enhanceTier * 0.1))
        );
        this.sideDuration = Math.max(
            96,
            Math.round(this.baseSideDuration * (1 - this.enhanceTier * 0.11))
        );
    }

    getMainDurationByStep(step) {
        let base = 220;
        switch (step) {
            case 1: base = 148; break; // 初段: 抜き打ち
            case 2: base = 262; break; // 二段: 逆袈裟
            case 3: base = 186; break; // 三段: クロスステップ薙ぎ
            case 4: base = 304; break; // 四段: 二刀交叉
            default: base = 358; break; // 五段(0): 落下断ち
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
        const duration = Math.max(1, this.activeCombinedDuration || this.combinedDuration || 220);
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
            // 四段: ため上げ→空中交叉→叩き込み準備
            if (p < 0.24) return (p / 0.24) * 0.12;
            if (p < 0.7) return 0.12 + ((p - 0.24) / 0.46) * 0.66;
            return 0.78 + ((p - 0.7) / 0.3) * 0.22;
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
                    leftStart: 2.46, leftEnd: 1.1,
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
                    rightStart: 1.68, rightEnd: -1.52,
                    leftStart: -2.48, leftEnd: 0.96,
                    effectRadius: 112,
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
        this.activeSideDuration = Math.max(78, Math.round(this.sideDuration * enemyTempoScale));
        this.activeCombinedDuration = Math.max(124, Math.round(this.combinedDuration * enemyTempoScale));
        
        if (type === 'combined') {
            // X技は常に最新の1発のみを表示して剣筋の二重化を防ぐ
            this.projectiles = [];
            this.attackTimer = this.activeCombinedDuration;
            // 振り下ろしタイミングで発射するため、一旦保留
            this.pendingCombinedProjectile = {
                x: player.x + player.width / 2,
                y: player.y + player.height / 2,
                vx: this.attackDirection * (10 + this.enhanceTier * 0.8),
                life: 600 + this.enhanceTier * 60, // Lvが高いほど飛翔時間を延長
                maxLife: 600 + this.enhanceTier * 60,
                direction: this.attackDirection
            };
            audio.playDualBladeCombined();
        } else if (type === 'main') {
            // 5段ループの多方向コンボ
            this.comboIndex = (this.comboIndex + 1) % 5;
            this.mainDuration = Math.max(
                112,
                Math.round(this.getMainDurationByStep(this.comboIndex) * enemyTempoScale)
            );
            this.attackTimer = this.mainDuration;
            audio.playSlash(this.comboIndex);
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
        if (this.isAttacking) {
            // 合体攻撃は前半を溜め、後半の振り下ろしで飛翔斬撃を出す
            if (this.attackType === 'combined' && this.pendingCombinedProjectile && this.getCombinedSwingProgress() >= 0.58) {
                this.projectiles.push(this.pendingCombinedProjectile);
                this.pendingCombinedProjectile = null;
            }
            this.attackTimer -= deltaTime * 1000;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
                this.pendingCombinedProjectile = null;
                this.prevMainRightAngle = null;
                this.prevMainLeftAngle = null;
                this.activeSideDuration = this.sideDuration;
                this.activeCombinedDuration = this.combinedDuration;
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
                        x: centerX - this.range * 1.1,
                        y: centerY - this.range * 1.08,
                        width: this.range * 2.2,
                        height: this.range * 2.14
                    });
                    hitboxes.push({
                        x: frontX - this.range * 0.24,
                        y: player.y - 46,
                        width: this.range * 1.62,
                        height: 106
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
            hitboxes.push({
                x: p.x - 40, y: p.y - 40,
                width: 80, height: 80,
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
        
        // 1. 飛翔する交差斬撃（高輝度の三日月クロス）
        for (const p of this.projectiles) {
            const alpha = p.life / p.maxLife;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(p.direction * 1.35, 1.35);

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

            // 近接の剣筋と色対応を揃える（上: 赤、下: 青）
            drawCrescent('rgba(255, 80, 80, 0.98)', -Math.PI / 4);
            drawCrescent('rgba(80, 200, 255, 0.98)', Math.PI / 4);

            ctx.restore();
        }

        if (!this.isAttacking) {
            this.prevMainRightAngle = null;
            this.prevMainLeftAngle = null;
            return;
        }
        
        const isMain = this.attackType === 'main';
        const isCombined = this.attackType === 'combined';
        if (isMain) {
            const centerX = player.x + player.width / 2;
            const centerY = player.y + player.height / 2;
            const poseOptions = (
                player &&
                player.subWeaponAction === '二刀_Z' &&
                player.subWeaponPoseOverride
            ) ? player.subWeaponPoseOverride : undefined;
            const pose = this.getMainSwingPose(poseOptions || {});
            const alpha = Math.max(0.2, 1 - pose.progress * 0.74);

            const normalizeAngleDelta = (current, previous) => {
                let delta = current - previous;
                const full = Math.PI * 2;
                while (delta > Math.PI) delta -= full;
                while (delta < -Math.PI) delta += full;
                return delta;
            };

            const drawTrackedArcSlash = (
                palette,
                currentAngle,
                swingDelta,
                radius,
                width,
                yOffset = 0,
                spanGain = 1
            ) => {
                const swingSpeed = Math.abs(swingDelta);
                const motionProgress = Math.max(0, Math.min(1, pose.progress));
                const visibilityPhase = Math.max(0, Math.sin(motionProgress * Math.PI));
                if (swingSpeed < 0.004 && visibilityPhase < 0.28) return;

                ctx.save();
                ctx.translate(centerX, centerY + yOffset);
                ctx.scale(direction, 1);
                ctx.lineCap = 'round';
                const movingForward = swingDelta >= 0;
                const dynamicSpan = swingSpeed * 14.6 * spanGain;
                const lingerSpan = (0.18 + visibilityPhase * 0.28) * spanGain;
                const backSpan = Math.min(1.28, Math.max(lingerSpan, dynamicSpan));
                const leadSpan = Math.min(0.18, Math.max(0.018, backSpan * (0.16 + visibilityPhase * 0.08)));
                const start = movingForward ? (currentAngle - backSpan) : (currentAngle - leadSpan);
                const end = movingForward ? (currentAngle + leadSpan) : (currentAngle + backSpan);
                const ccw = end < start;
                const backAlpha = alpha * 0.42;
                const frontAlpha = alpha;

                // 1) 薄い残像（主弧の一歩後ろ）
                const trailStart = movingForward
                    ? (currentAngle - backSpan * 1.55)
                    : (currentAngle + backSpan * 0.38);
                const trailEnd = movingForward
                    ? (currentAngle - backSpan * 0.42)
                    : (currentAngle + backSpan * 1.52);
                const ccwTrail = trailEnd < trailStart;
                // ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(${palette.back[0]}, ${palette.back[1]}, ${palette.back[2]}, ${backAlpha * 0.7})`;
                ctx.lineWidth = width * 0.52;
                ctx.beginPath();
                ctx.arc(-8.5, -2.8, radius * 0.9, trailStart, trailEnd, ccwTrail);
                ctx.stroke();

                // 2) 中間の弧
                // ctx.shadowBlur = 12;
                // ctx.shadowColor = `rgba(${palette.front[0]}, ${palette.front[1]}, ${palette.front[2]}, ${frontAlpha * 0.45})`;
                ctx.strokeStyle = `rgba(${palette.back[0]}, ${palette.back[1]}, ${palette.back[2]}, ${backAlpha})`;
                ctx.lineWidth = width * 0.72;
                ctx.beginPath();
                ctx.arc(-6.8, -2.1, radius * 0.94, start + 0.06, end + 0.06, ccw);
                ctx.stroke();

                // ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(${palette.front[0]}, ${palette.front[1]}, ${palette.front[2]}, ${frontAlpha})`;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.arc(-5, 0, radius, start, end, ccw);
                ctx.stroke();

                ctx.strokeStyle = `rgba(255, 255, 255, ${frontAlpha * 0.46})`;
                ctx.lineWidth = Math.max(1.4, width * 0.18);
                ctx.beginPath();
                ctx.arc(-3.6, -1.2, Math.max(2, radius - 2.2), start + 0.03, end + 0.03, ccw);
                ctx.stroke();
                ctx.restore();
            };

            const bluePalette = { front: [130, 234, 255], back: [76, 154, 226] };
            const redPalette = { front: [255, 90, 90], back: [214, 74, 74] };
            const sampleStep = 0.055;
            const prevProgress = Math.max(0, pose.progress - sampleStep);
            const prevRemapped = this.remapMainSwingProgress(pose.comboIndex, prevProgress);
            const prevEased = prevRemapped * prevRemapped * (3 - 2 * prevRemapped);
            const prevRightAngle = pose.arcs.rightStart + (pose.arcs.rightEnd - pose.arcs.rightStart) * prevEased;
            const prevLeftAngle = pose.arcs.leftStart + (pose.arcs.leftEnd - pose.arcs.leftStart) * prevEased;
            const rightDelta = normalizeAngleDelta(pose.rightAngle, prevRightAngle);
            const leftDelta = normalizeAngleDelta(pose.leftAngle, prevLeftAngle);
            if (pose.arcs.hit === 'drawDash') {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, (pose.arcs.effectRadius + 10) * trailScale, 13.8 * trailScale, -6, 0.82);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, (pose.arcs.effectRadius + 2) * trailScale, 10.8 * trailScale, 5, 0.74);
            } else if (pose.arcs.hit === 'reverseCounter') {
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, (pose.arcs.effectRadius + 14) * trailScale, 14.4 * trailScale, -9, 0.9);
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, (pose.arcs.effectRadius + 7) * trailScale, 12.4 * trailScale, 7, 0.76);
            } else if (pose.arcs.hit === 'crossStepSweep') {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, (pose.arcs.effectRadius + 18) * trailScale, 12.0 * trailScale, -3, 0.72);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, (pose.arcs.effectRadius + 16) * trailScale, 11.8 * trailScale, 4, 0.72);
            } else if (pose.arcs.hit === 'risingX') {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, (pose.arcs.effectRadius + 18) * trailScale, 14.6 * trailScale, -5, 0.92);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, (pose.arcs.effectRadius + 14) * trailScale, 14.0 * trailScale, 6, 0.9);
            } else {
                drawTrackedArcSlash(bluePalette, pose.rightAngle, rightDelta, (pose.arcs.effectRadius + 16) * trailScale, 14.0 * trailScale, -5, 0.84);
                drawTrackedArcSlash(redPalette, pose.leftAngle, leftDelta, (pose.arcs.effectRadius + 12) * trailScale, 13.4 * trailScale, 5, 0.86);
            }
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
        super('鎖鎌', 20, 245, 480);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.baseTotalDuration = 560;
        this.totalDuration = this.baseTotalDuration;
        this.owner = null;
        this.attackDirection = 1;
        this.baseExtendEnd = 0.28;
        this.baseOrbitEnd = 0.9;
        this.extendEnd = this.baseExtendEnd;
        this.orbitEnd = this.baseOrbitEnd;
        this.rangeScale = 1.0;
        this.multiHitCount = 1;
        this.tipX = null;
        this.tipY = null;
        this.echoHitEnemies = new Set();
        this.autoTrackCooldownMs = 95;
        this.nextAutoTrackTime = 0;
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        const tierMap = [
            { total: 560, rangeScale: 1.0, multi: 1, extend: 0.28, orbit: 0.9 },
            { total: 520, rangeScale: 1.16, multi: 2, extend: 0.25, orbit: 0.9 },
            { total: 490, rangeScale: 1.34, multi: 3, extend: 0.23, orbit: 0.91 },
            { total: 450, rangeScale: 1.56, multi: 4, extend: 0.2, orbit: 0.92 }
        ];
        const conf = tierMap[this.enhanceTier] || tierMap[0];
        this.totalDuration = conf.total;
        this.rangeScale = conf.rangeScale;
        this.multiHitCount = conf.multi;
        this.extendEnd = conf.extend;
        this.orbitEnd = conf.orbit;
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
        let phase = 'extend';
        let phaseT = 0;

        if (progress < this.extendEnd) {
            phase = 'extend';
            phaseT = progress / this.extendEnd;
            const easeOut = 1 - Math.pow(1 - phaseT, 2.2);
            radius = this.range * this.rangeScale * easeOut;
            angle = -0.08 + phaseT * 0.16;
        } else if (progress < this.orbitEnd) {
            phase = 'orbit';
            phaseT = (progress - this.extendEnd) / (this.orbitEnd - this.extendEnd);
            radius = this.range * this.rangeScale;
            // 前方 -> 真後ろ上までの180度弧で旋回（地面めり込み防止）
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            angle = -eased * Math.PI;
        } else {
            phase = 'retract';
            phaseT = (progress - this.orbitEnd) / (1 - this.orbitEnd);
            // 縮退も常に円弧上（角度と半径を同時補間）
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            radius = this.range * this.rangeScale * (1 - eased * 0.9);
            const startAngle = -Math.PI;
            const endAngle = -Math.PI * 0.18;
            angle = startAngle + (endAngle - startAngle) * eased;
        }

        const chainDirX = direction * Math.cos(angle);
        const chainDirY = Math.sin(angle);
        const chainHeading = Math.atan2(chainDirY, chainDirX);
        const headY = player.y + 15;
        const headBackPivotX = centerX - direction * 8.5;
        const headBackPivotY = headY - 2.4;

        let handX = shoulderX;
        let handY = shoulderY;
        if (phase === 'extend') {
            // 振りかぶり → 真っ直ぐ前へ伸ばす
            const ease = phaseT * phaseT * (3 - 2 * phaseT);
            const startLocalX = -18.0;
            const startY = -16.0;
            const endLocalX = 28.0;
            const endY = -0.2;
            const localX = startLocalX + (endLocalX - startLocalX) * ease;
            handX = shoulderX + direction * localX;
            handY = shoulderY + (startY + (endY - startY) * ease);
        } else if (phase === 'orbit') {
            // 伸ばしたまま、後頭部付近を大きく回す
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            const orbitStart = 0.02;
            const orbitEnd = -Math.PI;
            const orbit = orbitStart + (orbitEnd - orbitStart) * eased;
            const reach = 27.0;
            handX = headBackPivotX + direction * (Math.cos(orbit) * reach);
            handY = headBackPivotY + Math.sin(orbit) * reach;
        } else {
            // 回し終わりから収納へ戻す
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            const fromOrbit = -Math.PI;
            const fromX = headBackPivotX + direction * (Math.cos(fromOrbit) * 27.0);
            const fromY = headBackPivotY + Math.sin(fromOrbit) * 27.0;
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
        if (this.multiHitCount > 1) {
            const tipReach = 18;
            const normalX = -Math.sin(st.chainHeading) * tipReach;
            const normalY = Math.cos(st.chainHeading) * tipReach;
            for (let i = 1; i < this.multiHitCount; i++) {
                const offset = (i - (this.multiHitCount - 1) * 0.5) * 10;
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

        // 鎖 (ローカルグラデーションキャッシュ: 長さが一定でないため、ここではそのままか、簡易な距離ベースに)
    // 鎖は毎フレームの描画としては妥当なラインなので、ここだけは残すか計算を省く程度にする
    const chainGradient = ctx.createLinearGradient(st.handX, st.handY, st.tipX, st.tipY);
    chainGradient.addColorStop(0, 'rgba(170, 176, 188, 0.95)');
    chainGradient.addColorStop(0.55, 'rgba(128, 136, 150, 0.98)');
    chainGradient.addColorStop(1, 'rgba(92, 102, 118, 0.95)');
        ctx.lineDashOffset = -st.progress * 150; // 鎖が動いているような視覚効果
        ctx.strokeStyle = chainGradient;
        ctx.lineWidth = 2.4; // ★修正: 鎖を少し細く (3.1 -> 2.4)
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(st.handX, st.handY);
        ctx.lineTo(st.tipX, st.tipY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(230, 245, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(st.handX + st.chainDirY * 1.4, st.handY - st.chainDirX * 1.4);
        ctx.lineTo(st.tipX + st.chainDirY * 1.4, st.tipY - st.chainDirX * 1.4);
        ctx.stroke();

        // 鎌ヘッド
        ctx.save();
        ctx.translate(st.tipX, st.tipY);
        const sickle = this.getSickleGeometry(st);
        ctx.rotate(sickle.rotation);
        
        // 分銅（根元）
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(-4, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // 刃の金属グラデーション（キャッシュ）
        if (!this._cachedSickleGrad) {
            this._cachedSickleGrad = ctx.createLinearGradient(0, -10, 26, 6);
            this._cachedSickleGrad.addColorStop(0, '#f0f4f8');
            this._cachedSickleGrad.addColorStop(0.5, '#a5b0bd');
            this._cachedSickleGrad.addColorStop(1, '#56616e');
        }
        ctx.fillStyle = this._cachedSickleGrad;
        ctx.strokeStyle = '#3b434c';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // 鎌の形状をシャープに
        ctx.quadraticCurveTo(18, -12, 28, -2);
        ctx.quadraticCurveTo(16, 2, 3, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // ハイライト線
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(2, -1.5);
        ctx.quadraticCurveTo(14, -6.5, 25, -2);
        ctx.stroke();
        
        // 柄
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.restore();

        // 鎌先の風切り
        if (st.phase !== 'extend' && st.radius > 20) {
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
// weapon.js の Odachi クラス

// ============================================
// 大太刀 (修正版)
// ============================================

export class Odachi extends SubWeapon {
    constructor() {
        super('大太刀', 46, 74, 760);
        this.isAttacking = false;
        this.attackTimer = 0;
        this.baseTotalDuration = 760;
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
        this.impactStart = this.baseImpactStart;
        this.attackDirection = 1;
        // 着地後の「刺さり演出」用タイマー
        this.plantedTimer = 0;
        this.basePlantedDuration = 320;
        this.plantedDuration = this.basePlantedDuration; // 衝撃波が消えるまで刀を地面に刺したまま見せる
        this.impactSoundPlayed = false; // 着地爆発音の重複防止
        this._cachedBladeGrad = null; // キャッシュ用
        this._cachedWaveGrad = null; // キャッシュ用
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        // totalDuration の短縮を緩やかにする（0.08 → 0.035 per tier）
        this.totalDuration = Math.max(
            620,
            Math.round(this.baseTotalDuration * (1 - this.enhanceTier * 0.035))
        );
        // impactStart の短縮も緩やかに（0.045 → 0.025 per tier）
        this.impactStart = Math.max(0.78, this.baseImpactStart - this.enhanceTier * 0.025);
        this.plantedDuration = Math.round(this.basePlantedDuration * (1 + this.enhanceTier * 0.12));
        this._cachedBladeGrad = null;
        this._cachedWaveGrad = null;
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
            player.vy = -16.5;
        } else {
            player.vy = -30;
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
        
        const phaseForwardOffset =
            phase === 'rise' ? 12 :
            phase === 'stall' ? 13 :
            phase === 'flip' ? 11 : 14; 
        
        // 振り上げフェーズでの上昇は物理(update)で行うため、描画オフセットは安定させる
        // サイズ比率に基づいて手の位置を計算
        const forwardOffset = player.width * (phase === 'rise' ? 0.3 : (phase === 'stall' ? 0.325 : (phase === 'flip' ? 0.275 : 0.35)));
        let heightOffset = player.height * (phase === 'plunge' ? 0.266 : 0.283);

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
                            this.impactX = this.owner.x + this.owner.width / 2;
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
                        this.impactX = this.owner.x + this.owner.width / 2;
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
                        this.impactX = this.owner.x + this.owner.width / 2;
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
            ctx.save();
            ctx.translate(pose.handX, pose.handY);
            ctx.scale(pose.direction, 1);
            ctx.rotate(pose.rotation);

            // 柄（色を濃く、重厚に）
            const handleBack = -34;
            const handleFront = 21;
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

            // 切先側のハイライトは一旦外し、先端形状の破綻を優先して排除する

            // 峰のハイライト
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(blade.bladeStart + 10, -2.5);
            ctx.quadraticCurveTo(blade.bladeStart + 60, -5.0, blade.bladeEnd - 15, -1.5);
            ctx.stroke();

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
