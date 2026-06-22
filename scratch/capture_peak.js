// step1始点のそげ切り分け: 最大輝度(フェード前)で 1tap と full をキャプチャ
const pp = require('puppeteer');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await pp.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 }); await p.setCacheEnabled(false);
  await p.goto('http://localhost:8777/character_preview.html', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.game && window.game.player && window.game.player.comboSlashTrailPoints, { timeout: 15000 });
  const cap = async (presses, name) => {
    await p.evaluate(() => { const r = document.getElementById('btnRestart'); if (r) r.click(); });
    await sleep(500);
    const el = await p.$('#previewCanvas');
    let maxStep = 0;
    for (let i = 0; i < presses; i++) {
      await p.keyboard.press('z');
      for (let w = 0; w < 6; w++) { await sleep(45); const s = await p.evaluate(() => { const a = window.game.player.currentAttack; return a ? (a.comboStep | 0) : 0; }); if (s > maxStep) maxStep = s; }
      if (maxStep >= 5) break;
    }
    // 直後(まだ active 点があり全体明るい)に即キャプチャ。フェード前。
    await p.waitForFunction(() => { const pl = window.game.player; const fz = pl.comboSlashTrailFrozenCurves ? pl.comboSlashTrailFrozenCurves.length : 0; return fz > 0; }, { timeout: 3000 }).catch(() => {});
    await el.screenshot({ path: path.join(OUT, name) });
    console.log(name, 'maxStep', maxStep);
  };
  await cap(1, 'peak_1tap.png');
  await cap(8, 'peak_full.png');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
