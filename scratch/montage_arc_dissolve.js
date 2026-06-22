// フェードの old→new 溶けを精密に見せる: コンボ→完全終了→一時停止→コマ送りで等間隔キャプチャ→1枚に合成
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:8777/character_preview.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.game && window.game.player && window.game.player.comboSlashTrailPoints, { timeout: 15000 });
  await page.evaluate(() => { const b = document.getElementById('btnModeNinja'); if (b && !b.classList.contains('active')) b.click(); });
  await sleep(200);

  // コンボ発火(段が上がるまで押す)
  let maxStep = 0;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('z');
    for (let w = 0; w < 6; w++) {
      await sleep(45);
      const s = await page.evaluate(() => { const p = window.game.player; return (p && p.currentAttack) ? (p.currentAttack.comboStep | 0) : 0; });
      if (s > maxStep) maxStep = s;
    }
    if (maxStep >= 5) break;
  }
  // コンボ完全終了(comboStep=0 & active=0 & frozen>0)まで待つ
  await page.waitForFunction(() => {
    const p = window.game.player;
    const cs = (p && p.currentAttack) ? (p.currentAttack.comboStep | 0) : 0;
    const ac = (p && p.comboSlashTrailPoints) ? p.comboSlashTrailPoints.length : 0;
    return p && !p.isAttacking && cs === 0 && ac === 0 && p.comboSlashTrailFrozenCurves && p.comboSlashTrailFrozenCurves.length > 0;
  }, { timeout: 4000 }).catch(() => {});

  // 一時停止(Escape)
  await page.keyboard.press('Escape');
  await sleep(60);

  // コマ送りで等間隔キャプチャ。STEP_PER_SHOT*16.67ms ごと
  const STEP_PER_SHOT = 6;   // ~100ms
  const SHOTS = 9;
  const dataUrls = [];
  for (let i = 0; i < SHOTS; i++) {
    const url = await page.evaluate(() => window.game.canvas.toDataURL('image/png'));
    dataUrls.push(url);
    for (let s = 0; s < STEP_PER_SHOT; s++) { await page.evaluate(() => { window.__stepFrameRequested = true; }); await sleep(22); }
  }

  // 合成: 別ページのcanvasにグリッド描画
  const cols = 3, rows = Math.ceil(SHOTS / cols);
  const cw = 800, ch = 500, pad = 8, label = 22;
  const montage = await page.evaluate(async (dataUrls, cols, rows, cw, ch, pad, label, STEP_PER_SHOT) => {
    const scale = 0.5;
    const cellW = cw * scale, cellH = ch * scale;
    const W = cols * cellW + (cols + 1) * pad;
    const H = rows * (cellH + label) + (rows + 1) * pad;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#1b1b1b'; cx.fillRect(0, 0, W, H);
    const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
    for (let i = 0; i < dataUrls.length; i++) {
      const im = await load(dataUrls[i]);
      const c = i % cols, r = (i / cols) | 0;
      const x = pad + c * (cellW + pad), y = pad + r * (cellH + label + pad);
      cx.drawImage(im, x, y + label, cellW, cellH);
      cx.fillStyle = '#9fe8ff'; cx.font = '13px sans-serif';
      cx.fillText(`+${Math.round(i * STEP_PER_SHOT * (1000 / 60))}ms`, x + 4, y + 15);
      cx.strokeStyle = '#333'; cx.strokeRect(x, y + label, cellW, cellH);
    }
    return cv.toDataURL('image/png');
  }, dataUrls, cols, rows, cw, ch, pad, label, STEP_PER_SHOT);

  const b64 = montage.replace(/^data:image\/png;base64,/, '');
  const outFile = path.join(OUT, 'arc_dissolve_montage.png');
  fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
  console.log('maxStep', maxStep, ' montage ->', outFile);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
