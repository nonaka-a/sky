class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.isPlayingBgm = false;
    this.bgmMode = 'default';
    this.defaultBgmAudio = null;
    this.sliderBgmAudio = null;
    this.flyBgmAudio = null;
    this.fireworkFiles = [
      'sounds/firework.mp3',
      'sounds/firework_s.mp3',
      'sounds/firework_m.mp3'
    ];
  }

  _ensureDefaultBgm() {
    if (!this.defaultBgmAudio && typeof Audio !== 'undefined') {
      this.defaultBgmAudio = new Audio('sounds/BGM.mp3');
      this.defaultBgmAudio.loop = true;
      this.defaultBgmAudio.volume = 0.42;
    }
    return this.defaultBgmAudio;
  }

  _ensureSliderBgm() {
    if (!this.sliderBgmAudio && typeof Audio !== 'undefined') {
      this.sliderBgmAudio = new Audio('sounds/mini_skySlider_BGM.mp3');
      this.sliderBgmAudio.loop = true;
      this.sliderBgmAudio.volume = 0.26;
    }
    return this.sliderBgmAudio;
  }

  _ensureFlyBgm() {
    if (!this.flyBgmAudio && typeof Audio !== 'undefined') {
      this.flyBgmAudio = new Audio('sounds/mini_fly_BGM.mp3');
      this.flyBgmAudio.loop = true;
      this.flyBgmAudio.volume = 0.42;
    }
    return this.flyBgmAudio;
  }

  setBgmMode(mode) {
    const nextMode =
      mode === 'mini_skySlider'
        ? 'mini_skySlider'
        : mode === 'mini_flyContest'
          ? 'mini_flyContest'
          : 'default';
    if (this.bgmMode === nextMode) return;
    this.bgmMode = nextMode;
    if (this.isPlayingBgm && this.enabled) {
      this.stopBgm();
      this.startBgm();
    }
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(val) {
    this.enabled = val;
    if (!val) {
      this.stopBgm();
    } else {
      this.init();
      this.startBgm();
    }
  }

  playTone(freq, endFreq, duration, type = 'sine', volume = 0.15, delay = 0) {
    if (!this.enabled || !this.ctx || volume <= 0.001) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playJump(volScale = 1.0) {
    this.init();
    this.playTone(320, 680, 0.18, 'sine', 0.16 * volScale);
    this.playTone(480, 820, 0.14, 'triangle', 0.08 * volScale, 0.03);
  }

  playDoubleJump(volScale = 1.0) {
    this.init();
    this.playTone(460, 920, 0.17, 'sine', 0.15 * volScale);
    this.playTone(690, 1180, 0.15, 'triangle', 0.09 * volScale, 0.04);
  }

  playBounce(volScale = 1.0) {
    this.init();
    this.playTone(260, 920, 0.28, 'sine', 0.18 * volScale);
    this.playTone(520, 1180, 0.22, 'triangle', 0.1 * volScale, 0.04);
  }

  playLand(volScale = 1.0) {
    this.init();
    this.playTone(220, 120, 0.1, 'sine', 0.1 * volScale);
  }

  playRespawn(volScale = 1.0) {
    this.init();
    this.playTone(440, 587, 0.12, 'sine', 0.12 * volScale, 0);
    this.playTone(587, 880, 0.18, 'sine', 0.14 * volScale, 0.09);
  }

  playHeartGreet(volScale = 1.0) {
    this.init();
    this.playTone(659.25, 659.25, 0.12, 'sine', 0.13 * volScale, 0);
    this.playTone(880.0, 880.0, 0.14, 'sine', 0.13 * volScale, 0.08);
    this.playTone(1046.5, 1046.5, 0.24, 'triangle', 0.12 * volScale, 0.16);
  }

  playStarGreet(volScale = 1.0) {
    this.init();
    this.playTone(783.99, 783.99, 0.1, 'triangle', 0.12 * volScale, 0);
    this.playTone(987.77, 987.77, 0.12, 'triangle', 0.12 * volScale, 0.07);
    this.playTone(1318.51, 1318.51, 0.22, 'sine', 0.12 * volScale, 0.14);
  }

  playStarWin(volScale = 1.0) {
    this.init();
    this.playTone(523.25, 523.25, 0.1, 'triangle', 0.12 * volScale, 0);
    this.playTone(659.25, 659.25, 0.1, 'triangle', 0.12 * volScale, 0.08);
    this.playTone(783.99, 783.99, 0.1, 'triangle', 0.12 * volScale, 0.16);
    this.playTone(1046.5, 1046.5, 0.28, 'sine', 0.14 * volScale, 0.24);
  }

  playCoin(volScale = 1.0) {
    this.init();
    this.playTone(987.77, 987.77, 0.08, 'sine', 0.14 * volScale, 0);
    this.playTone(1318.51, 1318.51, 0.22, 'sine', 0.15 * volScale, 0.065);
  }

  playBuy(volScale = 1.0) {
    this.init();
    this.playTone(587.33, 587.33, 0.09, 'triangle', 0.13 * volScale, 0);
    this.playTone(783.99, 783.99, 0.1, 'triangle', 0.13 * volScale, 0.07);
    this.playTone(1174.66, 1174.66, 0.25, 'sine', 0.15 * volScale, 0.14);
  }

  playWingFlap(volScale = 1.0) {
    this.init();
    this.playTone(380, 740, 0.16, 'sine', 0.12 * volScale, 0);
    this.playTone(540, 960, 0.14, 'triangle', 0.07 * volScale, 0.03);
  }

  playClick() {
    this.init();
    this.playTone(620, 740, 0.07, 'triangle', 0.1);
  }

  playRingPass(volScale = 1.0) {
    this.init();
    this.playTone(659.25, 880.0, 0.12, 'sine', 0.15 * volScale, 0);
    this.playTone(987.77, 1318.51, 0.16, 'triangle', 0.13 * volScale, 0.05);
    this.playTone(1567.98, 1760.0, 0.22, 'sine', 0.11 * volScale, 0.1);
  }

  playFlyResult(isNewRecord = false) {
    this.init();
    if (isNewRecord) {
      this.playTone(523.25, 523.25, 0.12, 'triangle', 0.14, 0);
      this.playTone(659.25, 659.25, 0.12, 'triangle', 0.14, 0.09);
      this.playTone(783.99, 783.99, 0.14, 'triangle', 0.14, 0.18);
      this.playTone(1046.5, 1046.5, 0.34, 'sine', 0.16, 0.27);
    } else {
      this.playTone(523.25, 523.25, 0.12, 'sine', 0.13, 0);
      this.playTone(659.25, 659.25, 0.14, 'sine', 0.13, 0.09);
      this.playTone(783.99, 783.99, 0.24, 'triangle', 0.12, 0.18);
    }
  }

  playFirework(volScale = 1.0) {
    if (!this.enabled || typeof Audio === 'undefined') return;
    const src = this.fireworkFiles[Math.floor(Math.random() * this.fireworkFiles.length)];
    const audio = new Audio(src);
    audio.volume = Math.min(1.0, 0.45 * volScale);
    audio.play().catch(() => {});
  }

  startBgm() {
    if (!this.enabled) return;
    this.init();
    this.isPlayingBgm = true;

    if (this.bgmMode === 'mini_skySlider') {
      if (this.defaultBgmAudio) {
        this.defaultBgmAudio.pause();
        this.defaultBgmAudio.currentTime = 0;
      }
      if (this.flyBgmAudio) {
        this.flyBgmAudio.pause();
        this.flyBgmAudio.currentTime = 0;
      }
      const audio = this._ensureSliderBgm();
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }

    if (this.bgmMode === 'mini_flyContest') {
      if (this.defaultBgmAudio) {
        this.defaultBgmAudio.pause();
        this.defaultBgmAudio.currentTime = 0;
      }
      if (this.sliderBgmAudio) {
        this.sliderBgmAudio.pause();
        this.sliderBgmAudio.currentTime = 0;
      }
      const audio = this._ensureFlyBgm();
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }

    if (this.sliderBgmAudio) {
      this.sliderBgmAudio.pause();
      this.sliderBgmAudio.currentTime = 0;
    }
    if (this.flyBgmAudio) {
      this.flyBgmAudio.pause();
      this.flyBgmAudio.currentTime = 0;
    }

    const defaultAudio = this._ensureDefaultBgm();
    if (defaultAudio && defaultAudio.paused) {
      defaultAudio.play().catch(() => {});
    }
  }

  stopBgm() {
    this.isPlayingBgm = false;
    if (this.defaultBgmAudio) {
      this.defaultBgmAudio.pause();
      this.defaultBgmAudio.currentTime = 0;
    }
    if (this.sliderBgmAudio) {
      this.sliderBgmAudio.pause();
      this.sliderBgmAudio.currentTime = 0;
    }
    if (this.flyBgmAudio) {
      this.flyBgmAudio.pause();
      this.flyBgmAudio.currentTime = 0;
    }
  }
}