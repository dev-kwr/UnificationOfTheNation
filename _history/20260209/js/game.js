// ============================================
// Unification of the Nation - ゲームコア
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, GAME_STATE, STAGES, DIFFICULTY, OBSTACLE_TYPES, PLAYER, STAGE_DEFAULT_WEAPON } from './constants.js';
import { input } from './input.js';
import { Player } from './player.js';
import { Bomb, createSubWeapon } from './weapon.js';
import { Stage } from './stage.js';
import { UI, renderTitleScreen, renderGameOverScreen, renderStageClearScreen, renderPauseScreen, renderGameClearScreen, renderIntro } from './ui.js';
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
        this.groundY = CANVAS_HEIGHT - 100;
        
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
    }
    
    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // --- Retina / 高解像度対応 ---
        const dpr = window.devicePixelRatio || 1;
        
        // レスポンシブ対応 (CSSでサイズ制御)
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
        canvas.style.touchAction = 'none';
        
        // 実際の解像度（ピクセル数）は DPR に合わせる
        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = CANVAS_HEIGHT * dpr;
        
        // 描画コンテキストをスケールアップ
        this.ctx.scale(dpr, dpr);
        
        // --------------------------

        // 入力管理にキャンバスを渡す（タッチ座標用）
        import('./input.js').then(({ input }) => {
            input.setCanvas(canvas);
            // 初期スケール設定
            this.updateInputScale();
        });
        
        // リサイズイベント
        window.addEventListener('resize', () => this.updateInputScale());
        
        // 敵AIなどがスクロール情報を参照できるようにグローバルに公開
        window.game = this;
        
        console.log('Game initialized (DPR: ' + dpr + ')');
        
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
    
    updateInputScale() {
        if (!this.canvas) return;
        import('./input.js').then(({ input }) => {
            const rect = this.canvas.getBoundingClientRect();
            // input.js の getTouchAction は 1280x720 の内部座標を期待しているため、
            // クライアント矩形の幅に対する内部座標の比率を渡す。
            const scaleX = CANVAS_WIDTH / rect.width;
            const scaleY = CANVAS_HEIGHT / rect.height;
            input.setScale(scaleX, scaleY);
        });
    }
    
    startNewGame() {
        this.currentStageNumber = 1;
        this.unlockedWeapons = [];
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
                this.player.currentSubWeapon = module.createSubWeapon(subWeaponId);
                // インデックスの同期
                this.player.subWeaponIndex = this.player.subWeapons.findIndex(w => w.name === subWeaponId);
                if (this.player.subWeaponIndex === -1) this.player.subWeaponIndex = 0;
            }
            
            this.initStage(this.currentStageNumber);
            this.scrollX = 0; // スクロール位置リセット
            
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
        }
        
        // ステージ初期化
        this.stage = new Stage(this.currentStageNumber);
        
        this.bombs = [];
        this.shockwaves = []; // 必殺衝撃波
        this.effects = [];
        this.damageNumbers = [];
        this.collisionManager.reset();
        
        // スクロール位置初期化
        this.scrollX = 0;
        
        this.state = GAME_STATE.PLAYING;
        audio.playBgm(this.stage.boss ? 'boss' : 'stage', this.currentStageNumber);
        console.log(`Stage ${this.currentStageNumber} started`);
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
        this.currentStageNumber = 1;
        this.player = new Player(100, this.groundY - PLAYER.HEIGHT, this.groundY);
        this.player.unlockedWeapons = [];
        this.bombs = [];
        this.shockwaves = [];
        this.scrollX = 0; // スクロール位置リセット
        
        this.initStage(this.currentStageNumber);
        
        this.initStage(this.currentStageNumber);
        
        this.state = GAME_STATE.INTRO; // INTROから開始
        this.introTimer = 0;
        audio.playBgm('title'); // イントロ中もタイトル曲を流す
    }
    
    updateIntro() {
        this.introTimer += this.deltaTime * 1000;
        
        // 10秒経過か、キー入力(SPACE)またはタップでプレイ開始
        if (this.introTimer > 10000 || (this.introTimer > 500 && (input.isActionJustPressed('JUMP') || input.touchJustPressed))) {
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
            
            // 新ステージ開始時のデフォルト装備
            const equipName = STAGE_DEFAULT_WEAPON[stageNum];

            if (equipName) {
                const index = this.player.subWeapons.findIndex(w => w.name === equipName);
                if (index !== -1) {
                    this.player.subWeaponIndex = index;
                    this.player.currentSubWeapon = this.player.subWeapons[index];
                    console.log(`初期装備セット: ${equipName}`);
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
        
        // プレイヤーの移動制限（画面左端から出ない：戻りなしスクロールのため）
        if (this.player.x < this.scrollX) {
            this.player.x = this.scrollX;
        }
        // プレイヤーの移動制限（画面右端から出ない）
        if (this.player.x > this.scrollX + CANVAS_WIDTH) {
            this.player.x = this.scrollX + CANVAS_WIDTH;
        }

        // 爆弾更新
        this.updateBombs();
        
        // 衝撃波更新
        if (this.shockwaves) {
            const enemies = this.stage.getAllEnemies();
            this.shockwaves.forEach(sw => {
                sw.update(this.deltaTime);
                
                // 衝撃波 vs 敵の当たり判定
                const hitbox = sw.getHitbox();
                for (const enemy of enemies) {
                    if (enemy.isAlive && !enemy.isDying && !sw.hitEnemies.has(enemy)) {
                        // オブジェクトのプロパティを直接渡すかrectIntersectsを適切に使う
                        const enemyRect = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
                        if (this.rectIntersects(hitbox, enemyRect)) {
                            this.damageEnemy(enemy, sw.damage);
                            // 必殺技独自の強力なノックバック
                            enemy.vx = sw.dir * 30; // 威力を少し強化
                            enemy.vy = -12;
                            sw.hitEnemies.add(enemy);
                            
                            // ヒットストップ演出
                            this.hitStopTimer = 0.2; 
                        }
                    }
                }
            });
            this.shockwaves = this.shockwaves.filter(sw => !sw.isDestroyed);
        }

        // 当たり判定
        this.checkCollisions();
        
        // ダメージ数値更新
        this.updateDamageNumbers();
        
        // ステージクリアチェック
        if (this.stage.isCleared()) {
            this.onStageClear();
            // ボスドロップ武器を所持品に追加
            const stageInfo = STAGES[this.currentStageNumber - 1];
            if (stageInfo && stageInfo.weapon) {
                if (!this.player.unlockedWeapons.includes(stageInfo.weapon)) {
                    this.player.unlockedWeapons.push(stageInfo.weapon);
                    // 最初に入手した武器なら自動装備
                    if (!this.player.currentSubWeapon) {
                        this.player.currentSubWeapon = stageInfo.weapon;
                    }
                }
            }
        }
        
        // ゲームオーバーチェック
        if (this.player.hp <= 0) {
            this.state = GAME_STATE.GAME_OVER;
            audio.playBgm('gameover');
        }
    }
    
    throwBomb() {
        const direction = this.player.facingRight ? 1 : -1;
        const bomb = new Bomb(
            this.player.x + this.player.width / 2,
            this.player.y + 20,
            direction * 8,
            -10
        );
        this.bombs.push(bomb);
        audio.playDash(); // 投げる音の代用
    }
    
    updateBombs() {
        const enemies = this.stage.getAllEnemies();
        
        this.bombs = this.bombs.filter((bomb, index) => {
            bomb.update(this.deltaTime, this.groundY, enemies);
            
            // 爆発中の敵へのダメージ
            if (bomb.isExploding) {
                for (const enemy of enemies) {
                    if (this.collisionManager.checkAndRegisterBombHit(bomb, enemy, bomb.id)) {
                        this.damageEnemy(enemy, bomb.damage);
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
    
    checkCollisions() {
        const enemies = this.stage.getAllEnemies();
        
        // プレイヤー攻撃 vs 敵
        if (this.player.isAttacking) {
            for (const enemy of enemies) {
                if (enemy.isAlive && this.collisionManager.checkAndRegisterAttackHit(this.player, enemy)) {
                    const damage = 10 + this.player.attackCombo * 2 + (this.player.attackPower || 0) * 3;
                    this.damageEnemy(enemy, damage);
                }
            }
        } else {
            // 攻撃終了時にヒットリストをリセット
            this.collisionManager.resetAttackHits();
        }
        
        // 必殺技 vs 敵 (旧判定) - Shockwave側で処理するようにしたので削除してもよいが互換性のため残す
        // 必殺技 vs 敵 (旧判定) は削除
        // if (this.player.isUsingSpecial) ... は Shockwave クラス側で処理されるため不要
        // 古いロジックが残っていると player.getSpecialHitbox がない場合にエラーになる可能性があるため削除
        
        // 必殺技発動中の無敵処理などは player.update 内で行われるため、ここでの処理は不要


        // 障害物 (罠) vs プレイヤー
        for (const obs of this.stage.obstacles) {
            if (!obs.isDestroyed && this.rectIntersects(this.player, obs)) {
                if (obs.damage > 0 && this.player.invincibleTimer <= 0) {
                    this.player.takeDamage(obs.damage);
                    // ノックバック演出: 上と左右に弾く
                    this.player.vy = -12;
                    this.player.vx = (this.player.x > obs.x + obs.width / 2 ? 1 : -1) * 10;
                    audio.playDamage();
                }
            }
        }
        
        // サブ武器 vs 敵
        if (this.player.currentSubWeapon) {
            let hitboxes = this.player.currentSubWeapon.getHitbox(this.player);
            if (hitboxes) {
                // 単一のオブジェクトなら配列に包む
                if (!Array.isArray(hitboxes)) hitboxes = [hitboxes];
                
                for (const hitbox of hitboxes) {
                    for (const enemy of enemies) {
                        if (enemy.isAlive && !enemy.isDying && this.rectIntersects(hitbox, enemy)) {
                            this.damageEnemy(enemy, this.player.currentSubWeapon.damage);
                            
                            // 飛ぶ斬撃（移動物）の場合は、当たったら消える処理が必要な場合があるが、
                            // 現状の簡易実装では多段ヒットを許容するか、あるいはヒット済みフラグを管理。
                            // ここでは簡易的にダメージのみ。
                        }
                    }
                }
            }
        }
        


        // 敵攻撃 vs プレイヤー
        for (const enemy of enemies) {
            if (enemy.isAlive && !enemy.isDying && checkEnemyAttackHit(enemy, this.player)) {
                if (this.player.takeDamage(enemy.damage)) {
                    // プレイヤー死亡
                    this.state = GAME_STATE.GAME_OVER;
                    audio.playBgm('gameover');
                    return;
                }
            }
        }
        
        // 敵との接触ダメージ
        for (const enemy of enemies) {
            if (enemy.isAlive && !enemy.isDying && checkPlayerEnemyCollision(this.player, enemy)) {
                if (this.player.takeDamage(1)) {
                    this.state = GAME_STATE.GAME_OVER;
                    audio.playBgm('gameover');
                    return;
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
                    if (hitbox && this.rectIntersects(hitbox, obs)) {
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
                    if (this.player.takeDamage(obs.damage)) {
                        this.state = GAME_STATE.GAME_OVER;
                        audio.playBgm('gameover');
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
    
    rectIntersects(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }
    
    damageEnemy(enemy, damage) {
        const killed = enemy.takeDamage(damage);
        const isCritical = damage >= 50; // クリティカル判定閾値
        
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
        
        if (killed) {
            // 報酬
            this.player.addExp(enemy.expReward);
            this.player.addMoney(enemy.moneyReward);
            this.player.addSpecialGauge(enemy.specialGaugeReward);
            audio.playEnemyDeath();
            
            // 演出：強烈な揺れとヒットストップ
            this.shakeIntensity = 8;
            this.hitStopTimer = 0.15; // 0.15秒停止
        } else {
            audio.playDamage();
            // 演出：ヒットの重みに応じて調整
            this.shakeIntensity = isCritical ? 5 : 2;
            this.hitStopTimer = isCritical ? 0.1 : 0.05; 
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
        // ボスの武器を獲得
        const stageInfo = STAGES[this.currentStageNumber - 1];
        if (stageInfo.weapon && !this.unlockedWeapons.includes(stageInfo.weapon)) {
            this.unlockedWeapons.push(stageInfo.weapon);
            this.clearedWeapon = stageInfo.weapon;
            
            // サブ武器をセット（重複チェック）
            const weaponId = stageInfo.weapon;
            const alreadyHas = this.player.subWeapons.some(w => w.id === weaponId);
            
            if (!alreadyHas) {
                const newWeapon = createSubWeapon(weaponId);
                this.player.subWeapons.push(newWeapon);
                // 最初の武器なら装備
                if (!this.player.currentSubWeapon) {
                    this.player.currentSubWeapon = newWeapon;
                    this.player.subWeaponIndex = this.player.subWeapons.length - 1;
                }
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
        // audio.stopBgm(); // ユーザーの要望によりクリア画面まで継続
        audio.playLevelUp(); // クリアジングル的に使う
    }
    
    updatePaused() {
        if (input.isActionJustPressed('PAUSE')) {
            this.state = GAME_STATE.PLAYING;
        }
    }
    
    updateShop() {
        shop.update(this.deltaTime, this.player);
        
        if (!shop.isOpen) {
            // ショップを閉じたら次のステージへ
            this.currentStageNumber++;
            if (this.currentStageNumber > STAGES.length) {
                // ゲームクリア！
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
        // スペースキーまたは画面タップ等で次へ
        if (input.isActionJustPressed('JUMP') || input.touchJustPressed) {
            // ショップへ
            shop.open();
            this.state = GAME_STATE.SHOP;
            audio.playBgm('shop');
        }
    }

    updateGameClear() {
        // スペースキーまたは画面タップでタイトルへ戻る
        if (input.isActionJustPressed('JUMP') || input.touchJustPressed) {
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
                renderStageClearScreen(this.ctx, this.currentStageNumber, this.player, this.clearedWeapon);
                break;
            case GAME_STATE.GAME_CLEAR:
                renderGameClearScreen(this.ctx, this.player);
                break;
            case GAME_STATE.INTRO:
                renderIntro(this.ctx, this.introTimer);
                break;
        }
        
        this.ctx.restore();
        
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
        if (this.player.currentSubWeapon) {
            this.player.currentSubWeapon.render(ctx, this.player);
        }
        
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
        
        // ステージ進捗
        this.stage.renderProgressBar(ctx);
        
        // メインHUD
        this.ui.renderHUD(ctx, this.player, this.stage);
        
        // 操作説明
        this.ui.renderControls(ctx);
    }
}

// シングルトンとしてエクスポート
export const game = new Game();
