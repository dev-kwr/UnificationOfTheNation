// ============================================
// Unification of the Nation - 障害物クラス
// ============================================

import { OBSTACLE_TYPES, OBSTACLE_SETTINGS, COLORS } from './constants.js?v=41';
import { audio } from './audio.js?v=41';

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
        if (this.hp <= 0 || this.hitTimer > 0) return false;
        
        this.hp -= 1; // 常に 1 ダメージ（3回耐える）
        this.hitTimer = 160; // ヒット時のフラッシュ時間を少し長く
        audio.playDamage();
        
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
        const cx = this.x + this.width * 0.5;
        const groundLevel = this.groundY; 
        const r = this.width * 0.5;
        const h = this.height * 0.92;

        // 1. 接地影
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(cx, groundLevel + 1.5, r * 1.1, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. 岩の形状（底面をフラットに、上部をランダムな多角形に）
        const pts = [
            { x: cx + r * 0.9, y: groundLevel },   // 右下
            { x: cx - r * 0.9, y: groundLevel },   // 左下
            { x: cx - r * 1.1, y: groundLevel - h * 0.35 }, // 左中
            { x: cx - r * 0.6, y: groundLevel - h * 0.85 }, // 左上
            { x: cx + r * 0.2, y: groundLevel - h * 0.98 }, // 真上
            { x: cx + r * 0.8, y: groundLevel - h * 0.55 }, // 右中
        ];

        // グラデーション質感
        const grad = ctx.createLinearGradient(cx - r, groundLevel - h, cx + r, groundLevel);
        grad.addColorStop(0, '#808890');
        grad.addColorStop(0.5, '#5a6068');
        grad.addColorStop(1, '#3a4048');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // 3. 立体感：エッジハイライト
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(pts[2].x, pts[2].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.lineTo(pts[4].x, pts[4].y);
        ctx.stroke();

        // 亀裂と陰影
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pts[4].x, pts[4].y);
        ctx.lineTo(cx - r * 0.1, groundLevel - h * 0.45);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - r * 0.1, groundLevel - h * 0.45);
        ctx.lineTo(pts[5].x, pts[5].y);
        ctx.stroke();

        // ひび割れ演出（3段階）
        if (this.hp < this.maxHp) {
            ctx.strokeStyle = 'rgba(20,20,22,0.75)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            
            // 1発目：小さなヒビ
            if (this.hp <= 2) {
                ctx.moveTo(cx - 10, groundLevel - h * 0.7); 
                ctx.lineTo(cx - 2, groundLevel - h * 0.55);
                ctx.lineTo(cx - 8, groundLevel - h * 0.4);
            }
            // 2発目：大きなヒビの追加
            if (this.hp <= 1) {
                ctx.moveTo(cx + 12, groundLevel - h * 0.82);
                ctx.lineTo(cx + 3, groundLevel - h * 0.5);
                ctx.lineTo(cx + 10, groundLevel - h * 0.25);
                
                // 真ん中を繋ぐヒビ
                ctx.moveTo(cx - 2, groundLevel - h * 0.55);
                ctx.lineTo(cx + 3, groundLevel - h * 0.5);
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
