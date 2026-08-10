# ステージセレクト計画

クリア後に「即ステータス画面」ではなく、全体マップからステージを選ぶ画面を挟む。
ステータス画面(忍具/よろず屋/準備完了)は**ステージを選んだ後・開始前**に出す。

## 遷移(新)

```
ボス撃破 ─ 突破演出(STAGE_CLEAR Phase0)
        └ タップ → ステージセレクト(STAGE_SELECT) ← 新設。マップ上でノードを選ぶ
                 └ 決定 → ステータス画面(STAGE_CLEAR Phase1。選択ステージを保持)
                        └ 準備完了 → 選んだステージを開始
タイトル「続きから」→ ステージセレクト(セーブの進行を復元して入る)
Stage6クリア → 従来どおりゲームクリア演出/エンディング(セレクトは挟まない)
```

- 解放規則: `選べる範囲 = 1 .. min(6, maxClearedStage + 1)`。全クリア済み(isGameCleared)は常に全解放。
- クリア済みステージは何度でも再挑戦できる(小判/経験値稼ぎ)。
- 「最初から」は従来どおり Stage1 直行(セレクトを挟まない)。

## セーブ拡張

`progress.maxClearedStage` を追加(version は 1 のまま・後方互換)。
旧セーブは `currentStage - 1` を maxClearedStage とみなして読む。
保存タイミングは従来と同じ(ステージクリア時)。

## フェーズ分け

### フェーズ1(実装中): セレクト画面の骨格
- `js/stageSelect.js` 新設
  - `WORLD_MAP_NODES`: ノード定義(id / kind:'main'|'bonus'|'training' / u,v=画像内比率 / 名前)
  - `getStageSelectLayout()`: 画像の cover 変換とノード画面座標の**単一導出**(描画とタップ判定が共有)
  - `renderStageSelect()`: マップ画像(`images/world_map.png`、無ければ和紙風フォールバック描画)+経路+ノード+選択カード
- game.js: `GAME_STATE.STAGE_SELECT`、`updateStageSelect`(←→/タップ選択、CONFIRM/再タップ決定)、
  Phase0→セレクト遷移、`pendingStageSelection`、準備完了で選択ステージ開始、続きから→セレクト
- ボーナス/修行ノードは**データだけ定義して非表示**(kind で出し分け)

### フェーズ2: ボーナス/修行ステージ — 実装済み(2026-08-10)
- **ボーナス(小判蔵)** `js/bonusStage.js` — Stage 互換の軽量クラスを
  `game.stage` に差して PLAYING ループをそのまま使う(敵ゼロ・isCleared()常false)。
  小判(1枚=KOBAN_VALUE両)を拾い、右端の蔵の扉で終了→セレクトへ戻る。
  本編の進行(currentStageNumber/maxClearedStage)には一切触れない。
  解放: Stage2 クリア後(isGameCleared でも解放)。
  - **アスレチック**: 木箱スタック(1〜3段)の一方通行足場を `getPlatformColliders()`
    (game.updatePlaying の extraColliders 汎用フック)で提供。上ルートに高所小判と
    千両箱(+CHEST_VALUE両)。地上を走り抜けるだけでも最低限は拾える二層構造。
  - **補充制**: 踏破すると `game.bonusAvailable=false`(セーブ progress.bonusAvailable)。
    本編ステージをどこかクリアすると true に戻る(handleStageClear)。空の間はセレクトの
    「両」ノードが灰色・選択不可、カードは「小判蔵　空（踏破で補充）」。
  - 画像: bg/床/扉/木箱 = images/bonus_kura_{bg,floor,door,crate}.png(Codex imagegen)。
    床はミラータイル(偶奇反転)で継ぎ目を消す。開始時は本編と同じ暗幕待ち機構
    (pendingStageStart={side:'bonus'})。読めない環境はコード描画へフォールバック。
- **修行(道場)** `js/trainingStage.js` — 同じ Stage 互換方式の固定画面アリーナ
  (maxProgress=CANVAS_WIDTH, scrollX=0)。敵(createEnemy 製)が波状に湧き、
  全滅→一拍→次ウェーブ。回を重ねると数と質が上がり、5の倍数ウェーブは武将入り。
  撃破報酬(expGem/小判/ゲージ)は本編と同じ game 側処理(getAllEnemies 経由)。
  離脱: 左端の戸の前に立ち続ける(EXIT_HOLD_SEC=0.6s、円弧ゲージ表示)→セレクトへ。
  解放: Stage3 クリア後。背景: images/training_dojo_bg.png(床焼き込み一枚絵、
  FLOOR_LINE_V で床境界をワールド地平線に合わせる)。BGM は山道(stage3)流用。
- セレクトから入る際もステータス画面(装備確認)を挟む(実装済みの共通フロー)。

### フェーズ3: 磨き
- GPT-images 生成マップへの差し替え+ノード座標(u,v)の微調整
- 現在地マーカーの移動アニメ、クリア済みの朱印、解放時の「道が延びる」演出
- ボーナス/修行の報酬バランス調整

## マップ画像の運用

- 生成指示は `map_generation_prompt.md`(このリポジトリ直下)。
- 置き場所: `images/world_map.png`。**ファイルを置くだけで自動で使われる**(無い間はフォールバック描画)。
- ノード座標は画像内比率(u,v)で `js/stageSelect.js` の `WORLD_MAP_NODES` に持つ。
  画像を差し替えたら u,v を目視で微調整する(cover 変換は共通関数が吸収するので座標系は画像基準のまま)。
- 自動生成の補助: `tools/generate-worldmap.mjs`(OPENAI_API_KEY 環境変数があれば
  `node tools/generate-worldmap.mjs` で gpt-image-1 から直接 `images/world_map.png` を生成)。
  配信物からは除外される(tools/ はデプロイ対象外)。
