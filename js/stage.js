// ============================================
// Unification of the Nation - ステージ管理
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, SCREEN_WIDTH, STAGES, ENEMY_TYPES, OBSTACLE_TYPES, LANE_OFFSET, STAGE5_FLOOR, STAGE6_CORNER } from './constants.js?v=aspect-drift-fix-20260804e';
import { BOSS_STAGING } from './bossStaging.js?v=stage6-boss-shachi-20260803i';
import { createEnemy } from './enemy.js?v=boss-rig-20260807a';
import { createBoss } from './boss.js?v=boss-rig-20260807a';
import { createObstacle } from './obstacle.js';
import { audio } from './audio.js';
import { generateStairsCanvas } from './stairRenderer.js';
import {
    GRAPPLE_PHASE, createGrappleState, isGrappleActive, grappleProgress,
    startGrapple, updateGrapple, updateGrappleVisual, grapplePullEase, grapplePullPosition,
    renderGrappleBehind, renderGrappleFront
} from './stage6Grapple.js?v=boss-rig-20260807a';

const OBSTACLE_CHANCE_BOOST = 0.8;
// Stage1地面タイルの描画幅1206pxに合わせ、worldX=9648で位相0から接続する。
const STAGE1_GROUND_TRANSITION_LENGTH = 2352;
const STAGE1_BAMBOO_TREE_LINE_OFFSET = 1020;
const STAGE1_FENCE_END_OFFSET = 12;
const STAGE1_BOSS_SUN_HOUR = 8.25;

// Stage6最上階: 足元ラインを大棟の上へ持ち上げる量(px)。
// 【現在は0】= 通常ステージと同じ足元ライン(地平線+LANE_OFFSET=512)を使う。
// 「棟の上に立つ」はアクターを持ち上げるのではなく【屋根の描画を96px下げて】達成する。
//   - アクター側を持ち上げる方式は、通常レーン(512)を直接読む箇所が残ると
//     そこだけ96pxズレる事故を延々と生む(ジェム/着地/湧き位置で実際に起きた)
//   - 屋根に立つ人の目線=地平線は足元より上にあるので、棟が地平線の下にあるのが幾何的にも正しい
// 将来また持ち上げたくなった場合はこの定数だけを変える(全アクター・影・ジェムが追従する)。
const STAGE6_ARENA_RIDGE_LIFT = 0;
// 最上階の屋根の描画高さ(棟冠64 + 手前斜面240)。上端を足元ライン(512)へ置くので
// 下端は画面下端(720)を越える。越えた分は捨てる(瓦寸法と棟の厚みを縮めないため)。
const STAGE6_ROOF_DRAW_H = 304;
// 金鯱の描画寸法(コライダーと共有)。
// INSET: 大棟の実体端ちょうどに置くと取付足(world幅92px・画像中心より13px外寄り)の
//        半分以上が隅棟の斜面へはみ出すため、足全体が水平な大棟に載る位置まで内側へ寄せる。
// VISIBLE_BOTTOM: sourceの取付足の下端(y=940/1024)。ここを大棟上面へ接地させる。
// SOLID_SRC: 実体(頭の冠〜取付足)のsrc範囲。実測 x380..770 / y600..940。
//            背びれの細い先端(y<600)は装飾なのでコライダーに含めない。
const SHACHI_DRAW_H = 350;
const SHACHI_INSET_PX = 73;
const SHACHI_VISIBLE_BOTTOM = 940 / 1024;
const SHACHI_SOLID_SRC = { x0: 380, x1: 770, top: 600, bottom: 940 };
// 胴〜背びれの根元。頭の箱だけだと胴の高さでキャラが金鯱にめり込むので、
// 縦に高い箱を重ねる(実測: y240以下でx500..790が実体)。背びれの細い先端は装飾なので含めない。
const SHACHI_BODY_SRC = { x0: 500, x1: 790, top: 240, bottom: 940 };
// 金鯱の上で見下ろす間(ms)。この後は1撃目→鯱から足を離す→落下 と続く。
// 角3で見上げる屋根は【最上層の妻端(stage6_ridge_end_cap.png)そのもの】を使う。
// 別に描いた屋根(upper_roof_overhang)では、寸法をいくら合わせても
// 「同じ屋根を見上げている」ことにはならない。アリーナと同じ 640/1024 倍で
// 描くので瓦の目も完全に一致する。overhang アセットは【盲壁としてだけ】使う。
// 妻端の実測(1024²): 平坦部の棟上端 y=23 / 軒ライン(下端) y=519 /
//                    隅棟は右へ下り、軒先の先端は x=998, y=455。
const STAGE6_FINAL_CAP_SCALE = 640 / 1024;            // アリーナの妻端と同じ描画倍率
const STAGE6_FINAL_CAP_EAVE_SRC_Y = 519;              // 軒ライン(この線を盲壁の天端に合わせる)
const STAGE6_FINAL_CAP_TIP_SRC = { x: 998, y: 455 };  // 軒先の先端(ミラー後は左端)
// 鉤を掛ける隅棟上の点(先端より上)。ピクセル走査で「屋根の上端がこのyに来る」ことを
// 確認済み(境界-587で上端120 → 噛み位置124=屋根の内側)。上げすぎると空中に噛む。
const STAGE6_FINAL_CAP_HOOK_SRC = { x: 880, y: 428 };
const STAGE6_FINAL_CAP_FLAT_SRC_W = 200;              // 右へ反復する平坦部(棟〜軒)の幅
const STAGE6_FINAL_ROOF_EAVE_SCREEN_Y = 180;          // 軒ライン(平坦部の下端)の画面y
const STAGE6_FINAL_CAP_TIP_DX = -661;                 // 境界から軒先の先端までのワールドx
// 発火時に「軒先が右足先の何px先にあるか」。旧実装(境界-430で発火/軒先=境界-330)と
// 同じ100pxを踏襲する。これで鉤は真上ではなく前方斜め上へ飛ぶ。
const STAGE6_FINAL_GRAPPLE_LEAD_PX = 100;

// 【降下は補間も初速も足さない】。鯱から足を離したら物理と連撃モーションに任せる。
// 座標を毎フレーム補間で上書きすると、連撃が持っている前進の踏み込みが消えて
// 「レールに乗って振っているだけ」の動きになる。速度を足すのも同様に噛み合わない
// (連撃モーションが段ごとに縦横の速度を持っており、こちらの初速は即上書きされる)。
const STAGE6_BOSS_DROP_COMBO_STEPS = 5; // 降りながら出す連撃の段数(プレイヤーと同じ5連)
// 連撃が終わってから名乗りに入るまでの間。振り切りのポーズが抜けて立ち姿に
// 戻ってから短冊を出す(会敵の絵が5撃目の途中になるのを防ぐ)。
const STAGE6_BOSS_INTRO_IDLE_SETTLE_MS = 220;
// 名乗り帯の中心からボスの中心までの最低距離。対称位置がこれより内側になる場合
// (プレイヤーが中央付近で足を止めた場合)はここで止めて、間合いを潰さない。
const BOSS_ENTRANCE_MIN_HALF_GAP_PX = 200;
// Stage5の最終階: 天守閣へ続く階段をボスが降りてくる速さ。通常の登場ダッシュ(900)だと
// 320pxの段差を0.4秒で滑り落ちるので、踏みしめて降りる速度にする。
const STAGE5_BOSS_STAIR_DESCENT_SPEED = 300;
// Stage4の城門脇のかがり火。背景アートに焼き込まれているため、城郭下部の描画基準
// (getStage4CastleWorldX)からのワールドオフセットで位置を持つ(実測で合わせた値)。
// (炎の暖色画素の重心を実測: 画面x=718 と 1136、progress=10720 / castleWorldX=10620)
const STAGE4_BRAZIER_OFFSETS_X = [818, 1236];
// 炎の位置(groundY からの上方向オフセット)。実測の重心y=390〜392、groundY=480。
const STAGE4_BRAZIER_FLAME_DY = -90;
const STAGE6_BOSS_DROP_HOLD_MS = 540; // 飛び降りる前に鯱の上で見下ろす間
// 桜/金粉が名乗りと同時に舞い出すまでの尺。名乗り(INTRO_NAME_MS)の前半で開き切る。
const STAGE6_PETAL_FADE_IN_MS = 700;
// 【登場の5連は寸止め】プレイヤーの右端からこの距離までしか踏み込ませない。
// 大太刀の判定は boss.x の左235pxまで伸びる(4段目の天穿が最長・実測)。
// 突進の最深部で実測50px食い込んでいたので、刃先が25px手前で止まる 260 にする。
// これより詰めると当たり、離すと突進が見た目に届かなくなる。
const STAGE6_BOSS_INTRO_NEAR_MISS_PX = 260;

// Stage6最上階の雑魚の登場: 屋根の裏(棟の向こう側)から垂直に跳び上がって大棟へ乗る。
// 平場に湧かせると「屋根の上に湧いた」ことになり、大棟の上という場所の説得力が消える。
const STAGE6_ROOF_ENTRY_DEPTH = 150;   // 棟の下へ隠す深さ(全身が隠れる)
const STAGE6_ROOF_ENTRY_VY = -21.5;    // 跳び上がりの初速(GRAVITY=0.8で約289px上がる)
                                       // = 棟の線を139px越え、頂点で0.9秒ほど滞空する。
                                       // 低いと「せり上がり」に見えるので、大きく浮かせる

// --- Stage6 パノラマの帯高さ(index = cornersClimbed = 階層) ---
// 遠い連山は城の高さが数階変わっても視角がほぼ変わらない。同じ山を全区画で
// 同じ高さ・同じ下端に固定し、近景の増減で山を出現させたり拡大して見せたりしない。
// 高度差は空の色、天体、風、足場の意匠で表現する。
const STAGE6_MTN_H = 142;
// 回廊区画の前景は山裾より十分低い共通帯に固定する。最上階だけは大屋根の外へ
// 城下帯を延ばさないため0だが、山の稜線位置と見かけの大きさは変えない。
const STAGE6_MID_H = [62, 62, 62, 0];
const STAGE6_TOWN_H = [44, 44, 44, 0];
// 山アセットの「全列が完全不透明になる」上端位置(srcの高さ比)。
// 天体クリップの切断線をここに合わせると、切り口が山の不透明部と一致して線が見えない。
// 【重要】stage6_panorama_mountains_far.png を差し替えたら必ず再実測すること:
//   `node scratch/probe_mtn_solid.js` (各列でα=255が下端まで続く最小yの最大値 / naturalHeight)
//   現アセット 1536x1024 の実測値: y=740 / 1024 = 0.7227
const STAGE6_MTN_SRC_SOLID = 0.7227;
// 山を描くときに捨てる上端(透過フェード部)の比率。差し替え時は上と一緒に見直す。
// 現アセットの最高峰はy=592。0.56(=y573)から切り出し、峰の上に透明余白を残す。
const STAGE6_MTN_SRC_TOP = 0.56;

// ステージクラス
export class Stage {
    constructor(stageNumber) {
        this.stageNumber = stageNumber;
        this.stageInfo = STAGES[stageNumber - 1];
        this.name = this.stageInfo ? this.stageInfo.name : '';
        
        // ステージ進行
        this.progress = 0;
        this.scrollSpeed = 2; // unused but kept

        // --- Stage 5 フロア制 ---
        if (this.stageNumber === 5) {
            this.currentFloor = 1;
            this.maxFloor = STAGE5_FLOOR.COUNT;
            this.floorMaxProgress = STAGE5_FLOOR.PROGRESS_PER_FLOOR;
            this.maxProgress = this.floorMaxProgress;
            // 奇数フロア=右方向(1), 偶数フロア=左方向(-1)
            this.floorScrollDirection = 1;
            this.stairZoneWidth = STAGE5_FLOOR.STAIR_WIDTH;
            this.stairHeightPx = STAGE5_FLOOR.STAIR_HEIGHT;
            this.stairStepCount = STAGE5_FLOOR.STAIR_STEP_COUNT;
            this.baseGroundY = Math.round(CANVAS_HEIGHT * (2 / 3));
            // フロア遷移状態
            this.isFloorTransitioning = false;
            this.floorTransitionTimer = 0;
            this.floorTransitionPhase = 0; // 0=なし, 1=暗転中, 2=暗転待機, 3=フェードイン
            this.transitionFadeMs = STAGE5_FLOOR.TRANSITION_FADE_MS;
            this.transitionWaitMs = STAGE5_FLOOR.TRANSITION_WAIT_MS;
            this.transitionFadeInMs = STAGE5_FLOOR.TRANSITION_FADEIN_MS;
            this.floorTransitionTotalMs = this.transitionFadeMs + this.transitionWaitMs + this.transitionFadeInMs;
            // 前フロアから登ってきた階段を表示するか
            this.showPreviousStair = false;
            this.previousStairDirection = 0; // 前フロアの方向
            // フロア名表示
            this.floorNameDisplayTimer = 0;
            this.floorNameDisplayDuration = 1800; // ms
        } else {
            // 最終ステージ: 一〜三巡目の周回登城(各ZONE_WIDTH)+四巡目の大屋根アリーナ(ARENA_WIDTH)。
            this.maxProgress = this.stageNumber === 6
                ? (STAGE6_CORNER.ZONE_WIDTH * 3 + STAGE6_CORNER.ARENA_WIDTH)
                : 12000;
            this.currentFloor = 0;
            this.floorScrollDirection = 1;
        }

        // --- Stage 6 螺旋回廊（廻縁）---
        // 各ゾーン=1つの重の廻縁。角(ゾーン境界)の隅櫓で1段登る。
        if (this.stageNumber === 6) {
            this.baseGroundY = Math.round(CANVAS_HEIGHT * (2 / 3));
            this.cornersClimbed = 0;        // 登り済みの角の数 = 現在ゾーンindex(0〜3)
            // 角(ゾーン境界)は一〜三巡目の等間隔。四巡目(角3の先)はアリーナ。
            // 背景/床/壁のゾーン分割はこの配列基準(maxProgress/4ではない)。
            this.stage6CornerXs = [1, 2, 3].map((i) => STAGE6_CORNER.ZONE_WIDTH * i);
            this.lastClimbedCornerX = 0;
            this.isFloorTransitioning = false;
            this.floorTransitionTimer = 0;
            this.floorTransitionPhase = 0;
            this.transitionFadeMs = STAGE6_CORNER.TRANSITION_FADE_MS;
            this.transitionWaitMs = STAGE6_CORNER.TRANSITION_WAIT_MS;
            this.transitionFadeInMs = STAGE6_CORNER.TRANSITION_FADEIN_MS;
            this.floorTransitionTotalMs = this.transitionFadeMs + this.transitionWaitMs + this.transitionFadeInMs;
            // 階層カードは出さない（背景の高度進行で語る方針）
            this.floorNameDisplayDuration = 1;
            this.floorNameDisplayTimer = 0;
        }
        
        // 敵管理
        this.enemies = [];
        this.spawnTimer = 1500;  // 2000ms間隔に対し最初から1.5s進めておく
        this.balanceProfile = this.getBalanceProfile();
        this.spawnInterval = this.balanceProfile.spawnStart;  // ステージごとの初期間隔
        
        // 障害物管理
        this.obstacles = [];
        this.obstacleTimer = 0;
        this.obstacleInterval = 2500;
        
        // ボス
        this.boss = null;
        // Stage6最上階のみ: 開戦前から大屋根の右端に立っている将軍の実体。
        // 「カメラが右端に着いた瞬間に湧く」不自然さを消すため先に置き、スクロールで
        // フレームインさせる。this.boss とは別に持ち、戦闘・ボスUI・場の演出には
        // 一切参加させない(getAllEnemies にも入れない = 開戦前に殴られない/狙われない)。
        this.stage6StandbyBoss = null;
        this.bossEntranceDrop = null; // 金鯱から屋根へ飛び降りる登場の補間
        this.bossSpawned = false;
        this.bossDefeated = false;
        this._bossDeathMobsCleared = false;
        this.midBossSpawned = true; // 中ボスは出現させない
        // 撃破の余韻。ボスの死亡演出(deathDuration=1250ms)が終わった【後】から数える。
        // ここを長くすると「ボスが消えて雑魚もいない画面で自機が棒立ち」の空白になる。
        // 死亡演出の1.25秒がすでに十分な間なので、余韻は場が晴れる時間ぶんだけ取る
        // (bossStaging.DEFEAT_BLEND_FADE_MS と同値にして、晴れ切った瞬間に突破へ入る)。
        this.bossDefeatLingerDuration = BOSS_STAGING.DEFEAT_BLEND_FADE_MS;
        this.bossDefeatLingerTimer = 0;
        this._bossBlendFadeMs = 0;
        this._bossBlendFadeFrom = 1;
        this.bossEncounterBlend = 0;
        // 桜/金粉(天守閣)の立ち上がり。名乗りの瞬間から STAGE6_PETAL_FADE_IN_MS で開く。
        this.bossPetalT = 0;
        this.bossEntranceFlash = 0;  // 着地の衝撃フラッシュ（黒。白は色を飛ばすので使わない）
        // 登場演出の4段構成: approach(接近) → impact(着地) → name(名乗り) → ready(開戦)
        // Stage6の将軍だけは最初から大屋根の右端に立っているため approach/impact を
        // 通らず、turn(振り向き) → name → ready で始まる。
        this.bossIntroPhase = null;
        this.bossIntroPhaseTimer = 0;
        this.bossUiRevealT = 0;      // HPバーのスライドイン(0→1)
        
        // 地面
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));

        // P3 空補償: 可視ワールド上端(論理px)。game.renderPlaying が世界ズームwrap確定後に
        // 毎フレーム設定する。z=1 端末では常に 0 = 従来描画と完全一致。
        this.skyVisTop = 0;
        
        // 背景レイヤー（多重スクロール）
        this.bgLayers = this.createBackgroundLayers();

        
        // ステージ固有の敵構成
        this.enemyWeights = this.getEnemyWeights();
        this.maxActiveEnemies = this.getMaxActiveEnemies();
        this.stageTime = 0;
        this.skyParticles = this.createSkyParticles(40); // 粒子数を増やしてリッチに
        this.lastProgress = this.progress;
        this.playerProbe = {
            x: 0,
            y: 0,
            vx: 0,
            width: 0,
            height: 0,
            isGrounded: false
        };
        this.bambooFallingLeaves = [];
        this.bambooLeafSpawnTimer = 0;
        // 場(遠景の沈み込み・足元スポット・星の退場)が開くまでの尺。ボスが湧いた瞬間から。
        // stage6を明示しているのは、既定値へのフォールバックだと桜の時のように
        // 「テーブルに無いせいで演出とズレる」事故に気付けないため。
        // stage6は1500ms=金鯱から降りて着地(実測1283ms)する頃に場が完成する尺で、
        // 降下の見せ場に足元スポットを当てるためにこの値を選んでいる(名乗り基準に伸ばすと
        // 降下中のスポットが4割になり逆に弱くなる)。
        this.bossIntroDurationByStage = {
            1: 960,
            2: 1020,
            3: 1080,
            4: 1160,
            5: 1240,
            6: 1500
        };
        this.bossIntroDuration = this.bossIntroDurationByStage[this.stageNumber] || 1500;
        this.bossIntroTimer = 0;
        this.bossEntranceTargetRatio = 0.8;
        
        // --- 竹林ステージの初期落ち葉配置 ---
        if (this.stageNumber === 1) {
            this.initBambooLeaves();
        }

        // --- Stage 5 階段画像 ---
        if (this.stageNumber === 5) {
            const sd = generateStairsCanvas();
            this.stairImage = sd.canvas;
            this.stairOriginX = sd.originX;
            this.stairOriginY = sd.originY;
            this.stairTotalL = sd.totalL;  // プレビュー画像の論理幅 (=900)
            this.stairTotalH = sd.totalH;  // プレビュー画像の論理高さ (=800)
            this.stairDrawScale = this.stairZoneWidth / sd.totalL; // 描画スケール (360/900=0.4)
        }

        // --- Stage 1/2 地面画像 ---
        if (this.stageNumber === 1) {
            this.stage1GroundImage = new Image();
            this.stage1GroundImage.src = 'images/stage1_ground_bamboo_tile.png?v=20260707_ground2';
            this.stage1BambooBackLayerImage = new Image();
            this.stage1BambooBackLayerImage.src = 'images/stage1_bamboo_back_layer.png?v=20260712_opaque1';
            this.stage1BambooMidLayerImage = new Image();
            this.stage1BambooMidLayerImage.src = 'images/stage1_bamboo_mid_layer_v2.png?v=20260712_opaque1';
            this.stage1BambooFrontLayerImage = new Image();
            this.stage1BambooFrontLayerImage.src = 'images/stage1_bamboo_front_layer.png?v=20260712_opaque1';
            this.stage1BambooRootScreenImage = new Image();
            this.stage1BambooRootScreenImage.src = 'images/stage1_bamboo_root_screen.png?v=20260707_root1';
            this.stage1GroundToKaidoImage = new Image();
            this.stage1GroundToKaidoImage.src = 'images/stage1_ground_to_kaido.png?v=20260710_edge4';
        }
        if (this.stageNumber === 2) {
            this.stage2GroundImage = new Image();
            this.stage2GroundImage.src = 'images/stage2_ground_kaido_tile.png';
            this.stage2MountainBackImage = new Image();
            this.stage2MountainBackImage.decoding = 'async';
            this.stage2MountainBackImage.loading = 'eager';
            this.stage2MountainBackImage.src = 'images/stage2_mountain_back_wall.png';
            this.stage2MountainBackImage.decode?.().catch(() => {});
            this.stage2MountainPassImage = new Image();
            this.stage2MountainPassImage.decoding = 'async';
            this.stage2MountainPassImage.loading = 'eager';
            this.stage2MountainPassImage.src = 'images/stage2_mountain_pass_wall.png';
            this.stage2MountainPassImage.decode?.().catch(() => {});
            this.stage2PropImages = {};
            const stage2PropPaths = {
                ruralFarmhouse: 'images/stage2_rural_farmhouse_clean.png',
                ruralTeahouse: 'images/stage2_rural_teahouse_clean.png',
                ruralShed: 'images/stage2_rural_shed_clean.png',
                ruralShrine: 'images/stage2_rural_shrine.png',
                cleanLowFence: 'images/stage2_prop_clean_low_fence.png?v=20260706_front1',
                cleanStrawBundles: 'images/stage2_prop_clean_straw_bundles.png?v=20260706_front1',
                cleanJars: 'images/stage2_prop_clean_jars.png?v=20260706_front1',
                cleanStoneWell: 'images/stage2_prop_clean_stone_well.png?v=20260706_front1',
                cleanWoodSignpost: 'images/stage2_prop_clean_wood_signpost.png?v=20260706_front1',
                cleanGrassClump: 'images/stage2_prop_clean_grass_clump.png?v=20260706_front1',
                cleanJizo: 'images/stage2_prop_clean_jizo.png?v=20260706_front1'
            };
            for (const [key, src] of Object.entries(stage2PropPaths)) {
                const image = new Image();
                image.src = src;
                this.stage2PropImages[key] = image;
            }
        }

        // --- Stage 3 山道添景画像 ---
        if (this.stageNumber === 3) {
            this.stage3ExitImage = new Image();
            this.stage3ExitImage.src = 'images/stage3_mountain_exit.png';
            this.stage3GroundImage = new Image();
            this.stage3GroundImage.src = 'images/stage3_ground_mountain_tile.png';
            this.stage3PropImages = {};
            const stage3PropPaths = {
                dosojin: 'images/stage3_prop_dosojin.png?v=20260706_front1',
                signpost: 'images/stage3_prop_signpost.png?v=20260706_front1',
                woodFence: 'images/stage3_prop_weathered_wood_fence.png?v=20260706_front1',
                stoneLantern: 'images/stage3_prop_stone_lantern.png?v=20260706_front1',
                jizoLarge: 'images/stage3_prop_jizo_large.png?v=20260706_front1',
                mountainSign: 'images/stage3_prop_mountain_sign.png?v=20260706_front1'
            };
            for (const [key, src] of Object.entries(stage3PropPaths)) {
                const image = new Image();
                image.src = src;
                this.stage3PropImages[key] = image;
            }
        }

        // --- Stage 4 城下町添景画像 ---
        if (this.stageNumber === 4) {
            this.stage4TownImages = {};
            const stage4TownPaths = {
                townMachiya: 'images/stage4_town_part_machiya.png',
                townShops: 'images/stage4_town_part_shops.png',
                townNagaya: 'images/stage4_town_part_nagaya.png',
                groundTile: 'images/stage4_ground_stone_tile.png',
                castleEntrance: 'images/stage4_castle_lower_wide.png',
                castleApproachDistrict: 'images/stage4_castle_approach_district.png',
                climbPropCrates: 'images/stage4_climb_prop_crates.png?v=20260706_front1',
                climbPropHandcart: 'images/stage4_climb_prop_handcart.png?v=20260706_side2',
                climbPropBench: 'images/stage4_climb_prop_bench.png',
                climbPropSakeBarrels: 'images/stage4_climb_prop_sake_barrels.png'
            };
            for (const [key, src] of Object.entries(stage4TownPaths)) {
                const image = new Image();
                image.src = src;
                this.stage4TownImages[key] = image;
            }
        }

        // --- Stage 5 城内床画像 ---
        if (this.stageNumber === 5) {
            this.stage5InteriorWallImage = new Image();
            this.stage5InteriorWallImage.src = 'images/stage5_castle_interior_wall.png?v=20260706_bg1';
            this.stage5GroundImage = new Image();
            this.stage5GroundImage.src = 'images/stage5_ground_wood_tile.png';
        }

        // --- Stage 6 天守床画像 ---
        if (this.stageNumber === 6) {
            this.stage6TenshuBackdropImage = new Image();
            this.stage6TenshuBackdropImage.src = 'images/stage6_tenshu_rooftop_backdrop.png?v=20260728_open1';
            this.stage6UpperGalleryImage = new Image();
            this.stage6UpperGalleryImage.src = 'images/stage6_upper_gallery_backdrop.png?v=20260726_open2';
            this.stage6RoofRidgeImage = new Image();
            this.stage6RoofRidgeImage.src = 'images/stage6_roof_ridge_backdrop.png?v=20260714_zone1';
            this.stage6GroundImage = new Image();
            this.stage6GroundImage.src = 'images/stage6_ground_lacquer_neutral.png?v=20260714_neutral1';
            this.stage6UpperGalleryGroundImage = new Image();
            this.stage6UpperGalleryGroundImage.src = 'images/stage6_ground_upper_gallery.png?v=20260715_parallel1';
            this.stage6GroundThresholdImage = new Image();
            this.stage6GroundThresholdImage.src = 'images/stage6_ground_threshold_strip.png?v=20260714_zone1';

            // --- 螺旋回廊: 柵越しの眼下パノラマ＋隅櫓の階段 ---
            this.stage6PanoramaTownNearImage = new Image();
            this.stage6PanoramaTownNearImage.src = 'images/stage6_panorama_town_near.png?v=20260722_town3';
            this.stage6PanoramaBambooFarImage = new Image();
            this.stage6PanoramaBambooFarImage.src = 'images/stage6_panorama_bamboo_far.png?v=20260721_loop1';
            this.stage6PanoramaKaidoFarImage = new Image();
            this.stage6PanoramaKaidoFarImage.src = 'images/stage6_panorama_kaido_far.png?v=20260721_loop1';
            this.stage6PanoramaMountainsFarImage = new Image();
            this.stage6PanoramaMountainsFarImage.src = 'images/stage6_panorama_mountains_far.png?v=20260727_mountains3';

            // 角の全高壁(視界遮断+通用門)。境界ごとに別アセット。
            // 角3は壁を持たない(見上げる屋根だけを描くので、専用アセットは不要)。
            this.stage6CornerWallImages = [
                'images/stage6_wall_corner_turret.png?v=20260724_checker2',
                'images/stage6_wall_gatehouse.png?v=20260724_checker2'
            ].map((src) => {
                const img = new Image();
                img.src = src;
                return img;
            });

            // --- 大棟化: 四巡目=天守大屋根の上(柵なし・棟瓦・眼下に朝靄)。
            // 金鯱は妻端と別レイヤー。妻端は主屋根を重複させない端部専用アセット。
            this.stage6RidgeShachiImage = new Image();
            this.stage6RidgeShachiImage.src = 'images/stage6_ridge_shachi.png?v=20260802_shachi4c';
            this.stage6RidgeEndCapImage = new Image();
            this.stage6RidgeEndCapImage.src = 'images/stage6_ridge_end_cap.png?v=20260802_endcap7c';
            // 三巡目の床置き換え(鉄板リベット→黒漆の板張り)
            this.stage6GalleryWoodGroundImage = new Image();
            this.stage6GalleryWoodGroundImage.src = 'images/stage6_ground_gallery_wood.png?v=20260722_ridge1';
            // 角3(最上階へ): 頭上に張り出す最上重の軒(見上げ構図)。飛びつく導線の絵。
            // 背景屋根(ridge_flanks)と出口破風(roof_exit_gable)は最上階アリーナ化で廃止。
            // 大屋根の上には地面の屋根(eaves)だけがあり、奥は山並みと空だけになる。
            // 大棟の床v3: 水平な軒先まで瓦を敷き、画面下端まで不透明に描く。
            this.stage6RidgeEavesGroundImage = new Image();
            this.stage6RidgeEavesGroundImage.src = 'images/stage6_ground_ridge_eaves.png?v=20260802_eaves4c';
        }

        // キャッシュ用オフスクリーンCanvasの初期化
        this.cachedAssets = {};
        this.initCache();
    }

    initCache() {
        // 竹の葉のプリレンダリング
        if (this.stageNumber === 1) {
            const palettes = [
                { top: '#2b4930', bottom: '#17291d', vein: 'rgba(8, 18, 11, 0.58)' },
                { top: '#38543a', bottom: '#203323', vein: 'rgba(10, 22, 13, 0.56)' },
                { top: '#4a5f3b', bottom: '#293623', vein: 'rgba(15, 23, 12, 0.54)' },
                { top: '#555d37', bottom: '#343921', vein: 'rgba(23, 24, 10, 0.52)' },
                { top: '#3f5132', bottom: '#24301f', vein: 'rgba(12, 19, 10, 0.56)' }
            ];
            this.cachedAssets.bambooLeaves = palettes.map((palette) => {
                const offCanvas = document.createElement('canvas');
                offCanvas.width = 32;
                offCanvas.height = 32;
                const octx = offCanvas.getContext('2d');
                const size = 12;
                octx.translate(16, 16);
                const fill = octx.createLinearGradient(-size * 0.55, 0, size * 0.65, 0);
                fill.addColorStop(0, palette.bottom);
                fill.addColorStop(0.48, palette.top);
                fill.addColorStop(1, palette.bottom);
                octx.fillStyle = fill;
                octx.beginPath();
                octx.moveTo(-size * 0.62, 0.5);
                octx.quadraticCurveTo(-size * 0.08, -size * 0.34, size * 0.68, -size * 0.05);
                octx.quadraticCurveTo(size * 0.08, size * 0.3, -size * 0.62, 0.5);
                octx.closePath();
                octx.fill();
                octx.strokeStyle = 'rgba(118, 132, 76, 0.34)';
                octx.lineWidth = 0.75;
                octx.stroke();
                octx.strokeStyle = palette.vein;
                octx.lineWidth = 0.65;
                octx.beginPath();
                octx.moveTo(-size * 0.45, 0.25);
                octx.quadraticCurveTo(0, -0.35, size * 0.53, -size * 0.03);
                octx.stroke();
                return offCanvas;
            });
        }

        // ボス戦の集中線（スピードライン）のキャッシュ化
        const speedLineCanvas = document.createElement('canvas');
        speedLineCanvas.width = CANVAS_WIDTH;
        speedLineCanvas.height = Math.round(CANVAS_HEIGHT * 0.8);
        const slCtx = speedLineCanvas.getContext('2d');
        const centerX = CANVAS_WIDTH / 2;
        const centerY = this.groundY / 2;
        slCtx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
        slCtx.lineWidth = 1.5;
        for (let i = 0; i < 36; i++) {
            const angle = (i / 36) * Math.PI * 2;
            slCtx.beginPath();
            slCtx.moveTo(centerX + Math.cos(angle) * CANVAS_WIDTH * 0.4, centerY + Math.sin(angle) * CANVAS_WIDTH * 0.4);
            slCtx.lineTo(centerX + Math.cos(angle) * CANVAS_WIDTH * 0.7, centerY + Math.sin(angle) * CANVAS_WIDTH * 0.7);
            slCtx.stroke();
        }
        this.cachedAssets.speedLines = speedLineCanvas;

        // 天守閣ボス戦の桜（プリレンダリング）。
        // 旧実装は不透明なピンクの楕円を等倍で撒くだけで「安っぽい紙吹雪」だった。
        // 花びらの形（先端の切り込み・根元の絞り）と根元→先端の淡いグラデ、
        // 淡い縁取りと中心の筋を焼き込んでおき、描画側は回転と裏返りだけを与える。
        if (this.stageNumber === 6) {
            const petalPalettes = [
                { base: '#eeb2c2', tip: '#fdf1f4', edge: 'rgba(190, 132, 150, 0.34)' },
                { base: '#e5a2b5', tip: '#f9e2e9', edge: 'rgba(178, 120, 139, 0.32)' },
                { base: '#f5d3dc', tip: '#fffbfc', edge: 'rgba(205, 158, 172, 0.26)' }
            ];
            // スプライトは 48px で焼き、描画時は 32*scale で使う（実寸より高解像度＝拡大に強い）。
            this.cachedAssets.sakuraPetals = petalPalettes.map((p) => {
                const cv = document.createElement('canvas');
                cv.width = 48; cv.height = 48;
                const o = cv.getContext('2d');
                o.translate(24, 24);
                // 桜の花びらの要件: 根元は細く絞り、中腹で最も張り、先端は幅広で
                // 深めのV字に切れ込む。丸い塊になると「花びら」に見えない。
                // 切り込みは【浅く広く】。深く狭いとハート型に見えてしまう。
                const w = 10.6, h = 12.2;
                o.beginPath();
                o.moveTo(0, h * 0.90);                                                 // 根元(細く絞る)
                o.bezierCurveTo(-w * 0.46, h * 0.72, -w * 0.96, h * 0.04, -w * 0.86, -h * 0.52);
                o.bezierCurveTo(-w * 0.80, -h * 0.86, -w * 0.66, -h * 0.96, -w * 0.50, -h * 0.94);
                o.quadraticCurveTo(0, -h * 0.70, w * 0.50, -h * 0.94);                 // 先端の切り込み(浅いV)
                o.bezierCurveTo(w * 0.66, -h * 0.96, w * 0.80, -h * 0.86, w * 0.86, -h * 0.52);
                o.bezierCurveTo(w * 0.96, h * 0.04, w * 0.46, h * 0.72, 0, h * 0.90);
                o.closePath();

                const fill = o.createLinearGradient(0, h * 0.90, 0, -h * 0.94);
                fill.addColorStop(0, p.base);
                fill.addColorStop(0.58, p.tip);
                fill.addColorStop(1, p.tip);
                o.fillStyle = fill;
                o.fill();
                o.strokeStyle = p.edge;
                o.lineWidth = 0.8;
                o.stroke();
                // 中心の筋（薄く１本だけ。入れすぎると玩具っぽくなる）
                o.strokeStyle = 'rgba(196, 140, 158, 0.20)';
                o.lineWidth = 0.7;
                o.beginPath();
                o.moveTo(0, h * 0.74);
                o.quadraticCurveTo(0, 0, 0, -h * 0.56);
                o.stroke();
                return cv;
            });

            // 金粉（朝日に舞う微塵）。旧実装は fillRect の金色の棒だった＝安っぽさの主因。
            // 芯が白に寄った柔らかい丸に置き換え、lighten で空に溶かす。
            const mote = document.createElement('canvas');
            mote.width = 24; mote.height = 24;
            const mo = mote.getContext('2d');
            const mg = mo.createRadialGradient(12, 12, 0, 12, 12, 12);
            mg.addColorStop(0, 'rgba(255, 250, 232, 0.95)');
            mg.addColorStop(0.24, 'rgba(255, 228, 158, 0.5)');
            mg.addColorStop(0.62, 'rgba(226, 178, 96, 0.16)');
            mg.addColorStop(1, 'rgba(200, 150, 70, 0)');
            mo.fillStyle = mg;
            mo.fillRect(0, 0, 24, 24);
            this.cachedAssets.goldMote = mote;
        }

        // 星のグロー（プリレンダリング）
        const starGlow = document.createElement('canvas');
        starGlow.width = 32;
        starGlow.height = 32;
        const sgCtx = starGlow.getContext('2d');
        const grad = sgCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        sgCtx.fillStyle = grad;
        sgCtx.fillRect(0, 0, 32, 32);
        this.cachedAssets.starGlow = starGlow;
    }

    initBambooLeaves() {
        const initialCount = 28;
        const cliffY = this.groundY + 120; // 拡張された路面幅
        for (let i = 0; i < initialCount; i++) {
            const depth = 0.45 + Math.random() * 0.55;
            const screenX = Math.random() * CANVAS_WIDTH;
            const targetY = this.groundY + depth * (cliffY - this.groundY);
            
            this.bambooFallingLeaves.push({
                worldX: screenX + this.progress,
                y: targetY,
                vx: 0,
                vy: 0,
                rot: Math.random() * Math.PI * 2,
                rotV: 0,
                size: (8 + Math.random() * 6) * (0.86 + depth * 0.14),
                depth,
                state: 'grounded',
                groundLife: 4000 + Math.random() * 8000,
                maxGroundLife: 12000,
                leafId: (this._leafIdCounter = ((this._leafIdCounter || 0) + 1) & 0xFFFF)
            });
        }
    }

    // ============================
    // Stage 5 フロア制メソッド群
    // ============================

    /** 階段描画のためのサポート情報 */
    _getStairImageWorldX(direction) {
        return this._getStairPhysicalStart(direction);
    }

    // 物理判定の登り始め・終わりワールドX
    _getStairPhysicalStart(direction) {
        return direction === 1 ? (this.maxProgress - this.stairZoneWidth) : this.stairZoneWidth;
    }

    /**
     * 物理判定の登り終わり（頂上）ワールドX。
     * 右登り → maxProgress（右端）
     * 左登り → 0（左端）
     */
    _getStairPhysicalEnd(direction) {
        return direction === 1 ? this.maxProgress : 0;
    }

    /** 階段区間の開始ワールドX座標（物理的な登り始め） */
    getStairStartX() {
        if (this.stageNumber !== 5) return Infinity;
        return this._getStairPhysicalStart(this.floorScrollDirection);
    }

    /** 階段区間の終了ワールドX座標（物理的な頂上） */
    getStairEndX() {
        if (this.stageNumber !== 5) return Infinity;
        return this._getStairPhysicalEnd(this.floorScrollDirection);
    }

    /**
     * 最終階(ボス部屋)の右端にある天守閣へ続く階段の、あるワールドxでの持ち上げ量(0..stairHeightPx)。
     * この階段は通常【背景専用】で、getStairGroundY は最終階では平地を返す(プレイヤーは
     * getFinalFloorExitBarrierX で進入を止めている)。ボスの登場だけはこの段を降りてくるので、
     * ここで斜面を与える。
     */
    getStage5ExitStairLift(worldX) {
        if (!this.isFinalFloorExitStair()) return 0;
        const dir = this.floorScrollDirection;
        const physStart = this._getStairPhysicalStart(dir);
        const w = Math.max(1, this.stairZoneWidth);
        const t = dir === 1 ? (worldX - physStart) / w : (physStart - worldX) / w;
        return this.clamp01(t) * this.stairHeightPx;
    }

    /** 最終階の階段の頂上に立たせるための座標。ボスの登場開始位置。 */
    getStage5ExitStairTopPose(boss) {
        if (!this.isFinalFloorExitStair()) return null;
        const bw = typeof boss?.getWorldWidth === 'function' ? boss.getWorldWidth() : (boss?.width || 140);
        const bh = typeof boss?.getWorldHeight === 'function' ? boss.getWorldHeight() : (boss?.height || 180);
        const dir = this.floorScrollDirection;
        const topWorldX = dir === 1 ? (this.maxProgress - bw - 8) : 8;
        const lift = this.getStage5ExitStairLift(topWorldX + bw * 0.5);
        const groundY = this.baseGroundY - lift;
        return { x: topWorldX, y: groundY + LANE_OFFSET - bh, groundY };
    }

    /** 最終階の階段を降りている最中のボスの足元を、斜面に合わせる。 */
    applyStage5ExitStairDescent(boss) {
        if (!boss || !this.isFinalFloorExitStair()) return;
        const bw = typeof boss.getWorldWidth === 'function' ? boss.getWorldWidth() : (boss.width || 140);
        const bh = typeof boss.getWorldHeight === 'function' ? boss.getWorldHeight() : (boss.height || 180);
        const lift = this.getStage5ExitStairLift(boss.x + bw * 0.5);
        boss.groundY = this.baseGroundY - lift;
        boss.y = boss.groundY + LANE_OFFSET - bh;
        boss.vy = 0;
        boss.isGrounded = true;
    }

    /** 最終階の右端にある、天守閣へ続く背景専用の階段か */
    isFinalFloorExitStair() {
        return this.stageNumber === 5 && this.currentFloor >= this.maxFloor;
    }

    /** Stage6: 次に登る角(隅櫓)のワールドX。全て登り済みなら Infinity */
    getStage6ActiveCornerX() {
        if (this.stageNumber !== 6) return Infinity;
        return this.cornersClimbed < this.stage6CornerXs.length
            ? this.stage6CornerXs[this.cornersClimbed]
            : Infinity;
    }

    /** Stage6: 大屋根アリーナ(四巡目=最上階)にいるか。左右自由移動の特殊仕様が有効な区間 */
    isStage6Arena() {
        return this.stageNumber === 6 && this.cornersClimbed >= this.stage6CornerXs.length;
    }

    /** Stage6: 大屋根アリーナの左端ワールドX */
    getStage6ArenaLeft() {
        return this.stage6CornerXs[this.stage6CornerXs.length - 1];
    }

    /** Stage6最上階: 描画・プレイヤー・敵が共有する屋根の実体端 */
    getStage6ArenaPhysicalLeft() {
        return this.getStage6ArenaLeft() + STAGE6_CORNER.ARENA_EDGE_INSET_PX;
    }

    getStage6ArenaPhysicalRight() {
        return this.maxProgress - STAGE6_CORNER.ARENA_EDGE_INSET_PX;
    }

    /** Stage6最上階で、敵を屋根の無い空間へ出さない。 */
    constrainStage6ArenaActor(actor, settleGround = false) {
        if (!this.isStage6Arena() || !actor) return;
        const worldWidth = typeof actor.getWorldWidth === 'function'
            ? actor.getWorldWidth()
            : (actor.width || 0);
        const worldHeight = typeof actor.getWorldHeight === 'function'
            ? actor.getWorldHeight()
            : (actor.height || 0);
        const left = this.getStage6ArenaPhysicalLeft() + 10;
        const right = this.getStage6ArenaPhysicalRight() - 10;
        const maxX = Math.max(left, right - worldWidth);
        const clampedX = Math.max(left, Math.min(actor.x, maxX));
        if (clampedX !== actor.x) {
            actor.x = clampedX;
            actor.vx = 0;
        }
        // 屋根の裏から跳び上がっている最中は床を下げたままにする(棟へ吸着させない)。
        // 足元が大棟の線より上へ抜けた時点で通常の接地へ戻し、落下で棟へ着地させる。
        if (actor.stage6RoofEntry) {
            const laneY = this.getStage6ArenaGroundY() + LANE_OFFSET;
            // 跳び込みの横速度はAIに上書きさせない(真上に上がるだけだと「せり上がり」に見える)
            if (Number.isFinite(actor.stage6RoofEntryVx)) actor.vx = actor.stage6RoofEntryVx;
            if (actor.y + worldHeight > laneY) return;
            actor.stage6RoofEntry = false;
            actor.stage6RoofEntryLand = true; // 着地の土煙は接地した瞬間に出す
        }
        // 登場演出で金鯱の上に立っている間は触らない(座標は演出側が持つ)。
        if (actor.stage6PerchHold) return;
        actor.groundY = this.getStage6ArenaGroundY();
        // 【足場(金鯱)の上に立っている間は棟へ引き戻さない】。金鯱は敵味方共通の
        // コライダーなので、その天端に接地している時にここで棟へ吸着させると
        // 誰も乗れなくなる(横方向に押し返すだけの壁になってしまう)。
        if (this.isStandingOnStage6Platform(actor, worldWidth, worldHeight)) return;
        if (settleGround || actor.isGrounded) {
            actor.y = actor.groundY + LANE_OFFSET - worldHeight;
            actor.vy = 0;
            actor.isGrounded = true;
            if (actor.stage6RoofEntryLand) {
                actor.stage6RoofEntryLand = false;
                actor.stage6RoofEntryVx = undefined;
                const g = window.game;
                if (g && typeof g.spawnGroundDust === 'function') {
                    g.spawnGroundDust(actor.x + worldWidth * 0.5, actor.y + worldHeight, {
                        count: 6, intensity: 0.6, spread: 0.7, speed: 1.0, rise: 0.4, size: 8
                    });
                }
            }
        }
    }

    /**
     * Stage6最上階: 足場(金鯱)の天端に足が乗っているか。
     * 乗っている間は大棟への吸着(constrainStage6ArenaActor)を止める。
     * プレイヤー・雑魚・ボスで共通の判定。
     */
    isStandingOnStage6Platform(actor, worldWidth, worldHeight) {
        if (!actor || actor.isGrounded === false) return false;
        const boxes = this.getStage6ArenaColliders();
        if (!boxes || boxes.length === 0) return false;
        const footY = actor.y + worldHeight;
        const left = actor.x;
        const right = actor.x + worldWidth;
        for (const b of boxes) {
            if (right <= b.x || left >= b.x + b.width) continue;
            // 天端の±8px以内に足が来ていれば「乗っている」
            if (Math.abs(footY - b.y) <= 8) return true;
        }
        return false;
    }

    /**
     * Stage6最上階: 雑魚を屋根の裏から大棟へ跳び上がらせる登場。
     * 一時的に床を棟の150px下へ置いて全身を屋根で隠し、上向きの初速を与える。
     * 棟より上へ抜けたら constrainStage6ArenaActor が通常の接地へ戻す。
     */
    beginStage6RoofEntry(enemy) {
        if (!enemy || !this.isStage6Arena()) return;
        const worldWidth = typeof enemy.getWorldWidth === 'function'
            ? enemy.getWorldWidth()
            : (enemy.width || 0);
        const worldHeight = typeof enemy.getWorldHeight === 'function'
            ? enemy.getWorldHeight()
            : (enemy.height || 0);
        const groundY = this.getStage6ArenaGroundY();
        // 真上へ上がるだけだと「せり上がり」に見えるので、屋根の内側へ向かって
        // 斜めに跳ばせる。棟を越えて着地するまでが一続きの跳躍に見える。
        const centerX = (this.getStage6ArenaPhysicalLeft() + this.getStage6ArenaPhysicalRight()) * 0.5;
        const dir = (enemy.x + worldWidth * 0.5) < centerX ? 1 : -1;
        enemy.stage6RoofEntry = true;
        enemy.stage6RoofEntryLand = false;
        enemy.stage6RoofEntryVx = dir * (2.6 + Math.random() * 1.4);
        // 棟の外側へ踏み出した位置から跳ぶ(軒の側から屋根へ上がる導線)
        enemy.x += dir * -46;
        enemy.groundY = groundY + STAGE6_ROOF_ENTRY_DEPTH;
        enemy.y = enemy.groundY + LANE_OFFSET - worldHeight;
        enemy.vx = enemy.stage6RoofEntryVx;
        enemy.vy = STAGE6_ROOF_ENTRY_VY;
        enemy.isGrounded = false;
        enemy.facingRight = dir > 0;
    }

    /**
     * Stage6最上階の接地基準。STAGE6_ARENA_RIDGE_LIFT=0 の現行仕様では通常と同じ。
     * 「棟の上に立つ」は屋根の描画を下げる側で成立させている(getStage6RoofRidgeTopY)。
     * 呼び出し側は全てこれ経由なので、持ち上げ方式へ戻す場合も定数1つで追従する。
     */
    getStage6ArenaGroundY() {
        return this.isStage6Arena()
            ? this.groundY - STAGE6_ARENA_RIDGE_LIFT
            : this.groundY;
    }

    /**
     * 最上階の大棟の上端y(=屋根アセット・端材・金鯱の描画原点)。
     * 足元ラインと一致させることで、キャラは棟の上に立ち、屋根面は手前へ下がる。
     * 屋根に立つ人の目線(=地平線)は足元より上にあるので、棟は地平線の下に来る。
     */
    getStage6RoofRidgeTopY() {
        return this.getStage6ArenaGroundY() + LANE_OFFSET;
    }

    /** Stage6最上階の将軍登場目標。全身と着地煙が屋根面に収まる位置にする。 */
    getStage6BossEntranceTargetX(boss, scrollX) {
        const worldWidth = typeof boss?.getWorldWidth === 'function'
            ? boss.getWorldWidth()
            : (boss?.width || 140);
        // 金鯱に重ならない位置に立たせる。鯱の体は大棟端から内側164pxまで張り出すので
        // (幅208px・取付足の中心が端から60px内側)、そこから更に36px空ける。
        // ここを詰めるほど将軍の立ち位置が右へ寄り、開戦時の間合いが広がる
        // (100px空けていた頃はプレイヤーとの間合いが実測281pxしか取れなかった)。
        const shachiClearance = 200;
        const left = this.getStage6ArenaPhysicalLeft() + shachiClearance;
        const right = this.getStage6ArenaPhysicalRight() - worldWidth - shachiClearance;
        const normalTarget = scrollX + CANVAS_WIDTH * this.bossEntranceTargetRatio;
        return Math.max(left, Math.min(normalTarget, right));
    }

    /**
     * 【名乗り帯に対してプレイヤーと左右対称な登場位置】。
     * 短冊は常に画面中心(SCREEN_WIDTH*0.5=ワールド換算 scrollX+CANVAS_WIDTH/2)に出るので、
     * ボスの中心を「中心 +(中心 - プレイヤー中心)」に置けば左右対称になる。
     * 既定の 0.8 固定だと、プレイヤーがどこで足を止めたかで非対称になる
     * (実測: 帯の中心からプレイヤー271px / ボス515px)。
     * 近すぎ・画面外は MIN_HALF_GAP と右端で抑える。
     */
    getBossSymmetricEntranceTargetX(boss, scrollX, player) {
        const bw = typeof boss?.getWorldWidth === 'function' ? boss.getWorldWidth() : (boss?.width || 140);
        const fallback = scrollX + CANVAS_WIDTH * this.bossEntranceTargetRatio;
        if (!player) return fallback;
        const pw = typeof player.getWorldWidth === 'function' ? player.getWorldWidth() : (player.width || 48);
        const bannerCenter = scrollX + CANVAS_WIDTH * 0.5;
        const playerCenter = player.x + pw * 0.5;
        const mirrored = bannerCenter + (bannerCenter - playerCenter);
        const minCenter = bannerCenter + BOSS_ENTRANCE_MIN_HALF_GAP_PX;
        const maxCenter = scrollX + CANVAS_WIDTH - bw * 0.5 - 24;
        if (maxCenter <= minCenter) return fallback;
        return Math.max(minCenter, Math.min(mirrored, maxCenter)) - bw * 0.5;
    }

    /**
     * Stage6最上階: 開戦前の将軍の待機位置。【右の金鯱の頭の上に立って待つ】。
     * スクロールでフレームインした時点で「あんな所にいる」と読め、開戦の合図が
     * 「屋根へ飛び降りる」一動作で済む(背を向けて振り返る案の代替)。
     * 鯱が未読込のときは大棟の上(登場目標X)へフォールバックする。
     */
    getStage6BossStandbyPose(boss) {
        const worldWidth = typeof boss?.getWorldWidth === 'function' ? boss.getWorldWidth() : (boss?.width || 80);
        const worldHeight = typeof boss?.getWorldHeight === 'function' ? boss.getWorldHeight() : (boss?.height || 120);
        const perch = this.getStage6ShachiSolidBox(1);
        if (perch) {
            return {
                x: perch.x + (perch.width - worldWidth) * 0.5,
                y: perch.y - worldHeight,
                onShachi: true
            };
        }
        return {
            x: this.getStage6BossEntranceTargetX(boss, this.getStage6ArenaCameraMaxX()),
            y: this.getStage6ArenaGroundY() + LANE_OFFSET - worldHeight,
            onShachi: false
        };
    }

    /**
     * 最上階のカメラ可動域。屋根の実体が画面の角を満たす範囲で止める。
     * 反り軒は画面下端より下へ出るので、屋根の外側をそのまま画面端まで映すと
     * 隅棟の下に「谷底だけの三角の余白」が出る。屋根が画面下端に届く所までに制限する。
     */
    getStage6RoofVisibleOuterPx() {
        // 【重要】一度決めたら変えない。この値はカメラのクランプ幅そのものなので、
        // プロファイル未構築(=最上階の初回描画前)とその後で違う値を返すと、
        // 屋根へ飛び乗った直後にカメラのクランプが動いて画面がガクッと飛ぶ。
        if (this._stage6RoofVisibleOuter != null) return this._stage6RoofVisibleOuter;
        const p = this.getStage6EndCapProfile();
        // フォールバックは端材v7の実測値。未構築の間も同じ幅になるようにしておく。
        const fallback = 235;
        if (!p) return fallback;
        const capScale = 640 / p.W;
        const ridgeTopY = this.getStage6RoofRidgeTopY();
        for (const sample of p.samples) {
            if (sample.top === null || sample.x < 256) continue;
            if (ridgeTopY + sample.top * capScale >= CANVAS_HEIGHT) {
                this._stage6RoofVisibleOuter = Math.max(60, (sample.x - 256) * capScale);
                return this._stage6RoofVisibleOuter;
            }
        }
        this._stage6RoofVisibleOuter = Math.max(60, (p.W - 256) * capScale);
        return this._stage6RoofVisibleOuter;
    }

    /**
     * 金鯱の実体箱(ワールド)。side: -1=左端 / +1=右端。
     * 描画(renderStage6ArenaRidgeEnds)と同じ式から導出するので、寸法や内寄せを
     * 変えてもコライダーと絵がズレない。背びれの細い先端は含めない(装飾)。
     */
    getStage6ShachiBox(side, src) {
        if (!this.isStage6Arena()) return null;
        const img = this.stage6RidgeShachiImage;
        if (!this.isStage6ImageReady(img)) return null;
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const drawH = SHACHI_DRAW_H;
        const drawW = drawH * (srcW / srcH);
        const centerX = side < 0
            ? this.getStage6ArenaPhysicalLeft() + SHACHI_INSET_PX
            : this.getStage6ArenaPhysicalRight() - SHACHI_INSET_PX;
        const bottomY = Math.round(this.getStage6RoofRidgeTopY() + drawH * (1 - SHACHI_VISIBLE_BOTTOM));
        const imageLeft = centerX - drawW * 0.5;
        const imageTop = bottomY - drawH;
        const sx = drawW / srcW;
        const sy = drawH / srcH;
        // 左端は左右反転して描くので、srcのx範囲も反転させる
        const x0 = side < 0 ? (srcW - src.x1) : src.x0;
        const x1 = side < 0 ? (srcW - src.x0) : src.x1;
        const top = imageTop + src.top * sy;
        return {
            x: imageLeft + x0 * sx,
            y: top,
            width: (x1 - x0) * sx,
            height: (imageTop + src.bottom * sy) - top
        };
    }

    /** 金鯱の頭の冠(=足場になる面)。将軍の待機位置もここ。 */
    getStage6ShachiSolidBox(side) {
        return this.getStage6ShachiBox(side, SHACHI_SOLID_SRC);
    }

    /**
     * 最上階だけの追加コライダー(左右の金鯱)。プレイヤーと敵の物理に足す。
     * 通り抜けを止め、頭の上を足場として使えるようにする(将軍の登場位置でもある)。
     */
    getStage6ArenaColliders() {
        if (!this.isStage6Arena()) return [];
        const out = [];
        for (const side of [-1, 1]) {
            // 頭(足場) + 胴/背びれ(縦に高い壁)の2箱。1箱だと胴の高さでめり込む。
            for (const src of [SHACHI_SOLID_SRC, SHACHI_BODY_SRC]) {
                const box = this.getStage6ShachiBox(side, src);
                if (box) out.push({ ...box, isDestroyed: false, isStage6Shachi: true });
            }
        }
        return out;
    }

    getStage6ArenaCameraMinX() {
        return this.getStage6ArenaPhysicalLeft() - this.getStage6RoofVisibleOuterPx();
    }

    getStage6ArenaCameraMaxX() {
        return this.getStage6ArenaPhysicalRight() + this.getStage6RoofVisibleOuterPx() - CANVAS_WIDTH;
    }

    /**
     * Stage6最上階に上がった時点で将軍を【右の金鯱の頭の上】に立たせる。
     * ここでは実体を置くだけ。戦闘・ボスUI・場の締め(ビネット)は開戦(spawnBoss)まで始めない。
     * 呼ばれるのは最上階の1フレーム目=将軍は画面右外なので、湧く瞬間は見えない。
     */
    prepareStage6StandbyBoss() {
        if (!this.isStage6Arena() || this.bossSpawned || this.boss || this.stage6StandbyBoss) return;
        const boss = createBoss(this.stageNumber, 0, this.groundY, this.groundY);
        if (!boss) return;
        boss.isStandby = true;
        const pose = this.getStage6BossStandbyPose(boss);
        boss.x = pose.x;
        boss.groundY = this.getStage6ArenaGroundY();
        boss.y = pose.y;
        boss.vx = 0;
        boss.vy = 0;
        boss.isGrounded = true;
        boss.isEntering = false;
        boss.isAttacking = false;
        // 登ってくる忍者を見下ろしている。開戦で屋根へ飛び降りる。
        boss.facingRight = false;
        boss.attackFacingRight = false;
        this.stage6StandbyBoss = boss;
    }

    /**
     * Stage6最上階: 待っている将軍が全身+余白ぶん画面に入ったか(=開戦トリガー)。
     * カメラ停止位置まで歩かせると実測で鼻先200pxまで詰めてから開戦になり遅すぎた。
     * 「将軍を画面に収めた時点」で場を締める(このとき忍者は画面中央・将軍は右寄り)。
     */
    isStage6StandbyBossFramedIn() {
        const boss = this.stage6StandbyBoss;
        if (!boss) return false;
        const worldWidth = typeof boss.getWorldWidth === 'function'
            ? boss.getWorldWidth()
            : (boss.width || 80);
        // 【全身+余白が画面に入った時点】で開戦する。飛び降りる前に鯱の上で一拍
        // 置くので、中心だけを条件にすると「見下ろしている将軍が画面右端で切れている」
        // 絵になる。以前ここを全身条件にすると助走が4.6秒に伸びたが、
        // 会敵中はカメラを先行させる(STAGE6_DUEL_CAMERA_LEAD_PX)ようになったため、
        // プレイヤーは手前で足を止めたまま将軍を画面に収められる。
        return boss.x + worldWidth + 40 <= this.progress + CANVAS_WIDTH;
    }

    /**
     * 待機中の将軍。AIも物理も動かさず、立ち姿の微揺れ(motionTime駆動)だけ進める。
     * boss.update を呼ぶと AI が動き出すだけでなく、boss.js の画面内クランプで
     * xが可視範囲へ引き寄せられ、カメラに張り付いて近づいてくる。
     */
    updateStage6BossStandby(deltaTime) {
        const boss = this.stage6StandbyBoss;
        if (!boss) return;
        // 金鯱の画像は最上階の1フレーム目にはまだ読めていないことがある。
        // 読めた時点で「鯱の頭の上」へ座を移す(それまでは大棟の上で待つ)。
        if (!boss.stage6PerchSet) {
            const pose = this.getStage6BossStandbyPose(boss);
            if (pose.onShachi) {
                boss.x = pose.x;
                boss.y = pose.y;
                boss.stage6PerchSet = true;
            }
        }
        boss.motionTime = (boss.motionTime || 0) + deltaTime * 1000;
    }

    /** Stage6: 大屋根アリーナの中央ワールドX(飛び乗りの着地点) */
    getStage6ArenaCenterX() {
        return this.getStage6ArenaLeft() + STAGE6_CORNER.ARENA_WIDTH * 0.5;
    }

    /** Stage6: まだ登っていない角が残っているか */
    hasPendingStage6Corner() {
        return this.stageNumber === 6 && this.cornersClimbed < this.stage6CornerXs.length;
    }

    /** Stage6: xがいずれかの角帯(壁+バッファ)内か。敵/障害物のスポーン除外に使う */
    isInStage6CornerBand(x, buffer = STAGE6_CORNER.SPAWN_BUFFER) {
        if (this.stageNumber !== 6) return false;
        for (const cornerX of this.stage6CornerXs) {
            if (x >= cornerX - STAGE6_CORNER.WALL_LEFT_PX - buffer &&
                x <= cornerX + STAGE6_CORNER.WALL_RIGHT_PX + buffer) {
                return true;
            }
        }
        return false;
    }

    /** 最終階の出口階段へ進入できる限界X */
    getFinalFloorExitBarrierX() {
        if (!this.isFinalFloorExitStair()) return Infinity;
        return this._getStairPhysicalStart(this.floorScrollDirection);
    }

    /** プレイヤーが階段区間にいるか判定 */
    isInStairZone(playerX) {
        if (this.stageNumber !== 5) return false;
        const dir = this.floorScrollDirection;
        const physStart = this._getStairPhysicalStart(dir);
        const physEnd = this._getStairPhysicalEnd(dir);
        if (dir === 1) {
            return playerX >= physStart && playerX <= physEnd;
        } else {
            // 左登り: physStart > physEnd (start は大きい方)
            return playerX <= physStart && playerX >= physEnd;
        }
    }

    /** 階段内の登り進行度（0=階段入口, 1=階段頂上）を返す */
    getStairClimbProgress(playerX) {
        if (this.stageNumber !== 5 || this.isFinalFloorExitStair()) return 0;
        const dir = this.floorScrollDirection;
        const physStart = this._getStairPhysicalStart(dir);
        const physEnd = this._getStairPhysicalEnd(dir);
        const totalDist = Math.abs(physEnd - physStart);
        if (totalDist === 0) return 0;

        if (dir === 1) {
            // 右登り: playerX が大きいほど progress が大きい
            return Math.max(0, Math.min(1, (playerX - physStart) / totalDist));
        } else {
            // 左登り: playerX が小さいほど progress が大きい
            return Math.max(0, Math.min(1, (physStart - playerX) / totalDist));
        }
    }

    /** 階段上のプレイヤー位置に対応する動的groundYを返す */
    getStairGroundY(playerX) {
        if (this.stageNumber !== 5) return this.groundY;
        // 5Fでもボス部屋として階段の高さを利用するため制限を解除

        const dir = this.floorScrollDirection;
        const stairH = this.stairHeightPx;
        const physStart = this._getStairPhysicalStart(dir);
        const visibleWidth = STAGE5_FLOOR.PREVIOUS_STAIR_VISIBLE_WIDTH || 200;

        // --- 前フロアから登ってきた階段（スタート地点の穴）の判定 ---
        if (this.showPreviousStair) {
            if (dir === 1) {
                // 右方向フロア: 左端(0 ～ visibleWidth)に穴がある
                if (playerX < visibleWidth) {
                    const distFromTop = visibleWidth - playerX;
                    const depth = (distFromTop / this.stairZoneWidth) * stairH;
                    return this.baseGroundY + depth; // y軸は下がプラス
                }
            } else {
                // 左方向フロア: 右端(maxProgress - visibleWidth ～ maxProgress)に穴がある
                const holeLeftEdge = this.maxProgress - visibleWidth;
                if (playerX > holeLeftEdge) {
                    const distFromTop = playerX - holeLeftEdge;
                    const depth = (distFromTop / this.stairZoneWidth) * stairH;
                    return this.baseGroundY + depth;
                }
            }
        }

        // 最終階の右端は天守閣へ続く背景専用階段。傾斜として扱わない。
        if (this.isFinalFloorExitStair()) return this.baseGroundY;

        // --- 次のフロアへ登る階段（ゴール地点）の判定 ---
        if (dir === 1) {
            // 右登り: physStart より左は平地
            if (playerX < physStart) return this.baseGroundY;
        } else {
            // 左登り: physStart より右は平地
            if (playerX > physStart) return this.baseGroundY;
        }

        const progress = this.getStairClimbProgress(playerX);
        return this.baseGroundY - stairH * progress;
    }

    getStage4TownRowSpecs() {
        return [
            {
                key: 'townMachiya',
                height: 350,
                sourceWidth: 1721,
                sourceHeight: 665,
                platforms: [
                    { level: 2, x1: 45, x2: 610, y: 58 },
                    { level: 2, x1: 640, x2: 1168, y: 58 },
                    { level: 2, x1: 1210, x2: 1682, y: 58 },
                    { level: 1, x1: 18, x2: 615, y: 318 },
                    { level: 1, x1: 628, x2: 1168, y: 318 },
                    { level: 1, x1: 1188, x2: 1700, y: 318 }
                ]
            },
            {
                key: 'townShops',
                height: 350,
                sourceWidth: 1671,
                sourceHeight: 663,
                platforms: [
                    { level: 2, x1: 65, x2: 590, y: 62 },
                    { level: 2, x1: 610, x2: 1142, y: 62 },
                    { level: 2, x1: 1162, x2: 1610, y: 62 },
                    { level: 1, x1: 80, x2: 562, y: 318 },
                    { level: 1, x1: 610, x2: 1128, y: 318 },
                    { level: 1, x1: 1160, x2: 1605, y: 318 }
                ]
            },
            {
                key: 'townNagaya',
                height: 350,
                sourceWidth: 1677,
                sourceHeight: 655,
                platforms: [
                    { level: 2, x1: 62, x2: 560, y: 54 },
                    { level: 2, x1: 604, x2: 1120, y: 96 },
                    { level: 2, x1: 1165, x2: 1618, y: 68 },
                    { level: 1, x1: 25, x2: 568, y: 308 },
                    { level: 1, x1: 594, x2: 1120, y: 318 },
                    { level: 1, x1: 1150, x2: 1640, y: 310 }
                ]
            }
        ];
    }

    getStage4TownSpecMetrics(spec) {
        const image = this.stage4TownImages?.[spec.key];
        const sourceWidth = (image && image.naturalWidth > 0) ? image.naturalWidth : spec.sourceWidth;
        const sourceHeight = (image && image.naturalHeight > 0) ? image.naturalHeight : spec.sourceHeight;
        const height = spec.height;
        const width = height * (sourceWidth / sourceHeight);

        return { sourceWidth, sourceHeight, width, height };
    }

    // townShops（緑・青・赤の三連暖簾の店）は意匠が目立つので城下町全体で一度だけ登場させ、
    // アクセントとして町並みの列の中央に置く（残りは町家/長屋の繰り返しなので単調さが減る）。
    // stage4の城下町は全9区画(worldX -36〜約7878)。区画4がちょうど列の真ん中(前後4区画ずつ)。
    // 残りの区画は町家(machiya)と長屋(nagaya)を交互に敷き詰める。
    getStage4TownRowKeyForIndex(index) {
        const shopsIndex = 4;
        if (index === shopsIndex) return 'townShops';
        const alt = index > shopsIndex ? index - 1 : index;
        return (alt % 2 === 0) ? 'townMachiya' : 'townNagaya';
    }

    getStage4TownRowSequenceUntil(limitX) {
        const specs = this.getStage4TownRowSpecs();
        const rows = [];
        if (!specs.length) return rows;

        const specsByKey = new Map(specs.map((spec) => [spec.key, spec]));
        const joinOverlap = 22;
        let worldX = -36;
        for (let i = 0; i < 64 && worldX < limitX + 1200; i++) {
            const spec = specsByKey.get(this.getStage4TownRowKeyForIndex(i)) || specs[0];
            const metrics = this.getStage4TownSpecMetrics(spec);
            rows.push({
                ...spec,
                ...metrics,
                image: this.stage4TownImages?.[spec.key],
                rowIndex: i,
                worldX,
                drawY: this.groundY - metrics.height + 1
            });
            worldX += Math.max(480, metrics.width - joinOverlap);
        }

        return rows;
    }

    getStage4SurfaceRankFromFootY(footY) {
        const heightAboveGround = (this.groundY + LANE_OFFSET) - footY;
        if (heightAboveGround > 285) return 4;
        if (heightAboveGround > 188) return 3;
        if (heightAboveGround > 118) return 2;
        if (heightAboveGround > 42) return 1;
        return 0;
    }

    getStage4PlatformRank(platform) {
        if (platform && Number.isFinite(platform.stage4SurfaceRank)) {
            return platform.stage4SurfaceRank;
        }
        return this.getStage4SurfaceRankFromFootY(platform?.y || this.groundY + LANE_OFFSET);
    }

    getStage4ClimbPropDefinitions() {
        return {
            crates: {
                imageKey: 'climbPropCrates',
                sourceWidth: 760,
                sourceHeight: 505,
                sourceSurfaceY: 32,
                visualHeight: 86,
                colliderWidth: 132,
                rank: 1
            },
            handcart: {
                imageKey: 'climbPropHandcart',
                sourceWidth: 1176,
                sourceHeight: 317,
                sourceSurfaceY: 16,
                visualHeight: 54,
                colliderWidth: 690,
                rank: 1
            },
            bench: {
                imageKey: 'climbPropBench',
                sourceWidth: 373,
                sourceHeight: 139,
                sourceSurfaceY: 54,
                visualHeight: 84,
                colliderWidth: 172,
                rank: 1
            },
            sakeBarrels: {
                imageKey: 'climbPropSakeBarrels',
                sourceWidth: 400,
                sourceHeight: 289,
                sourceSurfaceY: 18,
                visualHeight: 104,
                colliderWidth: 168,
                rank: 1
            }
        };
    }

    getStage4ClimbPropTemplates(rowIndex = 0) {
        // 足場プロップは間引いて配置する（建物の屋根とは別の登攀用オブジェクト）。
        // 以前は1行3個で過密だったため、平均 約1.5個/行（およそ半減）まで減らし、
        // 種類・位置を散らして単調さと密度を抑える。各行に最低1個は残す。
        const patterns = [
            [
                { type: 'crates', x: 640 },
                { type: 'handcart', x: 1640 }
            ],
            [
                { type: 'bench', x: 900 }
            ],
            [
                { type: 'sakeBarrels', x: 360 },
                { type: 'crates', x: 1520 }
            ],
            [
                { type: 'handcart', x: 1060 }
            ]
        ];
        return patterns[((rowIndex % patterns.length) + patterns.length) % patterns.length];
    }

    getStage4TownRowsInRange(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        // 城手前の白壁屋敷の手前で町並みを打ち切る（屋敷ゾーンには町家を描かない／判定も作らない）。
        // 各パーツの右端で判定するので、建物が途中で切れたり継ぎ目に隙間が出たりしない。
        const approachStartX = this.getStage4CastleApproachStartX();
        return this.getStage4TownRowSequenceUntil(Math.min(rightWorld + 900, approachStartX))
            .filter((row) => (
                row.worldX + row.width <= approachStartX + 1 &&
                row.worldX <= rightWorld + 900 &&
                row.worldX + row.width >= leftWorld - 900
            ));
    }

    getStage4CastleWorldX() {
        return (this.maxProgress - CANVAS_WIDTH) - 100;
    }

    /**
     * Stage4の城門脇のかがり火(火の粉の出どころ)。スクリーン座標で返す。
     * 篝火は城郭下部の背景アートに焼き込まれているので、その描画基準
     * (getStage4CastleWorldX)からのワールドオフセットで位置を持つ。
     * 画面外のものは呼び出し側で使われても害はないが、ここで間引いておく。
     */
    getStage4BrazierSources() {
        if (this.stageNumber !== 4) return [];
        const castleWorldX = this.getStage4CastleWorldX();
        const y = this.groundY + STAGE4_BRAZIER_FLAME_DY;
        const out = [];
        for (const dx of STAGE4_BRAZIER_OFFSETS_X) {
            const x = castleWorldX + dx - this.progress;
            if (x < -120 || x > CANVAS_WIDTH + 120) continue;
            out.push({ x, y });
        }
        return out;
    }

    getStage4CastleApproachLayout() {
        if (this.stageNumber !== 4) return null;

        const castleWorldX = this.getStage4CastleWorldX();
        const approachStartX = this.getStage4CastleApproachStartX();
        const approachWorldX = approachStartX + 8;
        const approachHeight = 380;
        const approachWidth = Math.max(0, castleWorldX - approachWorldX - 64);

        return {
            castleWorldX,
            approachStartX,
            approachWorldX,
            approachHeight,
            approachWidth
        };
    }

    // 城手前の「町家列から武家屋敷区画へ切り替わる地点」のワールドX。
    // ここより右は城郭接近路として扱い、町家の屋根足場を持ち込まない。
    getStage4CastleApproachStartX() {
        if (this.stageNumber !== 4) return Infinity;
        const castleWorldX = this.getStage4CastleWorldX();
        // 町並み行の「右端」にスナップして返す。
        // こうすると町家を途中で切らずに済み、接近路の始まりも毎回安定する。
        const desired = castleWorldX - 2150;
        const rows = this.getStage4TownRowSequenceUntil(desired + 1200);
        let selected = rows[0];
        for (const row of rows) {
            if (row.worldX + row.width > desired) break;
            selected = row;
        }
        return selected ? selected.worldX + selected.width : desired;
    }

    getStage4CastleApproachColliders(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        const layout = this.getStage4CastleApproachLayout();
        if (!layout) return [];

        const baseY = this.groundY - 2;
        const colliders = [];
        const addPlatform = (x, y, width, rank, kind) => {
            if (width <= 0) return;
            colliders.push({
                x,
                y,
                width,
                height: 12,
                isDestroyed: false,
                isStage4RoofPlatform: true,
                isOneWayPlatform: true,
                roofLevel: rank,
                stage4SurfaceRank: this.getStage4SurfaceRankFromFootY(y),
                stage4ApproachKind: kind
            });
        };

        const approachImage = this.stage4TownImages?.castleApproachDistrict;
        const sourceW = (approachImage && approachImage.naturalWidth > 0) ? approachImage.naturalWidth : 2023;
        const sourceH = (approachImage && approachImage.naturalHeight > 0) ? approachImage.naturalHeight : 554;
        const drawH = layout.approachHeight;
        const drawW = layout.approachWidth || drawH * (sourceW / sourceH);
        const drawY = baseY - drawH + 3;
        const sx = drawW / sourceW;
        const sy = drawH / sourceH;
        const approachPlatforms = [
            { level: 1, x1: 10, x2: 218, y: 384, kind: 'approach-left-low-wall-roof' },
            { level: 2, x1: 218, x2: 444, y: 342, kind: 'approach-side-gate-roof' },
            { level: 1, x1: 446, x2: 708, y: 348, kind: 'approach-left-wall-roof' },
            { level: 4, x1: 576, x2: 1392, y: 28, kind: 'approach-residence-upper-roof' },
            // 翼屋根は瓦のある範囲だけを足場にする（内側は母屋の壁・柱・縁側で瓦が無い）。
            { level: 3, x1: 418, x2: 508, y: 175, kind: 'approach-residence-left-wing-roof' },
            { level: 2, x1: 704, x2: 1030, y: 204, kind: 'approach-main-gate-roof' },
            { level: 3, x1: 1436, x2: 1600, y: 175, kind: 'approach-residence-right-wing-roof' },
            { level: 1, x1: 1058, x2: 1326, y: 346, kind: 'approach-right-wall-roof' },
            { level: 1, x1: 1320, x2: 1496, y: 390, kind: 'approach-outer-low-roof' },
            // 外塀は櫓のあたりで一段下がる。瓦の棟に合わせて左右で高さを分ける（右側は約13px低い）。
            { level: 1, x1: 1496, x2: 1662, y: 410, kind: 'approach-outer-wall-roof' },
            { level: 1, x1: 1662, x2: 1805, y: 423, kind: 'approach-outer-wall-roof-far' }
        ];

        for (const platform of approachPlatforms) {
            addPlatform(
                layout.approachWorldX + platform.x1 * sx,
                drawY + platform.y * sy,
                (platform.x2 - platform.x1) * sx,
                platform.level,
                platform.kind
            );
        }

        return colliders.filter((platform) => (
            platform.x + platform.width >= leftWorld &&
            platform.x <= rightWorld
        ));
    }

    getStage4RoofColliders(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        const roofColliders = this.getStage4TownRowsInRange(leftWorld, rightWorld)
            .flatMap((row) => {
                if (!row.image || row.image.naturalWidth <= 0 || row.image.naturalHeight <= 0) return [];

                const scaleX = row.width / row.image.naturalWidth;
                const scaleY = row.height / row.image.naturalHeight;
                const roofWalkInsetY = 0;
                return (row.platforms || []).map((platform) => {
                    const y = row.drawY + (platform.y + roofWalkInsetY) * scaleY;
                    return {
                        x: row.worldX + platform.x1 * scaleX,
                        y,
                        width: Math.max(48, (platform.x2 - platform.x1) * scaleX),
                        height: 12,
                        isDestroyed: false,
                        isStage4RoofPlatform: true,
                        isOneWayPlatform: true,
                        roofLevel: platform.level,
                        stage4SurfaceRank: this.getStage4SurfaceRankFromFootY(y)
                    };
                }).filter((platform) => (
                    platform.x + platform.width >= leftWorld &&
                    platform.x <= rightWorld
                ));
            });

        // 町並みは接近路の手前で打ち切られる（getStage4TownRowsInRangeでクリップ）。
        // 城前の接近路は新規の武家屋敷区画画像だけに合わせて、瓦屋根上の足場を足す。
        return roofColliders
            .concat(this.getStage4ClimbPlatformColliders(leftWorld, rightWorld))
            .concat(this.getStage4CastleApproachColliders(leftWorld, rightWorld));
    }

    getStage4ClimbPlatformColliders(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        const defs = this.getStage4ClimbPropDefinitions();
        // 背景の家並みに馴染むよう、足場プロップはプレイヤー接地レーンより少し奥へ置く。
        // drawY と platformY が同じ baseY から出るので、見た目と足場判定は一緒に動く。
        const baseY = this.groundY + 12;
        return this.getStage4TownRowsInRange(leftWorld, rightWorld)
            .flatMap((row) => this.getStage4ClimbPropTemplates(row.rowIndex).map((template) => {
                const def = defs[template.type];
                if (!def) return null;

                const image = this.stage4TownImages?.[def.imageKey];
                const sourceWidth = (image && image.naturalWidth > 0) ? image.naturalWidth : def.sourceWidth;
                const sourceHeight = (image && image.naturalHeight > 0) ? image.naturalHeight : def.sourceHeight;
                const scale = def.visualHeight / Math.max(1, sourceHeight);
                const drawWidth = sourceWidth * scale;
                const drawHeight = sourceHeight * scale;
                const centerX = row.worldX + template.x * (row.width / row.sourceWidth);
                const drawX = centerX - drawWidth * 0.5;
                const drawY = baseY - drawHeight;
                const platformY = drawY + def.sourceSurfaceY * scale;
                const platformWidth = Math.min(drawWidth - 20, Math.max(52, def.colliderWidth * scale));

                return {
                    x: centerX - platformWidth * 0.5,
                    y: platformY,
                    width: platformWidth,
                    height: 12,
                    isDestroyed: false,
                    isStage4ClimbPlatform: true,
                    isOneWayPlatform: true,
                    climbKind: template.type,
                    roofLevel: def.rank,
                    stage4SurfaceRank: def.rank,
                    imageKey: def.imageKey,
                    drawX,
                    drawY,
                    drawWidth,
                    drawHeight
                };
            }).filter(Boolean))
            .filter((platform) => (
                platform.x + platform.width >= leftWorld &&
                platform.x <= rightWorld
            ));
    }

    /** フロア遷移を開始する */
    startFloorTransition() {
        if (this.stageNumber !== 5 || this.isFloorTransitioning) return;
        this.isFloorTransitioning = true;
        this.floorTransitionPhase = 1; // 暗転開始
        this.floorTransitionTimer = this.transitionFadeMs;
    }

    /** Stage6: 角(隅櫓)遷移を開始する */
    startCornerTransition() {
        if (this.stageNumber !== 6 || this.isFloorTransitioning) return;
        this.isFloorTransitioning = true;
        this.floorTransitionPhase = 1; // 暗転開始
        this.floorTransitionTimer = this.transitionFadeMs;
    }

    /**
     * Stage6 角3: 鎖鎌を頭上の軒へ掛けて登る演出を開始する。
     * 廻縁の突き当たりから屋根の上へ上がる唯一の自然な手段(忍者の身体能力)。
     * 鎖鎌が軒に掛かる → 鎖で引き上げられて画面上へ消える → 暗転 → 大屋根に着地。
     */
    startStage6GrappleClimb(player) {
        if (this.stageNumber !== 6 || this.isStage6Grappling() || this.isFloorTransitioning) return;
        if (!this.stage6Grapple) this.stage6Grapple = createGrappleState();
        startGrapple(
            this.stage6Grapple,
            this.getStage6ActiveCornerX(),
            player,
            this.getStage6EaveTip()
        );
    }

    /** 鎖鎌登攀中か */
    isStage6Grappling() {
        return isGrappleActive(this.stage6Grapple);
    }

    /** 鎖鎌登攀の進行(deltaTime秒)。完了したらtrueを返す */
    updateStage6GrappleClimb(deltaTime) {
        if (!this.isStage6Grappling()) return false;
        return updateGrapple(this.stage6Grapple, deltaTime, audio);
    }

    /** 鎖鎌の見た目(鎌の位置・軌跡・火花)を進める。game.js の更新ループから呼ぶ */
    updateStage6GrappleVisual(deltaTime, handX, handY, playerCx, playerCy) {
        if (!this.isStage6Grappling()) return;
        updateGrappleVisual(this.stage6Grapple, deltaTime, handX, handY, playerCx, playerCy);
    }

    /** 現在フェーズの進行度(0..1) */
    getStage6GrappleProgress() {
        return grappleProgress(this.stage6Grapple);
    }

    /** 引き上げの補間量(0..1)。頂点で減速する */
    getStage6GrapplePullEase() {
        return grapplePullEase(this.stage6Grapple);
    }

    /** 引き上げの二次ベジェ上にあるプレイヤー左上座標 */
    getStage6GrapplePullPosition(playerWidth) {
        return grapplePullPosition(this.stage6Grapple, playerWidth);
    }

    /** 鎖鎌登攀の現在フェーズ(GRAPPLE_PHASE) */
    getStage6GrapplePhase() {
        return this.stage6Grapple?.phase || GRAPPLE_PHASE.NONE;
    }

    /** 引き上げの補間元(プレイヤー左上のワールド座標) */
    getStage6GrappleFrom() {
        const g = this.stage6Grapple;
        return g ? { x: g.fromX, y: g.fromY } : null;
    }

    /** 鎌が噛んでいる位置(ワールド) */
    getStage6GrappleAnchor() {
        const g = this.stage6Grapple;
        return g ? { x: g.anchorX, y: g.anchorY } : null;
    }

    /** 背面パス(軌跡・鎖)。ワールド変換の内側で、プレイヤーより前に呼ぶ */
    renderStage6GrappleBehind(ctx) {
        renderGrappleBehind(ctx, this.stage6Grapple);
    }

    /** 前面パス(鎌ヘッド・火花)。ワールド変換の内側で、プレイヤーより後に呼ぶ */
    renderStage6GrappleFront(ctx) {
        renderGrappleFront(ctx, this.stage6Grapple);
    }

    /** フロア遷移のアニメーション更新 (deltaTime in seconds) */
    updateFloorTransition(deltaTime) {
        if (!this.isFloorTransitioning) return false;

        this.floorTransitionTimer -= deltaTime * 1000;

        if (this.floorTransitionTimer <= 0) {
            if (this.floorTransitionPhase === 1) {
                // 暗転完了 → 暗転待機（この間にフロア/ゾーン切り替え）
                this.floorTransitionPhase = 2;
                this.floorTransitionTimer = this.transitionWaitMs;
                if (this.stageNumber === 6) {
                    this.advanceCorner();
                } else {
                    this.advanceFloor();
                }
            } else if (this.floorTransitionPhase === 2) {
                // 暗転待機完了 → フェードイン開始
                this.floorTransitionPhase = 3;
                this.floorTransitionTimer = this.transitionFadeInMs;
            } else if (this.floorTransitionPhase === 3) {
                // フェードイン完了 → 遷移終了
                this.isFloorTransitioning = false;
                this.floorTransitionPhase = 0;
                this.floorTransitionTimer = 0;
            }
        }
        return this.isFloorTransitioning;
    }

    /** 次のフロアへ移行する（内部リセット） */
    advanceFloor() {
        if (this.stageNumber !== 5) return;
        
        // 前フロアの方向を記録（前階段表示用）
        this.previousStairDirection = this.floorScrollDirection; // 現在の方向（遷移前）を保存
        
        this.currentFloor++;
        // フロア方向: 奇数=右, 偶数=左
        this.floorScrollDirection = (this.currentFloor % 2 === 1) ? 1 : -1;
        
        // 敵・障害物をリセット
        this.enemies = [];
        this.obstacles = [];
        this.spawnTimer = 800;
        this.obstacleTimer = 0;
        
        // groundYをリセット
        this.groundY = this.baseGroundY;
        
        // 進行度（スクロール）をリセット
        // 右進行なら 0, 左進行なら maxProgress
        this.progress = (this.floorScrollDirection === 1) ? 0 : this.maxProgress;
        this.lastProgress = this.progress;
        
        // 最終フロアかどうかで maxProgress を調整
        if (this.currentFloor >= this.maxFloor) {
            // 5Fはボスが出るため階段なし = フル幅
            this.maxProgress = this.floorMaxProgress;
        } else {
            this.maxProgress = this.floorMaxProgress;
        }
        
        // 前の階段を表示
        this.showPreviousStair = (this.currentFloor > 1);
        
        // フロア名表示タイマー
        this.floorNameDisplayTimer = this.floorNameDisplayDuration;
        
        // バランスプロファイルを再計算（フロア難易度倍率適用）
        this.balanceProfile = this.getBalanceProfile();
    }

    /** Stage6: 次の廻縁(ゾーン)へ移行する。完全暗転中に呼ばれる。 */
    advanceCorner() {
        if (this.stageNumber !== 6) return;

        // 登った角を記録してから次の角をアクティブ化する
        this.lastClimbedCornerX = this.getStage6ActiveCornerX();
        this.cornersClimbed++;

        // 敵・障害物をリセット（プレイヤーを境界の先へ飛ばすため、残すと瞬間湧きに見える）
        this.enemies = [];
        this.obstacles = [];
        this.spawnTimer = 800;
        this.obstacleTimer = 0;

        // stage6のgroundYは動かさない設計だが明示的に戻しておく
        this.groundY = this.baseGroundY;

        // 大屋根へ降り立っただけではボス演出(場の締め)を始めない。
        // 左棟端から決戦地点へ歩く間は背景本来の明度を保ち、ボス接近時にだけ場を締める。
        // ただし【ラスボス曲は最上層へ遷移した時点で鳴らす】。暗転中に切り替わるので
        // 曲の入りが画面の切り替わりと一致する。
        if (this.isStage6Arena()) {
            this.bossEncounterBlend = 0;
            this.bossPetalT = 0;
            this.bossEntranceFlash = 0;
            if (!this.isBossBgmPlaying()) {
                audio.playBgm('boss', this.stageNumber, 1000, 0);
            }
        }

        // progress/maxProgressは触らない（stage5と違い世界座標は連続。xスナップはgame.js側）
    }

    /** フロアごとの難易度倍率を返す */
    getFloorDifficultyMult() {
        if (this.stageNumber !== 5 || !this.currentFloor) return 1.0;
        const index = Math.max(0, Math.min(STAGE5_FLOOR.DIFFICULTY_SCALE.length - 1, this.currentFloor - 1));
        return STAGE5_FLOOR.DIFFICULTY_SCALE[index];
    }

    /** フロア遷移のオーバーレイ透明度を返す */
    getFloorTransitionAlpha() {
        if (!this.isFloorTransitioning) return 0;
        if (this.floorTransitionPhase === 1) {
            // 暗転中: 0 → 1
            return 1 - this.floorTransitionTimer / this.transitionFadeMs;
        } else if (this.floorTransitionPhase === 2) {
            // 暗転待機: 常に1
            return 1;
        } else if (this.floorTransitionPhase === 3) {
            // フェードイン: 1 → 0
            return this.floorTransitionTimer / this.transitionFadeInMs;
        }
        return 0;
    }

    /** フロア遷移の暗転オーバーレイを描画する */
    renderFloorTransition(ctx) {
        const alpha = this.getFloorTransitionAlpha();
        if (alpha <= 0.001) return;
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, alpha)})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
    }

    /** フロア名（「一階」「二階」等）を表示する。stage6は文字を出さず背景で語る方針 */
    renderFloorName(ctx) {
        if (this.stageNumber !== 5 || this.floorNameDisplayTimer <= 0) return;
        const floorNames = ['一階', '二階', '三階', '四階', '五階'];
        const name = floorNames[this.currentFloor - 1] || '';
        if (!name) return;

        const progress = 1 - this.floorNameDisplayTimer / this.floorNameDisplayDuration;
        // フェードイン → 持続 → フェードアウト
        let alpha = 1;
        if (progress < 0.15) {
            alpha = progress / 0.15;
        } else if (progress > 0.7) {
            alpha = (1 - progress) / 0.3;
        }
        alpha = Math.max(0, Math.min(1, alpha));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#e8d5a3';
        ctx.font = 'bold 48px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 縁取り
        ctx.strokeStyle = 'rgba(40, 20, 10, 0.8)';
        ctx.lineWidth = 4;
        ctx.strokeText(name, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3);
        ctx.fillText(name, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3);
        ctx.restore();
    }

    /** 階段区間の石段を描画する */
    renderStairZone(ctx, scrollX) {
        if (this.stageNumber !== 5 || !this.stairImage) return;
        // ボスフロア（5F）では「天守閣へ続く登れない階段」として右端に背景描画される

        const direction = this.floorScrollDirection;
        const startWorldX = this._getStairPhysicalStart(direction);
        const startScreenX = startWorldX - scrollX;
        const s = this.stairDrawScale; // 描画スケール (0.4)

        // 階段画像の底辺（起点）をゲーム世界の接地ラインに合わせる
        // 壁（背景）へのめり込みを防ぐため、Y座標を少し下（畳側）へオフセットする
        const stairYOffset = 40;
        const anchorScreenX = startScreenX;
        const anchorScreenY = this.baseGroundY + LANE_OFFSET + stairYOffset;

        ctx.save();
        if (direction === 1) {
            ctx.translate(anchorScreenX, anchorScreenY);
            ctx.scale(s, s);
            ctx.drawImage(this.stairImage, -this.stairOriginX, -this.stairOriginY);
        } else {
            ctx.translate(anchorScreenX, anchorScreenY);
            ctx.scale(-s, s);
            ctx.drawImage(this.stairImage, -this.stairOriginX, -this.stairOriginY);
        }
        ctx.restore();
    }

    /**
     * 前フロア階段の頂上部分を描画する（登ってきた口）。
     *
     * ＜階段の物理的整合性＞
     * - prevDir=1（前フロアで右へ登った）場合、現フロア(dir=-1)は右端からスタートする。
     *   つまり、登ってきた「穴」は右端(maxProgress)の背後にあるべき。
     *   → 右登りの階段画像を描画し、その頂上（画像の右端）が worldX=maxProgress になるように配置する。
     *
     * - prevDir=-1（前フロアで左へ登った）場合、現フロア(dir=1)は左端からスタートする。
     *   つまり、登ってきた「穴」は左端(0)の背後にあるべき。
     *   → 左登りの階段画像（flip描画）を描画し、その頂上（flip視覚的左端）が worldX=0 になるように配置する。
     */
    renderPreviousStairTop(ctx, scrollX) {
        if (this.stageNumber !== 5 || !this.showPreviousStair || !this.stairImage) return;

        const prevDir = this.previousStairDirection;
        const visibleWidth = STAGE5_FLOOR.PREVIOUS_STAIR_VISIBLE_WIDTH || 200;
        const s = this.stairDrawScale;
        const TOTAL_L = this.stairTotalL;
        const TOTAL_H = this.stairTotalH;

        let clipWorldLeft;
        let isFlippedDraw = false;
        let worldTopX;

        if (prevDir === 1) {
            // 右に向かって登ってきた場合（現フロアは左へ進む）
            // 穴は右端(maxProgress)に作るので床は左側。
            // 階段の最上段を穴の左縁(clipWorldLeft)に合わせるため、\方向(フリップ)で右下へ描画
            clipWorldLeft = this.maxProgress - visibleWidth;
            worldTopX = clipWorldLeft; 
            isFlippedDraw = true;
        } else {
            // 左に向かって登ってきた場合（現フロアは右へ進む）
            // 穴は左端(0)に作るので床は右側。
            // 階段の最上段を穴の右縁(visibleWidth)に合わせるため、/方向で左下へ描画
            clipWorldLeft = 0;
            worldTopX = visibleWidth;
            isFlippedDraw = false;
        }

        const clipScreenX = clipWorldLeft - scrollX;
        const topScreenX = worldTopX - scrollX;

        // 穴の表現（黒塗り）
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(clipScreenX, this.baseGroundY, visibleWidth, CANVAS_HEIGHT - this.baseGroundY);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipScreenX - 60, this.baseGroundY - 150, visibleWidth + 120, CANVAS_HEIGHT - this.baseGroundY + 150);
        ctx.clip();

        // 頂上のアンカー: 階段最上段の先端をゲーム世界の接地ラインに合わせる
        // 階段画像の頂上は originX + TOTAL_L, originY - TOTAL_H
        // オフセットを追加して、壁へのめり込みを防ぎつつ先のフロアと接続させる
        const stairYOffset = 40;
        const anchorScreenY = this.baseGroundY + LANE_OFFSET + stairYOffset;

        if (!isFlippedDraw) {
            ctx.translate(topScreenX, anchorScreenY);
            ctx.scale(s, s);
            ctx.drawImage(this.stairImage, -(this.stairOriginX + TOTAL_L), -(this.stairOriginY - TOTAL_H));
        } else {
            ctx.translate(topScreenX, anchorScreenY);
            ctx.scale(-s, s);
            ctx.drawImage(this.stairImage, -(this.stairOriginX + TOTAL_L), -(this.stairOriginY - TOTAL_H));
        }
        ctx.restore();
    }

    getBalanceProfile() {
        // ステージが長くなったので、湧き頻度も少し緩和しつつ調整
        const profiles = {
            1: {
                spawnStart: 1860,
                spawnMin: 1080,
                spawnJitter: 320,
                multiSpawnBase: 0.16,
                multiSpawnPeak: 0.28,
                leftSpawnBase: 0.14,
                leftSpawnPeak: 0.22,
                obstacleChance: 0.22,
                obstacleIntervalMin: 2600,
                obstacleIntervalMax: 4200
            },
            2: {
                spawnStart: 1750,
                spawnMin: 1000,
                spawnJitter: 360,
                multiSpawnBase: 0.2,
                multiSpawnPeak: 0.32,
                leftSpawnBase: 0.17,
                leftSpawnPeak: 0.25,
                obstacleChance: 0.26,
                obstacleIntervalMin: 2400,
                obstacleIntervalMax: 3900
            },
            3: {
                spawnStart: 1650,
                spawnMin: 920,
                spawnJitter: 390,
                multiSpawnBase: 0.24,
                multiSpawnPeak: 0.36,
                leftSpawnBase: 0.2,
                leftSpawnPeak: 0.28,
                obstacleChance: 0.78,
                obstacleIntervalMin: 1200,
                obstacleIntervalMax: 2200
            },
            4: {
                spawnStart: 1550,
                spawnMin: 840,
                spawnJitter: 420,
                multiSpawnBase: 0.28,
                multiSpawnPeak: 0.40,
                leftSpawnBase: 0.22,
                leftSpawnPeak: 0.3,
                obstacleChance: 0.14,
                obstacleIntervalMin: 3600,
                obstacleIntervalMax: 5600
            },
            5: {
                spawnStart: 1460,
                spawnMin: 770,
                spawnJitter: 450,
                multiSpawnBase: 0.32,
                multiSpawnPeak: 0.44,
                leftSpawnBase: 0.24,
                leftSpawnPeak: 0.32,
                obstacleChance: 0.34,
                obstacleIntervalMin: 1900,
                obstacleIntervalMax: 3200
            },
            6: {
                spawnStart: 1400,
                spawnMin: 720,
                spawnJitter: 470,
                multiSpawnBase: 0.34,
                multiSpawnPeak: 0.46,
                leftSpawnBase: 0.25,
                leftSpawnPeak: 0.34,
                obstacleChance: 0.36,
                obstacleIntervalMin: 1800,
                obstacleIntervalMax: 3000
            }
        };
        const profile = profiles[this.stageNumber] || profiles[3];
        // Stage 5: フロアごとの難易度倍率を適用
        if (this.stageNumber === 5 && this.currentFloor) {
            const mult = this.getFloorDifficultyMult();
            profile.spawnStart = Math.round(profile.spawnStart / mult);
            profile.spawnMin = Math.round(profile.spawnMin / mult);
        }
        return profile;
    }
    
    getEnemyWeights() {
        // ステージごとに敵の出現確率を変える
        switch (this.stageNumber) {
            case 1:
                return { ashigaru: 85, samurai: 15, busho: 0, ninja: 0 };
            case 2:
                return { ashigaru: 68, samurai: 28, busho: 4, ninja: 0 };
            case 3:
                return { ashigaru: 48, samurai: 34, busho: 8, ninja: 10 };
            case 4:
                return { ashigaru: 34, samurai: 32, busho: 14, ninja: 20 };
            case 5:
                return { ashigaru: 20, samurai: 34, busho: 22, ninja: 24 };
            case 6:
                return { ashigaru: 12, samurai: 30, busho: 28, ninja: 30 };
            default:
                return { ashigaru: 65, samurai: 30, busho: 0, ninja: 5 };
        }
    }

    getMaxActiveEnemies() {
        switch (this.stageNumber) {
            case 1: return 5;
            case 2: return 6;
            case 3: return 7;
            case 4: return 9;
            case 5: return 10;
            case 6: return 11;
            default: return 8;
        }
    }

    getActiveEnemyCount() {
        let activeCount = 0;
        for (const enemy of this.enemies) {
            if (enemy && enemy.isAlive && !enemy.isDying) activeCount++;
        }
        return activeCount;
    }

    createSkyParticles(count = 18) {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const baseX = Math.abs((Math.sin(i * 12.989 + 2.1) * 43758.5453) % 1);
            const baseY = Math.abs((Math.cos(i * 7.233 + 1.7) * 19642.349) % 1);
            particles.push({
                nx: baseX,
                ny: baseY,
                speed: 1.6 + i * 0.05,
                phase: i * 1.3,
                // 2周波ブレンド用の副成分（星ごとにバラけさせ、単一sineの機械的な点滅を崩す）
                subSpeed: 2.4 + baseY * 2.2,
                subPhase: baseX * 6.283 + i * 0.7
            });
        }
        return particles;
    }
    
    createBackgroundLayers() {
        // ゲーム全編を通じて昼〜夕方〜夜〜深夜と自然に時間が経過するように、
        // 各ステージのstartとendの色が前後のステージで滑らかに繋がるように定義
        const backgrounds = {
            1: { // 早朝: 暁から朝へ（竹林）
                start: { sky: ['#07112d', '#182b58'], far: '#1f3348', mid: '#2d4761', near: '#3a5f7d' },
                mid:   { sky: ['#1f3477', '#df522e'], far: '#2f4a5f', mid: '#3f6278', near: '#547f92' },
                end:   { sky: ['#3d77b0', '#ff8a32'], far: '#406e69', mid: '#56907f', near: '#6cae97' },
                elements: 'bamboo'
            },
            2: { // 昼間: 明るい青空（街道）
                start: { sky: ['#7fbcf2', '#b8ddff'], far: '#607182', mid: '#728595', near: '#8398a8' },
                mid:   { sky: ['#8ec9f7', '#d2e9ff'], far: '#688092', mid: '#7b92a4', near: '#8ea5b6' },
                end:   { sky: ['#76b8ea', '#9fd4ff'], far: '#5f798d', mid: '#708ba0', near: '#809db2' },
                elements: 'kaido'
            },
            3: { // 夕暮れ: 逢魔が時へ（山道）
                start: { sky: ['#f0c090', '#e8a06a'], far: '#7a6050', mid: '#8a7060', near: '#9a8070' },
                mid:   { sky: ['#c0401c', '#7a1e18'], far: '#4a2820', mid: '#5e3428', near: '#744038' },
                end:   { sky: ['#2a1028', '#5a1808'], far: '#301818', mid: '#402020', near: '#502828' },
                elements: 'mountain'
            },
            4: { // 宵の口: 月の出〜深夜（城下町）
                start: { sky: ['#0b1022', '#181030'], far: '#18171f', mid: '#222030', near: '#2e2c3e' },
                mid:   { sky: ['#0e1a3a', '#0a1020'], far: '#101422', mid: '#181e30', near: '#222840' },
                end:   { sky: ['#162033', '#0a111a'], far: '#0f141f', mid: '#171d2d', near: '#222a3f' },
                elements: 'town'
            },
            5: { // 城内（落ち着いた朱色の回廊）
                start: { sky: ['#4a241c', '#7a3e26'], far: '#3f1a14', mid: '#4e221b', near: '#632b1e' },
                mid:   { sky: ['#542a1e', '#8a442a'], far: '#4a2018', mid: '#5b261f', near: '#713123' },
                end:   { sky: ['#45211b', '#723825'], far: '#3a1813', mid: '#481d18', near: '#5c271c' },
                elements: 'castle'
            },
            6: { // 天守閣（深夜から最終日の出）
                start: { sky: ['#0b1016', '#040608'], far: '#06060B', mid: '#0B0A11', near: '#11101A' },
                mid:   { sky: ['#07142a', '#030d1c'], far: '#080d16', mid: '#0e1520', near: '#141e2e' },
                end:   { sky: ['#f39c12', '#e74c3c'], far: '#5b2c1f', mid: '#7d3c2a', near: '#a14d36' },
                elements: 'tenshu'
            }
        };
        
        return backgrounds[this.stageNumber] || backgrounds[1];
    }
    
    update(deltaTime, player) {
        this.stageTime += deltaTime * 1000;
        const progressDelta = this.progress - this.lastProgress;
        this.lastProgress = this.progress;
        if (player) {
            this.playerProbe.x = player.x;
            this.playerProbe.y = player.y;
            this.playerProbe.vx = player.vx || 0;
            this.playerProbe.width = (typeof player.getWorldWidth === 'function' ? player.getWorldWidth() : player.width) || 0;
            this.playerProbe.height = (typeof player.getWorldHeight === 'function' ? player.getWorldHeight() : player.height) || 0;
            this.playerProbe.isGrounded = !!player.isGrounded;
        }
        this.updateBambooLeafEffects(deltaTime, progressDelta);
        if (this.bossIntroTimer > 0) {
            this.bossIntroTimer = Math.max(0, this.bossIntroTimer - deltaTime * 1000);
        }

        // Stage 5 フロア名表示タイマー
        if (this.stageNumber === 5 && this.floorNameDisplayTimer > 0) {
            this.floorNameDisplayTimer = Math.max(0, this.floorNameDisplayTimer - deltaTime * 1000);
        }

        // ボス戦のブレンド率更新
        const bossIntroRatio = (this.bossIntroTimer > 0)
            ? (this.bossIntroTimer / this.bossIntroDuration)
            : 0;
        const bossEncounterActive = this.bossSpawned && !this.bossDefeated;
        if (bossEncounterActive) {
            this.bossEncounterBlend = this.bossIntroTimer > 0
                ? this.smoothstep(0, 1, 1 - bossIntroRatio)
                : 1.0;
            this._bossBlendFadeMs = 0;
        } else if (this.bossDefeated && this.bossEncounterBlend > 0) {
            // 撃破後は即0に落とさず、撃破余韻と同じ時間をかけて場を晴らす。
            // 旧実装は bossDefeated の瞬間に 0 になり、演出が「パチッと切れて」いた。
            if (!this._bossBlendFadeMs) {
                this._bossBlendFadeMs = 0;
                this._bossBlendFadeFrom = this.bossEncounterBlend;
            }
            this._bossBlendFadeMs += deltaTime * 1000;
            const fade = this.clamp01(this._bossBlendFadeMs / BOSS_STAGING.DEFEAT_BLEND_FADE_MS);
            const ease = this.smoothstep(0, 1, fade);
            this.bossEncounterBlend = this._bossBlendFadeFrom * (1 - ease);
            // ボス名とHPバーも同時に引く。討ち取った相手の空っぽのHPバーが余韻の間
            // 画面上部に残り続けると締まらない(突破アナウンスにまで写り込む)。
            this.bossUiRevealT = 1 - ease;
        } else {
            this.bossEncounterBlend = 0;
            this._bossBlendFadeMs = 0;
        }

        // 桜/金粉の立ち上がり。【名乗りの短冊が出る瞬間から】開く。
        // 接近(approach)と着地(impact)の間は0のままで、name/ready/開戦後は1。
        // 撃破後は bossIntroPhase が null=1 のままにして、退場は
        // bossEncounterBlend 側の DEFEAT_BLEND_FADE_MS に任せる(二重フェード防止)。
        const stagingBeforeName = this.bossIntroPhase === 'approach'
            || this.bossIntroPhase === 'impact';
        const petalTarget = (this.bossSpawned && !stagingBeforeName) ? 1 : 0;
        const petalStep = (deltaTime * 1000) / STAGE6_PETAL_FADE_IN_MS;
        // 目標に達したら止める。三項演算子で等値を減算側に落とすと
        // 1.0と0.97を毎フレーム往復してα2%のちらつきになる(実測)。
        if (this.bossPetalT < petalTarget) {
            this.bossPetalT = Math.min(petalTarget, this.bossPetalT + petalStep);
        } else if (this.bossPetalT > petalTarget) {
            this.bossPetalT = Math.max(petalTarget, this.bossPetalT - petalStep);
        }

        // ボス戦中〜撃破余韻中は専用更新
        if (this.bossSpawned && (!this.bossDefeated || this.bossDefeatLingerTimer > 0)) {
            this.updateBossFight(deltaTime, player);
            return;
        }
        
        // 敵出現（スクロール位置に関係なく判定）
        // Stage6最上階だけは開戦まで雑魚を出さない。大屋根の上は将軍と対峙するための
        // 静かな助走区間で、ここに雑魚が湧くと「待っている将軍」に視線が向かない。
        // (開戦後の少量スポーンは updateBossFight 側で従来どおり行う)
        const arenaPreFight = this.isStage6Arena() && !this.bossSpawned;
        this.spawnTimer += deltaTime * 1000;
        if (!arenaPreFight && this.spawnTimer >= this.spawnInterval && this.progress < this.maxProgress * 0.98) {
            this.spawnEnemy();
            this.spawnTimer = 0;
            
            // 進行に応じて出現間隔を短くしつつ、ステージごとに密度曲線を調整
            const progressRatio = this.progress / this.maxProgress;
            const spawnStart = this.balanceProfile.spawnStart;
            const spawnMin = this.balanceProfile.spawnMin;
            const baseInterval = spawnStart - (spawnStart - spawnMin) * progressRatio;
            this.spawnInterval = baseInterval + Math.random() * this.balanceProfile.spawnJitter;
        }
        
        // Stage6最上階: 将軍は開戦前から大屋根の右端に立っている(スクロールでフレームイン)。
        // 生成は最上階に入った最初のフレーム=まだ画面右外なので、湧く瞬間は映らない。
        if (this.isStage6Arena() && !this.bossSpawned) {
            this.prepareStage6StandbyBoss();
            this.updateStage6BossStandby(deltaTime);
        }

        // ボス出現
        // 描画スケールではなく、カメラが右端で停止したかどうかで判定する。
        const bossScrollStopX = Math.max(0, this.maxProgress - CANVAS_WIDTH);
        let canSpawnBoss = this.progress >= bossScrollStopX - 0.5;

        // Stage6最上階は「将軍を画面に収めた時点」で開戦する(カメラ停止待ちだと遅すぎる)
        if (this.stageNumber === 6 && this.isStage6StandbyBossFramedIn()) {
            canSpawnBoss = true;
        }

        if (this.stageNumber === 5) {
            // Stage 5 の場合は最終フロアのみ
            canSpawnBoss = canSpawnBoss && (this.currentFloor >= this.maxFloor);
        }

        if (canSpawnBoss && !this.bossSpawned) {
            this.spawnBoss();
        }
        
        // 障害物出現はボス戦中および階段区間では停止
        const noObstaclePhase = (this.bossSpawned && !this.bossDefeated);
        this.obstacleTimer += deltaTime * 1000;
        
        // 階段の少し手前 (200px) までしか障害物を置かないように制限
        const stairBuffer = 200;
        const stairStart = this.getStairStartX();
        const canSpawnObstacle = this.progress < Math.min(this.maxProgress * 0.98, stairStart - stairBuffer);

        if (this.obstacleTimer >= this.obstacleInterval && canSpawnObstacle && !noObstaclePhase) {
              this.spawnObstacle();
              this.obstacleTimer = 0;
              const minInterval = this.balanceProfile.obstacleIntervalMin;
              const maxInterval = this.balanceProfile.obstacleIntervalMax;
              this.obstacleInterval = minInterval + Math.random() * Math.max(1, (maxInterval - minInterval));
        }
        
        // 敵更新
        const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
        const enemyObstacles = this.getStageEnemyObstacles(activeObstacles);
        this.updateEnemies(deltaTime, player, enemyObstacles);
        this.updateObstacles(deltaTime);
    }
    
    // 着地の衝撃（approach → impact）。黒フラッシュと土煙を同時に立てる。
    beginBossIntroImpact() {
        if (this.bossIntroPhase !== 'approach') return;
        this.bossIntroPhase = 'impact';
        this.bossIntroPhaseTimer = 0;
        this.bossEntranceFlash = BOSS_STAGING.INTRO_IMPACT_FLASH;

        const g = window.game;
        if (g && typeof g.spawnGroundDust === 'function' && this.boss) {
            const bw = typeof this.boss.getWorldWidth === 'function'
                ? this.boss.getWorldWidth() : (this.boss.width || 120);
            const bh = typeof this.boss.getWorldHeight === 'function'
                ? this.boss.getWorldHeight() : (this.boss.height || 180);
            const cx = this.boss.x + bw * 0.5;
            const cy = this.boss.y + bh;
            // 左右に大きく割れる着地煙。dir 未指定＝左右へ振り分けられる。
            g.spawnGroundDust(cx, cy, { count: 14, intensity: 1, speed: 1.5, rise: 0.5, size: 13 });
            g.spawnGroundDust(cx - bw * 0.45, cy, { count: 6, intensity: 0.8, speed: 1.2, size: 10 });
            g.spawnGroundDust(cx + bw * 0.45, cy, { count: 6, intensity: 0.8, speed: 1.2, size: 10 });
        }
    }

    // 【登場の5連は寸止めで止める】。連撃の踏み込みは1段で最大24px/フレーム進み、
    // 4段目(天穿)の判定は boss.x の左235pxまで伸びるので、そのまま振らせると
    // 名乗る前にプレイヤーへ届く。前進だけを刃の届かない距離で止める。
    // 押し戻しはしない(プレイヤーが自分から踏み込んだときにボスが後ずさりして見える)。
    // 触れても削れないのは game.js 側の被弾除外が担保する。
    clampBossIntroNearMiss(player) {
        if (!this.boss || !player || !this.isBossIntroBeforeCall()) return;
        if (!(this.boss.vx < 0)) return; // 左＝プレイヤー側へ進んでいる時だけ
        const limitX = player.x + player.getWorldWidth() + STAGE6_BOSS_INTRO_NEAR_MISS_PX;
        if (this.boss.x < limitX) {
            this.boss.x = limitX;
            this.boss.vx = 0;
        }
    }

    // 【名乗りを終えるまでは互いに手出し無用】の区間判定。
    // ボス側の無敵(invincibleTimer)とプレイヤー側の被弾除外(game.js)、
    // 登場の5連の寸止めクランプが同じ窓を見るようにここへ集約する。
    isBossIntroBeforeCall() {
        return this.bossIntroPhase === 'approach'
            || this.bossIntroPhase === 'impact'
            || this.bossIntroPhase === 'name';
    }

    // 登場演出の進行。approach は「ボスが目標Xへ到達したか」で抜けるので
    // ここでは時間駆動するのは impact 以降のみ。
    updateBossIntro(deltaTime, player) {
        const ms = deltaTime * 1000;

        // 着地フラッシュの減衰。旧実装は死んだ Stage.render() の中で減衰していたため
        // 一度立つと 0 に戻らなかった。更新はここに置く（描画から独立させる）。
        if (this.bossEntranceFlash > 0) {
            this.bossEntranceFlash = Math.max(0, this.bossEntranceFlash - deltaTime * 2.6);
        }

        // 撃破後は bossUiRevealT を触らない。update() 側の blend フェードが
        // 1→0 に引いている値をここで 1 に戻すと、HPバーが消えなくなる。
        if (this.bossDefeated) {
            this.bossIntroPhase = null;
            if (this.boss) this.boss.aiDisabled = false;
            return;
        }
        if (!this.bossIntroPhase) {
            this.bossUiRevealT = 1;
            return;
        }

        if (this.bossIntroPhase !== 'approach') {
            this.bossIntroPhaseTimer += ms;
        }

        switch (this.bossIntroPhase) {
            case 'approach':
                // 到達判定は updateBossFight のダッシュ処理側（beginBossIntroImpact）。
                break;
            case 'impact': {
                // 【登場の連撃が振り切れて立ち姿に戻るまで名乗りに進まない】。
                // 4段目(天穿)は跳ね上がるので時間だけで進めると空中で斬っている
                // 最中に短冊が出る。さらに isAttacking が落ちた直後は振り切りの
                // ポーズが残るため、attackTimer/忍具も抜けて接地したうえで
                // INTRO_IDLE_SETTLE_MS の間を置いてから名乗る。
                // comboStep5IdleTransitionTimer(5撃目の余韻280ms)も待つ:
                // isAttacking/attackTimer が 0 でも余韻の間は刀を突き出した
                // ポーズのままで、そこに短冊が出ていた。
                const b = this.boss;
                const comboDone = !(b && b.entranceComboMax > 0)
                    && !(b && (b.isAttacking || (b.attackTimer || 0) > 0 || (b.subWeaponTimer || 0) > 0))
                    && !(b && (b.comboStep5IdleTransitionTimer || 0) > 0)
                    && !(b && b.isGrounded === false);
                if (comboDone) {
                    this.bossIntroIdleSettleMs = (this.bossIntroIdleSettleMs || 0) + ms;
                } else {
                    this.bossIntroIdleSettleMs = 0;
                }
                if (this.bossIntroPhaseTimer >= BOSS_STAGING.INTRO_IMPACT_MS
                    && this.bossIntroIdleSettleMs >= STAGE6_BOSS_INTRO_IDLE_SETTLE_MS) {
                    this.bossIntroPhase = 'name';
                    this.bossIntroPhaseTimer = 0;
                    this.bossIntroIdleSettleMs = 0;
                }
                break;
            }
            case 'name':
                if (this.bossIntroPhaseTimer >= BOSS_STAGING.INTRO_NAME_MS) {
                    this.bossIntroPhase = 'ready';
                    this.bossIntroPhaseTimer = 0;
                }
                break;
            case 'ready':
                if (this.bossIntroPhaseTimer >= BOSS_STAGING.INTRO_READY_MS) {
                    this.bossIntroPhase = null;
                    this.bossIntroPhaseTimer = 0;
                    this.bossUiRevealT = 1;
                    if (this.boss) this.boss.aiDisabled = false;
                }
                break;
        }

        // HPバーは名乗りが画面から消え切った後に開く。
        // ready前半を余白にし、中央の名乗りと上部ゲージを同時に見せない。
        if (this.bossIntroPhase === 'ready') {
            const revealT = this.clamp01(
                (this.bossIntroPhaseTimer - BOSS_STAGING.INTRO_READY_MS * 0.34)
                / (BOSS_STAGING.INTRO_READY_MS * 0.66)
            );
            this.bossUiRevealT = this.smoothstep(0, 1, revealT);
        } else if (this.bossIntroPhase) {
            this.bossUiRevealT = 0;
        }

        // 【名乗りまでは手出し無用】振り向き〜名乗りの間はプレイヤーの攻撃を封じる(移動は通す)。
        // 毎フレーム上書きするのでフェーズを抜けた瞬間に解除される。
        const beforeCall = this.isBossIntroBeforeCall();
        if (player && beforeCall) {
            player.attackInputLockTimer = Math.max(player.attackInputLockTimer || 0, 90);
        }

        // 登場演出が終わるまでボスに初手を出させない。
        // ただし【金鯱から5連コンボで降りてくる間】は演出そのものなので止めない。
        // 登場の5連コンボは「段数固定が入っている間」= 演出中とみなす。
        // 着地(=bossEntranceDropがnull)後も締めの一撃が残るので、
        // drop の有無ではなく entranceComboMax で判定する。
        const entranceCombo = !!(this.boss && this.boss.entranceComboMax > 0);
        if (this.boss && this.bossIntroPhase) {
            if (!entranceCombo) {
                this.boss.isAttacking = false;
                this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, 120);
            }
            // 【名乗りの間は足も止める】。AIを回したままだと名乗り〜HP開示の1.4秒で
            // 190px詰めてしまい、せっかく端と端に開けた間合いが崩れる(実測639→448)。
            // ただし登場の5連コンボ中は止めない。vxを毎フレーム0にすると連撃自身の
            // 踏み込み(前進)が消えて「その場で振っているだけ」の動きになる。
            this.boss.aiDisabled = true;
            if (!entranceCombo) this.boss.vx = 0;
            // 名乗り前は無敵。入力を止めても、開戦前に投げた手裏剣や振り切り中の刃が
            // 届いて「名乗る前に削れている」絵になるため、判定側でも受け付けない。
            // (damageEnemy は takeDamage が null を返すとエフェクトごと出さない)
            if (beforeCall) {
                this.boss.invincibleTimer = Math.max(this.boss.invincibleTimer || 0, 120);
            }
        }
    }

    updateBossFight(deltaTime, player) {
        this.updateBossIntro(deltaTime, player);

        // 登場の5連コンボが振り切れたら段数固定を解除する(以降はHP段階Lvに従う)。
        if (this.boss && this.boss.entranceComboMax > 0
            && !this.bossEntranceDrop && !this.boss.isAttacking) {
            this.boss.entranceComboMax = 0;
            this.boss.attackCombo = 0;
        }

        // 【次段のバッファは着地後も積む】。降下ブロックの中だけで積んでいた頃は
        // 着地(=bossEntranceDropがnull)と同時にバッファが止まり、3段で終わっていた。
        // AIは演出中止めてあるので、ここが唯一のコンボ継続経路。
        if (this.boss && this.boss.entranceComboMax > 0 && this.boss.isAttacking
            && this.boss.currentAttack
            && (this.boss.currentAttack.comboStep || 0) < this.boss.getNormalComboMax()
            && typeof this.boss.bufferNextAttack === 'function') {
            this.boss.bufferNextAttack();
        }

        // ボス登場演出: 金鯱の上で待っていた将軍は【大屋根へ飛び降りながら5連】。
        // 鯱から足を離した後は座標も速度も足さない。上書きすると連撃が持っている
        // 前進の踏み込みが消えて「レールに乗って振っているだけ」の動きになる。
        if (this.boss && this.boss.isEntering && this.bossEntranceDrop) {
            const drop = this.bossEntranceDrop;
            drop.elapsed += deltaTime * 1000;
            const bossH = this.boss.getWorldHeight();
            const laneY = this.getStage6ArenaGroundY() + LANE_OFFSET;
            // 金鯱の上に立っている間は「鯱の甲=地面」として扱う。
            // (ボスの物理には足場のコライダーを渡していないため。渡すと連撃の
            //  上向きモーションで鯱の背へ登ってしまい降りてこない=実測)
            const standOnPerch = () => {
                this.boss.stage6PerchHold = true;
                this.boss.groundY = drop.fromY + bossH - LANE_OFFSET;
                this.boss.x = drop.fromX;
                this.boss.y = drop.fromY;
                this.boss.vy = 0;
                this.boss.isGrounded = true;
                this.boss.facingRight = false;
            };
            if (!drop.swinging) {
                // 【タメ】金鯱の上で一拍置く。位置は待機時の座標のまま立っているだけ。
                standOnPerch();
                this.boss.vx = 0;
                if (drop.elapsed >= (drop.hold || 0)) {
                    // 5連コンボ開始。1段目は踏み込まない技なので、足場の上で
                    // その場で振る(足場の当たりは物理が見るのでこちらは何もしない)。
                    drop.swinging = true;
                    this.boss.entranceComboMax = STAGE6_BOSS_DROP_COMBO_STEPS;
                    this.boss.attackCooldown = 0;
                    this.boss.attackCombo = 0;
                    this.boss.currentSubWeapon = null;
                    this.boss.attackFacingRight = false;
                    // 【初速は入れない】。連撃モーション(applyNormalComboStartMotion)が
                    // 段ごとに縦横の速度を持っており、こちらで vy を入れても即上書きされ、
                    // 噛み合わない1〜2フレームが「脚が一瞬ピクッと変わる」正体になる。
                    if (typeof this.boss.attack === 'function') this.boss.attack();
                }
            } else if (!drop.perchReleased) {
                // 【1撃目はその場】。1段目は踏み込まない技なので鯱の上で振る。
                // 2段目に入ったら足場から手を離す(=以降は重力と連撃モーションだけ)。
                const step = (this.boss.currentAttack && this.boss.isAttacking)
                    ? (this.boss.currentAttack.comboStep || 0)
                    : 0;
                if (step >= 2) {
                    drop.perchReleased = true;
                    this.boss.stage6PerchHold = false;
                    this.boss.groundY = this.getStage6ArenaGroundY();
                    this.boss.isGrounded = false;
                } else {
                    standOnPerch();
                }
            } else {
                // 以降は座標・速度に一切触らない。重力と連撃モーションだけで落ちて前へ出る。
                this.boss.facingRight = false;
                // 【大屋根に足が着いたら】着地の衝撃へ。
                if (this.boss.y + bossH >= laneY - 1) {
                    this.boss.y = laneY - bossH;
                    this.boss.vy = 0;
                    this.boss.isGrounded = true;
                    this.boss.isEntering = false;
                    // 【締めの一撃は切らない】。isAttacking も entranceComboMax も
                    // ここでは触らず、コンボが自然に終わってから解除する(下の後始末)。
                    this.bossEntranceDrop = null;
                    this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, 220);
                    // 着地の衝撃：黒フラッシュ + 土煙。名乗りフェーズへ引き継ぐ。
                    this.beginBossIntroImpact();
                }
            }
        } else if (this.boss && this.boss.isEntering) {
            const scrollX = (window.game && window.game.scrollX) || 0;
            const targetX = this.isStage6Arena()
                ? this.getStage6BossEntranceTargetX(this.boss, scrollX)
                : this.getBossSymmetricEntranceTargetX(this.boss, scrollX, player);
            this.boss.entranceTargetX = targetX;
            this.constrainStage6ArenaActor(this.boss, true);

            const dx = this.boss.x - targetX; // 左向きなので boss.x が大きい
            const speed = this.boss.entranceSpeed || 900; // 高速
            const moveAmount = speed * deltaTime;

            if (dx > moveAmount) {
                // まだ目標に届いていない: 高速で左に進む
                this.boss.x -= moveAmount;
                this.boss.facingRight = false;
                // Stage5の最終階は天守閣へ続く階段を【踏みしめて降りてくる】。
                // 平地に出たら lift=0 になり、そのまま通常の歩き入りに繋がる。
                this.applyStage5ExitStairDescent(this.boss);
            } else {
                // 目標到達！ 登場完了
                this.boss.x = targetX;
                this.boss.isEntering = false;
                this.boss.isAttacking = false;
                this.boss.vx = 0;
                // 到達直後の1拍だけ間を作る（フリーズではなく短い硬直）
                this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, 220);
                // 着地の衝撃：黒フラッシュ + 土煙。名乗りフェーズへ引き継ぐ。
                this.beginBossIntroImpact();
            }
        }

        // 歩き入り中／着地〜名乗り中はボス更新を行わない。
        // ここで boss.update を止めるのが「名乗りで一旦止める」の実体。
        // 攻撃だけ封じても AI の移動・ジャンプは走るので、名乗りの最中にボスが
        // 跳ねて短冊と噛み合わなくなる。ready(開戦)から動き出す。
        // 【impact は update を通す】。着地〜立ち姿に戻るまでの区間で止めると
        // 5撃目の余韻タイマー(comboStep5IdleTransitionTimer)と剣筋の老化が進まず、
        // 刀を突き出した最後のフレームで凍ったまま名乗りに入る。
        // 足を止める役目は aiDisabled + vx=0(updateBossIntro)が担っている。
        const introHold = this.bossIntroPhase === 'name';
        // 【登場の5連コンボ中は boss.update を通す】。ここで止めると攻撃モーションが
        // 進まず1段目で固まる(位置は上の降下補間が毎フレーム上書きするので破綻しない)。
        // AIは updateBossIntro で aiDisabled にしてあるので動き出しはしない。
        const entranceComboActive = !!(this.boss && this.boss.entranceComboMax > 0);
        if (this.boss && (this.boss.isEntering || introHold) && !entranceComboActive) {
            if (this.boss) {
                this.boss.isAttacking = false;
                this.boss.vx = 0;
                this.boss.vy = 0;
                this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, 300);
            }
            const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
            const enemyObstacles = this.getStageEnemyObstacles(activeObstacles);
            this.updateEnemies(deltaTime, player, enemyObstacles);
            this.updateObstacles(deltaTime);
            return;
        }

        // ボス更新
        // ボスに致命傷が入った瞬間(死亡演出の開始)に、画面に残っている雑魚も
        // まとめて撃破する。大将が討たれた後に手下が生きているのは締まらない。
        // bossDefeated(=死亡演出完了)を待つと1.25秒遅れるのでここで判定する
        if (this.boss && this.boss.isDying && !this._bossDeathMobsCleared) {
            this._bossDeathMobsCleared = true;
            for (const enemy of this.enemies || []) {
                if (!enemy || !enemy.isAlive || enemy.isDying || enemy.bossName) continue;
                enemy.invincibleTimer = 0;
                if (typeof enemy.takeDamage === 'function') {
                    enemy.takeDamage((enemy.hp || 1) + 9999, player, {});
                } else {
                    enemy.hp = 0;
                    enemy.isDying = true;
                    enemy.deathTimer = 0;
                }
            }
        }

        if (this.boss) {
            // 金鯱は【敵味方共通の足場】。雑魚は getStageEnemyObstacles 経由で、
            // プレイヤーは game.js 側で、ボスはここで同じコライダーを受け取る
            // (stage4の屋根コライダーと同じ考え方)。
            // 登場演出中(飛び降りながらの5連)だけは渡さない: 連撃の上向きモーションで
            // 鯱の背(上段のコライダー)に乗って降りてこなくなる(実測: 足元273で停止)。
            const bossOnEntrance = this.boss.isEntering || !!this.bossEntranceDrop;
            this.boss._stageObstacles = (this.isStage6Arena() && !bossOnEntrance)
                ? this.getStage6ArenaColliders()
                : null;
            const shouldRemove = this.boss.update(deltaTime, player);
            this.constrainStage6ArenaActor(this.boss);
            this.clampBossIntroNearMiss(player);
            if (shouldRemove || !this.boss.isAlive) {
                if (!this.boss.isAlive && !this.bossDefeated) {
                    this.bossDefeated = true;
                    this.bossDefeatLingerTimer = this.bossDefeatLingerDuration;
                }
            }
        }

        if (this.bossDefeatLingerTimer > 0) {
            this.bossDefeatLingerTimer = Math.max(0, this.bossDefeatLingerTimer - deltaTime * 1000);
        }
        
        // 旧 bossDefeatColorFade(撃破後に赤い空を2秒かけて戻す)は廃止。
        // 参照元だった「ステージ6のhard-light橙」と「白い稲妻」を撤去したため不要。

// 残りの雑魚敵も更新
        const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
        const enemyObstacles = this.getStageEnemyObstacles(activeObstacles);
        this.updateEnemies(deltaTime, player, enemyObstacles);
        this.updateObstacles(deltaTime);

        // ボス戦中も雑魚敵を出現させる（BUSHOは除外）
        // 【登場演出(降下〜名乗り〜開戦)の間は湧かせない】。bossIntroTimer だけでは
        // 演出(実測3.3秒)より短く切れてしまい、名乗りの最中に雑魚が上がってくる。
        if (!this.bossDefeated && this.bossIntroTimer <= 0 && !this.bossIntroPhase) {
            this.spawnTimer += deltaTime * 1000;
            // 最上階の大屋根は屋根の裏から跳び上がる登場が見せ場なので、
            // 他ステージのボス戦より短い間隔・多い同時数で回す。
            const isRoofArena = this.isStage6Arena();
            const bossSpawnInterval = this.spawnInterval * (isRoofArena ? 1.5 : 2.5);
            const bossSpawnCap = isRoofArena ? 4 : 2;
            if (this.spawnTimer >= bossSpawnInterval) {
                if (this.getActiveEnemyCount() < bossSpawnCap) {
                    this.spawnEnemy();
                }
                this.spawnTimer = 0;
            }
        }
    }
    
    updateEnemies(deltaTime, player, obstacles = []) {
        // stage4: プレイヤーの「安定段位」を毎フレーム1回だけ確定させる。
        // 着地中の段位のみ採用し、ジャンプ中は直前の地上段位を保持することで、
        // 「プレイヤーが跳ねただけ」で敵が一斉反応するのを防ぐ。
        if (this.stageNumber === 4 && player) {
            const playerFootY = player.y + player.getWorldHeight();
            const rawRank = this.getStage4SurfaceRankFromFootY(playerFootY);
            if (player.isGrounded || this.stage4PlayerStableRank === undefined) {
                this.stage4PlayerStableRank = rawRank;
            }
        }

        // 敵を更新し、削除すべきものをフィルタ
        // 置き去りになった敵は前方に再登場させ、走り抜け時の敵枯渇を防ぐ
        const nextEnemies = [];
        for (const enemy of this.enemies) {
            this.updateStage4EnemyRoofMovement(enemy, player, obstacles, deltaTime);
            const shouldRemove = enemy.update(deltaTime, player, obstacles);
            if (shouldRemove) continue;
            this.constrainStage6ArenaActor(enemy);

            if (this.shouldRecycleBehindEnemy(enemy)) {
                const recycled = this.spawnRecycledEnemyAhead(enemy.type);
                if (recycled) {
                    nextEnemies.push(recycled);
                    continue;
                }
            }

            nextEnemies.push(enemy);
        }
        this.enemies = nextEnemies;
    }

    updateStage4EnemyRoofMovement(enemy, player, obstacles = [], deltaTime = 0) {
        if (this.stageNumber !== 4 || !enemy || !player) return;

        enemy.stage4RoofJumpCooldown = Math.max(0, (enemy.stage4RoofJumpCooldown || 0) - deltaTime * 1000);
        if (enemy.stage4ReactTimer > 0) {
            enemy.stage4ReactTimer = Math.max(0, enemy.stage4ReactTimer - deltaTime * 1000);
        }

        // 縁ガードは毎フレーム更新する（早期returnで通常chaseに移っても、
        // 登攀中の足場から踏み外して落ちる「乗り降りの繰り返し」を防ぐため）。
        this.updateStage4EnemyLedgeGuard(enemy, obstacles);

        if (enemy.stage4RoofJumpCooldown > 0 || !enemy.isGrounded) return;
        if ((enemy.stage4RoofDecisionDelayMs || 0) > 0) return;

        const enemyCenterX = enemy.x + enemy.width * 0.5;
        const enemyFootY = enemy.y + enemy.height;
        const playerCenterX = player.x + player.getWorldWidth() * 0.5;
        const playerFootY = player.y + player.getWorldHeight();
        const isNinja = enemy.type === ENEMY_TYPES.NINJA;
        const currentRank = this.getStage4SurfaceRankFromFootY(enemyFootY);
        // 安定段位（着地時のみ更新）を狙う。ジャンプ中の一時的な段位変化には反応しない。
        const targetRank = (this.stage4PlayerStableRank !== undefined)
            ? this.stage4PlayerStableRank
            : this.getStage4SurfaceRankFromFootY(playerFootY);
        const isPlayerAirborne = player.isGrounded === false;
        const horizGap = Math.abs(playerCenterX - enemyCenterX);
        const aggression = (enemy.stage4VerticalAggression !== undefined)
            ? enemy.stage4VerticalAggression
            : 0.7;

        // --- プレイヤーの段位「変化」に対しては、個体ごとにばらけた遅延を置いてから反応する ---
        // これにより「プレイヤーが昇降した瞬間に全員が同時に追従する」現象を防ぐ。
        if (enemy.stage4LastPlayerRank === null || enemy.stage4LastPlayerRank === undefined) {
            enemy.stage4LastPlayerRank = targetRank;
        }
        if (targetRank !== enemy.stage4LastPlayerRank) {
            enemy.stage4LastPlayerRank = targetRank;
            // 積極的な個体ほど短く、消極的な個体ほど長い遅延。さらに個別ジッターを足す。
            const reactBase = (isNinja ? 220 : 300) + (1 - aggression) * (isNinja ? 880 : 1180);
            enemy.stage4ReactTimer = reactBase + Math.random() * 440;
            // 今回の変化を「追うか／その場に留まるか」を個性＋距離で確率的に決める。
            // 近いほど・積極的なほど追いやすい。遠い相手にはまず横移動で詰めさせる。
            const proximityBias = horizGap < 260 ? 0.28 : (horizGap < 560 ? 0.08 : -0.2);
            const followChance = Math.max(0.12, Math.min(0.95, aggression * 0.7 + 0.18 + proximityBias));
            enemy.stage4FollowCommit = Math.random() < followChance;
            return;
        }

        // 反応待ちウィンドウ中は動かない（個体ごとにずれて発火する）
        if (enemy.stage4ReactTimer > 0) return;

        // この個体は今回「その場に留まる」と決めた。一定時間そのまま待ち、たまに再判断する。
        if (enemy.stage4FollowCommit === false) {
            enemy.stage4RoofDecisionDelayMs = (isNinja ? 900 : 1300) + Math.random() * 2200;
            // 再判断時により追従しやすくして、いつまでも放置されないようにする。
            enemy.stage4FollowCommit = Math.random() < (aggression * 0.55 + 0.3);
            return;
        }

        if (currentRank > targetRank) {
            const currentPlatform = obstacles
                .filter((obs) => obs && (obs.isStage4RoofPlatform || obs.isStage4ClimbPlatform))
                .find((platform) => (
                    enemyCenterX >= platform.x - 8 &&
                    enemyCenterX <= platform.x + platform.width + 8 &&
                    Math.abs(platform.y - enemyFootY) < 18
                ));

            if (currentPlatform) {
                const playerIsBelow = playerFootY > enemyFootY + 34;
                if (playerIsBelow && currentPlatform.isOneWayPlatform) {
                    const direction = Math.abs(playerCenterX - enemyCenterX) > 18
                        ? (playerCenterX > enemyCenterX ? 1 : -1)
                        : 0;
                    enemy.dropThroughPlatformTimer = isNinja ? 190 : 220;
                    enemy.stage4ForcedMoveVx = direction * enemy.speed * (isNinja ? 1.35 : 1.02);
                    enemy.stage4ForcedMoveTimer = isNinja ? 260 : 320;
                    enemy.isGrounded = false;
                    enemy.isOnStage4Roof = false;
                    enemy.isOnStage4ClimbPlatform = false;
                    enemy.y += 5;
                    enemy.vy = Math.max(enemy.vy, isNinja ? 1.8 : 1.35);
                    enemy.stage4RoofJumpCooldown = isNinja ? 180 : 260;
                    enemy.stage4RoofDecisionDelayMs = isNinja
                        ? 80 + Math.random() * 140
                        : 130 + Math.random() * 220;
                    return;
                }

                const leftEdgeDist = Math.abs(enemyCenterX - currentPlatform.x);
                const rightEdgeDist = Math.abs(enemyCenterX - (currentPlatform.x + currentPlatform.width));
                let direction = playerCenterX < enemyCenterX ? -1 : 1;
                if (playerCenterX > currentPlatform.x && playerCenterX < currentPlatform.x + currentPlatform.width) {
                    direction = leftEdgeDist < rightEdgeDist ? -1 : 1;
                }
                enemy.stage4ForcedMoveVx = direction * enemy.speed * (isNinja ? 1.75 : 1.38);
                enemy.stage4ForcedMoveTimer = 340;
                enemy.stage4RoofJumpCooldown = isNinja ? 80 : 120;
                enemy.stage4RoofDecisionDelayMs = isNinja
                    ? 80 + Math.random() * 130
                    : 130 + Math.random() * 220;
                return;
            }
        }

        if (targetRank <= currentRank) return;
        if (isPlayerAirborne) return;

        const maxRankStep = 2;
        const desiredRank = Math.min(targetRank, currentRank + maxRankStep);
        const vertReach = isNinja ? 330 : 235;
        const onGround = currentRank === 0;
        // 地上では「登り口」が真上に無いことが多い（建物の屋根は rank3/4、低い足場は離れた位置）。
        // そこで地上では横方向の探索を大きく広げ、最寄りの登り口まで回り込めるようにする。
        // 既に高所にいる場合は近接した屋根だけを対象にし、足場から踏み外して落ちないようにする。
        const routeCorridor = onGround ? (isNinja ? 1400 : 1150) : (isNinja ? 420 : 360);
        const stepStones = obstacles.filter((obs) => {
            if (!obs || !(obs.isStage4RoofPlatform || obs.isStage4ClimbPlatform)) return false;
            if (obs.y >= enemyFootY - 28 || obs.y <= enemyFootY - vertReach) return false;
            const r = this.getStage4PlatformRank(obs);
            if (r <= currentRank || r > desiredRank) return false;
            return enemyCenterX > obs.x - routeCorridor && enemyCenterX < obs.x + obs.width + routeCorridor;
        });

        if (stepStones.length === 0) {
            // 一段上がれる登り口が近くに無い。地上ならプレイヤー側へはっきり歩み寄り、
            // 真下での左右ブレを止めて登り口を探しに行く。
            if (onGround && Math.abs(playerCenterX - enemyCenterX) > 40) {
                const dir = playerCenterX > enemyCenterX ? 1 : -1;
                enemy.facingRight = dir > 0;
                enemy.stage4ForcedMoveVx = dir * enemy.speed * (isNinja ? 1.4 : 1.12);
                enemy.stage4ForcedMoveTimer = 240;
                enemy.stage4RoofDecisionDelayMs = 110 + Math.random() * 120;
            }
            return;
        }

        // 登り口の選択：低い段（入口）を優先しつつ、敵から近く・プレイヤー寄りのものを選ぶ。
        // さらに「プレイヤーと逆方向」の足場には強いペナルティを付け、
        // わざわざ逆側へ飛んでから引き返して落ちる挙動を避ける。
        const playerDir = Math.sign(playerCenterX - enemyCenterX);
        const wrongSidePenalty = (platCenterX) => {
            if (Math.abs(playerCenterX - enemyCenterX) <= 36) return 0; // ほぼ真上ならどちらでも可
            return (Math.sign(platCenterX - enemyCenterX) === -playerDir) ? 300 : 0;
        };
        const target = stepStones.sort((a, b) => {
            const ar = this.getStage4PlatformRank(a);
            const br = this.getStage4PlatformRank(b);
            const ax = a.x + a.width * 0.5;
            const bx = b.x + b.width * 0.5;
            const aScore = (ar - currentRank) * 70 + Math.abs(enemyCenterX - ax) + Math.abs(playerCenterX - ax) * 0.5 + wrongSidePenalty(ax);
            const bScore = (br - currentRank) * 70 + Math.abs(enemyCenterX - bx) + Math.abs(playerCenterX - bx) * 0.5 + wrongSidePenalty(bx);
            return aScore - bScore;
        })[0];

        const tLeft = target.x;
        const tRight = target.x + target.width;
        const targetCenterX = target.x + target.width * 0.5;
        const targetRankForJump = this.getStage4PlatformRank(target);
        // 真下（＋ジャンプで横移動できる余裕）に来ているか
        const alignTol = onGround ? (isNinja ? 120 : 90) : (isNinja ? 220 : 170);
        const underSpan = enemyCenterX > tLeft - alignTol && enemyCenterX < tRight + alignTol;

        if (onGround && !underSpan) {
            // まず登り口の真下まで横移動する（ルート移動）。ここではジャンプしない。
            const dir = enemyCenterX < tLeft ? 1 : (enemyCenterX > tRight ? -1 : (targetCenterX >= enemyCenterX ? 1 : -1));
            enemy.facingRight = dir > 0;
            enemy.stage4ForcedMoveVx = dir * enemy.speed * (isNinja ? 1.55 : 1.24);
            enemy.stage4ForcedMoveTimer = 220;
            enemy.stage4RoofJumpCooldown = 0;
            // forcedMoveTimer より短い間隔で再判断し、歩きが途切れて震えないようにする。
            enemy.stage4RoofDecisionDelayMs = 90 + Math.random() * 90;
            return;
        }

        if (!onGround && !underSpan) {
            // 既に高所の足場にいるが、次の登り口が真上(ジャンプ到達圏)に無い。
            // 無理に跳ぶと届かず落ちて「乗り降りの繰り返し」になるため、跳ばずに留まる。
            // （足場から踏み外さないよう縁ガードが働く。少し待ってから再判断）
            enemy.stage4RoofDecisionDelayMs = (isNinja ? 260 : 360) + Math.random() * 260;
            return;
        }

        // 真下に到達（または高所で近接） → 登り口へジャンプ。
        const dx = targetCenterX - enemyCenterX;
        const direction = Math.abs(dx) < 10 ? (playerCenterX >= enemyCenterX ? 1 : -1) : (dx > 0 ? 1 : -1);
        const horizontalBoost = isNinja
            ? (targetRankForJump >= 3 ? 3.35 : 2.65)
            : (targetRankForJump >= 3 ? 2.4 : 1.85);
        enemy.vx += direction * horizontalBoost;
        const jumpVelocity = isNinja
            ? (targetRankForJump >= 3 ? -21.5 : -18.2)
            : (targetRankForJump >= 3 ? -18.7 : (targetRankForJump >= 2 ? -16.2 : -13.6));
        enemy.vy = Math.min(enemy.vy, jumpVelocity);
        enemy.isGrounded = false;
        enemy.isOnStage4Roof = false;
        enemy.isOnStage4ClimbPlatform = false;
        enemy.stage4LedgeGuard = false; // ジャンプ中は縁ガードを外す（次の段への水平移動を妨げない）
        enemy.stage4ForcedMoveVx = direction * enemy.speed * (isNinja ? 1.7 : 1.34);
        enemy.stage4ForcedMoveTimer = 260;
        enemy.stage4RoofJumpCooldown = isNinja ? 420 : 620;
        enemy.stage4RoofDecisionDelayMs = isNinja
            ? 90 + Math.random() * 190
            : 160 + Math.random() * 320;
    }

    // 登攀中の足場（高所の一方通行床）に乗っている間、縁から踏み外して落ちないように
    // 現在の足場の左右端を記録する。プレイヤーが下にいる（降りるべき）場合や
    // 意図的な落下中は記録せず、降下は妨げない。
    updateStage4EnemyLedgeGuard(enemy, obstacles = []) {
        enemy.stage4LedgeGuard = false;
        enemy.stage4OnElevatedRoof = false;
        if (!enemy.isGrounded) return;

        const footY = enemy.y + enemy.height;
        const currentRank = this.getStage4SurfaceRankFromFootY(footY);
        if (currentRank < 1) return; // 地上では縁ガードも跳ね抑止も不要

        const centerX = enemy.x + enemy.width * 0.5;
        const platform = obstacles.find((obs) => (
            obs && (obs.isStage4RoofPlatform || obs.isStage4ClimbPlatform) &&
            Math.abs(obs.y - footY) < 18 &&
            centerX >= obs.x - 6 && centerX <= obs.x + obs.width + 6
        ));
        if (!platform) return;

        // 高所の足場に乗っている：通常のランダムジャンプを抑止（屋根上で段を行き来しない）
        enemy.stage4OnElevatedRoof = true;

        // 縁ガードは「プレイヤーが厳密に上（＝まだ登攀中）」かつ意図的降下中でないときだけ。
        // 同段や下のときは自由に動かし（足場上で固まらせない／降りて回り込める）。
        if ((enemy.dropThroughPlatformTimer || 0) > 0) return;
        const targetRank = (this.stage4PlayerStableRank !== undefined)
            ? this.stage4PlayerStableRank
            : currentRank;
        if (targetRank <= currentRank) return;

        enemy.stage4LedgeGuard = true;
        enemy.stage4PlatformLeft = platform.x;
        enemy.stage4PlatformRight = platform.x + platform.width;
    }

    getStageEnemyObstacles(baseObstacles = []) {
        // 最上階は金鯱を通り抜けさせない(ノックバックで押し込まれた時も含む)
        if (this.isStage6Arena()) {
            const shachi = this.getStage6ArenaColliders();
            return shachi.length > 0 ? baseObstacles.concat(shachi) : baseObstacles;
        }
        if (this.stageNumber !== 4 || typeof this.getStage4RoofColliders !== 'function') {
            return baseObstacles;
        }

        const roofColliders = this.getStage4RoofColliders(this.progress - 260, this.progress + CANVAS_WIDTH + 360);
        return roofColliders.length > 0 ? baseObstacles.concat(roofColliders) : baseObstacles;
    }

    shouldRecycleBehindEnemy(enemy) {
        if (!enemy || !enemy.isAlive || enemy.isDying) return false;
        if (this.bossSpawned && !this.bossDefeated) return false;

        const recycleDistance = 320;
        const leftBound = this.progress - recycleDistance;
        return (enemy.x + enemy.width) < leftBound;
    }

    createGroundedEnemy(type, x) {
        const enemy = createEnemy(type, x, this.groundY, this.groundY);
        if (!enemy) return null;
        enemy.y = this.groundY + LANE_OFFSET - enemy.height;
        return enemy;
    }

    placeEnemyOnStage4Roof(enemy, x) {
        if (this.stageNumber !== 4 || !enemy || typeof this.getStage4RoofColliders !== 'function') return false;

        const enemyW = Number.isFinite(enemy.width) ? enemy.width : 36;
        const platforms = this.getStage4RoofColliders(x - 220, x + 420)
            .filter((platform) => platform.isStage4RoofPlatform)
            .filter((platform) => platform.width >= enemyW + 18)
            .sort((a, b) => (a.roofLevel || 0) - (b.roofLevel || 0));
        if (platforms.length === 0) return false;

        const preferred = platforms.find((platform) => x + enemyW * 0.5 >= platform.x && x + enemyW * 0.5 <= platform.x + platform.width)
            || platforms[0];
        const targetX = Math.max(preferred.x + 10, Math.min(x, preferred.x + preferred.width - enemyW - 10));
        enemy.x = targetX;
        enemy.groundY = this.groundY;
        enemy.y = preferred.y - enemy.height;
        enemy.vy = 0;
        enemy.isGrounded = true;
        enemy.isOnStage4Roof = true;
        return true;
    }

    spawnRecycledEnemyAhead(type) {
        const spawnX = this.progress + CANVAS_WIDTH + 80 + Math.random() * 180;
        const recycled = this.createGroundedEnemy(type || ENEMY_TYPES.ASHIGARU, spawnX);
        if (!recycled) return null;
        if ((type || ENEMY_TYPES.ASHIGARU) === ENEMY_TYPES.NINJA && Math.random() < 0.55) {
            this.placeEnemyOnStage4Roof(recycled, spawnX);
        }
        recycled.facingRight = false;
        return recycled;
    }
    
    spawnEnemy() {
        const availableSlots = this.maxActiveEnemies - this.getActiveEnemyCount();
        if (availableSlots <= 0) return;

        const progressRatio = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        const bossActive = this.bossSpawned && !this.bossDefeated;
        
        let count = 1;
        // ボス戦中はマルチスポーンさせない
        if (!bossActive) {
            const multiSpawnBase = this.balanceProfile.multiSpawnBase || 0.16;
            const multiSpawnPeak = this.balanceProfile.multiSpawnPeak || 0.28;
            const multiChance = multiSpawnBase + (multiSpawnPeak - multiSpawnBase) * progressRatio;
            if (Math.random() < multiChance) {
                const tripleChance = 0.14 + progressRatio * 0.2;
                count = Math.random() < tripleChance ? 3 : 2;
            }
        }
        const spawnCount = Math.min(count, availableSlots);
        
        for (let i = 0; i < spawnCount; i++) {
            // 出現確率に基づいて敵タイプを選択
            const roll = Math.random() * 100;
            let type = ENEMY_TYPES.ASHIGARU;
            let cumulative = 0;
            
            if (roll < (cumulative += this.enemyWeights.ashigaru)) {
                type = ENEMY_TYPES.ASHIGARU;
            } else if (roll < (cumulative += this.enemyWeights.samurai)) {
                type = ENEMY_TYPES.SAMURAI;
            } else if (roll < (cumulative += this.enemyWeights.ninja)) {
                type = ENEMY_TYPES.NINJA;
            } else {
                // ボス戦中はBUSHOの代わりにNINJAを出す
                type = bossActive ? ENEMY_TYPES.NINJA : ENEMY_TYPES.BUSHO;
            }
            
            // 画面外（右側）から出現
            const variance = i * 40; 
            
            // スクロール位置(this.progress)を考慮したワールド座標で出現させる
            // 進行に応じて背後湧きを少し増やす（序盤は抑えめ）
            const leftChance = this.balanceProfile.leftSpawnBase +
                (this.balanceProfile.leftSpawnPeak - this.balanceProfile.leftSpawnBase) * progressRatio;
            let comeFromLeft = Math.random() < leftChance;
            let spawnBaseX;
            let facingRight;

            // Stage 5 左スクロールフロア: スポーン方向を反転
            if (this.stageNumber === 5 && this.floorScrollDirection === -1) {
                comeFromLeft = !comeFromLeft;
            }
            
            if (comeFromLeft) {
                // 左側（画面外左）から出現
                spawnBaseX = -100;
                facingRight = true; // 右を向く
            } else {
                // 右側（画面外右）から出現
                spawnBaseX = CANVAS_WIDTH + 100;
                facingRight = false; // 左を向く
            }
            
            // 複数体湧くときは少し位置をずらす
            let x = this.progress + spawnBaseX + (comeFromLeft ? -variance : variance);
            if (this.isStage6Arena()) {
                // 大棟端から280px内側。金鯱(取付足中心が端から60px内側・体幅208px)に
                // 跳び上がりが被らない位置。beginStage6RoofEntry が更に46px外へ寄せるので
                // 実際の踏切は端から234px内側になる。
                const shachiClear = 280;
                x = comeFromLeft
                    ? this.getStage6ArenaPhysicalLeft() + shachiClear + variance
                    : this.getStage6ArenaPhysicalRight() - shachiClear - variance;
            }

            // Stage 5: 階段区間でのスポーンを制限（重力計算が平面前提のため不自然な浮きを防ぐ）
            if (this.stageNumber === 5 && (this.isInStairZone(x) || x > this.maxProgress - 100)) {
                continue;
            }

            // Stage 6: 角帯(全高壁の周囲)でのスポーンを制限
            if (this.isInStage6CornerBand(x)) {
                continue;
            }

            // Stage 6: 大屋根の上(四巡目)に鎧武将は登ってこない。忍者に差し替え
            if (this.stageNumber === 6 && x >= this.maxProgress * 0.75 && type === ENEMY_TYPES.BUSHO) {
                type = ENEMY_TYPES.NINJA;
            }
            
            const enemy = this.createGroundedEnemy(type, x);
            if (!enemy) continue;
            this.constrainStage6ArenaActor(enemy, true);
            if (this.isStage6Arena()) {
                // 大棟の上は「湧く」場所がないので、屋根の裏から跳び上がって乗る
                this.beginStage6RoofEntry(enemy);
            }
            if (type === ENEMY_TYPES.NINJA && Math.random() < 0.72) {
                this.placeEnemyOnStage4Roof(enemy, x);
            }
            enemy.facingRight = facingRight;
            this.enemies.push(enemy);
        }
    }
    
    spawnMidBoss() {
        const x = this.progress + CANVAS_WIDTH + 50;
        const midBoss = this.createGroundedEnemy(ENEMY_TYPES.BUSHO, x);
        if (!midBoss) return;
        midBoss.hp = Math.round(midBoss.hp * 1.38);
        midBoss.maxHp = Math.round(midBoss.maxHp * 1.38);
        this.enemies.push(midBoss);
    }

    spawnObstacle() {
        // ステージごとの発生率にボーナスを加算（上限1.0）
        const obstacleChance = this.stageNumber === 4
            ? this.balanceProfile.obstacleChance
            : Math.min(1, this.balanceProfile.obstacleChance + OBSTACLE_CHANCE_BOOST);
        if (Math.random() > obstacleChance) return;

        // 画面外（右側）から出現（Stage 5 左方向フロアは左側から出現）
        let x;
        if (this.stageNumber === 5 && this.floorScrollDirection === -1) {
            x = this.progress - 50 - Math.random() * 100;
        } else {
            x = this.progress + CANVAS_WIDTH + 50 + Math.random() * 100;
        }

        // Stage 5: 階段区間およびフロア端には障害物(竹槍等)を置かない
        if (this.stageNumber === 5) {
            // 階段のかなり手前（250px）およびフロア端（最上階用300px）をセーフゾーン化
            const isNearStart = x < 250;
            const isNearEnd = x > this.maxProgress - 300;
            
            // 物理的な階段範囲外でも、画面に映る幅を考慮して±150px程度のアソビを持たせる
            const stairPhysStart = this.getStairStartX();
            const stairPhysEnd = this.getStairEndX();
            const buffer = 150;
            const inExtendedStairZone = 
                (this.floorScrollDirection === 1 && x >= stairPhysStart - buffer && x <= stairPhysEnd + buffer) ||
                (this.floorScrollDirection === -1 && x >= stairPhysEnd - buffer && x <= stairPhysStart + buffer);

            if (inExtendedStairZone || isNearStart || isNearEnd) {
                return;
            }
        }

        // Stage 6: 角帯(全高壁の周囲)には障害物を置かない。
        // 連なりは右へ最大~440px伸びるため、原点だけでなく連なりの右端も帯判定する
        // (門前に竹槍の列が食い込むのを防ぐ)。
        if (this.isInStage6CornerBand(x) || this.isInStage6CornerBand(x + 440)) {
            return;
        }

        // Stage 6: 大屋根の上(四巡目)に竹槍・岩は据え付けられない
        if (this.stageNumber === 6 && x + 440 >= this.maxProgress * 0.75) {
            return;
        }

        // ボス部屋(最終1画面)には竹槍・大岩などの障害物を置かない。
        // 出現X + 連なり幅の余裕がボス部屋左端を越えるなら出現させず、
        // ボス登場と同時に障害物が一括で消える違和感を根本から防ぐ。
        const hasBossRoomHere = (this.stageNumber !== 5) || (this.currentFloor >= this.maxFloor);
        if (hasBossRoomHere) {
            const bossRoomLeft = Math.max(0, this.maxProgress - CANVAS_WIDTH);
            if (x + 440 > bossRoomLeft) return;
        }

        const spikeChanceByStage = [0, 0.12, 0.15, 0.42, 0.56, 0.7];
        const spikeChance = spikeChanceByStage[Math.max(0, Math.min(spikeChanceByStage.length - 1, this.stageNumber - 1))];
        const type = (this.stageNumber >= 5)
            ? OBSTACLE_TYPES.SPIKE
            : (this.stageNumber === 3)
                ? OBSTACLE_TYPES.ROCK
                : (this.stageNumber === 4)
                    ? OBSTACLE_TYPES.SPIKE
                    : (Math.random() < spikeChance ? OBSTACLE_TYPES.SPIKE : OBSTACLE_TYPES.ROCK);
        const rockChainChance = this.stageNumber === 3 ? 0.88 : 0.65;
        const rockChainCount = this.stageNumber === 3
            ? 3 + Math.floor(Math.random() * 4)
            : 2 + Math.floor(Math.random() * 3);
        if (type === OBSTACLE_TYPES.ROCK && Math.random() < rockChainChance) {
            // 岩塊の連なり。単一引き伸ばしではなく複数シルエットで道を塞ぐ。
            const chainCount = rockChainCount;
            let cursorX = x;
            for (let i = 0; i < chainCount; i++) {
                const rock = createObstacle(OBSTACLE_TYPES.ROCK, cursorX + (Math.random() * 18 - 9), this.groundY, {
                    stageNumber: this.stageNumber
                });
                this.obstacles.push(rock);
                cursorX += rock.width * (0.44 + Math.random() * 0.3);
            }
            return;
        }

        const obstacle = createObstacle(type, x, this.groundY, {
            stageNumber: this.stageNumber
        });
        this.obstacles.push(obstacle);
    }

    updateObstacles(deltaTime) {
        this.obstacles = this.obstacles.filter(obs => {
            obs.update(deltaTime);
            // 画面外（左）に出たら削除 (スクロール考慮)
            // this.progress (スクロール左端) - 100 より左なら削除
            if (obs.x + obs.width < this.progress - 100 || obs.isDestroyed) return false;
            return true;
        });
    }
    
    spawnBoss() {
        this.bossSpawned = true;

        const scrollX = (window.game && window.game.scrollX) || 0;

        // Stage6最上階: 開戦前から大屋根の右端に立って待っている将軍をそのまま引き継ぐ。
        // ここで作り直すと「カメラが止まった瞬間に湧く」不自然さに戻る。
        const standby = this.stage6StandbyBoss;
        this.stage6StandbyBoss = null;
        if (standby) {
            standby.isStandby = false;
            this.boss = standby;
        } else {
            // ボスを画面右端ギリギリ外に配置（すぐ見える＆登場感あり）
            const bossWidth = 140; // ボスのおおよその幅（登場位置計算用）
            const spawnX = this.isStage6Arena()
                ? this.getStage6ArenaPhysicalRight() - bossWidth - 12
                : scrollX + CANVAS_WIDTH + bossWidth * 0.5;
            this.boss = createBoss(this.stageNumber, spawnX, this.groundY, this.groundY);
        }
        // 足元を地面に合わせる（Player系ボスは素体heightではなくワールド身長を使う）
        const bossWorldHeight = typeof this.boss.getWorldHeight === 'function'
            ? this.boss.getWorldHeight()
            : (this.boss.height || 180);
        // 待機体は金鯱の上に立っているので、その座標を退避してから接地処理を通す
        const perchX = standby ? this.boss.x : null;
        const perchY = standby ? this.boss.y : null;
        // 最上階は大棟の上が足元ライン。constrainStage6ArenaActor が上書きするが、
        // アリーナ外のボスと式を分けないためここでも接地基準から引く。
        this.boss.groundY = this.getStage6ArenaGroundY();
        this.boss.y = this.boss.groundY + LANE_OFFSET - bossWorldHeight;
        this.constrainStage6ArenaActor(this.boss, true);
        // どちらの経路でも左向き(プレイヤー方向)で登場する
        this.boss.facingRight = false;
        this.boss.attackFacingRight = false;

        // 登場演出フラグ。
        // 待機体は【金鯱から大屋根へ飛び降りる】。通常ボスは従来どおり右外からダッシュ。
        this.boss.isEntering = true;
        this.boss.entranceTargetX = this.isStage6Arena()
            ? this.getStage6BossEntranceTargetX(this.boss, scrollX)
            // 着地目標X。名乗り帯に対してプレイヤーと左右対称な位置(毎フレーム
            // updateBossFight 側でも追従させるので、ここは初期値)。
            : this.getBossSymmetricEntranceTargetX(
                this.boss, scrollX, (window.game && window.game.player) || null
            );
        this.boss.entranceSpeed = 900; // 高速ダッシュ登場

        // Stage5の最終階は【天守閣へ続く階段の上に現れて、踏みしめて降りてくる】。
        // 画面外の右からダッシュで滑り込むより、この階段があることを活かす。
        const stairTop = this.getStage5ExitStairTopPose(this.boss);
        if (stairTop) {
            this.boss.x = stairTop.x;
            this.boss.y = stairTop.y;
            this.boss.groundY = stairTop.groundY;
            this.boss.vx = 0;
            this.boss.vy = 0;
            this.boss.isGrounded = true;
            this.boss.entranceSpeed = STAGE5_BOSS_STAIR_DESCENT_SPEED;
        }

        if (standby && Number.isFinite(perchY)) {
            this.boss.x = perchX;
            this.boss.y = perchY;
            // 湧いた最初のフレームから【金鯱の上に接地して立っている】状態にする。
            // isGrounded=false で1フレーム挟むと、その1コマだけ空中脚に切り替わって
            // 「登場直後に脚が一瞬ピクッと変わる」ように見える。
            this.boss.stage6PerchHold = true;
            this.boss.groundY = perchY + bossWorldHeight - LANE_OFFSET;
            this.boss.isGrounded = true;
            this.boss.vx = 0;
            this.boss.vy = 0;
            this.bossEntranceDrop = {
                // タメ中の立ち位置(金鯱の上)だけを持つ。振り始めた後は
                // 足場の当たり判定と重力・連撃モーションに任せる。
                fromX: perchX,
                fromY: perchY,
                elapsed: 0,
                hold: STAGE6_BOSS_DROP_HOLD_MS,
                swinging: false,      // タメ明け(1撃目を振り始めた)
                perchReleased: false  // 2段目で足場から離れた
            };
        } else {
            this.bossEntranceDrop = null;
        }

        this.bossIntroTimer = this.bossIntroDuration;
        this.bossDefeatLingerTimer = 0;

        // 登場演出の開始（接近フェーズ）。
        // 旧実装はここで bossEntranceFlash = 1.0 の【白】を立てていたが、
        // (a) 描画していた Stage.render() が死んでいたので実際には出ておらず、
        // (b) 白の全画面フラッシュは色を飛ばす＝方針(色は変えない)に反する。
        // 衝撃フラッシュは「着地した瞬間の黒」に置き換え、impact フェーズで立てる。
        // Stage6の将軍は既に屋根の上に立っている＝着地しないので、
        // 接近も衝撃も踏まず turn(振り向き)から名乗りへ入る。
        this.bossIntroPhase = 'approach';
        this.bossIntroPhaseTimer = 0;
        this.bossUiRevealT = 0;
        this.bossEntranceFlash = 0;

        // 障害物はボス部屋に出現させない設計（spawnObstacleで手前打ち切り済み）。
        // ここでは画面左外へ流れ去った分だけ掃除し、画面内の障害物を一括消去しない。
        // → ボス登場と同時に障害物が「急に消える」違和感を出さない。
        this.obstacles = this.obstacles.filter(obs => obs.x + obs.width > this.progress - 100);
        this.obstacleTimer = 0;
    
        // 画面外の雑魚敵を消去
        this.enemies = this.enemies.filter(enemy => {
            const ex = enemy.x + enemy.width / 2;
            const isOnScreen = ex >= scrollX - 50 && ex <= scrollX + CANVAS_WIDTH + 50;
            if (!isOnScreen) {
                enemy.isAlive = false;
                enemy.isDying = true;
                return false;
            }
            return true;
        });

        // BGM切り替え。
        // ただし既に同じボス曲が鳴っている場合は呼ばない(playBgmは同じ曲でも
        // 先頭から鳴らし直す設計のため、stage6は大屋根到達時に鳴らしたラスボス曲が
        // 将軍登場でリセットされてしまう)。
        if (!this.isBossBgmPlaying()) {
            audio.playBgm('boss', this.stageNumber, 1000, 0);
        }
    }

    /** このステージのボス曲が既に再生中か(先頭からの鳴らし直しを防ぐ判定) */
    isBossBgmPlaying() {
        const expected = this.stageNumber === 6 ? 'lastboss' : 'boss';
        const el = audio.bgmAudio;
        if (!el || el.paused) return false;
        // currentBgmType はクロスフェードの後始末(_stopBgmElement)で null に落ちることがある。
        // 実際に鳴っている要素の src も見て、ラスボス曲の鳴らし直し(先頭へ戻る)を防ぐ。
        return audio.currentBgmType === expected || (el.src || '').includes(`${expected}.mp3`);
    }
    
    // P3 空補償: 空バンド [0, groundY] を [skyVisTop, groundY] へアフィン圧縮する。
    // skyVisTop=0 のとき恒等写像。groundY 側は不動点＝地平線基準の要素は不変。
    // 世界ズームの上部クロップで星・雲・天体が恒常的に画面外へ出るのを防ぐ。
    skyY(y) {
        const t = this.skyVisTop || 0;
        return t + y * (this.groundY - t) / this.groundY;
    }

    // 検証用の一括描画パス（ライブ描画は game.renderPlaying が層別に呼ぶ。ここは未使用）。
    // ボスUI/進捗バーはスクリーン空間のUIなのでここには含めない
    // （ボスUIは game.js の HUD 層 renderBossUI 呼び出しに一本化）。
    // 旧 Stage.render(ctx) は削除。game.js は renderBackground / renderGround /
    // renderObstacles / renderEnemies を個別に呼ぶため、この関数はどこからも
    // 呼ばれておらず「死んだコード」だった。中にあったボス演出(ビネット/パーティクル/
    // 登場フラッシュ)は一切画面に出ておらず、bossEntranceFlash はここでしか減衰しな
    // かったため一度立つと0に戻らなかった。演出は renderBossAtmosphere として
    // 生きた描画パスへ移設する。


    interpolateColor(colorStr1, colorStr2, factor) {
        const parseColor = (str) => {
            if (typeof str !== 'string') return { r: 0, g: 0, b: 0 };
            const color = str.trim();
            let r = 0, g = 0, b = 0;
            if (color.startsWith('#')) {
                if (color.length === 4) {
                    r = parseInt(color[1] + color[1], 16);
                    g = parseInt(color[2] + color[2], 16);
                    b = parseInt(color[3] + color[3], 16);
                } else if (color.length === 7) {
                    r = parseInt(color.substring(1, 3), 16);
                    g = parseInt(color.substring(3, 5), 16);
                    b = parseInt(color.substring(5, 7), 16);
                }
                return { r: Number.isFinite(r) ? r : 0, g: Number.isFinite(g) ? g : 0, b: Number.isFinite(b) ? b : 0 };
            }

            const rgbMatch = color.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
            if (rgbMatch) {
                r = Math.round(parseFloat(rgbMatch[1]));
                g = Math.round(parseFloat(rgbMatch[2]));
                b = Math.round(parseFloat(rgbMatch[3]));
            }
            r = Math.max(0, Math.min(255, Number.isFinite(r) ? r : 0));
            g = Math.max(0, Math.min(255, Number.isFinite(g) ? g : 0));
            b = Math.max(0, Math.min(255, Number.isFinite(b) ? b : 0));
            return { r, g, b };
        };

        const t = this.clamp01(Number.isFinite(factor) ? factor : 0);
        const c1 = parseColor(colorStr1);
        const c2 = parseColor(colorStr2);

        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);

        return `rgb(${r}, ${g}, ${b})`;
    }

    noise1DForStage(seed, stageNumber = this.stageNumber) {
        const x = Math.sin(seed * 127.1 + stageNumber * 311.7) * 43758.5453123;
        return x - Math.floor(x);
    }

    noise1D(seed) {
        return this.noise1DForStage(seed, this.stageNumber);
    }

    noiseSignedForStage(seed, stageNumber = this.stageNumber) {
        return this.noise1DForStage(seed, stageNumber) * 2 - 1;
    }

    noiseSigned(seed) {
        return this.noiseSignedForStage(seed, this.stageNumber);
    }

    clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    smoothstep(edge0, edge1, x) {
        if (edge0 === edge1) return x < edge0 ? 0 : 1;
        const t = this.clamp01((x - edge0) / (edge1 - edge0));
        return t * t * (3 - 2 * t);
    }

    getBossScrollStopX() {
        return Math.max(1, this.maxProgress - CANVAS_WIDTH);
    }

    getStage6ScrollProgress() {
        return this.clamp01(this.progress / this.getBossScrollStopX());
    }

    getStage6SunPhase() {
        return this.clamp01((this.getStage6ScrollProgress() - 0.82) / 0.18);
    }

    getStage6SunTheta() {
        return -0.22 + this.smoothstep(0, 1, this.getStage6SunPhase()) * 0.42;
    }

    getStage1GroundTransitionStartX() {
        return Math.max(0, this.maxProgress - STAGE1_GROUND_TRANSITION_LENGTH);
    }

    getStage1BambooTreeLineX() {
        return Math.max(0, this.maxProgress - STAGE1_BAMBOO_TREE_LINE_OFFSET);
    }

    getStage1SunHour() {
        const scrollProgress = this.clamp01(this.progress / this.getBossScrollStopX());
        return 4.5 + (STAGE1_BOSS_SUN_HOUR - 4.5) * this.smoothstep(0, 1, scrollProgress);
    }

    updateBambooLeafEffects(deltaTime, progressDelta = 0) {
        if (this.stageNumber !== 1) {
            this.bambooFallingLeaves.length = 0;
            this.bambooLeafSpawnTimer = 0;
            return;
        }

        const dtMs = deltaTime * 1000;
        const dtScale = deltaTime * 60;

        // 【ボス部屋では葉を降らせない】。ボス部屋は竹林を抜けた場面で、竹は画面左端に
        // わずかしか残っていない(実測: 樹列は画面x=260まで)。地面に落葉が積もっていない
        // 場所で葉が降り続けるのは絵として噛み合わないため、湧きを止める。
        // 既に落ちている葉は自然に着地・消滅させる(一斉に消すとパチッと切れる)。
        const bossActive = this.bossSpawned && !this.bossDefeated;

        this.updateBambooFallingLeaves(dtMs, dtScale, progressDelta, !bossActive);
    }

    updateBambooFallingLeaves(dtMs, dtScale, progressDelta = 0, allowSpawn = true) {
        const bambooEdgeScreenX = this.getStage1BambooTreeLineX() - this.progress;
        const spawnXMax = Math.min(CANVAS_WIDTH + 60, bambooEdgeScreenX + 40);
        const visibleForestWidth = Math.max(0, Math.min(CANVAS_WIDTH + 120, spawnXMax + 60));
        const forestCoverage = visibleForestWidth / (CANVAS_WIDTH + 120);
        const maxLeaves = Math.floor(14 * forestCoverage);
        const spawnInterval = 460 / Math.max(0.12, forestCoverage);
        this.bambooLeafSpawnTimer += dtMs;

        let fallingCount = this.bambooFallingLeaves.filter(l => l.state === 'falling').length;
        // 上限超過の間引きは湧きが動いている時だけ。ボス部屋(allowSpawn=false)でここを
        // 通すと maxLeaves=0 相当で落下中の葉が一斉に消える。
        let excessFallingLeaves = allowSpawn ? Math.max(0, fallingCount - maxLeaves) : 0;
        for (let i = this.bambooFallingLeaves.length - 1; i >= 0 && excessFallingLeaves > 0; i--) {
            if (this.bambooFallingLeaves[i].state !== 'falling') continue;
            this.bambooFallingLeaves.splice(i, 1);
            fallingCount--;
            excessFallingLeaves--;
        }

        while (allowSpawn && this.bambooLeafSpawnTimer >= spawnInterval) {
            this.bambooLeafSpawnTimer -= spawnInterval;
            if (spawnXMax <= -40 || maxLeaves <= 0) {
                this.bambooLeafSpawnTimer = 0;
                break;
            }
            if (fallingCount >= maxLeaves) {
                this.bambooLeafSpawnTimer = Math.min(this.bambooLeafSpawnTimer, spawnInterval);
                break;
            }
            const depth = 0.45 + Math.random() * 0.55;
            const movingForward = progressDelta > 0.05;
            const forwardSpawnMin = Math.min(
                CANVAS_WIDTH * 0.35,
                Math.max(-60, spawnXMax - 200)
            );
            const spawnXMin = movingForward ? forwardSpawnMin : -60;
            const screenX = spawnXMin + Math.random() * Math.max(1, spawnXMax - spawnXMin);
            const terminalVy = (0.62 + Math.random() * 0.72) * (0.86 + depth * 0.34);
            const rotDirection = Math.random() < 0.5 ? -1 : 1;
            this.bambooFallingLeaves.push({
                worldX: screenX + this.progress,
                y: -10 + Math.random() * 170,
                vx: (-0.1 - Math.random() * 0.24) * depth,
                vy: terminalVy * 0.72,
                terminalVy,
                rot: Math.random() * Math.PI * 2,
                rotV: (0.006 + Math.random() * 0.009) * rotDirection,
                swayPhase: Math.random() * Math.PI * 2,
                swaySpeed: 0.0036 + Math.random() * 0.0018,
                swayAmp: 0.1 + Math.random() * 0.16,
                gustPhase: Math.random() * Math.PI * 2,
                gustSpeed: 0.00035 + Math.random() * 0.0002,
                size: (14 + Math.random() * 8) * (0.92 + depth * 0.08),
                depth,
                state: 'falling',
                groundLife: 400 + Math.random() * 400,
                maxGroundLife: 800,
                leafId: (this._leafIdCounter = ((this._leafIdCounter || 0) + 1) & 0xFFFF)
            });
            fallingCount++;
        }

        for (let i = this.bambooFallingLeaves.length - 1; i >= 0; i--) {
            const leaf = this.bambooFallingLeaves[i];
            const targetY = this.groundY + LANE_OFFSET + (leaf.depth - 0.5) * 16;
            
            if (leaf.state === 'falling') {
                const flutterPhase = this.stageTime * (leaf.swaySpeed || 0.0045) + (leaf.swayPhase || 0);
                const gustPhase = this.stageTime * (leaf.gustSpeed || 0.00045) + (leaf.gustPhase || 0);
                const flutter = Math.sin(flutterPhase);
                const gust = Math.sin(gustPhase);
                const targetVy = (leaf.terminalVy || leaf.vy) * (0.76 + Math.abs(flutter) * 0.25);
                leaf.vy += (targetVy - leaf.vy) * Math.min(1, 0.045 * dtScale);
                leaf.worldX += (leaf.vx + flutter * (leaf.swayAmp || 0.14) + gust * 0.1) * dtScale;
                leaf.y += Math.max(0.18, leaf.vy - Math.max(0, flutter) * 0.06) * dtScale;
                leaf.rot += (leaf.rotV + Math.cos(flutterPhase) * 0.008 + gust * 0.003) * dtScale;
                
                if (leaf.y >= targetY) {
                    leaf.y = targetY;
                    leaf.state = 'grounded';
                    leaf.vx = 0; // 接地時に即停止
                    leaf.vy = 0;
                    leaf.rotV = 0;
                    leaf.maxGroundLife = leaf.groundLife;
                }
            } else if (leaf.state === 'grounded') {
                leaf.groundLife -= dtMs;
                
                // プレイヤーとの干渉（舞い上がり）処理は完全に削除。
                // 接地した葉は一定時間で消えるだけの演出用オブジェクトとする。

                if (leaf.groundLife <= 0) {
                    this.bambooFallingLeaves.splice(i, 1);
                    continue;
                }
            }
            // leaf.state === 'flying' のブロックも不要になったため削除

            const screenX = leaf.worldX - this.progress;
            if (screenX < -250 || screenX > CANVAS_WIDTH + 250 || leaf.y > CANVAS_HEIGHT + 100) {
                this.bambooFallingLeaves.splice(i, 1);
            }
        }
    }

    drawBambooLeaf(ctx, x, y, size, rot, color, alpha, leafId = -1, depth = 0.5) {
        if (this.cachedAssets.bambooLeaves) {
            const n = this.cachedAssets.bambooLeaves.length;
            // depth(0=奥/暗, 1=手前/明) でカラーバンドを決め、leafIdで±1の揺らぎを与える
            const hash = leafId >= 0 ? leafId : Math.abs(Math.floor(size * 17 + 0.5));
            const base = Math.round(depth * (n - 1));
            const leafIdx = (base + (hash % 3) - 1 + n * 2) % n;
            const img = this.cachedAssets.bambooLeaves[leafIdx];
            
            ctx.save();
            ctx.globalAlpha *= alpha;
            ctx.translate(x, y);
            ctx.rotate(rot);
            const scale = (size / 12);
            ctx.drawImage(img, -16 * scale, -16 * scale, 32 * scale, 32 * scale);
            ctx.restore();
        } else {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.globalAlpha *= alpha;
            ctx.fillStyle = color || '#364b2d';
            ctx.beginPath();
            ctx.moveTo(-size * 0.62, 0.5);
            ctx.quadraticCurveTo(-size * 0.08, -size * 0.34, size * 0.68, -size * 0.05);
            ctx.quadraticCurveTo(size * 0.08, size * 0.3, -size * 0.62, 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(10, 20, 11, 0.56)';
            ctx.lineWidth = 0.65;
            ctx.beginPath();
            ctx.moveTo(-size * 0.45, 0.25);
            ctx.quadraticCurveTo(0, -0.35, size * 0.53, -size * 0.03);
            ctx.stroke();
            ctx.restore();
        }
    }

    renderBambooFallingLeaves(ctx) {
        if (this.stageNumber !== 1 || this.bambooFallingLeaves.length === 0) return;

        ctx.save();
        for (const leaf of this.bambooFallingLeaves) {
            const screenX = leaf.worldX - this.progress;
            // 落下中または舞い上がり中
            if (leaf.state !== 'grounded') {
                this.drawBambooLeaf(ctx, screenX, leaf.y, leaf.size, leaf.rot, '', 0.58 + leaf.depth * 0.38, leaf.leafId ?? -1, leaf.depth);
            } else {
                const lifeAlpha = Math.max(0, Math.min(1, leaf.groundLife / leaf.maxGroundLife));
                this.drawBambooLeaf(ctx, screenX, leaf.y, leaf.size, leaf.rot, '', (0.18 + leaf.depth * 0.24) * lifeAlpha, leaf.leafId ?? -1, leaf.depth);
            }
        }
        ctx.restore();
    }

    renderFlowingCloudLayer(
        ctx,
        {
            time = 0,
            color = 'rgba(255, 255, 255, 0.16)',
            alpha = 0.22,
            baseY = 120,
            span = 280,
            height = 56,
            speed = 11.5,
            waveAmp = 14,
            density = 0.76,
            trail = 110
        } = {}
    ) {
        const scroll = this.progress * 0.04 + time * speed;
        const offset = ((scroll % span) + span) % span;
        const start = -3;
        const end = Math.ceil(CANVAS_WIDTH / span) + 4;

        ctx.save();
        ctx.globalAlpha *= alpha;
        for (let i = start; i <= end; i++) {
            const worldIndex = i + Math.floor(scroll / span);
            const seed = worldIndex * 3.91;
            if (this.noise1D(seed + 0.8) > density) continue;

            const x = i * span - offset + this.noiseSigned(seed + 1.6) * 48;
            const y = this.skyY(baseY)
                + Math.sin(worldIndex * 0.72 + time * 0.82) * waveAmp
                + this.noiseSigned(seed + 2.9) * 8;
            const w = span * (0.8 + this.noise1D(seed + 3.7) * 1.1);
            const h = height * (0.74 + this.noise1D(seed + 4.4) * 0.7);
            const tailLen = trail * (0.65 + this.noise1D(seed + 5.1) * 0.9);

            const grad = ctx.createLinearGradient(x - tailLen, y, x + w * 0.9, y + h * 0.15);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.26, color);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;

            ctx.beginPath();
            ctx.moveTo(x - tailLen, y + h * 0.35);
            ctx.bezierCurveTo(
                x - tailLen * 0.25, y + h * 0.12,
                x + w * 0.06, y - h * 0.34,
                x + w * 0.28, y - h * 0.08
            );
            ctx.bezierCurveTo(
                x + w * 0.46, y - h * 0.46,
                x + w * 0.72, y - h * 0.2,
                x + w * 0.92, y + h * 0.22
            );
            ctx.bezierCurveTo(
                x + w * 0.68, y + h * 0.54,
                x + w * 0.26, y + h * 0.58,
                x - tailLen, y + h * 0.35
            );
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    getCurrentBackgroundPalette() {
        // 進行度に応じて start -> mid -> end のカラーパレットを補間して返す
        // this.maxProgress は進行度の最大値。0 ~ 1.0 に正規化
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        
        const layersConfig = this.bgLayers;
        let c1, c2, factor;

        if (p < 0.5) {
            c1 = layersConfig.start;
            c2 = layersConfig.mid;
            factor = p * 2; // 0.0 ~ 0.5 => 0.0 ~ 1.0
        } else {
            c1 = layersConfig.mid;
            c2 = layersConfig.end;
            factor = (p - 0.5) * 2; // 0.5 ~ 1.0 => 0.0 ~ 1.0
        }

        return {
            sky: [
                this.interpolateColor(c1.sky[0], c2.sky[0], factor),
                this.interpolateColor(c1.sky[1], c2.sky[1], factor)
            ],
            far: this.interpolateColor(c1.far, c2.far, factor),
            mid: this.interpolateColor(c1.mid, c2.mid, factor),
            near: this.interpolateColor(c1.near, c2.near, factor),
            elements: layersConfig.elements
        };
    }

    renderBackground(ctx) {
        const currentPalette = this.getCurrentBackgroundPalette();
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        const time = this.stageTime * 0.001;
        const isCastleInterior = currentPalette.elements === 'castle';
        const isBambooForest = currentPalette.elements === 'bamboo';
        const isTenshuStageBg = currentPalette.elements === 'tenshu';
        const bossEncounterActive = this.bossSpawned && !this.bossDefeated;
        const bossEncounterBlend = this.bossEncounterBlend;

        // ボス戦時の陽炎効果（Stage 2）
        if (this.stageNumber === 2 && bossEncounterBlend > 0) {
            this.renderHeatHaze(ctx, time, bossEncounterBlend);
        }
        
        let skyColors = currentPalette.sky;
        // ボス戦時の空の色変化を廃止
        
        // 空グラデーション - 垂直スクロール対応のため上下に大きく拡張
        const skyGradient = ctx.createLinearGradient(0, -400, 0, this.groundY + 400);
        skyGradient.addColorStop(0, skyColors[0]);
        skyGradient.addColorStop(1, skyColors[1]);
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);

        if (this.stageNumber === 1) {
            const sunriseBand = this.smoothstep(0.22, 0.92, p);
            if (sunriseBand > 0.001) {
                const fireBand = ctx.createLinearGradient(0, this.groundY + 18, 0, this.groundY * 0.18);
                fireBand.addColorStop(0, `rgba(255, 82, 22, ${(0.28 * sunriseBand).toFixed(3)})`);
                fireBand.addColorStop(0.25, `rgba(255, 122, 34, ${(0.22 * sunriseBand).toFixed(3)})`);
                fireBand.addColorStop(0.55, `rgba(255, 170, 72, ${(0.12 * sunriseBand).toFixed(3)})`);
                fireBand.addColorStop(1, 'rgba(255, 128, 44, 0)');
                ctx.fillStyle = fireBand;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
            }
        }

        // ステージ3: 日没に近づくほど地平線の残照と上空の深い藍を重ねる
        if (this.stageNumber === 3) {
            // p が 0.5 を超えたあたりから夕暮れ色の変化が加速
            const duskStrength = this.smoothstep(0.35, 1.0, p);
            if (duskStrength > 0.001) {
                // 上空 → 深い藍のオーバーレイ（上から下へ消える）
                const deepBlue = ctx.createLinearGradient(0, 0, 0, this.groundY);
                deepBlue.addColorStop(0,    `rgba(14, 10, 48, ${(0.72 * duskStrength).toFixed(3)})`);
                deepBlue.addColorStop(0.38, `rgba(18, 12, 52, ${(0.45 * duskStrength).toFixed(3)})`);
                deepBlue.addColorStop(0.72, `rgba(20, 10, 40, ${(0.14 * duskStrength).toFixed(3)})`);
                deepBlue.addColorStop(1,    'rgba(10, 5, 20, 0)');
                ctx.fillStyle = deepBlue;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

                // 地平線の残照（下から上へ消える）
                const afterglow = ctx.createLinearGradient(0, this.groundY, 0, this.groundY * 0.55);
                afterglow.addColorStop(0,    `rgba(200, 70, 20, ${(0.38 * duskStrength).toFixed(3)})`);
                afterglow.addColorStop(0.45, `rgba(160, 40, 10, ${(0.18 * duskStrength).toFixed(3)})`);
                afterglow.addColorStop(1,    'rgba(100, 20, 5, 0)');
                ctx.fillStyle = afterglow;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
            }
        }

        // ステージ6: 月が沈んだ後（progress 0.4〜0.92）の深い青い夜空
        if (this.stageNumber === 6 && !this.bossSpawned) {
            const moonGoneStart = 0.4;
            const moonGoneEnd = 0.92;
            if (p >= moonGoneStart && p <= moonGoneEnd) {
                const localP = (p - moonGoneStart) / (moonGoneEnd - moonGoneStart);
                // 入り: 0→0.1 でフェードイン、出: 0.85→1.0 でフェードアウト
                const inFade  = this.smoothstep(0, 0.10, localP);
                const sunApproach = this.smoothstep(0.72, 1.0, this.getStage6ScrollProgress());
                const outFade = (1 - this.smoothstep(0.82, 1.0, localP)) * (1 - sunApproach);
                const blueStr = inFade * outFade;
                if (blueStr > 0.001) {
                    const deepNight = ctx.createLinearGradient(0, 0, 0, this.groundY);
                    deepNight.addColorStop(0,    `rgba(4, 12, 38, ${(0.82 * blueStr).toFixed(3)})`);
                    deepNight.addColorStop(0.55, `rgba(5, 14, 42, ${(0.55 * blueStr).toFixed(3)})`);
                    deepNight.addColorStop(1,    `rgba(3, 8, 22, ${(0.30 * blueStr).toFixed(3)})`);
                    ctx.fillStyle = deepNight;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
                }
            }
        }

        // Stage6の朝焼けは空そのものの色なので、天体・パノラマより先に空全面へ重ねる。
        // 旧処理はパノラマ描画後に dawnHorizonY までの矩形を塗っていたため、
        // 矩形下端が空を横切る一本線として露出していた。
        if (this.stageNumber === 6) {
            const dawnRise = this.smoothstep(0.55, 1.0, this.clamp01(this.progress / this.maxProgress));
            if (dawnRise > 0.001) {
                const dawnHorizonY = this.groundY - 125;
                const dawnGlow = ctx.createRadialGradient(
                    CANVAS_WIDTH * 0.5, dawnHorizonY, 0,
                    CANVAS_WIDTH * 0.5, dawnHorizonY, CANVAS_WIDTH * 0.7
                );
                dawnGlow.addColorStop(0, `rgba(255, 180, 60, ${0.22 * dawnRise})`);
                dawnGlow.addColorStop(0.35, `rgba(255, 120, 30, ${0.14 * dawnRise})`);
                dawnGlow.addColorStop(1, 'rgba(255, 60, 10, 0)');
                ctx.fillStyle = dawnGlow;
                // 最終stopが透明なので塗り範囲を矩形で切らず、自然な円形減衰に任せる。
                ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);
            }
        }

        // ボス戦中の色変化は全廃(ユーザー方針「ボス戦で色は一切変えない」)。
        // 旧: ステージ6のみ rgb(255,140,50) の hard-light を全画面に持続 → 空が橙に
        // 染まり「どのステージも夕方」の一因だった。特別感はビネット・空気・照明で出す
        // (renderBossAtmosphere)。

        if (!isCastleInterior) {
            const isSunnyStage = this.stageNumber === 2;

            // 星・粒子
            this.renderSkyParticles(ctx, time);

            // 太陽と月の描画（星や空グラデーションの後、雲海の前）
            this.renderCelestialBodies(ctx);

            // 雲のたなびき
            if (isSunnyStage) {
                this.renderFlowingCloudLayer(ctx, {
                    time,
                    color: 'rgba(255, 255, 255, 0.2)',
                    alpha: 0.24,
                    baseY: 106,
                    span: 360,
                    height: 44,
                    speed: 16,
                    waveAmp: 10,
                    density: 0.68,
                    trail: 160
                });
                this.renderFlowingCloudLayer(ctx, {
                    time: time * 0.86,
                    color: 'rgba(242, 251, 255, 0.16)',
                    alpha: 0.2,
                    baseY: 150,
                    span: 300,
                    height: 40,
                    speed: 12,
                    waveAmp: 9,
                    density: 0.7,
                    trail: 130
                });
            } else if (this.stageNumber !== 1 && this.stageNumber !== 6) {
                // ステージ1は竹林画像で密度を出すため、空の雲・もやは描かない。
                this.renderFlowingCloudLayer(ctx, {
                    time,
                    color: 'rgba(206, 220, 245, 0.14)',
                    alpha: 0.24,
                    baseY: 124,
                    span: 320,
                    height: 52,
                    speed: 10.5,
                    waveAmp: 15,
                    density: 0.77,
                    trail: 120
                });
                this.renderFlowingCloudLayer(ctx, {
                    time: time * 0.8,
                    color: 'rgba(178, 200, 232, 0.12)',
                    alpha: 0.18,
                    baseY: 170,
                    span: 280,
                    height: 44,
                    speed: 8.5,
                    waveAmp: 12,
                    density: 0.72,
                    trail: 95
                });
            }

            // 地平線の薄い霞。Stage1は竹林の奥に白いもやが出るため描かず、Stage3は夕焼けの地面境界で横帯に見えるため描かない。
            if (this.stageNumber !== 1 && this.stageNumber !== 3) {
                const haze = ctx.createLinearGradient(0, this.groundY - 120, 0, this.groundY + 20);
                haze.addColorStop(0, 'rgba(255,255,255,0)');
                haze.addColorStop(1, isSunnyStage ? 'rgba(210,228,255,0.12)' : 'rgba(190,210,255,0.08)');
                ctx.fillStyle = haze;
                ctx.fillRect(0, this.groundY - 120, CANVAS_WIDTH, 150);
            }
        } else {
            // 室内の時間経過（進行に応じて朱色の光が移ろう）
            const stageP = this.clamp01(this.progress / this.maxProgress);
            const timeBlend = this.smoothstep(0, 1, stageP);

            const warmTopR = Math.round(255 + (246 - 255) * timeBlend);
            const warmTopG = Math.round(188 + (162 - 188) * timeBlend);
            const warmTopB = Math.round(122 + (96 - 122) * timeBlend);
            const warmTopA = 0.28 + (0.24 - 0.28) * timeBlend;
            const warmBottomR = Math.round(124 + (78 - 124) * timeBlend);
            const warmBottomG = Math.round(38 + (24 - 38) * timeBlend);
            const warmBottomB = Math.round(24 + (18 - 24) * timeBlend);
            const warmBottomA = 0.2 + (0.28 - 0.2) * timeBlend;
            const indoorHaze = ctx.createLinearGradient(0, -400, 0, this.groundY + 400);
            indoorHaze.addColorStop(0, `rgba(${warmTopR}, ${warmTopG}, ${warmTopB}, ${warmTopA.toFixed(3)})`);
            indoorHaze.addColorStop(1, `rgba(${warmBottomR}, ${warmBottomG}, ${warmBottomB}, ${warmBottomA.toFixed(3)})`);
            ctx.fillStyle = indoorHaze;
            ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);

            // 城内の壁面の意匠（柱と梁）
            const pillarDist = 400;
            const scroll = this.progress * 0.5; // 背景パララックス
            const pillarOffset = ((scroll % pillarDist) + pillarDist) % pillarDist;
            ctx.fillStyle = this.interpolateColor('#2a1810', '#120a05', 0.2);
            for (let i = -1; i <= Math.ceil(CANVAS_WIDTH / pillarDist) + 1; i++) {
                const px = i * pillarDist - pillarOffset;
                // 垂直の柱
                ctx.fillRect(px, -400, 20, this.groundY + 400);
            }
            // 水平の梁（鴨居・長押）
            ctx.fillRect(0, this.groundY * 0.25 - 400, CANVAS_WIDTH, 15);
            ctx.fillRect(0, this.groundY - 40, CANVAS_WIDTH, 20);

            const motes = 16;
            for (let i = 0; i < motes; i++) {
                const seed = i * 17.3;
                const x = ((this.noise1D(seed + 0.7) * CANVAS_WIDTH) + time * (6 + this.noise1D(seed + 1.4) * 10)) % CANVAS_WIDTH;
                const y = 30 + this.noise1D(seed + 2.6) * (this.groundY * 0.55);
                const r = 0.8 + this.noise1D(seed + 3.8) * 2;
                ctx.fillStyle = `rgba(248, 222, 176, ${0.08 + this.noise1D(seed + 4.9) * 0.08})`;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // 旧「ボス戦中の稲妻」(約0.5秒ごとに全画面 rgba(255,255,255,0.3) を1フレーム)は廃止。
        // 空の色が飛んで時間帯が壊れ、常時パチつくのが目障りだった。

        if (!isCastleInterior && !isBambooForest && !isTenshuStageBg) {
            // 遠方の山並み・稜線は画像置換対象外として残す。
            this.renderBackgroundLayer(ctx, currentPalette.far, 0.2, 0.7, 100);
            this.renderBackgroundLayer(ctx, currentPalette.mid, 0.4, 0.8, 60);
            this.renderBackgroundLayer(ctx, currentPalette.near, 0.7, 1.0, 20);
        } else if (isBambooForest) {
            this.renderStage1FixedRoadMountains(ctx);
        }
        
        // ステージ固有の背景要素
        this.renderStageElements(ctx, currentPalette);

        // Stage2のラストオブジェクトは背景パララックスに混ぜず、地面と同じワールド座標で固定配置する。
        if (this.stageNumber === 2) {
            this.renderStage2MountainPassEntrance(ctx);
        }

        // ボス部屋の右側に次ステージへの「出入口」を描く件:
        // ※ Stage1（竹林）は管理林縁から街道へ接続する専用終端を使うため、汎用peekは使わない。
        // ※ Stage2（街道）は山道入口をステージ内の通常背景として描画する。
        // ※ Stage3（山道）のラストオブジェクトは renderStage3ExitOnGround へ移設。
        //    背景(地面より前)で描くと基部を足元線(512)まで下げられず(下が地面に覆われる)、
        //    地平線(480)に貼り付いて床帯から浮いて見えていた。
        // ※ Stage4（城下町）は城郭(renderStage4CastleLower)が出口を兼ねる。
        // ※ Stage5（城内）は画像ベースの階段（stairImage）が出口を兼ねるため peek は描かない。

        // 旧 renderBossStageShift(全ステージに暗赤〜橙のオーバーレイ3層)は廃止。
        // これが「どのステージもボス戦は夕方」の主犯だった。色は変えず、
        // 空間の演出(renderBossAtmosphere)で特別感を出す方針に変更。

        // 周辺減光で中央へ視線誘導
        const vignette = ctx.createRadialGradient(
            CANVAS_WIDTH * 0.5, this.groundY * 0.45, CANVAS_WIDTH * 0.12,
            CANVAS_WIDTH * 0.5, this.groundY * 0.45, CANVAS_WIDTH * 0.75
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);

        // 地面との境界に影を落とす（室内のみ）
        if (isCastleInterior) {
            const shadowGrad = ctx.createLinearGradient(0, this.groundY - 60, 0, this.groundY);
            shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
            ctx.fillStyle = shadowGrad;
            ctx.fillRect(0, this.groundY - 60, CANVAS_WIDTH, 65);
        }
    }

    renderStage2MountainPassEntrance(ctx) {
        if (this.stageNumber !== 2) return false;

        const passImg = this.stage2MountainPassImage;
        const backMountainImg = this.stage2MountainBackImage;
        const passReady = passImg && passImg.complete && passImg.naturalWidth > 0 && passImg.naturalHeight > 0;
        const backReady = backMountainImg && backMountainImg.complete && backMountainImg.naturalWidth > 0 && backMountainImg.naturalHeight > 0;
        if (!passReady && !backReady) return false;

        const p = this.progress;
        const baseY = this.groundY;
        const passAspect = passReady ? passImg.naturalWidth / passImg.naturalHeight : 1667 / 888;
        const passH = Math.min(CANVAS_HEIGHT * 0.66, baseY + 28);
        const passW = passH * passAspect;
        const passStopX = CANVAS_WIDTH - passW + 18;
        const cameraStopX = Math.max(0, this.maxProgress - CANVAS_WIDTH);
        const passWorldX = cameraStopX + passStopX;
        const passX = passWorldX - p;
        const passY = baseY - passH + 12;

        // 画面に入る直前まで描画を切ると大きい画像のデコードも直前になり、後出しに見える。
        // 右側のかなり外から通常オブジェクトとして描画対象に入れて、自然な画面インにする。
        const prewarmMarginRight = CANVAS_WIDTH * 2.4;
        if (passX + passW < -160 || passX > CANVAS_WIDTH + prewarmMarginRight) return false;

        if (backReady) {
            const backH = Math.min(CANVAS_HEIGHT * 0.96, baseY + 160);
            const backW = backH * (backMountainImg.naturalWidth / backMountainImg.naturalHeight);
            const backX = passX + passW * 0.5 - backW * 0.5;
            const backY = baseY - backH + 8;

            ctx.save();
            ctx.filter = 'brightness(0.58) saturate(0.58) contrast(0.88)';
            ctx.drawImage(backMountainImg, backX, backY, backW, backH);
            ctx.filter = 'none';
            ctx.restore();
        }

        if (passReady) {
            ctx.save();
            ctx.filter = 'brightness(0.74) saturate(0.66) contrast(0.9)';
            ctx.drawImage(passImg, passX, passY, passW, passH);
            ctx.filter = 'none';
            ctx.restore();
        }
        return true;
    }

    // Stage3のラストオブジェクト(石塚の門+眺望 stage3_mountain_exit.png)。
    // 【地面レイヤーの後に描く】(renderStage3RoadsideOnGround 経由)。
    // 旧 renderNextStagePeek は背景パス(地面より前)にあり、基部を足元線まで
    // 下げると下が地面に覆われるため地平線(480)接地しか選べず、床帯(480..512)の
    // 上で浮いて見えていた。投影文法: 構造物基部は478..512(床帯へ食い込ませて植える)。
    renderStage3ExitOnGround(ctx) {
        const exitImg = this.stage3ExitImage;
        if (!(exitImg && exitImg.complete && exitImg.naturalWidth > 0)) return;
        const p = this.progress;
        // ラストオブジェクトは地面と同じパララックス(1.0)でワールド配置にする(stage4の城と同じ作法)。
        // peekWX(xFixed) はカメラ停止時(p=maxProgress-CANVAS_WIDTH)に xFixed を返し、
        // 接近中はボス部屋左端基準で右から流入する。
        const peekBase = this.maxProgress - 150; // ボス部屋右端寄りに（手前の添景と分離・見切れ防止）
        const peekAnchorX = peekBase - p;
        if (peekAnchorX > CANVAS_WIDTH + 600) return;
        const ANCHOR_STOP = peekBase - (this.maxProgress - CANVAS_WIDTH);
        const exitW = 680;
        const exitH = exitW * (exitImg.naturalHeight / exitImg.naturalWidth);
        const exitX = peekAnchorX + (CANVAS_WIDTH - exitW + 18 - ANCHOR_STOP);
        if (exitX + exitW < -80 || exitX > CANVAS_WIDTH + 120) return;
        // 画像下部に透明余白が約10.8%あるため、不透明部分の下端で接地させる。
        // 足元線+2 = 基部が床帯へわずかに食い込み、「置いてある」ではなく「植わっている」。
        const visibleBottomRatio = 829 / 929;
        const footY = this.groundY + LANE_OFFSET + 2;
        const exitY = Math.round(footY - exitH * visibleBottomRatio);
        ctx.save();
        ctx.globalAlpha *= 0.96;
        ctx.filter = 'brightness(0.84) saturate(0.72) contrast(0.94)';
        ctx.drawImage(exitImg, exitX, exitY, exitW, exitH);
        ctx.filter = 'none';
        ctx.restore();
    }


    renderStage1FixedRoadMountains(ctx) {
        const cameraX = Math.floor(this.progress);
        const startX = this.getStage1BambooTreeLineX() - cameraX;
        if (startX >= CANVAS_WIDTH) return false;

        ctx.save();
        ctx.beginPath();
        ctx.rect(startX, -400, CANVAS_WIDTH - startX, CANVAS_HEIGHT + 800);
        ctx.clip();
        ctx.translate(startX, 0);

        const stage2Start = { far: '#607182', mid: '#728595', near: '#8398a8' };
        const fixedStage2Options = { progress: 0, noiseStageNumber: 2 };
        this.renderBackgroundLayer(ctx, stage2Start.far, 0.2, 0.7, 100, fixedStage2Options);
        this.renderBackgroundLayer(ctx, stage2Start.mid, 0.4, 0.8, 60, fixedStage2Options);
        this.renderBackgroundLayer(ctx, stage2Start.near, 0.7, 1, 20, fixedStage2Options);

        ctx.restore();
        return true;
    }

    renderBackgroundLayer(ctx, color, parallax, alpha, yOffsetBase = 50, options = {}) {
        ctx.save();
        ctx.globalAlpha *= alpha;

        const segmentBase = 230 + parallax * 130;
        const renderProgress = options.progress ?? this.progress;
        const noiseStageNumber = options.noiseStageNumber ?? this.stageNumber;
        const noise1D = (seed) => this.noise1DForStage(seed, noiseStageNumber);
        const noiseSigned = (seed) => this.noiseSignedForStage(seed, noiseStageNumber);
        const scroll = renderProgress * parallax;
        const offset = ((scroll % segmentBase) + segmentBase) % segmentBase;
        const start = -2;
        const end = Math.ceil(CANVAS_WIDTH / segmentBase) + 3;

        for (let i = start; i <= end; i++) {
            const worldIndex = i + Math.floor(scroll / segmentBase);
            const seed = worldIndex * (8.17 + parallax * 4.31);
            const ridgeW = segmentBase * (0.8 + noise1D(seed + 0.93) * 0.95);
            const x = i * segmentBase - offset + noiseSigned(seed + 1.27) * (segmentBase * 0.18);

            const hA = Math.max(22, yOffsetBase + 24 + noiseSigned(seed + 2.11) * 38);
            const hB = Math.max(18, yOffsetBase + 10 + noiseSigned(seed + 3.73) * 34);
            const hC = Math.max(12, yOffsetBase - 8 + noiseSigned(seed + 5.19) * 28);
            const hD = Math.max(10, yOffsetBase - 2 + noiseSigned(seed + 6.41) * 24);

            ctx.beginPath();
            ctx.moveTo(x - 24, this.groundY);
            ctx.lineTo(x - 24, this.groundY - hC * 0.4);
            ctx.bezierCurveTo(
                x + ridgeW * 0.12, this.groundY - hA,
                x + ridgeW * 0.3, this.groundY - hB,
                x + ridgeW * 0.52, this.groundY - hC
            );
            ctx.bezierCurveTo(
                x + ridgeW * 0.72, this.groundY - hD,
                x + ridgeW * 0.86, this.groundY - hA * 0.62,
                x + ridgeW + 26, this.groundY - hD * 0.3
            );
            ctx.lineTo(x + ridgeW + 26, this.groundY);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            const shade = ctx.createLinearGradient(0, this.groundY - hA, 0, this.groundY);
            shade.addColorStop(0, `rgba(255,255,255,${0.07 * alpha})`);
            shade.addColorStop(0.45, 'rgba(255,255,255,0)');
            shade.addColorStop(1, `rgba(24,34,50,${0.16 * alpha})`);
            ctx.fillStyle = shade;
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + 0.04 * alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }

    renderStage3DistantMountainBands(ctx, currentPalette, progress) {
        const drawMountainBand = (parallax, spanBase, peakBase, color, alpha) => {
            const scroll = progress * parallax;
            const offset = ((scroll % spanBase) + spanBase) % spanBase;
            const start = -2;
            const end = Math.ceil(CANVAS_WIDTH / spanBase) + 3;
            ctx.save();
            ctx.globalAlpha *= alpha;
            ctx.fillStyle = color;

            for (let i = start; i <= end; i++) {
                const worldIndex = i + Math.floor(scroll / spanBase);
                const seed = worldIndex * (6.41 + parallax * 7.2);
                const ridgeW = spanBase * (0.85 + this.noise1D(seed + 0.7) * 0.9);
                const x = i * spanBase - offset + this.noiseSigned(seed + 1.9) * 80;
                if (x < -100 || x > CANVAS_WIDTH + 100) continue;

                const peakA = peakBase + this.noise1D(seed + 2.4) * (peakBase * 0.65);
                const peakB = peakBase * 0.72 + this.noise1D(seed + 3.6) * (peakBase * 0.5);
                const shoulder = peakBase * 0.45 + this.noise1D(seed + 4.8) * (peakBase * 0.35);

                ctx.beginPath();
                ctx.moveTo(x - 50, this.groundY);
                ctx.bezierCurveTo(
                    x + ridgeW * 0.12, this.groundY - shoulder,
                    x + ridgeW * 0.26, this.groundY - peakA,
                    x + ridgeW * 0.48, this.groundY - peakB
                );
                ctx.bezierCurveTo(
                    x + ridgeW * 0.7, this.groundY - (peakB * 0.86),
                    x + ridgeW * 0.86, this.groundY - shoulder,
                    x + ridgeW + 50, this.groundY
                );
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        };

        drawMountainBand(0.12, 560, 180, currentPalette.far, 0.36);
        drawMountainBand(0.22, 430, 130, currentPalette.mid, 0.24);

        const mist = ctx.createLinearGradient(0, this.groundY - 190, 0, this.groundY - 18);
        mist.addColorStop(0, 'rgba(220, 210, 230, 0)');
        mist.addColorStop(0.72, 'rgba(196, 182, 210, 0.09)');
        mist.addColorStop(1, 'rgba(196, 182, 210, 0)');
        ctx.fillStyle = mist;
        ctx.fillRect(0, this.groundY - 190, CANVAS_WIDTH, 180);
    }
    
    getStage3RoadsidePropPlan() {
        return [
            { type: 'woodFence', worldX: 980,  height: 92,  y: 3, alpha: 0.88 },
            { type: 'stoneLantern', worldX: 1480, height: 110, y: 2, alpha: 0.82 },
            { type: 'signpost', worldX: 2660, height: 112, y: 4, alpha: 0.88 },
            { type: 'dosojin', worldX: 4210, height: 70,  y: 4, alpha: 0.88 },
            { type: 'mountainSign', worldX: 5700, height: 126, y: 4, alpha: 0.86 },
            { type: 'jizoLarge', worldX: 6550, height: 94, y: 4, alpha: 0.86 },
            { type: 'woodFence', worldX: 7350, height: 82, y: 4, alpha: 0.84 },
            { type: 'stoneLantern', worldX: 9860, height: 96, y: 3, alpha: 0.78 }
        ];
    }

    getStage3PropAspect(type) {
        const image = this.stage3PropImages?.[type];
        if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
            return image.naturalWidth / image.naturalHeight;
        }
        const fallbackAspect = {
            dosojin: 628 / 760,
            jizoLarge: 276 / 760,
            mountainSign: 393 / 760,
            signpost: 429 / 760,
            stoneLantern: 348 / 760,
            woodFence: 760 / 418
        };
        return fallbackAspect[type] || 1;
    }

    /**
     * 地面の後に描く道沿いの添景。game.js のレイヤー2(地面)の直後から呼ぶ。
     * 影より奥＝床に置いた物として、役者より後ろに立つ。
     */
    renderStage3RoadsideOnGround(ctx) {
        if (this.stageNumber !== 3) return;
        // ラストオブジェクト(石塚の門)が一番奥、道沿いの添景はその手前。
        this.renderStage3ExitOnGround(ctx);
        this.renderStage3RoadsideProps(ctx);
        this.renderStage3RoadsideClusters(ctx);
    }

    /**
     * 添景の接地影。床帯(480..720)は俯瞰なので、足元に潰した楕円を敷くと
     * 「床に植わっている」ように読める。影が無いと、足元が地平線に接していても
     * 手前に広がる床帯のせいで貼り付いた絵に見える(浮きの正体)。
     */
    drawStage3PropContactShadow(ctx, centerX, footY, width) {
        const rx = Math.max(14, width * 0.52);
        const ry = Math.max(4, rx * 0.22);
        const shade = ctx.createRadialGradient(centerX, footY, 0, centerX, footY, rx);
        shade.addColorStop(0, 'rgba(18, 12, 10, 0.42)');
        shade.addColorStop(0.62, 'rgba(18, 12, 10, 0.17)');
        shade.addColorStop(1, 'rgba(18, 12, 10, 0)');
        ctx.save();
        ctx.translate(centerX, footY);
        ctx.scale(1, ry / rx);
        ctx.translate(-centerX, -footY);
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(centerX, footY, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * 道沿いの添景。【地面レイヤーより後に描く】。
     * 背景の switch の中(地面より前)に置いていた頃は、足元を床線(512)へ下げると
     * 下35pxが地面に覆われて足を切られるため、地平線(480)に貼り付けるしかなかった。
     * 床の上に出したので足元線に立たせ、接地影を敷いて植わって見せる。
     */
    renderStage3RoadsideProps(ctx) {
        const images = this.stage3PropImages;
        if (!images) return;

        const props = this.getStage3RoadsidePropPlan();

        for (const prop of props) {
            const image = images[prop.type];
            if (!image || !image.complete || image.naturalWidth <= 0) continue;

            const width = prop.height * (image.naturalWidth / image.naturalHeight);
            const x = prop.worldX - this.progress;
            if (x + width < -80 || x > CANVAS_WIDTH + 80) continue;

            const footY = this.groundY + LANE_OFFSET + prop.y;
            const y = footY - prop.height;
            ctx.save();
            ctx.globalAlpha *= prop.alpha;
            this.drawStage3PropContactShadow(ctx, x + width * 0.5, footY - 2, width);
            ctx.filter = 'brightness(0.66) sepia(0.22) saturate(0.68) contrast(0.86) hue-rotate(-6deg)';
            ctx.drawImage(image, x, y, width, prop.height);
            ctx.filter = 'none';
            ctx.restore();
        }
    }

    renderStage3RoadsideClusters(ctx) {
        const images = this.stage3PropImages;
        if (!images) return;

        const plan = [
            { type: 'woodFence', h: 68, alpha: 0.7, xBias: -34 },
            null,
            { type: 'woodFence', h: 72, alpha: 0.72, xBias: 28 },
            { type: 'jizoLarge', h: 76, alpha: 0.7, xBias: -18 },
            null,
            { type: 'stoneLantern', h: 88, alpha: 0.68, xBias: 18 },
            null
        ];
        const span = 620;
        const scroll = this.progress;
        const start = Math.floor((scroll - 760) / span);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 760) / span);
        const finalClearWorldX = Math.max(0, this.maxProgress - CANVAS_WIDTH + 360);
        const occupiedRanges = this.getStage3RoadsidePropPlan()
            .map((prop) => {
                const width = prop.height * this.getStage3PropAspect(prop.type);
                const x = prop.worldX - scroll;
                return { left: x - 58, right: x + width + 58 };
            })
            .filter((range) => range.right >= -220 && range.left <= CANVAS_WIDTH + 220);
        const overlapsOccupied = (left, right) => occupiedRanges.some((range) => left < range.right && right > range.left);

        for (let i = start; i <= end; i++) {
            const seed = i * 7.91;
            const item = plan[((i % plan.length) + plan.length) % plan.length];
            if (!item || this.noise1D(seed + 0.4) < 0.2) continue;

            const worldX = i * span + this.noiseSigned(seed + 1.6) * 74;
            if (worldX > finalClearWorldX) continue;

            const x = worldX - scroll;
            const image = images[item.type];
            if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) continue;

            const height = item.h * (0.92 + this.noise1D(seed + 3.4) * 0.16);
            const width = height * (image.naturalWidth / image.naturalHeight);
            const drawX = x + item.xBias;
            if (drawX + width < -120 || drawX > CANVAS_WIDTH + 120) continue;
            const occupiedLeft = drawX - 46;
            const occupiedRight = drawX + width + 46;
            if (overlapsOccupied(occupiedLeft, occupiedRight)) continue;
            occupiedRanges.push({ left: occupiedLeft, right: occupiedRight });

            const footY = this.groundY + LANE_OFFSET + 4;
            ctx.save();
            ctx.globalAlpha *= item.alpha;
            this.drawStage3PropContactShadow(ctx, drawX + width * 0.5, footY - 2, width);
            ctx.filter = 'brightness(0.62) sepia(0.22) saturate(0.68) contrast(0.88) hue-rotate(-6deg)';
            ctx.drawImage(image, drawX, footY - height, width, height);
            ctx.filter = 'none';
            ctx.restore();
        }
    }

	renderStage4TownImageBlock(ctx, image, x, baseY, width, alpha = 1, filter = 'brightness(0.84) saturate(0.66) contrast(0.88)') {
	    if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

	    const height = width * (image.naturalHeight / image.naturalWidth);
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.filter = filter;
        ctx.drawImage(image, x, baseY - height + 3, width, height);
        ctx.filter = 'none';
	    ctx.restore();
	    return true;
	}

    getStage4CastleLowerMetrics(image, height) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;

        const sourceX = Math.round(image.naturalWidth * 0.25);
        const sourceY = Math.round(image.naturalHeight * 0.16);
        const sourceW = image.naturalWidth - sourceX;
        const sourceH = Math.round(image.naturalHeight * 0.71);
        const width = height * (sourceW / sourceH);
        return { sourceX, sourceY, sourceW, sourceH, width };
    }

    renderStage4CastleLower(ctx, image, x, baseY, height) {
        const metrics = this.getStage4CastleLowerMetrics(image, height);
        if (!metrics) return false;

        const y = baseY - height + 8;

	    ctx.save();
	    ctx.filter = 'brightness(0.82) saturate(0.68) contrast(0.94)';
	    ctx.drawImage(
	        image,
	        metrics.sourceX,
	        metrics.sourceY,
	        metrics.sourceW,
	        metrics.sourceH,
	        x,
	        y,
	        metrics.width,
	        height
	    );
	    ctx.filter = 'none';
	    ctx.restore();
	    return true;
	}

    getStage4CastleRampartDrawSpec(startWorldX, endWorldX, baseY) {
        const width = endWorldX - startWorldX;
        if (width <= 0) return null;

        const height = 328;
        const drawY = baseY - height + 5;
        return {
            worldX: startWorldX,
            width,
            height,
            drawY,
            roofY: drawY + 70,
            sourceXRatio: 0,
            sourceYRatio: 0.13,
            sourceWRatio: 1,
            sourceHRatio: 0.76
        };
    }

    renderStage4CastleRampart(ctx, image, startWorldX, endWorldX, p, baseY) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const spec = this.getStage4CastleRampartDrawSpec(startWorldX, endWorldX, baseY);
        if (!spec) return false;

        const x = spec.worldX - p;
        if (x + spec.width < -180 || x > CANVAS_WIDTH + 180) return false;

        const sourceX = Math.round(image.naturalWidth * spec.sourceXRatio);
        const sourceY = Math.round(image.naturalHeight * spec.sourceYRatio);
        const sourceW = Math.round(image.naturalWidth * spec.sourceWRatio);
        const sourceH = Math.round(image.naturalHeight * spec.sourceHRatio);

        ctx.save();
        ctx.filter = 'brightness(0.75) saturate(0.68) contrast(0.9)';
        ctx.drawImage(
            image,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            x,
            spec.drawY,
            spec.width,
            spec.height
        );
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage4ApproachFarStrip(ctx, image, startWorldX, endWorldX, p, baseY) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const span = Math.max(1, endWorldX - startWorldX);
        const width = Math.min(2180, span);
        const height = width * (image.naturalHeight / image.naturalWidth);
        const x = endWorldX - width - p;
        if (x + width < -180 || x > CANVAS_WIDTH + 180) return false;

        ctx.save();
        ctx.globalAlpha *= 0.64;
        ctx.filter = 'brightness(0.54) saturate(0.58) contrast(0.84)';
        ctx.drawImage(image, x, baseY - height + 8, width, height);
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage4ApproachTower(ctx, image, worldX, p, baseY, width, alpha = 1) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const height = width * (image.naturalHeight / image.naturalWidth);
        const x = worldX - p;
        if (x + width < -140 || x > CANVAS_WIDTH + 140) return false;

        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.filter = 'brightness(0.78) saturate(0.68) contrast(0.9)';
        ctx.drawImage(image, x, baseY - height + 4, width, height);
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage4CastleApproach(ctx, p, baseY) {
        const approachImage = this.stage4TownImages?.castleApproachDistrict;
        const layout = this.getStage4CastleApproachLayout();
        if (!layout) return false;

        const x = layout.approachWorldX - p;
        if (!approachImage || !approachImage.complete || approachImage.naturalWidth <= 0 || approachImage.naturalHeight <= 0) return false;
        const width = layout.approachWidth || layout.approachHeight * (approachImage.naturalWidth / approachImage.naturalHeight);
        if (x + width < -180 || x > CANVAS_WIDTH + 180) return false;

        ctx.save();
        ctx.globalAlpha *= 0.96;
        ctx.filter = 'brightness(0.82) saturate(0.72) contrast(0.92)';
        ctx.drawImage(approachImage, x, baseY - layout.approachHeight + 3, width, layout.approachHeight);
        ctx.filter = 'none';
        ctx.restore();

        return true;
    }

    renderStageBackdropTile(ctx, image, progress, {
        parallax = 0.35,
        drawHeight = CANVAS_HEIGHT,
        bottomY = CANVAS_HEIGHT,
        alpha = 1,
        filter = 'none',
        widthScale = 1,
        mirrorRepeat = false,
        // srcTopFrac: 画像の上からこの比率を捨てて残りだけを描く。
        // パノラマ類は上部が透過フェードで絵の実体が下端しかないため、
        // そのまま描くと柵の隙間には透過部しか来ず「遠景が見えない」になる。
        // 可視部分だけを切り出せば、指定した帯にちゃんと絵が入る。
        srcTopFrac = 0
    } = {}) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const srcY = Math.max(0, Math.min(image.naturalHeight - 1, Math.round(image.naturalHeight * srcTopFrac)));
        const srcH = image.naturalHeight - srcY;
        const drawH = Math.max(1, Math.ceil(drawHeight));
        const drawW = Math.ceil(drawH * (image.naturalWidth / srcH) * widthScale);
        const scroll = progress * parallax;
        const offset = ((scroll % drawW) + drawW) % drawW;
        const startX = -offset - drawW;
        const y = Math.round(bottomY - drawH);

        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.filter = filter;
        for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW) {
            // 反転の偶奇は「世界側のタイル番号」で決める。画面側の番号(x+offset)で決めると
            // スクロールがタイル幅を跨いだ瞬間に全タイルの反転が入れ替わり、画面全体がガクッと切り替わる。
            if (mirrorRepeat && Math.abs(Math.round((x + scroll) / drawW)) % 2 === 1) {
                ctx.save();
                ctx.translate(Math.round(x + drawW + 2), y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, srcY, image.naturalWidth, srcH, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, 0, srcY, image.naturalWidth, srcH, Math.round(x), y, drawW + 2, drawH);
            }
        }
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6BackdropRegion(ctx, image, progress, {
        worldStart,
        worldEnd,
        drawHeight,
        bottomY,
        filter = 'none',
        widthScale = 1,
        mirrorRepeat = false
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const screenStart = worldStart - progress;
        const screenEnd = worldEnd - progress;
        if (screenEnd <= 0 || screenStart >= CANVAS_WIDTH) return false;

        const drawH = Math.max(1, Math.ceil(drawHeight));
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight) * widthScale);
        const firstTile = Math.floor((progress - worldStart) / drawW) - 1;
        const lastTile = Math.ceil((progress + CANVAS_WIDTH - worldStart) / drawW) + 1;
        const y = Math.round(bottomY - drawH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(
            Math.max(0, screenStart),
            -400,
            Math.max(0, Math.min(CANVAS_WIDTH, screenEnd) - Math.max(0, screenStart)),
            CANVAS_HEIGHT + 800
        );
        ctx.clip();
        ctx.filter = filter;

        for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex++) {
            const x = Math.round(worldStart + tileIndex * drawW - progress);
            if (mirrorRepeat && Math.abs(tileIndex) % 2 === 1) {
                ctx.save();
                ctx.translate(x + drawW + 2, y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
        }

        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6FixedBackdrop(ctx, image, worldCenterX, progress, {
        drawHeight,
        bottomY,
        filter = 'none',
        bottomOffset = 0,
        flipX = false
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const drawH = Math.max(1, Math.ceil(drawHeight));
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const x = Math.round(worldCenterX - progress - drawW * 0.5);
        if (x + drawW <= 0 || x >= CANVAS_WIDTH) return false;
        const y = Math.round(bottomY - drawH + bottomOffset);

        ctx.save();
        ctx.filter = filter;
        if (flipX) {
            // 左右端で同じアセットを使う場合の反転
            ctx.translate(x + drawW, y);
            ctx.scale(-1, 1);
            ctx.drawImage(image, 0, 0, drawW, drawH);
        } else {
            ctx.drawImage(image, x, y, drawW, drawH);
        }
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    /**
     * Stage6 螺旋回廊: 柵越しに見える眼下のパノラマ。
     * 高度の証拠として、ゾーン(=cornersClimbed)ごとに層セットを丸ごと切り替える。
     * 低パララックス層をワールドXで区切るとシームが画面上を漂うため、
     * 切替はゾーンindexで行い、実際の切替は角遷移の完全暗転中に起こる。
     * 距離の層: 遠景=その方角の土地(地平線際)、近景=下層屋根と城下(共通)、上層ゾーンは雲。
     */
    /**
     * Stage6 螺旋回廊: 柵越しに見える眼下のパノラマ。
     *
     * 【階層構造と一致させる単一ルール】
     * 遠い連山は全階層で同じ視角・同じ濃さ。高度は、手前の城下が沈んで消えることと
     * 空の占有率が増すことで表す。手前が消えた際に山の裾まで露出すると拡大に見えるため、
     * 山の下部は階層に関係なく同じ大気遠近マスクへ溶かす。
     *
     * 【共通の約束】
     * - 下端は全レイヤー床側(groundY+24)に統一。中途半端な高さで切ると帯が後ろの帯の
     *   中腹に浮き「山の上に街がある」破綻になる。手前/奥の差は高さ(=薄さ)だけで作る。
     * - 描画順は必ず 奥(山) → 中間 → 手前(街)。
     * - srcTopFrac: パノラマ画像は上部が透過フェードで絵の実体が下端しかないため、
     *   可視部分だけを切り出す。これが無いと柵の隙間に透過部しか来ず遠景が見えない。
     */
    renderStage6Panorama(ctx, progress) {
        const zone = Math.max(0, Math.min(3, this.cornersClimbed || 0));
        const bottom = this.groundY + 24;
        const farFilter = 'brightness(0.82) saturate(0.7)';
        const nearFilter = 'brightness(0.85) saturate(0.72)';

        // 山の寸法・濃さ・下端は全階層で共通。高度で遠景を拡大しない。
        // 天体クリップ(getStage6MountainOcclusionY)が同じ数列を読むので二重管理を作らない。
        const MID_H = STAGE6_MID_H;
        const TOWN_H = STAGE6_TOWN_H;

        // 最上階は屋根の左右端より外側で、山帯の下まで画面に露出する。
        // 山画像の下端より下を朝焼け空のままにすると「山の下に空がある」帯になり、
        // 連山全体が宙に浮いて見える。山の背後に不透明な谷底の深度色を先に敷き、
        // 山麓から遥か下の地表へ続く一枚の遠景として閉じる。
        // 白い靄や半透明バンドではなく暗い低彩度色なので、屋根が透けた印象も作らない。
        if (zone === 3) {
            const valleyTop = bottom - 18;
            const valleyDepth = ctx.createLinearGradient(0, valleyTop, 0, CANVAS_HEIGHT);
            valleyDepth.addColorStop(0, 'rgba(22, 26, 48, 1)');
            valleyDepth.addColorStop(0.34, 'rgba(27, 27, 43, 1)');
            valleyDepth.addColorStop(0.72, 'rgba(24, 20, 32, 1)');
            valleyDepth.addColorStop(1, 'rgba(10, 11, 18, 1)');
            ctx.fillStyle = valleyDepth;
            ctx.fillRect(0, valleyTop, CANVAS_WIDTH, CANVAS_HEIGHT - valleyTop);
        }

        // 1) 最奥: 連山
        // 山体は不透明のまま描く。旧処理は下部をdestination-outで透明化していたため、
        // 背後の太陽の円周が山中に縦線として透け、稜線の矩形欠けに見えていた。
        // 大気遠近は透明化ではなくfilterの低コントラスト・低彩度だけで表現する。
        this.renderStageBackdropTile(ctx, this.stage6PanoramaMountainsFarImage, progress, {
            parallax: 0.038, drawHeight: STAGE6_MTN_H, bottomY: bottom,
            filter: 'brightness(0.70) saturate(0.50) contrast(0.91)',
            srcTopFrac: STAGE6_MTN_SRC_TOP, widthScale: 2.8,
            // 左右端の異なる山画像を正順で突き合わせると縦継ぎになる。
            // 交互反転なら同じ端同士が接続するため、稜線も色も連続する。
            mirrorRepeat: true
        });

        // 2) 中間距離: 方角によって題材が変わる(一巡目=竹林 / 二巡目=街道)
        if (MID_H[zone] > 0) {
            const midImage = zone === 0
                ? this.stage6PanoramaBambooFarImage
                : this.stage6PanoramaKaidoFarImage;
            this.renderStageBackdropTile(ctx, midImage, progress, {
                parallax: 0.08, drawHeight: MID_H[zone], bottomY: bottom,
                filter: farFilter, srcTopFrac: 0.62, mirrorRepeat: false
            });
        }

        // 3) 手前: 城下の甍。回廊三面では同じ低い帯に固定し、山を隠さない。
        if (TOWN_H[zone] > 0) {
            const townAlpha = [0.82, 0.82, 0.82, 0][zone];
            const townPara = [0.2, 0.16, 0.14, 0.14][zone];
            this.renderStageBackdropTile(ctx, this.stage6PanoramaTownNearImage, progress, {
                parallax: townPara, drawHeight: TOWN_H[zone], bottomY: bottom, alpha: townAlpha,
                filter: nearFilter, srcTopFrac: 0.50, mirrorRepeat: false
            });
        }
    }

    /** Stage6: 指定した角の全高壁画像が使えるか */
    getStage6CornerWallImage(cornerIndex) {
        const img = this.stage6CornerWallImages?.[cornerIndex];
        return (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) ? img : null;
    }

    /**
     * Stage6 螺旋回廊: 角の全高壁の描画。
     * ゾーン境界の先(次の面)を視界から隠す「関所」。地上の通用門をくぐると暗転遷移する。
     * 通過済みの角にも描き続ける(暗転明けに壁が背後へ残り、通ってきた構造として矛盾しない)。
     *
     * 投影文法: このゲームの地面帯(y=groundY..720)は「俯瞰で手前へ後退する床面」で、
     * 立面を差し込んでよいのは y<足元ライン(groundY+LANE_OFFSET=512) だけ(stage1〜5の全構造物と同じ)。
     * そこで壁画像は「開口下端=画像y比0.711」より上だけを切り出して y=0..512 に描く。
     * 0.711×720=512 なのでアスペクトは完全維持され、石垣部(0.711以深)は使わない。
     * 床帯には床テクスチャと敷居ストリップ(renderStage6GroundThresholds)がそのまま残り、
     * 「門の下を床が通り抜ける」という他ステージの門・出入口と同じ語彙になる。
     * 画像未読込時は描かない(従来の透かし櫓背景がフォールバックとして残る)。
     */
    /**
     * 角の枠(境界からの左右幅)。角1・2の全高壁だけが使う。
     * 角3は屋根だけを描くので枠を持たない(妻端の位置から直接導出する)。
     */
    getStage6CornerFrame(cornerIndex) {
        return { left: STAGE6_CORNER.WALL_LEFT_PX, right: STAGE6_CORNER.WALL_RIGHT_PX };
    }

    /**
     * 角3で見上げる大屋根の幾何。屋根は最上層の妻端(stage6_ridge_end_cap)を
     * ミラーで、アリーナと同倍率で描く。壁や基部は描かない(見えるのは屋根だけ)。
     * constants.js ではなくここで導出するのは、無バージョンimportで古い
     * constants.js が混ざったときに「描画と鉤の噛み位置が食い違う」のを避けるため。
     */
    getStage6FinalRoofGeometry() {
        const cap = this.stage6RidgeEndCapImage;
        const capW = (cap && cap.naturalWidth > 0) ? cap.naturalWidth : 1024;
        const capH = (cap && cap.naturalHeight > 0) ? cap.naturalHeight : 1024;
        const S = STAGE6_FINAL_CAP_SCALE;
        // 軒ラインを盲壁の天端に合わせると、妻端画像の原点(左上)の画面yが決まる
        const originY = STAGE6_FINAL_ROOF_EAVE_SCREEN_Y - STAGE6_FINAL_CAP_EAVE_SRC_Y * S;
        // ミラーして描くので、srcのxは「描画左端からの距離」に読み替える
        const tipDx = (capW - STAGE6_FINAL_CAP_TIP_SRC.x) * S;
        const hookDx = (capW - STAGE6_FINAL_CAP_HOOK_SRC.x) * S;
        return {
            eaveY: STAGE6_FINAL_ROOF_EAVE_SCREEN_Y,
            cap: {
                scale: S, w: capW * S, h: capH * S, srcW: capW, srcH: capH, originY,
                tipDx, hookDx,
                tipY: originY + STAGE6_FINAL_CAP_TIP_SRC.y * S,
                hookY: originY + STAGE6_FINAL_CAP_HOOK_SRC.y * S
            }
        };
    }

    /** 角3で鎖鎌の演出を始める発火x(プレイヤーの右足先の閾値)。軒先を見上げる位置。 */
    getStage6GrappleTriggerProbeX() {
        const tip = this.getStage6EaveTip();
        if (!tip) return null;
        // 軒先の【手前】で足を止める。+にすると軒先を通り過ぎてから後ろへ投げる。
        return tip.x - STAGE6_FINAL_GRAPPLE_LEAD_PX;
    }

    /**
     * 角3の軒先の先端(鎖鎌が掛かる軒)のワールド座標。
     * アセット未読込時も同じ座標に簡易軒を描くため、縄のアンカーは空中に浮かない。
     */
    getStage6EaveTip() {
        const cornerX = this.stage6CornerXs?.[2];
        if (!Number.isFinite(cornerX)) return null;
        const geo = this.getStage6FinalRoofGeometry();
        // 鉤は【軒先の先端より少し上の隅棟】に掛ける。先端ちょうどだと
        // 「軒の下端に引っかけている」中途半端な絵になる(ユーザー指摘)。
        // 先端の世界x(STAGE6_FINAL_CAP_TIP_DX)を基準に、噛み位置までの差分を足す。
        return {
            x: cornerX + STAGE6_FINAL_CAP_TIP_DX + (geo.cap.hookDx - geo.cap.tipDx),
            y: geo.cap.hookY
        };
    }

    renderStage6CornerWalls(ctx, scrollX) {
        if (this.stageNumber !== 6) return;
        const laneY = this.groundY + LANE_OFFSET; // 512 = 立面を描いてよい下限(足元ライン)
        for (let i = 0; i < this.stage6CornerXs.length; i++) {
            const cornerX = this.stage6CornerXs[i];

            // 角3は【見上げる屋根だけ】。屋根を支える壁や基部は描かない。
            // 越えた後(=大屋根アリーナ)は何も描かない(飛び乗った設定なので入口は無い)。
            if (i === 2) {
                if (this.cornersClimbed < 3) this.renderStage6FinalRoof(ctx, cornerX, scrollX);
                continue;
            }

            const img = this.getStage6CornerWallImage(i);
            if (!img) continue;
            const frame = this.getStage6CornerFrame(i);
            const frameW = frame.left + frame.right;
            const x = Math.round(cornerX - frame.left - scrollX);
            if (x + frameW <= 0 || x >= CANVAS_WIDTH) continue;
            ctx.save();
            ctx.filter = 'brightness(0.86) saturate(0.76)';
            // 画像全面を枠×512に描く(角1・2の全高壁は2304×1456=枠810×512と同比率)。
            ctx.drawImage(img, x, 0, frameW, laneY);
            ctx.filter = 'none';

            // 接地影: 基部と俯瞰床の継ぎ目を沈める(エンティティの落ち影と同じ考え方)。
            const shadowH = 26;
            const grad = ctx.createLinearGradient(0, laneY, 0, laneY + shadowH);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x, laneY, frameW, shadowH);
            ctx.restore();

        }
    }

    /**
     * 角3で見上げる【最上層の大屋根だけ】を描く。
     * 屋根は最上層の妻端(stage6_ridge_end_cap)をミラーで、アリーナと同倍率で描くので
     * 瓦の目まで一致する。棟側(右)は平坦部を反復して画面の右端まで伸ばす。
     * 屋根を支える壁・基部・接地影は描かない(見えるのは屋根だけにする)。
     */
    renderStage6FinalRoof(ctx, cornerX, scrollX) {
        const cap = this.stage6RidgeEndCapImage;
        if (!this.isStage6ImageReady(cap)) {
            this.renderStage6FinalEaveFallback(ctx, cornerX, scrollX);
            return;
        }
        const geo = this.getStage6FinalRoofGeometry();
        const capLeft = cornerX + STAGE6_FINAL_CAP_TIP_DX - geo.cap.tipDx - scrollX;
        if (capLeft >= CANVAS_WIDTH) return;
        ctx.save();
        ctx.filter = 'brightness(0.86) saturate(0.76)';
        // 妻端本体(ミラー)。左端が軒先、右へ上がって棟。
        ctx.save();
        ctx.translate(capLeft + geo.cap.w, geo.cap.originY);
        ctx.scale(-1, 1);
        ctx.drawImage(cap, 0, 0, geo.cap.w, geo.cap.h);
        ctx.restore();
        // 棟側は平坦部(棟〜軒)を反復して画面右端まで覆う。妻端は640px幅しかないため。
        const flatSrcW = STAGE6_FINAL_CAP_FLAT_SRC_W;
        const flatW = flatSrcW * geo.cap.scale;
        for (let fx = capLeft + geo.cap.w; fx < CANVAS_WIDTH; fx += flatW) {
            const drawW = Math.min(flatW, CANVAS_WIDTH - fx);
            ctx.drawImage(
                cap,
                0, 0, flatSrcW * (drawW / flatW), geo.cap.srcH,
                fx, geo.cap.originY, drawW, geo.cap.h
            );
        }
        ctx.filter = 'none';
        ctx.restore();
    }

    /**
     * 角3統合アセットが未読込の数フレームだけ使う簡易軒。
     * 旧門アセットへ戻さず、鉤の噛み位置に必ず建築物の実体を置く。
     */
    renderStage6FinalEaveFallback(ctx, cornerX, scrollX) {
        const tip = this.getStage6EaveTip();
        const tipWorldX = tip ? tip.x : cornerX + STAGE6_CORNER.EAVE_TIP_DX;
        const tipX = Math.round(tipWorldX - scrollX);
        if (tipX > CANVAS_WIDTH || tipX + 520 < 0) return;
        ctx.save();
        const beam = ctx.createLinearGradient(0, 128, 0, 214);
        beam.addColorStop(0, '#263041');
        beam.addColorStop(0.55, '#111824');
        beam.addColorStop(1, '#070b12');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(tipX, STAGE6_CORNER.EAVE_WORLD_Y - 12);
        ctx.lineTo(tipX + 520, 40);
        ctx.lineTo(tipX + 520, 214);
        ctx.lineTo(tipX + 22, STAGE6_CORNER.EAVE_WORLD_Y + 34);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(182, 142, 82, 0.52)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tipX, STAGE6_CORNER.EAVE_WORLD_Y);
        ctx.lineTo(tipX + 520, 58);
        ctx.stroke();
        ctx.restore();
    }

    renderStage6BackdropZones(ctx, progress) {
        const drawHeight = Math.max(420, this.groundY * 0.8);
        const bottomY = this.groundY + 30;
        const filter = 'brightness(0.84) saturate(0.8) contrast(0.98)';

        const [cornerX, roofGateX, finalThresholdX] = this.stage6CornerXs;

        // ゾーン背景は境界で正確に突き合わせ、その上に関所(全高壁/透かし櫓)を重ねる。
        // 四巡目(finalThresholdX以降=大屋根アリーナ)は背景の建物を描かない。
        // 大屋根の上に飛び乗った設定で、奥は山並み・空・朝焼けだけ(renderStage6Panoramaが担当)。
        const zones = [
            {
                image: this.stage6TenshuBackdropImage,
                start: 0,
                end: cornerX,
                mirrorRepeat: false
            },
            {
                image: this.stage6UpperGalleryImage,
                start: cornerX,
                end: roofGateX,
                mirrorRepeat: true
            },
            {
                image: this.stage6RoofRidgeImage,
                start: roofGateX,
                end: finalThresholdX,
                mirrorRepeat: true
            }
        ];

        for (const zone of zones) {
            this.renderStage6BackdropRegion(ctx, zone.image, progress, {
                worldStart: zone.start,
                worldEnd: zone.end,
                drawHeight: zone.drawHeight || drawHeight,
                bottomY,
                filter,
                mirrorRepeat: zone.mirrorRepeat
            });
        }

    }

    /**
     * Stage6: 山の帯が「全列とも完全不透明」になる画面y。
     * 月・太陽をこのyで切ると、切り口が山の不透明部と重なるので切断線は見えない。
     * (稜線そのもので切ると稜線より上の空も切れてしまい、逆に帯の下端で切ると
     *  αランプの半透明部を天体が透けて見えてしまう。その中間がこの線)
     */
    getStage6MountainOcclusionY() {
        const bottom = this.groundY + 24;
        const drawH = STAGE6_MTN_H;
        const top = bottom - drawH;
        // srcTopFrac で上端を捨てているので、不透明開始位置を「残った範囲での比率」に直す
        const visible = Math.max(0.0001, 1 - STAGE6_MTN_SRC_TOP);
        const solidFrac = Math.max(0, Math.min(1, (STAGE6_MTN_SRC_SOLID - STAGE6_MTN_SRC_TOP) / visible));
        // +2px は丸め誤差に対する安全側の寄せ。深い(=大きいy)方へずれる分は不透明部に埋まるが、
        // 浅い方へずれるとαランプの半透明部で切断線が露出するため、必ず下へ寄せる。
        return Math.round(top + drawH * solidFrac) + 2;
    }

    /** stage6アセットが読込済みで使えるか(404はcomplete=trueでもnaturalWidth=0) */
    isStage6ImageReady(img) {
        return !!(img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
    }

    renderStage1BambooImageBackdrop(ctx, progress) {
        let rendered = false;

        rendered = this.renderStage1BambooLayer(ctx, this.stage1BambooBackLayerImage, progress, {
            parallax: 0.96,
            drawHeight: 742,
            widthScale: 1,
            bottomOffset: 112,
            endInset: 72,
            phase: 390,
            alpha: 1,
            filter: 'brightness(0.5) saturate(0.7) contrast(0.76) hue-rotate(8deg)',
            mirrorRepeat: true
        }) || rendered;
        rendered = this.renderStage1BambooLayer(ctx, this.stage1BambooMidLayerImage, progress, {
            parallax: 0.985,
            drawHeight: 792,
            widthScale: 1.15,
            bottomOffset: 126,
            endInset: 46,
            phase: 130,
            alpha: 1,
            filter: 'brightness(0.64) saturate(0.76) contrast(0.88) hue-rotate(4deg)',
            mirrorRepeat: true
        }) || rendered;
        rendered = this.renderStage1BambooLayer(ctx, this.stage1BambooFrontLayerImage, progress, {
            parallax: 1,
            drawHeight: 836,
            widthScale: 0.92,
            bottomOffset: 140,
            endInset: 24,
            alpha: 1,
            filter: 'brightness(0.78) saturate(0.94) contrast(1.02)',
            mirrorRepeat: true
        }) || rendered;

        return rendered;
    }

    renderStage1BambooLayer(ctx, image, progress, {
        parallax,
        drawHeight,
        widthScale,
        bottomOffset,
        endInset,
        phase = 0,
        alpha = 1,
        filter,
        mirrorRepeat
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const fixedCameraX = Math.floor(progress);
        const treeLineX = this.getStage1BambooTreeLineX() - fixedCameraX;
        const clipRight = Math.max(0, Math.min(CANVAS_WIDTH, treeLineX - endInset));
        if (clipRight <= 0) return false;

        const drawH = Math.min(CANVAS_HEIGHT + 160, drawHeight);
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight) * widthScale);
        const y = Math.round(this.groundY + bottomOffset - drawH);
        const layerScroll = progress * parallax + phase;
        const firstTile = Math.floor(layerScroll / drawW) - 1;
        const lastTile = Math.ceil((layerScroll + CANVAS_WIDTH) / drawW) + 1;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, -400, clipRight, CANVAS_HEIGHT + 800);
        ctx.clip();
        ctx.globalAlpha *= alpha;
        ctx.filter = filter;
        for (let tile = firstTile; tile <= lastTile; tile++) {
            const x = Math.round(tile * drawW - layerScroll);
            if (x + drawW < -2 || x > CANVAS_WIDTH + 2) continue;
            if (mirrorRepeat && Math.abs(tile) % 2 === 1) {
                ctx.save();
                ctx.translate(x + drawW + 2, y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
        }
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

	renderStageElements(ctx, currentPalette) {
        const p = this.progress;
        
        // currentPaletteから時間帯的なニュアンスを得るため、
        // 遠景(far)の色から暗さを推測して少し補正に使うことも可能
        
        switch (currentPalette.elements) {
            case 'bamboo': {
                this.renderStage1BambooImageBackdrop(ctx, p);
                break;
            }
                
            case 'kaido': {
                // Stage2の建物・添景は生成画像アセットだけで描く。旧Canvas建物フォールバックは使わない。
                const kPara = 1.0;
                const houseLimit = (this.maxProgress - CANVAS_WIDTH) * kPara - 200;
                const sceneLimit = houseLimit + 420;
                const isImageReady = (image) => image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
                const stage2RuralPropPlan = [
                    { key: 'ruralFarmhouse', h: 244, xBias: -10, filter: 'brightness(0.76) saturate(0.72) contrast(0.9)' },
                    { key: 'ruralTeahouse', h: 232, xBias: 12, filter: 'brightness(0.75) saturate(0.7) contrast(0.9)' },
                    { key: 'ruralShed', h: 202, xBias: -18, filter: 'brightness(0.7) saturate(0.64) contrast(0.88)' },
                    null,
                    { key: 'ruralFarmhouse', h: 236, xBias: 22, filter: 'brightness(0.74) saturate(0.68) contrast(0.88)' },
                    { key: 'ruralTeahouse', h: 220, xBias: -14, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    { key: 'ruralShrine', h: 176, xBias: 18, filter: 'brightness(0.7) saturate(0.64) contrast(0.86)' },
                    null,
                    { key: 'ruralShed', h: 196, xBias: 18, filter: 'brightness(0.69) saturate(0.63) contrast(0.86)' },
                    { key: 'ruralFarmhouse', h: 252, xBias: -16, filter: 'brightness(0.76) saturate(0.7) contrast(0.88)' },
                    { key: 'ruralTeahouse', h: 214, xBias: 20, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    null,
                    { key: 'ruralShed', h: 188, xBias: -4, filter: 'brightness(0.68) saturate(0.6) contrast(0.86)' }
                ];
                const stage2RoadsideDetailPlan = [
                    { key: 'cleanLowFence', h: 82, xBias: -18, filter: 'brightness(0.76) saturate(0.7) contrast(0.92)' },
                    { key: 'cleanStrawBundles', h: 88, xBias: 18, filter: 'brightness(0.78) saturate(0.74) contrast(0.92)' },
                    { key: 'cleanJars', h: 68, xBias: -10, filter: 'brightness(0.76) saturate(0.7) contrast(0.92)' },
                    null,
                    { key: 'cleanGrassClump', h: 58, xBias: 18, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    { key: 'cleanWoodSignpost', h: 122, xBias: -18, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    { key: 'cleanLowFence', h: 72, xBias: 24, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    { key: 'cleanStoneWell', h: 132, xBias: -8, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    null,
                    { key: 'cleanJars', h: 62, xBias: 22, filter: 'brightness(0.74) saturate(0.68) contrast(0.88)' },
                    { key: 'cleanStrawBundles', h: 78, xBias: -20, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    { key: 'cleanGrassClump', h: 52, xBias: 10, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    { key: 'cleanJizo', h: 96, xBias: -14, filter: 'brightness(0.7) saturate(0.62) contrast(0.86)' }
                ];
                const ruralImagesReady = stage2RuralPropPlan.some((item) => item && isImageReady(this.stage2PropImages?.[item.key]));
                const roadDetailsReady = stage2RoadsideDetailPlan.some((item) => item && isImageReady(this.stage2PropImages?.[item.key]));

                if (ruralImagesReady) {
                    const slotSpan = 470;
                    const propStart = Math.floor((p * kPara - 640) / slotSpan);
                    const propEnd = Math.ceil((CANVAS_WIDTH + p * kPara + 640) / slotSpan);
                    const propBaseY = this.groundY + 2;
                    const stage2HouseWorldBounds = [];

                    for (let i = propStart; i <= propEnd; i++) {
                        const seed = i * 8.37;
                        const planIndex = (((i % stage2RuralPropPlan.length) + stage2RuralPropPlan.length) % stage2RuralPropPlan.length);
                        const item = stage2RuralPropPlan[planIndex];
                        const worldX = i * slotSpan + this.noiseSigned(seed + 0.4) * 42;
                        if (worldX > sceneLimit || worldX > houseLimit || !item) continue;

                        const image = this.stage2PropImages?.[item.key];
                        if (!isImageReady(image)) continue;

                        const scaleJitter = 0.94 + this.noise1D(seed + 2.7) * 0.12;
                        const height = item.h * scaleJitter;
                        const width = height * (image.naturalWidth / image.naturalHeight);
                        const worldDrawX = worldX + item.xBias + this.noiseSigned(seed + 3.1) * 18;
                        const drawX = worldDrawX - p * kPara;
                        if (drawX + width < -180 || drawX > CANVAS_WIDTH + 180) continue;
                        stage2HouseWorldBounds.push({
                            left: worldDrawX,
                            right: worldDrawX + width
                        });

                        ctx.save();
                        ctx.filter = item.filter;
                        ctx.drawImage(image, drawX, propBaseY - height + 3, width, height);
                        ctx.filter = 'none';
                        ctx.restore();
                    }

                    if (roadDetailsReady) {
                        const detailSpan = 250;
                        const detailStart = Math.floor((p * kPara - 520) / detailSpan);
                        const detailEnd = Math.ceil((CANVAS_WIDTH + p * kPara + 520) / detailSpan);
                        const detailBaseY = this.groundY + 3;
                        const detailLimit = houseLimit + 80;

                        for (let i = detailStart; i <= detailEnd; i++) {
                            const seed = i * 9.71;
                            const item = stage2RoadsideDetailPlan[((i % stage2RoadsideDetailPlan.length) + stage2RoadsideDetailPlan.length) % stage2RoadsideDetailPlan.length];
                            if (!item || this.noise1D(seed + 0.9) < 0.08) continue;

                            const worldX = 260 + i * detailSpan + this.noiseSigned(seed + 1.4) * 52;
                            if (worldX > detailLimit) continue;

                            const image = this.stage2PropImages?.[item.key];
                            if (!isImageReady(image)) continue;

                            const scaleJitter = 0.92 + this.noise1D(seed + 2.6) * 0.16;
                            const height = item.h * scaleJitter;
                            const width = height * (image.naturalWidth / image.naturalHeight);
                            const worldDrawX = worldX + item.xBias + this.noiseSigned(seed + 3.2) * 14;
                            const blocksHouse = stage2HouseWorldBounds.some((bounds) => (
                                worldDrawX + width > bounds.left - 44 && worldDrawX < bounds.right + 44
                            ));
                            if (blocksHouse) continue;

                            const drawX = worldDrawX - p * kPara;
                            if (drawX + width < -140 || drawX > CANVAS_WIDTH + 140) continue;

                            ctx.save();
                            ctx.globalAlpha *= 0.94 + this.noise1D(seed + 4.6) * 0.06;
                            ctx.filter = item.filter;
                            ctx.drawImage(image, drawX, detailBaseY - height + 3, width, height);
                            ctx.filter = 'none';
                            ctx.restore();
                        }

                        const grassImage = this.stage2PropImages?.cleanGrassClump;
                        if (isImageReady(grassImage)) {
                            const grassSpan = 150;
                            const grassStart = Math.floor((p * kPara - 420) / grassSpan);
                            const grassEnd = Math.ceil((CANVAS_WIDTH + p * kPara + 420) / grassSpan);

                            for (let i = grassStart; i <= grassEnd; i++) {
                                const seed = i * 6.43;
                                const groupIndex = Math.floor(i / 3);
                                const slotInGroup = ((i % 3) + 3) % 3;
                                const selectedSlot = Math.floor(this.noise1D(groupIndex * 5.31 + 0.7) * 3);
                                if (slotInGroup !== selectedSlot || this.noise1D(seed + 0.2) < 0.18) continue;

                                const worldX = 150 + i * grassSpan + this.noiseSigned(seed + 1.1) * 36;
                                if (worldX > detailLimit) continue;

                                const scaleJitter = 0.86 + this.noise1D(seed + 2.3) * 0.34;
                                const height = 36 * scaleJitter;
                                const width = height * (grassImage.naturalWidth / grassImage.naturalHeight);
                                const worldDrawX = worldX + this.noiseSigned(seed + 3.4) * 16;
                                const blocksHouse = stage2HouseWorldBounds.some((bounds) => (
                                    worldDrawX + width > bounds.left - 18 && worldDrawX < bounds.right + 18
                                ));
                                if (blocksHouse) continue;

                                const drawX = worldDrawX - p * kPara;
                                if (drawX + width < -100 || drawX > CANVAS_WIDTH + 100) continue;

                                ctx.save();
                                ctx.globalAlpha *= 0.78 + this.noise1D(seed + 4.1) * 0.12;
                                ctx.filter = 'brightness(0.72) saturate(0.66) contrast(0.86)';
                                ctx.drawImage(grassImage, drawX, detailBaseY - height + 3, width, height);
                                ctx.filter = 'none';
                                ctx.restore();
                            }
                        }
                    }
                    break;
                }

                break;
            }

            case 'mountain': {
                // 遠方の山並みは背景として残し、道沿いの旧Canvas小物は生成画像へ寄せる。
                // 【添景はここでは描かない】。地面より前に描くと足元が地面に覆われるため、
                // renderStage3RoadsideOnGround として地面の後(game.js)へ移した。
                this.renderStage3DistantMountainBands(ctx, currentPalette, p);
                break;
            }
                
            case 'town': {
                const gY = this.groundY;
                // 月夜で一定の明るさ（stage4は深夜化しない／月は空に出ている）。灯りは常にしっかり灯す
                const lampLit = 0.92;

                // Stage4の町並みは画像アセットだけで構成し、Canvas製の建物フォールバックは使わない。

                // ───────── 中景：分割した町並み画像を密に並べる ─────────
                const castleImage = this.stage4TownImages?.castleEntrance;
                const castleH = 620;
                const castleWorldX = this.getStage4CastleWorldX();
                const castleX = castleWorldX - p;
                // 町並みは getStage4TownRowsInRange 側で接近路の手前までに打ち切られている
                // （行中心で判定＝建物を途中で切らない）。ここではクリップ矩形は使わない。
                const townRows = this.getStage4TownRowsInRange(p - 900, p + CANVAS_WIDTH + 900);
                for (const row of townRows) {
                    const x = row.worldX - p;
                    if (x + row.width < -900 || x > CANVAS_WIDTH + 900) continue;
                    this.renderStage4TownImageBlock(
                        ctx,
                        row.image,
                        x,
                        this.groundY - 2,
                        row.width,
                        0.96,
                        'brightness(0.82) saturate(0.72) contrast(0.92)'
                    );
                }

                this.renderStage4CastleApproach(ctx, p, this.groundY - 2);
                this.renderStage4CastleLower(ctx, castleImage, castleX, this.groundY - 2, castleH);

                // ───────── 手前：石畳の濡れた照り返し（near, 速いパララックス） ─────────
                const sheen = ctx.createLinearGradient(0, gY - 6, 0, gY + 12);
                sheen.addColorStop(0, 'rgba(150, 170, 210, 0)');
                sheen.addColorStop(0.5, 'rgba(150, 170, 210, 0.06)');
                sheen.addColorStop(1, 'rgba(150, 170, 210, 0)');
                ctx.fillStyle = sheen;
                ctx.fillRect(0, gY - 6, CANVAS_WIDTH, 18);
                const reflPara = 0.62;
                const reflScroll = p * reflPara;
                const reflSpan = 150;
                const reflStart = Math.floor((reflScroll - reflSpan) / reflSpan);
                const reflEnd = Math.ceil((reflScroll + CANVAS_WIDTH + reflSpan) / reflSpan);
                for (let i = reflStart; i <= reflEnd; i++) {
                    const seed = i * 4.7;
                    if (this.noise1D(seed + 0.5) < 0.5) continue;
                    const rx = i * reflSpan - reflScroll + this.noiseSigned(seed + 1.1) * 40;
                    if (rx < -40 || rx > CANVAS_WIDTH + 40) continue;
                    ctx.fillStyle = `rgba(255, 200, 130, ${((0.06 + this.noise1D(seed + 2.2) * 0.06) * lampLit).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.ellipse(rx, gY + 3, 16 + this.noise1D(seed + 3.1) * 14, 3, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                break;
            }

            case 'castle': {
                const crop = this.skyVisTop || 0;
                if (!this.renderStageBackdropTile(ctx, this.stage5InteriorWallImage, p, {
                    parallax: 1,
                    drawHeight: CANVAS_HEIGHT + crop,
                    bottomY: CANVAS_HEIGHT,
                    filter: 'brightness(0.76) saturate(0.78) contrast(0.96)'
                })) {
                    const wallGrad = ctx.createLinearGradient(0, 0, 0, this.groundY);
                    wallGrad.addColorStop(0, 'rgba(92, 30, 22, 0.92)');
                    wallGrad.addColorStop(1, 'rgba(42, 15, 12, 0.94)');
                    ctx.fillStyle = wallGrad;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
                }

                break;
            }

            case 'tenshu': {
                // 眼下パノラマ(高度の証拠)は欄干バンド(ゾーン背景の不透明下部)の奥に描く
                this.renderStage6Panorama(ctx, p);
                this.renderStage6BackdropZones(ctx, p);
                break;
            }
        }
    }
    
    renderGround(ctx) {
        const renderProgress = this.progress;
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        // グローバルな進行度に基づく環境光の強さ（暗さ）を計算し、地面の色に反映
        const globalProgress = (this.stageNumber - 1 + p) / STAGES.length;
        const darken = Math.pow(globalProgress, 1.5) * 0.75;

        // 竹垣は固定背景として先に描き、地面が根元を自然に覆う。
        if (this.stageNumber === 1) {
            this.renderStage1BambooGroundBlend(ctx, renderProgress, darken);
        }
        
        // 各ステージ独自の地面描画メソッドを呼び出し、路面・断面・パースを完結させる
        switch (this.stageNumber) {
            case 1:
                this.renderGroundBamboo(ctx, renderProgress, darken);
                break;
            case 2:
                this.renderGroundKaido(ctx, renderProgress, darken);
                break;
            case 3:
                this.renderGroundMountain(ctx, renderProgress, darken);
                break;
            case 4:
                this.renderGroundTown(ctx, renderProgress, darken);
                break;
            case 5:
                this.renderGroundCastle(ctx, renderProgress, darken);
                break;
            case 6:
                this.renderGroundTenshu(ctx, renderProgress, darken);
                break;
            default:
                this.renderGroundMountain(ctx, renderProgress, darken);
                break;
        }

        // 竹林の動的な葉の降下エフェクト
        if (this.stageNumber === 1) {
            this.renderBambooFallingLeaves(ctx);
        }
    }

    renderGroundManualSafeBand(ctx, topColor, bottomColor, darken) {
        const bandTop = CANVAS_HEIGHT - 46;
        const bandBottom = CANVAS_HEIGHT - 8;
        if (bandBottom <= bandTop) return;

        const toRgba = (rgb, alpha) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha.toFixed(3)})`);
        const bandTopColor = this.interpolateColor(topColor, bottomColor, 0.48);
        const bandMidColor = this.interpolateColor(topColor, bottomColor, 0.62);
        const bandBottomColor = this.interpolateColor(topColor, bottomColor, 0.78 + darken * 0.1);

        const settleGrad = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
        settleGrad.addColorStop(0, toRgba(bandTopColor, 0));
        settleGrad.addColorStop(0.35, toRgba(bandMidColor, 0.78));
        settleGrad.addColorStop(1, toRgba(bandBottomColor, 0.92));
        ctx.fillStyle = settleGrad;
        ctx.fillRect(0, bandTop, CANVAS_WIDTH, bandBottom - bandTop);

        ctx.strokeStyle = toRgba(this.interpolateColor(bandTopColor, '#f2eadf', 0.28), 0.14);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, bandTop + 0.5);
        ctx.lineTo(CANVAS_WIDTH, bandTop + 0.5);
        ctx.stroke();
    }

    renderGroundImageTile(ctx, image, horizonY, bottomY, renderProgress, options = {}) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const groundHeight = bottomY - horizonY;
        const drawH = Math.ceil(groundHeight + (options.extraHeight ?? 34));
        const baseDrawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const drawW = Math.ceil(baseDrawW * (options.widthScale ?? 1));
        const scrollScale = options.scrollScale ?? 1;
        const scrollWorld = renderProgress * scrollScale;
        const firstTileIndex = Math.floor(scrollWorld / drawW) - 1;
        const scroll = Math.floor(((scrollWorld % drawW) + drawW) % drawW);
        const y = Math.floor(horizonY + (options.yOffset ?? -18));
        const startX = -scroll - drawW;
        const clipTop = horizonY + (options.clipTopOffset ?? 0);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, clipTop, CANVAS_WIDTH, Math.max(0, bottomY - clipTop));
        ctx.clip();
        ctx.globalAlpha *= options.alpha ?? 1;
        if (options.filter) ctx.filter = options.filter;
        let tileIndex = firstTileIndex;
        for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW, tileIndex++) {
            if (options.mirrorRepeat && Math.abs(tileIndex) % 2 !== 0) {
                ctx.save();
                ctx.translate(x + drawW + 2, y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
        }
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6GroundRegion(ctx, image, renderProgress, {
        worldStart,
        worldEnd,
        horizonY,
        bottomY,
        filter,
        topAlign = false
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const screenStart = worldStart - renderProgress;
        const screenEnd = worldEnd - renderProgress;
        if (screenEnd <= 0 || screenStart >= CANVAS_WIDTH) return false;

        // topAlign(=最上階の大屋根): 画像上端(=棟冠の上端)を【足元ライン】に合わせる。
        // 屋根に立つ人の目線=地平線は足元より上なので、棟は地平線の下に来るのが正しい。
        // 高さは STAGE6_ROOF_DRAW_H で固定し、画面下端を越える分は捨てる
        // (bottomYに合わせて縮めると瓦寸法と棟の厚みが小さくなる)。
        const clipTop = topAlign ? this.getStage6RoofRidgeTopY() : horizonY;
        const drawH = topAlign
            ? STAGE6_ROOF_DRAW_H
            : Math.ceil(bottomY - horizonY + 40);
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const y = topAlign ? clipTop : Math.floor(horizonY - 20);
        const firstTile = Math.floor((renderProgress - worldStart) / drawW) - 1;
        const lastTile = Math.ceil((renderProgress + CANVAS_WIDTH - worldStart) / drawW) + 1;

        ctx.save();
        ctx.beginPath();
        ctx.rect(
            Math.max(0, screenStart),
            clipTop,
            Math.max(0, Math.min(CANVAS_WIDTH, screenEnd) - Math.max(0, screenStart)),
            Math.max(0, bottomY - clipTop)
        );
        ctx.clip();
        ctx.filter = filter;

        for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex++) {
            const x = Math.round(worldStart + tileIndex * drawW - renderProgress);
            ctx.drawImage(image, x, y, drawW + 2, drawH);
        }

        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6GroundZones(ctx, renderProgress, horizonY, bottomY) {
        const [cx1, cx2, cx3] = this.stage6CornerXs;
        const filter = 'brightness(0.88) saturate(0.72) contrast(0.98)';
        // 床テクスチャの切り替え位置は動的。壁は立面として y<512 しか覆えないため、
        // 境界ちょうどで切ると接近中に俯瞰床帯へ「次の面の床」が素通しで見えてしまう。
        // - 未通過の角: 壁右端(+520)。トリガー時の画面右端(≈+500)より先=接近中は不可視
        // - 通過済みの角: 暗転明けのカメラ左端(+380)。旧床を一切引きずらず、画面は最初から新しい床だけ
        // 切り替え自体は完全暗転中(advanceCornerのcornersClimbed++)に起き、後退クランプで再訪もできない。
        const seamFor = (cornerIndex) => (
            this.cornersClimbed > cornerIndex
                ? STAGE6_CORNER.POST_FADE_CAMERA_LAG
                : STAGE6_CORNER.WALL_RIGHT_PX
        );
        const b1 = cx1 + seamFor(0);
        const b2 = cx2 + seamFor(1);
        // 大屋根アリーナはカメラが左端(cx3)ちょうどまで来るので、屋根の床は境界から始める。
        // (他の角と違い「暗転明けのカメラ位置ぶん先」にすると旧ゾーンの床が左に露出する)
        const b3 = this.isStage6Arena() ? cx3 : cx3 + seamFor(2);
        const zones = [
            { image: this.stage6GroundImage, start: 0, end: b1 },
            { image: this.stage6UpperGalleryGroundImage, start: b1, end: b2 },
            {
                // 大棟化: 三巡目の床は黒漆の板張りへ置き換え(旧: 鉄板リベット床は壁面に見えるため廃止)
                image: this.stage6GalleryWoodGroundImage,
                start: b2,
                end: b3
            },
            {
                // 大棟化: 四巡目の床は大棟の棟瓦+手前側屋根斜面。
                // 【左右の反り屋根の面も同じタイルで埋める】。端材の面を重ねると
                // 横段ピッチが床の1.55倍細かく、左右と中央で質感が割れて見えるため、
                // 面は床が一貫して描き、端材は稜線と軒先だけを上に重ねる。
                // はみ出しは renderGroundTenshu の屋根シルエットクリップが切る。
                // 開始xは実体端から1タイル(608px)戻すだけにして、瓦の位相を動かさない。
                // 画像上端21%の棟冠を足元ライン(512)から描く=キャラは棟の上に立つ。
                image: this.stage6RidgeEavesGroundImage,
                // 【最上層へ上がるまでは描かない】。開始xが境界より128px手前(実体端-608)
                // なので、三層目を歩いている間に大屋根の瓦が床帯へ露出していた
                // (右下に謎の建造物が見える、の正体)。切り替えは暗転中に起きる。
                start: this.isStage6Arena()
                    ? this.getStage6ArenaPhysicalLeft() - 608
                    : Number.POSITIVE_INFINITY,
                end: this.maxProgress,
                topAlign: true,
            }
        ];

        let rendered = false;
        for (const zone of zones) {
            rendered = this.renderStage6GroundRegion(ctx, zone.image, renderProgress, {
                worldStart: zone.start,
                worldEnd: zone.end,
                horizonY,
                bottomY,
                filter,
                topAlign: !!zone.topAlign
            }) || rendered;
        }
        // 敷居ストリップは廃止: 床の切り替え位置が動的になった結果、
        // 未通過側(+520)は接近中の画面右端(+500)より先、通過側(+380)は暗転明けの画面左端ちょうどで、
        // どの局面でも継ぎ目が画面に映らなくなったため、受け手のマーキング自体が不要になった。
        return rendered;
    }

    /**
     * 端材(妻端)の上縁プロファイルを実測して返す(初回のみ)。
     * これが屋根の実体シルエット。床のクリップと、端材から「面」を削って
     * 稜線・軒先だけ残す加工の両方で使う。
     */
    getStage6EndCapProfile() {
        if (this._stage6CapProfile !== undefined) return this._stage6CapProfile;
        const cap = this.stage6RidgeEndCapImage;
        if (!this.isStage6ImageReady(cap)) return null; // 未読込。次フレーム以降に再挑戦
        const W = cap.naturalWidth, H = cap.naturalHeight;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(cap, 0, 0);
        const data = cx.getImageData(0, 0, W, H).data;
        const step = 8;
        const samples = [];
        for (let x = 0; x < W; x += step) {
            let top = null;
            for (let y = 0; y < H; y += 2) {
                if (data[(y * W + x) * 4 + 3] > 12) { top = y; break; }
            }
            samples.push({ x, top });
        }
        this._stage6CapProfile = { W, H, samples };
        return this._stage6CapProfile;
    }

    /**
     * 端材から屋根「面」を削り、稜線(隅棟)と軒先の巻きだけを残したキャンバス(初回のみ生成)。
     * 面は床(eaves)のタイルに任せる。端材アセットの横段ピッチが床の1.55倍細かく、
     * そのまま重ねると左右と中央で質感が割れて見えるため。
     * 重なり部(src x<256=大棟の実体端より内側)は床が同じ絵を描くので丸ごと削る。
     */
    getStage6EndCapBand() {
        if (this._stage6CapBand) return this._stage6CapBand;
        const p = this.getStage6EndCapProfile();
        const cap = this.stage6RidgeEndCapImage;
        if (!p || !this.isStage6ImageReady(cap)) return null;
        const c = document.createElement('canvas');
        c.width = p.W; c.height = p.H;
        const cx = c.getContext('2d');
        cx.drawImage(cap, 0, 0);
        cx.globalCompositeOperation = 'destination-out';
        cx.beginPath();
        let started = false;
        for (const s of p.samples) {
            if (s.top === null) continue;
            // 軒先の巻きは厚みがあるので、先端へ向かって残す帯を広げる
            const tipT = Math.max(0, Math.min(1, (s.x / p.W - 0.70) / 0.30));
            const band = 34 + 52 * tipT;
            const y = s.top + band;
            if (!started) { cx.moveTo(s.x, y); started = true; } else { cx.lineTo(s.x, y); }
        }
        if (started) {
            cx.lineTo(p.W, p.H);
            cx.lineTo(0, p.H);
            cx.closePath();
            cx.fill();
        }
        cx.fillRect(0, 0, Math.round(p.W * 0.25), p.H); // 重なり部は床に任せる
        cx.globalCompositeOperation = 'source-over';
        this._stage6CapBand = c;
        return c;
    }

    /**
     * 屋根の実体シルエット(大棟+左右の隅棟の内側)をクリップパスとして積む。
     * これで床のタイルが端材の面まで途切れず届き、左右と中央の質感が原理的に一致する。
     * 端材が未読込のときは false を返す(呼び出し側が矩形クリップへフォールバック)。
     */
    clipStage6RoofSilhouette(ctx, renderProgress) {
        const p = this.getStage6EndCapProfile();
        if (!p) return false;
        const capScale = 640 / p.W;
        const capTopY = this.getStage6RoofRidgeTopY();
        const physLeft = this.getStage6ArenaPhysicalLeft();
        const physRight = this.getStage6ArenaPhysicalRight();
        const leftOriginX = physLeft + 160 - renderProgress;   // 左端材(左右反転)のsrc x=0
        const rightOriginX = physRight - 160 - renderProgress; // 右端材のsrc x=0
        // 大棟の実体端より内側(src<256)は端材と中央材の重なり部で、アセットの上縁が
        // 6〜14px下がっている。そこまでポリゴンに含めると水平であるべき大棟の上端が
        // 斜めに削れ、左端だけ鯱の足元に隙間が出る(右端は削れ方が0に収束するので出ない)。
        // 実体端から外側だけをなぞり、実体端の間は必ず y=416 の水平線で繋ぐ。
        const outer = p.samples.filter(s => s.top !== null && s.x >= 256);
        if (outer.length < 3) return false;
        const leftTerminalX = leftOriginX - 256 * capScale;   // = 左の実体端
        const rightTerminalX = rightOriginX + 256 * capScale; // = 右の実体端
        const outerTipX = outer[outer.length - 1].x * capScale;

        ctx.beginPath();
        // 左端: 外側の軒先 → 実体端へ、上縁をなぞる
        ctx.moveTo(leftOriginX - outerTipX, CANVAS_HEIGHT);
        for (let i = outer.length - 1; i >= 0; i--) {
            const s = outer[i];
            ctx.lineTo(leftOriginX - s.x * capScale, capTopY + s.top * capScale);
        }
        // 大棟の上端(完全水平)
        ctx.lineTo(leftTerminalX, capTopY);
        ctx.lineTo(rightTerminalX, capTopY);
        // 右端: 実体端 → 外側の軒先へ
        for (const s of outer) {
            ctx.lineTo(rightOriginX + s.x * capScale, capTopY + s.top * capScale);
        }
        ctx.lineTo(rightOriginX + outerTipX, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.clip();
        return true;
    }

    /** 最上階アリーナの左右端。端部専用の妻面へ金鯱を載せる。 */
    renderStage6ArenaRidgeEnds(ctx, renderProgress) {
        if (!this.isStage6Arena()) return;
        const cap = this.stage6RidgeEndCapImage;
        const arenaLeft = this.getStage6ArenaLeft();
        const arenaRight = this.maxProgress;
        const edgeInset = STAGE6_CORNER.ARENA_EDGE_INSET_PX;
        const physicalLeft = arenaLeft + edgeInset;
        const physicalRight = arenaRight - edgeInset;
        const capW = 640;
        const capH = 640;
        // v7 source: x=0..256が中央材との160px重なり、x=256が水平大棟の実体端。
        // 原点yは大棟の上端(=足元ライン512)。端材を全幅描画して中央材から反り軒まで繋ぐ。
        // 反り軒の先端は画面下端より下へ出るが、隅棟の斜面は208px分見えるので端は読める。
        const capOverlapW = capW * (256 / 1024);
        const capY = this.getStage6RoofRidgeTopY();
        const filter = 'brightness(0.88) saturate(0.72) contrast(0.98)';

        // 端材は「稜線(隅棟)と軒先の巻き」だけを重ねる。屋根の面は床のタイルが
        // シルエットの内側まで届いているので、ここで面を描くと質感が二重になり、
        // 左右と中央で瓦の段が食い違って見える(端材の横段は床の1.55倍細かい)。
        const capBand = this.getStage6EndCapBand();
        const capSource = capBand || (this.isStage6ImageReady(cap) ? cap : null);
        if (capSource) {
            const drawCap = (terminalWorldX, flipX) => {
                const terminalX = Math.round(terminalWorldX - renderProgress);
                const x = Math.round(flipX
                    ? terminalX - (capW - capOverlapW)
                    : terminalX - capOverlapW);
                if (x + capW <= 0 || x >= CANVAS_WIDTH) return;
                ctx.save();
                ctx.filter = filter;
                if (flipX) {
                    ctx.translate(x + capW, capY);
                    ctx.scale(-1, 1);
                    ctx.drawImage(capSource, 0, 0, capW, capH);
                } else {
                    ctx.drawImage(capSource, x, capY, capW, capH);
                }
                ctx.restore();
            };
            drawCap(physicalLeft, true);
            drawCap(physicalRight, false);
        }

        const shachi = this.stage6RidgeShachiImage;
        if (!this.isStage6ImageReady(shachi)) return;
        // 鯱は水平大棟の端そのものへ載せる。sourceの低い取付足下端(SHACHI_VISIBLE_BOTTOM)を
        // 大棟上面へ接地し、広い台座や接続フェードを作らない。
        // 寸法・内寄せはコライダー(getStage6ShachiSolidBox)と共有する定数を使う。
        const shachiH = SHACHI_DRAW_H;
        const shachiInset = SHACHI_INSET_PX;
        const shachiBottomY = Math.round(capY + shachiH * (1 - SHACHI_VISIBLE_BOTTOM));
        const shachiFilter = 'brightness(0.92) saturate(0.82) contrast(1)';
        // sourceは左向き。実城の対になる鯱と同じく、左右とも頭を大棟中央へ向ける。
        this.renderStage6FixedBackdrop(ctx, shachi, physicalLeft + shachiInset, renderProgress, {
            drawHeight: shachiH,
            bottomY: shachiBottomY,
            filter: shachiFilter,
            flipX: true
        });
        this.renderStage6FixedBackdrop(ctx, shachi, physicalRight - shachiInset, renderProgress, {
            drawHeight: shachiH,
            bottomY: shachiBottomY,
            filter: shachiFilter
        });
    }

    renderStage6GroundThresholds(ctx, renderProgress, horizonY, bottomY) {
        const image = this.stage6GroundThresholdImage;
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

        const zoneWidth = this.maxProgress / 4;
        const drawH = Math.ceil(bottomY - horizonY + 8);
        const drawW = Math.max(68, Math.ceil(drawH * (image.naturalWidth / image.naturalHeight) * 1.6));
        const y = Math.floor(horizonY - 4);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, horizonY, CANVAS_WIDTH, Math.max(0, bottomY - horizonY));
        ctx.clip();
        ctx.filter = 'brightness(0.82) saturate(0.62) contrast(1.02)';

        // 敷居ストリップは床テクスチャの実際の切り替え位置(壁右端)に置き、継ぎ目を受ける
        for (let zoneIndex = 1; zoneIndex < 4; zoneIndex++) {
            const x = Math.round(zoneWidth * zoneIndex + STAGE6_CORNER.WALL_RIGHT_PX - renderProgress - drawW * 0.5);
            if (x + drawW <= 0 || x >= CANVAS_WIDTH) continue;
            ctx.drawImage(image, x, y, drawW, drawH);
        }

        ctx.filter = 'none';
        ctx.restore();
    }

    renderStage1BambooGroundBlend(ctx, renderProgress, darken) {
        this.renderStage1RootScreenImage(ctx, renderProgress, darken);
    }

    renderStage1RootScreenImage(ctx, renderProgress, darken) {
        const image = this.stage1BambooRootScreenImage;
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const drawH = 104;
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const y = Math.round(this.groundY - drawH + 12);
        const fixedCameraX = Math.floor(renderProgress);
        const scroll = ((fixedCameraX % drawW) + drawW) % drawW;
        const startX = -scroll - drawW;
        const forestEndX = this.getStage1BambooTreeLineX() - fixedCameraX + STAGE1_FENCE_END_OFFSET;
        const clipRight = Math.max(0, Math.min(CANVAS_WIDTH, forestEndX - 6));
        if (forestEndX <= -16) return false;

        if (clipRight > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, y - 8, clipRight, drawH + 16);
            ctx.clip();
            ctx.globalAlpha *= 0.88;
            ctx.filter = `brightness(${(0.76 - darken * 0.06).toFixed(3)}) saturate(0.74) contrast(0.92)`;
            for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW) {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
            ctx.filter = 'none';
            ctx.restore();
        }

        if (forestEndX > 0 && forestEndX < CANVAS_WIDTH + 32) {
            this.renderStage1FenceTerminal(ctx, image, forestEndX, y, drawH, darken);
        }
        return true;
    }

    renderStage1FenceTerminal(ctx, image, fenceEndX, fenceY, fenceH, darken) {
        const filter = `brightness(${(0.76 - darken * 0.06).toFixed(3)}) saturate(0.74) contrast(0.92)`;

        ctx.save();
        ctx.globalAlpha *= 0.88;
        ctx.filter = filter;

        // 通常柵は高さを保ったまま止め、同素材の縦柱で切断面を受ける。
        ctx.save();
        ctx.translate(fenceEndX - 12, fenceY + fenceH);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, 260, 210, 220, 28, 0, 0, 82, 12);
        ctx.restore();

        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderGroundBamboo(ctx, renderProgress, darken) {
        const horizonY = this.groundY; // 地平線（奥）。林床はここから手前へ広がる
        const bottomY = CANVAS_HEIGHT;
        const span = bottomY - horizonY;
        const stageP = this.clamp01(renderProgress / this.getBossScrollStopX());
        const nightWeight = 1 - this.smoothstep(0.08, 0.74, stageP);
        const stageDarken = Math.max(darken, nightWeight * 0.62);

        // 1. 路面グラデ（湿った苔と土）
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#496f36', '#16241b', stageDarken * 0.58));
        roadGrad.addColorStop(0.6, this.interpolateColor('#5b7b43', '#1b2b1f', stageDarken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#3f5f31', '#101b12', stageDarken * 0.66));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, span);

        const groundBrightness = 0.76 + (1 - nightWeight) * 0.32;
        const groundSaturation = 0.68 + (1 - nightWeight) * 0.12;
        const groundContrast = 0.9 + (1 - nightWeight) * 0.02;
        if (this.renderGroundImageTile(ctx, this.stage1GroundImage, horizonY, bottomY, renderProgress, {
            filter: `brightness(${groundBrightness.toFixed(3)}) saturate(${groundSaturation.toFixed(3)}) contrast(${groundContrast.toFixed(3)}) hue-rotate(5deg)`,
            extraHeight: 34,
            yOffset: -16,
            widthScale: 2.2,
            mirrorRepeat: true
        })) {
            ctx.fillStyle = `rgba(168, 151, 102, ${(0.028 * (1 - nightWeight * 0.72)).toFixed(3)})`;
            ctx.fillRect(0, horizonY - 36, CANVAS_WIDTH, span + 36);

            const seamSoftener = ctx.createLinearGradient(0, horizonY - 68, 0, horizonY + 112);
            seamSoftener.addColorStop(0, 'rgba(37, 66, 35, 0)');
            seamSoftener.addColorStop(0.44, `rgba(35, 54, 38, ${(0.075 + stageDarken * 0.04).toFixed(3)})`);
            seamSoftener.addColorStop(1, 'rgba(18, 32, 20, 0)');
            ctx.fillStyle = seamSoftener;
            ctx.fillRect(0, horizonY - 68, CANVAS_WIDTH, 180);

            const bottomShade = ctx.createLinearGradient(0, horizonY + span * 0.34, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.03 + darken * 0.05).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, span);

            if (nightWeight > 0.001) {
                const nightShade = ctx.createLinearGradient(0, horizonY - 32, 0, bottomY);
                nightShade.addColorStop(0, `rgba(3, 10, 28, ${(0.18 * nightWeight).toFixed(3)})`);
                nightShade.addColorStop(0.58, `rgba(2, 8, 20, ${(0.24 * nightWeight).toFixed(3)})`);
                nightShade.addColorStop(1, `rgba(0, 4, 12, ${(0.34 * nightWeight).toFixed(3)})`);
                ctx.fillStyle = nightShade;
                ctx.fillRect(0, horizonY - 32, CANVAS_WIDTH, span + 32);
            }
        }

        this.renderStage1GroundToKaido(ctx, renderProgress);
    }

    renderStage1GroundToKaido(ctx, renderProgress) {
        const image = this.stage1GroundToKaidoImage;
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const worldStart = this.getStage1GroundTransitionStartX();
        const drawW = this.maxProgress - worldStart;
        const x = worldStart - Math.floor(renderProgress);
        if (x >= CANVAS_WIDTH || x + drawW <= 0) return false;

        const y = this.groundY - 16;
        const drawH = CANVAS_HEIGHT - this.groundY + 34;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, this.groundY, CANVAS_WIDTH, CANVAS_HEIGHT - this.groundY);
        ctx.clip();
        ctx.filter = 'brightness(1.15) saturate(0.78) contrast(0.88) hue-rotate(5deg)';

        const blendW = Math.min(320, drawW);
        const stripCount = 32;
        const sourcePerPixel = image.naturalWidth / drawW;
        const baseAlpha = ctx.globalAlpha;
        for (let i = 0; i < stripCount; i++) {
            const stripLeft = blendW * (i / stripCount);
            const stripRight = blendW * ((i + 1) / stripCount);
            const stripW = stripRight - stripLeft;
            const sourceX = stripLeft * sourcePerPixel;
            const sourceW = Math.max(1, stripW * sourcePerPixel + 1);
            ctx.globalAlpha = baseAlpha * this.smoothstep(0, 1, i / (stripCount - 1));
            ctx.drawImage(
                image,
                sourceX,
                0,
                sourceW,
                image.naturalHeight,
                Math.round(x + stripLeft),
                y,
                Math.ceil(stripW + 1),
                drawH
            );
        }

        const opaqueSourceX = blendW * sourcePerPixel;
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(
            image,
            opaqueSourceX,
            0,
            image.naturalWidth - opaqueSourceX,
            image.naturalHeight,
            Math.round(x + blendW),
            y,
            drawW - blendW,
            drawH
        );

        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderGroundKaido(ctx, renderProgress, darken) {
        const horizonY = this.groundY; // 地面の上端＝地平線（他ステージ共通。奥行きを持たせる）
        const bottomY = CANVAS_HEIGHT;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#9a826a', '#3d2d1d', darken * 0.6));
        roadGrad.addColorStop(0.5, this.interpolateColor('#c6ad8f', '#5e4832', darken * 0.45));
        roadGrad.addColorStop(1, this.interpolateColor('#7d6b58', '#2a1f14', darken * 0.8));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        if (this.renderGroundImageTile(ctx, this.stage2GroundImage, horizonY, bottomY, renderProgress, {
            filter: 'brightness(0.86) saturate(0.82) contrast(0.92)',
            extraHeight: 34,
            yOffset: -16
        })) {
            const sunWash = ctx.createLinearGradient(0, horizonY, 0, horizonY + 140);
            sunWash.addColorStop(0, `rgba(255, 225, 168, ${(0.12 * (1 - darken * 0.55)).toFixed(3)})`);
            sunWash.addColorStop(1, 'rgba(255, 225, 168, 0)');
            ctx.fillStyle = sunWash;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, 150);

            const bottomShade = ctx.createLinearGradient(0, horizonY + (bottomY - horizonY) * 0.35, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.12 + darken * 0.14).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);
            return;
        }

        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas路面へは戻さない。
    }

    renderGroundMountain(ctx, renderProgress, darken) {
        const horizonY = this.groundY; // 地面の上端＝地平線（奥行きの起点）
        const bottomY = CANVAS_HEIGHT;
        const groundH = bottomY - horizonY;

        // 1) 路面グラデ：逢魔が時。奥(遠/明)は低い夕日を拾う暖アンバー褐色、中は陰り、手前(近)は冷たく沈む
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#8a6e52', '#2c2118', darken * 0.6));
        roadGrad.addColorStop(0.5, this.interpolateColor('#6f5945', '#241b13', darken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#33291f', '#0f0b07', darken * 0.85));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundH);

        if (this.renderGroundImageTile(ctx, this.stage3GroundImage, horizonY, bottomY, renderProgress, {
            filter: 'brightness(0.78) saturate(0.76) contrast(0.92)',
            extraHeight: 38,
            yOffset: -18
        })) {
            const glowH = groundH * 0.28;
            const sunGlow = ctx.createLinearGradient(0, horizonY, 0, horizonY + glowH);
            sunGlow.addColorStop(0, `rgba(255,176,104,${(0.16) * (1 - darken * 0.7)})`);
            sunGlow.addColorStop(1, 'rgba(255,176,104,0)');
            ctx.fillStyle = sunGlow;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, glowH);

            const bottomShade = ctx.createLinearGradient(0, horizonY + groundH * 0.3, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.22 + darken * 0.18).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundH);
            return;
        }

        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas路面へは戻さない。

        // 地平線の硬い境界線は出さず、夕焼けの照り返しと地面グラデーションでなじませる。
    }

    renderGroundTown(ctx, renderProgress, darken) {
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;
        const groundHeight = bottomY - horizonY;
        const groundTile = this.stage4TownImages?.groundTile;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#6f7480', '#1d2028', darken * 0.6));
        roadGrad.addColorStop(0.58, this.interpolateColor('#8b8a86', '#363638', darken * 0.45));
        roadGrad.addColorStop(1, this.interpolateColor('#54514c', '#101012', darken * 0.8));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundHeight);

        if (groundTile && groundTile.complete && groundTile.naturalWidth > 0 && groundTile.naturalHeight > 0) {
            const drawH = Math.ceil(groundHeight + 34);
            const drawW = Math.ceil(drawH * (groundTile.naturalWidth / groundTile.naturalHeight));
            const scroll = Math.floor(renderProgress % drawW);
            const startX = -scroll - drawW;

            ctx.save();
            ctx.filter = 'brightness(0.76) saturate(0.72) contrast(0.94)';
            for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW) {
                ctx.drawImage(groundTile, x, horizonY - 18, drawW + 2, drawH);
            }
            ctx.filter = 'none';

            const bottomShade = ctx.createLinearGradient(0, horizonY + groundHeight * 0.2, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0, 0, 0, 0)');
            bottomShade.addColorStop(1, `rgba(0, 0, 0, ${(0.18 + darken * 0.16).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundHeight);
            ctx.restore();
        }
        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas石畳へは戻さない。
    }

    renderGroundCastle(ctx, renderProgress, darken) {
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT + 600; // 垂直スクロール時に下が途切れないように拡張

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 600);
        roadGrad.addColorStop(0, this.interpolateColor('#c5b489', '#3a3324', darken * 0.7));
        roadGrad.addColorStop(0.5, this.interpolateColor('#dccd9a', '#544b36', darken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#a5966d', '#28231a', darken * 0.9));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        if (this.renderGroundImageTile(ctx, this.stage5GroundImage, horizonY, bottomY, renderProgress, {
            filter: 'brightness(0.72) saturate(0.78) contrast(0.95)',
            extraHeight: 48,
            yOffset: -22,
            mirrorRepeat: true,
            widthScale: 1.35
        })) {
            const lanternSheen = ctx.createLinearGradient(0, horizonY, 0, Math.min(bottomY, horizonY + 240));
            lanternSheen.addColorStop(0, `rgba(255, 190, 104, ${(0.10 * (1 - darken * 0.4)).toFixed(3)})`);
            lanternSheen.addColorStop(1, 'rgba(255, 190, 104, 0)');
            ctx.fillStyle = lanternSheen;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, Math.min(260, bottomY - horizonY));

            const bottomShade = ctx.createLinearGradient(0, horizonY + 140, 0, Math.min(bottomY, CANVAS_HEIGHT));
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.18 + darken * 0.18).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, Math.max(0, Math.min(bottomY, CANVAS_HEIGHT) - horizonY));
            return;
        }

        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas畳目へは戻さない。
    }

    renderGroundTenshu(ctx, renderProgress, darken) {
        ctx.save();
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;

        // 最上階アリーナだけは、床の実体を【屋根のシルエット】で切る。
        // 大棟から左右の隅棟の内側までを1枚のタイルで埋めるので、端と中央で
        // 瓦の寸法・位相が原理的に一致する(端材は稜線と軒先だけを上に重ねる)。
        // 端材が未読込の間は従来どおり実体端の矩形で止め、空へタイルを溢れさせない。
        if (this.isStage6Arena() && !this.clipStage6RoofSilhouette(ctx, renderProgress)) {
            const edgeInset = STAGE6_CORNER.ARENA_EDGE_INSET_PX;
            const roofLeft = this.getStage6ArenaLeft() + edgeInset - renderProgress;
            const roofRight = this.maxProgress - edgeInset - renderProgress;
            const clipLeft = Math.max(0, roofLeft);
            const clipRight = Math.min(CANVAS_WIDTH, roofRight);
            ctx.beginPath();
            ctx.rect(clipLeft, 0, Math.max(0, clipRight - clipLeft), CANVAS_HEIGHT);
            ctx.clip();
        }

        // 区画画像の読込中にも床が抜けないよう、暗い中立色だけを敷いて待つ。
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#32343a', '#111216', darken));
        roadGrad.addColorStop(0.35, this.interpolateColor('#292b30', '#0d0e11', darken));
        roadGrad.addColorStop(1, this.interpolateColor('#17181c', '#050506', darken * 1.2));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        const renderedGround = this.renderStage6GroundZones(ctx, renderProgress, horizonY, bottomY);
        if (renderedGround) {
            // 【床の黒を持ち上げる】。stage6の床素材は平均輝度が29〜42しかなく、
            // 描画後は実測24〜40。黒シルエットのプレイヤー(輝度26)とのコントラストが
            // -1〜+3=ほぼ同化で、どこに立っているのか見えなかった。
            // 以前はプレイヤー側に青白いハローを敷いて浮かせていたが、光を足す対処は
            // 明るい空を背にすると常時オーラに見えるため撤去し、床の色合いで解決する。
            // 加算(lighter)の一様リフト = 黒だけが持ち上がり、瓦や板目の陰影の絶対差は
            // そのまま残る(brightnessの乗算だと暗部がほとんど動かず明部だけ飛ぶ)。
            // 実測: 床輝度 56〜70 / コントラスト 30〜44。黒漆の暗さ(白の22〜27%)は保つ。
            // 【床帯だけに掛ける】(horizonY..bottomY)。立面(y<480)は投影文法の別世界。
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgb(32, 35, 41)';
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);
            ctx.restore();

            const moonSheen = ctx.createLinearGradient(0, horizonY, 0, bottomY);
            moonSheen.addColorStop(0, 'rgba(210, 224, 232, 0)');
            moonSheen.addColorStop(0.34, `rgba(210, 224, 232, ${(0.07 - darken * 0.02).toFixed(3)})`);
            moonSheen.addColorStop(1, 'rgba(210, 224, 232, 0)');
            ctx.fillStyle = moonSheen;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

            const bottomShade = ctx.createLinearGradient(0, horizonY + (bottomY - horizonY) * 0.35, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.22 + darken * 0.16).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);
        }

        // 地面だけに適用した実体端クリップを先に解除する。妻端と金鯱は屋根の外側へ
        // 張り出す部品なので、同じクリップ内で描くと消えて赤い空だけが矩形に露出する。
        ctx.restore();
        this.renderStage6ArenaRidgeEnds(ctx, renderProgress);
        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas金目地へは戻さない。
    }

    // ============================================
    // ボス部屋の空間演出（色は一切変えない）
    // ============================================
    // 旧 renderBossVignette はステージ別の【有彩色】(深緑/茶/紫/赤/金)を multiply で
    // 全画面に乗せていた。これが「どのステージのボス戦も夕方に見える」主因のひとつ。
    // 現行は黒(と無彩色の白スポット)だけを使い、色相を動かさずに緊張感を作る。
    //
    // layer:
    //   'far'   … renderBackground 直後（世界ズーム内・スクロール非適用）。遠景を沈める。
    //   'floor' … renderGround 直後・キャラ描画前（同上）。足元スポットと空気の粒子。
    //   'near'  … 世界ズームを抜けた等倍スクリーン空間。ビネットと左右の柱。
    //
    // options:
    //   spots   … [{x, y}] 足元スポットの位置（カメラ空間 = worldX - scrollX, worldY）
    //   focusX / focusY … ビネットの中心（スクリーン空間）
    //   screenW / screenH … スクリーン空間のサイズ
    renderBossAtmosphere(ctx, blend, layer, options = {}) {
        if (!(blend > 0)) return;
        const b = this.clamp01(blend);

        if (layer === 'far') {
            // 遠景の沈み込み。空〜遠景の上に黒を敷き、地平線側を薄くして
            // 「光が下から抜ける」構図にする。地面はこの後に描かれるので影響しない。
            const top = (this.skyVisTop || 0) - 240;
            const bottom = this.groundY + 2;
            const g = ctx.createLinearGradient(0, top, 0, bottom);
            g.addColorStop(0, `rgba(0, 0, 0, ${(BOSS_STAGING.FAR_SINK_TOP * b).toFixed(3)})`);
            g.addColorStop(1, `rgba(0, 0, 0, ${(BOSS_STAGING.FAR_SINK_HORIZON * b).toFixed(3)})`);
            ctx.save();
            ctx.fillStyle = g;
            ctx.fillRect(0, top, CANVAS_WIDTH, bottom - top);
            ctx.restore();
            return;
        }

        if (layer === 'floor') {
            // 足元の明かり（舞台のスポット）。白のみなので時間帯を汚さない。
            const spots = options.spots || [];
            if (spots.length) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighten';
                for (const s of spots) {
                    if (!s) continue;
                    const rx = s.rx || 96;
                    const ry = s.ry || 26;
                    const a = (s.alpha != null ? s.alpha : BOSS_STAGING.SPOT_ALPHA) * b;
                    if (!(a > 0.002)) continue;
                    const sg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rx);
                    sg.addColorStop(0, `rgba(255, 255, 255, ${a.toFixed(3)})`);
                    sg.addColorStop(0.6, `rgba(255, 255, 255, ${(a * 0.45).toFixed(3)})`);
                    sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.scale(1, ry / rx);
                    ctx.translate(-s.x, -s.y);
                    ctx.fillStyle = sg;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, rx, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.restore();
            }

            // 空気の密度（ステージ固有の粒子）。旧 Stage.render() の中で死んでいたものを
            // 生きた描画パスへ移設した。粒子そのものは「空中の物体」なので色を持ってよいが、
            // 全画面の色被せ（照り返し/差し込む光）は撤去済み。
            this.renderBossParticles(ctx, this.stageTime, b * BOSS_STAGING.PARTICLE_DENSITY);
            return;
        }

        if (layer === 'near') {
            const W = options.screenW || CANVAS_WIDTH;
            const H = options.screenH || CANVAS_HEIGHT;
            const fx = options.focusX != null ? options.focusX : W * 0.5;
            const fy = options.focusY != null ? options.focusY : H * 0.5;

            ctx.save();
            // ビネット加算（中心はプレイヤーとボスの中点＝構図が締まる）
            const va = BOSS_STAGING.VIGNETTE_ALPHA * b;
            if (va > 0.002) {
                const vg = ctx.createRadialGradient(
                    fx, fy, H * BOSS_STAGING.VIGNETTE_INNER,
                    fx, fy, H * BOSS_STAGING.VIGNETTE_OUTER
                );
                vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
                vg.addColorStop(1, `rgba(0, 0, 0, ${va.toFixed(3)})`);
                ctx.fillStyle = vg;
                ctx.fillRect(0, 0, W, H);
            }

            // 左右の暗い柱（囲われた決闘場）
            const pw = W * BOSS_STAGING.PILLAR_WIDTH_RATIO;
            const pa = BOSS_STAGING.PILLAR_ALPHA * b;
            if (pa > 0.002 && pw > 1) {
                const lg = ctx.createLinearGradient(0, 0, pw, 0);
                lg.addColorStop(0, `rgba(0, 0, 0, ${pa.toFixed(3)})`);
                lg.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = lg;
                ctx.fillRect(0, 0, pw, H);

                const rg = ctx.createLinearGradient(W - pw, 0, W, 0);
                rg.addColorStop(0, 'rgba(0, 0, 0, 0)');
                rg.addColorStop(1, `rgba(0, 0, 0, ${pa.toFixed(3)})`);
                ctx.fillStyle = rg;
                ctx.fillRect(W - pw, 0, pw, H);
            }

            // 決戦の舞台枠。画面端の小さな隅飾りだけで場を締める。
            // 旧中央水平線はボスHPバー上部の菱形と一体に見える一方で役割がなく、
            // HUDを散らかしていたため描画しない。
            const accents = [
                [135, 194, 151], [205, 167, 111], [177, 196, 222],
                [218, 139, 91], [205, 178, 128], [229, 176, 194]
            ];
            const ac = accents[Math.max(0, Math.min(5, this.stageNumber - 1))];
            const frameA = 0.30 * b;
            const marginX = Math.max(28, W * 0.055);
            const topY = Math.max(26, H * 0.052);

            ctx.strokeStyle = `rgba(${ac[0]}, ${ac[1]}, ${ac[2]}, ${(frameA * 0.76).toFixed(3)})`;
            ctx.lineWidth = 1.2;
            const cornerLen = Math.min(38, W * 0.035);
            for (const side of [-1, 1]) {
                const xx = side < 0 ? marginX : W - marginX;
                ctx.beginPath();
                ctx.moveTo(xx, topY + 18);
                ctx.lineTo(xx, topY);
                ctx.lineTo(xx + side * cornerLen, topY);
                ctx.stroke();
            }

            // 着地の瞬間だけ視野を締める。常時暗くしない。
            if (this.bossEntranceFlash > 0.004) {
                ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.24, this.bossEntranceFlash).toFixed(3)})`;
                ctx.fillRect(0, 0, W, H);
            }
            ctx.restore();
        }
    }

    renderHeatHaze(ctx, time, blend) {
        if (blend <= 0) return;
        const amp = 1.5 * blend;
        const speed = 0.004;
        ctx.save();
        const offset = Math.sin(time * speed) * amp;
        ctx.translate(0, offset);
        // 陽炎の揺らぎを地面付近に描画
        const hz = ctx.createLinearGradient(0, this.groundY - 60, 0, this.groundY + 10);
        hz.addColorStop(0, 'rgba(220, 200, 160, 0)');
        hz.addColorStop(0.5, `rgba(220, 200, 160, ${0.06 * blend})`);
        hz.addColorStop(1, 'rgba(220, 200, 160, 0)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, this.groundY - 60, CANVAS_WIDTH, 70);
        ctx.restore();
    }

    renderBossParticles(ctx, time, blend) {
        if (blend <= 0) return;
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const pMod = time * 0.001;
        
        switch (this.stageNumber) {
            case 1: { // 竹林: 竹林から風に運ばれて横切る葉
                // 【作り直し】旧実装は空に引いた5本の曲線(墨の風の帯)で、実測Δ5.3=不可視。
                // 濃くしても stage2 の陽炎3本と同じ「線が数本あるだけ」になるので撤去した。
                // 代わりに、画面左に残っている竹林から【風で運ばれて横切る葉】を置く。
                //  ・上から降らせない → 地面に落葉が積もっていない場所でも矛盾しない
                //  ・左(=竹林側)から入って右へ抜ける → 出どころが画面内にあり因果が読める
                //  ・濃い緑は明るい砂地に対して明度差が立つ(白い埃で失敗した反省)
                //  ・横速度 230〜370px/秒。淡い色は速度と輪郭でしか目に留まらない
                const leaves = this.cachedAssets.bambooLeaves;
                if (leaves?.length) {
                    ctx.globalCompositeOperation = 'source-over';
                    const laneY1 = this.groundY + LANE_OFFSET;
                    for (let i = 0; i < 11; i++) {
                        const seed = i * 23.73;
                        const depth = 0.5 + (i % 3) * 0.25;
                        const span = CANVAS_WIDTH + 260;
                        const speed = 230 + (i % 4) * 47;
                        const x = ((seed * 109 + pMod * speed) % span + span) % span - 130;
                        // 横切りながら僅かに落ちる。基準は足元線より上の空気の層。
                        const drift = ((seed * 31 + pMod * 26) % 150);
                        const y = laneY1 - 170 + drift + Math.sin(pMod * 1.9 + seed) * 11;
                        const flip = 0.2 + Math.abs(Math.cos(pMod * 2.6 + seed)) * 0.8;
                        const size = 13 + depth * 9;
                        ctx.save();
                        ctx.globalAlpha = (0.62 + depth * 0.3) * blend;
                        ctx.translate(x, y);
                        ctx.rotate(-0.3 + Math.sin(pMod * 1.5 + seed) * 0.5);
                        ctx.scale(flip, 1);
                        ctx.drawImage(leaves[i % leaves.length], -size * 0.5, -size * 0.5, size, size);
                        ctx.restore();
                    }
                    ctx.globalAlpha = 1;
                }
                break;
            }
            case 2: { // 街道: 足元を流れる土煙
                // 【作り直し】旧実装は2点で読めなかった。
                //  (a) 陽炎を1px幅のベジェ曲線3本で描いていたため「線が3本あるだけ」に見えた
                //  (b) 砂煙の基準が地平線(groundY=480)で、役者の足元線(groundY+LANE_OFFSET=512)
                //      より上に浮いていたので「足元の土」に見えず、宙の霞になっていた
                // 曲線は撤去し、足元線に寄せた土の帯＋その上を流れる塊に置き換える。
                ctx.globalCompositeOperation = 'source-over';
                const laneY2 = this.groundY + LANE_OFFSET;
                // 【色は砂ではなく“光を受けた土埃”】。砂色(198,176,138)を砂の地面に
                // 重ねても明度差が出ず、実測Δ5.4=見えないままだった(stage1の緑の葉と同じ失敗)。
                // 舞い上がった埃は日を受けて白く光るので、淡い白で明度を上げる。
                // 【さらに“動き”で読ませる】。淡い色は輪郭と速度でしか目に留まらない。
                // 旧実装の横流れは46〜85px/秒しかなく、面が静止画のように貼り付いて
                // 背景の一部に見えていた(桜は60〜138px/秒＋Δ41で読める)。
                // 塊を小さく締めて芯を作り、210〜390px/秒で流す。
                // 静止した帯は薄く敷くだけにして、地面のコントラストを潰さない。
                const band = ctx.createLinearGradient(0, laneY2 + 10, 0, laneY2 - 60);
                band.addColorStop(0, `rgba(252, 244, 226, ${(0.070 * blend).toFixed(3)})`);
                band.addColorStop(0.45, `rgba(248, 238, 218, ${(0.038 * blend).toFixed(3)})`);
                band.addColorStop(1, 'rgba(245, 234, 212, 0)');
                ctx.fillStyle = band;
                ctx.fillRect(0, laneY2 - 60, CANVAS_WIDTH, 70);
                for (let i = 0; i < 18; i++) {
                    const seed = i * 31.19;
                    const span = CANVAS_WIDTH + 360;
                    const speed = 210 + (i % 6) * 36;
                    const x = ((seed * 83 - pMod * speed) % span + span) % span - 180;
                    const lift = (pMod * 26 + seed * 11) % 56;
                    const y = laneY2 + 4 - lift + Math.sin(pMod * 2.2 + seed) * 3;
                    const rx = 26 + (i % 4) * 13;
                    const a = (0.30 + (i % 3) * 0.06) * blend * (1 - lift / 72);
                    if (a <= 0.004) continue;
                    const dust = ctx.createRadialGradient(x, y, 0, x, y, rx);
                    dust.addColorStop(0, `rgba(255, 250, 236, ${a.toFixed(3)})`);
                    dust.addColorStop(0.42, `rgba(252, 244, 226, ${(a * 0.62).toFixed(3)})`);
                    dust.addColorStop(1, 'rgba(240, 228, 205, 0)');
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.scale(1, 0.42);
                    ctx.translate(-x, -y);
                    ctx.fillStyle = dust;
                    ctx.beginPath();
                    ctx.arc(x, y, rx, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                // 【明るい砂の上では白も同値になる】。上の白い埃は暗い背景(岩・石垣・草)に
                // 重なった部分でしか読めていなかった(砂の上では実測でほぼΔ0)。
                // 明度がどちらに転んでも立つのは暗→明のコントラストなので、
                // 街道に舞う枯れ草(暗褐色の細片)を主役として足す。
                // 形は短い弧、速度は270〜438px/秒、転がりの回転つき。
                for (let i = 0; i < 16; i++) {
                    const seed = i * 12.37;
                    const span = CANVAS_WIDTH + 240;
                    const speed = 270 + (i % 5) * 42;
                    const x = ((seed * 137 - pMod * speed) % span + span) % span - 120;
                    const y = laneY2 - 6 - ((seed * 29) % 58) + Math.sin(pMod * 3.1 + seed) * 9;
                    const len = 7 + (i % 4) * 3;
                    const a = (0.42 + (i % 3) * 0.10) * blend;
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(Math.sin(pMod * 2.4 + seed) * 0.9 - 0.25);
                    ctx.strokeStyle = `rgba(74, 56, 34, ${a.toFixed(3)})`;
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    ctx.moveTo(-len * 0.5, 0);
                    ctx.quadraticCurveTo(0, -len * 0.28, len * 0.5, 0);
                    ctx.stroke();
                    ctx.restore();
                }
                break;
            }
            case 3: { // 山道: 谷からほどける霊霧
                // 【薄明光(光の筋2枚)は撤去】。夕暮れの山道で光源が画面内に無く、
                // 幅54pxの四角形が右下へ傾いているため「半透明の板が2枚降ってくる」
                // ようにしか読めなかった。霧だけに絞り、足元線から立ち上げる。
                ctx.globalCompositeOperation = 'screen';
                const laneY3 = this.groundY + LANE_OFFSET;
                for (let i = 0; i < 8; i++) {
                    const seed = i * 15.7;
                    const y = laneY3 - 6 - i * 26 + Math.sin(pMod * 0.38 + seed) * 12;
                    const fog = ctx.createLinearGradient(0, y, CANVAS_WIDTH, y);
                    const near = (0.075 - i * 0.005) * blend;
                    const far = (0.105 - i * 0.007) * blend;
                    fog.addColorStop(0, 'rgba(238, 244, 249, 0)');
                    fog.addColorStop(0.3, `rgba(238, 244, 249, ${Math.max(0, near).toFixed(3)})`);
                    fog.addColorStop(0.7, `rgba(238, 244, 249, ${Math.max(0, far).toFixed(3)})`);
                    fog.addColorStop(1, 'rgba(238, 244, 249, 0)');
                    ctx.strokeStyle = fog;
                    ctx.lineWidth = 10 + i * 2.2;
                    ctx.beginPath();
                    ctx.moveTo(-80, y);
                    ctx.bezierCurveTo(250, y - 22, 590, y + 28, CANVAS_WIDTH + 80, y - 6);
                    ctx.stroke();
                }
                break;
            }
            case 4: { // 城下町: 足元から立ち上る火の粉
                ctx.globalCompositeOperation = 'screen';
                // 【作り直し】旧実装は白いグロー(starGlow)＋淡黄の芯が画面全体を
                // 右下→左上へ等速で流れるだけで、寿命も上昇の感じも無かったため
                // 「綿毛が飛んでいく」ように見えていた。
                // 火の粉として読ませる3点: 橙の芯、ほぼ真上への上昇、寿命で消える。
                // 【出どころは地面全体ではなく城門脇のかがり火】。画面いっぱいの地面から
                // 湧くと「なぜ燃えているのか」が読めない。炎が描かれている2点から出す。
                const emberSources = this.getStage4BrazierSources();
                const EMBER_RISE = 300;
                const emberCount = emberSources.length ? 11 : 0;
                for (let s = 0; s < emberSources.length; s++) {
                const src = emberSources[s];
                for (let k = 0; k < emberCount; k++) {
                    const i = s * 17 + k;
                    const seed = i * 17.3;
                    // 0=かがり火で生まれた瞬間 / 1=上空で消える
                    const lifeT = ((pMod * (0.15 + (k % 5) * 0.022) + seed * 0.137) % 1 + 1) % 1;
                    const spread = ((seed * 13) % 24) - 12;
                    const x = src.x + spread
                        + Math.sin(pMod * 1.15 + seed) * (6 + lifeT * 16)
                        - lifeT * 18; // 上るほど僅かに流される
                    const y = src.y - lifeT * EMBER_RISE;
                    // 立ち上がりは速く、上空でゆっくり燃え尽きる
                    const fade = Math.min(1, lifeT * 9) * Math.pow(1 - lifeT, 1.5);
                    const twinkle = 0.72 + Math.sin(pMod * 7.5 + seed) * 0.28;
                    const a = fade * twinkle * blend;
                    if (a <= 0.012) continue;
                    const d = 9 + (i % 4) * 3;
                    const halo = ctx.createRadialGradient(x, y, 0, x, y, d);
                    halo.addColorStop(0, `rgba(255, 158, 68, ${(a * 0.55).toFixed(3)})`);
                    halo.addColorStop(1, 'rgba(255, 116, 38, 0)');
                    ctx.fillStyle = halo;
                    ctx.beginPath();
                    ctx.arc(x, y, d, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = `rgba(255, 152, 58, ${(a * 0.95).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.arc(x, y, 1.2 + (i % 3) * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = `rgba(255, 228, 182, ${(a * 0.75).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.arc(x, y, 0.6, 0, Math.PI * 2);
                    ctx.fill();
                }
                }
                break;
            }
            case 5: { // 城内: 障子光に浮かぶ細かな塵
                ctx.globalCompositeOperation = 'screen';
                const shaft = ctx.createLinearGradient(CANVAS_WIDTH * 0.18, 0, CANVAS_WIDTH * 0.72, this.groundY);
                shaft.addColorStop(0, `rgba(255, 248, 225, ${(0.055 * blend).toFixed(3)})`);
                shaft.addColorStop(1, 'rgba(255, 248, 225, 0)');
                ctx.fillStyle = shaft;
                ctx.beginPath();
                ctx.moveTo(CANVAS_WIDTH * 0.22, -40);
                ctx.lineTo(CANVAS_WIDTH * 0.36, -40);
                ctx.lineTo(CANVAS_WIDTH * 0.68, this.groundY);
                ctx.lineTo(CANVAS_WIDTH * 0.51, this.groundY);
                ctx.closePath();
                ctx.fill();
                const glow = this.cachedAssets.starGlow;
                for (let i = 0; i < 32; i++) {
                    const seed = i * 23.3;
                    const x = (seed * 131 + Math.sin(pMod * 0.4 + seed) * 50 + CANVAS_WIDTH) % CANVAS_WIDTH;
                    const y = (seed * 97 - pMod * 30 + CANVAS_HEIGHT) % CANVAS_HEIGHT;
                    const twinkle = 0.2 + Math.abs(Math.sin(pMod * 1.8 + seed)) * 0.8;
                    const d = 5 + (i % 4) * 1.7;
                    if (glow) {
                        ctx.globalAlpha = twinkle * 0.24 * blend;
                        ctx.drawImage(glow, x - d * 0.5, y - d * 0.5, d, d);
                    }
                }
                ctx.globalAlpha = 1;
                break;
            }
            case 6: { // 天守閣: 舞い散る桜と、朝日に舞う金粉
                // 【桜と金粉は名乗りと同時に舞い出す】。bossEncounterBlend は
                // bossIntroDuration(stage6は既定の1500ms・ボスが湧いた瞬間から)で開くため、
                // 旧演出(右外からダッシュ約1秒)の尺のまま「会敵歩行中に満開」になっていた
                // (実測: 湧いて750msで50%、1500msで100%、名乗りは2750ms)。
                // 短冊が出る瞬間から立ち上がる専用のランプを掛ける。
                blend *= this.smoothstep(0, 1, this.bossPetalT);
                if (!(blend > 0)) break;
                // 1. 桜。3層のパララックスで奥行きを作り、1枚ごとに裏返り(edge-on)を入れる。
                //    形・グラデ・縁取りは initCache のスプライトに焼き込み済み。
                //    旧実装(不透明なピンクの楕円を等倍で40枚)は「紙吹雪」に見えていた。
                const petals = this.cachedAssets.sakuraPetals;
                if (petals && petals.length) {
                    ctx.globalCompositeOperation = 'source-over';
                    const LAYERS = [
                        { n: 15, scale: 0.52, alpha: 0.30, fall: 34, drift: 62,  sway: 44, spin: 1.15 }, // 奥
                        { n: 12, scale: 0.84, alpha: 0.46, fall: 52, drift: 96,  sway: 66, spin: 1.55 }, // 中
                        { n: 8,  scale: 1.22, alpha: 0.62, fall: 74, drift: 138, sway: 92, spin: 2.05 }  // 手前
                    ];
                    const span = CANVAS_WIDTH * 1.4;
                    const fallSpan = CANVAS_HEIGHT + 120;
                    for (let L = 0; L < LAYERS.length; L++) {
                        const cfg = LAYERS[L];
                        for (let i = 0; i < cfg.n; i++) {
                            const seed = (i * 37.13 + L * 11.7);
                            const img = petals[(i + L) % petals.length];
                            const x = ((seed * 131 - pMod * cfg.drift) % span + span) % span - CANVAS_WIDTH * 0.2
                                + Math.sin(pMod * 0.9 + seed) * cfg.sway;
                            const y = ((seed * 97 + pMod * cfg.fall) % fallSpan + fallSpan) % fallSpan - 60;
                            // 裏返り: |cos| で薄くなる瞬間を作ると空気中で回っているように見える
                            const tumble = pMod * cfg.spin + seed;
                            const flip = 0.14 + Math.abs(Math.cos(tumble)) * 0.86;
                            const rot = Math.sin(pMod * 0.55 + seed) * 0.9 + seed;
                            const s = cfg.scale;
                            ctx.save();
                            ctx.globalAlpha = cfg.alpha * blend;
                            ctx.translate(x, y);
                            ctx.rotate(rot);
                            ctx.scale(flip, 1);
                            ctx.drawImage(img, -16 * s, -16 * s, 32 * s, 32 * s);
                            ctx.restore();
                        }
                    }
                    ctx.globalAlpha = 1;
                }

                // 2. 金粉。旧実装は fillRect の金色の棒(縦長の矩形)で、これが安っぽさの主因。
                //    芯が白に寄った柔らかい丸へ置き換え、lighten で空に溶かす。
                const mote = this.cachedAssets.goldMote;
                if (mote) {
                    ctx.globalCompositeOperation = 'lighten';
                    for (let i = 0; i < 20; i++) {
                        const seed = i * 23.9;
                        const x = ((seed * 167 + Math.sin(pMod * 0.8 + seed) * 44) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
                        const rise = this.groundY + 140;
                        const y = this.groundY + 30 - ((pMod * 46 + seed * 61) % rise);
                        // 上へ行くほど消えていく(舞い上がって朝日に溶ける)
                        const height = this.clamp01((this.groundY + 30 - y) / rise);
                        const twinkle = 0.42 + Math.sin(pMod * 2.3 + seed) * 0.34;
                        const a = blend * twinkle * (1 - this.smoothstep(0.55, 1, height)) * 0.5;
                        if (a <= 0.01) continue;
                        const d = 7 + (seed % 7);
                        ctx.globalAlpha = a;
                        ctx.drawImage(mote, x - d * 0.5, y - d * 0.5, d, d);
                    }
                    ctx.globalAlpha = 1;
                }
                break;
            }
        }
        ctx.restore();
    }

    renderSkyParticles(ctx, time, bossEncounterBlend = 0) {
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        let intensity = 0;

        if (this.stageNumber === 1) {
            // 深い朝方の藍色から朝焼けへ移る間、星の芯をくっきり残して徐々に消す。
            intensity = (1 - this.smoothstep(0.24, 0.68, p)) * 0.95;
        } else if (this.stageNumber === 3) {
            // 夕方ステージは基本星なし。ボス戦（日没スレスレ）でのみ極薄く
            intensity = this.bossSpawned ? this.smoothstep(0, 0.6, this.bossEncounterBlend) * 0.3 : 0;
        } else if (this.stageNumber === 4) {
            // 宵の口(p=0.1)からゆっくり出始め、深夜(p=0.8)で満天に
            intensity = this.smoothstep(0.08, 0.75, p) * 0.95;
        } else if (this.stageNumber === 6) {
            // 深夜(p=0)〜月没後(p=0.4)は満天 → 夜明け(p=0.88)で消えていく
            intensity = 1 - this.smoothstep(0.72, 0.96, p);
        }

        if (intensity <= 0) return;

        // ボス戦演出で太陽が昇り始めたら星をフェードアウト（Stage 6）
        let starAlphaMultiplier = 1;
        if (this.stageNumber === 6 && bossEncounterBlend > 0) {
            starAlphaMultiplier = 1 - this.clamp01(bossEncounterBlend * 1.2);
        }
        if (starAlphaMultiplier <= 0) return;

        const starParallaxRate = this.stageNumber === 1 ? 0.018 : 0.01;
        const starParallaxOffset = this.progress * starParallaxRate;
        for (const particle of this.skyParticles) {
            const x = ((particle.nx * CANVAS_WIDTH - starParallaxOffset) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
            const y = this.skyY(20 + particle.ny * (this.groundY * 0.55));
            // 2周波ブレンドで不規則な瞬き（subSpeedが無い旧データでも単一sineにフォールバック）
            const flick = particle.subSpeed
                ? (Math.sin(time * particle.speed + particle.phase) * 0.6 + Math.sin(time * particle.subSpeed + particle.subPhase) * 0.4)
                : Math.sin(time * particle.speed + particle.phase);
            const twinkle = 0.5 + flick * 0.5;
            const alphaBase = this.stageNumber === 1
                ? (0.38 + twinkle * 0.62)
                : Math.max(0.08, twinkle);
            const alpha = alphaBase * intensity * starAlphaMultiplier;

            if (alpha <= 0.025) continue;

            if (twinkle > 0.42 && alpha > 0.12) {
                const glowRadius = this.stageNumber === 1
                    ? (2.2 + twinkle * 2.8)
                    : (2.8 + twinkle * 4.2);
                const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
                glow.addColorStop(0, `rgba(255, 255, 255, ${alpha * (this.stageNumber === 1 ? 0.46 : 0.42)})`);
                glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Stage 3 の夕暮れ星はやや薄い青白、他は白
            const starColor = this.stageNumber === 3
                ? `rgba(220, 225, 255, ${alpha})`
                : `rgba(255, 255, 245, ${alpha})`;
            ctx.fillStyle = starColor;
            ctx.beginPath();
            const starRadius = this.stageNumber === 1
                ? (1.35 + particle.speed * 0.2)
                : (1.0 + particle.speed * 0.16);
            ctx.arc(x, y, starRadius, 0, Math.PI * 2);
            ctx.fill();

            if (this.stageNumber === 1 && alpha > 0.34 && twinkle > 0.55) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.75, alpha * 0.9).toFixed(3)})`;
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(x - starRadius * 2.2, y);
                ctx.lineTo(x + starRadius * 2.2, y);
                ctx.moveTo(x, y - starRadius * 2.2);
                ctx.lineTo(x, y + starRadius * 2.2);
                ctx.stroke();
            }
        }
    }
    
    renderCelestialBodies(ctx) {
        // ステージ番号に応じた表示設定
        // 1：5〜10時(明け方〜朝)
        // 2：11〜15時(昼)
        // 3：16〜17時(夕暮れ)
        // 4：18〜20時(夜)
        // 5：室内なので非表示
        // 6：開始時に月が画面中央(3倍)〜直前で日の出(3倍)、ボス戦中は太陽2/3
        
        if (this.stageNumber === 5) return;

        // stageNumberを数値として確実に扱う
        const sn = parseInt(this.stageNumber);
        // 進行度を 0.0 〜 1.0 に厳密にクランプ
        const progress = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        const isTenshuStage = sn === 6;
        
        // 物理的な軌道パラメータ
        const orbitRadiusX = CANVAS_WIDTH * (isTenshuStage ? 0.35 : 0.42);
        // 空補償: 中心yは触らず縦半径だけ縮める＝地平線の出入りの見た目は不変のまま
        // 天頂(南中)の高度をクロップ分だけ下げる。skyVisTop=0 で従来値に一致。
        const skyCrop = this.skyVisTop || 0;
        const orbitRadiusY = this.groundY * (isTenshuStage ? 0.6 : 0.5)
            - skyCrop * (isTenshuStage ? 1.05 : 0.62);
        const orbitCenterX = CANVAS_WIDTH * 0.5;
        const orbitCenterY = this.groundY * 0.95;

        const getX = (theta) => orbitCenterX - Math.cos(theta) * orbitRadiusX;
        const getY = (theta) => orbitCenterY - Math.sin(theta) * orbitRadiusY;

        const drawBody = (cx, cy, r, alpha, coreTop, coreBottom, glowColor) => {
            if (alpha <= 0.001) return;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.globalAlpha = alpha;

            // グロー（本体外縁でピーク、外側にフェード）
            const glowR = r * (isTenshuStage ? 4.8 : (sn === 1 ? 2.25 : 3.2));
            const peakStop = r / glowR; // 本体外縁がグロー最大輝度
            const midStop = Math.min(peakStop + (1 - peakStop) * 0.45, 0.98);
            const glowAlphaScale = sn === 1 ? 0.46 : 1;
            const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
            glow.addColorStop(0, glowColor.replace('ALPHA', (0.15 * glowAlphaScale).toFixed(3)));
            glow.addColorStop(peakStop, glowColor.replace('ALPHA', (0.75 * glowAlphaScale).toFixed(3)));
            glow.addColorStop(midStop, glowColor.replace('ALPHA', (0.18 * glowAlphaScale).toFixed(3)));
            glow.addColorStop(1, glowColor.replace('ALPHA', '0'));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, 0, glowR, 0, Math.PI * 2);
            ctx.fill();

            // 本体（真ん丸）
            const coreGrad = ctx.createLinearGradient(0, -r, 0, r);
            coreGrad.addColorStop(0, coreTop);
            coreGrad.addColorStop(1, coreBottom);
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();

            if (sn === 1) {
                const rim = ctx.createRadialGradient(0, 0, r * 0.58, 0, 0, r);
                rim.addColorStop(0, 'rgba(255, 232, 186, 0)');
                rim.addColorStop(0.82, 'rgba(255, 224, 164, 0.18)');
                rim.addColorStop(1, 'rgba(255, 245, 210, 0.34)');
                ctx.fillStyle = rim;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        };

        // 24時間表記を角度(theta)に変換するヘルパー
        // 太陽用：6時(0/左) -> 12時(PI/2/上) -> 18時(PI/右)
        // 月用：18時(0/左) -> 24時(PI/2/上) -> 6時(PI/右)
        const hourToTheta = (hour, isSun) => {
            if (isSun) {
                return ((hour - 6) / 12) * Math.PI;
            } else {
                // 夜の18時を0、翌朝6時をPIとする
                let h = hour;
                if (h < 6) h += 24; // 0-6時を24-30時として扱う
                return ((h - 18) / 12) * Math.PI;
            }
        };

        if (sn <= 4) {
            let startHour, endHour, isSun = true;
            switch(sn) {
                case 1: startHour = 4.5; endHour = STAGE1_BOSS_SUN_HOUR; break;
                case 2: startHour = 11; endHour = 14; break;
                case 3: startHour = 14.0; endHour = 17.8; break; // 明るい夕方開始〜日没スレスレ
                case 4: startHour = 18.3; endHour = 24; isSun = false; break; // 月の出〜真上(24時)
                default: startHour = 12; endHour = 12; break;
            }

            let currentHour;
            // Stage1の太陽はボス出現フラグでは動かさず、スクロール終端へ連続的につなぐ。
            if (sn === 1) {
                currentHour = this.getStage1SunHour();
            // 旧: ボス出現で sn3 を 17.8時(夕方)・sn4 を 24時に固定していた。
            // ボス戦だけ時刻が飛ぶと「時間の止まった夕方」になり時間帯設計が壊れるため廃止。
            // 進行度連動のままにする(sn3 はボスでオートスクロールが止まるので太陽も自然に止まる)。
            } else {
                currentHour = startHour + (endHour - startHour) * progress;
            }
            
            // 異常な時間経過を防止
            currentHour = Math.max(startHour, Math.min(endHour, currentHour));

            const theta = hourToTheta(currentHour, isSun);
            
            if (isSun) {
                // 物理的に地平線(theta=0/6時)より上がってから描画
                if (currentHour < 6.0) return; 

                const bodyX = getX(theta);
                const bodyY = getY(theta);
                const sunAltitude = Math.sin(theta);
                
                // 太陽のカラー補間（高度に応じて昼の白から夕の赤へ）
                const sunRadius = 45 * (1 + (1 - sunAltitude) * 0.12);
                
                // 昼間の太陽
                const dayTop = '#ffffff';
                const dayBottom = '#fff7dc';
                const dayGlow = sn === 1
                    ? 'rgba(255, 250, 220, ALPHA)'
                    : 'rgba(255, 255, 240, ALPHA)';

                // 夕焼け・朝焼けの太陽
                const warmFactor = 1 - this.smoothstep(0.05, 0.75, sunAltitude);
                const duskTop = '#ffd194';
                const duskBottom = '#ff7a33';
                const duskGlow = sn === 1
                    ? 'rgba(255, 170, 82, ALPHA)'
                    : 'rgba(255, 140, 50, ALPHA)';

                const sunTop = this.interpolateColor(dayTop, duskTop, warmFactor);
                const sunBottom = this.interpolateColor(dayBottom, duskBottom, warmFactor);
                // interpolateColor は rgb() を返すため ALPHA プレースホルダーが消える。
                // RGB 部分だけ補間し、rgba テンプレートを手動で復元する。
                const sunGlowRGB = this.interpolateColor(dayGlow, duskGlow, warmFactor);
                const sunGlow = sunGlowRGB.replace('rgb(', 'rgba(').replace(')', ', ALPHA)');
                
                const appearAlpha = (sn === 1) ? this.smoothstep(6.0, 6.3, currentHour) : 1;
                drawBody(bodyX, bodyY, sunRadius, appearAlpha, sunTop, sunBottom, sunGlow, false);
            } else {
                const bodyX = getX(theta);
                const bodyY = getY(theta);
                drawBody(bodyX, bodyY, 40, 1, '#f8f9fa', '#ced4da', `rgba(240, 248, 255, ALPHA)`, true);
            }
        } else if (sn === 6) {
            // ステージ6: 月(中央〜沈む) -> 仄暗い朝 -> 太陽(日の出〜固定)
            const moonRadius = 140; // 3倍
            const sunRadius = 135;  // 3倍 (140だと少し大きすぎるかもしれないので微調整)

            // 天体は山の稜線より下へ描かない。パノラマは天体より後に描かれるが、
            // 山アセットの上端がαランプなので半透明部を通して月/太陽が透けてしまう。
            // 山が完全不透明になるyで切っておけば、どんなαでも原理的に透けない。
            // (-800 はグロー半径 r*4.8=672px を上側で切らないための余白)
            ctx.save();
            ctx.beginPath();
            const occY = this.getStage6MountainOcclusionY();
            ctx.rect(0, -800, CANVAS_WIDTH, occY + 800);
            ctx.clip();

            // 旧: ボス出現で太陽を最終位置に固定していた(ボス戦=巨大な橙の太陽)。
            // ボスで時刻が飛ぶのをやめ、進行度連動に一本化する。終端では
            // getStage6SunTheta() と同じ位置に自然に到達する。
            {
                // 進行度を分割する (0-0.4:月, 0.4以降:仄暗い朝、終盤スクロールで太陽)。
                // 配分は据え置き。maxProgressを伸ばしたぶん各フェーズの絶対時間が等しく伸びる
                // ため、月も朝も太陽もそれぞれゆっくり移ろう(月だけ伸びて他が縮む問題を回避)。
                if (progress < 0.4) {
                    const localP = progress / 0.4;
                    const theta = Math.PI / 2 + (localP * (Math.PI / 2 + 0.2)); // 中央から沈む
                    const mx = getX(theta);
                    const my = getY(theta);
                    const alpha = 1 - this.smoothstep(0.8, 1.0, localP);
                    drawBody(mx, my, moonRadius, alpha, '#f8f9fa', '#ced4da', `rgba(240, 248, 255, ALPHA)`, true);
                }

                const sunPhase = this.getStage6SunPhase();
                if (sunPhase > 0) {
                    const theta = this.getStage6SunTheta(); // 地平線下から昇り、ボス戦の固定位置へ
                    const sx = getX(theta);
                    const sy = getY(theta);
                    const alpha = this.smoothstep(0, 0.34, sunPhase);
                    drawBody(sx, sy, sunRadius, alpha, '#ffd9b4', '#ff7a33', `rgba(255, 160, 80, ALPHA)`, false);
                }
                // 月が消えた後、太陽が出るまでは何もない「仄暗い朝」
            }
            ctx.restore(); // 稜線クリップを解除
        }
    }
    
    renderEnemies(ctx) {
        // 屋根の裏から跳び上がってくる雑魚は、大棟の線より下を屋根で隠す。
        // (クリップしないと屋根の手前を「下から生えてくる」ように見える)
        const roofLineY = this.isStage6Arena()
            ? this.getStage6ArenaGroundY() + LANE_OFFSET
            : null;
        for (const enemy of this.enemies) {
            if (roofLineY !== null && enemy.stage6RoofEntry) {
                const w = (typeof enemy.getWorldWidth === 'function' ? enemy.getWorldWidth() : enemy.width) || 60;
                ctx.save();
                ctx.beginPath();
                ctx.rect(enemy.x - 200, -400, w + 400, roofLineY + 400);
                ctx.clip();
                enemy.render(ctx);
                ctx.restore();
                continue;
            }
            enemy.render(ctx);
        }
        // Stage6最上階: 開戦前から右端に立って待つ将軍。game.js のボス描画は
        // bossSpawned 前提なので、待機体はワールド空間のこの層で一緒に描く。
        if (this.stage6StandbyBoss) this.stage6StandbyBoss.render(ctx);
    }

    renderObstacles(ctx) {
        if (this.stageNumber === 4) {
            this.renderStage4ClimbPlatforms(ctx);
        }
        for (const obs of this.obstacles) {
            if (this.stageNumber === 3 && obs.type === OBSTACLE_TYPES.ROCK) {
                ctx.save();
                ctx.filter = 'brightness(0.74) sepia(0.18) saturate(0.72) contrast(0.93) hue-rotate(-6deg)';
                obs.render(ctx);
                ctx.restore();
                continue;
            }
            obs.render(ctx);
        }
    }

    renderStage4ClimbPlatforms(ctx) {
        const platforms = this.getStage4ClimbPlatformColliders(this.progress - 120, this.progress + CANVAS_WIDTH + 160);
        for (const platform of platforms) {
            const image = this.stage4TownImages?.[platform.imageKey];
            if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) continue;

            ctx.save();
            ctx.globalAlpha = 0.96;
            ctx.filter = 'brightness(0.84) saturate(0.78) contrast(0.92)';
            ctx.drawImage(image, platform.drawX, platform.drawY, platform.drawWidth, platform.drawHeight);
            ctx.restore();
        }
    }
    
    renderBossUI(ctx) {
        if (!this.boss) return;

        // 登場演出中は隠し、開戦(ready)で上からスライドインする。
        // bossUiRevealT は updateBossIntro が 0→1 に動かす。
        const reveal = (this.bossIntroPhase || this.bossDefeated)
            ? this.clamp01(this.bossUiRevealT || 0)
            : 1;
        if (reveal <= 0.001) return;

        // 名前は登場札で一度だけ見せ、戦闘中は紋とゲージだけにする。
        // 同じ名前を中央演出とHUDで二重に読ませないための役割分担。
        const barWidth = Math.min(520, SCREEN_WIDTH - 110);
        const barHeight = 13;
        // HUD はスクリーン空間なので中心は SCREEN_WIDTH 基準。
        // (旧実装は CANVAS_WIDTH/2 だったため、ワールド幅と実画面幅が異なる端末で
        //  ボス名とHPバーが左に寄っていた)
        const x = (SCREEN_WIDTH - barWidth) / 2;
        const y = 49;
        const radius = barHeight / 2;

        const bossHpRatio = Math.max(0, this.boss.hp / this.boss.maxHp);

        ctx.save();
        // スライドイン（上から降りて定位置へ）。easeOutCubic。
        if (reveal < 1) {
            const e = 1 - Math.pow(1 - reveal, 3);
            ctx.globalAlpha = reveal;
            ctx.translate(0, -(1 - e) * 46);
        }

        // 背景（トラック）
        ctx.save();
        const drawRoundedRectPath = (px, py, w, h, r) => {
            const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
            ctx.beginPath();
            ctx.moveTo(px + rr, py);
            ctx.lineTo(px + w - rr, py);
            ctx.arcTo(px + w, py, px + w, py + rr, rr);
            ctx.lineTo(px + w, py + h - rr);
            ctx.arcTo(px + w, py + h, px + w - rr, py + h, rr);
            ctx.lineTo(px + rr, py + h);
            ctx.arcTo(px, py + h, px, py + h - rr, rr);
            ctx.lineTo(px, py + rr);
            ctx.arcTo(px, py, px + rr, py, rr);
            ctx.closePath();
        };

        const trackGrad = ctx.createLinearGradient(x, y, x, y + barHeight);
        trackGrad.addColorStop(0, 'rgba(23, 30, 52, 0.88)');
        trackGrad.addColorStop(1, 'rgba(11, 16, 30, 0.9)');
        drawRoundedRectPath(x, y, barWidth, barHeight, radius);
        ctx.fillStyle = trackGrad;
        ctx.fill();

        // 中身（フィルのグラデーション：赤〜紫系でボス感を強調）
        if (bossHpRatio > 0) {
            const fillWidth = barWidth * bossHpRatio;
            const fillGrad = ctx.createLinearGradient(x, y, x + fillWidth, y);
            fillGrad.addColorStop(0, '#ff3344');
            fillGrad.addColorStop(0.5, '#ff5566');
            fillGrad.addColorStop(1, '#ff3344');
            
            drawRoundedRectPath(x + 1, y + 1, Math.max(1, fillWidth - 2), barHeight - 2, radius - 1);
            ctx.fillStyle = fillGrad;
            ctx.fill();
        }

        // 光沢エフェクト
        drawRoundedRectPath(x + 1.5, y + 1.5, barWidth - 3, Math.max(1, barHeight * 0.34), radius - 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fill();

        // 外枠
        drawRoundedRectPath(x, y, barWidth, barHeight, radius);
        ctx.strokeStyle = 'rgba(255, 120, 120, 0.42)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // 漆器の継ぎ目のような五分割。HP量を邪魔しない極細線だけを置く。
        ctx.strokeStyle = 'rgba(8, 10, 17, 0.68)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
            const sx = x + barWidth * i / 5;
            ctx.beginPath();
            ctx.moveTo(sx, y + 2);
            ctx.lineTo(sx, y + barHeight - 2);
            ctx.stroke();
        }
        ctx.restore();

        ctx.restore(); // スライドインの復元
    }
    
    // 全敵を取得
    getAllEnemies() {
        const all = [...this.enemies];
        if (this.boss && this.boss.isAlive) {
            all.push(this.boss);
        }
        return all;
    }

    /**
     * 影を落とす対象。戦闘対象ではない待機中の将軍も影だけは落とす
     * (開戦の瞬間に足元の影がポンと現れるのを防ぐ)。
     */
    getShadowCasters() {
        // 屋根の裏から跳び上がっている最中は影を落とさない
        // (実体が棟の向こう側にいるので、手前の屋根面に影が出ると位置が破綻する)
        const all = this.getAllEnemies().filter(e => !e || !e.stage6RoofEntry);
        if (this.stage6StandbyBoss) all.push(this.stage6StandbyBoss);
        return all;
    }
    
    isCleared() {
        return this.bossSpawned && this.bossDefeated && this.bossDefeatLingerTimer <= 0;
    }
}
