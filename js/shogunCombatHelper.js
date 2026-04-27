import { createSubWeapon } from './weapon.js';
import { audio } from './audio.js';
import { PLAYER, GRAVITY, LANE_OFFSET } from './constants.js';
import { Shogun } from './boss.js';

/**
 * 将軍（ラスボス）の戦闘ロジックとステータス制御をプレイヤーに適用
 * プレビュー画面と同じ挙動と操作感を実現する
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
        p._shogunBossInstance = new Shogun(p.x, p.y, 'boss', groundY);
        p._shogunBossInstance.init();
        p._shogunBossInstance.hp = 99999;
        p._shogunBossInstance.updateAI = function() { /* AI無効 */ };
        p._shogunBossInstance._subWeaponInstances = p._shogunSubWeaponInstances;

        p._shogunBossInstance.checkPlayerCollision = function(rect, damage, pushback) {
            if (typeof game === 'undefined' || !game.enemies) return;
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
                        enemy.takeDamage(damage, p.facingRight ? 1 : -1);
                    }
                }
            });
        };
    };

    const originalAttack = player.attack;
    const originalUpdate = player.update;
    const originalGetHitbox = player.getHitbox;
    const originalUseSubWeapon = player.useSubWeapon;
    const originalUpdateAttack = player.updateAttack;
    const originalUpdateSubWeaponAttack = player.updateSubWeaponAttack;

    // 攻撃更新のオーバーライド（将軍の時だけスキップ）
    player.updateAttack = function(dt) {
        if (this.characterType === 'shogun') return;
        return originalUpdateAttack.apply(this, arguments);
    };

    player.updateSubWeaponAttack = function(dt) {
        if (this.characterType === 'shogun') return;
        if (originalUpdateSubWeaponAttack) return originalUpdateSubWeaponAttack.apply(this, arguments);
    };

    // 通常攻撃オーバーライド
    player.attack = function(options = {}) {
        if (this.characterType !== 'shogun') return originalAttack.apply(this, arguments);
        
        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return;

        if (boss._subTimer > 0) return;

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
        this.attackTimer = 10; 
    };

    // サブ武器オーバーライド
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
            this.attackTimer = 10;
        }
    };

    // 更新処理
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

        if (boss.isAttacking) {
            this.vx = boss.vx;
            this.vy = boss.vy;
            this.x = boss.x;
            this.y = boss.y + 24;
        }
        
        this.isAttacking = boss.isAttacking;
        this._shogunAttackTimer = boss._attackTimer;
        this._shogunSubTimer = boss._subTimer;
        
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
