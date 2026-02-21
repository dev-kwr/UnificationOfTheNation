// ============================================
// Unification of the Nation - プレイヤークラス
// ============================================

import { PLAYER, GRAVITY, FRICTION, CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, LANE_OFFSET } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { game } from './game.js';
import { drawShurikenShape } from './weapon.js';

// アニメーション状態
export const ANIM_STATE = {
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
    { type: ANIM_STATE.ATTACK_SLASH, name: '一ノ太刀・閃返し', damage: 1.22, range: 84, durationMs: 182, cooldownScale: 0.5, chainWindowMs: 98, impulse: -0.66 },
    { type: ANIM_STATE.ATTACK_SLASH, name: '二ノ太刀・影走り袈裟', damage: 1.02, range: 80, durationMs: 138, cooldownScale: 0.46, chainWindowMs: 84, impulse: 1.08 },
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
        this.maxJumps = 1;  // 一段ジャンプ（二段以上はショップで解禁）
        this.facingRight = true;
        
        // ダッシュ
        this.isDashing = false;
        this.dashCooldown = 0;
        this.dashTimer = 0;
        this.dashDuration = 140;
        this.dashSpeedMultiplier = 1.45;
        this.dashDirection = 1;
        this.permanentDash = false;
        
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
        this.specialCloneDurability = [];
        this.specialCloneDurabilityLv3 = 3;
        this.specialCloneHitInvincibleMs = 260;
        this.specialCloneCombatStarted = false;
        this.progression = {
            normalCombo: 0,
            subWeapon: 0,
            specialClone: 0,
            ninjutsuUnlockStage: 0
        };
        this.tempNinjutsuTimers = {
            expMagnet: 0,
            xAttack: 0,
            ghostVeil: 0
        };
        this.tempNinjutsuDurations = {
            expMagnet: 60000,
            xAttack: 60000,
            ghostVeil: 30000
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
        this.isDefeated = false;
        this.burstVanished = false;
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
        this.subWeaponPoseOverride = null;
        this.comboSlashTrailPoints = [];
        this.comboSlashTrailSampleTimer = 0;
        this.specialCloneSlashTrailPoints = [];
        this.specialCloneSlashTrailSampleTimers = [];
        this.comboSlashTrailSampleIntervalMs = 14;
        this.comboSlashTrailActiveLifeMs = 520;
        this.comboSlashTrailFadeLifeMs = 300;
        this.ghostVeilCanvas = null;
        this.ghostVeilCtx = null;
        
        // 奥義分身関連
        this.specialClonePositions = []; // 各分身の現在の世界座標 {x, y, facingRight}
        this.specialCloneTargets = [];   // 各分身の追尾対象（Enemyオブジェクト）
        this.specialCloneReturnToAnchor = []; // 待機位置へ戻るフラグ
        this.specialCloneComboSteps = []; // 分身ごとのコンボ段数
        this.specialCloneAttackTimers = []; // 各分身の攻撃アニメーション用タイマー
        this.specialCloneSubWeaponTimers = []; // 各分身のサブ武器アニメーション用タイマー
        this.specialCloneSubWeaponActions = []; // 各分身のサブ武器アクション内容
        this.specialCloneScarfNodes = [];
        this.specialCloneHairNodes = [];

        this.rebuildSpecialCloneSlots();

        // プレビュー画面専用のアクセサリ物理ノード
        this.previewScarfNodes = [];
        this.previewHairNodes = [];
        this.previewMode = false;
    }

    calculateAccessoryAnchor(posX, groundY, height, motionTime, isMoving, isDashing, isCrouching, legPhase) {
        const bottomY = groundY;
        const drawY = groundY - height;

        let modelBob = 0;
        if (isCrouching) {
            const phase = isMoving ? Math.sin(legPhase || motionTime * 0.012) : 0;
            const idlePhase = isMoving ? 0 : Math.sin(motionTime * 0.006);
            modelBob = isMoving ? phase * 0.4 : idlePhase * 0.2;
        } else if (isDashing) {
            modelBob = Math.abs(Math.sin(legPhase || motionTime * 0.012)) * 3.3;
        } else if (isMoving) {
            modelBob = Math.abs(Math.sin(legPhase || motionTime * 0.012)) * 2.4;
        } else {
            modelBob = Math.sin(motionTime * 0.005) * 1.2;
        }

        const modelHeadY = isCrouching
            ? (bottomY - 2 - 32 + modelBob)
            : (drawY + 15 + modelBob);

        return { headY: modelHeadY, bob: modelBob };
    }

    resetVisualTrails() {
        const dir = this.facingRight ? 1 : -1;
        const anchorX = this.x + this.width / 2 + (this.facingRight ? -12 : 12);
        // 地面基準で初期化
        const anchorY = this.groundY - this.height + 13;

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

    updateAccessoryNodes(scarfNodes, hairNodes, targetX, targetY, speedX, isMoving, deltaTime) {
        if (!scarfNodes || scarfNodes.length === 0 || !hairNodes || hairNodes.length === 0) return;

        const time = this.motionTime;
        // deltaTimeが大きすぎる（ラグ等）と物理演算が爆発するため、上限を厳しく設定
        const dt = Math.min(deltaTime, 0.033);
        const subSteps = 2;
        const subDelta = dt / subSteps;
        const flutterSpeed = 0.02;

        scarfNodes[0].x = targetX;
        scarfNodes[0].y = targetY;
        hairNodes[0].x = targetX;
        hairNodes[0].y = targetY - 8;

        for (let s = 0; s < subSteps; s++) {
            for (let i = 1; i < scarfNodes.length; i++) {
                const node = scarfNodes[i];
                const prev = scarfNodes[i - 1];
                const effectiveSpeed = isMoving ? flutterSpeed : flutterSpeed * 0.25;
                const flutterIntensity = isMoving ? 5.0 : 1.0;
                const flutterH = Math.sin(time * effectiveSpeed * 1.5 + i * 1.5) * flutterIntensity;
                const flutterV = Math.cos(time * effectiveSpeed * 2.0 + i * 1.0) * (flutterIntensity * 1.2);
                const windDecay = Math.pow(0.85, i);
                const wind = isMoving ? (speedX > 0 ? -1 : 1) * (Math.abs(speedX) * 6 + 2) * windDecay : 0;

                node.x += (wind + flutterH) * subDelta * 12;
                node.y += (1.5 + flutterV) * subDelta * 15;

                // 安全策：座標が異常値（Infinity/NaN）になったらリセット
                if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
                    node.x = prev.x;
                    node.y = prev.y;
                }

                const dx = node.x - prev.x;
                const dy = node.y - prev.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const targetDist = 5.0;
                if (dist > 0) {
                    const tension = isMoving ? 0.65 : 0.7;
                    // 補正量（correction）が距離を超えすぎないようクランプして発散を防ぐ
                    let correction = Math.min(dist * 0.9, (dist - targetDist) * tension);
                    const maxDist = targetDist * 1.35;
                    if (dist - correction > maxDist) correction = dist - maxDist;
                    const angle = Math.atan2(dy, dx);
                    node.x -= Math.cos(angle) * correction;
                    node.y -= Math.sin(angle) * correction;
                }
            }

            for (let i = 1; i < hairNodes.length; i++) {
                const node = hairNodes[i];
                const prev = hairNodes[i - 1];
                const effectiveSpeed = isMoving ? 0.03 : 0.005;
                const flutterIntensity = isMoving ? 4.0 : 1.0;
                const flutterH = Math.sin(time * effectiveSpeed + i * 1.2) * flutterIntensity;
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
                    const tension = isMoving ? 0.65 : 0.7;
                    let correction = (dist - targetDist) * tension;
                    const maxDist = targetDist * 1.35;
                    if (dist - correction > maxDist) correction = dist - maxDist;
                    const angle = Math.atan2(dy, dx);
                    node.x -= Math.cos(angle) * correction;
                    node.y -= Math.sin(angle) * correction;
                }
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
        const deltaMs = deltaTime * 1000;
        this.updateTemporaryNinjutsu(deltaMs);

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
                const keepOdachiPose = !!(
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name === '大太刀' &&
                    this.subWeaponAction === '大太刀' &&
                    this.currentSubWeapon.isAttacking
                );
                if (keepOdachiPose) {
                    // 刀が地面から消えるまでは「ぶら下がり姿勢」を維持する
                    this.subWeaponTimer = 1;
                } else {
                    this.subWeaponTimer = 0;
                    this.subWeaponAction = null; // アニメーション終了時にアクションをクリア
                    this.subWeaponCrouchLock = false;
                }
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
        
        // 攻撃中の処理
        if (this.isAttacking) {
            this.updateAttack(deltaTime);
        }
        this.updateComboSlashTrail(deltaMs);

        // サブウェポンの状態更新（アニメーション進行など）
        if (this.currentSubWeapon && this.currentSubWeapon.update) {
            this.currentSubWeapon.update(deltaTime / subWeaponScale);
        }

        // 鎖鎌・大太刀は武器側の攻撃終了を優先して即座に通常状態へ戻す
        if (
            this.currentSubWeapon &&
            (this.currentSubWeapon.name === '鎖鎌' || this.currentSubWeapon.name === '大太刀') &&
            this.subWeaponAction === this.currentSubWeapon.name &&
            !this.currentSubWeapon.isAttacking
        ) {
            this.subWeaponTimer = 0;
            this.subWeaponAction = null;
            this.subWeaponCrouchLock = false;
        }

        // サブ武器使用中も他の操作を一部制限
        if (this.subWeaponTimer > 200) { // 出始めは移動制限
            this.vx *= 0.5;
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
        // ========== プレビューモード：攻撃・忍具・武器切替のみ ==========
        if (this.previewMode) {
            if (input.isActionJustPressed('SWITCH_WEAPON')) {
                this.switchSubWeapon();
            }
            if (input.isActionJustPressed('SUB_WEAPON')) {
                if (this.subWeaponTimer > 0) return;
                if (!this.currentSubWeapon) return;
                if (this.currentSubWeapon.name === '二刀流') {
                    if (this.currentSubWeapon.projectiles && this.currentSubWeapon.projectiles.length > 0) return;
                    this.currentSubWeapon.use(this, 'combined');
                    this.subWeaponTimer = 220;
                    this.subWeaponAction = '二刀_合体';
                    this.vx = 0;
                } else {
                    this.useSubWeapon();
                    const weaponName = this.currentSubWeapon ? this.currentSubWeapon.name : '';
                    const isThrow = weaponName === '火薬玉' || weaponName === '手裏剣';
                    this.subWeaponTimer =
                        isThrow ? 150 :
                        weaponName === '大槍' ? 270 :
                        weaponName === '鎖鎌' ? 560 :
                        weaponName === '大太刀' ? 760 : 300;
                    this.subWeaponAction = isThrow ? 'throw' : weaponName;
                }
            }
            if (input.isActionJustPressed('ATTACK')) {
                const lockZDuringSub =
                    this.subWeaponTimer > 0 &&
                    this.subWeaponAction &&
                    this.subWeaponAction !== 'throw' &&
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name !== '火薬玉' &&
                    this.currentSubWeapon.name !== '二刀流';
                if (!lockZDuringSub) {
                    if (this.isAttacking) {
                        this.bufferNextAttack();
                    } else {
                        this.attack();
                    }
                }
            }
            return; // 移動・ジャンプ・ダッシュ・奥義は無視
        }

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
                const isThrow = weaponName === '火薬玉' || weaponName === '手裏剣';
                this.subWeaponTimer =
                    isThrow ? 150 :
                    weaponName === '大槍' ? 270 :
                    (weaponName === '鎖鎌') ? 560 :
                    (weaponName === '大太刀') ? 760 : 300;
                this.subWeaponAction = isThrow ? 'throw' : weaponName;
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
            if (this.permanentDash) {
                this.vx = moveDir * (this.speed * this.dashSpeedMultiplier);
                this.isDashing = true;
                this.dashDirection = moveDir >= 0 ? 1 : -1;
                this.dashTimer = Math.max(this.dashTimer, this.dashDuration * 0.5);
            } else {
                this.vx = moveDir * this.speed;
            }
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
        // 1撃目の返し中は地を這う挙動を優先し、ジャンプ入力を受けない
        if (this.isAttacking && this.currentAttack && this.currentAttack.comboStep === 1) {
            return;
        }

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

    getComboAttackProfileByStep(step) {
        const clampedStep = Math.max(1, Math.min(COMBO_ATTACKS.length, Math.floor(step) || 1));
        const comboProfile = COMBO_ATTACKS[clampedStep - 1] || COMBO_ATTACKS[0];
        return this.buildAttackProfile(comboProfile, { comboStep: clampedStep, source: 'main' });
    }
    
    attack({ fromBuffer = false } = {}) {
        if (!fromBuffer && this.attackCooldown > 0) return;

        // 斬撃SEの再生タイミングを最速にする（入力直後）
        if (!(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流')) {
            const nextComboIndex = (this.attackCombo < this.getNormalComboMax()) ? this.attackCombo : 0;
            audio.playSlash(nextComboIndex);
        }

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
            // 一段目は後方へ返す斬り。ジャンプせず地上寄りで繋ぐ
            const groundedAtStart = this.isGrounded;
            this.vx = this.vx * 0.2 + direction * impulse * 0.94;
            if (groundedAtStart) {
                this.vy = 0;
                this.isGrounded = true;
            } else {
                // 空中発動時も上方向へは伸びないようにする
                this.vy = Math.max(this.vy, -0.8);
            }
        } else if (step === 2) {
            // 二段目は一段終点から自然に繋ぐため、地上始動を優先
            this.vx = this.vx * 0.16 + direction * impulse * 0.9;
            if (this.isGrounded) {
                this.vy = 0;
                this.isGrounded = true;
            } else {
                this.vy = Math.min(this.vy, -1.2);
            }
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
        if (activeAttack && activeAttack.comboStep === 1 && this.attackTimer > 0) {
            const duration = Math.max(1, activeAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const progress = Math.max(0, Math.min(1, 1 - (this.attackTimer / duration)));
            const direction = this.facingRight ? 1 : -1;
            const wind = Math.max(0, Math.min(1, progress / 0.36));
            const swing = Math.max(0, Math.min(1, (progress - 0.36) / 0.64));
            const swingEase = swing * swing * (3 - 2 * swing);
            // 1撃目は「返し斬り」だけ行い、後方ステップはさせない
            const targetVx = direction * this.speed * (0.16 + wind * 0.18 + swingEase * 0.24);
            this.vx = this.vx * 0.76 + targetVx * 0.24;
            if (this.isGrounded) {
                this.vy = 0;
            } else {
                this.vy = Math.max(this.vy, 1.2);
            }
        } else if (activeAttack && activeAttack.comboStep === 4 && this.attackTimer > 0) {
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
        
        this.isUsingSpecial = true;
        this.specialCastTimer = this.specialCastDurationMs;
        this.specialCloneCombatStarted = false;
        this.specialCloneAlive = this.specialCloneSlots.map(() => true);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => this.specialCastDurationMs + this.specialCloneSpawnInvincibleMs);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 40);
        const cloneDurability = this.getSpecialCloneDurabilityPerUnit();
        this.specialCloneDurability = this.specialCloneSlots.map(() => cloneDurability);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);

        // groundBasedYを廃止、接地ベース基準 (プレイヤーのジャンプに同期させない)
        const stableGroundY = this.groundY + LANE_OFFSET;
        const cloneAnchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, stableGroundY - this.height * 0.38);
        this.specialClonePositions = cloneAnchors.map(a => ({ x: a.x, y: a.y, facingRight: this.facingRight, prevX: a.x }));
        this.specialCloneScarfNodes = this.specialCloneSlots.map(() => null);
        this.specialCloneHairNodes = this.specialCloneSlots.map(() => null);
        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            this.initCloneAccessoryNodes(i);
        }

        const smokeAnchors = cloneAnchors.map(a => ({ x: a.x, y: a.y }));
        this.spawnSpecialSmoke('appear', smokeAnchors);

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
        this.specialCloneDurability = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
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

                // 詠唱中は全レベル共通でノードを追従させる（Lv3も含む）
                for (let i = 0; i < this.specialCloneSlots.length; i++) {
                    const pos = this.specialClonePositions[i];
                    if (!pos) continue;

                    const stableGroundY = this.groundY + LANE_OFFSET;
                    const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, stableGroundY - this.height * 0.38);
                    pos.x = anchors[i].x;
                    pos.y = anchors[i].y;
                    pos.facingRight = anchors[i].facingRight;
                    pos.prevX = pos.x; // prevXも同期して速度計算の暴走を防ぐ

                    if (!this.specialCloneScarfNodes[i]) this.initCloneAccessoryNodes(i);
                    if (this.specialCloneScarfNodes[i] && this.specialCloneHairNodes[i]) {
                        const cloneVx = this.vx;
                        const cloneMotionTime = this.motionTime + i * 400;
                        const cloneIsMoving = Math.abs(cloneVx) > 0.5 || !this.isGrounded;

                        const anchorCalc = this.calculateAccessoryAnchor(
                            pos.x, this.y + this.height, this.height,
                            cloneMotionTime, cloneIsMoving,
                            this.isDashing, this.isCrouching,
                            this.legPhase || cloneMotionTime * 0.012
                        );

                        const knotOffsetX = pos.facingRight ? -12 : 12;
                        this.updateAccessoryNodes(
                            this.specialCloneScarfNodes[i],
                            this.specialCloneHairNodes[i],
                            pos.x + knotOffsetX,
                            anchorCalc.headY - 2,
                            cloneVx,
                            cloneIsMoving,
                            deltaTime
                        );
                    }
                }
            } else {
                if (!this.specialCloneCombatStarted) {
                    this.onSpecialCloneStarted();
                }
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
                this.updateSpecialCloneAi(deltaTime);
            } else if (this.specialCloneCombatStarted) {
                // Lv1〜2: 本体に追従
                const stableGroundY = this.groundY + LANE_OFFSET;
                const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, stableGroundY - this.height * 0.38);
                for (let i = 0; i < this.specialCloneSlots.length; i++) {
                    if (this.specialClonePositions[i]) {
                        this.specialClonePositions[i].x = anchors[i].x;
                        this.specialClonePositions[i].y = anchors[i].y;
                        this.specialClonePositions[i].facingRight = anchors[i].facingRight;

                        if (!this.specialCloneScarfNodes[i]) this.initCloneAccessoryNodes(i);
                        if (this.specialCloneScarfNodes[i] && this.specialCloneHairNodes[i]) {
                            const pos = this.specialClonePositions[i];
                            const cloneVx = this.vx;
                            const cloneMotionTime = this.motionTime + i * 400;
                            const cloneIsMoving = Math.abs(cloneVx) > 0.5 || !this.isGrounded;

                            const anchorCalc = this.calculateAccessoryAnchor(
                                pos.x, this.y + this.height, this.height,
                                cloneMotionTime, cloneIsMoving,
                                this.isDashing, this.isCrouching,
                                this.legPhase || cloneMotionTime * 0.012
                            );

                            const knotOffsetX = pos.facingRight ? -12 : 12;
                            this.updateAccessoryNodes(
                                this.specialCloneScarfNodes[i],
                                this.specialCloneHairNodes[i],
                                pos.x + knotOffsetX,
                                anchorCalc.headY - 2,
                                cloneVx,
                                cloneIsMoving,
                                deltaTime
                            );
                        }
                    }
                }
            }
        }

        if (this.isUsingSpecial) {
            this.updateSpecialCloneSlashTrails(deltaMs);
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
            if (
                this.specialCloneAutoAiEnabled &&
                this.currentSubWeapon &&
                this.currentSubWeapon.name === '二刀流' &&
                typeof this.currentSubWeapon.getMainDurationByStep === 'function'
            ) {
                const nextComboIndex = ((this.specialCloneComboSteps[index] || 0) + 1) % 5;
                const dualDuration = Math.max(1, this.currentSubWeapon.getMainDurationByStep(nextComboIndex));
                this.specialCloneComboSteps[index] = nextComboIndex;
                this.specialCloneAttackTimers[index] = dualDuration;
                this.specialCloneSubWeaponTimers[index] = dualDuration;
                this.specialCloneSubWeaponActions[index] = '二刀_Z';
                return;
            }
            const nextIndex = ((this.specialCloneComboSteps[index] || 0) + 1) % COMBO_ATTACKS.length;
            const nextStep = nextIndex + 1;
            const profile = this.getComboAttackProfileByStep(nextStep);
            this.specialCloneAttackTimers[index] = profile.durationMs;
            this.specialCloneComboSteps[index] = nextIndex;
        }
    }

    triggerCloneSubWeapon(index) {
        // Lv3（自律AI）の分身は外部からのサブ武器発動を無視
        if (this.specialCloneAutoAiEnabled) return;

        if (!this.currentSubWeapon || this.specialCloneSubWeaponTimers[index] > 0 || this.specialCloneAttackTimers[index] > 0) return;
        
        const weaponName = this.currentSubWeapon.name;
        this.specialCloneSubWeaponTimers[index] = 
            weaponName === '火薬玉' ? 150 :
            weaponName === '大槍' ? 270 :
            weaponName === '鎖鎌' ? 560 :
            weaponName === '大太刀' ? 760 : 300;
        this.specialCloneSubWeaponActions[index] = weaponName === '火薬玉' ? 'throw' : weaponName;
    }

    onSpecialCloneStarted() {
        this.specialCloneCombatStarted = true;
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => this.specialCloneSpawnInvincibleMs);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 30);
        
        const stableGroundY = this.groundY + LANE_OFFSET;
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, stableGroundY - this.height * 0.38);
        this.specialClonePositions = anchors.map(a => ({
            x: a.x,
            y: a.y,
            facingRight: this.facingRight,
            prevX: a.x,
            jumping: !this.isGrounded,
            cloneVy: !this.isGrounded ? this.vy : 0
        }));

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneScarfNodes[i] || !this.specialCloneHairNodes[i]) {
                this.initCloneAccessoryNodes(i);
            }
        }
        this.specialCloneTargets = this.specialCloneSlots.map(() => null);
        this.specialCloneReturnToAnchor = this.specialCloneSlots.map(() => false);
        this.specialCloneComboSteps = this.specialCloneSlots.map(() => 0);
        this.specialCloneAttackTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponActions = this.specialCloneSlots.map(() => null);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);

        const smokeAnchors = anchors.map(a => ({ x: a.x, y: a.y }));
        this.spawnSpecialSmoke('appear', smokeAnchors);
    }

    initCloneAccessoryNodes(index) {
        const pos = this.specialClonePositions[index];
        if (!pos) return;
        const dir = pos.facingRight ? 1 : -1;
        const cloneMotionTime = this.motionTime + index * 400;

        // 全レベル共通、pos.yを体の中心と見なして頭部位置を推定
        const headY = pos.y - this.height * 0.25;

        const knotOffsetX = pos.facingRight ? -12 : 12;
        const anchorX = pos.x + knotOffsetX;
        const anchorY = headY - 2;

        const scarfNodes = [];
        const hairNodes = [];
        for (let i = 0; i < 9; i++) {
            scarfNodes.push({
                x: anchorX - dir * i * 5,
                y: anchorY + i * 1.2
            });
            if (i < 8) {
                hairNodes.push({
                    x: anchorX - dir * i * 3.2,
                    y: anchorY - 8 + i * 0.8
                });
            }
        }
        this.specialCloneScarfNodes[index] = scarfNodes;
        this.specialCloneHairNodes[index] = hairNodes;
    }

    updateSpecialCloneAi(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const scrollX = (window.game && window.game.scrollX) || 0;
        const screenWidth = 1280;
        
        const enemies = (window.game && window.game.stage) 
            ? window.game.stage.getAllEnemies().filter(e => {
                if (!e.isAlive || e.isDying) return false;
                const ex = e.x + e.width / 2;
                return ex >= scrollX - 50 && ex <= scrollX + screenWidth + 50;
            }) 
            : [];
            
        const stableGroundY = this.groundY + LANE_OFFSET;
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, stableGroundY - PLAYER.HEIGHT * 0.38);
        const cloneRestY = stableGroundY - PLAYER.HEIGHT * 0.38;

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneAlive[i]) continue;
            
            const pos = this.specialClonePositions[i];
            const anchor = anchors[i];
            const prevY = pos.y;

            const frameStartX = pos.x;

            let target = this.specialCloneTargets[i];

            if (!target || !target.isAlive || target.isDying) {
                target = this.findNearestEnemy(pos.x, pos.y, enemies, 500);
                this.specialCloneTargets[i] = target;
            }

            const anchorDist = Math.abs(anchor.x - pos.x);
            if (target && anchorDist > 300) {
                target = null;
                this.specialCloneTargets[i] = null;
            }

            if (target) {
                const attackRange = 120;
                const targetX = target.x + target.width / 2;
                const dx = targetX - pos.x;
                const distX = Math.abs(dx);
                if (distX > attackRange * 1.5) {
                    const speed = (this.speed || 5) * 1.55;
                    pos.x += Math.sign(dx) * speed * deltaTime * 60;
                    pos.facingRight = dx > 0;
                } else {
                    pos.facingRight = dx > 0;
                    const canAttack = this.specialCloneAttackTimers[i] <= 0
                        && this.specialCloneSubWeaponTimers[i] <= 0;
                    if (canAttack) {
                        this.triggerCloneAttack(i);
                    }
                }
                this.specialCloneReturnToAnchor[i] = false;
            } else {
                const dx = anchor.x - pos.x;
                if (Math.abs(dx) > 300) {
                    pos.x = anchor.x;
                    pos.facingRight = this.facingRight;
                    this.initCloneAccessoryNodes(i);
                } else if (Math.abs(dx) > 2) {
                    const chaseSpeed = Math.max(
                        (this.speed || 5) * 2.0,
                        Math.abs(dx) / Math.max(0.016, deltaTime) * 0.7
                    );
                    const step = Math.sign(dx) * Math.min(Math.abs(dx), chaseSpeed * deltaTime * 60);
                    pos.x += step;
                    if (Math.abs(dx) > 6) {
                        pos.facingRight = dx > 0;
                    }
                } else {
                    pos.x = anchor.x;
                    pos.facingRight = this.facingRight;
                }
                this.specialCloneReturnToAnchor[i] = true;
            }

            // Lv3分身の自律ジャンプ（トラップ＋障害物回避）
            if (!pos.jumping) pos.jumping = false;
            if (!pos.cloneVy) pos.cloneVy = 0;

            let shouldJump = false;
            if (window.game && window.game.stage) {
                const stage = window.game.stage;
                const frameDx = pos.x - frameStartX;
                const moveDir = Math.abs(frameDx) > 0.5 ? Math.sign(frameDx) : (pos.facingRight ? 1 : -1);

                const hazards = [];
                if (stage.traps) hazards.push(...stage.traps);
                if (stage.obstacles) {
                    for (const obs of stage.obstacles) {
                        if (obs && !obs.isDestroyed) hazards.push(obs);
                    }
                }

                const cloneHalfW = this.width * 0.4;
                for (const hazard of hazards) {
                    if (!hazard || hazard.x === undefined) continue;

                    const hLeft = hazard.x;
                    const hRight = hazard.x + (hazard.width || 30);
                    const hTop = (hazard.y !== undefined) ? hazard.y : (this.groundY - (hazard.height || 30));
                    const hBottom = hTop + (hazard.height || 30);

                    if (hBottom < this.groundY - 60) continue;

                    const cloneCenterX = pos.x;
                    const lookAhead = 120;
                    let isAhead = false;
                    if (moveDir > 0) {
                        isAhead = hLeft > (cloneCenterX - cloneHalfW) && hLeft < (cloneCenterX + lookAhead);
                    } else {
                        isAhead = hRight < (cloneCenterX + cloneHalfW) && hRight > (cloneCenterX - lookAhead);
                    }

                    if (!isAhead) continue;

                    const cloneFootY = pos.y + this.height * 0.38;
                    if (hTop < cloneFootY) {
                        shouldJump = true;
                        break;
                    }
                }
            }

            if (shouldJump && !pos.jumping) {
                pos.jumping = true;
                pos.cloneVy = -12;
            }

            if (pos.jumping) {
                pos.cloneVy += 0.6;
                pos.y += pos.cloneVy * deltaTime * 60;
                if (pos.y >= cloneRestY) {
                    pos.y = cloneRestY;
                    pos.jumping = false;
                    pos.cloneVy = 0;
                }
            } else {
                pos.y = cloneRestY;
            }

            if (window.game && window.game.stage && window.game.stage.obstacles) {
                for (const obs of window.game.stage.obstacles) {
                    if (!obs || obs.isDestroyed || obs.x === undefined) continue;
                    const obsLeft = obs.x;
                    const obsRight = obs.x + (obs.width || 30);
                    const obsTop = (obs.y !== undefined) ? obs.y : (this.groundY - (obs.height || 30));
                    const obsBottom = obsTop + (obs.height || 30);

                    const cloneHalfW = this.width * 0.4;
                    const cloneLeft = pos.x - cloneHalfW;
                    const cloneRight = pos.x + cloneHalfW;
                    const cloneDrawY = pos.y - this.height * 0.62;
                    const cloneBottom = cloneDrawY + this.height;
                    const cloneTop = cloneDrawY;

                    if (cloneRight > obsLeft && cloneLeft < obsRight &&
                        cloneBottom > obsTop && cloneTop < obsBottom) {
                        const overlapLeft = cloneRight - obsLeft;
                        const overlapRight = obsRight - cloneLeft;
                        if (overlapLeft < overlapRight) {
                            pos.x -= overlapLeft;
                        } else {
                            pos.x += overlapRight;
                        }
                    }
                }
            }

            if (Math.abs(pos.y - prevY) > 40) {
                this.initCloneAccessoryNodes(i);
                pos.prevX = pos.x;
            }

            const frameDeltaX = pos.x - frameStartX;
            pos.renderVx = frameDeltaX / Math.max(0.016, deltaTime);

            if (this.specialCloneAttackTimers[i] > 0) {
                this.specialCloneAttackTimers[i] -= deltaMs;
            }
            if (this.specialCloneSubWeaponTimers[i] > 0) {
                this.specialCloneSubWeaponTimers[i] -= deltaMs;
                if (this.specialCloneSubWeaponTimers[i] <= 0) {
                    this.specialCloneSubWeaponTimers[i] = 0;
                    this.specialCloneSubWeaponActions[i] = null;
                }
            }

            if (!this.specialCloneScarfNodes[i]) this.initCloneAccessoryNodes(i);
            if (this.specialCloneScarfNodes[i] && this.specialCloneHairNodes[i]) {
                const cloneVx = Math.max(-this.speed * 2.5, Math.min(this.speed * 2.5, pos.renderVx));
                pos.prevX = pos.x;

                const cloneMotionTime = this.motionTime + i * 400;
                const cloneIsMoving = Math.abs(cloneVx) > 0.5;
                const cloneDrawY = pos.y - this.height * 0.62;
                const cloneFootY = cloneDrawY + this.height;
                
                const anchorCalc = this.calculateAccessoryAnchor(
                    pos.x, cloneFootY, this.height,
                    cloneMotionTime, cloneIsMoving,
                    false, false,
                    cloneMotionTime * 0.012
                );
                
                const knotOffsetX = pos.facingRight ? -12 : 12;
                this.updateAccessoryNodes(
                    this.specialCloneScarfNodes[i],
                    this.specialCloneHairNodes[i],
                    pos.x + knotOffsetX,
                    anchorCalc.headY - 2,
                    cloneVx,
                    cloneIsMoving,
                    deltaTime
                );
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

    getSpecialCloneDurabilityPerUnit() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? Math.max(0, Math.min(3, this.progression.specialClone))
            : 0;
        return tier >= 3 ? this.specialCloneDurabilityLv3 : 1;
    }

    getSpecialCloneAnchors() {
        if (!this.specialCloneCombatStarted) {
            return this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getFootY() - this.height * 0.38);
        }

        // 戦闘開始後は、AIによって更新された個別座標を返す
        return this.specialCloneSlots.map((unit, index) => {
            const pos = this.specialClonePositions[index] || { x: this.x, y: this.y, facingRight: this.facingRight };
            return {
                x: pos.x,
                y: pos.y,
                facingRight: pos.facingRight,
                alpha: this.specialCloneAlive[index] ? 1.0 : 0,
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
            alpha: this.specialCloneAlive[index] ? 1.0 : 0,
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

    getSubWeaponCloneOffsets() {
        if (this.specialCloneAutoAiEnabled) return [];
        return this.getSpecialCloneOffsets();
    }

    takeTrapDamage(amount, options = {}) {
        if (this.isGhostVeilActive()) return false;
        if (this.trapDamageCooldown > 0) return false;
        const sourceX = (typeof options.sourceX === 'number') ? options.sourceX : null;
        const knockbackX = (typeof options.knockbackX === 'number') ? options.knockbackX : 4.5;
        const knockbackY = (typeof options.knockbackY === 'number') ? options.knockbackY : -7.5;
        const forcedKnockbackDir = (typeof options.knockbackDir === 'number' && options.knockbackDir !== 0)
            ? (options.knockbackDir > 0 ? 1 : -1)
            : 0;
        const cooldownMs = (typeof options.cooldownMs === 'number') ? options.cooldownMs : 420;
        const flashMs = (typeof options.flashMs === 'number') ? options.flashMs : 230;
        const invincibleMs = (typeof options.invincibleMs === 'number') ? options.invincibleMs : 220;

        this.hp -= amount;
        this.trapDamageCooldown = cooldownMs;
        this.damageFlashTimer = Math.max(this.damageFlashTimer, flashMs);
        this.invincibleTimer = Math.max(this.invincibleTimer, invincibleMs);

        const playerCenterX = this.x + this.width / 2;
        const knockbackDir = forcedKnockbackDir !== 0
            ? forcedKnockbackDir
            : ((sourceX === null)
                ? (this.facingRight ? -1 : 1)
                : (playerCenterX < sourceX ? -1 : 1));

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
            const isSubWeapon = (this.specialCloneSubWeaponTimers[i] > 0);
            
            ctx.save();
            ctx.globalAlpha = 1.0; // 分身は完全に不透明

            const renderOptions = {
                renderHeadbandTail: false,
                useLiveAccessories: false
            };

            const drawX = pos.x - this.width / 2;
            const drawY = pos.y - this.height * 0.62;

            if (isAttacking) {
                const comboStep = (this.specialCloneComboSteps[i] % 5) + 1;
                const attackDurationMs = 320;
                
                // クローン専用のダミー状態を作成して渡す
                renderOptions.state = {
                    isAttacking: true,
                    currentAttack: {
                        comboStep,
                        durationMs: attackDurationMs,
                        range: 90,
                        type: ANIM_STATE.ATTACK_SLASH,
                        source: 'main'
                    },
                    attackTimer: this.specialCloneAttackTimers[i] || 0,
                    vx: 0,
                    vy: 0,
                    isGrounded: true,
                    isCrouching: false,
                    motionTime: this.motionTime
                };
                
                this.renderModel(ctx, drawX, drawY, pos.facingRight, 1.0, true, renderOptions);
            } else if (isSubWeapon) {
                // サブ武器状態を同期
                renderOptions.state = {
                    subWeaponTimer: this.specialCloneSubWeaponTimers[i],
                    subWeaponAction: this.specialCloneSubWeaponActions[i],
                    vx: 0,
                    vy: 0,
                    isGrounded: true,
                    isCrouching: false,
                    motionTime: this.motionTime
                };
                this.renderModel(ctx, drawX, drawY, pos.facingRight, 1.0, true, renderOptions);
            } else {
                this.renderModel(ctx, drawX, drawY, pos.facingRight, 1.0, true, renderOptions);
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

        const baseDurability = this.getSpecialCloneDurabilityPerUnit();
        if (!Array.isArray(this.specialCloneDurability) || this.specialCloneDurability.length !== this.specialCloneSlots.length) {
            this.specialCloneDurability = this.specialCloneSlots.map(() => baseDurability);
        }
        const currentDurability = Math.max(1, Number(this.specialCloneDurability[consumeIndex]) || baseDurability);
        const nextDurability = currentDurability - 1;
        if (nextDurability > 0) {
            this.specialCloneDurability[consumeIndex] = nextDurability;
            // 多段接触で即蒸発しないよう、被弾後の短い無敵を付与
            this.specialCloneInvincibleTimers[consumeIndex] = this.specialCloneHitInvincibleMs;
            return true;
        }

        this.specialCloneAlive[consumeIndex] = false;
        this.specialCloneInvincibleTimers[consumeIndex] = 0;
        this.specialCloneDurability[consumeIndex] = 0;
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
        if (typeof odachi.isPlanted === 'function' && odachi.isPlanted()) {
            return true;
        }
        const pose = odachi.getPose(this);
        return pose.phase === 'planted';
    }
    
    applyPhysics(walls) {
        // ========== プレビューモード：縦物理のみ・壁判定なし ==========
        if (this.previewMode) {
            const wasGrounded = this.isGrounded;
            if (!this.isGrounded) {
                this.vy += GRAVITY;
            }
            this.height = this.isCrouching ? PLAYER.HEIGHT / 2 : PLAYER.HEIGHT;
            this.vx *= 0.88;
            this.x += this.vx;
            this.y += this.vy;
            if (this.y + this.height >= this.groundY + LANE_OFFSET) {
                this.y = this.groundY + LANE_OFFSET - this.height;
                this.vy = 0;
                this.isGrounded = true;
                this.jumpCount = 0;
            } else {
                this.isGrounded = false;
            }
            this.justLanded = !wasGrounded && this.isGrounded;
            return;
        }

        const wasGrounded = this.isGrounded;
        const prevY = this.y;

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
        const colliders = Array.isArray(walls) ? walls : [];
        for (const wall of colliders) {
            if (!this.isSolidCollider(wall)) continue;
            if (this.intersects(wall)) {
                const wasAboveWall = prevY + this.height <= wall.y + 2;
                const wasBelowWall = prevY >= wall.y + wall.height - 2;
                if (wasAboveWall || wasBelowWall) continue;
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

        // 障害物の上面・下面の判定（岩に乗れるようにする）
        let supportTopY = null;
        for (const wall of colliders) {
            if (!this.isSolidCollider(wall)) continue;

            const wallLeft = wall.x;
            const wallRight = wall.x + wall.width;
            const wallTop = wall.y;
            const wallBottom = wall.y + wall.height;
            const overlapX = Math.min(this.x + this.width, wallRight) - Math.max(this.x, wallLeft);
            if (overlapX <= 3) continue;

            const prevTop = prevY;
            const prevBottom = prevY + this.height;
            const currentTop = this.y;
            const currentBottom = this.y + this.height;

            // 下から頭をぶつけた場合
            if (this.vy < 0 && prevTop >= wallBottom - 2 && currentTop <= wallBottom) {
                this.y = wallBottom;
                this.vy = 0;
                continue;
            }

            // 上から着地できる場合
            const canLandOnTop = this.vy >= -0.1 &&
                prevBottom <= wallTop + 10 &&
                currentBottom >= wallTop - 0.1;
            if (canLandOnTop) {
                if (supportTopY === null || wallTop < supportTopY) {
                    supportTopY = wallTop;
                }
            }
        }
        
        // 大太刀の突き刺し中は、柄にぶら下がる姿勢を維持する
        const hangingOnOdachi = this.isHangingOnOdachi();

        // 着地音の判定用：接地前の落下速度を一時保持
        const fallingSpeed = this.vy;

        // 地面判定
        if (hangingOnOdachi) {
            const hangClearance = 30;
            const hangY = this.groundY + LANE_OFFSET - this.height - hangClearance;
            // 刺さっている間は常に同じ吊り位置を維持する
            this.y = hangY;
            if (this.vy > 0) {
                this.vy = 0;
            }
            this.isGrounded = false;
            this.isWallSliding = false;
            this.jumpCount = Math.max(this.jumpCount, 1);
        } else if (supportTopY !== null && this.y + this.height >= supportTopY - 2) {
            this.y = supportTopY - this.height;
            this.vy = 0;
            this.isGrounded = true;
            this.jumpCount = 0;
            this.isWallSliding = false;
        } else if (this.y + this.height >= this.groundY + LANE_OFFSET) {
            this.y = this.groundY + LANE_OFFSET - this.height;
            this.vy = 0;
            this.isGrounded = true;
            this.jumpCount = 0;
            this.isWallSliding = false;
        } else {
            this.isGrounded = false;
        }

        this.justLanded = !wasGrounded && this.isGrounded;
        if (this.justLanded && fallingSpeed > 0) {
            audio.playLanding();
        }
        
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

    isSolidCollider(rect) {
        if (!rect || rect.isDestroyed) return false;
        if (
            typeof rect.x !== 'number' ||
            typeof rect.y !== 'number' ||
            typeof rect.width !== 'number' ||
            typeof rect.height !== 'number'
        ) {
            return false;
        }
        // 罠(竹槍)は足場にしない。岩と通常壁のみを足場扱いにする。
        if (typeof rect.type === 'string' && rect.type !== 'rock') return false;
        return true;
    }
    
    takeDamage(amount, options = {}) {
        if (this.isGhostVeilActive()) return false;
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

    updateTemporaryNinjutsu(deltaMs) {
        if (!this.tempNinjutsuTimers) return;
        this.tempNinjutsuTimers.expMagnet = Math.max(0, (this.tempNinjutsuTimers.expMagnet || 0) - deltaMs);
        this.tempNinjutsuTimers.xAttack = Math.max(0, (this.tempNinjutsuTimers.xAttack || 0) - deltaMs);
        this.tempNinjutsuTimers.ghostVeil = Math.max(0, (this.tempNinjutsuTimers.ghostVeil || 0) - deltaMs);
    }

    resetTemporaryNinjutsuTimers() {
        if (!this.tempNinjutsuTimers) return;
        Object.keys(this.tempNinjutsuTimers).forEach((key) => {
            this.tempNinjutsuTimers[key] = 0;
        });
    }

    getTempNinjutsuRemainingMs(key) {
        if (!this.tempNinjutsuTimers) return 0;
        return Math.max(0, this.tempNinjutsuTimers[key] || 0);
    }

    isExpMagnetBoostActive() {
        return this.getTempNinjutsuRemainingMs('expMagnet') > 0;
    }

    getExpMagnetRadiusScale() {
        return this.isExpMagnetBoostActive() ? 1.75 : 1.0;
    }

    isXAttackBoostActive() {
        return this.getTempNinjutsuRemainingMs('xAttack') > 0;
    }

    isXAttackActionActive() {
        const dualZActive = !!(
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            this.subWeaponAction === '二刀_Z' &&
            this.subWeaponTimer > 0
        );
        const cloneDualZActive = !!(
            this.specialCloneAutoAiEnabled &&
            Array.isArray(this.specialCloneSubWeaponActions) &&
            Array.isArray(this.specialCloneSubWeaponTimers) &&
            this.specialCloneSubWeaponActions.some((action, index) =>
                action === '二刀_Z' && (this.specialCloneSubWeaponTimers[index] || 0) > 0
            )
        );
        return !!((this.isAttacking && this.currentAttack) || dualZActive || cloneDualZActive);
    }

    getXAttackHitboxScale() {
        if (!this.isXAttackBoostActive()) return 1.0;
        return this.isXAttackActionActive() ? 2.45 : 1.0;
    }

    getXAttackTrailWidthScale() {
        if (!this.isXAttackBoostActive()) return 1.0;
        return this.isXAttackActionActive() ? 2.6 : 1.0;
    }

    isGhostVeilActive() {
        return this.getTempNinjutsuRemainingMs('ghostVeil') > 0;
    }

    getGhostVeilAlpha() {
        return this.isGhostVeilActive() ? 0.18 : 1.0;
    }

    getGhostVeilBounds() {
        const pad = 30;
        const x = Math.floor(this.x - pad);
        const y = Math.floor(this.y - pad);
        const width = Math.max(2, Math.ceil(this.width + pad * 2));
        const height = Math.max(2, Math.ceil(this.height + pad * 2));
        return { x, y, width, height };
    }

    ensureGhostVeilCanvas(width, height) {
        if (typeof document === 'undefined') return null;
        if (!this.ghostVeilCanvas) {
            this.ghostVeilCanvas = document.createElement('canvas');
            this.ghostVeilCtx = this.ghostVeilCanvas.getContext('2d');
        }
        if (!this.ghostVeilCanvas || !this.ghostVeilCtx) return null;
        if (this.ghostVeilCanvas.width !== width || this.ghostVeilCanvas.height !== height) {
            this.ghostVeilCanvas.width = width;
            this.ghostVeilCanvas.height = height;
        }
        return this.ghostVeilCanvas;
    }

    buildGhostVeilLayer(ctx, facingRight = this.facingRight) {
        if (!this.isGhostVeilActive() || !ctx || !ctx.canvas) return null;
        const bounds = this.getGhostVeilBounds();
        const layer = this.ensureGhostVeilCanvas(bounds.width, bounds.height);
        if (!layer || !this.ghostVeilCtx) return null;

        const lctx = this.ghostVeilCtx;
        const time = this.motionTime * 0.01;
        const refractX = (Math.sin(time * 1.4) + Math.cos(time * 0.9)) * 2.2;
        const refractY = Math.cos(time * 1.1) * 1.8;

        lctx.save();
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, bounds.width, bounds.height);

        // 背景の写り込みと屈折ズレを重ねて、光学迷彩らしさを作る
        lctx.globalCompositeOperation = 'source-over';
        lctx.globalAlpha = 1;
        lctx.filter = 'blur(1.2px) saturate(120%)';
        lctx.drawImage(
            ctx.canvas,
            bounds.x, bounds.y, bounds.width, bounds.height,
            0, 0, bounds.width, bounds.height
        );
        lctx.globalAlpha = 0.52;
        lctx.filter = 'blur(2.1px)';
        lctx.drawImage(
            ctx.canvas,
            bounds.x + refractX, bounds.y + refractY, bounds.width, bounds.height,
            0, 0, bounds.width, bounds.height
        );
        lctx.filter = 'none';

        // プレイヤー形状でマスク
        lctx.globalAlpha = 1;
        lctx.globalCompositeOperation = 'destination-in';
        const savedAttack = this.isAttacking;
        const savedCurrentAttack = this.currentAttack;
        const savedAttackTimer = this.attackTimer;
        const savedSubAction = this.subWeaponAction;
        const savedSubTimer = this.subWeaponTimer;
        this.isAttacking = false;
        this.currentAttack = null;
        this.attackTimer = 0;
        this.subWeaponAction = null;
        this.subWeaponTimer = 0;
        this.renderModel(
            lctx,
            this.x - bounds.x,
            this.y - bounds.y,
            facingRight,
            1.0,
            true,
            { forceSubWeaponRender: false }
        );
        this.isAttacking = savedAttack;
        this.currentAttack = savedCurrentAttack;
        this.attackTimer = savedAttackTimer;
        this.subWeaponAction = savedSubAction;
        this.subWeaponTimer = savedSubTimer;

        // 迷彩特有のうっすらした走査ライン
        lctx.globalCompositeOperation = 'source-atop';
        lctx.globalAlpha = 0.38;
        const sheen = lctx.createLinearGradient(
            0,
            bounds.height * (0.2 + Math.sin(time * 0.8) * 0.06),
            bounds.width,
            bounds.height * 0.82
        );
        sheen.addColorStop(0, 'rgba(120, 210, 255, 0)');
        sheen.addColorStop(0.38, 'rgba(186, 236, 255, 0.28)');
        sheen.addColorStop(0.62, 'rgba(82, 160, 220, 0.16)');
        sheen.addColorStop(1, 'rgba(120, 210, 255, 0)');
        lctx.fillStyle = sheen;
        lctx.fillRect(0, 0, bounds.width, bounds.height);
        lctx.restore();

        return { canvas: layer, x: bounds.x, y: bounds.y };
    }

    applyTemporaryNinjutsuChoice(choiceId) {
        if (!this.progression || !this.tempNinjutsuTimers || !this.tempNinjutsuDurations) return false;

        const addRemainingDuration = (key) => {
            const current = Math.max(0, this.tempNinjutsuTimers[key] || 0);
            const add = Math.max(0, this.tempNinjutsuDurations[key] || 0);
            this.tempNinjutsuTimers[key] = current + add;
        };

        if (choiceId === 'temp_exp_magnet') {
            addRemainingDuration('expMagnet');
            return true;
        }
        if (choiceId === 'temp_x_attack') {
            addRemainingDuration('xAttack');
            return true;
        }
        if (choiceId === 'temp_ghost_veil') {
            addRemainingDuration('ghostVeil');
            return true;
        }
        return false;
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
        this.specialCloneDurability = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
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
            // 大槍/鎖鎌などのLv別挙動は enhanceTier 側で分岐するため先に同期する
            if (typeof weapon.applyEnhanceTier === 'function') {
                weapon.applyEnhanceTier(tier);
            } else if (Object.prototype.hasOwnProperty.call(weapon, 'enhanceTier')) {
                weapon.enhanceTier = tier;
            }
            const baseDamage = Number.isFinite(weapon.baseDamage) ? weapon.baseDamage : weapon.damage;
            const baseRange = Number.isFinite(weapon.baseRange) ? weapon.baseRange : weapon.range;
            const baseCooldown = Number.isFinite(weapon.baseCooldown) ? weapon.baseCooldown : weapon.cooldown;
            let damageScale = 1 + tier * 0.08;
            let rangeScale = 1 + tier * 0.1;
            if (weapon.name === '手裏剣') {
                damageScale = 1 + tier * 0.08;
                rangeScale = 1 + tier * 0.12;
            } else if (weapon.name === '火薬玉') {
                damageScale = 1 + tier * 0.08;
                rangeScale = 1 + tier * 0.08;
            } else if (weapon.name === '大槍') {
                damageScale = 1 + tier * 0.12;
                rangeScale = 1 + tier * 0.2;
            } else if (weapon.name === '鎖鎌') {
                damageScale = 1 + tier * 0.12;
                rangeScale = 1 + tier * 0.18;
            } else if (weapon.name === '大太刀') {
                damageScale = 1 + tier * 0.15;
                rangeScale = 1 + tier * 0.1;
            } else if (weapon.name === '二刀流') {
                damageScale = 1 + tier * 0.09;
                rangeScale = 1 + tier * 0.08;
                if (typeof weapon.mainMotionSpeedScale === 'number') {
                    weapon.mainMotionSpeedScale = Math.max(1.05, (this.attackMotionScale || 1.7) - tier * 0.08);
                }
            }
            weapon.damage = Math.max(1, Math.round(baseDamage * damageScale));
            weapon.range = Math.max(24, Math.round(baseRange * rangeScale));
            weapon.cooldown = Math.max(70, Math.round(baseCooldown));
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
            this.legPhase = 0;
            this.legAngle += (0 - this.legAngle) * 0.34;
        } else if (isGroundMoving) {
            const baseFreq = this.isDashing ? 0.027 : (this.isCrouching ? 0.014 : 0.018);
            const speedScale = this.isDashing ? 1.0 : Math.min(1.25, horizontalSpeed / Math.max(1, this.speed));
            this.legPhase += deltaTime * 1000 * baseFreq * (0.72 + speedScale * 0.68);
            const amplitude = this.isDashing ? 1.08 : (this.isCrouching ? 0.52 : 0.86);
            const targetAngle = Math.sin(this.legPhase) * amplitude;
            this.legAngle += (targetAngle - this.legAngle) * 0.52;
        } else if (this.isGrounded) {
            this.legPhase = 0;
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

        if (this.isDefeated) {
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
                    let correction = (dist - targetDist) * tension;
                    const maxDist = targetDist * 1.35;
                    if (dist - correction > maxDist) correction = dist - maxDist;
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
                    let correction = (dist - targetDist) * tension;
                    const maxDist = targetDist * 1.35;
                    if (dist - correction > maxDist) correction = dist - maxDist;
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

    drawPonytail(ctx, headCenterX, headY, alpha, facingRight, bob, phase) {
        const dir = facingRight ? 1 : -1;
        const silhouetteColor = '#1a1a1a';
        const tailLength = 22;
        const wave = Math.sin((this.motionTime || 0) * 0.008 + phase) * 2.5;

        ctx.save();
        ctx.fillStyle = silhouetteColor;
        ctx.beginPath();

        const baseX = headCenterX - dir * 4;
        const baseY = headY - 12;
        const tipX = baseX - dir * tailLength;
        const tipY = baseY + 8 + wave;
        const cpX = baseX - dir * (tailLength * 0.5);
        const cpY = baseY - 4 + wave * 0.5;

        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(cpX, cpY - 5, tipX, tipY - 2);
        ctx.lineTo(tipX + dir * 1, tipY + 2);
        ctx.quadraticCurveTo(cpX, cpY + 8, baseX, baseY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawKatana(ctx, x, y, angle, scaleDir = 1, bladeLength = this.getKatanaBladeLength(), uprightBlend = 0.28) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scaleDir, 1);
        // 垂直方向(-90度)へ角度を寄せて、刀全体を立たせる
        const uprightTarget = -Math.PI / 2;
        const blend = Math.max(0, Math.min(1, uprightBlend));
        const adjustedAngle = angle + (uprightTarget - angle) * blend;
        ctx.rotate(adjustedAngle);

        const scale = 0.52;
        ctx.scale(scale, scale);
        // 剣筋(エフェクト)基準より見た目の刀身だけ少し短くする
        const visualBladeLength = Math.max(18, bladeLength - 5);
        const bladeReach = visualBladeLength / scale;

        const gripOffset = 10;

        // === 柄（つか）===
        const handleStart = -23.5;
        const handleEnd = gripOffset - 1;
        const handleLen = handleEnd - handleStart;
        const handleHalfH = 2.6;

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(handleStart, -handleHalfH);
        ctx.lineTo(handleEnd, -handleHalfH + 0.3);
        ctx.lineTo(handleEnd, handleHalfH - 0.3);
        ctx.lineTo(handleStart, handleHalfH);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 0.7;
        const wrapSpacing = 4.2;
        const wrapCount = Math.floor(handleLen / wrapSpacing);
        for (let i = 0; i <= wrapCount; i++) {
            const wx = handleStart + i * wrapSpacing;
            ctx.beginPath();
            ctx.moveTo(wx, -handleHalfH + 0.4);
            ctx.lineTo(wx + wrapSpacing * 0.5, handleHalfH - 0.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(wx, handleHalfH - 0.4);
            ctx.lineTo(wx + wrapSpacing * 0.5, -handleHalfH + 0.4);
            ctx.stroke();
        }

        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.ellipse(handleStart - 0.5, 0, 1.5, handleHalfH + 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // === 鍔（つば）===
        const tsubaX = gripOffset;
        const tsubaRX = 1.8;
        const tsubaRY = 4.4;

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(tsubaX + 0.2, 0.2, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
        ctx.fill();

        const tsubaGrad = ctx.createLinearGradient(tsubaX, -tsubaRY, tsubaX, tsubaRY);
        tsubaGrad.addColorStop(0, '#555');
        tsubaGrad.addColorStop(0.45, '#2a2a2a');
        tsubaGrad.addColorStop(0.55, '#222');
        tsubaGrad.addColorStop(1, '#444');
        ctx.fillStyle = tsubaGrad;
        ctx.beginPath();
        ctx.ellipse(tsubaX, 0, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(tsubaX, 0, tsubaRX, tsubaRY, 0, 0, Math.PI * 2);
        ctx.stroke();

        // === はばき ===
        const habakiX = tsubaX + tsubaRX + 0.4;
        ctx.fillStyle = '#c9a545';
        ctx.fillRect(habakiX, -1.8, 2.2, 3.6);
        ctx.strokeStyle = '#a07828';
        ctx.lineWidth = 0.4;
        ctx.strokeRect(habakiX, -1.8, 2.2, 3.6);

        // === 刀身 ===
        const bladeStart = habakiX + 2.2;
        // 先端を剣筋発生位置(= bladeLength)に合わせる
        const bladeEnd = Math.max(bladeStart + 10, bladeReach);
        const bl = bladeEnd - bladeStart;
        const seg = 56;

        // シンプル刀身:
        // - 白ベース（刀身全体は円弧）
        // - 白の峰側に、幅1/2・少し短い黒レイヤーを重ねる
        // - 先端は右下側のみ丸みを残して細くする
        const getTX = (t) => bladeStart + (bladeEnd - bladeStart) * t;
        const sori = bl * 0.18;
        // 根本(t=0)は直線時と同じ位置・同じ入り方にする
        const getArcY = (t) => -(Math.pow(t, 1.8) * sori) + 0.06;

        const whiteHalf = 2.2;
        const getWhiteUpperY = (t) => getArcY(t) - whiteHalf;
        const getWhiteLowerY = (t) => getArcY(t) + whiteHalf;

        const upperPoints = [];
        const lowerPoints = [];
        for (let i = 0; i <= seg; i++) {
            const t = i / seg;
            upperPoints.push({ x: getTX(t), y: getWhiteUpperY(t) });
            lowerPoints.push({ x: getTX(t), y: getWhiteLowerY(t) });
        }

        // 先端形状:
        // 峰側(上)はそのまま終端まで伸ばし、刃側(下)だけ先端へ向かって絞る
        const tipY = upperPoints[seg].y;
        const edgeStartIndex = Math.floor(seg * 0.9);
        const edgeStart = lowerPoints[edgeStartIndex];
        const edgeSpanX = bladeEnd - edgeStart.x;
        const edgeCtrl1X = bladeEnd - edgeSpanX * 0.16;
        const edgeCtrl1Y = tipY + whiteHalf * 0.2;
        const edgeCtrl2X = edgeStart.x + edgeSpanX * 0.38;
        const edgeCtrl2Y = edgeStart.y - whiteHalf * 0.24;
        // 黒レイヤーは少し太く・長くし、峰側の隙間を潰す
        const blackBandWidth = whiteHalf * 1.18;
        const blackTopShift = -0.34;
        const blackBottomOverlap = 0.08;
        const blackTipIndex = Math.min(seg - 1, Math.floor(seg * 0.965));
        const blackTip = {
            x: upperPoints[blackTipIndex].x,
            y: upperPoints[blackTipIndex].y + blackTopShift
        };
        const blackEdgeStartIndex = Math.max(1, Math.floor(blackTipIndex * 0.89));
        const blackEdgeStart = {
            x: upperPoints[blackEdgeStartIndex].x,
            y: upperPoints[blackEdgeStartIndex].y + blackBandWidth + blackBottomOverlap
        };
        const blackEdgeSpanX = blackTip.x - blackEdgeStart.x;
        const blackCtrl1X = blackTip.x - blackEdgeSpanX * 0.16;
        const blackCtrl1Y = blackTip.y + blackBandWidth * 0.2;
        const blackCtrl2X = blackEdgeStart.x + blackEdgeSpanX * 0.38;
        const blackCtrl2Y = blackEdgeStart.y - blackBandWidth * 0.24;

        // --- 白刀身 ---
        // 白を少し銀寄りに抑えて、和鋼の質感に近づける
        ctx.fillStyle = '#e6ecf2';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
        for (let i = 1; i <= seg; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
        // 刃側だけを先端に向けて絞って尖らせる
        ctx.bezierCurveTo(edgeCtrl1X, edgeCtrl1Y, edgeCtrl2X, edgeCtrl2Y, edgeStart.x, edgeStart.y);
        for (let i = edgeStartIndex - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
        ctx.closePath();
        ctx.fill();

        // 峰側エッジの明るい隙間を消すために、黒で上縁をなぞる
        ctx.strokeStyle = '#1b2430';
        ctx.lineWidth = 0.85;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
        for (let i = 1; i <= blackTipIndex; i++) {
            ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
        }
        ctx.stroke();

        // --- 峰側の黒レイヤ ---
        // 漆黒ではなく暗い鋼色
        ctx.fillStyle = '#1b2430';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y + blackTopShift);
        for (let i = 1; i <= blackTipIndex; i++) {
            ctx.lineTo(upperPoints[i].x, upperPoints[i].y + blackTopShift);
        }
        ctx.bezierCurveTo(blackCtrl1X, blackCtrl1Y, blackCtrl2X, blackCtrl2Y, blackEdgeStart.x, blackEdgeStart.y);
        for (let i = blackEdgeStartIndex - 1; i >= 0; i--) {
            ctx.lineTo(upperPoints[i].x, upperPoints[i].y + blackBandWidth + blackBottomOverlap);
        }
        ctx.closePath();
        ctx.fill();

        // --- 黒と白の境界にグレーのグラデーション ---
        // 刃文を落ち着かせる（細かすぎる波を抑える）
        const seamWaveAmp = 0.10;
        const seamWaveFreq = 7.0;
        const seamBaseY = (i) => upperPoints[i].y + blackBandWidth + blackBottomOverlap;
        const seamWaveY = (i) => {
            if (blackEdgeStartIndex <= 0) return seamBaseY(i);
            const t = i / blackEdgeStartIndex;
            const wave = Math.sin(t * Math.PI * seamWaveFreq) * seamWaveAmp;
            return seamBaseY(i) + wave;
        };
        const seamGrad = ctx.createLinearGradient(
            bladeStart, getArcY(0) + blackBandWidth - 1.1,
            bladeStart, getArcY(0) + blackBandWidth + 0.9
        );
        seamGrad.addColorStop(0, 'rgba(70, 78, 92, 0.82)');
        seamGrad.addColorStop(0.45, 'rgba(145, 155, 170, 0.78)');
        seamGrad.addColorStop(1, 'rgba(225, 234, 244, 0.62)');
        ctx.strokeStyle = seamGrad;
        ctx.lineWidth = 1.15;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, seamWaveY(0));
        for (let i = 1; i <= blackEdgeStartIndex; i++) {
            ctx.lineTo(upperPoints[i].x, seamWaveY(i));
        }
        ctx.bezierCurveTo(
            blackCtrl2X, blackCtrl2Y + seamWaveAmp * 0.8,
            blackCtrl1X, blackCtrl1Y - seamWaveAmp * 0.6,
            blackTip.x, blackTip.y
        );
        ctx.stroke();

        // 横手筋（切っ先境界）を薄く追加
        const yokoteX = upperPoints[edgeStartIndex].x;
        const yokoteTopY = upperPoints[edgeStartIndex].y + 0.1;
        const yokoteBottomY = lowerPoints[edgeStartIndex].y - 0.2;
        ctx.strokeStyle = 'rgba(210, 220, 230, 0.38)';
        ctx.lineWidth = 0.42;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(yokoteX, yokoteTopY);
        ctx.lineTo(yokoteX, yokoteBottomY);
        ctx.stroke();

        // 全周輪郭は暗めにして、峰側で白が見えないようにする
        ctx.strokeStyle = '#4e5867';
        ctx.lineWidth = 0.52;
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 6;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
        for (let i = 1; i <= seg; i++) ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
        ctx.bezierCurveTo(edgeCtrl1X, edgeCtrl1Y, edgeCtrl2X, edgeCtrl2Y, edgeStart.x, edgeStart.y);
        for (let i = edgeStartIndex - 1; i >= 0; i--) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
        ctx.closePath();
        ctx.stroke();

        // 明るい縁は刃側だけに限定
        ctx.strokeStyle = '#d6e0ea';
        ctx.lineWidth = 0.42;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lowerPoints[0].x, lowerPoints[0].y);
        for (let i = 1; i <= edgeStartIndex; i++) ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
        ctx.bezierCurveTo(edgeCtrl2X, edgeCtrl2Y, edgeCtrl1X, edgeCtrl1Y, upperPoints[seg].x, upperPoints[seg].y);
        ctx.stroke();

        ctx.restore();
    }
    
    render(ctx, options = {}) {
        ctx.save();
        this.subWeaponRenderedInModel = false;
        const filterParts = [];
        const ghostVeilActive = this.isGhostVeilActive();
        const ghostVeilBounds = ghostVeilActive ? this.getGhostVeilBounds() : null;
        const ghostVeilCanvas = ghostVeilBounds
            ? this.ensureGhostVeilCanvas(ghostVeilBounds.width, ghostVeilBounds.height)
            : null;

        // 必殺技詠唱中は軽く明るくする
        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            const progress = 1 - (this.specialCastTimer / Math.max(1, this.specialCastDurationMs));
            filterParts.push(`brightness(${100 + progress * 28}%)`);
        }

        // ダメージフラッシュ
        if (this.damageFlashTimer > 0) {
            const hitRatio = Math.max(0, Math.min(1, this.damageFlashTimer / 300));
            const brightness = 140 + hitRatio * 120;
            const saturation = Math.max(35, 100 - hitRatio * 55);
            filterParts.push(`brightness(${brightness}%) saturate(${saturation}%)`);
        }

        // 空蝉透遁中は半透明化（全体フィルタは重いので適用しない）
        if (filterParts.length > 0) {
            ctx.filter = filterParts.join(' ');
        }

        // 無敵時間中は点滅（死亡中は点滅しない）
        if (!this.isGhostVeilActive() && !this.isDefeated && !this.isUsingSpecial && this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 100) % 2 === 0) {
            ctx.globalAlpha *= 0.5;
        }

        // 残像
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

        // 本体描画
        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            this.renderSpecialCastPose(ctx, this.x, this.y, this.facingRight, ctx.globalAlpha);
        } else {
            this.renderComboSlashTrail(ctx);
            if (ghostVeilActive && ghostVeilCanvas && this.ghostVeilCtx && ghostVeilBounds) {
                // 1枚に合成してから透明化することで、重なり部だけ濃くならないようにする
                const lctx = this.ghostVeilCtx;
                lctx.save();
                lctx.setTransform(1, 0, 0, 1, 0, 0);
                lctx.clearRect(0, 0, ghostVeilBounds.width, ghostVeilBounds.height);
                lctx.translate(-ghostVeilBounds.x, -ghostVeilBounds.y);
                this.renderModel(
                    lctx,
                    this.x,
                    this.y,
                    this.facingRight,
                    1.0,
                    true,
                    {}
                );
                lctx.restore();

                ctx.save();
                ctx.filter = 'blur(0.22px)';
                ctx.globalAlpha *= this.getGhostVeilAlpha();
                ctx.drawImage(ghostVeilCanvas, ghostVeilBounds.x, ghostVeilBounds.y);
                ctx.restore();
            } else {
                this.renderModel(ctx, this.x, this.y, this.facingRight, ctx.globalAlpha, true, {});
            }
        }

        ctx.restore();
        ctx.filter = 'none';
        ctx.shadowBlur = 0;
    }

    renderModel(ctx, x, y, facingRight, alpha = 1.0, renderSubWeaponVisualsInput = true, options = {}) {
        // 無敵時間中の点滅
        if (this.invincibleTimer > 0) {
            // 約60fps想定で、2フレームごとに1フレーム非表示にする（高速点滅）
            if (Math.floor(this.motionTime / 32) % 2 === 0) {
                return;
            }
        }

        ctx.save();
        if (alpha !== 1.0) ctx.globalAlpha *= alpha;
        const useLiveAccessories = options.useLiveAccessories !== false;
        const renderHeadbandTail = options.renderHeadbandTail !== false;
        const forceSubWeaponRender = options.forceSubWeaponRender || false;
        const renderSubWeaponVisuals = renderSubWeaponVisualsInput;

        const originalX = this.x;
        const originalY = this.y;
        this.x = x;
        this.y = y;
        this.forceSubWeaponRender = forceSubWeaponRender;

        // 変数定義
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        const state = options.state || this;
        const time = state.motionTime !== undefined ? state.motionTime : this.motionTime;
        const vx = state.vx !== undefined ? state.vx : this.vx;
        const vy = state.vy !== undefined ? state.vy : this.vy;
        const isDashing = state.isDashing !== undefined ? state.isDashing : this.isDashing;
        const isGrounded = state.isGrounded !== undefined ? state.isGrounded : this.isGrounded;
        const isAttacking = state.isAttacking !== undefined ? state.isAttacking : this.isAttacking;
        const currentAttack = state.currentAttack !== undefined ? state.currentAttack : this.currentAttack;
        const attackTimer = state.attackTimer !== undefined ? state.attackTimer : this.attackTimer;
        const subWeaponTimer = state.subWeaponTimer !== undefined ? state.subWeaponTimer : this.subWeaponTimer;
        const subWeaponAction = state.subWeaponAction !== undefined ? state.subWeaponAction : this.subWeaponAction;
        const isCrouching = state.isCrouching !== undefined ? state.isCrouching : this.isCrouching;

        const isMoving = Math.abs(vx) > 0.1 || !isGrounded;
// ---
        const silhouetteColor = (options.palette && options.palette.silhouette) || '#1a1a1a';
        const accentColor = (options.palette && options.palette.accent) || '#00bfff';
// ---

        const isCrouchPose = isCrouching;
        const isSpearThrustPose = subWeaponTimer > 0 && subWeaponAction === '大槍' && !isAttacking;
        const spearPoseProgress = isSpearThrustPose ? Math.max(0, Math.min(1, 1 - (subWeaponTimer / 270))) : 0;
        const spearDrive = isSpearThrustPose ? Math.sin(spearPoseProgress * Math.PI) : 0;
        const comboAttackingPose = !!(isAttacking && currentAttack && currentAttack.comboStep);
        const isDualZComboPose = !!(
            !isAttacking &&
            subWeaponTimer > 0 &&
            subWeaponAction === '二刀_Z' &&
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            typeof this.currentSubWeapon.getMainSwingPose === 'function'
        );

        const dualZPoseOptions = (
            this.subWeaponPoseOverride &&
            subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : undefined;
        const dualZPose = isDualZComboPose
            ? this.currentSubWeapon.getMainSwingPose(dualZPoseOptions || {})
            : null;
        const speedAbs = Math.abs(this.vx);
        const comboStepPose = comboAttackingPose && currentAttack ? (currentAttack.comboStep || 0) : 0;
        const comboPoseProgress = comboStepPose
            ? Math.max(0, Math.min(1, 1 - (attackTimer / Math.max(1, (currentAttack && currentAttack.durationMs) || PLAYER.ATTACK_COOLDOWN))))
            : 0;
        const isRunLike = !comboAttackingPose && isGrounded && speedAbs > 0.85;
        const isDashLike = !comboAttackingPose && (isDashing || speedAbs > this.speed * 1.45);
        const locomotionPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
        const crouchWalkPhase = (isCrouchPose && isRunLike) ? locomotionPhase : 0;
        const crouchIdlePhase = (isCrouchPose && !isRunLike) ? Math.sin(this.motionTime * 0.006) : 0;
        const crouchBodyBob = isCrouchPose
            ? (isRunLike ? crouchWalkPhase * 0.4 : crouchIdlePhase * 0.2)
            : 0;
        const crouchLeanShift = isCrouchPose ? crouchWalkPhase * 0.55 : 0;

        let bob = 0;
        if (isCrouchPose) {
            bob = crouchBodyBob;
        } else if (!isGrounded) {
            bob = Math.max(-1.4, Math.min(1.6, -vy * 0.07));
        } else if (comboStepPose === 1 || comboStepPose === 2) {
            // Z1〜2段は歩行揺れを無効化し、短い重心移動のみで自然化
            bob = -Math.sin(comboPoseProgress * Math.PI) * 0.34;
        } else if (isRunLike) {
            bob = Math.abs(locomotionPhase) * (isDashLike ? 3.6 : 2.5);
        } else {
            bob = Math.sin(this.motionTime * 0.005) * 1.0;
        }

        let headY = isCrouchPose
            ? (bottomY - 32 + bob)
            : (y + 15 + bob - (isSpearThrustPose ? spearDrive * 2.0 : 0));
        const headRadius = 14;
        let bodyTopY = headY + (isCrouchPose ? 7.8 : 8);
        let hipY = isCrouchPose
            ? (bottomY - 13.2 + bob * 0.45)
            : (bottomY - 20 - (isSpearThrustPose ? spearDrive * 3.2 : 0));

        let currentTorsoLean = isDashLike ? dir * 2.4 : (isRunLike ? dir * 1.6 : dir * 0.45);
        if (comboStepPose === 1) currentTorsoLean = dir * 0.24;
        if (comboStepPose === 2) currentTorsoLean = dir * 1.2;
        let torsoShoulderX = centerX + (isCrouchPose ? dir * 4.0 : currentTorsoLean) + dir * crouchLeanShift;
        let torsoHipX = isCrouchPose
            ? (centerX + dir * 1.3 + dir * crouchLeanShift * 0.55)
            : (centerX + dir * 0.2);
        let headCenterX = centerX;

        {
            // 通常ポーズ計算（攻撃・武器・移動など）
            if (isDualZComboPose && dualZPose) {
                const p = dualZPose.progress || 0;
                const s = dualZPose.comboIndex || 0;
                const wave = Math.sin(p * Math.PI);
                const twist = Math.sin(p * Math.PI * 2);
                if (s === 1) {
                    headY -= 0.9 + wave * 1.0;
                    bodyTopY -= 0.8 + wave * 0.9;
                    hipY -= 0.3 + wave * 0.4;
                    torsoShoulderX += dir * (3.0 + wave * 4.8);
                    torsoHipX += dir * (1.4 + wave * 2.0);
                } else if (s === 2) {
                    headY -= 0.3 + wave * 0.9;
                    bodyTopY -= 0.2 + wave * 0.7;
                    torsoShoulderX -= dir * (3.8 + wave * 5.0);
                    torsoHipX -= dir * (2.2 + wave * 2.8);
                } else if (s === 3) {
                    headY -= 0.4 + wave * 0.6;
                    bodyTopY -= 0.2 + wave * 0.4;
                    torsoShoulderX += dir * (twist * 7.2);
                    torsoHipX -= dir * (1.0 + wave * 1.3);
                } else if (s === 4) {
                    headY -= 2.8 + wave * 4.2;
                    bodyTopY -= 2.0 + wave * 3.1;
                    hipY -= 1.2 + wave * 2.3;
                    torsoShoulderX += dir * (2.2 + twist * 5.2);
                    torsoHipX -= dir * (2.0 + wave * 1.6);
                } else {
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
        
        // 体
        ctx.strokeStyle = silhouetteColor;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(torsoShoulderX, bodyTopY);
        ctx.lineTo(torsoHipX, hipY);
        ctx.stroke();

        // 足
        const drawJointedLeg = (hipX, hipYLocal, kneeX, kneeY, footX, footY, isFrontLeg = false, bendBias = 1) => {
            const thighWidth = isFrontLeg ? 5.1 : 4.2;
            const shinWidth = isFrontLeg ? 4.8 : 4.0;
            const kneeRadius = isFrontLeg ? 2.9 : 2.45;
            const footRadiusX = isFrontLeg ? 2.8 : 2.4;
            const footRadiusY = isFrontLeg ? 1.4 : 1.18;
            let kneeAdjX = kneeX;
            let kneeAdjY = kneeY;
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
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(kneeAdjX, kneeAdjY, kneeRadius, 0, Math.PI * 2);
            ctx.fill();
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
                backKneeX = backHipX - dir * (1.8 + comboArc * 1.3); backKneeY = hipLocalY + 8.6 - comboArc * 1.0; backFootX = centerX - dir * (5.6 + comboArc * 2.8); backFootY = bottomY - 0.8 - airborneLift * 0.45; frontKneeX = frontHipX + dir * (3.2 + comboArc * 1.8); frontKneeY = hipLocalY + 8.2 - comboArc * 0.9; frontFootX = centerX + dir * (8.4 + comboArc * 3.8); frontFootY = bottomY - 1.1 - airborneLift * 0.45;
            } else if (comboStep === 2) {
                backKneeX = backHipX + dir * (3.0 + comboArc * 1.5); backKneeY = hipLocalY + 8.8 - comboArc * 0.9; backFootX = centerX + dir * (7.6 + comboArc * 3.0); backFootY = bottomY - 0.8 - airborneLift * 0.5; frontKneeX = frontHipX - dir * (2.8 + comboArc * 1.9); frontKneeY = hipLocalY + 9.1 - comboArc * 0.9; frontFootX = centerX - dir * (8.2 + comboArc * 3.8); frontFootY = bottomY - 0.9 - airborneLift * 0.5;
            } else if (comboStep === 3) {
                backKneeX = backHipX - dir * (3.2 - comboArc * 0.9); backKneeY = hipLocalY + 8.6 - comboArc * 0.9; backFootX = centerX - dir * (8.8 + comboArc * 3.2); backFootY = bottomY - 0.8 - airborneLift * 0.32; frontKneeX = frontHipX + dir * (3.4 - comboArc * 0.8); frontKneeY = hipLocalY + 8.3 - comboArc * 0.9; frontFootX = centerX + dir * (9.1 + comboArc * 3.0); frontFootY = bottomY - 0.9 - airborneLift * 0.32;
            } else if (comboStep === 4) {
                backKneeX = backHipX - dir * (2.4 - comboArc * 1.3); backKneeY = hipLocalY + 8.1 - comboArc * 2.4; backFootX = centerX - dir * (7.4 + comboArc * 3.8); backFootY = bottomY - 1.4 - airborneLift * 0.66; frontKneeX = frontHipX + dir * (2.0 - comboArc * 1.2); frontKneeY = hipLocalY + 7.7 - comboArc * 2.2; frontFootX = centerX + dir * (6.4 + comboArc * 3.4); frontFootY = bottomY - 1.6 - airborneLift * 0.66;
            } else if (comboStep === 0) {
                backKneeX = backHipX - dir * (1.5 - comboArc * 0.8); backKneeY = hipLocalY + 8.7 + comboArc * 1.2; backFootX = centerX - dir * (4.9 - comboArc * 1.8); backFootY = bottomY - 1.6 + comboArc * 1.1 - airborneLift * 0.62; frontKneeX = frontHipX + dir * (1.3 - comboArc * 0.7); frontKneeY = hipLocalY + 8.5 + comboArc * 1.2; frontFootX = centerX + dir * (4.4 - comboArc * 1.7); frontFootY = bottomY - 1.7 + comboArc * 1.2 - airborneLift * 0.62;
            }
            drawJointedLeg(backHipX, hipLocalY + 0.3, backKneeX, backKneeY, backFootX, backFootY, false, 1.1);
            drawJointedLeg(frontHipX, hipLocalY + 0.1, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.08);
        } else if (comboAttackingPose && !isSpearThrustPose && !isCrouchPose) {
            const attack = currentAttack || this.currentAttack;
            if (!attack) { this.x = originalX; this.y = originalY; ctx.restore(); return; }
            const comboStep = attack.comboStep || 1;
            const comboDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
            const comboProgress = Math.max(0, Math.min(1, 1 - (attackTimer / comboDuration)));
            const comboArc = Math.sin(comboProgress * Math.PI);
            const baseLift = Math.max(0, Math.min(1, Math.abs(vx) / 14));
            const airborneLift = !isGrounded ? 4.8 + baseLift * 4.4 : 0;
            const hipLocalY = hipY - airborneLift;
            const backHipX = torsoHipX + dir * 1.3;
            const frontHipX = torsoHipX - dir * 1.2;
            let backKneeX = backHipX + dir * 0.8, backKneeY = hipLocalY + 10.1, backFootX = centerX + dir * 2.6, backFootY = bottomY + 0.2 - airborneLift * 0.55;
            let frontKneeX = frontHipX + dir * 0.9, frontKneeY = hipLocalY + 9.5, frontFootX = centerX - dir * 3.0, frontFootY = bottomY - 0.2 - airborneLift * 0.52;
            if (comboStep === 2) {
                // 2撃目: 初期→踏み込み→終端を単調補間してブレを防ぐ
                const smooth = (t) => t * t * (3 - 2 * t);
                const lerp = (a, b, t) => a + (b - a) * t;
                const blendPose = (a, b, t) => ({
                    backKneeX: lerp(a.backKneeX, b.backKneeX, t),
                    backKneeY: lerp(a.backKneeY, b.backKneeY, t),
                    backFootX: lerp(a.backFootX, b.backFootX, t),
                    backFootY: lerp(a.backFootY, b.backFootY, t),
                    frontKneeX: lerp(a.frontKneeX, b.frontKneeX, t),
                    frontKneeY: lerp(a.frontKneeY, b.frontKneeY, t),
                    frontFootX: lerp(a.frontFootX, b.frontFootX, t),
                    frontFootY: lerp(a.frontFootY, b.frontFootY, t)
                });
                const startPose = {
                    // 一段目終端の姿勢からそのまま開始
                    backKneeX: backHipX - dir * 2.0,
                    backKneeY: hipLocalY + 8.8,
                    backFootX: centerX - dir * 5.2,
                    backFootY: bottomY - 0.88 - airborneLift * 0.5,
                    frontKneeX: frontHipX + dir * 3.4,
                    frontKneeY: hipLocalY + 9.08,
                    frontFootX: centerX + dir * 8.7,
                    frontFootY: bottomY - 0.5 - airborneLift * 0.48
                };
                const drivePose = {
                    backKneeX: backHipX - dir * 2.6,
                    backKneeY: hipLocalY + 8.8,
                    backFootX: centerX - dir * 6.1,
                    backFootY: bottomY - 0.86 - airborneLift * 0.46,
                    frontKneeX: frontHipX + dir * 3.4,
                    frontKneeY: hipLocalY + 8.4,
                    frontFootX: centerX + dir * 9.3,
                    frontFootY: bottomY - 1.18 - airborneLift * 0.46
                };
                const settlePose = {
                    backKneeX: backHipX - dir * 2.2,
                    backKneeY: hipLocalY + 8.95,
                    backFootX: centerX - dir * 5.5,
                    backFootY: bottomY - 0.84 - airborneLift * 0.46,
                    frontKneeX: frontHipX + dir * 3.0,
                    frontKneeY: hipLocalY + 8.55,
                    frontFootX: centerX + dir * 7.5,
                    frontFootY: bottomY - 1.08 - airborneLift * 0.46
                };
                const driveT = smooth(Math.max(0, Math.min(1, comboProgress / 0.72)));
                const settleT = smooth(Math.max(0, Math.min(1, (comboProgress - 0.84) / 0.16)));
                const driven = blendPose(startPose, drivePose, driveT);
                const posed = blendPose(driven, settlePose, settleT);
                backKneeX = posed.backKneeX;
                backKneeY = posed.backKneeY;
                backFootX = posed.backFootX;
                backFootY = posed.backFootY;
                frontKneeX = posed.frontKneeX;
                frontKneeY = posed.frontKneeY;
                frontFootX = posed.frontFootX;
                frontFootY = posed.frontFootY;
            } else if (comboStep === 1) {
                // 1撃目: 返し斬りは行うが、下半身は前進姿勢を維持してバックステップしない
                const smooth = (t) => t * t * (3 - 2 * t);
                const lerp = (a, b, t) => a + (b - a) * t;
                const blendPose = (a, b, t) => ({
                    backKneeX: lerp(a.backKneeX, b.backKneeX, t),
                    backKneeY: lerp(a.backKneeY, b.backKneeY, t),
                    backFootX: lerp(a.backFootX, b.backFootX, t),
                    backFootY: lerp(a.backFootY, b.backFootY, t),
                    frontKneeX: lerp(a.frontKneeX, b.frontKneeX, t),
                    frontKneeY: lerp(a.frontKneeY, b.frontKneeY, t),
                    frontFootX: lerp(a.frontFootX, b.frontFootX, t),
                    frontFootY: lerp(a.frontFootY, b.frontFootY, t)
                });
                const startPose = {
                    backKneeX: backHipX - dir * 2.2,
                    backKneeY: hipLocalY + 8.95,
                    backFootX: centerX - dir * 5.8,
                    backFootY: bottomY - 0.84 - airborneLift * 0.5,
                    frontKneeX: frontHipX + dir * 3.0,
                    frontKneeY: hipLocalY + 9.0,
                    frontFootX: centerX + dir * 8.1,
                    frontFootY: bottomY - 0.5 - airborneLift * 0.48
                };
                const returnPose = {
                    backKneeX: backHipX - dir * 1.7,
                    backKneeY: hipLocalY + 8.55,
                    backFootX: centerX - dir * 4.6,
                    backFootY: bottomY - 0.94 - airborneLift * 0.5,
                    frontKneeX: frontHipX + dir * 3.8,
                    frontKneeY: hipLocalY + 9.15,
                    frontFootX: centerX + dir * 9.8,
                    frontFootY: bottomY - 0.52 - airborneLift * 0.48
                };
                const settlePose = {
                    backKneeX: backHipX - dir * 2.0,
                    backKneeY: hipLocalY + 8.8,
                    backFootX: centerX - dir * 5.2,
                    backFootY: bottomY - 0.88 - airborneLift * 0.5,
                    frontKneeX: frontHipX + dir * 3.4,
                    frontKneeY: hipLocalY + 9.08,
                    frontFootX: centerX + dir * 8.7,
                    frontFootY: bottomY - 0.5 - airborneLift * 0.48
                };
                const returnT = smooth(Math.max(0, Math.min(1, comboProgress / 0.76)));
                const settleT = smooth(Math.max(0, Math.min(1, (comboProgress - 0.88) / 0.12)));
                const returned = blendPose(startPose, returnPose, returnT);
                const posed = blendPose(returned, settlePose, settleT);
                backKneeX = posed.backKneeX;
                backKneeY = posed.backKneeY;
                backFootX = posed.backFootX;
                backFootY = posed.backFootY;
                frontKneeX = posed.frontKneeX;
                frontKneeY = posed.frontKneeY;
                frontFootX = posed.frontFootX;
                frontFootY = posed.frontFootY;
            }
            else if (comboStep === 3) {
                backKneeX = backHipX - dir * (2.6 - comboArc * 1.1);
                backKneeY = hipLocalY + 8.5 - comboArc * 1.4;
                backFootX = centerX - dir * (7.2 + comboArc * 2.0);
                backFootY = bottomY - 0.9 - airborneLift * 0.56;
                frontKneeX = frontHipX + dir * (2.9 - comboArc * 1.0);
                frontKneeY = hipLocalY + 8.2 - comboArc * 1.5;
                frontFootX = centerX + dir * (7.6 + comboArc * 2.2);
                frontFootY = bottomY - 1.2 - airborneLift * 0.56;
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    backKneeX: backHipX - dir * 2.2,
                    backKneeY: hipLocalY + 8.95,
                    backFootX: centerX - dir * 5.5,
                    backFootY: bottomY - 0.84 - airborneLift * 0.46,
                    frontKneeX: frontHipX + dir * 3.0,
                    frontKneeY: hipLocalY + 8.55,
                    frontFootX: centerX + dir * 7.5,
                    frontFootY: bottomY - 1.08 - airborneLift * 0.46
                };
                backKneeX = from.backKneeX + (backKneeX - from.backKneeX) * prepEase;
                backKneeY = from.backKneeY + (backKneeY - from.backKneeY) * prepEase;
                backFootX = from.backFootX + (backFootX - from.backFootX) * prepEase;
                backFootY = from.backFootY + (backFootY - from.backFootY) * prepEase;
                frontKneeX = from.frontKneeX + (frontKneeX - from.frontKneeX) * prepEase;
                frontKneeY = from.frontKneeY + (frontKneeY - from.frontKneeY) * prepEase;
                frontFootX = from.frontFootX + (frontFootX - from.frontFootX) * prepEase;
                frontFootY = from.frontFootY + (frontFootY - from.frontFootY) * prepEase;
            }
            else if (comboStep === 4) {
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
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    backKneeX: backHipX - dir * 2.6,
                    backKneeY: hipLocalY + 8.5,
                    backFootX: centerX - dir * 7.2,
                    backFootY: bottomY - 0.9 - airborneLift * 0.56,
                    frontKneeX: frontHipX + dir * 2.9,
                    frontKneeY: hipLocalY + 8.2,
                    frontFootX: centerX + dir * 7.6,
                    frontFootY: bottomY - 1.2 - airborneLift * 0.56
                };
                backKneeX = from.backKneeX + (backKneeX - from.backKneeX) * prepEase;
                backKneeY = from.backKneeY + (backKneeY - from.backKneeY) * prepEase;
                backFootX = from.backFootX + (backFootX - from.backFootX) * prepEase;
                backFootY = from.backFootY + (backFootY - from.backFootY) * prepEase;
                frontKneeX = from.frontKneeX + (frontKneeX - from.frontKneeX) * prepEase;
                frontKneeY = from.frontKneeY + (frontKneeY - from.frontKneeY) * prepEase;
                frontFootX = from.frontFootX + (frontFootX - from.frontFootX) * prepEase;
                frontFootY = from.frontFootY + (frontFootY - from.frontFootY) * prepEase;
            }
            else if (comboStep === 5) {
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
                const prepT = Math.max(0, Math.min(1, comboProgress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const from = {
                    backKneeX: backHipX - dir * 3.6,
                    backKneeY: hipLocalY + 5.2,
                    backFootX: centerX - dir * 11.8,
                    backFootY: bottomY - 2.0 - airborneLift * 0.76,
                    frontKneeX: frontHipX + dir * 1.1,
                    frontKneeY: hipLocalY + 4.7,
                    frontFootX: centerX + dir * 1.8,
                    frontFootY: bottomY - 2.3 - airborneLift * 0.84
                };
                backKneeX = from.backKneeX + (backKneeX - from.backKneeX) * prepEase;
                backKneeY = from.backKneeY + (backKneeY - from.backKneeY) * prepEase;
                backFootX = from.backFootX + (backFootX - from.backFootX) * prepEase;
                backFootY = from.backFootY + (backFootY - from.backFootY) * prepEase;
                frontKneeX = from.frontKneeX + (frontKneeX - from.frontKneeX) * prepEase;
                frontKneeY = from.frontKneeY + (frontKneeY - from.frontKneeY) * prepEase;
                frontFootX = from.frontFootX + (frontFootX - from.frontFootX) * prepEase;
                frontFootY = from.frontFootY + (frontFootY - from.frontFootY) * prepEase;
            }
            drawJointedLeg(backHipX, hipLocalY + 0.35, backKneeX, backKneeY, backFootX, backFootY, false, 1.12);
            drawJointedLeg(frontHipX, hipLocalY + 0.12, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.06);
        } else if (isCrouchPose) {
            const crouchStride = crouchWalkPhase * 2.8; const crouchLift = Math.abs(crouchWalkPhase) * 1.3;
            const backHipX = torsoHipX + dir * 1.15; const frontHipX = torsoHipX - dir * 1.35;
            const backHipYL = hipY + 0.4; const frontHipYL = hipY + 0.2;
            drawJointedLeg(backHipX, backHipYL, backHipX + dir * (3.2 + crouchStride * 0.5), hipY + 7.4 + Math.max(0, -crouchWalkPhase) * 1.4, centerX + dir * (7.0 + crouchStride), bottomY - 0.6 + crouchLift * 0.2, false, 1.0);
            drawJointedLeg(frontHipX, frontHipYL, frontHipX - dir * (3.9 - crouchStride * 0.5), hipY + 7.8 + Math.max(0, crouchWalkPhase) * 1.4, centerX - dir * (7.8 - crouchStride), bottomY - 0.2, true, 1.02);
        } else if (isSpearThrustPose) {
            const rearHipX = torsoHipX + dir * 0.9; const frontHipX2 = torsoHipX - dir * 0.9;
            const rearFootX = torsoHipX - dir * (12.8 + spearDrive * 6.2); const rearFootY = bottomY - 1.2 + spearDrive * 0.8;
            drawJointedLeg(rearHipX, hipY + 0.3, torsoHipX + dir * (2.8 + spearDrive * 1.8), hipY + 5.4 + spearDrive * 0.8, rearFootX, rearFootY, false, 1.02);
            const rearDX = rearFootX - torsoHipX; const rearDY = rearFootY - hipY; const rearLen = Math.max(0.001, Math.hypot(rearDX, rearDY)); const rearDirX = rearDX / rearLen; const rearDirY = rearDY / rearLen;
            const frontLift = spearDrive * 5.2; const frontKneeX2 = torsoHipX + dir * (7.5 + spearDrive * 4.2); const frontKneeY2 = hipY + 4.6 - frontLift * 0.42; const shinLen = 12.5 + spearDrive * 3.0;
            drawJointedLeg(frontHipX2, hipY + 0.15, frontKneeX2, frontKneeY2, frontKneeX2 + rearDirX * shinLen, frontKneeY2 + rearDirY * shinLen, true, 1.1);
        } else {
            // 空中 or 走り or 待機の足描画 — 元のコードと同一
            if (!this.isGrounded) {
                const riseTuck = this.vy < 0 ? Math.min(1, Math.abs(this.vy) / 16) : 0;
                const apexBlend = Math.max(0, 1 - Math.min(1, Math.abs(this.vy) / 4));
                const jumpTuck = Math.min(1, riseTuck + apexBlend * 0.35);
                const landPrep = this.vy > 0 ? Math.min(1, this.vy / 14) : 0;
                const drift = Math.max(-1, Math.min(1, this.vx / Math.max(1, this.speed * 1.4)));
                const leapDrive = Math.min(1, Math.abs(this.vx) / Math.max(1, this.speed * 1.2));
                const kickPose = Math.max(jumpTuck, leapDrive * 0.55) * (1 - landPrep * 0.68);
                const airLegScale = 1.16 + leapDrive * 0.1 + (this.vy < 0 ? 0.03 : 0);
                const backHipX = torsoHipX + dir * 1.45; const frontHipX3 = torsoHipX - dir * 1.35;
                const backKneeX = backHipX - dir * ((4.8 + kickPose * 4.8 - landPrep * 0.8) * airLegScale) - dir * drift * 1.0;
                const backKneeY = hipY + 7.2 - kickPose * 2.4 + landPrep * 1.9;
                const backFootX = backKneeX - dir * ((4.4 + kickPose * 3.8 + landPrep * 0.4) * airLegScale) - dir * drift * 0.7;
                const backFootY = backKneeY + 8.6 - kickPose * 1.2 + landPrep * 4.4;
                drawJointedLeg(backHipX, hipY + 0.35, backKneeX, backKneeY, backFootX, backFootY, false, 1.25);
                const frontKneeX = frontHipX3 + dir * ((3.8 + kickPose * 3.2 + landPrep * 0.6) * airLegScale) + dir * drift * 0.8;
                const frontKneeY = hipY + 7.0 - kickPose * 3.8 + landPrep * 1.8;
                const frontFootX = frontKneeX - dir * ((2.4 + kickPose * 2.8 - landPrep * 0.3) * airLegScale) + dir * drift * 0.25;
                const frontFootY = frontKneeY + 8.4 - kickPose * 0.8 + landPrep * 4.6;
                drawJointedLeg(frontHipX3, hipY + 0.2, frontKneeX, frontKneeY, frontFootX, frontFootY, true, 1.2);
            } else {
                const runPhase = isRunLike ? Math.sin(this.legPhase || this.motionTime * 0.012) : 0;
                if (!isRunLike) {
                    const idlePhase = Math.sin(this.motionTime * 0.0042);
                    const idleSpread = 2.5 + Math.abs(idlePhase) * 0.3;
                    const backHipX = torsoHipX + dir * 1.35; const frontHipX4 = torsoHipX - dir * 1.25;
                    drawJointedLeg(backHipX, hipY + 0.45, backHipX + dir * 0.55, hipY + 9.9, centerX + dir * idleSpread, bottomY + 0.1, false, 0.0);
                    drawJointedLeg(frontHipX4, hipY + 0.25, frontHipX4 + dir * 0.6, hipY + 9.6, centerX - dir * idleSpread, bottomY - 0.1, true, 0.18);
                } else {
                    const runBlend = Math.min(1, speedAbs / Math.max(1, this.speed * 1.25));
                    const strideAmp = isDashLike ? 13.8 : 10.4; const liftAmp = isDashLike ? 5.6 : 4.2;
                    const legSpread = 0.8; const baseStepScale = 0.45 + runBlend * 0.88;
                    const legSpanY = bottomY - hipY;
                    const drawGroundLeg = (legSign, isFrontLeg) => {
                        const phase = runPhase * legSign;
                        const forward = phase * strideAmp * baseStepScale;
                        const lift = Math.max(0, -phase) * liftAmp * (0.3 + runBlend * 0.95);
                        const plant = Math.max(0, phase) * (0.72 + runBlend * 0.58);
                        const depthShift = isFrontLeg ? 0 : 0.45;
                        const hipX = torsoHipX + dir * legSign * 0.88;
                        const hipLocalY = hipY + (isFrontLeg ? 0.2 : 0.45);
                        const footX = centerX + dir * (forward + legSign * legSpread);
                        const footY = bottomY - lift + depthShift * 0.25;
                        const kneeX = hipX + dir * (forward * 0.44 + legSign * (legSpread * 0.56 + 0.62));
                        const kneeY = hipY + legSpanY * (0.56 + runBlend * 0.04) - lift * 0.75 + plant * 0.3 + depthShift;
                        drawJointedLeg(hipX, hipLocalY, kneeX, kneeY, footX, footY, isFrontLeg, 0.34);
                    };
                    drawGroundLeg(1, false); drawGroundLeg(-1, true);
                }
            }
        }
        
        // 頭
        ctx.fillStyle = silhouetteColor;
        ctx.beginPath();
        ctx.arc(headCenterX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();

        // 鉢巻・ポニーテール
        const knotOffsetX = facingRight ? -12 : 12;
        const knotX = headCenterX + knotOffsetX;
        const knotY = headY - 2;

        if (useLiveAccessories && this.scarfNodes && this.scarfNodes.length > 0) {
            this.scarfNodes[0].x = knotX;
            this.scarfNodes[0].y = knotY;
        }
        if (useLiveAccessories && this.hairNodes && this.hairNodes.length > 0) {
            this.hairNodes[0].x = knotX;
            this.hairNodes[0].y = knotY - 8;
        }

        // ポニーテール描画
        if (useLiveAccessories && this.hairNodes && this.hairNodes.length > 1) {
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            const hairBaseX = headCenterX - dir * 4;
            const hairBaseY = headY - 12;
            ctx.moveTo(hairBaseX, hairBaseY);
            for (let i = 1; i < this.hairNodes.length; i++) {
                const node = this.hairNodes[i]; const prev = this.hairNodes[i-1];
                ctx.quadraticCurveTo(prev.x, prev.y, (node.x + prev.x) / 2, (node.y + prev.y) / 2);
            }
            for (let i = this.hairNodes.length - 1; i >= 1; i--) {
                const node = this.hairNodes[i]; const prev = this.hairNodes[i-1];
                const tProgress = i / (this.hairNodes.length - 1);
                const thickness = (1 - tProgress) * 12 + 1;
                const sideShift = Math.sin(time * 0.005 + i * 0.5) * (isMoving ? 1.0 : 1.5);
                ctx.quadraticCurveTo(node.x + sideShift, node.y + thickness, (node.x + prev.x) / 2 + sideShift, (node.y + prev.y) / 2 + thickness);
            }
            ctx.lineTo(hairBaseX, hairBaseY);
            ctx.closePath();
            ctx.fill();
        } else {
            this.drawPonytail(ctx, headCenterX, headY, alpha, facingRight, bob, 0);
        }

        // 鉢巻テール描画関数
        const drawHeadbandTail = () => {
            if (!renderHeadbandTail) return;
            if (!useLiveAccessories || !this.scarfNodes || this.scarfNodes.length === 0) {
                if (typeof this.drawPonytail === 'function') {
                    this.drawPonytail(ctx, headCenterX, headY, alpha, facingRight, bob, 0);
                }
                const tailLen = 20 + (isMoving ? 6 : 0);
                const tailWave = Math.sin(time * 0.014 + (facingRight ? 0 : 1.7)) * (isMoving ? 2.8 : 1.6);
                const tailRootX = knotX; const tailRootY = knotY + 1.5;
                const tailMidX = tailRootX - dir * (tailLen * 0.45);
                const tailMidY = tailRootY + tailWave - 1.2;
                const tailTipX = tailRootX - dir * tailLen;
                const tailTipY = tailRootY + tailWave * 0.7 + (isMoving ? -0.6 : 1.0);
                ctx.fillStyle = accentColor;
                ctx.beginPath(); ctx.moveTo(tailRootX, tailRootY);
                ctx.quadraticCurveTo(tailMidX + dir * 1.5, tailMidY - 1.8, tailTipX, tailTipY - 0.8);
                ctx.lineTo(tailTipX + dir * 0.6, tailTipY + 1.0);
                ctx.quadraticCurveTo(tailMidX + dir * 1.2, tailMidY + 2.8, tailRootX, tailRootY + 7.0);
                ctx.closePath(); ctx.fill();
                return;
            }
            // ライブスカーフ描画
            ctx.fillStyle = accentColor;
            ctx.beginPath(); ctx.moveTo(knotX, knotY);
            for (let i = 1; i < this.scarfNodes.length - 1; i++) {
                const xc = (this.scarfNodes[i].x + this.scarfNodes[i + 1].x) / 2;
                const yc = (this.scarfNodes[i].y + this.scarfNodes[i + 1].y) / 2;
                ctx.quadraticCurveTo(this.scarfNodes[i].x, this.scarfNodes[i].y, xc, yc);
            }
            const lastScarf = this.scarfNodes[this.scarfNodes.length - 1];
            ctx.lineTo(lastScarf.x, lastScarf.y);
            const scarfSpreadDist = Math.abs(lastScarf.x - this.scarfNodes[0].x);
            const movingNow = scarfSpreadDist > 20;
            for (let i = this.scarfNodes.length - 1; i >= 1; i--) {
                const node = this.scarfNodes[i]; const prev = this.scarfNodes[i - 1];
                const isPreview = options.useLiveAccessories && options.overrideScarfNodes;
                const baseWidth = (movingNow ? 7 : 10) * (isPreview ? 0.35 : 1.0);
                const waveSpeed = movingNow ? 0.008 : 0.004;
                const wavePhase = i * (movingNow ? 0.5 : 0.6);
                const wave = Math.sin(time * waveSpeed + wavePhase);
                const currentWidth = baseWidth * (movingNow ? 0.85 : 1.0 + Math.abs(wave) * 0.3);
                const tiltX = wave * (movingNow ? 1.0 : 3.0);
                if (i === this.scarfNodes.length - 1) ctx.lineTo(node.x + tiltX, node.y + currentWidth);
                ctx.quadraticCurveTo(node.x + tiltX, node.y + currentWidth, (node.x + prev.x) / 2 + tiltX, (node.y + prev.y) / 2 + currentWidth);
            }
            ctx.lineTo(knotX, knotY + 12);
            ctx.closePath(); ctx.fill();
        };

        // 鉢巻バンド
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const frontY = headY - 6;
        const frontX = headCenterX + (facingRight ? 14 : -14);
        const ctrl1X = headCenterX + (facingRight ? -4 : 4); const ctrl1Y = headY - 4;
        const ctrl2X = headCenterX + (facingRight ? 8 : -8); const ctrl2Y = headY - 8;
        ctx.moveTo(knotX, knotY);
        ctx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, frontX, frontY);
        ctx.stroke();
        
        // 腕と剣
        const effectiveIsAttacking = isAttacking;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverride = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const effectiveSubWeaponTimer = (dualBlade && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
            ? (dualPoseOverride && Number.isFinite(dualPoseOverride.attackTimer)
                ? dualPoseOverride.attackTimer
                : dualBlade.attackTimer)
            : this.subWeaponTimer;
        const isActuallyAttacking = effectiveIsAttacking || (effectiveSubWeaponTimer > 0 && subWeaponAction !== 'throw');
        const backShoulderX = torsoShoulderX;
        const backShoulderY = bodyTopY + (isCrouchPose ? 1 : 2);
        const frontShoulderX = centerX - dir * (isCrouchPose ? 0.4 : 1);
        const frontShoulderY = bodyTopY + (isCrouchPose ? 2 : 3);

        const drawArmSegment = (fromX, fromY, toX, toY, width = 6) => {
            ctx.strokeStyle = silhouetteColor; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
        };
        const drawHand = (xPos, yPos, radius = 4.5) => {
            ctx.fillStyle = silhouetteColor;
            ctx.beginPath(); ctx.arc(xPos, yPos, radius, 0, Math.PI * 2); ctx.fill();
        };
        const clampArmReach = (shoulderX, shoulderY, targetX, targetY, maxLen) => {
            const dx = targetX - shoulderX; const dy = targetY - shoulderY;
            const dist = Math.hypot(dx, dy);
            if (dist <= maxLen || dist === 0) return { x: targetX, y: targetY };
            const ratio = maxLen / dist;
            return { x: shoulderX + dx * ratio, y: shoulderY + dy * ratio };
        };

        const idleBackHandX = centerX + dir * (isCrouchPose ? 12 : 15);
        const idleBackHandY = bodyTopY + (isCrouchPose ? 7.5 : 10) + Math.sin(this.motionTime * 0.01) * (isCrouchPose ? 1 : 2);
        const idleFrontHandX = centerX - dir * (isCrouchPose ? 5 : 8);
        const idleFrontHandY = bodyTopY + (isCrouchPose ? 9 : 12) + Math.sin(this.motionTime * 0.01 + 0.5) * (isCrouchPose ? 1 : 2);
        const idleBackBladeAngle = isCrouchPose ? -0.32 : -0.65;
        const idleFrontBladeAngle = isCrouchPose ? -0.82 : -1.1;

        const isIdleForceRender = forceSubWeaponRender && !subWeaponAction && subWeaponTimer <= 0;
        if (!isActuallyAttacking && (!forceSubWeaponRender || isIdleForceRender)) {
            const isThrowing = effectiveSubWeaponTimer > 0 && subWeaponAction === 'throw';
            const hasDualSubWeapon = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';

            // 奥手（刀を持つ）
            drawArmSegment(backShoulderX, backShoulderY, idleBackHandX, idleBackHandY, 6);
            drawHand(idleBackHandX, idleBackHandY, 4.8);
            this.drawKatana(ctx, idleBackHandX, idleBackHandY, idleBackBladeAngle, dir);

            if (!isThrowing) {
                if (hasDualSubWeapon) {
                    drawArmSegment(frontShoulderX, frontShoulderY, idleFrontHandX, idleFrontHandY, 5);
                    drawHand(idleFrontHandX, idleFrontHandY, 4.5);
                    this.drawKatana(ctx, idleFrontHandX, idleFrontHandY, idleFrontBladeAngle, dir);
                } else {
                    const bladeDirX = Math.cos(idleBackBladeAngle) * dir;
                    const bladeDirY = Math.sin(idleBackBladeAngle);
                    const perpX = -bladeDirY; const perpY = bladeDirX;
                    const supportHand = clampArmReach(frontShoulderX, frontShoulderY, idleBackHandX - bladeDirX * 5.8 + perpX * 1.0, idleBackHandY - bladeDirY * 5.8 + perpY * 1.0, 22);
                    drawArmSegment(frontShoulderX, frontShoulderY, supportHand.x, supportHand.y, 5);
                    drawHand(supportHand.x, supportHand.y, 4.5);
                }
            }

            // アイドル状態でforceSubWeaponRender時は背中に忍具アイコンを表示
            if (isIdleForceRender && this.currentSubWeapon && renderSubWeaponVisuals) {
                const weaponName = this.currentSubWeapon.name;
                if (weaponName === '手裏剣') {
                    const heldRadius = (this.currentSubWeapon.projectileRadius || 10);
                    drawShurikenShape(ctx, centerX - dir * 10, bodyTopY + 2, heldRadius, -0.3);
                } else if (weaponName === '火薬玉') {
                    ctx.save();
                    ctx.translate(centerX - dir * 10, bodyTopY + 2);
                    ctx.fillStyle = '#2d2d2d';
                    ctx.beginPath();
                    ctx.arc(0, 0, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#767676';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.restore();
                }
                this.subWeaponRenderedInModel = true;
            }
        } else if (effectiveIsAttacking) {
            this.renderAttackArmAndWeapon(ctx, {
                centerX, pivotY: bodyTopY + 2, facingRight,
                backShoulderX, backShoulderY, frontShoulderX, frontShoulderY,
                supportFrontHand: !(this.currentSubWeapon && this.currentSubWeapon.name === '二刀流')
            }, options);
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') {
                drawArmSegment(frontShoulderX, frontShoulderY, idleFrontHandX, idleFrontHandY, 5);
                drawHand(idleFrontHandX, idleFrontHandY, 4.5);
                this.drawKatana(ctx, idleFrontHandX, idleFrontHandY, idleFrontBladeAngle, dir);
            }
        }

        // サブ武器アーム描画
        if ((effectiveSubWeaponTimer > 0 || (forceSubWeaponRender && subWeaponAction)) && !effectiveIsAttacking) {
            this.renderSubWeaponArm(ctx, centerX, bodyTopY + 2, facingRight, renderSubWeaponVisuals, options);
        }

        drawHeadbandTail();

        this.x = originalX;
        this.y = originalY;
        ctx.restore();
    }

    renderSubWeaponArm(ctx, centerX, pivotY, facingRight, renderWeaponVisuals = true, options = {}) {
        const dir = facingRight ? 1 : -1;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀流') ? this.currentSubWeapon : null;
        const dualPoseOverride = (
            this.subWeaponPoseOverride &&
            this.subWeaponAction === '二刀_Z'
        ) ? this.subWeaponPoseOverride : null;
        const subDuration =
            this.subWeaponAction === 'throw' ? 150 :
            (this.subWeaponAction === '大槍') ? 270 :
            (this.subWeaponAction === '鎖鎌') ? 560 :
            (this.subWeaponAction === '二刀_Z') ? Math.max(1, (dualBlade && dualBlade.mainDuration) ? dualBlade.mainDuration : 204) :
            (this.subWeaponAction === '二刀_合体') ? 220 :
            (this.subWeaponAction === '大太刀') ? 760 : 300;
        const sourceTimer =
            (dualBlade && (this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
                ? ((dualPoseOverride && Number.isFinite(dualPoseOverride.attackTimer))
                    ? dualPoseOverride.attackTimer
                    : dualBlade.attackTimer)
                : this.subWeaponTimer;
        const progress = Math.max(0, Math.min(1, 1 - (sourceTimer / subDuration)));
        const silhouetteColor = (options.palette && options.palette.silhouette) || COLORS.PLAYER;
        const accentColor = (options.palette && options.palette.accent) || '#00bfff';
        const backShoulderX = centerX + dir * 4;
        const frontShoulderX = centerX - dir * 3;
        const shoulderY = pivotY;
        const backShoulderY = shoulderY;
        
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

        const drawSubWeaponKatana = (handX, handY, bladeAngle = -1.0, bladeScaleDir = dir) => {
            this.drawKatana(ctx, handX, handY, bladeAngle, bladeScaleDir);
        };

        const drawSupportPose = (handX, handY, withBlade = false, bladeAngle = -1.0, bladeScaleDir = dir, fromBackShoulder = false) => {
            drawArmSegment(fromBackShoulder ? backShoulderX : frontShoulderX, shoulderY + (fromBackShoulder ? 0 : 1), handX, handY, 5);
            drawHand(handX, handY, 4.5);
            if (withBlade && renderWeaponVisuals) {
                drawSubWeaponKatana(handX, handY, bladeAngle, bladeScaleDir);
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
            // 手前手で投げる（手持ち武器は描画しない）
            const easedProgress = Math.pow(progress, 0.55); // イージングで初速を速く
            const armAngle = -Math.PI * 0.8 + easedProgress * Math.PI * 0.8;
            const armLength = 19;
            const throwShoulderX = frontShoulderX;
            const throwShoulderY = shoulderY + 1;
            const throwTargetX = throwShoulderX + Math.cos(armAngle) * armLength * dir;
            const throwTargetY = throwShoulderY + Math.sin(armAngle) * armLength;
            const throwHand = clampArmReach(throwShoulderX, throwShoulderY, throwTargetX, throwTargetY, 21);
            const armEndX = throwHand.x;
            const armEndY = throwHand.y;

            ctx.strokeStyle = silhouetteColor;
            drawArmSegment(throwShoulderX, throwShoulderY, armEndX, armEndY, 5.4);
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
                ? blade.getMainSwingPose(dualPoseOverride || {})
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
                drawSubWeaponKatana(leftHand.x, leftHand.y, pose.leftAngle, dir);
                drawSubWeaponKatana(rightHand.x, rightHand.y, pose.rightAngle, dir);
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
                drawSubWeaponKatana(leftX, leftY, leftAngle, dir);
                drawSubWeaponKatana(rightX, rightY, rightAngle, dir);
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
            // 鎖鎌: 振りかぶり -> 前方へ伸ばす -> 伸ばしたまま後頭部へ回す
            const kusa = (this.currentSubWeapon && this.currentSubWeapon.name === '鎖鎌') ? this.currentSubWeapon : null;
            const anchor = (kusa && typeof kusa.getHandAnchor === 'function')
                ? kusa.getHandAnchor(this)
                : { x: centerX + dir * 13, y: pivotY + 8, progress };
            const phase = anchor.phase || 'orbit';
            const phaseT = anchor.phaseT || 0;
            const swingShoulderX = frontShoulderX + dir * 0.15;
            const swingShoulderY = shoulderY + 0.45;
            const armMaxLen = phase === 'extend' ? 34.5 : 42.0;
            const mainHand = clampArmReach(swingShoulderX, swingShoulderY, anchor.x, anchor.y, armMaxLen);
            drawArmSegment(swingShoulderX, swingShoulderY, mainHand.x, mainHand.y, 5.5);
            drawHand(mainHand.x, mainHand.y, 5);

            // 鎖鎌中でも奥手の刀は保持し続ける
            if (phase === 'extend') {
                const backEase = 1 - (phaseT * phaseT * (3 - 2 * phaseT));
                drawSupportPose(
                    centerX + dir * (10 - backEase * 4.5),
                    pivotY + 9 - backEase * 3.5,
                    true,
                    -0.55 - backEase * 0.35,
                    dir,
                    true
                );
            } else {
                drawSupportPose(centerX + dir * 11.5, pivotY + 8.2, true, -0.55, dir, true);
            }
        } else {
            // その他（デフォルト突き）
            const armEndX = centerX + dir * 20;
            const armEndY = pivotY + 5;
            drawArmSegment(backShoulderX, shoulderY, armEndX, armEndY, 6);
            drawHand(armEndX, armEndY, 5);
            drawSupportPose(centerX - dir * 8, pivotY + 12);
        }

        // 追加: モーション中以外で武器を強制表示（プレビュー用）
        if (this.forceSubWeaponRender && !this.subWeaponRenderedInModel && this.currentSubWeapon && renderWeaponVisuals) {
            const weaponName = this.currentSubWeapon.name;
            if (weaponName === '手裏剣') {
                // ★飛翔体と同一サイズで背中に表示
                const heldRadius = (this.currentSubWeapon.projectileRadius || 10);
                drawShurikenShape(ctx, centerX - dir * 10, pivotY + 2, heldRadius, -0.3);
            } else if (weaponName === '火薬玉') {
                ctx.save();
                ctx.translate(centerX - dir * 10, pivotY + 2);
                ctx.fillStyle = '#2d2d2d';
                ctx.beginPath();
                ctx.arc(0, 0, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#767676';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.restore();
            } else if (typeof this.currentSubWeapon.render === 'function') {
                this.currentSubWeapon.render(ctx, this);
            }
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
    }, options = {}) {
        const silhouetteColor = (options.palette && options.palette.silhouette) || COLORS.PLAYER;
        const accentColor = (options.palette && options.palette.accent) || '#00bfff';
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
        let supportGripBackDist = 6.2;
        let supportGripSideOffset = 1.0;
        let supportGripMaxReach = 22;
        if (attack.comboStep) {
            switch (attack.comboStep) {
                case 2:
                    // 影走り袈裟（前へ踏み込みつつ斜めに薙ぐ）
                    swordAngle = 2.6 - 2.56 * easeOut;
                    armEndX = centerX + dir * (6 + easeOut * 26);
                    armEndY = pivotY + 9 - easeOut * 5.2;
                    // 二段目開始は一段終点(アイドル終点)から補間して繋ぐ
                    {
                        const prepT = Math.max(0, Math.min(1, progress / 0.2));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const idleAngle = this.isCrouching ? -0.32 : -0.65;
                        const idleHandX = centerX + dir * (this.isCrouching ? 12 : 15);
                        const idleHandY = pivotY + (this.isCrouching ? 5.5 : 8.0);
                        swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                        armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                        armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                    }
                    // 終端だけアイドル構えへ寄せ、1撃目終了→待機の接続を自然にする
                    {
                        const settleT = Math.max(0, Math.min(1, (progress - 0.78) / 0.22));
                        const settle = settleT * settleT * (3 - 2 * settleT);
                        const idleAngle = this.isCrouching ? -0.32 : -0.65;
                        const idleHandX = centerX + dir * (this.isCrouching ? 12 : 15);
                        const idleHandY = pivotY + (this.isCrouching ? 5.5 : 8.0);
                        swordAngle += (idleAngle - swordAngle) * settle;
                        armEndX += (idleHandX - armEndX) * settle;
                        armEndY += (idleHandY - armEndY) * settle;
                    }
                    trail = {
                        mode: 'followSlash',
                        front: [214, 246, 255],
                        back: [104, 182, 242],
                        width: 13.6,
                        trailLen: 62,
                        edgeSpread: 4.2,
                        minAlpha: 0.3
                    };
                    break;
                case 1:
                    // 閃返し（後方へ返す斬り）
                    {
                        const wind = Math.max(0, Math.min(1, progress / 0.34));
                        const swing = Math.max(0, Math.min(1, (progress - 0.34) / 0.66));
                        const swingEase = swing * swing * (3 - 2 * swing);
                        swordAngle = 0.22 + wind * 0.78 + swingEase * 1.92;
                        armEndX = centerX + dir * (15 - wind * 6.6 - swingEase * 27.5);
                        armEndY = pivotY + 8.0 - wind * 4.8 + swingEase * 8.6;
                        activeBackShoulderX = backShoulderX - dir * (0.6 + swingEase * 2.0);
                        activeBackShoulderY = backShoulderY + swingEase * 1.1;
                        activeFrontShoulderX = frontShoulderX - dir * (0.2 + swingEase * 1.2);
                        activeFrontShoulderY = frontShoulderY + swingEase * 1.0;
                        // 切り始めは必ずアイドル姿勢から入る
                        const prepT = Math.max(0, Math.min(1, progress / 0.22));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const idleAngle = this.isCrouching ? -0.32 : -0.65;
                        const idleHandX = centerX + dir * (this.isCrouching ? 12 : 15);
                        const idleHandY = pivotY + (this.isCrouching ? 5.5 : 8.0);
                        swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                        armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                        armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                        activeBackShoulderX = backShoulderX + (activeBackShoulderX - backShoulderX) * prepEase;
                        activeBackShoulderY = backShoulderY + (activeBackShoulderY - backShoulderY) * prepEase;
                        activeFrontShoulderX = frontShoulderX + (activeFrontShoulderX - frontShoulderX) * prepEase;
                        activeFrontShoulderY = frontShoulderY + (activeFrontShoulderY - frontShoulderY) * prepEase;

                        // 1撃目は添え手を柄の内側へ寄せ、開始時だけアイドル値から補間
                        supportGripBackDist = 6.2 + (7.4 - 6.2) * prepEase;
                        supportGripSideOffset = 1.0 + (-0.9 - 1.0) * prepEase;
                        supportGripMaxReach = 22 + (20.2 - 22) * prepEase;

                        // 終端をアイドル構えに寄せ、1撃目後の接続を自然にする
                        const settleT = Math.max(0, Math.min(1, (progress - 0.88) / 0.12));
                        const settle = settleT * settleT * (3 - 2 * settleT);
                        swordAngle += (idleAngle - swordAngle) * settle;
                        armEndX += (idleHandX - armEndX) * settle;
                        armEndY += (idleHandY - armEndY) * settle;
                        activeBackShoulderX += (backShoulderX - activeBackShoulderX) * settle;
                        activeBackShoulderY += (backShoulderY - activeBackShoulderY) * settle;
                        activeFrontShoulderX += (frontShoulderX - activeFrontShoulderX) * settle;
                        activeFrontShoulderY += (frontShoulderY - activeFrontShoulderY) * settle;
                    }
                    trail = {
                        mode: 'followSlash',
                        front: [225, 249, 255],
                        back: [116, 194, 248],
                        width: 14.6,
                        trailLen: 72,
                        edgeSpread: 4.8,
                        minAlpha: 0.38
                    };
                    break;
                case 3:
                    // 燕返横薙ぎ（奥行き付きの水平切り）
                    swordAngle = -0.22 + Math.sin(progress * Math.PI) * 0.34;
                    armEndX = centerX + dir * (-10 + easeInOut * 36);
                    armEndY = pivotY + 5 - Math.sin(progress * Math.PI) * 9.2;
                    {
                        // 三段目開始は二段目終端(アイドル終点)から接続
                        const prepT = Math.max(0, Math.min(1, progress / 0.2));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const idleAngle = this.isCrouching ? -0.32 : -0.65;
                        const idleHandX = centerX + dir * (this.isCrouching ? 12 : 15);
                        const idleHandY = pivotY + (this.isCrouching ? 5.5 : 8.0);
                        swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                        armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                        armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                    }
                    trail = {
                        mode: 'tipArc',
                        front: [222, 248, 255],
                        back: [102, 177, 238],
                        width: 13.8,
                        radius: 46,
                        startAngle: 2.45,
                        endAngle: -0.08,
                        revealStart: 0.08,
                        revealEnd: 0.94
                    };
                    break;
                case 4:
                    // 四ノ太刀: 天穿斬り上げ（真上へ上昇→後方バク転）
                    if (progress < 0.42) {
                        const t = progress / 0.42;
                        swordAngle = 1.32 - 2.06 * t;
                        armEndX = centerX + dir * (8.0 + Math.sin(t * Math.PI) * 1.2);
                        armEndY = pivotY + 22 - t * 36;
                    } else {
                        const flipT = Math.max(0, Math.min(1, (progress - 0.42) / 0.58));
                        const bodyFlipAngle = -Math.PI * 1.82 * flipT;
                        swordAngle = -0.76 + bodyFlipAngle;
                        armEndX = centerX - dir * (4.0 + Math.sin(flipT * Math.PI) * 6.0);
                        armEndY = pivotY - 10 + Math.cos(flipT * Math.PI) * 3.0;
                    }
                    {
                        // 四段目開始は三段目終点から接続
                        const prepT = Math.max(0, Math.min(1, progress / 0.18));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const prevAngle = -0.22;
                        const prevHandX = centerX + dir * 26;
                        const prevHandY = pivotY + 5;
                        swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                        armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                        armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                    }
                    trail = {
                        mode: 'depthSlice',
                        front: [228, 250, 255],
                        back: [112, 186, 244],
                        width: 14.2,
                        length: 112,
                        spread: 13,
                        lift: 15
                    };
                    break;
                case 5:
                    // 五ノ太刀: 頭上から水平へ叩きつける落下
                    {
                        if (progress < 0.26) {
                            const t = progress / 0.26;
                            swordAngle = -1.45 + t * 0.3;
                            armEndX = centerX + dir * (2 + t * 4);
                            armEndY = pivotY - 12 - t * 7;
                        } else if (progress < 0.78) {
                            const t = (progress - 0.26) / 0.52;
                            swordAngle = -1.15 + t * 2.2;
                            armEndX = centerX + dir * (6 + t * 20);
                            armEndY = pivotY - 19 + t * 36;
                        } else {
                            const t = (progress - 0.78) / 0.22;
                            swordAngle = 1.05 - t * 0.52;
                            armEndX = centerX + dir * (26 - t * 8);
                            armEndY = pivotY + 17 - t * 4;
                        }
                        // 五段目開始は四段目終点から接続
                        const prepT = Math.max(0, Math.min(1, progress / 0.2));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const prevAngle = -0.76 - Math.PI * 1.82;
                        const prevHandX = centerX - dir * 4.0;
                        const prevHandY = pivotY - 13.0;
                        swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                        armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                        armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                    }
                    trail = {
                        mode: 'followSlash',
                        front: [232, 252, 255],
                        back: [124, 198, 248],
                        width: 14.6,
                        trailLen: 74,
                        edgeSpread: 5.0,
                        minAlpha: 0.4
                    };
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
        ctx.strokeStyle = silhouetteColor;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(activeBackShoulderX, activeBackShoulderY);
        ctx.lineTo(armEndX, armEndY);
        ctx.stroke();

        // 手を上書きで描画
        ctx.fillStyle = silhouetteColor; // COLORS.PLAYER_GI から修正
        ctx.beginPath();
        ctx.arc(armEndX, armEndY, 6, 0, Math.PI * 2);
        ctx.fill();

        const rot = swordAngle;
        const swordLen = this.getKatanaBladeLength(); // 見た目の刀身長は常に統一（当たり判定rangeとは分離）
        let supportHand = null;

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
            const supportTargetX = armEndX - bladeDirX * supportGripBackDist + perpX * supportGripSideOffset;
            const supportTargetY = armEndY - bladeDirY * supportGripBackDist + perpY * supportGripSideOffset;
            supportHand = clampArmReach(
                activeFrontShoulderX,
                activeFrontShoulderY,
                supportTargetX,
                supportTargetY,
                supportGripMaxReach
            );
        }

        // 剣を描画（共通メソッドで統一）
        // 攻撃時は立たせ補正を切って、切っ先・剣筋・当たり判定を一致させる
        this.drawKatana(ctx, armEndX, armEndY, rot, facingRight ? 1 : -1, swordLen, 0);
        const suppressBaseSlashForXBoost = this.isXAttackBoostActive() && this.isXAttackActionActive();

        // 手前手は剣の後に描画して、握っている見た目を作る
        if (supportHand) {
            ctx.strokeStyle = silhouetteColor;
            ctx.lineWidth = 5.1;
            ctx.beginPath();
            ctx.moveTo(activeFrontShoulderX, activeFrontShoulderY);
            ctx.lineTo(supportHand.x, supportHand.y);
            ctx.stroke();

            ctx.fillStyle = silhouetteColor;
            ctx.beginPath();
            ctx.arc(supportHand.x, supportHand.y, 4.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // 斬撃エフェクト（刀のローカル座標系で描画）
        ctx.save();
        ctx.translate(armEndX, armEndY);
        ctx.scale(facingRight ? 1 : -1, 1);
        ctx.rotate(rot);

        // 斬撃エフェクト（大きく、派手に）
        
        const swingAlpha = Math.max(0.08, 1 - rawProgress);
        const colorRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
        const drawDepthArc = (arc) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const counterClockwise = arc.end < arc.start;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;

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

            ctx.strokeStyle = `rgba(245, 252, 255, ${frontAlpha * 0.58})`;
            ctx.lineWidth = Math.max(1.1, arc.width * 0.14);
            ctx.beginPath();
            ctx.arc(arc.originX + 1.1, arc.originY - 0.9, arc.radius - 2.0, arc.start + 0.04, arc.end + 0.04, counterClockwise);
            ctx.stroke();
            ctx.restore();
        };
        const drawDepthSlice = (slice) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
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
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(-length * 0.2, spread * 0.95);
            ctx.quadraticCurveTo(length * 0.28, lift * 1.05, length * 0.98, -spread * 0.2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(245, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.moveTo(-length * 0.16, spread * 0.58);
            ctx.quadraticCurveTo(length * 0.24, lift * 0.72, length * 0.9, -spread * 0.12);
            ctx.stroke();
            ctx.restore();
        };
        const drawFollowSlash = (slash) => {
            const alphaFloor = Math.max(0, Math.min(1, slash.minAlpha || 0));
            const alphaBase = Math.max(swingAlpha, alphaFloor);
            const backAlpha = alphaBase * 0.28;
            const frontAlpha = alphaBase * 0.82;
            const width = slash.width || 13;
            const trailLen = slash.trailLen || 52;
            const edgeSpread = slash.edgeSpread || 3.6;
            const tipX = swordLen;
            const tipY = 0;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen, -edgeSpread);
            ctx.quadraticCurveTo(tipX - trailLen * 0.36, -edgeSpread * 0.35, tipX, tipY);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen * 0.88, edgeSpread * 0.25);
            ctx.quadraticCurveTo(tipX - trailLen * 0.32, edgeSpread * 0.08, tipX, tipY);
            ctx.stroke();

            ctx.strokeStyle = `rgba(246, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.moveTo(tipX - trailLen * 0.74, edgeSpread * 0.14);
            ctx.quadraticCurveTo(tipX - trailLen * 0.28, edgeSpread * 0.04, tipX, tipY);
            ctx.stroke();
            ctx.restore();
        };
        const drawTipArc = (slash) => {
            const backAlpha = swingAlpha * 0.28;
            const frontAlpha = swingAlpha * 0.82;
            const width = slash.width || 13;
            const tipX = swordLen;
            const tipY = 0;
            const radius = Math.max(16, slash.radius || 42);
            const centerX = tipX - radius;
            const centerY = tipY + (slash.centerYOffset || 0);
            const start = slash.startAngle ?? 2.5;
            const end = slash.endAngle ?? 0;
            const counterClockwise = (slash.counterClockwise !== undefined)
                ? !!slash.counterClockwise
                : (end < start);
            const revealStart = Math.max(0, Math.min(1, slash.revealStart ?? 0.08));
            const revealEnd = Math.max(revealStart + 0.01, Math.min(1, slash.revealEnd ?? 0.9));
            const revealRaw = (progress - revealStart) / (revealEnd - revealStart);
            const reveal = Math.max(0, Math.min(1, revealRaw));
            if (reveal <= 0.01) return;
            // 切っ先(=end)側から徐々に伸ばして描画する
            const visibleStart = end + (start - end) * reveal;

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;

            ctx.strokeStyle = colorRgba(slash.back, backAlpha);
            ctx.lineWidth = width * 0.72;
            ctx.beginPath();
            ctx.arc(centerX - 2.6, centerY - 1.5, radius * 0.92, visibleStart + 0.08, end + 0.04, counterClockwise);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = colorRgba(slash.front, frontAlpha);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, visibleStart, end, counterClockwise);
            ctx.stroke();

            const hiRadius = Math.max(4, radius - 2.0);
            const hiCenterX = tipX - hiRadius * Math.cos(end);
            const hiCenterY = tipY - hiRadius * Math.sin(end);
            ctx.strokeStyle = `rgba(246, 252, 255, ${frontAlpha * 0.56})`;
            ctx.lineWidth = Math.max(1.0, width * 0.14);
            ctx.beginPath();
            ctx.arc(hiCenterX, hiCenterY, hiRadius, visibleStart, end, counterClockwise);
            ctx.stroke();
            ctx.restore();
        };

        const isComboAttack = !!attack.comboStep;
        // コンボ中はローカル白斬撃を重ねず、軌跡側だけを表示して刀身の白発光を防ぐ
        if (!suppressBaseSlashForXBoost && !isComboAttack) {
            if (trail && trail.mode === 'arc') {
                drawDepthArc(trail);
            } else if (trail && trail.mode === 'depthSlice') {
                drawDepthSlice(trail);
            } else if (trail && trail.mode === 'followSlash') {
                drawFollowSlash(trail);
            } else if (trail && trail.mode === 'tipArc') {
                drawTipArc(trail);
            } else if (trail && trail.mode === 'thrust') {
                const alpha = swingAlpha * 0.72;
                ctx.save();
                ctx.shadowBlur = 0;
                ctx.fillStyle = colorRgba(trail.back, alpha * 0.3);
                ctx.beginPath();
                ctx.moveTo(swordLen - 2, -14);
                ctx.lineTo(swordLen + 34, -5.5);
                ctx.lineTo(swordLen + 34, 5.5);
                ctx.lineTo(swordLen - 2, 14);
                ctx.lineTo(swordLen + 6, 0);
                ctx.closePath();
                ctx.fill();

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
                const alpha = swingAlpha * 0.72;
                ctx.save();
                ctx.shadowBlur = 0;
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
        }

        ctx.restore();

    }

    getAttackMotionProgress(attack, rawProgress) {
        const p = Math.max(0, Math.min(1, rawProgress));
        if (!attack || !attack.comboStep) return p;

        const lerp = (a, b, t) => a + (b - a) * t;
        const smooth = (t) => t * t * (3 - 2 * t);

        switch (attack.comboStep) {
            case 2: {
                // 初段: 小さく溜めて重く振り下ろす
                if (p < 0.34) return lerp(0, 0.2, smooth(p / 0.34));
                if (p < 0.54) return lerp(0.2, 0.9, smooth((p - 0.34) / 0.2));
                return lerp(0.9, 1.0, smooth((p - 0.54) / 0.46));
            }
            case 1: {
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

    getComboSwordPoseForTrail(state = null) {
        const baseState = state || {
            isAttacking: this.isAttacking,
            currentAttack: this.currentAttack,
            attackTimer: this.attackTimer,
            facingRight: this.facingRight,
            x: this.x,
            y: this.y,
            isCrouching: this.isCrouching
        };
        return this.getComboSwordPoseForTrailState(baseState);
    }

    getComboSwordPoseForTrailState(state) {
        if (!state) return null;
        const attack = state.currentAttack;
        if (!state.isAttacking || !attack || !attack.comboStep) return null;

        const dir = state.facingRight ? 1 : -1;
        const centerX = state.x + this.width / 2;
        const pivotY = state.y + (state.isCrouching ? this.height * 0.58 : this.height * 0.43);
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const rawProgress = Math.max(0, Math.min(1, 1 - (state.attackTimer / attackDuration)));
        const progress = this.getAttackMotionProgress(attack, rawProgress);
        const easeOut = 1 - Math.pow(1 - progress, 2);
        const easeInOut = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const idleAngle = state.isCrouching ? -0.32 : -0.65;
        const idleHandX = centerX + dir * (state.isCrouching ? 12 : 15);
        const idleHandY = pivotY + (state.isCrouching ? 5.5 : 8.0);

        let swordAngle = idleAngle;
        let armEndX = idleHandX;
        let armEndY = idleHandY;

        switch (attack.comboStep) {
            case 2: {
                swordAngle = 2.6 - 2.56 * easeOut;
                armEndX = centerX + dir * (6 + easeOut * 26);
                armEndY = pivotY + 9 - easeOut * 5.2;
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                armEndY = idleHandY + (armEndY - idleHandY) * prepEase;

                const settleT = Math.max(0, Math.min(1, (progress - 0.78) / 0.22));
                const settle = settleT * settleT * (3 - 2 * settleT);
                swordAngle += (idleAngle - swordAngle) * settle;
                armEndX += (idleHandX - armEndX) * settle;
                armEndY += (idleHandY - armEndY) * settle;
                break;
            }
            case 1: {
                const wind = Math.max(0, Math.min(1, progress / 0.34));
                const swing = Math.max(0, Math.min(1, (progress - 0.34) / 0.66));
                const swingEase = swing * swing * (3 - 2 * swing);
                swordAngle = 0.22 + wind * 0.78 + swingEase * 1.92;
                armEndX = centerX + dir * (15 - wind * 6.6 - swingEase * 27.5);
                armEndY = pivotY + 8.0 - wind * 4.8 + swingEase * 8.6;
                const prepT = Math.max(0, Math.min(1, progress / 0.22));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                armEndY = idleHandY + (armEndY - idleHandY) * prepEase;

                const settleT = Math.max(0, Math.min(1, (progress - 0.88) / 0.12));
                const settle = settleT * settleT * (3 - 2 * settleT);
                swordAngle += (idleAngle - swordAngle) * settle;
                armEndX += (idleHandX - armEndX) * settle;
                armEndY += (idleHandY - armEndY) * settle;
                break;
            }
            case 3: {
                swordAngle = -0.22 + Math.sin(progress * Math.PI) * 0.34;
                armEndX = centerX + dir * (-10 + easeInOut * 36);
                armEndY = pivotY + 5 - Math.sin(progress * Math.PI) * 9.2;
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                break;
            }
            case 4: {
                if (progress < 0.42) {
                    const t = progress / 0.42;
                    swordAngle = 1.32 - 2.06 * t;
                    armEndX = centerX + dir * (8.0 + Math.sin(t * Math.PI) * 1.2);
                    armEndY = pivotY + 22 - t * 36;
                } else {
                    const flipT = Math.max(0, Math.min(1, (progress - 0.42) / 0.58));
                    const bodyFlipAngle = -Math.PI * 1.82 * flipT;
                    swordAngle = -0.76 + bodyFlipAngle;
                    armEndX = centerX - dir * (4.0 + Math.sin(flipT * Math.PI) * 6.0);
                    armEndY = pivotY - 10 + Math.cos(flipT * Math.PI) * 3.0;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.18));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevAngle = -0.22;
                const prevHandX = centerX + dir * 26;
                const prevHandY = pivotY + 5;
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            case 5: {
                if (progress < 0.26) {
                    const t = progress / 0.26;
                    swordAngle = -1.45 + t * 0.3;
                    armEndX = centerX + dir * (2 + t * 4);
                    armEndY = pivotY - 12 - t * 7;
                } else if (progress < 0.78) {
                    const t = (progress - 0.26) / 0.52;
                    swordAngle = -1.15 + t * 2.2;
                    armEndX = centerX + dir * (6 + t * 20);
                    armEndY = pivotY - 19 + t * 36;
                } else {
                    const t = (progress - 0.78) / 0.22;
                    swordAngle = 1.05 - t * 0.52;
                    armEndX = centerX + dir * (26 - t * 8);
                    armEndY = pivotY + 17 - t * 4;
                }
                const prepT = Math.max(0, Math.min(1, progress / 0.2));
                const prepEase = prepT * prepT * (3 - 2 * prepT);
                const prevAngle = -0.76 - Math.PI * 1.82;
                const prevHandX = centerX - dir * 4.0;
                const prevHandY = pivotY - 13.0;
                swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
                break;
            }
            default:
                return null;
        }

        const bladeLen = this.getKatanaBladeLength();
        const bladeDirX = Math.cos(swordAngle) * dir;
        const bladeDirY = Math.sin(swordAngle);
        let trailTipExtend = 0;
        if (attack.comboStep === 5) {
            // 大凪は当たり判定が前方に強いため、剣筋もやや外側へ寄せて見た目と一致させる
            if (progress < 0.26) {
                trailTipExtend = 8;
            } else if (progress < 0.78) {
                const t = (progress - 0.26) / 0.52;
                trailTipExtend = 18 + t * 18;
            } else {
                const t = (progress - 0.78) / 0.22;
                trailTipExtend = 22 - t * 7;
            }
        }
        return {
            comboStep: attack.comboStep,
            tipX: armEndX + bladeDirX * (bladeLen + trailTipExtend),
            tipY: armEndY + bladeDirY * (bladeLen + trailTipExtend)
        };
    }

    updateComboSlashTrail(deltaMs) {
        this.comboSlashTrailSampleTimer = this.updateSlashTrailBuffer(
            this.comboSlashTrailPoints,
            this.comboSlashTrailSampleTimer,
            this.getComboSwordPoseForTrail(),
            deltaMs
        );
    }

    updateSlashTrailBuffer(points, sampleTimer, pose, deltaMs) {
        if (!Array.isArray(points)) return 0;
        for (let i = 0; i < points.length; i++) {
            points[i].age += deltaMs;
        }

        let nextSampleTimer = Math.max(0, (sampleTimer || 0) - deltaMs);

        if (pose) {
            const now = { x: pose.tipX, y: pose.tipY };
            const jumpCutDist = 140;
            let last = points.length > 0 ? points[points.length - 1] : null;
            let dist = last ? Math.hypot(now.x - last.x, now.y - last.y) : Infinity;
            // 不自然な遠距離接続だけを切る（通常の連続軌跡は維持）
            if (last && dist > jumpCutDist) {
                points.length = 0;
                last = null;
                dist = Infinity;
            }
            if (!last || dist >= 2.6 || nextSampleTimer <= 0) {
                points.push({
                    x: now.x,
                    y: now.y,
                    step: pose.comboStep || 0,
                    age: 0,
                    life: this.comboSlashTrailActiveLifeMs,
                    seed: Math.random() * Math.PI * 2
                });
                nextSampleTimer = this.comboSlashTrailSampleIntervalMs;
            } else {
                last.x = now.x;
                last.y = now.y;
                last.step = pose.comboStep || 0;
                last.age = Math.max(0, last.age - deltaMs * 0.7);
            }
        }

        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            const lifeLimit = pose ? p.life : Math.min(p.life, this.comboSlashTrailFadeLifeMs);
            if (p.age > lifeLimit) points.splice(i, 1);
        }

        if (points.length > 180) {
            points.splice(0, points.length - 180);
        }

        return nextSampleTimer;
    }

    updateSpecialCloneSlashTrails(deltaMs) {
        const count = this.specialCloneSlots ? this.specialCloneSlots.length : 0;
        if (count <= 0) return;
        const dualBlade = (
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '二刀流' &&
            typeof this.currentSubWeapon.getMainSwingPose === 'function'
        ) ? this.currentSubWeapon : null;
        if (!Array.isArray(this.specialCloneSlashTrailPoints)) {
            this.specialCloneSlashTrailPoints = [];
        }
        if (!Array.isArray(this.specialCloneSlashTrailSampleTimers)) {
            this.specialCloneSlashTrailSampleTimers = [];
        }

        for (let i = 0; i < count; i++) {
            if (!Array.isArray(this.specialCloneSlashTrailPoints[i])) {
                this.specialCloneSlashTrailPoints[i] = [];
            }
            if (!Number.isFinite(this.specialCloneSlashTrailSampleTimers[i])) {
                this.specialCloneSlashTrailSampleTimers[i] = 0;
            }

            const pos = this.specialClonePositions[i];
            const isAlive = this.specialCloneAlive && this.specialCloneAlive[i];
            let pose = null;

            if (isAlive && pos) {
                const isAutoAi = !!this.specialCloneAutoAiEnabled;
                const cloneDrawY = isAutoAi
                    ? (pos.y - this.height * 0.62)
                    : this.y;
                const dualTimer = isAutoAi
                    ? (this.specialCloneSubWeaponTimers[i] || 0)
                    : this.subWeaponTimer;
                const dualActionActive = !!(
                    dualBlade &&
                    dualTimer > 0 &&
                    (
                        isAutoAi
                            ? (this.specialCloneSubWeaponActions[i] === '二刀_Z')
                            : (this.subWeaponAction === '二刀_Z')
                    )
                );
                if (dualActionActive) {
                    // 二刀流分身は本体と同じDualBlades側の剣筋を使うため、ここでは軌跡点を生成しない
                    this.specialCloneSlashTrailSampleTimers[i] = this.updateSlashTrailBuffer(
                        this.specialCloneSlashTrailPoints[i],
                        this.specialCloneSlashTrailSampleTimers[i],
                        null,
                        deltaMs
                    );
                    continue;
                } else {
                    const isAttacking = isAutoAi
                        ? ((this.specialCloneAttackTimers[i] || 0) > 0)
                        : !!this.isAttacking;
                    if (!isAttacking) {
                        this.specialCloneSlashTrailSampleTimers[i] = this.updateSlashTrailBuffer(
                            this.specialCloneSlashTrailPoints[i],
                            this.specialCloneSlashTrailSampleTimers[i],
                            null,
                            deltaMs
                        );
                        continue;
                    }
                    const comboStep = isAutoAi
                        ? ((this.specialCloneComboSteps[i] || 0) % COMBO_ATTACKS.length) + 1
                        : (this.currentAttack ? this.currentAttack.comboStep || 1 : 1);
                    const attackProfile = isAutoAi
                        ? this.getComboAttackProfileByStep(comboStep)
                        : this.currentAttack;
                    const attackTimer = isAutoAi
                        ? (this.specialCloneAttackTimers[i] || 0)
                        : this.attackTimer;
                    pose = this.getComboSwordPoseForTrail({
                        isAttacking: true,
                        currentAttack: attackProfile,
                        attackTimer,
                        facingRight: pos.facingRight,
                        x: pos.x - this.width * 0.5,
                        y: cloneDrawY,
                        isCrouching: false
                    });
                }
            }

            this.specialCloneSlashTrailSampleTimers[i] = this.updateSlashTrailBuffer(
                this.specialCloneSlashTrailPoints[i],
                this.specialCloneSlashTrailSampleTimers[i],
                pose,
                deltaMs
            );
        }
    }

    renderComboSlashTrail(ctx, options = {}) {
        const points = Array.isArray(options.points) ? options.points : this.comboSlashTrailPoints;
        if (!points || points.length < 2) return;
        const trailWidthScale = Number.isFinite(options.trailWidthScale)
            ? options.trailWidthScale
            : this.getXAttackTrailWidthScale();
        const boostActive = options.boostActive !== undefined
            ? !!options.boostActive
            : (trailWidthScale > 1.01 && this.isAttacking);
        const trailCenterX = Number.isFinite(options.centerX)
            ? options.centerX
            : (this.x + this.width * 0.5);
        const trailCenterY = Number.isFinite(options.centerY)
            ? options.centerY
            : (this.y + this.height * 0.5);
        const normalWidthScale = 1.34;
        const clamp01 = (v) => Math.max(0, Math.min(1, v));
        const colorRgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp01(alpha)})`;

        // 近すぎる点は統合してパスを単純化し、ギザつきを抑える
        const simplified = [];
        const minGap = 4.2;
        for (let i = 0; i < points.length; i++) {
            const src = points[i];
            const life = Math.max(1, src.life || this.comboSlashTrailActiveLifeMs);
            if (simplified.length === 0) {
                simplified.push({ x: src.x, y: src.y, age: src.age || 0, life, step: src.step || 0 });
                continue;
            }
            const last = simplified[simplified.length - 1];
            const dist = Math.hypot(src.x - last.x, src.y - last.y);
            if (dist >= minGap) {
                simplified.push({ x: src.x, y: src.y, age: src.age || 0, life, step: src.step || 0 });
            } else {
                // 近接点は統合しつつ、最新位置へ寄せて弧の連続性を保つ
                last.x = src.x;
                last.y = src.y;
                last.age = src.age || 0;
                last.life = life;
                last.step = src.step || last.step || 0;
            }
        }
        if (simplified.length < 2) return;

        let pathPoints = simplified;
        const maxNodes = 42;
        if (pathPoints.length > maxNodes) {
            const reduced = [];
            for (let i = 0; i < maxNodes; i++) {
                const t = i / (maxNodes - 1);
                const idx = t * (pathPoints.length - 1);
                const i0 = Math.floor(idx);
                const i1 = Math.min(pathPoints.length - 1, i0 + 1);
                const k = idx - i0;
                reduced.push({
                    x: pathPoints[i0].x + (pathPoints[i1].x - pathPoints[i0].x) * k,
                    y: pathPoints[i0].y + (pathPoints[i1].y - pathPoints[i0].y) * k,
                    age: pathPoints[i0].age + (pathPoints[i1].age - pathPoints[i0].age) * k,
                    life: pathPoints[i0].life + (pathPoints[i1].life - pathPoints[i0].life) * k,
                    step: Math.round(pathPoints[i0].step + (pathPoints[i1].step - pathPoints[i0].step) * k)
                });
            }
            pathPoints = reduced;
        }
        if (pathPoints.length < 2) return;
        const newestStep = pathPoints[pathPoints.length - 1]?.step || 0;
        const hasFinisherStep = newestStep === 5;
        const finisherTrailWidthScale = hasFinisherStep ? 1.16 : 1;
        const finisherCoreWidthScale = hasFinisherStep ? 1.2 : 1;
        const outerOldestAlpha = hasFinisherStep ? 0.12 : 0.08;
        const outerNewestAlpha = hasFinisherStep ? 0.64 : 0.5;
        const coreOldestAlpha = hasFinisherStep ? 0.09 : 0.06;
        const coreNewestAlpha = hasFinisherStep ? 0.56 : 0.44;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 0;

        const strips = [pathPoints];

        const buildProjected = (pts, projectFn = null) => {
            if (!projectFn) return pts;
            const mapped = [];
            for (let i = 0; i < pts.length; i++) {
                const src = pts[i];
                const p = projectFn(src);
                mapped.push({
                    x: p.x,
                    y: p.y,
                    age: src.age,
                    life: src.life
                });
            }
            return mapped;
        };

        const smoothPathPoints = (pts) => {
            if (!pts || pts.length < 3) return pts;
            const smoothed = [{ ...pts[0] }];
            const smoothWeight = 0.22;
            for (let i = 1; i < pts.length - 1; i++) {
                const prev = pts[i - 1];
                const cur = pts[i];
                const next = pts[i + 1];
                const avgX = (prev.x + next.x) * 0.5;
                const avgY = (prev.y + next.y) * 0.5;
                smoothed.push({
                    ...cur,
                    x: cur.x + (avgX - cur.x) * smoothWeight,
                    y: cur.y + (avgY - cur.y) * smoothWeight
                });
            }
            smoothed.push({ ...pts[pts.length - 1] });
            return smoothed;
        };

        const drawTrailPath = (pts) => {
            if (!pts || pts.length < 2) return false;
            const curvePts = smoothPathPoints(pts);
            if (!curvePts || curvePts.length < 2) return false;
            ctx.beginPath();
            ctx.moveTo(curvePts[0].x, curvePts[0].y);
            if (curvePts.length === 2) {
                ctx.lineTo(curvePts[1].x, curvePts[1].y);
                return true;
            }
            for (let i = 1; i < curvePts.length - 1; i++) {
                const next = curvePts[i + 1];
                const midX = (curvePts[i].x + next.x) * 0.5;
                const midY = (curvePts[i].y + next.y) * 0.5;
                ctx.quadraticCurveTo(curvePts[i].x, curvePts[i].y, midX, midY);
            }
            const endCtrl = curvePts[curvePts.length - 2];
            const end = curvePts[curvePts.length - 1];
            ctx.quadraticCurveTo(endCtrl.x, endCtrl.y, end.x, end.y);
            return true;
        };

        const drawGradientTrail = (pts, width, rgb, oldestScale, newestScale, projectFn = null) => {
            const mapped = buildProjected(pts, projectFn);
            if (!mapped || mapped.length < 2) return;
            const oldestSrc = pts[0];
            const newestSrc = pts[pts.length - 1];
            const oldestLife = Math.max(1, oldestSrc.life || this.comboSlashTrailActiveLifeMs);
            const newestLife = Math.max(1, newestSrc.life || this.comboSlashTrailActiveLifeMs);
            const oldestFade = clamp01(1 - ((oldestSrc.age || 0) / oldestLife));
            const newestFade = clamp01(1 - ((newestSrc.age || 0) / newestLife));
            const oldestAlpha = oldestFade * oldestScale;
            const newestAlpha = newestFade * newestScale;
            if (newestAlpha <= 0.01) return;

            const start = mapped[0];
            const end = mapped[mapped.length - 1];
            const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            grad.addColorStop(0, colorRgba(rgb, oldestAlpha));
            grad.addColorStop(0.52, colorRgba(rgb, oldestAlpha + (newestAlpha - oldestAlpha) * 0.58));
            grad.addColorStop(1, colorRgba(rgb, newestAlpha));

            ctx.strokeStyle = grad;
            ctx.lineWidth = width;
            if (drawTrailPath(mapped)) {
                ctx.stroke();
            }
        };

        if (!boostActive) {
            // 古い軌跡(根元側)から新しい切っ先側に向かって濃くなる
            for (const strip of strips) {
                drawGradientTrail(
                    strip,
                    8.6 * normalWidthScale * finisherTrailWidthScale,
                    [108, 196, 248],
                    outerOldestAlpha,
                    outerNewestAlpha
                );
                drawGradientTrail(
                    strip,
                    2.2 * normalWidthScale * finisherCoreWidthScale,
                    [236, 246, 255],
                    coreOldestAlpha,
                    coreNewestAlpha
                );
            }
        }

        // 連撃拡張中は、当たり判定側へ剣筋を押し出して範囲拡張を視認しやすくする
        if (boostActive) {
            // 半径（リーチ）のスケーリング: 倍率に合わせて外側へ大幅に押し出す
            // trailWidthScaleが2.6の場合、元の半径から適切に外側へ拡張されるように調整
            const off = (trailWidthScale - 1) * 82; 
            const projectOut = (p) => {
                const vx = p.x - trailCenterX;
                const vy = p.y - trailCenterY;
                const len = Math.hypot(vx, vy);
                if (len < 0.001) return { x: p.x, y: p.y };
                
                // 元の点からベクトルの向きにoff分だけ押し出す
                return {
                    x: p.x + (vx / len) * off,
                    y: p.y + (vy / len) * off
                };
            };
            for (const strip of strips) {
                // 通常より太さを強化して、拡大時も密度を保つ
                drawGradientTrail(
                    strip,
                    12.4 * trailWidthScale * finisherTrailWidthScale,
                    [108, 196, 248],
                    outerOldestAlpha,
                    outerNewestAlpha,
                    projectOut
                );
                drawGradientTrail(
                    strip,
                    3.2 * trailWidthScale * finisherCoreWidthScale,
                    [236, 246, 255],
                    coreOldestAlpha,
                    coreNewestAlpha,
                    projectOut
                );
            }
        }

        // 大凪時の追加外周帯は通常コンボで二重線に見えやすいため廃止

        ctx.restore();
    }
    
    renderSpecial(ctx) {
        const anchors = this.getSpecialCloneAnchors();

        ctx.save();

        if (this.isUsingSpecial && this.specialCastTimer > 0) {
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                // cloneIndexを渡し、y座標を本体と同じ高さに
                this.renderSpecialCastPose(
                    ctx,
                    anchor.x - this.width * 0.5,
                    this.y,
                    anchor.facingRight,
                    1.0,
                    { cloneIndex: anchor.index }
                );
            }
        } else if (this.isSpecialCloneCombatActive()) {
            for (const anchor of anchors) {
                if (anchor.alpha <= 0.02) continue;
                const i = anchor.index;
                const pos = this.specialClonePositions[i];
                if (!pos) continue;

                const invincible = (this.specialCloneInvincibleTimers[i] || 0) > 0;
                const cloneAlpha = invincible && Math.floor(this.specialCloneInvincibleTimers[i] / 70) % 2 === 0
                    ? 0.7 : 1.0;

                // 霧エフェクト
                ctx.save();
                const mist = ctx.createRadialGradient(pos.x, pos.y - 14, 2, pos.x, pos.y - 14, 34);
                mist.addColorStop(0, `rgba(180, 214, 246, ${cloneAlpha * 0.28})`);
                mist.addColorStop(1, 'rgba(180, 214, 246, 0)');
                ctx.fillStyle = mist;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y - 14, 34, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Lv0〜2は本体の攻撃状態に同期、Lv3は独自タイマー
                const cloneUsesDualZ = !!(
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name === '二刀流' &&
                    (
                        this.specialCloneAutoAiEnabled
                            ? (
                                this.specialCloneSubWeaponActions[i] === '二刀_Z' &&
                                (this.specialCloneSubWeaponTimers[i] || 0) > 0
                            )
                            : (this.subWeaponAction === '二刀_Z' && (this.subWeaponTimer || 0) > 0)
                    )
                );
                const isCloneAttacking = this.specialCloneAutoAiEnabled
                    ? ((this.specialCloneAttackTimers[i] > 0) && !cloneUsesDualZ)
                    : this.isAttacking;
                const cloneAttackTimer = this.specialCloneAutoAiEnabled
                    ? (this.specialCloneAttackTimers[i] || 0)
                    : this.attackTimer;
                const cloneComboStep = this.specialCloneAutoAiEnabled
                    ? ((this.specialCloneComboSteps[i] || 0) % COMBO_ATTACKS.length) + 1
                    : (this.currentAttack ? this.currentAttack.comboStep || 1 : 1);
                const cloneAttackProfile = this.specialCloneAutoAiEnabled
                    ? this.getComboAttackProfileByStep(cloneComboStep)
                    : null;
                const cloneAttackDurationMs = this.specialCloneAutoAiEnabled
                    ? cloneAttackProfile.durationMs
                    : (this.currentAttack ? this.currentAttack.durationMs || 320 : 320);

                // 本体の状態を退避
                const saved = {
                    isAttacking: this.isAttacking,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer,
                    attackCombo: this.attackCombo,
                    subWeaponTimer: this.subWeaponTimer,
                    subWeaponAction: this.subWeaponAction,
                    facingRight: this.facingRight,
                    x: this.x,
                    y: this.y,
                    vx: this.vx,
                    vy: this.vy,
                    isGrounded: this.isGrounded,
                    isCrouching: this.isCrouching,
                    isDashing: this.isDashing,
                    motionTime: this.motionTime,
                    subWeaponPoseOverride: this.subWeaponPoseOverride,
                    height: this.height
                };

                // ★savedの後にcloneDrawYを定義
                const cloneDrawX = pos.x - this.width * 0.5;
                const cloneDrawY = this.specialCloneAutoAiEnabled
                    ? (pos.y - this.height * 0.62)
                    : saved.y;

                // 分身の状態をセット
                this.x = cloneDrawX;
                this.y = cloneDrawY;
                this.height = PLAYER.HEIGHT;
                this.facingRight = pos.facingRight;
                this.motionTime = saved.motionTime + i * 400;

                if (this.specialCloneAutoAiEnabled) {
                    // Lv3: 独自の状態
                    this.vx = pos.renderVx || 0;
                    this.vy = pos.cloneVy || 0;
                    this.isGrounded = !(pos.jumping);
                    this.isCrouching = false;
                    this.isDashing = false;
                    this.subWeaponTimer = this.specialCloneSubWeaponTimers[i] || 0;
                    this.subWeaponAction = this.specialCloneSubWeaponActions[i] || null;
                    this.subWeaponPoseOverride = cloneUsesDualZ
                        ? {
                            comboIndex: this.specialCloneComboSteps[i] || 0,
                            attackTimer: this.specialCloneSubWeaponTimers[i] || 0
                        }
                        : null;
                } else {
                    // Lv0〜2: 本体の状態をコピー（ジャンプ含む）
                    this.vx = saved.vx;
                    this.vy = saved.vy;
                    this.isGrounded = saved.isGrounded;
                    this.isCrouching = saved.isCrouching;
                    this.isDashing = saved.isDashing;
                    this.subWeaponTimer = saved.subWeaponTimer;
                    this.subWeaponAction = saved.subWeaponAction;
                    this.subWeaponPoseOverride = null;
                }

                // ★修正: 攻撃状態のセット
                if (isCloneAttacking) {
                    this.isAttacking = true;
                    this.attackCombo = cloneComboStep;
                    if (this.specialCloneAutoAiEnabled) {
                        // Lv3: 独自の攻撃プロファイル
                        this.currentAttack = {
                            ...cloneAttackProfile,
                            comboStep: cloneComboStep
                        };
                    } else {
                        // Lv0〜2: 本体の攻撃をそのままコピー
                        this.currentAttack = saved.currentAttack;
                    }
                    this.attackTimer = cloneAttackTimer;
                } else {
                    this.isAttacking = false;
                    this.currentAttack = null;
                    this.attackTimer = 0;
                }

                ctx.save();
                ctx.globalAlpha = cloneAlpha;

                const cloneTrailPoints = Array.isArray(this.specialCloneSlashTrailPoints)
                    ? this.specialCloneSlashTrailPoints[i]
                    : null;
                if (cloneTrailPoints && cloneTrailPoints.length > 1) {
                    const trailScale = this.getXAttackTrailWidthScale();
                    if (!cloneUsesDualZ) {
                        this.renderComboSlashTrail(ctx, {
                            points: cloneTrailPoints,
                            centerX: pos.x,
                            centerY: cloneDrawY + this.height * 0.5,
                            trailWidthScale: trailScale,
                            boostActive: trailScale > 1.01 && isCloneAttacking
                        });
                    }
                }

                // 全レベル共通で根元を正しい位置にセット
                const savedScarf = this.scarfNodes;
                const savedHair = this.hairNodes;

                if (this.specialCloneScarfNodes[i] && this.specialCloneHairNodes[i]) {
                    this.scarfNodes = this.specialCloneScarfNodes[i];
                    this.hairNodes = this.specialCloneHairNodes[i];

                    const knotOffsetX = this.facingRight ? -12 : 12;
                    const targetKnotX = pos.x + knotOffsetX;

                    const footY = this.y + this.height;
                    const cloneMotionTime = saved.motionTime + i * 400;
                    const cloneIsMoving = this.specialCloneAutoAiEnabled
                        ? (Math.abs(pos.prevX - pos.x) > 0.5)
                        : (Math.abs(saved.vx) > 0.5 || !saved.isGrounded);
                    const anchorCalc = this.calculateAccessoryAnchor(
                        pos.x, footY, this.height,
                        cloneMotionTime, cloneIsMoving,
                        false, false,
                        this.legPhase || cloneMotionTime * 0.012
                    );
                    const targetKnotY = anchorCalc.headY - 2;

                    if (this.scarfNodes.length) {
                        this.scarfNodes[0].x = targetKnotX;
                        this.scarfNodes[0].y = targetKnotY;
                    }
                    if (this.hairNodes.length) {
                        this.hairNodes[0].x = targetKnotX;
                        this.hairNodes[0].y = targetKnotY - 8;
                    }
                }

                this.renderModel(ctx, this.x, this.y, this.facingRight, 1.0, true, {
                    useLiveAccessories: true,
                    renderHeadbandTail: true
                });
                if (
                    cloneUsesDualZ &&
                    this.currentSubWeapon &&
                    this.currentSubWeapon.name === '二刀流' &&
                    typeof this.currentSubWeapon.render === 'function'
                ) {
                    const dualBlade = this.currentSubWeapon;
                    const dualSaved = {
                        isAttacking: dualBlade.isAttacking,
                        attackType: dualBlade.attackType,
                        attackTimer: dualBlade.attackTimer,
                        attackDirection: dualBlade.attackDirection,
                        comboIndex: dualBlade.comboIndex,
                        projectiles: dualBlade.projectiles
                    };
                    const dualComboIndex = this.specialCloneAutoAiEnabled
                        ? (this.specialCloneComboSteps[i] || 0)
                        : (dualBlade.comboIndex || 0);
                    const dualAttackTimer = this.specialCloneAutoAiEnabled
                        ? (this.specialCloneSubWeaponTimers[i] || 0)
                        : (this.subWeaponTimer || dualBlade.attackTimer || 0);
                    dualBlade.isAttacking = true;
                    dualBlade.attackType = 'main';
                    dualBlade.attackDirection = this.facingRight ? 1 : -1;
                    dualBlade.comboIndex = dualComboIndex;
                    dualBlade.attackTimer = dualAttackTimer;
                    // 分身描画では飛翔弾を重ねない
                    dualBlade.projectiles = [];
                    dualBlade.render(ctx, this);
                    dualBlade.isAttacking = dualSaved.isAttacking;
                    dualBlade.attackType = dualSaved.attackType;
                    dualBlade.attackTimer = dualSaved.attackTimer;
                    dualBlade.attackDirection = dualSaved.attackDirection;
                    dualBlade.comboIndex = dualSaved.comboIndex;
                    dualBlade.projectiles = dualSaved.projectiles;
                }

                this.scarfNodes = savedScarf;
                this.hairNodes = savedHair;
                this.height = saved.height;

                ctx.restore();

                // 本体の状態を復元
                this.isAttacking = saved.isAttacking;
                this.currentAttack = saved.currentAttack;
                this.attackTimer = saved.attackTimer;
                this.attackCombo = saved.attackCombo;
                this.subWeaponTimer = saved.subWeaponTimer;
                this.subWeaponAction = saved.subWeaponAction;
                this.subWeaponPoseOverride = saved.subWeaponPoseOverride;
                this.facingRight = saved.facingRight;
                this.x = saved.x;
                this.y = saved.y;
                this.vx = saved.vx;
                this.vy = saved.vy;
                this.isGrounded = saved.isGrounded;
                this.isCrouching = saved.isCrouching;
                this.isDashing = saved.isDashing;
                this.motionTime = saved.motionTime;
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

    renderSpecialCastPose(ctx, x, y, facingRight, alpha = 1.0, options = {}) {
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        const silhouette = '#1a1a1a';
        const accent = '#00bfff';
        const castPulse = Math.sin(this.motionTime * 0.03) * 1.2;
        const headY = y + 16 + castPulse * 0.2;
        const hipY = bottomY - 20;

        // ★追加: 分身の場合はそのノードを一時セット
        const cloneIndex = options.cloneIndex;
        const isClone = cloneIndex !== undefined && cloneIndex !== null;
        let savedScarf = null;
        let savedHair = null;
        if (isClone) {
            savedScarf = this.scarfNodes;
            savedHair = this.hairNodes;
            if (this.specialCloneScarfNodes[cloneIndex]) {
                this.scarfNodes = this.specialCloneScarfNodes[cloneIndex];
            }
            if (this.specialCloneHairNodes[cloneIndex]) {
                this.hairNodes = this.specialCloneHairNodes[cloneIndex];
            }
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = silhouette;
        ctx.fillStyle = silhouette;
        ctx.lineCap = 'round';

        // 体幹
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(centerX + dir * 0.4, headY + 8);
        ctx.lineTo(centerX - dir * 0.2, hipY);
        ctx.stroke();

        // 足
        ctx.lineWidth = 4.4;
        ctx.beginPath();
        ctx.moveTo(centerX - dir * 0.9, hipY);
        ctx.lineTo(centerX - dir * 2.2, bottomY);
        ctx.moveTo(centerX + dir * 0.9, hipY);
        ctx.lineTo(centerX + dir * 2.1, bottomY - 0.3);
        ctx.stroke();

        // 頭
        ctx.beginPath();
        ctx.arc(centerX, headY, 14, 0, Math.PI * 2);
        ctx.fill();

        // 鉢巻バンド
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(centerX - 12, headY - 3);
        ctx.lineTo(centerX + 12, headY - 5);
        ctx.stroke();

        // 鉢巻テール — ライブノードを使用
        const knotTailX = centerX + (facingRight ? -12 : 12);
        const knotTailY = headY - 2;

        if (this.scarfNodes && this.scarfNodes.length > 1) {
            this.scarfNodes[0].x = knotTailX;
            this.scarfNodes[0].y = knotTailY;

            const scarfSpreadDist = Math.abs(this.scarfNodes[this.scarfNodes.length - 1].x - this.scarfNodes[0].x);
            const movingNow = scarfSpreadDist > 20;

            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.moveTo(knotTailX, knotTailY);

            for (let i = 1; i < this.scarfNodes.length - 1; i++) {
                const xc = (this.scarfNodes[i].x + this.scarfNodes[i + 1].x) / 2;
                const yc = (this.scarfNodes[i].y + this.scarfNodes[i + 1].y) / 2;
                ctx.quadraticCurveTo(this.scarfNodes[i].x, this.scarfNodes[i].y, xc, yc);
            }
            const lastScarf = this.scarfNodes[this.scarfNodes.length - 1];
            ctx.lineTo(lastScarf.x, lastScarf.y);

            for (let i = this.scarfNodes.length - 1; i >= 1; i--) {
                const node = this.scarfNodes[i];
                const prev = this.scarfNodes[i - 1];
                const baseWidth = movingNow ? 7 : 10;
                const waveSpeed = movingNow ? 0.008 : 0.004;
                const wavePhase = i * (movingNow ? 0.5 : 0.6);
                const wave = Math.sin(this.motionTime * waveSpeed + wavePhase);
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
            ctx.lineTo(knotTailX, knotTailY + 12);
            ctx.closePath();
            ctx.fill();
        }

        // ポニーテール — ライブノードを使用
        if (this.hairNodes && this.hairNodes.length > 1) {
            ctx.fillStyle = silhouette;
            ctx.beginPath();
            const hairBaseX = centerX - dir * 4;
            const hairBaseY = headY - 12;
            ctx.moveTo(hairBaseX, hairBaseY);

            for (let i = 1; i < this.hairNodes.length; i++) {
                const node = this.hairNodes[i];
                const prev = this.hairNodes[i - 1];
                const xc = (node.x + prev.x) / 2;
                const yc = (node.y + prev.y) / 2;
                ctx.quadraticCurveTo(prev.x, prev.y, xc, yc);
            }

            for (let i = this.hairNodes.length - 1; i >= 1; i--) {
                const node = this.hairNodes[i];
                const prev = this.hairNodes[i - 1];
                const tProgress = i / (this.hairNodes.length - 1);
                const thickness = (1 - tProgress) * 12 + 1;
                const sideShift = Math.sin(this.motionTime * 0.005 + i * 0.5) * 1.5;
                const ctrlX = node.x + sideShift;
                const ctrlY = node.y + thickness;
                const endX = (node.x + prev.x) / 2 + sideShift;
                const endY = (node.y + prev.y) / 2 + thickness;
                ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
            }
            ctx.lineTo(hairBaseX, hairBaseY);
            ctx.closePath();
            ctx.fill();
        }

        // ニンニン印 — 正面向きなので腕は体に隠れる。手と指だけ描画
        const palmX = centerX;
        const lowerHandY = headY + 10;
        const upperHandY = lowerHandY - 8;
        const handColor = '#1d1d1d';
        const shadowColor = 'rgba(80, 80, 80, 0.35)';

        // 下の手（拳）— 影付き
        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.arc(palmX, lowerHandY + 1.5, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = handColor;
        ctx.beginPath();
        ctx.arc(palmX, lowerHandY, 4.2, 0, Math.PI * 2);
        ctx.fill();

        // 上の手（拳）— 影付き
        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.arc(palmX, upperHandY + 1.5, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = handColor;
        ctx.beginPath();
        ctx.arc(palmX, upperHandY, 4.0, 0, Math.PI * 2);
        ctx.fill();

        // 指 — 影付き
        ctx.strokeStyle = shadowColor;
        ctx.lineWidth = 5.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(palmX, upperHandY - 3.5);
        ctx.lineTo(palmX, upperHandY - 5.0);
        ctx.stroke();
        ctx.strokeStyle = handColor;
        ctx.lineWidth = 4.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(palmX, upperHandY - 4.0);
        ctx.lineTo(palmX, upperHandY - 5.5);
        ctx.stroke();

        ctx.restore();

        // ★追加: 分身のノードを復元
        if (isClone) {
            this.scarfNodes = savedScarf;
            this.hairNodes = savedHair;
        }
    }

    renderHeadbandTail(ctx, headX, headY, facingRight, options = {}) {
        const forceStanding = options.forceStanding || false;
        const dir = facingRight ? 1 : -1;
        
        ctx.fillStyle = '#1e90ff';
        const knotX = headX + (facingRight ? -12 : 12);
        const knotY = headY;
        
        // 結び目
        ctx.beginPath();
        ctx.arc(knotX, knotY, 3, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.stroke();

        if (forceStanding) {
            // プレビュー画面用：物理演算を使わず、風になびくような形状を固定描画
            // これにより「変な方向に伸びる」「初期化直後の垂れ下がり」を防ぐ
            const tailCount = 2;
            const segmentCount = 10;
            const time = Date.now() * 0.002;
            
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#1e90ff';

            for (let t = 0; t < tailCount; t++) {
                ctx.beginPath();
                ctx.moveTo(knotX, knotY);
                
                let cx = knotX;
                let cy = knotY;
                
                // 少し上向きに流れるように
                const baseAngle = facingRight ? -Math.PI * 0.9 : -Math.PI * 0.1; 
                const angleOffset = (t === 0 ? 0.1 : -0.2);
                
                for (let i = 0; i < segmentCount; i++) {
                    const wave = Math.sin(time + i * 0.8 + t) * (i * 1.5);
                    const flowX = Math.cos(baseAngle + angleOffset) * (i * 6);
                    const flowY = Math.sin(baseAngle + angleOffset) * (i * 6) + (i * 1.5); // 重力
                    
                    cx = knotX + flowX + (facingRight ? -wave : wave);
                    cy = knotY + flowY;
                    ctx.lineTo(cx, cy);
                }
                ctx.stroke();
            }
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
        const zHitboxScale = this.getXAttackHitboxScale();
        const scaleBox = (box) => {
            if (!box || zHitboxScale <= 1.001) return box;
            const cx = box.x + box.width * 0.5;
            const cy = box.y + box.height * 0.5;
            const width = box.width * zHitboxScale;
            const height = box.height * zHitboxScale;
            return {
                ...box,
                x: cx - width * 0.5,
                y: cy - height * 0.5,
                width,
                height
            };
        };
        
        const attack = currentAttack;
        const range = attack.range || 90; // デフォルト値を安全のため設定
        const attackDuration = Math.max(1, attack.durationMs || PLAYER.ATTACK_COOLDOWN);
        const progress = Math.max(0, Math.min(1, 1 - (attackTimer / attackDuration)));
        
        // 回転斬り（全方位）
        if (attack.type === ANIM_STATE.ATTACK_SPIN) {
            const centerX = x + this.width / 2;
            const centerY = y + this.height / 2;
            return scaleBox({
                x: centerX - range,
                y: centerY - range,
                width: range * 2,
                height: range * 2
            });
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
                case 2:
                    swordAngle = 2.6 - 2.56 * easeOut;
                    armEndX = centerX + dir * (6 + easeOut * 26);
                    armEndY = pivotY + 9 - easeOut * 5.2;
                    {
                        const prepT = Math.max(0, Math.min(1, eased / 0.2));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const idleAngle = isCrouching ? -0.32 : -0.65;
                        const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
                        const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0);
                        swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                        armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                        armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                    }
                    break;
                case 1:
                    {
                        const wind = Math.max(0, Math.min(1, eased / 0.34));
                        const swing = Math.max(0, Math.min(1, (eased - 0.34) / 0.66));
                        const swingEase = swing * swing * (3 - 2 * swing);
                        swordAngle = 0.22 + wind * 0.94 + swingEase * 2.18;
                        armEndX = centerX + dir * (15 - wind * 8.4 - swingEase * 34.2);
                        armEndY = pivotY + 8.0 - wind * 5.6 + swingEase * 10.8;
                        const prepT = Math.max(0, Math.min(1, eased / 0.22));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const idleAngle = isCrouching ? -0.32 : -0.65;
                        const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
                        const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0);
                        swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                        armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                        armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                        const settleT = Math.max(0, Math.min(1, (eased - 0.88) / 0.12));
                        const settle = settleT * settleT * (3 - 2 * settleT);
                        swordAngle += (idleAngle - swordAngle) * settle;
                        armEndX += (idleHandX - armEndX) * settle;
                        armEndY += (idleHandY - armEndY) * settle;
                    }
                    break;
                case 3:
                    swordAngle = -0.22 + Math.sin(eased * Math.PI) * 0.34;
                    armEndX = centerX + dir * (-10 + easeInOut * 36);
                    armEndY = pivotY + 5 - Math.sin(eased * Math.PI) * 9.2;
                    {
                        const prepT = Math.max(0, Math.min(1, eased / 0.2));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const idleAngle = isCrouching ? -0.32 : -0.65;
                        const idleHandX = centerX + dir * (isCrouching ? 12 : 15);
                        const idleHandY = pivotY + (isCrouching ? 5.5 : 8.0);
                        swordAngle = idleAngle + (swordAngle - idleAngle) * prepEase;
                        armEndX = idleHandX + (armEndX - idleHandX) * prepEase;
                        armEndY = idleHandY + (armEndY - idleHandY) * prepEase;
                    }
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
                    {
                        const prepT = Math.max(0, Math.min(1, eased / 0.18));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const prevAngle = -0.22;
                        const prevHandX = centerX + dir * 26;
                        const prevHandY = pivotY + 5;
                        swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                        armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                        armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
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
                    {
                        const prepT = Math.max(0, Math.min(1, eased / 0.2));
                        const prepEase = prepT * prepT * (3 - 2 * prepT);
                        const prevAngle = -0.76 - Math.PI * 1.82;
                        const prevHandX = centerX - dir * 4.0;
                        const prevHandY = pivotY - 13.0;
                        swordAngle = prevAngle + (swordAngle - prevAngle) * prepEase;
                        armEndX = prevHandX + (armEndX - prevHandX) * prepEase;
                        armEndY = prevHandY + (armEndY - prevHandY) * prepEase;
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
                return [swordBox, closeRangeBox, forwardAssistBox, aerialBodyBox].map(scaleBox);
            }

            if (attack.comboStep === 5) {
                // 五段目: 落下斬り + 着地衝撃（足元と左右）を別当たり判定で付与
                const impactBox = {
                    x: centerX - 44,
                    y: y + this.height - 26,
                    width: 88,
                    height: 52
                };
                return [swordBox, closeRangeBox, forwardAssistBox, impactBox].map(scaleBox);
            }

            return [swordBox, closeRangeBox, forwardAssistBox].map(scaleBox);
        }

        if (attack.isLaunch) {
            const width = range;
            const height = Math.max(54, this.height + 22);
            const yBox = y - 18;
            return scaleBox({
                x: facingRight ? x + this.width : x - range,
                y: yBox,
                width,
                height
            });
        }
        
        if (facingRight) {
            return scaleBox({
                x: x + this.width,
                y: y,
                width: range,
                height: this.height
            });
        } else {
            return scaleBox({
                x: x - range,
                y: y,
                width: range,
                height: this.height
            });
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
        if (audio && typeof audio.playWeaponSwitch === 'function') {
            audio.playWeaponSwitch();
        } else {
            audio.playSelect();
        }
    }

    // ========== ShadowCaster Interface ==========
    getFootX() {
        return this.x + this.width / 2;
    }

    getFootY() {
        // スプライトの実際の足元位置を返す
        return this.y + this.height; 
    }

    getHeightAboveGround() {
        // キャラが本来着地するレーンとの差分（奥のレーンなら +24）
        return Math.max(0, (this.groundY + LANE_OFFSET) - (this.y + this.height));
    }

    getShadowBaseRadius() {
        return this.width * 0.45;
    }
}
