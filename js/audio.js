// ============================================
// Unification of the Nation - 効果音・BGMシステム
// ============================================

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.muteStorageKey = 'uon_audio_muted';
        
        // BGM管理
        this.bgmAudio = null; // 現在再生中のAudio要素
        this.currentBgmType = null;
        this.bgmVolume = 0.3;
        this.isMuted = false;
        this.bgmRetryRegistered = false;
        this.bgmRetryHandler = null;
        this.bgmPausedByGame = false;
        // 画面が隠れて(バックグラウンド)止めたぶん。ゲーム側のポーズとは別に持つ。
        // 一緒にすると、ポーズ中にホームへ戻って帰ってきたときに勝手に鳴り出す。
        this.bgmPausedByHidden = false;
        this.visibilityHandlingReady = false;
        this.activeBgmAudios = new Set();
        /* 【BGMの要素は曲ごとに1つだけ持つ】。鳴らすたびに new Audio していたため、
           切り替えのたびに要素が増えた。iOS は同時に扱える音声の数が限られるので、
           新しい方を作った瞬間に古い方が止められる＝ブツッと切れ、しかも新しい方は
           読み直しになるので鳴り出すまで無音が続く
           (実機フィードバック 2026-09-19「BGMがバツっと切れて地図のBGM開始まで無音」)。 */
        this.bgmPool = new Map();
        
        // 初期ボリューム
        this.masterVolume = 0.6;
        this.sfxVolume = 0.6;
        
        this.initialized = false;
        
        /* 【SEは鳴らすたびに要素を増やさない】。プールの Audio を cloneNode して
           鳴らしていたため、鳴らした数だけ要素とデコーダが積み上がった。iOS は
           同時に扱える音声の数が限られ、積むほど鳴り出しが遅れていく
           (実機フィードバック 2026-09-19「効果音がどんどん遅延していく」)。
           一度デコードした音を使い回し、鳴らすときは軽い BufferSource を作る。 */
        this.sfxBuffers = new Map();        // ファイルパス -> AudioBuffer
        this.sfxBufferPending = new Map();  // デコード中のもの(二重取得を防ぐ)

        // 効果音重複防止用（クールダウン管理）
        this.lastPlayTimes = {}; // 'filename': timestamp
        this.defaultCooldownMs = 40; // 同一ファイルの基本クールダウン

        // BGMファイルパス定義
        this.bgmFiles = {
            title: 'bgm/opening.mp3',
            ending: 'bgm/ending.mp3',
            // メニュー系の共通曲(よろず屋/ステータス/セレクト/結果発表)
            menu: 'bgm/menu.mp3',
            boss: 'bgm/boss.mp3',
            lastboss: 'bgm/lastboss.mp3',
            gameover: 'bgm/gameover.mp3',
            stage_1: 'bgm/stage1.mp3',
            stage_2: 'bgm/stage2.mp3',
            stage_3: 'bgm/stage3.mp3',
            stage_4: 'bgm/stage4.mp3',
            stage_5: 'bgm/stage5.mp3',
            stage_6: 'bgm/stage6.mp3',
            // 寄り道(小判蔵/修行道場)の専用曲
            sideBonus: 'bgm/substage1.mp3',
            sideTraining: 'bgm/substage2.mp3'
        };

        // 主要な SE のプリロード（タイミングの高速化）
        // タイトル画面で必要な最小限のもののみ即時ロードし、他は必要に応じてロード
        this.sfxPool = {
            cursor: new Audio('se/cursor.mp3'),
            gamestart: new Audio('se/gamestart.mp3'),
            death: new Audio('se/death.mp3'),
            coin: new Audio('se/coin.mp3'),
            // 他は遅延ロード
            deflect: null, landing: null, ooyari: null, shuriken: null, katana: null,
            combined: null, exp: null, change: null, levelup: null, skillup: null,
            item: null, jump: null, dash: null, knockdown: null, damage: null, special: null,
            max: null
        };

        // 必須 SE の初期ロード
        ['cursor', 'gamestart', 'death', 'coin'].forEach(key => {
            if (this.sfxPool[key]) {
                this.sfxPool[key].preload = 'auto';
                this.sfxPool[key].load();
            }
        });

        this.restoreMuteState();
        this.setupPageVisibilityHandling();
    }

    // ============================================
    // バックグラウンドへ回ったらBGMを止める
    // ============================================
    // HTMLAudioElement は画面が隠れても再生を続ける。ホーム画面に置いたPWA
    // (standalone)では、ブラウザのタブのように閉じることも、コントロールセンターから
    // 止めることもできない＝利用者の側に止める手段が無い(実機フィードバック 2026-09-19)。
    // 隠れたら自分で止め、戻ったら元の状態へ復帰させる。
    setupPageVisibilityHandling() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        if (this.visibilityHandlingReady) return;
        this.visibilityHandlingReady = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.handleAppHidden();
            else this.handleAppVisible();
        });
        // iOS ではアプリ切替で pagehide だけが来ることがある(凍結・破棄の前触れ)。
        window.addEventListener('pagehide', () => this.handleAppHidden());
        window.addEventListener('pageshow', () => this.handleAppVisible());
    }

    handleAppHidden() {
        if (this.bgmPausedByHidden) return;
        this.bgmPausedByHidden = true;
        // フェードは requestAnimationFrame で進むので、隠れている間は止まったままになる。
        // フェード途中の(=消える予定の)BGMはここで畳み、現行BGMだけを一時停止で残す。
        for (const audioElement of [...this.activeBgmAudios]) {
            if (audioElement._isFadingOut) {
                this.forceStopAudio(audioElement);
            } else {
                try { audioElement.pause(); } catch { /* 非致命 */ }
            }
        }
        if (this.bgmAudio && !this.bgmAudio.paused) {
            try { this.bgmAudio.pause(); } catch { /* 非致命 */ }
        }
        if (this.audioContext && this.audioContext.state === 'running') {
            // suspend/resume は Promise を返さない実装(旧webkit)もあるので受けてから握る
            try { this.audioContext.suspend?.()?.catch?.(() => {}); } catch { /* 非致命 */ }
        }
    }

    handleAppVisible() {
        if (!this.bgmPausedByHidden) return;
        this.bgmPausedByHidden = false;
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try { this.audioContext.resume?.()?.catch?.(() => {}); } catch { /* 非致命 */ }
        }
        // ゲーム側がポーズで止めていた／音を切っている場合は、止めたままにする。
        if (this.bgmPausedByGame || this.isMuted) return;
        if (this.bgmAudio && this.bgmAudio.paused && !this.bgmAudio._isFadingOut) {
            // 復帰直後は自動再生が弾かれることがあるので、次のタップで拾えるようにする。
            this.tryPlayCurrentBgm(true);
        }
    }

    restoreMuteState() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const raw = window.localStorage.getItem(this.muteStorageKey);
            if (raw === '1') this.isMuted = true;
            if (raw === '0') this.isMuted = false;
        } catch {
            // localStorage が使えない環境では無視
        }
    }

    persistMuteState() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            window.localStorage.setItem(this.muteStorageKey, this.isMuted ? '1' : '0');
        } catch {
            // 保存失敗は非致命
        }
    }
    
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        // HTMLAudioElementはContextと独立しているが、念のため
        if (
            this.bgmAudio &&
            this.bgmAudio.paused &&
            !this.isMuted &&
            !this.bgmAudio._isFadingOut &&
            !this.bgmPausedByGame &&
            !this.bgmPausedByHidden
        ) {
            this.tryPlayCurrentBgm(true);
        }
    }
    
    init() {
        if (this.initialized) {
            this.resume();
            return;
        }
        
        // 1段階目: AudioContext 生成のみ (極めて軽量に)
        setTimeout(() => {
            if (this.initialized) return;
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                this.audioContext = new AudioContext();
                
                // 2段階目: マスター/SFX ゲインの設定 (次フレーム以降)
                setTimeout(() => {
                    this.masterGain = this.audioContext.createGain();
                    this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
                    this.masterGain.connect(this.audioContext.destination);
                    
                    this.sfxGain = this.audioContext.createGain();
                    this.sfxGain.gain.value = this.sfxVolume;
                    this.sfxGain.connect(this.masterGain);
                    
                    this.initialized = true;
                    console.log('Audio system initialized (Multi-stage)');

                    // 先に要る音はここでデコードを始める(初回の一発目から軽い経路に乗る)
                    ['se/cursor.mp3', 'se/gamestart.mp3', 'se/death.mp3', 'se/coin.mp3']
                        .forEach((f) => this.ensureSfxBuffer(f));
                    
                    // 3段階目: 残りの SE ロード開始 (さらに遅延)
                    setTimeout(() => this.loadRemainingSfx(), 500);
                }, 16);
            } catch (e) {
                console.warn('Audio not supported:', e);
            }
        }, 1);
    }
    
    loadRemainingSfx() {
        const remaining = {
            deflect: 'se/deflect.mp3',
            landing: 'se/landing.mp3',
            ooyari: 'se/ooyari.mp3',
            shuriken: 'se/shuriken.mp3',
            katana: 'se/katana.mp3',
            combined: 'se/combined.mp3',
            exp: 'se/exp.mp3',
            change: 'se/change.mp3',
            levelup: 'se/levelup.mp3',
            skillup: 'se/skillup.mp3',
            item: 'se/item.mp3',
            jump: 'se/jump.mp3',
            dash: 'se/dash.mp3',
            knockdown: 'se/knockdown.mp3',
            damage: 'se/damage.mp3',
            special: 'se/special.mp3',
            max: 'se/max.mp3'
        };

        const keys = Object.keys(remaining);
        let index = 0;
        
        // 一定間隔で1つずつロードし、瞬間的な CPU/ネットワーク負荷を避ける
        const loadNext = () => {
            if (index >= keys.length) return;
            const key = keys[index];
            if (!this.sfxPool[key]) {
                const audio = new Audio(remaining[key]);
                audio.preload = 'auto';
                this.sfxPool[key] = audio;
            }
            this.ensureSfxBuffer(remaining[key]);   // Web Audio 側にも取り込む
            index++;
            setTimeout(loadNext, 200);
        };
        
        loadNext();
    }
    
    // 音を一度だけ取り込んでデコードしておく（以後は使い回す）
    ensureSfxBuffer(filePath) {
        if (!filePath || !this.audioContext) return null;
        if (this.sfxBuffers.has(filePath)) return this.sfxBuffers.get(filePath);
        if (this.sfxBufferPending.has(filePath)) return null;
        const ctx = this.audioContext;
        const p = fetch(filePath)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then((buf) => ctx.decodeAudioData(buf))
            .then((decoded) => {
                this.sfxBuffers.set(filePath, decoded);
                this.sfxBufferPending.delete(filePath);
            })
            .catch(() => {
                // 取れない/デコードできない音は従来の経路へ落とす（鳴らない事故を作らない）
                this.sfxBufferPending.delete(filePath);
            });
        this.sfxBufferPending.set(filePath, p);
        return null;
    }

    /* デコード済みの音を鳴らす。鳴らせたら true。
       音量は従来の HTMLAudio 経路(sfxVolume × 指定)と同じになるよう destination へ
       直に繋ぐ。ミュートは呼び出し元(playFileSfx)で弾いている。 */
    playBufferSfx(filePath, volume, playbackRate, startTime) {
        const ctx = this.audioContext;
        const buffer = this.sfxBuffers.get(filePath);
        if (!ctx || !buffer || ctx.state === 'closed') return false;
        try {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            if (Number.isFinite(playbackRate) && playbackRate > 0) src.playbackRate.value = playbackRate;
            const gain = ctx.createGain();
            gain.gain.value = Math.max(0, volume);
            src.connect(gain);
            gain.connect(ctx.destination);
            const offset = Math.max(0, Math.min(buffer.duration - 0.01, startTime || 0));
            src.start(0, offset);
            // 鳴り終わったら切り離す(ノードを残さない)
            src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch { /* 非致命 */ } };
            return true;
        } catch {
            return false;
        }
    }

    // ノイズ生成 (SE用)
    createNoise(duration = 0.1) {
        if (!this.audioContext) return null;
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }
    
    // === 効果音 ===
    playFileSfx(filePath, volume = 1.0, playbackRate = 1.0, startTime = 0.02, preferPoolDirect = false, useCooldown = true) {
        if (this.isMuted) return;
        
        const fileName = filePath.split('/').pop().split('.')[0];

        // 重複再生防止（クールダウン）
        if (useCooldown) {
            const now = Date.now();
            const lastTime = this.lastPlayTimes[fileName] || 0;
            if (now - lastTime < this.defaultCooldownMs) {
                return; // クールダウン中は再生スキップ
            }
            this.lastPlayTimes[fileName] = now;
        }

        // 鳴らせるならデコード済みの音で鳴らす(要素を増やさない)
        if (this.playBufferSfx(filePath, this.sfxVolume * volume, playbackRate, startTime)) return;
        // まだ取り込めていない音は、ここで取り込みを始めて今回だけ従来の経路で鳴らす
        this.ensureSfxBuffer(filePath);

        // プリロード済みプールにあるか確認
        let sfx;
        
        if (this.sfxPool[fileName]) {
            const pooled = this.sfxPool[fileName];
            if (preferPoolDirect && (pooled.paused || pooled.ended)) {
                // 開始遅延を減らすため、空いている時はプール本体を直接使う
                sfx = pooled;
            } else {
                // 同時再生が必要な場合はクローン
                sfx = pooled.cloneNode();
            }
        } else {
            sfx = new Audio(filePath);
        }

        sfx.volume = this.sfxVolume * volume;
        
        // ピッチ補正を無効化（速度を上げると音も高くなるようにする）
        if (typeof sfx.preservesPitch !== 'undefined') {
            sfx.preservesPitch = false;
        } else if (typeof sfx.mozPreservesPitch !== 'undefined') {
            sfx.mozPreservesPitch = false;
        } else if (typeof sfx.webkitPreservesPitch !== 'undefined') {
            sfx.webkitPreservesPitch = false;
        }

        sfx.playbackRate = playbackRate;
        if (startTime > 0) {
            sfx.currentTime = startTime;
        }
        sfx.play().catch(e => console.warn("SFX play failed:", e));
    }

    playSlash(comboNum = 0) {
        this.init();
        // 変化を 0.1 に強めて、よりはっきり音程が上がるように調整
        const playbackRate = 1.0 + comboNum * 0.1;
        this.playFileSfx('se/katana.mp3', 0.8, playbackRate, 0.08);
    }

    playDualBladeCombined() {
        this.init();
        this.playFileSfx('se/combined.mp3', 0.82, 1.0, 0.04);
    }

    playExpGain() {
        this.init();
        this.playFileSfx('se/exp.mp3', 0.42, 1.0, 0.06);
    }

    playSkillUp() {
        this.init();
        this.playFileSfx('se/skillup.mp3', 0.9, 1.0, 0.04);
    }

    playSpecialReady() {
        this.init();
        // 奥義が満ちた合図。以前は合成音を2つ重ねていた(ポヨンと鳴った)。
        // 音量は控えめに、立ち上がりはプール直再生＋先頭無音を飛ばして速くする。
        this.playFileSfx('se/max.mp3', 0.62, 1.0, 0.03, true);
    }

    playItemPurchase() {
        this.init();
        // 立ち上がりを速くするため、先頭無音を少し飛ばして直接再生を優先
        this.playFileSfx('se/item.mp3', 0.62, 1.03, 0.04, true);
    }

    playCursor() {
        this.init();
        this.playFileSfx('se/cursor.mp3', 0.84, 1.06, 0.04);
    }

    playWeaponSwitch() {
        this.init();
        // Dキー切替: 立ち上がり優先、1.5倍速/高めピッチ、音量はやや控えめ
        this.playFileSfx('se/change.mp3', 0.68, 1.5, 0.06, true);
    }

    playGameStart() {
        this.init();
        // 立ち上がりを速める: 先頭無音を少し飛ばし、プール直再生で遅延を減らす
        this.playFileSfx('se/gamestart.mp3', 0.82, 1.03, 0.04, true);
    }

    playLevelUpWindow() {
        this.init();
        this.playFileSfx('se/levelup.mp3', 0.78, 1.0, 0.04);
    }
    
    playJump() {
        this.init();
        // 立ち上がり（startTime）を 0.1秒飛ばし、速度を 1.8倍にしてキレを出す
        this.playFileSfx('se/jump.mp3', 0.3, 1.8, 0.04);
    }
    playDash() {
        this.init();
        // 1.2倍速で鋭いダッシュ感を出す
        this.playFileSfx('se/dash.mp3', 0.6, 1.2, 0.04);
    }
    playDamage() {
        this.init();
        // 撃破音と同じ 0.6 に調整
        this.playFileSfx('se/damage.mp3', 0.6, 1.1, 0.04);
    }
    playHeal() { this.init(); this.playSfx(523.25, 'sine', 0.2, 0.2, 1.2); } // ド
    playPowerUp() {
        this.init();
        // 上昇音
        this.playSfx(440, 'sine', 0.1, 0.1, 1.0);
        setTimeout(() => this.playSfx(659.25, 'sine', 0.1, 0.1, 1.2), 100);
        setTimeout(() => this.playSfx(880, 'sine', 0.1, 0.1, 1.5), 200);
    }
    playExplosion() {
        this.init();
        const now = Date.now();
        if (now - (this.lastPlayTimes['explosion_synth'] || 0) < 60) return; // 合成音もクールダウン
        this.lastPlayTimes['explosion_synth'] = now;
        
        // 火薬玉の破裂感を少し強める（過大にならない範囲で増量）
        this.playNoiseSfx(0.23, 0.2, 600);
        this.playSfx(55, 'sine', 0.19, 0.2, 0.4);
    }
    playEnemyDeath() { 
        this.init(); 
        // playFileSfx内でクールダウン管理するため直接呼ぶ
        this.playFileSfx('se/death.mp3', 0.6, 1.0, 0.02);
    }
    playSpecial() { 
        this.init(); 
        // 溜め音（より重厚に）
        this.playNoiseSfx(0.2, 0.5, 500);
        this.playSfx(100, 'sawtooth', 0.15, 0.5, 0.5);
        // special.mp3 を重ねる (音量を抑えつつ高速再生でキレを出す)
        this.playFileSfx('se/special.mp3', 0.4, 1.3, 0.04);
    }
    playDeflect() {
        this.init();
        // 手裏剣などを叩き落とした時の金属的な「キン」
        this.playFileSfx('se/deflect.mp3', 0.6, 1.0, 0.04);
    }
    
    playLanding() {
        this.init();
        // わずかに再生速度を上げて立ち上がりを早くする
        this.playFileSfx('se/landing.mp3', 0.6, 1.1, 0.04);
    }

    playSpear() {
        this.init();
        this.playFileSfx('se/ooyari.mp3', 0.8, 1.0, 0.06);
    }

    playShuriken() {
        this.init();
        this.playFileSfx('se/shuriken.mp3', 0.7, 1.0, 0.08);
    }

    playStageClear() {
        this.init();
        this.playFileSfx('se/clear.mp3', 0.9, 1.0, 0.04);
    }
    
    playPlayerDeath() {
        this.init();
        if (this.isMuted) return;

        // 「カーン」の一撃だけ。以前は250msおきにピッチを下げながら4回重ねて
        // やまびこにしていたが、音程が下がっていくのが不評だった
        // (実機フィードバック 2026-09-19)。
        this.playFileSfx('se/knockdown.mp3', 0.8, 1.0, 0.04);
    }

    playBossDeath() {
        this.init();
        if (this.isMuted) return;
        
        // ボスはより重厚で長いやまびこ
        // playBossDeath 独自の演出（地鳴り）は残しつつ death.mp3 を核にする
        this.playNoiseSfx(0.8, 2.5, 100); // 重低音ノイズ
        this.playSfx(40, 'sawtooth', 0.8, 2.0, 0.05); // 地鳴り

        const volumes = [1.2, 0.7, 0.4, 0.2, 0.1, 0.05];
        volumes.forEach((v, i) => {
            setTimeout(() => {
                // 初回は 0.7倍速で巨大な咆哮のようにし、徐々にピッチを戻す（またはさらに下げる）
                const rate = 0.7 - i * 0.02;
                this.playFileSfx('se/knockdown.mp3', v, rate, 0.04);
            }, i * 350);
        });
        
        // 勝利の凱歌（煌めく高音）はそのまま残す
        const now = this.audioContext.currentTime;
        for (let i = 0; i < 12; i++) {
            const freq = 800 + (i % 4) * 400 + i * 100;
            const osc = this.audioContext.createOscillator();
            const g = this.audioContext.createGain();
            const startTime = now + 0.5 + i * 0.15;
            osc.frequency.setValueAtTime(freq, startTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.5, startTime + 0.5);
            g.gain.setValueAtTime(0.1, startTime);
            g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
            osc.connect(g);
            g.connect(this.sfxGain);
            osc.start(startTime);
            osc.stop(startTime + 0.6);
        }
    }

    playLevelUpSelect() {
        this.init();
        // 爽快感のある「シャキーン」という決定音
        this.playSfx(880, 'sine', 0.2, 0.4, 1.5);
        this.playSfx(1760, 'sine', 0.15, 0.5, 1.2);
        this.playNoiseSfx(0.15, 0.3, 4000);
    }
    
    playSelect() { this.playCursor(); }
    playLevelUp() {
        this.init();
        [523, 659, 784, 1047].forEach((freq, i) => {
            setTimeout(() => this.playSfx(freq, 'sine', 0.12, 0.18, 1.0), i * 100);
        });
    }
    // 小判の獲得音。手応えに直結するので取りこぼしと遅延を避ける:
    //  - 共通クールダウン(40ms)は使わず専用の 32ms。連取しても鳴り続ける
    //  - startTime=0 で先頭から（既定の 0.02 スキップは立ち上がりを削る）
    //  - preferPoolDirect=true でプール本体を直接鳴らす（cloneNode の間を省く）
    playMoney() {
        const now = Date.now();
        if (now - (this._lastCoinAt || 0) < 32) return;
        this._lastCoinAt = now;
        this.playFileSfx('se/coin.mp3', 0.85, 1.0, 0, true, false);
    }

    // === BGM制御（ファイル再生のみ） ===
    playBgm(type = 'stage', stageNum = 1, fadeDuration = 800, fadeInDuration) {
        this.bgmPausedByGame = false;
        // 旧称の互換（'shop' はよろず屋専用に見えるが、実体はメニュー系の共通曲）
        if (type === 'shop') type = 'menu';
        // fadeInDurationが未指定の場合はfadeDurationを使う
        if (fadeInDuration === undefined) fadeInDuration = fadeDuration;
        
        // ボス戦切り替えは高速フェードで緊迫感を出す
        if (type === 'boss') {
            fadeDuration = Math.min(fadeDuration, 300);
            fadeInDuration = Math.min(fadeInDuration, 400);
        }

        this.resume();
        let filePath = '';
        let targetType = type;
        
        if (type === 'stage') {
            const parsedStage = Number.isFinite(stageNum) ? Math.floor(stageNum) : 1;
            const normalizedStage = Math.max(1, Math.min(6, parsedStage));
            targetType = `stage_${normalizedStage}`;
            // 同じ曲の場合はあえて return せず、クロスフェード（ループの繋ぎを滑らかにする効果）を許容する
            // if (this.currentBgmType === targetType) return;
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        } else if (type === 'sideBonus' || type === 'sideTraining') {
            // 寄り道はスコアアタックなので毎回【頭から】流す(再挑戦は仕切り直し)。
            // 下の else と違い、同じ曲でも作り直す。
            targetType = type;
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        } else if (type === 'boss') {
            targetType = stageNum === 6 ? 'lastboss' : 'boss';
            // if (this.currentBgmType === targetType) return;
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        } else {
            // ステージ以外（shop/title/ending/gameover）は、同じ曲が既に鳴っていれば
            // 何もしない。作り直すと再生位置が 0 に戻るため、同じ曲を使う画面を
            // 行き来するたびに頭出しされていた（ステータス画面⇄よろず屋は共に 'menu'）。
            // ステージ曲だけは上の分岐で意図的に作り直す（ループの繋ぎを隠すため）。
            if (this.currentBgmType === targetType && this.bgmAudio && !this.bgmAudio.paused) {
                this.currentBgmType = targetType;
                return;
            }
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        }
        
        if (!filePath) {
            console.warn(`BGM file for ${type} not found.`);
            return;
        }

        // --- クロスフェードロジック ---
        const oldBgm = this.bgmAudio;
        const newBgm = this.getBgmElement(filePath);
        // 前に落としかけたまま行列に残っている場合があるので、掛け金を解いてから使う
        newBgm._isFadingOut = false;
        newBgm.loop = true;
        newBgm.volume = 0; // フェードインのため 0 から開始
        newBgm.muted = !!this.isMuted;
        try { newBgm.currentTime = 0; } catch { /* 読み込み前は失敗する。非致命 */ }

        /* 【差し替えてから前の曲を落とす】。落とすのが先だと、フェード0の呼び出しで
           forceStopAudio が同期的に走り「今の曲＝落とした曲」と見て currentBgmType を
           消してしまう(同じ曲かどうかの判定が以後効かなくなる)。 */
        this.bgmAudio = newBgm;
        this.activeBgmAudios.add(newBgm);
        // 同じ曲を鳴らし直すときは要素が同じになる。自分を自分でフェードアウトしない。
        if (oldBgm && oldBgm !== newBgm) {
            this.fadeOutBgm(oldBgm, fadeDuration);
        }
        this.tryPlayCurrentBgm(true);
        this.fadeInBgm(newBgm, fadeInDuration);
    }

    // 曲ごとの要素を返す(無ければ作る)。読み込みは一度きりで済む。
    getBgmElement(filePath) {
        let el = this.bgmPool.get(filePath);
        if (!el) {
            el = new Audio(filePath);
            el.preload = 'auto';
            el.playsInline = true;
            el.loop = true;
            this.bgmPool.set(filePath, el);
        }
        return el;
    }

    fadeOutBgm(audioElement, duration) {
        if (typeof audioElement === 'number' && duration === undefined) {
            duration = audioElement;
            audioElement = this.bgmAudio;
        }
        if (!audioElement) return;

        // 既にフェードアウト中であることを示すフラグをセット（多重実行防止）
        if (audioElement._isFadingOut) return;
        audioElement._isFadingOut = true;

        const durationMs = (duration < 100) ? duration * 1000 : duration;
        if (durationMs <= 0) {
            this.forceStopAudio(audioElement);
            return;
        }

        const startVolume = audioElement.volume;
        const startTime = Date.now();
        
        const fade = () => {
            /* 落としている最中に鳴らし直されたら、落とすのをやめる。曲ごとに1つの
               要素を使い回すので、同じ要素が返ってくることがある。鳴らし直す側
               (playBgm)が掛け金を解くので、ここはそれを見るだけでよい
               ――「今の曲か」で見ると、今の曲を落とす fadeOutBgm(500) の
               単独呼び出しまで無効になる。 */
            if (!audioElement._isFadingOut) return;
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            
            try {
                audioElement.volume = startVolume * (1 - progress);
            } catch {
                // ボリューム設定エラー対策
            }
            
            if (progress < 1) {
                requestAnimationFrame(fade);
            } else {
                this.forceStopAudio(audioElement);
            }
        };
        fade();
    }

    forceStopAudio(audioElement) {
        if (!audioElement) return;
        try {
            this.activeBgmAudios.delete(audioElement);
            audioElement.pause();
            audioElement.currentTime = 0;
            /* 【src は外さない】。曲ごとに1つの要素を使い回しているので、外すと次に
               鳴らすとき読み直しになり、iOS では鳴り出すまで無音が続く。 */
            audioElement._isFadingOut = false;
            
            if (this.bgmAudio === audioElement) {
                this.bgmAudio = null;
                this.currentBgmType = null;
            }
        } catch (e) {
            console.warn('Audio stop error:', e);
        }
    }

    fadeInBgm(audioElement, duration) {
        if (!audioElement) return;
        
        // durationが秒単位(例えば0.8)で渡されることが多いが、Date.now()計算はミリ秒
        const durationMs = (duration < 100) ? duration * 1000 : duration;

        const targetVolume = this.isMuted ? 0 : this.bgmVolume;
        
        // durationが0以下の場合は即座に目標音量にして終了
        if (durationMs <= 0) {
            audioElement.volume = targetVolume;
            return;
        }

        const startTime = Date.now();
        
        const fade = () => {
            if (this.bgmAudio !== audioElement) return; // 別のBGMが開始されたら中断
            
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            
            audioElement.volume = targetVolume * progress;
            
            if (progress < 1) {
                requestAnimationFrame(fade);
            }
        };
        fade();
    }

    applyMuteToBgm(audioElement) {
        if (!audioElement) return;
        try {
            // iOS Safari では volume のみだと反映されないケースがある
            audioElement.muted = !!this.isMuted;
            audioElement.volume = this.isMuted ? 0 : this.bgmVolume;
        } catch {
            // 非致命
        }
    }

    syncMuteForAllBgm() {
        for (const audioElement of this.activeBgmAudios) {
            this.applyMuteToBgm(audioElement);
        }
        if (this.bgmAudio) {
            this.applyMuteToBgm(this.bgmAudio);
        }
    }

    tryPlayCurrentBgm(registerRetry = false) {
        if (!this.bgmAudio) return;
        const playPromise = this.bgmAudio.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    this.unregisterBgmRetry();
                })
                .catch((error) => {
                    console.warn('BGM Auto-play prevented:', error);
                    if (registerRetry) this.registerBgmRetry();
                });
        }
    }

    registerBgmRetry() {
        if (this.bgmRetryRegistered) return;
        this.bgmRetryRegistered = true;
        this.bgmRetryHandler = () => {
            this.resume();
            this.tryPlayCurrentBgm(false);
            if (this.bgmAudio && !this.bgmAudio.paused) {
                this.unregisterBgmRetry();
            }
        };
        window.addEventListener('pointerdown', this.bgmRetryHandler, false);
        window.addEventListener('touchstart', this.bgmRetryHandler, false);
        window.addEventListener('keydown', this.bgmRetryHandler, false);
    }

    unregisterBgmRetry() {
        if (!this.bgmRetryRegistered || !this.bgmRetryHandler) return;
        window.removeEventListener('pointerdown', this.bgmRetryHandler, false);
        window.removeEventListener('touchstart', this.bgmRetryHandler, false);
        window.removeEventListener('keydown', this.bgmRetryHandler, false);
        this.bgmRetryHandler = null;
        this.bgmRetryRegistered = false;
    }

    stopBgm(fadeDuration = 0) {
        this.unregisterBgmRetry();
        this.bgmPausedByGame = false;
        if (this.bgmAudio) {
            if (fadeDuration > 0) {
                this.fadeOutBgm(this.bgmAudio, fadeDuration);
                this.bgmAudio = null;
                this.currentBgmType = null;
            } else {
                this.activeBgmAudios.delete(this.bgmAudio);
                this.bgmAudio.pause();
                this.bgmAudio.currentTime = 0;
                this.bgmAudio = null;
                this.currentBgmType = null;
            }
        }
    }

    pauseBgm() {
        if (this.bgmAudio && !this.bgmAudio.paused) {
            this.bgmPausedByGame = true;
            this.bgmAudio.pause();
        }
    }

    resumeBgm() {
        this.bgmPausedByGame = false;
        if (this.bgmAudio && this.bgmAudio.paused && !this.isMuted && !this.bgmAudio._isFadingOut) {
            this.tryPlayCurrentBgm(true);
        }
    }

    // 汎用ヘルパー (SE用)
    playSfx(freq, type, gainValue, duration, dropFreq = 0.5) {
        if (!this.audioContext || this.isMuted) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const now = this.audioContext.currentTime;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * dropFreq, now + duration);
        gain.gain.setValueAtTime(gainValue, now);
        gain.gain.linearRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + duration);
    }

    playNoiseSfx(gainValue, duration, highPass = 2000) {
        if (!this.audioContext || this.isMuted) return;
        const buffer = this.createNoise(duration);
        if (!buffer) return;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        filter.type = 'highpass';
        filter.frequency.value = highPass;
        
        const now = this.audioContext.currentTime;
        gain.gain.setValueAtTime(gainValue, now);
        gain.gain.linearRampToValueAtTime(0.001, now + duration);
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        source.start(now);
        source.stop(now + duration);
    }

    setMasterVolume(v) { 
        this.masterVolume = v; 
        if (this.masterGain) this.masterGain.gain.value = v; 
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.persistMuteState();
        
        // SFXミュート
        if (this.masterGain) this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
        
        // BGMミュート（Audio要素）
        this.syncMuteForAllBgm();
        if (this.bgmAudio) {
            if (!this.isMuted && this.bgmAudio.paused) {
                this.tryPlayCurrentBgm(true);
            }
        }
        
        return this.isMuted;
    }
}

// シングルトンとしてエクスポート
// InputManager同様、動的インポートと静的インポートの混在によるインスタンス分裂を防止し、
// ミュート状態などの再生ステートを完全に同期するため、window.gameAudio を経由して一元化する。
if (!window.gameAudio) {
    window.gameAudio = new AudioManager();
}
export const audio = window.gameAudio;

