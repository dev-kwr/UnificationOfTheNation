// ============================================
// Unification of the Nation - ステージ管理
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, STAGES, ENEMY_TYPES, OBSTACLE_TYPES } from './constants.js?v=41';
import { createEnemy, Ashigaru, Samurai, Busho, Ninja } from './enemy.js?v=41';
import { createBoss } from './boss.js?v=41';
import { createObstacle } from './obstacle.js?v=41';
import { audio } from './audio.js?v=41';

// ステージクラス
export class Stage {
    constructor(stageNumber) {
        this.stageNumber = stageNumber;
        this.stageInfo = STAGES[stageNumber - 1];
        this.name = this.stageInfo ? this.stageInfo.name : '';
        
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
        this.bossDefeatLingerDuration = 700;
        this.bossDefeatLingerTimer = 0;
        this.bossDefeatColorFade = 0; // ボス撃破後の赤い空のフェードアウト用（1→0）
        
        // 地面
        this.groundY = Math.round(CANVAS_HEIGHT * (2 / 3));
        
        // 背景レイヤー（多重スクロール）
        this.bgLayers = this.createBackgroundLayers();
        
        // ステージ固有の敵構成
        this.enemyWeights = this.getEnemyWeights();
        this.maxActiveEnemies = this.getMaxActiveEnemies();
        this.stageTime = 0;
        this.skyParticles = this.createSkyParticles(18);
        this.bossIntroDurationByStage = {
            1: 1300,
            2: 1400,
            3: 1500,
            4: 1700,
            5: 2100
        };
        this.bossIntroDuration = this.bossIntroDurationByStage[this.stageNumber] || 1500;
        this.bossIntroTimer = 0;
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

    getMaxActiveEnemies() {
        switch (this.stageNumber) {
            case 1: return 6;
            case 2: return 7;
            case 3: return 8;
            case 4: return 9;
            case 5: return 10;
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
        this.stageTime += deltaTime * 1000;
        if (this.bossIntroTimer > 0) {
            this.bossIntroTimer = Math.max(0, this.bossIntroTimer - deltaTime * 1000);
        }

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
        // ボス登場演出中はボス本体を一時停止して舞台演出を見せる
        if (this.bossIntroTimer > 0) {
            if (this.boss) {
                this.boss.isAttacking = false;
                this.boss.vx = 0;
                this.boss.attackCooldown = Math.max(this.boss.attackCooldown || 0, this.bossIntroTimer);
            }
            const activeObstacles = this.obstacles.filter(o => !o.isDestroyed);
            this.updateEnemies(deltaTime, player, activeObstacles);
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

        // 一度に湧く数 (30%の確率で複数体出現)
        // 終盤ほど複数出現しやすくしてもよいが、まずはランダムで
        const count = Math.random() < 0.3 ? (Math.random() < 0.5 ? 2 : 3) : 1;
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
        this.bossIntroTimer = this.bossIntroDuration;
        this.bossDefeatLingerTimer = 0;
        
        // BGM切り替え
        audio.playBgm('boss', this.stageNumber);
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
        const time = this.stageTime * 0.001;
        const bossIntroRatio = (this.bossIntroTimer > 0)
            ? (this.bossIntroTimer / this.bossIntroDuration)
            : 0;
        
        // ボス戦中は赤みがかった空に変化（撃破後はフェードアウト）
        let skyColors = layers.sky;
        const bossColorActive = this.bossSpawned && !this.bossDefeated;
        const bossColorFading = this.bossSpawned && this.bossDefeated && this.bossDefeatColorFade > 0;
        if (bossColorActive || bossColorFading) {
            const fadeIntensity = bossColorActive ? 1.0 : this.bossDefeatColorFade;
            // 赤みをパルスさせる
            const pulse = (0.45 + Math.sin(this.stageTime * 0.003) * 0.08) * fadeIntensity;
            skyColors = [`rgba(80, 20, 20, ${pulse})`, `rgba(40, 10, 10, ${pulse})`];
        }
        
        // 空グラデーション
        const skyGradient = ctx.createLinearGradient(0, 0, 0, this.groundY);
        skyGradient.addColorStop(0, skyColors[0]);
        skyGradient.addColorStop(1, skyColors[1]);
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

        if (bossColorActive || bossColorFading) {
            const fadeIntensity = bossColorActive ? 1.0 : this.bossDefeatColorFade;
            const pulse = 0.55 + Math.sin(this.stageTime * 0.003) * 0.12;
            ctx.fillStyle = `rgba(56, 4, 12, ${(0.18 + pulse * 0.14) * fadeIntensity})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
        }

        this.renderSkyParticles(ctx, time);

        // 地平線の薄い霞
        const haze = ctx.createLinearGradient(0, this.groundY - 120, 0, this.groundY + 20);
        haze.addColorStop(0, 'rgba(255,255,255,0)');
        haze.addColorStop(1, 'rgba(190,210,255,0.08)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, this.groundY - 120, CANVAS_WIDTH, 150);
        
        // ボス戦中は稲妻効果（撃破後はフェードアウト）
        const lightningActive = this.bossSpawned && !this.bossDefeated;
        const lightningFading = this.bossSpawned && this.bossDefeated && this.bossDefeatColorFade > 0.5;
        if ((lightningActive || lightningFading) && Math.sin(this.stageTime * 0.012) > 0.992) {
            const lIntensity = lightningActive ? 0.3 : (this.bossDefeatColorFade - 0.5) * 0.6;
            ctx.fillStyle = `rgba(255, 255, 255, ${lIntensity})`;
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

        // ボス登場の瞬間演出は前面寄りに描いて、どのステージでも視認できるようにする
        if (bossIntroRatio > 0) {
            this.renderBossStageShift(ctx, bossIntroRatio);
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

    renderBossStageShift(ctx, remainingRatio) {
        const t = 1 - remainingRatio;
        const introStrength = 0.55 + t * 0.45;
        const pulse = 0.5 + Math.sin(this.stageTime * 0.022) * 0.5;
        const bossFocusX = CANVAS_WIDTH * 0.74;
        const bossFocusY = this.groundY * 0.5;
        const paletteByStage = {
            1: { top: '18, 30, 24', bottom: '64, 30, 22', line: '255, 170, 110', ring: '255, 215, 165', band: '108, 34, 22' },
            2: { top: '26, 14, 14', bottom: '84, 16, 12', line: '255, 124, 96', ring: '255, 194, 148', band: '130, 14, 12' },
            3: { top: '14, 16, 34', bottom: '62, 22, 40', line: '198, 150, 255', ring: '220, 196, 255', band: '92, 16, 58' },
            4: { top: '10, 12, 20', bottom: '52, 28, 18', line: '255, 170, 102', ring: '255, 206, 146', band: '112, 22, 16' },
            5: { top: '38, 4, 26', bottom: '95, 8, 18', line: '255, 166, 110', ring: '255, 220, 164', band: '146, 12, 30' }
        };
        const palette = paletteByStage[this.stageNumber] || paletteByStage[5];

        // 空を一気に闇へ寄せる
        const fade = ctx.createLinearGradient(0, 0, 0, this.groundY);
        fade.addColorStop(0, `rgba(${palette.top}, ${(0.28 + t * 0.14) * introStrength})`);
        fade.addColorStop(1, `rgba(${palette.bottom}, ${(0.34 + t * 0.18) * introStrength})`);
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);

        // 集中線（時空が歪む感じ）
        ctx.strokeStyle = `rgba(${palette.line}, ${(0.22 + pulse * 0.2) * introStrength})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 16; i++) {
            const a = i * (Math.PI * 2 / 16) + this.stageTime * 0.001;
            const inner = 24 + pulse * 10;
            const outer = 260 + (i % 3) * 48;
            ctx.beginPath();
            ctx.moveTo(bossFocusX + Math.cos(a) * inner, bossFocusY + Math.sin(a) * inner);
            ctx.lineTo(bossFocusX + Math.cos(a) * outer, bossFocusY + Math.sin(a) * outer);
            ctx.stroke();
        }

        // 光輪の拡大
        ctx.strokeStyle = `rgba(${palette.ring}, ${(0.52 - t * 0.18) * introStrength})`;
        ctx.lineWidth = 5;
        for (let i = 0; i < 2; i++) {
            const radius = 52 + i * 44 + t * 130;
            ctx.beginPath();
            ctx.arc(bossFocusX, bossFocusY, radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 地平線の赤い圧
        ctx.fillStyle = `rgba(${palette.band}, ${(0.3 + pulse * 0.2) * introStrength})`;
        ctx.fillRect(0, this.groundY - 70, CANVAS_WIDTH, 70);
    }
    
    renderBackgroundLayer(ctx, color, parallax, alpha) {
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        
        const offset = (this.progress * parallax) % 200;
        
        // 背景の山や建物をシルエットで表現
        for (let i = -1; i < CANVAS_WIDTH / 200 + 2; i++) {
            const x = i * 200 - offset;
            const worldIndex = i + Math.floor((this.progress * parallax) / 200);
            const heightA = 70 + Math.sin(worldIndex * 0.71) * 28 + Math.cos(worldIndex * 1.17) * 18;
            const heightB = 52 + Math.sin(worldIndex * 1.03 + 1.4) * 20;
            const heightC = 65 + Math.cos(worldIndex * 0.67 + 0.7) * 22;
            
            ctx.beginPath();
            ctx.moveTo(x, this.groundY);
            ctx.lineTo(x + 45, this.groundY - heightA);
            ctx.lineTo(x + 95, this.groundY - heightB);
            ctx.lineTo(x + 150, this.groundY - heightC);
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
                // 空レイヤーを完全上書きするとボス登場演出が見えなくなるため、半透明で重ねる
                const tenshuOverlay = ctx.createLinearGradient(0, this.groundY * 0.12, 0, this.groundY);
                tenshuOverlay.addColorStop(0, 'rgba(5, 5, 16, 0.08)');
                tenshuOverlay.addColorStop(1, 'rgba(5, 5, 16, 0.42)');
                ctx.fillStyle = tenshuOverlay;
                ctx.fillRect(0, this.groundY * 0.08, CANVAS_WIDTH, this.groundY * 0.92);
                
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
        const renderProgress = Math.floor(this.progress);
        const wrapOffset = (value, spacing) => ((value % spacing) + spacing) % spacing;

        // 地面背景
        const groundGradient = ctx.createLinearGradient(0, this.groundY, 0, CANVAS_HEIGHT);
        const stageGroundTop = ['#4a3a2a', '#5a3b2a', '#46372d', '#3d332f', '#2f2d35'];
        const stageGroundBottom = ['#2a1a0a', '#2f1a10', '#2a1f1a', '#241f1c', '#1c1a22'];
        const groundIdx = Math.max(0, Math.min(stageGroundTop.length - 1, this.stageNumber - 1));
        groundGradient.addColorStop(0, stageGroundTop[groundIdx]);
        groundGradient.addColorStop(1, stageGroundBottom[groundIdx]);
        ctx.fillStyle = groundGradient;
        ctx.fillRect(0, this.groundY, CANVAS_WIDTH, CANVAS_HEIGHT - this.groundY);
        
        // 地面の模様（スクロール連動）
        
        // 模様1: フラット2D寄りの帯パターン（ワールド固定で滑らかに）
        const bandSpacing = 120;
        const bandParallax = 0.6;
        const bandScroll = renderProgress * bandParallax;
        const bandOffset = wrapOffset(bandScroll, bandSpacing);
        const bandCount = Math.ceil(CANVAS_WIDTH / bandSpacing) + 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        for (let row = 0; row < 3; row++) {
            const y = this.groundY + 12 + row * 24;
            for (let i = -2; i < bandCount; i++) {
                const shift = (row % 2) * 18;
                const x = Math.round(i * bandSpacing - bandOffset + shift);
                ctx.fillRect(x, y, 56, 8);
            }
        }
        
        // 模様2: 小石や草（画面基準ではなくワールド基準で配置）
        const debrisSpacing = 100;
        const debrisParallax = 1.0;
        const debrisScroll = renderProgress * debrisParallax;
        const debrisStart = Math.floor(debrisScroll / debrisSpacing) - 2;
        const debrisCount = Math.ceil(CANVAS_WIDTH / debrisSpacing) + 5;
        ctx.fillStyle = 'rgba(58, 42, 26, 0.9)';
        for (let i = 0; i < debrisCount; i++) {
            const worldIndex = debrisStart + i;
            const x = Math.round(worldIndex * debrisSpacing - debrisScroll);
            if (Math.abs(worldIndex) % 2 === 0) {
                // 小石
                ctx.beginPath();
                ctx.arc(x + 40, this.groundY + 20, 4, 0, Math.PI * 2);
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

        // 接地面の反射ハイライト
        ctx.strokeStyle = 'rgba(255, 220, 170, 0.18)';
        ctx.lineWidth = 1;
        const highlightSpacing = 140;
        const highlightParallax = 0.8;
        const highlightScroll = renderProgress * highlightParallax;
        const highlightStart = Math.floor(highlightScroll / highlightSpacing) - 2;
        const highlightCount = Math.ceil(CANVAS_WIDTH / highlightSpacing) + 5;
        for (let i = 0; i < highlightCount; i++) {
            const worldIndex = highlightStart + i;
            const x = Math.round(worldIndex * highlightSpacing - highlightScroll);
            ctx.beginPath();
            ctx.moveTo(x + 12, this.groundY + 6);
            ctx.lineTo(x + 44, this.groundY + 6);
            ctx.stroke();
        }
        
        // 地面の境界線
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(CANVAS_WIDTH, this.groundY);
        ctx.stroke();
    }

    renderSkyParticles(ctx, time) {
        // 夜系ステージのみ、控えめな瞬き粒子を追加
        if (this.stageNumber < 3) return;
        for (const particle of this.skyParticles) {
            const x = particle.nx * CANVAS_WIDTH;
            const y = 20 + particle.ny * (this.groundY * 0.55);
            const twinkle = 0.3 + Math.sin(time * particle.speed + particle.phase) * 0.2;
            ctx.fillStyle = `rgba(255, 245, 210, ${Math.max(0.08, twinkle)})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
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
        return this.bossSpawned && this.bossDefeated && this.bossDefeatLingerTimer <= 0;
    }
}
