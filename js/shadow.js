// ============================================
// Unification of the Nation - 影レンダラー
// ============================================
//
// 太陽（光源）方向に整合した影をオフスクリーンCanvas経由で描画する。
// iPad等でも重くならないよう低解像度（1/2）で描画し本画面へ拡大合成する。
//
// ===== 調整パラメータ一覧 =====
// shadowCanvasScale : オフスクリーン解像度倍率（小さいほど軽い・ぼける）
// maxCasters        : 影を描く最大キャラ数
// alphaGround       : 接地時の影の濃さ（大きいほど濃い）
// alphaAir          : 最高ジャンプ時の影の濃さ
// minRadiusScale    : 最高ジャンプ時の影のサイズ倍率（1が等倍）
// flattenY          : 影の縦方向圧縮率（小さいほど横長）
// shearScale        : 方向性影の傾斜量（大きいほど太陽方向に倒れる）
// shadowLenMin/Max  : 方向性影が伸びる最小/最大距離
// shadowColor       : 影の基本色（黒ではなく冷たい墨色を推奨）
// compositeOp       : 合成モード（'source-over' or 'multiply'）
// ================================

import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

export class ShadowRenderer {
    constructor(config = {}) {
        // --- 調整パラメータ ---
        this.scale        = config.shadowCanvasScale || 0.5;   // オフスクリーン解像度
        this.maxCasters   = config.maxCasters        || 18;    // 影対象の最大数
        this.alphaGround  = config.alphaGround       || 0.35;  // 接地時アルファ
        this.alphaAir     = config.alphaAir           || 0.12;  // 空中時アルファ
        this.minRadiusScale = config.minRadiusScale   || 0.6;   // 最高ジャンプ時の半径倍率
        this.flattenY     = config.flattenY           || 0.25;  // 影の縦圧縮率
        this.shearScale   = config.shearScale         || 0.008; // 方向性影の傾斜係数（控えめ）
        this.shadowLenMin = config.shadowLenMin       || 22;    // 方向性影の最小長さ
        this.shadowLenMax = config.shadowLenMax       || 160;   // 方向性影の最大長さ
        this.compositeOp  = config.compositeOp        || 'source-over'; // 合成モード

        // 影の色（rgba の rgb 部分のみ — alpha は動的に決定）
        this.shadowR = 20;
        this.shadowG = 20;
        this.shadowB = 25;

        // オフスクリーンCanvasの作成
        this.canvas = document.createElement('canvas');
        this.canvas.width  = Math.ceil(CANVAS_WIDTH  * this.scale);
        this.canvas.height = Math.ceil(CANVAS_HEIGHT * this.scale);
        this.ctx = this.canvas.getContext('2d');
    }

    // =============================================
    // メインエントリ
    // =============================================
    render(mainCtx, stage, player, enemies, scrollX) {
        if (!stage || !player) return;

        const ctx   = this.ctx;
        const scale = this.scale;

        // --- 1. 太陽角度の取得/算出 ---
        const sunTheta = this.getSunTheta(stage);
        const sunAltRaw = Math.sin(sunTheta);
        const sunAlt    = Math.max(0.15, Math.min(1.0, sunAltRaw));  // clamp
        
        // --- 太陽と影の物理的関係 ---
        // stage.js では sunX = cx - Math.cos(sunTheta) * radius
        // つまり cos(sunTheta)>0 のとき太陽は画面左寄り（光は右方向へ進む）。
        // 影が伸びる方向ベクトル(X)は、光の進行方向と同じになるべき。
        // よって sunDirX = +Math.cos(sunTheta) が正しい。
        const sunDirX   = Math.cos(sunTheta);                       

        // 影の長さ（太陽高度が低いほど長い）
        const baseLen = Math.max(
            this.shadowLenMin,
            Math.min(this.shadowLenMax, this.shadowLenMin / sunAlt)
        );

        // --- 2. 影対象（Casters）の収集 ---
        const casters = [];
        if (player && !player.isDefeated) casters.push(player);

        for (const enemy of enemies) {
            if (casters.length >= this.maxCasters) break;
            if (enemy.isAlive && !enemy.isDying) {
                casters.push(enemy);
            }
        }

        // --- 3. オフスクリーンをクリア ---
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // --- 4. 各オブジェクトの影を描画 ---
        for (const caster of casters) {
            this.drawObjectShadow(ctx, caster, scrollX, baseLen, sunDirX, sunAlt);
        }

        // --- 5. メインCanvasへ合成 ---
        mainCtx.save();
        mainCtx.globalCompositeOperation = this.compositeOp;
        mainCtx.drawImage(
            this.canvas,
            0, 0, this.canvas.width, this.canvas.height,
            0, 0, CANVAS_WIDTH, CANVAS_HEIGHT
        );
        mainCtx.restore();
    }

    // =============================================
    // sunTheta 取得 — stage.js renderCelestialBodies() と完全一致
    // =============================================
    getSunTheta(stage) {
        const p = Math.max(0, Math.min(1, stage.progress / stage.maxProgress));
        const stageP = stage.smoothstep ? stage.smoothstep(0, 1, p) : p;

        switch (stage.stageNumber) {
            case 1:  return Math.PI * (-0.34 + stageP * 0.58);
            case 2:  return Math.PI * (0.56 - stageP * 0.14);
            case 3:  return Math.PI * (0.34 - stageP * 0.42);
            case 4:  return Math.PI * (0.06 - stageP * 0.38);
            case 5:  return Math.PI * (0.24 - stageP * 0.24);
            case 6:  return Math.PI * (-0.56 + stageP * 0.7);
            default: return Math.PI * (0.24 - stageP * 0.24);
        }
    }

    // =============================================
    // 1体分の影描画（接地影 + 方向性影）
    // =============================================
    drawObjectShadow(ctx, caster, scrollX, baseLen, sunDirX, sunAlt) {
        if (typeof caster.getFootX !== 'function') return;

        const footX  = caster.getFootX();
        const heightAboveGround = caster.getHeightAboveGround();
        // 影は常に「地面」に描画する（ジャンプ中も地面に残る）
        // getFootY() は現在の足元位置、heightAboveGround は足元と地面の差
        // よって footY + heightAboveGround = 常に地面レベル
        const groundY = caster.getFootY() + heightAboveGround;
        let baseRadius = caster.getShadowBaseRadius();

        // 影が大きくなりすぎないように制限
        baseRadius = Math.min(baseRadius, 36);

        // --- ジャンプ高度による減衰 ---
        const maxH = (caster.height || 60) * 2; // キャラ身長の2倍
        const t = Math.max(0, Math.min(1, heightAboveGround / maxH));
        const radiusScale = 1.0 + (this.minRadiusScale - 1.0) * t;  // lerp(1.0, minRadiusScale, t)
        const alpha       = this.alphaGround + (this.alphaAir - this.alphaGround) * t;

        // スクリーン座標（オフスクリーン座標系）
        const screenX = (footX - scrollX) * this.scale;
        const screenY = groundY * this.scale;

        // 画面外判定（軽量化）
        const margin = 120 * this.scale;
        if (screenX < -margin || screenX > this.canvas.width + margin) return;

        const r  = this.shadowR;
        const g  = this.shadowG;
        const b  = this.shadowB;
        const rx = baseRadius * radiusScale * this.scale;

        // =====================
        // A. 接地影（常に足元の濃いめ楕円）
        // =====================
        {
            const ryContact = rx * this.flattenY;

            ctx.save();
            ctx.translate(screenX, screenY);

            ctx.beginPath();
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
            grad.addColorStop(0,   `rgba(${r},${g},${b}, ${alpha})`);
            grad.addColorStop(0.5, `rgba(${r},${g},${b}, ${alpha * 0.45})`);
            grad.addColorStop(1,   `rgba(${r},${g},${b}, 0)`);

            ctx.fillStyle = grad;
            ctx.scale(1, ryContact / rx);  // 縦圧縮
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // =====================
        // B. 方向性影（光源の逆側に足元から伸びる楕円）
        // =====================
        {
            if (sunAlt <= 0.15) { /* skip */ }
            else {
                const dirAlpha = alpha * 0.55;  // 接地影より薄め
                
                // 実際に描画する影の長さ(px)
                const len = baseLen * radiusScale * this.scale;
                
                // 影の中心を、足元から「長さの半分」だけ光の進行方向(sunDirX)へズラす
                const offsetX = sunDirX * (len * 0.5);
                
                // 楕円の半径：X方向は 長さの半分＋足元の半径。Y方向は細く。
                const dirRx = (len * 0.5) + rx * 0.4;
                const dirRy = rx * this.flattenY * 0.7; 

                // 疑似的な奥への倒れ込み（shear）をわずかに加えるならここ。
                // 太陽が真横(sunDirX=1)の時は真横に伸び、傾きが欲しい場合はshearScaleを活用
                const shear = sunDirX * this.shearScale; 

                ctx.save();
                ctx.translate(screenX + offsetX, screenY);
                ctx.transform(1, 0, shear, 1, 0, 0);  // わずかなY軸の傾き

                ctx.beginPath();
                const grad2 = ctx.createRadialGradient(0, 0, 0, 0, 0, dirRx);
                grad2.addColorStop(0,    `rgba(${r},${g},${b}, ${dirAlpha})`);
                grad2.addColorStop(0.55, `rgba(${r},${g},${b}, ${dirAlpha * 0.35})`);
                grad2.addColorStop(1,    `rgba(${r},${g},${b}, 0)`);

                ctx.fillStyle = grad2;
                ctx.scale(1, dirRy / dirRx);  // 縦圧縮
                ctx.arc(0, 0, dirRx, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }
}
