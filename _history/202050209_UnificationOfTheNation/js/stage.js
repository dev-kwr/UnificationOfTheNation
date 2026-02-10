// ============================================
// Unification of the Nation - ステージ管理
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, STAGES, ENEMY_TYPES, OBSTACLE_TYPES } from './constants.js';
import { createEnemy, Ashigaru, Samurai, Busho, Ninja } from './enemy.js';
import { createBoss } from './boss.js';
import { createObstacle } from './obstacle.js';

// ステージクラス
export class Stage {
    constructor(stageNumber) {
        this.stageNumber = stageNumber;
        this.stageInfo = STAGES[stageNumber - 1];
        
        // ステージ進行
        this.progress = 0;
        this.maxProgress = 6000;  // スクロール距離拡大
        this.scrollSpeed = 2; // unused but kept
        
        // 敵管理
        this.enemies = [];
        this.spawnTimer = 1500;  // 2000ms間隔に対し最初から1.5s進めておく
        this.spawnInterval = 2000;  // 2秒ごとに敵出現
        
        // 障害物管理
        this.obstacles = [];
        this.obstacleTimer = 0;
        this.obstacleInterval = 2500;
        
        // ボス
        this.boss = null;
        this.bossSpawned = false;
        this.bossDefeated = false;
        
        // 地面
        this.groundY = CANVAS_HEIGHT - 100;
        
        // 背景レイヤー（多重スクロール）
        this.bgLayers = this.createBackgroundLayers();
        
        // ステージ固有の敵構成
        this.enemyWeights = this.getEnemyWeights();
    }
    
    getEnemyWeights() {
        // ステージごとに敵の出現確率を変える
        switch (this.stageNumber) {
            case 1:
                return { ashigaru: 80, samurai: 20, busho: 0, ninja: 0 };
            case 2:
                return { ashigaru: 60, samurai: 35, busho: 5, ninja: 0 };
            case 3:
                return { ashigaru: 40, samurai: 40, busho: 10, ninja: 10 };
            case 4:
                return { ashigaru: 35, samurai: 35, busho: 15, ninja: 15 };
            case 5:
                return { ashigaru: 20, samurai: 40, busho: 20, ninja: 20 };
            default:
                return { ashigaru: 65, samurai: 30, busho: 0, ninja: 5 };
        }
    }
    
    createBackgroundLayers() {
        // ステージごとの背景設定（薄暗い夕方・和風の哀愁ある色調）
        const backgrounds = {
            1: { // 竹林（薄暮）
                sky: ['#5F9EA0', '#2F4F4F'], // CadetBlue -> DarkSlateGray (夕暮れの竹林)
                far: '#1a332a', 
                mid: '#2b4d3b', 
                near: '#3c664c', 
                elements: 'bamboo'
            },
            2: { // 山道（茜色の夕焼け）
                sky: ['#B22222', '#2F0000'], // FireBrick -> DarkRed (深い赤〜黒)
                far: '#2a0a0a', 
                mid: '#3a1a1a', 
                near: '#4a2a2a', 
                elements: 'mountain'
            },
            3: { // 城下町（宵の口）
                sky: ['#483D8B', '#191970'], // DarkSlateBlue -> MidnightBlue
                far: '#1a1a2a', 
                mid: '#2a2a3a', 
                near: '#3a3a4a', 
                elements: 'town'
            },
            4: { // 城内（夜）
                sky: ['#000033', '#000000'], // 濃紺〜黒
                far: '#202020', 
                mid: '#303030',
                near: '#404040', 
                elements: 'castle'
            },
            5: { // 天守閣（月夜）
                sky: ['#000080', '#000020'], // Navy
                far: '#101030',
                mid: '#202040',
                near: '#303050',
                elements: 'tenshu'
            }
        };
        
        return backgrounds[this.stageNumber] || backgrounds[1];
    }
    
    update(deltaTime, player) {
        // ボス戦中はスクロールしない
        if (this.bossSpawned && !this.bossDefeated) {
            this.updateBossFight(deltaTime, player);
            return;
        }
        
        // 敵出現（スクロール位置に関係なく判定）
        this.spawnTimer += deltaTime * 1000;
        if (this.spawnTimer >= this.spawnInterval && this.progress < this.maxProgress * 0.98) {
            this.spawnEnemy();
            this.spawnTimer = 0;
            
            // 進行に応じて出現間隔を短く (基本1500ms -> 終盤600ms)
            // ランダム要素を追加して単調さをなくす
            const progressRatio = this.progress / this.maxProgress;
            const baseInterval = 1500 - (progressRatio * 900); 
            this.spawnInterval = baseInterval + Math.random() * 500;
        }
        
        // 中ボス出現（進行50%地点）
        if (this.progress >= this.maxProgress * 0.5 && 
            this.progress < this.maxProgress * 0.55 &&
            !this.enemies.some(e => e.type === ENEMY_TYPES.BUSHO)) {
            this.spawnMidBoss();
        }
        
        // ボス出現
        if (this.progress >= this.maxProgress && !this.bossSpawned) {
            this.spawnBoss();
        }
        
        // 障害物出現
        this.obstacleTimer += deltaTime * 1000;
        if (this.obstacleTimer >= this.obstacleInterval && this.progress < this.maxProgress * 0.98) {
             this.spawnObstacle();
             this.obstacleTimer = 0;
             this.obstacleInterval = 2000 + Math.random() * 2000; // 2~4秒間隔
        }
        
        // 敵更新
        const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
        this.updateEnemies(deltaTime, player, activeObstacles);
        this.updateObstacles(deltaTime);
    }
    
    updateBossFight(deltaTime, player) {
        // ボス更新
        if (this.boss) {
            const shouldRemove = this.boss.update(deltaTime, player);
            if (shouldRemove || !this.boss.isAlive) {
                if (!this.boss.isAlive) {
                    this.bossDefeated = true;
                }
            }
        }
        
        // 残りの雑魚敵も更新
        const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
        this.updateEnemies(deltaTime, player, activeObstacles);
    }
    
    updateEnemies(deltaTime, player, obstacles = []) {
        // 敵を更新し、削除すべきものをフィルタ
        this.enemies = this.enemies.filter(enemy => {
            const shouldRemove = enemy.update(deltaTime, player, obstacles);
            return !shouldRemove;
        });
    }
    
    spawnEnemy() {
        // 一度に湧く数 (30%の確率で複数体出現)
        // 終盤ほど複数出現しやすくしてもよいが、まずはランダムで
        const count = Math.random() < 0.3 ? (Math.random() < 0.5 ? 2 : 3) : 1;
        
        for (let i = 0; i < count; i++) {
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
            // 30%の確率で左（背後）から出現
            const comeFromLeft = Math.random() < 0.3;
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
        const y = this.groundY - 75;
        const midBoss = createEnemy(ENEMY_TYPES.BUSHO, x, y, this.groundY);
        midBoss.hp *= 1.5;
        midBoss.maxHp *= 1.5;
        this.enemies.push(midBoss);
    }

    spawnObstacle() {
        // 30%の確率で出現
        if (Math.random() > 0.3) return;
        
        const type = Math.random() < 0.5 ? OBSTACLE_TYPES.SPIKE : OBSTACLE_TYPES.ROCK;
        
        // 画面外（右側）から出現
        const x = this.progress + CANVAS_WIDTH + 50 + Math.random() * 100;
        const obstacle = createObstacle(type, x, this.groundY);
        
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
        // スクロール位置を考慮してボスを配置
        const x = this.progress + CANVAS_WIDTH - 150;
        const y = this.groundY - 90;
        this.boss = createBoss(this.stageNumber, x, y, this.groundY);
        
        // BGM切り替え
        import('./audio.js').then(({ audio }) => {
            audio.playBgm('boss');
        });
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
        
        // ステージ進捗バー
        this.renderProgressBar(ctx);
    }
    
    renderBackground(ctx) {
        const layers = this.bgLayers;
        
        // ボス戦中は赤みがかった空に変化
        let skyColors = layers.sky;
        if (this.bossSpawned && !this.bossDefeated) {
            // 赤みをパルスさせる
            const pulse = 0.3 + Math.sin(Date.now() * 0.002) * 0.1;
            skyColors = [`rgba(80, 20, 20, ${pulse})`, `rgba(40, 10, 10, ${pulse})`];
            
            // 暗いオーバーレイ
            ctx.fillStyle = 'rgba(50, 0, 0, 0.3)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
        }
        
        // 空グラデーション
        const skyGradient = ctx.createLinearGradient(0, 0, 0, this.groundY);
        skyGradient.addColorStop(0, skyColors[0]);
        skyGradient.addColorStop(1, skyColors[1]);
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
        
        // ボス戦中は稲妻効果
        if (this.bossSpawned && !this.bossDefeated && Math.random() < 0.01) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        
        // 遠景（ゆっくりスクロール）
        this.renderBackgroundLayer(ctx, layers.far, 0.2, 0.7);
        
        // 中景
        this.renderBackgroundLayer(ctx, layers.mid, 0.5, 0.5);
        
        // 近景
        this.renderBackgroundLayer(ctx, layers.near, 0.8, 0.3);
        
        // ステージ固有の背景要素
        this.renderStageElements(ctx);
    }
    
    renderBackgroundLayer(ctx, color, parallax, alpha) {
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        
        const offset = (this.progress * parallax) % 200;
        
        // 背景の山や建物をシルエットで表現
        for (let i = -1; i < CANVAS_WIDTH / 200 + 2; i++) {
            const x = i * 200 - offset;
            const height = 80 + Math.sin(i * 0.7) * 40;
            
            ctx.beginPath();
            ctx.moveTo(x, this.groundY);
            ctx.lineTo(x + 50, this.groundY - height);
            ctx.lineTo(x + 100, this.groundY - height * 0.6);
            ctx.lineTo(x + 150, this.groundY - height * 0.8);
            ctx.lineTo(x + 200, this.groundY);
            ctx.closePath();
            ctx.fill();
        }
        
        ctx.globalAlpha = 1;
    }
    
    renderStageElements(ctx) {
        const p = this.progress;
        
        switch (this.bgLayers.elements) {
            case 'bamboo':
                // 竹林（無限スクロール対応）
                ctx.strokeStyle = '#3a5a3a';
                ctx.lineWidth = 12;
                const bambooSpacing = 150;
                const bPara = 0.8; 
                const bStartIdx = Math.floor((p * bPara - 100) / bambooSpacing);
                const bEndIdx = Math.ceil((CANVAS_WIDTH + p * bPara + 100) / bambooSpacing);
                
                for (let i = bStartIdx; i <= bEndIdx; i++) {
                    const x = i * bambooSpacing - p * bPara;
                    if (x < -100 || x > CANVAS_WIDTH + 100) continue;
                    
                    const h = 200 + Math.abs(Math.sin(i * 1324.5)) * 100;
                    ctx.beginPath();
                    ctx.moveTo(x, this.groundY);
                    ctx.lineTo(x, this.groundY - h);
                    ctx.stroke();
                    
                    for (let j = 1; j < 5; j++) {
                        ctx.beginPath();
                        ctx.arc(x, this.groundY - j * (h / 6), 5, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    
                    ctx.fillStyle = '#2a4a2a';
                    for (let k = 0; k < 3; k++) {
                        ctx.beginPath();
                        ctx.ellipse(x + (k % 2 === 0 ? 20 : -20), this.groundY - h + k * 40, 20, 8, Math.PI / 4 * (k % 2 === 0 ? 1 : -1), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                // 月（固定）
                ctx.fillStyle = '#ffffcc';
                ctx.globalAlpha = 0.8;
                ctx.beginPath();
                ctx.arc(200, 100, 40, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                break;
                
            case 'mountain':
                // 遠くの山（ループ描画）
                ctx.fillStyle = '#4a4a6a';
                const mPara = 0.1;
                const mWidth = 800;
                const mOffset = (p * mPara) % mWidth;
                
                for (let i = 0; i < 3; i++) {
                    const xBase = i * mWidth - mOffset;
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(xBase, this.groundY);
                    ctx.lineTo(xBase + 300, 100);
                    ctx.lineTo(xBase + 600, this.groundY);
                    ctx.fill();
                    
                    ctx.beginPath();
                    ctx.moveTo(xBase + 400, this.groundY);
                    ctx.lineTo(xBase + 800, 150);
                    ctx.lineTo(xBase + 1000, this.groundY);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
                
            case 'town':
                // 建物シルエット（遠景・ループ）
                const tParaFar = 0.15;
                const tSpacingFar = 140;
                const tOffsetFar = (p * tParaFar) % tSpacingFar;
                ctx.fillStyle = '#1a1a2a';
                for (let i = -1; i < CANVAS_WIDTH / tSpacingFar + 2; i++) {
                    const x = i * tSpacingFar - tOffsetFar;
                    const h = 50 + Math.abs(Math.sin((Math.floor(p * tParaFar / tSpacingFar) + i) * 0.8)) * 30;
                    ctx.fillRect(x, this.groundY - h, 80, h);
                }
                
                // 建物シルエット（中景・ループ）
                const tParaMid = 0.3;
                const tSpacingMid = 250;
                const tOffsetMid = (p * tParaMid) % tSpacingMid;
                ctx.fillStyle = '#2a2a3a';
                for (let i = -1; i < CANVAS_WIDTH / tSpacingMid + 2; i++) {
                    const x = i * tSpacingMid - tOffsetMid;
                    const idx = Math.floor(p * tParaMid / tSpacingMid) + i;
                    const h = 100 + (Math.abs(idx) % 3) * 40;
                    ctx.fillRect(x, this.groundY - h, 140, h);
                    
                    // 屋根
                    ctx.beginPath();
                    ctx.moveTo(x - 20, this.groundY - h);
                    ctx.lineTo(x + 70, this.groundY - h - 50);
                    ctx.lineTo(x + 160, this.groundY - h);
                    ctx.fill();
                    
                    // 窓
                    ctx.fillStyle = 'rgba(255, 220, 100, 0.4)';
                    ctx.fillRect(x + 30, this.groundY - h + 25, 35, 35);
                    ctx.fillRect(x + 85, this.groundY - h + 25, 35, 35);
                    ctx.fillStyle = '#2a2a3a';
                }
                break;

            case 'castle':
                // 城内の背景
                ctx.fillStyle = '#4c3c1c';
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
                
                // 金の雲（ループ）
                const cParaCloud = 0.2;
                const cSpacingCloud = 300;
                const cOffsetCloud = (p * cParaCloud) % cSpacingCloud;
                ctx.fillStyle = 'rgba(212, 175, 55, 0.3)';
                for (let i = -1; i < CANVAS_WIDTH / cSpacingCloud + 2; i++) {
                    const x = i * cSpacingCloud - cOffsetCloud;
                    ctx.beginPath();
                    ctx.ellipse(x + 150, 150 + (Math.abs(i) % 4) * 40, 120, 40, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // 柱および障子
                const cParaPillar = 0.5;
                const cSpacingPillar = 250;
                const cOffsetPillar = (p * cParaPillar) % cSpacingPillar;
                for (let i = -1; i < CANVAS_WIDTH / cSpacingPillar + 2; i++) {
                    const x = i * cSpacingPillar - cOffsetPillar;
                    
                    // 襖/障子
                    ctx.strokeStyle = '#4a3030';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 50, this.groundY - 150, 120, 140);
                    ctx.beginPath();
                    ctx.moveTo(x + 110, this.groundY - 150);
                    ctx.lineTo(x + 110, this.groundY - 10);
                    ctx.stroke();

                    // 柱
                    ctx.fillStyle = '#2a1a0a';
                    ctx.fillRect(x, 0, 40, this.groundY);
                }
                break;

            case 'tenshu':
                // 天守閣
                ctx.fillStyle = '#050510';
                ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
                
                // 巨大な月（固定）
                ctx.fillStyle = '#ffffcc';
                ctx.shadowBlur = 50;
                ctx.shadowColor = '#ffffaa';
                ctx.beginPath();
                ctx.arc(CANVAS_WIDTH - 300, 180, 120, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                
                // 遠景の山（固定シルエット）
                ctx.fillStyle = '#0a0a20';
                ctx.beginPath();
                ctx.moveTo(0, this.groundY);
                ctx.lineTo(400, 200);
                ctx.lineTo(800, this.groundY);
                ctx.fill();
                
                // 装飾（星/光の粉）
                ctx.fillStyle = '#FFD700';
                ctx.globalAlpha = 0.3;
                for (let i = 0; i < 15; i++) {
                    const x = ((Math.sin(i) * 1000 + p * 0.05) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
                    const y = 50 + i * 30;
                    ctx.beginPath();
                    ctx.arc(x, y, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;

                // 欄干（ループ）
                const tParaRail = 1.0;
                const tSpacingRail = 80;
                const tOffsetRail = (p * tParaRail) % tSpacingRail;
                ctx.fillStyle = '#400';
                ctx.fillRect(0, this.groundY - 60, CANVAS_WIDTH, 20);
                for (let i = -1; i < CANVAS_WIDTH / tSpacingRail + 1; i++) {
                    ctx.fillRect(i * tSpacingRail - tOffsetRail, this.groundY - 60, 10, 60);
                }
                break;
        }
    }
    
    renderGround(ctx) {
        // 地面背景
        const groundGradient = ctx.createLinearGradient(0, this.groundY, 0, CANVAS_HEIGHT);
        groundGradient.addColorStop(0, '#4a3a2a');
        groundGradient.addColorStop(1, '#2a1a0a');
        ctx.fillStyle = groundGradient;
        ctx.fillRect(0, this.groundY, CANVAS_WIDTH, CANVAS_HEIGHT - this.groundY);
        
        // 地面の模様（スクロール連動）
        // これがないと移動しているように見えない
        // Math.floor を適用して、ワールド座標の translate と同期させる（フラッシング防止）
        const offset = Math.floor(this.progress) % 200;
        
        // 模様1: 斜めの影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        for (let i = -1; i < CANVAS_WIDTH / 200 + 2; i++) {
            const x = i * 200 - offset;
            ctx.beginPath();
            ctx.moveTo(x, this.groundY);
            ctx.lineTo(x - 50, CANVAS_HEIGHT);
            ctx.lineTo(x - 20, CANVAS_HEIGHT);
            ctx.lineTo(x + 30, this.groundY);
            ctx.fill();
        }
        
        // 模様2: 小石や草
        ctx.fillStyle = '#3a2a1a';
        for (let i = -1; i < CANVAS_WIDTH / 100 + 2; i++) {
            const x = i * 100 - (this.progress % 100);
            if (i % 2 === 0) {
                // 小石
                ctx.beginPath();
                ctx.arc(x + 40, this.groundY + 20, 5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // 草っぽいもの
                ctx.beginPath();
                ctx.moveTo(x + 20, this.groundY);
                ctx.lineTo(x + 25, this.groundY - 10);
                ctx.lineTo(x + 30, this.groundY);
                ctx.fill();
            }
        }
        
        // 地面の境界線
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(CANVAS_WIDTH, this.groundY);
        ctx.stroke();
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
        const y = 20;
        
        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // 進捗
        const progress = Math.min(this.progress / this.maxProgress, 1);
        ctx.fillStyle = this.bossSpawned ? '#f44' : '#4af';
        ctx.fillRect(x, y, barWidth * progress, barHeight);
        
        // ラベル
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(this.bossSpawned ? 'BOSS!' : '', x - 10, y + 8);
    }
    
    renderBossUI(ctx) {
        if (!this.boss) return;
        
        // ボス名
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.boss.bossName, CANVAS_WIDTH / 2, 50);
        
        // HPバー
        const barWidth = 400;
        const barHeight = 12;
        const x = (CANVAS_WIDTH - barWidth) / 2;
        const y = 60;
        
        ctx.fillStyle = '#400';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        ctx.fillStyle = '#f44';
        ctx.fillRect(x, y, barWidth * (this.boss.hp / this.boss.maxHp), barHeight);
        
        // フェーズ表示
        if (this.boss.phase > 1) {
            ctx.fillStyle = '#ff0';
            ctx.font = '14px sans-serif';
            ctx.fillText(`Phase ${this.boss.phase}`, CANVAS_WIDTH / 2, y + 30);
        }
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
        return this.bossSpawned && this.bossDefeated;
    }
}
