// ============================================
// Unification of the Nation - 画像アセットのセッションキャッシュ
// ============================================
// Stage は生成のたびに new Image() を作り直していたため、ステージ開始直後の
// 数フレームは naturalWidth=0（描画がスキップされる）状態で背景が抜け、
// 読み込み完了と同時に絵が差し替わってフラッシングして見えた。
//
// src をキーにセッション内で Image を1つだけ共有する。2周目以降のステージ生成は
// ロード済みの同じ Image を受け取るので、待ち時間もフラッシングも発生しない。
// 加えて「まだ揃っていないか」を呼び出し側が判定できるようにし、暗転中に
// 先読みを済ませてから開始できるようにする（game.js requestStageStart）。

const _cache = new Map();

// 画像が実際に描画可能か。complete だけだとロード失敗(404)も true になるため
// naturalWidth も見る（失敗した画像は「揃った」とみなして待ちを抜ける方が安全なので、
// 待ち側は isImageSettled を使う）。
export function isImageReady(image) {
    return !!(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

// ロードが決着したか（成功・失敗を問わない）。待ちループの終了条件はこちら。
function isImageSettled(image) {
    return !!(image && (image.complete || image.__uonFailed));
}

// src に対応する Image をキャッシュから返す（無ければ生成してロードを開始）。
export function getImage(src) {
    if (typeof Image === 'undefined' || !src) return null;
    let image = _cache.get(src);
    if (!image) {
        image = new Image();
        image.decoding = 'async';
        image.loading = 'eager';
        image.addEventListener('error', () => { image.__uonFailed = true; }, { once: true });
        image.src = src;
        // decode() があれば先にデコードまで済ませる（初回描画時のデコード待ちで
        // 1フレーム落ちるのを防ぐ）。失敗は error 側で拾うのでここでは握り潰す。
        image.decode?.().catch(() => {});
        _cache.set(src, image);
    }
    return image;
}

// 一覧をまとめて読み込み開始する（冪等）。
export function preloadImages(srcList) {
    if (!Array.isArray(srcList)) return;
    for (const src of srcList) getImage(src);
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
