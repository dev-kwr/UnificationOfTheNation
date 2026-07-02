const puppeteer = require('puppeteer');

// 大薙(xAttack)中の step3/step4 ライブ剣筋の安定性をピクセル実測する。
// 方式: 各フレームで (A)通常描画 と (B)renderComboSlashTrail を no-op にした描画 を撮り、
//       diff = 剣筋レイヤーだけのピクセル。pale(大薙範囲エフェクト)/bright(ベース剣筋)を分類して bbox を追跡。
// フラフラ判定: growth 完了後の bbox のフレーム間Δ。Yドリフト: minY/maxY の系列変化。
// usage: node probe_oonagi34.js [shogun|ninja]
const char = (process.argv[2] || 'ninja').toLowerCase();
const btn = char === 'ninja' ? 'btnModeNinja' : 'btnModeShogun';

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setCacheEnabled(false);
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('http://localhost:8779/character_preview.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2200));

    // ---- セットアップ: キャラ選択 + 大薙ON + step1→step2 を完了させ step3 直前まで ----
    const setup = await page.evaluate(`
        (() => {
            document.getElementById('${btn}').click();
            window.isPaused = false;
            const p = window.game.player;
            p.clearSpecialState(true);
            p.vx = 0; p.vy = 0;
            p.x = 300 - p.getWorldWidth() / 2;
            p.y = p.groundY + 32 - p.getWorldHeight();
            p.isGrounded = true;
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0;
            p.attackCooldown = 0; p.attackCombo = 0; p.comboResetTimer = 0;
            p.comboStep5IdleTransitionTimer = 0; p.comboStep5RecoveryAttack = null;
            // 大薙ON
            if (!p.tempNinjutsuTimers) p.tempNinjutsuTimers = {};
            p.tempNinjutsuTimers.xAttack = 999999;
            const boostOn = p.isXAttackBoostActive();
            // step1 完了
            p.attack();
            let e = 0; const d1 = p.currentAttack ? p.currentAttack.durationMs : 300;
            while (e < d1) { p.update(16.67 / 1000); e += 16.67; }
            p.attackTimer = 0; p.attackCooldown = 0;
            // step2 完了
            p.attack();
            let e2 = 0; const d2 = p.currentAttack ? p.currentAttack.durationMs : 300;
            while (e2 < d2) { p.update(16.67 / 1000); e2 += 16.67; }
            p.attackTimer = 0; p.attackCooldown = 0;
            window.isPaused = true;
            window.__p = p;
            window.__stepOne = () => { p.update(16.67 / 1000); };

            const cvs = document.getElementById('previewCanvas');
            const c2d = cvs.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const W = Math.floor(1280 * dpr), H = Math.floor(720 * dpr);
            window.__capA = () => { window.__A = c2d.getImageData(0, 0, W, H).data; return true; };
            window.__hideTrail = () => { p.renderComboSlashTrail = () => {}; return true; };
            window.__capBDiffRestore = () => {
                const B = c2d.getImageData(0, 0, W, H).data;
                delete p.renderComboSlashTrail; // prototype 実装へ復帰
                const A = window.__A;
                let pb = [1e9, 1e9, -1, -1], bb = [1e9, 1e9, -1, -1];
                let pc = 0, bc = 0;
                for (let yy = Math.floor(120 * dpr); yy < H; yy++) {
                    for (let xx = 0; xx < W; xx++) {
                        const o = (yy * W + xx) * 4;
                        const d = Math.abs(A[o] - B[o]) + Math.abs(A[o + 1] - B[o + 1]) + Math.abs(A[o + 2] - B[o + 2]);
                        if (d > 14) {
                            const wx = xx / dpr, wy = yy / dpr;
                            const bright = A[o + 2] > 195 && A[o + 1] > 150;
                            const t = bright ? bb : pb;
                            if (bright) bc++; else pc++;
                            if (wx < t[0]) t[0] = wx;
                            if (wy < t[1]) t[1] = wy;
                            if (wx > t[2]) t[2] = wx;
                            if (wy > t[3]) t[3] = wy;
                        }
                    }
                }
                const rnd = (a) => a[2] < 0 ? null : a.map(v => +v.toFixed(1));
                const np = p.comboSlashTrailPoints[p.comboSlashTrailPoints.length - 1] || null;
                const atk = p.currentAttack || null;
                // 巨刀切先の実軌跡: giantTip = armEnd + 1.8*(tip - armEnd)
                let gt = null;
                try {
                    const pose = p.getComboSwordPoseState({
                        x: p.x, y: p.y, width: p.getWorldWidth(), height: p.getWorldHeight(),
                        facingRight: p.facingRight, isCrouching: p.isCrouching,
                        currentAttack: p.currentAttack, attackTimer: p.attackTimer
                    });
                    if (pose && Number.isFinite(pose.armEndX) && Number.isFinite(pose.tipX)) {
                        gt = {
                            gx: +(pose.armEndX + 1.8 * (pose.tipX - pose.armEndX)).toFixed(1),
                            gy: +(pose.armEndY + 1.8 * (pose.tipY - pose.armEndY)).toFixed(1),
                            tx: +pose.tipX.toFixed(1), ty: +pose.tipY.toFixed(1),
                            ax: +pose.armEndX.toFixed(1), ay: +pose.armEndY.toFixed(1),
                            L: +Math.hypot(pose.tipX - pose.armEndX, pose.tipY - pose.armEndY).toFixed(1)
                        };
                    }
                } catch (e) {}
                return {
                    pale: rnd(pb), paleN: pc, bright: rnd(bb), brightN: bc,
                    px: +p.x.toFixed(1), py: +p.y.toFixed(1),
                    attacking: p.isAttacking, step: atk ? atk.comboStep : 0,
                    el: atk && Number.isFinite(atk.motionElapsedMs) ? +atk.motionElapsedMs.toFixed(0) : null,
                    npt: np ? {
                        rel: !!np.trailIsRelative,
                        plX: Number.isFinite(np.playerX) ? +np.playerX.toFixed(1) : null,
                        plY: Number.isFinite(np.playerY) ? +np.playerY.toFixed(1) : null,
                        csX: Number.isFinite(np.trailCurveStartX) ? +np.trailCurveStartX.toFixed(1) : null,
                        csY: Number.isFinite(np.trailCurveStartY) ? +np.trailCurveStartY.toFixed(1) : null,
                        ceX: Number.isFinite(np.trailCurveEndX) ? +np.trailCurveEndX.toFixed(1) : null,
                        ceY: Number.isFinite(np.trailCurveEndY) ? +np.trailCurveEndY.toFixed(1) : null
                    } : null,
                    fsp: atk && atk.fixedStartWorldPoint ? { x: +atk.fixedStartWorldPoint.x.toFixed(1), y: +atk.fixedStartWorldPoint.y.toFixed(1) } : null,
                    ttp: atk && Number.isFinite(atk.trailTransformPlayerX) ? { x: +atk.trailTransformPlayerX.toFixed(1), y: +atk.trailTransformPlayerY.toFixed(1) } : null,
                    gt,
                    buf: (() => {
                        const h = {};
                        for (const q of (p.comboSlashTrailPoints || [])) { const s = q.step || 0; h[s] = (h[s] || 0) + 1; }
                        return h;
                    })(),
                    fcs: (p.comboSlashTrailFrozenCurves || []).map(f => {
                        const r1 = (v) => Number.isFinite(v) ? +v.toFixed(1) : null;
                        const lp = (Array.isArray(f.frozenPoints) && f.frozenPoints.length)
                            ? f.frozenPoints[f.frozenPoints.length - 1] : f;
                        return {
                            ty: f.type, st: f.step, res: r1(f.rangeEffectScale),
                            cs: [r1(lp.trailCurveStartX), r1(lp.trailCurveStartY)],
                            ce: [r1(lp.trailCurveEndX), r1(lp.trailCurveEndY)],
                            rel: !!lp.trailIsRelative, dir: Number.isFinite(lp.dir) ? lp.dir : null,
                            plY: r1(lp.playerY), age: r1(f.age), life: r1(f.life)
                        };
                    })
                };
            };
            return { boostOn, step2Done: true, px: +p.x.toFixed(1) };
        })();
    `);
    console.log('SETUP', JSON.stringify(setup));

    const clean = (process.argv[3] || '') === 'clean';
    const measureStep = async (stepNo, maxFrames) => {
        await page.evaluate(`(() => { const p = window.__p; p.attackTimer = 0; p.attackCooldown = 0; p.attack(); ${clean ? 'if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;' : ''} return p.currentAttack ? p.currentAttack.comboStep : 0; })()`);
        const frames = [];
        for (let i = 0; i < maxFrames; i++) {
            await page.evaluate('window.__stepOne()');
            await new Promise(r => setTimeout(r, 85));
            await page.evaluate('window.__capA()');
            await page.evaluate('window.__hideTrail()');
            await new Promise(r => setTimeout(r, 95));
            const m = await page.evaluate('window.__capBDiffRestore()');
            m.i = i;
            frames.push(m);
            if (i === Math.floor(maxFrames / 2)) {
                await page.screenshot({ path: `out/oonagi_${char}_step${stepNo}_mid.png` });
            }
            if (!m.attacking) break;
        }
        return frames;
    };

    // ---- step3 実測 ----
    const f3 = await measureStep(3, 26);
    // ---- step4 実測(el≈250=バッファ1点まで減った後で連鎖→1点凍結の検証) ----
    const f4 = await measureStep(4, 15);
    // ---- step5 連鎖(step4剣筋がここで凍結される) ----
    const f5 = await measureStep(5, 12);
    // ---- 追加数フレーム ----
    const fPost = [];
    for (let i = 0; i < 4; i++) {
        await page.evaluate('window.__stepOne()');
        await new Promise(r => setTimeout(r, 85));
        await page.evaluate('window.__capA()');
        await page.evaluate('window.__hideTrail()');
        await new Promise(r => setTimeout(r, 95));
        const m = await page.evaluate('window.__capBDiffRestore()');
        m.i = i;
        fPost.push(m);
        if (i === 2) await page.screenshot({ path: `out/oonagi_${char}_post_frozen.png` });
    }

    const summarize = (frames, label) => {
        const act = frames.filter(f => f.attacking && f.pale && f.paleN > 300);
        let maxJump = { dMinX: 0, dMinY: 0, dMaxX: 0, dMaxY: 0 };
        for (let k = 1; k < act.length; k++) {
            const a = act[k - 1].pale, b = act[k].pale;
            maxJump.dMinX = Math.max(maxJump.dMinX, Math.abs(b[0] - a[0]));
            maxJump.dMinY = Math.max(maxJump.dMinY, Math.abs(b[1] - a[1]));
            maxJump.dMaxX = Math.max(maxJump.dMaxX, Math.abs(b[2] - a[2]));
            maxJump.dMaxY = Math.max(maxJump.dMaxY, Math.abs(b[3] - a[3]));
        }
        const drift = act.length >= 2 ? {
            minX: +(act[act.length - 1].pale[0] - act[0].pale[0]).toFixed(1),
            minY: +(act[act.length - 1].pale[1] - act[0].pale[1]).toFixed(1),
            maxY: +(act[act.length - 1].pale[3] - act[0].pale[3]).toFixed(1)
        } : null;
        console.log(`SUMMARY_${label}`, JSON.stringify({ frames: act.length, maxFrameJump: maxJump, driftFirstToLast: drift }));
    };

    for (const f of f3) console.log('S3', JSON.stringify(f));
    summarize(f3, 'STEP3');
    for (const f of f4) console.log('S4', JSON.stringify(f));
    summarize(f4, 'STEP4');
    for (const f of f5) console.log('S5', JSON.stringify(f));
    for (const f of fPost) console.log('SP', JSON.stringify(f));
    await browser.close();
})();
