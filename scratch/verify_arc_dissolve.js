// 通常コンボ剣筋 (B)arc-length フェード検証
//  - ページ内で renderPlayerCombatLayer をラップし、毎フレーム canvas を getImageData 実測
//  - コンボ発火('z'連打)→フェードを記録。剣筋ピクセルの「出現順(=age)」と「フェード中の各順位の残光」を計測
//  - 検証点: (1)古い順位から先に消える (2)全体輝度が単調・滑らかに減衰(1コマ急降下/二段なし)
//  - モンタージュPNG をフェード各時点で保存
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
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.game && window.game.player && window.game.player.comboSlashTrailPoints, { timeout: 15000 });
  // 確実に忍者モード
  await page.evaluate(() => { const b = document.getElementById('btnModeNinja'); if (b && !b.classList.contains('active')) b.click(); });
  await sleep(200);

  // ページ内レコーダー設置
  await page.evaluate(() => {
    const g = window.game;
    const cv = g.canvas;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const W = cv.width, H = cv.height;
    const STEP = 2;                 // ピクセル間引き
    const CELL = 4;                 // 出現グリッドのセル(devicePx)
    const gw = Math.ceil(W / CELL);
    window.__rec = { W, H, CELL, gw, frames: [], started: false };

    const isTrail = (r, gg, b) => {
      // 青/シアン/白の剣筋。背景#333・地面#555 はグレー(R≈G≈B)。剣筋は B が突出 or 高輝度白芯。
      if (b - r > 24 && b > 80) return true;
      if (r > 175 && gg > 175 && b > 195) return true;
      return false;
    };

    const orig = g.renderPlayerCombatLayer.bind(g);
    g.renderPlayerCombatLayer = function (ctx) {
      orig(ctx);
      const rec = window.__rec;
      if (!rec.started) return; // 記録開始フラグが立つまでスキップ
      let img;
      try { img = cx.getImageData(0, 0, W, H); } catch (e) { return; }
      const d = img.data;
      const cells = [];
      const lums = [];
      let total = 0, cnt = 0;
      for (let y = 0; y < H; y += STEP) {
        const row = y * W;
        for (let x = 0; x < W; x += STEP) {
          const i = (row + x) << 2;
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          if (!isTrail(r, gg, b)) continue;
          const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
          const cell = ((y / CELL) | 0) * rec.gw + ((x / CELL) | 0);
          cells.push(cell); lums.push(lum);
          total += lum; cnt++;
        }
      }
      const p = g.player;
      const fc = (p && p.comboSlashTrailFrozenCurves) ? p.comboSlashTrailFrozenCurves : [];
      let minAge = Infinity, maxAge = 0;
      for (const c of fc) { const a = c.age || 0; if (a < minAge) minAge = a; if (a > maxAge) maxAge = a; }
      rec.frames.push({
        t: performance.now(),
        total, cnt,
        comboStep: (p && p.currentAttack) ? (p.currentAttack.comboStep | 0) : 0,
        attacking: p ? !!p.isAttacking : false,
        frozen: fc.length,
        active: (p && p.comboSlashTrailPoints) ? p.comboSlashTrailPoints.length : 0,
        minFrozenAge: Number.isFinite(minAge) ? Math.round(minAge) : -1,
        maxFrozenAge: Math.round(maxAge),
        cells, lums,
      });
    };
  });

  // 記録開始
  await page.evaluate(() => { window.__rec.started = true; });
  await page.focus('#previewCanvas').catch(() => {});

  // コンボ発火: 段が上がるのを確認しながら z を押す(適応式)。最大8回 or step5 まで。
  const readStep = () => page.evaluate(() => {
    const p = window.game.player;
    return { step: (p && p.currentAttack) ? (p.currentAttack.comboStep | 0) : 0, attacking: !!(p && p.isAttacking) };
  });
  let maxStep = 0;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('z');
    // この一撃が反映されるのを待ちつつ、段が上がるか監視
    for (let w = 0; w < 6; w++) {
      await sleep(45);
      const s = await readStep();
      if (s.step > maxStep) maxStep = s.step;
    }
    if (maxStep >= 5) break;
  }
  console.log('発火後の maxComboStep(押下中観測):', maxStep);
  // チェイン完全終了(攻撃終了&コンボリセット&live点消化)まで待ってから、フェード montage を撮る
  await page.waitForFunction(() => {
    const p = window.game.player;
    const cs = (p && p.currentAttack) ? (p.currentAttack.comboStep | 0) : 0;
    const ac = (p && p.comboSlashTrailPoints) ? p.comboSlashTrailPoints.length : 0;
    return p && !p.isAttacking && cs === 0 && ac === 0 && p.comboSlashTrailFrozenCurves && p.comboSlashTrailFrozenCurves.length > 0;
  }, { timeout: 4000 }).catch(() => {});

  // フェード中モンタージュ(キャンバス領域)を一定間隔で撮影
  const shots = [];
  const SHOTS = 10, GAP = 120;
  const el = await page.$('#previewCanvas');
  for (let i = 0; i < SHOTS; i++) {
    const f = path.join(OUT, `arc_fade_${String(i).padStart(2, '0')}.png`);
    await el.screenshot({ path: f }).catch(() => {});
    shots.push(f);
    await sleep(GAP);
  }
  // 完全フェードまで少し追加で待つ(記録継続)
  await sleep(600);

  // 記録停止 & ページ内で出現順バケット解析
  const result = await page.evaluate(() => {
    const rec = window.__rec; rec.started = false;
    const frames = rec.frames;
    if (!frames.length) return { error: 'no frames' };
    const t0 = frames[0].t;
    for (const f of frames) f.tt = f.t - t0;

    // 衣装マスク: 完全フェード後(末尾)にも光っているセル=青ヘッドバンド/スカーフ等のキャラ装飾。剣筋ではないので除外。
    const costume = new Set();
    for (let idx = frames.length - 1; idx >= Math.max(0, frames.length - 6); idx--) {
      for (const cell of frames[idx].cells) costume.add(cell);
    }

    // 各セルの初出現フレーム(=age, 小さいほど古い) と ピーク輝度 (衣装セルは除外)
    const appear = new Map();   // cell -> firstFrameIdx
    const peakLum = new Map();  // cell -> max lum
    frames.forEach((f, idx) => {
      const c = f.cells, l = f.lums;
      for (let k = 0; k < c.length; k++) {
        const cell = c[k], lum = l[k];
        if (costume.has(cell)) continue;
        if (!appear.has(cell)) appear.set(cell, idx);
        if (!peakLum.has(cell) || lum > peakLum.get(cell)) peakLum.set(cell, lum);
      }
    });

    // フェード開始フレーム = コンボが完全に終わった(comboStep=0 かつ active点=0)最初のフレーム。
    // ※全体輝度の最大はコメット化でコンボ途中になるため使わない(描画中が混入し非単調になる)。
    let lastDrawing = -1;
    frames.forEach((f, idx) => { if (f.comboStep > 0 || f.active > 0) lastDrawing = idx; });
    const peakIdx = Math.min(frames.length - 1, lastDrawing + 1);
    // 衣装を除いた合計輝度(剣筋のみ)
    const trailTotal = (f) => { let s = 0; for (let k = 0; k < f.cells.length; k++) if (!costume.has(f.cells[k])) s += f.lums[k]; return s; };
    const peakTotal = Math.max(1, trailTotal(frames[peakIdx]));

    // ピーク時に明るいセルだけを対象に、出現順で10分位バケットに分割(衣装除外)
    const peakCells = [];
    {
      const pf = frames[peakIdx];
      const seen = new Set();
      for (let k = 0; k < pf.cells.length; k++) {
        const cell = pf.cells[k];
        if (costume.has(cell) || seen.has(cell)) continue; seen.add(cell);
        peakCells.push({ cell, app: appear.get(cell) ?? 0, peak: Math.max(1, peakLum.get(cell) || 1) });
      }
    }
    peakCells.sort((a, b) => a.app - b.app); // 古い順
    const NB = 10;
    const bucketOf = new Map();
    peakCells.forEach((pc, i) => { bucketOf.set(pc.cell, Math.min(NB - 1, (i * NB / peakCells.length) | 0)); });
    const bucketPeak = new Array(NB).fill(0);
    const bucketCnt = new Array(NB).fill(0);
    peakCells.forEach(pc => { const b = bucketOf.get(pc.cell); bucketPeak[b] += pc.peak; bucketCnt[b]++; });

    // フェード各フレームで、各バケットの残光率(現輝度合計/ピーク輝度合計)
    const fadeFrames = [];
    for (let idx = peakIdx; idx < frames.length; idx++) {
      const f = frames[idx];
      const cur = new Array(NB).fill(0);
      const curMap = new Map();
      for (let k = 0; k < f.cells.length; k++) { if (costume.has(f.cells[k])) continue; curMap.set(f.cells[k], Math.max(curMap.get(f.cells[k]) || 0, f.lums[k])); }
      peakCells.forEach(pc => { const b = bucketOf.get(pc.cell); cur[b] += (curMap.get(pc.cell) || 0); });
      const ratio = cur.map((v, b) => bucketPeak[b] > 0 ? +(v / bucketPeak[b]).toFixed(3) : 0);
      fadeFrames.push({ tt: Math.round(f.tt), totalRatio: +(trailTotal(f) / peakTotal).toFixed(3), bucketRatio: ratio });
    }

    return {
      nFrames: frames.length,
      peakIdx, peakTotal: Math.round(peakTotal),
      maxComboStep: Math.max(...frames.map(f => f.comboStep)),
      peakCellCount: peakCells.length,
      bucketCnt,
      maxComboStepSeen: Math.max(...frames.map(f => f.comboStep)),
      ageAtPeak: { min: frames[peakIdx].minFrozenAge, max: frames[peakIdx].maxFrozenAge },
      totalSeries: frames.map(f => ({ tt: Math.round(f.tt), r: +(f.total / peakTotal).toFixed(3), cs: f.comboStep, fz: f.frozen, ac: f.active, mn: f.minFrozenAge, mx: f.maxFrozenAge })),
      fadeFrames,
    };
  });

  fs.writeFileSync(path.join(OUT, 'arc_dissolve_result.json'), JSON.stringify(result, null, 1));

  // ---- Node 側で判定 ----
  console.log('=== arc-length dissolve 検証 ===');
  console.log('errs:', errs.slice(0, 5));
  if (result.error) { console.log('ERROR', result.error); await browser.close(); return; }
  console.log('frames:', result.nFrames, ' peakIdx:', result.peakIdx, ' maxComboStepSeen:', result.maxComboStepSeen, ' peakCells:', result.peakCellCount);
  console.log('ピーク時のfrozen age範囲: min=' + result.ageAtPeak.min + 'ms max=' + result.ageAtPeak.max + 'ms (max-min=age幅)');
  console.log('bucketCnt(古→新):', result.bucketCnt.join(','));

  const ff = result.fadeFrames;
  // (2) 全体輝度: 単調減衰 & 1コマ急降下/二段の検出
  let maxDrop = 0, dropAt = -1, nonMono = 0;
  for (let i = 1; i < ff.length; i++) {
    const d = ff[i - 1].totalRatio - ff[i].totalRatio; // 正=減少
    if (-d > 0.012) nonMono++;                          // 増加(揺り戻し)
    if (d > maxDrop) { maxDrop = d; dropAt = ff[i].tt; }
  }
  console.log(`\n[全体輝度] フレーム最大降下=${(maxDrop * 100).toFixed(1)}% @${dropAt}ms  揺り戻し回数=${nonMono}`);
  console.log('  totalRatio推移(間引き):', ff.filter((_, i) => i % 3 === 0).map(f => `${f.tt}ms:${(f.totalRatio * 100) | 0}%`).join('  '));

  // (1) 古い順位から先に消える: 各フェードフレームで bucketRatio が古(0)→新(9)に概ね単調増加か
  //     かつ 古バケットが先に0付近へ到達するか(残光が尽きる時刻)
  const NB = 10;
  const dieTime = new Array(NB).fill(null); // 各バケットが残光<15%へ落ちる最初の時刻
  ff.forEach(f => { f.bucketRatio.forEach((r, b) => { if (dieTime[b] === null && r < 0.15) dieTime[b] = f.tt; }); });
  console.log('\n[消滅時刻] バケット古→新 が <15% に落ちる時刻(ms):');
  console.log('  ', dieTime.map((t, b) => `b${b}:${t === null ? '—' : t}`).join('  '));
  // 古い順に早く消えるか(消滅時刻が概ね単調増加か)
  let ord = 0, ordViol = 0;
  for (let b = 1; b < NB; b++) {
    const a = dieTime[b - 1], c = dieTime[b];
    if (a !== null && c !== null) { if (c >= a - 30) ord++; else ordViol++; }
  }
  console.log(`  古→新の消滅順序: 正順=${ord}  逆転=${ordViol}`);

  // ポップ検出: 各バケットの1フレーム最大降下(除去ポップは特定バケットが急にゼロ落ちする)
  let worstPop = 0, popBucket = -1, popAt = -1;
  for (let b = 0; b < NB; b++) {
    for (let i = 1; i < ff.length; i++) {
      const d = ff[i - 1].bucketRatio[b] - ff[i].bucketRatio[b];
      if (d > worstPop) { worstPop = d; popBucket = b; popAt = ff[i].tt; }
    }
  }
  console.log(`\n[ポップ検出] バケット1フレーム最大降下=${(worstPop * 100).toFixed(1)}% (b${popBucket} @${popAt}ms)  ※大きいと除去ポップ`);

  // 代表フレームの bucket プロファイル
  console.log('\n[残光プロファイル] tt: b0(古)…b9(新)');
  ff.filter((_, i) => i % Math.max(1, Math.floor(ff.length / 8)) === 0).forEach(f => {
    console.log(`  ${String(f.tt).padStart(5)}ms: ` + f.bucketRatio.map(r => String(Math.round(r * 9)).replace('0', '·')).join(''));
  });

  // モンタージュ合成
  console.log('\nmontage shots:', shots.filter(f => fs.existsSync(f)).length, '枚 ->', OUT);
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
