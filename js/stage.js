// ============================================
// Unification of the Nation - ステージ管理
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, STAGES, ENEMY_TYPES, OBSTACLE_TYPES, LANE_OFFSET } from './constants.js';
import { createEnemy, Ashigaru, Samurai, Busho, Ninja } from './enemy.js';
import { createBoss } from './boss.js';
import { createObstacle } from './obstacle.js';
import { audio } from './audio.js';

// ステージクラス
export class Stage {
    constructor(stageNumber) {
        this.stageNumber = stageNumber;
        this.stageInfo = STAGES[stageNumber - 1];
        this.name = this.stageInfo ? this.stageInfo.name : '';
        
        // ステージ進行
        this.progress = 0;
        this.maxProgress = 12000;  // スクロール距離を大幅に拡大 (6000 -> 12000)
        this.scrollSpeed = 2; // unused but kept
        
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
        
        // --- 竹林ステージの初期落ち葉配置 ---
        if (this.stageNumber === 1) {
            this.initBambooLeaves();
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
            castleCanvas.height = 400; 
            const cctx = castleCanvas.getContext('2d');
            const wallBaseY = 300;

            cctx.fillStyle = '#1a1a1a';
            cctx.beginPath();
            cctx.moveTo(-50, 400);
            cctx.lineTo(CANVAS_WIDTH * 0.15, wallBaseY - 20);
            cctx.lineTo(CANVAS_WIDTH * 0.5, wallBaseY - 5);
            cctx.lineTo(CANVAS_WIDTH * 0.85, wallBaseY - 30);
            cctx.lineTo(CANVAS_WIDTH + 50, 400);
            cctx.fill();

            // 櫓と天守のシルエット
            cctx.fillStyle = '#1a1a1a';
            cctx.fillRect(CANVAS_WIDTH * 0.05, wallBaseY - 160, 120, 150);
            cctx.fillRect(CANVAS_WIDTH * 0.75, wallBaseY - 180, 140, 170);
            cctx.beginPath();
            cctx.moveTo(CANVAS_WIDTH * 0.35, wallBaseY - 5);
            cctx.lineTo(CANVAS_WIDTH * 0.4, wallBaseY - 260);
            cctx.lineTo(CANVAS_WIDTH * 0.45, wallBaseY - 260);
            cctx.lineTo(CANVAS_WIDTH * 0.46, wallBaseY - 340);
            cctx.lineTo(CANVAS_WIDTH * 0.54, wallBaseY - 340);
            cctx.lineTo(CANVAS_WIDTH * 0.55, wallBaseY - 260);
            cctx.lineTo(CANVAS_WIDTH * 0.6, wallBaseY - 260);
            cctx.lineTo(CANVAS_WIDTH * 0.65, wallBaseY - 5);
            cctx.fill();
            
            // 白壁の月光描写
            cctx.globalAlpha = 0.45;
            cctx.fillStyle = '#e0e0f0';
            cctx.fillRect(CANVAS_WIDTH * 0.05 + 10, wallBaseY - 140, 100, 120);
            cctx.fillRect(CANVAS_WIDTH * 0.75 + 10, wallBaseY - 160, 120, 140);
            cctx.fillRect(CANVAS_WIDTH * 0.41, wallBaseY - 250, 130, 80);
            cctx.fillRect(CANVAS_WIDTH * 0.47, wallBaseY - 330, 45, 60);
            
            cctx.globalAlpha = 1.0;
            cctx.strokeStyle = '#000';
            cctx.lineWidth = 2;
            cctx.beginPath();
            cctx.moveTo(CANVAS_WIDTH * 0.35, wallBaseY - 5);
            cctx.lineTo(CANVAS_WIDTH * 0.4, wallBaseY - 260);
            cctx.lineTo(CANVAS_WIDTH * 0.46, wallBaseY - 340);
            cctx.lineTo(CANVAS_WIDTH * 0.54, wallBaseY - 340);
            cctx.lineTo(CANVAS_WIDTH * 0.6, wallBaseY - 260);
            cctx.lineTo(CANVAS_WIDTH * 0.65, wallBaseY - 5);
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
        const initialCount = 45;
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
                obstacleChance: 0.18,
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
                obstacleChance: 0.22,
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
                obstacleChance: 0.75,
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
                obstacleChance: 0.27,
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
                obstacleChance: 0.3,
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
                obstacleChance: 0.32,
                obstacleIntervalMin: 1800,
                obstacleIntervalMax: 3000
            }
        };
        return profiles[this.stageNumber] || profiles[3];
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
            5: { // 城内（朱色基調の回廊）
                start: { sky: ['#7a2f21', '#c46234'], far: '#5f261d', mid: '#743022', near: '#8f3a26' },
                mid:   { sky: ['#8a3524', '#d1703b'], far: '#6d2d22', mid: '#833427', near: '#9f422d' },
                end:   { sky: ['#6f2a1f', '#b55431'], far: '#56221a', mid: '#6b2a20', near: '#843326' },
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
            this.playerProbe.width = player.width || 0;
            this.playerProbe.height = player.height || 0;
            this.playerProbe.isGrounded = !!player.isGrounded;
        }
        this.updateBambooLeafEffects(deltaTime, progressDelta);
        if (this.bossIntroTimer > 0) {
            this.bossIntroTimer = Math.max(0, this.bossIntroTimer - deltaTime * 1000);
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
        if (this.progress >= this.maxProgress && !this.bossSpawned) {
            this.spawnBoss();
        }
        
        // 障害物出現（ボス戦中・撃破後・中ボス戦中は出現させない）
        const noObstaclePhase = (this.bossSpawned || this.midBossSpawned);
        this.obstacleTimer += deltaTime * 1000;
        if (this.obstacleTimer >= this.obstacleInterval && this.progress < this.maxProgress * 0.98 && !noObstaclePhase) {
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
            const targetX = scrollX + CANVAS_WIDTH * 0.72;
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
                // 到達時の闘気フラッシュ
                this.bossEntranceFlash = Math.max(this.bossEntranceFlash, 0.8);
            }
        }

        // ボス登場演出中（歩き入り完了後）はボス本体の攻撃を抑制して舞台演出を見せる
        // ただし isEntering 中（歩き入り中）は停止させず歩かせる
        if (this.bossIntroTimer > 0 && !(this.boss && this.boss.isEntering)) {
            if (this.boss) {
                this.boss.isAttacking = false;
                this.boss.vx = 0;
                this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, this.bossIntroTimer);
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

        // ボス戦中も少量の雑魚敵を出現させる
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

    spawnRecycledEnemyAhead(type) {
        const spawnX = this.progress + CANVAS_WIDTH + 80 + Math.random() * 180;
        const spawnY = this.groundY - 60;
        const recycled = createEnemy(type || ENEMY_TYPES.ASHIGARU, spawnX, spawnY, this.groundY);
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
                type = ENEMY_TYPES.BUSHO;
            }
            
            // 画面外（右側）から出現
            const variance = i * 40; 
            
            // スクロール位置(this.progress)を考慮したワールド座標で出現させる
            // 進行に応じて背後湧きを少し増やす（序盤は抑えめ）
            const leftChance = this.balanceProfile.leftSpawnBase +
                (this.balanceProfile.leftSpawnPeak - this.balanceProfile.leftSpawnBase) * progressRatio;
            const comeFromLeft = Math.random() < leftChance;
            let spawnBaseX;
            let facingRight;
            
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
            
            const y = this.groundY - 60;
            
            const enemy = createEnemy(type, x, y, this.groundY);
            enemy.facingRight = facingRight;
            this.enemies.push(enemy);
        }
    }
    
    spawnMidBoss() {
        const x = this.progress + CANVAS_WIDTH + 50;
        // 地面に直接配置 (LANE_OFFSET考慮)
        const y = this.groundY + LANE_OFFSET - 66; // 足元がLANE_OFFSETに来るように高さ分引く
        const midBoss = createEnemy(ENEMY_TYPES.BUSHO, x, y, this.groundY);
        midBoss.hp = Math.round(midBoss.hp * 1.38);
        midBoss.maxHp = Math.round(midBoss.maxHp * 1.38);
        this.enemies.push(midBoss);
    }

    spawnObstacle() {
        // ステージごとの発生率で調整
        if (Math.random() > this.balanceProfile.obstacleChance) return;

        const spikeChanceByStage = [0, 0.12, 0.15, 0.42, 0.56, 0.7];
        const spikeChance = spikeChanceByStage[Math.max(0, Math.min(spikeChanceByStage.length - 1, this.stageNumber - 1))];
        // ステージ3（山道）はスパイク不要、常に岩
        const type = (this.stageNumber >= 5)
            ? OBSTACLE_TYPES.SPIKE
            : (this.stageNumber === 3)
                ? OBSTACLE_TYPES.ROCK
                : (Math.random() < spikeChance ? OBSTACLE_TYPES.SPIKE : OBSTACLE_TYPES.ROCK);
        
        // 画面外（右側）から出現
        const x = this.progress + CANVAS_WIDTH + 50 + Math.random() * 100;
        const rockChainChance = this.stageNumber === 3 ? 0.88 : 0.65;
        const rockChainCount = this.stageNumber === 3
            ? 3 + Math.floor(Math.random() * 4)
            : 2 + Math.floor(Math.random() * 3);
        if (type === OBSTACLE_TYPES.ROCK && Math.random() < rockChainChance) {
            // 岩塊の連なり。単一引き伸ばしではなく複数シルエットで道を塞ぐ。
            const chainCount = rockChainCount;
            let cursorX = x;
            for (let i = 0; i < chainCount; i++) {
                const rock = createObstacle(OBSTACLE_TYPES.ROCK, cursorX + (Math.random() * 18 - 9), this.groundY);
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
            const shouldRemove = obs.update(deltaTime);
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
        // 足元を地面に合わせる
        this.boss.y = this.groundY + LANE_OFFSET - (this.boss.height || 180);
        // ボスを左向き（プレイヤー方向）に設定
        this.boss.facingRight = false;

        // 登場演出フラグ: 画面右端から歩き入る
        this.boss.isEntering = true;
        this.boss.entranceTargetX = scrollX + CANVAS_WIDTH * 0.72; // 着地目標X
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
        audio.playBgm('boss', this.stageNumber, 1500, 0);
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

    updateBambooLeafEffects(deltaTime, progressDelta = 0) {
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

        const maxLeaves = Math.floor(20 * spawnMultiplier);
        const spawnInterval = 400 / spawnMultiplier;
        this.bambooLeafSpawnTimer += dtMs;

        // ボス戦中は竹エリア（画面左75%）内にのみ落ち葉を生成
        const spawnXMax = this.bossSpawned
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

        const playerX = this.playerProbe ? (this.playerProbe.x + this.playerProbe.width * 0.5 - this.progress) : -9999;
        const playerY = this.playerProbe ? (this.playerProbe.y + this.playerProbe.height) : 9999;
        const playerVX = this.playerProbe ? (this.playerProbe.vx || 0) : 0;
        const isDashing = !!(this.playerProbe && this.playerProbe.isDashing); // ダッシュ判定

        const cliffY = this.groundY + 120; // 路面パースに合わせて接地範囲を拡大

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
        const bossIntroRatio = (this.bossIntroTimer > 0)
            ? (this.bossIntroTimer / this.bossIntroDuration)
            : 0;
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
        
        // 空グラデーション
        const skyGradient = ctx.createLinearGradient(0, 0, 0, this.groundY);
        skyGradient.addColorStop(0, skyColors[0]);
        skyGradient.addColorStop(1, skyColors[1]);
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

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

            // 地平線の薄い霞
            const haze = ctx.createLinearGradient(0, this.groundY - 120, 0, this.groundY + 20);
            haze.addColorStop(0, 'rgba(255,255,255,0)');
            haze.addColorStop(1, isSunnyStage ? 'rgba(210,228,255,0.12)' : 'rgba(190,210,255,0.08)');
            ctx.fillStyle = haze;
            ctx.fillRect(0, this.groundY - 120, CANVAS_WIDTH, 150);
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
            const indoorHaze = ctx.createLinearGradient(0, 0, 0, this.groundY);
            indoorHaze.addColorStop(0, `rgba(${warmTopR}, ${warmTopG}, ${warmTopB}, ${warmTopA.toFixed(3)})`);
            indoorHaze.addColorStop(1, `rgba(${warmBottomR}, ${warmBottomG}, ${warmBottomB}, ${warmBottomA.toFixed(3)})`);
            ctx.fillStyle = indoorHaze;
            ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

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
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
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
        const peekBase = this.maxProgress + CANVAS_WIDTH * 0.72; // 出口の基準ワールドx
        const peekAnchorX = (peekBase - p) * peekPara; // 基準点のスクリーンx

        // 完全に画面外右ならスキップ
        if (peekAnchorX > CANVAS_WIDTH + 600) return;

        // 画面右端に近づくにつれフェードイン（400px幅でなめらかに）
        // さらにボス登場イントロのblend値を掛け、竹が退いていくのに合わせて出現させる
        const posBlend = Math.max(0, Math.min(1, (CANVAS_WIDTH + 400 - peekAnchorX) / 400));
        const rawBlend = this.bossDefeated
            ? posBlend
            : posBlend * this.bossEncounterBlend;
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
            // 昼間の青緑の山が右端に迫り、山道の入口（木の鳥居）が見える
            case 2: {
                // 遠景の山稜（昼間：青みがかった緑）
                const ridgeData = [
                    { x: CANVAS_WIDTH * 0.68, w: 480, h: 200, colorA: '#4a6848', colorB: '#2e4830' },
                    { x: CANVAS_WIDTH * 0.76, w: 360, h: 155, colorA: '#5c7a52', colorB: '#3a5438' },
                ];
                for (const d of ridgeData) {
                    ctx.fillStyle = this.interpolateColor(d.colorA, d.colorB, 0.5);
                    ctx.beginPath();
                    ctx.moveTo(d.x, gY);
                    ctx.bezierCurveTo(d.x + d.w * 0.22, gY - d.h * 0.65, d.x + d.w * 0.42, gY - d.h, d.x + d.w * 0.56, gY - d.h * 0.88);
                    ctx.bezierCurveTo(d.x + d.w * 0.72, gY - d.h * 0.68, d.x + d.w * 0.86, gY - d.h * 0.42, d.x + d.w, gY);
                    ctx.closePath();
                    ctx.fill();
                }
                // 山肌のハイライト（日光が当たる面）
                ctx.fillStyle = 'rgba(200, 220, 180, 0.10)';
                ctx.beginPath();
                ctx.moveTo(CANVAS_WIDTH * 0.76, gY);
                ctx.bezierCurveTo(CANVAS_WIDTH * 0.82, gY - 120, CANVAS_WIDTH * 0.88, gY - 155, CANVAS_WIDTH, gY - 100);
                ctx.lineTo(CANVAS_WIDTH, gY);
                ctx.closePath();
                ctx.fill();

                // 山道の入口：木製の鳥居（昼間なので朱色をしっかり出す）
                const toriiX = CANVAS_WIDTH * 0.78;
                const toriiH = 110;
                const toriiW = 80;
                ctx.strokeStyle = '#c03820';  // 昼間の朱色
                ctx.lineWidth = 9;
                ctx.beginPath(); ctx.moveTo(toriiX, gY); ctx.lineTo(toriiX, gY - toriiH); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(toriiX + toriiW, gY); ctx.lineTo(toriiX + toriiW, gY - toriiH); ctx.stroke();
                ctx.lineWidth = 11;
                ctx.beginPath();
                ctx.moveTo(toriiX - 16, gY - toriiH + 6);
                ctx.quadraticCurveTo(toriiX + toriiW * 0.5, gY - toriiH - 12, toriiX + toriiW + 16, gY - toriiH + 6);
                ctx.stroke();
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.moveTo(toriiX - 6, gY - toriiH * 0.68);
                ctx.lineTo(toriiX + toriiW + 6, gY - toriiH * 0.68);
                ctx.stroke();

                // 鳥居脇の杉（昼間の緑）
                for (let side = 0; side < 2; side++) {
                    const sx = toriiX - 32 + side * (toriiW + 48);
                    const sh = 130 + side * 20;
                    const sw = 5;
                    ctx.fillStyle = '#3a4830';
                    ctx.fillRect(sx + sw * 0.5 - 1, gY - sh, sw, sh);
                    for (let l = 0; l < 4; l++) {
                        const lw = 32 - l * 6;
                        const ly = gY - sh + l * (sh / 4.5);
                        ctx.fillStyle = this.interpolateColor('#4e6a3c', '#2e4228', 0.3 + l * 0.15);
                        ctx.beginPath();
                        ctx.moveTo(sx + sw * 0.5, ly - 18);
                        ctx.lineTo(sx + sw * 0.5 - lw * 0.5, ly + 8);
                        ctx.lineTo(sx + sw * 0.5 + lw * 0.5, ly + 8);
                        ctx.closePath();
                        ctx.fill();
                    }
                }

                // 入口の低木（昼間の緑）
                const bushX = CANVAS_WIDTH * 0.91;
                ctx.fillStyle = '#4e6840';
                ctx.beginPath();
                ctx.ellipse(bushX, gY - 14, 28, 20, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#5a7848';
                ctx.beginPath();
                ctx.ellipse(bushX + 30, gY - 10, 20, 15, 0.2, 0, Math.PI * 2);
                ctx.fill();
                break;
            }

            // ─── Stage3（山道） → Stage4（城下町）───────────────────────────
            // 山道を抜けた先に城下町の屋根が見える。瓦屋根のシルエットと石畳の始まり
            case 3: {
                // 城下町の屋根群（右端に複数）
                const roofData = [
                    { x: CANVAS_WIDTH * 0.72, w: 140, h: 70, wallH: 62 },
                    { x: CANVAS_WIDTH * 0.80, w: 180, h: 58, wallH: 80 },
                    { x: CANVAS_WIDTH * 0.90, w: 120, h: 82, wallH: 55 },
                ];
                for (const d of roofData) {
                    // 壁
                    ctx.fillStyle = this.interpolateColor('#2e2a36', '#16141e', 0.38);
                    ctx.fillRect(d.x, gY - d.wallH, d.w, d.wallH);
                    // 瓦屋根
                    ctx.fillStyle = this.interpolateColor('#40394e', '#1c1a28', 0.48);
                    ctx.beginPath();
                    ctx.moveTo(d.x - 18, gY - d.wallH + 3);
                    ctx.quadraticCurveTo(d.x + d.w * 0.5, gY - d.wallH - d.h, d.x + d.w + 18, gY - d.wallH + 3);
                    ctx.lineTo(d.x + d.w + 12, gY - d.wallH + 13);
                    ctx.quadraticCurveTo(d.x + d.w * 0.5, gY - d.wallH - d.h * 0.72, d.x - 12, gY - d.wallH + 13);
                    ctx.closePath();
                    ctx.fill();
                    // 窓の明かり（提灯）
                    if (d.w > 130) {
                        const wPulse = 0.55 + Math.sin(time * 1.4 + d.x * 0.01) * 0.45;
                        ctx.fillStyle = `rgba(234, 196, 100, ${0.22 * wPulse})`;
                        ctx.fillRect(d.x + d.w * 0.28, gY - d.wallH + 18, 18, 22);
                    }
                }

                // 城下町入口の石灯籠
                const toroX = CANVAS_WIDTH * 0.75;
                const toroH = 52;
                ctx.fillStyle = this.interpolateColor('#7c7468', '#36322e', 0.36);
                ctx.fillRect(toroX + 8, gY - toroH, 9, toroH);          // 柱
                ctx.fillRect(toroX + 2, gY - toroH - 6, 21, 6);          // 笠
                ctx.fillRect(toroX, gY - toroH - 16, 25, 10);            // 火袋
                const lPulse = 0.5 + Math.sin(time * 1.8 + 2.1) * 0.5;
                ctx.fillStyle = `rgba(240, 210, 110, ${0.38 * lPulse})`;
                ctx.fillRect(toroX + 3, gY - toroH - 14, 19, 8);         // 灯り

                break;
            }

            // ─── Stage4（城下町） → Stage5（城内）───────────────────────────
            // 城の大門に到達。巨大な城門と石垣が右端を塞いでいる
            case 4: {
                // 石垣
                ctx.fillStyle = this.interpolateColor('#302a28', '#1a1816', 0.42);
                ctx.fillRect(CANVAS_WIDTH * 0.74, gY - 100, CANVAS_WIDTH * 0.26, 100);
                // 石垣の目地
                ctx.strokeStyle = 'rgba(55, 48, 44, 0.7)';
                ctx.lineWidth = 1.4;
                for (let row = 0; row < 5; row++) {
                    const ry = gY - 100 + row * 20;
                    const offset = (row % 2) * 30;
                    for (let col = -1; col < 8; col++) {
                        const sx = CANVAS_WIDTH * 0.74 + col * 60 + offset;
                        if (sx < CANVAS_WIDTH * 0.74) continue;
                        ctx.strokeRect(sx, ry, 54, 18);
                    }
                }

                // 城門の大屋根（中央寄り右）
                const gateX = CANVAS_WIDTH * 0.76;
                const gateW = 220;
                const gateWallH = 100;
                const roofH = 72;
                // 門壁
                ctx.fillStyle = this.interpolateColor('#8c2e1c', '#4a1810', 0.38);
                ctx.fillRect(gateX, gY - gateWallH - 100, gateW, 100);
                // 大屋根
                ctx.fillStyle = this.interpolateColor('#7a2818', '#3e1408', 0.5);
                ctx.beginPath();
                ctx.moveTo(gateX - 30, gY - gateWallH - 100 + 4);
                ctx.quadraticCurveTo(gateX + gateW * 0.5, gY - gateWallH - 100 - roofH, gateX + gateW + 30, gY - gateWallH - 100 + 4);
                ctx.lineTo(gateX + gateW + 20, gY - gateWallH - 100 + 18);
                ctx.quadraticCurveTo(gateX + gateW * 0.5, gY - gateWallH - 100 - roofH * 0.72, gateX - 20, gY - gateWallH - 100 + 18);
                ctx.closePath();
                ctx.fill();
                // 門の開口部（暗い穴）
                ctx.fillStyle = 'rgba(6, 3, 6, 0.92)';
                const openW = gateW * 0.36;
                ctx.fillRect(gateX + (gateW - openW) * 0.5, gY - gateWallH - 100 + 100 - 78, openW, 78);
                // 開口部の両脇の朱柱
                ctx.fillStyle = this.interpolateColor('#a03020', '#561810', 0.3);
                ctx.fillRect(gateX + (gateW - openW) * 0.5 - 14, gY - gateWallH - 100 + 18, 14, 82);
                ctx.fillRect(gateX + (gateW + openW) * 0.5, gY - gateWallH - 100 + 18, 14, 82);
                // 城門脇の幟
                const bannX = gateX - 28;
                ctx.strokeStyle = 'rgba(40, 46, 62, 0.88)';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(bannX, gY); ctx.lineTo(bannX, gY - 190); ctx.stroke();
                ctx.fillStyle = 'rgba(210, 220, 244, 0.46)';
                ctx.fillRect(bannX, gY - 190, 28, 56);
                break;
            }

            // ─── Stage5（城内） → Stage6（天守閣）──────────────────────────
            // 回廊の突き当たりに天守閣への急な石段が現れる
            case 5: {
                // 石段（右端中央〜右端にかけてパース付き）
                const stairBaseX = CANVAS_WIDTH * 0.72;
                const stairTopX  = CANVAS_WIDTH * 0.78;
                const stairTopY  = gY - 200;
                const steps = 10;
                for (let s = 0; s < steps; s++) {
                    const t2 = s / steps;
                    const x0 = stairBaseX + (stairTopX - stairBaseX) * t2;
                    const x1 = stairBaseX + (stairTopX - stairBaseX) * ((s + 1) / steps);
                    const y0 = gY - (gY - stairTopY) * t2;
                    const y1 = gY - (gY - stairTopY) * ((s + 1) / steps);
                    const stepW = CANVAS_WIDTH - x0 + 20;
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
                const tenshuRoofX = CANVAS_WIDTH * 0.74;
                const tenshuRoofY = stairTopY - 20;
                const tenshuRoofW = CANVAS_WIDTH - tenshuRoofX + 30;
                ctx.fillStyle = this.interpolateColor('#424a5a', '#1e2230', 0.46);
                ctx.fillRect(tenshuRoofX + 20, tenshuRoofY + 24, tenshuRoofW - 20, gY - stairTopY + 10);
                ctx.fillStyle = this.interpolateColor('#4a5468', '#202636', 0.48);
                ctx.beginPath();
                ctx.moveTo(tenshuRoofX, tenshuRoofY + 28);
                ctx.quadraticCurveTo(tenshuRoofX + tenshuRoofW * 0.46, tenshuRoofY - 38, CANVAS_WIDTH + 30, tenshuRoofY + 28);
                ctx.lineTo(CANVAS_WIDTH + 30, tenshuRoofY + 44);
                ctx.quadraticCurveTo(tenshuRoofX + tenshuRoofW * 0.46, tenshuRoofY - 22, tenshuRoofX - 12, tenshuRoofY + 44);
                ctx.closePath();
                ctx.fill();

                // 石段の両脇の石灯籠
                for (let side = 0; side < 2; side++) {
                    const lx = CANVAS_WIDTH * (0.74 + side * 0.14);
                    const lGY = gY - 80 * (lx - stairBaseX) / (CANVAS_WIDTH - stairBaseX);
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

            ctx.strokeStyle = `rgba(255, 255, 255, ${0.025 + 0.03 * alpha})`;
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
                    for (let tier = 0; tier < tiers; tier++) {
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
                // bossEncounterBlend (0→1) を使ってイントロ演出に合わせて滑らかに竹を右から押し込む
                // blend=0なら全画面、blend=1なら右75%でクリップ（右1/4に街道の景色が覗く）
                // ボス撃破後も竹は戻さず右75%のまま固定
                const bambooLimitFull = CANVAS_WIDTH + 80;
                const bambooLimitBoss = CANVAS_WIDTH * 0.75;
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

                // 下草も針葉樹系のシルエットで統一
                const underPara = 0.34;
                const underSpan = 48;
                const underScroll = p * underPara;
                const underStart = Math.floor((underScroll - underSpan * 3) / underSpan);
                const underEnd = Math.ceil((underScroll + CANVAS_WIDTH + underSpan * 3) / underSpan);
                ctx.fillStyle = this.interpolateColor('#5f7e58', '#2a3f2e', 0.36);
                for (let i = underStart; i <= underEnd; i++) {
                    const seed = i * 5.83;
                    const x = i * underSpan - underScroll + this.noiseSigned(seed + 0.8) * 7;
                    const y = this.groundY - 4 + this.noiseSigned(seed + 1.5) * 3;
                    const h = 8 + this.noise1D(seed + 3.1) * 16;
                    const w = 8 + this.noise1D(seed + 3.6) * 9;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + w * 0.5, y - h);
                    ctx.lineTo(x + w, y);
                    ctx.closePath();
                    ctx.fill();
                }

                const kPara = 0.68;
                const kCellSize = 310;
                const kStartIdx = Math.floor((p * kPara - 260) / kCellSize);
                const kEndIdx = Math.ceil((CANVAS_WIDTH + p * kPara + 260) / kCellSize);

                const drawKawaraRoof = (x, y, w, h) => {
                    ctx.fillStyle = this.interpolateColor('#6c6f7a', '#2d323e', 0.5);
                    ctx.beginPath();
                    ctx.moveTo(x - 16, y + 2);
                    ctx.quadraticCurveTo(x + w * 0.22, y - h * 0.86, x + w * 0.5, y - h);
                    ctx.quadraticCurveTo(x + w * 0.78, y - h * 0.86, x + w + 16, y + 2);
                    ctx.lineTo(x + w + 12, y + 10);
                    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.66, x - 12, y + 10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(206, 214, 230, 0.14)';
                    ctx.lineWidth = 1;
                    const tiles = Math.max(6, Math.floor(w / 20));
                    for (let i = 0; i <= tiles; i++) {
                        const tx = x - 10 + (i / tiles) * (w + 20);
                        ctx.beginPath();
                        ctx.moveTo(tx, y + 4);
                        ctx.lineTo(tx - 2, y + 10);
                        ctx.stroke();
                    }
                };

                const drawKominka = (baseX, baseY, seed, scale = 1) => {
                    const w = (110 + this.noise1D(seed + 2.3) * 70) * scale;
                    const h = (64 + this.noise1D(seed + 3.1) * 42) * scale;
                    const x = baseX;
                    const wallY = baseY - h;
                    const splitY = wallY + h * (0.48 + this.noiseSigned(seed + 4.2) * 0.06);

                    // 下階木部・上階漆喰
                    ctx.fillStyle = this.interpolateColor('#8c6e4c', '#392d22', 0.32);
                    ctx.fillRect(x, splitY, w, baseY - splitY);
                    ctx.fillStyle = this.interpolateColor('#c9b8a0', '#6a5d50', 0.32);
                    ctx.fillRect(x + 5, wallY + 8, w - 10, splitY - wallY - 8);

                    // 柱
                    ctx.fillStyle = this.interpolateColor('#5e442f', '#221a14', 0.36);
                    const posts = 4 + Math.floor(this.noise1D(seed + 4.9) * 3);
                    for (let pIdx = 0; pIdx <= posts; pIdx++) {
                        const px = x + (pIdx / posts) * w;
                        ctx.fillRect(px - 2, wallY + 8, 4, baseY - wallY - 8);
                    }

                    // 格子
                    ctx.fillStyle = 'rgba(40, 30, 22, 0.65)';
                    const latticeY = splitY + 10;
                    const latticeH = Math.max(22, baseY - latticeY - 8);
                    const latticeCols = 5 + Math.floor(this.noise1D(seed + 6.1) * 4);
                    for (let c = 1; c <= latticeCols; c++) {
                        const lx = x + 10 + (c / (latticeCols + 1)) * (w - 20);
                        ctx.fillRect(lx - 1, latticeY, 2, latticeH);
                    }

                    // 虫籠窓
                    const mushikoCount = 2 + Math.floor(this.noise1D(seed + 7.2) * 3);
                    for (let m = 0; m < mushikoCount; m++) {
                        const mx = x + 14 + m * ((w - 28) / mushikoCount);
                        const my = wallY + 16 + this.noise1D(seed + 8.3 + m) * 10;
                        const mw = 16 + this.noise1D(seed + 9.4 + m) * 8;
                        ctx.fillStyle = 'rgba(32, 28, 24, 0.56)';
                        ctx.fillRect(mx, my, mw, 13);
                        ctx.fillStyle = 'rgba(238, 222, 186, 0.14)';
                        ctx.fillRect(mx + 2, my + 2, mw - 4, 4);
                    }

                    // のれん
                    if (this.noise1D(seed + 10.8) > 0.4) {
                        const nw = Math.min(58 * scale, w * 0.45);
                        const nx = x + w * (0.24 + this.noise1D(seed + 11.7) * 0.25);
                        const ny = splitY + 6;
                        const nh = 18 + this.noise1D(seed + 12.3) * 8;
                        ctx.fillStyle = this.interpolateColor('#3d566f', '#1e2c3b', 0.35);
                        ctx.fillRect(nx, ny, nw, nh);
                        ctx.fillStyle = 'rgba(228, 236, 246, 0.2)';
                        ctx.fillRect(nx + nw * 0.5 - 1, ny, 2, nh);
                    }

                    drawKawaraRoof(x, wallY, w, 30 * scale + this.noise1D(seed + 13.6) * 14 * scale);
                };

                const drawPine = (baseX, baseY, seed, scale = 1) => {
                    const trunkW = (8 + this.noise1D(seed + 0.9) * 6) * scale;
                    const trunkH = (84 + this.noise1D(seed + 1.5) * 70) * scale;
                    ctx.fillStyle = this.interpolateColor('#6f543a', '#2b2015', 0.34);
                    ctx.fillRect(baseX, baseY - trunkH, trunkW, trunkH);

                    const layers = 4 + Math.floor(this.noise1D(seed + 2.4) * 2);
                    for (let l = 0; l < layers; l++) {
                        const ly = baseY - trunkH + l * (trunkH / (layers + 0.3));
                        const width = (68 - l * 10 + this.noiseSigned(seed + 3.3 + l) * 8) * scale;
                        const peak = (34 + this.noise1D(seed + 4.6 + l) * 20) * scale;
                        const grad = ctx.createLinearGradient(baseX - width * 0.55, ly, baseX + trunkW + width * 0.55, ly);
                        grad.addColorStop(0, '#2d4a35');
                        grad.addColorStop(0.5, '#4d7652');
                        grad.addColorStop(1, '#223a2a');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.moveTo(baseX - width * 0.52, ly + 10 * scale);
                        ctx.quadraticCurveTo(baseX + trunkW * 0.5, ly - peak, baseX + trunkW + width * 0.52, ly + 10 * scale);
                        ctx.closePath();
                        ctx.fill();
                    }
                };

                for (let i = kStartIdx; i <= kEndIdx; i++) {
                    const seed = i * 9.21;
                    const x = i * kCellSize - p * kPara + this.noiseSigned(seed + 0.7) * 36;
                    
                    // 自然に配置
                    if (x < -200 || x > CANVAS_WIDTH + 200) continue;
                    
                    const y = this.groundY - 2;
                    const roll = this.noise1D(seed + 1.6);

                    if (roll < 0.48) {
                        drawPine(x, y, seed, 1.0);
                        if (this.noise1D(seed + 1.93) > 0.42) drawPine(x + 34, y + 3, seed + 2.7, 0.82);
                    } else if (roll < 0.78) {
                        drawKominka(x - 8, y, seed, 1.0);
                        if (this.noise1D(seed + 2.2) > 0.58) drawPine(x + 122, y + 2, seed + 4.2, 0.74);
                    } else if (roll < 0.9) {
                        // 街道脇の道標と石灯籠
                        const markerH = 52 + this.noise1D(seed + 2.8) * 24;
                        ctx.fillStyle = this.interpolateColor('#9a907d', '#454038', 0.28);
                        ctx.beginPath();
                        ctx.moveTo(x + 8, y);
                        ctx.lineTo(x + 30, y);
                        ctx.lineTo(x + 26, y - markerH);
                        ctx.lineTo(x + 12, y - markerH);
                        ctx.closePath();
                        ctx.fill();
                        ctx.fillStyle = this.interpolateColor('#c2b8a4', '#5f574c', 0.3);
                        ctx.fillRect(x + 4, y - markerH - 9, 30, 9);

                        const toroX = x + 58;
                        const toroH = 30 + this.noise1D(seed + 3.8) * 12;
                        ctx.fillStyle = this.interpolateColor('#8a8376', '#3b362f', 0.34);
                        ctx.fillRect(toroX + 8, y - toroH, 7, toroH);
                        ctx.fillRect(toroX + 3, y - toroH - 5, 17, 5);
                        ctx.fillRect(toroX, y - toroH - 13, 23, 8);
                        ctx.fillStyle = 'rgba(238, 210, 150, 0.2)';
                        ctx.fillRect(toroX + 9, y - toroH - 10, 5, 4);
                    } else {
                        const fenceW = 114 + this.noise1D(seed + 2.1) * 66;
                        const postGap = 18;
                        ctx.fillStyle = this.interpolateColor('#7f674d', '#2e2418', 0.36);
                        for (let fx = 0; fx < fenceW; fx += postGap) {
                            const ph = 16 + this.noise1D(seed + 3.5 + fx) * 13;
                            ctx.fillRect(x + fx, y - ph, 5, ph);
                        }
                        ctx.fillRect(x - 4, y - 16, fenceW + 8, 4);
                    }
                }

                // 旅人シルエットで街道の情報量を底上げ
                const travelerPara = 0.82;
                const travelerSpan = 220;
                const travelerScroll = p * travelerPara;
                const travelerStart = Math.floor((travelerScroll - travelerSpan * 3) / travelerSpan);
                const travelerEnd = Math.ceil((travelerScroll + CANVAS_WIDTH + travelerSpan * 3) / travelerSpan);
                for (let i = travelerStart; i <= travelerEnd; i++) {
                    const seed = i * 6.29;
                    if (this.noise1D(seed + 0.9) < 0.58) continue;
                    const x = i * travelerSpan - travelerScroll + this.noiseSigned(seed + 1.7) * 18;
                    
                    // 自然に配置
                    if (x < -50 || x > CANVAS_WIDTH + 50) continue;
                    
                    const y = this.groundY - 5;
                    const h = 24 + this.noise1D(seed + 2.6) * 14;
                    const dir = this.noise1D(seed + 3.2) > 0.5 ? 1 : -1;
                    ctx.fillStyle = 'rgba(64, 52, 40, 0.34)';
                    ctx.fillRect(x - 2, y - h, 4, h);
                    ctx.beginPath();
                    ctx.arc(x, y - h - 5, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(94, 78, 56, 0.34)';
                    ctx.beginPath();
                    ctx.moveTo(x - 7, y - h - 4);
                    ctx.lineTo(x + dir * 12, y - h - 10);
                    ctx.lineTo(x + dir * 8, y - h + 1);
                    ctx.closePath();
                    ctx.fill();
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

                // 山際の霧
                const mist = ctx.createLinearGradient(0, this.groundY - 190, 0, this.groundY - 30);
                mist.addColorStop(0, 'rgba(220, 210, 230, 0)');
                mist.addColorStop(1, 'rgba(196, 182, 210, 0.13)');
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

                    if (roll > 0.62) {
                        // 苔むした岩
                        const rw = 18 + this.noise1D(seed + 2.1) * 28;
                        const rh = 10 + this.noise1D(seed + 2.7) * 18;
                        const rockGrad = ctx.createLinearGradient(x, this.groundY - rh, x, this.groundY);
                        rockGrad.addColorStop(0, this.interpolateColor(currentPalette.near, '#3a4438', 0.52));
                        rockGrad.addColorStop(1, this.interpolateColor(currentPalette.near, '#1a1e18', 0.62));
                        ctx.fillStyle = rockGrad;
                        ctx.beginPath();
                        ctx.moveTo(x - 4, this.groundY);
                        ctx.quadraticCurveTo(x + rw * 0.15, this.groundY - rh * 0.92, x + rw * 0.4, this.groundY - rh);
                        ctx.quadraticCurveTo(x + rw * 0.7, this.groundY - rh * 0.88, x + rw + 4, this.groundY);
                        ctx.closePath();
                        ctx.fill();
                        // 苔のハイライト
                        ctx.fillStyle = `rgba(86, 112, 72, ${0.18 + this.noise1D(seed + 3.4) * 0.12})`;
                        ctx.beginPath();
                        ctx.ellipse(x + rw * 0.45, this.groundY - rh * 0.72, rw * 0.28, rh * 0.22, 0, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (roll > 0.3) {
                        // 低木（丸みのある自然なシルエット）
                        const bw = 14 + this.noise1D(seed + 3.1) * 16;
                        const bh = 12 + this.noise1D(seed + 3.6) * 14;
                        const bushColor = this.interpolateColor(currentPalette.near, '#1a2818', 0.48);
                        ctx.fillStyle = bushColor;
                        ctx.beginPath();
                        ctx.ellipse(x + bw * 0.5, this.groundY - bh * 0.5, bw * 0.56, bh * 0.56, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // 横に小さい塊を2つ追加して自然に
                        if (this.noise1D(seed + 4.2) > 0.4) {
                            ctx.beginPath();
                            ctx.ellipse(x + bw * 0.9, this.groundY - bh * 0.3, bw * 0.32, bh * 0.36, 0.2, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    } else {
                        // 小石の集まり
                        const stoneCount = 2 + Math.floor(this.noise1D(seed + 5.1) * 3);
                        ctx.fillStyle = this.interpolateColor(currentPalette.near, '#2a2824', 0.56);
                        for (let s = 0; s < stoneCount; s++) {
                            const sx = x + s * (6 + this.noise1D(seed + 5.5 + s) * 8);
                            const sr = 3 + this.noise1D(seed + 5.8 + s) * 5;
                            ctx.beginPath();
                            ctx.ellipse(sx, this.groundY - sr * 0.4, sr, sr * 0.6, 0, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }

                break;
            }
                
            case 'town': {
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

                // 奥の長屋シルエット（低彩度で江戸の町並み感を作る）
                const tParaFar = 0.18;
                const tSpacingFar = 210;
                const tOffsetFar = (p * tParaFar) % tSpacingFar;
                for (let i = -2; i < CANVAS_WIDTH / tSpacingFar + 4; i++) {
                    const worldIndex = i + Math.floor((p * tParaFar) / tSpacingFar);
                    const seed = worldIndex * 6.13;
                    const baseY = this.groundY - 12;
                    const x = i * tSpacingFar - tOffsetFar + this.noiseSigned(seed + 0.7) * 18;
                    
                    if (x < -200 || x > CANVAS_WIDTH + 200) continue;
                    
                    const w = 120 + this.noise1D(seed + 1.2) * 80;
                    const h = 74 + this.noise1D(seed + 2.8) * 56;
                    const wallY = baseY - h;

                    ctx.fillStyle = this.interpolateColor('#4b4654', '#20212a', 0.32);
                    ctx.fillRect(x, wallY, w, h);
                    drawKawaraRoof(x, wallY, w, 26 + this.noise1D(seed + 3.4) * 14, this.interpolateColor('#5f6678', '#2b2f3d', 0.52), 0.12);

                    ctx.fillStyle = 'rgba(236, 219, 182, 0.12)';
                    const ww = 12;
                    const windowCount = 2 + Math.floor(this.noise1D(seed + 4.7) * 3);
                    for (let k = 0; k < windowCount; k++) {
                        const wx = x + 20 + k * ((w - 40) / Math.max(1, windowCount));
                        const wy = wallY + 18 + this.noise1D(seed + 5.3 + k) * 16;
                        ctx.fillRect(wx, wy, ww, 14);
                    }
                }

                // ボス戦中・撃破後：背後の巨大な城（天下無双の巨城）
                if (this.bossSpawned && this.cachedAssets.castle) {
                    ctx.save();
                    const wallBaseY = this.groundY - 140;
                    ctx.drawImage(this.cachedAssets.castle, 0, wallBaseY - 300);

                    // 下部フェード（町家との馴染み）
                    const castleFade = ctx.createLinearGradient(0, wallBaseY - 50, 0, this.groundY);
                    castleFade.addColorStop(0, 'rgba(0,0,0,0)');
                    castleFade.addColorStop(1, 'rgba(0,0,0,0.6)');
                    ctx.fillStyle = castleFade;
                    ctx.fillRect(0, wallBaseY - 50, CANVAS_WIDTH, 150);

                    ctx.restore();
                }

                // 中景の町家（漆喰壁・格子・のれん・瓦）
                const tParaMid = 0.34;
                const tSpacingMid = 286;
                const tOffsetMid = (p * tParaMid) % tSpacingMid;
                for (let i = -2; i < CANVAS_WIDTH / tSpacingMid + 4; i++) {
                    const worldIndex = i + Math.floor((p * tParaMid) / tSpacingMid);
                    const seed = worldIndex * 7.41;
                    const x = i * tSpacingMid - tOffsetMid + this.noiseSigned(seed + 0.9) * 22;
                    
                    // 自然に配置
                    if (x < -300 || x > CANVAS_WIDTH + 300) continue;
                    
                    const w = 164 + this.noise1D(seed + 1.8) * 96;
                    const h = 128 + this.noise1D(seed + 2.5) * 98;
                    const baseY = this.groundY - 2;
                    const wallY = baseY - h;
                    const secondFloorY = wallY + h * 0.48;

                    // 下階（木部）
                    ctx.fillStyle = this.interpolateColor('#8d6f4f', '#3a2d21', 0.28);
                    ctx.fillRect(x, secondFloorY, w, baseY - secondFloorY);
                    // 上階（漆喰）
                    ctx.fillStyle = this.interpolateColor('#c8b79d', '#6d6255', 0.3);
                    ctx.fillRect(x + 6, wallY + 10, w - 12, secondFloorY - wallY - 10);

                    // 柱
                    ctx.fillStyle = this.interpolateColor('#5f442f', '#221a13', 0.32);
                    const postCount = 4 + Math.floor(this.noise1D(seed + 3.4) * 4);
                    for (let c = 0; c <= postCount; c++) {
                        const px = x + (c / postCount) * w;
                        ctx.fillRect(px - 2, wallY + 8, 4, baseY - wallY - 8);
                    }

                    // 1F格子
                    const latticeInset = 14;
                    const latticeY = secondFloorY + 14;
                    const latticeH = Math.max(30, baseY - latticeY - 10);
                    drawLattice(x + latticeInset, latticeY, Math.max(50, w - latticeInset * 2), latticeH, seed + 6.1, 0.64);

                    // 2F虫籠窓
                    const mushikoCount = 3 + Math.floor(this.noise1D(seed + 7.2) * 3);
                    for (let m = 0; m < mushikoCount; m++) {
                        const mw = 18 + this.noise1D(seed + 8.1 + m) * 8;
                        const mx = x + 18 + m * ((w - 36) / mushikoCount);
                        const my = wallY + 22 + this.noise1D(seed + 9.4 + m) * 14;
                        ctx.fillStyle = 'rgba(34, 30, 26, 0.6)';
                        ctx.fillRect(mx, my, mw, 16);
                        ctx.fillStyle = 'rgba(242, 228, 194, 0.14)';
                        ctx.fillRect(mx + 2, my + 2, mw - 4, 5);
                    }

                    // のれん
                    if (this.noise1D(seed + 10.8) > 0.34) {
                        const norenW = Math.min(74, w * 0.46);
                        const norenX = x + w * (0.24 + this.noise1D(seed + 11.7) * 0.24);
                        const norenY = secondFloorY + 8;
                        const norenH = 28 + this.noise1D(seed + 12.3) * 10;
                        ctx.fillStyle = this.interpolateColor('#405d7c', '#1e2f42', 0.28);
                        ctx.fillRect(norenX, norenY, norenW, norenH);
                        ctx.fillStyle = 'rgba(230, 236, 246, 0.24)';
                        ctx.fillRect(norenX + norenW * 0.5 - 1, norenY, 2, norenH);
                    }

                    // 提灯
                    if (this.noise1D(seed + 13.4) > 0.58) {
                        const lx = x + 14 + this.noise1D(seed + 14.2) * (w - 30);
                        const ly = secondFloorY + 10;
                        ctx.strokeStyle = 'rgba(70, 54, 40, 0.7)';
                        ctx.lineWidth = 1.4;
                        ctx.beginPath();
                        ctx.moveTo(lx, ly - 10);
                        ctx.lineTo(lx, ly);
                        ctx.stroke();
                        ctx.fillStyle = 'rgba(246, 208, 152, 0.7)';
                        ctx.beginPath();
                        ctx.ellipse(lx, ly + 8, 8, 11, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    drawKawaraRoof(x, wallY, w, 34 + this.noise1D(seed + 15.3) * 22, this.interpolateColor('#6f7382', '#2c313f', 0.52), 0.18);
                }

                // (建物ループがここで終了)
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
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;

        // 1. 路面（天面）- 他ステージと同じく全面路面に変更し、彩度を抑えた苔や土の色に変更
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#354026', '#141a0e', darken * 0.65));
        roadGrad.addColorStop(0.6, this.interpolateColor('#445232', '#1a2212', darken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#303a22', '#10150a', darken * 0.65));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        // 2. 落ち葉（パース付き） - 静的な装飾。奥に向かって密度を高める。
        const spacing = 64; // 間隔を広げて負荷軽減
        const scroll = renderProgress * 1.02;
        const start = Math.floor((scroll - 100) / spacing);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 100) / spacing);

        ctx.save();
        for (let i = start; i <= end; i++) {
            const seed = i * 7.41;
            // 1セクションあたりの枚数を抑える (45-90 -> 15-30)
            const leafCount = 15 + Math.floor(this.noise1D(seed + 3.7) * 15);
            for (let l = 0; l < leafCount; l++) {
                const ls = seed + l * 2.37;
                
                // 密度勾配: 乱数の累乗などで奥（0）に偏らせる
                // noise1D を 0.5 乗（平方根）することで 0 寄りの分布にする
                const leafDepth = Math.pow(this.noise1D(ls + 9.2), 1.6); // 1.6乗することで奥(yが小さい方)に密度を集中させる
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

        // (落下した葉っぱの描画はStage.render()内のrenderBambooFallingLeavesで行うため、ここでは削除)

        // 境界の影（壁との接地面）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, 4);
    }

    renderGroundKaido(ctx, renderProgress, darken) {
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#9a826a', '#3d2d1d', darken * 0.6));
        roadGrad.addColorStop(0.5, this.interpolateColor('#c6ad8f', '#5e4832', darken * 0.45));
        roadGrad.addColorStop(1, this.interpolateColor('#7d6b58', '#2a1f14', darken * 0.8));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        ctx.save();
        const noiseSeedBase = Math.floor(renderProgress / 110);
        for (let j = 0; j < 8; j++) {
            const leafDepth = j / 8;
            const rowY = horizonY + leafDepth * (bottomY - horizonY);
            ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * (0.4 + leafDepth * 0.6)})`;
            const rowSpeed = 0.95 + (leafDepth * 0.1);
            for (let i = 0; i < 15; i++) {
                const seed = noiseSeedBase + i * 14.2 + j * 9.7;
                const x = (i * 95 + seed * 1050 - renderProgress * rowSpeed) % (CANVAS_WIDTH + 180) - 90;
                ctx.fillRect(x, rowY + this.noise1D(seed + 1) * 3, 25 + this.noise1D(seed) * 55, 1.2);
            }
        }
        ctx.restore();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, 3);
    }

    renderGroundMountain(ctx, renderProgress, darken) {
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#5d5146', '#1a1815', darken * 0.6));
        roadGrad.addColorStop(0.5, this.interpolateColor('#7e6a59', '#3a332d', darken * 0.45));
        roadGrad.addColorStop(1, this.interpolateColor('#4a3f35', '#15120f', darken * 0.85));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        const gravelSpacing = 62;
        const scroll = renderProgress * 1.04;
        const start = Math.floor((scroll - 180) / gravelSpacing);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 180) / gravelSpacing);
        for (let i = start; i <= end; i++) {
            const seed = i * 11.27;
            const depth = this.noise1D(seed + 5.5);
            const gx = i * gravelSpacing - scroll + this.noiseSigned(seed + 0.5) * 16;
            const gy = horizonY + depth * (bottomY - horizonY);
            const r = (1.5 + depth * 6) * (1 + this.noise1D(seed + 2.6) * 0.5);
            ctx.fillStyle = this.interpolateColor('#8c7e70', '#25201c', darken * 0.8 + depth * 0.2);
            ctx.beginPath(); ctx.ellipse(gx, gy, r * 1.3, r * 0.7, this.noiseSigned(seed + 3.8) * 0.5, 0, Math.PI * 2); ctx.fill();
        }
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
        const bottomY = CANVAS_HEIGHT;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#c5b489', '#3a3324', darken * 0.7));
        roadGrad.addColorStop(0.5, this.interpolateColor('#dccd9a', '#544b36', darken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#a5966d', '#28231a', darken * 0.9));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        const tatamiWidth = 200;
        const scroll = renderProgress * 0.95;
        const start = Math.floor((scroll - 250) / tatamiWidth);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 250) / tatamiWidth);
        ctx.strokeStyle = this.interpolateColor('#2d3a24', '#0a1005', darken * 0.82);
        ctx.lineWidth = 5;
        for (let i = start; i <= end; i++) {
            const tx = i * tatamiWidth - scroll;
            const bottomX = tx - 100;
            ctx.beginPath(); ctx.moveTo(tx, horizonY); ctx.lineTo(bottomX, bottomY); ctx.stroke();
        }
        
        // 畳の目
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1;
        for (let j = 0; j < 12; j++) {
            const hy = horizonY + (j / 12) * (bottomY - horizonY);
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
                        ctx.shadowBlur = 6;
                        ctx.shadowColor = '#ff4400';
                        ctx.fillRect(x - 1, y - 1, r + 2, r + 2);
                        ctx.shadowBlur = 0;
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
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#ffd700';
                    ctx.fillRect(x, y, r, r * 8);
                    ctx.shadowBlur = 0;
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

        const drawBody = (cx, cy, r, alpha, coreTop, coreBottom, glowColor, isMoon = false) => {
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
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(this.bossSpawned ? 'BOSS!' : '', x - 12, y + 8);
    }
    
    renderBossUI(ctx) {
        if (!this.boss) return;
        
        // ボス名
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
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