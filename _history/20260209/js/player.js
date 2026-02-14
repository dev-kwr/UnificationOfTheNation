// ============================================
// Unification of the Nation - プレイヤークラス
// ============================================

import { PLAYER, GRAVITY, FRICTION, CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from './constants.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { Bomb, Shockwave } from './weapon.js';
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
        
        // 武器
        this.currentSubWeapon = null;
        this.subWeapons = []; // 取得済みのサブ武器インスタンスを格納
        this.subWeaponIndex = 0;
        this.unlockedWeapons = [];
        this.subWeaponCooldown = 0;
        
        // 無敵時間
        this.invincibleTimer = 0;
        
        // アニメーション
        this.animState = ANIM_STATE.IDLE;
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.legAngle = 0;  // 足の角度（走りアニメ用）
        this.armAngle = 0;  // 腕の角度（攻撃用）
        
        // 残像用
        this.afterImages = [];
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
        
        // 残像更新
        if (this.isDashing || Math.abs(this.vx) > PLAYER.SPEED * 1.5) {
            this.afterImages.unshift({
                x: this.x,
                y: this.y,
                facingRight: this.facingRight
            });
            if (this.afterImages.length > 5) this.afterImages.pop();
        } else {
            if (this.afterImages.length > 0) this.afterImages.pop();
        }
    }
    handleInput() {
        // サブ武器切り替え（最優先）
        if (input.isActionJustPressed('SWITCH_WEAPON')) {
            this.switchSubWeapon();
        }

        // しゃがみ（空中・攻撃中は不可）
        if (this.isGrounded && input.isAction('DOWN') && !this.isAttacking) {
            if (!this.isCrouching) {
                this.isCrouching = true;
                // 高さが半分になるので、足元を合わせるためにyを下げる
                this.y += PLAYER.HEIGHT / 2;
            }
            this.vx *= 0.8;
        } else if (!input.isAction('DOWN') || !this.isGrounded || this.isAttacking) {
            if (this.isCrouching) {
                this.isCrouching = false;
                // 高さが戻るので、足元を合わせるためにyを上げる
                this.y -= PLAYER.HEIGHT / 2;
            }
        }
        
        // 爆弾投げ（二刀流の時は左手攻撃に置換）
        if (input.isActionJustPressed('BOMB')) {
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
                // 左手攻撃（X）
                this.currentSubWeapon.use(this, 'left');
                this.subWeaponTimer = 150; 
                this.subWeaponAction = '二刀';
            } else {
                this.throwBomb();
                this.subWeaponTimer = 150;
                this.subWeaponAction = 'throw';
            }
        }
        
        if (input.isActionJustPressed('SUB_WEAPON')) {
            // クールダウン中は発動不可
            if (this.subWeaponTimer > 0) return;

            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
                // 連打防止：既に衝撃波が出ていたら撃てない (一個目が消えるまで)
                // 配列の長さチェックを確実に行う
                if (this.currentSubWeapon.projectiles && this.currentSubWeapon.projectiles.length > 0) return;

                // 両手攻撃（飛ぶ斬撃）
                this.currentSubWeapon.use(this, 'combined');
                this.subWeaponTimer = 220; // 合体モーションを高速化
                this.subWeaponAction = '二刀_合体';
                this.vx = 0; // 完全に停止
            } else {
                this.useSubWeapon();
                const weaponName = this.currentSubWeapon ? this.currentSubWeapon.name : '';
                this.subWeaponTimer = (weaponName === '大太刀') ? 600 : 300;
                this.subWeaponAction = weaponName;
            }
        }

        
        // 必殺技（攻撃中でも可能）
        if (input.isActionJustPressed('SPECIAL')) {
            this.useSpecial();
        }
        
        // 攻撃中は移動制限
        if (this.isAttacking) return;
        
        // 左右移動
        if (input.isAction('LEFT')) {
            this.vx = this.isDashing ? -(this.speed * 2) : -this.speed;
            this.facingRight = false;
        } else if (input.isAction('RIGHT')) {
            this.vx = this.isDashing ? (this.speed * 2) : this.speed;
            this.facingRight = true;
        }
        
        // ダッシュ
        if (input.isAction('DASH') && this.dashCooldown <= 0) {
            this.isDashing = true;
        } else {
            this.isDashing = false;
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
    
    attack() {
        if (this.attackCooldown > 0) return;
        
        this.isAttacking = true;
        this.attackTimer = PLAYER.ATTACK_COOLDOWN;
        this.attackCooldown = PLAYER.ATTACK_COOLDOWN * 0.8;

        // 二刀流装備時は右手攻撃エフェクトを発生させる
        if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
            this.currentSubWeapon.use(this, 'right');
        }
        
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
    
    throwBomb() {
        const g = window.game || game;
        if (!g) return;
        
        const direction = this.facingRight ? 1 : -1;
        let vx = direction * 8;
        let vy = -8;
        
        // しゃがみ中はさらになだらか（低く遠く）投げる
        let bombY = this.y + 10;
        if (this.isCrouching) {
            vx = direction * 8; // 射程を抑える
            vy = -4.0; // 放物線を描くように
            bombY = this.y + this.height - 15; // 足元近くから発射
        }
        
        const bomb = new Bomb(
            this.x + this.width / 2 + direction * 15,
            bombY,
            vx,
            vy
        );
        g.bombs.push(bomb);
        
        audio.playDash(); // 投擲音代用
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
        if (this.isGrounded && !input.isAction('LEFT') && !input.isAction('RIGHT')) {
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
        
        // 地面判定
        if (this.y + this.height >= this.groundY) {
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
    
    takeDamage(amount) {
        if (this.invincibleTimer > 0) return false;
        
        this.hp -= amount;
        this.invincibleTimer = 1000;  // 1秒無敵
        this.damageFlashTimer = 300;  // ダメージフラッシュ用タイマー（0.3秒）
        
        // ノックバック
        this.vx = this.facingRight ? -5 : 5;
        this.vy = -3;
        
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
    
    addMoney(amount) {
        this.money += amount;
    }
    
    updateAnimation(deltaTime) {
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
            } else if (Math.abs(this.vx) > 0.1) {
                this.animState = this.isDashing ? ANIM_STATE.DASH : ANIM_STATE.RUN;
            } else {
                this.animState = ANIM_STATE.IDLE;
            }
        }

        // 足の動きの計算
        if (this.animState === ANIM_STATE.RUN || this.animState === ANIM_STATE.DASH) {
            const speed = this.isDashing ? 0.02 : 0.015;
            this.legAngle = Math.sin(Date.now() * speed) * 0.8;
        } else if (this.animState === ANIM_STATE.IDLE) {
            this.legAngle = Math.sin(Date.now() * 0.002) * 0.1;
        } else {
            this.legAngle = 0.5;
        }

        // --- 鉢巻・ポニーテールの更新処理 ---
        // ガード＆初期化
        if (!this.scarfNodes || this.scarfNodes.length === 0) {
            this.scarfNodes = [];
            this.hairNodes = []; // ポニーテール用ノード
            for (let i = 0; i < 9; i++) { // ノード数を増やす
                this.scarfNodes.push({ x: this.x, y: this.y });
                // ポニーテールを長く (6 -> 8ノード)
                if (i < 8) this.hairNodes.push({ x: this.x, y: this.y });
            }
            return; 
        }

        const speedX = this.vx;
        const isMoving = Math.abs(speedX) > 0.1;
        const dt = Math.min(deltaTime, 0.1); 
        const subSteps = 2;
        const subDelta = dt / subSteps;
        const time = Date.now();
        const flutterSpeed = 0.02;

        const knotOffsetX = this.facingRight ? -12 : 12;
        const targetX = this.x + this.width / 2 + knotOffsetX;
        const targetY = this.y + 15 - 2;
        
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
    
    render(ctx) {
        ctx.save();
        
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

        // ダメージフラッシュ（赤く点滅）
        if (this.damageFlashTimer > 0) {
            ctx.filter = 'brightness(180%) sepia(100%) saturate(500%) hue-rotate(-30deg)';
        }

        // 無敵時間中は点滅
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // 残像 (ダッシュ中)
        if (this.isDashing || Math.abs(this.vx) > PLAYER.SPEED * 1.5) {
            for (let i = 0; i < this.afterImages.length; i += 2) {
                const img = this.afterImages[i];
                if (!img) continue;
                // 残像は薄く、少し青みがかった色で
                this.renderModel(ctx, img.x, img.y, img.facingRight, 0.3 * (1 - i / this.afterImages.length));
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

    renderModel(ctx, x, y, facingRight, alpha = 1.0) {
        ctx.save();
        if (alpha !== 1.0) ctx.globalAlpha = alpha;

        // 変数定義
        const centerX = x + this.width / 2;
        const bottomY = y + this.height - 2;
        const dir = facingRight ? 1 : -1;
        const time = Date.now();
        // isMovingを確実にここで定義
        const isMoving = Math.abs(this.vx) > 0.1 || !this.isGrounded;
        
        // --- Combat of Hero風 黒シルエット描画 ---
        const silhouetteColor = '#1a1a1a'; // ほぼ黒
        const accentColor = '#00bfff'; // 鮮やかな青（マフラー・鉢巻）
        
        // アニメーション補正
        let bob = 0;
        if (this.animState === ANIM_STATE.IDLE) {
            bob = Math.sin(Date.now() * 0.005) * 1.5;
        } else if (this.animState === ANIM_STATE.RUN) {
            bob = Math.abs(Math.sin(Date.now() * 0.02)) * 3;
        }
        
        // 各部位の座標定義
        const headY = y + 15 + bob;
        const headRadius = 14; 
        const bodyTopY = headY + 8;
        const hipY = bottomY - 20; // 足を長く（元の-15から変更）
        // 通常時も少しこちらを向くように、胴体軸を軽くひねる
        const torsoShoulderX = centerX + dir * 1.8;
        const torsoHipX = centerX - dir * 1.2;
        

        
        // 3. 体と足（黒）
        ctx.strokeStyle = silhouetteColor;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        
        // 体
        ctx.beginPath();
        ctx.moveTo(torsoShoulderX, bodyTopY);
        ctx.lineTo(torsoHipX, hipY);
        ctx.stroke();
        
        // 足（スマートに細く）
        ctx.lineWidth = 5; 
        const legRunOffset = Math.sin(this.legAngle) * 12;
        
        // 奥足
        ctx.beginPath();
        ctx.moveTo(torsoHipX, hipY);
        const backFootX = centerX - (facingRight ? -1 : 1) * legRunOffset;
        const backFootY = bottomY - (this.animState === ANIM_STATE.RUN ? Math.max(0, -Math.sin(this.legAngle)*5) : 0);
        ctx.lineTo(backFootX, backFootY);
        ctx.stroke();
        
        // 手前足
        ctx.beginPath();
        ctx.moveTo(torsoHipX, hipY);
        const frontFootX = centerX + (facingRight ? -1 : 1) * legRunOffset;
        const frontFootY = bottomY - (this.animState === ANIM_STATE.RUN ? Math.max(0, Math.sin(this.legAngle)*5) : 0);
        ctx.lineTo(frontFootX, frontFootY);
        ctx.stroke();
        
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

        // --- 鉢巻テール（手前側） ---
        if (this.scarfNodes && this.scarfNodes.length > 0) {
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
            const time = Date.now();
            const isMoving = Math.abs(this.vx) > 0.1;
            
            for (let i = this.scarfNodes.length - 1; i >= 1; i--) {
                const node = this.scarfNodes[i];
                const prev = this.scarfNodes[i - 1];
                
                const baseWidth = isMoving ? 7 : 10; // 走っているときは細く、止まっているときは存在感を出す
                const waveSpeed = isMoving ? 0.008 : 0.004;
                const wavePhase = i * (isMoving ? 0.5 : 0.6);
                const wave = Math.sin(time * waveSpeed + wavePhase);
                
                // 太さの下限を保証しつつ、ひねり(twist)を表現
                const currentWidth = baseWidth * (isMoving ? 0.85 : 1.0 + Math.abs(wave) * 0.3); 
                // ズレを適度に。静止時は重なり防止のために少し多めに。
                const tiltX = wave * (isMoving ? 1.0 : 3.0); 
                
                const controlX = node.x + tiltX; 
                const controlY = node.y + currentWidth;
                const endX = (node.x + prev.x) / 2 + tiltX;
                const endY = (node.y + prev.y) / 2 + currentWidth;
                
                if (i === this.scarfNodes.length - 1) {
                    ctx.lineTo(node.x + tiltX, node.y + currentWidth);
                }
                ctx.quadraticCurveTo(controlX, controlY, endX, endY);
            }
            ctx.lineTo(knotX, knotY + 12); // 接続部。ベース幅の増加に合わせる
            ctx.closePath();
            ctx.fill();
        }

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
        // サブ武器使用中(subWeaponTimer)または通常斬り中(isAttacking)でない場合にデフォルトの腕を描画
        const isActuallyAttacking = this.isAttacking || (this.subWeaponTimer > 0 && this.subWeaponAction !== 'throw');

        const drawShortKatana = (x, y, angle) => {
            const bladeLen = 60;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(facingRight ? 1 : -1, 1);
            ctx.rotate(angle);
            ctx.fillStyle = '#111';
            ctx.fillRect(-1, -2.1, 2.8, 4.2);
            ctx.fillStyle = '#c9a545';
            ctx.fillRect(1.2, -1.8, 1.2, 3.6);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(1, -1.15);
            ctx.lineTo(bladeLen - 2.2, -1.15);
            ctx.lineTo(bladeLen, 0);
            ctx.quadraticCurveTo(bladeLen - 6.7, 1.55, 1, 1.05);
            ctx.fill();
            ctx.fillStyle = '#bbb';
            ctx.beginPath();
            ctx.moveTo(2, -0.45);
            ctx.lineTo(bladeLen - 8.7, -0.45);
            ctx.quadraticCurveTo(bladeLen - 13.2, 0.05, 2, 0.25);
            ctx.fill();
            ctx.restore();
        };
        
        if (!isActuallyAttacking) {
            // 通常時（待機/移動/ボム投擲中）
            // ボム投擲中は renderSubWeaponArm が腕を描くのでここでは描かないが、剣は描きたい
            const isThrowing = this.subWeaponTimer > 0 && this.subWeaponAction === 'throw';
            
            const handY = bodyTopY + 10 + Math.sin(Date.now() * 0.01) * 2;
            const handX = centerX + dir * 15;
            const supportHandX = centerX - dir * 8;
            const supportHandY = bodyTopY + 12;
            
            // 腕：ボム投擲中でなければ描く
            if (!isThrowing) {
                ctx.strokeStyle = silhouetteColor;
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(torsoShoulderX, bodyTopY + 2);
                ctx.lineTo(handX, handY);
                ctx.stroke();

                // 反対側の手（前手）を腰前に軽く曲げた待機ポーズで追加
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(centerX - dir * 1, bodyTopY + 3);
                ctx.lineTo(supportHandX, supportHandY);
                ctx.stroke();

                ctx.fillStyle = COLORS.PLAYER_GI;
                ctx.beginPath();
                ctx.arc(supportHandX, supportHandY, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // 剣：奥手の基準刀（この形を正とする）
            drawShortKatana(handX, handY, -0.55);

            // 二刀装備中は前手にも短刀を持たせる
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
                drawShortKatana(supportHandX, supportHandY, -1.05);
            }
        } else if (this.isAttacking) {
            // メイン武器攻撃時
            this.renderAttackArmAndWeapon(ctx, centerX, bodyTopY + 2, facingRight);
            // 二刀装備中は反対手の短刀を残す
            if (this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
                const supportHandX = centerX - dir * 8;
                const supportHandY = bodyTopY + 12;
                ctx.strokeStyle = silhouetteColor;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(centerX - dir * 1, bodyTopY + 3);
                ctx.lineTo(supportHandX, supportHandY);
                ctx.stroke();
                ctx.fillStyle = COLORS.PLAYER_GI;
                ctx.beginPath();
                ctx.arc(supportHandX, supportHandY, 4.5, 0, Math.PI * 2);
                ctx.fill();
                drawShortKatana(supportHandX, supportHandY, -1.05);
            }
        }

        // サブ武器（ボム、槍など）のアニメーションがあれば上書きまたは追加で描画
        if (this.subWeaponTimer > 0 && !this.isAttacking) {
            this.renderSubWeaponArm(ctx, centerX, bodyTopY + 2, facingRight);
            // X攻撃中も反対手の短刀を残す
            if (this.subWeaponAction === '二刀' && this.currentSubWeapon && this.currentSubWeapon.name === '二刀') {
                const supportHandX = centerX + dir * 12;
                const supportHandY = bodyTopY + 10;
                ctx.strokeStyle = silhouetteColor;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(torsoShoulderX, bodyTopY + 2);
                ctx.lineTo(supportHandX, supportHandY);
                ctx.stroke();
                ctx.fillStyle = COLORS.PLAYER_GI;
                ctx.beginPath();
                ctx.arc(supportHandX, supportHandY, 4.5, 0, Math.PI * 2);
                ctx.fill();
                drawShortKatana(supportHandX, supportHandY, -0.55);
            }
        }

        ctx.restore();
    }

    renderSubWeaponArm(ctx, centerX, pivotY, facingRight) {
        const dir = facingRight ? 1 : -1;
        const subDuration =
            this.subWeaponAction === 'throw' ? 250 :
            (this.subWeaponAction === '大太刀') ? 600 :
            (this.subWeaponAction === '二刀_合体') ? 220 : 400;
        const progress = 1 - (this.subWeaponTimer / subDuration);
        const silhouetteColor = COLORS.PLAYER;
        
        ctx.save();
        ctx.strokeStyle = silhouetteColor;
        ctx.lineWidth = 6;

        const drawShortKatanaLocal = (x, y, angle, scaleDir = dir) => {
            const bladeLen = 60;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scaleDir, 1);
            ctx.rotate(angle);
            ctx.fillStyle = '#111';
            ctx.fillRect(-1, -2.1, 2.8, 4.2);
            ctx.fillStyle = '#c9a545';
            ctx.fillRect(1.2, -1.8, 1.2, 3.6);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(1, -1.15);
            ctx.lineTo(bladeLen - 2.2, -1.15);
            ctx.lineTo(bladeLen, 0);
            ctx.quadraticCurveTo(bladeLen - 6.7, 1.55, 1, 1.05);
            ctx.fill();
            ctx.fillStyle = '#bbb';
            ctx.beginPath();
            ctx.moveTo(2, -0.45);
            ctx.lineTo(bladeLen - 8.7, -0.45);
            ctx.quadraticCurveTo(bladeLen - 13.2, 0.05, 2, 0.25);
            ctx.fill();
            ctx.restore();
        };
        
        let armEndX, armEndY;
        let armAngle = 0;

        if (this.subWeaponAction === 'throw') {
            // 投げモーション（振り子）
            armAngle = -Math.PI * 0.8 + progress * Math.PI * 0.6;
            armEndX = centerX + Math.cos(armAngle) * 20;
            armEndY = pivotY + Math.sin(armAngle) * 20;
            
            // 腕
            ctx.beginPath();
            ctx.moveTo(centerX, pivotY);
            ctx.lineTo(armEndX, armEndY);
            ctx.stroke();

            // 投げる瞬間の爆弾
            if (progress < 0.5) {
                ctx.fillStyle = '#333';
                ctx.beginPath();
                // knotXベースではなく腕の先端ベースであることを再確認
                ctx.arc(armEndX, armEndY, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.subWeaponAction === '大槍') {
            // 突き出し
            armEndX = centerX + dir * (10 + progress * 25);
            armEndY = pivotY + 5;
            ctx.beginPath();
            ctx.moveTo(centerX, pivotY);
            ctx.lineTo(armEndX, armEndY);
            ctx.stroke();
        } else if (this.subWeaponAction === '二刀') {
            // X攻撃：手前手の剣で後方を払う
            const blade = this.currentSubWeapon;
            const comboIndex = blade ? blade.comboIndex : 0;
            const attackTimer = blade ? blade.attackTimer : 0;
            const attackProgress = Math.max(0, Math.min(1, attackTimer / 150));

            let start = -Math.PI * 0.75;
            let end = Math.PI * 0.22;
            if (comboIndex === 1) {
                start = -Math.PI * 0.5; end = Math.PI * 0.5;
            } else if (comboIndex === 2) {
                start = Math.PI * 0.28; end = -Math.PI * 0.55;
            } else if (comboIndex === 3) {
                start = 0; end = Math.PI * 2;
            }
            const currentAngle = start + (end - start) * (1 - attackProgress);

            // Xは後方攻撃。剣筋の中心に寄せて手元の違和感をなくす
            armEndX = centerX - dir * 2;
            armEndY = pivotY + 10;
            ctx.beginPath();
            ctx.moveTo(centerX, pivotY);
            ctx.lineTo(armEndX, armEndY);
            ctx.stroke();

            // 手
            ctx.fillStyle = COLORS.PLAYER_GI;
            ctx.beginPath();
            ctx.arc(armEndX, armEndY, 5, 0, Math.PI * 2);
            ctx.fill();

            // 手前手の刀も同じ刀身定義で描画
            // X攻撃は後方扱いなので、剣筋側(isBackwards)と同じ反転方向で描画
            drawShortKatanaLocal(armEndX, armEndY, currentAngle, -dir);
        } else if (this.subWeaponAction === '二刀_合体') {
            // 目の前でクロスした状態から、そのまま振り下ろす
            const handRadius = 5;
            const clamped = Math.min(1, Math.max(0, progress));
            const isCrossPhase = clamped < 0.28;
            const t = isCrossPhase ? (clamped / 0.28) : ((clamped - 0.28) / 0.72);

            // 右向き進行で「少しこちら向き」に見せるため、両手を前側へ寄せる
            let rightX, leftX, rightY, leftY, crossX, crossY;
            if (isCrossPhase) {
                const gather = t;
                rightX = centerX + dir * (4 + gather * 3);
                leftX = centerX - dir * (2 - gather * 2);
                rightY = pivotY + 8;
                leftY = pivotY + 11;
                // 出だしは中央寄りで確実に刀身を交差させる
                crossX = centerX + dir * (2 + gather * 2);
                crossY = pivotY - 16 + gather * 2;
            } else {
                const sweep = t;
                const fastSweep = Math.min(1, sweep * 1.45); // 振り下ろしを速く
                const spreadOut = Math.pow(Math.sin(sweep * Math.PI * 0.5), 0.85);
                // クロス後に左右へ開きながら振り下ろす
                rightX = centerX + dir * (2 + spreadOut * 18);
                leftX = centerX - dir * (2 + spreadOut * 16);
                rightY = pivotY + 9 + fastSweep * 7;
                leftY = pivotY + 11 + fastSweep * 7;
                // 振り下ろし: 交差点が斜め前下へ移動
                crossX = centerX + dir * (14 + sweep * 5);
                crossY = pivotY - 10 + fastSweep * 62;
            }

            // 右腕
            ctx.beginPath();
            ctx.moveTo(centerX + dir * 4, pivotY - 2);
            ctx.lineTo(rightX, rightY);
            ctx.stroke();
            // 左腕
            ctx.beginPath();
            ctx.moveTo(centerX - dir * 4, pivotY - 1);
            ctx.lineTo(leftX, leftY);
            ctx.stroke();

            // 手（終端）
            ctx.fillStyle = COLORS.PLAYER_GI;
            ctx.beginPath();
            ctx.arc(rightX, rightY, handRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(leftX, leftY, handRadius, 0, Math.PI * 2);
            ctx.fill();

            // 両手の短刀モデル（手先に装備）
            const drawHandBlade = (x, y, angle) => {
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(dir, 1);
                ctx.rotate(angle);
                ctx.fillStyle = '#111';
                ctx.fillRect(-1, -2.1, 2.8, 4.2); // 鍔
                ctx.fillStyle = '#c9a545';
                ctx.fillRect(1.2, -1.8, 1.2, 3.6); // はばき
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                // 日本刀: 上側直線、下側が反る
                ctx.moveTo(1, -1.15);
                ctx.lineTo(31, -1.15);
                ctx.lineTo(33.2, 0);
                ctx.quadraticCurveTo(26.5, 1.55, 1, 1.05);
                ctx.fill();
                ctx.fillStyle = '#bbb';
                ctx.beginPath();
                ctx.moveTo(2, -0.45);
                ctx.lineTo(24.5, -0.45);
                ctx.quadraticCurveTo(20, 0.05, 2, 0.25);
                ctx.fill();
                ctx.restore();
            };

            // 常に同じ交差点へ向けることで、手だけでなく刀身もクロスさせる
            let rightAngle = Math.atan2(crossY - rightY, (crossX - rightX) * dir);
            const leftAngle = Math.atan2(crossY - leftY, (crossX - leftX) * dir) - 0.08;
            // 振り下ろし時は手前側の剣を左下へ抜く
            if (!isCrossPhase) {
                rightAngle -= 0.95 * t;
            }

            // 奥(左手) -> 手前(右手)の順で描き、こちら向きの奥行きを作る
            drawHandBlade(leftX, leftY, leftAngle);
            drawHandBlade(rightX, rightY, rightAngle);
        } else if (this.subWeaponAction === '大太刀') {
            // 大上段
            armAngle = -Math.PI * 0.6 + progress * Math.PI * 0.8;
            armEndX = centerX + Math.cos(armAngle) * 20;
            armEndY = pivotY + Math.sin(armAngle) * 20;
            ctx.beginPath();
            ctx.moveTo(centerX, pivotY);
            ctx.lineTo(armEndX, armEndY);
            ctx.stroke();
        } else {
            // その他（デフォルト突き）
            armEndX = centerX + dir * 20;
            armEndY = pivotY + 5;
            ctx.beginPath();
            ctx.moveTo(centerX, pivotY);
            ctx.lineTo(armEndX, armEndY);
            ctx.stroke();
        }
        
        ctx.restore();
    }

    renderAttackArmAndWeapon(ctx, centerX, pivotY, facingRight) {
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

        // 腕（本体から手まで）を描画し、付け根を固定
        ctx.strokeStyle = COLORS.PLAYER;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(centerX, pivotY); 
        ctx.lineTo(armEndX, armEndY);
        ctx.stroke();

        // 手を上書きで描画
        ctx.fillStyle = COLORS.PLAYER_GI;
        ctx.beginPath();
        ctx.arc(armEndX, armEndY, 6, 0, Math.PI * 2);
        ctx.fill();

        // 剣を描画（デフォルメ→日本刀）
        const swordLen = 60; // 見た目の刀身長は常に統一（当たり判定rangeとは分離）
        
        ctx.save();
        ctx.translate(armEndX, armEndY);
        ctx.scale(facingRight ? 1 : -1, 1); // 左右反転
        
        // 回転斬りの場合、剣も回転させる
        // scale(-1, 1) があるため、回転方向も適切に反転される
        const rot = (attack.type === ANIM_STATE.ATTACK_SPIN) ? swordAngle : swordAngle;
        ctx.rotate(rot);
        
        // 鍔（つば）
        ctx.fillStyle = '#111';
        ctx.fillRect(-1, -3, 2, 6);

        // 刀身（白く光る・上はまっすぐ）
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        
        // 上側（刃：まっすぐ）
        ctx.moveTo(0, -2); 
        ctx.lineTo(swordLen, -2);
        
        // 下側（峰）
        ctx.quadraticCurveTo(swordLen * 0.5, 3, 0, 0);
        
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
                const angle = (i / 12) * Math.PI * 2 + Date.now() * 0.01;
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
                    const angle = (Date.now() * 0.01 + i * Math.PI * 0.25) % (Math.PI * 2);
                    const dist = 50 + Math.random() * 100;
                    const wobble = Math.sin(Date.now() * 0.03 + i) * 30;
                    
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
