import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

export class ShadowRenderer {
    constructor(config = {}) {
        this.scale = config.scale || 0.5;
        this.maxCasters = config.maxCasters || 18;
        this.alphaGround = config.alphaGround || 0.48; // 少し濃く
        this.alphaAir = config.alphaAir || 0.18;
        this.minRadiusScale = config.minRadiusScale || 0.5;
        this.shadowLenMin = config.shadowLenMin || 32;
        this.shadowLenMax = config.shadowLenMax || 220;
        this.flattenY = config.flattenY || 0.28;
        this.shearScale = config.shearScale || 0.012;

        // オフスクリーンCanvasの作成
        this.canvas = document.createElement('canvas');
        this.canvas.width = CANVAS_WIDTH * this.scale;
        this.canvas.height = CANVAS_HEIGHT * this.scale;
        this.ctx = this.canvas.getContext('2d');
    }

    render(mainCtx, stage, player, enemies, scrollX) {
        if (!stage || !player) return;

        const ctx = this.ctx;
        const scale = this.scale;

        // 1. 太陽角度の取得/算出
        const sunTheta = this.getSunTheta(stage);
        const sunAltitude = Math.sin(sunTheta);
        const dirX = -Math.cos(sunTheta);

        // 影の長さと傾斜の計算
        const altClamp = Math.max(0.15, Math.min(1.0, sunAltitude));
        const baseLen = Math.max(this.shadowLenMin, Math.min(this.shadowLenMax, this.shadowLenMin / altClamp));
        const shear = dirX * (baseLen * this.shearScale);

        // 2. 影対象（Casters）の収集
        const casters = [];
        if (player && !player.isDefeated) casters.push(player);
        
        for (const enemy of enemies) {
            if (casters.length >= this.maxCasters) break;
            if (enemy.isAlive && !enemy.isDying) {
                casters.push(enemy);
            }
        }

        // 影RTをクリア
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 3. 各オブジェクトの影を描く
        casters.forEach(caster => {
            this.drawObjectShadow(ctx, caster, scrollX, shear, baseLen);
        });

        // 4. メインCanvasへ合成
        mainCtx.save();
        mainCtx.globalCompositeOperation = 'source-over'; // 必要なら multiply に切替可能
        mainCtx.drawImage(
            this.canvas,
            0, 0, this.canvas.width, this.canvas.height,
            0, 0, CANVAS_WIDTH, CANVAS_HEIGHT
        );
        mainCtx.restore();
    }

    getSunTheta(stage) {
        // stage.js の renderCelestialBodies と同じロジックで太陽角度を再現
        const p = Math.max(0, Math.min(1, stage.progress / stage.maxProgress));
        const stageP = stage.smoothstep ? stage.smoothstep(0, 1, p) : p;

        switch (stage.stageNumber) {
            case 1: return Math.PI * (-0.34 + stageP * 0.58);
            case 2: return Math.PI * (-0.15 + stageP * 1.3);
            case 3: return Math.PI * (0.05 + stageP * 0.65);
            case 4: return Math.PI * (0.32 + stageP * 0.48);
            case 5: return Math.PI * (0.15 + stageP * 0.7);
            case 6: return Math.PI * (0.82 + stageP * 0.68);
            default: return Math.PI * (-0.15 + stageP * 1.3);
        }
    }

    drawObjectShadow(ctx, caster, scrollX, shear, baseLen) {
        if (typeof caster.getFootX !== 'function') return;

        const footX = caster.getFootX();
        const groundY = caster.getFootY();
        const heightAboveGround = caster.getHeightAboveGround();
        const baseRadius = caster.getShadowBaseRadius();

        // ジャンプ高度による減衰
        const maxH = 120;
        const t = Math.max(0, Math.min(1, heightAboveGround / maxH));
        const radiusScale = 1.0 + (this.minRadiusScale - 1.0) * t;
        const alpha = this.alphaGround + (this.alphaAir - this.alphaGround) * t;

        // 影は路面（平面）上の固定レーン位置に描画する
        const laneOffset = 0; // すでに getFootY で (groundY + 24) が返されているためオフセット不要
        const screenX = (footX - scrollX) * this.scale;
        const screenY = (groundY + laneOffset) * this.scale;

        ctx.save();
        ctx.translate(screenX, screenY);
        
        // 俯瞰パースに合わせた影の変形
        const rx = baseRadius * radiusScale * this.scale;
        const ry = rx * this.flattenY * 0.75;
        
        ctx.transform(1, 0, shear, 1, 0, 0); // Shear（傾斜）適用

        ctx.beginPath();
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
        grad.addColorStop(0.5, `rgba(0, 0, 0, ${alpha * 0.42})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = grad;
        ctx.scale(1, ry / rx); // Flatten（縦圧縮）適用
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
