// step3 剣筋診断プローブ（将軍）
// 目的: 通常コンボstep3の剣筋(シアン)が、振り途中で「斜め上」へ向かい、
//       最終(growth=1)の角度と食い違う現象をピクセル実測で可視化する。
// 計測: 各フレームで step3 剣筋シアンを getImageData で走査し
//   - 全シアン点への最小二乗で「トレイル全体の角度」
//   - 切先側(最右60px)シアン点で「切先付近の角度」
//   - 白刀身の最右点(=描画切先)
//   を取り、進行度(progress)ごとに角度がどう変わるかを出す。
// 内部値(start/control/end)も参考出力するが、判定はピクセル角度で行う。
// usage: NODE_PATH=/Users/kaworu/Desktop/_Workspace/node_modules node probe_step3.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// 生成物(スクショ等)はすべて scratch/out/ 配下に出す（gitignore対象）
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const PORT = process.env.PORT || 8777;

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 640 });
    await page.setCacheEnabled(false);
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text()); });
    await page.goto(`http://localhost:${PORT}/character_preview.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2400));

    // セットアップ: 将軍モード、接地、step3 を発動して他段トレイルを除去して単独計測
    await page.evaluate(`
        (() => {
            document.getElementById('btnModeShogun').click();
            window.isPaused = true;
            const p = window.game.player;
            p.clearSpecialState && p.clearSpecialState(true);
            p.facingRight = true;
            p.vx = 0; p.vy = 0;
            p.x = 300;
            p.y = p.groundY + 32 - p.getWorldHeight();
            p.isGrounded = true;
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            p.isAttacking = false; p.currentAttack = null; p.attackTimer = 0;
            p.attackCooldown = 0; p.attackCombo = 0; p.comboResetTimer = 0;

            // step3 へ直接: combo を 2 にして attack() → comboStep 3
            p.attackCombo = 2;
            p.attack();
            // 他段の残骸を除去して step3 剣筋だけを残す
            p.comboSlashTrailPoints.length = 0;
            if (Array.isArray(p.comboSlashTrailFrozenCurves)) p.comboSlashTrailFrozenCurves.length = 0;
            window.__a = p.currentAttack;
            window.__step = p.currentAttack ? p.currentAttack.comboStep : -1;

            const cvs = document.getElementById('previewCanvas');
            const c2d = cvs.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            window.__dpr = dpr;
            window.__cw = cvs.width; window.__ch = cvs.height;

            window.__measure = () => {
                const a = window.__a;
                const dur = Math.max(1, a.durationMs || 300);
                const progress = Number.isFinite(a.motionElapsedMs)
                    ? Math.max(0, Math.min(1, a.motionElapsedMs / dur))
                    : Math.max(0, Math.min(1, 1 - (p.attackTimer / dur)));

                // 内部: 最新トレイル点のカーブ start/control/end（参考）
                let curve = null;
                const pts = p.comboSlashTrailPoints;
                if (pts && pts.length) {
                    const n = pts[pts.length - 1];
                    curve = {
                        sx: n.trailCurveStartX, sy: n.trailCurveStartY,
                        cx: n.trailCurveControlX, cy: n.trailCurveControlY,
                        ex: n.trailCurveEndX, ey: n.trailCurveEndY
                    };
                }
                // 内部: 描画切先（getShogunStep3RenderedTipWorld）
                let renderedTip = null;
                if (typeof p.getShogunStep3RenderedTipWorld === 'function') {
                    const rt = p.getShogunStep3RenderedTipWorld({
                        x: p.x, y: p.y, facingRight: p.facingRight, isCrouching: false,
                        currentAttack: a, attackTimer: p.attackTimer
                    });
                    if (rt) renderedTip = { x: +rt.x.toFixed(1), y: +rt.y.toFixed(1) };
                }

                // ピクセル走査: キャンバス全域
                const W = window.__cw, H = window.__ch;
                const img = c2d.getImageData(0, 0, Math.floor(W * dpr), Math.floor(H * dpr));
                const data = img.data;
                const PW = Math.floor(W * dpr), PH = Math.floor(H * dpr);
                const cyan = [];
                let bladeMaxX = -1, bladeAtY = -1;
                for (let yy = 0; yy < PH; yy++) {
                    for (let xx = 0; xx < PW; xx++) {
                        const o = (yy * PW + xx) * 4;
                        const r = data[o], g = data[o+1], b = data[o+2], al = data[o+3];
                        if (al < 30) continue;
                        // シアン剣筋
                        if (b > 200 && g > 150 && (b - r) > 38) {
                            cyan.push([xx / dpr, yy / dpr]);
                        }
                        // 白刀身（高輝度・低彩度）
                        if (r > 195 && g > 205 && b > 230 && (b - r) <= 38) {
                            if (xx / dpr > bladeMaxX) { bladeMaxX = xx / dpr; bladeAtY = yy / dpr; }
                        }
                    }
                }
                const fitAngle = (points) => {
                    if (points.length < 8) return null;
                    let mx = 0, my = 0;
                    for (const [px, py] of points) { mx += px; my += py; }
                    mx /= points.length; my /= points.length;
                    let sxx = 0, sxy = 0, syy = 0;
                    for (const [px, py] of points) {
                        const dx = px - mx, dy = py - my;
                        sxx += dx*dx; sxy += dx*dy; syy += dy*dy;
                    }
                    // 主成分の角度（度, 画面y下向き正）
                    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
                    return +(theta * 180 / Math.PI).toFixed(1);
                };
                let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
                for (const [px, py] of cyan) {
                    if (px < xmin) xmin = px; if (px > xmax) xmax = px;
                    if (py < ymin) ymin = py; if (py > ymax) ymax = py;
                }
                // 切先側（最右60px）
                const nearSword = cyan.filter(([px]) => px >= xmax - 60);
                return {
                    progress: +progress.toFixed(3),
                    attacking: p.isAttacking && p.currentAttack === a,
                    cyanCount: cyan.length,
                    cyanXmin: Number.isFinite(xmin) ? +xmin.toFixed(1) : null,
                    cyanXmax: Number.isFinite(xmax) ? +xmax.toFixed(1) : null,
                    cyanYmin: Number.isFinite(ymin) ? +ymin.toFixed(1) : null,
                    cyanYmax: Number.isFinite(ymax) ? +ymax.toFixed(1) : null,
                    angleAll: fitAngle(cyan),
                    angleNearSword: fitAngle(nearSword),
                    nearSwordCount: nearSword.length,
                    bladeMaxX: +bladeMaxX.toFixed(1), bladeAtY: +bladeAtY.toFixed(1),
                    renderedTip,
                    curve: curve ? {
                        sx: curve.sx!=null?+curve.sx.toFixed(1):null, sy: curve.sy!=null?+curve.sy.toFixed(1):null,
                        cx: curve.cx!=null?+curve.cx.toFixed(1):null, cy: curve.cy!=null?+curve.cy.toFixed(1):null,
                        ex: curve.ex!=null?+curve.ex.toFixed(1):null, ey: curve.ey!=null?+curve.ey.toFixed(1):null
                    } : null
                };
            };
            window.__stepOne = () => { window.__stepFrameRequested = true; };
        })();
    `);

    console.log('step =', await page.evaluate('window.__step'));

    const frames = [];
    const shotAt = [0.35, 0.5, 0.65, 0.8, 0.95];
    let shotIdx = 0;
    for (let i = 0; i < 80; i++) {
        // 1フレーム進める（RAFループ内で update+描画）
        await page.evaluate('window.__stepOne()');
        await new Promise(r => setTimeout(r, 55)); // RAF 描画待ち
        const m = await page.evaluate('window.__measure()');
        m.i = i;
        frames.push(m);
        // 指定progressでスクショ
        while (shotIdx < shotAt.length && m.progress >= shotAt[shotIdx]) {
            const f = path.join(OUT, `step3_p${String(Math.round(shotAt[shotIdx]*100)).padStart(2,'0')}.png`);
            await page.screenshot({ path: f });
            console.log('shot', shotAt[shotIdx], '->', path.basename(f), '(progress', m.progress + ')');
            shotIdx++;
        }
        if (!m.attacking && i > 4) break;
    }

    for (const f of frames) console.log(JSON.stringify(f));
    await browser.close();
})();
