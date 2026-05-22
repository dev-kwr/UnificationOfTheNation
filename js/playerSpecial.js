// Unification of the Nation - 分身クローン mixin

import { PLAYER, GRAVITY, FRICTION, COLORS, LANE_OFFSET } from './constants.js';
import { audio } from './audio.js';
import { game } from './game.js';
import { drawShurikenShape, createSubWeapon } from './weapon.js';
import {
    ANIM_STATE, COMBO_ATTACKS, PLAYER_HEADBAND_LINE_WIDTH, PLAYER_SPECIAL_HEADBAND_LINE_WIDTH,
    PLAYER_PONYTAIL_CONNECT_LIFT_Y, PLAYER_PONYTAIL_ROOT_ANGLE_RIGHT,
    PLAYER_PONYTAIL_ROOT_ANGLE_LEFT, PLAYER_PONYTAIL_ROOT_SHIFT_X,
    PLAYER_PONYTAIL_NODE_ROOT_OFFSET_X, PLAYER_PONYTAIL_NODE_ROOT_OFFSET_Y,
    BASE_EXP_TO_NEXT, TEMP_NINJUTSU_MAX_STACK_MS, LEVEL_UP_MAX_HP_GAIN
} from './playerData.js';

export function applySpecialMixin(PlayerClass) {

    PlayerClass.prototype.useSpecial = function() {
        if (this.specialGauge < this.maxSpecialGauge) return;
        if (this.isUsingSpecial) {
            this.clearSpecialState(true);
        }
        
        this.isUsingSpecial = true;
        this.specialCastTimer = this.specialCastDurationMs;
        this.specialCloneCombatStarted = false;
        this.specialCloneAlive = this.specialCloneSlots.map(() => true);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => this.specialCastDurationMs + this.specialCloneSpawnInvincibleMs);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 40);
        const cloneDurability = this.getSpecialCloneDurabilityPerUnit();
        this.specialCloneDurability = this.specialCloneSlots.map(() => cloneDurability);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneMirroredTrailProfiles = this.specialCloneSlots.map(() => null);
        this.specialCloneDualTrailAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneSubWeaponOwners = this.specialCloneSlots.map(() => null);

        const cloneAnchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
        this.specialClonePositions = cloneAnchors.map(a => ({ x: a.x, y: a.y, facingRight: this.facingRight, prevX: a.x }));
        this.specialCloneScarfNodes = this.specialCloneSlots.map(() => null);
        this.specialCloneHairNodes = this.specialCloneSlots.map(() => null);
        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            this.initCloneAccessoryNodes(i);
        }

        this.spawnSpecialSmoke('appear', this.getSpecialSmokeAnchors(true));

        this.specialGauge = 0;
        this.animState = ANIM_STATE.SPECIAL;
        audio.playSpecial();
    };

    PlayerClass.prototype.clearSpecialState = function(clearSmoke = true) {
        this.isUsingSpecial = false;
        this.specialCastTimer = 0;
        this.specialCloneCombatStarted = false;
        this.specialCloneAlive = this.specialCloneSlots.map(() => false);
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map(() => 0);
        this.specialCloneDurability = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneMirroredTrailProfiles = this.specialCloneSlots.map(() => null);
        this.specialCloneDualTrailAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneSubWeaponOwners = this.specialCloneSlots.map(() => null);
        if (clearSmoke) this.specialSmoke = [];
    };

    PlayerClass.prototype.updateSpecial = function(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const enemies = (window.game && window.game.enemies) || [];

        if (this.isUsingSpecial) {
            if (this.specialCastTimer > 0) {
                const previousCastTimer = this.specialCastTimer;
                this.specialCastTimer = Math.max(0, this.specialCastTimer - deltaMs);
                this.invincibleTimer = Math.max(this.invincibleTimer, 120);
                if (previousCastTimer > 0 && this.specialCastTimer <= 0 && !this.specialCloneCombatStarted) {
                    this.onSpecialCloneStarted();
                }

                // 詠唱中は全レベル共通でノードを追従させる（Lv3も含む）
                const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
                for (let i = 0; i < this.specialCloneSlots.length; i++) {
                    const pos = this.specialClonePositions[i];
                    if (!pos) continue;

                    pos.x = anchors[i].x;
                    pos.y = anchors[i].y;
                    pos.facingRight = anchors[i].facingRight;
                    pos.prevX = pos.x; // prevXも同期して速度計算の暴走を防ぐ

                    this.updateSpecialCloneAccessoryNodes(i, pos, deltaTime, {
                        cloneVx: this.vx,
                        motionTime: this.motionTime,
                        isMoving: Math.abs(this.vx) > 0.5 || !this.isGrounded,
                        drawX: pos.x - this.width * 0.5,
                        footY: this.getSpecialCloneFootY(pos.y),
                        height: this.height,
                        isDashing: this.isDashing,
                        isCrouching: this.isCrouching,
                        legPhase: this.legPhase || this.motionTime * 0.012
                    });
                }
            } else {
                if (!this.specialCloneCombatStarted) {
                    this.onSpecialCloneStarted();
                }
            }
            
            // 無敵時間とクールダウンの更新
            for (let index = 0; index < this.specialCloneInvincibleTimers.length; index++) {
                if (this.specialCloneInvincibleTimers[index] > 0) {
                    this.specialCloneInvincibleTimers[index] = Math.max(0, this.specialCloneInvincibleTimers[index] - deltaMs);
                }
            }
            for (let index = 0; index < this.specialCloneAutoCooldowns.length; index++) {
                if (this.specialCloneAutoCooldowns[index] > 0) {
                    this.specialCloneAutoCooldowns[index] = Math.max(0, this.specialCloneAutoCooldowns[index] - deltaMs);
                }
            }

            // 座標更新
            if (this.specialCloneAutoAiEnabled && this.specialCloneCombatStarted) {
                this.updateSpecialCloneAi(deltaTime);
            } else if (this.specialCloneCombatStarted) {
                // Lv1〜2: 本体に追従
                const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
                for (let i = 0; i < this.specialCloneSlots.length; i++) {
                    if (this.specialClonePositions[i]) {
                        const odachiInst = this.specialCloneSubWeaponInstances && this.specialCloneSubWeaponInstances[i];
                        const odachiFlying = odachiInst && odachiInst.name === '大太刀' && odachiInst.isAttacking && !odachiInst.hasImpacted;
                        this.specialClonePositions[i].x = anchors[i].x;
                        if (odachiFlying) {
                            // 大太刀飛翔中: プレイヤーy追従でアクセサリのズレを防ぐ
                            this.specialClonePositions[i].y = this.getSpecialCloneAnchorY();
                            this.specialClonePositions[i].jumping = !this.isGrounded;
                            this.specialClonePositions[i].cloneVy = this.vy;
                        } else {
                            this.specialClonePositions[i].y = anchors[i].y;
                        }
                        this.specialClonePositions[i].facingRight = anchors[i].facingRight;

                        const pos = this.specialClonePositions[i];
                        if (typeof this.constrainSpecialClonePosition === 'function') {
                            this.constrainSpecialClonePosition(pos);
                        }
                        // 大太刀アクティブ時はサブ武器更新後にpos.yが確定するためここではスキップ
                        // Lv1-2: 本体の大太刀がぶら下がり中も分身のアクセサリ更新を遅延させる
                        const playerOdachiActiveForAccessory = !this.specialCloneAutoAiEnabled &&
                            this.currentSubWeapon &&
                            this.currentSubWeapon.name === '大太刀' &&
                            this.currentSubWeapon.isAttacking &&
                            this.currentSubWeapon.hasImpacted;
                        const odachiActive = (odachiInst && odachiInst.name === '大太刀' && odachiInst.isAttacking) || playerOdachiActiveForAccessory;
                        if (!odachiActive) {
                            this.updateSpecialCloneAccessoryNodes(i, pos, deltaTime, {
                                cloneVx: this.vx,
                                motionTime: this.motionTime,
                                isMoving: Math.abs(this.vx) > 0.5 || !this.isGrounded,
                                drawX: pos.x - this.width * 0.5,
                                footY: this.getSpecialCloneFootY(pos.y),
                                height: this.height,
                                isDashing: this.isDashing,
                                isCrouching: this.isCrouching,
                                legPhase: this.legPhase || this.motionTime * 0.012
                            });
                        }
                    }
                }
            }
        }

        if (this.specialCloneSubWeaponInstances) {
            for (let i = 0; i < this.specialCloneSubWeaponInstances.length; i++) {
                const inst = this.specialCloneSubWeaponInstances[i];
                if (inst) {
                    const dummyClone = this.syncSpecialCloneSubWeaponOwner(i, inst);
                    if (!dummyClone) continue;
                    // owner参照型の武器(大太刀・鎖鎌)は毎フレームclone位置に同期
                    // ただし大太刀が着地後(planted/fadeOut)は位置を固定する
                    if (inst.owner !== undefined &&
                        !(inst.hasImpacted && ((inst.plantedTimer || 0) > 0 || (inst.fadeOutTimer || 0) > 0))) {
                        inst.owner = dummyClone;
                    }
                    // 二刀流は常にScale=1（combined含む）、他の武器はMotionScale適用
                    const subWeaponScale = inst.name === '二刀流' ? 1 : Math.max(1, this.subWeaponMotionScale || 1);
                    inst.update(deltaTime / subWeaponScale, enemies);
                    // 非AIモード（Lv1-2）ではupdateSpecialCloneAiが呼ばれないためここでタイマーを減算
                    if (!this.specialCloneAutoAiEnabled && this.specialCloneSubWeaponTimers && this.specialCloneSubWeaponTimers[i] > 0) {
                        this.specialCloneSubWeaponTimers[i] = Math.max(0, this.specialCloneSubWeaponTimers[i] - deltaMs);
                        if (this.specialCloneSubWeaponTimers[i] <= 0) {
                            // 武器がまだアニメーション中（isAttacking）はactionを保持してポーズを維持する
                            if (!inst.isAttacking && !((inst.fadeOutTimer || 0) > 0)) {
                                this.specialCloneSubWeaponActions[i] = null;
                            }
                        }
                    }
                    const cloneTimer = this.specialCloneSubWeaponTimers ? (this.specialCloneSubWeaponTimers[i] || 0) : 0;
                    const hasLiveProjectile = Array.isArray(inst.projectiles) && inst.projectiles.length > 0;
                    // 大太刀着地後: dummyCloneのplanted位置をposに反映
                    if (inst.name === '大太刀' && inst.hasImpacted && dummyClone && this.specialClonePositions[i]) {
                        const pos = this.specialClonePositions[i];
                        // Lv1-2: 本体のぶら下がり状態を優先参照（分身のisAttackingより早く解除されるため）
                        const playerIsHanging = !this.specialCloneAutoAiEnabled &&
                            this.currentSubWeapon &&
                            this.currentSubWeapon.name === '大太刀' &&
                            this.currentSubWeapon.isAttacking &&
                            this.currentSubWeapon.hasImpacted;
                        const isHanging = this.specialCloneAutoAiEnabled ? inst.isAttacking : (playerIsHanging || inst.isAttacking);
                        // ぶら下がり中: pos.yを本体のanchor位置に同期（分身自身のowner.yではなく）
                        pos.y = isHanging
                            ? (this.y + this.height * 0.62)
                            : (dummyClone.y + this.height * 0.62);
                        if (this.specialCloneAutoAiEnabled) {
                            pos.jumping = false;
                            pos.cloneVy = 0;
                        } else if (playerIsHanging) {
                            pos.jumping = false;
                            pos.cloneVy = 0;
                            pos.odachiWasHanging = true;
                            pos.odachiLandingTimer = 0;
                        } else if (inst.isAttacking) {
                            pos.jumping = false;
                            pos.cloneVy = 0;
                            pos.odachiWasHanging = true;
                            pos.odachiLandingTimer = 0;
                        } else {
                            // ぶら下がり終了直後: 本体の落下フレームに合わせた着地遷移
                            if (pos.odachiWasHanging) {
                                pos.odachiLandingTimer = 160;
                                pos.odachiWasHanging = false;
                            }
                            if ((pos.odachiLandingTimer || 0) > 0) {
                                pos.odachiLandingTimer = Math.max(0, pos.odachiLandingTimer - deltaMs);
                            }
                            pos.jumping = (pos.odachiLandingTimer || 0) > 0;
                            pos.cloneVy = pos.jumping ? 2 : 0;
                        }
                    }
                    // 大太刀: isAttacking中・planted中・fadeOut中・本体ぶら下がり中はタイマー切れでも維持
                    const playerOdachiActive = !this.specialCloneAutoAiEnabled &&
                        this.currentSubWeapon &&
                        this.currentSubWeapon.name === '大太刀' &&
                        this.currentSubWeapon.isAttacking;
                    const odachiAlive = inst.name === '大太刀' &&
                        (inst.isAttacking || (inst.plantedTimer || 0) > 0 || (inst.fadeOutTimer || 0) > 0 || playerOdachiActive);
                    if (
                        cloneTimer <= 0 &&
                        !inst.isAttacking &&
                        !hasLiveProjectile &&
                        !odachiAlive &&
                        (inst.name === '二刀流' || inst.name === '鎖鎌' || inst.name === '大太刀' || inst.name === '大槍')
                    ) {
                        inst.isAttacking = false;
                        inst.attackTimer = 0;
                        if (inst.name === '大太刀') {
                            inst.plantedTimer = 0;
                            inst.fadeOutTimer = 0;
                            inst.lastPlantedPose = null;
                        }
                        this.specialCloneSubWeaponInstances[i] = null;
                        if (Array.isArray(this.specialCloneSubWeaponOwners)) {
                            this.specialCloneSubWeaponOwners[i] = null;
                        }
                    }
                }
            }
        }

        // Lv1-2: 大太刀アクティブ中はサブ武器更新後（pos.y確定後）にアクセサリを更新
        if (!this.specialCloneAutoAiEnabled && this.specialCloneCombatStarted && this.specialCloneSubWeaponInstances) {
            for (let i = 0; i < this.specialCloneSlots.length; i++) {
                const inst = this.specialCloneSubWeaponInstances[i];
                const pos = this.specialClonePositions && this.specialClonePositions[i];
                // Lv1-2: 本体の大太刀がぶら下がり中も分身のアクセサリを更新する
                const playerOdachiHanging = this.currentSubWeapon &&
                    this.currentSubWeapon.name === '大太刀' &&
                    this.currentSubWeapon.isAttacking &&
                    this.currentSubWeapon.hasImpacted;
                if (pos && inst && inst.name === '大太刀' && (inst.isAttacking || playerOdachiHanging)) {
                    this.updateSpecialCloneAccessoryNodes(i, pos, deltaTime, {
                        cloneVx: this.vx,
                        motionTime: this.motionTime,
                        isMoving: Math.abs(this.vx) > 0.5 || !this.isGrounded,
                        drawX: pos.x - this.width * 0.5,
                        footY: this.getSpecialCloneFootY(pos.y),
                        height: this.height,
                        isDashing: this.isDashing,
                        isCrouching: this.isCrouching,
                        legPhase: this.legPhase || this.motionTime * 0.012
                    });
                }
            }
        }

        for (const puff of this.specialSmoke) {
            puff.life -= deltaMs;
            const lifeRatio = Math.max(0, Math.min(1, puff.life / Math.max(1, puff.maxLife)));
            puff.rot = (puff.rot || 0) + (puff.spin || 0);
            const wobble = Math.sin((this.motionTime + (puff.rot || 0) * 60) * (puff.wobbleFreq || 0.01));
            const wobbleScale = 1 + wobble * 0.35;
            puff.vx += Math.cos((puff.rot || 0) * 1.2) * (puff.wobbleAmp || 0.2) * 0.016 * wobbleScale;
            puff.vy += Math.sin((puff.rot || 0) * 1.1) * (puff.wobbleAmp || 0.2) * 0.01 * wobbleScale;
            if (puff.mode === 'appear') {
                puff.vy -= 0.006 * (0.6 + lifeRatio * 0.8);
            } else {
                puff.vy -= 0.003 * (0.45 + lifeRatio * 0.5);
            }
            puff.x += puff.vx;
            puff.y += puff.vy;
            puff.vx *= 0.968;
            puff.vy *= 0.972;
        }
        this.specialSmoke = this.specialSmoke.filter((puff) => puff.life > 0);
    };

    PlayerClass.prototype.triggerCloneAttack = function(index) {
        if (this.specialCloneAttackTimers[index] <= 0 && this.specialCloneSubWeaponTimers[index] <= 0) {
            if (Array.isArray(this.specialCloneSlashTrailPoints) && Array.isArray(this.specialCloneSlashTrailPoints[index])) {
                this.specialCloneSlashTrailPoints[index].length = 0;
            }
            if (Array.isArray(this.specialCloneSlashTrailSampleTimers)) {
                this.specialCloneSlashTrailSampleTimers[index] = 0;
            }
            if (Array.isArray(this.specialCloneSlashTrailBoostAnchors)) {
                this.specialCloneSlashTrailBoostAnchors[index] = null;
            }
            if (Array.isArray(this.specialCloneMirroredTrailProfiles)) {
                this.specialCloneMirroredTrailProfiles[index] = null;
            }
            if (
                this.specialCloneAutoAiEnabled &&
                this.currentSubWeapon &&
                this.currentSubWeapon.name === '二刀流' &&
                typeof this.currentSubWeapon.getMainDurationByStep === 'function'
            ) {
                const prevStep = this.specialCloneComboSteps[index] || 0;
                const maxSteps = (this.currentSubWeapon.comboDamages || []).length || 5;
                // 5連コンボ完了後は飛翔斬撃（combined）を発動
                if (prevStep >= maxSteps) {
                    const combinedDuration = Math.max(170, Math.round(
                        this.currentSubWeapon.combinedDuration || 560
                    ));
                    this.specialCloneComboSteps[index] = 0;
                    this.specialCloneCurrentAttacks[index] = null;
                    this.specialCloneAttackTimers[index] = combinedDuration;
                    this.specialCloneSubWeaponTimers[index] = combinedDuration;
                    this.specialCloneSubWeaponActions[index] = '二刀_合体';
                    this.specialCloneComboResetTimers[index] = combinedDuration + 210 + 60;
                    this.activateCloneSubWeaponInstance(index, 'combined');
                    return;
                }
                const nextComboIndex = prevStep + 1;
                const dualDuration = Math.max(1, this.currentSubWeapon.getMainDurationByStep(nextComboIndex - 1));
                this.specialCloneComboSteps[index] = nextComboIndex;
                this.specialCloneCurrentAttacks[index] = null;
                this.specialCloneAttackTimers[index] = dualDuration;
                this.specialCloneSubWeaponTimers[index] = dualDuration;
                this.specialCloneSubWeaponActions[index] = '二刀_Z';
                this.specialCloneComboResetTimers[index] = dualDuration + 210 + 60;
                this.activateCloneSubWeaponInstance(index, 'main');
                return;
            }
            let nextStep = (this.specialCloneComboSteps[index] || 0) + 1;
            if (nextStep > COMBO_ATTACKS.length) nextStep = 1;
            const clonePos = this.specialClonePositions[index] || null;
            const profile = this.buildComboAttackProfileWithTrail(nextStep, {
                x: clonePos ? (clonePos.x - this.width * 0.5) : this.x,
                y: clonePos ? this.getSpecialCloneDrawY(clonePos.y) : this.y,
                width: this.width,
                height: PLAYER.HEIGHT,
                facingRight: clonePos ? clonePos.facingRight : this.facingRight,
                isCrouching: false,
                vx: clonePos ? (clonePos.renderVx || 0) : this.vx,
                vy: clonePos ? (clonePos.cloneVy || 0) : this.vy,
                speed: this.speed
            });
            profile.trailAttackId = ++this.comboSlashTrailAttackSerial;
            if (clonePos) {
                const airborneAtStart = !!clonePos.jumping;
                const direction = clonePos.facingRight ? 1 : -1;
                const impulse = (profile.impulse || 1) * this.speed;
                clonePos.comboVx = Number.isFinite(clonePos.comboVx)
                    ? clonePos.comboVx
                    : (clonePos.renderVx || 0);
                if (profile.comboStep === 1) {
                    clonePos.comboVx *= 0.12;
                    if (Math.abs(clonePos.comboVx) < 0.2) clonePos.comboVx = 0;
                    if (airborneAtStart) {
                        clonePos.cloneVy = Math.max(clonePos.cloneVy || 0, -0.8);
                    } else {
                        clonePos.cloneVy = 0;
                    }
                } else if (profile.comboStep === 2) {
                    clonePos.comboVx = clonePos.comboVx * 0.16 + direction * impulse * 0.9;
                    if (airborneAtStart) {
                        clonePos.cloneVy = Math.min(clonePos.cloneVy || 0, -1.2);
                    } else {
                        clonePos.cloneVy = 0;
                    }
                } else if (profile.comboStep === 3) {
                    clonePos.comboVx = clonePos.comboVx * 0.12 + direction * impulse * 1.71;
                    clonePos.cloneVy = Math.min(clonePos.cloneVy || 0, -8.2);
                    clonePos.jumping = true;
                } else if (profile.comboStep === 4) {
                    clonePos.comboVx = clonePos.comboVx * 0.24 + direction * impulse * 0.42;
                    clonePos.cloneVy = Math.min(clonePos.cloneVy || 0, -10.6);
                    clonePos.jumping = true;
                } else if (profile.comboStep === 5) {
                    clonePos.comboVx *= 0.18;
                    clonePos.cloneVy = Math.max(clonePos.cloneVy || 0, 3.4);
                    clonePos.jumping = true;
                }
            }
            this.specialCloneCurrentAttacks[index] = profile;
            this.specialCloneAttackTimers[index] = profile.durationMs;
            this.specialCloneComboSteps[index] = nextStep;
            
            const lingerMs = profile.chainWindowMs || 60;
            this.specialCloneComboResetTimers[index] = profile.durationMs + 210 + lingerMs;
        }
    };

    PlayerClass.prototype.getCloneSubWeaponActionName = function(weapon = this.currentSubWeapon) {
        if (!weapon || !weapon.name) return null;
        if (weapon.name === '手裏剣' || weapon.name === '火薬玉') return 'throw';
        if (weapon.name === '二刀流') {
            return weapon.attackType === 'combined' ? '二刀_合体' : '二刀_Z';
        }
        return weapon.name;
    };

    PlayerClass.prototype.getCloneSubWeaponAttackType = function(actionName, weapon = this.currentSubWeapon) {
        if (!weapon || weapon.name !== '二刀流') return null;
        return actionName === '二刀_合体' ? 'combined' : 'main';
    };

    PlayerClass.prototype.getCurrentSubWeaponEnhanceTier = function() {
        if (typeof this.getSubWeaponEnhanceTier === 'function') {
            return Math.max(0, Math.min(3, Math.floor(this.getSubWeaponEnhanceTier()) || 0));
        }
        if (this.progression && Number.isFinite(this.progression.subWeapon)) {
            return Math.max(0, Math.min(3, Math.floor(this.progression.subWeapon) || 0));
        }
        // progression未設定環境: 本体武器のenhanceTierを直接参照
        if (this.currentSubWeapon && Number.isFinite(this.currentSubWeapon.enhanceTier)) {
            return Math.max(0, Math.min(3, this.currentSubWeapon.enhanceTier));
        }
        if (Number.isFinite(this.enhanceTier)) {
            return Math.max(0, Math.min(3, Math.floor(this.enhanceTier) || 0));
        }
        return 0;
    };

    PlayerClass.prototype.buildSpecialCloneSubWeaponOwner = function(index, inst = null) {
        const pos = this.specialClonePositions ? this.specialClonePositions[index] : null;
        if (!pos) return null;
        const cloneGroundY = typeof this.getSpecialCloneGroundYAtX === 'function'
            ? this.getSpecialCloneGroundYAtX(pos.x)
            : this.groundY;
        return {
            _specialCloneOwner: true,
            _specialCloneIndex: index,
            x: pos.x - this.width / 2,
            y: this.getSpecialCloneDrawY(pos.y),
            width: this.width,
            height: this.height,
            vx: 0,
            vy: pos.cloneVy || 0,
            groundY: cloneGroundY,
            facingRight: pos.facingRight,
            isGrounded: !(pos.jumping),
            isCrouching: this.isCrouching,
            isDashing: this.isDashing,
            isEnemy: false,
            speed: this.speed,
            motionTime: this.motionTime,
            attackMotionScale: this.attackMotionScale,
            subWeaponMotionScale: this.subWeaponMotionScale,
            progression: this.progression,
            getSubWeaponEnhanceTier: () => this.getCurrentSubWeaponEnhanceTier(),
            currentSubWeapon: inst,
            subWeaponAction: this.specialCloneSubWeaponActions ? this.specialCloneSubWeaponActions[index] : null,
            subWeaponTimer: this.specialCloneSubWeaponTimers ? (this.specialCloneSubWeaponTimers[index] || 0) : 0,
            forceSubWeaponRender: true,
            isXAttackBoostActive: () => false
        };
    };

    PlayerClass.prototype.syncSpecialCloneSubWeaponOwner = function(index, inst = null, resetPosition = false) {
        if (!Array.isArray(this.specialCloneSubWeaponOwners)) {
            this.specialCloneSubWeaponOwners = this.specialCloneSlots.map(() => null);
        }
        const fresh = this.buildSpecialCloneSubWeaponOwner(index, inst);
        if (!fresh) return null;
        let owner = this.specialCloneSubWeaponOwners[index];
        if (!owner || resetPosition) {
            owner = fresh;
            this.specialCloneSubWeaponOwners[index] = owner;
        } else {
            const odachiLocked = inst && inst.name === '大太刀' && inst.isAttacking && inst.hasImpacted;
            // Lv1-2: 本体の武器がぶら下がり中も分身のy位置をロック
            const playerOdachiLocked = !this.specialCloneAutoAiEnabled &&
                this.currentSubWeapon &&
                this.currentSubWeapon.name === '大太刀' &&
                this.currentSubWeapon.isAttacking &&
                this.currentSubWeapon.hasImpacted;
            const effectiveOdachiLocked = odachiLocked || playerOdachiLocked;
            owner.x = fresh.x;
            if (!effectiveOdachiLocked) {
                owner.y = fresh.y;
                owner.vx = fresh.vx;
                owner.vy = fresh.vy;
                owner.isGrounded = fresh.isGrounded;
            }
            owner.width = fresh.width;
            owner.height = fresh.height;
            owner.groundY = fresh.groundY;
            owner.facingRight = fresh.facingRight;
            owner.isCrouching = fresh.isCrouching;
            owner.isDashing = fresh.isDashing;
            owner.speed = fresh.speed;
            owner.motionTime = fresh.motionTime;
            owner.attackMotionScale = fresh.attackMotionScale;
            owner.subWeaponMotionScale = fresh.subWeaponMotionScale;
            owner.progression = fresh.progression;
            owner.getSubWeaponEnhanceTier = fresh.getSubWeaponEnhanceTier;
            owner.currentSubWeapon = inst;
            owner.subWeaponAction = fresh.subWeaponAction;
            owner.subWeaponTimer = fresh.subWeaponTimer;
            owner.forceSubWeaponRender = true;
        }
        if (inst) {
            inst.owner = owner;
        }
        return owner;
    };

    PlayerClass.prototype.triggerCloneSubWeapon = function(index) {
        if (this.specialCloneAutoAiEnabled) return;
        if (!Number.isFinite(index) || index < 0) return;
        if (!Array.isArray(this.specialCloneSlots) || index >= this.specialCloneSlots.length) return;
        if (Array.isArray(this.specialCloneAlive) && this.specialCloneAlive[index] === false) return;
        if (!this.currentSubWeapon) return;
        
        const actionName = this.getCloneSubWeaponActionName(this.currentSubWeapon);
        if (!actionName) return;
        const allowRestart = this.currentSubWeapon.name === '二刀流' ||
            this.currentSubWeapon.name === '鎖鎌' ||
            this.currentSubWeapon.name === '大太刀';
        const existingInst = this.specialCloneSubWeaponInstances && this.specialCloneSubWeaponInstances[index];
        const needsInstanceRefresh = !existingInst || existingInst.name !== this.currentSubWeapon.name;
        if (!allowRestart && this.specialCloneSubWeaponTimers[index] > 0 && !needsInstanceRefresh) return;
        this.specialCloneSubWeaponTimers[index] = this.getSubWeaponActionDurationMs(
            actionName,
            this.currentSubWeapon
        );
        this.specialCloneSubWeaponActions[index] = actionName;
        this.activateCloneSubWeaponInstance(
            index,
            this.getCloneSubWeaponAttackType(actionName, this.currentSubWeapon)
        );
    };

    PlayerClass.prototype.activateCloneSubWeaponInstance = function(index, overrideAttackType = null) {
        if (!this.currentSubWeapon || !this.specialCloneSubWeaponInstances) return;
        if (!Array.isArray(this.specialCloneSlots) || index < 0 || index >= this.specialCloneSlots.length) return;
        if (Array.isArray(this.specialCloneAlive) && this.specialCloneAlive[index] === false) return;
        const weaponName = this.currentSubWeapon.name;
        const attackType = overrideAttackType || this.currentSubWeapon.attackType || 'main';
        const recreateOnUse = weaponName === '鎖鎌' ||
            weaponName === '大太刀' ||
            (weaponName === '二刀流' && attackType === 'combined');
        if (recreateOnUse || !this.specialCloneSubWeaponInstances[index] || this.specialCloneSubWeaponInstances[index].name !== weaponName) {
            this.specialCloneSubWeaponInstances[index] = createSubWeapon(weaponName);
        }
        if (this.specialCloneSubWeaponInstances[index] && typeof this.specialCloneSubWeaponInstances[index].applyEnhanceTier === 'function') {
            this.specialCloneSubWeaponInstances[index].applyEnhanceTier(this.getCurrentSubWeaponEnhanceTier());
        }
        // refreshSubWeaponScaling() でスケール済みの range を本体武器から同期する
        // （createSubWeapon は base range で作成されるため適用漏れが生じる）
        const cloneInst = this.specialCloneSubWeaponInstances[index];
        if (cloneInst && this.currentSubWeapon && cloneInst.name === this.currentSubWeapon.name &&
            Number.isFinite(this.currentSubWeapon.range)) {
            cloneInst.range = this.currentSubWeapon.range;
        }
        if (this.specialCloneSubWeaponInstances[index]) {
            const inst = this.specialCloneSubWeaponInstances[index];
            const clonePos = this.specialClonePositions[index];
            if (!clonePos) return;
            const dummyClone = this.syncSpecialCloneSubWeaponOwner(index, inst, true);
            if (!dummyClone) return;
            if (weaponName === '二刀流') {
                if (Number.isFinite(this.currentSubWeapon.mainMotionSpeedScale)) {
                    inst.mainMotionSpeedScale = this.currentSubWeapon.mainMotionSpeedScale;
                }
                if (attackType === 'main' && Number.isFinite(this.currentSubWeapon.comboIndex)) {
                    const maxSteps = (this.currentSubWeapon.comboDamages || []).length || 5;
                    inst.comboIndex = (this.currentSubWeapon.comboIndex - 1 + maxSteps) % maxSteps;
                    inst.mainComboLinkTimer = this.currentSubWeapon.mainComboLinkTimer || 0;
                }
                // combined発動前に前回プロジェクタイルをクリア（2回目以降も飛翔斬撃を出すため）
                if (attackType === 'combined' && Array.isArray(inst.projectiles)) {
                    inst.projectiles.length = 0;
                    inst.pendingCombinedProjectile = null;
                }
                inst.use(dummyClone, attackType);
            } else if (weaponName === '手裏剣' || weaponName === '火薬玉') {
                inst.owner = dummyClone;
            } else {
                inst.use(dummyClone);
            }
            // 大太刀: use()がdummyCloneにジャンプを設定するので、クローンの物理状態に伝搬
            if (weaponName === '大太刀' && clonePos) {
                clonePos.jumping = true;
                clonePos.cloneVy = dummyClone.vy || -30;
            }
        }
    };

    PlayerClass.prototype.syncManualCloneSubWeaponUse = function() {
        if (this.specialCloneAutoAiEnabled) return;
        if (!this.currentSubWeapon || typeof this.getSubWeaponCloneOffsets !== 'function') return;
        const actionName = this.getCloneSubWeaponActionName(this.currentSubWeapon);
        if (!actionName || actionName === '二刀_Z') return;
        const cloneOffsets = this.getSubWeaponCloneOffsets();
        for (const clone of cloneOffsets) {
            this.triggerCloneSubWeapon(clone.index);
        }
    };

    PlayerClass.prototype.onSpecialCloneStarted = function() {
        this.specialCloneCombatStarted = true;
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => this.specialCloneSpawnInvincibleMs);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, index) => index * 30);
        
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
        this.specialClonePositions = anchors.map(a => ({
            x: a.x,
            y: a.y,
            facingRight: this.facingRight,
            prevX: a.x,
            jumping: false,
            cloneVy: 0,
            comboVx: 0
        }));

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneScarfNodes[i] || !this.specialCloneHairNodes[i]) {
                this.initCloneAccessoryNodes(i);
            }
        }
        this.specialCloneTargets = this.specialCloneSlots.map(() => null);
        this.specialCloneReturnToAnchor = this.specialCloneSlots.map(() => false);
        this.specialCloneComboSteps = this.specialCloneSlots.map(() => 0);
        this.specialCloneCurrentAttacks = this.specialCloneSlots.map(() => null);
        this.specialCloneAttackTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneComboResetTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSubWeaponActions = this.specialCloneSlots.map(() => null);
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneMirroredTrailProfiles = this.specialCloneSlots.map(() => null);
        this.specialCloneDualTrailAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneSubWeaponInstances = this.specialCloneSlots.map(() => null);
        this.specialCloneSubWeaponOwners = this.specialCloneSlots.map(() => null);

        // 戦闘開始時の煙もここでは生成せず、詠唱開始時のみに集約するか、
        // 少なくとも重複は避ける。詠唱終了時の煙は削除。
        // this.spawnSpecialSmoke('appear', this.getSpecialSmokeAnchors(true));
        
        // 分身の霧エフェクト軽量化用キャッシュ（オフスクリーンCanvas）
        this.initMistCache();
    };

    PlayerClass.prototype.initMistCache = function() {
        if (this.mistCacheCanvas) return;
        const size = 68; // 半径34 * 2
        this.mistCacheCanvas = document.createElement('canvas');
        this.mistCacheCanvas.width = size;
        this.mistCacheCanvas.height = size;
        const ctx = this.mistCacheCanvas.getContext('2d');
        const mist = ctx.createRadialGradient(size/2, size/2, 2, size/2, size/2, size/2);
        // 白・淡青のミスト（描画時にalphaをかけるためベースは不透明に近くする）
        mist.addColorStop(0, 'rgba(180, 214, 246, 1.0)');
        mist.addColorStop(1, 'rgba(180, 214, 246, 0.0)');
        ctx.fillStyle = mist;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
        ctx.fill();
    };

    PlayerClass.prototype.getSpecialSmokeAnchorByIndex = function(index) {
        const pos = this.specialClonePositions[index];
        const x = pos ? pos.x : (this.x + this.width / 2);
        const y = (
            this.specialCloneAutoAiEnabled &&
            this.specialCloneCombatStarted &&
            pos
        )
            ? pos.y
            : (this.y + this.height * 0.5);
        return { x, y };
    };

    PlayerClass.prototype.getSpecialSmokeAnchors = function(onlyAlive = false) {
        const anchors = [];
        if (Array.isArray(this.specialCloneSlots) && this.specialCloneSlots.length > 0) {
            for (let i = 0; i < this.specialCloneSlots.length; i++) {
                if (onlyAlive && Array.isArray(this.specialCloneAlive) && this.specialCloneAlive.length > i && !this.specialCloneAlive[i]) continue;
                anchors.push(this.getSpecialSmokeAnchorByIndex(i));
            }
        }
        if (anchors.length > 0) return anchors;
        return [{ x: this.x + this.width * 0.5, y: this.y + this.height * 0.5 }];
    };

    PlayerClass.prototype.initCloneAccessoryNodes = function(index) {
        const pos = this.specialClonePositions[index];
        if (!pos) return;

        // 詠唱中（specialCastTimer > 0）はLv3も本体に追従するため、本体の足元基準で初期化する。
        // 戦闘開始後のLv3はpos.yが地面基準固定値なのでそちらから算出。
        // Lv0〜2はthis.yがしゃがみ時にheight=HEIGHT/2分ずれるため、足元(this.y+this.height)から逆算。
        const isCastPhase = this.specialCastTimer > 0;
        const footY = (this.specialCloneAutoAiEnabled && !isCastPhase)
            ? (pos.y + PLAYER.HEIGHT * 0.38)  // Lv3戦闘中: pos.yは体中心なので足元を算出
            : (this.y + this.height);           // 詠唱中 or Lv0〜2: 本体の足元を使用
        const baseDrawY = footY - PLAYER.HEIGHT;
        const headY = baseDrawY + 16; // renderModel / renderSpecialCastPose の headY に合わせる

        const knotOffsetX = pos.facingRight ? -12 : 12;
        const anchorX = pos.x + knotOffsetX;
        const anchorY = headY - 2;

        const scarfNodes = [];
        const hairNodes = [];
        for (let i = 0; i < 9; i++) {
            // 全ノードをアンカー位置で束ねて初期化（初フレームに地面へ飛ばないよう）
            scarfNodes.push({ x: anchorX, y: anchorY });
            if (i < 8) {
                hairNodes.push({ x: anchorX, y: anchorY - 6 });
            }
        }
        this.specialCloneScarfNodes[index] = scarfNodes;
        this.specialCloneHairNodes[index] = hairNodes;
    };

    PlayerClass.prototype.updateSpecialCloneAi = function(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const scrollX = (window.game && window.game.scrollX) || 0;
        const screenWidth = 1280;
        const stage = (window.game && window.game.stage) ? window.game.stage : null;
        const stageObstacles = (stage && Array.isArray(stage.obstacles)) ? stage.obstacles : [];
        const stageHazards = [];
        if (stage) {
            if (Array.isArray(stage.traps)) stageHazards.push(...stage.traps);
            if (stageObstacles.length > 0) {
                for (const obs of stageObstacles) {
                    if (obs && !obs.isDestroyed) stageHazards.push(obs);
                }
            }
        }

        // スクロール速度を算出（カメラが動いた分だけ分身も見かけ上移動している）
        // this.vxはピクセル/フレーム単位なので、scrollDeltaをフレーム換算(÷deltaTime÷60)して合わせる
        const prevScrollX = (this._prevScrollX !== undefined) ? this._prevScrollX : scrollX;
        const scrollDeltaPx = scrollX - prevScrollX; // 今フレームのスクロール量（ピクセル）
        const scrollVxPerFrame = (deltaTime > 0) ? scrollDeltaPx / (deltaTime * 60) : 0;
        this._prevScrollX = scrollX;
        
        const enemies = stage
            ? stage.getAllEnemies().filter(e => {
                if (!e.isAlive || e.isDying) return false;
                const ex = e.x + e.width / 2;
                return ex >= scrollX - 50 && ex <= scrollX + screenWidth + 50;
            }) 
            : [];
            
        const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());

        for (let i = 0; i < this.specialCloneSlots.length; i++) {
            if (!this.specialCloneAlive[i]) continue;
            
            const pos = this.specialClonePositions[i];
            const anchor = anchors[i];
            const cloneRestY = anchor.y;
            const prevY = pos.y;

            const frameStartX = pos.x;

            let target = this.specialCloneTargets[i];

            if (!target || !target.isAlive || target.isDying) {
                target = this.findNearestEnemy(pos.x, pos.y, enemies, 500);
                this.specialCloneTargets[i] = target;
            }

            const anchorDist = Math.abs(anchor.x - pos.x);
            if (target && anchorDist > 300) {
                target = null;
                this.specialCloneTargets[i] = null;
            }

            if (target) {
                const attackRange = 120;
                const targetX = target.x + target.width / 2;
                const dx = targetX - pos.x;
                const distX = Math.abs(dx);
                if (distX > attackRange * 1.5) {
                    const speed = (this.speed || 5) * 1.55;
                    pos.x += Math.sign(dx) * speed * deltaTime * 60;
                    pos.facingRight = dx > 0;
                } else {
                    pos.facingRight = dx > 0;
                    const canAttack = this.specialCloneAttackTimers[i] <= 0
                        && this.specialCloneSubWeaponTimers[i] <= 0;
                    if (canAttack) {
                        this.triggerCloneAttack(i);
                    }
                }
                this.specialCloneReturnToAnchor[i] = false;
            } else {
                const dx = anchor.x - pos.x;
                if (Math.abs(dx) > 300) {
                    pos.x = anchor.x;
                    pos.facingRight = this.facingRight;
                    this.initCloneAccessoryNodes(i);
                } else if (Math.abs(dx) > 2) {
                    const chaseSpeed = Math.max(
                        (this.speed || 5) * 2.0,
                        Math.abs(dx) / Math.max(0.016, deltaTime) * 0.7
                    );
                    const step = Math.sign(dx) * Math.min(Math.abs(dx), chaseSpeed * deltaTime * 60);
                    pos.x += step;
                    if (Math.abs(dx) > 6) {
                        pos.facingRight = dx > 0;
                    }
                } else {
                    pos.x = anchor.x;
                    pos.facingRight = this.facingRight;
                }
                this.specialCloneReturnToAnchor[i] = true;
            }

            // Lv3分身の通常Zコンボは本体同様にアクロバットな軌道で動かす
            const cloneAttackTimerMs = this.specialCloneAttackTimers[i] || 0;
            const cloneSubTimerMs = this.specialCloneSubWeaponTimers[i] || 0;
            const cloneSubAction = this.specialCloneSubWeaponActions[i] || null;
            const cloneDualZActive = cloneSubAction === '二刀_Z' && cloneSubTimerMs > 0;
            if (cloneAttackTimerMs > 0 && !cloneDualZActive) {
                const comboStep = this.specialCloneComboSteps[i] || 1;
                const attackProfile = this.specialCloneCurrentAttacks[i] || this.getComboAttackProfileByStep(comboStep);
                const durationMs = Math.max(1, attackProfile.durationMs || PLAYER.ATTACK_COOLDOWN);
                const progress = Number.isFinite(attackProfile.motionElapsedMs)
                    ? Math.max(0, Math.min(1, attackProfile.motionElapsedMs / durationMs))
                    : Math.max(0, Math.min(1, 1 - (cloneAttackTimerMs / durationMs)));
                const direction = pos.facingRight ? 1 : -1;
                const baseSpeed = Math.max(1, this.speed || PLAYER.SPEED || 5);
                let moveVx = Number.isFinite(pos.comboVx) ? pos.comboVx : 0;
                let forceAirborne = false;

                if (!pos.jumping) {
                    moveVx *= 0.965;
                }

                if (comboStep === 1) {
                    moveVx = moveVx * 0.62;
                    if (moveVx * direction < 0) moveVx = 0;
                    if (Math.abs(moveVx) < 0.18) moveVx = 0;
                    if (!pos.jumping) {
                        pos.cloneVy = 0;
                    } else {
                        pos.cloneVy = Math.max(pos.cloneVy || 0, 1.2);
                    }
                } else if (comboStep === 2) {
                    if (!pos.jumping) {
                        pos.cloneVy = 0;
                    } else {
                        pos.cloneVy = Math.min(pos.cloneVy || 0, -1.2);
                    }
                } else if (comboStep === 3) {
                    forceAirborne = true;
                } else if (comboStep === 4) {
                    const z4HeightScale = 0.96;
                    if (progress < 0.42) {
                        const t = progress / 0.42;
                        moveVx = moveVx * 0.52 + direction * baseSpeed * (0.2 - t * 0.08);
                        pos.cloneVy = (-20.4 + t * 2.6) * z4HeightScale;
                    } else if (progress < 0.9) {
                        const t = (progress - 0.42) / 0.48;
                        const backSpeed = baseSpeed * (0.66 + t * 0.94);
                        const holdVy = (-0.9 + t * 1.18) * z4HeightScale;
                        moveVx = moveVx * 0.4 + (-direction * backSpeed) * 0.6;
                        pos.cloneVy = Math.max(-1.0, Math.min(0.95, holdVy));
                    } else {
                        moveVx *= 0.78;
                        pos.cloneVy = Math.min(pos.cloneVy || 0, 0.55);
                    }
                    if (progress < 0.72) {
                        const riseLockT = Math.max(0, Math.min(1, progress / 0.72));
                        const minRiseVy = (-18.8 + riseLockT * 14.8) * z4HeightScale;
                        pos.cloneVy = Math.min(pos.cloneVy || 0, minRiseVy);
                    }
                    forceAirborne = true;
                } else if (comboStep === 5) {
                    if (progress < 0.26) {
                        moveVx *= 0.82;
                        pos.cloneVy = Math.min(pos.cloneVy || 0, -1.2);
                    } else if (progress < 0.76) {
                        const fallT = (progress - 0.26) / 0.5;
                        moveVx = moveVx * 0.7 + direction * baseSpeed * 0.08;
                        pos.cloneVy = (pos.cloneVy || 0) * 0.34 + (9.8 + fallT * 19.8) * 0.66;
                    } else {
                        moveVx *= 0.64;
                        if (pos.jumping) {
                            pos.cloneVy = Math.max(pos.cloneVy || 0, 13.4);
                        }
                    }
                    forceAirborne = true;
                }

                pos.comboVx = moveVx;
                pos.x += moveVx * deltaTime * 60;
                if (forceAirborne) {
                    pos.jumping = true;
                }
            }

            // Lv3分身の自律ジャンプ（トラップ＋障害物回避）
            if (!pos.jumping) pos.jumping = false;
            if (!pos.cloneVy) pos.cloneVy = 0;

            let shouldJump = false;
            if (stageHazards.length > 0) {
                const frameDx = pos.x - frameStartX;
                const moveDir = Math.abs(frameDx) > 0.5 ? Math.sign(frameDx) : (pos.facingRight ? 1 : -1);

                const cloneHalfW = this.width * 0.4;
                for (const hazard of stageHazards) {
                    if (!hazard || hazard.x === undefined) continue;

                    const hLeft = hazard.x;
                    const hRight = hazard.x + (hazard.width || 30);
                    const hTop = (hazard.y !== undefined) ? hazard.y : (this.groundY - (hazard.height || 30));
                    const hBottom = hTop + (hazard.height || 30);

                    if (hBottom < this.groundY - 60) continue;

                    const cloneCenterX = pos.x;
                    const lookAhead = 120;
                    let isAhead = false;
                    if (moveDir > 0) {
                        isAhead = hLeft > (cloneCenterX - cloneHalfW) && hLeft < (cloneCenterX + lookAhead);
                    } else {
                        isAhead = hRight < (cloneCenterX + cloneHalfW) && hRight > (cloneCenterX - lookAhead);
                    }

                    if (!isAhead) continue;

                    const cloneFootY = pos.y + PLAYER.HEIGHT * 0.38;
                    if (hTop < cloneFootY) {
                        shouldJump = true;
                        break;
                    }
                }
            }

            if (shouldJump && !pos.jumping) {
                pos.jumping = true;
                pos.cloneVy = -12;
            }

            if (pos.jumping) {
                pos.cloneVy += 0.6;
                pos.y += pos.cloneVy * deltaTime * 60;
                if (pos.y >= cloneRestY) {
                    pos.y = cloneRestY;
                    pos.jumping = false;
                    pos.cloneVy = 0;
                }
            } else {
                pos.y = cloneRestY;
            }

            this.constrainSpecialClonePosition(pos);

            if (Math.abs(pos.y - prevY) > 40) {
                this.initCloneAccessoryNodes(i);
                pos.prevX = pos.x;
            }

            const frameDeltaX = pos.x - frameStartX;
            pos.renderVx = frameDeltaX / Math.max(0.016, deltaTime * 60);

            // 分身独自のlegPhase/legAngleを毎フレーム更新（本体/分身で共通式）
            const cloneLegMotion = this.updateLegLocomotion({
                legPhase: pos.legPhase,
                legAngle: pos.legAngle,
                deltaMs,
                horizontalSpeed: pos.renderVx || 0,
                isGrounded: !pos.jumping,
                isAttacking: (this.specialCloneAttackTimers[i] || 0) > 0,
                verticalSpeed: pos.cloneVy || 0,
                runBaseFreq: 0.018,
                runAmplitude: 0.86
            });
            pos.legPhase = cloneLegMotion.legPhase;
            pos.legAngle = cloneLegMotion.legAngle;

            if (this.specialCloneAttackTimers[i] > 0) {
                const cloneAttack = this.specialCloneCurrentAttacks[i];
                if (cloneAttack) {
                    const duration = Math.max(1, cloneAttack.durationMs || PLAYER.ATTACK_COOLDOWN);
                    const motionCapMs = cloneAttack.comboStep === 4
                        ? Math.min(deltaMs, 1000 / 58)
                        : deltaMs;
                    const prevMotionElapsed = Number.isFinite(cloneAttack.motionElapsedMs) ? cloneAttack.motionElapsedMs : 0;
                    cloneAttack.motionElapsedMs = Math.max(0, Math.min(duration, prevMotionElapsed + motionCapMs));
                }
                this.specialCloneAttackTimers[i] -= deltaMs;
                if (this.specialCloneAttackTimers[i] <= 0) {
                    this.specialCloneAttackTimers[i] = 0;
                    this.specialCloneCurrentAttacks[i] = null;
                }
            }
            if (this.specialCloneSubWeaponTimers[i] > 0) {
                this.specialCloneSubWeaponTimers[i] -= deltaMs;
                if (this.specialCloneSubWeaponTimers[i] <= 0) {
                    this.specialCloneSubWeaponTimers[i] = 0;
                    this.specialCloneSubWeaponActions[i] = null;
                }
            }
            if (this.specialCloneAttackTimers[i] <= 0 && this.specialCloneComboResetTimers[i] > 0) {
                this.specialCloneComboResetTimers[i] -= deltaMs;
                if (this.specialCloneComboResetTimers[i] <= 0) {
                    this.specialCloneComboResetTimers[i] = 0;
                    this.specialCloneComboSteps[i] = 0;
                    this.specialCloneCurrentAttacks[i] = null;
                }
            }

            const rawRenderVx = pos.renderVx || 0;
            // スクロール時にrenderVxが0になる場合は本体のvxを代わりに使う
            const effectiveVx = Math.abs(rawRenderVx) >= Math.abs(this.vx) ? rawRenderVx : this.vx;
            const cloneVx = Math.max(-this.speed * 2.5, Math.min(this.speed * 2.5, effectiveVx));
            pos.prevX = pos.x;

            const cloneFootY = this.getSpecialCloneFootY(pos.y);
            this.updateSpecialCloneAccessoryNodes(i, pos, deltaTime, {
                cloneVx,
                motionTime: this.motionTime,
                isMoving: Math.abs(cloneVx) > 0.5,
                drawX: pos.x - this.width * 0.5,
                footY: cloneFootY,
                height: this.height,
                isDashing: false,
                isCrouching: false,
                legPhase: this.motionTime * 0.012
            });
        }
    };

    PlayerClass.prototype.constrainSpecialClonePosition = function(pos) {
        if (!pos) return;
        const stage = (window.game && window.game.stage) ? window.game.stage : null;
        const stageObstacles = (stage && Array.isArray(stage.obstacles)) ? stage.obstacles : [];
        if (stageObstacles.length <= 0) return;

        const cloneHalfW = this.width * 0.5 + 6;
        const cloneDrawY = this.getSpecialCloneDrawY(pos.y);
        const cloneBottom = cloneDrawY + this.height;
        const cloneTop = cloneDrawY;

        for (const obs of stageObstacles) {
            if (!obs || obs.isDestroyed || obs.type !== 'rock' || obs.x === undefined) continue;
            const cloneLeft = pos.x - cloneHalfW;
            const cloneRight = pos.x + cloneHalfW;
            const obsLeft = obs.x;
            const obsRight = obs.x + (obs.width || 30);
            const obsTop = (obs.y !== undefined) ? obs.y : (this.groundY - (obs.height || 30));
            const obsBottom = obsTop + (obs.height || 30);
            if (
                cloneRight > obsLeft &&
                cloneLeft < obsRight &&
                cloneBottom > obsTop + 6 &&
                cloneTop < obsBottom - 6
            ) {
                const overlapLeft = cloneRight - obsLeft;
                const overlapRight = obsRight - cloneLeft;
                if (overlapLeft < overlapRight) {
                    pos.x -= overlapLeft;
                } else {
                    pos.x += overlapRight;
                }
            }
        }
    };

    PlayerClass.prototype.findNearestEnemy = function(x, y, enemies, maxDist) {
        let bestTarget = null;
        let bestDistSq = maxDist * maxDist;
        for (const enemy of enemies) {
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const ds = Math.pow(ex - x, 2) + Math.pow(ey - y, 2);
            if (ds < bestDistSq) {
                bestDistSq = ds;
                bestTarget = enemy;
            }
        }
        return bestTarget;
    };

    PlayerClass.prototype.isSpecialCloneCombatActive = function() {
        return this.isUsingSpecial && this.specialCloneCombatStarted && this.specialCastTimer <= 0 && this.getActiveSpecialCloneCount() > 0;
    };

    PlayerClass.prototype.getActiveSpecialCloneCount = function() {
        return this.specialCloneAlive.reduce((acc, alive) => acc + (alive ? 1 : 0), 0);
    };

    PlayerClass.prototype.getSpecialCloneAnchorY = function() {
        const mirrorPlayerMotion = !this.specialCloneAutoAiEnabled || this.specialCastTimer > 0;
        const h = Number.isFinite(this.height) ? this.height : PLAYER.HEIGHT;
        if (mirrorPlayerMotion) {
            return this.getFootY() - h * 0.38;
        }
        return this.getSpecialCloneAnchorYAtX(this.x + this.width * 0.5);
    };

    PlayerClass.prototype.getSpecialCloneGroundYAtX = function(worldX = this.x + this.width * 0.5) {
        const stage = (window.game && window.game.stage) ? window.game.stage : null;
        if (stage && typeof stage.getStairGroundY === 'function') {
            return stage.getStairGroundY(worldX);
        }
        return this.groundY;
    };

    PlayerClass.prototype.getSpecialCloneAnchorYAtX = function(worldX = this.x + this.width * 0.5) {
        const h = Number.isFinite(this.height) ? this.height : PLAYER.HEIGHT;
        return this.getSpecialCloneGroundYAtX(worldX) + LANE_OFFSET - h * 0.38;
    };

    PlayerClass.prototype.getSpecialCloneSpacing = function() {
        const baseSpacing = 180;
        return this.characterType === 'shogun'
            ? Math.round(baseSpacing * 1.2)
            : baseSpacing;
    };

    PlayerClass.prototype.getSpecialCloneDrawY = function(anchorY) {
        const h = Number.isFinite(this.height) ? this.height : PLAYER.HEIGHT;
        return anchorY - h * 0.62;
    };

    PlayerClass.prototype.getSpecialCloneFootY = function(anchorY) {
        const h = Number.isFinite(this.height) ? this.height : PLAYER.HEIGHT;
        return anchorY + h * 0.38;
    };

    PlayerClass.prototype.getSpecialCloneDurabilityPerUnit = function() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? Math.max(0, Math.min(3, this.progression.specialClone))
            : 0;
        return tier >= 3 ? this.specialCloneDurabilityLv3 : 2;
    };

    PlayerClass.prototype.getSpecialCloneAnchors = function() {
        if (!this.specialCloneCombatStarted) {
            return this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
        }

        // 戦闘開始後は、AIによって更新された個別座標を返す
        return this.specialCloneSlots.map((unit, index) => {
            const pos = this.specialClonePositions[index] || { x: this.x, y: this.y, facingRight: this.facingRight };
            return {
                x: pos.x,
                y: pos.y,
                facingRight: pos.facingRight,
                alpha: this.specialCloneAlive[index] ? 1.0 : 0,
                index
            };
        });
    };

    PlayerClass.prototype.calculateSpecialCloneAnchors = function(centerX, centerY) {
        const spacing = typeof this.getSpecialCloneSpacing === 'function'
            ? this.getSpecialCloneSpacing()
            : (this.specialCloneSpacing || 180);
        // Lv1-2はプレイヤー追従（centerY）を使用し、Lv3+のみ地面ベースのY座標を使用する
        const useCloneGround = this.specialCloneCombatStarted && this.specialCastTimer <= 0 && this.specialCloneAutoAiEnabled;
        const resolveY = (x, unit) => {
            return useCloneGround && typeof this.getSpecialCloneAnchorYAtX === 'function'
                ? this.getSpecialCloneAnchorYAtX(x)
                : centerY;
        };
        const anchors = this.specialCloneSlots.map((unit, index) => ({
            x: centerX + unit * spacing,
            y: resolveY(centerX + unit * spacing, unit),
            facingRight: this.facingRight,
            alpha: this.specialCloneAlive[index] ? 1.0 : 0,
            index
        }));
        const displayOrder = this.getSpecialCloneDisplayOrder();
        const aliveIndices = displayOrder.filter((index) => this.specialCloneAlive[index]);
        const activeUnits = this.getSpecialCloneActiveLayout(aliveIndices.length);

        for (let i = 0; i < aliveIndices.length; i++) {
            const index = aliveIndices[i];
            const unit = activeUnits[i];
            const x = centerX + unit * spacing;
            anchors[index] = {
                x,
                y: resolveY(x, unit),
                facingRight: this.facingRight,
                alpha: 1.0,
                index
            };
        }

        return anchors;
    };

    PlayerClass.prototype.getSpecialCloneOffsets = function() {
        if (!this.isSpecialCloneCombatActive()) return [];
        const offsets = [];
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height * 0.55;

        for (let index = 0; index < this.specialCloneSlots.length; index++) {
            if (!this.specialCloneAlive[index]) continue;
            const pos = this.specialClonePositions[index];
            if (!pos) continue;
            offsets.push({
                index,
                dx: pos.x - centerX,
                dy: pos.y - centerY
            });
        }
        return offsets;
    };

    PlayerClass.prototype.getSubWeaponCloneOffsets = function() {
        if (this.specialCloneAutoAiEnabled) return [];
        return this.getSpecialCloneOffsets();
    };

    PlayerClass.prototype.consumeSpecialClone = function(index = null) {
        if (!this.isUsingSpecial) return false;
        let consumeIndex = index;
        if (consumeIndex === null || !this.specialCloneAlive[consumeIndex]) {
            consumeIndex = this.specialCloneAlive.findIndex((alive) => alive);
            if (consumeIndex === -1) return false;
        }
        if ((this.specialCloneInvincibleTimers[consumeIndex] || 0) > 0) return false;

        const baseDurability = this.getSpecialCloneDurabilityPerUnit();
        if (!Array.isArray(this.specialCloneDurability) || this.specialCloneDurability.length !== this.specialCloneSlots.length) {
            this.specialCloneDurability = this.specialCloneSlots.map(() => baseDurability);
        }
        const currentDurability = Math.max(1, Number(this.specialCloneDurability[consumeIndex]) || baseDurability);
        const nextDurability = currentDurability - 1;
        if (nextDurability > 0) {
            this.specialCloneDurability[consumeIndex] = nextDurability;
            // 多段接触で即蒸発しないよう、被弾後の短い無敵を付与
            this.specialCloneInvincibleTimers[consumeIndex] = this.specialCloneHitInvincibleMs;
            return true;
        }

        this.specialCloneAlive[consumeIndex] = false;
        this.specialCloneInvincibleTimers[consumeIndex] = 0;
        this.specialCloneDurability[consumeIndex] = 0;
        this.spawnSpecialSmoke('vanish', [this.getSpecialSmokeAnchorByIndex(consumeIndex)]);
        if (this.getActiveSpecialCloneCount() <= 0) {
            this.isUsingSpecial = false;
            this.specialCloneCombatStarted = false;
            this.specialCastTimer = 0;
            this.spawnSpecialSmoke('vanish');
            this.resetVisualTrails();
        }
        return true;
    };

    PlayerClass.prototype.spawnSpecialSmoke = function(mode = 'appear', fixedAnchors = null) {
        const isAppear = mode === 'appear';
        const lifeBase = isAppear ? 560 : 320;
        const puffCount = isAppear ? 16 : 10;
        // fixedAnchors があればそれを使用、なければ自分自身の位置を配列として使用
        const anchors = fixedAnchors || [{ x: this.x + this.width / 2, y: this.y + this.height / 2 }];
        for (const anchor of anchors) {
            for (let index = 0; index < puffCount; index++) {
                const angle = (Math.PI * 2 * index) / puffCount + Math.random() * 0.48;
                const speed = isAppear ? (0.58 + Math.random() * 0.86) : (0.62 + Math.random() * 1.2);
                const maxLife = lifeBase + Math.random() * 180;
                const spreadX = isAppear ? (10 + Math.random() * 18) : (6 + Math.random() * 12);
                const spreadY = isAppear ? (10 + Math.random() * 20) : (4 + Math.random() * 10);
                this.specialSmoke.push({
                    x: anchor.x + Math.cos(angle) * spreadX,
                    y: anchor.y + Math.sin(angle) * spreadY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 0.3,
                    life: maxLife,
                    maxLife,
                    radius: isAppear ? (12 + Math.random() * 14) : (7 + Math.random() * 10),
                    mode,
                    rot: Math.random() * Math.PI * 2,
                    spin: (Math.random() - 0.5) * 0.085,
                    wobbleAmp: isAppear ? (0.2 + Math.random() * 0.46) : (0.12 + Math.random() * 0.36),
                    wobbleFreq: 0.007 + Math.random() * 0.017,
                    ringStart: 0.2 + Math.random() * 0.24,
                    hasSpark: Math.random() < 0.38
                });
            }
        }
        if (this.specialSmoke.length > 260) {
            this.specialSmoke.splice(0, this.specialSmoke.length - 260);
        }
    };

    PlayerClass.prototype.rebuildSpecialCloneSlots = function() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? Math.max(0, Math.min(3, this.progression.specialClone))
            : 0;
        const count = this.getSpecialCloneCountByTier(tier);
        const prevCount = this.specialCloneSlots ? this.specialCloneSlots.length : 0;
        
        this.specialCloneSlots = this.buildCloneSlotLayout(count);
        this.specialCloneSpacing = typeof this.getSpecialCloneSpacing === 'function'
            ? this.getSpecialCloneSpacing()
            : 180;
        this.specialCloneAutoAiEnabled = (tier >= 3);
        
        const isActive = this.isUsingSpecial;
        this.specialCloneAlive = this.specialCloneSlots.map(() => isActive);
        
        // 配列の初期化（以前の値を引き継ぐのではなく、新しいカウントでクリア）
        this.specialCloneInvincibleTimers = this.specialCloneSlots.map(() => isActive ? 1000 : 0);
        this.specialCloneAutoCooldowns = this.specialCloneSlots.map((_, i) => isActive ? i * 40 : 0);
        
        const durability = this.getSpecialCloneDurabilityPerUnit();
        this.specialCloneDurability = this.specialCloneSlots.map(() => isActive ? durability : 0);
        
        this.specialCloneSlashTrailPoints = this.specialCloneSlots.map(() => []);
        this.specialCloneSlashTrailSampleTimers = this.specialCloneSlots.map(() => 0);
        this.specialCloneSlashTrailBoostAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneMirroredTrailProfiles = this.specialCloneSlots.map(() => null);
        this.specialCloneDualTrailAnchors = this.specialCloneSlots.map(() => null);
        this.specialCloneSubWeaponInstances = this.specialCloneSlots.map(() => null);
        this.specialCloneSubWeaponOwners = this.specialCloneSlots.map(() => null);
        this.specialCloneScarfNodes = this.specialCloneSlots.map(() => null);
        this.specialCloneHairNodes = this.specialCloneSlots.map(() => null);

        // 位置情報の再構築
        if (isActive) {
            const anchors = this.calculateSpecialCloneAnchors(this.x + this.width / 2, this.getSpecialCloneAnchorY());
            this.specialClonePositions = anchors.map(a => ({
                x: a.x, y: a.y, facingRight: this.facingRight, prevX: a.x,
                cloneVy: 0, jumping: false, legPhase: 0, legAngle: 0
            }));
            // アクセサリノードの初期化
            for (let i = 0; i < this.specialCloneSlots.length; i++) {
                this.initCloneAccessoryNodes(i);
            }
        } else {
            this.specialClonePositions = this.specialCloneSlots.map(() => null);
        }
    };

    PlayerClass.prototype.getSpecialCloneCountByTier = function(tier) {
        const clampedTier = Math.max(0, Math.min(3, tier));
        if (clampedTier <= 0) return 1;
        if (clampedTier === 1) return 2;
        return 4;
    };

    PlayerClass.prototype.getSpecialCloneCount = function() {
        const tier = this.progression && Number.isFinite(this.progression.specialClone)
            ? this.progression.specialClone
            : 0;
        return this.getSpecialCloneCountByTier(tier);
    };

    PlayerClass.prototype.buildCloneSlotLayout = function(count) {
        if (count <= 1) return [1];
        if (count === 2) return [-1, 1];
        if (count === 3) return [-1, 1, -2];
        return [-2, -1, 1, 2];
    };

    PlayerClass.prototype.getSpecialCloneDisplayOrder = function() {
        const count = Array.isArray(this.specialCloneSlots) ? this.specialCloneSlots.length : 0;
        if (count <= 1) return [0];
        if (count === 2) return [1, 0];
        return [3, 1, 0, 2].filter((index) => index < count);
    };

    PlayerClass.prototype.getSpecialCloneActiveLayout = function(count) {
        if (count <= 1) return [1];
        if (count === 2) return [-1, 1];
        if (count === 3) return [-1, 1, 2];
        return [-2, -1, 1, 2];
    };

    PlayerClass.prototype.canCloneAutoStrike = function(index) {
        if (!this.specialCloneAutoAiEnabled) return false;
        if (!this.specialCloneAlive[index]) return false;
        return (this.specialCloneAutoCooldowns[index] || 0) <= 0;
    };

    PlayerClass.prototype.resetCloneAutoStrikeCooldown = function(index) {
        if (!Number.isFinite(index)) return;
        if (!Array.isArray(this.specialCloneAutoCooldowns)) return;
        if (index < 0 || index >= this.specialCloneAutoCooldowns.length) return;
        this.specialCloneAutoCooldowns[index] = this.specialCloneAutoStrikeCooldownMs;
    };

    /**
     * Lv3 AI分身がサブ武器（忍術）を独立発動する
     * triggerCloneAttackとは別系統のため、近接攻撃中でも発動可能
     */
    PlayerClass.prototype.useNinjutsu = function(cloneIndex, weaponName, direction) {
        if (!this.currentSubWeapon || this.currentSubWeapon.name !== weaponName) return;
        if ((this.specialCloneSubWeaponTimers[cloneIndex] || 0) > 0) return;
        const pos = this.specialClonePositions && this.specialClonePositions[cloneIndex];
        if (!pos) return;

        pos.facingRight = direction > 0;
        this.activateCloneSubWeaponInstance(cloneIndex);

        const actionName = (weaponName === '火薬玉') ? 'throw' :
                           (weaponName === '手裏剣') ? 'throw' : weaponName;
        const durationMs = (typeof this.getSubWeaponActionDurationMs === 'function')
            ? this.getSubWeaponActionDurationMs(actionName, this.currentSubWeapon)
            : 300;
        this.specialCloneSubWeaponTimers[cloneIndex] = Math.max(1, durationMs);
        this.specialCloneSubWeaponActions[cloneIndex] = actionName;
        this.resetCloneAutoStrikeCooldown(cloneIndex);
    };
}
