// 将軍(Shogun)の「制御源」抽象（brain）。
// 将軍の戦闘コア（attack/combo/sub-weapon/物理/描画）は単一実装で、
// その意図を入力するのが brain。プレイヤー操作(InputBrain)とAI(AIBrain)を差し替えるだけにする。
//
// Stage A 時点では既存の呼び出し位置（敵=Enemy.update のAIディスパッチ / プレイヤー=controller.update）
// から brain.tick を呼ぶだけの薄い委譲（挙動不変）。後続 Stage で単一 Shogun に集約していく足場。

// AI制御: 既存の self.updateAI(dt, player) を呼ぶ。
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

// プレイヤー入力制御: 既存の player.handleInput()（combatController 経由で将軍入力処理へ委譲）を呼ぶ。
export function createInputBrain() {
    return {
        kind: 'input',
        tick(self, deltaTime, ctx) {
            const player = ctx && ctx.player;
            if (player && typeof player.handleInput === 'function') {
                player.handleInput();
            }
        }
    };
}
