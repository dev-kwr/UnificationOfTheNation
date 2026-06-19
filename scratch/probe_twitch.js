const puppeteer = require('puppeteer');

// 実時間60fpsでstep5剣筋の「終点ピクピク痙攣」を再現・計測する。
// ページ内rAFフックで毎描画フレーム、解析終点(attack.trailCurve*投影)と
// その周辺200x200pxのシアン最遠点・輝度を記録し、振動(非単調な往復)を検出する。
// usage: node probe_twitch.js [shogun|ninja] [air|ground]
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

    const result = await page.evaluate(`
        new Promise((resolve) => {
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
            p.attack(); // step5 — ここからは実時間で走らせる(isPausedのまま=ゲームループが回す)
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            const a5 = p.currentAttack;

            const cvs = document.getElementById('previewCanvas');
            const c2d = cvs.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const rec = [];
            const t0 = performance.now();
            const sample = () => {
                const t = performance.now() - t0;
                // 解析終点（投影）
                const e = p.projectComboTrailSpecPointToWorld(a5, a5.trailCurveEndX, a5.trailCurveEndY);
                // 終点周辺 200x200 のシアン最遠点（最下端）と最大輝度
                const bx = Math.max(0, Math.floor((e.x - 100) * dpr));
                const by = Math.max(0, Math.floor((e.y - 140) * dpr));
                const bw = Math.min(Math.floor(200 * dpr), Math.floor(1280 * dpr) - bx);
                const bh = Math.min(Math.floor(200 * dpr), Math.floor(720 * dpr) - by);
                let cMaxY = -1, cAtX = -1, cMaxB = 0, cnt = 0;
                if (bw > 0 && bh > 0) {
                    const img = c2d.getImageData(bx, by, bw, bh);
                    const d = img.data;
                    for (let yy = 0; yy < bh; yy++) {
                        for (let xx = 0; xx < bw; xx++) {
                            const o = (yy * bw + xx) * 4;
                            const r = d[o], g = d[o + 1], b = d[o + 2];
                            if (b > 160 && g > 110 && (b - r) > 30) {
                                cnt++;
                                const wy = (by + yy) / dpr;
                                if (wy > cMaxY) { cMaxY = wy; cAtX = (bx + xx) / dpr; }
                                if (b > cMaxB) cMaxB = b;
                            }
                        }
                    }
                }
                rec.push({
                    t: +t.toFixed(0),
                    endX: +e.x.toFixed(2), endY: +e.y.toFixed(2),
                    pxEndY: +cMaxY.toFixed(1), pxEndX: +cAtX.toFixed(1),
                    cnt, maxB: cMaxB,
                    frozen: a5.trailCurveFrozen === true,
                    attacking: p.isAttacking && p.currentAttack === a5,
                    grounded: p.isGrounded,
                    py: +p.y.toFixed(1)
                });
                if (t < 2000 && rec.length < 130) {
                    requestAnimationFrame(sample);
                } else {
                    resolve(rec);
                }
            };
            requestAnimationFrame(sample);
        });
    `);

    // 振動検出: 解析終点とピクセル終点それぞれの方向反転(>0.8px)を数える
    const detectOsc = (key) => {
        let flips = 0, lastDir = 0, maxAmp = 0;
        for (let i = 1; i < result.length; i++) {
            const a = result[i - 1][key], b = result[i][key];
            if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) continue;
            const d = b - a;
            if (Math.abs(d) < 0.8) continue;
            const dir = Math.sign(d);
            if (lastDir !== 0 && dir !== lastDir) { flips++; maxAmp = Math.max(maxAmp, Math.abs(d)); }
            lastDir = dir;
        }
        return { flips, maxAmp: +maxAmp.toFixed(1) };
    };
    for (const f of result) console.log(JSON.stringify(f));
    console.log('SUMMARY', JSON.stringify({
        char, scenario,
        analyticEndOsc: detectOsc('endY'),
        pixelEndOsc: detectOsc('pxEndY'),
        frames: result.length
    }));
    await browser.close();
})();
