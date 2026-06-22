// 1段 vs 5段 のフェード所要時間と速度(px/ms)を実測。速度一定になったか確認。
const pp = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await pp.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  await p.goto('http://localhost:8777/character_preview.html', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.game && window.game.player && window.game.player.comboSlashTrailPoints, { timeout: 15000 });

  const installLum = () => p.evaluate(() => {
    const cv = window.game.canvas; const cx = cv.getContext('2d', { willReadFrequently: true });
    window.__trailLum = () => {
      const W = cv.width, H = cv.height; const d = cx.getImageData(0, 0, W, H).data; let s = 0;
      for (let i = 0; i < d.length; i += 8) { const r = d[i], g = d[i + 1], bl = d[i + 2]; if ((bl - r > 24 && bl > 80) || (r > 175 && g > 175 && bl > 195)) s += 0.3 * r + 0.59 * g + 0.11 * bl; }
      return s;
    };
  });

  const measure = async (presses, label) => {
    await p.evaluate(() => { const r = document.getElementById('btnRestart'); if (r) r.click(); });
    await sleep(500);
    await installLum();
    let maxStep = 0;
    for (let i = 0; i < presses; i++) {
      await p.keyboard.press('z');
      for (let w = 0; w < 6; w++) { await sleep(45); const s = await p.evaluate(() => { const a = window.game.player.currentAttack; return a ? (a.comboStep | 0) : 0; }); if (s > maxStep) maxStep = s; }
      if (maxStep >= 5) break;
    }
    await p.waitForFunction(() => { const pl = window.game.player; const cs = pl.currentAttack ? (pl.currentAttack.comboStep | 0) : 0; const ac = pl.comboSlashTrailPoints ? pl.comboSlashTrailPoints.length : 0; return !pl.isAttacking && cs === 0 && ac === 0 && pl.comboSlashTrailFrozenCurves && pl.comboSlashTrailFrozenCurves.length > 0; }, { timeout: 4000 }).catch(() => {});
    const arcMax = await p.evaluate(() => window.game.player._comboFadeArcMax || 0);
    // フェード計測: 一時停止してコマ送り(各16.67ms sim)。full→10% までのフレーム数×16.67=sim時間。
    await p.keyboard.press('Escape'); await sleep(60);
    const full = await p.evaluate(() => window.__trailLum());
    let steps = 0, s90 = null, s10 = null;
    for (let i = 0; i < 300; i++) {
      const lum = await p.evaluate(() => window.__trailLum());
      const r = full > 0 ? lum / full : 0;
      if (s90 === null && r < 0.90) s90 = steps;     // フェード実開始(保持終了)
      if (r < 0.10) { s10 = steps; break; }
      await p.evaluate(() => { window.__stepFrameRequested = true; }); await sleep(16);
      steps++;
    }
    await p.keyboard.press('Escape'); await sleep(40); // 再開
    const F = 1000 / 60;
    const holdMs = (s90 || 0) * F;
    const fadeMs = ((s10 || steps) - (s90 || 0)) * F; // 実フェード(90→10%)
    console.log(`${label} maxStep=${maxStep} arcMax=${Math.round(arcMax)} 保持=${Math.round(holdMs)}ms 実フェード(90→10%)=${Math.round(fadeMs)}ms 速度=${(arcMax * 0.8 / Math.max(1, fadeMs)).toFixed(2)}px/ms`);
  };
  await measure(1, '[1tap]');
  await measure(8, '[full]');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
