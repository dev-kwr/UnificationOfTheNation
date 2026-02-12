// ============================================
// Unification of the Nation - ゲームコア
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, GAME_STATE, STAGES, DIFFICULTY, OBSTACLE_TYPES, PLAYER, STAGE_DEFAULT_WEAPON } from './constants.js';
import { input } from './input.js';
import { Player } from './player.js';
import { createSubWeapon } from './weapon.js';
import { Stage } from './stage.js';
import { UI, renderTitleScreen, renderGameOverScreen, renderStageClearScreen, renderLevelUpChoiceScreen, renderPauseScreen, renderGameClearScreen, renderIntro, renderEnding } from './ui.js';
import { CollisionManager, checkPlayerEnemyCollision, checkEnemyAttackHit, checkPlayerAttackHit, checkSpecialHit, checkExplosionHit } from './collision.js';
import { saveManager } from './save.js';
import { shop } from './shop.js';
import { audio } from './audio.js';

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
        this.levelUpChoiceIndex = 0;
        this.stageClearMenuIndex = 0;
        this.stageClearWeaponIndex = 0;
        this.returnToStageClearAfterShop = false;
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
    
    updateInputScale() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        // input.js の getTouchAction は 1280x720 の内部座標を期待しているため、
        // クライアント矩形の幅に対する内部座標の比率を渡す。
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        input.setScale(scaleX, scaleY);
    }
    
    startNewGame() {
        this.currentStageNumber = this.debugStartStage || 1;
        this.unlockedWeapons = [];
        this.pendingLevelUpChoices = 0;
        this.levelUpChoiceIndex = 0;
        this.stageClearMenuIndex = 0;
        this.stageClearWeaponIndex = 0;
        this.returnToStageClearAfterShop = false;
        this.startStage();
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
            this.player = new Player(100, this.groundY - 60, this.groundY);
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
        this.levelUpChoiceIndex = 0;
        this.returnToStageClearAfterShop = false;
        this.collisionManager.reset();
        
        // スクロール位置初期化
        this.scrollX = 0;
        
        this.state = GAME_STATE.PLAYING;
        audio.playBgm(this.stage.boss ? 'boss' : 'stage', this.currentStageNumber);
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
        } else {
            this.deltaTime = rawDeltaTime;
        }

        // 画面揺れ減衰
        if (this.shakeIntensity > 0) {
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.1) this.shakeIntensity = 0;
        }
        
        // 更新
        this.update();
        
        // 描画
        this.render();
        
        // 入力状態更新（JustPressedリセット）
        input.update();
        
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
        
        // スペースで決定 (Zキーを除外)
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

            const tY = input.lastTouchY;
            const cy = CANVAS_HEIGHT / 2;
            
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

    startNewGame() {
        this.currentStageNumber = this.debugStartStage || 1;
        this.player = new Player(100, this.groundY - PLAYER.HEIGHT, this.groundY);
        this.player.unlockedWeapons = [];
        this.pendingLevelUpChoices = 0;
        this.levelUpChoiceIndex = 0;
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
        
        this.initStage(this.currentStageNumber);

        this.state = GAME_STATE.INTRO; // INTROから開始
        this.introTimer = 0;
        audio.playBgm('title'); // イントロ中もタイトル曲を流す
    }
    
    updateIntro() {
        this.introTimer += this.deltaTime * 1000;
        
        // 操作入力でのみプレイ開始（自動遷移しない）
        if (this.introTimer > 500 && (input.isActionJustPressed('JUMP') || input.touchJustPressed)) {
            this.state = GAME_STATE.PLAYING;
            audio.playBgm('stage', this.currentStageNumber);
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
            this.onStageClear();
        }
        
        // ゲームオーバーチェック
        if (this.player.hp <= 0) {
            this.state = GAME_STATE.GAME_OVER;
            audio.playBgm('gameover');
        }
    }
    
    updateBombs(enemies = []) {
        this.bombs = this.bombs.filter((bomb, index) => {
            bomb.update(this.deltaTime, this.groundY, enemies);
            
            // 爆発中の敵へのダメージ
            if (bomb.isExploding) {
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

            // 分身の通常攻撃判定（本体と同じ武器軌道）
            const attackHitbox = this.player.getAttackHitbox ? this.player.getAttackHitbox() : null;
            if (cloneActive && attackHitbox) {
                const attackHitboxes = Array.isArray(attackHitbox) ? attackHitbox : [attackHitbox];
                for (const clone of cloneOffsets) {
                    const shiftedList = attackHitboxes.map((box) => ({
                        x: box.x + clone.dx,
                        y: box.y + clone.dy,
                        width: box.width,
                        height: box.height
                    }));
                    for (const enemy of activeEnemies) {
                        if (shiftedList.some((shifted) => this.rectIntersects(shifted, enemy))) {
                            const damage = this.buildPlayerAttackDamage();
                            this.damageEnemy(enemy, damage, {
                                ...(this.player.currentAttack || { source: 'main' }),
                                source: 'special_shadow'
                            });
                        }
                    }
                }
            }
        } else {
            // 攻撃終了時にヒットリストをリセット
            this.collisionManager.resetAttackHits();
            this.lastAttackSignature = null;
        }
        
        // 障害物 (罠) vs プレイヤー
        for (const obs of this.stage.obstacles) {
            if (!obs.isDestroyed && this.rectIntersects(this.player, obs)) {
                if (obs.damage > 0 && this.player.invincibleTimer <= 0) {
                    if (this.handlePlayerDamage(obs.damage, obs.x + obs.width / 2, {
                        knockbackX: 10,
                        knockbackY: -12
                    })) {
                        return;
                    }
                }
            }
        }
        
        // サブ武器 vs 敵
        const subWeapon = this.player.currentSubWeapon;
        if (subWeapon && typeof subWeapon.getHitbox === 'function') {
            let hitboxes = subWeapon.getHitbox(this.player);
            if (hitboxes) {
                // 単一のオブジェクトなら配列に包む
                if (!Array.isArray(hitboxes)) hitboxes = [hitboxes];
                const baseSubProfile = this.buildSubWeaponAttackProfile(subWeapon, 'subweapon');
                const cloneSubProfile = this.buildSubWeaponAttackProfile(subWeapon, 'special_shadow');
                
                for (const hitbox of hitboxes) {
                    for (const enemy of activeEnemies) {
                        if (this.rectIntersects(hitbox, enemy)) {
                            this.damageEnemy(
                                enemy,
                                baseSubProfile.damage,
                                { ...baseSubProfile.attackData }
                            );
                            
                            // 飛ぶ斬撃（移動物）の場合は、当たったら消える処理が必要な場合があるが、
                            // 現状の簡易実装では多段ヒットを許容するか、あるいはヒット済みフラグを管理。
                            // ここでは簡易的にダメージのみ。
                        }
                    }

                    // 分身のサブ武器判定（本体と同じ武器）
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
                                    this.damageEnemy(
                                        enemy,
                                        cloneSubProfile.damage,
                                        { ...cloneSubProfile.attackData }
                                    );
                                }
                            }
                        }
                    }
                }

                // サブ武器 vs 岩（武器ごとに少し重みをつける）
                const rockDamage = Math.max(2, Math.floor(subWeapon.damage * 0.35));
                for (const hitbox of hitboxes) {
                    for (const obs of this.stage.obstacles) {
                        if (obs.isDestroyed || obs.type !== OBSTACLE_TYPES.ROCK) continue;
                        if (this.rectIntersects(hitbox, obs)) {
                            obs.takeDamage(rockDamage);
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

        
        // 障害物判定
        for (const obs of this.stage.obstacles) {
            if (obs.isDestroyed) continue;

            // 攻撃ヒット (Rockのみ)
            if (obs.type === OBSTACLE_TYPES.ROCK) {
                if (this.player.isAttacking) {
                    const hitbox = this.player.getAttackHitbox();
                    const hitboxes = Array.isArray(hitbox) ? hitbox : (hitbox ? [hitbox] : []);
                    if (hitboxes.some((hb) => this.rectIntersects(hb, obs))) {
                        obs.takeDamage(2);
                    }
                }
            }

            // 接触判定
            const p = this.player;
            const hitRect = {
                x: p.x + 5,
                y: p.y + 5,
                width: p.width - 10,
                height: p.height - 10
            };
            
            if (this.rectIntersects(hitRect, obs)) {
                if (obs.type === OBSTACLE_TYPES.SPIKE) {
                    // 棘：ダメージを与える
                    if (this.handlePlayerDamage(obs.damage, obs.x + obs.width / 2, {
                        knockbackX: 8,
                        knockbackY: -8
                    })) {
                        return;
                    }
                } else if (obs.type === OBSTACLE_TYPES.ROCK) {
                    // 岩：押し戻す（すり抜け防止）
                    const playerCenter = p.x + p.width / 2;
                    const obsCenter = obs.x + obs.width / 2;
                    
                    if (playerCenter < obsCenter) {
                        // プレイヤーが左から来た場合、左に押し戻す
                        p.x = obs.x - p.width - 1;
                    } else {
                        // プレイヤーが右から来た場合、右に押し戻す
                        p.x = obs.x + obs.width + 1;
                    }
                    p.vx = 0;
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
        const groundLimit = this.groundY - 7;

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
        const choices = [
            {
                id: 'normal_combo',
                title: '通常連撃強化',
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
                title: '奥義分身強化',
                subtitle: `分身数 ${this.player.specialCloneSlots.length} → ${Math.min(8, this.player.specialCloneSlots.length + 2)}`,
                level: progression.specialClone || 0,
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
            audio.playLevelUp();
        }
    }

    applyLevelUpChoice(choiceId) {
        if (!this.player || !choiceId) return;
        const upgraded = this.player.applyProgressionChoice(choiceId);
        if (!upgraded) return;
        this.pendingLevelUpChoices = Math.max(0, this.pendingLevelUpChoices - 1);
        this.levelUpChoiceIndex = 0;
        audio.playPowerUp();
        const nextChoices = this.getAvailableLevelUpChoices();
        if (nextChoices.length === 0 || this.pendingLevelUpChoices <= 0) {
            this.pendingLevelUpChoices = 0;
            this.state = GAME_STATE.PLAYING;
        }
    }

    updateLevelUpChoice() {
        const choices = this.getAvailableLevelUpChoices();
        if (choices.length === 0) {
            this.pendingLevelUpChoices = 0;
            this.state = GAME_STATE.PLAYING;
            return;
        }
        this.levelUpChoiceIndex = Math.max(0, Math.min(choices.length - 1, this.levelUpChoiceIndex));

        if (input.isActionJustPressed('LEFT')) {
            this.levelUpChoiceIndex = (this.levelUpChoiceIndex - 1 + choices.length) % choices.length;
            audio.playSelect();
        }
        if (input.isActionJustPressed('RIGHT')) {
            this.levelUpChoiceIndex = (this.levelUpChoiceIndex + 1) % choices.length;
            audio.playSelect();
        }

        if (input.touchJustPressed) {
            const touchX = input.lastTouchX;
            const cardWidth = 300;
            const gap = 36;
            const totalWidth = choices.length * cardWidth + (choices.length - 1) * gap;
            const startX = CANVAS_WIDTH / 2 - totalWidth / 2;
            const cardY = CANVAS_HEIGHT / 2 - 120;
            for (let index = 0; index < choices.length; index++) {
                const x = startX + index * (cardWidth + gap);
                if (touchX >= x && touchX <= x + cardWidth && input.lastTouchY >= cardY && input.lastTouchY <= cardY + 260) {
                    this.levelUpChoiceIndex = index;
                    this.applyLevelUpChoice(choices[index].id);
                    return;
                }
            }
        }

        if (input.isActionJustPressed('JUMP') || input.isActionJustPressed('ATTACK') || input.isActionJustPressed('SUB_WEAPON')) {
            this.applyLevelUpChoice(choices[this.levelUpChoiceIndex].id);
        }
    }

    spawnStageBossDefeatEffect(enemy) {
        if (!enemy) return;
        const centerX = enemy.x + enemy.width * 0.5;
        const centerY = enemy.y + enemy.height * 0.5;
        const shards = [];
        for (let i = 0; i < 30; i++) {
            const angle = (Math.PI * 2 * i) / 30 + (Math.random() - 0.5) * 0.3;
            const speed = 2 + Math.random() * 5;
            shards.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.2,
                life: 600 + Math.random() * 500,
                maxLife: 1100,
                size: 2 + Math.random() * 3
            });
        }
        this.stageBossDefeatEffects.push({
            x: centerX,
            y: centerY,
            timer: 0,
            duration: 1400,
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
            let alpha = 1;
            if (gem.lifeMs <= blinkStartMs) {
                alpha = Math.sin(gem.lifeMs * 0.035) > 0 ? 1 : 0.22;
            }
            const half = gem.size;
            const outer = half;
            const inner = half * 0.53;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(gem.x, gem.y);
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

            const pulse = 0.72 + 0.28 * Math.sin(gem.sparklePhase * 1.6);
            ctx.shadowColor = `rgba(${glowColor}, ${0.5 + pulse * 0.32})`;
            ctx.shadowBlur = (isBossGem ? 17 : 14) + pulse * 6;
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

            ctx.strokeStyle = 'rgba(255,255,255,0.33)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-inner * 0.8, -inner * 0.25);
            ctx.lineTo(inner * 0.7, inner * 0.55);
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
            if (this.isStageBossEnemy(enemy)) {
                this.spawnStageBossDefeatEffect(enemy);
            }
            this.player.addMoney(enemy.moneyReward);
            this.player.addSpecialGauge(enemy.specialGaugeReward);
            audio.playEnemyDeath();
            
            // 演出：攻撃種別に応じた揺れとヒットストップ
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
        this.levelUpChoiceIndex = 0;

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
        this.stageClearMenuIndex = 0;
        this.stageClearWeaponIndex = Math.max(
            0,
            this.player.subWeapons.findIndex((weapon) => weapon === this.player.currentSubWeapon)
        );
        if (isFinalStage) {
            this.gameClearTimer = 0;
            this.endingTimer = 0;
        }
        // audio.stopBgm(); // ユーザーの要望によりクリア画面まで継続
        audio.playLevelUp(); // クリアジングル的に使う
    }
    
    updatePaused() {
        // ポーズ中でも武器切替は許可
        if (this.player && input.isActionJustPressed('SWITCH_WEAPON')) {
            this.player.switchSubWeapon();
        }

        if (input.isActionJustPressed('PAUSE')) {
            this.state = GAME_STATE.PLAYING;
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
        
        // スペースキーまたは画面タップでタイトルへ戻る
        if (input.isActionJustPressed('JUMP') || input.touchJustPressed) {
            this.gameOverWaitTimer = undefined; // リセット
            this.state = GAME_STATE.TITLE;
            audio.playBgm('title', 0);
        }
    }
    
    updateStageClear() {
        const menuCount = 3;
        if (input.isActionJustPressed('LEFT')) {
            this.stageClearMenuIndex = (this.stageClearMenuIndex - 1 + menuCount) % menuCount;
            audio.playSelect();
        }
        if (input.isActionJustPressed('RIGHT')) {
            this.stageClearMenuIndex = (this.stageClearMenuIndex + 1) % menuCount;
            audio.playSelect();
        }
        if (this.stageClearMenuIndex === 1) {
            if (input.isActionJustPressed('UP')) this.cycleStageClearWeapon(-1);
            if (input.isActionJustPressed('DOWN')) this.cycleStageClearWeapon(1);
        }
        if (input.isActionJustPressed('JUMP') || input.isActionJustPressed('ATTACK') || input.touchJustPressed) {
            if (this.stageClearMenuIndex === 0) {
                this.applyStageDefaultWeaponChoice();
                this.currentStageNumber++;
                if (this.currentStageNumber > STAGES.length) {
                    this.state = GAME_STATE.GAME_CLEAR;
                } else {
                    this.startStage();
                }
            } else if (this.stageClearMenuIndex === 1) {
                this.cycleStageClearWeapon(1);
            } else if (this.stageClearMenuIndex === 2) {
                shop.open();
                this.returnToStageClearAfterShop = true;
                this.state = GAME_STATE.SHOP;
                audio.playBgm('shop');
            }
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
                break;
            case GAME_STATE.PLAYING:
                this.renderPlaying();
                break;
            case GAME_STATE.LEVEL_UP:
                this.renderPlaying();
                renderLevelUpChoiceScreen(
                    this.ctx,
                    this.player,
                    this.getAvailableLevelUpChoices(),
                    this.levelUpChoiceIndex,
                    this.pendingLevelUpChoices
                );
                break;
            case GAME_STATE.PAUSED:
                this.renderPlaying();
                renderPauseScreen(this.ctx);
                break;
            case GAME_STATE.SHOP:
                this.renderPlaying();
                shop.render(this.ctx, this.player);
                break;
            case GAME_STATE.GAME_OVER:
                renderGameOverScreen(this.ctx, this.player, this.currentStageNumber);
                break;
            case GAME_STATE.STAGE_CLEAR:
                renderStageClearScreen(this.ctx, this.currentStageNumber, this.player, this.clearedWeapon, {
                    menuIndex: this.stageClearMenuIndex,
                    selectedWeaponName: this.player?.subWeapons?.[this.stageClearWeaponIndex]?.name || '',
                    pendingLevelUpChoices: this.pendingLevelUpChoices
                });
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
            this.state = GAME_STATE.GAME_OVER;
            audio.playBgm('gameover');
            return true;
        }
        return false;
    }
    
    renderPlaying() {
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
        
        // プレイヤー
        this.player.render(ctx);
        
        // サブ武器エフェクト
        if (
            this.player.currentSubWeapon &&
            !this.player.subWeaponRenderedInModel &&
            typeof this.player.currentSubWeapon.render === 'function'
        ) {
            this.player.currentSubWeapon.render(ctx, this.player);
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
        if (this.stage.boss && this.stage.bossSpawned) {
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
