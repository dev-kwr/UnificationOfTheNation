import { audio } from './audio.js';
import { PLAYER, LANE_OFFSET, CANVAS_WIDTH } from './constants.js';
import { input } from './input.js';
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

    // E5: 将軍は単一 Player ネイティブに一本化済み。controller は初回 update での
    // setup(dims設定＋enableNativeShogun)専用。以降 hasCombatControllerMethod が false を返し、
    // Player 自身の update/handleInput/戦闘/描画(boss非依存)が走る（旧 boss駆動メソッド群は撤去）。
    const controller = {
        update(dt, walls = [], enemies = []) {
            initShogunInstances(this);
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
