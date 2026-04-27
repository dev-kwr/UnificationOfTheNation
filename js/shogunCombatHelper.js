
/**
 * 将軍（将軍モデル）の戦闘ロジックとステータス制御
 * プレイヤーが将軍として振る舞うための拡張ロジック
 */

export function applyShogunCombat(player) {
    if (!player) return;

    // 将軍の基本スケール
    const SHOGUN_SCALE = 2.2;
    
    // 元のメソッドを保存
    const originalAttack = player.attack;
    const originalUpdate = player.update;
    const originalGetHitbox = player.getHitbox;

    // 攻撃ロジックのオーバーライド
    player.attack = function(options = {}) {
        if (this.characterType !== 'shogun') {
            return originalAttack.apply(this, [options]);
        }
        
        // 将軍専用5段コンボ
        if (this.attackCooldown > 0 && !options.fromBuffer) return;
        
        this.isAttacking = true;
        this.attackBuffered = false;
        this.attackBufferTimer = 0;

        // コンボ段数の進展
        if (!this.currentAttack) {
            this.attackCombo = 1;
        } else {
            this.attackCombo = (this.attackCombo % 5) + 1;
        }

        // 各段の性能設定
        const comboDurations = [0, 420, 420, 480, 750, 950];
        const duration = comboDurations[this.attackCombo] || 400;
        
        this.attackTimer = duration;
        this.currentAttack = {
            comboStep: this.attackCombo,
            durationMs: duration,
            damage: 2 + this.attackCombo,
            range: 120 * SHOGUN_SCALE,
        };

        // 特殊移動（4段目ジャンプ、5段目叩きつけ）
        const dir = this.facingRight ? 1 : -1;
        if (this.attackCombo === 4) {
            this.vy = -18;
            this.isGrounded = false;
            this.vx = dir * 10;
        } else if (this.attackCombo === 5) {
            this.vy = 25;
            this.isGrounded = false;
        } else {
            this.vx = dir * 5;
        }

        if (typeof this.refreshSubWeaponScaling === 'function') this.refreshSubWeaponScaling();
    };

    // ヒットボックスのスケール対応
    player.getHitbox = function() {
        if (this.characterType !== 'shogun') return originalGetHitbox.apply(this);
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    };

    // 将軍専用の描画用プロパティ
    player.shogunYawSkew = 0;
    
    // updateの拡張（将軍特有の慣性や挙動）
    player.update = function(dt, stage) {
        // キャラクタータイプに応じたサイズとスケールの同期
        if (this.characterType === 'shogun') {
            this.scaleMultiplier = SHOGUN_SCALE;
            // 物理サイズをボス同様に拡大
            this.width = Math.round(48 * SHOGUN_SCALE);
            this.height = Math.round(72 * SHOGUN_SCALE);
            this.speed = 3.8; 
            
            const dir2d = this.facingRight ? 1 : -1;
            const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
            const attackBias = this.isAttacking ? 0.013 : 0;
            this.shogunYawSkew = dir2d * (0.046 + moveBias + attackBias);
        } else {
            this.scaleMultiplier = 1.0;
            this.width = 48;
            this.height = 72;
            this.speed = 6;
        }
        
        originalUpdate.apply(this, [dt, stage]);
    };
}
