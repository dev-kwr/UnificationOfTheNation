// ============================================
// Unification of the Nation - 障害物クラス
// ============================================

import { OBSTACLE_TYPES, OBSTACLE_SETTINGS, COLORS } from './constants.js';
import { audio } from './audio.js';

// 障害物基底クラス
export class Obstacle {
    constructor(x, groundY, type) {
        this.type = type;
        this.x = x;
        this.groundY = groundY;
        
        const settings = OBSTACLE_SETTINGS[type.toUpperCase()];
        this.width = settings.WIDTH;
        this.height = settings.HEIGHT;
        this.y = groundY - this.height;
        
        this.isDestroyed = false;
        
        // 固有プロパティ
        this.damage = settings.DAMAGE || 0;
        this.hp = settings.HP || 0;
        this.maxHp = this.hp;
        
        // アニメーション用
        this.hitTimer = 0;
    }
    
    update(deltaTime) {
        if (this.hitTimer > 0) {
            this.hitTimer -= deltaTime * 1000;
        }
        return false; // 削除フラグ（画面外に出たらtrueにする処理はStage側またはGame側で）
    }
    
    takeDamage(amount) {
        if (this.hp <= 0 || this.hitTimer > 0) return false; // 破壊不可・既に破壊済み・または無敵時間中
        
        this.hp -= amount;
        this.hitTimer = 100;
        audio.playDamage(); // 硬い音の方がいいが一旦これで
        
        if (this.hp <= 0) {
            this.kill();
            return true;
        }
        return false;
    }
    
    kill() {
        this.isDestroyed = true;
        audio.playExplosion();
        // エフェクト等はGameクラスで処理するか、ここでparticle生成メソッドを呼ぶ
    }
    
    render(ctx) {
        if (this.hitTimer > 0) {
            ctx.save();
            ctx.filter = 'brightness(150%)';
        }
        
        this.renderBody(ctx);
        
        if (this.hitTimer > 0) {
            ctx.restore();
        }
    }
    
    renderBody(ctx) {
        // サブクラスで実装
        ctx.fillStyle = '#666';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

// 竹槍（踏むと痛い、破壊不可）
export class Spike extends Obstacle {
    constructor(x, groundY) {
        super(x, groundY, OBSTACLE_TYPES.SPIKE);
    }
    
    renderBody(ctx) {
        const cx = this.x + this.width / 2;
        const topY = this.y;
        const bottomY = this.y + this.height;
        
        // 竹槍の群れを描画
        ctx.fillStyle = '#534e32'; // 竹色（枯れ竹）
        
        const spikeCount = 4;
        const spikeW = this.width / spikeCount;
        
        ctx.beginPath();
        for (let i = 0; i < spikeCount; i++) {
            const sx = this.x + i * spikeW;
            ctx.moveTo(sx, bottomY);
            ctx.lineTo(sx + spikeW / 2, topY); // 頂点
            ctx.lineTo(sx + spikeW, bottomY);
        }
        ctx.fill();
        
        // 先端を赤く（血？）
        ctx.fillStyle = '#800';
        ctx.beginPath();
        for (let i = 0; i < spikeCount; i++) {
            const sx = this.x + i * spikeW;
            ctx.moveTo(sx + spikeW * 0.3, topY + this.height * 0.2);
            ctx.lineTo(sx + spikeW / 2, topY); 
            ctx.lineTo(sx + spikeW * 0.7, topY + this.height * 0.2);
        }
        ctx.fill();
    }
}

// 岩（邪魔、破壊可能）
export class Rock extends Obstacle {
    constructor(x, groundY) {
        super(x, groundY, OBSTACLE_TYPES.ROCK);
    }
    
    renderBody(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const r = this.width / 2;
        
        ctx.fillStyle = '#555';
        ctx.beginPath();
        // ゴツゴツした円
        ctx.moveTo(cx + r, cy);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const variance = Math.sin(i * 123) * 5;
            ctx.lineTo(cx + Math.cos(angle) * (r + variance), cy + Math.sin(angle) * (r + variance));
        }
        ctx.closePath();
        ctx.fill();
        
        // ひび割れ演出（HPの減少に応じて増える）
        if (this.hp < this.maxHp) {
            const damageRatio = 1 - (this.hp / this.maxHp);
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            // 1段階目のヒビ
            if (damageRatio > 0.1) {
                ctx.moveTo(cx - 15, cy - 10); ctx.lineTo(cx + 5, cy + 5);
                ctx.moveTo(cx + 10, cy - 15); ctx.lineTo(cx - 5, cy + 10);
            }
            // 2段階目のヒビ
            if (damageRatio > 0.4) {
                ctx.moveTo(cx - 20, cy + 5); ctx.lineTo(cx - 5, cy - 5);
                ctx.moveTo(cx + 15, cy + 10); ctx.lineTo(cx + 5, cy - 10);
            }
            // 3段階目のヒビ（ボロボロ）
            if (damageRatio > 0.7) {
                ctx.moveTo(cx - 10, cy + 15); ctx.lineTo(cx + 10, cy - 15);
                ctx.moveTo(cx + 20, cy); ctx.lineTo(cx - 20, cy);
            }
            ctx.stroke();
        }
    }
}

export function createObstacle(type, x, groundY) {
    switch (type) {
        case OBSTACLE_TYPES.SPIKE:
            return new Spike(x, groundY);
        case OBSTACLE_TYPES.ROCK:
            return new Rock(x, groundY);
        default:
            return new Obstacle(x, groundY, type);
    }
}
