// ============================================
// Unification of the Nation - 当たり判定
// ============================================

// 矩形同士の当たり判定
export function rectIntersects(a, b) {
    if (!a || !b) return false;
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

// プレイヤーと敵の当たり判定
export function checkPlayerEnemyCollision(player, enemy) {
    const playerRect = {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height
    };
    
    const enemyRect = {
        x: enemy.x,
        y: enemy.y,
        width: enemy.width,
        height: enemy.height
    };
    
    return rectIntersects(playerRect, enemyRect);
}

// プレイヤー攻撃と敵の当たり判定
export function checkPlayerAttackHit(player, enemy) {
    const attackHitbox = player.getAttackHitbox();
    if (!attackHitbox) return false;
    
    const enemyRect = {
        x: enemy.x,
        y: enemy.y,
        width: enemy.width,
        height: enemy.height
    };
    
    return rectIntersects(attackHitbox, enemyRect);
}

// 必殺技と敵の当たり判定
export function checkSpecialHit(player, enemy) {
    const specialHitbox = player.getSpecialHitbox();
    if (!specialHitbox) return false;
    
    const enemyRect = {
        x: enemy.x,
        y: enemy.y,
        width: enemy.width,
        height: enemy.height
    };
    
    return rectIntersects(specialHitbox, enemyRect);
}

// 敵攻撃とプレイヤーの当たり判定
export function checkEnemyAttackHit(enemy, player) {
    const attackHitbox = enemy.getAttackHitbox();
    if (!attackHitbox) return false;
    
    const playerRect = {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height
    };
    
    const hitboxes = Array.isArray(attackHitbox) ? attackHitbox : [attackHitbox];
    for (const hitbox of hitboxes) {
        if (rectIntersects(hitbox, playerRect)) {
            return true;
        }
    }
    return false;
}

// 爆弾の爆発範囲と敵の当たり判定
export function checkExplosionHit(bomb, enemy) {
    if (!bomb.isExploding) return false;
    
    const centerX = enemy.x + enemy.width / 2;
    const centerY = enemy.y + enemy.height / 2;
    const dx = bomb.x - centerX;
    const dy = bomb.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance <= bomb.explosionRadius;
}

// サブ武器と敵の当たり判定
export function checkSubWeaponHit(subWeapon, player, enemy) {
    const hitbox = subWeapon.getHitbox(player);
    if (!hitbox) return false;
    
    const enemyRect = {
        x: enemy.x,
        y: enemy.y,
        width: enemy.width,
        height: enemy.height
    };
    
    const hitboxes = Array.isArray(hitbox) ? hitbox : [hitbox];
    for (const box of hitboxes) {
        if (rectIntersects(box, enemyRect)) {
            return true;
        }
    }
    return false;
}

// 衝突処理クラス
export class CollisionManager {
    constructor() {
        // 既にヒットした敵を追跡（多段ヒット防止）
        this.hitEnemies = new Set();
        this.specialHitEnemies = new Set();
        this.bombHitEnemies = new Map();  // bombId -> Set of enemies
    }
    
    reset() {
        this.hitEnemies.clear();
        this.specialHitEnemies.clear();
        this.bombHitEnemies.clear();
    }
    
    resetAttackHits() {
        this.hitEnemies.clear();
    }
    
    resetSpecialHits() {
        this.specialHitEnemies.clear();
    }
    
    // プレイヤー攻撃のヒットチェック（同じ攻撃で多段ヒットしない）
    checkAndRegisterAttackHit(player, enemy) {
        if (this.hitEnemies.has(enemy)) return false;
        
        if (checkPlayerAttackHit(player, enemy)) {
            this.hitEnemies.add(enemy);
            return true;
        }
        return false;
    }
    
    // 必殺技のヒットチェック
    checkAndRegisterSpecialHit(player, enemy) {
        if (this.specialHitEnemies.has(enemy)) return false;
        
        if (checkSpecialHit(player, enemy)) {
            this.specialHitEnemies.add(enemy);
            return true;
        }
        return false;
    }
    
    // 爆弾のヒットチェック
    checkAndRegisterBombHit(bomb, enemy, bombId) {
        if (!this.bombHitEnemies.has(bombId)) {
            this.bombHitEnemies.set(bombId, new Set());
        }
        
        const hitSet = this.bombHitEnemies.get(bombId);
        if (hitSet.has(enemy)) return false;
        
        if (checkExplosionHit(bomb, enemy)) {
            hitSet.add(enemy);
            return true;
        }
        return false;
    }
    
    // 爆弾のヒット記録を削除（爆弾消滅時）
    removeBombRecord(bombId) {
        if (this.bombHitEnemies.has(bombId)) {
            this.bombHitEnemies.delete(bombId);
        }
    }
}
