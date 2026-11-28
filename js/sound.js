class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.isPlayingBgm = false;
    this.bgmMode = 'default';

    this.bgmDefs = {
      default: { url: 'sounds/BGM.mp3', volume: 0.42 },
      mini_skySlider: { url: 'sounds/mini_skySlider_BGM.mp3', volume: 0.26 },
      mini_flyContest: { url: 'sounds/mini_fly_BGM.mp3', volume: 0.42 },
      giant_island: { url: 'sounds/BGM_giant.mp3', volume: 0.42 }
    };
    this.bgmBuffers = {};
    this.bgmLoadPromises = {};
    this.bgmPlayToken = 0;
    this.currentBgmSource = null;
    this.currentBgmGain = null;

    this.defaultBgmAudio = null;
    this.sliderBgmAudio = null;
    this.flyBgmAudio = null;
    this.giantBgmAudio = null;
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

  _ensureGiantBgm() {
    if (!this.giantBgmAudio && typeof Audio !== 'undefined') {
      this.giantBgmAudio = new Audio('sounds/BGM_giant.mp3');
      this.giantBgmAudio.loop = true;
      this.giantBgmAudio.volume = 0.42;
    }
    return this.giantBgmAudio;
  }

  _loadBgmBuffer(mode) {
    if (this.bgmBuffers[mode]) {
      return Promise.resolve(this.bgmBuffers[mode]);
    }
    if (this.bgmLoadPromises[mode]) {
      return this.bgmLoadPromises[mode];
    }
    const def = this.bgmDefs[mode];
    if (!def || !this.ctx || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }

    const p = fetch(def.url)
      .then((res) => {
        if (!res.ok) throw new Error('BGM fetch failed');
        return res.arrayBuffer();
      })
      .then((arrBuf) => {
        return new Promise((resolve, reject) => {
          const decoded = this.ctx.decodeAudioData(
            arrBuf,
            (buf) => resolve(buf),
            (err) => reject(err)
          );
          if (decoded && typeof decoded.then === 'function') {
            decoded.then(resolve).catch(reject);
          }
        });
      })
      .then((audioBuf) => {
        this.bgmBuffers[mode] = audioBuf;
        return audioBuf;
      })
      .catch(() => null);

    this.bgmLoadPromises[mode] = p;
    return p;
  }

  _preloadAllBgm() {
    this._loadBgmBuffer('default');
    this._loadBgmBuffer('mini_skySlider');
    this._loadBgmBuffer('mini_flyContest');
    this._loadBgmBuffer('giant_island');
  }

  _stopCurrentWebAudioBgm() {
    if (this.currentBgmSource) {
      try {
        this.currentBgmSource.stop();
      } catch (e) {}
      try {
        this.currentBgmSource.disconnect();
      } catch (e) {}
      this.currentBgmSource = null;
    }
    if (this.currentBgmGain) {
      try {
        this.currentBgmGain.disconnect();
      } catch (e) {}
      this.currentBgmGain = null;
    }
  }

  _playWebAudioBgmBuffer(mode, buffer) {
    if (!this.ctx || !buffer || !this.enabled || !this.isPlayingBgm || this.bgmMode !== mode) {
      return;
    }
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }

    this._stopCurrentWebAudioBgm();

    const def = this.bgmDefs[mode];
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(def ? def.volume : 0.4, this.ctx.currentTime);

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(0);

    this.currentBgmSource = source;
    this.currentBgmGain = gain;
  }

  _startFallbackAudioElement(mode) {
    if (mode === 'mini_skySlider') {
      const audio = this._ensureSliderBgm();
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    if (mode === 'mini_flyContest') {
      const audio = this._ensureFlyBgm();
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    if (mode === 'giant_island') {
      const audio = this._ensureGiantBgm();
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    const defaultAudio = this._ensureDefaultBgm();
    if (defaultAudio && defaultAudio.paused) {
      defaultAudio.play().catch(() => {});
    }
  }

  setBgmMode(mode) {
    const nextMode =
      mode === 'mini_skySlider'
        ? 'mini_skySlider'
        : mode === 'mini_flyContest'
          ? 'mini_flyContest'
          : mode === 'giant_island'
            ? 'giant_island'
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
    if (this.ctx && this.ctx.state !== 'running') {
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
    if (this.ctx.state !== 'running') {
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

  playGummyChargeMax(volScale = 1.0) {
    this.init();
    this.playTone(880, 1174.66, 0.1, 'triangle', 0.12 * volScale, 0);
    this.playTone(1318.51, 1760, 0.2, 'sine', 0.14 * volScale, 0.05);
  }

  playGummyJump(isMax = false, volScale = 1.0) {
    this.init();
    if (isMax) {
      this.playTone(260, 1080, 0.28, 'sine', 0.19 * volScale, 0);
      this.playTone(440, 1320, 0.24, 'triangle', 0.13 * volScale, 0.02);
      this.playTone(659.25, 1567.98, 0.22, 'sine', 0.11 * volScale, 0.06);
      this.playTone(1046.5, 2093, 0.24, 'triangle', 0.09 * volScale, 0.1);
    } else {
      this.playTone(280, 820, 0.22, 'sine', 0.17 * volScale, 0);
      this.playTone(420, 980, 0.18, 'triangle', 0.1 * volScale, 0.03);
    }
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

  playSeedThrow() {
    this.init();
    this.playTone(480, 920, 0.16, 'sine', 0.14, 0);
    this.playTone(760, 520, 0.12, 'triangle', 0.1, 0.14);
  }

  playSurprise() {
    this.init();
    this.playTone(587.33, 1046.5, 0.14, 'triangle', 0.14, 0);
    this.playTone(1046.5, 1318.51, 0.16, 'sine', 0.12, 0.06);
  }

  playBeanstalkRumble() {
    this.init();
    if (!this.enabled || !this.ctx) return;
    this.playTone(92, 64, 1.4, 'sawtooth', 0.11, 0);
    this.playTone(72, 138, 2.2, 'triangle', 0.12, 0.35);
    this.playTone(196, 392, 1.8, 'sine', 0.08, 0.8);
    this.playTone(293.66, 587.33, 1.6, 'triangle', 0.08, 1.3);
    this.playTone(392, 783.99, 1.5, 'sine', 0.09, 1.8);
  }

  startBgm() {
    if (!this.enabled) return;
    this.init();
    this.isPlayingBgm = true;

    const mode = this.bgmMode;
    const token = ++this.bgmPlayToken;

    this._preloadAllBgm();

    if (this.ctx && typeof fetch === 'function') {
      if (this.bgmBuffers[mode]) {
        if (!this.currentBgmSource) {
          this._playWebAudioBgmBuffer(mode, this.bgmBuffers[mode]);
        }
        return;
      }

      this._loadBgmBuffer(mode).then((buf) => {
        if (token !== this.bgmPlayToken || !this.isPlayingBgm || !this.enabled || this.bgmMode !== mode) {
          return;
        }
        if (buf) {
          this._playWebAudioBgmBuffer(mode, buf);
        } else {
          this._startFallbackAudioElement(mode);
        }
      });
      return;
    }

    this._startFallbackAudioElement(mode);
  }

  stopBgm() {
    this.isPlayingBgm = false;
    this.bgmPlayToken++;
    this._stopCurrentWebAudioBgm();

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
    if (this.giantBgmAudio) {
      this.giantBgmAudio.pause();
      this.giantBgmAudio.currentTime = 0;
    }
  }
}