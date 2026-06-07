// 敵(AI駆動)の「制御源」抽象（brain）。Enemy.update のAIディスパッチから brain.tick を呼ぶ。
// プレイアブル将軍は Player 自身の handleInput を直接使う（input用 brain は不要のため撤去済み）。

// AI制御: self.updateAI(dt, player) を呼ぶ。
export function createAIBrain() {
    return {
        kind: 'ai',
        tick(self, deltaTime, ctx) {
            if (self && typeof self.updateAI === 'function') {
                self.updateAI(deltaTime, ctx && ctx.player);
            }
        }
    };
}
