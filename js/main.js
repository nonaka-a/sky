class MaimaiGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.hud = document.getElementById('hud');
    this.titleScreen = document.getElementById('title-screen');
    this.settingsModal = document.getElementById('settings-modal');
    this.respawnFlash = document.getElementById('respawn-flash');
    this.dialogueBox = document.getElementById('dialogue-box');
    this.dialogueText = document.getElementById('dialogue-text');

    this.soundStatusEl = document.getElementById('sound-status');
    this.fullscreenStatusEl = document.getElementById('fullscreen-status');

    this.isPlaying = false;
    this.isPaused = false;
    this.isRespawning = false;

    // ハートちゃんふれあい状態
    this.isTouchingHeart = false;
    this.dialogueTimer = 0;

    // Three.js 基本セットアップ
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      420
    );

    // カメラ軌道パラメータ
    this.camYaw = 0;
    this.camPitch = 0.36;
    this.camDist = 10.5;
    this.camLookTarget = new THREE.Vector3(0, 2, 0);

    // ゲームシステム初期化
    this.sound = new SoundManager();
    this.world = new SkyWorld(this.scene);
    this.player = new Player(this.scene);
    this.controls = new ControlsManager();

    this.lastTime = performance.now();

    this._bindUI();
    window.addEventListener('resize', () => this._onResize());

    this.world.updateChunks(this.player.position, 0.016);
    this._updateCamera(1.0);

    requestAnimationFrame((t) => this._loop(t));
  }

  _bindUI() {
    document.getElementById('btn-start').addEventListener('click', () => {
      this.sound.playClick();
      this.sound.startBgm();
      this.startGame();
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
      this.sound.playClick();
      this.isPaused = true;
      this.settingsModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
      this.sound.playClick();
      this.isPaused = false;
      this.settingsModal.classList.add('hidden');
    });

    document.getElementById('btn-toggle-sound').addEventListener('click', () => {
      const next = !this.sound.enabled;
      this.sound.setEnabled(next);
      if (next) this.sound.playClick();
      this.soundStatusEl.textContent = next ? 'ON' : 'OFF';
      this.soundStatusEl.classList.toggle('on', next);
    });

    document.getElementById('btn-toggle-fullscreen').addEventListener('click', () => {
      this.sound.playClick();
      this._toggleFullscreen();
    });

    document.getElementById('btn-back-title').addEventListener('click', () => {
      this.sound.playClick();
      this.backToTitle();
    });

    document.addEventListener('fullscreenchange', () => this._syncFullscreenUI());
    document.addEventListener('webkitfullscreenchange', () => this._syncFullscreenUI());
  }

  _toggleFullscreen() {
    const docEl = document.documentElement;
    const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);

    if (!isFull && !document.body.classList.contains('pseudo-fullscreen')) {
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (req) {
        req.call(docEl).catch(() => {
          document.body.classList.add('pseudo-fullscreen');
          this._syncFullscreenUI();
        });
      } else {
        document.body.classList.add('pseudo-fullscreen');
      }
    } else {
      if (isFull) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
      }
      document.body.classList.remove('pseudo-fullscreen');
    }
    this._syncFullscreenUI();
  }

  _syncFullscreenUI() {
    const isFull = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.body.classList.contains('pseudo-fullscreen')
    );
    this.fullscreenStatusEl.textContent = isFull ? 'ON' : 'OFF';
    this.fullscreenStatusEl.classList.toggle('on', isFull);
    this._onResize();
  }

  _showDialogue(message, duration = 4.5) {
    this.dialogueText.textContent = message;
    this.dialogueBox.classList.remove('hidden');
    this.dialogueTimer = duration;
  }

  _hideDialogue() {
    this.dialogueBox.classList.add('hidden');
    this.dialogueTimer = 0;
  }

  startGame() {
    this.titleScreen.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.controls.reset();
    this._hideDialogue();
    this.isTouchingHeart = false;

    this.player.resetTo(new THREE.Vector3(0, 4.5, 0));
    this.player.safeCloud = null;
    this.player.safeLocalOffset.set(0, 3.5, 0);
    this.player.safeFallbackPos.set(0, 4.5, 0);
    this.world.heartBuddy.reset();
    this.camYaw = 0;
    this.camPitch = 0.36;

    this.isPlaying = true;
    this.isPaused = false;
  }

  backToTitle() {
    this.isPlaying = false;
    this.isPaused = false;
    this.settingsModal.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
    this.controls.reset();
    this._hideDialogue();
    this.isTouchingHeart = false;

    this.player.resetTo(new THREE.Vector3(0, 4.5, 0));
    this.world.heartBuddy.reset();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.isPlaying && !this.isPaused) {
      this._updateGame(dt);
    } else if (!this.isPlaying) {
      this.camYaw += dt * 0.18;
      this.world.updateChunks(this.player.position, dt);
      const shadowInfo = this.world.getShadowGroundInfo(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z
      );
      this.player.updateVisuals(dt, shadowInfo);
      this._updateCamera(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _updateGame(dt) {
    // ダイアログ表示タイマー
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) {
        this._hideDialogue();
      }
    }

    // カメラ視点操作の反映
    const camD = this.controls.consumeCameraDelta();
    this.camYaw -= camD.x * 0.0055;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + camD.y * 0.0045, 0.08, 1.15);

    // ワールドの雲を更新
    this.world.updateChunks(this.player.position, dt);

    // 移動雲に乗っていれば一緒に運ぶ
    if (this.player.isGrounded && this.player.groundCloud) {
      this.player.position.add(this.player.groundCloud.deltaPos);
    }

    // プレイヤー操作入力
    const move = this.controls.getMoveVector();
    const forward = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));

    const wishDir = new THREE.Vector3()
      .addScaledVector(right, move.x)
      .addScaledVector(forward, -move.y);

    const maxSpeed = 10.5;
    const inputMag = Math.min(1, Math.hypot(move.x, move.y));

    if (inputMag > 0.05 && wishDir.lengthSq() > 0.0001) {
      wishDir.normalize();
      const targetVx = wishDir.x * maxSpeed * inputMag;
      const targetVz = wishDir.z * maxSpeed * inputMag;
      const grip = this.player.isGrounded ? 15.0 : 5.5;
      const alpha = 1 - Math.exp(-grip * dt);
      this.player.velocity.x = THREE.MathUtils.lerp(this.player.velocity.x, targetVx, alpha);
      this.player.velocity.z = THREE.MathUtils.lerp(this.player.velocity.z, targetVz, alpha);
    } else {
      const stopRate = this.player.isGrounded ? 22.0 : 4.0;
      const decay = Math.exp(-stopRate * dt);
      this.player.velocity.x *= decay;
      this.player.velocity.z *= decay;
      if (this.player.isGrounded && Math.hypot(this.player.velocity.x, this.player.velocity.z) < 0.08) {
        this.player.velocity.x = 0;
        this.player.velocity.z = 0;
      }
    }

    // ジャンプ入力バッファ＆コヨーテタイム＆2段ジャンプ
    if (this.controls.consumeJump()) {
      this.player.jumpBufferTimer = 0.14;
    } else if (this.player.jumpBufferTimer > 0) {
      this.player.jumpBufferTimer -= dt;
    }

    if (this.player.isGrounded) {
      this.player.coyoteTimer = 0.12;
    } else if (this.player.coyoteTimer > 0) {
      this.player.coyoteTimer -= dt;
    }

    if (this.player.jumpBufferTimer > 0) {
      if (this.player.coyoteTimer > 0) {
        this.player.velocity.y = 14.5;
        this.player.isGrounded = false;
        this.player.groundCloud = null;
        this.player.airJumpsLeft = 1;
        this.player.jumpBufferTimer = 0;
        this.player.coyoteTimer = 0;
        this.player.triggerSquash(1.38);
        this.player.setExpression('jump', 0.4);
        this.sound.playJump();
      } else if (this.player.airJumpsLeft > 0) {
        this.player.velocity.y = 13.6;
        this.player.airJumpsLeft--;
        this.player.jumpBufferTimer = 0;
        this.player.triggerSquash(1.42);
        this.player.setExpression('happy', 0.45);
        this.player.spawnDoubleJumpRing();
        this.sound.playDoubleJump();
      }
    }

    // 重力
    this.player.velocity.y -= 32.0 * dt;
    this.player.velocity.y = Math.max(this.player.velocity.y, -28);

    // 位置更新
    this.player.position.addScaledVector(this.player.velocity, dt);

    // 雲とのカスタム楕円体衝突判定
    const wasGrounded = this.player.isGrounded;
    this.player.isGrounded = false;
    this.player.groundCloud = null;

    this._resolveCollisions(wasGrounded);

    // ハートちゃんとの接触判定
    const heartDist = this.player.position.distanceTo(this.world.heartBuddy.group.position);
    if (heartDist < 2.4) {
      if (!this.isTouchingHeart) {
        this.isTouchingHeart = true;
        this.world.heartBuddy.setExpression('happy', 3.5);
        this.player.setExpression('happy', 1.2);
        this.sound.playHeartGreet();
        this._showDialogue('あ、まいまい！遊びに来てくれたの？', 4.5);
      }
    } else if (heartDist > 4.2) {
      this.isTouchingHeart = false;
    }

    // 落下判定
    const safeY = this.player.safeCloud
      ? this.player.safeCloud.position.y + this.player.safeLocalOffset.y
      : this.player.safeFallbackPos.y;

    if (!this.isRespawning && this.player.position.y < Math.min(-18, safeY - 22)) {
      this._respawn();
    }

    const shadowInfo = this.world.getShadowGroundInfo(
      this.player.position.x,
      this.player.position.y,
      this.player.position.z
    );
    this.player.updateVisuals(dt, shadowInfo);
    this._updateCamera(dt);
  }

  _resolveCollisions(wasGrounded) {
    const p = this.player.position;
    const r = this.player.radius;

    for (const cloud of this.world.clouds) {
      if (Math.abs(cloud.position.x - p.x) > 28 || Math.abs(cloud.position.z - p.z) > 28) {
        continue;
      }

      for (const col of cloud.colliders) {
        const cx = cloud.position.x + col.offset.x;
        const cy = cloud.position.y + col.offset.y;
        const cz = cloud.position.z + col.offset.z;

        const dx = p.x - cx;
        const dy = p.y - cy;
        const dz = p.z - cz;

        const maxR = Math.max(col.rx, col.ry, col.rz) + r;
        if (dx * dx + dy * dy + dz * dz > maxR * maxR) continue;

        const k0 = Math.sqrt(
          (dx / col.rx) * (dx / col.rx) +
          (dy / col.ry) * (dy / col.ry) +
          (dz / col.rz) * (dz / col.rz)
        );

        if (k0 < 0.0001) continue;

        const sx = dx / k0;
        const sy = dy / k0;
        const sz = dz / k0;

        const nxRaw = dx / (col.rx * col.rx);
        const nyRaw = dy / (col.ry * col.ry);
        const nzRaw = dz / (col.rz * col.rz);
        const nLen = Math.hypot(nxRaw, nyRaw, nzRaw) || 1;
        const nx = nxRaw / nLen;
        const ny = nyRaw / nLen;
        const nz = nzRaw / nLen;

        const distSurf = Math.hypot(dx - sx, dy - sy, dz - sz);
        let penetration = 0;

        if (k0 >= 1.0) {
          if (distSurf < r) {
            penetration = r - distSurf;
          }
        } else {
          penetration = r + distSurf;
        }

        if (penetration > 0) {
          p.x += nx * penetration;
          p.y += ny * penetration;
          p.z += nz * penetration;

          const vn =
            this.player.velocity.x * nx +
            this.player.velocity.y * ny +
            this.player.velocity.z * nz;

          if (vn < 0) {
            this.player.velocity.x -= nx * vn;
            this.player.velocity.y -= ny * vn;
            this.player.velocity.z -= nz * vn;
          }

          if (ny > 0.45) {
            if (cloud.type === 'bouncy') {
              this.player.velocity.y = 22.0;
              this.player.isGrounded = false;
              this.player.airJumpsLeft = 1;
              this.player.triggerSquash(1.48);
              this.player.setExpression('happy', 0.55);
              this.sound.playBounce();
            } else {
              this.player.isGrounded = true;
              this.player.groundCloud = cloud;
              this.player.airJumpsLeft = 1;

              if (!wasGrounded && vn < -4.5) {
                this.player.triggerSquash(0.66);
                this.player.setExpression('land', 0.25);
                this.sound.playLand();
              }

              if (ny > 0.65) {
                const mainCol = cloud.colliders[0];
                this.player.safeCloud = cloud;
                this.player.safeLocalOffset.set(
                  mainCol.offset.x,
                  mainCol.offset.y + mainCol.ry + r + 0.6,
                  mainCol.offset.z
                );
                this.player.safeFallbackPos.copy(cloud.position).add(this.player.safeLocalOffset);
              }
            }
          }
        }
      }
    }
  }

  _respawn() {
    this.isRespawning = true;
    this.respawnFlash.classList.add('active');
    this.sound.playRespawn();

    setTimeout(() => {
      let targetPos;
      if (this.player.safeCloud && this.world.clouds.includes(this.player.safeCloud)) {
        targetPos = this.player.safeCloud.position.clone().add(this.player.safeLocalOffset);
      } else {
        targetPos = this.player.safeFallbackPos.clone();
      }

      this.player.resetTo(targetPos);
      this.respawnFlash.classList.remove('active');
      this.isRespawning = false;
    }, 240);
  }

  _updateCamera(dt) {
    const target = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y + 0.9,
      this.player.position.z
    );
    this.camLookTarget.lerp(target, Math.min(1, dt * 10));

    const horizDist = Math.cos(this.camPitch) * this.camDist;
    const vertDist = Math.sin(this.camPitch) * this.camDist;

    const camX = this.camLookTarget.x + Math.sin(this.camYaw) * horizDist;
    const camY = this.camLookTarget.y + vertDist;
    const camZ = this.camLookTarget.z + Math.cos(this.camYaw) * horizDist;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this.camLookTarget);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MaimaiGame();
});