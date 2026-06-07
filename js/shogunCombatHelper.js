import { audio } from './audio.js';
import { PLAYER, LANE_OFFSET, CANVAS_WIDTH } from './constants.js';
import { input } from './input.js';
import { Shogun } from './boss.js';
import { createInputBrain } from './shogunBrains.js';
import {
    SHOGUN_ACTOR_BASE_HEIGHT,
    SHOGUN_ACTOR_BASE_WIDTH,
    SHOGUN_ATTACK_POWER_SCALE,
    SHOGUN_SCALE
} from './shogunConstants.js';

/**
 * 将軍（ラスボス）の戦闘ロジックとステータス制御をプレイヤーに適用
 * 
 * 設計原則:
 *   - 将軍モード時のみ有効化し、忍者プレイヤー・ステージボスへ影響させない
 *   - 戦闘・物理・描画の仕様は内部 Shogun boss を単一ソースにする
 *   - player 側はゲーム共通処理が参照する状態だけを同期する
 * 
 * 根本方針:
 *   Player 本体は共通の入口を維持し、将軍モードだけ combatController へ委譲する。
 *   戦闘状態は全て boss インスタンスが管理し、player 側のプロパティは
 *   毎フレーム boss から同期する。
 */
export function applyShogunCombat(player) {
    if (!player) return;
    if (player._shogunCombatController) {
        player.combatController = player._shogunCombatController;
        return;
    }

    player._shogunInited = false;
    player._getShogunRealSubWeapon = () => player.currentSubWeapon || null;

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
    const SHOGUN_WEAPON_KEY_BY_NAME = {
        '手裏剣': 'shuriken',
        '火薬玉': 'bomb',
        '大槍': 'spear',
        '二刀流': 'dual',
        '鎖鎌': 'kusarigama',
        '大太刀': 'odachi'
    };
    const SHOGUN_CALC_PROPS = [
        'damage',
        'baseDamage',
        'range',
        'baseRange',
        'xDamage',
        'comboDamages',
        'enhanceTier'
    ];
    const shouldSyncShogunSubWeaponCalcProp = (activeInst, prop) => {
        // 大槍のrange/baseRangeは将軍側で体格スケール済み。
        // 忍者値で上書きすると柄と判定が短くなるため、ダメージ系だけ同期する。
        if (activeInst && activeInst.name === '大槍' && (prop === 'range' || prop === 'baseRange')) {
            return false;
        }
        return true;
    };
    const syncShogunDualMainSpeed = (p, dualInst) => {
        if (!p || !dualInst || typeof dualInst.mainMotionSpeedScale !== 'number') return;
        dualInst.mainMotionSpeedScale = Math.max(0.78, (p.attackMotionScale || 1) * 0.78);
    };
    const getPlayableShogunRealSubWeapon = (p) => {
        if (!p) return null;
        if (typeof p._getShogunRealSubWeapon === 'function') {
            return p._getShogunRealSubWeapon();
        }
        return null;
    };
    const getShogunSubWeaponCalculationSource = (p, boss, key) => {
        const activeInst = boss && key && boss._subWeaponInstances
            ? boss._subWeaponInstances[key]
            : null;
        if (!activeInst) return null;
        const selected = getPlayableShogunRealSubWeapon(p);
        if (selected && selected.name === activeInst.name) return selected;
        if (Array.isArray(p?.subWeapons)) {
            return p.subWeapons.find((weapon) => weapon && weapon.name === activeInst.name) || null;
        }
        return null;
    };
    const syncShogunSubWeaponCalculation = (p, boss, key = null) => {
        if (!p || !boss || !boss._subWeaponInstances) return null;
        const activeKey = key || boss._subWeaponKey;
        const activeInst = activeKey ? boss._subWeaponInstances[activeKey] : null;
        const source = getShogunSubWeaponCalculationSource(p, boss, activeKey);
        if (!activeInst || !source || source === activeInst) return null;

        const snapshot = {};
        for (const prop of SHOGUN_CALC_PROPS) {
            if (!shouldSyncShogunSubWeaponCalcProp(activeInst, prop)) continue;
            const value = source[prop];
            if (Array.isArray(value)) {
                activeInst[prop] = value.slice();
                snapshot[prop] = value.slice();
            } else if (Number.isFinite(value)) {
                activeInst[prop] = value;
                snapshot[prop] = value;
            }
        }
        if (!p._shogunSubWeaponCalcSnapshots) p._shogunSubWeaponCalcSnapshots = {};
        p._shogunSubWeaponCalcSnapshots[activeKey] = snapshot;
        return snapshot;
    };
    const syncPlayableShogunAttackCalculation = (p, boss) => {
        if (!p || !boss) return false;
        const profile = boss._currentAttackProfile || null;
        const comboStep = boss._attackTimer > 0 && profile && profile.comboStep
            ? Math.max(1, Math.min(5, Math.floor(profile.comboStep)))
            : 0;
        if (!comboStep) {
            p.attackCombo = 0;
            p.currentAttack = null;
            p.attackTimer = 0;
            return false;
        }
        p.attackCombo = comboStep;
        p.currentAttack = profile;
        p.attackTimer = Math.max(0, boss._attackTimer || 0);
        return true;
    };
    const syncShogunTemporaryNinjutsu = (p, boss) => {
        if (!p || !boss || !boss.actor) return;
        const actor = boss.actor;
        if (p.tempNinjutsuTimers) {
            if (!actor.tempNinjutsuTimers) actor.tempNinjutsuTimers = {};
            Object.keys(p.tempNinjutsuTimers).forEach((key) => {
                actor.tempNinjutsuTimers[key] = Math.max(0, p.tempNinjutsuTimers[key] || 0);
            });
        }
        if (p.tempNinjutsuDurations) {
            if (!actor.tempNinjutsuDurations) actor.tempNinjutsuDurations = {};
            Object.keys(p.tempNinjutsuDurations).forEach((key) => {
                actor.tempNinjutsuDurations[key] = Math.max(0, p.tempNinjutsuDurations[key] || 0);
            });
        }
    };
    const syncShogunProgression = (p, boss) => {
        if (!p || !boss) return;
        const subTier = getShogunSubWeaponTier(p);
        const normalTier = getShogunNormalComboTier(p);
        boss.progression = { ...(boss.progression || {}), subWeapon: subTier, normalCombo: normalTier };
        boss.getSubWeaponEnhanceTier = () => subTier;
        boss.attackPower = Math.max(1.0, Number(p.attackPower) || 1.0) * SHOGUN_ATTACK_POWER_SCALE;
        if (boss.actor) {
            const oldTier = boss.actor.progression ? boss.actor.progression.specialClone : -1;
            const newTier = clampShogunTier(p?.progression?.specialClone);
            boss.actor.progression = {
                ...(boss.actor.progression || {}),
                subWeapon: subTier,
                normalCombo: normalTier,
                specialClone: newTier,
            };
            if (oldTier !== newTier && typeof boss.actor.rebuildSpecialCloneSlots === 'function') {
                boss.actor.rebuildSpecialCloneSlots();
            }
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
        // プレビューは画面端ループ/ズーム引きで自由移動させたいので、クランプを飛ばし同期のみ行う。
        if (!(p && p._previewFreeMovement)) {
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
        }
        p.x = boss.x;
        p.vx = boss.vx;
    };
    const getShogunCombatSubWeapon = (p) => {
        const boss = p?._shogunBossInstance;
        if (p?.characterType === 'shogun' && boss && boss._subWeaponKey) {
            const activeKey = boss._subWeaponKey;
            const activeInst = boss._subWeaponInstances
                ? boss._subWeaponInstances[activeKey]
                : null;
            if (activeInst && typeof activeInst.getHitbox === 'function') {
                if (!p._shogunSubWeaponCollisionProxy) {
                    p._shogunSubWeaponCollisionProxy = new Proxy({}, {
                        get: (_target, prop) => {
                            const currentBoss = p._shogunBossInstance;
                            const currentKey = currentBoss && currentBoss._subWeaponKey;
                            const currentInst = currentKey && currentBoss._subWeaponInstances
                                ? currentBoss._subWeaponInstances[currentKey]
                                : null;
                            if (prop === 'getHitbox') {
                                return () => {
                                    if (!currentBoss || typeof currentBoss.getSubWeaponHitbox !== 'function') return null;
                                    syncShogunSubWeaponCalculation(p, currentBoss, currentKey);
                                    return currentBoss.getSubWeaponHitbox();
                                };
                            }
                            if (prop === 'name') {
                                const selected = p.currentSubWeapon || null;
                                return (currentInst && currentInst.name) || (selected && selected.name) || null;
                            }
                            if (!currentInst) return undefined;
                            const snapshot = p._shogunSubWeaponCalcSnapshots &&
                                p._shogunSubWeaponCalcSnapshots[currentKey];
                            if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, prop)) {
                                return snapshot[prop];
                            }
                            const value = currentInst[prop];
                            return typeof value === 'function' ? value.bind(currentInst) : value;
                        },
                        set: (_target, prop, value) => {
                            const currentBoss = p._shogunBossInstance;
                            const currentKey = currentBoss && currentBoss._subWeaponKey;
                            const currentInst = currentKey && currentBoss._subWeaponInstances
                                ? currentBoss._subWeaponInstances[currentKey]
                                : null;
                            if (currentInst) currentInst[prop] = value;
                            return true;
                        }
                    });
                }
                return p._shogunSubWeaponCollisionProxy;
            }
        }
        return p?.currentSubWeapon || null;
    };

    // ================================================================
    // 初期化: ボスインスタンスとサブ武器の生成
    // ================================================================
    const initShogunInstances = (p) => {
        if (p._shogunInited) return;

        // 将軍は「スケールの違う忍者」: width/height は素体フレーム(40x60)を保持し、
        // ワールド寸法(=素体×scaleMultiplier=88x132)は getWorldWidth/Height 経由で読む。
        p.width = SHOGUN_ACTOR_BASE_WIDTH;   // 40 素体
        p.height = SHOGUN_ACTOR_BASE_HEIGHT; // 60 素体
        p.scaleMultiplier = SHOGUN_SCALE;
        p.speed = PLAYER.SPEED;
        // ワールド身長(=素体×scale=132)で足を接地させる（startStage は忍者の高さで設定済み）
        const groundY = p.groundY || 480;
        p.y = groundY + LANE_OFFSET - p.getWorldHeight();
        p.isGrounded = true;
        p._shogunInited = true;

        p._getShogunRealSubWeapon = () => p.currentSubWeapon || null;

        // E5: プレイアブル将軍は単一 Player ネイティブに一本化。boss(Shogunクラス)は生成しない。
        // dims が整ったこの初回 setup でネイティブ戦闘/描画へ即移行し、以降 controller はバイパスされる。
        if (typeof p.enableNativeShogun === 'function') p.enableNativeShogun();
    };

    const controller = {
        getCombatSubWeapon() {
            return getShogunCombatSubWeapon(this);
        },

        updateAttack() {
            return undefined;
        },

        // ================================================================
        // handleInput（将軍専用入力処理）
        // 忍者の攻撃処理を通さず、内部 Shogun boss の実処理へ入力を渡す
        // ================================================================
        handleInput() {
            initShogunInstances(this);
            const boss = this._shogunBossInstance;
            if (!boss) return undefined;
            syncShogunProgression(this, boss);

            // ── 武器切り替え（C キー）──
            if (input.isActionJustPressed('SWITCH_WEAPON')) {
                this.switchSubWeapon();
            }

            // プレビューモードは攻撃・忍具のみ（移動・ジャンプなし）
            if (this.previewMode) {
                if (input.isActionJustPressed('SUB_WEAPON')) {
                    controller.triggerSubAction.call(this, boss);
                }
                if (input.isActionJustPressed('ATTACK')) {
                    controller.triggerAttack.call(this, boss);
                }
                return;
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
                controller.triggerSubAction.call(this, boss);
            }

            // ── 必殺技 ──
            if (input.isActionJustPressed('SPECIAL')) {
                this.useSpecial();
            }

            // ── 通常攻撃（Z キー）──
            if (input.isActionJustPressed('ATTACK')) {
                controller.triggerAttack.call(this, boss);
            }

            // ── 攻撃中は移動制限 ──
            if (boss._attackTimer > 0 || boss._subTimer > 0 || boss.isAttacking) return;

            // ── 移動 ──
            const moveDir = input.isAction('LEFT') ? -1 : (input.isAction('RIGHT') ? 1 : 0);

            // ── ダッシュ ──
            const dashSpeed = this.speed * (Number.isFinite(this.dashSpeedMultiplier) ? this.dashSpeedMultiplier : 1);
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
                this.vx = this.dashDirection * dashSpeed;
                this.facingRight = this.dashDirection > 0;
            } else if (moveDir !== 0) {
                if (this.permanentDash) {
                    this.vx = moveDir * dashSpeed;
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
        },

        // ================================================================
        // 将軍攻撃トリガー（Z キー）
        // 内部 Shogun boss の通常コンボ / 二刀Zをゲーム操作と同じ経路で発火する
        // ================================================================
        triggerAttack(boss) {
            const isDualEquipped = this.currentSubWeapon && this.currentSubWeapon.name === '二刀流';

            if (isDualEquipped) {
                controller.triggerDualAttack.call(this, boss);
            } else {
                controller.triggerNormalAttack.call(this, boss);
            }
        },

        // ── 通常Zコンボ ──
        triggerNormalAttack(boss) {
            if (boss._subTimer > 0) {
                return;
            }

            // 新規コンボ開始時のみ停止する。攻撃中（連打で次段キュー）は突進速度を保持しないと、
            // Step3 突進中に Z 連打で vx=0 にされ、その後の Step4 が momentum を失う。
            // 忍者の attack() は vx をリセットしない設計で、それと挙動を揃える。
            if (boss._attackTimer <= 0) {
                this.vx = 0;
                boss.vx = 0;
            }

            // 装備中武器キーをセット（renderBody で正しい武器を描画）
            const realWeapon = this.currentSubWeapon;
            if (realWeapon) {
                const wk = SHOGUN_WEAPON_KEY_BY_NAME[realWeapon.name];
                if (wk) boss._subWeaponKey = wk;
            }

            if (boss._attackTimer > 0) {
                // コンボ中: 実コンボの受付ウィンドウ内だけ次段をキューに積む
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
                const chainWindowMs = Number.isFinite(currentAttack?.chainWindowMs) ? currentAttack.chainWindowMs : 0;
                const bufferMs = currentStep === 4
                    ? Math.max(420, Math.min(620, duration * 1.25))
                    : chainWindowMs > 0 ? chainWindowMs : Math.max(80, Math.min(240, duration * 0.82));
                if (remaining > bufferMs) return;
                const comboMax = getShogunNormalComboMax(this);
                const nextStep = Math.min(comboMax, currentStep + 1);
                if (nextStep <= currentStep) return;
                this._shogunComboStep = nextStep;
                this._shogunComboWindowTimer = 460;
                boss._comboPendingSteps = [nextStep];
                return;
            }

            // 新規コンボ開始 — 位置同期
            boss.x = this.x;
            boss.y = this.y;
            boss.isGrounded = this.isGrounded;
            boss.groundY = this.groundY;

            // コンボ継続ウィンドウ内なら次段、そうでなければ1段目
            const comboMax = getShogunNormalComboMax(this);
            const nextStep = (this._shogunComboWindowTimer > 0 && this._shogunComboStep > 0)
                ? ((this._shogunComboStep % comboMax) + 1)
                : 1;
            this._shogunComboStep = nextStep;
            this._shogunComboWindowTimer = 460;
            boss._comboPendingSteps = [nextStep];
            boss._startNextComboStep();
        },

        // ── 二刀流Zコンボ ──
        triggerDualAttack(boss) {
            if (boss._attackTimer > 0) return;
            if (boss._subTimer > 0 && boss._subAction && boss._subAction !== '二刀_Z') return;

            const dualInst = boss._subWeaponInstances.dual;
            if (!dualInst) return;

            // 発動時は停止し、描画用の武器キーを二刀流へ切り替える
            this.vx = 0;
            boss.vx = 0;
            boss._subWeaponKey = 'dual';

            // 二刀流Z中に追加入力 → キューイング
            if (boss._subTimer > 0 && boss._subAction === '二刀_Z') {
                if (!controller.canTriggerDualFollowUp.call(this, boss, dualInst)) {
                    this._shogunQueuedDualAttack = true;
                    return;
                }
            }

            this._shogunQueuedDualAttack = false;
            controller.fireDualSwing.call(this, boss, dualInst);
        },

        // ── 二刀流スイング発動 ──
        // プレイヤー将軍でも boss 側の isEnemy を変えず、実武器インスタンスを使う
        fireDualSwing(boss, dualInst) {
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
            syncShogunSubWeaponCalculation(this, boss, 'dual');
            syncShogunDualMainSpeed(this, dualInst);
            // currentSubWeapon を一時セットし、isEnemy はそのまま
            const prevSubWeapon = boss.currentSubWeapon;
            boss.currentSubWeapon = dualInst;
            try {
                dualInst.use(boss, 'main');
            } finally {
                boss.currentSubWeapon = prevSubWeapon;
            }
            const duration = Math.max(112, dualInst.mainDuration || 204);
            boss._subAction = '二刀_Z';
            boss._subWeaponKey = 'dual';
            boss._subTimer = duration;
            boss.attackTimer = duration;
            boss.isAttacking = true;
            boss._dualZPendingSteps = null;
            boss._shurikenVisualTimer = 0;
        },

        // ── 二刀流Z先行入力判定 ──
        canTriggerDualFollowUp(boss, dualInst) {
            if (!dualInst || boss._subAction !== '二刀_Z') return true;
            if (typeof dualInst.getMainSwingPose !== 'function') {
                return boss._subTimer <= 20;
            }
            const pose = dualInst.getMainSwingPose({
                comboIndex: dualInst.comboIndex,
                attackTimer: dualInst.attackTimer
            });
            return (pose.progress || 0) >= 0.9 || boss._subTimer <= 20;
        },

        // ================================================================
        // 将軍忍具トリガー（X キー）
        // 内部 Shogun boss の忍具処理をゲーム操作と同じ経路で発火する
        // ================================================================
        triggerSubAction(boss) {
            // 他のアクション中は発動不可
            if (boss._attackTimer > 0 || (boss._subTimer > 0 && boss._subAction !== '二刀_Z')) {
                return;
            }

            const realWeapon = this.currentSubWeapon;
            if (!realWeapon) {
                return;
            }

            // 発動時は停止＋位置同期
            this.vx = 0;
            boss.vx = 0;
            boss.x = this.x;
            boss.y = this.y;
            boss.isGrounded = this.isGrounded;
            boss.groundY = this.groundY;

            // 忍具発動時は二刀Zの先行入力をリセットする
            this._shogunQueuedDualAttack = false;
            const dualForReset = boss._subWeaponInstances.dual;
            if (dualForReset) {
                dualForReset.mainComboLinkTimer = 0;
                dualForReset.comboIndex = 0;
            }

            const weaponKey = SHOGUN_WEAPON_KEY_BY_NAME[realWeapon.name];
            if (!weaponKey) {
                return;
            }

            const inst = boss._subWeaponInstances[weaponKey];
            syncShogunProgression(this, boss);
            if (inst && typeof inst.canUse === 'function' && !inst.canUse()) {
                return;
            }

            const actionMap = {
                shuriken: 'throw', bomb: 'throw', spear: '大槍',
                dual: '二刀_合体', kusarigama: '鎖鎌', odachi: '大太刀'
            };

            boss.isAttacking = true;
            syncShogunSubWeaponCalculation(this, boss, weaponKey);
            boss._fireSubWeapon(weaponKey);
            boss._subAction = actionMap[weaponKey] || null;

            const duration = boss._getSubActionDurationMs
                ? boss._getSubActionDurationMs(actionMap[weaponKey] || realWeapon.name, weaponKey)
                : 300;
            boss._shurikenVisualTimer = weaponKey === 'shuriken' && boss._getSubActionDurationMs
                ? boss._getSubActionDurationMs('throw', 'bomb')
                : 0;

            boss._subTimer = duration;
            boss._subWeaponKey = weaponKey;
        },

        // ================================================================
        // getAttackHitbox（game.jsの当たり判定ループ用）
        // ================================================================
        getAttackHitbox(options = {}) {
            const boss = this._shogunBossInstance;
            if (!boss) return null;

            if (syncPlayableShogunAttackCalculation(this, boss)) {
                const state = options && options.state ? options.state : {
                    x: this.x + (this.getWorldWidth() - PLAYER.WIDTH) * 0.5,
                    y: this.y + this.getWorldHeight() - PLAYER.HEIGHT,
                    width: PLAYER.WIDTH,
                    height: PLAYER.HEIGHT,
                    facingRight: boss.facingRight,
                    isCrouching: false,
                    isAttacking: true,
                    currentAttack: this.currentAttack,
                    attackTimer: this.attackTimer
                };
                return typeof this.getBaseAttackHitbox === 'function'
                    ? this.getBaseAttackHitbox({ state })
                    : null;
            }
            return null;
        },

        // ================================================================
        // attack / bufferNextAttack / useSubWeapon
        // handleInput 以外の経路からも呼ばれる可能性があるため維持
        // ================================================================
        attack() {
            initShogunInstances(this);
            const boss = this._shogunBossInstance;
            if (!boss) return;
            controller.triggerAttack.call(this, boss);
        },

        bufferNextAttack() {
            return controller.attack.call(this);
        },

        useSubWeapon() {
            initShogunInstances(this);
            const boss = this._shogunBossInstance;
            if (!boss) return;
            controller.triggerSubAction.call(this, boss);
        },

        // ================================================================
        // update
        //
        // 設計:
        //   将軍モードでは内部 Shogun boss を戦闘・物理の単一ソースにする。
        //   player 側は無敵、ダッシュ、奥義などゲーム共通のタイマーだけを更新し、
        //   boss.update() 後に座標・攻撃状態・忍具状態を同期する。
        // ================================================================
        update(dt, walls = [], enemies = []) {
            initShogunInstances(this);
            // E5: initShogunInstances で native 化済み。以降は Player 自身の update が走る。
            // この controller.update は frame1 の setup 専用となり、boss 経路は使われない。
            if (this._nativeShogun) return undefined;
            const boss = this._shogunBossInstance;
            if (!boss) return undefined;
            syncShogunProgression(this, boss);

            const deltaMs = dt * 1000;

            // ── player.js 由来のゲーム共通タイマー ──
            if (this.invincibleTimer > 0) this.invincibleTimer -= deltaMs;
            if (this.trapDamageCooldown > 0) this.trapDamageCooldown -= deltaMs;
            if (this.damageFlashTimer > 0) this.damageFlashTimer -= deltaMs;
            if (this.dashCooldown > 0) this.dashCooldown -= deltaMs;
            if (this.dashTimer > 0) {
                this.dashTimer -= deltaMs;
                if (this.dashTimer <= 0) { this.dashTimer = 0; this.isDashing = false; }
            }
            this.motionTime = (this.motionTime || 0) + deltaMs;
            // コンボ継続ウィンドウ
            if (this._shogunComboWindowTimer > 0) {
                this._shogunComboWindowTimer -= deltaMs;
                if (this._shogunComboWindowTimer <= 0) {
                    this._shogunComboWindowTimer = 0;
                    this._shogunComboStep = 0;
                }
            }
            this.updateTemporaryNinjutsu(deltaMs);
            syncShogunTemporaryNinjutsu(this, boss);

            // 奥義状態をボスに同期（分身クローンの描画はboss.renderBody内で行う）
            boss._ougiActive = !!(this.isUsingSpecial && this.specialCloneCombatStarted);
            boss._playableOwner = this;

            // ── 入力処理（制御源 brain 経由。InputBrain が player.handleInput() を呼ぶ） ──
            if (boss.brain && typeof boss.brain.tick === 'function') {
                boss.brain.tick(boss, dt, { player: this });
            } else {
                this.handleInput();
            }

            // ── 移動がなければ減速（地上のみ）──
            const bossIsActive = boss._attackTimer > 0 || boss._subTimer > 0 || boss.isAttacking;
            if (!bossIsActive && boss.isGrounded && !this.isDashing) {
                const moveDir = input.isAction('LEFT') ? -1 : (input.isAction('RIGHT') ? 1 : 0);
                if (moveDir === 0) {
                    this.vx *= 0.8;
                    if (Math.abs(this.vx) < 0.1) this.vx = 0;
                }
            }

            // ── プレイヤーの状態をボスに同期（攻撃中以外は常に同期） ──
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
            boss._previewFreeMovement = !!this._previewFreeMovement;

            // ── ボスの update（唯一の物理処理）──
            const solidColliders = getShogunSolidColliders(this, boss, walls);
            boss.update(dt, null, solidColliders, enemies);
            clampShogunToCameraBounds(this, boss);

            // ── 二刀流Zコンボの先行入力消化 ──
            if (this._shogunQueuedDualAttack && boss._subAction === '二刀_Z') {
                const dualInst = boss._subWeaponInstances.dual;
                if (dualInst && controller.canTriggerDualFollowUp.call(this, boss, dualInst)) {
                    this._shogunQueuedDualAttack = false;
                    controller.fireDualSwing.call(this, boss, dualInst);
                }
            }

            // ── ボスの結果をプレイヤーに反映 ──
            const wasPlayerGrounded = this.isGrounded;
            const bossActiveAfter = boss._attackTimer > 0 || boss._subTimer > 0 || boss.isAttacking;
            this.vx = boss.vx;
            this.vy = boss.vy;
            this.x = boss.x;
            this.y = boss.y;
            this.isGrounded = boss.isGrounded;
            if (this.isGrounded) {
                this.jumpCount = 0;
            }
            this.justLanded = !wasPlayerGrounded && this.isGrounded;
            if (this.justLanded) {
                this.restrictAirCombo1 = false;
                const landingSpeed = Number.isFinite(boss._lastLandingSpeed) ? boss._lastLandingSpeed : 0;
                if (landingSpeed > 0) {
                    audio.playLanding();
                }
            }

            const normalAttackActive = syncPlayableShogunAttackCalculation(this, boss);
            this.isAttacking = normalAttackActive;
            this.subWeaponTimer = boss._subTimer;
            this.subWeaponAction = boss._subAction;

            // 必殺技（分身）は、忍者と同じく入力・物理・忍具更新後に同期する。
            // 以前は本体の boss 忍具インスタンスを currentSubWeapon に一時差し替えて分身経路に見せていたが、
            // updateSpecial / updateSpecialCloneSlashTrails 側を getActiveSubWeaponInstance() 経由に統一したため、
            // ここでの退避/差し替え/復元（二重管理 band-aid）は不要になった。
            this.updateSpecial(dt);
            if (this.isUsingSpecial && typeof this.updateSpecialCloneSlashTrails === 'function') {
                this.updateSpecialCloneSlashTrails(deltaMs);
            }
            boss._ougiActive = !!(this.isUsingSpecial && this.specialCloneCombatStarted);
            boss._playableOwner = this;

            // ── アイドル時の武器表示キー維持 ──
            if (!bossActiveAfter) {
                const realWeapon = this.currentSubWeapon;
                if (realWeapon) {
                    const idleKey = SHOGUN_WEAPON_KEY_BY_NAME[realWeapon.name];
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

            // [E3b] 初回 update でセットアップ(dims/boss/忍具)が整ったら Player ネイティブ戦闘へ移行する。
            // 以降は hasCombatControllerMethod が false を返し、Player 自身の update/描画/戦闘(boss非依存)が走る。
            // 検証済みプレビューと同一フロー（初回のみ controller→以後 native）。全エントリポイントを1箇所でカバー。
            // _disableNativeShogun=true で従来 boss 経路を維持（比較・緊急回避用）。
            if (!this._nativeShogun && this._disableNativeShogun !== true &&
                Array.isArray(this.subWeapons) && this.subWeapons.length > 0 &&
                typeof this.enableNativeShogun === 'function') {
                this.enableNativeShogun();
            }
        },

        // ================================================================
        // getHitbox（被弾判定用）
        // ================================================================
        getHitbox() {
            return {
                x: this.x, y: this.y, width: this.getWorldWidth(), height: this.getWorldHeight()
            };
        }
    };

    player._shogunCombatController = controller;
    player.combatController = controller;

    // 「本体が今アクティブにしている忍具インスタンス」を boss の正本プールから解決する。
    // 本体（renderBody）が _subWeaponKey から _subWeaponInstances[key] を描くのと同じ規則に揃え、
    // 分身（renderSpecial/updateSpecial）が getActiveSubWeaponInstance() 越しに本体と同一インスタンスを参照できるようにする。
    // 注意: player.currentSubWeapon 自体は在庫インスタンスのまま差し替えない（メインループの二重 render/use を防ぐ）。
    player._resolveActiveSubWeaponInstance = () => {
        // ネイティブ将軍は自分の（scaled）currentSubWeapon を使うため boss プールへ解決しない。
        if (player._nativeShogun) return null;
        const boss = player._shogunBossInstance;
        if (!boss || !boss._subWeaponInstances) return null;
        let key = boss._subWeaponKey || null;
        if (!key && player.currentSubWeapon) {
            key = SHOGUN_WEAPON_KEY_BY_NAME[player.currentSubWeapon.name] || null;
        }
        return key ? (boss._subWeaponInstances[key] || null) : null;
    };
}
