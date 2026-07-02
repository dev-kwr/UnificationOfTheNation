const puppeteer = require('puppeteer');

// 【実ゲーム(index.html)】大薙 step3/step4 凍結遷移の実測。
// character_preview では再現しない実機のみのズレ要因(カメラ/anchor/pose差/凍結経路)を特定する。
// 方式: g.runFrameUpdates を noop 化し g.deltaTime=1/60; g.update() で決定論ステップ。
//       diff法(renderComboSlashTrail noop トグル)で剣筋レイヤーのみの bbox を追跡。
//       getComboSwordPoseState をラップして描画が実際に使った刃長Lを記録(sxズレ検出)。
// usage: node probe_oonagi_real.js
(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setCacheEnabled(false);
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('http://localhost:8779/index.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2500));

    const setup = await page.evaluate(`
        (() => {
            const g = window.game;
            if (!g) return { err: 'no game' };
            try { g.startNewGame(); } catch (e) { return { err: 'startNewGame: ' + e.message }; }
            return { started: true, state: g.state };
        })();
    `);
    console.log('SETUP1', JSON.stringify(setup));
    await new Promise(r => setTimeout(r, 3000)); // イントロ暗転明け待ち

    const setup2 = await page.evaluate(`
        (() => {
            const g = window.game;
            // イントロを強制終了して playing へ
            try { g.state = 'playing'; } catch (e) {}
            const p = g.player;
            if (!p) return { err: 'no player' };
            // 大薙を即時ON(guardのinterval任せにしない)
            if (!p.tempNinjutsuTimers) p.tempNinjutsuTimers = {};
            p.tempNinjutsuTimers.xAttack = 999999;
            // 新規セーブはコンボ2段まで。昇段(特級)にして step3-5 を解禁
            if (p.progression) { p.progression.normalCombo = 3; p.progression.subWeapon = 3; p.progression.special = 3; }
            // 時間凍結(A/B撮影間の時刻差による背景/UIアニメのdiffノイズを消す)
            const realNow = performance.now.bind(performance);
            window.__rn = realNow;
            window.__freezeTime = () => { const t = realNow(); performance.now = () => t; return true; };
            window.__unfreezeTime = () => { performance.now = realNow; return true; };
            // 敵・被弾を無効化(常駐ガード)
            window.__guard = setInterval(() => {
                try {
                    if (Array.isArray(g.enemies)) g.enemies.length = 0;
                    if (Array.isArray(g.projectiles)) g.projectiles.length = 0;
                    if (Array.isArray(g.enemyProjectiles)) g.enemyProjectiles.length = 0;
                    p.health = p.maxHealth || 100;
                    p.invincibleTimer = 99999;
                    if (!p.tempNinjutsuTimers) p.tempNinjutsuTimers = {};
                    p.tempNinjutsuTimers.xAttack = 999999;
                } catch (e) {}
            }, 100);
            // 位置: ステージ左寄り(カメラクランプ域)
            p.vx = 0; p.vy = 0;
            p.x = 240;
            p.isGrounded = true;
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0;
            p.attackCooldown = 0; p.attackCombo = 0; p.comboResetTimer = 0;
            // 更新停止(rAFの描画は続く) + 手動決定論ステップ
            g.runFrameUpdates = () => {};
            window.__step = () => { g.deltaTime = 1 / 60; g.update(); };
            window.__p = p; window.__g = g;
            // pose刃長ロガー
            const origPose = p.getComboSwordPoseState.bind(p);
            window.__poseL = [];
            p.getComboSwordPoseState = function (s) {
                const r = origPose(s);
                try {
                    if (r && Number.isFinite(r.armEndX) && Number.isFinite(r.tipX)) {
                        const L = +Math.hypot(r.tipX - r.armEndX, r.tipY - r.armEndY).toFixed(1);
                        if (!window.__poseL.length || Math.abs(window.__poseL[window.__poseL.length - 1] - L) > 0.5) window.__poseL.push(L);
                    } else {
                        window.__poseL.push(null);
                    }
                } catch (e) { window.__poseL.push('ERR'); }
                return r;
            };

            const cvs = document.getElementById('game-canvas');
            const c2d = cvs.getContext('2d');
            const W = cvs.width, H = cvs.height;
            window.__capA = () => { window.__A = c2d.getImageData(0, 0, W, H).data; return true; };
            window.__hideTrail = () => { p.renderComboSlashTrail = () => {}; return true; };
            window.__capBDiffRestore = () => {
                const B = c2d.getImageData(0, 0, W, H).data;
                delete p.renderComboSlashTrail;
                const A = window.__A;
                let pb = [1e9, 1e9, -1, -1], bb = [1e9, 1e9, -1, -1];
                let pc = 0, bc = 0;
                for (let yy = 0; yy < H; yy++) {
                    for (let xx = 0; xx < W; xx++) {
                        const o = (yy * W + xx) * 4;
                        const d = Math.abs(A[o] - B[o]) + Math.abs(A[o + 1] - B[o + 1]) + Math.abs(A[o + 2] - B[o + 2]);
                        if (d > 14) {
                            const bright = A[o + 2] > 195 && A[o + 1] > 150;
                            const t = bright ? bb : pb;
                            if (bright) bc++; else pc++;
                            if (xx < t[0]) t[0] = xx;
                            if (yy < t[1]) t[1] = yy;
                            if (xx > t[2]) t[2] = xx;
                            if (yy > t[3]) t[3] = yy;
                        }
                    }
                }
                const rnd = (a) => a[2] < 0 ? null : a;
                const atk = p.currentAttack || null;
                return {
                    pale: rnd(pb), paleN: pc, bright: rnd(bb), brightN: bc,
                    px: +p.x.toFixed(1), py: +p.y.toFixed(1),
                    attacking: p.isAttacking, step: atk ? atk.comboStep : 0,
                    camX: Number.isFinite(g.cameraX) ? +g.cameraX.toFixed(1) : null,
                    buf: (() => { const h = {}; for (const q of (p.comboSlashTrailPoints || [])) { const s = q.step || 0; h[s] = (h[s] || 0) + 1; } return h; })(),
                    fcs: (p.comboSlashTrailFrozenCurves || []).map(f => {
                        const r1 = (v) => Number.isFinite(v) ? +v.toFixed(1) : null;
                        const lp = (Array.isArray(f.frozenPoints) && f.frozenPoints.length) ? f.frozenPoints[f.frozenPoints.length - 1] : f;
                        return { ty: f.type, st: f.step, res: r1(f.rangeEffectScale), cs: [r1(lp.trailCurveStartX), r1(lp.trailCurveStartY)], ce: [r1(lp.trailCurveEndX), r1(lp.trailCurveEndY)], dir: Number.isFinite(lp.dir) ? lp.dir : null, anch: !!f.boostAnchor };
                    }),
                    poseL: window.__poseL.splice(0)
                };
            };
            // step1→step2 を完了させる
            p.attack();
            let e = 0; const d1 = p.currentAttack ? p.currentAttack.durationMs : 300;
            while (e < d1) { window.__step(); e += 16.67; }
            p.attackTimer = 0; p.attackCooldown = 0;
            p.attack();
            let e2 = 0; const d2 = p.currentAttack ? p.currentAttack.durationMs : 300;
            while (e2 < d2) { window.__step(); e2 += 16.67; }
            p.attackTimer = 0; p.attackCooldown = 0;
            return { ok: true, boost: p.isXAttackBoostActive(), px: +p.x.toFixed(1), char: p.characterType, W, H };
        })();
    `);
    console.log('SETUP2', JSON.stringify(setup2));

    const measure = async (label, stepNo, maxFrames, shotAt) => {
        await page.evaluate(`(() => { const p = window.__p; p.attackTimer = 0; p.attackCooldown = 0; p.attack(); return true; })()`);
        for (let i = 0; i < maxFrames; i++) {
            await page.evaluate('window.__step()');
            await new Promise(r => setTimeout(r, 70));
            // 時間を凍結してから A(通常)/B(剣筋なし) を撮る=時刻差による背景/UIアニメのdiffノイズを排除
            await page.evaluate('window.__freezeTime()');
            await new Promise(r => setTimeout(r, 60));
            await page.evaluate('window.__capA()');
            await page.evaluate('window.__hideTrail()');
            await new Promise(r => setTimeout(r, 95));
            const m = await page.evaluate('window.__capBDiffRestore()');
            await page.evaluate('window.__unfreezeTime()');
            m.i = i;
            console.log(label, JSON.stringify(m));
            if (i === shotAt) await page.screenshot({ path: `out/real_${label}_f${i}.png` });
            if (!m.attacking && i > 3) break;
        }
    };

    await measure('R3', 3, 22, 12);   // step3 ライブ(終盤まで)
    await measure('R4', 4, 10, 5);    // step4(早期にstep5へ) — R4開始時にstep3が凍結される
    await measure('R5', 5, 8, 2);     // step5 — R5開始時にstep4が凍結される
    // ---- step5終了→アイドル: 非攻撃中(pose無効)の凍結帯ジャンプを検出する区間 ----
    // step5の残り時間を進めて攻撃終了させる
    await page.evaluate(`(() => { let n = 0; while (window.__p.isAttacking && n < 80) { window.__step(); n++; } return n; })()`);
    for (let i = 0; i < 6; i++) {
        await page.evaluate('window.__step()');
        await new Promise(r => setTimeout(r, 70));
        await page.evaluate('window.__freezeTime()');
        await new Promise(r => setTimeout(r, 60));
        await page.evaluate('window.__capA()');
        await page.evaluate('window.__hideTrail()');
        await new Promise(r => setTimeout(r, 95));
        const m = await page.evaluate('window.__capBDiffRestore()');
        await page.evaluate('window.__unfreezeTime()');
        m.i = i;
        console.log('RIDLE', JSON.stringify(m));
        if (i === 1) await page.screenshot({ path: 'out/real_idle_frozen.png' });
    }
    await browser.close();
})();
