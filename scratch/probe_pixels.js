const puppeteer = require('puppeteer');
const path = require('path');

// ピクセル実測プローブ: step5の剣筋(シアン)最下端と描画切っ先を毎フレーム、
// キャンバスピクセルから直接計測する。検証項目:
//   (a) 攻撃中のどのフレームでも剣筋が切っ先を越えない (cyanMaxY <= tipY + tol)
//   (b) 凍結遷移(trailCurveFrozen発火 / 攻撃終了スナップショット化)の前後で
//       剣筋ピクセルの最下端が動かない (|Δ| <= tol)
// usage: node probe_pixels.js [shogun|ninja] [ground|air]
const char = (process.argv[2] || 'shogun').toLowerCase();
const scenario = (process.argv[3] || 'air').toLowerCase();
const btn = char === 'ninja' ? 'btnModeNinja' : 'btnModeShogun';

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setCacheEnabled(false);
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('http://localhost:8081/character_preview.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2200));

    await page.evaluate(`
        (() => {
            document.getElementById('${btn}').click();
            window.isPaused = false;
            const p = window.game.player;
            p.clearSpecialState(true);
            p.vx = 0; p.vy = 0;
            p.x = 360 - p.getWorldWidth() / 2;
            p.y = p.groundY + 32 - p.getWorldHeight();
            p.isGrounded = true;
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0;
            p.attackCooldown = 0; p.attackCombo = 0; p.comboResetTimer = 0;
            p.comboStep5IdleTransitionTimer = 0; p.comboStep5RecoveryAttack = null;

            for (let step = 1; step <= 4; step++) {
                p.attack();
                const d = p.currentAttack ? p.currentAttack.durationMs : 300;
                let e = 0;
                while (e < d) { p.update(16.67 / 1000); e += 16.67; }
                p.attackTimer = 0; p.attackCooldown = 0;
            }
            if ('${scenario}' === 'ground') {
                let gl = 0;
                while (!p.isGrounded && gl++ < 900) p.update(16.67 / 1000);
                p.attackCombo = 4;
                p.comboResetTimer = 1;
            }
            p.attack(); // step5
            // 測定分離: 旧段(step1-4)のフェード中トレイルを除去し、
            // シアン走査が step5 の剣筋だけを拾うようにする
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            window.__a5 = p.currentAttack;
            window.isPaused = true;
            window.__stepOne = () => { p.update(16.67 / 1000); };

            const cvs = document.getElementById('previewCanvas');
            const c2d = cvs.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            window.__measure = () => {
                const a = window.__a5;
                // 解析切っ先: 描画と同じ「現在の」attackTimerのポーズを投影
                const scale = (p.characterType === 'shogun' && Number.isFinite(p.scaleMultiplier)) ? p.scaleMultiplier : 1;
                let tipW = null;
                if (p.isAttacking && p.currentAttack === a) {
                    const pose = p.getComboSwordPoseState({
                        x: p.x, y: p.y, facingRight: p.facingRight, isCrouching: false,
                        attackTimer: p.attackTimer, currentAttack: a, recoveryBlend: 0
                    }, {});
                    if (pose && Number.isFinite(pose.trailTipX)) {
                        let tx = pose.trailTipX, ty = pose.trailTipY;
                        if (scale > 1.001 && Number.isFinite(a.trailTransformPlayerX)) {
                            tx -= (p.x - a.trailTransformPlayerX) * (1 - 1 / scale);
                            ty -= (p.y - a.trailTransformPlayerY) * (1 - 1 / scale);
                        }
                        tipW = p.projectComboTrailSpecPointToWorld(
                            { trailTransformPlayerX: a.trailTransformPlayerX, trailTransformPlayerY: a.trailTransformPlayerY },
                            tx, ty);
                    }
                }
                // ピクセル走査: プレイヤー周辺の論理座標域
                const x0 = Math.max(0, Math.floor(p.x - 200));
                const x1 = Math.min(1279, Math.floor(p.x + 600));
                const y0 = 0;
                const y1 = Math.min(719, Math.floor(p.groundY + 64));
                const img = c2d.getImageData(Math.floor(x0 * dpr), Math.floor(y0 * dpr),
                    Math.floor((x1 - x0) * dpr), Math.floor((y1 - y0) * dpr));
                const data = img.data;
                const W = Math.floor((x1 - x0) * dpr);
                const H = Math.floor((y1 - y0) * dpr);
                let cyanMaxY = -1, cyanAtX = -1, cyanCount = 0;
                let bladeMaxY = -1, bladeAtX = -1;
                for (let yy = 0; yy < H; yy++) {
                    for (let xx = 0; xx < W; xx++) {
                        const o = (yy * W + xx) * 4;
                        const r = data[o], g = data[o + 1], b = data[o + 2];
                        // シアン剣筋
                        if (b > 200 && g > 150 && (b - r) > 38) {
                            cyanCount++;
                            const wy = y0 + yy / dpr;
                            if (wy > cyanMaxY) { cyanMaxY = wy; cyanAtX = x0 + xx / dpr; }
                        }
                        // 刀身(白): 高輝度・低彩度
                        if (r > 195 && g > 205 && b > 230 && (b - r) <= 38) {
                            const wy = y0 + yy / dpr;
                            if (wy > bladeMaxY) { bladeMaxY = wy; bladeAtX = x0 + xx / dpr; }
                        }
                    }
                }
                return {
                    cyanMaxY: +cyanMaxY.toFixed(1), cyanAtX: +cyanAtX.toFixed(1), cyanCount,
                    bladeMaxY: +bladeMaxY.toFixed(1), bladeAtX: +bladeAtX.toFixed(1),
                    tipX: tipW ? +tipW.x.toFixed(1) : null,
                    tipY: tipW ? +tipW.y.toFixed(1) : null,
                    playerY: +p.y.toFixed(1), grounded: p.isGrounded,
                    attacking: p.isAttacking && p.currentAttack === a,
                    frozen: a.trailCurveFrozen === true
                };
            };
        })();
    `);

    const frames = [];
    let noCyanStreak = 0;
    for (let i = 0; i < 70; i++) {
        await new Promise(r => setTimeout(r, 70)); // rAF描画待ち
        const m = await page.evaluate('window.__measure()');
        m.i = i;
        frames.push(m);
        if (!m.attacking && m.cyanCount === 0) { noCyanStreak++; } else { noCyanStreak = 0; }
        if (noCyanStreak >= 3) break;
        // 凍結遷移付近のスクリーンショット
        const prev = frames[frames.length - 2];
        if (prev && ((prev.attacking && !m.attacking) || (!prev.frozen && m.frozen))) {
            const f1 = path.join(__dirname, `px_${char}_${scenario}_${i - 1}_pre.png`);
            const f2 = path.join(__dirname, `px_${char}_${scenario}_${i}_post.png`);
            await page.screenshot({ path: f2 });
            console.log('transition at frame', i, '->', f2);
        }
        await page.evaluate('window.__stepOne()');
    }

    // ── 解析 ──
    // 不変量(a): 剣筋の最下端ピクセルは「切っ先がこれまでに到達した最深Y」を越えない。
    //   (振りかぶり中に、既に振り抜いた軌跡が現在の切っ先より下にあるのは剣筋として正常)
    // 不変量(b): 凍結遷移の前後フレームで剣筋最下端が「下へ」動かない(正の延長のみNG。
    //   負＝フェードで縮む方向は許容)
    let runMaxTipY = -Infinity;
    let maxOverrun = -Infinity, overrunFrame = null;
    for (const f of frames) {
        if (f.tipY !== null) runMaxTipY = Math.max(runMaxTipY, f.tipY);
        if (!f.attacking || f.cyanCount === 0 || !Number.isFinite(runMaxTipY)) continue;
        const over = f.cyanMaxY - runMaxTipY;
        if (over > maxOverrun) { maxOverrun = over; overrunFrame = f.i; }
    }
    let freezeJump = null, endJump = null;
    for (let k = 1; k < frames.length; k++) {
        const a = frames[k - 1], b = frames[k];
        if (a.cyanCount === 0 || b.cyanCount === 0) continue;
        const d = +(b.cyanMaxY - a.cyanMaxY).toFixed(1); // 正=下へ伸びた(NG)
        if (!a.frozen && b.frozen) freezeJump = d;
        if (a.attacking && !b.attacking) endJump = d;
    }
    for (const f of frames) console.log(JSON.stringify(f));
    console.log('SUMMARY', JSON.stringify({
        char, scenario,
        maxOverrunPx: Number.isFinite(maxOverrun) ? +maxOverrun.toFixed(1) : null,
        overrunFrame,
        freezeFlagSignedJumpPx: freezeJump,
        attackEndSignedJumpPx: endJump,
        framesMeasured: frames.length
    }));
    await browser.close();
})();
