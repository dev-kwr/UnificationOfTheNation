# Codex CLI で画像を生成する手順

コーディングエージェント(Claude Code など)から **OpenAI の画像モデルで画像を生成し、
リポジトリへ取り込む**までの手順書。この文書をそのままエージェントに渡して使える形で
書いてある。

検証環境: macOS / codex-cli 0.147.0 (2026-09 時点)

---

## 1. 仕組み

MCP でも API 直叩きでもない。**シェル越しの CLI 呼び出しが一本あるだけ。**

```
コーディングエージェント
   │  Bash で実行
   ▼
codex exec  ──────────► 組み込み image_gen ツール ──────► OpenAI 画像モデル
(OpenAI Codex CLI)      (imagegen スキル)                (既定＝その時点の最上位版)
   │                                                          │
   │                            ~/.codex/generated_images/<セッションid>/exec-*.png
   │                                                          │
   └──────────────► workspace へコピー ──► ./<出力パス>.png
```

- **Claude Code 自身に画像生成ツールは無い。** 画像を作るのは Codex CLI 側の
  組み込みスキル `imagegen`(`$CODEX_HOME/skills/.system/imagegen/`)。
- **API キーは要らない。** 組み込み `image_gen` は Codex のログイン
  (ChatGPT アカウント)をそのまま使う。この手順書は組み込みパスだけを扱う。
- Codex 自体はテキストモデルで動き、その道具として画像モデルを呼ぶ二段構え。
  だから「この寸法で」「この座標に収めて」といった細かい注文が効き、
  生成後に寸法や色をそれ自身に検算させられる。
- 用途は幅広く使える: 写真、イラスト、テクスチャ、アイコン、図版、
  UI/製品モックアップ、ロゴ案など。
  逆に **既存の SVG/ベクター資産の拡張や、単純な図形・ダイアグラムには向かない**
  (それらは SVG や HTML/CSS で直接作ったほうがよい)。

---

## 2. 前提の確認

```bash
codex --version                                  # => codex-cli 0.147.x
ls ~/.codex/skills/.system/imagegen/             # => SKILL.md references scripts ...
```

ログインしていなければ `codex login`(ブラウザが開く)。
`imagegen` スキルは Codex に同梱なので用意するものは無い。

---

## 3. 手順

### 3-1. プロンプトをファイルに書く

引数へ直書きしない。長くなるし、外したときに差分を取りたいので必ずファイルにする。

```bash
mkdir -p scratch
# scratch/NAME_prompt.txt に書く（型は §4）
```

### 3-2. バックグラウンドで走らせる

```bash
nohup codex exec -s workspace-write -C "$PWD" \
  "$(cat scratch/NAME_prompt.txt)" \
  < /dev/null > scratch/NAME.log 2>&1 &
```

| 部分 | 理由 |
| --- | --- |
| `-s workspace-write` | 作業ディレクトリ・`/tmp`・`$TMPDIR` だけ書き込み可。保存に必要な最小限 |
| `-C "$PWD"` | エージェントの作業根をここに固定する |
| `< /dev/null` | stdin を閉じる。開けたままだと入力待ちで止まる |
| `> ログ 2>&1` | **ログはファイルへ直書き。** `\| tail` などパイプを挟むとパイプごと kill されてログが残らない |
| `nohup ... &` | 数分かかるのでバックグラウンドへ |

複数同時に走らせてよい。セッションIDが別々に振られるので後で対応が取れる。

**`--ephemeral` は付けない。** セッションがディスクに残らず、3-4 の回収路が消える。

### 3-3. 完成を待つ

**`pgrep` / `ps` でプロセスの生死を見ない。** サンドボックス下では
`operation not permitted` になり「死んだ」と誤検知する。
**待つのはファイルの出現**にする。

```bash
until [ -f out/NAME.png ]; do sleep 5; done; echo done
```

生死をどうしても見たいときは `kill -0 <PID>`(サンドボックス外で)。

### 3-4. 取りこぼしを回収する

**「生成は成功しているのに指定パスに画像が無い」ことがある。**
Codex はまず `~/.codex/generated_images/` へ保存し、そのあと workspace へ
コピーする。この最終段の前にプロセスが静かに死ぬことがある
(ログにエラーは出ず、思考文の途中で切れる)。

```bash
ls -lat ~/.codex/generated_images/ | head        # 直近のセッションを探す
ls -la  ~/.codex/generated_images/<セッションid>/ # exec-*.png がある
cp ~/.codex/generated_images/<セッションid>/exec-*.png out/NAME.png
```

プロンプトとセッションは1対1なので、複数走らせていても時刻で対応が取れる。

### 3-5. 目で見て判定する

生成物を実際に開いて確認する。ここが一番回数を使う。

**注文と違う点を具体的に列挙してから**プロンプトを直す。
「なんとなく違う」で作り直すと同じものが出てくる。
差分が分かるよう、直したプロンプトは別ファイルに残す。

---

## 4. プロンプトの書き方

### 4-1. サイズの選び方

モデルは指定しない。組み込み `image_gen` も CLI も、**その時点で Codex が
最上位に置いているモデル**を既定で使う。バージョンを追いかけて書き換える必要は
無いし、古い名前を書き残す方が事故になる。いま何が既定かは次で分かる。

```bash
grep -n 'DEFAULT_MODEL' ~/.codex/skills/.system/imagegen/scripts/image_gen.py
```

既定モデルは `auto` か任意の `WIDTHxHEIGHT` を受け付ける。
**用途の縦横比に合わせて選ぶ**のが基本。

制約(下はいずれも既定モデルのもの。モデルが上がったら
`scripts/image_gen.py` の検証ロジックが正本):

- 最長辺 `<= 3840px`
- 両辺が `16px` の倍数
- 長辺:短辺の比が `3:1` 以内
- 総画素が `655,360` 以上 `8,294,400` 以下
- `2560x1440` の総画素を超える出力は experimental 扱い

よく使う値:

| 用途 | サイズ |
| --- | --- |
| 正方形(最速。下書き・反復向き) | `1024x1024` |
| 横長 | `1536x1024` |
| 縦長 | `1024x1536` |
| 2K 正方形 / ワイド | `2048x2048` / `2048x1152` |
| 4K 横 / 縦 | `3840x2160` / `2160x3840` |
| 指定しない | `auto` |

**正方形で作って後で切り詰める手もある。** プロンプトで座標を指定する場合
(「基準線は y = 980」など)、生成サイズを一つに固定しておくと座標の意味が
全画像で揃う。切り詰め前提なら最終的な縦横比は生成サイズと無関係になるので、
**3:1 を超える極端な縦横比**もこの方法でしか作れない。

### 4-2. 型

```
組み込みの画像生成ツール(imagegen)で次の画像を【新規に1枚】生成し、
<出力パス> として保存してください。
既存画像の編集ではなく、まっさらから描き起こすこと。
他のファイルは一切変更しないこと。git の操作もしないこと。

サイズ: <§4-1 で選ぶ>

内容: <一行で被写体。どこで何に使う画像かも書く>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要 その1 ― 形】
・<寸法比・輪郭・構造を数値で>
【最重要 その2 ― これは何であって何でないか】
・<読み違えやすい別物を名指しで禁止>
【最重要 その3 ― 色と密度】
・<彩度・描き込み量。既存素材との合わせ方>
【最重要 その4 ― 構図】
・<被写体を置く座標範囲。余白の扱い>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【背景】<単色/無地/specific。描いてほしくないものを名指しで>
【視点】<正面/斜め/俯瞰。パースを付けるかどうかまで書く>
【画風】<平塗り/写実/線画。輪郭線の有無まで書く>
【禁止】
・<具体物を10個くらい列挙>
```

### 4-3. コツ

- **「何を描かせないか」を厚く書く。** 何を描くかより効く。想定していなかった
  物が混ざるのは、ほぼ全部「禁止に書いていなかった」から。
- **数値で縛る。** 「低く横長に」ではなく
  「左右は x=60〜980、一番高い所でも y=560 より上へ出さない、幅は高さの2倍以上」。
- **座標で縛る。** 基準線を `y = 980` のように固定すると、複数の画像で位置が揃う。
- **視点は毎回明記する。** 何も言わないと斜めや俯瞰になりがち。
- **一度失敗した理由を本文に書き添える。** 「前に作ったものは彩度が高すぎて浮いた」の
  ように理由を添えると、同じ失敗を避けてくる。
- **1プロンプト1枚。** 「3種類まとめて」は破綻しやすい。並列に3本走らせる。
- **後工程で足せるものは描かせない。** 影・光・色調フィルタなど実装側で乗せるものが
  焼き込まれていると二重になる。
- **既存素材と密度を合わせる。** 「同じ画面の他の要素と同じ描き込み量に」と書く。
  1点だけ精細だと浮く。

---

## 5. 落とし穴

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| 生成成功のログなのに画像が無い | workspace へのコピー前にプロセスが静かに死ぬ | `~/.codex/generated_images/` から直接拾う |
| ログが空 | 起動時に `\| tail` などパイプを挟んだ | ログはファイルへ直書き(`> ログ 2>&1`) |
| ずっと止まっている | stdin が開いたまま | `< /dev/null` を付ける |
| 「死んだ」と誤判定する | サンドボックス内の `pgrep`/`ps` | ファイルの出現を `until` で待つ |
| 回収路が消える | `--ephemeral` を付けた | 画像生成では付けない |
| 想定外の物が混ざる | 禁止に書いていない | 【禁止】に具体物で列挙 |
| 視点が思ったものと違う | 視点の指定漏れ | 正面/斜め/俯瞰とパースの有無を毎回明記 |

### エージェントから起動する場合の追加注意

- `--dangerously-bypass-approvals-and-sandbox` は危険操作としてブロックされることがある。
  `--approve-for-me`(workspace-write サンドボックス下で承認を自動処理)を使う。
- **`-s/--sandbox` と `--approve-for-me` は併用できない。** どちらか一方。
- Claude Code から `--approve-for-me` で起動する場合、Bash 側も
  `dangerouslyDisableSandbox: true` が必要になる(二重サンドボックスで詰まる)。

---

## 6. 早見表

```bash
# プロンプトを書く
mkdir -p scratch && $EDITOR scratch/NAME_prompt.txt

# 走らせる
nohup codex exec -s workspace-write -C "$PWD" "$(cat scratch/NAME_prompt.txt)" \
  < /dev/null > scratch/NAME.log 2>&1 &

# 待つ
until [ -f out/NAME.png ]; do sleep 5; done; echo done

# 出てこなかったら回収
ls -lat ~/.codex/generated_images/ | head
cp ~/.codex/generated_images/<id>/exec-*.png out/NAME.png
```

---

## 付録: 透過が必要な場合

既定モデルは `background=transparent` に非対応(Codex 側が「透過は旧モデルへ
降格しないと出せない」と扱う)。降格は勝手にやらない約束になっているので、
透過が要るときはこちらで抜く。
透過が要る場合は **単色背景で生成してローカルで抜く**。

プロンプトで「被写体の外は全部純緑 `#00ff00`」と指定して生成し、色相で抜く。
**背景色は被写体に含まれない色を選ぶ**こと(緑の被写体ならマゼンタ `#ff00ff` など)。
黒背景＋輝度で抜くと暗い被写体まで一緒に消えるので使わない。

抜くスクリプト(Pillow のみ・numpy 不要):

```python
#!/usr/bin/env python3
"""緑(#00ff00)背景を透過へ抜く。 使い方: python3 dekey.py <入力> <出力> [--pad 4]"""
import sys
from PIL import Image

KEY_LOW, KEY_HIGH = 18, 56   # G が max(R,B) をこれだけ上回ったら背景とみなす

def dekey(src, dst, pad=4):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            excess = g - max(r, b)
            if excess <= KEY_LOW:
                continue
            if excess >= KEY_HIGH:
                px[x, y] = (0, 0, 0, 0)      # RGB も中和する(縮小時の緑滲み防止)
                continue
            t = (excess - KEY_LOW) / (KEY_HIGH - KEY_LOW)
            px[x, y] = (r, max(r, b), b, int(a * (1 - t)))   # 縁の緑かぶりを落とす
    bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        im = im.crop((max(0, x0 - pad), max(0, y0 - pad),
                      min(w, x1 + pad), min(h, y1 + pad)))
    im.save(dst)
    print(f'{dst}  {im.size}')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    pad = int(sys.argv[sys.argv.index('--pad') + 1]) if '--pad' in sys.argv else 4
    dekey(sys.argv[1], sys.argv[2], pad)
```

出力寸法は「被写体が占めていた矩形＋余白」なので毎回変わる。
決まった寸法に揃えたい場合はこの後に別途リサイズする。
