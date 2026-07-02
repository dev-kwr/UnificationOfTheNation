const puppeteer = require('puppeteer');

// 大薙 点火/収納アニメの「元刀ピッタリ」検証。
// 各 igniteMs/retractMs で (A)エフェクト有 と (B)エフェクト無(xAttack=0) を撮り、
// diff=エフェクトだけの bbox を、元刀の切先(pose tip)と比較する。
// 期待: igniteMs=0 / retractMs≈RETRACT で bbox が元刀の刃領域+グロー余白(~15px)に収まり、
//       切先を大きく超えない(旧ctx.scaleは反りが縮んで曲線がズレた)。
// usage: node probe_ignite.js [shogun|ninja]
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

    await page.evaluate(`
        (() => {
            document.getElementById('${btn}').click();
            window.isPaused = true;
            const p = window.game.player;
            p.clearSpecialState(true);
            p.vx = 0; p.vy = 0;
            p.x = 500 - p.getWorldWidth() / 2;
            p.y = p.groundY + 32 - p.getWorldHeight();
            p.isGrounded = true;
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0;
            if (!p.tempNinjutsuTimers) p.tempNinjutsuTimers = {};
            window.__p = p;
            const cvs = document.getElementById('previewCanvas');
            const c2d = cvs.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const W = Math.floor(1280 * dpr), H = Math.floor(720 * dpr);
            window.__setFx = (ignite, retract) => {
                if (ignite === null) { p.tempNinjutsuTimers.xAttack = 0; p._oonagiIgniteMs = 99999; p._oonagiRetractMs = 99999; }
                else if (retract) { p.tempNinjutsuTimers.xAttack = 0; p._oonagiIgniteMs = 99999; p._oonagiRetractMs = ignite; }
                else { p.tempNinjutsuTimers.xAttack = 999999; p._oonagiIgniteMs = ignite; p._oonagiRetractMs = 99999; }
                return true;
            };
            window.__capA = () => { window.__A = c2d.getImageData(0, 0, W, H).data; return true; };
            window.__capBDiff = () => {
                const B = c2d.getImageData(0, 0, W, H).data;
                const A = window.__A;
                let bb = [1e9, 1e9, -1, -1], n = 0;
                for (let yy = Math.floor(120 * dpr); yy < H; yy++) {
                    for (let xx = 0; xx < W; xx++) {
                        const o = (yy * W + xx) * 4;
                        const d = Math.abs(A[o] - B[o]) + Math.abs(A[o + 1] - B[o + 1]) + Math.abs(A[o + 2] - B[o + 2]);
                        if (d > 20) {
                            n++;
                            const wx = xx / dpr, wy = yy / dpr;
                            if (wx < bb[0]) bb[0] = wx;
                            if (wy < bb[1]) bb[1] = wy;
                            if (wx > bb[2]) bb[2] = wx;
                            if (wy > bb[3]) bb[3] = wy;
                        }
                    }
                }
                let pose = null;
                try {
                    pose = p.getComboSwordPoseState({
                        x: p.x, y: p.y, width: p.getWorldWidth(), height: p.getWorldHeight(),
                        facingRight: p.facingRight, isCrouching: p.isCrouching,
                        currentAttack: null, attackTimer: 0
                    });
                } catch (e) {}
                return {
                    fx: bb[2] < 0 ? null : bb.map(v => +v.toFixed(1)), n,
                    tip: pose && Number.isFinite(pose.tipX) ? { x: +pose.tipX.toFixed(1), y: +pose.tipY.toFixed(1) } : null,
                    arm: pose && Number.isFinite(pose.armEndX) ? { x: +pose.armEndX.toFixed(1), y: +pose.armEndY.toFixed(1) } : null
                };
            };
            return true;
        })();
    `);

    const cases = [
        ['ignite0', 0, false], ['ignite40', 40, false], ['ignite80', 80, false], ['full', 150, false],
        ['retract110', 110, true], ['retract219', 219, true]
    ];
    for (const [label, ms, isRetract] of cases) {
        await page.evaluate(`window.__setFx(${ms}, ${isRetract})`);
        await new Promise(r => setTimeout(r, 120));
        await page.evaluate('window.__capA()');
        if (label === 'ignite0' || label === 'full' || label === 'retract219') {
            await page.screenshot({ path: `out/ignite_${char}_${label}.png` });
        }
        await page.evaluate('window.__setFx(null, false)');
        await new Promise(r => setTimeout(r, 120));
        const m = await page.evaluate('window.__capBDiff()');
        console.log(label, JSON.stringify(m));
    }
    await browser.close();
})();
