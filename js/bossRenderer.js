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

const BODY={ core:'#1a1a1a', front:'#1a1a1a', back:'#121212', mitt:'#242424',
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

/* 素体スケール: プレイヤー素体フレーム(60px) → ボス素体(108px) = ×1.8
   以下の数値はすべて playerRenderer の実装値 × SC(目測ではない) */
const SC=108/60;
/* 四肢は【腕も脚も前後も全て同一の太さ】(ユーザー指定)。胴だけ太い。 */
const LIMB_W=0.052*108;               // 5.6 — 全四肢共通
const LIMB_F=LIMB_W, LIMB_B=LIMB_W;
const TORSO_W=0.125*108;              // 13.5
/* 腕(playerRenderer drawArm 実装): 肘=行程54%+最大2.5の微屈曲・
   手首1.35手前で止め・手=半径4.5の円・リーチ上限16.5 —— すべて ×SC */
/* 腕は【上腕・前腕とも長さ固定】の2骨IK。手が近いときは肘が曲がるだけで、
   腕全体が縮まない(中点+オフセット方式だとポーズごとに腕の長さが変わる)。 */
const ARM_L1=8.25*SC, ARM_L2=8.25*SC;   // 合計 = リーチ上限 16.5×SC
function armP(c,sx,sy,hx,hy,front,pass='fill'){
  let dx=hx-sx, dy=hy-sy, d=Math.hypot(dx,dy)||0.001;
  const LIM=(ARM_L1+ARM_L2)*0.995;
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
const palmR=(front)=>(front?0.28:0.25)*(108*0.187);
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
function drawHead(c,B,P,hx,hy,r,t,motion){
  if(B.helm==='hood'){
    /* 覆面の読ませ方: 「目」ではなく【布と顔の境界】で見せる。
       ・頭巾(やや明るい布)が頭の上・後ろ・顎を包む
       ・前面に暗い顔の開口が三日月状に残る → 覆面だと一目で分かる
       ・余った帯は忍者の鉢巻と同じく後ろへ垂らす */
    const wav=Math.sin(t*TAU/1.9)*1.8+(motion==='run'?2.4:0);
    /* 垂れ帯(奥) */
    [[0.86,1.72,0.20],[0.62,1.30,0.15]].forEach(([ox,len,wd],i)=>{
      const rx=hx-r*ox, ry=hy+r*0.10;
      c.fillStyle=i?shade(P.helm,-12):shade(P.helm,0);
      c.beginPath();
      c.moveTo(rx-r*wd, ry);
      c.quadraticCurveTo(rx-r*wd-wav*0.10*(i+1), ry+r*len*0.6, rx-r*(wd*0.6)-wav*0.16*(i+1), ry+r*len);
      c.lineTo(rx+r*(wd*0.7)-wav*0.16*(i+1), ry+r*len*0.97);
      c.quadraticCurveTo(rx+r*wd*0.9, ry+r*len*0.55, rx+r*wd, ry);
      c.closePath(); c.fill();
    });
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
  } else {
    // 素頭(シルエット。輪郭はパス1で描画済み)
    c.fillStyle='#161210'; c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.fill();
    const hs=c.createLinearGradient(hx,hy-r,hx,hy+r);
    hs.addColorStop(0,'rgba(255,255,255,0.07)'); hs.addColorStop(0.55,'rgba(0,0,0,0)'); hs.addColorStop(1,'rgba(0,0,0,0.2)');
    c.fillStyle=hs; c.beginPath(); c.arc(hx,hy+r*0.03,r*0.95,0,TAU); c.fill();
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
    // 鉢の縁金
    c.strokeStyle=hexA(P.edge,0.85); c.lineWidth=1.4;
    c.beginPath(); c.arc(hx,hy-r*0.06,r*1.03,Math.PI*1.03,Math.PI*1.97); c.stroke();
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

    /* 三日月の輪郭(基部=左で厚く、右へ長く反り上がって切先になる) */
    const moon=(o)=>{ c.beginPath();
      c.moveTo(-S2*0.86+o, S2*0.30+o);                                  // 左端(短い方の角)
      c.quadraticCurveTo(-S2*0.62+o,-S2*0.30+o, S2*0.10+o,-S2*0.40+o);  // 外縁(上)
      c.quadraticCurveTo(S2*0.86+o,-S2*0.46+o, S2*1.34+o,-S2*1.02+o);   // 右へ跳ね上がる切先
      c.quadraticCurveTo(S2*0.84+o,-S2*0.22+o, S2*0.06+o,-S2*0.02+o);   // 内縁(下・凹)
      c.quadraticCurveTo(-S2*0.44+o, S2*0.10+o,-S2*0.86+o, S2*0.30+o);
      c.closePath(); };

    // ①影板(奥へずらした暗い層)
    c.fillStyle='#4a3208'; moon(S2*0.055); c.fill();
    // ②金地(基部→切先で明度が上がる)
    const mg=c.createLinearGradient(-S2*0.8,S2*0.3,S2*1.2,-S2*0.9);
    mg.addColorStop(0,'#8a6412'); mg.addColorStop(0.45,P.crest); mg.addColorStop(1,'#fff0b0');
    c.fillStyle=mg; moon(0); c.fill();
    // 輪郭
    c.strokeStyle='#5b3f0a'; c.lineWidth=1.0; c.lineJoin='round'; moon(0); c.stroke();
    // ③内縁の照り(凹側に沿う細い光)
    c.strokeStyle=hexA('#fff6cf',0.62); c.lineWidth=Math.max(0.9,S2*0.045);
    c.beginPath();
    c.moveTo(-S2*0.66, S2*0.16);
    c.quadraticCurveTo(-S2*0.30,-S2*0.02, S2*0.14,-S2*0.10);
    c.quadraticCurveTo(S2*0.80,-S2*0.26, S2*1.18,-S2*0.86);
    c.stroke();
    // 切先の煌めき
    c.fillStyle=hexA('#fffbe6',0.85);
    c.beginPath(); c.arc(S2*1.24,-S2*0.92,S2*0.055,0,TAU); c.fill();

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
  kayaku(p){
    const draw = ezIO(seg(p, 0.15, 0.60));                 // 引き戻し(後ろへ溜める)
    const whip = ezIn(seg(p, 0.86, 1.0));                  // 振り抜き(前へ出る)
    const after = 1 - ezOut(cl01(p / 0.15));               // 投げ切りの余韻
    return {
      lean: -draw * 0.16 + whip * 0.34 + after * 0.10,
      crouch: draw * 5 - whip * 2,
      shift: -draw * 5 + whip * 11 + after * 3,
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
    const A=1.8, LS=1.89;
    const windup=Math.max(0,1-(p/0.34));
    const lunge=Math.sin(cl01((p-0.16)/0.62)*Math.PI*0.5);
    const drive=Math.sin(p*Math.PI);
    const hipUp=-(0.24+lunge*0.48)*LS;
    const HIP=45;                       // 素体の腰高(=脚長)
    return {
      lean:0,
      leanPx:(2.8+lunge*5.6-windup*1.1)*A,
      crouch:-drive*1.7*A+hipUp,
      shift:(0.9+lunge*2.2-windup*0.5)*A,
      headDip:-drive*2.0*A,
      // 後足=斜め後方へ長く蹴る / 前足=畳んで前へ。どちらも地面から浮く
      feet:[[-(14.1+lunge*3.1)*LS, -(HIP-(12.9-lunge*4.6)*LS)],
            [ (0.22+lunge*0.1)*LS, -(HIP-(16.2+lunge*0.3)*LS)]],
      capeBell:0
    };
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
  odachi(p, phase){
    const A=1.8, HIP=45;
    const F=(kneeK, footK, kneeX, footX)=>[footX*A, -(HIP-footK*A)];
    if(phase==='rise'){
      return { lean:-0.10, crouch:-2*A, shift:1.5*A, headDip:-1.5*A,
               feet:[[-4.2*A, -(HIP-11.0*A*0.62)], [ 1.6*A, -(HIP-11.3*A*0.62)]],
               capeBell:0.9 };
    }
    if(phase==='stall'||phase==='flip'){
      // 両脚を胸側へタック
      return { lean:-0.04, crouch:-3*A, shift:0.5*A, headDip:-1.0*A,
               feet:[[ 0.6*A, -(HIP-9.6*A*0.62)], [-0.6*A, -(HIP-10.6*A*0.62)]],
               capeBell:1.0 };
    }
    if(phase==='plunge'){
      // 刀に体重を乗せ、両脚は後方上へ流す
      return { lean:0.16, crouch:1*A, shift:-1.0*A, headDip:1.2*A,
               feet:[[-4.6*A, -(HIP-13.7*A*0.62)], [-6.6*A, -(HIP-15.5*A*0.62)]],
               capeBell:0.4 };
    }
    if(phase==='planted'){
      // 柄にぶら下がり、脚はだらんと垂らす
      return { lean:0.06, crouch:2*A, shift:-0.5*A, headDip:0.6*A,
               feet:[[-1.8*A, -(HIP-15.4*A*0.62)], [-1.5*A, -(HIP-14.2*A*0.62)]],
               capeBell:0.15 };
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
  if(inAtk){ pose=(CHOREO[B.id]||CHOREO.busho)(atk, (st&&st.phase)||null); }

  const bobRun=motion==='run'?-Math.abs(Math.sin(runPh*TAU))*3.0+1.4:0;
  const bobIdle=motion==='idle'?breath*1.0:0;
  const crouch=(pose?pose.crouch:0)+(motion==='run'?1.6:0)+(motion==='idle'?(B.idleCrouch||1.5):0);

  /* ---- 骨格: プレイヤー素体の写像 ----
     headRadius = H×(28/60)/2×headScale(0.80) ≒ 20.2 (将軍と同じ小頭身補正)
     hip = -(headR×1.43 + hipLift) : hipLift は将軍の 8px(素体60frame) を 108frame へ換算 */
  /* 実機(character_preview・防具非表示)の行プロファイル実測(全高比):
     頭直径0.362(半径0.181・頭頂=全高の頂点) / 肩幅0.133 / 胴0.126 /
     脚の分岐0.672 / 足の左右幅0.089 / 脚幅 前0.065・奥0.038 */
  const headR=H*0.187;                  // 描画高(≒H×1.035)で頭直径0.362になる値
  const cx=(pose?pose.shift:0);
  const hipY=-H*0.417+crouch+bobRun+bobIdle*0.35;
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
    feet=pose.feet.map((f,i)=>({x:cx+f[0]-(pose?pose.shift:0),y:f[1],front:i===1,sw:false,u:0}));
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
  const rig={c,B,P,cx,hipX,hipY,chestX,chestY,shF,shB,headX,headY,t,mt,motion,runPh,atk,pose,breath,sway,feet,
             world:(st&&st.world)||((fn)=>fn()),
             toLocal:(st&&st.toLocal)||((x,y)=>({x,y})), dir:(st&&st.dir)||1};
  const hands=wf.hands(rig);
  /* 腕のリーチ上限で手位置を先にクランプし、腕と得物を同一点に揃える
     (クランプ前の座標で武器を描くと手と柄が離れる) */
  const reachClamp=(sh,h)=>{ const dx=h.x-sh.x, dy=h.y-sh.y, d=Math.hypot(dx,dy)||0.001;
    const L=(ARM_L1+ARM_L2)*0.995; if(d<=L) return h;
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
    const fr=f.front?2.2:2.0;          // 実測: 足の半幅0.0105(≒1.2px)+輪郭ぶん
    /* 膝の位置は playerRenderer の待機脚の実数値に一致させる:
       前脚 knee=(hipX+0.8, hipY+10.1) / 奥脚 (hipX+0.9, hipY+9.5)、脚長 23.8。
       → 腰から 42%(前)/40%(奥)下、前方オフセットは 0.8〜0.9 だけ。
       以前は最小曲げ量(minBend 2.35/2.05)を実際の曲げとして使っており、
       膝が前へ 4px も張り出して立ち姿のバランスが崩れていた。 */
    const kneeFrac=f.front?0.424:0.399;
    const kneeBend=(f.front?0.85:0.95)*SC+(f.sw?Math.sin(f.u*Math.PI)*2.0*SC:0)+crouch*0.10;
    const kj=limbN(c,hipX+(f.front?1.05:-1.05)*SC,hipY,f.x,f.y,kneeFrac,kneeBend,'fwd',w,w,BODY.core,null,pass);
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
    // 奥手が握る得物(二刀の奥刀など)は奥腕と同じ最背面レイヤーに置く
    if(wf.backIsFarHand && wf.back) wf.back(rig,hands);
  }
  drawPalm(c,hB.x,hB.y,false,abk.wx,abk.wy);

  /* --- パス1: 輪郭(胴・脚のシルエット外周のみ。手前腕は最前面で描く) --- */
  drawLegs('ol'); drawTorso('ol');
  /* 頭の輪郭も四肢と同じ 0.6px だけ外に出す(中心線ストロークだと 1.2px 出て太く見える) */
  c.strokeStyle=BODY.OUT; c.lineWidth=BODY.OUTW*0.5;
  c.beginPath(); c.arc(headX,headY+(B.helm==='hood'?0:headR*0.03),
                       (B.helm==='hood'?headR:headR*0.95)+BODY.OUTW*0.25,0,TAU); c.stroke();

  /* --- パス2: 塗り(z順に重ねる。胴が奥腕の付け根を覆う) --- */
  drawLegs('fill');
  if(!CAST) legJoints.forEach(j=>drawSuneate(c,P,j.kx,j.ky,j.fx,j.fy));   // 脛当
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
    const plateN=build==='ashigaru'?3:(build==='kengo'?2:4);
    const plateLen=build==='ashigaru'?10:13;
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
      c.strokeStyle=hexA(P.edge,0.5); c.lineWidth=1;
      c.beginPath(); c.moveTo(px-2.7+sk*0.4,skirtTop+plateLen-2); c.lineTo(px+2.7+sk*0.4,skirtTop+plateLen-2); c.stroke();
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
    if(build==='ashigaru'){
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
    // 前縁のリムライト+縁金
    c.strokeStyle=hexA(P.edge,0.9); c.lineWidth=1.4;
    c.beginPath(); c.moveTo(chestX+dW,dTop+1.2); c.lineTo(hipX+dW-3,dBot); c.stroke();
    c.strokeStyle='rgba(233,223,198,0.15)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(chestX+dW-2.2,dTop+2.6); c.lineTo(hipX+dW-5.2,dBot-1.8); c.stroke();
  }
  // 帯(暗殺者の差し色は暗く沈める)
  c.fillStyle=P.robeS; c.fillRect(hipX-dW+2,dBot-3.2,dW*2-4.2,4.0);
  c.fillStyle=build==='shinobi'?hexA('#8a2a2a',0.35):hexA(P.acc,0.55);
  c.fillRect(hipX-1.2,dBot-3.2,3.2,3.8);

  /* ---- 奥袖 ---- */
  if(SODE_S[build]>0) drawSode(c,P,shAB.x-1,shAB.y-2.5,-0.28,1.0*SODE_S[build]);
  } // !CAST(装具ここまで)

  /* ---- 頭部(素体確認時は兜・頭巾も外して素の頭。輪郭はパス1で済み) ---- */
  if(CAST){
    c.fillStyle=BODY.core;
    c.beginPath(); c.arc(headX,headY+headR*0.03,headR*0.95,0,TAU); c.fill();
  } else {
    drawHead(c,B,P,headX,headY,headR,t,motion);
  }

  /* ---- レイヤー順(物理的な前後):
         奥腕 → 胴・装具 → 頭 → 【忍具】 → 手前腕 → 手前袖 → 手前の掌
         忍具は「奥腕より手前・手前腕より奥」。握る手と腕が最前面に来る。 ---- */
  if(!CAST){ if(!wf.backIsFarHand && wf.back) wf.back(rig,hands); wf.front(rig,hands); }
  const afr=drawFrontArm('top');   // 輪郭+塗りを最前面で(輪郭が他部品に覆われないように)
  if(!CAST) drawKote(c,P,afr.ex,afr.ey,afr.wx,afr.wy);                    // 籠手(手前腕)
  if(!CAST && SODE_S[build]>0)
    drawSode(c,P,shAF.x+0.5,shAF.y-2,0.18+(hands.front.y<chestY-10?-0.4:0),1.06*SODE_S[build]);
  /* 掌の丸は腕の先端に重ねて最前面(柄を握って見える) */
  drawPalm(c,hF.x,hF.y,true,afr.wx,afr.wy);
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
function realSickle(c,x,y,ang){
  c.save(); c.translate(x,y); c.rotate(ang);
  const HL=18;
  const bladeOutline=()=>{ c.beginPath();
    c.moveTo(2.6,0.4);
    c.quadraticCurveTo(3.4,-10.5,-1.8,-18.6);
    c.quadraticCurveTo(-4.6,-20.8,-5.8,-18.0);
    c.quadraticCurveTo(-3.8,-9.0,-1.3,-0.9);
    c.quadraticCurveTo(0.4,0.0,2.6,0.4);
    c.closePath(); };
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
  kayaku: { id:'kayaku', build:'ashigaru', helm:'kabuto', crest:'disc',
    pal:{ aA:'#8a5326', aB:'#4d2c12', edge:'#e6b578', sh:'#9c6231',
          robe:'#5a3a1e', robeS:'#33200e', helm:'#6b3f1c', helmD:'#2c1a0b',
          crest:'#ff9a3c', acc:'#e2622a', legF:'#1a1a1a', legB:'#121212', core:'#1a1a1a' } },
  // 弐之陣 大槍の武者 — 藍鉄 / 大袖+胸紐 / 鍬形剣立
  yari: { id:'yari', build:'taisho', helm:'kabuto', crest:'kuwagata',
    pal:{ aA:'#2f4a7a', aB:'#1a2b48', edge:'#d3dcec', sh:'#3d5d92',
          robe:'#22334f', robeS:'#141d2e', helm:'#243a5e', helmD:'#101827',
          crest:'#eaf0fa', acc:'#5b86c9', legF:'#1a1a1a', legB:'#121212', core:'#1a1a1a' } },
  // 参之陣 二刀流の剣豪 — 白銀鼠 / 軽装 / 半月剣・開き構え
  nito: { id:'nito', build:'kengo', helm:'kabuto', crest:'gessou', openStance:true,
    pal:{ aA:'#8e93a3', aB:'#5a5f6d', edge:'#eceef6', sh:'#a3a8b8',
          robe:'#484b57', robeS:'#2b2e36', helm:'#787d8c', helmD:'#3a3d46',
          crest:'#f2f4fc', acc:'#9a7fd0', legF:'#1a1a1a', legB:'#121212', core:'#1a1a1a' } },
  // 肆之陣 鎖鎌の暗殺者 — 濡羽 / 鎧なし / 覆面
  kusa: { id:'kusa', build:'shinobi', helm:'hood', crest:null,
    idleSpread:0.9, idleCrouch:5,
    pal:{ aA:'#2a2f38', aB:'#171b22', edge:'#68758c', sh:'#333a46',
          robe:'#20242c', robeS:'#111419', helm:'#2b3140', helmD:'#0c0f14',
          crest:'#4d5666', acc:'#8a2a2a', legF:'#1a1a1a', legB:'#121212', core:'#1a1a1a' } },
  // 伍之陣 大太刀の武将 — 漆黒+黄金 / 陣羽織 / 大三日月
  odachi: { id:'odachi', build:'busho', helm:'kabuto', crest:'mikazuki', cape:true,
    pal:{ aA:'#2c2c2c', aB:'#141414', edge:'#e2bd4a', sh:'#3c3c3c',
          robe:'#2b1f1f', robeS:'#1a1212', helm:'#1c1c1c', helmD:'#080808',
          crest:'#ffcf3a', acc:'#c8452c', legF:'#1a1a1a', legB:'#121212', core:'#1a1a1a',
          capeA:'#5c0f14', capeB:'#1c0406' } }
};

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
  ctx.translate(cx, footY);
  if (dir < 0) ctx.scale(-1, 1);      // 左向きは反転して「進行方向=+x」の局所系で描く
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
    // weaponReplica のアンカー(world 座標)を素体の局所系へ変換する
    toLocal(px, py){ return { x: (px - cx) * dir, y: py - footY }; },
    dir
  });
  ctx.restore();
}


/* ============================================================
   忍具アダプタ用の公開ヘルパー
   (ボスクラスは「構え」と「携行時の得物」だけをここから使う)
   ============================================================ */

/** 二刀の構え。参照キャプチャ実測: 手前刀=ほぼ垂直80° / 奥刀=61°、手は左右に開く */
export function dualBladeStance(rig){
  const { atk, motion, runPh, sway, shF } = rig;
  if (motion === 'attack') {
    const w = seg(atk, 0.04, 0.24), s1 = seg(atk, 0.26, 0.44),
          s2 = seg(atk, 0.52, 0.70), rc = seg(atk, 0.78, 1);
    const a1 = atk < 0.24 ? lerp(-1.42, -2.05, ezIO(w))
             : s1 > 0     ? lerp(-2.05, -0.10, ezOut(s1)) - rc * 1.32
             :              -1.42;
    const a2 = atk < 0.42 ? lerp(-1.05, 0.18, ezIO(seg(atk, 0.24, 0.42)))
             : s2 > 0     ? lerp(0.18, -1.62, ezOut(s2)) + rc * 0.57
             :              0.18;
    return {
      front: { x: shF.x - 6 + Math.cos(a1) * 17, y: shF.y + 5 + Math.sin(a1) * 15 },
      back:  { x: shF.x + 8 + Math.cos(a2) * 16, y: shF.y + 3 + Math.sin(a2) * 13 },
      a1, a2, s1, s2, w, rc
    };
  }
  if (motion === 'run') {
    const s = Math.sin(runPh * TAU);
    return { front: { x: shF.x - 21 + s * 4, y: shF.y + 11 - s * 2 },
             back:  { x: shF.x + 12 - s * 3, y: shF.y + 11 + s * 1.5 },
             a1: -1.46 + s * 0.05, a2: -1.02 };
  }
  return { front: { x: shF.x - 23, y: shF.y + 11 + sway * 0.5 },
           back:  { x: shF.x + 12, y: shF.y + 11 - sway * 0.5 },
           a1: -1.42 + sway * 0.02, a2: -1.05 + sway * 0.02 };
}

/** 携行中(待機・走り)の刀。攻撃中は weaponReplica が描くのでこれは呼ばない */
export function drawCarriedKatana(rig, hand, ang, len){
  katana(rig.c, hand.x, hand.y, (ang === undefined ? -1.2 : ang), len || 40, 2.8, null);
}


/* ---- 残り四将の構え(hands)。実体の得物があるものはアンカーに追従する ---- */

/** 火薬玉: 玉は常に手前手。振りかぶり→投げ放ちを手前手で行う(持ち替えない) */
export function bombStance(rig){
  const { atk, motion, runPh, sway, shF } = rig;
  if (motion === 'attack') {
    /* atk は【1投ぶんの進行度 u】(0=投げ直後 → 1=次の投げ)。
       0.00-0.15 投げ切りの余韻 / 0.15-0.55 引き戻し / 0.55-0.86 頭上で構え /
       0.86-1.00 振り抜き(1.0 で離す)。投げるたびに腕が一往復する。 */
    const u = cl01(atk);
    const REL = 1.05, COCK = -1.98;      // 溜めは頭に被らない高さへ
    let ang;
    if (u < 0.15)      ang = lerp(REL, 0.75, ezOut(u / 0.15));                 // 余韻
    else if (u < 0.55) ang = lerp(0.75, COCK, ezIO(seg(u, 0.15, 0.55)));       // 引き戻し
    else if (u < 0.86) ang = COCK - Math.sin(seg(u, 0.55, 0.86) * Math.PI) * 0.16; // 構え(溜め)
    else               ang = lerp(COCK, REL, ezIn(seg(u, 0.86, 1.0)));          // 振り抜き
    const rad = 19 + (u < 0.55 ? 3 : 11) - (u > 0.86 ? 6 : 0);   // 溜めで腕を伸ばして頭上へ
    // 奥手は反動を取る(振りかぶりで前、振り抜きで引く)
    const cock = (u >= 0.15 && u < 0.86) ? ezIO(seg(u, 0.15, 0.7)) : (u >= 0.86 ? 1 - ezIn(seg(u, 0.86, 1)) : 0);
    return {
      front: { x: shF.x + 4 + Math.cos(ang) * rad, y: shF.y + 4 + Math.sin(ang) * rad },
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
  const { shF, chestX, motion } = rig;
  if (grips) {
    const f = rig.toLocal(grips.front.x, grips.front.y);
    const b = rig.toLocal(grips.rear.x, grips.rear.y);
    return { front: f, back: { x: Math.max(chestX + 4, b.x), y: b.y },
             gripY: f.y, gripX: f.x };
  }
  const fx = shF.x + 15, fy = shF.y + 7;
  return { front: { x: fx, y: fy }, back: { x: Math.max(chestX + 4, fx - 19), y: fy + 2 } };
}

/** 鎖鎌: 鎌は奥手(実体アンカー)、鎖は手前手。両手持ちにしない */
export function kusarigamaStance(rig, anchor){
  const { shF, sway, motion, runPh, atk } = rig;
  const s = motion === 'run' ? Math.sin(runPh * TAU) * 3 : 0;
  /* 役割を固定して読ませる:
       手前手 = 鎖を握って【回す】手。旋回中は肩の前で小さく円を描く。
       奥手   = 鎌を持つ手(実体アンカーがあればそれに追従)。
     どちらが回しているか分からない、という指摘への対応。 */
  let front;
  if (motion === 'attack' && Number.isFinite(atk) && atk < 0.42) {
    const spin = cl01(atk / 0.42);
    const a = -1.1 + spin * spin * 16;              // 加速しながら回す
    front = { x: shF.x + 6 + Math.cos(a) * 7, y: shF.y + 8 + Math.sin(a) * 5 };
  } else {
    front = { x: shF.x + 2 + s, y: shF.y + (motion === 'idle' ? 15 + sway * 0.5 : 14) };
  }
  const back = anchor ? rig.toLocal(anchor.x, anchor.y)
                      : { x: shF.x + 15 - s * 2, y: shF.y + 10 };
  return { front, back };
}

/** 大太刀: 主手は実体アンカー、副手は柄尻側へ寄せて両手持ちにする */
export function odachiStance(rig, anchor){
  const { shF, sway, motion } = rig;
  /* 待機・走りは実体のアイドルアンカー(柄が寝て低く出る)に合わせず、
     提案書の立て太刀(切先を前上へ・両手持ち)を使う。攻撃中だけ実体に追従。 */
  if (motion !== 'attack') {
    const bob = motion === 'run' ? Math.sin(rig.runPh * TAU) * 1.6 : sway * 0.5;
    const ang = -1.12 + sway * 0.015;
    const f = { x: shF.x + 17, y: shF.y + 6 + bob };
    return { front: f, back: { x: f.x - Math.cos(ang) * 13, y: f.y - Math.sin(ang) * 13 }, ang };
  }
  if (anchor) {
    const f = rig.toLocal(anchor.x, anchor.y);
    const rot = (anchor.rotation || 0) * rig.dir;   // 反転時は回転も鏡像
    const back = { x: f.x - Math.cos(rot) * 13, y: f.y - Math.sin(rot) * 13 };
    return { front: f, back, ang: rot };
  }
  return { front: { x: shF.x + 17, y: shF.y + 6 + sway * 0.5 },
           back:  { x: shF.x + 9,  y: shF.y + 11 + sway * 0.5 }, ang: -1.05 };
}

/** 携行中の鎌と鎖(実体 Kusarigama は待機中フェードして描かれないため素体側で持たせる) */
export function drawCarriedKusarigama(rig, hands, t){
  const c = rig.c;
  const kro = 0.28;
  const kx = hands.back.x, ky = hands.back.y;
  // 鎖: 鎌の柄尻(ローカル-18)から手前手へたるませる
  const bx = kx - Math.cos(kro) * 18, by = ky - Math.sin(kro) * 18;
  const wag = Math.sin(t * TAU / 2.4) * (rig.motion === 'run' ? 6 : 3);
  realChain(c, bx, by, hands.front.x, hands.front.y + wag * 0.2,
            (bx + hands.front.x) / 2, Math.max(by, hands.front.y) + 9 + wag * 0.3);
  realSickle(c, kx, ky, kro);
}

/** 携行中の大槍(待機・走り)。実体の待機グリップは膝の高さで持てて見えないため素体側で構える */
export function drawCarriedSpear(rig, hands){
  const c = rig.c;
  const f = hands.front, b = hands.back;
  const ang = Math.atan2(f.y - b.y, f.x - b.x);
  c.save(); c.translate(b.x, b.y); c.rotate(ang);
  realSpear(c, 84, 24);          // 石突24 / 穂先まで84(実寸の全長≈195相当)
  c.restore();
}
/** 携行中の大太刀(立て太刀)。攻撃中は weaponReplica が描く */
export function drawCarriedOdachi(rig, hand, ang){
  const c = rig.c;
  c.save(); c.translate(hand.x, hand.y); c.rotate(ang === undefined ? -1.12 : ang);
  realTsukaTsuba(c, 15, 8, 4.4);
  realBladeBody(c, 8, 100, 4.4);
  c.restore();
}
/** 大槍の携行構え(腰の高さで両手に持たせる) */
export function spearCarryStance(rig){
  const { shF, motion, runPh, sway } = rig;
  const s = motion === 'run' ? Math.sin(runPh * TAU) * 2.2 : sway * 0.4;
  const fy = shF.y + 13 + s;
  return { front: { x: shF.x + 14, y: fy }, back: { x: shF.x - 6, y: fy + 3 } };
}
