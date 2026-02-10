// ============================================
// Unification of the Nation - 入力管理
// ============================================

import { KEYS, VIRTUAL_PAD } from './constants.js';
import { audio } from './audio.js';

class InputManager {
    constructor() {
        this.keys = {};
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        
        this.keysJustReleased = {};
        
        // キーマッピング
        this.keyMap = {
            'ArrowLeft': 'LEFT',
            'ArrowRight': 'RIGHT',
            'ArrowUp': 'UP',
            'ArrowDown': 'DOWN',
            ' ': 'JUMP',
            'z': 'ATTACK', 'Z': 'ATTACK',
            'x': 'BOMB', 'X': 'BOMB',
            'c': 'SUB_WEAPON', 'C': 'SUB_WEAPON',
            'd': 'SWITCH_WEAPON', 'D': 'SWITCH_WEAPON',
            's': 'SPECIAL', 'S': 'SPECIAL',
            'Shift': 'DASH',
            'Escape': 'PAUSE', 'p': 'PAUSE', 'P': 'PAUSE'
        };

        // タッチ操作用
        this.touches = {}; // touchId -> actionName
        this.canvas = null;
        this.scaleX = 1;
        this.scaleY = 1;
        
        this.init();
        
        // 汎用タップ判定用
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.touchJustPressed = false;
    }
    
    init() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // タッチイベント
        window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        window.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        window.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
        
        // フォーカスが外れた時にキー状態をリセット
        window.addEventListener('blur', () => this.reset());
        
        // マウスイベント（PCデバッグ用・クリックをタッチとして扱う）
        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        // mousemoveは今回は省略（ドラッグ操作がないため）
    }
    
    onMouseDown(e) {
        // キャンバス外クリックは無視（オプション）
        // audio.init() はユーザインタラクション必須なのでここで呼ぶ
        audio.init();
        
        const fakeTouch = {
            identifier: 'mouse',
            clientX: e.clientX,
            clientY: e.clientY
        };
        
        this.updateTouchPosition(fakeTouch);
        this.touchJustPressed = true;
        this.handleTouch(fakeTouch);
    }
    
    onMouseUp(e) {
        // タッチ終了扱い
        const action = this.touches['mouse'];
        if (action) {
            this.releaseAction(action);
            delete this.touches['mouse'];
        }
    }
    
    setCanvas(canvas) {
        this.canvas = canvas;
    }

    // 動的スケーリング設定
    setScale(sx, sy) {
        this.scaleX = sx;
        this.scaleY = sy;
    }
    
    onTouchStart(e) {
        audio.init();
        e.preventDefault();
        // 汎用タップ情報の更新
        const touch = e.changedTouches[0];
        this.updateTouchPosition(touch);
        this.touchJustPressed = true;

        for (const touch of e.changedTouches) {
            this.handleTouch(touch);
        }
    }
    
    updateTouchPosition(touch) {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        this.lastTouchX = (touch.clientX - rect.left) * this.scaleX;
        this.lastTouchY = (touch.clientY - rect.top) * this.scaleY;
    }
    
    onTouchMove(e) {
        e.preventDefault();
        // 移動中の処理（ボタン外に出た場合など）は簡略化のため現状はstart/endのみ
    }
    
    onTouchEnd(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const action = this.touches[touch.identifier];
            if (action) {
                this.releaseAction(action);
                delete this.touches[touch.identifier];
            }
        }
    }
    
    handleTouch(touch) {
        if (!this.canvas) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * this.scaleX;
        const y = (touch.clientY - rect.top) * this.scaleY;
        
        const action = this.getTouchAction(x, y);
        if (action) {
            this.pressAction(action);
            this.touches[touch.identifier] = action;
        }
    }
    
    getTouchAction(x, y) {
        const H = 720; // 基準高さ
        const W = 1280; // 基準幅
        
        const pad = VIRTUAL_PAD;
        const bottomY = H - pad.BOTTOM_MARGIN;
        
        // --- 左側：移動 & ジャンプ ---
        const leftX = pad.SAFE_MARGIN_X;
        const size = pad.BUTTON_SIZE * 1.2; // 判定大きめ（1.2倍）
        
        if (this.checkRectHit(x, y, leftX + pad.LEFT.x, bottomY + pad.LEFT.y, size)) return 'LEFT';
        if (this.checkRectHit(x, y, leftX + pad.RIGHT.x, bottomY + pad.RIGHT.y, size)) return 'RIGHT';
        if (this.checkRectHit(x, y, leftX + pad.DOWN.x, bottomY + pad.DOWN.y, size)) return 'DOWN';
        if (this.checkRectHit(x, y, leftX + pad.JUMP.x, bottomY + pad.JUMP.y, size)) return 'JUMP';
        
        // --- 右側：アクション ---
        const rightX = W - pad.SAFE_MARGIN_X;
        
        if (this.checkRectHit(x, y, rightX + pad.ATTACK.x, bottomY + pad.ATTACK.y, size)) return 'ATTACK';
        if (this.checkRectHit(x, y, rightX + pad.BOMB.x, bottomY + pad.BOMB.y, size)) return 'BOMB';
        if (this.checkRectHit(x, y, rightX + pad.SUB_WEAPON.x, bottomY + pad.SUB_WEAPON.y, size)) return 'SUB_WEAPON';
        
        if (this.checkRectHit(x, y, rightX + pad.SPECIAL.x, bottomY + pad.SPECIAL.y, size)) return 'SPECIAL';
        if (this.checkRectHit(x, y, rightX + pad.SWITCH.x, bottomY + pad.SWITCH.y, size)) return 'SWITCH_WEAPON';
        
        return null;
    }
    
    checkRectHit(touchX, touchY, cx, cy, halfSize) {
        return (touchX >= cx - halfSize && touchX <= cx + halfSize &&
                touchY >= cy - halfSize && touchY <= cy + halfSize);
    }
    
    checkCircleHit(touchX, touchY, circleX, circleY, radius) {
        const dx = touchX - circleX;
        const dy = touchY - circleY;
        return (dx * dx + dy * dy) <= (radius * radius);
    }
    
    pressAction(action) {
        if (!KEYS[action]) return;
        const key = KEYS[action][0];
        if (!this.keys[key]) {
            this.keysJustPressed[key] = true;
        }
        this.keys[key] = true;
    }
    
    releaseAction(action) {
        if (!KEYS[action]) return;
        const key = KEYS[action][0];
        this.keys[key] = false;
        this.keysJustReleased[key] = true;
    }
    
    onKeyDown(e) {
        audio.init();
        // ゲーム中のデフォルト動作を防止
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
        
        const action = this.keyMap[e.key];
        if (action) {
            // ダブルタップでダッシュ (LEFT/RIGHT)
            if ((action === 'LEFT' || action === 'RIGHT') && !e.repeat) {
                const now = Date.now();
                if (!this.lastKeyTimes) this.lastKeyTimes = {};
                const lastTime = this.lastKeyTimes[action] || 0;
                
                if (now - lastTime < 300) {
                    // Double Tap Detected -> Trigger DASH
                    this.pressKey(KEYS['DASH'][0]);
                    this.lastKeyTimes[action] = 0; // Reset
                } else {
                    this.lastKeyTimes[action] = now;
                }
            }

            this.pressKey(KEYS[action][0]); // KEYS定数の最初のキー名を内部IDとして使う
            
            // 特殊対応: ArrowUpはUPだが、JUMPとしても扱う
            if (e.key === 'ArrowUp') {
                this.pressKey(KEYS['JUMP'][0]);
            }
        }
    }
    
    pressKey(key) {
        if (!this.keys[key]) {
            this.keysJustPressed[key] = true;
        }
        this.keys[key] = true;
    }
    
    onKeyUp(e) {
        const action = this.keyMap[e.key];
        if (action) {
            this.releaseKey(KEYS[action][0]);
            
            if (e.key === 'ArrowUp') {
                this.releaseKey(KEYS['JUMP'][0]);
            }
        }
    }
    
    releaseKey(key) {
        this.keys[key] = false;
        this.keysJustReleased[key] = true;
    }
    
    // フレーム終了時に呼び出し（JustPressedをリセット、Gamepadの更新）
    update() {
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        this.touchJustPressed = false;
        
        this.pollGamepad();
    }
    
    pollGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0]; 
        if (!gp) return;

        const deadzone = 0.25;
        const axisX = gp.axes[0]; 
        const axisY = gp.axes[1]; 
        
        // --- 移動 (Lスティック or D-pad) ---
        // 左 / 左D-pad
        if (axisX < -deadzone || (gp.buttons[14] && gp.buttons[14].pressed)) this.pressAction('LEFT');
        else this.releaseAction('LEFT');
        
        // 右 / 右D-pad
        if (axisX > deadzone || (gp.buttons[15] && gp.buttons[15].pressed)) this.pressAction('RIGHT');
        else this.releaseAction('RIGHT');
        
        // しゃがみ / 下D-pad (伏せ)
        if (axisY > deadzone || (gp.buttons[13] && gp.buttons[13].pressed)) this.pressAction('DOWN');
        else this.releaseAction('DOWN');

        // 上 / 上D-pad (キーボードのArrowUp同様、JUMPとしても扱う)
        const upPressed = axisY < -deadzone || (gp.buttons[12] && gp.buttons[12].pressed);
        if (upPressed) {
            this.pressAction('UP');
        } else {
            this.releaseAction('UP');
        }

        // --- アクションボタン (一般的なアクションゲーム配置) ---
        // 南ボタン (× / A): ジャンプ
        if (gp.buttons[0].pressed || upPressed) this.pressAction('JUMP');
        else this.releaseAction('JUMP');
        
        // 西ボタン (□ / X): 通常攻撃
        if (gp.buttons[2].pressed) this.pressAction('ATTACK');
        else this.releaseAction('ATTACK');

        // 北ボタン (△ / Y): サブ武器 (SUB_WEAPON)
        if (gp.buttons[3].pressed) this.pressAction('SUB_WEAPON');
        else this.releaseAction('SUB_WEAPON');
        
        // 東ボタン (○ / B): ボム
        if (gp.buttons[1].pressed) this.pressAction('BOMB');
        else this.releaseAction('BOMB');
        
        // R1: 武器切り替え (SWITCH_WEAPON)
        if (gp.buttons[5].pressed) this.pressAction('SWITCH_WEAPON');
        else this.releaseAction('SWITCH_WEAPON');
        
        // L1: 必殺技 (SPECIAL)
        if (gp.buttons[4].pressed) this.pressAction('SPECIAL');
        else this.releaseAction('SPECIAL');
        
        // L2: ダッシュ (DASH)
        if (gp.buttons[6].pressed) this.pressAction('DASH');
        else this.releaseAction('DASH');
        
        // Options / Menu / Start: ポーズ
        if (gp.buttons[9].pressed || gp.buttons[8].pressed) this.pressAction('PAUSE');
        else this.releaseAction('PAUSE');
    }
    
    reset() {
        this.keys = {};
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        this.touches = {};
    }
    
    // アクションがアクティブか（押し続けている）
    isAction(action) {
        const keyList = KEYS[action];
        if (!keyList) return false;
        return keyList.some(key => this.keys[key]);
    }
    
    // アクションが今押されたか（このフレームで）
    isActionJustPressed(action) {
        const keyList = KEYS[action];
        if (!keyList) return false;
        return keyList.some(key => this.keysJustPressed[key]);
    }
    
    // アクションが今離されたか
    isActionJustReleased(action) {
        const keyList = KEYS[action];
        if (!keyList) return false;
        return keyList.some(key => this.keysJustReleased[key]);
    }
}

// シングルトンとしてエクスポート
export const input = new InputManager();
