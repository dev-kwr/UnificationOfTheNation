// ============================================
// Unification of the Nation - ゲームコア
// ============================================

import { CANVAS_WIDTH, SCREEN_WIDTH, CANVAS_HEIGHT, GAME_STATE, STAGES, DIFFICULTY, OBSTACLE_TYPES, PLAYER, STAGE_DEFAULT_WEAPON, LANE_OFFSET, STAGE5_FLOOR, STAGE6_CORNER, UI_SIZE_ANCHOR, getDeviceProfile, setUiScaleFromFitScale, setCornerInsets, setNotchInsetX, setVirtualPadVisible, setBgmButtonVisible, isTouchOverlayMode } from './constants.js?v=screen-safe-20260815n';
import { BOSS_STAGING } from './bossStaging.js?v=screen-safe-20260815n';
import { isUpdateAvailable, applyUpdate, checkForUpdate } from './appUpdate.js?v=screen-safe-20260815n';
import { getStageSelectLayout, renderStageSelect, STAGE_SELECT_ORDER } from './stageSelect.js?v=screen-safe-20260815n';
import { clearFilteredImageCache, getFilteredImageCacheStats } from './filteredImage.js?v=screen-safe-20260815n';
import { BonusStage, BONUS_STAGE_IMAGES } from './bonusStage.js?v=screen-safe-20260815n';
import { TrainingStage, TRAINING_STAGE_IMAGES } from './trainingStage.js?v=screen-safe-20260815n';
import { sideBestKey, normalizeSideBests, getSideBest } from './sideStageCommon.js?v=screen-safe-20260815n';
import { preloadImages, areImagesSettled } from './imageCache.js?v=screen-safe-20260815n';
import { readPhysicalScreen, computeScreenWidth } from './screenGeometry.js?v=screen-safe-20260815n';
import { input } from './input.js?v=screen-safe-20260815n';

// 最上層の会敵歩行の速度倍率。決戦前の一歩を重くするため通常より遅く歩かせる。
const STAGE6_APPROACH_SPEED_SCALE = 0.46;   // 会敵歩行の速さ(通常歩行に対する比)
// 会敵〜開戦の間だけカメラを先へ出す量。追従のままだとプレイヤーは常に画面48%に
// 居るため、将軍との間合いを画面いっぱいに開けない(実測281px)。カメラを先行させると
// プレイヤーが左寄りに立ち、金鯱と将軍を右に置いた「端と端」の構図になる。
// 最上層へ飛び乗る放物線の頂点の高さ。鎖鎌で引き上げられた勢いのまま画面の上へ
// 抜け、暗転が明けた時点ではまだ画面外に居て、そこから屋根へ落ちてくる形にする。
// 最上層へ上がる時の跳び上がりの高さ。屋根の裏(向こう側の斜面)で待ってから
// 大棟を越えて飛び乗る。頂点は棟より約114px上、着地は約11px/frameの柔らかい落ち。
const STAGE6_ARENA_ENTRY_PEAK_PX = 222;
// 待っている深さ(足元が大棟の線より何px下か)。ここに居る間は屋根でクリップされて
// 見えないので、暗転が明けても「まだ屋根の向こう側」に見える。
const STAGE6_ARENA_ENTRY_DEPTH_PX = 150;
// 登りながら大棟へ寄る横距離。【三層目で登った側=屋根の左端】から上がって
// 着地点まで詰める。起点は画面外(カメラ左端より外)に置くので、棟を越えるのは
// ちょうど屋根の左端あたりになる(実測: 左端27480に対し27437で棟を越える)。
const STAGE6_ARENA_ENTRY_RUN_PX = 900;
// アーク全体のうち、画面外で待つ割合。暗転(待ち650+フェード450)が明けきるのが
// t=(650+450)/1800=0.611 なので、そこから登り始める。
const STAGE6_ARENA_ENTRY_HOLD_T = 0.61;
// 暗転が明けきってから屋根へ落ちてくるまでの尺。遷移(暗転待ち+フェードイン)に
// これを足した長さがアーク全体になる。実測: 明けた直後 t=0.72 の時点でまだ画面外、
// t=0.75 で上端を越え、残り 0.25(約380ms)で屋根へ落ちて着地する。
const STAGE6_ARENA_ENTRY_FLYIN_MS = 700;
const STAGE6_DUEL_CAMERA_LEAD_PX = 300; // 会敵歩行中の既定の先行量
const STAGE6_DUEL_LEAD_IN_MS = 1400;   // 先行の入り(歩き出しから)
const STAGE6_DUEL_LEAD_OUT_MS = 1400;   // 開戦後に通常追従へ戻す
// 着地〜名乗りは【名乗り帯に対して左右対称】に構える。帯の中心は常に画面中心
// (SCREEN_WIDTH*0.5 = ワールド換算 CANVAS_WIDTH/2)なので、両者の中心の中点を
// 画面中心へ置く = 先行量を「中心間距離の半分」にすればよい。
// 対称位置への寄せは【臨界減衰】で行う(オーバーシュートなし・開始速度0)。
// 一次遅れ(指数)だと目標が切り替わった最初のフレームで 8.9px/frame の速度段差が
// 出て「ガクっ」に戻る。ω=12rad/s なら最大でも 5.4px/frame、両端の速度は0で、
// ボスが足を止めてから名乗りまでの実測483msで残差1.5pxまで収束する。
const STAGE6_DUEL_LEAD_OMEGA = 12;
const STAGE6_DUEL_LEAD_MAX_PX = 460;    // 先行量の上限(異常な間合いでカメラが飛ばない保険)
import { Player } from './player.js?v=screen-safe-20260815n';
import { createSubWeapon } from './weapon.js?v=screen-safe-20260815n';
import { Stage, preloadStageImages, prefetchStageImages, areStageImagesSettled } from './stage.js?v=screen-safe-20260815n';
import { GRAPPLE_PHASE } from './stage6Grapple.js?v=screen-safe-20260815n';
import { UI, renderTitleScreen, renderTitleDebugWindow, renderGameOverScreen, renderStatusScreen, renderStageClearAnnouncement, renderLevelUpChoiceScreen, getLevelUpChoiceLayout, renderSideResultScreen, getSideResultLayout, renderPauseScreen, getPauseReturnButton, getPauseMapButton, renderGameClearScreen, renderIntro, renderEnding, getTitleScreenLayout, getStatusScreenLayout, getTitleDebugLayout, getUpdateModalLayout, renderBossNameBanner, getBossNameBannerBox } from './ui.js?v=screen-safe-20260815n';
import { CollisionManager, checkPlayerEnemyCollision, checkEnemyAttackHit } from './collision.js?v=screen-safe-20260815n';
import { saveManager } from './save.js?v=screen-safe-20260815n';
import { shop } from './shop.js?v=screen-safe-20260815n';
import { audio } from './audio.js?v=screen-safe-20260815n';
import { ShadowRenderer } from './shadow.js?v=screen-safe-20260815n';
import { applyShogunCombat } from './shogunCombatHelper.js?v=screen-safe-20260815n';
import { getRockVisualPalette } from './obstacle.js?v=screen-safe-20260815n';

// 端末ディスプレイの角丸推定（updateCornerInsets が使う）。
// R ≒ 画面短辺 × 11%。退避量はコーナー円の幾何最小 0.293R に円形ボタンぶんの
// 余裕を上乗せした 0.38R。ここだけを触れば角の詰まり具合を調整できる。
const CORNER_RADIUS_RATIO = 0.11;
const CORNER_CLEARANCE_RATIO = 0.38;

// 背景アセットのロード待ちの上限(ms)。これを超えたら揃っていなくても開始する
// （回線不良や404で永久に暗転したままにならないための打ち切り）。
const STAGE_ASSET_WAIT_MAX_MS = 4000;
// ステージ開始から次ステージの先読みを始めるまでの猶予(ms)。
const NEXT_STAGE_PREFETCH_DELAY_MS = 5000;
// 地図⇔ステータスの暗転（片道の秒数。往復でこの2倍）。
// 長いと待たされる画面切替になるので、切り替わりの角が取れる最小限にする。
const SCREEN_FADE_SEC = 0.17;
// ボス部屋の名乗りの定位置。プレイヤーの右端と名乗り帯の左端の間合い(可視ワールドpx)。
const BOSS_NAME_STAND_GAP_PX = 28;
// 定位置で足を止めた後、カメラだけでボス部屋の framing まで詰める寄り(ω と最低速度)。
// ω=8 は約0.5秒で見た目に到達する臨界寄り。最低速度は残りが小さい時の収束保証。
const BOSS_ROOM_PAN_OMEGA = 8;
const BOSS_ROOM_PAN_MIN_SPEED = 140;
// ステータス画面の選択肢のうち「地図に戻る」の位置。下の3択(忍具/よろず屋/準備完了)の
// 次＝左右キーで 準備完了 → 地図に戻る → 忍具 と一周する。描画(ui.js)と共有する。
const STATUS_MENU_MAP_BACK = 3;

const DAMAGE_NUMBER_DESCENT_FADE_MIN_SPAN = 24;
const DAMAGE_NUMBER_GROUND_Y_OFFSET = 2;
// 物理・攻撃更新を60fps基準に揃える検証用フラグ。
// falseに戻すと従来どおりrequestAnimationFrameの可変dtで更新する。
const USE_FIXED_TIMESTEP = true;
const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_FIXED_UPDATES_PER_FRAME = 4;

function createRockShardPoints(pointCount, aspect) {
    const points = [];
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < pointCount; i++) {
        const angle = start + (i / pointCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.42;
        const radius = 0.58 + Math.random() * 0.46;
        points.push({
            x: Math.cos(angle) * radius * aspect,
            y: Math.sin(angle) * radius
        });
    }
    return points;
}

class Game {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.state = GAME_STATE.TITLE;
        this.pauseReturnState = GAME_STATE.PLAYING;
        this.pauseReturnArmed = false;      // ポーズの「タイトルに戻る」2タップ確認状態
        this.pauseReturnArmedTimer = 0;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.useFixedTimestep = USE_FIXED_TIMESTEP;
        this.fixedUpdateAccumulator = 0;
        this.didRunUpdateThisFrame = false;
        
        // ゲームオブジェクト
        this.player = null;
        this.stage = null;
        this.bombs = [];
        this.effects = [];
        this.hitEffects = [];
        this.maxHitEffects = 220;
        this.lastHitFeedbackAtMs = 0;
        this.hitFeedbackIntervalMs = 34;
        this.frameDamageHitCount = 0;
        this.frameDamageVisualCount = 0;
        this.lastDamageSfxAtMs = 0;
        this.damageSfxIntervalMs = 44;
        this.expGems = [];
        this.stageBossDefeatEffects = [];
        
        // 武器情報
        this.unlockedWeapons = [];
        this.currentWeaponIndex = 0;
        
        // 難易度（追加）
        this.difficulty = DIFFICULTY.NORMAL;
        this.difficultyKeys = Object.keys(DIFFICULTY);
        
        // タイトル画面用
        this.titleMenuIndex = 0; // 0: Start/Continue, 1: New Game
        this.hasSave = false;
        this.titleSaveCheckTimerMs = 0;
        
        this.difficultyIndex = 1; // NORMAL
        
        // ステージ情報
        this.currentStageNumber = 1;
        this.stage3AutoScrollBaseSpeed = 66; // px/s（Stage3専用の標準自動横スクロール速度）
        this.stage3AutoScrollSpeed = this.stage3AutoScrollBaseSpeed; // 難易度で補正
        
        // 地面の高さ
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        
        // UI
        this.ui = new UI();
        
        // 当たり判定マネージャー
        this.collisionManager = new CollisionManager();
        
        // ダメージ数値エフェクト
        this.damageNumbers = [];
        this.maxDamageNumbers = 44;
        
        // クリア時の武器
        this.clearedWeapon = null;
        
        // 演出用
        this.screenShakeEnabled = false; // 一時的に全体の画面揺れを無効化
        this.hitStopEnabled = false; // 一時的に全体のヒットストップを無効化
        this.shakeIntensity = 0;
        this.maxShakeIntensity = 9.0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;

        // 縦追従カメラ (P2b): 世界ズーム時の上部クロップを高所で動的に回復するリフト量。
        // z=1(SCREEN_WIDTH=1280)の端末では可動域0で常に無効。
        this.cameraLift = 0;
        this.cameraLiftTarget = 0;
        this._prefersReducedMotion = (typeof window !== 'undefined' && window.matchMedia)
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;
        // 低スペック検知(持続的なフレーム落ち)でタッチ端末のDPR上限を1.5→1.25へ降格
        this._dprDowngraded = false;
        this._slowFrameAccumSec = 0;
        this.shakeSampleTimerMs = 0;
        this.shakeSampleIntervalMs = 33;
        this.hitStopTimer = 0;
        this.introTimer = 0; // 追加
        this.gameClearTimer = 0;
        this.endingTimer = 0;
        this.lastAttackSignature = null;
        this.pendingLevelUpChoices = 0;
        // this.levelUpChoiceIndex = 0; // フェードアウト完了まで位置を維持
        this.levelUpInputLockMs = 0;
        this.levelUpRequireRelease = false;
        this.levelUpConfirmCooldownMs = 0;
        this.stageClearMenuIndex = 0;
        this.stageClearWeaponIndex = 0;
        this.returnToStageClearAfterShop = false;
        // ボス部屋の寄り(updateBossRoomCameraPan)を一度始めたら最後まで送るための latch
        this.bossRoomPanArmed = false;
        // ステージセレクト（全体マップ）。カーソル＝選択中ノードid、
        // pendingStageSelection＝ステータス画面が保持する「次に始めるステージ」、
        // maxClearedStage＝クリア済みの最深階層（解放判定とセーブの正本）。
        this.stageSelectCursor = 1;
        this.pendingStageSelection = null;
        this.maxClearedStage = 0;
        // 地図⇔ステータスの暗転。背景画像がまるごと入れ替わる切替なので、
        // 挟まずに差し替えると画面が飛んだように見える(実機フィードバック 2026-08-12)。
        // phase 0=なし / 1=暗くなる / 2=明るくなる。pending は暗転の底で走らせる処理。
        this.screenFade = { phase: 0, alpha: 0, pending: null };
        // ステータス画面が「地図から来たか」。毎フレーム pendingStageSelection を
        // 見ると、準備完了を押した瞬間に false へ落ちて操作説明の行が一瞬詰まる
        // (ちらつきの正体)。画面に入った時点で決めて、出るまで変えない。
        this.statusCanGoBack = false;
        // 小判蔵の補充状態。入ると空になり、本編ステージをどこか踏破すると補充される
        // （無限に小判を稼げるとゲームバランスが壊れる、と実機フィードバック）。
        this.playerDefeatTimer = 0;
        this.playerHurtFlashAlpha = 0; // 被弾時の赤ビネット（実ダメージ時のみ点灯・renderで減衰）
        this.playerDefeatDuration = 1800;
        this.titleDebugOpen = false;
        this.titleDebugCursor = 0;
        this.titleDebugApplyOnStart = false;
        this.titleDebugConfig = this.createTitleDebugConfig();
        this.stage6CornerTransitionHold = null;
        // 最上層へ上がる放物線着地(鎖鎌の引き上げの続き)。遷移中だけ立つ
        this.stage6ArenaEntryArc = null;
        // 着地から開戦までの自動操作(会敵歩行)
        this.stage6ArenaApproach = null;
        this.stage6CameraLeadT = 0;   // 決戦構図のカメラ先行(0..1)
        this.stage6DuelLeadPx = STAGE6_DUEL_CAMERA_LEAD_PX;       // 先行量の現在値(px)
        this.stage6DuelLeadTargetPx = STAGE6_DUEL_CAMERA_LEAD_PX; // 同 目標値
        this.stage6DuelLeadVel = 0;                               // 同 速度(臨界減衰)
        this.debugBossRoomStart = false; // デバッグ用：ボス部屋から開始するフラグ
        this.debugStage6Corner3Start = false; // デバッグ用：三層目ラスト(鎖鎌の手前)から開始
        this.debugKeyRepeatTimer = 0;
        this.stageClearPhase = 0; // 0: 演出(Announce), 1: 詳細ステータス
        this.stageClearAutoSubWeaponIntervalMs = 3000;
        this.stageClearAutoSubWeaponTimerMs = 520;
        this.stageClearAutoSubWeaponPauseMs = 0;
        this.levelUpChoices = [];
        this.flashAlpha = 0;
        // ボス撃破演出のタイムライン(ms)。spawnStageBossDefeatEffect で立ち上げ、
        // gameLoop 側で hitStop → slow の順に消費する。クロージングは描画のみ。
        this.bossDefeatHitStopMs = 0;
        this.bossDefeatSlowMs = 0;
        this.bossDefeatClosingMs = 0;
        this.levelUpAlpha = 0;
        this.levelUpTransitionDir = 0;
        this.stageTransitionTimer = 0;
        this.stageTransitionPhase = 0; // 0: None, 1: FadeOut, 2: Wait, 3: FadeIn
        // 背景アセットのロード待ち（{ stageNumber, waitMs } / 待ちなしは null）
        this.pendingStageStart = null;
        // 次ステージ先読みの開始までの残り時間(ms)。0 以下で発火済み/未予約。
        this._nextStagePrefetchMs = 0;
        this._prefetchedStageNumber = 0;
        this._prefetchedTitleStage = false;
        
        // よろず屋（購入スキル/強化段階の正本）。save.js が `game.shop` 経由で
        // 参照するため、シングルトンをここで保持する。未設定だと購入内容が
        // セーブされず、「続きから」で二段跳び・韋駄天・剛力が消える。
        this.shop = shop;

        // 影レンダー
        this.shadowRenderer = new ShadowRenderer();
        
        // 垂直スクロール用（Stage 5などで使用）
        this.cameraY = 0;
    }
    
    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // レスポンシブ描画設定
        canvas.style.objectFit = 'contain';
        canvas.style.touchAction = 'none';
        canvas.tabIndex = 0;
        // 起動時も container を実表示領域へ合わせてから canvas を組む
        // （CSS の 100dvh は iOS の起動直後だと回転前の値のことがある）。
        this.syncContainerToViewport();
        this.configureCanvasResolution();

        // 入力管理にキャンバスを渡す（タッチ座標用）
        input.setCanvas(canvas);

        // リサイズイベント
        this.handleViewportResize = () => {
            // container(CSS由来の 100vw/100dvh)を先に実表示領域へ合わせてから canvas を組む。
            // 以前はここで container を同期しておらず、回転直後の古い container を基準に
            // canvas を作ってしまう経路が残っていた。
            this.syncContainerToViewport();
            this.configureCanvasResolution();
        };
        // iOS等では orientationchange/resize 直後に画面寸法が確定せず、
        // 回転前（縦向き）のキャンバスサイズが残ってしまうことがある。
        // 即時に加えて次フレーム・遅延後にも再計算し、確定した寸法へ確実に追従させる。
        this.scheduleViewportResize = () => {
            this.handleViewportResize();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(this.handleViewportResize);
            }
            if (this._viewportResizeTimers) {
                this._viewportResizeTimers.forEach(id => clearTimeout(id));
            }
            this._viewportResizeTimers = [120, 320, 600].map(ms => setTimeout(this.handleViewportResize, ms));
        };
        this.handleWindowFocus = () => {
            this.scheduleViewportResize();
        };
        window.addEventListener('resize', this.scheduleViewportResize);
        window.addEventListener('orientationchange', () => {
            // 回転アニメ中(レイアウト未確定)の被弾を防ぐため自動ポーズ (P3)
            this.autoPauseIfPlaying();
            this.scheduleViewportResize();
        });
        window.addEventListener('focus', this.handleWindowFocus);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // バックグラウンドでの無防備な進行を防ぐ(Androidの分割画面等ではrAFが
                // 止まらないケースがある)。既存のポーズ機構をそのまま使う (P3)
                this.autoPauseIfPlaying();
            } else {
                this.handleWindowFocus();
            }
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.scheduleViewportResize);
            window.visualViewport.addEventListener('scroll', this.handleViewportResize);
        }

        // rAF ループが止まる環境/タイミング（回転アニメ中・タブ復帰直後など）の保険として、
        // 低頻度ポーリングでもビューポート同期を行う。ensureViewportSync は変化検知で
        // 早期 return するため、変化がなければほぼノーコスト。
        if (this._viewportPollTimer) clearInterval(this._viewportPollTimer);
        this._viewportPollTimer = setInterval(() => this.ensureViewportSync(), 250);

        // 折りたたみ展開等で「起動時に固定したスクリーン幅」と実画面が乖離した場合の
        // 再読み込み案内 (P4)。screen基準(URLバーの伸縮に非反応)・ゲーム中は出さない・
        // 強制リロードしない・1セッション1回だけ。
        // 起動時の物理スクリーン寸法を控える。checkAspectDrift はこれと現在値の差だけを見る。
        this._bootScreen = readPhysicalScreen();
        this._aspectMismatchSince = 0;
        this._aspectToastShown = false;
        if (this._aspectWatchTimer) clearInterval(this._aspectWatchTimer);
        this._aspectWatchTimer = setInterval(() => this.checkAspectDrift(), 1000);
        
        // 敵AIなどがスクロール情報を参照できるようにグローバルに公開
        window.game = this;

        this.debugStartStage = this.getDebugStartStageFromUrl();
        this.debugStartPoint = this.getDebugStartPointFromUrl();
        this.debugStartAtMap = this.getDebugStartAtMapFromUrl();

        // タイトルBGM再生
        audio.playBgm('title');

        // Chrome対策: 初回のユーザー操作でオーディオコンテキストを再開
        const resumeAudio = () => {
            audio.resume();
            window.removeEventListener('click', resumeAudio);
            window.removeEventListener('keydown', resumeAudio);
            window.removeEventListener('touchstart', resumeAudio);
        };
        window.addEventListener('click', resumeAudio);
        window.addEventListener('keydown', resumeAudio);
        window.addEventListener('touchstart', resumeAudio);

        // デバッグ用: ?map=1 / ?map=all でタイトルとイントロを飛ばし、
        // セレクト画面から起動する（getDebugStartAtMapFromUrl 参照）。
        if (this.debugStartAtMap) {
            this.startNewGame();   // ?stage=N も効く（その手前まで踏破済み扱いになる）
            if (this.debugStartAtMap === 'all') {
                this.maxClearedStage = STAGES.length;
            }
            this.enterStageSelect();
        }
    }

    // 表示領域から fitScale を出す単一導出。configureCanvasResolution が実際に使う式と、
    // ensureViewportSync の「今の canvas は正しい大きさか」の照合が必ず一致するように、
    // ここだけに置く（式を複製すると自己修復の判定がすり抜ける）。
    computeFitScale(availableWidth, availableHeight) {
        return Math.max(0.1, Math.min(
            availableWidth / SCREEN_WIDTH,
            availableHeight / CANVAS_HEIGHT
        ));
    }

    configureCanvasResolution() {
        if (!this.canvas || !this.ctx) return;

        const container = this.canvas.parentElement;
        const containerWidth = container ? container.clientWidth : 0;
        const containerHeight = container ? container.clientHeight : 0;
        const viewportWidth = Math.floor(
            (window.visualViewport && window.visualViewport.width) ||
            window.innerWidth ||
            document.documentElement.clientWidth ||
            SCREEN_WIDTH
        );
        const viewportHeight = Math.floor(
            (window.visualViewport && window.visualViewport.height) ||
            window.innerHeight ||
            document.documentElement.clientHeight ||
            CANVAS_HEIGHT
        );
        // 実表示領域は visualViewport(＝実際に見えている矩形)を最優先する。
        // container は CSS の 100vw/100dvh 由来で、iOS の起動直後や回転直後は
        // 回転前の値が残ることがある。ここで max を取ると「大きい方」＝古い値に
        // 引っ張られ、canvas が画面より大きく作られて端が切れる
        // （スマホ起動時にごく稀にクロップして見える原因）。
        const availableWidth = Math.max(1, viewportWidth || containerWidth);
        const availableHeight = Math.max(1, viewportHeight || containerHeight);

        // 極端に小さい（あるいはバグった）値を無視するための安全策
        if (availableWidth < 100 || availableHeight < 100) return;

        const fitScale = this.computeFitScale(availableWidth, availableHeight);
        // HUD/仮想パッドの物理サイズアンカーを更新（タッチ端末のみ>1になる）
        setUiScaleFromFitScale(fitScale);

        // 一律の端退避は下の updateCornerInsets（角丸クリアランス）だけで決める。
        // env(safe-area-inset-left/right) は「ノッチ/Dynamic Island の帯幅」としてのみ
        // 使う（横向きでは画面の縦中央にしか無いので、縦に大きい左上HUDだけが避ける）。
        // 左右は横持ちの向きで入れ替わるうえ iOS は対称に返すため、大きい方を採る。
        if (container && typeof getComputedStyle === 'function') {
            try {
                const cs = getComputedStyle(container);
                const readPx = (name) => {
                    const v = parseFloat(cs.getPropertyValue(name));
                    return Number.isFinite(v) ? v : 0;
                };
                setNotchInsetX(Math.max(readPx('--sai-l'), readPx('--sai-r')) / fitScale);
            } catch { /* 非致命 */ }
        }

        const cssWidth = Math.max(1, Math.floor(SCREEN_WIDTH * fitScale));
        const cssHeight = Math.max(1, Math.floor(CANVAS_HEIGHT * fitScale));
        this.updateCornerInsets(fitScale, availableWidth - cssWidth, availableHeight - cssHeight);
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;

        const isTouchDevice = getDeviceProfile().isTouchDevice;
        const dprCap = isTouchDevice ? (this._dprDowngraded ? 1.25 : 1.5) : 2.0;
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap));
        const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
        const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
        if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
            this.canvas.width = backingWidth;
            this.canvas.height = backingHeight;
        }

        this.ctx.setTransform(
            backingWidth / SCREEN_WIDTH,
            0,
            0,
            backingHeight / CANVAS_HEIGHT,
            0,
            0
        );
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = isTouchDevice ? 'medium' : 'high';
    }

    // 端末のディスプレイ角丸に UI が食われないための退避量を決める。
    //
    // env(safe-area-inset-*) は Android の多くで 0 を返す（ノッチ相当が無い＝
    // 角丸は申告されない）ため、セーフエリアだけに頼ると角の UI が欠ける。
    // コーナー R も JS からは読めないので、画面短辺の比率から推定する
    // （実測レンジ: スマホ 40〜55css-px ≒ 短辺の 11〜13%）。
    //
    // 角丸を避けるのに必要な二辺同時の退避量 d は、コーナー円の内側条件
    // (R-d)² + (R-d)² ≦ R² を解いて d ≧ R(1-1/√2) ≒ 0.293R。円形ボタンの
    // 曲面ぶんの余裕を見て 0.38R を採る（下の CORNER_CLEARANCE_RATIO）。
    // レターボックスの黒帯があるぶんはすでに逃げているので差し引く。
    updateCornerInsets(fitScale, letterboxW, letterboxH) {
        const p = getDeviceProfile();
        // 角丸を持つのはタッチ端末のみ。かつ fitScale が UI_SIZE_ANCHOR 以上＝
        // 画面が十分大きい端末(iPad等)は UI 拡大もしない＝従来ピクセル不変を守る。
        if ((!p.isTouchDevice && !p.isMobileUA) || !(fitScale > 0) || fitScale >= UI_SIZE_ANCHOR) {
            setCornerInsets(0, 0);
            return;
        }
        const screen = readPhysicalScreen();
        const shortEdgeCss = screen ? screen.short : (CANVAS_HEIGHT * fitScale);
        const cornerR = Math.max(24, Math.min(56, shortEdgeCss * CORNER_RADIUS_RATIO));
        const clearance = cornerR * CORNER_CLEARANCE_RATIO;
        // letterbox は左右/上下の合計。片側ぶんへ直して差し引く。
        const gapX = Math.max(0, letterboxW) / 2;
        const gapY = Math.max(0, letterboxH) / 2;
        setCornerInsets(
            Math.max(0, clearance - gapX) / fitScale,
            Math.max(0, clearance - gapY) / fitScale
        );
    }

    // ゲームループから毎フレーム呼ぶ軽量チェック。表示サイズ/DPRの変化を
    // 検知したらキャンバス解像度を再構成する。orientationchange/resize が
    // 発火しない・遅延する環境(iOS横回転など)でも、ループで必ず追従させる保険。
    ensureViewportSync() {
        if (!this.canvas || !this.ctx) return;
        const vv = window.visualViewport;
        const vw = Math.floor((vv && vv.width) || window.innerWidth || 0);
        const vh = Math.floor((vv && vv.height) || window.innerHeight || 0);
        const ot = vv ? Math.round(vv.offsetTop) : 0;
        const ol = vv ? Math.round(vv.offsetLeft) : 0;
        const dpr = window.devicePixelRatio || 1;
        const unchanged = (vw === this._syncW && vh === this._syncH && dpr === this._syncDpr
            && ot === this._syncOT && ol === this._syncOL);
        // 寸法が動いていなくても、canvas の実サイズが今の表示領域と食い違っていれば直す。
        // 起動直後に一度ズレると以後どのイベントも発火せず、そのまま固まってしまうため
        // （実機で「たまに変なクロップで起動し、回転し直すと直る」の再発防止）。
        if (unchanged && !this.isCanvasSizeStale(vw, vh)) return;
        this._syncW = vw;
        this._syncH = vh;
        this._syncDpr = dpr;
        this._syncOT = ot;
        this._syncOL = ol;
        this.syncContainerToViewport();
        this.configureCanvasResolution();
    }

    // 今の表示領域に対して canvas の CSS サイズが正しいか。
    // configureCanvasResolution と同じ式(computeFitScale)・同じ丸めで突き合わせる。
    isCanvasSizeStale(viewportWidth, viewportHeight) {
        if (!this.canvas) return false;
        if (!(viewportWidth >= 100 && viewportHeight >= 100)) return false;
        const fitScale = this.computeFitScale(viewportWidth, viewportHeight);
        const w = Math.max(1, Math.floor(SCREEN_WIDTH * fitScale));
        const h = Math.max(1, Math.floor(CANVAS_HEIGHT * fitScale));
        return this.canvas.style.width !== `${w}px` || this.canvas.style.height !== `${h}px`;
    }

    // 案内を出す条件は「再読み込みすれば実際に表示が変わる」ことに限る。
    // 旧実装は実アスペクト比と SCREEN_WIDTH/CANVAS_HEIGHT を比べていたため、
    // computeScreenWidth の下限クランプ(=CANVAS_WIDTH)に張り付く端末では捨てられた差が
    // そのまま乖離として計上され、何も操作していなくても常時発火した(4:3〜1.44 の iPad は
    // 素の計算値が 960〜1036 で全機種が下限に張り付き、乖離 19〜25%)。しかも再読み込みしても
    // 同じクランプがかかって値は変わらないので、案内自体が無効だった。
    checkAspectDrift() {
        if (this._aspectToastShown) return;
        const p = getDeviceProfile();
        if (!p.isTouchDevice && !p.isMobileUA) return;
        const boot = this._bootScreen;
        const now = readPhysicalScreen();
        if (!boot || !now) return;
        // 物理スクリーンが起動時から変化していないなら、案内する理由がない。
        if (now.long === boot.long && now.short === boot.short) {
            this._aspectMismatchSince = 0;
            return;
        }
        // 変化していても、新しい寸法で引き直したスクリーン幅が現在値と実質同じなら
        // 再読み込みしても表示は変わらない(両者ともクランプ端に居る場合など)。
        // 16px = 世界ズーム z の差 1.25% 未満。偶数丸めの最小刻み(2px)との区別も付く。
        const next = computeScreenWidth(now, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (Math.abs(next - SCREEN_WIDTH) < 16) {
            this._aspectMismatchSince = 0;
            return;
        }
        if (!this._aspectMismatchSince) this._aspectMismatchSince = Date.now();
        const stable = Date.now() - this._aspectMismatchSince > 3000;
        if (stable && this.state !== GAME_STATE.PLAYING) {
            this._aspectToastShown = true;
            // 画面へのトーストは出さない。ズレても fitScale が追従するので表示は
            // 破綻せず(可視ワールド幅が最適でないだけ)、回転などの日常操作で
            // 意味の伝わらない案内が割り込むほうが害だった(実機フィードバック)。
            console.info('[screen] 可視ワールド幅が起動時の値と乖離しています。再読み込みで最適化されます',
                { boot: SCREEN_WIDTH, next });
        }
    }

    // 回転・バックグラウンド遷移・縦持ち検知の自動ポーズ (P3)。
    // 既存のポーズ機構(PAUSED状態+ポーズ画面)をそのまま使い、再開はユーザー操作に委ねる。
    autoPauseIfPlaying() {
        if (this.state !== GAME_STATE.PLAYING) return;
        this.pauseReturnState = GAME_STATE.PLAYING;
        this.state = GAME_STATE.PAUSED;
        audio.pauseBgm();
    }

    // 可視ワールド上端(論理px)。z = SCREEN_WIDTH/CANVAS_WIDTH の下端アンカーズームで
    // 生じる上部クロップから cameraLift ぶんだけ持ち上げた値。z=1 → 常に 0。
    // renderPlaying のズームwrapと getVisibleWorldBounds が必ず同じ値を共有する。
    getCameraVisTop() {
        const z = SCREEN_WIDTH / CANVAS_WIDTH;
        const crop = CANVAS_HEIGHT - CANVAS_HEIGHT / z;
        // 縦アスレチックの寄り道は crop を超えて上へ抜ける（塔を登る）ので下限を外す
        if (this.stage && this.stage.useFeetCameraLift) {
            return Math.min(crop, crop - (this.cameraLift || 0));
        }
        return Math.max(0, Math.min(crop, crop - (this.cameraLift || 0)));
    }

    // ボス演出の足元スポット位置。カメラ空間(worldX - scrollX, worldY)で返す。
    // 'floor' レイヤは世界ズーム内・水平スクロール translate の【外】で描かれるため、
    // ここで scrollX を差し引いておく。
    /**
     * 足元のスポットは【登場演出の間だけ】。これは舞台照明の見立てなので、
     * 戦闘中も出しっぱなしにすると 208x50px の半透明の楕円が足元に貼り付いたまま
     * 動き回ることになる(α0.09・lighten)。bossEncounterBlend はボス戦の間ずっと1で
     * 演出の終わりを教えてくれないため、bossIntroPhase を見て ready で引く。
     */
    getBossStagingSpotT() {
        const s = this.stage;
        const phase = s && s.bossIntroPhase;
        if (!phase) return 0;
        if (phase === 'ready') {
            const t = (s.bossIntroPhaseTimer || 0) / Math.max(1, BOSS_STAGING.INTRO_READY_MS);
            return Math.max(0, 1 - Math.min(1, t));
        }
        return 1;
    }

    getBossStagingSpots() {
        const spots = [];
        const stagingT = this.getBossStagingSpotT();
        if (stagingT <= 0.001) return spots;
        const scrollX = Math.floor(this.scrollX || 0);
        const push = (actor, alpha) => {
            if (!actor) return;
            const w = typeof actor.getWorldWidth === 'function' ? actor.getWorldWidth() : (actor.width || 0);
            const h = typeof actor.getWorldHeight === 'function' ? actor.getWorldHeight() : (actor.height || 0);
            spots.push({
                x: actor.x + w * 0.5 - scrollX,
                y: actor.y + h, // 足元（ワールド下端）
                rx: Math.max(70, w * 2.6),
                ry: Math.max(18, w * 0.62),
                alpha
            });
        };
        const boss = this.stage && this.stage.boss;
        if (boss && boss.isAlive !== false) push(boss, BOSS_STAGING.SPOT_ALPHA * stagingT);
        if (this.player && this.player.hp > 0) push(this.player, BOSS_STAGING.SPOT_ALPHA_PLAYER * stagingT);
        return spots;
    }

    // ビネットの中心＝プレイヤーとボスの中点（構図が締まる）。スクリーン空間で返す。
    getBossStagingFocus(worldZoom, visTop) {
        const scrollX = this.scrollX || 0;
        const pts = [];
        const boss = this.stage && this.stage.boss;
        if (boss && boss.isAlive !== false) {
            const bw = typeof boss.getWorldWidth === 'function' ? boss.getWorldWidth() : (boss.width || 0);
            const bh = typeof boss.getWorldHeight === 'function' ? boss.getWorldHeight() : (boss.height || 0);
            pts.push({ x: boss.x + bw * 0.5, y: boss.y + bh * 0.5 });
        }
        if (this.player && this.player.hp > 0) {
            pts.push({
                x: this.player.x + this.player.getWorldWidth() * 0.5,
                y: this.player.y + this.player.getWorldHeight() * 0.5
            });
        }
        if (!pts.length) return { x: SCREEN_WIDTH * 0.5, y: CANVAS_HEIGHT * 0.5 };
        let wx = 0, wy = 0;
        for (const p of pts) { wx += p.x; wy += p.y; }
        wx /= pts.length;
        wy /= pts.length;
        const sx = (wx - scrollX) * worldZoom;
        const sy = (wy - visTop) * worldZoom;
        // 画面外へ飛ばない範囲へクランプ（ビネットの穴が端に寄りすぎると不自然）
        return {
            x: Math.max(SCREEN_WIDTH * 0.28, Math.min(SCREEN_WIDTH * 0.72, sx)),
            y: Math.max(CANVAS_HEIGHT * 0.30, Math.min(CANVAS_HEIGHT * 0.66, sy))
        };
    }

    // 名乗り短冊。'name' で降下して留まり、'ready' で上へ抜ける。
    renderBossNameBannerIfNeeded(ctx) {
        const st = this.stage;
        if (!st || !st.boss || !st.bossIntroPhase) return;
        const phase = st.bossIntroPhase;
        if (phase !== 'name' && phase !== 'ready') return;
        const t = st.bossIntroPhaseTimer || 0;
        if (phase === 'name') {
            renderBossNameBanner(ctx, st.boss.bossName, {
                stageNumber: this.currentStageNumber,
                enterT: Math.min(1, t / (BOSS_STAGING.INTRO_NAME_MS * 0.34)),
                exitT: 0
            });
        } else {
            renderBossNameBanner(ctx, st.boss.bossName, {
                stageNumber: this.currentStageNumber,
                enterT: 1,
                exitT: Math.min(1, t / (BOSS_STAGING.INTRO_READY_MS * 0.30))
            });
        }
    }

    // 可視ワールド境界の単一ソース (screen_adaptation_plan.md §2)。
    // 水平は恒等式により常に幅1280（カリング/クランプ/アリーナは端末非依存）。
    // 垂直はズームwrapと同じ visTop を共有する
    // (weapon.js の __previewViewWorldBounds の一般形)。
    getVisibleWorldBounds() {
        const scrollX = this.scrollX || 0; // タイトル等、startNewGame前はscrollX未初期化
        const z = SCREEN_WIDTH / CANVAS_WIDTH;
        const visTop = this.getCameraVisTop();
        return {
            left: scrollX,
            right: scrollX + CANVAS_WIDTH,
            top: visTop,
            bottom: visTop + CANVAS_HEIGHT / z
        };
    }

    // 縦追従カメラの更新 (P2b §2.3)。接地時のみターゲットを更新し、空中の三段ジャンプで
    // リフトを発火させない（頂点の頭切れは一瞬のため許容し、酔いの原因になるカメラ上下動を
    // 避ける）。stage4屋根・stage5階段の「接地した高所」で自動的に持ち上がる。
    // PAUSED/DEFEAT/LEVEL_UP 中は呼び出し元(updatePlaying)へ来ないため自動凍結。
    updateCameraLift(dt) {
        const z = SCREEN_WIDTH / CANVAS_WIDTH;
        const crop = CANVAS_HEIGHT - CANVAS_HEIGHT / z; // リフト可動域。z=1 端末は 0
        // 縦アスレチックの寄り道は crop に依らず必ず追従する(z=1のPCでも塔を登る)。
        const useFeet = !!(this.stage && this.stage.useFeetCameraLift);
        if (crop <= 0.5 && !useFeet) {
            this.cameraLift = 0;
            this.cameraLiftTarget = 0;
            return;
        }
        const HEADROOM = 90;  // 高所接地時に頭上へ確保する余白(world px)
        const DEADBAND = 24;  // 微小な段差でターゲットを揺らさない不感帯
        // 縦アスレチックの寄り道(小判蔵)は【プレイヤーが画面の上下中央に来る】ように
        // 追い、上端(塔の頂き)と下端(床)でだけ止まる。接地条件は付けない ―
        // 跳んでいる間こそ上が見たいので、空中でも追い続ける。
        if (useFeet && this.player) {
            const viewH = CANVAS_HEIGHT / z;
            const centerY = this.player.y + this.player.getWorldHeight() * 0.5;
            const wantVisTop = centerY - viewH * 0.5;
            const minVisTop = (typeof this.stage.getCameraMinVisTop === 'function')
                ? this.stage.getCameraMinVisTop()
                : -Infinity;
            // 下限は「床が画面下端に収まる位置」= 通常の crop。これ以上は下げない。
            // 不感帯は使わない(中央追従は滑らかさが要)。
            this.cameraLiftTarget = crop - Math.max(minVisTop, Math.min(crop, wantVisTop));
        } else if (this.player && this.player.isGrounded) {
            // 本編は groundY(ステージの地面線)基準で、足場に乗ってもリフトしない。
            const feetY = this.player.groundY + LANE_OFFSET;
            const topY = feetY - this.player.getWorldHeight();
            const raw = Math.max(0, Math.min(crop, crop + HEADROOM - topY));
            if (Math.abs(raw - this.cameraLiftTarget) > DEADBAND) this.cameraLiftTarget = raw;
        }
        // 非対称平滑: 上昇(リフト増)ゆっくり k=3/s・復帰すばやく k=6/s（フレームレート非依存）。
        // prefers-reduced-motion 時はさらに緩やかに(カメラ酔い対策)。
        // 中央追従(縦アスレチック)は上下とも同じ速さで追う(片方だけ遅いと置いていかれる)。
        const reduce = this._prefersReducedMotion ? 0.5 : 1;
        const k = (useFeet ? 7 : ((this.cameraLiftTarget > this.cameraLift) ? 3 : 6)) * reduce;
        this.cameraLift += (this.cameraLiftTarget - this.cameraLift) * (1 - Math.exp(-k * dt));
        if (Math.abs(this.cameraLiftTarget - this.cameraLift) < 0.1) this.cameraLift = this.cameraLiftTarget;
    }

    // standalone(ホーム画面追加アプリ)等では layout viewport が実際の表示領域
    // (visualViewport)より大きくなり、container(100dvh)中央配置のキャンバスが画面外へ
    // はみ出してタップ位置が下方向にずれる。container を visualViewport の位置・サイズへ
    // ぴったり追従させ、キャンバスが表示領域からはみ出さないようにする。
    // ブラウザ(offset=0)では従来と同じ全画面配置になる。
    syncContainerToViewport() {
        const vv = window.visualViewport;
        const container = this.canvas && this.canvas.parentElement;
        if (!vv || !container) return;
        // position:fixed は iOS では visual viewport に貼り付くため、left/top は
        // オフセットせず 0 にする（offsetTop を足すと二重補正で画面ごと上下にずれる）。
        // 高さ・幅を visualViewport に合わせ、container が実表示領域より大きくなって
        // canvas が画面外へはみ出すのを防ぐ。
        // 注意: CSS の min-width:100vw / min-height:100svh が height/width 指定を
        // 下限で打ち消すため、min-*/max-* も明示して visualViewport へ固定する。
        const w = Math.round(vv.width);
        const h = Math.round(vv.height);
        container.style.left = '0px';
        container.style.top = '0px';
        container.style.width = w + 'px';
        container.style.height = h + 'px';
        container.style.minWidth = w + 'px';
        container.style.minHeight = h + 'px';
        container.style.maxWidth = w + 'px';
        container.style.maxHeight = h + 'px';
    }

    getDebugStartStageFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const raw = params.get('stage');
            if (!raw) return null;
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isFinite(parsed)) return null;
            if (parsed < 1 || parsed > STAGES.length) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    /**
     * デバッグ用: マップ(ステージセレクト)画面から起動するURL指定。
     *   ?map=1           … 新規開始と同じ進行でセレクト画面から(第1階層のみ選択可)
     *   ?map=1&stage=4   … 第3階層まで踏破済み扱いでセレクトから(4まで選択可)
     *   ?map=all         … 全階層踏破済み扱い(全選択可・済印・ボーナスも解放)
     * タイトルとイントロを飛ばす。startNewGame を通るため ?stage= 等の既存指定も効く。
     */
    getDebugStartAtMapFromUrl() {
        try {
            const raw = (new URLSearchParams(window.location.search).get('map') || '').toLowerCase();
            if (raw === 'all') return 'all';
            if (raw === '1' || raw === 'true') return 'unlocked';
            return null;
        } catch {
            return null;
        }
    }

    /**
     * デバッグ開始地点のURL指定。
     *   ?stage=6&at=corner3  … 三層目ラスト(鎖鎌の手前)から
     *   ?stage=6&at=boss     … ボス部屋(=最上層へ遷移した直後)から
     * タイトルのデバッグメニューと同じ効果。URLの方が速いとき用。
     */
    getDebugStartPointFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const raw = (params.get('at') || '').toLowerCase();
            if (raw === 'corner3' || raw === 'grapple' || params.get('corner3') === '1') return 'corner3';
            if (raw === 'boss' || params.get('boss') === '1') return 'boss';
            return null;
        } catch {
            return null;
        }
    }

    createTitleDebugConfig() {
        return {
            preset: 'default',
            stage: 1,
            bossRoom: false, // デバッグ用：ボス部屋からスタート
            moneyMax: false,
            normalCombo: 0,
            subWeapon: 0,
            specialClone: 0,
            money: 0,
            startWeapon: '手裏剣',
            characterType: saveManager.loadGlobal().isGameCleared ? 'shogun' : 'ninja',
            ownedWeapons: {
                '手裏剣': true,
                '火薬玉': false,
                '大槍': false,
                '二刀流': false,
                '鎖鎌': false,
                '大太刀': false
            },
            items: {
                double_jump: false,
                triple_jump: false,
                speed_up: false,
                hp_boost: 0,
                atk_boost: 0,
                permanent_max_special: false
            }
        };
    }

    getTitleDebugWeaponNames() {
        return ['手裏剣', '火薬玉', '大槍', '二刀流', '鎖鎌', '大太刀'];
    }

    ensureTitleDebugStartWeapon() {
        const owned = this.getTitleDebugWeaponNames().filter((weapon) => this.titleDebugConfig.ownedWeapons[weapon]);
        if (owned.length === 0) {
            this.titleDebugConfig.ownedWeapons['手裏剣'] = true;
            this.titleDebugConfig.startWeapon = '手裏剣';
            return;
        }
        if (!owned.includes(this.titleDebugConfig.startWeapon)) {
            this.titleDebugConfig.startWeapon = owned[0];
        }
    }

    applyTitleDebugFullMaxPreset() {
        const cfg = this.titleDebugConfig;
        cfg.preset = 'fullMax';
        cfg.normalCombo = 3;
        cfg.subWeapon = 3;
        cfg.specialClone = 3;
        cfg.moneyMax = true;
        cfg.money = 9999;
        cfg.items.hp_boost = 198; // 5 * 198 = +990 加算 (初期値 10 + 990 = 1000)
        cfg.items.atk_boost = 3;
        cfg.items.double_jump = true;
        cfg.items.triple_jump = true;
        cfg.items.speed_up = true;
        cfg.items.permanent_max_special = true;
        for (const w in cfg.ownedWeapons) cfg.ownedWeapons[w] = true;
        this.ensureTitleDebugStartWeapon();
    }

    applyTitleDebugDefaultPreset() {
        const cfg = this.titleDebugConfig;
        const def = this.createTitleDebugConfig();
        cfg.preset = 'default';
        cfg.normalCombo = def.normalCombo;
        cfg.subWeapon = def.subWeapon;
        cfg.specialClone = def.specialClone;
        cfg.moneyMax = def.moneyMax;
        cfg.money = def.money;
        cfg.items = { ...def.items };
        for (const w in cfg.ownedWeapons) cfg.ownedWeapons[w] = def.ownedWeapons[w];
        cfg.startWeapon = def.startWeapon;
        this.ensureTitleDebugStartWeapon();
    }

    getTitleDebugEntries() {
        const cfg = this.titleDebugConfig;
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        const cycleEnum = (current, list, delta) => {
            if (!list.length) return current;
            const index = Math.max(0, list.indexOf(current));
            const next = (index + delta + list.length) % list.length;
            return list[next];
        };

        const entries = [
            {
                label: 'プリセット',
                getValue: () => (cfg.preset === 'fullMax' ? '最強' : 'デフォルト'),
                change: (delta) => {
                    const nextPreset = cycleEnum(cfg.preset, ['default', 'fullMax'], delta);
                    if (nextPreset === 'fullMax') {
                        this.applyTitleDebugFullMaxPreset();
                    } else {
                        this.applyTitleDebugDefaultPreset();
                    }
                }
            },
            {
                label: '開始階層',
                getValue: () => `${cfg.stage}`,
                change: (delta) => { cfg.stage = clamp(cfg.stage + delta, 1, STAGES.length); }
            },
            {
                label: 'ボスから開始',
                getValue: () => (cfg.bossRoom ? 'ON' : 'OFF'),
                change: () => { cfg.bossRoom = !cfg.bossRoom; }
            },
            {
                label: '小判MAX',
                getValue: () => ((cfg.moneyMax || cfg.money >= 9999) ? 'ON' : 'OFF'),
                change: () => {
                    cfg.moneyMax = !(cfg.moneyMax || cfg.money >= 9999);
                    cfg.money = cfg.moneyMax ? 9999 : 0;
                }
            },
            {
                label: '奥義常時MAX',
                getValue: () => (cfg.items.permanent_max_special ? 'ON' : 'OFF'),
                change: () => { 
                    cfg.items.permanent_max_special = !cfg.items.permanent_max_special; 
                }
            },
            {
                label: '連撃強化',
                getValue: () => `Lv ${cfg.normalCombo}`,
                change: (delta) => { cfg.normalCombo = clamp(cfg.normalCombo + delta, 0, 3); }
            },
            {
                label: '忍具強化',
                getValue: () => `Lv ${cfg.subWeapon}`,
                change: (delta) => { cfg.subWeapon = clamp(cfg.subWeapon + delta, 0, 3); }
            },
            {
                label: '奥義強化',
                getValue: () => `Lv ${cfg.specialClone}`,
                change: (delta) => { cfg.specialClone = clamp(cfg.specialClone + delta, 0, 3); }
            },
            {
                label: '開始装備',
                getValue: () => cfg.startWeapon,
                change: (delta) => {
                    this.ensureTitleDebugStartWeapon();
                    const owned = this.getTitleDebugWeaponNames().filter((weapon) => cfg.ownedWeapons[weapon]);
                    cfg.startWeapon = cycleEnum(cfg.startWeapon, owned, delta);
                }
            }
        ];

        for (const weapon of this.getTitleDebugWeaponNames()) {
            entries.push({
                label: `武器所持:${weapon}`,
                getValue: () => (cfg.ownedWeapons[weapon] ? 'ON' : 'OFF'),
                change: () => {
                    cfg.ownedWeapons[weapon] = !cfg.ownedWeapons[weapon];
                    this.ensureTitleDebugStartWeapon();
                }
            });
        }

        entries.push(
            {
                label: 'アイテム:活力の秘薬',
                getValue: () => `+ ${cfg.items.hp_boost * 5}`,
                change: (delta) => { 
                    cfg.items.hp_boost = Math.max(0, (cfg.items.hp_boost || 0) + delta); 
                }
            },
            {
                label: 'アイテム:剛力の秘薬',
                getValue: () => `Lv ${cfg.items.atk_boost}`,
                change: (delta) => { 
                    cfg.items.atk_boost = Math.max(0, Math.min(3, (cfg.items.atk_boost || 0) + delta)); 
                }
            },
            {
                label: 'アイテム:韋駄天の秘術',
                getValue: () => (cfg.items.speed_up ? '習得済' : '未取得'),
                change: () => { cfg.items.speed_up = !cfg.items.speed_up; }
            },
            {
                label: 'アイテム:二段跳び',
                getValue: () => (cfg.items.double_jump ? '習得済' : '未取得'),
                change: () => {
                    cfg.items.double_jump = !cfg.items.double_jump;
                    if (!cfg.items.double_jump) cfg.items.triple_jump = false;
                }
            },
            {
                label: 'アイテム:三段跳び',
                getValue: () => (cfg.items.triple_jump ? '習得済' : '未取得'),
                change: () => {
                    cfg.items.triple_jump = !cfg.items.triple_jump;
                    if (cfg.items.triple_jump) cfg.items.double_jump = true;
                }
            },
            {
                label: '操作キャラ',
                getValue: () => (cfg.characterType === 'shogun' ? '将軍' : '忍者'),
                change: (delta) => {
                    cfg.characterType = cfg.characterType === 'shogun' ? 'ninja' : 'shogun';
                }
            },
            {
                label: 'ステータス画面表示',
                getValue: () => '実行',
                action: () => {
                    this.titleDebugApplyOnStart = true;
                    this.startNewGame();
                    this.state = GAME_STATE.STAGE_CLEAR;
                    this.stageClearPhase = 1;
                    this.resetStageClearAutoSubWeaponTimer(true);
                    this.titleDebugOpen = false;
                    
                    if (this.player) {
                        this.groundY = Math.round(CANVAS_HEIGHT * 0.08); // ステータス画面用の高い地面（画面最上部付近）
                        if (this.stage) this.stage.groundY = this.groundY;
                        this.player.previewMode = true;
                        this.player.groundY = this.groundY;
                        this.player.x = 100;
                        this.player.y = this.groundY + LANE_OFFSET - this.player.getWorldHeight();
                        this.player.vx = 0;
                        this.player.vy = 0;
                        this.player.isGrounded = true; 
                        this.player.yVelocity = 0;
                        this.player.jumpCount = 0;
                        this.player.facingRight = true;
                        this.player.isAttacking = false;
                        this.player.currentAttack = null;
                        this.player.attackTimer = 0;
                        this.player.attackCombo = 0;
                        this.player.subWeaponTimer = 0;
                        this.player.subWeaponAction = null;
                        this.player.isDashing = false;
                        this.player.isCrouching = false;
                        this.clearPlayerProjectiles();
                        this.player.resetVisualTrails();
                    }
                    audio.playBgm('menu');
                }
            },
            {
                label: 'エンディング表示',
                getValue: () => '実行',
                action: () => {
                    this.state = GAME_STATE.ENDING;
                    this.endingTimer = 0;
                    audio.playBgm('ending');
                    this.titleDebugOpen = false;
                }
            },
            {
                label: 'デバッグ設定で開始',
                getValue: () => '実行',
                action: () => {
                    this.titleDebugApplyOnStart = true;
                    this.titleDebugOpen = false;
                    this.startNewGame();
                }
            }
        );

        return entries;
    }

    applyTitleDebugSetupToNewGame() {
        if (!this.player || !this.titleDebugApplyOnStart) return;
        const cfg = this.titleDebugConfig;

        this.player.progression.normalCombo = Math.max(0, Math.min(3, cfg.normalCombo || 0));
        
        // 操作キャラ反映
        const prevType = this.player.characterType;
        this.player.characterType = cfg.characterType || 'ninja';
        if (this.player.characterType !== prevType) {
            // 将軍戦闘コントローラの登録状態を確認
            applyShogunCombat(this.player);
        }

        this.player.progression.subWeapon = Math.max(0, Math.min(3, cfg.subWeapon || 0));
        this.player.progression.specialClone = Math.max(0, Math.min(3, cfg.specialClone || 0));
        if (typeof this.player.rebuildSpecialCloneSlots === 'function') this.player.rebuildSpecialCloneSlots();
        if (typeof this.player.refreshSubWeaponScaling === 'function') this.player.refreshSubWeaponScaling();
        
        // 追加ステータス反映
        this.player.maxHp += (cfg.items.hp_boost || 0) * 5;
        this.player.hp = this.player.maxHp;
        
        const atkMultipliers = [1.0, 1.2, 1.5, 2.0];
        const atkIdx = Math.max(0, Math.min(3, cfg.items.atk_boost || 0));
        this.player.baseAttackPower = 1; // 基準値
        this.player.attackPower = this.player.baseAttackPower * atkMultipliers[atkIdx];
        this.player.atkLv = atkIdx;

        if (typeof this.player.setMoney === 'function') this.player.setMoney(cfg.money || 0);
        else this.player.money = Math.max(0, Math.min(this.player.maxMoney || 9999, Math.floor(cfg.money || 0)));

        const ownedWeapons = this.getTitleDebugWeaponNames().filter((weapon) => cfg.ownedWeapons[weapon]);
        const weaponPool = ownedWeapons.length > 0 ? ownedWeapons : ['手裏剣'];
        this.player.subWeapons = weaponPool.map((name) => createSubWeapon(name)).filter(Boolean);
        if (this.player.subWeapons.length === 0) {
            const fallback = createSubWeapon('手裏剣');
            if (fallback) this.player.subWeapons = [fallback];
        }

        this.ensureTitleDebugStartWeapon();
        const startWeapon = weaponPool.includes(cfg.startWeapon) ? cfg.startWeapon : weaponPool[0];
        let startIndex = this.player.subWeapons.findIndex((weapon) => weapon.name === startWeapon);
        if (startIndex < 0) startIndex = 0;
        this.player.subWeaponIndex = startIndex;
        this.player.currentSubWeapon = this.player.subWeapons[startIndex] || null;
        if (typeof this.player.refreshSubWeaponScaling === 'function') {
            this.player.refreshSubWeaponScaling();
        }

        this.unlockedWeapons = [...weaponPool];
        this.player.unlockedWeapons = [...weaponPool];
        this.player.stageEquip[this.currentStageNumber] = this.player.currentSubWeapon ? this.player.currentSubWeapon.name : '手裏剣';

        shop.purchasedSkills.clear();
        shop.purchasedSkills.clear();
        if (cfg.items.double_jump) shop.purchasedSkills.add('double_jump');
        if (cfg.items.triple_jump) shop.purchasedSkills.add('triple_jump');
        if (cfg.items.speed_up) shop.purchasedSkills.add('speed_up');
        shop.purchasedUpgrades.hp_up = cfg.items.hp_boost || 0;
        shop.purchasedUpgrades.attack_up = cfg.items.atk_boost || 0;
        
        this.player.maxJumps = cfg.items.triple_jump ? 3 : (cfg.items.double_jump ? 2 : 1);
        this.player.permanentDash = !!cfg.items.speed_up;
        this.player.speed = PLAYER.SPEED;

        this.titleDebugApplyOnStart = false;
    }
    
    continueGame(saveData) {
        if (!saveData) return;

        // セーブ内容で上書きする前に購入状態を空へ戻す。applyToPlayer は
        // スキルを add() で足すので、直前のプレイの購入が混ざるのを防ぐ。
        shop.reset();

        // 武器作成関数をインポート
        import('./weapon.js?v=screen-safe-20260815n').then(module => {
            // 基本ステータス復元
            this.currentStageNumber = saveData.progress.currentStage;
            // セレクト画面の解放判定。旧セーブ(フィールド無し)は「保存された次のステージ
            // の1つ手前まではクリア済み」とみなす。
            this.maxClearedStage = Number.isFinite(saveData.progress.maxClearedStage)
                ? Math.max(0, Math.floor(saveData.progress.maxClearedStage))
                : Math.max(0, this.currentStageNumber - 1);
            this.player = new Player(100, this.groundY - PLAYER.HEIGHT, this.groundY);
            saveManager.applyToPlayer(this.player, saveData);
            const savedCharType = saveManager.loadGlobal().characterType || 'ninja';
            if (savedCharType === 'shogun') {
                this.player.characterType = 'shogun';
                applyShogunCombat(this.player);
            }
            
            // 所持武器リストの復元
            this.unlockedWeapons = saveData.progress.unlockedWeapons || [];
            this.unlockedWeapons.forEach(weaponId => {
                const weapon = module.createSubWeapon(weaponId);
                if (weapon) {
                    // プレイヤーの所持リストに追加
                    if (!this.player.subWeapons.some(w => w.name === weapon.name)) {
                        this.player.subWeapons.push(weapon);
                    }
                }
            });

            // 現在の装備武器の復元
            const subWeaponId = saveData.player.currentSubWeapon;
            if (subWeaponId) {
                let index = this.player.subWeapons.findIndex(w => w.name === subWeaponId);
                if (index === -1) {
                    const weapon = module.createSubWeapon(subWeaponId);
                    if (weapon) {
                        this.player.subWeapons.push(weapon);
                        index = this.player.subWeapons.length - 1;
                    }
                }
                if (index !== -1) {
                    this.player.subWeaponIndex = index;
                    this.player.currentSubWeapon = this.player.subWeapons[index];
                } else {
                    this.player.subWeaponIndex = 0;
                }
            }
            
            this.initStage(this.currentStageNumber);
            if (typeof this.player.refreshSubWeaponScaling === 'function') {
                this.player.refreshSubWeaponScaling();
            }
            // 購入スキル/強化から派生ステータスを再構築する。
            // applyToPlayer はスキル集合・強化値は復元するが、そこから決まる
            // 常時ダッシュ(speed_up)・段ジャンプ・攻撃段階(atkLv表示)は反映しないため補う。
            if (shop) {
                this.player.permanentDash = shop.purchasedSkills.has('speed_up');
                this.player.maxJumps = shop.purchasedSkills.has('triple_jump') ? 3
                    : (shop.purchasedSkills.has('double_jump') ? 2 : 1);
                const atkUp = shop.purchasedUpgrades && shop.purchasedUpgrades.attack_up;
                if (Number.isFinite(atkUp)) this.player.atkLv = atkUp;
            }
            this.scrollX = 0; // スクロール位置リセット
            this.bossRoomPanArmed = false;   // ボス部屋の寄りの latch
            this.cameraLift = 0;
            this.cameraLiftTarget = 0;
            this.expGems = [];
            this.stageBossDefeatEffects = [];
            
            // ステージごとの初期装備を適用
            if (this.player.stageEquip && this.player.stageEquip[this.currentStageNumber]) {
                const weaponName = this.player.stageEquip[this.currentStageNumber];
                const index = this.player.subWeapons.findIndex(w => w.name === weaponName);
                if (index !== -1) {
                    this.player.subWeaponIndex = index;
                    this.player.currentSubWeapon = this.player.subWeapons[index];
                }
            }

            this.state = GAME_STATE.PLAYING;
            audio.playBgm('stage', this.currentStageNumber, 0);
            this.startTransition();
        });
    }
    
    startStage() {
        this.pendingStageStart = null; // 待ちは解消済み（直接呼ばれた場合の保険）
        // 次ステージの先読み開始までの猶予。開始直後は現ステージのデコードと
        // 競合するので少し置いてから流す。
        this._nextStagePrefetchMs = NEXT_STAGE_PREFETCH_DELAY_MS;
        // 前のステージの色調フィルタ焼き上がりを捨てる。1ステージ先までしか
        // 先読みしない設計(imageCache)の意図に反してメモリが積むため。
        clearFilteredImageCache();
        // 地面の高さを本来のゲーム位置にリセット
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));

        // プレイヤー初期化（初回のみ生成、以降はリセット）
        if (!this.player) {
            this.player = new Player(100, this.groundY + LANE_OFFSET - PLAYER.HEIGHT, this.groundY);
        } else {
            this.player.previewMode = false;
            this.player.groundY = this.groundY; // 地面基準を同期
            this.player.x = 100;
            this.player.y = this.groundY + LANE_OFFSET - this.player.getWorldHeight();
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.hp = this.player.maxHp; // ステージ開始時にHP全回復（任意、必要なら残す）
            this.player.specialGauge = 0;
            this.player.isAttacking = false;
            this.player.isDashing = false;
            this.player.isGrounded = true;
            if (typeof this.player.clearSpecialState === 'function') {
                this.player.clearSpecialState(true);
            }
        }

        if (this.player && typeof this.player.resetVisualTrails === 'function') {
            this.player.resetVisualTrails();
        }

        // ステータス画面のプレビュー（忍具の自動デモ・コンボ素振り）の残留を持ち込まない。
        // 弾は weapon.projectiles に生きたまま残るため、クリアしないと開始直後の
        // 画面上部（プレビュー時の高い groundY 基準の座標）に手裏剣が描かれる。
        if (this.player) {
            this.player.attackCombo = 0;
            this.player.attackTimer = 0;
            this.player.comboResetTimer = 0;
            this.player.isCrouching = false;
            this.clearPlayerProjectiles();
        }

        // ステージ初期化
        this.stage = new Stage(this.currentStageNumber);
        
        this.bombs = [];
        this.shockwaves = []; // 必殺衝撃波
        this.effects = [];
        this.hitEffects = [];
        this.damageNumbers = [];
        this.expGems = [];
        this.stageBossDefeatEffects = [];
        this.pendingLevelUpChoices = 0;
        // this.levelUpChoiceIndex = 0; // フェードアウト完了まで位置を維持
        this.levelUpInputLockMs = 0;
        this.levelUpRequireRelease = false;
        this.levelUpConfirmCooldownMs = 0;
        this.returnToStageClearAfterShop = false;
        this.playerDefeatTimer = 0;
        this.collisionManager.reset();
        this.pendingStageClear = false;
        this.stageClearTransitionTimer = 0.6; // 1.0s -> 0.6s に短縮してテンポを改善
        
        // スクロール位置初期化
        this.scrollX = 0;
        this.cameraY = 0;
        this.cameraLift = 0;
        this.cameraLiftTarget = 0;
        
        // ─── デバッグ：Stage6 三層目ラスト(鎖鎌の手前)からスタート ─────────
        // 角1・2は通過済み・三層目(廻縁)の突き当たり手前に立つ。右へ歩くだけで
        // 「鎖鎌で軒へ登る → 暗転 → 大屋根へ飛び乗る → 会敵」を検証できる。
        if (this.debugStage6Corner3Start) {
            this.debugStage6Corner3Start = false;
            if (this.currentStageNumber === 6 && this.stage.stageNumber === 6) {
                this.stage.midBossSpawned = true; // 中ボスはスキップ
                // 角1→角2を「登った」状態にする(advanceCorner が敵/障害物もリセットする)。
                this.stage.cornersClimbed = 1;
                this.stage.advanceCorner();
                // 鎖鎌の発火位置(=軒先の手前)から更に手前に置き、歩き出しの間を残す。
                const probe = this.stage.getStage6GrappleTriggerProbeX();
                const walkIn = 420;
                const landX = Number.isFinite(probe)
                    ? probe - this.player.getWorldWidth() - walkIn
                    : this.stage.getStage6ActiveCornerX() - 1200;
                this.player.x = landX;
                this.player.groundY = this.stage.groundY;
                this.player.y = this.stage.groundY + LANE_OFFSET - this.player.getWorldHeight();
                this.player.vx = 0;
                this.player.vy = 0;
                this.player.isGrounded = true;
                this.player.facingRight = true;
                if (typeof this.player.resetVisualTrails === 'function') {
                    this.player.resetVisualTrails();
                }
                // カメラは通常の追従位置(=前進しても飛ばない)に合わせる。
                this.scrollX = Math.max(0, this.player.x - CANVAS_WIDTH / 2);
                this.stage.progress = this.scrollX;
                this.stage.lastProgress = this.scrollX;
            }
        }

        // ─── デバッグ：ボス部屋からスタート ───────────────────────────
        if (this.debugBossRoomStart) {
            this.debugBossRoomStart = false;
            
            // カメラをボス戦の固定位置（右端から画面1枚分引いた場所）に即セット
            this.scrollX = Math.max(0, this.stage.maxProgress - CANVAS_WIDTH);
            this.stage.progress = this.stage.maxProgress;
            this.stage.lastProgress = this.stage.maxProgress;
            this.stage.midBossSpawned = true; // 中ボスをスキップ
            this.stage.enemies = [];          // 雑魚敵をクリア
            this.stage.obstacles = [];        // 障害物をクリア

            // Stage 5 の場合は強制的に最上階(5F)状態へワープ
            if (this.currentStageNumber === 5 && this.stage.stageNumber === 5) {
                this.stage.currentFloor = this.stage.maxFloor;
                // 5Fは通常奇数フロアなので右方向(1)。また、4Fから上がってくるのでprevDir=-1
                this.stage.floorScrollDirection = 1;
                this.stage.previousStairDirection = -1;
            }

            // Stage 6 だけは「ボスの前」ではなく【最上層に上がった直後】から始める。
            // 大屋根アリーナは (a)将軍が右端に立って待っている (b)右へ歩くとフレームイン
            // (c)カメラが右端で止まると開戦 という一連の流れが本番の見せ場なので、
            // ここで spawnBoss すると待機立ちも助走も検証できなくなる。
            // 角3を登った直後の状態を作るため advanceCorner を通す(=全角通過済み。
            // これを怠ると角1の門トリガーが「足が門より右」で即発火して引き戻される)。
            const debugStage6Arena = this.currentStageNumber === 6 && this.stage.stageNumber === 6;
            if (debugStage6Arena) {
                this.stage.cornersClimbed = this.stage.stage6CornerXs.length - 1;
                this.stage.advanceCorner();
                // 将軍を大屋根の右端へ立たせる(本番と同じ経路: 振り向き→名乗り)
                this.stage.prepareStage6StandbyBoss();

                // 【遷移直後から】始める: 鎖鎌で登り切って屋根へ飛び乗る放物線を再生する。
                // 立った状態から始めると、本番で最初に見えるはずの着地が確認できない。
                const landingX = this.stage.getStage6ArenaLeft() + STAGE6_CORNER.ARENA_LANDING_INSET_PX;
                this.ensurePlayerDimsReady(); // 将軍の寸法を先に確定(半分サイズで飛ぶのを防ぐ)
                this.player.groundY = this.stage.getStage6ArenaGroundY();
                const landingY = this.player.groundY + LANE_OFFSET - this.player.getWorldHeight();
                // 本番と同じ「画面外(上)から落ちてくる」見え方にする。
                // デバッグ開始は暗転の待ちが無く尺が短いので、頂点は付けず
                // 画面上端の外から素直に落とす(本番の可視区間と同じ絵になる)。
                this.stage6ArenaEntryArc = {
                    fromX: landingX - 560,
                    fromY: -120,
                    toX: landingX,
                    toY: landingY,
                    elapsed: 0,
                    peak: 0,
                    dur: Math.max(140, this.stage.transitionFadeInMs - 16)
                };
                this.player.x = this.stage6ArenaEntryArc.fromX;
                this.player.y = this.stage6ArenaEntryArc.fromY;
                this.player.vx = 0;
                this.player.vy = 0;
                this.player.isGrounded = false;
                this.player.facingRight = true;
                // 髪・鉢巻の物理ノードは初期位置(ステージ開始地点)に置かれたままなので、
                // ここで張り直さないと最上階まで伸び切った紐になる。
                if (typeof this.player.resetVisualTrails === 'function') {
                    this.player.resetVisualTrails();
                }
                // 暗転明け(フェードイン)の途中から開始する。updateStage6CornerTransition が
                // アークを進め、着地と同時に通常の操作へ戻る。
                this.stage.isFloorTransitioning = true;
                this.stage.floorTransitionPhase = 3;
                this.stage.floorTransitionTimer = this.stage.transitionFadeInMs;

                // カメラは本番遷移と同じイージングで着地位置へ寄せる。
                // 屋根の左端に固定すると、着地して操作が戻った瞬間に通常追従との差
                // (実測387px)を一気に詰めてスクロールが飛ぶ。
                this.setupStage6ArenaEntryArcCamera(this.stage6ArenaEntryArc);
            } else {
                this.stage.spawnBoss();           // ボス即スポーン

                // プレイヤーをボス部屋の本来のカメラ到達時の立ち位置（画面左から30%）へ配置
                this.player.x = this.scrollX + CANVAS_WIDTH * 0.3;
            }
        }
        // ─────────────────────────────────────────────────────────────

        this.state = GAME_STATE.PLAYING;
        // ステージ開始BGM：フェードインなしで即再生（fadeDuration = 0）
        // stage6の最上階はボス未出現でもラスボス曲(=boss)。屋根に上がった時点で鳴る曲なので、
        // デバッグの「ボス部屋から開始」でも同じ曲で始める。
        const startWithBossBgm = !!this.stage.boss
            || !!(this.stage.isStage6Arena && this.stage.isStage6Arena());
        audio.playBgm(startWithBossBgm ? 'boss' : 'stage', this.currentStageNumber, 0);
        
        // ステージ開始時の暗転フェードイン
        this.startTransition();
        // 最上層へ飛び乗るアークを再生する場合は、遷移側のフェードインだけで暗転を明ける。
        // ステージ開始の暗幕を重ねると二重に暗くなり、肝心の着地が見えない。
        if (this.stage6ArenaEntryArc) this.transitionTimer = 0;
    }
    
    // メインループ
    loop(currentTime) {
        // デルタタイム計算（秒単位）
        let rawDeltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;
        this.frameDamageHitCount = 0;
        this.frameDamageVisualCount = 0;

        // 低スペック検知 (P4): PLAYING中の持続的なフレーム落ち(>24ms)が累計3秒に達したら
        // タッチ端末のバッキング解像度を一段落として(1.5→1.25)描画負荷を約31%削減する。
        // 一度だけ発動・セッション内不可逆(行き来によるちらつき防止)。
        if (!this._dprDowngraded && this.state === GAME_STATE.PLAYING) {
            if (rawDeltaTime > 0.024) {
                this._slowFrameAccumSec += rawDeltaTime;
                if (this._slowFrameAccumSec > 3) {
                    this._dprDowngraded = true;
                    this.configureCanvasResolution();
                }
            } else {
                this._slowFrameAccumSec = Math.max(0, this._slowFrameAccumSec - rawDeltaTime * 0.5);
            }
        }
        
        // ヒットストップ処理
        let updateDeltaTime = rawDeltaTime;
        if (this.bossDefeatHitStopMs > 0) {
            // ボス撃破専用のヒットストップ。グローバル無効設定(hitStopEnabled=false)とは
            // 独立した枠なので、通常戦闘のヒットストップ方針を変えずに一撃の重みを出せる。
            this.bossDefeatHitStopMs = Math.max(0, this.bossDefeatHitStopMs - rawDeltaTime * 1000);
            updateDeltaTime = 0;
        } else if (this.bossDefeatSlowMs > 0) {
            // 続いてスローモーション。破片と昇天が見える速度まで落とす。
            this.bossDefeatSlowMs = Math.max(0, this.bossDefeatSlowMs - rawDeltaTime * 1000);
            updateDeltaTime = rawDeltaTime * BOSS_STAGING.DEFEAT_SLOW_SCALE;
        } else if (this.hitStopEnabled && this.hitStopTimer > 0) {
            this.hitStopTimer -= rawDeltaTime * 1000;
            updateDeltaTime = 0; // 時間を止める
        } else if (this.state === GAME_STATE.DEFEAT) {
            if (!this.hitStopEnabled) this.hitStopTimer = 0;
            // 敗北中はスローモーション (50% の速度 — 破裂が見える程度に)
            updateDeltaTime = rawDeltaTime * 0.5;
        } else {
            if (!this.hitStopEnabled) this.hitStopTimer = 0;
            updateDeltaTime = rawDeltaTime;
        }

        // 画面揺れ減衰
        if (!this.screenShakeEnabled) {
            this.shakeIntensity = 0;
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
            this.shakeSampleTimerMs = 0;
        } else if (this.shakeIntensity > 0) {
            const perfScale = this.getShakePerformanceScale();
            const decay = Math.pow(0.9, rawDeltaTime * 60);
            this.shakeIntensity *= decay;
            if (this.shakeIntensity < 0.1) {
                this.shakeIntensity = 0;
                this.shakeOffsetX = 0;
                this.shakeOffsetY = 0;
                this.shakeSampleTimerMs = 0;
            } else {
                this.shakeSampleTimerMs -= rawDeltaTime * 1000;
                if (this.shakeSampleTimerMs <= 0) {
                    this.shakeSampleTimerMs += this.shakeSampleIntervalMs;
                    const amp = Math.min(this.maxShakeIntensity, this.shakeIntensity * perfScale);
                    this.shakeOffsetX = Math.round((Math.random() - 0.5) * amp * 2);
                    this.shakeOffsetY = Math.round((Math.random() - 0.5) * amp * 2);
                }
            }
        }

        // ボス撃破フラッシュの更新
        if (this.flashAlpha > 0) {
            this.flashAlpha -= rawDeltaTime * 1.5; // 約0.66秒で消える
            if (this.flashAlpha < 0) this.flashAlpha = 0;
        }
        
        this.didRunUpdateThisFrame = false;
        try {
            // 更新
            this.runFrameUpdates(updateDeltaTime);
            
            // 描画
            this.ensureViewportSync();
            this.render();
        } catch (err) {
            console.error('Game loop error:', err);
        } finally {
            // 入力状態更新（JustPressedリセット）。
            // 固定ステップ中に更新をスキップした描画フレームでは、JustPressedを次の更新へ持ち越す。
            if (this.didRunUpdateThisFrame || !this.useFixedTimestep) {
                input.update();
            }
        }
        
        // 次フレーム
        requestAnimationFrame((t) => this.loop(t));
    }

    runFrameUpdates(updateDeltaTime) {
        if (!this.useFixedTimestep) {
            this.deltaTime = updateDeltaTime;
            this.didRunUpdateThisFrame = true;
            this.update();
            return;
        }

        if (updateDeltaTime <= 0) {
            this.deltaTime = 0;
            this.didRunUpdateThisFrame = true;
            this.update();
            return;
        }

        this.fixedUpdateAccumulator = Math.min(
            this.fixedUpdateAccumulator + updateDeltaTime,
            FIXED_TIMESTEP_SECONDS * MAX_FIXED_UPDATES_PER_FRAME
        );

        let updateCount = 0;
        while (
            this.fixedUpdateAccumulator >= FIXED_TIMESTEP_SECONDS &&
            updateCount < MAX_FIXED_UPDATES_PER_FRAME
        ) {
            if (updateCount > 0) {
                input.update();
            }
            this.deltaTime = FIXED_TIMESTEP_SECONDS;
            this.didRunUpdateThisFrame = true;
            this.update();
            this.fixedUpdateAccumulator -= FIXED_TIMESTEP_SECONDS;
            updateCount++;
        }

        if (updateCount >= MAX_FIXED_UPDATES_PER_FRAME) {
            this.fixedUpdateAccumulator = 0;
        }
        if (updateCount === 0) {
            this.deltaTime = 0;
        }

        return;
    }
    
    update() {
        // 背景アセット待ちの間は暗転のまま止める（この間に入力で状態が動くと、
        // 待ちが明けた瞬間に別画面へ飛ぶ）。
        if (this.pendingStageStart) {
            this.updatePendingStageStart();
            return;
        }
        // 地図⇔ステータスの暗転中は入力を通さない（幕の裏で画面が入れ替わるので、
        // ここで決定が通ると「見えていない画面のボタン」を押したことになる）。
        if (this.updateScreenFade()) return;
        switch (this.state) {
            case GAME_STATE.TITLE:
                this.updateTitle();
                break;
            case GAME_STATE.PLAYING:
                this.updatePlaying();
                break;
            case GAME_STATE.DEFEAT:
                this.updateDefeat();
                break;
            case GAME_STATE.LEVEL_UP:
                this.updateLevelUpChoice();
                break;
            case GAME_STATE.PAUSED:
                this.updatePaused();
                break;
            case GAME_STATE.SHOP:
                this.updateShop();
                break;
            case GAME_STATE.GAME_OVER:
                this.updateGameOver();
                break;
            case GAME_STATE.STAGE_CLEAR:
                this.updateStageClear();
                break;
            case GAME_STATE.STAGE_SELECT:
                this.updateStageSelect();
                break;
            case GAME_STATE.SIDE_RESULT:
                this.updateSideResult();
                break;
            case GAME_STATE.GAME_CLEAR:
                this.updateGameClear();
                break;
            case GAME_STATE.ENDING:
                this.updateEnding();
                break;
            case GAME_STATE.INTRO:
                this.updateIntro();
                break;
        }
    }
    
    updateTitle() {
        this.titleSaveCheckTimerMs -= this.deltaTime * 1000;
        if (this.titleSaveCheckTimerMs <= 0) {
            this.hasSave = saveManager.hasSave();
            this.titleSaveCheckTimerMs = 700;
        }
        this.prefetchFirstStageAssets();
        const globalData = saveManager.loadGlobal();
        const isCleared = globalData.isGameCleared;
        const titleOptionCount = (this.hasSave || isCleared) ? 2 : 1;
        this.titleMenuIndex = Math.max(0, Math.min(titleOptionCount - 1, this.titleMenuIndex));
        if (this.titleDebugOpen) {
            this.updateTitleDebug();
            return;
        }

        // 新しいバージョンがあるときは中央モーダルで更新を促し、他の操作は通さない
        // （古いまま遊び始められると、直したはずの不具合の報告が続いてしまう）。
        // 逃げ道として右下⚙のデバッグメニューだけは開けるようにしておく
        // ＝万一検知が誤っても操作不能で詰まない。
        if (isUpdateAvailable()) {
            const modal = getUpdateModalLayout();
            const b = modal.button;
            if (input.isActionJustPressed('DEBUG_TOGGLE')) {
                this.titleDebugOpen = true;
                const count = this.getTitleDebugEntries().length;
                this.titleDebugCursor = Math.max(0, Math.min(count - 1, this.titleDebugCursor));
                checkForUpdate(true);
                audio.playSelect();
                return;
            }
            if (input.isActionJustPressed('CONFIRM')) {
                applyUpdate();
                return;
            }
            if (input.touchJustPressed) {
                const tX = input.lastTouchX;
                const tY = input.lastTouchY;
                const gearHit = getTitleScreenLayout(this.hasSave).gear.hit;
                if (tX >= gearHit.x && tX <= gearHit.x + gearHit.w &&
                    tY >= gearHit.y && tY <= gearHit.y + gearHit.h) {
                    this.titleDebugOpen = true;
                    const count = this.getTitleDebugEntries().length;
                    this.titleDebugCursor = Math.max(0, Math.min(count - 1, this.titleDebugCursor));
                    checkForUpdate(true);
                    audio.playSelect();
                    return;
                }
                if (tX >= b.x && tX <= b.x + b.w && tY >= b.y && tY <= b.y + b.h) {
                    applyUpdate();
                    return;
                }
            }
            return;
        }

        // 隠しコマンド: Qキーでデバッグメニュー開閉
        if (input.isActionJustPressed('DEBUG_TOGGLE')) {
            this.titleDebugOpen = !this.titleDebugOpen;
            if (this.titleDebugOpen) {
                const count = this.getTitleDebugEntries().length;
                this.titleDebugCursor = Math.max(0, Math.min(count - 1, this.titleDebugCursor));
                checkForUpdate(true);   // 開いた時点の最新状況を「再読み込み(更新)」行に出す
            }
            audio.playSelect();
            return;
        }

        // 何らかのキーが押されたらオーディオを初期化（ブラウザ制限対策）
        if (Object.keys(input.keysJustPressed).length > 0) {
            audio.init();
        }
        
        // 難易度選択（キーボード）
        // 先に判定のみ行い、returnはしない（JUMP同時押しの可能性への配慮だが、ArrowUpはJUMPと被るのでreturnすべき）
        // ArrowUpは UP と JUMP 両方のフラグを立てる仕様なので、ここでUPを処理したらJUMP処理（スタート）に行かないように return する
        // メニュー選択（上下キー）
        if (titleOptionCount > 1) {
            if (input.isActionJustPressed('UP')) {
                this.titleMenuIndex = (this.titleMenuIndex - 1 + titleOptionCount) % titleOptionCount;
                audio.playSelect();
                return;
            }
            if (input.isActionJustPressed('DOWN')) {
                this.titleMenuIndex = (this.titleMenuIndex + 1) % titleOptionCount;
                audio.playSelect();
                return;
            }
        }

        // 難易度選択（左右キー）
        if (input.isActionJustPressed('LEFT')) {
            this.difficultyIndex = (this.difficultyIndex - 1 + this.difficultyKeys.length) % this.difficultyKeys.length;
            this.updateDifficulty();
            audio.playSelect();
            return;
        }
        if (input.isActionJustPressed('RIGHT')) {
            this.difficultyIndex = (this.difficultyIndex + 1) % this.difficultyKeys.length;
            this.updateDifficulty();
            audio.playSelect();
        }
        
        // ENTERで開始
        if (input.isActionJustPressed('DEBUG_START')) {
            this.titleDebugApplyOnStart = false;
            this._handleTitleConfirm(isCleared);
            return;
        }

        // SPACE / Enter で決定
        if (input.isActionJustPressed('CONFIRM')) {
            this.titleDebugApplyOnStart = false;
            this._handleTitleConfirm(isCleared);
            return;
        }
        
        // タッチ操作対応
        if (input.touchJustPressed) {
            // iOS対策: 毎回呼んでOK（Runningなら無視される）
            audio.resume();
            
            // BGMが止まっていたら再生（タイトル画面）
            if (audio.context && audio.context.state === 'running') {
                 audio.playBgm('title');
            }

            const tX = input.lastTouchX;
            const tY = input.lastTouchY;
            const layout = getTitleScreenLayout(this.hasSave);
            const centerX = layout.centerX;

            // 右下⚙タッチでデバッグウィンドウ開閉（描画と同じ layout.gear を読む。
            // ⚙はセーフエリア退避で内側へ動くため、画面の角の固定矩形では見た目とズレる）
            const gearHit = layout.gear.hit;
            if (tX >= gearHit.x && tX <= gearHit.x + gearHit.w &&
                tY >= gearHit.y && tY <= gearHit.y + gearHit.h) {
                this.titleDebugOpen = !this.titleDebugOpen;
                const count = this.getTitleDebugEntries().length;
                this.titleDebugCursor = Math.max(0, Math.min(count - 1, this.titleDebugCursor));
                if (this.titleDebugOpen) checkForUpdate(true);
                audio.playSelect();
                return;
            }

            // 難易度変更エリア判定
            const diffY = layout.diffY;
            const diffHalfW = layout.diffButton.width * 0.5 + 17;
            const diffHalfH = layout.diffButton.height * 0.5 + 10;
            if (
                Math.abs(tX - centerX) <= diffHalfW &&
                Math.abs(tY - diffY) <= diffHalfH
            ) {
                this.difficultyIndex = (this.difficultyIndex + 1) % this.difficultyKeys.length;
                this.updateDifficulty();
                audio.playSelect();
                return;
            }

            // 開始ボタン押下時のみ開始 (判定を広めに)
            const globalData = saveManager.loadGlobal();
            const isCleared = globalData.isGameCleared;
            const startY = layout.startY;
            const startHalfW = layout.actionButton.width * 0.6 + 15;
            const startHalfH = layout.actionButton.height * 0.6 + 15;

            if (isCleared && !this.hasSave) {
                // ゴールド出陣（将軍）
                if (Math.abs(tX - centerX) <= startHalfW && Math.abs(tY - layout.startY) <= startHalfH) {
                    saveManager.saveGlobal({ characterType: 'shogun' });
                    this.titleDebugConfig.characterType = 'shogun';
                    this.startNewGame();
                    audio.playGameStart();
                    return;
                }
                // 通常出陣（忍者）
                if (Math.abs(tX - centerX) <= startHalfW && Math.abs(tY - layout.newGameY) <= startHalfH) {
                    saveManager.saveGlobal({ characterType: 'ninja' });
                    this.titleDebugConfig.characterType = 'ninja';
                    this.startNewGame();
                    audio.playGameStart();
                    return;
                }
            } else if (this.hasSave) {
                const continueY = startY;
                const newGameY = layout.newGameY;

                // 続きから
                if (Math.abs(tX - centerX) <= startHalfW && Math.abs(tY - continueY) <= startHalfH) {
                    this.titleMenuIndex = 0;
                    this.titleDebugApplyOnStart = false;
                    this.continueGame(saveManager.load());
                    audio.playGameStart();
                    return;
                }
                // 最初から
                if (Math.abs(tX - centerX) <= startHalfW && Math.abs(tY - newGameY) <= startHalfH) {
                    this.titleMenuIndex = 1;
                    this.titleDebugApplyOnStart = false;
                    if (isCleared) {
                        saveManager.saveGlobal({ isGameCleared: false, characterType: 'ninja' });
                    }
                    saveManager.deleteSave();
                    this.titleDebugConfig.characterType = 'ninja';
                    this.startNewGame();
                    audio.playGameStart();
                    return;
                }
            } else {
                // セーブなし：出陣
                if (Math.abs(tX - centerX) <= startHalfW && Math.abs(tY - layout.singleStartY) <= startHalfH) {
                    this.titleDebugApplyOnStart = false;
                    this.startNewGame();
                    audio.playGameStart();
                    return;
                }
            }
            return;
        }
    }

    _handleTitleConfirm(isCleared) {
        if (isCleared && !this.hasSave) {
            if (this.titleMenuIndex === 0) {
                saveManager.saveGlobal({ characterType: 'shogun' });
                this.titleDebugConfig.characterType = 'shogun';
            } else {
                saveManager.saveGlobal({ characterType: 'ninja' });
                this.titleDebugConfig.characterType = 'ninja';
            }
            this.startNewGame();
            audio.playGameStart();
            return;
        }
        if (this.hasSave) {
            if (this.titleMenuIndex === 0) {
                this.continueGame(saveManager.load());
            } else {
                if (isCleared) {
                    saveManager.saveGlobal({ isGameCleared: false, characterType: 'ninja' });
                }
                saveManager.deleteSave();
                this.titleDebugConfig.characterType = 'ninja';
                this.startNewGame();
            }
            audio.playGameStart();
            return;
        }
        this.startNewGame();
        audio.playGameStart();
    }

    updateTitleDebug() {
        const entries = this.getTitleDebugEntries();
        if (!entries.length) return;
        this.titleDebugCursor = Math.max(0, Math.min(entries.length - 1, this.titleDebugCursor));

        const actions = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'JUMP', 'PAUSE', 'DEBUG_START'];
        let activeAction = null;
        for (const action of actions) {
            if (input.isAction(action)) {
                activeAction = action;
                break;
            }
        }

        if (activeAction) {
            const isJustPressed = input.isActionJustPressed(activeAction);
            const deltaMs = this.deltaTime * 1000;

            if (isJustPressed) {
                this.executeTitleDebugAction(activeAction, entries);
                this.debugKeyRepeatTimer = 400; // 初回待機時間
            } else {
                this.debugKeyRepeatTimer -= deltaMs;
                if (this.debugKeyRepeatTimer <= 0) {
                    this.executeTitleDebugAction(activeAction, entries);
                    this.debugKeyRepeatTimer = 60; // リピート間隔
                }
            }
        } else {
            this.debugKeyRepeatTimer = 0;
        }

        // タッチ操作対応
        if (input.touchJustPressed) {
            this.handleTitleDebugTouch(entries);
        }
    }

    executeTitleDebugAction(action, entries) {
        if (action === 'UP') {
            this.titleDebugCursor = (this.titleDebugCursor - 1 + entries.length) % entries.length;
            audio.playSelect();
        } else if (action === 'DOWN') {
            this.titleDebugCursor = (this.titleDebugCursor + 1) % entries.length;
            audio.playSelect();
        } else if (action === 'LEFT') {
            entries[this.titleDebugCursor].change?.(-1);
            audio.playSelect();
        } else if (action === 'RIGHT') {
            entries[this.titleDebugCursor].change?.(1);
            audio.playSelect();
        } else if (action === 'JUMP') {
            const selected = entries[this.titleDebugCursor];
            if (selected.action) selected.action();
            else selected.change?.(1);
            audio.playSelect();
        } else if (action === 'PAUSE') {
            this.titleDebugOpen = false;
            audio.playSelect();
        } else if (action === 'DEBUG_START') {
            // ステータス画面表示・エンディング表示にフォーカスしている時はそのactionを実行
            // それ以外はデバッグ設定（開始階層・ボス部屋含む）を適用して新規開始
            // ※continueGameはセーブデータのステージで上書きするためデバッグ設定が反映されない。
            //   常にstartNewGame()を使うことで titleDebugConfig が確実に効く。
            const selected = entries[this.titleDebugCursor];
            const isPreviewEntry = selected.label === 'ステータス画面表示' || selected.label === 'エンディング表示';
            if (isPreviewEntry && selected.action) {
                selected.action();
                audio.playSelect();
            } else {
                this.titleDebugApplyOnStart = true;
                this.startNewGame();
                audio.playGameStart();
            }
        }
    }

    handleTitleDebugTouch(entries) {
        const tX = input.lastTouchX;
        const tY = input.lastTouchY;

        // 幾何は描画(renderTitleDebugWindow)と同じ getTitleDebugLayout から単一導出
        // （スマホでは複数列になるので、行の逆算も L.indexAt に任せる）
        const L = getTitleDebugLayout(entries.length);
        const { panelX, panelY, panelW, panelH } = L;

        // パネル範囲内かチェック
        if (tX >= panelX && tX <= panelX + panelW && tY >= panelY && tY <= panelY + panelH + 20) {
            const index = L.indexAt(tX, tY);

            if (index >= 0 && index < entries.length) {
                this.titleDebugCursor = index;
                const selected = entries[index];
                const cell = L.cellOf(index);

                if (selected.action) {
                    selected.action();
                } else if (selected.change) {
                    // その列の右半分で加算、左半分（ラベル側）で減算
                    selected.change(tX >= cell.x + cell.w * 0.5 ? 1 : -1);
                }
                audio.playSelect();
            }
        } else {
            // パネル外をタップしたら閉じる
            this.titleDebugOpen = false;
            audio.playSelect();
        }
    }

    startNewGame() {
        shop.reset();
        const debugStage = this.titleDebugApplyOnStart ? this.titleDebugConfig.stage : null;
        this.currentStageNumber = debugStage || this.debugStartStage || 1;
        // 新規開始で進行度をリセット（デバッグの途中開始では、その手前までを解放扱い）
        this.maxClearedStage = Math.max(0, this.currentStageNumber - 1);
        this.pendingStageSelection = null;
        // デバッグ用：開始地点フラグを保持（applyTitleDebugSetupToNewGame より前に確定）
        // URL(?at=corner3 / ?at=boss)はタイトルのデバッグメニューと同じ扱いにする。
        this.debugBossRoomStart = !!(this.titleDebugApplyOnStart && this.titleDebugConfig.bossRoom)
            || this.debugStartPoint === 'boss';
        this.debugStage6Corner3Start = this.debugStartPoint === 'corner3';
        // 三層目ラストはStage6専用なので、URL指定だけの場合もステージを6に寄せる
        if (this.debugStage6Corner3Start && this.currentStageNumber !== 6) this.currentStageNumber = 6;
        if (this.debugStage6Corner3Start) this.debugBossRoomStart = false; // 開始地点は排他
        this.player = new Player(100, this.groundY - PLAYER.HEIGHT, this.groundY);
        // クリア済みの場合、選択キャラタイプを反映（titleDebugApplyOnStartに関わらず）
        if (saveManager.loadGlobal().isGameCleared && this.titleDebugConfig.characterType === 'shogun') {
            this.player.characterType = 'shogun';
            applyShogunCombat(this.player);
        }
        this.player.unlockedWeapons = [];
        this.pendingLevelUpChoices = 0;
        // this.levelUpChoiceIndex = 0; // フェードアウト完了まで位置を維持
        this.levelUpInputLockMs = 0;
        this.levelUpRequireRelease = false;
        this.levelUpConfirmCooldownMs = 0;
        this.stageClearMenuIndex = 0;
        this.stageClearWeaponIndex = 0;
        this.returnToStageClearAfterShop = false;
        this.bombs = [];
        this.shockwaves = [];
        this.expGems = [];
        this.stageBossDefeatEffects = [];
        this.scrollX = 0; // スクロール位置リセット
        this.bossRoomPanArmed = false;   // ボス部屋の寄りの latch
        this.gameClearTimer = 0;
        this.endingTimer = 0;
        this.playerDefeatTimer = 0;
        
        this.initStage(this.currentStageNumber);
        this.applyTitleDebugSetupToNewGame();

        // 開始時点でセーブしておき、ゲームオーバー後に「続きから」でこのステージから
        // 再開できるようにする（デバッグでステージ選択して始めた場合も反映される）。
        // 通常クリア時のセーブ(次ステージ)とは別に、開始ステージを確実に残す。
        try {
            saveManager.save(this.player, this.currentStageNumber, this.unlockedWeapons || []);
            // 忍者/将軍も保存する。continueGame は loadGlobal().characterType を見て
            // キャラを復元するため、デバッグでキャラを切り替えて始めた場合も続きからに反映させる。
            saveManager.saveGlobal({ characterType: this.player.characterType || 'ninja' });
        } catch (e) { /* セーブ失敗時もゲーム進行は継続 */ }

        this.state = GAME_STATE.INTRO; // INTROから開始
        this.introTimer = 0;
        audio.playBgm('title'); // イントロ中もタイトル曲を流す
    }
    
    updateIntro() {
        this.introTimer += this.deltaTime * 1000;
        
        // 操作入力でのみプレイ開始（自動遷移しない）
        if (this.introTimer > 500 && (input.isActionJustPressed('CONFIRM') || input.wasScreenTapped())) {
            // ゲーム開始（フェードイン含む）
            this.requestStageStart();
        }
    }
    
    initStage(stageNum) {
        this.stage6CornerTransitionHold = null;
        this.stage6ArenaEntryArc = null;
        if (this.stage6ArenaApproach) {
            input.releaseAction('RIGHT', 'stage6Approach');
            if (this.player && Number.isFinite(this.stage6ArenaApproach.baseSpeed)) {
                this.player.speed = this.stage6ArenaApproach.baseSpeed;
            }
        }
        this.stage6ArenaApproach = null;
        this.stage6CameraLeadT = 0;
        this.stage6DuelLeadPx = STAGE6_DUEL_CAMERA_LEAD_PX;
        this.stage6DuelLeadTargetPx = STAGE6_DUEL_CAMERA_LEAD_PX;
        this.stage6DuelLeadVel = 0;
        this.stage = new Stage(stageNum);
        
        if (this.player) {
            // ステージ進行に合わせた武器の自動解禁（これまでの全武器を揃える）
            for (let s = 1; s <= stageNum; s++) {
                const defaultWeaponName = STAGE_DEFAULT_WEAPON[s];
                if (defaultWeaponName) {
                    if (!this.player.subWeapons.some(w => w.name === defaultWeaponName)) {
                        const weapon = createSubWeapon(defaultWeaponName);
                        if (weapon) {
                            this.player.subWeapons.push(weapon);
                            // セーブ用解禁リストにも同期
                            if (!this.unlockedWeapons.includes(defaultWeaponName)) {
                                this.unlockedWeapons.push(defaultWeaponName);
                            }
                        }
                    }
                }
            }
            if (typeof this.player.refreshSubWeaponScaling === 'function') {
                this.player.refreshSubWeaponScaling();
            }
            
            // 装備は「前ステージで選んだ武器」を優先。未装備時のみ初期装備を使う。
            const equipName = this.player.stageEquip?.[stageNum] || STAGE_DEFAULT_WEAPON[stageNum];
            if (equipName) {
                const index = this.player.subWeapons.findIndex(w => w.name === equipName);
                if (index !== -1) {
                    this.player.subWeaponIndex = index;
                    this.player.currentSubWeapon = this.player.subWeapons[index];
                }
            }
        }
    }

    updateDifficulty() {
        const key = this.difficultyKeys[this.difficultyIndex];
        this.difficulty = DIFFICULTY[key];
        const scrollMult = Number.isFinite(this.difficulty?.stage3ScrollMult) ? this.difficulty.stage3ScrollMult : 1.0;
        this.stage3AutoScrollSpeed = this.stage3AutoScrollBaseSpeed * scrollMult;
    }

    getStage5PlayerGroundProbeX() {
        const playerWidth = this.player.getWorldWidth();
        return this.stage.floorScrollDirection === 1
            ? this.player.x + playerWidth
            : this.player.x;
    }

    /**
     * 場が切り替わるときに、飛んでいる忍具を全部片付ける。
     * 【残すと次の場で忍具が出せなくなる】。手裏剣は canUse() が在空数で
     * 上限判定していて(Lv0は同時1発)、フロア遷移やステージ切替の間は
     * player.update を通さないので弾の life が減らず、前の階の1発が
     * 居座って新しい投擲を塞いでいた(実機フィードバック 2026-08-12)。
     * 投擲モーションの途中(subWeaponTimer)も同じ理由で畳む。
     */
    clearPlayerProjectiles() {
        const p = this.player;
        if (!p) return;
        p.subWeaponTimer = 0;
        p.subWeaponAction = null;
        for (const weapon of (p.subWeapons || [])) {
            if (!weapon) continue;
            if (weapon.projectiles) weapon.projectiles = [];
            if (weapon.cloneProjectiles) weapon.cloneProjectiles = [];
            if (weapon.pendingShots) weapon.pendingShots = [];
        }
        this.bombs = [];
        this.shockwaves = [];
    }

    updateStage5FloorTransition() {
        if (this.currentStageNumber !== 5 || !this.stage?.isFloorTransitioning) return false;

        const prevPhase = this.stage.floorTransitionPhase;
        this.stage.updateFloorTransition(this.deltaTime);
        const currentPhase = this.stage.floorTransitionPhase;

        // 完全に暗転した時点で次階へ移し、フェードイン中に旧位置が見えないようにする。
        if (prevPhase === 1 && currentPhase === 2) {
            const isRightDir = this.stage.floorScrollDirection === 1;
            const playerWidth = this.player.getWorldWidth();
            // 【着地点は降り口の階段の上】(指定 2026-08-15)。穴の絵と歩行判定は
            // 揃えてあるので、上から数段目に立たせる＝登ってきた途中から始まり、
            // そのまま歩いて框を越えて床へ上がる。
            // (床の上から始めた版は「登り切った後」になって却下、
            //  穴のど真ん中(旧・端から100px)は深すぎて空中に見えた)
            const holeW = (STAGE5_FLOOR.PREVIOUS_STAIR_VISIBLE_WIDTH || 200);
            const stairInset = 60; // 框から穴へ60px＝2〜3段下
            this.player.x = isRightDir
                ? holeW - stairInset - playerWidth
                : this.stage.maxProgress - holeW + stairInset;
            this.player.facingRight = isRightDir;

            const targetScrollX = isRightDir
                ? 0
                : Math.max(0, this.stage.maxProgress - CANVAS_WIDTH);
            this.scrollX = targetScrollX;
            this.stage.progress = targetScrollX;
            // 前の階に飛んでいた忍具を片付ける(残すと在空数の上限で次が撃てない)
            this.clearPlayerProjectiles();
            // 瞬間移動で鉢巻・髪の追従連鎖が伸び切るのを防ぐ(stage6の角遷移と同じ扱い)
            this.player.resetVisualTrails();
        }

        // 暗転中は入力更新を行わず、階段の接地点に固定する。
        // 走行位相も畳んで、暗転明けに走りポーズで現れないようにする。
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.legPhase = 0;
        this.player.isDashing = false;
        this.player.isCrouching = false;
        // 【本体を動かしたら鉢巻と髪も同じだけ動かす】。ここは player.update を
        // 通さないので追従ノードが更新されない。y だけ階段の接地点へ寄せると、
        // 根元だけ動いて残りが取り残され、鉢巻とポニテが伸び切る
        // (実機フィードバック 2026-08-12)。鉤縄の演出と同じ扱いにする。
        const trailPrevX = this.player.x;
        const trailPrevY = this.player.y;
        const groundProbeX = this.getStage5PlayerGroundProbeX();
        this.player.groundY = this.stage.getStairGroundY(groundProbeX);
        this.player.y = this.player.groundY + LANE_OFFSET - this.player.getWorldHeight();
        this.player.isGrounded = true;
        if (typeof this.player.translateVisualTrails === 'function') {
            this.player.translateVisualTrails(
                this.player.x - trailPrevX,
                this.player.y - trailPrevY
            );
        }

        this.stage.update(this.deltaTime, this.player);

        if (prevPhase === 3 && currentPhase === 0) {
            const targetScrollX = this.stage.floorScrollDirection === 1
                ? 0
                : Math.max(0, this.stage.maxProgress - CANVAS_WIDTH);
            this.scrollX = targetScrollX;
            this.stage.progress = targetScrollX;
        }

        return true;
    }

    /**
     * プレイヤーのワールド寸法を確定させる。
     * 将軍プレイヤーは素体40x60×2.0への切り替えを【初回 player.update()】で行うため、
     * update を通さない演出(遷移中の放物線着地など)の前に呼んでおかないと、
     * 忍者寸法(48x72)のまま=半分の大きさで描かれてしまう。
     * combatController.update は初期化しかしないので、dt=0 で呼んで問題ない。
     */
    ensurePlayerDimsReady() {
        const p = this.player;
        // combatController は Player のコンストラクタで【全キャラに】張られており、
        // 実際に使うかは characterType で分岐している(hasCombatControllerMethod)。
        // ここで無条件に呼ぶと忍者にも将軍の寸法(素体40x60×2.0)が入って巨大化する。
        if (!p || p.characterType !== 'shogun') return;
        if (!p.combatController || typeof p.combatController.update !== 'function') return;
        p.combatController.update.call(p, 0, [], []);
    }

    /**
     * 最上層に降り立ってから開戦までを【自動操作の会敵】にする。
     * プレイヤーはゆっくり右へ歩き、攻撃は封じられ、将軍が飛び降りて名乗るまで操作は返らない。
     * 最終決戦の入りを「操作を止めて見せる一続きの流れ」にするための演出。
     */
    beginStage6ArenaApproach() {
        if (!this.player) return;
        this.stage6ArenaApproach = {
            baseSpeed: this.player.speed,
            walking: true
        };
    }

    /**
     * 決戦構図のカメラ先行量。会敵〜登場演出の間だけ右へ寄せる。
     * 変化はスムーズステップ(両端で速度0)にする。等速で足し引きすると、
     * 着地の瞬間や開戦の瞬間にカメラ速度の段差が出て「ガクっ」と見える。
     */
    getStage6CameraLead() {
        const t = this.stage6CameraLeadT;
        return this.stage6DuelLeadPx * (t * t * (3 - 2 * t));
    }

    /**
     * 名乗り帯(画面中心)に対してプレイヤーとボスを左右対称に置くための先行量。
     * カメラは scrollX = プレイヤー中心 - 画面中心 + 先行量 なので、
     * 先行量 = 中心間距離 / 2 にすると両者の中点が画面中心＝帯の中心に乗る。
     * 【ボスが足を止めている間だけ採る】: 連撃の踏み込み中に追従すると
     * 段ごとの前進でカメラが揺れて「ガクっ」に戻る。
     */
    getStage6DuelSymmetricLead() {
        const s = this.stage;
        const b = s && s.boss;
        if (!b || !b.isAlive || b.isDying || !this.player) return null;
        if (!b.isGrounded || Math.abs(b.vx || 0) > 0.05) return null;
        const bw = typeof b.getWorldWidth === 'function' ? b.getWorldWidth() : (b.width || 0);
        const bossCenter = b.x + bw * 0.5;
        const playerCenter = this.player.x + this.player.getWorldWidth() * 0.5;
        const half = (bossCenter - playerCenter) * 0.5;
        return Math.max(0, Math.min(STAGE6_DUEL_LEAD_MAX_PX, half));
    }

    /**
     * ボス部屋でプレイヤーが止まる【名乗りの定位置】(ワールドX)。
     * カメラがボス部屋で止まった状態(scrollX = maxProgress - CANVAS_WIDTH)を基準に、
     * 名乗り帯の左端から BOSS_NAME_STAND_GAP_PX だけ手前へ置く。
     * 名乗り帯は画面座標なので、可視ワールド幅(CANVAS_WIDTH)への比で世界へ直す。
     * 帯の寸法は getBossNameBannerBox() が単一の出どころ(描画と共有)。
     */
    getBossNameStandLimitX() {
        const s = this.stage;
        if (!s || !this.player || !Number.isFinite(s.maxProgress)) return Infinity;
        const stopScrollX = Math.max(0, s.maxProgress - CANVAS_WIDTH);
        const banner = getBossNameBannerBox();
        const bannerLeftWorld = banner.x * (CANVAS_WIDTH / Math.max(1, SCREEN_WIDTH));
        const pw = this.player.getWorldWidth();
        return stopScrollX + bannerLeftWorld - BOSS_NAME_STAND_GAP_PX - pw;
    }

    /**
     * 名乗りの定位置でプレイヤーを止める窓か。
     * 開戦前から効かせる ＝ そもそも定位置より先へ行けない。
     *
     * 【ボスがそこで湧く場所でだけ効かせる】。判定は stage.updateBossSpawn の
     * canSpawnBoss と同じ条件に揃える。Stage5は最終フロアでしか湧かないのに
     * 全フロアで壁が立ち、階段へ行けず詰んでいた(実機フィードバック 2026-08-12)。
     * Stage6の最上層は会敵歩行＋カメラ先行の専用演出なので対象外。
     */
    isBossNameStandHoldActive() {
        const s = this.stage;
        if (!s || !this.player) return false;
        if (this.currentStageNumber === 6) return false;
        if (s.sideKind) return false;               // 寄り道(蔵/道場)にボスは居ない
        if (s.bossDefeated) return false;
        // Stage5: ボスは最終フロアだけ。途中のフロアは階段まで歩かせる。
        if (this.currentStageNumber === 5
            && Number.isFinite(s.currentFloor) && Number.isFinite(s.maxFloor)
            && s.currentFloor < s.maxFloor) return false;
        if (!s.bossSpawned) return true;            // 開戦前も壁を効かせる
        return !!(typeof s.isBossIntroBeforeCall === 'function' && s.isBossIntroBeforeCall());
    }

    /**
     * 【プレイヤーは定位置より前へ進めない】。
     * 以前は会敵の瞬間に前進の勢いだけを殺していたが、カメラがプレイヤーを
     * 画面中央に置いて追う以上、開戦時点のプレイヤーは必ず画面中央＝名乗り帯の
     * 真下に来る。そこから左の構図へ持っていくにはプレイヤーを動かすしかなく、
     * 「無理やり左へずらされる」感触が残っていた(実機フィードバック 2026-08-12)。
     *
     * 定位置に見えない壁を置き、そこから先はカメラだけで詰める(updateBossRoomCameraPan)。
     * プレイヤーは自分で歩いて止まるだけなので、押し戻される動きが一切出ない。
     * ボスの登場目標Xは帯の中心に対するプレイヤーの鏡像(getBossSymmetricEntranceTargetX)
     * なので、定位置が決まれば左右対称の構図もそのまま決まる。
     */
    holdPlayerAtBossNameStand() {
        const p = this.player;
        if (!p) return;
        const limit = this.getBossNameStandLimitX();
        if (Number.isFinite(limit) && p.x > limit) {
            p.x = limit;
            if (p.vx > 0) p.vx = 0;
        }
        // 名乗りの間は前進の慣性も殺す(空中の勢いで壁を擦り続けないように)。
        // handleInput は接地時しか vx を落とさないため、ここで空気抵抗を掛ける。
        if (p.vx > 0 && this.stage?.isBossIntroBeforeCall?.()) {
            p.vx *= 0.82;
            if (p.vx < 0.05) p.vx = 0;
        }
    }

    /**
     * 定位置で足を止めた後、【残りはカメラだけで詰める】。
     * プレイヤーが画面中央より手前で止まるぶん、追従だけではカメラがボス部屋の
     * framing(maxProgress - CANVAS_WIDTH)まで届かない。届かないとボスの湧き条件
     * (progress >= その値)も満たされないので、ここで寄せる。
     * 一度始めたら latch して最後まで送る(被弾で下がってもカメラは戻らない)。
     */
    updateBossRoomCameraPan() {
        const s = this.stage;
        if (!s || !this.player) return;
        const stopScrollX = Math.max(0, s.maxProgress - CANVAS_WIDTH);
        if (this.scrollX >= stopScrollX) return;
        if (!this.bossRoomPanArmed) {
            const limit = this.getBossNameStandLimitX();
            if (!Number.isFinite(limit) || this.player.x < limit - 1) return;
            this.bossRoomPanArmed = true;
        }
        const dt = Math.max(0, Math.min(1 / 30, this.deltaTime));
        const remain = stopScrollX - this.scrollX;
        const step = Math.max(
            remain * (1 - Math.exp(-BOSS_ROOM_PAN_OMEGA * dt)),
            Math.min(remain, BOSS_ROOM_PAN_MIN_SPEED * dt)
        );
        this.scrollX += step;
        if (stopScrollX - this.scrollX < 0.5) this.scrollX = stopScrollX;
    }

    updateStage6CameraLead() {
        const s = this.stage;
        const inArena = !!(s && s.isStage6Arena && s.isStage6Arena());
        const duel = inArena && (!!this.stage6ArenaApproach || !!s.bossIntroPhase);
        const step = Math.max(0, this.deltaTime) * 1000
            / (duel ? STAGE6_DUEL_LEAD_IN_MS : STAGE6_DUEL_LEAD_OUT_MS);
        this.stage6CameraLeadT = duel
            ? Math.min(1, this.stage6CameraLeadT + step)
            : Math.max(0, this.stage6CameraLeadT - step);

        // 着地(impact)以降は対称構図へ。会敵歩行中は既定量のまま
        // (歩いてくる間はボスが鯱の上＝遠いので、対称にすると引きすぎる)。
        // 【開戦後(duel=false)は目標を戻さない】。戻すと t のフェードアウトと
        // 逆向きに先行量が伸びて、開戦直後にカメラが右へ32px膨らんでから戻る。
        const symmetricPhase = inArena && (s.bossIntroPhase === 'impact'
            || s.bossIntroPhase === 'name' || s.bossIntroPhase === 'ready');
        if (symmetricPhase) {
            const target = this.getStage6DuelSymmetricLead();
            if (Number.isFinite(target)) this.stage6DuelLeadTargetPx = target;
        } else if (duel) {
            this.stage6DuelLeadTargetPx = STAGE6_DUEL_CAMERA_LEAD_PX;
        }
        // 臨界減衰: x'' = -2ω x' - ω²(x - target)
        const dt = Math.max(0, Math.min(1 / 30, this.deltaTime));
        const w = STAGE6_DUEL_LEAD_OMEGA;
        const dx = this.stage6DuelLeadPx - this.stage6DuelLeadTargetPx;
        this.stage6DuelLeadVel += (-2 * w * this.stage6DuelLeadVel - w * w * dx) * dt;
        this.stage6DuelLeadPx += this.stage6DuelLeadVel * dt;
    }

    /** 会敵歩行の更新。player.update より前に呼び、入力を代行する。 */
    updateStage6ArenaApproach() {
        const ap = this.stage6ArenaApproach;
        if (!ap) return;
        const s = this.stage;
        const inArena = !!(s && s.isStage6Arena && s.isStage6Arena());
        // 開戦して登場演出まで終わったら操作を返す
        const introDone = !!(s && s.bossSpawned) && !s.bossIntroPhase;
        if (!inArena || introDone || !this.player || this.player.hp <= 0) {
            input.releaseAction('RIGHT', 'stage6Approach');
            if (this.player && Number.isFinite(ap.baseSpeed)) this.player.speed = ap.baseSpeed;
            this.stage6ArenaApproach = null;
            return;
        }
        // 開戦したら足を止めて相対する(将軍の飛び降り〜名乗りを見せる)
        const shouldWalk = !s.bossSpawned;
        if (shouldWalk) {
            this.player.speed = ap.baseSpeed * STAGE6_APPROACH_SPEED_SCALE;
            input.pressAction('RIGHT', 'stage6Approach');
        } else {
            input.releaseAction('RIGHT', 'stage6Approach');
            this.player.speed = ap.baseSpeed;
        }
        this.player.facingRight = true;
        // 会敵中は抜刀させない(歩いて対峙するまでが一続きの演出)
        this.player.attackInputLockTimer = Math.max(this.player.attackInputLockTimer || 0, 90);
    }

    /**
     * 最上層へ飛び乗る放物線を1フレーム進める。
     * 暗転中と【暗転が明けた後】の両方から呼ぶ。明けた瞬間に打ち切ると
     * 「画面外から屋根へ飛び込む」一番の見せ場が暗幕の中で終わってしまうため、
     * アークは遷移より長く取り、明けてからの数百msも同じ式で飛ばす。
     * @param {boolean} advance 経過時間を進めるか(暗転の待ちに入る前は進めない)
     * @returns {boolean} アークが継続中なら true
     */
    stepStage6ArenaEntryArc(advance) {
        const entryArc = this.stage6ArenaEntryArc;
        if (!entryArc) return false;
        if (advance) {
            entryArc.elapsed = (entryArc.elapsed || 0) + this.deltaTime * 1000;
        }
        // 浮動小数の誤差で elapsed が dur にごく僅かに届かず(0.99999…)、
        // 最後に「何も進まない1コマ」が挟まって着地の瞬間だけ背景が止まる。
        // 0.999 以上は着地扱いにして、最終フレームに残りの移動を必ず載せる。
        const rawT = (entryArc.elapsed || 0) / Math.max(1, entryArc.dur);
        const t = rawT >= 0.999 ? 1 : Math.max(0, rawT);
        // 【屋根の裏で待つ区間】。holdT までは動かない(クリップで見えない)。
        // 暗転が明けてから登り始めるための待ちで、以降を 0..1 に伸ばして使う。
        const holdT = Math.max(0, Math.min(0.95, entryArc.holdT || 0));
        const u = holdT > 0
            ? (t <= holdT ? 0 : (t - holdT) / (1 - holdT))
            : t;
        const prevX = this.player.x;
        const prevY = this.player.y;
        this.player.groundY = this.stage.getStage6ArenaGroundY();
        // 横は「速く入って着地際で歩行速度まで落ちる」二次曲線。
        //   ex(u) = 1.818u - 0.818u^2  → ex(1)=1 / ex'(1)≈0.18(平均の18%)
        // 着地の瞬間の横速度を歩行と揃えるのが要点。等速で入って着地で0になると、
        // 追従カメラの速度も同時に落ちて背景の流れが「ガクっ」と切り替わる。
        const ex = 1.818 * u - 0.818 * u * u;
        this.player.x = entryArc.fromX + (entryArc.toX - entryArc.fromX) * ex;
        // 縦は弾道。sin項は u=1 で0になるので着地点は不変。
        // 下から登る場合(fromBelow)は棟を越える跳び上がり、上から来る場合は落下弧。
        this.player.y = entryArc.fromY + (entryArc.toY - entryArc.fromY) * (u * u)
            - (entryArc.peak || 0) * Math.sin(Math.PI * u);
        // カメラは専用イージング(セットアップ参照)。固定にすると背景が止まったまま
        // プレイヤーだけ画面を横切り、着地後に急に背景が動き出す。追従にすると
        // クランプを離れる瞬間に速度の段差が出る。
        if (entryArc.camTo != null) {
            this.scrollX = this.getStage6ArenaEntryArcCamX(entryArc, u);
            this.stage.progress = this.scrollX;
        }
        this.player.facingRight = true;
        // 本体を直接動かす演出なので、髪・鉢巻の物理ノードも同じ差分で運ぶ。
        // これをやらないと根元だけが移動し、鉢巻とポニーテールが伸び切る。
        if (typeof this.player.translateVisualTrails === 'function') {
            this.player.translateVisualTrails(this.player.x - prevX, this.player.y - prevY);
        }
        if (t >= 1) {
            this.finishStage6ArenaEntryArc();
            return false;
        }
        this.player.isGrounded = false;
        // 落下ポーズを出すため実測の落下速度を入れる(playerRendererはvyを見る)
        this.player.vy = this.deltaTime > 0
            ? (this.player.y - prevY) / this.deltaTime * 0.016
            : 4;
        return true;
    }

    /**
     * 最上層への放物線着地を完了させる。棟の上へ着地させ、足元に土煙と着地音を出す。
     * 遷移が終わってもアークが残っていたら、ここで必ず閉じる(空中で固まらせない)。
     */
    /**
     * 最上層へ飛び乗るアークのカメラを仕込む(本番遷移/デバッグ開始で共用)。
     * カメラは【プレイヤー追従ではなく専用イージング】で動かす。
     *   ・追従 → クランプに張り付いて静止した後、途中で急に十数px/frameで動き出す
     *   ・固定 → 背景が止まったまま着地し、直後に急に流れ出す
     * どちらも遷移時の「スクロールがガクっとなる」原因なので、
     *   t=0 の速度 = 0        (静止から滑らかに動き出す)
     *   t=1 の速度 = 自動歩行 (背景の流れる速さが着地の前後で一致する)
     * を満たす三次エルミートで開始位置→着地後位置を結ぶ。
     */
    setupStage6ArenaEntryArcCamera(arc) {
        if (!arc) return;
        // 尺はフレーム数の整数倍に丸める。端数が残ると最終フレームだけ
        // 「ほぼ0しか進まない1コマ」ができ、着地の瞬間だけ背景が止まって見える。
        const frameMs = 1000 / 60;
        arc.dur = Math.max(frameMs, Math.round(arc.dur / frameMs) * frameMs);
        const clampCam = (x) => Math.min(
            this.stage.getStage6ArenaCameraMaxX(),
            Math.max(
                this.stage.getStage6ArenaCameraMinX(),
                x + this.player.getWorldWidth() * 0.5 - CANVAS_WIDTH / 2
            )
        );
        arc.camFrom = clampCam(arc.fromX);
        arc.camTo = clampCam(arc.toX);
        const span = arc.camTo - arc.camFrom;
        // カメラも「屋根の裏で待つ区間(holdT)」を除いた実働フレーム数で傾きを出す。
        // 全尺で計算すると、待ちのぶん傾きが小さくなって着地時の背景速度が歩行と合わない。
        const activeRatio = Math.max(0.05, 1 - Math.max(0, Math.min(0.95, arc.holdT || 0)));
        const frames = Math.max(1, arc.dur * activeRatio / (1000 / 60));
        const walkStep = (this.player.speed || PLAYER.SPEED) * STAGE6_APPROACH_SPEED_SCALE;
        // 着地時の傾き(平均速度に対する比)。0〜3 の範囲なら単調増加が保証される。
        arc.camEndSlope = span > 1
            ? Math.max(0.2, Math.min(3, walkStep * frames / span))
            : 1;
        this.scrollX = arc.camFrom;
        this.stage.progress = this.scrollX;
        this.stage.lastProgress = this.scrollX;
    }

    /** アークのカメラ位置。h(0)=0 h(1)=1 h'(0)=0 h'(1)=camEndSlope の三次エルミート。 */
    getStage6ArenaEntryArcCamX(arc, t) {
        const s = arc.camEndSlope != null ? arc.camEndSlope : 1;
        const h = (s - 2) * t * t * t + (3 - s) * t * t;
        return arc.camFrom + (arc.camTo - arc.camFrom) * h;
    }

    finishStage6ArenaEntryArc() {
        const arc = this.stage6ArenaEntryArc;
        if (!arc) return;
        this.stage6ArenaEntryArc = null;
        this.player.x = arc.toX;
        this.player.y = arc.toY;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.isGrounded = true;
        this.player.groundY = this.stage.getStage6ArenaGroundY();
        this.spawnGroundDust(
            this.player.x + this.player.getWorldWidth() * 0.5,
            this.player.y + this.player.getWorldHeight(),
            { intensity: 0.85, count: 9, spread: 0.6, speed: 1.25, rise: 0.5, size: 9 }
        );
        if (typeof audio.playLanding === 'function') audio.playLanding();
        // 【着地したらフェードインの残りは切り上げる】。遷移中は player.update が回らず
        // 自動歩行も止まるため、残り数フレームぶん「背景が完全停止」してから動き出す=
        // 明けた瞬間のガクつきになる。残り暗転は数%なので即終了して問題ない。
        if (this.stage?.isFloorTransitioning && this.stage.floorTransitionPhase === 3) {
            this.stage.isFloorTransitioning = false;
            this.stage.floorTransitionPhase = 0;
            this.stage.floorTransitionTimer = 0;
        }
        // 着地からそのまま自動操作の会敵へ繋ぐ
        this.beginStage6ArenaApproach();
    }

    /** Stage6 角(隅櫓)遷移の更新。updateStage5FloorTransition のミラー。 */
    updateStage6CornerTransition() {
        if (this.currentStageNumber !== 6 || !this.stage?.isFloorTransitioning) return false;

        const prevPhase = this.stage.floorTransitionPhase;
        this.stage.updateFloorTransition(this.deltaTime);
        const currentPhase = this.stage.floorTransitionPhase;
        let didSnapToNextFloor = false;

        // 完全暗転の瞬間: 壁の先へスナップ。カメラはプレイヤーの手前に置き、
        // くぐってきた壁が画面左に残る構図にする(後退クランプで壁は一方通行)。
        // stage5と違い世界座標は連続なので progress はスナップ先に合わせるだけ。
        if (prevPhase === 1 && currentPhase === 2) {
            if (this.stage.isStage6Arena()) {
                // 左棟端の軒へ鎖鎌を掛けて登っているため、暗転明けも同じ左棟端へ着地する。
                // 中央へ飛ばすと登攀の入口と到着地点が繋がらず、右から来たように見えてしまう。
                const landingX = this.stage.getStage6ArenaLeft() + STAGE6_CORNER.ARENA_LANDING_INSET_PX;
                // 放物線の間は player.update を通さないので、ここで将軍の寸法を確定させる
                // (未確定だと忍者寸法のまま=半分の大きさで飛んでくる)
                this.ensurePlayerDimsReady();
                // 着地は大棟の上。ここで合わせないと暗転明けの1フレームだけ
                // 斜面に立ってから棟へ跳ね上がる。
                this.player.groundY = this.stage.getStage6ArenaGroundY();
                const landingY = this.player.groundY + LANE_OFFSET - this.player.getWorldHeight();
                // 【三層目からの続き】鎖鎌で画面上へ抜けた実際の位置を放物線の始点にする。
                // 起点を着地点の近くに置くと「どこからともなく降ってくる」に見えるので、
                // 軒に鎌を掛けて引き上げられた座標(=hold)からそのまま繋ぐ。
                // 暗転(待機)の間に大半を移動し、フェードインでは着地際だけを見せる。
                const exit = this.stage6CornerTransitionHold;
                this.stage6ArenaEntryArc = {
                    // 【下から登ってくる】。鎖鎌で軒へ登ってきた続きなので、
                    // 屋根の裏(向こう側の斜面)から大棟へ上がる絵にする。
                    // 空から降ってくる弧にすると「登ってきたはずが降ってくる」になる。
                    fromX: exit ? landingX - STAGE6_ARENA_ENTRY_RUN_PX : landingX - 300,
                    fromY: exit ? landingY + STAGE6_ARENA_ENTRY_DEPTH_PX : landingY - 300,
                    toX: landingX,
                    toY: landingY,
                    elapsed: 0,
                    fromExit: !!exit,
                    fromBelow: !!exit,
                    // 上がり切るまでは屋根の裏で待つ(クリップで見えない)。
                    // 暗転が明けてから登り始めるための待ち。
                    holdT: exit ? STAGE6_ARENA_ENTRY_HOLD_T : 0,
                    // 大棟を越える跳び上がりの高さ(頂点は棟より約114px上)。
                    peak: exit ? STAGE6_ARENA_ENTRY_PEAK_PX : 0,
                    // 【暗転が明けきってからの飛び込みを見せる】ため、遷移より
                    // STAGE6_ARENA_ENTRY_FLYIN_MS だけ長く取る。アークは遷移終了後も
                    // stepStage6ArenaEntryArc で継続する(updatePlaying 側から呼ぶ)。
                    dur: exit
                        ? Math.max(240, (this.stage.transitionWaitMs || 0)
                            + this.stage.transitionFadeInMs + STAGE6_ARENA_ENTRY_FLYIN_MS)
                        : Math.max(140, this.stage.transitionFadeInMs - 16)
                };
                this.setupStage6ArenaEntryArcCamera(this.stage6ArenaEntryArc);
                this.player.x = this.stage6ArenaEntryArc.fromX;
                this.player.y = this.stage6ArenaEntryArc.fromY;
                this.player.isGrounded = false;
            } else {
                this.player.x = this.stage.lastClimbedCornerX + STAGE6_CORNER.SNAP_AFTER_PX;
                this.scrollX = this.player.x - STAGE6_CORNER.POST_FADE_CAMERA_LAG;
            }
            this.player.facingRight = true;
            this.stage.progress = this.scrollX;
            this.stage.lastProgress = this.scrollX; // progressDeltaスパイク防止
            this.stage6CornerTransitionHold = null;
            didSnapToNextFloor = true;
        }

        // 鎖鎌で画面上へ抜けた場合、フェードアウトが完了するまでは抜けた座標を保持する。
        // 共通の地面固定を即適用すると「登った直後に元の床へ戻る」1フレームが見える。
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.legPhase = 0;
        this.player.isDashing = false;
        this.player.isCrouching = false;
        const hold = currentPhase === 1 ? this.stage6CornerTransitionHold : null;
        const entryArc = this.stage6ArenaEntryArc;
        if (hold) {
            this.player.x = hold.x;
            this.player.y = hold.y;
            this.player.isGrounded = false;
        } else if (entryArc) {
            // 最上層へ上がる瞬間だけ: 引き上げられた勢いの続きで放物線を描いて棟へ降りる。
            // 軒からの続き(fromExit)は暗転中(phase2)から動かし、遠い距離を暗転で稼ぐ。
            // 起点が着地点の近くにある場合(デバッグ開始)はフェードイン中だけ動かす。
            this.stepStage6ArenaEntryArc(
                currentPhase >= 3 || (entryArc.fromExit && currentPhase >= 2)
            );
        } else {
            const groundProbeX = this.getStage5PlayerGroundProbeX();
            // 最上階へ上がった後は大棟の上が足元ライン。階段用のgroundYで上書きしない。
            this.player.groundY = (this.stage.isStage6Arena && this.stage.isStage6Arena())
                ? this.stage.getStage6ArenaGroundY()
                : this.stage.getStairGroundY(groundProbeX);
            this.player.y = this.player.groundY + LANE_OFFSET - this.player.getWorldHeight();
            this.player.isGrounded = true;
        }
        // 物理ノードの張り直しは、転移先のxだけでなく着地後のyも確定してから行う。
        // 先にリセットすると、鎖鎌で画面上へ抜けた座標に髪・鉢巻だけが残り、
        // 暗転明けの1フレーム目から伸び切った状態になる。
        if (didSnapToNextFloor) {
            // 前の面に飛んでいた忍具も片付ける(残すと在空数の上限で次が撃てない)
            this.clearPlayerProjectiles();
            if (typeof this.player.resetVisualTrails === 'function') {
                this.player.resetVisualTrails();
            }
        }

        // かつてはここで「遷移が終わったらアークを強制着地」させていたが、
        // 暗転が明けてからの飛び込みを見せるためにアークを遷移より長く取ったので、
        // 強制着地させると t<1 で切れて着地位置とカメラがずれる(実測: 画面x 616→676)。
        // 遷移後は updatePlaying 側の stepStage6ArenaEntryArc が続きを回す。

        this.stage.update(this.deltaTime, this.player);

        return true;
    }

    /**
     * Stage6 角3: 鎖鎌を頭上の軒へ掛けて登る演出の更新。
     * 演出中は入力を止め、プレイヤーを鎖に引かれて上へ移動させる。
     * 登り切ったら暗転遷移(=大屋根への着地)へ引き継ぐ。
     */
    updateStage6GrappleClimb() {
        const st = this.stage;
        if (this.currentStageNumber !== 6 || !st?.isStage6Grappling()) return false;

        const done = st.updateStage6GrappleClimb(this.deltaTime);
        this.player.vx = 0;
        this.player.legPhase = 0;
        this.player.isDashing = false;
        this.player.isCrouching = false;
        // 演出中は player.update() が走らないので subWeaponTimer が自動減衰しない。
        // 毎フレーム書き直して playerRenderer の鎖鎌登攀ポーズを維持する。
        this.player.subWeaponAction = '鎖鎌登攀';
        this.player.subWeaponTimer = 1;
        this.player.grappleState = st.stage6Grapple;

        const prevX = this.player.x;
        const prevY = this.player.y;
        if (done || st.getStage6GrapplePhase() === GRAPPLE_PHASE.PULL) {
            // 引き上げ: 二次ベジェで鎌へ寄りながら上昇し、軒の頂点で減速する。
            const pullPos = st.getStage6GrapplePullPosition(this.player.getWorldWidth());
            if (pullPos) {
                this.player.x = pullPos.x;
                this.player.y = pullPos.y;
            }
            this.player.isGrounded = false;
            // 空中ポーズ(playerRenderer:2537の汎用処理)が上昇速度に反応するよう実速度を入れる
            this.player.vy = this.deltaTime > 0 ? (this.player.y - prevY) / this.deltaTime * 0.016 : -6;
        } else {
            // 縄を投げている間は足元に固定
            this.player.groundY = st.baseGroundY;
            this.player.y = st.baseGroundY + LANE_OFFSET - this.player.getWorldHeight();
            this.player.vy = 0;
            this.player.isGrounded = true;
        }
        // 通常のplayer.update()を止めている演出なので、本体の座標差分を髪・鉢巻の
        // 全物理ノードへ同時適用する。根元だけ追従させると旧位置から伸び切ってしまう。
        this.player.translateVisualTrails(
            this.player.x - prevX,
            this.player.y - prevY
        );
        // 鉤を投げた瞬間に解いた分身の煙も、ここで老化させて登攀中に消え切らせる。
        // (player.update が走らないため、放置すると煙が凍ったまま引き上げられる)
        if (typeof this.player.updateSpecialSmoke === 'function') {
            this.player.updateSpecialSmoke(this.deltaTime);
        }

        // 手元(鎖の起点)は playerRenderer が前フレームに実測した「左上からの相対」を使う。
        // 相対で受け取るので、引き上げで大きく動いても縄が手から離れない。
        // 初回フレームだけは未実測なので startGrapple の胸元推定値が使われる。
        const pcx = this.player.x + this.player.getWorldWidth() * 0.5;
        const pcy = this.player.y + this.player.getWorldHeight() * 0.35;
        const hand = this.player.grappleHandAnchor;
        st.updateStage6GrappleVisual(
            this.deltaTime,
            hand ? this.player.x + hand.dx : undefined,
            hand ? this.player.y + hand.dy : undefined,
            pcx, pcy
        );

        st.update(this.deltaTime, this.player);

        if (done) {
            // 暗転が黒になるまで、この「屋根の上へ抜けた位置」を保持する。
            this.stage6CornerTransitionHold = {
                x: this.player.x,
                y: this.player.y
            };
            this.player.subWeaponAction = null;
            this.player.subWeaponTimer = 0;
            this.player.grappleState = null;
            this.player.grappleHandAnchor = null;
            // 登り切った → 暗転して大屋根へ
            st.startCornerTransition();
        }
        return true;
    }

    updatePlaying() {
        // 現ステージの読み込み/デコードが落ち着いた頃に、次ステージの先読みを始める。
        // クリアまで数分あるので、幕間に着く頃には揃っている。
        if (this._nextStagePrefetchMs > 0) {
            this._nextStagePrefetchMs -= this.deltaTime * 1000;
            if (this._nextStagePrefetchMs <= 0) this.prefetchNextStageAssets();
        }

        // ポーズ
        if (input.isActionJustPressed('PAUSE')) {
            this.pauseReturnState = GAME_STATE.PLAYING;
            this.state = GAME_STATE.PAUSED;
            audio.pauseBgm();
            return;
        }

        // フロア/角遷移中は移動入力を受け付けず、暗転処理だけを進める。
        if (this.updateStage5FloorTransition()) return;
        if (this.updateStage6CornerTransition()) return;
        // 暗転が明けてもアークが残っている間は、同じ式で飛行を続ける。
        // (屋根へ飛び込む瞬間を暗幕の中で終わらせないため。着地でアークは閉じる)
        if (this.stage6ArenaEntryArc) {
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.legPhase = 0;
            this.player.isDashing = false;
            this.player.isCrouching = false;
            this.stepStage6ArenaEntryArc(true);
            this.stage.update(this.deltaTime, this.player);
            return;
        }
        if (this.updateStage6GrappleClimb()) return;
        
        // プレイヤー更新
        // NOTE:
        // ここでは「前フレーム末の敵リスト」を使って操作/追尾を進める。
        // 当たり判定側は stage.update 後に取り直し、画面端スポーン直後の1フレ遅延を避ける。
        const preFrameEnemies = this.stage.getAllEnemies();
        const preActiveFrameEnemies = preFrameEnemies.filter((enemy) => enemy.isAlive && !enemy.isDying);
        const activeObstacles = this.stage.obstacles.filter(o => !o.isDestroyed);
        const stage4RoofColliders = (this.currentStageNumber === 4 && this.stage && typeof this.stage.getStage4RoofColliders === 'function')
            ? this.stage.getStage4RoofColliders(this.scrollX - 200, this.scrollX + CANVAS_WIDTH + 200)
            : [];
        // 最上階の金鯱は実体。頭の上は足場になり、横からは通り抜けられない。
        const stage6ArenaColliders = (this.currentStageNumber === 6 && this.stage && typeof this.stage.getStage6ArenaColliders === 'function')
            ? this.stage.getStage6ArenaColliders()
            : [];
        // サイドステージ(小判蔵の木箱足場など)用の汎用フック。stage4/6 の専用取得と
        // 同じ「上から乗れる足場」を currentStageNumber に依存せず提供できる。
        const sideStageColliders = (this.stage && typeof this.stage.getPlatformColliders === 'function')
            ? this.stage.getPlatformColliders()
            : [];
        const extraColliders = stage4RoofColliders.concat(stage6ArenaColliders, sideStageColliders);
        const playerPhysicsObstacles = extraColliders.length > 0
            ? activeObstacles.concat(extraColliders)
            : activeObstacles;
        // 最上層の会敵歩行(自動操作)。入力を読む前に代行キーを押す。
        this.updateStage6ArenaApproach();
        this.updateStage6CameraLead();
        // 【ボスの登場〜名乗りの間はプレイヤーも足を止める】。攻撃は attackInputLockTimer が
        // 封じているが移動は素通しで、対称に組んだ会敵の構図が名乗りの間に崩れていた。
        // 窓はボスの無敵と同じ isBossIntroBeforeCall(approach/impact/name)。
        // Stage6の会敵歩行(自動操作)は bossSpawned と同時に歩きを止める設計
        // (updateStage6ArenaApproach の shouldWalk=!bossSpawned)なので、この窓と重ならない。
        // 毎フレーム上書き式なのでフェーズを抜けた瞬間に自然解除される(入力の押し直しも不要)。
        const introPlayerLock = !!(this.stage
            && typeof this.stage.isBossIntroBeforeCall === 'function'
            && this.stage.isBossIntroBeforeCall());
        if (introPlayerLock && this.player) {
            this.player.introControlLockTimer = Math.max(this.player.introControlLockTimer || 0, 90);
        }
        this.player.update(this.deltaTime, playerPhysicsObstacles, preActiveFrameEnemies);
        // 名乗りの定位置で足を止める。開戦前から効かせる＝そもそも先へ行けない。
        if (this.isBossNameStandHoldActive()) this.holdPlayerAtBossNameStand();

        // ジャンプ着地の土煙（落下速度が一定以上のときだけ・足元から低く広がる）
        if (this.player.justLanded && this.player.landingImpactSpeed > 2.2) {
            const inten = Math.min(1, (this.player.landingImpactSpeed - 2.2) / 7);
            this.spawnGroundDust(
                this.player.x + this.player.getWorldWidth() * 0.5,
                this.player.y + this.player.getWorldHeight(),
                { intensity: inten, count: 6, spread: 0.5, speed: 1.15, rise: 0.5, size: 7, color: '150, 138, 120' }
            );
        }

        // 爆弾投げ処理は player.update 内で実行されるため削除
        
        // 武器切り替えは player.handleInput() 内で処理されるため、ここでは不要
        
        // --- スクロール処理 ---
        const stage3AutoScrollActive = (this.currentStageNumber === 3 && this.stage && !this.stage.bossSpawned);
        const screenCenter = CANVAS_WIDTH / 2;

        if (stage3AutoScrollActive) {
            this.scrollX += this.stage3AutoScrollSpeed * this.deltaTime;
        } else if (this.currentStageNumber === 5 && this.stage) {
            // Stage 5 のフロア方向に応じたスクロール
            const dir = this.stage.floorScrollDirection;
            const screenCenter = CANVAS_WIDTH / 2;
            const playerCenterX = this.player.x + this.player.getWorldWidth() / 2;
            const stairClimb = this.stage.getStairClimbProgress(playerCenterX);
            
            if (dir === 1) { // 右
                // 階段を登りきるまでは、プレイヤーが右端に行ってもスクロールを止める
                const stopScrollX = this.stage.maxProgress - CANVAS_WIDTH;
                if (this.player.x > this.scrollX + screenCenter) {
                    this.scrollX = this.player.x - screenCenter;
                }
                // 修正：最終階(currentFloor >= maxFloor)または階段を登りきっている場合、
                // 画面端(stopScrollX)でスクロールを止めるが、プレイヤーの移動は制限しない。
                const isFinal = this.stage.currentFloor >= this.stage.maxFloor;
                if ((isFinal || stairClimb >= 1.0) && this.scrollX > stopScrollX) {
                    this.scrollX = stopScrollX;
                } else if (stairClimb < 1.0 && this.scrollX > stopScrollX) {
                    // 登り途中は画面端で止める
                    this.scrollX = stopScrollX;
                }
            } else { // 左
                const stopScrollX = 0;
                if (this.player.x < this.scrollX + screenCenter) {
                    this.scrollX = this.player.x - screenCenter;
                }
                const isFinal = this.stage.currentFloor >= this.stage.maxFloor;
                if ((isFinal || stairClimb >= 1.0) && this.scrollX < stopScrollX) {
                    this.scrollX = stopScrollX;
                } else if (stairClimb < 1.0 && this.scrollX < stopScrollX) {
                    this.scrollX = stopScrollX;
                }
            }
        } else if (this.stage.isStage6Arena && this.stage.isStage6Arena()) {
            // Stage6 最上階の大屋根アリーナ: 左右自由移動。カメラは常に中央追従(戻れる)。
            // 会敵〜登場演出の間だけ先行量を足し、プレイヤーを左寄りに置いて間合いを見せる。
            this.scrollX = this.player.x + this.player.getWorldWidth() * 0.5 - screenCenter
                + this.getStage6CameraLead();
        } else {
            // 通常（固定方向）
            if (this.player.x > this.scrollX + screenCenter) this.scrollX = this.player.x - screenCenter;
        }

        // 定位置で止まったぶんの残りをカメラだけで詰める（ボス部屋の framing）
        if (this.isBossNameStandHoldActive()) this.updateBossRoomCameraPan();

        // スクロール制限
        // maxProgress は世界の全幅。カメラが映せる右端は maxProgress - CANVAS_WIDTH
        // 大屋根アリーナだけは屋根の実体が画面の角を満たす範囲で止める。
        // 屋根を下げて反り軒が画面下端の外へ出たぶん、外側をそのまま映すと
        // 隅棟の下に谷底だけの三角の余白ができるため。
        const inArena = !!(this.stage.isStage6Arena && this.stage.isStage6Arena());
        const maxScroll = inArena
            ? this.stage.getStage6ArenaCameraMaxX()
            : Math.max(0, this.stage.maxProgress - CANVAS_WIDTH);
        if (this.scrollX > maxScroll) this.scrollX = maxScroll;
        const minScroll = inArena ? this.stage.getStage6ArenaCameraMinX() : 0;
        if (this.scrollX < minScroll) this.scrollX = minScroll;
        
        // 背景パララックス用にStage側のprogressも更新
        this.stage.progress = this.scrollX;
        
        // --- Stage 5 各エンティティの物理同期 ---
        if (this.currentStageNumber === 5 && this.stage) {
            // 接地と到達判定を進行方向側の足元に統一する。
            const playerGroundProbeX = this.getStage5PlayerGroundProbeX();
            this.player.groundY = this.stage.getStairGroundY(playerGroundProbeX);

            // 最終階の右端に進入の壁は置かない。階段を廃して床が平地一枚になり、
            // 出口は壁に開いた背景の通用口になったため(指定 2026-08-12)。

            // 敵全員の接地更新（踊り場対応）
            const allEnemies = this.stage.getAllEnemies();
            for (const enemy of allEnemies) {
                const enemyCenterX = enemy.x + enemy.width / 2;
                enemy.groundY = this.stage.getStairGroundY(enemyCenterX);
            }
            
            // update boss groundY
            if (this.stage.bossSpawned && this.stage.boss) {
                const bossWorldWidth = typeof this.stage.boss.getWorldWidth === 'function'
                    ? this.stage.boss.getWorldWidth()
                    : this.stage.boss.width;
                const bossCenterX = this.stage.boss.x + bossWorldWidth / 2;
                this.stage.boss.groundY = this.stage.getStairGroundY(bossCenterX);
            }
            
            // 登りきったら次のフロアへ（最終階を除く）
            const stairProgress = this.stage.getStairClimbProgress(playerGroundProbeX);
            if (stairProgress >= 1.0 && !this.stage.isFloorTransitioning && this.stage.currentFloor < this.stage.maxFloor) {
                const stairTopGroundY = this.stage.baseGroundY - this.stage.stairHeightPx;
                this.player.groundY = stairTopGroundY;
                this.player.y = stairTopGroundY + LANE_OFFSET - this.player.getWorldHeight();
                this.player.vx = 0;
                this.player.vy = 0;
                this.player.isGrounded = true;
                this.stage.startFloorTransition();
            }
        }

        // --- Stage 6: 角の遷移 ---
        // 角1・2: 通用門をくぐる(隣の面へ回り込む=同じ高さの移動なので門で足りる)。
        // 角3(最上階へ): 廻縁は最上重の「下の重」を回っているので、突き当たりで見上げると
        //   頭上に最上重の軒が張り出している。そこへジャンプで飛びつく=屋根の上へ。
        //   (門の奥に屋根へ続く階段がある、という理屈は実際の天守に無く成立しない)
        if (this.currentStageNumber === 6 && this.stage &&
            !this.stage.isFloorTransitioning && this.stage.hasPendingStage6Corner()) {
            const cornerX = this.stage.getStage6ActiveCornerX();
            const probe = this.player.x + this.player.getWorldWidth();
            const isFinalCorner = this.stage.cornersClimbed === 2;
            let fire = false;
            if (isFinalCorner) {
                // 角3は「鎖鎌を頭上の軒へ掛けて登る」。行き止まりの手前まで歩いて来たら
                // 自動で登攀演出が始まる(ジャンプ入力に頼ると到達判定がシビアで詰む)。
                // 発火位置は【軒先そのもの】から導く(stage側で一元管理)。
                // 屋根を1:1描画にして軒の張り出しが2倍になったため、境界からの
                // 固定距離(EAVE_TRIGGER_INSET)だと軒先の真下を通り過ぎてから
                // 後ろへ鉤を投げる形になっていた。
                const triggerProbe = this.stage.getStage6GrappleTriggerProbeX();
                const atDeadEnd = probe >= (Number.isFinite(triggerProbe)
                        ? triggerProbe
                        : cornerX - STAGE6_CORNER.EAVE_TRIGGER_INSET)
                    && probe <= cornerX + 200;
                if (atDeadEnd && !this.stage.isStage6Grappling()) {
                    this.player.vx = 0;
                    // 補間元は startGrapple 内で player.x / player.y を素で保存する。
                    // (手元座標を左上として使い回して1フレーム跳ぶバグを避ける)
                    this.stage.startStage6GrappleClimb(this.player);
                    // 【最上層へ分身は連れて行かない】。鉤を投げる=ここから独りで登ると
                    // 決めた瞬間に影を解く。暗転で黙って消すのではなく画面内で解くので、
                    // 煙は残す(clearSmoke=false)。立っていた各分身の位置から立ち上がる。
                    // 以降は会敵歩行〜名乗りまで奥義入力も封じられている
                    // (attackInputLockTimer)ため、開戦までは呼び直せない。
                    if (this.stage.isStage6Grappling() && this.player.isUsingSpecial) {
                        const smokeAnchors = typeof this.player.getSpecialSmokeAnchors === 'function'
                            ? this.player.getSpecialSmokeAnchors(true)
                            : null;
                        this.player.spawnSpecialSmoke('vanish', smokeAnchors);
                        this.player.clearSpecialState(false);
                    }
                }
                fire = false; // 遷移は登攀完了時に発火する
            } else {
                const doorX = cornerX - STAGE6_CORNER.DOOR_TRIGGER_INSET;
                // 上限も見る: 「門に歩き入った」ときだけ発火。
                // 下限だけだと、デバッグワープ等で門より先にいるだけで誤発火する。
                fire = probe >= doorX && probe <= doorX + 200;
            }
            if (fire) {
                this.player.vx = 0;
                this.stage.startCornerTransition();
            }
        }

        // ステージ更新
        this.stage.update(this.deltaTime, this.player);
        // ボス曲が(ブラウザの自動停止などで)止まっていたら鳴らし直す。
        // stage6の最上階はボス出現前からラスボス曲が鳴っている(遷移時に開始)ので、
        // アリーナにいる間も対象に含める。
        const bossMusicPhase = (this.stage.bossSpawned && !this.stage.bossDefeated)
            || !!(this.stage.isStage6Arena && this.stage.isStage6Arena() && !this.stage.bossDefeated);
        if (bossMusicPhase && audio.bgmAudio && audio.bgmAudio.paused && !audio.isMuted) {
            audio.playBgm('boss', this.currentStageNumber);
        }
        
        // プレイヤーの移動制限
        const inStage6Arena = !!(this.stage.isStage6Arena && this.stage.isStage6Arena());
        if (inStage6Arena) {
            // 大屋根アリーナ: 足元ラインは水平な大棟の上(=金鯱と同じ高さ)。
            // 床帯そのままだと手前斜面の途中に立つ絵になるため接地基準を持ち上げる。
            this.player.groundY = this.stage.getStage6ArenaGroundY();
            // 大屋根アリーナ: 左右自由に歩き回れる。屋根の実体端でクランプ。
            const arenaLeft = this.stage.getStage6ArenaLeft();
            const arenaRight = this.stage.maxProgress;
            const edgeInset = STAGE6_CORNER.ARENA_EDGE_INSET_PX;
            const minX = arenaLeft + edgeInset;
            const maxArenaX = arenaRight - edgeInset - this.player.getWorldWidth();
            if (this.player.x < minX) {
                this.player.x = minX;
                if (this.player.vx < 0) this.player.vx = 0;
            }
            if (this.player.x > maxArenaX) {
                this.player.x = maxArenaX;
                if (this.player.vx > 0) this.player.vx = 0;
            }
        } else if (this.currentStageNumber !== 5) {
            // 戻りなしスクロール制限（Stage 5・stage6アリーナ以外）
            if (this.player.x < this.scrollX) {
                this.player.x = this.scrollX;
                if (this.player.vx < 0) this.player.vx = 0;
            }
        } else if (this.stage.bossSpawned) {
            // 【Stage5のボス部屋だけは左端で止める】。Stage5は階段で左右どちらへも
            // 進むためクランプを外してあるが、ボス部屋はカメラが止まるので、
            // そのままだと画面外まで歩けてプレイヤーが見えなくなる
            // (実機フィードバック 2026-08-12)。カメラが止まっている間だけ閉じる。
            if (this.player.x < this.scrollX) {
                this.player.x = this.scrollX;
                if (this.player.vx < 0) this.player.vx = 0;
            }
        }
        // 右端の制限（常に適用）
        const maxX = this.scrollX + CANVAS_WIDTH - this.player.getWorldWidth();
        if (this.player.x > maxX) {
            this.player.x = maxX;
            if (this.player.vx > 0) this.player.vx = 0;
        }
        // 大屋根アリーナは屋根の実体で止める。画面端クランプの後に適用して、
        // ボス出現でカメラが止まった後も棟端を越えないようにする。
        if (inStage6Arena) {
            const arenaMaxX = this.stage.maxProgress - 40 - this.player.getWorldWidth();
            if (this.player.x > arenaMaxX) {
                this.player.x = arenaMaxX;
                if (this.player.vx > 0) this.player.vx = 0;
            }
        }

        // 当たり判定対象の再構築
        const latestFrameEnemies = this.stage.getAllEnemies();
        const latestActiveEnemies = latestFrameEnemies.filter((enemy) => enemy.isAlive && !enemy.isDying);
        const latestObstacles = this.stage.obstacles.filter(o => !o.isDestroyed);

        const collisionMarginX = 300;
        const collisionMinX = this.scrollX - collisionMarginX;
        const collisionMaxX = this.scrollX + CANVAS_WIDTH + collisionMarginX;
        const collisionEnemies = latestActiveEnemies.filter((enemy) =>
            enemy.x + enemy.width >= collisionMinX && enemy.x <= collisionMaxX
        );
        const collisionObstacles = latestObstacles.filter((obs) =>
            obs.x + obs.width >= collisionMinX && obs.x <= collisionMaxX
        );

        this.updateSpecialCloneAutoCombat(collisionEnemies);
        this.resolveFinisherLandingOverlap(collisionEnemies);

        // 爆弾更新
        this.updateBombs(collisionEnemies, collisionObstacles);

        // サブ武器のprojectile更新（手裏剣など）
        // ※装備中の武器はplayer.update()内で更新済み → 二重更新を防止
        if (this.player.subWeapons) {
            for (const weapon of this.player.subWeapons) {
                if (weapon === this.player.currentSubWeapon) continue;
                if (weapon && typeof weapon.update === 'function') {
                    weapon.update(this.deltaTime, collisionEnemies);
                }
            }
        }

        this.updateExpGems();
        this.updateStageBossDefeatEffects();
        
        // 衝撃波更新
        if (this.shockwaves) {
            const rocks = collisionObstacles.filter(o => !o.isDestroyed && o.type === OBSTACLE_TYPES.ROCK);
            this.shockwaves.forEach(sw => {
                sw.update(this.deltaTime);
                
                // 衝撃波 vs 敵の当たり判定
                const hitbox = sw.getHitbox();
                for (const enemy of collisionEnemies) {
                    if (!sw.hitEnemies.has(enemy)) {
                        // getHitbox() を持つ実体(ラスボス将軍)はワールド寸法の矩形で判定する
                        const enemyRect = this.getEnemyCollisionRect(enemy);
                        if (this.rectIntersects(hitbox, enemyRect)) {
                            this.damageEnemy(enemy, sw.damage, {
                                source: 'shockwave',
                                knockbackX: 30,
                                knockbackY: -12,
                                isLaunch: true
                            });
                            sw.hitEnemies.add(enemy);
                        }
                    }
                }

                // 衝撃波 vs 岩（奥義でも破壊可能）
                for (const rock of rocks) {
                    if (this.rectIntersects(hitbox, rock)) {
                        if (rock.takeDamage(8)) {
                            this.spawnRockBreakEffect(
                                rock,
                                hitbox.x + hitbox.width * 0.5,
                                hitbox.y + hitbox.height * 0.5
                            );
                        }
                    }
                }
            });
            this.shockwaves = this.shockwaves.filter(sw => !sw.isDestroyed);
        }

        // 当たり判定
        this.checkCollisions(collisionEnemies, collisionEnemies, collisionObstacles);

        // ヒット演出更新
        this.updateHitEffects();
        
        // ダメージ数値更新
        this.updateDamageNumbers();
        
        // 寄り道ステージの刻限切れ → 結果発表（本編クリアの経路には乗せない）
        if (this.stage && typeof this.stage.isTimeUp === 'function' && this.stage.isTimeUp()) {
            this.beginSideResult();
            return;
        }

        // ステージクリアチェック
        if (this.stage.isCleared()) {
            if (!this.pendingStageClear) {
                this.pendingStageClear = true;
                this.stageClearTransitionTimer = 0.0; // 即時遷移（ボス撃破演出の余韻はFlashで表現）
            }
        }
        
        if (this.pendingStageClear) {
            this.stageClearTransitionTimer -= this.deltaTime;
            if (this.stageClearTransitionTimer <= 0) {
                // 完全に暗転したら遷移
                this.onStageClear();
                this.pendingStageClear = false;
                // 背景は同じ戦場を引き継ぐため、ほぼ切らずに突破印へ繋ぐ。
                this.startTransition(0.16);
            }
        }
        
        // 奥義常時MAX
        if (this.titleDebugConfig.items.permanent_max_special && this.player) {
            this.player.specialGauge = this.player.maxSpecialGauge;
        }

        // 縦追従カメラ（プレイヤーの最終座標確定後・接地状態で評価）
        this.updateCameraLift(this.deltaTime);

        // ゲームオーバーチェック
        if (this.player.hp <= 0) {
            this.beginPlayerDefeat();
        }
    }

    updateBombs(enemies = [], obstacles = null) {
        this.bombs = this.bombs.filter((bomb) => {
            // 敵弾（将軍の火薬玉）は敵リストを渡さない（プレイヤーへの当たりのみ）
            const updateEnemies = bomb.isEnemyProjectile ? [] : enemies;
            bomb.update(this.deltaTime, this.groundY, updateEnemies);
            
            // 爆発中の判定
            if (bomb.isExploding) {
                // 敵へのダメージ（プレイヤー弾のみ）
                if (!bomb.isEnemyProjectile) {
                for (const enemy of enemies) {
                    if (this.collisionManager.checkAndRegisterBombHit(bomb, enemy, bomb.id)) {
                        this.damageEnemy(enemy, bomb.damage, {
                            source: 'bomb',
                            knockbackX: 8,
                            knockbackY: -6
                        });
                    }
                }
                }

                // ボスの弾丸（火薬玉）の場合はプレイヤーへの当たり判定
                if (bomb.isEnemyProjectile && this.player) {
                    const playerRect = { x: this.player.x, y: this.player.y, width: this.player.getWorldWidth(), height: this.player.getWorldHeight() };
                    const bombRect = bomb.getHitbox();
                    if (this.rectIntersects(playerRect, bombRect)) {
                        this.handlePlayerDamage(bomb.damage || 1, bomb.x, {
                            knockbackX: 10,
                            knockbackY: -6
                        });
                        bomb.isDead = true; // 命中したら消滅（爆発は継続中だが判定は1回）
                    }
                }
                
                // 障害物へのダメージ（岩など）
                const obstacleList = Array.isArray(obstacles)
                    ? obstacles
                    : (this.stage.obstacles || []);
                for (const obs of obstacleList) {
                    if (obs.type === OBSTACLE_TYPES.ROCK && !obs.isDestroyed) {
                        // 爆発の中心点と障害物の距離をチェック
                        const dx = (obs.x + obs.width / 2) - bomb.x;
                        const dy = (obs.y + obs.height / 2) - bomb.y;
                        const distSq = dx * dx + dy * dy;
                        const rangeSq = bomb.explosionRadius * bomb.explosionRadius;
                        
                        // 爆発範囲内かつ未登録（1回の爆発で多段ヒットしないよう管理が必要な場合もあるが、岩はHPが低いため簡易処理）
                        if (distSq < rangeSq) {
                            if (obs.takeDamage(1)) {
                                this.spawnRockBreakEffect(obs, bomb.x, bomb.y);
                            }
                        }
                    }
                }
            }
            
            if (bomb.isDestroyed) {
                this.collisionManager.removeBombRecord(bomb.id);
                return false;
            }
            return true;
        });
    }

    buildSubWeaponAttackProfile(subWeapon, source = 'subweapon') {
        const enhanceTier = Number.isFinite(subWeapon.enhanceTier)
            ? Math.max(0, Math.min(3, Math.floor(subWeapon.enhanceTier)))
            : 0;
        const attackData = {
            source,
            weapon: subWeapon.name,
            enhanceTier
        };
        let damage = subWeapon.damage;

        if (subWeapon.name === '大太刀') {
            attackData.isLaunch = true;
            attackData.knockbackX = 10;
            attackData.knockbackY = -14;
        } else if (subWeapon.name === '大槍') {
            attackData.knockbackX = 8;
            attackData.knockbackY = -6;
            const speedRatio = Math.min(1.4, Math.abs(this.player.vx) / Math.max(1, this.player.speed));
            damage *= 1 + speedRatio * 0.18;
        } else if (subWeapon.name === '鎖鎌') {
            attackData.knockbackX = 7;
            attackData.knockbackY = -5;
        } else if (subWeapon.name === '二刀流') {
            if (subWeapon.attackType === 'combined') {
                damage *= 1.45;
                attackData.knockbackX = 8;
                attackData.knockbackY = -8;
                attackData.isLaunch = true;
            } else if (subWeapon.attackType === 'main') {
                const comboIndex = Number.isFinite(subWeapon.comboIndex) ? subWeapon.comboIndex : 0;
                const comboStep = comboIndex === 0
                    ? 4
                    : Math.max(0, Math.min(4, comboIndex));
                damage *= 1 + comboStep * 0.1;
            }
        } else if (subWeapon.name === '手裏剣') {
            attackData.knockbackX = 4;
            attackData.knockbackY = -3;
        } else {
            attackData.knockbackX = 6;
            attackData.knockbackY = -4;
        }

        // 剛力の秘薬は忍具ダメージにも反映
        const attackMultiplier = this.getPlayerAttackMultiplier();
        damage *= attackMultiplier;

        return { damage, attackData };
    }

    buildPlayerAttackDamage() {
        const attackMultiplier = this.getPlayerAttackMultiplier();
        const levelBonus = Number(this.player.levelAtkBonus) || 0;
        const baseDamage = (10 + this.player.attackCombo * 2 + 3 + levelBonus) * attackMultiplier;
        const attack = this.player.currentAttack;
        if (attack && attack.comboStep === 5) {
            const finisherDamage = baseDamage * 1.45;
            if (this.player.isXAttackFinisherActive && this.player.isXAttackFinisherActive(attack)) {
                return Math.round(finisherDamage * 1.3);
            }
            return Math.round(finisherDamage);
        }
        return Math.round(baseDamage);
    }

    resolveFinisherLandingOverlap(activeEnemies = []) {
        const player = this.player;
        if (
            !player ||
            !player.isGrounded ||
            !(player.justLanded || player.finisherLandingSeparationTimer > 0)
        ) {
            return;
        }

        const playerRect = { x: player.x, y: player.y, width: player.getWorldWidth(), height: player.getWorldHeight() };
        let moved = false;
        for (const enemy of activeEnemies) {
            const enemyRect = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
            if (!this.rectIntersects(playerRect, enemyRect)) continue;

            const overlapLeft = (playerRect.x + playerRect.width) - enemyRect.x;
            const overlapRight = (enemyRect.x + enemyRect.width) - playerRect.x;
            if (overlapLeft <= 0 || overlapRight <= 0) continue;

            if (overlapLeft < overlapRight) {
                player.x -= overlapLeft + 1;
                player.vx = Math.min(player.vx, -Math.abs(player.speed * 0.35));
            } else {
                player.x += overlapRight + 1;
                player.vx = Math.max(player.vx, Math.abs(player.speed * 0.35));
            }
            playerRect.x = player.x;
            moved = true;
        }

        if (moved) {
            const minX = this.scrollX;
            const maxX = this.scrollX + CANVAS_WIDTH - player.getWorldWidth();
            player.x = Math.max(minX, Math.min(maxX, player.x));
        }
    }
    checkCollisions(enemies = null, aliveEnemies = null, obstacles = null) {
        const enemyList = enemies || this.stage.getAllEnemies();
        const activeEnemies = aliveEnemies || enemyList.filter((enemy) => enemy.isAlive && !enemy.isDying);
        const obstacleList = Array.isArray(obstacles)
            ? obstacles
            : (this.stage && Array.isArray(this.stage.obstacles) ? this.stage.obstacles : []);
        const cloneOffsets = (this.player && typeof this.player.getSpecialCloneOffsets === 'function')
            ? this.player.getSpecialCloneOffsets()
            : [];
        const cloneActive = cloneOffsets.length > 0;
        const cloneBodyRects = cloneOffsets.map((clone) => ({
            index: clone.index,
            x: this.player.x + clone.dx + 5,
            y: this.player.y + clone.dy + 5,
            width: this.player.getWorldWidth() - 10,
            height: this.player.getWorldHeight() - 10
        }));
        const damageRocksWithHitboxes = (hitboxes, damage, fallbackX = null, fallbackY = null) => {
            const boxes = Array.isArray(hitboxes) ? hitboxes : (hitboxes ? [hitboxes] : []);
            if (boxes.length === 0) return false;
            const rockDamage = Math.max(1, Math.round(damage || 1));
            let didHit = false;
            for (const obs of obstacleList) {
                if (!obs || obs.isDestroyed || obs.type !== OBSTACLE_TYPES.ROCK) continue;
                for (const box of boxes) {
                    if (!box || !this.rectIntersects(box, obs)) continue;
                    didHit = true;
                    const impactX = Number.isFinite(box.x) && Number.isFinite(box.width)
                        ? box.x + box.width * 0.5
                        : fallbackX;
                    const impactY = Number.isFinite(box.y) && Number.isFinite(box.height)
                        ? box.y + box.height * 0.5
                        : fallbackY;
                    if (obs.takeDamage(rockDamage)) {
                        this.spawnRockBreakEffect(obs, impactX, impactY);
                    }
                    break;
                }
            }
            return didHit;
        };

        const subWeaponCloneOffsets = (this.player && typeof this.player.getSubWeaponCloneOffsets === 'function')
            ? this.player.getSubWeaponCloneOffsets()
            : [];
        const subWeaponCloneActive = subWeaponCloneOffsets.length > 0;
        
        // プレイヤー攻撃 vs 敵
        if (this.player.isAttacking) {
            const currentAttack = this.player.currentAttack;
            const attackSignature = currentAttack
                ? `${currentAttack.source || 'main'}:${currentAttack.comboStep || 0}:${this.player.attackCombo || 0}:${this.player.subWeaponAction || ''}`
                : 'main:0';
            if (this.lastAttackSignature !== attackSignature) {
                this.collisionManager.resetAttackHits();
                this.lastAttackSignature = attackSignature;
            }

            for (const enemy of activeEnemies) {
                if (this.collisionManager.checkAndRegisterAttackHit(this.player, enemy)) {
                    const damage = this.buildPlayerAttackDamage();
                    this.damageEnemy(enemy, damage, this.player.currentAttack || { source: 'main' });
                }
            }

            // 分身の通常攻撃判定
            if (cloneActive) {
                const anchors = this.player.calculateSpecialCloneAnchors(this.player.x + this.player.getWorldWidth() / 2, this.player.y + this.player.getWorldHeight() * 0.62);
                
                for (let i = 0; i < this.player.specialCloneSlots.length; i++) {
                    if (!this.player.specialCloneAlive[i]) continue;
                    
                    // ★修正: Lv3はindependent timer、Lv0〜2は本体の攻撃状態を使用
                    const isAutoAi = this.player.specialCloneAutoAiEnabled;
                    let cloneIsAttacking;
                    let cloneComboStep;
                    let cloneAttackDurationMs;
                    let cloneAttackRange;
                    let cloneAttackTimer;
                    
                    if (isAutoAi) {
                        // Lv3: 独立タイマー
                        cloneAttackTimer = this.player.specialCloneAttackTimers[i] || 0;
                        if (cloneAttackTimer <= 0) continue;
                        cloneIsAttacking = true;
                        const cloneAttackProfile = (
                            Array.isArray(this.player.specialCloneCurrentAttacks) &&
                            this.player.specialCloneCurrentAttacks[i]
                        )
                            ? this.player.specialCloneCurrentAttacks[i]
                            : (
                                typeof this.player.getComboAttackProfileByStep === 'function'
                                    ? this.player.getComboAttackProfileByStep(this.player.specialCloneComboSteps[i] || 1)
                                    : { comboStep: this.player.specialCloneComboSteps[i] || 1, durationMs: 420, range: 90 }
                            );
                        cloneAttackDurationMs = cloneAttackProfile.durationMs;
                        cloneAttackRange = cloneAttackProfile.range || 90;
                        cloneComboStep = cloneAttackProfile.comboStep || (this.player.specialCloneComboSteps[i] || 1);
                    } else {
                        // Lv0〜2: 本体の攻撃状態をコピー
                        if (!this.player.isAttacking || !this.player.currentAttack) continue;
                        cloneIsAttacking = true;
                        cloneComboStep = this.player.currentAttack.comboStep || 1;
                        cloneAttackDurationMs = this.player.currentAttack.durationMs || 420;
                        cloneAttackRange = this.player.currentAttack.range || 90;
                        cloneAttackTimer = this.player.attackTimer || 0;
                    }

                    const pos = this.player.specialClonePositions[i] || anchors[i];
                    const facingRight = pos.facingRight;
                    
                    // 分身用の状態を作成
                    const cloneState = {
                        x: pos.x - this.player.getWorldWidth() / 2,
                        y: pos.y - this.player.getWorldHeight() * 0.62,
                        facingRight: facingRight,
                        isAttacking: cloneIsAttacking,
                        currentAttack: isAutoAi
                            ? {
                                ...(Array.isArray(this.player.specialCloneCurrentAttacks) && this.player.specialCloneCurrentAttacks[i]
                                    ? this.player.specialCloneCurrentAttacks[i]
                                    : {}),
                                comboStep: cloneComboStep,
                                durationMs: cloneAttackDurationMs,
                                range: cloneAttackRange || 90
                            }
                            : {
                                comboStep: cloneComboStep,
                                durationMs: cloneAttackDurationMs,
                                range: cloneAttackRange || 90
                            },
                        attackTimer: cloneAttackTimer,
                        isCrouching: false
                    };

                    const attackHitbox = this.player.getAttackHitbox({ state: cloneState });
                    if (attackHitbox) {
                        const attackHitboxes = Array.isArray(attackHitbox) ? attackHitbox : [attackHitbox];
                        for (const enemy of activeEnemies) {
                            const enemyRect = this.getEnemyCollisionRect(enemy);
                            if (attackHitboxes.some((box) => this.rectIntersects(box, enemyRect))) {
                                const damage = this.buildPlayerAttackDamage();
                                this.damageEnemy(enemy, damage, {
                                    source: 'special_shadow',
                                    comboStep: cloneState.currentAttack.comboStep
                                });
                            }
                        }
                        damageRocksWithHitboxes(
                            attackHitboxes,
                            1,
                            cloneState.x + this.player.getWorldWidth() * 0.68,
                            cloneState.y + this.player.getWorldHeight() * 0.46
                        );
                    }
                }
            }
        } else {
            // 攻撃終了時にヒットリストをリセット
            this.collisionManager.resetAttackHits();
            this.lastAttackSignature = null;
        }

        // サブ武器 vs 敵
        const subWeapon = typeof this.player.getCombatSubWeapon === 'function'
            ? this.player.getCombatSubWeapon()
            : this.player.currentSubWeapon;
        if (subWeapon && typeof subWeapon.getHitbox === 'function') {
            let hitboxes = subWeapon.getHitbox(this.player);
            const baseSubProfile = this.buildSubWeaponAttackProfile(subWeapon, 'subweapon');
            const cloneSubProfile = this.buildSubWeaponAttackProfile(subWeapon, 'special_shadow');
            const spearTier = subWeapon.name === '大槍'
                ? Math.max(0, Math.min(3, Math.floor(subWeapon.enhanceTier || 0)))
                : 0;
            const kusaTier = subWeapon.name === '鎖鎌'
                ? Math.max(0, Math.min(3, Math.floor(subWeapon.enhanceTier || 0)))
                : 0;
            const orderedEnemies = subWeapon.name === '大槍'
                ? activeEnemies.slice().sort((a, b) => {
                    const dir = this.player.facingRight ? 1 : -1;
                    const playerCenterX = this.player.x + this.player.getWorldWidth() * 0.5;
                    const playerCenterY = this.player.y + this.player.getWorldHeight() * 0.5;
                    const ax = (a.x + a.width * 0.5 - playerCenterX) * dir;
                    const ay = (a.y + a.height * 0.5) - playerCenterY;
                    const bx = (b.x + b.width * 0.5 - playerCenterX) * dir;
                    const by = (b.y + b.height * 0.5) - playerCenterY;
                    return (ax * ax + ay * ay) - (bx * bx + by * by);
                })
                : activeEnemies;
            if (hitboxes) {
                // 単一のオブジェクトなら配列に包む
                if (!Array.isArray(hitboxes)) hitboxes = [hitboxes];
                if (subWeapon.name === '大槍') {
                    const priority = { tip: 3, shock: 2, shaft: 1 };
                    hitboxes = hitboxes.slice().sort((a, b) => (priority[b && b.part] || 0) - (priority[a && a.part] || 0));
                } else if (subWeapon.name === '鎖鎌') {
                    const kusaTierForSort = Math.max(0, Math.min(3, Math.floor(subWeapon.enhanceTier || 0)));
                    const priority = kusaTierForSort >= 2
                        ? { tip: 3, echo: 2, chain: 1 }
                        : { chain: 3, tip: 2, echo: 1 };
                    hitboxes = hitboxes.slice().sort((a, b) => (priority[b && b.part] || 0) - (priority[a && a.part] || 0));
                }
                const kusaPullByTierChain = [0, 8, 15, 23];
                const kusaPullByTierTip = [0, 10, 19, 30];
                const kusaPullByTierEcho = [0, 0, 0, 26];
                // 大槍は常時「貫通武器」として扱う（同一敵への多重ヒットは防止）
                const spearMaxHits = subWeapon.name === '大槍' ? Number.POSITIVE_INFINITY : 0;
                const spearHitEnemies = subWeapon.name === '大槍'
                    ? (subWeapon.hitEnemies instanceof Set ? subWeapon.hitEnemies : (subWeapon.hitEnemies = new Set()))
                    : null;
                const kusaEchoHitEnemies = subWeapon.name === '鎖鎌'
                    ? (subWeapon.echoHitEnemies instanceof Set ? subWeapon.echoHitEnemies : (subWeapon.echoHitEnemies = new Set()))
                    : null;
                const resolveHitboxProfile = (baseProfile, hitbox) => {
                    const attackData = { ...baseProfile.attackData };
                    let damage = baseProfile.damage;
                    
                    if (subWeapon.name === '大槍') {
                        if (hitbox && hitbox.part === 'tip' && spearTier >= 1) {
                            damage *= 1.4;
                            attackData.spearTipCritical = true;
                            attackData.isLaunch = true;
                        } else if (hitbox && hitbox.part === 'shock' && spearTier >= 3) {
                            damage *= 1.0;
                        }
                    } else if (subWeapon.name === '鎖鎌') {
                        if (hitbox && hitbox.part === 'chain' && kusaTier >= 1) {
                            attackData.slowMultiplier = 0.75;
                            attackData.slowDurationMs = 1200;
                            attackData.pullTowardPlayerStrength = kusaPullByTierChain[kusaTier] || 0;
                            attackData.knockbackX = 3;
                        } else if (hitbox && (hitbox.part === 'tip' || hitbox.part === 'tip_multi')) {
                            attackData.pullTowardPlayerStrength = kusaPullByTierTip[kusaTier] || 0;
                            attackData.knockbackX = 2;
                            attackData.knockbackY = Math.min(-2, attackData.knockbackY || 0);
                            if (hitbox && hitbox.part === 'tip_multi') {
                                damage *= 0.58; 
                                attackData.kusarigamaMulti = true;
                            }
                        } else if (hitbox && hitbox.part === 'echo' && kusaTier >= 3) {
                            damage *= 0.72;
                            attackData.slowMultiplier = 0.82;
                            attackData.slowDurationMs = 650;
                            attackData.pullTowardPlayerStrength = kusaPullByTierEcho[kusaTier] || 0;
                            attackData.kusarigamaEcho = true;
                        }
                    } else if (subWeapon.name === '二刀流') {
                        if (hitbox && hitbox.part === 'projectile') {
                            damage = subWeapon.xDamage || damage;
                            attackData.isLaunch = true;
                        }
                    } else if (subWeapon.name === '大太刀') {
                        if (hitbox && hitbox.part === 'shock') {
                            damage *= 0.7;
                            attackData.odachiShock = true;
                        }
                    } else if (subWeapon.name === '火薬玉') {
                        if (hitbox && hitbox.part === 'direct') {
                            damage *= 1.1;
                            attackData.firebombDirect = true;
                        }
                    }
                    return { damage, attackData };
                };
                
                const isBomb = this.player.subWeaponAction === 'bomb';
                const cloneSpearHitEnemies = subWeapon.name === '大槍' ? new Map() : null;
                const cloneKusaEchoHitEnemies = subWeapon.name === '鎖鎌' ? new Map() : null;
                
                for (const hitbox of hitboxes) {
                    const effectiveHitbox = hitbox;
                    const proj = hitbox._sourceProjectile || null; 
                    const hitboxProfile = resolveHitboxProfile(baseSubProfile, effectiveHitbox);
                    // 敵へのダメージ
                    for (const enemy of orderedEnemies) {
                        if (spearHitEnemies && spearHitEnemies.size >= spearMaxHits) continue;
                        if (kusaEchoHitEnemies && effectiveHitbox && effectiveHitbox.part === 'echo' && kusaEchoHitEnemies.has(enemy)) {
                            continue;
                        }
                        // projectileの場合は多段ヒット防止（ただし手裏剣は一定時間で再ヒット可能にする）
                        if (proj) {
                            if (subWeapon.name === '手裏剣' && proj.lastHitMap) {
                                const lastHit = proj.lastHitMap.get(enemy) || 0;
                                const now = Date.now();
                                if (now - lastHit < 200) continue; // 200ms間隔
                            } else if (proj.hitEnemies && proj.hitEnemies.has(enemy)) {
                                continue;
                            }
                        }

                        if (this.rectIntersects(effectiveHitbox, this.getEnemyCollisionRect(enemy))) {
                            this.damageEnemy(enemy, hitboxProfile.damage, { ...hitboxProfile.attackData });
                            if (spearHitEnemies) spearHitEnemies.add(enemy);
                            if (kusaEchoHitEnemies && effectiveHitbox && effectiveHitbox.part === 'echo') {
                                kusaEchoHitEnemies.add(enemy);
                            }
                            if (proj) {
                                if (subWeapon.name === '手裏剣' && proj.lastHitMap) {
                                    proj.lastHitMap.set(enemy, Date.now());
                                } else if (proj.hitEnemies) {
                                    proj.hitEnemies.add(enemy);
                                }
                                // 非貫通なら破壊
                                if (!proj.pierce) proj.isDestroyed = true;
                            }
                        }
                    }

                    // 岩へのダメージ（判定を確実に行う）
                    let rockDamage = Math.max(1, Math.floor(subWeapon.damage * 0.45) || 1);
                    if (isBomb) rockDamage = 50; 

                    for (const obs of obstacleList) {
                        if (obs.isDestroyed || obs.type !== OBSTACLE_TYPES.ROCK) continue;
                        if (this.rectIntersects(effectiveHitbox, obs)) {
                            if (obs.takeDamage(rockDamage)) {
                                this.spawnRockBreakEffect(
                                    obs,
                                    effectiveHitbox.x + effectiveHitbox.width * 0.5,
                                    effectiveHitbox.y + effectiveHitbox.height * 0.5
                                );
                            }
                            const proj = effectiveHitbox && effectiveHitbox._sourceProjectile;
                            if (proj && !proj.pierce) {
                                proj.isDestroyed = true;
                            }
                        }
                    }

                    // 分身のサブ武器判定
                    if (subWeaponCloneActive && !effectiveHitbox._sourceProjectile) {
                        for (const clone of subWeaponCloneOffsets) {
                            const cloneHitboxProfile = resolveHitboxProfile(cloneSubProfile, effectiveHitbox);
                            const shifted = this.shiftHitbox(effectiveHitbox, clone.dx, clone.dy);
                            if (cloneSpearHitEnemies && !cloneSpearHitEnemies.has(clone.index)) {
                                cloneSpearHitEnemies.set(clone.index, new Set());
                            }
                            if (cloneKusaEchoHitEnemies && !cloneKusaEchoHitEnemies.has(clone.index)) {
                                cloneKusaEchoHitEnemies.set(clone.index, new Set());
                            }
                            const cloneHitSet = cloneSpearHitEnemies ? cloneSpearHitEnemies.get(clone.index) : null;
                            const cloneKusaEchoSet = cloneKusaEchoHitEnemies ? cloneKusaEchoHitEnemies.get(clone.index) : null;
                            
                            for (const enemy of orderedEnemies) {
                                if (cloneHitSet && cloneHitSet.size >= spearMaxHits) continue;
                                if (cloneKusaEchoSet && effectiveHitbox && effectiveHitbox.part === 'echo' && cloneKusaEchoSet.has(enemy)) continue;
                                
                                if (this.rectIntersects(shifted, this.getEnemyCollisionRect(enemy))) {
                                    this.damageEnemy(enemy, cloneHitboxProfile.damage, { ...cloneHitboxProfile.attackData });
                                    if (cloneHitSet) cloneHitSet.add(enemy);
                                    if (cloneKusaEchoSet && effectiveHitbox && effectiveHitbox.part === 'echo') cloneKusaEchoSet.add(enemy);
                                }
                            }
                            // 分身の攻撃でも岩を壊せるように
                            for (const obs of obstacleList) {
                                if (obs.isDestroyed || obs.type !== OBSTACLE_TYPES.ROCK) continue;
                                if (this.rectIntersects(shifted, obs)) {
                                    if (obs.takeDamage(rockDamage)) {
                                        this.spawnRockBreakEffect(
                                            obs,
                                            shifted.x + shifted.width * 0.5,
                                            shifted.y + shifted.height * 0.5
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }

        }

        if (
            this.player &&
            Array.isArray(this.player.specialCloneSubWeaponInstances) &&
            Array.isArray(this.player.specialClonePositions)
        ) {
            for (let i = 0; i < this.player.specialCloneSubWeaponInstances.length; i++) {
                const inst = this.player.specialCloneSubWeaponInstances[i];
                const pos = this.player.specialClonePositions[i];
                if (!inst || !pos || typeof inst.getHitbox !== 'function') continue;
                if (this.player.specialCloneAlive && this.player.specialCloneAlive[i] === false) continue;
                const cloneTimer = this.player.specialCloneSubWeaponTimers
                    ? (this.player.specialCloneSubWeaponTimers[i] || 0)
                    : 0;
                const hasLiveProjectile = Array.isArray(inst.projectiles) && inst.projectiles.length > 0;
                const hasPlantedOdachi = inst.name === '大太刀' && ((inst.plantedTimer || 0) > 0 || (inst.fadeOutTimer || 0) > 0);
                if (cloneTimer <= 0 && !hasLiveProjectile && !hasPlantedOdachi) continue;
                const cloneOwner = inst.owner && inst.owner._specialCloneOwner
                    ? inst.owner
                    : {
                        x: pos.x - this.player.getWorldWidth() * 0.5,
                        y: typeof this.player.getSpecialCloneDrawY === 'function'
                            ? this.player.getSpecialCloneDrawY(pos.y)
                            : pos.y - this.player.getWorldHeight() * 0.62,
                        width: this.player.getWorldWidth(),
                        height: this.player.getWorldHeight(),
                        groundY: typeof this.player.getSpecialCloneGroundYAtX === 'function'
                            ? this.player.getSpecialCloneGroundYAtX(pos.x)
                            : this.player.groundY,
                        facingRight: pos.facingRight,
                        isGrounded: !pos.jumping,
                        isEnemy: false,
                        currentSubWeapon: inst,
                        subWeaponAction: this.player.specialCloneSubWeaponActions
                            ? this.player.specialCloneSubWeaponActions[i]
                            : null,
                        subWeaponTimer: cloneTimer,
                        isXAttackBoostActive: () => false
                    };
                cloneOwner.currentSubWeapon = inst;
                cloneOwner.subWeaponAction = this.player.specialCloneSubWeaponActions
                    ? this.player.specialCloneSubWeaponActions[i]
                    : cloneOwner.subWeaponAction;
                cloneOwner.subWeaponTimer = cloneTimer;
                let cloneHitboxes = inst.getHitbox(cloneOwner);
                if (!cloneHitboxes) continue;
                cloneHitboxes = Array.isArray(cloneHitboxes) ? cloneHitboxes : [cloneHitboxes];
                for (const hitbox of cloneHitboxes) {
                    let rockDamage = Math.max(1, Math.floor((inst.damage || 1) * 0.45) || 1);
                    if (inst.name === '二刀流' && hitbox && hitbox.part === 'projectile') {
                        rockDamage = Math.max(1, Math.floor((inst.xDamage || inst.damage || 1) * 0.45));
                    }
                    const hitRock = damageRocksWithHitboxes(hitbox, rockDamage);
                    const proj = hitbox && hitbox._sourceProjectile;
                    if (hitRock && proj && !proj.pierce) {
                        proj.isDestroyed = true;
                    }
                }
            }
        }

        // 【名乗りまではボスの刃も体も通らない】。登場の5連コンボは演出であって
        // 攻撃ではないので、被弾判定からボスだけを外す(ボス側の無敵と対称)。
        // 寸止めクランプ(stage.js)で刃は届かない位置に止めてあるが、
        // プレイヤーは登場中も歩けるので自分から踏み込める。その保険。
        const bossIntroNoContact = !!(this.stage
            && typeof this.stage.isBossIntroBeforeCall === 'function'
            && this.stage.isBossIntroBeforeCall());

        // 敵攻撃 vs プレイヤー
        for (const enemy of activeEnemies) {
            if (bossIntroNoContact && this.isBossEnemy(enemy)) continue;
            if (checkEnemyAttackHit(enemy, this.player)) {
                if (this.handlePlayerDamage(enemy.damage, enemy.x + enemy.width / 2, {
                    knockbackX: 4.2,
                    knockbackY: -2.8
                })) {
                    return;
                }
            } else if (cloneActive) {
                const attackHitboxes = enemy.getAttackHitbox ? enemy.getAttackHitbox() : null;
                if (attackHitboxes) {
                    const hitboxList = Array.isArray(attackHitboxes) ? attackHitboxes : [attackHitboxes];
                    for (const hitbox of hitboxList) {
                        let consumed = false;
                        for (const cloneRect of cloneBodyRects) {
                            if (this.rectIntersects(hitbox, cloneRect)) {
                                if (typeof this.player.consumeSpecialClone === 'function') {
                                    const consumed = this.player.consumeSpecialClone(cloneRect.index);
                                    if (consumed) this.queueHitFeedback(2.8, 46);
                                    if (!consumed) continue;
                                }
                                consumed = true;
                                break;
                            }
                        }
                        if (consumed) break;
                    }
                }
            }
        }
        
        // 敵との接触ダメージ
        for (const enemy of activeEnemies) {
            if (bossIntroNoContact && this.isBossEnemy(enemy)) continue;
            if (checkPlayerEnemyCollision(this.player, enemy)) {
                const contactDamage = this.isBossEnemy(enemy)
                    ? Math.max(1, Math.round((enemy.damage || 2) * 0.35))
                    : 1;
                if (this.handlePlayerDamage(contactDamage, enemy.x + enemy.width / 2, {
                    knockbackX: 2.8,
                    knockbackY: -1.8
                })) {
                    return;
                }
            } else if (cloneActive) {
                const enemyRect = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
                for (const cloneRect of cloneBodyRects) {
                    if (this.rectIntersects(enemyRect, cloneRect)) {
                        if (typeof this.player.consumeSpecialClone === 'function') {
                            const consumed = this.player.consumeSpecialClone(cloneRect.index);
                            if (consumed) this.queueHitFeedback(2.4, 40);
                            if (!consumed) continue;
                        }
                        break;
                    }
                }
            }
        }

        
        // 統合された障害物判定 (罠・岩)
        for (const obs of obstacleList) {
            if (obs.isDestroyed) continue;

            // プレイヤーとの衝突判定（棘ダメージ & 岩の押し戻し）
            if (this.rectIntersects(this.player, obs)) {
                if (obs.type === OBSTACLE_TYPES.SPIKE) {
                    if (this.player.invincibleTimer <= 0) {
                        const playerBottom = this.player.y + this.player.getWorldHeight();
                        const prevBottom = playerBottom - (this.player.vy || 0);
                        const spikeTop = obs.y + Math.max(2, obs.height * 0.08);
                        const descending = (this.player.vy || 0) > 2.2;
                        const fromAbove = descending && prevBottom <= spikeTop + 8;
                        const hardLanding = fromAbove || (descending && (playerBottom - spikeTop) < obs.height * 0.42);
                        const trapDamage = Math.max(1, Math.ceil(this.player.maxHp * 0.1));
                        const hitSourceX = obs.x + obs.width / 2;
                        const playerCenterX = this.player.x + this.player.getWorldWidth() / 2;
                        // 竹槍中心から遠ざかる向きに統一して、追突・再接触を減らす
                        const knockbackDir = playerCenterX < hitSourceX ? -1 : 1;
                        const knockbackX = hardLanding ? 8.0 : 7.5;
                        const knockbackY = hardLanding ? -12 : -6;

                        // 無敵時間中は判定自体を完全にスキップしてエフェクト発生を抑止
                        if (this.player.invincibleTimer > 0 || this.player.isGhostVeilActive()) continue;

                        if (hardLanding) {
                            this.queueHitFeedback(5.2, 68);
                        }

                        if (this.handleSpikeDamage(trapDamage, hitSourceX, {
                            knockbackX,
                            knockbackY,
                            knockbackDir
                        })) {
                            return;
                        }

                        if (hardLanding) {
                            this.player.y = Math.min(this.player.y, spikeTop - this.player.getWorldHeight() - 2);
                        }
                    }
                } else if (obs.type === OBSTACLE_TYPES.ROCK) {
                    const comboStep = this.player && this.player.currentAttack
                        ? this.player.currentAttack.comboStep || 0
                        : 0;
                    if (this.player && this.player.isAttacking && comboStep === 4) {
                        continue;
                    }
                    // 岩上に乗っている時は横押し戻しをしない
                    const playerBottom = this.player.y + this.player.getWorldHeight();
                    const rockTop = obs.y + 2;
                    const rockBottom = obs.y + obs.height - 2;
                    const sideCollision = playerBottom > rockTop + 6 && this.player.y < rockBottom - 6;
                    if (sideCollision) {
                        const stage3AutoScrollCrushActive = (
                            this.currentStageNumber === 3 &&
                            this.stage &&
                            !this.stage.bossSpawned
                        );
                        if (stage3AutoScrollCrushActive) {
                            const leftEdge = this.scrollX;
                            const rightEdge = this.scrollX + CANVAS_WIDTH;
                            const playerLeft = this.player.x;
                            const playerRight = this.player.x + this.player.getWorldWidth();
                            const playerCenterX = playerLeft + this.player.getWorldWidth() * 0.5;
                            const rockCenterX = obs.x + obs.width * 0.5;
                            const edgeMargin = 2.5;
                            const pinOverlapMargin = 1.0;
                            const pinnedAtLeft = (
                                playerLeft <= leftEdge + edgeMargin &&
                                rockCenterX >= playerCenterX &&
                                obs.x <= playerRight - pinOverlapMargin
                            );
                            const pinnedAtRight = (
                                playerRight >= rightEdge - edgeMargin &&
                                rockCenterX <= playerCenterX &&
                                obs.x + obs.width >= playerLeft + pinOverlapMargin
                            );
                            if (pinnedAtLeft || pinnedAtRight) {
                                this.beginPlayerDefeat();
                                return;
                            }
                        }
                        this.player.vx = 0;
                    }
                }
            }

            // 岩への通常攻撃(Z)判定
            if (obs.type === OBSTACLE_TYPES.ROCK && this.player.isAttacking) {
                const atkBox = this.player.getAttackHitbox();
                const boxes = Array.isArray(atkBox) ? atkBox : (atkBox ? [atkBox] : []);
                if (boxes.some(box => this.rectIntersects(box, obs))) {
                    if (obs.takeDamage(1)) {
                        this.spawnRockBreakEffect(
                            obs,
                            this.player.x + this.player.getWorldWidth() * 0.68,
                            this.player.y + this.player.getWorldHeight() * 0.46
                        );
                    }
                }
            }
        }
    }

    isBossEnemy(enemy) {
        if (!enemy) return false;
        return enemy.maxHp >= 120 || enemy.type === 'boss';
    }

    getUltimateTargets(player, desiredCount = 8) {
        const enemies = this.stage.getAllEnemies().filter((enemy) => enemy.isAlive && !enemy.isDying);
        if (enemies.length === 0) return [];

        const visibleMinX = this.scrollX - 40;
        const visibleMaxX = this.scrollX + CANVAS_WIDTH + 40;
        const viewportTargets = enemies.filter((enemy) => {
            const cx = enemy.x + enemy.width / 2;
            return cx >= visibleMinX && cx <= visibleMaxX;
        });
        const pool = viewportTargets.length > 0 ? viewportTargets : enemies;

        const playerCenterX = player.x + player.getWorldWidth() / 2;
        const playerCenterY = player.y + player.getWorldHeight() * 0.5;
        return pool
            .slice()
            .sort((a, b) => {
                const aBoss = this.isBossEnemy(a) ? 1 : 0;
                const bBoss = this.isBossEnemy(b) ? 1 : 0;
                if (aBoss !== bBoss) return bBoss - aBoss;

                const aThreat = (a.damage || 0) + (a.maxHp || 0) * 0.04;
                const bThreat = (b.damage || 0) + (b.maxHp || 0) * 0.04;
                if (aThreat !== bThreat) return bThreat - aThreat;

                const adx = (a.x + a.width / 2) - playerCenterX;
                const ady = (a.y + a.height * 0.5) - playerCenterY;
                const bdx = (b.x + b.width / 2) - playerCenterX;
                const bdy = (b.y + b.height * 0.5) - playerCenterY;
                return (adx * adx + ady * ady) - (bdx * bdx + bdy * bdy);
            })
            .slice(0, Math.max(1, desiredCount));
    }

    executeUltimateStrike(player, target, options = {}) {
        if (!target || !target.isAlive || target.isDying) return false;

        const isFinisher = !!options.isFinisher;
        const boss = this.isBossEnemy(target);
        let damage;
        if (boss) {
            // ボスは固定割合+上限（上限超えを防ぎつつ最低保証）
            const percentDamage = Math.max(12, target.hp * 0.18);
            damage = Math.max(18, Math.min(140, percentDamage));
        } else {
            // 雑魚は確殺
            damage = target.hp + Math.max(20, target.maxHp || 20);
        }

        this.damageEnemy(target, damage, {
            source: 'special_shadow',
            weapon: '奥義',
            isLaunch: isFinisher,
            knockbackX: isFinisher ? 12 : 7,
            knockbackY: isFinisher ? -10 : -6
        });
        this.queueHitFeedback(isFinisher ? 9.5 : 6.2, isFinisher ? 108 : 72);
        return true;
    }
    
    // 敵の被弾矩形を解決する。getHitbox() を持つ実体(Player ベースのラスボス将軍など)は
    // 素の x/y/width/height が素体フレーム(40x60)のままで、ワールド寸法(×SHOGUN_SCALE)とずれる。
    // 通常コンボは getEntityRect 経由で getHitbox() を使うため当たるが、サブ武器/分身は素の矩形で
    // 判定していたため大槍・大太刀がラスボスに当たらなくなっていた。ここで getHitbox() を優先する。
    // getHitbox() を持たない通常の敵は enemy をそのまま返すので挙動不変。
    getEnemyCollisionRect(enemy) {
        if (!enemy || typeof enemy.getHitbox !== 'function') return enemy;
        const hb = enemy.getHitbox();
        if (Array.isArray(hb)) {
            const rects = hb.filter(b => b &&
                Number.isFinite(b.x) && Number.isFinite(b.y) &&
                Number.isFinite(b.width) && Number.isFinite(b.height));
            if (rects.length === 1) return rects[0];
            if (rects.length > 1) {
                const minX = Math.min(...rects.map(b => b.x));
                const minY = Math.min(...rects.map(b => b.y));
                const maxX = Math.max(...rects.map(b => b.x + b.width));
                const maxY = Math.max(...rects.map(b => b.y + b.height));
                return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            }
            return enemy;
        }
        return (hb && Number.isFinite(hb.x)) ? hb : enemy;
    }

    rectIntersects(a, b) {
        if (a && a.shape === 'circle') return this.circleIntersectsRect(a, b);
        if (b && b.shape === 'circle') return this.circleIntersectsRect(b, a);
        if (a && a.shape === 'capsule') return this.capsuleIntersectsRect(a, b);
        if (b && b.shape === 'capsule') return this.capsuleIntersectsRect(b, a);
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }

    circleIntersectsRect(circle, rect) {
        if (!circle || !rect) return false;
        const closestX = Math.max(rect.x, Math.min(circle.cx, rect.x + rect.width));
        const closestY = Math.max(rect.y, Math.min(circle.cy, rect.y + rect.height));
        const dx = circle.cx - closestX;
        const dy = circle.cy - closestY;
        return (dx * dx + dy * dy) <= (circle.radius * circle.radius);
    }

    capsuleIntersectsRect(capsule, rect) {
        if (!capsule || !rect) return false;
        const expanded = {
            x: rect.x - capsule.radius,
            y: rect.y - capsule.radius,
            width: rect.width + capsule.radius * 2,
            height: rect.height + capsule.radius * 2
        };
        if (!this.rectIntersects({
            x: Math.min(capsule.ax, capsule.bx),
            y: Math.min(capsule.ay, capsule.by),
            width: Math.abs(capsule.bx - capsule.ax),
            height: Math.abs(capsule.by - capsule.ay)
        }, expanded)) {
            return false;
        }
        return this.segmentIntersectsRect(capsule.ax, capsule.ay, capsule.bx, capsule.by, expanded);
    }

    segmentIntersectsRect(x1, y1, x2, y2, rect) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        let tMin = 0;
        let tMax = 1;
        const checks = [
            [-dx, x1 - rect.x],
            [ dx, rect.x + rect.width - x1],
            [-dy, y1 - rect.y],
            [ dy, rect.y + rect.height - y1]
        ];
        for (const [p, q] of checks) {
            if (Math.abs(p) < 1e-8) {
                if (q < 0) return false;
                continue;
            }
            const t = q / p;
            if (p < 0) {
                if (t > tMax) return false;
                if (t > tMin) tMin = t;
            } else {
                if (t < tMin) return false;
                if (t < tMax) tMax = t;
            }
        }
        return true;
    }

    shiftHitbox(hitbox, dx, dy) {
        const shifted = {
            ...hitbox,
            x: hitbox.x + dx,
            y: hitbox.y + dy
        };
        if (hitbox.shape === 'circle') {
            shifted.cx = hitbox.cx + dx;
            shifted.cy = hitbox.cy + dy;
        } else if (hitbox.shape === 'capsule') {
            shifted.ax = hitbox.ax + dx;
            shifted.ay = hitbox.ay + dy;
            shifted.bx = hitbox.bx + dx;
            shifted.by = hitbox.by + dy;
        }
        return shifted;
    }

    applyFinisherBlowAway(enemy, attackData = null) {
        if (!enemy || !attackData) return;
        if (attackData.comboStep !== 5) return;
        if (attackData.source && attackData.source !== 'main') return;

        const dir = this.player && this.player.facingRight ? 1 : -1;
        const boss = this.isBossEnemy(enemy);
        const pushDistance = boss ? 28 : 56;
        const minPushVx = boss ? 7 : 12;
        const liftVy = boss ? -2.4 : -4.4;

        enemy.x += dir * pushDistance;
        enemy.vx = dir * Math.max(minPushVx, Math.abs(enemy.vx || 0));
        enemy.vy = Math.min(enemy.vy || 0, liftVy);
        enemy.isGrounded = false;

        const minX = this.scrollX - 180;
        const maxX = this.scrollX + CANVAS_WIDTH + 180;
        enemy.x = Math.max(minX, Math.min(maxX, enemy.x));
    }

    isStageBossEnemy(enemy) {
        return !!(this.stage && this.stage.boss && enemy === this.stage.boss);
    }

    shouldDropBossGem(enemy) {
        if (!enemy || (!enemy.isAlive && !enemy.isDying)) return false;
        if (this.isStageBossEnemy(enemy)) return false;
        return this.isBossEnemy(enemy) || enemy.type === 'busho';
    }

    spawnExpGem(enemy) {
        if (!enemy) return;
        const expValue = Math.max(0, Math.floor(enemy.expReward || 0));
        if (expValue <= 0) return;
        if (this.isStageBossEnemy(enemy)) return;

        const isBossGem = this.shouldDropBossGem(enemy);
        const gemExp = Math.max(1, Math.round(expValue));
        this.expGems.push({
            x: enemy.x + enemy.width * 0.5,
            y: enemy.y + enemy.height * 0.42,
            vx: (Math.random() - 0.5) * 1.6,
            vy: -3.2 - Math.random() * 0.8,
            size: isBossGem ? 16 : 11,
            exp: gemExp,
            kind: isBossGem ? 'boss' : 'normal',
            lifeMs: 9000,
            sparklePhase: Math.random() * Math.PI * 2
        });
    }

    updateExpGems() {
        if (!this.expGems || this.expGems.length === 0 || !this.player) return;

        const pickupRadius = 26;
        const normalMagnetRadius = 180;
        const normalPullMin = 0.42;
        const normalPullMax = 1.14;
        const magnetBoostPullMin = 0.85;
        const magnetBoostPullMax = 2.2;
        const magnetBoostActive = !!(this.player.isExpMagnetBoostActive && this.player.isExpMagnetBoostActive());
        const magnetRadius = magnetBoostActive
            ? Math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT) * 1.2
            : normalMagnetRadius;
        
        // プレイヤーのジャンプに関わらず、ジェムは足元のレーンを地面として扱う。
        // stage6最上階は足元ラインが大棟の上(=通常の床帯より96px上)なので、
        // 通常のレーンを使うとジェムだけ屋根の中に沈む。
        // 【Stage5の階段では x ごとに床が違う】。一律のレーンだと階段の上に落ちた
        // ジェムが段の中へ沈み、段を転がり降りて来られなかった
        // (実機フィードバック 2026-08-12)。プレイヤーと同じ getStairGroundY を引く。
        const inStage6Arena = !!(this.stage.isStage6Arena && this.stage.isStage6Arena());
        const flatGroundLimit = inStage6Arena
            ? this.stage.getStage6ArenaGroundY() + LANE_OFFSET
            : this.stage.groundY + LANE_OFFSET;
        const useStairGround = !inStage6Arena
            && this.currentStageNumber === 5
            && typeof this.stage.getStairGroundY === 'function';
        const groundLimitAt = (x) => (useStairGround
            ? this.stage.getStairGroundY(x) + LANE_OFFSET
            : flatGroundLimit);

        this.expGems = this.expGems.filter((gem) => {
            gem.lifeMs -= this.deltaTime * 1000;
            if (gem.lifeMs <= 0) return false;

            // 回収ターゲット（本体＋生きている分身）のリストを作成
            const targets = [
                { x: this.player.x + this.player.getWorldWidth() * 0.5, y: this.player.y + this.player.getWorldHeight() * 0.5 }
            ];
            // 分身の座標を追加
            if (this.player.specialCloneAlive && this.player.specialClonePositions) {
                for (let i = 0; i < this.player.specialCloneSlots.length; i++) {
                    if (this.player.specialCloneAlive[i]) {
                        const pos = this.player.specialClonePositions[i];
                        targets.push({ x: pos.x, y: pos.y }); // 分身のyはすでに足元より少し上になっている
                    }
                }
            }

            // 最も近いターゲットを探す
            let closestTarget = targets[0];
            let minDistance = Math.hypot(closestTarget.x - gem.x, closestTarget.y - gem.y);
            
            for (let i = 1; i < targets.length; i++) {
                const d = Math.hypot(targets[i].x - gem.x, targets[i].y - gem.y);
                if (d < minDistance) {
                    minDistance = d;
                    closestTarget = targets[i];
                }
            }

            const dx = closestTarget.x - gem.x;
            const dy = closestTarget.y - gem.y;
            const distance = minDistance || 1;

            if (distance < magnetRadius) {
                const normalPullProgress = 1 - Math.min(distance, normalMagnetRadius) / normalMagnetRadius;
                let pull = normalPullMin + (normalPullMax - normalPullMin) * normalPullProgress;
                let maxSpeed = Infinity;

                if (magnetBoostActive) {
                    const boostPullProgress = 1 - Math.min(distance, magnetRadius) / magnetRadius;
                    pull = magnetBoostPullMin + (magnetBoostPullMax - magnetBoostPullMin) * boostPullProgress;
                    maxSpeed = 14.8;
                }
                gem.vx += (dx / distance) * pull;
                gem.vy += (dy / distance) * pull;
                if (Number.isFinite(maxSpeed)) {
                    const speed = Math.hypot(gem.vx, gem.vy);
                    if (speed > maxSpeed) {
                        const scale = maxSpeed / speed;
                        gem.vx *= scale;
                        gem.vy *= scale;
                    }
                }
            }

            gem.vx *= 0.92;
            gem.vy += 0.34;
            gem.x += gem.vx;
            gem.y += gem.vy;
            gem.sparklePhase += this.deltaTime * 8.2;

            // 床は毎フレーム今いる x で引き直す（階段の上では段の面が床）
            const groundLimit = groundLimitAt(gem.x);
            if (gem.y > groundLimit - gem.size) {
                gem.y = groundLimit - gem.size;
                gem.vy *= -0.2;
                gem.vx *= 0.82;
                if (Math.abs(gem.vy) < 0.25) gem.vy = 0;
            }

            // 回収判定（いずれかのターゲットに接触したか）
            if (distance < pickupRadius) {
                const leveled = this.player.addExp(gem.exp) || 0;
                if (leveled > 0) this.queueLevelUpChoices(leveled);
                audio.playExpGain();
                return false;
            }

            const outLeft = gem.x + gem.size < this.scrollX - 220;
            const outRight = gem.x - gem.size > this.scrollX + CANVAS_WIDTH + 220;
            const outBottom = gem.y - gem.size > CANVAS_HEIGHT + 60;
            return !(outLeft || outRight || outBottom);
        });
    }

    getAvailableLevelUpChoices() {
        if (!this.player || !this.player.progression) return [];
        const progression = this.player.progression;
        const specialTier = progression.specialClone || 0;
        const specialCount = this.player.getSpecialCloneCountByTier(specialTier);
        const nextSpecialCount = this.player.getSpecialCloneCountByTier(Math.min(3, specialTier + 1));
        const detail = nextSpecialCount === specialCount
            ? `分身 +${specialCount} / 自動追尾行動`
            : `分身 +${specialCount} → +${nextSpecialCount}${specialTier === 2 ? ' + 自動追尾' : ''}`;
        const baseChoices = [
            {
                id: 'normal_combo',
                title: '連撃強化',
                subtitle: `連撃段数 ${this.player.getNormalComboMax()} → ${Math.min(5, this.player.getNormalComboMax() + 1)}`,
                level: progression.normalCombo || 0,
                maxLevel: 3
            },
            {
                id: 'sub_weapon',
                title: '忍具強化',
                subtitle: '連射・射程・手数を強化',
                level: progression.subWeapon || 0,
                maxLevel: 3
            },
            {
                id: 'special_clone',
                title: '奥義強化',
                subtitle: detail,
                level: specialTier,
                maxLevel: 3
            }
        ];
        const availableBaseChoices = baseChoices.filter((choice) => choice.level < choice.maxLevel);
        const emptySlots = Math.max(0, 3 - availableBaseChoices.length);
        if (emptySlots <= 0) return availableBaseChoices;

        const d = this.player.tempNinjutsuDurations || {};
        const tempChoices = [
            {
                id: "temp_exp_magnet",
                title: "引き寄せの術",
                subtitle: "遠くの熟練値を引き寄せる",
                durationSec: Math.max(1, Math.round((d.expMagnet || 60000) / 1000)),
            },
            {
                id: "temp_x_attack",
                title: "大薙ぎの術",
                subtitle: "連撃の攻撃範囲を拡張",
                durationSec: Math.max(1, Math.round((d.xAttack || 60000) / 1000)),
            },
            {
                id: "temp_ghost_veil",
                title: "隠れ身の術",
                subtitle: "透明になり一定時間無敵",
                durationSec: Math.max(1, Math.round((d.ghostVeil || 60000) / 1000)),
            },
        ];
        return [...availableBaseChoices, ...tempChoices.slice(0, emptySlots)];
    }

    queueLevelUpChoices(count = 1) {
        const addCount = Math.max(0, Math.floor(count));
        if (addCount <= 0) return;
        this.pendingLevelUpChoices += addCount;
        if (this.state === GAME_STATE.PLAYING) {
            this.state = GAME_STATE.LEVEL_UP;
            this.levelUpChoiceIndex = 0;
            this.levelUpInputLockMs = 420;
            this.levelUpConfirmCooldownMs = 0;
            this.levelUpRequireRelease =
                input.isAction('CONFIRM') ||
                input.touchJustPressed;
            this.levelUpAlpha = 0; // フェードイン開始
            this.levelUpTransitionDir = 1;
            audio.playLevelUpWindow();
        }
    }

    applyLevelUpChoice(choiceId) {
        if (!this.player || !choiceId) return;
        let upgraded = false;
        if (typeof this.player.applyProgressionChoice === 'function') {
            upgraded = this.player.applyProgressionChoice(choiceId);
        }
        if (!upgraded && typeof this.player.applyTemporaryNinjutsuChoice === 'function') {
            upgraded = this.player.applyTemporaryNinjutsuChoice(choiceId);
        }
        if (!upgraded) return;
        this.pendingLevelUpChoices = Math.max(0, this.pendingLevelUpChoices - 1);
        // this.levelUpChoiceIndex = 0; // フェードアウト完了まで位置を維持
        this.levelUpInputLockMs = 220;
        this.levelUpConfirmCooldownMs = 220;
        this.levelUpRequireRelease = true;
        audio.playSkillUp();
        // 選択後は必ずフェードアウトを開始（選択した状態を維持したまま消える）
        // フェードアウト完了時に次の選択肢があれば再フェードインする
        this.levelUpTransitionDir = -1;
    }

    updateLevelUpChoice() {
        // フェードイン/アウト処理
        if (this.levelUpTransitionDir === 1) { // フェードイン
            this.levelUpAlpha += this.deltaTime * 3.5;
            if (this.levelUpAlpha >= 1.0) {
                this.levelUpAlpha = 1.0;
                this.levelUpTransitionDir = 0;
            }
        } else if (this.levelUpTransitionDir === -1) { // フェードアウト
            this.levelUpAlpha -= this.deltaTime * 4.0;
            if (this.levelUpAlpha <= 0) {
                this.levelUpAlpha = 0;
                this.levelUpTransitionDir = 0;
                // フェードアウト完了時：次の選択肢があれば再フェードインで表示
                const nextChoices = this.getAvailableLevelUpChoices();
                if (this.pendingLevelUpChoices > 0 && nextChoices.length > 0) {
                    this.levelUpChoices = nextChoices;
                    this.levelUpChoiceIndex = 0;
                    // this.levelUpChoiceIndex = 0; // フェードアウト完了まで位置を維持
                    this.levelUpInputLockMs = 420;
                    this.levelUpConfirmCooldownMs = 0;
                    this.levelUpRequireRelease = true;
                    this.levelUpTransitionDir = 1; // フェードイン開始
                    return;
                }
                this.state = GAME_STATE.PLAYING;
                // ショップから戻った後のステージクリア判定があれば遷移
                if (this.pendingStageClear) {
                    this.state = GAME_STATE.STAGE_CLEAR;
                    this.stageClearPhase = 0;
                }
                return;
            }
        }

        if (this.levelUpAlpha < 0.5) return; // ある程度表示されるまで入力を受け付けない

        // フェードアウト中は選択した時の状態を維持（次の選択肢を見せない）
        if (this.levelUpTransitionDir !== -1) {
            const choices = this.getAvailableLevelUpChoices();
            this.levelUpChoices = choices; // 描画側で確実に参照できるよう毎フレーム更新
        }
        const choices = this.levelUpChoices;
        if (choices.length === 0) {
            this.pendingLevelUpChoices = 0;
            this.levelUpTransitionDir = -1; // フェードアウト開始
            return;
        }
        this.levelUpInputLockMs = Math.max(0, this.levelUpInputLockMs - this.deltaTime * 1000);
        this.levelUpConfirmCooldownMs = Math.max(0, this.levelUpConfirmCooldownMs - this.deltaTime * 1000);
        this.levelUpChoiceIndex = Math.max(0, Math.min(choices.length - 1, this.levelUpChoiceIndex));

        // タッチ端末は札への直タップのみ受け付ける（仮想パッドのスティック/ボタンが
        // 選択を動かしたり誤決定したりしない。パネルは操作ボタンに重なる中央配置）。
        // ただし【外部キーボードが繋がっているときは物理キーを通す】。塞ぎたいのは
        // 画面に重なった仮想パッドであって、キーボードではない
        // (実機フィードバック 2026-08-11: 矢印もスペースも効かなかった)。
        const touchOnly = isTouchOverlayMode() && !input.hasPhysicalKeyboard;

        if (!touchOnly) {
            if (input.isActionJustPressed('LEFT')) {
                this.levelUpChoiceIndex = (this.levelUpChoiceIndex - 1 + choices.length) % choices.length;
                audio.playSelect();
            }
            if (input.isActionJustPressed('RIGHT')) {
                this.levelUpChoiceIndex = (this.levelUpChoiceIndex + 1) % choices.length;
                audio.playSelect();
            }
        }

        const confirmHeld = input.isAction('CONFIRM');
        if (this.levelUpRequireRelease) {
            if (!confirmHeld && !input.touchJustPressed) {
                this.levelUpRequireRelease = false;
            }
            return;
        }
        const canConfirm = this.levelUpInputLockMs <= 0 && this.levelUpConfirmCooldownMs <= 0;
        if (!canConfirm) return;

        if (input.touchJustPressed) {
            // 描画と同じレイアウト導出で札の矩形を判定（座標式を複製しない）
            const { cards } = getLevelUpChoiceLayout(choices.length);
            const pad = 10;
            for (let index = 0; index < cards.length; index++) {
                const c = cards[index];
                if (input.lastTouchX >= c.x - pad && input.lastTouchX <= c.x + c.w + pad
                    && input.lastTouchY >= c.y - pad && input.lastTouchY <= c.y + c.h + pad) {
                    this.levelUpChoiceIndex = index;
                    this.applyLevelUpChoice(choices[index].id || choices[index].type);
                    return;
                }
            }
        }

        if (!touchOnly && input.isActionJustPressed('CONFIRM')) {
            if (choices[this.levelUpChoiceIndex]) { this.applyLevelUpChoice(choices[this.levelUpChoiceIndex].id || choices[this.levelUpChoiceIndex].type); }
        }
    }

    updateSpecialCloneAutoCombat(activeEnemies = []) {
        if (!this.player || !this.player.isSpecialCloneCombatActive || !this.player.isSpecialCloneCombatActive()) return;
        if (!this.player.specialCloneAutoAiEnabled) return;
        // 【会戦前は分身の刃も通さない】。分身AI側で的を持たせない(playerSpecial.js)のと
        // 対称に、判定側でも本体の抜刀が封じられている間(会敵歩行〜登場演出)は評価しない。
        // ここは分身のモーション有無と独立に範囲内の敵を殴るため、
        // ボスの無敵が解ける ready(HPバーが開くまで)の間に削れてしまう。
        if ((this.player.attackInputLockTimer || 0) > 0) return;
        if (!Array.isArray(activeEnemies)) activeEnemies = [];
        const rockTargets = (this.stage && Array.isArray(this.stage.obstacles))
            ? this.stage.obstacles.filter((obs) => obs && !obs.isDestroyed && obs.type === OBSTACLE_TYPES.ROCK)
            : [];
        if (activeEnemies.length === 0 && rockTargets.length === 0) return;

        const cloneOffsets = this.player.getSpecialCloneOffsets ? this.player.getSpecialCloneOffsets() : [];
        if (!cloneOffsets.length) return;
        const attackMultiplier = this.getPlayerAttackMultiplier();
        const baseDamage = Math.max(10, Math.round((12 + 2) * attackMultiplier));
        const subWeapon = this.player.currentSubWeapon || null;
        const weaponName = subWeapon ? subWeapon.name : '奥義';
        const damageRockTarget = (rock, damage, impactX, impactY) => {
            if (!rock || rock.isDestroyed || rock.type !== OBSTACLE_TYPES.ROCK) return false;
            const rockDamage = Math.max(1, Math.round((damage || 1) * 0.35));
            if (rock.takeDamage(rockDamage)) {
                this.spawnRockBreakEffect(rock, impactX, impactY);
            }
            return true;
        };
        const buildDualCloneMainHitboxes = (clonePos, comboIndex, facingRight, scale = 1) => {
            if (!subWeapon || subWeapon.name !== '二刀流' || typeof subWeapon.getMainSwingArcs !== 'function') return [];
            const range = Number.isFinite(subWeapon.range) ? subWeapon.range : 64;
            const direction = facingRight ? 1 : -1;
            const cloneX = clonePos.x - this.player.getWorldWidth() * 0.5;
            const cloneY = clonePos.y - this.player.getWorldHeight() * 0.62;
            const centerX = cloneX + this.player.getWorldWidth() * 0.5;
            const centerY = cloneY + this.player.getWorldHeight() * 0.5;
            const frontX = cloneX + (direction > 0 ? this.player.getWorldWidth() : -range * 1.4);
            const backX = cloneX + (direction > 0 ? -range * 1.35 : this.player.getWorldWidth());
            const coreW = range * 0.75;
            const hitboxes = [];
            const arcs = subWeapon.getMainSwingArcs({ comboIndex });
            if (arcs.hit === 'drawDash') {
                hitboxes.push({ x: frontX, y: cloneY - 24, width: range * 1.48, height: 86 });
                hitboxes.push({ x: centerX - coreW * 0.5, y: centerY - 54, width: coreW * 0.98, height: 106 });
            } else if (arcs.hit === 'reverseCounter') {
                hitboxes.push({ x: frontX - range * 0.16, y: cloneY - 72, width: range * 1.4, height: 118 });
                hitboxes.push({ x: centerX - range * 0.66, y: cloneY - 84, width: range * 1.26, height: 92 });
            } else if (arcs.hit === 'crossStepSweep') {
                hitboxes.push({ x: backX - range * 0.16, y: centerY - 30, width: range * 1.74, height: 66 });
                hitboxes.push({ x: centerX - range * 0.92, y: centerY - 22, width: range * 1.84, height: 56 });
            } else if (arcs.hit === 'risingX') {
                hitboxes.push({
                    x: centerX - range * 1.1,
                    y: centerY - range * 1.08,
                    width: range * 2.2,
                    height: range * 2.14
                });
                hitboxes.push({
                    x: frontX - range * 0.24,
                    y: cloneY - 46,
                    width: range * 1.62,
                    height: 106
                });
            } else {
                const sRange = range * 1.82;
                hitboxes.push({
                    x: centerX - sRange,
                    y: centerY - sRange * 0.98,
                    width: sRange * 2,
                    height: sRange * 2.14
                });
                hitboxes.push({
                    x: centerX - range * 0.48,
                    y: centerY + 4,
                    width: range * 0.96,
                    height: range * 1.24
                });
            }
            if (scale > 1.001) {
                return hitboxes.map((hb) => {
                    const cx = hb.x + hb.width * 0.5;
                    const cy = hb.y + hb.height * 0.5;
                    const w = hb.width * scale;
                    const h = hb.height * scale;
                    return { x: cx - w * 0.5, y: cy - h * 0.5, width: w, height: h };
                });
            }
            return hitboxes;
        };
        for (const clone of cloneOffsets) {
            if (!this.player.canCloneAutoStrike || !this.player.canCloneAutoStrike(clone.index)) continue;
            
            // player.js側で管理されている分身の個別座標を使用
            const pos = this.player.specialClonePositions[clone.index];
            if (!pos) continue;

            const comboIndex = (this.player.specialCloneComboSteps && Number.isFinite(this.player.specialCloneComboSteps[clone.index]))
                ? (this.player.specialCloneComboSteps[clone.index] || 0)
                : 0;
            const dualCloneSwinging = weaponName === '二刀流' &&
                this.player.specialCloneSubWeaponActions &&
                this.player.specialCloneSubWeaponActions[clone.index] === '二刀_Z' &&
                this.player.specialCloneSubWeaponTimers &&
                (this.player.specialCloneSubWeaponTimers[clone.index] || 0) > 0;
            if (weaponName === '二刀流' && !dualCloneSwinging) continue;

            const dualRangeByStep = [156, 118, 126, 136, 146];
            const dualDamageByStep = [1.26, 0.94, 1.0, 1.08, 1.16];
            const dualKnockbackXByStep = [8, 6, 6.5, 7, 7.5];
            const dualKnockbackYByStep = [-7, -5, -5, -6, -6.5];
            const xAttackScale = (
                typeof this.player.isXAttackBoostActive === 'function' &&
                this.player.isXAttackBoostActive() &&
                typeof this.player.getXAttackHitboxScale === 'function'
            ) ? Math.max(1, this.player.getXAttackHitboxScale()) : 1;
            // specialCloneComboSteps は 1〜5 で循環するため、配列インデックス(0〜4)に変換
            const dualStepIdx = comboIndex >= 1 ? Math.min(4, comboIndex - 1) : 4;
            const attackRange = dualCloneSwinging
                ? dualRangeByStep[dualStepIdx] * (xAttackScale > 1.001 ? (1 + (xAttackScale - 1) * 0.82) : 1)
                : 100;
            const strikeDamage = dualCloneSwinging
                ? Math.round(baseDamage * dualDamageByStep[dualStepIdx])
                : baseDamage;
            const strikeKnockbackX = dualCloneSwinging ? dualKnockbackXByStep[dualStepIdx] : 6;
            const strikeKnockbackY = dualCloneSwinging ? dualKnockbackYByStep[dualStepIdx] : -5;

            if (dualCloneSwinging) {
                const dualHitboxes = buildDualCloneMainHitboxes(pos, comboIndex, pos.facingRight, xAttackScale);
                let didHit = false;
                for (const enemy of activeEnemies) {
                    if (!enemy || !enemy.isAlive || enemy.isDying) continue;
                    const enemyRect = this.getEnemyCollisionRect(enemy);
                    if (!dualHitboxes.some((hb) => this.rectIntersects(hb, enemyRect))) continue;
                    didHit = true;
                    this.damageEnemy(enemy, strikeDamage, {
                        source: 'special_shadow',
                        weapon: weaponName,
                        knockbackX: strikeKnockbackX,
                        knockbackY: strikeKnockbackY
                    });
                }
                for (const rock of rockTargets) {
                    const hitbox = dualHitboxes.find((hb) => this.rectIntersects(hb, rock));
                    if (!hitbox) continue;
                    didHit = damageRockTarget(
                        rock,
                        strikeDamage,
                        hitbox.x + hitbox.width * 0.5,
                        hitbox.y + hitbox.height * 0.5
                    ) || didHit;
                }
                // 二刀流分身は「1コンボ1回」の当たり判定評価に寄せる
                this.player.resetCloneAutoStrikeCooldown(clone.index);
                if (Array.isArray(this.player.specialCloneAutoCooldowns)) {
                    this.player.specialCloneAutoCooldowns[clone.index] = didHit ? 170 : 150;
                }
                continue;
            }

            const cloneCenterX = pos.x; 
            const cloneCenterY = pos.y;
            let target = null;
            let bestDistanceSq = Infinity;
            
            for (const enemy of activeEnemies) {
                const enemyCenterX = enemy.x + enemy.width * 0.5;
                const enemyCenterY = enemy.y + enemy.height * 0.5;
                const dx = enemyCenterX - cloneCenterX;
                const dy = enemyCenterY - cloneCenterY;
                const distSq = dx * dx + dy * dy;
                
                // AIによる移動があるため、攻撃範囲は少し広め
                if (distSq > attackRange * attackRange) continue;
                
                if (distSq < bestDistanceSq) {
                    bestDistanceSq = distSq;
                    target = enemy;
                }
            }
            let targetRock = null;
            for (const rock of rockTargets) {
                const rockCenterX = rock.x + rock.width * 0.5;
                const rockCenterY = rock.y + rock.height * 0.5;
                const dx = rockCenterX - cloneCenterX;
                const dy = rockCenterY - cloneCenterY;
                const distSq = dx * dx + dy * dy;
                if (distSq > attackRange * attackRange || distSq >= bestDistanceSq) continue;
                bestDistanceSq = distSq;
                target = null;
                targetRock = rock;
            }
            if (targetRock) {
                damageRockTarget(
                    targetRock,
                    strikeDamage,
                    targetRock.x + targetRock.width * 0.5,
                    targetRock.y + targetRock.height * 0.5
                );
                this.player.resetCloneAutoStrikeCooldown(clone.index);
                continue;
            }
            if (!target) continue;
            this.damageEnemy(target, strikeDamage, {
                source: 'special_shadow',
                weapon: weaponName,
                knockbackX: strikeKnockbackX,
                knockbackY: strikeKnockbackY
            });
            this.player.resetCloneAutoStrikeCooldown(clone.index);
        }
    }

    spawnStageBossDefeatEffect(enemy) {
        if (!enemy) return;
        const centerX = enemy.x + enemy.width * 0.5;
        const centerY = enemy.y + enemy.height * 0.5;
        
        // ボス撃破専用SE
        audio.playBossDeath();
        
        // 画面フラッシュ。旧 1.0 の完全ホワイトアウトは色を飛ばし、
        // 明けた直後の残像が「明るい暖色の空」に見えてしまうため 0.55 に抑える。
        // 代わりに画面端から黒が寄るクロージングで「幕が引かれる」感を出す。
        this.flashAlpha = BOSS_STAGING.DEFEAT_FLASH_ALPHA;

        // ヒットストップ → スローモーション → クロージングのタイムライン。
        // グローバルの hitStopEnabled(=false) は触らず、撃破専用の枠で時間を止める。
        this.bossDefeatHitStopMs = BOSS_STAGING.DEFEAT_HITSTOP_MS;
        this.bossDefeatSlowMs = BOSS_STAGING.DEFEAT_SLOW_MS;
        this.bossDefeatClosingMs = BOSS_STAGING.DEFEAT_CLOSING_MS;

        const shards = [];
        // 数ではなく、速度差と細い残光で密度を作る。
        for (let i = 0; i < 48; i++) {
            const angle = (Math.PI * 2 * i) / 48 + (Math.random() - 0.5) * 0.34;
            const speed = 3 + Math.random() * 8;
            shards.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.0,
                life: 800 + Math.random() * 800,
                maxLife: 1600,
                size: 2 + Math.random() * 3.5,
                rotation: angle,
                spin: (Math.random() - 0.5) * 0.22
            });
        }
        
        // 衝撃波（波紋）を多重に発生させる
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.hitEffects.push({
                    kind: 'ring',
                    x: centerX,
                    y: centerY,
                    life: 500,
                    maxLife: 500,
                    radius: 10,
                    color: '255, 255, 255'
                });
            }, i * 150);
        }

        this.stageBossDefeatEffects.push({
            x: centerX,
            y: centerY,
            timer: 0,
            duration: 2000,
            stageNumber: this.currentStageNumber,
            shards
        });
    }

    updateStageBossDefeatEffects() {
        if (!this.stageBossDefeatEffects || this.stageBossDefeatEffects.length === 0) return;
        this.stageBossDefeatEffects = this.stageBossDefeatEffects.filter((effect) => {
            effect.timer += this.deltaTime * 1000;
            for (const shard of effect.shards) {
                shard.vy += 0.2;
                shard.x += shard.vx;
                shard.y += shard.vy;
                shard.rotation += shard.spin || 0;
                shard.life -= this.deltaTime * 1000;
            }
            effect.shards = effect.shards.filter((shard) => shard.life > 0);
            return effect.timer < effect.duration || effect.shards.length > 0;
        });
    }

    renderExpGems(ctx) {
        if (!this.expGems || this.expGems.length === 0) return;

        for (const gem of this.expGems) {
            const isBossGem = gem.kind === 'boss';
            const glowColor = isBossGem ? '48, 122, 255' : '18, 168, 108';
            const rim = isBossGem ? 'rgba(188, 222, 255, 0.42)' : 'rgba(178, 255, 214, 0.4)';
            const blinkStartMs = 1300;
            
            // 基礎パルス：鼓動のようなゆったりとした「溜め」のある周期 (1.4秒周期)
            const pulseBase = Math.sin(gem.sparklePhase * 1.4);
            const pulse = 0.5 + 0.5 * (Math.pow(Math.abs(pulseBase), 0.8) * Math.sign(pulseBase));
            
            let alpha = 0.85 + 0.15 * pulse; // 0.7 〜 1.0 で呼吸するように
            if (gem.lifeMs <= blinkStartMs) {
                alpha *= (Math.sin(gem.lifeMs * 0.035) > 0 ? 1 : 0.22);
            }
            
            const half = gem.size;
            const outer = half;
            const inner = half * 0.53;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(gem.x, gem.y);

            // 接地感のための影（足元の楕円）
            // ジェムが地面に近い時だけ濃く描画
            const currentGroundY = (this.stage && this.stage.groundY) || (this.player && this.player.groundY) || 0;
            const groundLimit = currentGroundY + LANE_OFFSET;
            const distToGround = Math.max(0, groundLimit - gem.y);
            const shadowAlpha = Math.max(0, 0.3 - (distToGround * 0.015));
            if (shadowAlpha > 0) {
                ctx.save();
                ctx.translate(0, gem.size);
                ctx.scale(1.0, 0.4);
                ctx.beginPath();
                ctx.arc(0, 0, gem.size * 0.8, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
                ctx.fill();
                ctx.restore();
            }

            // わずかな浮遊感を回転にも
            ctx.rotate(Math.sin(gem.sparklePhase * 0.18) * 0.03);

            const gemGradient = ctx.createLinearGradient(-half, -half, half, half);
            if (isBossGem) {
                gemGradient.addColorStop(0, '#82bcff');
                gemGradient.addColorStop(0.5, '#1f66d9');
                gemGradient.addColorStop(1, '#0e3b8f');
            } else {
                gemGradient.addColorStop(0, '#87f2c6');
                gemGradient.addColorStop(0.5, '#18a86c');
                gemGradient.addColorStop(1, '#0a6b45');
            }

            // ほのかな発光：pulse に合わせて光の広がりを動かす
            ctx.shadowColor = `rgba(${glowColor}, ${0.4 + 0.4 * pulse})`;
            ctx.shadowBlur = (isBossGem ? 14 : 11) + pulse * 10;
            ctx.fillStyle = gemGradient;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = -Math.PI / 2 + i * (Math.PI / 4);
                const radius = i % 2 === 0 ? outer : inner;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = rim;
            ctx.lineWidth = 1.15;
            ctx.stroke();

            ctx.restore();
        }
    }
    renderStageBossDefeatEffects(ctx) {
        if (!this.stageBossDefeatEffects || this.stageBossDefeatEffects.length === 0) return;
        for (const effect of this.stageBossDefeatEffects) {
            const t = Math.max(0, Math.min(1, effect.timer / effect.duration));
            const fade = 1 - t;
            const palette = [
                [133, 190, 146], [207, 168, 105], [174, 196, 222],
                [219, 137, 83], [205, 177, 125], [229, 176, 194]
            ][Math.max(0, Math.min(5, (effect.stageNumber || 1) - 1))];
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const flareRadius = 90 + t * 92;
            const flare = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, flareRadius);
            flare.addColorStop(0, `rgba(255, 250, 231, ${0.30 * fade})`);
            flare.addColorStop(0.36, `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, ${0.17 * fade})`);
            flare.addColorStop(1, `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, 0)`);
            ctx.fillStyle = flare;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, flareRadius, 0, Math.PI * 2);
            ctx.fill();

            // 三重の細い波紋は時間差で開く。太い丸を重ねる旧爆発表現を避ける。
            for (let i = 0; i < 3; i++) {
                const rt = Math.max(0, Math.min(1, t * 1.45 - i * 0.16));
                if (rt <= 0) continue;
                ctx.strokeStyle = `rgba(${i === 0 ? '245, 226, 181' : palette.join(', ')}, ${(0.48 * (1 - rt) * fade).toFixed(3)})`;
                ctx.lineWidth = i === 0 ? 2 : 1;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, 22 + rt * (106 + i * 24), -0.15, Math.PI * 1.86);
                ctx.stroke();
            }

            const column = ctx.createLinearGradient(0, effect.y - 210, 0, effect.y + 110);
            column.addColorStop(0, 'rgba(255, 248, 226, 0)');
            column.addColorStop(0.58, `rgba(255, 248, 226, ${(0.12 * fade).toFixed(3)})`);
            column.addColorStop(1, 'rgba(255, 248, 226, 0)');
            ctx.fillStyle = column;
            ctx.fillRect(effect.x - 3 - 7 * fade, effect.y - 210, 6 + 14 * fade, 320);
            ctx.restore();

            for (const shard of effect.shards) {
                const life = Math.max(0, shard.life / shard.maxLife);
                ctx.save();
                ctx.translate(shard.x, shard.y);
                ctx.rotate(shard.rotation || 0);
                ctx.globalAlpha = life * 0.82;
                ctx.fillStyle = `rgba(${palette[0]}, ${palette[1]}, ${palette[2]}, 0.92)`;
                ctx.beginPath();
                ctx.moveTo(-shard.size * 1.9, 0);
                ctx.lineTo(0, -shard.size * 0.42);
                ctx.lineTo(shard.size * 1.9, 0);
                ctx.lineTo(0, shard.size * 0.42);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }
    }
    
    damageEnemy(enemy, damage, attackData = null) {
        const damageResult = enemy.takeDamage(damage, this.player, attackData);
        if (damageResult === null) return;
        this.applyFinisherBlowAway(enemy, attackData);
        const killed = damageResult;
        const isCritical = damage >= 50; // クリティカル判定閾値
        const hitCount = ++this.frameDamageHitCount;
        const denseHitScale = hitCount >= 28 ? 0.2 : (hitCount >= 18 ? 0.32 : (hitCount >= 10 ? 0.5 : (hitCount >= 6 ? 0.72 : 1.0)));
        const baseFeedback = this.resolveHitFeedback(attackData, damage, killed, isCritical);

        // ボス(高HP)への一撃は格上げ：雑魚連打1ヒットより「1発の重み」を強く返す。
        const isBossTarget = this.isStageBossEnemy(enemy) || (Number.isFinite(enemy.maxHp) && enemy.maxHp >= 120);
        if (isBossTarget) {
            const big = damage >= 60;
            baseFeedback.shake += big ? 1.6 : 0.6;
            baseFeedback.hitStopMs += big ? 40 : 14;
            baseFeedback.sparkCount += big ? 6 : 2;
            baseFeedback.ringBaseRadius += big ? 5 : 2;
            if (killed) { baseFeedback.shake += 2.2; baseFeedback.hitStopMs += 60; baseFeedback.sparkCount += 8; }
        }

        const feedback = (!killed && !isCritical && denseHitScale < 1.0)
            ? {
                ...baseFeedback,
                shake: baseFeedback.shake * Math.max(0.25, denseHitScale),
                hitStopMs: baseFeedback.hitStopMs * Math.max(0.2, denseHitScale),
                sparkCount: Math.max(1, Math.floor(baseFeedback.sparkCount * denseHitScale)),
                sparkSpeed: baseFeedback.sparkSpeed * (0.7 + denseHitScale * 0.3),
                suppressRing: denseHitScale <= 0.35
            }
            : baseFeedback;
        
        // 密集ヒット時はダメージ数値を間引いてCPU/GPU負荷を抑える
        const numberStride = hitCount >= 24 ? 5 : (hitCount >= 16 ? 4 : (hitCount >= 10 ? 3 : 1));
        const showDamageNumber = killed || isCritical || (hitCount % numberStride === 0);
        if (showDamageNumber) {
            this.damageNumbers.push({
                x: enemy.x + enemy.width / 2,
                y: enemy.y,
                damage: Math.floor(damage),
                isCritical: isCritical,
                timer: hitCount >= 16 ? 860 : 1000,
                vx: (Math.random() - 0.5) * (hitCount >= 16 ? 2.6 : 4),
                vy: -(hitCount >= 16 ? 2.2 : 3) - Math.random() * (hitCount >= 16 ? 1.4 : 3),
                gravity: hitCount >= 16 ? 0.16 : 0.2
            });
            if (this.damageNumbers.length > this.maxDamageNumbers) {
                const overflow = this.damageNumbers.length - this.maxDamageNumbers;
                this.damageNumbers.splice(0, overflow);
            }
        }

        const canSpawnVisual = killed || isCritical || this.frameDamageVisualCount < (hitCount >= 18 ? 6 : 10);
        if (canSpawnVisual) {
            this.spawnHitEffects(
                enemy.x + enemy.width / 2,
                enemy.y + enemy.height * 0.46,
                feedback,
                denseHitScale
            );
            this.frameDamageVisualCount++;

            // 被弾ノックバック時の足元土煙＝物理的な力を受けている実感。
            // 打ち上げ(launch)中は接地していないので出さない。密集多段ヒット時は denseHitScale で抑制。
            const kbX = (attackData && typeof attackData.knockbackX === 'number') ? attackData.knockbackX : 5;
            const launched = !!(attackData && attackData.isLaunch);
            if (kbX >= 4 && !launched && denseHitScale > 0.5 && enemy.isGrounded !== false) {
                const enemyCenterX = enemy.x + enemy.width * 0.5;
                const kbDir = enemyCenterX >= (this.player.x + this.player.getWorldWidth() * 0.5) ? 1 : -1;
                this.spawnGroundDust(enemyCenterX, enemy.y + enemy.height, {
                    intensity: Math.min(1, kbX / 9),
                    count: 4,
                    dir: kbDir > 0 ? Math.PI : 0, // ノックバックと逆（後ろ）へ巻き上がる
                    spread: 0.7,
                    speed: 1.0,
                    rise: 0.45,
                    size: 7,
                    color: '120, 108, 95'
                });
            }
        }
        
        if (killed) {
            // 撃破音を判定直後に鳴らす（タイミングを最速にする）
            if (!this.isStageBossEnemy(enemy)) {
                audio.playEnemyDeath();
            }

            // 報酬
            this.spawnExpGem(enemy);
            
            // 奥義ゲージ増加（撃破時）
            const baseGaugeGain = this.resolveHitGaugeGain(attackData, damage);
            const killBonus = 3.0;
            const totalGaugeGain = Math.round(baseGaugeGain * killBonus);
            if (totalGaugeGain > 0) this.player.addSpecialGauge(totalGaugeGain);
            
            // 小判
            if (enemy.moneyReward && enemy.moneyReward > 0) {
                this.player.addMoney(enemy.moneyReward);
            }
            
            if (this.isStageBossEnemy(enemy)) {
                this.spawnStageBossDefeatEffect(enemy);
            }
            
            this.queueHitFeedback(feedback.shake, feedback.hitStopMs);
        } else {
            // 非撃破ヒットにも武器種別に応じた奥義ゲージ蓄積を付与
            const gaugeGain = this.resolveHitGaugeGain(attackData, damage);
            if (gaugeGain > 0) this.player.addSpecialGauge(gaugeGain);
            if (this.shouldPlayDamageSfx(isCritical || hitCount <= 2)) {
                audio.playDamage();
            }
            const shouldQueueFeedback = isCritical || hitCount <= 8 || (hitCount % (hitCount >= 18 ? 6 : 3) === 0);
            if (shouldQueueFeedback) {
                this.queueHitFeedback(feedback.shake, feedback.hitStopMs);
            }
        }
    }

    resolveHitFeedback(attackData, damage, killed, isCritical) {
        const source = attackData && attackData.source ? attackData.source : 'main';
        const weapon = attackData && attackData.weapon ? attackData.weapon : null;
        const heavyLaunch = !!(attackData && attackData.isLaunch);
        const spearTipCritical = !!(attackData && attackData.spearTipCritical);
        const base = {
            shake: 2.3,
            hitStopMs: 52,
            sparkCount: 6,
            sparkSpeed: 2.9,
            sparkColor: '180, 226, 255',
            ringColor: '116, 196, 255',
            ringBaseRadius: 12
        };

        if (source === 'bomb' || weapon === '火薬玉') {
            base.shake = 6.2;
            base.hitStopMs = 112;
            base.sparkCount = 18;
            base.sparkSpeed = 4.8;
            base.sparkColor = '255, 176, 106';
            base.ringColor = '255, 132, 72';
            base.ringBaseRadius = 20;
        } else if (source === 'shockwave') {
            base.shake = 8.8;
            base.hitStopMs = 148;
            base.sparkCount = 24;
            base.sparkSpeed = 5.4;
            base.sparkColor = '255, 238, 164';
            base.ringColor = '255, 210, 110';
            base.ringBaseRadius = 26;
        } else if (source === 'special_shadow') {
            base.shake = 7.2;
            base.hitStopMs = 96;
            base.sparkCount = 20;
            base.sparkSpeed = 4.9;
            base.sparkColor = '174, 246, 255';
            base.ringColor = '130, 220, 255';
            base.ringBaseRadius = 23;
        } else if (weapon === '大太刀') {
            base.shake = 6.9;
            base.hitStopMs = 128;
            base.sparkCount = 20;
            base.sparkSpeed = 4.6;
            base.sparkColor = '255, 223, 160';
            base.ringColor = '255, 182, 98';
            base.ringBaseRadius = 24;
        } else if (weapon === '鎖鎌') {
            base.shake = 4.5;
            base.hitStopMs = 84;
            base.sparkCount = 12;
            base.sparkSpeed = 3.7;
            base.sparkColor = '190, 218, 232';
            base.ringColor = '146, 188, 214';
            base.ringBaseRadius = 17;
        } else if (weapon === '大槍') {
            base.shake = 4.2;
            base.hitStopMs = 76;
            base.sparkCount = 11;
            base.sparkSpeed = 3.9;
            base.sparkColor = '193, 233, 255';
            base.ringColor = '129, 198, 255';
            base.ringBaseRadius = 16;
        } else if (weapon === '二刀流') {
            base.shake = 3.6;
            base.hitStopMs = 66;
            base.sparkCount = 10;
            base.sparkSpeed = 3.4;
            base.sparkColor = '186, 232, 255';
            base.ringColor = '120, 203, 255';
            base.ringBaseRadius = 15;
        } else if (source === 'main') {
            base.shake = 3.0;
            base.hitStopMs = 60;
            base.sparkCount = 8;
            base.sparkSpeed = 3.1;
            base.sparkColor = '183, 227, 255';
            base.ringColor = '113, 190, 255';
            base.ringBaseRadius = 14;
        }

        if (heavyLaunch) {
            base.shake += 0.9;
            base.hitStopMs += 16;
            base.sparkCount += 3;
            base.ringBaseRadius += 3;
        }
        if (spearTipCritical) {
            base.shake += 1.4;
            base.hitStopMs += 18;
            base.sparkCount += 4;
            base.sparkSpeed += 0.9;
            base.ringBaseRadius += 3;
        }
        if (isCritical) {
            base.shake += 1.1;
            base.hitStopMs += 20;
            base.sparkCount += 4;
        }
        if (killed) {
            base.shake += 1.3;
            base.hitStopMs += 26;
            base.sparkCount += 6;
        }

        return base;
    }

    resolveHitGaugeGain(attackData, damage) {
        const source = attackData && attackData.source ? attackData.source : 'main';
        const weapon = attackData && attackData.weapon ? attackData.weapon : null;
        let gain = 0;
        let sourceScale = 1;
        if (source === 'shockwave') {
            gain = 5;
        } else if (source === 'bomb' || weapon === '火薬玉') {
            gain = 2.2;
        } else if (weapon === '手裏剣') {
            gain = 1.8;
        } else if (weapon === '大太刀') {
            gain = 3.0;
        } else if (weapon === '二刀流') {
            gain = 1.9;
        } else if (weapon === '鎖鎌') {
            gain = 2.5;
        } else if (weapon === '大槍') {
            gain = 2.1;
        } else if (source === 'subweapon') {
            gain = 1.8;
        } else if (source === 'main' || source === 'special_shadow') {
            gain = 1.4;
        }

        if (source === 'special_shadow') {
            // 分身キルでも奥義ゲージが貯まるようにしつつ、本体よりは抑えめに調整
            sourceScale = 0.65;
        }
        const damageFactor = Math.max(0.65, Math.min(1.45, damage / 24));
        return Math.max(0, Math.round(gain * sourceScale * damageFactor));
    }

    spawnRockBreakEffect(rock, impactX = null, impactY = null) {
        if (!rock) return;
        const cx = rock.x + rock.width * 0.5;
        const cy = rock.y + rock.height * 0.58;
        const sourceX = Number.isFinite(impactX) ? impactX : cx;
        const sourceY = Number.isFinite(impactY) ? impactY : cy;
        const launchBase = Math.atan2(cy - sourceY, cx - sourceX);
        const palette = getRockVisualPalette(rock.variant);
        const rockScale = Math.max(0.78, Math.min(1.45, (rock.width + rock.height) / 145));

        this.hitEffects.push({
            kind: 'ring',
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            life: 190,
            maxLife: 190,
            radius: 11,
            color: palette.ring
        });

        const dustCount = 9;
        const dustPalette = [palette.dust, palette.mid, palette.dark];
        for (let i = 0; i < dustCount; i++) {
            const dir = launchBase + this.noiseOffset(i) * 0.75;
            const speed = 0.7 + Math.random() * 1.8;
            const life = 280 + Math.random() * 220;
            this.hitEffects.push({
                kind: 'dust',
                x: cx + (Math.random() - 0.5) * 10,
                y: cy + (Math.random() - 0.5) * 6,
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - (0.5 + Math.random() * 0.6),
                life,
                maxLife: life,
                size: (6.5 + Math.random() * 7.5) * rockScale,
                color: dustPalette[i % dustPalette.length],
                fadeColor: palette.dark
            });
        }

        const shardCount = 18;
        const shardPalette = palette.shards || [palette.mid, palette.dark, palette.light];
        for (let i = 0; i < shardCount; i++) {
            const dirJitter = (Math.random() - 0.5) * 0.9;
            const dir = launchBase + (Math.PI * (i / shardCount - 0.5)) + dirJitter;
            const isLarge = i < 5;
            const speed = (isLarge ? 1.45 : 1.85) + Math.random() * (isLarge ? 2.8 : 3.9);
            const life = (isLarge ? 500 : 410) + Math.random() * (isLarge ? 300 : 230);
            const pointCount = 4 + Math.floor(Math.random() * 3);
            const aspect = 0.72 + Math.random() * 0.68;
            this.hitEffects.push({
                kind: 'rockShard',
                x: cx + (Math.random() - 0.5) * 12,
                y: cy - Math.random() * 10,
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - (1.4 + Math.random() * 1.1),
                life,
                maxLife: life,
                size: ((isLarge ? 6.8 : 3.8) + Math.random() * (isLarge ? 5.2 : 4.8)) * rockScale,
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * (isLarge ? 0.22 : 0.38),
                color: shardPalette[i % shardPalette.length],
                darkColor: palette.outline,
                lightColor: palette.light,
                points: createRockShardPoints(pointCount, aspect)
            });
        }

        if (this.hitEffects.length > this.maxHitEffects) {
            const overflow = this.hitEffects.length - this.maxHitEffects;
            this.hitEffects.splice(0, overflow);
        }

        this.queueHitFeedback(3.1, 34);
    }

    // 地面の土煙を少量スポーンする共通処理（着地・敵被弾ノックバックで使用）。
    // 既存 'dust' kind に乗せるため update/描画は流用。負荷(perfScale/最大数)で自動間引き＝重くしない。
    spawnGroundDust(cx, cy, opts = {}) {
        if (!this.hitEffects) return;
        if (this.hitEffects.length >= this.maxHitEffects - 4) return;
        const intensity = Math.max(0, Math.min(1, opts.intensity != null ? opts.intensity : 1));
        if (intensity <= 0.03) return;
        const perfScale = this.getHitEffectPerformanceScale();
        const perfCut = perfScale <= 0.5 ? 0.5 : (perfScale <= 0.7 ? 0.74 : 1);
        const baseCount = opts.count != null ? opts.count : 5;
        const count = Math.max(1, Math.round(baseCount * (0.5 + intensity * 0.5) * perfCut));
        const dir = opts.dir; // 指定があれば主飛散方向(rad)。未指定は左右へ割る
        const spread = opts.spread != null ? opts.spread : 0.8;
        const speed = (opts.speed != null ? opts.speed : 1.0) * (0.7 + intensity * 0.6);
        const color = opts.color || '150, 134, 116';
        const rise = (opts.rise != null ? opts.rise : 0.7) * (0.6 + intensity * 0.7);
        const sizeBase = (opts.size != null ? opts.size : 8) * (0.8 + intensity * 0.5);
        for (let i = 0; i < count; i++) {
            const baseAng = (dir != null) ? dir : (i % 2 === 0 ? 0 : Math.PI);
            const ang = baseAng + (Math.random() - 0.5) * spread * 2;
            const sp = (0.4 + Math.random() * 1.3) * speed;
            const life = 230 + Math.random() * 220;
            this.hitEffects.push({
                kind: 'dust',
                x: cx + (Math.random() - 0.5) * 12,
                y: cy + (Math.random() - 0.5) * 5,
                vx: Math.cos(ang) * sp,
                vy: -(rise + Math.random() * 0.8) + Math.sin(ang) * sp * 0.25,
                life,
                maxLife: life,
                size: sizeBase * (0.7 + Math.random() * 0.7),
                color
            });
        }
        if (this.hitEffects.length > this.maxHitEffects) {
            this.hitEffects.splice(0, this.hitEffects.length - this.maxHitEffects);
        }
    }

    noiseOffset(index) {
        return Math.sin(index * 13.73) * 0.5 + Math.cos(index * 5.91) * 0.35;
    }

    spawnHitEffects(x, y, feedback, burstScale = 1.0) {
        if (this.hitEffects.length >= this.maxHitEffects - 4) return;
        const count = Math.max(4, Math.floor(feedback.sparkCount || 8));
        const speed = feedback.sparkSpeed || 3;
        const sparkColor = feedback.sparkColor || '180, 226, 255';
        const ringColor = feedback.ringColor || '116, 196, 255';
        const ringBaseRadius = feedback.ringBaseRadius || 14;
        const loadRatio = this.maxHitEffects > 0 ? (this.hitEffects.length / this.maxHitEffects) : 0;
        const countScale = loadRatio >= 0.85 ? 0.35 : (loadRatio >= 0.65 ? 0.55 : (loadRatio >= 0.45 ? 0.75 : 1));
        const perfScale = this.getHitEffectPerformanceScale();
        const combinedBurstScale = Math.max(0.18, Math.min(1.0, burstScale));
        const adjustedCount = Math.max(1, Math.floor(count * countScale * perfScale * combinedBurstScale));
        const lifeScale = perfScale <= 0.4 ? 0.7 : (perfScale <= 0.62 ? 0.84 : 1.0);

        if (!feedback.suppressRing && loadRatio < (perfScale <= 0.52 ? 0.72 : 0.86)) {
            this.hitEffects.push({
                kind: 'ring',
                x,
                y,
                vx: 0,
                vy: 0,
                life: 160 * lifeScale,
                maxLife: 160 * lifeScale,
                radius: ringBaseRadius * (0.86 + perfScale * 0.14),
                color: ringColor
            });
        }

        for (let index = 0; index < adjustedCount; index++) {
            const angle = (index / adjustedCount) * Math.PI * 2 + Math.random() * 0.35;
            const burst = speed * (0.55 + Math.random() * 0.75);
            const sparkLife = (150 + Math.random() * 70) * lifeScale;
            this.hitEffects.push({
                kind: 'spark',
                x,
                y,
                vx: Math.cos(angle) * burst,
                vy: Math.sin(angle) * burst - 1.1,
                life: sparkLife,
                maxLife: sparkLife,
                size: 7 + Math.random() * 6,
                color: sparkColor
            });
        }

        if (this.hitEffects.length > this.maxHitEffects) {
            const overflow = this.hitEffects.length - this.maxHitEffects;
            this.hitEffects.splice(0, overflow);
        }
    }

    updateHitEffects() {
        if (!this.hitEffects || this.hitEffects.length === 0) return;
        let writeIndex = 0;
        for (let readIndex = 0; readIndex < this.hitEffects.length; readIndex++) {
            const effect = this.hitEffects[readIndex];
            effect.life -= this.deltaTime * 1000;
            if (effect.life <= 0) continue;
            if (effect.kind === 'spark') {
                effect.vx *= 0.94;
                if (effect.fadeUp) {
                    effect.vx *= 0.93;
                    effect.vy *= 0.93;
                } else if (effect.noGravity) {
                    effect.vy *= 0.94;
                } else {
                    effect.vy = effect.vy * 0.94 + 0.22;
                }
                effect.x += effect.vx;
                effect.y += effect.vy;
            } else if (effect.kind === 'ring') {
                effect.radius += 0.85;
            } else if (effect.kind === 'rockShard') {
                effect.vx *= 0.985;
                effect.vy = effect.vy * 0.96 + 0.28;
                effect.x += effect.vx;
                effect.y += effect.vy;
                effect.rotation += effect.spin || 0;
            } else if (effect.kind === 'dust') {
                effect.vx *= 0.9;
                effect.vy = effect.vy * 0.92 + 0.12;
                effect.x += effect.vx;
                effect.y += effect.vy;
            }
            this.hitEffects[writeIndex++] = effect;
        }
        this.hitEffects.length = writeIndex;
    }

    renderHitEffects(ctx) {
        if (!this.hitEffects || this.hitEffects.length === 0) return;
        const effectCount = this.hitEffects.length;
        const overloaded = effectCount > 90;
        const ultraOverloaded = effectCount > 140;
        const perfScale = this.getHitEffectPerformanceScale();
        const minWorldX = this.scrollX - 160;
        const maxWorldX = this.scrollX + CANVAS_WIDTH + 160;
        const minWorldY = -100;
        const maxWorldY = CANVAS_HEIGHT + 200;

        for (let i = 0; i < this.hitEffects.length; i++) {
            const effect = this.hitEffects[i];
            if (
                effect.x < minWorldX ||
                effect.x > maxWorldX ||
                effect.y < minWorldY ||
                effect.y > maxWorldY
            ) continue;
            if (ultraOverloaded && effect.kind === 'ring' && (i % 2 === 1)) continue;
            const lifeRatio = Math.max(0, Math.min(1, effect.life / effect.maxLife));
            if (effect.kind === 'spark') {
                if (ultraOverloaded && (i % 2 === 1)) continue;
                const vx = effect.vx || 0;
                const vy = effect.vy || -0.001;
                const denom = Math.max(1, Math.abs(vx) + Math.abs(vy));
                const length = (effect.size || 10) * (overloaded ? (0.42 + lifeRatio * 0.46) : (0.55 + lifeRatio * 0.72));
                const scale = length / denom;
                const endX = effect.x + vx * scale;
                const endY = effect.y + vy * scale;
                ctx.strokeStyle = `rgba(${effect.color}, ${0.18 + lifeRatio * 0.74})`;
                ctx.lineWidth = overloaded ? (1 + lifeRatio * 0.9) : (1.4 + lifeRatio * 1.6);
                ctx.lineCap = 'round';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(effect.x, effect.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            } else if (effect.kind === 'ring') {
                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(${effect.color}, ${0.15 + lifeRatio * 0.42})`;
                ctx.lineWidth = overloaded ? (1.35 + lifeRatio * 1.2) : (1.95 + lifeRatio * 1.9);
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (effect.kind === 'rockShard') {
                if (ultraOverloaded && (i % 2 === 0)) continue;
                const size = (effect.size || 5) * (0.78 + lifeRatio * 0.45);
                const points = effect.points || [
                    { x: -0.75, y: -0.42 },
                    { x: -0.12, y: -0.8 },
                    { x: 0.7, y: -0.2 },
                    { x: 0.5, y: 0.62 },
                    { x: -0.35, y: 0.72 }
                ];
                const color = effect.color || '92, 86, 79';
                const darkColor = effect.darkColor || '24, 20, 18';
                const lightColor = effect.lightColor || '126, 119, 108';
                ctx.save();
                ctx.translate(effect.x, effect.y);
                ctx.rotate(effect.rotation || 0);
                const shardGrad = ctx.createLinearGradient(-size, -size, size, size);
                shardGrad.addColorStop(0, `rgba(${lightColor}, ${0.18 + lifeRatio * 0.24})`);
                shardGrad.addColorStop(0.38, `rgba(${color}, ${0.3 + lifeRatio * 0.58})`);
                shardGrad.addColorStop(1, `rgba(${darkColor}, ${0.28 + lifeRatio * 0.48})`);
                ctx.fillStyle = shardGrad;
                ctx.beginPath();
                ctx.moveTo(points[0].x * size, points[0].y * size);
                for (let p = 1; p < points.length; p++) {
                    ctx.lineTo(points[p].x * size, points[p].y * size);
                }
                ctx.closePath();
                ctx.fill();

                if (!overloaded && points.length >= 3) {
                    ctx.fillStyle = `rgba(${lightColor}, ${0.08 + lifeRatio * 0.18})`;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(points[0].x * size, points[0].y * size);
                    ctx.lineTo(points[1].x * size, points[1].y * size);
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = `rgba(${lightColor}, ${0.08 + lifeRatio * 0.18})`;
                    ctx.lineWidth = 0.7;
                    ctx.beginPath();
                    ctx.moveTo(-size * 0.16, -size * 0.05);
                    ctx.lineTo(size * 0.34, size * 0.18);
                    ctx.stroke();
                }

                ctx.strokeStyle = `rgba(${darkColor}, ${0.2 + lifeRatio * 0.42})`;
                ctx.lineWidth = 0.9;
                ctx.beginPath();
                ctx.moveTo(points[0].x * size, points[0].y * size);
                for (let p = 1; p < points.length; p++) {
                    ctx.lineTo(points[p].x * size, points[p].y * size);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
            } else if (effect.kind === 'dust') {
                if (ultraOverloaded && (i % 2 === 1)) continue;
                const radius = (effect.size || 8) * (0.36 + lifeRatio * 0.9);
                const useSimpleDust = overloaded || perfScale < 0.78;
                if (useSimpleDust) {
                    ctx.fillStyle = `rgba(${effect.color || '104, 94, 84'}, ${0.1 + lifeRatio * 0.22})`;
                } else {
                    const fadeColor = effect.fadeColor || '70, 60, 52';
                    const grad = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
                    grad.addColorStop(0, `rgba(${effect.color || '104, 94, 84'}, ${0.14 + lifeRatio * 0.26})`);
                    grad.addColorStop(1, `rgba(${fadeColor}, 0)`);
                    ctx.fillStyle = grad;
                }
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    updateDamageNumbers() {
        if (!this.damageNumbers || this.damageNumbers.length === 0) return;
        const dtMs = this.deltaTime * 1000;
        const stageGroundY = (this.stage && Number.isFinite(this.stage.groundY)) ? this.stage.groundY : this.groundY;
        const damageNumberGroundY = stageGroundY + LANE_OFFSET - DAMAGE_NUMBER_GROUND_Y_OFFSET;
        let writeIndex = 0;
        for (let i = 0; i < this.damageNumbers.length; i++) {
            const dn = this.damageNumbers[i];
            dn.x += dn.vx;
            dn.y += dn.vy;
            dn.vy += dn.gravity || 0;

            // 上昇フェーズ後、下降開始地点から地面までの進行率でフェード
            if (dn.descentStartY === undefined && dn.vy >= 0) {
                dn.descentStartY = dn.y;
            }
            if (dn.descentStartY !== undefined) {
                const descentSpan = Math.max(
                    DAMAGE_NUMBER_DESCENT_FADE_MIN_SPAN,
                    damageNumberGroundY - dn.descentStartY
                );
                const descentProgress = Math.max(0, Math.min(1, (dn.y - dn.descentStartY) / descentSpan));
                dn.alpha = 1 - descentProgress;
            } else {
                dn.alpha = 1;
            }

            // 着地した瞬間に消す（着地後フェードはしない）
            if (dn.y >= damageNumberGroundY) {
                dn.y = damageNumberGroundY;
                dn.alpha = 0;
                dn.timer = 0;
            }

            dn.timer -= dtMs;
            if (dn.timer > 0 && dn.alpha > 0.01) this.damageNumbers[writeIndex++] = dn;
        }
        this.damageNumbers.length = writeIndex;
    }
    
    onStageClear() {
        // 奥義の分身・忍術の一時強化はクリア時点で全解除（クリア画面で点滅も残さない）
        this.clearRunTimeBuffs();
        // 突破印へ敵影や戦闘中の数値を持ち越さない。
        // 撃破時に死亡処理へ入った雑魚も、状態遷移で更新が止まると姿だけ残るためここで整理する。
        if (this.stage) {
            this.stage.enemies = [];
            this.stage.bossUiRevealT = 0;
        }
        this.damageNumbers = [];
        this.hitEffects = [];
        this.pendingLevelUpChoices = 0;
        // this.levelUpChoiceIndex = 0; // フェードアウト完了まで位置を維持

        // ボスの武器を獲得
        const stageInfo = STAGES[this.currentStageNumber - 1];
        const newWeaponName = stageInfo ? stageInfo.weapon : null;
        if (newWeaponName) {
            this.clearedWeapon = newWeaponName;
            if (!this.unlockedWeapons.includes(newWeaponName)) {
                this.unlockedWeapons.push(newWeaponName);
            }

            let weaponIndex = this.player.subWeapons.findIndex(w => w.name === newWeaponName);
            if (weaponIndex === -1) {
                const newWeapon = createSubWeapon(newWeaponName);
                if (newWeapon) {
                    this.player.subWeapons.push(newWeapon);
                    weaponIndex = this.player.subWeapons.length - 1;
                }
            }

            // ステージクリア後は新規獲得武器を自動装備
            if (weaponIndex !== -1) {
                this.player.subWeaponIndex = weaponIndex;
                this.player.currentSubWeapon = this.player.subWeapons[weaponIndex];
            }
            if (typeof this.player.refreshSubWeaponScaling === 'function') {
                this.player.refreshSubWeaponScaling();
            }
        } else {
            this.clearedWeapon = null;
        }
        
        const isFinalStage = this.currentStageNumber >= STAGES.length;

        // 進行度（セレクト画面の解放判定の正本）。再戦クリアでは下がらない。
        this.maxClearedStage = Math.max(this.maxClearedStage || 0, this.currentStageNumber);

        // セーブ（最終ステージクリア時は無効なステージ番号を保存しない）。
        // 保存する「次のステージ」は最前線基準。過去ステージの再戦クリアで
        // currentStageNumber+1 を使うと続きからが巻き戻るため。
        if (isFinalStage) {
            saveManager.deleteSave();
        } else {
            saveManager.save(this.player, Math.min(STAGES.length, this.maxClearedStage + 1), this.unlockedWeapons);
        }
        
        if (isFinalStage) {
            this.enterGameClearState();
        } else {
            this.state = GAME_STATE.STAGE_CLEAR;
        }
        this.stageClearPhase = 0; // 演出フェーズから開始
        this.stageClearAnnounceTimer = 0; // アナウンス演出用タイマー
        this.resetStageClearAutoSubWeaponTimer(false);
        this.stageClearMenuIndex = 0;
        this.stageClearWeaponIndex = Math.max(
            0,
            this.player.subWeapons.findIndex((weapon) => weapon === this.player.currentSubWeapon)
        );
        if (!isFinalStage) {
            // ここでオーディオを切り替えない（ボスBGM継続のため）
        }
        audio.playLevelUp();
    }
    
    updatePaused() {
        // 「タイトルに戻る」の2タップ確認の自動解除
        if (this.pauseReturnArmed) {
            this.pauseReturnArmedTimer -= this.deltaTime * 1000;
            if (this.pauseReturnArmedTimer <= 0) this.pauseReturnArmed = false;
        }

        // 画面下端中央の「タイトルに戻る」ボタン（キャプチャを邪魔しない控えめ配置・2タップ確認）
        if (input.touchJustPressed) {
            const tx = input.lastTouchX;
            const ty = input.lastTouchY;
            // 「地図に戻る」。行き先を選び直せるようにする(確認は要らない=中断ではない)
            if (this.canPauseReturnToMap()) {
                const mapBtn = getPauseMapButton();
                if (Math.abs(tx - mapBtn.x) <= mapBtn.w / 2 && Math.abs(ty - mapBtn.y) <= mapBtn.h / 2) {
                    input.touchJustPressed = false;
                    this.pauseReturnArmed = false;
                    if (typeof audio.playSelect === 'function') audio.playSelect();
                    this.returnToMapFromPause();
                    return;
                }
            }
            const btn = getPauseReturnButton();
            if (Math.abs(tx - btn.x) <= btn.w / 2 && Math.abs(ty - btn.y) <= btn.h / 2) {
                if (this.pauseReturnArmed) {
                    this.returnToTitle();
                } else {
                    this.pauseReturnArmed = true;
                    this.pauseReturnArmedTimer = 2500;
                    if (typeof audio.playSelect === 'function') audio.playSelect();
                }
                return;
            }
            // ボタン外をタップしたら確認を解除
            this.pauseReturnArmed = false;
        }

        // ポーズ中でも武器切替は許可
        if (this.player && input.isActionJustPressed('SWITCH_WEAPON')) {
            this.player.switchSubWeapon();
        }

        if (input.isActionJustPressed('PAUSE') || input.isActionJustPressed('DEBUG_TOGGLE')) {
            this.pauseReturnArmed = false;
            // 入った画面へ戻す(セレクトからのポーズはセレクトへ)
            this.state = (this.pauseReturnState === GAME_STATE.STAGE_CLEAR
                || this.pauseReturnState === GAME_STATE.STAGE_SELECT)
                ? this.pauseReturnState
                : GAME_STATE.PLAYING;
            audio.resumeBgm();
        }
    }

    /**
     * ポーズに「地図に戻る」を出してよい場面か。
     * 本編のステージを遊んでいる時だけ(寄り道は結果発表で戻る導線があり、
     * セレクト/ステータスからのポーズは戻る先が今そこなので要らない)。
     */
    canPauseReturnToMap() {
        if (this.pauseReturnState === GAME_STATE.STAGE_SELECT
            || this.pauseReturnState === GAME_STATE.STAGE_CLEAR) return false;
        if (this.stage && this.stage.sideKind) return false;   // 小判蔵・修行道場
        return this.state === GAME_STATE.PAUSED;
    }

    /**
     * プレイ画面の上に「締めの一行」を出している場面か。
     * 「Press SPACE or Tap Screen to 〜」や昇段・結果発表の操作行がある画面では、
     * 画面下の戦闘用の操作説明を重ねない(同じ場所に二行並んで読みづらい)。
     */
    isOverlayGuidanceVisible() {
        return this.state === GAME_STATE.GAME_OVER
            || this.state === GAME_STATE.GAME_CLEAR
            || this.state === GAME_STATE.STAGE_CLEAR
            || this.state === GAME_STATE.LEVEL_UP
            || this.state === GAME_STATE.SIDE_RESULT;
    }

    /**
     * ポーズから地図へ戻る。中断ではなく「行き先を選び直す」なので確認は挟まない。
     * 進捗(maxClearedStage)は既にセーブ済みで、そのステージは最初からやり直しになる。
     */
    returnToMapFromPause() {
        this.pauseReturnArmed = false;
        this.pauseReturnState = GAME_STATE.PLAYING;
        this.clearRunTimeBuffs();
        this.enterStageSelect();
    }

    // ポーズから タイトルへ戻る（中断）。セーブは保持し、タイトルで「続きから」可能にする。
    returnToTitle() {
        this.pauseReturnArmed = false;
        this.pauseReturnState = GAME_STATE.PLAYING;
        this.state = GAME_STATE.TITLE;
        this.titleMenuIndex = 0;
        audio.playBgm('title');
    }

    updateDefeat() {
        if (this.playerDefeatTimer > 0) {
            this.playerDefeatTimer -= this.deltaTime * 1000;
            if (this.playerDefeatTimer <= 0) {
                this.state = GAME_STATE.GAME_OVER;
                this.gameOverWaitTimer = 300;
                this.gameOverFadeInTimer = 0;
                this.gameOverFadeDuration = 400;
            }
        }

        // エフェクト更新継続
        this.updateHitEffects();
        this.updateDamageNumbers();
    }
    
    updateShop() {
        shop.update(this.deltaTime, this.player);
        
        if (!shop.isOpen) {
            if (this.returnToStageClearAfterShop) {
                this.returnToStageClearAfterShop = false;
                this.state = GAME_STATE.STAGE_CLEAR;
                if (this.player) this.player.previewMode = true;
                this.resetStageClearAutoSubWeaponTimer(true);
                return;
            }
            this.currentStageNumber++;
            if (this.currentStageNumber > STAGES.length) {
                this.enterGameClearState();
            } else {
                this.requestStageStart();
            }
        }
    }

    updateGameOver() {
        // ウェイトタイマーがなければ初期化
        if (this.gameOverWaitTimer === undefined) {
            this.gameOverWaitTimer = 1500; // 1.5秒待機
        }
        
        // タイマー減少
        if (this.gameOverWaitTimer > 0) {
            this.gameOverWaitTimer -= this.deltaTime * 1000;
            return;
        }
        
        // SPACE/Enter または画面タップでタイトルへ戻る
        if (input.isActionJustPressed('CONFIRM') || input.wasScreenTapped()) {
            this.gameOverWaitTimer = undefined; // リセット
            this.state = GAME_STATE.TITLE;
            audio.playBgm('title', 0);
        }
    }
    
    // タイトルで待っている間に「最初に始まるステージ」の背景を先読みしておく。
    // 続きからがあればその再開ステージ、無ければ第一ステージ。ここで読めていれば
    // 出陣直後の暗転待ちがゼロになる（1ステージ分だけ・低優先）。
    prefetchFirstStageAssets() {
        if (this._prefetchedTitleStage) return;
        this._prefetchedTitleStage = true;
        let stageNumber = 1;
        try {
            const saved = saveManager.load();
            const n = saved?.progress?.currentStage;
            if (Number.isFinite(n) && n >= 1 && n <= STAGES.length) stageNumber = n;
        } catch { /* セーブが壊れていても第一ステージを先読みすればよい */ }
        prefetchStageImages(stageNumber);
    }

    // 次ステージの背景を先読みする。プレイ中(数分)と幕間から呼ばれるので、
    // 遷移の暗転1.6秒では間に合わない大きな背景(ステージによっては十数MB)も
    // クリアする頃には揃っている。低優先の逐次ダウンロードなのでプレイ中の
    // 帯域は奪わない。1ステージ先までに留めるのはメモリと通信量のため
    // （全6ステージ分は 77MB / デコード後 248MB ある）。
    prefetchNextStageAssets() {
        const next = this.currentStageNumber + 1;
        if (next > STAGES.length || this._prefetchedStageNumber === next) return;
        this._prefetchedStageNumber = next;
        prefetchStageImages(next);
    }

    updateStageClear() {
        this.prefetchNextStageAssets();

        // 【行き先を選び直せるようにする】。全体マップで行き先を決めてから来た画面
        // なので、ESC は「一つ前＝マップへ戻る」を意味する。決めたら引き返せない
        // 画面になっていた(実機フィードバック 2026-08-11)。
        // マップから来ていない(クリア演出の流れなど)ときは従来どおりポーズへ。
        // 判定は入った時点の statusCanGoBack を読む(毎フレーム再計算するとちらつく)。
        const canGoBackToMap = this.stageClearPhase === 1 && this.statusCanGoBack;
        if (canGoBackToMap && input.isActionJustPressed('PAUSE')) {
            input.consumeAction('PAUSE');
            audio.playSelect();
            this.enterStageSelectWithFade();
            return;
        }
        // ステータス画面中は Q キーでもポーズ可能にする
        if (input.isActionJustPressed('PAUSE') || input.isActionJustPressed('DEBUG_TOGGLE')) {
            this.pauseReturnState = GAME_STATE.STAGE_CLEAR;
            this.state = GAME_STATE.PAUSED;
            audio.pauseBgm();
            return;
        }

        // ステージ遷移演出中はそちらを更新
        if (this.stageTransitionPhase > 0) {
            this.updateStageTransition();
            return;
        }

        // アナウンスタイマー更新と効果音トリガー
        if (this.stageClearPhase === 0) {
            const prevTimer = this.stageClearAnnounceTimer || 0;
            this.stageClearAnnounceTimer = prevTimer + this.deltaTime * 1000;
            // 「突破」表示タイミングで効果音（ui.js renderStageClearAnnouncement の clearDelay と同値）
            if (prevTimer < 380 && this.stageClearAnnounceTimer >= 380) {
                audio.playStageClear();
            }
        }

        // 演出フェーズ (Phase 0)
        if (this.stageClearPhase === 0) {
            if (this.stageClearAnnounceTimer < 1650) return; // 演出完了前はスキップ不可（ui.js pressDelay と同値）
            if (input.isActionJustPressed('CONFIRM') || input.wasScreenTapped()) {
                audio.playSelect();
                input.consumeAction('CONFIRM');
                // ステータス画面へは直行せず、全体マップで行き先を選んでから入る
                this.enterStageSelectWithFade();
            }
            return;
        }

        // ===== 詳細ステータス画面フェーズ (Phase 1) =====

        // プレイヤー更新（プレビューモード：Z/X/D入力 + 物理 + アニメーション）
        if (this.player && this.player.previewMode) {
            this.player.update(this.deltaTime, []);
            this.updateBombs([]);
            if (this.shockwaves) {
                this.shockwaves.forEach(sw => sw.update(this.deltaTime));
                this.shockwaves = this.shockwaves.filter(sw => !sw.isDestroyed);
            }

            const manualCombatInput =
                input.isAction('ATTACK') ||
                input.isAction('SUB_WEAPON') ||
                input.isActionJustPressed('ATTACK') ||
                input.isActionJustPressed('SUB_WEAPON');
            if (manualCombatInput) {
                // ユーザーがZ/Xで操作中は自動Xを一時停止
                this.stageClearAutoSubWeaponPauseMs = Math.max(this.stageClearAutoSubWeaponPauseMs, 1100);
            }

            if (this.stageClearAutoSubWeaponPauseMs > 0) {
                this.stageClearAutoSubWeaponPauseMs = Math.max(0, this.stageClearAutoSubWeaponPauseMs - this.deltaTime * 1000);
            } else {
                this.stageClearAutoSubWeaponTimerMs -= this.deltaTime * 1000;
                if (this.stageClearAutoSubWeaponTimerMs <= 0) {
                    const fired = this.tryAutoStageClearSubWeapon();
                    this.stageClearAutoSubWeaponTimerMs = fired
                        ? this.stageClearAutoSubWeaponIntervalMs
                        : 120;
                }
            }

            // 武器切替の同期
            this.stageClearWeaponIndex = this.player.subWeaponIndex;
        }

        // 上下キー：忍具メニュー選択時のみ装備切替
        if (input.isActionJustPressed('UP')) {
            if (this.stageClearMenuIndex === 0) {
                this.cycleStageClearWeapon(-1);
            }
            return; // UPキーがJUMP（決定）に伝播しないよう早期リターン
        }
        if (input.isActionJustPressed('DOWN')) {
            if (this.stageClearMenuIndex === 0) {
                this.cycleStageClearWeapon(1);
            }
            return;
        }

        // メニュー操作（左右キー）。地図から来ているときは「地図に戻る」も輪に入れる
        // ＝キーボードだけでも戻れる(タップ専用の導線にしない。実機フィードバック 2026-08-12)。
        const menuCount = 3;
        const cycleCount = canGoBackToMap ? menuCount + 1 : menuCount;
        this.stageClearMenuIndex = Math.max(0, Math.min(cycleCount - 1, this.stageClearMenuIndex));
        if (input.isActionJustPressed('LEFT')) {
            this.stageClearMenuIndex = (this.stageClearMenuIndex - 1 + cycleCount) % cycleCount;
            audio.playSelect();
        }
        if (input.isActionJustPressed('RIGHT')) {
            this.stageClearMenuIndex = (this.stageClearMenuIndex + 1) % cycleCount;
            audio.playSelect();
        }

        // 決定：SPACE / Enter（↑は装備切替なので決定にしない）
        if (input.isActionJustPressed('CONFIRM')) {
            this.handleStageClearConfirm();
        }

        if (input.touchJustPressed) {
            const tx = input.lastTouchX;
            const ty = input.lastTouchY;
            // メニュー矩形は描画(renderStatusScreen)と同じ getStatusScreenLayout から単一導出
            const L = getStatusScreenLayout();
            const slop = 10 * L.s;

            if (canGoBackToMap) {
                const b = L.backButton;
                if (tx >= b.x - slop && tx <= b.x + b.w + slop && ty >= b.y - slop && ty <= b.y + b.h + slop) {
                    input.touchJustPressed = false;
                    audio.playSelect();
                    this.enterStageSelectWithFade();
                    return;
                }
            }

            for (let i = 0; i < menuCount; i++) {
                const r = L.menuRects[i];
                if (tx >= r.x - slop && tx <= r.x + r.w + slop && ty >= r.y - slop && ty <= r.y + r.h + slop) {
                    this.stageClearMenuIndex = i;
                    this.handleStageClearConfirm();
                    return;
                }
            }
        }
    }

    startStageTransition() {
        this.stageTransitionPhase = 1; // FadeOut
        this.stageTransitionTimer = 0.8; // フェードアウト時間(秒)
        audio.fadeOutBgm(0.8); // 0.8秒かけてBGMフェードアウト
        // 暗転の1.6秒(フェードアウト+待機)を次ステージ背景の読み込みに使う。
        preloadStageImages(this.currentStageNumber);
    }

    updateStageTransition() {
        if (this.stageTransitionPhase === 1) {
            // フェードアウト中
            this.stageTransitionTimer -= this.deltaTime;
            if (this.stageTransitionTimer <= 0) {
                this.stageTransitionPhase = 2; // Wait (無音・暗転)
                this.stageTransitionTimer = 0.8; // 待機時間(秒) - ワンテンポ置く
            }
        } else if (this.stageTransitionPhase === 2) {
            // 無音待機中
            this.stageTransitionTimer -= this.deltaTime;
            if (this.stageTransitionTimer <= 0) {
                this.stageTransitionPhase = 0;
                this.requestStageStart(); // ステージ開始（ここでBGM再生 & シーン遷移）
            }
        }
    }

    // ステージ開始要求。背景アセットが揃っていなければ暗転のまま待ってから開始する。
    // 未ロードのまま開始すると naturalWidth=0 の画像は描画がスキップされ、
    // 下地だけの絵が数フレーム見えてから差し替わる＝フラッシングになる。
    requestStageStart() {
        // 寄り道(小判蔵/修行道場)。本編と同じく、背景が読めるまで暗幕のまま待つ
        if (this.pendingBonusStart) {
            this.pendingBonusStart = false;
            preloadImages(BONUS_STAGE_IMAGES);
            if (areImagesSettled(BONUS_STAGE_IMAGES)) {
                this.startBonusStage();
                return;
            }
            this.pendingStageStart = { side: 'bonus', waitMs: 0 };
            return;
        }
        if (this.pendingTrainingStart) {
            this.pendingTrainingStart = false;
            preloadImages(TRAINING_STAGE_IMAGES);
            if (areImagesSettled(TRAINING_STAGE_IMAGES)) {
                this.startTrainingStage();
                return;
            }
            this.pendingStageStart = { side: 'training', waitMs: 0 };
            return;
        }
        const stageNumber = this.currentStageNumber;
        preloadStageImages(stageNumber);
        if (areStageImagesSettled(stageNumber)) {
            this.startStage();
            return;
        }
        this.pendingStageStart = { stageNumber, waitMs: 0 };
    }

    // 保留中のステージ開始を進める。回線が遅い/画像が壊れている場合に永久に
    // 暗転したままにならないよう上限で打ち切る（従来どおり開始する＝最悪でも現状維持）。
    updatePendingStageStart() {
        const pending = this.pendingStageStart;
        if (!pending) return;
        pending.waitMs += this.deltaTime * 1000;
        if (pending.side) {
            const images = pending.side === 'training' ? TRAINING_STAGE_IMAGES : BONUS_STAGE_IMAGES;
            if (areImagesSettled(images) || pending.waitMs >= STAGE_ASSET_WAIT_MAX_MS) {
                this.pendingStageStart = null;
                if (pending.side === 'training') this.startTrainingStage();
                else this.startBonusStage();
            }
            return;
        }
        if (areStageImagesSettled(pending.stageNumber) || pending.waitMs >= STAGE_ASSET_WAIT_MAX_MS) {
            this.pendingStageStart = null;
            this.startStage();
        }
    }

    // ---- ステージセレクト（全体マップ）----

    // 選べる最深階層。全クリア済みプレイヤーは常に全解放（周回で任意のステージへ）。
    getMaxSelectableStage() {
        if (saveManager.loadGlobal().isGameCleared) return STAGES.length;
        return Math.min(STAGES.length, (this.maxClearedStage || 0) + 1);
    }

    // ボーナス(小判蔵)の解放。第2階層を踏破した後の寄り道として開く。
    isBonusUnlocked() {
        return saveManager.loadGlobal().isGameCleared || (this.maxClearedStage || 0) >= 2;
    }

    // 修行(道場)の解放。第3階層(山道)を踏破した後の寄り道として開く。
    isTrainingUnlocked() {
        return saveManager.loadGlobal().isGameCleared || (this.maxClearedStage || 0) >= 3;
    }

    // カーソルが辿る順序（地図の道なり順）。解放済みで、いま入れるものだけ。
    getStageSelectOrder() {
        const maxSelectable = this.getMaxSelectableStage();
        const bonusOk = this.isBonusUnlocked();
        const trainingOk = this.isTrainingUnlocked();
        return STAGE_SELECT_ORDER.filter((id) => {
            if (typeof id === 'number') return id <= maxSelectable;
            if (id === 'bonus1') return bonusOk;
            if (id === 'training1') return trainingOk;
            return false;
        });
    }

    /**
     * 地図⇔ステータスの暗転を進める。true を返す間は他の更新も入力も止める。
     * 暗転の底(alpha=1)で pending を走らせるので、画面の入れ替わりは幕の裏で起きる。
     */
    updateScreenFade() {
        const f = this.screenFade;
        if (!f || f.phase === 0) return false;
        const step = this.deltaTime / SCREEN_FADE_SEC;
        if (f.phase === 1) {
            f.alpha = Math.min(1, f.alpha + step);
            if (f.alpha >= 1) {
                const apply = f.pending;
                f.pending = null;
                f.phase = 2;
                if (apply) apply();
            }
        } else {
            f.alpha = Math.max(0, f.alpha - step);
            if (f.alpha <= 0) f.phase = 0;
        }
        return true;
    }

    /** 暗転を挟んで画面を切り替える。暗転中に重ねて呼ばれたら無視する。 */
    startScreenFade(apply) {
        if (!this.screenFade || this.screenFade.phase !== 0) return;
        this.screenFade.phase = 1;
        this.screenFade.alpha = 0;
        this.screenFade.pending = apply;
    }

    enterStageSelect() {
        this.state = GAME_STATE.STAGE_SELECT;
        // 初期カーソルは「次に進む階層」（=解放の最前線）
        this.stageSelectCursor = this.getMaxSelectableStage();
        this.pendingStageSelection = null;
        this.statusCanGoBack = false;
        audio.playBgm('menu');
    }

    /** 地図へ戻る（ステータス画面から）。暗転を挟んで切り替える。 */
    enterStageSelectWithFade() {
        this.startScreenFade(() => this.enterStageSelect());
    }

    updateStageSelect() {
        // セレクトからタイトルへ戻る導線。ここでポーズを受けないと、
        // 一度マップへ入るとタイトルへ戻る手段が無くなる(実機フィードバック)。
        if (input.isActionJustPressed('PAUSE')) {
            this.pauseReturnState = GAME_STATE.STAGE_SELECT;
            this.state = GAME_STATE.PAUSED;
            audio.pauseBgm();
            return;
        }
        const order = this.getStageSelectOrder();
        const move = (delta) => {
            const idx = Math.max(0, order.indexOf(this.stageSelectCursor));
            const next = order[Math.max(0, Math.min(order.length - 1, idx + delta))];
            if (next !== this.stageSelectCursor) {
                this.stageSelectCursor = next;
                audio.playSelect();
            }
        };
        if (input.isActionJustPressed('LEFT') || input.isActionJustPressed('DOWN')) move(-1);
        if (input.isActionJustPressed('RIGHT') || input.isActionJustPressed('UP')) move(1);

        if (input.isActionJustPressed('CONFIRM')) {
            input.consumeAction('CONFIRM');
            audio.playSelect();
            this.enterStatusScreenForStageWithFade(this.stageSelectCursor);
            return;
        }

        if (input.touchJustPressed) {
            // 描画と同じ導出でノード判定（座標式を複製しない）
            const node = getStageSelectLayout({
                bonusUnlocked: this.isBonusUnlocked(),
                trainingUnlocked: this.isTrainingUnlocked()
            }).nodeAt(input.lastTouchX, input.lastTouchY);
            if (node && order.includes(node.id)) {
                if (node.id === this.stageSelectCursor) {
                    // 選択中ノードの再タップで決定（誤タップで即出撃しないための2段階）
                    audio.playSelect();
                    this.enterStatusScreenForStageWithFade(node.id);
                } else {
                    this.stageSelectCursor = node.id;
                    audio.playSelect();
                }
            }
        }
    }

    // 寄り道ステージ(小判蔵/修行道場)の共通開始処理。本編の進行状態
    // (currentStageNumber / maxClearedStage)には一切触れない。
    startSideStage(stage, playerStartX) {
        this.pendingStageStart = null;
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        if (this.player) {
            this.player.previewMode = false;
            this.player.groundY = this.groundY;
            this.player.x = playerStartX;
            this.player.y = this.groundY + LANE_OFFSET - this.player.getWorldHeight();
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.isGrounded = true;
            this.player.isAttacking = false;
            this.player.isDashing = false;
            this.player.isCrouching = false;
            this.player.attackCombo = 0;
            this.player.attackTimer = 0;
            this.player.comboResetTimer = 0;
            if (typeof this.player.clearSpecialState === 'function') this.player.clearSpecialState(true);
            this.clearPlayerProjectiles();
            if (typeof this.player.resetVisualTrails === 'function') this.player.resetVisualTrails();
        }
        this.stage = stage;
        this.bombs = [];
        this.shockwaves = [];
        this.effects = [];
        this.hitEffects = [];
        this.damageNumbers = [];
        this.expGems = [];
        this.stageBossDefeatEffects = [];
        this.scrollX = 0;
        this.cameraLift = 0;
        this.cameraLiftTarget = 0;
        this.state = GAME_STATE.PLAYING;
        this.startTransition();
    }

    startBonusStage() {
        // 塔の登り口(左寄り)から。60秒の刻限は stage 側が持つ。
        // 難易度は塔の組み方(段差・吊り棚)と小判の値打ちに効く。記録も難易度別。
        this.startSideStage(new BonusStage(this.difficulty?.id || 'normal'), 120);
        audio.playBgm('sideBonus', 0, 0);
    }

    startTrainingStage() {
        const stage = new TrainingStage();
        this.startSideStage(stage, Math.round(stage.maxProgress * 0.5));
        audio.playBgm('sideTraining', 0, 0);
    }

    // 寄り道の刻限切れ → 結果発表。スコア(蔵=獲得両 / 道場=討伐数)と
    // 最高記録の更新判定をここで確定させ、SIDE_RESULT へ移る。
    // 最高記録は saveGlobal(sideBest) に持つ（プレイヤーのセーブとは独立）。
    // 難易度で敵の体力が0.8〜1.8倍と変わるので、記録は難易度ごとに分けて持つ。
    beginSideResult() {
        const stage = this.stage;
        const kind = (stage && stage.sideKind) || 'bonus';
        const score = (stage && typeof stage.getScore === 'function') ? Math.max(0, Math.floor(stage.getScore())) : 0;
        const difficultyId = this.difficulty?.id || 'normal';

        const globalData = saveManager.loadGlobal() || {};
        const { bests, migrated } = normalizeSideBests(globalData.sideBest);
        const prevBest = getSideBest(bests, kind, difficultyId);
        const isNewRecord = score > prevBest;
        if (isNewRecord) bests[sideBestKey(kind, difficultyId)] = score;
        // 旧データの移設だけでも書き戻す（次回また同じ移設をしないため）
        if (isNewRecord || migrated) saveManager.saveGlobal({ sideBest: bests });

        this.sideResult = {
            kind,
            score,
            prevBest,
            best: Math.max(prevBest, score),
            isNewRecord,
            difficultyId,
            difficultyName: this.difficulty?.name || '',
            timer: 0
        };
        // 奥義の分身・忍術の一時強化はここで落とす（次のステータス画面へ持ち越さない）
        this.clearRunTimeBuffs();
        // 拾った小判・稼いだ経験値を残す
        saveManager.save(this.player, Math.min(STAGES.length, (this.maxClearedStage || 0) + 1), this.unlockedWeapons || []);

        // BGM は切り替えない。寄り道の曲(substage)をそのまま鳴らし続け、
        // 結果を見る間も同じ場の余韻を保つ。セレクトへ戻る enterStageSelect が
        // メニュー曲へ引き継ぐ。
        this.state = GAME_STATE.SIDE_RESULT;
    }

    updateSideResult() {
        if (!this.sideResult) { this.enterStageSelect(); return; }
        this.sideResult.timer += this.deltaTime;
        // 演出が出揃うまでは入力を受けない（結果を読ませる間）
        if (this.sideResult.timer < 1.2) {
            input.consumeAction('CONFIRM');
            input.touchJustPressed = false;
            return;
        }
        if (this.sideResult.menuIndex === undefined) this.sideResult.menuIndex = 0;

        // 「もう一度」と「戻る」の二択。スコアアタックは連戦できてこそなので、
        // セレクト→ノード→ステータス→準備完了 の4手を挟まず直接やり直せる。
        const decide = (id) => {
            audio.playSelect();
            const kind = this.sideResult.kind;
            this.sideResult = null;
            this.transitionTimer = 1.0;   // 軽い暗転で場面を切る
            if (id === 'retry') this.retrySideStage(kind);
            else this.enterStageSelect();
        };

        if (input.touchJustPressed) {
            // 描画と同じ状態でレイアウトを引く(記録更新の有無でカード高＝
            // ボタンのy位置が変わるため、両方試すのではなく実際の値を使う)
            const hit = getSideResultLayout(this.sideResult.isNewRecord)
                .hitAt(input.lastTouchX, input.lastTouchY);
            input.touchJustPressed = false;
            if (hit) {
                this.sideResult.menuIndex = hit === 'retry' ? 0 : 1;
                decide(hit);
            }
            return;
        }
        // キーボードは ←→ で選んで決定（タッチ端末はボタン直タップのみ）
        if (input.isActionJustPressed('LEFT')) { this.sideResult.menuIndex = 0; audio.playCursor(); }
        if (input.isActionJustPressed('RIGHT')) { this.sideResult.menuIndex = 1; audio.playCursor(); }
        if (input.isActionJustPressed('CONFIRM')) {
            input.consumeAction('CONFIRM');
            decide(this.sideResult.menuIndex === 1 ? 'back' : 'retry');
        }
    }

    // 同じ寄り道へ入り直す。蔵は塔を組み直すので毎回違う構成になる。
    retrySideStage(kind) {
        if (kind === 'training') this.startTrainingStage();
        else this.startBonusStage();
    }

    // セレクト画面の描画。ポーズ中の背景としても使うので関数に切り出してある。
    renderStageSelectView() {
        renderStageSelect(this.ctx, {
            cursor: this.stageSelectCursor,
            maxSelectable: this.getMaxSelectableStage(),
            maxCleared: this.maxClearedStage,
            bonusUnlocked: this.isBonusUnlocked(),
            trainingUnlocked: this.isTrainingUnlocked(),
            sideBest: normalizeSideBests((saveManager.loadGlobal() || {}).sideBest).bests,
            difficultyId: this.difficulty?.id || 'normal',
            difficultyName: this.difficulty?.name || '',
            timeMs: Date.now()
        });
        // 【マップにポーズボタンは出さない】。左上のボタンが第1階層のノードと
        // 重なって地図を隠していた(実機フィードバック 2026-08-11)。
        // 地図は行き先を選ぶだけの画面で、止めるものが動いていない。
        // タイトルへはステージへ入ってからポーズで戻れる(キーボードは ESC が効く)。
    }

    // セレクトで行き先を決めた後のステータス画面（STAGE_CLEAR Phase1 を流用）。
    // pendingStageSelection は「準備完了」が読む。よろず屋を経由しても保持される。
    enterStatusScreenForStage(stageNumber) {
        this.pendingStageSelection = stageNumber;
        this.statusCanGoBack = true;
        this.state = GAME_STATE.STAGE_CLEAR;
        this.stageClearPhase = 1;
        this.stageClearMenuIndex = 0;
        this.resetStageClearAutoSubWeaponTimer(true);
        audio.playBgm('menu');
        this.enterStatusPreview();
    }

    /** 地図で行き先を決めてステータス画面へ。暗転を挟んで切り替える。 */
    enterStatusScreenForStageWithFade(stageNumber) {
        this.startScreenFade(() => this.enterStatusScreenForStage(stageNumber));
    }

    // 場が終わったら一時強化(奥義の分身・大薙・隠れ身など)を必ず落とす。
    // 本編クリア(onStageClear)と寄り道の刻限切れ(beginSideResult)の両方から呼ぶ。
    clearRunTimeBuffs() {
        const p = this.player;
        if (!p) return;
        if (typeof p.clearSpecialState === 'function') p.clearSpecialState(true);
        if (typeof p.resetTemporaryNinjutsuTimers === 'function') p.resetTemporaryNinjutsuTimers();
        p.invincibleTimer = 0;
        p.damageFlashTimer = 0;
    }

    // ステータス画面のキャラプレビュー初期化（高い地面・武器デモ用の状態リセット）
    enterStatusPreview() {
        if (!this.player) return;
        // 前の場の一時強化をステータス画面へ持ち越さない（分身がプレビューに並ぶ、
        // 大薙や隠れ身が効いたまま次のステージが始まる、といった事故を断つ）
        this.clearRunTimeBuffs();
        this.groundY = Math.round(CANVAS_HEIGHT * 0.08); // ステータス画面用の高い地面（画面最上部付近）
        if (this.stage) this.stage.groundY = this.groundY;
        this.player.previewMode = true;
        this.player.groundY = this.groundY;
        this.player.x = 100;
        this.player.y = this.groundY + LANE_OFFSET - this.player.getWorldHeight();
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.isGrounded = true;
        this.player.yVelocity = 0;
        this.player.jumpCount = 0;
        this.player.facingRight = true;
        this.player.isAttacking = false;
        this.player.currentAttack = null;
        this.player.attackTimer = 0;
        this.player.attackCombo = 0;
        this.player.subWeaponTimer = 0;
        this.player.subWeaponAction = null;
        this.player.invincibleTimer = 0;
        this.player.damageFlashTimer = 0;
        this.player.isDashing = false;
        this.player.isCrouching = false;
        this.clearPlayerProjectiles();
        this.player.resetVisualTrails();
    }

    handleStageClearConfirm() {
        if (this.stageClearMenuIndex === STATUS_MENU_MAP_BACK) {
            // 地図に戻る（左右キーの輪に入っている4つ目）
            audio.playSelect();
            this.enterStageSelectWithFade();
            return;
        }
        if (this.stageClearMenuIndex === 2) {
            // 準備完了 — セレクトで選んだステージへ（未選択時は従来どおり次の階層）
            audio.playGameStart();
            if (this.player) this.player.previewMode = false;
            this.applyStageDefaultWeaponChoice();
            // 寄り道(小判蔵/修行道場)へ。本編の進行(currentStageNumber)は変えない
            if (this.pendingStageSelection === 'bonus1') {
                this.pendingStageSelection = null;
                this.pendingBonusStart = true;
                this.startStageTransition();
                return;
            }
            if (this.pendingStageSelection === 'training1') {
                this.pendingStageSelection = null;
                this.pendingTrainingStart = true;
                this.startStageTransition();
                return;
            }
            this.currentStageNumber = this.pendingStageSelection || (this.currentStageNumber + 1);
            this.pendingStageSelection = null;
            if (this.currentStageNumber > STAGES.length) {
                this.enterGameClearState();
            } else {
                this.startStageTransition();
            }
        } else if (this.stageClearMenuIndex === 0) {
            // 忍具切り替え
            this.cycleStageClearWeapon(1);
        } else if (this.stageClearMenuIndex === 1) {
            // よろず屋
            audio.playSelect();
            if (this.player) this.player.previewMode = false;
            shop.open();
            this.returnToStageClearAfterShop = true;
            this.state = GAME_STATE.SHOP;
            audio.playBgm('menu');
        }
    }

    cycleStageClearWeapon(direction = 1) {
        if (!this.player || !Array.isArray(this.player.subWeapons) || this.player.subWeapons.length === 0) return;
        const count = this.player.subWeapons.length;
        const nextIndex = (this.stageClearWeaponIndex + direction + count) % count;
        this.stageClearWeaponIndex = nextIndex;
        this.player.subWeaponIndex = nextIndex;
        this.player.currentSubWeapon = this.player.subWeapons[nextIndex];
        audio.playSelect();
    }

    applyStageDefaultWeaponChoice() {
        if (!this.player || !Array.isArray(this.player.subWeapons) || this.player.subWeapons.length === 0) return;
        const selected = this.player.subWeapons[this.player.subWeaponIndex];
        if (!selected) return;
        const nextStage = this.currentStageNumber + 1;
        this.player.stageEquip = this.player.stageEquip || {};
        this.player.stageEquip[nextStage] = selected.name;
    }

    enterGameClearState() {
        this.state = GAME_STATE.GAME_CLEAR;
        this.gameClearTimer = 0;
        this.endingTimer = 0;
        if (this.player && typeof this.player.resetTemporaryNinjutsuTimers === 'function') {
            this.player.resetTemporaryNinjutsuTimers();
        }
        
        // クリアフラグをグローバル保存
        saveManager.saveGlobal({ isGameCleared: true });
    }

    resetStageClearAutoSubWeaponTimer(isPhaseOne = false) {
        const interval = Math.max(600, this.stageClearAutoSubWeaponIntervalMs || 1700);
        this.stageClearAutoSubWeaponTimerMs = isPhaseOne ? Math.min(760, interval * 0.45) : interval;
        this.stageClearAutoSubWeaponPauseMs = 0;
    }

    tryAutoStageClearSubWeapon() {
        const player = this.player;
        if (!player || !player.previewMode || !player.currentSubWeapon) return false;
        if (player.subWeaponTimer > 0) return false;

        if (player.currentSubWeapon.name === '二刀流') {
            if (player.currentSubWeapon.projectiles && player.currentSubWeapon.projectiles.length > 0) return false;
            player.currentSubWeapon.use(player, 'combined');
            player.subWeaponTimer = (typeof player.getSubWeaponActionDurationMs === 'function')
                ? player.getSubWeaponActionDurationMs('二刀_合体', player.currentSubWeapon)
                : 320;
            player.subWeaponAction = '二刀_合体';
            player.vx = 0;
            return true;
        }

        player.useSubWeapon();
        const weaponName = player.currentSubWeapon ? player.currentSubWeapon.name : '';
        const isThrow = weaponName === '火薬玉' || weaponName === '手裏剣';
        player.subWeaponTimer = (typeof player.getSubWeaponActionDurationMs === 'function')
            ? player.getSubWeaponActionDurationMs(isThrow ? 'throw' : weaponName, player.currentSubWeapon)
            : (
                isThrow ? 150 :
                weaponName === '大槍' ? 270 :
                weaponName === '鎖鎌' ? 560 :
                weaponName === '大太刀' ? 760 : 300
            );
        player.subWeaponAction = isThrow ? 'throw' : weaponName;
        return true;
    }

    updateGameClear() {
        this.gameClearTimer += this.deltaTime * 1000;

        // クリア演出後、入力でのみエンディングへ遷移
        const canSkip = this.gameClearTimer > 700;
        const wantsProceed = canSkip && (input.isActionJustPressed('CONFIRM') || input.wasScreenTapped());
        if (wantsProceed) {
            this.state = GAME_STATE.ENDING;
            this.endingTimer = 0;
            audio.playBgm('ending');
        }
    }

    updateEnding() {
        this.endingTimer += this.deltaTime * 1000;

        const canSkip = this.endingTimer > 900;
        const wantsReturn = canSkip && (input.isActionJustPressed('CONFIRM') || input.wasScreenTapped());
        if (wantsReturn) {
            saveManager.deleteSave();
            this.state = GAME_STATE.TITLE;
            this.titleMenuIndex = 0;
            this.titleDebugConfig.characterType = 'shogun'; // クリア直後は将軍がデフォルト
            audio.playBgm('title');
        }
    }

    
    render() {
        // 仮想パッドの当たり判定は「描いたフレームだけ」有効にする。
        // ここで毎フレーム落とし、renderVirtualPad が描いたときだけ true が立つ
        // （タイトル等パッド非表示の画面で見えない判定が残るのを防ぐ）。
        setVirtualPadVisible(false);

        // 変換行列が失われても毎フレーム復元して描画崩れを防ぐ
        if (this.canvas && this.ctx) {
            this.ctx.setTransform(
                this.canvas.width / SCREEN_WIDTH,
                0,
                0,
                this.canvas.height / CANVAS_HEIGHT,
                0,
                0
            );
        }

        // 画面クリア
        this.ctx.fillStyle = '#0f0f23';
        this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
        
        // 画面揺れ適用
        this.ctx.save();
        if (this.screenShakeEnabled && this.shakeIntensity > 0) {
            this.ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
        }

        switch (this.state) {
            case GAME_STATE.TITLE:
                renderTitleScreen(this.ctx, this.difficulty, this.titleMenuIndex, this.hasSave);
                if (this.titleDebugOpen) {
                    const entries = this.getTitleDebugEntries().map((entry) => ({
                        label: entry.label,
                        value: entry.getValue ? entry.getValue() : '',
                        isAction: !!entry.action
                    }));
                    renderTitleDebugWindow(this.ctx, entries, this.titleDebugCursor);
                }
                break;

            case GAME_STATE.PLAYING:
                this.renderPlaying();
                break;

            case GAME_STATE.PAUSED:
                if (this.pauseReturnState === GAME_STATE.STAGE_CLEAR) {
                    this.renderStageClearView();
                } else if (this.pauseReturnState === GAME_STATE.STAGE_SELECT) {
                    this.renderStageSelectView();
                } else {
                    this.renderPlaying();
                }
                renderPauseScreen(this.ctx, this.pauseReturnArmed, { canGoMap: this.canPauseReturnToMap() });
                break;

            case GAME_STATE.DEFEAT:
            case GAME_STATE.GAME_OVER:
                {
                    const defeatDuration = this.playerDefeatDuration;
                    const isGameOver = (this.state === GAME_STATE.GAME_OVER);

                    let defeatProgress = 0;
                    if (!isGameOver) {
                        defeatProgress = Math.max(0, Math.min(1.0, 1.0 - (this.playerDefeatTimer / defeatDuration)));
                    } else {
                        defeatProgress = 1.0;
                    }

                    const playerAlpha = (this.player && this.player.burstVanished) ? 0 : 1.0;
                    this.renderPlaying(playerAlpha, false);

                    // 赤オーバーレイ（じわじわ染まり、最終的にかなり暗く）
                    let redAlpha = 0;
                    if (!isGameOver) {
                        redAlpha = Math.pow(defeatProgress, 1.3) * 0.7;
                    } else {
                        if (this.gameOverFadeInTimer === undefined) this.gameOverFadeInTimer = 0;
                        this.gameOverFadeInTimer += this.deltaTime * 1000;
                        const goProgress = Math.min(1, this.gameOverFadeInTimer / Math.max(1, this.gameOverFadeDuration));
                        redAlpha = 0.7 + goProgress * 0.2;
                    }

                    const redGrad = this.ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
                    redGrad.addColorStop(0, `rgba(100, 0, 0, ${redAlpha})`);
                    redGrad.addColorStop(0.5, `rgba(60, 0, 0, ${redAlpha * 0.95})`);
                    redGrad.addColorStop(1, `rgba(30, 0, 0, ${redAlpha * 0.85})`);
                    this.ctx.fillStyle = redGrad;
                    this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

                    // ビネット
                    const vignetteStrength = isGameOver
                        ? 0.5 + Math.min(1, (this.gameOverFadeInTimer || 0) / 400) * 0.45
                        : defeatProgress * 0.45;
                    const vignette = this.ctx.createRadialGradient(
                        SCREEN_WIDTH / 2, CANVAS_HEIGHT / 2, SCREEN_WIDTH * 0.08,
                        SCREEN_WIDTH / 2, CANVAS_HEIGHT / 2, SCREEN_WIDTH * 0.62
                    );
                    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
                    vignette.addColorStop(1, `rgba(0, 0, 0, ${vignetteStrength})`);
                    this.ctx.fillStyle = vignette;
                    this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

                    // 追加の暗転層
                    if (isGameOver) {
                        const darkProgress = Math.min(1, (this.gameOverFadeInTimer || 0) / 500);
                        this.ctx.fillStyle = `rgba(0, 0, 0, ${darkProgress * 0.45})`;
                        this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);

                        this.ctx.save();
                        renderGameOverScreen(this.ctx, this.player, this.currentStageNumber, this.gameOverFadeInTimer, this.stage);
                        this.ctx.restore();
                    }
                }
                break;

            case GAME_STATE.LEVEL_UP:
                this.renderPlaying();
                if (this.levelUpChoices && this.levelUpChoices.length > 0) {
                    this.ctx.save();
                    this.ctx.globalAlpha = this.levelUpAlpha; // フェードイン/アウト適用
                    renderLevelUpChoiceScreen(
                        this.ctx, 
                        this.player, 
                        this.levelUpChoices, 
                        this.levelUpChoiceIndex,
                        this.pendingLevelUpChoices
                    );
                    this.ctx.restore();
                }
                break;

            case GAME_STATE.SHOP:
                // ショップは独立画面として描画し、ステージは背面に出さない
                shop.render(this.ctx, this.player);
                break;

            case GAME_STATE.STAGE_CLEAR:
                this.renderStageClearView();
                break;

            case GAME_STATE.SIDE_RESULT:
                // 背後は刻限切れ時のプレイ画面をそのまま残す（場の余韻）
                this.renderPlaying();
                renderSideResultScreen(this.ctx, this.sideResult);
                break;

            case GAME_STATE.STAGE_SELECT:
                this.renderStageSelectView();
                break;

            case GAME_STATE.GAME_CLEAR:
                // 通常ステージクリアと同じ見え方に寄せるため、背景はプレイ画面を再利用する
                this.renderPlaying();
                renderGameClearScreen(this.ctx, this.gameClearTimer);
                break;

            case GAME_STATE.ENDING:
                renderEnding(this.ctx, this.endingTimer);
                break;

            case GAME_STATE.INTRO:
                renderIntro(this.ctx, this.introTimer);
                break;
        }
        
        this.ctx.restore();

        // タッチ向けBGMトグルは全画面共通で表示。ただしデバッグウィンドウは画面上端
        // まで使うので、重なって項目が読めなくなる間だけ引っ込める（判定も止める）。
        const showBgmButton = !(this.state === GAME_STATE.TITLE && this.titleDebugOpen);
        setBgmButtonVisible(showBgmButton);
        if (showBgmButton) this.ui.renderGlobalTouchButtons(this.ctx);
        
        // ステージ遷移フェード（ステータス画面の「準備完了」からの暗転）。
        // 他の幕と同じくBGMボタンより後ろで描く＝ボタンも一緒に暗転する。
        if (this.stageTransitionPhase === 1 || this.stageTransitionPhase === 2) {
            this.ctx.save();
            const alpha = this.stageTransitionPhase === 2
                ? 1
                : Math.min(1.0, 1.0 - (this.stageTransitionTimer / 0.8));
            this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
        }

        // 地図⇔ステータスの暗転。幕の裏で画面が入れ替わるので、BGMボタンも一緒に沈める。
        if (this.screenFade && this.screenFade.alpha > 0) {
            this.ctx.save();
            this.ctx.fillStyle = `rgba(0, 0, 0, ${this.screenFade.alpha.toFixed(3)})`;
            this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
        }

        // 背景アセット待ちの暗幕。どの画面から開始しても（幕間/よろず屋/イントロ）
        // 待っている間は真っ黒で繋ぐ ＝ 待ちが伸びても「暗転が少し長い」だけで、
        // 未ロードの絵が一瞬見えることはない。
        if (this.pendingStageStart) {
            this.ctx.save();
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
        }

        // 画面遷移フェード（簡易実装）
        if (this.transitionTimer > 0) {
            this.ctx.save();
            const alpha = Math.min(1.0, this.transitionTimer);
            this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
            
            this.transitionTimer -= this.deltaTime * 2; // フェードアウト速度
        }

        // ボス撃破フラッシュ（0.55 上限。完全なホワイトアウトはしない）
        if (this.flashAlpha > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = Math.min(1.0, this.flashAlpha);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
            this.flashAlpha = Math.max(0, this.flashAlpha - this.deltaTime * 3.0); // フェードアウト速度
        }

        // ボス撃破のクロージング。画面を塞ぐ幕ではなく細い映画枠に留め、
        // 撃破地点と次の「突破」が同じ場で連続して見えるようにする。
        if (this.bossDefeatClosingMs > 0) {
            const total = BOSS_STAGING.DEFEAT_CLOSING_MS;
            const t = 1 - this.bossDefeatClosingMs / total; // 0→1
            // 前半で寄り、後半で引く（山なり）
            const amt = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
            const band = CANVAS_HEIGHT * 0.16 * amt;
            if (band > 0.5) {
                this.ctx.save();
                const top = this.ctx.createLinearGradient(0, 0, 0, band);
                top.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
                top.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = top;
                this.ctx.fillRect(0, 0, SCREEN_WIDTH, band);

                const bot = this.ctx.createLinearGradient(0, CANVAS_HEIGHT - band, 0, CANVAS_HEIGHT);
                bot.addColorStop(0, 'rgba(0, 0, 0, 0)');
                bot.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
                this.ctx.fillStyle = bot;
                this.ctx.fillRect(0, CANVAS_HEIGHT - band, SCREEN_WIDTH, band);

                this.ctx.strokeStyle = `rgba(224, 190, 119, ${(0.34 * amt).toFixed(3)})`;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(SCREEN_WIDTH * 0.18, band);
                this.ctx.lineTo(SCREEN_WIDTH * 0.82, band);
                this.ctx.moveTo(SCREEN_WIDTH * 0.18, CANVAS_HEIGHT - band);
                this.ctx.lineTo(SCREEN_WIDTH * 0.82, CANVAS_HEIGHT - band);
                this.ctx.stroke();
                this.ctx.restore();
            }
            this.bossDefeatClosingMs = Math.max(0, this.bossDefeatClosingMs - this.deltaTime * 1000);
        }

        // プレイヤー被弾の赤ビネット（画面端ほど濃く・中央は薄く視界を妨げない）。
        // gradient 1枚塗りのみ・点灯は被弾後 ~0.25s だけなので軽量。
        if (this.playerHurtFlashAlpha > 0.01) {
            const a = Math.min(0.85, this.playerHurtFlashAlpha);
            this.ctx.save();
            const g = this.ctx.createRadialGradient(
                SCREEN_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_HEIGHT * 0.30,
                SCREEN_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_HEIGHT * 0.74
            );
            g.addColorStop(0, 'rgba(190, 20, 20, 0)');
            g.addColorStop(1, `rgba(150, 12, 12, ${(a * 0.66).toFixed(3)})`);
            this.ctx.fillStyle = g;
            this.ctx.fillRect(0, 0, SCREEN_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
            this.playerHurtFlashAlpha -= this.deltaTime * 3.4; // フェードアウト速度
            if (this.playerHurtFlashAlpha < 0) this.playerHurtFlashAlpha = 0;
        }
    }
    
    // シーン遷移開始（フェードイン用）。render 側で deltaTime*2 で引くので
    // from=1.0 は 0.5 秒の暗転。ボス撃破→突破のように直前に別の演出(黒クロージング)を
    // 通してきた経路では暗転が二重になって「待たされる」ため短めを渡す。
    startTransition(from = 1.0) {
        this.transitionTimer = from;
    }

    getShakePerformanceScale() {
        const enemyCount = (this.stage && Array.isArray(this.stage.enemies)) ? this.stage.enemies.length : 0;
        const visualLoad = this.hitEffects.length + Math.floor(this.effects.length * 0.6) + enemyCount * 2;
        if (visualLoad >= 540) return 0.34;
        if (visualLoad >= 400) return 0.48;
        if (visualLoad >= 260) return 0.64;
        return 1.0;
    }

    getHitEffectPerformanceScale() {
        const effectCount = this.hitEffects ? this.hitEffects.length : 0;
        const numberCount = this.damageNumbers ? this.damageNumbers.length : 0;
        const combinedLoad = effectCount + numberCount * 2;
        let scale = 1.0;

        if (combinedLoad >= 320) scale = 0.28;
        else if (combinedLoad >= 240) scale = 0.42;
        else if (combinedLoad >= 170) scale = 0.56;
        else if (combinedLoad >= 110) scale = 0.74;

        const frameMs = this.deltaTime * 1000;
        if (frameMs >= 28) scale *= 0.82;
        if (frameMs >= 36) scale *= 0.72;

        return Math.max(0.22, Math.min(1.0, scale));
    }

    shouldPlayDamageSfx(isStrongHit = false) {
        if (isStrongHit) return true;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
        if (now - this.lastDamageSfxAtMs < this.damageSfxIntervalMs) return false;
        this.lastDamageSfxAtMs = now;
        return true;
    }

    getPlayerAttackMultiplier() {
        if (!this.player) return 1.0;
        const power = Number(this.player.attackPower);
        if (!Number.isFinite(power)) return 1.0;
        const characterScale = this.player.characterType === 'shogun' ? 1.2 : 1.0;
        return Math.max(1.0, power) * characterScale;
    }

    queueHitFeedback(shake = 0, hitStopMs = 0, force = false) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
        const perfScale = this.getShakePerformanceScale();
        const adjustedShake = this.screenShakeEnabled
            ? Math.min(this.maxShakeIntensity, Math.max(0, shake * perfScale))
            : 0;
        const adjustedHitStopMs = this.hitStopEnabled
            ? Math.max(0, Math.round(hitStopMs * (0.7 + perfScale * 0.3)))
            : 0;
        const strongEvent = adjustedHitStopMs >= 180;
        const canApplyFull = force || strongEvent || (now - this.lastHitFeedbackAtMs >= this.hitFeedbackIntervalMs);
        if (canApplyFull) {
            this.shakeIntensity = Math.max(this.shakeIntensity, adjustedShake);
            this.hitStopTimer = Math.max(this.hitStopTimer, adjustedHitStopMs);
            this.lastHitFeedbackAtMs = now;
            return;
        }
        // 密集ヒット中はヒットストップ連打を抑え、揺れだけ軽く反映する
        if (adjustedShake > 0) {
            this.shakeIntensity = Math.max(this.shakeIntensity, adjustedShake * 0.55);
        }
    }

    shakeCamera(intensity = 8, durationMs = 180) {
        if (!this.screenShakeEnabled) return;
        const shake = Math.max(0, Number(intensity) || 0) * 0.5;
        const hitStopMs = Math.max(0, Math.min(220, Math.round((Number(durationMs) || 0) * 0.2)));
        this.queueHitFeedback(shake, hitStopMs, true);
    }

    resolvePlayerSpikeOverlapAfterKnockback(preferredDir = 0) {
        if (!this.player || !this.stage || !Array.isArray(this.stage.obstacles)) return;

        const spikes = this.stage.obstacles.filter((obs) =>
            obs &&
            !obs.isDestroyed &&
            obs.type === OBSTACLE_TYPES.SPIKE &&
            Number.isFinite(obs.x) &&
            Number.isFinite(obs.y) &&
            Number.isFinite(obs.width) &&
            Number.isFinite(obs.height)
        );
        if (spikes.length === 0) return;

        const player = this.player;
        const margin = 1.2;
        const prefer = preferredDir < 0 ? -1 : (preferredDir > 0 ? 1 : 0);

        for (let pass = 0; pass < 3; pass++) {
            let solvedThisPass = false;
            for (const spike of spikes) {
                if (!this.rectIntersects(player, spike)) continue;

                const overlapLeft = (player.x + player.getWorldWidth()) - spike.x;
                const overlapRight = (spike.x + spike.width) - player.x;
                if (overlapLeft <= 0 || overlapRight <= 0) continue;

                const goLeftByPenetration = overlapLeft <= overlapRight;
                const centerDir = (player.x + player.getWorldWidth() * 0.5) < (spike.x + spike.width * 0.5) ? -1 : 1;
                let outDir = goLeftByPenetration ? -1 : 1;
                if (prefer !== 0) {
                    const preferMatches = prefer < 0 ? (overlapLeft <= overlapRight + 1.4) : (overlapRight <= overlapLeft + 1.4);
                    if (preferMatches) outDir = prefer;
                } else if (Math.abs(overlapLeft - overlapRight) < 1.2) {
                    outDir = centerDir;
                }

                if (outDir < 0) {
                    player.x = spike.x - player.getWorldWidth() - margin;
                    player.vx = Math.min(player.vx, -1.4);
                } else {
                    player.x = spike.x + spike.width + margin;
                    player.vx = Math.max(player.vx, 1.4);
                }

                solvedThisPass = true;
            }
            if (!solvedThisPass) break;
        }

        if (player.x < 0) {
            player.x = 0;
            player.vx = Math.max(0, player.vx);
        }
    }

    handlePlayerDamage(amount, sourceX = null, options = {}) {
        // 【名乗りの操作ロック中は無敵】。足を止めさせている間に残存の雑魚や
        // 飛翔中の矢・爆弾が当たると、避けようのないダメージになる。
        // invincibleTimer を立てる方式だと被弾フラッシュ(点滅)が名乗りの絵に写るため、
        // ダメージの入口で丸ごと弾く。
        if (this.player && (this.player.introControlLockTimer || 0) > 0) return false;
        const died = this.player.takeDamage(amount, { sourceX, ...options });
        if (died) {
            this.beginPlayerDefeat();
            return true;
        }
        const playerCenterX = this.player.x + this.player.getWorldWidth() * 0.5;
        const knockbackDir = sourceX === null
            ? (this.player.facingRight ? -1 : 1)
            : (playerCenterX < sourceX ? -1 : 1);
        this.resolvePlayerSpikeOverlapAfterKnockback(knockbackDir);
        return false;
    }

    handleSpikeDamage(amount, sourceX = null, options = {}) {
        const damage = Math.max(1, Math.round(amount || 2));
        let died = false;
        if (this.player && typeof this.player.takeTrapDamage === 'function') {
            died = this.player.takeTrapDamage(damage, { sourceX, ...options });
        } else {
            died = this.player.takeDamage(damage, { sourceX, ...options });
        }
        if (died) {
            this.beginPlayerDefeat();
            return true;
        }
        return false;
    }

    beginPlayerDefeat() {
        if (!this.player || this.state === GAME_STATE.DEFEAT || this.state === GAME_STATE.GAME_OVER) return;
        
        audio.playPlayerDeath();
        audio.playBgm('gameover');
        
        this.playerDefeatDuration = 600;
        this.playerDefeatTimer = this.playerDefeatDuration;
        this.state = GAME_STATE.DEFEAT;
        
        this.queueHitFeedback(14, 220); // より強い画面揺れとヒットストップ

        if (this.player) {
            // 攻撃状態をすべて解除
            this.player.isAttacking = false;
            this.player.currentAttack = null;
            this.player.subWeaponTimer = 0;
            this.player.subWeaponAction = null;
            this.player.isDashing = false;
            this.player.dashTimer = 0;
            
            this.player.vx = 0;
            this.player.vy = 0;
            
            // 死亡フラグ
            this.player.isDefeated = true;
            this.player.defeatTimer = 0;
            // 破裂消滅フラグ
            this.player.burstVanished = true;

            // 旧 defeatRedFlashAlpha は削除。代入するだけで読み出しも減衰も無い残骸で、
            // 死亡時の赤い染まりは render 側の defeatProgress(0→1で赤オーバーレイ)が担当している。

            const px = this.player.x + this.player.getWorldWidth() / 2;
            const py = this.player.y + this.player.getWorldHeight() / 2;
            
            // 破裂エフェクト（上方向の半円に飛散）
            for (let i = 0; i < 60; i++) {
                const angle = -Math.PI * Math.random(); // 0°〜-180°（上半円）
                const speed = 2 + Math.random() * 5;
                const colors = ['255, 51, 51', '255, 102, 68', '204, 34, 34', '255, 136, 102', '221, 68, 68', '255, 170, 119'];
                this.hitEffects.push({
                    kind: 'spark',
                    x: px + (Math.random() - 0.5) * 30,
                    y: py + Math.random() * 10,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 400 + Math.random() * 400,
                    maxLife: 800,
                    size: 4 + Math.random() * 8,
                    color: colors[i % colors.length],
                    noGravity: true,
                    fadeUp: true
                });
            }

            // 衝撃波リング（赤系）
            for (let i = 0; i < 3; i++) {
                this.hitEffects.push({
                    kind: 'ring',
                    x: px,
                    y: py,
                    life: 400 - i * 80,
                    maxLife: 400,
                    radius: 8 + i * 6,
                    color: '255, 80, 60'
                });
            }

            // 鉢巻・髪ノードをリセット
            if (typeof this.player.resetVisualTrails === 'function') {
                this.player.resetVisualTrails();
            }
        }
    }

    renderPlayerCombatLayer(ctx = this.ctx, options = {}) {
        const player = this.player;
        if (!ctx || !player) return;
        const playerAlpha = Number.isFinite(options.playerAlpha) ? options.playerAlpha : 1.0;
        const forceStanding = !!options.forceStanding;
        const includeBombs = options.includeBombs !== false;

        // プレイヤー
        if (playerAlpha > 0) {
            if (
                player.characterType !== 'shogun' &&
                (player.isUsingSpecial || player.specialSmoke.length > 0)
            ) {
                ctx.save();
                if (playerAlpha < 1.0) ctx.globalAlpha *= playerAlpha;
                player.renderSpecial(ctx);
                ctx.restore();
            }
            ctx.save();
            if (playerAlpha < 1.0) ctx.globalAlpha *= playerAlpha;

            // 最上層へ上がってくる最中も【プレイヤーは屋根の手前】に描く。
            // (雑魚は棟の線でクリップして屋根の裏から出るが、プレイヤーは
            //  軒に鎖鎌を掛けて手前の斜面を登ってくるので隠さない)
            player.render(ctx, {
                forceStanding: forceStanding,
                skipSpecialRender: true,
                ghostVeilActive: player.isGhostVeilActive()
            });
            ctx.restore();

            if (typeof player.renderCombatEffectLayer === 'function') {
                player.renderCombatEffectLayer(ctx, { worldEffectAlpha: playerAlpha });
            }

            // 分身（レベル2以下を含む）のサブウェポンエフェクト（大太刀着地時の地面衝撃波など）を描画
            if (
                player.specialCloneSubWeaponInstances &&
                Array.isArray(player.specialCloneSubWeaponInstances) &&
                player.specialClonePositions &&
                Array.isArray(player.specialClonePositions)
            ) {
                for (let i = 0; i < player.specialCloneSubWeaponInstances.length; i++) {
                    const inst = player.specialCloneSubWeaponInstances[i];
                    const pos = player.specialClonePositions[i];
                    if (!inst || !pos) continue;
                    if (player.specialCloneAlive && player.specialCloneAlive[i] === false) continue;
                    if (typeof inst.renderWorldEffects !== 'function') continue;

                    const cloneOwner = inst.owner && inst.owner._specialCloneOwner
                        ? inst.owner
                        : {
                            x: pos.x - player.getWorldWidth() * 0.5,
                            y: typeof player.getSpecialCloneDrawY === 'function'
                                ? player.getSpecialCloneDrawY(pos.y)
                                : pos.y - player.getWorldHeight() * 0.62,
                            width: player.getWorldWidth(),
                            height: player.getWorldHeight(),
                            groundY: typeof player.getSpecialCloneGroundYAtX === 'function'
                                ? player.getSpecialCloneGroundYAtX(pos.x)
                                : player.groundY,
                            facingRight: pos.facingRight,
                            isGrounded: !pos.jumping,
                            isEnemy: false,
                            currentSubWeapon: inst,
                            subWeaponAction: player.specialCloneSubWeaponActions
                                ? player.specialCloneSubWeaponActions[i]
                                : null,
                            subWeaponTimer: player.specialCloneSubWeaponTimers
                                ? (player.specialCloneSubWeaponTimers[i] || 0)
                                : 0,
                            isXAttackBoostActive: () => false,
                            scaleMultiplier: player.scaleMultiplier || 1.0
                        };

                    ctx.save();
                    if (playerAlpha < 1.0) ctx.globalAlpha *= playerAlpha;
                    inst.renderWorldEffects(ctx, cloneOwner);
                    ctx.restore();
                }
            }
        }

        // 火薬玉はキャラクターより前面に描画する
        if (includeBombs) {
            for (const bomb of this.bombs) {
                bomb.render(ctx);
            }
        }
    }

    renderPlaying(playerAlpha = 1.0, forceStanding = false) {
        const ctx = this.ctx;
        const suppressBattleHud = this.state === GAME_STATE.STAGE_CLEAR && this.stageClearPhase === 0;
        
        // 描画バグ（半身バグ等）を防ぐため、スケーリング適用前に全画面を黒でクリア
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
        
        ctx.save();

        // --- 世界ズームwrap (P2b §2.2) ---
        // 世界パス(背景〜ダメージ数値)のみ z = SCREEN_WIDTH/CANVAS_WIDTH 倍・下端アンカー。
        // 可視ワールド幅は SCREEN_WIDTH/z ≡ 1280 で不変（恒等式）。z=1 端末では恒等変換。
        // HUD・オーバーレイは wrap 外の等倍スクリーン空間。
        const worldZoom = SCREEN_WIDTH / CANVAS_WIDTH;
        const visTop = this.getCameraVisTop();
        ctx.save();
        ctx.scale(worldZoom, worldZoom);
        ctx.translate(0, -visTop);

        // P3 空補償: 星・雲・天体・stage5天井が可視域に収まるよう stage 側へ上端を通知
        this.stage.skyVisTop = visTop;

        // 1. 背景
        this.stage.renderBackground(ctx);

        // 1b. ボス空間演出（遠景の沈み込み）。地面はこの後に描かれるので影響しない。
        //     色は一切足さず黒のみ ─ 詳細は Stage.renderBossAtmosphere のコメント参照。
        if (this.stage.bossEncounterBlend > 0) {
            this.stage.renderBossAtmosphere(ctx, this.stage.bossEncounterBlend, 'far');
        }

        // --- レイヤー描画 ---
        
        // 2. 地面
        this.stage.renderGround(ctx);
        
        // 3. Stage 5: 階段描画 / Stage 6: 角の全高壁(視界遮断)
        if (this.currentStageNumber === 5 && this.stage.stageNumber === 5) {
            this.stage.renderPreviousStairTop(ctx, this.scrollX);
            this.stage.renderStairZone(ctx, this.scrollX);
        } else if (this.currentStageNumber === 6 && this.stage.stageNumber === 6) {
            this.stage.renderStage6CornerWalls(ctx, this.scrollX);
        }

        // 3a. 道沿いの添景（建物以外）。【地面の後】に描いて床帯へ立たせる。
        //     背景側(地面より前)に置いていた頃は足元を下げると地面に覆われるため
        //     地平線に貼り付けるしかなく、床帯の上で浮いて見えていた。
        //     Stage2 と Stage3 で同じ足元線(groundY+12)を使う。
        if (this.currentStageNumber === 2 && this.stage.stageNumber === 2
            && typeof this.stage.renderStage2RoadsideOnGround === 'function') {
            this.stage.renderStage2RoadsideOnGround(ctx);
        }
        if (this.currentStageNumber === 3 && this.stage.stageNumber === 3
            && typeof this.stage.renderStage3RoadsideOnGround === 'function') {
            this.stage.renderStage3RoadsideOnGround(ctx);
        }

        // 3b. ボス空間演出（足元スポットと空気の粒子）。影より奥＝床の明かりとして敷く。
        if (this.stage.bossEncounterBlend > 0) {
            this.stage.renderBossAtmosphere(ctx, this.stage.bossEncounterBlend, 'floor', {
                spots: this.getBossStagingSpots()
            });
        }

        // 4. 影
        if (this.shadowRenderer) {
            this.shadowRenderer.render(
                ctx,
                this.stage,
                this.player,
                this.stage.getShadowCasters(),
                this.scrollX
            );
        }

        // 5. ワールドオブジェクト（水平スクロール適用）
        ctx.save();
        ctx.translate(-Math.floor(this.scrollX), 0);
        
        // 障害物
        this.stage.renderObstacles(ctx);

        // 敵
        this.stage.renderEnemies(ctx);

        // 熟練ジェム
        this.renderExpGems(ctx);

        // ステージボス撃破演出
        this.renderStageBossDefeatEffects(ctx);
        
        // ボス（本体）
        if (this.stage.boss && this.stage.bossSpawned) {
            this.stage.boss.render(ctx);
        }
        
        // 衝撃波
        if (this.shockwaves) {
            for (const sw of this.shockwaves) {
                sw.render(ctx);
            }
        }

        // 旧「Stage6視認性ハロー」(黒装束が黒漆に同化する対策の青白い楕円光)は撤去。
        // 明るい空を背にすると保護目的を離れて常時オーラに見えるため(2026-08-05ユーザー判断)。

        // Stage6 角3: 鎖鎌の背面パス(軌跡と鎖)。体の後ろを通す。
        // ここはワールド変換(translate(-scrollX))の内側なのでワールド座標で描ける。
        const grappling = this.currentStageNumber === 6 && this.stage.isStage6Grappling();
        if (grappling) this.stage.renderStage6GrappleBehind(ctx);

        this.renderPlayerCombatLayer(ctx, { playerAlpha, forceStanding });

        // 前面パス(鎌ヘッドと噛んだ瞬間の火花)。鎌が頭の後ろへ回り込んで隠れるのを防ぐ。
        if (grappling) this.stage.renderStage6GrappleFront(ctx);

        // ヒット演出（世界座標）
        this.renderHitEffects(ctx);
        
        // ダメージ数値
        const damageNumberCount = this.damageNumbers.length;
        const frameMs = this.deltaTime * 1000;
        let damageNumberStride = damageNumberCount > 40 ? 3 : (damageNumberCount > 26 ? 2 : 1);
        if (frameMs > 24) damageNumberStride = Math.max(damageNumberStride, 2);
        if (frameMs > 32) damageNumberStride = Math.max(damageNumberStride, 3);
        for (let i = 0; i < this.damageNumbers.length; i += damageNumberStride) {
            const dn = this.damageNumbers[i];
            ctx.textAlign = 'center';
            this.ui.renderDamageNumber(ctx, dn.x, dn.y, dn.damage, dn.isCritical, dn.alpha);
        }
        
        ctx.restore(); // 水平スクロール保存の復元

        ctx.restore(); // 世界ズームwrapの復元（以降のHUD/フロアUIは等倍スクリーン空間）

        // 6. ボス空間演出（ビネットと左右の柱）。等倍スクリーン空間なので実画面を正しく縁取る。
        if (this.stage.bossEncounterBlend > 0) {
            const focus = this.getBossStagingFocus(worldZoom, visTop);
            this.stage.renderBossAtmosphere(ctx, this.stage.bossEncounterBlend, 'near', {
                screenW: SCREEN_WIDTH,
                screenH: CANVAS_HEIGHT,
                focusX: focus.x,
                focusY: focus.y
            });
        }

        // 3. HUD（カメラ固定）

        if (!suppressBattleHud) {
            // ボスUI（HPバーなど）。登場演出中は bossUiRevealT で上からスライドインする。
            if (this.stage.boss) {
                this.stage.renderBossUI(ctx);
            }

            this.renderBossNameBannerIfNeeded(ctx);
            this.ui.renderHUD(ctx, this.player, this.stage);
            if (!this.isOverlayGuidanceVisible()) {
                this.ui.renderControls(ctx);
            }

            if (this.currentStageNumber === 5 && this.stage.stageNumber === 5) {
                this.stage.renderFloorName(ctx);
            }
        }

        // Stage 5/6: フロア/角遷移の暗転オーバーレイ（最前面）
        if ((this.currentStageNumber === 5 || this.currentStageNumber === 6) && this.stage.isFloorTransitioning) {
            this.stage.renderFloorTransition(ctx);
        }

        // 冒頭(背景描画前)の save の復元。renderPlaying を自己完結で均衡化する。
        // HUD より前で戻すと HUD が継承する描画状態が変わるため、必ず関数末尾で戻す。
        ctx.restore();
    }

    renderStatusCharPreview() {
        const ctx = this.ctx;
        const player = this.player;
        if (!player) return;

        const previewCenterX = 280;
        const previewBaseHeight = 60;
        const previewBaseScale = 3.5;
        const previewWorldHeight = (typeof player.getWorldHeight === 'function')
            ? player.getWorldHeight()
            : PLAYER.HEIGHT;
        const safePreviewWorldHeight = Number.isFinite(previewWorldHeight) && previewWorldHeight > 0
            ? previewWorldHeight
            : PLAYER.HEIGHT;
        const scale = (previewBaseScale * previewBaseHeight) / safePreviewWorldHeight;
        const previewGroundScreenY = 360 + LANE_OFFSET * (previewBaseScale - scale); // 足元位置を旧見た目に揃える

        ctx.save();
        ctx.translate(previewCenterX, previewGroundScreenY);
        ctx.scale(scale, scale);
        ctx.translate(-(player.x + player.getWorldWidth() / 2), -player.groundY);

        player.render(ctx, { skipGlow: true });

        if (
            player.currentSubWeapon &&
            player.subWeaponRenderedInModel &&
            typeof player.currentSubWeapon.renderWorldEffects === 'function'
        ) {
            player.currentSubWeapon.renderWorldEffects(ctx, player);
        } else if (
            player.currentSubWeapon &&
            !player.subWeaponRenderedInModel &&
            typeof player.currentSubWeapon.render === 'function'
        ) {
            player.currentSubWeapon.render(ctx, player);
        }

        for (const bomb of this.bombs) {
            bomb.render(ctx);
        }

        if (this.shockwaves) {
            for (const sw of this.shockwaves) {
                sw.render(ctx);
            }
        }

        ctx.restore();
    }

    renderStageClearView() {
        if (this.stageClearPhase === 0) {
            this.renderPlaying();
            renderStageClearAnnouncement(this.ctx, this.currentStageNumber, this.clearedWeapon, this.stage);
        } else {
            const statusOptions = {
                menuIndex: this.stageClearMenuIndex,
                selectedWeaponName: this.player?.currentSubWeapon?.name || '未装備',
                // 全体マップで行き先を決めてから来たときだけ「地図に戻る」を出す。
                // 画面に入った時点で決めた値を使う＝準備完了を押した瞬間に
                // 操作説明の行が詰まってちらつくのを防ぐ。
                canGoBack: this.statusCanGoBack
            };
            // 背景 → キャラ → UI の順で固定
            renderStatusScreen(this.ctx, this.currentStageNumber, this.player, this.clearedWeapon, {
                ...statusOptions,
                layer: 'background'
            }, this.stage, this.ui);
            this.renderStatusCharPreview();
            renderStatusScreen(this.ctx, this.currentStageNumber, this.player, this.clearedWeapon, {
                ...statusOptions,
                layer: 'ui'
            }, this.stage, this.ui);
        }
        // ステージ遷移フェードはここでは描かない。BGMボタンより後ろになり
        // ボタンだけ暗転から取り残されるため、render() の共通の幕と同じ場所で描く。
    }
}

// シングルトンとしてエクスポート
export const game = new Game();
