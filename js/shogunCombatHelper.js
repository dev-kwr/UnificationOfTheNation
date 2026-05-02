import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { PLAYER, GRAVITY, LANE_OFFSET } from './constants.js';
import { Shogun } from './boss.js';

/**
 * 将軍（ラスボス）の戦闘ロジックとステータス制御をプレイヤーに適用
 */
export function applyShogunCombat(player) {
    if (!player) return;

    const SHOGUN_SCALE = 2.2;
    const SHOGUN_SPEED = 3.8;

    player._shogunInited = false;
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
        
        p.width = Math.round(40 * SHOGUN_SCALE);
        p.height = Math.round(60 * SHOGUN_SCALE);
        p.speed = SHOGUN_SPEED;
        p._shogunInited = true;

        const groundY = p.groundY || 480;
        p._shogunBossInstance = new Shogun(p.x, p.y, 'player', groundY); // typeをplayerにする
        p._shogunBossInstance.init();
        p._shogunBossInstance.hp = 99999;
        p._shogunBossInstance.updateAI = function() { /* AI無効 */ };
        p._shogunBossInstance._subWeaponInstances = p._shogunSubWeaponInstances;

        // 当たり判定を敵に向ける
        p._shogunBossInstance.checkPlayerCollision = function(rect, damage, pushback) {
            if (typeof game === 'undefined' || !game.enemies) return;
            const dir = p.facingRight ? 1 : -1;
            game.enemies.forEach(enemy => {
                if (enemy.isDead) return;
                const enemyHitbox = enemy.getHitbox ? enemy.getHitbox() : {
                    x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height
                };
                if (rect.x < enemyHitbox.x + enemyHitbox.width &&
                    rect.x + rect.width > enemyHitbox.x &&
                    rect.y < enemyHitbox.y + enemyHitbox.height &&
                    rect.y + rect.height > enemyHitbox.y) {
                    if (typeof enemy.takeDamage === 'function') {
                        enemy.takeDamage(damage, dir);
                        if (pushback && enemy.vx !== undefined) {
                            enemy.vx += dir * pushback;
                        }
                    }
                }
            });
        };

        // サブ武器の当たり判定の修正
        const origFireSubWeapon = p._shogunBossInstance._fireSubWeapon;
        p._shogunBossInstance._fireSubWeapon = function(type) {
            const bombsBefore = (window.game && window.game.bombs) ? window.game.bombs.length : 0;
            origFireSubWeapon.apply(this, arguments);
            if (type === 'bomb' && window.game && window.game.bombs) {
                for (let bi = bombsBefore; bi < window.game.bombs.length; bi++) {
                    const b = window.game.bombs[bi];
                    if (b) b.isEnemyProjectile = false; // プレイヤーの攻撃として扱う
                }
            }
        };

        const shurikenInst = p._shogunSubWeaponInstances['shuriken'];
        if (shurikenInst) {
            const origShurikenUpdate = shurikenInst.update;
            shurikenInst.update = function(dt, enemiesArg) {
                const gameEnemies = window.game ? window.game.enemies : [];
                return origShurikenUpdate.call(this, dt, gameEnemies);
            };
        }

        // game.jsでのサブ武器当たり判定用に currentSubWeapon を一時的に乗っ取る
        let realSub = p.currentSubWeapon;
        Object.defineProperty(p, 'currentSubWeapon', {
            get: function() {
                if (this.characterType === 'shogun' && this._shogunBossInstance && this._shogunBossInstance._subWeaponKey) {
                    const key = this._shogunBossInstance._subWeaponKey;
                    const inst = this._shogunBossInstance._subWeaponInstances[key];
                    // 追尾中の手裏剣は別処理、火薬玉は別処理なので、
                    // getHitboxを持つ直接攻撃系武器（大槍、大太刀、鎖鎌、二刀流）を優先して返す
                    if (inst && typeof inst.getHitbox === 'function') {
                        return inst;
                    }
                }
                return realSub;
            },
            set: function(val) {
                realSub = val;
            }
        });
    };

    const originalAttack = player.attack;
    const originalUpdate = player.update;
    const originalGetHitbox = player.getHitbox;
    const originalUseSubWeapon = player.useSubWeapon;
    const originalUpdateAttack = player.updateAttack;
    const originalUpdateSubWeaponAttack = player.updateSubWeaponAttack;

    player.updateAttack = function(dt) {
        if (this.characterType === 'shogun') return;
        return originalUpdateAttack.apply(this, arguments);
    };

    player.updateSubWeaponAttack = function(dt) {
        if (this.characterType === 'shogun') return;
        if (originalUpdateSubWeaponAttack) return originalUpdateSubWeaponAttack.apply(this, arguments);
    };

    player.attack = function(options = {}) {
        if (this.characterType !== 'shogun') return originalAttack.apply(this, arguments);
        
        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return;

        const isDualEquipped = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';

        if (isDualEquipped) {
            const dualInst = boss._subWeaponInstances.dual;
            if (!dualInst) return;

            if (boss._subTimer > 0 && boss._subAction === '二刀_Z') {
                const currentStep = (dualInst.comboIndex || 0) + 1;
                const nextStep = Math.min(5, currentStep + 1);
                if (nextStep > currentStep) {
                    boss._dualZPendingSteps = [nextStep];
                }
                return;
            }

            const nextStep = (boss._subAction === '二刀_Z' && dualInst.comboIndex !== undefined && dualInst.comboIndex < 4)
                ? dualInst.comboIndex + 2
                : 1;

            boss._dualZPendingSteps = [nextStep];
            boss._subAction = '二刀_Z';
            boss._subWeaponKey = 'dual';
            boss._shurikenVisualTimer = 0;
            if (typeof boss._fireDualZNextStep === 'function') {
                boss._fireDualZNextStep();
            }
            this.isAttacking = true;
            this.attackTimer = 50;
        } else {
            if (boss._attackTimer > 0) {
                const currentStep = boss._currentComboStep || 0;
                const nextStep = Math.min(5, currentStep + 1);
                if (nextStep > currentStep) {
                    boss._comboPendingSteps = [nextStep];
                }
                return;
            }

            const nextStep = (boss._currentComboStep && boss._currentComboStep < 5) 
                ? (boss._currentComboStep % 5) + 1 
                : 1;
            
            boss._comboPendingSteps = [nextStep];
            if (typeof boss._startNextComboStep === 'function') {
                boss._startNextComboStep();
            }
            this.isAttacking = true;
            this.attackTimer = 50; // 少しだけ猶予を持たせる
        }
    };

    const originalBufferNextAttack = player.bufferNextAttack;
    player.bufferNextAttack = function() {
        if (this.characterType !== 'shogun') return originalBufferNextAttack ? originalBufferNextAttack.apply(this, arguments) : null;
        // 将軍の場合は即座にattack()を呼び出してコンボキューに積む
        this.attack();
    };

    const originalGetAttackHitbox = player.getAttackHitbox;
    player.getAttackHitbox = function(options) {
        if (this.characterType !== 'shogun') return originalGetAttackHitbox ? originalGetAttackHitbox.apply(this, arguments) : null;
        const boss = this._shogunBossInstance;
        if (!boss) return null;
        
        // 通常攻撃の当たり判定のみを返す
        if (boss._attackTimer > 0) {
            const dir = boss.facingRight ? 1 : -1;
            return [{
                x: boss.x + (dir > 0 ? boss.width * 0.4 : -boss.width * 1.2),
                y: boss.y + boss.height * 0.1,
                width: boss.width * 1.8,
                height: boss.height * 0.8,
            }];
        }
        return null;
    };

    player.useSubWeapon = function() {
        if (this.characterType !== 'shogun') return originalUseSubWeapon.apply(this, arguments);
        
        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return;

        if (boss._attackTimer > 0 || boss._subTimer > 0) return;

        const typeMap = {
            '手裏剣': 'shuriken', '火薬玉': 'bomb', '大槍': 'spear', 
            '二刀流': 'dual', '鎖鎌': 'kusarigama', '大太刀': 'odachi'
        };
        const weaponKey = typeMap[this.currentSubWeapon?.name] || 'shuriken';
        const actionMap = {
            shuriken: 'throw', bomb: 'throw', spear: '大槍',
            dual: '二刀_合体', kusarigama: '鎖鎌', odachi: '大太刀'
        };

        if (typeof boss._fireSubWeapon === 'function') {
            boss.isAttacking = true;
            boss._fireSubWeapon(weaponKey);
            boss._subAction = actionMap[weaponKey] || null;
            
            let duration = 400;
            if (weaponKey === 'shuriken') duration = 1400;
            else if (weaponKey === 'dual') duration = 850;
            else {
                const inst = boss._subWeaponInstances[weaponKey];
                if (inst) duration = (inst.totalDuration || 300) + 40;
            }
            
            boss._subTimer = duration;
            boss._subWeaponKey = weaponKey;
            this.isAttacking = true;
            this.attackTimer = 50;
            // スパム防止のため忍者側のタイマーも同期
            this.subWeaponTimer = duration;
            this.subWeaponAction = boss._subAction;
        }
    };

    player.update = function(dt, stage) {
        if (this.characterType !== 'shogun') return originalUpdate.apply(this, arguments);

        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return originalUpdate.apply(this, arguments);

        originalUpdate.apply(this, arguments);

        boss.x = this.x;
        boss.y = this.y - 24; 
        boss.vx = this.vx;
        boss.vy = this.vy;
        boss.facingRight = this.facingRight;
        boss.isGrounded = this.isGrounded;
        boss.isCrouching = this.isCrouching;
        boss.isDashing = this.isDashing;

        boss.update(dt, stage);

        // 攻撃中またはサブ武器使用中の座標同期
        if (boss.isAttacking || boss._subTimer > 0) {
            this.vx = boss.vx;
            this.vy = boss.vy;
            this.x = boss.x;
            this.y = boss.y + 24;
        }
        
        // bossの状態をplayerに反映（重要：これによってisAttackingなどがロックされる）
        this.isAttacking = (boss._attackTimer > 0 || boss._subTimer > 0);
        this.subWeaponTimer = boss._subTimer;
        this.subWeaponAction = boss._subAction;
        this._shogunAttackTimer = boss._attackTimer;
        this._shogunComboStep = boss._comboStep;
        this._shogunCurrentComboStep = boss._currentComboStep;
        this._shogunSubTimer = boss._subTimer;
        this._shogunSubAction = boss._subAction;
        this._shogunSubWeaponKey = boss._subWeaponKey;
        
        const dir2d = this.facingRight ? 1 : -1;
        const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
        const attackBias = this.isAttacking ? 0.013 : 0;
        this.shogunYawSkew = dir2d * (0.046 + moveBias + attackBias);

        if (this._shogunSubWeaponInstances) {
            for (const inst of Object.values(this._shogunSubWeaponInstances)) {
                if (inst && (inst.isAttacking || (inst.projectiles && inst.projectiles.length > 0))) {
                    inst.update(dt);
                }
            }
        }
    };

    player.getHitbox = function() {
        if (this.characterType !== 'shogun') return originalGetHitbox.apply(this, arguments);
        return {
            x: this.x, y: this.y, width: this.width, height: this.height
        };
    };
}
