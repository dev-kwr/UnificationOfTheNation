import { audio } from './audio.js';
import { PLAYER, GRAVITY, LANE_OFFSET, CANVAS_WIDTH } from './constants.js';
import { input } from './input.js';
import { Shogun } from './boss.js';

/**
 * 将軍（ラスボス）の戦闘ロジックとステータス制御をプレイヤーに適用
 * 
 * 設計原則:
 *   - player.js / boss.js への変更は一切行わない
 *   - 将軍モード時のみ有効化し、忍者プレイヤー・ステージボスへの影響ゼロ
 *   - shogun_preview.html と同一の操作感を再現
 * 
 * 根本方針:
 *   忍者の update() は内部で handleInput() を呼ぶため、将軍モードでは
 *   handleInput 自体をオーバーライドして忍者固有の X/Z キー処理と
 *   subWeaponTimer 管理を完全にバイパスする。
 *   戦闘状態は全て boss インスタンスが管理し、player 側のプロパティは
 *   毎フレーム boss から同期する。
 */
export function applyShogunCombat(player) {
    if (!player) return;

    const SHOGUN_SCALE = 2.2;
    const SHOGUN_SPEED = 3.8;

    player._shogunInited = false;
    player._shogunSubWeaponInstances = null;

    const clampShogunTier = (value) => Math.max(0, Math.min(3, Math.floor(Number(value) || 0)));
    const getShogunSubWeaponTier = (p) => {
        if (p && typeof p.getSubWeaponEnhanceTier === 'function') {
            return clampShogunTier(p.getSubWeaponEnhanceTier());
        }
        return clampShogunTier(p?.progression?.subWeapon);
    };
    const getShogunNormalComboTier = (p) => clampShogunTier(p?.progression?.normalCombo);
    const getShogunNormalComboMax = (p) => {
        if (p && typeof p.getNormalComboMax === 'function') {
            return Math.max(2, Math.min(5, Math.floor(p.getNormalComboMax())));
        }
        return Math.max(2, Math.min(5, 2 + getShogunNormalComboTier(p)));
    };
    const syncShogunProgression = (p, boss) => {
        if (!p || !boss) return;
        const subTier = getShogunSubWeaponTier(p);
        const normalTier = getShogunNormalComboTier(p);
        boss.progression = { ...(boss.progression || {}), subWeapon: subTier, normalCombo: normalTier };
        boss.getSubWeaponEnhanceTier = () => subTier;
        if (boss.actor) {
            boss.actor.progression = {
                ...(boss.actor.progression || {}),
                subWeapon: subTier,
                normalCombo: normalTier,
                specialClone: clampShogunTier(p?.progression?.specialClone),
            };
        }
        if (boss._subWeaponInstances && boss._shogunSyncedSubWeaponTier !== subTier) {
            for (const inst of Object.values(boss._subWeaponInstances)) {
                if (!inst) continue;
                if (typeof inst.applyEnhanceTier === 'function') {
                    inst.applyEnhanceTier(subTier, boss);
                } else if (Object.prototype.hasOwnProperty.call(inst, 'enhanceTier')) {
                    inst.enhanceTier = subTier;
                }
            }
            boss._shogunSyncedSubWeaponTier = subTier;
        }
    };
    const getShogunSolidColliders = (p, boss, walls) => {
        const colliders = Array.isArray(walls) ? walls : [];
        const comboStep = boss && boss._currentAttackProfile ? (boss._currentAttackProfile.comboStep || 0) : 0;
        return colliders.filter((wall) => {
            if (!wall || wall.isDestroyed) return false;
            if (
                typeof wall.x !== 'number' ||
                typeof wall.y !== 'number' ||
                typeof wall.width !== 'number' ||
                typeof wall.height !== 'number'
            ) {
                return false;
            }
            if (typeof wall.type !== 'string') return true;
            if (wall.type === 'rock') return comboStep !== 4;
            if (wall.type === 'spike') return !!(p && typeof p.isGhostVeilActive === 'function' && p.isGhostVeilActive());
            return false;
        });
    };
    const clampShogunToCameraBounds = (p, boss) => {
        const g = typeof window !== 'undefined' ? window.game : null;
        const scrollX = Number.isFinite(g?.scrollX) ? g.scrollX : 0;
        const currentStageNumber = Number.isFinite(g?.currentStageNumber) ? g.currentStageNumber : 0;
        const minX = currentStageNumber === 5 ? -boss.width : scrollX;
        const maxX = scrollX + CANVAS_WIDTH - boss.width;
        if (boss.x < minX) {
            boss.x = minX;
            if (boss.vx < 0) boss.vx = 0;
        }
        if (boss.x > maxX) {
            boss.x = maxX;
            if (boss.vx > 0) boss.vx = 0;
        }
        p.x = boss.x;
        p.vx = boss.vx;
    };

    // ================================================================
    // 初期化: ボスインスタンスとサブ武器の生成
    // ================================================================
    const initShogunInstances = (p) => {
        if (p._shogunInited) return;

        p.width = Math.round(40 * SHOGUN_SCALE);
        p.height = Math.round(60 * SHOGUN_SCALE);
        p.speed = SHOGUN_SPEED;
        // height 変更に合わせて y を補正（startStage は忍者の高さで設定済み）
        const groundY = p.groundY || 480;
        p.y = groundY + LANE_OFFSET - p.height;
        p.isGrounded = true;
        p._shogunInited = true;

        p._shogunBossInstance = new Shogun(p.x, p.y, 'boss', groundY);
        p._shogunBossInstance.init();
        p._shogunBossInstance.hp = 99999;
        p._shogunBossInstance.updateAI = function() { /* AI無効 */ };
        p._shogunBossInstance.isEnemy = false;

        // Shogun.init() で生成＆スケール済みのインスタンスをそのまま使う
        // （以前は差し替えていたため applyScaleToSubWeapons の効果が消えていた）
        p._shogunSubWeaponInstances = p._shogunBossInstance._subWeaponInstances;
        syncShogunProgression(p, p._shogunBossInstance);

        // ── 当たり判定を敵に向ける ──
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

        // ── 火薬玉をプレイヤーの攻撃として扱う ──
        const origFireSubWeapon = p._shogunBossInstance._fireSubWeapon;
        p._shogunBossInstance._fireSubWeapon = function(type) {
            const bombsBefore = (window.game && window.game.bombs) ? window.game.bombs.length : 0;
            origFireSubWeapon.apply(this, arguments);
            if (type === 'bomb' && window.game && window.game.bombs) {
                for (let bi = bombsBefore; bi < window.game.bombs.length; bi++) {
                    const b = window.game.bombs[bi];
                    if (b) b.isEnemyProjectile = false;
                }
            }
        };

        // ── game.jsの当たり判定ループ用: currentSubWeapon getter ──
        // 攻撃中はボスの武器インスタンスを返す（getHitbox を持つもの）
        // _shogunGetterBypass === 'real' の間は realSub を返す（handleInput内での武器名判定用）
        let realSub = p.currentSubWeapon;
        Object.defineProperty(p, 'currentSubWeapon', {
            get: function() {
                if (this._shogunGetterBypass === 'real') return realSub;
                if (this.characterType === 'shogun' && this._shogunBossInstance && this._shogunBossInstance._subWeaponKey) {
                    const key = this._shogunBossInstance._subWeaponKey;
                    const inst = this._shogunBossInstance._subWeaponInstances[key];
                    if (inst && typeof inst.getHitbox === 'function') {
                        if (!this._shogunSubWeaponCollisionProxy) {
                            this._shogunSubWeaponCollisionProxy = new Proxy({}, {
                                get: (_target, prop) => {
                                    const boss = this._shogunBossInstance;
                                    const activeKey = boss && boss._subWeaponKey;
                                    const activeInst = activeKey && boss._subWeaponInstances
                                        ? boss._subWeaponInstances[activeKey]
                                        : null;
                                    if (prop === 'getHitbox') {
                                        return () => boss && typeof boss.getSubWeaponHitbox === 'function'
                                            ? boss.getSubWeaponHitbox()
                                            : null;
                                    }
                                    if (!activeInst) return undefined;
                                    const value = activeInst[prop];
                                    return typeof value === 'function' ? value.bind(activeInst) : value;
                                },
                                set: (_target, prop, value) => {
                                    const boss = this._shogunBossInstance;
                                    const activeKey = boss && boss._subWeaponKey;
                                    const activeInst = activeKey && boss._subWeaponInstances
                                        ? boss._subWeaponInstances[activeKey]
                                        : null;
                                    if (activeInst) activeInst[prop] = value;
                                    return true;
                                }
                            });
                        }
                        return this._shogunSubWeaponCollisionProxy;
                    }
                }
                return realSub;
            },
            set: function(val) {
                realSub = val;
            }
        });
    };

    // ================================================================
    // 元メソッドの保存
    // ================================================================
    const originalAttack = player.attack;
    const originalUpdate = player.update;
    const originalGetHitbox = player.getHitbox;
    const originalUseSubWeapon = player.useSubWeapon;
    const originalUpdateAttack = player.updateAttack;
    const originalUpdateSubWeaponAttack = player.updateSubWeaponAttack;
    const originalHandleInput = player.handleInput;

    // ================================================================
    // 忍者の攻撃更新を無効化（ボスの updateAttack が代わりに処理する）
    // ================================================================
    player.updateAttack = function(dt) {
        if (this.characterType === 'shogun') return;
        return originalUpdateAttack.apply(this, arguments);
    };

    player.updateSubWeaponAttack = function(dt) {
        if (this.characterType === 'shogun') return;
        if (originalUpdateSubWeaponAttack) return originalUpdateSubWeaponAttack.apply(this, arguments);
    };

    // ================================================================
    // handleInput オーバーライド（将軍専用入力処理）
    // 忍者の handleInput を完全にバイパスし、shogun_preview.html と同一のロジックで処理
    // ================================================================
    player.handleInput = function() {
        if (this.characterType !== 'shogun') return originalHandleInput.apply(this, arguments);

        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return originalHandleInput.apply(this, arguments);
        syncShogunProgression(this, boss);

        // ── 武器切り替え（C キー）──
        if (input.isActionJustPressed('SWITCH_WEAPON')) {
            this.switchSubWeapon();
        }

        // ── しゃがみ（↓キー）──
        const wantsCrouch = this.isGrounded && input.isAction('DOWN');
        if (wantsCrouch) {
            if (!this.isCrouching) {
                this.isCrouching = true;
                // 将軍は高さを変えないのでY補正不要
            }
        } else if (this.isCrouching) {
            this.isCrouching = false;
        }

        // ── 忍具（X キー）──
        if (input.isActionJustPressed('SUB_WEAPON')) {
            this._shogunTriggerSubAction(boss);
        }

        // ── 必殺技 ──
        if (input.isActionJustPressed('SPECIAL')) {
            this.useSpecial();
        }

        // ── 通常攻撃（Z キー）──
        if (input.isActionJustPressed('ATTACK')) {
            this._shogunTriggerAttack(boss);
        }

        // ── 攻撃中は移動制限 ──
        if (boss._attackTimer > 0 || boss._subTimer > 0 || boss.isAttacking) return;

        // ── 移動 ──
        const moveDir = input.isAction('LEFT') ? -1 : (input.isAction('RIGHT') ? 1 : 0);

        // ── ダッシュ ──
        const touchDashHeld = typeof input.isTouchDashActive === 'function' && input.isTouchDashActive();
        const keyboardDashHeld = typeof input.isKeyboardDashHeld === 'function' && input.isKeyboardDashHeld(moveDir);
        const sustainedDashHeld = touchDashHeld || keyboardDashHeld;

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
        } else if (moveDir !== 0) {
            if (this.permanentDash) {
                this.vx = moveDir * (this.speed * this.dashSpeedMultiplier);
                this.isDashing = true;
                this.dashDirection = moveDir >= 0 ? 1 : -1;
                this.dashTimer = Math.max(this.dashTimer, this.dashDuration * 0.5);
            } else {
                this.vx = moveDir * this.speed * (this.isCrouching ? 0.65 : 1.0);
            }
            this.facingRight = moveDir > 0;
        }

        // ── ジャンプ ──
        if (input.isActionJustPressed('JUMP')) {
            this.jump();
        }
    };

    // ================================================================
    // 将軍攻撃トリガー（Z キー）
    // shogun_preview.html の triggerAttack / triggerNormalAttack / triggerDualAttack と同一
    // ================================================================
    player._shogunTriggerAttack = function(boss) {
        // realSub を参照するために getter バイパス
        this._shogunGetterBypass = 'real';
        const isDualEquipped = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';
        this._shogunGetterBypass = false;

        if (isDualEquipped) {
            this._shogunTriggerDualAttack(boss);
        } else {
            this._shogunTriggerNormalAttack(boss);
        }
    };

    // ── 通常Zコンボ（preview: triggerNormalAttack） ──
    player._shogunTriggerNormalAttack = function(boss) {
        if (boss._subTimer > 0) {
            console.log('[将軍DEBUG] triggerNormalAttack blocked by _subTimer:', boss._subTimer);
            return;
        }

        // preview line 279-280: 常に停止
        this.vx = 0;
        boss.vx = 0;

        // 装備中武器キーをセット（renderBody で正しい武器を描画）
        this._shogunGetterBypass = 'real';
        const realWeapon = this.currentSubWeapon;
        this._shogunGetterBypass = false;
        if (realWeapon) {
            const typeMap = {
                '手裏剣': 'shuriken', '火薬玉': 'bomb', '大槍': 'spear',
                '二刀流': 'dual', '鎖鎌': 'kusarigama', '大太刀': 'odachi'
            };
            const wk = typeMap[realWeapon.name];
            if (wk) boss._subWeaponKey = wk;
        }

        if (boss._attackTimer > 0) {
            // コンボ中: 次段をキューに積む（preview line 282-297）
            const currentStep = boss._currentComboStep || 0;
            const queuedStep = Array.isArray(boss._comboPendingSteps) && boss._comboPendingSteps.length > 0
                ? boss._comboPendingSteps[0]
                : 0;
            if (queuedStep > 0) {
                // 既にキューがある — コンボステップとタイマーだけ更新
                this._shogunComboStep = queuedStep;
                this._shogunComboWindowTimer = 460;
                return;
            }
            const currentAttack = boss._currentAttackProfile || null;
            const duration = Math.max(1, currentAttack?.durationMs || boss._attackTimer || 1);
            const remaining = Math.max(0, boss._attackTimer || 0);
            const bufferMs = currentStep === 4
                ? Math.max(420, Math.min(620, duration * 1.25))
                : Math.max(80, Math.min(240, duration * 0.82));
            if (remaining > bufferMs) return;
            const comboMax = getShogunNormalComboMax(this);
            const nextStep = Math.min(comboMax, currentStep + 1);
            if (nextStep <= currentStep) return;
            this._shogunComboStep = nextStep;
            this._shogunComboWindowTimer = 460;
            boss._comboPendingSteps = [nextStep];
            console.log('[将軍DEBUG] combo queued step:', nextStep, 'current:', currentStep);
            return;
        }

        // 新規コンボ開始 — 位置同期
        boss.x = this.x;
        boss.y = this.y;
        boss.isGrounded = this.isGrounded;
        boss.groundY = this.groundY;

        // preview line 299-301: コンボ継続ウィンドウ内なら次段、そうでなければ1段目
        const comboMax = getShogunNormalComboMax(this);
        const nextStep = (this._shogunComboWindowTimer > 0 && this._shogunComboStep > 0)
            ? ((this._shogunComboStep % comboMax) + 1)
            : 1;
        this._shogunComboStep = nextStep;
        this._shogunComboWindowTimer = 460;
        boss._comboPendingSteps = [nextStep];
        boss._startNextComboStep();
        console.log('[将軍DEBUG] combo started step:', nextStep, {
            '_attackTimer': boss._attackTimer,
            '_currentComboStep': boss._currentComboStep,
            'comboWindow': this._shogunComboWindowTimer,
        });
    };

    // ── 二刀流Zコンボ（preview: triggerDualAttack + fireDualSwing） ──
    player._shogunTriggerDualAttack = function(boss) {
        if (boss._attackTimer > 0) return;
        if (boss._subTimer > 0 && boss._subAction && boss._subAction !== '二刀_Z') return;

        const dualInst = boss._subWeaponInstances.dual;
        if (!dualInst) return;

        // preview line 341-343: 停止＋武器キーセット
        this.vx = 0;
        boss.vx = 0;
        boss._subWeaponKey = 'dual'; // BUG 5 FIX

        // 二刀流Z中に追加入力 → キューイング
        if (boss._subTimer > 0 && boss._subAction === '二刀_Z') {
            if (!this._shogunCanTriggerDualFollowUp(boss, dualInst)) {
                this._shogunQueuedDualAttack = true;
                return;
            }
        }

        this._shogunQueuedDualAttack = false;
        this._shogunFireDualSwing(boss, dualInst);
    };

    // ── 二刀流スイング発動（preview: fireDualSwing） ──
    // BUG 3 FIX: preview line 327 は isEnemy を変更せず dual.use(shogun, 'main') を呼ぶ
    player._shogunFireDualSwing = function(boss, dualInst) {
        // 初回のみ位置同期（連撃中は既にボスが自前で動いている）
        if (boss._subTimer <= 0) {
            boss.x = this.x;
            boss.y = this.y;
            boss.isGrounded = this.isGrounded;
            boss.groundY = this.groundY;
        }
        syncShogunProgression(this, boss);
        const tier = getShogunSubWeaponTier(this);
        if (typeof dualInst.applyEnhanceTier === 'function') {
            dualInst.applyEnhanceTier(tier, boss);
        } else if (Object.prototype.hasOwnProperty.call(dualInst, 'enhanceTier')) {
            dualInst.enhanceTier = tier;
        }
        // preview と同一: currentSubWeapon を一時セットし、isEnemy はそのまま
        const prevSubWeapon = boss.currentSubWeapon;
        boss.currentSubWeapon = dualInst;
        dualInst.use(boss, 'main');
        boss.currentSubWeapon = prevSubWeapon;
        const duration = Math.max(112, dualInst.mainDuration || 204);
        boss._subAction = '二刀_Z';
        boss._subWeaponKey = 'dual';
        boss._subTimer = duration;
        boss.attackTimer = duration;
        boss.isAttacking = true;
        boss._dualZPendingSteps = null;
        boss._shurikenVisualTimer = 0;
    };

    // ── 二刀流Z先行入力判定（preview: canTriggerDualFollowUp） ──
    player._shogunCanTriggerDualFollowUp = function(boss, dualInst) {
        if (!dualInst || boss._subAction !== '二刀_Z') return true;
        if (typeof dualInst.getMainSwingPose !== 'function') {
            return boss._subTimer <= 20;
        }
        const pose = dualInst.getMainSwingPose({
            comboIndex: dualInst.comboIndex,
            attackTimer: dualInst.attackTimer
        });
        return (pose.progress || 0) >= 0.9 || boss._subTimer <= 20;
    };

    // ================================================================
    // 将軍忍具トリガー（X キー）
    // shogun_preview.html の triggerSubAction と同一
    // ================================================================
    player._shogunTriggerSubAction = function(boss) {
        // 他のアクション中は発動不可（preview: isBusyWithAnotherAction）
        if (boss._attackTimer > 0 || (boss._subTimer > 0 && boss._subAction !== '二刀_Z')) {
            console.log('[将軍DEBUG] triggerSubAction blocked:', { _attackTimer: boss._attackTimer, _subTimer: boss._subTimer, _subAction: boss._subAction });
            return;
        }

        // realSub を参照
        this._shogunGetterBypass = 'real';
        const realWeapon = this.currentSubWeapon;
        this._shogunGetterBypass = false;
        if (!realWeapon) {
            console.log('[将軍DEBUG] triggerSubAction: no realWeapon');
            return;
        }

        // preview と同様に停止＋位置同期
        this.vx = 0;
        boss.vx = 0;
        boss.x = this.x;
        boss.y = this.y;
        boss.isGrounded = this.isGrounded;
        boss.groundY = this.groundY;

        // BUG 4 FIX: preview line 373 — resetPreviewComboState 相当
        this._shogunQueuedDualAttack = false;
        const dualForReset = boss._subWeaponInstances.dual;
        if (dualForReset) {
            dualForReset.mainComboLinkTimer = 0;
            dualForReset.comboIndex = 0;
        }

        const typeMap = {
            '手裏剣': 'shuriken', '火薬玉': 'bomb', '大槍': 'spear',
            '二刀流': 'dual', '鎖鎌': 'kusarigama', '大太刀': 'odachi'
        };
        const weaponKey = typeMap[realWeapon.name];
        if (!weaponKey) {
            console.log('[将軍DEBUG] triggerSubAction: unknown weapon name:', realWeapon.name);
            return;
        }

        const inst = boss._subWeaponInstances[weaponKey];
        syncShogunProgression(this, boss);
        if (inst && typeof inst.canUse === 'function' && !inst.canUse()) {
            console.log('[将軍DEBUG] triggerSubAction: canUse() returned false for', weaponKey);
            return;
        }

        const actionMap = {
            shuriken: 'throw', bomb: 'throw', spear: '大槍',
            dual: '二刀_合体', kusarigama: '鎖鎌', odachi: '大太刀'
        };

        boss.isAttacking = true;
        boss._fireSubWeapon(weaponKey);
        boss._subAction = actionMap[weaponKey] || null;

        const duration = boss._getSubActionDurationMs
            ? boss._getSubActionDurationMs(actionMap[weaponKey] || realWeapon.name, weaponKey)
            : 300;
        boss._shurikenVisualTimer = weaponKey === 'shuriken' ? 150 : 0;

        boss._subTimer = duration;
        boss._subWeaponKey = weaponKey;

        console.log('[将軍DEBUG] triggerSubAction SUCCESS:', {
            weaponKey,
            duration,
            'inst.isAttacking': inst?.isAttacking,
            'inst.totalDuration': inst?.totalDuration,
            'inst.attackTimer': inst?.attackTimer,
            'boss._subTimer': boss._subTimer,
            'boss._subAction': boss._subAction,
            'boss.isAttacking': boss.isAttacking,
            'boss.vy': boss.vy,
            'boss.isGrounded': boss.isGrounded,
        });
    };

    // ================================================================
    // getAttackHitbox（game.jsの当たり判定ループ用）
    // ================================================================
    const originalGetAttackHitbox = player.getAttackHitbox;
    player.getAttackHitbox = function(options) {
        if (this.characterType !== 'shogun') return originalGetAttackHitbox ? originalGetAttackHitbox.apply(this, arguments) : null;
        const boss = this._shogunBossInstance;
        if (!boss) return null;

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

    // ================================================================
    // attack / bufferNextAttack / useSubWeapon オーバーライド
    // handleInput 以外の経路からも呼ばれる可能性があるため維持
    // ================================================================
    player.attack = function(options = {}) {
        if (this.characterType !== 'shogun') return originalAttack.apply(this, arguments);
        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return;
        this._shogunTriggerAttack(boss);
    };

    const originalBufferNextAttack = player.bufferNextAttack;
    player.bufferNextAttack = function() {
        if (this.characterType !== 'shogun') return originalBufferNextAttack ? originalBufferNextAttack.apply(this, arguments) : null;
        this.attack();
    };

    player.useSubWeapon = function() {
        if (this.characterType !== 'shogun') return originalUseSubWeapon.apply(this, arguments);
        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return;
        this._shogunTriggerSubAction(boss);
    };

    // ================================================================
    // update オーバーライド
    //
    // 設計:
    //   preview は shogun.update(dt, null) の1回だけで全て動く。
    //   我々もそれに倣い、originalUpdate を**呼ばない**。
    //   必要な player.js のタイマー管理だけを cherry-pick する。
    // ================================================================
    player.update = function(dt, walls = [], enemies = []) {
        if (this.characterType !== 'shogun') return originalUpdate.apply(this, arguments);

        initShogunInstances(this);
        const boss = this._shogunBossInstance;
        if (!boss) return originalUpdate.apply(this, arguments);
        syncShogunProgression(this, boss);

        const deltaMs = dt * 1000;

        // ── player.js から最低限必要なタイマー管理を cherry-pick ──
        if (this.invincibleTimer > 0) this.invincibleTimer -= deltaMs;
        if (this.trapDamageCooldown > 0) this.trapDamageCooldown -= deltaMs;
        if (this.damageFlashTimer > 0) this.damageFlashTimer -= deltaMs;
        if (this.dashCooldown > 0) this.dashCooldown -= deltaMs;
        if (this.dashTimer > 0) {
            this.dashTimer -= deltaMs;
            if (this.dashTimer <= 0) { this.dashTimer = 0; this.isDashing = false; }
        }
        this.motionTime = (this.motionTime || 0) + deltaMs;
        // コンボ継続ウィンドウ（preview: previewComboResetTimer）
        if (this._shogunComboWindowTimer > 0) {
            this._shogunComboWindowTimer -= deltaMs;
            if (this._shogunComboWindowTimer <= 0) {
                this._shogunComboWindowTimer = 0;
                this._shogunComboStep = 0;
            }
        }
        this.updateTemporaryNinjutsu(deltaMs);
        this.updateSpecial(dt);

        // ── 入力処理（handleInput は将軍専用にオーバーライド済み） ──
        this.handleInput();

        // ── 移動がなければ減速（preview line 591: shogun.vx *= 0.8） ──
        const bossIsActive = boss._attackTimer > 0 || boss._subTimer > 0 || boss.isAttacking || !boss.isGrounded;
        if (!bossIsActive && !this.isDashing) {
            const moveDir = input.isAction('LEFT') ? -1 : (input.isAction('RIGHT') ? 1 : 0);
            if (moveDir === 0) {
                this.vx *= 0.8;
                if (Math.abs(this.vx) < 0.1) this.vx = 0;
            }
        }

        // ── プレイヤーの状態をボスに同期 ──
        if (!bossIsActive) {
            boss.x = this.x;
            boss.y = this.y;
            boss.vx = this.vx;
            boss.vy = this.vy;
            boss.isGrounded = this.isGrounded;
            boss.isDashing = this.isDashing;
        }
        boss.facingRight = this.facingRight;
        boss.isCrouching = this.isCrouching;
        boss.groundY = this.groundY;

        // ── ボスの update（唯一の物理処理）──
        const solidColliders = getShogunSolidColliders(this, boss, walls);
        boss.update(dt, null, solidColliders, enemies);
        clampShogunToCameraBounds(this, boss);

        // ── 二刀流Zコンボの先行入力消化 ──
        if (this._shogunQueuedDualAttack && boss._subAction === '二刀_Z') {
            const dualInst = boss._subWeaponInstances.dual;
            if (dualInst && this._shogunCanTriggerDualFollowUp(boss, dualInst)) {
                this._shogunQueuedDualAttack = false;
                this._shogunFireDualSwing(boss, dualInst);
            }
        }

        // ── ボスの結果をプレイヤーに反映 ──
        const bossActiveAfter = boss._attackTimer > 0 || boss._subTimer > 0 || boss.isAttacking;
        this.vx = boss.vx;
        this.vy = boss.vy;
        this.x = boss.x;
        this.y = boss.y;
        this.isGrounded = boss.isGrounded;

        this.isAttacking = bossActiveAfter;
        this.attackTimer = bossActiveAfter ? 50 : 0;
        this.subWeaponTimer = boss._subTimer;
        this.subWeaponAction = boss._subAction;

        // ── アイドル時の武器表示キー維持（preview line 605-611 相当） ──
        if (!bossActiveAfter) {
            this._shogunGetterBypass = 'real';
            const realWeapon = this.currentSubWeapon;
            this._shogunGetterBypass = false;
            if (realWeapon) {
                const typeMap = {
                    '手裏剣': 'shuriken', '火薬玉': 'bomb', '大槍': 'spear',
                    '二刀流': 'dual', '鎖鎌': 'kusarigama', '大太刀': 'odachi'
                };
                const idleKey = typeMap[realWeapon.name];
                if (idleKey) {
                    boss._subWeaponKey = idleKey;
                    boss._subAction = null;
                    const idleInst = boss._subWeaponInstances[idleKey];
                    if (idleInst) {
                        idleInst._renderForceActive = true;
                        idleInst.isAttacking = false;
                    }
                }
            }
        }

        // ── ダッシュ残像 ──
        const shouldEmit = this.isDashing || Math.abs(this.vx) > PLAYER.SPEED * 1.5;
        if (shouldEmit) {
            this.afterImages.unshift({ x: this.x, y: this.y, facingRight: this.facingRight });
            if (this.afterImages.length > 7) this.afterImages.pop();
        } else if (this.afterImages.length > 0) {
            this.afterImages.pop();
        }

        const dir2d = this.facingRight ? 1 : -1;
        const moveBias = Math.min(0.024, Math.abs(this.vx || 0) * 0.0038);
        const attackBias = this.isAttacking ? 0.013 : 0;
        this.shogunYawSkew = dir2d * (0.046 + moveBias + attackBias);

        // 地面デバッグ（2秒ごと）
        this._groundDebugTimer = (this._groundDebugTimer || 0) + deltaMs;
        if (this._groundDebugTimer > 2000) {
            this._groundDebugTimer = 0;
            const expectedFeet = this.groundY + LANE_OFFSET;
            console.log('[将軍GROUND]', {
                'player.y': Math.round(this.y),
                'player.h': this.height,
                'feet': Math.round(this.y + this.height),
                'boss.y': Math.round(boss.y),
                'boss.h': boss.height,
                'bossFeet': Math.round(boss.y + boss.height),
                'groundY': this.groundY,
                'expected': expectedFeet,
                'diff': Math.round(this.y + this.height - expectedFeet),
            });
        }
    };

    // ================================================================
    // getHitbox（被弾判定用）
    // ================================================================
    player.getHitbox = function() {
        if (this.characterType !== 'shogun') return originalGetHitbox.apply(this, arguments);
        return {
            x: this.x, y: this.y, width: this.width, height: this.height
        };
    };
}
