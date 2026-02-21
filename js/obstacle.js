// ============================================
// Unification of the Nation - 障害物クラス
// ============================================

import { OBSTACLE_TYPES, OBSTACLE_SETTINGS, COLORS, LANE_OFFSET } from './constants.js';
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
        this.y = groundY + LANE_OFFSET - this.height; // 固定レーン接地
        
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
    constructor(x, groundY, options = {}) {
        super(x, groundY, OBSTACLE_TYPES.SPIKE);
        this.stageNumber = Math.max(1, Math.min(6, Number(options.stageNumber) || 1));
        this.spikeSeed = Math.abs(Math.sin((x * 0.091) + (groundY * 0.013) + 7.17));

        // 竹槍1本の太さは固定にし、連なる本数と高さで差を出す
        this.spikeThickness = 9;
        this.spikeGap = 1.5;
        this.sidePadding = 8;

        const stageFactor = Math.max(0, Math.min(1, (this.stageNumber - 1) / 5));
        const longTrapRoll = this.seeded(0.7);
        const baseCount = 4 + Math.floor(this.seeded(1.4) * 4) + Math.floor(stageFactor * 5); // Stage進行で連なり増加
        const longThreshold = 0.82 - stageFactor * 0.46;
        const longCount = longTrapRoll > longThreshold
            ? (2 + Math.floor(this.seeded(2.2) * (3 + stageFactor * 8)))
            : 0;
        this.spikeCount = Math.max(4, Math.min(22, baseCount + longCount));

        this.spikeHeights = [];
        let maxSpikeHeight = 0;
        for (let i = 0; i < this.spikeCount; i++) {
            const local = this.seeded(4.1 + i * 1.37);
            const wave = 0.5 + Math.sin(i * 0.78 + this.spikeSeed * 9.2) * 0.5;
            // 同一罠内で高さをまばらにする
            const spikeHeight = 24 + local * (20 + stageFactor * 8) + wave * (12 + stageFactor * 6);
            this.spikeHeights.push(spikeHeight);
            if (spikeHeight > maxSpikeHeight) maxSpikeHeight = spikeHeight;
        }

        // 当たり判定は最長の竹槍基準
        this.width = Math.round(
            this.sidePadding * 2
            + this.spikeCount * this.spikeThickness
            + Math.max(0, this.spikeCount - 1) * this.spikeGap
        );
        this.height = Math.max(30, Math.round(maxSpikeHeight + 8));
        this.y = groundY + LANE_OFFSET - this.height; // 固定レーン接地

        const countScale = 1 + Math.min(0.42, Math.max(0, this.spikeCount - 7) * 0.032 + stageFactor * 0.08);
        this.damage = Math.max(2, Math.round((this.damage || 2) * countScale));
    }

    seeded(seed) {
        const x = Math.sin((seed + this.spikeSeed * 17.0) * 97.13) * 43758.5453123;
        return x - Math.floor(x);
    }
    
    renderBody(ctx) {
        const bottomY = this.y + this.height;

        // 影（路面上の配置に合わせる）
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        const shadowY = bottomY + 2; 
        ctx.ellipse(this.x + this.width / 2, shadowY, this.width * 0.48, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // 台座
        const baseGrad = ctx.createLinearGradient(this.x, bottomY - 7, this.x, bottomY + 4);
        baseGrad.addColorStop(0, '#5a432e');
        baseGrad.addColorStop(1, '#2a1f14');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(this.x - 2, bottomY - 7, this.width + 4, 11);

        // 竹槍の群れ
        const spikeCount = this.spikeCount || 6;
        const spikeW = this.spikeThickness || 9;
        const spikeGap = this.spikeGap || 1.5;
        const startX = this.x + (this.sidePadding || 8);
        const heights = this.spikeHeights || Array.from({ length: spikeCount }, () => this.height - 8);

        for (let i = 0; i < spikeCount; i++) {
            const sx = startX + i * (spikeW + spikeGap);
            const spikeHeight = Math.max(20, heights[i] || 28);
            const tY = bottomY - spikeHeight;

            // 正面
            ctx.fillStyle = '#726146';
            ctx.beginPath();
            ctx.moveTo(sx, bottomY);
            ctx.lineTo(sx + spikeW * 0.52, tY);
            ctx.lineTo(sx + spikeW, bottomY);
            ctx.closePath();
            ctx.fill();

            // 左面（陰）
            ctx.fillStyle = '#3b2f22';
            ctx.beginPath();
            ctx.moveTo(sx, bottomY);
            ctx.lineTo(sx + spikeW * 0.52, tY);
            ctx.lineTo(sx + spikeW * 0.45, bottomY - 1);
            ctx.closePath();
            ctx.fill();

            // 右面（ハイライト）
            ctx.fillStyle = 'rgba(205, 190, 146, 0.2)';
            ctx.beginPath();
            ctx.moveTo(sx + spikeW * 0.52, tY);
            ctx.lineTo(sx + spikeW, bottomY);
            ctx.lineTo(sx + spikeW * 0.76, bottomY - 1);
            ctx.closePath();
            ctx.fill();

            // 竹の節
            const node1 = bottomY - spikeHeight * 0.36;
            const node2 = bottomY - spikeHeight * 0.66;
            ctx.strokeStyle = 'rgba(38, 30, 22, 0.55)';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(sx + 1.3, node1);
            ctx.lineTo(sx + spikeW - 1.3, node1);
            ctx.moveTo(sx + 1.3, node2);
            ctx.lineTo(sx + spikeW - 1.3, node2);
            ctx.stroke();
        }

        // 輪郭
        ctx.strokeStyle = '#2c2218';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < spikeCount; i++) {
            const sx = startX + i * (spikeW + spikeGap);
            const spikeHeight = Math.max(20, heights[i] || 28);
            const tY = bottomY - spikeHeight;
            ctx.moveTo(sx, bottomY);
            ctx.lineTo(sx + spikeW * 0.52, tY);
            ctx.lineTo(sx + spikeW, bottomY);
        }
        ctx.stroke();

        // 束ね縄
        const ropeY = bottomY - 7;
        ctx.strokeStyle = 'rgba(198, 165, 112, 0.65)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(startX - 2, ropeY);
        ctx.lineTo(startX + spikeCount * (spikeW + spikeGap) - spikeGap + 2, ropeY);
        ctx.stroke();
    }
}

// 岩（邪魔、破壊可能）
export class Rock extends Obstacle {
    constructor(x, groundY) {
        super(x, groundY, OBSTACLE_TYPES.ROCK);
        this.shapeSeed = (Math.abs(Math.sin((x + groundY) * 0.0197) * 43758.5453)) % 1;
        this.variant = this.selectVariant();
        this.applyVariantSize();
        this.y = groundY + LANE_OFFSET - this.height; // 固定レーン接地
        this.profile = this.createProfile();
        this.crackLines = this.createCrackLines();
    }

    seeded(seed) {
        const x = Math.sin((seed + this.shapeSeed * 17.0) * 93.73) * 43758.5453123;
        return x - Math.floor(x);
    }

    selectVariant() {
        const roll = this.seeded(0.37);
        if (roll < 0.34) return 'slab';
        if (roll < 0.68) return 'tall';
        return 'jagged';
    }

    applyVariantSize() {
        const v = this.variant;
        if (v === 'slab') {
            this.width = Math.round(74 + this.seeded(1.1) * 48);
            this.height = Math.round(34 + this.seeded(1.9) * 20);
        } else if (v === 'tall') {
            this.width = Math.round(40 + this.seeded(2.4) * 26);
            this.height = Math.round(66 + this.seeded(2.9) * 42);
        } else {
            this.width = Math.round(62 + this.seeded(4.3) * 42);
            this.height = Math.round(48 + this.seeded(4.8) * 36);
        }
    }

    createProfile() {
        const w = this.width;
        const h = this.height;
        const topLift = h * (0.03 + this.seeded(1.1) * 0.1);
        if (this.variant === 'slab') {
            return [
                { x: w * 0.96, y: h },
                { x: w * 0.06, y: h },
                { x: w * 0.03, y: h * (0.76 - this.seeded(2.7) * 0.09) },
                { x: w * (0.12 + this.seeded(3.1) * 0.08), y: h * (0.54 - this.seeded(3.5) * 0.08) },
                { x: w * (0.23 + this.seeded(4.2) * 0.1), y: h * (0.34 - this.seeded(4.6) * 0.08) },
                { x: w * (0.38 + this.seeded(5.1) * 0.08), y: h * (0.2 - this.seeded(5.4) * 0.08) - topLift * 0.45 },
                { x: w * (0.54 + this.seeded(5.8) * 0.08), y: h * (0.16 + this.seeded(6.1) * 0.06) - topLift * 0.5 },
                { x: w * (0.7 + this.seeded(6.6) * 0.1), y: h * (0.26 + this.seeded(6.9) * 0.08) },
                { x: w * (0.85 + this.seeded(7.4) * 0.08), y: h * (0.46 + this.seeded(7.8) * 0.1) },
                { x: w * (0.95 + this.seeded(8.3) * 0.03), y: h * (0.68 + this.seeded(8.8) * 0.09) }
            ];
        }
        if (this.variant === 'tall') {
            return [
                { x: w * 0.9, y: h },
                { x: w * 0.12, y: h },
                { x: w * (0.08 + this.seeded(2.3) * 0.1), y: h * (0.7 - this.seeded(2.7) * 0.1) },
                { x: w * (0.14 + this.seeded(3.1) * 0.08), y: h * (0.52 - this.seeded(3.5) * 0.1) },
                { x: w * (0.22 + this.seeded(4.2) * 0.12), y: h * (0.32 - this.seeded(4.6) * 0.1) },
                { x: w * (0.34 + this.seeded(5.0) * 0.12), y: h * (0.16 - this.seeded(5.4) * 0.12) - topLift },
                { x: w * (0.52 + this.seeded(5.8) * 0.08), y: h * (0.02 + this.seeded(6.2) * 0.06) - topLift * 1.15 },
                { x: w * (0.66 + this.seeded(6.7) * 0.1), y: h * (0.18 + this.seeded(7.0) * 0.1) },
                { x: w * (0.8 + this.seeded(7.5) * 0.08), y: h * (0.34 + this.seeded(7.9) * 0.12) },
                { x: w * (0.88 + this.seeded(8.4) * 0.05), y: h * (0.56 + this.seeded(8.9) * 0.1) }
            ];
        }
        return [
            { x: w * 0.95, y: h },
            { x: w * 0.06, y: h },
            { x: w * (0.02 + this.seeded(2.3) * 0.08), y: h * (0.74 - this.seeded(2.7) * 0.1) },
            { x: w * (0.12 + this.seeded(3.1) * 0.08), y: h * (0.5 - this.seeded(3.5) * 0.1) },
            { x: w * (0.22 + this.seeded(4.2) * 0.1), y: h * (0.28 - this.seeded(4.6) * 0.09) },
            { x: w * (0.35 + this.seeded(5.0) * 0.1), y: h * (0.12 - this.seeded(5.4) * 0.1) - topLift * 0.9 },
            { x: w * (0.48 + this.seeded(5.8) * 0.08), y: h * (0.03 + this.seeded(6.1) * 0.05) - topLift * 1.2 },
            { x: w * (0.61 + this.seeded(6.6) * 0.1), y: h * (0.16 + this.seeded(6.9) * 0.09) },
            { x: w * (0.76 + this.seeded(7.4) * 0.09), y: h * (0.3 + this.seeded(7.8) * 0.1) },
            { x: w * (0.88 + this.seeded(8.3) * 0.06), y: h * (0.53 + this.seeded(8.8) * 0.12) }
        ];
    }

    noiseJitter(seed, amount) {
        return (this.seeded(seed) * 2 - 1) * amount;
    }

    createCrackLines() {
        const w = this.width;
        const h = this.height;
        const primary = [
            { x: w * (0.58 + this.seeded(8.4) * 0.08), y: h * 0.13 },
            { x: w * (0.54 + this.seeded(9.2) * 0.08), y: h * 0.32 },
            { x: w * (0.42 + this.seeded(10.1) * 0.12), y: h * 0.52 },
            { x: w * (0.34 + this.seeded(10.7) * 0.16), y: h * 0.74 }
        ];
        const branchA = [
            { x: primary[1].x, y: primary[1].y },
            { x: w * (0.66 + this.seeded(11.4) * 0.1), y: h * 0.45 },
            { x: w * (0.72 + this.seeded(12.1) * 0.08), y: h * 0.63 }
        ];
        const branchB = [
            { x: primary[2].x, y: primary[2].y },
            { x: w * (0.3 - this.seeded(13.8) * 0.1), y: h * 0.64 },
            { x: w * (0.22 - this.seeded(14.6) * 0.08), y: h * 0.82 }
        ];
        return { primary, branchA, branchB };
    }

    drawPolygon(ctx, points, offsetX = 0, offsetY = 0) {
        if (!points || points.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(offsetX + points[0].x, offsetY + points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(offsetX + points[i].x, offsetY + points[i].y);
        }
        ctx.closePath();
    }

    drawCrackPath(ctx, crack, offsetX = 0, offsetY = 0) {
        ctx.beginPath();
        ctx.moveTo(offsetX + crack[0].x, offsetY + crack[0].y);
        for (let i = 1; i < crack.length; i++) {
            ctx.lineTo(offsetX + crack[i].x, offsetY + crack[i].y);
        }
    }

    renderDamageCracks(ctx, offsetX, offsetY) {
        if (this.hp >= this.maxHp) return;
        const damageRatio = 1 - (this.hp / this.maxHp);
        const crackAlpha = 0.62 + damageRatio * 0.26;

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(28, 22, 18, ${crackAlpha})`;
        ctx.lineWidth = 1.4 + damageRatio * 0.9;
        this.drawCrackPath(ctx, this.crackLines.primary, offsetX, offsetY);
        ctx.stroke();

        if (this.hp <= 2) {
            this.drawCrackPath(ctx, this.crackLines.branchA, offsetX, offsetY);
            ctx.stroke();
        }
        if (this.hp <= 1) {
            this.drawCrackPath(ctx, this.crackLines.branchB, offsetX, offsetY);
            ctx.stroke();
        }

        ctx.strokeStyle = `rgba(120, 108, 96, ${0.22 + damageRatio * 0.15})`;
        ctx.lineWidth = 0.7;
        this.drawCrackPath(ctx, this.crackLines.primary, offsetX, offsetY);
        ctx.stroke();
    }

    renderBody(ctx) {
        const offsetX = this.x;
        const offsetY = this.y;
        const cx = this.x + this.width * 0.5;
        const shadowW = this.width * (1.02 + this.seeded(20.2) * 0.12);

        // 接地影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        const shadowY = this.groundY + LANE_OFFSET + 2; // 固定レーン付近に影を置く
        ctx.ellipse(cx, shadowY, shadowW * 0.56, 5.0, 0, 0, Math.PI * 2); // 縦を少し潰す
        ctx.fill();

        // 単体岩
        const rockGrad = ctx.createLinearGradient(
            this.x - this.width * 0.2,
            this.y - this.height * 0.05,
            this.x + this.width * 1.1,
            this.groundY
        );
        rockGrad.addColorStop(0, '#6b665f');
        rockGrad.addColorStop(0.45, '#555049');
        rockGrad.addColorStop(1, '#2f2c29');
        this.drawPolygon(ctx, this.profile, offsetX, offsetY);
        ctx.fillStyle = rockGrad;
        ctx.fill();

        // 面の差
        const facetA = [this.profile[2], this.profile[3], this.profile[4], this.profile[5], this.profile[1]];
        const facetB = [this.profile[5], this.profile[6], this.profile[7], this.profile[0], this.profile[4]];
        this.drawPolygon(ctx, facetA, offsetX, offsetY);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();
        this.drawPolygon(ctx, facetB, offsetX, offsetY);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.fill();

        // 輪郭
        this.drawPolygon(ctx, this.profile, offsetX, offsetY);
        ctx.strokeStyle = 'rgba(22, 20, 18, 0.72)';
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // ヒビ（自然な岩色に合わせた暗色、発光なし）
        this.renderDamageCracks(ctx, offsetX, offsetY);
    }
}

export function createObstacle(type, x, groundY, options = {}) {
    switch (type) {
        case OBSTACLE_TYPES.SPIKE:
            return new Spike(x, groundY, options);
        case OBSTACLE_TYPES.ROCK:
            return new Rock(x, groundY);
        default:
            return new Obstacle(x, groundY, type);
    }
}
