import { PLAYER, LANE_OFFSET } from './constants.js';
import {
    SHOGUN_ACTOR_BASE_HEIGHT,
    SHOGUN_ACTOR_BASE_WIDTH,
    SHOGUN_SCALE
} from './shogunConstants.js';

/**
 * 将軍を Player ネイティブ（characterType='shogun'）として初期化する薄いセットアップ。
 *
 * E5 で旧 boss(Shogunクラス)駆動を撤去し、将軍は「スケールの違う忍者」＝単一 Player 実装に一本化済み。
 * このモジュールがやるのは初回 update での setup だけ:
 *   - dims を素体フレーム(40x60)＋scaleMultiplier=2.2 に設定し、ワールド身長で接地
 *   - enableNativeShogun() でネイティブ戦闘/描画へ移行（以降 hasCombatControllerMethod=false）
 * 戦闘・入力・描画・座標は Player 自身（boss非依存）が担う。
 */
export function applyShogunCombat(player) {
    if (!player) return;
    if (player._shogunCombatController) {
        player.combatController = player._shogunCombatController;
        return;
    }

    player._shogunInited = false;
    player._getShogunRealSubWeapon = () => player.currentSubWeapon || null;


    // ================================================================
    // 初期化: 将軍 dims(素体40x60＋scale2.2) 設定 → ネイティブ戦闘へ移行
    // ================================================================
    const initShogunInstances = (p) => {
        if (p._shogunInited) return;

        // 将軍は「スケールの違う忍者」: width/height は素体フレーム(40x60)を保持し、
        // ワールド寸法(=素体×scaleMultiplier=88x132)は getWorldWidth/Height 経由で読む。
        p.width = SHOGUN_ACTOR_BASE_WIDTH;   // 40 素体
        p.height = SHOGUN_ACTOR_BASE_HEIGHT; // 60 素体
        p.scaleMultiplier = SHOGUN_SCALE;
        p.speed = PLAYER.SPEED;
        // ワールド身長(=素体×scale=132)で足を接地させる（startStage は忍者の高さで設定済み）
        const groundY = p.groundY || 480;
        p.y = groundY + LANE_OFFSET - p.getWorldHeight();
        p.isGrounded = true;
        p._shogunInited = true;

        p._getShogunRealSubWeapon = () => p.currentSubWeapon || null;

        // E5: プレイアブル将軍は単一 Player ネイティブに一本化。boss(Shogunクラス)は生成しない。
        // dims が整ったこの初回 setup でネイティブ戦闘/描画へ即移行し、以降 controller はバイパスされる。
        if (typeof p.enableNativeShogun === 'function') p.enableNativeShogun();
    };

    // E5: 将軍は単一 Player ネイティブに一本化済み。controller は初回 update での
    // setup(dims設定＋enableNativeShogun)専用。以降 hasCombatControllerMethod が false を返し、
    // Player 自身の update/handleInput/戦闘/描画(boss非依存)が走る（旧 boss駆動メソッド群は撤去）。
    const controller = {
        update(dt, walls = [], enemies = []) {
            initShogunInstances(this);
        }
    };

    player._shogunCombatController = controller;
    player.combatController = controller;

    // ネイティブ将軍は自分の（scaleMultiplier 倍された）currentSubWeapon をそのまま使うため、
    // 旧 boss プールへの解決は不要。getActiveSubWeaponInstance は null フォールバックで currentSubWeapon を返す。
    player._resolveActiveSubWeaponInstance = () => null;
}
