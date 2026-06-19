const puppeteer = require('puppeteer');

// step5攻撃終了後に残る描画ソース(メインバッファ点/凍結カーブ)を連続フレームでダンプし、
// 「終点ピクピク」と「フェードしない残留」の正体を特定する
// usage: node probe_inspect.js [shogun|ninja]
const char = (process.argv[2] || 'ninja').toLowerCase();
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
            p.attack(); // step5
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            const a5 = p.currentAttack;
            const rec = [];
            const t0 = performance.now();
            const snap = () => {
                const t = performance.now() - t0;
                const wasAttacking = p.isAttacking && p.currentAttack === a5;
                // 攻撃終了から150ms後あたりで6フレーム分ダンプ
                if (!wasAttacking && t > 0) {
                    if (!snap.endT) snap.endT = t;
                    if (t - snap.endT > 150 && rec.length < 6) {
                        rec.push({
                            t: +t.toFixed(0),
                            points: p.comboSlashTrailPoints.map(pt => ({
                                step: pt.step, id: pt.trailAttackId,
                                age: +(pt.age || 0).toFixed(0), life: +(pt.life || 0).toFixed(0),
                                frozenFlag: pt.trailCurveFrozen === true,
                                endX: Number.isFinite(pt.trailCurveEndX) ? +pt.trailCurveEndX.toFixed(1) : null,
                                endY: Number.isFinite(pt.trailCurveEndY) ? +pt.trailCurveEndY.toFixed(1) : null
                            })),
                            frozen: (p.comboSlashTrailFrozenCurves || []).map(fc => ({
                                type: fc.type, step: fc.step,
                                age: +(fc.age || 0).toFixed(0), oldestAge: +(fc.oldestAge || 0).toFixed(0),
                                life: +(fc.life || 0).toFixed(0),
                                endX: Number.isFinite(fc.trailCurveEndX) ? +fc.trailCurveEndX.toFixed(1) : null,
                                endY: Number.isFinite(fc.trailCurveEndY) ? +fc.trailCurveEndY.toFixed(1) : null,
                                rel: !!fc.trailIsRelative,
                                nPts: Array.isArray(fc.frozenPoints) ? fc.frozenPoints.length : null
                            })),
                            recovery: !!p.comboStep5RecoveryAttack,
                            recoveryTimer: +(p.comboStep5IdleTransitionTimer || 0).toFixed(0)
                        });
                    }
                }
                if (rec.length < 6 && t < 4000) requestAnimationFrame(snap);
                else resolve(rec);
            };
            requestAnimationFrame(snap);
        });
    `);
    console.log(JSON.stringify(result, null, 1));
    await browser.close();
})();
