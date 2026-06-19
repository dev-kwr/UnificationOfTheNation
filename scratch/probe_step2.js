const puppeteer = require('puppeteer');

// step2回帰確認: freezeCurrentSlashTrail のスナップショット元を fixedCurvePt → lastPt に
// 変更したことで、攻撃終了(凍結)遷移時に step2 剣筋がワープ/伸縮しないかをピクセルで確認
// usage: node probe_step2.js [shogun|ninja]
const char = (process.argv[2] || 'shogun').toLowerCase();
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
            // step1を完了 → step2発動
            p.attack();
            let e = 0; const d1 = p.currentAttack ? p.currentAttack.durationMs : 300;
            while (e < d1) { p.update(16.67 / 1000); e += 16.67; }
            p.attackTimer = 0; p.attackCooldown = 0;
            p.attack(); // step2
            p.comboSlashTrailPoints.length = 0; // step1残骸を除去して分離測定
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            window.__a2 = p.currentAttack;
            window.isPaused = true;
            window.__stepOne = () => { p.update(16.67 / 1000); };

            const cvs = document.getElementById('previewCanvas');
            const c2d = cvs.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            window.__measure = () => {
                const x0 = 0, x1 = 1279, y0 = 0, y1 = 719;
                const img = c2d.getImageData(0, 0, Math.floor(1280 * dpr), Math.floor(720 * dpr));
                const data = img.data;
                const W = Math.floor(1280 * dpr);
                const H = Math.floor(720 * dpr);
                let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0;
                for (let yy = 0; yy < H; yy++) {
                    for (let xx = 0; xx < W; xx++) {
                        const o = (yy * W + xx) * 4;
                        const r = data[o], g = data[o + 1], b = data[o + 2];
                        if (b > 200 && g > 150 && (b - r) > 38 && yy / dpr > 120) { // UI帯を除外
                            count++;
                            const wx = xx / dpr, wy = yy / dpr;
                            if (wx < minX) minX = wx;
                            if (wx > maxX) maxX = wx;
                            if (wy < minY) minY = wy;
                            if (wy > maxY) maxY = wy;
                        }
                    }
                }
                return {
                    bbox: count ? [+minX.toFixed(1), +minY.toFixed(1), +maxX.toFixed(1), +maxY.toFixed(1)] : null,
                    count,
                    attacking: p.isAttacking,
                    step: p.currentAttack ? p.currentAttack.comboStep : 0
                };
            };
        })();
    `);

    const frames = [];
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 70));
        const m = await page.evaluate('window.__measure()');
        m.i = i;
        frames.push(m);
        if (!m.attacking && m.count === 0 && i > 5) break;
        await page.evaluate('window.__stepOne()');
    }
    let endJump = null;
    for (let k = 1; k < frames.length; k++) {
        const a = frames[k - 1], b = frames[k];
        if (a.attacking && !b.attacking && a.bbox && b.bbox) {
            endJump = {
                dMinX: +(b.bbox[0] - a.bbox[0]).toFixed(1),
                dMinY: +(b.bbox[1] - a.bbox[1]).toFixed(1),
                dMaxX: +(b.bbox[2] - a.bbox[2]).toFixed(1),
                dMaxY: +(b.bbox[3] - a.bbox[3]).toFixed(1)
            };
        }
    }
    for (const f of frames) console.log(JSON.stringify(f));
    console.log('SUMMARY', JSON.stringify({ char, step: 2, attackEndBBoxJump: endJump }));
    await browser.close();
})();
