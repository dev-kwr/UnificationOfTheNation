// ============================================
// Unification of the Nation - 色調フィルタ済み画像のキャッシュ
// ============================================
// 背景の大判画像は `ctx.filter = 'brightness(...) saturate(...)'` を掛けたまま
// drawImage していた。ctx.filter 付きの drawImage は毎フレーム全画素を通す遅い経路で、
// 実測(2026-08-11・第4階層)で【1フレーム 17〜18ms のうち約13ms】を占めていた
// (filter を無効化すると 4.6ms)。毎フレーム12回・約277万画素に掛かっていた。
//
// フィルタ文字列はほぼ固定値なので、初回だけ別キャンバスへ焼いて以後は素の
// drawImage で貼る。見た目は変えない。
//
// 【焼くのは"描画される寸法"で】。元寸で焼いて縮小して貼ると、縮小の再標本化が
// 画像ソースからキャンバスソースへ変わり、Chrome では画質が落ちる。
// 実測: 倍率0.114の層で平均差10.9・画素の48%が差8超(元寸で焼いた場合)。
// 焼く時点で目標寸法まで落としておき、貼るときは等倍にすれば再標本化は1回だけで、
// しかも従来と同じ「画像ソースからの縮小」になる。
//
// 使い方: 呼び出し側は ctx.filter の代入をそのまま残し、drawImage だけ
//   ctx.drawImage(img, ...)  →  drawImageGraded(ctx, img, ...)
// に替える。ctx.filter が none のときは素通しなので、フィルタを使わない
// 描画にも無条件で使える(掛け忘れ・外し忘れの事故が起きない)。

// 焼いたキャンバスの合計上限(バイト)。超えたら古いものから捨てる。
// 低スペック端末を助けるための最適化でメモリを食い潰しては本末転倒。
const BUDGET_BYTES = 64 * 1024 * 1024;

// これを含むフィルタは焼かない。blur/drop-shadow は掛ける寸法でボケ幅が変わるため、
// 「焼いた寸法 ≠ 貼る寸法」になった瞬間に見た目が変わる。
const UNBAKEABLE = /blur|drop-shadow/i;

// 同じ(画像×フィルタ)で倍率がこれ以上増えたら、拡縮が動いている層とみなして
// 焼くのをやめる(毎フレーム焼き直すと従来より遅くなる)。
const MAX_SCALES_PER_IMAGE = 6;

const cache = new Map();      // key -> { canvas, bytes, used, scaleX, scaleY }
const scaleCount = new Map(); // 画像×フィルタ -> 見た倍率の数
let totalBytes = 0;
let tick = 0;

// 【キャッシュしてよいのは src を持つ画像だけ】。
// 生成したキャンバス(stage5の階段など)は src を持たず、中身も後から描き替わりうる。
// 鍵を作れない＝取り違える／古い絵を貼り続ける事故になるので、素通しにする。
// 焼く価値があるのは毎フレーム貼り直す大判の背景画像で、それらは全て src を持つ。
function isBakeableSource(img) {
    return typeof img.src === 'string' && img.src.length > 0;
}

function baseKeyOf(img, filter) {
    return `${img.src}|${img.naturalWidth || img.width}x${img.naturalHeight || img.height}|${filter}`;
}

function makeCanvas(w, h) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

function evictUntilFits(bytes) {
    if (bytes > BUDGET_BYTES) return false;
    while (totalBytes + bytes > BUDGET_BYTES && cache.size > 0) {
        let oldestKey = null;
        let oldestUsed = Infinity;
        for (const [k, v] of cache) {
            if (v.used < oldestUsed) { oldestUsed = v.used; oldestKey = k; }
        }
        if (oldestKey === null) break;
        totalBytes -= cache.get(oldestKey).bytes;
        cache.delete(oldestKey);
    }
    return totalBytes + bytes <= BUDGET_BYTES;
}

// 指定の倍率で焼いたキャンバスを返す。焼けない/焼かない場合は null。
function getGraded(img, filter, scaleX, scaleY) {
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return null;

    const base = baseKeyOf(img, filter);
    const key = `${base}@${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`;
    const hit = cache.get(key);
    if (hit) { hit.used = ++tick; return hit; }

    // 拡縮が動いている層は焼かない
    const seen = scaleCount.get(base) || 0;
    if (seen >= MAX_SCALES_PER_IMAGE) return null;

    const cw = Math.max(1, Math.round(natW * scaleX));
    const ch = Math.max(1, Math.round(natH * scaleY));
    const bytes = cw * ch * 4;
    if (!evictUntilFits(bytes)) return null;

    const canvas = makeCanvas(cw, ch);
    const cctx = canvas.getContext('2d');
    if (!cctx) return null;
    cctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in cctx) cctx.imageSmoothingQuality = 'high';
    cctx.filter = filter;
    cctx.drawImage(img, 0, 0, natW, natH, 0, 0, cw, ch);
    cctx.filter = 'none';

    const entry = { canvas, bytes, used: ++tick, scaleX: cw / natW, scaleY: ch / natH };
    cache.set(key, entry);
    scaleCount.set(base, seen + 1);
    totalBytes += bytes;
    return entry;
}

/**
 * ctx.filter を見て、フィルタ済みキャッシュがあればそれを等倍で貼る。
 * 引数は ctx.drawImage と同じ(3/5/9引数)。
 */
export function drawImageGraded(ctx, img, ...args) {
    const filter = ctx.filter;
    if (!img) return;
    if (!filter || filter === 'none' || UNBAKEABLE.test(filter)) {
        ctx.drawImage(img, ...args);
        return;
    }

    // 生成キャンバスは焼かない(鍵が作れず取り違える)
    if (!isBakeableSource(img)) { ctx.drawImage(img, ...args); return; }

    // 【読み込みが終わるまで焼かない】。naturalWidth はヘッダを読んだ時点で立つので、
    // まだデコードが済んでいない画像を焼くと真っ白なキャンバスが【永久に】残る。
    // 焼く前は一瞬の抜けで済んでいたものが、キャッシュのせいで直らなくなる。
    // (低スペック端末ほどデコードが長く、抜けている時間も長い)
    if (img.complete === false) { ctx.drawImage(img, ...args); return; }

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) { ctx.drawImage(img, ...args); return; }

    // 引数の並びから「元の切り出し」と「貼る寸法」を取り出す
    let sx = 0, sy = 0, sw = natW, sh = natH, dx, dy, dw, dh;
    if (args.length === 8) {
        [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    } else if (args.length === 4) {
        [dx, dy, dw, dh] = args;
    } else if (args.length === 2) {
        [dx, dy] = args; dw = natW; dh = natH;
    } else {
        ctx.drawImage(img, ...args);
        return;
    }
    if (!sw || !sh) { ctx.drawImage(img, ...args); return; }

    /* 【キャンバスの拡大率まで含めて焼く】。dw/sw は"論理px"での倍率で、
       実際の画素数は ctx の変換(devicePixelRatio ぶんの拡大)を通したあとの値になる。
       論理pxだけで焼くと、2倍の画面では常に半分の解像度で焼いたものを
       2倍に引き伸ばして貼ることになり、生成画像の細部が眠くなる。
       元画像より細かくは焼けないので natW/sw で頭打ちにする。 */
    const tf = ctx.getTransform ? ctx.getTransform() : null;
    const tsx = tf && Math.abs(tf.a) > 1e-6 ? Math.abs(tf.a) : 1;
    const tsy = tf && Math.abs(tf.d) > 1e-6 ? Math.abs(tf.d) : 1;
    const bakeSX = Math.min(Math.abs(dw / sw) * tsx, natW / sw);
    const bakeSY = Math.min(Math.abs(dh / sh) * tsy, natH / sh);
    const entry = getGraded(img, filter, bakeSX, bakeSY);
    if (!entry) {
        ctx.drawImage(img, ...args);   // 焼かなかったときは従来どおり(遅いが正しい)
        return;
    }

    // 焼いた絵にはフィルタが乗っているので、ここでは外して等倍で貼る
    ctx.filter = 'none';
    ctx.drawImage(
        entry.canvas,
        sx * entry.scaleX, sy * entry.scaleY, sw * entry.scaleX, sh * entry.scaleY,
        dx, dy, dw, dh
    );
    ctx.filter = filter;
}

// ステージが変わったら捨てる。前のステージの焼き上がりを抱えたままだと、
// 1ステージ先までしか先読みしない設計(imageCache)の意図に反してメモリが積む。
export function clearFilteredImageCache() {
    cache.clear();
    scaleCount.clear();
    totalBytes = 0;
}

// 計測・デバッグ用
export function getFilteredImageCacheStats() {
    return { entries: cache.size, megabytes: +(totalBytes / 1024 / 1024).toFixed(1) };
}
