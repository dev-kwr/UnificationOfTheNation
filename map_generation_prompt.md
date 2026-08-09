# 全体マップ画像の生成指示(GPT-images 用)

ステージセレクト画面の背景に使う「日本全土風の道行き絵巻マップ」。
生成したら `images/world_map.png` に置くだけで反映される(コード変更不要)。

## 技術要件

- **サイズ: 1536x1024**(gpt-image-1 の横長)。ゲーム側は cover 描画で 16:9〜19.5:9 に切り出すため、
  **上下それぞれ 15% は切れても困らない余白**にする(重要な要素を置かない)。
- **文字・ラベルは一切入れない**(ステージ名やUIはゲーム側で重ねる。生成文字は崩れるため)。
- 各ステージのランドマークは**遠目でも区別できるシルエット**にする(上にゲーム側でノード印を重ねる)。

## トーン

- 和風の絵巻/古地図。和紙の質感、墨の輪郭、藍(紺)基調に金のアクセント。
- 夜〜宵の空気(タイトル画面の「月夜・藍・金」と同じトンマナ)。
- 描き込みは中景まで。写実にしすぎず、ゲームUIが上に載っても読める落ち着いたコントラスト。

## 構図(左下 → 右上へ登る道行き)

一本の街道が左下から右上へ蛇行して続き、途中に6つのランドマーク+脇道2つ。
おおよその配置(u=横 0..1 / v=縦 0..1、画像内比率):

| # | ランドマーク | u | v | 内容 |
|---|---|---|---|---|
| 1 | 竹林 | 0.10 | 0.72 | 月明かりの竹やぶ |
| 2 | 街道 | 0.26 | 0.55 | 茅葺きの宿場・街道筋 |
| 3 | 山道 | 0.42 | 0.38 | 山越えの峠道・杉 |
| 4 | 城下町 | 0.60 | 0.52 | 瓦屋根の町並み |
| 5 | 城内 | 0.76 | 0.40 | 城壁・石垣・門 |
| 6 | 天守閣 | 0.88 | 0.28 | 山上の天守(最終目的地。月を背負う) |
| B | 脇道: 蔵 | 0.34 | 0.68 | 小判蔵・鳥居の脇道(ボーナス) |
| T | 脇道: 道場 | 0.52 | 0.25 | 山中の道場・滝(修行) |

- 道は 1→6 を繋ぐ主街道と、B/T へ分かれる短い脇道。
- 6(天守閣)がいちばん高い位置で、空に満月。

## そのまま貼れるプロンプト

```
和風ゲームのステージセレクト用「全体マップ」を1枚。横長 1536x1024。
夜の日本を描いた絵巻風の古地図。和紙の質感、墨の輪郭線、藍色基調に金のアクセント、落ち着いた水彩。
一本の街道が左下から右上へ蛇行し、途中に次のランドマークを配置:
(1) 左下: 月明かりの竹林 (2) その先: 茅葺き屋根の宿場町 (3) 中央左上: 杉の峠道
(4) 中央右: 瓦屋根の城下町 (5) その上: 石垣と城門 (6) 右上: 山上の天守閣、背後に大きな満月。
脇道が2本: 竹林と峠の間から下がった先に小さな小判蔵と鳥居、峠の上に滝のそばの道場。
文字・ラベル・枠・UIは一切描かない。画面の上下15%は空や霞だけにして重要な要素を置かない。
ゲームUIを上に重ねるため、全体のコントラストは控えめに。
```

英語版(精度が出ない場合):

```
A single wide 1536x1024 stage-select world map for a Japanese ninja action game.
Emaki-scroll style antique map of Japan at night: washi paper texture, sumi-ink outlines,
indigo-blue palette with gold accents, muted watercolor. One winding road climbs from
bottom-left to top-right passing: (1) moonlit bamboo grove, (2) thatched post town,
(3) cedar mountain pass, (4) castle town with tiled roofs, (5) stone walls and a gate,
(6) hilltop castle keep with a large full moon behind it. Two short side paths:
a small koban treasure storehouse with a torii below the road, and a waterfall dojo above the pass.
Absolutely no text, no labels, no borders, no UI. Keep the top and bottom 15% as sky/mist only.
Subdued contrast so game UI can be layered on top.
```

## 生成後の手順

1. `images/world_map.png` として保存(上書きでよい)。
2. ゲームを起動してセレクト画面を確認。ノード位置が絵とずれていたら
   `js/stageSelect.js` の `WORLD_MAP_NODES` の u,v を微調整(画像内比率なので画像サイズ変更にも耐える)。

## API で自動生成する場合(任意)

OpenAI の課金アカウントと API キーが必要。

```bash
OPENAI_API_KEY=sk-... node tools/generate-worldmap.mjs
```

`images/world_map.png` に直接保存される。プロンプトはスクリプト内(このファイルと同文)。
