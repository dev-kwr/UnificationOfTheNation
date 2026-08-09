// ============================================
// Unification of the Nation - 画像アセットのセッションキャッシュ／先読み
// ============================================
// Stage は生成のたびに new Image() を作り直していたため、ステージ開始直後の
// 数フレームは naturalWidth=0（描画がスキップされる）状態で背景が抜け、
// 読み込み完了と同時に絵が差し替わってフラッシングして見えた。
//
// src をキーにセッション内で Image を1つだけ共有する。2周目以降のステージ生成は
// ロード済みの同じ Image を受け取るので、待ち時間もフラッシングも発生しない。
//
// 取得経路は2つある。用途で使い分けること。
//   - preload: 「もう要る」。即時・並列・デコードまで済ませる。
//   - prefetch: 「そのうち要る」。逐次1枚ずつ・低優先・デコードは描画時任せ。
//     全ステージ背景は合計77MB(デコード後248MB)あり、まとめて読むと携帯回線を
//     食い潰しモバイルのタブ用メモリ上限にも触れる。先読みは常に1ステージ先まで。

const _cache = new Map();

// 低優先の逐次ダウンロード待ち行列。プレイ中の帯域を奪わないよう1枚ずつ流す。
const _prefetchQueue = [];
let _prefetchBusy = false;

// 画像が実際に描画可能か。complete だけだとロード失敗(404)も true になるため
// naturalWidth も見る。
export function isImageReady(image) {
    return !!(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

// ロードが決着したか（成功・失敗を問わない）。待ちループの終了条件はこちら。
function isImageSettled(image) {
    return !!(image && (image.complete || image.__uonFailed));
}

// 先にデコードまで済ませると初回描画のデコード待ちで1フレーム落ちない。
// 逆に「そのうち要る」ぶんまで decode すると使いもしない展開済みビットマップを
// 抱え込むので、prefetch では呼ばない。失敗は error 側で拾う。
function requestDecode(image) {
    if (!image || image.__uonDecodeRequested) return;
    image.__uonDecodeRequested = true;
    image.decode?.().catch(() => {});
}

function createImage(src, { decode, priority }) {
    const image = new Image();
    image.decoding = 'async';
    if (priority && 'fetchPriority' in image) image.fetchPriority = priority;
    image.addEventListener('error', () => { image.__uonFailed = true; }, { once: true });
    image.src = src;
    if (decode) requestDecode(image);
    return image;
}

// src に対応する Image をキャッシュから返す（無ければ生成してロードを開始）。
// 「もう要る」側の入口なので、先読みで積まれただけの Image はここでデコードへ格上げする。
export function getImage(src) {
    if (typeof Image === 'undefined' || !src) return null;
    let image = _cache.get(src);
    if (!image) {
        image = createImage(src, { decode: true, priority: 'high' });
        _cache.set(src, image);
    } else {
        requestDecode(image);
    }
    return image;
}

// 一覧をまとめて即時読み込みする（冪等）。
export function preloadImages(srcList) {
    if (!Array.isArray(srcList)) return;
    for (const src of srcList) getImage(src);
}

// 一覧を低優先の待ち行列へ積む（冪等）。既に読み込み済み／読み込み中の src は無視。
// 積んだあとに preloadImages が同じ src を要求したら、そちらが先に Image を作るので
// 自動的に即時ロードへ格上げされる（行列側は _cache 済みとして読み飛ばす）。
export function prefetchImages(srcList) {
    if (typeof Image === 'undefined' || !Array.isArray(srcList)) return;
    for (const src of srcList) {
        if (src && !_cache.has(src) && !_prefetchQueue.includes(src)) _prefetchQueue.push(src);
    }
    pumpPrefetchQueue();
}

function pumpPrefetchQueue() {
    if (_prefetchBusy) return;
    // 既に読み込み済みの src は捨てながら、次に流すべき1枚を取り出す
    let src = null;
    while (_prefetchQueue.length > 0) {
        const next = _prefetchQueue.shift();
        if (next && !_cache.has(next)) { src = next; break; }
    }
    if (!src) return;

    _prefetchBusy = true;
    const image = createImage(src, { decode: false, priority: 'low' });
    _cache.set(src, image);
    const done = () => { _prefetchBusy = false; pumpPrefetchQueue(); };
    if (image.complete) {
        // キャッシュヒットで同期的に完了した場合。再帰で深く潜らないよう次フレームへ逃がす。
        _prefetchBusy = false;
        setTimeout(pumpPrefetchQueue, 0);
        return;
    }
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
}

// 一覧が全て決着済みか。未生成の src が含まれる場合は false（＝まだ読み始めていない）。
export function areImagesSettled(srcList) {
    if (!Array.isArray(srcList) || srcList.length === 0) return true;
    for (const src of srcList) {
        const image = _cache.get(src);
        if (!isImageSettled(image)) return false;
    }
    return true;
}

// 通信量を節約したい環境か（データセーバー設定・低速回線）。
// 「そのうち要る」ぶんの先読みだけを止める。実際に要るぶんの読み込みは止めない。
export function shouldSkipPrefetch() {
    if (typeof navigator === 'undefined') return false;
    const c = navigator.connection;
    if (!c) return false;
    if (c.saveData) return true;
    return c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
}
