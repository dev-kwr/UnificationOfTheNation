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
        const topY = this.y;
        const bottomY = this.y + this.height;
        
        // 影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(this.x + this.width / 2, bottomY + 2, this.width * 0.45, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // 台座
        ctx.fillStyle = '#3f3322';
        ctx.fillRect(this.x - 2, bottomY - 3, this.width + 4, 6);

        // 竹槍の群れ
        const spikeCount = 5;
        const spikeW = this.width / spikeCount;
        const tipY = [0.0, 0.12, 0.04, 0.15, 0.03];
        
        for (let i = 0; i < spikeCount; i++) {
            const sx = this.x + i * spikeW;
            const tY = topY + this.height * tipY[i];
            ctx.fillStyle = '#5d5437';
            ctx.beginPath();
            ctx.moveTo(sx + 1, bottomY);
            ctx.lineTo(sx + spikeW * 0.5, tY); // 頂点
            ctx.lineTo(sx + spikeW - 1, bottomY);
            ctx.closePath();
            ctx.fill();

            // 左面（陰）
            ctx.fillStyle = '#4a432c';
            ctx.beginPath();
            ctx.moveTo(sx + 1, bottomY);
            ctx.lineTo(sx + spikeW * 0.5, tY);
            ctx.lineTo(sx + spikeW * 0.45, bottomY - 1);
            ctx.closePath();
            ctx.fill();

            // 先端アクセント
            ctx.fillStyle = '#8f2a2a';
            ctx.beginPath();
            ctx.moveTo(sx + spikeW * 0.4, tY + 3);
            ctx.lineTo(sx + spikeW * 0.5, tY);
            ctx.lineTo(sx + spikeW * 0.6, tY + 3);
            ctx.closePath();
            ctx.fill();
        }

        // 輪郭
        ctx.strokeStyle = '#2e2518';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < spikeCount; i++) {
            const sx = this.x + i * spikeW;
            const tY = topY + this.height * tipY[i];
            ctx.moveTo(sx + 1, bottomY);
            ctx.lineTo(sx + spikeW * 0.5, tY);
            ctx.lineTo(sx + spikeW - 1, bottomY);
        }
        ctx.stroke();
    }
}

// 岩（邪魔、破壊可能）
export class Rock extends Obstacle {
    constructor(x, groundY) {
        super(x, groundY, OBSTACLE_TYPES.ROCK);
    }
    
    renderBody(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2 + 5;
        const r = this.width / 2;

        // 接地影
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, this.y + this.height + 3, r * 0.72, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // 外形（多角形）
        const pts = [];
        for (let i = 0; i < 9; i++) {
            const angle = (i / 9) * Math.PI * 2;
            const variance = 0.82 + (Math.sin(i * 2.13 + 0.7) * 0.16);
            pts.push({
                x: cx + Math.cos(angle) * r * variance,
                y: cy + Math.sin(angle) * r * variance
            });
        }

        ctx.fillStyle = '#5f636a';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // 面分け（2Dセル感）
        ctx.fillStyle = '#4f535a';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.55, cy - r * 0.1);
        ctx.lineTo(cx - r * 0.1, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.32, cy - r * 0.1);
        ctx.lineTo(cx - r * 0.05, cy + r * 0.22);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#757b84';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.15, cy - r * 0.58);
        ctx.lineTo(cx + r * 0.4, cy - r * 0.32);
        ctx.lineTo(cx + r * 0.1, cy - r * 0.02);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#373b42';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // ひび割れ演出（HPの減少に応じて増える）
        if (this.hp < this.maxHp) {
            const damageRatio = 1 - (this.hp / this.maxHp);
            ctx.strokeStyle = '#2b2f35';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            
            // 1段階目のヒビ
            if (damageRatio > 0.1) {
                ctx.moveTo(cx - 14, cy - 10); ctx.lineTo(cx + 5, cy + 6);
                ctx.moveTo(cx + 10, cy - 14); ctx.lineTo(cx - 4, cy + 9);
            }
            // 2段階目のヒビ
            if (damageRatio > 0.4) {
                ctx.moveTo(cx - 19, cy + 4); ctx.lineTo(cx - 5, cy - 4);
                ctx.moveTo(cx + 14, cy + 10); ctx.lineTo(cx + 4, cy - 10);
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
