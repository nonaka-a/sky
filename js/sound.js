class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.isPlayingBgm = false;
    this.bgmMode = 'default';
    this.defaultBgmAudio = null;
    this.sliderBgmAudio = null;
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
      this.sliderBgmAudio.volume = 0.42;
    }
    return this.sliderBgmAudio;
  }

  setBgmMode(mode) {
    const nextMode = mode === 'mini_skySlider' ? 'mini_skySlider' : 'default';
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

  playClick() {
    this.init();
    this.playTone(620, 740, 0.07, 'triangle', 0.1);
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
      const audio = this._ensureSliderBgm();
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
  }
}