# 将軍統合プロジェクト 引き継ぎ資料（E3完了 → E4/E5 以降）

> このファイル単体＋コードベースで、別の担当者/AI が作業を継続できることを目的とした自己完結資料。
> 行番号は編集で前後するため、必ず `grep` で再特定すること（目印の文字列を併記してある）。

---

## 0. プロジェクトのゴール（不変・最重要）

### 何を目指すか
忍者・プレイヤー将軍・ラスボス将軍を **単一の `Player` 実装** に統合する。
将軍は「**スケールが違うだけの忍者**」であり、忍者と**同じ戦闘/描画/忍具/剣筋/物理コード**を共有する。
差分として許されるのは次の2つだけ:
- **`characterType`**（スケール=scaleMultiplier / 見た目=スキン・装備 / 数値=HP・攻撃力等のパラメータ差）
- **`brain`**（制御源: 人入力 `InputBrain` か AI `AIBrain` か）

### なぜ（動機）
現状は「プレイヤー将軍」と「ラスボス将軍(stage6)」と「忍者」で実装が分岐・二重管理になっており、
**将軍にだけ起きるバグ（剣筋/忍具のズレ・二重スケール・座標フレーム不一致など）が頻発**していた。
ユーザーの明確な要件は **「スケール感が違うだけで忍者と共通にしてくれないと二重管理」**。
つまりゴールは機能追加ではなく、**「将軍専用コードを無くすことで、将軍だけのバグが“原理的に”発生し得ない状態」**を作ること。

### 成功基準（これが満たされたら完了）
1. 将軍専用の「戦闘ロジック / 描画パス / 座標変換」が**コードベースに存在しない**（`characterType` による値差し替えのみ）。
2. 忍者の戦闘/描画/物理コードに手を入れると、**将軍にも自動的に同じ効果が及ぶ**（共通実装の証）。
3. ラスボス将軍も `Player` であり、違いは `brain=AIBrain` と `isEnemy` と数値だけ。`Shogun`(Boss)クラス・actor↔world変換は撤去済み。
4. 既存の忍者プレイは完全不変（回帰ゼロ）。`scaleMultiplier=1` の忍者で `getWorldWidth()===width` が成り立つ設計が保たれている。

### E4/E5 の設計判断は常にこの原則で決める
迷ったら「**それは将軍専用コードを増やすか／減らすか**」で判断する。
増やす方向（boss 独自の actor↔world を温存する等）は**ゴールに反する**。
減らす方向（boss も Player に寄せ、フレーム規約を素体40+getWorld に一本化する等）が正しい。
※E3 はこの原則で「境界でワールド化」を選び、プレイアブル将軍を忍者と同一コードパスに載せた。E4 も同じ精神で boss を Player へ寄せる。

---

## 1. 現在の Git 状態（重要）

| ブランチ/タグ | 指す先 | 意味 |
|---|---|---|
| `feat/shogun-unify` | `a773883` | **作業ブランチ**。E1〜E3 完了（座標フレーム一本化＋native再有効化）。ここで作業継続。 |
| `main` | `751a726` | 出荷想定・温存。**触らない**。 |
| `origin/main` | `f041154` | 別系統（more advanced line）。ローカル main と乖離。reconcile はユーザー判断。 |
| tag `backup/e3-on-main-b75f539` | `b75f539` | 後述の誤コミット退避（捨ててよいが念のため保全）。 |
| tag `backup/feat-shogun-unify-408a57a` | `408a57a` | E3 適用前の feat。 |

作業ツリーはクリーン。HEAD は `feat/shogun-unify`。

### ⚠️ 既知のハザード: main への自動コミット
E3 作業中、**本人が実行していない外部処理（自動コミット系のフック or 別セッション）が、作業中の差分を `main` に英語メッセージで勝手にコミットした**事象が発生した（`b75f539`、親が中間コミットより手前の `751a726` で成果欠落の破損状態だった）。
→ `main` を `751a726` に戻し、差分は cherry-pick で feat に正しく再構成して復旧済み。
**継続作業者は、想定外の `main` コミットが発生しうることを念頭に、こまめに `git status`/`git log` を確認すること。** `.claude/settings.local.json` に hook 設定がある可能性。

---

## 2. 採用アーキテクチャ:「境界でワールド化」（E3で確立。E4でも踏襲）

将軍 Player は `width=SHOGUN_ACTOR_BASE_WIDTH(40)`, `height=SHOGUN_ACTOR_BASE_HEIGHT(60)`, `scaleMultiplier=SHOGUN_SCALE(2.2)`。
- `this.width/height` は **素体フレーム**（忍者48x72 / 将軍40x60）を保持。
- 「実体の大きさ（ワールド寸法）」が要る箇所だけ **`getWorldWidth()/getWorldHeight()`（=素体×scaleMultiplier=88x132）** を読む。
- **忍者は `scaleMultiplier=1` なので `getWorldWidth()===width` で完全 no-op**（= 全置換が忍者に無影響という安全網。実機/プレビューで確認済み）。

### 追加ヘルパ（player.js、`getCombatSubWeapon` の直後あたり）
```js
getWorldWidth()  { return this.width  * (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1); }
getWorldHeight() { return this.height * (Number.isFinite(this.scaleMultiplier) ? this.scaleMultiplier : 1); }
getWorldCenterX(){ return this.x + this.getWorldWidth()  * 0.5; }
getWorldCenterY(){ return this.y + this.getWorldHeight() * 0.5; }
getWorldFootY()  { return this.y + this.getWorldHeight(); }
```

### ★最重要の落とし穴: in-model / out-of-model の二重性（武器描画）
`renderModel` は本体描画中に `this.width=drawW(48)` に詰め替え、`ctx.scale(scaleMultiplier)` で拡大する。その同じ文脈で **in-model 武器描画 `weapon.render(ctx, owner)` も呼ばれる**（spear/odachi 等。playerRenderer.js の `currentSubWeapon.render` / `odachi.render` 箇所）。
- **in-model**: 武器は素体(drawW=48)フレームで描き、ctx.scale が拡大を担う → owner 寸法は **生の `owner.width`** を使う。
- **out-of-model**（game.js の `currentSubWeapon.render(ctx, player)`、collision の getHitbox、spawn、update）: ctx.scale が無い → owner 寸法は **ワールド(88)** を使う。

これを `owner._inRenderModel` フラグで分岐:
- weapon.js のヘルパ `ownerWorldWidth/Height(o)`: `o._inRenderModel` が真なら生 `o.width/height`、偽なら `getWorldWidth/Height()`（無ければ生）。
- playerRenderer.js の in-model 武器描画箇所で、呼び出し直前に `owner._inRenderModel=true`、直後に復元（局所wrap。早期return漏れ回避のため関数全体ではなく局所で）。grep: `_inRenderModel`。

### `_renderShogunBodyNative`（playerRenderer.js、grep: `_renderShogunBodyNative`）
正本は **ELABORATE版**（`actorRenderX = savedX + (worldW - actorRenderW)*0.5` 等）。width=40化に伴い、actor を world箱(88x132)中心へ配置するため **`const worldW=this.getWorldWidth(); const worldH=this.getWorldHeight();` を temp詰め替え前に読んで** `actorFootGroundOffset / actorRenderX / actorRenderY` に使用するよう修正済み。
※ getWorld* は必ず `this.width=素体` の状態（renderModel 突入前）で読むこと。突入後は drawW で値が壊れる。

---

## 3. E1〜E3 で world化した箇所（参考・回帰時の確認先）

| ファイル | world化した内容 |
|---|---|
| player.js | helpers追加 / applyPhysics の接地・壁・足元 read&write / getHitbox / getFootX,Y / getHeightAboveGround / getShadowBaseRadius / getBaseAttackHitbox の state未指定fallback / 攻撃プロファイルstate(width,height) / ノックバック中心 |
| shogunCombatHelper.js | `initShogunInstances`: width=40/height=60/scale=2.2、接地 `p.y=groundY+LANE-p.getWorldHeight()`。controller の getHitbox/getAttackHitbox を world化。**E3b自動移行(`enableNativeShogun`)を shogunYawSkew計算の直後に再追加**（grep: `enableNativeShogun()`） |
| collision.js | `checkPlayerEnemyCollision` / `checkEnemyAttackHit` の playerRect を `getWorldWidth/Height`（メソッド有無ガード付き） |
| game.js | `player.width/height` を全て `player.getWorldWidth()/getWorldHeight()` に（spawn接地4箇所・カメラ中心・障害/スパイク当たり・分身state・エフェクト中心。`this.player.X` も含めリテラル一括置換） |
| enemy.js | `player.width/height`（間合い・距離・中心）を world化。`this.width`(敵自身)は不変 |
| boss.js | `player.width/height`（プレイヤー狙い5箇所）を world化。boss自身の `this.width` 等は不変 |
| stage.js | `playerProbe.width/height` を world化（ガード付き） |
| playerSpecial.js | 分身アンカー中心(`getWorldCenterX`)・smokeアンカー・`getSpecialCloneRenderBox` の owner寸法・`getSpecialCloneDrawY` の pivot・`_throwTransformPivotHeight`・分身コンボstate・ぶら下がりpivot 0.62 |
| playerSlashTrail.js | 本体トレイル中心・ポーズの `this.width/height` 全て world化（clone分岐の `PLAYER.WIDTH/HEIGHT` リテラルは据え置き） |
| playerRenderer.js | `_renderShogunBodyNative` の actor配置を world化 / in-model 武器描画を `_inRenderModel` で包む |
| weapon.js | 全 wielder 寸法読みを `ownerWorldWidth/Height(owner)` ヘルパ経由（先頭に helper定義） |
| character_preview.html | 中央寄せを `getWorldWidth()` に / `previewPlayerMock` に `getWorld*` アクセサ追加 |

---

## 4. 検証手段（重要: できること/できないこと）

### プレビューでできる静的検証
- `character_preview.html`: `window.__dbg.shogunPlayer` で将軍 Player を直接触れる。`shogunPlayer`/`ninja`/`shogun`(内部boss) が露出（E5で撤去予定の DEBUG-EXPOSE）。
- `index.html?stage=N`: デバッグ起動（game.js `getDebugStartStageFromUrl`、grep同名）。`?stage=6` で stage6。`window.game.startNewGame()` → `window.game.stage.spawnBoss()` でボス強制スポーン。
- 確認できたこと: 将軍 被弾箱=88x132 / 攻撃箱≈190〜233px(2.2倍) / 剣筋トレイル生成 / 忍具out-of-model描画 / 接地footY=groundY+LANE / **忍者 `getWorldWidth()===width`(no-op)** / 全 js `node --check` OK / コンソールerror無し。

### ヘッドレスで検証“できない”こと（＝実機 playtest 必須）
- 剣筋（連続フレーム蓄積でしか可視化されない）の見た目サイズ・位置。
- 武器の発火スケール/位置の最終的な見た目（特に大槍/火薬玉/大太刀）。
- ボスAIの攻撃パターン・難易度・歯ごたえ（E4で最重要）。
- カメラ追従/画面端/セーブ&ロード/被弾ノックバックの体感。

### 実機検証チェックリスト（ユーザーに依頼する項目）
将軍プレイ: 移動/ジャンプ/ダッシュ/しゃがみ・接地(沈み/浮き無し)・全6武器(発火/スケール/位置)・二刀Z・通常コンボ剣筋・奥義分身・被弾/ノックバック/ゲームオーバー・セーブ→ロード・カメラ・敵間合い。**忍者の全回帰**。

---

## 5. E3 で“あえて据え置いた”項目（実機チューニング送り）

1. **`_applyShogunSubWeaponScale` を撤去していない**（playerSpecial.js、grep同名）。
   理由: 分離型projectile(手裏剣/火薬玉)は detached で描画時に scale を掛けず baked radius に依存するため、撤去すると弾が縮む。大槍の二重スケール(range×2.2 と owner-world幅 の相互作用)是正は実機確認が必要。
2. **大太刀 着地点/衝撃波Y(#5)**: weapon.js `getPose` の pivot を world化して従来値温存。根治は renderModel の実 pivot(72×0.62=44.64)との不一致解消が要る＝実機要。
3. **native の防具非表示(#6)**: プレビュー btnHideArmor は内部boss(`shogun.hideShogunArmor`)を立てるが、**プレイヤーの `_drawShogun*`（shogunRendererHelper.js）は `hideShogunArmor` を読まない**。装飾(兜/草摺)スキップ実装が別途必要。`hideBodyParts`(renderModel option) は体シルエット非表示で別物なので混同注意。

---

## 6. ★E4: ラスボス(stage6)統合 — ターンキー仕様

### ゴール
stage6 ボスを **`Player(characterType='shogun', brain=createAIBrain(), isEnemy=true)` + enemy-adapter** にする。
`createBoss` の case6（boss.js、grep: `case 6`）が現在 `new Shogun(x,y,'boss',groundY)` を返す。これを置換。
最終的に `Shogun`(Boss)クラスと actor↔world 変換を解体（E5と連動）。

### ボスの「敵コントラクト」（game.js / stage.js が要求するインターフェース）
ボスは `stage.boss` に保持される（stage.js: `this.boss`, `this.bossSpawned`, `spawnBoss()`）。

| 要求 | 呼び出し側 | 必要なメソッド/プロパティ |
|---|---|---|
| 生成 | boss.js `createBoss(stageNumber,x,y,groundY)` case6 / stage.js `spawnBoss()` | コンストラクタ |
| 更新 | stage.js（grep: `this.boss.update`）`const shouldRemove = this.boss.update(deltaTime, player);` | `update(dt, player) -> bool(shouldRemove)` |
| 撃破→クリア | stage.js（grep: `!this.boss.isAlive`）`if (shouldRemove || !this.boss.isAlive){ ... bossDefeated=true; bossDefeatLingerTimer=... }` | `isAlive`（false で勝利判定） |
| 登場演出 | stage.js（grep: `this.boss.isEntering`）entranceTargetX へ左移動、終了で isEntering=false | `isEntering`, `entranceTargetX`, `entranceSpeed`, `facingRight`, `vx`, `isAttacking`, `attackCooldown` |
| 接地補正 | game.js（grep: `this.stage.boss.groundY`）`boss.groundY = stage.getStairGroundY(boss.x + boss.width/2)` | `x`,`width`,`groundY` |
| 本体描画 | game.js renderPlaying（grep: `boss.render(ctx)`）`this.stage.boss.render(ctx)` | `render(ctx)` |
| HPバー等UI | game.js（grep: `renderBossUI`）`this.stage.renderBossUI(ctx)`（stage.js 内で boss.hp 等参照） | `hp`, 最大HP相当 |
| BGM | game.js（grep: `this.stage.boss ? 'boss'`） | boss存在フラグ |
| プレイヤー攻撃→被弾 | collision.checkPlayerAttackHit / game.js（grep: `isBossEnemy`＝`enemy===this.stage.boss`） | `getHitbox()`, `takeDamage(dmg, player, attackData)`, `incomingDamageScale` |
| ボス攻撃→プレイヤー被弾 | collision.checkEnemyAttackHit | `getAttackHitbox()`（配列可）。忍具は `getSubWeaponHitbox()` |
| 接触ダメージ | game.js（grep: `isBossEnemy(enemy)` の contactDamage） | 接触判定 |

### 現状 Shogun ボスの構造（boss.js）
- `class Shogun extends Boss`（grep: `class Shogun`）、`Boss extends Enemy`（boss.js `class Boss`）、`Enemy`（enemy.js）。
- init（grep: `init()` near class Shogun）: `scaleMultiplier=2.2`, `hp=4500`, `incomingDamageScale=0.55`, `attackRange=120*2.2`, **`actorBaseWidth/Height=40/60`、`width=88/height=132`**、`this.actor`（actorフレームの描画用サブオブジェクト）。
  → **注意: ボスは width=88(world保持) + actorBase=40 + actor サブオブジェクト方式**。プレイアブル将軍(E3)は width=40(素体保持) + getWorld*。**フレーム規約が逆**。E4 はどちらかに寄せて統合する設計判断が必要。
- 主要override: `update`(grep同名, AI/サブ技/actor座標計算), `getAttackHitbox`, `getSubWeaponHitbox`, `transformActorHitboxToWorld`(actor→world箱変換), `render`, `renderBody`(兜/角/鎧/胴。**boss.js内に独自の `_drawShogun*` を持つ**＝shogunRendererHelper.js のプレイヤー版と二重), `takeDamage`(Boss継承)。
- `_subWeaponInstances`(odachi/kusarigama/…), `_subWeaponKey`, `_subTimer`, `_attackTimer`, `applyScaleToSubWeapons`。

### brain 抽象（shogunBrains.js）
```js
createAIBrain():   { kind:'ai',    tick(self, dt, ctx){ self.updateAI && self.updateAI(dt, ctx.player); } }
createInputBrain():{ kind:'input', tick(self, dt, ctx){ ctx.player.handleInput && ctx.player.handleInput(); } }
```
`Enemy.update`（enemy.js、grep: `this.brain && this.brain.kind === 'ai'`）が `this.brain.tick(this, dt, {player})` を呼ぶ。
→ **ただし Shogun は `update` を override しており、AI は自前ロジック。** E4 では「AI将軍 Player」が `updateAI` 相当を持つ必要がある（既存 Shogun.updateAI を移植 or Player に AIブレイン用の意図入力経路を作る）。

### E4 の主要ギャップと設計判断ポイント
1. **フレーム規約の統一**: ボス(width=88+actor) と プレイアブル(width=40+getWorld) のどちらに合わせるか。推奨は **プレイアブルに合わせて width=40/getWorld 化**（＝真の一本化）。その場合ボスの actor↔world変換は不要化できる。
2. **AIの移植**: Shogun の攻撃選択/フェーズ/間合い AI を、Player を駆動する `updateAI(dt, player)` 相当として実装（createAIBrain がこれを呼ぶ）。プレイアブルの `handleInput` がやっている「攻撃/忍具/移動の発火」を、AI が意図として出す形に。
3. **enemy-adapter**: HPバー描画 / entrance / `isAlive`→勝利 / `incomingDamageScale` / 接触ダメージ を Player に被せる薄いラッパ（または Player に `isEnemy` 経路を足す）。
4. **被弾方向の反転**: プレイアブルは Player が攻撃側・敵が被弾側。敵将軍では Player(将軍)が被弾側・プレイヤー(忍者)が攻撃側。`getHitbox`(被弾箱) と `getAttackHitbox`(攻撃箱) の両方が機能する必要。E3 で被弾箱(getHitbox=world 88x132)・攻撃箱(getBaseAttackHitbox)は既に world で動く。

### E4 検証
1. `index.html?stage=6` → `startNewGame()` → `stage.spawnBoss()` で **スポーン/描画/`boss.update(1/60,player)`数フレームがクラッシュしないこと**を静的確認（評価例は本資料末尾）。
2. **AI挙動・バランス・撃破→勝利フローはユーザーが stage6 を実プレイして確認**（必須）。
3. 増分ごとにコミット推奨（最終ボスなので巻き戻し可能性を確保）。

---

## 7. E5: 残骸の撤去（E4後）

- `transformActorHitboxToWorld` / `getActorSpaceState` / `getThrowOwnerState` / `applyScaleToSubWeapons` / `_shogunBossInstance`（プレイアブル側の残骸。native では未使用）/ ボスの actor サブオブジェクト方式 を削除。
- boss.js 内の独自 `_drawShogun*` を shogunRendererHelper.js のプレイヤー版に一本化。
- **character_preview.html の `[DEBUG-EXPOSE] window.__dbg = {...}` 行を撤去**（grep: `__dbg`）。

---

## 8. すぐ使える検証スニペット（プレビュー devtools / preview_eval）

ステージ6 ボス スポーン＆無クラッシュ確認:
```js
const g = window.game; g.startNewGame();
const st = g.stage; if(!st.bossSpawned) st.spawnBoss();
const b = st.boss; const p = g.player;
for (let i=0;i<10;i++) b.update(1/60, p);
({cls:b.constructor.name, w:b.width, h:b.height, hp:b.hp, alive:b.isAlive,
  entering:b.isEntering, attackBoxes:(b.getAttackHitbox()||[]).length});
```

将軍プレイヤー（プレビュー）状態確認:
```js
const sp = window.__dbg.shogunPlayer;
({w:sp.width, h:sp.height, scale:sp.scaleMultiplier, worldW:sp.getWorldWidth(),
  worldH:sp.getWorldHeight(), native:sp._nativeShogun, footY:sp.getWorldFootY()});
```

忍者 no-op 確認（回帰の安全網）:
```js
const nj = window.__dbg.ninja; // または index.html で g.player
(nj.getWorldWidth()===nj.width && nj.getWorldHeight()===nj.height); // true であること
```

全 js 構文チェック:
```bash
for f in js/*.js; do node --check "$f" || echo "ERR $f"; done
```

---

## 9. 元プラン（詳細な実装記録）

本資料は `~/.claude/plans/swirling-knitting-rabbit.md`（Claude のプラン領域・リポジトリ外）の内容を引き継ぎ用に再編したもの。
プロジェクトメモリ: `~/.claude/projects/.../memory/shogun-unification-goal.md`（方針）。
別 AI はこれらにアクセスできない前提なので、**本ファイル＋コードが正本**。
