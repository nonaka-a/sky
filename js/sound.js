class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.isPlayingBgm = false;
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

  playClick() {
    this.init();
    this.playTone(620, 740, 0.07, 'triangle', 0.1);
  }

  startBgm() {
    if (!this.enabled || this.isPlayingBgm) return;
    this.init();
    this.isPlayingBgm = true;

    const melody = [
      523.25, 0, 659.25, 783.99, 0, 659.25, 587.33, 523.25,
      659.25, 0, 783.99, 880.00, 0, 783.99, 659.25, 587.33,
      523.25, 587.33, 659.25, 783.99, 880.00, 0, 783.99, 659.25,
      587.33, 0, 659.25, 523.25, 0, 392.00, 523.25, 0
    ];

    const bass = [
      261.63, 0, 0, 0, 196.00, 0, 0, 0,
      220.00, 0, 0, 0, 196.00, 0, 0, 0,
      174.61, 0, 0, 0, 196.00, 0, 0, 0,
      196.00, 0, 0, 0, 261.63, 0, 0, 0
    ];

    const stepMs = 210;
    this.bgmTimer = setInterval(() => {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const idx = this.bgmStep % melody.length;
      const mFreq = melody[idx];
      const bFreq = bass[idx];

      if (mFreq > 0) {
        this.playTone(mFreq, mFreq, 0.19, 'sine', 0.045);
      }
      if (bFreq > 0) {
        this.playTone(bFreq, bFreq, 0.36, 'triangle', 0.035);
      }
      this.bgmStep++;
    }, stepMs);
  }

  stopBgm() {
    this.isPlayingBgm = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}