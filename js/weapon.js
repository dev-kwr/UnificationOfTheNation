// ============================================
// Unification of the Nation - 武器クラス
// ============================================

import { GRAVITY, CANVAS_WIDTH, LANE_OFFSET, PLAYER } from './constants.js?v=screen-safe-20260810e';
import { audio } from './audio.js?v=screen-safe-20260810e';
import { SHOGUN_SCALE } from './shogunConstants.js?v=screen-safe-20260810e';
import { withDropShadow, drawSparks, drawBlastFlash, makeParticles, smoothstep01, pushTrailPoint, drawCometRibbon } from './weaponFx.js?v=screen-safe-20260810e';

// 武器ジオメトリは「武器を振る主体(owner/player)のワールド寸法」を基準に組み立てる。
// 将軍は width/height が素体(40x60)なので getWorldWidth/Height(=素体×SHOGUN_SCALE) を読む。
// 忍者は getWorldWidth()===width なので不変。分身owner(plain object)やボスは
// getWorldWidth を持たないため従来どおり .width/.height を返す（出力中立）。
//
// 例外: renderModel 内の in-model 武器描画中(owner._inRenderModel=true)は、
// renderModel が this.width=drawW(48) に詰め替え＋ctx.scale(scaleMultiplier) で拡大するため、
// 武器は素体(drawW)フレームのまま owner.width を読む（ワールド化すると ctx.scale と二重になる）。
function ownerWorldWidth(o) {
    if (!o) return 0;
    if (o._inRenderModel) return o.width;
    if (typeof o.getWorldWidth === 'function') return o.getWorldWidth();
    return o.width;
}
function ownerWorldHeight(o) {
    if (!o) return 0;
    if (o._inRenderModel) return o.height;
    if (typeof o.getWorldHeight === 'function') return o.getWorldHeight();
    return o.height;
}

// range はゲーム内ワールド用の有効射程として持つ。
// renderModel 内は ctx.scale(scaleMultiplier) 済みなので、モデル座標へ戻して二重スケールを防ぐ。
function ownerModelRange(range, owner) {
    const value = Number.isFinite(range) ? range : 0;
    if (!owner || !owner._inRenderModel) return value;
    const scale = Number.isFinite(owner.scaleMultiplier) && owner.scaleMultiplier > 0
        ? owner.scaleMultiplier
        : 1;
    return scale > 1.001 ? value / scale : value;
}

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

function resolveVisualEffectScale(value) {
    const scale = Number(value);
    return Number.isFinite(scale) && scale > 0
        ? Math.max(0.5, Math.min(3, scale))
        : 1;
}

// 真横から見た口金＋導火線。繰り返し模様は節に見えるため使わず、
// 根元から先端まで一続きの短い繊維として描く。
function drawFirebombFuse(ctx, cx, cy, radius, time, seeds, visualScale = 1) {
    const r = Math.max(1, radius);
    const fxScale = resolveVisualEffectScale(visualScale);
    // 将軍では火の粉の飛散距離は2.2倍を保ちつつ、導火線先端の火だけを少し抑える。
    // 忍者の通常・Lv3サイズアップ（1.5倍未満）は従来比率のまま。
    const coreScale = fxScale > 1.5
        ? 1 + (fxScale - 1) * 0.78
        : fxScale;
    const collarY = cy - r * 0.99;
    // 口金側は固定し、先端へ近づくほどごく小さくしなる。
    // 単一の大きな正弦波ではなく低速の2波を混ぜ、機械的な往復やミミズ状の動きを避ける。
    const swayPhase = time * 0.00580 + (seeds?.[0]?.ph || 0) * 0.12;
    const tipSwayX = (
        Math.sin(swayPhase) * 0.78 +
        Math.sin(swayPhase * 0.57 + 1.35) * 0.22
    ) * r * 0.060;
    const tipSwayY = Math.sin(swayPhase * 0.71 + 2.1) * r * 0.012;
    const p0 = { x: cx + r * 0.02, y: collarY + r * 0.06 };
    const p1 = {
        x: cx + r * 0.16 + tipSwayX * 0.10,
        y: collarY - r * 0.08 + tipSwayY * 0.08
    };
    const p2 = {
        x: cx + r * 0.23 + tipSwayX * 0.46,
        y: collarY - r * 0.29 + tipSwayY * 0.42
    };
    const p3 = {
        x: cx + r * 0.29 + tipSwayX,
        y: collarY - r * 0.47 + tipSwayY
    };
    const traceFuse = () => {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 焦げた縁と縄色を重ね、節のない一本の芯に見せる。
    traceFuse();
    ctx.strokeStyle = '#241207';
    ctx.lineWidth = Math.max(2.0, r * 0.25);
    ctx.stroke();
    traceFuse();
    ctx.strokeStyle = '#81502a';
    ctx.lineWidth = Math.max(1.4, r * 0.17);
    ctx.stroke();
    traceFuse();
    ctx.strokeStyle = 'rgba(224, 173, 103, 0.30)';
    ctx.lineWidth = Math.max(0.45, r * 0.035);
    ctx.stroke();

    // 平面視点の口金。HUDと同じく、上端の押さえ・胴・下端の受けを
    // 重ねて金属部品らしくする。上面の穴や楕円は描かない。
    const collarW = r * 0.44;
    const collarH = r * 0.20;
    const collarX = cx - collarW * 0.5;

    const baseX = collarX - r * 0.03;
    const baseY = collarY + r * 0.13;
    const baseW = collarW + r * 0.06;
    const baseH = r * 0.09;
    const baseGrad = ctx.createLinearGradient(baseX, baseY, baseX, baseY + baseH);
    baseGrad.addColorStop(0, '#3b4048');
    baseGrad.addColorStop(0.48, '#20242a');
    baseGrad.addColorStop(1, '#0e1115');
    ctx.fillStyle = baseGrad;
    ctx.strokeStyle = '#111419';
    ctx.lineWidth = Math.max(0.65, r * 0.060);
    ctx.beginPath();
    ctx.roundRect(baseX, baseY, baseW, baseH, r * 0.030);
    ctx.fill();
    ctx.stroke();

    const collarGrad = ctx.createLinearGradient(collarX, collarY, collarX + collarW, collarY + collarH);
    collarGrad.addColorStop(0, '#858b94');
    collarGrad.addColorStop(0.28, '#60666f');
    collarGrad.addColorStop(0.72, '#292d34');
    collarGrad.addColorStop(1, '#15181d');
    ctx.fillStyle = collarGrad;
    ctx.strokeStyle = '#171a1f';
    ctx.lineWidth = Math.max(0.7, r * 0.075);
    ctx.beginPath();
    ctx.roundRect(collarX, collarY, collarW, collarH, r * 0.045);
    ctx.fill();
    ctx.stroke();

    const lipX = collarX + r * 0.055;
    const lipY = collarY - r * 0.018;
    const lipW = collarW - r * 0.11;
    const lipH = r * 0.06;
    const lipGrad = ctx.createLinearGradient(lipX, lipY, lipX + lipW, lipY + lipH);
    lipGrad.addColorStop(0, '#9ca2aa');
    lipGrad.addColorStop(0.46, '#5f656d');
    lipGrad.addColorStop(1, '#272b31');
    ctx.fillStyle = lipGrad;
    ctx.strokeStyle = '#1b1f24';
    ctx.lineWidth = Math.max(0.55, r * 0.047);
    ctx.beginPath();
    ctx.roundRect(lipX, lipY, lipW, lipH, r * 0.024);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(216, 222, 231, 0.32)';
    ctx.lineWidth = Math.max(0.45, r * 0.038);
    ctx.beginPath();
    ctx.moveTo(collarX + r * 0.055, collarY + r * 0.052);
    ctx.lineTo(collarX + collarW - r * 0.055, collarY + r * 0.052);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(7, 9, 12, 0.62)';
    ctx.lineWidth = Math.max(0.45, r * 0.040);
    ctx.beginPath();
    ctx.moveTo(baseX + r * 0.04, baseY + baseH * 0.72);
    ctx.lineTo(baseX + baseW - r * 0.04, baseY + baseH * 0.72);
    ctx.stroke();

    // 導火線先端の不規則な点火閃光と、両端が細い流線型の火花を描く。
    // 丸や縦長の炎を置かず、短い閃光として方向性を出す。
    ctx.globalCompositeOperation = 'lighter';
    const flicker = Math.sin(time * 0.041) * 0.30 + Math.sin(time * 0.073 + 1.4) * 0.18;
    const fuseDX = p3.x - p2.x;
    const fuseDY = p3.y - p2.y;
    const fuseLength = Math.hypot(fuseDX, fuseDY) || 1;
    const fuseTangent = { x: fuseDX / fuseLength, y: fuseDY / fuseLength };
    const flareRadius = (2.45 + flicker * 0.24) * coreScale;
    const flareCenterX = p3.x + fuseTangent.x * flareRadius * 0.20;
    const flareCenterY = p3.y + fuseTangent.y * flareRadius * 0.20;
    const glowRadius = (3.7 + flicker * 0.72) * coreScale;
    const glow = ctx.createRadialGradient(flareCenterX, flareCenterY, 0, flareCenterX, flareCenterY, glowRadius);
    glow.addColorStop(0, 'rgba(255, 190, 45, 0.64)');
    glow.addColorStop(0.42, 'rgba(255, 92, 12, 0.32)');
    glow.addColorStop(1, 'rgba(255, 72, 5, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(flareCenterX, flareCenterY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    const ft = time * 0.00135;
    const sparkCount = 7;
    const sparkOriginX = flareCenterX + fuseTangent.x * flareRadius * 0.18;
    const sparkOriginY = flareCenterY + fuseTangent.y * flareRadius * 0.18;
    for (let i = 0; i < sparkCount; i++) {
        const s = seeds?.[i] || { ox: 0, oy: 0, ph: i * 2.1 };
        // 等間隔に発火する細い火花を扇状へ散らす。上向き一辺倒にせず、
        // 左右へ飛んだ後にわずかに落ちる線香花火状の短い放物線にする。
        const life = ((ft + i / sparkCount) % 1 + 1) % 1;
        const previousLife = Math.max(0, life - 0.34);
        const visibility = Math.pow(1 - life, 0.48);
        const baseAngle = -2.86 + i * 0.44;
        const angle = baseAngle + Math.sin(s.ph + ft * Math.PI * 2) * 0.12;
        const speed = 11.6 + (i % 4) * 1.6;
        const gravity = (2.8 + (i % 2) * 0.7) * fxScale;
        const pointAt = (phase) => {
            const distance = (2.0 + phase * speed) * fxScale;
            return {
                x: sparkOriginX + Math.cos(angle) * distance,
                y: sparkOriginY + Math.sin(angle) * distance + gravity * phase * phase
            };
        };
        const tail = pointAt(previousLife);
        const middle = pointAt((previousLife + life) * 0.5);
        const spark = pointAt(life);
        const streakHalf = (0.20 + visibility * 0.38) * fxScale;
        const streakDX = spark.x - tail.x;
        const streakDY = spark.y - tail.y;
        const streakLength = Math.hypot(streakDX, streakDY) || 1;
        const streakNormalX = -streakDY / streakLength;
        const streakNormalY = streakDX / streakLength;
        // 点火直後は橙、離れるほど赤へ冷える配色。中心の黄色い芯とは明確に分ける。
        const green = Math.round(132 - life * 54 + (i % 2) * 10);

        const streakGrad = ctx.createLinearGradient(tail.x, tail.y, spark.x, spark.y);
        streakGrad.addColorStop(0, `rgba(220, 38, 12, ${(0.14 * visibility).toFixed(3)})`);
        streakGrad.addColorStop(0.36, `rgba(255, ${green}, 24, ${(0.88 * visibility).toFixed(3)})`);
        streakGrad.addColorStop(1, `rgba(255, ${Math.min(166, green + 28)}, 40, ${visibility.toFixed(3)})`);
        ctx.shadowColor = `rgba(255, 58, 10, ${(0.54 * visibility).toFixed(3)})`;
        ctx.shadowBlur = 2.4 * fxScale;
        ctx.fillStyle = streakGrad;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.quadraticCurveTo(
            middle.x + streakNormalX * streakHalf,
            middle.y + streakNormalY * streakHalf,
            spark.x,
            spark.y
        );
        ctx.quadraticCurveTo(
            middle.x - streakNormalX * streakHalf,
            middle.y - streakNormalY * streakHalf,
            tail.x,
            tail.y
        );
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'rgba(0,0,0,0)';
    }

    // 根本は尖った炎や星ではなく、横に広い非対称の赤熱した火種として描く。
    ctx.save();
    ctx.translate(flareCenterX, flareCenterY);
    ctx.rotate(
        Math.atan2(fuseTangent.y, fuseTangent.x) + Math.PI / 2 +
        Math.sin(time * 0.009 + (seeds?.[1]?.ph || 0)) * 0.08
    );
    const flarePulse = 1 + Math.sin(time * 0.053 + (seeds?.[2]?.ph || 0)) * 0.07;
    const emberW = flareRadius * 0.96 * flarePulse;
    const emberH = flareRadius * 0.66 * (2 - flarePulse);
    const emberGrad = ctx.createRadialGradient(
        -emberW * 0.20,
        -emberH * 0.14,
        0,
        0,
        0,
        emberW * 1.04
    );
    emberGrad.addColorStop(0, '#fff07a');
    emberGrad.addColorStop(0.34, '#ffc126');
    emberGrad.addColorStop(0.66, '#ff6613');
    emberGrad.addColorStop(1, '#c9270c');
    ctx.fillStyle = emberGrad;
    ctx.beginPath();
    ctx.moveTo(-emberW * 0.82, emberH * 0.16);
    ctx.bezierCurveTo(
        -emberW * 0.98,
        -emberH * 0.38,
        -emberW * 0.46,
        -emberH * 0.78,
        emberW * 0.06,
        -emberH * 0.68
    );
    ctx.bezierCurveTo(
        emberW * 0.62,
        -emberH * 0.62,
        emberW * 0.94,
        -emberH * 0.12,
        emberW * 0.76,
        emberH * 0.30
    );
    ctx.bezierCurveTo(
        emberW * 0.48,
        emberH * 0.76,
        -emberW * 0.46,
        emberH * 0.70,
        -emberW * 0.82,
        emberH * 0.16
    );
    ctx.closePath();
    ctx.fill();

    // 中心発光も輪郭へ沿う小さな歪み面にして、点や星形を作らない。
    ctx.fillStyle = 'rgba(255, 241, 124, 0.88)';
    ctx.beginPath();
    ctx.moveTo(-emberW * 0.42, emberH * 0.04);
    ctx.bezierCurveTo(
        -emberW * 0.40,
        -emberH * 0.32,
        -emberW * 0.08,
        -emberH * 0.44,
        emberW * 0.24,
        -emberH * 0.24
    );
    ctx.bezierCurveTo(
        emberW * 0.44,
        emberH * 0.02,
        emberW * 0.16,
        emberH * 0.36,
        -emberW * 0.18,
        emberH * 0.32
    );
    ctx.bezierCurveTo(
        -emberW * 0.34,
        emberH * 0.30,
        -emberW * 0.46,
        emberH * 0.18,
        -emberW * 0.42,
        emberH * 0.04
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
}

// 爆弾クラス
export class Bomb {
    constructor(x, y, velocityX, velocityY) {
        this.x = x;
        this.y = y;
        this.vx = velocityX;
        this.vy = velocityY;
        this.radius = 8;
        this.visualScale = 1;
        this.isExploding = false;
        this.explosionTimer = 0;
        this.explosionDuration = 300;
        this.explosionRadius = 60;
        this.damage = 30;
        this.isDestroyed = false;
        this.id = Math.random().toString(36).substr(2, 9); // 一意なID
        this.trailPoints = []; // 飛翔中の火の粉トレイル（点数capで軽量）
        // 導火線火花のシード（毎フレーム Math.random だと先端がチラつくため一度だけ固定）
        this._fuseSeed = Array.from({ length: 7 }, () => ({
            ox: (Math.random() - 0.5) * 6,
            oy: (Math.random() - 0.5) * 6,
            ph: Math.random() * Math.PI * 2
        }));
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

        // 飛翔軌跡（火の粉トレイル用）。将軍時は太さだけでなく残る長さも同倍率にする。
        const trailScale = resolveVisualEffectScale(this.visualScale);
        pushTrailPoint(this.trailPoints, this.x, this.y - this.radius * 0.4, deltaTime * 1000, {
            maxAge: 120 * trailScale,
            minDist: 3 * trailScale,
            cap: 16
        });

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
        // 爆発エフェクト用のシードを「一度だけ」生成し、毎フレーム Math.random で
        // パーティクルが瞬間移動してチラつくのを防ぐ(鎖鎌の連続軌跡と同じ思想)。
        const SPIKES = 14;
        this._fx = {
            spikes: SPIKES,
            // 各トゲの基準長(0.55〜0.95)。描画時に低周波 sin を足して炎の揺らぎに。
            spikeLen: Array.from({ length: SPIKES }, () => 0.55 + Math.random() * 0.4),
            spikePhase: Array.from({ length: SPIKES }, () => Math.random() * Math.PI * 2),
            // 飛散火花(放物線)
            sparks: makeParticles(11, { speedMin: 0.55, speedMax: 1.5, sizeMin: 1.2, sizeMax: 3.2, gravity: 0.55 }),
            // 煙パフ(中心から各方向へ立ち上がり膨張)
            smoke: Array.from({ length: 5 }, () => ({
                ang: Math.random() * Math.PI * 2,
                dist: 0.15 + Math.random() * 0.5,
                r0: 0.42 + Math.random() * 0.38,
                vr: 0.5 + Math.random() * 0.55,
                rise: 0.3 + Math.random() * 0.5,
                tone: 0.7 + Math.random() * 0.5,
            })),
        };
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
            // 多層爆炎: 煙(下層) → 熱波 → コア炎(揺らぎ星形) → 開幕フラッシュ/衝撃波 → 飛散火花(放物線)
            const progress = this.explosionTimer / this.explosionDuration;
            const currentRadius = this.explosionRadius * Math.pow(progress, 0.4); // 急速に広がり、ゆっくり消える
            const alpha = 1 - Math.pow(progress, 1.5);
            const fx = this._fx || (this._fx = {});
            const R = this.explosionRadius;

            // --- 煙(source-over): 炎に照らされた「明るめの暖かいグレー」を薄く柔らかく。
            // 暗い背景で黒い塊にならないよう色を明るく・αを低く・縁を透明に・主に上方向へ拡散。
            if (fx.smoke) {
                ctx.save();
                for (const s of fx.smoke) {
                    const sp = progress;
                    const sr = R * (s.r0 * 0.55 + s.vr * sp * 0.78);                 // ふわっと膨張(判定外へ広げ過ぎない)
                    const sx = this.x + Math.cos(s.ang) * R * s.dist * 0.7 * sp;
                    const sy = this.y + Math.sin(s.ang) * R * s.dist * 0.7 * sp * 0.5 - R * (0.4 + s.rise) * sp; // 上昇主体
                    // 炎より少し遅れて立ち上げ、ゆっくり薄く消える
                    const sa = (sp < 0.35 ? sp / 0.35 : 1 - (sp - 0.35) / 0.65) * 0.24;
                    if (sa <= 0.01) continue;
                    const tone = 94 * s.tone;                                       // 明るめの暖かいグレー
                    const cr = Math.round(tone + 14), cg = Math.round(tone), cb = Math.round(tone - 14);
                    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
                    g.addColorStop(0, `rgba(${cr},${cg},${cb},${(sa * 0.85).toFixed(3)})`);
                    g.addColorStop(0.55, `rgba(${cr - 22},${cg - 20},${cb - 16},${(sa * 0.42).toFixed(3)})`);
                    g.addColorStop(1, `rgba(${cr - 30},${cg - 28},${cb - 24},0)`);
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // 外側の熱波（オレンジ→深紅→赤黒→透明）。爆炎の外縁を当たり判定(explosionRadius)に揃える。
            const heatR = currentRadius * 1.04;
            const outerGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, heatR);
            outerGrad.addColorStop(0.25, `rgba(255, 90, 10, ${(alpha * 0.7).toFixed(3)})`);
            outerGrad.addColorStop(0.6, `rgba(170, 30, 5, ${(alpha * 0.45).toFixed(3)})`);
            outerGrad.addColorStop(0.85, `rgba(70, 12, 6, ${(alpha * 0.25).toFixed(3)})`);
            outerGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = outerGrad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, heatR, 0, Math.PI * 2);
            ctx.fill();

            // 内側コア（高温青白の芯→白→黄→橙→透明。後半は橙→赤へシフトして燃え尽き)
            const burn = smoothstep01((progress - 0.45) / 0.55); // 後半の赤化
            const innerGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, currentRadius);
            // 芯は純白だと加算で白飛びして目が痛いので、暖色寄り＆低αに（青白の高温感は残しつつ控えめ）
            innerGrad.addColorStop(0, `rgba(255, 247, 232, ${(alpha * 0.5).toFixed(3)})`);
            innerGrad.addColorStop(0.06, `rgba(222, 236, 252, ${(alpha * 0.42).toFixed(3)})`); // 高温青白の芯(控えめ)
            innerGrad.addColorStop(0.28, `rgba(255, ${Math.round(238 - burn * 90)}, ${Math.round(148 - burn * 110)}, ${(alpha * 0.92).toFixed(3)})`);
            innerGrad.addColorStop(0.65, `rgba(255, ${Math.round(120 - burn * 60)}, 0, ${(alpha * 0.9).toFixed(3)})`);
            innerGrad.addColorStop(1, 'rgba(220, 40, 0, 0)');
            ctx.fillStyle = innerGrad;

            // 星型コア: トゲ本数固定、長さはシード＋低周波sinで揺らぎ(本数のガクつき排除)
            const spikes = (fx.spikes || 14);
            const t = progress;
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const angle = (Math.PI * 2 / (spikes * 2)) * i + t * 0.6 + Math.sin(t * 5) * 0.05;
                let r;
                if (i % 2 === 0) {
                    r = currentRadius;
                } else {
                    const k = (i - 1) / 2;
                    const len = (fx.spikeLen ? fx.spikeLen[k % fx.spikeLen.length] : 0.7);
                    const ph = (fx.spikePhase ? fx.spikePhase[k % fx.spikePhase.length] : 0);
                    r = currentRadius * (len * 0.55 + 0.15 + 0.12 * Math.sin(t * 8 + ph)); // 炎の揺らぎ
                }
                const px = this.x + Math.cos(angle) * r;
                const py = this.y + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // 開幕フラッシュ＋衝撃波リング(瞬間の強さ)。白飛び抑制(暖色芯/低強度)＋
            // リングは当たり判定の縁(≈explosionRadius)で止め、見た目=判定の範囲を伝える。
            drawBlastFlash(ctx, this.x, this.y, R, progress, {
                duration: 0.16, color: '255,224,170', coreColor: '255,240,210', intensity: 0.5,
                ringFrom: 0.5, ringTo: 1.02
            });

            // 飛散火花(シード式・放物線・尾を引く)。判定外まで飛び散らないよう射程を判定半径内寄りに。
            drawSparks(ctx, this.x, this.y, fx.sparks, progress, R * 0.92, { color: '255,205,120' });

        } else {
            ctx.save();

            // 燃える導火線から尾を引く火の粉トレイル（本体の後ろ＝飛翔の弧と速度感を出す）。控えめな暖色加算。
            if (this.trailPoints.length >= 3) {
                const trailScale = resolveVisualEffectScale(this.visualScale);
                drawCometRibbon(ctx, this.trailPoints, {
                    maxAge: 120 * trailScale,
                    headHalf: Math.max(2.4 * trailScale, this.radius * 0.34),
                    baseColor: '255, 150, 60',
                    edgeColor: '255, 222, 150',
                    headAlpha: 0.22,
                    coreAlpha: 0.32
                });
            }

            // 立体的な爆弾本体（球体グラデーション）＋落ち影で浮かせる
            const bodyGrad = ctx.createRadialGradient(
                this.x - this.radius * 0.34, this.y - this.radius * 0.34, this.radius * 0.04,
                this.x, this.y, this.radius
            );
            bodyGrad.addColorStop(0, '#666c75'); // 柔らかな入射光
            bodyGrad.addColorStop(0.18, '#454a52');
            bodyGrad.addColorStop(0.50, '#262a2f'); // 基本色
            bodyGrad.addColorStop(1, '#080a0d'); // 影
            withDropShadow(ctx, { color: 'rgba(0,0,0,0.45)', blur: 3, dx: 1, dy: 2 }, () => {
                ctx.fillStyle = bodyGrad;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
            });
            // 縁の暗いリムで鋳鉄の重量感
            ctx.strokeStyle = 'rgba(6,8,11,0.7)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius - 0.4, 0, Math.PI * 2);
            ctx.stroke();
            // 左上の球面反射。単色の白い楕円ではなく、HUD画像と同じく
            // 拡散光→細い主反射→外周リムの順で柔らかく重ねる。
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius - 0.7, 0, Math.PI * 2);
            ctx.clip();

            const diffuseHighlight = ctx.createRadialGradient(
                this.x - this.radius * 0.42,
                this.y - this.radius * 0.46,
                0,
                this.x - this.radius * 0.22,
                this.y - this.radius * 0.26,
                this.radius * 0.76
            );
            diffuseHighlight.addColorStop(0, 'rgba(236,241,248,0.17)');
            diffuseHighlight.addColorStop(0.30, 'rgba(207,214,224,0.085)');
            diffuseHighlight.addColorStop(0.68, 'rgba(161,170,183,0.03)');
            diffuseHighlight.addColorStop(1, 'rgba(130,140,154,0)');
            ctx.fillStyle = diffuseHighlight;
            ctx.fillRect(
                this.x - this.radius,
                this.y - this.radius,
                this.radius * 2,
                this.radius * 2
            );

            // 主反射は淡い楕円グラデーションにして、中心も白飛びさせない。
            ctx.save();
            ctx.translate(
                this.x - this.radius * 0.37,
                this.y - this.radius * 0.43
            );
            ctx.rotate(-0.58);
            ctx.scale(this.radius * 0.36, this.radius * 0.10);
            const specularHighlight = ctx.createRadialGradient(-0.22, -0.12, 0, 0, 0, 1);
            specularHighlight.addColorStop(0, 'rgba(248,250,253,0.28)');
            specularHighlight.addColorStop(0.42, 'rgba(230,235,242,0.13)');
            specularHighlight.addColorStop(1, 'rgba(210,218,229,0)');
            ctx.fillStyle = specularHighlight;
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.restore();

            drawFirebombFuse(
                ctx,
                this.x,
                this.y,
                this.radius,
                performance.now(),
                this._fuseSeed,
                this.visualScale
            );
            
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

    // 金属的なグラデーション（同系色のまま階調だけ少し増やして金属の深みを出す。色味・印象は据え置き）
    const bladeGrad = ctx.createLinearGradient(-r, -r, r, r);
    bladeGrad.addColorStop(0, '#e6ebf1');
    bladeGrad.addColorStop(0.32, '#bac2cd');
    bladeGrad.addColorStop(0.6, '#7a8599');
    bladeGrad.addColorStop(1, '#3a4556');

    const bladePath = () => {
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
    };

    // 落ち影で背景から浮かせる（控えめ。影は本体fillのみで後続の線へ伝播させない）
    withDropShadow(ctx, { color: 'rgba(0,0,0,0.4)', blur: Math.max(1.2, r * 0.16), dx: r * 0.1, dy: r * 0.12 }, () => {
        ctx.fillStyle = bladeGrad;
        bladePath();
        ctx.fill();
    });
    ctx.strokeStyle = '#2a3441';
    ctx.lineWidth = Math.max(0.8, r * 0.1);
    bladePath();
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
    constructor(x, y, vx, vy, damage, radius, pierce = false, homing = false, targetIndex = 0, visualScale = 1) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.radius = radius;
        this.visualScale = resolveVisualEffectScale(visualScale);
        this.rotation = 0;
        this.rotationSpeed = 18; // 回転速度の大きさ。符号は initialDirection 確定後に投擲方向へ合わせる
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
        // 投擲方向に合わせて回転の向きを反転する。手裏剣は world 座標で描かれ、
        // プレイヤーの水平反転(facing)の外側にあるため、符号を与えないと左右どちらを
        // 向いても同じ向き(時計回り)に回って見える＝左投げで回転が逆に見えるバグになる。
        this.rotationSpeed *= this.initialDirection;
        this.baseSpeed = Math.sqrt(vx * vx + vy * vy) || 1;
        this.homingTarget = null;
        this.homingTargetRear = false;
        this.homingRearArcPoint = null;
        this.homingRearArcCleared = false;
        this.homingLostSettleMs = 0;
        this.homingLostDir = this.initialDirection;
        this.defaultFlightY = y;
        this.prevX = x;
        this.prevY = y;
        this.trailPoints = []; // 追尾弾の彗星リボン軌跡（homing時のみ蓄積。点数capで軽量）
    }

    update(deltaTime, enemies = []) {
        if (this.isDestroyed) return;

        // ★二重更新ガードを完全撤廃
        //   呼び出しは Shuriken.update() からの1回に統一する。
        //   （外部から直接呼ばれても致命的な副作用はない）

        const dt = deltaTime;
        const smoothTurnTowardAngle = (targetAngle, turnRatePerSecond, targetSpeed, speedBlendRate = 6) => {
            const currentAngle = Math.atan2(this.vy, this.vx);
            let angleDiff = targetAngle - currentAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const turnRate = turnRatePerSecond * dt;
            const turn = Math.max(-turnRate, Math.min(turnRate, angleDiff));
            const newAngle = currentAngle + turn;
            const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const speedBlend = Math.min(1, dt * speedBlendRate);
            const speed = currentSpeed + (targetSpeed - currentSpeed) * speedBlend;
            this.vx = Math.cos(newAngle) * speed;
            this.vy = Math.sin(newAngle) * speed;
            return angleDiff;
        };
        const settleLostHoming = () => {
            if (this.homingLostSettleMs <= 0) return;
            this.homingLostSettleMs = Math.max(0, this.homingLostSettleMs - dt * 1000);
            const dir = Math.sign(this.homingLostDir) || Math.sign(this.vx) || this.initialDirection;
            const yError = this.defaultFlightY - this.y;
            const verticalAim = Math.max(-0.18, Math.min(0.5, yError / 120));
            const targetAngle = Math.atan2(verticalAim, dir);
            smoothTurnTowardAngle(targetAngle, 11.0, this.baseSpeed * 0.95, 8);
            if (this.vy < -this.baseSpeed * 0.12) {
                this.vy *= 0.68;
            }
        };
        let homingGuidanceApplied = false;

        // --- 追尾 ---
        if (this.homing && this.homingTarget) {
            const targetAlive = !this.homingTarget.isDead &&
                !this.homingTarget.isDying &&
                this.homingTarget.isAlive !== false;
            const targetInFrame = !Array.isArray(enemies) ||
                enemies.includes(this.homingTarget);

            if (targetAlive && targetInFrame) {
                const getTargetPoint = (e) => ({
                    x: e.x + (e.width || 30) / 2,
                    y: e.y + (e.height || 30) * (e.isCrouching ? 0.30 : 0.38)
                });
                const rearTarget = this.homingTargetRear;
                let target = getTargetPoint(this.homingTarget);
                let rearArcActive = false;
                if (rearTarget && this.homingRearArcPoint && !this.homingRearArcCleared) {
                    const arc = this.homingRearArcPoint;
                    const distToArc = Math.hypot(arc.x - this.x, arc.y - this.y);
                    const highEnough = this.y <= arc.y + this.radius * 1.35;
                    const turningBack = this.vx * this.initialDirection < -this.baseSpeed * 0.12;
                    const crossedArc = (this.x - arc.x) * this.initialDirection < -this.radius * 0.45;
                    if (distToArc < this.radius * 1.1 || (highEnough && (turningBack || crossedArc))) {
                        this.homingRearArcCleared = true;
                    } else {
                        target = arc;
                        rearArcActive = true;
                    }
                }
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const targetAngle = Math.atan2(dy, dx);
                const currentAngle = Math.atan2(this.vy, this.vx);
                let angleDiff = targetAngle - currentAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                const hardRearTurn = rearTarget && Math.abs(angleDiff) > Math.PI * 0.55;
                const turnRatePerSecond = rearArcActive ? 18.0 : (hardRearTurn ? 24.0 : (rearTarget ? 14.0 : 6.0));
                const targetSpeed = rearArcActive
                    ? this.baseSpeed * 0.72
                    : (
                        rearTarget && Math.abs(angleDiff) > Math.PI * 0.45
                            ? this.baseSpeed * 0.66
                            : this.baseSpeed
                    );
                smoothTurnTowardAngle(targetAngle, turnRatePerSecond, targetSpeed, rearTarget ? 9 : 5);
                if (rearTarget && this.homingRearArcCleared && dy > 0 && this.vy < -this.baseSpeed * 0.3) {
                    this.vy *= 0.72;
                }
                homingGuidanceApplied = true;
            } else {
                this.homingLostDir = Math.sign(this.vx) || (this.homingTargetRear ? -this.initialDirection : this.initialDirection);
                this.homingLostSettleMs = Math.max(this.homingLostSettleMs, 360);
                this.homingTarget = null;
                this.homingTargetRear = false;
                this.homingRearArcPoint = null;
                this.homingRearArcCleared = true;
            }
        }
        if (!homingGuidanceApplied) {
            settleLostHoming();
        }

        const isPreviewMode = !!(window.game && window.game.player && window.game.player.previewMode);
        // character_preview ページは可視ワールド範囲(ズーム引き考慮)を公開する。
        // 同ページの将軍/忍者は previewMode=false の実ロジックで動くため、
        // プレビュー判定は previewMode フラグではなくこの範囲の有無で行う。
        const previewViewBounds = (typeof window !== 'undefined' && window.__previewViewWorldBounds) || null;
        const inPreviewPage = isPreviewMode || !!previewViewBounds;
        const groundY = (window.game && window.game.groundY) ? window.game.groundY : 480;
        if (!isPreviewMode && this.homing && (groundY - this.y) < 80 && this.vy > 0) {
            this.vy *= 0.45;
        }

        // --- 移動 ---
        this.prevX = this.x;
        this.prevY = this.y;
        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;
        this.rotation += this.rotationSpeed * dt;
        this.life -= dt * 1000;

        // 追尾弾だけ軌跡点を蓄積（複数同時投擲時の視認性UP）。記録は update で1回＝多重描画パスに汚染されない。
        if (this.homing) {
            pushTrailPoint(this.trailPoints, this.x, this.y, dt * 1000, {
                maxAge: 78 * this.visualScale,
                minDist: 4 * this.visualScale,
                cap: 11
            });
        }

        // --- 地面・画面外判定 ---
        // プレビューでは groundY 前提が異なるため地面判定をスキップする
        if (!inPreviewPage) {
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
        } else {
            // プレビュー：実際に見えているワールド範囲(ズーム引き考慮)+マージンの外で消滅。
            // 固定の CANVAS_WIDTH 基準だとズーム引き時に画面端のだいぶ手前で消えてしまう。
            const scrollX = (window.game && window.game.scrollX) || 0;
            const viewLeft = previewViewBounds && Number.isFinite(previewViewBounds.left)
                ? previewViewBounds.left : scrollX - 200;
            const viewRight = previewViewBounds && Number.isFinite(previewViewBounds.right)
                ? previewViewBounds.right : (scrollX + CANVAS_WIDTH + 200);
            if (this.x < viewLeft - 200 || this.x > viewRight + 200) {
                this.isDestroyed = true;
            }
            // プレビューでは寿命切れで画面内に残った弾を消さず、可視範囲端まで飛ばし切る
        }

        if (this.life <= 0 && !inPreviewPage) this.isDestroyed = true;
    }

    getHitbox() {
        // 高速移動時のすり抜け防止:
        // 直前位置〜現在位置を包むAABBを当たり判定に使う
        const minX = Math.min(this.prevX, this.x) - this.radius;
        const minY = Math.min(this.prevY, this.y) - this.radius;
        const maxX = Math.max(this.prevX, this.x) + this.radius;
        const maxY = Math.max(this.prevY, this.y) + this.radius;
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    render(ctx) {
        if (this.isDestroyed) return;
        const lifeRatio = this.life / this.maxLife;
        const speed = Math.hypot(this.vx, this.vy);

        // 追尾弾の軌跡（動きの残り香程度に抑える＝レーザービーム化を避ける）。
        // 芯の明るい線(coreAlpha)を強く出すと連続したレーザーに見えるため、芯は薄く、
        // 短く淡い柔らかな尾だけにする。色も少し落ち着いた青緑にして発光感を下げる。
        if (this.homing && this.trailPoints.length >= 3 && lifeRatio > 0.06) {
            drawCometRibbon(ctx, this.trailPoints, {
                maxAge: 78 * this.visualScale,
                headHalf: Math.max(2.4 * this.visualScale, this.radius * 0.3),
                baseColor: '128, 196, 190',
                edgeColor: '198, 230, 224',
                headAlpha: 0.2 * Math.min(1, lifeRatio * 3),
                coreAlpha: 0.16 * Math.min(1, lifeRatio * 3)
            });
        }

        // モーションブラー（残像エフェクト）
        if (speed > 2 && lifeRatio > 0.1) {
            ctx.save();
            const blurSteps = 3;
            for (let i = 1; i <= blurSteps; i++) {
                const alpha = (1 - (i / blurSteps)) * 0.4 * Math.min(1, lifeRatio * 2);
                ctx.globalAlpha = alpha;
                const pastX = this.x - this.vx * (i * 0.5 * this.visualScale);
                const pastY = this.y - this.vy * (i * 0.5 * this.visualScale);
                const pastRot = this.rotation - (Math.sign(this.rotationSpeed) * 0.3 * i);
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
        this.projectiles = [];      // 本体の手裏剣
        this.cloneProjectiles = []; // 分身の手裏剣（独立カウント）
        this.pendingShots = [];
        this.projectileRadius = 10;
        this.projectileRadiusHoming = 14;
        this.heldRotation = 0;
        this.maxOnScreen = 1; // 本体の画面上最大同時存在数
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
        // Lv0〜2のみ少し大きく、Lv3は従来サイズを維持
        const normalRadii = [11.2, 11.2, 11.2, 10];
        const homingRadii = [14, 14, 14, 14];

        this.damage = damages[this.enhanceTier] || damages[0];
        this.bulletSpeed = speeds[this.enhanceTier] || speeds[0];
        this.maxOnScreen = maxCounts[this.enhanceTier] || maxCounts[0];
        this.projectileRadius = normalRadii[this.enhanceTier] || normalRadii[0];
        this.projectileRadiusHoming = homingRadii[this.enhanceTier] || homingRadii[0];
        this.cooldown = 150; // 投擲モーションのみ
        // Lv3: サイズアップ
        this.sizeUp = (this.enhanceTier >= 3);
    }

    canUse() {
        // 本体の在空数のみで上限判定（分身は独立カウント）
        this.projectiles = this.projectiles.filter(p => p && !p.isDestroyed);
        return this.projectiles.length < this.maxOnScreen;
    }

    use(player, enemies = []) {
        this.owner = player;
        if (!this.canUse()) return;

        const tier = this.enhanceTier;
        const pierce = tier >= 2;
        const homing = tier >= 3;
        const direction = player.facingRight ? 1 : -1;

        const baseX = player.x + ownerWorldWidth(player) / 2;
        const baseY = player.y;
        const launchEnemies = Array.isArray(enemies) ? enemies : [];

        // 本体の1発発射
        const mainLock = homing
            ? this._selectLaunchHomingTarget(baseX + direction * 18, baseY + 16, direction, launchEnemies)
            : null;
        const mainProjectile = this._spawnProjectile(
            baseX,
            baseY,
            direction,
            pierce,
            homing,
            false,
            mainLock
        );
        this._assignThrowTransformPivot(mainProjectile, player, baseX, baseY);

        // 奥義分身（火薬玉と同様に独立カウント）
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            const cloneOffsets = player.getSubWeaponCloneOffsets();
            if (Array.isArray(cloneOffsets) && cloneOffsets.length > 0) {
                // 分身側のアクティブ弾数チェック（分身は分身で独立して maxOnScreen 枚まで）
                this.cloneProjectiles = this.cloneProjectiles.filter(p => p && !p.isDestroyed);
                for (const clone of cloneOffsets) {
                    const activeCount = this.cloneProjectiles.filter(p => p && !p.isDestroyed && p.cloneIndex === clone.index).length;
                    if (activeCount >= this.maxOnScreen) continue;
                    player.triggerCloneSubWeapon(clone.index);
                    const cloneBaseX = baseX + clone.dx;
                    const cloneBaseY = baseY + clone.dy;
                    const cloneLock = homing
                        ? this._selectLaunchHomingTarget(cloneBaseX + direction * 18, cloneBaseY + 16, direction, launchEnemies)
                        : null;
                    const cloneProjectile = this._spawnProjectile(
                        cloneBaseX, cloneBaseY,
                        direction, pierce, homing, true, cloneLock // isClone=true
                    );
                    cloneProjectile.cloneIndex = clone.index;
                    this._assignThrowTransformPivot(cloneProjectile, player, cloneBaseX, cloneBaseY);
                }
            }
        }

        player.subWeaponAction = 'throw';
        player.subWeaponTimer = (typeof player.getSubWeaponActionDurationMs === 'function')
            ? player.getSubWeaponActionDurationMs('throw')
            : 72;
        audio.playShuriken();
    }

    _getHomingTargetPoint(enemy) {
        return {
            x: enemy.x + (enemy.width || 30) / 2,
            y: enemy.y + (enemy.height || 30) * (enemy.isCrouching ? 0.30 : 0.38)
        };
    }

    _selectLaunchHomingTarget(originX, originY, direction, enemies = []) {
        const validEnemies = enemies.filter(enemy =>
            enemy &&
            !enemy.isDead &&
            !enemy.isDying &&
            enemy.isAlive !== false
        );
        if (validEnemies.length === 0) return null;

        const frontEnemies = [];
        const rearEnemies = [];
        for (const enemy of validEnemies) {
            const target = this._getHomingTargetPoint(enemy);
            ((target.x - originX) * direction >= -this.projectileRadiusHoming ? frontEnemies : rearEnemies).push(enemy);
        }
        const candidates = frontEnemies.length > 0 ? frontEnemies : rearEnemies;
        let closest = null;
        let closestDist = Infinity;
        for (const enemy of candidates) {
            const target = this._getHomingTargetPoint(enemy);
            const dx = target.x - originX;
            const dy = target.y - originY;
            const d = dx * dx + dy * dy;
            if (d < closestDist) {
                closestDist = d;
                closest = enemy;
            }
        }
        return closest ? { target: closest, rear: frontEnemies.length === 0 } : null;
    }

    _createRearArcPoint(baseX, baseY, direction) {
        const owner = this.owner || null;
        const ownerWidth = owner ? ownerWorldWidth(owner) : PLAYER.WIDTH;
        const ownerHeight = owner ? ownerWorldHeight(owner) : PLAYER.HEIGHT;
        const forwardOffset = Math.max(14, Math.min(34, ownerWidth * 0.2));
        const topClearance = Math.max(30, Math.min(48, ownerHeight * 0.24));
        return {
            x: baseX + direction * forwardOffset,
            y: baseY - topClearance
        };
    }

    _spawnProjectile(baseX, baseY, direction, pierce, homing, isClone = false, launchLock = null) {
        const spawnX = baseX + direction * 18;
        const spawnY = baseY + 16;
        const speed = this.bulletSpeed || 20;
        const scale = resolveVisualEffectScale(this.owner && this.owner.scaleMultiplier);
        const baseRadius = this.sizeUp
            ? (homing ? 17 : 14)
            : (homing ? this.projectileRadiusHoming : this.projectileRadius);
        const r = baseRadius * scale;

        const proj = new ShurikenProjectile(
            spawnX,
            spawnY,
            direction * speed,
            0,
            this.damage,
            r,
            pierce,
            homing,
            0,
            scale
        );
        if (homing && launchLock && launchLock.target) {
            proj.homingTarget = launchLock.target;
            proj.homingTargetRear = !!launchLock.rear;
            if (proj.homingTargetRear) {
                proj.homingRearArcPoint = this._createRearArcPoint(baseX, baseY, direction);
            }
        }
        // 本体と分身で別配列に格納
        if (isClone) {
            this.cloneProjectiles.push(proj);
        } else {
            this.projectiles.push(proj);
        }
        return proj;
    }

    _assignThrowTransformPivot(projectile, owner, baseX, baseY) {
        if (!projectile || !owner) return;
        const ownerHeight = Number.isFinite(ownerWorldHeight(owner)) ? ownerWorldHeight(owner) : PLAYER.HEIGHT;
        const pivotHeight = Number.isFinite(owner._throwTransformPivotHeight)
            ? owner._throwTransformPivotHeight
            : ownerHeight;
        projectile._throwTransformPivotX = baseX;
        projectile._throwTransformPivotY = baseY + pivotHeight * 0.62;
    }

    update(deltaTime, enemies = []) {
        this.heldRotation += 1.2 * deltaTime;

        // 本体・分身の両配列を更新
        for (const proj of this.projectiles) {
            proj.update(deltaTime, enemies);
        }
        this.projectiles = this.projectiles.filter(p => !p.isDestroyed);

        for (const proj of this.cloneProjectiles) {
            proj.update(deltaTime, enemies);
        }
        this.cloneProjectiles = this.cloneProjectiles.filter(p => !p.isDestroyed);
    }

    getHitbox() {
        const all = [...this.projectiles, ...this.cloneProjectiles];
        if (all.length === 0) return null;
        const hitboxes = [];
        for (const proj of all) {
            if (!proj.isDestroyed) {
                const hb = proj.getHitbox();
                hb._sourceProjectile = proj;
                hitboxes.push(hb);
            }
        }
        return hitboxes.length > 0 ? hitboxes : null;
    }

    render(ctx, player = null) {
        // 手裏剣の描画物は弾（ワールド実体）のみ。ミラー分身のモーション描画パスでは
        // 本体の弾を分身位置でもう一度描かない（分身の弾は dedicated インスタンスが描く）。
        if (player && player._renderingMirrorClone) return;
        for (const proj of this.projectiles) {
            proj.render(ctx);
        }
        for (const proj of this.cloneProjectiles) {
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

    renderHeld(ctx, handX, handY, scale = 1.0) {
        const r = (this.enhanceTier >= 3 ? 12 : 9.4) * scale;
        const color = '#3d444d'; // 金属感のある暗いグレー
        
        ctx.save();
        ctx.translate(handX, handY);
        
        // 導火線
        ctx.strokeStyle = '#5c5248';
        ctx.lineWidth = 1.8 * scale;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.8);
        ctx.quadraticCurveTo(r * 0.4, -r * 1.5, r * 1.1, -r * 0.7);
        ctx.stroke();

        // 本体（少しザラついた質感）
        const grad = ctx.createRadialGradient(-r*0.2, -r*0.3, r*0.1, 0, 0, r);
        grad.addColorStop(0, '#5a6370');
        grad.addColorStop(0.6, color);
        grad.addColorStop(1, '#1a1d21');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        
        // 表面の反射
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.2 * scale;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.8, -Math.PI * 0.7, -Math.PI * 0.4);
        ctx.stroke();

        ctx.restore();
    }

    render(ctx, handX, handY, scale) {
        if (typeof handX === 'number' && typeof handY === 'number') {
            this.renderHeld(ctx, handX, handY, scale);
        }
    }

    use(player) {
        this.owner = player;
        if (!this.canUse()) return;

        const g = window.game;
        if (!g) return;

        const direction = player.facingRight ? 1 : -1;
        let vx = direction * 8;
        let vy = -8;
        let bombY = player.y + 10;

        if (player.isCrouching) {
            vx = direction * 8.5;
            vy = -6.2;
            bombY = player.y + ownerWorldHeight(player) - 30;
        }

        const tier = this.enhanceTier;
        const sizeUp = tier >= 3;
        const attackMultiplier = Math.max(1, Number(player && player.attackPower) || 1);

        // 1発発射
        const bomb = new Bomb(
            player.x + ownerWorldWidth(player) / 2 + direction * 15,
            bombY,
            vx,
            vy
        );
        const ownerScale = resolveVisualEffectScale(player && player.scaleMultiplier);
        const baseBombDamage = sizeUp ? Math.round(this.damage * 1.22) : this.damage;
        bomb.damage = Math.max(1, Math.round(baseBombDamage * attackMultiplier));
        bomb.radius = (sizeUp ? 14 : 11) * ownerScale;
        bomb.visualScale = resolveVisualEffectScale(bomb.radius / 11);
        bomb.explosionRadius = sizeUp ? Math.round(this.range * 1.16) : this.range;
        bomb.explosionDuration = sizeUp ? 380 : 300;
        this._assignThrowTransformPivot(bomb, player, player.x + ownerWorldWidth(player) / 2, player.y);
        g.bombs.push(bomb);
        this.trackedBombs.push(bomb);

        // 奥義分身中は分身位置からも同時投擲
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            const cloneOffsets = player.getSubWeaponCloneOffsets();
            if (Array.isArray(cloneOffsets) && cloneOffsets.length > 0) {
                for (const clone of cloneOffsets) {
                    player.triggerCloneSubWeapon(clone.index);
                    const cloneBaseX = player.x + clone.dx + ownerWorldWidth(player) / 2;
                    const cloneBaseY = player.y + clone.dy;
                    const cloneBomb = new Bomb(
                        cloneBaseX + direction * 15,
                        cloneBaseY + (bombY - player.y),
                        vx + (clone.index % 2 === 0 ? 0.5 : -0.5),
                        vy
                    );
                    cloneBomb.damage = Math.max(1, Math.round(baseBombDamage * attackMultiplier));
                    cloneBomb.radius = bomb.radius;
                    cloneBomb.visualScale = bomb.visualScale;
                    cloneBomb.explosionRadius = bomb.explosionRadius;
                    cloneBomb.explosionDuration = bomb.explosionDuration;
                    this._assignThrowTransformPivot(cloneBomb, player, cloneBaseX, cloneBaseY);
                    g.bombs.push(cloneBomb);
                }
            }
        }
        player.subWeaponAction = 'throw';
        player.subWeaponTimer = (typeof player.getSubWeaponActionDurationMs === 'function')
            ? player.getSubWeaponActionDurationMs('throw')
            : 72;
        audio.playDash();
    }

    update(deltaTime) {
        // 消滅済みBombを追跡リストから除去
        this.trackedBombs = this.trackedBombs.filter(b => !b.isDestroyed);
    }

    _assignThrowTransformPivot(bomb, owner, baseX, baseY) {
        if (!bomb || !owner) return;
        const ownerHeight = Number.isFinite(ownerWorldHeight(owner)) ? ownerWorldHeight(owner) : PLAYER.HEIGHT;
        const pivotHeight = Number.isFinite(owner._throwTransformPivotHeight)
            ? owner._throwTransformPivotHeight
            : ownerHeight;
        bomb._throwTransformPivotX = baseX;
        bomb._throwTransformPivotY = baseY + pivotHeight * 0.62;
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
        player.subWeaponAction = '大槍';
        player.subWeaponTimer = (typeof player.getSubWeaponActionDurationMs === 'function')
            ? player.getSubWeaponActionDurationMs('大槍')
            : this.attackDuration;

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
        const centerX = player.x + ownerWorldWidth(player) / 2 + direction * (8 + spearPush);
        // しゃがみ時も同じ高さ感を維持するため、足元基準で決める。
        // 27 は素体(忍者60px)の腰高さ。巨躯オーナー(ボス108px)がこの固定値のままだと
        // 柄が膝下に来て腕が届かず「槍を掴めていない」絵になるため、
        // オーナー側が spearGripLift を宣言していればそれを使う。
        const footY = player.y + ownerWorldHeight(player);
        const gripLift = Number.isFinite(player.spearGripLift) ? player.spearGripLift : 27;
        const y = footY - gripLift;
        // 槍本体は常に最大到達長で維持し、突きは腕/体のモーションで表現する
        const thrust = ownerModelRange(this.range, player) * 0.84;
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
        // 終了間際は槍ごとフェードアウトさせ、突然消えないようにする（武器時間で最後の120ms）
        const spearFadeAlpha = this.isAttacking
            ? Math.max(0, Math.min(1, this.attackTimer / 120))
            : 1;

        // === 横突進の風切り（dashの疾走感）===
        // use() の player.vx += direction*dashBoost で身体が横っ飛びする。その実速度を駆動に、
        // 穂先軸を中心に後方(-direction)へ流れる「流線」を描く。直線の束(=安っぽい集中線)ではなく、
        // 両端が点へ収束するテーパー曲線リボン(筆致)＋明るい芯にして風らしい質感を出す。
        // 速いほど長く濃い＝高tier(dashBoost大)ほど自動で風が強い。前方エネルギーとは別系統・描画専用。
        const dashSpeed = Math.abs((player && player.vx) || 0);
        const windInten = Math.max(0, Math.min(1, (dashSpeed - 5) / 22)) * spearFadeAlpha;
        if (windInten > 0.02) {
            const wdir = st.direction;
            const bodyW = ownerWorldWidth(player);
            const bodyH = ownerWorldHeight(player);
            const wcx = player.x + bodyW / 2;
            const windMaxLen = 54 + windInten * 92 + Math.min(74, dashSpeed * 0.8);

            // テーパー付き流線リボン1本（両端が点へ収束）＋細い明るい芯。x0=頭(body/穂先側)、後方へ流れる。
            const SEG = 16;
            const drawStreak = (x0, y0, len, sweepY, halfW, alpha, coreBoost) => {
                if (alpha < 0.012 || len < 4) return;
                const x1 = x0 - wdir * len;
                const y1 = y0 + sweepY;
                const cxp = x0 - wdir * len * 0.5;
                const cyp = y0 + sweepY * 0.62;
                const px = [], py = [], pw = [];
                for (let k = 0; k <= SEG; k++) {
                    const t = k / SEG, mt = 1 - t;
                    px.push(mt * mt * x0 + 2 * mt * t * cxp + t * t * x1);
                    py.push(mt * mt * y0 + 2 * mt * t * cyp + t * t * y1);
                    // 幅: 両端0・頭寄り(t小)で太い筆致 → 尾は細く点へ収束
                    pw.push(halfW * smoothstep01(t / 0.18) * Math.pow(1 - t, 1.15));
                }
                const ux = [], uy = [], lx = [], ly = [];
                for (let k = 0; k <= SEG; k++) {
                    const a = Math.max(0, k - 1), b = Math.min(SEG, k + 1);
                    let tx = px[b] - px[a], ty = py[b] - py[a];
                    const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
                    const nx = -ty, ny = tx;
                    ux.push(px[k] + nx * pw[k]); uy.push(py[k] + ny * pw[k]);
                    lx.push(px[k] - nx * pw[k]); ly.push(py[k] - ny * pw[k]);
                }
                const g = ctx.createLinearGradient(x0, y0, x1, y1);
                g.addColorStop(0, `rgba(232,247,255,${alpha.toFixed(3)})`);
                g.addColorStop(0.5, `rgba(198,230,255,${(alpha * 0.5).toFixed(3)})`);
                g.addColorStop(1, 'rgba(176,220,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(ux[0], uy[0]);
                for (let k = 1; k <= SEG; k++) ctx.lineTo(ux[k], uy[k]);
                for (let k = SEG; k >= 0; k--) ctx.lineTo(lx[k], ly[k]);
                ctx.closePath(); ctx.fill();
                if (coreBoost > 0) {
                    const cg = ctx.createLinearGradient(x0, y0, x1, y1);
                    cg.addColorStop(0, `rgba(246,252,255,${(alpha * coreBoost).toFixed(3)})`);
                    cg.addColorStop(0.65, `rgba(222,243,255,${(alpha * coreBoost * 0.4).toFixed(3)})`);
                    cg.addColorStop(1, 'rgba(222,243,255,0)');
                    ctx.strokeStyle = cg;
                    ctx.lineWidth = Math.max(0.5, halfW * 0.34);
                    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cxp, cyp, x1, y1); ctx.stroke();
                }
            };

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineJoin = 'round';
            const midY = st.y;                  // 穂先の高さ＝風の主軸
            const halfSpread = bodyH * 0.34;
            const iw = 0.6 + 0.4 * windInten;
            // 穂先軸を中心に上下へ広がる流線（本数を絞り質感を上げる。中央=主流、外側=淡い裾）
            const streaks = [
                { off:  0.00, sweep:   0, lenS: 1.00, hw: 3.0, aS: 1.00, core: 0.95 },
                { off: -0.46, sweep: -12, lenS: 0.84, hw: 2.1, aS: 0.72, core: 0.50 },
                { off:  0.46, sweep:  12, lenS: 0.84, hw: 2.1, aS: 0.72, core: 0.50 },
                { off: -0.92, sweep: -26, lenS: 0.60, hw: 1.5, aS: 0.46, core: 0.00 },
                { off:  0.92, sweep:  26, lenS: 0.60, hw: 1.5, aS: 0.46, core: 0.00 },
            ];
            for (let i = 0; i < streaks.length; i++) {
                const s = streaks[i];
                const seed = ((i * 73) % 11) / 11;
                const y0 = midY + s.off * halfSpread;
                const x0 = wcx - wdir * (bodyW * 0.30 + seed * 7); // 身体の後縁から後方へ流れ出す
                const len = windMaxLen * s.lenS * (0.86 + 0.22 * seed);
                drawStreak(x0, y0, len, s.sweep * iw, s.hw * (0.7 + 0.5 * windInten), windInten * 0.46 * s.aS, s.core);
            }
            // 穂先の弓状気流：風が穂先で上下に割れ後方へ流れる＝「切ってる」感（同じ筆致リボンで統一）
            const bowLen = 30 + windInten * 46 + Math.min(44, dashSpeed * 0.5);
            const bowSweep = 14 + windInten * 12;
            drawStreak(st.spearEnd + wdir * 5, st.y, bowLen, -bowSweep, 1.7 * iw, windInten * 0.5, 0.4);
            drawStreak(st.spearEnd + wdir * 5, st.y, bowLen,  bowSweep, 1.7 * iw, windInten * 0.5, 0.4);
            ctx.restore();
        }

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
        ctx.globalAlpha *= spearFadeAlpha;
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

        // 落ち影で背景から浮かせる（控えめ。影は本体fillのみで後続の陰影/鎬へ伝播させない）
        withDropShadow(ctx, { color: 'rgba(0,0,0,0.45)', blur: 2.4, dx: 0.8, dy: 1.4 }, () => {
            ctx.fillStyle = bladeGrad;
            traceBladePath();
            ctx.fill();
        });

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

        // 切先グリント（穂先に集中する鋭い光点）
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(localTip - 1.2, -0.4, 0.95, 0, Math.PI * 2);
        ctx.fill();

        // 突き先の残光（グロー弧＋コア弧の二重＋切先フラッシュ）
        if (this.thrustPulse > 0) {
            const pulseRatio = this.thrustPulse / 180;
            const rr = 10 + (1 - pulseRatio) * 14;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // 外側グロー（太く低α）
            ctx.strokeStyle = `rgba(120, 210, 255, ${(pulseRatio * 0.4).toFixed(3)})`;
            ctx.lineWidth = 5.0;
            ctx.beginPath();
            ctx.arc(localTip + 3.8, 0, rr, -0.98, 0.98);
            ctx.stroke();
            // 内側コア（細く高α）
            ctx.strokeStyle = `rgba(244, 255, 255, ${(pulseRatio * 0.9).toFixed(3)})`;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(localTip + 3.8, 0, rr, -0.86, 0.86);
            ctx.stroke();
            // 切先の刺突フラッシュ
            const fg = ctx.createRadialGradient(localTip + 2, 0, 0, localTip + 2, 0, 6);
            fg.addColorStop(0, `rgba(230, 250, 255, ${(pulseRatio * 0.8).toFixed(3)})`);
            fg.addColorStop(1, 'rgba(180, 235, 255, 0)');
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(localTip + 2, 0, 6, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        ctx.restore();

        // 突きのエフェクト(衝撃波・風切り)
        if (this.isAttacking && st.progress > 0) {
            ctx.save();
            ctx.translate(st.spearEnd, st.y);
            ctx.scale(st.direction, 1);
            const tier = this.enhanceTier || 0;
            // エネルギーは槍の押し出し(extend)に同期させ、突き切る瞬間(progress≈0.78)で
            // ピークを迎えてから減衰させる。sin(progress*π)では0.5で先行ピークし、槍が
            // 伸び切る前にエフェクトがだれていた。
            const extend = Math.max(0, Math.min(1, (st.progress - 0.22) / 0.56)); // 1 at apex
            const release = Math.max(0, Math.min(1, (st.progress - 0.78) / 0.22)); // 突き切り後の余韻
            const drive = smoothstep01(extend);
            const settle = 1 - smoothstep01(release);
            const alpha = drive * settle;
            if (alpha <= 0.001) {
                ctx.restore();
                return;
            }
            // apex直前で尖る貫通感（前方への伸び・コーンの鋭さに使う）
            const pierce = Math.pow(extend, 2.2) * settle;

            const streakBase = 86 + tier * 20;
            const burstReach = 50 + pierce * (44 + tier * 12);
            ctx.globalCompositeOperation = 'lighter';

            // コアの刺突光（前方へまっすぐ・apexで前へ伸びる）
            const coreLen = streakBase + 64 + pierce * 46;
            const coreGrad = ctx.createLinearGradient(-8, 0, coreLen, 0);
            coreGrad.addColorStop(0, `rgba(244, 255, 255, ${(alpha * 0.94).toFixed(3)})`);
            coreGrad.addColorStop(0.34, `rgba(190, 246, 255, ${(alpha * 0.62).toFixed(3)})`);
            coreGrad.addColorStop(1, 'rgba(112, 210, 255, 0)');
            ctx.strokeStyle = coreGrad;
            ctx.lineWidth = 2.6 + tier * 0.6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-8, 0);
            ctx.lineTo(coreLen, 0);
            ctx.stroke();

            // 多層ストリーク（前方へタイトに走る。下方への垂れを抑え貫通感を出す）
            for (let i = 0; i < 4; i++) {
                const lane = i - 1.5;
                const laneAlpha = alpha * (0.46 - i * 0.06);
                const laneLen = streakBase + 24 + i * 14 + pierce * (24 + i * 6);
                ctx.strokeStyle = `rgba(190, 238, 255, ${Math.max(0.06, laneAlpha).toFixed(3)})`;
                ctx.lineWidth = Math.max(0.8, 1.5 - i * 0.2);
                ctx.beginPath();
                ctx.moveTo(4 + i * 2, lane * 2.4);
                ctx.quadraticCurveTo(laneLen * 0.5, lane * (3.4 + i * 0.5), laneLen, lane * (4.6 + i * 0.7));
                ctx.stroke();
            }

            // 先端の圧縮衝撃（鋭いコーン。apexで尖って前へ伸びる）
            const coneHalf = 5.0 + pierce * 5.4;
            const coneTip = burstReach + 42 + pierce * 28;
            const burstGrad = ctx.createLinearGradient(-4, 0, coneTip, 0);
            burstGrad.addColorStop(0, `rgba(236, 255, 255, ${(alpha * 0.84).toFixed(3)})`);
            burstGrad.addColorStop(0.5, `rgba(158, 226, 255, ${(alpha * 0.4).toFixed(3)})`);
            burstGrad.addColorStop(1, 'rgba(108, 192, 255, 0)');
            ctx.fillStyle = burstGrad;
            ctx.beginPath();
            ctx.moveTo(-4, 0);
            ctx.lineTo(burstReach * 0.5, -coneHalf);
            ctx.lineTo(coneTip, 0);
            ctx.lineTo(burstReach * 0.5, coneHalf);
            ctx.closePath();
            ctx.fill();

            // 先端周辺のリング状ショック（apexで開く）
            ctx.strokeStyle = `rgba(224, 248, 255, ${(alpha * 0.62).toFixed(3)})`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(6 + pierce * 8, 0, 6 + pierce * 15, -0.7, 0.7);
            ctx.stroke();

            if (tier >= 3 && st.progress > 0.74 && st.progress < 0.98) {
                const shockAlpha = alpha * 0.7;
                ctx.strokeStyle = `rgba(216, 246, 255, ${shockAlpha.toFixed(3)})`;
                ctx.lineWidth = 4.6;
                ctx.lineCap = 'round';
                const far = CANVAS_WIDTH + 120;
                ctx.beginPath();
                ctx.moveTo(8, -6.2);
                ctx.lineTo(far, -6.2);
                ctx.moveTo(8, 6.2);
                ctx.lineTo(far, 6.2);
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
        this._swingId = 0; // 攻撃ごとにインクリメント（トレイルID用）
        
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
            case 1: base = 130; break; // 初段: 奥手・袈裟斬り（テンポ重視で短め）
            case 2: base = 135; break; // 二段: 手前手・切り上げ（テンポ重視で短め）
            case 3: base = 180; break; // 三段: 両手・十字斬り（テンポ重視で短め）
            case 4: base = 338; break; // 四段: 天穿・並行切り上げ
            default: base = 358; break; // 五段(0): 叩きつけ
        }
        // 4〜5撃目は一段速いテンポ
        if (step === 4) {
            base *= 0.66;
        } else if (step === 0) {
            base *= 0.55;
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
        if (options.progress !== undefined) {
            return Math.max(0, Math.min(1, options.progress));
        }
        const timer = options.attackTimer !== undefined ? options.attackTimer : this.attackTimer;
        let duration = this.mainDuration;
        if (options.comboIndex !== undefined) {
            duration = this.getMainDurationByStep(options.comboIndex);
        }
        return Math.max(0, Math.min(1, 1 - (timer / duration)));
    }

    remapMainSwingProgress(step, progress, side = 'right') {
        const p = Math.max(0, Math.min(1, progress));
        if (step === 1) {
            // 1撃目: 奥手のみ袈裟斬り — アイドル状態から直接振り下ろす
            if (side === 'left') {
                // 斬り(0-50%) → 余韻保持(50-70%) → 戻り(70-100%)
                if (p < 0.50) {
                    const t = p / 0.50;
                    return t * t * (3 - 2 * t) * 0.94;
                }
                if (p < 0.70) {
                    return 0.94 + ((p - 0.50) / 0.20) * 0.06;
                }
                const recoverT = Math.pow((p - 0.70) / 0.30, 1.5);
                return 1.0 * (1 - recoverT); // 1.0から0へ戻る
            }
            return 0; // 手前刀: 静止
        }
        if (step === 2) {
            // 2撃目: 手前手のみ切り上げ
            if (side === 'right') {
                // 引き(0-10%) → 斬り(10-48%) → 余韻保持(48-70%) → 戻り(70-100%)
                if (p < 0.10) return 0;
                if (p < 0.48) {
                    const t = (p - 0.10) / 0.38;
                    return t * t * (3 - 2 * t) * 0.93;
                }
                if (p < 0.70) {
                    return 0.93 + ((p - 0.48) / 0.22) * 0.07;
                }
                const recoverT = Math.pow((p - 0.70) / 0.30, 1.5);
                return 1.0 * (1 - recoverT);
            }
            return 0; // 奥刀: 静止
        }
        if (step === 3) {
            // 3撃目: 両刀十字斬り — 寄せ → 爆発的に開く
            const gather = 0.15; // 寄せフェーズ
            const slash = 0.55;  // 斬りフェーズ終了
            if (side === 'left') {
                if (p < gather) {
                    const t = p / gather;
                    return t * t * 0.08;
                }
                if (p < slash) {
                    const t = (p - gather) / (slash - gather);
                    return 0.08 + t * t * (3 - 2 * t) * 0.88;
                }
                if (p < 0.75) {
                    return 0.96 + ((p - slash) / (0.75 - slash)) * 0.04;
                }
                const recoverT = Math.pow((p - 0.75) / 0.25, 1.5);
                return 1.0 * (1 - recoverT);
            }
            // right: わずかにずらしてタイミングに差をつける
            const gatherR = 0.12;
            const slashR = 0.52;
            if (p < gatherR) {
                const t = p / gatherR;
                return t * t * 0.06;
            }
            if (p < slashR) {
                const t = (p - gatherR) / (slashR - gatherR);
                return 0.06 + t * t * (3 - 2 * t) * 0.90;
            }
            if (p < 0.72) {
                return 0.96 + ((p - slashR) / (0.72 - slashR)) * 0.04;
            }
            const recoverTR = Math.pow((p - 0.72) / 0.28, 1.5);
            return 1.0 * (1 - recoverTR);
        }
        if (step === 4) {
            // 4撃目: 天穿・並行切り上げ
            if (p < 0.62) return (p / 0.62) * 0.84;
            return 0.84 + ((p - 0.62) / 0.38) * 0.16;
        }
        // 五段目(0): 4段目終端姿勢を短く保持してから叩きつける
        if (p < 0.18) return (p / 0.18) * 0.04;
        if (p < 0.72) return 0.04 + ((p - 0.18) / 0.54) * 0.9;
        return 0.94 + ((p - 0.72) / 0.28) * 0.06;
    }

    getMainSwingArcs(options = {}) {
        const index = options.comboIndex !== undefined ? options.comboIndex : this.comboIndex;
        // アイドル角度: 奥刀(left)=-0.65, 手前刀(right)=-1.1
        switch (index) {
            case 1:
                return {
                    // 1撃目: 奥手のみ袈裟斬り — アイドルから振り下ろし
                    leftStart: -0.65, leftEnd: 1.60,   // idle → 下前方へ
                    rightStart: -1.1, rightEnd: -1.1,  // 手前刀: idle固定
                    effectRadius: 92,
                    hit: 'leftKesa'
                };
            case 2:
                return {
                    // 2撃目: 手前手のみ切り上げ — アイドルから跳ね上げ
                    rightStart: -1.1, rightEnd: -3.25,  // idle → 上方へ大きく (さらに後方まで)
                    leftStart: -0.65, leftEnd: -0.65,   // 奥刀: idle固定
                    effectRadius: 96,
                    hit: 'rightGyakuKesa'
                };
            case 3:
                return {
                    // 3撃目: 両刀十字斬り — 寄せてから左右に爆発
                    leftStart: 0.20, leftEnd: -1.40,   // 中央→斜め上へ
                    rightStart: -0.20, rightEnd: 1.40,  // 中央→斜め下へ
                    effectRadius: 110,
                    hit: 'crossNagi'
                };
            case 4:
                return {
                    // 4撃目: 天穿・並行切り上げ
                    // 3段終了位置から両刀を揃えて斜め上へ一気に切り上げる
                    rightStart: 1.4, rightEnd: -2.56,
                    leftStart: 1.16, leftEnd: -2.42,
                    effectRadius: 110,
                    hit: 'risingX'
                };
            default:
                return {
                    // 五段目: 叩きつけ（上方から一気に振り下ろす）
                    rightStart: -2.56, rightEnd: 0.82,
                    leftStart: -2.56, leftEnd: 0.82,
                    effectRadius: 112,
                    hit: 'fallingBreak'
                };
        }
    }

    getMainSwingPose(options = {}) {
        const progress = this.getMainSwingProgress(options);
        const index = options.comboIndex !== undefined ? options.comboIndex : this.comboIndex;
        const remappedRight = this.remapMainSwingProgress(index, progress, 'right');
        const remappedLeft = this.remapMainSwingProgress(index, progress, 'left');
        const arcs = this.getMainSwingArcs(options);
        return {
            progress,
            remappedRight,
            remappedLeft,
            comboIndex: index,
            arcs,
            rightAngle: arcs.rightStart + (arcs.rightEnd - arcs.rightStart) * remappedRight,
            leftAngle: arcs.leftStart + (arcs.leftEnd - arcs.leftStart) * remappedLeft
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
                // 将軍などscaleMultiplier > 1のキャラはプロジェクタイルもスケールアップする
                sizeScale: (player && Number.isFinite(player.scaleMultiplier) && player.scaleMultiplier > 0
                    ? player.scaleMultiplier : 1) * (this.enhanceTier >= 3 ? 1.14 : 1.0),
                _owner: player // 発射時に座標を取得するために保持
            };
            // 効果音は発射のタイミングに合わせて鳴らすため、ここでは鳴らさない
        } else if (type === 'main') {
        // Z連撃は忍具Lvに応じて段が1段目から順番に解放される
        // （Lv0=1〜2段, Lv1=1〜3段, Lv2=1〜4段, Lv3=1〜5段）。
        // comboIndex は段ポーズ規約（1..4=各段, 0=5段目）を維持する。
        // 旧式 (comboIndex+1)%length は低Lvで最終撃が 0(=5段目の叩きつけ)へ巻き戻り、
        // 段が順番に出ない上にダメージの段対応もずれていた。
        if (this.mainComboLinkTimer <= 0) {
            this.comboIndex = 0; // コンボ切れ: 未開始へ
        }
        const maxSteps = Math.max(1, this.comboDamages.length); // Lv0..3 → 2..5
        const prevStep = this.comboIndex === 0 ? 0 : this.comboIndex; // 0=未開始/5段目直後
        let nextStep = prevStep + 1;
        if (nextStep > maxSteps) nextStep = 1;
        this.comboIndex = nextStep === 5 ? 0 : nextStep;
        this._swingId = (this._swingId || 0) + 1;
        const damage = this.comboDamages[nextStep - 1] || this.comboDamages[0];
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
            // 合体攻撃は前半を溜め、新タイミング（0.73: 振り下ろし中〜直後）の瞬間に飛翔斬撃を出す
            if (this.attackType === 'combined' && this.pendingCombinedProjectile && this.getCombinedSwingProgress() >= 0.73) {
                const p = this.pendingCombinedProjectile;
                const owner = p._owner;
                if (owner) {
                    // 発射の瞬間のプレイヤー座標から基点を計算（移動に追従させる）。
                    // ワールド実体の生成なので、描画中フラグ(_inRenderModel=素体寸法を返す)
                    // の影響を受けない明示的なワールド寸法で計算する（フラグが残留すると
                    // 将軍の本体弾だけ素体高さ基準になり約60px浮く）。
                    const spawnWorldW = (typeof owner.getWorldWidth === 'function') ? owner.getWorldWidth() : (owner.width || 0);
                    const spawnWorldH = (typeof owner.getWorldHeight === 'function') ? owner.getWorldHeight() : (owner.height || 0);
                    p.x = owner.x + spawnWorldW / 2;
                    p.y = owner.y + spawnWorldH - 32.53 * 1.35 * p.sizeScale;
                }
                this.projectiles.push(p);
                this.pendingCombinedProjectile = null;
                // 発射の瞬間に効果音を鳴らす
                audio.playDualBladeCombined();
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
            const centerX = player.x + ownerWorldWidth(player) / 2;
            const centerY = player.y + ownerWorldHeight(player) / 2;

            if (this.attackType === 'main') {
                const arcs = this.getMainSwingArcs();
                const frontX = player.x + (direction > 0 ? ownerWorldWidth(player) : -this.range * 1.4);
                const backX = player.x + (direction > 0 ? -this.range * 1.35 : ownerWorldWidth(player));
                const coreW = this.range * 0.75;
                if (arcs.hit === 'leftKesa') {
                    hitboxes.push({
                        x: frontX - this.range * 0.08,
                        y: player.y - 34,
                        width: this.range * 1.42,
                        height: 74
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.12,
                        y: player.y - 70,
                        width: this.range * 1.08,
                        height: 98
                    });
                } else if (arcs.hit === 'rightGyakuKesa') {
                    hitboxes.push({
                        x: frontX - this.range * 0.04,
                        y: centerY - 36,
                        width: this.range * 1.26,
                        height: 72
                    });
                    hitboxes.push({
                        x: backX - this.range * 0.5,
                        y: centerY - 48,
                        width: this.range * 1.54,
                        height: 96
                    });
                    hitboxes.push({
                        x: centerX - this.range * 0.52,
                        y: centerY - 40,
                        width: this.range * 1.04,
                        height: 84
                    });
                } else if (arcs.hit === 'crossNagi') {
                    hitboxes.push({
                        x: centerX - this.range * 0.68,
                        y: centerY - 26,
                        width: this.range * 1.86,
                        height: 74
                    });
                    hitboxes.push({
                        x: frontX - this.range * 0.12,
                        y: centerY - 44,
                        width: this.range * 1.54,
                        height: 90
                    });
                } else if (arcs.hit === 'drawDash') {
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
                    // 五段目（fallingBreak）は剣筋位置に合わせて
                    // 上弧（大きい青弧）＋下弧（赤弧）＋体幹近傍を分離して判定
                    const upperW = this.range * 1.12;
                    const upperH = this.range * 2.18;
                    const upperCenterX = centerX + direction * this.range * 1.02;
                    const upperCenterY = centerY - this.range * 0.56;
                    hitboxes.push({
                        x: upperCenterX - upperW * 0.5,
                        y: upperCenterY - upperH * 0.5,
                        width: upperW,
                        height: upperH
                    });
                    const lowerW = this.range * 1.52;
                    const lowerH = this.range * 1.2;
                    const lowerCenterX = centerX + direction * this.range * 0.38;
                    const lowerCenterY = centerY + this.range * 0.86;
                    hitboxes.push({
                        x: lowerCenterX - lowerW * 0.5,
                        y: lowerCenterY - lowerH * 0.5,
                        width: lowerW,
                        height: lowerH
                    });
                    const coreW = this.range * 0.9;
                    const coreH = this.range * 1.08;
                    hitboxes.push({
                        x: centerX - coreW * 0.5,
                        y: centerY - coreH * 0.22,
                        width: coreW,
                        height: coreH
                    });
                }
            } else {
            
                // 旧X攻撃（後方）
                if (this.attackType === 'left') {
                    if (this.comboIndex === 3) {
                        const sRange = this.range * 1.5;
                        hitboxes.push({
                            x: player.x + ownerWorldWidth(player) / 2 - sRange,
                            y: player.y + ownerWorldHeight(player) / 2 - sRange,
                            width: sRange * 2,
                            height: sRange * 2
                        });
                    } else {
                        hitboxes.push({
                            x: player.x + (direction > 0 ? -this.range * 1.2 : ownerWorldWidth(player)),
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
                            x: player.x + ownerWorldWidth(player) / 2 - sRange,
                            y: player.y + ownerWorldHeight(player) / 2 - sRange,
                            width: sRange * 2,
                            height: sRange * 2
                        });
                    } else {
                        hitboxes.push({
                            x: player.x + (direction > 0 ? ownerWorldWidth(player) : -this.range * 1.2),
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
    
    renderProjectiles(ctx) {
        // 飛翔する交差斬撃（高輝度の三日月クロス）
        for (const p of this.projectiles) {
            const lifeRatio = p.life / p.maxLife;
            const drawA = Math.pow(Math.max(0, lifeRatio), 0.65); // 消え際を粘らせる
            const sizeScale = Number.isFinite(p.sizeScale) ? p.sizeScale : 1.0;
            const dissipate = 1 + Math.pow(1 - lifeRatio, 0.6) * 0.08; // 末期ほど拡散が加速（残像が薄れる質感）
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(p.direction * 1.35 * sizeScale * dissipate, 1.35 * sizeScale * dissipate);

            const travelRatio = 1 - lifeRatio;
            const forward = travelRatio * 18;
            const crescentPath = () => {
                ctx.beginPath();
                ctx.moveTo(0, -46);
                ctx.bezierCurveTo(24, -22, 24, 22, 0, 46);
                ctx.bezierCurveTo(7, 22, 7, -22, 0, -46);
                ctx.closePath();
            };
            // stops: 刃幅方向(内側x0→外側x24)。glow: 縁のエネルギー発光色。
            const drawCrescent = (stops, glow, angle) => {
                ctx.save();
                ctx.translate(forward, 0);
                ctx.rotate(angle);
                // 本体: 多層グラデ＋縁の発光(shadow)
                ctx.globalAlpha = drawA;
                ctx.shadowColor = glow;
                ctx.shadowBlur = 13;
                const g = ctx.createLinearGradient(0, 0, 24, 0);
                stops.forEach(([o, c]) => g.addColorStop(o, c));
                ctx.fillStyle = g;
                crescentPath();
                ctx.fill();
                ctx.shadowBlur = 0;
                // 芯発光(加算で内側に細い明るい三日月)。travelとともに開花させ、末期に芯だけ輝いて消える。
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = drawA * 0.7 * (0.12 + 0.88 * smoothstep01(travelRatio));
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.beginPath();
                ctx.moveTo(0, -40);
                ctx.bezierCurveTo(16, -19, 16, 19, 0, 40);
                ctx.bezierCurveTo(9.5, 19, 9.5, -19, 0, -40);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            };

            // 近接の剣筋と色対応を揃える（奥の刀=青→上の三日月が青、手前の刀=赤→下の三日月が赤）
            drawCrescent([
                [0, 'rgba(38,118,178,0.92)'], [0.5, 'rgba(120,220,255,1)'], [1, 'rgba(224,248,255,1)']
            ], 'rgba(90,200,255,0.95)', -Math.PI / 4);
            drawCrescent([
                [0, 'rgba(150,38,38,0.92)'], [0.5, 'rgba(255,112,112,1)'], [1, 'rgba(255,234,234,1)']
            ], 'rgba(255,90,90,0.95)', Math.PI / 4);

            ctx.restore();
        }
    }

    renderWorldEffects(ctx) {
        this.renderProjectiles(ctx);
    }

    render(ctx, player) {
        const direction = this.isAttacking ? this.attackDirection : (player && player.facingRight ? 1 : -1);
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

        // 弾（飛翔斬撃）と剣筋フェードはワールド座標のスナップショット。ミラー分身の
        // モーション描画パスでは本体由来の実体を重複描画しない（分身の弾は dedicated が描く）。
        const mirrorMotionOnly = !!(player && player._renderingMirrorClone);
        if (!mirrorMotionOnly) this.renderProjectiles(ctx);

        if (!this.isAttacking) {
            this.prevMainRightAngle = null;
            this.prevMainLeftAngle = null;
            if (!mirrorMotionOnly) drawStoredMainTrailFade();
            return;
        }
        
        const isMain = this.attackType === 'main';
        const isCombined = this.attackType === 'combined';
        if (isMain) {
            // 二刀Z連撃の剣筋は playerSlashTrail.js の共通トレイルパイプラインで描画
            this.mainTrailFadeActive = false;
            return;
        }

        // 合体攻撃(X)は飛翔斬撃のみ表示（手前の剣筋は描かない）
        if (isCombined) return;

        const progress = Math.max(0, this.attackTimer / Math.max(1, this.sideDuration || 150));
        const centerX = player.x + ownerWorldWidth(player) / 2;
        const centerY = player.y + ownerWorldHeight(player) / 2;
        
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

            // 中間グロー層(加算): Z剣筋(playerSlashTrail)と同じ「色→発光→白芯」の三層構造に揃える
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `${baseColorPrefix}, ${(slashAlpha * 0.4).toFixed(3)})`;
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.arc(-5, 0, this.range + 9, -0.70, 0.70);
            ctx.stroke();
            ctx.restore();

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
        this.orbitBackAngle = -Math.PI * 0.99; // 行きすぎたので中間へ戻す
        // 軌跡(彗星リボン)用: 刃先の実座標を毎フレーム記録し、経年でフェードさせる
        this.trailPoints = [];
        this.trailMaxAgeMs = 155;
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
        this.trailPoints = [];
        const init = this.getMotionState(player);
        this.tipX = init.tipX;
        this.tipY = init.tipY;
        this._hasPlayedThrowSound = false;
        // audio.playDash(); // 投擲の瞬間に鳴らすためここではコメントアウト

        // 分身連動
        if (player && typeof player.getSubWeaponCloneOffsets === 'function') {
            player.getSubWeaponCloneOffsets().forEach(c => player.triggerCloneSubWeapon(c.index));
        }
    }

    getMotionState(player, progressOverride, skipVelocity) {
        const direction = this.attackDirection;
        const progress = (progressOverride != null)
            ? Math.max(0, Math.min(1, progressOverride))
            : Math.max(0, Math.min(1, 1 - (this.attackTimer / this.totalDuration)));
        // 将軍など scaleMultiplier が 1 超のキャラクターでは肩位置もスケール済みワールド座標で計算する
        const ownerScale = (player && Number.isFinite(player.scaleMultiplier) && player.scaleMultiplier > 0)
            ? player.scaleMultiplier : 1;
        const centerX = player.x + ownerWorldWidth(player) / 2;
        const shoulderX = centerX - direction * 3 * ownerScale;
        const shoulderY = player.y + 17 * ownerScale; // player.js の pivotY (idle想定) に合わせる

        const effectiveRange = ownerModelRange(this.range, player);
        const ORBIT_HAND_REACH = 20.2;
        let radius = 0;
        let angle = 0;
        let phase = 'windup';
        let phaseT = 0;
        let tension = 1;
        let handX = shoulderX;
        let handY = shoulderY;

        if (progress < this.windupEnd) {
            phase = 'windup';
            phaseT = progress / Math.max(0.001, this.windupEnd);
            const ease = phaseT * phaseT * (3 - 2 * phaseT);
            const localX = 5.8 + (-17.2 - 5.8) * ease;
            const localY = 1.6 + (-15.2 - 1.6) * ease;
            // 振りかぶり中は鎖をほぼ伸ばさない
            radius = effectiveRange * this.rangeScale * (0.006 + 0.006 * ease);
            // throw 開始角(0=前方)へ繋げ、刃の向き(=chainHeading)が境界で跳ねないようにする
            angle = -0.72 + ease * 0.72;
            handX = shoulderX + direction * localX;
            handY = shoulderY + localY;
            tension = 0.06 + ease * 0.04;
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
            handX = shoulderX + direction * localX;
            handY = shoulderY + localY;
            const radiusEase = 1 - Math.pow(1 - throwT, 2.5);
            radius = effectiveRange * this.rangeScale * (0.015 + 0.985 * radiusEase);
            // 投擲は伸び切るまで終始「地面と水平」にまっすぐ前方へ伸ばす（角度0で固定）。
            // 以前は中盤に微小な鞭のしなり(-0.03rad)を入れていたが、伸び切る前に鎖が斜め上に
            // 見えるため除去。後方への扇形回転は orbit フェーズで行う。
            angle = 0;
            tension = 0.1 + radiusEase * 0.9;
        } else if (progress < this.orbitEnd) {
            phase = 'orbit';
            phaseT = (progress - this.extendEnd) / (this.orbitEnd - this.extendEnd);
            radius = effectiveRange * this.rangeScale;
            // 水平に投げ放った後、遠心力を感じるようゆっくり後方へ回し始める
            const eased = Math.pow(phaseT, 1.22);
            angle = this.orbitBackAngle * eased; // 開始 0（水平）→ 終点は後方
            // 手元(グリップ)を肩から「鎖の方向」へ armReach 伸ばし、腕と鎖を一直線に保つ
            // （腕が鎖の振れ角に追従する）。throw 終端の手元から序盤15%で滑らかに移行。
            const armReach = 20;
            const cdx = direction * Math.cos(angle), cdy = Math.sin(angle);
            const followX = shoulderX + cdx * armReach;
            const followY = shoulderY + cdy * armReach;
            const teX = shoulderX + direction * 18.4, teY = shoulderY + 9.4; // throw終端の手元
            const bt = Math.min(1, phaseT / 0.15); const b = bt * bt * (3 - 2 * bt);
            handX = teX + (followX - teX) * b;
            handY = teY + (followY - teY) * b;
            tension = 1.0;
        } else {
            phase = 'retract';
            phaseT = (progress - this.orbitEnd) / (1 - this.orbitEnd);
            const eased = 0.5 - Math.cos(phaseT * Math.PI) * 0.5;
            // 鎖は前半(〜0.6)でほぼ手元まで巻き取る。後半は手元で畳まれ render 側でフェードアウト。
            const rt = Math.min(1, phaseT / 0.6); const reel = rt * rt * (3 - 2 * rt);
            radius = effectiveRange * this.rangeScale * (1 - reel * 0.94);
            const startAngle = this.orbitBackAngle;
            const endAngle = -Math.PI * 0.08;
            angle = startAngle + (endAngle - startAngle) * eased;
            // 手元は鎖方向へ伸ばし続け(腕が鎖に追従)、終わりに「腕を下ろしたリラックス位置」(アイドル相当)へ収束。
            // → 最後のコマがアイドルとほぼ一致し、復帰時のスナップを抑える。
            const armReach = 20;
            const cdx = direction * Math.cos(angle), cdy = Math.sin(angle);
            const followX = shoulderX + cdx * armReach;
            const followY = shoulderY + cdy * armReach;
            const toX = shoulderX + direction * 8.0;
            const toY = shoulderY + 11.0; // 体側へ下ろす
            handX = followX + (toX - followX) * eased;
            handY = followY + (toY - followY) * eased;
            tension = 0.82 + (1 - phaseT) * 0.18;
        }

        const chainDirX = direction * Math.cos(angle);
        const chainDirY = Math.sin(angle);
        const chainHeading = Math.atan2(chainDirY, chainDirX);
        const tipX = handX + chainDirX * radius;
        const tipY = handY + chainDirY * radius;

        const state = {
            handX, handY, tipX, tipY, radius, angle, progress, direction,
            phase, phaseT, tension, chainDirX, chainDirY, chainHeading
        };
        // 鎌の向きは getSickleGeometry がフェーズ毎に解析的に決める（速度の数値微分は低速時に暴れるため不使用）。
        return state;
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

    getChainCurveControl(state) {
        const chainDx = state.tipX - state.handX;
        const chainDy = state.tipY - state.handY;
        const chainLen = Math.max(0.001, Math.hypot(chainDx, chainDy));
        const chainNx = -chainDy / chainLen;
        const chainNy = chainDx / chainLen;
        const chainTension = Number.isFinite(state.tension) ? Math.max(0, Math.min(1, state.tension)) : 1;
        const throwPhase = state.phase === 'throw';
        const slackScale = throwPhase ? 0.42 : 1.0;
        const slackBase = (1 - chainTension) * (10 + Math.min(8, chainLen * 0.05)) * slackScale;
        const midX = (state.handX + state.tipX) * 0.5;
        const midY = (state.handY + state.tipY) * 0.5;
        return {
            chainLen,
            chainNx,
            chainNy,
            chainTension,
            throwPhase,
            ctrlX: midX - state.chainDirX * (chainLen * 0.1) + chainNx * (slackBase * (throwPhase ? 0.18 : 0.48)),
            ctrlY: midY
                - state.chainDirY * (chainLen * 0.1)
                + chainNy * (slackBase * (throwPhase ? 0.08 : 0.24))
                + slackBase * (throwPhase ? 0.24 : 0.62)
        };
    }

    sampleChainPoint(state, curve, t) {
        const tt = Math.max(0, Math.min(1, t));
        const inv = 1 - tt;
        return {
            x: inv * inv * state.handX + 2 * inv * tt * curve.ctrlX + tt * tt * state.tipX,
            y: inv * inv * state.handY + 2 * inv * tt * curve.ctrlY + tt * tt * state.tipY
        };
    }

    createCircleHitbox(cx, cy, radius, part) {
        return {
            x: cx - radius,
            y: cy - radius,
            width: radius * 2,
            height: radius * 2,
            shape: 'circle',
            cx,
            cy,
            radius,
            part
        };
    }

    createCapsuleHitbox(ax, ay, bx, by, radius, part) {
        return {
            x: Math.min(ax, bx) - radius,
            y: Math.min(ay, by) - radius,
            width: Math.max(8, Math.abs(bx - ax) + radius * 2),
            height: Math.max(8, Math.abs(by - ay) + radius * 2),
            shape: 'capsule',
            ax,
            ay,
            bx,
            by,
            radius,
            part
        };
    }

    getSickleGeometry(state) {
        // L字鎖鎌: 柄を「鎖方向(chainHeading)」に沿わせる。原点(tipX)=肘=刃の付け根。
        // 柄は手元側(-X=chainの内向き)へ伸び、柄尻の鎖環は -X 端。刃は肘から局所 -Y へ直角に湾曲。
        // → 柄が放射方向に並ぶので、orbit では刃(直角=-Y)が自動的に接線(進行方向)を向く。
        //   速度の数値微分を使わないので投げ始めの溜めでも刃先がフラつかない。
        const rotation = state.chainHeading;
        // 左右の振り向きで刃の腹(切刃)が外周側を向くよう、刃形状を上下反転(描画は ctx.scale(1,-1))。
        const flipBlade = state.direction < 0;
        const ownerScale = (state.ownerScale && state.ownerScale > 0) ? state.ownerScale : 1;
        const cos = Math.cos(rotation), sin = Math.sin(rotation);
        // 柄尻の鎖環(分銅) ローカル(-HANDLE_LEN, 0) → ワールド。鎖はここへ繋ぐ。
        const HANDLE_LEN = 18 * ownerScale;
        const ringX = state.tipX + (-HANDLE_LEN) * cos;
        const ringY = state.tipY + (-HANDLE_LEN) * sin;
        // 刃の切先 ローカル(-5, -18.5)(flipでY反転) → ワールド。軌跡/判定はこの点を刃先とする。
        const btx = -5 * ownerScale;
        const bty = (flipBlade ? 18.5 : -18.5) * ownerScale;
        const bladeTipX = state.tipX + (btx * cos - bty * sin);
        const bladeTipY = state.tipY + (btx * sin + bty * cos);
        const reach = 18 * ownerScale; // 互換(肘から刃先までの目安)
        return { rotation, flipBlade, reach, ringX, ringY, bladeTipX, bladeTipY };
    }
    
    update(deltaTime) {
        if (!this.isAttacking) return;

        // タイマーを先に進めてから状態を計算する。
        // こうすると update が記録する刃先位置と、直後の render が描く鎌が同じ progress になり、
        // 軌跡の頭が刃先からズレない（1フレーム遅れの解消）。
        this.attackTimer -= deltaTime * 1000;
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.tipX = null;
            this.tipY = null;
            this.echoHitEnemies.clear();
            this.trailPoints = [];
            return;
        }

        if (this.owner) {
            const st = this.getMotionState(this.owner);
            // 先端位置は常に円弧式から直接決定（直線ドリフトを防止）
            this.tipX = st.tipX;
            this.tipY = st.tipY;

            // 軌跡(彗星リボン): 刃先(切先)の world 座標を毎フレーム1回だけ記録する。
            // （render 側で記録するとクローン/ゴーストの多重描画で汚染されるため update に置く）
            this.recordTrail(st, deltaTime);

            // 投擲開始の瞬間に音を鳴らす (holdが終わって鎖が伸び始める瞬間)
            if (!this._hasPlayedThrowSound && st.phase === 'throw') {
                const throwRaw = (st.progress - this.windupEnd) / Math.max(0.001, (this.extendEnd - this.windupEnd));
                const holdRatio = Math.max(0.28, Math.min(0.62, (this.throwHoldRatio || 0) + 0.24));
                if (throwRaw >= holdRatio) {
                    audio.playDash();
                    this._hasPlayedThrowSound = true;
                }
            }
        }
    }

    // 刃先(切先)の world 座標を履歴に積み、経年(ms)で減衰させる。
    // update から毎フレーム1回呼ぶ。記録は「扇回転(orbit)」中だけ
    // （まっすぐ伸ばす throw/振りかぶり/収納では積まない。retract 中は既存点が経年で自然消滅）。
    recordTrail(st, deltaTime) {
        if (!Array.isArray(this.trailPoints)) this.trailPoints = [];
        const dtMs = Math.max(0, deltaTime * 1000);
        for (const pt of this.trailPoints) pt.age += dtMs;
        const maxAge = this.trailMaxAgeMs;
        if (this.trailPoints.length && this.trailPoints[0].age > maxAge) {
            this.trailPoints = this.trailPoints.filter(pt => pt.age <= maxAge);
        }
        if (st.phase !== 'orbit' || st.radius < 38) return;
        const ownerScale = (this.owner && Number.isFinite(this.owner.scaleMultiplier) && this.owner.scaleMultiplier > 0)
            ? this.owner.scaleMultiplier : 1;
        const sk = this.getSickleGeometry(Object.assign({}, st, { ownerScale }));
        const bx = sk.bladeTipX; // L字刃の切先(直角に湾曲した刃の先端)
        const by = sk.bladeTipY;
        const last = this.trailPoints[this.trailPoints.length - 1];
        if (last && Math.hypot(bx - last.x, by - last.y) < 1.5 * ownerScale) return;
        this.trailPoints.push({ x: bx, y: by, age: 0 });
        if (this.trailPoints.length > 64) this.trailPoints.shift();
    }

    getHitbox(player) {
        if (!this.isAttacking) return null;

        // 将軍など scaleMultiplier > 1 のキャラはヒットボックスもスケールする
        const ownerScale = (player && Number.isFinite(player.scaleMultiplier) && player.scaleMultiplier > 0)
            ? player.scaleMultiplier : 1;
        const st = this.getRenderState(player);
        // ownerScale を state に追加して getSickleGeometry が参照できるようにする
        st.ownerScale = ownerScale;
        if (st.radius < 16) return null;
        const sickle = this.getSickleGeometry(st);
        // L字刃: 肘(tipX=刃の付け根)から直角に湾曲した刃の切先(bladeTip)までをカプセル判定にする。
        const sickleTipX = sickle.bladeTipX;
        const sickleTipY = sickle.bladeTipY;
        const bladeRootX = st.tipX;
        const bladeRootY = st.tipY;
        const tipRadius = 8.8 * ownerScale;
        const tipHitbox = this.createCapsuleHitbox(bladeRootX, bladeRootY, sickleTipX, sickleTipY, tipRadius, 'tip');
        const hitboxes = [tipHitbox];
        const shouldHitWithChain = st.phase === 'orbit' || st.phase === 'retract' || (st.phase === 'throw' && st.phaseT >= 0.72);
        if (shouldHitWithChain) {
            const curve = this.getChainCurveControl(st);
            const chainRadius = (st.phase === 'orbit' ? 3.4 : 3.1) * ownerScale;
            const chainLinks = Math.max(8, Math.min(24, Math.round(curve.chainLen / 13)));
            let prev = null;
            for (let i = 1; i < chainLinks; i++) {
                const t = i / chainLinks;
                const point = this.sampleChainPoint(st, curve, t);
                hitboxes.push(this.createCircleHitbox(point.x, point.y, chainRadius, 'chain'));
                if (prev) {
                    hitboxes.push(this.createCapsuleHitbox(prev.x, prev.y, point.x, point.y, chainRadius * 0.7, 'chain'));
                }
                prev = point;
            }
        }
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
    
    // layer: 'all'(既定) | 'behind'(軌跡＋鎖=手の背面) | 'front'(鎌ヘッド=手の前面)
    // renderModel から behind→drawHand→front の順で呼べば、刃先が掌(手)の前に出る。
    render(ctx, player, layer = 'all') {
        if (!this.isAttacking && (!player || !player.forceSubWeaponRender)) return;

        const st = this.getRenderState(player);
        if (st.radius < 4) return;

        const doBehind = layer === 'all' || layer === 'behind';
        const doFront = layer === 'all' || layer === 'front';

        ctx.save();

        // retract 後半で鎖・鎌・軌跡をフェードアウトさせ、アイドル復帰時に「パッと消える」のを防ぐ。
        // (鎖は前半で手元へ巻き取り済みなので、フェードは手元付近で起こる)
        let phaseFade = 1;
        if (st.phase === 'retract') {
            const ft = (st.phaseT - 0.55) / 0.45;
            phaseFade = ft <= 0 ? 1 : (ft >= 1 ? 0 : 1 - ft);
        }
        if (phaseFade <= 0.001) { ctx.restore(); return; }
        ctx.globalAlpha *= phaseFade;

        // 軌跡(彗星リボン)は背面レイヤー。刃先が通った経路を頭=太く明るく / 尾=細く透明にフェード。
        if (doBehind) {
            this.renderTrail(ctx);
        }

        // 鎖・鎌は前面レイヤー(頭/手より前)。鎖が頭の後ろへ回り込んで隠れるのを防ぐ。
        if (doFront) {
        // 鎖の終端は柄尻の鎖環（getSickleGeometry が算出）に繋ぐ。
        const _sg = this.getSickleGeometry(st);
        const ringX = _sg.ringX;
        const ringY = _sg.ringY;
        const _cdx = ringX - st.handX, _cdy = ringY - st.handY;
        const _clen = Math.hypot(_cdx, _cdy) || 1;
        const chainSt = Object.assign({}, st, {
            tipX: ringX, tipY: ringY, chainDirX: _cdx / _clen, chainDirY: _cdy / _clen
        });

        // 鎖（投擲前半はたるみ、加速とともに張る）
        const chainGradient = ctx.createLinearGradient(chainSt.handX, chainSt.handY, chainSt.tipX, chainSt.tipY);
        chainGradient.addColorStop(0, 'rgba(170, 176, 188, 0.95)');
        chainGradient.addColorStop(0.55, 'rgba(128, 136, 150, 0.98)');
        chainGradient.addColorStop(1, 'rgba(92, 102, 118, 0.95)');
        const curve = this.getChainCurveControl(chainSt);
        ctx.lineDashOffset = -st.progress * 150; // 鎖が動いているような視覚効果
        ctx.strokeStyle = chainGradient;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(chainSt.handX, chainSt.handY);
        ctx.quadraticCurveTo(curve.ctrlX, curve.ctrlY, chainSt.tipX, chainSt.tipY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(230, 245, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chainSt.handX + chainSt.chainDirY * 1.4, chainSt.handY - chainSt.chainDirX * 1.4);
        ctx.quadraticCurveTo(
            curve.ctrlX + chainSt.chainDirY * 1.4,
            curve.ctrlY - chainSt.chainDirX * 1.4,
            chainSt.tipX + chainSt.chainDirY * 1.4,
            chainSt.tipY - chainSt.chainDirX * 1.4
        );
        ctx.stroke();

        // 鎖コマを等間隔で描いて、金属鎖らしい実体感を出す
        const chainLinks = Math.max(8, Math.min(24, Math.round(curve.chainLen / 13)));
        ctx.fillStyle = 'rgba(106, 114, 128, 0.95)';
        ctx.strokeStyle = 'rgba(220, 230, 244, 0.46)';
        ctx.lineWidth = 0.7;
        for (let i = 1; i < chainLinks; i++) {
            const t = i / chainLinks;
            const inv = 1 - t;
            const px = inv * inv * chainSt.handX + 2 * inv * t * curve.ctrlX + t * t * chainSt.tipX;
            const py = inv * inv * chainSt.handY + 2 * inv * t * curve.ctrlY + t * t * chainSt.tipY;
            const tx = 2 * inv * (curve.ctrlX - chainSt.handX) + 2 * t * (chainSt.tipX - curve.ctrlX);
            const ty = 2 * inv * (curve.ctrlY - chainSt.handY) + 2 * t * (chainSt.tipY - curve.ctrlY);
            const angle = Math.atan2(ty, tx);
            const linkR = 1.25 + (1 - curve.chainTension) * 0.35;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.ellipse(0, 0, linkR * 1.25, linkR * 0.78, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

            // 鎌ヘッド（高品質描画）
            ctx.save();
            ctx.translate(st.tipX, st.tipY);
            const sickle = this.getSickleGeometry(st);
            ctx.rotate(sickle.rotation);
            // 左向き時は刃の腹(刃側)が外周を向くよう上下反転
            if (sickle.flipBlade) ctx.scale(1, -1);
            this.drawSickleHead(ctx);
            ctx.restore();
        } // end doFront

        ctx.restore();
    }

    // 鎌ヘッドを描く（呼び出し側で tip(=肘/刃の付け根) へ translate / rotation / flip 済み）。
    // L字構造: 柄は局所X軸（手元側 -X に柄尻の鎖環）、刃は肘(原点)から局所 -Y へ「直角」に立ち上がり湾曲する(実物準拠)。
    drawSickleHead(ctx) {
        const HL = 18; // 柄長: 肘(原点) → 柄尻(-HL,0)。柄は手元側(-X)へ伸びる。
        // 刃: 肘(0,0)から -Y(柄に直角)へ立ち上がり、切先は柄側(-X)へ反る三日月。
        const bladeOutline = () => {
            ctx.beginPath();
            ctx.moveTo(2.6, 0.4);                            // 付け根(背側/外角)
            ctx.quadraticCurveTo(3.4, -10.5, -1.8, -18.6);   // 棟(背, 外カーブ)→切先方向
            ctx.quadraticCurveTo(-4.6, -20.8, -5.8, -18.0);  // 切先(柄側へ反る)
            ctx.quadraticCurveTo(-3.8, -9.0, -1.3, -0.9);    // 刃(belly=切刃, 内カーブ)→付け根
            ctx.quadraticCurveTo(0.4, 0.0, 2.6, 0.4);
            ctx.closePath();
        };

        // --- 落ち影（背景から浮かせる）---
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 2.6; ctx.shadowOffsetX = 0.9; ctx.shadowOffsetY = 1.5;
        bladeOutline();
        ctx.fillStyle = 'rgba(18,22,28,0.9)';
        ctx.fill();
        ctx.restore(); // 影リセット必須

        // === 柄尻の鎖環（分銅）: 手元側 (-HL,0)。鎖はここへ繋がる。===
        if (!this._gradWeight) {
            this._gradWeight = ctx.createRadialGradient(-HL - 1, -1, 0.3, -HL, 0.6, 4.4);
            this._gradWeight.addColorStop(0, '#b8c0cc');
            this._gradWeight.addColorStop(0.5, '#5d6776');
            this._gradWeight.addColorStop(1, '#202530');
        }
        ctx.fillStyle = this._gradWeight;
        ctx.beginPath(); ctx.arc(-HL, 0, 2.9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(8,10,14,0.75)'; ctx.lineWidth = 0.55; ctx.stroke();
        ctx.fillStyle = 'rgba(8,10,14,0.88)';
        ctx.beginPath(); ctx.arc(-HL, 0, 1.05, 0, Math.PI * 2); ctx.fill(); // 環の穴
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(-HL - 1, -1, 0.65, 0, Math.PI * 2); ctx.fill();

        // === 柄（木+柄巻）: 局所X (-HL+1.4)..(-0.5) ===
        if (!this._gradHandle) {
            this._gradHandle = ctx.createLinearGradient(0, -2.6, 0, 2.6);
            this._gradHandle.addColorStop(0, '#6a4a2c');
            this._gradHandle.addColorStop(0.5, '#3c2917');
            this._gradHandle.addColorStop(1, '#20150b');
        }
        const gx0 = -HL + 1.4, gx1 = -0.5, gh = 2.5;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(gx0, -gh + 0.6); ctx.lineTo(gx1, -gh + 0.2);
        ctx.lineTo(gx1, gh - 0.2); ctx.lineTo(gx0, gh - 0.6);
        ctx.quadraticCurveTo(gx0 - 1.2, 0, gx0, -gh + 0.6);
        ctx.closePath();
        ctx.fillStyle = this._gradHandle; ctx.fill(); ctx.clip();
        ctx.strokeStyle = 'rgba(255,226,182,0.10)'; ctx.lineWidth = 0.32;
        for (let gy = -1.6; gy <= 1.6; gy += 0.8) { ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(12,7,3,0.6)'; ctx.lineWidth = 0.95;
        for (let wx = gx0 + 0.6; wx < gx1 - 0.4; wx += 2.0) {
            ctx.beginPath(); ctx.moveTo(wx, -gh); ctx.lineTo(wx + 1.7, gh); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(wx + 1.7, -gh); ctx.lineTo(wx, gh); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,228,180,0.14)'; ctx.lineWidth = 0.4;
        for (let wx = gx0 + 0.6; wx < gx1 - 0.4; wx += 2.0) { ctx.beginPath(); ctx.moveTo(wx - 0.3, -gh); ctx.lineTo(wx + 1.4, gh); ctx.stroke(); }
        ctx.restore();

        // === 口金（肘の継ぎ目: 柄と刃の付け根）===
        if (!this._gradFerrule) {
            this._gradFerrule = ctx.createLinearGradient(0, -3.2, 0, 3.2);
            this._gradFerrule.addColorStop(0, '#e6d39a');
            this._gradFerrule.addColorStop(0.5, '#ab8c43');
            this._gradFerrule.addColorStop(1, '#5a421a');
        }
        ctx.fillStyle = this._gradFerrule;
        ctx.beginPath();
        ctx.moveTo(-2.4, -2.9); ctx.lineTo(2.9, -2.6);
        ctx.lineTo(2.9, 2.8); ctx.lineTo(-2.4, 2.7);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(40,28,8,0.65)'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = '#36280f'; ctx.beginPath(); ctx.arc(0.4, 0.4, 0.72, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,236,184,0.55)'; ctx.beginPath(); ctx.arc(0.15, 0.1, 0.3, 0, Math.PI * 2); ctx.fill();

        // === 刃本体 ===
        if (!this._gradBlade) {
            this._gradBlade = ctx.createLinearGradient(3, -1, -7, -19);
            this._gradBlade.addColorStop(0, '#454f5e');
            this._gradBlade.addColorStop(0.22, '#6c7889');
            this._gradBlade.addColorStop(0.5, '#9fabba');
            this._gradBlade.addColorStop(0.82, '#d6dee8');
            this._gradBlade.addColorStop(1, '#f7fafe');
        }
        bladeOutline();
        ctx.fillStyle = this._gradBlade;
        ctx.fill();

        // 棟(背)陰影＋鎬＋刃文（刃の内側にクリップ）
        ctx.save();
        bladeOutline(); ctx.clip();
        if (!this._gradSpine) {
            // 背(外角=+X側)を暗く、刃(belly=-X側)を明るく
            this._gradSpine = ctx.createLinearGradient(3.5, 0, -6, -18);
            this._gradSpine.addColorStop(0, 'rgba(34,42,54,0.80)');
            this._gradSpine.addColorStop(0.5, 'rgba(50,60,76,0.22)');
            this._gradSpine.addColorStop(1, 'rgba(60,70,86,0)');
        }
        ctx.fillStyle = this._gradSpine;
        bladeOutline(); ctx.fill();
        // 鎬(しのぎ)ライン
        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(1.4, -1.0); ctx.quadraticCurveTo(-0.6, -10, -4.0, -17.8);
        ctx.stroke();
        // 刃文(はもん): 切刃(belly)沿いの白い波
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(-1.0, -1.0);
        for (let s = 0; s <= 1.0001; s += 0.12) {
            const x = -1.0 + (-5.2 - (-1.0)) * s;
            const y = -1.0 + (-17.6 - (-1.0)) * s + Math.sin(s * 7) * 0.4;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        // 切刃(belly)の明るい縁
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-1.3, -0.9); ctx.quadraticCurveTo(-3.8, -9.0, -5.7, -17.8);
        ctx.stroke();

        // 全体輪郭
        bladeOutline();
        ctx.strokeStyle = 'rgba(28,34,44,0.92)';
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // 切先グリント
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(-5.4, -18.8, 0.8, 0, Math.PI * 2); ctx.fill();
    }

    // 軌跡(彗星リボン)を刃先の通過履歴(update で world 座標蓄積)から滑らかにフェード描画する。
    // ・将軍など _inRenderModel 中は ctx.scale(scaleMultiplier) 済みなので、その素体スケールを
    //   打ち消して world(camera) 空間で描く（軌跡が遥か彼方へ飛ぶのを防ぐ）。
    // ・点を直線で繋がず中点経由の二次ベジェで連続曲線化（「点(ビーズ)」化防止）。
    // ・頭(刃先)側を太く・尾を幅0へ先細り。記録末尾＝現在の刃先なので頭は刃先に一致する。
    renderTrail(ctx) {
        const pts = this.trailPoints;
        if (!pts || pts.length < 3) return;
        const N = pts.length;
        const owner = this.owner;
        const tier = this.enhanceTier || 0;
        const maxAge = this.trailMaxAgeMs;

        // --- 描画空間を world(camera) へ揃えるための素体スケール変換 ---
        const xf = owner && owner._renderModelScaleTransform;
        const ownerScale = (owner && Number.isFinite(owner.scaleMultiplier) && owner.scaleMultiplier > 0)
            ? owner.scaleMultiplier : 1;
        // 拡大表示中(_inRenderModel & scale>1)なのに打ち消し用変換が無い場合は、
        // world 座標を ctx.scale 済み空間でそのまま描くと遥か彼方へ飛ぶので描画しない
        // （例: 変換を公開しない分身owner）。
        if (owner && owner._inRenderModel && ownerScale > 1.001 && !xf) return;
        const scale = (xf && Number.isFinite(xf.scale) && xf.scale > 0) ? xf.scale : 1;
        const pivotX = xf ? xf.pivotX : 0;
        const pivotY = xf ? xf.pivotY : 0;
        const useUndo = !!(owner && owner._inRenderModel && Math.abs(scale - 1) > 0.001);

        const baseColor = tier >= 3 ? '255, 198, 150' : '150, 228, 255';
        const edgeColor = tier >= 3 ? '255, 240, 214' : '226, 250, 255';
        const headHalf = (tier >= 2 ? 7.5 : 6.0) * scale; // 頭(刃先)側の半幅(world)

        // 新しさ(0=尾..1=頭)
        const newness = pts.map(p => 1 - Math.min(1, p.age / maxAge));
        // 各点の法線（前後点の接線を直交化）
        const nrm = [];
        for (let i = 0; i < N; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
            let tx = b.x - a.x, ty = b.y - a.y;
            const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
            nrm.push({ x: -ty, y: tx });
        }
        // 幅プロファイル: 両端を点へ収束させて四角いキャップを無くす。
        // ・尾(i=0)…経年(newness)に加え末尾位置でも0へ(序盤は全点が若く newness が高いため)。
        // ・頭(i=N-1=現在の刃先)…刃先へ向け点に収束させ、鎌の脇から満幅キャップがはみ出すのを防ぐ。
        const denom = Math.max(1, N - 1);
        const tailTaper = i => Math.sqrt(i / denom);            // 尾(i=0)=0 → 1
        const headFrac = i => ((N - 1) - i) / denom;            // 頭=0 → 尾=1
        const headTaper = i => Math.min(1, headFrac(i) / 0.22); // 頭側~22%を点へ収束
        const halfW = i => headHalf * newness[i] * tailTaper(i) * headTaper(i);
        const upper = pts.map((p, i) => ({ x: p.x + nrm[i].x * halfW(i), y: p.y + nrm[i].y * halfW(i) }));
        const lower = pts.map((p, i) => ({ x: p.x - nrm[i].x * halfW(i), y: p.y - nrm[i].y * halfW(i) }));

        // 中点経由の二次ベジェで配列を「追記」する（moveTo しない＝サブパス分裂による直線弦を防ぐ）
        const appendSmooth = (arr) => {
            for (let i = 1; i < arr.length - 1; i++) {
                const mx = (arr[i].x + arr[i + 1].x) * 0.5;
                const my = (arr[i].y + arr[i + 1].y) * 0.5;
                ctx.quadraticCurveTo(arr[i].x, arr[i].y, mx, my);
            }
            ctx.lineTo(arr[arr.length - 1].x, arr[arr.length - 1].y);
        };

        const tail = pts[0], head = pts[N - 1];

        ctx.save();
        // 素体スケールを打ち消して world(camera) 空間で描く
        if (useUndo) {
            ctx.translate(pivotX, pivotY);
            ctx.scale(1 / scale, 1 / scale);
            ctx.translate(-pivotX, -pivotY);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // 帯本体（先細りリボン＝1本の連続サブパスで塗る。尾→頭でα勾配）
        const fill = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        fill.addColorStop(0.0, `rgba(${baseColor}, 0)`);
        fill.addColorStop(1.0, `rgba(${baseColor}, 0.42)`);
        ctx.beginPath();
        ctx.moveTo(upper[0].x, upper[0].y);
        appendSmooth(upper);                          // 上エッジ(尾→頭)
        ctx.lineTo(lower[N - 1].x, lower[N - 1].y);     // 頭で折り返し
        appendSmooth(lower.slice().reverse());        // 下エッジ(頭→尾)
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        // 芯（明るい滑らかな曲線。尾→頭でα勾配）
        const core = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        core.addColorStop(0.0, `rgba(${edgeColor}, 0)`);
        core.addColorStop(1.0, `rgba(${edgeColor}, 0.72)`);
        ctx.strokeStyle = core;
        ctx.lineWidth = Math.max(1, 1.7 * scale);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        appendSmooth(pts);
        ctx.stroke();

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
        this.baseFadeOutDuration = 350;
        this.fadeOutDuration = this.baseFadeOutDuration;
        this.fadeOutTimer = 0;
        this.lastPlantedPose = null;
        this.impactSoundPlayed = false; // 着地爆発音の重複防止
        this.lastPlantedWorldX = null;
        this.lastPlantedWorldY = null;
        this.lastPlantedWorldDirection = 1;
        this.lastPlantedWorldRotation = 0;
        this.lastPlantedWorldScale = 1.0;
    }

    applyEnhanceTier(tier) {
        super.applyEnhanceTier(tier);
        
        const damages = [34, 40, 43, 46];
        const cooldowns = [580, 565, 550, 535];
        // 将軍用の独自遅延を撤廃し、忍者と同一の軽快なモーション速度に同期（もっさり感の解消）
        // 将軍は見た目スケール分だけ相対補正し、忍者側のtier差分をそのまま踏襲する。
        const shogunCooldowns = cooldowns.map((cooldown) => Math.round(cooldown * Math.sqrt(SHOGUN_SCALE)));
        const jumps = [-22, -26, -28, -30];

        this.damage = damages[this.enhanceTier] || damages[0];
        // 待機時間を撤廃し、モーション時間自体をCDとする
        this.cooldown = this.isShogunOdachi
            ? (shogunCooldowns[this.enhanceTier] || shogunCooldowns[0])
            : (cooldowns[this.enhanceTier] || cooldowns[0]);
        this.totalDuration = this.cooldown;
        this.odachiJumpVy = jumps[this.enhanceTier] || jumps[0];

        this.impactStart = Math.max(0.78, this.baseImpactStart - this.enhanceTier * 0.025);
        this.plantedDuration = Math.round(this.basePlantedDuration * (1 + this.enhanceTier * 0.12));
        this.fadeOutDuration = this.baseFadeOutDuration;
    }
    
    use(player) {
        this.isAttacking = true;
        this.owner = player;
        this.attackTimer = this.totalDuration;
        this.hasImpacted = false;
        this.impactFlashTimer = 0;
        this.plantedTimer = 0;
        this.fadeOutTimer = 0;
        this.lastPlantedPose = null;
        this.impactSoundPlayed = false;
        this.groundWaves = [];
        this.impactDebris = [];
        this.impactFrozen = null; // 前回の着地位置をリセット（2回目以降で古い位置が使い回されるのを防ぐ）
        this.impactX = null;
        this._prevDrawnTipY = null; // 接地の1フレーム先読み用
        this.lastPlantedWorldX = null;
        this.lastPlantedWorldY = null;
        this.lastPlantedWorldDirection = 1;
        this.lastPlantedWorldRotation = 0;
        this.lastPlantedWorldScale = 1.0;
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

    getBladeMetrics() {
        // HUDイラストの比率（太身だが長く伸びる約5:1の刀身）を描画・接地・判定で共有する。
        // bladeEnd を一か所に集約し、見た目だけが地面や当たり判定からはみ出す状態を防ぐ。
        return {
            bladeStart: 20,
            bladeEnd: this.range + 48,
            halfWidth: 10.5,
            hitThickness: 22
        };
    }

    // 着地後の「刺さり状態」かどうか
    isPlanted() {
        return this.hasImpacted && this.plantedTimer > 0;
    }

    getPose(player) {
        // 常に1.0倍基準（等倍空間、_inRenderModel = true 相当）でポーズ計算と地面クランプを行う
        const prevIRM = player ? player._inRenderModel : undefined;
        if (player) {
            player._inRenderModel = true;
        }

        try {
            const direction = this.isAttacking ? this.attackDirection : (player.facingRight ? 1 : -1);
            const progress = this.isAttacking ? this.getProgress() : 0;
            const centerX = player.x + ownerWorldWidth(player) / 2;
            let rotation = -Math.PI * 0.5;
            let phase = 'rise';
            let flipT = 0;

            // 刀身の長さ（描画・接地・判定で共通）
            const bladeEnd = this.getBladeMetrics().bladeEnd;

            // --- 地面判定の基準 ---
            // _worldGroundY が利用可能な場合はワールド座標のgroundYを使用する
            // （actor.groundY はactor座標系で通常描画用、大太刀はワールド座標が必要）
            const baseGroundY = Number.isFinite(player._worldGroundY) ? player._worldGroundY : player.groundY;
            const rawMaxTipY = baseGroundY + LANE_OFFSET;
            
            // --- 描画スケール補正 ---
            // renderModel は originalH * 0.62 を pivot にして scale する。
            // _scalePivotH が渡されている場合はそれを使用（drawH * 0.62 ではなく originalH * 0.62）
            const scale = player.scaleMultiplier || 1.0;
            let maxTipY = rawMaxTipY;
            if (Math.abs(scale - 1.0) > 0.001) {
                const pivotH = Number.isFinite(player._scalePivotH) ? player._scalePivotH : (ownerWorldHeight(player) * 0.62);
                const pivotY = player.y + pivotH;
                maxTipY = pivotY + (rawMaxTipY - pivotY) / scale;
            }

            // 非攻撃時は「構え」ポーズ
            if (!this.isAttacking) {
                phase = 'ready';
                // 刃を下・峰を上にして前方斜め上に構える（約-60度＝右斜め上方向）
                // ctx.scale(direction, 1) が水平反転を担うため、左右ともに同じ angle を使う
                // ほぼ水平のやや上向き＋前方に構える
                // オーナーが構えを宣言していればそれを使う(描画専用。ready は判定を持たない)。
                // フロアボスの武将は提案書で合意した「立て太刀」で構える。
                const readyA = Number.isFinite(player.odachiReadyAngle)
                    ? player.odachiReadyAngle : -Math.PI * 0.10;
                const baseAngle = readyA + Math.sin(player.motionTime * 0.0078) * 0.03;
                rotation = baseAngle;

                const hx = Number.isFinite(player.odachiReadyHandXRatio) ? player.odachiReadyHandXRatio : 0.48;
                const hy = Number.isFinite(player.odachiReadyHandYRatio) ? player.odachiReadyHandYRatio : 0.40;
                const handX = centerX + direction * (ownerWorldWidth(player) * hx);
                const handY = player.y + ownerWorldHeight(player) * hy + (player.bob || 0) * 0.8;
                
                return { progress, phase, direction, rotation, handX, handY, bladeEnd };
            }

            // 着地後は刺さりポーズ
            if (this.hasImpacted) {
                phase = 'planted';
                rotation = Math.PI * 0.5;
                // 大太刀のhandXはボディの視覚中心(centerX)を基準にする。
                // frozenCenterX(=scale pivot)はoriginalW/2基準でdrawW/2と4pxずれるため
                // スケール後に左右非対称(8.8px差)を生む。
                const handX = centerX + direction * (ownerWorldWidth(player) * 0.35);
                // 身長比率に基づいて手の高さを計算 (プレイヤー 60px に対し 7.5px = 0.125)
                const handY = player.y + ownerWorldHeight(player) * 0.125;
                
                // 地面固定：剣の先端（bladeEnd）を地面（maxTipY）に【常に】揃える。
                // 以前は tipY > maxTipY の時だけ引き上げる片側補正だったため、
                // ぶら下がり高度(getPlantedOwnerY)が少しでも高いと切先が地面に届かず、
                // 「屋根の上に浮いた大太刀」になった(巨躯オーナー/忍具tierが低い時に顕著)。
                // 両側補正にすれば、ぶら下がり高度の誤差に関係なく切先は必ず地面に乗る。
                const tipY = handY + Math.sin(rotation) * bladeEnd;
                const adjustedHandY = handY - (tipY - maxTipY);
                const plantedPose = { progress, phase, direction, rotation, handX, handY: adjustedHandY, bladeEnd };
                // 常に 1.0倍基準で計算しているため、再帰呼び出しなしで単純コピー保存
                this.lastPlantedPose = { ...plantedPose };
                return plantedPose;
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
        const forwardOffset = ownerWorldWidth(player) * (phase === 'rise' ? 0.3 : (phase === 'stall' ? 0.325 : (phase === 'flip' ? 0.275 : 0.35)));
        const heightOffset = ownerWorldHeight(player) * (phase === 'plunge' ? 0.266 : 0.283);

        let handX = centerX + direction * forwardOffset;
        let handY = player.y + heightOffset;

        if (phase === 'flip') {
            const lift = Math.sin(flipT * Math.PI);
            handX += direction * lift * 2.2;
            handY -= lift * 1.6;
        }

            // 【落下中も切先は地面で頭打ち】。接地判定は物理ステップ前のposeで行うため、
            // これが無いと「刀身が屋根に沈んだ1コマ」が描画されてから刺さる
            // (実測: 将軍で最大35px。落下末期の切先は約77px/frame動く)。
            // 刃が下を向いている間だけ効かせる(振り上げ・反転の前半は上向き)。
            if (Math.sin(rotation) > 0.5) {
                const fallTipY = handY + Math.sin(rotation) * bladeEnd;
                if (fallTipY > maxTipY) handY -= (fallTipY - maxTipY);
            }

            return { progress, phase, direction, rotation, handX, handY, bladeEnd };
        } finally {
            if (player && prevIRM !== undefined) {
                player._inRenderModel = prevIRM;
            }
        }
    }

    getHandleMetrics() {
        // HUDイラスト準拠。刀身を主役にし、金具込みでも太く見えない細身の両手柄。
        const back = -14;
        const front = 16;
        return {
            back,
            front,
            center: (back + front) * 0.5,
            thickness: 8.6
        };
    }

    getOwnerVisualScale(player) {
        return player && Number.isFinite(player.scaleMultiplier) && player.scaleMultiplier > 0
            ? player.scaleMultiplier
            : 1.0;
    }

    getOwnerActorPoseWidth(player) {
        return player && Number.isFinite(player.actorBaseWidth)
            ? PLAYER.WIDTH
            : (player && Number.isFinite(ownerWorldWidth(player)) ? ownerWorldWidth(player) : PLAYER.WIDTH);
    }

    getOwnerActorBaseWidth(player) {
        return player && Number.isFinite(player.actorBaseWidth)
            ? player.actorBaseWidth
            : this.getOwnerActorPoseWidth(player);
    }

    getOwnerRenderFootOffset(player) {
        if (!player) return 0;
        const scale = this.getOwnerVisualScale(player);
        if (scale <= 1.001 || !Number.isFinite(player.actorBaseHeight)) return 0;
        const actorPivotHeight = player.actorBaseHeight * 0.62;
        return ownerWorldHeight(player) * 0.38 - (PLAYER.HEIGHT - actorPivotHeight) * scale;
    }

    captureImpactFrozen(player) {
        if (!player) return null;
        this.impactFrozen = {
            pivotX: player.x + ownerWorldWidth(player) * 0.5,
            pivotY: player.y + ownerWorldHeight(player) * 0.62
        };
        return this.impactFrozen;
    }

    captureImpactWorldPose(player) {
        if (!player) return;
        if (!this.isAttacking) return;
        const scale = this.getOwnerVisualScale(player);
        
        let frozen = null;
        if (player._inRenderModel) {
            const isShogunMode = player.characterType === 'shogun';
            frozen = {
                pivotX: isShogunMode ? (player.x + 24) : (player.x + player.width * 0.5),
                pivotY: isShogunMode ? (player.y + 37.2) : (player.y + player.height * 0.62)
            };
        } else {
            frozen = this.impactFrozen || this.captureImpactFrozen(player);
        }
        
        if (!frozen) return;
        
        const prevIRM = player._inRenderModel;
        player._inRenderModel = true;
        const pose = this.getPose(player);
        player._inRenderModel = prevIRM;
        
        this.lastPlantedWorldX = frozen.pivotX + (pose.handX - frozen.pivotX) * scale;
        this.lastPlantedWorldY = frozen.pivotY + (pose.handY - frozen.pivotY) * scale;
        this.lastPlantedWorldDirection = pose.direction;
        this.lastPlantedWorldRotation = pose.rotation;
        this.lastPlantedWorldScale = scale;
    }

    getImpactXForPose(player, pose) {
        if (!player || !pose) return this.impactX || (pose ? pose.handX : 0);

        const scale = player.scaleMultiplier || 1.0;
        if (scale > 1.001) {
            // 将軍（Shogun）などのスケールされたプレイヤーの場合、
            // 描画モデル座標系(inRenderModel)での pose をエミュレートして、実際の描画ワールド座標を算出する
            const isShogunMode = player.characterType === 'shogun';
            const drawW = 48;
            const originalX = player.x;
            const originalW = player.width;

            // 実際の描画 (playerRenderer.js _renderShogunBodyNative) と完全に同一の座標系を算出する
            const worldW = typeof player.getWorldWidth === 'function' ? player.getWorldWidth() : originalW * scale;
            const actorRenderW = 40; // SHOGUN_ACTOR_BASE_WIDTH

            const actorRenderX = isShogunMode ? (originalX + (worldW - actorRenderW) * 0.5) : originalX;
            const renderX = isShogunMode ? (actorRenderX + (actorRenderW - drawW) * 0.5) : originalX;

            const prevInRenderModel = player._inRenderModel;
            const prevX = player.x;
            const prevW = player.width;

            player._inRenderModel = true;
            player.x = renderX;
            player.width = drawW;

            // 描画用の pose をエミュレートして取得
            const renderPose = this.getPose(player);

            player._inRenderModel = prevInRenderModel;
            player.x = prevX;
            player.width = prevW;

            // 実際の描画 (renderModel) と同じピボットを用いてスケール投影（これが大太刀の実際の描画位置）
            const pivotX = isShogunMode ? (actorRenderX + actorRenderW * 0.5) : (originalX + originalW * 0.5);
            return pivotX + (renderPose.handX - pivotX) * scale;
        }

        // 忍者などの標準スケール時
        if (pose && Number.isFinite(pose.handX)) {
            return pose.handX;
        }
        const frozen = this.impactFrozen || this.captureImpactFrozen(player);
        if (!frozen) return this.impactX;
        const poseWidth = this.getOwnerActorPoseWidth(player);
        const actorBaseWidth = this.getOwnerActorBaseWidth(player);
        const actorCenterX = frozen.pivotX + (poseWidth - actorBaseWidth) * 0.5;
        return actorCenterX + pose.direction * (poseWidth * 0.35);
    }

    /**
     * 描画されるときの切先のワールドy。
     * pose(スケール前) → モデル変換(ピボット中心 scale 倍) の順で写像する。
     * ピボット高さは renderModel が渡す _scalePivotH を優先し、無ければ 0.62 比率。
     */
    getDrawnTipY(player, pose, bladeEndOverride = null) {
        if (!player || !pose) return null;
        const bladeEnd = Number.isFinite(bladeEndOverride)
            ? bladeEndOverride
            : (Number.isFinite(pose.bladeEnd) ? pose.bladeEnd : this.getBladeMetrics().bladeEnd);
        const rawTipY = pose.handY + Math.sin(pose.rotation) * bladeEnd;
        const scale = this.getOwnerVisualScale(player);
        if (Math.abs(scale - 1) <= 0.001) return rawTipY;
        const pivotH = Number.isFinite(player._scalePivotH)
            ? player._scalePivotH
            : ownerWorldHeight(player) * 0.62;
        const pivotY = player.y + pivotH;
        return pivotY + (rawTipY - pivotY) * scale;
    }

    getPlantedOwnerY(player) {
        if (!player) return null;
        const bladeEnd = this.getBladeMetrics().bladeEnd;
        const maxTipY = player.groundY + LANE_OFFSET;
        const handHeightRatio = 0.125;
        const scale = this.getOwnerVisualScale(player);
        const scaledBladeEnd = bladeEnd * scale;
        // 手の高さぶんの引き下げは【等倍のオーナーだけ】正しい。
        // 巨躯(将軍/ラスボス=scale2)の大太刀は playerRenderer のモデル変換の中で
        // 描かれるので、この項を残すとその分だけ切先が地面に届かない。
        // ピクセル実測(getImageData で刀身の最下端を測る):
        //   scale2 でこの項あり → 切先y=497(足元ライン512に対し15px浮き)
        //   項を外す           → 切先y=512(接地)
        const handDrop = scale > 1.001 ? 0 : ownerWorldHeight(player) * handHeightRatio;
        let result = maxTipY - scaledBladeEnd - handDrop;
        result -= this.getOwnerRenderFootOffset(player);
        return result;
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
        const ownerScale = Math.max(1, (player?.height || 60) / 60);
        // 柄の中心付近を両手で挟む配置（長手方向に少しずらし、左右から包む）
        const halfSpan = 4.2 * ownerScale;
        const pinch = 2.8 * ownerScale;
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
        const handle = this.getHandleMetrics();
        const ownerScale = Math.max(1, (player?.height || 60) / 60);
        // 短くした柄の内側へ必ず収める。接地時は柄頭寄り、構え時は中央を握る。
        const localGrip = (pose.phase === 'plunge' || pose.phase === 'planted')
            ? handle.back + 6
            : (pose.phase === 'ready')
                ? handle.center
                : handle.center - 3;
        const gripOffset = localGrip * ownerScale;
        return {
            x: pose.handX + Math.cos(pose.rotation) * gripOffset,
            y: pose.handY + Math.sin(pose.rotation) * gripOffset,
            rotation: pose.rotation,
            direction: pose.direction
        };
    }

    getBladeGeometry(pose) {
        const metrics = this.getBladeMetrics();
        const bladeStart = metrics.bladeStart;
        const bladeEnd = Number.isFinite(pose.bladeEnd) ? pose.bladeEnd : metrics.bladeEnd;
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
            hitThickness: metrics.hitThickness
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
        // 描画時にスケールされるのに伴い、速度も ownerRenderScale に比例してスケールアップする
        const ownerRenderScale = (this.owner && this.owner.scaleMultiplier > 1)
            ? this.owner.scaleMultiplier : 1;
        const mainLife = Math.round(420 * lifeScale * tierLifeScale);
        const subLife = Math.round(320 * lifeScale * tierLifeScale);
        const mainSpeed = 7.8 * speedScale * tierSpeedScale * ownerRenderScale;
        const subSpeed = 9.4 * speedScale * tierSpeedScale * ownerRenderScale;
        this.groundWaves.push(
            { x: this.impactX, y: this.impactY, dir: -1, life: mainLife, maxLife: mainLife, speed: mainSpeed, thickness: 28, core: 11 },
            { x: this.impactX, y: this.impactY, dir: 1, life: mainLife, maxLife: mainLife, speed: mainSpeed, thickness: 28, core: 11 },
            { x: this.impactX, y: this.impactY, dir: -1, life: subLife, maxLife: subLife, speed: subSpeed, thickness: 20, core: 8 },
            { x: this.impactX, y: this.impactY, dir: 1, life: subLife, maxLife: subLife, speed: subSpeed, thickness: 20, core: 8 }
        );
    }

    spawnImpactDebris() {
        for (let i = 0; i < 18; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const isSpark = i % 3 === 0; // 1/3 を火花(明・速)、残りを土塊(暗・遅)
            const speed = (isSpark ? 4.4 : 2.6) + Math.random() * (isSpark ? 4.6 : 3.6);
            this.impactDebris.push({
                x: this.impactX,
                y: this.impactY - 6,
                vx: side * speed * (0.6 + Math.random() * 0.6),
                vy: (isSpark ? -4.4 : -2.8) - Math.random() * 4.2,
                size: (isSpark ? 1.0 : 1.8) + Math.random() * (isSpark ? 1.3 : 2.8),
                life: (isSpark ? 240 : 340) + Math.random() * 220,
                maxLife: 560,
                type: isSpark ? 'spark' : 'dirt',
                rot: Math.random() * Math.PI * 2,
                vrot: (Math.random() - 0.5) * 0.45,
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
                    const targetY = this.getPlantedOwnerY(this.owner);
                    if (Number.isFinite(targetY)) {
                        this.owner.y = targetY;
                    }
                    this.owner.vy = 0;
                    this.owner.vx = 0; // planted中は横ドリフトもロック（フェードアウト時のX位置ずれ防止）
                    this.owner.isGrounded = false; // 足元は浮いている
                }

                if (this.plantedTimer <= 0) {
                    this.isAttacking = false;
                    this.plantedTimer = 0;
                    this.fadeOutTimer = this.fadeOutDuration;
                    this.attackDirection = this.owner && this.owner.facingRight ? 1 : -1;
                }
            } else {
                if (this.owner) {
                    // 1. 上昇時 (rise フェーズ): Lv に応じて物理的に上昇
                    if (progress < this.liftEnd) {
                        // 描画スケールに合わせて持ち上げ量も調整する
                        const ownerScaleSqrt = (this.owner && this.owner.scaleMultiplier > 1)
                            ? Math.sqrt(this.owner.scaleMultiplier) : 1;
                        const liftPower = (-12 - (subWeaponTier * 8.5)) * ownerScaleSqrt; // Lv3 で最大上昇力
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

                    // 接地判定の精密計算。
                    // 【描画される切先で判定する】。pose はスケール前の座標系なので、
                    // 巨躯オーナー(将軍/ラスボス=scale2)では playerRenderer のモデル変換
                    // (ピボット中心の scale 倍)を通した位置で比べないと判定が遅れる。
                    // 実測(将軍・忍具初級): 未スケールで比べると刀身が屋根を最大95px
                    // 突き抜けた3フレームを見せてから刺さっていた。
                    const pose = this.getPose(this.owner);
                    const bladeEnd = Number.isFinite(pose.bladeEnd)
                        ? pose.bladeEnd
                        : this.getBladeMetrics().bladeEnd;
                    const maxTipY = this.owner.groundY + LANE_OFFSET;
                    const tipY = this.getDrawnTipY(this.owner, pose, bladeEnd);
                    // 【1フレーム先読み】次フレームで地面を越えるなら今フレームで刺す。
                    // pose は物理ステップ前の値なので、判定だけを見て刺すと
                    // 「刀身が屋根に沈んだ1コマ」が必ず描画される(実測で最大35px、
                    //  落下末期の切先は約77px/frame動く)。
                    // 先読み量は90pxで頭打ちにして、反転(flip)中の大きな飛びで
                    // 空中から刺さってしまうのを防ぐ。
                    const prevTipY = this._prevDrawnTipY;
                    const tipLookahead = (Number.isFinite(prevTipY) && tipY > prevTipY)
                        ? Math.min(90, tipY - prevTipY)
                        : 0;
                    this._prevDrawnTipY = tipY;

                    if (tipY + tipLookahead >= maxTipY - 2) {
                        // 接地した瞬間に「ぶら下がり高度」で停止
                        const targetY = this.getPlantedOwnerY(this.owner);
                        if (Number.isFinite(targetY) && this.owner.y > targetY) {
                            this.owner.y = targetY;
                            this.owner.vy = 0;
                            this.owner.vx = 0; // impactFrozen保存前に vx をゼロにして applyPhysics() によるズレを防ぐ
                            this.hasImpacted = true;
                            this.plantedTimer = this.plantedDuration;
                            this.captureImpactFrozen(this.owner);
                            this.captureImpactWorldPose(this.owner);
                            this.impactX = this.getImpactXForPose(this.owner, pose);
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

                const landed = this.owner && this.owner.isGrounded && progress >= this.flipEnd;
                if (!this.hasImpacted && (landed || progress >= 0.98)) {
                    this.hasImpacted = true;
                    this.plantedTimer = this.plantedDuration;
                    if (this.owner) {
                        // 【順序が要点】刺さり高度(getPlantedOwnerY)へ先に落としてから
                        // 凍結ポーズを保存する。逆にすると刀身は補正前の高さで固定され、
                        // 実体だけが動くので「深く刺さった直後に浮く」二段挙動になる。
                        // (巨躯=スケール持ちのオーナーで補正量が大きく、露骨に出る)
                        const targetY = this.getPlantedOwnerY(this.owner);
                        if (Number.isFinite(targetY)) {
                            this.owner.y = targetY;
                            this.owner.vy = 0;
                            this.owner.isGrounded = false;
                        }
                        if (!this.impactFrozen) {
                            this.owner.vx = 0; // impactFrozen保存前に vx をゼロにして applyPhysics() によるズレを防ぐ
                            this.captureImpactFrozen(this.owner);
                        }
                        this.captureImpactWorldPose(this.owner);
                        const pose = this.getPose(this.owner);
                        this.impactX = this.getImpactXForPose(this.owner, pose);
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
                        // 上と同じ順序: 刺さり高度へ落としてから凍結ポーズを保存する
                        const targetY = this.getPlantedOwnerY(this.owner);
                        if (Number.isFinite(targetY)) {
                            this.owner.y = targetY;
                            this.owner.vy = 0;
                            this.owner.isGrounded = false;
                        }
                        if (!this.impactFrozen) {
                            this.owner.vx = 0; // impactFrozen保存前に vx をゼロにして applyPhysics() によるズレを防ぐ
                            this.captureImpactFrozen(this.owner);
                        }
                        this.captureImpactWorldPose(this.owner);
                        const pose2 = this.getPose(this.owner);
                        this.impactX = this.getImpactXForPose(this.owner, pose2);
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

        if (!this.isAttacking && this.fadeOutTimer > 0) {
            this.fadeOutTimer = Math.max(0, this.fadeOutTimer - deltaTime * 1000);
            if (this.fadeOutTimer <= 0) {
                this.lastPlantedPose = null;
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
                if (p.vrot) p.rot += p.vrot;
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
                height: Math.max(12, Math.abs(blade.tipY - blade.rootY) + blade.hitThickness),
                part: 'blade'
            });
        }

        if (this.impactFlashTimer > 0) {
            hitboxes.push({
                x: this.impactX - 52,
                y: this.impactY - 26,
                width: 104,
                height: 52,
                part: 'shock'
            });
        }

        if (this.groundWaves.length > 0) {
            for (const sw of this.groundWaves) {
                const dir = sw.dir >= 0 ? 1 : -1;
                const waveLength = Math.max(58, Number.isFinite(sw.thickness) ? sw.thickness * 2.25 : 58);
                const waveHeight = Math.max(32, Number.isFinite(sw.thickness) ? sw.thickness * 1.18 : 32);
                hitboxes.push({
                    x: dir > 0 ? sw.x - 8 : sw.x - waveLength + 8,
                    y: sw.y - waveHeight * 0.82,
                    width: waveLength,
                    height: waveHeight,
                    part: 'shock'
                });
            }
        }

        return hitboxes.length > 0 ? hitboxes : null;
    }
    
    renderWorldEffects(ctx, player = this.owner) {
        const prevGroundOnly = this.renderOnlyGroundEffects;
        const prevSuppress = this.suppressGroundEffectsRender;
        this.renderOnlyGroundEffects = true;
        this.suppressGroundEffectsRender = false;
        try {
            this.render(ctx, player || this.owner || null);
        } finally {
            this.renderOnlyGroundEffects = prevGroundOnly;
            this.suppressGroundEffectsRender = prevSuppress;
        }
    }

    render(ctx, player) {
        const groundOnly = !!this.renderOnlyGroundEffects;
        // 攻撃中 OR 刺さり中 OR 強制描画指定時は刀身を描画
        const shouldFadeOut = !this.isAttacking && this.fadeOutTimer > 0 && this.lastPlantedPose;
        if (!groundOnly && (this.isAttacking || shouldFadeOut || (player && player.forceSubWeaponRender))) {
            const pose = (shouldFadeOut || (this.isAttacking && this.hasImpacted)) && this.lastPlantedPose
                ? this.lastPlantedPose
                : this.getPose(player);

            // モデル描画中（_inRenderModel）かつ着地刺さり中の場合、最新のモデル位置に基づいて絶対ワールド座標をキャプチャ更新する
            if (player && player._inRenderModel && this.isAttacking && this.hasImpacted) {
                this.captureImpactWorldPose(player);
            }

            const fadeAlpha = shouldFadeOut
                ? Math.max(0, Math.min(1, this.fadeOutTimer / Math.max(1, this.fadeOutDuration)))
                : 1;
            const blade = this.getBladeGeometry(pose);
            const handle = this.getHandleMetrics();
            
            ctx.save();
            ctx.globalAlpha *= fadeAlpha;

            let useWorldPose = false;
            if (shouldFadeOut && Number.isFinite(this.lastPlantedWorldX) && Number.isFinite(this.lastPlantedWorldY)) {
                useWorldPose = true;
            }

            if (useWorldPose) {
                // 保存された完全なワールド座標とスケールを直接適用（プレイヤーの移動やワープの影響を一切受けない）
                ctx.translate(this.lastPlantedWorldX, this.lastPlantedWorldY);
                ctx.scale(this.lastPlantedWorldScale * this.lastPlantedWorldDirection, this.lastPlantedWorldScale);
                ctx.rotate(this.lastPlantedWorldRotation);
            } else {
                // 通常の描画（攻撃中や、ワールドポーズが未キャプチャの場合）
                // モデル外描画（game.jsからの呼び出しなど）のとき、将軍スケールを自律適用する
                const scale = this.getOwnerVisualScale(player);
                const needsSelfScale = scale > 1.001 && (!player || !player._inRenderModel);
                if (needsSelfScale) {
                    const frozen = this.impactFrozen || (player ? {
                        pivotX: player.x + ownerWorldWidth(player) * 0.5,
                        pivotY: player.y + ownerWorldHeight(player) * 0.62
                    } : null);
                    if (frozen) {
                        ctx.translate(frozen.pivotX, frozen.pivotY);
                        ctx.scale(scale, scale);
                        ctx.translate(-frozen.pivotX, -frozen.pivotY);
                    }
                }

                ctx.translate(pose.handX, pose.handY);
                ctx.scale(pose.direction, 1);
                ctx.rotate(pose.rotation);
            }

            // 柄: HUDイラストの細身の両手柄。木地→鮫皮→柄巻き→金具の順に重ねる。
            const handleBack = handle.back;
            const handleFront = handle.front;
            const handleHalfH = (handle.thickness || 9) * 0.5;
            const handleLength = handleFront - handleBack;
            const handleGrad = ctx.createLinearGradient(handleBack, -handleHalfH, handleFront, handleHalfH);
            handleGrad.addColorStop(0.00, '#24150a');
            handleGrad.addColorStop(0.30, '#6b4020');
            handleGrad.addColorStop(0.62, '#4b2913');
            handleGrad.addColorStop(1.00, '#1b0d06');
            ctx.fillStyle = handleGrad;
            ctx.beginPath();
            ctx.moveTo(handleBack + 2.2, -handleHalfH);
            ctx.lineTo(handleFront - 1.5, -handleHalfH);
            ctx.quadraticCurveTo(handleFront + 0.35, 0, handleFront - 1.5, handleHalfH);
            ctx.lineTo(handleBack + 2.2, handleHalfH);
            ctx.quadraticCurveTo(handleBack - 0.45, 0, handleBack + 2.2, -handleHalfH);
            ctx.closePath();
            ctx.fill();

            // 暗い鮫皮の菱目。小さな明暗差だけを残し、縮小時のノイズを抑える。
            ctx.fillStyle = 'rgba(196, 160, 98, 0.26)';
            for (let x = handleBack + 5.0; x < handleFront - 3.0; x += 7.4) {
                ctx.beginPath();
                ctx.moveTo(x - 1.9, 0);
                ctx.lineTo(x, -1.55);
                ctx.lineTo(x + 1.9, 0);
                ctx.lineTo(x, 1.55);
                ctx.closePath();
                ctx.fill();
            }

            // 柄巻き: 帯幅を細くし、柄本体の太さを増やさず立体感だけを加える。
            ctx.save();
            ctx.beginPath();
            ctx.rect(handleBack + 1.2, -handleHalfH - 0.5, handleLength - 1.8, handleHalfH * 2 + 1.0);
            ctx.clip();
            ctx.lineWidth = 1.15;
            ctx.lineCap = 'round';
            for (let x = handleBack - 4.5; x < handleFront + 5; x += 7.4) {
                ctx.strokeStyle = 'rgba(17, 9, 5, 0.90)';
                ctx.beginPath();
                ctx.moveTo(x, -handleHalfH - 0.55);
                ctx.lineTo(x + 7.7, handleHalfH + 0.55);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(112, 72, 40, 0.62)';
                ctx.beginPath();
                ctx.moveTo(x + 3.7, handleHalfH + 0.45);
                ctx.lineTo(x + 11.4, -handleHalfH - 0.45);
                ctx.stroke();
            }
            ctx.restore();

            // 柄頭と縁金: 面積を抑え、細い柄のシルエットを維持する。
            const metalGrad = ctx.createLinearGradient(handleBack, -handleHalfH, handleFront, handleHalfH);
            metalGrad.addColorStop(0, '#594017');
            metalGrad.addColorStop(0.35, '#d7b85b');
            metalGrad.addColorStop(0.66, '#8a6829');
            metalGrad.addColorStop(1, '#3d2a0d');
            ctx.fillStyle = metalGrad;
            ctx.beginPath();
            ctx.roundRect(handleBack - 1.9, -handleHalfH - 0.45, 4.2, handleHalfH * 2 + 0.9, 1.2);
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(handleFront - 3.0, -handleHalfH - 0.5, 3.8, handleHalfH * 2 + 1.0, 1.0);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 226, 142, 0.32)';
            ctx.lineWidth = 0.45;
            ctx.beginPath();
            ctx.moveTo(handleBack + 2.2, -handleHalfH + 0.65);
            ctx.lineTo(handleFront - 3.2, -handleHalfH + 0.65);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(14, 8, 3, 0.78)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(handleBack + 2.2, -handleHalfH);
            ctx.lineTo(handleFront - 1.5, -handleHalfH);
            ctx.quadraticCurveTo(handleFront + 0.35, 0, handleFront - 1.5, handleHalfH);
            ctx.lineTo(handleBack + 2.2, handleHalfH);
            ctx.quadraticCurveTo(handleBack - 0.45, 0, handleBack + 2.2, -handleHalfH);
            ctx.closePath();
            ctx.stroke();

            // 刀身: HUDイラストの長い太身を基準に、刀らしい非対称の鋒と面構成を描く。
            const bladeStart = blade.bladeStart;
            const bladeEnd = blade.bladeEnd;
            const bladeHalf = this.getBladeMetrics().halfWidth;
            const rootX = bladeStart + 1.5;
            const tipX = bladeEnd;
            const tipY = -3.1;
            const kissakiStart = bladeEnd - 25;
            const drawBladePath = () => {
                ctx.beginPath();
                ctx.moveTo(rootX, -bladeHalf + 0.3);
                // 峰側はほぼ直線、刃側だけを長く反らせて短剣のような左右対称形を避ける。
                ctx.lineTo(kissakiStart, -bladeHalf + 1.3);
                ctx.quadraticCurveTo(bladeEnd - 7.0, -bladeHalf + 2.1, tipX, tipY);
                ctx.quadraticCurveTo(bladeEnd - 4.0, 2.4, kissakiStart, bladeHalf - 1.4);
                ctx.lineTo(rootX, bladeHalf - 0.3);
                ctx.quadraticCurveTo(bladeStart - 0.7, 0, rootX, -bladeHalf + 0.3);
                ctx.closePath();
            };
            const bladeGrad = ctx.createLinearGradient(0, -bladeHalf, 0, bladeHalf);
            bladeGrad.addColorStop(0.00, '#263446');
            bladeGrad.addColorStop(0.22, '#657384');
            bladeGrad.addColorStop(0.43, '#dce4ec');
            bladeGrad.addColorStop(0.57, '#f7fafc');
            bladeGrad.addColorStop(0.78, '#c6d0da');
            bladeGrad.addColorStop(1.00, '#8e9baa');

            // 輪郭影は刀身本体だけへ適用し、反射線がにじまないようにする。
            withDropShadow(ctx, { color: 'rgba(0,0,0,0.56)', blur: 3.2, dx: 1.1, dy: 1.8 }, () => {
                ctx.fillStyle = bladeGrad;
                drawBladePath();
                ctx.fill();
            });

            ctx.save();
            drawBladePath();
            ctx.clip();

            // 峰・鎬地: 濃紺の細長い面で大太刀の重量感を出す。
            const spineGrad = ctx.createLinearGradient(bladeStart, -bladeHalf, bladeEnd, -2);
            spineGrad.addColorStop(0, 'rgba(28, 42, 59, 0.56)');
            spineGrad.addColorStop(0.56, 'rgba(54, 69, 88, 0.76)');
            spineGrad.addColorStop(1, 'rgba(16, 28, 44, 0.88)');
            ctx.fillStyle = spineGrad;
            ctx.beginPath();
            ctx.moveTo(rootX, -bladeHalf + 0.25);
            ctx.lineTo(kissakiStart, -bladeHalf + 1.35);
            ctx.quadraticCurveTo(bladeEnd - 7, -bladeHalf + 2.1, tipX, tipY);
            ctx.quadraticCurveTo(bladeEnd - 12, -2.0, kissakiStart - 2, -1.0);
            ctx.lineTo(bladeStart + 8, -0.45);
            ctx.closePath();
            ctx.fill();

            // 平地: 中央を広く明るく取り、HUDの白銀色を再現する。
            const flatGrad = ctx.createLinearGradient(bladeStart, 0, bladeEnd, 4);
            flatGrad.addColorStop(0, 'rgba(238, 244, 249, 0.46)');
            flatGrad.addColorStop(0.42, 'rgba(255, 255, 255, 0.64)');
            flatGrad.addColorStop(0.76, 'rgba(198, 210, 224, 0.22)');
            flatGrad.addColorStop(1, 'rgba(247, 250, 253, 0.54)');
            ctx.fillStyle = flatGrad;
            ctx.beginPath();
            ctx.moveTo(bladeStart + 7, -0.7);
            ctx.lineTo(kissakiStart - 2, -1.2);
            ctx.quadraticCurveTo(bladeEnd - 11, -2.0, tipX, tipY);
            ctx.quadraticCurveTo(bladeEnd - 12, 0.8, kissakiStart - 3, 3.4);
            ctx.lineTo(bladeStart + 8, 3.9);
            ctx.closePath();
            ctx.fill();

            // 刃先側: 細い高輝度面。面積を絞り、白い棒に見えないようにする。
            const edgeGrad = ctx.createLinearGradient(0, 2.8, 0, bladeHalf);
            edgeGrad.addColorStop(0, 'rgba(210, 221, 232, 0.22)');
            edgeGrad.addColorStop(0.62, 'rgba(252, 254, 255, 0.82)');
            edgeGrad.addColorStop(1, 'rgba(222, 231, 240, 0.62)');
            ctx.fillStyle = edgeGrad;
            ctx.beginPath();
            ctx.moveTo(bladeStart + 5, bladeHalf - 0.45);
            ctx.lineTo(kissakiStart, bladeHalf - 1.55);
            ctx.quadraticCurveTo(bladeEnd - 4, 2.4, tipX, tipY);
            ctx.quadraticCurveTo(bladeEnd - 12, 1.0, kissakiStart - 3, 4.1);
            ctx.lineTo(bladeStart + 9, 4.5);
            ctx.closePath();
            ctx.fill();

            // 鎬筋: 柄から切先へ一本で通し、刀身の長さと中心軸を明確にする。
            const shinogiGrad = ctx.createLinearGradient(bladeStart + 8, 0, kissakiStart, 0);
            shinogiGrad.addColorStop(0, 'rgba(255,255,255,0.30)');
            shinogiGrad.addColorStop(0.45, 'rgba(255,255,255,0.72)');
            shinogiGrad.addColorStop(1, 'rgba(215,228,240,0.24)');
            ctx.strokeStyle = shinogiGrad;
            ctx.lineWidth = 1.15;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(bladeStart + 9, -0.35);
            ctx.lineTo(kissakiStart - 2, -1.0);
            ctx.stroke();

            // 刃文: 小振りな互の目を連続させ、静止時だけ読める程度へ抑える。
            ctx.strokeStyle = 'rgba(242, 247, 252, 0.42)';
            ctx.lineWidth = 0.72;
            ctx.beginPath();
            ctx.moveTo(bladeStart + 12, 7.25);
            ctx.bezierCurveTo(bladeStart + 22, 8.15, bladeStart + 27, 6.45, bladeStart + 37, 7.15);
            ctx.bezierCurveTo(bladeStart + 48, 8.05, bladeStart + 54, 6.35, bladeStart + 65, 7.0);
            ctx.bezierCurveTo(bladeStart + 76, 7.75, kissakiStart - 12, 6.15, kissakiStart - 2, 4.45);
            ctx.stroke();

            // 横手と鋒の反射面。
            ctx.strokeStyle = 'rgba(234, 242, 250, 0.56)';
            ctx.lineWidth = 0.62;
            ctx.beginPath();
            ctx.moveTo(kissakiStart, -bladeHalf + 1.55);
            ctx.lineTo(kissakiStart + 1.2, bladeHalf - 1.75);
            ctx.stroke();

            const kissakiGrad = ctx.createLinearGradient(kissakiStart, -7, tipX, 5);
            kissakiGrad.addColorStop(0, 'rgba(235,242,249,0.06)');
            kissakiGrad.addColorStop(0.55, 'rgba(255,255,255,0.34)');
            kissakiGrad.addColorStop(1, 'rgba(184,199,215,0.10)');
            ctx.fillStyle = kissakiGrad;
            ctx.beginPath();
            ctx.moveTo(kissakiStart + 0.8, -bladeHalf + 1.7);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(kissakiStart + 1.2, 3.7);
            ctx.closePath();
            ctx.fill();

            // 根元の磨き残しで鎺との境界を落ち着かせる。
            ctx.fillStyle = 'rgba(49, 62, 78, 0.17)';
            ctx.beginPath();
            ctx.moveTo(bladeStart, -bladeHalf + 1.0);
            ctx.lineTo(bladeStart + 11, -bladeHalf + 1.7);
            ctx.lineTo(bladeStart + 11, bladeHalf - 1.1);
            ctx.lineTo(bladeStart + 0.8, bladeHalf - 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            drawBladePath();
            ctx.strokeStyle = '#1d2b3c';
            ctx.lineWidth = 1.0;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.stroke();

            // 鎺: 刀身幅へ沿う薄い台形。大きな金色の塊に見えない長さへ抑える。
            const habakiBack = 18.0;
            const habakiFront = bladeStart + 4.1;
            const rootSleeveGrad = ctx.createLinearGradient(habakiBack, -9.4, habakiFront, 9.4);
            rootSleeveGrad.addColorStop(0, '#684716');
            rootSleeveGrad.addColorStop(0.34, '#e0c26d');
            rootSleeveGrad.addColorStop(0.66, '#9a7328');
            rootSleeveGrad.addColorStop(1, '#49300f');
            ctx.fillStyle = rootSleeveGrad;
            ctx.beginPath();
            ctx.moveTo(habakiBack, -8.55);
            ctx.lineTo(habakiFront, -9.35);
            ctx.lineTo(habakiFront, 9.35);
            ctx.lineTo(habakiBack, 8.55);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(46, 29, 8, 0.72)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 238, 188, 0.38)';
            ctx.lineWidth = 0.42;
            ctx.beginPath();
            ctx.moveTo(habakiBack + 1.0, -7.0);
            ctx.lineTo(habakiFront - 0.8, -7.7);
            ctx.stroke();

            // 鍔: 横幅は確保しつつ厚みを薄くして、柄と刀身の接続を軽く見せる。
            const tsubaX = 17.8;
            const tsubaGrad = ctx.createLinearGradient(tsubaX - 2.5, -12.2, tsubaX + 2.5, 12.2);
            tsubaGrad.addColorStop(0, '#5f4013');
            tsubaGrad.addColorStop(0.34, '#dfc36f');
            tsubaGrad.addColorStop(0.62, '#997128');
            tsubaGrad.addColorStop(1, '#432a0b');
            ctx.fillStyle = tsubaGrad;
            ctx.beginPath();
            ctx.ellipse(tsubaX, 0, 2.35, 12.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#2a1a07';
            ctx.lineWidth = 0.68;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 240, 190, 0.48)';
            ctx.lineWidth = 0.46;
            ctx.beginPath();
            ctx.ellipse(tsubaX - 0.25, -0.45, 1.45, 9.9, 0, -Math.PI * 0.62, Math.PI * 0.42);
            ctx.stroke();

            // 切羽の細線を二本だけ加え、柄・鍔・鎺の層を明瞭にする。
            ctx.strokeStyle = 'rgba(47, 29, 8, 0.80)';
            ctx.lineWidth = 0.55;
            ctx.beginPath();
            ctx.moveTo(15.9, -5.2);
            ctx.lineTo(15.9, 5.2);
            ctx.moveTo(19.7, -5.8);
            ctx.lineTo(19.7, 5.8);
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

                    const arcRadius = (Number.isFinite(pose.bladeEnd)
                        ? pose.bladeEnd
                        : this.getBladeMetrics().bladeEnd) + 4;
                    
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

                        // 弧に沿ったテーパー彗星リボン（motionから引かれた連続感。点追跡不要＝弧から解析生成）。
                        // head(endAngle=切先の現在位置)をage0で最太、tailをage最大で点へ収束させる。
                        const RN = 9;
                        const ribbon = [];
                        for (let k = 0; k < RN; k++) {
                            const t = k / (RN - 1); // 0=尾, 1=頭(切先)
                            const ang = startAngle + arcSpan * t;
                            ribbon.push({ x: Math.cos(ang) * arcRadius, y: Math.sin(ang) * arcRadius, age: (1 - t) * 130 });
                        }
                        drawCometRibbon(ctx, ribbon, {
                            maxAge: 135,
                            headHalf: 7,
                            baseColor: '255, 196, 128',
                            edgeColor: '255, 246, 224',
                            headAlpha: slashAlpha * 0.5,
                            coreAlpha: slashAlpha * 0.62
                        });

                        // 切先の先導フレア（剣がいま空気を裂いている先端の光）
                        const tipA = slashAlpha * 0.6;
                        const tx = Math.cos(endAngle) * arcRadius, ty = Math.sin(endAngle) * arcRadius;
                        const fg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 13);
                        fg.addColorStop(0, `rgba(255, 250, 235, ${tipA.toFixed(3)})`);
                        fg.addColorStop(1, 'rgba(255, 210, 150, 0)');
                        ctx.fillStyle = fg;
                        ctx.beginPath();
                        ctx.arc(tx, ty, 13, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.restore();
                }
            }
        }

        // 着地インパクト
        if (!this.suppressGroundEffectsRender && this.impactFlashTimer > 0) {
            const scaleMultiplier = (player && player.scaleMultiplier) ? player.scaleMultiplier : 1.0;
            const alpha = Math.max(0, this.impactFlashTimer / 170);
            const ix = this.impactX, iy = this.impactY;
            const grow = 1 - alpha;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // 放射光条(地面から弾ける光のスパイク。上半球を中心に放射)
            ctx.strokeStyle = `rgba(255, 235, 180, ${(alpha * 0.7).toFixed(3)})`;
            ctx.lineCap = 'round';
            for (let i = 0; i <= 8; i++) {
                const a = -Math.PI + (Math.PI / 8) * i;
                const len = (14 + grow * 62) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7))) * scaleMultiplier;
                ctx.lineWidth = Math.max(0.6, 4 * alpha * scaleMultiplier);
                ctx.beginPath();
                ctx.moveTo(ix, iy);
                ctx.lineTo(ix + Math.cos(a) * len, iy + Math.sin(a) * len * 0.85);
                ctx.stroke();
            }

            // 1本目のリング
            ctx.strokeStyle = `rgba(255, 200, 100, ${alpha.toFixed(3)})`;
            ctx.lineWidth = (6 + grow * 4) * scaleMultiplier;
            ctx.beginPath();
            ctx.ellipse(ix, iy, (20 + grow * 45) * scaleMultiplier, (8 + grow * 12) * scaleMultiplier, 0, 0, Math.PI * 2);
            ctx.stroke();
            // 2本目のリング(やや遅れて大きく薄く=タイムラグ)
            const a2 = Math.max(0, alpha - 0.13), g2 = 1 - a2;
            ctx.strokeStyle = `rgba(255, 170, 70, ${(a2 * 0.5).toFixed(3)})`;
            ctx.lineWidth = (3 + g2 * 3) * scaleMultiplier;
            ctx.beginPath();
            ctx.ellipse(ix, iy, (28 + g2 * 66) * scaleMultiplier, (11 + g2 * 18) * scaleMultiplier, 0, 0, Math.PI * 2);
            ctx.stroke();

            // 中心コア(radialで締める)
            const coreAlpha = Math.pow(alpha, 0.5);
            const cg = ctx.createRadialGradient(ix, iy, 0, ix, iy, 17 * scaleMultiplier);
            cg.addColorStop(0, `rgba(255,255,245,${coreAlpha.toFixed(3)})`);
            cg.addColorStop(0.5, `rgba(255,226,182,${(coreAlpha * 0.7).toFixed(3)})`);
            cg.addColorStop(1, 'rgba(255,200,120,0)');
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(ix, iy, 17 * scaleMultiplier, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 衝撃波
        if (!this.suppressGroundEffectsRender && this.groundWaves && this.groundWaves.length > 0) {
            const scaleMultiplier = (player && player.scaleMultiplier) ? player.scaleMultiplier : 1.0;
            for (let i = 0; i < this.groundWaves.length; i++) {
                const sw = this.groundWaves[i];
                if (!sw) continue;

                const ratio = Math.max(0, Math.min(1, sw.life / sw.maxLife));
                const px = sw.x;
                const py = sw.y - 3;
                
                ctx.save();
                ctx.translate(px, py);
                ctx.scale((sw.dir || 1) * scaleMultiplier, scaleMultiplier);
                ctx.globalAlpha = ratio * 1.5;
                ctx.globalCompositeOperation = 'lighter';
                
                const thickness = sw.thickness || 8;
                // 外周グロー(広く薄い橙のにじみ)
                const glowGrad = ctx.createLinearGradient(0, -thickness * 1.7, 0, thickness * 1.7);
                glowGrad.addColorStop(0, 'rgba(255,150,40,0)');
                glowGrad.addColorStop(0.5, 'rgba(255,172,64,0.3)');
                glowGrad.addColorStop(1, 'rgba(255,150,40,0)');
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(26, -thickness * 0.98, 52, 0);
                ctx.quadraticCurveTo(26, thickness * 0.72, 0, 2);
                ctx.fill();
                // 本体(多層: 透明→淡橙→白芯→淡橙→透明)
                const waveGrad = ctx.createLinearGradient(0, -thickness, 0, thickness);
                waveGrad.addColorStop(0.0, 'rgba(255, 190, 60, 0)');
                waveGrad.addColorStop(0.3, 'rgba(255, 222, 128, 0.85)');
                waveGrad.addColorStop(0.5, 'rgba(255, 255, 222, 1)');
                waveGrad.addColorStop(0.7, 'rgba(255, 208, 108, 0.8)');
                waveGrad.addColorStop(1.0, 'rgba(255, 160, 50, 0)');
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

        if (!this.suppressGroundEffectsRender && this.impactDebris.length > 0) {
            const scaleMultiplier = (player && player.scaleMultiplier) ? player.scaleMultiplier : 1.0;
            for (const p of this.impactDebris) {
                const life = Math.max(0, p.life / p.maxLife);
                if (p.type === 'spark') {
                    // 火花: 加算合成の明るい橙白＋速度方向の短い尾
                    const sz = Math.max(0.5, p.size * (0.6 + life * 0.5) * scaleMultiplier);
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.strokeStyle = `rgba(255,210,140,${(life * 0.7).toFixed(3)})`;
                    ctx.lineWidth = sz; ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(p.x - p.vx * 1.6 * scaleMultiplier, p.y - p.vy * 1.6 * scaleMultiplier);
                    ctx.lineTo(p.x, p.y); ctx.stroke();
                    ctx.fillStyle = `rgba(255,240,200,${life.toFixed(3)})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.9, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                } else {
                    // 土塊: 回転する楕円＋中心明→縁暗のグラデで質感
                    const sz = p.size * (0.75 + life * 0.5) * scaleMultiplier;
                    ctx.save();
                    ctx.globalAlpha = life * 0.95;
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot || 0);
                    const g = ctx.createRadialGradient(-sz * 0.3, -sz * 0.3, 0, 0, 0, sz);
                    g.addColorStop(0, 'rgba(214,184,134,0.95)');
                    g.addColorStop(0.6, 'rgba(170,138,94,0.9)');
                    g.addColorStop(1, 'rgba(96,74,46,0.7)');
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.72, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
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
