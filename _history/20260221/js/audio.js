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
        
        // 初期ボリューム
        this.masterVolume = 0.6;
        this.sfxVolume = 0.6;
        
        this.initialized = false;
        
        // 効果音重複防止用
        this.lastEnemyDeathTime = 0;
        this.enemyDeathCooldown = 50; // 50ms以内の重複を防ぐ

        // BGMファイルパス定義
        this.bgmFiles = {
            title: 'bgm/opening.mp3',
            ending: 'bgm/ending.mp3',
            shop: 'bgm/shop.mp3',
            boss: 'bgm/boss.mp3',
            lastboss: 'bgm/lastboss.mp3',
            gameover: 'bgm/gameover.mp3',
            stage_1: 'bgm/stage1.mp3',
            stage_2: 'bgm/stage2.mp3',
            stage_3: 'bgm/stage3.mp3',
            stage_4: 'bgm/stage4.mp3',
            stage_5: 'bgm/stage5.mp3',
            stage_6: 'bgm/stage6.mp3'
        };

        // 主要な SE のプリロード（タイミングの高速化）
        this.sfxPool = {
            death: new Audio('se/death.mp3'),
            deflect: new Audio('se/deflect.mp3'),
            landing: new Audio('se/landing.mp3'),
            ooyari: new Audio('se/ooyari.mp3'),
            shuriken: new Audio('se/shuriken.mp3'),
            katana: new Audio('se/katana.mp3'),
            combined: new Audio('se/combined.mp3'),
            exp: new Audio('se/exp.mp3'),
            cursor: new Audio('se/cursor.mp3'),
            change: new Audio('se/change.mp3'),
            gamestart: new Audio('se/gamestart.mp3'),
            levelup: new Audio('se/levelup.mp3'),
            skillup: new Audio('se/skillup.mp3'),
            item: new Audio('se/item.mp3'),
            jump: new Audio('se/jump.mp3'),
            dash: new Audio('se/dash.mp3'),
            knockdown: new Audio('se/knockdown.mp3'),
            damage: new Audio('se/damage.mp3'),
            special: new Audio('se/special.mp3')
        };
        // プリロード設定
        Object.values(this.sfxPool).forEach(audio => {
            audio.preload = 'auto';
            audio.load();
        });

        this.restoreMuteState();
    }

    restoreMuteState() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const raw = window.localStorage.getItem(this.muteStorageKey);
            if (raw === '1') this.isMuted = true;
            if (raw === '0') this.isMuted = false;
        } catch (e) {
            // localStorage が使えない環境では無視
        }
    }

    persistMuteState() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            window.localStorage.setItem(this.muteStorageKey, this.isMuted ? '1' : '0');
        } catch (e) {
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
            !this.bgmPausedByGame
        ) {
            this.tryPlayCurrentBgm(true);
        }
    }
    
    init() {
        if (this.initialized) {
            this.resume();
            return;
        }
        
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // マスター出力
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
            this.masterGain.connect(this.audioContext.destination);
            
            // SFX 出力
            this.sfxGain = this.audioContext.createGain();
            this.sfxGain.gain.value = this.sfxVolume;
            this.sfxGain.connect(this.masterGain);
            
            this.initialized = true;
            console.log('Audio system initialized (File-based BGM)');
        } catch (e) {
            console.warn('Audio not supported:', e);
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
    playFileSfx(filePath, volume = 1.0, playbackRate = 1.0, startTime = 0.02, preferPoolDirect = false) {
        if (this.isMuted) return;
        
        // プリロード済みプールにあるか確認（ファイル名だけで判定）
        const fileName = filePath.split('/').pop().split('.')[0];
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
        this.playFileSfx('se/katana.mp3', 0.8, playbackRate, 0.02);
    }

    playDualBladeCombined() {
        this.init();
        this.playFileSfx('se/combined.mp3', 0.82, 1.0, 0.02);
    }

    playExpGain() {
        this.init();
        this.playFileSfx('se/exp.mp3', 0.42, 1.0, 0.02);
    }

    playSkillUp() {
        this.init();
        this.playFileSfx('se/skillup.mp3', 0.9, 1.0, 0.02);
    }

    playItemPurchase() {
        this.init();
        // 立ち上がりを速くするため、先頭無音を少し飛ばして直接再生を優先
        this.playFileSfx('se/item.mp3', 0.62, 1.03, 0.03, true);
    }

    playCursor() {
        this.init();
        this.playFileSfx('se/cursor.mp3', 0.84, 1.06, 0.03);
    }

    playWeaponSwitch() {
        this.init();
        // Dキー切替: 立ち上がり優先、1.5倍速/高めピッチ、音量はやや控えめ
        this.playFileSfx('se/change.mp3', 0.68, 1.5, 0.045, true);
    }

    playGameStart() {
        this.init();
        // 立ち上がりを速める: 先頭無音を少し飛ばし、プール直再生で遅延を減らす
        this.playFileSfx('se/gamestart.mp3', 0.82, 1.03, 0.03, true);
    }

    playLevelUpWindow() {
        this.init();
        this.playFileSfx('se/levelup.mp3', 0.78, 1.0, 0.02);
    }
    
    playJump() {
        this.init();
        // 立ち上がり（startTime）を 0.02秒飛ばし、速度を 1.4倍にしてキレを出す
        this.playFileSfx('se/jump.mp3', 0.65, 1.4, 0.02);
    }
    playDash() {
        this.init();
        // 1.2倍速で鋭いダッシュ感を出す
        this.playFileSfx('se/dash.mp3', 0.6, 1.2, 0.02);
    }
    playDamage() {
        this.init();
        // 撃破音と同じ 0.6 に調整
        this.playFileSfx('se/damage.mp3', 0.6, 1.1, 0.02);
    }
    playHeal() { this.init(); this.playSfx(523.25, 'sine', 0.2, 0.2, 1.2); } // ド
    playPowerUp() {
        this.init();
        // 上昇音
        const now = this.audioContext.currentTime;
        this.playSfx(440, 'sine', 0.1, 0.1, 1.0);
        setTimeout(() => this.playSfx(659.25, 'sine', 0.1, 0.1, 1.2), 100);
        setTimeout(() => this.playSfx(880, 'sine', 0.1, 0.1, 1.5), 200);
    }
    playExplosion() {
        this.init();
        // ノイズの音量を下げ、持続を短くしてクリーンな爆発音に
        this.playNoiseSfx(0.18, 0.2, 600);
        this.playSfx(55, 'sine', 0.15, 0.2, 0.4);
    }
    playEnemyDeath() { 
        this.init(); 
        const now = Date.now();
        if (now - this.lastEnemyDeathTime < 60) return;
        this.lastEnemyDeathTime = now;
        
        // 音量は 0.6 に抑え、速度は 1.0 に戻す
        this.playFileSfx('se/death.mp3', 0.6, 1.0, 0.02);
    }
    playSpecial() { 
        this.init(); 
        // 溜め音（より重厚に）
        this.playNoiseSfx(0.2, 0.5, 500);
        this.playSfx(100, 'sawtooth', 0.15, 0.5, 0.5);
        // special.mp3 を重ねる (音量を抑えつつ高速再生でキレを出す)
        this.playFileSfx('se/special.mp3', 0.4, 1.3, 0.02);
    }
    playDeflect() {
        this.init();
        // 手裏剣などを叩き落とした時の金属的な「キン」
        this.playFileSfx('se/deflect.mp3', 0.85, 1.0, 0.02);
    }
    
    playLanding() {
        this.init();
        // わずかに再生速度を上げて立ち上がりを早くする
        this.playFileSfx('se/landing.mp3', 0.6, 1.1, 0.02);
    }

    playSpear() {
        this.init();
        this.playFileSfx('se/ooyari.mp3', 0.8, 1.0, 0.02);
    }

    playShuriken() {
        this.init();
        this.playFileSfx('se/shuriken.mp3', 0.7, 1.0, 0.02);
    }

    playStageClear() {
        this.init();
        this.playFileSfx('se/clear.mp3', 0.9, 1.0, 0.02);
    }
    
    playPlayerDeath() {
        this.init();
        if (this.isMuted) return;
        
        // knockdown.mp3 をやまびこ状に再生 (0ms, 250ms, 500ms...)
        const volumes = [1.0, 0.4, 0.15, 0.05];
        volumes.forEach((v, i) => {
            setTimeout(() => {
                // 回を追うごとに少しずつピッチを下げる
                this.playFileSfx('se/knockdown.mp3', v * 0.8, 1.0 - i * 0.05, 0.02);
            }, i * 250);
        });
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
                this.playFileSfx('se/knockdown.mp3', v, rate, 0.02);
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
    playMoney() { this.init(); this.playSfx(900, 'sine', 0.15, 0.08, 1.3); }

    // === BGM制御（ファイル再生のみ） ===
    playBgm(type = 'stage', stageNum = 1, fadeDuration = 1500, fadeInDuration) {
        this.bgmPausedByGame = false;
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
            if (this.currentBgmType === targetType) return;
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        } else if (type === 'boss') {
            targetType = stageNum === 6 ? 'lastboss' : 'boss';
            if (this.currentBgmType === targetType) return;
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        } else {
            if (this.currentBgmType === targetType) return;
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        }
        
        if (!filePath) {
            console.warn(`BGM file for ${type} not found.`);
            return;
        }

        // --- クロスフェードロジック ---
        const oldBgm = this.bgmAudio;
        if (oldBgm) {
            this.fadeOutBgm(oldBgm, fadeDuration);
        }

        // 新規BGM再生
        const newBgm = new Audio(filePath);
        newBgm.preload = 'auto';
        newBgm.playsInline = true;
        newBgm.loop = true;
        newBgm.volume = 0; // フェードインのため 0 から開始
        
        this.bgmAudio = newBgm;
        this.tryPlayCurrentBgm(true);
        this.fadeInBgm(newBgm, fadeInDuration);
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
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            
            try {
                audioElement.volume = startVolume * (1 - progress);
            } catch (e) {
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
            audioElement.pause();
            audioElement.currentTime = 0;
            audioElement.src = '';
            audioElement.load(); // リソース解放の強制
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
        if (this.bgmAudio) {
            this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
            if (!this.isMuted && this.bgmAudio.paused) {
                this.tryPlayCurrentBgm(true);
            }
        }
        
        return this.isMuted;
    }
}

export const audio = new AudioManager();
