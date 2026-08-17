// ============================================
// Unification of the Nation - 二刀流Zコンボの体移動(共有)
// ============================================
// player.js の updateDualBladeComboMotion から、段(step)と進行度(p)だけに
// 依存する【体の移動】部分をそのまま切り出したもの。
//
// なぜ別モジュールなのか:
//   二刀流ボス(boss.js)にも同じ上下動が要る。しかし player.js は game.js を
//   import しており、boss.js から読むと循環になる。共有するなら
//   依存ゼロの専用モジュールへ出すしかない(katanaShape.js と同じ事情)。
//
// 【同期の約束】数値は player.js の実装と 1:1。片方だけ触ると
// プレイヤーとボスで二刀コンボの高さ・前進量が食い違う。
//
// 4段目の「切り上げ」は一撃のインパルスではなく【振っている間ずっと上へ引く】
// 持続加速。ボスへ初速だけ移植したときに上昇が足りなかったのはこれが理由。

/**
 * @param {object} a       vx/vy/isGrounded/facingRight/speed を持つ実体
 * @param {number} step    1..4 = 各段 / 0 = 5段目
 * @param {number} p       その段の進行度 0..1
 * @param {object} o       { deltaTime, vScale, footY, groundY }
 */
export function applyDualComboMotion(a, step, p, o) {
    const deltaTime = o.deltaTime;
    const vScale = Number.isFinite(o.vScale) ? o.vScale : 1;
    const footY = Number.isFinite(o.footY) ? o.footY : 0;
    const groundY = Number.isFinite(o.groundY) ? o.groundY : (a.groundY || 0);
    const direction = a.facingRight ? 1 : -1;
    const lerpRate = Math.max(0.08, Math.min(0.42, deltaTime * 13));
    const blend = (current, target) => current + (target - current) * lerpRate;

    if (step === 1) {
        // 1撃目: 踏み込んで一閃 — 前方に体重移動
        const targetVx = direction * a.speed * (0.14 + Math.sin(p * Math.PI) * 0.28);
        a.vx = blend(a.vx, targetVx);
        if (!a.isGrounded) {
            a.vy = blend(a.vy, (p < 0.5 ? -0.2 : 0.8) * vScale);
        }
    } else if (step === 2) {
        // 2撃目: 最小限の引きから即座に前方へ打ち込む
        let targetVx;
        if (p < 0.08) {
            targetVx = -direction * a.speed * (0.12 + p * 0.2);
        } else if (p < 0.48) {
            targetVx = direction * a.speed * (0.24 + (p - 0.08) * 1.8);
        } else {
            targetVx = direction * a.speed * (0.96 - (p - 0.48) * 1.6);
        }
        a.vx = blend(a.vx, targetVx);
        if (!a.isGrounded) {
            a.vy = blend(a.vy, (p < 0.42 ? -1.0 : 2.6) * vScale);
        }
    } else if (step === 3) {
        // 3撃目: X字交差で前方に押し出す
        let targetVx;
        if (p < 0.06) {
            targetVx = -direction * a.speed * (0.18 - p * 0.3);
        } else if (p < 0.28) {
            targetVx = direction * a.speed * (0.22 + (p - 0.06) * 2.8);
        } else if (p < 0.76) {
            targetVx = direction * a.speed * (0.84 + (p - 0.28) * 1.6);
        } else {
            targetVx = direction * a.speed * (1.60 - (p - 0.76) * 3.2);
        }
        a.vx = blend(a.vx, targetVx);
        if (a.isGrounded) {
            a.vy = 0;
        } else {
            a.vy = Math.max(a.vy, 1.8 * vScale);
        }
    } else if (step === 4) {
        // 4撃目: 3撃目の前進からそのまま切り上げへ接続
        let targetVx;
        if (p < 0.68) {
            const t = p / 0.68;
            targetVx = direction * a.speed * (0.72 + t * 0.2);
            a.vy = a.vy * 0.42 + (-15.2 + t * 6.2) * vScale * 0.58;
        } else {
            const t = (p - 0.68) / 0.32;
            targetVx = direction * a.speed * (0.92 - t * 0.58);
            a.vy = a.vy * 0.56 + (-3.8 + t * 3.6) * vScale * 0.44;
            if (p > 0.82) {
                a.vy = Math.min(a.vy, 0.65 * vScale);
            }
        }
        a.vx = blend(a.vx, targetVx);
        a.isGrounded = false;
        // 天穿で浮いている間は、コンボが途切れても着地まで新規コンボを開始させない
        a._dualStep4AirLock = true;
    } else {
        // 五段: 海老反りクロスから叩きつけ着地
        if (p < 0.24) {
            const t = p / 0.24;
            a.vx = blend(a.vx, direction * a.speed * 0.2);
            // 4段目ラスト高度を維持してから振り下ろす
            a.vy = Math.min(a.vy, (-2.4 + t * 1.0) * vScale);
        } else if (p < 0.78) {
            const dive = (p - 0.24) / 0.54;
            a.vx = blend(a.vx, direction * a.speed * (0.36 + dive * 0.46));
            a.vy = Math.max(a.vy, (9.0 + dive * 20.6) * vScale);
        } else {
            const t = (p - 0.78) / 0.22;
            a.vx = blend(a.vx, direction * a.speed * (0.8 - t * 0.56));
            a.vy = Math.max(a.vy, (20.4 - t * 4.4) * vScale);
        }
        if (a.isGrounded && p > 0.58) {
            a.vx *= 0.5;
        }
    }

    // 二刀コンボ中に上空へ登り続けないよう上昇量を制限（体格スケール比例）
    const dualRiseCap = (step === 4 ? -17.2 : -15.4) * vScale;
    a.vy = Math.max(a.vy, dualRiseCap);
    const liftFromGround = groundY - footY;
    const dualLiftLimit = (step === 4 ? 174 : 154) * vScale;
    if (liftFromGround > dualLiftLimit && a.vy < -0.4) {
        a.vy *= 0.52;
    }
    if (step === 0 && p > 0.84 && !a.isGrounded) {
        a.vy = Math.max(a.vy, 22.2 * vScale);
    }
}
