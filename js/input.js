// ============================================
// Unification of the Nation - 入力管理
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, KEYS, VIRTUAL_PAD } from './constants.js';
import { audio } from './audio.js';

class InputManager {
    constructor() {
        this.keys = {};
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        this.keySources = {}; // key -> Set(sourceId)
        this.consumedActions = new Set();
        
        // キーマッピング
        this.keyMap = {
            'ArrowLeft': 'LEFT',
            'ArrowRight': 'RIGHT',
            'ArrowUp': 'UP',
            'ArrowDown': 'DOWN',
            ' ': 'JUMP',
            'z': 'ATTACK', 'Z': 'ATTACK',
            'x': 'SUB_WEAPON', 'X': 'SUB_WEAPON',
            's': 'SPECIAL', 'S': 'SPECIAL',
            'c': 'SWITCH_WEAPON', 'C': 'SWITCH_WEAPON',
            'Shift': 'DASH',
            'Escape': 'PAUSE',
            'q': 'DEBUG_TOGGLE', 'Q': 'DEBUG_TOGGLE'
        };
        this.codeMap = {
            'ArrowLeft': 'LEFT',
            'ArrowRight': 'RIGHT',
            'ArrowUp': 'UP',
            'ArrowDown': 'DOWN',
            'Space': 'JUMP',
            'KeyZ': 'ATTACK',
            'KeyX': 'SUB_WEAPON',
            'KeyS': 'SPECIAL',
            'KeyC': 'SWITCH_WEAPON',
            'ShiftLeft': 'DASH',
            'ShiftRight': 'DASH',
            'Escape': 'PAUSE',
            'KeyQ': 'DEBUG_TOGGLE',
            'Enter': 'DEBUG_START'
        };

        // タッチ操作用
        this.touches = {}; // touchId -> actionName[]
        this.canvas = null;
        this.scaleX = 1;
        this.scaleY = 1;
        
        this.init();
        
        // 汎用タップ判定用
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.touchJustPressed = false;

        // 物理キーボードからの入力を検知したか（外部キーボード接続の近似判定）
        this.hasPhysicalKeyboard = false;

        this.virtualStick = {
            active: false,
            touchId: null,
            baseX: 0,
            baseY: 0,
            originX: 0, // 入力方向の基点（指の動きに追従してスライドする）
            originY: 0,
            knobX: 0,
            knobY: 0,
            nx: 0,
            ny: 0
        };
        this.stickDash = {
            lastFlickTime: 0,
            lastFlickDir: 0,
            strongLatched: false,
            dashUntil: 0,
            engageThreshold: Number.isFinite(VIRTUAL_PAD.STICK_DASH_ENGAGE_THRESHOLD)
                ? VIRTUAL_PAD.STICK_DASH_ENGAGE_THRESHOLD
                : 0.93,
            releaseThreshold: Number.isFinite(VIRTUAL_PAD.STICK_DASH_RELEASE_THRESHOLD)
                ? VIRTUAL_PAD.STICK_DASH_RELEASE_THRESHOLD
                : 0.82
        };
        this.lastKeyTimes = { LEFT: 0, RIGHT: 0 };
        this.doubleTapDash = {
            active: false,
            dir: 0,
            thresholdMs: 300
        };
        this.resetVirtualStick();
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
        // UI要素（SELECT, BUTTON, INPUT等）をクリックした場合は、キャンバスへのフォーカス移動をスキップする
        const interactiveTags = ['SELECT', 'BUTTON', 'INPUT', 'A', 'SUMMARY', 'LABEL', 'OPTION'];
        if (interactiveTags.includes(e.target.tagName) || e.target.closest('button, select, input, a, summary, label')) {
            return;
        }

        // Forced Reflow 回避: フォーカスが必要な場合のみ非同期で実行
        if (this.canvas) {
            setTimeout(() => {
                if (document.activeElement !== this.canvas) {
                    this.focusCanvas();
                }
            }, 0);
        }

        // オーディオ初期化は一回だけ行うか、既に初期化済みなら軽い resume のみにする
        // audio.init 内で既に対策済みだが、ハンドラ内での呼び出し自体を必要最小限にする
        if (!audio.initialized) {
            audio.init();
        }
        
        const fakeTouch = {
            identifier: 'mouse',
            clientX: e.clientX,
            clientY: e.clientY
        };
        
        this.updateTouchPosition(fakeTouch);
        this.touchJustPressed = true;
        const pos = this.getCanvasPosition(fakeTouch.clientX, fakeTouch.clientY);
        if (pos && this.checkCircleHit(pos.x, pos.y, ...this.getBgmButtonHitArea())) {
            audio.toggleMute();
            return;
        }
        this.handleTouch(fakeTouch);
    }
    
    onMouseUp() {
        // タッチ終了扱い
        this.releaseTouchBinding('mouse');
    }
    
    setCanvas(canvas) {
        this.canvas = canvas;
        if (this.canvas && this.canvas.tabIndex < 0) {
            this.canvas.tabIndex = 0;
        }
    }

    // 動的スケーリング設定
    setScale(sx, sy) {
        this.scaleX = sx;
        this.scaleY = sy;
    }

    focusCanvas() {
        if (!this.canvas || typeof this.canvas.focus !== 'function') return;
        if (document.activeElement === this.canvas) return;
        try {
            this.canvas.focus({ preventScroll: true });
        } catch {
            this.canvas.focus();
        }
    }
    
    onTouchStart(e) {
        this.focusCanvas();
        audio.init();
        let hasCanvasTouch = false;
        for (const touch of e.changedTouches) {
            if (!this.isTouchInCanvas(touch)) continue;
            hasCanvasTouch = true;
            this.updateTouchPosition(touch);
            this.touchJustPressed = true;
            const pos = this.getCanvasPosition(touch.clientX, touch.clientY);
            if (pos && this.checkCircleHit(pos.x, pos.y, ...this.getBgmButtonHitArea())) {
                audio.toggleMute();
                continue;
            }
            this.handleTouch(touch);
        }
        if (hasCanvasTouch) {
            e.preventDefault();
        }
    }
    
    updateTouchPosition(touch) {
        const pos = this.getCanvasPosition(touch.clientX, touch.clientY);
        if (!pos) return;
        this.lastTouchX = pos.x;
        this.lastTouchY = pos.y;
    }
    
    onTouchMove(e) {
        let handled = false;
        for (const touch of e.changedTouches) {
            const touchId = touch.identifier;
            const isStickTouch = this.virtualStick.active && this.virtualStick.touchId === touchId;

            // スティックを掴んでいる指は、操作半径や黒帯・画面端の外に出ても
            // 離さず追従し続ける（指がずれても入力が切れないように）。
            if (!isStickTouch && !this.isTouchInCanvas(touch)) {
                if (this.touches[touchId] || this.virtualStick.touchId === touchId) handled = true;
                this.releaseTouchBinding(touchId);
                continue;
            }

            this.updateTouchPosition(touch);
            const pos = this.getCanvasPosition(touch.clientX, touch.clientY);
            if (!pos) continue;
            const nextActions = this.getTouchActions(pos.x, pos.y, touchId);
            this.applyTouchBinding(touchId, nextActions);
            handled = true;
        }
        if (handled) {
            e.preventDefault();
        }
    }
    
    onTouchEnd(e) {
        let handled = false;
        for (const touch of e.changedTouches) {
            this.releaseTouchBinding(touch.identifier);
            handled = true;
        }
        if (handled) {
            e.preventDefault();
        }
    }
    
    handleTouch(touch) {
        const pos = this.getCanvasPosition(touch.clientX, touch.clientY);
        if (!pos) return;
        const actions = this.getTouchActions(pos.x, pos.y, touch.identifier);
        this.applyTouchBinding(touch.identifier, actions);
    }

    isTouchInCanvas(touch) {
        const r = this.getRenderRect();
        if (!r) return false;
        return touch.clientX >= r.left &&
               touch.clientX <= r.left + r.width &&
               touch.clientY >= r.top &&
               touch.clientY <= r.top + r.height;
    }
    
    getTouchActions(x, y, touchId = null) {
        const pad = VIRTUAL_PAD;
        const bottomY = CANVAS_HEIGHT - pad.BOTTOM_MARGIN;
        const leftX = pad.SAFE_MARGIN_X;
        const rightX = CANVAS_WIDTH - pad.SAFE_MARGIN_X;
        const touchScale = pad.BUTTON_TOUCH_SCALE || 1.14;
        const attackRadius = (pad.ATTACK_BUTTON_RADIUS || pad.BUTTON_SIZE) * touchScale;
        const auxRadius = (pad.AUX_BUTTON_RADIUS || pad.BUTTON_SIZE) * touchScale;
        const pauseRadius = (pad.PAUSE_BUTTON_RADIUS || 22) * touchScale;
        const pauseX = leftX + (pad.STICK.x || 0) + (pad.PAUSE_BUTTON?.x || 0);
        const pauseY = bottomY + (pad.STICK.y || 0) + (pad.PAUSE_BUTTON?.y || 0);

        // --- 左側：アナログスティック ---
        const hasTouchId = touchId !== null && touchId !== undefined;
        if (hasTouchId) {
            // 既にこの指で掴んでいるなら、操作半径や画面端に関係なく追従し続ける
            if (this.virtualStick.active && this.virtualStick.touchId === touchId) {
                return this.updateHeldStick(x, y);
            }
            // 新規タッチが始動エリア内なら掴み始める
            if (this.isStickStartPoint(x, y)) {
                return this.beginHeldStick(touchId, x, y);
            }
        }

        // 左スティック左下の一時停止ボタン
        if (this.checkCircleHit(x, y, pauseX, pauseY, pauseRadius)) return ['PAUSE'];

        // --- 右側：アクション（円ボタン） ---
        if (this.checkCircleHit(x, y, rightX + pad.ATTACK.x, bottomY + pad.ATTACK.y, attackRadius)) return ['ATTACK'];
        if (this.checkCircleHit(x, y, rightX + pad.SUB_WEAPON.x, bottomY + pad.SUB_WEAPON.y, auxRadius)) return ['SUB_WEAPON'];
        if (this.checkCircleHit(x, y, rightX + pad.SPECIAL.x, bottomY + pad.SPECIAL.y, auxRadius)) {
            return this.canTriggerSpecialFromTouch() ? ['SPECIAL'] : [];
        }
        if (this.checkCircleHit(x, y, rightX + pad.SWITCH.x, bottomY + pad.SWITCH.y, auxRadius)) return ['SWITCH_WEAPON'];

        return [];
    }

    canTriggerSpecialFromTouch() {
        if (typeof window === 'undefined' || !window.game || !window.game.player) return true;
        const player = window.game.player;
        if (!Number.isFinite(player.specialGauge) || !Number.isFinite(player.maxSpecialGauge)) return true;
        return player.specialGauge >= player.maxSpecialGauge;
    }

    // object-fit: contain のレターボックス（黒帯）を考慮し、キャンバスが
    // 実際に描画されている領域を画面座標で返す。
    // スマホ横向きなどで親の max-width/height によりキャンバスのボックスが
    // 16:9 から崩れても、タップ座標が描画内容とズレないようにするためのもの。
    // ボックスが厳密に 16:9 のときは補正ゼロ（従来挙動と同一）。
    getRenderRect() {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        // iOS standalone PWA では TouchEvent.clientX/Y は visual viewport 基準だが、
        // getBoundingClientRect() は layout viewport 基準。canvas の実視覚位置は
        // rect.left/top + visualViewport.offsetLeft/offsetTop なので、ここで基準を揃える。
        // ブラウザ・横起動(offset=0)では加算0で従来と完全同一。
        const vv = window.visualViewport;
        const vox = vv ? vv.offsetLeft : 0;
        const voy = vv ? vv.offsetTop : 0;
        const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
        const rectAspect = rect.width / rect.height;
        let width = rect.width;
        let height = rect.height;
        let left = rect.left + vox;
        let top = rect.top + voy;

        if (rectAspect > canvasAspect) {
            // ボックスが論理比より横長 → 左右に余白（ピラーボックス）
            width = rect.height * canvasAspect;
            left += (rect.width - width) / 2;
        } else if (rectAspect < canvasAspect) {
            // ボックスが論理比より縦長 → 上下に余白（レターボックス）
            height = rect.width / canvasAspect;
            top += (rect.height - height) / 2;
        }
        return { left, top, width, height };
    }

    getCanvasPosition(clientX, clientY) {
        const r = this.getRenderRect();
        if (!r) return null;
        return {
            x: (clientX - r.left) * (CANVAS_WIDTH / r.width),
            y: (clientY - r.top) * (CANVAS_HEIGHT / r.height)
        };
    }

    getStickCenter() {
        const pad = VIRTUAL_PAD;
        return {
            x: pad.SAFE_MARGIN_X + pad.STICK.x,
            y: CANVAS_HEIGHT - pad.BOTTOM_MARGIN + pad.STICK.y
        };
    }

    getBgmButtonHitArea() {
        const pad = VIRTUAL_PAD;
        // スマホでのタップしやすさを考慮し、描画サイズよりも意図的にヒットエリアを広げる
        const isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        const hitRadius = pad.BGM_BUTTON_RADIUS + (isTouch ? 24 : 12); 
        return [
            CANVAS_WIDTH - pad.BGM_BUTTON_MARGIN_RIGHT,
            pad.BGM_BUTTON_MARGIN_TOP,
            hitRadius
        ];
    }

    // 新規タッチがスティック始動エリア内か（固定中心からの距離で判定）
    isStickStartPoint(x, y) {
        const pad = VIRTUAL_PAD;
        const center = this.getStickCenter();
        const dist = Math.hypot(x - center.x, y - center.y);
        return dist <= pad.STICK_TOUCH_RADIUS;
    }

    // スティックを掴み始める。基点は固定中心から開始する。
    beginHeldStick(touchId, x, y) {
        const center = this.getStickCenter();
        this.virtualStick.active = true;
        this.virtualStick.touchId = touchId;
        this.virtualStick.originX = center.x;
        this.virtualStick.originY = center.y;
        return this.updateHeldStick(x, y);
    }

    // 掴んでいる間の更新。指が最大振り幅(STICK_MAX_DISTANCE)を超えたら基点を
    // 指側へスライド追従させ、操作半径や画面端を超えても入力が切れないようにする。
    // 表示は固定中心のまわりにノブを描くので、見た目は固定スティックのまま。
    updateHeldStick(x, y) {
        const pad = VIRTUAL_PAD;
        const maxD = pad.STICK_MAX_DISTANCE || 1;

        let ox = this.virtualStick.originX;
        let oy = this.virtualStick.originY;
        const dx = x - ox;
        const dy = y - oy;
        let dist = Math.hypot(dx, dy);
        const dirX = dist > 0 ? dx / dist : 0;
        const dirY = dist > 0 ? dy / dist : 0;

        if (dist > maxD) {
            // 基点を指に追従させる（指は常に可動域の縁に保たれる）
            ox = x - dirX * maxD;
            oy = y - dirY * maxD;
            this.virtualStick.originX = ox;
            this.virtualStick.originY = oy;
            dist = maxD;
        }

        const ratio = dist / maxD;
        const nx = dirX * ratio;
        const ny = dirY * ratio;

        const center = this.getStickCenter();
        this.virtualStick.baseX = center.x;
        this.virtualStick.baseY = center.y;
        this.virtualStick.knobX = center.x + nx * maxD;
        this.virtualStick.knobY = center.y + ny * maxD;
        this.virtualStick.nx = nx;
        this.virtualStick.ny = ny;

        const actions = this.getStickActionsFromNormalized(nx, ny);
        if (this.updateStickDashState(nx)) {
            actions.push('DASH');
        }
        return actions;
    }

    // 正規化ベクトル(nx, ny: -1〜1)から方向アクションを得る
    getStickActionsFromNormalized(nx, ny) {
        const pad = VIRTUAL_PAD;
        const actions = [];
        if (Math.abs(nx) >= pad.STICK_DEADZONE) {
            if (nx <= -pad.STICK_HORIZONTAL_THRESHOLD) actions.push('LEFT');
            if (nx >= pad.STICK_HORIZONTAL_THRESHOLD) actions.push('RIGHT');
        }
        if (Math.abs(ny) >= pad.STICK_DEADZONE) {
            if (ny <= pad.STICK_UP_THRESHOLD) actions.push('JUMP');
            if (ny >= pad.STICK_DOWN_THRESHOLD) actions.push('DOWN');
        }
        return actions;
    }

    updateStickDashState(normalizedX) {
        const absX = Math.abs(normalizedX);
        const pushThreshold = this.stickDash.engageThreshold;
        const resetThreshold = this.stickDash.releaseThreshold;

        if (absX >= pushThreshold) {
            this.stickDash.strongLatched = true;
            this.stickDash.lastFlickDir = normalizedX >= 0 ? 1 : -1;
        } else if (absX <= resetThreshold) {
            this.stickDash.strongLatched = false;
        }
        return this.stickDash.strongLatched;
    }

    applyTouchBinding(touchId, nextActions) {
        const sourceId = `touch:${touchId}`;
        const prevActions = this.touches[touchId] || [];
        const uniqueNext = [...new Set(nextActions)];

        for (const action of prevActions) {
            if (!uniqueNext.includes(action)) {
                this.releaseAction(action, sourceId);
            }
        }
        for (const action of uniqueNext) {
            if (!prevActions.includes(action)) {
                this.pressAction(action, sourceId);
            }
        }

        if (uniqueNext.length > 0) {
            this.touches[touchId] = uniqueNext;
        } else {
            delete this.touches[touchId];
        }
    }

    releaseTouchBinding(touchId) {
        const sourceId = `touch:${touchId}`;
        const prevActions = this.touches[touchId] || [];
        for (const action of prevActions) {
            this.releaseAction(action, sourceId);
        }
        delete this.touches[touchId];

        if (this.virtualStick.touchId === touchId) {
            this.resetVirtualStick();
            this.stickDash.strongLatched = false;
        }
    }

    resetVirtualStick() {
        const center = this.getStickCenter();
        this.virtualStick.active = false;
        this.virtualStick.touchId = null;
        this.virtualStick.baseX = center.x;
        this.virtualStick.baseY = center.y;
        this.virtualStick.originX = center.x;
        this.virtualStick.originY = center.y;
        this.virtualStick.knobX = center.x;
        this.virtualStick.knobY = center.y;
        this.virtualStick.nx = 0;
        this.virtualStick.ny = 0;
    }

    getVirtualStickState() {
        if (!this.virtualStick.active) {
            const center = this.getStickCenter();
            return {
                active: false,
                baseX: center.x,
                baseY: center.y,
                knobX: center.x,
                knobY: center.y,
                nx: 0,
                ny: 0
            };
        }
        return { ...this.virtualStick };
    }

    isTouchDashActive() {
        if (!this.virtualStick.active) return false;
        return Math.abs(this.virtualStick.nx) >= this.stickDash.engageThreshold;
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
    
    setKeySource(key, sourceId, pressed) {
        if (!this.keySources[key]) {
            this.keySources[key] = new Set();
        }
        const sources = this.keySources[key];
        const wasPressed = sources.size > 0;
        if (pressed) {
            sources.add(sourceId);
        } else {
            sources.delete(sourceId);
        }
        const isPressed = sources.size > 0;
        this.keys[key] = isPressed;
        if (!wasPressed && isPressed) {
            this.keysJustPressed[key] = true;
        } else if (wasPressed && !isPressed) {
            this.keysJustReleased[key] = true;
        }
    }

    pressAction(action, sourceId = 'action') {
        if (!KEYS[action]) return;
        const key = KEYS[action][0];
        this.setKeySource(key, sourceId, true);
    }
    
    releaseAction(action, sourceId = 'action') {
        if (!KEYS[action]) return;
        const key = KEYS[action][0];
        this.setKeySource(key, sourceId, false);
    }
    
    onKeyDown(e) {
        audio.init();
        // 物理キーボードの入力を検知（外部キーボード接続の判定に使う）
        this.hasPhysicalKeyboard = true;
        // ゲーム中のデフォルト動作を防止
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
        
        const sourceId = `kbd:${e.code || e.key}`;
        const action = this.codeMap[e.code] || this.keyMap[e.key];
        if (action) {
            // ダブルタップで継続ダッシュ (LEFT/RIGHT)
            if ((action === 'LEFT' || action === 'RIGHT') && !e.repeat) {
                const now = Date.now();
                const lastTime = this.lastKeyTimes[action] || 0;
                const dir = action === 'RIGHT' ? 1 : -1;
                if (now - lastTime <= this.doubleTapDash.thresholdMs) {
                    this.doubleTapDash.active = true;
                    this.doubleTapDash.dir = dir;
                }
                this.lastKeyTimes[action] = now;
            }

            this.pressKey(KEYS[action][0], sourceId); // KEYS定数の最初のキー名を内部IDとして使う
            // 注: ArrowUp は KEYS.JUMP にも含まれるためジャンプとして機能する。ここで別途スペースを
            //     押すと「↑＝決定(CONFIRM)」になってしまうため行わない（決定は Space/Enter のみ）。
        }
    }
    
    pressKey(key, sourceId = 'key') {
        this.setKeySource(key, sourceId, true);
    }
    
    onKeyUp(e) {
        const sourceId = `kbd:${e.code || e.key}`;
        const action = this.codeMap[e.code] || this.keyMap[e.key];
        if (action) {
            this.releaseKey(KEYS[action][0], sourceId);

            if (action === 'LEFT' || action === 'RIGHT') {
                const releasedDir = action === 'RIGHT' ? 1 : -1;
                if (this.doubleTapDash.active && this.doubleTapDash.dir === releasedDir) {
                    this.doubleTapDash.active = false;
                    this.doubleTapDash.dir = 0;
                }
                if (!this.isAction('LEFT') && !this.isAction('RIGHT')) {
                    this.doubleTapDash.active = false;
                    this.doubleTapDash.dir = 0;
                }
            }
            
            // ArrowUp の特殊スペース解放は廃止（↑はスペースを押さない方針）
        }
    }

    releaseKey(key, sourceId = 'key') {
        this.setKeySource(key, sourceId, false);
    }
    
    // フレーム終了時に呼び出し（JustPressedをリセット、Gamepadの更新、消費済みアクションのクリア）
    update() {
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        this.consumedActions.clear();
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
        if (axisX < -deadzone || (gp.buttons[14] && gp.buttons[14].pressed)) this.pressAction('LEFT', 'gamepad');
        else this.releaseAction('LEFT', 'gamepad');
        
        // 右 / 右D-pad
        if (axisX > deadzone || (gp.buttons[15] && gp.buttons[15].pressed)) this.pressAction('RIGHT', 'gamepad');
        else this.releaseAction('RIGHT', 'gamepad');
        
        // しゃがみ / 下D-pad (伏せ)
        if (axisY > deadzone || (gp.buttons[13] && gp.buttons[13].pressed)) this.pressAction('DOWN', 'gamepad');
        else this.releaseAction('DOWN', 'gamepad');

        // 上 / 上D-pad (キーボードのArrowUp同様、JUMPとしても扱う)
        const upPressed = axisY < -deadzone || (gp.buttons[12] && gp.buttons[12].pressed);
        if (upPressed) {
            this.pressAction('UP', 'gamepad');
        } else {
            this.releaseAction('UP', 'gamepad');
        }

        // --- アクションボタン (一般的なアクションゲーム配置) ---
        // 南ボタン (× / A): ジャンプ
        if (gp.buttons[0].pressed || upPressed) this.pressAction('JUMP', 'gamepad');
        else this.releaseAction('JUMP', 'gamepad');
        
        // 西ボタン (□ / X): 通常攻撃
        if (gp.buttons[2].pressed) this.pressAction('ATTACK', 'gamepad');
        else this.releaseAction('ATTACK', 'gamepad');

        // 北ボタン (△ / Y): サブ武器 (SUB_WEAPON)
        if (gp.buttons[3].pressed) this.pressAction('SUB_WEAPON', 'gamepad');
        else this.releaseAction('SUB_WEAPON', 'gamepad');

        // 東ボタン (○ / B): 奥義 (SPECIAL)
        if (gp.buttons[1].pressed) this.pressAction('SPECIAL', 'gamepad');
        else this.releaseAction('SPECIAL', 'gamepad');

        // RB / R1: ダッシュ
        if (gp.buttons[5].pressed) this.pressAction('DASH', 'gamepad');
        else this.releaseAction('DASH', 'gamepad');

        // Start: ポーズ
        if (gp.buttons[9].pressed) this.pressAction('PAUSE', 'gamepad');
        else this.releaseAction('PAUSE', 'gamepad');
    }
    
    reset() {
        this.keys = {};
        this.keysJustPressed = {};
        this.keysJustReleased = {};
        this.keySources = {};
        this.touches = {};
        this.resetVirtualStick();
        this.stickDash.lastFlickTime = 0;
        this.stickDash.lastFlickDir = 0;
        this.stickDash.strongLatched = false;
        this.stickDash.dashUntil = 0;
        this.lastKeyTimes = { LEFT: 0, RIGHT: 0 };
        this.doubleTapDash.active = false;
        this.doubleTapDash.dir = 0;
    }

    // キーボードの継続ダッシュ判定
    // - Shift押下 + 左右押下中
    // - 同方向のダブルタップ後、その方向キー押下中
    isKeyboardDashHeld(moveDir = 0) {
        const hasHorizontal = this.isAction('LEFT') || this.isAction('RIGHT');
        if (!hasHorizontal) {
            this.doubleTapDash.active = false;
            this.doubleTapDash.dir = 0;
            return false;
        }

        if (this.isAction('DASH') && moveDir !== 0) {
            return true;
        }

        if (!this.doubleTapDash.active || this.doubleTapDash.dir === 0) {
            return false;
        }

        const requiredAction = this.doubleTapDash.dir > 0 ? 'RIGHT' : 'LEFT';
        if (!this.isAction(requiredAction)) {
            this.doubleTapDash.active = false;
            this.doubleTapDash.dir = 0;
            return false;
        }

        if (moveDir === 0) return true;
        return moveDir === this.doubleTapDash.dir;
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

    // アクションを消費し、このフレーム内での以降の判定を無効化する
    consumeAction(action) {
        this.consumedActions.add(action);
        const keyList = KEYS[action];
        if (keyList) {
            keyList.forEach(key => {
                this.keysJustPressed[key] = false;
            });
        }
    }
}

// シングルトンとしてエクスポート
// プレビュー等の開発環境において、キャッシュバスター付きの動的インポート（dynamic import）と
// 通常の静的インポート（static import）が混在した際、InputManager のインスタンスが分裂し、
// keysJustPressed のクリアが伝達されなくなって無限連打暴発を引き起こすバグを防止するため、
// window.gameInput に一元化して共有する。
if (!window.gameInput) {
    window.gameInput = new InputManager();
    window.gameInput.instanceId = 'Instance_' + Math.random().toString(36).substring(2, 9);
    console.log('[InputManager] Created new instance:', window.gameInput.instanceId);
} else {
    console.log('[InputManager] Reusing existing instance:', window.gameInput.instanceId);
}
export const input = window.gameInput;
