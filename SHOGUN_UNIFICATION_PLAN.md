# 将軍／忍者 統合・共通化 — 依存マップ & 安全手順書

目的: ninja と shogun（プレイヤー・ボス）を「**相対的共通仕様**」に統合し、`characterType==='shogun'` 分岐と二重管理を解消する。本書は**着手前のレビュー用**。実装は本書の段階順に、各段で検証・ロールバック可能な単位で行う。

---

## 0. 現状アーキテクチャ（3層 + 状態同期）

```
[ステージ6ボス]   createBoss(6) → new Shogun(...)               (boss.js)
                    └─ this.actor = new Player(characterType='shogun')   ← 描画/ポーズ/剣筋の実計算

[プレイアブル将軍] game.player = new Player(characterType='shogun')        (player.js)
                    └─ applyShogunCombat(player)                          (shogunCombatHelper.js)
                         └─ player._shogunBossInstance = new Shogun(...)  ← 戦闘/描画を委譲
                              └─ (その)actor = new Player('shogun')        ← さらに内側のPlayer
```

- **二重(三重)管理**: プレイアブル将軍 = Player殻 + 内部Shogunボス + ボスのactor(Player)。毎フレーム位置・速度・攻撃状態・進行度・サブ武器を相互同期。
- 描画は `player._renderShogunBody → boss.renderBody(ctx)` で共有済み（playerRenderer.js:762）。

---

## 1. 依存マップ（ファイル別・全箇所）

### 1-A. スケール体系（boss.js）— **最も相互依存が強く危険**
| 項目 | 値/式 | 行 |
|---|---|---|
| `SHOGUN_SCALE` | 2.2 | 13 |
| `scaleMultiplier` | = 2.2 | 1229 |
| `actorBaseWidth/Height` | 40 / 60 | 1247-1248 |
| `width/height` | actorBase × 2.2 = 88 / 132 | 1249-1250 |
| `attackRange` | 120 × 2.2 | 1243 |
| サブ武器 range 逆補正 | `range / scaleMultiplier` | 1639, 3094-3102 |
| `actorFootGroundOffset` | `height*0.38 − (PLAYER.HEIGHT − actorRenderH*0.62)*renderScale` ≈ −26.4 | renderBody 3030 |
| 剣筋 per-sample投影 | `projectTrailPointsToRenderSpace`（×renderScale、pivot=actor原点+actorH*0.62） | 3273+ |
| `getActorGroundYForRenderScale` 等 | renderScale 依存 | 1360, 1372, 1425, 1452, 1566, 1588, 1835 |

**ポーズ寸法強制（48×72）の意味**: `getComboSwordPoseState`/各buildでshogunを48×72に強制（後述1-C）。これは **刀本体(sword)と剣筋(trail)を同じ48×72ポーズ空間に揃えるため**。actorBaseは40×60だが、ポーズは48×72。→ 「sword=trail一致」は保たれるが、ポーズ空間(48×72)とボディ(40×60)が不一致。

> ⚠️ `scaleMultiplier(2.2)` を変えると attackRange / width / height / サブ武器range / 全projection / groundY が連鎖的にズレる。**単独変更不可**。

### 1-B. shogunCombatHelper.js（プレイアブル委譲の実体）
- 生成: `player._shogunBossInstance = new Shogun(...)` (229)
- override: `update`(776) / `handleInput`(391) / `attack`(746) / `bufferNextAttack`(755) / `useSubWeapon`(760) / `getAttackHitbox`(718) / `getHitbox`(906) / `currentSubWeapon` getter(305) / `updateAttack`・`updateSubWeaponAttack` 無効化(377,382)
- 同期(双方向): 位置/速度/接地 `boss.x/y/vx/vy/isGrounded ⇄ player`（559-561, 605-607, 667-670, 824-831, 853-857 付近）
- 同期(計算): `syncShogunProgression`(145) / `syncShogunSubWeaponCalculation`(93) / `syncShogunDualMainSpeed`(70)
- 初期化: `initShogunInstances`(217) が player.width/height/speed/y を将軍値に設定

### 1-C. playerSlashTrail.js（剣筋/ポーズの characterType 分岐）
| 行 | 内容 | 分類 |
|---|---|---|
| 517 / 647 / 762 / 901 | width=48,height=72 **強制**（step2/step4/step5/getComboSwordPoseState） | **スケール（sword=trail一致用）** |
| 1772（updateSpecialCloneSlashTrails） | poseWidth=PLAYER.WIDTH, poseHeight=PLAYER.HEIGHT 強制 | スケール |
| 774(step5) | `scale = height/72`（共通化済み） | 済 |
| 151 | shogunは固定カーブ点を使わない | 論理 |
| 1373 | `keepExistingPointStable`（将軍は常にtrue） | 論理 |
| 1406 | shogunは固定カーブ生成skip | 論理 |
| 347 | 特殊クローン body slot 判定 | 論理 |
| 877 | `isShogun`（step5、未使用に近い） | 論理（ほぼdead） |
| 1767 / 1969 | （クローン剣筋関連） | 論理 |
| 2885 / 3004 | step3 trimEndCap（shogun） | 描画（要共通化） |
| 2871 / 2876 / 2922 | step2 trimEndCap → **共通ルール化済み**（stripStep===2） | 済 |

### 1-D. playerRenderer.js
- 648: `_renderShogunBody` 呼び出し（プレイアブル将軍の本体描画）
- 733 / 811: renderModel の shogunパーツ差し替え（鎧）+ headScale/hipLift 等
- `_renderShogunBody`(762): `boss.renderBody(ctx)` へ委譲

### 1-E. player.js / playerSpecial.js
- player.js 1684 / 1728: しゃがみ時の height 変更を将軍は無効化
- player.js 2180: クラウチ強度 `shogun?0.35:0.22`
- playerSpecial.js 1152 / 1169: 奥義（分身）の将軍分岐

### 1-F. game.js（キャラ選択・スケール）
- 267 / 621 / 1209-1210: characterType='shogun' 設定（クリア後 or デバッグ）
- 4416: `characterScale = shogun?1.2:1.0`（カメラ/UI?）
- 4681 / 4701: 描画分岐（将軍の剣筋は boss.renderBody 側）

---

## 2. スケール相互依存（なぜ段階実施が必須か）

```
scaleMultiplier(2.2) ── width/height(88/132)
        │                     │
        ├── attackRange       ├── actorFootGroundOffset(−26.4)
        ├── subWeapon range   ├── projectTrail(×2.2, pivot=…0.62)
        └── getActorGroundY   └── renderModel scale

pose強制(48×72) ── sword(getComboSwordPoseState) ┐ 両者を48×72に
                └── trail(各build/updateClone)   ┘ 揃えて一致させている
```

- `2.2` も `48×72` も**複数系統が前提**にしている。1点だけ変えると sword と trail、ヒットボックス、地面合わせ、サブ武器が個別にズレる（本セッションで頻発した「片方直すと別が崩れる」の正体）。
- よって「相対共通仕様」への移行は、**単一の相対スケールに集約**しつつ、依存系統を同時に追従させる必要がある。

---

## 3. 統合ゴール（相対共通仕様）

- ninja と shogun は **同一の式・同一のポーズ空間**を使い、差は**ただ1つの相対スケール**のみ。
- `characterType==='shogun'` 分岐ゼロ（パーツ描画の差し替えのみオプションで許容）。
- プレイアブル将軍は内部ボスを生成せず、shogunロジックを**自身に適用**。ステージ6ボスは薄いEnemyラッパで同一ロジックを駆動。

**到達形の候補（Stage2で確定）**
- 案A: ボディも pose も **48×72ベース**に統一し、相対スケール = `height/PLAYER.HEIGHT (=132/72≈1.833)`。`scaleMultiplier`概念を相対スケールに一本化。→ 将軍 = 忍者×1.833 の純粋拡大。48×72強制が不要化。
- 案B: pose も含め **40×60ベース**に統一（`scale=height/36`が自然追従）、相対スケール=2.2維持。→ sword/trailが40×60基準に縮む（現状比 ≈0.83×）。

> どちらも**刀の見た目サイズが変わる**ため要承認。案Aは「忍者の完成形をそのまま拡大」で最も素直。

---

## 4. 安全な段階手順書

各段の完了条件: **忍者（全コンボ1-5・全サブ武器・奥義）が不変** かつ **将軍（ボス戦＋プレイアブル）が破綻しない**ことを no-cache プレビューで目視確認。各段は独立コミット＝ロールバック可能。

### Stage 0 — 検証環境（前提・済/即）
- ESモジュールキャッシュ対策（no-cacheサーバ or DevTools Disable cache）。これ無しでは全検証が無効。

### Stage 1 — trail/pose の「論理」分岐の共通化（低リスク）
- 対象: playerSlashTrail.js の **スケールを変えない**分岐（151, 1373, 1406, 347, 877, 1767, 1969, 2885, 3004）。
- 方針: `characterType==='shogun'` を `options.xxx` 駆動 or 「step依存の共通ルール」に置換（trimEndCapで実証済みの方式）。
- 検証: 忍者・将軍の各コンボで剣筋形状が不変か。
- 非対象: 48×72強制（517/647/762/901/1772）は sword=trail一致に必須なので Stage 3 まで保留。

### Stage 2 — スケール体系の単一ソース化（中リスク・要承認）
- 案A/案B を決定（刀サイズ変化を承認後）。
- 単一の相対スケール `S` を定義し、attackRange / width / height / サブ武器range / projection / groundY / footOffset を `S` から導出。`SHOGUN_SCALE` 直書きを排除。
- 48×72強制を撤去し、pose も `S` で駆動（sword と trail が同一寸法・同一スケールで自動一致）。
- 検証: 刀と剣筋の一致、ヒットボックス、地面足元、全サブ武器の見た目・判定。

### Stage 3 — player/boss 将軍の一本化（高リスク）
- shogunの戦闘+描画を「Playerに適用する shogun モジュール」として抽出（既存 `applySlashTrailMixin` と同型）。
- プレイアブル将軍: `_shogunBossInstance` を廃し、自身に shogun モジュールを適用して直接実行。状態を単一ソース化（双方向同期を撤去）。
- ステージ6ボス: 薄い Enemy（AI/HP/報酬/出現）が shogun-Player を保持し駆動・描画。
- 検証: ボスAI戦、プレイアブル操作、被弾/与ダメ、奥義分身、全サブ武器、ステージ遷移。

### Stage 4 — 後始末
- 残存 dead code・`SHOGUN_SCALE` 直書き・検証用 `.claude/` ファイルの整理。

---

## 5. リスク注記
- **キャッシュ**: 検証時は必ず no-cache（本セッションで誤判定多発）。
- **刀サイズ変化**: Stage2 で不可避。事前承認が必要。
- **ボス戦の回帰**: Stage3 は AI/被弾/報酬に波及。ボス戦の実プレイ検証が必須。
- 各段は小さくコミットし、崩れたら即ロールバック。
