// ============================================
// Unification of the Nation - ステージ管理
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, STAGES, ENEMY_TYPES, OBSTACLE_TYPES, LANE_OFFSET, STAGE5_FLOOR, STAGE6_CORNER } from './constants.js';
import { createEnemy } from './enemy.js?v=20260630-castle-ai';
import { createBoss } from './boss.js?v=20260630-castle-ai';
import { createObstacle } from './obstacle.js';
import { audio } from './audio.js';
import { generateStairsCanvas } from './stairRenderer.js';

const OBSTACLE_CHANCE_BOOST = 0.8;
// Stage1地面タイルの描画幅1206pxに合わせ、worldX=9648で位相0から接続する。
const STAGE1_GROUND_TRANSITION_LENGTH = 2352;
const STAGE1_BAMBOO_TREE_LINE_OFFSET = 1020;
const STAGE1_FENCE_END_OFFSET = 12;
const STAGE1_BOSS_SUN_HOUR = 8.25;

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
            this.transitionFadeMs = STAGE5_FLOOR.TRANSITION_FADE_MS;
            this.transitionWaitMs = STAGE5_FLOOR.TRANSITION_WAIT_MS;
            this.transitionFadeInMs = STAGE5_FLOOR.TRANSITION_FADEIN_MS;
            this.floorTransitionTotalMs = this.transitionFadeMs + this.transitionWaitMs + this.transitionFadeInMs;
            // 前フロアから登ってきた階段を表示するか
            this.showPreviousStair = false;
            this.previousStairDirection = 0; // 前フロアの方向
            // フロア名表示
            this.floorNameDisplayTimer = 0;
            this.floorNameDisplayDuration = 1800; // ms
        } else {
            // 最終ステージは天守外周を4区間に分けて巡るため、通常ステージの2倍。
            this.maxProgress = this.stageNumber === 6 ? 24000 : 12000;
            this.currentFloor = 0;
            this.floorScrollDirection = 1;
        }

        // --- Stage 6 螺旋回廊（廻縁）---
        // 各ゾーン=1つの重の廻縁。角(ゾーン境界)の隅櫓で1段登る。
        if (this.stageNumber === 6) {
            this.baseGroundY = Math.round(CANVAS_HEIGHT * (2 / 3));
            this.cornersClimbed = 0;        // 登り済みの角の数 = 現在ゾーンindex(0〜3)
            this.lastClimbedCornerX = 0;
            this.isFloorTransitioning = false;
            this.floorTransitionTimer = 0;
            this.floorTransitionPhase = 0;
            this.transitionFadeMs = STAGE6_CORNER.TRANSITION_FADE_MS;
            this.transitionWaitMs = STAGE6_CORNER.TRANSITION_WAIT_MS;
            this.transitionFadeInMs = STAGE6_CORNER.TRANSITION_FADEIN_MS;
            this.floorTransitionTotalMs = this.transitionFadeMs + this.transitionWaitMs + this.transitionFadeInMs;
            // 階層カードは出さない（背景の高度進行で語る方針）
            this.floorNameDisplayDuration = 1;
            this.floorNameDisplayTimer = 0;
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

        // P3 空補償: 可視ワールド上端(論理px)。game.renderPlaying が世界ズームwrap確定後に
        // 毎フレーム設定する。z=1 端末では常に 0 = 従来描画と完全一致。
        this.skyVisTop = 0;
        
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

        // --- Stage 1/2 地面画像 ---
        if (this.stageNumber === 1) {
            this.stage1GroundImage = new Image();
            this.stage1GroundImage.src = 'images/stage1_ground_bamboo_tile.png?v=20260707_ground2';
            this.stage1BambooBackLayerImage = new Image();
            this.stage1BambooBackLayerImage.src = 'images/stage1_bamboo_back_layer.png?v=20260712_opaque1';
            this.stage1BambooMidLayerImage = new Image();
            this.stage1BambooMidLayerImage.src = 'images/stage1_bamboo_mid_layer_v2.png?v=20260712_opaque1';
            this.stage1BambooFrontLayerImage = new Image();
            this.stage1BambooFrontLayerImage.src = 'images/stage1_bamboo_front_layer.png?v=20260712_opaque1';
            this.stage1BambooRootScreenImage = new Image();
            this.stage1BambooRootScreenImage.src = 'images/stage1_bamboo_root_screen.png?v=20260707_root1';
            this.stage1GroundToKaidoImage = new Image();
            this.stage1GroundToKaidoImage.src = 'images/stage1_ground_to_kaido.png?v=20260710_edge4';
        }
        if (this.stageNumber === 2) {
            this.stage2GroundImage = new Image();
            this.stage2GroundImage.src = 'images/stage2_ground_kaido_tile.png';
            this.stage2MountainBackImage = new Image();
            this.stage2MountainBackImage.decoding = 'async';
            this.stage2MountainBackImage.loading = 'eager';
            this.stage2MountainBackImage.src = 'images/stage2_mountain_back_wall.png';
            this.stage2MountainBackImage.decode?.().catch(() => {});
            this.stage2MountainPassImage = new Image();
            this.stage2MountainPassImage.decoding = 'async';
            this.stage2MountainPassImage.loading = 'eager';
            this.stage2MountainPassImage.src = 'images/stage2_mountain_pass_wall.png';
            this.stage2MountainPassImage.decode?.().catch(() => {});
            this.stage2PropImages = {};
            const stage2PropPaths = {
                ruralFarmhouse: 'images/stage2_rural_farmhouse_clean.png',
                ruralTeahouse: 'images/stage2_rural_teahouse_clean.png',
                ruralShed: 'images/stage2_rural_shed_clean.png',
                ruralShrine: 'images/stage2_rural_shrine.png',
                cleanLowFence: 'images/stage2_prop_clean_low_fence.png?v=20260706_front1',
                cleanStrawBundles: 'images/stage2_prop_clean_straw_bundles.png?v=20260706_front1',
                cleanJars: 'images/stage2_prop_clean_jars.png?v=20260706_front1',
                cleanStoneWell: 'images/stage2_prop_clean_stone_well.png?v=20260706_front1',
                cleanWoodSignpost: 'images/stage2_prop_clean_wood_signpost.png?v=20260706_front1',
                cleanGrassClump: 'images/stage2_prop_clean_grass_clump.png?v=20260706_front1',
                cleanJizo: 'images/stage2_prop_clean_jizo.png?v=20260706_front1'
            };
            for (const [key, src] of Object.entries(stage2PropPaths)) {
                const image = new Image();
                image.src = src;
                this.stage2PropImages[key] = image;
            }
        }

        // --- Stage 3 山道添景画像 ---
        if (this.stageNumber === 3) {
            this.stage3ExitImage = new Image();
            this.stage3ExitImage.src = 'images/stage3_mountain_exit.png';
            this.stage3GroundImage = new Image();
            this.stage3GroundImage.src = 'images/stage3_ground_mountain_tile.png';
            this.stage3PropImages = {};
            const stage3PropPaths = {
                dosojin: 'images/stage3_prop_dosojin.png?v=20260706_front1',
                signpost: 'images/stage3_prop_signpost.png?v=20260706_front1',
                woodFence: 'images/stage3_prop_weathered_wood_fence.png?v=20260706_front1',
                stoneLantern: 'images/stage3_prop_stone_lantern.png?v=20260706_front1',
                jizoLarge: 'images/stage3_prop_jizo_large.png?v=20260706_front1',
                mountainSign: 'images/stage3_prop_mountain_sign.png?v=20260706_front1'
            };
            for (const [key, src] of Object.entries(stage3PropPaths)) {
                const image = new Image();
                image.src = src;
                this.stage3PropImages[key] = image;
            }
        }

        // --- Stage 4 城下町添景画像 ---
        if (this.stageNumber === 4) {
            this.stage4TownImages = {};
            const stage4TownPaths = {
                townMachiya: 'images/stage4_town_part_machiya.png',
                townShops: 'images/stage4_town_part_shops.png',
                townNagaya: 'images/stage4_town_part_nagaya.png',
                groundTile: 'images/stage4_ground_stone_tile.png',
                castleEntrance: 'images/stage4_castle_lower_wide.png',
                castleApproachDistrict: 'images/stage4_castle_approach_district.png',
                climbPropCrates: 'images/stage4_climb_prop_crates.png?v=20260706_front1',
                climbPropHandcart: 'images/stage4_climb_prop_handcart.png?v=20260706_side2',
                climbPropBench: 'images/stage4_climb_prop_bench.png',
                climbPropSakeBarrels: 'images/stage4_climb_prop_sake_barrels.png'
            };
            for (const [key, src] of Object.entries(stage4TownPaths)) {
                const image = new Image();
                image.src = src;
                this.stage4TownImages[key] = image;
            }
        }

        // --- Stage 5 城内床画像 ---
        if (this.stageNumber === 5) {
            this.stage5InteriorWallImage = new Image();
            this.stage5InteriorWallImage.src = 'images/stage5_castle_interior_wall.png?v=20260706_bg1';
            this.stage5GroundImage = new Image();
            this.stage5GroundImage.src = 'images/stage5_ground_wood_tile.png';
        }

        // --- Stage 6 天守床画像 ---
        if (this.stageNumber === 6) {
            this.stage6TenshuBackdropImage = new Image();
            this.stage6TenshuBackdropImage.src = 'images/stage6_tenshu_rooftop_backdrop.png?v=20260706_bg2';
            this.stage6UpperGalleryImage = new Image();
            this.stage6UpperGalleryImage.src = 'images/stage6_upper_gallery_backdrop.png?v=20260714_zone1';
            this.stage6RoofRidgeImage = new Image();
            this.stage6RoofRidgeImage.src = 'images/stage6_roof_ridge_backdrop.png?v=20260714_zone1';
            this.stage6FinalTerraceImage = new Image();
            this.stage6FinalTerraceImage.src = 'images/stage6_final_terrace_backdrop.png?v=20260714_zone1';
            this.stage6BossPavilionImage = new Image();
            this.stage6BossPavilionImage.src = 'images/stage6_boss_pavilion_backdrop.png?v=20260715_boss1';
            this.stage6CornerTurretImage = new Image();
            this.stage6CornerTurretImage.src = 'images/stage6_corner_turret_transition.png?v=20260714_zone1';
            this.stage6RoofGateImage = new Image();
            this.stage6RoofGateImage.src = 'images/stage6_final_gate_transition.png?v=20260714_zone1';
            this.stage6FinalThresholdImage = new Image();
            this.stage6FinalThresholdImage.src = 'images/stage6_final_threshold_transition.png?v=20260714_zone1';
            this.stage6GroundImage = new Image();
            this.stage6GroundImage.src = 'images/stage6_ground_lacquer_neutral.png?v=20260714_neutral1';
            this.stage6UpperGalleryGroundImage = new Image();
            this.stage6UpperGalleryGroundImage.src = 'images/stage6_ground_upper_gallery.png?v=20260715_parallel1';
            this.stage6RoofRidgeGroundImage = new Image();
            this.stage6RoofRidgeGroundImage.src = 'images/stage6_ground_roof_ridge.png?v=20260714_zone1';
            this.stage6FinalTerraceGroundImage = new Image();
            this.stage6FinalTerraceGroundImage.src = 'images/stage6_ground_final_terrace.png?v=20260715_seam1';
            this.stage6GroundThresholdImage = new Image();
            this.stage6GroundThresholdImage.src = 'images/stage6_ground_threshold_strip.png?v=20260714_zone1';

            // --- 螺旋回廊: 柵越しの眼下パノラマ＋隅櫓の階段 ---
            this.stage6PanoramaTownNearImage = new Image();
            this.stage6PanoramaTownNearImage.src = 'images/stage6_panorama_town_near.png?v=20260722_town3';
            this.stage6PanoramaBambooFarImage = new Image();
            this.stage6PanoramaBambooFarImage.src = 'images/stage6_panorama_bamboo_far.png?v=20260721_loop1';
            this.stage6PanoramaKaidoFarImage = new Image();
            this.stage6PanoramaKaidoFarImage.src = 'images/stage6_panorama_kaido_far.png?v=20260721_loop1';
            this.stage6PanoramaMountainsFarImage = new Image();
            this.stage6PanoramaMountainsFarImage.src = 'images/stage6_panorama_mountains_far.png?v=20260721_loop1';
            this.stage6PanoramaCloudSeaImage = new Image();
            this.stage6PanoramaCloudSeaImage.src = 'images/stage6_panorama_cloudsea.png?v=20260721_loop1';

            // 角の全高壁(視界遮断+通用門)。境界ごとに別アセット。
            this.stage6CornerWallImages = [
                'images/stage6_wall_corner_turret.png?v=20260724_dechecker1',
                'images/stage6_wall_gatehouse.png?v=20260724_dechecker1',
                'images/stage6_wall_final_gate.png?v=20260724_dechecker1'
            ].map((src) => {
                const img = new Image();
                img.src = src;
                return img;
            });

            // --- 大棟化: 四巡目=天守大屋根の上(柵なし・棟瓦・眼下に朝靄)。
            //     未配置の間は従来のテラス床/東屋/柵付き背景へフォールバックする。
            this.stage6RidgeTilesGroundImage = new Image();
            this.stage6RidgeTilesGroundImage.src = 'images/stage6_ground_ridge_tiles.png?v=20260723_final1';
            this.stage6RidgeFlanksImage = new Image();
            this.stage6RidgeFlanksImage.src = 'images/stage6_ridge_flanks_backdrop.png?v=20260723_final1';
            this.stage6RidgeShachiImage = new Image();
            this.stage6RidgeShachiImage.src = 'images/stage6_ridge_shachi.png?v=20260722_ridge1';
            // 三巡目の床置き換え(鉄板リベット→黒漆の板張り)
            this.stage6GalleryWoodGroundImage = new Image();
            this.stage6GalleryWoodGroundImage.src = 'images/stage6_ground_gallery_wood.png?v=20260722_ridge1';
            // 角3をくぐった後の「屋根に突き出た出口の破風」(未配置時は妻壁のまま)
            this.stage6RoofExitGableImage = new Image();
            this.stage6RoofExitGableImage.src = 'images/stage6_roof_exit_gable.png?v=20260723_final1';
            // 大棟の床v3: 軒先で終わり下端透過(軒下にコードが「遥か下の世界」を描く)。未配置時はridge_tiles
            this.stage6RidgeEavesGroundImage = new Image();
            this.stage6RidgeEavesGroundImage.src = 'images/stage6_ground_ridge_eaves.png?v=20260724_eaves1';
        }

        // キャッシュ用オフスクリーンCanvasの初期化
        this.cachedAssets = {};
        this.initCache();
    }

    initCache() {
        // 竹の葉のプリレンダリング
        if (this.stageNumber === 1) {
            const palettes = [
                { top: '#2b4930', bottom: '#17291d', vein: 'rgba(8, 18, 11, 0.58)' },
                { top: '#38543a', bottom: '#203323', vein: 'rgba(10, 22, 13, 0.56)' },
                { top: '#4a5f3b', bottom: '#293623', vein: 'rgba(15, 23, 12, 0.54)' },
                { top: '#555d37', bottom: '#343921', vein: 'rgba(23, 24, 10, 0.52)' },
                { top: '#3f5132', bottom: '#24301f', vein: 'rgba(12, 19, 10, 0.56)' }
            ];
            this.cachedAssets.bambooLeaves = palettes.map((palette) => {
                const offCanvas = document.createElement('canvas');
                offCanvas.width = 32;
                offCanvas.height = 32;
                const octx = offCanvas.getContext('2d');
                const size = 12;
                octx.translate(16, 16);
                const fill = octx.createLinearGradient(-size * 0.55, 0, size * 0.65, 0);
                fill.addColorStop(0, palette.bottom);
                fill.addColorStop(0.48, palette.top);
                fill.addColorStop(1, palette.bottom);
                octx.fillStyle = fill;
                octx.beginPath();
                octx.moveTo(-size * 0.62, 0.5);
                octx.quadraticCurveTo(-size * 0.08, -size * 0.34, size * 0.68, -size * 0.05);
                octx.quadraticCurveTo(size * 0.08, size * 0.3, -size * 0.62, 0.5);
                octx.closePath();
                octx.fill();
                octx.strokeStyle = 'rgba(118, 132, 76, 0.34)';
                octx.lineWidth = 0.75;
                octx.stroke();
                octx.strokeStyle = palette.vein;
                octx.lineWidth = 0.65;
                octx.beginPath();
                octx.moveTo(-size * 0.45, 0.25);
                octx.quadraticCurveTo(0, -0.35, size * 0.53, -size * 0.03);
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
                size: (8 + Math.random() * 6) * (0.86 + depth * 0.14),
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

    /** 最終階の右端にある、天守閣へ続く背景専用の階段か */
    isFinalFloorExitStair() {
        return this.stageNumber === 5 && this.currentFloor >= this.maxFloor;
    }

    /** Stage6: 次に登る角(隅櫓)のワールドX。全て登り済みなら Infinity */
    getStage6ActiveCornerX() {
        if (this.stageNumber !== 6) return Infinity;
        return this.cornersClimbed < STAGE6_CORNER.CORNER_XS.length
            ? STAGE6_CORNER.CORNER_XS[this.cornersClimbed]
            : Infinity;
    }

    /** Stage6: まだ登っていない角が残っているか */
    hasPendingStage6Corner() {
        return this.stageNumber === 6 && this.cornersClimbed < STAGE6_CORNER.CORNER_XS.length;
    }

    /** Stage6: xがいずれかの角帯(壁+バッファ)内か。敵/障害物のスポーン除外に使う */
    isInStage6CornerBand(x, buffer = STAGE6_CORNER.SPAWN_BUFFER) {
        if (this.stageNumber !== 6) return false;
        for (const cornerX of STAGE6_CORNER.CORNER_XS) {
            if (x >= cornerX - STAGE6_CORNER.WALL_LEFT_PX - buffer &&
                x <= cornerX + STAGE6_CORNER.WALL_RIGHT_PX + buffer) {
                return true;
            }
        }
        return false;
    }

    /** 最終階の出口階段へ進入できる限界X */
    getFinalFloorExitBarrierX() {
        if (!this.isFinalFloorExitStair()) return Infinity;
        return this._getStairPhysicalStart(this.floorScrollDirection);
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
        if (this.stageNumber !== 5 || this.isFinalFloorExitStair()) return 0;
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

        // 最終階の右端は天守閣へ続く背景専用階段。傾斜として扱わない。
        if (this.isFinalFloorExitStair()) return this.baseGroundY;

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

    getStage4TownRowSpecs() {
        return [
            {
                key: 'townMachiya',
                height: 350,
                sourceWidth: 1721,
                sourceHeight: 665,
                platforms: [
                    { level: 2, x1: 45, x2: 610, y: 58 },
                    { level: 2, x1: 640, x2: 1168, y: 58 },
                    { level: 2, x1: 1210, x2: 1682, y: 58 },
                    { level: 1, x1: 18, x2: 615, y: 318 },
                    { level: 1, x1: 628, x2: 1168, y: 318 },
                    { level: 1, x1: 1188, x2: 1700, y: 318 }
                ]
            },
            {
                key: 'townShops',
                height: 350,
                sourceWidth: 1671,
                sourceHeight: 663,
                platforms: [
                    { level: 2, x1: 65, x2: 590, y: 62 },
                    { level: 2, x1: 610, x2: 1142, y: 62 },
                    { level: 2, x1: 1162, x2: 1610, y: 62 },
                    { level: 1, x1: 80, x2: 562, y: 318 },
                    { level: 1, x1: 610, x2: 1128, y: 318 },
                    { level: 1, x1: 1160, x2: 1605, y: 318 }
                ]
            },
            {
                key: 'townNagaya',
                height: 350,
                sourceWidth: 1677,
                sourceHeight: 655,
                platforms: [
                    { level: 2, x1: 62, x2: 560, y: 54 },
                    { level: 2, x1: 604, x2: 1120, y: 96 },
                    { level: 2, x1: 1165, x2: 1618, y: 68 },
                    { level: 1, x1: 25, x2: 568, y: 308 },
                    { level: 1, x1: 594, x2: 1120, y: 318 },
                    { level: 1, x1: 1150, x2: 1640, y: 310 }
                ]
            }
        ];
    }

    getStage4TownSpecMetrics(spec) {
        const image = this.stage4TownImages?.[spec.key];
        const sourceWidth = (image && image.naturalWidth > 0) ? image.naturalWidth : spec.sourceWidth;
        const sourceHeight = (image && image.naturalHeight > 0) ? image.naturalHeight : spec.sourceHeight;
        const height = spec.height;
        const width = height * (sourceWidth / sourceHeight);

        return { sourceWidth, sourceHeight, width, height };
    }

    // townShops（緑・青・赤の三連暖簾の店）は意匠が目立つので城下町全体で一度だけ登場させ、
    // アクセントとして町並みの列の中央に置く（残りは町家/長屋の繰り返しなので単調さが減る）。
    // stage4の城下町は全9区画(worldX -36〜約7878)。区画4がちょうど列の真ん中(前後4区画ずつ)。
    // 残りの区画は町家(machiya)と長屋(nagaya)を交互に敷き詰める。
    getStage4TownRowKeyForIndex(index) {
        const shopsIndex = 4;
        if (index === shopsIndex) return 'townShops';
        const alt = index > shopsIndex ? index - 1 : index;
        return (alt % 2 === 0) ? 'townMachiya' : 'townNagaya';
    }

    getStage4TownRowSequenceUntil(limitX) {
        const specs = this.getStage4TownRowSpecs();
        const rows = [];
        if (!specs.length) return rows;

        const specsByKey = new Map(specs.map((spec) => [spec.key, spec]));
        const joinOverlap = 22;
        let worldX = -36;
        for (let i = 0; i < 64 && worldX < limitX + 1200; i++) {
            const spec = specsByKey.get(this.getStage4TownRowKeyForIndex(i)) || specs[0];
            const metrics = this.getStage4TownSpecMetrics(spec);
            rows.push({
                ...spec,
                ...metrics,
                image: this.stage4TownImages?.[spec.key],
                rowIndex: i,
                worldX,
                drawY: this.groundY - metrics.height + 1
            });
            worldX += Math.max(480, metrics.width - joinOverlap);
        }

        return rows;
    }

    getStage4SurfaceRankFromFootY(footY) {
        const heightAboveGround = (this.groundY + LANE_OFFSET) - footY;
        if (heightAboveGround > 285) return 4;
        if (heightAboveGround > 188) return 3;
        if (heightAboveGround > 118) return 2;
        if (heightAboveGround > 42) return 1;
        return 0;
    }

    getStage4PlatformRank(platform) {
        if (platform && Number.isFinite(platform.stage4SurfaceRank)) {
            return platform.stage4SurfaceRank;
        }
        return this.getStage4SurfaceRankFromFootY(platform?.y || this.groundY + LANE_OFFSET);
    }

    getStage4ClimbPropDefinitions() {
        return {
            crates: {
                imageKey: 'climbPropCrates',
                sourceWidth: 760,
                sourceHeight: 505,
                sourceSurfaceY: 32,
                visualHeight: 86,
                colliderWidth: 132,
                rank: 1
            },
            handcart: {
                imageKey: 'climbPropHandcart',
                sourceWidth: 1176,
                sourceHeight: 317,
                sourceSurfaceY: 16,
                visualHeight: 54,
                colliderWidth: 690,
                rank: 1
            },
            bench: {
                imageKey: 'climbPropBench',
                sourceWidth: 373,
                sourceHeight: 139,
                sourceSurfaceY: 54,
                visualHeight: 84,
                colliderWidth: 172,
                rank: 1
            },
            sakeBarrels: {
                imageKey: 'climbPropSakeBarrels',
                sourceWidth: 400,
                sourceHeight: 289,
                sourceSurfaceY: 18,
                visualHeight: 104,
                colliderWidth: 168,
                rank: 1
            }
        };
    }

    getStage4ClimbPropTemplates(rowIndex = 0) {
        // 足場プロップは間引いて配置する（建物の屋根とは別の登攀用オブジェクト）。
        // 以前は1行3個で過密だったため、平均 約1.5個/行（およそ半減）まで減らし、
        // 種類・位置を散らして単調さと密度を抑える。各行に最低1個は残す。
        const patterns = [
            [
                { type: 'crates', x: 640 },
                { type: 'handcart', x: 1640 }
            ],
            [
                { type: 'bench', x: 900 }
            ],
            [
                { type: 'sakeBarrels', x: 360 },
                { type: 'crates', x: 1520 }
            ],
            [
                { type: 'handcart', x: 1060 }
            ]
        ];
        return patterns[((rowIndex % patterns.length) + patterns.length) % patterns.length];
    }

    getStage4TownRowsInRange(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        // 城手前の白壁屋敷の手前で町並みを打ち切る（屋敷ゾーンには町家を描かない／判定も作らない）。
        // 各パーツの右端で判定するので、建物が途中で切れたり継ぎ目に隙間が出たりしない。
        const approachStartX = this.getStage4CastleApproachStartX();
        return this.getStage4TownRowSequenceUntil(Math.min(rightWorld + 900, approachStartX))
            .filter((row) => (
                row.worldX + row.width <= approachStartX + 1 &&
                row.worldX <= rightWorld + 900 &&
                row.worldX + row.width >= leftWorld - 900
            ));
    }

    getStage4CastleWorldX() {
        return (this.maxProgress - CANVAS_WIDTH) - 100;
    }

    getStage4CastleApproachLayout() {
        if (this.stageNumber !== 4) return null;

        const castleWorldX = this.getStage4CastleWorldX();
        const approachStartX = this.getStage4CastleApproachStartX();
        const approachWorldX = approachStartX + 8;
        const approachHeight = 380;
        const approachWidth = Math.max(0, castleWorldX - approachWorldX - 64);

        return {
            castleWorldX,
            approachStartX,
            approachWorldX,
            approachHeight,
            approachWidth
        };
    }

    // 城手前の「町家列から武家屋敷区画へ切り替わる地点」のワールドX。
    // ここより右は城郭接近路として扱い、町家の屋根足場を持ち込まない。
    getStage4CastleApproachStartX() {
        if (this.stageNumber !== 4) return Infinity;
        const castleWorldX = this.getStage4CastleWorldX();
        // 町並み行の「右端」にスナップして返す。
        // こうすると町家を途中で切らずに済み、接近路の始まりも毎回安定する。
        const desired = castleWorldX - 2150;
        const rows = this.getStage4TownRowSequenceUntil(desired + 1200);
        let selected = rows[0];
        for (const row of rows) {
            if (row.worldX + row.width > desired) break;
            selected = row;
        }
        return selected ? selected.worldX + selected.width : desired;
    }

    getStage4CastleApproachColliders(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        const layout = this.getStage4CastleApproachLayout();
        if (!layout) return [];

        const baseY = this.groundY - 2;
        const colliders = [];
        const addPlatform = (x, y, width, rank, kind) => {
            if (width <= 0) return;
            colliders.push({
                x,
                y,
                width,
                height: 12,
                isDestroyed: false,
                isStage4RoofPlatform: true,
                isOneWayPlatform: true,
                roofLevel: rank,
                stage4SurfaceRank: this.getStage4SurfaceRankFromFootY(y),
                stage4ApproachKind: kind
            });
        };

        const approachImage = this.stage4TownImages?.castleApproachDistrict;
        const sourceW = (approachImage && approachImage.naturalWidth > 0) ? approachImage.naturalWidth : 2023;
        const sourceH = (approachImage && approachImage.naturalHeight > 0) ? approachImage.naturalHeight : 554;
        const drawH = layout.approachHeight;
        const drawW = layout.approachWidth || drawH * (sourceW / sourceH);
        const drawY = baseY - drawH + 3;
        const sx = drawW / sourceW;
        const sy = drawH / sourceH;
        const approachPlatforms = [
            { level: 1, x1: 10, x2: 218, y: 384, kind: 'approach-left-low-wall-roof' },
            { level: 2, x1: 218, x2: 444, y: 342, kind: 'approach-side-gate-roof' },
            { level: 1, x1: 446, x2: 708, y: 348, kind: 'approach-left-wall-roof' },
            { level: 4, x1: 576, x2: 1392, y: 28, kind: 'approach-residence-upper-roof' },
            // 翼屋根は瓦のある範囲だけを足場にする（内側は母屋の壁・柱・縁側で瓦が無い）。
            { level: 3, x1: 418, x2: 508, y: 175, kind: 'approach-residence-left-wing-roof' },
            { level: 2, x1: 704, x2: 1030, y: 204, kind: 'approach-main-gate-roof' },
            { level: 3, x1: 1436, x2: 1600, y: 175, kind: 'approach-residence-right-wing-roof' },
            { level: 1, x1: 1058, x2: 1326, y: 346, kind: 'approach-right-wall-roof' },
            { level: 1, x1: 1320, x2: 1496, y: 390, kind: 'approach-outer-low-roof' },
            // 外塀は櫓のあたりで一段下がる。瓦の棟に合わせて左右で高さを分ける（右側は約13px低い）。
            { level: 1, x1: 1496, x2: 1662, y: 410, kind: 'approach-outer-wall-roof' },
            { level: 1, x1: 1662, x2: 1805, y: 423, kind: 'approach-outer-wall-roof-far' }
        ];

        for (const platform of approachPlatforms) {
            addPlatform(
                layout.approachWorldX + platform.x1 * sx,
                drawY + platform.y * sy,
                (platform.x2 - platform.x1) * sx,
                platform.level,
                platform.kind
            );
        }

        return colliders.filter((platform) => (
            platform.x + platform.width >= leftWorld &&
            platform.x <= rightWorld
        ));
    }

    getStage4RoofColliders(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        const roofColliders = this.getStage4TownRowsInRange(leftWorld, rightWorld)
            .flatMap((row) => {
                if (!row.image || row.image.naturalWidth <= 0 || row.image.naturalHeight <= 0) return [];

                const scaleX = row.width / row.image.naturalWidth;
                const scaleY = row.height / row.image.naturalHeight;
                const roofWalkInsetY = 0;
                return (row.platforms || []).map((platform) => {
                    const y = row.drawY + (platform.y + roofWalkInsetY) * scaleY;
                    return {
                        x: row.worldX + platform.x1 * scaleX,
                        y,
                        width: Math.max(48, (platform.x2 - platform.x1) * scaleX),
                        height: 12,
                        isDestroyed: false,
                        isStage4RoofPlatform: true,
                        isOneWayPlatform: true,
                        roofLevel: platform.level,
                        stage4SurfaceRank: this.getStage4SurfaceRankFromFootY(y)
                    };
                }).filter((platform) => (
                    platform.x + platform.width >= leftWorld &&
                    platform.x <= rightWorld
                ));
            });

        // 町並みは接近路の手前で打ち切られる（getStage4TownRowsInRangeでクリップ）。
        // 城前の接近路は新規の武家屋敷区画画像だけに合わせて、瓦屋根上の足場を足す。
        return roofColliders
            .concat(this.getStage4ClimbPlatformColliders(leftWorld, rightWorld))
            .concat(this.getStage4CastleApproachColliders(leftWorld, rightWorld));
    }

    getStage4ClimbPlatformColliders(leftWorld, rightWorld) {
        if (this.stageNumber !== 4) return [];

        const defs = this.getStage4ClimbPropDefinitions();
        // 背景の家並みに馴染むよう、足場プロップはプレイヤー接地レーンより少し奥へ置く。
        // drawY と platformY が同じ baseY から出るので、見た目と足場判定は一緒に動く。
        const baseY = this.groundY + 12;
        return this.getStage4TownRowsInRange(leftWorld, rightWorld)
            .flatMap((row) => this.getStage4ClimbPropTemplates(row.rowIndex).map((template) => {
                const def = defs[template.type];
                if (!def) return null;

                const image = this.stage4TownImages?.[def.imageKey];
                const sourceWidth = (image && image.naturalWidth > 0) ? image.naturalWidth : def.sourceWidth;
                const sourceHeight = (image && image.naturalHeight > 0) ? image.naturalHeight : def.sourceHeight;
                const scale = def.visualHeight / Math.max(1, sourceHeight);
                const drawWidth = sourceWidth * scale;
                const drawHeight = sourceHeight * scale;
                const centerX = row.worldX + template.x * (row.width / row.sourceWidth);
                const drawX = centerX - drawWidth * 0.5;
                const drawY = baseY - drawHeight;
                const platformY = drawY + def.sourceSurfaceY * scale;
                const platformWidth = Math.min(drawWidth - 20, Math.max(52, def.colliderWidth * scale));

                return {
                    x: centerX - platformWidth * 0.5,
                    y: platformY,
                    width: platformWidth,
                    height: 12,
                    isDestroyed: false,
                    isStage4ClimbPlatform: true,
                    isOneWayPlatform: true,
                    climbKind: template.type,
                    roofLevel: def.rank,
                    stage4SurfaceRank: def.rank,
                    imageKey: def.imageKey,
                    drawX,
                    drawY,
                    drawWidth,
                    drawHeight
                };
            }).filter(Boolean))
            .filter((platform) => (
                platform.x + platform.width >= leftWorld &&
                platform.x <= rightWorld
            ));
    }

    /** フロア遷移を開始する */
    startFloorTransition() {
        if (this.stageNumber !== 5 || this.isFloorTransitioning) return;
        this.isFloorTransitioning = true;
        this.floorTransitionPhase = 1; // 暗転開始
        this.floorTransitionTimer = this.transitionFadeMs;
    }

    /** Stage6: 角(隅櫓)遷移を開始する */
    startCornerTransition() {
        if (this.stageNumber !== 6 || this.isFloorTransitioning) return;
        this.isFloorTransitioning = true;
        this.floorTransitionPhase = 1; // 暗転開始
        this.floorTransitionTimer = this.transitionFadeMs;
    }

    /** フロア遷移のアニメーション更新 (deltaTime in seconds) */
    updateFloorTransition(deltaTime) {
        if (!this.isFloorTransitioning) return false;

        this.floorTransitionTimer -= deltaTime * 1000;

        if (this.floorTransitionTimer <= 0) {
            if (this.floorTransitionPhase === 1) {
                // 暗転完了 → 暗転待機（この間にフロア/ゾーン切り替え）
                this.floorTransitionPhase = 2;
                this.floorTransitionTimer = this.transitionWaitMs;
                if (this.stageNumber === 6) {
                    this.advanceCorner();
                } else {
                    this.advanceFloor();
                }
            } else if (this.floorTransitionPhase === 2) {
                // 暗転待機完了 → フェードイン開始
                this.floorTransitionPhase = 3;
                this.floorTransitionTimer = this.transitionFadeInMs;
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

    /** Stage6: 次の廻縁(ゾーン)へ移行する。完全暗転中に呼ばれる。 */
    advanceCorner() {
        if (this.stageNumber !== 6) return;

        // 登った角を記録してから次の角をアクティブ化する
        this.lastClimbedCornerX = this.getStage6ActiveCornerX();
        this.cornersClimbed++;

        // 敵・障害物をリセット（プレイヤーを境界の先へ飛ばすため、残すと瞬間湧きに見える）
        this.enemies = [];
        this.obstacles = [];
        this.spawnTimer = 800;
        this.obstacleTimer = 0;

        // stage6のgroundYは動かさない設計だが明示的に戻しておく
        this.groundY = this.baseGroundY;

        // progress/maxProgressは触らない（stage5と違い世界座標は連続。xスナップはgame.js側）
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
            return 1 - this.floorTransitionTimer / this.transitionFadeMs;
        } else if (this.floorTransitionPhase === 2) {
            // 暗転待機: 常に1
            return 1;
        } else if (this.floorTransitionPhase === 3) {
            // フェードイン: 1 → 0
            return this.floorTransitionTimer / this.transitionFadeInMs;
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

    /** フロア名（「一階」「二階」等）を表示する。stage6は文字を出さず背景で語る方針 */
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
                obstacleChance: 0.14,
                obstacleIntervalMin: 3600,
                obstacleIntervalMax: 5600
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
                phase: i * 1.3,
                // 2周波ブレンド用の副成分（星ごとにバラけさせ、単一sineの機械的な点滅を崩す）
                subSpeed: 2.4 + baseY * 2.2,
                subPhase: baseX * 6.283 + i * 0.7
            });
        }
        return particles;
    }
    
    createBackgroundLayers() {
        // ゲーム全編を通じて昼〜夕方〜夜〜深夜と自然に時間が経過するように、
        // 各ステージのstartとendの色が前後のステージで滑らかに繋がるように定義
        const backgrounds = {
            1: { // 早朝: 暁から朝へ（竹林）
                start: { sky: ['#07112d', '#182b58'], far: '#1f3348', mid: '#2d4761', near: '#3a5f7d' },
                mid:   { sky: ['#1f3477', '#df522e'], far: '#2f4a5f', mid: '#3f6278', near: '#547f92' },
                end:   { sky: ['#3d77b0', '#ff8a32'], far: '#406e69', mid: '#56907f', near: '#6cae97' },
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
        const enemyObstacles = this.getStageEnemyObstacles(activeObstacles);
        this.updateEnemies(deltaTime, player, enemyObstacles);
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
            const enemyObstacles = this.getStageEnemyObstacles(activeObstacles);
            this.updateEnemies(deltaTime, player, enemyObstacles);
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
        const enemyObstacles = this.getStageEnemyObstacles(activeObstacles);
        this.updateEnemies(deltaTime, player, enemyObstacles);
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
        // stage4: プレイヤーの「安定段位」を毎フレーム1回だけ確定させる。
        // 着地中の段位のみ採用し、ジャンプ中は直前の地上段位を保持することで、
        // 「プレイヤーが跳ねただけ」で敵が一斉反応するのを防ぐ。
        if (this.stageNumber === 4 && player) {
            const playerFootY = player.y + player.getWorldHeight();
            const rawRank = this.getStage4SurfaceRankFromFootY(playerFootY);
            if (player.isGrounded || this.stage4PlayerStableRank === undefined) {
                this.stage4PlayerStableRank = rawRank;
            }
        }

        // 敵を更新し、削除すべきものをフィルタ
        // 置き去りになった敵は前方に再登場させ、走り抜け時の敵枯渇を防ぐ
        const nextEnemies = [];
        for (const enemy of this.enemies) {
            this.updateStage4EnemyRoofMovement(enemy, player, obstacles, deltaTime);
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

    updateStage4EnemyRoofMovement(enemy, player, obstacles = [], deltaTime = 0) {
        if (this.stageNumber !== 4 || !enemy || !player) return;

        enemy.stage4RoofJumpCooldown = Math.max(0, (enemy.stage4RoofJumpCooldown || 0) - deltaTime * 1000);
        if (enemy.stage4ReactTimer > 0) {
            enemy.stage4ReactTimer = Math.max(0, enemy.stage4ReactTimer - deltaTime * 1000);
        }

        // 縁ガードは毎フレーム更新する（早期returnで通常chaseに移っても、
        // 登攀中の足場から踏み外して落ちる「乗り降りの繰り返し」を防ぐため）。
        this.updateStage4EnemyLedgeGuard(enemy, obstacles);

        if (enemy.stage4RoofJumpCooldown > 0 || !enemy.isGrounded) return;
        if ((enemy.stage4RoofDecisionDelayMs || 0) > 0) return;

        const enemyCenterX = enemy.x + enemy.width * 0.5;
        const enemyFootY = enemy.y + enemy.height;
        const playerCenterX = player.x + player.getWorldWidth() * 0.5;
        const playerFootY = player.y + player.getWorldHeight();
        const isNinja = enemy.type === ENEMY_TYPES.NINJA;
        const currentRank = this.getStage4SurfaceRankFromFootY(enemyFootY);
        // 安定段位（着地時のみ更新）を狙う。ジャンプ中の一時的な段位変化には反応しない。
        const targetRank = (this.stage4PlayerStableRank !== undefined)
            ? this.stage4PlayerStableRank
            : this.getStage4SurfaceRankFromFootY(playerFootY);
        const isPlayerAirborne = player.isGrounded === false;
        const horizGap = Math.abs(playerCenterX - enemyCenterX);
        const aggression = (enemy.stage4VerticalAggression !== undefined)
            ? enemy.stage4VerticalAggression
            : 0.7;

        // --- プレイヤーの段位「変化」に対しては、個体ごとにばらけた遅延を置いてから反応する ---
        // これにより「プレイヤーが昇降した瞬間に全員が同時に追従する」現象を防ぐ。
        if (enemy.stage4LastPlayerRank === null || enemy.stage4LastPlayerRank === undefined) {
            enemy.stage4LastPlayerRank = targetRank;
        }
        if (targetRank !== enemy.stage4LastPlayerRank) {
            enemy.stage4LastPlayerRank = targetRank;
            // 積極的な個体ほど短く、消極的な個体ほど長い遅延。さらに個別ジッターを足す。
            const reactBase = (isNinja ? 220 : 300) + (1 - aggression) * (isNinja ? 880 : 1180);
            enemy.stage4ReactTimer = reactBase + Math.random() * 440;
            // 今回の変化を「追うか／その場に留まるか」を個性＋距離で確率的に決める。
            // 近いほど・積極的なほど追いやすい。遠い相手にはまず横移動で詰めさせる。
            const proximityBias = horizGap < 260 ? 0.28 : (horizGap < 560 ? 0.08 : -0.2);
            const followChance = Math.max(0.12, Math.min(0.95, aggression * 0.7 + 0.18 + proximityBias));
            enemy.stage4FollowCommit = Math.random() < followChance;
            return;
        }

        // 反応待ちウィンドウ中は動かない（個体ごとにずれて発火する）
        if (enemy.stage4ReactTimer > 0) return;

        // この個体は今回「その場に留まる」と決めた。一定時間そのまま待ち、たまに再判断する。
        if (enemy.stage4FollowCommit === false) {
            enemy.stage4RoofDecisionDelayMs = (isNinja ? 900 : 1300) + Math.random() * 2200;
            // 再判断時により追従しやすくして、いつまでも放置されないようにする。
            enemy.stage4FollowCommit = Math.random() < (aggression * 0.55 + 0.3);
            return;
        }

        if (currentRank > targetRank) {
            const currentPlatform = obstacles
                .filter((obs) => obs && (obs.isStage4RoofPlatform || obs.isStage4ClimbPlatform))
                .find((platform) => (
                    enemyCenterX >= platform.x - 8 &&
                    enemyCenterX <= platform.x + platform.width + 8 &&
                    Math.abs(platform.y - enemyFootY) < 18
                ));

            if (currentPlatform) {
                const playerIsBelow = playerFootY > enemyFootY + 34;
                if (playerIsBelow && currentPlatform.isOneWayPlatform) {
                    const direction = Math.abs(playerCenterX - enemyCenterX) > 18
                        ? (playerCenterX > enemyCenterX ? 1 : -1)
                        : 0;
                    enemy.dropThroughPlatformTimer = isNinja ? 190 : 220;
                    enemy.stage4ForcedMoveVx = direction * enemy.speed * (isNinja ? 1.35 : 1.02);
                    enemy.stage4ForcedMoveTimer = isNinja ? 260 : 320;
                    enemy.isGrounded = false;
                    enemy.isOnStage4Roof = false;
                    enemy.isOnStage4ClimbPlatform = false;
                    enemy.y += 5;
                    enemy.vy = Math.max(enemy.vy, isNinja ? 1.8 : 1.35);
                    enemy.stage4RoofJumpCooldown = isNinja ? 180 : 260;
                    enemy.stage4RoofDecisionDelayMs = isNinja
                        ? 80 + Math.random() * 140
                        : 130 + Math.random() * 220;
                    return;
                }

                const leftEdgeDist = Math.abs(enemyCenterX - currentPlatform.x);
                const rightEdgeDist = Math.abs(enemyCenterX - (currentPlatform.x + currentPlatform.width));
                let direction = playerCenterX < enemyCenterX ? -1 : 1;
                if (playerCenterX > currentPlatform.x && playerCenterX < currentPlatform.x + currentPlatform.width) {
                    direction = leftEdgeDist < rightEdgeDist ? -1 : 1;
                }
                enemy.stage4ForcedMoveVx = direction * enemy.speed * (isNinja ? 1.75 : 1.38);
                enemy.stage4ForcedMoveTimer = 340;
                enemy.stage4RoofJumpCooldown = isNinja ? 80 : 120;
                enemy.stage4RoofDecisionDelayMs = isNinja
                    ? 80 + Math.random() * 130
                    : 130 + Math.random() * 220;
                return;
            }
        }

        if (targetRank <= currentRank) return;
        if (isPlayerAirborne) return;

        const maxRankStep = 2;
        const desiredRank = Math.min(targetRank, currentRank + maxRankStep);
        const vertReach = isNinja ? 330 : 235;
        const onGround = currentRank === 0;
        // 地上では「登り口」が真上に無いことが多い（建物の屋根は rank3/4、低い足場は離れた位置）。
        // そこで地上では横方向の探索を大きく広げ、最寄りの登り口まで回り込めるようにする。
        // 既に高所にいる場合は近接した屋根だけを対象にし、足場から踏み外して落ちないようにする。
        const routeCorridor = onGround ? (isNinja ? 1400 : 1150) : (isNinja ? 420 : 360);
        const stepStones = obstacles.filter((obs) => {
            if (!obs || !(obs.isStage4RoofPlatform || obs.isStage4ClimbPlatform)) return false;
            if (obs.y >= enemyFootY - 28 || obs.y <= enemyFootY - vertReach) return false;
            const r = this.getStage4PlatformRank(obs);
            if (r <= currentRank || r > desiredRank) return false;
            return enemyCenterX > obs.x - routeCorridor && enemyCenterX < obs.x + obs.width + routeCorridor;
        });

        if (stepStones.length === 0) {
            // 一段上がれる登り口が近くに無い。地上ならプレイヤー側へはっきり歩み寄り、
            // 真下での左右ブレを止めて登り口を探しに行く。
            if (onGround && Math.abs(playerCenterX - enemyCenterX) > 40) {
                const dir = playerCenterX > enemyCenterX ? 1 : -1;
                enemy.facingRight = dir > 0;
                enemy.stage4ForcedMoveVx = dir * enemy.speed * (isNinja ? 1.4 : 1.12);
                enemy.stage4ForcedMoveTimer = 240;
                enemy.stage4RoofDecisionDelayMs = 110 + Math.random() * 120;
            }
            return;
        }

        // 登り口の選択：低い段（入口）を優先しつつ、敵から近く・プレイヤー寄りのものを選ぶ。
        // さらに「プレイヤーと逆方向」の足場には強いペナルティを付け、
        // わざわざ逆側へ飛んでから引き返して落ちる挙動を避ける。
        const playerDir = Math.sign(playerCenterX - enemyCenterX);
        const wrongSidePenalty = (platCenterX) => {
            if (Math.abs(playerCenterX - enemyCenterX) <= 36) return 0; // ほぼ真上ならどちらでも可
            return (Math.sign(platCenterX - enemyCenterX) === -playerDir) ? 300 : 0;
        };
        const target = stepStones.sort((a, b) => {
            const ar = this.getStage4PlatformRank(a);
            const br = this.getStage4PlatformRank(b);
            const ax = a.x + a.width * 0.5;
            const bx = b.x + b.width * 0.5;
            const aScore = (ar - currentRank) * 70 + Math.abs(enemyCenterX - ax) + Math.abs(playerCenterX - ax) * 0.5 + wrongSidePenalty(ax);
            const bScore = (br - currentRank) * 70 + Math.abs(enemyCenterX - bx) + Math.abs(playerCenterX - bx) * 0.5 + wrongSidePenalty(bx);
            return aScore - bScore;
        })[0];

        const tLeft = target.x;
        const tRight = target.x + target.width;
        const targetCenterX = target.x + target.width * 0.5;
        const targetRankForJump = this.getStage4PlatformRank(target);
        // 真下（＋ジャンプで横移動できる余裕）に来ているか
        const alignTol = onGround ? (isNinja ? 120 : 90) : (isNinja ? 220 : 170);
        const underSpan = enemyCenterX > tLeft - alignTol && enemyCenterX < tRight + alignTol;

        if (onGround && !underSpan) {
            // まず登り口の真下まで横移動する（ルート移動）。ここではジャンプしない。
            const dir = enemyCenterX < tLeft ? 1 : (enemyCenterX > tRight ? -1 : (targetCenterX >= enemyCenterX ? 1 : -1));
            enemy.facingRight = dir > 0;
            enemy.stage4ForcedMoveVx = dir * enemy.speed * (isNinja ? 1.55 : 1.24);
            enemy.stage4ForcedMoveTimer = 220;
            enemy.stage4RoofJumpCooldown = 0;
            // forcedMoveTimer より短い間隔で再判断し、歩きが途切れて震えないようにする。
            enemy.stage4RoofDecisionDelayMs = 90 + Math.random() * 90;
            return;
        }

        if (!onGround && !underSpan) {
            // 既に高所の足場にいるが、次の登り口が真上(ジャンプ到達圏)に無い。
            // 無理に跳ぶと届かず落ちて「乗り降りの繰り返し」になるため、跳ばずに留まる。
            // （足場から踏み外さないよう縁ガードが働く。少し待ってから再判断）
            enemy.stage4RoofDecisionDelayMs = (isNinja ? 260 : 360) + Math.random() * 260;
            return;
        }

        // 真下に到達（または高所で近接） → 登り口へジャンプ。
        const dx = targetCenterX - enemyCenterX;
        const direction = Math.abs(dx) < 10 ? (playerCenterX >= enemyCenterX ? 1 : -1) : (dx > 0 ? 1 : -1);
        const horizontalBoost = isNinja
            ? (targetRankForJump >= 3 ? 3.35 : 2.65)
            : (targetRankForJump >= 3 ? 2.4 : 1.85);
        enemy.vx += direction * horizontalBoost;
        const jumpVelocity = isNinja
            ? (targetRankForJump >= 3 ? -21.5 : -18.2)
            : (targetRankForJump >= 3 ? -18.7 : (targetRankForJump >= 2 ? -16.2 : -13.6));
        enemy.vy = Math.min(enemy.vy, jumpVelocity);
        enemy.isGrounded = false;
        enemy.isOnStage4Roof = false;
        enemy.isOnStage4ClimbPlatform = false;
        enemy.stage4LedgeGuard = false; // ジャンプ中は縁ガードを外す（次の段への水平移動を妨げない）
        enemy.stage4ForcedMoveVx = direction * enemy.speed * (isNinja ? 1.7 : 1.34);
        enemy.stage4ForcedMoveTimer = 260;
        enemy.stage4RoofJumpCooldown = isNinja ? 420 : 620;
        enemy.stage4RoofDecisionDelayMs = isNinja
            ? 90 + Math.random() * 190
            : 160 + Math.random() * 320;
    }

    // 登攀中の足場（高所の一方通行床）に乗っている間、縁から踏み外して落ちないように
    // 現在の足場の左右端を記録する。プレイヤーが下にいる（降りるべき）場合や
    // 意図的な落下中は記録せず、降下は妨げない。
    updateStage4EnemyLedgeGuard(enemy, obstacles = []) {
        enemy.stage4LedgeGuard = false;
        enemy.stage4OnElevatedRoof = false;
        if (!enemy.isGrounded) return;

        const footY = enemy.y + enemy.height;
        const currentRank = this.getStage4SurfaceRankFromFootY(footY);
        if (currentRank < 1) return; // 地上では縁ガードも跳ね抑止も不要

        const centerX = enemy.x + enemy.width * 0.5;
        const platform = obstacles.find((obs) => (
            obs && (obs.isStage4RoofPlatform || obs.isStage4ClimbPlatform) &&
            Math.abs(obs.y - footY) < 18 &&
            centerX >= obs.x - 6 && centerX <= obs.x + obs.width + 6
        ));
        if (!platform) return;

        // 高所の足場に乗っている：通常のランダムジャンプを抑止（屋根上で段を行き来しない）
        enemy.stage4OnElevatedRoof = true;

        // 縁ガードは「プレイヤーが厳密に上（＝まだ登攀中）」かつ意図的降下中でないときだけ。
        // 同段や下のときは自由に動かし（足場上で固まらせない／降りて回り込める）。
        if ((enemy.dropThroughPlatformTimer || 0) > 0) return;
        const targetRank = (this.stage4PlayerStableRank !== undefined)
            ? this.stage4PlayerStableRank
            : currentRank;
        if (targetRank <= currentRank) return;

        enemy.stage4LedgeGuard = true;
        enemy.stage4PlatformLeft = platform.x;
        enemy.stage4PlatformRight = platform.x + platform.width;
    }

    getStageEnemyObstacles(baseObstacles = []) {
        if (this.stageNumber !== 4 || typeof this.getStage4RoofColliders !== 'function') {
            return baseObstacles;
        }

        const roofColliders = this.getStage4RoofColliders(this.progress - 260, this.progress + CANVAS_WIDTH + 360);
        return roofColliders.length > 0 ? baseObstacles.concat(roofColliders) : baseObstacles;
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

    placeEnemyOnStage4Roof(enemy, x) {
        if (this.stageNumber !== 4 || !enemy || typeof this.getStage4RoofColliders !== 'function') return false;

        const enemyW = Number.isFinite(enemy.width) ? enemy.width : 36;
        const platforms = this.getStage4RoofColliders(x - 220, x + 420)
            .filter((platform) => platform.isStage4RoofPlatform)
            .filter((platform) => platform.width >= enemyW + 18)
            .sort((a, b) => (a.roofLevel || 0) - (b.roofLevel || 0));
        if (platforms.length === 0) return false;

        const preferred = platforms.find((platform) => x + enemyW * 0.5 >= platform.x && x + enemyW * 0.5 <= platform.x + platform.width)
            || platforms[0];
        const targetX = Math.max(preferred.x + 10, Math.min(x, preferred.x + preferred.width - enemyW - 10));
        enemy.x = targetX;
        enemy.groundY = this.groundY;
        enemy.y = preferred.y - enemy.height;
        enemy.vy = 0;
        enemy.isGrounded = true;
        enemy.isOnStage4Roof = true;
        return true;
    }

    spawnRecycledEnemyAhead(type) {
        const spawnX = this.progress + CANVAS_WIDTH + 80 + Math.random() * 180;
        const recycled = this.createGroundedEnemy(type || ENEMY_TYPES.ASHIGARU, spawnX);
        if (!recycled) return null;
        if ((type || ENEMY_TYPES.ASHIGARU) === ENEMY_TYPES.NINJA && Math.random() < 0.55) {
            this.placeEnemyOnStage4Roof(recycled, spawnX);
        }
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

            // Stage 6: 角帯(全高壁の周囲)でのスポーンを制限
            if (this.isInStage6CornerBand(x)) {
                continue;
            }

            // Stage 6: 大屋根の上(四巡目)に鎧武将は登ってこない。忍者に差し替え
            if (this.stageNumber === 6 && x >= this.maxProgress * 0.75 && type === ENEMY_TYPES.BUSHO) {
                type = ENEMY_TYPES.NINJA;
            }
            
            const enemy = this.createGroundedEnemy(type, x);
            if (!enemy) continue;
            if (type === ENEMY_TYPES.NINJA && Math.random() < 0.72) {
                this.placeEnemyOnStage4Roof(enemy, x);
            }
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
        const obstacleChance = this.stageNumber === 4
            ? this.balanceProfile.obstacleChance
            : Math.min(1, this.balanceProfile.obstacleChance + OBSTACLE_CHANCE_BOOST);
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

        // Stage 6: 角帯(全高壁の周囲)には障害物を置かない。
        // 連なりは右へ最大~440px伸びるため、原点だけでなく連なりの右端も帯判定する
        // (門前に竹槍の列が食い込むのを防ぐ)。
        if (this.isInStage6CornerBand(x) || this.isInStage6CornerBand(x + 440)) {
            return;
        }

        // Stage 6: 大屋根の上(四巡目)に竹槍・岩は据え付けられない
        if (this.stageNumber === 6 && x + 440 >= this.maxProgress * 0.75) {
            return;
        }

        // ボス部屋(最終1画面)には竹槍・大岩などの障害物を置かない。
        // 出現X + 連なり幅の余裕がボス部屋左端を越えるなら出現させず、
        // ボス登場と同時に障害物が一括で消える違和感を根本から防ぐ。
        const hasBossRoomHere = (this.stageNumber !== 5) || (this.currentFloor >= this.maxFloor);
        if (hasBossRoomHere) {
            const bossRoomLeft = Math.max(0, this.maxProgress - CANVAS_WIDTH);
            if (x + 440 > bossRoomLeft) return;
        }

        const spikeChanceByStage = [0, 0.12, 0.15, 0.42, 0.56, 0.7];
        const spikeChance = spikeChanceByStage[Math.max(0, Math.min(spikeChanceByStage.length - 1, this.stageNumber - 1))];
        const type = (this.stageNumber >= 5)
            ? OBSTACLE_TYPES.SPIKE
            : (this.stageNumber === 3)
                ? OBSTACLE_TYPES.ROCK
                : (this.stageNumber === 4)
                    ? OBSTACLE_TYPES.SPIKE
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

        // 障害物はボス部屋に出現させない設計（spawnObstacleで手前打ち切り済み）。
        // ここでは画面左外へ流れ去った分だけ掃除し、画面内の障害物を一括消去しない。
        // → ボス登場と同時に障害物が「急に消える」違和感を出さない。
        this.obstacles = this.obstacles.filter(obs => obs.x + obs.width > this.progress - 100);
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
    
    // P3 空補償: 空バンド [0, groundY] を [skyVisTop, groundY] へアフィン圧縮する。
    // skyVisTop=0 のとき恒等写像。groundY 側は不動点＝地平線基準の要素は不変。
    // 世界ズームの上部クロップで星・雲・天体が恒常的に画面外へ出るのを防ぐ。
    skyY(y) {
        const t = this.skyVisTop || 0;
        return t + y * (this.groundY - t) / this.groundY;
    }

    // 検証用の一括描画パス（ライブ描画は game.renderPlaying が層別に呼ぶ。ここは未使用）。
    // ボスUI/進捗バーはスクリーン空間のUIなのでここには含めない
    // （ボスUIは game.js の HUD 層 renderBossUI 呼び出しに一本化）。
    render(ctx) {
        this.renderBackground(ctx);
        this.renderGround(ctx);
        this.renderObstacles(ctx);
        this.renderEnemies(ctx);

        if (this.boss && this.bossSpawned) {
            this.boss.render(ctx);
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

    noise1DForStage(seed, stageNumber = this.stageNumber) {
        const x = Math.sin(seed * 127.1 + stageNumber * 311.7) * 43758.5453123;
        return x - Math.floor(x);
    }

    noise1D(seed) {
        return this.noise1DForStage(seed, this.stageNumber);
    }

    noiseSignedForStage(seed, stageNumber = this.stageNumber) {
        return this.noise1DForStage(seed, stageNumber) * 2 - 1;
    }

    noiseSigned(seed) {
        return this.noiseSignedForStage(seed, this.stageNumber);
    }

    clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    smoothstep(edge0, edge1, x) {
        if (edge0 === edge1) return x < edge0 ? 0 : 1;
        const t = this.clamp01((x - edge0) / (edge1 - edge0));
        return t * t * (3 - 2 * t);
    }

    getBossScrollStopX() {
        return Math.max(1, this.maxProgress - CANVAS_WIDTH);
    }

    getStage6ScrollProgress() {
        return this.clamp01(this.progress / this.getBossScrollStopX());
    }

    getStage6SunPhase() {
        return this.clamp01((this.getStage6ScrollProgress() - 0.82) / 0.18);
    }

    getStage6SunTheta() {
        return -0.22 + this.smoothstep(0, 1, this.getStage6SunPhase()) * 0.42;
    }

    getStage1GroundTransitionStartX() {
        return Math.max(0, this.maxProgress - STAGE1_GROUND_TRANSITION_LENGTH);
    }

    getStage1BambooTreeLineX() {
        return Math.max(0, this.maxProgress - STAGE1_BAMBOO_TREE_LINE_OFFSET);
    }

    getStage1SunHour() {
        const scrollProgress = this.clamp01(this.progress / this.getBossScrollStopX());
        return 4.5 + (STAGE1_BOSS_SUN_HOUR - 4.5) * this.smoothstep(0, 1, scrollProgress);
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
        
        this.updateBambooFallingLeaves(dtMs, dtScale, spawnMultiplier, progressDelta);
    }

    updateBambooFallingLeaves(dtMs, dtScale, spawnMultiplier = 1.0, progressDelta = 0) {
        const bambooEdgeScreenX = this.getStage1BambooTreeLineX() - this.progress;
        const spawnXMax = Math.min(CANVAS_WIDTH + 60, bambooEdgeScreenX + 40);
        const visibleForestWidth = Math.max(0, Math.min(CANVAS_WIDTH + 120, spawnXMax + 60));
        const forestCoverage = visibleForestWidth / (CANVAS_WIDTH + 120);
        const bossDensityBlend = this.smoothstep(0.45, 1, forestCoverage);
        const effectiveMultiplier = 1 + (spawnMultiplier - 1) * bossDensityBlend;
        const maxLeaves = Math.floor(14 * effectiveMultiplier * forestCoverage);
        const spawnInterval = 460 / (effectiveMultiplier * Math.max(0.12, forestCoverage));
        this.bambooLeafSpawnTimer += dtMs;

        let fallingCount = this.bambooFallingLeaves.filter(l => l.state === 'falling').length;
        let excessFallingLeaves = Math.max(0, fallingCount - maxLeaves);
        for (let i = this.bambooFallingLeaves.length - 1; i >= 0 && excessFallingLeaves > 0; i--) {
            if (this.bambooFallingLeaves[i].state !== 'falling') continue;
            this.bambooFallingLeaves.splice(i, 1);
            fallingCount--;
            excessFallingLeaves--;
        }

        while (this.bambooLeafSpawnTimer >= spawnInterval) {
            this.bambooLeafSpawnTimer -= spawnInterval;
            if (spawnXMax <= -40 || maxLeaves <= 0) {
                this.bambooLeafSpawnTimer = 0;
                break;
            }
            if (fallingCount >= maxLeaves) {
                this.bambooLeafSpawnTimer = Math.min(this.bambooLeafSpawnTimer, spawnInterval);
                break;
            }
            const depth = 0.45 + Math.random() * 0.55;
            const movingForward = progressDelta > 0.05;
            const forwardSpawnMin = Math.min(
                CANVAS_WIDTH * 0.35,
                Math.max(-60, spawnXMax - 200)
            );
            const spawnXMin = movingForward ? forwardSpawnMin : -60;
            const screenX = spawnXMin + Math.random() * Math.max(1, spawnXMax - spawnXMin);
            const terminalVy = (0.62 + Math.random() * 0.72) * (0.86 + depth * 0.34);
            const rotDirection = Math.random() < 0.5 ? -1 : 1;
            this.bambooFallingLeaves.push({
                worldX: screenX + this.progress,
                y: -10 + Math.random() * 170,
                vx: (-0.1 - Math.random() * 0.24) * depth,
                vy: terminalVy * 0.72,
                terminalVy,
                rot: Math.random() * Math.PI * 2,
                rotV: (0.006 + Math.random() * 0.009) * rotDirection,
                swayPhase: Math.random() * Math.PI * 2,
                swaySpeed: 0.0036 + Math.random() * 0.0018,
                swayAmp: 0.1 + Math.random() * 0.16,
                gustPhase: Math.random() * Math.PI * 2,
                gustSpeed: 0.00035 + Math.random() * 0.0002,
                size: (14 + Math.random() * 8) * (0.92 + depth * 0.08),
                depth,
                state: 'falling',
                groundLife: 400 + Math.random() * 400,
                maxGroundLife: 800,
                leafId: (this._leafIdCounter = ((this._leafIdCounter || 0) + 1) & 0xFFFF)
            });
            fallingCount++;
        }

        for (let i = this.bambooFallingLeaves.length - 1; i >= 0; i--) {
            const leaf = this.bambooFallingLeaves[i];
            const targetY = this.groundY + LANE_OFFSET + (leaf.depth - 0.5) * 16;
            
            if (leaf.state === 'falling') {
                const flutterPhase = this.stageTime * (leaf.swaySpeed || 0.0045) + (leaf.swayPhase || 0);
                const gustPhase = this.stageTime * (leaf.gustSpeed || 0.00045) + (leaf.gustPhase || 0);
                const flutter = Math.sin(flutterPhase);
                const gust = Math.sin(gustPhase);
                const targetVy = (leaf.terminalVy || leaf.vy) * (0.76 + Math.abs(flutter) * 0.25);
                leaf.vy += (targetVy - leaf.vy) * Math.min(1, 0.045 * dtScale);
                leaf.worldX += (leaf.vx + flutter * (leaf.swayAmp || 0.14) + gust * 0.1) * dtScale;
                leaf.y += Math.max(0.18, leaf.vy - Math.max(0, flutter) * 0.06) * dtScale;
                leaf.rot += (leaf.rotV + Math.cos(flutterPhase) * 0.008 + gust * 0.003) * dtScale;
                
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
            ctx.globalAlpha *= alpha;
            ctx.fillStyle = color || '#364b2d';
            ctx.beginPath();
            ctx.moveTo(-size * 0.62, 0.5);
            ctx.quadraticCurveTo(-size * 0.08, -size * 0.34, size * 0.68, -size * 0.05);
            ctx.quadraticCurveTo(size * 0.08, size * 0.3, -size * 0.62, 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(10, 20, 11, 0.56)';
            ctx.lineWidth = 0.65;
            ctx.beginPath();
            ctx.moveTo(-size * 0.45, 0.25);
            ctx.quadraticCurveTo(0, -0.35, size * 0.53, -size * 0.03);
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
                this.drawBambooLeaf(ctx, screenX, leaf.y, leaf.size, leaf.rot, '', 0.58 + leaf.depth * 0.38, leaf.leafId ?? -1, leaf.depth);
            } else {
                const lifeAlpha = Math.max(0, Math.min(1, leaf.groundLife / leaf.maxGroundLife));
                this.drawBambooLeaf(ctx, screenX, leaf.y, leaf.size, leaf.rot, '', (0.18 + leaf.depth * 0.24) * lifeAlpha, leaf.leafId ?? -1, leaf.depth);
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
            const y = this.skyY(baseY)
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
        
        let skyColors = currentPalette.sky;
        // ボス戦時の空の色変化を廃止
        
        // 空グラデーション - 垂直スクロール対応のため上下に大きく拡張
        const skyGradient = ctx.createLinearGradient(0, -400, 0, this.groundY + 400);
        skyGradient.addColorStop(0, skyColors[0]);
        skyGradient.addColorStop(1, skyColors[1]);
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, -400, CANVAS_WIDTH, this.groundY + 800);

        if (this.stageNumber === 1) {
            const sunriseBand = this.smoothstep(0.22, 0.92, p);
            if (sunriseBand > 0.001) {
                const fireBand = ctx.createLinearGradient(0, this.groundY + 18, 0, this.groundY * 0.18);
                fireBand.addColorStop(0, `rgba(255, 82, 22, ${(0.28 * sunriseBand).toFixed(3)})`);
                fireBand.addColorStop(0.25, `rgba(255, 122, 34, ${(0.22 * sunriseBand).toFixed(3)})`);
                fireBand.addColorStop(0.55, `rgba(255, 170, 72, ${(0.12 * sunriseBand).toFixed(3)})`);
                fireBand.addColorStop(1, 'rgba(255, 128, 44, 0)');
                ctx.fillStyle = fireBand;
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
                const sunApproach = this.smoothstep(0.72, 1.0, this.getStage6ScrollProgress());
                const outFade = (1 - this.smoothstep(0.82, 1.0, localP)) * (1 - sunApproach);
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
            } else if (this.stageNumber !== 1 && this.stageNumber !== 6) {
                // ステージ1は竹林画像で密度を出すため、空の雲・もやは描かない。
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

            // 地平線の薄い霞。Stage1は竹林の奥に白いもやが出るため描かず、Stage3は夕焼けの地面境界で横帯に見えるため描かない。
            if (this.stageNumber !== 1 && this.stageNumber !== 3) {
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

        if (!isCastleInterior && !isBambooForest && !isTenshuStageBg) {
            // 遠方の山並み・稜線は画像置換対象外として残す。
            this.renderBackgroundLayer(ctx, currentPalette.far, 0.2, 0.7, 100);
            this.renderBackgroundLayer(ctx, currentPalette.mid, 0.4, 0.8, 60);
            this.renderBackgroundLayer(ctx, currentPalette.near, 0.7, 1.0, 20);
        } else if (isBambooForest) {
            this.renderStage1FixedRoadMountains(ctx);
        }
        
        // ステージ固有の背景要素
        this.renderStageElements(ctx, currentPalette);

        // Stage2のラストオブジェクトは背景パララックスに混ぜず、地面と同じワールド座標で固定配置する。
        if (this.stageNumber === 2) {
            this.renderStage2MountainPassEntrance(ctx);
        }

        // ボス部屋の右側に次ステージへの「出入口」を描画。
        // ※ Stage1（竹林）は管理林縁から街道へ接続する専用終端を使うため、汎用peekは使わない。
        // ※ Stage2（街道）は山道入口をステージ内の通常背景として描画する。
        // ※ Stage5（城内）は画像ベースの階段（stairImage）が出口を兼ねるため peek は描かない。
        if (this.stageNumber >= 3 && this.stageNumber <= 4) {
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

    renderStage2MountainPassEntrance(ctx) {
        if (this.stageNumber !== 2) return false;

        const passImg = this.stage2MountainPassImage;
        const backMountainImg = this.stage2MountainBackImage;
        const passReady = passImg && passImg.complete && passImg.naturalWidth > 0 && passImg.naturalHeight > 0;
        const backReady = backMountainImg && backMountainImg.complete && backMountainImg.naturalWidth > 0 && backMountainImg.naturalHeight > 0;
        if (!passReady && !backReady) return false;

        const p = this.progress;
        const baseY = this.groundY;
        const passAspect = passReady ? passImg.naturalWidth / passImg.naturalHeight : 1667 / 888;
        const passH = Math.min(CANVAS_HEIGHT * 0.66, baseY + 28);
        const passW = passH * passAspect;
        const passStopX = CANVAS_WIDTH - passW + 18;
        const cameraStopX = Math.max(0, this.maxProgress - CANVAS_WIDTH);
        const passWorldX = cameraStopX + passStopX;
        const passX = passWorldX - p;
        const passY = baseY - passH + 12;

        // 画面に入る直前まで描画を切ると大きい画像のデコードも直前になり、後出しに見える。
        // 右側のかなり外から通常オブジェクトとして描画対象に入れて、自然な画面インにする。
        const prewarmMarginRight = CANVAS_WIDTH * 2.4;
        if (passX + passW < -160 || passX > CANVAS_WIDTH + prewarmMarginRight) return false;

        if (backReady) {
            const backH = Math.min(CANVAS_HEIGHT * 0.96, baseY + 160);
            const backW = backH * (backMountainImg.naturalWidth / backMountainImg.naturalHeight);
            const backX = passX + passW * 0.5 - backW * 0.5;
            const backY = baseY - backH + 8;

            ctx.save();
            ctx.filter = 'brightness(0.58) saturate(0.58) contrast(0.88)';
            ctx.drawImage(backMountainImg, backX, backY, backW, backH);
            ctx.filter = 'none';
            ctx.restore();
        }

        if (passReady) {
            ctx.save();
            ctx.filter = 'brightness(0.74) saturate(0.66) contrast(0.9)';
            ctx.drawImage(passImg, passX, passY, passW, passH);
            ctx.filter = 'none';
            ctx.restore();
        }
        return true;
    }

    // ボス部屋の右3/4から画面右端にかけて次ステージへの「出入口」を描画
    // 空はそのままに、地形・建造物だけを右端に固定配置する
    renderNextStagePeek(ctx) {
        const gY   = this.groundY;
        const p    = this.progress;
        // ラストオブジェクトは地面と同じパララックス(1.0)でワールド配置にする。
        // stage4の城(renderStageElementsで worldX - p)に仕様を統一し、近景がわずかに
        // ずれて流れる(0.98)違和感をなくす。peekWX(xFixed)/peekAnchorX/toSx は
        // peekPara=1.0 のとき「ボス部屋左端を基準にしたスクリーン固定座標」を返すため、
        // カメラ停止時の見た目は従来どおりで、接近中の流入だけが地面と同速になる。
        const peekPara = 1.0;
        // ラストオブジェクトは peekWX(画面右寄りの固定スクリーンx) で配置する。
        // peekPara=1.0 では peekWX(xFixed) はカメラ停止時に xFixed を返し、接近中は
        // ボス部屋左端基準で右から流入する（＝地面と同じワールド配置・パララックス1.0）。
        const peekBase = this.maxProgress - 150; // ボス部屋右端寄りに（手前の添景と分離・見切れ防止）
        const peekAnchorX = (peekBase - p) * peekPara; // 基準点のスクリーンx

        // 固定スクリーン座標→ワールド追従への変換。カメラ停止時(p=maxProgress-CANVAS_WIDTH)に
        // peekAnchorX===ANCHOR_STOP となり peekWX(xFixed)===xFixed。停止時の見た目を保持しつつ接近中は右から流入。
        const ANCHOR_STOP = (peekBase - (this.maxProgress - CANVAS_WIDTH)) * peekPara;
        const peekWX = (xFixed) => peekAnchorX + (xFixed - ANCHOR_STOP);

        // 完全に画面外右ならスキップ
        if (peekAnchorX > CANVAS_WIDTH + 600) return;

        ctx.save();

        switch (this.stageNumber) {

            // Stage2は専用の固定ワールドオブジェクトとして描くため、ここではStage3/4だけを扱う。

            // ─── Stage3（山道） → Stage4（城下町）───────────────────────────
            // 山道を抜けた先に城下町の屋根が見える。瓦屋根のシルエットと石畳の始まり
            case 3: {
                const exitImg = this.stage3ExitImage;
                if (exitImg && exitImg.complete && exitImg.naturalWidth > 0) {
                    const exitW = 680;
                    const exitH = exitW * (exitImg.naturalHeight / exitImg.naturalWidth);
                    const exitX = peekWX(CANVAS_WIDTH - exitW + 18);
                    // 画像下部に透明余白が約10.8%あるため、不透明部分の下端で接地させる。
                    const visibleBottomRatio = 829 / 929;
                    const exitY = Math.round(gY + 8 - exitH * visibleBottomRatio);
                    if (exitX + exitW < -80 || exitX > CANVAS_WIDTH + 120) break;

	                    ctx.save();
	                    ctx.globalAlpha *= 0.96;
	                    ctx.filter = 'brightness(0.84) saturate(0.72) contrast(0.94)';
	                    ctx.drawImage(exitImg, exitX, exitY, exitW, exitH);
	                    ctx.filter = 'none';
	                    ctx.restore();
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

    renderStage1FixedRoadMountains(ctx) {
        const cameraX = Math.floor(this.progress);
        const startX = this.getStage1BambooTreeLineX() - cameraX;
        if (startX >= CANVAS_WIDTH) return false;

        ctx.save();
        ctx.beginPath();
        ctx.rect(startX, -400, CANVAS_WIDTH - startX, CANVAS_HEIGHT + 800);
        ctx.clip();
        ctx.translate(startX, 0);

        const stage2Start = { far: '#607182', mid: '#728595', near: '#8398a8' };
        const fixedStage2Options = { progress: 0, noiseStageNumber: 2 };
        this.renderBackgroundLayer(ctx, stage2Start.far, 0.2, 0.7, 100, fixedStage2Options);
        this.renderBackgroundLayer(ctx, stage2Start.mid, 0.4, 0.8, 60, fixedStage2Options);
        this.renderBackgroundLayer(ctx, stage2Start.near, 0.7, 1, 20, fixedStage2Options);

        ctx.restore();
        return true;
    }

    renderBackgroundLayer(ctx, color, parallax, alpha, yOffsetBase = 50, options = {}) {
        ctx.save();
        ctx.globalAlpha *= alpha;

        const segmentBase = 230 + parallax * 130;
        const renderProgress = options.progress ?? this.progress;
        const noiseStageNumber = options.noiseStageNumber ?? this.stageNumber;
        const noise1D = (seed) => this.noise1DForStage(seed, noiseStageNumber);
        const noiseSigned = (seed) => this.noiseSignedForStage(seed, noiseStageNumber);
        const scroll = renderProgress * parallax;
        const offset = ((scroll % segmentBase) + segmentBase) % segmentBase;
        const start = -2;
        const end = Math.ceil(CANVAS_WIDTH / segmentBase) + 3;

        for (let i = start; i <= end; i++) {
            const worldIndex = i + Math.floor(scroll / segmentBase);
            const seed = worldIndex * (8.17 + parallax * 4.31);
            const ridgeW = segmentBase * (0.8 + noise1D(seed + 0.93) * 0.95);
            const x = i * segmentBase - offset + noiseSigned(seed + 1.27) * (segmentBase * 0.18);

            const hA = Math.max(22, yOffsetBase + 24 + noiseSigned(seed + 2.11) * 38);
            const hB = Math.max(18, yOffsetBase + 10 + noiseSigned(seed + 3.73) * 34);
            const hC = Math.max(12, yOffsetBase - 8 + noiseSigned(seed + 5.19) * 28);
            const hD = Math.max(10, yOffsetBase - 2 + noiseSigned(seed + 6.41) * 24);

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

            const shade = ctx.createLinearGradient(0, this.groundY - hA, 0, this.groundY);
            shade.addColorStop(0, `rgba(255,255,255,${0.07 * alpha})`);
            shade.addColorStop(0.45, 'rgba(255,255,255,0)');
            shade.addColorStop(1, `rgba(24,34,50,${0.16 * alpha})`);
            ctx.fillStyle = shade;
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + 0.04 * alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }

    renderStage3DistantMountainBands(ctx, currentPalette, progress) {
        const drawMountainBand = (parallax, spanBase, peakBase, color, alpha) => {
            const scroll = progress * parallax;
            const offset = ((scroll % spanBase) + spanBase) % spanBase;
            const start = -2;
            const end = Math.ceil(CANVAS_WIDTH / spanBase) + 3;
            ctx.save();
            ctx.globalAlpha *= alpha;
            ctx.fillStyle = color;

            for (let i = start; i <= end; i++) {
                const worldIndex = i + Math.floor(scroll / spanBase);
                const seed = worldIndex * (6.41 + parallax * 7.2);
                const ridgeW = spanBase * (0.85 + this.noise1D(seed + 0.7) * 0.9);
                const x = i * spanBase - offset + this.noiseSigned(seed + 1.9) * 80;
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

        const mist = ctx.createLinearGradient(0, this.groundY - 190, 0, this.groundY - 18);
        mist.addColorStop(0, 'rgba(220, 210, 230, 0)');
        mist.addColorStop(0.72, 'rgba(196, 182, 210, 0.09)');
        mist.addColorStop(1, 'rgba(196, 182, 210, 0)');
        ctx.fillStyle = mist;
        ctx.fillRect(0, this.groundY - 190, CANVAS_WIDTH, 180);
    }
    
    getStage3RoadsidePropPlan() {
        return [
            { type: 'woodFence', worldX: 980,  height: 92,  y: 3, alpha: 0.88 },
            { type: 'stoneLantern', worldX: 1480, height: 110, y: 2, alpha: 0.82 },
            { type: 'signpost', worldX: 2660, height: 112, y: 4, alpha: 0.88 },
            { type: 'dosojin', worldX: 4210, height: 70,  y: 4, alpha: 0.88 },
            { type: 'mountainSign', worldX: 5700, height: 126, y: 4, alpha: 0.86 },
            { type: 'jizoLarge', worldX: 6550, height: 94, y: 4, alpha: 0.86 },
            { type: 'woodFence', worldX: 7350, height: 82, y: 4, alpha: 0.84 },
            { type: 'stoneLantern', worldX: 9860, height: 96, y: 3, alpha: 0.78 }
        ];
    }

    getStage3PropAspect(type) {
        const image = this.stage3PropImages?.[type];
        if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
            return image.naturalWidth / image.naturalHeight;
        }
        const fallbackAspect = {
            dosojin: 628 / 760,
            jizoLarge: 276 / 760,
            mountainSign: 393 / 760,
            signpost: 429 / 760,
            stoneLantern: 348 / 760,
            woodFence: 760 / 418
        };
        return fallbackAspect[type] || 1;
    }

    renderStage3RoadsideProps(ctx) {
        const images = this.stage3PropImages;
        if (!images) return;

        const props = this.getStage3RoadsidePropPlan();

        for (const prop of props) {
            const image = images[prop.type];
            if (!image || !image.complete || image.naturalWidth <= 0) continue;

            const width = prop.height * (image.naturalWidth / image.naturalHeight);
            const x = prop.worldX - this.progress;
            if (x + width < -80 || x > CANVAS_WIDTH + 80) continue;

            const y = this.groundY - prop.height + prop.y;
            ctx.save();
            ctx.globalAlpha *= prop.alpha;
            ctx.filter = 'brightness(0.66) sepia(0.22) saturate(0.68) contrast(0.86) hue-rotate(-6deg)';
            ctx.drawImage(image, x, y, width, prop.height);
            ctx.filter = 'none';
            ctx.restore();
        }
    }

    renderStage3RoadsideClusters(ctx) {
        const images = this.stage3PropImages;
        if (!images) return;

        const plan = [
            { type: 'woodFence', h: 68, alpha: 0.7, xBias: -34 },
            null,
            { type: 'woodFence', h: 72, alpha: 0.72, xBias: 28 },
            { type: 'jizoLarge', h: 76, alpha: 0.7, xBias: -18 },
            null,
            { type: 'stoneLantern', h: 88, alpha: 0.68, xBias: 18 },
            null
        ];
        const span = 620;
        const scroll = this.progress;
        const start = Math.floor((scroll - 760) / span);
        const end = Math.ceil((scroll + CANVAS_WIDTH + 760) / span);
        const finalClearWorldX = Math.max(0, this.maxProgress - CANVAS_WIDTH + 360);
        const occupiedRanges = this.getStage3RoadsidePropPlan()
            .map((prop) => {
                const width = prop.height * this.getStage3PropAspect(prop.type);
                const x = prop.worldX - scroll;
                return { left: x - 58, right: x + width + 58 };
            })
            .filter((range) => range.right >= -220 && range.left <= CANVAS_WIDTH + 220);
        const overlapsOccupied = (left, right) => occupiedRanges.some((range) => left < range.right && right > range.left);

        for (let i = start; i <= end; i++) {
            const seed = i * 7.91;
            const item = plan[((i % plan.length) + plan.length) % plan.length];
            if (!item || this.noise1D(seed + 0.4) < 0.2) continue;

            const worldX = i * span + this.noiseSigned(seed + 1.6) * 74;
            if (worldX > finalClearWorldX) continue;

            const x = worldX - scroll;
            const image = images[item.type];
            if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) continue;

            const height = item.h * (0.92 + this.noise1D(seed + 3.4) * 0.16);
            const width = height * (image.naturalWidth / image.naturalHeight);
            const drawX = x + item.xBias;
            if (drawX + width < -120 || drawX > CANVAS_WIDTH + 120) continue;
            const occupiedLeft = drawX - 46;
            const occupiedRight = drawX + width + 46;
            if (overlapsOccupied(occupiedLeft, occupiedRight)) continue;
            occupiedRanges.push({ left: occupiedLeft, right: occupiedRight });

            ctx.save();
            ctx.globalAlpha *= item.alpha;
            ctx.filter = 'brightness(0.62) sepia(0.22) saturate(0.68) contrast(0.88) hue-rotate(-6deg)';
            ctx.drawImage(image, drawX, this.groundY - height + 4, width, height);
            ctx.filter = 'none';
            ctx.restore();
        }
    }

	renderStage4TownImageBlock(ctx, image, x, baseY, width, alpha = 1, filter = 'brightness(0.84) saturate(0.66) contrast(0.88)') {
	    if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

	    const height = width * (image.naturalHeight / image.naturalWidth);
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.filter = filter;
        ctx.drawImage(image, x, baseY - height + 3, width, height);
        ctx.filter = 'none';
	    ctx.restore();
	    return true;
	}

    getStage4CastleLowerMetrics(image, height) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;

        const sourceX = Math.round(image.naturalWidth * 0.25);
        const sourceY = Math.round(image.naturalHeight * 0.16);
        const sourceW = image.naturalWidth - sourceX;
        const sourceH = Math.round(image.naturalHeight * 0.71);
        const width = height * (sourceW / sourceH);
        return { sourceX, sourceY, sourceW, sourceH, width };
    }

    renderStage4CastleLower(ctx, image, x, baseY, height) {
        const metrics = this.getStage4CastleLowerMetrics(image, height);
        if (!metrics) return false;

        const y = baseY - height + 8;

	    ctx.save();
	    ctx.filter = 'brightness(0.82) saturate(0.68) contrast(0.94)';
	    ctx.drawImage(
	        image,
	        metrics.sourceX,
	        metrics.sourceY,
	        metrics.sourceW,
	        metrics.sourceH,
	        x,
	        y,
	        metrics.width,
	        height
	    );
	    ctx.filter = 'none';
	    ctx.restore();
	    return true;
	}

    getStage4CastleRampartDrawSpec(startWorldX, endWorldX, baseY) {
        const width = endWorldX - startWorldX;
        if (width <= 0) return null;

        const height = 328;
        const drawY = baseY - height + 5;
        return {
            worldX: startWorldX,
            width,
            height,
            drawY,
            roofY: drawY + 70,
            sourceXRatio: 0,
            sourceYRatio: 0.13,
            sourceWRatio: 1,
            sourceHRatio: 0.76
        };
    }

    renderStage4CastleRampart(ctx, image, startWorldX, endWorldX, p, baseY) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const spec = this.getStage4CastleRampartDrawSpec(startWorldX, endWorldX, baseY);
        if (!spec) return false;

        const x = spec.worldX - p;
        if (x + spec.width < -180 || x > CANVAS_WIDTH + 180) return false;

        const sourceX = Math.round(image.naturalWidth * spec.sourceXRatio);
        const sourceY = Math.round(image.naturalHeight * spec.sourceYRatio);
        const sourceW = Math.round(image.naturalWidth * spec.sourceWRatio);
        const sourceH = Math.round(image.naturalHeight * spec.sourceHRatio);

        ctx.save();
        ctx.filter = 'brightness(0.75) saturate(0.68) contrast(0.9)';
        ctx.drawImage(
            image,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            x,
            spec.drawY,
            spec.width,
            spec.height
        );
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage4ApproachFarStrip(ctx, image, startWorldX, endWorldX, p, baseY) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const span = Math.max(1, endWorldX - startWorldX);
        const width = Math.min(2180, span);
        const height = width * (image.naturalHeight / image.naturalWidth);
        const x = endWorldX - width - p;
        if (x + width < -180 || x > CANVAS_WIDTH + 180) return false;

        ctx.save();
        ctx.globalAlpha *= 0.64;
        ctx.filter = 'brightness(0.54) saturate(0.58) contrast(0.84)';
        ctx.drawImage(image, x, baseY - height + 8, width, height);
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage4ApproachTower(ctx, image, worldX, p, baseY, width, alpha = 1) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const height = width * (image.naturalHeight / image.naturalWidth);
        const x = worldX - p;
        if (x + width < -140 || x > CANVAS_WIDTH + 140) return false;

        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.filter = 'brightness(0.78) saturate(0.68) contrast(0.9)';
        ctx.drawImage(image, x, baseY - height + 4, width, height);
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage4CastleApproach(ctx, p, baseY) {
        const approachImage = this.stage4TownImages?.castleApproachDistrict;
        const layout = this.getStage4CastleApproachLayout();
        if (!layout) return false;

        const x = layout.approachWorldX - p;
        if (!approachImage || !approachImage.complete || approachImage.naturalWidth <= 0 || approachImage.naturalHeight <= 0) return false;
        const width = layout.approachWidth || layout.approachHeight * (approachImage.naturalWidth / approachImage.naturalHeight);
        if (x + width < -180 || x > CANVAS_WIDTH + 180) return false;

        ctx.save();
        ctx.globalAlpha *= 0.96;
        ctx.filter = 'brightness(0.82) saturate(0.72) contrast(0.92)';
        ctx.drawImage(approachImage, x, baseY - layout.approachHeight + 3, width, layout.approachHeight);
        ctx.filter = 'none';
        ctx.restore();

        return true;
    }

    renderStageBackdropTile(ctx, image, progress, {
        parallax = 0.35,
        drawHeight = CANVAS_HEIGHT,
        bottomY = CANVAS_HEIGHT,
        alpha = 1,
        filter = 'none',
        widthScale = 1,
        mirrorRepeat = false
    } = {}) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const drawH = Math.max(1, Math.ceil(drawHeight));
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight) * widthScale);
        const scroll = progress * parallax;
        const offset = ((scroll % drawW) + drawW) % drawW;
        const startX = -offset - drawW;
        const y = Math.round(bottomY - drawH);

        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.filter = filter;
        for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW) {
            // 反転の偶奇は「世界側のタイル番号」で決める。画面側の番号(x+offset)で決めると
            // スクロールがタイル幅を跨いだ瞬間に全タイルの反転が入れ替わり、画面全体がガクッと切り替わる。
            if (mirrorRepeat && Math.abs(Math.round((x + scroll) / drawW)) % 2 === 1) {
                ctx.save();
                ctx.translate(Math.round(x + drawW + 2), y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, Math.round(x), y, drawW + 2, drawH);
            }
        }
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6BackdropRegion(ctx, image, progress, {
        worldStart,
        worldEnd,
        drawHeight,
        bottomY,
        filter = 'none',
        widthScale = 1,
        mirrorRepeat = false
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const screenStart = worldStart - progress;
        const screenEnd = worldEnd - progress;
        if (screenEnd <= 0 || screenStart >= CANVAS_WIDTH) return false;

        const drawH = Math.max(1, Math.ceil(drawHeight));
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight) * widthScale);
        const firstTile = Math.floor((progress - worldStart) / drawW) - 1;
        const lastTile = Math.ceil((progress + CANVAS_WIDTH - worldStart) / drawW) + 1;
        const y = Math.round(bottomY - drawH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(
            Math.max(0, screenStart),
            -400,
            Math.max(0, Math.min(CANVAS_WIDTH, screenEnd) - Math.max(0, screenStart)),
            CANVAS_HEIGHT + 800
        );
        ctx.clip();
        ctx.filter = filter;

        for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex++) {
            const x = Math.round(worldStart + tileIndex * drawW - progress);
            if (mirrorRepeat && Math.abs(tileIndex) % 2 === 1) {
                ctx.save();
                ctx.translate(x + drawW + 2, y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
        }

        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6FixedBackdrop(ctx, image, worldCenterX, progress, {
        drawHeight,
        bottomY,
        filter = 'none',
        bottomOffset = 0
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const drawH = Math.max(1, Math.ceil(drawHeight));
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const x = Math.round(worldCenterX - progress - drawW * 0.5);
        if (x + drawW <= 0 || x >= CANVAS_WIDTH) return false;

        ctx.save();
        ctx.filter = filter;
        ctx.drawImage(image, x, Math.round(bottomY - drawH + bottomOffset), drawW, drawH);
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    /**
     * Stage6 螺旋回廊: 柵越しに見える眼下のパノラマ。
     * 高度の証拠として、ゾーン(=cornersClimbed)ごとに層セットを丸ごと切り替える。
     * 低パララックス層をワールドXで区切るとシームが画面上を漂うため、
     * 切替はゾーンindexで行い、実際の切替は角遷移の完全暗転中に起こる。
     * 距離の層: 遠景=その方角の土地(地平線際)、近景=下層屋根と城下(共通)、上層ゾーンは雲。
     */
    renderStage6Panorama(ctx, progress) {
        const zone = Math.max(0, Math.min(3, this.cornersClimbed || 0));
        const farFilter = 'brightness(0.82) saturate(0.7)';
        const nearFilter = 'brightness(0.85) saturate(0.72)';

        // 各ゾーン背景の柵(不透明バンド)上端の世界y実測値。パノラマ帯はこの上に覗かせる。
        // 高度進行の主役は城下の屋根(town_near): 巡回ごとに縮小しながら柵の裏へ沈み、最後は霞に消える。
        // 遠景(竹林/街道/連山)は「遠いものは高さで見え方がほぼ変わらない」ためサイズを保ち、題材だけ方角で変える。
        const FENCE_TOP_Y = [380, 348, 365, 372];
        const fence = FENCE_TOP_Y[zone];

        if (zone === 0) {
            // 一巡目: まだ低い。城下の大屋根がすぐ目の高さに大きく迫る。
            this.renderStageBackdropTile(ctx, this.stage6PanoramaBambooFarImage, progress, {
                parallax: 0.08, drawHeight: 240, bottomY: fence + 30, filter: farFilter, mirrorRepeat: false
            });
            this.renderStageBackdropTile(ctx, this.stage6PanoramaTownNearImage, progress, {
                parallax: 0.2, drawHeight: 300, bottomY: fence + 30, alpha: 0.97, filter: nearFilter, mirrorRepeat: false
            });
        } else if (zone === 1) {
            // 二巡目: 一段登った。屋根が小さくなり、柵の裏へ沈み始める。方角が変わり街道筋が見える。
            this.renderStageBackdropTile(ctx, this.stage6PanoramaKaidoFarImage, progress, {
                parallax: 0.08, drawHeight: 220, bottomY: fence + 30, filter: farFilter, mirrorRepeat: false
            });
            this.renderStageBackdropTile(ctx, this.stage6PanoramaTownNearImage, progress, {
                parallax: 0.16, drawHeight: 165, bottomY: fence + 42, alpha: 0.9, filter: nearFilter, mirrorRepeat: false
            });
        } else if (zone === 2) {
            // 三巡目: 屋根は棟先が柵際に覗くだけ。視界は遠くの連山まで開ける。
            this.renderStageBackdropTile(ctx, this.stage6PanoramaMountainsFarImage, progress, {
                parallax: 0.06, drawHeight: 200, bottomY: fence + 30, filter: farFilter, mirrorRepeat: false
            });
            this.renderStageBackdropTile(ctx, this.stage6PanoramaTownNearImage, progress, {
                parallax: 0.14, drawHeight: 95, bottomY: fence + 48, alpha: 0.78, filter: nearFilter, mirrorRepeat: false
            });
        } else {
            // 四巡目(最上層): 遠くの連山と夜明けのみ。
            // 半透明の「霞に沈む町」バンドと屋根レベルの靄バンドは廃止した——
            // 明るい空を背景にした半透明要素は浮遊物に見え、屋根に乗る靄は
            // 「歩いている屋根が透けている」ように読めるため(靄の焼き込み禁止と同じ理由)。
            // bottomYは向こう側斜面(flanks)の不透明上端(≈427)より深く差し込む。
            // 浅いと連山の裾と斜面の間に素の空が横一線に露出し「謎の空白ライン」になる。
            this.renderStageBackdropTile(ctx, this.stage6PanoramaMountainsFarImage, progress, {
                parallax: 0.06, drawHeight: 190, bottomY: fence + 60, filter: farFilter, mirrorRepeat: false
            });
        }
    }

    /** Stage6: 指定した角の全高壁画像が使えるか */
    getStage6CornerWallImage(cornerIndex) {
        const img = this.stage6CornerWallImages?.[cornerIndex];
        return (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) ? img : null;
    }

    /**
     * Stage6 螺旋回廊: 角の全高壁の描画。
     * ゾーン境界の先(次の面)を視界から隠す「関所」。地上の通用門をくぐると暗転遷移する。
     * 通過済みの角にも描き続ける(暗転明けに壁が背後へ残り、通ってきた構造として矛盾しない)。
     *
     * 投影文法: このゲームの地面帯(y=groundY..720)は「俯瞰で手前へ後退する床面」で、
     * 立面を差し込んでよいのは y<足元ライン(groundY+LANE_OFFSET=512) だけ(stage1〜5の全構造物と同じ)。
     * そこで壁画像は「開口下端=画像y比0.711」より上だけを切り出して y=0..512 に描く。
     * 0.711×720=512 なのでアスペクトは完全維持され、石垣部(0.711以深)は使わない。
     * 床帯には床テクスチャと敷居ストリップ(renderStage6GroundThresholds)がそのまま残り、
     * 「門の下を床が通り抜ける」という他ステージの門・出入口と同じ語彙になる。
     * 画像未読込時は描かない(従来の透かし櫓背景がフォールバックとして残る)。
     */
    renderStage6CornerWalls(ctx, scrollX) {
        if (this.stageNumber !== 6) return;
        const frameW = STAGE6_CORNER.WALL_LEFT_PX + STAGE6_CORNER.WALL_RIGHT_PX;
        const laneY = this.groundY + LANE_OFFSET; // 512 = 通用門の開口下端の着地先(足元ライン)
        for (let i = 0; i < STAGE6_CORNER.CORNER_XS.length; i++) {
            const cornerX = STAGE6_CORNER.CORNER_XS[i];

            // 角3(大屋根への出口)だけは、くぐった後は回廊の妻壁ではなく
            // 「屋根に突き出た出口の破風」に差し替える(廊下の建物が屋根の上に立つ矛盾を避ける)。
            // アセット未配置時は従来どおり妻壁を描き続ける。
            if (i === 2 && this.cornersClimbed >= 3 && this.isStage6ImageReady(this.stage6RoofExitGableImage)) {
                const gable = this.stage6RoofExitGableImage;
                const gW = 380;
                const gH = Math.round(gW * (gable.naturalHeight / gable.naturalWidth));
                const gx = Math.round(cornerX + STAGE6_CORNER.WALL_RIGHT_PX - gW - scrollX);
                if (gx + gW > 0 && gx < CANVAS_WIDTH) {
                    ctx.save();
                    ctx.filter = 'brightness(0.86) saturate(0.76)';
                    ctx.drawImage(gable, gx, laneY - gH, gW, gH);
                    ctx.filter = 'none';
                    const gGrad = ctx.createLinearGradient(0, laneY, 0, laneY + 22);
                    gGrad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
                    gGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = gGrad;
                    ctx.fillRect(gx, laneY, gW, 22);
                    ctx.restore();
                }
                continue;
            }

            const img = this.getStage6CornerWallImage(i);
            if (!img) continue;
            const x = Math.round(cornerX - STAGE6_CORNER.WALL_LEFT_PX - scrollX);
            if (x + frameW <= 0 || x >= CANVAS_WIDTH) continue;
            ctx.save();
            ctx.filter = 'brightness(0.86) saturate(0.76)';
            // 画像全面を枠(WALL_LEFT+WALL_RIGHT)×512に描く。
            // v5(2304×1456)は枠810×512と同比率でぴったり。v4(2048×1456)は暫定で横+12%伸びるが
            // 門下端=画像最下端の関係と壁右端までの遮蔽が保たれることを優先する。
            ctx.drawImage(img, x, 0, frameW, laneY);
            ctx.filter = 'none';

            // 接地影: 基部と俯瞰床の継ぎ目を沈める(エンティティの落ち影と同じ考え方)
            const shadowH = 26;
            const grad = ctx.createLinearGradient(0, laneY, 0, laneY + shadowH);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x, laneY, frameW, shadowH);
            ctx.restore();
        }
    }

    renderStage6BackdropZones(ctx, progress) {
        const zoneWidth = this.maxProgress / 4;
        const drawHeight = Math.max(420, this.groundY * 0.8);
        const bottomY = this.groundY + 30;
        const filter = 'brightness(0.84) saturate(0.8) contrast(0.98)';

        const cornerX = zoneWidth;
        const roofGateX = zoneWidth * 2;
        const finalThresholdX = zoneWidth * 3;

        // ゾーン背景は境界で正確に突き合わせ、その上に関所(全高壁/透かし櫓)を重ねる。
        // 以前は透かし櫓の半幅ぶん背景側に隙間を空けていたが、暗転明けのカメラ位置によって
        // 隙間や櫓の切れ端が露出し「ループの継ぎ目」に見えるため廃止した。
        // 境界の絵柄ジョイントは関所オーバーレイの不透明部が覆う。
        const zones = [
            {
                image: this.stage6TenshuBackdropImage,
                start: 0,
                end: cornerX,
                mirrorRepeat: false
            },
            {
                image: this.stage6UpperGalleryImage,
                start: cornerX,
                end: roofGateX,
                mirrorRepeat: true
            },
            {
                image: this.stage6RoofRidgeImage,
                start: roofGateX,
                end: finalThresholdX,
                mirrorRepeat: true
            },
            {
                // 大棟化: 四巡目は柵なしの「奥側屋根斜面+破風」帯(シームレス素直ループ)。
                // 向こう側斜面は強い前縮みで「棟際の薄い帯」にしか見えないはずなので、
                // 描画高さを圧縮する(フルサイズだと瓦の壁が立ち上がって見え、別の屋根と誤読される)。
                // 未配置の間は従来の柵付きテラス背景(ミラータイル・フルサイズ)。
                image: this.isStage6ImageReady(this.stage6RidgeFlanksImage)
                    ? this.stage6RidgeFlanksImage
                    : this.stage6FinalTerraceImage,
                start: finalThresholdX,
                end: this.maxProgress,
                mirrorRepeat: !this.isStage6ImageReady(this.stage6RidgeFlanksImage),
                drawHeight: this.isStage6ImageReady(this.stage6RidgeFlanksImage) ? 250 : undefined
            }
        ];

        for (const zone of zones) {
            this.renderStage6BackdropRegion(ctx, zone.image, progress, {
                worldStart: zone.start,
                worldEnd: zone.end,
                drawHeight: zone.drawHeight || drawHeight,
                bottomY,
                filter,
                mirrorRepeat: zone.mirrorRepeat
            });
        }

        // 透かし絵の境界ランドマーク(フォールバック)は、
        // ・全高壁アセットが使える角では描かない(壁が主役になる)
        // ・通過済みの角でも描かない(暗転明けに切れ端が画面左に露出して継ぎ目に見えるため。
        //   消える瞬間は完全暗転中で見えず、後退クランプで戻ることもできない)
        const climbed = this.cornersClimbed || 0;
        if (!this.getStage6CornerWallImage(0) && climbed <= 0) {
            this.renderStage6FixedBackdrop(ctx, this.stage6CornerTurretImage, cornerX, progress, {
                drawHeight,
                bottomY,
                filter
            });
        }
        if (!this.getStage6CornerWallImage(1) && climbed <= 1) {
            this.renderStage6FixedBackdrop(ctx, this.stage6RoofGateImage, roofGateX, progress, {
                drawHeight,
                bottomY,
                filter
            });
        }
        if (!this.getStage6CornerWallImage(2) && climbed <= 2) {
            this.renderStage6FixedBackdrop(ctx, this.stage6FinalThresholdImage, finalThresholdX, progress, {
                drawHeight,
                bottomY,
                filter,
                bottomOffset: Math.round(drawHeight * 0.16)
            });
        }

        // ボス背後のランドマーク: 大棟化後は棟端の巨大金鯱、未配置の間は従来の東屋。
        const useShachi = this.isStage6ImageReady(this.stage6RidgeShachiImage);
        const landmark = useShachi ? this.stage6RidgeShachiImage : this.stage6BossPavilionImage;
        if (landmark?.complete && landmark.naturalWidth > 0 && landmark.naturalHeight > 0) {
            const landmarkHeight = useShachi ? Math.round(drawHeight * 1.06) : drawHeight;
            const landmarkWidth = Math.ceil(landmarkHeight * (landmark.naturalWidth / landmark.naturalHeight));
            this.renderStage6FixedBackdrop(
                ctx,
                landmark,
                this.maxProgress - landmarkWidth * 0.5 - (useShachi ? 40 : 0),
                progress,
                { drawHeight: landmarkHeight, bottomY, filter }
            );
        }
    }

    /** stage6アセットが読込済みで使えるか(404はcomplete=trueでもnaturalWidth=0) */
    isStage6ImageReady(img) {
        return !!(img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
    }

    renderStage1BambooImageBackdrop(ctx, progress) {
        let rendered = false;

        rendered = this.renderStage1BambooLayer(ctx, this.stage1BambooBackLayerImage, progress, {
            parallax: 0.96,
            drawHeight: 742,
            widthScale: 1,
            bottomOffset: 112,
            endInset: 72,
            phase: 390,
            alpha: 1,
            filter: 'brightness(0.5) saturate(0.7) contrast(0.76) hue-rotate(8deg)',
            mirrorRepeat: true
        }) || rendered;
        rendered = this.renderStage1BambooLayer(ctx, this.stage1BambooMidLayerImage, progress, {
            parallax: 0.985,
            drawHeight: 792,
            widthScale: 1.15,
            bottomOffset: 126,
            endInset: 46,
            phase: 130,
            alpha: 1,
            filter: 'brightness(0.64) saturate(0.76) contrast(0.88) hue-rotate(4deg)',
            mirrorRepeat: true
        }) || rendered;
        rendered = this.renderStage1BambooLayer(ctx, this.stage1BambooFrontLayerImage, progress, {
            parallax: 1,
            drawHeight: 836,
            widthScale: 0.92,
            bottomOffset: 140,
            endInset: 24,
            alpha: 1,
            filter: 'brightness(0.78) saturate(0.94) contrast(1.02)',
            mirrorRepeat: true
        }) || rendered;

        return rendered;
    }

    renderStage1BambooLayer(ctx, image, progress, {
        parallax,
        drawHeight,
        widthScale,
        bottomOffset,
        endInset,
        phase = 0,
        alpha = 1,
        filter,
        mirrorRepeat
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const fixedCameraX = Math.floor(progress);
        const treeLineX = this.getStage1BambooTreeLineX() - fixedCameraX;
        const clipRight = Math.max(0, Math.min(CANVAS_WIDTH, treeLineX - endInset));
        if (clipRight <= 0) return false;

        const drawH = Math.min(CANVAS_HEIGHT + 160, drawHeight);
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight) * widthScale);
        const y = Math.round(this.groundY + bottomOffset - drawH);
        const layerScroll = progress * parallax + phase;
        const firstTile = Math.floor(layerScroll / drawW) - 1;
        const lastTile = Math.ceil((layerScroll + CANVAS_WIDTH) / drawW) + 1;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, -400, clipRight, CANVAS_HEIGHT + 800);
        ctx.clip();
        ctx.globalAlpha *= alpha;
        ctx.filter = filter;
        for (let tile = firstTile; tile <= lastTile; tile++) {
            const x = Math.round(tile * drawW - layerScroll);
            if (x + drawW < -2 || x > CANVAS_WIDTH + 2) continue;
            if (mirrorRepeat && Math.abs(tile) % 2 === 1) {
                ctx.save();
                ctx.translate(x + drawW + 2, y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
        }
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

	renderStageElements(ctx, currentPalette) {
        const p = this.progress;
        
        // currentPaletteから時間帯的なニュアンスを得るため、
        // 遠景(far)の色から暗さを推測して少し補正に使うことも可能
        
        switch (currentPalette.elements) {
            case 'bamboo': {
                this.renderStage1BambooImageBackdrop(ctx, p);
                break;
            }
                
            case 'kaido': {
                // Stage2の建物・添景は生成画像アセットだけで描く。旧Canvas建物フォールバックは使わない。
                const kPara = 1.0;
                const houseLimit = (this.maxProgress - CANVAS_WIDTH) * kPara - 200;
                const sceneLimit = houseLimit + 420;
                const isImageReady = (image) => image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
                const stage2RuralPropPlan = [
                    { key: 'ruralFarmhouse', h: 244, xBias: -10, filter: 'brightness(0.76) saturate(0.72) contrast(0.9)' },
                    { key: 'ruralTeahouse', h: 232, xBias: 12, filter: 'brightness(0.75) saturate(0.7) contrast(0.9)' },
                    { key: 'ruralShed', h: 202, xBias: -18, filter: 'brightness(0.7) saturate(0.64) contrast(0.88)' },
                    null,
                    { key: 'ruralFarmhouse', h: 236, xBias: 22, filter: 'brightness(0.74) saturate(0.68) contrast(0.88)' },
                    { key: 'ruralTeahouse', h: 220, xBias: -14, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    { key: 'ruralShrine', h: 176, xBias: 18, filter: 'brightness(0.7) saturate(0.64) contrast(0.86)' },
                    null,
                    { key: 'ruralShed', h: 196, xBias: 18, filter: 'brightness(0.69) saturate(0.63) contrast(0.86)' },
                    { key: 'ruralFarmhouse', h: 252, xBias: -16, filter: 'brightness(0.76) saturate(0.7) contrast(0.88)' },
                    { key: 'ruralTeahouse', h: 214, xBias: 20, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    null,
                    { key: 'ruralShed', h: 188, xBias: -4, filter: 'brightness(0.68) saturate(0.6) contrast(0.86)' }
                ];
                const stage2RoadsideDetailPlan = [
                    { key: 'cleanLowFence', h: 82, xBias: -18, filter: 'brightness(0.76) saturate(0.7) contrast(0.92)' },
                    { key: 'cleanStrawBundles', h: 88, xBias: 18, filter: 'brightness(0.78) saturate(0.74) contrast(0.92)' },
                    { key: 'cleanJars', h: 68, xBias: -10, filter: 'brightness(0.76) saturate(0.7) contrast(0.92)' },
                    null,
                    { key: 'cleanGrassClump', h: 58, xBias: 18, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    { key: 'cleanWoodSignpost', h: 122, xBias: -18, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    { key: 'cleanLowFence', h: 72, xBias: 24, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    { key: 'cleanStoneWell', h: 132, xBias: -8, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    null,
                    { key: 'cleanJars', h: 62, xBias: 22, filter: 'brightness(0.74) saturate(0.68) contrast(0.88)' },
                    { key: 'cleanStrawBundles', h: 78, xBias: -20, filter: 'brightness(0.74) saturate(0.68) contrast(0.9)' },
                    { key: 'cleanGrassClump', h: 52, xBias: 10, filter: 'brightness(0.72) saturate(0.66) contrast(0.88)' },
                    { key: 'cleanJizo', h: 96, xBias: -14, filter: 'brightness(0.7) saturate(0.62) contrast(0.86)' }
                ];
                const ruralImagesReady = stage2RuralPropPlan.some((item) => item && isImageReady(this.stage2PropImages?.[item.key]));
                const roadDetailsReady = stage2RoadsideDetailPlan.some((item) => item && isImageReady(this.stage2PropImages?.[item.key]));

                if (ruralImagesReady) {
                    const slotSpan = 470;
                    const propStart = Math.floor((p * kPara - 640) / slotSpan);
                    const propEnd = Math.ceil((CANVAS_WIDTH + p * kPara + 640) / slotSpan);
                    const propBaseY = this.groundY + 2;
                    const stage2HouseWorldBounds = [];

                    for (let i = propStart; i <= propEnd; i++) {
                        const seed = i * 8.37;
                        const planIndex = (((i % stage2RuralPropPlan.length) + stage2RuralPropPlan.length) % stage2RuralPropPlan.length);
                        const item = stage2RuralPropPlan[planIndex];
                        const worldX = i * slotSpan + this.noiseSigned(seed + 0.4) * 42;
                        if (worldX > sceneLimit || worldX > houseLimit || !item) continue;

                        const image = this.stage2PropImages?.[item.key];
                        if (!isImageReady(image)) continue;

                        const scaleJitter = 0.94 + this.noise1D(seed + 2.7) * 0.12;
                        const height = item.h * scaleJitter;
                        const width = height * (image.naturalWidth / image.naturalHeight);
                        const worldDrawX = worldX + item.xBias + this.noiseSigned(seed + 3.1) * 18;
                        const drawX = worldDrawX - p * kPara;
                        if (drawX + width < -180 || drawX > CANVAS_WIDTH + 180) continue;
                        stage2HouseWorldBounds.push({
                            left: worldDrawX,
                            right: worldDrawX + width
                        });

                        ctx.save();
                        ctx.filter = item.filter;
                        ctx.drawImage(image, drawX, propBaseY - height + 3, width, height);
                        ctx.filter = 'none';
                        ctx.restore();
                    }

                    if (roadDetailsReady) {
                        const detailSpan = 250;
                        const detailStart = Math.floor((p * kPara - 520) / detailSpan);
                        const detailEnd = Math.ceil((CANVAS_WIDTH + p * kPara + 520) / detailSpan);
                        const detailBaseY = this.groundY + 3;
                        const detailLimit = houseLimit + 80;

                        for (let i = detailStart; i <= detailEnd; i++) {
                            const seed = i * 9.71;
                            const item = stage2RoadsideDetailPlan[((i % stage2RoadsideDetailPlan.length) + stage2RoadsideDetailPlan.length) % stage2RoadsideDetailPlan.length];
                            if (!item || this.noise1D(seed + 0.9) < 0.08) continue;

                            const worldX = 260 + i * detailSpan + this.noiseSigned(seed + 1.4) * 52;
                            if (worldX > detailLimit) continue;

                            const image = this.stage2PropImages?.[item.key];
                            if (!isImageReady(image)) continue;

                            const scaleJitter = 0.92 + this.noise1D(seed + 2.6) * 0.16;
                            const height = item.h * scaleJitter;
                            const width = height * (image.naturalWidth / image.naturalHeight);
                            const worldDrawX = worldX + item.xBias + this.noiseSigned(seed + 3.2) * 14;
                            const blocksHouse = stage2HouseWorldBounds.some((bounds) => (
                                worldDrawX + width > bounds.left - 44 && worldDrawX < bounds.right + 44
                            ));
                            if (blocksHouse) continue;

                            const drawX = worldDrawX - p * kPara;
                            if (drawX + width < -140 || drawX > CANVAS_WIDTH + 140) continue;

                            ctx.save();
                            ctx.globalAlpha *= 0.94 + this.noise1D(seed + 4.6) * 0.06;
                            ctx.filter = item.filter;
                            ctx.drawImage(image, drawX, detailBaseY - height + 3, width, height);
                            ctx.filter = 'none';
                            ctx.restore();
                        }

                        const grassImage = this.stage2PropImages?.cleanGrassClump;
                        if (isImageReady(grassImage)) {
                            const grassSpan = 150;
                            const grassStart = Math.floor((p * kPara - 420) / grassSpan);
                            const grassEnd = Math.ceil((CANVAS_WIDTH + p * kPara + 420) / grassSpan);

                            for (let i = grassStart; i <= grassEnd; i++) {
                                const seed = i * 6.43;
                                const groupIndex = Math.floor(i / 3);
                                const slotInGroup = ((i % 3) + 3) % 3;
                                const selectedSlot = Math.floor(this.noise1D(groupIndex * 5.31 + 0.7) * 3);
                                if (slotInGroup !== selectedSlot || this.noise1D(seed + 0.2) < 0.18) continue;

                                const worldX = 150 + i * grassSpan + this.noiseSigned(seed + 1.1) * 36;
                                if (worldX > detailLimit) continue;

                                const scaleJitter = 0.86 + this.noise1D(seed + 2.3) * 0.34;
                                const height = 36 * scaleJitter;
                                const width = height * (grassImage.naturalWidth / grassImage.naturalHeight);
                                const worldDrawX = worldX + this.noiseSigned(seed + 3.4) * 16;
                                const blocksHouse = stage2HouseWorldBounds.some((bounds) => (
                                    worldDrawX + width > bounds.left - 18 && worldDrawX < bounds.right + 18
                                ));
                                if (blocksHouse) continue;

                                const drawX = worldDrawX - p * kPara;
                                if (drawX + width < -100 || drawX > CANVAS_WIDTH + 100) continue;

                                ctx.save();
                                ctx.globalAlpha *= 0.78 + this.noise1D(seed + 4.1) * 0.12;
                                ctx.filter = 'brightness(0.72) saturate(0.66) contrast(0.86)';
                                ctx.drawImage(grassImage, drawX, detailBaseY - height + 3, width, height);
                                ctx.filter = 'none';
                                ctx.restore();
                            }
                        }
                    }
                    break;
                }

                break;
            }

            case 'mountain': {
                // 遠方の山並みは背景として残し、道沿いの旧Canvas小物は生成画像へ寄せる。
                this.renderStage3DistantMountainBands(ctx, currentPalette, p);
                this.renderStage3RoadsideProps(ctx);
                this.renderStage3RoadsideClusters(ctx);
                break;
            }
                
            case 'town': {
                const gY = this.groundY;
                // 月夜で一定の明るさ（stage4は深夜化しない／月は空に出ている）。灯りは常にしっかり灯す
                const lampLit = 0.92;

                // Stage4の町並みは画像アセットだけで構成し、Canvas製の建物フォールバックは使わない。

                // ───────── 中景：分割した町並み画像を密に並べる ─────────
                const castleImage = this.stage4TownImages?.castleEntrance;
                const castleH = 620;
                const castleWorldX = this.getStage4CastleWorldX();
                const castleX = castleWorldX - p;
                // 町並みは getStage4TownRowsInRange 側で接近路の手前までに打ち切られている
                // （行中心で判定＝建物を途中で切らない）。ここではクリップ矩形は使わない。
                const townRows = this.getStage4TownRowsInRange(p - 900, p + CANVAS_WIDTH + 900);
                for (const row of townRows) {
                    const x = row.worldX - p;
                    if (x + row.width < -900 || x > CANVAS_WIDTH + 900) continue;
                    this.renderStage4TownImageBlock(
                        ctx,
                        row.image,
                        x,
                        this.groundY - 2,
                        row.width,
                        0.96,
                        'brightness(0.82) saturate(0.72) contrast(0.92)'
                    );
                }

                this.renderStage4CastleApproach(ctx, p, this.groundY - 2);
                this.renderStage4CastleLower(ctx, castleImage, castleX, this.groundY - 2, castleH);

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
                const crop = this.skyVisTop || 0;
                if (!this.renderStageBackdropTile(ctx, this.stage5InteriorWallImage, p, {
                    parallax: 1,
                    drawHeight: CANVAS_HEIGHT + crop,
                    bottomY: CANVAS_HEIGHT,
                    filter: 'brightness(0.76) saturate(0.78) contrast(0.96)'
                })) {
                    const wallGrad = ctx.createLinearGradient(0, 0, 0, this.groundY);
                    wallGrad.addColorStop(0, 'rgba(92, 30, 22, 0.92)');
                    wallGrad.addColorStop(1, 'rgba(42, 15, 12, 0.94)');
                    ctx.fillStyle = wallGrad;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, this.groundY);
                }

                break;
            }

            case 'tenshu': {
                // 眼下パノラマ(高度の証拠)は欄干バンド(ゾーン背景の不透明下部)の奥に描く
                this.renderStage6Panorama(ctx, p);
                this.renderStage6BackdropZones(ctx, p);

                // ボス戦中：最終ステージなので次のステージはないが、夜明け（クリア後の朝焼け）を予感させる光を遠くに表示
                if (this.bossSpawned) {
                    ctx.save();
                    // 朝焼けの大グローのみ。「地平線の細い光の帯」は廃止——
                    // 帯はパノラマの上に直接描かれるため、連山と屋根の間に
                    // 「謎の明るい線」として乗ってしまう(湖・空白ラインに誤読される)。
                    // 基準は空と連山の境(真の地平線 ≈ groundY-125)。
                    const dawnHorizonY = this.groundY - 125;
                    const dawnGlow = ctx.createRadialGradient(
                        CANVAS_WIDTH * 0.5, dawnHorizonY, 0,
                        CANVAS_WIDTH * 0.5, dawnHorizonY, CANVAS_WIDTH * 0.7
                    );
                    dawnGlow.addColorStop(0,   `rgba(255, 180, 60, ${0.22 * this.bossEncounterBlend})`);
                    dawnGlow.addColorStop(0.35, `rgba(255, 120, 30, ${0.14 * this.bossEncounterBlend})`);
                    dawnGlow.addColorStop(1,   'rgba(255, 60, 10, 0)');
                    ctx.fillStyle = dawnGlow;
                    ctx.fillRect(0, 0, CANVAS_WIDTH, dawnHorizonY);
                    ctx.restore();
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

        // 竹垣は固定背景として先に描き、地面が根元を自然に覆う。
        if (this.stageNumber === 1) {
            this.renderStage1BambooGroundBlend(ctx, renderProgress, darken);
        }
        
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

        // 竹林の動的な葉の降下エフェクト
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

    renderGroundImageTile(ctx, image, horizonY, bottomY, renderProgress, options = {}) {
        if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const groundHeight = bottomY - horizonY;
        const drawH = Math.ceil(groundHeight + (options.extraHeight ?? 34));
        const baseDrawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const drawW = Math.ceil(baseDrawW * (options.widthScale ?? 1));
        const scrollScale = options.scrollScale ?? 1;
        const scrollWorld = renderProgress * scrollScale;
        const firstTileIndex = Math.floor(scrollWorld / drawW) - 1;
        const scroll = Math.floor(((scrollWorld % drawW) + drawW) % drawW);
        const y = Math.floor(horizonY + (options.yOffset ?? -18));
        const startX = -scroll - drawW;
        const clipTop = horizonY + (options.clipTopOffset ?? 0);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, clipTop, CANVAS_WIDTH, Math.max(0, bottomY - clipTop));
        ctx.clip();
        ctx.globalAlpha *= options.alpha ?? 1;
        if (options.filter) ctx.filter = options.filter;
        let tileIndex = firstTileIndex;
        for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW, tileIndex++) {
            if (options.mirrorRepeat && Math.abs(tileIndex) % 2 !== 0) {
                ctx.save();
                ctx.translate(x + drawW + 2, y);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, drawW + 2, drawH);
                ctx.restore();
            } else {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
        }
        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6GroundRegion(ctx, image, renderProgress, {
        worldStart,
        worldEnd,
        horizonY,
        bottomY,
        filter,
        topAlign = false
    }) {
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

        const screenStart = worldStart - renderProgress;
        const screenEnd = worldEnd - renderProgress;
        if (screenEnd <= 0 || screenStart >= CANVAS_WIDTH) return false;

        // topAlign: 画像上端を床上端(horizonY)にぴったり合わせる。
        // 大棟の床は上端17%が「棟の冠(鳥衾+のし瓦)」で、通常のオーバースキャン(-20px)だと
        // 冠が刈り取られて奥側斜面との継ぎ目が裸になるため、大棟ゾーンだけ整列させる。
        const drawH = topAlign
            ? Math.ceil(bottomY - horizonY)
            : Math.ceil(bottomY - horizonY + 40);
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const y = topAlign ? horizonY : Math.floor(horizonY - 20);
        const firstTile = Math.floor((renderProgress - worldStart) / drawW) - 1;
        const lastTile = Math.ceil((renderProgress + CANVAS_WIDTH - worldStart) / drawW) + 1;

        ctx.save();
        ctx.beginPath();
        ctx.rect(
            Math.max(0, screenStart),
            horizonY,
            Math.max(0, Math.min(CANVAS_WIDTH, screenEnd) - Math.max(0, screenStart)),
            Math.max(0, bottomY - horizonY)
        );
        ctx.clip();
        ctx.filter = filter;

        for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex++) {
            const x = Math.round(worldStart + tileIndex * drawW - renderProgress);
            ctx.drawImage(image, x, y, drawW + 2, drawH);
        }

        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderStage6GroundZones(ctx, renderProgress, horizonY, bottomY) {
        const zoneWidth = this.maxProgress / 4;
        const filter = 'brightness(0.88) saturate(0.72) contrast(0.98)';
        // 床テクスチャの切り替え位置は動的。壁は立面として y<512 しか覆えないため、
        // 境界ちょうどで切ると接近中に俯瞰床帯へ「次の面の床」が素通しで見えてしまう。
        // - 未通過の角: 壁右端(+520)。トリガー時の画面右端(≈+500)より先=接近中は不可視
        // - 通過済みの角: 暗転明けのカメラ左端(+380)。旧床を一切引きずらず、画面は最初から新しい床だけ
        // 切り替え自体は完全暗転中(advanceCornerのcornersClimbed++)に起き、後退クランプで再訪もできない。
        const seamFor = (cornerIndex) => (
            this.cornersClimbed > cornerIndex
                ? STAGE6_CORNER.POST_FADE_CAMERA_LAG
                : STAGE6_CORNER.WALL_RIGHT_PX
        );
        const b1 = zoneWidth + seamFor(0);
        const b2 = zoneWidth * 2 + seamFor(1);
        const b3 = zoneWidth * 3 + seamFor(2);
        const zones = [
            { image: this.stage6GroundImage, start: 0, end: b1 },
            { image: this.stage6UpperGalleryGroundImage, start: b1, end: b2 },
            {
                // 大棟化: 三巡目の床は黒漆の板張りへ置き換え(旧: 鉄板リベット床は壁面に見えるため廃止)
                image: this.isStage6ImageReady(this.stage6GalleryWoodGroundImage)
                    ? this.stage6GalleryWoodGroundImage
                    : this.stage6RoofRidgeGroundImage,
                start: b2,
                end: b3
            },
            {
                // 大棟化: 四巡目の床は大棟の棟瓦+手前側屋根斜面。
                // 画像上端17%が棟の冠(鳥衾+のし瓦)なので上端を床上端に整列させ、
                // 冠帯(480..521)が足元ライン512をまたいで奥側斜面との継ぎ目を覆うようにする。
                // v3(eaves)は軒先で終わり下端が透過——軒下には別レイヤーで遥か下の世界が覗く。
                image: this.isStage6ImageReady(this.stage6RidgeEavesGroundImage)
                    ? this.stage6RidgeEavesGroundImage
                    : (this.isStage6ImageReady(this.stage6RidgeTilesGroundImage)
                        ? this.stage6RidgeTilesGroundImage
                        : this.stage6FinalTerraceGroundImage),
                start: b3,
                end: this.maxProgress,
                topAlign: this.isStage6ImageReady(this.stage6RidgeEavesGroundImage) ||
                    this.isStage6ImageReady(this.stage6RidgeTilesGroundImage),
                underworld: this.isStage6ImageReady(this.stage6RidgeEavesGroundImage)
            }
        ];

        let rendered = false;
        for (const zone of zones) {
            // 軒下の世界(遥か下の朝靄と城下): 軒先で終わる床(下端透過)の下に敷く
            if (zone.underworld) {
                this.renderStage6Underworld(ctx, renderProgress, zone.start, zone.end, horizonY, bottomY);
            }
            rendered = this.renderStage6GroundRegion(ctx, zone.image, renderProgress, {
                worldStart: zone.start,
                worldEnd: zone.end,
                horizonY,
                bottomY,
                filter,
                topAlign: !!zone.topAlign
            }) || rendered;
        }
        // 敷居ストリップは廃止: 床の切り替え位置が動的になった結果、
        // 未通過側(+520)は接近中の画面右端(+500)より先、通過側(+380)は暗転明けの画面左端ちょうどで、
        // どの局面でも継ぎ目が画面に映らなくなったため、受け手のマーキング自体が不要になった。
        return rendered;
    }

    /**
     * Stage6 大棟: 軒下に覗く「遥か下の世界」。
     * 床アセット(ridge_eaves)は軒先で終わり下端が透過なので、その下に
     * 空気遠近の深い藍+かすかな城下の灯+朝靄を敷く。屋根の上にいる高度の決定的な証拠。
     */
    renderStage6Underworld(ctx, renderProgress, worldStart, worldEnd, horizonY, bottomY) {
        const screenStart = worldStart - renderProgress;
        const screenEnd = worldEnd - renderProgress;
        if (screenEnd <= 0 || screenStart >= CANVAS_WIDTH) return;
        const clipX = Math.max(0, screenStart);
        const clipW = Math.max(0, Math.min(CANVAS_WIDTH, screenEnd) - clipX);
        if (clipW <= 0) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, horizonY, clipW, Math.max(0, bottomY - horizonY));
        ctx.clip();

        // 深い藍(下=遠い地上ほど夜が残る)
        const grad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        grad.addColorStop(0, '#10151f');
        grad.addColorStop(1, '#070a12');
        ctx.fillStyle = grad;
        ctx.fillRect(clipX, horizonY, clipW, Math.max(0, bottomY - horizonY));

        // 眼下の町(かすか・低パララックス=遥か遠い)
        this.renderStageBackdropTile(ctx, this.stage6PanoramaTownNearImage, renderProgress, {
            parallax: 0.3, drawHeight: 130, bottomY: bottomY + 30, alpha: 0.4,
            filter: 'brightness(0.72) saturate(0.7)', mirrorRepeat: false
        });
        // 朝靄が屋根の際から下界へ薄くかかる
        this.renderStageBackdropTile(ctx, this.stage6PanoramaCloudSeaImage, renderProgress, {
            parallax: 0.24, drawHeight: 80, bottomY: bottomY + 6, alpha: 0.35,
            filter: 'brightness(0.85) saturate(0.55)', mirrorRepeat: false
        });

        ctx.restore();
    }

    renderStage6GroundThresholds(ctx, renderProgress, horizonY, bottomY) {
        const image = this.stage6GroundThresholdImage;
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

        const zoneWidth = this.maxProgress / 4;
        const drawH = Math.ceil(bottomY - horizonY + 8);
        const drawW = Math.max(68, Math.ceil(drawH * (image.naturalWidth / image.naturalHeight) * 1.6));
        const y = Math.floor(horizonY - 4);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, horizonY, CANVAS_WIDTH, Math.max(0, bottomY - horizonY));
        ctx.clip();
        ctx.filter = 'brightness(0.82) saturate(0.62) contrast(1.02)';

        // 敷居ストリップは床テクスチャの実際の切り替え位置(壁右端)に置き、継ぎ目を受ける
        for (let zoneIndex = 1; zoneIndex < 4; zoneIndex++) {
            const x = Math.round(zoneWidth * zoneIndex + STAGE6_CORNER.WALL_RIGHT_PX - renderProgress - drawW * 0.5);
            if (x + drawW <= 0 || x >= CANVAS_WIDTH) continue;
            ctx.drawImage(image, x, y, drawW, drawH);
        }

        ctx.filter = 'none';
        ctx.restore();
    }

    renderStage1BambooGroundBlend(ctx, renderProgress, darken) {
        this.renderStage1RootScreenImage(ctx, renderProgress, darken);
    }

    renderStage1RootScreenImage(ctx, renderProgress, darken) {
        const image = this.stage1BambooRootScreenImage;
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const drawH = 104;
        const drawW = Math.ceil(drawH * (image.naturalWidth / image.naturalHeight));
        const y = Math.round(this.groundY - drawH + 12);
        const fixedCameraX = Math.floor(renderProgress);
        const scroll = ((fixedCameraX % drawW) + drawW) % drawW;
        const startX = -scroll - drawW;
        const forestEndX = this.getStage1BambooTreeLineX() - fixedCameraX + STAGE1_FENCE_END_OFFSET;
        const clipRight = Math.max(0, Math.min(CANVAS_WIDTH, forestEndX - 6));
        if (forestEndX <= -16) return false;

        if (clipRight > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, y - 8, clipRight, drawH + 16);
            ctx.clip();
            ctx.globalAlpha *= 0.88;
            ctx.filter = `brightness(${(0.76 - darken * 0.06).toFixed(3)}) saturate(0.74) contrast(0.92)`;
            for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW) {
                ctx.drawImage(image, x, y, drawW + 2, drawH);
            }
            ctx.filter = 'none';
            ctx.restore();
        }

        if (forestEndX > 0 && forestEndX < CANVAS_WIDTH + 32) {
            this.renderStage1FenceTerminal(ctx, image, forestEndX, y, drawH, darken);
        }
        return true;
    }

    renderStage1FenceTerminal(ctx, image, fenceEndX, fenceY, fenceH, darken) {
        const filter = `brightness(${(0.76 - darken * 0.06).toFixed(3)}) saturate(0.74) contrast(0.92)`;

        ctx.save();
        ctx.globalAlpha *= 0.88;
        ctx.filter = filter;

        // 通常柵は高さを保ったまま止め、同素材の縦柱で切断面を受ける。
        ctx.save();
        ctx.translate(fenceEndX - 12, fenceY + fenceH);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(image, 260, 210, 220, 28, 0, 0, 82, 12);
        ctx.restore();

        ctx.filter = 'none';
        ctx.restore();
        return true;
    }

    renderGroundBamboo(ctx, renderProgress, darken) {
        const horizonY = this.groundY; // 地平線（奥）。林床はここから手前へ広がる
        const bottomY = CANVAS_HEIGHT;
        const span = bottomY - horizonY;
        const stageP = this.clamp01(renderProgress / this.getBossScrollStopX());
        const nightWeight = 1 - this.smoothstep(0.08, 0.74, stageP);
        const stageDarken = Math.max(darken, nightWeight * 0.62);

        // 1. 路面グラデ（湿った苔と土）
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#496f36', '#16241b', stageDarken * 0.58));
        roadGrad.addColorStop(0.6, this.interpolateColor('#5b7b43', '#1b2b1f', stageDarken * 0.5));
        roadGrad.addColorStop(1, this.interpolateColor('#3f5f31', '#101b12', stageDarken * 0.66));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, span);

        const groundBrightness = 0.76 + (1 - nightWeight) * 0.32;
        const groundSaturation = 0.68 + (1 - nightWeight) * 0.12;
        const groundContrast = 0.9 + (1 - nightWeight) * 0.02;
        if (this.renderGroundImageTile(ctx, this.stage1GroundImage, horizonY, bottomY, renderProgress, {
            filter: `brightness(${groundBrightness.toFixed(3)}) saturate(${groundSaturation.toFixed(3)}) contrast(${groundContrast.toFixed(3)}) hue-rotate(5deg)`,
            extraHeight: 34,
            yOffset: -16,
            widthScale: 2.2,
            mirrorRepeat: true
        })) {
            ctx.fillStyle = `rgba(168, 151, 102, ${(0.028 * (1 - nightWeight * 0.72)).toFixed(3)})`;
            ctx.fillRect(0, horizonY - 36, CANVAS_WIDTH, span + 36);

            const seamSoftener = ctx.createLinearGradient(0, horizonY - 68, 0, horizonY + 112);
            seamSoftener.addColorStop(0, 'rgba(37, 66, 35, 0)');
            seamSoftener.addColorStop(0.44, `rgba(35, 54, 38, ${(0.075 + stageDarken * 0.04).toFixed(3)})`);
            seamSoftener.addColorStop(1, 'rgba(18, 32, 20, 0)');
            ctx.fillStyle = seamSoftener;
            ctx.fillRect(0, horizonY - 68, CANVAS_WIDTH, 180);

            const bottomShade = ctx.createLinearGradient(0, horizonY + span * 0.34, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.03 + darken * 0.05).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, span);

            if (nightWeight > 0.001) {
                const nightShade = ctx.createLinearGradient(0, horizonY - 32, 0, bottomY);
                nightShade.addColorStop(0, `rgba(3, 10, 28, ${(0.18 * nightWeight).toFixed(3)})`);
                nightShade.addColorStop(0.58, `rgba(2, 8, 20, ${(0.24 * nightWeight).toFixed(3)})`);
                nightShade.addColorStop(1, `rgba(0, 4, 12, ${(0.34 * nightWeight).toFixed(3)})`);
                ctx.fillStyle = nightShade;
                ctx.fillRect(0, horizonY - 32, CANVAS_WIDTH, span + 32);
            }
        }

        this.renderStage1GroundToKaido(ctx, renderProgress);
    }

    renderStage1GroundToKaido(ctx, renderProgress) {
        const image = this.stage1GroundToKaidoImage;
        if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            return false;
        }

        const worldStart = this.getStage1GroundTransitionStartX();
        const drawW = this.maxProgress - worldStart;
        const x = worldStart - Math.floor(renderProgress);
        if (x >= CANVAS_WIDTH || x + drawW <= 0) return false;

        const y = this.groundY - 16;
        const drawH = CANVAS_HEIGHT - this.groundY + 34;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, this.groundY, CANVAS_WIDTH, CANVAS_HEIGHT - this.groundY);
        ctx.clip();
        ctx.filter = 'brightness(1.15) saturate(0.78) contrast(0.88) hue-rotate(5deg)';

        const blendW = Math.min(320, drawW);
        const stripCount = 32;
        const sourcePerPixel = image.naturalWidth / drawW;
        const baseAlpha = ctx.globalAlpha;
        for (let i = 0; i < stripCount; i++) {
            const stripLeft = blendW * (i / stripCount);
            const stripRight = blendW * ((i + 1) / stripCount);
            const stripW = stripRight - stripLeft;
            const sourceX = stripLeft * sourcePerPixel;
            const sourceW = Math.max(1, stripW * sourcePerPixel + 1);
            ctx.globalAlpha = baseAlpha * this.smoothstep(0, 1, i / (stripCount - 1));
            ctx.drawImage(
                image,
                sourceX,
                0,
                sourceW,
                image.naturalHeight,
                Math.round(x + stripLeft),
                y,
                Math.ceil(stripW + 1),
                drawH
            );
        }

        const opaqueSourceX = blendW * sourcePerPixel;
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(
            image,
            opaqueSourceX,
            0,
            image.naturalWidth - opaqueSourceX,
            image.naturalHeight,
            Math.round(x + blendW),
            y,
            drawW - blendW,
            drawH
        );

        ctx.filter = 'none';
        ctx.restore();
        return true;
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

        if (this.renderGroundImageTile(ctx, this.stage2GroundImage, horizonY, bottomY, renderProgress, {
            filter: 'brightness(0.86) saturate(0.82) contrast(0.92)',
            extraHeight: 34,
            yOffset: -16
        })) {
            const sunWash = ctx.createLinearGradient(0, horizonY, 0, horizonY + 140);
            sunWash.addColorStop(0, `rgba(255, 225, 168, ${(0.12 * (1 - darken * 0.55)).toFixed(3)})`);
            sunWash.addColorStop(1, 'rgba(255, 225, 168, 0)');
            ctx.fillStyle = sunWash;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, 150);

            const bottomShade = ctx.createLinearGradient(0, horizonY + (bottomY - horizonY) * 0.35, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.12 + darken * 0.14).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);
            return;
        }

        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas路面へは戻さない。
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

        if (this.renderGroundImageTile(ctx, this.stage3GroundImage, horizonY, bottomY, renderProgress, {
            filter: 'brightness(0.78) saturate(0.76) contrast(0.92)',
            extraHeight: 38,
            yOffset: -18
        })) {
            const glowH = groundH * 0.28;
            const sunGlow = ctx.createLinearGradient(0, horizonY, 0, horizonY + glowH);
            sunGlow.addColorStop(0, `rgba(255,176,104,${(0.16) * (1 - darken * 0.7)})`);
            sunGlow.addColorStop(1, 'rgba(255,176,104,0)');
            ctx.fillStyle = sunGlow;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, glowH);

            const bottomShade = ctx.createLinearGradient(0, horizonY + groundH * 0.3, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.22 + darken * 0.18).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundH);
            return;
        }

        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas路面へは戻さない。

        // 地平線の硬い境界線は出さず、夕焼けの照り返しと地面グラデーションでなじませる。
    }

    renderGroundTown(ctx, renderProgress, darken) {
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;
        const groundHeight = bottomY - horizonY;
        const groundTile = this.stage4TownImages?.groundTile;

        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#6f7480', '#1d2028', darken * 0.6));
        roadGrad.addColorStop(0.58, this.interpolateColor('#8b8a86', '#363638', darken * 0.45));
        roadGrad.addColorStop(1, this.interpolateColor('#54514c', '#101012', darken * 0.8));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundHeight);

        if (groundTile && groundTile.complete && groundTile.naturalWidth > 0 && groundTile.naturalHeight > 0) {
            const drawH = Math.ceil(groundHeight + 34);
            const drawW = Math.ceil(drawH * (groundTile.naturalWidth / groundTile.naturalHeight));
            const scroll = Math.floor(renderProgress % drawW);
            const startX = -scroll - drawW;

            ctx.save();
            ctx.filter = 'brightness(0.76) saturate(0.72) contrast(0.94)';
            for (let x = startX; x < CANVAS_WIDTH + drawW; x += drawW) {
                ctx.drawImage(groundTile, x, horizonY - 18, drawW + 2, drawH);
            }
            ctx.filter = 'none';

            const bottomShade = ctx.createLinearGradient(0, horizonY + groundHeight * 0.2, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0, 0, 0, 0)');
            bottomShade.addColorStop(1, `rgba(0, 0, 0, ${(0.18 + darken * 0.16).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, groundHeight);
            ctx.restore();
        }
        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas石畳へは戻さない。
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

        if (this.renderGroundImageTile(ctx, this.stage5GroundImage, horizonY, bottomY, renderProgress, {
            filter: 'brightness(0.72) saturate(0.78) contrast(0.95)',
            extraHeight: 48,
            yOffset: -22,
            mirrorRepeat: true,
            widthScale: 1.35
        })) {
            const lanternSheen = ctx.createLinearGradient(0, horizonY, 0, Math.min(bottomY, horizonY + 240));
            lanternSheen.addColorStop(0, `rgba(255, 190, 104, ${(0.10 * (1 - darken * 0.4)).toFixed(3)})`);
            lanternSheen.addColorStop(1, 'rgba(255, 190, 104, 0)');
            ctx.fillStyle = lanternSheen;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, Math.min(260, bottomY - horizonY));

            const bottomShade = ctx.createLinearGradient(0, horizonY + 140, 0, Math.min(bottomY, CANVAS_HEIGHT));
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.18 + darken * 0.18).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, Math.max(0, Math.min(bottomY, CANVAS_HEIGHT) - horizonY));
            return;
        }

        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas畳目へは戻さない。
    }

    renderGroundTenshu(ctx, renderProgress, darken) {
        ctx.save();
        const horizonY = this.groundY;
        const bottomY = CANVAS_HEIGHT;

        // 区画画像の読込中にも床が抜けないよう、暗い中立色だけを敷いて待つ。
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
        roadGrad.addColorStop(0, this.interpolateColor('#32343a', '#111216', darken));
        roadGrad.addColorStop(0.35, this.interpolateColor('#292b30', '#0d0e11', darken));
        roadGrad.addColorStop(1, this.interpolateColor('#17181c', '#050506', darken * 1.2));
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

        if (this.renderStage6GroundZones(ctx, renderProgress, horizonY, bottomY)) {
            const moonSheen = ctx.createLinearGradient(0, horizonY, 0, bottomY);
            moonSheen.addColorStop(0, 'rgba(210, 224, 232, 0)');
            moonSheen.addColorStop(0.34, `rgba(210, 224, 232, ${(0.07 - darken * 0.02).toFixed(3)})`);
            moonSheen.addColorStop(1, 'rgba(210, 224, 232, 0)');
            ctx.fillStyle = moonSheen;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);

            const bottomShade = ctx.createLinearGradient(0, horizonY + (bottomY - horizonY) * 0.35, 0, bottomY);
            bottomShade.addColorStop(0, 'rgba(0,0,0,0)');
            bottomShade.addColorStop(1, `rgba(0,0,0,${(0.22 + darken * 0.16).toFixed(3)})`);
            ctx.fillStyle = bottomShade;
            ctx.fillRect(0, horizonY, CANVAS_WIDTH, bottomY - horizonY);
            ctx.restore();
            return;
        }

        // 画像未読込時はベースグラデーションだけで待ち、旧Canvas金目地へは戻さない。
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
            // 深い朝方の藍色から朝焼けへ移る間、星の芯をくっきり残して徐々に消す。
            intensity = (1 - this.smoothstep(0.24, 0.68, p)) * 0.95;
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

        const starParallaxRate = this.stageNumber === 1 ? 0.018 : 0.01;
        const starParallaxOffset = this.progress * starParallaxRate;
        for (const particle of this.skyParticles) {
            const x = ((particle.nx * CANVAS_WIDTH - starParallaxOffset) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
            const y = this.skyY(20 + particle.ny * (this.groundY * 0.55));
            // 2周波ブレンドで不規則な瞬き（subSpeedが無い旧データでも単一sineにフォールバック）
            const flick = particle.subSpeed
                ? (Math.sin(time * particle.speed + particle.phase) * 0.6 + Math.sin(time * particle.subSpeed + particle.subPhase) * 0.4)
                : Math.sin(time * particle.speed + particle.phase);
            const twinkle = 0.5 + flick * 0.5;
            const alphaBase = this.stageNumber === 1
                ? (0.38 + twinkle * 0.62)
                : Math.max(0.08, twinkle);
            const alpha = alphaBase * intensity * starAlphaMultiplier;

            if (alpha <= 0.025) continue;

            if (twinkle > 0.42 && alpha > 0.12) {
                const glowRadius = this.stageNumber === 1
                    ? (2.2 + twinkle * 2.8)
                    : (2.8 + twinkle * 4.2);
                const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
                glow.addColorStop(0, `rgba(255, 255, 255, ${alpha * (this.stageNumber === 1 ? 0.46 : 0.42)})`);
                glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Stage 3 の夕暮れ星はやや薄い青白、他は白
            const starColor = this.stageNumber === 3
                ? `rgba(220, 225, 255, ${alpha})`
                : `rgba(255, 255, 245, ${alpha})`;
            ctx.fillStyle = starColor;
            ctx.beginPath();
            const starRadius = this.stageNumber === 1
                ? (1.35 + particle.speed * 0.2)
                : (1.0 + particle.speed * 0.16);
            ctx.arc(x, y, starRadius, 0, Math.PI * 2);
            ctx.fill();

            if (this.stageNumber === 1 && alpha > 0.34 && twinkle > 0.55) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.75, alpha * 0.9).toFixed(3)})`;
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(x - starRadius * 2.2, y);
                ctx.lineTo(x + starRadius * 2.2, y);
                ctx.moveTo(x, y - starRadius * 2.2);
                ctx.lineTo(x, y + starRadius * 2.2);
                ctx.stroke();
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
        // 空補償: 中心yは触らず縦半径だけ縮める＝地平線の出入りの見た目は不変のまま
        // 天頂(南中)の高度をクロップ分だけ下げる。skyVisTop=0 で従来値に一致。
        const skyCrop = this.skyVisTop || 0;
        const orbitRadiusY = this.groundY * (isTenshuStage ? 0.6 : 0.5)
            - skyCrop * (isTenshuStage ? 1.05 : 0.62);
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
            const glowR = r * (isTenshuStage ? 4.8 : (sn === 1 ? 2.25 : 3.2));
            const peakStop = r / glowR; // 本体外縁がグロー最大輝度
            const midStop = Math.min(peakStop + (1 - peakStop) * 0.45, 0.98);
            const glowAlphaScale = sn === 1 ? 0.46 : 1;
            const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
            glow.addColorStop(0, glowColor.replace('ALPHA', (0.15 * glowAlphaScale).toFixed(3)));
            glow.addColorStop(peakStop, glowColor.replace('ALPHA', (0.75 * glowAlphaScale).toFixed(3)));
            glow.addColorStop(midStop, glowColor.replace('ALPHA', (0.18 * glowAlphaScale).toFixed(3)));
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

            if (sn === 1) {
                const rim = ctx.createRadialGradient(0, 0, r * 0.58, 0, 0, r);
                rim.addColorStop(0, 'rgba(255, 232, 186, 0)');
                rim.addColorStop(0.82, 'rgba(255, 224, 164, 0.18)');
                rim.addColorStop(1, 'rgba(255, 245, 210, 0.34)');
                ctx.fillStyle = rim;
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
            }

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
                case 1: startHour = 4.5; endHour = STAGE1_BOSS_SUN_HOUR; break;
                case 2: startHour = 11; endHour = 14; break;
                case 3: startHour = 14.0; endHour = 17.8; break; // 明るい夕方開始〜日没スレスレ
                case 4: startHour = 18.3; endHour = 24; isSun = false; break; // 月の出〜真上(24時)
                default: startHour = 12; endHour = 12; break;
            }

            let currentHour;
            // Stage1の太陽はボス出現フラグでは動かさず、スクロール終端へ連続的につなぐ。
            if (sn === 1) {
                currentHour = this.getStage1SunHour();
            } else if (this.bossSpawned && sn === 3) {
                currentHour = 17.8; // 日が地平線スレスレに固定
            } else if (this.bossSpawned && sn === 4) {
                currentHour = 24.0; // 月が真上（天頂）に固定
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
                const dayGlow = sn === 1
                    ? 'rgba(255, 250, 220, ALPHA)'
                    : 'rgba(255, 255, 240, ALPHA)';

                // 夕焼け・朝焼けの太陽
                const warmFactor = 1 - this.smoothstep(0.05, 0.75, sunAltitude);
                const duskTop = '#ffd194';
                const duskBottom = '#ff7a33';
                const duskGlow = sn === 1
                    ? 'rgba(255, 170, 82, ALPHA)'
                    : 'rgba(255, 140, 50, ALPHA)';

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
                // ボス戦中: 太陽を 2/3 程度表示される最終位置に固定
                const theta = this.getStage6SunTheta();
                const sx = getX(theta);
                const sy = getY(theta);
                drawBody(sx, sy, sunRadius, 1, '#ffd9b4', '#ff7a33', `rgba(255, 160, 80, ALPHA)`, false);
            } else {
                // 進行度を3分割する (0-0.4:月, 0.4以降:朝、終盤スクロールで太陽)
                if (progress < 0.4) {
                    const localP = progress / 0.4;
                    const theta = Math.PI / 2 + (localP * (Math.PI / 2 + 0.2)); // 中央から沈む
                    const mx = getX(theta);
                    const my = getY(theta);
                    const alpha = 1 - this.smoothstep(0.8, 1.0, localP);
                    drawBody(mx, my, moonRadius, alpha, '#f8f9fa', '#ced4da', `rgba(240, 248, 255, ALPHA)`, true);
                }

                const sunPhase = this.getStage6SunPhase();
                if (sunPhase > 0) {
                    const theta = this.getStage6SunTheta(); // 地平線下から昇り、ボス戦の固定位置へ
                    const sx = getX(theta);
                    const sy = getY(theta);
                    const alpha = this.smoothstep(0, 0.34, sunPhase);
                    drawBody(sx, sy, sunRadius, alpha, '#ffd9b4', '#ff7a33', `rgba(255, 160, 80, ALPHA)`, false);
                }
                // 月が消えた後、太陽が出るまでは何もない「仄暗い朝」
            }
        }
    }
    
    renderEnemies(ctx) {
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }
    }

    renderObstacles(ctx) {
        if (this.stageNumber === 4) {
            this.renderStage4ClimbPlatforms(ctx);
        }
        for (const obs of this.obstacles) {
            if (this.stageNumber === 3 && obs.type === OBSTACLE_TYPES.ROCK) {
                ctx.save();
                ctx.filter = 'brightness(0.74) sepia(0.18) saturate(0.72) contrast(0.93) hue-rotate(-6deg)';
                obs.render(ctx);
                ctx.restore();
                continue;
            }
            obs.render(ctx);
        }
    }

    renderStage4ClimbPlatforms(ctx) {
        const platforms = this.getStage4ClimbPlatformColliders(this.progress - 120, this.progress + CANVAS_WIDTH + 160);
        for (const platform of platforms) {
            const image = this.stage4TownImages?.[platform.imageKey];
            if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) continue;

            ctx.save();
            ctx.globalAlpha = 0.96;
            ctx.filter = 'brightness(0.84) saturate(0.78) contrast(0.92)';
            ctx.drawImage(image, platform.drawX, platform.drawY, platform.drawWidth, platform.drawHeight);
            ctx.restore();
        }
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
