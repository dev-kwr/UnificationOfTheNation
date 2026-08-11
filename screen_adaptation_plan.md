# スマホ横向き最適化 設計書 — 1280ビュー凍結・可変スクリーン方式

作成: 2026-07-03。7領域の並列コード監査 → 3独立設計案 → 3視点審査 → 商用チェックリスト欠落検査（計14エージェント）の統合結果。

## 進捗

- **P1 uiScale: 完了 (2026-07-03)**。constants.js に getUiScale/setUiScaleFromFitScale/getPadLayout（描画と判定の単一導出）。スマホで HUD・仮想パッド・BGMボタンが 1.32 倍（44pt/18px 基準充足）。PC/iPad は uiScale=1 でピクセル不変（実コンテンツのゴールデンで証明）。
- **P2a リネーム: 完了 (2026-07-03)**。プレゼン層（ui.js/shop.js/input.js 全数 + game.js 22行）を SCREEN_WIDTH へ。ワールド系は CANVAS_WIDTH のまま。SCREEN_WIDTH=1280 固定でピクセル不変を証明。
- **P2b 可変幅+ズーム+縦カメラ: 完了 (2026-07-03)**。SCREEN_WIDTH 自己初期化（screen 基準横長比・1280〜1600 偶数クランプ・タッチのみ・セッション固定・localStorage `uon_wide_mode='0'` キルスイッチ・`?wide=0/1` で書換）。世界ズームwrap（z=SCREEN_WIDTH/1280 恒等式）・cameraLift（接地時のみ・HEADROOM90/DEADBAND24/非対称平滑）・昇段 S=min 化+dx() 水平アンカー・ロゴクランプ・rightColX 右端アンカー・drawBgCover（背景5種）・wasScreenTapped（位置不問5箇所のみ）。実測: iPhone15 相当で SCREEN_WIDTH=1560・黒帯1px・可視ワールド幅1280±0・visTop129.2。
- **P3 空補償+セーフエリア+manifest+縦持ちゲート: 完了 (2026-07-03)**。stage.js skyY()/skyVisTop（星・雲・天体軌道半径・stage5天井/吊り灯り/家紋）。viewport-fit=cover + env()→論理px ブリッジ（--sai-l/r プローブ→setSafeInsets→getPadLayout 左右アンカー）。manifest.json（orientation:landscape/standalone）+ apple メタ。#rotate-gate（縦持ちゲート、body.touch-device 駆動）。orientationchange/document.hidden で自動ポーズ（autoPauseIfPlaying、既存ポーズ機構流用）。#sound-gate へ env() padding。パッド右クラスタ/BGM/ステージ名は SCREEN_WIDTH 基準の物理右端吸着へ修正。
- **P4 磨き: 完了 (2026-07-03)**。ピンチズーム中の入力無効化（getRenderRect が vv.scale>1.02 で null）。prefers-reduced-motion で cameraLift 平滑を半減。低スペック検知（PLAYING 中 >24ms 累計3秒）でタッチ DPR 上限 1.5→1.25 に一段降格（セッション内不可逆）。折りたたみ/Split View の画面構成乖離（screen 基準 15%・3秒安定・非 PLAYING）で再読み込みトーストを1回だけ表示。
- **ゲート結果 (P1〜P4)**: 実コンテンツのゴールデン（transitionTimer=0 化+非黒アサーション+CDP screen メトリクスエミュレーション）で、PC/iPad は P1→P4 の全フェーズでピクセル不変（title のみ cover-crop 導入時の 0.5px 級リサンプル差分を許容）。stage1 はユーザーの並行アート編集（竹画像）起因の差分のみ。phone は各フェーズの意図変化（uiScale/全幅化/空補償）を目視確認。
- **最終レビュー**: 7観点のサブエージェント並列レビューは2回ともセッション/クレジット上限で中断。代わりに主要4観点をインラインで確認済み: (1) SCREEN_WIDTH 自己初期化がモジュール評価時=Game 構築前に走る、(2) 世界ズームwrap の save/restore 均衡（5287→5400 と 5295→5375 のネスト）、(3) cameraLift リセットが全経路（コンストラクタ/startNewGame/startStage、continueGame は startStage 経由）カバー、(4) 昇段画面 dx() 化が見出し・罫線・カードで漏れなし（カード内は cx=x+w/2 の相対で追従）。残りの3観点（セーフエリア実値・空補償の絵作り・ライフサイクル）は実機QAに委譲。
- **検証ハーネスの教訓**: (1) ループ停止+startStage 直後は遷移黒フェードで全ステージ真っ黒になり、ゲートが「黒vs黒の一致」で空振りする → transitionTimer=0 と非黒ピクセルアサーション必須。(2) puppeteer の setViewport は screen.width/height をエミュレートしない → SCREEN_WIDTH 自己初期化の検証には CDP Emulation.setDeviceMetricsOverride の screenWidth/screenHeight 指定が必須（実機は不要）。
- **P0 基盤衛生: 完了 (2026-07-03)**。実施内容: renderPlaying の save/restore 均衡化（末尾 restore 追加。HUD の継承状態を変えないため必ず末尾）/ updateInputScale・input.setScale・scaleX/scaleY・cachedAssets.castle 焼き込み・renderProgressBar のデッドコード削除 / stage.render（検証用一括パス）から renderBossUI・renderProgressBar を撤去 / getDeviceProfile() を constants.js に単一ソース化（4ファイルの複製式を置換、挙動同値）/ hasPhysicalKeyboard ラッチの双方向化（タッチで false、e.repeat では再設定しない）/ game.getVisibleWorldBounds() 新設 / ?v= チェーン更新（index.html→main.js→game.js→stage.js）。
- **P0 ゲート結果**: scratch/p0_golden.js の決定性ハーネス（Math.random を mulberry32 注入・rAF 停止・時間凍結・単発 render）で、PC 1920×1080 / iPad 1024×768(touch) × タイトル+全6ステージ+ポーズ の16シーンが編集前後で**バイト単位一致**。6観点のアドバーサリアル検証（削除API残参照 / save-restore 均衡 / 端末判定同値性 / stage 編集安全性 / 入力ラッチ / キャッシュ整合）も全 PASS。
- **設計修正（RNGフック）**: §3 P0 の「?rngseed= フックまたは検証緩和の決定」は、**出荷コードにフックを追加せず、検証ハーネス側で evaluateOnNewDocument により Math.random を注入する方式に決定**。編集前の状態も同一手法で採取できるため優位。P2a/P2b のリプレイ一致ゲートも同方式で行う。
- 既知の残メモ: game.js は main.js から ?v= 付き、save.js / player.js / playerRenderer.js から無印で import されており**モジュール二重インスタンス化が既存**（P0 では構造不変。P2a 前に別途調査・是正を検討）。キャッシュ異常時のフェイルモードは「旧ビルド表示」から「constants.js 旧版時の起動不能（export not found）」に変化（ハードリロードで解消、運用は従来どおり）。
- **P5 実機不具合対応: 完了 (2026-08-09)**。実機で「スマホのUIが拡大されていない／画面端が角丸で欠ける／ステージ開始時に背景がフラッシングする」の3件。
    - **根本原因＝モジュール二重インスタンス化**（上の「既知の残メモ」が P1〜P4 の効果を丸ごと殺していた）。`constants.js` が `?v=` 有り(game/stage/main)と無し(ui/input/shop ほか15ファイル)の**2インスタンス**に分裂し、game.js が `setUiScaleFromFitScale` / `setSafeInsets` で書いた値を ui.js・input.js・shop.js が読めていなかった。実測: 同一セッションで `getUiScale()` が **1.319(versioned) / 1.0(bare)**、`getPadLayout().stick.x` が **240 / 182**。つまり P1 の uiScale も P3 のセーフエリアも**実機では一度も効いていなかった**。`ui.js` は3インスタンス（main.js の `preloadCinematicBgImages` が描画側と別インスタンスを暖めていた＝intro/ending の先読みも無効）、`game.js` は2インスタンス（`export const game` が二重化し、player.js の Stage5 左登り制限解除と装備記憶が死んでいた）。
    - 対策: 全内部 import を `?v=screen-safe-20260809a` の**単一指定子へ統一**。AGENTS.md に不変条件と grep 確認手順を明文化。
    - **角丸退避**: `--sai-t/--sai-b` を追加して env() を四辺読む。加えて env() が 0 を返す端末向けに**角丸クリアランス**（R≒短辺×11%、退避量＝幾何最小 0.293R に余裕を見た 0.38R、レターボックス分は減算）を game.js `updateCornerInsets` で算出。`getScreenSafeArea()` が両者の max を返す単一導出。HUD・仮想パッド・BGMボタン・ステージ名・タイトル⚙・操作説明行・ステータス画面左右へ適用。ステータス画面は上下に適用しない（上96/下60は既に十分内側で、s=1.12 の縦収まり上限を割ると幕間メニューとカードが重なる）。
    - **フォント専用スケール**: 実寸(css-px) = 論理px × スケール × fitScale の関係から、幾何 `UI_SIZE_ANCHOR=0.72`（従来値）と文字 `TEXT_SIZE_ANCHOR=1.0` を分離（`getFontScale()`、上限1.9）。HUD 本文 16論理px の実寸が **8.7css-px（二重化バグ下の実効値）→ 16.0css-px**。よろず屋の fs は行内の縦収まりから `1.30*s` で頭打ち。
    - **背景フラッシング**: `imageCache.js`（src キーのセッション共有 Image）を新設し、`stage.js` の `STAGE_IMAGE_SOURCES` を「Stage への割り当て」と「先読み・完了判定」の単一ソース化。幕間で次ステージを prefetch、遷移の暗転中に先読み、揃うまで暗転で待つ（上限4秒で打ち切り）。
    - **背景の先読み強化 / よろず屋セーブ修正 (同日追加)**: 背景の読み込みを2系統に分離（`preloadStageImages`＝即時・並列・デコードまで／`prefetchStageImages`＝低優先・逐次1枚・デコードは描画時任せ・`navigator.connection.saveData`と2G相当では見送り）。タイトル待機中に「最初に始まるステージ」（続きからがあればその再開ステージ）を、プレイ開始5秒後に次ステージを先読みする。**先読みは常に1ステージ先まで**に留める（全6ステージ分は転送77MB／デコード後248MBあり、まとめて読むとモバイルのタブ用メモリ上限に触れる。内訳: stage1 8.1MB/31.5MB, stage2 15.9/41.3, stage3 6.3/20.2, stage4 13.5/35.9, stage5 3.9/12.6, stage6 29.5/107.0）。実測: タイトル待機6秒でstage1の6枚、stage1プレイ14秒でstage2の13/14枚を取得。あわせて `game.shop` 未設定でよろず屋の購入内容がセーブされず、「続きから」で `maxJumps` が 1 に潰れて二段跳び・韋駄天・剛力が消えていた不具合を修正（`continueGame` 冒頭で `shop.reset()` → セーブ内容で復元）。`continueGame` の動的 import に残っていた旧 `?v=` も統一。
    - **ゲート結果**: 決定性ゴールデン（Math.random 固定シード注入・時刻凍結・rAF停止・単発 render）で **PC 1920×1080 / iPad 1024×768 のタイトル＋全6ステージ 計14シーンがピクセル diff=0**。スマホ(852×393)は意図した変化のみ。実測値: iPhone15横 uiScale 1.319 / fontScale 1.832 / 四辺退避 15.9css-px、Android(915×412) 1.259 / 1.749 / 17.2css-px、iPad・PC は 1.0 / 1.0 / 0。

## 0. 結論

**「可視ワールド幅1280を恒久凍結し、プレゼンテーション層だけに可変スクリーン幅とその恒等ズームを導入する」**。

- `CANVAS_WIDTH = 1280` は **const のまま一切変更しない**。意味は「可視ワールド幅（ゲームプレイ窓）」。stage.js / enemy.js / boss.js / weapon.js / shadow.js / collision.js などワールド系ファイルは **0 diff**。
- 新設 `SCREEN_WIDTH`（キャンバス実論理幅）: 起動時に1回だけ `clamp(round(720 × 横長アスペクト / 2) × 2, 1280, 1600)` で確定（セッション固定・回転/リサイズで再計算しない）。
- 世界ズーム **z = SCREEN_WIDTH / 1280（恒等式・調整パラメータではない）**。これにより可視ワールド幅 = SCREEN_WIDTH / z ≡ 1280 が**構成的に**保証される。ボスアリーナ・出現位置・スポーン・索敵・カリング・Stage3圧殺・手裏剣消滅境界がバイト等価＝**端末別の難易度差（商用の禁忌）が原理的に発生しない**。
- 縦方向: 上部クロップ（最大144px）は休眠スタブ `this.cameraY` を配線した動的縦追従カメラで救済。
- HUD/パッドは物理サイズアンカー `uiScale` で 44pt / 18px 基準を充足（世界ズームとは独立に先行リリース可）。

3設計案（可変論理幅正攻法 / ビュー・ロジック分離カメラ / リスク最小段階構成）が独立にこの核（恒等式ズーム・セッション固定幅・下端アンカー+cameraY・save/restore均衡化の先行）へ収束し、審査3視点全員一致で本案が勝者。**この共通骨格からの逸脱（任意のズーム係数の導入等）は将来も避けること。**

## 1. 端末別の効果（試算）

| 端末 | SCREEN_WIDTH | z | 左右黒帯 | 世界の体感 | 備考 |
|---|---|---|---|---|---|
| iPhone 15 横 852×393 | 1560 | 1.219 | 77px×2 → **0** | プレイヤー約6.5mm → **7.9mm（+22%）** | 可視ワールド幅1280不変 |
| 21:9級 Android 932×430 | 1560 | 1.219 | → **0** | 約9.5mm | 真21:9(2.33)は1600クランプ・片側約2.4%帯は意図的仕様 |
| iPhone SE 横 667×375 | 1280 | 1.0 | 元々ほぼ0 | 世界は不変（uiScaleのみ改善） | 可視幅公平性の代償。正直な限界として明記 |
| iPad 4:3 | 1280（下限クランプ） | 1.0 | 上下帯は従来通り | **ビット単位で現状不変** | 回帰ゼロの基準端末 |
| PC 16:9 | 1280 | 1.0 | なし | 完全不変 | 非タッチは常に1280固定 |

## 2. アーキテクチャ

### 2.1 定数（js/constants.js）
- `CANVAS_WIDTH = 1280`（const 不変）に「可視ワールド幅（ゲームプレイ窓）」の正本コメントを付す。
- `export let SCREEN_WIDTH` を追加し、モジュール評価時に自己初期化（main.js → game.js の import 連鎖より先に評価される。`export const game = new Game()`（game.js:5326）や ShadowRenderer 640×360 オフスクリーン生成より前に確定させる）。
- **幅決定の情報源は screen.width/height（物理・回転不変）を正**とし、visualViewport はフォールバック限定（審査 mustFix: Safari の URL バー表示中の viewport 基準だとアスペクト2.5と誤認して1600へ誤クランプする）。
- ローカルストレージのキルスイッチ（`uon_wide_mode = '0'`）を最優先で読む（§5）。
- 規約: **スクリーン寸法は関数内で毎回参照。`const HALF_W = SCREEN_WIDTH/2` のようなモジュールスコープ派生定数は禁止**（let の凍結値バグ防止）。新規UIコードはスクリーン空間（SCREEN_WIDTH）のみ・中央凝集か端アンカーで書く。

### 2.2 世界ズームwrap（js/game.js renderPlaying）
- 前提: **save/restore 不均衡の先行修正（P0 必須）**。renderPlaying の save(5139) が関数内未復元で render() の restore(4708) が肩代わりし、shake 用 save(4577) が毎フレーム積み残る既存問題を先に均衡化。
- 世界パス 5140〜5211（stage.renderBackground / renderGround / Stage5階段 / 影 / スクロールtranslate内の全ワールドオブジェクト＋ダメージ数値）を自己完結の save/restore で包む:
  `ctx.translate(0, 720); ctx.scale(z, z); ctx.translate(0, -(720 - cameraDy))`
- デバイス座標黒クリア（5133-5137）は wrap 外。HUD（5216以降）と render() 側オーバーレイ（ビネット/フラッシュ/フェード/ポーズ）は全て wrap 外＝等倍。
- ダメージ数値は wrap 内＝z倍表示を仕様とする（敵と同率の拡大、スマホ可読性向上）。P2b ゲートで HUD とのサイズ体系を一度だけ官能確認。
- 既知リスク: floor(scrollX)×scale(z) の非整数合成でタイル継ぎ目に±1pxシームが出たら、wrap 内 translate を z 込みで丸めて対処。

### 2.3 縦追従カメラ cameraDy
- `target = clamp(crop + HEADROOM(≈90) - playerTopY_effective, 0, crop)`、crop = 720 - 720/z（z=1.219 で約130px）。
- **デッドバンド＋非対称平滑（上昇遅め・復帰速め、SmoothDamp系）**。三段ジャンプのたびに空中でリフトが発火して酔いを誘発しない設計（審査 mustFix）。リフトの主目的は stage4 屋根・stage5 階段の「接地した高所」。
- z=1 端末は可動域 0 で自動 no-op。cameraDy 最大時は現行構図そのものに退化するため高所でも必ず全要素が収まる。地面は groundY+800px まで塗られており下端露出なし（監査確認済み）。
- `prefers-reduced-motion: reduce` 検知時は「高所接地後にのみ段階リフト」へ切替（P4）。

### 2.4 プレゼン層リネーム（CANVAS_WIDTH → SCREEN_WIDTH）
- 対象はスクリーン空間のみ約131箇所: ui.js 97（全て関数内評価・トップレベル派生定数ゼロを監査確認済）、input.js 5、shop.js 6、game.js の表示/入力変換・全画面塗り・radialGradient・タッチ判定中央の約23箇所。
- **ワールド系（game.js のカメラ/クランプ/アリーナ/カリング18箇所と stage/enemy/boss/weapon 全部）は触らない。**
- リネーム漏れの失敗モードは「1280幅しか塗られないオーバーレイ」等の**目視で即発見できる良性バグ**に縮退する（これが本方式が逆方向リネームより安全な本質的理由）。
- ガード: scratch/ に「スクリーン系ファイルへの新規 CANVAS_WIDTH 参照を grep 検出して fail させる」スクリプトを整備。

### 2.5 UI個別修正（数値検証済みの崩れ4点のみ）
1. 昇段画面: `S = min(SCREEN_WIDTH/1920, 720/1080)`（ui.js:2192）→ 全端末 0.667 固定＝見た目完全不変。
2. タイトルロゴ: `drawW = min(0.78 × SCREEN_WIDTH, 1000)`（ui.js:342、難易度ボタンめり込み防止）。
3. 全画面背景5種（title/status/shop/opening/ending）: cover-crop ヘルパー（短辺フィット+中央クロップ）。非一様ストレッチ（月の楕円化）防止。アセットは1672×941実測でダウンサンプル側＝劣化なし。
4. ステータス画面右カラム: `rightColX = SCREEN_WIDTH - 440` の右端アンカー（ui.js:2008）。
- 「1280デザインバンド + designX」二重座標系は**不採用**（タップずれバグ族と恒久的な概念税の温床。エッジアンカー＋中央凝集＋上記4点で足りることを監査で確認済み）。万一 W=1600 で修復困難な画面が出た場合のみ、その画面だけ `translate((SCREEN_WIDTH-1280)/2, 0)` で局所退避する引き出しを温存。

### 2.6 uiScale（HUD/パッドの物理サイズアンカー）
- `uiScale = clamp(0.72 / fitScale, 1.0, 1.45)`（スマホ≈1.32、iPad/PC=1.0）。
- 根拠: 現状スマホで HUD 文字 13css-px（推奨18px割れ）・サブボタン41.5css-px径（44pt割れ）。
- **描画(ui.js)と判定(input.js)が単一の導出関数（例 getPadLayout()）を共有**。同じ clamp 式を両ファイルに複製する実装は禁止（審査 mustFix）。
- パッド拡大による世界の遮蔽増は透過度調整で補完。

### 2.7 セーフエリア/PWA
- index.html の viewport メタへ `viewport-fit=cover` 追加（実装済み。index.html:5。無いと iPhone 横向きで UA レターボックスが残り env() が全て0）。
- `env(safe-area-inset-*)` → CSS カスタムプロパティ → getComputedStyle → ÷fitScale で論理px換算 → 仮想パッド左右アンカー・BGMボタン・HUDパネル・進捗バーへ加算。
- **HTMLオーバーレイ（#sound-gate 等）にも `padding: max(既存値, env(safe-area-inset-*))` を追加**（起動フロー最初の1画面、露出率100%。欠落検査で発見）。
- **manifest.json を新規追加**: display:'standalone'、`orientation:'landscape'`、background_color:'#0f0f23'、icons。iOS 向け apple-mobile-web-app-capable / status-bar-style メタも追加。Android A2HS の standalone 化と回転ロックの根本手段（欠落検査 P1）。
- 既存の standalone 対応（syncContainerToViewport / getRenderRect の visualViewport offset 補正）は無修正で維持し、cover 化後の縦起動→横回転を実機回帰。
- レターボックス消滅で isTouchInCanvas が全域 true になるため、「タップで進む」系（touchJustPressed 消費側）にのみ画面端24論理pxのデッドゾーン。**仮想スティック（左端x=182）・ポーズ・BGM・攻撃ボタンの円判定には絶対に適用しない**（審査 mustFix）。

### 2.8 ポリシー決定事項
- **縦持ち**: 横持ち専用と割り切る。PLAYING 中に `matchMedia('(orientation: portrait)')` で #sound-gate と同型の「横向きにしてください」HTMLオーバーレイ＋自動ポーズ（欠落検査 P0。3案とも縦持ちで HUD が18%縮む問題を放置していた）。
- **端末判定**: 「可変幅+DPR1.5+パッド」の適用条件を `matchMedia('(pointer: coarse)')` ＋モバイルUA/画面短辺閾値の複合判定 `getDeviceProfile()` として constants.js に単一ソース化（現在4ファイルに同式が複製）。タッチ対応 Windows ノート/Surface が「タッチ端末」扱いで可変幅+DPR1.5になる誤分類を防ぐ（欠落検査 P1）。
- **回転・バックグラウンド**: PLAYING 中の document.hidden / orientationchange で自動 PAUSED（既存ポーズ機構流用、BGM 連動）。回転遷移の未知挙動を「止まった画面」に縮退させる保険（欠落検査 P1）。
- **キーボードラッチ**: input.js の hasPhysicalKeyboard は keydown で true になる片方向ラッチ（リセット無し）→ iPad+外付けキーボードで仮想パッドが永久消失する既存バグ。ゲーム操作系タッチ検知で false に戻す双方向化（欠落検査 P1）。
- **折りたたみ/Split View**: セッション固定幅のまま、起動時アスペクトとの乖離15%超が3秒継続したら PLAYING 以外の状態で「再読み込みで最適化できます」トーストを1回だけ表示（強制リロードは絶対にしない）。
- **ピンチズーム**: getRenderRect で visualViewport.scale≠1 の座標補正（数行）。iOS は maximum-scale を無視するため必須。

## 3. 実装フェーズ（各フェーズ単独リリース可能）

| フェーズ | 内容 | リスク |
|---|---|---|
| **P0 基盤衛生** | save/restore 不均衡修正・renderBossUI/renderProgressBar を stage.render(stage.js:2082/2104) から HUD 層(game.js:5217系)へ一本化（二重描画解消込み）・デッドコード削除（updateInputScale/setScale, castleCanvas）・getDeviceProfile() 単一ソース化・キーボードラッチ双方向化・getVisibleWorldBounds() 新設（weapon.js __previewViewWorldBounds の一般化＝将来 z を恒等式以外に振った時の保険）・RNG シードフック（?rngseed= 時のみ mulberry32 差替）または検証緩和の決定 | 極小（全て等価変換。ピクセルdiff=0で担保） |
| **P1 uiScale** | HUD 文字/バー・仮想パッド・BGM ボタンの物理サイズアンカー。**現状のレターボックスのままでも即商用価値** | 小 |
| **P2a 機械リネーム** | プレゼン層 CANVAS_WIDTH→SCREEN_WIDTH（=1280固定でリリース）。ピクセルdiff=0 ゲートで「リネームの正しさ」を可変化と分離して証明 | 小 |
| **P2b 可変幅+ズーム+cameraDy** | SCREEN_WIDTH 自己初期化・ズームwrap・縦追従・UI4点修正・端デッドゾーン・localStorage キルスイッチ・main.js ?v= bump。**フラグ限定公開**（既定 OFF） | 中（本丸。ただし挙動不変は恒等式で構成的保証） |
| **P3 既定ON の条件** | sky 補償（stage6 巨大月軌道下げ・stage5 天井帯/吊灯りシフト・雲上段 baseY・星 ny 再マップ）・viewport-fit=cover+セーフエリア・manifest.json・縦持ちオーバーレイ・回転オートポーズ。**ここまで完了して初めて既定 ON**（空の欠け・ノッチ帯を一般公開しない） | 中（絵作りの目視監修含む） |
| **P4 磨き** | 低スペック DPR 動的降格(1.5→1.25)・reduced-motion 対応・折りたたみトースト・ピンチズーム補正・静止ステート限定 DPR2.0 オプション（HUD 文字鮮鋭度） | 低 |

## 4. 検証計画（プロジェクト作法準拠）

- スクリプトは scratch/ に集約。preview は launch.json の 8779。**8080 には絶対に触れない**。
- **回帰の黄金律**: iPad(1024×768)/PC(1920×1080) で全6ステージ×主要ステート（PLAYING/ボス戦/タイトル/昇段/ステータス/ショップ）のゴールデンスクリーンショットを P0/P2a/P2b 各ゲートでピクセル diff=0 照合（z=1 端末は no-op が要件）。
- **可視幅恒等の実測**: 852×393 / 932×430 / 667×375 / 1024×768 / 1920×1080 エミュレーションで、画面左右端ピクセルからワールドXを逆算し可視ワールド幅=1280±1px を getImageData 実測（内部値照合 NG の作法準拠）。
- **挙動不変の証明**: W=1280 と W=1560 で同一シード・同一入力列リプレイ → scrollX/boss.x/スポーンx/ボス出現フレームのログ完全一致（P0 の RNG フック前提。フック見送り時は「乱数項を除く決定的基準値の一致」に正直に緩和して明記）。
- **縦追従の実測**: stage4 最上段屋根・stage5 階段頂上・三段ジャンプ apex・将軍プレイで頭頂ピクセルが常時画面内であることを getImageData で確認。
- **タッチ整合**: 合成タッチで仮想パッド全ボタン・BGM・昇段カード・ポーズ・ショップ行・タイトルボタンの発火を全解像度で全数確認。端デッドゾーンがスティック始動を殺していないこと。
- **環境アサーション**: 検証スクリプト冒頭で maxTouchPoints/devicePixelRatio/確定 SCREEN_WIDTH/z をログし、期待プロファイル不一致なら fail（hasTouch 設定忘れによる偽陰性防止）。
- **実機必須項目**（機械検証不能）: セーフエリア実値・standalone 縦起動→横回転・ピンチズーム・折りたたみ・cameraDy の官能チューニング・HUD 文字鮮鋭度・sky 補償の絵作り監修。
- **性能**: CPU 4x スロットルで stage1（竹6ストリップ）/stage4（瓦多重）/stage6（ボス演出）の60fps維持。ラスタ面積+22%はGPUフィルのみ（タイリングループ回数はワールド幅1280不変のため増えない）。DPR 降格パスの発火確認。
- **stage.render 検証手順の保全**: ボスUI移設で MEMORY の stage-bg-preview-verify 手順が変わるため、ズームwrap込みの手順書を scratch/ に更新。
- **キャッシュ規律**: リリース毎に main.js ?v= bump＋ハードリロード案内（無バージョン内部 import の新旧混在＝幅とズームの不一致事故対策）。

## 5. キルスイッチ

- `localStorage: uon_wide_mode = '0'` で SCREEN_WIDTH=1280 固定（旧動作）へ退避。constants.js の自己初期化が最優先で読む。
- URL パラメータ `?wide=0/1` は「そのセッションでフラグを書き換えるエントリポイント」（PWA standalone では URL を打てないため localStorage が正本。欠落検査 P0）。
- タイトルのデバッグコーナーかポーズ画面に「ワイド表示 ON/OFF（要再読み込み）」トグル。

## 6. 残存リスク（正直な限界）

- iPhone SE 級 16:9 端末では世界は拡大されない（z=1。可視幅公平性の代償）。改善は uiScale のみ。
- スマホの世界物理サイズ上限は iPad 比 0.72〜0.86 倍（7.9〜9.5mm vs 11.1mm）。画面が物理的に小さい以上これが本方式の上限（Brawl Stars 級 8〜10mm には到達）。
- 上部クロップにより地上戦闘中は空の演出が部分的に欠ける → P3 の sky 補償＋ステージごとの絵作り再監修が制作コストとして残る。
- cameraDy は本作初の縦カメラ挙動。官能調整（デッドバンド/平滑係数）の実機チューニングがリリースゲート。
- 真 21:9（2.33）は 1600 クランプで片側約 2.4% の帯が残る（視界無限拡大の防止線として意図的仕様）。
- CANVAS_WIDTH が「キャンバスの幅」でない命名負債 → 正本コメント＋grep ガード＋将来 VIEW_W 命名への段階移行で管理。
