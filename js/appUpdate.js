// ============================================
// Unification of the Nation - 新版の検知と再読み込み
// ============================================
// PWA（ホーム画面から起動した standalone）には URL バーもリロードボタンも無いため、
// デプロイした修正を反映する手段がユーザー側に無い。ここで
//   1. 起動時とアプリ復帰時に「配信中の index.html」を取り直してビルドトークンを比較
//   2. 変わっていたらタイトル画面に「タップで更新」を出す
//   3. タップで ?cb= 付きの URL へ置き換えて HTML キャッシュごと読み直す
// を行う。JS/CSS は index.html 内の `?v=<トークン>` で参照しているので、
// index.html さえ新しくなれば下流のモジュールも必ず新しくなる。
//
// このモジュールは他の js/* を import しない（循環と TDZ を避けるため）。

// 実行中のビルドトークン。index.html の <script type="module" src="js/main.js?v=..."> から読む。
function readRunningToken() {
    try {
        const el = document.querySelector('script[type="module"][src*="main.js"]');
        if (!el) return null;
        const m = String(el.getAttribute('src') || '').match(/[?&]v=([^&"']+)/);
        return m ? m[1] : null;
    } catch { return null; }
}

const TOKEN_RE = /main\.js\?v=([^&"']+)/;
const RUNNING_TOKEN = readRunningToken();

let _updateAvailable = false;
let _checking = false;
let _lastCheckedAt = 0;
// 最後の確認結果。デバッグメニューに出して「なぜ通知が出ないのか」を見えるようにする
// （出ない理由が「最新だから」なのか「確認に失敗しているから」なのか区別できないと詰む）。
let _status = RUNNING_TOKEN ? '未確認' : 'トークン不明';
let _deployedToken = null;

export function isUpdateAvailable() { return _updateAvailable; }
export function getRunningToken() { return RUNNING_TOKEN; }
export function getUpdateStatus() { return _status; }
export function getDeployedToken() { return _deployedToken; }

// 配信中の index.html を取り直してトークンを比較する。
// no-store でブラウザキャッシュを、?cb= で CDN（GitHub Pages）のキャッシュを外す。
export async function checkForUpdate(force = false) {
    if (_checking || !RUNNING_TOKEN || typeof fetch !== 'function') return _updateAvailable;
    // 復帰のたびに叩かないよう最短間隔を設ける（30秒）。手動確認は素通し。
    const now = Date.now();
    if (!force && now - _lastCheckedAt < 30000) return _updateAvailable;
    _checking = true;
    _lastCheckedAt = now;
    _status = '確認中';
    try {
        const url = new URL('index.html', window.location.href);
        url.searchParams.set('cb', now.toString(36));
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) { _status = `失敗(${res.status})`; return _updateAvailable; }
        const html = await res.text();
        const m = html.match(TOKEN_RE);
        if (!m || !m[1]) { _status = '版が読めず'; return _updateAvailable; }
        _deployedToken = m[1];
        if (m[1] !== RUNNING_TOKEN) {
            _updateAvailable = true;
            _status = '新版あり';
        } else {
            _status = '最新';
        }
    } catch (e) {
        // オフライン等。次の機会に再試行するだけで、ゲーム進行には影響させない。
        _status = '通信不可';
    } finally {
        _checking = false;
    }
    return _updateAvailable;
}

// 現在の URL にキャッシュバスターを付けて読み直す。
// replace なので PWA の履歴に戻り先が積もらない。
export function applyUpdate() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('cb', Date.now().toString(36));
        window.location.replace(url.toString());
    } catch {
        window.location.reload();
    }
}

// 起動時に1回 + アプリ復帰のたびに確認する。main.js から1回だけ呼ぶ。
export function startUpdateWatch() {
    if (typeof window === 'undefined' || !RUNNING_TOKEN) return;
    const check = () => { checkForUpdate(); };
    // 起動直後は読み込みが混むので少し遅らせる。
    window.setTimeout(check, 3000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('focus', check);
}
