// ============================================
// Unification of the Nation - 効果音・BGMシステム
// ============================================

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.sfxGain = null;
        
        // BGM管理
        this.bgmAudio = null; // 現在再生中のAudio要素
        this.currentBgmType = null;
        this.bgmVolume = 0.3;
        this.isMuted = false;
        this.bgmRetryRegistered = false;
        this.bgmRetryHandler = null;
        
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
            stage_5: 'bgm/stage5.mp3'
        };
    }
    
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        // HTMLAudioElementはContextと独立しているが、念のため
        if (this.bgmAudio && this.bgmAudio.paused && !this.isMuted) {
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
            this.masterGain.gain.value = this.masterVolume;
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
    playSlash(comboNum = 0) {
        this.init();
        // 高めの周波数で鋭い斬撃音
        const freq = 400 + comboNum * 80;
        this.playSfx(freq, 'triangle', 0.2, 0.08, 0.3);
        // 「シュッ」という風切り音（高周波ノイズ）
        this.playNoiseSfx(0.3, 0.08, 3000);
    }
    
    playJump() { this.init(); this.playSfx(280, 'square', 0.2, 0.12, 2.5); }
    playDash() { this.init(); this.playNoiseSfx(0.15, 0.15, 1000); }
    playDamage() { this.init(); this.playSfx(120, 'square', 0.25, 0.25, 0.4); }
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
        this.playNoiseSfx(0.35, 0.4, 400);
        this.playSfx(60, 'sine', 0.25, 0.35, 0.5);
    }
    playEnemyDeath() { 
        this.init(); 
        // 重複防止（クールダウンを50msから100msに延長）
        const now = Date.now();
        if (now - this.lastEnemyDeathTime < 100) return;
        this.lastEnemyDeathTime = now;
        
        this.playSfx(350, 'square', 0.1, 0.25, 0.3); // ボリュームを0.12から0.1に少し下げ
    }
    playSpecial() { 
        this.init(); 
        // 溜め音（より重厚に）
        this.playNoiseSfx(0.2, 0.5, 500);
        this.playSfx(100, 'sawtooth', 0.15, 0.5, 0.5);
    }
    playDeflect() {
        this.init();
        // 手裏剣などを叩き落とした時の金属的な「キン」
        this.playSfx(2520, 'triangle', 0.2, 0.08, 0.97);
        this.playSfx(1760, 'sine', 0.14, 0.11, 0.99);
        this.playSfx(3360, 'sine', 0.1, 0.06, 1.0);
        this.playNoiseSfx(0.07, 0.03, 5600);
    }
    
    playBeamLaunch() {
        this.init();
        // 突き抜けるようなビーム発射音
        this.playNoiseSfx(0.4, 0.8, 200); // 爆発的なノイズ
        this.playSfx(50, 'sawtooth', 0.3, 0.6, 4.0); // 重低音の上昇
        this.playSfx(800, 'sine', 0.2, 0.4, 0.5); // 高音の煌めき
    }
    playSelect() { this.init(); this.playSfx(800, 'sine', 0.08, 0.08, 1.0); }
    playLevelUp() {
        this.init();
        [523, 659, 784, 1047].forEach((freq, i) => {
            setTimeout(() => this.playSfx(freq, 'sine', 0.12, 0.18, 1.0), i * 100);
        });
    }
    playMoney() { this.init(); this.playSfx(900, 'sine', 0.15, 0.08, 1.3); }

    // === BGM制御（ファイル再生のみ） ===
    playBgm(type = 'stage', stageNum = 1) {
        this.resume();
        let filePath = '';
        let targetType = type;
        
        if (type === 'stage') {
            // ステージ番号ごとに専用BGMを再生
            const parsedStage = Number.isFinite(stageNum) ? Math.floor(stageNum) : 1;
            const normalizedStage = Math.max(1, Math.min(5, parsedStage));
            targetType = `stage_${normalizedStage}`;
            
            // ステージ間移動で同じ曲なら再読み込みしない
            if (this.currentBgmType === targetType) {
                if (this.bgmAudio && this.bgmAudio.paused && !this.isMuted) this.tryPlayCurrentBgm(true);
                return;
            }
            
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        } else if (type === 'boss') {
            targetType = stageNum === 5 ? 'lastboss' : 'boss';
            if (this.currentBgmType === targetType) {
                if (this.bgmAudio && this.bgmAudio.paused && !this.isMuted) this.tryPlayCurrentBgm(true);
                return;
            }
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        } else {
            if (this.currentBgmType === targetType) {
                if (this.bgmAudio && this.bgmAudio.paused && !this.isMuted) this.tryPlayCurrentBgm(true);
                return;
            }
            this.currentBgmType = targetType;
            filePath = this.bgmFiles[targetType];
        }
        
        if (!filePath) {
            console.warn(`BGM file for ${type} not found.`);
            return;
        }

        // 既存BGM停止
        this.stopBgm();
        
        // 新規BGM再生
        this.bgmAudio = new Audio(filePath);
        this.bgmAudio.preload = 'auto';
        this.bgmAudio.playsInline = true;
        this.bgmAudio.loop = true; // ループ再生
        this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
        
        // エラーハンドリング
        this.bgmAudio.onerror = (e) => {
            console.error('BGM Load Error:', e);
        };

        this.tryPlayCurrentBgm(true);
    }

    tryPlayCurrentBgm(registerRetry = false) {
        if (!this.bgmAudio || this.isMuted) return;
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
            if (!this.bgmAudio || !this.bgmAudio.paused || this.isMuted) {
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

    stopBgm() {
        this.unregisterBgmRetry();
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio = null;
        }
    }

    pauseBgm() {
        if (this.bgmAudio && !this.bgmAudio.paused) {
            this.bgmAudio.pause();
        }
    }

    resumeBgm() {
        if (this.bgmAudio && this.bgmAudio.paused && !this.isMuted) {
            this.tryPlayCurrentBgm(true);
        }
    }

    // 汎用ヘルパー (SE用)
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
