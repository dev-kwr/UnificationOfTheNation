export function generateStairsCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // パラメータ (stair_preview.html で確定したもの)
    const scalePct = 60;
    const BEAM = 40;
    const STEPS = 20;
    const STEP_RUN = 45;
    const STEP_RISE = 40;
    const TREAD_T = 15;
    const DEPTH = 230;
    const angleDeg = 90;
    
    const TOTAL_L = STEPS * STEP_RUN;
    const TOTAL_H = STEPS * STEP_RISE;

    const D_ANG = angleDeg * Math.PI / 180;
    const D_SCL = scalePct / 100;
    const cosA = Math.cos(D_ANG);
    const sinA = Math.sin(D_ANG);

    // 1:1 スケールのためのバウンディングボックス計算
    const maxX = TOTAL_L + DEPTH * Math.abs(cosA) * D_SCL + BEAM * 2;
    const maxY = TOTAL_H + DEPTH * sinA * D_SCL + BEAM * 2;
    
    const scaleF = 1.0; 
    const OX = 50;
    const OY = Math.ceil(maxY) + 50;
    
    canvas.width = Math.ceil(maxX) + 100;
    canvas.height = OY + 50;
    
    function proj(x, y, z) {
      return [
        OX + (x + z * cosA * D_SCL) * scaleF,
        OY - (y + z * sinA * D_SCL) * scaleF
      ];
    }
    
    // ===== 色（ダークオーク系 - 暗すぎず明るすぎない） =====
    const C = {
      trdF: '#453022',  trdT: '#5e422f',  trdS: '#36251a',
      risF: '#36251a',  risS: '#21160f',
      strF: '#2b1d14',  strT: '#453022',
    };

    // ===== 描画ヘルパー =====
    function face(pts, color, doStroke) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
      if (doStroke !== false) {
        ctx.strokeStyle = 'rgba(5, 2, 0, 0.4)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }

    function drawBox(x, y, z, w, h, d, cf, ct, cs, doGrain = false) {
      const v = [
        proj(x,y,z),     proj(x+w,y,z),     proj(x+w,y+h,z),     proj(x,y+h,z),
        proj(x,y,z+d),   proj(x+w,y,z+d),   proj(x+w,y+h,z+d),   proj(x,y+h,z+d)
      ];

      // --- 上面 (グラデーション: 手前が明るく、奥が暗い) ---
      const gradT = ctx.createLinearGradient(v[3][0], v[3][1], v[7][0], v[7][1]);
      gradT.addColorStop(0, ct); 
      // 奥はベース色より一段暗い茶色に
      gradT.addColorStop(1, '#3a281c');

      ctx.fillStyle = gradT;
      ctx.beginPath();
      ctx.moveTo(v[3][0], v[3][1]);
      ctx.lineTo(v[2][0], v[2][1]);
      ctx.lineTo(v[6][0], v[6][1]);
      ctx.lineTo(v[7][0], v[7][1]);
      ctx.closePath();
      ctx.fill();

      // --- 木目 (Grain) ---
      if (doGrain) {
        ctx.save();
        // はみ出さないように確実にクリップ領域を再定義
        ctx.beginPath();
        ctx.moveTo(v[3][0], v[3][1]);
        ctx.lineTo(v[2][0], v[2][1]);
        ctx.lineTo(v[6][0], v[6][1]);
        ctx.lineTo(v[7][0], v[7][1]);
        ctx.closePath();
        ctx.clip();

        // 非常に薄い黒で、なじむように描画
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        
        const lines = 4;
        for (let i = 1; i <= lines; i++) {
          const f = i / (lines + 1);
          // 始点(Z=0側のXエッジ)
          let sx = v[3][0] + (v[2][0] - v[3][0]) * f;
          let sy = v[3][1] + (v[2][1] - v[3][1]) * f;
          // 終点(Z=奥行き側のXエッジ)
          let ex = v[7][0] + (v[6][0] - v[7][0]) * f;
          let ey = v[7][1] + (v[6][1] - v[7][1]) * f;
          
          ctx.moveTo(sx, sy);
          
          // わずか数ピクセルの穏やかな波
          let wave1X = Math.sin((x + y) * 0.1) * 2.5;
          let wave2X = Math.cos((x + y) * 0.1) * 2.5;
          
          const cx1 = sx + (ex - sx) * 0.33 + wave1X;
          const cy1 = sy + (ey - sy) * 0.33;
          const cx2 = sx + (ex - sx) * 0.67 + wave2X;
          const cy2 = sy + (ey - sy) * 0.67;
          
          ctx.bezierCurveTo(cx1, cy1, cx2, cy2, ex, ey);
        }
        ctx.stroke();
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(5, 2, 0, 0.4)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      // --- 上面の手前エッジにハイライト（面取りと光の反射） ---
      if (doGrain) {
        ctx.beginPath();
        ctx.moveTo(v[3][0], v[3][1]);
        ctx.lineTo(v[2][0], v[2][1]);
        ctx.strokeStyle = 'rgba(255, 180, 120, 0.15)'; // 白っぽい反射光
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      // --- 右側面 ---
      face([v[1],v[5],v[6],v[2]], cs);

      // --- 正面 (踏み板の厚み or 蹴込板) ---
      // 影グラデーション: 上部（踏み板の影になる部分）を暗くする
      const gradF = ctx.createLinearGradient(v[3][0], v[3][1], v[0][0], v[0][1]);
      // もしdoGrain（踏み板）でなければ、落ち影を作る
      if (!doGrain) {
        gradF.addColorStop(0, '#180f08'); // 蹴込板に落ちる濃い影
        gradF.addColorStop(0.3, cf);
        gradF.addColorStop(1, cf);
      } else {
        gradF.addColorStop(0, cf);
        gradF.addColorStop(1, '#2d1f15'); // 踏み板前面の下部
      }
      
      ctx.fillStyle = gradF;
      ctx.beginPath();
      ctx.moveTo(v[0][0], v[0][1]);
      ctx.lineTo(v[1][0], v[1][1]);
      ctx.lineTo(v[2][0], v[2][1]);
      ctx.lineTo(v[3][0], v[3][1]);
      ctx.closePath();
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(5, 2, 0, 0.4)';
      ctx.stroke();
    }

    // ===== 描画開始 =====
    // 透明背景のまま描画する
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const treadZ = 0;
    const treadD = DEPTH;
    const strThick = BEAM * 0.85;
    const strDepth = 5;
    // 下辺がY=0を超えるX位置（最下段は床面で水平）
    const floorX = strThick * TOTAL_L / TOTAL_H;

    // --- 0. 全体の影（床へのドロップシャドウ） ---
    {
      ctx.save();
      ctx.filter = 'blur(10px)'; 
      ctx.fillStyle = 'rgba(10, 5, 0, 0.4)'; 
      
      const sp1 = proj(0, 0, 0);                 
      const sp2 = proj(TOTAL_L, 0, 0);           
      const sp3 = proj(TOTAL_L, 0, treadD);      
      const sp4 = proj(0, 0, treadD);            
      
      ctx.beginPath();
      ctx.moveTo(sp1[0], sp1[1]);
      ctx.lineTo(sp2[0], sp2[1]);
      ctx.lineTo(sp3[0], sp3[1]);
      ctx.lineTo(sp4[0], sp4[1]);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }

    // --- 1. 奥のササラ桁（ジグザグポリゴン、Z=DEPTH-BEAM面） ---
    {
      const zBack = DEPTH - BEAM;
      const pts = [];

      for (let i = 0; i < STEPS; i++) {
        pts.push(proj(i * STEP_RUN, i * STEP_RISE, zBack));
        pts.push(proj(i * STEP_RUN, (i + 1) * STEP_RISE, zBack));
      }
      pts.push(proj(TOTAL_L, TOTAL_H, zBack));

      pts.push(proj(TOTAL_L, TOTAL_H - strThick, zBack));
      pts.push(proj(floorX, 0, zBack));
      pts.push(proj(0, 0, zBack));

      face(pts, C.strF, true);

      face([
        proj(0, 0, zBack),
        proj(floorX, 0, zBack),
        proj(TOTAL_L, TOTAL_H - strThick, zBack),
        proj(TOTAL_L, TOTAL_H - strThick, zBack + BEAM),
        proj(floorX, 0, zBack + BEAM),
        proj(0, 0, zBack + BEAM)
      ], C.strT);
    }

    // --- 2. 手前ササラ桁（ジグザグポリゴン、Z=0面） ---
    {
      const pts = [];

      for (let i = 0; i < STEPS; i++) {
        pts.push(proj(i * STEP_RUN, i * STEP_RISE, 0));
        pts.push(proj(i * STEP_RUN, (i + 1) * STEP_RISE, 0));
      }
      pts.push(proj(TOTAL_L, TOTAL_H, 0));

      pts.push(proj(TOTAL_L, TOTAL_H - strThick, 0));
      pts.push(proj(floorX, 0, 0));
      pts.push(proj(0, 0, 0));

      face(pts, C.strF, true);

      face([
        proj(0, 0, 0),
        proj(floorX, 0, 0),
        proj(TOTAL_L, TOTAL_H - strThick, 0),
        proj(TOTAL_L, TOTAL_H - strThick, strDepth),
        proj(floorX, 0, strDepth),
        proj(0, 0, strDepth)
      ], C.strT);
    }

    // --- 3. ステップ（蹴込板 + 踏板、最前面に配置） ---
    for (let i = 0; i < STEPS; i++) {
      const tx = i * STEP_RUN;
      const ty = i * STEP_RISE;

      // 蹴込板
      drawBox(tx, ty, treadZ, 3, STEP_RISE, treadD, C.risF, C.trdT, C.risS);

      // 踏板 (doGrain=trueで木目を描画)
      drawBox(tx, ty + STEP_RISE - TREAD_T, treadZ, STEP_RUN, TREAD_T, treadD, C.trdF, C.trdT, C.trdS, true);
    }

    return {
        canvas: canvas,
        originX: Math.floor(OX),
        originY: Math.floor(OY),
        totalL: TOTAL_L,
        totalH: TOTAL_H
    };
}
