// step3 自然コンボ再現（将軍）: step1→2→3 を RAF を回しながら連続発動し、
// 他段の残トレイルを消さずに step3 進行中をスクショ。ユーザー報告の見た目を忠実再現する。
// usage: NODE_PATH=/Users/kaworu/Desktop/_Workspace/node_modules node probe_step3_natural.js
const puppeteer = require('puppeteer');
const path = require('path');
const PORT = process.env.PORT || 8777;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 640 });
    await page.setCacheEnabled(false);
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto(`http://localhost:${PORT}/character_preview.html`, { waitUntil: 'networkidle2' });
    await sleep(2400);

    await page.evaluate(`
        (() => {
            document.getElementById('btnModeShogun').click();
            window.isPaused = true;
            const p = window.game.player;
            p.clearSpecialState && p.clearSpecialState(true);
            p.facingRight = true;
            p.vx = 0; p.vy = 0;
            p.x = 180;
            p.y = p.groundY + 32 - p.getWorldHeight();
            p.isGrounded = true;
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0;
            p.attackCooldown = 0; p.attackCombo = 0; p.comboResetTimer = 0;
            window.__p = p;
            window.__stepOne = () => { window.__stepFrameRequested = true; };
            window.__doAttack = () => {
                p.attackTimer = 0; p.attackCooldown = 0; p.comboResetTimer = 9999;
                p.attack();
                return p.currentAttack ? p.currentAttack.comboStep : -1;
            };
            window.__info = () => {
                const a = p.currentAttack; if (!a) return { step: 0 };
                const dur = Math.max(1, a.durationMs || 300);
                const pr = Number.isFinite(a.motionElapsedMs) ? a.motionElapsedMs/dur : 1-(p.attackTimer/dur);
                return { step: a.comboStep, progress: +Math.max(0,Math.min(1,pr)).toFixed(3), x: +p.x.toFixed(0) };
            };
        })();
    `);

    const advance = async (frames) => {
        for (let i = 0; i < frames; i++) {
            await page.evaluate('window.__stepOne()');
            await sleep(40);
        }
    };

    // step1
    console.log('attack ->', await page.evaluate('window.__doAttack()'));
    await advance(16);
    // step2 (chain)
    console.log('attack ->', await page.evaluate('window.__doAttack()'));
    await advance(16);
    // step3 (chain) — ここで止めずに進行を観察
    console.log('attack ->', await page.evaluate('window.__doAttack()'));
    const shots = [0.45, 0.65, 0.9];
    let si = 0;
    for (let i = 0; i < 40; i++) {
        await page.evaluate('window.__stepOne()');
        await sleep(45);
        const info = await page.evaluate('window.__info()');
        if (info.step === 3 && si < shots.length && info.progress >= shots[si]) {
            const f = path.join(__dirname, `step3nat_p${Math.round(shots[si]*100)}.png`);
            await page.screenshot({ path: f });
            console.log('shot', shots[si], '->', path.basename(f), JSON.stringify(info));
            si++;
        }
        if (info.step !== 3 && i > 3) { console.log('left step3 at', JSON.stringify(info)); break; }
    }
    await browser.close();
})();
