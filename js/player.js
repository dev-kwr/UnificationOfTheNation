// ============================================
// Unification of the Nation - プレイヤークラス
// ============================================

import { PLAYER, GRAVITY, FRICTION, CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { game } from './game.js';

// アニメーション状態
const ANIM_STATE = {
    IDLE: 'idle',
    RUN: 'run',
    JUMP: 'jump',
    FALL: 'fall',
    WALL_SLIDE: 'wall_slide',
    DASH: 'dash',
    ATTACK_SLASH: 'attack_slash',       // 横斬り
    ATTACK_UPPERCUT: 'attack_uppercut', // 斬り上げ
    ATTACK_THRUST: 'attack_thrust',     // 突き
    ATTACK_SPIN: 'attack_spin',         // 回転斬り
    ATTACK_DOWN: 'attack_down',         // 振り下ろし
    SPECIAL: 'special'
};

// 連撃パターン
const COMBO_ATTACKS = [
    { type: ANIM_STATE.ATTACK_SLASH, name: '一ノ太刀・影走り袈裟', damage: 1.02, range: 80, durationMs: 138, cooldownScale: 0.46, chainWindowMs: 84, impulse: 1.08 },
    { type: ANIM_STATE.ATTACK_SLASH, name: '二ノ太刀・閃返し', damage: 1.22, range: 84, durationMs: 154, cooldownScale: 0.5, chainWindowMs: 90, impulse: -0.66 },
    { type: ANIM_STATE.ATTACK_SPIN, name: '三ノ太刀・燕返横薙ぎ', damage: 1.5, range: 96, durationMs: 208, cooldownScale: 0.58, chainWindowMs: 108, impulse: 0.84 },
    { type: ANIM_STATE.ATTACK_UPPERCUT, name: '四ノ太刀・天穿返り', damage: 2.2, range: 96, durationMs: 248, cooldownScale: 0.62, chainWindowMs: 126, impulse: 0.68 },
    { type: ANIM_STATE.ATTACK_DOWN, name: '五ノ太刀・落天水平叩き', damage: 2.52, range: 112, durationMs: 336, cooldownScale: 0.72, chainWindowMs: 136, impulse: 0.2 }
];

export class Player {
    constructor(x, y, groundY) {
        // 位置・サイズ
        this.x = x;
        this.y = y;
        this.width = PLAYER.WIDTH;
        this.height = PLAYER.HEIGHT;
        
        // 速度
        this.vx = 0;
        this.vy = 0;
        this.speed = PLAYER.SPEED;
        
        // 地面の高さ
        this.groundY = groundY;
        
        // 状態
        this.isGrounded = false;
        this.isWallSliding = false;
        this.wallDirection = 0;  // -1: 左壁, 1: 右壁
        this.jumpCount = 0;
        this.maxJumps = 2;  // 二段ジャンプ
        this.facingRight = true;
        
        // ダッシュ
        this.isDashing = false;
        this.dashCooldown = 0;
        this.dashTimer = 0;
        this.dashDuration = 140;
        this.dashSpeedMultiplier = 1.45;
        this.dashDirection = 1;
        
        // しゃがみ
        this.isCrouching = false;
        
        // 攻撃
        this.isAttacking = false;
        this.attackCombo = 0;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.currentAttack = null;  // 現在の攻撃タイプ
        this.attackBuffered = false;
        this.attackBufferTimer = 0;
        this.comboResetTimer = 0;
        this.comboStrictMiss = false;
        this.finisherLandingSeparationTimer = 0;
        this.finisherAirLockTimer = 0;
        this.justLanded = false;
        // 攻撃全体の見た目速度（大きいほどゆっくり）
        this.attackMotionScale = 1.7;
        
        // 必殺技
        this.specialGauge = 0;
        this.maxSpecialGauge = 100;
        this.isUsingSpecial = false;
        this.specialTimer = 0;
        this.specialCastDurationMs = 320;
        this.specialCastTimer = 0;
        this.specialSmoke = [];
        this.specialCloneSlots = [];
        this.specialCloneAlive = [];
        this.specialCloneSpacing = 180;
        this.specialCloneSpawnInvincibleMs = 680;
        this.specialCloneInvincibleTimers = [];
        this.specialCloneAutoAiEnabled = false;
        this.specialCloneAutoStrikeCooldownMs = 280;
        this.specialCloneAutoCooldowns = [];
        this.specialCloneCombatStarted = false;
        this.progression = {
            normalCombo: 0,
            subWeapon: 0,
            specialClone: 0
        };
        
        // ステータス
        this.hp = PLAYER.MAX_HP;
        this.maxHp = PLAYER.MAX_HP;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.money = 0;
        this.maxMoney = PLAYER.MONEY_MAX || 9999;
        this.attackPower = 1;
        this.baseAttackPower = 1;
        this.atkLv = 0;
        
        // 武器
        this.currentSubWeapon = null;
        this.subWeapons = []; // 取得済みのサブ武器インスタンスを格納
        this.subWeaponIndex = 0;
        this.unlockedWeapons = [];
        this.stageEquip = {};
        this.subWeaponCooldown = 0;
        this.subWeaponTimer = 0;
        this.subWeaponAction = null;
        this.subWeaponCrouchLock = false;
        // サブ武器モーション速度（大きいほどゆっくり）
        this.subWeaponMotionScale = 1.35;
        
        // 無敵時間
        this.invincibleTimer = 0;
        this.damageFlashTimer = 0;
        this.trapDamageCooldown = 0;
        
        // アニメーション
        this.animState = ANIM_STATE.IDLE;
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.legAngle = 0;  // 足の角度（走りアニメ用）
        this.legPhase = 0;
        this.armAngle = 0;  // 腕の角度（攻撃用）
        this.motionTime = 0;
        
        // 残像用
        this.afterImages = [];
        this.odachiAfterimageTimer = 0;
        this.subWeaponRenderedInModel = false;
        
        // 奥義分身関連
        this.specialClonePositions = []; // 各分身の現在の世界座標 {x, y, facingRight}
        this.specialCloneTargets = [];   // 各分身の追尾対象（Enemyオブジェクト）
        this.specialCloneReturnToAnchor = []; // 待機位置へ戻るフラグ
        this.specialCloneComboSteps = []; // 分身ごとのコンボ段数
        this.specialCloneAttackTimers = []; // 各分身の攻撃アニメーション用タイマー
        this.specialCloneSubWeaponTimers = []; // 各分身のサブ武器アニメーション用タイマー
        this.specialCloneSubWeaponActions = []; // 各分身のサブ武器アクション内容
        
        this.rebuildSpecialCloneSlots();
    }

    resetVisualTrails() {
        const dir = this.facingRight ? 1 : -1;
        const anchorX = this.x + this.width / 2 + (this.facingRight ? -12 : 12);
        const anchorY = this.y + 13;

        this.scarfNodes = [];
        this.hairNodes = [];
        for (let i = 0; i < 9; i++) {
            this.scarfNodes.push({
                x: anchorX - dir * i * 5,
                y: anchorY + i * 1.2
            });
            if (i < 8) {
                this.hairNodes.push({
                    x: anchorX - dir * i * 3.2,
                    y: anchorY - 8 + i * 0.8
                });
            }
        }
    }

    isOdachiJumpAfterimageActive() {
        const odachi = this.currentSubWeapon;
        if (!odachi || odachi.name !== '大太刀' || !odachi.isAttacking || this.isGrounded) {
            return false;
        }
        if (typeof odachi.getPose === 'function') {
            const pose = odachi.getPose(this);
            return pose.phase === 'rise' || pose.phase === 'stall' || pose.phase === 'flip' || pose.phase === 'plunge';
        }
        return this.subWeaponAction === '大太刀' && this.subWeaponTimer > 0 && !this.isGrounded;
    }
    
    update(deltaTime, walls = []) {
        // 無敵時間更新
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= deltaTime * 1000;
        }
        if (this.trapDamageCooldown > 0) {
            this.trapDamageCooldown -= deltaTime * 1000;
        }
        
        const isDualZAction = !!(
            this.subWeaponAction === '二刀_Z' &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流'
        );
        const subWeaponScale = isDualZAction ? 1 : Math.max(1, this.subWeaponMotionScale || 1);
        const subWeaponDeltaMs = (deltaTime * 1000) / subWeaponScale;
        
        // サブ武器タイマー更新
        if (this.subWeaponTimer > 0) {
            this.subWeaponTimer -= subWeaponDeltaMs;
            if (this.subWeaponTimer <= 0) {
                this.subWeaponTimer = 0;
                this.subWeaponAction = null; // アニメーション終了時にアクションをクリア
                this.subWeaponCrouchLock = false;
            }
        }
        
        // ダメージフラッシュタイマー更新
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= deltaTime * 1000;
        }
        
        // クールダウン更新
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime * 1000;
        }
        if (this.attackBufferTimer > 0) {
            this.attackBufferTimer -= deltaTime * 1000;
            if (this.attackBufferTimer <= 0) {
                this.attackBufferTimer = 0;
                this.attackBuffered = false;
            }
        }
        if (!this.isAttacking && this.comboResetTimer > 0) {
            this.comboResetTimer -= deltaTime * 1000;
            if (this.comboResetTimer <= 0) {
                this.comboResetTimer = 0;
                this.attackCombo = 0;
            }
        }
        if (this.finisherLandingSeparationTimer > 0) {
            this.finisherLandingSeparationTimer = Math.max(0, this.finisherLandingSeparationTimer - deltaTime * 1000);
        }
        if (this.finisherAirLockTimer > 0) {
            this.finisherAirLockTimer = Math.max(0, this.finisherAirLockTimer - deltaTime * 1000);
        }
        if (this.dashCooldown > 0) {
            this.dashCooldown -= deltaTime * 1000;
        }
        if (this.dashTimer > 0) {
            this.dashTimer -= deltaTime * 1000;
            if (this.dashTimer <= 0) {
                this.dashTimer = 0;
                this.isDashing = false;
            }
        }
        
        // 必殺技（分身）更新: 操作はロックせず継続
        this.updateSpecial(deltaTime);
        
        // サブ武器使用中も他の操作を一部制限
        if (this.subWeaponTimer > 200) { // 出始めは移動制限
            this.vx *= 0.5;
        }
        
        // 攻撃中の処理
        if (this.isAttacking) {
            this.updateAttack(deltaTime);
        }

        // サブウェポンの状態更新（アニメーション進行など）
        if (this.currentSubWeapon && this.currentSubWeapon.update) {
            this.currentSubWeapon.update(deltaTime / subWeaponScale);
        }

        // 二刀Z連撃中は入力移動ではなく専用運動で体を運ぶ
        this.updateDualBladeComboMotion(deltaTime);
        
        // 入力処理 (handleInput内でタイマーをセットするように修正が必要)
        this.handleInput();
        
        // 物理演算
        this.applyPhysics(walls);
        
        // アニメーション更新
        this.updateAnimation(deltaTime);
        
        // 残像更新（ダッシュ + 大太刀跳躍）
        const isOdachiJumping = this.isOdachiJumpAfterimageActive();
        if (isOdachiJumping) {
            this.odachiAfterimageTimer -= deltaTime * 1000;
        } else {
            this.odachiAfterimageTimer = 0;
        }

        const shouldEmitDashAfterimage = this.isDashing || Math.abs(this.vx) > PLAYER.SPEED * 1.5;
        const shouldEmitOdachiAfterimage = isOdachiJumping && this.odachiAfterimageTimer <= 0;
        if (shouldEmitDashAfterimage || shouldEmitOdachiAfterimage) {
            this.afterImages.unshift({
                x: this.x,
                y: this.y,
                facingRight: this.facingRight
            });
            if (isOdachiJumping) this.odachiAfterimageTimer = 30;
            const maxTrailCount = 7;
            if (this.afterImages.length > maxTrailCount) this.afterImages.pop();
        } else if (!isOdachiJumping) {
            if (this.afterImages.length > 0) this.afterImages.pop();
        }
    }
    handleInput() {
        // サブ武器切り替え（最優先）
        if (input.isActionJustPressed('SWITCH_WEAPON')) {
            this.switchSubWeapon();
        }

        // しゃがみ（攻撃中もDOWN押下中なら維持）
        const keepCrouchDuringDualSwing = this.subWeaponAction === '二刀_Z' && this.subWeaponCrouchLock;
        const wantsCrouch = this.isGrounded && (input.isAction('DOWN') || keepCrouchDuringDualSwing);
        if (wantsCrouch) {
            if (!this.isCrouching) {
                this.isCrouching = true;
                // 高さが半分になるので、足元を合わせるためにyを下げる
                this.y += PLAYER.HEIGHT / 2;
            }
            // しゃがみ歩きは遅めにする
            this.vx *= 0.8;
        } else if (this.isCrouching) {
            this.isCrouching = false;
            // 高さが戻るので、足元を合わせるためにyを上げる
            this.y -= PLAYER.HEIGHT / 2;
        }
        
        // 忍具（Xキー）
        if (input.isActionJustPressed('SUB_WEAPON')) {
            // クールダウン中は発動不可
            if (this.subWeaponTimer > 0) return;
            if (!this.currentSubWeapon) return;

            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                // 連打防止：既に衝撃波が出ていたら撃てない (一個目が消えるまで)
                // 配列の長さチェックを確実に行う
                if (this.currentSubWeapon.projectiles && this.currentSubWeapon.projectiles.length > 0) return;

                // 二刀の忍具技：両手交差の飛翔斬撃
                this.currentSubWeapon.use(this, 'combined');
                this.subWeaponTimer = 220; // 合体モーションを高速化
                this.subWeaponAction = '二刀_合体';
                this.vx = 0; // 完全に停止
            } else {
                this.useSubWeapon();
                const weaponName = this.currentSubWeapon ? this.currentSubWeapon.name : '';
                this.subWeaponTimer =
                    weaponName === '火薬玉' ? 150 :
                    weaponName === '大槍' ? 250 :
                    (weaponName === '鎖鎌') ? 560 :
                    (weaponName === '大太刀') ? 760 : 300;
                this.subWeaponAction = weaponName === '火薬玉' ? 'throw' : weaponName;
            }
        }

        
        // 必殺技（攻撃中でも可能）
        if (input.isActionJustPressed('SPECIAL')) {
            this.useSpecial();
        }

        if (input.isActionJustPressed('ATTACK')) {
            const lockZDuringSub =
                this.subWeaponTimer > 0 &&
                this.subWeaponAction &&
                this.subWeaponAction !== 'throw' &&
                this.currentSubWeapon &&
                this.currentSubWeapon.name !== '火薬玉' &&
                this.currentSubWeapon.name !== '二刀流';
            if (lockZDuringSub) return;
            if (this.isAttacking) {
                this.bufferNextAttack();
            } else {
                this.attack();
            }
        }
        
        // 攻撃中は移動制限
        if (this.isAttacking) return;
        
        const odachiAttacking = !!(
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '大太刀' &&
            this.currentSubWeapon.isAttacking
        );
        const lockLocomotionByDualZ = !!(
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0 &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流'
        );
        if (odachiAttacking && typeof this.currentSubWeapon.attackDirection === 'number') {
            this.facingRight = this.currentSubWeapon.attackDirection >= 0;
        }

        const moveDir = input.isAction('LEFT') ? -1 : (input.isAction('RIGHT') ? 1 : 0);

        const touchDashHeld = typeof input.isTouchDashActive === 'function' && input.isTouchDashActive();
        const keyboardDashHeld = typeof input.isKeyboardDashHeld === 'function' && input.isKeyboardDashHeld(moveDir);
        const sustainedDashHeld = touchDashHeld || keyboardDashHeld;

        // ダッシュ（タッチ/キーボードの押下継続中は維持）
        if (!lockLocomotionByDualZ && sustainedDashHeld && moveDir !== 0) {
            if (!this.isDashing) {
                this.startDash(moveDir, true);
            } else {
                this.dashDirection = moveDir >= 0 ? 1 : -1;
                this.dashTimer = Math.max(this.dashTimer, this.dashDuration * 0.85);
                this.dashCooldown = 0;
            }
        } else if (!lockLocomotionByDualZ && input.isActionJustPressed('DASH') && this.dashCooldown <= 0) {
            const triggerDir = moveDir !== 0 ? moveDir : (this.facingRight ? 1 : -1);
            this.startDash(triggerDir);
        }

        if (lockLocomotionByDualZ) {
            this.isDashing = false;
            this.dashTimer = 0;
            this.dashCooldown = Math.max(this.dashCooldown, 80);
        } else if (this.isDashing) {
            this.vx = this.dashDirection * (this.speed * this.dashSpeedMultiplier);
            this.facingRight = this.dashDirection > 0;
        } else if (!odachiAttacking && moveDir !== 0) {
            this.vx = moveDir * this.speed;
            this.facingRight = moveDir > 0;
        } else if (odachiAttacking) {
            this.vx *= 0.9;
        }
        
        // ジャンプ
        if (input.isActionJustPressed('JUMP')) {
            this.jump();
        }
        
    }
    
    jump() {
        // 壁蹴り
        if (this.isWallSliding) {
            this.vx = this.wallDirection * PLAYER.SPEED * 1.5;
            this.vy = PLAYER.JUMP_FORCE * 0.8;
            this.isWallSliding = false;
            this.jumpCount = 1;
            audio.playJump();
            return;
        }
        
        // 通常ジャンプ・二段ジャンプ
        if (this.jumpCount < this.maxJumps) {
            if (this.jumpCount === 0) {
                this.vy = PLAYER.JUMP_FORCE;
            } else {
                this.vy = PLAYER.DOUBLE_JUMP_FORCE;
            }
            this.jumpCount++;
            this.isGrounded = false;
            audio.playJump();
        }
    }

    startDash(direction, ignoreCooldown = false) {
        if (!ignoreCooldown && this.dashCooldown > 0) return;
        this.isDashing = true;
        this.dashDirection = direction >= 0 ? 1 : -1;
        this.dashTimer = this.dashDuration;
        this.dashCooldown = ignoreCooldown ? 0 : 280;
        this.vx = this.dashDirection * (this.speed * this.dashSpeedMultiplier);
        this.facingRight = this.dashDirection > 0;
    }

    bufferNextAttack() {
        if (!this.isAttacking || !this.currentAttack) return false;
        if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') return false;
        if (this.currentAttack.comboStep >= this.getNormalComboMax()) return false;
        const duration = this.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN;
        const baseBuffer = this.currentAttack.comboStep === 4
            ? Math.max(420, Math.min(620, duration * 1.25))
            : Math.max(80, Math.min(240, duration * 0.82));
        this.attackBuffered = true;
        this.attackBufferTimer = Math.max(this.attackBufferTimer, baseBuffer);
        return true;
    }

    buildAttackProfile(baseAttack, extra = {}) {
        const source = { ...(baseAttack || {}), ...(extra || {}) };
        const speedScale = this.attackMotionScale || 1;
        const durationBase = Number.isFinite(source.durationMs) ? source.durationMs : PLAYER.ATTACK_COOLDOWN;
        const chainBase = Number.isFinite(source.chainWindowMs) ? source.chainWindowMs : 0;
        const durationMs = Math.max(1, Math.round(durationBase * speedScale));
        const chainWindowMs = Math.max(0, Math.round(chainBase * speedScale * 0.9));
        return {
            ...source,
            durationMs,
            chainWindowMs
        };
    }
    
    attack({ fromBuffer = false } = {}) {
        if (!fromBuffer && this.attackCooldown > 0) return;
        this.attackBuffered = false;
        this.attackBufferTimer = 0;
        this.comboResetTimer = 0;
        this.comboStrictMiss = false;

        // 二刀装備時のZ攻撃は、二本で繋ぐ多方向コンボに置換
        if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
            if (this.subWeaponAction === '二刀_合体') return;
            this.attackCooldown = PLAYER.ATTACK_COOLDOWN * 0.72;
            if (typeof this.currentSubWeapon.mainMotionSpeedScale === 'number') {
                this.currentSubWeapon.mainMotionSpeedScale = this.attackMotionScale || 1;
            }
            this.currentSubWeapon.use(this, 'main');
            this.subWeaponTimer = this.currentSubWeapon.mainDuration || 190;
            this.subWeaponAction = '二刀_Z';
            this.subWeaponCrouchLock = this.isGrounded && (this.isCrouching || input.isAction('DOWN'));
            const step = this.currentSubWeapon.comboIndex || 0;
            const direction = this.facingRight ? 1 : -1;
            const wasGrounded = this.isGrounded;
            if (this.subWeaponCrouchLock) {
                this.vx *= 0.3;
            } else if (step === 1) {
                // 初段: 前へ抜き打ち
                this.vx = direction * this.speed * 1.72;
                if (wasGrounded) {
                    this.vy = -2.4;
                    this.isGrounded = false;
                }
            } else if (step === 2) {
                // 二段: 引き戻しから逆袈裟返し
                this.vx = -direction * this.speed * 1.1;
                if (wasGrounded) {
                    this.vy = -3.4;
                    this.isGrounded = false;
                } else {
                    this.vy = Math.min(this.vy, -2.2);
                }
            } else if (step === 3) {
                // 三段: 低いクロスステップ薙ぎ
                this.vx = direction * this.speed * 0.52;
                if (wasGrounded) this.vy = 0;
            } else if (step === 4) {
                // 四段: 跳躍交叉斬り
                this.vx = direction * this.speed * 0.95;
                if (wasGrounded) {
                    this.vy = -9.4;
                    this.isGrounded = false;
                } else {
                    this.vy = Math.min(this.vy, -7.6);
                }
            } else {
                // 五段: 落下断ち
                this.vx = direction * this.speed * 0.38;
                this.vy = Math.max(this.vy, 7.6);
            }
            return;
        }
        
        this.isAttacking = true;
        
        // コンボ
        const comboMax = this.getNormalComboMax();
        if (this.attackCombo < comboMax) {
            this.attackCombo++;
        } else {
            this.attackCombo = 1;
        }
        
        const comboProfile = COMBO_ATTACKS[this.attackCombo - 1];
        this.currentAttack = this.buildAttackProfile(comboProfile, { comboStep: this.attackCombo, source: 'main' });
        this.attackTimer = this.currentAttack.durationMs;
        this.attackCooldown = Math.max(28, this.currentAttack.durationMs * this.currentAttack.cooldownScale);
        this.comboResetTimer = (this.currentAttack.chainWindowMs || 60) + 190;
        const direction = this.facingRight ? 1 : -1;
        const impulse = (this.currentAttack.impulse || 1) * this.speed;
        const step = this.currentAttack.comboStep;
        if (this.isCrouching) {
            this.vx = direction * impulse * 0.28;
        } else if (step === 1) {
            this.vx = this.vx * 0.08 + direction * impulse;
            this.vy = Math.min(this.vy, -2.4);
            this.isGrounded = false;
        } else if (step === 2) {
            this.vx = this.vx * 0.14 + direction * impulse;
            this.vy = Math.min(this.vy, -4.6);
            this.isGrounded = false;
        } else if (step === 3) {
            this.vx = this.vx * 0.12 + direction * impulse;
            this.vy = Math.min(this.vy, -8.2);
            this.isGrounded = false;
        } else if (step === 4) {
            this.vx = this.vx * 0.24 + direction * impulse * 0.42;
            this.vy = Math.min(this.vy, -14.4);
            this.isGrounded = false;
        } else if (step === 5) {
            // 五段目: 頭上から水平に叩きつける落下技
            this.currentAttack.knockbackX = 16;
            this.currentAttack.knockbackY = -7;
            this.currentAttack.range = Math.max(this.currentAttack.range || 0, 128);
            this.finisherLandingSeparationTimer = Math.max(this.finisherLandingSeparationTimer, 700);
            this.finisherAirLockTimer = Math.max(this.finisherAirLockTimer, 2200);
            this.vx = this.vx * 0.18;
            this.vy = Math.max(this.vy, 3.4);
            this.isGrounded = false;
        }
        this.animState = this.currentAttack.type;
        
        // 効果音再生
        audio.playSlash((this.attackCombo - 1) % 4);
    }
    
    useSubWeapon() {
        if (this.currentSubWeapon) {
            this.currentSubWeapon.use(this);
        }
    }
    
    updateAttack(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const activeAttack = this.currentAttack;

        if (activeAttack && activeAttack.comboStep && this.isGrounded) {
            this.vx *= 0.965;
        }
        if (activeAttack && activeAttack.comboStep === 4 && this.attackTimer > 0) {
            const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
            const direction = this.facingRight ? 1 : -1;

            // 四段目: 真上へ切り上げ → 後方へバク転
            if (progress < 0.42) {
                const t = progress / 0.42;
                this.vx = this.vx * 0.65 + direction * this.speed * (0.26 - t * 0.18);
                this.vy = this.vy * 0.5 + (-15.8 + t * 4.6) * 0.5;
            } else if (progress < 0.9) {
                const t = (progress - 0.42) / 0.48;
                const backSpeed = this.speed * (0.6 + t * 0.9);
                const flipVy = -6.2 + t * 15.4;
                this.vx = this.vx * 0.35 + (-direction * backSpeed) * 0.65;
                this.vy = this.vy * 0.45 + flipVy * 0.55;
            } else {
                this.vx *= 0.78;
            }
            this.isGrounded = false;
        } else if (activeAttack && activeAttack.comboStep === 5 && (this.attackTimer > 0 || !this.isGrounded)) {
            const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
            const direction = this.facingRight ? 1 : -1;
            if (progress < 0.26) {
                this.vx *= 0.82;
                this.vy = Math.min(this.vy, -1.2);
            } else if (progress < 0.76) {
                const fallT = (progress - 0.26) / 0.5;
                this.vx = this.vx * 0.76 + direction * this.speed * 0.05;
                this.vy = this.vy * 0.58 + (6.5 + fallT * 15.5) * 0.42;
            } else {
                this.vx *= 0.64;
            }
        }
        this.attackTimer -= deltaMs;

        if (
            activeAttack &&
            this.attackBuffered &&
            this.attackBufferTimer > 0 &&
            (activeAttack.chainWindowMs || 0) > 0 &&
            (!activeAttack.comboStep || activeAttack.comboStep < this.getNormalComboMax()) &&
            (activeAttack.comboStep !== 4 || (1 - (this.attackTimer / Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN))) >= 0.95) &&
            this.attackTimer <= activeAttack.chainWindowMs
        ) {
            this.isAttacking = false;
            this.currentAttack = null;
            this.attackBuffered = false;
            this.attackBufferTimer = 0;
            this.attack({ fromBuffer: true });
            return;
        }

        if (this.attackTimer <= 0) {
            if (
                activeAttack &&
                activeAttack.comboStep === this.getNormalComboMax() &&
                !this.isGrounded &&
                this.finisherAirLockTimer > 0
            ) {
                // 5段目は着地するまで継続（空中で途切れない）
                this.attackTimer = 1;
                return;
            }
            this.isAttacking = false;
            this.currentAttack = null;
            this.finisherAirLockTimer = 0;
            if (activeAttack && activeAttack.comboStep >= this.getNormalComboMax()) {
                this.attackBuffered = false;
                this.attackBufferTimer = 0;
                this.attackCombo = 0;
                this.comboStrictMiss = false;
                this.comboResetTimer = 0;
                return;
            }
            if (this.attackBuffered && this.attackBufferTimer > 0) {
                this.attackBuffered = false;
                this.attackBufferTimer = 0;
                this.attack({ fromBuffer: true });
                return;
            }
            const lingerMs = activeAttack ? (activeAttack.chainWindowMs || 60) : 60;
            this.comboResetTimer = Math.max(this.comboResetTimer, 210 + lingerMs);
        }
    }

    updateDualBladeComboMotion(deltaTime) {
        if (
            !this.currentSubWeapon ||
            this.currentSubWeapon.name !== '二刀流' ||
            this.subWeaponAction !== '二刀_Z' ||
            this.subWeaponTimer <= 0 ||
            typeof this.currentSubWeapon.getMainSwingPose !== 'function' ||
            this.subWeaponCrouchLock
        ) {
            return;
        }

        const pose = this.currentSubWeapon.getMainSwingPose();
        const step = pose.comboIndex || 0;
        const p = Math.max(0, Math.min(1, pose.progress || 0));
        const direction = this.facingRight ? 1 : -1;
        const lerpRate = Math.max(0.08, Math.min(0.42, deltaTime * 13));
        const blend = (current, target) => current + (target - current) * lerpRate;

        if (step === 1) {
            // 抜き打ちダッシュ
            const targetVx = direction * this.speed * (1.72 - p * 1.02);
            this.vx = blend(this.vx, targetVx);
            if (!this.isGrounded) {
                if (p < 0.24) this.vy = Math.min(this.vy, -2.2 + p * 1.2);
                else this.vy = Math.max(this.vy, 1.2 + (p - 0.24) * 4.2);
            }
        } else if (step === 2) {
            // いったん引いてから逆袈裟返し
            const targetVx = p < 0.32
                ? -direction * this.speed * (1.16 - p * 0.42)
                : (p < 0.78
                    ? direction * this.speed * ((p - 0.32) * 1.74)
                    : direction * this.speed * (0.78 - (p - 0.78) * 1.2));
            this.vx = blend(this.vx, targetVx);
            if (!this.isGrounded) {
                if (p < 0.46) this.vy = Math.min(this.vy, -2.8 + p * 1.4);
                else this.vy = Math.max(this.vy, 2.2 + (p - 0.46) * 6.4);
            }
        } else if (step === 3) {
            // クロスステップで低姿勢の連薙ぎ
            let targetVx;
            if (p < 0.24) {
                targetVx = -direction * this.speed * (0.64 - p * 1.1);
            } else if (p < 0.7) {
                targetVx = direction * this.speed * (0.34 + (p - 0.24) * 1.68);
            } else {
                targetVx = direction * this.speed * (1.1 - (p - 0.7) * 2.2);
            }
            this.vx = blend(this.vx, targetVx);
            if (this.isGrounded) {
                this.vy = 0;
            } else {
                this.vy = Math.max(this.vy, 3.8);
            }
        } else if (step === 4) {
            // 跳躍交叉: 上昇→空中切り→落下移行
            const targetVx = direction * this.speed * (0.9 - p * 0.3);
            this.vx = blend(this.vx, targetVx);
            if (p < 0.52) {
                this.vy = Math.min(this.vy, -10.6 + p * 2.8);
                if (this.isGrounded) this.isGrounded = false;
            } else {
                this.vy = Math.max(this.vy, -1.2 + (p - 0.52) * 13.2);
            }
        } else {
            // 落下断ち: 一瞬ためてから急降下して着地締め
            if (p < 0.24) {
                this.vx = blend(this.vx, direction * this.speed * 0.36);
                this.vy = Math.min(this.vy, -1.8);
            } else if (p < 0.78) {
                const dive = (p - 0.24) / 0.54;
                this.vx = blend(this.vx, direction * this.speed * (0.42 - dive * 0.28));
                this.vy = Math.max(this.vy, 8.8 + dive * 17.8);
            } else {
                this.vx = blend(this.vx, direction * this.speed * 0.06);
                this.vy = Math.max(this.vy, 17.6);
            }
            if (this.isGrounded && p > 0.6) {
                this.vx *= 0.58;
            }
        }

        // 二刀コンボ中に上空へ登り続けないよう上昇量を制限
        this.vy = Math.max(this.vy, -10.8);
        const liftFromGround = this.groundY - (this.y + this.height);
        if (liftFromGround > 122 && this.vy < -0.4) {
            this.vy *= 0.34;
        }
        if (step === 0 && p > 0.88 && !this.isGrounded) {
            this.vy = Math.max(this.vy, 18.8);
        }
    }
    
    useSpecial() {
        if (this.specialGauge < this.maxSpecialGauge) return;
        if (this.isUsingSpecial) {
            this.clearSpecialState(true);
        }
        
        this.resetVisualTrails();
        this.isUsingSpecial = true;
        this.specialCastTimer = this.specialCastDurationMs;
        this.specialCloneCombatStarted = false;
        this.specialCloneAlive = this.specialCloneSlots.map(() => true);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 40);
        this.spawnSpecialSmoke('appear');
        this.specialGauge = 0;
        this.animState = ANIM_STATE.SPECIAL;
        audio.playSpecial();
    }

    clearSpecialState(clearSmoke = true) {
        this.isUsingSpecial = false;
        this.specialCastTimer = 0;
        this.specialCloneCombatStarted = false;
        this.specialCloneAlive = this.specialCloneSlots.map(() => false);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map(() => 0);
        if (clearSmoke) this.specialSmoke = [];
    }
    
    updateSpecial(deltaTime) {
        const deltaMs = deltaTime * 1000;
        if (this.isUsingSpecial) {
            if (this.specialCastTimer > 0) {
                const previousCastTimer = this.specialCastTimer;
                this.specialCastTimer = Math.max(0, this.specialCastTimer - deltaMs);
                this.invincibleTimer = Math.max(this.invincibleTimer, 120);
                if (previousCastTimer > 0 && this.specialCastTimer <= 0 && !this.specialCloneCombatStarted) {
                    this.onSpecialCloneStarted();
                }
            } else {
                if (!this.specialCloneCombatStarted) {
                    this.onSpecialCloneStarted();
                }
                this.invincibleTimer = Math.max(this.invincibleTimer, 60);
            }
            
            // 無敵時間とクールダウンの更新
            for (let index = 0; index < this.specialCloneInvincibleTimers.length; index++) {
                if (this.specialCloneInvincibleTimers[index] > 0) {
                    this.specialCloneInvincibleTimers[index] = Math.max(0, this.specialCloneInvincibleTimers[index] - deltaMs);
                }
            }
            for (let index = 0; index < this.specialCloneAutoCooldowns.length; index++) {
                if (this.specialCloneAutoCooldowns[index] > 0) {
                    this.specialCloneAutoCooldowns[index] = Math.max(0, this.specialCloneAutoCooldowns[index] - deltaMs);
                }
            }

            // 座標更新
            if (this.specialCloneAutoAiEnabled && this.specialCloneCombatStarted) {
                // Lv3: 自律行動AI
                this.updateSpecialCloneAi(deltaTime);
            } else if (this.specialCloneCombatStarted) {
                // Lv1〜2: 本体に追従
                const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.y + this.height * 0.62);
                for (let i = 0; i < this.specialCloneSlots.length; i++) {
                    if (this.specialClonePositions[i]) {
                        this.specialClonePositions[i].x = anchors[i].x;
                        this.specialClonePositions[i].y = anchors[i].y;
                        this.specialClonePositions[i].facingRight = anchors[i].facingRight;
                    }
                }
            }
        }

        for (const puff of this.specialSmoke) {
            puff.life -= deltaMs;
            puff.x += puff.vx;
            puff.y += puff.vy;
            puff.vx *= 0.97;
            puff.vy *= 0.97;
        }
        this.specialSmoke = this.specialSmoke.filter((puff) => puff.life > 0);
    }

    triggerCloneAttack(index) {
        if (this.specialCloneAttackTimers[index] <= 0 && this.specialCloneSubWeaponTimers[index] <= 0) {
            this.specialCloneAttackTimers[index] = 420; // 攻撃モーション時間
            // コンボ段数を進める（見た目用）
            this.specialCloneComboSteps[index] = (this.specialCloneComboSteps[index] + 1) % 5;
        }
    }

    triggerCloneSubWeapon(index) {
        if (!this.currentSubWeapon || this.specialCloneSubWeaponTimers[index] > 0 || this.specialCloneAttackTimers[index] > 0) return;
        
        const weaponName = this.currentSubWeapon.name;
        this.specialCloneSubWeaponTimers[index] = 
            weaponName === '火薬玉' ? 150 :
            weaponName === '大槍' ? 250 :
            weaponName === '鎖鎌' ? 560 :
            weaponName === '大太刀' ? 760 : 300;
        this.specialCloneSubWeaponActions[index] = weaponName === '火薬玉' ? 'throw' : weaponName;
        
        // 分身のサブ武器効果（本体と同じ性能ではないが、攻撃判定を出す必要がある）
        // 簡易的に本体の useSubWeapon を分身の座標で呼ぶか、分身専用の処理を検討
        // ここでは一旦モーション重視で trigger させる
    }

    onSpecialCloneStarted() {
        this.specialCloneCombatStarted = true;
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => this.specialCloneSpawnInvincibleMs);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 30);
        
        // 初期座標の設定（プレイヤー周辺）
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.y + this.height * 0.62);
        this.specialClonePositions = anchors.map(a => ({ x: a.x, y: a.y, facingRight: this.facingRight }));
        this.specialCloneTargets = this.specialCloneSlots.map(() => null);
        this.specialCloneReturnToAnchor = this.specialCloneSlots.map(() => false);
        this.specialCloneComboSteps = this.specialCloneSlots.map(() => 0);
        this.specialCloneAttackTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponActions = this.specialCloneSlots.map(() => null);

        this.spawnSpecialSmoke('appear');
    }

    updateSpecialCloneAi(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const scrollX = (window.game && window.game.scrollX) || 0;
        const screenWidth = 1280; // CANVAS_WIDTH
        
        // 画面内の敵のみを対象とする
        const enemies = (window.game && window.game.stage) 
            ? window.game.stage.getAllEnemies().filter(e => {
                if (!e.isAlive || e.isDying) return false;
                const ex = e.x + e.width / 2;
                return ex >= scrollX - 50 && ex <= scrollX + screenWidth + 50;
            }) 
            : [];
            
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.y + this.height * 0.62);

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneAlive[i]) continue;
            
            const pos = this.specialClonePositions[i];
            const anchor = anchors[i];
            let target = this.specialCloneTargets[i];

            // ターゲットが死んだか、いなくなった場合は再検索
            if (!target || !target.isAlive || target.isDying) {
                target = this.findNearestEnemy(pos.x, pos.y, enemies, 500);
                this.specialCloneTargets[i] = target;
            }

            if (target) {
                // ターゲット追従
                // 攻撃範囲（サブ武器によって変わりうるが、一旦固定値で）
                const attackRange = 120; 
                const targetX = target.x + target.width / 2;
                const targetY = target.y + target.height * 0.5;
                const distSq = Math.pow(targetX - pos.x, 2) + Math.pow(targetY - pos.y, 2);
                if (distSq > Math.pow(attackRange * 1.5, 2)) {
                    // 離れている場合は追尾（少し余裕を持たせる）
                    const angle = Math.atan2(targetY - pos.y, targetX - pos.x);
                    const speed = (this.speed || 5) * 1.55;
                    pos.x += Math.cos(angle) * speed * deltaTime * 60;
                    pos.y += Math.sin(angle) * speed * deltaTime * 60;
                    pos.facingRight = targetX > pos.x;
                } else {
                    // 攻撃範囲内ならランダムで攻撃トリガー
                    const canAttack = this.specialCloneAttackTimers[i] <= 0 && this.specialCloneSubWeaponTimers[i] <= 0;
                    if (canAttack) {
                        const rand = Math.random();
                        if (rand < 0.06) {
                            this.triggerCloneAttack(i);
                        } else if (rand < 0.10) {
                            // Z武器攻撃（サブ武器）をトリガー
                            this.triggerCloneSubWeapon(i);
                        }
                    }
                }
            } else {
                // 待機位置へ戻る
                const distToAnchorSq = Math.pow(anchor.x - pos.x, 2) + Math.pow(anchor.y - pos.y, 2);
                if (distToAnchorSq > 100) {
                    const angle = Math.atan2(anchor.y - pos.y, anchor.x - pos.x);
                    const speed = (this.speed || 5) * 1.1;
                    pos.x += Math.cos(angle) * speed * deltaTime * 60;
                    pos.y += Math.sin(angle) * speed * deltaTime * 60;
                    pos.facingRight = anchor.x > pos.x;
                } else {
                    pos.x = anchor.x;
                    pos.y = anchor.y;
                    pos.facingRight = this.facingRight;
                }
                this.specialCloneReturnToAnchor[i] = true;
            }

            // 攻撃タイマーの更新
            if (this.specialCloneAttackTimers[i] > 0) {
                this.specialCloneAttackTimers[i] -= deltaMs;
            }
            if (this.specialCloneSubWeaponTimers[i] > 0) {
                this.specialCloneSubWeaponTimers[i] -= deltaMs;
                if (this.specialCloneSubWeaponTimers[i] <= 0) {
                    this.specialCloneSubWeaponActions[i] = null;
                }
            }

            // 地面より下に潜らないように補正
            if (pos.y > this.groundY - 10) {
                pos.y = this.groundY - 10;
            }
        }
    }

    findNearestEnemy(x, y, enemies, maxDist) {
        let bestTarget = null;
        let bestDistSq = maxDist * maxDist;
        for (const enemy of enemies) {
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const ds = Math.pow(ex - x, 2) + Math.pow(ey - y, 2);
            if (ds < bestDistSq) {
                bestDistSq = ds;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    }

    isSpecialCloneCombatActive() {
        return this.isUsingSpecial && this.specialCloneCombatStarted && this.specialCastTimer <= 0 && this.getActiveSpecialCloneCount() > 0;
    }

    getActiveSpecialCloneCount() {
        return this.specialCloneAlive.reduce((acc, alive) => acc + (alive ? 1 : 0), 0);
    }

    getSpecialCloneAnchors() {
        if (!this.specialCloneCombatStarted) {
            return this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.y + this.height * 0.62);
        }

        // 戦闘開始後は、AIによって更新された個別座標を返す
        return this.specialCloneSlots.map((unit, index) => {
            const pos = this.specialClonePositions[index] || { x: this.x, y: this.y, facingRight: this.facingRight };
            return {
                x: pos.x,
                y: pos.y,
                facingRight: pos.facingRight,
                alpha: this.specialCloneAlive[index] ? (0.83 - Math.abs(unit) * 0.035) : 0,
                index
            };
        });
    }

    calculateSpecialCloneAnchors(centerX, centerY) {
        const spacing = this.specialCloneSpacing || 180;
        return this.specialCloneSlots.map((unit, index) => ({
            x: centerX + unit * spacing,
            y: centerY + (Math.abs(unit) - 1.5) * 1.6 + 1.2,
            facingRight: this.facingRight,
            alpha: this.specialCloneAlive[index] ? (0.83 - Math.abs(unit) * 0.035) : 0,
            index
        }));
    }

    getSpecialCloneOffsets() {
        if (!this.isSpecialCloneCombatActive()) return [];
        const offsets = [];
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height * 0.55;

        for (let index = 0; index < this.specialCloneSlots.length; index++) {
            if (!this.specialCloneAlive[index]) continue;
            const pos = this.specialClonePositions[index];
            if (!pos) continue;
            offsets.push({
                index,
                dx: pos.x - centerX,
                dy: pos.y - centerY
            });
        }
        return offsets;
    }

    takeTrapDamage(amount, options = {}) {
        if (this.trapDamageCooldown > 0) return false;
        const sourceX = (typeof options.sourceX === 'number') ? options.sourceX : null;
        const knockbackX = (typeof options.knockbackX === 'number') ? options.knockbackX : 4.5;
        const knockbackY = (typeof options.knockbackY === 'number') ? options.knockbackY : -7.5;
        const cooldownMs = (typeof options.cooldownMs === 'number') ? options.cooldownMs : 420;
        const flashMs = (typeof options.flashMs === 'number') ? options.flashMs : 230;
        const invincibleMs = (typeof options.invincibleMs === 'number') ? options.invincibleMs : 220;

        this.hp -= amount;
        this.trapDamageCooldown = cooldownMs;
        this.damageFlashTimer = Math.max(this.damageFlashTimer, flashMs);
        this.invincibleTimer = Math.max(this.invincibleTimer, invincibleMs);

        const playerCenterX = this.x + this.width / 2;
        const knockbackDir = (sourceX === null)
            ? (this.facingRight ? -1 : 1)
            : (playerCenterX < sourceX ? -1 : 1);
        this.vx = knockbackDir * knockbackX;
        this.vy = knockbackY;
        this.isGrounded = false;
        audio.playDamage();

        if (this.hp <= 0) {
            this.hp = 0;
            return true;
        }
        return false;
    }

    renderSpecial(ctx) {
        if (!this.specialCloneAlive) return;

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneAlive[i]) continue;
            const pos = this.specialClonePositions[i];
            if (!pos) continue;

            const isAttacking = (this.specialCloneAttackTimers[i] > 0);
            const attackProgress = isAttacking ? (1 - this.specialCloneAttackTimers[i] / 420) : 0;
            
            ctx.save();
            ctx.globalAlpha = 1.0; // 分身は完全に不透明

            const renderOptions = {
                renderHeadbandTail: false,
                useLiveAccessories: false
            };

            if (isAttacking) {
                const comboStep = (this.specialCloneComboSteps[i] % 3) + 1;
                // 一時的にステートを書き換えて描画（renderModel内の分岐に合わせる）
                const originalAttacking = this.isAttacking;
                const originalAttack = this.currentAttack;
                
                this.isAttacking = true;
                this.currentAttack = { comboStep, progress: attackProgress, type: ANIM_STATE.ATTACK_SLASH };
                
                this.renderModel(ctx, pos.x, pos.y, pos.facingRight, 1.0, true, renderOptions);
                
                this.isAttacking = originalAttacking;
                this.currentAttack = originalAttack;
            } else {
                this.renderModel(ctx, pos.x, pos.y, pos.facingRight, 1.0, true, renderOptions);
            }
            ctx.restore();
        }
    }

    consumeSpecialClone(index = null) {
        if (!this.isUsingSpecial) return false;
        let consumeIndex = index;
        if (consumeIndex === null || !this.specialCloneAlive[consumeIndex]) {
            consumeIndex = this.specialCloneAlive.findIndex((alive) => alive);
            if (consumeIndex === -1) return false;
        }
        if ((this.specialCloneInvincibleTimers[consumeIndex] || 0) > 0) return false;

        this.specialCloneAlive[consumeIndex] = false;
        this.specialCloneInvincibleTimers[consumeIndex] = 0;
        const pos = this.specialClonePositions[consumeIndex];
        this.spawnSpecialSmoke('vanish', pos ? [{ x: pos.x, y: pos.y }] : null);
        if (this.getActiveSpecialCloneCount() <= 0) {
            this.isUsingSpecial = false;
            this.specialCloneCombatStarted = false;
            this.specialCastTimer = 0;
            this.spawnSpecialSmoke('vanish');
            this.resetVisualTrails();
        }
        return true;
    }

    spawnSpecialSmoke(mode = 'appear', fixedAnchors = null) {
        const lifeBase = mode === 'appear' ? 420 : 320;
        // fixedAnchors があればそれを使用、なければ自分自身の位置を配列として使用
        const anchors = fixedAnchors || [{ x: this.x + this.width / 2, y: this.y + this.height / 2 }];
        for (const anchor of anchors) {
            for (let index = 0; index < 8; index++) {
                const angle = (Math.PI * 2 * index) / 8 + Math.random() * 0.45;
                const speed = (mode === 'appear' ? 0.9 : 0.6) + Math.random() * 1.2;
                this.specialSmoke.push({
                    x: anchor.x + Math.cos(angle) * (6 + Math.random() * 12),
                    y: anchor.y + Math.sin(angle) * (4 + Math.random() * 10),
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 0.3,
                    life: lifeBase + Math.random() * 180,
                    maxLife: lifeBase + 180,
                    radius: 7 + Math.random() * 10,
                    mode
                });
            }
        }
    }

    isHangingOnOdachi() {
        const odachi = this.currentSubWeapon;
        if (!odachi || odachi.name !== '大太刀' || !odachi.isAttacking || typeof odachi.getPose !== 'function') {
            return false;
        }
        const pose = odachi.getPose(this);
        return pose.phase === 'plunge';
    }
    
    applyPhysics(walls) {
        const wasGrounded = this.isGrounded;

        // 重力
        if (!this.isGrounded) {
            this.vy += GRAVITY;
            
            // 壁滑り（落下速度軽減）
            if (this.isWallSliding && this.vy > 2) {
                this.vy = 2;
            }
        }
        
        // 摩擦（横方向）
        if (this.isGrounded && !this.isDashing && !input.isAction('LEFT') && !input.isAction('RIGHT')) {
            this.vx *= FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }
        
        // しゃがみ中は高さを半分に
        this.height = this.isCrouching ? PLAYER.HEIGHT / 2 : PLAYER.HEIGHT;
        
        // 位置更新
        this.x += this.vx;
        this.y += this.vy;
        
        // 壁判定リセット
        this.isWallSliding = false;
        this.wallDirection = 0;
        
        // 壁との当たり判定
        for (const wall of walls) {
            if (this.intersects(wall)) {
                // 横方向の補正
                if (this.vx > 0) {
                    this.x = wall.x - this.width;
                    if (!this.isGrounded && input.isAction('RIGHT')) {
                        this.isWallSliding = true;
                        this.wallDirection = -1;
                    }
                } else if (this.vx < 0) {
                    this.x = wall.x + wall.width;
                    if (!this.isGrounded && input.isAction('LEFT')) {
                        this.isWallSliding = true;
                        this.wallDirection = 1;
                    }
                }
                this.vx = 0;
            }
        }
        
        // 大太刀の突き刺し中は、柄にぶら下がる姿勢を維持する
        const hangingOnOdachi = this.isHangingOnOdachi();

        // 地面判定
        if (hangingOnOdachi) {
            const hangClearance = 30;
            const hangY = this.groundY - this.height - hangClearance;
            if (this.y > hangY) {
                this.y = hangY;
            }
            if (this.vy > 0) {
                this.vy = 0;
            }
            this.isGrounded = false;
            this.isWallSliding = false;
            this.jumpCount = Math.max(this.jumpCount, 1);
        } else if (this.y + this.height >= this.groundY) {
            this.y = this.groundY - this.height;
            this.vy = 0;
            this.isGrounded = true;
            this.jumpCount = 0;
            this.isWallSliding = false;
        } else {
            this.isGrounded = false;
        }
        this.justLanded = !wasGrounded && this.isGrounded;
        
        // 画面端制限
        if (this.x < 0) {
            this.x = 0;
            this.vx = 0;
        }
        // 右端制限は削除（ワールド座標で無限に進めるようにする。ステージ端制限はGame側で管理）
    }
    
    intersects(rect) {
        return this.x < rect.x + rect.width &&
               this.x + this.width > rect.x &&
               this.y < rect.y + rect.height &&
               this.y + this.height > rect.y;
    }
    
    takeDamage(amount, options = {}) {
        if (this.invincibleTimer > 0) return false;

        const sourceX = (typeof options.sourceX === 'number') ? options.sourceX : null;
        const knockbackX = (typeof options.knockbackX === 'number') ? options.knockbackX : 5;
        const knockbackY = (typeof options.knockbackY === 'number') ? options.knockbackY : -3;
        const invincibleMs = (typeof options.invincibleMs === 'number') ? options.invincibleMs : 1000;
        const flashMs = (typeof options.flashMs === 'number') ? options.flashMs : 300;
        
        this.hp -= amount;
        this.invincibleTimer = invincibleMs;
        this.damageFlashTimer = flashMs;
        
        // ノックバック（被弾源から離れる方向）
        const playerCenterX = this.x + this.width / 2;
        const knockbackDir = (sourceX === null)
            ? (this.facingRight ? -1 : 1)
            : (playerCenterX < sourceX ? -1 : 1);
        this.vx = knockbackDir * knockbackX;
        this.vy = knockbackY;
        this.isGrounded = false;

        // 被弾フィードバック（ヒットストップ / 画面揺れ）
        const g = window.game || game;
        if (g && typeof g.queueHitFeedback === 'function') {
            const damageRatio = Math.max(0, Math.min(1.6, amount / 4));
            const shake = 3 + damageRatio * 2;
            const stopMs = 55 + damageRatio * 25;
            g.queueHitFeedback(shake, stopMs);
        }
        
        audio.playDamage();
        
        if (this.hp <= 0) {
            this.hp = 0;
            return true;  // 死亡
        }
        return false;
    }
    
    addExp(amount) {
        if (this.isAllSkillsMaxed()) {
            this.exp = this.expToNext; // 満タン維持
            return 0;
        }
        let levelGained = 0;
        this.exp += amount;
        while (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.levelUp();
            levelGained++;
        }
        return levelGained;
    }
    
    levelUp() {
        this.level++;
        this.expToNext = Math.floor(this.expToNext * 1.42);
        this.hp = this.maxHp;
    }
    
    addSpecialGauge(amount) {
        this.specialGauge = Math.min(this.specialGauge + amount, this.maxSpecialGauge);
    }
    
    clampMoneyValue(amount) {
        const numeric = Number.isFinite(amount) ? amount : 0;
        return Math.max(0, Math.min(this.maxMoney, Math.floor(numeric)));
    }

    setMoney(amount) {
        this.money = this.clampMoneyValue(amount);
    }

    addMoney(amount) {
        this.money = this.clampMoneyValue(this.money + amount);
    }

    getNormalComboMax() {
        const tier = this.progression && Number.isFinite(this.progression.normalCombo)
            ? this.progression.normalCombo
            : 0;
        return Math.max(2, Math.min(COMBO_ATTACKS.length, 2 + tier));
    }

    getSubWeaponEnhanceTier() {
        const tier = this.progression && Number.isFinite(this.progression.subWeapon)
            ? this.progression.subWeapon
            : 0;
        return Math.max(0, Math.min(3, tier));
    }

    isAllSkillsMaxed() {
        if (!this.progression) return false;
        // 連撃、忍具、奥義（分身）のすべてが Lv3 以上か判定
        const comboMax = (this.progression.normalCombo || 0) >= 3;
        const subMax = (this.progression.subWeapon || 0) >= 3;
        const specialMax = (this.progression.specialClone || 0) >= 3;
        return comboMax && subMax && specialMax;
    }

    rebuildSpecialCloneSlots() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? Math.max(0, Math.min(3, this.progression.specialClone))
            : 0;
        const count = this.getSpecialCloneCountByTier(tier);
        this.specialCloneSlots = this.buildCloneSlotLayout(count);
        this.specialCloneSpacing = 172 + tier * 8;
        if (tier >= 3) {
            this.specialCloneAutoAiEnabled = true;
        } else {
            this.specialCloneAutoAiEnabled = false;
        }
        this.specialCloneAlive = this.specialCloneSlots.map(() => false);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map(() => 0);
    }

    getSpecialCloneCountByTier(tier) {
        const clampedTier = Math.max(0, Math.min(3, tier));
        if (clampedTier <= 0) return 1;
        if (clampedTier === 1) return 2;
        return 4;
    }

    getSpecialCloneCount() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? this.progression.specialClone
            : 0;
        return this.getSpecialCloneCountByTier(tier);
    }

    buildCloneSlotLayout(count) {
        if (count <= 1) return [-1];
        if (count === 2) return [-1, 1];
        if (count === 3) return [-1, 1, -2];
        return [-2, -1, 1, 2];
    }

    canCloneAutoStrike(index) {
        if (!this.specialCloneAutoAiEnabled) return false;
        if (!this.specialCloneAlive[index]) return false;
        return (this.specialCloneAutoCooldowns[index] || 0) <= 0;
    }

    resetCloneAutoStrikeCooldown(index) {
        if (!Number.isFinite(index)) return;
        if (!Array.isArray(this.specialCloneAutoCooldowns)) return;
        if (index < 0 || index >= this.specialCloneAutoCooldowns.length) return;
        this.specialCloneAutoCooldowns[index] = this.specialCloneAutoStrikeCooldownMs;
    }

    refreshSubWeaponScaling() {
        if (!Array.isArray(this.subWeapons) || this.subWeapons.length === 0) return;
        const tier = this.getSubWeaponEnhanceTier();
        for (const weapon of this.subWeapons) {
            if (!weapon) continue;
            const baseDamage = Number.isFinite(weapon.baseDamage) ? weapon.baseDamage : weapon.damage;
            const baseRange = Number.isFinite(weapon.baseRange) ? weapon.baseRange : weapon.range;
            const baseCooldown = Number.isFinite(weapon.baseCooldown) ? weapon.baseCooldown : weapon.cooldown;
            let damageScale = 1 + tier * 0.08;
            let rangeScale = 1 + tier * 0.1;
            let cooldownScale = 1 - tier * 0.1;
            if (weapon.name === '火薬玉') {
                damageScale = 1 + tier * 0.16;
                rangeScale = 1 + tier * 0.16;
                cooldownScale = 1 - tier * 0.18;
            } else if (weapon.name === '大槍') {
                damageScale = 1 + tier * 0.12;
                rangeScale = 1 + tier * 0.2;
                cooldownScale = 1 - tier * 0.12;
            } else if (weapon.name === '鎖鎌') {
                damageScale = 1 + tier * 0.12;
                rangeScale = 1 + tier * 0.18;
                cooldownScale = 1 - tier * 0.1;
            } else if (weapon.name === '大太刀') {
                damageScale = 1 + tier * 0.15;
                rangeScale = 1 + tier * 0.1;
                cooldownScale = 1 - tier * 0.08;
            } else if (weapon.name === '二刀流') {
                damageScale = 1 + tier * 0.09;
                rangeScale = 1 + tier * 0.08;
                cooldownScale = 1 - tier * 0.1;
                if (typeof weapon.mainMotionSpeedScale === 'number') {
                    weapon.mainMotionSpeedScale = Math.max(1.05, (this.attackMotionScale || 1.7) - tier * 0.08);
                }
            }
            weapon.damage = Math.max(1, Math.round(baseDamage * damageScale));
            weapon.range = Math.max(24, Math.round(baseRange * rangeScale));
            weapon.cooldown = Math.max(70, Math.round(baseCooldown * cooldownScale));
        }
    }

    applyProgressionChoice(choiceId) {
        if (!this.progression) return false;
        if (choiceId === 'normal_combo') {
            if (this.progression.normalCombo >= 3) return false;
            this.progression.normalCombo++;
            return true;
        }
        if (choiceId === 'sub_weapon') {
            if (this.progression.subWeapon >= 3) return false;
            this.progression.subWeapon++;
            this.refreshSubWeaponScaling();
            return true;
        }
        if (choiceId === 'special_clone') {
            if (this.progression.specialClone >= 3) return false;
            this.progression.specialClone++;
            this.rebuildSpecialCloneSlots();
            return true;
        }
        return false;
    }
    
    updateAnimation(deltaTime) {
        this.motionTime += deltaTime * 1000;
        this.animationTimer += deltaTime * 1000;
        
        // 状態に応じたアニメーション速度
        let frameDuration = 100;
        if (this.animState === ANIM_STATE.RUN) frameDuration = 80;
        if (this.animState === ANIM_STATE.DASH) frameDuration = 50;
        
        if (this.animationTimer >= frameDuration) {
            this.animationTimer = 0;
            this.animationFrame++;
        }

        // 基本的な状態遷移
        if (!this.isAttacking && !this.isUsingSpecial) {
            if (this.isWallSliding) {
                this.animState = ANIM_STATE.WALL_SLIDE;
            } else if (!this.isGrounded) {
                this.animState = this.vy < 0 ? ANIM_STATE.JUMP : ANIM_STATE.FALL;
            } else if (Math.abs(this.vx) > 0.7) {
                this.animState = this.isDashing ? ANIM_STATE.DASH : ANIM_STATE.RUN;
            } else {
                this.animState = ANIM_STATE.IDLE;
            }
        }

        // 下半身は攻撃状態に依存させず、移動状態のみで計算する
        const horizontalSpeed = Math.abs(this.vx);
        const comboAttacking = !!(this.isAttacking && this.currentAttack && this.currentAttack.comboStep);
        const isGroundMoving = this.isGrounded && horizontalSpeed > 0.85;
        if (comboAttacking) {
            this.legPhase *= 0.72;
            this.legAngle += (0 - this.legAngle) * 0.34;
        } else if (isGroundMoving) {
            const baseFreq = this.isDashing ? 0.027 : (this.isCrouching ? 0.014 : 0.018);
            const speedScale = this.isDashing ? 1.0 : Math.min(1.25, horizontalSpeed / Math.max(1, this.speed));
            this.legPhase += deltaTime * 1000 * baseFreq * (0.72 + speedScale * 0.68);
            const amplitude = this.isDashing ? 1.08 : (this.isCrouching ? 0.52 : 0.86);
            const targetAngle = Math.sin(this.legPhase) * amplitude;
            this.legAngle += (targetAngle - this.legAngle) * 0.52;
        } else if (this.isGrounded) {
            this.legPhase *= 0.92;
            this.legAngle += (0 - this.legAngle) * 0.24;
        } else {
            const airborneTarget = this.vy < -1.8
                ? -0.24 - Math.min(0.22, Math.abs(this.vy) * 0.012)
                : 0.28 + Math.min(0.36, Math.max(0, this.vy) * 0.016);
            this.legAngle += (airborneTarget - this.legAngle) * 0.2;
        }

        // --- 鉢巻・ポニーテールの更新処理 ---
        // ガード＆初期化
        if (!this.scarfNodes || this.scarfNodes.length === 0 || !this.hairNodes || this.hairNodes.length === 0) {
            this.resetVisualTrails();
            return;
        }

        const speedX = this.vx;
        const isMoving = Math.abs(speedX) > 0.1;
        const dt = Math.min(deltaTime, 0.1); 
        const subSteps = 2;
        const subDelta = dt / subSteps;
        const time = this.motionTime;
        const flutterSpeed = 0.02;

        const isRunLikePose = (this.isGrounded && Math.abs(this.vx) > 0.85) || this.isDashing;
        let modelBob = 0;
        if (this.isCrouching) {
            const crouchWalkPhase = isRunLikePose ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
            const crouchIdlePhase = isRunLikePose ? 0 : Math.sin(this.motionTime * 0.006);
            modelBob = isRunLikePose ? crouchWalkPhase * 0.4 : crouchIdlePhase * 0.2;
        } else if (!this.isGrounded) {
            modelBob = Math.max(-1.2, Math.min(1.2, -this.vy * 0.06));
        } else if (isRunLikePose) {
            modelBob = Math.abs(Math.sin(this.legPhase || this.motionTime * 0.012)) * (this.isDashing ? 3.3 : 2.4);
        } else {
            modelBob = Math.sin(this.motionTime * 0.005) * 1.2;
        }

        const modelBottomY = this.y + this.height - 2;
        const modelHeadY = this.isCrouching
            ? (modelBottomY - 32 + modelBob)
            : (this.y + 15 + modelBob);

        const knotOffsetX = this.facingRight ? -12 : 12;
        const targetX = this.x + this.width / 2 + knotOffsetX;
        const targetY = modelHeadY - 2;

        // ステージ遷移や瞬間移動で履歴ノードが大きく離れている場合は破綻防止で再初期化
        const root = this.scarfNodes[0];
        if (!Number.isFinite(root.x) || !Number.isFinite(root.y) || Math.hypot(root.x - targetX, root.y - targetY) > 120) {
            this.resetVisualTrails();
        }
        
        // 1. 根元の位置固定
        this.scarfNodes[0].x = targetX;
        this.scarfNodes[0].y = targetY;
        this.hairNodes[0].x = targetX;
        this.hairNodes[0].y = targetY - 8;

        // 昇天中（DEFEAT状態）の追従補正: 
        // プレイヤーの上昇に合わせて全ノードを強制的に追従させる（伸びるのを防ぐ）
        const isDefeatAscension = (window.game && (window.game.state === 'DEFEAT' || window.game.state === 'GAME_OVER'));
        if (isDefeatAscension) {
             const prevRootY = this.scarfNodes[0].prevY || this.scarfNodes[0].y;
             const dy = targetY - prevRootY;
             this.scarfNodes[0].prevY = targetY;
             
             // 全ノードに対し、根元の移動分を即座に反映させる
             for (let i = 1; i < this.scarfNodes.length; i++) {
                 this.scarfNodes[i].y += dy;
                 this.scarfNodes[i].x += (targetX - this.scarfNodes[0].prevX || 0);
             }
             for (let i = 1; i < this.hairNodes.length; i++) {
                 this.hairNodes[i].y += dy;
             }
             this.scarfNodes[0].prevX = targetX;
        }

        for (let s = 0; s < subSteps; s++) {
            // 鉢巻の更新
            for (let i = 1; i < this.scarfNodes.length; i++) {
                const node = this.scarfNodes[i];
                const prev = this.scarfNodes[i - 1];

                // 静止時の揺らぎ速度を劇的に落とす
                const effectiveSpeed = isMoving ? flutterSpeed : flutterSpeed * 0.25;
                const flutterIntensity = isMoving ? 5.0 : 1.0; // 移動時は大きく揺らす
                const flutterH = Math.sin(time * effectiveSpeed * 1.5 + i * 1.5) * flutterIntensity;
                const flutterV = Math.cos(time * effectiveSpeed * 2.0 + i * 1.0) * (flutterIntensity * 1.2); // 上下の動きを強化
                
                // 風圧を先端に向けて減衰させる（しなりを作る）
                const windDecay = Math.pow(0.85, i);
                const wind = isMoving ? (speedX > 0 ? -1 : 1) * (Math.abs(speedX) * 6 + 2) * windDecay : 0;
                
                node.x += (wind + flutterH) * subDelta * 12;
                node.y += (1.5 + flutterV) * subDelta * 15; 

                const dx = node.x - prev.x;
                const dy = node.y - prev.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const targetDist = 5.0; 
                if (dist > 0) {
                    const tension = isMoving ? 0.65 : 0.7; // 適度な張力に戻してしなりを出す
                    const correction = (dist - targetDist) * tension;
                    const angle = Math.atan2(dy, dx);
                    node.x -= Math.cos(angle) * correction;
                    node.y -= Math.sin(angle) * correction;
                }
            }

            // ポニーテールの更新
            for (let i = 1; i < this.hairNodes.length; i++) {
                const node = this.hairNodes[i];
                const prev = this.hairNodes[i - 1];
                
                const effectiveSpeed = isMoving ? 0.03 : 0.005;
                const flutterIntensity = isMoving ? 4.0 : 1.0;
                const runBias = isMoving ? 0 : (this.facingRight ? -2.0 : 2.0); 
                const flutterH = Math.sin(time * effectiveSpeed + i * 1.2) * flutterIntensity + runBias;
                const flutterV = Math.cos(time * (effectiveSpeed * 0.8) + i * 1.0) * (flutterIntensity * 0.8);
                
                const windDecay = Math.pow(0.8, i);
                const wind = isMoving ? (speedX > 0 ? -1 : 1) * (Math.abs(speedX) * 5 + 2) * windDecay : 0;
                
                node.x += (wind + flutterH) * subDelta * 10;
                node.y += (1.6 + flutterV) * subDelta * 12; 

                const dx = node.x - prev.x;
                const dy = node.y - prev.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const targetDist = 4.5;
                if (dist > 0) {
                    const tension = isMoving ? 0.65 : 0.7; // 伸びすぎない程度に緩めてしならせる
                    const correction = (dist - targetDist) * tension;
                    const angle = Math.atan2(dy, dx);
                    node.x -= Math.cos(angle) * correction;
                    node.y -= Math.sin(angle) * correction;
                }
            }
        }
    }

    getKatanaBladeLength() {
        // 剣筋の弧に刃先が届く長さで統一
        return 66;
    }

    drawKatana(ctx, x, y, angle, scaleDir = 1, bladeLength = this.getKatanaBladeLength()) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scaleDir, 1);
        ctx.rotate(angle);

        ctx.fillStyle = '#111';
        ctx.fillRect(-1.2, -2.2, 3.0, 4.4);

        ctx.fillStyle = '#c9a545';
        ctx.fillRect(1.45, -1.7, 1.25, 3.4);

        // 日本刀: 上側は直線、下側を反らせる
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(1.2, -1.2);
        ctx.lineTo(bladeLength - 2.8, -1.2);
        ctx.lineTo(bladeLength, 0);
        ctx.quadraticCurveTo(bladeLength - 8.0, 1.65, 1.2, 1.0);
        ctx.fill();

        ctx.fillStyle = '#b7b7b7';
        ctx.beginPath();
        ctx.moveTo(2.2, -0.45);
        ctx.lineTo(bladeLength - 10.5, -0.45);
        ctx.quadraticCurveTo(bladeLength - 14.0, 0.1, 2.2, 0.28);
        ctx.fill();

        ctx.restore();
    }
    
    render(ctx, options = {}) {
        const forceStanding = options.forceStanding || false;
        ctx.save();
        this.subWeaponRenderedInModel = false;
        
        // プレビュー画面等での武器表示を強制（奥義中などでなくても表示したい場合があるため）
        const isPreview = (window.game && window.game.state === 'STAGE_CLEAR');
        const forceSubWeapon = isPreview && this.currentSubWeapon;

        // 必殺技中は特殊効果
        if (this.isUsingSpecial || forceSubWeapon) {
            // 術詠唱の間だけ軽く明るくする（常時グローはしない）
            if (this.specialCastTimer > 0) {
                const progress = 1 - (this.specialCastTimer / Math.max(1, this.specialCastDurationMs));
                ctx.filter = `brightness(${100 + progress * 28}%)`;
            }
        }

        // ダメージフラッシュ（白寄りの瞬間発光）
        if (this.damageFlashTimer > 0) {
            const hitRatio = Math.max(0, Math.min(1, this.damageFlashTimer / 300));
            const brightness = 140 + hitRatio * 120;
            const saturation = Math.max(35, 100 - hitRatio * 55);
            ctx.filter = `brightness(${brightness}%) saturate(${saturation}%)`;
        }

        // 無敵時間中は点滅
        if (!this.isUsingSpecial && this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 100) % 2 === 0) {
            ctx.globalAlpha *= 0.5;
        }

        // 残像 (ダッシュ中)
        const isOdachiJumping = this.isOdachiJumpAfterimageActive();
        if (this.isDashing || Math.abs(this.vx) > PLAYER.SPEED * 1.5 || isOdachiJumping) {
            const sampleStep = isOdachiJumping ? 1 : 2;
            for (let i = 0; i < this.afterImages.length; i += sampleStep) {
                const img = this.afterImages[i];
                if (!img) continue;
                const depthFade = (1 - i / this.afterImages.length);
                if (isOdachiJumping) {
                    this.renderModel(ctx, img.x, img.y, img.facingRight, 0.16 + 0.56 * depthFade, false);
                } else {
                    // 分身（special_shadow）の場合は不透明にする
                    const isSpecialShadow = img.type === 'special_shadow';
                    const alpha = isSpecialShadow ? 1.0 : (0.3 * depthFade);
                    this.renderModel(ctx, img.x, img.y, img.facingRight, alpha);
                }
            }
        }

        // 必殺技演出を本体の下に描画
        if (this.isUsingSpecial || this.specialSmoke.length > 0) {
            this.renderSpecial(ctx);
        }

        // 本体
        const isDefeatAscension = (window.game && (window.game.state === 'DEFEAT' || window.game.state === 'GAME_OVER'));
        
        if (isDefeatAscension) {
            // 昇天演出: renderModel をうなだれポーズで呼び出し
            const game = window.game;
            const maxDuration = 1200;
            const deathTimer = Math.max(0, maxDuration - (game.playerDefeatTimer || 0));
            const progress = Math.min(1, deathTimer / maxDuration);
            
            // 白化 + フェードアウト
            ctx.save();
            ctx.globalAlpha *= Math.min(1.0, 0.7 * (1 - progress));
            ctx.filter = 'brightness(180%) grayscale(80%)';
            
            // renderModel でうなだれポーズ（武器なし、鉢巻テール正常）
            this.renderModel(ctx, this.x, this.y, this.facingRight, ctx.globalAlpha, false, {
                forceStanding: true,
                defeatDroop: true,
                renderHeadbandTail: true
            });
            
            ctx.restore();
            
            // 上昇パーティクル＋光のエフェクト
            this.renderDefeatAscensionEffect(ctx, deathTimer, progress);
        } else if (this.isUsingSpecial && this.specialCastTimer > 0) {
            this.renderSpecialCastPose(ctx, this.x, this.y, this.facingRight, ctx.globalAlpha);
        } else {
            this.renderModel(
                ctx, this.x, this.y, this.facingRight, ctx.globalAlpha,
                true, {}
            );
        }
        
        ctx.restore();
        ctx.filter = 'none';
        ctx.shadowBlur = 0;
    }

    // 昇天パーティクル＆光エフェクト
    renderDefeatAscensionEffect(ctx, deathTimer, progress) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * (1 - progress)})`;
        
        // 上昇する粒子
        for (let i = 0; i < 8; i++) {
            const px = centerX + Math.sin(i * 1.2 + deathTimer * 0.006) * 20;
            const py = centerY + 30 - (deathTimer * 0.035 + i * 10) % 60;
            const size = 2 + Math.sin(deathTimer * 0.007 + i) * 1.5;
            
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // ぼんやりとした光
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 45);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${0.35 * (1 - progress)})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    drawPonytail(ctx, headCenterX, headY, alpha, facingRight, bob, phase) {
        const dir = facingRight ? 1 : -1;
        const silhouetteColor = '#1a1a1a';
        const knotOffsetX = facingRight ? -12 : 12;
        const knotX = headCenterX + knotOffsetX;
        const knotY = headY - 2;
        
        ctx.fillStyle = silhouetteColor;
        const tailBaseX = knotX - dir * 1.2;
        const tailBaseY = knotY - 1.5;
        ctx.beginPath();
        ctx.moveTo(tailBaseX, tailBaseY);
        
        // 簡易形状ながら、少し動き（wave）をつける
        const wave = Math.sin(Date.now() * 0.005 + phase) * 2;
        ctx.lineTo(tailBaseX - dir * 15, tailBaseY - 2.4 + wave);
        ctx.lineTo(tailBaseX - dir * 9.5, tailBaseY + 5.2 + wave);
        ctx.closePath();
        ctx.fill();
    }

    renderModel(ctx, x, y, facingRight, alpha = 1.0, renderSubWeaponVisualsInput = true, options = {}) {
        ctx.save();
        if (alpha !== 1.0) ctx.globalAlpha *= alpha;
        const useLiveAccessories = options.useLiveAccessories !== false;
        const renderHeadbandTail = options.renderHeadbandTail !== false;
        const forceStanding = options.forceStanding || false;
        // 昇天中（forceStanding）は武器を表示しない
        const renderSubWeaponVisuals = forceStanding ? false : renderSubWeaponVisualsInput;

        // 変数定義
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        // isMovingを確実にここで定義
        // forceStandingなら移動モーションを無効化
        const state = options.state || this;
        const time = state.motionTime !== undefined ? state.motionTime : this.motionTime;
        const vx = state.vx !== undefined ? state.vx : this.vx;
        const isGrounded = state.isGrounded !== undefined ? state.isGrounded : this.isGrounded;
        const isAttacking = state.isAttacking !== undefined ? state.isAttacking : this.isAttacking;
        const currentAttack = state.currentAttack !== undefined ? state.currentAttack : this.currentAttack;
        const attackTimer = state.attackTimer !== undefined ? state.attackTimer : this.attackTimer;
        const subWeaponTimer = state.subWeaponTimer !== undefined ? state.subWeaponTimer : this.subWeaponTimer;
        const subWeaponAction = state.subWeaponAction !== undefined ? state.subWeaponAction : this.subWeaponAction;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;

        const isMoving = !forceStanding && (Math.abs(vx) > 0.1 || !isGrounded);
        
        // --- Combat of Hero風 黒シルエット描画 ---
        const silhouetteColor = '#1a1a1a'; // ほぼ黒
        const accentColor = '#00bfff'; // 鮮やかな青（マフラー・鉢巻）
        
        // forceStandingならしゃがみも無効化
        const isCrouchPose = !forceStanding && isCrouching;
        const isSpearThrustPose = !forceStanding && subWeaponTimer > 0 && subWeaponAction === '大槍' && !isAttacking;
        const spearPoseProgress = isSpearThrustPose ? Math.max(0, Math.min(1, 1 - (subWeaponTimer / 250))) : 0;
        const spearDrive = isSpearThrustPose ? Math.sin(spearPoseProgress * Math.PI) : 0;
        const comboAttackingPose = !forceStanding && !!(isAttacking && currentAttack && currentAttack.comboStep);
        const isDualZComboPose = !forceStanding && !!(
            !isAttacking &&
            subWeaponTimer > 0 &&
            subWeaponAction === '二刀_Z' &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            typeof this.currentSubWeapon.getMainSwingPose === 'function'
        );
        
        
        const dualZPose = isDualZComboPose ? this.currentSubWeapon.getMainSwingPose() : null;
        // 昇天中は死亡フラグを無視して立ち姿にする
        const isActuallyDead = !forceStanding && (this.hp <= 0);
        const speedAbs = Math.abs(this.vx);
        const isRunLike = this.isGrounded && speedAbs > 0.85;
        const isDashLike = this.isDashing || speedAbs > this.speed * 1.45;
        const locomotionPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
        const crouchWalkPhase = (isCrouchPose && isRunLike) ? locomotionPhase : 0;
        const crouchIdlePhase = (isCrouchPose && !isRunLike) ? Math.sin(this.motionTime * 0.006) : 0;
        const crouchBodyBob = isCrouchPose
            ? (isRunLike ? crouchWalkPhase * 0.4 : crouchIdlePhase * 0.2)
            : 0;
        const crouchLeanShift = isCrouchPose ? crouchWalkPhase * 0.55 : 0;

        // アニメーション補正
        let bob = 0;
        if (isActuallyDead) {
            if (!this.isGrounded) {
                // 空中では派手に回転
                bob = 0;
            } else {
                bob = 0;
            }
        } else if (isCrouchPose) {
            bob = crouchBodyBob;
        } else if (!this.isGrounded) {
            bob = Math.max(-1.4, Math.min(1.6, -this.vy * 0.07));
        } else if (isRunLike) {
            bob = Math.abs(locomotionPhase) * (isDashLike ? 3.6 : 2.5);
        } else {
            bob = Math.sin(this.motionTime * 0.005) * 1.0;
        }
        
        // locomoPhaseなどは既存の計算結果を使用
        
        // 1. 基本座標の初期化（非昇天時のデフォルト）
        let headY = isActuallyDead
            ? (bottomY - 8)
            : (isCrouchPose
                ? (bottomY - 32 + bob)
                : (y + 15 + bob - (isSpearThrustPose ? spearDrive * 2.0 : 0)));
        const headRadius = 14;
        let bodyTopY = isActuallyDead ? (bottomY - 5) : (headY + (isCrouchPose ? 7.8 : 8));
        let hipY = isActuallyDead ? (bottomY - 3) : (isCrouchPose
            ? (bottomY - 13.2 + bob * 0.45)
            : (bottomY - 20 - (isSpearThrustPose ? spearDrive * 3.2 : 0)));
        
        let currentTorsoLean = isDashLike ? dir * 2.4 : (isRunLike ? dir * 1.6 : dir * 0.45);
        let torsoShoulderX = centerX + (isCrouchPose ? dir * 4.0 : currentTorsoLean) + dir * crouchLeanShift;
        let torsoHipX = isCrouchPose
            ? (centerX + dir * 1.3 + dir * crouchLeanShift * 0.55)
            : (centerX + dir * 0.2);
        let headCenterX = centerX;
        
        // 2. ポーズ確定（昇天・死亡・通常の状態分け）
        const defeatDroop = options.defeatDroop || false;
        if (forceStanding) {
            // 昇天ポーズ（完全固定）
            if (defeatDroop) {
                headY = y + 20;
                bodyTopY = headY + 6;
                hipY = bottomY - 18;
            } else {
                headY = y + 15;
                bodyTopY = headY + 8;
                hipY = bottomY - 20;
            }
            currentTorsoLean = 0;
            torsoShoulderX = centerX;
            torsoHipX = centerX;
            headCenterX = centerX;
            // 昇天中は以下の攻撃・移動ポーズ計算を一切行わない
        } else if (isActuallyDead) {
            // 死亡時のポーズ上書き
            if (!this.isGrounded) {
                const rotateT = (time * 0.02) % (Math.PI * 2);
                const rotDir = -dir;
                const radius = 12;
                torsoShoulderX = centerX + Math.cos(rotateT) * radius * rotDir;
                bodyTopY = hipY + Math.sin(rotateT) * radius;
                headCenterX = centerX + Math.cos(rotateT + 0.5) * (radius + 12) * rotDir;
                headY = hipY + Math.sin(rotateT + 0.5) * (radius + 12);
                torsoHipX = centerX;
            } else {
                torsoShoulderX = centerX + dir * 18;
                torsoHipX = centerX + dir * 4;
                headCenterX = centerX + dir * 28;
                headY = bottomY - 6;
                bodyTopY = bottomY - 4;
                hipY = bottomY - 2;
            }
        } else {
            // 通常ポーズ計算（攻撃・武器・移動など）
            if (isSpearThrustPose) {
                // 体幹位置は通常基準を維持（頭・手との接続感を優先）
                torsoShoulderX += 0;
                torsoHipX += 0;
            }
            if (isDualZComboPose && dualZPose) {
                const p = dualZPose.progress || 0;
                const s = dualZPose.comboIndex || 0;
                const wave = Math.sin(p * Math.PI);
                const twist = Math.sin(p * Math.PI * 2);
                if (s === 1) {
                    // 抜き打ち: 前傾で踏み込む
                    headY -= 0.9 + wave * 1.0;
                    bodyTopY -= 0.8 + wave * 0.9;
                    hipY -= 0.3 + wave * 0.4;
                    torsoShoulderX += dir * (3.0 + wave * 4.8);
                    torsoHipX += dir * (1.4 + wave * 2.0);
                } else if (s === 2) {
                    // 引き戻し: 胴を引いて逆袈裟
                    headY -= 0.3 + wave * 0.9;
                    bodyTopY -= 0.2 + wave * 0.7;
                    torsoShoulderX -= dir * (3.8 + wave * 5.0);
                    torsoHipX -= dir * (2.2 + wave * 2.8);
                } else if (s === 3) {
                    // クロスステップ薙ぎ: 軸を左右に切り返す
                    headY -= 0.4 + wave * 0.6;
                    bodyTopY -= 0.2 + wave * 0.4;
                    torsoShoulderX += dir * (twist * 7.2);
                    torsoHipX -= dir * (1.0 + wave * 1.3);
                } else if (s === 4) {
                    // 跳躍交叉: 体幹ごと上げる
                    headY -= 2.8 + wave * 4.2;
                    bodyTopY -= 2.0 + wave * 3.1;
                    hipY -= 1.2 + wave * 2.3;
                    torsoShoulderX += dir * (2.2 + twist * 5.2);
                    torsoHipX -= dir * (2.0 + wave * 1.6);
                } else {
                    // 落下断ち: 頭上から叩き込む
                    headY -= 1.8 + wave * 2.0;
                    bodyTopY -= 1.4 + wave * 1.5;
                    torsoShoulderX += dir * (1.8 + wave * 2.8);
                    torsoHipX += dir * (0.3 + wave * 1.1);
                }
            }
            if (comboAttackingPose && this.currentAttack && this.currentAttack.comboStep === 4) {
                const comboDuration = Math.max(1, this.currentAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                const comboProgress = Math.max(0, Math.min(1, 1 - (this.attackTimer / comboDuration)));
                const riseT = Math.min(1, comboProgress / 0.42);
                const flipT = Math.max(0, Math.min(1, (comboProgress - 0.42) / 0.58));
                const riseLift = Math.sin(riseT * Math.PI * 0.5) * 8.5;

                hipY -= riseLift * 0.38;
                bodyTopY -= riseLift * 0.95;
                headY -= riseLift * 1.1;

                torsoHipX -= dir * (flipT * 7.4);
                if (flipT > 0) {
                    const flipAngle = -Math.PI * 1.82 * flipT;
                    torsoShoulderX = torsoHipX + Math.sin(flipAngle) * dir * 9.2;
                    bodyTopY = hipY - Math.cos(flipAngle) * 12.8;
                    headCenterX = torsoHipX + Math.sin(flipAngle) * dir * 16.6;
                    headY = hipY - Math.cos(flipAngle) * 22.6;
                }
            }
        }
        

        
        // 3. 体と足（黒）
        ctx.strokeStyle = silhouetteColor;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        
        // 体
        ctx.beginPath();
        ctx.moveTo(torsoShoulderX, bodyTopY);
        ctx.lineTo(torsoHipX, hipY);
        ctx.stroke();
        
        // 足（しゃがみは2関節、通常は奥行き差を常時表示）
        const drawJointedLeg = (hipX, hipYLocal, kneeX, kneeY, footX, footY, isFrontLeg = false, bendBias = 1) => {
            const thighWidth = isFrontLeg ? 5.1 : 4.2;
            const shinWidth = isFrontLeg ? 4.8 : 4.0;
            const kneeRadius = isFrontLeg ? 2.9 : 2.45;
            const footRadiusX = isFrontLeg ? 2.8 : 2.4;
            const footRadiusY = isFrontLeg ? 1.4 : 1.18;

            let kneeAdjX = kneeX;
            let kneeAdjY = kneeY;

            // 膝が一直線に潰れて見えないよう、最小曲げ量を確保
            const legDX = footX - hipX;
            const legDY = footY - hipYLocal;
            const legLen = Math.max(0.001, Math.hypot(legDX, legDY));
            const legUX = legDX / legLen;
            const legUY = legDY / legLen;
            const normalX = -legUY;
            const normalY = legUX;
            const kneeProj = (kneeAdjX - hipX) * legUX + (kneeAdjY - hipYLocal) * legUY;
            const kneeOnLineX = hipX + legUX * kneeProj;
            const kneeOnLineY = hipYLocal + legUY * kneeProj;
            const signedBend = (kneeAdjX - kneeOnLineX) * normalX + (kneeAdjY - kneeOnLineY) * normalY;
            const minBend = (isFrontLeg ? 2.35 : 2.05) * Math.max(0, bendBias);
            if (Math.abs(signedBend) < minBend) {
                const pushSign = dir * (isFrontLeg ? -1 : 1);
                const push = (minBend - Math.abs(signedBend)) * pushSign;
                kneeAdjX += normalX * push;
                kneeAdjY += normalY * push;
            }

            ctx.strokeStyle = silhouetteColor;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.lineWidth = thighWidth;
            ctx.beginPath();
            ctx.moveTo(hipX, hipYLocal);
            ctx.lineTo(kneeAdjX, kneeAdjY);
            ctx.stroke();

            ctx.lineWidth = shinWidth;
            ctx.beginPath();
            ctx.moveTo(kneeAdjX, kneeAdjY);
            ctx.lineTo(footX, footY);
            ctx.stroke();

            // 膝関節を明示して、脚の可動感を出す
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(kneeAdjX, kneeAdjY, kneeRadius, 0, Math.PI * 2);
            ctx.fill();

            // 足先シルエット
            const shinAngle = Math.atan2(footY - kneeAdjY, footX - kneeAdjX);
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.ellipse(footX, footY + 0.75, footRadiusX, footRadiusY, shinAngle * 0.3, 0, Math.PI * 2);
            ctx.fill();
        };

        if (isDualZComboPose && dualZPose && !isSpearThrustPose && !isCrouchPose) {
            const comboStep = dualZPose.comboIndex || 0;
            const comboProgress = dualZPose.progress || 0;
            const comboArc = Math.sin(comboProgress * Math.PI);
            const airborneLift = (!this.isGrounded ? 4.2 : 0) + ((comboStep === 4 || comboStep === 0) ? comboArc * 3.4 : 0);
            const hipLocalY = hipY - airborneLift;
            const backHipX = torsoHipX + dir * 1.2;
            const frontHipX = torsoHipX - dir * 1.0;

            let backKneeX = backHipX + dir * 0.9;
            let backKneeY = hipLocalY + 9.3;
            let backFootX = centerX + dir * 2.9;
            let backFootY = bottomY - 0.3 - airborneLift * 0.48;
            let frontKneeX = frontHipX + dir * 0.8;
            let frontKneeY = hipLocalY + 9.1;
            let frontFootX = centerX - dir * 2.7;
            let frontFootY = bottomY - 0.2 - airborneLift * 0.44;

            if (comboStep === 1) {
                backKneeX = backHipX - dir * (1.8 + comboArc * 1.3);
                backKneeY = hipLocalY + 8.6 - comboArc * 1.0;
                backFootX = centerX - dir * (5.6 + comboArc * 2.8);
                backFootY = bottomY - 0.8 - airborneLift * 0.45;
                frontKneeX = frontHipX + dir * (3.2 + comboArc * 1.8);
                frontKneeY = hipLocalY + 8.2 - comboArc * 0.9;
                frontFootX = centerX + dir * (8.4 + comboArc * 3.8);
                frontFootY = bottomY - 1.1 - airborneLift * 0.45;
            } else if (comboStep === 2) {
                backKneeX = backHipX + dir * (3.0 + comboArc * 1.5);
                backKneeY = hipLocalY + 8.8 - comboArc * 0.9;
                backFootX = centerX + dir * (7.6 + comboArc * 3.0);
                backFootY = bottomY - 0.8 - airborneLift * 0.5;
                frontKneeX = frontHipX - dir * (2.8 + comboArc * 1.9);
                frontKneeY = hipLocalY + 9.1 - comboArc * 0.9;
                frontFootX = centerX - dir * (8.2 + comboArc * 3.8);
                frontFootY = bottomY - 0.9 - airborneLift * 0.5;
            } else if (comboStep === 3) {
                backKneeX = backHipX - dir * (3.2 - comboArc * 0.9);
                backKneeY = hipLocalY + 8.6 - comboArc * 0.9;
                backFootX = centerX - dir * (8.8 + comboArc * 3.2);
                backFootY = bottomY - 0.8 - airborneLift * 0.32;
                frontKneeX = frontHipX + dir * (3.4 - comboArc * 0.8);
                frontKneeY = hipLocalY + 8.3 - comboArc * 0.9;
                frontFootX = centerX + dir * (9.1 + comboArc * 3.0);
                frontFootY = bottomY - 0.9 - airborneLift * 0.32;
            } else if (comboStep === 4) {
                backKneeX = backHipX - dir * (2.4 - comboArc * 1.3);
                backKneeY = hipLocalY + 8.1 - comboArc * 2.4;
                backFootX = centerX - dir * (7.4 + comboArc * 3.8);
                backFootY = bottomY - 1.4 - airborneLift * 0.66;
                frontKneeX = frontHipX + dir * (2.0 - comboArc * 1.2);
                frontKneeY = hipLocalY + 7.7 - comboArc * 2.2;
                frontFootX = centerX + dir * (6.4 + comboArc * 3.4);
                frontFootY = bottomY - 1.6 - airborneLift * 0.66;
            } else if (comboStep === 0) {
                // フィニッシュ: 落下断ちの着地姿勢
                backKneeX = backHipX - dir * (1.5 - comboArc * 0.8);
                backKneeY = hipLocalY + 8.7 + comboArc * 1.2;
                backFootX = centerX - dir * (4.9 - comboArc * 1.8);
                backFootY = bottomY - 1.6 + comboArc * 1.1 - airborneLift * 0.62;
                frontKneeX = frontHipX + dir * (1.3 - comboArc * 0.7);
                frontKneeY = hipLocalY + 8.5 + comboArc * 1.2;
                frontFootX = centerX + dir * (4.4 - comboArc * 1.7);
                frontFootY = bottomY - 1.7 + comboArc * 1.2 - airborneLift * 0.62;
            }

            drawJointedLeg(backHipX, hipLocalY + 0.3, backKneeX, backKneeY, backFootX, backFootY, false, 1.1);
            drawJointedLeg(frontHipX, hipLocalY + 0.1, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.08);
        } else if (comboAttackingPose && !isSpearThrustPose && !isCrouchPose) {
            const attack = currentAttack || this.currentAttack;
            if (!attack) return; // 安全策

            const comboStep = attack.comboStep || 1;
            const comboDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const comboProgress = Math.max(0, Math.min(1, 1 - (attackTimer / comboDuration)));
            const comboArc = Math.sin(comboProgress * Math.PI);
            const baseLift = Math.max(0, Math.min(1, Math.abs(vx) / 14));
            const airborneLift = !isGrounded ? 4.8 + baseLift * 4.4 : 0;
            const hipLocalY = hipY - airborneLift;
            const backHipX = torsoHipX + dir * 1.3;
            const frontHipX = torsoHipX - dir * 1.2;

            let backKneeX = backHipX + dir * 0.8;
            let backKneeY = hipLocalY + 10.1;
            let backFootX = centerX + dir * 2.6;
            let backFootY = bottomY + 0.2 - airborneLift * 0.55;
            let frontKneeX = frontHipX + dir * 0.9;
            let frontKneeY = hipLocalY + 9.5;
            let frontFootX = centerX - dir * 3.0;
            let frontFootY = bottomY - 0.2 - airborneLift * 0.52;

            if (comboStep === 1) {
                backKneeX = backHipX - dir * (1.2 + comboArc * 1.2);
                backKneeY = hipLocalY + 9.0 - comboArc * 1.0;
                backFootX = centerX - dir * (4.8 + comboArc * 2.8);
                backFootY = bottomY - 0.6 - airborneLift * 0.45;
                frontKneeX = frontHipX + dir * (2.8 + comboArc * 1.6);
                frontKneeY = hipLocalY + 8.5 - comboArc * 1.0;
                frontFootX = centerX + dir * (7.6 + comboArc * 3.4);
                frontFootY = bottomY - 1.3 - airborneLift * 0.45;
            } else if (comboStep === 2) {
                backKneeX = backHipX + dir * (2.6 + comboArc * 1.0);
                backKneeY = hipLocalY + 8.8 - comboArc * 0.6;
                backFootX = centerX + dir * (6.4 + comboArc * 2.2);
                backFootY = bottomY - 0.8 - airborneLift * 0.5;
                frontKneeX = frontHipX - dir * (2.2 + comboArc * 1.5);
                frontKneeY = hipLocalY + 9.4 - comboArc * 0.6;
                frontFootX = centerX - dir * (7.0 + comboArc * 3.0);
                frontFootY = bottomY - 0.5 - airborneLift * 0.5;
            } else if (comboStep === 3) {
                backKneeX = backHipX - dir * (2.6 - comboArc * 1.1);
                backKneeY = hipLocalY + 8.5 - comboArc * 1.4;
                backFootX = centerX - dir * (7.2 + comboArc * 2.0);
                backFootY = bottomY - 0.9 - airborneLift * 0.56;
                frontKneeX = frontHipX + dir * (2.9 - comboArc * 1.0);
                frontKneeY = hipLocalY + 8.2 - comboArc * 1.5;
                frontFootX = centerX + dir * (7.6 + comboArc * 2.2);
                frontFootY = bottomY - 1.2 - airborneLift * 0.56;
            } else if (comboStep === 4) {
                const rise = comboProgress;
                const flipT = Math.max(0, (rise - 0.42) / 0.58);
                backKneeX = backHipX - dir * (1.4 - rise * 0.6 + flipT * 2.8);
                backKneeY = hipLocalY + 8.6 - rise * 2.2 - flipT * 1.2;
                backFootX = centerX - dir * (5.4 - rise * 1.4 + flipT * 7.8);
                backFootY = bottomY - 1.0 - airborneLift * (0.54 + rise * 0.22) - flipT * 1.0;
                frontKneeX = frontHipX + dir * (2.3 + rise * 1.0 - flipT * 2.2);
                frontKneeY = hipLocalY + 8.0 - rise * 2.2 - flipT * 1.1;
                frontFootX = centerX + dir * (7.2 + rise * 1.8 - flipT * 7.2);
                frontFootY = bottomY - 1.2 - airborneLift * (0.58 + rise * 0.26) - flipT * 1.1;
            } else if (comboStep === 5) {
                // 五段目: 頭上構えから落下、着地で脚をたたむ
                if (comboProgress < 0.3) {
                    const t = comboProgress / 0.3;
                    backKneeX = backHipX - dir * (1.8 - t * 0.7);
                    backKneeY = hipLocalY + 8.7 - t * 1.5;
                    backFootX = centerX - dir * (5.6 - t * 2.2);
                    backFootY = bottomY - 1.0 - airborneLift * 0.62;
                    frontKneeX = frontHipX + dir * (2.5 - t * 1.2);
                    frontKneeY = hipLocalY + 8.5 - t * 1.5;
                    frontFootX = centerX + dir * (7.1 - t * 2.9);
                    frontFootY = bottomY - 1.1 - airborneLift * 0.64;
                } else if (comboProgress < 0.78) {
                    const t = (comboProgress - 0.3) / 0.48;
                    backKneeX = backHipX - dir * (1.1 + t * 1.8);
                    backKneeY = hipLocalY + 7.2 + t * 2.4;
                    backFootX = centerX - dir * (3.4 + t * 2.8);
                    backFootY = bottomY - 2.4 + t * 1.7 - airborneLift * 0.44;
                    frontKneeX = frontHipX + dir * (1.3 + t * 1.2);
                    frontKneeY = hipLocalY + 7.0 + t * 2.5;
                    frontFootX = centerX + dir * (4.4 + t * 1.8);
                    frontFootY = bottomY - 2.6 + t * 1.9 - airborneLift * 0.46;
                } else {
                    const t = (comboProgress - 0.78) / 0.22;
                    backKneeX = backHipX - dir * (2.9 - t * 1.6);
                    backKneeY = hipLocalY + 9.6 - t * 1.4;
                    backFootX = centerX - dir * (6.2 - t * 2.4);
                    backFootY = bottomY - 0.6 - airborneLift * 0.22;
                    frontKneeX = frontHipX + dir * (2.7 - t * 1.4);
                    frontKneeY = hipLocalY + 9.3 - t * 1.3;
                    frontFootX = centerX + dir * (6.0 - t * 2.2);
                    frontFootY = bottomY - 0.7 - airborneLift * 0.22;
                }
            }

            drawJointedLeg(backHipX, hipLocalY + 0.35, backKneeX, backKneeY, backFootX, backFootY, false, 1.12);
            drawJointedLeg(frontHipX, hipLocalY + 0.12, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.06);
        } else if (forceStanding) {
            // 強制立ち姿勢（直立不動）
            const backHipX = centerX + dir * 1.5;
            const frontHipX = centerX - dir * 1.5;
            const hipJoinY = bottomY - 14; 
            const kneeY = bottomY - 7;
            const footY = bottomY;

            // まっすぐ下に下ろす
            drawJointedLeg(backHipX, hipJoinY, backHipX, kneeY, backHipX, footY, false, 1.0);
            drawJointedLeg(frontHipX, hipJoinY, frontHipX, kneeY, frontHipX, footY, true, 1.0);
        } else if (isCrouchPose) {
            const crouchStride = crouchWalkPhase * 2.8;
            const crouchLift = Math.abs(crouchWalkPhase) * 1.3;
            const backHipX = torsoHipX + dir * 1.15;
            const frontHipX = torsoHipX - dir * 1.35;
            const backHipY = hipY + 0.4;
            const frontHipY = hipY + 0.2;

            const backKneeX = backHipX + dir * (3.2 + crouchStride * 0.5);
            const backKneeY = hipY + 7.4 + Math.max(0, -crouchWalkPhase) * 1.4;
            const backFootX = centerX + dir * (7.0 + crouchStride);
            const backFootY = bottomY - 0.6 + crouchLift * 0.2;
            drawJointedLeg(backHipX, backHipY, backKneeX, backKneeY, backFootX, backFootY, false, 1.0);

            const frontKneeX = frontHipX - dir * (3.9 - crouchStride * 0.5);
            const frontKneeY = hipY + 7.8 + Math.max(0, crouchWalkPhase) * 1.4;
            const frontFootX = centerX - dir * (7.8 - crouchStride);
            const frontFootY = bottomY - 0.2;
            drawJointedLeg(frontHipX, frontHipY, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.02);
        } else if (isSpearThrustPose) {
            // 後ろ足: 後方へまっすぐ伸ばして蹴る
            const rearHipX = torsoHipX + dir * 0.9;
            const frontHipX = torsoHipX - dir * 0.9;
            const rearFootX = torsoHipX - dir * (12.8 + spearDrive * 6.2);
            const rearFootY = bottomY - 1.2 + spearDrive * 0.8;
            drawJointedLeg(
                rearHipX,
                hipY + 0.3,
                torsoHipX + dir * (2.8 + spearDrive * 1.8),
                hipY + 5.4 + spearDrive * 0.8,
                rearFootX,
                rearFootY,
                false,
                1.02
            );

            // 前足: 太ももは前へ、膝下は後ろ足と同角度で折る
            const rearDX = rearFootX - torsoHipX;
            const rearDY = rearFootY - hipY;
            const rearLen = Math.max(0.001, Math.hypot(rearDX, rearDY));
            const rearDirX = rearDX / rearLen;
            const rearDirY = rearDY / rearLen;
            const frontLift = spearDrive * 5.2;
            const frontKneeX = torsoHipX + dir * (7.5 + spearDrive * 4.2);
            const frontKneeY = hipY + 4.6 - frontLift * 0.42;
            const shinLen = 12.5 + spearDrive * 3.0;
            const frontFootX = frontKneeX + rearDirX * shinLen;
            const frontFootY = frontKneeY + rearDirY * shinLen;
            drawJointedLeg(frontHipX, hipY + 0.15, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.1);
        } else {
            if (!this.isGrounded) {
                // 空中姿勢：上昇時は前脚を抱え、後ろ脚で蹴り上げる。脚長は地上時に近い長さを維持。
                const riseTuck = this.vy < 0 ? Math.min(1, Math.abs(this.vy) / 16) : 0;
                const apexBlend = Math.max(0, 1 - Math.min(1, Math.abs(this.vy) / 4));
                const jumpTuck = Math.min(1, riseTuck + apexBlend * 0.35);
                const landPrep = this.vy > 0 ? Math.min(1, this.vy / 14) : 0;
                const drift = Math.max(-1, Math.min(1, this.vx / Math.max(1, this.speed * 1.4)));
                const leapDrive = Math.min(1, Math.abs(this.vx) / Math.max(1, this.speed * 1.2));
                const kickPose = Math.max(jumpTuck, leapDrive * 0.55) * (1 - landPrep * 0.68);
                const airLegScale = 1.16 + leapDrive * 0.1 + (this.vy < 0 ? 0.03 : 0);
                const backHipX = torsoHipX + dir * 1.45;
                const frontHipX = torsoHipX - dir * 1.35;

                // 後ろ足：膝を上げたあと、蹴り出し方向へ細く伸ばす
                const backKneeX = backHipX - dir * ((4.8 + kickPose * 4.8 - landPrep * 0.8) * airLegScale) - dir * drift * 1.0;
                const backKneeY = hipY + 7.2 - kickPose * 2.4 + landPrep * 1.9;
                const backFootX = backKneeX - dir * ((4.4 + kickPose * 3.8 + landPrep * 0.4) * airLegScale) - dir * drift * 0.7;
                const backFootY = backKneeY + 8.6 - kickPose * 1.2 + landPrep * 4.4;
                drawJointedLeg(backHipX, hipY + 0.35, backKneeX, backKneeY, backFootX, backFootY, false, 1.25);

                // 前足：膝を高く引き上げ、下腿は少し畳んでジャンプ感を出す
                const frontKneeX = frontHipX + dir * ((3.8 + kickPose * 3.2 + landPrep * 0.6) * airLegScale) + dir * drift * 0.8;
                const frontKneeY = hipY + 7.0 - kickPose * 3.8 + landPrep * 1.8;
                const frontFootX = frontKneeX - dir * ((2.4 + kickPose * 2.8 - landPrep * 0.3) * airLegScale) + dir * drift * 0.25;
                const frontFootY = frontKneeY + 8.4 - kickPose * 0.8 + landPrep * 4.6;
                drawJointedLeg(frontHipX, hipY + 0.2, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.2);
            } else {
                const runPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
                if (!isRunLike) {
                    // 立ち/低速時: 足は必ず2本見える姿勢を維持（ガニ股は抑える）
                    const idlePhase = Math.sin(this.motionTime * 0.0042);
                    const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                    const backHipX = torsoHipX + dir * 1.35;
                    const frontHipX = torsoHipX - dir * 1.25;
                    // 後ろ足の膝向きが逆転しないよう、やや前方に折る
                    const backKneeX = backHipX + dir * 0.55;
                    const frontKneeX = frontHipX + dir * 0.6;
                    const backKneeY = hipY + 9.9;
                    const frontKneeY = hipY + 9.6;
                    const backFootX = centerX + dir * idleSpread;
                    const frontFootX = centerX - dir * idleSpread;
                    const backFootY = bottomY + 0.1;
                    const frontFootY = bottomY - 0.1;
                    drawJointedLeg(backHipX, hipY + 0.45, backKneeX, backKneeY, backFootX, backFootY, false, 0.0);
                    drawJointedLeg(frontHipX, hipY + 0.25, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 0.18);
                } else {
                    const runBlend = Math.min(1, speedAbs / Math.max(1, this.speed * 1.25));
                    const strideAmp = isDashLike ? 13.8 : 10.4;
                    const liftAmp = isDashLike ? 5.6 : 4.2;
                    const legSpread = 1.9;
                    const baseStepScale = 0.45 + runBlend * 0.88;
                    const legSpanY = bottomY - hipY;

                    const drawGroundLeg = (legSign, isFrontLeg) => {
                        const phase = runPhase * legSign;
                        const forward = phase * strideAmp * baseStepScale;
                        const lift = Math.max(0, -phase) * liftAmp * (0.3 + runBlend * 0.95);
                        const plant = Math.max(0, phase) * (0.72 + runBlend * 0.58);
                        const depthShift = isFrontLeg ? 0 : 0.45;
                        const hipX = torsoHipX + dir * legSign * 1.25;
                        const hipLocalY = hipY + (isFrontLeg ? 0.2 : 0.45);
                        const footX = centerX + dir * (forward + legSign * legSpread);
                        const footY = bottomY - lift + depthShift * 0.25;
                        const kneeX = hipX + dir * (forward * 0.44 + legSign * (legSpread * 0.82 + 1.05));
                        const kneeY = hipY + legSpanY * (0.56 + runBlend * 0.04) - lift * 0.75 + plant * 0.3 + depthShift;
                        drawJointedLeg(hipX, hipLocalY, kneeX, kneeY, footX, footY, isFrontLeg, 0.65);
                    };

                    drawGroundLeg(1, false);
                    drawGroundLeg(-1, true);
                }
            }
        }
        
        // 4. 頭（黒・目なし）
        ctx.fillStyle = silhouetteColor;
        ctx.beginPath();
        ctx.arc(headCenterX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();

        // 5. 鉢巻・ポニーテール（アクセントカラー）
        // 頭の描画の後なので、頭の上に上書きされる
        
        // 結び目の位置（頭の後ろ）
        const knotOffsetX = facingRight ? -12 : 12;
        const knotX = headCenterX + knotOffsetX;
        const knotY = headY - 2;

        // ポニーテール（髪・手前側）を頭の上に描画して視認性確保
        if (useLiveAccessories && this.hairNodes && this.hairNodes.length > 1) {
            // 背景とのコントラストを出すため、明るい灰色に
            ctx.fillStyle = silhouetteColor; 
            ctx.beginPath();
            
            // 生え際：結び目から少し離し、ポニーテールらしく斜め上に（facingRightを考慮）
            const hairBaseX = knotX - (facingRight ? 2 : -2);
            const hairBaseY = headY - 10; 
            ctx.moveTo(hairBaseX, hairBaseY);
            
            for (let i = 1; i < this.hairNodes.length; i++) {
                const node = this.hairNodes[i];
                const prev = this.hairNodes[i-1];
                const xc = (node.x + prev.x) / 2;
                const yc = (node.y + prev.y) / 2;
                ctx.quadraticCurveTo(prev.x, prev.y, xc, yc);
            }
            
            // 復路（毛先に向かってより細く、鋭く）
            for (let i = this.hairNodes.length - 1; i >= 1; i--) {
                const node = this.hairNodes[i];
                const prev = this.hairNodes[i-1];
                
                // 生え際から先端にかけて劇的に細くし、毛先を尖らせる
                const tProgress = i / (this.hairNodes.length - 1); // 0 (根元) -> 1 (先端)
                const thickness = (1 - tProgress) * 12 + 1; // 12pxから1pxへ。
                
                const sideShift = Math.sin(time * 0.005 + i * 0.5) * (isMoving ? 1.0 : 1.5); 
                
                const ctrlX = node.x + sideShift;
                const ctrlY = node.y + thickness;
                const endX = (node.x + prev.x) / 2 + sideShift;
                const endY = (node.y + prev.y) / 2 + thickness;
                
                ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
            }
            ctx.lineTo(hairBaseX, hairBaseY);
            ctx.closePath();
            ctx.fill();
        } else {
            // 分身描画用: 接続情報を使わない簡易ポニーテール
            this.drawPonytail(ctx, headCenterX, headY, alpha, facingRight, bob, 0);
        }

        const drawHeadbandTail = () => {
            if (!renderHeadbandTail) return;
            if (!useLiveAccessories || !this.scarfNodes || this.scarfNodes.length === 0) {
                // 静的・簡易描画モードでもポニーテールを描画
                if (typeof this.drawPonytail === 'function') {
                    this.drawPonytail(ctx, headCenterX, headY, alpha, facingRight, bob, 0); // 簡易モードでは phase 0
                }
                
                // 分身描画用: 帯の簡易形状（連結しない）
                const tailLen = 21 + (isMoving ? 6 : 0);
                const tailWave = Math.sin(time * 0.014 + (facingRight ? 0 : 1.7)) * (isMoving ? 2.2 : 1.2);
                const tailRootX = knotX;
                const tailRootY = knotY + 0.8;
                const tailMidX = tailRootX - dir * (tailLen * 0.55);
                const tailMidY = tailRootY + tailWave - 0.6;
                const tailTipX = tailRootX - dir * tailLen;
                const tailTipY = tailRootY + tailWave * 0.5 + (isMoving ? -0.4 : 0.9);

                ctx.fillStyle = accentColor;
                ctx.beginPath();
                ctx.moveTo(tailRootX, tailRootY + 0.3);
                ctx.quadraticCurveTo(
                    tailMidX + dir * 2.0,
                    tailMidY - 2.4,
                    tailTipX,
                    tailTipY - 1.2
                );
                ctx.lineTo(tailTipX + dir * 0.8, tailTipY + 1.4);
                ctx.quadraticCurveTo(
                    tailMidX + dir * 1.6,
                    tailMidY + 3.4,
                    tailRootX,
                    tailRootY + 8.6
                );
                ctx.closePath();
                ctx.fill();
                return;
            }

            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(knotX, knotY);
            
            // 往路（上辺）
            for (let i = 1; i < this.scarfNodes.length - 1; i++) {
                const xc = (this.scarfNodes[i].x + this.scarfNodes[i + 1].x) / 2;
                const yc = (this.scarfNodes[i].y + this.scarfNodes[i + 1].y) / 2;
                ctx.quadraticCurveTo(this.scarfNodes[i].x, this.scarfNodes[i].y, xc, yc);
            }
            const lastScarf = this.scarfNodes[this.scarfNodes.length - 1];
            ctx.lineTo(lastScarf.x, lastScarf.y);
            
            // 復路（ひねり・厚み表現）
            const movingNow = Math.abs(this.vx) > 0.1;
            
            for (let i = this.scarfNodes.length - 1; i >= 1; i--) {
                const node = this.scarfNodes[i];
                const prev = this.scarfNodes[i - 1];
                
                const baseWidth = movingNow ? 7 : 10;
                const waveSpeed = movingNow ? 0.008 : 0.004;
                const wavePhase = i * (movingNow ? 0.5 : 0.6);
                const wave = Math.sin(time * waveSpeed + wavePhase);
                
                const currentWidth = baseWidth * (movingNow ? 0.85 : 1.0 + Math.abs(wave) * 0.3);
                const tiltX = wave * (movingNow ? 1.0 : 3.0);
                
                const controlX = node.x + tiltX;
                const controlY = node.y + currentWidth;
                const endX = (node.x + prev.x) / 2 + tiltX;
                const endY = (node.y + prev.y) / 2 + currentWidth;
                
                if (i === this.scarfNodes.length - 1) {
                    ctx.lineTo(node.x + tiltX, node.y + currentWidth);
                }
                ctx.quadraticCurveTo(controlX, controlY, endX, endY);
            }
            ctx.lineTo(knotX, knotY + 12);
            ctx.closePath();
            ctx.fill();
        };

        // 鉢巻のバンド（頭に巻く部分）
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        
        // 前上がり（額）・後ろ下がり（結び目）
        const frontY = headY - 6;
        const frontX = headCenterX + (facingRight ? 14 : -14); 
        
        // 2つの制御点で滑らかなS字カーブを描く
        const ctrl1X = headCenterX + (facingRight ? -4 : 4);
        const ctrl1Y = headY - 4;
        const ctrl2X = headCenterX + (facingRight ? 8 : -8);
        const ctrl2Y = headY - 8;
        
        ctx.moveTo(knotX, knotY);
        ctx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, frontX, frontY);
        ctx.stroke();

        
        // 6. 腕と剣
        // 追加: 昇天演出（forceStanding）時は完全に直立不動（腕をダラリと下げる）
        if (forceStanding) {
             const armLen = 19;
             ctx.strokeStyle = silhouetteColor;
             ctx.lineWidth = 4.2;
             ctx.lineCap = 'round';
             
             // 奥の腕
             ctx.beginPath();
             ctx.moveTo(torsoShoulderX + dir * 2, bodyTopY + 2);
             ctx.lineTo(torsoShoulderX + dir * 2, bodyTopY + 2 + armLen);
             ctx.stroke();
             
             // 手前の腕
             ctx.beginPath();
             ctx.moveTo(torsoShoulderX - dir * 2, bodyTopY + 2);
             ctx.lineTo(torsoShoulderX - dir * 2, bodyTopY + 2 + armLen);
             ctx.stroke();
             
             // 武器は描画しないのでここで終了
             ctx.restore();
             return;
        }

        // forceStanding(昇天)時は全攻撃・武器描画を無効化
        const effectiveIsAttacking = forceStanding ? false : (isAttacking);
        const effectiveSubWeaponTimer = forceStanding ? 0 : (subWeaponTimer);
        const isActuallyAttacking = effectiveIsAttacking || (effectiveSubWeaponTimer > 0 && subWeaponAction !== 'throw');
        const backShoulderX = torsoShoulderX;
        const backShoulderY = bodyTopY + (isCrouchPose ? 1 : 2);
        const frontShoulderX = centerX - dir * (isCrouchPose ? 0.4 : 1);
        const frontShoulderY = bodyTopY + (isCrouchPose ? 2 : 3);

        const drawArmSegment = (fromX, fromY, toX, toY, width = 6) => {
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
        };

        const drawHand = (xPos, yPos, radius = 4.5) => {
            ctx.fillStyle = silhouetteColor; // COLORS.PLAYER_GI から修正
            ctx.beginPath();
            ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            ctx.fill();
        };

        const clampArmReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderX;
            const dy = targetY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) {
                return { x: targetX, y: targetY };
            }
            const ratio = maxLen / dist;
            return {
                x: shoulderX + dx * ratio,
                y: shoulderY + dy * ratio
            };
        };

        const idleBackHandX = centerX + dir * (isCrouchPose ? 12 : 15);
        const idleBackHandY = bodyTopY + (isCrouchPose ? 7.5 : 10) + Math.sin(this.motionTime * 0.01) * (isCrouchPose ? 1 : 2);
        const idleFrontHandX = centerX - dir * (isCrouchPose ? 5 : 8);
        const idleFrontHandY = bodyTopY + (isCrouchPose ? 9 : 12);
        const idleBackBladeAngle = isCrouchPose ? -0.42 : -0.55;
        const idleFrontBladeAngle = isCrouchPose ? -0.92 : -1.05;

        if (!isActuallyAttacking) {
            const isThrowing = effectiveSubWeaponTimer > 0 && subWeaponAction === 'throw';
            const hasDualSubWeapon = !forceStanding && this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';

            if (defeatDroop) {
                // うなだれポーズ: 腕を垂らす（武器なし）
                const droopBackHandX = centerX + dir * 4;
                const droopBackHandY = hipY + 2;
                drawArmSegment(backShoulderX, backShoulderY, droopBackHandX, droopBackHandY, 5);
                drawHand(droopBackHandX, droopBackHandY, 4);
                
                const droopFrontHandX = centerX - dir * 4;
                const droopFrontHandY = hipY + 2;
                drawArmSegment(frontShoulderX, frontShoulderY, droopFrontHandX, droopFrontHandY, 5);
                drawHand(droopFrontHandX, droopFrontHandY, 4);
            } else {
                // 奥手（通常剣）は投擲中も保持したまま
                drawArmSegment(backShoulderX, backShoulderY, idleBackHandX, idleBackHandY, 6);
                drawHand(idleBackHandX, idleBackHandY, 4.8);
                this.drawKatana(ctx, idleBackHandX, idleBackHandY, idleBackBladeAngle, dir);

            // 手前手（通常時）
            if (!isThrowing) {
                if (hasDualSubWeapon) {
                    // 二刀装備中は通常時も手前刀を保持
                    drawArmSegment(frontShoulderX, frontShoulderY, idleFrontHandX, idleFrontHandY, 5);
                    drawHand(idleFrontHandX, idleFrontHandY, 4.5);
                    this.drawKatana(ctx, idleFrontHandX, idleFrontHandY, idleFrontBladeAngle, dir);
                } else {
                    // 通常姿勢は空き手を刀に添えて両手持ちにする
                    const bladeDirX = Math.cos(idleBackBladeAngle) * dir;
                    const bladeDirY = Math.sin(idleBackBladeAngle);
                    const perpX = -bladeDirY;
                    const perpY = bladeDirX;
                    const supportTargetX = idleBackHandX - bladeDirX * 5.8 + perpX * 1.0;
                    const supportTargetY = idleBackHandY - bladeDirY * 5.8 + perpY * 1.0;
                    const supportHand = clampArmReach(frontShoulderX, frontShoulderY, supportTargetX, supportTargetY, 22);
                    drawArmSegment(frontShoulderX, frontShoulderY, supportHand.x, supportHand.y, 5);
                    drawHand(supportHand.x, supportHand.y, 4.5);
                }
                }
            }
        } else if (effectiveIsAttacking) {
            // メイン武器攻撃時
            this.renderAttackArmAndWeapon(ctx, {
                centerX,
                pivotY: bodyTopY + 2,
                facingRight,
                backShoulderX,
                backShoulderY,
                frontShoulderX,
                frontShoulderY,
                supportFrontHand: !(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流')
            });

            // 二刀装備中は反対手の刀を残す
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                drawArmSegment(frontShoulderX, frontShoulderY, idleFrontHandX, idleFrontHandY, 5);
                drawHand(idleFrontHandX, idleFrontHandY, 4.5);
                this.drawKatana(ctx, idleFrontHandX, idleFrontHandY, idleFrontBladeAngle, dir);
            }
        }

        // サブ武器（ボム、槍など）のアニメーション
        if (effectiveSubWeaponTimer > 0 && !effectiveIsAttacking) {
            this.renderSubWeaponArm(ctx, centerX, bodyTopY + 2, facingRight, renderSubWeaponVisuals);
        }

        // 長い帯(テール)を最前面寄りで描き、腕より手前に来るようにする
        drawHeadbandTail();

        ctx.restore();
    }

    renderSubWeaponArm(ctx, centerX, pivotY, facingRight, renderWeaponVisuals = true) {
        const dir = facingRight ? 1 : -1;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const subDuration =
            this.subWeaponAction === 'throw' ? 150 :
            (this.subWeaponAction === '大槍') ? 250 :
            (this.subWeaponAction === '鎖鎌') ? 560 :
            (this.subWeaponAction === '二刀_Z') ? Math.max(1, (dualBlade && dualBlade.mainDuration) ? dualBlade.mainDuration : 204) :
            (this.subWeaponAction === '二刀_合体') ? 220 :
            (this.subWeaponAction === '大太刀') ? 760 : 300;
        const sourceTimer =
            (dualBlade && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
                ? dualBlade.attackTimer
                : this.subWeaponTimer;
        const progress = Math.max(0, Math.min(1, 1 - (sourceTimer / subDuration)));
        const silhouetteColor = COLORS.PLAYER;
        const backShoulderX = centerX + dir * 4;
        const frontShoulderX = centerX - dir * 3;
        const shoulderY = pivotY;
        
        ctx.save();
        ctx.strokeStyle = silhouetteColor;
        ctx.lineCap = 'round';

        const drawArmSegment = (fromX, fromY, toX, toY, width = 6) => {
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
        };

        const drawHand = (xPos, yPos, radius = 4.8) => {
            ctx.fillStyle = silhouetteColor; // COLORS.PLAYER_GI から修正
            ctx.beginPath();
            ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
            ctx.fill();
        };

        const drawSupportPose = (handX, handY, withBlade = false, bladeAngle = -1.0, bladeScaleDir = dir, fromBackShoulder = false) => {
            drawArmSegment(fromBackShoulder ? backShoulderX : frontShoulderX, shoulderY + (fromBackShoulder ? 0 : 1), handX, handY, 5);
            drawHand(handX, handY, 4.5);
            if (withBlade && renderWeaponVisuals) {
                this.drawKatana(ctx, handX, handY, bladeAngle, bladeScaleDir);
            }
        };

        const clampArmReach = (shoulderX, shoulderYLocal, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderX;
            const dy = targetY - shoulderYLocal;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) {
                return { x: targetX, y: targetY };
            }
            const ratio = maxLen / dist;
            return {
                x: shoulderX + dx * ratio,
                y: shoulderYLocal + dy * ratio
            };
        };

        if (this.subWeaponAction === 'throw') {
            // 手前手でボムを投げる。奥手の剣はrenderModel側で保持する。
            const armAngle = -Math.PI * 0.9 + progress * Math.PI * 0.78;
            const armLength = 19;
            const throwShoulderX = frontShoulderX;
            const throwShoulderY = shoulderY + 1;
            const throwTargetX = throwShoulderX + Math.cos(armAngle) * armLength * dir;
            const throwTargetY = throwShoulderY + Math.sin(armAngle) * armLength;
            const throwHand = clampArmReach(throwShoulderX, throwShoulderY, throwTargetX, throwTargetY, 21);
            const armEndX = throwHand.x;
            const armEndY = throwHand.y;
            ctx.strokeStyle = silhouetteColor; // シルエット色（COLORS.PLAYER）に統一
            drawArmSegment(throwShoulderX, throwShoulderY, armEndX, armEndY, 5.4);
            // 1. 爆弾を先に描画
            if (progress < 0.52) {
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.arc(armEndX, armEndY, 6, 0, Math.PI * 2);
                ctx.fill();
            }

            // 2. 手を爆弾の上に描画（シルエット色）
            drawHand(armEndX, armEndY, 5);
        } else if (this.subWeaponAction === '大槍') {
            // 突き: 奥手で押し込み、槍を挟んで手前手でガイド
            const spear = (this.currentSubWeapon && this.currentSubWeapon.name === '大槍') ? this.currentSubWeapon : null;
            const grips = (spear && typeof spear.getGripAnchors === 'function')
                ? spear.getGripAnchors(this)
                : null;
            const pushLead = grips ? grips.progress : Math.min(1, progress * 1.35);
            const thrustArc = Math.sin(pushLead * Math.PI) * 1.1;

            const rearShoulderX = backShoulderX + dir * (0.6 + pushLead * 0.35);
            const rearShoulderY = shoulderY - 1.1;
            const rearTargetX = grips ? grips.rear.x : (centerX + dir * (14 + pushLead * 7));
            const rearTargetY = grips ? grips.rear.y : (pivotY + 7.5 + thrustArc * 0.6);
            const rearHand = clampArmReach(rearShoulderX, rearShoulderY, rearTargetX, rearTargetY, 26);
            drawArmSegment(rearShoulderX, rearShoulderY, rearHand.x, rearHand.y, 6);
            drawHand(rearHand.x, rearHand.y, 5.1);

            // 槍本体は奥手と手前手の間に描画する
            if (renderWeaponVisuals && this.currentSubWeapon && typeof this.currentSubWeapon.render === 'function') {
                this.currentSubWeapon.render(ctx, this);
                this.subWeaponRenderedInModel = true;
            }

            const frontShoulderGripX = frontShoulderX + dir * (0.2 + pushLead * 0.25);
            const frontShoulderGripY = shoulderY + 1 + thrustArc * 0.12;
            const frontTargetX = grips ? grips.front.x : (centerX + dir * (11 + pushLead * 8));
            const frontTargetY = grips ? grips.front.y : (pivotY + 10.2 + thrustArc * 0.7);
            const frontHand = clampArmReach(frontShoulderGripX, frontShoulderGripY, frontTargetX, frontTargetY, 23.5);
            drawArmSegment(frontShoulderGripX, frontShoulderGripY, frontHand.x, frontHand.y, 5.2);
            drawHand(frontHand.x, frontHand.y, 5.0);
        } else if (this.subWeaponAction === '二刀_Z') {
            // 二刀の通常連撃（Z）：二本の刀で多方向へ連続斬り
            const blade = dualBlade;
            const pose = (blade && typeof blade.getMainSwingPose === 'function')
                ? blade.getMainSwingPose()
                : { comboIndex: 0, progress, rightAngle: -0.32, leftAngle: 2.2 };
            const comboStep = pose.comboIndex || 0;
            const comboProgress = pose.progress || 0;
            const comboWave = Math.sin(comboProgress * Math.PI);
            const comboPulse = Math.sin(comboProgress * Math.PI * 2.0);
            const strike = comboProgress < 0.54
                ? comboProgress / 0.54
                : (1 - ((comboProgress - 0.54) / 0.46));
            const recover = Math.max(0, (comboProgress - 0.62) / 0.38);

            let rightShoulderX = backShoulderX + dir * 0.9;
            let rightShoulderY = shoulderY - 0.9;
            let leftShoulderX = frontShoulderX - dir * 0.8;
            let leftShoulderY = shoulderY + 1.2;

            let rightReach = 22.2;
            let leftReach = 21.6;
            let rightTargetX = rightShoulderX + Math.cos(pose.rightAngle) * rightReach * dir;
            let rightTargetY = rightShoulderY + Math.sin(pose.rightAngle) * rightReach;
            let leftTargetX = leftShoulderX + Math.cos(pose.leftAngle) * leftReach * dir;
            let leftTargetY = leftShoulderY + Math.sin(pose.leftAngle) * leftReach;

            if (comboStep === 1) {
                // 一段: 右の抜き打ち、左は添え手で追従
                rightShoulderX += dir * (2.2 + comboWave * 1.4);
                leftShoulderX += dir * (0.8 + comboWave * 0.5);
                rightTargetX += dir * (7.8 + strike * 10.2);
                rightTargetY -= 2.4 + strike * 2.8;
                leftTargetX -= dir * (2.0 + strike * 3.8);
                leftTargetY += 1.0 + recover * 2.6;
            } else if (comboStep === 2) {
                // 二段: 引いて溜め→逆袈裟で返す
                const prep = Math.max(0, Math.min(1, comboProgress / 0.4));
                const snap = Math.max(0, Math.min(1, (comboProgress - 0.4) / 0.6));
                rightShoulderX -= dir * (1.8 + comboWave * 1.8);
                leftShoulderX -= dir * (2.6 + comboWave * 2.2);
                rightTargetX -= dir * (5.0 + prep * 4.6 - snap * 4.2);
                rightTargetY += 1.4 + prep * 2.4 - snap * 3.0;
                leftTargetX -= dir * (5.6 + prep * 6.0);
                leftTargetY -= 2.2 + snap * 3.2;
            } else if (comboStep === 3) {
                // 三段: クロスステップで左右へ払う
                rightShoulderX += dir * (comboPulse * 2.0);
                leftShoulderX -= dir * (comboPulse * 2.0);
                rightTargetX += dir * (-8.0 + comboProgress * 22.0);
                leftTargetX -= dir * (-6.5 + comboProgress * 20.0);
                rightTargetY = rightShoulderY + 2.4 + comboPulse * 0.9;
                leftTargetY = leftShoulderY + 2.9 - comboPulse * 0.9;
            } else if (comboStep === 4) {
                // 四段: 跳躍しつつ頭上で交叉
                rightShoulderY -= 2.6 + comboWave * 2.8;
                leftShoulderY -= 2.4 + comboWave * 2.6;
                rightReach = 26.0;
                leftReach = 25.0;
                rightTargetX += dir * (2.6 + comboWave * 6.0);
                leftTargetX -= dir * (2.2 + comboWave * 5.6);
                rightTargetY -= 5.2 + comboWave * 4.8;
                leftTargetY -= 4.8 + comboWave * 4.4;
            } else if (comboStep === 0) {
                // 五段: 頭上構えから落下断ち
                rightReach = 24.2;
                leftReach = 23.0;
                if (comboProgress < 0.35) {
                    const t = comboProgress / 0.35;
                    rightShoulderY -= 3.2 + t * 3.2;
                    leftShoulderY -= 3.0 + t * 3.0;
                    rightTargetX += dir * (2.2 + t * 3.0);
                    leftTargetX -= dir * (2.0 + t * 2.8);
                    rightTargetY -= 6.0 + t * 7.4;
                    leftTargetY -= 5.2 + t * 6.8;
                } else {
                    const t = (comboProgress - 0.35) / 0.65;
                    rightShoulderY -= 6.4 - t * 2.4;
                    leftShoulderY -= 6.0 - t * 2.1;
                    rightTargetX += dir * (5.0 + t * 7.2);
                    leftTargetX -= dir * (3.2 + t * 4.6);
                    rightTargetY -= 13.4 - t * 20.6;
                    leftTargetY -= 11.8 - t * 17.6;
                }
            }

            // 肩位置を動かした分だけ手先ターゲットも追従
            rightTargetX += rightShoulderX - (backShoulderX + dir * 0.9);
            rightTargetY += rightShoulderY - (shoulderY - 0.9);
            leftTargetX += leftShoulderX - (frontShoulderX - dir * 0.8);
            leftTargetY += leftShoulderY - (shoulderY + 1.2);
            rightTargetX += Math.cos(pose.rightAngle) * (rightReach - 22.2) * dir;
            rightTargetY += Math.sin(pose.rightAngle) * (rightReach - 22.2);
            leftTargetX += Math.cos(pose.leftAngle) * (leftReach - 21.6) * dir;
            leftTargetY += Math.sin(pose.leftAngle) * (leftReach - 21.6);

            const rightHand = clampArmReach(rightShoulderX, rightShoulderY, rightTargetX, rightTargetY, 24.6);
            const leftHand = clampArmReach(leftShoulderX, leftShoulderY, leftTargetX, leftTargetY, 22.8);
            drawArmSegment(rightShoulderX, rightShoulderY, rightHand.x, rightHand.y, 5.6);
            drawArmSegment(leftShoulderX, leftShoulderY, leftHand.x, leftHand.y, 5.4);
            drawHand(rightHand.x, rightHand.y, 5.0);
            drawHand(leftHand.x, leftHand.y, 4.9);

            if (renderWeaponVisuals) {
                this.drawKatana(ctx, leftHand.x, leftHand.y, pose.leftAngle, dir);
                this.drawKatana(ctx, rightHand.x, rightHand.y, pose.rightAngle, dir);
            }
        } else if (this.subWeaponAction === '二刀_合体') {
            // 目の前でクロスした状態から、そのまま振り下ろす
            const clamped = Math.min(1, Math.max(0, progress));
            const crossPhase = 0.34;
            const isCrossPhase = clamped < crossPhase;
            const t = isCrossPhase ? (clamped / crossPhase) : ((clamped - crossPhase) / (1 - crossPhase));
            const comboBackShoulderX = backShoulderX;
            const comboFrontShoulderX = frontShoulderX;
            const comboShoulderY = shoulderY;

            let rightX, leftX, rightY, leftY;
            let rightAngle, leftAngle;
            if (isCrossPhase) {
                const gather = t;
                const ease = gather * gather * (3 - 2 * gather);
                rightX = centerX + dir * (9 - ease * 6);
                leftX = centerX - dir * (7 - ease * 4.5);
                rightY = pivotY + 18 - ease * 8;
                leftY = pivotY + 17 - ease * 6;
                // 交差点を体の前方に置き、刀身中央あたりでクロスさせる
                const crossTargetX = centerX + dir * (38 + ease * 4);
                const crossTargetY = pivotY - (6 + ease * 1.5);
                rightAngle = Math.atan2(crossTargetY - rightY, (crossTargetX - rightX) * dir);
                leftAngle = Math.atan2(crossTargetY - leftY, (crossTargetX - leftX) * dir);
            } else {
                const sweep = t;
                const spread = Math.pow(sweep, 0.6);
                const fastSweepR = Math.min(1, sweep * 2.0);
                const fastSweepL = Math.min(1, sweep * 1.9);
                rightX = centerX + dir * (1 + spread * 17);
                leftX = centerX - dir * (1 + spread * 15);
                rightY = pivotY + 13 + fastSweepR * 11;
                leftY = pivotY + 13 + fastSweepL * 9;
                // クロス角から左右へ開いて斜め下へ振り抜く
                const crossTargetX = centerX + dir * (42 + sweep * 3);
                const crossTargetY = pivotY - 6 + sweep * 8;
                const fromCrossRight = Math.atan2(crossTargetY - rightY, (crossTargetX - rightX) * dir);
                const fromCrossLeft = Math.atan2(crossTargetY - leftY, (crossTargetX - leftX) * dir);
                const rightEase = Math.pow(sweep, 0.74);
                const leftEase = Math.pow(sweep, 0.70);
                const rightEndAngle = 1.22;
                const leftEndAngle = 2.16;
                rightAngle = fromCrossRight + (rightEndAngle - fromCrossRight) * rightEase;
                leftAngle = fromCrossLeft + (leftEndAngle - fromCrossLeft) * leftEase;
            }

            // 終端で腕が伸びすぎないように上限を設ける
            const rightClamped = clampArmReach(comboBackShoulderX, comboShoulderY - 1, rightX, rightY, 23);
            rightX = rightClamped.x;
            rightY = rightClamped.y;
            const leftClamped = clampArmReach(comboFrontShoulderX, comboShoulderY, leftX, leftY, 21);
            leftX = leftClamped.x;
            leftY = leftClamped.y;

            drawArmSegment(comboBackShoulderX, comboShoulderY - 1, rightX, rightY, 5.4);
            drawArmSegment(comboFrontShoulderX, comboShoulderY, leftX, leftY, 5.4);
            drawHand(rightX, rightY, 5);
            drawHand(leftX, leftY, 5);

            // 奥(左手) -> 手前(右手)の順で描き、こちら向きの奥行きを作る
            if (renderWeaponVisuals) {
                this.drawKatana(ctx, leftX, leftY, leftAngle, dir);
                this.drawKatana(ctx, rightX, rightY, rightAngle, dir);
            }
        } else if (this.subWeaponAction === '大太刀') {
            // 大太刀: 武器側ポーズと同一アンカーを使用して手と柄を一致
            const odachi = (this.currentSubWeapon && this.currentSubWeapon.name === '大太刀') ? this.currentSubWeapon : null;
            const anchor = (odachi && typeof odachi.getHandAnchor === 'function')
                ? odachi.getHandAnchor(this)
                : { x: centerX + dir * 2, y: pivotY - 2, rotation: dir * (-Math.PI * 0.5), direction: dir };
            const weaponDirX = Math.cos(anchor.rotation);
            const weaponDirY = Math.sin(anchor.rotation);

            const leadHand = clampArmReach(backShoulderX, shoulderY, anchor.x, anchor.y, 24.5);
            drawArmSegment(backShoulderX, shoulderY, leadHand.x, leadHand.y, 6);
            drawHand(leadHand.x, leadHand.y, 5);

            // 本体の手前に持つ見た目を作るため、奥手の後に大太刀を描く
            if (renderWeaponVisuals && odachi && typeof odachi.render === 'function') {
                odachi.render(ctx, this);
                this.subWeaponRenderedInModel = true;
            }

            const supportTargetX = anchor.x - weaponDirX * 10 + (-weaponDirY) * 1.2;
            const supportTargetY = anchor.y - weaponDirY * 10 + weaponDirX * 1.2;
            const supportHand = clampArmReach(frontShoulderX, shoulderY + 1, supportTargetX, supportTargetY, 21.5);
            drawArmSegment(frontShoulderX, shoulderY + 1, supportHand.x, supportHand.y, 5.1);
            drawHand(supportHand.x, supportHand.y, 4.6);
        } else if (this.subWeaponAction === '鎖鎌') {
            // 鎖鎌は手前手で保持
            const kusa = (this.currentSubWeapon && this.currentSubWeapon.name === '鎖鎌') ? this.currentSubWeapon : null;
            const anchor = (kusa && typeof kusa.getHandAnchor === 'function')
                ? kusa.getHandAnchor(this)
                : { x: centerX + dir * 13, y: pivotY + 8, progress };
            const phase = anchor.phase || 'orbit';
            const phaseT = anchor.phaseT || 0;
            const shoulderShiftX =
                phase === 'extend' ? dir * 0.6 :
                (phase === 'orbit' ? dir * (0.9 + Math.sin(phaseT * Math.PI) * 0.45) : dir * 0.3);
            const shoulderShiftY =
                phase === 'orbit' ? -0.9 : (phase === 'retract' ? -0.3 : 0.2);
            const armMaxLen =
                phase === 'extend' ? 25.5 :
                (phase === 'orbit' ? 27.5 : 24.8);
            const swingShoulderX = frontShoulderX + shoulderShiftX;
            const swingShoulderY = shoulderY + 1 + shoulderShiftY;
            const mainHand = clampArmReach(swingShoulderX, swingShoulderY, anchor.x, anchor.y, armMaxLen);
            drawArmSegment(swingShoulderX, swingShoulderY, mainHand.x, mainHand.y, 5.5);
            drawHand(mainHand.x, mainHand.y, 5);

            // 鎖鎌中でも奥手の刀は保持し続ける
            drawSupportPose(centerX + dir * 12, pivotY + 10, true, -0.55, dir, true);
        } else {
            // その他（デフォルト突き）
            const armEndX = centerX + dir * 20;
            const armEndY = pivotY + 5;
            drawArmSegment(backShoulderX, shoulderY, armEndX, armEndY, 6);
            drawHand(armEndX, armEndY, 5);
            drawSupportPose(centerX - dir * 8, pivotY + 12);
        }
        
        ctx.restore();
    }

    renderAttackArmAndWeapon(ctx, {
        centerX,
        pivotY,
        facingRight,
        backShoulderX = centerX,
        backShoulderY = pivotY,
        frontShoulderX = centerX,
        frontShoulderY = pivotY + 1,
        supportFrontHand = true
    }) {
        const attack = this.currentAttack;
        if (!attack) {
            return;
        }
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const rawProgress = Math.max(0, Math.min(1, 1 - (this.attackTimer / attackDuration)));
        const progress = this.getAttackMotionProgress(attack, rawProgress);
        const dir = facingRight ? 1 : -1;
        const easeOut = 1 - Math.pow(1 - progress, 2);
        const easeIn = progress * progress;
        const easeInOut = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        let swordAngle = 0;
        let armEndX = centerX + dir * 14;
        let armEndY = pivotY + 6;
        let trail = null;
        let activeBackShoulderX = backShoulderX;
        let activeBackShoulderY = backShoulderY;
        let activeFrontShoulderX = frontShoulderX;
        let activeFrontShoulderY = frontShoulderY;

        if (attack.comboStep) {
            switch (attack.comboStep) {
                case 1:
                    // 影走り袈裟（前へ踏み込みつつ斜めに薙ぐ）
                    swordAngle = 2.6 - 2.56 * easeOut;
                    armEndX = centerX + dir * (6 + easeOut * 26);
                    armEndY = pivotY + 9 - easeOut * 5.2;
                    trail = { mode: 'arc', originX: -20, originY: 4, radius: 82, start: 2.36, end: -0.2, width: 14.8, front: [130, 234, 255], back: [76, 154, 226] };
                    break;
                case 2:
                    // 閃返し（腰を返して逆方向へ）
                    swordAngle = 0.48 + 1.96 * easeInOut;
                    armEndX = centerX + dir * (18 - easeInOut * 30);
                    armEndY = pivotY - 1 + easeInOut * 13.4;
                    trail = { mode: 'arc', originX: -4, originY: -3, radius: 92, start: 0.44, end: 2.38, width: 15.6, front: [112, 222, 255], back: [70, 132, 212] };
                    break;
                case 3:
                    // 燕返横薙ぎ（奥行き付きの水平切り）
                    swordAngle = -0.22 + Math.sin(progress * Math.PI) * 0.34;
                    armEndX = centerX + dir * (-10 + easeInOut * 36);
                    armEndY = pivotY + 5 - Math.sin(progress * Math.PI) * 9.2;
                    trail = { mode: 'depthSlice', length: 146, spread: 18, lift: 18, front: [122, 230, 255], back: [72, 138, 220], width: 15.4 };
                    break;
                case 4:
                    // 四ノ太刀: 天穿斬り上げ（真上へ上昇→後方バク転）
                    if (progress < 0.42) {
                        const t = progress / 0.42;
                        swordAngle = 1.32 - 2.06 * t;
                        armEndX = centerX + dir * (8.0 + Math.sin(t * Math.PI) * 1.2);
                        armEndY = pivotY + 22 - t * 36;
                        trail = { mode: 'arc', originX: -6, originY: 21, radius: 96, start: 1.58, end: -1.58, width: 17.2, front: [162, 248, 255], back: [86, 150, 232] };
                    } else {
                        const flipT = Math.max(0, Math.min(1, (progress - 0.42) / 0.58));
                        const bodyFlipAngle = -Math.PI * 1.82 * flipT;
                        swordAngle = -0.76 + bodyFlipAngle;
                        armEndX = centerX - dir * (4.0 + Math.sin(flipT * Math.PI) * 6.0);
                        armEndY = pivotY - 10 + Math.cos(flipT * Math.PI) * 3.0;
                        trail = { mode: 'followSlash', width: 13.6, front: [160, 246, 255], back: [88, 152, 232] };
                    }
                    break;
                case 5:
                    // 五ノ太刀: 頭上から水平へ叩きつける落下
                    {
                        if (progress < 0.26) {
                            const t = progress / 0.26;
                            swordAngle = -1.45 + t * 0.3;
                            armEndX = centerX + dir * (2 + t * 4);
                            armEndY = pivotY - 12 - t * 7;
                            trail = null;
                        } else if (progress < 0.78) {
                            const t = (progress - 0.26) / 0.52;
                            swordAngle = -1.15 + t * 2.2;
                            armEndX = centerX + dir * (6 + t * 20);
                            armEndY = pivotY - 19 + t * 36;
                            trail = { mode: 'arc', originX: -16, originY: -2, radius: 100, start: -1.26, end: 1.12, width: 17.4, front: [176, 248, 255], back: [96, 160, 236] };
                        } else {
                            const t = (progress - 0.78) / 0.22;
                            swordAngle = 1.05 - t * 0.52;
                            armEndX = centerX + dir * (26 - t * 8);
                            armEndY = pivotY + 17 - t * 4;
                            trail = { mode: 'followSlash', width: 13.2, front: [174, 246, 255], back: [94, 158, 236] };
                        }
                    }
                    break;
                default:
                    break;
            }
        } else {
            switch (attack.type) {
                case ANIM_STATE.ATTACK_SLASH:
                    swordAngle = (progress - 0.5) * Math.PI;
                    armEndX = centerX + dir * 15;
                    armEndY = pivotY + 5;
                    break;
                case ANIM_STATE.ATTACK_UPPERCUT:
                    swordAngle = Math.PI / 2 - progress * Math.PI;
                    armEndX = centerX + dir * 12;
                    armEndY = pivotY - 5;
                    break;
                case ANIM_STATE.ATTACK_THRUST:
                    swordAngle = 0;
                    armEndX = centerX + dir * (10 + progress * 20);
                    armEndY = pivotY + 5;
                    break;
                case ANIM_STATE.ATTACK_SPIN:
                    swordAngle = progress * Math.PI * 2;
                    armEndX = centerX + Math.cos(swordAngle) * 10;
                    armEndY = pivotY + Math.sin(swordAngle) * 10;
                    break;
                case ANIM_STATE.ATTACK_DOWN:
                    swordAngle = -Math.PI / 2 + progress * Math.PI;
                    armEndX = centerX + dir * 15;
                    armEndY = pivotY;
                    break;
                default:
                    break;
            }
        }

        // 奥手（主動作）: 付け根を固定して描画
        ctx.strokeStyle = COLORS.PLAYER;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(activeBackShoulderX, activeBackShoulderY);
        ctx.lineTo(armEndX, armEndY);
        ctx.stroke();

        // 手を上書きで描画
        ctx.fillStyle = COLORS.PLAYER; // COLORS.PLAYER_GI から修正
        ctx.beginPath();
        ctx.arc(armEndX, armEndY, 6, 0, Math.PI * 2);
        ctx.fill();

        const rot = swordAngle;
        const swordLen = this.getKatanaBladeLength(); // 見た目の刀身長は常に統一（当たり判定rangeとは分離）

        // 手前手が空いている場合は添え手にする（両手持ち）
        if (supportFrontHand) {
            const clampArmReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
                const dx = targetX - shoulderX;
                const dy = targetY - shoulderY;
                const dist = Math.hypot(dx, dy);
                if (dist <= maxLen || dist === 0) {
                    return { x: targetX, y: targetY };
                }
                const ratio = maxLen / dist;
                return {
                    x: shoulderX + dx * ratio,
                    y: shoulderY + dy * ratio
                };
            };

            const bladeDirX = Math.cos(rot) * dir;
            const bladeDirY = Math.sin(rot);
            const perpX = -bladeDirY;
            const perpY = bladeDirX;
            const supportTargetX = armEndX - bladeDirX * 6.2 + perpX * 1.0;
            const supportTargetY = armEndY - bladeDirY * 6.2 + perpY * 1.0;
            const supportHand = clampArmReach(activeFrontShoulderX, activeFrontShoulderY, supportTargetX, supportTargetY, 22);

            ctx.strokeStyle = COLORS.PLAYER;
            ctx.lineWidth = 5.1;
            ctx.beginPath();
            ctx.moveTo(activeFrontShoulderX, activeFrontShoulderY);
            ctx.lineTo(supportHand.x, supportHand.y);
            ctx.stroke();

            ctx.fillStyle = COLORS.PLAYER; // COLORS.PLAYER_GI から修正
            ctx.beginPath();
            ctx.arc(supportHand.x, supportHand.y, 4.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // 剣を描画
        ctx.save();
        ctx.translate(armEndX, armEndY);
        ctx.scale(facingRight ? 1 : -1, 1); // 左右反転
        ctx.rotate(rot);
        
        // 刀身（通常時と同一の形状）
        ctx.fillStyle = '#111';
        ctx.fillRect(-1.2, -2.2, 3.0, 4.4);
        ctx.fillStyle = '#c9a545';
        ctx.fillRect(1.45, -1.7, 1.25, 3.4);

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(1.2, -1.2);
        ctx.lineTo(swordLen - 2.8, -1.2);
        ctx.lineTo(swordLen, 0);
        ctx.quadraticCurveTo(swordLen - 8.0, 1.65, 1.2, 1.0);
        ctx.fill();

        ctx.fillStyle = '#b7b7b7';
        ctx.beginPath();
        ctx.moveTo(2.2, -0.45);
        ctx.lineTo(swordLen - 10.5, -0.45);
        ctx.quadraticCurveTo(swordLen - 14.0, 0.1, 2.2, 0.28);
        ctx.fill();

        // 斬撃エフェクト（大きく、派手に）
        
        const swingAlpha = Math.max(0.08, 1 - rawProgress);
        const colorRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
        const drawDepthArc = (arc) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.86;
            const counterClockwise = arc.end < arc.start;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 12;
            ctx.shadowColor = colorRgba(arc.front, frontAlpha * 0.5);

            ctx.strokeStyle = colorRgba(arc.back, backAlpha);
            ctx.lineWidth = arc.width * 0.72;
            ctx.beginPath();
            ctx.arc(arc.originX - 6, arc.originY - 3, arc.radius * 0.92, arc.start + 0.1, arc.end + 0.12, counterClockwise);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(arc.front, frontAlpha);
            ctx.lineWidth = arc.width;
            ctx.beginPath();
            ctx.arc(arc.originX, arc.originY, arc.radius, arc.start, arc.end, counterClockwise);
            ctx.stroke();

            ctx.strokeStyle = `rgba(255, 255, 255, ${frontAlpha * 0.48})`;
            ctx.lineWidth = Math.max(1.6, arc.width * 0.2);
            ctx.beginPath();
            ctx.arc(arc.originX + 1.4, arc.originY - 1.2, arc.radius - 2.5, arc.start + 0.05, arc.end + 0.04, counterClockwise);
            ctx.stroke();
            ctx.restore();
        };
        const drawDepthSlice = (slice) => {
            const backAlpha = swingAlpha * 0.32;
            const frontAlpha = swingAlpha * 0.9;
            const length = slice.length || 108;
            const spread = slice.spread || 12;
            const lift = slice.lift || 12;
            const width = slice.width || 13;

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.strokeStyle = colorRgba(slice.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.moveTo(-length * 0.26, -spread * 0.95);
            ctx.quadraticCurveTo(length * 0.22, -lift * 1.05, length, spread * 0.3);
            ctx.stroke();

            ctx.strokeStyle = colorRgba(slice.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.shadowBlur = 12;
            ctx.shadowColor = colorRgba(slice.front, frontAlpha * 0.5);
            ctx.beginPath();
            ctx.moveTo(-length * 0.2, spread * 0.95);
            ctx.quadraticCurveTo(length * 0.28, lift * 1.05, length * 0.98, -spread * 0.2);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(255, 255, 255, ${frontAlpha * 0.5})`;
            ctx.lineWidth = Math.max(1.6, width * 0.2);
            ctx.beginPath();
            ctx.moveTo(-length * 0.16, spread * 0.55);
            ctx.quadraticCurveTo(length * 0.24, lift * 0.72, length * 0.92, -spread * 0.14);
            ctx.stroke();
            ctx.restore();
        };
        const drawFollowSlash = (slash) => {
            const backAlpha = swingAlpha * 0.32;
            const frontAlpha = swingAlpha * 0.88;
            const width = slash.width || 13;
            const trailLen = 52;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 12;
            ctx.shadowColor = colorRgba(slash.front, frontAlpha * 0.52);
            ctx.strokeStyle = colorRgba(slash.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.moveTo(swordLen - trailLen, -7.5);
            ctx.quadraticCurveTo(swordLen - trailLen * 0.44, -2.2, swordLen + 2, 1.2);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(swordLen - trailLen * 0.88, -4.1);
            ctx.quadraticCurveTo(swordLen - trailLen * 0.36, 0.5, swordLen + 6, 3.6);
            ctx.stroke();
            ctx.restore();
        };

        if (trail && trail.mode === 'arc') {
            drawDepthArc(trail);
        } else if (trail && trail.mode === 'depthSlice') {
            drawDepthSlice(trail);
        } else if (trail && trail.mode === 'followSlash') {
            drawFollowSlash(trail);
        } else if (trail && trail.mode === 'thrust') {
            const alpha = swingAlpha * 0.95;
            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = colorRgba(trail.front, alpha * 0.58);
            ctx.fillStyle = colorRgba(trail.back, alpha * 0.38);
            ctx.beginPath();
            ctx.moveTo(swordLen - 2, -14);
            ctx.lineTo(swordLen + 34, -5.5);
            ctx.lineTo(swordLen + 34, 5.5);
            ctx.lineTo(swordLen - 2, 14);
            ctx.lineTo(swordLen + 6, 0);
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = colorRgba(trail.front, alpha);
            ctx.beginPath();
            ctx.moveTo(swordLen + 1, -9.5);
            ctx.lineTo(swordLen + 42, -2.6);
            ctx.lineTo(swordLen + 42, 2.6);
            ctx.lineTo(swordLen + 1, 9.5);
            ctx.lineTo(swordLen + 10, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else if (attack.type === ANIM_STATE.ATTACK_THRUST) {
            const alpha = swingAlpha;
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = `rgba(100, 255, 255, ${alpha})`;
            ctx.fillStyle = `rgba(100, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(swordLen, -25);
            ctx.bezierCurveTo(swordLen + 20, -10, swordLen + 20, 10, swordLen, 25);
            ctx.bezierCurveTo(swordLen + 10, 10, swordLen + 10, -10, swordLen, -25);
            ctx.fill();
            ctx.restore();
        } else {
            ctx.strokeStyle = `rgba(100, 200, 255, ${0.8 * swingAlpha})`;
            ctx.lineWidth = 15;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const normalSlashRadius = 80;
            if (attack.type === ANIM_STATE.ATTACK_SPIN) {
                ctx.arc(0, 0, normalSlashRadius, 0, Math.PI * 2);
            } else if (attack.isLaunch) {
                ctx.arc(-20, 0, normalSlashRadius, -Math.PI * 0.4, Math.PI * 0.4, true);
            } else {
                ctx.arc(-10, 0, normalSlashRadius, -0.8, 0.8);
            }
            ctx.stroke();
        }

        ctx.restore();

    }

    getAttackMotionProgress(attack, rawProgress) {
        const p = Math.max(0, Math.min(1, rawProgress));
        if (!attack || !attack.comboStep) return p;

        const lerp = (a, b, t) => a + (b - a) * t;
        const smooth = (t) => t * t * (3 - 2 * t);

        switch (attack.comboStep) {
            case 1: {
                // 初段: 小さく溜めて重く振り下ろす
                if (p < 0.34) return lerp(0, 0.2, smooth(p / 0.34));
                if (p < 0.54) return lerp(0.2, 0.9, smooth((p - 0.34) / 0.2));
                return lerp(0.9, 1.0, smooth((p - 0.54) / 0.46));
            }
            case 2: {
                // 二段: ためを強めに入れて返し斬り
                if (p < 0.38) return lerp(0, 0.22, smooth(p / 0.38));
                if (p < 0.6) return lerp(0.22, 0.9, smooth((p - 0.38) / 0.22));
                return lerp(0.9, 1.0, smooth((p - 0.6) / 0.4));
            }
            case 3: {
                // 三段: しっかり溜め -> 回転横薙ぎを一気に
                if (p < 0.46) return lerp(0, 0.28, smooth(p / 0.46));
                if (p < 0.64) return lerp(0.28, 0.92, smooth((p - 0.46) / 0.18));
                return lerp(0.92, 1.0, smooth((p - 0.64) / 0.36));
            }
            case 4: {
                // 四段: 上昇 -> 宙返り
                if (p < 0.32) return lerp(0, 0.58, smooth(p / 0.32));
                if (p < 0.84) return lerp(0.58, 0.92, smooth((p - 0.32) / 0.52));
                return lerp(0.92, 1.0, smooth((p - 0.84) / 0.16));
            }
            case 5: {
                // 五段: 頭上構え -> 急降下 -> 着地余韻
                if (p < 0.26) return lerp(0, 0.16, smooth(p / 0.26));
                if (p < 0.78) return lerp(0.16, 0.92, smooth((p - 0.26) / 0.52));
                return lerp(0.92, 1.0, smooth((p - 0.78) / 0.22));
            }
            default:
                return p;
        }
    }
    
    renderSpecial(ctx) {
        const anchors = this.getSpecialCloneAnchors();

        ctx.save();

        // 分身出現中（詠唱中）もニンニン印ポーズで描画
        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                this.renderSpecialCastPose(
                    ctx,
                    anchor.x - this.width * 0.5,
                    anchor.y - this.height * 0.62,
                    anchor.facingRight,
                    anchor.alpha
                );
            }
        } else if (this.isSpecialCloneCombatActive()) {
            // 分身（本体の左右に等間隔で2体ずつ）
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                const wobble = Math.sin(this.motionTime * 0.006 + anchor.index * 1.1) * 0.26;
                const x = anchor.x + wobble;
                const y = anchor.y;
                const invincible = (this.specialCloneInvincibleTimers[anchor.index] || 0) > 0;
                const cloneAlpha = invincible && Math.floor(this.specialCloneInvincibleTimers[anchor.index] / 70) % 2 === 0
                    ? anchor.alpha * 0.7
                    : anchor.alpha;
                ctx.save();
                const mist = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 34);
                mist.addColorStop(0, `rgba(180, 214, 246, ${cloneAlpha * 0.28})`);
                mist.addColorStop(1, 'rgba(180, 214, 246, 0)');
                ctx.fillStyle = mist;
                ctx.beginPath();
                ctx.arc(x, y - 14, 34, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // 分身の攻撃状態攻撃タイマーが動いているなら攻撃中
                const isCloneAttacking = (this.specialCloneAttackTimers[anchor.index] || 0) > 0;
                
                // 分身用の独立した状態オブジェクトを作成
                const cloneState = {
                    x: anchor.x - this.width / 2, // 描画座標用の補正
                    y: anchor.y - this.height * 0.62,
                    facingRight: anchor.facingRight, // 分身の向き
                    vx: 0, 
                    isGrounded: true,
                    isAttacking: isCloneAttacking,
                    currentAttack: isCloneAttacking ? { 
                        comboStep: (this.specialCloneComboSteps[anchor.index] || 0) + 1,
                        durationMs: 420,
                        range: 90
                    } : null,
                    attackTimer: isCloneAttacking ? this.specialCloneAttackTimers[anchor.index] : 0,
                    subWeaponTimer: this.specialCloneSubWeaponTimers[anchor.index] || 0,
                    subWeaponAction: this.specialCloneSubWeaponActions[anchor.index] || null,
                    // 本体の状態が混入しないように明示的に上書き
                    isCrouching: false,
                    isDashing: false,
                    motionTime: (this.specialCloneAttackTimers[anchor.index] || this.specialCloneSubWeaponTimers[anchor.index] || 0) * 0.5 // モーションも攻撃タイマー依存に
                };

                this.renderModel(
                    ctx,
                    x - this.width * 0.5, // 呼び出し側でanchor位置補正済みなら不要かもしれないが、既存コードに合わせる
                    y - this.height * 0.62, 
                    anchor.facingRight,
                    cloneAlpha,
                    true,
                    { 
                        useLiveAccessories: false, 
                        renderHeadbandTail: true,
                        state: cloneState // ここで渡したstateがrenderModel内でthisの代わりに使われる
                    }
                );
                const isCloneSubWeaponAttacking = (this.specialCloneSubWeaponTimers[anchor.index] || 0) > 0;
                const shouldRenderWeapon = 
                    (this.currentSubWeapon && typeof this.currentSubWeapon.render === 'function') &&
                    ((this.subWeaponTimer > 0 || (this.currentSubWeapon.name === '二刀流' && this.currentSubWeapon.isAttacking)) || isCloneAttacking || isCloneSubWeaponAttacking);

                if (shouldRenderWeapon) {
                    const prevRenderedFlag = this.subWeaponRenderedInModel;
                    ctx.save();
                    ctx.globalAlpha *= cloneAlpha;
                    
                    if (isCloneAttacking || isCloneSubWeaponAttacking) {
                        // 分身独自の攻撃（メインまたはサブ）
                        const proxyPlayer = Object.create(this);
                        proxyPlayer.x = x - this.width / 2;
                        proxyPlayer.y = y - this.height * 0.62;
                        proxyPlayer.facingRight = anchor.facingRight;
                        Object.assign(proxyPlayer, cloneState);
                        
                        this.currentSubWeapon.render(ctx, proxyPlayer, {
                            attackTimer: isCloneAttacking ? this.specialCloneAttackTimers[anchor.index] : this.specialCloneSubWeaponTimers[anchor.index],
                            comboIndex: this.specialCloneComboSteps[anchor.index],
                            attackType: isCloneSubWeaponAttacking ? 'sub' : 'main', 
                            forceDraw: true // isAttackingチェックをバイパスさせるため
                        });
                    } else {
                        // 本体の攻撃に追従
                        ctx.translate(x - (this.x + this.width * 0.5), y - (this.y + this.height * 0.55));
                        this.currentSubWeapon.render(ctx, this);
                    }

                    ctx.restore();
                    this.subWeaponRenderedInModel = prevRenderedFlag;
                }
            }
        }

        // 忍術ドロン煙
        for (const puff of this.specialSmoke) {
            const life = Math.max(0, Math.min(1, puff.life / puff.maxLife));
            const alpha = (puff.mode === 'appear' ? 0.42 : 0.33) * life;
            ctx.fillStyle = `rgba(206, 236, 252, ${alpha})`;
            ctx.beginPath();
            ctx.arc(puff.x, puff.y, puff.radius * (0.7 + (1 - life) * 0.65), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    renderSpecialCastPose(ctx, x, y, facingRight, alpha = 1.0) {
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        const silhouette = '#1a1a1a';
        const accent = '#00bfff';
        const castPulse = Math.sin(this.motionTime * 0.03) * 1.2;
        const headY = y + 16 + castPulse * 0.2;
        const hipY = bottomY - 20;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = silhouette;
        ctx.fillStyle = silhouette;
        ctx.lineCap = 'round';

        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(centerX + dir * 0.4, headY + 8);
        ctx.lineTo(centerX - dir * 0.2, hipY);
        ctx.stroke();

        ctx.lineWidth = 4.4;
        ctx.beginPath();
        ctx.moveTo(centerX - dir * 0.9, hipY);
        ctx.lineTo(centerX - dir * 2.2, bottomY);
        ctx.moveTo(centerX + dir * 0.9, hipY);
        ctx.lineTo(centerX + dir * 2.1, bottomY - 0.3);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(centerX, headY, 14, 0, Math.PI * 2);
        ctx.fill();

        // ニンニン印: 手先の丸を上下に重ね、上側の指を1本立てる
        const palmX = centerX + dir * 0.2;
        const lowerHandY = headY + 11.8;
        const upperHandY = lowerHandY - 4.2;
        ctx.lineWidth = 5.0;
        ctx.beginPath();
        ctx.moveTo(centerX + dir * 4.1, headY + 14.0);
        ctx.lineTo(palmX, lowerHandY);
        ctx.moveTo(centerX - dir * 3.9, headY + 13.7);
        ctx.lineTo(palmX, upperHandY);
        ctx.stroke();

        ctx.fillStyle = '#0f0f0f';
        ctx.beginPath();
        ctx.arc(palmX, lowerHandY, 4.0, 0, Math.PI * 2);
        ctx.arc(palmX, upperHandY, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = silhouette;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(palmX + dir * 1.15, upperHandY - 3.3);
        ctx.lineTo(palmX + dir * 1.15, upperHandY - 10.2);
        ctx.stroke();

        // 鉢巻
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(centerX - 12, headY - 3);
        ctx.lineTo(centerX + 12, headY - 5);
        ctx.stroke();

        // 鉢巻テール（分身詠唱ポーズでも表示）
        this.renderHeadbandTail(ctx, centerX, headY, facingRight, { forceStanding: true });

        ctx.restore();
    }

    renderHeadbandTail(ctx, headX, headY, facingRight, options = {}) {
        const forceStanding = options.forceStanding || false;
        const dir = facingRight ? 1 : -1;
        const knotX = headX + (facingRight ? -12.5 : 12.5);
        const knotY = headY - 4;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 結び目
        ctx.strokeStyle = '#00bfff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(knotX - 2, knotY);
        ctx.lineTo(knotX + 2, knotY);
        ctx.stroke();

        ctx.fillStyle = '#00bfff'; // 鮮やかな青

        if (forceStanding) {
            // 昇天時: 重力に従って真下に垂らす（少し揺らす程度）
            const time = Date.now() * 0.002;
            const sway = Math.sin(time) * 2.0;
            
            ctx.beginPath();
            ctx.moveTo(knotX, knotY);
            // 帯1
            ctx.quadraticCurveTo(
                knotX - dir * 2 + sway * 0.5,
                knotY + 14,
                knotX - dir * 4 + sway,
                knotY + 28
            );
            ctx.lineTo(knotX - dir * 1 + sway, knotY + 28);
            ctx.quadraticCurveTo(
                knotX + dir * 1 + sway * 0.5,
                knotY + 14,
                knotX,
                knotY + 4
            );
            // 帯2（少し短く）
            ctx.moveTo(knotX, knotY);
            ctx.quadraticCurveTo(
                knotX + dir * 1 - sway * 0.5,
                knotY + 12,
                knotX + dir * 2 - sway,
                knotY + 24
            );
            ctx.lineTo(knotX + dir * 5 - sway, knotY + 24);
            ctx.quadraticCurveTo(
                knotX + dir * 4 - sway * 0.5,
                knotY + 12,
                knotX,
                knotY + 4
            );
            ctx.fill();
            return;
        }

        // 通常時（物理シミュレーション）
        if (!this.headbandNodes || this.headbandNodes.length === 0) {
            // 初期化
            this.headbandNodes = [];
            const numNodes = 6;
            const segmentLength = 4;
            for (let i = 0; i < numNodes; i++) {
                this.headbandNodes.push({
                    x: knotX - dir * i * segmentLength,
                    y: knotY + i * 0.5,
                    oldX: knotX - dir * i * segmentLength,
                    oldY: knotY + i * 0.5,
                    pinX: i === 0 ? knotX : null,
                    pinY: i === 0 ? knotY : null
                });
            }
        }

        // 物理シミュレーションの更新
        const gravity = 0.1;
        const friction = 0.98;
        const stiffness = 0.5; // 紐の硬さ
        const segmentLength = 4;

        for (let i = 0; i < this.headbandNodes.length; i++) {
            const node = this.headbandNodes[i];
            if (node.pinX !== null && node.pinY !== null) {
                node.x = knotX; // knotX, knotY は renderHeadbandTail のローカル変数
                node.y = knotY;
                node.oldX = knotX;
                node.oldY = knotY;
                continue;
            }

            const vx = (node.x - node.oldX) * friction;
            const vy = (node.y - node.oldY) * friction;
            node.oldX = node.x;
            node.oldY = node.y;
            node.x += vx;
            node.y += vy;
            node.y += gravity; // 重力
        }

        // 拘束条件の適用 (棒の長さ)
        for (let iter = 0; iter < 5; iter++) { // 複数回繰り返して安定させる
            for (let i = 0; i < this.headbandNodes.length - 1; i++) {
                const node1 = this.headbandNodes[i];
                const node2 = this.headbandNodes[i + 1];

                const dist = Math.sqrt(Math.pow(node1.x - node2.x, 2) + Math.pow(node1.y - node2.y, 2));
                const diff = segmentLength - dist;
                const percent = diff / dist / 2 * stiffness;

                const offsetX = (node1.x - node2.x) * percent;
                const offsetY = (node1.y - node2.y) * percent;

                if (node1.pinX === null) {
                    node1.x += offsetX;
                    node1.y += offsetY;
                }
                if (node2.pinX === null) {
                    node2.x -= offsetX;
                    node2.y -= offsetY;
                }
            }
        }

        // 描画
        ctx.beginPath();
        ctx.moveTo(knotX, knotY);
        for (let i = 0; i < this.headbandNodes.length - 1; i++) {
            const node1 = this.headbandNodes[i];
            const node2 = this.headbandNodes[i + 1];
            const midX = (node1.x + node2.x) / 2;
            const midY = (node1.y + node2.y) / 2;
            if (i === 0) {
                ctx.lineTo(node1.x, node1.y);
            }
            ctx.quadraticCurveTo(node1.x, node1.y, midX, midY);
        }
        const lastNode = this.headbandNodes[this.headbandNodes.length - 1];
        ctx.lineTo(lastNode.x, lastNode.y);
        ctx.stroke(); // 輪郭線として描画

        // 塗りつぶし
        ctx.beginPath();
        ctx.moveTo(knotX, knotY + 0.3); // 結び目の少し下から開始
        const tailLen = 19; // 元のコードのtailLenを参考に
        const tailWave = Math.sin(this.motionTime * 0.012 + (facingRight ? 0 : 1.2)) * 1.35; // motionTimeはthisから取得
        const tailMidX = knotX - dir * (tailLen * 0.54);
        const tailMidY = knotY + tailWave - 0.4;
        const tailTipX = knotX - dir * tailLen;
        const tailTipY = knotY + tailWave * 0.6 + 0.8;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(knotX, knotY + 0.3);
        ctx.quadraticCurveTo(
            tailMidX + dir * 1.9,
            tailMidY - 2.2,
            tailTipX,
            tailTipY - 1.1
        );
        ctx.lineTo(tailTipX + dir * 0.7, tailTipY + 1.2);
        ctx.quadraticCurveTo(
            tailMidX + dir * 1.4,
            tailMidY + 2.9,
            knotX,
            knotY + 7.7
        );
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
    
    // 攻撃判定の取得（当たり判定用）
    getAttackHitbox(options = {}) {
        const state = options.state || this;
        const isAttacking = state.isAttacking !== undefined ? state.isAttacking : this.isAttacking;
        const currentAttack = state.currentAttack !== undefined ? state.currentAttack : this.currentAttack;
        const attackTimer = state.attackTimer !== undefined ? state.attackTimer : this.attackTimer;
        const x = state.x !== undefined ? state.x : this.x;
        const y = state.y !== undefined ? state.y : this.y;
        const facingRight = state.facingRight !== undefined ? state.facingRight : this.facingRight;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;

        if (!isAttacking || !currentAttack) return null;
        
        const attack = currentAttack;
        const range = attack.range || 90; // デフォルト値を安全のため設定
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const progress = Math.max(0, Math.min(1, 1 - (attackTimer / attackDuration)));
        
        // 回転斬り（全方位）
        if (attack.type === ANIM_STATE.ATTACK_SPIN) {
            const centerX = x + this.width / 2;
            const centerY = y + this.height / 2;
            return {
                x: centerX - range,
                y: centerY - range,
                width: range * 2,
                height: range * 2
            };
        }

        if (attack.comboStep) {
            const dir = facingRight ? 1 : -1;
            const centerX = x + this.width / 2;
            const pivotY = y + (isCrouching ? this.height * 0.58 : this.height * 0.43);
            const eased = this.getAttackMotionProgress(attack, progress);
            const easeOut = 1 - Math.pow(1 - eased, 2);
            const easeInOut = eased < 0.5
                ? 2 * eased * eased
                : 1 - Math.pow(-2 * eased + 2, 2) / 2;

            let swordAngle = 0;
            let armEndX = centerX + dir * 14;
            let armEndY = pivotY + 6;

            switch (attack.comboStep) {
                case 1:
                    swordAngle = 2.6 - 2.56 * easeOut;
                    armEndX = centerX + dir * (6 + easeOut * 26);
                    armEndY = pivotY + 9 - easeOut * 5.2;
                    break;
                case 2:
                    swordAngle = 0.48 + 1.96 * easeInOut;
                    armEndX = centerX + dir * (18 - easeInOut * 30);
                    armEndY = pivotY - 1 + easeInOut * 13.4;
                    break;
                case 3:
                    swordAngle = -0.22 + Math.sin(eased * Math.PI) * 0.34;
                    armEndX = centerX + dir * (-10 + easeInOut * 36);
                    armEndY = pivotY + 5 - Math.sin(eased * Math.PI) * 9.2;
                    break;
                case 4:
                    if (eased < 0.42) {
                        const t = eased / 0.42;
                        swordAngle = 1.32 - 2.06 * t;
                        armEndX = centerX + dir * (8.0 + Math.sin(t * Math.PI) * 1.2);
                        armEndY = pivotY + 22 - t * 36;
                    } else {
                        const flipT = Math.max(0, Math.min(1, (eased - 0.42) / 0.58));
                        const bodyFlipAngle = -Math.PI * 1.82 * flipT;
                        swordAngle = -0.76 + bodyFlipAngle;
                        armEndX = centerX - dir * (4.0 + Math.sin(flipT * Math.PI) * 6.0);
                        armEndY = pivotY - 10 + Math.cos(flipT * Math.PI) * 3.0;
                    }
                    break;
                case 5:
                    if (eased < 0.26) {
                        const t = eased / 0.26;
                        swordAngle = -1.45 + t * 0.3;
                        armEndX = centerX + dir * (2 + t * 4);
                        armEndY = pivotY - 12 - t * 7;
                    } else if (eased < 0.78) {
                        const t = (eased - 0.26) / 0.52;
                        swordAngle = -1.15 + t * 2.2;
                        armEndX = centerX + dir * (6 + t * 20);
                        armEndY = pivotY - 19 + t * 36;
                    } else {
                        const t = (eased - 0.78) / 0.22;
                        swordAngle = 1.05 - t * 0.52;
                        armEndX = centerX + dir * (26 - t * 8);
                        armEndY = pivotY + 17 - t * 4;
                    }
                    break;
                default:
                    break;
            }

            const swordLen = this.getKatanaBladeLength();
            const tipX = armEndX + Math.cos(swordAngle) * dir * swordLen;
            const tipY = armEndY + Math.sin(swordAngle) * swordLen;
            const basePad = attack.comboStep === 5 ? 18 : 14;
            const extraDown = attack.comboStep === 5 ? 28 : 0;
            const xBox = Math.min(armEndX, tipX) - basePad;
            const yBox = Math.min(armEndY, tipY) - basePad;
            const width = Math.abs(tipX - armEndX) + basePad * 2;
            const height = Math.abs(tipY - armEndY) + basePad * 2 + extraDown;

            const swordBox = {
                x: xBox,
                y: yBox - (attack.comboStep === 5 ? 4 : 0),
                width,
                height
            };
            const closeRangeBox = {
                // 至近距離で密着しても当たる補助判定（前寄り）
                x: centerX - 40 + dir * 10,
                y: y - 14,
                width: 80,
                height: this.height + 36
            };
            const forwardAssistBox = {
                // 中ボス級にも空振りしづらい前方補助判定
                x: centerX + (dir > 0 ? 8 : -92),
                y: y - 20,
                width: 100,
                height: this.height + 44
            };

            if (attack.comboStep === 4) {
                // 四段目: 斬り上げ〜宙返り中は体周辺にも当たり判定を持たせる
                const aerialBodyBox = {
                    x: centerX - 36,
                    y: y - 26,
                    width: 72,
                    height: this.height + 40
                };
                return [swordBox, closeRangeBox, forwardAssistBox, aerialBodyBox];
            }

            if (attack.comboStep === 5) {
                // 五段目: 落下斬り + 着地衝撃（足元と左右）を別当たり判定で付与
                const impactBox = {
                    x: centerX - 44,
                    y: y + this.height - 26,
                    width: 88,
                    height: 52
                };
                return [swordBox, closeRangeBox, forwardAssistBox, impactBox];
            }

            return [swordBox, closeRangeBox, forwardAssistBox];
        }

        if (attack.isLaunch) {
            const width = range;
            const height = Math.max(54, this.height + 22);
            const yBox = y - 18;
            return {
                x: facingRight ? x + this.width : x - range,
                y: yBox,
                width,
                height
            };
        }
        
        if (facingRight) {
            return {
                x: x + this.width,
                y: y,
                width: range,
                height: this.height
            };
        } else {
            return {
                x: x - range,
                y: y,
                width: range,
                height: this.height
            };
        }
    }
    
    // 必殺技判定の取得
    getSpecialHitbox() {
        return null;
    }

    switchSubWeapon() {
        if (this.subWeapons.length <= 1) return;
        
        this.subWeaponIndex = (this.subWeaponIndex + 1) % this.subWeapons.length;
        this.currentSubWeapon = this.subWeapons[this.subWeaponIndex];
        
        // ステージごとの装備を記憶
        if (game.currentStageNumber) {
            if (!this.stageEquip) this.stageEquip = {};
            this.stageEquip[game.currentStageNumber] = this.currentSubWeapon.name;
        }

        // 切り替え音
        audio.playSelect();
    }
}
