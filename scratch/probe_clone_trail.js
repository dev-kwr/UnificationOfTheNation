// Lv2ミラー分身 step3/step4 剣筋忠実性プローブ
// 目的: 本体(中央)の剣筋と、ミラー分身(左右)の剣筋が「X平行移動でぴったり一致」するか
//       をピクセル実測で検証する。一致しなければ分身の剣筋がおかしい。
// 手法: シアン剣筋ピクセルを走査 → 各実体(本体/分身)の中心X近傍にバンド分割 →
//       各バンドを自分の中心Xで正規化 → 本体クラウドと分身クラウドのbbox/形状を比較。
// usage: NODE_PATH=/Users/kaworu/Desktop/_Workspace/node_modules PORT=8777 STEP=3 node probe_clone_trail.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 8777;
const STEP = parseInt(process.env.STEP || '3');   // 3 or 4
const MODE = process.env.MODE || 'ninja';          // ninja or shogun

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 700 });
    await page.setCacheEnabled(false);
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text()); });
    await page.goto(`http://localhost:${PORT}/character_preview.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2200));

    await page.evaluate(`(() => {
        ${MODE === 'shogun' ? "document.getElementById('btnModeShogun').click();" : "document.getElementById('btnModeNinja').click();"}
    })()`);
    await new Promise(r => setTimeout(r, 400));

    await page.evaluate(`(() => {
        window.isPaused = true;
        window.__stepFrameRequested = false;
        const p = window.game.player;
        window.__p = p;
        // 奥義Lv2 (ミラー分身4体)
        p.progression = p.progression || {};
        p.progression.specialClone = 2;
        p.progression.normalCombo = 3;
        if (typeof p.rebuildSpecialCloneSlots === 'function') p.rebuildSpecialCloneSlots();

        p.facingRight = true;
        p.vx = 0; p.vy = 0;
        p.x = (typeof p.getWorldWidth==='function') ? (400 - p.getWorldWidth()/2) : (400 - p.width/2);
        p.y = p.groundY + 32 - (typeof p.getWorldHeight==='function'? p.getWorldHeight() : p.height);
        p.isGrounded = true;
        p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0;
        p.attackCooldown = 0; p.attackCombo = 0; p.comboResetTimer = 0;
        if (Array.isArray(p.comboSlashTrailPoints)) p.comboSlashTrailPoints.length = 0;
        if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
        // 奥義トグルON(プレビューが毎フレーム解除しないように)
        document.getElementById('btnOugi').click();
    })()`);

    // 1フレーム: applyPreviewEffectState が useSpecial を発火(詠唱開始)
    await page.evaluate('window.__stepFrameRequested = true');
    await new Promise(r => setTimeout(r, 60));
    // 詠唱を即終了 → さらに1フレームで戦闘開始(onSpecialCloneStarted)・クローン生存
    await page.evaluate('(() => { const p=window.__p; p.specialCastTimer = 0; })()');
    await page.evaluate('window.__stepFrameRequested = true');
    await new Promise(r => setTimeout(r, 60));

    // 本体コンボを目標stepへ
    await page.evaluate(`(() => {
        const p = window.__p;
        // 攻撃直前に本体状態をリセット(詠唱フレームのドリフト除去)
        p.vx = 0; p.vy = 0; p.isGrounded = true;
        p.x = (typeof p.getWorldWidth==='function') ? (400 - p.getWorldWidth()/2) : (400 - p.width/2);
        p.y = p.groundY + 32 - (typeof p.getWorldHeight==='function'? p.getWorldHeight() : p.height);
        p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0; p.attackCooldown = 0;
        p.attackCombo = ${STEP - 1};
        if (Array.isArray(p.comboSlashTrailPoints)) p.comboSlashTrailPoints.length = 0;
        if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
        p.attack();
        // 各実体の中心Xを記録（本体 + 生存分身）
        const centers = [];
        centers.push({ kind:'body', x: (p.x + (typeof p.getWorldWidth==='function'? p.getWorldWidth():p.width)/2) });
        if (Array.isArray(p.specialClonePositions)) {
            p.specialClonePositions.forEach((pos, i) => {
                if (pos && p.specialCloneAlive && p.specialCloneAlive[i]) centers.push({ kind:'clone'+i, x: pos.x });
            });
        }
        window.__centers = centers;
        window.__a = p.currentAttack;
        window.__step = p.currentAttack ? p.currentAttack.comboStep : -1;

        const cvs = document.getElementById('previewCanvas');
        const c2d = cvs.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        window.__scan = () => {
            const W = cvs.width, H = cvs.height;
            const PW = Math.floor(W), PH = Math.floor(H);
            const img = c2d.getImageData(0, 0, PW, PH);
            const d = img.data;
            const cyan = [];
            for (let yy=0; yy<PH; yy++) for (let xx=0; xx<PW; xx++) {
                const o=(yy*PW+xx)*4; const r=d[o],gg=d[o+1],b=d[o+2],al=d[o+3];
                if (al<30) continue;
                if (b>200 && gg>150 && (b-r)>38) cyan.push([xx, yy]);
            }
            // 実体ごとにバンド分割(最近接中心X)
            const centers = window.__centers;
            const bands = centers.map(()=>[]);
            for (const [px,py] of cyan) {
                let bi=0, bd=1e9;
                centers.forEach((c,ci)=>{ const dd=Math.abs(px-c.x); if(dd<bd){bd=dd;bi=ci;} });
                bands[bi].push([px-centers[bi].x, py]); // 中心X正規化
            }
            const bbox = (pts)=>{ if(!pts.length) return null; let a=1e9,b=-1e9,c=1e9,e=-1e9; for(const[x,y]of pts){if(x<a)a=x;if(x>b)b=x;if(y<c)c=y;if(y>e)e=y;} return {n:pts.length,x0:+a.toFixed(1),x1:+b.toFixed(1),y0:+c.toFixed(1),y1:+e.toFixed(1),w:+(b-a).toFixed(1),h:+(e-c).toFixed(1)}; };
            return { centers, bands: bands.map((pts,ci)=>({kind:centers[ci].kind, bbox:bbox(pts)})), bandsRaw: bands };
        };
    })()`);

    console.log('MODE', MODE, 'STEP =', await page.evaluate('window.__step'), 'centers', JSON.stringify(await page.evaluate('window.__centers')));

    const shots = STEP === 3 ? [0.5, 0.8, 0.95] : [0.45, 0.7, 0.92];
    let si = 0;
    for (let i=0;i<90;i++) {
        await page.evaluate('window.__stepFrameRequested = true');
        await new Promise(r => setTimeout(r, 45));
        const st = await page.evaluate(`(() => {
            const p = window.__p; const a = window.__a;
            const dur = Math.max(1, a.durationMs||300);
            const progress = Number.isFinite(a.motionElapsedMs)? Math.max(0,Math.min(1,a.motionElapsedMs/dur)) : Math.max(0,Math.min(1,1-(p.attackTimer/dur)));
            return { progress:+progress.toFixed(3), attacking: p.isAttacking && p.currentAttack===a };
        })()`);
        while (si < shots.length && st.progress >= shots[si]) {
            const scan = await page.evaluate('(()=>{ const s=window.__scan(); return { centers:s.centers, bands:s.bands }; })()');
            const fn = path.join(OUT, `clone_${MODE}_s${STEP}_p${String(Math.round(shots[si]*100)).padStart(2,'0')}.png`);
            await page.screenshot({ path: fn });
            console.log('--- shot p', shots[si], 'progress', st.progress, '->', path.basename(fn));
            // 本体bandをbasis、各cloneとの差分を出す
            const body = scan.bands.find(b=>b.kind==='body');
            for (const band of scan.bands) {
                const bb = band.bbox;
                let diff = '';
                if (body && body.bbox && bb) {
                    diff = ` Δw=${(bb.w-body.bbox.w).toFixed(1)} Δh=${(bb.h-body.bbox.h).toFixed(1)} Δx0=${(bb.x0-body.bbox.x0).toFixed(1)} Δy0=${(bb.y0-body.bbox.y0).toFixed(1)} Δy1=${(bb.y1-body.bbox.y1).toFixed(1)}`;
                }
                console.log(`  ${band.kind.padEnd(7)} ${bb? JSON.stringify(bb):'null'}${diff}`);
            }
            si++;
        }
        if (!st.attacking && i>4) break;
    }

    await browser.close();
})();
