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
                attackPower: player.attackPower || 1,
                unlockedSkills: game.shop ? Array.from(game.shop.purchasedSkills) : [],
                currentSubWeapon: player.currentSubWeapon ? player.currentSubWeapon.name : null
            },
            progress: {
                currentStage: currentStage,
                unlockedWeapons: unlockedWeapons,
                stageEquip: player.stageEquip || {} // 各ステージの装備武器名を保持
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
            console.log('Game saved successfully');
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
                console.log('No save data found');
                return null;
            }
            
            const saveData = JSON.parse(saveString);
            
            // バージョンチェック
            if (saveData.version !== 1) {
                console.warn('Save data version mismatch');
                return null;
            }
            
            this.currentSave = saveData;
            console.log('Game loaded successfully');
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
        console.log('Save data deleted');
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
        player.attackPower = saveData.player.attackPower || 1;
        if (saveData.player.unlockedSkills) {
            saveData.player.unlockedSkills.forEach(skillId => game.shop.purchasedSkills.add(skillId));
        }

        // サブ武器の復元
        player.pendingSubWeaponId = saveData.player.currentSubWeapon;
        player.stageEquip = saveData.progress.stageEquip || {};
        
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
