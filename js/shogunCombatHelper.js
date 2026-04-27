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
        // プレイヤー操作時はAIを無効化する
        p._shogunBossInstance.updateAI = function() { /* AI無効 */ };
        p._shogunBossInstance.facingRight = p.facingRight;
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

    // 通常攻撃オーバーライド
    player.attack = function(options = {}) {
        if (this.characterType !== 'shogun') return originalAttack.apply(this, [options]);
        
        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return;

        if (typeof boss.startAttack === 'function') {
            boss.attackCooldown = 0; // クールダウンを無視して連打可能にする
            boss.startAttack();
            this.isAttacking = boss.isAttacking;
        }
    };

    // サブ武器オーバーライド
    player.useSubWeapon = function() {
        if (this.characterType !== 'shogun') return originalUseSubWeapon.apply(this);
        
        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return;

        const typeMap = {
            '手裏剣': 'shuriken', '火薬玉': 'bomb', '大槍': 'spear', 
            '二刀流': 'dual', '鎖鎌': 'kusarigama', '大太刀': 'odachi'
        };
        const weaponKey = typeMap[this.currentSubWeapon?.name] || 'shuriken';
        
        if (typeof boss._fireSubWeapon === 'function') {
            boss.attackCooldown = 0;
            boss._fireSubWeapon(weaponKey);
            this.isAttacking = boss.isAttacking;
        }
    };

    // 更新処理のオーバーライド
    player.update = function(dt, stage) {
        if (this.characterType !== 'shogun') return originalUpdate.apply(this, [dt, stage]);

        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return originalUpdate.apply(this, [dt, stage]);

        // 1. まず通常のプレイヤー物理（入力による移動・重力）を計算
        originalUpdate.apply(this, [dt, stage]);

        // 2. プレイヤーの計算後の座標・速度をボスに流し込む
        boss.x = this.x;
        boss.y = this.y - 24; 
        boss.vx = this.vx;
        boss.vy = this.vy;
        boss.facingRight = this.facingRight;
        boss.isGrounded = this.isGrounded;
        boss.isCrouching = this.isCrouching;
        boss.isDashing = this.isDashing;

        // 3. ボス側のロジック（攻撃アニメーション、トレイル更新）を実行
        boss.update(dt, stage);

        // 4. ボスの状態をプレイヤーに同期 (常時)
        this.isAttacking = boss.isAttacking;

        // 5. 攻撃中のみ、ボスの計算した速度や座標をプレイヤーに書き戻す
        if (this.isAttacking) {
            this.vx = boss.vx;
            this.vy = boss.vy;
            this.x = boss.x;
            this.y = boss.y + 24; 
            
            // 状態の同期
            this._shogunAttackTimer = boss._attackTimer;
            this._shogunSubTimer = boss._subTimer;
            this.attackTimer = boss._attackTimer;
        }

        this._shogunComboStep = boss._comboStep;
        this._shogunCurrentComboStep = boss._currentComboStep;
        this._shogunSubAction = boss._subAction;
        this._shogunSubWeaponKey = boss._subWeaponKey;
        this.attackCombo = boss._comboStep;
        
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
