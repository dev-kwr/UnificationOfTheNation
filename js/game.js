// ============================================
// Unification of the Nation - ゲームコア
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, GAME_STATE, STAGES, DIFFICULTY, OBSTACLE_TYPES, PLAYER, STAGE_DEFAULT_WEAPON } from './constants.js?v=53';
import { input } from './input.js?v=53';
import { Player } from './player.js?v=53';
import { createSubWeapon } from './weapon.js?v=53';
import { Stage } from './stage.js?v=53';
import { UI, renderTitleScreen, renderTitleDebugWindow, renderGameOverScreen, renderStatusScreen, renderStageClearAnnouncement, renderLevelUpChoiceScreen, renderPauseScreen, renderGameClearScreen, renderIntro, renderEnding } from './ui.js?v=53';
import { CollisionManager, checkPlayerEnemyCollision, checkEnemyAttackHit, checkPlayerAttackHit, checkSpecialHit, checkExplosionHit } from './collision.js?v=53';
import { saveManager } from './save.js?v=53';
import { shop } from './shop.js?v=53';
import { audio } from './audio.js?v=53';

class Game {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.state = GAME_STATE.TITLE;
        this.lastTime = 0;
        this.deltaTime = 0;
        
        // ゲームオブジェクト
        this.player = null;
        this.stage = null;
        this.bombs = [];
        this.effects = [];
        this.hitEffects = [];
        this.maxHitEffects = 360;
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
        
        this.difficultyIndex = 1; // NORMAL
        
        // ステージ情報
        this.currentStageNumber = 1;
        
        // 地面の高さ
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        
        // UI
        this.ui = new UI();
        
        // 当たり判定マネージャー
        this.collisionManager = new CollisionManager();
        
        // ダメージ数値エフェクト
        this.damageNumbers = [];
        
        // クリア時の武器
        this.clearedWeapon = null;
        
        // 演出用
        this.shakeIntensity = 0;
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
        this.playerDefeatTimer = 0;
        this.playerDefeatDuration = 3500; // 0.98s -> 3.5s に大幅延長
        this.titleDebugOpen = false;
        this.titleDebugCursor = 0;
        this.titleDebugApplyOnStart = false;
        this.titleDebugConfig = this.createTitleDebugConfig();
        this.debugKeyRepeatTimer = 0;
        this.stageClearPhase = 0; // 0: 演出(Announce), 1: 詳細ステータス
        this.levelUpChoices = [];
        this.flashAlpha = 0;
        this.levelUpAlpha = 0;
        this.levelUpTransitionDir = 0;
        this.stageTransitionTimer = 0;
        this.stageTransitionPhase = 0; // 0: None, 1: FadeOut, 2: Wait, 3: FadeIn
    }
    
    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // レスポンシブ描画設定
        canvas.style.objectFit = 'contain';
        canvas.style.touchAction = 'none';
        canvas.tabIndex = 0;
        this.configureCanvasResolution();

        // 入力管理にキャンバスを渡す（タッチ座標用）
        input.setCanvas(canvas);
        // 初期スケール設定
        this.updateInputScale();
        
        // リサイズイベント
        this.handleViewportResize = () => {
            this.configureCanvasResolution();
            this.updateInputScale();
        };
        window.addEventListener('resize', this.handleViewportResize);
        window.addEventListener('orientationchange', this.handleViewportResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.handleViewportResize);
            window.visualViewport.addEventListener('scroll', this.handleViewportResize);
        }
        
        // 敵AIなどがスクロール情報を参照できるようにグローバルに公開
        window.game = this;

        this.debugStartStage = this.getDebugStartStageFromUrl();
        
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
            CANVAS_WIDTH
        );
        const viewportHeight = Math.floor(
            (window.visualViewport && window.visualViewport.height) ||
            window.innerHeight ||
            document.documentElement.clientHeight ||
            CANVAS_HEIGHT
        );
        const availableWidth = Math.max(containerWidth, viewportWidth, 1);
        const availableHeight = Math.max(containerHeight, viewportHeight, 1);
        const fitScale = Math.max(0.1, Math.min(
            availableWidth / CANVAS_WIDTH,
            availableHeight / CANVAS_HEIGHT
        ));

        const cssWidth = Math.max(1, Math.floor(CANVAS_WIDTH * fitScale));
        const cssHeight = Math.max(1, Math.floor(CANVAS_HEIGHT * fitScale));
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;

        const isTouchDevice = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        const dprCap = isTouchDevice ? 1.5 : 2.0;
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap));
        const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
        const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
        if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
            this.canvas.width = backingWidth;
            this.canvas.height = backingHeight;
        }

        this.ctx.setTransform(
            backingWidth / CANVAS_WIDTH,
            0,
            0,
            backingHeight / CANVAS_HEIGHT,
            0,
            0
        );
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = isTouchDevice ? 'medium' : 'high';
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

    createTitleDebugConfig() {
        return {
            stage: 1,
            normalCombo: 0,
            subWeapon: 0,
            specialClone: 0,
            money: 0,
            startWeapon: '火薬玉',
            ownedWeapons: {
                '火薬玉': true,
                '大槍': false,
                '二刀流': false,
                '鎖鎌': false,
                '大太刀': false
            },
            items: {
                triple_jump: false,
                quad_jump: false,
                speed_up: false,
                hp_boost: 0,
                atk_boost: 0,
                permanent_max_special: false
            }
        };
    }

    getTitleDebugWeaponNames() {
        return ['火薬玉', '大槍', '二刀流', '鎖鎌', '大太刀'];
    }

    ensureTitleDebugStartWeapon() {
        const owned = this.getTitleDebugWeaponNames().filter((weapon) => this.titleDebugConfig.ownedWeapons[weapon]);
        if (owned.length === 0) {
            this.titleDebugConfig.ownedWeapons['火薬玉'] = true;
            this.titleDebugConfig.startWeapon = '火薬玉';
            return;
        }
        if (!owned.includes(this.titleDebugConfig.startWeapon)) {
            this.titleDebugConfig.startWeapon = owned[0];
        }
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
                label: '開始階層',
                getValue: () => `${cfg.stage}`,
                change: (delta) => { cfg.stage = clamp(cfg.stage + delta, 1, STAGES.length); }
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
                label: 'アイテム:三段跳び',
                getValue: () => (cfg.items.triple_jump ? '取得済' : '未取得'),
                change: () => {
                    cfg.items.triple_jump = !cfg.items.triple_jump;
                    if (!cfg.items.triple_jump) cfg.items.quad_jump = false;
                }
            },
            {
                label: 'アイテム:四段跳び',
                getValue: () => (cfg.items.quad_jump ? '取得済' : '未取得'),
                change: () => {
                    cfg.items.quad_jump = !cfg.items.quad_jump;
                    if (cfg.items.quad_jump) cfg.items.triple_jump = true;
                }
            },
            {
                label: 'アイテム:韋駄天の術',
                getValue: () => (cfg.items.speed_up ? '取得済' : '未取得'),
                change: () => { cfg.items.speed_up = !cfg.items.speed_up; }
            },
            {
                label: 'アイテム:体力増強',
                getValue: () => `+ ${this.titleDebugConfig.items.hp_boost * 5}`,
                change: (delta) => { 
                    this.titleDebugConfig.items.hp_boost = Math.max(0, Math.min(8, (this.titleDebugConfig.items.hp_boost || 0) + delta)); 
                }
            },
            {
                label: 'アイテム:剛力の秘術',
                getValue: () => `Lv ${this.titleDebugConfig.items.atk_boost}`,
                change: (delta) => { 
                    this.titleDebugConfig.items.atk_boost = Math.max(0, Math.min(3, (this.titleDebugConfig.items.atk_boost || 0) + delta)); 
                }
            },
            {
                label: '奥義常時MAX',
                getValue: () => (this.titleDebugConfig.items.permanent_max_special ? '有効' : '無効'),
                change: () => { 
                    this.titleDebugConfig.items.permanent_max_special = !this.titleDebugConfig.items.permanent_max_special; 
                }
            },
            {
                label: 'デバッグ設定で開始',
                getValue: () => 'ENTER',
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
        const weaponPool = ownedWeapons.length > 0 ? ownedWeapons : ['火薬玉'];
        this.player.subWeapons = weaponPool.map((name) => createSubWeapon(name)).filter(Boolean);
        if (this.player.subWeapons.length === 0) {
            const fallback = createSubWeapon('火薬玉');
            if (fallback) this.player.subWeapons = [fallback];
        }

        this.ensureTitleDebugStartWeapon();
        const startWeapon = weaponPool.includes(cfg.startWeapon) ? cfg.startWeapon : weaponPool[0];
        let startIndex = this.player.subWeapons.findIndex((weapon) => weapon.name === startWeapon);
        if (startIndex < 0) startIndex = 0;
        this.player.subWeaponIndex = startIndex;
        this.player.currentSubWeapon = this.player.subWeapons[startIndex] || null;

        this.unlockedWeapons = [...weaponPool];
        this.player.unlockedWeapons = [...weaponPool];
        this.player.stageEquip[this.currentStageNumber] = this.player.currentSubWeapon ? this.player.currentSubWeapon.name : '火薬玉';

        shop.purchasedSkills.clear();
        if (cfg.items.triple_jump) shop.purchasedSkills.add('triple_jump');
        if (cfg.items.quad_jump) shop.purchasedSkills.add('quad_jump');
        if (cfg.items.speed_up) shop.purchasedSkills.add('speed_up');
        this.player.maxJumps = cfg.items.quad_jump ? 4 : (cfg.items.triple_jump ? 3 : 2);
        this.player.speed = PLAYER.SPEED + (cfg.items.speed_up ? 1.5 : 0);
        this.titleDebugApplyOnStart = false;
    }
    
    updateInputScale() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        // input.js の getTouchAction は 1280x720 の内部座標を期待しているため、
        // クライアント矩形の幅に対する内部座標の比率を渡す。
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        input.setScale(scaleX, scaleY);
    }
    
    continueGame(saveData) {
        if (!saveData) return;
        
        // 武器作成関数をインポート
        import('./weapon.js').then(module => {
            // 基本ステータス復元
            this.currentStageNumber = saveData.progress.currentStage;
            this.player = new Player(100, this.groundY - PLAYER.HEIGHT, this.groundY);
            saveManager.applyToPlayer(this.player, saveData);
            
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
            this.scrollX = 0; // スクロール位置リセット
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
            audio.playBgm('stage', this.currentStageNumber);
        });
    }
    
    startStage() {
        // プレイヤー初期化（初回のみ生成、以降はリセット）
        if (!this.player) {
            this.player = new Player(100, this.groundY - PLAYER.HEIGHT, this.groundY);
        } else {
            this.player.x = 100;
            this.player.y = this.groundY - 60;
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
        
        this.state = GAME_STATE.PLAYING;
        // ステージ開始BGM：フェードインなしで即再生（fadeDuration = 0）
        audio.playBgm(this.stage.boss ? 'boss' : 'stage', this.currentStageNumber, 0);
        
        // ステージ開始時の暗転フェードイン
        this.startTransition();
    }
    
    // メインループ
    loop(currentTime) {
        // デルタタイム計算（秒単位）
        let rawDeltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;
        
        // ヒットストップ処理
        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= rawDeltaTime * 1000;
            this.deltaTime = 0; // 時間を止める
        } else if (this.state === GAME_STATE.DEFEAT) {
            // 敗北中はスローモーション (30% の速度)
            this.deltaTime = rawDeltaTime * 0.3;
        } else {
            this.deltaTime = rawDeltaTime;
        }

        // 画面揺れ減衰
        if (this.shakeIntensity > 0) {
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.1) this.shakeIntensity = 0;
        }

        // ボス撃破フラッシュの更新
        if (this.flashAlpha > 0) {
            this.flashAlpha -= rawDeltaTime * 1.5; // 約0.66秒で消える
            if (this.flashAlpha < 0) this.flashAlpha = 0;
        }
        
                try {
            // 更新
            this.update();
            
            // 描画
            this.render();
        } catch (err) {
            console.error('Game loop error:', err);
        } finally {
            // 入力状態更新（JustPressedリセット）
            // 何らかのエラーで update/render が止まっても、入力の固着を防ぐために必ず実行
            input.update();
        }
        
        // 次フレーム
        requestAnimationFrame((t) => this.loop(t));
    }
    
    update() {
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
        this.hasSave = saveManager.hasSave();
        if (this.titleDebugOpen) {
            this.updateTitleDebug();
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
        if (input.isActionJustPressed('UP')) {
            this.titleMenuIndex = (this.titleMenuIndex - 1 + 2) % 2;
            audio.playSelect();
            return;
        }
        if (input.isActionJustPressed('DOWN')) {
            this.titleMenuIndex = (this.titleMenuIndex + 1) % 2;
            audio.playSelect();
            return;
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
            return;
        }
        if (input.isActionJustPressed('LEFT') || input.isActionJustPressed('RIGHT')) {
            if (this.hasSave) {
                this.difficultyIndex = (this.difficultyIndex + 1) % this.difficultyKeys.length;
                this.updateDifficulty();
                audio.playSelect();
                return;
            }
        }
        
        // SPACEで決定 (Zキーを除外)
        if (input.isActionJustPressed('JUMP')) {
            if (this.hasSave) {
                if (this.titleMenuIndex === 0) {
                    this.continueGame(saveManager.load());
                } else {
                    saveManager.deleteSave();
                    this.startNewGame();
                }
            } else {
                this.startNewGame();
            }
            audio.playSelect();
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
            const cy = CANVAS_HEIGHT / 2;

            // 右下コーナータッチでデバッグウィンドウ開閉
            if (tX > CANVAS_WIDTH - 120 && tY > CANVAS_HEIGHT - 100) {
                this.titleDebugOpen = !this.titleDebugOpen;
                const count = this.getTitleDebugEntries().length;
                this.titleDebugCursor = Math.max(0, Math.min(count - 1, this.titleDebugCursor));
                audio.playSelect();
                return;
            }
            
            // 難易度変更エリア判定
            const diffY = this.hasSave ? cy + 170 : cy + 120;
            // 判定エリアを拡大 (+/- 45)
            if (tY > diffY - 45 && tY < diffY + 45) {
                this.difficultyIndex = (this.difficultyIndex + 1) % this.difficultyKeys.length;
                this.updateDifficulty();
                audio.playSelect();
                return;
            }
            
            if (this.hasSave) {
                // 続きから (CONTINUE) : Y = cy + 60
                if (tY > cy + 40 && tY < cy + 80) {
                    this.continueGame(saveManager.load());
                    audio.playSelect();
                    return;
                }
                
                // 最初から (NEW GAME) : Y = cy + 110
                if (tY > cy + 90 && tY < cy + 130) {
                    saveManager.deleteSave();
                    this.startNewGame();
                    audio.playSelect();
                    return;
                }
            } 
            
            // スタートボタン (セーブ有無に関わらず、一番下のボタンでStart)
            const startY = this.hasSave ? cy + 240 : cy + 200;
            // ボタン範囲判定用 (幅320, 高さ60 -> +/- 30 but allow margin)
            if (tY > startY - 40 && tY < startY + 40) {
                 if (this.hasSave) {
                     // セーブデータがあるのにStartButtonを押した -> Continue扱いにする
                     this.continueGame(saveManager.load());
                 } else {
                     this.startNewGame();
                 }
                 audio.playSelect();
                 return;
            }
        }
    }

    updateTitleDebug() {
        const entries = this.getTitleDebugEntries();
        if (!entries.length) return;
        this.titleDebugCursor = Math.max(0, Math.min(entries.length - 1, this.titleDebugCursor));

        const actions = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'JUMP', 'PAUSE'];
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
        }
    }

    handleTitleDebugTouch(entries) {
        const tX = input.lastTouchX;
        const tY = input.lastTouchY;

        // ui.js (renderTitleDebugWindow) の定数と完全に同期させる
        const panelW = 540;
        const panelX = CANVAS_WIDTH - panelW - 40;
        const panelY = 40;
        const rowH = 27; 
        const headerH = 100;
        const listStartY = panelY + 120; // ui.js L1089 と同じ
        const entriesCount = entries.length;
        const panelH = headerH + 10 + entriesCount * rowH + 20; // ui.js L1053 と同じ

        if (tX >= panelX && tX <= panelX + panelW && tY >= panelY && tY <= panelY + panelH) {
            // リスト範囲内での判定
            const relativeY = tY - listStartY;
            const index = Math.floor((relativeY + rowH / 2) / rowH); // 中央基準でヒット判定

            if (index >= 0 && index < entries.length) {
                const finalIndex = index;
                this.titleDebugCursor = finalIndex;
                const selected = entries[finalIndex];
                
                // 行の右側タップで増加/アクション、左側タップで減少（アクション以外）
                const midX = panelX + panelW / 2;
                if (selected.action) {
                    selected.action();
                } else {
                    selected.change?.(tX >= midX ? 1 : -1);
                }
                audio.playSelect();
            }
        } else {
            // パネル外クリックで閉じる
            this.titleDebugOpen = false;
            audio.playSelect();
        }
    }

    startNewGame() {
        const debugStage = this.titleDebugApplyOnStart ? this.titleDebugConfig.stage : null;
        this.currentStageNumber = debugStage || this.debugStartStage || 1;
        this.player = new Player(100, this.groundY - PLAYER.HEIGHT, this.groundY);
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
        this.gameClearTimer = 0;
        this.endingTimer = 0;
        this.playerDefeatTimer = 0;
        
        this.initStage(this.currentStageNumber);
        this.applyTitleDebugSetupToNewGame();

        this.state = GAME_STATE.INTRO; // INTROから開始
        this.introTimer = 0;
        audio.playBgm('title'); // イントロ中もタイトル曲を流す
    }
    
    updateIntro() {
        this.introTimer += this.deltaTime * 1000;
        
        // 操作入力でのみプレイ開始（自動遷移しない）
        if (this.introTimer > 500 && (input.isActionJustPressed('JUMP') || input.touchJustPressed)) {
            // ゲーム開始（フェードイン含む）
            this.startStage();
        }
    }
    
    initStage(stageNum) {
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
    }
    
    updatePlaying() {
        // ポーズ
        if (input.isActionJustPressed('PAUSE')) {
            this.state = GAME_STATE.PAUSED;
            audio.pauseBgm();
            return;
        }
        
        // プレイヤー更新
        const activeObstacles = this.stage.obstacles.filter(o => !o.isDestroyed);
        this.player.update(this.deltaTime, activeObstacles);
        
        // 爆弾投げ処理は player.update 内で実行されるため削除
        
        // 武器切り替えは player.handleInput() 内で処理されるため、ここでは不要
        

        
        // --- スクロール処理 (プレイヤー追従・戻りなし) ---
        const screenCenter = CANVAS_WIDTH / 2;
        // プレイヤーが画面中央を超えたらスクロール位置を更新
        if (this.player.x > this.scrollX + screenCenter) {
            this.scrollX = this.player.x - screenCenter;
        }
        
        // ステージ端（最大スクロール量）制限
        // Stage.jsのmaxProgressを最大スクロール量とする
        const maxScroll = this.stage.maxProgress;
        if (this.scrollX > maxScroll) {
            this.scrollX = maxScroll;
        }
        
        // 背景パララックス用にStage側のprogressも更新
        this.stage.progress = this.scrollX;
        
        // ステージ更新
        this.stage.update(this.deltaTime, this.player);
        if (this.stage.bossSpawned && !this.stage.bossDefeated && audio.bgmAudio && audio.bgmAudio.paused && !audio.isMuted) {
            audio.playBgm('boss', this.currentStageNumber);
        }
        
        // プレイヤーの移動制限（画面左端から出ない：戻りなしスクロールのため）
        if (this.player.x < this.scrollX) {
            this.player.x = this.scrollX;
        }
        // プレイヤーの移動制限（画面右端から出ない）
        if (this.player.x > this.scrollX + CANVAS_WIDTH) {
            this.player.x = this.scrollX + CANVAS_WIDTH;
        }

        const frameEnemies = this.stage.getAllEnemies();
        const activeFrameEnemies = frameEnemies.filter((enemy) => enemy.isAlive && !enemy.isDying);
        this.updateSpecialCloneAutoCombat(activeFrameEnemies);
        this.resolveFinisherLandingOverlap(activeFrameEnemies);

        // 爆弾更新
        this.updateBombs(activeFrameEnemies);
        this.updateExpGems();
        this.updateStageBossDefeatEffects();
        
        // 衝撃波更新
        if (this.shockwaves) {
            const rocks = this.stage.obstacles.filter(o => !o.isDestroyed && o.type === OBSTACLE_TYPES.ROCK);
            this.shockwaves.forEach(sw => {
                sw.update(this.deltaTime);
                
                // 衝撃波 vs 敵の当たり判定
                const hitbox = sw.getHitbox();
                for (const enemy of activeFrameEnemies) {
                    if (!sw.hitEnemies.has(enemy)) {
                        // オブジェクトのプロパティを直接渡すかrectIntersectsを適切に使う
                        const enemyRect = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
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
                        rock.takeDamage(8);
                    }
                }
            });
            this.shockwaves = this.shockwaves.filter(sw => !sw.isDestroyed);
        }

        // 当たり判定
        this.checkCollisions(frameEnemies, activeFrameEnemies);

        // ヒット演出更新
        this.updateHitEffects();
        
        // ダメージ数値更新
        this.updateDamageNumbers();
        
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
                // 次のシーンのフェードインを開始
                this.startTransition(); 
            }
        }
        
        // 奥義常時MAX
        if (this.titleDebugConfig.items.permanent_max_special && this.player) {
            this.player.specialGauge = this.player.maxSpecialGauge;
        }

        // ゲームオーバーチェック
        if (this.player.hp <= 0) {
            this.beginPlayerDefeat();
        }
    }
    
    updateBombs(enemies = []) {
        this.bombs = this.bombs.filter((bomb, index) => {
            bomb.update(this.deltaTime, this.groundY, enemies);
            
            // 爆発中の判定
            if (bomb.isExploding) {
                // 敵へのダメージ
                for (const enemy of enemies) {
                    if (this.collisionManager.checkAndRegisterBombHit(bomb, enemy, bomb.id)) {
                        this.damageEnemy(enemy, bomb.damage, {
                            source: 'bomb',
                            knockbackX: 8,
                            knockbackY: -6
                        });
                    }
                }
                
                // 障害物へのダメージ（岩など）
                const obstacles = this.stage.obstacles || [];
                for (const obs of obstacles) {
                    if (obs.type === OBSTACLE_TYPES.ROCK && !obs.isDestroyed) {
                        // 爆発の中心点と障害物の距離をチェック
                        const dx = (obs.x + obs.width / 2) - bomb.x;
                        const dy = (obs.y + obs.height / 2) - bomb.y;
                        const distSq = dx * dx + dy * dy;
                        const rangeSq = bomb.explosionRadius * bomb.explosionRadius;
                        
                        // 爆発範囲内かつ未登録（1回の爆発で多段ヒットしないよう管理が必要な場合もあるが、岩はHPが低いため簡易処理）
                        if (distSq < rangeSq) {
                            obs.takeDamage(1);
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
        const attackData = {
            source,
            weapon: subWeapon.name
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
            if (typeof subWeapon.getCurrentState === 'function') {
                const state = subWeapon.getCurrentState(this.player);
                if (state && state.phase === 'orbit') {
                    damage *= 1.16;
                    attackData.knockbackY = -7;
                }
            }
        } else if (subWeapon.name === '二刀流') {
            if (subWeapon.attackType === 'combined') {
                damage *= 1.28;
                attackData.knockbackX = 8;
                attackData.knockbackY = -8;
                attackData.isLaunch = true;
            } else if (subWeapon.attackType === 'main') {
                const comboIndex = Number.isFinite(subWeapon.comboIndex) ? subWeapon.comboIndex : 0;
                const comboStep = comboIndex === 0
                    ? 4
                    : Math.max(0, Math.min(4, comboIndex));
                damage *= 1 + comboStep * 0.09;
            }
        } else {
            attackData.knockbackX = 6;
            attackData.knockbackY = -4;
        }

        return { damage, attackData };
    }

    buildPlayerAttackDamage() {
        const baseDamage = 10 + this.player.attackCombo * 2 + (this.player.attackPower || 0) * 3;
        const attack = this.player.currentAttack;
        if (attack && attack.comboStep === 5) {
            return Math.round(baseDamage * 1.45);
        }
        return baseDamage;
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

        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
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
            const maxX = this.scrollX + CANVAS_WIDTH - player.width;
            player.x = Math.max(minX, Math.min(maxX, player.x));
        }
    }
    
    checkCollisions(enemies = null, aliveEnemies = null) {
        const enemyList = enemies || this.stage.getAllEnemies();
        const activeEnemies = aliveEnemies || enemyList.filter((enemy) => enemy.isAlive && !enemy.isDying);
        const cloneOffsets = (this.player && typeof this.player.getSpecialCloneOffsets === 'function')
            ? this.player.getSpecialCloneOffsets()
            : [];
        const cloneActive = cloneOffsets.length > 0;
        const cloneBodyRects = cloneOffsets.map((clone) => ({
            index: clone.index,
            x: this.player.x + clone.dx + 5,
            y: this.player.y + clone.dy + 5,
            width: this.player.width - 10,
            height: this.player.height - 10
        }));
        
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

            // 分身の通常攻撃判定 (独立AI)
            if (cloneActive) {
                const anchors = this.player.calculateSpecialCloneAnchors(this.player.x + this.player.width / 2, this.player.y + this.player.height * 0.62);
                
                for (let i = 0; i < this.player.specialCloneSlots.length; i++) {
                    if (!this.player.specialCloneAlive[i]) continue;
                    
                    const attackTimer = this.player.specialCloneAttackTimers[i] || 0;
                    if (attackTimer <= 0) continue;

                    const pos = this.player.specialClonePositions[i] || anchors[i];
                    const facingRight = pos.facingRight;
                    
                    // 分身用の状態を作成
                    const cloneState = {
                        x: pos.x - this.player.width / 2,
                        y: pos.y - this.player.height * 0.62,
                        facingRight: facingRight,
                        isAttacking: true,
                        currentAttack: {
                            comboStep: (this.player.specialCloneComboSteps[i] || 0) + 1,
                            durationMs: 420,
                            range: 90 // デフォルト範囲
                        },
                        attackTimer: attackTimer,
                        isCrouching: false
                    };

                    const attackHitbox = this.player.getAttackHitbox({ state: cloneState });
                    if (attackHitbox) {
                        const attackHitboxes = Array.isArray(attackHitbox) ? attackHitbox : [attackHitbox];
                        for (const enemy of activeEnemies) {
                            if (attackHitboxes.some((box) => this.rectIntersects(box, enemy))) {
                                const damage = this.buildPlayerAttackDamage(); // 基本ダメージ計算
                                this.damageEnemy(enemy, damage, {
                                    source: 'special_shadow',
                                    comboStep: cloneState.currentAttack.comboStep
                                });
                            }
                        }
                    }
                }
            }
        } else {
            // 攻撃終了時にヒットリストをリセット
            this.collisionManager.resetAttackHits();
            this.lastAttackSignature = null;
        }
        
        // (以前ここにあった障害物判定は下部の統合セクションへ移動)
        
        // サブ武器 vs 敵
        const subWeapon = this.player.currentSubWeapon;
        if (subWeapon && typeof subWeapon.getHitbox === 'function') {
            let hitboxes = subWeapon.getHitbox(this.player);
            if (hitboxes) {
                // 単一のオブジェクトなら配列に包む
                if (!Array.isArray(hitboxes)) hitboxes = [hitboxes];
                const baseSubProfile = this.buildSubWeaponAttackProfile(subWeapon, 'subweapon');
                const cloneSubProfile = this.buildSubWeaponAttackProfile(subWeapon, 'special_shadow');
                
                // 火薬玉の爆発チェック (subWeaponAction === 'bomb' かつ爆発判定が出ている場合)
                // getHitboxが爆風を返している前提だが、念のため岩破壊力を高めに設定
                const isBomb = this.player.subWeaponAction === 'bomb';
                
                for (const hitbox of hitboxes) {
                    // 敵へのダメージ
                    for (const enemy of activeEnemies) {
                        if (this.rectIntersects(hitbox, enemy)) {
                            this.damageEnemy(enemy, baseSubProfile.damage, { ...baseSubProfile.attackData });
                        }
                    }

                    // 岩へのダメージ（判定を確実に行う）
                    // 爆弾なら一撃で破壊できるようにダメージを大きく
                    let rockDamage = Math.max(1, Math.floor(subWeapon.damage * 0.45) || 1);
                    if (isBomb) rockDamage = 50; // 爆弾なら即破壊

                    for (const obs of this.stage.obstacles) {
                        if (obs.isDestroyed || obs.type !== OBSTACLE_TYPES.ROCK) continue;
                        if (this.rectIntersects(hitbox, obs)) {
                            obs.takeDamage(rockDamage);
                        }
                    }

                    // 分身のサブ武器判定
                    if (cloneActive) {
                        for (const clone of cloneOffsets) {
                            const shifted = {
                                x: hitbox.x + clone.dx,
                                y: hitbox.y + clone.dy,
                                width: hitbox.width,
                                height: hitbox.height
                            };
                            for (const enemy of activeEnemies) {
                                if (this.rectIntersects(shifted, enemy)) {
                                    this.damageEnemy(enemy, cloneSubProfile.damage, { ...cloneSubProfile.attackData });
                                }
                            }
                            // 分身の攻撃でも岩を壊せるように
                            for (const obs of this.stage.obstacles) {
                                if (obs.isDestroyed || obs.type !== OBSTACLE_TYPES.ROCK) continue;
                                if (this.rectIntersects(shifted, obs)) {
                                    obs.takeDamage(rockDamage);
                                }
                            }
                        }
                    }
                }
            }
        }
        


        // 敵攻撃 vs プレイヤー
        for (const enemy of activeEnemies) {
            if (checkEnemyAttackHit(enemy, this.player)) {
                if (this.handlePlayerDamage(enemy.damage, enemy.x + enemy.width / 2, {
                    knockbackX: 7,
                    knockbackY: -5
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
            if (checkPlayerEnemyCollision(this.player, enemy)) {
                if (this.handlePlayerDamage(1, enemy.x + enemy.width / 2, {
                    knockbackX: 5,
                    knockbackY: -3
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
        for (const obs of this.stage.obstacles) {
            if (obs.isDestroyed) continue;

            // プレイヤーとの衝突判定（棘ダメージ & 岩の押し戻し）
            // 判定を広めるため、player オブジェクトそのものを渡す（マージンなし）
            if (this.rectIntersects(this.player, obs)) {
                if (obs.type === OBSTACLE_TYPES.SPIKE) {
                    // 棘：無敵中でなければダメージ
                    if (this.player.invincibleTimer <= 0) {
                        if (this.handleSpikeDamage(obs.damage || 2, obs.x + obs.width / 2, {
                            knockbackX: 7,
                            knockbackY: -10
                        })) {
                            return;
                        }
                    }
                } else if (obs.type === OBSTACLE_TYPES.ROCK) {
                    // 岩：物理的な壁として押し戻す
                    this.player.vx = 0;
                }
            }

            // 岩への通常攻撃(Z)判定（サブ武器以外でも壊せるように）
            if (obs.type === OBSTACLE_TYPES.ROCK && this.player.isAttacking) {
                const atkBox = this.player.getAttackHitbox();
                const boxes = Array.isArray(atkBox) ? atkBox : (atkBox ? [atkBox] : []);
                if (boxes.some(box => this.rectIntersects(box, obs))) {
                    obs.takeDamage(1);
                }
            }
        }
    }


    isBossEnemy(enemy) {
        if (!enemy) return false;
        return enemy.maxHp >= 120 || (typeof enemy.maxPhase === 'number' && enemy.maxPhase > 1);
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

        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height * 0.5;
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
    
    rectIntersects(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
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
        const gemExp = Math.max(1, Math.round(expValue * (isBossGem ? 1.8 : 1)));
        this.expGems.push({
            x: enemy.x + enemy.width * 0.5,
            y: enemy.y + enemy.height * 0.42,
            vx: (Math.random() - 0.5) * 1.6,
            vy: -3.2 - Math.random() * 0.8,
            size: isBossGem ? 13 : 9,
            exp: gemExp,
            kind: isBossGem ? 'boss' : 'normal',
            lifeMs: 9000,
            sparklePhase: Math.random() * Math.PI * 2
        });
    }

    updateExpGems() {
        if (!this.expGems || this.expGems.length === 0 || !this.player) return;

        const playerCenterX = this.player.x + this.player.width * 0.5;
        const playerCenterY = this.player.y + this.player.height * 0.5;
        const pickupRadius = 26;
        const magnetRadius = 120;
        const groundLimit = this.groundY - 14;

        this.expGems = this.expGems.filter((gem) => {
            gem.lifeMs -= this.deltaTime * 1000;
            if (gem.lifeMs <= 0) return false;

            const dx = playerCenterX - gem.x;
            const dy = playerCenterY - gem.y;
            const distance = Math.hypot(dx, dy) || 1;

            if (distance < magnetRadius) {
                const pull = 0.42 + (magnetRadius - distance) * 0.006;
                gem.vx += (dx / distance) * pull;
                gem.vy += (dy / distance) * pull;
            }

            gem.vx *= 0.92;
            gem.vy += 0.34;
            gem.x += gem.vx;
            gem.y += gem.vy;
            gem.sparklePhase += this.deltaTime * 8.2;

            if (gem.y > groundLimit) {
                gem.y = groundLimit;
                gem.vy *= -0.2;
                gem.vx *= 0.82;
                if (Math.abs(gem.vy) < 0.25) gem.vy = 0;
            }

            const pickupDx = playerCenterX - gem.x;
            const pickupDy = playerCenterY - gem.y;
            const pickupDistance = Math.hypot(pickupDx, pickupDy);
            if (pickupDistance < pickupRadius) {
                const leveled = this.player.addExp(gem.exp) || 0;
                if (leveled > 0) this.queueLevelUpChoices(leveled);
                audio.playMoney();
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
        const choices = [
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
        return choices.filter((choice) => choice.level < choice.maxLevel);
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
                input.isAction('JUMP') ||
                input.isAction('ATTACK') ||
                input.isAction('SUB_WEAPON') ||
                input.touchJustPressed;
            this.levelUpAlpha = 0; // フェードイン開始
            this.levelUpTransitionDir = 1;
            audio.playLevelUp();
        }
    }

    applyLevelUpChoice(choiceId) {
        if (!this.player || !choiceId) return;
        const upgraded = this.player.applyProgressionChoice(choiceId);
        if (!upgraded) return;
        this.pendingLevelUpChoices = Math.max(0, this.pendingLevelUpChoices - 1);
        // this.levelUpChoiceIndex = 0; // フェードアウト完了まで位置を維持
        this.levelUpInputLockMs = 220;
        this.levelUpConfirmCooldownMs = 220;
        this.levelUpRequireRelease = true;
        audio.playPowerUp();
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

        if (input.isActionJustPressed('LEFT')) {
            this.levelUpChoiceIndex = (this.levelUpChoiceIndex - 1 + choices.length) % choices.length;
            audio.playSelect();
        }
        if (input.isActionJustPressed('RIGHT')) {
            this.levelUpChoiceIndex = (this.levelUpChoiceIndex + 1) % choices.length;
            audio.playSelect();
        }

        const confirmHeld = input.isAction('JUMP') || input.isAction('ATTACK') || input.isAction('SUB_WEAPON');
        if (this.levelUpRequireRelease) {
            if (!confirmHeld && !input.touchJustPressed) {
                this.levelUpRequireRelease = false;
            }
            return;
        }
        const canConfirm = this.levelUpInputLockMs <= 0 && this.levelUpConfirmCooldownMs <= 0;
        if (!canConfirm) return;

        if (input.touchJustPressed) {
            const touchX = input.lastTouchX;
            const cardWidth = 300;
            const gap = 36;
            const totalWidth = choices.length * cardWidth + (choices.length - 1) * gap;
            const startX = CANVAS_WIDTH / 2 - totalWidth / 2;
            const cardY = CANVAS_HEIGHT / 2 - 120;
            for (let index = 0; index < choices.length; index++) {
                const x = startX + index * (cardWidth + gap);
                if (touchX >= x && touchX <= x + cardWidth + 10 && input.lastTouchY >= cardY - 10 && input.lastTouchY <= cardY + 260 + 10) {
                    audio.playLevelUpSelect(); // 決定音
                    this.levelUpChoiceIndex = index;
                    this.applyLevelUpChoice(choices[index].id || choices[index].type);
                    return;
                }
            }
        }

        if (input.isActionJustPressed('JUMP')) {
            if (choices[this.levelUpChoiceIndex]) { this.applyLevelUpChoice(choices[this.levelUpChoiceIndex].id || choices[this.levelUpChoiceIndex].type); }
        }
    }

    updateSpecialCloneAutoCombat(activeEnemies = []) {
        if (!this.player || !this.player.isSpecialCloneCombatActive || !this.player.isSpecialCloneCombatActive()) return;
        if (!this.player.specialCloneAutoAiEnabled) return;
        if (!Array.isArray(activeEnemies) || activeEnemies.length === 0) return;

        const cloneOffsets = this.player.getSpecialCloneOffsets ? this.player.getSpecialCloneOffsets() : [];
        if (!cloneOffsets.length) return;
        const baseDamage = Math.max(10, Math.round(12 + (this.player.attackPower || 0) * 2));
        for (const clone of cloneOffsets) {
            if (!this.player.canCloneAutoStrike || !this.player.canCloneAutoStrike(clone.index)) continue;
            
            // player.js側で管理されている分身の個別座標を使用
            const pos = this.player.specialClonePositions[clone.index];
            if (!pos) continue;
            
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
                
                // AIによる移動があるため、攻撃範囲は少し広めに
                const attackRange = 100; 
                if (distSq > attackRange * attackRange) continue;
                
                if (distSq < bestDistanceSq) {
                    bestDistanceSq = distSq;
                    target = enemy;
                }
            }
            if (!target) continue;
            this.damageEnemy(target, baseDamage, {
                source: 'special_shadow',
                weapon: this.player.currentSubWeapon ? this.player.currentSubWeapon.name : '奥義',
                knockbackX: 6,
                knockbackY: -5
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
        
        // 画面フラッシュ演出（ホワイトアウト）
        this.flashAlpha = 1.0; 
        
        const shards = [];
        // 破片の数を大幅に増量 (30 -> 80)
        for (let i = 0; i < 80; i++) {
            const angle = (Math.PI * 2 * i) / 80 + (Math.random() - 0.5) * 0.4;
            const speed = 3 + Math.random() * 8;
            shards.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.0,
                life: 800 + Math.random() * 800,
                maxLife: 1600,
                size: 3 + Math.random() * 5,
                color: i % 2 === 0 ? '#ffeb3b' : '#ff5722' // 火花のようなグラデーション
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
                    color: 'rgba(255, 255, 255, 0.8)'
                });
            }, i * 150);
        }

        this.stageBossDefeatEffects.push({
            x: centerX,
            y: centerY,
            timer: 0,
            duration: 2000,
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
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.strokeStyle = `rgba(255, 228, 166, ${0.86 * fade})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, 18 + t * 120, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(255, 160, 102, ${0.62 * fade})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, 10 + t * 74, 0, Math.PI * 2);
            ctx.stroke();

            const flare = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, 120);
            flare.addColorStop(0, `rgba(255, 245, 215, ${0.36 * fade})`);
            flare.addColorStop(0.5, `rgba(255, 188, 120, ${0.18 * fade})`);
            flare.addColorStop(1, 'rgba(255, 120, 80, 0)');
            ctx.fillStyle = flare;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, 120, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            for (const shard of effect.shards) {
                const life = Math.max(0, shard.life / shard.maxLife);
                ctx.save();
                ctx.globalAlpha = life;
                ctx.fillStyle = 'rgba(255, 220, 170, 0.92)';
                ctx.beginPath();
                ctx.arc(shard.x, shard.y, shard.size * (0.6 + life * 0.5), 0, Math.PI * 2);
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
        const feedback = this.resolveHitFeedback(attackData, damage, killed, isCritical);
        
        // ダメージ数値エフェクト
        this.damageNumbers.push({
            x: enemy.x + enemy.width / 2,
            y: enemy.y,
            damage: Math.floor(damage),
            isCritical: isCritical,
            timer: 1000, 
            vx: (Math.random() - 0.5) * 4, // 飛び散り抑制
            vy: -3 - Math.random() * 3,   // 跳ね抑制
            gravity: 0.2                 // 重力軽減
        });

        this.spawnHitEffects(
            enemy.x + enemy.width / 2,
            enemy.y + enemy.height * 0.46,
            feedback
        );
        
        if (killed) {
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
            } else {
                audio.playEnemyDeath();
            }
            
            this.queueHitFeedback(feedback.shake, feedback.hitStopMs);
        } else {
            // 非撃破ヒットにも武器種別に応じた奥義ゲージ蓄積を付与
            const gaugeGain = this.resolveHitGaugeGain(attackData, damage);
            if (gaugeGain > 0) this.player.addSpecialGauge(gaugeGain);
            audio.playDamage();
            this.queueHitFeedback(feedback.shake, feedback.hitStopMs);
        }
    }

    resolveHitFeedback(attackData, damage, killed, isCritical) {
        const source = attackData && attackData.source ? attackData.source : 'main';
        const weapon = attackData && attackData.weapon ? attackData.weapon : null;
        const heavyLaunch = !!(attackData && attackData.isLaunch);
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
        if (source === 'shockwave') {
            gain = 5;
        } else if (source === 'special_shadow') {
            gain = 0;
        } else if (source === 'bomb' || weapon === '火薬玉') {
            gain = 2.2;
        } else if (weapon === '大太刀') {
            gain = 3.0;
        } else if (weapon === '二刀流') {
            gain = 1.9;
        } else if (weapon === '鎖鎌') {
            gain = 2.5;
        } else if (weapon === '大槍') {
            gain = 2.1;
        } else if (source === 'main') {
            gain = 1.4;
        }

        const damageFactor = Math.max(0.65, Math.min(1.45, damage / 24));
        return Math.max(0, Math.round(gain * damageFactor));
    }

    spawnHitEffects(x, y, feedback) {
        const count = Math.max(4, Math.floor(feedback.sparkCount || 8));
        const speed = feedback.sparkSpeed || 3;
        const sparkColor = feedback.sparkColor || '180, 226, 255';
        const ringColor = feedback.ringColor || '116, 196, 255';
        const ringBaseRadius = feedback.ringBaseRadius || 14;

        this.hitEffects.push({
            kind: 'ring',
            x,
            y,
            vx: 0,
            vy: 0,
            life: 180,
            maxLife: 180,
            radius: ringBaseRadius,
            color: ringColor
        });

        for (let index = 0; index < count; index++) {
            const angle = (index / count) * Math.PI * 2 + Math.random() * 0.35;
            const burst = speed * (0.55 + Math.random() * 0.75);
            this.hitEffects.push({
                kind: 'spark',
                x,
                y,
                vx: Math.cos(angle) * burst,
                vy: Math.sin(angle) * burst - 1.1,
                life: 170 + Math.random() * 80,
                maxLife: 170 + Math.random() * 80,
                size: 8 + Math.random() * 8,
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
                effect.vy = effect.vy * 0.94 + 0.22;
                effect.x += effect.vx;
                effect.y += effect.vy;
            } else if (effect.kind === 'ring') {
                effect.radius += 0.85;
            }
            this.hitEffects[writeIndex++] = effect;
        }
        this.hitEffects.length = writeIndex;
    }

    renderHitEffects(ctx) {
        if (!this.hitEffects || this.hitEffects.length === 0) return;
        for (const effect of this.hitEffects) {
            const lifeRatio = Math.max(0, Math.min(1, effect.life / effect.maxLife));
            if (effect.kind === 'spark') {
                const length = (effect.size || 10) * (0.55 + lifeRatio * 0.8);
                const angle = Math.atan2(effect.vy || 0, effect.vx || 1);
                const endX = effect.x + Math.cos(angle) * length;
                const endY = effect.y + Math.sin(angle) * length;
                ctx.save();
                ctx.strokeStyle = `rgba(${effect.color}, ${0.18 + lifeRatio * 0.74})`;
                ctx.lineWidth = 1.4 + lifeRatio * 1.6;
                ctx.lineCap = 'round';
                ctx.shadowColor = `rgba(${effect.color}, ${0.6 * lifeRatio})`;
                ctx.shadowBlur = 10 * lifeRatio;
                ctx.beginPath();
                ctx.moveTo(effect.x, effect.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                ctx.restore();
            } else {
                ctx.save();
                ctx.strokeStyle = `rgba(${effect.color}, ${0.15 + lifeRatio * 0.42})`;
                ctx.lineWidth = 2.2 + lifeRatio * 2.4;
                ctx.shadowColor = `rgba(${effect.color}, ${0.48 * lifeRatio})`;
                ctx.shadowBlur = 12 * lifeRatio;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }
    }
    
    updateDamageNumbers() {
        this.damageNumbers = this.damageNumbers.filter(dn => {
            dn.y += dn.vy;
            dn.timer -= this.deltaTime * 1000;
            return dn.timer > 0;
        });
    }
    
    onStageClear() {
        // クリア時は奥義状態を解除（分身を残さない）
        if (this.player && typeof this.player.clearSpecialState === 'function') {
            this.player.clearSpecialState(true);
        }
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

        // セーブ（最終ステージクリア時は無効なステージ番号を保存しない）
        if (isFinalStage) {
            saveManager.deleteSave();
        } else {
            saveManager.save(this.player, this.currentStageNumber + 1, this.unlockedWeapons);
        }
        
        this.state = isFinalStage ? GAME_STATE.GAME_CLEAR : GAME_STATE.STAGE_CLEAR;
        this.stageClearPhase = 0; // 演出フェーズから開始
        this.stageClearMenuIndex = 0;
        this.stageClearWeaponIndex = Math.max(
            0,
            this.player.subWeapons.findIndex((weapon) => weapon === this.player.currentSubWeapon)
        );
        if (isFinalStage) {
            this.gameClearTimer = 0;
            this.endingTimer = 0;
        } else {
            // ここでオーディオを切り替えない（ボスBGM継続のため）
        }
        audio.playLevelUp();
    }
    
    updatePaused() {
        // ポーズ中でも武器切替は許可
        if (this.player && input.isActionJustPressed('SWITCH_WEAPON')) {
            this.player.switchSubWeapon();
        }

        if (input.isActionJustPressed('PAUSE')) {
            this.state = GAME_STATE.PLAYING;
            audio.resumeBgm();
        }
    }

    updateDefeat() {
        // Red Fade & Timer Logic
        if (this.playerDefeatTimer > 0) {
            this.playerDefeatTimer -= this.deltaTime * 1000;
            if (this.playerDefeatTimer <= 0) {
                this.state = GAME_STATE.GAME_OVER;
                this.gameOverWaitTimer = 300; // 400ms -> 300ms
                this.gameOverFadeInTimer = 0;
                this.gameOverFadeDuration = 400; // 600ms -> 400ms に高速化
                audio.playBgm('gameover');
            }
        }

        if (this.player) {
            // 昇天モーション削除：上昇処理をコメントアウト
            // this.player.y -= 5; 
            
            // 鉢巻などの物理シミュレーション用時間更新
            if (typeof this.player.motionTime === 'number') {
                this.player.motionTime += this.deltaTime * 1000;
            }
        }
    }
    
    updateShop() {
        shop.update(this.deltaTime, this.player);
        
        if (!shop.isOpen) {
            if (this.returnToStageClearAfterShop) {
                this.returnToStageClearAfterShop = false;
                this.state = GAME_STATE.STAGE_CLEAR;
                return;
            }
            this.currentStageNumber++;
            if (this.currentStageNumber > STAGES.length) {
                this.state = GAME_STATE.GAME_CLEAR;
            } else {
                this.startStage();
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
        
        // SPACEキーまたは画面タップでタイトルへ戻る
        if (input.isActionJustPressed('JUMP') || input.touchJustPressed) {
            this.gameOverWaitTimer = undefined; // リセット
            this.state = GAME_STATE.TITLE;
            audio.playBgm('title', 0);
        }
    }
    
    updateStageClear() {
        // ステージ遷移演出中はそちらを更新
        if (this.stageTransitionPhase > 0) {
            this.updateStageTransition();
            return;
        }

        // 演出フェーズ (Phase 0)
        if (this.stageClearPhase === 0) {
            if (input.isActionJustPressed('JUMP') || input.touchJustPressed) {
                // 決定音
                audio.playLevelUpSelect();
                
                this.stageClearPhase = 1; // ステータス画面へ
                audio.playBgm('shop'); // ここでBGMをショップ（または落ち着いたもの）に切り替え
                audio.playSelect();
                input.consumeAction('JUMP');
            }
            return;
        }

        // 詳細ステータス画面フェーズ (Phase 1)
        const menuCount = 3;
        if (input.isActionJustPressed('LEFT')) {
            this.stageClearMenuIndex = (this.stageClearMenuIndex - 1 + menuCount) % menuCount;
            audio.playSelect();
        }
        if (input.isActionJustPressed('RIGHT')) {
            this.stageClearMenuIndex = (this.stageClearMenuIndex + 1) % menuCount;
            audio.playSelect();
        }
        if (this.stageClearMenuIndex === 0) { // UIの並び順: 0=忍具, 1=よろず屋, 2=次へ
            if (input.isActionJustPressed('UP')) this.cycleStageClearWeapon(-1);
            if (input.isActionJustPressed('DOWN')) this.cycleStageClearWeapon(1);
        }
        if (input.isActionJustPressed('JUMP')) {
            this.handleStageClearConfirm();
        }

        if (input.touchJustPressed) {
            const tx = input.lastTouchX;
            const ty = input.lastTouchY;

            // ui.js の renderStatusScreen と同じレイアウト計算
            const padding = 60;
            const panelX = padding;
            const panelY = padding;
            const panelW = CANVAS_WIDTH - padding * 2;
            const panelH = CANVAS_HEIGHT - padding * 2;
            const menuY = panelY + panelH - 110;
            const menuW = (panelW - 80 - 40) / 3;
            const menuH = 80;

            for (let i = 0; i < menuCount; i++) {
                const x = panelX + 40 + i * (menuW + 20);
                // 判定を少し甘め（上下左右に10px余裕を持たせる）にしてズレ感を解消
                if (tx >= x - 10 && tx <= x + menuW + 10 && ty >= menuY - 10 && ty <= menuY + menuH + 10) {
                    this.stageClearMenuIndex = i;
                    this.handleStageClearConfirm();
                    audio.playSelect();
                    return;
                }
            }
        }
    }

    startStageTransition() {
        this.stageTransitionPhase = 1; // FadeOut
        this.stageTransitionTimer = 0.8; // フェードアウト時間(秒)
        audio.fadeOutBgm(0.8); // 0.8秒かけてBGMフェードアウト
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
                this.startStage(); // ステージ開始（ここでBGM再生 & シーン遷移）
            }
        }
    }

    handleStageClearConfirm() {
        // UIの並び順: 0=忍具(Weapon), 1=よろず屋(Shop), 2=次へ(Next)
        if (this.stageClearMenuIndex === 2) {
            // 次の階層へ
            this.applyStageDefaultWeaponChoice();
            this.currentStageNumber++;
            if (this.currentStageNumber > STAGES.length) {
                this.state = GAME_STATE.GAME_CLEAR;
            } else {
                this.startStageTransition();
            }
        } else if (this.stageClearMenuIndex === 0) {
            // 忍具切り替え（決定ボタンでも切り替えできるようにする場合）
            this.cycleStageClearWeapon(1);
        } else if (this.stageClearMenuIndex === 1) {
            // よろず屋
            shop.open();
            this.returnToStageClearAfterShop = true;
            this.state = GAME_STATE.SHOP;
            audio.playBgm('shop');
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
        const selected = this.player.subWeapons[this.stageClearWeaponIndex];
        if (!selected) return;
        const nextStage = this.currentStageNumber + 1;
        this.player.stageEquip = this.player.stageEquip || {};
        this.player.stageEquip[nextStage] = selected.name;
    }

    updateGameClear() {
        this.gameClearTimer += this.deltaTime * 1000;

        // クリア演出後、入力でのみエンディングへ遷移
        const canSkip = this.gameClearTimer > 700;
        const wantsProceed = canSkip && (input.isActionJustPressed('JUMP') || input.touchJustPressed);
        if (wantsProceed) {
            this.state = GAME_STATE.ENDING;
            this.endingTimer = 0;
            audio.playBgm('ending');
        }
    }

    updateEnding() {
        this.endingTimer += this.deltaTime * 1000;

        const canSkip = this.endingTimer > 900;
        const wantsReturn = canSkip && (input.isActionJustPressed('JUMP') || input.touchJustPressed);
        if (wantsReturn) {
            saveManager.deleteSave();
            this.state = GAME_STATE.TITLE;
            this.titleMenuIndex = 0;
            audio.playBgm('title');
        }
    }

    
    render() {
        // 画面クリア
        this.ctx.fillStyle = '#0f0f23';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // 画面揺れ適用
        this.ctx.save();
        if (this.shakeIntensity > 0) {
            const shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
            const shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
            this.ctx.translate(shakeX, shakeY);
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
                this.renderPlaying();
                renderPauseScreen(this.ctx);
                break;

            case GAME_STATE.DEFEAT:
            case GAME_STATE.GAME_OVER:
                {
                    const defeatDuration = this.playerDefeatDuration; // ウェイトをなくすため全体の尺を使用
                    const isGameOver = (this.state === GAME_STATE.GAME_OVER);
                    let progress = 0;
                    if (!isGameOver) {
                        progress = Math.max(0, Math.min(1.0, 1.0 - (this.playerDefeatTimer / defeatDuration)));
                    } else {
                        if (this.gameOverFadeInTimer === undefined) this.gameOverFadeInTimer = 0;
                        this.gameOverFadeInTimer += this.deltaTime * 1000;
                        progress = 1.0 + Math.min(1.0, this.gameOverFadeInTimer / 800);
                    }
                    this.renderPlaying(0.0, true);
                    
                    const playerX = this.player ? this.player.x + this.player.width / 2 : CANVAS_WIDTH / 2;
                    const playerY = this.player ? this.player.y + this.player.height / 2 : CANVAS_HEIGHT / 2;
                    
                    if (this.state === GAME_STATE.DEFEAT) {
                        // 上から下へ「血がつたう」ような垂直グラデーション
                        // イージングを劇的にスムーズに（Math.pow 3.0 で出だしを極限まで遅く）
                        const easedProgress = Math.pow(progress, 3.0);
                        const fillHeight = easedProgress * CANVAS_HEIGHT * 2.5; 
                        const grad = this.ctx.createLinearGradient(0, 0, 0, fillHeight);
                        
                        // アルファ値の立ち上がりをさらに抑制（Math.pow 2.0）
                        const alpha = Math.pow(progress, 2.0) * 0.95;
                        grad.addColorStop(0, `rgba(140, 0, 0, ${alpha})`);
                        grad.addColorStop(0.5, `rgba(100, 0, 0, ${alpha * 0.4})`);
                        grad.addColorStop(1, 'rgba(60, 0, 0, 0)');
                        
                        this.ctx.fillStyle = grad;
                        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                        
                        // 画面全体が染まる補強をさらに後半（0.75以降）に限定し、二次曲線で繋ぐ
                        if (progress > 0.75) {
                            const overlayAlpha = Math.pow((progress - 0.75) / 0.25, 2) * 0.6;
                            this.ctx.fillStyle = `rgba(60, 0, 0, ${overlayAlpha})`;
                            this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                        }
                    } else if (this.state === GAME_STATE.GAME_OVER) {
                        // DEFEAT の最終状態(赤) -> 黒(GAME_OVER)へ色を変化させる
                        const fadeProgress = Math.min(1, this.gameOverFadeInTimer / Math.max(1, this.gameOverFadeDuration));
                        
                        // 赤(DEFEAT末期) -> 黒(GAME_OVER)へ色を変化させる
                        // a は 0.85 程度で維持して背景を透過しすぎないようにする
                        const r = Math.floor(100 * (1 - fadeProgress) + 10 * fadeProgress);
                        const gCol = Math.floor(0 * (1 - fadeProgress) + 0 * fadeProgress);
                        const bCol = Math.floor(0 * (1 - fadeProgress) + 0 * fadeProgress);
                        const a = 0.85;
                        
                        this.ctx.fillStyle = `rgba(${r}, ${gCol}, ${bCol}, ${a})`;
                        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                        
                        // ビネット効果（端をより暗く）を徐々に強める
                        const vignette = this.ctx.createRadialGradient(
                            CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 0,
                            CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH * 0.8
                        );
                        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
                        vignette.addColorStop(1, `rgba(0, 0, 0, ${0.4 + fadeProgress * 0.4})`);
                        this.ctx.fillStyle = vignette;
                        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                    }
                    if (isGameOver) {
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
                this.renderPlaying();
                shop.render(this.ctx, this.player);
                break;

            case GAME_STATE.STAGE_CLEAR:
                this.renderPlaying();
                if (this.stageClearPhase === 0) {
                    renderStageClearAnnouncement(this.ctx, this.currentStageNumber, this.clearedWeapon, this.stage);
                } else {
                    renderStatusScreen(this.ctx, this.currentStageNumber, this.player, this.clearedWeapon, {
                        menuIndex: this.stageClearMenuIndex,
                        selectedWeaponName: this.player?.currentSubWeapon?.name || '未装備'
                    });
                }
                // 明示的なフェードアウト描画（STAGE_CLEAR状態のままフェードする場合）
                if (this.stageTransitionPhase === 1) {
                   this.ctx.save();
                   const alpha = Math.min(1.0, 1.0 - (this.stageTransitionTimer / 0.8));
                   this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
                   this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                   this.ctx.restore();
                } else if (this.stageTransitionPhase === 2) {
                   this.ctx.save();
                   this.ctx.fillStyle = '#000000';
                   this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                   this.ctx.restore();
                }
                break;

            case GAME_STATE.GAME_CLEAR:
                renderGameClearScreen(this.ctx, this.player);
                break;

            case GAME_STATE.ENDING:
                renderEnding(this.ctx, this.endingTimer);
                break;

            case GAME_STATE.INTRO:
                renderIntro(this.ctx, this.introTimer);
                break;
        }
        
        this.ctx.restore();

        // タッチ向けBGMトグルは全画面共通で表示
        this.ui.renderGlobalTouchButtons(this.ctx);
        
        // 画面遷移フェード（簡易実装）
        if (this.transitionTimer > 0) {
            this.ctx.save();
            const alpha = Math.min(1.0, this.transitionTimer);
            this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
            
            this.transitionTimer -= this.deltaTime * 2; // フェードアウト速度
        }

        // ボス撃破ホワイトフラッシュ
        if (this.flashAlpha > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = Math.min(1.0, this.flashAlpha);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.ctx.restore();
            this.flashAlpha -= this.deltaTime * 3.0; // フェードアウト速度
        }
    }
    
    // シーン遷移開始（フェードイン用）
    startTransition() {
        this.transitionTimer = 1.0;
    }

    queueHitFeedback(shake = 0, hitStopMs = 0) {
        this.shakeIntensity = Math.max(this.shakeIntensity, shake);
        this.hitStopTimer = Math.max(this.hitStopTimer, hitStopMs);
    }

    handlePlayerDamage(amount, sourceX = null, options = {}) {
        const died = this.player.takeDamage(amount, { sourceX, ...options });
        if (died) {
            this.beginPlayerDefeat();
            return true;
        }
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

    beginPlayerDefeat(sourceX = null) {
        if (!this.player || this.state === GAME_STATE.DEFEAT || this.state === GAME_STATE.GAME_OVER) return;
        
        // 死亡専用SEの再生
        audio.playPlayerDeath();
        
        // やられ演出で止まっている時間を大幅に短縮 (750ms -> 500ms)
        this.playerDefeatTimer = 500;
        this.state = GAME_STATE.DEFEAT;
        
        // 強めの画面振動とヒットストップ
        this.queueHitFeedback(14, 220);

        if (this.player) {
            const playerCenterX = this.player.x + this.player.width / 2;
            this.player.isAttacking = false;
            this.player.currentAttack = null;
            this.player.subWeaponTimer = 0;
            this.player.subWeaponAction = null;
            this.player.vx = (sourceX !== null && sourceX < playerCenterX) ? 8 : -8; // ダメージ元から遠ざかる
            this.player.vy = -12; // 高く吹き飛ぶ
            this.player.isGrounded = false;

            // 血飛沫エフェクト (赤黒いパーティクル)
            const px = this.player.x + this.player.width / 2;
            const py = this.player.y + this.player.height / 2;
            for (let i = 0; i < 24; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1.5 + Math.random() * 4.5;
                this.hitEffects.push({
                    kind: 'spark',
                    x: px,
                    y: py,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1.5,
                    life: 600 + Math.random() * 600,
                    size: 2.5 + Math.random() * 3.5,
                    color: '160, 0, 0' // 赤黒い
                });
            }
        }
    }

    renderDefeatOverlay(ctx) {
        const ratio = Math.max(0, Math.min(1, this.playerDefeatTimer / this.playerDefeatDuration));
        const progress = 1 - ratio; // 0 -> 1

        ctx.save();
        
        // 1. 赤いフィルター（血の海・やられ演出）
        ctx.fillStyle = `rgba(200, 0, 0, ${progress * 0.45})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 2. 周辺減光（ヴィネット）：意識が狭まる演出
        const grad = ctx.createRadialGradient(
            CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 100,
            CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.8
        );
        grad.addColorStop(0, `rgba(0, 0, 0, 0)`);
        grad.addColorStop(1, `rgba(0, 0, 0, ${Math.min(0.9, progress * 1.5)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 3. 画面全体の暗転 (後半)
        if (progress > 0.7) {
            const fadeStart = (progress - 0.7) * (1 / 0.3);
            ctx.fillStyle = `rgba(0, 0, 0, ${fadeStart})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        
        ctx.restore();
    }
    
    renderPlaying(playerAlpha = 1.0, forceStanding = false) {
        const ctx = this.ctx;
        
        // 1. 背景と地面（カメラ固定・パララックスは内部で処理）
        this.stage.renderBackground(ctx);
        this.stage.renderGround(ctx);
        
        // 2. ワールドオブジェクト（スクロール適用）
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
        
        // 爆弾
        for (const bomb of this.bombs) {
            bomb.render(ctx);
        }
        
        // 衝撃波
        if (this.shockwaves) {
            for (const sw of this.shockwaves) {
                sw.render(ctx);
            }
        }
        
        // プレイヤー (昇天・透明化対応)
        // playerAlphaが0の場合は描画自体をスキップして「即時消去」を実現
        if (playerAlpha > 0) {
            ctx.save();
            if (playerAlpha < 1.0) ctx.globalAlpha *= playerAlpha;
            this.player.render(ctx, { forceStanding: forceStanding });
            
            // サブ武器エフェクト（プレイヤー消失に同期）
            if (
                this.player.currentSubWeapon &&
                !this.player.subWeaponRenderedInModel &&
                typeof this.player.currentSubWeapon.render === 'function'
            ) {
                this.player.currentSubWeapon.render(ctx, this.player);
            }
            ctx.restore();
        } else {
            // プレイヤーを描画しない場合でも、必要な更新があればここで行う（現在はなし）
        }

        // ヒット演出（世界座標）
        this.renderHitEffects(ctx);
        
        // ダメージ数値
        for (const dn of this.damageNumbers) {
            ctx.textAlign = 'center';
            
            // 物理更新（簡易的にここで）
            dn.x += dn.vx;
            dn.y += dn.vy;
            dn.vy += dn.gravity || 0;
            dn.timer -= this.deltaTime * 1000;

            // UIクラスを使って描画
            this.ui.renderDamageNumber(ctx, dn.x, dn.y, dn.damage, dn.isCritical);
        }
        this.damageNumbers = this.damageNumbers.filter(dn => dn.timer > 0);
        
        ctx.restore();
        
        // 3. HUD（カメラ固定）
        
        // ボスUI（HPバーなど）
        if (this.stage.boss) {
            this.stage.renderBossUI(ctx);
        }
        
        // メインHUD
        this.ui.renderHUD(ctx, this.player, this.stage);
        
        // 操作説明
        this.ui.renderControls(ctx);
    }
}

// シングルトンとしてエクスポート
export const game = new Game();
