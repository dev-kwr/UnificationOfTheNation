// bossRenderer.js — フロアボスの素体・装具描画(描画専用。判定/AI/難易度には触れない)
//
// 設計の要点(提案書 scratch/boss_redesign_proposal.html で合意した内容):
//  ・素体はシルエットの棒人間。プレイヤー(将軍)の実測比率に一致させる
//    頭直径=全高0.362 / 胴幅0.126 / 脚の分岐0.672 / 足の左右幅0.089
//  ・素体色は全キャラ共通(#1a1a1a系)。差別化は装具の【形】で行う
//  ・輪郭はシルエットのみ(全部品の輪郭を先に描き、塗りで接続部を覆う)
//  ・2.5D: 体は画面側へ捻り、【奥の肩・腕・手は手前より進行方向側】に出る
//  ・奥腕は最背面の独立シルエット(胴と輪郭を繋げない)
//  ・忍具のレイヤーは奥腕と手前腕の【間】
//  ・四肢は腕も脚も同じ太さ。肘は片側固定・折れ量に上限(反転/鳥の羽を防ぐ)
//
// 座標系: 呼び出し側が「足元中央」を原点に translate 済み、進行方向が +x
//         (左向きは ctx.scale(-1,1) で反転してから呼ぶ)。単位は world px。

const TAU = Math.PI * 2;
const BOSS_H = 108;                 // 素体の基準全高(world px)
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cl01 = (v) => clamp(v, 0, 1);
const seg = (p, a, b) => cl01((p - a) / (b - a));
const ezOut = (t) => 1 - Math.pow(1 - t, 3);
const ezIn = (t) => t * t * t;
const ezIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
/* 割合で暗くする。プレイヤー側の shadeAccent と同じ規則
   (shade は定数減算なので、同じ色でも暗くなり方が食い違う)。 */
function shadeMul(hex, k){
  const n = parseInt(hex.slice(1), 16);
  const f = 1 + k;
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}
function hexA(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function poly(c, pts, fill){
  c.fillStyle = fill; c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath(); c.fill();
}
// 接地ロック歩容(忍者/将軍と同じ流儀): 接地相は足を地面に固定、遊脚相は弧で戻す
const RUNV = 105;
const GAIT = { stride: 32, duty: 0.44, lift: 9 };
GAIT.T = GAIT.stride / (GAIT.duty * RUNV);
function gaitFoot(ph){
  const { stride, duty, lift } = GAIT;
  if (ph < duty) { const u = ph / duty; return { x: lerp(stride/2, -stride/2, u), y: 0, planted: true, u }; }
  const u = (ph - duty) / (1 - duty);
  return { x: lerp(-stride/2, stride/2, ezIO(u)), y: -Math.sin(u * Math.PI) * lift, planted: false, u };
}
// 忍具を持たない/呼び出し側が描く場合のダミー(手は自然な下ろし手)
const EMPTY_WEAPON = {
  hands(r){
    const s = r.motion === 'run' ? Math.sin(r.runPh * TAU) : 0;
    return {
      back:  { x: r.shF.x + 8 + s * 7, y: r.shF.y + 12 },
      front: { x: r.shF.x + 1 - s * 7, y: r.shF.y + 14 }
    };
  },
  front(){}
};

/* 素体色は【プレイヤーと完全に同一の #1a1a1a 一色】。
   以前は奥腕 #121212・掌 #242424・頭 #161210 と部位ごとに変えており、
   プレイヤー(全身フラットな #1a1a1a)と並ぶと淡くまばらに見えた(ユーザー指摘)。
   奥行きはシルエット輪郭(OUT)とレイヤー順で作り、色では作らない。
   OUT/OUTW も playerRenderer の silhouetteOutline と同値。 */
const BODY={ core:'#1a1a1a', front:'#1a1a1a', back:'#1a1a1a', mitt:'#1a1a1a',
             OUT:'rgba(168,196,230,0.29)', OUTW:1.2 };
/* 流派別の袖(肩板)スケール。防具の「形」を変える(色替えで差別化しない) */
const SODE_S={ ashigaru:0.78, taisho:1.3, kengo:0.95, shinobi:0, busho:1.06 };
/* プレイヤー(忍者/将軍)と同じ関節の作り: 中点+進行方向法線オフセット(IK不使用)。
   ol=true でプレイヤー同様のシルエット輪郭を先に太描きする。 */
function limbN(c,ax,ay,hx,hy,frac,bend,mode,w1,w2,col,hi,pass='fill'){
  const dx=hx-ax, dy=hy-ay, len=Math.max(0.001,Math.hypot(dx,dy));
  let nx=-dy/len, ny=dx/len;
  if(mode==='fwd'){ if(nx<0){nx=-nx;ny=-ny;} }
  else if(mode==='back'){ if(nx>0){nx=-nx;ny=-ny;} }
  else { if(ny<0){nx=-nx;ny=-ny;} }          // down: 肘は重力側へ垂れる
  const jx=ax+dx*frac+nx*bend, jy=ay+dy*frac+ny*bend;
  c.lineCap='round'; c.lineJoin='round';
  if(pass==='ol'){   // 輪郭パス(シルエットのみ。塗りパスが後から接続部を覆う)
    c.strokeStyle=BODY.OUT; c.lineWidth=w1+BODY.OUTW;
    c.beginPath(); c.moveTo(ax,ay); c.lineTo(jx,jy); c.lineTo(hx,hy); c.stroke();
    return {jx,jy};
  }
  c.strokeStyle=col; c.lineWidth=w1;
  c.beginPath(); c.moveTo(ax,ay); c.lineTo(jx,jy); c.stroke();
  c.lineWidth=w2;
  c.beginPath(); c.moveTo(jx,jy); c.lineTo(hx,hy); c.stroke();
  c.fillStyle=col; c.beginPath(); c.arc(jx,jy,Math.min(w1,w2)*0.5,0,TAU); c.fill();
  return {jx,jy};
}

/* 二刀の刀身はプレイヤーと同一形状。katanaShape.js は依存ゼロなので循環しない
   (playerRenderer.js を直接 import すると game.js の TDZ でクラッシュする)。 */
import { drawKatanaShape } from './katanaShape.js?v=screen-safe-20260821b';
import { drawClothRibbon } from './clothRibbon.js?v=screen-safe-20260821b';
import { scaleHeadbandTailSpec, HEADBAND_TAIL_SPEC } from './clothChain.js?v=screen-safe-20260821b';
/* 雑魚/中ボスの攻撃エフェクト。描画専用で判定には触れない */
import {
  stepMobFx, onceThisAttack, feedTrail, drawTrail, updateRibbonChain,
  drawThrustStreak, drawThrustWave, drawFlash, drawBurstLines, mobGroundDust
} from './mobFx.js?v=screen-safe-20260821b';
/* 刀身長はプレイヤー実数値のまま渡し、拡大は描画側の ctx.scale だけで行う(二重拡大防止)。
   倍率は素体リグの SC(=1.8) ではなく【描画上の身長比】を使う:
     プレイヤーの描画身長 = height(72) - headRadius*0.1(=1.68) = 70.32
     ボスの描画身長       = BOSS_H = 108
   SC は四肢の太さを実機に合わせ込んだ値で身長比ではないため、これで刀を拡大すると
   17% 長い刀になる。 */
const DUAL_BLADE_LEN = 80;                          // player getKatanaBladeLength()
const KATANA_SC = 108 / (72 - 72 * (28 / 60) * 0.5 * 0.1);   // ≒1.536

/* 関節位置を実座標で与える版(playerRenderer の bendKneeToward 済みの膝を移植するため) */
function limbAt(c,ax,ay,jx,jy,hx,hy,w1,w2,col,pass='fill'){
  c.lineCap='round'; c.lineJoin='round';
  if(pass==='ol'){
    c.strokeStyle=BODY.OUT; c.lineWidth=w1+BODY.OUTW;
    c.beginPath(); c.moveTo(ax,ay); c.lineTo(jx,jy); c.lineTo(hx,hy); c.stroke();
    return {jx,jy};
  }
  c.strokeStyle=col; c.lineWidth=w1;
  c.beginPath(); c.moveTo(ax,ay); c.lineTo(jx,jy); c.stroke();
  c.lineWidth=w2;
  c.beginPath(); c.moveTo(jx,jy); c.lineTo(hx,hy); c.stroke();
  c.fillStyle=col; c.beginPath(); c.arc(jx,jy,Math.min(w1,w2)*0.5,0,TAU); c.fill();
  return {jx,jy};
}

/* 素体スケール: プレイヤー素体フレーム(60px) → ボス素体(108px) = ×1.8
   以下の数値はすべて playerRenderer の実装値 × SC(目測ではない) */
const SC=108/60;
/* 四肢は【腕も脚も前後も全て同一の太さ】。
   playerRenderer の armStrokeWidth=4.8(コメント「脚(前脛)と同じ太さ」)を ×SC。 */
const LIMB_W=4.8*(108/60);            // 8.64 — 全四肢共通
const LIMB_F=LIMB_W, LIMB_B=LIMB_W;
const TORSO_W=0.125*108;              // 13.5
/* 接地の基準をプレイヤーに合わせるための持ち上げ量(局所px。world では ×k)。
   playerRenderer は脚の終端(足首)を箱底より足の丸ぶん上に置き、【つま先の下端】が
   箱底に接する。このリグは足首を箱底に置いていたため、つま先が丸の半径ぶん沈み、
   同じ地面(groundY+LANE_OFFSET)に立たせても素体だけ 2.2px 下にはみ出していた
   —— プレイヤーが少し上に見える、というユーザー指摘(2026-08-15)の原因。
   実測: 箱底からのはみ出し プレイヤー 0.63px / 雑魚 2.88px / 中ボス 3.63px。
   足の丸 = 中心 0.22×SC + 半径 1.9×SC ぶん上げると残差 0.2px 以下に収まる。
   ※ world 座標で描く得物(weaponReplica)は持ち上げないので、
     toLocal 側でこのぶんを足し戻して手の位置を得物に合わせる。 */
const GROUND_LIFT=(0.22+1.9)*SC;      // 3.816
/* 腕(playerRenderer drawArm 実装): 肘=行程54%+最大2.5の微屈曲・
   手首1.35手前で止め・手=半径4.5の円・リーチ上限16.5 —— すべて ×SC */
/* 腕は【上腕・前腕とも長さ固定】の2骨IK。手が近いときは肘が曲がるだけで、
   腕全体が縮まない(中点+オフセット方式だとポーズごとに腕の長さが変わる)。 */
const ARM_L1=13.6*SC, ARM_L2=13.2*SC;   // playerRenderer standardUpper/ForeLen × SC
const ARM_REACH=21.6*SC;                // standardRightReach × SC(手が届く上限)
function armP(c,sx,sy,hx,hy,front,pass='fill'){
  let dx=hx-sx, dy=hy-sy, d=Math.hypot(dx,dy)||0.001;
  const LIM=ARM_REACH;
  if(d>LIM){ dx*=LIM/d; dy*=LIM/d; d=LIM; hx=sx+dx; hy=sy+dy; }
  const dmin=Math.abs(ARM_L1-ARM_L2)+2.0;
  if(d<dmin){ const k=dmin/d; dx*=k; dy*=k; d=dmin; }   // 潰れ防止(手位置は動かさない)
  /* 肘: 厳密IKだと手が近いとき深く折れて鳥の羽になる。
     中点からの垂直オフセットを上限 BEND_MAX で頭打ちにし、
     腕長のブレを小さく保ったまま肘を緩やかに曲げる。 */
  const BEND_MAX=5.0;
  const half=d*0.5;
  const raw=Math.sqrt(Math.max(0, ARM_L1*ARM_L1-half*half));
  const bend=Math.min(BEND_MAX, raw);
  /* 肘の曲がる側は【常に同じ】(人体の肘は一方向にしか折れない)。
     フレームごとに「下側」を判定すると腕が水平を越えた瞬間に反転して飛ぶ。
     腕ベクトルから見て時計回り90度側に固定 = 下ろした腕では後ろ下、
     振り上げた腕では前下に肘が来る、という連続した回り方になる。 */
  const nx=-dy/d, ny=dx/d;
  const ex=sx+dx*0.5+nx*bend;
  const ey=sy+dy*0.5+ny*bend;
  const wdx=hx-ex, wdy=hy-ey, wd=Math.hypot(wdx,wdy)||1;
  const wx=hx-(wdx/wd)*1.35*SC, wy=hy-(wdy/wd)*1.35*SC;
  const w=LIMB_W;
  const hr=palmR(front);
  c.lineCap='round'; c.lineJoin='round';
  /* 輪郭は付け根から inset だけ離して始める(プレイヤーの脚 legRootInset と同じ流儀)。
     こうすると腕の輪郭が最後まで残り、かつ胴に線が乗らない。 */
  const olPath=()=>{ const dxs=ex-sx, dys=ey-sy, ds=Math.hypot(dxs,dys)||1;
    const inset=Math.min(1, (w*0.55)/ds);
    c.beginPath(); c.moveTo(sx+dxs*inset,sy+dys*inset);
    c.lineTo(ex,ey); c.lineTo(wx,wy); c.lineTo(hx,hy); };
  if(pass==='own'||pass==='top'){  // 独立シルエット: 輪郭→塗りを連続して描く
    c.strokeStyle=BODY.OUT; c.lineWidth=w+BODY.OUTW; olPath(); c.stroke();
  }
  c.strokeStyle=front?BODY.core:BODY.back; c.lineWidth=w;
  c.beginPath(); c.moveTo(sx,sy); c.lineTo(ex,ey); c.lineTo(wx,wy); c.stroke();
  return {hx,hy,wx,wy,ex,ey};   // 掌の丸は得物より前面へ(drawPalm)
}

/* 手足の防具: 籠手(前腕)と脛当(脛)。素体の線に沿わせた薄い板で、シルエットを壊さない */
function drawKote(c,P,ex,ey,wx,wy){
  const dx=wx-ex, dy=wy-ey, d=Math.hypot(dx,dy)||1;
  const ux=dx/d, uy=dy/d, nx=-uy, ny=ux;
  const a0=0.30, a1=0.92, hw=LIMB_W*0.62;      // 前腕の30%〜92%を覆う
  const p=(t,side)=>[ex+ux*d*t+nx*hw*side, ey+uy*d*t+ny*hw*side];
  const g=c.createLinearGradient(...p(a0,-1),...p(a1,1));
  g.addColorStop(0,shade(P.aA,6)); g.addColorStop(1,shade(P.aB,-4));
  c.fillStyle=g; c.beginPath();
  c.moveTo(...p(a0,-1)); c.lineTo(...p(a1,-1)); c.lineTo(...p(a1,1)); c.lineTo(...p(a0,1));
  c.closePath(); c.fill();
  c.strokeStyle=hexA(P.edge,0.7); c.lineWidth=1;
  c.beginPath(); c.moveTo(...p(a1,-0.9)); c.lineTo(...p(a1,0.9)); c.stroke();
}
function drawSuneate(c,P,kx,ky,fx,fy){
  const dx=fx-kx, dy=fy-ky, d=Math.hypot(dx,dy)||1;
  const ux=dx/d, uy=dy/d, nx=-uy, ny=ux;
  const a0=0.12, a1=0.78, hw=LIMB_W*0.60;
  const p=(t,side)=>[kx+ux*d*t+nx*hw*side, ky+uy*d*t+ny*hw*side];
  const g=c.createLinearGradient(...p(a0,-1),...p(a1,1));
  g.addColorStop(0,shade(P.aA,2)); g.addColorStop(1,shade(P.aB,-8));
  c.fillStyle=g; c.beginPath();
  c.moveTo(...p(a0,-1)); c.lineTo(...p(a1,-1)); c.lineTo(...p(a1,1)); c.lineTo(...p(a0,1));
  c.closePath(); c.fill();
  c.strokeStyle=hexA(P.edge,0.55); c.lineWidth=0.9;
  c.beginPath(); c.moveTo(...p(0.45,-0.95)); c.lineTo(...p(0.45,0.95)); c.stroke();
}
/* 円形パーツの輪郭は「一段大きい円を輪郭色で塗る→本体を塗る」。
   ストロークで描くと中心線ぶん外へ 1.2px 出て、四肢(0.6px)より太く見える。 */
function discWithOutline(c,x,y,r,fill){
  c.fillStyle=BODY.OUT;
  c.beginPath(); c.arc(x,y,r+BODY.OUTW*0.5,0,TAU); c.fill();
  c.fillStyle=fill;
  c.beginPath(); c.arc(x,y,r,0,TAU); c.fill();
}
/* 掌 = 将軍参照でさらに小さく(頭半径の0.28)。腕との接続側は輪郭を描かない */
const palmR=(front)=>(front?4.5:4.2)*0.94*(108/60);   // 実装値 4.5/4.8 × 0.94 × SC
function drawPalm(c,x,y,front,wristX,wristY){
  const r=palmR(front);
  // 手首方向を避けて輪郭リングを描く(接続部に線を出さない)
  const a=Math.atan2(y-wristY,x-wristX);      // 手首→掌の向き
  const gap=0.85;                              // 手首側の欠け角
  c.strokeStyle=BODY.OUT; c.lineWidth=BODY.OUTW*0.5;
  c.beginPath(); c.arc(x,y,r+BODY.OUTW*0.25,a-Math.PI+gap,a+Math.PI-gap); c.stroke();
  c.fillStyle=BODY.core;
  c.beginPath(); c.arc(x,y,r,0,TAU); c.fill();
}

function drawSode(c,P,x,y,rot,scale){ // 袖(肩板)
  c.save(); c.translate(x,y); c.rotate(rot); c.scale(scale,scale);
  const g=c.createLinearGradient(-8,-4,8,8);
  g.addColorStop(0,shade(P.sh,-8)); g.addColorStop(1,shade(P.sh,-26));
  c.fillStyle=g;
  c.beginPath(); c.moveTo(-6.2,-2.6); c.quadraticCurveTo(0,-4.8,6.2,-2.6);
  c.lineTo(5.1,4.8); c.quadraticCurveTo(0,7.0,-5.1,4.8); c.closePath(); c.fill();
  c.strokeStyle=hexA(P.edge,0.7); c.lineWidth=1.1;
  c.beginPath(); c.moveTo(-4.8,3.1); c.quadraticCurveTo(0,4.9,4.8,3.1); c.stroke();
  c.restore();
}

/* 頭部 — 現行と同じ head 半径(≒棒人間の大きな頭)に兜/頭巾を被せる */
/* 物理チェーンの節点列を布のリボンとして塗る。
   playerRenderer.renderHeadbandTail と同じ流儀 —— 2回の平滑化で節のギザつきを消し、
   進行方向の法線へ幅を振り、先端へ向けて絞る。 */
/* 幅の規則はプレイヤー(playerRenderer.renderHeadbandTail)に合わせて
   【根元から先端まで一定】が既定。taper を渡した時だけ絞る。 */
/* 布の帯の塗りは clothRibbon.js の一本道に集約した(プレイヤーの鉢巻と共有)。
   ここは呼び出しの体裁を保つだけの薄い包み。点が3未満の呼び出しは
   従来どおり描かない(覆面の帯など短い曲線を弾いていた挙動を変えない)。 */
function drawBandRibbon(c, pts, halfWidth, color, taper){
  drawClothRibbon(c, pts, halfWidth, color, { taper: taper || 0, minPoints: 3 });
}

function drawHead(c,B,P,hx,hy,r,t,motion,rig){
  if(B.helm==='hood'){
    /* 覆面の読ませ方: 「目」ではなく【布と顔の境界】で見せる。
       ・頭巾(やや明るい布)が頭の上・後ろ・顎を包む
       ・前面に暗い顔の開口が三日月状に残る → 覆面だと一目で分かる
       ・余った帯は忍者の鉢巻と同じく後ろへ垂らす */
    /* 【垂れ帯は忍の鉢巻と同じ物理チェーン】(2026-08-17)。
       元はサインで揺らした固定カーブで、走っても止まっても同じ形に振れていた。
       他の布(プレイヤー/雑魚の鉢巻)が全部 clothChain の物理なので、
       ここだけ揺れ方が別種に見える。長さと根元は従来のまま、形だけ物理に差し替える。
       ・rig が無い環境(素の呼び出し)では従来の固定カーブに落とす
       ・奥(短い方)を先に描く。暗い方が上に乗ると前後が逆に見える
       ・色は割合で落とす(shadeMul)。定数減算の shade は元色で暗くなり方が食い違う */
    const hoodSim = !!(rig && rig.owner && typeof rig.toWorld === 'function'
                            && typeof rig.toLocal === 'function');
    const HOOD_BANDS = [[0.86, 1.72, 0.20], [0.62, 1.30, 0.15]];
    if (hoodSim) {
      const bs = Math.max(0.2, rig.bodyScale || 1);
      HOOD_BANDS.map((b, i) => [b, i]).reverse().forEach(([[ox, len, wd], i]) => {
        // 従来の描画長(局所 r*len)を保つように節長を決める
        const targetLocal = r * len;
        const base = (HEADBAND_TAIL_SPEC.near.count - 1) * HEADBAND_TAIL_SPEC.near.seg;
        const spec = scaleHeadbandTailSpec((targetLocal * bs) / base);
        const tail = i ? spec.far : spec.near;
        const rx = hx - r * ox, ry = hy + r * 0.10;
        const w = rig.toWorld(rx, ry);
        const nodes = updateRibbonChain(rig.owner, 'hood' + i, w.x, w.y, {
          count: tail.count, seg: tail.seg, dir: rig.dir,
          speedX: rig.owner.vx || 0, speedNorm: Math.max(1, rig.owner.speed || 1),
          time: (rig.owner.motionTime || 0) + tail.phaseMs,
          gravityMul: tail.gravityMul, windMul: tail.windMul
        });
        if (!nodes) return;
        const pts = nodes.map(n => rig.toLocal(n.x, n.y));
        drawBandRibbon(c, pts, r * wd * 0.5, i ? shadeMul(P.helm, spec.farShade) : P.helm);
      });
    } else {
      const wav=Math.sin(t*TAU/1.9)*1.8+(motion==='run'?2.4:0);
      HOOD_BANDS.forEach(([ox,len,wd],i)=>{
        const rx=hx-r*ox, ry=hy+r*0.10;
        c.fillStyle=i?shade(P.helm,-12):shade(P.helm,0);
        c.beginPath();
        c.moveTo(rx-r*wd, ry);
        c.quadraticCurveTo(rx-r*wd-wav*0.10*(i+1), ry+r*len*0.6, rx-r*(wd*0.6)-wav*0.16*(i+1), ry+r*len);
        c.lineTo(rx+r*(wd*0.7)-wav*0.16*(i+1), ry+r*len*0.97);
        c.quadraticCurveTo(rx+r*wd*0.9, ry+r*len*0.55, rx+r*wd, ry);
        c.closePath(); c.fill();
      });
    }
    /* 頭巾の布(頭全体を覆う) */
    const hg=c.createLinearGradient(hx,hy-r,hx-r*0.3,hy+r);
    hg.addColorStop(0,shade(P.helm,26)); hg.addColorStop(0.55,shade(P.helm,6)); hg.addColorStop(1,P.helmD);
    c.fillStyle=hg; c.beginPath(); c.arc(hx,hy,r,0,TAU); c.fill();

    /* 顔の開口 — 2.5D(画面側やや右向き)の【面】として抜く。
       右端に寄せた細い三日月にすると真横向きに見えるので、
       輪郭から内側へ入れた楕円にして、布が顔の四周を縁取るようにする。 */
    const fx0=hx+r*0.34, fy0=hy+r*0.10;
    c.save(); c.translate(fx0,fy0); c.rotate(0.12);
    c.fillStyle='#0d0c0b';
    c.beginPath(); c.ellipse(0,0,r*0.45,r*0.55,0,0,TAU); c.fill();
    /* 開口の縁(布の切り口を一段明るく) */
    c.strokeStyle=hexA(shade(P.helm,40),0.5); c.lineWidth=1.1;
    c.beginPath(); c.ellipse(0,0,r*0.45,r*0.55,0,Math.PI*0.50,Math.PI*1.66); c.stroke();
    c.restore();

    /* 布が顔の下(顎)を回り込む段 — 3/4面の奥行きを出す */
    c.fillStyle=hexA(P.helmD,0.55);
    c.beginPath();
    c.moveTo(hx-r*0.10,hy+r*0.62);
    c.quadraticCurveTo(hx+r*0.36,hy+r*0.86, hx+r*0.74,hy+r*0.44);
    c.quadraticCurveTo(hx+r*0.34,hy+r*0.68, hx-r*0.06,hy+r*0.50);
    c.closePath(); c.fill();

    /* 結び目(後頭部) */
    c.fillStyle=shade(P.helm,-14);
    c.beginPath(); c.ellipse(hx-r*0.86,hy+r*0.08,r*0.17,r*0.13,-0.3,0,TAU); c.fill();
  } else if(B.helm==='hachimaki'){
    /* 鉢巻の忍(雑魚) — 頭巾の暗殺者と混同しないよう、素頭に鉢巻+垂れ帯。
       帯の角度・クリップはプレイヤーの drawHeadbandBand と同じ流儀。
       色だけプレイヤー(水色)と変える。 */
    /* 鉢巻の帯の幾何。垂れ帯の付け根を【結び目(帯の後端)】へ一致させるため先に出す。
       以前は付け根が帯より上にあり、帯と繋がっていない位置から生えていた。 */
    const bw=r*0.30, br=r*0.95+bw*0.34;
    const ba=Math.PI*0.92, bb=-Math.PI*0.18;
    const knotX=hx+Math.cos(ba)*br, knotY=hy+r*0.03+Math.sin(ba)*br;
    /* 垂れ帯(頭より奥) — 真横へ棒のように伸ばすと硬く見える。
       結び目から【後ろ下がり】に深く垂らし、先端ほど大きく波打たせて布らしくする。 */
    /* 垂れ帯は【プレイヤーと同じ物理チェーン】で振る(mobFx.updateRibbonChain)。
       サインで揺らした固定カーブだと、並んだときに物理を無視した動きに見える。
       ノードは world 座標なので、描く直前に局所系へ写像する。
       rig(=owner/toWorld/toLocal)が無い環境では従来の固定カーブへ落とす。 */
    const canSim = !!(rig && rig.owner && typeof rig.toWorld === 'function'
                            && typeof rig.toLocal === 'function');
    if (canSim) {
      const k = Math.max(0.2, rig.bodyScale || 1);
      /* 【仕様はプレイヤーの鉢巻と共有】。clothChain.js の HEADBAND_TAIL_SPEC を
         そのまま 0.5 倍したものが雑魚の帯 —— 節数は同じで、節長・根元の段差だけ
         半分にして格の差を出す。幅・重力倍率・風倍率・色の落としは同値。
         数値をここに書き写さないこと(片方だけ直して食い違う事故が実際に起きた)。
         【縦の配置ごと 0.5 倍】が要点: 長さだけ半分にして段差をプレイヤーのまま
         5.2 にすると、下へずれた奥の帯の先端が手前より下に出て
         「奥のほうが長い」絵になる(実測 43.3 対 46.0)。 */
      const SPEC = scaleHeadbandTailSpec(0.5);
      const HALF_W = SPEC.halfWidth / k;       // 局所系へ(world 幅はプレイヤーと同値)
      const ROOT_GAP = SPEC.rootGap / k;
      /* 【奥(i=1)を先に描く】。手前を先に描くと暗い奥の帯が上に乗って
         前後が逆に見える(ユーザー指摘 2026-08-16)。
         プレイヤー側も奥の帯を本体の塗りより前に描いて同じ順にしてある。 */
      [[SPEC.far, 1], [SPEC.near, 0]].forEach(([tail, i]) => {
        const rx = knotX + r * 0.06, ry = knotY + r * 0.05 + i * ROOT_GAP;
        const w = rig.toWorld(rx, ry);
        const nodes = updateRibbonChain(rig.owner, 'band' + i, w.x, w.y, {
          count: tail.count, seg: tail.seg, dir: rig.dir,
          speedX: rig.owner.vx || 0, speedNorm: Math.max(1, rig.owner.speed || 1),
          time: (rig.owner.motionTime || 0) + tail.phaseMs,
          gravityMul: tail.gravityMul,
          windMul: tail.windMul
        });
        if (!nodes) return;
        const pts = nodes.map(n => rig.toLocal(n.x, n.y));
        drawBandRibbon(c, pts, HALF_W, i ? shadeMul(P.crest, SPEC.farShade) : P.crest);
      });
    } else {
      const ph=t*TAU/1.35+(motion==='run'?t*TAU/0.5:0);
      const amp=(motion==='run'?1.0:0.42);
      [[1.62,0.26,0,0.0],[1.24,0.19,1,0.7]].forEach(([len,wd,i,ofs])=>{
        const rx=knotX+r*0.06, ry=knotY+r*(0.05+i*0.11);   // 付け根 = 結び目
        const w1=Math.sin(ph+ofs)*r*0.20*amp;
        const w2=Math.sin(ph+ofs+1.1)*r*0.34*amp;
        const droop=r*(1.46+i*0.34);
        const mx=rx-r*len*0.40, my=ry+droop*0.52+w1;
        const ex=rx-r*len*0.86, ey=ry+droop+w2;
        const tw=r*wd;
        c.fillStyle=i?shade(P.crest,-30):P.crest;
        c.beginPath();
        c.moveTo(rx, ry-tw*0.5);
        c.quadraticCurveTo(mx, my-tw*0.34, ex, ey-tw*0.12);
        c.lineTo(ex, ey+tw*0.12);
        c.quadraticCurveTo(mx, my+tw*0.46, rx, ry+tw*0.5);
        c.closePath(); c.fill();
      });
    }
    // 素頭
    c.fillStyle=BODY.core; c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.fill();
    // 鉢巻(頭円でクリップして帯が頭からはみ出さないようにする)
    c.save();
    c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.clip();
    c.strokeStyle=P.crest; c.lineWidth=bw; c.lineCap='butt'; c.lineJoin='round';
    c.beginPath();
    c.moveTo(hx+Math.cos(ba)*br, hy+r*0.03+Math.sin(ba)*br);
    c.quadraticCurveTo(hx+r*0.02, hy+r*0.03-r*0.30,
                       hx+Math.cos(bb)*br, hy+r*0.03+Math.sin(bb)*br);
    c.stroke();
    c.restore();
  } else if(B.helm==='mage'){
    /* 侍(雑魚) — 兜をやめて軽装に。素頭+髷+額の鉢金。
       丸い鉢は前立が無いとどうしても現代のヘルメットに見えるので、
       頭そのもので「侍」と読ませる。頭装備は
       足軽=陣笠 / 忍=鉢巻 / 侍=髷 / 中ボス以上=兜 で完全に分ける。 */
    const sw3=Math.sin(t*TAU/2.6)*0.05+(motion==='run'?Math.sin(t*TAU/0.6)*0.10:0);
    /* 髷(頭頂の後ろ寄りから後ろへ跳ねる束)。頭より奥に描いて輪郭を割らない */
    c.save(); c.translate(hx-r*0.16,hy-r*0.80); c.rotate(-0.30+sw3);
    const mgPath=()=>{ c.beginPath();
      c.moveTo(0,-r*0.15);
      c.quadraticCurveTo(-r*0.52,-r*0.22,-r*0.86,-r*0.06);
      c.quadraticCurveTo(-r*0.96, 0,      -r*0.86, r*0.07);
      c.quadraticCurveTo(-r*0.52, r*0.20,  0,      r*0.14);
      c.closePath(); };
    /* 髷は頭と同じ黒なので、素体と同じシルエット輪郭を付けないと読めない */
    c.strokeStyle=BODY.OUT; c.lineWidth=BODY.OUTW; c.lineJoin='round';
    mgPath(); c.stroke();
    const mg2=c.createLinearGradient(0,-r*0.16,0,r*0.16);
    mg2.addColorStop(0,'#2a2622'); mg2.addColorStop(1,'#0f0d0b');
    c.fillStyle=mg2; mgPath(); c.fill();
    // 元結(根本を縛る紐)
    c.strokeStyle='rgba(210,200,180,0.34)'; c.lineWidth=Math.max(0.8,r*0.05);
    c.beginPath(); c.moveTo(-r*0.16,-r*0.15); c.lineTo(-r*0.16,r*0.14); c.stroke();
    c.restore();
    // 素頭
    c.fillStyle=BODY.core; c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.fill();
    /* 額の鉢金(軽装の額当)。頭円でクリップして帯が頭からはみ出さないようにする */
    c.save();
    c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.clip();
    const hw=r*0.20, hr=r*0.95+hw*0.34;
    const ha=Math.PI*0.90, hb=-Math.PI*0.14;
    c.strokeStyle=shade(P.robeS,8); c.lineWidth=hw; c.lineCap='butt';
    c.beginPath();
    c.moveTo(hx+Math.cos(ha)*hr, hy+r*0.03+Math.sin(ha)*hr);
    c.quadraticCurveTo(hx+r*0.02, hy+r*0.03-r*0.34,
                       hx+Math.cos(hb)*hr, hy+r*0.03+Math.sin(hb)*hr);
    c.stroke();
    // 額の小さな金具
    c.fillStyle=hexA(P.edge,0.7);
    c.beginPath();
    c.moveTo(hx+r*0.30,hy-r*0.60); c.lineTo(hx+r*0.62,hy-r*0.50);
    c.lineTo(hx+r*0.58,hy-r*0.30); c.lineTo(hx+r*0.28,hy-r*0.40);
    c.closePath(); c.fill();
    c.restore();
  } else if(B.helm==='kasa'){
    /* 陣笠(雑魚の足軽) — 兜ではなく塗笠。
       ・水平にかぶると被り物を載せただけに見えるので【前上がり・後ろ下がり】に傾ける
         (顔が見え、首の後ろが隠れる実際のかぶり方)
       ・顎紐は3/4面なので手前側だけ。笠の縁から顎まで短く落とし、顔は横切らせない */
    c.fillStyle=BODY.core; c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.fill();

    /* 顎紐 — 見えるのは【手前側】の1本だけ。
       このリグの2.5Dは「奥の肩・腕が進行方向(+x)へ出る」= 手前側は -x なので、
       紐も -x 側に描く(+x に描くと進行方向に対して裏返って見える)。 */
    c.lineCap='round';
    c.strokeStyle=hexA(P.edge,0.42); c.lineWidth=Math.max(0.7,r*0.042);
    c.beginPath();
    c.moveTo(hx-r*0.66,hy-r*0.06);
    c.quadraticCurveTo(hx-r*0.64,hy+r*0.36, hx-r*0.34,hy+r*0.74);
    c.stroke();
    c.fillStyle=hexA(P.edge,0.42);
    c.beginPath(); c.arc(hx-r*0.32,hy+r*0.76,r*0.055,0,TAU); c.fill();

    /* 笠。前縁(+x)を上げ、後縁(-x)を下げる。頂点も後ろへ寄せて傾きを作る */
    const BX=-r*1.34, BY= r*0.10;      // 後縁(下がる)
    const FX= r*1.42, FY=-r*0.46;      // 前縁(上がる)
    const AX=-r*0.12, AY=-r*1.44;      // 頂点(やや後ろ)
    const kg=c.createLinearGradient(hx+AX,hy+AY,hx+BX,hy+BY);
    kg.addColorStop(0,shade(P.helm,30)); kg.addColorStop(1,P.helmD);
    c.fillStyle=kg;
    c.beginPath();
    c.moveTo(hx+BX,hy+BY);
    c.quadraticCurveTo(hx-r*0.78,hy-r*0.30, hx+AX,hy+AY);      // 後ろ斜面
    c.quadraticCurveTo(hx+r*0.66,hy-r*0.94, hx+FX,hy+FY);      // 前斜面
    c.quadraticCurveTo(hx+r*0.10,hy+r*0.02, hx+BX,hy+BY);      // 縁の下側(反り)
    c.closePath(); c.fill();
    // 稜線
    c.strokeStyle='rgba(0,0,0,0.28)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(hx+AX,hy+AY);
    c.quadraticCurveTo(hx-r*0.06,hy-r*0.66, hx-r*0.20,hy-r*0.10); c.stroke();
    // 縁金(下側の反りに沿う)
    c.strokeStyle=hexA(P.edge,0.5); c.lineWidth=1.1;
    c.beginPath(); c.moveTo(hx+BX,hy+BY);
    c.quadraticCurveTo(hx+r*0.10,hy+r*0.02, hx+FX,hy+FY); c.stroke();
    // 天辺の座金
    c.fillStyle=hexA(P.crest,0.9);
    c.beginPath(); c.arc(hx+AX,hy+AY,r*0.10,0,TAU); c.fill();
  } else {
    // 素頭(シルエット。輪郭はパス1で描画済み)
    c.fillStyle=BODY.core; c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.fill();
    // 面頬(顎の面・輪郭を割らない小ぶり)
    c.fillStyle='rgba(0,0,0,0.42)';
    c.beginPath(); c.moveTo(hx+r*0.1,hy+r*0.34);
    c.quadraticCurveTo(hx+r*0.5,hy+r*0.34,hx+r*0.64,hy+r*0.14);
    c.quadraticCurveTo(hx+r*0.58,hy+r*0.58,hx+r*0.12,hy+r*0.60); c.closePath(); c.fill();
    // しころ(後頭部〜襟足を包む三段)
    for(let i=0;i<3;i++){
      c.fillStyle=i%2?shade(P.helm,-8):shade(P.helm,2);
      c.beginPath();
      c.arc(hx-r*0.06,hy+r*0.04+i*r*0.085,r*(0.84+i*0.06),Math.PI*0.58,Math.PI*0.94);
      c.arc(hx-r*0.06,hy+r*0.04+i*r*0.085,r*(0.68+i*0.06),Math.PI*0.94,Math.PI*0.58,true);
      c.closePath(); c.fill();
    }
    // 兜鉢 — 頭を目線の高さまで包む(後頭部のはみ出しを消す)
    const hg=c.createLinearGradient(hx,hy-r*1.15,hx,hy+r*0.1);
    hg.addColorStop(0,shade(P.helm,16)); hg.addColorStop(1,P.helmD);
    c.fillStyle=hg;
    c.beginPath();
    c.arc(hx,hy-r*0.06,r*1.03,Math.PI*0.94,TAU+Math.PI*0.06);
    c.closePath(); c.fill();
    // 鉢の筋(ごく薄く)
    c.strokeStyle='rgba(0,0,0,0.16)'; c.lineWidth=1;
    [-0.4,0.4].forEach(k=>{
      c.beginPath(); c.moveTo(hx+k*r*0.85,hy-r*0.10);
      c.quadraticCurveTo(hx+k*r*0.5,hy-r*0.66,hx+k*r*0.12,hy-r*1.05); c.stroke();
    });
    // 眉庇 — 頭の曲面に沿う(目に被らない)
    c.fillStyle=P.helmD;
    c.beginPath();
    c.moveTo(hx-r*0.98,hy-r*0.18);
    c.quadraticCurveTo(hx,hy-r*0.36,hx+r*1.06,hy-r*0.24);
    c.lineTo(hx+r*0.94,hy-r*0.02);
    c.quadraticCurveTo(hx,hy-r*0.14,hx-r*0.86,hy+r*0.04);
    c.closePath(); c.fill();
    /* 鉢の縁金。鉢の【天】をぐるりと縁取ると現代のヘルメットに見えるので、
       前立を持たない兜(雑魚の侍)では弱める。前立のあるボスは従来どおり。 */
    c.strokeStyle=hexA(P.edge,B.crest?0.85:0.28); c.lineWidth=B.crest?1.4:1.0;
    c.beginPath(); c.arc(hx,hy-r*0.06,r*1.03,Math.PI*1.03,Math.PI*1.97); c.stroke();
    /* 前立を持たない兜(雑魚の侍)は、丸い鉢だけだと現代のヘルメットに見える。
       兜と分かる要素 ——【天辺の座金】と【吹返(しころ前端の反り上がり)】—— を足す。
       前立のあるフロアボスは silhouette がすでに和物なので触らない。 */
    if(!B.crest){
      // 吹返(手前側=-x に大きく、奥側=+x は小さく。3/4面の見え方)
      [[-1,1.0],[1,0.45]].forEach(([sgn,sc])=>{
        c.fillStyle=sgn<0?shade(P.helm,10):shade(P.helm,-14);
        c.beginPath();
        c.moveTo(hx+sgn*r*0.62, hy+r*0.06);
        c.quadraticCurveTo(hx+sgn*r*(0.96+0.10*sc), hy+r*0.02,
                           hx+sgn*r*(1.02+0.12*sc), hy-r*(0.24+0.10*sc));
        c.quadraticCurveTo(hx+sgn*r*(0.86+0.06*sc), hy-r*0.06,
                           hx+sgn*r*0.66, hy+r*0.18);
        c.closePath(); c.fill();
        c.strokeStyle=hexA(P.edge,0.55); c.lineWidth=0.9;
        c.beginPath();
        c.moveTo(hx+sgn*r*0.64, hy+r*0.08);
        c.quadraticCurveTo(hx+sgn*r*(0.96+0.10*sc), hy+r*0.00,
                           hx+sgn*r*(1.02+0.12*sc), hy-r*(0.24+0.10*sc));
        c.stroke();
      });
      // 天辺の座金(八幡座)
      c.fillStyle=hexA(P.edge,0.8);
      c.beginPath(); c.arc(hx-r*0.02,hy-r*1.02,r*0.13,0,TAU); c.fill();
      c.fillStyle='rgba(10,12,16,0.85)';
      c.beginPath(); c.arc(hx-r*0.02,hy-r*1.02,r*0.055,0,TAU); c.fill();
      /* 眉庇を張り出させて縁を金で締める。兜の「額の庇」がヘルメットとの分かれ目 */
      c.fillStyle=shade(P.helmD,-6);
      c.beginPath();
      c.moveTo(hx-r*1.02,hy-r*0.16);
      c.quadraticCurveTo(hx+r*0.02,hy-r*0.40, hx+r*1.14,hy-r*0.24);
      c.lineTo(hx+r*1.00,hy+r*0.06);
      c.quadraticCurveTo(hx+r*0.02,hy-r*0.14, hx-r*0.92,hy+r*0.08);
      c.closePath(); c.fill();
      c.strokeStyle=hexA(P.edge,0.75); c.lineWidth=1.2;
      c.beginPath();
      c.moveTo(hx-r*1.02,hy-r*0.16);
      c.quadraticCurveTo(hx+r*0.02,hy-r*0.40, hx+r*1.14,hy-r*0.24); c.stroke();
    }
    // 前立
    drawCrest(c,B,P,hx,hy,r,t);
  }
}
/* 前立 — 眉庇の上(額の前面)に付ける。本編の「前立ては進行方向を向く」と同じ流儀 */
function drawCrest(c,B,P,hx,hy,r,t){
  const sw2=Math.sin(t*TAU/2.7)*0.02;
  if(B.crest==='mikazuki'){
    /* 大三日月(伍之陣・武将) — 平板な弧をやめ、
       ①厚い基部から針のように跳ね上がる非対称の反り ②影板+金地+内縁の照り
       ③鉢に食い込む台座と座金 の三層で立体を作る */
    const S2=r*1.05;
    c.save(); c.translate(hx+r*0.30,hy-r*0.92); c.rotate(-0.20+sw2);

    /* 三日月の輪郭(基部=左で厚く、右へ長く反り上がって切先になる)。
       切先は【外縁と内縁が同じ接線で1点に集まる】ように制御点を置く。
       以前は外縁の制御点が接線から外れていて、先端が閉じずに小さく割れて見えた。 */
    const TX=S2*1.24, TY=-S2*0.94;                       // 切先
    const UX=0.6507, UY=-0.7591;                         // 切先へ入る接線(単位ベクトル)
    const NX=-UY,   NY=UX;                               // その法線(凹側=右下)
    const oCX=TX-UX*S2*0.56,               oCY=TY-UY*S2*0.56;               // 外縁の制御点
    /* 内縁の制御点。法線方向のオフセットが小さすぎると最後の1割が髪の毛のように
       細くなり、逆に大きいと先が丸くなる。0.10 が「すっと閉じる」値。 */
    const iCX=TX-UX*S2*0.80+NX*S2*0.10,    iCY=TY-UY*S2*0.80+NY*S2*0.10;
    /* 影板もこの同じ関数で描くが、【切先だけはオフセットを掛けない】。
       全点を一律にずらすと影が金地の先を追い越し、点の外へ濃い棘が伸びて
       「先端が閉じていない」ように見える(ユーザー指摘)。 */
    const moon=(o)=>{ c.beginPath();
      c.moveTo(-S2*0.86+o, S2*0.30+o);                                  // 左端(短い方の角)
      c.quadraticCurveTo(-S2*0.62+o,-S2*0.30+o, S2*0.10+o,-S2*0.40+o);  // 外縁(上)
      c.quadraticCurveTo(oCX+o*0.5, oCY+o*0.5, TX, TY);                 // 外縁 → 切先(切先は共有)
      c.quadraticCurveTo(iCX+o*0.5, iCY+o*0.5, S2*0.06+o,-S2*0.02+o);   // 切先 → 内縁(下・凹)
      c.quadraticCurveTo(-S2*0.44+o, S2*0.10+o,-S2*0.86+o, S2*0.30+o);
      c.closePath(); };

    // ①影板(奥へずらした暗い層)
    c.fillStyle='#4a3208'; moon(S2*0.055); c.fill();
    // ②金地(基部→切先で明度が上がる)
    const mg=c.createLinearGradient(-S2*0.8,S2*0.3,S2*1.2,-S2*0.9);
    mg.addColorStop(0,'#8a6412'); mg.addColorStop(0.45,P.crest); mg.addColorStop(1,'#fff0b0');
    c.fillStyle=mg; moon(0); c.fill();
    /* 輪郭は【閉じたパスで囲まない】。切先で線の継ぎ目(join)が丸まって尖りが潰れる。
       かといって途中で切ると、そこに線幅ぶんの段差(肩)ができて「先が欠けた」ように見える
       ——1回目の修正がまさにそれだった。線幅を切先へ向けて 0 まで絞って消す。 */
    const qz=(a,cc,b,t)=>a+(cc-a)*2*t+(b-2*cc+a)*t*t;
    /* 二次ベジェを t0→t1 の区間で、線幅 w0→w1・不透明度 a0→a1 に変化させながら描く */
    const taperQ=(ax,ay,cxp,cyp,bx,by,t0,t1,w0,w1,col,a0,a1)=>{
      const N=18, prevCap=c.lineCap;
      c.lineCap='round';           // 分割の継ぎ目に髪の毛のような隙間を作らない
      for(let i=0;i<N;i++){
        const u0=t0+(t1-t0)*i/N, u1=t0+(t1-t0)*(i+1)/N, k=i/Math.max(1,N-1);
        c.strokeStyle=hexA(col, a0+(a1-a0)*k);
        c.lineWidth=Math.max(0.04, w0+(w1-w0)*k);
        c.beginPath();
        c.moveTo(qz(ax,cxp,bx,u0), qz(ay,cyp,by,u0));
        c.lineTo(qz(ax,cxp,bx,u1), qz(ay,cyp,by,u1));
        c.stroke();
      }
      c.lineCap=prevCap;
    };
    const OL='#5b3f0a', OW=1.0;
    c.lineCap='butt'; c.lineJoin='round';
    c.strokeStyle=OL; c.lineWidth=OW;
    c.beginPath();                                        // 基部〜外縁の途中まで(等幅)
    c.moveTo(-S2*0.86, S2*0.30);
    c.quadraticCurveTo(-S2*0.62,-S2*0.30, S2*0.10,-S2*0.40);
    c.stroke();
    // 外縁 → 切先: 線幅を 1.0 → 0 へ絞る(段差なしで消える)
    taperQ(S2*0.10,-S2*0.40, oCX,oCY, TX,TY, 0,1, OW,0, OL,1,0.15);
    // 切先 → 内縁: 0 から立ち上げて等幅へ
    taperQ(TX,TY, iCX,iCY, S2*0.06,-S2*0.02, 0,1, 0,OW, OL,0.15,1);
    c.strokeStyle=OL; c.lineWidth=OW;
    c.beginPath();
    c.moveTo(S2*0.06,-S2*0.02);
    c.quadraticCurveTo(-S2*0.44, S2*0.10,-S2*0.86, S2*0.30);
    c.stroke();
    /* ③内縁の照り(凹側に沿う細い光)。こちらも切先手前で幅0へ絞って消す */
    const HL='#fff6cf', HW=Math.max(0.9,S2*0.045);
    c.strokeStyle=hexA(HL,0.62); c.lineWidth=HW;
    c.beginPath();
    c.moveTo(-S2*0.66, S2*0.16);
    c.quadraticCurveTo(-S2*0.30,-S2*0.02, S2*0.14,-S2*0.10);
    c.stroke();
    taperQ(S2*0.14,-S2*0.10, S2*0.70,-S2*0.28, S2*0.98,-S2*0.62, 0,1, HW,0, HL,0.62,0);
    // 切先の煌めき(丸)は付けない —— 三日月の先に別部品が刺さって見える(ユーザー指摘)

    /* 台座と座金(鉢との接続) */
    const zg=c.createLinearGradient(0,S2*0.52,0,S2*0.16);
    zg.addColorStop(0,'#5b3f0a'); zg.addColorStop(1,P.crest);
    c.fillStyle=zg;
    c.beginPath(); c.moveTo(-S2*0.20,S2*0.54); c.lineTo(S2*0.20,S2*0.54);
    c.lineTo(S2*0.13,S2*0.18); c.lineTo(-S2*0.13,S2*0.18); c.closePath(); c.fill();
    c.fillStyle=P.crest; c.beginPath(); c.arc(0,S2*0.30,S2*0.10,0,TAU); c.fill();
    c.fillStyle='#5b3f0a'; c.beginPath(); c.arc(0,S2*0.30,S2*0.042,0,TAU); c.fill();
    c.restore();
    return;
  }
  c.save(); c.translate(hx+r*0.42,hy-r*0.62); c.rotate(sw2);   // 額の前
  /* 前立の台座(すべての意匠に共通) */
  const zaG=c.createLinearGradient(0,r*0.20,0,-r*0.02);
  zaG.addColorStop(0,shade(P.crest,-40)); zaG.addColorStop(1,P.crest);
  c.fillStyle=zaG;
  c.beginPath(); c.moveTo(-r*0.15,r*0.20); c.lineTo(r*0.19,r*0.20);
  c.lineTo(r*0.13,-r*0.02); c.lineTo(-r*0.09,-r*0.02); c.closePath(); c.fill();

  if(B.crest==='disc'){
    /* 火焔前立(火薬玉) — 丸板ではなく、三枚の炎が立ち上がる形 */
    const fl=[[0.02,1.02,0.30],[0.34,0.80,0.24],[-0.26,0.72,0.20]];
    const fg=c.createLinearGradient(0,r*0.05,0,-r*1.05);
    fg.addColorStop(0,'#8a3d12'); fg.addColorStop(0.45,P.crest); fg.addColorStop(1,'#ffd9a0');
    c.fillStyle=fg;
    fl.forEach(([ox,hgt,wid])=>{
      c.beginPath();
      c.moveTo(r*(ox-wid*0.5), 0);
      c.quadraticCurveTo(r*(ox-wid*0.9), -r*hgt*0.55, r*(ox+wid*0.12), -r*hgt);   // 外側の縁(内へ巻く)
      c.quadraticCurveTo(r*(ox+wid*0.32), -r*hgt*0.52, r*(ox+wid*0.62), -r*hgt*0.18);
      c.quadraticCurveTo(r*(ox+wid*0.30), -r*hgt*0.06, r*(ox+wid*0.5), 0);
      c.closePath(); c.fill();
    });
    c.strokeStyle=hexA('#fff0cc',0.5); c.lineWidth=0.9;
    c.beginPath(); c.moveTo(-r*0.10,-r*0.10);
    c.quadraticCurveTo(-r*0.24,-r*0.58,r*0.06,-r*0.96); c.stroke();

  } else if(B.crest==='kuwagata'){
    /* 鍬形+剣立(槍大将) — 二本角の間に剣を立てる */
    const armG=c.createLinearGradient(-r*0.6,0,r*0.7,-r*1.0);
    armG.addColorStop(0,shade(P.crest,-30)); armG.addColorStop(1,P.crest);
    c.fillStyle=armG;
    [[-1,0.16],[1,0.24]].forEach(([sg,base])=>{
      c.beginPath();
      c.moveTo(sg*r*base, 0);
      c.quadraticCurveTo(sg*r*(base+0.52), -r*0.44, sg*r*(base+0.34), -r*1.02);  // 外縁
      c.lineTo(sg*r*(base+0.16), -r*1.00);
      c.quadraticCurveTo(sg*r*(base+0.30), -r*0.46, sg*r*(base*0.5), -r*0.04);   // 内縁
      c.closePath(); c.fill();
    });
    // 中央の剣
    c.fillStyle=P.crest;
    c.beginPath();
    c.moveTo(-r*0.06,-r*0.04); c.lineTo(r*0.09,-r*0.04);
    c.lineTo(r*0.045,-r*0.86); c.lineTo(r*0.015,-r*0.86); c.closePath(); c.fill();
    c.fillStyle=hexA('#fff4d6',0.45);
    c.beginPath(); c.moveTo(-r*0.02,-r*0.10); c.lineTo(r*0.02,-r*0.10);
    c.lineTo(r*0.028,-r*0.80); c.closePath(); c.fill();

  } else if(B.crest==='gessou'){
    /* 半月に剣(二刀流の剣豪) — 半月の板を背に、鋭い剣を立てる */
    const mg=c.createLinearGradient(0,r*0.1,0,-r*0.7);
    mg.addColorStop(0,shade(P.crest,-34)); mg.addColorStop(1,P.crest);
    c.fillStyle=mg;
    c.beginPath();
    c.arc(r*0.04,-r*0.02,r*0.42,Math.PI*1.02,Math.PI*1.98);
    c.quadraticCurveTo(r*0.04,-r*0.22,r*(0.04-0.42),-r*0.02);
    c.closePath(); c.fill();
    // 剣
    c.fillStyle=P.crest;
    c.beginPath();
    c.moveTo(-r*0.055,-r*0.10); c.lineTo(r*0.10,-r*0.10);
    c.lineTo(r*0.055,-r*1.00); c.lineTo(r*0.020,-r*1.00); c.closePath(); c.fill();
    c.fillStyle=hexA('#f2ecff',0.5);
    c.beginPath(); c.moveTo(r*0.005,-r*0.18); c.lineTo(r*0.042,-r*0.18);
    c.lineTo(r*0.045,-r*0.92); c.closePath(); c.fill();
  }
  c.restore();
}

/* ---------------- 攻撃振り付け(体幹・足位置) ---------------- */
/* 返り値: lean(rad) / crouch(px下げ) / shift(前後移動) / feet[[x,y],[x,y]] / capeBell / headDip */

const CHOREO={
  /* 火薬玉 = 1投ぶんの周期。引き戻しで後足荷重→振り抜きで前足へ乗る。
     p は 1投の進行度(0=投げ直後 → 1=次の投げ)。 */
  /* 火薬玉 = 1投ぶんの周期。溜め(0.20-0.72)で後足荷重、振り抜き(0.72-1.0)で前へ乗る。 */
  kayaku(p){
    const draw = ezIO(seg(p, 0.20, 0.72));
    const whip = Math.pow(seg(p, 0.72, 1.0), 0.55);
    const after = 1 - ezOut(cl01(p / 0.20));
    return {
      lean: -draw * 0.18 + whip * 0.36 + after * 0.12,
      crouch: draw * 5 - whip * 2,
      shift: -draw * 5 + whip * 12 + after * 4,
      headDip: draw * 1.6 - whip * 1.0,
      feet: [[-15 - draw * 4 + whip * 5, 0], [12 + whip * 7, 0]],
      capeBell: 0
    };
  },
  /* 大槍 = playerRenderer の isSpearThrustPose 移植(横っ飛びの刺突)。
     進行度は weaponReplica の attackDuration(270ms)基準。
     肩 +(2.8+lunge*5.6-windup*1.1) / 腰 +(0.9+...) / 頭 +(1.2+lunge*2.8)、
     頭 -drive*2.0・腰 -drive*1.7、後足で蹴り両足が浮く。素体は ×1.8、脚は ×1.89。 */
  yari(p){
    /* 大槍の突き。playerRenderer の isSpearThrustPose は【横っ飛び】で両足とも
       宙に浮く振り付けだが、108px のボスでそのまま使うと槍を掴んだまま滞空して
       見える(ユーザー指摘)。そこで「後ろ足は接地したまま腰を落として踏み込む」
       突きに組み替える。前足だけが踏み出しの途中で浮き、突き切りで着地する。
         A  = 素体倍率(横方向) / LS = 脚長倍率(45/23.8)
         腰を落とさずに後ろ足を後方へ置くと脚長(45)を超えて突っ張るので、
         lunge に合わせて crouch を深くして脚長内に収める。 */
    const A=1.8, LS=1.89;
    const windup=Math.max(0,1-(p/0.34));                      // 引き
    const lunge=Math.sin(cl01((p-0.16)/0.62)*Math.PI*0.5);    // 踏み込み(0→1)
    const step=Math.sin(cl01((p-0.10)/0.58)*Math.PI);         // 前足の踏み出し(0→1→0)
    const drive=Math.sin(p*Math.PI);
    /* 【横っ飛び感を戻す】(ユーザー要望 2026-08-16)。
       全接地の踏み込みは滞空に見えない代わりに「歩いて突いた」だけになる。
       突き切りの山だけ後ろ足も地面を離し、前足の抜きも深くする。
       浮く区間は p=0.26〜0.62 の短い山に限り、突き終わりには必ず両足が戻る
       —— これが「掴んだまま滞空」に見えるかどうかの境目。 */
    const hop=Math.sin(cl01((p-0.26)/0.36)*Math.PI);          // 蹴り抜けの山(短い)
    return { lean:0, leanPx:(2.6+lunge*5.2-windup*1.1)*A,
      crouch:(2.0+lunge*5.0+hop*2.4)*A,                       // 浮く瞬間は膝を畳む
      shift:(0.9+lunge*2.2-windup*0.5)*A, headDip:drive*1.0*A,
      feet:[[-(8.0+lunge*5.0)*LS, -hop*3.6*LS],                // 後ろ足=蹴った瞬間だけ離陸
            [ (3.0+lunge*6.0)*LS, -step*9.4*LS]],              // 前足=深く抜いて着地
      capeBell:0 };
  },
  nito(p){
    const w=seg(p,0.04,0.24), s1=seg(p,0.26,0.44), s2=seg(p,0.52,0.70), rc=seg(p,0.78,1);
    const e1=ezOut(s1), e2=ezOut(s2);
    return { lean:-w*0.18+e1*0.24+e2*0.2-rc*0.24,
      crouch:w*4+e1*3+e2*4-rc*3, shift:-w*4+e1*9+e2*13-rc*10,
      feet:[[-15+e1*6+e2*12,0],[13+e1*10+e2*8,0]], capeBell:0, headDip:e2*1 };
  },
  kusa(p){
    const spin=seg(p,0,0.40), th=seg(p,0.42,0.55), rt=seg(p,0.72,1);
    const thE=ezOut(th);
    return { lean:0.08+spin*0.06+thE*0.38-rt*0.22,
      crouch:8+spin*4-thE*3, shift:thE*13-rt*ezIO(rt)*9,
      feet:[[-17,0],[13+thE*9,0]], capeBell:0, headDip:2+thE*1 };
  },
  /* 大太刀 = playerRenderer の odachiPhase 移植(跳躍して突き上げ→宙返り→急降下→着刀)。
     phase は weaponReplica.getPose().phase をそのまま受け取る。素体は ×1.8。 */
  /* ---- 雑魚・中ボスの体幹。ボスほど大振りにせず、素直な溜め→振り抜き ---- */
  ashigaru(p){            // 槍の突き
    const w=seg(p,0.04,0.30), d=ezOut(seg(p,0.30,0.58)), rc=ezIO(seg(p,0.70,1));
    return { lean:-w*0.10+d*0.26-rc*0.14,
      crouch:w*3-d*1.5, shift:-w*5+d*16-rc*10, headDip:d*1.4,
      feet:[[-16-w*4+d*6,0],[11+d*15,0]], capeBell:0 };
  },
  samurai(p){             // 打刀の袈裟斬り
    const up=ezIO(seg(p,0.04,0.34)), cut=ezIn(seg(p,0.38,0.56)), rc=ezIO(seg(p,0.70,1));
    return { lean:-up*0.24+cut*0.44-rc*0.20,
      crouch:-up*2+cut*9-rc*5, shift:-up*5+cut*14-rc*8, headDip:cut*2.4,
      feet:[[-15-up*4+cut*4,0],[12+cut*13,0]], capeBell:0 };
  },
  ninja(p){               // 小太刀の速い一閃
    const up=ezIO(seg(p,0.02,0.22)), cut=ezIn(seg(p,0.24,0.40)), rc=ezIO(seg(p,0.56,1));
    return { lean:-up*0.20+cut*0.50-rc*0.26,
      crouch:-up*1.5+cut*7-rc*4, shift:-up*4+cut*17-rc*11, headDip:cut*2.0,
      feet:[[-14-up*5+cut*6,0],[11+cut*16,0]], capeBell:0 };
  },
  busho(p){               // 薙刀の振り下ろし(中ボス)
    const up=ezIO(seg(p,0.04,0.36)), cut=ezIn(seg(p,0.40,0.58)), rc=ezIO(seg(p,0.72,1));
    return { lean:-up*0.26+cut*0.48-rc*0.22,
      crouch:-up*2.5+cut*11-rc*6, shift:-up*6+cut*16-rc*9, headDip:cut*2.6,
      feet:[[-17-up*4+cut*5,0],[13+cut*14,0]], capeBell:up*0.9-cut*0.4 };
  },
  odachi(p, phase, mt){
    /* 脚は playerRenderer:2499-2541(odachiPhase 別の専用脚)を数値ごと移植する。
       ・縦の落差はプレイヤーが airLegSpanScale = 脚長/23.8 を掛けている。
         ボスの腰高は 45 なので LS = 45/23.8 = 1.8908。
       ・プレイヤーは全フェーズで extendOd=6.5 を足して「草摺に膝下が埋もれて
         短足に見えない」ようにしている。ボスも比率を合わせるため 6.5×LS を足す。
       ・以前ここは A*0.62(=1.116)という player 側に対応物のない係数で、
         extendOd も欠落していた。脚長が待機 43.6px に対し 13〜20px まで縮み、
         「胴から直接足が生えている」絵になっていた(ユーザー指摘)。
       ・index0 = 奥脚(player left) / index1 = 手前脚(player right)。 */
    const A=1.8, HIP=45, LS=45/23.8, EXT=6.5*LS, KEXT=EXT*0.5;
    // 脚の付け根(renderBossModel の hipX ± 1.05*SC と一致させる。pose.feet の x は
    // cx+f[0]-shift で shift が打ち消されるので、ここで shift を足し戻す)
    const mk=(shift, crouch, L, R)=>{
      const hipY=-HIP+crouch, hx0=shift+0.2;
      const rootB=hx0-1.05*A, rootF=hx0+1.05*A;   // 奥脚 / 手前脚
      const bend=(hx,hy,fx,fy,t,b)=>{ const dX=fx-hx, dY=fy-hy, len=Math.max(0.001,Math.hypot(dX,dY));
        let nX=-dY/len, nY=dX/len; if(nX<0){nX=-nX;nY=-nY;}      // towardSign=dir=+1
        return [hx+dX*t+nX*b, hy+dY*t+nY*b]; };
      const one=(root,q)=>{
        let fx, fy, kx, ky;
        if(q.kneeFirst){
          kx=root+q.kdx*A;        ky=hipY+q.kdy*LS;
          fx=kx+q.fdx*A;          fy=ky+q.fdy*LS;
        } else {
          fx=root+q.fdx*A;        fy=hipY+q.fdy*LS;
          const kb=bend(root,hipY,fx,fy,q.t,q.b*LS); kx=kb[0]; ky=kb[1];
        }
        return { foot:[fx, fy+EXT], knee:[kx, ky+KEXT] };
      };
      const b=one(rootB,L), f=one(rootF,R);
      return { feet:[b.foot, f.foot], knees:[b.knee, f.knee] };
    };
    if(phase==='rise'){
      // 突き上げ跳躍。プレイヤーの kick=clamp(-vy/18) はボスに vy が無いので 0.6 固定
      const kick=0.6, crouch=-2*A, shift=1.5*A;
      const lg=mk(shift, crouch,
        { kneeFirst:true, kdx: 3.0, kdy:6.5, fdx:-1.4, fdy:4.8 },
        { kneeFirst:false, fdx:-(4.2+kick*3.6), fdy:11.0+kick*2.6, t:0.52, b:1.6+kick*0.8 });
      return { lean:-0.10, crouch, shift, headDip:-1.5*A, capeBell:0.9, ...lg };
    }
    if(phase==='stall'||phase==='flip'){
      const crouch=-3*A, shift=0.5*A;                    // 頂点〜宙返り: 両脚を胸側へタック
      const lg=mk(shift, crouch,
        { kneeFirst:true, kdx: 3.4, kdy:5.6, fdx:-2.4, fdy:4.0 },
        { kneeFirst:true, kdx: 2.2, kdy:6.2, fdx:-2.8, fdy:4.4 });
      return { lean:-0.04, crouch, shift, headDip:-1.0*A, capeBell:1.0, ...lg };
    }
    if(phase==='plunge'){
      const crouch=1*A, shift=-1.0*A;                    // 急降下: 両脚を後方上へ流す
      const lg=mk(shift, crouch,
        { kneeFirst:false, fdx:-4.6, fdy:7.2, t:0.5, b:2.0 },
        { kneeFirst:false, fdx:-6.6, fdy:9.0, t:0.5, b:1.5 });
      return { lean:0.16, crouch, shift, headDip:1.2*A, capeBell:0.4, ...lg };
    }
    if(phase==='planted'){
      // 柄にぶら下がり、脚はだらんと垂らして微揺れ(プレイヤーは sin(motionTime*0.004)*1.2)
      const sw=Math.sin((mt||0)*0.004)*1.2, crouch=2*A, shift=-0.5*A;
      const lg=mk(shift, crouch,
        { kneeFirst:true, kdx:0.9+sw*0.4, kdy:8.6, fdx:-0.8+sw,     fdy:6.8 },
        { kneeFirst:true, kdx:0.5+sw*0.3, kdy:8.0, fdx:-1.0+sw*0.8, fdy:6.2 });
      return { lean:0.06, crouch, shift, headDip:0.6*A, capeBell:0.15, ...lg };
    }
    // 実体が地上振りの場合(phase 未提供)は従来の唐竹割りで代替
    const rai=seg(p,0.04,0.34), cut=seg(p,0.38,0.50), rc=seg(p,0.68,1);
    const cutE=ezIn(cut);
    return { lean:-rai*0.30+cutE*0.55-rc*ezIO(rc)*0.24,
      crouch:rai*-3+cutE*13-rc*ezIO(rc)*7, shift:-rai*6+cutE*17-rc*ezIO(rc)*9,
      feet:[[-16-rai*5+cutE*5,0],[12+cutE*16,0]],
      capeBell:rai*1-cutE*0.5, headDip:cutE*3 };
  }
};

export function renderBossModel(c,B,motion,t,st){
  const P=B.pal;
  const CAST=!!(st&&st.castoff);   // 素体のみ表示(検証用)
  const H=BOSS_H;
  const mt=t*1000;
  const breath=Math.sin(t*TAU/3.8);
  const sway=Math.sin(t*TAU/5.6+1.3);

  /* ---- 拍計算 ---- */
  let runPh=0, runPh2=0, atk=0, inAtk=false;
  if(motion==='run'){ runPh=(t/GAIT.T)%1; runPh2=(runPh+0.5)%1; }
  if(motion==='attack'){
    // 攻撃の進行度は本編の武器タイムラインから受け取る(0..1)。
    // 未指定のときだけ提案書と同じ仮の周期で回す。
    atk=(st&&Number.isFinite(st.attackProgress))?cl01(st.attackProgress):((t%2.8)/2.8);
    inAtk=true;
  }

  /* ---- 体幹の姿勢 ---- */
  let pose=null;
  if(inAtk){ pose=(CHOREO[B.id]||CHOREO.samurai)(atk, (st&&st.phase)||null, mt); }

  const bobRun=motion==='run'?-Math.abs(Math.sin(runPh*TAU))*3.0+1.4:0;
  const bobIdle=motion==='idle'?breath*1.0:0;
  const crouch=(pose?pose.crouch:0)+(motion==='run'?1.6:0)+(motion==='idle'?(B.idleCrouch||1.5):0);

  /* ---- 骨格: プレイヤー素体の写像 ----
     headRadius = H×(28/60)/2×headScale(0.80) ≒ 20.2 (将軍と同じ小頭身補正)
     hip = -(headR×1.43 + hipLift) : hipLift は将軍の 8px(素体60frame) を 108frame へ換算 */
  /* 実機(character_preview・防具非表示)の行プロファイル実測(全高比):
     頭直径0.362(半径0.181・頭頂=全高の頂点) / 肩幅0.133 / 胴0.126 /
     脚の分岐0.672 / 足の左右幅0.089 / 脚幅 前0.065・奥0.038 */
  /* 頭身は意匠ごとに変える。既定 0.187 は 2.67頭身。
     フロアボスは design で 0.20(=2.50頭身)を明示している(少しだけ頭を大きく)。
     雑魚はプレイヤー(忍者)に合わせるため 0.2392(=2.09頭身)を design で指定する。
       忍者: 頭半径 = height×(28/60)×0.5 = 16.8 / 描画全高 70.32 → 頭直径33.6 = 全高の0.478
     腰も同様。忍者は hipY = 足元 - 頭半径×1.43 なので、頭比×1.43 を腰比に使う。 */
  const headR=H*(Number.isFinite(B.headRatio)?B.headRatio:0.187);
  const hipRatio=Number.isFinite(B.hipRatio)?B.hipRatio:0.417;
  const cx=(pose?pose.shift:0);
  const hipY=-H*hipRatio+crouch+bobRun+bobIdle*0.35;
  const hipX=cx+0.2;
  const headYBase=-(H-headR)+bobRun*0.7+bobIdle;    // 実測: 頭中心=上から0.183H
  const headY=headYBase+crouch*0.55+(pose?pose.headDip||0:0);
  const bodyTop=headY+headR*0.80;                   // 胴上端は頭に食い込ませる(首の切れ目を作らない)
  /* 前傾はプレイヤー同様「肩の前進量(px)」で作る(run≒3px、所作は振り付けから) */
  const leanPx=(motion==='run'?3.6+Math.sin(runPh*TAU*2)*0.8:0.5)
              +(pose?Math.sin(pose.lean||0)*22+(pose.leanPx||0):0)
              +(motion==='idle'?sway*0.35:0);
  const chestX=hipX+leanPx;
  const chestY=bodyTop+3.0;
  const headX=cx+leanPx+headR*0.04;
  /* 得物の把持基準(武器モジュールの座標系。従来維持) */
  const shF={x:chestX+8.0,y:chestY+1.0}, shB={x:chestX-8.0,y:chestY+3.0};
  /* 腕の付け根 = 胴線上の1点(playerRenderer 同様)を基準に、
     体を画面側へ少し捻った3/4面として前後を割る。
     ★捻りの向き: 胸が画面側を向く → 【奥の肩が前(右)へ、手前の肩が後ろ(左)へ】出る。
       逆にすると体が画面の向こうを向いて見える。 */
  const shAncX=chestX+(hipX-chestX)*0.15;
  const shAncY=bodyTop+(hipY-bodyTop)*0.11;
  const TWIST=(B.openStance?4.6:2.0)*SC;    // 画面側への捻り量(二刀流だけ体を開く)
  const shAB={x:shAncX+TWIST,      y:shAncY+0.45*SC};  // 奥肩=前へ出る
  const shAF={x:shAncX-TWIST*0.6,  y:shAncY+0.75*SC};  // 手前肩=後ろへ引く

  /* ---- 脚(接地ロック or 構え) ---- */
  let feet;
  if(motion==='run'){
    const f1=gaitFoot(runPh), f2=gaitFoot(runPh2);
    feet=[{x:cx+f2.x,y:f2.y,front:false,sw:!f2.planted,u:f2.u},
          {x:cx+f1.x,y:f1.y,front:true, sw:!f1.planted,u:f1.u}];
  } else if(inAtk){
    /* pose.feet[i] = [x, y] / 任意で pose.knees[i] = [x, y](どちらも接地=0 の局所系)。
       index0 = 奥脚(far) / index1 = 手前脚(near) —— playerRenderer の left/right と同じ並び。 */
    const shiftX=(pose?pose.shift:0)||0;
    const kn=(pose&&pose.knees)||null;
    feet=pose.feet.map((f,i)=>({
      x:cx+f[0]-shiftX, y:f[1], front:i===1, sw:false, u:0,
      kx:kn&&kn[i]?cx+kn[i][0]-shiftX:undefined, ky:kn&&kn[i]?kn[i][1]:undefined
    }));
  } else {
    /* 待機の接地 = playerRenderer の実数値: 前足 centerX+2.6 / 奥足 centerX-3.0 */
    const K=(B.idleSpread||1.0)*SC;
    feet=[{x:cx-3.0*K+sway*0.5,y:0,front:false,sw:false,u:0},
          {x:cx+2.6*K-sway*0.5,y:0,front:true,sw:false,u:0}];
  }

  /* ---- 陣羽織(大太刀のみ・体の後ろ) ---- */
  if(B.cape && !CAST){
    const bell=inAtk?pose.capeBell:0;
    const wav=Math.sin(t*TAU/2.3)*3+(motion==='run'?Math.sin(runPh*TAU*2)*2:0);
    const topX=chestX-4.0, topY=bodyTop+1;   // 肩線から羽織る(2.5D肩幅基準)
    const g=c.createLinearGradient(topX,topY,topX-28,hipY+34);
    g.addColorStop(0,P.capeA); g.addColorStop(1,P.capeB);
    c.fillStyle=g; c.beginPath();
    c.moveTo(topX+4,topY);
    c.quadraticCurveTo(topX-14-bell*9, chestY+5, topX-13-bell*14-wav, hipY+20);
    c.quadraticCurveTo(topX-4-bell*5, hipY+26, hipX-3, hipY+18);
    c.closePath(); c.fill();
    // 肩口の折り返し
    c.fillStyle=shade(P.capeA,-14);
    c.beginPath(); c.moveTo(topX+3,topY);
    c.quadraticCurveTo(topX-6,topY+2,topX-9,chestY+7);
    c.lineTo(topX-3,chestY+8); c.closePath(); c.fill();
  }

  /* ---- 奥腕(プレイヤー実装×1.5の腕。武器モジュールが手位置を決める) ---- */
  const wf=(st&&st.weapon)||EMPTY_WEAPON;
  const rig={c,B,P,cx,hipX,hipY,chestX,chestY,shF,shB,shAF,shAB,headX,headY,headR,t,mt,motion,runPh,atk,pose,breath,sway,feet,
             world:(st&&st.world)||((fn)=>fn()),
             toLocal:(st&&st.toLocal)||((x,y)=>({x,y})),
             toWorld:(st&&st.toWorld)||((x,y)=>({x,y})),
             /* 素体の縮小率。world 基準の寸法(帯の幅など)を局所系へ渡すときに要る。
                入れ忘れると k=1 扱いになり、雑魚だけ 0.65 倍に細く・短くなる。 */
             bodyScale:(st&&st.bodyScale)||1,
             owner:(st&&st.owner)||null, dir:(st&&st.dir)||1};
  const hands=wf.hands(rig);
  /* 腕のリーチ上限で手位置を先にクランプし、腕と得物を同一点に揃える
     (クランプ前の座標で武器を描くと手と柄が離れる) */
  const reachClamp=(sh,h)=>{ const dx=h.x-sh.x, dy=h.y-sh.y, d=Math.hypot(dx,dy)||0.001;
    const L=ARM_REACH; if(d<=L) return h;
    return {x:sh.x+dx*L/d, y:sh.y+dy*L/d}; };
  const cF=reachClamp(shAF,hands.front), cB=reachClamp(shAB,hands.back);
  hands.front.x=cF.x; hands.front.y=cF.y;
  hands.back.x=cB.x;  hands.back.y=cB.y;
  /* 素体モードは【装具を外すだけ】。ポーズ(手位置)は装備時と完全に同一にする */
  const hB=hands.back, hF=hands.front;
  /* ================= 素体の描画 =================
     輪郭は【シルエットのみ】。全部品の輪郭を先に一括で描き、その後に塗りを重ねる
     ことで、部品どうしの接続部に輪郭線が残らない。 */
  const drawBackArm =(pass)=>armP(c,shAB.x,shAB.y,hB.x,hB.y,false,pass);
  const drawFrontArm=(pass)=>armP(c,shAF.x,shAF.y,hF.x,hF.y,true,pass);
  /* 脚 = playerRenderer drawJointedLeg 実装値×SC(腕と同太さ)。
     膝丸=幅の半分・足=小円(1.9/1.65, footY+0.22)・付け根±1.05・最小曲げ(前2.35/奥2.05) */
  const legJoints=[];
  const drawLegs=(pass)=>feet.forEach(f=>{
    const w=LIMB_W;                    // 四肢すべて同太さ
    const fr=(f.front?1.9:1.65)*SC;    // playerRenderer の footRadius × SC
    /* 膝の位置は playerRenderer の待機脚の実数値に一致させる:
       前脚 knee=(hipX+0.8, hipY+10.1) / 奥脚 (hipX+0.9, hipY+9.5)、脚長 23.8。
       → 腰から 42%(前)/40%(奥)下、前方オフセットは 0.8〜0.9 だけ。
       以前は最小曲げ量(minBend 2.35/2.05)を実際の曲げとして使っており、
       膝が前へ 4px も張り出して立ち姿のバランスが崩れていた。 */
    const hx0=hipX+(f.front?1.05:-1.05)*SC;
    /* 振り付け側が膝を明示した場合(playerRenderer の空中脚は膝を実座標で持つ)は
       それをそのまま使う。fraction+bend では player の bendKneeToward を再現できない。 */
    let kj;
    if(Number.isFinite(f.kx)&&Number.isFinite(f.ky)){
      kj=limbAt(c,hx0,hipY,f.kx,f.ky,f.x,f.y,w,w,BODY.core,pass);
    } else {
      const kneeFrac=f.front?0.424:0.399;
      const kneeBend=(f.front?0.85:0.95)*SC+(f.sw?Math.sin(f.u*Math.PI)*2.0*SC:0)+crouch*0.10;
      kj=limbN(c,hx0,hipY,f.x,f.y,kneeFrac,kneeBend,'fwd',w,w,BODY.core,null,pass);
    }
    if(pass==='fill') legJoints.push({kx:kj.jx,ky:kj.jy,fx:f.x,fy:f.y,front:f.front});
    if(pass==='ol'){
      c.strokeStyle=BODY.OUT; c.lineWidth=BODY.OUTW*0.5;
      c.beginPath(); c.arc(f.x,f.y+0.22*SC,fr+BODY.OUTW*0.25,0,TAU); c.stroke();
    } else {
      c.fillStyle=BODY.core;
      c.beginPath(); c.arc(f.x,f.y+0.22*SC,fr,0,TAU); c.fill();
    }
  });
  /* 胴 = playerRenderer と同じ「幅10(×SC)の丸端ストローク1本」 */
  const drawTorso=(pass)=>{ c.lineCap='round';
    if(pass==='ol'){ c.strokeStyle=BODY.OUT; c.lineWidth=TORSO_W+BODY.OUTW; }
    else { c.strokeStyle=BODY.core; c.lineWidth=TORSO_W; }
    c.beginPath(); c.moveTo(chestX,bodyTop); c.lineTo(hipX,hipY); c.stroke(); };

  /* --- 奥腕は【独立したシルエット】。胴とは輪郭を繋げない。
         自分の輪郭+塗りを先に完結させ、この後の胴の塗りで付け根が隠れる。 --- */
  const abk=drawBackArm('own');
  if(!CAST){
    drawKote(c,{...P,aA:shade(P.aA,-16),aB:shade(P.aB,-16),edge:P.edge},abk.ex,abk.ey,abk.wx,abk.wy);
  }
  drawPalm(c,hB.x,hB.y,false,abk.wx,abk.wy);
  /* 奥手が握る得物(二刀の奥刀など)は【奥腕・奥掌の上】。
     playerRenderer は 腕 → 手 → 刀 の順で描く。掌より下に置くと
     柄が腕に潜って「刀が体を貫いている」ように見える。 */
  if(!CAST && wf.backIsFarHand && wf.back) wf.back(rig,hands);

  /* --- パス1: 輪郭(胴・脚のシルエット外周のみ。手前腕は最前面で描く) --- */
  drawLegs('ol'); drawTorso('ol');
  /* 頭の輪郭も四肢と同じ 0.6px だけ外に出す(中心線ストロークだと 1.2px 出て太く見える) */
  c.strokeStyle=BODY.OUT; c.lineWidth=BODY.OUTW*0.5;
  c.beginPath(); c.arc(headX,headY+(B.helm==='hood'?0:headR*0.03),
                       (B.helm==='hood'?headR:headR*0.95)+BODY.OUTW*0.25,0,TAU); c.stroke();

  /* --- パス2: 塗り(z順に重ねる。胴が奥腕の付け根を覆う) --- */
  drawLegs('fill');
  // 脛当。雑魚は素足(B.suneate:false)——足元まで具足を付けると格が上がって見える
  if(!CAST && B.suneate!==false) legJoints.forEach(j=>drawSuneate(c,P,j.kx,j.ky,j.fx,j.fy));
  drawTorso('fill');

  /* ---- 下衣(流派で形を変える: 草摺の枚数/布の腰巻き) ---- */
  const build=B.build||'busho';
  const skirtTop=hipY-4.5;
  if(!CAST){
  if(build==='shinobi'){
    // 鎧なし: 布の腰巻き+垂れ紐
    c.fillStyle=shade(P.robe,2);
    c.beginPath(); c.moveTo(hipX-8.5,skirtTop); c.lineTo(hipX+8.5,skirtTop);
    c.lineTo(hipX+7,skirtTop+9); c.lineTo(hipX-7,skirtTop+9); c.closePath(); c.fill();
    const cordLag=Math.sin(t*TAU/1.9+(motion==='run'?runPh*TAU:0))*(motion==='idle'?1.2:2.6);
    c.strokeStyle=shade(P.robeS,6); c.lineWidth=1.6; c.lineCap='round';
    c.beginPath(); c.moveTo(hipX-6,skirtTop+8);
    c.quadraticCurveTo(hipX-7+cordLag*0.4,skirtTop+14,hipX-6+cordLag,skirtTop+19); c.stroke();
    c.beginPath(); c.moveTo(hipX-2.5,skirtTop+8.5);
    c.quadraticCurveTo(hipX-3+cordLag*0.3,skirtTop+13,hipX-2.5+cordLag*0.8,skirtTop+17); c.stroke();
  } else {
    /* 雑魚(B.simple)は板の枚数と丈を落として簡素にする */
    const plateN=B.simple?2:(build==='ashigaru'?3:(build==='kengo'?2:4));
    const plateLen=B.simple?8:(build==='ashigaru'?10:13);
    for(let i=0;i<plateN;i++){
      const u=plateN===1?0.5:i/(plateN-1);
      // 剣豪は左右の腰にだけ板を残し、中央は着流しを見せる
      const px=build==='kengo'?lerp(hipX-9.5,hipX+9.5,i===0?0.06:0.94):lerp(hipX-9.5,hipX+9.5,u);
      const lag=Math.sin(t*TAU/1.9-i*0.9+(motion==='run'?runPh*TAU:0))*(motion==='idle'?0.9:2.0);
      const sk=lerp(-3.5,3.5,u)+lag;
      const tone=(i%2?-7:5);
      const g=c.createLinearGradient(px,skirtTop,px,skirtTop+plateLen+1);
      g.addColorStop(0,shade(P.robe,tone+4)); g.addColorStop(1,shade(P.robeS,tone));
      c.fillStyle=g;
      c.beginPath(); c.moveTo(px-3.4,skirtTop); c.lineTo(px+3.4,skirtTop);
      c.lineTo(px+2.9+sk*0.4,skirtTop+plateLen); c.lineTo(px-2.9+sk*0.4,skirtTop+plateLen); c.closePath(); c.fill();
      if(!B.simple){
        c.strokeStyle=hexA(P.edge,0.5); c.lineWidth=1;
        c.beginPath(); c.moveTo(px-2.7+sk*0.4,skirtTop+plateLen-2); c.lineTo(px+2.7+sk*0.4,skirtTop+plateLen-2); c.stroke();
      }
    }
  }

  /* ---- 胴(流派で形を変える) ---- */
  const dW=8.6+breath*(motion==='idle'?0.4:0);
  const dTop=bodyTop+0.5, dBot=hipY-1;
  if(build==='shinobi'){
    // 具足なし: 胴巻き(布)+胸の斜め掛け紐
    const g2=c.createLinearGradient(chestX,dTop+8,hipX,dBot);
    g2.addColorStop(0,shade(P.aB,-10)); g2.addColorStop(1,shade(P.aB,-2));
    c.fillStyle=g2;
    c.beginPath(); c.moveTo(lerp(chestX,hipX,0.45)-dW+3.5,lerp(dTop,dBot,0.42));
    c.lineTo(lerp(chestX,hipX,0.45)+dW-2.5,lerp(dTop,dBot,0.42));
    c.lineTo(hipX+dW-3,dBot); c.quadraticCurveTo(hipX,dBot+2.5,hipX-dW+3.5,dBot-0.5);
    c.closePath(); c.fill();
    c.strokeStyle='rgba(0,0,0,0.35)'; c.lineWidth=1.2;
    for(let i=1;i<=2;i++){ const y=lerp(lerp(dTop,dBot,0.45),dBot-2,i/3);
      c.beginPath(); c.moveTo(lerp(chestX,hipX,0.6)-dW+4,y); c.lineTo(lerp(chestX,hipX,0.6)+dW-3,y); c.stroke(); }
    // 胸の斜め掛け(鎖鎌の携行紐)
    c.strokeStyle=shade(P.aA,-6); c.lineWidth=3.2;
    c.beginPath(); c.moveTo(shB.x-3,chestY-2); c.lineTo(hipX+dW-4,dBot-4); c.stroke();
    c.strokeStyle='rgba(233,223,198,0.10)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(shB.x-2.4,chestY-1.2); c.lineTo(hipX+dW-4.6,dBot-4.6); c.stroke();
  } else {
    const g2=c.createLinearGradient(chestX-dW,dTop,chestX+dW,dBot);
    g2.addColorStop(0,shade(P.aB,-14)); g2.addColorStop(0.6,shade(P.aB,-6)); g2.addColorStop(1,shade(P.aB,4));
    c.fillStyle=g2; c.beginPath();
    c.moveTo(chestX-dW+2,dTop);
    c.quadraticCurveTo(chestX,dTop-2.5,chestX+dW,dTop+1.2);
    c.lineTo(hipX+dW-3,dBot);
    c.quadraticCurveTo(hipX,dBot+2.5,hipX-dW+3.5,dBot-0.5);
    c.closePath(); c.fill();
    if(B.simple){
      /* 雑魚の胴は【板一枚】。鋲・縅・負い紐・小物は付けない。
         作り込むほど格が上がって見えるので、雑魚は最小限に留める。 */
      c.strokeStyle=hexA(P.aA,0.30); c.lineWidth=1.1;
      const y1=lerp(dTop+3,dBot-3,0.5), xo=lerp(chestX,hipX,0.5);
      c.beginPath(); c.moveTo(xo-dW+4,y1); c.lineTo(xo+dW-3,y1); c.stroke();
    } else if(build==='ashigaru'){
      // 桶側胴: 縦の鋲留め継ぎ目+火薬袋の負い紐
      c.strokeStyle=hexA(P.aA,0.55); c.lineWidth=1.3;
      [-0.55,0,0.55].forEach(k=>{
        c.beginPath(); c.moveTo(lerp(chestX,hipX,0.15)+k*dW*0.8,dTop+3);
        c.lineTo(lerp(chestX,hipX,0.85)+k*dW*0.8,dBot-2.5); c.stroke(); });
      c.strokeStyle='#3a3325'; c.lineWidth=3.4;
      c.beginPath(); c.moveTo(shF.x+4,chestY-1); c.lineTo(hipX-dW+5,dBot-3); c.stroke();
      // 腰の玉袋
      c.fillStyle='#20242c';
      c.beginPath(); c.ellipse(hipX-dW+1,dBot-7,4.6,5.4,0.2,0,TAU); c.fill();
      c.strokeStyle=hexA(P.edge,0.5); c.lineWidth=1;
      c.beginPath(); c.moveTo(hipX-dW-2.6,dBot-11); c.lineTo(hipX-dW+4.6,dBot-10); c.stroke();
    } else {
      // 縅(横綴じ) — 剣豪は2本で軽装、大将/武将は3本
      const rows=build==='kengo'?2:3;
      c.strokeStyle=hexA(P.aA,0.6); c.lineWidth=1.4;
      for(let i=1;i<=rows;i++){ const y=lerp(dTop+2.5,dBot-2.5,i/(rows+1));
        const xo=lerp(chestX,hipX,i/(rows+1));
        c.beginPath(); c.moveTo(xo-dW+3.5,y); c.lineTo(xo+dW-2.5,y); c.stroke(); }
      if(build==='taisho'){
        // 侍大将: 胸紐の×掛け
        c.strokeStyle=hexA(P.edge,0.65); c.lineWidth=1.3;
        c.beginPath(); c.moveTo(chestX-dW*0.55,dTop+2.4); c.lineTo(chestX+dW*0.5,dTop+7.4); c.stroke();
        c.beginPath(); c.moveTo(chestX+dW*0.55,dTop+2.2); c.lineTo(chestX-dW*0.5,dTop+7.6); c.stroke();
      }
    }
    // 前縁のリムライト+縁金(雑魚は金の縁金を省いて簡素に)
    c.strokeStyle=hexA(P.edge,B.simple?0.28:0.9); c.lineWidth=B.simple?1.0:1.4;
    c.beginPath(); c.moveTo(chestX+dW,dTop+1.2); c.lineTo(hipX+dW-3,dBot); c.stroke();
    c.strokeStyle='rgba(233,223,198,0.15)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(chestX+dW-2.2,dTop+2.6); c.lineTo(hipX+dW-5.2,dBot-1.8); c.stroke();
  }
  // 帯(暗殺者の差し色は暗く沈める)
  c.fillStyle=P.robeS; c.fillRect(hipX-dW+2,dBot-3.2,dW*2-4.2,4.0);
  c.fillStyle=build==='shinobi'?hexA('#8a2a2a',0.35):hexA(P.acc,B.simple?0.22:0.55);
  c.fillRect(hipX-1.2,dBot-3.2,3.2,3.8);

  /* ---- 奥袖 ---- */
  if(SODE_S[build]>0) drawSode(c,P,shAB.x-1,shAB.y-2.5,-0.28,1.0*SODE_S[build]);
  } // !CAST(装具ここまで)

  /* ---- 頭部(素体確認時は兜・頭巾も外して素の頭。輪郭はパス1で済み) ---- */
  if(CAST){
    c.fillStyle=BODY.core;
    c.beginPath(); c.arc(headX,headY+headR*0.03,headR*0.95,0,TAU); c.fill();
  } else {
    drawHead(c,B,P,headX,headY,headR,t,motion,rig);
  }

  /* ---- レイヤー順(物理的な前後):
         奥腕 → 胴・装具 → 頭 → 【忍具】 → 手前腕 → 手前袖 → 手前の掌
         忍具は「奥腕より手前・手前腕より奥」。握る手と腕が最前面に来る。 ---- */
  /* 奥手の得物のうち【頭より前に出したい部分】。奥刀は本来 頭の裏だが、
     頭上へ振り上げた刃まで裏に回すと、真っ黒な頭の円に刃が飲まれて左右から
     生えたように見える=「突き刺さって見える」(ユーザー指摘 2026-08-15)。 */
  if(!CAST && wf.backTop) wf.backTop(rig,hands);
  if(!CAST){ if(!wf.backIsFarHand && wf.back) wf.back(rig,hands); if(wf.front) wf.front(rig,hands); }
  const afr=drawFrontArm('top');   // 輪郭+塗りを最前面で(輪郭が他部品に覆われないように)
  if(!CAST) drawKote(c,P,afr.ex,afr.ey,afr.wx,afr.wy);                    // 籠手(手前腕)
  if(!CAST && SODE_S[build]>0)
    drawSode(c,P,shAF.x+0.5,shAF.y-2,0.18+(hands.front.y<chestY-10?-0.4:0),1.06*SODE_S[build]);
  /* 手前手が握る柄は【腕の上・掌の下】。playerRenderer と同じ
     「腕 → 柄 → 手 → 刃」の順。腕より下に描くと柄が腕に隠れて刀が浮く。 */
  if(!CAST && wf.frontGrip) wf.frontGrip(rig,hands);
  /* 掌の丸は柄に重ねて最前面(柄を握って見える) */
  drawPalm(c,hF.x,hF.y,true,afr.wx,afr.wy);
  /* 掌より【前】に出す得物(playerRenderer の 'behind'→手→'front' の最後の1段)。
     鎖鎌の鎌ヘッドや二刀の刃がここに来る。 */
  if(!CAST && wf.frontTop) wf.frontTop(rig,hands);
}


/* ============================================================
   忍具の形状(weapon.js の実描画からの移植)。
   待機・走行など weaponReplica が描かない場面で素体に持たせるために使う。
   攻撃中の本体・剣筋は従来どおり weaponReplica が描く。
   ============================================================ */
/* 刀身(大太刀実装の面構成: 峰暗面/平地/刃先/鎬筋/刃文/鋒) */
function realBladeBody(c,bs,be,half){
  const rootX=bs+1.5, tipX=be, tipY=-half*0.38;
  const kiss=be-Math.max(10,(be-bs)*0.29);
  const path=()=>{ c.beginPath();
    c.moveTo(rootX,-half+0.3);
    c.lineTo(kiss,-half+1.0);
    c.quadraticCurveTo(be-half*0.85,-half+1.6,tipX,tipY);
    c.quadraticCurveTo(be-half*0.5,half*0.3,kiss,half-1.0);
    c.lineTo(rootX,half-0.3);
    c.quadraticCurveTo(bs-0.7,0,rootX,-half+0.3);
    c.closePath(); };
  const g=c.createLinearGradient(0,-half,0,half);
  g.addColorStop(0.00,'#263446'); g.addColorStop(0.22,'#657384');
  g.addColorStop(0.43,'#dce4ec'); g.addColorStop(0.57,'#f7fafc');
  g.addColorStop(0.78,'#c6d0da'); g.addColorStop(1.00,'#8e9baa');
  c.fillStyle=g; path(); c.fill();
  c.save(); path(); c.clip();
  // 峰側の濃紺
  const sp=c.createLinearGradient(bs,-half,be,-1);
  sp.addColorStop(0,'rgba(28,42,59,0.56)'); sp.addColorStop(0.56,'rgba(54,69,88,0.76)'); sp.addColorStop(1,'rgba(16,28,44,0.88)');
  c.fillStyle=sp;
  c.beginPath(); c.moveTo(rootX,-half+0.25); c.lineTo(kiss,-half+1.0);
  c.quadraticCurveTo(be-half*0.85,-half+1.6,tipX,tipY);
  c.quadraticCurveTo(be-half*1.4,-half*0.3,kiss-2,-half*0.15);
  c.lineTo(bs+half,-half*0.07); c.closePath(); c.fill();
  // 刃先の高輝度
  const eg=c.createLinearGradient(0,half*0.35,0,half);
  eg.addColorStop(0,'rgba(210,221,232,0.22)'); eg.addColorStop(0.62,'rgba(252,254,255,0.82)'); eg.addColorStop(1,'rgba(222,231,240,0.62)');
  c.fillStyle=eg;
  c.beginPath(); c.moveTo(bs+half*0.6,half-0.4); c.lineTo(kiss,half-1.2);
  c.quadraticCurveTo(be-half*0.5,half*0.3,tipX,tipY);
  c.quadraticCurveTo(be-half*1.4,half*0.15,kiss-3,half*0.5);
  c.lineTo(bs+half,half*0.55); c.closePath(); c.fill();
  // 鎬筋
  const sg=c.createLinearGradient(bs+half,0,kiss,0);
  sg.addColorStop(0,'rgba(255,255,255,0.30)'); sg.addColorStop(0.45,'rgba(255,255,255,0.72)'); sg.addColorStop(1,'rgba(215,228,240,0.24)');
  c.strokeStyle=sg; c.lineWidth=Math.max(0.8,half*0.14); c.lineCap='round';
  c.beginPath(); c.moveTo(bs+half*1.1,-half*0.05); c.lineTo(kiss-2,-half*0.14); c.stroke();
  // 刃文(互の目)
  c.strokeStyle='rgba(242,247,252,0.42)'; c.lineWidth=Math.max(0.5,half*0.09);
  c.beginPath(); c.moveTo(bs+half*1.4,half*0.82);
  const spanW=(kiss-bs);
  c.bezierCurveTo(bs+spanW*0.3,half*0.95,bs+spanW*0.45,half*0.72,bs+spanW*0.62,half*0.82);
  c.bezierCurveTo(bs+spanW*0.8,half*0.9,kiss-6,half*0.68,kiss-1,half*0.5);
  c.stroke();
  // 横手
  c.strokeStyle='rgba(234,242,250,0.56)'; c.lineWidth=0.62;
  c.beginPath(); c.moveTo(kiss,-half+1.1); c.lineTo(kiss+1.2,half-1.3); c.stroke();
  c.restore();
  path(); c.strokeStyle='#1d2b3c'; c.lineWidth=1.0; c.lineJoin='round'; c.stroke();
}
/* 柄(柄巻の綾目)+鎺+鍔 — 鎖鎌の柄巻/大太刀の鎺・鍔の実装色 */
function realTsukaTsuba(c,backLen,bs,half){
  const gh=Math.max(2.2,half*0.52);
  const hg=c.createLinearGradient(0,-gh,0,gh);
  hg.addColorStop(0,'#6a4a2c'); hg.addColorStop(0.5,'#3c2917'); hg.addColorStop(1,'#20150b');
  c.save();
  c.beginPath();
  c.moveTo(-backLen,-gh+0.6); c.lineTo(bs-3,-gh+0.2);
  c.lineTo(bs-3,gh-0.2); c.lineTo(-backLen,gh-0.6);
  c.quadraticCurveTo(-backLen-1.4,0,-backLen,-gh+0.6); c.closePath();
  c.fillStyle=hg; c.fill(); c.clip();
  c.strokeStyle='rgba(12,7,3,0.6)'; c.lineWidth=1.0;
  for(let wx=-backLen+1;wx<bs-4;wx+=3.0){
    c.beginPath(); c.moveTo(wx,-gh); c.lineTo(wx+2.4,gh); c.stroke();
    c.beginPath(); c.moveTo(wx+2.4,-gh); c.lineTo(wx,gh); c.stroke();
  }
  c.strokeStyle='rgba(255,228,180,0.14)'; c.lineWidth=0.5;
  for(let wx=-backLen+1;wx<bs-4;wx+=3.0){ c.beginPath(); c.moveTo(wx-0.4,-gh); c.lineTo(wx+2.0,gh); c.stroke(); }
  c.restore();
  // 鎺(金)
  const habB=bs-4.2, habF=bs+0.6;
  const hb=c.createLinearGradient(habB,-half,habF,half);
  hb.addColorStop(0,'#684716'); hb.addColorStop(0.34,'#e0c26d'); hb.addColorStop(0.66,'#9a7328'); hb.addColorStop(1,'#49300f');
  c.fillStyle=hb;
  c.beginPath(); c.moveTo(habB,-half*0.92); c.lineTo(habF,-half*1.0);
  c.lineTo(habF,half*1.0); c.lineTo(habB,half*0.92); c.closePath(); c.fill();
  c.strokeStyle='rgba(46,29,8,0.72)'; c.lineWidth=0.5; c.stroke();
  // 鍔(金の薄い楕円)
  const tx=bs-5.8;
  const tg=c.createLinearGradient(tx-2.5,-half*1.5,tx+2.5,half*1.5);
  tg.addColorStop(0,'#5f4013'); tg.addColorStop(0.34,'#dfc36f'); tg.addColorStop(0.62,'#997128'); tg.addColorStop(1,'#432a0b');
  c.fillStyle=tg;
  c.beginPath(); c.ellipse(tx,0,Math.max(1.8,half*0.28),half*1.42+1.6,0,0,TAU); c.fill();
  c.strokeStyle='#2a1a07'; c.lineWidth=0.68; c.stroke();
  c.strokeStyle='rgba(255,240,190,0.48)'; c.lineWidth=0.46;
  c.beginPath(); c.ellipse(tx-0.25,-0.45,Math.max(1.1,half*0.17),half*1.15,0,-Math.PI*0.62,Math.PI*0.42); c.stroke();
}
function katana(c,x,y,ang,len,wdt,tint){
  c.save(); c.translate(x,y); c.rotate(ang);
  realTsukaTsuba(c,10,4,3.0);
  realBladeBody(c,4,len+4,3.0);
  c.restore();
}
/* 大槍 — 柄の木目/紫管/胴金/口金/葉形穂先(実装色) */
function realSpear(c,shaftEnd,buttLen){
  const tip=shaftEnd+28, bladeBase=tip-28;
  const sockF=bladeBase-0.8, sockB=sockF-6.2;
  // 柄(木)
  const sg=c.createLinearGradient(-buttLen,0,shaftEnd,0);
  sg.addColorStop(0,'#3a1f0f'); sg.addColorStop(0.38,'#704526'); sg.addColorStop(0.7,'#5e351a'); sg.addColorStop(1,'#2f170b');
  c.strokeStyle=sg; c.lineWidth=4.0; c.lineCap='round';
  c.beginPath(); c.moveTo(-buttLen,0); c.lineTo(shaftEnd,0); c.stroke();
  c.strokeStyle='rgba(242,208,156,0.46)'; c.lineWidth=0.9;
  c.beginPath(); c.moveTo(-buttLen+1.2,-0.9); c.lineTo(shaftEnd-8,-0.8); c.stroke();
  c.strokeStyle='rgba(30,12,7,0.5)'; c.lineWidth=1.0;
  c.beginPath(); c.moveTo(-buttLen+0.4,1.4); c.lineTo(shaftEnd-10,1.2); c.stroke();
  // 金具リング
  const ring=(xp,w,h)=>{ const rg=c.createLinearGradient(0,-h,0,h);
    rg.addColorStop(0,'#c8d0db'); rg.addColorStop(0.5,'#737c89'); rg.addColorStop(1,'#f0f4fa');
    c.fillStyle=rg; c.fillRect(xp-w*0.5,-h,w,h*2);
    c.strokeStyle='rgba(25,30,40,0.65)'; c.lineWidth=0.8; c.strokeRect(xp-w*0.5,-h,w,h*2); };
  // 紫管(布巻き)+リング
  const tg=c.createLinearGradient(-4,0,7,0);
  tg.addColorStop(0,'#3a2a70'); tg.addColorStop(0.42,'#5a48a2'); tg.addColorStop(1,'#2f255f');
  c.fillStyle=tg; c.fillRect(-4,-1.9,11,3.8);
  ring(-4.5,1.5,2.1); ring(7.2,3.6,3.0);
  ring(shaftEnd-13,3.4,2.7); ring(shaftEnd-7,3.3,2.9);
  // 口金ソケット
  const skg=c.createLinearGradient(sockB,0,sockF,0);
  skg.addColorStop(0,'#6e7785'); skg.addColorStop(0.5,'#c8d2df'); skg.addColorStop(1,'#798391');
  c.fillStyle=skg;
  c.beginPath(); c.moveTo(sockB,-2.8); c.lineTo(sockF,-2.2); c.lineTo(sockF,2.2); c.lineTo(sockB,2.8);
  c.closePath(); c.fill();
  c.strokeStyle='rgba(34,40,49,0.7)'; c.lineWidth=0.8; c.stroke();
  // 葉形の穂先
  const bh=7.6, belly=bladeBase+(tip-bladeBase)*0.58;
  const bg=c.createLinearGradient(bladeBase,0,tip,0);
  bg.addColorStop(0,'#778291'); bg.addColorStop(0.34,'#b9c4cf'); bg.addColorStop(0.68,'#8f9aa7'); bg.addColorStop(1,'#626d7c');
  c.fillStyle=bg;
  c.beginPath();
  c.moveTo(bladeBase,-1.3);
  c.quadraticCurveTo(belly,-bh,tip-(tip-bladeBase)*0.22,-bh*0.06);
  c.lineTo(tip,0);
  c.lineTo(tip-(tip-bladeBase)*0.22,bh*0.06);
  c.quadraticCurveTo(belly,bh,bladeBase,1.3);
  c.closePath(); c.fill();
  const cg=c.createLinearGradient(bladeBase,-bh,bladeBase,bh);
  cg.addColorStop(0,'rgba(56,66,80,0.34)'); cg.addColorStop(0.46,'rgba(236,242,248,0.23)'); cg.addColorStop(1,'rgba(52,62,78,0.38)');
  c.save(); c.beginPath();
  c.moveTo(bladeBase,-1.3); c.quadraticCurveTo(belly,-bh,tip,0); c.quadraticCurveTo(belly,bh,bladeBase,1.3);
  c.closePath(); c.clip();
  c.fillStyle=cg; c.fillRect(bladeBase-1,-bh-1,(tip-bladeBase)+2,bh*2+2);
  c.restore();
  c.strokeStyle='rgba(255,255,255,0.6)'; c.lineWidth=0.7;
  c.beginPath(); c.moveTo(bladeBase+(tip-bladeBase)*0.09,0);
  c.quadraticCurveTo(bladeBase+(tip-bladeBase)*0.62,-0.3,tip-1.0,0); c.stroke();
  // 石突(金冠)
  ring(-buttLen+0.8,3.2,2.6);
}
/* 鎖鎌 — drawSickleHead(実装)の移植 */
/* mode: 'all'(既定) | 'handle'(鎖環+柄+口金) | 'blade'(刃だけ)
   握って見せるには playerRenderer の刀と同じく 柄 → 掌 → 刃 の順で描く必要がある。
   全部まとめて掌より前に描くと、手の甲に貼り付いたように見える。 */
function realSickle(c,x,y,ang,mode){
  const doHandle = mode!=='blade', doBlade = mode!=='handle';
  c.save(); c.translate(x,y); c.rotate(ang);
  const HL=18;
  const bladeOutline=()=>{ c.beginPath();
    c.moveTo(2.6,0.4);
    c.quadraticCurveTo(3.4,-10.5,-1.8,-18.6);
    c.quadraticCurveTo(-4.6,-20.8,-5.8,-18.0);
    c.quadraticCurveTo(-3.8,-9.0,-1.3,-0.9);
    c.quadraticCurveTo(0.4,0.0,2.6,0.4);
    c.closePath(); };
  if(doHandle){
  // 柄尻の鎖環
  const gw=c.createRadialGradient(-HL-1,-1,0.3,-HL,0.6,4.4);
  gw.addColorStop(0,'#b8c0cc'); gw.addColorStop(0.5,'#5d6776'); gw.addColorStop(1,'#202530');
  c.fillStyle=gw; c.beginPath(); c.arc(-HL,0,2.9,0,TAU); c.fill();
  c.strokeStyle='rgba(8,10,14,0.75)'; c.lineWidth=0.55; c.stroke();
  c.fillStyle='rgba(8,10,14,0.88)'; c.beginPath(); c.arc(-HL,0,1.05,0,TAU); c.fill();
  // 柄(木+柄巻)
  const gh2=2.5, gx0=-HL+1.4, gx1=-0.5;
  const hgr=c.createLinearGradient(0,-2.6,0,2.6);
  hgr.addColorStop(0,'#6a4a2c'); hgr.addColorStop(0.5,'#3c2917'); hgr.addColorStop(1,'#20150b');
  c.save(); c.beginPath();
  c.moveTo(gx0,-gh2+0.6); c.lineTo(gx1,-gh2+0.2); c.lineTo(gx1,gh2-0.2); c.lineTo(gx0,gh2-0.6);
  c.quadraticCurveTo(gx0-1.2,0,gx0,-gh2+0.6); c.closePath();
  c.fillStyle=hgr; c.fill(); c.clip();
  c.strokeStyle='rgba(12,7,3,0.6)'; c.lineWidth=0.95;
  for(let wx=gx0+0.6;wx<gx1-0.4;wx+=2.0){
    c.beginPath(); c.moveTo(wx,-gh2); c.lineTo(wx+1.7,gh2); c.stroke();
    c.beginPath(); c.moveTo(wx+1.7,-gh2); c.lineTo(wx,gh2); c.stroke();
  }
  c.restore();
  // 口金(金)
  const fg=c.createLinearGradient(0,-3.2,0,3.2);
  fg.addColorStop(0,'#e6d39a'); fg.addColorStop(0.5,'#ab8c43'); fg.addColorStop(1,'#5a421a');
  c.fillStyle=fg;
  c.beginPath(); c.moveTo(-2.4,-2.9); c.lineTo(2.9,-2.6); c.lineTo(2.9,2.8); c.lineTo(-2.4,2.7);
  c.closePath(); c.fill();
  c.strokeStyle='rgba(40,28,8,0.65)'; c.lineWidth=0.5; c.stroke();
  }
  if(doBlade){
  // 刃本体
  const bg=c.createLinearGradient(3,-1,-7,-19);
  bg.addColorStop(0,'#454f5e'); bg.addColorStop(0.22,'#6c7889'); bg.addColorStop(0.5,'#9fabba');
  bg.addColorStop(0.82,'#d6dee8'); bg.addColorStop(1,'#f7fafe');
  bladeOutline(); c.fillStyle=bg; c.fill();
  c.save(); bladeOutline(); c.clip();
  const sp2=c.createLinearGradient(3.5,0,-6,-18);
  sp2.addColorStop(0,'rgba(34,42,54,0.80)'); sp2.addColorStop(0.5,'rgba(50,60,76,0.22)'); sp2.addColorStop(1,'rgba(60,70,86,0)');
  c.fillStyle=sp2; bladeOutline(); c.fill();
  c.strokeStyle='rgba(255,255,255,0.38)'; c.lineWidth=0.6;
  c.beginPath(); c.moveTo(1.4,-1.0); c.quadraticCurveTo(-0.6,-10,-4.0,-17.8); c.stroke();
  c.restore();
  c.strokeStyle='rgba(255,255,255,0.85)'; c.lineWidth=0.7;
  c.beginPath(); c.moveTo(-1.3,-0.9); c.quadraticCurveTo(-3.8,-9.0,-5.7,-17.8); c.stroke();
  bladeOutline(); c.strokeStyle='rgba(28,34,44,0.92)'; c.lineWidth=0.6; c.stroke();
  c.fillStyle='rgba(255,255,255,0.9)'; c.beginPath(); c.arc(-5.4,-18.8,0.8,0,TAU); c.fill();
  }
  c.restore();
}
/* 鎖(実装の鎖コマ: 楕円環を接線方向へ) */
function realChain(c,x0,y0,x1,y1,ctrlX,ctrlY){
  c.strokeStyle='rgba(150,160,175,0.5)'; c.lineWidth=1.1;
  c.beginPath(); c.moveTo(x0,y0); c.quadraticCurveTo(ctrlX,ctrlY,x1,y1); c.stroke();
  const len=Math.hypot(x1-x0,y1-y0);
  const links=Math.max(6,Math.min(20,Math.round(len/6)));
  c.fillStyle='rgba(106,114,128,0.95)'; c.strokeStyle='rgba(220,230,244,0.46)'; c.lineWidth=0.7;
  for(let i=1;i<links;i++){
    const t=i/links, inv=1-t;
    const px=inv*inv*x0+2*inv*t*ctrlX+t*t*x1;
    const py=inv*inv*y0+2*inv*t*ctrlY+t*t*y1;
    const tx=2*inv*(ctrlX-x0)+2*t*(x1-ctrlX);
    const ty=2*inv*(ctrlY-y0)+2*t*(y1-ctrlY);
    const a=Math.atan2(ty,tx);
    c.save(); c.translate(px,py); c.rotate(a);
    c.beginPath(); c.ellipse(0,0,1.55,0.97,0,0,TAU); c.fill(); c.stroke();
    c.restore();
  }
}
/* 分銅(実装の鎖環と同系の金属球) */
function realWeight(c,x,y,r=3.6){
  const g=c.createRadialGradient(x-1,y-1,0.3,x,y+0.6,r+1.2);
  g.addColorStop(0,'#b8c0cc'); g.addColorStop(0.5,'#5d6776'); g.addColorStop(1,'#202530');
  c.fillStyle=g; c.beginPath(); c.arc(x,y,r,0,TAU); c.fill();
  c.strokeStyle='rgba(8,10,14,0.75)'; c.lineWidth=0.55; c.stroke();
  c.fillStyle='rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x-r*0.3,y-r*0.32,r*0.22,0,TAU); c.fill();
}
/* 火薬玉(実装の鋳鉄球+導火線) */
function realBomb(c,x,y,r,timeMs){
  const g=c.createRadialGradient(x-r*0.34,y-r*0.34,r*0.04,x,y,r);
  g.addColorStop(0,'#666c75'); g.addColorStop(0.18,'#454a52'); g.addColorStop(0.50,'#262a2f'); g.addColorStop(1,'#080a0d');
  c.fillStyle=g; c.beginPath(); c.arc(x,y,r,0,TAU); c.fill();
  c.strokeStyle='rgba(6,8,11,0.7)'; c.lineWidth=0.8;
  c.beginPath(); c.arc(x,y,r-0.4,0,TAU); c.stroke();
  // 球面反射
  c.save(); c.beginPath(); c.arc(x,y,r-0.7,0,TAU); c.clip();
  const dh=c.createRadialGradient(x-r*0.42,y-r*0.46,0,x-r*0.22,y-r*0.26,r*0.76);
  dh.addColorStop(0,'rgba(236,241,248,0.17)'); dh.addColorStop(0.30,'rgba(207,214,224,0.085)');
  dh.addColorStop(0.68,'rgba(161,170,183,0.03)'); dh.addColorStop(1,'rgba(130,140,154,0)');
  c.fillStyle=dh; c.fillRect(x-r,y-r,r*2,r*2);
  c.restore();
  // 導火線(焦げ縁→縄色→ハイライトの三重)+口金
  const collarY=y-r*0.99;
  const sw=Math.sin(timeMs*0.0058)*0.78+Math.sin(timeMs*0.0058*0.57+1.35)*0.22;
  const tsx=sw*r*0.06;
  const p0={x:x+r*0.02,y:collarY+r*0.06}, p1={x:x+r*0.16,y:collarY-r*0.08},
        p2={x:x+r*0.23+tsx*0.46,y:collarY-r*0.29}, p3={x:x+r*0.29+tsx,y:collarY-r*0.47};
  const fuse=()=>{ c.beginPath(); c.moveTo(p0.x,p0.y); c.bezierCurveTo(p1.x,p1.y,p2.x,p2.y,p3.x,p3.y); };
  c.lineCap='round';
  fuse(); c.strokeStyle='#241207'; c.lineWidth=Math.max(2.0,r*0.25); c.stroke();
  fuse(); c.strokeStyle='#81502a'; c.lineWidth=Math.max(1.4,r*0.17); c.stroke();
  fuse(); c.strokeStyle='rgba(224,173,103,0.30)'; c.lineWidth=Math.max(0.45,r*0.035); c.stroke();
  const bg2=c.createLinearGradient(x-r*0.25,collarY,x-r*0.25,collarY+r*0.22);
  bg2.addColorStop(0,'#3b4048'); bg2.addColorStop(0.48,'#20242a'); bg2.addColorStop(1,'#0e1115');
  c.fillStyle=bg2; c.fillRect(x-r*0.25,collarY,r*0.5,r*0.22);
  // 火花
  const sp3=(timeMs*0.007)%1;
  c.save(); c.globalCompositeOperation='lighter';
  const eg2=c.createRadialGradient(p3.x,p3.y,0,p3.x,p3.y,r*0.5);
  eg2.addColorStop(0,'rgba(255,220,140,0.85)'); eg2.addColorStop(1,'rgba(255,120,30,0)');
  c.fillStyle=eg2; c.beginPath(); c.arc(p3.x,p3.y,r*0.5,0,TAU); c.fill();
  c.fillStyle='rgba(255,230,150,0.9)';
  for(let i=0;i<4;i++){ const a=i*TAU/4+sp3*TAU;
    c.beginPath(); c.arc(p3.x+Math.cos(a)*(1.2+sp3*2.4),p3.y+Math.sin(a)*(1.2+sp3*2.4),0.8,0,TAU); c.fill(); }
  c.restore();
}

/* ============================================================
   五将の意匠(提案書で合意した配色・具足・前立)
   ============================================================ */
export const BOSS_DESIGNS = {
  // 壱之陣 火薬玉の足軽頭 — 錆銅 / 桶側胴 / 火焔前立
  kayaku: { id:'kayaku', headRatio:0.20, build:'ashigaru', helm:'kabuto', crest:'disc',
    pal:{ aA:'#8a5326', aB:'#4d2c12', edge:'#e6b578', sh:'#9c6231',
          robe:'#5a3a1e', robeS:'#33200e', helm:'#6b3f1c', helmD:'#2c1a0b',
          crest:'#ff9a3c', acc:'#e2622a', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a' } },
  // 弐之陣 大槍の武者 — 藍鉄 / 大袖+胸紐 / 鍬形剣立
  yari: { id:'yari', headRatio:0.20, build:'taisho', helm:'kabuto', crest:'kuwagata',
    pal:{ aA:'#2f4a7a', aB:'#1a2b48', edge:'#d3dcec', sh:'#3d5d92',
          robe:'#22334f', robeS:'#141d2e', helm:'#243a5e', helmD:'#101827',
          crest:'#eaf0fa', acc:'#5b86c9', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a' } },
  // 参之陣 二刀流の剣豪 — 白銀鼠 / 軽装 / 半月剣・開き構え
  nito: { id:'nito', headRatio:0.20, build:'kengo', helm:'kabuto', crest:'gessou', openStance:true,
    pal:{ aA:'#8e93a3', aB:'#5a5f6d', edge:'#eceef6', sh:'#a3a8b8',
          robe:'#484b57', robeS:'#2b2e36', helm:'#787d8c', helmD:'#3a3d46',
          crest:'#f2f4fc', acc:'#9a7fd0', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a' } },
  // 肆之陣 鎖鎌の暗殺者 — 濡羽 / 鎧なし / 覆面
  kusa: { id:'kusa', headRatio:0.20, build:'shinobi', helm:'hood', crest:null,
    idleSpread:0.9, idleCrouch:5,
    pal:{ aA:'#2a2f38', aB:'#171b22', edge:'#68758c', sh:'#333a46',
          robe:'#20242c', robeS:'#111419', helm:'#2b3140', helmD:'#0c0f14',
          crest:'#4d5666', acc:'#8a2a2a', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a' } },
  // 伍之陣 大太刀の武将 — 漆黒+黄金 / 陣羽織 / 大三日月
  odachi: { id:'odachi', headRatio:0.20, build:'busho', helm:'kabuto', crest:'mikazuki', cape:true,
    pal:{ aA:'#2c2c2c', aB:'#141414', edge:'#e2bd4a', sh:'#3c3c3c',
          robe:'#2b1f1f', robeS:'#1a1212', helm:'#1c1c1c', helmD:'#080808',
          crest:'#ffcf3a', acc:'#c8452c', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a',
          capeA:'#5c0f14', capeB:'#1c0406' } }
};

/* ============================================================
   雑魚敵・中ボスの意匠。素体リグはボスと同一(renderBossActor の bodyHeight で縮小)。
   ボスとの差は【装具の形と量】で付ける —— 色替えでの差別化はしない。
     足軽: 陣笠 / 胴丸だけ / 袖なし
     侍  : 兜(小さな半月前立) / 二段の縅
     忍  : 頭巾 / 鎧なし
     武将: 兜(大三日月) / 陣羽織 —— 中ボス。ボスの武将より装飾を落とす
   ============================================================ */
export const MOB_DESIGNS = {
  ashigaru: { id:'ashigaru', build:'ashigaru', helm:'kasa', crest:null,
    idleSpread:0.95, idleCrouch:2, headRatio:0.2392, hipRatio:0.342, suneate:false, simple:true,
    pal:{ aA:'#4c5360', aB:'#2e343e', edge:'#9c8a5e', sh:'#5a6270',
          robe:'#2c313b', robeS:'#1b1f26', helm:'#6d4f2e', helmD:'#31210f',
          crest:'#c9a862', acc:'#7a6a3c', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a' } },
  samurai:  { id:'samurai', build:'kengo', helm:'mage', crest:null,
    idleSpread:1.0, idleCrouch:2, headRatio:0.2392, hipRatio:0.342, suneate:false, simple:true,
    pal:{ aA:'#46505f', aB:'#2f3641', edge:'#c2a95e', sh:'#596273',
          robe:'#262b34', robeS:'#171b21', helm:'#333a46', helmD:'#171a21',
          crest:'#e8dcae', acc:'#8a5f9a', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a' } },
  ninja:    { id:'ninja', build:'shinobi', helm:'hachimaki', crest:null,
    idleSpread:0.9, idleCrouch:4, headRatio:0.2392, hipRatio:0.342, suneate:false, simple:true,
    pal:{ aA:'#2b303a', aB:'#191d24', edge:'#6a74a0', sh:'#343b47',
          robe:'#1f232b', robeS:'#14171d', helm:'#2c313d', helmD:'#0e1015',
          crest:'#8d9fcc', acc:'#6f5ba2', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a' } },
  /* 中ボスの頭身は雑魚(2.09)とフロアボス(2.67)の中間 2.35。headRatio=0.5/2.35 */
  busho:    { id:'busho', build:'busho', helm:'kabuto', crest:'kuwagata', cape:true,
    idleSpread:1.05, idleCrouch:2, headRatio:0.213, hipRatio:0.380,
    pal:{ aA:'#4a4550', aB:'#2b272f', edge:'#c9a95a', sh:'#5c5763',
          robe:'#2f1b22', robeS:'#1d1116', helm:'#33303a', helmD:'#141317',
          crest:'#dcb45c', acc:'#a5384c', legF:'#1a1a1a', legB:'#1a1a1a', core:'#1a1a1a',
          capeA:'#7a2436', capeB:'#22090f' } }
};

/* ---- 雑魚の得物アダプタ。ボスと同じ「hands / front / frontTop」契約。
       雑魚は weaponReplica を持たないので、進行度(atk)から素体側で振る。 ---- */

/* 雑魚の攻撃エフェクト共通値。プレイヤー/フロアボスより一段淡く・細く・短く。
   (画面に4〜5体並ぶので同じ濃さだと誰の斬撃か読めなくなる) */
const MOB_FX = {
  base:'174,204,236', edge:'232,244,255',
  headAlpha:0.24, coreAlpha:0.46
};
/* 刃を振る得物(刀・薙刀)の共通剣筋。切先を world で貯めて彗星リボンにする。
   剣筋は【刃より奥】に置く(刃の上に重ねると刀身が光に埋まる)。 */
function mobBladeTrail(r, key, tipLocalX, tipLocalY, active, o){
  const owner = r.owner; if (!owner) return;
  if (active){
    const w = r.toWorld(tipLocalX, tipLocalY);
    feedTrail(owner, key, w.x, w.y, { maxAge:o.maxAge, minDist:o.minDist||2.0, cap:o.cap||26 });
  }
  /* 貯まっていないフレームは world 変換の往復ごと省く(常時4〜5体ぶん走るため) */
  const b = owner._mobFx && owner._mobFx.trails[key];
  if (!b || b.pts.length < 3) return;
  r.world(() => drawTrail(r.c, owner, key, {
    headHalf:o.headHalf,
    baseColor:o.base||MOB_FX.base, edgeColor:o.edge||MOB_FX.edge,
    headAlpha:o.headAlpha!=null?o.headAlpha:MOB_FX.headAlpha,
    coreAlpha:o.coreAlpha!=null?o.coreAlpha:MOB_FX.coreAlpha
  }));
}

/** 足軽の槍。両手で構え、攻撃で前へ突き出す */
export const mobSpear = {
  hands(r){
    const { shF, motion, runPh, sway, atk } = r;
    const s = motion === 'run' ? Math.sin(runPh * TAU) * 2.2 : sway * 0.4;
    let push = 0, lift = 0;
    if (motion === 'attack') {
      const w = Math.max(0, 1 - cl01(atk) / 0.34);            // 引き
      const d = Math.sin(cl01(Math.max(0, (atk - 0.22)) / 0.56) * Math.PI * 0.5);
      push = -w * 9 + d * 13; lift = -d * 2;
    }
    const fy = shF.y + 17 + s + lift;
    return { front: { x: shF.x + 1 + push,  y: fy + 2 },
             back:  { x: shF.x + 26 + push, y: fy - 1 } };
  },
  front(r, h){
    const c = r.c, f = h.front, b = h.back;
    const ang = Math.atan2(b.y - f.y, b.x - f.x);
    c.save(); c.translate(f.x, f.y); c.rotate(ang); c.scale(52 / 28, 1.3);
    realSpear(c, 59, 15.6);
    c.restore();
    /* 突きのエフェクト。切先が直線を往復するだけなので彗星リボンは潰れる。
       伸び速度から「後方へ引く一本の尾」を作り、突き切りで穂先を光らせる。 */
    if (r.motion !== 'attack') return;
    const p = cl01(r.atk);
    const ext = cl01((p - 0.22) / 0.56);
    const sp = Math.sin(ext * Math.PI);            // 中盤が最速
    if (sp <= 0.03) return;
    /* 穂先の【前方】へ抜ける突き波。柄に重ねた尾は木部と同化して見えないので、
       得物に重ならない前方だけで速さを見せる(穂先自体は光らせない)。 */
    const px = f.x + Math.cos(ang) * SPEAR_TIP, py = f.y + Math.sin(ang) * SPEAR_TIP;
    drawThrustWave(c, px, py, ang, 7 + 26 * ext, 0.62, 2.6, 0.52 * sp, MOB_FX.base);
    if (ext > 0.74) {
      const kk = 1 - cl01((ext - 0.74) / 0.26);
      drawFlash(c, px, py, 8, 0.34 * kk, MOB_FX.edge);
      drawBurstLines(c, px, py, ang, 3, 16, 0.30 * kk, MOB_FX.edge, 0.45);
    }
    /* 踏み込みの土煙は前足の着地(突き切り)で一度だけ */
    if (onceThisAttack(r.owner, 'yariStep', ext > 0.72) && r.owner) {
      const o = r.owner;
      mobGroundDust(o, o.x + o.width * 0.5 + (o.facingRight ? 8 : -8), o.y + o.height, {
        count: 4, intensity: 0.5, spread: 0.8, speed: 0.9, rise: 0.35, size: 7
      });
    }
  }
};
/* 穂先までの距離(局所px)。realSpear(59,15.6) の tip=59+28 に x スケール 52/28 が掛かる */
const SPEAR_TIP = (59 + 28) * (52 / 28);

/** 侍/中ボスの打刀。プレイヤーと同じ刀身。柄→掌→刃の順で握らせる */
function katanaHands(r, reach){
  const { shF, motion, runPh, sway, atk } = r;
  if (motion === 'attack') {
    const p = cl01(atk);
    // 振りかぶり(-2.1) → 袈裟に振り下ろす(+0.55) → 残心
    const up = ezIO(seg(p, 0.04, 0.34)), cut = ezIn(seg(p, 0.38, 0.56)), rc = ezIO(seg(p, 0.70, 1));
    const a = lerp(-1.35, -2.10, up) + cut * 2.60 - rc * 1.10;
    return { front: { x: shF.x + 2 + Math.cos(a) * reach, y: shF.y + 6 + Math.sin(a) * reach },
             back:  { x: shF.x + 13 - up * 3, y: shF.y + 15 + cut * 3 }, a };
  }
  const s = motion === 'run' ? Math.sin(runPh * TAU) * 2.4 : sway * 0.5;
  return { front: { x: shF.x + 2 - s, y: shF.y + 15 + s * 0.4 },
           back:  { x: shF.x + 15 + s * 0.6, y: shF.y + 12 }, a: -1.15 + sway * 0.02 };
}
export const mobKatana = {
  hands(r){ return katanaHands(r, 19); },
  front(r, h){ drawMobKatana(r.c, h.front, h.a, 'handle', 70); },
  frontTop(r, h){
    /* 切先 = 手 + (cos,sin)×刃渡り。角度は drawKatanaShape と同じ
       uprightBlend(0.28)補正【後】の値、長さは同関数の visualBladeLength(=len-5)。 */
    const adj = h.a + (-Math.PI / 2 - h.a) * 0.28;
    const reach = (70 - 5) * KATANA_SC * 0.9;
    const p = cl01(r.atk);
    mobBladeTrail(r, 'katana',
      h.front.x + Math.cos(adj) * reach, h.front.y + Math.sin(adj) * reach,
      r.motion === 'attack' && p > 0.30 && p < 0.88,
      { headHalf: 4.2, maxAge: 115 });
    drawMobKatana(r.c, h.front, h.a, 'blade', 70);
  }
};
/* 雑魚の刀。形はプレイヤーと同一(katanaShape)だが、刃渡りはボスより短くして格を下げる */
function drawMobKatana(c, hand, angRaw, mode, len){
  c.save(); c.translate(hand.x, hand.y); c.scale(KATANA_SC * 0.9, KATANA_SC * 0.9);
  drawKatanaShape(c, 0, 0, angRaw === undefined ? -1.15 : angRaw, 1, len || 70, 0.28, mode || 'all');
  c.restore();
}

/** 忍の手裏剣。近接武器は持たない(実装は EnemyProjectile を投げるだけ)。
    投擲の腕振りはプレイヤーの 'throw' 実装をそのまま使う:
      armAngle = -0.8π + pow(progress,0.55)*0.8π  (上後方 -144° → 前方 0°) */
export const mobShuriken = {
  hands(r){
    const { shF, motion, runPh, sway, atk } = r;
    if (motion === 'attack') {
      const u = cl01(atk);
      const LEN = 19 * SC * 0.72;
      const BACK = -Math.PI * 0.8;
      let ang;
      if (u < 0.16)      ang = 0;
      else if (u < 0.60) ang = lerp(0, BACK, ezIO(seg(u, 0.16, 0.60)));
      else               ang = BACK + Math.pow(seg(u, 0.60, 1.0), 0.55) * Math.PI * 0.8;
      const cock = (u < 0.60) ? ezIO(seg(u, 0.16, 0.60)) : 1 - Math.pow(seg(u, 0.60, 1.0), 0.55);
      return { front: { x: shF.x + Math.cos(ang) * LEN, y: shF.y + 2 + Math.sin(ang) * LEN },
               back:  { x: shF.x + 14 - cock * 5, y: shF.y + 12 + cock * 3 },
               u, ang };
    }
    const s = motion === 'run' ? Math.sin(runPh * TAU) * 3 : sway * 0.5;
    return { front: { x: shF.x + 1 - s, y: shF.y + 15 + s * 0.4 },
             back:  { x: shF.x + 13 + s * 0.6, y: shF.y + 12 }, u: 0 };
  },
  front(){},
  /* 手裏剣は手に持たない。Ninja.attack() は攻撃開始と【同時に】
     EnemyProjectile を飛ばすので、手に描くと同じ手裏剣が2つ存在して見える。
     投擲は腕の振り(hands)+ 手元の離れの閃光だけで見せる。 */
  frontTop(r, h){
    if (r.motion !== 'attack' || !(h.u > 0.58)) return;
    /* 離れ(u=0.60 で腕が前へ返り始める)。手元が光り、進行方向へ短い線が数本走る。
       手裏剣そのものは EnemyProjectile 側が描くのでここでは足さない。 */
    const rel = cl01((h.u - 0.58) / 0.30);
    const fade = Math.sin(rel * Math.PI);
    if (fade <= 0.02) return;
    const c = r.c;
    /* 手元の閃光 + 進行方向(+x)へ抜ける短い線。手裏剣そのものは飛び道具側が描く */
    drawFlash(c, h.front.x, h.front.y, 11, 0.46 * fade, '196,226,255');
    drawBurstLines(c, h.front.x, h.front.y, 0, 4, 22, 0.40 * fade, '224,242,255', 0.34);
    drawThrustStreak(c, h.front.x + 21, h.front.y, 0, 20, 1.5, 0.34 * fade, '186,220,255');
  }
};

/** 中ボス武将の薙刀。長柄の先に反りのある刃 */
export const mobNaginata = {
  hands(r){
    const { shF, motion, runPh, sway, atk } = r;
    if (motion === 'attack') {
      const p = cl01(atk);
      const up = ezIO(seg(p, 0.04, 0.36)), cut = ezIn(seg(p, 0.40, 0.58)), rc = ezIO(seg(p, 0.72, 1));
      const a = lerp(-0.45, -1.85, up) + cut * 2.30 - rc * 0.95;
      const gx = shF.x + 6 + Math.cos(a) * 12, gy = shF.y + 8 + Math.sin(a) * 12;
      return { front: { x: gx, y: gy },
               back:  { x: gx + Math.cos(a) * 20, y: gy + Math.sin(a) * 20 }, a };
    }
    const s = motion === 'run' ? Math.sin(runPh * TAU) * 2.0 : sway * 0.4;
    const a = -0.34;
    const gx = shF.x + 3, gy = shF.y + 16 + s;
    return { front: { x: gx, y: gy },
             back:  { x: gx + Math.cos(a) * 22, y: gy + Math.sin(a) * 22 }, a };
  },
  front(r, h){
    const c = r.c, f = h.front, b = h.back;
    const ang = Math.atan2(b.y - f.y, b.x - f.x);
    /* 剣筋は柄・刃より【奥】。中ボスなので雑魚より一段だけ太く長く残す */
    {
      const p = cl01(r.atk);
      mobBladeTrail(r, 'naginata',
        f.x + Math.cos(ang) * NAGINATA_TIP, f.y + Math.sin(ang) * NAGINATA_TIP,
        r.motion === 'attack' && p > 0.32 && p < 0.90,
        { headHalf: 5.8, maxAge: 145, headAlpha: 0.29, coreAlpha: 0.52, minDist: 2.4, cap: 30 });
      if (onceThisAttack(r.owner, 'naginataCut', r.motion === 'attack' && p > 0.56) && r.owner) {
        const o = r.owner;
        mobGroundDust(o, o.x + o.width * 0.5 + (o.facingRight ? 14 : -14), o.y + o.height, {
          count: 6, intensity: 0.65, spread: 0.9, speed: 1.15, rise: 0.45, size: 9
        });
      }
    }
    c.save(); c.translate(f.x, f.y); c.rotate(ang);
    // 柄(石突から前へ)
    const sg = c.createLinearGradient(-26, 0, 74, 0);
    sg.addColorStop(0, '#2f170b'); sg.addColorStop(0.45, '#6b4224'); sg.addColorStop(1, '#3a1f0f');
    c.strokeStyle = sg; c.lineWidth = 5.0; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(74, 0); c.stroke();
    c.strokeStyle = 'rgba(242,208,156,0.34)'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(-24, -1.1); c.lineTo(68, -1.0); c.stroke();
    // 石突と鎺
    c.fillStyle = '#8d95a2'; c.fillRect(-27, -2.6, 4, 5.2);
    c.fillStyle = '#c9a545'; c.fillRect(70, -3.0, 6, 6.0);
    // 刃(反りのある薙刀身)
    c.save(); c.translate(76, 0); c.scale(1.12, 1.12);
    drawKatanaShape(c, 0, 0, 0, 1, 62, 0, 'blade');
    c.restore();
    c.restore();
  }
};
/* 薙刀の切先までの距離(局所px)。柄の先 76 + 刃 (62-5)×1.12 */
const NAGINATA_TIP = 76 + (62 - 5) * 1.12;

/* ボスの状態から描画モーションを決める(判定には一切関与しない) */
function resolveMotion(boss){
  if (boss.isAttacking) return 'attack';
  const sp = Math.max(1, boss.speed || 3);
  return Math.abs(boss.vx || 0) > sp * 0.22 ? 'run' : 'idle';
}

/**
 * フロアボス一体を描く。
 * 呼び出しは enemy.render() の renderBody 位置から(2.5D skew 適用済みの world 座標)。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} boss  x/y/width/height/facingRight/motionTime/vx/isAttacking を持つ実体
 * @param {object} design BOSS_DESIGNS のいずれか
 * @param {object} weapon 忍具アダプタ { hands(rig), front(rig,hands), back?, backIsFarHand? }
 * @param {object} [opts] { attackProgress:0..1, castoff:boolean }
 */
export function renderBossActor(ctx, boss, design, weapon, opts){
  if (!ctx || !boss || !design) return;
  const dir = boss.facingRight ? 1 : -1;
  const cx = boss.x + boss.width * 0.5;
  const footY = boss.y + boss.height;
  const t = (boss.motionTime || 0) / 1000;
  ctx.save();
  /* enemy.render の 2.5D 斜行は撤去済み。奥行きはこのリグが自前で作る。
     weaponReplica は world 座標で描くので、局所系へ入る前の変換を控えておく。 */
  const worldTf = (typeof ctx.getTransform === 'function') ? ctx.getTransform() : null;
  /* 雑魚・中ボスは背丈が違うだけで作りは同じ。定数(SC/LIMB_W/ARM_REACH…)を
     背丈ごとに作り直すのではなく、108px のリグをそのまま縮小して描く。
     こうすると比率が必ずボスと一致し、既存5体の描画は 1 倍で完全に不変。 */
  const k = (opts && Number.isFinite(opts.bodyHeight) && opts.bodyHeight > 0)
    ? opts.bodyHeight / BOSS_H : 1;
  ctx.translate(cx, footY);
  if (dir < 0) ctx.scale(-1, 1);      // 左向きは反転して「進行方向=+x」の局所系で描く
  if (k !== 1) ctx.scale(k, k);
  ctx.translate(0, -GROUND_LIFT);     // つま先の下端を箱底に合わせる(プレイヤーと同基準)
  stepMobFx(boss);                    // 剣筋の経年は実体ごとに毎フレーム1回だけ
  renderBossModel(ctx, design, resolveMotion(boss), t, {
    weapon: weapon || EMPTY_WEAPON,
    attackProgress: opts && opts.attackProgress,
    phase: (opts && opts.phase) || null,
    castoff: !!(opts && opts.castoff),
    // 局所系の途中から world 座標へ一時的に戻して描くためのフック
    world(fn){
      if (!worldTf || typeof ctx.setTransform !== 'function') { fn(); return; }
      ctx.save(); ctx.setTransform(worldTf); fn(); ctx.restore();
    },
    /* weaponReplica のアンカー(world 座標)を素体の局所系へ変換する(縮小ぶんも戻す)。
       GROUND_LIFT を足すのは、素体だけ持ち上がっても【得物は world のまま】なので、
       手が得物のアンカーに載り続けるようにするため(足さないと手と柄が離れる)。 */
    toLocal(px, py){ return { x: (px - cx) * dir / k, y: (py - footY) / k + GROUND_LIFT }; },
    // 局所座標 → world(剣筋の履歴を world で貯めるのに使う。toLocal の厳密な逆写像)
    toWorld(lx, ly){ return { x: cx + lx * dir * k, y: footY + (ly - GROUND_LIFT) * k }; },
    owner: boss,
    bodyScale: k,
    dir
  });
  ctx.restore();
}


/* ============================================================
   忍具アダプタ用の公開ヘルパー
   (ボスクラスは「構え」と「携行時の得物」だけをここから使う)
   ============================================================ */

/* ============================================================
   二刀流 — playerRenderer の二刀ポーズをそのまま移植する。
   ボス独自の振り付けは持たない(ユーザー要求「オリジナルモーション不要」)。
   角度は必ず実体 DualBlades.getMainSwingPose() / 合体の位相計算から取り、
   手の位置はプレイヤーと同じ「肩 + (cosθ, sinθ) × リーチ」で作る。
   プレイヤー実数値 → ボスは全て ×SC(=1.8)。
   ============================================================ */
const DUAL = {
  IDLE_BACK_A:  -0.65,   // 奥刀(player left)のアイドル角
  IDLE_FRONT_A: -1.10,   // 手前刀(player right)のアイドル角
  IDLE_BACK:  { x:  15.6, y: 8.3 },   // centerX + / leftShoulderY  +
  IDLE_FRONT: { x:  -8.0, y: 8.5 },   // centerX - / rightShoulderY +
  L_REACH: 19.2, R_REACH: 18.8,       // playerRenderer:3826-3827
  BACK_CAP: 20.8, FRONT_CAP: 20.4     // dualBackReachCap / dualFrontReachCap
};
const ss01 = (t) => { const v = cl01(t); return v * v * (3 - 2 * v); };

/**
 * @param st  null(待機/走り) |
 *            { mode:'main', pose }        pose = DualBlades.getMainSwingPose()
 *            { mode:'combined', progress } progress = getCombinedSwingProgress()
 */
export function dualBladeStance(rig, st){
  const { cx, shF, shB, sway, motion, runPh } = rig;
  const wave = Math.sin(rig.mt * 0.01);
  const idleB = { x: cx + DUAL.IDLE_BACK.x * SC,  y: shB.y + (DUAL.IDLE_BACK.y + wave * 1.7) * SC };
  const idleF = { x: cx + DUAL.IDLE_FRONT.x * SC, y: shF.y + (DUAL.IDLE_FRONT.y + Math.sin(rig.mt * 0.01 + 0.5) * 1.7) * SC };

  /* ---- 飛翔斬撃(X合体技) — playerRenderer:4326-4460 の移植 ---- */
  if (st && st.mode === 'combined') {
    const p = cl01(st.progress);
    const GATHER = 0.15, HOLD = 0.53, REL = Math.max(0.01, 1 - GATHER - HOLD);
    const gather = cl01(p / GATHER);
    const hold   = p <= GATHER ? 0 : cl01((p - GATHER) / HOLD);
    const rel    = p <= GATHER + HOLD ? 0 : cl01((p - GATHER - HOLD) / REL);
    const eG = Math.pow(gather, 0.38);
    const pulse = Math.sin(hold * Math.PI) * 0.15;

    const crossX = cx + 7 * SC;
    const crossY = shB.y - 3 * SC;
    const open = 0.48;
    const fHalf = 22 * SC, bHalf = fHalf * 0.82;
    const xBA = -(Math.PI / 2 + open);
    const xFA = -(Math.PI / 2 - open - 0.14);
    const xBX = crossX - Math.cos(xBA) * bHalf, xBY = crossY - Math.sin(xBA) * bHalf;
    const xFX = crossX - Math.cos(xFA) * fHalf, xFY = crossY - Math.sin(xFA) * fHalf + 2 * SC;
    const sBX = cx + 18 * SC, sBY = shB.y + 14 * SC, sBA = 0.65;
    const sFX = cx - 10 * SC, sFY = shF.y + 15 * SC, sFA = 2.5;

    let bx, by, fx, fy, ba, fa, blend = 0.02;
    if (p < GATHER) {
      bx = lerp(idleB.x, xBX, eG); by = lerp(idleB.y, xBY, eG);
      fx = lerp(idleF.x, xFX, eG); fy = lerp(idleF.y, xFY, eG);
      ba = lerp(DUAL.IDLE_BACK_A,  xBA, eG);
      fa = lerp(DUAL.IDLE_FRONT_A, xFA, eG);
      blend = lerp(0.28, 0.02, eG);
    } else if (p < GATHER + HOLD) {
      bx = xBX + pulse * 0.2 * SC; by = xBY - pulse * 0.1 * SC;
      fx = xFX - pulse * 0.15 * SC; fy = xFY + pulse * 0.08 * SC;
      ba = xBA + pulse * 0.015; fa = xFA - pulse * 0.015;
    } else if (rel < 0.22) {
      const eT = Math.pow(rel / 0.22, 0.4);           // 振り抜き
      bx = lerp(xBX, sBX, eT); by = lerp(xBY, sBY, eT);
      fx = lerp(xFX, sFX, eT); fy = lerp(xFY, sFY, eT);
      ba = lerp(xBA, sBA, eT); fa = lerp(xFA, sFA, eT);
    } else {
      let t = (rel - 0.22) / 0.78; if (t > 0.95) t = 1;
      const eT = ss01(t);                              // 余韻→アイドル復帰
      bx = lerp(sBX, idleB.x, eT); by = lerp(sBY, idleB.y, eT);
      fx = lerp(sFX, idleF.x, eT); fy = lerp(sFY, idleF.y, eT);
      ba = lerp(sBA, DUAL.IDLE_BACK_A,  eT);
      fa = lerp(sFA, DUAL.IDLE_FRONT_A, eT);
      blend = lerp(0.02, 0.28, eT);
    }
    return { front: { x: fx, y: fy }, back: { x: bx, y: by }, a1: fa, a2: ba, blend };
  }

  /* ---- 二刀コンボ(Z連撃) — playerRenderer:3808-4104 の移植 ---- */
  if (st && st.mode === 'main' && st.pose) {
    const pz = st.pose;
    const step = pz.comboIndex || 0;        // 1..4 / 0 = 五段目
    const cp = cl01(pz.progress || 0);
    const bA = pz.leftAngle, fA = pz.rightAngle;

    // 肩の踏み込み(px は素体フレーム。最後に ×SC)
    let bsx = 0.18, bsy = 0.05, fsx = -0.18, fsy = 0.12;
    const bsx0 = bsx, bsy0 = bsy, fsx0 = fsx, fsy0 = fsy;
    let lReach = DUAL.L_REACH, rReach = DUAL.R_REACH;
    let skipReachAdj = false, rise = 0;

    if (step === 1) {
      const sl = ss01(cp / 0.50), se = ss01(cl01((cp - 0.50) / 0.20));
      const rc = Math.pow(Math.max(0, (cp - 0.70) / 0.30), 1.5);
      bsx += (sl * 2.6 - se * 1.2) * (1 - rc);
      bsy += (sl * 1.8 - se * 0.4) * (1 - rc);
      fsx += (-sl * 0.3 + se * 0.2) * (1 - rc);
    } else if (step === 2) {
      const dp = ss01(cp / 0.10), sl = ss01((cp - 0.10) / 0.38), se = ss01(cl01((cp - 0.48) / 0.22));
      const rc = Math.pow(Math.max(0, (cp - 0.70) / 0.30), 1.5);
      fsx += (dp * 0.3 + sl * 2.0 - se * 0.8) * (1 - rc);
      fsy += (dp * 0.6 - sl * 3.4 + se * 1.0) * (1 - rc);
      bsx += (-sl * 0.3 + se * 0.2) * (1 - rc);
    } else if (step === 3) {
      const g = ss01(cp / 0.15), sl = ss01((cp - 0.15) / 0.40), se = ss01(cl01((cp - 0.55) / 0.20));
      const rc = Math.pow(Math.max(0, (cp - 0.75) / 0.25), 1.5);
      bsx += (g * 2.0 - sl * 3.6 + se * 0.8) * (1 - rc);
      bsy += (-g * 0.4 - sl * 1.2 + se * 1.0) * (1 - rc);
      fsx -= (g * 1.6 - sl * 3.8 + se * 1.0) * (1 - rc);
      fsy += (g * 0.2 + sl * 1.4 - se * 1.0) * (1 - rc);
    } else if (step === 4) {
      const ph = ss01(cp);
      const calc = cp < 0.42 ? 0 : ph;
      const endBend = ss01((cp - 0.8) / 0.2);
      const riseE = ss01(Math.min(1, cp / 0.42));
      rise = Math.sin(riseE * Math.PI * 0.5) * 8.9 * 0.78;
      bsx += 0.44 + (calc - 0.48) * 1.18;
      fsx -= 0.04 + calc * 0.42;
      bsy -= 0.3 + calc * 1.62;
      fsy -= 0.28 + calc * 1.52;
      lReach = 20.8 * (1 - 0.18 * endBend);
      rReach = (20.8 - 0.4) * (1 - 0.18 * endBend);
      skipReachAdj = true;
    } else {
      const ph = ss01(cp);                              // 五段目
      const startBend = 1 - ss01(cp / 0.24);
      const rs = 1 - 0.12 * startBend;
      lReach = 20.8 * rs; rReach = (20.8 - 0.4) * rs;
      bsx += 0.28 + ph * 1.18; fsx -= 0.1 + ph * 1.28;
      bsy += 0.15 + ph * 1.55; fsy += 0.2 + ph * 1.7;
      skipReachAdj = true;
    }
    // 肩ドリフトのクランプ(playerRenderer:4002-4009)
    const dMax = (step === 4 || step === 0) ? 3.9 : 2.9;
    const dMaxY = (step === 4 || step === 0) ? 3.9 : 3.1;
    bsx = Math.max(bsx0 - dMax, Math.min(bsx0 + dMax, bsx));
    fsx = Math.max(fsx0 - dMax, Math.min(fsx0 + dMax, fsx));
    bsy = Math.max(bsy0 - dMaxY, Math.min(bsy0 + dMaxY, bsy));
    fsy = Math.max(fsy0 - dMaxY, Math.min(fsy0 + dMaxY, fsy));

    const lockF = step === 1;      // 1段目は手前手アイドル固定
    const lockB = step === 2;      // 2段目は奥手アイドル固定
    const BSX = shB.x + bsx * SC, BSY = shB.y + bsy * SC;
    const FSX = shF.x + fsx * SC, FSY = shF.y + fsy * SC;

    let bx, by, fx, fy;
    if (step === 1) {
      bx = idleB.x + (bsx - bsx0) * SC; by = idleB.y + (bsy - bsy0) * SC;
      fx = idleF.x;                     fy = idleF.y;
    } else if (step === 2) {
      bx = idleB.x; by = idleB.y;
      fx = FSX + Math.cos(fA) * rReach * SC; fy = FSY + Math.sin(fA) * rReach * SC;
    } else {
      bx = BSX + Math.cos(bA) * lReach * SC; by = BSY + Math.sin(bA) * lReach * SC;
      fx = FSX + Math.cos(fA) * rReach * SC; fy = FSY + Math.sin(fA) * rReach * SC;
    }
    if (!skipReachAdj) {
      if (!lockB) { bx += Math.cos(bA) * (lReach - 21.8) * SC; by += Math.sin(bA) * (lReach - 21.8) * SC; }
      if (!lockF) { fx += Math.cos(fA) * (rReach - 21.2) * SC; fy += Math.sin(fA) * (rReach - 21.2) * SC; }
    }
    if (step === 4) {
      by -= rise * SC; fy -= rise * SC;
      fy += 1.82 * SC; by -= 1.24 * SC;
      fx -= 1.22 * SC; bx += 0.46 * SC;
    } else if (step === 0) {
      const spread = ss01((cp - 0.46) / 0.54);
      fy += (1.55 + cp * 0.52) * SC; by -= (0.9 - cl01((cp - 0.46) / 0.54) * 0.2) * SC;
      fx -= (0.95 + spread * 2.35) * SC; bx += (0.42 + spread * 0.95) * SC;
    }
    // リーチ上限(dualBackReachCap / dualFrontReachCap)
    const capB = (step === 0 ? 24.6 : step === 4 ? 23.8 : DUAL.BACK_CAP) * SC;
    const capF = (step === 0 ? 24.2 : step === 4 ? 23.3 : step === 1 ? DUAL.FRONT_CAP + 2.8 : DUAL.FRONT_CAP) * SC;
    const cap = (sx, sy, hx, hy, L) => { const dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 0.001;
      return d <= L ? { x: hx, y: hy } : { x: sx + dx * L / d, y: sy + dy * L / d }; };
    const cB = cap(BSX, BSY, bx, by, capB), cF = cap(FSX, FSY, fx, fy, capF);
    return { front: cF, back: cB, a1: fA, a2: bA, blend: 0.28 };
  }

  /* ---- 待機・走り ---- */
  const s = motion === 'run' ? Math.sin(runPh * TAU) * 2.4 : 0;
  return { front: { x: idleF.x - s, y: idleF.y + s * 0.5 },
           back:  { x: idleB.x + s, y: idleB.y - s * 0.5 },
           a1: DUAL.IDLE_FRONT_A - sway * 0.015,
           a2: DUAL.IDLE_BACK_A  + sway * 0.015, blend: 0.28 };
}

/** 二刀の刀。プレイヤーと【同じ形状関数】を SC 倍で呼ぶ(旧 drawCarriedKatana の独自刀は廃止)。
 *  DualBlades.render は待機中も攻撃中も刀身を描かないので、二刀だけは素体側が常に描く。
 *  @param angRaw uprightBlend 補正【前】の生角度(プレイヤーと同じ座標系) */
export function drawDualKatana(rig, hand, angRaw, mode, blend){
  const c = rig.c;
  c.save(); c.translate(hand.x, hand.y); c.scale(KATANA_SC, KATANA_SC);
  drawKatanaShape(c, 0, 0, (angRaw === undefined ? -1.1 : angRaw), 1,
                  DUAL_BLADE_LEN, Number.isFinite(blend) ? blend : 0.28, mode || 'all');
  c.restore();
}


/* ---- 残り四将の構え(hands)。実体の得物があるものはアンカーに追従する ---- */

/** 火薬玉: 玉は常に手前手。振りかぶり→投げ放ちを手前手で行う(持ち替えない) */
export function bombStance(rig){
  const { atk, motion, runPh, sway, shF } = rig;
  if (motion === 'attack') {
    /* 投擲は playerRenderer の 'throw' をそのまま使う:
         armAngle = -0.8π + pow(progress,0.55) * 0.8π   (上後方 -144° → 前方 0°)
         armLength = 19  → 素体では ×SC
       ボスは1回の攻撃で複数投げるので、これを【1投ぶんの周期 u】の末尾に置き、
       手前に「引き戻して溜める」区間を足して往復させる。u=1 で手を離す。 */
    const u = cl01(atk);
    const LEN = 19 * SC;
    const BACK = -Math.PI * 0.8;
    let ang;
    if (u < 0.20)      ang = 0;                                        // 振り切った余韻(前方水平)
    else if (u < 0.72) ang = lerp(0, BACK, ezIO(seg(u, 0.20, 0.72)));  // 引き戻して溜める
    else {
      const t = seg(u, 0.72, 1.0);                                     // 振り抜き(初速速め)
      ang = BACK + Math.pow(t, 0.55) * Math.PI * 0.8;
    }
    // 奥手は反動を取る(溜めで前・振り抜きで引く)
    const cock = (u < 0.72) ? ezIO(seg(u, 0.20, 0.72)) : 1 - Math.pow(seg(u, 0.72, 1.0), 0.55);
    return {
      front: { x: shF.x - 0.2 + Math.cos(ang) * LEN, y: shF.y - 0.15 + Math.sin(ang) * LEN },
      back:  { x: shF.x + 16 - cock * 6, y: shF.y + 8 + cock * 3 },
      relAng: ang, u, cock
    };
  }
  if (motion === 'run') {
    const s = Math.sin(runPh * TAU);
    return { front: { x: shF.x + 11 + s * 4, y: shF.y + 10 - s * 2 },
             back:  { x: shF.x + 17 - s * 3, y: shF.y + 7 + s * 1.5 } };
  }
  return { front: { x: shF.x + 11, y: shF.y + 11 + sway * 0.6 },
           back:  { x: shF.x + 17, y: shF.y + 7 - sway * 0.4 } };
}

/** 携行中の火薬玉(手前手の少し上に載せる) */
export function drawCarriedBomb(rig, hand, timeMs){
  realBomb(rig.c, hand.x + 2, hand.y - 8, 10.5, timeMs);
}

/** 大槍: 実体の握り(getGripAnchors)に両手を合わせる。奥手は体の前面より後ろへ回さない */
export function spearStance(rig, grips){
  const { shF, motion } = rig;
  if (grips) {
    /* 実体の握り2点は素体60px向けで12pxしか離れておらず、掌半径7.6のボスでは
       2つの丸が重なって「掴んでいない」ように見える。柄の向きを保ったまま
       中点から前後へ開き、巨躯でも両手持ちが読める間隔にする。 */
    const f0 = rig.toLocal(grips.front.x, grips.front.y);
    const b0 = rig.toLocal(grips.rear.x,  grips.rear.y);
    let ux = b0.x - f0.x, uy = b0.y - f0.y;
    const d = Math.hypot(ux, uy);
    if (d < 0.001) { ux = 1; uy = 0; } else { ux /= d; uy /= d; }
    const mx = (f0.x + b0.x) * 0.5, my = (f0.y + b0.y) * 0.5;
    const SP = 13;                                  // 前後±13 = 手の間隔26
    return { front: { x: mx - ux * SP, y: my - uy * SP },
             back:  { x: mx + ux * SP, y: my + uy * SP },
             gripX: mx, gripY: my };
  }
  const fx = shF.x + 15, fy = shF.y + 7;
  return { front: { x: fx, y: fy }, back: { x: fx + 19, y: fy + 2 } };
}

/* 鎖鎌 — playerRenderer:4703-4763 の役割分担をそのまま移植する。
     手前手(front) = 実体アンカーに追従して鎖を回す・投げる・巻き取る
     奥手(back)    = 何もしない。片刀アイドルの手位置で固定
                     (playerRenderer:1675 kusaKeepIdleBackArm と同じ)
   以前はこれが左右逆で、鎖が奥手から生え、手前手は何も握らずに空中で
   円を描いていた(ボス独自モーション)。両方とも撤去。 */
export function kusarigamaStance(rig, anchor){
  const { cx, shF, shB, sway, motion, runPh } = rig;
  const s = motion === 'run' ? Math.sin(runPh * TAU) * 3 : 0;

  let front;
  if (anchor) {
    const a = rig.toLocal(anchor.x, anchor.y);
    let fx = a.x, fy = a.y;
    /* 投げ切り直後の反動(playerRenderer:4708-4712)。
       ここは【SC を掛けない】。掛けると最大14px 手がアンカーから離れ、
       鎖の起点が手から浮いて見える(ユーザー指摘)。素の実数値なら最大 7.8px。 */
    if (anchor.phase === 'orbit' && anchor.phaseT < 0.26) {
      const recoil = 1 - (anchor.phaseT / 0.26);
      fx -= 2.6 + recoil * 5.2;
      fy += recoil * 1.25;
    }
    // 腕リーチ上限もプレイヤーと同じフェーズ別値(20.6 / 21.0 / 21.2)× SC
    const LIM = (anchor.phase === 'windup' ? 20.6 : anchor.phase === 'throw' ? 21.0 : 21.2) * SC;
    const dx = fx - shF.x, dy = fy - shF.y, d = Math.hypot(dx, dy) || 0.001;
    front = d > LIM ? { x: shF.x + dx * LIM / d, y: shF.y + dy * LIM / d } : { x: fx, y: fy };
  } else {
    /* 携行(待機・走り)は【攻撃の振りかぶり開始と同じ手位置】に置く。
       実体 getMotionState の windup 開始は 肩 + (5.8, 1.6)。
       ここを別の場所にすると、攻撃に入った瞬間に得物が別の腕へ飛んだように見える。 */
    front = { x: shF.x + 5.8 - s * 0.6,
              y: shF.y + 1.6 + (motion === 'idle' ? sway * 0.8 : 0) };
  }
  // 奥手 = 片刀アイドル(centerX + dir*15.6, leftShoulderY + 8.3)を ×SC
  const back = { x: cx + 15.6 * SC + s * 0.6,
                 y: shB.y + (8.3 + (motion === 'idle' ? sway * 0.5 : 0)) * SC };
  return { front, back };
}

/* 大太刀 — 待機も攻撃も【実体 Odachi のアンカー】に両手を追従させる。
   以前は待機だけ素体側で独自の立て太刀(ang=-1.12)を組み、刀身も drawCarriedOdachi
   という別描画(刃の半幅 4.4 = 実体 10.5 の 42%)で描いていたため、
   「待機の忍具が関係ないグラフィック」になっていた(ユーザー指摘)。
   実体は forceSubWeaponRender=true なので待機中も 'ready' ポーズで描ける。 */
export function odachiStance(rig, anchor){
  const { shF, sway, motion } = rig;
  if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
    const f = rig.toLocal(anchor.x, anchor.y);
    /* 左向きは局所系が ctx.scale(-1,1) で【x だけ】反転している。
       world の向き (cosθ, sinθ) は局所では (-cosθ, sinθ) = 角度 π-θ になる。
       以前は θ*dir(= -θ)としており、これは【y 反転】なので
       刺さり(θ=+π/2 = 下向き)が上向きに化け、握り直しのスライドが刃側へ動いて
       「柄ではなく刃を掴んでぶら下がれない」絵になっていた(ユーザー指摘)。 */
    const rot = rig.dir < 0 ? Math.PI - (anchor.rotation || 0) : (anchor.rotation || 0);
    /* 腕が届かない位相(急降下・着刀)では、腕をクランプして柄から手を離すのではなく
       【柄の上を後ろへ握り直す】。実体の柄は back=-14 / front=+16、巨躯は ×2 なので
       柄尻方向へ最大 28 までスライドできる。 */
    const sh = rig.shAF || { x: 0, y: -66 };
    let gx = f.x, gy = f.y;
    const over = Math.hypot(gx - sh.x, gy - sh.y) - ARM_REACH;
    if (over > 0) {
      /* スライドの向きは【肩に近づく側】を選ぶ。柄尻方向へ固定していると、
         刺さり(刃が下向き)では柄尻が上=肩から遠ざかる側なので、
         握り直すほど手が柄から離れていた。 */
      const slide = Math.min(over, 28);
      const cx0 = Math.cos(rot) * slide, cy0 = Math.sin(rot) * slide;
      const dBack = Math.hypot(gx - cx0 - sh.x, gy - cy0 - sh.y);
      const dFwd  = Math.hypot(gx + cx0 - sh.x, gy + cy0 - sh.y);
      const s = (dFwd < dBack) ? 1 : -1;
      gx += s * cx0; gy += s * cy0;
    }
    return { front: { x: gx, y: gy },
             back:  { x: gx - Math.cos(rot) * 13, y: gy - Math.sin(rot) * 13 }, ang: rot };
  }
  const bob = motion === 'run' ? Math.sin(rig.runPh * TAU) * 1.6 : sway * 0.5;
  const ang = -0.32;                                 // 実体 ready の baseAngle(-π*0.10)相当
  const f = { x: shF.x + 22, y: shF.y + 4 + bob };
  return { front: f, back: { x: f.x - Math.cos(ang) * 13, y: f.y - Math.sin(ang) * 13 }, ang };
}

/* 携行中の鎌と鎖(実体 Kusarigama は鎖が短い間フェードして描かれないため素体側で持たせる)。
   layer='under' … 鎖 + 柄(掌より【奥】)  /  layer='over' … 刃だけ(掌より【手前】)
   playerRenderer の刀と同じ「柄 → 掌 → 刃」の順で描かないと、
   得物が手の甲に貼り付いたように見えて握って見えない(ユーザー指摘)。 */
export function drawCarriedKusarigama(rig, hands, t, heading, layer){
  const c = rig.c;
  const hx = hands.front.x, hy = hands.front.y;
  const kro = Number.isFinite(heading) ? heading : -0.72;
  /* realSickle の原点は【口金(刃の根元)】。柄は原点から -18 まで後ろへ伸びる。
     ボスの掌は半径 7.6 で柄(18)とほぼ同じ大きさなので、握りが読めるように
     柄尻側を掌の外へ出す: GRIP=6 なら柄尻は手の 12 後ろ = 掌の外、
     柄巻きの一部が拳の後ろから覗き、刃は掌より前に出る。 */
  const GRIP = 6;
  const kx = hx + Math.cos(kro) * GRIP, ky = hy + Math.sin(kro) * GRIP;
  const bx = kx - Math.cos(kro) * 18,  by = ky - Math.sin(kro) * 18;   // 柄尻の鎖環

  if (layer !== 'over') {
    /* 実機の鎖鎌に分銅は無く、鎖は【一端が手・もう一端が鎌】。
       携行中は柄尻の鎖環から垂れ、同じ【手】へ戻る輪になる。
       戻り先を口金(刃の根元)にすると「鎖が刃に繋がっている」おかしな絵になる。 */
    const wag = Math.sin(t * TAU / 2.4) * (rig.motion === 'run' ? 4 : 1.8);
    const lowX = hx - 2 + wag * 0.8, lowY = hy + 27 + wag * 0.5;       // 垂れの底
    realChain(c, bx, by, lowX, lowY, bx - 7, (by + lowY) * 0.5 + 6);   // 柄尻 → 底
    realChain(c, lowX, lowY, hx, hy, lowX + 10, (lowY + hy) * 0.5 + 6); // 底 → 手
    realSickle(c, kx, ky, kro, 'handle');
  }
  if (layer !== 'under') realSickle(c, kx, ky, kro, 'blade');
}

/* 大槍の携行描画/携行構えは廃止。待機中も実体 Spear.render が描くため
   (forceSubWeaponRender=true)、素体側に別グラフィックを持たない。 */

