// ============================================
// Unification of the Nation - 障害物クラス
// ============================================

import { OBSTACLE_TYPES, OBSTACLE_SETTINGS, LANE_OFFSET } from './constants.js';
import { audio } from './audio.js';

const OBSTACLE_SPRITE_PATHS = {
    spike: 'images/obstacle_spike_bamboo_trap.png',
    spikeStake: 'images/obstacle_bamboo_stake.png',
    spikeRope: 'images/obstacle_bamboo_rope.png',
    rockSlab: 'images/obstacle_rock_slab.png',
    rockTall: 'images/obstacle_rock_tall.png',
    rockJagged: 'images/obstacle_rock_jagged.png'
};
const obstacleSpriteCache = {};

const ROCK_VISUAL_PALETTES = {
    slab: {
        light: '139, 133, 122',
        mid: '96, 92, 86',
        dark: '48, 44, 39',
        outline: '24, 21, 18',
        crack: '23, 20, 18',
        crackLight: '136, 128, 116',
        dust: '89, 80, 71',
        ring: '82, 74, 66',
        shards: ['112, 105, 96', '91, 86, 79', '71, 67, 62', '124, 116, 104']
    },
    tall: {
        light: '130, 127, 119',
        mid: '83, 82, 79',
        dark: '42, 41, 38',
        outline: '22, 21, 19',
        crack: '20, 19, 17',
        crackLight: '128, 124, 114',
        dust: '82, 77, 70',
        ring: '76, 71, 65',
        shards: ['101, 99, 94', '82, 81, 77', '61, 60, 57', '116, 111, 102']
    },
    jagged: {
        light: '132, 126, 118',
        mid: '86, 82, 79',
        dark: '43, 40, 38',
        outline: '22, 20, 18',
        crack: '21, 18, 17',
        crackLight: '128, 121, 112',
        dust: '84, 77, 70',
        ring: '77, 70, 63',
        shards: ['104, 98, 91', '84, 80, 75', '62, 59, 56', '119, 110, 101']
    }
};

export function getRockVisualPalette(variant = 'slab') {
    return ROCK_VISUAL_PALETTES[variant] || ROCK_VISUAL_PALETTES.slab;
}

function loadObstacleSprite(key) {
    if (typeof Image === 'undefined') return null;
    if (!OBSTACLE_SPRITE_PATHS[key]) return null;
    if (!obstacleSpriteCache[key]) {
        const image = new Image();
        image.decoding = 'async';
        image.loading = 'eager';
        image.src = OBSTACLE_SPRITE_PATHS[key];
        image.decode?.().catch(() => {});
        obstacleSpriteCache[key] = image;
    }
    return obstacleSpriteCache[key];
}

function isSpriteReady(image) {
    return !!(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

function drawObstacleSprite(ctx, image, x, y, width, height, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
}

function drawObstacleSpriteBottomRotated(ctx, image, centerX, bottomY, width, height, angle = 0, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(centerX, bottomY);
    ctx.rotate(angle);
    ctx.drawImage(image, -width * 0.5, -height, width, height);
    ctx.restore();
}

function drawObstacleSpriteCenteredRotated(ctx, image, centerX, centerY, width, height, angle = 0, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.drawImage(image, -width * 0.5, -height * 0.5, width, height);
    ctx.restore();
}

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
    
    takeDamage() {
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
            ctx.filter = this.type === OBSTACLE_TYPES.ROCK
                ? 'brightness(132%) contrast(104%)'
                : 'brightness(142%)';
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
        this.spriteImage = loadObstacleSprite('spike');
        this.stakeImage = loadObstacleSprite('spikeStake');
        this.ropeImage = loadObstacleSprite('spikeRope');
    }

    seeded(seed) {
        const x = Math.sin((seed + this.spikeSeed * 17.0) * 97.13) * 43758.5453123;
        return x - Math.floor(x);
    }

    renderSpriteTrap(ctx, bottomY) {
        const spikeCount = this.spikeCount || 6;
        const spikeW = this.spikeThickness || 9;
        const spikeGap = this.spikeGap || 1.5;
        const startX = this.x + (this.sidePadding || 8);
        const heights = this.spikeHeights || Array.from({ length: spikeCount }, () => this.height - 8);
        const stageFactor = Math.max(0, Math.min(1, (this.stageNumber - 1) / 5));

        for (let i = 0; i < spikeCount; i++) {
            const spikeHeight = Math.max(22, heights[i] || 28);
            const cx = startX + i * (spikeW + spikeGap) + spikeW * 0.5
                + (this.seeded(21.9 + i * 0.77) - 0.5) * 2.2;
            const centerBias = spikeCount <= 1 ? 0 : ((i / (spikeCount - 1)) - 0.5);
            const lean = centerBias * 0.07 + (this.seeded(18.2 + i * 0.93) - 0.5) * (0.065 + stageFactor * 0.018);
            const widthScale = 1.26 + this.seeded(24.3 + i * 1.17) * 0.28;
            const heightJitter = 1 + (this.seeded(31.8 + i * 0.71) - 0.5) * 0.035;
            const drawW = spikeW * widthScale;
            const drawH = Math.max(25, spikeHeight * heightJitter + 8);
            const baseDrop = 1.2 + this.seeded(38.5 + i * 0.61) * 2.2;
            drawObstacleSpriteBottomRotated(
                ctx,
                this.stakeImage,
                cx,
                bottomY + baseDrop,
                drawW,
                drawH,
                lean,
                0.98
            );
        }

        const ropeY = bottomY - 7;
        const ropeH = Math.max(9.5, Math.min(16, this.height * 0.23));
        const ropeW = this.width + 10;
        drawObstacleSprite(ctx, this.ropeImage, this.x - 5, ropeY - ropeH * 0.5, ropeW, ropeH, 0.98);

        const wrapCount = Math.max(1, Math.min(5, Math.floor((spikeCount + 1) / 4)));
        for (let j = 0; j < wrapCount; j++) {
            const t = (j + 1) / (wrapCount + 1);
            const wx = this.x + this.width * t + (this.seeded(50.7 + j * 1.9) - 0.5) * 5;
            drawObstacleSpriteCenteredRotated(
                ctx,
                this.ropeImage,
                wx,
                ropeY + (this.seeded(55.2 + j) - 0.5) * 1.8,
                ropeH * (1.65 + this.seeded(60.4 + j) * 0.35),
                ropeH * 0.72,
                Math.PI * 0.5 + (this.seeded(65.6 + j) - 0.5) * 0.14,
                0.94
            );
        }
    }
    
    renderBody(ctx) {
        const bottomY = this.y + this.height;

        // 影（路面上の配置に合わせる）
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        const shadowY = bottomY + 2; 
        ctx.ellipse(this.x + this.width / 2, shadowY, this.width * 0.48, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();

        if (isSpriteReady(this.stakeImage) && isSpriteReady(this.ropeImage)) {
            this.renderSpriteTrap(ctx, bottomY);
            return;
        }

        if (isSpriteReady(this.spriteImage)) {
            const drawW = this.width * 1.1;
            const drawH = this.height * 1.08;
            drawObstacleSprite(
                ctx,
                this.spriteImage,
                this.x + (this.width - drawW) * 0.5,
                bottomY - drawH,
                drawW,
                drawH
            );
            return;
        }

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
    constructor(x, groundY, options = {}) {
        super(x, groundY, OBSTACLE_TYPES.ROCK);
        this.stageNumber = Math.max(1, Math.min(6, Number(options.stageNumber) || 1));
        this.shapeSeed = (Math.abs(Math.sin((x + groundY) * 0.0197) * 43758.5453)) % 1;
        this.variant = this.selectVariant();
        this.applyVariantSize();
        this.y = groundY + LANE_OFFSET - this.height; // 固定レーン接地
        this.profile = this.createProfile();
        this.crackLines = this.createCrackLines();
        this.spriteImage = loadObstacleSprite(`rock${this.variant.charAt(0).toUpperCase()}${this.variant.slice(1)}`);
    }

    seeded(seed) {
        const x = Math.sin((seed + this.shapeSeed * 17.0) * 93.73) * 43758.5453123;
        return x - Math.floor(x);
    }

    selectVariant() {
        const roll = this.seeded(0.37);
        if (this.stageNumber === 3) {
            // Stage3は縦長シルエットを増やして圧迫感を強める
            if (roll < 0.2) return 'slab';
            if (roll < 0.74) return 'tall';
            return 'jagged';
        }
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

        if (this.stageNumber === 3) {
            // Stage3限定で高岩を混ぜる（高さ重視、幅は極端に増やさない）
            const tallRoll = this.seeded(6.41);
            if (tallRoll > 0.58) {
                const heightScale = 1.2 + this.seeded(6.97) * 0.46; // 1.20〜1.66
                const widthScale = 0.9 + this.seeded(7.53) * 0.16;  // 0.90〜1.06
                this.height = Math.round(this.height * heightScale);
                this.width = Math.round(this.width * widthScale);
            }
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

    renderCrackChips(ctx, crack, offsetX, offsetY, damageRatio, seedOffset) {
        const palette = getRockVisualPalette(this.variant);
        for (let i = 0; i < crack.length - 1; i++) {
            const roll = this.seeded(seedOffset + i * 1.31);
            if (roll < 0.22 + damageRatio * 0.24) continue;

            const a = crack[i];
            const b = crack[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            const ux = dx / len;
            const uy = dy / len;
            const nx = -uy;
            const ny = ux;
            const side = this.seeded(seedOffset + 7.1 + i) > 0.5 ? 1 : -1;
            const t = 0.26 + this.seeded(seedOffset + 11.4 + i) * 0.48;
            const x = offsetX + a.x + dx * t;
            const y = offsetY + a.y + dy * t;
            const chipSize = (1.8 + this.seeded(seedOffset + 15.6 + i) * 2.2) * (0.8 + damageRatio * 0.6);

            ctx.fillStyle = `rgba(${palette.dark}, ${0.18 + damageRatio * 0.24})`;
            ctx.beginPath();
            ctx.moveTo(x - ux * chipSize * 0.62, y - uy * chipSize * 0.62);
            ctx.lineTo(x + ux * chipSize * 0.56, y + uy * chipSize * 0.56);
            ctx.lineTo(x + nx * side * chipSize * 0.95, y + ny * side * chipSize * 0.95);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = `rgba(${palette.crackLight}, ${0.13 + damageRatio * 0.12})`;
            ctx.lineWidth = 0.55;
            ctx.beginPath();
            ctx.moveTo(x - ux * chipSize * 0.42, y - uy * chipSize * 0.42);
            ctx.lineTo(x + nx * side * chipSize * 0.7, y + ny * side * chipSize * 0.7);
            ctx.stroke();
        }
    }

    renderDamageCracks(ctx, offsetX, offsetY) {
        if (this.hp >= this.maxHp) return;
        const damageRatio = 1 - (this.hp / this.maxHp);
        const palette = getRockVisualPalette(this.variant);
        const crackAlpha = 0.56 + damageRatio * 0.24;
        const cracks = [
            { path: this.crackLines.primary, seed: 30.5, width: 1 },
            { path: this.crackLines.branchA, seed: 43.8, width: 0.82, enabled: this.hp <= 2 },
            { path: this.crackLines.branchB, seed: 57.2, width: 0.78, enabled: this.hp <= 1 }
        ];

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        for (const crack of cracks) {
            if (crack.enabled === false) continue;
            const baseWidth = (1.15 + damageRatio * 0.85) * crack.width;

            ctx.strokeStyle = `rgba(${palette.outline}, ${0.14 + damageRatio * 0.18})`;
            ctx.lineWidth = baseWidth + 2.2;
            this.drawCrackPath(ctx, crack.path, offsetX, offsetY);
            ctx.stroke();

            ctx.strokeStyle = `rgba(${palette.crack}, ${crackAlpha})`;
            ctx.lineWidth = baseWidth;
            this.drawCrackPath(ctx, crack.path, offsetX, offsetY);
            ctx.stroke();

            ctx.save();
            ctx.translate(-0.75, -0.55);
            ctx.strokeStyle = `rgba(${palette.crackLight}, ${0.1 + damageRatio * 0.13})`;
            ctx.lineWidth = Math.max(0.45, baseWidth * 0.42);
            this.drawCrackPath(ctx, crack.path, offsetX, offsetY);
            ctx.stroke();
            ctx.restore();

            this.renderCrackChips(ctx, crack.path, offsetX, offsetY, damageRatio, crack.seed);
        }
        ctx.restore();
    }

    renderBody(ctx) {
        const offsetX = this.x;
        const offsetY = this.y;
        const cx = this.x + this.width * 0.5;
        const shadowW = this.width * (1.02 + this.seeded(20.2) * 0.12);
        const spriteReady = isSpriteReady(this.spriteImage);

        // 接地影
        const shadowY = this.y + this.height - 1;
        ctx.save();
        ctx.translate(cx, shadowY);
        ctx.scale(shadowW * 0.62, spriteReady ? 3.4 : 4.6);
        const shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        shadowGrad.addColorStop(0, spriteReady ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.28)');
        shadowGrad.addColorStop(0.65, spriteReady ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.13)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (spriteReady) {
            drawObstacleSprite(ctx, this.spriteImage, this.x, this.y, this.width, this.height, 0.98);
            this.renderDamageCracks(ctx, offsetX, offsetY);
            return;
        }

        // 単体岩
        const rockGrad = ctx.createLinearGradient(
            this.x - this.width * 0.2,
            this.y - this.height * 0.05,
            this.x + this.width * 1.1,
            this.groundY
        );
        const palette = getRockVisualPalette(this.variant);
        rockGrad.addColorStop(0, `rgb(${palette.light})`);
        rockGrad.addColorStop(0.45, `rgb(${palette.mid})`);
        rockGrad.addColorStop(1, `rgb(${palette.dark})`);
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
        ctx.strokeStyle = `rgba(${palette.outline}, 0.72)`;
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
            return new Rock(x, groundY, options);
        default:
            return new Obstacle(x, groundY, type);
    }
}
