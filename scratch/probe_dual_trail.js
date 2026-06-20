// 二刀流Zコンボ step1~3 の剣筋(奥=青/手前=赤)の歪みを再現するプローブ。
// usage: NODE_PATH=/Users/kaworu/Desktop/_Workspace/node_modules PORT=8777 STEP=1 MODE=ninja node probe_dual_trail.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.env.PORT || 8777;
const STEP = parseInt(process.env.STEP || '1');   // 1,2,3
const MODE = process.env.MODE || 'ninja';
const BTN = MODE === 'shogun' ? 'btnModeShogun' : 'btnModeNinja';

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 700 });
    await page.setCacheEnabled(false);
    page.on('pageerror', e => console.log('PAGEERR', e.message));
    page.on('console', m => { if (m.type()==='error') console.log('CONSOLEERR', m.text()); });
    await page.goto(`http://localhost:${PORT}/character_preview.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2200));
    await page.evaluate(`document.getElementById('${BTN}').click()`);
    await new Promise(r => setTimeout(r, 400));

    // 二刀流(Lv3=5段解放)を装備
    await page.evaluate(`(() => {
        window.isPaused = true; window.__stepFrameRequested=false;
        const p = window.game.player; window.__p = p;
        // 忍具Lv3
        const wl = document.getElementById('selWeaponLv'); if (wl){ wl.value='3'; wl.dispatchEvent(new Event('change')); }
        // 二刀流を選択
        window._previewWeapon = 'dual';
        if (typeof equipShogunPreviewWeapon === 'function') {} // noop (scope)
        // 直接装備
        const dual = (p.subWeapons||[]).find(w=>w && w.name==='二刀流');
        if (dual) { p.currentSubWeapon = dual; if (typeof dual.applyEnhanceTier==='function') dual.applyEnhanceTier(3); }
        p.facingRight = true; p.vx=0; p.vy=0;
        p.x = (p.getWorldWidth?400-p.getWorldWidth()/2:400-p.width/2);
        p.y = p.groundY + 32 - (p.getWorldHeight?p.getWorldHeight():p.height);
        p.isGrounded = true; p.isCrouching=false;
        p.attackCooldown=0; p.attackTimer=0; p.isAttacking=false;
        return { weapon: p.currentSubWeapon && p.currentSubWeapon.name, comboDamages: p.currentSubWeapon && p.currentSubWeapon.comboDamages };
    })()`).then(r=>console.log('setup', JSON.stringify(r)));

    // STEP回 attack() を呼んで目標段へ（リンク維持のため各回後に数フレームだけ進める）
    for (let s=0; s<STEP; s++) {
        await page.evaluate(`(() => { const p=window.__p; p.attackCooldown=0;
            // 接地・正面・低速を保ってからZ発動
            p.isGrounded=true; p.vy=0; p.isCrouching=false;
            p.attack();
        })()`);
        // 段の間は数フレーム（リンク猶予内）進める。最終段の手前まで。
        if (s < STEP-1) {
            for (let f=0; f<5; f++){ await page.evaluate('window.__stepFrameRequested=true'); await new Promise(r=>setTimeout(r,30)); }
        }
    }
    const info = await page.evaluate(`(() => { const p=window.__p; const w=p.currentSubWeapon;
        return { comboIndex:w.comboIndex, subAction:p.subWeaponAction, subTimer:Math.round(p.subWeaponTimer), mainDur:w.mainDuration, swingId:w._swingId }; })()`);
    console.log('after triggers ->', JSON.stringify(info));

    // 目標swingを通して進め、複数progressでスクショ + 剣筋ピクセル走査
    const shots = [0.3, 0.45, 0.6];
    let si=0;
    const cyanRedScan = `(() => {
        const cvs=document.getElementById('previewCanvas'); const c2d=cvs.getContext('2d');
        const W=cvs.width,H=cvs.height; const d=c2d.getImageData(0,0,W,H).data;
        let blue=[], red=[];
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){const o=(y*W+x)*4;const r=d[o],g=d[o+1],b=d[o+2],a=d[o+3]; if(a<40)continue;
            if(b>180&&g>150&&(b-r)>40) blue.push([x,y]);
            else if(r>180&&(r-b)>70&&(r-g)>70) red.push([x,y]);
        }
        const bbox=(pts)=>{ if(!pts.length)return null; let a=1e9,b=-1e9,c=1e9,e=-1e9; for(const[x,y]of pts){if(x<a)a=x;if(x>b)b=x;if(y<c)c=y;if(y>e)e=y;} return {n:pts.length,w:Math.round(b-a),h:Math.round(e-c)}; };
        return { blue:bbox(blue), red:bbox(red) };
    })()`;
    for (let i=0;i<40;i++){
        await page.evaluate('window.__stepFrameRequested=true'); await new Promise(r=>setTimeout(r,40));
        const st = await page.evaluate(`(() => { const p=window.__p,w=p.currentSubWeapon;
            const prog = (typeof w.getMainSwingProgress==='function')? w.getMainSwingProgress():0;
            return { prog:+prog.toFixed(3), action:p.subWeaponAction, timer:Math.round(p.subWeaponTimer) }; })()`);
        while (si<shots.length && st.prog>=shots[si]) {
            const fn = path.join(OUT, `dual_${MODE}_s${STEP}_p${String(Math.round(shots[si]*100)).padStart(2,'0')}.png`);
            await page.screenshot({ path: fn });
            const scan = await page.evaluate(cyanRedScan);
            console.log(`shot p${shots[si]} (prog ${st.prog}) -> ${path.basename(fn)} blue=${JSON.stringify(scan.blue)} red=${JSON.stringify(scan.red)}`);
            si++;
        }
        if (st.action!=='二刀_Z' && i>3) { console.log('action ended at i',i,'prog',st.prog); break; }
    }
    await browser.close();
})();
