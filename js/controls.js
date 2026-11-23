class ControlsManager {
  constructor() {
    this.moveInput = new THREE.Vector2(0, 0);
    this.cameraDelta = new THREE.Vector2(0, 0);
    this.jumpRequested = false;

    // フローティングジョイスティック状態
    this.joyPointerId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyMaxRadius = 46;

    // カメラドラッグ状態
    this.camPointerId = null;
    this.camLast = { x: 0, y: 0 };

    // キーボード入力
    this.keys = {};

    this.leftZone = document.getElementById('left-touch-zone');
    this.rightZone = document.getElementById('right-touch-zone');
    this.joyBase = document.getElementById('joystick-base');
    this.joyKnob = document.getElementById('joystick-knob');
    this.btnJump = document.getElementById('btn-jump');

    this._preventIosZoom();
    this._bindEvents();
  }

  _preventIosZoom() {
    let lastTouchEnd = 0;
    document.addEventListener(
      'touchend',
      (e) => {
        const now = performance.now();
        if (now - lastTouchEnd <= 350) {
          e.preventDefault();
          const btn = e.target && e.target.closest ? e.target.closest('button') : null;
          if (btn && btn.id !== 'btn-jump') {
            btn.click();
          }
        }
        lastTouchEnd = now;
      },
      { passive: false }
    );

    const preventDefault = (e) => e.preventDefault();
    document.addEventListener('dblclick', preventDefault, { passive: false });
    document.addEventListener('gesturestart', preventDefault, { passive: false });
    document.addEventListener('gesturechange', preventDefault, { passive: false });
    document.addEventListener('gestureend', preventDefault, { passive: false });
  }

  _bindEvents() {
    // 左下エリア：フローティングジョイスティック
    this.leftZone.addEventListener('pointerdown', (e) => {
      if (this.joyPointerId !== null) return;
      e.preventDefault();
      this.leftZone.setPointerCapture(e.pointerId);
      this.joyPointerId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };

      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyKnob.style.transform = 'translate(0px, 0px)';
      this.joyBase.classList.remove('hidden');
      this.moveInput.set(0, 0);
    });

    this.leftZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      e.preventDefault();
      const dx = e.clientX - this.joyOrigin.x;
      const dy = e.clientY - this.joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, this.joyMaxRadius);
      const angle = Math.atan2(dy, dx);

      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;

      this.joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
      this.moveInput.set(kx / this.joyMaxRadius, ky / this.joyMaxRadius);
    });

    const releaseJoy = (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      this.joyPointerId = null;
      this.joyBase.classList.add('hidden');
      this.moveInput.set(0, 0);
    };
    this.leftZone.addEventListener('pointerup', releaseJoy);
    this.leftZone.addEventListener('pointercancel', releaseJoy);

    // カメラ視点変更エリア
    this.rightZone.addEventListener('pointerdown', (e) => {
      if (this.camPointerId !== null) return;
      e.preventDefault();
      this.rightZone.setPointerCapture(e.pointerId);
      this.camPointerId = e.pointerId;
      this.camLast = { x: e.clientX, y: e.clientY };
    });

    this.rightZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.camPointerId) return;
      e.preventDefault();
      const dx = e.clientX - this.camLast.x;
      const dy = e.clientY - this.camLast.y;
      this.camLast = { x: e.clientX, y: e.clientY };
      this.cameraDelta.x += dx;
      this.cameraDelta.y += dy;
    });

    const releaseCam = (e) => {
      if (e.pointerId !== this.camPointerId) return;
      this.camPointerId = null;
    };
    this.rightZone.addEventListener('pointerup', releaseCam);
    this.rightZone.addEventListener('pointercancel', releaseCam);

    // ジャンプボタン
    this.btnJump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.jumpRequested = true;
      this.btnJump.classList.add('pressed');
    });

    const releaseJump = () => {
      this.btnJump.classList.remove('pressed');
    };
    this.btnJump.addEventListener('pointerup', releaseJump);
    this.btnJump.addEventListener('pointercancel', releaseJump);
    this.btnJump.addEventListener('pointerleave', releaseJump);

    // PCキーボード併用（フォーカス中のボタンへのSpace誤作動を防止）
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      if (
        e.code === 'Space' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault();
      }

      if (e.code === 'Space' && !this.keys[e.code]) {
        this.jumpRequested = true;
      }
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  getMoveVector() {
    let x = this.moveInput.x;
    let y = this.moveInput.y;

    let kx = 0;
    let ky = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kx += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) ky -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) ky += 1;

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky);
      x = kx / len;
      y = ky / len;
    }

    return { x, y };
  }

  consumeJump() {
    const req = this.jumpRequested;
    this.jumpRequested = false;
    return req;
  }

  consumeCameraDelta() {
    const d = { x: this.cameraDelta.x, y: this.cameraDelta.y };
    this.cameraDelta.set(0, 0);
    return d;
  }

  reset() {
    this.joyPointerId = null;
    this.camPointerId = null;
    this.joyBase.classList.add('hidden');
    this.moveInput.set(0, 0);
    this.cameraDelta.set(0, 0);
    this.jumpRequested = false;
    this.keys = {};
  }
}