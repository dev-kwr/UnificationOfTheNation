// ============================================
// Unification of the Nation - ボスクラス
// ============================================

import { COLORS, GRAVITY, CANVAS_WIDTH } from './constants.js';
import { Enemy } from './enemy.js';

// ボスベースクラス
class Boss extends Enemy {
    init() {
        this.width = 60;
        this.height = 90;
        this.hp = 200;
        this.maxHp = 200;
        this.damage = 4; // 5から下方修正
        this.speed = 2;
        this.expReward = 300;
        this.moneyReward = 200;
        this.specialGaugeReward = 100; // 50 -> 100
        this.detectionRange = 500;
        this.attackRange = 80;
        
        // ボス専用
        this.phase = 1;
        this.maxPhase = 2;
        this.phaseTransitioning = false;
        this.attackPatterns = [];
        this.currentPattern = 0;
        this.bossName = 'Boss';
        this.weaponDrop = null;
    }
    
    update(deltaTime, player) {
        // フェーズ移行チェック
        if (!this.phaseTransitioning && this.phase < this.maxPhase) {
            const hpRatio = this.hp / this.maxHp;
            if (hpRatio <= 0.5 && this.phase === 1) {
                this.startPhaseTransition();
            }
        }
        
        return super.update(deltaTime, player);
    }
    
    startPhaseTransition() {
        this.phaseTransitioning = true;
        this.isAttacking = false;
        this.attackCooldown = 2000;
        
        setTimeout(() => {
            this.phase++;
            this.phaseTransitioning = false;
            this.onPhaseChange();
        }, 1000);
    }
    
    onPhaseChange() {
        // サブクラスでオーバーライド
        this.speed *= 1.2;
        this.damage += 2;
    }
    
    renderBody(ctx) {
        // サブクラスでオーバーライド
    }
    
    renderPhaseTransition(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // フェーズ移行エフェクト
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, 40 + i * 20, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// ステージ1ボス: 槍持ちの侍大将
export class YariTaisho extends Boss {
    init() {
        super.init();
        this.bossName = '槍持ちの侍大将';
        this.weaponDrop = '大槍';
        this.hp = 150;    // 250から大幅に下げ、倒しやすく
        this.maxHp = 150;
        this.attackRange = 100;
        this.attackPatterns = ['thrust', 'sweep', 'jump'];
    }
    
    startAttack() {
        this.isAttacking = true;
        const pattern = this.attackPatterns[Math.floor(Math.random() * this.attackPatterns.length)];
        this.currentPattern = pattern;
        
        switch (pattern) {
            case 'thrust':
                this.attackTimer = 400;
                this.attackCooldown = 600;
                break;
            case 'sweep':
                this.attackTimer = 600;
                this.attackCooldown = 1000;
                break;
            case 'jump':
                this.attackTimer = 800;
                this.attackCooldown = 1200;
                this.vy = -15;
                this.isGrounded = false;
                break;
        }
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        
        if (this.currentPattern === 'thrust' && this.attackTimer > 200) {
            this.vx = (this.facingRight ? 1 : -1) * this.speed * 2;
        }
        
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.vx = 0;
        }
    }
    
    getAttackHitbox() {
        if (!this.isAttacking) return null;
        
        const direction = this.facingRight ? 1 : -1;
        
        switch (this.currentPattern) {
            case 'thrust':
                return {
                    x: this.x + (this.facingRight ? this.width : -this.attackRange),
                    y: this.y + 30,
                    width: this.attackRange,
                    height: 30
                };
            case 'sweep':
                return {
                    x: this.x - 30,
                    y: this.y + 40,
                    width: this.width + 60,
                    height: 40
                };
            case 'jump':
                if (!this.isGrounded) {
                    return {
                        x: this.x - 20,
                        y: this.y + this.height - 30,
                        width: this.width + 40,
                        height: 50
                    };
                }
                break;
        }
        return null;
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const topY = this.y + this.bob;
        const dir = this.facingRight ? 1 : -1;
        
        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }
        
        // 1. 足（大型の袴）
        const legY = this.y + this.height;
        ctx.fillStyle = COLORS.ENEMY_BUSHO || '#800';
        
        const lx = centerX - 12 + Math.sin(this.legAngle) * 12;
        ctx.fillRect(lx - 8, topY + 50, 16, legY - (topY + 50));
        
        const rx = centerX + 12 - Math.sin(this.legAngle) * 12;
        ctx.fillRect(rx - 8, topY + 50, 16, legY - (topY + 50));

        // 2. 胴体（重装甲の鎧）
        ctx.fillStyle = COLORS.CLOTH_RED;
        ctx.beginPath();
        ctx.roundRect(centerX - 20, topY + 20, 40, 45, 5);
        ctx.fill();
        
        // 鎧の金縁
        ctx.strokeStyle = COLORS.ARMOR_GOLD;
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - 18, topY + 25, 36, 35);
        
        // 肩当て（大袖）
        ctx.fillStyle = COLORS.CLOTH_RED;
        ctx.fillRect(centerX - 30, topY + 22, 12, 20);
        ctx.fillRect(centerX + 18, topY + 22, 12, 20);

        // 3. 頭（大兜）
        ctx.fillStyle = COLORS.PLAYER_SKIN;
        ctx.fillRect(centerX - 8, topY + 10, 16, 16);
        
        ctx.fillStyle = COLORS.ARMOR_IRON;
        ctx.beginPath();
        ctx.arc(centerX, topY + 12, 20, Math.PI, 0);
        ctx.fill();
        
        // 兜の吹き返し
        ctx.fillRect(centerX - 25, topY + 8, 8, 15);
        ctx.fillRect(centerX + 17, topY + 8, 8, 15);
        
        // 前立て（金の三日月）
        ctx.strokeStyle = COLORS.ARMOR_GOLD;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(centerX, topY - 5, 15, 0.5, Math.PI - 0.5, true);
        ctx.stroke();

        // 4. 大槍（メイン武器）
        const armY = topY + 40;
        ctx.strokeStyle = COLORS.WOOD_BROWN;
        ctx.lineWidth = 5;
        
        if (this.isAttacking) {
            const progress = 1 - this.attackTimer / (this.currentPattern === 'sweep' ? 600 : 400);
            
            if (this.currentPattern === 'thrust') {
                const reach = progress * 60;
                ctx.beginPath();
                ctx.moveTo(centerX, armY);
                ctx.lineTo(centerX + dir * (100 + reach), armY);
                ctx.stroke();
                
                // 槍の穂先
                ctx.fillStyle = COLORS.STEEL;
                ctx.beginPath();
                ctx.moveTo(centerX + dir * (100 + reach), armY - 5);
                ctx.lineTo(centerX + dir * (125 + reach), armY);
                ctx.lineTo(centerX + dir * (100 + reach), armY + 5);
                ctx.fill();
            } else if (this.currentPattern === 'sweep') {
                ctx.save();
                ctx.translate(centerX, armY + 10);
                const sweepAngle = progress * Math.PI;
                ctx.rotate(dir * (sweepAngle - Math.PI / 2));
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(110, 0);
                ctx.stroke();
                
                // 槍の斬撃演出 (sweep)
                ctx.save();
                ctx.shadowBlur = 10;
                ctx.shadowColor = COLORS.STEEL;
                ctx.strokeStyle = 'rgba(200, 220, 255, 0.5)';
                ctx.lineWidth = 20;
                ctx.beginPath();
                ctx.arc(0, 0, 120, -0.6, 0.6);
                ctx.stroke();
                ctx.restore();

                // 穂先
                ctx.fillStyle = COLORS.STEEL;
                ctx.beginPath();
                ctx.moveTo(110, -5);
                ctx.lineTo(130, 0);
                ctx.lineTo(110, 5);
                ctx.fill();
                ctx.restore();
            }
        } else {
            // 待機時の槍
            ctx.beginPath();
            ctx.moveTo(centerX + dir * 15, armY + 20);
            ctx.lineTo(centerX + dir * 30, armY - 50);
            ctx.stroke();
            
            ctx.fillStyle = COLORS.STEEL;
            ctx.save();
            ctx.translate(centerX + dir * 30, armY - 50);
            ctx.rotate(dir * -Math.PI / 6);
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(25, 0);
            ctx.lineTo(0, 5);
            ctx.fill();
            ctx.restore();
        }
        
        // フェーズ2では赤いオーラ
        if (this.phase >= 2) {
            ctx.strokeStyle = `rgba(255, 0, 0, ${0.3 + Math.sin(Date.now() * 0.01) * 0.2})`;
            ctx.lineWidth = 15;
            ctx.beginPath();
            ctx.arc(centerX, topY + 40, 70, 0, Math.PI * 2);
            ctx.stroke();
            
            // 粒子エフェクト
            for(let i=0; i<5; i++) {
                const angle = Date.now() * 0.01 + i * Math.PI * 0.4;
                const r = 70 + Math.sin(Date.now() * 0.02 + i) * 10;
                ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
                ctx.beginPath();
                ctx.arc(centerX + Math.cos(angle) * r, topY + 40 + Math.sin(angle) * r, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

// ステージ2ボス: 二刀流の剣豪
export class NitoryuKengo extends Boss {
    init() {
        super.init();
        this.bossName = '二刀流の剣豪';
        this.weaponDrop = '二刀';
        this.hp = 200;    // 280から調整
        this.maxHp = 200;
        this.speed = 2.5;
        this.attackPatterns = ['double', 'dash', 'spin'];
    }
    
    startAttack() {
        this.isAttacking = true;
        const pattern = this.attackPatterns[Math.floor(Math.random() * (this.phase === 2 ? 3 : 2))];
        this.currentPattern = pattern;
        
        switch (pattern) {
            case 'double':
                this.attackTimer = 300;
                this.attackCooldown = 400;
                break;
            case 'dash':
                this.attackTimer = 400;
                this.attackCooldown = 800;
                break;
            case 'spin':
                this.attackTimer = 600;
                this.attackCooldown = 1000;
                break;
        }
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        
        if (this.currentPattern === 'dash' && this.attackTimer > 150) {
            this.vx = (this.facingRight ? 1 : -1) * this.speed * 4;
        }
        
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.vx = 0;
            this.vy = 0; // 空中へ飛んでいかないように重力リセット
        }
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const topY = this.y + this.bob;
        const dir = this.facingRight ? 1 : -1;
        
        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }
        
        // 1. マフラー（なびく演出）
        ctx.fillStyle = '#C0392B'; // 深紅色
        ctx.beginPath();
        const scarfX = centerX - dir * 10;
        const scarfY = topY + 25;
        ctx.moveTo(scarfX, scarfY);
        const wave = Math.sin(Date.now() * 0.015) * 10;
        ctx.lineTo(scarfX - dir * 40, scarfY + wave - 5);
        ctx.lineTo(scarfX - dir * 35, scarfY + wave + 10);
        ctx.closePath();
        ctx.fill();

        // 2. 足（袴・力強いシルエット）
        const legY = this.y + this.height;
        ctx.fillStyle = '#2F4F4F'; // ダークスレートグレイ
        ctx.beginPath();
        ctx.moveTo(centerX - 15, topY + 60);
        ctx.lineTo(centerX + 15, topY + 60);
        ctx.lineTo(centerX + 20, legY);
        ctx.lineTo(centerX - 20, legY);
        ctx.closePath();
        ctx.fill();
        
        // 袴のひだ
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, topY + 60);
        ctx.lineTo(centerX, legY);
        ctx.stroke();

        // 3. 胴体（胸当て・胴丸風）
        ctx.fillStyle = '#2F4F4F';
        ctx.beginPath();
        // ctx.roundRect は環境によって不安定なことがあるため矩形で代用
        ctx.fillRect(centerX - 18, topY + 30, 36, 35);
        
        // 胸当ての装飾
        ctx.strokeStyle = '#708090'; // スレートグレイ
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - 12, topY + 35, 24, 25);
        
        // 肩当て（大袖）
        ctx.fillStyle = '#3E5858';
        ctx.fillRect(centerX - 25, topY + 32, 10, 15);
        ctx.fillRect(centerX + 15, topY + 32, 10, 15);

        // 4. 頭（精悍な頭巾）
        ctx.fillStyle = '#2F4F4F';
        ctx.beginPath();
        ctx.arc(centerX, topY + 15, 16, 0, Math.PI * 2);
        ctx.fill();
        
        // 顔（スリットから見える目）
        ctx.fillStyle = '#f0d0b0'; // 肌色
        ctx.fillRect(centerX - 10, topY + 12, 20, 5);
        ctx.fillStyle = '#ff0'; // 鋭い目
        ctx.fillRect(centerX - 6, topY + 14, 4, 2);
        ctx.fillRect(centerX + 2, topY + 14, 4, 2);

        // 5. 二刀
        ctx.strokeStyle = '#C0C0C0';
        ctx.lineWidth = 3;
        
        if (this.isAttacking) {
            const progress = 1 - this.attackTimer / 300;
            const angle1 = dir * (-0.5 + progress * Math.PI);
            const angle2 = dir * (0.5 - progress * Math.PI);
            
            // 右手刀
            ctx.save();
            ctx.translate(centerX + dir * 18, topY + 45);
            ctx.rotate(angle1);
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#aaf';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(65, 0); ctx.stroke();
            
            // 剣筋
            ctx.strokeStyle = 'rgba(200, 230, 255, 0.5)';
            ctx.lineWidth = 12;
            ctx.beginPath(); ctx.arc(30, 0, 45, -1, 1); ctx.stroke();
            ctx.restore();
            
            // 左手刀
            ctx.save();
            ctx.translate(centerX - dir * 18, topY + 45);
            ctx.rotate(angle2);
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#aaf';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(60, 0); ctx.stroke();
            
            // 剣筋
            ctx.strokeStyle = 'rgba(200, 230, 255, 0.5)';
            ctx.lineWidth = 10;
            ctx.beginPath(); ctx.arc(30, 0, 40, -1, 1); ctx.stroke();
            ctx.restore();
        } else {
            // 待機（構え）
            const swing = this.animState === 'run' ? Math.sin(Date.now() * 0.015) * 8 : 0;
            ctx.strokeStyle = '#888';
            ctx.beginPath();
            ctx.moveTo(centerX - 12, topY + 40 + swing);
            ctx.lineTo(centerX - 45 + swing, topY + 20);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX + 12, topY + 40 - swing);
            ctx.lineTo(centerX + 45 - swing, topY + 20);
            ctx.stroke();
        }
        
        // 青いオーラ（強敵感）
        if (this.phase >= 2) {
            ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 + Math.sin(Date.now() * 0.01) * 0.2})`;
            ctx.lineWidth = 15;
            ctx.beginPath();
            ctx.arc(centerX, topY + 40, 60, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// ステージ3ボス: 鎖鎌使いの暗殺者
export class KusarigamaAssassin extends Boss {
    init() {
        super.init();
        this.bossName = '鎖鎌使いの暗殺者';
        this.weaponDrop = '鎖鎌';
        this.hp = 250;    // 220から少し強化
        this.maxHp = 250;
        this.speed = 3;
        this.attackRange = 150;
        this.attackPatterns = ['throw', 'pull', 'poison'];
        this.chainX = 0;
        this.chainY = 0;
    }
    
    startAttack() {
        this.isAttacking = true;
        const pattern = this.attackPatterns[Math.floor(Math.random() * this.attackPatterns.length)];
        this.currentPattern = pattern;
        
        switch (pattern) {
            case 'throw':
                this.attackTimer = 500;
                this.attackCooldown = 700;
                break;
            case 'pull':
                this.attackTimer = 600;
                this.attackCooldown = 1000;
                break;
            case 'poison':
                this.attackTimer = 400;
                this.attackCooldown = 1500;
                break;
        }
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const topY = this.y + this.bob;
        
        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }
        
        ctx.fillStyle = '#1a1a1a';
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 3;
        
        // 覆面
        ctx.beginPath();
        ctx.arc(centerX, topY + 15, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // 目
        ctx.fillStyle = '#fff';
        ctx.fillRect(centerX - 8, topY + 12, 5, 3);
        ctx.fillRect(centerX + 3, topY + 12, 5, 3);
        
        // 体
        const bodyBottom = topY + 57;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(centerX - 15, topY + 27, 30, 30);
        
        // 足
        const legY = this.y + this.height;
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(centerX - 5, bodyBottom);
        ctx.lineTo(centerX - 10 + Math.sin(this.legAngle) * 10, legY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + 5, bodyBottom);
        ctx.lineTo(centerX + 10 - Math.sin(this.legAngle) * 10, legY);
        ctx.stroke();
        
        // 鎖鎌
        const direction = this.facingRight ? 1 : -1;
        if (this.isAttacking) {
            const progress = 1 - this.attackTimer / 500;
            const chainLength = this.attackRange * (progress < 0.5 ? progress * 2 : (1 - progress) * 2);
            
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            ctx.moveTo(centerX, topY + 40);
            ctx.lineTo(centerX + direction * chainLength, topY + 40);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // 鎌
            ctx.strokeStyle = '#C0C0C0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(centerX + direction * chainLength, topY + 40, 15, 
                direction > 0 ? -Math.PI / 2 : Math.PI / 2,
                direction > 0 ? Math.PI / 2 : -Math.PI / 2);
            ctx.stroke();
        }
        
        // 毒霧
        if (this.isAttacking && this.currentPattern === 'poison') {
            ctx.fillStyle = `rgba(100, 0, 100, ${0.3 * (1 - this.attackTimer / 400)})`;
            for (let i = 0; i < 5; i++) {
                const offsetX = Math.sin(Date.now() / 100 + i) * 30;
                const offsetY = Math.cos(Date.now() / 100 + i) * 20;
                ctx.beginPath();
                ctx.arc(centerX + direction * 50 + offsetX, topY + 50 + offsetY, 25, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        if (this.phase >= 2) {
            ctx.strokeStyle = `rgba(100, 0, 100, ${0.2 + Math.sin(Date.now() * 0.01) * 0.1})`;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(centerX, topY + 45, 45, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// ステージ4ボス: 大太刀の武将
export class OdachiBusho extends Boss {
    init() {
        super.init();
        this.bossName = '大太刀の武将';
        this.weaponDrop = '大太刀';
        this.hp = 350;    // 据え置き
        this.maxHp = 350;
        this.damage = 6;
        this.speed = 1.6;
        this.width = 70;
        this.height = 100;
        this.attackRange = 100;
        this.attackPatterns = ['heavy', 'uppercut', 'shockwave'];
    }
    
    startAttack() {
        this.isAttacking = true;
        const pattern = this.attackPatterns[Math.floor(Math.random() * this.attackPatterns.length)];
        this.currentPattern = pattern;
        
        switch (pattern) {
            case 'heavy':
                this.attackTimer = 700;
                this.attackCooldown = 1000;
                break;
            case 'uppercut':
                this.attackTimer = 500;
                this.attackCooldown = 800;
                break;
            case 'shockwave':
                this.attackTimer = 800;
                this.attackCooldown = 1500;
                break;
        }
    }
    
    getAttackHitbox() {
        if (!this.isAttacking) return null;
        
        switch (this.currentPattern) {
            case 'heavy':
                return {
                    x: this.x + (this.facingRight ? this.width : -this.attackRange),
                    y: this.y,
                    width: this.attackRange,
                    height: this.height
                };
            case 'uppercut':
                return {
                    x: this.x + (this.facingRight ? this.width - 20 : -60),
                    y: this.y - 30,
                    width: 80,
                    height: this.height + 30
                };
            case 'shockwave':
                // 地面を伝う衝撃波
                return {
                    x: 0,
                    y: this.y + this.height - 30,
                    width: CANVAS_WIDTH,
                    height: 30
                };
        }
        return null;
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const topY = this.y + this.bob;
        
        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }
        
        ctx.fillStyle = '#4a0000';
        ctx.strokeStyle = '#4a0000';
        ctx.lineWidth = 6;
        
        // 巨大な兜
        ctx.beginPath();
        ctx.arc(centerX, topY + 25, 25, Math.PI, 0);
        ctx.fill();
        
        // 角
        ctx.beginPath();
        ctx.moveTo(centerX - 20, topY + 10);
        ctx.lineTo(centerX - 35, topY - 25);
        ctx.lineTo(centerX - 15, topY + 20);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(centerX + 20, topY + 10);
        ctx.lineTo(centerX + 35, topY - 25);
        ctx.lineTo(centerX + 15, topY + 20);
        ctx.fill();
        
        // 顔
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(centerX, topY + 35, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // 巨大な鎧
        const bodyY = topY + 50;
        ctx.fillStyle = '#4a0000';
        ctx.fillRect(centerX - 30, bodyY, 60, 35);
        
        // 足
        const legY = this.y + this.height;
        ctx.strokeStyle = '#4a0000';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(centerX - 12, bodyY + 35);
        ctx.lineTo(centerX - 18 + Math.sin(this.legAngle) * 20, legY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + 12, bodyY + 35);
        ctx.lineTo(centerX + 18 - Math.sin(this.legAngle) * 20, legY);
        ctx.stroke();
        
        // 大太刀
        const direction = this.facingRight ? 1 : -1;
        ctx.strokeStyle = '#C0C0C0';
        ctx.lineWidth = 8;
        
        if (this.isAttacking) {
            const progress = 1 - this.attackTimer / (this.currentPattern === 'heavy' ? 700 : 800);
            
            if (this.currentPattern === 'heavy') {
                ctx.save();
                ctx.shadowBlur = 20;
                ctx.shadowColor = '#fff';
                ctx.rotate(direction * (-Math.PI / 2 + progress * Math.PI));
                
                // 大太刀の残像
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 30;
                ctx.beginPath();
                ctx.arc(60, 0, 80, -0.5, 0.5);
                ctx.stroke();

                ctx.strokeStyle = '#C0C0C0';
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(120, 0);
                ctx.stroke();
                ctx.restore();
            } else if (this.currentPattern === 'shockwave') {
                const waveProgress = (progress < 0.5 ? 0 : (progress - 0.5) * 2);
                ctx.strokeStyle = `rgba(255, 200, 100, ${0.5 * (1 - waveProgress)})`;
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.moveTo(centerX, this.y + this.height);
                ctx.lineTo(centerX + direction * waveProgress * CANVAS_WIDTH, this.y + this.height);
                ctx.stroke();
            }
        }
        
        if (this.phase >= 2) {
            ctx.strokeStyle = `rgba(255, 100, 0, ${0.3 + Math.sin(Date.now() * 0.01) * 0.1})`;
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.arc(centerX, topY + 55, 60, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// ステージ5ボス: 将軍（ラスボス）
export class Shogun extends Boss {
    init() {
        super.init();
        this.bossName = '将軍';
        this.weaponDrop = null;
        this.hp = 600;    // 500から強化
        this.maxHp = 600;
        this.damage = 8;
        this.speed = 2.2;
        this.width = 80;
        this.height = 110;
        this.attackRange = 120;
        this.maxPhase = 3;
        
        // 全ボスの技を使用可能
        this.attackPatterns = [
            'thrust', 'sweep',           // 槍
            'double', 'dash',             // 二刀
            'throw',                      // 鎖鎌
            'heavy', 'shockwave',         // 大太刀
            'ultimate'                    // 固有技
        ];
    }
    
    onPhaseChange() {
        super.onPhaseChange();
        // フェーズごとに使える技が増える
        if (this.phase === 3) {
            this.speed *= 1.3;
        }
    }
    
    startAttack() {
        this.isAttacking = true;
        
        // フェーズに応じて使える技が変わる
        let availablePatterns;
        if (this.phase === 1) {
            availablePatterns = ['thrust', 'sweep', 'double'];
        } else if (this.phase === 2) {
            availablePatterns = ['thrust', 'double', 'dash', 'throw', 'heavy'];
        } else {
            availablePatterns = this.attackPatterns;
        }
        
        const pattern = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
        this.currentPattern = pattern;
        
        switch (pattern) {
            case 'ultimate':
                this.attackTimer = 1200;
                this.attackCooldown = 2000;
                break;
            default:
                this.attackTimer = 500;
                this.attackCooldown = 700;
        }
    }
    
    renderBody(ctx) {
        const centerX = this.x + this.width / 2;
        const topY = this.y + this.bob;
        
        if (this.phaseTransitioning) {
            this.renderPhaseTransition(ctx);
        }
        
        // 金色の鎧
        ctx.fillStyle = '#B8860B';
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 6;
        
        // 壮大な兜
        ctx.beginPath();
        ctx.arc(centerX, topY + 30, 28, Math.PI, 0);
        ctx.fill();
        
        // 金の三日月
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(centerX, topY - 5, 20, Math.PI * 0.2, Math.PI * 0.8);
        ctx.fill();
        
        // 顔
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(centerX, topY + 42, 18, 0, Math.PI * 2);
        ctx.fill();
        
        // 金色の鎧本体
        ctx.fillStyle = '#B8860B';
        ctx.fillRect(centerX - 35, topY + 60, 70, 35);
        
        // 肩当て
        ctx.beginPath();
        ctx.ellipse(centerX - 40, topY + 65, 18, 15, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(centerX + 40, topY + 65, 18, 15, 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        // 下半身
        ctx.fillRect(centerX - 20, topY + 95, 40, 15);
        
        // 足
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(centerX - 12, topY + 110);
        ctx.lineTo(centerX - 20, topY + this.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + 12, topY + 110);
        ctx.lineTo(centerX + 20, topY + this.height);
        ctx.stroke();
        
        // 武器（攻撃パターンに応じて変化）
        const direction = this.facingRight ? 1 : -1;
        
        if (this.isAttacking && this.currentPattern === 'ultimate') {
            // 必殺技：全方向への攻撃
            const progress = 1 - this.attackTimer / 1200;
            ctx.strokeStyle = `rgba(255, 215, 0, ${1 - progress})`;
            ctx.lineWidth = 5;
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i + progress * Math.PI;
                ctx.beginPath();
                ctx.moveTo(centerX, topY + 70);
                ctx.lineTo(
                    centerX + Math.cos(angle) * 150 * progress,
                    topY + 70 + Math.sin(angle) * 150 * progress
                );
                ctx.stroke();
            }
        }
        
        // 常に刀を持っている
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(centerX + direction * 30, topY + 70);
        ctx.lineTo(centerX + direction * 90, topY + 50);
        ctx.stroke();
        
        // フェーズに応じたオーラ
        const auraColors = ['rgba(255, 215, 0, 0.2)', 'rgba(255, 150, 0, 0.3)', 'rgba(255, 50, 0, 0.4)'];
        ctx.strokeStyle = auraColors[this.phase - 1];
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.arc(centerX, topY + 60, 60, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// ボスファクトリー
export function createBoss(stageNumber, x, y, groundY) {
    switch (stageNumber) {
        case 1: return new YariTaisho(x, y, 'boss', groundY);
        case 2: return new NitoryuKengo(x, y, 'boss', groundY);
        case 3: return new KusarigamaAssassin(x, y, 'boss', groundY);
        case 4: return new OdachiBusho(x, y, 'boss', groundY);
        case 5: return new Shogun(x, y, 'boss', groundY);
        default: return new YariTaisho(x, y, 'boss', groundY);
    }
}
