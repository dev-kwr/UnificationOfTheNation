
import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { PLAYER, GRAVITY } from './constants.js';
import { Shogun } from './boss.js';

/**
 * 将軍（ラスボス）の戦闘ロジックとステータス制御をプレイヤーに適用
 * プレビュー画面と同じ挙動と操作感を実現する
 */
export function applyShogunCombat(player) {
    if (!player) return;

    // 将軍の定数（boss.jsと同期）
    const SHOGUN_SCALE = 2.2;
    const SHOGUN_SPEED = 3.8;

    // 内部状態の初期化
    player._shogunInited = false;
    player._shogunAttackTimer = 0;
    player._shogunComboStep = 0;
    player._shogunCurrentComboStep = 0;
    player._shogunComboPendingSteps = [];
    player._shogunSubTimer = 0;
    player._shogunSubAction = null;
    player._shogunSubWeaponKey = 'shuriken'; // デフォルト
    player._shogunShurikenVisualTimer = 0;
    player._shogunComboFinisherAirLockTimer = 0;
    player._shogunSubWeaponInstances = null;

    const initShogunInstances = (p) => {
        if (p._shogunInited) return;
        p._shogunSubWeaponInstances = {
            shuriken:   createSubWeapon('手裏剣'),
            bomb:       createSubWeapon('火薬玉'),
            spear:      createSubWeapon('大槍'),
            dual:       createSubWeapon('二刀流'),
            kusarigama: createSubWeapon('鎖鎌'),
            odachi:     createSubWeapon('大太刀'),
        };
        p._shogunSubWeaponInstances.odachi.isShogunOdachi = true;
        
        // 物理サイズを初期化（ボス本体サイズ 40x60 をベースに 2.2倍）
        p.width = Math.round(40 * SHOGUN_SCALE);
        p.height = Math.round(60 * SHOGUN_SCALE);
        p.speed = SHOGUN_SPEED;

        // スケール適用
        for (const inst of Object.values(p._shogunSubWeaponInstances)) {
            if (!inst) continue;
            if (inst.range) inst.range *= SHOGUN_SCALE;
            if (inst.baseRange) inst.baseRange *= SHOGUN_SCALE;
            if (inst.projectileRadius) inst.projectileRadius *= SHOGUN_SCALE;
        }
        p._shogunInited = true;

        // 描画用の Shogun ボスインスタンスを生成（shogun_preview.html と同一原理）
        const groundY = p.groundY || 480;
        p._shogunBossInstance = new Shogun(p.x, p.y, 'boss', groundY);
        p._shogunBossInstance.init();
        p._shogunBossInstance.hp = 99999;
        // サブ武器インスタンスを共有
        p._shogunBossInstance._subWeaponInstances = p._shogunSubWeaponInstances;
    };

    const originalAttack = player.attack;
    const originalUpdate = player.update;
    const originalGetHitbox = player.getHitbox;
    const originalUseSubWeapon = player.useSubWeapon;
    const originalUpdateAttack = player.updateAttack;
    const originalUpdateSubWeaponAttack = player.updateSubWeaponAttack;

    // 攻撃更新の完全差し替え
    player.updateAttack = function(dt) {
        if (this.characterType === 'shogun') {
            // 将軍モード時は独自ロジック(update内)で処理するためここでは何もしない
            return;
        }
        return originalUpdateAttack.apply(this, [dt]);
    };

    player.updateSubWeaponAttack = function(dt) {
        if (this.characterType === 'shogun') {
            return;
        }
        if (originalUpdateSubWeaponAttack) {
            return originalUpdateSubWeaponAttack.apply(this, [dt]);
        }
    };

    // コンボ開始ロジック（boss.js: _startNextComboStep相当）
    player._shogunStartNextComboStep = function() {
        const step = this._shogunComboPendingSteps.shift();
        if (step == null) {
            this._shogunAttackTimer = 0;
            this.isAttacking = false;
            this._shogunComboStep = 0;
            this._shogunCurrentComboStep = 0;
            this._shogunComboFinisherAirLockTimer = 0;
            this.attackCooldown = 20; // プレイヤーの連打受付用に短く設定
            return;
        }

        const profile = this.getComboAttackProfileByStep(step);
        const dur = Math.max(1, (profile.durationMs || 200) * 1.1); // 少しだけ重厚感を出す
        this._shogunCurrentComboStep = step;
        this._shogunComboStep = step;
        this.attackCombo = step;
        this._shogunAttackTimer = dur;
        this.attackTimer = dur;
        this.isAttacking = true;
        
        this.currentAttack = { ...profile, comboStep: step, durationMs: dur };

        if (step === 5) {
            this._shogunComboFinisherAirLockTimer = 2200;
        }

        // 物理挙動の再現 (boss.js: 1696行目付近)
        const dir = this.facingRight ? 1 : -1;
        const impulse = (profile.impulse || 1) * SHOGUN_SPEED;
        
        if (step === 1) {
            this.vx *= 0.12;
            if (this.isGrounded) this.vy = 0;
            else this.vy = Math.max(this.vy, -0.8);
        } else if (step === 2) {
            this.vx = this.vx * 0.16 + dir * impulse * 0.9;
            if (this.isGrounded) this.vy = 0;
            else this.vy = Math.min(this.vy, -1.2);
        } else if (step === 3) {
            this.vx = this.vx * 0.12 + dir * impulse * 1.71;
            this.vy = Math.min(this.vy, -8.2);
            this.isGrounded = false;
        } else if (step === 4) {
            this.vx = this.vx * 0.24 + dir * impulse * 0.42;
            this.vy = Math.min(this.vy, -10.6);
            this.isGrounded = false;
        } else if (step === 5) {
            this.vx = this.vx * 0.18;
            this.vy = Math.max(this.vy, 3.4);
            this.isGrounded = false;
        }
        audio.playSlash(Math.min(4, step));
    };

    // 通常攻撃オーバーライド
    player.attack = function(options = {}) {
        if (this.characterType !== 'shogun') return originalAttack.apply(this, [options]);
        
        initShogunInstances(this);
        if (this._shogunSubTimer > 0) return;

        // コンボ入力の受付
        if (this.isAttacking && this._shogunAttackTimer > 0) {
            const nextStep = Math.min(5, this._shogunCurrentComboStep + 1);
            if (nextStep > this._shogunCurrentComboStep && !this._shogunComboPendingSteps.includes(nextStep)) {
                this._shogunComboPendingSteps = [nextStep];
            }
            return;
        }

        // コンボ開始（またはリセット）
        const nextStep = (this.attackCombo && this.attackCombo < 5) ? (this.attackCombo + 1) : 1;
        this._shogunComboPendingSteps = [nextStep];
        this._shogunStartNextComboStep();
    };

    // サブ武器オーバーライド
    player.useSubWeapon = function() {
        if (this.characterType !== 'shogun') return originalUseSubWeapon.apply(this);
        
        initShogunInstances(this);
        if (this.isAttacking || this._shogunSubTimer > 0) return;

        const typeMap = {
            '手裏剣': 'shuriken', '火薬玉': 'bomb', '大槍': 'spear', 
            '二刀流': 'dual', '鎖鎌': 'kusarigama', '大太刀': 'odachi'
        };
        const weaponKey = typeMap[this.currentSubWeapon?.name] || 'shuriken';
        this._shogunSubWeaponKey = weaponKey;

        const subInst = this._shogunSubWeaponInstances[weaponKey];
        if (!subInst) return;

        this.currentSubWeapon = subInst; // レンダラーが参照できるように同期
        this.isAttacking = true;
        subInst.use(this, weaponKey === 'dual' ? 'combined' : undefined);
        
        const actionMap = { shuriken:'throw', bomb:'throw', spear:'大槍', dual:'二刀_合体', kusarigama:'鎖鎌', odachi:'大太刀' };
        this._shogunSubAction = actionMap[weaponKey];
        
        // 持続時間の設定
        let duration = 400;
        if (weaponKey === 'shuriken') duration = 1400;
        else if (weaponKey === 'dual') duration = 850;
        else if (subInst.totalDuration) duration = subInst.totalDuration + 100;
        
        this._shogunSubTimer = duration;
        this.subWeaponTimer = duration;
        this._shogunShurikenVisualTimer = (weaponKey === 'shuriken') ? 150 : 0;
    };

    // 更新処理のオーバーライド
    player.update = function(dt, stage) {
        if (this.characterType !== 'shogun') return originalUpdate.apply(this, [dt, stage]);

        const deltaMs = dt * 1000;
        
        // 将軍のステータス同期
        initShogunInstances(this);
        this.scaleMultiplier = SHOGUN_SCALE;
        this.width = Math.round(40 * SHOGUN_SCALE);
        this.height = Math.round(60 * SHOGUN_SCALE);
        this.speed = SHOGUN_SPEED;

        // 攻撃更新
        if (this.isAttacking) {
                if (this._shogunAttackTimer > 0) {
                    this.updateShogunAttackMotion(deltaMs);
                    this._shogunAttackTimer -= deltaMs;
                    
                    // レンダラー同期: 標準の attackTimer も減らすことでアニメーションを進行させる
                    this.attackTimer = this._shogunAttackTimer;
                    
                    // コンボ5段目の空中ロック挙動 (boss.js: 1839行目相当)
                if (this._shogunCurrentComboStep === 5 && !this.isGrounded && this._shogunComboFinisherAirLockTimer > 0) {
                    if (this._shogunAttackTimer <= 1) this._shogunAttackTimer = 1;
                }

                if (this._shogunAttackTimer <= 0) {
                    this._shogunStartNextComboStep();
                }
            } else if (this._shogunSubTimer > 0) {
                this.updateShogunSubMotion(deltaMs);
                this._shogunSubTimer -= deltaMs;
                if (this._shogunSubTimer <= 0) {
                    this.isAttacking = false;
                    this._shogunSubAction = null;
                    this.currentSubWeapon = null; // コンボ・サブ武器終了時に解除
                    this.subWeaponTimer = 0;
                    this.attackTimer = 0;
                    // サブ武器のインスタンス側のフラグも落とす
                    if (this._shogunSubWeaponKey) {
                        const inst = this._shogunSubWeaponInstances[this._shogunSubWeaponKey];
                        if (inst) inst.isAttacking = false;
                    }
                }
            }
        }

        if (this._shogunComboFinisherAirLockTimer > 0) {
            this._shogunComboFinisherAirLockTimer -= deltaMs;
        }

        // 攻撃動作中の摩擦・重力制御
        if (this.isAttacking) {
            if (this._shogunCurrentComboStep === 4) {
                // 4段目の上昇中は重力の影響を制御
                this.vy += 0.2; // 弱めの重力
            } else if (this._shogunCurrentComboStep === 5 && !this.isGrounded) {
                // 5段目の滞空・急降下
                if (this._shogunComboFinisherAirLockTimer > 800) {
                    this.vy = 0; // 空中停止
                } else {
                    this.vy += 2.0; // 急降下
                }
            }
        }

        originalUpdate.apply(this, [dt, stage]);
        
        // 描画用のYawSkew更新
        const dir2d = this.facingRight ? 1 : -1;
        const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
        const attackBias = this.isAttacking ? 0.013 : 0;
        this.shogunYawSkew = dir2d * (0.046 + moveBias + attackBias);

        // サブ武器（手裏剣など）の個別更新
        if (this._shogunSubWeaponInstances) {
            for (const inst of Object.values(this._shogunSubWeaponInstances)) {
                if (inst && (inst.isAttacking || (inst.projectiles && inst.projectiles.length > 0))) {
                    inst.update(dt);
                }
            }
        }
    };

    // 攻撃モーション中の物理挙動 (boss.js: updateAttack相当をより忠実に)
    player.updateShogunAttackMotion = function(deltaMs) {
        const step = this._shogunCurrentComboStep;
        const dir = this.facingRight ? 1 : -1;
        const progress = 1 - (this._shogunAttackTimer / (this.currentAttack?.durationMs || 1));

        if (step === 1) {
            this.vx *= 0.62;
        } else if (step === 2 || step === 3) {
            this.vx *= 0.92;
        } else if (step === 4) {
            const z4HeightScale = 0.96;
            if (progress < 0.42) {
                const t = progress / 0.42;
                this.vx = this.vx * 0.52 + dir * SHOGUN_SPEED * (0.2 - t * 0.08);
                this.vy = (-20.4 + t * 2.6) * z4HeightScale;
            } else if (progress < 0.9) {
                const t = (progress - 0.42) / 0.48;
                const backSpeed = SHOGUN_SPEED * (0.66 + t * 0.94);
                this.vx = this.vx * 0.4 + (-dir * backSpeed) * 0.6;
                this.vy = Math.max(-1.0, Math.min(0.95, this.vy));
            }
            this.isGrounded = false;
        } else if (step === 5) {
            if (progress < 0.26) {
                this.vx *= 0.82;
            } else if (progress < 0.76) {
                const fallT = (progress - 0.26) / 0.5;
                this.vx = this.vx * 0.7 + dir * SHOGUN_SPEED * 0.08;
                this.vy = this.vy * 0.34 + (9.8 + fallT * 19.8) * 0.66;
            } else {
                this.vx *= 0.64;
            }
        }
    };

    player.updateShogunSubMotion = function(deltaMs) {
        // 必要に応じてサブ武器使用中の慣性制御を追加
        this.vx *= 0.92;
    };

    player.getHitbox = function() {
        if (this.characterType !== 'shogun') return originalGetHitbox.apply(this);
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    };
}
