// ============================================
// Unification of the Nation - プレイヤークラス
// ============================================

import { PLAYER, GRAVITY, FRICTION, CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { Shockwave } from './weapon.js';
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
    { type: ANIM_STATE.ATTACK_SLASH, name: '横斬り', damage: 1.0, range: 60 },
    { type: ANIM_STATE.ATTACK_UPPERCUT, name: '斬り上げ', damage: 1.2, range: 50 },
    { type: ANIM_STATE.ATTACK_THRUST, name: '突き', damage: 1.5, range: 70 },
    { type: ANIM_STATE.ATTACK_SPIN, name: '回転斬り', damage: 1.8, range: 65 },
    { type: ANIM_STATE.ATTACK_DOWN, name: '振り下ろし', damage: 2.5, range: 55 }
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
        this.dashSpeedMultiplier = 2.35;
        this.dashDirection = 1;
        
        // しゃがみ
        this.isCrouching = false;
        
        // 攻撃
        this.isAttacking = false;
        this.attackCombo = 0;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.currentAttack = null;  // 現在の攻撃タイプ
        
        // 必殺技
        this.specialGauge = 0;
        this.maxSpecialGauge = 100;
        this.isUsingSpecial = false;
        this.specialTimer = 0;
        
        // ステータス
        this.hp = PLAYER.MAX_HP;
        this.maxHp = PLAYER.MAX_HP;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.money = 0;
        this.maxMoney = PLAYER.MONEY_MAX || 9999;
        
        // 武器
        this.currentSubWeapon = null;
        this.subWeapons = []; // 取得済みのサブ武器インスタンスを格納
        this.subWeaponIndex = 0;
        this.unlockedWeapons = [];
        this.subWeaponCooldown = 0;
        this.subWeaponTimer = 0;
        this.subWeaponAction = null;
        this.subWeaponCrouchLock = false;
        
        // 無敵時間
        this.invincibleTimer = 0;
        this.damageFlashTimer = 0;
        
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
        
        // サブ武器タイマー更新
        if (this.subWeaponTimer > 0) {
            this.subWeaponTimer -= deltaTime * 1000;
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
        
        // 必殺技中は他の操作を受け付けない
        if (this.isUsingSpecial) {
            this.updateSpecial(deltaTime);
            return;
        }
        
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
            this.currentSubWeapon.update(deltaTime);
        }
        
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
            if (isOdachiJumping) this.odachiAfterimageTimer = 16;
            const maxTrailCount = isOdachiJumping ? 14 : 7;
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

            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
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
        
        // 攻撃中は移動制限
        if (this.isAttacking) return;
        
        const odachiAttacking = !!(
            this.currentSubWeapon &&
            this.currentSubWeapon.name === '大太刀' &&
            this.currentSubWeapon.isAttacking
        );
        if (odachiAttacking && typeof this.currentSubWeapon.attackDirection === 'number') {
            this.facingRight = this.currentSubWeapon.attackDirection >= 0;
        }

        const moveDir = input.isAction('LEFT') ? -1 : (input.isAction('RIGHT') ? 1 : 0);

        const touchDashHeld = typeof input.isTouchDashActive === 'function' && input.isTouchDashActive();
        const keyboardDashHeld = typeof input.isKeyboardDashHeld === 'function' && input.isKeyboardDashHeld(moveDir);
        const sustainedDashHeld = touchDashHeld || keyboardDashHeld;

        // ダッシュ（タッチ/キーボードの押下継続中は維持）
        if (sustainedDashHeld && moveDir !== 0) {
            if (!this.isDashing) {
                this.startDash(moveDir, true);
            } else {
                this.dashDirection = moveDir >= 0 ? 1 : -1;
                this.dashTimer = Math.max(this.dashTimer, this.dashDuration * 0.85);
                this.dashCooldown = 0;
            }
        } else if (input.isActionJustPressed('DASH') && this.dashCooldown <= 0) {
            const triggerDir = moveDir !== 0 ? moveDir : (this.facingRight ? 1 : -1);
            this.startDash(triggerDir);
        }

        if (this.isDashing) {
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
        
        // 攻撃
        if (input.isActionJustPressed('ATTACK')) {
            this.attack();
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
    
    attack() {
        if (this.attackCooldown > 0) return;

        // 二刀装備時のZ攻撃は、二本で繋ぐ多方向コンボに置換
        if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
            if (this.subWeaponAction === '二刀_合体') return;
            this.attackCooldown = PLAYER.ATTACK_COOLDOWN * 0.72;
            this.currentSubWeapon.use(this, 'main');
            this.subWeaponTimer = this.currentSubWeapon.mainDuration || 190;
            this.subWeaponAction = '二刀_Z';
            this.subWeaponCrouchLock = this.isGrounded && (this.isCrouching || input.isAction('DOWN'));
            const step = this.currentSubWeapon.comboIndex || 0;
            const direction = this.facingRight ? 1 : -1;
            if (this.subWeaponCrouchLock) {
                this.vx *= 0.35;
            } else if (step === 0) {
                this.vx = direction * this.speed * 0.75;
            } else if (step === 1) {
                this.vx = direction * this.speed * 0.9;
            } else if (step === 2) {
                this.vx = -direction * this.speed * 0.45;
            } else {
                this.vx *= 0.25;
            }
            return;
        }
        
        this.isAttacking = true;
        this.attackTimer = PLAYER.ATTACK_COOLDOWN;
        this.attackCooldown = PLAYER.ATTACK_COOLDOWN * 0.8;
        
        // 空中攻撃（ジャンプ斬り：回転）
        if (!this.isGrounded) {
             this.currentAttack = { 
                 type: ANIM_STATE.ATTACK_SPIN, 
                 name: '回転斬り', 
                 damage: 1.5, 
                 range: 50 
             };
             this.animState = ANIM_STATE.ATTACK_SPIN;
             audio.playSlash(0);
             return;
        }

        // ダッシュ攻撃（新アクション：ダッシュ斬り/かち上げ）
        // ダッシュ入力だけでなく、実際に高速移動している時のみ発動させる
        const isActuallyDashing = this.isDashing && Math.abs(this.vx) > this.speed * 1.5;
        if (isActuallyDashing) {
            this.currentAttack = {
                type: ANIM_STATE.ATTACK_UPPERCUT,
                name: 'ダッシュ斬り',
                damage: 2.0,
                range: 80,
                isLaunch: true // 打ち上げフラグ
            };
            this.animState = ANIM_STATE.ATTACK_UPPERCUT;
            audio.playSlash(2); // 響きのある音
            return;
        }
        
        // コンボ
        if (this.attackCombo < PLAYER.ATTACK_COMBO_MAX) {
            this.attackCombo++;
        } else {
            this.attackCombo = 1;
        }
        
        // 連撃タイプを設定
        this.currentAttack = COMBO_ATTACKS[this.attackCombo - 1];
        this.animState = this.currentAttack.type;
        
        // 効果音再生
        audio.playSlash(this.attackCombo - 1);
    }
    
    useSubWeapon() {
        if (this.currentSubWeapon) {
            this.currentSubWeapon.use(this);
        }
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime * 1000;
        if (this.attackTimer <= 0) {
            this.isAttacking = false;
            this.currentAttack = null;
            // コンボリセットタイマー
            setTimeout(() => {
                if (!this.isAttacking) {
                    this.attackCombo = 0;
                }
            }, 300);
        }
    }
    
    useSpecial() {
        if (this.specialGauge < this.maxSpecialGauge) return;
        
        this.isUsingSpecial = true;
        this.specialTimer = 500;  // 0.5秒
        this.specialGauge = 0;
        this.hasLaunchedSpecial = false;
        this.animState = ANIM_STATE.SPECIAL;
        audio.playSpecial();
    }
    
    updateSpecial(deltaTime) {
        this.specialTimer -= deltaTime * 1000;
        
        // 溜め終了時に衝撃波を発射（progress=0.4付近）
        const progress = 1 - (this.specialTimer / 500);
        if (progress >= 0.4 && !this.hasLaunchedSpecial) {
            this.launchShockwave();
            this.hasLaunchedSpecial = true;
            audio.playBeamLaunch(); // 発射音を鳴らす
        }

        if (this.specialTimer <= 0) {
            this.isUsingSpecial = false;
        }
    }
    
    launchShockwave() {
        const g = window.game || game;
        if (!g) return;
        
        const direction = this.facingRight ? 1 : -1;
        // 発生源を剣の先に合わせる
        const launchX = this.x + this.width / 2 + (this.facingRight ? 40 : -40);
        const launchY = this.y + this.height / 2 - 10;
        
        const sw = new Shockwave(
            launchX,
            launchY,
            direction
        );
        g.shockwaves = g.shockwaves || [];
        g.shockwaves.push(sw);
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
        this.exp += amount;
        while (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.levelUp();
        }
    }
    
    levelUp() {
        this.level++;
        this.maxHp += 2;
        this.hp = this.maxHp;
        this.expToNext = Math.floor(this.expToNext * 1.5);
        console.log(`Level Up! Now level ${this.level}`);
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
        const isGroundMoving = this.isGrounded && horizontalSpeed > 0.85;
        if (isGroundMoving) {
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
    
    render(ctx) {
        ctx.save();
        this.subWeaponRenderedInModel = false;
        
        // 必殺技中は特殊効果
        if (this.isUsingSpecial) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#fff';
            // 必殺技発動フラッシュ
            const progress = 1 - (this.specialTimer / 500);
            if (progress < 0.2) {
                ctx.filter = `brightness(${100 + progress * 1000}%)`;
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
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
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
                    this.renderModel(ctx, img.x, img.y, img.facingRight, 0.3 * depthFade);
                }
            }
        }

        // 必殺技演出を本体の下に描画
        if (this.isUsingSpecial) {
            this.renderSpecial(ctx);
        }

        // 本体
        this.renderModel(ctx, this.x, this.y, this.facingRight, ctx.globalAlpha);
        
        ctx.restore();
        ctx.filter = 'none'; // 万が一restoreで戻らないときのための保険
        ctx.shadowBlur = 0;
    }

    renderModel(ctx, x, y, facingRight, alpha = 1.0, renderSubWeaponVisuals = true) {
        ctx.save();
        if (alpha !== 1.0) ctx.globalAlpha = alpha;

        // 変数定義
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        const time = this.motionTime;
        // isMovingを確実にここで定義
        const isMoving = Math.abs(this.vx) > 0.1 || !this.isGrounded;
        
        // --- Combat of Hero風 黒シルエット描画 ---
        const silhouetteColor = '#1a1a1a'; // ほぼ黒
        const accentColor = '#00bfff'; // 鮮やかな青（マフラー・鉢巻）
        
        const isCrouchPose = this.isCrouching;
        const isSpearThrustPose = this.subWeaponTimer > 0 && this.subWeaponAction === '大槍' && !this.isAttacking;
        const spearPoseProgress = isSpearThrustPose ? Math.max(0, Math.min(1, 1 - (this.subWeaponTimer / 250))) : 0;
        const spearDrive = isSpearThrustPose ? Math.sin(spearPoseProgress * Math.PI) : 0;
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
        if (isCrouchPose) {
            bob = crouchBodyBob;
        } else if (!this.isGrounded) {
            bob = Math.max(-1.4, Math.min(1.6, -this.vy * 0.07));
        } else if (isRunLike) {
            bob = Math.abs(locomotionPhase) * (isDashLike ? 3.6 : 2.5);
        } else {
            bob = Math.sin(this.motionTime * 0.005) * 1.0;
        }
        
        // 各部位の座標定義
        const headY = isCrouchPose
            ? (bottomY - 32 + bob)
            : (y + 15 + bob - (isSpearThrustPose ? spearDrive * 2.0 : 0));
        const headRadius = 14;
        const bodyTopY = headY + (isCrouchPose ? 7.8 : 8);
        const hipY = isCrouchPose
            ? (bottomY - 13.2 + bob * 0.45)
            : (bottomY - 20 - (isSpearThrustPose ? spearDrive * 3.2 : 0));
        // 通常時も少しこちらを向く。しゃがみ時は前傾を強める
        const torsoLean = isDashLike ? dir * 2.4 : (isRunLike ? dir * 1.6 : dir * 0.45);
        let torsoShoulderX = centerX + (isCrouchPose ? dir * 4.0 : torsoLean) + dir * crouchLeanShift;
        let torsoHipX = isCrouchPose
            ? (centerX + dir * 1.3 + dir * crouchLeanShift * 0.55)
            : (centerX + dir * 0.2);
        if (isSpearThrustPose) {
            // 体幹位置は通常基準を維持（頭・手との接続感を優先）
            torsoShoulderX += 0;
            torsoHipX += 0;
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

        if (isCrouchPose) {
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
        ctx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();

        // 5. 鉢巻・ポニーテール（アクセントカラー）
        // 頭の描画の後なので、頭の上に上書きされる
        
        // 結び目の位置（頭の後ろ）
        const knotOffsetX = facingRight ? -12 : 12;
        const knotX = centerX + knotOffsetX;
        const knotY = headY - 2;

        // ポニーテール（髪・手前側）を頭の上に描画して視認性確保
        if (this.hairNodes && this.hairNodes.length > 1) {
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
        }

        const drawHeadbandTail = () => {
            if (!this.scarfNodes || this.scarfNodes.length === 0) return;

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
        const frontX = centerX + (facingRight ? 14 : -14); 
        
        // 2つの制御点で滑らかなS字カーブを描く
        const ctrl1X = centerX + (facingRight ? -4 : 4);
        const ctrl1Y = headY - 4;
        const ctrl2X = centerX + (facingRight ? 8 : -8);
        const ctrl2Y = headY - 8;
        
        ctx.moveTo(knotX, knotY);
        ctx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, frontX, frontY);
        ctx.stroke();

        
        // 6. 腕と剣
        const isActuallyAttacking = this.isAttacking || (this.subWeaponTimer > 0 && this.subWeaponAction !== 'throw');
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
            ctx.fillStyle = COLORS.PLAYER_GI;
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
            const isThrowing = this.subWeaponTimer > 0 && this.subWeaponAction === 'throw';
            const hasDualSubWeapon = this.currentSubWeapon && this.currentSubWeapon.name === '二刀';

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
        } else if (this.isAttacking) {
            // メイン武器攻撃時
            this.renderAttackArmAndWeapon(ctx, {
                centerX,
                pivotY: bodyTopY + 2,
                facingRight,
                backShoulderX,
                backShoulderY,
                frontShoulderX,
                frontShoulderY,
                supportFrontHand: !(this.currentSubWeapon && this.currentSubWeapon.name === '二刀')
            });

            // 二刀装備中は反対手の刀を残す
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
                drawArmSegment(frontShoulderX, frontShoulderY, idleFrontHandX, idleFrontHandY, 5);
                drawHand(idleFrontHandX, idleFrontHandY, 4.5);
                this.drawKatana(ctx, idleFrontHandX, idleFrontHandY, idleFrontBladeAngle, dir);
            }
        }

        // サブ武器（ボム、槍など）のアニメーション
        if (this.subWeaponTimer > 0 && !this.isAttacking) {
            this.renderSubWeaponArm(ctx, centerX, bodyTopY + 2, facingRight, renderSubWeaponVisuals);
        }

        // 長い帯(テール)を最前面寄りで描き、腕より手前に来るようにする
        drawHeadbandTail();

        ctx.restore();
    }

    renderSubWeaponArm(ctx, centerX, pivotY, facingRight, renderWeaponVisuals = true) {
        const dir = facingRight ? 1 : -1;
        const dualBlade = (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') ? this.currentSubWeapon : null;
        const subDuration =
            this.subWeaponAction === 'throw' ? 150 :
            (this.subWeaponAction === '大槍') ? 250 :
            (this.subWeaponAction === '鎖鎌') ? 560 :
            (this.subWeaponAction === '二刀_Z') ? 190 :
            (this.subWeaponAction === '二刀') ? 150 :
            (this.subWeaponAction === '二刀_合体') ? 220 :
            (this.subWeaponAction === '大太刀') ? 760 : 300;
        const sourceTimer =
            (dualBlade && (this.subWeaponAction === '二刀' || this.subWeaponAction === '二刀_合体' || this.subWeaponAction === '二刀_Z'))
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
            ctx.fillStyle = COLORS.PLAYER_GI;
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
            drawArmSegment(throwShoulderX, throwShoulderY, armEndX, armEndY, 5.4);
            drawHand(armEndX, armEndY, 5);

            // 投げる瞬間の爆弾
            if (progress < 0.52) {
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.arc(armEndX, armEndY, 6, 0, Math.PI * 2);
                ctx.fill();
            }
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

            const rightShoulderX = backShoulderX + dir * 0.8;
            const rightShoulderY = shoulderY - 0.7;
            const leftShoulderX = frontShoulderX - dir * 0.6;
            const leftShoulderY = shoulderY + 1.1;

            const rightReach = comboStep === 3 ? 24.5 : 21.8;
            const leftReach = comboStep === 3 ? 23.2 : 20.8;
            let rightTargetX = rightShoulderX + Math.cos(pose.rightAngle) * rightReach * dir;
            let rightTargetY = rightShoulderY + Math.sin(pose.rightAngle) * rightReach;
            let leftTargetX = leftShoulderX + Math.cos(pose.leftAngle) * leftReach * dir;
            let leftTargetY = leftShoulderY + Math.sin(pose.leftAngle) * leftReach;

            if (comboStep === 1) {
                rightTargetY -= 2.4;
                leftTargetY -= 2.0;
            } else if (comboStep === 2) {
                rightTargetX -= dir * 1.8;
                leftTargetX -= dir * 2.8;
                leftTargetY += 1.7;
            } else if (comboStep === 3) {
                const spinSpread = Math.sin((pose.progress || 0) * Math.PI);
                rightTargetX += dir * (1.8 + spinSpread * 3.6);
                leftTargetX -= dir * (1.4 + spinSpread * 3.1);
                rightTargetY -= spinSpread * 1.8;
                leftTargetY += spinSpread * 1.6;
            }

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
        } else if (this.subWeaponAction === '二刀') {
            // X攻撃：手前手の剣で後方を払う
            const blade = dualBlade;
            let currentAngle;
            if (blade && typeof blade.getLeftSwingAngle === 'function') {
                currentAngle = blade.getLeftSwingAngle();
            } else {
                const comboIndex = blade ? blade.comboIndex : 0;
                const attackTimer = blade ? blade.attackTimer : 0;
                const attackProgress = Math.max(0, Math.min(1, attackTimer / 150));
                let start = -Math.PI * 0.75;
                let end = Math.PI * 0.22;
                if (comboIndex === 1) {
                    start = -Math.PI * 0.5;
                    end = Math.PI * 0.5;
                } else if (comboIndex === 2) {
                    start = Math.PI * 0.28;
                    end = -Math.PI * 0.55;
                } else if (comboIndex === 3) {
                    start = 0;
                    end = Math.PI * 2;
                }
                currentAngle = start + (end - start) * (1 - attackProgress);
            }

            // Xは後方攻撃。剣筋の中心に寄せて手元の違和感をなくす
            const armEndX = centerX - dir * 2;
            const armEndY = pivotY + 10;
            drawArmSegment(frontShoulderX, shoulderY + 1, armEndX, armEndY, 5.5);
            drawHand(armEndX, armEndY, 5);

            // 手前手の刀も同じ刀身定義で描画
            // X攻撃は後方扱いなので、剣筋側(isBackwards)と同じ反転方向で描画
            if (renderWeaponVisuals) {
                this.drawKatana(ctx, armEndX, armEndY, currentAngle, -dir);
            }

            // 奥手の刀は待機姿勢のまま保持
            drawSupportPose(centerX + dir * 12, pivotY + 10, true, -0.55, dir, true);
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
        const progress = 1 - (this.attackTimer / PLAYER.ATTACK_COOLDOWN);
        const dir = facingRight ? 1 : -1;
        
        let swordAngle = 0;
        let armEndX, armEndY;
        const range = attack.range; // 攻撃ごとのリーチ
        
        switch (attack.type) {
            case ANIM_STATE.ATTACK_SLASH: // 横斬り
                swordAngle = (progress - 0.5) * Math.PI;
                armEndX = centerX + dir * 15;
                armEndY = pivotY + 5;
                break;
            case ANIM_STATE.ATTACK_UPPERCUT: // 斬り上げ
                swordAngle = Math.PI/2 - progress * Math.PI;
                armEndX = centerX + dir * 12;
                armEndY = pivotY - 5;
                break;
            case ANIM_STATE.ATTACK_THRUST: // 突き
                swordAngle = 0;
                armEndX = centerX + dir * (10 + progress * 20);
                armEndY = pivotY + 5;
                break;
            case ANIM_STATE.ATTACK_SPIN: // 回転斬り
                swordAngle = progress * Math.PI * 2;
                armEndX = centerX + Math.cos(swordAngle) * 10;
                armEndY = pivotY + Math.sin(swordAngle) * 10;
                break;
            case ANIM_STATE.ATTACK_DOWN: // 振り下ろし
                swordAngle = -Math.PI/2 + progress * Math.PI;
                armEndX = centerX + dir * 15;
                armEndY = pivotY;
                break;
        }

        // 奥手（主動作）: 付け根を固定して描画
        ctx.strokeStyle = COLORS.PLAYER;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(backShoulderX, backShoulderY);
        ctx.lineTo(armEndX, armEndY);
        ctx.stroke();

        // 手を上書きで描画
        ctx.fillStyle = COLORS.PLAYER_GI;
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
            const supportHand = clampArmReach(frontShoulderX, frontShoulderY, supportTargetX, supportTargetY, 22);

            ctx.strokeStyle = COLORS.PLAYER;
            ctx.lineWidth = 5.1;
            ctx.beginPath();
            ctx.moveTo(frontShoulderX, frontShoulderY);
            ctx.lineTo(supportHand.x, supportHand.y);
            ctx.stroke();

            ctx.fillStyle = COLORS.PLAYER_GI;
            ctx.beginPath();
            ctx.arc(supportHand.x, supportHand.y, 4.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // 剣を描画（デフォルメ→日本刀）
        ctx.save();
        ctx.translate(armEndX, armEndY);
        ctx.scale(facingRight ? 1 : -1, 1); // 左右反転
        
        // 回転斬りの場合、剣も回転させる
        // scale(-1, 1) があるため、回転方向も適切に反転される
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
        
        if (attack.type === ANIM_STATE.ATTACK_THRUST) {
            // 突きのエフェクト：剣の先に逆C字（ソニックブーム形状）
            const alpha = 1.0 * (1 - progress);
            
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = `rgba(100, 255, 255, ${alpha})`;
            
            // 外側の青い光 (逆C字)
            ctx.fillStyle = `rgba(100, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(swordLen, -25);
            // 右に膨らむ弧
            ctx.bezierCurveTo(swordLen + 20, -10, swordLen + 20, 10, swordLen, 25);
            // 内側に戻る (三日月型にする)
            ctx.bezierCurveTo(swordLen + 10, 10, swordLen + 10, -10, swordLen, -25);
            ctx.fill();
            
            ctx.restore();
            
        } else {
            // それ以外の斬撃（ストローク描画）
            ctx.strokeStyle = `rgba(100, 200, 255, ${0.8 * (1 - progress)})`; // 青白く
            ctx.lineWidth = 15;
            ctx.lineCap = 'round';
            ctx.beginPath();
            // 二刀流(赤)の剣筋と同じ見た目になるよう、通常剣筋の基準半径を固定
            const normalSlashRadius = 80;
            
            if (attack.type === ANIM_STATE.ATTACK_SPIN) {
                ctx.arc(0, 0, normalSlashRadius, 0, Math.PI * 2);
            } else if (attack.isLaunch) {
                // ダッシュ斬り（打ち上げ）のエフェクト：下から上へ
                ctx.beginPath();
                ctx.arc(-20, 0, normalSlashRadius, -Math.PI * 0.4, Math.PI * 0.4, true);
            } else {
                // 円弧を描く
                ctx.arc(-10, 0, normalSlashRadius, -0.8, 0.8);
            }
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    renderSpecial(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const progress = 1 - (this.specialTimer / 500);
        const dir = this.facingRight ? 1 : -1;
        const fxTime = this.motionTime * 0.01;
        
        ctx.save();
        // 溜めエフェクト
        if (progress < 0.4) {
            // 背景を暗くする
            ctx.fillStyle = `rgba(0, 0, 0, ${progress * 1.5})`;
            ctx.fillRect(-this.x - 500, -this.y - 500, CANVAS_WIDTH + 1000, CANVAS_HEIGHT + 1000);

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 80 * (1 - progress / 0.4), 0, Math.PI * 2);
            ctx.stroke();
            
            // 集中線
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            for(let i=0; i<12; i++) {
                const angle = (i / 12) * Math.PI * 2 + fxTime;
                const r1 = 40 + progress * 20;
                const r2 = 100 + progress * 50;
                ctx.beginPath();
                ctx.moveTo(centerX + Math.cos(angle) * r1, centerY + Math.sin(angle) * r1);
                ctx.lineTo(centerX + Math.cos(angle) * r2, centerY + Math.sin(angle) * r2);
                ctx.stroke();
            }
        } else {
            // 発射時の一瞬のフラッシュ
            const flashProgress = (progress - 0.4) / 0.6;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - flashProgress)})`;
            ctx.fillRect(-this.x - 500, -this.y - 500, CANVAS_WIDTH + 1000, CANVAS_HEIGHT + 1000);
            
            // プレイヤー周囲の衝撃（発生源を調整：剣のあたりから）
            const swordX = centerX + (this.facingRight ? 30 : -30);
            const swordY = centerY - 10;
            
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 10 * (1 - flashProgress);
            ctx.beginPath();
            ctx.arc(swordX, swordY, 50 + flashProgress * 200, 0, Math.PI * 2);
            ctx.stroke();
            
            // 稲妻エフェクト（ランダムな電撃）
            if (flashProgress < 0.7) {
                ctx.strokeStyle = `rgba(100, 200, 255, ${(1 - flashProgress) * 0.8})`;
                ctx.lineWidth = 4;
                for (let i = 0; i < 8; i++) {
                    const angle = (fxTime + i * Math.PI * 0.25) % (Math.PI * 2);
                    const dist = 50 + Math.random() * 100;
                    const wobble = Math.sin(this.motionTime * 0.03 + i) * 30;
                    
                    ctx.beginPath();
                    ctx.moveTo(swordX, swordY);
                    ctx.lineTo(
                        swordX + Math.cos(angle) * dist + wobble,
                        swordY + Math.sin(angle) * dist + wobble * 0.5
                    );
                    ctx.stroke();
                }
            }
            
            // エネルギーパーティクル
            const particleCount = 40;
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2 + flashProgress * Math.PI * 6;
                const dist = 40 + flashProgress * 200 + Math.sin(i * 0.7 + flashProgress * 15) * 30;
                const px = swordX + Math.cos(angle) * dist;
                const py = swordY + Math.sin(angle) * dist;
                const size = 4 * (1 - flashProgress);
                const alpha = (1 - flashProgress) * 0.9;
                
                // グラデーション色彩
                const hue = (i * 8 + flashProgress * 360) % 360;
                ctx.fillStyle = `hsla(${hue > 180 ? 200 : 50}, 100%, 70%, ${alpha})`;
                
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    
        // 抜刀の構え
        ctx.save();
        ctx.translate(centerX, this.y + 25);
        
        // 前傾姿勢の体
        ctx.fillStyle = COLORS.PLAYER_GI;
        ctx.beginPath();
        ctx.ellipse(0, 10, 15, 20, dir * Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        
        // 頭
        ctx.translate(dir * 10, -10);
        ctx.roundRect(-10, -10, 20, 18, 5);
        ctx.fill();
        ctx.restore();
    }
    
    // 攻撃判定の取得（当たり判定用）
    getAttackHitbox() {
        if (!this.isAttacking || !this.currentAttack) return null;
        
        const range = this.currentAttack.range;
        
        // 回転斬り（全方位）
        if (this.currentAttack.type === ANIM_STATE.ATTACK_SPIN) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            return {
                x: centerX - range,
                y: centerY - range,
                width: range * 2,
                height: range * 2
            };
        }
        
        if (this.facingRight) {
            return {
                x: this.x + this.width,
                y: this.y,
                width: range,
                height: this.height
            };
        } else {
            return {
                x: this.x - range,
                y: this.y,
                width: range,
                height: this.height
            };
        }
    }
    
    // 必殺技判定の取得
    getSpecialHitbox() {
        if (!this.isUsingSpecial || (1 - this.specialTimer / 500) < 0.4) return null;
        
        const startX = this.facingRight ? this.x + this.width / 2 : 0;
        const width = this.facingRight ? CANVAS_WIDTH - startX : this.x + this.width / 2;
        
        return {
            x: startX,
            y: this.y - 20,
            width: width,
            height: this.height + 40
        };
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
        
        console.log(`武器切り替え: ${this.currentSubWeapon.name}`);
    }
}
