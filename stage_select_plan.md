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

### フェーズ2: ボーナス/修行ステージ
- **ボーナス(小判蔵): 実装済み(2026-08-10)。** `js/bonusStage.js` — Stage 互換の軽量クラスを
  `game.stage` に差して PLAYING ループをそのまま使う(敵ゼロ・isCleared()常false)。
  小判26枚(1枚=KOBAN_VALUE両)を拾い、右端の蔵の扉で終了→セレクトへ戻る。
  本編の進行(currentStageNumber/maxClearedStage)には一切触れない。
  解放: Stage2 クリア後(isGameCleared でも解放)。再入場可。
  背景: images/bonus_kura_bg.png(Codex imagegen 生成)。開始時は本編と同じ暗幕待ち機構
  (pendingStageStart.bonus)に乗せてフラッシングを防ぐ。
- 修行(道場): 未実装。敵が波状に湧く固定アリーナ。任意離脱(ポーズから「切り上げる」)。
  経験値・熟練稼ぎ。解放: Stage3 クリア後。BonusStage と同じ「Stage互換の軽量クラス」方式で作る。
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
