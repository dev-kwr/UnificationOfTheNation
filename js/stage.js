// ============================================
// Unification of the Nation - ステージ管理
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, STAGES, ENEMY_TYPES, OBSTACLE_TYPES, LANE_OFFSET, STAGE5_FLOOR } from './constants.js';
import { createEnemy } from './enemy.js';
import { createBoss } from './boss.js';
import { createObstacle } from './obstacle.js';
import { audio } from './audio.js';
import { generateStairsCanvas } from './stairRenderer.js';

const OBSTACLE_CHANCE_BOOST = 0.8;

// ステージクラス
export class Stage {
    constructor(stageNumber) {
        this.stageNumber = stageNumber;
        this.stageInfo = STAGES[stageNumber - 1];
        this.name = this.stageInfo ? this.stageInfo.name : '';
        
        // ステージ進行
        this.progress = 0;
        this.scrollSpeed = 2; // unused but kept

        // --- Stage 5 フロア制 ---
        if (this.stageNumber === 5) {
            this.currentFloor = 1;
            this.maxFloor = STAGE5_FLOOR.COUNT;
            this.floorMaxProgress = STAGE5_FLOOR.PROGRESS_PER_FLOOR;
            this.maxProgress = this.floorMaxProgress;
            // 奇数フロア=右方向(1), 偶数フロア=左方向(-1)
            this.floorScrollDirection = 1;
            this.stairZoneWidth = STAGE5_FLOOR.STAIR_WIDTH;
            this.stairHeightPx = STAGE5_FLOOR.STAIR_HEIGHT;
            this.stairStepCount = STAGE5_FLOOR.STAIR_STEP_COUNT;
            this.baseGroundY = Math.round(CANVAS_HEIGHT * (2 / 3));
            // フロア遷移状態
            this.isFloorTransitioning = false;
            this.floorTransitionTimer = 0;
            this.floorTransitionPhase = 0; // 0=なし, 1=暗転中, 2=暗転待機, 3=フェードイン
            this.floorTransitionTotalMs = STAGE5_FLOOR.TRANSITION_FADE_MS + STAGE5_FLOOR.TRANSITION_WAIT_MS + STAGE5_FLOOR.TRANSITION_FADEIN_MS;
            // 前フロアから登ってきた階段を表示するか
            this.showPreviousStair = false;
            this.previousStairDirection = 0; // 前フロアの方向
            // フロア名表示
            this.floorNameDisplayTimer = 0;
            this.floorNameDisplayDuration = 1800; // ms
        } else {
            this.maxProgress = 12000;
            this.currentFloor = 0;
            this.floorScrollDirection = 1;
        }
        
        // 敵管理
        this.enemies = [];
        this.spawnTimer = 1500;  // 2000ms間隔に対し最初から1.5s進めておく
        this.balanceProfile = this.getBalanceProfile();
        this.spawnInterval = this.balanceProfile.spawnStart;  // ステージごとの初期間隔
        
        // 障害物管理
        this.obstacles = [];
        this.obstacleTimer = 0;
        this.obstacleInterval = 2500;
        
        // ボス
        this.boss = null;
        this.bossSpawned = false;
        this.bossDefeated = false;
        this.midBossSpawned = true; // 中ボスは出現させない
        this.bossDefeatLingerDuration = 700;
        this.bossDefeatLingerTimer = 0;
        this.bossDefeatColorFade = 0; // ボス撃破後の赤い空のフェードアウト用（1→0）
        this.bossEncounterBlend = 0;
        this.bossEntranceFlash = 0; // ボス登場フラッシュ
        
        // 地面
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        
        // 背景レイヤー（多重スクロール）
        this.bgLayers = this.createBackgroundLayers();
        
        // ステージ固有の敵構成
        this.enemyWeights = this.getEnemyWeights();
        this.maxActiveEnemies = this.getMaxActiveEnemies();
        this.stageTime = 0;
        this.skyParticles = this.createSkyParticles(40); // 粒子数を増やしてリッチに
        this.lastProgress = this.progress;
        this.playerProbe = {
            x: 0,
            y: 0,
            vx: 0,
            width: 0,
            height: 0,
            isGrounded: false
        };
        this.bambooFallingLeaves = [];
        this.bambooLeafSpawnTimer = 0;
        this.bossIntroDurationByStage = {
            1: 960,
            2: 1020,
            3: 1080,
            4: 1160,
            5: 1240
        };
        this.bossIntroDuration = this.bossIntroDurationByStage[this.stageNumber] || 1500;
        this.bossIntroTimer = 0;
        this.bossEntranceTargetRatio = 0.8;
        
        // --- 竹林ステージの初期落ち葉配置 ---
        if (this.stageNumber === 1) {
            this.initBambooLeaves();
        }

        // --- Stage 5 階段画像 ---
        if (this.stageNumber === 5) {
            const sd = generateStairsCanvas();
            this.stairImage = sd.canvas;
            this.stairOriginX = sd.originX;
            this.stairOriginY = sd.originY;
            this.stairTotalL = sd.totalL;  // プレビュー画像の論理幅 (=900)
            this.stairTotalH = sd.totalH;  // プレビュー画像の論理高さ (=800)
            this.stairDrawScale = this.stairZoneWidth / sd.totalL; // 描画スケール (360/900=0.4)
        }

        // --- Stage 3 山道添景画像 ---
        if (this.stageNumber === 3) {
            this.stage3ExitImage = new Image();
            this.stage3ExitImage.src = 'images/stage3_mountain_exit.png';
            this.stage3PropImages = {};
            const stage3PropPaths = {
                dosojin: 'images/stage3_prop_dosojin.png',
                signpost: 'images/stage3_prop_signpost.png',
                bambooFence: 'images/stage3_prop_bamboo_fence.png'
            };
            for (const [key, src] of Object.entries(stage3PropPaths)) {
                const image = new Image();
                image.src = src;
                this.stage3PropImages[key] = image;
            }
        }

        // キャッシュ用オフスクリーンCanvasの初期化
        this.cachedAssets = {};
        this.initCache();
    }

    initCache() {
        // 竹の葉のプリレンダリング
        if (this.stageNumber === 1) {
            const colors = ['#8dc46a', '#a0c878', '#b4d47e', '#7ab85a', '#c8d472'];
            this.cachedAssets.bambooLeaves = colors.map((color) => {
                const offCanvas = document.createElement('canvas');
                offCanvas.width = 32;
                offCanvas.height = 32;
                const octx = offCanvas.getContext('2d');
                const size = 12;
                octx.translate(16, 16);
                octx.fillStyle = color;
                octx.beginPath();
                octx.moveTo(-size * 0.54, 0);
                octx.quadraticCurveTo(-size * 0.1, -size * 0.42, size * 0.62, -size * 0.1);
                octx.quadraticCurveTo(size * 0.1, size * 0.36, -size * 0.54, 0);
                octx.closePath();
                octx.fill();
                octx.strokeStyle = 'rgba(236, 248, 220, 0.4)';
                octx.lineWidth = 0.8;
                octx.beginPath();
                octx.moveTo(-size * 0.32, 0);
                octx.lineTo(size * 0.5, -size * 0.03);
                octx.stroke();
                return offCanvas;
            });
        }

        // ボス戦の集中線（スピードライン）のキャッシュ化
        const speedLineCanvas = document.createElement('canvas');
        speedLineCanvas.width = CANVAS_WIDTH;
        speedLineCanvas.height = Math.round(CANVAS_HEIGHT * 0.8);
        const slCtx = speedLineCanvas.getContext('2d');
        const centerX = CANVAS_WIDTH / 2;
        const centerY = this.groundY / 2;
        slCtx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
        slCtx.lineWidth = 1.5;
        for (let i = 0; i < 36; i++) {
            const angle = (i / 36) * Math.PI * 2;
            slCtx.beginPath();
            slCtx.moveTo(centerX + Math.cos(angle) * CANVAS_WIDTH * 0.4, centerY + Math.sin(angle) * CANVAS_WIDTH * 0.4);
            slCtx.lineTo(centerX + Math.cos(angle) * CANVAS_WIDTH * 0.7, centerY + Math.sin(angle) * CANVAS_WIDTH * 0.7);
            slCtx.stroke();
        }
        this.cachedAssets.speedLines = speedLineCanvas;

        // 城のシルエット（城下町ステージ）
        if (this.stageNumber === 4) {
            const castleCanvas = document.createElement('canvas');
            castleCanvas.width = CANVAS_WIDTH;
            castleCanvas.height = 420; 
            const cctx = castleCanvas.getContext('2d');
            const wallBaseY = 326;

            // 遠景の低い稜線
            cctx.fillStyle = '#13151b';
            cctx.beginPath();
            cctx.moveTo(-80, 420);
            cctx.lineTo(CANVAS_WIDTH * 0.1, wallBaseY - 16);
            cctx.lineTo(CANVAS_WIDTH * 0.34, wallBaseY - 30);
            cctx.lineTo(CANVAS_WIDTH * 0.62, wallBaseY - 18);
            cctx.lineTo(CANVAS_WIDTH * 0.86, wallBaseY - 36);
            cctx.lineTo(CANVAS_WIDTH + 80, 420);
            cctx.closePath();
            cctx.fill();

            // 石垣の台座
            const stoneGrad = cctx.createLinearGradient(0, wallBaseY - 16, 0, wallBaseY + 82);
            stoneGrad.addColorStop(0, '#2a2c34');
            stoneGrad.addColorStop(1, '#1a1c22');
            cctx.fillStyle = stoneGrad;
            cctx.fillRect(-20, wallBaseY - 12, CANVAS_WIDTH + 40, 110);
            cctx.strokeStyle = 'rgba(74, 82, 96, 0.3)';
            cctx.lineWidth = 1.2;
            for (let y = wallBaseY + 2; y < wallBaseY + 84; y += 18) {
                cctx.beginPath();
                cctx.moveTo(-20, y);
                cctx.lineTo(CANVAS_WIDTH + 20, y);
                cctx.stroke();
            }

            // 左右の櫓
            cctx.fillStyle = '#14161c';
            cctx.fillRect(CANVAS_WIDTH * 0.08, wallBaseY - 174, 118, 162);
            cctx.fillRect(CANVAS_WIDTH * 0.78, wallBaseY - 188, 126, 176);
            cctx.fillStyle = 'rgba(198, 204, 220, 0.18)';
            cctx.fillRect(CANVAS_WIDTH * 0.08 + 12, wallBaseY - 156, 94, 48);
            cctx.fillRect(CANVAS_WIDTH * 0.78 + 14, wallBaseY - 168, 98, 52);

            // 中央の天守（段構造）
            const cx = CANVAS_WIDTH * 0.5;
            cctx.fillStyle = '#13151b';
            cctx.beginPath();
            cctx.moveTo(cx - 136, wallBaseY - 6);
            cctx.lineTo(cx - 102, wallBaseY - 208);
            cctx.lineTo(cx + 102, wallBaseY - 208);
            cctx.lineTo(cx + 136, wallBaseY - 6);
            cctx.closePath();
            cctx.fill();
            cctx.fillStyle = 'rgba(214, 220, 236, 0.2)';
            cctx.fillRect(cx - 88, wallBaseY - 190, 176, 54);

            cctx.fillStyle = '#101218';
            cctx.beginPath();
            cctx.moveTo(cx - 90, wallBaseY - 208);
            cctx.lineTo(cx - 60, wallBaseY - 286);
            cctx.lineTo(cx + 60, wallBaseY - 286);
            cctx.lineTo(cx + 90, wallBaseY - 208);
            cctx.closePath();
            cctx.fill();
            cctx.fillStyle = 'rgba(228, 234, 246, 0.2)';
            cctx.fillRect(cx - 52, wallBaseY - 270, 104, 42);

            cctx.fillStyle = '#0d0f15';
            cctx.beginPath();
            cctx.moveTo(cx - 46, wallBaseY - 286);
            cctx.lineTo(cx - 28, wallBaseY - 344);
            cctx.lineTo(cx + 28, wallBaseY - 344);
            cctx.lineTo(cx + 46, wallBaseY - 286);
            cctx.closePath();
            cctx.fill();
            cctx.fillStyle = 'rgba(236, 242, 255, 0.26)';
            cctx.fillRect(cx - 20, wallBaseY - 334, 40, 28);

            // 屋根の輪郭
            cctx.strokeStyle = 'rgba(160, 172, 198, 0.34)';
            cctx.lineWidth = 2;
            cctx.beginPath();
            cctx.moveTo(cx - 164, wallBaseY - 198);
            cctx.quadraticCurveTo(cx, wallBaseY - 246, cx + 164, wallBaseY - 198);
            cctx.stroke();
            cctx.beginPath();
            cctx.moveTo(cx - 112, wallBaseY - 278);
            cctx.quadraticCurveTo(cx, wallBaseY - 316, cx + 112, wallBaseY - 278);
            cctx.stroke();

            this.cachedAssets.castle = castleCanvas;
        }

        // 星のグロー（プリレンダリング）
        const starGlow = document.createElement('canvas');
        starGlow.width = 32;
        starGlow.height = 32;
        const sgCtx = starGlow.getContext('2d');
        const grad = sgCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        sgCtx.fillStyle = grad;
        sgCtx.fillRect(0, 0, 32, 32);
        this.cachedAssets.starGlow = starGlow;
    }

    initBambooLeaves() {
        const initialCount = 28;
        const cliffY = this.groundY + 120; // 拡張された路面幅
        for (let i = 0; i < initialCount; i++) {
            const depth = 0.45 + Math.random() * 0.55;
            const screenX = Math.random() * CANVAS_WIDTH;
            const targetY = this.groundY + depth * (cliffY - this.groundY);
            
            this.bambooFallingLeaves.push({
                worldX: screenX + this.progress,
                y: targetY,
                vx: 0,
                vy: 0,
                rot: Math.random() * Math.PI * 2,
                rotV: 0,
                size: 6 + Math.random() * 9,
                depth,
                state: 'grounded',
                groundLife: 4000 + Math.random() * 8000,
                maxGroundLife: 12000,
                leafId: (this._leafIdCounter = ((this._leafIdCounter || 0) + 1) & 0xFFFF)
            });
        }
    }

    // ============================
    // Stage 5 フロア制メソッド群
    // ============================

    /** 階段描画のためのサポート情報 */
    _getStairImageWorldX(direction) {
        return this._getStairPhysicalStart(direction);
    }

    // 物理判定の登り始め・終わりワールドX
    _getStairPhysicalStart(direction) {
        return direction === 1 ? (this.maxProgress - this.stairZoneWidth) : this.stairZoneWidth;
    }

    /**
     * 物理判定の登り終わり（頂上）ワールドX。
     * 右登り → maxProgress（右端）
     * 左登り → 0（左端）
     */
    _getStairPhysicalEnd(direction) {
        return direction === 1 ? this.maxProgress : 0;
    }

    /** 階段区間の開始ワールドX座標（物理的な登り始め） */
    getStairStartX() {
        if (this.stageNumber !== 5) return Infinity;
        return this._getStairPhysicalStart(this.floorScrollDirection);
    }

    /** 階段区間の終了ワールドX座標（物理的な頂上） */
    getStairEndX() {
        if (this.stageNumber !== 5) return Infinity;
        return this._getStairPhysicalEnd(this.floorScrollDirection);
    }

    /** プレイヤーが階段区間にいるか判定 */
    isInStairZone(playerX) {
        if (this.stageNumber !== 5) return false;
        const dir = this.floorScrollDirection;
        const physStart = this._getStairPhysicalStart(dir);
        const physEnd = this._getStairPhysicalEnd(dir);
        if (dir === 1) {
            return playerX >= physStart && playerX <= physEnd;
        } else {
            // 左登り: physStart > physEnd (start は大きい方)
            return playerX <= physStart && playerX >= physEnd;
        }
    }

    /** 階段内の登り進行度（0=階段入口, 1=階段頂上）を返す */
    getStairClimbProgress(playerX) {
        if (this.stageNumber !== 5) return 0;
        const dir = this.floorScrollDirection;
        const physStart = this._getStairPhysicalStart(dir);
        const physEnd = this._getStairPhysicalEnd(dir);
        const totalDist = Math.abs(physEnd - physStart);
        if (totalDist === 0) return 0;

        if (dir === 1) {
            // 右登り: playerX が大きいほど progress が大きい
            return Math.max(0, Math.min(1, (playerX - physStart) / totalDist));
        } else {
            // 左登り: playerX が小さいほど progress が大きい
            return Math.max(0, Math.min(1, (physStart - playerX) / totalDist));
        }
    }

    /** 階段上のプレイヤー位置に対応する動的groundYを返す */
    getStairGroundY(playerX) {
        if (this.stageNumber !== 5) return this.groundY;
        // 5Fでもボス部屋として階段の高さを利用するため制限を解除

        const dir = this.floorScrollDirection;
        const stairH = this.stairHeightPx;
        const physStart = this._getStairPhysicalStart(dir);
        const visibleWidth = STAGE5_FLOOR.PREVIOUS_STAIR_VISIBLE_WIDTH || 200;

        // --- 前フロアから登ってきた階段（スタート地点の穴）の判定 ---
        if (this.showPreviousStair) {
            if (dir === 1) {
                // 右方向フロア: 左端(0 ～ visibleWidth)に穴がある
                if (playerX < visibleWidth) {
                    const distFromTop = visibleWidth - playerX;
                    const depth = (distFromTop / this.stairZoneWidth) * stairH;
                    return this.baseGroundY + depth; // y軸は下がプラス
                }
            } else {
                // 左方向フロア: 右端(maxProgress - visibleWidth ～ maxProgress)に穴がある
                const holeLeftEdge = this.maxProgress - visibleWidth;
                if (playerX > holeLeftEdge) {
                    const distFromTop = playerX - holeLeftEdge;
                    const depth = (distFromTop / this.stairZoneWidth) * stairH;
                    return this.baseGroundY + depth;
                }
            }
        }

        // --- 次のフロアへ登る階段（ゴール地点）の判定 ---
        if (dir === 1) {
            // 右登り: physStart より左は平地
            if (playerX < physStart) return this.baseGroundY;
        } else {
            // 左登り: physStart より右は平地
            if (playerX > physStart) return this.baseGroundY;
        }

        const progress = this.getStairClimbProgress(playerX);
        return this.baseGroundY - stairH * progress;
    }

    /** フロア遷移を開始する */
    startFloorTransition() {
        if (this.stageNumber !== 5 || this.isFloorTransitioning) return;
        this.isFloorTransitioning = true;
        this.floorTransitionPhase = 1; // 暗転開始
        this.floorTransitionTimer = STAGE5_FLOOR.TRANSITION_FADE_MS;
    }

    /** フロア遷移のアニメーション更新 (deltaTime in seconds) */
    updateFloorTransition(deltaTime) {
        if (!this.isFloorTransitioning) return false;
        
        this.floorTransitionTimer -= deltaTime * 1000;
        
        if (this.floorTransitionTimer <= 0) {
            if (this.floorTransitionPhase === 1) {
                // 暗転完了 → 暗転待機（この間にフロア切り替え）
                this.floorTransitionPhase = 2;
                this.floorTransitionTimer = STAGE5_FLOOR.TRANSITION_WAIT_MS;
                this.advanceFloor();
            } else if (this.floorTransitionPhase === 2) {
                // 暗転待機完了 → フェードイン開始
                this.floorTransitionPhase = 3;
                this.floorTransitionTimer = STAGE5_FLOOR.TRANSITION_FADEIN_MS;
            } else if (this.floorTransitionPhase === 3) {
                // フェードイン完了 → 遷移終了
                this.isFloorTransitioning = false;
                this.floorTransitionPhase = 0;
                this.floorTransitionTimer = 0;
            }
        }
        return this.isFloorTransitioning;
    }

    /** 次のフロアへ移行する（内部リセット） */
    advanceFloor() {
        if (this.stageNumber !== 5) return;
        
        // 前フロアの方向を記録（前階段表示用）
        this.previousStairDirection = this.floorScrollDirection; // 現在の方向（遷移前）を保存
        
        this.currentFloor++;
        // フロア方向: 奇数=右, 偶数=左
        this.floorScrollDirection = (this.currentFloor % 2 === 1) ? 1 : -1;
        
        // 敵・障害物をリセット
        this.enemies = [];
        this.obstacles = [];
        this.spawnTimer = 800;
        this.obstacleTimer = 0;
        
        // groundYをリセット
        this.groundY = this.baseGroundY;
        
        // 進行度（スクロール）をリセット
        // 右進行なら 0, 左進行なら maxProgress
        this.progress = (this.floorScrollDirection === 1) ? 0 : this.maxProgress;
        this.lastProgress = this.progress;
        
        // 最終フロアかどうかで maxProgress を調整
        if (this.currentFloor >= this.maxFloor) {
            // 5Fはボスが出るため階段なし = フル幅
            this.maxProgress = this.floorMaxProgress;
        } else {
            this.maxProgress = this.floorMaxProgress;
        }
        
        // 前の階段を表示
        this.showPreviousStair = (this.currentFloor > 1);
        
        // フロア名表示タイマー
        this.floorNameDisplayTimer = this.floorNameDisplayDuration;
        
        // バランスプロファイルを再計算（フロア難易度倍率適用）
        this.balanceProfile = this.getBalanceProfile();
    }

    /** フロアごとの難易度倍率を返す */
    getFloorDifficultyMult() {
        if (this.stageNumber !== 5 || !this.currentFloor) return 1.0;
        const index = Math.max(0, Math.min(STAGE5_FLOOR.DIFFICULTY_SCALE.length - 1, this.currentFloor - 1));
        return STAGE5_FLOOR.DIFFICULTY_SCALE[index];
    }

    /** フロア遷移のオーバーレイ透明度を返す */
    getFloorTransitionAlpha() {
        if (!this.isFloorTransitioning) return 0;
        if (this.floorTransitionPhase === 1) {
            // 暗転中: 0 → 1
            return 1 - this.floorTransitionTimer / STAGE5_FLOOR.TRANSITION_FADE_MS;
        } else if (this.floorTransitionPhase === 2) {
            // 暗転待機: 常に1
            return 1;
        } else if (this.floorTransitionPhase === 3) {
            // フェードイン: 1 → 0
            return this.floorTransitionTimer / STAGE5_FLOOR.TRANSITION_FADEIN_MS;
        }
        return 0;
    }

    /** フロア遷移の暗転オーバーレイを描画する */
    renderFloorTransition(ctx) {
        const alpha = this.getFloorTransitionAlpha();
        if (alpha <= 0.001) return;
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, alpha)})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
    }

    /** フロア名（「一階」「二階」等）を表示する */
    renderFloorName(ctx) {
        if (this.stageNumber !== 5 || this.floorNameDisplayTimer <= 0) return;
        const floorNames = ['一階', '二階', '三階', '四階', '五階'];
        const name = floorNames[this.currentFloor - 1] || '';
        if (!name) return;
        
        const progress = 1 - this.floorNameDisplayTimer / this.floorNameDisplayDuration;
        // フェードイン → 持続 → フェードアウト
        let alpha = 1;
        if (progress < 0.15) {
            alpha = progress / 0.15;
        } else if (progress > 0.7) {
            alpha = (1 - progress) / 0.3;
        }
        alpha = Math.max(0, Math.min(1, alpha));
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#e8d5a3';
        ctx.font = 'bold 48px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 縁取り
        ctx.strokeStyle = 'rgba(40, 20, 10, 0.8)';
        ctx.lineWidth = 4;
        ctx.strokeText(name, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3);
        ctx.fillText(name, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3);
        ctx.restore();
    }

    /** 階段区間の石段を描画する */
    renderStairZone(ctx, scrollX) {
        if (this.stageNumber !== 5 || !this.stairImage) return;
        // ボスフロア（5F）では「天守閣へ続く登れない階段」として右端に背景描画される

        const direction = this.floorScrollDirection;
        const startWorldX = this._getStairPhysicalStart(direction);
        const startScreenX = startWorldX - scrollX;
        const s = this.stairDrawScale; // 描画スケール (0.4)

        // 階段画像の底辺（起点）をゲーム世界の接地ラインに合わせる
        // 壁（背景）へのめり込みを防ぐため、Y座標を少し下（畳側）へオフセットする
        const stairYOffset = 40;
        const anchorScreenX = startScreenX;
        const anchorScreenY = this.baseGroundY + LANE_OFFSET + stairYOffset;

        ctx.save();
        if (direction === 1) {
            ctx.translate(anchorScreenX, anchorScreenY);
            ctx.scale(s, s);
            ctx.drawImage(this.stairImage, -this.stairOriginX, -this.stairOriginY);
        } else {
            ctx.translate(anchorScreenX, anchorScreenY);
            ctx.scale(-s, s);
            ctx.drawImage(this.stairImage, -this.stairOriginX, -this.stairOriginY);
        }
        ctx.restore();
    }

    /**
     * 前フロア階段の頂上部分を描画する（登ってきた口）。
     *
     * ＜階段の物理的整合性＞
     * - prevDir=1（前フロアで右へ登った）場合、現フロア(dir=-1)は右端からスタートする。
     *   つまり、登ってきた「穴」は右端(maxProgress)の背後にあるべき。
     *   → 右登りの階段画像を描画し、その頂上（画像の右端）が worldX=maxProgress になるように配置する。
     *
     * - prevDir=-1（前フロアで左へ登った）場合、現フロア(dir=1)は左端からスタートする。
     *   つまり、登ってきた「穴」は左端(0)の背後にあるべき。
     *   → 左登りの階段画像（flip描画）を描画し、その頂上（flip視覚的左端）が worldX=0 になるように配置する。
     */
    renderPreviousStairTop(ctx, scrollX) {
        if (this.stageNumber !== 5 || !this.showPreviousStair || !this.stairImage) return;

        const prevDir = this.previousStairDirection;
        const visibleWidth = STAGE5_FLOOR.PREVIOUS_STAIR_VISIBLE_WIDTH || 200;
        const s = this.stairDrawScale;
        const TOTAL_L = this.stairTotalL;
        const TOTAL_H = this.stairTotalH;

        let clipWorldLeft;
        let isFlippedDraw = false;
        let worldTopX;

        if (prevDir === 1) {
            // 右に向かって登ってきた場合（現フロアは左へ進む）
            // 穴は右端(maxProgress)に作るので床は左側。
            // 階段の最上段を穴の左縁(clipWorldLeft)に合わせるため、\方向(フリップ)で右下へ描画
            clipWorldLeft = this.maxProgress - visibleWidth;
            worldTopX = clipWorldLeft; 
            isFlippedDraw = true;
        } else {
            // 左に向かって登ってきた場合（現フロアは右へ進む）
            // 穴は左端(0)に作るので床は右側。
            // 階段の最上段を穴の右縁(visibleWidth)に合わせるため、/方向で左下へ描画
            clipWorldLeft = 0;
            worldTopX = visibleWidth;
            isFlippedDraw = false;
        }

        const clipScreenX = clipWorldLeft - scrollX;
        const topScreenX = worldTopX - scrollX;

        // 穴の表現（黒塗り）
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(clipScreenX, this.baseGroundY, visibleWidth, CANVAS_HEIGHT - this.baseGroundY);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipScreenX - 60, this.baseGroundY - 150, visibleWidth + 120, CANVAS_HEIGHT - this.baseGroundY + 150);
        ctx.clip();

        // 頂上のアンカー: 階段最上段の先端をゲーム世界の接地ラインに合わせる
        // 階段画像の頂上は originX + TOTAL_L, originY - TOTAL_H
        // オフセットを追加して、壁へのめり込みを防ぎつつ先のフロアと接続させる
        const stairYOffset = 40;
        const anchorScreenY = this.baseGroundY + LANE_OFFSET + stairYOffset;

        if (!isFlippedDraw) {
            ctx.translate(topScreenX, anchorScreenY);
            ctx.scale(s, s);
            ctx.drawImage(this.stairImage, -(this.stairOriginX + TOTAL_L), -(this.stairOriginY - TOTAL_H));
        } else {
            ctx.translate(topScreenX, anchorScreenY);
            ctx.scale(-s, s);
            ctx.drawImage(this.stairImage, -(this.stairOriginX + TOTAL_L), -(this.stairOriginY - TOTAL_H));
        }
        ctx.restore();
    }

    getBalanceProfile() {
        // ステージが長くなったので、湧き頻度も少し緩和しつつ調整
        const profiles = {
            1: {
                spawnStart: 1860,
                spawnMin: 1080,
                spawnJitter: 320,
                multiSpawnBase: 0.16,
                multiSpawnPeak: 0.28,
                leftSpawnBase: 0.14,
                leftSpawnPeak: 0.22,
                obstacleChance: 0.22,
                obstacleIntervalMin: 2600,
                obstacleIntervalMax: 4200
            },
            2: {
                spawnStart: 1750,
                spawnMin: 1000,
                spawnJitter: 360,
                multiSpawnBase: 0.2,
                multiSpawnPeak: 0.32,
                leftSpawnBase: 0.17,
                leftSpawnPeak: 0.25,
                obstacleChance: 0.26,
                obstacleIntervalMin: 2400,
                obstacleIntervalMax: 3900
            },
            3: {
                spawnStart: 1650,
                spawnMin: 920,
                spawnJitter: 390,
                multiSpawnBase: 0.24,
                multiSpawnPeak: 0.36,
                leftSpawnBase: 0.2,
                leftSpawnPeak: 0.28,
                obstacleChance: 0.78,
                obstacleIntervalMin: 1200,
                obstacleIntervalMax: 2200
            },
            4: {
                spawnStart: 1550,
                spawnMin: 840,
                spawnJitter: 420,
                multiSpawnBase: 0.28,
                multiSpawnPeak: 0.40,
                leftSpawnBase: 0.22,
                leftSpawnPeak: 0.3,
                obstacleChance: 0.31,
                obstacleIntervalMin: 2000,
                obstacleIntervalMax: 3400
            },
            5: {
                spawnStart: 1460,
                spawnMin: 770,
                spawnJitter: 450,
                multiSpawnBase: 0.32,
                multiSpawnPeak: 0.44,
                leftSpawnBase: 0.24,
                leftSpawnPeak: 0.32,
                obstacleChance: 0.34,
                obstacleIntervalMin: 1900,
                obstacleIntervalMax: 3200
            },
            6: {
                spawnStart: 1400,
                spawnMin: 720,
                spawnJitter: 470,
                multiSpawnBase: 0.34,
                multiSpawnPeak: 0.46,
                leftSpawnBase: 0.25,
                leftSpawnPeak: 0.34,
                obstacleChance: 0.36,
                obstacleIntervalMin: 1800,
                obstacleIntervalMax: 3000
            }
        };
        const profile = profiles[this.stageNumber] || profiles[3];
        // Stage 5: フロアごとの難易度倍率を適用
        if (this.stageNumber === 5 && this.currentFloor) {
            const mult = this.getFloorDifficultyMult();
            profile.spawnStart = Math.round(profile.spawnStart / mult);
            profile.spawnMin = Math.round(profile.spawnMin / mult);
        }
        return profile;
    }
    
    getEnemyWeights() {
        // ステージごとに敵の出現確率を変える
        switch (this.stageNumber) {
            case 1:
                return { ashigaru: 85, samurai: 15, busho: 0, ninja: 0 };
            case 2:
                return { ashigaru: 68, samurai: 28, busho: 4, ninja: 0 };
            case 3:
                return { ashigaru: 48, samurai: 34, busho: 8, ninja: 10 };
            case 4:
                return { ashigaru: 34, samurai: 32, busho: 14, ninja: 20 };
            case 5:
                return { ashigaru: 20, samurai: 34, busho: 22, ninja: 24 };
            case 6:
                return { ashigaru: 12, samurai: 30, busho: 28, ninja: 30 };
            default:
                return { ashigaru: 65, samurai: 30, busho: 0, ninja: 5 };
        }
    }

    getMaxActiveEnemies() {
        switch (this.stageNumber) {
            case 1: return 5;
            case 2: return 6;
            case 3: return 7;
            case 4: return 9;
            case 5: return 10;
            case 6: return 11;
            default: return 8;
        }
    }

    getActiveEnemyCount() {
        let activeCount = 0;
        for (const enemy of this.enemies) {
            if (enemy && enemy.isAlive && !enemy.isDying) activeCount++;
        }
        return activeCount;
    }

    createSkyParticles(count = 18) {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const baseX = Math.abs((Math.sin(i * 12.989 + 2.1) * 43758.5453) % 1);
            const baseY = Math.abs((Math.cos(i * 7.233 + 1.7) * 19642.349) % 1);
            particles.push({
                nx: baseX,
                ny: baseY,
                speed: 1.6 + i * 0.05,
                phase: i * 1.3
            });
        }
        return particles;
    }
    
    createBackgroundLayers() {
        // ゲーム全編を通じて昼〜夕方〜夜〜深夜と自然に時間が経過するように、
        // 各ステージのstartとendの色が前後のステージで滑らかに繋がるように定義
        const backgrounds = {
            1: { // 早朝: 暁から朝へ（竹林）
                start: { sky: ['#1a2748', '#334d76'], far: '#1f3348', mid: '#2d4761', near: '#3a5f7d' },
                mid:   { sky: ['#425f8c', '#8a6a76'], far: '#2f4a5f', mid: '#3f6278', near: '#547f92' },
                end:   { sky: ['#9bcdf0', '#ffd3aa'], far: '#406e69', mid: '#56907f', near: '#6cae97' },
                elements: 'bamboo'
            },
            2: { // 昼間: 明るい青空（街道）
                start: { sky: ['#7fbcf2', '#b8ddff'], far: '#607182', mid: '#728595', near: '#8398a8' },
                mid:   { sky: ['#8ec9f7', '#d2e9ff'], far: '#688092', mid: '#7b92a4', near: '#8ea5b6' },
                end:   { sky: ['#76b8ea', '#9fd4ff'], far: '#5f798d', mid: '#708ba0', near: '#809db2' },
                elements: 'kaido'
            },
            3: { // 夕暮れ: 逢魔が時へ（山道）
                start: { sky: ['#f0c090', '#e8a06a'], far: '#7a6050', mid: '#8a7060', near: '#9a8070' },
                mid:   { sky: ['#c0401c', '#7a1e18'], far: '#4a2820', mid: '#5e3428', near: '#744038' },
                end:   { sky: ['#2a1028', '#5a1808'], far: '#301818', mid: '#402020', near: '#502828' },
                elements: 'mountain'
            },
            4: { // 宵の口: 月の出〜深夜（城下町）
                start: { sky: ['#0b1022', '#181030'], far: '#18171f', mid: '#222030', near: '#2e2c3e' },
                mid:   { sky: ['#0e1a3a', '#0a1020'], far: '#101422', mid: '#181e30', near: '#222840' },
                end:   { sky: ['#162033', '#0a111a'], far: '#0f141f', mid: '#171d2d', near: '#222a3f' },
                elements: 'town'
            },
            5: { // 城内（落ち着いた朱色の回廊）
                start: { sky: ['#4a241c', '#7a3e26'], far: '#3f1a14', mid: '#4e221b', near: '#632b1e' },
                mid:   { sky: ['#542a1e', '#8a442a'], far: '#4a2018', mid: '#5b261f', near: '#713123' },
                end:   { sky: ['#45211b', '#723825'], far: '#3a1813', mid: '#481d18', near: '#5c271c' },
                elements: 'castle'
            },
            6: { // 天守閣（深夜から最終日の出）
                start: { sky: ['#0b1016', '#040608'], far: '#06060B', mid: '#0B0A11', near: '#11101A' },
                mid:   { sky: ['#07142a', '#030d1c'], far: '#080d16', mid: '#0e1520', near: '#141e2e' },
                end:   { sky: ['#f39c12', '#e74c3c'], far: '#5b2c1f', mid: '#7d3c2a', near: '#a14d36' },
                elements: 'tenshu'
            }
        };
        
        return backgrounds[this.stageNumber] || backgrounds[1];
    }
    
    update(deltaTime, player) {
        this.stageTime += deltaTime * 1000;
        const progressDelta = this.progress - this.lastProgress;
        this.lastProgress = this.progress;
        if (player) {
            this.playerProbe.x = player.x;
            this.playerProbe.y = player.y;
            this.playerProbe.vx = player.vx || 0;
            this.playerProbe.width = (typeof player.getWorldWidth === 'function' ? player.getWorldWidth() : player.width) || 0;
            this.playerProbe.height = (typeof player.getWorldHeight === 'function' ? player.getWorldHeight() : player.height) || 0;
            this.playerProbe.isGrounded = !!player.isGrounded;
        }
        this.updateBambooLeafEffects(deltaTime, progressDelta);
        if (this.bossIntroTimer > 0) {
            this.bossIntroTimer = Math.max(0, this.bossIntroTimer - deltaTime * 1000);
        }

        // Stage 5 フロア名表示タイマー
        if (this.stageNumber === 5 && this.floorNameDisplayTimer > 0) {
            this.floorNameDisplayTimer = Math.max(0, this.floorNameDisplayTimer - deltaTime * 1000);
        }

        // ボス戦のブレンド率更新
        const bossIntroRatio = (this.bossIntroTimer > 0)
            ? (this.bossIntroTimer / this.bossIntroDuration)
            : 0;
        const bossEncounterActive = this.bossSpawned && !this.bossDefeated;
        this.bossEncounterBlend = bossEncounterActive
            ? (this.bossIntroTimer > 0
                ? this.smoothstep(0, 1, 1 - bossIntroRatio)
                : 1.0)
            : 0;

        // ボス戦中〜撃破余韻中は専用更新
        if (this.bossSpawned && (!this.bossDefeated || this.bossDefeatLingerTimer > 0)) {
            this.updateBossFight(deltaTime, player);
            return;
        }
        
        // 敵出現（スクロール位置に関係なく判定）
        this.spawnTimer += deltaTime * 1000;
        if (this.spawnTimer >= this.spawnInterval && this.progress < this.maxProgress * 0.98) {
            this.spawnEnemy();
            this.spawnTimer = 0;
            
            // 進行に応じて出現間隔を短くしつつ、ステージごとに密度曲線を調整
            const progressRatio = this.progress / this.maxProgress;
            const spawnStart = this.balanceProfile.spawnStart;
            const spawnMin = this.balanceProfile.spawnMin;
            const baseInterval = spawnStart - (spawnStart - spawnMin) * progressRatio;
            this.spawnInterval = baseInterval + Math.random() * this.balanceProfile.spawnJitter;
        }
        
        // ボス出現
        // 描画スケールではなく、カメラが右端で停止したかどうかで判定する。
        const bossScrollStopX = Math.max(0, this.maxProgress - CANVAS_WIDTH);
        let canSpawnBoss = this.progress >= bossScrollStopX - 0.5;
        
        if (this.stageNumber === 5) {
            // Stage 5 の場合は最終フロアのみ
            canSpawnBoss = canSpawnBoss && (this.currentFloor >= this.maxFloor);
        }

        if (canSpawnBoss && !this.bossSpawned) {
            this.spawnBoss();
        }
        
        // 障害物出現はボス戦中および階段区間では停止
        const noObstaclePhase = (this.bossSpawned && !this.bossDefeated);
        this.obstacleTimer += deltaTime * 1000;
        
        // 階段の少し手前 (200px) までしか障害物を置かないように制限
        const stairBuffer = 200;
        const stairStart = this.getStairStartX();
        const canSpawnObstacle = this.progress < Math.min(this.maxProgress * 0.98, stairStart - stairBuffer);

        if (this.obstacleTimer >= this.obstacleInterval && canSpawnObstacle && !noObstaclePhase) {
              this.spawnObstacle();
              this.obstacleTimer = 0;
              const minInterval = this.balanceProfile.obstacleIntervalMin;
              const maxInterval = this.balanceProfile.obstacleIntervalMax;
              this.obstacleInterval = minInterval + Math.random() * Math.max(1, (maxInterval - minInterval));
        }
        
        // 敵更新
        const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
        this.updateEnemies(deltaTime, player, activeObstacles);
        this.updateObstacles(deltaTime);
    }
    
    updateBossFight(deltaTime, player) {
        // ボス登場演出中：画面右端から高速ダッシュで飛び込む
        if (this.boss && this.boss.isEntering) {
            const scrollX = (window.game && window.game.scrollX) || 0;
            const targetX = scrollX + CANVAS_WIDTH * this.bossEntranceTargetRatio;
            this.boss.entranceTargetX = targetX;

            const dx = this.boss.x - targetX; // 左向きなので boss.x が大きい
            const speed = this.boss.entranceSpeed || 900; // 高速
            const moveAmount = speed * deltaTime;

            if (dx > moveAmount) {
                // まだ目標に届いていない: 高速で左に進む
                this.boss.x -= moveAmount;
                this.boss.facingRight = false;
            } else {
                // 目標到達！ 登場完了
                this.boss.x = targetX;
                this.boss.isEntering = false;
                this.boss.isAttacking = false;
                this.boss.vx = 0;
                // 到達直後の1拍だけ間を作る（フリーズではなく短い硬直）
                this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, 220);
                // 到達時の闘気フラッシュ
                this.bossEntranceFlash = Math.max(this.bossEntranceFlash, 0.8);
            }
        }

        // 歩き入り中はボス更新を行わず、停止位置に到達するまで攻撃させない
        if (this.boss && this.boss.isEntering) {
            if (this.boss) {
                this.boss.isAttacking = false;
                this.boss.vx = 0;
                this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, 300);
            }
            const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
            this.updateEnemies(deltaTime, player, activeObstacles);
            this.updateObstacles(deltaTime);
            return;
        }

        // ボス更新
        if (this.boss) {
            const shouldRemove = this.boss.update(deltaTime, player);
            if (shouldRemove || !this.boss.isAlive) {
                if (!this.boss.isAlive && !this.bossDefeated) {
                    this.bossDefeated = true;
                    this.bossDefeatLingerTimer = this.bossDefeatLingerDuration;
                }
            }
        }

        if (this.bossDefeatLingerTimer > 0) {
            this.bossDefeatLingerTimer = Math.max(0, this.bossDefeatLingerTimer - deltaTime * 1000);
        }
        
        // ボス撃破後の背景色フェードアウト（2秒かけてスムーズに戻す）
        if (this.bossDefeated) {
            if (this.bossDefeatColorFade === 0) {
                this.bossDefeatColorFade = 1.0; // 撃破直後に1.0から開始
            }
            this.bossDefeatColorFade = Math.max(0, this.bossDefeatColorFade - deltaTime * 0.5); // 2秒かけて0へ
        }
        
        // 残りの雑魚敵も更新
        const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
        this.updateEnemies(deltaTime, player, activeObstacles);
        this.updateObstacles(deltaTime);

        // ボス戦中も少量の雑魚敵を出現させる（BUSHOは除外）
        if (!this.bossDefeated && this.bossIntroTimer <= 0) {
            this.spawnTimer += deltaTime * 1000;
            // ボス戦時は通常の2.5倍の間隔でスポーン判定
            const bossSpawnInterval = this.spawnInterval * 2.5;
            if (this.spawnTimer >= bossSpawnInterval) {
                // 最大数は2体程度に抑える
                if (this.getActiveEnemyCount() < 2) {
                    this.spawnEnemy();
                }
                this.spawnTimer = 0;
            }
        }
    }
    
    updateEnemies(deltaTime, player, obstacles = []) {
        // 敵を更新し、削除すべきものをフィルタ
        // 置き去りになった敵は前方に再登場させ、走り抜け時の敵枯渇を防ぐ
        const nextEnemies = [];
        for (const enemy of this.enemies) {
            const shouldRemove = enemy.update(deltaTime, player, obstacles);
            if (shouldRemove) continue;

            if (this.shouldRecycleBehindEnemy(enemy)) {
                const recycled = this.spawnRecycledEnemyAhead(enemy.type);
                if (recycled) {
                    nextEnemies.push(recycled);
                    continue;
                }
            }

            nextEnemies.push(enemy);
        }
        this.enemies = nextEnemies;
    }

    shouldRecycleBehindEnemy(enemy) {
        if (!enemy || !enemy.isAlive || enemy.isDying) return false;
        if (this.bossSpawned && !this.bossDefeated) return false;

        const recycleDistance = 320;
        const leftBound = this.progress - recycleDistance;
        return (enemy.x + enemy.width) < leftBound;
    }

    createGroundedEnemy(type, x) {
        const enemy = createEnemy(type, x, this.groundY, this.groundY);
        if (!enemy) return null;
        enemy.y = this.groundY + LANE_OFFSET - enemy.height;
        return enemy;
    }

    spawnRecycledEnemyAhead(type) {
        const spawnX = this.progress + CANVAS_WIDTH + 80 + Math.random() * 180;
        const recycled = this.createGroundedEnemy(type || ENEMY_TYPES.ASHIGARU, spawnX);
        if (!recycled) return null;
        recycled.facingRight = false;
        return recycled;
    }
    
    spawnEnemy() {
        const availableSlots = this.maxActiveEnemies - this.getActiveEnemyCount();
        if (availableSlots <= 0) return;

        const progressRatio = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        const bossActive = this.bossSpawned && !this.bossDefeated;
        
        let count = 1;
        // ボス戦中はマルチスポーンさせない
        if (!bossActive) {
            const multiSpawnBase = this.balanceProfile.multiSpawnBase || 0.16;
            const multiSpawnPeak = this.balanceProfile.multiSpawnPeak || 0.28;
            const multiChance = multiSpawnBase + (multiSpawnPeak - multiSpawnBase) * progressRatio;
            if (Math.random() < multiChance) {
                const tripleChance = 0.14 + progressRatio * 0.2;
                count = Math.random() < tripleChance ? 3 : 2;
            }
        }
        const spawnCount = Math.min(count, availableSlots);
        
        for (let i = 0; i < spawnCount; i++) {
            // 出現確率に基づいて敵タイプを選択
            const roll = Math.random() * 100;
            let type = ENEMY_TYPES.ASHIGARU;
            let cumulative = 0;
            
            if (roll < (cumulative += this.enemyWeights.ashigaru)) {
                type = ENEMY_TYPES.ASHIGARU;
            } else if (roll < (cumulative += this.enemyWeights.samurai)) {
                type = ENEMY_TYPES.SAMURAI;
            } else if (roll < (cumulative += this.enemyWeights.ninja)) {
                type = ENEMY_TYPES.NINJA;
            } else {
                // ボス戦中はBUSHOの代わりにNINJAを出す
                type = bossActive ? ENEMY_TYPES.NINJA : ENEMY_TYPES.BUSHO;
            }
            
            // 画面外（右側）から出現
            const variance = i * 40; 
            
            // スクロール位置(this.progress)を考慮したワールド座標で出現させる
            // 進行に応じて背後湧きを少し増やす（序盤は抑えめ）
            const leftChance = this.balanceProfile.leftSpawnBase +
                (this.balanceProfile.leftSpawnPeak - this.balanceProfile.leftSpawnBase) * progressRatio;
            let comeFromLeft = Math.random() < leftChance;
            let spawnBaseX;
            let facingRight;

            // Stage 5 左スクロールフロア: スポーン方向を反転
            if (this.stageNumber === 5 && this.floorScrollDirection === -1) {
                comeFromLeft = !comeFromLeft;
            }
            
            if (comeFromLeft) {
                // 左側（画面外左）から出現
                spawnBaseX = -100;
                facingRight = true; // 右を向く
            } else {
                // 右側（画面外右）から出現
                spawnBaseX = CANVAS_WIDTH + 100;
                facingRight = false; // 左を向く
            }
            
            // 複数体湧くときは少し位置をずらす
            const x = this.progress + spawnBaseX + (comeFromLeft ? -variance : variance);

            // Stage 5: 階段区間でのスポーンを制限（重力計算が平面前提のため不自然な浮きを防ぐ）
            if (this.stageNumber === 5 && (this.isInStairZone(x) || x > this.maxProgress - 100)) {
                continue;
            }
            
            const enemy = this.createGroundedEnemy(type, x);
            if (!enemy) continue;
            enemy.facingRight = facingRight;
            this.enemies.push(enemy);
        }
    }
    
    spawnMidBoss() {
        const x = this.progress + CANVAS_WIDTH + 50;
        const midBoss = this.createGroundedEnemy(ENEMY_TYPES.BUSHO, x);
        if (!midBoss) return;
        midBoss.hp = Math.round(midBoss.hp * 1.38);
        midBoss.maxHp = Math.round(midBoss.maxHp * 1.38);
        this.enemies.push(midBoss);
    }

    spawnObstacle() {
        // ステージごとの発生率にボーナスを加算（上限1.0）
        const obstacleChance = Math.min(1, this.balanceProfile.obstacleChance + OBSTACLE_CHANCE_BOOST);
        if (Math.random() > obstacleChance) return;

        // 画面外（右側）から出現（Stage 5 左方向フロアは左側から出現）
        let x;
        if (this.stageNumber === 5 && this.floorScrollDirection === -1) {
            x = this.progress - 50 - Math.random() * 100;
        } else {
            x = this.progress + CANVAS_WIDTH + 50 + Math.random() * 100;
        }

        // Stage 5: 階段区間およびフロア端には障害物(竹槍等)を置かない
        if (this.stageNumber === 5) {
            // 階段のかなり手前（250px）およびフロア端（最上階用300px）をセーフゾーン化
            const isNearStart = x < 250;
            const isNearEnd = x > this.maxProgress - 300;
            
            // 物理的な階段範囲外でも、画面に映る幅を考慮して±150px程度のアソビを持たせる
            const stairPhysStart = this.getStairStartX();
            const stairPhysEnd = this.getStairEndX();
            const buffer = 150;
            const inExtendedStairZone = 
                (this.floorScrollDirection === 1 && x >= stairPhysStart - buffer && x <= stairPhysEnd + buffer) ||
                (this.floorScrollDirection === -1 && x >= stairPhysEnd - buffer && x <= stairPhysStart + buffer);

            if (inExtendedStairZone || isNearStart || isNearEnd) {
                return;
            }
        }

        const spikeChanceByStage = [0, 0.12, 0.15, 0.42, 0.56, 0.7];
        const spikeChance = spikeChanceByStage[Math.max(0, Math.min(spikeChanceByStage.length - 1, this.stageNumber - 1))];
        const type = (this.stageNumber >= 5)
            ? OBSTACLE_TYPES.SPIKE
            : (this.stageNumber === 3)
                ? OBSTACLE_TYPES.ROCK
                : (Math.random() < spikeChance ? OBSTACLE_TYPES.SPIKE : OBSTACLE_TYPES.ROCK);
        const rockChainChance = this.stageNumber === 3 ? 0.88 : 0.65;
        const rockChainCount = this.stageNumber === 3
            ? 3 + Math.floor(Math.random() * 4)
            : 2 + Math.floor(Math.random() * 3);
        if (type === OBSTACLE_TYPES.ROCK && Math.random() < rockChainChance) {
            // 岩塊の連なり。単一引き伸ばしではなく複数シルエットで道を塞ぐ。
            const chainCount = rockChainCount;
            let cursorX = x;
            for (let i = 0; i < chainCount; i++) {
                const rock = createObstacle(OBSTACLE_TYPES.ROCK, cursorX + (Math.random() * 18 - 9), this.groundY, {
                    stageNumber: this.stageNumber
                });
                this.obstacles.push(rock);
                cursorX += rock.width * (0.44 + Math.random() * 0.3);
            }
            return;
        }

        const obstacle = createObstacle(type, x, this.groundY, {
            stageNumber: this.stageNumber
        });
        this.obstacles.push(obstacle);
    }

    updateObstacles(deltaTime) {
        this.obstacles = this.obstacles.filter(obs => {
            obs.update(deltaTime);
            // 画面外（左）に出たら削除 (スクロール考慮)
            // this.progress (スクロール左端) - 100 より左なら削除
            if (obs.x + obs.width < this.progress - 100 || obs.isDestroyed) return false;
            return true;
        });
    }
    
    spawnBoss() {
        this.bossSpawned = true;

        // ボスを画面右端ギリギリ外に配置（すぐ見える＆登場感あり）
        const scrollX = (window.game && window.game.scrollX) || 0;
        const bossWidth = 140; // ボスのおおよその幅（登場位置計算用）
        const spawnX = scrollX + CANVAS_WIDTH + bossWidth * 0.5;

        this.boss = createBoss(this.stageNumber, spawnX, this.groundY, this.groundY);
        // 足元を地面に合わせる（Player系ボスは素体heightではなくワールド身長を使う）
        const bossWorldHeight = typeof this.boss.getWorldHeight === 'function'
            ? this.boss.getWorldHeight()
            : (this.boss.height || 180);
        this.boss.y = this.groundY + LANE_OFFSET - bossWorldHeight;
        // ボスを左向き（プレイヤー方向）に設定
        this.boss.facingRight = false;

        // 登場演出フラグ: 画面右端から歩き入る
        this.boss.isEntering = true;
        this.boss.entranceTargetX = scrollX + CANVAS_WIDTH * this.bossEntranceTargetRatio; // 着地目標X
        this.boss.entranceSpeed = 900; // 高速ダッシュ登場

        this.bossIntroTimer = this.bossIntroDuration;
        this.bossDefeatLingerTimer = 0;

        // 白フラッシュ演出
        this.bossEntranceFlash = 1.0;

        // ボス部屋の障害物を排除
        this.obstacles = [];
        this.obstacleTimer = 0;
    
        // 画面外の雑魚敵を消去
        this.enemies = this.enemies.filter(enemy => {
            const ex = enemy.x + enemy.width / 2;
            const isOnScreen = ex >= scrollX - 50 && ex <= scrollX + CANVAS_WIDTH + 50;
            if (!isOnScreen) {
                enemy.isAlive = false;
                enemy.isDying = true;
                return false;
            }
            return true;
        });

        // BGM切り替え
        audio.playBgm('boss', this.stageNumber, 1000, 0);
    }
    
    render(ctx) {
        this.renderBackground(ctx);
        this.renderGround(ctx);
        this.renderObstacles(ctx);
        this.renderEnemies(ctx);
        
        if (this.boss && this.bossSpawned) {
            this.boss.render(ctx);
            this.renderBossUI(ctx);
        }

        // ボス戦中の全ステージ共通演出 ─ 背景より手前（ボスより奥）に描画
        if (this.bossEncounterBlend > 0) {
            const time = this.stageTime;
            // 全ステージのヴィネット（Stage 6はrenderGroundTenshu内でも呼ぶが多重でも影響軽微）
            this.renderBossVignette(ctx, this.bossEncounterBlend);
            // 全ステージの固有パーティクル
            this.renderBossParticles(ctx, time, this.bossEncounterBlend);
        }

        // ボス登場フラッシュ演出
        if (this.bossEntranceFlash > 0) {
            ctx.save();
            ctx.fillStyle = `rgba(255, 255, 255, ${this.bossEntranceFlash * 0.55})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.restore();
            this.bossEntranceFlash = Math.max(0, this.bossEntranceFlash - 0.04);
        }
        
        // ステージ進捗バー
        this.renderProgressBar(ctx);
    }
    

    interpolateColor(colorStr1, colorStr2, factor) {
        const parseColor = (str) => {
            if (typeof str !== 'string') return { r: 0, g: 0, b: 0 };
            const color = str.trim();
            let r = 0, g = 0, b = 0;
            if (color.startsWith('#')) {
                if (color.length === 4) {
                    r = parseInt(color[1] + color[1], 16);
                    g = parseInt(color[2] + color[2], 16);
                    b = parseInt(color[3] + color[3], 16);
                } else if (color.length === 7) {
                    r = parseInt(color.substring(1, 3), 16);
                    g = parseInt(color.substring(3, 5), 16);
                    b = parseInt(color.substring(5, 7), 16);
                }
                return { r: Number.isFinite(r) ? r : 0, g: Number.isFinite(g) ? g : 0, b: Number.isFinite(b) ? b : 0 };
            }

            const rgbMatch = color.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
            if (rgbMatch) {
                r = Math.round(parseFloat(rgbMatch[1]));
                g = Math.round(parseFloat(rgbMatch[2]));
                b = Math.round(parseFloat(rgbMatch[3]));
            }
            r = Math.max(0, Math.min(255, Number.isFinite(r) ? r : 0));
            g = Math.max(0, Math.min(255, Number.isFinite(g) ? g : 0));
            b = Math.max(0, Math.min(255, Number.isFinite(b) ? b : 0));
            return { r, g, b };
        };

        const t = this.clamp01(Number.isFinite(factor) ? factor : 0);
        const c1 = parseColor(colorStr1);
        const c2 = parseColor(colorStr2);

        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);

        return `rgb(${r}, ${g}, ${b})`;
    }

    noise1D(seed) {
        const x = Math.sin(seed * 127.1 + this.stageNumber * 311.7) * 43758.5453123;
        return x - Math.floor(x);
    }

    noiseSigned(seed) {
        return this.noise1D(seed) * 2 - 1;
    }

    clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    smoothstep(edge0, edge1, x) {
        if (edge0 === edge1) return x < edge0 ? 0 : 1;
        const t = this.clamp01((x - edge0) / (edge1 - edge0));
        return t * t * (3 - 2 * t);
    }

    updateBambooLeafEffects(deltaTime) {
        if (this.stageNumber !== 1) {
            this.bambooFallingLeaves.length = 0;
            this.bambooLeafSpawnTimer = 0;
            return;
        }

        const dtMs = deltaTime * 1000;
        const dtScale = deltaTime * 60;
        
        // ボス戦中は木の葉の舞いを激しくする（殺気の演出）
        const bossActive = this.bossSpawned && !this.bossDefeated;
        const spawnMultiplier = bossActive ? 4.5 : 1.0;
        
        this.updateBambooFallingLeaves(dtMs, dtScale, spawnMultiplier);
    }

    updateBambooFallingLeaves(dtMs, dtScale, spawnMultiplier = 1.0) {

        const maxLeaves = Math.floor(12 * spawnMultiplier);
        const spawnInterval = 520 / spawnMultiplier;
        this.bambooLeafSpawnTimer += dtMs;

        // Stage1はボス戦でも竹林全域を維持し、右1/4を削る演出を行わない
        const shouldTrimBambooForBoss = this.bossSpawned && this.stageNumber !== 1;
        const spawnXMax = shouldTrimBambooForBoss
            ? CANVAS_WIDTH * 0.75
            : CANVAS_WIDTH + 60;

        const fallingCount = this.bambooFallingLeaves.filter(l => l.state === 'falling').length;
        while (this.bambooLeafSpawnTimer >= spawnInterval) {
            this.bambooLeafSpawnTimer -= spawnInterval;
            if (fallingCount >= maxLeaves) break;
            const depth = 0.45 + Math.random() * 0.55;
            const screenX = -60 + Math.random() * (spawnXMax + 60);
            this.bambooFallingLeaves.push({
                worldX: screenX + this.progress,
                y: -30 - Math.random() * 180,
                vx: (-0.22 - Math.random() * 0.5) * depth,
                vy: (0.88 + Math.random() * 1.28) * (0.82 + depth * 0.55),
                rot: Math.random() * Math.PI * 2,
                rotV: (Math.random() - 0.5) * 0.06,
                size: 6 + Math.random() * 9,
                depth,
                state: 'falling',
                groundLife: 400 + Math.random() * 400,
                maxGroundLife: 800,
                leafId: (this._leafIdCounter = ((this._leafIdCounter || 0) + 1) & 0xFFFF)
            });
        }

        for (let i = this.bambooFallingLeaves.length - 1; i >= 0; i--) {
            const leaf = this.bambooFallingLeaves[i];
            const targetY = this.groundY + LANE_OFFSET + (leaf.depth - 0.5) * 16;
            
            if (leaf.state === 'falling') {
                leaf.worldX += leaf.vx * dtScale;
                leaf.y += leaf.vy * dtScale;
                leaf.rot += leaf.rotV * dtScale + Math.sin((this.stageTime + i * 37) * 0.0038) * 0.003;
                
                if (leaf.y >= targetY) {
                    leaf.y = targetY;
                    leaf.state = 'grounded';
                    leaf.vx = 0; // 接地時に即停止
                    leaf.vy = 0;
                    leaf.rotV = 0;
                    leaf.maxGroundLife = leaf.groundLife;
                }
            } else if (leaf.state === 'grounded') {
                leaf.groundLife -= dtMs;
                
                // プレイヤーとの干渉（舞い上がり）処理は完全に削除。
                // 接地した葉は一定時間で消えるだけの演出用オブジェクトとする。

                if (leaf.groundLife <= 0) {
                    this.bambooFallingLeaves.splice(i, 1);
                    continue;
                }
            }
            // leaf.state === 'flying' のブロックも不要になったため削除

            const screenX = leaf.worldX - this.progress;
            if (screenX < -250 || screenX > CANVAS_WIDTH + 250 || leaf.y > CANVAS_HEIGHT + 100) {
                this.bambooFallingLeaves.splice(i, 1);
            }
        }
    }

    drawBambooLeaf(ctx, x, y, size, rot, color, alpha, leafId = -1, depth = 0.5) {
        if (this.cachedAssets.bambooLeaves) {
            const n = this.cachedAssets.bambooLeaves.length;
            // depth(0=奥/暗, 1=手前/明) でカラーバンドを決め、leafIdで±1の揺らぎを与える
            const hash = leafId >= 0 ? leafId : Math.abs(Math.floor(size * 17 + 0.5));
            const base = Math.round(depth * (n - 1));
            const leafIdx = (base + (hash % 3) - 1 + n * 2) % n;
            const img = this.cachedAssets.bambooLeaves[leafIdx];
            
            ctx.save();
            ctx.globalAlpha *= alpha;
            ctx.translate(x, y);
            ctx.rotate(rot);
            const scale = (size / 12);
            ctx.drawImage(img, -16 * scale, -16 * scale, 32 * scale, 32 * scale);
            ctx.restore();
        } else {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.fillStyle = color.includes('rgba') ? color : color.replace('rgb(', 'rgba(').replace(')', `, ${alpha.toFixed(3)})`);
            ctx.beginPath();
            ctx.moveTo(-size * 0.54, 0);
            ctx.quadraticCurveTo(-size * 0.1, -size * 0.42, size * 0.62, -size * 0.1);
            ctx.quadraticCurveTo(size * 0.1, size * 0.36, -size * 0.54, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = `rgba(236, 248, 220, ${(alpha * 0.48).toFixed(3)})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-size * 0.32, 0);
            ctx.lineTo(size * 0.5, -size * 0.03);
            ctx.stroke();
            ctx.restore();
        }
    }

    renderBambooFallingLeaves(ctx) {
        if (this.stageNumber !== 1 || this.bambooFallingLeaves.length === 0) return;

        ctx.save();
        for (const leaf of this.bambooFallingLeaves) {
            const screenX = leaf.worldX - this.progress;
            // 落下中または舞い上がり中
            if (leaf.state !== 'grounded') {
                this.drawBambooLeaf(ctx, screenX, leaf.y, leaf.size, leaf.rot, '', 0.5 + leaf.depth * 0.4, leaf.leafId ?? -1, leaf.depth);
            } else {
                const lifeAlpha = Math.max(0, Math.min(1, leaf.groundLife / leaf.maxGroundLife));
                this.drawBambooLeaf(ctx, screenX, leaf.y, leaf.size, leaf.rot, '', (0.4 + leaf.depth * 0.3) * lifeAlpha, leaf.leafId ?? -1, leaf.depth);
            }
        }
        ctx.restore();
    }

    renderFlowingCloudLayer(
        ctx,
        {
            time = 0,
            color = 'rgba(255, 255, 255, 0.16)',
            alpha = 0.22,
            baseY = 120,
            span = 280,
            height = 56,
            speed = 11.5,
            waveAmp = 14,
            density = 0.76,
            trail = 110
        } = {}
    ) {
        const scroll = this.progress * 0.04 + time * speed;
        const offset = ((scroll % span) + span) % span;
        const start = -3;
        const end = Math.ceil(CANVAS_WIDTH / span) + 4;

        ctx.save();
        ctx.globalAlpha *= alpha;
        for (let i = start; i <= end; i++) {
            const worldIndex = i + Math.floor(scroll / span);
            const seed = worldIndex * 3.91;
            if (this.noise1D(seed + 0.8) > density) continue;

            const x = i * span - offset + this.noiseSigned(seed + 1.6) * 48;
            const y = baseY
                + Math.sin(worldIndex * 0.72 + time * 0.82) * waveAmp
                + this.noiseSigned(seed + 2.9) * 8;
            const w = span * (0.8 + this.noise1D(seed + 3.7) * 1.1);
            const h = height * (0.74 + this.noise1D(seed + 4.4) * 0.7);
            const tailLen = trail * (0.65 + this.noise1D(seed + 5.1) * 0.9);

            const grad = ctx.createLinearGradient(x - tailLen, y, x + w * 0.9, y + h * 0.15);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.26, color);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;

            ctx.beginPath();
            ctx.moveTo(x - tailLen, y + h * 0.35);
            ctx.bezierCurveTo(
                x - tailLen * 0.25, y + h * 0.12,
                x + w * 0.06, y - h * 0.34,
                x + w * 0.28, y - h * 0.08
            );
            ctx.bezierCurveTo(
                x + w * 0.46, y - h * 0.46,
                x + w * 0.72, y - h * 0.2,
                x + w * 0.92, y + h * 0.22
            );
            ctx.bezierCurveTo(
                x + w * 0.68, y + h * 0.54,
                x + w * 0.26, y + h * 0.58,
                x - tailLen, y + h * 0.35
            );
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    getCurrentBackgroundPalette() {
        // 進行度に応じて start -> mid -> end のカラーパレットを補間して返す
        // this.maxProgress は進行度の最大値。0 ~ 1.0 に正規化
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        
        const layersConfig = this.bgLayers;
        let c1, c2, factor;

        if (p < 0.5) {
            c1 = layersConfig.start;
            c2 = layersConfig.mid;
            factor = p * 2; // 0.0 ~ 0.5 => 0.0 ~ 1.0
        } else {
            c1 = layersConfig.mid;
            c2 = layersConfig.end;
            factor = (p - 0.5) * 2; // 0.5 ~ 1.0 => 0.0 ~ 1.0
        }

        return {
            sky: [
                this.interpolateColor(c1.sky[0], c2.sky[0], factor),
                this.interpolateColor(c1.sky[1], c2.sky[1], factor)
            ],
            far: this.interpolateColor(c1.far, c2.far, factor),
            mid: this.interpolateColor(c1.mid, c2.mid, factor),
            near: this.interpolateColor(c1.near, c2.near, factor),
            elements: layersConfig.elements
        };
    }

    renderBackground(ctx) {
        const currentPalette = this.getCurrentBackgroundPalette();
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        const time = this.stageTime * 0.001;
        const isCastleInterior = currentPalette.elements === 'castle';
        const isBambooForest = currentPalette.elements === 'bamboo';
        const isTenshuStageBg = currentPalette.elements === 'tenshu';
        const bossEncounterActive = this.bossSpawned && !this.bossDefeated;
        const bossEncounterBlend = this.bossEncounterBlend;

        // ボス戦時の陽炎効果（Stage 2）
        if (this.stageNumber === 2 && bossEncounterBlend > 0) {
            this.renderHeatHaze(ctx, time, bossEncounterBlend);
        }
        
        // ボス戦中は赤みがかった空に変化（撃破後はフェードアウト）
        let skyColors = currentPalette.sky;
        if (this.stageNumber === 1) {
            // Stage1は薄暗い空から、地平線側が先に朝焼けで染まる
            const dawnT = this.smoothstep(0.08, 1, p);
            const dawnTop = this.interpolateColor('#22365f', '#a8d7f5', dawnT);
            const dawnBottom = this.interpolateColor('#564461', '#ffd1a7', dawnT);
            skyColors = [
                this.interpolateColor(skyColors[0], dawnTop, 0.72),
                this.interpolateColor(skyColors[1], dawnBottom, 0.92)
            ];
        }
        // ボス戦時の空の色変化を廃止
        
        // 空グラデーション - 垂直スクロール対応のため上下に大きく拡張
        const skyGradient = ctx.createLinearGradient(0, -400, 0, this.groundY + 400);
        skyGradient.addColorStop(0, skyColors[0]);
        skyGradient.addColorStop(1, skyColors[1]);
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);

        if (this.stageNumber === 1) {
            const dawnP = this.smoothstep(0.08, 1, p);
            const sunriseStrength = this.smoothstep(0.02, 0.96, dawnP);

            // 日の出前: 深い藍夜空のオーバーレイ（progress 0〜0.45 の夜明け前に最大、朝焼けで消える）
            const preDawnStr = 1 - this.smoothstep(0.0, 0.55, p);
            if (preDawnStr > 0.001) {
                const deepBlue = ctx.createLinearGradient(0, 0, 0, this.groundY);
                deepBlue.addColorStop(0,    `rgba(5, 8, 30, ${(0.48 * preDawnStr).toFixed(3)})`);
                deepBlue.addColorStop(0.5,  `rgba(8, 12, 38, ${(0.30 * preDawnStr).toFixed(3)})`);
                deepBlue.addColorStop(1,    `rgba(10, 14, 42, ${(0.14 * preDawnStr).toFixed(3)})`);
                ctx.fillStyle = deepBlue;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
            }
            if (sunriseStrength > 0.001) {
                // 地平線から上方向へ朝焼けが広がる縦グラデーション
                const bottomTint = ctx.createLinearGradient(0, this.groundY + 8, 0, this.groundY * 0.12);
                bottomTint.addColorStop(0, `rgba(255, 132, 74, ${(0.28 * sunriseStrength).toFixed(3)})`);
                bottomTint.addColorStop(0.24, `rgba(255, 164, 106, ${(0.20 * sunriseStrength).toFixed(3)})`);
                bottomTint.addColorStop(0.56, `rgba(255, 188, 152, ${(0.10 * sunriseStrength).toFixed(3)})`);
                bottomTint.addColorStop(0.84, `rgba(232, 170, 220, ${(0.06 * sunriseStrength).toFixed(3)})`);
                bottomTint.addColorStop(1, 'rgba(255, 220, 186, 0)');
                ctx.fillStyle = bottomTint;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

                const glow = ctx.createRadialGradient(
                    CANVAS_WIDTH * 0.24,
                    this.groundY * 0.96,
                    20,
                    CANVAS_WIDTH * 0.24,
                    this.groundY * 0.96,
                    CANVAS_WIDTH * 0.72
                );
                glow.addColorStop(0, `rgba(255, 170, 112, ${(0.34 * sunriseStrength).toFixed(3)})`);
                glow.addColorStop(0.58, `rgba(255, 122, 70, ${(0.24 * sunriseStrength).toFixed(3)})`);
                glow.addColorStop(1, 'rgba(255, 150, 88, 0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
            }
        }

        // ステージ3: 日没に近づくほど地平線の残照と上空の深い藍を重ねる
        if (this.stageNumber === 3) {
            // p が 0.5 を超えたあたりから夕暮れ色の変化が加速
            const duskStrength = this.smoothstep(0.35, 1.0, p);
            if (duskStrength > 0.001) {
                // 上空 → 深い藍のオーバーレイ（上から下へ消える）
                const deepBlue = ctx.createLinearGradient(0, 0, 0, this.groundY);
                deepBlue.addColorStop(0,    `rgba(14, 10, 48, ${(0.72 * duskStrength).toFixed(3)})`);
                deepBlue.addColorStop(0.38, `rgba(18, 12, 52, ${(0.45 * duskStrength).toFixed(3)})`);
                deepBlue.addColorStop(0.72, `rgba(20, 10, 40, ${(0.14 * duskStrength).toFixed(3)})`);
                deepBlue.addColorStop(1,    'rgba(10, 5, 20, 0)');
                ctx.fillStyle = deepBlue;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

                // 地平線の残照（下から上へ消える）
                const afterglow = ctx.createLinearGradient(0, this.groundY, 0, this.groundY * 0.55);
                afterglow.addColorStop(0,    `rgba(200, 70, 20, ${(0.38 * duskStrength).toFixed(3)})`);
                afterglow.addColorStop(0.45, `rgba(160, 40, 10, ${(0.18 * duskStrength).toFixed(3)})`);
                afterglow.addColorStop(1,    'rgba(100, 20, 5, 0)');
                ctx.fillStyle = afterglow;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
            }
        }

        // ステージ6: 月が沈んだ後（progress 0.4〜0.92）の深い青い夜空
        if (this.stageNumber === 6 && !this.bossSpawned) {
            const moonGoneStart = 0.4;
            const moonGoneEnd = 0.92;
            if (p >= moonGoneStart && p <= moonGoneEnd) {
                const localP = (p - moonGoneStart) / (moonGoneEnd - moonGoneStart);
                // 入り: 0→0.1 でフェードイン、出: 0.85→1.0 でフェードアウト
                const inFade  = this.smoothstep(0, 0.10, localP);
                const outFade = 1 - this.smoothstep(0.82, 1.0, localP);
                const blueStr = inFade * outFade;
                if (blueStr > 0.001) {
                    const deepNight = ctx.createLinearGradient(0, 0, 0, this.groundY);
                    deepNight.addColorStop(0,    `rgba(4, 12, 38, ${(0.82 * blueStr).toFixed(3)})`);
                    deepNight.addColorStop(0.55, `rgba(5, 14, 42, ${(0.55 * blueStr).toFixed(3)})`);
                    deepNight.addColorStop(1,    `rgba(3, 8, 22, ${(0.30 * blueStr).toFixed(3)})`);
                    ctx.fillStyle = deepNight;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
                }
            }
        }

        const bossColorActive = this.bossSpawned && !this.bossDefeated;
        const bossColorFading = this.bossSpawned && this.bossDefeated && this.bossDefeatColorFade > 0;
        
        if (bossColorActive || bossColorFading) {
            const fadeIntensity = bossColorActive ? bossEncounterBlend : this.bossDefeatColorFade;
            
            // ステージ6（天守）のボス戦時は全体を神々しい朝焼け色で染める
            if (this.stageNumber === 6) {
                const pulse = 0.55 + Math.sin(this.stageTime * 0.004) * 0.15;
                ctx.fillStyle = `rgba(255, 140, 50, ${(0.15 + pulse * 0.1) * fadeIntensity})`;
                ctx.globalCompositeOperation = 'hard-light';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                ctx.globalCompositeOperation = 'source-over';
            }
        }

        if (!isCastleInterior) {
            const isSunnyStage = this.stageNumber === 2;

            // 星・粒子
            this.renderSkyParticles(ctx, time);

            // 太陽と月の描画（星や空グラデーションの後、雲海の前）
            this.renderCelestialBodies(ctx);

            // 雲のたなびき
            if (isSunnyStage) {
                this.renderFlowingCloudLayer(ctx, {
                    time,
                    color: 'rgba(255, 255, 255, 0.2)',
                    alpha: 0.24,
                    baseY: 106,
                    span: 360,
                    height: 44,
                    speed: 16,
                    waveAmp: 10,
                    density: 0.68,
                    trail: 160
                });
                this.renderFlowingCloudLayer(ctx, {
                    time: time * 0.86,
                    color: 'rgba(242, 251, 255, 0.16)',
                    alpha: 0.2,
                    baseY: 150,
                    span: 300,
                    height: 40,
                    speed: 12,
                    waveAmp: 9,
                    density: 0.7,
                    trail: 130
                });
            } else if (this.stageNumber !== 6) {
                // ステージ6以外の通常の雲
                this.renderFlowingCloudLayer(ctx, {
                    time,
                    color: 'rgba(206, 220, 245, 0.14)',
                    alpha: 0.24,
                    baseY: 124,
                    span: 320,
                    height: 52,
                    speed: 10.5,
                    waveAmp: 15,
                    density: 0.77,
                    trail: 120
                });
                this.renderFlowingCloudLayer(ctx, {
                    time: time * 0.8,
                    color: 'rgba(178, 200, 232, 0.12)',
                    alpha: 0.18,
                    baseY: 170,
                    span: 280,
                    height: 44,
                    speed: 8.5,
                    waveAmp: 12,
                    density: 0.72,
                    trail: 95
                });
            }

            // 地平線の薄い霞。Stage3は夕焼けの地面境界で横帯に見えるため描かない。
            if (this.stageNumber !== 3) {
                const haze = ctx.createLinearGradient(0, this.groundY - 120, 0, this.groundY + 20);
                haze.addColorStop(0, 'rgba(255,255,255,0)');
                haze.addColorStop(1, isSunnyStage ? 'rgba(210,228,255,0.12)' : 'rgba(190,210,255,0.08)');
                ctx.fillStyle = haze;
                ctx.fillRect(0, this.groundY - 120, CANVAS_WIDTH, 150);
            }
        } else {
            // 室内の時間経過（進行に応じて朱色の光が移ろう）
            const stageP = this.clamp01(this.progress / this.maxProgress);
            const timeBlend = this.smoothstep(0, 1, stageP);

            const warmTopR = Math.round(255 + (246 - 255) * timeBlend);
            const warmTopG = Math.round(188 + (162 - 188) * timeBlend);
            const warmTopB = Math.round(122 + (96 - 122) * timeBlend);
            const warmTopA = 0.28 + (0.24 - 0.28) * timeBlend;
            const warmBottomR = Math.round(124 + (78 - 124) * timeBlend);
            const warmBottomG = Math.round(38 + (24 - 38) * timeBlend);
            const warmBottomB = Math.round(24 + (18 - 24) * timeBlend);
            const warmBottomA = 0.2 + (0.28 - 0.2) * timeBlend;
            const indoorHaze = ctx.createLinearGradient(0, -400, 0, this.groundY + 400);
            indoorHaze.addColorStop(0, `rgba(${warmTopR}, ${warmTopG}, ${warmTopB}, ${warmTopA.toFixed(3)})`);
            indoorHaze.addColorStop(1, `rgba(${warmBottomR}, ${warmBottomG}, ${warmBottomB}, ${warmBottomA.toFixed(3)})`);
            ctx.fillStyle = indoorHaze;
            ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);

            // 城内の壁面の意匠（柱と梁）
            const pillarDist = 400;
            const scroll = this.progress * 0.5; // 背景パララックス
            const pillarOffset = ((scroll % pillarDist) + pillarDist) % pillarDist;
            ctx.fillStyle = this.interpolateColor('#2a1810', '#120a05', 0.2);
            for (let i = -1; i <= Math.ceil(CANVAS_WIDTH / pillarDist) + 1; i++) {
                const px = i * pillarDist - pillarOffset;
                // 垂直の柱
                ctx.fillRect(px, -400, 20, this.groundY + 400);
            }
            // 水平の梁（鴨居・長押）
            ctx.fillRect(0, this.groundY * 0.25 - 400, CANVAS_WIDTH, 15);
            ctx.fillRect(0, this.groundY - 40, CANVAS_WIDTH, 20);

            const motes = 16;
            for (let i = 0; i < motes; i++) {
                const seed = i * 17.3;
                const x = ((this.noise1D(seed + 0.7) * CANVAS_WIDTH) + time * (6 + this.noise1D(seed + 1.4) * 10)) % CANVAS_WIDTH;
                const y = 30 + this.noise1D(seed + 2.6) * (this.groundY * 0.55);
                const r = 0.8 + this.noise1D(seed + 3.8) * 2;
                ctx.fillStyle = `rgba(248, 222, 176, ${0.08 + this.noise1D(seed + 4.9) * 0.08})`;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // ボス戦中は稲妻効果（撃破後はフェードアウト）
        const lightningActive = this.bossSpawned && !this.bossDefeated;
        const lightningFading = this.bossSpawned && this.bossDefeated && this.bossDefeatColorFade > 0.5;
        if ((lightningActive || lightningFading) && Math.sin(this.stageTime * 0.012) > 0.992) {
            const lIntensity = lightningActive ? 0.3 : (this.bossDefeatColorFade - 0.5) * 0.6;
            ctx.fillStyle = `rgba(255, 255, 255, ${lIntensity})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        if (!isCastleInterior) {
            // 遠景（ゆっくりスクロール 0.2）
            if (!isBambooForest && !isTenshuStageBg) {
                this.renderBackgroundLayer(ctx, currentPalette.far, 0.2, 0.7, 100);
                
                // 中景 (0.4)
                this.renderBackgroundLayer(ctx, currentPalette.mid, 0.4, 0.8, 60);
                
                // 近景 (0.7)
                this.renderBackgroundLayer(ctx, currentPalette.near, 0.7, 1.0, 20);
            }
        }
        
        // ステージ固有の背景要素
        this.renderStageElements(ctx, currentPalette);

        // ボス部屋の右3/4付近から次ステージへの「出入口」を描画
        if (this.stageNumber >= 1 && this.stageNumber <= 5) {
            this.renderNextStagePeek(ctx);
        }

        // ボス登場の瞬間演出は前面寄りに描いて、どのステージでも視認できるようにする
        if (bossEncounterActive && this.bossIntroTimer > 0) {
            this.renderBossStageShift(ctx, bossEncounterBlend);
        }

        // 周辺減光で中央へ視線誘導
        const vignette = ctx.createRadialGradient(
            CANVAS_WIDTH * 0.5, this.groundY * 0.45, CANVAS_WIDTH * 0.12,
            CANVAS_WIDTH * 0.5, this.groundY * 0.45, CANVAS_WIDTH * 0.75
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);

        // 地面との境界に影を落とす（室内のみ）
        if (isCastleInterior) {
            const shadowGrad = ctx.createLinearGradient(0, this.groundY - 60, 0, this.groundY);
            shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
            ctx.fillStyle = shadowGrad;
            ctx.fillRect(0, this.groundY - 60, CANVAS_WIDTH, 65);
        }
    }

    // ボス部屋の右3/4から画面右端にかけて次ステージへの「出入口」を描画
    // 空はそのままに、地形・建造物だけを右端に固定配置する
    renderNextStagePeek(ctx) {
        const gY   = this.groundY;
        const p    = this.progress;
        const time = this.stageTime * 0.001;
        // 近景パララックス(0.98)でスクロール追従
        // progress が maxProgress に近づくにつれ右端に見えてくる
        const peekPara = 0.98;
        // ボス部屋の右端 = maxProgress + CANVAS_WIDTH
        // 「出口」要素は maxProgress + CANVAS_WIDTH*0.68 付近に配置
        // スクリーンx = (worldX - p) * peekPara  ただしp=this.progress（生値）
        const peekBase = this.maxProgress - 150; // 山道入口を画面右端寄りに（手前の家と分離・見切れ防止）
        const peekAnchorX = (peekBase - p) * peekPara; // 基準点のスクリーンx

        // 固定スクリーン座標→ワールド追従への変換。カメラ停止時(p=maxProgress-CANVAS_WIDTH)に
        // peekAnchorX===ANCHOR_STOP となり peekWX(xFixed)===xFixed。停止時の見た目を保持しつつ接近中は右から流入。
        const ANCHOR_STOP = (peekBase - (this.maxProgress - CANVAS_WIDTH)) * peekPara;
        const peekWX = (xFixed) => peekAnchorX + (xFixed - ANCHOR_STOP);

        // 完全に画面外右ならスキップ
        if (peekAnchorX > CANVAS_WIDTH + 600) return;

        // 画面右端に近づくにつれフェードイン（400px幅でなめらかに）
        const posBlend = Math.max(0, Math.min(1, (CANVAS_WIDTH + 400 - peekAnchorX) / 400));
        // stage2は元からワールド配置＋不透明。stage3/4/5もワールド配置にしてスクロールでフレームイン
        // （ボス出現に依存しない位置ベースfade）。stage1は従来どおりボス連動。
        const rawBlend = this.stageNumber === 2
            ? 1
            : (this.stageNumber >= 3
                ? posBlend
                : (this.bossDefeated ? posBlend : posBlend * this.bossEncounterBlend));
        if (rawBlend <= 0) return;

        ctx.save();
        ctx.globalAlpha = rawBlend;

        switch (this.stageNumber) {

            // ─── Stage1（竹林） → Stage2（街道）───────────────────────────
            case 1: {
                // ワールド座標で要素配置。スクリーンx = (worldX - p) * peekPara
                const toSx = (wx) => (wx - p) * peekPara;
                const bossRoomWidth = CANVAS_WIDTH;

                // 竹のクリップ右端は CANVAS_WIDTH * 0.75 なので peek 要素はその右に配置
                const bambooClipX = CANVAS_WIDTH * 0.75;
                const roadStartSx = toSx(this.maxProgress + bossRoomWidth * 0.76); // 土道の始まり
                const ichirizukaSx = toSx(this.maxProgress + bossRoomWidth * 0.88); // 一里塚

                // ── 竹林の切れ目から差し込む朝の光（水平グロー）──
                const glowLeft = Math.max(bambooClipX, roadStartSx - 20);
                if (glowLeft < CANVAS_WIDTH) {
                    const exitGlow = ctx.createLinearGradient(glowLeft, gY, glowLeft, gY - 200);
                    exitGlow.addColorStop(0,   'rgba(255, 230, 180, 0.22)');
                    exitGlow.addColorStop(0.5, 'rgba(255, 210, 140, 0.08)');
                    exitGlow.addColorStop(1,   'rgba(255, 200, 120, 0)');
                    ctx.fillStyle = exitGlow;
                    ctx.fillRect(glowLeft, 0, CANVAS_WIDTH - glowLeft, gY);
                }

                // ── 街道の土道（平坦・竹林とは対照的な開けた地面）──
                if (roadStartSx < CANVAS_WIDTH) {
                    const roadGrad = ctx.createLinearGradient(roadStartSx, 0, roadStartSx + 80, 0);
                    roadGrad.addColorStop(0, 'rgba(188, 158, 110, 0)');
                    roadGrad.addColorStop(1, 'rgba(188, 158, 110, 1)');
                    ctx.fillStyle = roadGrad;
                    ctx.fillRect(roadStartSx, gY, CANVAS_WIDTH - roadStartSx, CANVAS_HEIGHT - gY);
                    ctx.fillStyle = '#bc9e6e';
                    ctx.fillRect(Math.min(roadStartSx + 80, CANVAS_WIDTH), gY, CANVAS_WIDTH - Math.min(roadStartSx + 80, CANVAS_WIDTH), CANVAS_HEIGHT - gY);
                }

                // ── 一里塚（土盛り＋石標柱）──
                if (ichirizukaSx < CANVAS_WIDTH + 60) {
                    const ix = ichirizukaSx;
                    const iy = gY;

                    // 土盛り
                    ctx.fillStyle = this.interpolateColor('#8a7248', '#5a4830', 0.4);
                    ctx.beginPath();
                    ctx.ellipse(ix + 22, iy, 38, 18, 0, Math.PI, Math.PI * 2);
                    ctx.fill();
                    // 土盛りの草
                    ctx.fillStyle = this.interpolateColor('#6a8c50', '#3e5830', 0.4);
                    ctx.beginPath();
                    ctx.ellipse(ix + 22, iy - 16, 32, 10, 0, Math.PI, Math.PI * 2);
                    ctx.fill();

                    // 石標（四角柱）
                    ctx.fillStyle = this.interpolateColor('#9a9488', '#5e5a54', 0.35);
                    ctx.fillRect(ix + 16, iy - 52, 12, 38);
                    // 石標の頭（丸み）
                    ctx.beginPath();
                    ctx.arc(ix + 22, iy - 52, 6, Math.PI, 0);
                    ctx.fill();
                    // 刻み線
                    ctx.strokeStyle = 'rgba(40, 35, 28, 0.35)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(ix + 16, iy - 42); ctx.lineTo(ix + 28, iy - 42);
                    ctx.moveTo(ix + 16, iy - 34); ctx.lineTo(ix + 28, iy - 34);
                    ctx.stroke();
                    // 影
                    ctx.fillStyle = 'rgba(20, 15, 10, 0.18)';
                    ctx.fillRect(ix + 25, iy - 52, 3, 38);
                }

                break;
            }

            // ─── Stage2（街道・昼） → Stage3（山道・昼〜夕方入口）──────────────
            // 街道の先に、夕暮れ(逢魔が時)の山道入口=stage3 を予感させる（ワールド座標でスクロールにフレームイン）
            case 2: {
                const CW = CANVAS_WIDTH;
                const bY = gY; // 地平線基準（他ステージ共通の奥行き）
                const ax = peekAnchorX; // 入口の基準スクリーンx。scrollXに追従して右から流れ込む
                // 岩山本体（昼の岩肌＝灰褐色。ゴツゴツした稜線で右に迫る。緑要素は使わない）
                // 高さを増して家(二階建て≒230px)より十分高い山に見せる。my()=高さvを倍率付きでスクリーンyへ
                const mH = 1.5;            // 主稜線の高さ倍率
                const my = (v) => bY - v * mH;
                const mtnGrad = ctx.createLinearGradient(0, bY - 470, 0, bY);
                mtnGrad.addColorStop(0, '#7c766b');
                mtnGrad.addColorStop(1, '#403a32');
                ctx.fillStyle = mtnGrad;
                ctx.beginPath();
                ctx.moveTo(ax - 300, bY);
                ctx.lineTo(ax - 200, my(142));
                ctx.lineTo(ax - 130, my(104));
                ctx.lineTo(ax - 44, my(232));
                ctx.lineTo(ax + 30, my(178));
                ctx.lineTo(ax + 104, my(292));
                ctx.lineTo(ax + 178, my(210));
                ctx.lineTo(ax + 260, my(258));
                ctx.lineTo(ax + 354, my(192));
                ctx.lineTo(CW + 80, my(226));
                ctx.lineTo(CW + 80, bY);
                ctx.closePath();
                ctx.fill();
                // 岩肌の影（峰の右斜面）
                ctx.fillStyle = 'rgba(42,35,28,0.32)';
                ctx.beginPath();
                ctx.moveTo(ax + 104, my(292));
                ctx.lineTo(ax + 178, my(210));
                ctx.lineTo(ax + 134, my(150));
                ctx.lineTo(ax + 72, my(196));
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(ax - 44, my(232));
                ctx.lineTo(ax + 30, my(178));
                ctx.lineTo(ax - 8, my(120));
                ctx.lineTo(ax - 54, my(168));
                ctx.closePath();
                ctx.fill();
                // 日向側のハイライト（左斜面）
                ctx.fillStyle = 'rgba(220,212,196,0.13)';
                ctx.beginPath();
                ctx.moveTo(ax + 104, my(292));
                ctx.lineTo(ax + 30, my(178));
                ctx.lineTo(ax + 66, my(150));
                ctx.lineTo(ax + 88, my(210));
                ctx.closePath();
                ctx.fill();
                // 露出した岩の段（横の筋）
                ctx.strokeStyle = 'rgba(52,44,36,0.32)';
                ctx.lineWidth = 1.5;
                for (let r = 0; r < 3; r++) {
                    const ry = bY - (70 + r * 46) * mH;
                    ctx.beginPath();
                    ctx.moveTo(ax - 120 + r * 34, ry);
                    ctx.lineTo(ax + 80 + r * 56, ry - 10);
                    ctx.lineTo(ax + 232 + r * 34, ry + 5);
                    ctx.stroke();
                }
                // 手前の尾根（低い岩・濃い灰褐色）
                ctx.fillStyle = '#352f28';
                ctx.beginPath();
                ctx.moveTo(ax - 240, bY);
                ctx.lineTo(ax - 140, my(96));
                ctx.lineTo(ax - 58, my(64));
                ctx.lineTo(ax + 44, my(138));
                ctx.lineTo(ax + 134, my(92));
                ctx.lineTo(ax + 234, my(130));
                ctx.lineTo(ax + 356, my(80));
                ctx.lineTo(CW + 80, my(104));
                ctx.lineTo(CW + 80, bY);
                ctx.closePath();
                ctx.fill();
                // 明神鳥居（朱・昼）。山に対して大きすぎないよう控えめに、笠木は端が反り上がる明神形
                const tx = ax, tH = 118, tW = 90, pw = 10;
                const tTop = bY - tH;
                const nukiY = bY - tH * 0.6;
                ctx.fillStyle = '#b83418';
                ctx.fillRect(tx - pw / 2, tTop, pw, tH);                         // 左柱
                ctx.fillRect(tx + tW - pw / 2, tTop, pw, tH);                    // 右柱
                ctx.fillRect(tx - 9, nukiY, tW + 18, 7);                         // 貫
                ctx.fillRect(tx + tW / 2 - 5, tTop + 9, 10, nukiY - tTop - 9);   // 額束
                ctx.fillStyle = '#a62b11';
                ctx.fillRect(tx - 16, tTop, tW + 32, 9);                         // 島木
                ctx.beginPath();                                                  // 笠木（端が反り上がる）
                ctx.moveTo(tx - 24, tTop - 12);
                ctx.quadraticCurveTo(tx + tW / 2, tTop + 2, tx + tW + 24, tTop - 12);
                ctx.lineTo(tx + tW + 24, tTop - 4);
                ctx.quadraticCurveTo(tx + tW / 2, tTop + 8, tx - 24, tTop - 4);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = 'rgba(60,18,8,0.28)';                            // 柱の陰
                ctx.fillRect(tx + pw / 2 - 3, tTop, 3, tH);
                ctx.fillRect(tx + tW + pw / 2 - 3, tTop, 3, tH);
                // 山裾の霞（昼の薄青）
                const hz = ctx.createLinearGradient(0, bY - 70, 0, bY);
                hz.addColorStop(0, 'rgba(200,212,224,0)');
                hz.addColorStop(1, 'rgba(200,212,224,0.3)');
                ctx.fillStyle = hz;
                ctx.fillRect(ax - 260, bY - 64, CW + 60 - (ax - 260), 64);
                break;
            }

            // ─── Stage3（山道） → Stage4（城下町）───────────────────────────
            // 山道を抜けた先に城下町の屋根が見える。瓦屋根のシルエットと石畳の始まり
            case 3: {
                // 山道が右へ抜けて城下町へ向かう、進行方向に沿った峠の出口。
                const wp = 0.6 + Math.sin(time * 1.6) * 0.4; // 灯りの脈動
                const peekGlow = (gx, gyy, r, a) => {
                    const grd = ctx.createRadialGradient(gx, gyy, 0, gx, gyy, r);
                    grd.addColorStop(0, `rgba(255, 200, 122, ${a.toFixed(3)})`);
                    grd.addColorStop(0.5, `rgba(255, 168, 94, ${(a * 0.38).toFixed(3)})`);
                    grd.addColorStop(1, 'rgba(255, 160, 90, 0)');
                    ctx.fillStyle = grd;
                    ctx.beginPath(); ctx.arc(gx, gyy, r, 0, Math.PI * 2); ctx.fill();
                };

                const exitImg = this.stage3ExitImage;
                if (exitImg && exitImg.complete && exitImg.naturalWidth > 0) {
                    const exitW = 410;
                    const exitH = exitW * (exitImg.naturalHeight / exitImg.naturalWidth);
                    const exitX = peekWX(CANVAS_WIDTH * 0.53);
                    const exitY = gY - exitH + 24;
                    ctx.save();
                    ctx.globalAlpha *= 0.96;
                    ctx.drawImage(exitImg, exitX, exitY, exitW, exitH);
                    ctx.restore();
                    peekGlow(exitX + exitW * 0.42, exitY + exitH * 0.55, 18, 0.12 * wp);
                }

                break;
            }

            // ─── Stage4（城下町） → Stage5（城内）───────────────────────────
            // 城の大門に到達。巨大な城門と石垣が右端を塞いでいる
            case 4: {
                // 巨大な戦国の城の最下層に到達。扇の勾配の石垣と櫓門が画面いっぱいにそびえ、上端は画面外へ続く
                const baseTopY = -60;                          // 石垣上端（画面外）＝城が巨大である表現
                const castleL = peekWX(CANVAS_WIDTH * 0.55);   // 石垣の地上左端
                const castleR = peekWX(CANVAS_WIDTH) + 160;    // 右端（画面外右へ）
                const topLeftX = castleL + 88;                 // 扇の勾配で上ほど内側
                const gatePulse = 0.62 + Math.sin(time * 1.7) * 0.38;
                const leftEdgeAt = (y) => castleL + 88 * (gY - y) / (gY - baseTopY);
                const cGlow = (gx, gyy, r, a, hot) => {
                    const core = hot ? '255, 156, 78' : '255, 204, 128';
                    const grd = ctx.createRadialGradient(gx, gyy, 0, gx, gyy, r);
                    grd.addColorStop(0, `rgba(${core}, ${a.toFixed(3)})`);
                    grd.addColorStop(0.5, `rgba(${core}, ${(a * 0.4).toFixed(3)})`);
                    grd.addColorStop(1, `rgba(${core}, 0)`);
                    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(gx, gyy, r, 0, Math.PI * 2); ctx.fill();
                };

                // ── 巨大な石垣（扇の勾配・上端は画面外） ──
                const stoneGrad = ctx.createLinearGradient(0, baseTopY, 0, gY);
                stoneGrad.addColorStop(0, this.interpolateColor('#565660', '#2c2b33', 0.42));
                stoneGrad.addColorStop(1, this.interpolateColor('#33323a', '#161620', 0.5));
                ctx.fillStyle = stoneGrad;
                ctx.beginPath();
                ctx.moveTo(topLeftX, baseTopY);
                ctx.lineTo(castleR, baseTopY);
                ctx.lineTo(castleR, gY);
                ctx.lineTo(castleL, gY);
                ctx.lineTo(castleL + 22, gY - 64);   // 反りの裾（扇の勾配）
                ctx.closePath();
                ctx.fill();

                // 石積みの目地（横は反りに沿い、縦は乱積み）
                ctx.strokeStyle = 'rgba(126, 132, 148, 0.20)';
                ctx.lineWidth = 1.2;
                let stoneRow = 0;
                for (let y = gY - 30; y > baseTopY; y -= 30) {
                    const lx = leftEdgeAt(y) + 4;
                    ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(castleR, y); ctx.stroke();
                    for (let xx = lx + 46 + (stoneRow % 2) * 26; xx < castleR; xx += 56) {
                        ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + 30); ctx.stroke();
                    }
                    stoneRow++;
                }
                // 左隅の稜線ハイライト（月光）
                ctx.strokeStyle = 'rgba(184, 204, 242, 0.14)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(castleL, gY); ctx.lineTo(topLeftX, baseTopY); ctx.stroke();

                // ── 大手門の門口（石垣の裾に穿たれた巨大な入口） ──
                const gateW = 250, gateH = 176;
                const gateX = castleL + 150;
                const gateY = gY - gateH;
                ctx.fillStyle = this.interpolateColor('#42414a', '#1e1d23', 0.5);
                ctx.fillRect(gateX - 26, gateY - 4, 26, gateH + 4);
                ctx.fillRect(gateX + gateW, gateY - 4, 26, gateH + 4);
                ctx.fillStyle = 'rgba(8, 7, 9, 0.96)';
                ctx.fillRect(gateX, gateY, gateW, gateH);
                const halfW = gateW * 0.47;
                ctx.fillStyle = this.interpolateColor('#4a3826', '#231a10', 0.42);
                ctx.fillRect(gateX + 4, gateY + 8, halfW, gateH - 10);
                ctx.fillRect(gateX + gateW - halfW - 4, gateY + 8, halfW, gateH - 10);
                ctx.fillStyle = 'rgba(150, 128, 88, 0.4)';
                for (let r = 0; r < 4; r++) {
                    const by = gateY + 26 + r * 42;
                    ctx.fillRect(gateX + 4, by, halfW, 5);
                    ctx.fillRect(gateX + gateW - halfW - 4, by, halfW, 5);
                }
                ctx.fillStyle = `rgba(255, 184, 96, ${(0.6 * gatePulse).toFixed(3)})`;
                ctx.fillRect(gateX + gateW * 0.5 - 5, gateY + 12, 10, gateH - 22);
                cGlow(gateX + gateW * 0.5, gateY + gateH * 0.55, 150, 0.55 * gatePulse, true);

                // ── 渡櫓（門の上に乗る白漆喰の櫓＝戦国の櫓門） ──
                const yaX = gateX - 42, yaW = gateW + 84, yaH = 86;
                const yaY = gateY - yaH - 6;
                ctx.fillStyle = this.interpolateColor('#3c3b43', '#1a191f', 0.5); // 石落としの台
                ctx.fillRect(yaX - 10, gateY - 14, yaW + 20, 14);
                ctx.fillStyle = this.interpolateColor('#d6cebd', '#726a5b', 0.26); // 白漆喰壁
                ctx.fillRect(yaX, yaY, yaW, yaH);
                ctx.fillStyle = this.interpolateColor('#2e2620', '#14100b', 0.4);  // 腰の下見板
                ctx.fillRect(yaX, yaY + yaH * 0.6, yaW, yaH * 0.4);
                // 狭間（鉄砲狭間=四角／矢狭間=三角）
                ctx.fillStyle = 'rgba(20, 18, 22, 0.88)';
                for (let s = 0; s < 7; s++) {
                    const sx = yaX + 28 + s * ((yaW - 56) / 6);
                    if (s % 2 === 0) ctx.fillRect(sx - 5, yaY + 20, 10, 14);
                    else { ctx.beginPath(); ctx.moveTo(sx, yaY + 18); ctx.lineTo(sx - 8, yaY + 34); ctx.lineTo(sx + 8, yaY + 34); ctx.closePath(); ctx.fill(); }
                }
                // 格子窓（灯り）
                const winXs = [yaX + yaW * 0.34, yaX + yaW * 0.58];
                ctx.fillStyle = `rgba(255, 206, 130, ${(0.55 * gatePulse).toFixed(3)})`;
                for (const wxs of winXs) ctx.fillRect(wxs, yaY + 16, 30, 22);
                ctx.strokeStyle = 'rgba(40, 32, 22, 0.6)'; ctx.lineWidth = 1;
                for (const wxs of winXs) for (let g = 1; g < 3; g++) { ctx.beginPath(); ctx.moveTo(wxs + g * 10, yaY + 16); ctx.lineTo(wxs + g * 10, yaY + 38); ctx.stroke(); }
                cGlow(yaX + yaW * 0.5, yaY + 28, 90, 0.3 * gatePulse, false);
                // 渡櫓の反り瓦の大屋根
                const ry = yaY;
                ctx.fillStyle = this.interpolateColor('#3f4858', '#1b212c', 0.54);
                ctx.beginPath();
                ctx.moveTo(yaX - 58, ry + 4);
                ctx.quadraticCurveTo(yaX + yaW * 0.5, ry - 70, yaX + yaW + 58, ry + 4);
                ctx.lineTo(yaX + yaW + 42, ry + 22);
                ctx.quadraticCurveTo(yaX + yaW * 0.5, ry - 42, yaX - 42, ry + 22);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = this.interpolateColor('#2a313d', '#12161d', 0.5); // 大棟
                ctx.fillRect(yaX + yaW * 0.5 - 44, ry - 64, 88, 8);
                // 両端の鯱（金）
                ctx.fillStyle = `rgba(255, 220, 120, ${(0.62 + Math.sin(time * 2) * 0.3).toFixed(3)})`;
                ctx.fillRect(yaX + yaW * 0.5 - 46, ry - 76, 6, 14);
                ctx.fillRect(yaX + yaW * 0.5 + 40, ry - 76, 6, 14);
                // 屋根の月リム
                ctx.strokeStyle = 'rgba(190, 208, 244, 0.16)'; ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(yaX - 54, ry + 2);
                ctx.quadraticCurveTo(yaX + yaW * 0.5, ry - 70, yaX + yaW * 0.5, ry - 68);
                ctx.stroke();

                // 門前の篝火（左右・スケール感と暖かみ）
                for (let side = 0; side < 2; side++) {
                    const fx = side === 0 ? gateX - 50 : gateX + gateW + 50;
                    ctx.strokeStyle = 'rgba(40, 34, 26, 0.85)'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(fx, gY); ctx.lineTo(fx, gY - 46); ctx.stroke();
                    ctx.fillStyle = 'rgba(50, 42, 30, 0.9)';
                    ctx.beginPath(); ctx.arc(fx, gY - 50, 9, 0, Math.PI * 2); ctx.fill();
                    const fp = 0.6 + Math.sin(time * 4 + side * 2) * 0.4;
                    ctx.fillStyle = `rgba(255, 180, 90, ${(0.85 * fp).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.moveTo(fx - 7, gY - 52);
                    ctx.quadraticCurveTo(fx - 3, gY - 70, fx, gY - 78);
                    ctx.quadraticCurveTo(fx + 3, gY - 70, fx + 7, gY - 52);
                    ctx.closePath(); ctx.fill();
                    cGlow(fx, gY - 58, 56, 0.7 * fp, true);
                }
                break;
            }

            // ─── Stage5（城内） → Stage6（天守閣）──────────────────────────
            // 回廊の突き当たりに天守閣への急な石段が現れる
            case 5: {
                // 石段（右端中央〜右端にかけてパース付き）
                const stairRightX = peekWX(CANVAS_WIDTH); // 石段/天守の右端（画面右端のワールド追従）
                const stairBaseX = peekWX(CANVAS_WIDTH * 0.72);
                const stairTopX  = peekWX(CANVAS_WIDTH * 0.78);
                const stairTopY  = gY - 200;
                const steps = 10;
                for (let s = 0; s < steps; s++) {
                    const t2 = s / steps;
                    const x0 = stairBaseX + (stairTopX - stairBaseX) * t2;
                    const y0 = gY - (gY - stairTopY) * t2;
                    const y1 = gY - (gY - stairTopY) * ((s + 1) / steps);
                    const stepW = stairRightX - x0 + 20;
                    // 踏み面
                    ctx.fillStyle = this.interpolateColor('#3a3430', '#1a1816', 0.38 + t2 * 0.3);
                    ctx.fillRect(x0, y0 - 3, stepW, 6);
                    // 蹴込（段の立面）
                    ctx.fillStyle = this.interpolateColor('#282422', '#121010', 0.45);
                    ctx.fillRect(x0, y0 - 3, stepW, y1 - y0 + 3);
                    // 石の目地
                    ctx.strokeStyle = 'rgba(20, 18, 16, 0.5)';
                    ctx.lineWidth = 1;
                    for (let j = 1; j < 4; j++) {
                        ctx.beginPath();
                        ctx.moveTo(x0 + stepW * (j / 4), y0 - 3);
                        ctx.lineTo(x0 + stepW * (j / 4), y1);
                        ctx.stroke();
                    }
                }

                // 石段の上に天守の最下層屋根が見える
                const tenshuRoofX = peekWX(CANVAS_WIDTH * 0.74);
                const tenshuRoofY = stairTopY - 20;
                const tenshuRoofW = stairRightX - tenshuRoofX + 30;
                ctx.fillStyle = this.interpolateColor('#424a5a', '#1e2230', 0.46);
                ctx.fillRect(tenshuRoofX + 20, tenshuRoofY + 24, tenshuRoofW - 20, gY - stairTopY + 10);
                ctx.fillStyle = this.interpolateColor('#4a5468', '#202636', 0.48);
                ctx.beginPath();
                ctx.moveTo(tenshuRoofX, tenshuRoofY + 28);
                ctx.quadraticCurveTo(tenshuRoofX + tenshuRoofW * 0.46, tenshuRoofY - 38, stairRightX + 30, tenshuRoofY + 28);
                ctx.lineTo(stairRightX + 30, tenshuRoofY + 44);
                ctx.quadraticCurveTo(tenshuRoofX + tenshuRoofW * 0.46, tenshuRoofY - 22, tenshuRoofX - 12, tenshuRoofY + 44);
                ctx.closePath();
                ctx.fill();

                // 石段の両脇の石灯籠
                for (let side = 0; side < 2; side++) {
                    const lx = peekWX(CANVAS_WIDTH * (0.74 + side * 0.14));
                    const lGY = gY - 80 * (lx - stairBaseX) / (stairRightX - stairBaseX);
                    const lH  = 44;
                    ctx.fillStyle = this.interpolateColor('#6a6460', '#2e2a28', 0.38);
                    ctx.fillRect(lx + 7, lGY - lH, 10, lH);
                    ctx.fillRect(lx + 1, lGY - lH - 5, 22, 5);
                    ctx.fillRect(lx - 2, lGY - lH - 14, 28, 9);
                    const lPulse2 = 0.5 + Math.sin(time * 1.6 + side * 3.1) * 0.5;
                    ctx.fillStyle = `rgba(220, 200, 130, ${0.35 * lPulse2})`;
                    ctx.fillRect(lx + 2, lGY - lH - 12, 20, 7);
                }
                break;
            }
        }

        ctx.restore();
    }

    renderBossStageShift(ctx, encounterBlend) {
        const t = this.smoothstep(0, 1, this.clamp01(encounterBlend));
        const ease = 1 - Math.pow(1 - t, 2.2);
        const paletteByStage = {
            1: { top: '24, 35, 31', bottom: '74, 42, 30', flash: '255, 202, 152' },
            2: { top: '30, 18, 18', bottom: '92, 20, 14', flash: '255, 164, 126' },
            3: { top: '20, 22, 40', bottom: '72, 30, 48', flash: '218, 186, 255' },
            4: { top: '14, 16, 24', bottom: '58, 34, 22', flash: '255, 192, 138' },
            5: { top: '44, 8, 30', bottom: '108, 14, 24', flash: '255, 176, 130' },
            6: { top: '20, 16, 28', bottom: '76, 30, 24', flash: '255, 190, 144' }
        };
        const palette = paletteByStage[this.stageNumber] || paletteByStage[6];

        // 1) 全体色を先に薄く重ねる
        const baseGrad = ctx.createLinearGradient(0, 0, 0, this.groundY);
        baseGrad.addColorStop(0, `rgba(${palette.top}, ${(0.1 + ease * 0.23).toFixed(3)})`);
        baseGrad.addColorStop(1, `rgba(${palette.bottom}, ${(0.12 + ease * 0.28).toFixed(3)})`);
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

        // 2) 左→右へ一度だけ流れるワイプ。中央の明部を残してスピーディに通過させる
        const sweepHalf = CANVAS_WIDTH * 0.32;
        const sweepCenterX = -sweepHalf + ease * (CANVAS_WIDTH + sweepHalf * 2);
        const sweepGrad = ctx.createLinearGradient(
            sweepCenterX - sweepHalf,
            0,
            sweepCenterX + sweepHalf,
            0
        );
        sweepGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        sweepGrad.addColorStop(0.32, `rgba(${palette.top}, ${(0.18 + ease * 0.14).toFixed(3)})`);
        sweepGrad.addColorStop(0.5, `rgba(${palette.flash}, ${(0.24 + ease * 0.28).toFixed(3)})`);
        sweepGrad.addColorStop(0.68, `rgba(${palette.bottom}, ${(0.2 + ease * 0.16).toFixed(3)})`);
        sweepGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = sweepGrad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

        // 3) ワイプ通過後に目標色へ収束
        const settle = this.clamp01((t - 0.58) / 0.42);
        if (settle > 0) {
            const settleGrad = ctx.createLinearGradient(0, 0, 0, this.groundY);
            settleGrad.addColorStop(0, `rgba(${palette.top}, ${(settle * 0.18).toFixed(3)})`);
            settleGrad.addColorStop(1, `rgba(${palette.bottom}, ${(settle * 0.22).toFixed(3)})`);
            ctx.fillStyle = settleGrad;
            ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
        }
    }
    
    // Yオフセットを引数に追加して、層の重なりを見栄え良くする
    renderBackgroundLayer(ctx, color, parallax, alpha, yOffsetBase = 50) {
        ctx.globalAlpha = alpha;

        const segmentBase = 230 + parallax * 130;
        const scroll = this.progress * parallax;
        const offset = ((scroll % segmentBase) + segmentBase) % segmentBase;
        const start = -2;
        const end = Math.ceil(CANVAS_WIDTH / segmentBase) + 3;

        for (let i = start; i <= end; i++) {
            const worldIndex = i + Math.floor(scroll / segmentBase);
            const seed = worldIndex * (8.17 + parallax * 4.31);

            const ridgeW = segmentBase * (0.8 + this.noise1D(seed + 0.93) * 0.95);
            const x = i * segmentBase - offset + this.noiseSigned(seed + 1.27) * (segmentBase * 0.18);

            const hA = Math.max(22, yOffsetBase + 24 + this.noiseSigned(seed + 2.11) * 38);
            const hB = Math.max(18, yOffsetBase + 10 + this.noiseSigned(seed + 3.73) * 34);
            const hC = Math.max(12, yOffsetBase - 8 + this.noiseSigned(seed + 5.19) * 28);
            const hD = Math.max(10, yOffsetBase - 2 + this.noiseSigned(seed + 6.41) * 24);

            ctx.beginPath();
            ctx.moveTo(x - 24, this.groundY);
            ctx.lineTo(x - 24, this.groundY - hC * 0.4);
            ctx.bezierCurveTo(
                x + ridgeW * 0.12, this.groundY - hA,
                x + ridgeW * 0.3, this.groundY - hB,
                x + ridgeW * 0.52, this.groundY - hC
            );
            ctx.bezierCurveTo(
                x + ridgeW * 0.72, this.groundY - hD,
                x + ridgeW * 0.86, this.groundY - hA * 0.62,
                x + ridgeW + 26, this.groundY - hD * 0.3
            );
            ctx.lineTo(x + ridgeW + 26, this.groundY);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            // 立体感：稜線付近を明るく、裾を暗くするグラデを同じ山シェイプに重ねる
            const shade = ctx.createLinearGradient(0, this.groundY - hA, 0, this.groundY);
            shade.addColorStop(0, `rgba(255,255,255,${0.07 * alpha})`);
            shade.addColorStop(0.45, 'rgba(255,255,255,0)');
            shade.addColorStop(1, `rgba(24,34,50,${0.16 * alpha})`);
            ctx.fillStyle = shade;
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + 0.04 * alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();

            if (parallax > 0.35 && this.bgLayers.elements !== 'kaido' && this.bgLayers.elements !== 'bamboo' && this.bgLayers.elements !== 'mountain') {
                const decoRoll = this.noise1D(seed + 9.17);
                const flatColor = this.interpolateColor(
                    color,
                    '#0a0a0a',
                    0.2 + this.noise1D(seed + 4.9) * 0.18
                );
                const ridgeTopY = this.groundY - Math.max(hB, hC);
                ctx.fillStyle = flatColor;

                if (decoRoll > 0.84) {
                    const tx = x + ridgeW * (0.18 + this.noise1D(seed + 11.1) * 0.46);
                    const postH1 = 28 + this.noise1D(seed + 12.3) * 26;
                    const postH2 = 22 + this.noise1D(seed + 13.7) * 22;
                    ctx.fillRect(tx, ridgeTopY + 10, 9, -postH1);
                    ctx.fillRect(tx + 30, ridgeTopY + 10, 9, -postH2);
                    ctx.fillRect(tx - 8, ridgeTopY - postH2 + 6, 55, -7);
                    ctx.beginPath();
                    ctx.moveTo(tx + 32, ridgeTopY - 4);
                    ctx.lineTo(tx + 62, ridgeTopY - 16);
                    ctx.lineTo(tx + 58, ridgeTopY - 22);
                    ctx.lineTo(tx + 28, ridgeTopY - 10);
                    ctx.closePath();
                    ctx.fill();
                } else if (decoRoll > 0.58) {
                    const tx = x + ridgeW * (0.3 + this.noise1D(seed + 14.2) * 0.4);
                    const trunkH = 28 + this.noise1D(seed + 15.4) * 42;
                    const trunkW = 3.5 + this.noise1D(seed + 16.1) * 2.2;
                    ctx.fillRect(tx + 4 - trunkW * 0.5, ridgeTopY + 10, trunkW, -trunkH * 0.28);

                    const crownTop = ridgeTopY - trunkH;
                    const tierBase = 18 + this.noise1D(seed + 16.8) * 14;
                    const tiers = 2 + Math.floor(this.noise1D(seed + 17.4) * 2);
                    for (let tier = tiers - 1; tier >= 0; tier--) {
                        const y = crownTop + tier * (trunkH * 0.24);
                        const w = tierBase + tier * (10 + this.noise1D(seed + 18.1 + tier) * 6);
                        const h = 10 + this.noise1D(seed + 19.2 + tier) * 9;
                        ctx.beginPath();
                        ctx.moveTo(tx + 4, y - h);
                        ctx.lineTo(tx + 4 - w * 0.5, y + h * 0.52);
                        ctx.lineTo(tx + 4 + w * 0.5, y + h * 0.52);
                        ctx.closePath();
                        ctx.fill();
                    }
                } else if (decoRoll > 0.3) {
                    const treeCount = 2 + Math.floor(this.noise1D(seed + 16.8) * 4);
                    const spacing = ridgeW / (treeCount + 1);
                    for (let t = 0; t < treeCount; t++) {
                        const tSeed = seed + t * 2.7;
                        const tx = x + spacing * (t + 1) + this.noiseSigned(tSeed + 17.4) * 10;
                        const treeH = 16 + this.noise1D(tSeed + 18.6) * 22;
                        const trunkW = 3.5 + this.noise1D(tSeed + 19.3) * 2.2;
                        ctx.fillRect(tx + 4 - trunkW * 0.5, ridgeTopY + 10, trunkW, -treeH * 0.28);
                        ctx.beginPath();
                        ctx.moveTo(tx - 3, ridgeTopY + 10);
                        ctx.lineTo(tx + 5, ridgeTopY - treeH);
                        ctx.lineTo(tx + 13, ridgeTopY + 10);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.moveTo(tx - 1, ridgeTopY - treeH * 0.45);
                        ctx.lineTo(tx + 5, ridgeTopY - treeH * 0.92);
                        ctx.lineTo(tx + 11, ridgeTopY - treeH * 0.45);
                        ctx.fill();
                    }
                }
            }
        }

        ctx.globalAlpha = 1;
    }
    
    renderStage3RoadsideProps(ctx) {
        const images = this.stage3PropImages;
        if (!images) return;

        const props = [
            { type: 'signpost', worldX: 1280, height: 108, y: 4,  alpha: 0.74, parallax: 0.88 },
            { type: 'bambooFence', worldX: 3180, height: 54,  y: 6,  alpha: 0.64, parallax: 0.84 },
            { type: 'dosojin', worldX: 5260, height: 66,  y: 5,  alpha: 0.68, parallax: 0.88 },
            { type: 'bambooFence', worldX: 7280, height: 58,  y: 6,  alpha: 0.60, parallax: 0.84 }
        ];

        for (const prop of props) {
            const image = images[prop.type];
            if (!image || !image.complete || image.naturalWidth <= 0) continue;

            const width = prop.height * (image.naturalWidth / image.naturalHeight);
            const x = prop.worldX - this.progress * prop.parallax;
            if (x + width < -80 || x > CANVAS_WIDTH + 80) continue;

            const y = this.groundY - prop.height + prop.y;
            ctx.save();
            ctx.globalAlpha *= prop.alpha;
            ctx.filter = 'brightness(0.74) saturate(0.62) contrast(0.86)';
            ctx.drawImage(image, x, y, width, prop.height);
            ctx.filter = 'none';
            ctx.restore();
        }
    }

    renderStageElements(ctx, currentPalette) {
        const p = this.progress;
        
        // currentPaletteから時間帯的なニュアンスを得るため、
        // 遠景(far)の色から暗さを推測して少し補正に使うことも可能
        
        switch (currentPalette.elements) {
            case 'bamboo': {
                // spacing 拡大で描画本数を削減（パフォーマンス改善）
                const bambooLayers = [
                    { parallax: 0.28, spacing: 52, widthMin: 3, widthVar: 3, hMin: 320, hVar: 220, alpha: 0.34, sway: 1.8 },
                    { parallax: 0.48, spacing: 44, widthMin: 4, widthVar: 5, hMin: 420, hVar: 260, alpha: 0.5, sway: 2.6 },
                    { parallax: 0.74, spacing: 36, widthMin: 6, widthVar: 6, hMin: 520, hVar: 300, alpha: 0.68, sway: 3.8 },
                    { parallax: 0.98, spacing: 28, widthMin: 8, widthVar: 8, hMin: 620, hVar: 340, alpha: 0.84, sway: 5.2 }
                ];

                const drawLeafCluster = (x, y, seed, scale, depth) => {
                    const tint = this.interpolateColor('#7ea464', '#1f3422', depth);
                    ctx.fillStyle = tint;
                    const leaves = 2 + Math.floor(this.noise1D(seed + 0.7) * 3);
                    for (let i = 0; i < leaves; i++) {
                        const lSeed = seed + i * 1.9;
                        const dir = this.noise1D(lSeed + 1.3) > 0.5 ? 1 : -1;
                        const len = (22 + this.noise1D(lSeed + 2.6) * 28) * scale;
                        const drop = (3 + this.noise1D(lSeed + 3.2) * 7) * scale;
                        const w = (5 + this.noise1D(lSeed + 4.1) * 5) * scale;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.quadraticCurveTo(x + dir * len * 0.45, y - drop * 1.2, x + dir * len, y + drop * 0.1);
                        ctx.quadraticCurveTo(x + dir * len * 0.54, y + drop * 0.75, x + dir * len * 0.14, y + w * 0.26);
                        ctx.closePath();
                        ctx.fill();
                    }
                };

                // 靄なし

                // ボス部屋内で竹を描く右端スクリーンx上限
                // Stage1だけは右1/4削り演出を無効化し、常に全画面で竹を描く
                const bambooLimitFull = CANVAS_WIDTH + 80;
                const bambooLimitBoss = this.stageNumber === 1
                    ? bambooLimitFull
                    : CANVAS_WIDTH * 0.75;
                let bambooScreenLimit;
                if (!this.bossSpawned) {
                    bambooScreenLimit = bambooLimitFull;
                } else if (this.bossDefeated) {
                    bambooScreenLimit = bambooLimitBoss; // 撃破後も固定
                } else {
                    bambooScreenLimit = bambooLimitFull + (bambooLimitBoss - bambooLimitFull) * this.bossEncounterBlend;
                }

                for (const layer of bambooLayers) {
                    const scroll = p * layer.parallax;
                    const start = Math.floor((scroll - 200) / layer.spacing);
                    const end = Math.ceil((scroll + CANVAS_WIDTH + 200) / layer.spacing);
                    ctx.save();
                    ctx.globalAlpha = layer.alpha;
                    // クリップ（ボス戦中のみ有効）でどのレイヤーの竹も右端に食み出さない
                    ctx.beginPath();
                    ctx.rect(0, 0, bambooScreenLimit, CANVAS_HEIGHT);
                    ctx.clip();
                    for (let i = start; i <= end; i++) {
                        const seed = i * 7.31;
                        const x = i * layer.spacing - scroll + this.noiseSigned(seed) * 18;
                        if (x < -80 || x > bambooScreenLimit) continue;

                        const stalkW = layer.widthMin + this.noise1D(seed + 1.9) * layer.widthVar;
                        const h = layer.hMin + this.noise1D(seed + 2.6) * layer.hVar;
                        const sway = Math.sin(this.stageTime * 0.0015 + seed * 0.9) * (layer.sway + this.noise1D(seed + 3.4) * 1.8);
                        const topY = this.groundY - h;

                        const bottomX = x;
                        const topX = x + sway * 0.6;

                        const getStalkX = (y) => {
                            const t = 1 - Math.max(0, Math.min(1, (y - topY) / h));
                            return bottomX + (topX - bottomX) * (t * t);
                        };

                        const avgX = (topX + bottomX) * 0.5;
                        const stalkShade = ctx.createLinearGradient(avgX - stalkW * 0.7, 0, avgX + stalkW * 1.1, 0);
                        stalkShade.addColorStop(0, this.interpolateColor('#4f6f43', '#0f1b11', 0.36));
                        stalkShade.addColorStop(0.45, this.interpolateColor('#94be73', '#304c2f', 0.3));
                        stalkShade.addColorStop(1, this.interpolateColor('#385536', '#08100a', 0.44));
                        ctx.fillStyle = stalkShade;

                        // 頂点ステップ40で軽量化
                        ctx.beginPath();
                        ctx.moveTo(bottomX, this.groundY + 3);
                        ctx.lineTo(bottomX + stalkW, this.groundY + 3);
                        for (let dy = this.groundY; dy >= topY; dy -= 40) {
                            ctx.lineTo(getStalkX(dy) + stalkW, dy);
                        }
                        ctx.lineTo(topX + stalkW, topY);
                        ctx.lineTo(topX, topY);
                        for (let dy = topY; dy <= this.groundY; dy += 40) {
                            ctx.lineTo(getStalkX(dy), dy);
                        }
                        ctx.closePath();
                        ctx.fill();

                        const nodeCount = 5 + Math.floor(this.noise1D(seed + 4.1) * 5);
                        ctx.fillStyle = this.interpolateColor('#3b5d31', '#101a0f', 0.45);
                        for (let n = 1; n <= nodeCount; n++) {
                            const ny = topY + (h * n) / (nodeCount + 1);
                            const nx = getStalkX(ny);
                            const nodeH = 1.6 + this.noise1D(seed + 5.2 + n) * 1.6;
                            ctx.beginPath();
                            ctx.moveTo(nx - stalkW * 0.12, ny);
                            ctx.lineTo(nx + stalkW * 1.1, ny);
                            ctx.lineTo(nx + stalkW * 1.1, ny + nodeH);
                            ctx.lineTo(nx - stalkW * 0.12, ny + nodeH);
                            ctx.fill();
                        }

                        // 葉クラスターは半数のみ（軽量化）
                        if (this.noise1D(seed + 6.4) > 0.50) {
                            const branchCount = 2 + Math.floor(this.noise1D(seed + 6.6) * 3);
                            for (let b = 0; b < branchCount; b++) {
                                const by = topY + h * (0.18 + this.noise1D(seed + 7.1 + b) * 0.68);
                                const bx = getStalkX(by);
                                const offset = sway * (0.22 + b * 0.14);
                                drawLeafCluster(bx + stalkW * 0.5 + offset, by, seed + 9.3 + b * 2.4, 0.54 + layer.parallax * 0.48, 0.44);
                            }
                        }
                    }
                    ctx.restore();
                }

                // 上部は細い葉影だけにして空を潰さない
                ctx.save();
                ctx.globalAlpha = 0.14;
                const topShade = ctx.createLinearGradient(0, 0, 0, 140);
                topShade.addColorStop(0, 'rgba(36, 64, 48, 0.24)');
                topShade.addColorStop(1, 'rgba(36, 64, 48, 0)');
                ctx.fillStyle = topShade;
                ctx.fillRect(0, 0, bambooScreenLimit, 140);

                const topLeafSpan = 76;
                const topLeafScroll = p * 0.66;
                const topLeafStart = Math.floor((topLeafScroll - topLeafSpan * 3) / topLeafSpan);
                const topLeafEnd = Math.ceil((topLeafScroll + CANVAS_WIDTH + topLeafSpan * 3) / topLeafSpan);
                ctx.fillStyle = this.interpolateColor('#6d8f5a', '#2e4a32', 0.42);
                for (let i = topLeafStart; i <= topLeafEnd; i++) {
                    const seed = i * 3.77;
                    const x = i * topLeafSpan - topLeafScroll + this.noiseSigned(seed + 0.8) * 9;
                    
                    if (x < -100 || x > bambooScreenLimit) continue;
                    
                    const y = 14 + this.noise1D(seed + 1.4) * 54;
                    const len = 26 + this.noise1D(seed + 2.3) * 24;
                    const dir = this.noise1D(seed + 3.1) > 0.5 ? 1 : -1;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(x + dir * len * 0.5, y + 3, x + dir * len, y + 12);
                    ctx.quadraticCurveTo(x + dir * len * 0.55, y + 9, x + dir * len * 0.2, y + 2);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();


                break;
            }
                
            case 'kaido': {
                const treeBand = ctx.createLinearGradient(0, this.groundY - 110, 0, this.groundY + 6);
                treeBand.addColorStop(0, 'rgba(70, 104, 82, 0.04)');
                treeBand.addColorStop(1, 'rgba(44, 74, 57, 0.2)');
                ctx.fillStyle = treeBand;
                ctx.fillRect(0, this.groundY - 110, CANVAS_WIDTH, 130);

                // 地平線の霞（遠景の山裾をぼかして奥行きを補強。地面にはかぶせない）
                const hazeGrad = ctx.createLinearGradient(0, this.groundY - 30, 0, this.groundY);
                hazeGrad.addColorStop(0, 'rgba(178,196,212,0)');
                hazeGrad.addColorStop(1, 'rgba(178,196,212,0.4)');
                ctx.fillStyle = hazeGrad;
                ctx.fillRect(0, this.groundY - 30, CANVAS_WIDTH, 30);

                // 遠景の丘陵を追加して奥行きを補強
                const hillPara = 0.16;
                const hillSpan = 420;
                const hillScroll = p * hillPara;
                const hillStart = Math.floor((hillScroll - hillSpan * 3) / hillSpan);
                const hillEnd = Math.ceil((hillScroll + CANVAS_WIDTH + hillSpan * 3) / hillSpan);
                ctx.save();
                ctx.globalAlpha = 0.26;
                ctx.fillStyle = this.interpolateColor(currentPalette.far, '#2d3d4b', 0.34);
                for (let i = hillStart; i <= hillEnd; i++) {
                    const seed = i * 4.17;
                    const x = i * hillSpan - hillScroll + this.noiseSigned(seed + 0.7) * 44;
                    const w = hillSpan * (0.9 + this.noise1D(seed + 1.4) * 0.65);
                    const h = 72 + this.noise1D(seed + 2.6) * 56;
                    ctx.beginPath();
                    ctx.moveTo(x - 42, this.groundY);
                    ctx.bezierCurveTo(
                        x + w * 0.18, this.groundY - h * 0.9,
                        x + w * 0.48, this.groundY - h * 0.72,
                        x + w * 0.72, this.groundY - h * 0.4
                    );
                    ctx.quadraticCurveTo(x + w * 0.9, this.groundY - h * 0.22, x + w + 36, this.groundY);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();

                // 遠景の家並み・林のシルエット（丘陵と中景の間／奥行き層）
                const midPara = 0.26;
                const midSpan = 240;
                const midScroll = p * midPara;
                const midStart = Math.floor((midScroll - midSpan * 2) / midSpan);
                const midEnd = Math.ceil((midScroll + CANVAS_WIDTH + midSpan * 2) / midSpan);
                ctx.save();
                ctx.globalAlpha = 0.42;
                for (let i = midStart; i <= midEnd; i++) {
                    const seed = i * 6.71;
                    if (this.noise1D(seed + 0.3) < 0.32) continue;
                    const x = i * midSpan - midScroll + this.noiseSigned(seed + 0.6) * 30;
                    const r = this.noise1D(seed + 1.3);
                    if (r < 0.5) {
                        // 遠い家のシルエット（切妻）
                        const hw = 30 + this.noise1D(seed + 2.1) * 22;
                        const hh = 20 + this.noise1D(seed + 2.7) * 12;
                        ctx.fillStyle = this.interpolateColor(currentPalette.mid, '#39495a', 0.42);
                        ctx.fillRect(x, this.groundY - hh, hw, hh);
                        ctx.beginPath();
                        ctx.moveTo(x - 5, this.groundY - hh);
                        ctx.lineTo(x + hw * 0.5, this.groundY - hh - 13);
                        ctx.lineTo(x + hw + 5, this.groundY - hh);
                        ctx.closePath();
                        ctx.fill();
                    } else {
                        // 遠い林（こんもりした塊）
                        ctx.fillStyle = this.interpolateColor('#4a6450', '#33485a', 0.5);
                        const cw = 30 + this.noise1D(seed + 3.2) * 24;
                        ctx.beginPath();
                        ctx.ellipse(x, this.groundY - cw * 0.32, cw, cw * 0.46, 0, Math.PI, 0);
                        ctx.fill();
                        ctx.fillRect(x - cw, this.groundY - cw * 0.32, cw * 2, cw * 0.32);
                    }
                }
                ctx.restore();

                // 道沿いの草は廃止（スクロール時のチラつきが解消できないため）

                const kPara = 0.68;
                const kCellSize = 310;
                const kStartIdx = Math.floor((p * kPara - 260) / kCellSize);
                const kEndIdx = Math.ceil((CANVAS_WIDTH + p * kPara + 260) / kCellSize);

                // ─── 屋根ヘルパー：茅葺き寄棟（むくり屋根）───
                const drawKayabukiRoof = (cx, eaveY, halfW, ridgeH) => {
                    const ridgeY = eaveY - ridgeH;
                    const rHalf = halfW * 0.5;
                    const Lx = cx - halfW, Rx = cx + halfW;
                    const RLx = cx - rHalf, RRx = cx + rHalf;
                    ctx.fillStyle = '#9c7f4c';
                    ctx.beginPath();
                    ctx.moveTo(Lx, eaveY);
                    ctx.bezierCurveTo(Lx + halfW * 0.18, eaveY - ridgeH * 0.55, RLx - halfW * 0.06, ridgeY + ridgeH * 0.1, RLx, ridgeY);
                    ctx.lineTo(RRx, ridgeY);
                    ctx.bezierCurveTo(RRx + halfW * 0.06, ridgeY + ridgeH * 0.1, Rx - halfW * 0.18, eaveY - ridgeH * 0.55, Rx, eaveY);
                    ctx.bezierCurveTo(cx + halfW * 0.5, eaveY + ridgeH * 0.05, cx - halfW * 0.5, eaveY + ridgeH * 0.05, Lx, eaveY);
                    ctx.closePath();
                    ctx.fill();
                    // 左明・右暗
                    ctx.fillStyle = 'rgba(184,154,98,0.38)';
                    ctx.beginPath();
                    ctx.moveTo(Lx, eaveY);
                    ctx.bezierCurveTo(Lx + halfW * 0.18, eaveY - ridgeH * 0.55, RLx - halfW * 0.06, ridgeY + ridgeH * 0.1, RLx, ridgeY);
                    ctx.lineTo(cx, ridgeY);
                    ctx.lineTo(cx, eaveY + ridgeH * 0.03);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = 'rgba(131,106,63,0.42)';
                    ctx.beginPath();
                    ctx.moveTo(cx, ridgeY);
                    ctx.lineTo(RRx, ridgeY);
                    ctx.bezierCurveTo(RRx + halfW * 0.06, ridgeY + ridgeH * 0.1, Rx - halfW * 0.18, eaveY - ridgeH * 0.55, Rx, eaveY);
                    ctx.lineTo(cx, eaveY + ridgeH * 0.03);
                    ctx.closePath();
                    ctx.fill();
                    // 棟下の影
                    ctx.fillStyle = 'rgba(108,85,54,0.4)';
                    ctx.fillRect(RLx, ridgeY, RRx - RLx, ridgeH * 0.16);
                    // 葺き目（放射）
                    ctx.lineWidth = 0.8;
                    for (let i = 1; i < 16; i++) {
                        const t = i / 16;
                        const topx = RLx + (RRx - RLx) * t;
                        const botx = Lx + (Rx - Lx) * t;
                        const boty = eaveY - Math.sin(Math.PI * t) * ridgeH * 0.03;
                        ctx.strokeStyle = t < 0.5 ? 'rgba(196,168,110,0.4)' : 'rgba(124,98,56,0.4)';
                        ctx.beginPath();
                        ctx.moveTo(topx, ridgeY + 1);
                        ctx.lineTo(botx, boty);
                        ctx.stroke();
                    }
                    // 軒口（葺き口の厚み）
                    ctx.fillStyle = '#c2a468';
                    ctx.beginPath();
                    ctx.moveTo(Lx, eaveY - 1);
                    ctx.bezierCurveTo(cx - halfW * 0.4, eaveY + 2, cx + halfW * 0.4, eaveY + 2, Rx, eaveY - 1);
                    ctx.lineTo(Rx, eaveY + ridgeH * 0.07);
                    ctx.bezierCurveTo(cx + halfW * 0.4, eaveY + ridgeH * 0.09, cx - halfW * 0.4, eaveY + ridgeH * 0.09, Lx, eaveY + ridgeH * 0.07);
                    ctx.closePath();
                    ctx.fill();
                    // 棟＋芝棟
                    ctx.fillStyle = '#544428';
                    ctx.fillRect(RLx, ridgeY - 5, RRx - RLx, 7);
                    ctx.fillStyle = '#5e6e3f';
                    ctx.fillRect(RLx + 2, ridgeY - 8, RRx - RLx - 4, 4);
                };

                // ─── 一：茅葺き農家 ───
                const drawFarmhouse = (cx, baseY, seed, scale) => {
                    const halfW = (94 + this.noise1D(seed + 2.3) * 20) * scale;
                    const wallH = (62 + this.noise1D(seed + 3.1) * 14) * scale;
                    const ridgeH = (66 + this.noise1D(seed + 3.6) * 16) * scale;
                    const wallY = baseY - wallH;
                    const eaveY = wallY + 4 * scale;
                    const ww = halfW * 1.5;
                    const wx = cx - ww / 2;
                    ctx.fillStyle = 'rgba(63,49,28,0.5)';
                    ctx.fillRect(wx, wallY, ww, 7 * scale);
                    ctx.fillStyle = '#d0bd92';
                    ctx.fillRect(wx, wallY + 4 * scale, ww, baseY - wallY - 4 * scale);
                    ctx.fillStyle = 'rgba(188,166,120,0.35)';
                    ctx.fillRect(cx, wallY + 4 * scale, ww / 2, baseY - wallY - 4 * scale);
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(wx, wallY + 4 * scale, ww, 4 * scale);
                    ctx.fillStyle = '#52402c';
                    ctx.fillRect(wx, baseY - 6 * scale, ww, 6 * scale);
                    // 開口：中央に木の引き違い戸(入口・上は障子/下は腰板)、左右に小さな明かり窓。重ならないよう間に柱
                    const openY = wallY + 14 * scale, openH = baseY - (wallY + 14 * scale) - 8 * scale;
                    const dW = ww * 0.34, dX = cx - dW / 2, paperH = openH * 0.56;
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(dX - 3 * scale, openY - 3 * scale, dW + 6 * scale, openH + 6 * scale);
                    for (let d = 0; d < 2; d++) {
                        const px = dX + d * (dW / 2);
                        ctx.fillStyle = '#ece4cf';
                        ctx.fillRect(px + 1.5 * scale, openY, dW / 2 - 3 * scale, paperH);
                        ctx.fillStyle = '#6e5236';
                        ctx.fillRect(px + 1.5 * scale, openY + paperH, dW / 2 - 3 * scale, openH - paperH);
                        ctx.strokeStyle = 'rgba(120,104,76,0.8)';
                        ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(px + dW / 4, openY); ctx.lineTo(px + dW / 4, openY + paperH); ctx.stroke();
                        for (let hr = 1; hr <= 2; hr++) { const yy = openY + (hr / 3) * paperH; ctx.beginPath(); ctx.moveTo(px + 1.5 * scale, yy); ctx.lineTo(px + dW / 2 - 1.5 * scale, yy); ctx.stroke(); }
                        ctx.fillStyle = '#5a4330';
                        ctx.fillRect(px - 1.5 * scale, openY, 3 * scale, openH);
                    }
                    const winW = ww * 0.15, winH = openH * 0.5, winY = openY + openH * 0.1;
                    [wx + ww * 0.11, wx + ww * 0.74].forEach((wxx) => {
                        ctx.fillStyle = '#5a4330';
                        ctx.fillRect(wxx - 2 * scale, winY - 2 * scale, winW + 4 * scale, winH + 4 * scale);
                        ctx.fillStyle = '#3a2c1c';
                        ctx.fillRect(wxx, winY, winW, winH);
                        ctx.strokeStyle = 'rgba(150,134,104,0.7)';
                        ctx.lineWidth = 1;
                        for (let c = 1; c <= 3; c++) { const xx = wxx + (c / 4) * winW; ctx.beginPath(); ctx.moveTo(xx, winY); ctx.lineTo(xx, winY + winH); ctx.stroke(); }
                        for (let hr = 1; hr <= 2; hr++) { const yy = winY + (hr / 3) * winH; ctx.beginPath(); ctx.moveTo(wxx, yy); ctx.lineTo(wxx + winW, yy); ctx.stroke(); }
                    });
                    ctx.fillStyle = '#5a4330';
                    [wx, wx + ww * 0.3, wx + ww * 0.7 - 4 * scale, wx + ww - 4 * scale].forEach((px) => ctx.fillRect(px, wallY + 4 * scale, 4 * scale, baseY - wallY - 4 * scale));
                    ctx.fillStyle = '#8c6f4e';
                    ctx.fillRect(wx - 3 * scale, baseY - 6 * scale, ww + 6 * scale, 6 * scale);
                    drawKayabukiRoof(cx, eaveY, halfW, ridgeH);
                };

                // ─── 二：瓦葺き二階の旅籠 ───
                const drawHatago = (cx, baseY, seed, scale) => {
                    const halfW = (80 + this.noise1D(seed + 2.3) * 14) * scale;
                    const ww = halfW * 1.92;
                    const wx = cx - ww / 2;
                    const f1 = (58 + this.noise1D(seed + 3.1) * 8) * scale;
                    const f2 = (50 + this.noise1D(seed + 3.6) * 8) * scale;
                    const roofH = (46 + this.noise1D(seed + 4.1) * 10) * scale;
                    const f2Y = baseY - f1 - f2;
                    const eaveY = f2Y;
                    const ridgeY = eaveY - roofH;
                    const rHalf = halfW * 1.06;
                    // 切妻瓦屋根
                    ctx.fillStyle = '#565e6a';
                    ctx.beginPath();
                    ctx.moveTo(cx - rHalf, eaveY); ctx.lineTo(cx, ridgeY); ctx.lineTo(cx + rHalf, eaveY); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(105,114,130,0.5)';
                    ctx.beginPath(); ctx.moveTo(cx - rHalf, eaveY); ctx.lineTo(cx, ridgeY); ctx.lineTo(cx, eaveY); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(60,66,76,0.45)';
                    ctx.beginPath(); ctx.moveTo(cx, ridgeY); ctx.lineTo(cx + rHalf, eaveY); ctx.lineTo(cx, eaveY); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(71,77,87,0.55)';
                    ctx.lineWidth = 0.8;
                    for (let i = 1; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(cx, ridgeY + 2); ctx.lineTo(cx - rHalf + (rHalf * 2) * (i / 7), eaveY); ctx.stroke(); }
                    ctx.fillStyle = '#2e333c';
                    ctx.fillRect(cx - 6 * scale, ridgeY - 2 * scale, 12 * scale, roofH * 0.8);
                    ctx.fillStyle = '#6e7682';
                    for (let i = 0; i <= 11; i++) { const bx = cx - rHalf + (rHalf * 2) * (i / 11); ctx.beginPath(); ctx.arc(bx, eaveY, 3 * scale, 0, Math.PI * 2); ctx.fill(); }
                    // 2階壁
                    ctx.fillStyle = '#d8cdb5';
                    ctx.fillRect(wx, f2Y, ww, f2);
                    ctx.fillStyle = 'rgba(201,189,163,0.4)';
                    ctx.fillRect(cx, f2Y, ww / 2, f2);
                    const mw = ww * 0.15;
                    const mh = f2 * 0.36;
                    for (let s = 0; s < 2; s++) {
                        const mxx = cx + (s === 0 ? -1 : 1) * ww * 0.26 - mw / 2;
                        const myy = f2Y + f2 * 0.26;
                        ctx.fillStyle = '#2c2418';
                        ctx.fillRect(mxx, myy, mw, mh);
                        ctx.strokeStyle = 'rgba(216,205,181,0.8)';
                        ctx.lineWidth = 1.2;
                        for (let c = 1; c <= 3; c++) { const xx = mxx + (c / 4) * mw; ctx.beginPath(); ctx.moveTo(xx, myy); ctx.lineTo(xx, myy + mh); ctx.stroke(); }
                    }
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(wx, f2Y + f2 - 9 * scale, ww, 9 * scale);
                    ctx.strokeStyle = 'rgba(58,44,28,0.9)';
                    ctx.lineWidth = 1;
                    for (let i = 1; i < 12; i++) { const xx = wx + (i / 12) * ww; ctx.beginPath(); ctx.moveTo(xx, f2Y + f2 - 9 * scale); ctx.lineTo(xx, f2Y + f2); ctx.stroke(); }
                    // 下屋庇
                    ctx.fillStyle = '#565e6a';
                    ctx.beginPath();
                    ctx.moveTo(wx - 6 * scale, f2Y + f2 + 6 * scale);
                    ctx.lineTo(wx + ww + 6 * scale, f2Y + f2 + 6 * scale);
                    ctx.lineTo(wx + ww, f2Y + f2);
                    ctx.lineTo(wx, f2Y + f2);
                    ctx.closePath(); ctx.fill();
                    // 1階壁
                    const f1Y = f2Y + f2 + 6 * scale;
                    ctx.fillStyle = '#cdbb8e';
                    ctx.fillRect(wx, f1Y, ww, baseY - f1Y);
                    const f1h = baseY - f1Y;
                    const sillY = baseY - 5 * scale;
                    ctx.fillStyle = '#52402c';
                    ctx.fillRect(wx, sillY, ww, 5 * scale);
                    // 中央：引き違いの格子戸(格子の奥に明かり障子を見せ、黒い穴にしない)
                    const dW = ww * 0.37, dX = cx - dW / 2;
                    const dTop = f1Y + 22 * scale, dBot = sillY;
                    const dH = dBot - dTop;
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(dX - 4 * scale, dTop - 4 * scale, dW + 8 * scale, dH + 4 * scale);
                    for (let d = 0; d < 2; d++) {
                        const lx = dX + d * (dW / 2) + 2 * scale, lw = dW / 2 - 4 * scale;
                        ctx.fillStyle = '#ece4cf';
                        ctx.fillRect(lx, dTop, lw, dH);
                        ctx.fillStyle = 'rgba(74,60,42,0.18)';
                        ctx.fillRect(lx, dTop, lw, dH * 0.18);
                        ctx.strokeStyle = 'rgba(120,104,76,0.8)';
                        ctx.lineWidth = 1;
                        for (let c = 1; c <= 4; c++) { const xx = lx + (c / 5) * lw; ctx.beginPath(); ctx.moveTo(xx, dTop); ctx.lineTo(xx, dTop + dH); ctx.stroke(); }
                        for (let hr = 1; hr <= 5; hr++) { const yy = dTop + (hr / 6) * dH; ctx.beginPath(); ctx.moveTo(lx, yy); ctx.lineTo(lx + lw, yy); ctx.stroke(); }
                        ctx.fillStyle = '#6e5236';
                        ctx.fillRect(dX + d * (dW / 2) - 1 * scale, dTop, 2.5 * scale, dH);
                    }
                    // 敷石
                    ctx.fillStyle = '#7d7468';
                    ctx.fillRect(dX - 5 * scale, sillY, dW + 10 * scale, 5 * scale);
                    // 入口上の暖簾(藍地+白筋, 屋号筋)
                    const noW = dW + 14 * scale, noX = cx - noW / 2, noY = f1Y + 4 * scale, noH = 16 * scale;
                    ctx.fillStyle = '#2f4a6b';
                    ctx.beginPath();
                    ctx.moveTo(noX, noY); ctx.lineTo(noX + noW, noY);
                    ctx.lineTo(noX + noW, noY + noH * 0.7);
                    for (let k = 0; k <= 6; k++) { const px = noX + noW * (1 - k / 6); ctx.lineTo(px, noY + noH * (k % 2 === 0 ? 1 : 0.62)); }
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(236,228,207,0.85)';
                    for (let k = 1; k <= 3; k++) ctx.fillRect(noX + noW * (k / 4) - 1 * scale, noY + 2 * scale, 2 * scale, noH * 0.5);
                    ctx.fillStyle = 'rgba(20,32,52,0.5)';
                    ctx.fillRect(noX, noY, noW, 2 * scale);
                    // 脇の出格子(張り出した格子窓)
                    const bayW = ww * 0.15, bayX = wx + ww * 0.08, bayTop = f1Y + 18 * scale, bayH = f1h * 0.4;
                    ctx.fillStyle = '#52402c';
                    ctx.fillRect(bayX - 3 * scale, bayTop + bayH, bayW + 6 * scale, 4 * scale);
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(bayX - 3 * scale, bayTop - 3 * scale, bayW + 6 * scale, bayH + 3 * scale);
                    ctx.fillStyle = '#ece4cf';
                    ctx.fillRect(bayX, bayTop, bayW, bayH);
                    ctx.fillStyle = 'rgba(74,60,42,0.2)';
                    ctx.fillRect(bayX, bayTop, bayW, bayH * 0.22);
                    ctx.strokeStyle = 'rgba(120,104,76,0.8)';
                    ctx.lineWidth = 1;
                    for (let c = 1; c <= 5; c++) { const xx = bayX + (c / 6) * bayW; ctx.beginPath(); ctx.moveTo(xx, bayTop); ctx.lineTo(xx, bayTop + bayH); ctx.stroke(); }
                    ctx.beginPath(); ctx.moveTo(bayX, bayTop + bayH * 0.5); ctx.lineTo(bayX + bayW, bayTop + bayH * 0.5); ctx.stroke();
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(wx, f1Y, 4 * scale, baseY - f1Y);
                    ctx.fillRect(wx + ww - 4 * scale, f1Y, 4 * scale, baseY - f1Y);
                };

                // ─── 三：板葺き石置きの山家 ───
                const drawYamaie = (cx, baseY, seed, scale) => {
                    const halfW = (84 + this.noise1D(seed + 2.3) * 16) * scale;
                    const wallH = (58 + this.noise1D(seed + 3.1) * 10) * scale;
                    const roofH = (30 + this.noise1D(seed + 3.6) * 8) * scale;
                    const ww = halfW * 1.7;
                    const wx = cx - ww / 2;
                    const eaveY = baseY - wallH;
                    const ridgeY = eaveY - roofH;
                    const rHalf = halfW * 1.04;
                    ctx.fillStyle = '#6f5f48';
                    ctx.beginPath(); ctx.moveTo(cx - rHalf, eaveY); ctx.lineTo(cx, ridgeY); ctx.lineTo(cx + rHalf, eaveY); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(130,113,90,0.5)';
                    ctx.beginPath(); ctx.moveTo(cx - rHalf, eaveY); ctx.lineTo(cx, ridgeY); ctx.lineTo(cx, eaveY); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(86,74,57,0.45)';
                    ctx.beginPath(); ctx.moveTo(cx, ridgeY); ctx.lineTo(cx + rHalf, eaveY); ctx.lineTo(cx, eaveY); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(86,74,57,0.5)';
                    ctx.lineWidth = 0.8;
                    for (let i = 1; i < 7; i++) { ctx.beginPath(); ctx.moveTo(cx, ridgeY + 2); ctx.lineTo(cx - rHalf + (rHalf * 2) * (i / 7), eaveY); ctx.stroke(); }
                    // 棟覆い：屋根の勾配に沿った山形にして頂部に密着させる（水平板だと端が浮いて雑に見えるため）
                    const rk = halfW * 0.36;            // 棟覆いの片幅
                    const rdy = (rk / rHalf) * roofH;   // 端での降下量（屋根の傾きに一致）
                    const cap = 5 * scale;              // 棟の厚み
                    ctx.fillStyle = '#574a38';
                    ctx.beginPath();
                    ctx.moveTo(cx - rk, ridgeY + rdy);
                    ctx.lineTo(cx, ridgeY - 1 * scale);
                    ctx.lineTo(cx + rk, ridgeY + rdy);
                    ctx.lineTo(cx + rk, ridgeY + rdy + cap);
                    ctx.lineTo(cx, ridgeY - 1 * scale + cap);
                    ctx.lineTo(cx - rk, ridgeY + rdy + cap);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(156,148,128,0.4)';
                    ctx.lineWidth = 1.4 * scale;
                    ctx.beginPath();
                    ctx.moveTo(cx - rk, ridgeY + rdy);
                    ctx.lineTo(cx, ridgeY - 1 * scale);
                    ctx.lineTo(cx + rk, ridgeY + rdy);
                    ctx.stroke();
                    // 屋根を押さえる石（両流れに沿って整然と・少なめに）
                    ctx.fillStyle = '#9a988f';
                    for (let i = 0; i < 7; i++) {
                        const t = (i + 0.5) / 7;
                        const sx = cx - rHalf + (rHalf * 2) * t;
                        const sy = eaveY - roofH * (1 - Math.abs(t - 0.5) * 2) * 0.72 - 3 * scale;
                        ctx.beginPath(); ctx.ellipse(sx, sy, 5 * scale, 3 * scale, 0, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.fillStyle = '#5f5240';
                    ctx.fillRect(cx - rHalf, eaveY, rHalf * 2, 4 * scale);
                    ctx.fillStyle = 'rgba(63,53,42,0.5)';
                    ctx.fillRect(wx, eaveY + 4 * scale, ww, 6 * scale);
                    ctx.fillStyle = '#8c7355';
                    ctx.fillRect(wx, eaveY + 4 * scale, ww, baseY - eaveY - 4 * scale);
                    ctx.fillStyle = 'rgba(118,96,63,0.35)';
                    ctx.fillRect(cx, eaveY + 4 * scale, ww / 2, baseY - eaveY - 4 * scale);
                    ctx.strokeStyle = 'rgba(90,70,48,0.6)';
                    ctx.lineWidth = 1;
                    for (let r = 1; r <= 3; r++) { const yy = eaveY + 4 * scale + (r / 4) * (baseY - eaveY - 4 * scale); ctx.beginPath(); ctx.moveTo(wx, yy); ctx.lineTo(wx + ww, yy); ctx.stroke(); }
                    const wallTopY = eaveY + 4 * scale;
                    const sillY = baseY - 2 * scale;
                    // 中央：木枠の引き違い板戸
                    const doorW = ww * 0.34, doorH = (baseY - wallTopY) * 0.66;
                    const doorX = cx - doorW / 2, doorY = baseY - 3 * scale - doorH;
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(doorX - 3 * scale, doorY - 3 * scale, doorW + 6 * scale, doorH + 5 * scale);
                    const dPanelX = doorX, dPanelY = doorY, dPanelW = doorW, dPanelH = doorH;
                    const dHalf = dPanelW / 2;
                    for (let p = 0; p < 2; p++) {
                        const px = dPanelX + p * dHalf;
                        ctx.fillStyle = p === 0 ? '#6e5236' : '#664c32';
                        ctx.fillRect(px, dPanelY, dHalf - 1 * scale, dPanelH);
                        ctx.strokeStyle = 'rgba(82,64,44,0.75)';
                        ctx.lineWidth = 0.8;
                        for (let v = 1; v <= 4; v++) { const vx = px + (v / 5) * (dHalf - 1 * scale); ctx.beginPath(); ctx.moveTo(vx, dPanelY + 1 * scale); ctx.lineTo(vx, dPanelY + dPanelH - 1 * scale); ctx.stroke(); }
                    }
                    ctx.strokeStyle = 'rgba(58,44,28,0.9)';
                    ctx.lineWidth = 1.4 * scale;
                    ctx.beginPath(); ctx.moveTo(dPanelX + dHalf, dPanelY); ctx.lineTo(dPanelX + dHalf, dPanelY + dPanelH); ctx.stroke();
                    ctx.strokeStyle = 'rgba(120,104,76,0.8)';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(dPanelX, dPanelY + dPanelH * 0.34); ctx.lineTo(dPanelX + dPanelW, dPanelY + dPanelH * 0.34); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(dPanelX, dPanelY + dPanelH * 0.7); ctx.lineTo(dPanelX + dPanelW, dPanelY + dPanelH * 0.7); ctx.stroke();
                    ctx.fillStyle = '#52402c';
                    ctx.fillRect(dPanelX + dHalf - 4 * scale, dPanelY + dPanelH * 0.5, 2 * scale, dPanelH * 0.16);
                    // 脇：木枠の格子窓（戸と重ならない）
                    const winW = ww * 0.16, winH = (baseY - wallTopY) * 0.3;
                    const winX = wx + ww * 0.1, winY = wallTopY + (baseY - wallTopY) * 0.22;
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(winX - 3 * scale, winY - 3 * scale, winW + 6 * scale, winH + 6 * scale);
                    ctx.fillStyle = '#3a2c1c';
                    ctx.fillRect(winX, winY, winW, winH);
                    ctx.strokeStyle = 'rgba(150,134,104,0.7)';
                    ctx.lineWidth = 0.9;
                    for (let v = 1; v <= 3; v++) { const vx = winX + (v / 4) * winW; ctx.beginPath(); ctx.moveTo(vx, winY); ctx.lineTo(vx, winY + winH); ctx.stroke(); }
                    for (let h = 1; h <= 2; h++) { const hy = winY + (h / 3) * winH; ctx.beginPath(); ctx.moveTo(winX, hy); ctx.lineTo(winX + winW, hy); ctx.stroke(); }
                };

                // ─── 四：水車のある茶屋（上掛け水車）───
                const drawChaya = (cx, baseY, seed, scale) => {
                    const halfW = (58 + this.noise1D(seed + 2.3) * 10) * scale;
                    const wallH = (52 + this.noise1D(seed + 3.1) * 8) * scale;
                    const ridgeH = (46 + this.noise1D(seed + 3.6) * 10) * scale;
                    const wallY = baseY - wallH;
                    const eaveY = wallY + 3 * scale;
                    const ww = halfW * 1.5;
                    const wx = cx - ww / 2;
                    ctx.fillStyle = 'rgba(63,49,28,0.5)';
                    ctx.fillRect(wx, wallY, ww, 6 * scale);
                    ctx.fillStyle = '#d0bd92';
                    ctx.fillRect(wx, wallY + 3 * scale, ww, baseY - wallY - 3 * scale);
                    ctx.fillStyle = 'rgba(188,166,120,0.35)';
                    ctx.fillRect(cx, wallY + 3 * scale, ww / 2, baseY - wallY - 3 * scale);
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(wx, wallY + 3 * scale, ww, 4 * scale);
                    ctx.fillStyle = '#52402c';
                    ctx.fillRect(wx, baseY - 5 * scale, ww, 5 * scale);
                    ctx.fillStyle = '#5a4330';
                    for (let i = 0; i <= 2; i++) ctx.fillRect(wx + (i / 2) * ww - 2 * scale, wallY + 3 * scale, 4 * scale, baseY - wallY - 3 * scale);
                    // ── 正面ファサード：出入口＋暖簾＋障子小窓＋緋毛氈の縁台 ──
                    const faceTop = wallY + 7 * scale;              // 上の梁の直下
                    const faceBot = baseY - 5 * scale;              // 足元の地覆の上
                    // 出入口（左ベイ：左端柱と中央柱の間）
                    const dW = ww * 0.30;
                    const dCx = wx + ww * 0.27;
                    const dX = dCx - dW / 2;
                    const dTop = faceTop + 14 * scale;              // 暖簾の下に開口
                    const dH = faceBot - dTop;
                    // 木枠（外周）
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(dX - 3 * scale, dTop - 3 * scale, dW + 6 * scale, dH + 3 * scale);
                    // 奥の暗がり
                    ctx.fillStyle = '#3a2c1c';
                    ctx.fillRect(dX, dTop, dW, dH);
                    // 腰板（下半分）
                    ctx.fillStyle = '#52402c';
                    ctx.fillRect(dX, dTop + dH * 0.55, dW, dH * 0.45);
                    // 連子の縦桟
                    ctx.strokeStyle = 'rgba(120,104,76,0.8)';
                    ctx.lineWidth = 1.4 * scale;
                    for (let c = 1; c <= 3; c++) {
                        const xx = dX + (c / 4) * dW;
                        ctx.beginPath(); ctx.moveTo(xx, dTop); ctx.lineTo(xx, dTop + dH * 0.55); ctx.stroke();
                    }
                    // 敷居
                    ctx.fillStyle = '#6e5236';
                    ctx.fillRect(dX - 2 * scale, faceBot - 2 * scale, dW + 4 * scale, 3 * scale);
                    // 暖簾（藍地・白筋4枚）を開口の上に掛ける
                    const noW = dW + 8 * scale;
                    const noX = dCx - noW / 2;
                    const noY = faceTop + 6 * scale;
                    const noH = 16 * scale;
                    ctx.fillStyle = '#2f4a6b';
                    ctx.beginPath();
                    ctx.moveTo(noX, noY);
                    ctx.lineTo(noX + noW, noY);
                    ctx.lineTo(noX + noW, noY + noH - 2 * scale);
                    for (let s = 4; s >= 0; s--) {
                        const sx = noX + (s / 4) * noW;
                        const dip = (s % 2 === 0) ? noH : noH - 3 * scale;
                        ctx.lineTo(sx, noY + dip);
                    }
                    ctx.closePath();
                    ctx.fill();
                    // 暖簾の竿（上辺）
                    ctx.fillStyle = '#52402c';
                    ctx.fillRect(noX - 2 * scale, noY - 2 * scale, noW + 4 * scale, 3 * scale);
                    // 白筋（垂れ）
                    ctx.fillStyle = 'rgba(236,228,207,0.9)';
                    for (let s = 0; s < 4; s++) {
                        const slitX = noX + ((s + 1) / 5) * noW;
                        ctx.fillRect(slitX - 0.8 * scale, noY + 1 * scale, 1.6 * scale, noH - 4 * scale);
                    }
                    // 明かり障子の小窓（右ベイ：中央柱と右端柱の間）
                    const swW = ww * 0.20;
                    const swCx = wx + ww * 0.74;
                    const swX = swCx - swW / 2;
                    const swY = faceTop + 16 * scale;
                    const swH = swW * 0.92;
                    ctx.fillStyle = '#5a4330';
                    ctx.fillRect(swX - 2.5 * scale, swY - 2.5 * scale, swW + 5 * scale, swH + 5 * scale);
                    ctx.fillStyle = '#ece4cf';
                    ctx.fillRect(swX, swY, swW, swH);
                    ctx.strokeStyle = 'rgba(120,104,76,0.8)';
                    ctx.lineWidth = 1 * scale;
                    for (let c = 1; c <= 2; c++) { const xx = swX + (c / 3) * swW; ctx.beginPath(); ctx.moveTo(xx, swY); ctx.lineTo(xx, swY + swH); ctx.stroke(); }
                    ctx.beginPath(); ctx.moveTo(swX, swY + swH / 2); ctx.lineTo(swX + swW, swY + swH / 2); ctx.stroke();
                    // 緋毛氈を掛けた縁台（正面下・中央寄り）
                    const beW = ww * 0.34;
                    const beCx = wx + ww * 0.52;
                    const beX = beCx - beW / 2;
                    const beTop = baseY - 11 * scale;               // 天板上面
                    ctx.fillStyle = '#52402c';                       // 脚
                    ctx.fillRect(beX + 2 * scale, beTop, 3 * scale, 11 * scale);
                    ctx.fillRect(beX + beW - 5 * scale, beTop, 3 * scale, 11 * scale);
                    ctx.fillStyle = '#6e5236';                       // 天板
                    ctx.fillRect(beX - 1 * scale, beTop - 2 * scale, beW + 2 * scale, 3 * scale);
                    ctx.fillStyle = '#b5462f';                       // 緋毛氈（赤布）
                    ctx.fillRect(beX, beTop - 3 * scale, beW, 9 * scale);
                    ctx.fillStyle = 'rgba(120,30,18,0.45)';          // 布の垂れ陰
                    ctx.fillRect(beX, beTop + 2 * scale, beW, 4 * scale);
                    ctx.fillStyle = '#8c6f4e';
                    ctx.fillRect(wx - 24 * scale, baseY - 14 * scale, 30 * scale, 4 * scale);
                    ctx.fillStyle = '#5f4730';
                    ctx.fillRect(wx - 22 * scale, baseY - 10 * scale, 3 * scale, 10 * scale);
                    ctx.fillRect(wx - 1 * scale, baseY - 10 * scale, 3 * scale, 10 * scale);
                    drawKayabukiRoof(cx, eaveY, halfW, ridgeH);
                    // 上掛け水車
                    const wheelR = (30 + this.noise1D(seed + 5.2) * 4) * scale;
                    const wcx = cx + ww * 0.5 + wheelR + 6 * scale;
                    const wcy = baseY - wheelR * 0.86;
                    ctx.strokeStyle = '#7d6a42';
                    ctx.lineWidth = 5 * scale;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(cx + halfW * 0.7, eaveY - ridgeH * 0.2);
                    ctx.lineTo(wcx, wcy - wheelR - 2 * scale);
                    ctx.stroke();
                    ctx.lineCap = 'butt';
                    ctx.strokeStyle = 'rgba(186,214,226,0.75)';
                    ctx.lineWidth = 2 * scale;
                    ctx.beginPath();
                    ctx.moveTo(wcx, wcy - wheelR - 2 * scale);
                    ctx.lineTo(wcx + 2 * scale, wcy - wheelR + 7 * scale);
                    ctx.stroke();
                    ctx.fillStyle = '#8a8780';
                    ctx.beginPath(); ctx.ellipse(wcx, baseY + 1 * scale, wheelR * 1.2, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#6f9bb0';
                    ctx.beginPath(); ctx.ellipse(wcx, baseY, wheelR * 0.95, 5 * scale, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'rgba(220,233,239,0.5)';
                    ctx.beginPath(); ctx.ellipse(wcx - wheelR * 0.3, baseY - 1 * scale, wheelR * 0.3, 1.6 * scale, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#9a988f';
                    ctx.beginPath(); ctx.ellipse(wcx - wheelR * 1.12, baseY, 6 * scale, 4 * scale, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(wcx + wheelR * 1.12, baseY, 6 * scale, 4 * scale, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#5a4632';
                    ctx.lineWidth = 5 * scale;
                    ctx.beginPath(); ctx.arc(wcx, wcy, wheelR, 0, Math.PI * 2); ctx.stroke();
                    ctx.lineWidth = 3 * scale;
                    ctx.strokeStyle = '#6e5440';
                    ctx.beginPath(); ctx.arc(wcx, wcy, wheelR * 0.34, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = '#43301f';
                    ctx.beginPath(); ctx.arc(wcx, wcy, 4 * scale, 0, Math.PI * 2); ctx.fill();
                    for (let k = 0; k < 8; k++) {
                        const a = (k / 8) * Math.PI * 2;
                        ctx.strokeStyle = '#5a4632';
                        ctx.lineWidth = 2.4 * scale;
                        ctx.beginPath(); ctx.moveTo(wcx, wcy); ctx.lineTo(wcx + Math.cos(a) * wheelR, wcy + Math.sin(a) * wheelR); ctx.stroke();
                        ctx.save();
                        ctx.translate(wcx + Math.cos(a) * wheelR, wcy + Math.sin(a) * wheelR);
                        ctx.rotate(a);
                        ctx.fillStyle = '#6e5440';
                        ctx.fillRect(-5 * scale, -3 * scale, 6 * scale, 6 * scale);
                        ctx.restore();
                    }
                };

                // タイプ振り分け（baseX=左基準を維持）
                // 相対サイズ目安(プレイヤー72px≒1.6m)：茶屋<山家<農家<二階旅籠。建物<木、添景<人。
                const drawKominka = (baseX, baseY, seed, scale = 1, forceType = -1) => {
                    const jitter = 0.92 + this.noise1D(seed + 5.5) * 0.2; // 個体差
                    const type = forceType >= 0 ? forceType : Math.floor(this.noise1D(seed + 1.15) * 4);
                    const cx = baseX + 100 * scale;
                    if (type === 0) drawFarmhouse(cx, baseY, seed, scale * jitter * 1.4);
                    else if (type === 1) drawHatago(cx, baseY, seed, scale * jitter * 1.5);
                    else if (type === 2) drawYamaie(cx, baseY, seed, scale * jitter * 1.46);
                    else drawChaya(cx, baseY, seed, scale * jitter * 1.3);
                };

                const drawSugi = (baseX, baseY, seed, scale) => {
                    ctx.save();
                    const th = (200 + this.noise1D(seed + 1.5) * 80) * scale;
                    const tw = (11 + this.noise1D(seed + 0.9) * 5) * scale;
                    const top = baseY - th;
                    const leafBottom = baseY - th * 0.36; // 葉の下端（根元の幹をしっかり見せる）
                    // 葉群（下へ垂れる層を重ねて密に）
                    const layers = 6;
                    for (let l = 0; l < layers; l++) {
                        const t = l / (layers - 1);
                        const ly = top + t * (leafBottom - top);
                        const lw = (15 + t * 46) * scale;
                        const lh = ((leafBottom - top) / layers) * 1.85;
                        ctx.fillStyle = l % 2 ? '#3c5e43' : '#477049';
                        ctx.beginPath();
                        ctx.moveTo(baseX, ly - lh * 0.5);
                        ctx.quadraticCurveTo(baseX - lw * 0.55, ly - lh * 0.08, baseX - lw, ly + lh * 0.5);
                        ctx.quadraticCurveTo(baseX - lw * 0.42, ly + lh * 0.32, baseX - lw * 0.12, ly + lh * 0.46);
                        ctx.lineTo(baseX, ly + lh * 0.6);
                        ctx.lineTo(baseX + lw * 0.12, ly + lh * 0.46);
                        ctx.quadraticCurveTo(baseX + lw * 0.42, ly + lh * 0.32, baseX + lw, ly + lh * 0.5);
                        ctx.quadraticCurveTo(baseX + lw * 0.55, ly - lh * 0.08, baseX, ly - lh * 0.5);
                        ctx.closePath();
                        ctx.fill();
                        // 左側の光
                        ctx.fillStyle = 'rgba(150,188,135,0.15)';
                        ctx.beginPath();
                        ctx.moveTo(baseX, ly - lh * 0.5);
                        ctx.quadraticCurveTo(baseX - lw * 0.55, ly - lh * 0.08, baseX - lw, ly + lh * 0.5);
                        ctx.quadraticCurveTo(baseX - lw * 0.5, ly + lh * 0.12, baseX - lw * 0.16, ly + lh * 0.1);
                        ctx.closePath();
                        ctx.fill();
                    }
                    // 根元の幹（前面・テーパー＋右に陰）。葉に埋もれないよう最後に描く
                    const trunkTop = leafBottom + 8 * scale;
                    ctx.fillStyle = '#5a4632';
                    ctx.beginPath();
                    ctx.moveTo(baseX - tw * 0.5, baseY);
                    ctx.lineTo(baseX - tw * 0.3, trunkTop);
                    ctx.lineTo(baseX + tw * 0.3, trunkTop);
                    ctx.lineTo(baseX + tw * 0.5, baseY);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = 'rgba(38,28,18,0.4)';
                    ctx.beginPath();
                    ctx.moveTo(baseX + tw * 0.06, baseY);
                    ctx.lineTo(baseX + tw * 0.14, trunkTop);
                    ctx.lineTo(baseX + tw * 0.3, trunkTop);
                    ctx.lineTo(baseX + tw * 0.5, baseY);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                };

                const drawMatsu = (baseX, baseY, seed, scale) => {
                    ctx.save();
                    const th = (140 + this.noise1D(seed + 1.5) * 55) * scale;
                    const bend = this.noiseSigned(seed + 2.1) * 26 * scale;
                    const topX = baseX + bend, topY = baseY - th;
                    // 幹（曲がり・テーパー）
                    ctx.strokeStyle = '#5a4330';
                    ctx.lineWidth = (11 + this.noise1D(seed + 0.9) * 5) * scale;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(baseX, baseY);
                    ctx.quadraticCurveTo(baseX + bend * 0.5, baseY - th * 0.55, topX, topY);
                    ctx.stroke();
                    // 横へ伸びる枝
                    ctx.lineWidth = 4 * scale;
                    ctx.beginPath();
                    ctx.moveTo(topX, topY + 14 * scale);
                    ctx.lineTo(topX - 32 * scale, topY - 2 * scale);
                    ctx.moveTo(topX, topY + 26 * scale);
                    ctx.lineTo(topX + 36 * scale, topY + 8 * scale);
                    ctx.stroke();
                    // 傘状の葉群（平たい段）
                    const tiers = [{ dx: -32, dy: 0, w: 44 }, { dx: 36, dy: 10, w: 48 }, { dx: 2, dy: -16, w: 52 }];
                    for (let i = 0; i < tiers.length; i++) {
                        const tr = tiers[i];
                        const cxx = topX + tr.dx * scale;
                        const cyy = topY + tr.dy * scale;
                        const cw = (tr.w + this.noise1D(seed + 6 + i) * 12) * scale;
                        ctx.fillStyle = '#33543a';
                        ctx.beginPath();
                        ctx.ellipse(cxx, cyy + 4 * scale, cw, cw * 0.34, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = i % 2 ? '#46704c' : '#3f6646';
                        ctx.beginPath();
                        ctx.ellipse(cxx, cyy, cw * 0.92, cw * 0.3, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = 'rgba(140,180,125,0.2)';
                        ctx.beginPath();
                        ctx.ellipse(cxx - cw * 0.2, cyy - cw * 0.08, cw * 0.5, cw * 0.13, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                };

                const drawKeyaki = (baseX, baseY, seed, scale) => {
                    ctx.save();
                    const th = (160 + this.noise1D(seed + 1.5) * 60) * scale;
                    const tw = (14 + this.noise1D(seed + 0.9) * 6) * scale;
                    const forkY = baseY - th * 0.5;
                    // 幹
                    ctx.strokeStyle = '#6a5440';
                    ctx.lineWidth = tw;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(baseX, baseY);
                    ctx.quadraticCurveTo(baseX + this.noiseSigned(seed + 3) * 8 * scale, forkY + th * 0.18, baseX, forkY);
                    ctx.stroke();
                    // 枝分かれ
                    ctx.lineWidth = tw * 0.5;
                    for (const b of [-1, 0.25, 1]) {
                        ctx.beginPath();
                        ctx.moveTo(baseX, forkY + 6 * scale);
                        ctx.quadraticCurveTo(baseX + b * 26 * scale, forkY - 16 * scale, baseX + b * 44 * scale, baseY - th * 0.74);
                        ctx.stroke();
                    }
                    // 樹冠（下に影、塊を重ね、上に光）
                    const crownY = baseY - th * 0.78;
                    const cr = (58 + this.noise1D(seed + 2.2) * 26) * scale;
                    ctx.fillStyle = '#3c5836';
                    ctx.beginPath();
                    ctx.ellipse(baseX, crownY + cr * 0.2, cr * 0.92, cr * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                    for (let b = 0; b < 7; b++) {
                        const a = (b / 7) * Math.PI * 2;
                        const bx = baseX + Math.cos(a) * cr * 0.5;
                        const by = crownY + Math.sin(a) * cr * 0.4;
                        ctx.fillStyle = b % 2 ? '#4f7544' : '#456b3e';
                        ctx.beginPath();
                        ctx.ellipse(bx, by, cr * 0.46, cr * 0.42, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.fillStyle = '#5c8550';
                    ctx.beginPath();
                    ctx.ellipse(baseX - cr * 0.12, crownY - cr * 0.12, cr * 0.5, cr * 0.44, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(150,190,130,0.22)';
                    ctx.beginPath();
                    ctx.ellipse(baseX - cr * 0.22, crownY - cr * 0.28, cr * 0.32, cr * 0.18, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                };

                // 街道の並木は杉のみ（松・落葉樹は他stageで使用）。seedで高さ・幹太が変わり個体差は出る
                const drawTree = (baseX, baseY, seed, scale = 1) => {
                    drawSugi(baseX, baseY, seed, scale);
                };

                // ── 添景 ──
                const drawToro = (x, baseY, seed, scale) => {
                    ctx.save();
                    const h = (54 + this.noise1D(seed + 1.2) * 14) * scale; // 石灯籠は人と同等～やや低く
                    const w = 18 * scale;
                    ctx.fillStyle = '#7c7a71';
                    ctx.fillRect(x - w * 0.7, baseY - 6 * scale, w * 1.4, 6 * scale);
                    ctx.fillStyle = '#9a988f';
                    ctx.fillRect(x - w * 0.28, baseY - h * 0.62, w * 0.56, h * 0.62 - 6 * scale);
                    ctx.fillStyle = '#8a8780';
                    ctx.fillRect(x - w * 0.5, baseY - h * 0.68, w, h * 0.06);
                    ctx.fillStyle = '#9a988f';
                    ctx.fillRect(x - w * 0.5, baseY - h * 0.84, w, h * 0.16);
                    ctx.fillStyle = 'rgba(255,224,150,0.55)';
                    ctx.fillRect(x - w * 0.22, baseY - h * 0.8, w * 0.44, h * 0.09);
                    ctx.fillStyle = '#a8a69d';
                    ctx.beginPath();
                    ctx.moveTo(x - w * 0.72, baseY - h * 0.84);
                    ctx.lineTo(x, baseY - h * 0.98);
                    ctx.lineTo(x + w * 0.72, baseY - h * 0.84);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#b4b2a8';
                    ctx.beginPath();
                    ctx.arc(x, baseY - h, 4 * scale, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                };

                const drawMichishirube = (x, baseY, seed) => {
                    ctx.save();
                    const h = 56 + this.noise1D(seed + 2.8) * 30;
                    ctx.fillStyle = '#9a907d';
                    ctx.fillRect(x, baseY - h, 16, h);
                    ctx.fillStyle = 'rgba(0,0,0,0.18)';
                    ctx.fillRect(x + 11, baseY - h, 5, h);
                    ctx.fillStyle = '#b0a692';
                    ctx.fillRect(x - 3, baseY - h - 7, 22, 7);
                    ctx.fillStyle = 'rgba(40,36,30,0.4)';
                    ctx.fillRect(x + 6, baseY - h + 8, 2, h - 16);
                    ctx.restore();
                };

                const drawJizo = (x, baseY, seed) => {
                    ctx.save();
                    const h = 48 + this.noise1D(seed + 2.5) * 16;
                    const w = h * 0.5;
                    // 台座（石）
                    ctx.fillStyle = '#86837b';
                    ctx.fillRect(x - w * 0.62, baseY - h * 0.12, w * 1.24, h * 0.12);
                    // 胴（丸みのある体）
                    ctx.fillStyle = '#a6a49b';
                    ctx.beginPath();
                    ctx.moveTo(x - w * 0.42, baseY - h * 0.12);
                    ctx.quadraticCurveTo(x - w * 0.5, baseY - h * 0.6, x, baseY - h * 0.64);
                    ctx.quadraticCurveTo(x + w * 0.5, baseY - h * 0.6, x + w * 0.42, baseY - h * 0.12);
                    ctx.closePath();
                    ctx.fill();
                    // 頭（大きめの丸・胴と繋がる）
                    ctx.fillStyle = '#b2b0a6';
                    ctx.beginPath();
                    ctx.arc(x, baseY - h * 0.73, w * 0.42, 0, Math.PI * 2);
                    ctx.fill();
                    // 赤い頭巾
                    ctx.fillStyle = 'rgba(192,68,56,0.88)';
                    ctx.beginPath();
                    ctx.arc(x, baseY - h * 0.77, w * 0.44, Math.PI * 1.04, Math.PI * 1.96);
                    ctx.closePath();
                    ctx.fill();
                    // 赤い前掛け（涎掛け）
                    ctx.fillStyle = 'rgba(198,72,60,0.9)';
                    ctx.beginPath();
                    ctx.moveTo(x - w * 0.34, baseY - h * 0.54);
                    ctx.quadraticCurveTo(x, baseY - h * 0.48, x + w * 0.34, baseY - h * 0.54);
                    ctx.lineTo(x + w * 0.24, baseY - h * 0.16);
                    ctx.quadraticCurveTo(x, baseY - h * 0.11, x - w * 0.24, baseY - h * 0.16);
                    ctx.closePath();
                    ctx.fill();
                    // 顔（目）
                    ctx.fillStyle = 'rgba(88,84,76,0.55)';
                    ctx.beginPath(); ctx.arc(x - w * 0.12, baseY - h * 0.74, w * 0.05, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(x + w * 0.12, baseY - h * 0.74, w * 0.05, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                };

                const drawIdo = (x, baseY, seed, scale) => {
                    ctx.save();
                    const r = 25 * scale;
                    ctx.fillStyle = '#8a8780';
                    ctx.fillRect(x - r, baseY - 31 * scale, r * 2, 31 * scale);
                    ctx.fillStyle = '#6f6c64';
                    ctx.beginPath();
                    ctx.ellipse(x, baseY - 31 * scale, r, 8 * scale, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#23211d';
                    ctx.beginPath();
                    ctx.ellipse(x, baseY - 31 * scale, r * 0.68, 5.4 * scale, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#5a4632';
                    ctx.lineWidth = 4.5 * scale;
                    ctx.beginPath();
                    ctx.moveTo(x - r * 0.7, baseY - 31 * scale);
                    ctx.lineTo(x - r * 0.7, baseY - 70 * scale);
                    ctx.moveTo(x + r * 0.7, baseY - 31 * scale);
                    ctx.lineTo(x + r * 0.7, baseY - 70 * scale);
                    ctx.stroke();
                    ctx.fillStyle = '#6f5f48';
                    ctx.beginPath();
                    ctx.moveTo(x - r * 1.15, baseY - 67 * scale);
                    ctx.lineTo(x, baseY - 86 * scale);
                    ctx.lineTo(x + r * 1.15, baseY - 67 * scale);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                };

                const drawIkegaki = (x, baseY, w, seed) => {
                    ctx.save();
                    const h = 34 + this.noise1D(seed + 1.4) * 14;
                    // 刈り込みの本体（上面が緩やかに波打つ連続した塊）
                    ctx.fillStyle = '#37532e';
                    ctx.beginPath();
                    ctx.moveTo(x, baseY);
                    ctx.lineTo(x, baseY - h * 0.66);
                    for (let xx = x; xx <= x + w; xx += 20) {
                        const hh = baseY - h - this.noiseSigned(seed + xx * 0.31) * 4;
                        ctx.quadraticCurveTo(xx + 5, hh, xx + 10, baseY - h + 2);
                        ctx.quadraticCurveTo(xx + 15, hh + 3, xx + 20, baseY - h + 1);
                    }
                    ctx.lineTo(x + w, baseY);
                    ctx.closePath();
                    ctx.fill();
                    // 葉の塊（明暗の斑で立体感）
                    for (let s = 0; s * 17 < w; s++) {
                        const sx = x + 9 + s * 17;
                        ctx.fillStyle = s % 2 ? 'rgba(96,134,74,0.4)' : 'rgba(74,108,60,0.36)';
                        ctx.beginPath();
                        ctx.ellipse(sx, baseY - h * 0.72, 10, 7, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // 上端のハイライト
                    ctx.fillStyle = 'rgba(150,186,120,0.22)';
                    for (let s = 0; s * 24 < w; s++) {
                        ctx.beginPath();
                        ctx.ellipse(x + 14 + s * 24, baseY - h * 0.9, 7, 3.5, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // 根元の影
                    ctx.fillStyle = 'rgba(28,38,22,0.4)';
                    ctx.fillRect(x, baseY - 4, w, 4);
                    ctx.restore();
                };

                const drawWaraTsumi = (x, baseY, seed) => {
                    ctx.save();
                    const h = 54 + this.noise1D(seed + 1.4) * 20;
                    const w = 32 + this.noise1D(seed + 2.1) * 10;
                    // 本体（丸みのある藁塚）
                    ctx.fillStyle = '#c8a85f';
                    ctx.beginPath();
                    ctx.moveTo(x - w / 2, baseY);
                    ctx.quadraticCurveTo(x - w * 0.46, baseY - h * 0.5, x - w * 0.12, baseY - h * 0.92);
                    ctx.quadraticCurveTo(x, baseY - h * 1.02, x + w * 0.12, baseY - h * 0.92);
                    ctx.quadraticCurveTo(x + w * 0.46, baseY - h * 0.5, x + w / 2, baseY);
                    ctx.closePath();
                    ctx.fill();
                    // 右側の陰
                    ctx.fillStyle = 'rgba(120,90,40,0.26)';
                    ctx.beginPath();
                    ctx.moveTo(x, baseY - h * 0.98);
                    ctx.quadraticCurveTo(x + w * 0.46, baseY - h * 0.5, x + w / 2, baseY);
                    ctx.lineTo(x, baseY);
                    ctx.closePath();
                    ctx.fill();
                    // 藁を巻いた段（緩い弧）
                    ctx.strokeStyle = 'rgba(150,118,58,0.5)';
                    ctx.lineWidth = 1.4;
                    for (let s = 1; s <= 3; s++) {
                        const tt = s / 4;
                        const yy = baseY - h * tt;
                        const ww = (w / 2) * (1 - tt * 0.72);
                        ctx.beginPath();
                        ctx.moveTo(x - ww, yy);
                        ctx.quadraticCurveTo(x, yy + 4, x + ww, yy);
                        ctx.stroke();
                    }
                    // てっぺんの結び
                    ctx.fillStyle = '#9c7a3c';
                    ctx.beginPath();
                    ctx.ellipse(x, baseY - h * 0.95, w * 0.1, h * 0.05, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                };

                // ── 街道の集落配置：区画ごとに同種の家をまとめ、区画サイズを不揃いにして単調さを避ける。
                //    家スロット(偶数i, j=i/2)ごとの建物タイプ計画。0=農家 1=旅籠 2=山家 3=茶屋。
                //    茅葺き農家(0)は序盤(j0-2)と中盤以降(j10-11)の2区画に必ず置き、本編中に確実に登場させる。 ──
                // 家はボス部屋(山道入口)に残らないよう手前で打ち切る。その先は杉のフリンジだけ少し置き、ボス部屋中央は開けて山道入口を遮らない
                const houseLimit = (this.maxProgress - CANVAS_WIDTH) * kPara - 200;
                const sceneLimit = houseLimit + 420;
                const villagePlan = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2];
                for (let i = kStartIdx; i <= kEndIdx; i++) {
                    const seed = i * 9.21;
                    const worldX = i * kCellSize;
                    const x = worldX - p * kPara + this.noiseSigned(seed + 0.7) * 36;
                    if (x < -280 || x > CANVAS_WIDTH + 280) continue;
                    if (worldX > sceneLimit) continue; // ボス部屋手前で添景も打ち切り（山道入口の裏に家・木が入り込まないように）
                    const y = this.groundY; // 背景は地平線に接地（プレイヤーは手前のgroundY+LANE_OFFSET）
                    if (i % 2 === 0) {
                        // 家スロット：計画配列の種を引いて区画ごとにまとめる。houseLimit内は必ず建てる（農家含め全種が確実に出る）
                        if (worldX < houseLimit) {
                            const j = i / 2;
                            const houseType = villagePlan[(((j % villagePlan.length) + villagePlan.length) % villagePlan.length)];
                            drawKominka(x - 8, y, seed, 1.0, houseType);
                        } else {
                            // 集落の外れ：杉並木
                            if (this.noise1D(seed + 3.3) > 0.4) drawTree(x + 20, y, seed, 0.95);
                        }
                    } else {
                        // 家の間：杉・道標・石灯籠をまばらに（隙間スロットなので家や茶屋の水車に重ならない）。地蔵はごく稀に
                        const r = this.noise1D(seed + 2.5);
                        if (r < 0.42) {
                            drawTree(x + 20, y, seed, 0.95);
                        } else if (r < 0.56) {
                            drawMichishirube(x + 30, y, seed);
                        } else if (r < 0.72) {
                            drawToro(x + 30, y, seed, 1.0);
                        } else if (r > 0.94) {
                            drawJizo(x + 30, y, seed);
                        }
                    }
                }
                break;
            }

            case 'mountain': {
                const drawMountainBand = (parallax, spanBase, peakBase, color, alpha) => {
                    const scroll = p * parallax;
                    const offset = ((scroll % spanBase) + spanBase) % spanBase;
                    const start = -2;
                    const end = Math.ceil(CANVAS_WIDTH / spanBase) + 3;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = color;

                    for (let i = start; i <= end; i++) {
                        const worldIndex = i + Math.floor(scroll / spanBase);
                        const seed = worldIndex * (6.41 + parallax * 7.2);
                        const ridgeW = spanBase * (0.85 + this.noise1D(seed + 0.7) * 0.9);
                        const x = i * spanBase - offset + this.noiseSigned(seed + 1.9) * 80;
                        
                        // 描画範囲を制限せず、自然に配置
                        if (x < -100 || x > CANVAS_WIDTH + 100) continue;
                        
                        const peakA = peakBase + this.noise1D(seed + 2.4) * (peakBase * 0.65);
                        const peakB = peakBase * 0.72 + this.noise1D(seed + 3.6) * (peakBase * 0.5);
                        const shoulder = peakBase * 0.45 + this.noise1D(seed + 4.8) * (peakBase * 0.35);

                        ctx.beginPath();
                        ctx.moveTo(x - 50, this.groundY);
                        ctx.bezierCurveTo(
                            x + ridgeW * 0.12, this.groundY - shoulder,
                            x + ridgeW * 0.26, this.groundY - peakA,
                            x + ridgeW * 0.48, this.groundY - peakB
                        );
                        ctx.bezierCurveTo(
                            x + ridgeW * 0.7, this.groundY - (peakB * 0.86),
                            x + ridgeW * 0.86, this.groundY - shoulder,
                            x + ridgeW + 50, this.groundY
                        );
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.restore();
                };

                drawMountainBand(0.12, 560, 180, currentPalette.far, 0.36);
                drawMountainBand(0.22, 430, 130, currentPalette.mid, 0.24);

                // 山際の霧。地面の境界で線にならないよう下端は薄く戻す。
                const mist = ctx.createLinearGradient(0, this.groundY - 190, 0, this.groundY - 18);
                mist.addColorStop(0, 'rgba(220, 210, 230, 0)');
                mist.addColorStop(0.72, 'rgba(196, 182, 210, 0.09)');
                mist.addColorStop(1, 'rgba(196, 182, 210, 0)');
                ctx.fillStyle = mist;
                ctx.fillRect(0, this.groundY - 190, CANVAS_WIDTH, 180);

                // 道沿いの岩・低木・苔むした石
                const rockPara = 0.58;
                const rockSpan = 130;
                const rockScroll = p * rockPara;
                const rockStart = Math.floor((rockScroll - rockSpan * 3) / rockSpan);
                const rockEnd = Math.ceil((rockScroll + CANVAS_WIDTH + rockSpan * 3) / rockSpan);
                for (let i = rockStart; i <= rockEnd; i++) {
                    const seed = i * 5.43;
                    if (this.noise1D(seed + 0.9) < 0.28) continue;
                    const x = i * rockSpan - rockScroll + this.noiseSigned(seed + 1.4) * 18;
                    
                    // 自然に配置
                    if (x < -100 || x > CANVAS_WIDTH + 100) continue;
                    
                    const roll = this.noise1D(seed + 6.2);

                    if (roll > 0.74) {
                        // 遠景の小岩。丸い黒い低木には見えないよう、小さく低く抑える。
                        const rw = 12 + this.noise1D(seed + 2.1) * 18;
                        const rh = 6 + this.noise1D(seed + 2.7) * 9;
                        const rockGrad = ctx.createLinearGradient(x, this.groundY - rh, x, this.groundY);
                        rockGrad.addColorStop(0, this.interpolateColor(currentPalette.near, '#4a4038', 0.38));
                        rockGrad.addColorStop(1, this.interpolateColor(currentPalette.near, '#2a201a', 0.46));
                        ctx.fillStyle = rockGrad;
                        ctx.beginPath();
                        ctx.moveTo(x - 4, this.groundY);
                        ctx.quadraticCurveTo(x + rw * 0.15, this.groundY - rh * 0.92, x + rw * 0.4, this.groundY - rh);
                        ctx.quadraticCurveTo(x + rw * 0.7, this.groundY - rh * 0.88, x + rw + 4, this.groundY);
                        ctx.closePath();
                        ctx.fill();
                        // 夕方の弱いリムだけを残す
                        ctx.fillStyle = `rgba(190, 132, 92, ${0.07 + this.noise1D(seed + 3.4) * 0.05})`;
                        ctx.beginPath();
                        ctx.ellipse(x + rw * 0.45, this.groundY - rh * 0.72, rw * 0.28, rh * 0.22, 0, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // 小石の集まり
                        const stoneCount = 1 + Math.floor(this.noise1D(seed + 5.1) * 2);
                        ctx.fillStyle = this.interpolateColor(currentPalette.near, '#3a3028', 0.38);
                        for (let s = 0; s < stoneCount; s++) {
                            const sx = x + s * (6 + this.noise1D(seed + 5.5 + s) * 8);
                            const sr = 2 + this.noise1D(seed + 5.8 + s) * 3;
                            ctx.beginPath();
                            ctx.ellipse(sx, this.groundY - sr * 0.4, sr, sr * 0.6, 0, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }

                this.renderStage3RoadsideProps(ctx);

                break;
            }
                
            case 'town': {
                const gY = this.groundY;
                const time = this.stageTime * 0.001;
                // 月夜で一定の明るさ（stage4は深夜化しない／月は空に出ている）。灯りは常にしっかり灯す
                const lampLit = 0.92;
                // 次stage(巨城)peekがスクロールで入る帯は中景の建物を間引いて「町の終わり＝城」に見せる
                const peekAnchorScreenX = (this.maxProgress - 150 - p) * 0.98;
                const peekBlockActive = peekAnchorScreenX < CANVAS_WIDTH + 460;
                const peekBlockLeft = peekAnchorScreenX - 883; // 城左端(-403)+建物最大張り出し(~480)で家が城に被らない

                // 灯りの脈動（位置は固定・輝度のみ）
                const pulse = (seed) => 0.72 + Math.sin(time * 1.8 + seed) * 0.28;
                // 暖色グロー（夜の灯りの滲み）
                const warmGlow = (gx, gyy, r, intensity, hot) => {
                    const a = this.clamp01(intensity) * lampLit;
                    if (a <= 0.02 || r <= 0) return;
                    const core = hot ? '255, 150, 74' : '255, 206, 132';
                    const grd = ctx.createRadialGradient(gx, gyy, 0, gx, gyy, r);
                    grd.addColorStop(0, `rgba(${core}, ${(0.5 * a).toFixed(3)})`);
                    grd.addColorStop(0.45, `rgba(${core}, ${(0.2 * a).toFixed(3)})`);
                    grd.addColorStop(1, `rgba(${core}, 0)`);
                    ctx.fillStyle = grd;
                    ctx.beginPath();
                    ctx.arc(gx, gyy, r, 0, Math.PI * 2);
                    ctx.fill();
                };

                const drawKawaraRoof = (x, y, w, h, roofColor, tileAlpha = 0.2) => {
                    ctx.fillStyle = roofColor;
                    ctx.beginPath();
                    ctx.moveTo(x - 24, y + 2);
                    ctx.quadraticCurveTo(x + w * 0.18, y - h * 0.86, x + w * 0.5, y - h);
                    ctx.quadraticCurveTo(x + w * 0.82, y - h * 0.86, x + w + 24, y + 2);
                    ctx.lineTo(x + w + 16, y + 10);
                    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.72, x - 16, y + 10);
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = `rgba(205, 210, 224, ${tileAlpha})`;
                    ctx.lineWidth = 1.1;
                    const tiles = Math.max(8, Math.floor(w / 18));
                    for (let i = 0; i <= tiles; i++) {
                        const tx = x - 16 + (i / tiles) * (w + 32);
                        ctx.beginPath();
                        ctx.moveTo(tx, y + 4);
                        ctx.lineTo(tx - 2, y + 10);
                        ctx.stroke();
                    }
                    // 月明かりのリム（左斜面＝月側を淡く持ち上げる）
                    ctx.strokeStyle = 'rgba(184, 204, 242, 0.13)';
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.moveTo(x - 22, y + 1);
                    ctx.quadraticCurveTo(x + w * 0.18, y - h * 0.86, x + w * 0.5, y - h);
                    ctx.stroke();
                };

                const drawLattice = (x, y, w, h, seed, tone = 0.68) => {
                    const barColor = this.interpolateColor('#6f5339', '#2a2118', tone);
                    ctx.fillStyle = barColor;
                    const cols = 4 + Math.floor(this.noise1D(seed + 2.1) * 4);
                    const colGap = w / (cols + 1);
                    for (let c = 1; c <= cols; c++) {
                        const lx = x + c * colGap;
                        ctx.fillRect(lx - 1.2, y, 2.4, h);
                    }
                    const rows = 2 + Math.floor(this.noise1D(seed + 3.7) * 2);
                    const rowGap = h / (rows + 1);
                    for (let r = 1; r <= rows; r++) {
                        const ly = y + r * rowGap;
                        ctx.fillRect(x, ly - 1, w, 2);
                    }
                };

                // 提灯（lx=吊り元x, topY=本体上端, red=赤提灯）
                const drawChochin = (lx, topY, rw, rh, seed, red) => {
                    ctx.strokeStyle = 'rgba(64, 50, 38, 0.85)';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(lx, topY - 8); ctx.lineTo(lx, topY); ctx.stroke();
                    const pl = pulse(seed);
                    ctx.fillStyle = red
                        ? `rgba(216, 92, 58, ${(0.84 * pl).toFixed(3)})`
                        : `rgba(245, 207, 140, ${(0.84 * pl).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.ellipse(lx, topY + rh, rw, rh, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(40, 32, 26, 0.85)';
                    ctx.fillRect(lx - rw * 0.42, topY - 1, rw * 0.84, 2);
                    ctx.fillRect(lx - rw * 0.42, topY + rh * 2 - 1, rw * 0.84, 2);
                    warmGlow(lx, topY + rh, rw * 3.4, red ? 0.75 : 0.62, red);
                };

                // ───────── 建物ヘルパー（x=左端, baseY=接地, 戻り値=幅） ─────────
                // 一：町家（漆喰二階・格子・虫籠窓・暖簾・軒提灯）
                const drawMachiya = (x, baseY, seed, scale) => {
                    const w = (150 + this.noise1D(seed + 1.8) * 90) * scale;
                    const h = (122 + this.noise1D(seed + 2.5) * 90) * scale;
                    const wallY = baseY - h;
                    const secondFloorY = wallY + h * 0.46;
                    ctx.fillStyle = this.interpolateColor('#8d6f4f', '#3a2d21', 0.30);
                    ctx.fillRect(x, secondFloorY, w, baseY - secondFloorY);
                    ctx.fillStyle = this.interpolateColor('#c2b298', '#6d6255', 0.32);
                    ctx.fillRect(x + 6, wallY + 10, w - 12, secondFloorY - wallY - 10);
                    ctx.fillStyle = this.interpolateColor('#5f442f', '#221a13', 0.34);
                    const postCount = 4 + Math.floor(this.noise1D(seed + 3.4) * 4);
                    for (let c = 0; c <= postCount; c++) {
                        ctx.fillRect(x + (c / postCount) * w - 2, wallY + 8, 4, baseY - wallY - 8);
                    }
                    const latH = Math.max(30, baseY - (secondFloorY + 14) - 10);
                    drawLattice(x + 14, secondFloorY + 14, Math.max(50, w - 28), latH, seed + 6.1, 0.64);
                    const mushikoCount = 3 + Math.floor(this.noise1D(seed + 7.2) * 3);
                    for (let m = 0; m < mushikoCount; m++) {
                        const mw = (18 + this.noise1D(seed + 8.1 + m) * 8);
                        const mx = x + 18 + m * ((w - 36) / mushikoCount);
                        const my = wallY + 22 + this.noise1D(seed + 9.4 + m) * 12;
                        ctx.fillStyle = 'rgba(30, 26, 22, 0.7)';
                        ctx.fillRect(mx, my, mw, 16);
                        if (this.noise1D(seed + 20.2 + m) < lampLit * 0.5) {
                            ctx.fillStyle = `rgba(255, 211, 138, ${(0.52 * pulse(seed + m)).toFixed(3)})`;
                            ctx.fillRect(mx + 1.5, my + 1.5, mw - 3, 13);
                            warmGlow(mx + mw / 2, my + 8, 22, 0.5, false);
                        } else {
                            ctx.fillStyle = 'rgba(150, 162, 188, 0.10)';
                            ctx.fillRect(mx + 1.5, my + 1.5, mw - 3, 4);
                        }
                    }
                    if (this.noise1D(seed + 10.8) > 0.4) {
                        const norenW = Math.min(74, w * 0.42);
                        const norenX = x + w * (0.22 + this.noise1D(seed + 11.7) * 0.2);
                        const norenY = secondFloorY + 8;
                        const norenH = 26 + this.noise1D(seed + 12.3) * 10;
                        ctx.fillStyle = this.interpolateColor('#3c5878', '#1e2f42', 0.30);
                        ctx.fillRect(norenX, norenY, norenW, norenH);
                        ctx.fillStyle = 'rgba(228, 234, 246, 0.22)';
                        ctx.fillRect(norenX + norenW * 0.5 - 1, norenY, 2, norenH);
                    }
                    if (this.noise1D(seed + 13.4) > 0.5) {
                        drawChochin(x + 14 + this.noise1D(seed + 14.2) * (w - 30), secondFloorY + 8, 8, 11, seed + 1.0, false);
                    }
                    drawKawaraRoof(x, wallY, w, (32 + this.noise1D(seed + 15.3) * 20) * scale, this.interpolateColor('#5c6678', '#262b37', 0.5), 0.16);
                    return w;
                };

                // 二：土蔵（白漆喰＋なまこ壁＋観音扉）
                const drawDozo = (x, baseY, seed, scale) => {
                    const w = (118 + this.noise1D(seed + 1.4) * 48) * scale;
                    const h = (122 + this.noise1D(seed + 2.2) * 54) * scale;
                    const wallY = baseY - h;
                    ctx.fillStyle = this.interpolateColor('#b6b2bc', '#5a5860', 0.30);
                    ctx.fillRect(x, wallY, w, baseY - wallY);
                    const namakoY = wallY + h * 0.5;
                    ctx.fillStyle = this.interpolateColor('#2b2e38', '#15171d', 0.4);
                    ctx.fillRect(x, namakoY, w, baseY - namakoY);
                    ctx.strokeStyle = 'rgba(206, 210, 222, 0.4)';
                    ctx.lineWidth = 1;
                    const gn = Math.max(4, Math.floor(w / 16));
                    for (let a = 0; a <= gn; a++) {
                        const gx = x + (a / gn) * w;
                        ctx.beginPath(); ctx.moveTo(gx, namakoY); ctx.lineTo(gx, baseY); ctx.stroke();
                    }
                    for (let b = 1; b * 16 < baseY - namakoY; b++) {
                        ctx.beginPath(); ctx.moveTo(x, namakoY + b * 16); ctx.lineTo(x + w, namakoY + b * 16); ctx.stroke();
                    }
                    const dw = w * 0.26, dx = x + w * 0.37;
                    ctx.fillStyle = this.interpolateColor('#3a2c1e', '#1a130c', 0.4);
                    ctx.fillRect(dx, baseY - h * 0.42, dw, h * 0.42);
                    const sw = w * 0.16, sx = x + w * 0.17, sy = wallY + h * 0.18;
                    if (this.noise1D(seed + 9.3) < lampLit * 0.4) {
                        ctx.fillStyle = `rgba(255, 206, 130, ${(0.5 * pulse(seed)).toFixed(3)})`;
                        ctx.fillRect(sx, sy, sw, h * 0.14);
                        warmGlow(sx + sw / 2, sy + h * 0.07, 26, 0.5, false);
                    } else {
                        ctx.fillStyle = 'rgba(26, 24, 28, 0.7)';
                        ctx.fillRect(sx, sy, sw, h * 0.14);
                    }
                    drawKawaraRoof(x, wallY, w, (40 + this.noise1D(seed + 4.1) * 16) * scale, this.interpolateColor('#565f70', '#222530', 0.5), 0.14);
                    return w;
                };

                // 三：山門（薬医門・太柱＋反り瓦屋根＋暗い門口）
                const drawSanmon = (x, baseY, seed, scale) => {
                    const w = (152 + this.noise1D(seed + 1.5) * 44) * scale;
                    const h = (150 + this.noise1D(seed + 2.3) * 40) * scale;
                    const wallY = baseY - h;
                    const eaveY = wallY + h * 0.32;
                    ctx.fillStyle = this.interpolateColor('#5a5660', '#2a282e', 0.42);
                    ctx.fillRect(x - 6, baseY - 10, w + 12, 10);
                    const pw = w * 0.12;
                    ctx.fillStyle = this.interpolateColor('#6a3b28', '#2c170e', 0.34);
                    ctx.fillRect(x + w * 0.12, eaveY, pw, baseY - eaveY);
                    ctx.fillRect(x + w * 0.76, eaveY, pw, baseY - eaveY);
                    // 門口（閉じた板戸＋中央の隙間から漏れる灯り）
                    const oW = w * 0.52, oX = x + w * 0.24, oY = baseY - h * 0.58, oH = h * 0.58;
                    ctx.fillStyle = 'rgba(10, 8, 11, 0.92)';
                    ctx.fillRect(oX, oY, oW, oH);
                    ctx.fillStyle = this.interpolateColor('#3a2a1c', '#170f08', 0.42);
                    ctx.fillRect(oX + 4, oY + 6, oW * 0.5 - 5, oH - 6);
                    ctx.fillRect(oX + oW * 0.5 + 1, oY + 6, oW * 0.5 - 5, oH - 6);
                    ctx.fillStyle = `rgba(255, 196, 110, ${(0.5 * pulse(seed)).toFixed(3)})`;
                    ctx.fillRect(oX + oW * 0.5 - 1.5, oY + 6, 3, oH - 6);
                    ctx.fillStyle = this.interpolateColor('#5a3322', '#27150c', 0.34);
                    ctx.fillRect(x + w * 0.06, eaveY, w * 0.88, h * 0.1);
                    ctx.fillStyle = this.interpolateColor('#566173', '#222633', 0.5);
                    ctx.beginPath();
                    ctx.moveTo(x - 16, eaveY + 4);
                    ctx.quadraticCurveTo(x + w * 0.5, eaveY - h * 0.42, x + w + 16, eaveY + 4);
                    ctx.lineTo(x + w + 4, eaveY + 18);
                    ctx.quadraticCurveTo(x + w * 0.5, eaveY - h * 0.2, x - 4, eaveY + 18);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = this.interpolateColor('#3a4150', '#1a1d26', 0.5);
                    ctx.fillRect(x + w * 0.5 - 6, eaveY - h * 0.34, 12, h * 0.12);
                    ctx.strokeStyle = 'rgba(184, 204, 242, 0.13)';
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.moveTo(x - 14, eaveY + 2);
                    ctx.quadraticCurveTo(x + w * 0.5, eaveY - h * 0.42, x + w * 0.5, eaveY - h * 0.4);
                    ctx.stroke();
                    warmGlow(x + w * 0.5, baseY - h * 0.5, 52, 0.5, false);
                    return w;
                };

                // 四：火の見櫓（細い四脚＋筋交い＋見張り台＋半鐘）
                const drawYagura = (cx, baseY, seed, scale) => {
                    const topY = baseY - (206 + this.noise1D(seed + 1.2) * 44) * scale;
                    const baseW = 44 * scale, topW = 28 * scale;
                    const legColor = this.interpolateColor('#4a3a2a', '#211810', 0.42);
                    ctx.strokeStyle = legColor;
                    ctx.lineWidth = 3 * scale;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(cx - baseW, baseY); ctx.lineTo(cx - topW, topY);
                    ctx.moveTo(cx + baseW, baseY); ctx.lineTo(cx + topW, topY);
                    ctx.stroke();
                    ctx.lineWidth = 1.6 * scale;
                    const tiers = 4;
                    for (let t = 0; t <= tiers; t++) {
                        const ty = baseY + (topY - baseY) * (t / tiers);
                        const tw = baseW + (topW - baseW) * (t / tiers);
                        ctx.beginPath(); ctx.moveTo(cx - tw, ty); ctx.lineTo(cx + tw, ty); ctx.stroke();
                        if (t < tiers) {
                            const ty2 = baseY + (topY - baseY) * ((t + 1) / tiers);
                            const tw2 = baseW + (topW - baseW) * ((t + 1) / tiers);
                            ctx.beginPath();
                            ctx.moveTo(cx - tw, ty); ctx.lineTo(cx + tw2, ty2);
                            ctx.moveTo(cx + tw, ty); ctx.lineTo(cx - tw2, ty2);
                            ctx.stroke();
                        }
                    }
                    ctx.lineCap = 'butt';
                    ctx.fillStyle = legColor;
                    ctx.fillRect(cx - topW - 6, topY - 4, (topW + 6) * 2, 6);
                    ctx.strokeStyle = legColor; ctx.lineWidth = 2 * scale;
                    ctx.strokeRect(cx - topW - 4, topY - 18, (topW + 4) * 2, 16);
                    ctx.fillStyle = this.interpolateColor('#546070', '#222633', 0.5);
                    ctx.beginPath();
                    ctx.moveTo(cx - topW - 10, topY - 18);
                    ctx.lineTo(cx, topY - 36);
                    ctx.lineTo(cx + topW + 10, topY - 18);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(60, 50, 30, 0.9)';
                    ctx.beginPath(); ctx.arc(cx + topW * 0.5, topY - 6, 4 * scale, 0, Math.PI * 2); ctx.fill();
                    warmGlow(cx, topY - 8, 30, 0.6, true);
                    return baseW * 2;
                };

                // 五：裏長屋（低い棟割・連続戸口）
                const drawNagaya = (x, baseY, seed, scale) => {
                    const w = (200 + this.noise1D(seed + 1.3) * 90) * scale;
                    const h = (78 + this.noise1D(seed + 2.1) * 26) * scale;
                    const wallY = baseY - h;
                    ctx.fillStyle = this.interpolateColor('#6e5740', '#2e241a', 0.34);
                    ctx.fillRect(x, wallY, w, h);
                    const units = 3 + Math.floor(this.noise1D(seed + 3.2) * 3);
                    const uw = w / units;
                    for (let u = 0; u < units; u++) {
                        const ux = x + u * uw;
                        ctx.fillStyle = this.interpolateColor('#3a2c1e', '#1a130c', 0.42);
                        ctx.fillRect(ux + uw * 0.2, baseY - h * 0.66, uw * 0.6, h * 0.66);
                        if (this.noise1D(seed + 5.0 + u) < lampLit * 0.4) {
                            ctx.fillStyle = `rgba(255, 200, 128, ${(0.42 * pulse(seed + u)).toFixed(3)})`;
                            ctx.fillRect(ux + uw * 0.24, baseY - h * 0.6, uw * 0.5, h * 0.5);
                            warmGlow(ux + uw * 0.5, baseY - h * 0.3, 22, 0.4, false);
                        }
                        ctx.fillStyle = this.interpolateColor('#4a3724', '#201609', 0.42);
                        ctx.fillRect(ux - 1.5, wallY, 3, h);
                    }
                    drawKawaraRoof(x, wallY, w, (24 + this.noise1D(seed + 4.2) * 12) * scale, this.interpolateColor('#525b6c', '#23262f', 0.5), 0.12);
                    return w;
                };

                // 海鼠塀（武家屋敷の囲い）
                const drawNamakoBei = (x, baseY, w, seed) => {
                    const h = 54;
                    const wallY = baseY - h;
                    ctx.fillStyle = this.interpolateColor('#9a98a2', '#4c4a52', 0.32);
                    ctx.fillRect(x, wallY, w, h);
                    ctx.fillStyle = this.interpolateColor('#2b2e38', '#15171d', 0.4);
                    ctx.fillRect(x, wallY + h * 0.4, w, h * 0.6);
                    ctx.strokeStyle = 'rgba(210, 214, 226, 0.4)';
                    ctx.lineWidth = 1;
                    const gn = Math.max(4, Math.floor(w / 14));
                    for (let a = 0; a <= gn; a++) {
                        const gx = x + (a / gn) * w;
                        ctx.beginPath(); ctx.moveTo(gx, wallY + h * 0.4); ctx.lineTo(gx, baseY); ctx.stroke();
                    }
                    ctx.fillStyle = this.interpolateColor('#4a5263', '#20242e', 0.5);
                    ctx.fillRect(x - 3, wallY - 5, w + 6, 7);
                };

                // ───────── 添景ヘルパー ─────────
                // 常夜灯（石・夜は火袋が発光）
                const drawJoyato = (x, baseY, seed) => {
                    const h = 56 + this.noise1D(seed + 1.1) * 18;
                    const col = this.interpolateColor('#807a72', '#33302c', 0.4);
                    ctx.fillStyle = col;
                    ctx.fillRect(x - 3, baseY - 8, 22, 8);
                    ctx.fillRect(x + 4, baseY - h, 9, h - 8);
                    ctx.fillRect(x - 1, baseY - h - 12, 19, 6);
                    ctx.fillStyle = 'rgba(40, 36, 30, 0.85)';
                    ctx.fillRect(x - 2, baseY - h - 26, 21, 14);
                    ctx.fillStyle = `rgba(255, 210, 130, ${(0.72 * pulse(seed)).toFixed(3)})`;
                    ctx.fillRect(x + 1, baseY - h - 23, 15, 9);
                    ctx.fillStyle = col;
                    ctx.beginPath();
                    ctx.moveTo(x - 6, baseY - h - 26);
                    ctx.lineTo(x + 8.5, baseY - h - 36);
                    ctx.lineTo(x + 23, baseY - h - 26);
                    ctx.closePath(); ctx.fill();
                    warmGlow(x + 8.5, baseY - h - 18, 40, 0.8, false);
                };

                // 天水桶（防火用の桶）
                const drawTensuiOke = (x, baseY, seed) => {
                    const w = 26 + this.noise1D(seed + 1.2) * 8;
                    const h = 30 + this.noise1D(seed + 2.1) * 8;
                    ctx.fillStyle = this.interpolateColor('#5a4632', '#241a10', 0.36);
                    ctx.beginPath();
                    ctx.moveTo(x - w * 0.5, baseY);
                    ctx.lineTo(x - w * 0.42, baseY - h);
                    ctx.lineTo(x + w * 0.42, baseY - h);
                    ctx.lineTo(x + w * 0.5, baseY);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(120, 150, 190, 0.32)';
                    ctx.beginPath();
                    ctx.ellipse(x, baseY - h, w * 0.42, 3.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(30, 22, 14, 0.6)';
                    ctx.lineWidth = 1.4;
                    for (let t = 1; t <= 2; t++) {
                        const ty = baseY - h * (t / 3);
                        ctx.beginPath(); ctx.moveTo(x - w * 0.48, ty); ctx.lineTo(x + w * 0.48, ty); ctx.stroke();
                    }
                };

                // 夜泣き屋台（赤提灯・夜の温かみ）
                const drawYatai = (x, baseY, seed) => {
                    const w = 60, h = 34;
                    ctx.fillStyle = this.interpolateColor('#5a4330', '#241a12', 0.34);
                    ctx.fillRect(x, baseY - h, w, h);
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(x, baseY - 6, w, 6);
                    ctx.fillStyle = this.interpolateColor('#6b5640', '#2a2016', 0.4);
                    ctx.fillRect(x - 6, baseY - h - 30, w + 12, 8);
                    ctx.fillStyle = 'rgba(60, 40, 30, 0.7)';
                    ctx.fillRect(x - 2, baseY - h - 22, w + 4, 14);
                    drawChochin(x + w * 0.5, baseY - h - 40, 9, 12, seed, true);
                    warmGlow(x + w * 0.5, baseY - h * 0.5, 48, 0.7, true);
                };

                // 松（夜色・横に広がる段）
                const drawMatsu = (x, baseY, seed, scale) => {
                    const h = (90 + this.noise1D(seed + 1.1) * 40) * scale;
                    ctx.strokeStyle = this.interpolateColor('#3a2c1e', '#1a130c', 0.42);
                    ctx.lineWidth = 4 * scale;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x, baseY);
                    ctx.quadraticCurveTo(x + 8 * scale, baseY - h * 0.5, x - 4 * scale, baseY - h * 0.8);
                    ctx.stroke();
                    ctx.lineCap = 'butt';
                    for (let t = 0; t < 3; t++) {
                        const ly = baseY - h * (0.55 + t * 0.18);
                        const lw = (40 - t * 6) * scale;
                        ctx.fillStyle = this.interpolateColor('#2c4636', '#13211a', 0.4 + t * 0.06);
                        ctx.beginPath();
                        ctx.ellipse(x + (t % 2 ? 10 : -8) * scale, ly, lw, 12 * scale, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.fillStyle = 'rgba(150, 180, 210, 0.10)';
                    ctx.beginPath();
                    ctx.ellipse(x - 14 * scale, baseY - h * 0.78, 14 * scale, 5 * scale, 0, 0, Math.PI * 2);
                    ctx.fill();
                };

                // 木戸（裏路地の門）
                const drawKido = (x, baseY, seed) => {
                    const w = 40, h = 56;
                    ctx.fillStyle = this.interpolateColor('#4a3826', '#1f160d', 0.42);
                    ctx.fillRect(x, baseY - h, 4, h);
                    ctx.fillRect(x + w - 4, baseY - h, 4, h);
                    ctx.fillRect(x - 4, baseY - h, w + 8, 6);
                    ctx.fillStyle = this.interpolateColor('#3a2c1e', '#1a130c', 0.42);
                    ctx.fillRect(x + 4, baseY - h + 8, w - 8, h - 8);
                    ctx.strokeStyle = 'rgba(20,15,10,0.5)';
                    ctx.lineWidth = 1;
                    for (let v = 1; v < 4; v++) {
                        const vx = x + 4 + (v / 4) * (w - 8);
                        ctx.beginPath(); ctx.moveTo(vx, baseY - h + 8); ctx.lineTo(vx, baseY); ctx.stroke();
                    }
                };

                // ───────── 奥：遠町のシルエット（2層・窓明かり点在） ─────────
                const drawFarTownRow = (para, spacing, baseTop, hMin, hVar, colA, colB, tone) => {
                    const off = ((p * para) % spacing + spacing) % spacing;
                    for (let i = -2; i < CANVAS_WIDTH / spacing + 4; i++) {
                        const wi = i + Math.floor((p * para) / spacing);
                        const seed = wi * (6.13 + para * 5);
                        const x = i * spacing - off + this.noiseSigned(seed + 0.7) * 16;
                        if (x < -spacing || x > CANVAS_WIDTH + spacing) continue;
                        const w = spacing * (0.7 + this.noise1D(seed + 1.2) * 0.5);
                        const h = hMin + this.noise1D(seed + 2.8) * hVar;
                        const wallY = baseTop - h;
                        ctx.fillStyle = this.interpolateColor(colA, colB, tone);
                        ctx.fillRect(x, wallY, w, baseTop - wallY);
                        ctx.beginPath();
                        ctx.moveTo(x - 6, wallY + 2);
                        ctx.lineTo(x + w * 0.5, wallY - 14);
                        ctx.lineTo(x + w + 6, wallY + 2);
                        ctx.closePath();
                        ctx.fill();
                        if (this.noise1D(seed + 4.7) < lampLit * 0.5) {
                            ctx.fillStyle = `rgba(255, 198, 120, ${(0.22 * pulse(seed)).toFixed(3)})`;
                            ctx.fillRect(x + w * 0.3, wallY + h * 0.4, 6, 8);
                        }
                    }
                };
                drawFarTownRow(0.10, 150, gY - 18, 40, 40, '#3a3a48', '#1c1d26', 0.5);
                drawFarTownRow(0.18, 200, gY - 10, 64, 50, '#454250', '#20212a', 0.34);

                // 巨城は renderNextStagePeek(case4) の巨大な石垣＋大手門として一本化（中央の重複画像は廃止）

                // ───────── 中景：区画(district)制で城下町を作る ─────────
                const kPara = 0.40;
                const kCell = 284;
                const kStart = Math.floor((p * kPara - 340) / kCell);
                const kEnd = Math.ceil((CANVAS_WIDTH + p * kPara + 340) / kCell);
                for (let i = kStart; i <= kEnd; i++) {
                    const seed = i * 9.21;
                    const x = i * kCell - p * kPara + this.noiseSigned(seed + 0.7) * 28;
                    if (x < -340 || x > CANVAS_WIDTH + 340) continue;
                    // 城門peekの帯は建物を出さない（町の終わり＝城に見せる）
                    if (peekBlockActive && x > peekBlockLeft) continue;
                    const baseY = this.groundY - 2;
                    // 区画タイプを巡回式で決定（grp×2 %5 で5種を確実に巡回・たまに隣へ揺らす）
                    const grp = Math.floor(i / 3);
                    let districtType = (grp * 2) % 5; // 0商家 1門前 2辻 3武家 4裏長屋
                    if (this.noise1D(grp * 4.1 + 0.3) > 0.72) districtType = (districtType + 1) % 5;
                    const local = this.noise1D(seed + 1.6);
                    const cellInGroup = ((i % 3) + 3) % 3; // 区画内の位置（0,1,2）。象徴建物は中央(1)だけに置く

                    if (districtType === 0) {
                        // 商家通り（町家が連続して賑わう）
                        const w = drawMachiya(x, baseY, seed, 1.0);
                        if (local > 0.55) drawYatai(x + w + 16, baseY, seed + 2.2);
                        else drawJoyato(x + w + 22, baseY, seed + 3.1);
                        if (this.noise1D(seed + 4.8) > 0.62) drawDozo(x + w + 78, baseY, seed + 5.6, 0.86);
                    } else if (districtType === 1) {
                        // 寺社の門前：中央に山門、両隣は町家＋常夜灯/松
                        if (cellInGroup === 1) {
                            drawJoyato(x - 24, baseY, seed + 6.1);
                            const w = drawSanmon(x, baseY, seed, 1.0);
                            drawJoyato(x + w + 18, baseY, seed + 6.9);
                            if (local > 0.4) drawMatsu(x + w + 50, baseY, seed + 7.7, 0.95);
                        } else {
                            const w = drawMachiya(x, baseY, seed + 0.5, 0.95);
                            if (this.noise1D(seed + 7.1) > 0.5) drawMatsu(x + w + 24, baseY, seed + 7.7, 0.9);
                            else drawJoyato(x + w + 22, baseY, seed + 6.9);
                        }
                    } else if (districtType === 2) {
                        // 辻：中央に火の見櫓、両隣は町家＋天水桶/蔵
                        if (cellInGroup === 1) {
                            drawYagura(x + 50, baseY, seed, 1.0);
                            drawTensuiOke(x + 96, baseY, seed + 9.1);
                            if (local > 0.45) drawMachiya(x + 130, baseY, seed + 8.2, 0.82);
                        } else {
                            const w = drawMachiya(x, baseY, seed + 0.3, 0.96);
                            if (this.noise1D(seed + 9.5) > 0.55) drawDozo(x + w + 22, baseY, seed + 9.9, 0.84);
                            else drawTensuiOke(x + w + 20, baseY, seed + 9.1);
                        }
                    } else if (districtType === 3) {
                        // 武家屋敷（海鼠塀が連続・中央に蔵＋常夜灯、塀越しに松）
                        drawNamakoBei(x, baseY, kCell + 60, seed + 10.3);
                        if (cellInGroup === 1) {
                            drawDozo(x + 70, baseY, seed + 12.6, 0.98);
                            drawJoyato(x - 18, baseY, seed + 10.9);
                        }
                        if (this.noise1D(seed + 11.4) > 0.5) drawMatsu(x + 200, baseY, seed + 11.0, 1.0);
                    } else {
                        // 裏長屋（棟割が連続）
                        const w = drawNagaya(x, baseY, seed, 1.0);
                        drawTensuiOke(x + w + 12, baseY, seed + 12.2);
                        if (local > 0.5) drawKido(x + w + 40, baseY, seed + 13.0);
                    }
                }

                // ───────── 手前：石畳の濡れた照り返し（near, 速いパララックス） ─────────
                const sheen = ctx.createLinearGradient(0, gY - 6, 0, gY + 12);
                sheen.addColorStop(0, 'rgba(150, 170, 210, 0)');
                sheen.addColorStop(0.5, 'rgba(150, 170, 210, 0.06)');
                sheen.addColorStop(1, 'rgba(150, 170, 210, 0)');
                ctx.fillStyle = sheen;
                ctx.fillRect(0, gY - 6, CANVAS_WIDTH, 18);
                const reflPara = 0.62;
                const reflScroll = p * reflPara;
                const reflSpan = 150;
                const reflStart = Math.floor((reflScroll - reflSpan) / reflSpan);
                const reflEnd = Math.ceil((reflScroll + CANVAS_WIDTH + reflSpan) / reflSpan);
                for (let i = reflStart; i <= reflEnd; i++) {
                    const seed = i * 4.7;
                    if (this.noise1D(seed + 0.5) < 0.5) continue;
                    const rx = i * reflSpan - reflScroll + this.noiseSigned(seed + 1.1) * 40;
                    if (rx < -40 || rx > CANVAS_WIDTH + 40) continue;
                    ctx.fillStyle = `rgba(255, 200, 130, ${((0.06 + this.noise1D(seed + 2.2) * 0.06) * lampLit).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.ellipse(rx, gY + 3, 16 + this.noise1D(seed + 3.1) * 14, 3, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                break;
            }

            case 'castle': {
                const warmPulse = 0.55 + Math.sin(this.stageTime * 0.0016) * 0.45;

                // 朱塗りの内壁
                const wallGrad = ctx.createLinearGradient(0, 0, 0, this.groundY);
                wallGrad.addColorStop(0, 'rgba(156, 46, 28, 0.9)');
                wallGrad.addColorStop(0.42, 'rgba(118, 36, 24, 0.9)');
                wallGrad.addColorStop(1, 'rgba(74, 24, 18, 0.92)');
                ctx.fillStyle = wallGrad;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

                // 天井梁
                const beamSpan = 220;
                const beamScroll = p * 0.36;
                const beamStart = Math.floor((beamScroll - beamSpan * 2) / beamSpan);
                const beamEnd = Math.ceil((beamScroll + CANVAS_WIDTH + beamSpan * 2) / beamSpan);
                ctx.fillStyle = 'rgba(88, 38, 24, 0.82)';
                ctx.fillRect(0, 0, CANVAS_WIDTH, 46);
                for (let i = beamStart; i <= beamEnd; i++) {
                    ctx.fillRect(i * beamSpan - beamScroll, 46, 32, 100);
                }

                // 柱・壁・金具（窓は置かない）
                const panelSpan = 340;
                const panelPara = 0.4;
                const panelScroll = p * panelPara;
                const panelStart = Math.floor((panelScroll - panelSpan * 3) / panelSpan);
                const panelEnd = Math.ceil((panelScroll + CANVAS_WIDTH + panelSpan * 3) / panelSpan);
                for (let i = panelStart; i <= panelEnd; i++) {
                    const panelX = i * panelSpan - panelScroll;
                    
                    // 自然に配置
                    if (panelX < -panelSpan || panelX > CANVAS_WIDTH + panelSpan) continue;
                    
                    const seed = i * 9.17;

                    // 柱
                    ctx.fillStyle = 'rgba(66, 28, 20, 0.9)';
                    ctx.fillRect(panelX, 0, 30, this.groundY);
                    ctx.fillRect(panelX + panelSpan - 30, 0, 30, this.groundY);

                    // 漆壁
                    const panelGrad = ctx.createLinearGradient(0, 78, 0, this.groundY - 14);
                    panelGrad.addColorStop(0, 'rgba(134, 44, 30, 0.42)');
                    panelGrad.addColorStop(1, 'rgba(84, 28, 22, 0.5)');
                    ctx.fillStyle = panelGrad;
                    ctx.fillRect(panelX + 30, 78, panelSpan - 60, this.groundY - 160);

                    // 横桟
                    ctx.strokeStyle = 'rgba(190, 118, 72, 0.2)';
                    ctx.lineWidth = 2;
                    for (let y = 112; y < this.groundY - 44; y += 42) {
                        ctx.beginPath();
                        ctx.moveTo(panelX + 36, y);
                        ctx.lineTo(panelX + panelSpan - 36, y);
                        ctx.stroke();
                    }

                    // 障子意匠（外は見えない）
                    ctx.fillStyle = 'rgba(220, 188, 144, 0.13)';
                    const shojiY = this.groundY - 174;
                    const shojiH = 156;
                    ctx.fillRect(panelX + 48, shojiY, panelSpan - 96, shojiH);
                    ctx.strokeStyle = 'rgba(110, 66, 42, 0.65)';
                    ctx.lineWidth = 1.4;
                    ctx.strokeRect(panelX + 48, shojiY, panelSpan - 96, shojiH);
                    const splits = 3 + Math.floor(this.noise1D(seed + 1.8) * 3);
                    for (let s = 1; s <= splits; s++) {
                        const sx = panelX + 48 + (s / (splits + 1)) * (panelSpan - 96);
                        ctx.beginPath();
                        ctx.moveTo(sx, shojiY + 2);
                        ctx.lineTo(sx, shojiY + shojiH - 2);
                        ctx.stroke();
                    }

                    // 家紋プレート
                    if (this.noise1D(seed + 3.2) > 0.42) {
                        const monX = panelX + panelSpan * (0.42 + this.noiseSigned(seed + 4.6) * 0.12);
                        const monY = 96 + this.noise1D(seed + 5.4) * 38;
                        const monR = 12 + this.noise1D(seed + 6.1) * 6;
                        ctx.fillStyle = `rgba(248, 210, 150, ${0.18 + warmPulse * 0.1})`;
                        ctx.beginPath();
                        ctx.arc(monX, monY, monR, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(68, 34, 22, 0.6)';
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        ctx.arc(monX, monY, monR * 0.45, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }

                // 吊り灯り
                const lanternSpan = 250;
                const lanternScroll = p * 0.5;
                const lanternStart = Math.floor((lanternScroll - lanternSpan * 2) / lanternSpan);
                const lanternEnd = Math.ceil((lanternScroll + CANVAS_WIDTH + lanternSpan * 2) / lanternSpan);
                for (let i = lanternStart; i <= lanternEnd; i++) {
                    const seed = i * 6.31;
                    const lx = i * lanternSpan - lanternScroll + 120;
                    const ly = 92 + this.noiseSigned(seed + 1.2) * 10;
                    const r = 10 + this.noise1D(seed + 2.6) * 4;
                    ctx.strokeStyle = 'rgba(86, 52, 34, 0.7)';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(lx, 44);
                    ctx.lineTo(lx, ly - r);
                    ctx.stroke();
                    ctx.fillStyle = `rgba(252, 210, 146, ${0.28 + warmPulse * 0.12})`;
                    ctx.beginPath();
                    ctx.ellipse(lx, ly, r, r * 1.35, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                break;
            }

            case 'tenshu': {
                // 最上層の屋根上回廊（遠景の天守・楕円雲は出さない）
                const horizonGlow = ctx.createLinearGradient(0, this.groundY - 210, 0, this.groundY - 40);
                horizonGlow.addColorStop(0, 'rgba(180, 206, 238, 0)');
                horizonGlow.addColorStop(1, 'rgba(132, 162, 202, 0.14)');
                ctx.fillStyle = horizonGlow;
                ctx.fillRect(0, this.groundY - 210, CANVAS_WIDTH, 190);

                // 背後の屋根稜線
                const ridgeParallax = 0.38;
                const ridgeSpan = 180;
                const ridgeScroll = p * ridgeParallax;
                const ridgeStart = Math.floor((ridgeScroll - ridgeSpan * 3) / ridgeSpan);
                const ridgeEnd = Math.ceil((ridgeScroll + CANVAS_WIDTH + ridgeSpan * 3) / ridgeSpan);
                for (let i = ridgeStart; i <= ridgeEnd; i++) {
                    const seed = i * 5.47;
                    const x = i * ridgeSpan - ridgeScroll;
                    const ridgeH = 44 + this.noise1D(seed + 1.4) * 18;
                    ctx.fillStyle = this.interpolateColor('#556079', '#202633', 0.42);
                    ctx.beginPath();
                    ctx.moveTo(x - 32, this.groundY - 122);
                    ctx.quadraticCurveTo(x + ridgeSpan * 0.5, this.groundY - 122 - ridgeH, x + ridgeSpan + 32, this.groundY - 122);
                    ctx.lineTo(x + ridgeSpan + 24, this.groundY - 108);
                    ctx.quadraticCurveTo(x + ridgeSpan * 0.5, this.groundY - 108 - ridgeH * 0.58, x - 24, this.groundY - 108);
                    ctx.closePath();
                    ctx.fill();
                }

                // 回廊の手前欄干
                const railParallax = 1.0;
                const railSpacing = 72;
                const railScroll = p * railParallax;
                const railStart = Math.floor((railScroll - railSpacing * 2) / railSpacing);
                const railEnd = Math.ceil((railScroll + CANVAS_WIDTH + railSpacing * 2) / railSpacing);
                ctx.fillStyle = this.interpolateColor(currentPalette.near, '#111217', 0.34);
                ctx.fillRect(0, this.groundY - 72, CANVAS_WIDTH, 32);
                for (let i = railStart; i <= railEnd; i++) {
                    const x = i * railSpacing - railScroll;
                    ctx.fillRect(x + 10, this.groundY - 72, 8, 72);
                    ctx.fillRect(x + 38, this.groundY - 72, 8, 72);
                    ctx.fillStyle = 'rgba(188, 204, 232, 0.15)';
                    ctx.fillRect(x + 10, this.groundY - 72, 36, 2);
                    ctx.fillStyle = this.interpolateColor(currentPalette.near, '#111217', 0.34);
                }

                // ボス戦中：最終ステージなので次のステージはないが、夜明け（クリア後の朝焼け）を予感させる光を遠くに表示
                if (this.bossSpawned) {
                    ctx.save();
                    // 地平線の強い朝焼けグロー
                    const dawnGlow = ctx.createRadialGradient(
                        CANVAS_WIDTH * 0.5, this.groundY, 0,
                        CANVAS_WIDTH * 0.5, this.groundY, CANVAS_WIDTH * 0.7
                    );
                    dawnGlow.addColorStop(0,   `rgba(255, 180, 60, ${0.22 * this.bossEncounterBlend})`);
                    dawnGlow.addColorStop(0.35, `rgba(255, 120, 30, ${0.14 * this.bossEncounterBlend})`);
                    dawnGlow.addColorStop(1,   'rgba(255, 60, 10, 0)');
                    ctx.fillStyle = dawnGlow;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

                    // 地平線の細い光の帯
                    const horizonBand = ctx.createLinearGradient(0, this.groundY - 30, 0, this.groundY + 10);
                    horizonBand.addColorStop(0, 'rgba(255, 200, 80, 0)');
                    horizonBand.addColorStop(0.4, `rgba(255, 190, 60, ${0.28 * this.bossEncounterBlend})`);
                    horizonBand.addColorStop(1, 'rgba(255, 140, 30, 0)');
                    ctx.fillStyle = horizonBand;
                    ctx.fillRect(0, this.groundY - 30, CANVAS_WIDTH, 40);
                    ctx.restore();
                }

                // 屋根瓦列
                const tileSpan = 60;
                const tileScroll = p * 1.08;
                const tileStart = Math.floor((tileScroll - tileSpan * 3) / tileSpan);
                const tileEnd = Math.ceil((tileScroll + CANVAS_WIDTH + tileSpan * 3) / tileSpan);
                for (let i = tileStart; i <= tileEnd; i++) {
                    const x = i * tileSpan - tileScroll;
                    const tileH = 10 + this.noise1D(i * 2.3 + 1.9) * 2;
                    ctx.fillStyle = 'rgba(90, 98, 118, 0.82)';
                    ctx.beginPath();
                    ctx.moveTo(x, this.groundY - 42);
                    ctx.quadraticCurveTo(x + 30, this.groundY - 42 - tileH, x + 60, this.groundY - 42);
                    ctx.lineTo(x + 60, this.groundY - 28);
                    ctx.quadraticCurveTo(x + 30, this.groundY - 19, x, this.groundY - 28);
                    ctx.closePath();
                    ctx.fill();
                }

                // 幟
                const flagSpan = 280;
                const flagScroll = p * 0.76;
                const flagStart = Math.floor((flagScroll - flagSpan * 2) / flagSpan);
                const flagEnd = Math.ceil((flagScroll + CANVAS_WIDTH + flagSpan * 2) / flagSpan);
                for (let i = flagStart; i <= flagEnd; i++) {
                    const seed = i * 4.37;
                    const fx = i * flagSpan - flagScroll + 130;
                    const fy = this.groundY - 154 + this.noiseSigned(seed + 1.4) * 8;
                    const flagH = 62 + this.noise1D(seed + 2.1) * 34;
                    const wave = Math.sin(this.stageTime * 0.004 + seed) * 9;
                    ctx.strokeStyle = 'rgba(44, 50, 66, 0.9)';
                    ctx.lineWidth = 2.3;
                    ctx.beginPath();
                    ctx.moveTo(fx, this.groundY - 72);
                    ctx.lineTo(fx, fy - flagH);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(208, 218, 242, 0.42)';
                    ctx.beginPath();
                    ctx.moveTo(fx, fy - flagH + 8);
                    ctx.lineTo(fx + 28 + wave * 0.42, fy - flagH + 16);
                    ctx.lineTo(fx + 22 + wave * 0.4, fy - flagH + 42);
                    ctx.lineTo(fx, fy - flagH + 36);
                    ctx.closePath();
                    ctx.fill();
                }
                break;
            }
        }
    }
    
    renderGround(ctx) {
        const renderProgress = this.progress;
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        // グローバルな進行度に基づく環境光の強さ（暗さ）を計算し、地面の色に反映
        const globalProgress = (this.stageNumber - 1 + p) / STAGES.length;
        const darken = Math.pow(globalProgress, 1.5) * 0.75;
        
        // 各ステージ独自の地面描画メソッドを呼び出し、路面・断面・パースを完結させる
        switch (this.stageNumber) {
            case 1:
                this.renderGroundBamboo(ctx, renderProgress, darken);
                break;
            case 2:
                this.renderGroundKaido(ctx, renderProgress, darken);
                break;
            case 3:
                this.renderGroundMountain(ctx, renderProgress, darken);
                break;
            case 4:
                this.renderGroundTown(ctx, renderProgress, darken);
                break;
            case 5:
                this.renderGroundCastle(ctx, renderProgress, darken);
                break;
            case 6:
                this.renderGroundTenshu(ctx, renderProgress, darken);
                break;
            default:
                this.renderGroundMountain(ctx, renderProgress, darken);
                break;
        }

        // 竹林の動的な葉の降下エフェクト（地面描画の後に重ねる）
        if (this.stageNumber === 1) {
            this.renderBambooFallingLeaves(ctx);
        }
    }

    renderGroundManualSafeBand(ctx, topColor, bottomColor, darken) {
        const bandTop = CANVAS_HEIGHT - 46;
        const bandBottom = CANVAS_HEIGHT - 8;
        if (bandBottom <= bandTop) return;

        const toRgba = (rgb, alpha) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha.toFixed(3)})`);
        const bandTopColor = this.interpolateColor(topColor, bottomColor, 0.48);
        const bandMidColor = this.interpolateColor(topColor, bottomColor, 0.62);
        const bandBottomColor = this.interpolateColor(topColor, bottomColor, 0.78 + darken * 0.1);

        const settleGrad = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
        settleGrad.addColorStop(0, toRgba(bandTopColor, 0));
        settleGrad.addColorStop(0.35, toRgba(bandMidColor, 0.78));
        settleGrad.addColorStop(1, toRgba(bandBottomColor, 0.92));
        ctx.fillStyle = settleGrad;
        ctx.fillRect(0, bandTop, CANVAS_WIDTH, bandBottom - bandTop);

        ctx.strokeStyle = toRgba(this.interpolateColor(bandTopColor, '#f2eadf', 0.28), 0.14);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, bandTop + 0.5);
        ctx.lineTo(CANVAS_WIDTH, bandTop + 0.5);
        ctx.stroke();
    }

    renderGroundBamboo(ctx, renderProgress, darken) {
        const horizonY = this.groundY; // 地平線（奥）。林床はここから手前へ広がる
        const bottomY = CANVAS_HEIGHT;
        const span = bottomY - horizonY;

        // 踏み分け道の中心線（奥は画面中央やや左に収束、手前へ向け緩やかにうねる）
        // depth=0(奥)〜1(手前)。連続式なのでフラッシングしない。
        const pathScrollPhase = renderProgress * 0.0016;
        const pathCenterAt = (depth) => {
            const conv = CANVAS_WIDTH * (0.46 + this.noiseSigned(0) * 0.0); // 奥の収束点
            // 手前へ向かうほど中心を少し右へ流し、緩やかなうねりを sin で重ねる
            const drift = (depth - 0.0) * CANVAS_WIDTH * 0.06;
            const sway = Math.sin(depth * 2.1 + pathScrollPhase) * CANVAS_WIDTH * 0.05 * depth;
            return conv + drift + sway;
        };
        // 道幅（奥は細く手前は広い台形）
        const pathHalfWidthAt = (depth) => CANVAS_WIDTH * (0.018 + depth * depth * 0.16);

        // 1. 路面グラデ（湿った苔と土。現状ベースを維持しつつ darken 反映）
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#354026', '#141a0e', darken * 0.65));
        roadGrad.addColorStop(0.6, this.interpolateColor('#445232', '#1a2212', darken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#303a22', '#10150a', darken * 0.65));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, span);

        ctx.save();

        // 2. 踏み分け道（土が見える小道）— 奥から手前へ台形状の帯。
        //    やや明るい土色を縦グラデで敷き、縁は苔へ馴染ませる。
        const pathStepN = 26;
        const pathDirt = this.interpolateColor('#5a4a30', '#221a0e', darken * 0.6);
        const pathDirtLo = this.interpolateColor('#463821', '#181206', darken * 0.6);
        for (let s = 0; s < pathStepN; s++) {
            const d0 = s / pathStepN;
            const d1 = (s + 1) / pathStepN;
            const y0 = horizonY + d0 * span;
            const y1 = horizonY + d1 * span;
            const cx0 = pathCenterAt(d0);
            const cx1 = pathCenterAt(d1);
            const hw0 = pathHalfWidthAt(d0);
            const hw1 = pathHalfWidthAt(d1);
            // 道の土は手前ほど露出が強い
            const tDirt = this.interpolateColor(pathDirtLo, pathDirt, d0);
            const alpha = 0.18 + d0 * 0.30;
            ctx.fillStyle = tDirt.replace('rgb(', 'rgba(').replace(')', `, ${alpha.toFixed(3)})`);
            ctx.beginPath();
            ctx.moveTo(cx0 - hw0, y0);
            ctx.lineTo(cx0 + hw0, y0);
            ctx.lineTo(cx1 + hw1, y1);
            ctx.lineTo(cx1 - hw1, y1);
            ctx.closePath();
            ctx.fill();
        }
        // 道の中央に踏み締められた明るい筋（手前ほど明瞭）
        const pathHi = this.interpolateColor('#6f5b3a', '#2a2010', darken * 0.55);
        for (let s = 0; s < pathStepN; s++) {
            const d0 = s / pathStepN;
            const d1 = (s + 1) / pathStepN;
            const y0 = horizonY + d0 * span;
            const y1 = horizonY + d1 * span;
            const cx0 = pathCenterAt(d0);
            const cx1 = pathCenterAt(d1);
            const hw0 = pathHalfWidthAt(d0) * 0.5;
            const hw1 = pathHalfWidthAt(d1) * 0.5;
            const alpha = (0.05 + d0 * 0.12);
            ctx.fillStyle = pathHi.replace('rgb(', 'rgba(').replace(')', `, ${alpha.toFixed(3)})`);
            ctx.beginPath();
            ctx.moveTo(cx0 - hw0, y0);
            ctx.lineTo(cx0 + hw0, y0);
            ctx.lineTo(cx1 + hw1, y1);
            ctx.lineTo(cx1 - hw1, y1);
            ctx.closePath();
            ctx.fill();
        }

        // 3. 苔パッチ / 剥き出しの土パッチ（kaido手法・連続スクロールでフラッシング無し）
        //    道の上では土色寄り、脇では苔(緑)寄りに振り分けムラを出す。
        const mossGreen = this.interpolateColor('#4c5e2e', '#1c2410', darken * 0.6);
        const mossDark = this.interpolateColor('#37491f', '#141b0a', darken * 0.6);
        const dirtBrown = this.interpolateColor('#6a5536', '#241b0d', darken * 0.6);
        const patchScroll = renderProgress * 0.9;
        const patchSpan = 200;
        for (let j = 0; j < 7; j++) {
            const depth = (j + 0.5) / 7;
            const py = horizonY + depth * span;
            const rowScroll = patchScroll * (0.85 + depth * 0.25);
            const pStart = Math.floor((rowScroll - patchSpan) / patchSpan);
            const pEnd = Math.ceil((rowScroll + CANVAS_WIDTH + patchSpan) / patchSpan);
            const cx = pathCenterAt(depth);
            const hw = pathHalfWidthAt(depth);
            for (let i = pStart; i <= pEnd; i++) {
                const seed = i * 7.3 + j * 3.1;
                const px = i * patchSpan - rowScroll + this.noiseSigned(seed) * 78;
                if (px < -patchSpan || px > CANVAS_WIDTH + patchSpan) continue;
                const pw = (54 + this.noise1D(seed + 1) * 104) * (0.55 + depth);
                const ph = (7 + this.noise1D(seed + 2) * 9) * (0.55 + depth);
                const onPath = Math.abs(px - cx) < hw * 1.1;
                const r = this.noise1D(seed + 3);
                let col;
                if (onPath) {
                    // 道の上は土ムラ中心。たまに苔の取り残し。
                    col = r > 0.78
                        ? mossDark.replace('rgb(', 'rgba(').replace(')', `, ${(0.05 + depth * 0.06).toFixed(3)})`)
                        : dirtBrown.replace('rgb(', 'rgba(').replace(')', `, ${(0.05 + depth * 0.07).toFixed(3)})`);
                } else {
                    // 林床の脇は苔のパッチと剥き出しの土が混在
                    if (r > 0.62) {
                        col = dirtBrown.replace('rgb(', 'rgba(').replace(')', `, ${(0.05 + depth * 0.06).toFixed(3)})`);
                    } else {
                        col = (r > 0.32 ? mossGreen : mossDark)
                            .replace('rgb(', 'rgba(').replace(')', `, ${(0.06 + depth * 0.08).toFixed(3)})`);
                    }
                }
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.ellipse(px, py, pw, ph, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 4. 落ち枝（短い線分。手前ほど大・濃い。連続スクロール）
        const twigScroll = renderProgress * 0.96;
        const twigSpan = 230;
        const twigCol = this.interpolateColor('#52442c', '#1f180c', darken * 0.6);
        for (let j = 0; j < 6; j++) {
            const depth = (j + 1) / 6;
            const ty = horizonY + depth * depth * span;
            const rowScroll = twigScroll * (0.8 + depth * 0.3);
            const tStart = Math.floor((rowScroll - twigSpan) / twigSpan);
            const tEnd = Math.ceil((rowScroll + CANVAS_WIDTH + twigSpan) / twigSpan);
            for (let i = tStart; i <= tEnd; i++) {
                const seed = i * 9.7 + j * 4.3;
                if (this.noise1D(seed + 6) < 0.6) continue;
                const tx = i * twigSpan - rowScroll + this.noiseSigned(seed) * 90;
                if (tx < -60 || tx > CANVAS_WIDTH + 60) continue;
                const len = (10 + this.noise1D(seed + 1) * 22) * (0.5 + depth);
                const ang = this.noiseSigned(seed + 2) * 1.2;
                const dx = Math.cos(ang) * len * 0.5;
                const dy = Math.sin(ang) * len * 0.5 * 0.4;
                ctx.strokeStyle = twigCol.replace('rgb(', 'rgba(').replace(')', `, ${(0.2 + depth * 0.25).toFixed(3)})`);
                ctx.lineWidth = (0.8 + depth * 1.6);
                ctx.beginPath();
                ctx.moveTo(tx - dx, ty - dy);
                ctx.lineTo(tx + dx, ty + dy);
                ctx.stroke();
            }
        }

        // 5. 小石・苔むした石（手前ほど大。石は sy=horizon+depth*depth で手前集中）
        const stoneScroll = renderProgress * 1.0;
        const stoneSpan = 160;
        for (let j = 0; j < 6; j++) {
            const depth = (j + 1) / 6;
            const sy = horizonY + depth * depth * span;
            const rowScroll = stoneScroll * (0.8 + depth * 0.35);
            const sStart = Math.floor((rowScroll - stoneSpan) / stoneSpan);
            const sEnd = Math.ceil((rowScroll + CANVAS_WIDTH + stoneSpan) / stoneSpan);
            for (let i = sStart; i <= sEnd; i++) {
                const seed = i * 12.4 + j * 5.6;
                if (this.noise1D(seed + 4) < 0.58) continue;
                const sx = i * stoneSpan - rowScroll + this.noiseSigned(seed) * 64;
                if (sx < -40 || sx > CANVAS_WIDTH + 40) continue;
                const sw = (3 + this.noise1D(seed + 1) * 6) * (0.5 + depth);
                const mossy = this.noise1D(seed + 7) > 0.5; // 苔むした石
                // 石本体（土色）と上面ハイライト
                ctx.fillStyle = `rgba(${Math.round(78 * (1 - darken * 0.55))},${Math.round(66 * (1 - darken * 0.55))},${Math.round(48 * (1 - darken * 0.55))},${(0.26 + depth * 0.2).toFixed(3)})`;
                ctx.beginPath();
                ctx.ellipse(sx, sy, sw, sw * 0.62, 0, 0, Math.PI * 2);
                ctx.fill();
                if (mossy) {
                    // 苔むした石：上側に緑の被り
                    ctx.fillStyle = mossGreen.replace('rgb(', 'rgba(').replace(')', `, ${(0.22 + depth * 0.18).toFixed(3)})`);
                    ctx.beginPath();
                    ctx.ellipse(sx - sw * 0.15, sy - sw * 0.2, sw * 0.7, sw * 0.4, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // 乾いた小石：明るいハイライト
                    ctx.fillStyle = `rgba(${Math.round(196 * (1 - darken * 0.5))},${Math.round(182 * (1 - darken * 0.5))},${Math.round(150 * (1 - darken * 0.5))},${(0.16 + depth * 0.14).toFixed(3)})`;
                    ctx.beginPath();
                    ctx.ellipse(sx - sw * 0.2, sy - sw * 0.22, sw * 0.5, sw * 0.3, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();

        // 6. 落ち葉（既存レイヤーを温存。最後に重ねる。連続式 i*spacing-scroll）
        const spacing = 64; // 間隔を広げて負荷軽減
        const scroll = renderProgress * 1.02;
        const start = Math.floor((scroll - 100) / spacing);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 100) / spacing);

        ctx.save();
        for (let i = start; i <= end; i++) {
            const seed = i * 7.41;
            // 1セクションあたりの枚数を抑える
            const leafCount = 9 + Math.floor(this.noise1D(seed + 3.7) * 10);
            for (let l = 0; l < leafCount; l++) {
                const ls = seed + l * 2.37;

                // 密度勾配: 乱数の累乗などで奥（0）に偏らせる
                // noise1D を 1.6 乗することで奥(yが小さい方)に密度を集中させる
                const leafDepth = Math.pow(this.noise1D(ls + 9.2), 1.6);
                const lx = i * spacing - scroll + this.noiseSigned(ls + 1.1) * 40;

                if (lx < -40 || lx > CANVAS_WIDTH + 40) continue;

                const ly = horizonY + leafDepth * (bottomY - horizonY);
                const len = 6 + leafDepth * 9; // サイズ範囲を落下葉(6-15)に揃える
                const rot = this.noise1D(ls + 8.1) * Math.PI * 2;

                // 奥ほど密度高く不透明、手前ほど薄くまばら（darken は夜間補正）
                const alpha = (0.22 + (1 - leafDepth) * 0.42) * (1.0 - darken * 0.5);

                if (alpha > 0.05) {
                    const stableId = Math.abs(Math.floor(ls * 1000)) % 0xFFFF;
                    this.drawBambooLeaf(ctx, lx, ly, len, rot, '', alpha, stableId, leafDepth);
                }
            }
        }
        ctx.restore();

        // 7. 地平線との接地に薄い影ライン
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.2 + darken * 0.12).toFixed(3)})`;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, 4);
    }

    renderGroundKaido(ctx, renderProgress, darken) {
        const horizonY = this.groundY; // 地面の上端＝地平線（他ステージ共通。奥行きを持たせる）
        const bottomY = CANVAS_HEIGHT;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#9a826a', '#3d2d1d', darken * 0.6));
        roadGrad.addColorStop(0.5, this.interpolateColor('#c6ad8f', '#5e4832', darken * 0.45));
        roadGrad.addColorStop(1, this.interpolateColor('#7d6b58', '#2a1f14', darken * 0.8));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        ctx.save();
        // 土の濃淡パッチ（worldIndexで連続スクロール＝seedが切り替わらずフラッシングしない）
        const patchScroll = renderProgress * 0.92;
        const patchSpan = 210;
        for (let j = 0; j < 7; j++) {
            const depth = (j + 0.5) / 7;
            const py = horizonY + depth * (bottomY - horizonY);
            const rowScroll = patchScroll * (0.85 + depth * 0.25);
            const pStart = Math.floor((rowScroll - patchSpan) / patchSpan);
            const pEnd = Math.ceil((rowScroll + CANVAS_WIDTH + patchSpan) / patchSpan);
            for (let i = pStart; i <= pEnd; i++) {
                const seed = i * 7.3 + j * 3.1;
                const px = i * patchSpan - rowScroll + this.noiseSigned(seed) * 80;
                const pw = (60 + this.noise1D(seed + 1) * 110) * (0.6 + depth);
                const ph = (8 + this.noise1D(seed + 2) * 10) * (0.6 + depth);
                ctx.fillStyle = this.noise1D(seed + 3) > 0.5
                    ? `rgba(60,44,28,${0.05 + depth * 0.06})`
                    : `rgba(214,196,162,${0.04 + depth * 0.05})`;
                ctx.beginPath();
                ctx.ellipse(px, py, pw, ph, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // わだち（荷車の轍）：道に沿って横に走る2本の浅い溝。刻みはスクロールで横に流れる
        const rutDepths = [0.34, 0.52];
        for (const depth of rutDepths) {
            const ry = horizonY + depth * (bottomY - horizonY);
            const scaleD = 0.6 + depth;
            ctx.strokeStyle = 'rgba(70,52,34,0.14)';
            ctx.lineWidth = 4 * scaleD;
            ctx.beginPath();
            ctx.moveTo(0, ry);
            ctx.lineTo(CANVAS_WIDTH, ry);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(226,208,172,0.09)';
            ctx.lineWidth = 1.6 * scaleD;
            ctx.beginPath();
            ctx.moveTo(0, ry + 3 * scaleD);
            ctx.lineTo(CANVAS_WIDTH, ry + 3 * scaleD);
            ctx.stroke();
            // 轍の刻み（横へ流れる短いダッシュ）
            ctx.fillStyle = 'rgba(60,44,28,0.16)';
            const dashGap = 64 * scaleD;
            const flow = ((renderProgress * (0.9 + depth * 0.3)) % dashGap + dashGap) % dashGap;
            for (let x = -flow; x < CANVAS_WIDTH; x += dashGap) {
                ctx.fillRect(x, ry - scaleD, 28 * scaleD, 2 * scaleD);
            }
        }

        // 飛び石・小石（手前ほど大きく。worldIndexで連続スクロール）
        const stoneScroll = renderProgress * 1.0;
        const stoneSpan = 150;
        for (let j = 0; j < 6; j++) {
            const depth = (j + 1) / 6;
            const sy = horizonY + depth * depth * (bottomY - horizonY);
            const rowScroll = stoneScroll * (0.8 + depth * 0.35);
            const sStart = Math.floor((rowScroll - stoneSpan) / stoneSpan);
            const sEnd = Math.ceil((rowScroll + CANVAS_WIDTH + stoneSpan) / stoneSpan);
            for (let i = sStart; i <= sEnd; i++) {
                const seed = i * 12.4 + j * 5.6;
                if (this.noise1D(seed + 4) < 0.55) continue;
                const sx = i * stoneSpan - rowScroll + this.noiseSigned(seed) * 60;
                const sw = (3 + this.noise1D(seed + 1) * 6) * (0.5 + depth);
                ctx.fillStyle = `rgba(86,70,52,${0.28 + depth * 0.2})`;
                ctx.beginPath();
                ctx.ellipse(sx, sy, sw, sw * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(212,196,162,${0.18 + depth * 0.15})`;
                ctx.beginPath();
                ctx.ellipse(sx - sw * 0.2, sy - sw * 0.22, sw * 0.5, sw * 0.32, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();

        ctx.fillStyle = `rgba(0, 0, 0, ${0.18 + darken * 0.1})`;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, 3);
    }

    renderGroundMountain(ctx, renderProgress, darken) {
        const horizonY = this.groundY; // 地面の上端＝地平線（奥行きの起点）
        const bottomY = CANVAS_HEIGHT;
        const groundH = bottomY - horizonY;

        // 1) 路面グラデ：逢魔が時。奥(遠/明)は低い夕日を拾う暖アンバー褐色、中は陰り、手前(近)は冷たく沈む
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#8a6e52', '#2c2118', darken * 0.6));
        roadGrad.addColorStop(0.5, this.interpolateColor('#6f5945', '#241b13', darken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#33291f', '#0f0b07', darken * 0.85));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundH);

        ctx.save();

        // 角ばった岩を描くヘルパー：楕円の重ねでなく多角形シルエット＋マットなファセット（陽/陰の面）で立体を出す。
        // 光沢楕円をやめることで「水滴・流動体」っぽさを消す。光源は右上の夕日。
        const drawRock = (rx, ry, rw, rh, seed, depth) => {
            const n = 6 + Math.floor(this.noise1D(seed + 0.5) * 3); // 6〜8頂点
            const ang0 = this.noiseSigned(seed + 0.9) * 0.6;
            const vx = [], vy = [];
            for (let k = 0; k < n; k++) {
                const a = ang0 + (k / n) * Math.PI * 2;
                const rr = 0.68 + this.noise1D(seed + k * 2.3 + 1.1) * 0.54; // 半径をばらつかせ角張らせる
                vx.push(rx + Math.cos(a) * rw * rr);
                vy.push(ry + Math.sin(a) * rh * rr);
            }
            const tracePoly = () => {
                ctx.beginPath();
                ctx.moveTo(vx[0], vy[0]);
                for (let k = 1; k < n; k++) ctx.lineTo(vx[k], vy[k]);
                ctx.closePath();
            };
            // 接地影
            ctx.fillStyle = `rgba(0,0,0,${0.2 + depth * 0.12})`;
            ctx.beginPath();
            ctx.ellipse(rx + rw * 0.16, ry + rh * 0.52, rw, rh * 0.32, 0, 0, Math.PI * 2);
            ctx.fill();
            // 本体（中間色）
            tracePoly();
            ctx.fillStyle = this.interpolateColor('#5e584f', '#1b1916', darken * 0.6 + depth * 0.12);
            ctx.fill();
            // 本体内に限定してマットな面を塗る（上＝陽 / 下＝陰、境界は右上から光が来る向きに傾ける）
            ctx.save();
            tracePoly();
            ctx.clip();
            ctx.fillStyle = this.interpolateColor('#37332d', '#0c0b09', darken * 0.66 + depth * 0.12); // 陰の面（下・左寄り）
            ctx.beginPath();
            ctx.moveTo(rx - rw * 1.6, ry - rh * 0.06);
            ctx.lineTo(rx + rw * 1.6, ry + rh * 0.12);
            ctx.lineTo(rx + rw * 1.6, ry + rh * 1.8);
            ctx.lineTo(rx - rw * 1.6, ry + rh * 1.8);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = this.interpolateColor('#837b6d', '#2c2925', darken * 0.5 + depth * 0.1); // 陽の面（上・右寄り）マット
            ctx.beginPath();
            ctx.moveTo(rx - rw * 1.6, ry - rh * 0.5);
            ctx.lineTo(rx + rw * 1.6, ry - rh * 0.28);
            ctx.lineTo(rx + rw * 1.6, ry - rh * 1.8);
            ctx.lineTo(rx - rw * 1.6, ry - rh * 1.8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // 角を締める輪郭線（暗）
            tracePoly();
            ctx.strokeStyle = `rgba(18,12,8,${0.45 + depth * 0.12})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            // 上側の稜線にだけ細い夕日リム（光沢でなく辺のなぞり）
            ctx.strokeStyle = `rgba(255,198,132,${(0.16 + depth * 0.08) * (1 - darken * 0.55)})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            let started = false;
            for (let k = 0; k <= n; k++) {
                const kk = k % n;
                if (vy[kk] < ry - rh * 0.12) {
                    if (!started) { ctx.moveTo(vx[kk], vy[kk]); started = true; }
                    else ctx.lineTo(vx[kk], vy[kk]);
                } else { started = false; }
            }
            ctx.stroke();
        };

        // 1b) 地平線近くに低い夕日の照り返し（地面が暖色を拾う帯）
        const glowH = groundH * 0.28;
        const sunGlow = ctx.createLinearGradient(0, horizonY, 0, horizonY + glowH);
        sunGlow.addColorStop(0, `rgba(255,176,104,${(0.20) * (1 - darken * 0.7)})`);
        sunGlow.addColorStop(1, 'rgba(255,176,104,0)');
        ctx.fillStyle = sunGlow;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, glowH);

        // 2) 乾いたひび割れ（不規則に蛇行・分岐する亀裂の網目。斑点でなく線で乾いた大地を表現。連続スクロールでフラッシングしない）
        const crackScroll = renderProgress * 0.95;
        const crackRows = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let j = 1; j <= crackRows; j++) {
            const depth = j / (crackRows + 0.5);
            const ry = horizonY + depth * depth * groundH;          // 手前ほど行間を広げる（パース）
            const nextDepth = (j + 1) / (crackRows + 0.5);
            const rowGap = (horizonY + nextDepth * nextDepth * groundH) - ry;
            const cellW = 70 * (0.4 + depth * 1.3);                 // 手前ほどセル大
            const rowScroll = crackScroll * (0.82 + depth * 0.4);   // 手前ほど速くスクロール
            const iStart = Math.floor((rowScroll - cellW) / cellW);
            const iEnd = Math.ceil((rowScroll + CANVAS_WIDTH + cellW) / cellW);
            const lineW = 0.6 + depth * 1.1;
            const alpha = (0.10 + depth * 0.13) * (1 - darken * 0.4);
            const nodeX = (ii) => ii * cellW - rowScroll + this.noiseSigned(ii * 3.1 + j * 7.7) * cellW * 0.34;
            const nodeY = (ii) => ry + this.noiseSigned(ii * 4.3 + j * 5.1) * (groundH * 0.03 + depth * 8);
            for (let i = iStart; i <= iEnd; i++) {
                const x0 = nodeX(i), y0 = nodeY(i);
                const x1 = nodeX(i + 1), y1 = nodeY(i + 1);
                if (x1 < -40 || x0 > CANVAS_WIDTH + 40) continue;
                // 横の亀裂（蛇行する曲線。たまに途切れて自然に）
                if (this.noise1D(i * 2.7 + j * 9.3) > 0.26) {
                    const mx = (x0 + x1) / 2 + this.noiseSigned(i * 6.1 + j * 2.2) * cellW * 0.18;
                    const my = (y0 + y1) / 2 + this.noiseSigned(i * 8.4 + j * 1.7) * 9 * (0.5 + depth);
                    ctx.strokeStyle = `rgba(26,18,12,${alpha.toFixed(3)})`;
                    ctx.lineWidth = lineW;
                    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
                    // 亀裂の下側に薄い明るいリップ（凹んで見える）
                    ctx.strokeStyle = `rgba(210,180,130,${(alpha * 0.4 * (1 - darken * 0.6)).toFixed(3)})`;
                    ctx.lineWidth = lineW * 0.6;
                    ctx.beginPath(); ctx.moveTo(x0, y0 + lineW); ctx.quadraticCurveTo(mx, my + lineW, x1, y1 + lineW); ctx.stroke();
                }
                // 縦の亀裂（セルを区切る分岐。次の行へ向けてまばらに）
                if (this.noise1D(i * 5.5 + j * 3.9) > 0.66) {
                    const downY = y0 + rowGap * (0.55 + this.noise1D(i * 7.1 + j * 2.9) * 0.3);
                    const bx = x0 + this.noiseSigned(i * 1.9 + j * 4.4) * cellW * 0.28;
                    ctx.strokeStyle = `rgba(26,18,12,${(alpha * 0.9).toFixed(3)})`;
                    ctx.lineWidth = lineW * 0.85;
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    ctx.quadraticCurveTo(bx, (y0 + downY) / 2, x0 + this.noiseSigned(i * 2.1 + j) * cellW * 0.2, downY);
                    ctx.stroke();
                }
            }
        }
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        // 4) 地面に半ば埋もれた岩（中〜大）：depth行でまばらに。上側に夕日リムライト、下側に陰
        const rockScroll = renderProgress * 0.96;
        const rockSpan = 280;
        for (let j = 0; j < 6; j++) {
            const depth = (j + 0.7) / 6;
            const ry = horizonY + depth * depth * groundH;
            const rowScroll = rockScroll * (0.8 + depth * 0.35);
            const rStart = Math.floor((rowScroll - rockSpan) / rockSpan);
            const rEnd = Math.ceil((rowScroll + CANVAS_WIDTH + rockSpan) / rockSpan);
            for (let i = rStart; i <= rEnd; i++) {
                const seed = i * 9.1 + j * 4.7;
                if (this.noise1D(seed + 6) < 0.7) continue; // まばらに
                const rx = i * rockSpan - rowScroll + this.noiseSigned(seed) * 100;
                const rw = (7 + this.noise1D(seed + 1) * 14) * (0.4 + depth * 1.0);
                const rh = rw * (0.62 + this.noise1D(seed + 2) * 0.18);
                drawRock(rx, ry, rw, rh, seed, depth);
            }
        }

        // 5) 砂利／小石（小さな灰色の石。光沢ハイライト＝水滴感をやめてマットに。岩と同系のグレー）
        const stoneScroll = renderProgress * 1.04;
        const stoneSpan = 130;
        for (let j = 0; j < 7; j++) {
            const depth = (j + 1) / 7;
            const sy = horizonY + depth * depth * groundH;
            const rowScroll = stoneScroll * (0.82 + depth * 0.35);
            const sStart = Math.floor((rowScroll - stoneSpan) / stoneSpan);
            const sEnd = Math.ceil((rowScroll + CANVAS_WIDTH + stoneSpan) / stoneSpan);
            for (let i = sStart; i <= sEnd; i++) {
                const seed = i * 13.3 + j * 5.9;
                if (this.noise1D(seed + 4) < 0.45) continue;
                const sx = i * stoneSpan - rowScroll + this.noiseSigned(seed) * 56;
                const sw = (2 + this.noise1D(seed + 1) * 4.5) * (0.5 + depth * 1.0);
                ctx.fillStyle = `rgba(20,17,13,${0.16 + depth * 0.12})`;
                ctx.beginPath();
                ctx.ellipse(sx + sw * 0.1, sy + sw * 0.28, sw * 1.05, sw * 0.42, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = this.interpolateColor('#615b52', '#242019', darken * 0.6 + depth * 0.16);
                ctx.beginPath();
                ctx.ellipse(sx, sy, sw, sw * 0.72, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 6) 手前のやや大きめの転石（暖色リム＋陰）。連続スクロール
        const bouldScroll = renderProgress * 1.06;
        const bouldSpan = 520;
        const bouldY = horizonY + 0.86 * groundH;
        const bStart = Math.floor((bouldScroll - bouldSpan) / bouldSpan);
        const bEnd = Math.ceil((bouldScroll + CANVAS_WIDTH + bouldSpan) / bouldSpan);
        for (let i = bStart; i <= bEnd; i++) {
            const seed = i * 17.9 + 2.5;
            if (this.noise1D(seed + 7) < 0.62) continue;
            const bx = i * bouldSpan - bouldScroll + this.noiseSigned(seed) * 160;
            const by = bouldY + this.noiseSigned(seed + 8) * groundH * 0.08;
            const bw = 12 + this.noise1D(seed + 1) * 16;
            const bh = bw * (0.62 + this.noise1D(seed + 2) * 0.16);
            drawRock(bx, by, bw, bh, seed, 1.0);
        }

        ctx.restore();

        // 地平線の硬い境界線は出さず、夕焼けの照り返しと地面グラデーションでなじませる。
    }

    renderGroundTown(ctx, renderProgress, darken) {
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#7a7a7a', '#222222', darken * 0.6));
        roadGrad.addColorStop(0.6, this.interpolateColor('#9e9e9e', '#444444', darken * 0.45));
        roadGrad.addColorStop(1, this.interpolateColor('#555555', '#111111', darken * 0.8));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        const tileSize = 64;
        const scroll = renderProgress * 1.1;
        const tileStart = Math.floor((scroll - 128) / tileSize);
        const tileEnd = Math.ceil((scroll + CANVAS_WIDTH + 128) / tileSize);
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.1 + darken * 0.1})`;
        ctx.lineWidth = 1.2;
        for (let i = tileStart; i <= tileEnd; i++) {
            const tx = i * tileSize - scroll;
            // 垂直ラインのパース（手前に広がる）
            const topX = tx;
            const bottomX = tx - 40;
            ctx.beginPath(); ctx.moveTo(topX, horizonY); ctx.lineTo(bottomX, bottomY); ctx.stroke();
        }
        // 水平ライン（手前ほど間隔を広げる）
        for (let j = 0; j < 5; j++) {
            const hDepth = Math.pow(j / 5, 1.5);
            const hy = horizonY + hDepth * (bottomY - horizonY);
            ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(CANVAS_WIDTH, hy); ctx.stroke();
        }
    }

    renderGroundCastle(ctx, renderProgress, darken) {
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT + 600; // 垂直スクロール時に下が途切れないように拡張

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 600);
        roadGrad.addColorStop(0, this.interpolateColor('#c5b489', '#3a3324', darken * 0.7));
        roadGrad.addColorStop(0.5, this.interpolateColor('#dccd9a', '#544b36', darken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#a5966d', '#28231a', darken * 0.9));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        const tatamiWidth = 200;
        const scroll = renderProgress; // 完全に物理座標と同期させるためパララックスを廃止(1.0倍)
        const start = Math.floor((scroll - 250) / tatamiWidth);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 250) / tatamiWidth);
        ctx.strokeStyle = this.interpolateColor('#2d3a24', '#0a1005', darken * 0.82);
        ctx.lineWidth = 5;
        for (let i = start; i <= end; i++) {
            const tx = i * tatamiWidth - scroll;
            const bottomX = tx; // 斜めの3Dパースを排除し、完全な垂直線(2Dサイドビュー)にする
            ctx.beginPath(); ctx.moveTo(tx, horizonY); ctx.lineTo(bottomX, bottomY); ctx.stroke();
        }
        
        // 畳の目
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1;
        for (let j = 0; j < 36; j++) { // 行数をさらに増やす
            const hy = horizonY + (j / 12) * 600;
            ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(CANVAS_WIDTH, hy); ctx.stroke();
        }
    }

    renderGroundTenshu(ctx, renderProgress, darken) {
        ctx.save();
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;

        // 漆塗りの床（反射を強調 - 少し明るめに調整）
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#2a0d0a', '#0a0402', darken));
        roadGrad.addColorStop(0.35, this.interpolateColor('#4a1d18', '#1a0d0a', darken));
        roadGrad.addColorStop(1, this.interpolateColor('#200805', '#000000', darken * 1.2));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        // 装飾目地（金）
        const decoWidth = 140;
        const scroll = renderProgress * 1.05;
        const start = Math.floor((scroll - 200) / decoWidth);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 200) / decoWidth);
        for (let i = start; i <= end; i++) {
            const tx = i * decoWidth - scroll;
            const bottomX = tx - 80;
            const goldGrad = ctx.createLinearGradient(tx, horizonY, bottomX, bottomY);
            goldGrad.addColorStop(0, this.interpolateColor('#ffd700', '#4a3c00', darken * 0.7));
            goldGrad.addColorStop(1, this.interpolateColor('#b8860b', '#2a1a00', darken * 0.9));
            ctx.strokeStyle = goldGrad;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(tx, horizonY); ctx.lineTo(bottomX, bottomY); ctx.stroke();
        }

        // 漆の反射のような横ライン（視認性向上のため少し強める）
        ctx.globalAlpha = 0.3 - darken * 0.1;
        const shineGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        shineGrad.addColorStop(0, 'rgba(255, 230, 100, 0)');
        shineGrad.addColorStop(0.4, 'rgba(255, 230, 100, 0.25)');
        shineGrad.addColorStop(1, 'rgba(255, 230, 100, 0)');
        ctx.fillStyle = shineGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        // ボス戦時のヴィネット効果→render()に一本化済みなのでここでは呼ばない
        ctx.restore();
    }

    renderBossVignette(ctx, blend) {
        if (blend <= 0) return;
        
        ctx.save();
        const gradient = ctx.createRadialGradient(
            CANVAS_WIDTH / 2, this.groundY / 2, CANVAS_WIDTH * 0.3,
            CANVAS_WIDTH / 2, this.groundY / 2, CANVAS_WIDTH * 0.7
        );
        
        let color;
        switch(this.stageNumber) {
            case 1: color = '14, 46, 22'; break;  // 竹林: 深緑
            case 2: color = '56, 42, 28'; break;  // 街道: 土埃の茶色
            case 3: color = '100, 60, 160'; break; // 山道: 霊的な紫
            case 4: color = '74, 18, 12'; break;  // 城下町: 火の赤
            case 5: color = '48, 12, 12'; break;  // 城内: 漆黒の赤
            case 6: color = '96, 64, 24'; break;  // 天守: 黄金色
            default: color = '0, 0, 0';
        }
        
        const alpha = 0.35 * blend;
        gradient.addColorStop(0, `rgba(${color}, 0)`);
        gradient.addColorStop(1, `rgba(${color}, ${alpha})`);
        
        ctx.fillStyle = gradient;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

        // 集中線の演出（さらに緊張感を出す）
        if (this.cachedAssets.speedLines) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.1 * blend;
            // キャッシュされた集中線を描画
            ctx.drawImage(this.cachedAssets.speedLines, 0, 0);
            ctx.restore();
        }

        ctx.restore();
    }

    renderHeatHaze(ctx, time, blend) {
        if (blend <= 0) return;
        const amp = 1.5 * blend;
        const speed = 0.004;
        ctx.save();
        const offset = Math.sin(time * speed) * amp;
        ctx.translate(0, offset);
        // 陽炎の揺らぎを地面付近に描画
        const hz = ctx.createLinearGradient(0, this.groundY - 60, 0, this.groundY + 10);
        hz.addColorStop(0, 'rgba(220, 200, 160, 0)');
        hz.addColorStop(0.5, `rgba(220, 200, 160, ${0.06 * blend})`);
        hz.addColorStop(1, 'rgba(220, 200, 160, 0)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, this.groundY - 60, CANVAS_WIDTH, 70);
        ctx.restore();
    }

    renderBossParticles(ctx, time, blend) {
        if (blend <= 0) return;
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const pMod = time * 0.001;
        
        switch (this.stageNumber) {
            case 1: { // 竹林: 風に舞う竹の葉と斜めの「風の筋」
                ctx.globalCompositeOperation = 'source-over';
                // 太い風の筋
                for (let i = 0; i < 12; i++) {
                    const seed = i * 13.7;
                    const x = (seed * 100 + pMod * 1200) % (CANVAS_WIDTH + 600) - 300;
                    const y = (seed * 50 + pMod * 300) % CANVAS_HEIGHT;
                    const alpha = (0.06 + (seed % 7) * 0.012) * blend;
                    ctx.strokeStyle = `rgba(200, 240, 220, ${alpha})`;
                    ctx.lineWidth = 1.5 + (seed % 3) * 0.8;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + 280, y + 60);
                    ctx.stroke();
                }
                // 細かい風の粒子
                ctx.fillStyle = `rgba(230, 255, 240, ${0.45 * blend})`;
                for (let i = 0; i < 25; i++) {
                    const seed = i * 17.3;
                    const px = (seed * 200 + pMod * 1400) % (CANVAS_WIDTH + 200) - 100;
                    const py = (seed * 57 + pMod * 380) % CANVAS_HEIGHT;
                    ctx.fillRect(px, py, 2.5, 1);
                }
                break;
            }
            case 2: { // 街道: 陽炎(ヒートヘイズ)と舞い上がる土埃
                ctx.globalCompositeOperation = 'source-over';
                for (let i = 0; i < 30; i++) {
                    const seed = i * 9.1;
                    const x = (seed * 123 - pMod * 250 + CANVAS_WIDTH) % CANVAS_WIDTH;
                    const y = this.groundY - 2 - (seed * 15 + pMod * 40) % 80;
                    const alpha = 0.2 * blend * (0.6 + Math.sin(pMod * 3 + seed) * 0.4);
                    const r = 3 + (seed % 6);
                    ctx.fillStyle = `rgba(160, 140, 110, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }
            case 3: { // 山道: 沸き立つ霊霧と天使の梯子
                ctx.globalCompositeOperation = 'screen';
                // 天使の梯子（光の筋）
                const beamCount = 5;
                for (let i = 0; i < beamCount; i++) {
                    const bSeed = i * 2.3;
                    const bx = CANVAS_WIDTH * (0.15 + i * 0.18 + Math.sin(pMod * 0.4 + bSeed) * 0.04);
                    const bw = 80 + Math.sin(pMod * 1.2 + bSeed) * 30;
                    const alpha = 0.15 * blend * (0.7 + Math.sin(pMod * 1.8 + bSeed) * 0.3);
                    const grad = ctx.createLinearGradient(bx, 0, bx + 120, this.groundY);
                    grad.addColorStop(0, `rgba(230, 240, 255, ${alpha})`);
                    grad.addColorStop(1, `rgba(230, 240, 255, 0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.moveTo(bx, -80);
                    ctx.lineTo(bx + bw, -80);
                    ctx.lineTo(bx + bw + 200, this.groundY + 50);
                    ctx.lineTo(bx + 200, this.groundY + 50);
                    ctx.fill();
                }
                // 下から湧き上がる霊霧（より濃密に）
                for (let i = 0; i < 20; i++) {
                    const seed = i * 11.3;
                    const x = (seed * 145 + Math.sin(pMod * 0.7 + seed) * 60) % CANVAS_WIDTH;
                    const y = this.groundY + 20 - (pMod * 60 + seed * 30) % 200;
                    const r = 25 + seed % 40;
                    const alpha = 0.25 * blend * this.clamp01(1 - (this.groundY - y) / 200);
                    ctx.fillStyle = `rgba(240, 245, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }
            case 4: { // 城下町: 降り注ぐ火の粉と背景の火の照り返し
                // 背景の微かな赤火の照り返し
                const fireGlow = ctx.createRadialGradient(CANVAS_WIDTH * 0.5, this.groundY, 100, CANVAS_WIDTH * 0.5, this.groundY, 600);
                fireGlow.addColorStop(0, `rgba(255, 50, 0, ${0.15 * blend})`);
                fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = fireGlow;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                for (let i = 0; i < 50; i++) {
                    const seed = i * 17.3;
                    // 上昇しつつ横に流れる動き
                    const x = (seed * 87 - pMod * 180 + Math.sin(pMod * 2 + seed) * 30 + CANVAS_WIDTH * 1.5) % (CANVAS_WIDTH * 1.5) - CANVAS_WIDTH * 0.25;
                    const y = (seed * 143 - pMod * 80 + CANVAS_HEIGHT) % CANVAS_HEIGHT;
                    const r = 1.4 + (seed % 2.5);
                    const twinkle = 0.4 + Math.sin(pMod * 14 + seed) * 0.6;
                    ctx.fillStyle = `rgba(255, ${140 + seed % 100}, 40, ${blend * twinkle})`;
                    ctx.fillRect(x, y, r, r);
                    if (twinkle > 0.8) {
                        // 重いshadowBlurを避け、半透明の大きな矩形で発光を表現
                        ctx.fillStyle = `rgba(255, 68, 0, ${0.4 * blend * twinkle})`;
                        ctx.fillRect(x - r, y - r, r * 3, r * 3);
                    }
                }
                break;
            }
            case 5: { // 城内: 浮遊する塵と差し込む光
                ctx.globalCompositeOperation = 'screen';
                // 差し込む光
                const lightGrad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, this.groundY);
                lightGrad.addColorStop(0, `rgba(255, 230, 180, ${0.08 * blend})`);
                lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = lightGrad;
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

                for (let i = 0; i < 50; i++) {
                    const seed = i * 23.3;
                    const x = (seed * 131 + Math.sin(pMod * 0.4 + seed) * 50 + CANVAS_WIDTH) % CANVAS_WIDTH;
                    const y = (seed * 97 - pMod * 30 + CANVAS_HEIGHT) % CANVAS_HEIGHT;
                    const twinkle = 0.2 + Math.abs(Math.sin(pMod * 1.8 + seed)) * 0.8;
                    ctx.fillStyle = `rgba(240, 225, 190, ${twinkle * 0.55 * blend})`;
                    ctx.fillRect(x, y, 1.5, 1.5);
                }
                break;
            }
            case 6: { // 天守閣: 舞い散る桜吹雪と黄金の上昇光
                // 1. 舞い散る桜吹雪 (Sakura)
                ctx.globalCompositeOperation = 'source-over';
                for (let i = 0; i < 40; i++) {
                    const seed = i * 31.7;
                    const x = (seed * 87 - pMod * 120 + Math.sin(pMod * 1.2 + seed) * 100 + CANVAS_WIDTH * 1.5) % (CANVAS_WIDTH * 1.5) - CANVAS_WIDTH * 0.25;
                    const y = (seed * 143 + pMod * 60 + Math.cos(pMod * 0.8 + seed) * 40) % CANVAS_HEIGHT;
                    const rotation = pMod * 2 + seed;
                    const size = 6 + (seed % 6);
                    
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(rotation);
                    ctx.fillStyle = `rgba(255, ${180 + seed % 40}, ${200 + seed % 55}, ${0.8 * blend})`;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, size, size * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                // 2. 黄金の上昇光 (Divine Particles)
                ctx.globalCompositeOperation = 'screen';
                for (let i = 0; i < 35; i++) {
                    const seed = i * 19.3;
                    const x = (seed * 111 + Math.sin(pMod * 2 + seed) * 30 + CANVAS_WIDTH) % CANVAS_WIDTH;
                    const y = this.groundY + 20 - (pMod * 180 + seed * 50) % (this.groundY + 100);
                    const r = 1 + (seed % 2.5);
                    const alpha = blend * (0.3 + Math.sin(pMod * 4 + seed) * 0.7);
                    
                    ctx.fillStyle = `rgba(255, 230, 100, ${alpha})`;
                    ctx.fillRect(x, y, r, r * 8);
                    // 重いshadowBlurを避け、半透明の矩形で発光を表現
                    ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.4})`;
                    ctx.fillRect(x - r, y - r * 2, r * 3, r * 12);
                }
                break;
            }
        }
        ctx.restore();
    }

    renderSkyParticles(ctx, time, bossEncounterBlend = 0) {
        const p = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        let intensity = 0;

        if (this.stageNumber === 1) {
            // 夜明け前: 空が既に明るみ始めているので星は薄め (最大 0.30)
            // p=0.55 で完全消灯
            intensity = (1 - this.smoothstep(0.05, 0.55, p)) * 0.30;
        } else if (this.stageNumber === 3) {
            // 夕方ステージは基本星なし。ボス戦（日没スレスレ）でのみ極薄く
            intensity = this.bossSpawned ? this.smoothstep(0, 0.6, this.bossEncounterBlend) * 0.3 : 0;
        } else if (this.stageNumber === 4) {
            // 宵の口(p=0.1)からゆっくり出始め、深夜(p=0.8)で満天に
            intensity = this.smoothstep(0.08, 0.75, p) * 0.95;
        } else if (this.stageNumber === 6) {
            // 深夜(p=0)〜月没後(p=0.4)は満天 → 夜明け(p=0.88)で消えていく
            intensity = 1 - this.smoothstep(0.72, 0.96, p);
        }

        if (intensity <= 0) return;

        // ボス戦演出で太陽が昇り始めたら星をフェードアウト（Stage 6）
        let starAlphaMultiplier = 1;
        if (this.stageNumber === 6 && bossEncounterBlend > 0) {
            starAlphaMultiplier = 1 - this.clamp01(bossEncounterBlend * 1.2);
        }
        if (starAlphaMultiplier <= 0) return;

        for (const particle of this.skyParticles) {
            const x = particle.nx * CANVAS_WIDTH;
            const y = 20 + particle.ny * (this.groundY * 0.55);
            const twinkle = 0.5 + Math.sin(time * particle.speed + particle.phase) * 0.5;
            const alpha = Math.max(0.08, twinkle) * intensity * starAlphaMultiplier;

            // Stage 3 の夕暮れ星はやや薄い青白、他は白
            const starColor = this.stageNumber === 3
                ? `rgba(220, 225, 255, ${alpha})`
                : `rgba(255, 255, 230, ${alpha})`;
            ctx.fillStyle = starColor;
            ctx.beginPath();
            ctx.arc(x, y, 1.0 + particle.speed * 0.16, 0, Math.PI * 2);
            ctx.fill();

            if (twinkle > 0.55 && alpha > 0.2) {
                const glowRadius = 2.8 + twinkle * 4.2;
                const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
                glow.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.42})`);
                glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    renderCelestialBodies(ctx) {
        // ステージ番号に応じた表示設定
        // 1：5〜10時(明け方〜朝)
        // 2：11〜15時(昼)
        // 3：16〜17時(夕暮れ)
        // 4：18〜20時(夜)
        // 5：室内なので非表示
        // 6：開始時に月が画面中央(3倍)〜直前で日の出(3倍)、ボス戦中は太陽2/3
        
        if (this.stageNumber === 5) return;

        // stageNumberを数値として確実に扱う
        const sn = parseInt(this.stageNumber);
        // 進行度を 0.0 〜 1.0 に厳密にクランプ
        const progress = Math.max(0, Math.min(1, this.progress / this.maxProgress));
        const isTenshuStage = sn === 6;
        
        // 物理的な軌道パラメータ
        const orbitRadiusX = CANVAS_WIDTH * (isTenshuStage ? 0.35 : 0.42);
        const orbitRadiusY = this.groundY * (isTenshuStage ? 0.6 : 0.5);
        const orbitCenterX = CANVAS_WIDTH * 0.5;
        const orbitCenterY = this.groundY * 0.95;

        const getX = (theta) => orbitCenterX - Math.cos(theta) * orbitRadiusX;
        const getY = (theta) => orbitCenterY - Math.sin(theta) * orbitRadiusY;

        const drawBody = (cx, cy, r, alpha, coreTop, coreBottom, glowColor) => {
            if (alpha <= 0.001) return;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.globalAlpha = alpha;

            // グロー（本体外縁でピーク、外側にフェード）
            const glowR = r * (isTenshuStage ? 4.8 : 3.2);
            const peakStop = r / glowR; // 本体外縁がグロー最大輝度
            const midStop = Math.min(peakStop + (1 - peakStop) * 0.45, 0.98);
            const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
            glow.addColorStop(0, glowColor.replace('ALPHA', '0.15'));
            glow.addColorStop(peakStop, glowColor.replace('ALPHA', '0.75'));
            glow.addColorStop(midStop, glowColor.replace('ALPHA', '0.18'));
            glow.addColorStop(1, glowColor.replace('ALPHA', '0'));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, 0, glowR, 0, Math.PI * 2);
            ctx.fill();

            // 本体（真ん丸）
            const coreGrad = ctx.createLinearGradient(0, -r, 0, r);
            coreGrad.addColorStop(0, coreTop);
            coreGrad.addColorStop(1, coreBottom);
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        };

        // 24時間表記を角度(theta)に変換するヘルパー
        // 太陽用：6時(0/左) -> 12時(PI/2/上) -> 18時(PI/右)
        // 月用：18時(0/左) -> 24時(PI/2/上) -> 6時(PI/右)
        const hourToTheta = (hour, isSun) => {
            if (isSun) {
                return ((hour - 6) / 12) * Math.PI;
            } else {
                // 夜の18時を0、翌朝6時をPIとする
                let h = hour;
                if (h < 6) h += 24; // 0-6時を24-30時として扱う
                return ((h - 18) / 12) * Math.PI;
            }
        };

        if (sn <= 4) {
            let startHour, endHour, isSun = true;
            switch(sn) {
                case 1: startHour = 4.5; endHour = 10; break;
                case 2: startHour = 11; endHour = 14; break;
                case 3: startHour = 14.0; endHour = 17.8; break; // 明るい夕方開始〜日没スレスレ
                case 4: startHour = 18.3; endHour = 24; isSun = false; break; // 月の出〜真上(24時)
                default: startHour = 12; endHour = 12; break;
            }

            let currentHour;
            // ボス戦中は月/太陽を指定位置に固定
            if (this.bossSpawned && sn === 1) {
                currentHour = 10.0;
            } else if (this.bossSpawned && sn === 3) {
                currentHour = 17.8; // 日が地平線スレスレに固定
            } else if (this.bossSpawned && sn === 4) {
                currentHour = 24.0; // 月が真上（天頂）に固定
            } else if (sn === 1) {
                if (progress < 0.45) {
                    currentHour = 4.5 + (1.5 / 0.45) * progress;
                } else {
                    currentHour = 6.0 + (4.0 / 0.55) * (progress - 0.45);
                }
            } else {
                currentHour = startHour + (endHour - startHour) * progress;
            }
            
            // 異常な時間経過を防止
            currentHour = Math.max(startHour, Math.min(endHour, currentHour));

            const theta = hourToTheta(currentHour, isSun);
            
            if (isSun) {
                // 物理的に地平線(theta=0/6時)より上がってから描画
                if (currentHour < 6.0) return; 

                const bodyX = getX(theta);
                const bodyY = getY(theta);
                const sunAltitude = Math.sin(theta);
                
                // 太陽のカラー補間（高度に応じて昼の白から夕の赤へ）
                const sunRadius = 45 * (1 + (1 - sunAltitude) * 0.12);
                
                // 昼間の太陽
                const dayTop = '#ffffff';
                const dayBottom = '#fff7dc';
                const dayGlow = 'rgba(255, 255, 240, ALPHA)';

                // 夕焼け・朝焼けの太陽
                const warmFactor = 1 - this.smoothstep(0.05, 0.75, sunAltitude);
                const duskTop = '#ffd194';
                const duskBottom = '#ff7a33';
                const duskGlow = 'rgba(255, 140, 50, ALPHA)';

                const sunTop = this.interpolateColor(dayTop, duskTop, warmFactor);
                const sunBottom = this.interpolateColor(dayBottom, duskBottom, warmFactor);
                // interpolateColor は rgb() を返すため ALPHA プレースホルダーが消える。
                // RGB 部分だけ補間し、rgba テンプレートを手動で復元する。
                const sunGlowRGB = this.interpolateColor(dayGlow, duskGlow, warmFactor);
                const sunGlow = sunGlowRGB.replace('rgb(', 'rgba(').replace(')', ', ALPHA)');
                
                const appearAlpha = (sn === 1) ? this.smoothstep(6.0, 6.3, currentHour) : 1;
                drawBody(bodyX, bodyY, sunRadius, appearAlpha, sunTop, sunBottom, sunGlow, false);
            } else {
                const bodyX = getX(theta);
                const bodyY = getY(theta);
                drawBody(bodyX, bodyY, 40, 1, '#f8f9fa', '#ced4da', `rgba(240, 248, 255, ALPHA)`, true);
            }
        } else if (sn === 6) {
            // ステージ6: 月(中央〜沈む) -> 仄暗い朝 -> 太陽(日の出〜固定)
            const moonRadius = 140; // 3倍
            const sunRadius = 135;  // 3倍 (140だと少し大きすぎるかもしれないので微調整)

            if (this.bossSpawned) {
                // ボス戦中: 太陽を 2/3 程度表示される位置に固定 (theta = 0.2 くらい)
                const theta = 0.2;
                const sx = getX(theta);
                const sy = getY(theta);
                drawBody(sx, sy, sunRadius, 1, '#ffd9b4', '#ff7a33', `rgba(255, 160, 80, ALPHA)`, false);
            } else {
                // 進行度を3分割する (0-0.4:月, 0.4-0.92:朝, 0.92-1.0:太陽)
                if (progress < 0.4) {
                    const localP = progress / 0.4;
                    const theta = Math.PI / 2 + (localP * (Math.PI / 2 + 0.2)); // 中央から沈む
                    const mx = getX(theta);
                    const my = getY(theta);
                    const alpha = 1 - this.smoothstep(0.8, 1.0, localP);
                    drawBody(mx, my, moonRadius, alpha, '#f8f9fa', '#ced4da', `rgba(240, 248, 255, ALPHA)`, true);
                } else if (progress > 0.92) {
                    const localP = (progress - 0.92) / 0.08;
                    const theta = -0.2 + localP * 0.4; // 地平線下から昇り、指定位置へ
                    const sx = getX(theta);
                    const sy = getY(theta);
                    const alpha = this.smoothstep(0, 0.3, localP);
                    drawBody(sx, sy, sunRadius, alpha, '#ffd9b4', '#ff7a33', `rgba(255, 160, 80, ALPHA)`, false);
                }
                // 0.4 - 0.92 の間は何もない「仄暗い朝」
            }
        }
    }
    
    renderEnemies(ctx) {
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }
    }

    renderObstacles(ctx) {
        for (const obs of this.obstacles) {
            obs.render(ctx);
        }
    }
    
    renderProgressBar(ctx) {
        const barWidth = 200;
        const barHeight = 8;
        const x = CANVAS_WIDTH - barWidth - 20;
        const y = 110;

        // 進捗
        const progress = Math.min(this.progress / this.maxProgress, 1);
        ctx.fillStyle = this.bossSpawned ? '#f24d4d' : '#3db9e8';
        ctx.fillRect(x, y, barWidth * progress, barHeight);

        // ラベル
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "Zen Old Mincho", serif';
        ctx.textAlign = 'right';
        ctx.fillText(this.bossSpawned ? 'BOSS!' : '', x - 12, y + 8);
    }
    
    renderBossUI(ctx) {
        if (!this.boss) return;
        
        // ボス名
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px "Zen Old Mincho", serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.boss.bossName, CANVAS_WIDTH / 2, 50);
        
        // HPバー (モダンデザイン)
        const barWidth = 450;
        const barHeight = 16;
        const x = (CANVAS_WIDTH - barWidth) / 2;
        const y = 64;
        const radius = barHeight / 2;
        
        const bossHpRatio = Math.max(0, this.boss.hp / this.boss.maxHp);
        
        // 背景（トラック）
        ctx.save();
        const drawRoundedRectPath = (px, py, w, h, r) => {
            const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
            ctx.beginPath();
            ctx.moveTo(px + rr, py);
            ctx.lineTo(px + w - rr, py);
            ctx.arcTo(px + w, py, px + w, py + rr, rr);
            ctx.lineTo(px + w, py + h - rr);
            ctx.arcTo(px + w, py + h, px + w - rr, py + h, rr);
            ctx.lineTo(px + rr, py + h);
            ctx.arcTo(px, py + h, px, py + h - rr, rr);
            ctx.lineTo(px, py + rr);
            ctx.arcTo(px, py, px + rr, py, rr);
            ctx.closePath();
        };

        const trackGrad = ctx.createLinearGradient(x, y, x, y + barHeight);
        trackGrad.addColorStop(0, 'rgba(23, 30, 52, 0.88)');
        trackGrad.addColorStop(1, 'rgba(11, 16, 30, 0.9)');
        drawRoundedRectPath(x, y, barWidth, barHeight, radius);
        ctx.fillStyle = trackGrad;
        ctx.fill();

        // 中身（フィルのグラデーション：赤〜紫系でボス感を強調）
        if (bossHpRatio > 0) {
            const fillWidth = barWidth * bossHpRatio;
            const fillGrad = ctx.createLinearGradient(x, y, x + fillWidth, y);
            fillGrad.addColorStop(0, '#ff3344');
            fillGrad.addColorStop(0.5, '#ff5566');
            fillGrad.addColorStop(1, '#ff3344');
            
            drawRoundedRectPath(x + 1, y + 1, Math.max(1, fillWidth - 2), barHeight - 2, radius - 1);
            ctx.fillStyle = fillGrad;
            ctx.fill();
        }

        // 光沢エフェクト
        drawRoundedRectPath(x + 1.5, y + 1.5, barWidth - 3, Math.max(1, barHeight * 0.34), radius - 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fill();

        // 外枠
        drawRoundedRectPath(x, y, barWidth, barHeight, radius);
        ctx.strokeStyle = 'rgba(255, 120, 120, 0.42)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
    }
    
    // 全敵を取得
    getAllEnemies() {
        const all = [...this.enemies];
        if (this.boss && this.boss.isAlive) {
            all.push(this.boss);
        }
        return all;
    }
    
    isCleared() {
        return this.bossSpawned && this.bossDefeated && this.bossDefeatLingerTimer <= 0;
    }
}
