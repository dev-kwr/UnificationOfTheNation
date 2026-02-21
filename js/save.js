// ============================================
// Unification of the Nation - セーブ/ロード機能
// ============================================

import { game } from './game.js';

const SAVE_KEY = 'ninjaActionSave';
const MAX_MONEY = 9999;

function clampMoney(amount) {
    const numeric = Number.isFinite(amount) ? amount : 0;
    return Math.max(0, Math.min(MAX_MONEY, Math.floor(numeric)));
}

export class SaveManager {
    constructor() {
        this.currentSave = null;
    }
    
    // セーブデータの構造
    createSaveData(player, currentStage, unlockedWeapons = []) {
        return {
            version: 1,
            timestamp: Date.now(),
            player: {
                level: player.level,
                exp: player.exp,
                expToNext: player.expToNext,
                maxHp: player.maxHp,
                money: clampMoney(player.money),
                maxJumps: player.maxJumps || 2,
                attackPower: player.attackPower || 0,
                progression: {
                    normalCombo: player.progression?.normalCombo || 0,
                    subWeapon: player.progression?.subWeapon || 0,
                    specialClone: player.progression?.specialClone || 0,
                    ninjutsuUnlockStage: player.progression?.ninjutsuUnlockStage || 0
                },
                unlockedSkills: game.shop ? Array.from(game.shop.purchasedSkills) : [],
                purchasedUpgrades: game.shop ? { ...game.shop.purchasedUpgrades } : { hp_up: 0, attack_up: 0 },
                currentSubWeapon: player.currentSubWeapon ? player.currentSubWeapon.name : null
            },
            progress: {
                currentStage: currentStage,
                unlockedWeapons: unlockedWeapons || [],
                stageEquip: Object.fromEntries(
                    Object.entries(player.stageEquip || {})
                ) // 各ステージの装備武器名を保持
            }
        };
    }
    
    // セーブ
    save(player, currentStage, unlockedWeapons = []) {
        try {
            const saveData = this.createSaveData(player, currentStage, unlockedWeapons);
            const saveString = JSON.stringify(saveData);
            localStorage.setItem(SAVE_KEY, saveString);
            this.currentSave = saveData;
            return true;
        } catch (e) {
            console.error('Failed to save game:', e);
            return false;
        }
    }
    
    // ロード
    load() {
        try {
            const saveString = localStorage.getItem(SAVE_KEY);
            if (!saveString) {
                return null;
            }
            
            const saveData = JSON.parse(saveString);
            
            // バージョンチェック
            if (saveData.version !== 1) {
                console.warn('Save data version mismatch');
                return null;
            }
            
            this.currentSave = saveData;
            return saveData;
        } catch (e) {
            console.error('Failed to load game:', e);
            return null;
        }
    }
    
    // セーブデータが存在するか
    hasSave() {
        return localStorage.getItem(SAVE_KEY) !== null;
    }
    
    // セーブデータを削除
    deleteSave() {
        localStorage.removeItem(SAVE_KEY);
        this.currentSave = null;
    }
    
    // プレイヤーにセーブデータを適用
    applyToPlayer(player, saveData) {
        if (!saveData || !saveData.player) return false;
        
        player.level = saveData.player.level;
        player.exp = saveData.player.exp;
        player.expToNext = saveData.player.expToNext;
        player.maxHp = saveData.player.maxHp;
        player.hp = player.maxHp;
        if (typeof player.setMoney === 'function') {
            player.setMoney(saveData.player.money);
        } else {
            player.money = clampMoney(saveData.player.money);
        }
        
        // 追加ステータスの復元
        player.maxJumps = saveData.player.maxJumps || 2;
        player.attackPower = saveData.player.attackPower || 0;
        if (saveData.player.progression) {
            player.progression = {
                normalCombo: Math.max(0, Math.min(3, saveData.player.progression.normalCombo || 0)),
                subWeapon: Math.max(0, Math.min(3, saveData.player.progression.subWeapon || 0)),
                specialClone: Math.max(0, Math.min(3, saveData.player.progression.specialClone || 0)),
                ninjutsuUnlockStage: Math.max(0, Math.min(3, saveData.player.progression.ninjutsuUnlockStage || 0))
            };
            if (typeof player.rebuildSpecialCloneSlots === 'function') player.rebuildSpecialCloneSlots();
            if (typeof player.refreshSubWeaponScaling === 'function') player.refreshSubWeaponScaling();
        }
        if (saveData.player.unlockedSkills) {
            saveData.player.unlockedSkills.forEach(skillId => game.shop.purchasedSkills.add(skillId));
        }
        if (saveData.player.purchasedUpgrades && game.shop) {
            game.shop.purchasedUpgrades = { ...saveData.player.purchasedUpgrades };
        }

        // サブ武器の復元
        player.pendingSubWeaponId = saveData.player.currentSubWeapon;
        player.stageEquip = Object.fromEntries(
            Object.entries(saveData.progress?.stageEquip || {})
        );
        
        return true;
    }
    
    // セーブ情報の概要を取得
    getSaveInfo() {
        const saveData = this.load();
        if (!saveData) return null;
        
        const date = new Date(saveData.timestamp);
        return {
            stage: saveData.progress.currentStage,
            level: saveData.player.level,
            money: clampMoney(saveData.player.money),
            date: date.toLocaleDateString() + ' ' + date.toLocaleTimeString(),
            unlockedWeapons: saveData.progress.unlockedWeapons,
        };
    }
}

// シングルトンインスタンス
export const saveManager = new SaveManager();
