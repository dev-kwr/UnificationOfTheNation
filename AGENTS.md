# AGENTS.md - 天下統一 開発・アーキテクチャガイド

このドキュメントは、「天下統一 (Unification of the Nation)」プロジェクトに参加するAIエージェントおよび開発者のためのアーキテクチャ概要・システム構成ガイドです。
過去の対応履歴や一時的なバグ修正ではなく、ゲーム全体の構造と設計思想をまとめ、他のAIがスムーズに開発を引き継げるようにしています。

## 🚀 実行・開発環境
- **統合コマンド**: `StartGame.command`
    - **機能**: 自動ポート解放、No-Cache（開発用）、ブラウザ自動起動、LAN内IP表示。
    - **注意**: `serve.command` は廃止・削除されました。
- **キャッシュ対策**: ファイル種別で方針を分けています。
    - **コード (HTML/JS/CSS/JSON)**: `no-store`。ES module は推移的 import が古いまま残ると新旧が混ざるため、一切保存させません。変更はリロードで即時反映されます。
    - **アセット (画像/音)**: `no-cache`（毎回再検証・更新が無ければ 304）。差し替えは即反映されるのに再ダウンロードは発生しません。背景画像は全ステージで77MBあり、`no-store` だとリロードのたびに再取得になっていました（実測 19.5MB → 0.5MB）。

## 🌐 公開（GitHub Pages）
- **手順**: `main` へマージすると `.github/workflows/deploy-pages.yml` が自動で公開します（Actions タブから手動実行も可）。
- **初回のみ**: リポジトリの Settings → Pages → Source を **「GitHub Actions」** に設定してください。
- **画像差し替えの反映**: ビルド時に `tools/stamp-assets.mjs` が `images/ bgm/ se/ icon/` とルート直下アイコンの**内容ハッシュ**を URL へ刻みます（`images/foo.png?v=<8桁>`）。中身が変われば URL も変わるので、配信側のキャッシュに関係なく必ず新しい画像が出ます。**`?v=` を手で書く必要はありません**（手書きの値があっても上書きされます）。
    - 手元で確認: `node tools/stamp-assets.mjs --dry-run`
    - 実体の無いアセット参照があるとビルドを失敗させます（タイプミス検出）。
    - **JS の import 指定子（`./game.js?v=...`）は対象外**です。モジュールは相互参照するため内容ハッシュが循環し、下記の「1モジュール1指定子」を機械的に保てないためで、こちらは従来どおり手動トークン運用です。

## 🏗️ システムアーキテクチャと設計思想

本プロジェクトは、HTML5 Canvas APIを使用した2Dアクションゲームであり、**「ロジック（状態管理）」と「レンダリング（描画）」の分離** を基本的な設計思想としています。

### 1. メインループと状態管理 (`main.js` & `game.js`)
- **`main.js`**: エントリーポイント。DOMのロード、Canvasの取得、フォントのプリロード（FOUT対策）を行い、`game.init()` と `game.loop()` をキックします。
- **`game.js`**: ゲームの心臓部。`requestAnimationFrame` によるメインループを管理し、`GAME_STATE` (TITLE, PLAYING, GAME_OVER等) に応じた状態遷移、全体の時間管理（deltaTime）、ヒットストップ、画面揺れ（Screen Shake）のグローバルエフェクトを制御します。

### 2. プレイヤーの分離設計 (`player.js` & `playerRenderer.js`)
- **`player.js`**: プレイヤーの座標、速度（物理演算）、HP、攻撃ステート（`isAttacking`, `attackCombo`）、装備などの**状態管理とロジック**のみを担当します。
- **`playerRenderer.js`**: `player.js` の状態を受け取り、実際の**Canvasへの描画（アニメーション、ポーズ遷移、防具の追従）**を担当します。
- **`playerSlashTrail.js` / `shogunRendererHelper.js`**: 複雑な斬撃エフェクト（Trail）や将軍特有の描画ヘルパー。コンボ斬撃の座標はキャラクターのY軸振動に依存しないよう、グラウンドプレーン（ワールド座標）にアンカーして描画する設計になっています。

### 3. 武器と戦闘システム (`weapon.js` & `collision.js`)
- **`weapon.js`**: メインウェポンやサブウェポン（手裏剣、大太刀など）の定義、発射ロジック、軌道計算（追尾など）を担当。
- **`collision.js`**: 当たり判定（AABB）を集中管理。プレイヤー、敵、攻撃判定（ヒットボックス）の交差判定をグローバルに行います。
- **武器成長**: `weapon_growth_plan.md` に基づいた進化・成長システムを採用しています。

### 4. 敵とステージ進行 (`stage.js`, `enemy.js`, `boss.js`)
- **`stage.js`**: カメラのスクロール進行度（`progress`）に応じて、敵のスポーンや障害物の配置を行います。
- **`enemy.js` / `boss.js`**: 雑魚敵およびボスのAIステートマシン。ボスは固有の攻撃パターン（フェーズ遷移）を持ち、`game.js` のメインループから更新されます。

### 5. UIとオーディオ (`ui.js` & `audio.js`)
- **`ui.js`**: ゲーム内UI（HPバー、ダメージ表記、レベルアップ選択、タイトル画面）のCanvas描画を独立して担当します。
- **`audio.js`**: BGM/SEの再生管理。ブラウザのAutoplay制限への対策（初回インタラクションでのAudioContext再開）を含みます。

## 🛠 開発ルールと拡張時の注意点

0. **import 指定子は1モジュール1種類（最重要）**:
   - `js/*.js` の内部 import は全て `./xxx.js?v=<共通トークン>` の形で、**同じファイルには必ず同じ指定子**を使うこと。
   - ES Modules は指定子（`?v=` 込みの文字列）ごとに別モジュールとして評価される。同じファイルを `?v=` 有りと無しで読むと**モジュールが二重に生成され、モジュールスコープの状態が共有されない**。
   - 実際に踏んだ事故: `constants.js` が2インスタンスに分裂し、`game.js` が設定した `uiScale`／セーフエリアを `ui.js`・`input.js`・`shop.js` が読めず、スマホのUI拡大とノッチ退避が**まるごと無効**になっていた（`ui.js` は3インスタンス、`game.js` は2インスタンスで `export const game` も二重化）。
   - キャッシュバスターを更新する時は**全ファイルのトークンを一括で置換**すること（片方だけ上げると必ず分裂する）。
   - 確認コマンド: `grep -rn "from '\./" js/ | grep -o "\./[a-zA-Z0-9]*\.js[^']*" | sort -u` の結果が**モジュールごとに1行**であること。

1. **言語の統一**: UIテキスト、武器名、ログ出力はすべて**日本語**で統一すること。
2. **ロジックと描画の分離の徹底**: 
   - `player.js` 内で直接Canvas API（`ctx.fillRect`など）を呼び出さないこと。描画処理は必ず `Renderer` クラスや `ui.js` に委譲してください。
3. **ステートの同期**: 
   - 攻撃アニメーションやサブウェポン発動時、`isAttacking` フラグや各種タイマーが描画側とロジック側で競合・意図せぬリセットを起こさないよう、ステート遷移は一元管理してください。
4. **一貫性の維持**: 
   - 武器の追加やバランス調整を行う際は、`constants.js`（定数定義）, `weapon.js`（ロジック）, `playerRenderer.js`（描画）, `ui.js`（UI表示）の整合性を必ず確認してください。
5. **canvas内UIの端退避は「端末の角丸を避けるぶんだけ」**（ユーザー確定方針 2026-08-09）:
   - 判断基準はこれだけ。**被らない位置にある要素を予防的に内側へ寄せないこと**。
   - **`env(safe-area-inset-*)` を canvas 内 UI の配置に使わない**。横向きの iOS は左右へ**対称に**大きな値（実測 iPhone 16 Pro で左右とも 59css-px）を返すが、Dynamic Island は片側の縦中央にしか無い。角丸回避に要る量（同端末で 16.8css-px）を遥かに超えて全UIを内側へ押し、「下部の操作ボタンも HUD も余分に内側へ寄った」と実機で2度差し戻された。CSS側（`#sound-gate` の padding 等 DOM 要素）の env() 退避は別系統なのでそのまま。
   - 退避量は**角丸クリアランスのみ**＝ `getScreenSafeArea()`（`_cornerInsetX/Y` の単一導出）。角丸Rの推定は `game.js` の `CORNER_RADIUS_RATIO`(短辺11%) / `CORNER_CLEARANCE_RATIO`(0.38R＝幾何最小0.293Rに曲面余裕を足した最小限)。調整はここだけ。
   - **ノッチ帯を避けるのは「縦に大きいUI」だけ**。横向きの Dynamic Island は画面の縦中央にあるので、上端や下端に貼り付くUIは掛からない。
     - 左上HUDパネル → `getUiLeftEdge()`（`max(角丸 + panelX*uiScale, ノッチ帯)`。帯幅をそのまま足すと panelX のぶん余分に内側へ寄る）。
     - 画面の縦いっぱいのパネル（タイトルのデバッグウィンドウ）→ `getFullHeightSideInset()` で**左右とも**避ける（横持ちの向きで帯が左右どちらにも来るため）。
     - 下部の仮想パッド・右上のBGMボタンなど、帯に掛からないUIには適用しない。
   - **下部の仮想パッドは退避ゼロ**（`getPadLayout`）。自前のマージン（横 `SAFE_MARGIN_X`=150・下 `BOTTOM_MARGIN`=140 論理px、s倍）だけで既に角丸の外側にある（拡大時の実クリアランスは 0.72×76≒55css-px 一定 > 角丸R≒44css-px）。ここに退避を足さないこと。
   - 退避で**位置が動的になったUIのタップ判定を、画面の角からの固定矩形で書かないこと**。描画と判定は同じレイアウト導出（例: `getTitleScreenLayout().gear` / `.updateNotice`）を読む。
   - **画面端のUIは縦のラインを合わせる**（別々の基準で置くと実機で必ず気付かれる）。左端＝`getUiLeftEdge()`（左上HUDパネルの左端と仮想パッドのポーズボタンの左端）。右端＝`getPadLayout().bgm` の右端（BGMボタン・操作ボタン群・タイトル⚙）。新しく端に置くUIはこのどちらかに乗せる。
   - 左端を合わせるときは**ポーズボタン単体ではなく左側パッド（スティック込み）を動かす**（`getPadLayout` の `stickX`）。ポーズだけ寄せるとスティックの円に食い込む＝実機で指摘された。パッド内の相対配置（`PAUSE_BUTTON` 等）は崩さないこと。

5f. **全画面を覆う幕は `render()` の共通位置で描く**:
   - BGMボタン（`renderGlobalTouchButtons`）は各画面の描画より後に描かれる。幕を各画面側（例: `renderStageClearView`）で描くとボタンだけ暗転から取り残される（実機で指摘）。ステージ遷移フェード・アセット待ちの暗幕・遷移フェードはすべて `render()` のボタン描画より後にまとめてある。

5g. **表示領域は `visualViewport` を最優先。canvas サイズは自己修復させる**:
   - `configureCanvasResolution` は `max(container, viewport)` を取っていたため、iOS 起動直後/回転直後に残る「回転前の大きい container」に引っ張られ、canvas が画面より大きく作られて端が切れた（実機で「たまに変なクロップで起動、回転し直すと直る」）。実表示領域は visualViewport を優先する。
   - `ensureViewportSync` は寸法の変化が無くても `isCanvasSizeStale()` で canvas の CSS サイズを照合し、食い違えば作り直す。一度ズレると以後どのイベントも発火せず固まるため。fitScale の式は `computeFitScale()` に集約し、生成と照合で必ず同じ式を通す。
   - container(CSS の 100vw/100dvh 由来)は canvas を組む前に必ず `syncContainerToViewport()` で実表示領域へ合わせる。起動時・リサイズ経路の両方で。

5b. **和文をボタン内で上下中央に置くときは `fillTextInkCentered`(ui.js)**:
   - `textBaseline='middle'` は em ボックス基準なので、和文は**文字列ごとにインクの中心がずれる**（実測: 同じボタンで「タイトルに戻る」は3px下、「もう一度タップ」はほぼ中央）。
   - `measureText().actualBoundingBox*` は**現在の `textBaseline` からの距離**を返す。計測と描画で同じ `alphabetic` を使うこと（middle のまま測って alphabetic で描くと em ボックスぶん大きくずれる。実測 -9.5px）。

5d. **仮想パッドの当たり判定は「小さいボタン → スティック」の順で見る**:
   - スティックの始動エリア（`STICK_TOUCH_RADIUS`）は見た目の円よりかなり広く、近くのボタンを飲み込む。ポーズボタンを左端ラインへ寄せた際に始動エリアの内側（距離155 < 半径159.5）へ入り、押しても毎回スティックを掴む状態になった。
   - `input.getTouchActions` は「掴み継続 → ポーズ → スティック始動 → 右側ボタン」の順。パッドにボタンを足すときはスティックより前に置くこと。

5e. **項目が増える一覧は「実寸css-pxで収まりを設計」する**:
   - タイトルのデバッグメニュー（`getTitleDebugLayout`）は、使える高さと幅から**列数と文字サイズを自動で決める**。列を増やすと行が高くなり縦は得をするが横が細くなるので、両制約の小さい方＝その列数での文字サイズを求め、それが最大になる列数を選ぶ。結果としてスマホは2列・PCは1列（従来の見た目のまま）になる。
   - 行インデックス⇄座標は `cellOf` / `indexAt` で相互変換し、描画とタップ判定が必ず同じ式を通る。項目を足しても両方が自動追従する。

5c. **PWA(standalone)には手動リロード手段が無い**:
   - URLバーが無いので、デプロイした修正をユーザーが取り込む導線をこちらで用意する必要がある。`js/appUpdate.js` が起動時とアプリ復帰時に配信中の `index.html` を `no-store`＋`?cb=` で取り直し、`main.js?v=` のトークンを実行中の値と比較する。
   - 新しいバージョンを検知したら**タイトルで中央モーダル**（`getUpdateModalLayout` / `renderUpdateModal`）を出し、更新以外の操作を通さない（古いまま遊ばれると直したはずの不具合の報告が続くため）。全デバイス対象。タップ／クリック／SPACE で現在URLに `?cb=` を付けて `location.replace`＝HTMLキャッシュごと読み直す（JS/CSSは `?v=` 参照なので index.html さえ新しくなれば下流も必ず新しくなる）。
   - **逃げ道として右下⚙のデバッグメニューだけは開ける**（開いた時点で強制的に再確認も走る）。万一検知が誤っても操作不能で詰まないようにするため。ここを塞がないこと。
   - 文言は世界観より分かりやすさ優先（「版」ではなく「バージョン」）。
   - モーダルが強制なので、**デバッグメニューに手動リロード項目は置かない**（重複するだけ）。確認できなかった時だけ `console.warn('[update] 確認できず: …')` を残すので、切り分けはコンソールで行う。
   - 注意: この仕組み自体が入っていない版を動かしている端末には当然モーダルは出ない（導入時の一度だけは手動更新が要る）。
6. **スケールは2系統（幾何と文字）**:
   - `getUiScale()`＝パネル・ボタンなど**幾何**、`getFontScale()`＝**文字**の実寸アンカー。文字を幾何に合わせると小さすぎ、幾何を文字に合わせると仮想パッドが画面を覆う。
   - どちらも `fitScale >= UI_SIZE_ANCHOR(0.72)` の端末（iPad/PC）では 1.0 ＝ ピクセル不変。
6b. **ステージ間の遷移は「クリア演出 → セレクト → ステータス → 開始」**:
   - クリア演出(STAGE_CLEAR Phase0)のタップは `enterStageSelect()`（全体マップ `js/stageSelect.js`）へ。ステータス画面(STAGE_CLEAR Phase1)へは**セレクトで行き先を決めてから** `enterStatusScreenForStage(n)` で入る。「準備完了」は `pendingStageSelection` のステージを開始する（よろず屋を経由しても保持）。
   - 解放は `maxClearedStage`（クリア済みの最深階層）が正本。`選べる範囲 = min(6, maxClearedStage+1)`、全クリア済み(isGameCleared)は常に全解放。セーブは `progress.maxClearedStage`（旧セーブは currentStage-1 で補完）。**再戦クリアで保存する「次のステージ」は maxClearedStage+1**（currentStage+1 だと続きからが巻き戻る）。
   - マップのノード座標は `WORLD_MAP_NODES` に**画像内比率(u,v)**で持ち、描画とタップ判定は `getStageSelectLayout()` を共有する。マップ画像は `images/world_map.png`（無ければフォールバック描画）。生成指示は `map_generation_prompt.md`、自動生成は `tools/generate-worldmap.mjs`。
   - ノード6(天守)はスマホ(wide)の縦クロップで上へ寄るため、右上のBGMボタンと重ならない v にしてある。ノードを動かすときは重なりを再確認すること。
   - **経路線は描かない**(絵に描かれた一本道に任せる。UI線の重ねはややこしい、と実機で差し戻し)。カーソルの順序は `STAGE_SELECT_ORDER`(道なり順・ボーナスは2と3の間)。
   - **寄り道は Stage互換の軽量クラス**（小判蔵=`js/bonusStage.js`・修行道場=`js/trainingStage.js`）を `game.stage` に差して PLAYING をそのまま使う(`isCleared()` 常false=本編クリア経路に乗せない)。終了は `isBonusFinished()`/`isTrainingFinished()` を updatePlaying が見て `finishBonusStage()`/`finishTrainingStage()`→セレクトへ。本編進行には触れない。開始は共通の `startSideStage()`＋本編と同じ暗幕待ち(`pendingStageStart={side:'bonus'|'training'}`)。サイドステージを増やすときはこの方式を踏襲する。
   - **寄り道は刻限60秒のスコアアタック**。stage が `getHudTimerSec()/getScore()/isTimeUp()/sideKind` を持ち、時間切れで `game.beginSideResult()` → `SIDE_RESULT`(結果発表)→セレクト。最高記録は **saveGlobal の `sideBest{bonus,training}`**(プレイヤーのセーブとは独立。難易度や周回に影響されない記録)。
   - **寄り道は何度でも挑める**(記録更新が目的なので在庫制にはしない)。**startNewGame は開始時に即セーブする**既存仕様なので、`?map=` デバッグ起動はセーブを上書きする(検証時は注意)。
   - **縦アスレチックのカメラは `stage.useFeetCameraLift`**。これが真だと updateCameraLift が【プレイヤーを画面の上下中央に置く】ように追い、`getCameraMinVisTop()`(頂き)と crop(床)でだけ止まる。接地条件は付けない(跳んでいる間こそ上が見たい)。z=1 の PC は crop=0 のため、このフラグが無いと早期 return して一切追従しない。本編は従来どおり groundY 基準・接地時のみ。
   - **場が終わったら `clearRunTimeBuffs()`**(奥義の分身・大薙・隠れ身の一時強化を全解除)。本編クリア・寄り道の刻限切れ・ステータス画面入場の3か所から呼ぶ。呼ばないとステータス画面に分身が並び、次のステージへ効果が持ち越される。
   - **上部の枠は刻限だけ・合計は画面中央に出す**(`renderSideStageTimer` / `renderSideScoreBurst`)。数字を同じ枠に2つ並べると的が絞れず手応えも出ない。合計は獲得のたびに中央(y=42%)へ大きく出し、`stage.lastGain`(値と時刻)でカウントアップ・発光・0.75秒保持→フェード。拾った/倒した場所からは `stage.gainPops` の「+n」が浮く。
   - **足場が要る寄り道は `stage.getPlatformColliders()`**(one-way形式 `{x,y,width,height,isDestroyed:false,isOneWayPlatform:true}`)を実装すれば updatePlaying の extraColliders に汎用で乗る。スタックの**最上面だけ**足場にする(中段に乗れると上の箱にめり込む)。
   - **道場の敵は本編と同じ createEnemy 製**。stage 側は「湧かせる・`enemy.update()` が true を返したら除去・`renderEnemies` で描く」だけ。被弾判定・撃破報酬(expGem/小判/ゲージ)は game 側が `getAllEnemies()` 経由で処理するので二重実装しない。固定画面(maxProgress=CANVAS_WIDTH)なら scrollX は自動で0に張り付く。左端クランプは currentStageNumber 依存(Stage5帰りは素通り)のため寄り道側で自前クランプする。

7. **ステージ背景アセットの追加は `stage.js` の `STAGE_IMAGE_SOURCES` へ**:
   - この表が「Stage への割り当て」と「先読み・ロード完了判定」の単一ソース。ここを通さずに `new Image()` すると、ステージ開始直後だけ絵が抜けてフラッシングする。
   - 読み込み経路は2系統（`imageCache.js`）。**もう要る**＝`preloadStageImages()`（即時・並列・デコードまで）、**そのうち要る**＝`prefetchStageImages()`（低優先・1枚ずつ・デコードは描画時任せ・データセーバー時は見送り）。
   - **先読みは常に1ステージ先まで**。全6ステージ分は転送77MB／デコード後248MBあり、まとめて読むとモバイルのタブ用メモリ上限に触れる。

---
*最終更新: 2026-08-10*
