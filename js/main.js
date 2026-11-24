class MaimaiGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.hud = document.getElementById('hud');
    this.titleScreen = document.getElementById('title-screen');
    this.joinModal = document.getElementById('join-modal');
    this.chatModal = document.getElementById('chat-modal');
    this.settingsModal = document.getElementById('settings-modal');
    this.respawnFlash = document.getElementById('respawn-flash');
    this.dialogueBox = document.getElementById('dialogue-box');
    this.dialogueSpeaker = document.getElementById('dialogue-speaker');
    this.dialogueText = document.getElementById('dialogue-text');
    this.dialogueAvatarHeart = document.getElementById('dialogue-avatar-heart');
    this.dialogueAvatarStar = document.getElementById('dialogue-avatar-star');

    this.roomBadge = document.getElementById('room-badge');
    this.roomIdValue = document.getElementById('room-id-value');
    this.roomPartnerStatus = document.getElementById('room-partner-status');
    this.toastBanner = document.getElementById('toast-banner');
    this.btnWarpPartner = document.getElementById('btn-warp-partner');
    this.btnChat = document.getElementById('btn-chat');
    this.btnChatClear = document.getElementById('btn-chat-clear');
    this.joystickKnob = document.getElementById('joystick-knob');

    this.localBubble = document.getElementById('local-chat-bubble');
    this.localBubbleText = document.getElementById('local-chat-bubble-text');
    this.remoteBubble = document.getElementById('remote-chat-bubble');
    this.remoteBubbleText = document.getElementById('remote-chat-bubble-text');

    this.inputRoomId = document.getElementById('input-room-id');
    this.joinErrorMsg = document.getElementById('join-error-msg');
    this.titleStatusMsg = document.getElementById('title-status-msg');

    this.inputChatText = document.getElementById('input-chat-text');
    this.chatCharCount = document.getElementById('chat-char-count');

    this.soundStatusEl = document.getElementById('sound-status');
    this.fullscreenStatusEl = document.getElementById('fullscreen-status');

    this.isPlaying = false;
    this.isPaused = false;
    this.isRespawning = false;

    // 協力プレイ管理
    this.gameMode = 'solo'; // 'solo' | 'host' | 'guest'
    this.remotePlayer = null;
    this.remoteHeartState = null;
    this.remoteStarState = null;
    this.netSendTimer = 0;
    this.bumpCooldown = 0;
    this.rideCooldown = 0;
    this.toastTimer = 0;

    // NPCふれあい状態
    this.isTouchingHeart = false;
    this.isTouchingStar = false;
    this.dialogueTimer = 0;

    // 計算用一時オブジェクト（GC抑制）
    this._boundLoop = (t) => this._loop(t);
    this._tmpForward = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpWishDir = new THREE.Vector3();
    this._tmpCamTarget = new THREE.Vector3();
    this._tmpBubblePos = new THREE.Vector3();

    // Three.js 基本セットアップ
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      420
    );

    this.camYaw = 0;
    this.camPitch = 0.36;
    this.camDist = 10.5;
    this.camLookTarget = new THREE.Vector3(0, 2, 0);

    // ゲームシステム初期化
    this.sound = new SoundManager();
    this.network = new NetworkManager();
    this.world = new SkyWorld(this.scene);
    this.player = new Player(this.scene, { colorTheme: 'red' });
    this.controls = new ControlsManager();

    this.lastTime = performance.now();

    this._bindNetworkEvents();
    this._bindUI();
    window.addEventListener('resize', () => this._onResize());

    this.world.updateChunks(this.player.position, 0.016);
    this._updateCamera(1.0);

    requestAnimationFrame(this._boundLoop);
  }

  _getRemoteSoundScale() {
    if (!this.remotePlayer) return 0;
    const dist = this.player.position.distanceTo(this.remotePlayer.position);
    if (dist > 75) return 0;
    return THREE.MathUtils.clamp(1 - dist / 80, 0.18, 0.8);
  }

  _sendSe(name) {
    if (this.network.isConnected) {
      this.network.send({ type: 'se', name });
    }
  }

  _sendStatePacket() {
    if (this.gameMode === 'solo' || !this.network.isConnected) return;
    const p = this.player.position;
    const v = this.player.velocity;
    const q = this.player.rollQuat;
    const payload = {
      type: 'state',
      p: [p.x, p.y, p.z],
      v: [v.x, v.y, v.z],
      q: [q.x, q.y, q.z, q.w],
      sq: this.player.squashY,
      ex: this.player.expression,
      g: this.player.isGrounded,
      rd: this.player.isRidingPartner ? 1 : 0,
      ch: this.player.chatText
    };
    if (this.gameMode === 'host') {
      payload.wt = this.world.time;
      payload.heart = this.world.heartBuddy.getSyncState();
      payload.star = this.world.starBuddy.getSyncState();
    }
    this.network.send(payload);
  }

  _bindNetworkEvents() {
    this.network.onConnected = () => {
      const partnerTheme = this.gameMode === 'host' ? 'yellow' : 'red';
      this._spawnRemotePlayer(partnerTheme);

      this.roomPartnerStatus.textContent = '2人プレイ中';
      this.roomPartnerStatus.classList.add('online');
      this.btnWarpPartner.classList.remove('hidden');

      if (this.gameMode === 'host') {
        this._showToast('きいろまいまいが遊びに来たよ！', 3.2);
        this.sound.playHeartGreet();
        this.network.send({
          type: 'welcome',
          wt: this.world.time,
          hp: [this.player.position.x, this.player.position.y, this.player.position.z],
          hc: this.player.chatText,
          heart: this.world.heartBuddy.getSyncState(),
          star: this.world.starBuddy.getSyncState()
        });
      } else if (this.gameMode === 'guest') {
        this._showToast('あかまいまいと合流しました！', 3.0);
        this.sound.playHeartGreet();
      }
    };

    this.network.onDisconnected = () => {
      this._removeRemotePlayer();
      this.player.isRidingPartner = false;
      this.btnWarpPartner.classList.add('hidden');
      this.roomPartnerStatus.textContent = 'あいてが退出しました';
      this.roomPartnerStatus.classList.remove('online');

      if (this.gameMode === 'guest' && this.isPlaying) {
        this._showToast('ホストとの通信が切れました', 3.5);
      } else if (this.gameMode === 'host' && this.isPlaying) {
        this._showToast('きいろまいまいが退出しました', 3.0);
      }
    };

    this.network.onData = (data) => {
      if (!data || !data.type) return;

      if (data.type === 'welcome' && this.gameMode === 'guest') {
        this.world.syncTime(data.wt);
        this.remoteHeartState = data.heart;
        this.remoteStarState = data.star;
        if (data.hp) {
          const spawnPos = new THREE.Vector3(data.hp[0] + 1.4, data.hp[1] + 2.2, data.hp[2]);
          this.world.updateChunks(spawnPos, 0.016, true, this.remoteHeartState, this.remoteStarState);
          this.player.resetTo(spawnPos);
          this.player.safeFallbackPos.copy(spawnPos);
        }
        if (this.remotePlayer && data.hp) {
          this.remotePlayer.position.set(data.hp[0], data.hp[1], data.hp[2]);
          this.remotePlayer.remoteTargetPos.set(data.hp[0], data.hp[1], data.hp[2]);
          if (typeof data.hc === 'string') {
            this.remotePlayer.setChatText(data.hc);
          }
        }
      } else if (data.type === 'state') {
        if (this.remotePlayer) {
          this.remotePlayer.applyRemoteState(data);
        }
        if (this.gameMode === 'guest') {
          this.world.syncTime(data.wt);
          if (data.heart) {
            this.remoteHeartState = data.heart;
          }
          if (data.star) {
            this.remoteStarState = data.star;
          }
        }
      } else if (data.type === 'dj') {
        if (this.remotePlayer) {
          this.remotePlayer.spawnDoubleJumpRing();
          const scale = this._getRemoteSoundScale();
          if (scale > 0) this.sound.playDoubleJump(scale);
        }
      } else if (data.type === 'se') {
        const scale = this._getRemoteSoundScale();
        if (scale <= 0) return;
        if (data.name === 'jump') this.sound.playJump(scale);
        else if (data.name === 'bounce') this.sound.playBounce(scale);
        else if (data.name === 'land') this.sound.playLand(scale);
        else if (data.name === 'respawn') this.sound.playRespawn(scale);
        else if (data.name === 'heart') this.sound.playHeartGreet(scale);
        else if (data.name === 'star') this.sound.playStarGreet(scale);
      }
    };
  }

  _spawnRemotePlayer(colorTheme) {
    if (this.remotePlayer) {
      this.remotePlayer.dispose();
    }
    this.remotePlayer = new Player(this.scene, {
      colorTheme,
      isRemote: true
    });
    this.remotePlayer.resetTo(this.player.position.clone().add(new THREE.Vector3(1.5, 1.0, 0)));
  }

  _removeRemotePlayer() {
    if (this.remotePlayer) {
      this.remotePlayer.dispose();
      this.remotePlayer = null;
    }
    this.remoteHeartState = null;
    this.remoteStarState = null;
    this.remoteBubble.classList.add('hidden');
  }

  _bindUI() {
    const stopProp = (el) => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    };
    stopProp(document.getElementById('btn-settings'));
    stopProp(this.btnWarpPartner);
    stopProp(this.btnChat);
    stopProp(this.btnChatClear);
    stopProp(this.roomBadge);

    document.getElementById('btn-start').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this.sound.startBgm();
      this.network.disconnect();
      this.startGame('solo');
    });

    document.getElementById('btn-host-room').addEventListener('click', async (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this.sound.startBgm();
      this._setTitleStatus('ルームを作成中…');
      try {
        const roomId = await this.network.hostRoom();
        this._setTitleStatus('');
        this.startGame('host', roomId);
      } catch (err) {
        this._setTitleStatus(err.message || 'ルームの作成に失敗しました');
      }
    });

    document.getElementById('btn-open-join').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this.joinErrorMsg.classList.add('hidden');
      this.inputRoomId.value = '';
      this.joinModal.classList.remove('hidden');
      setTimeout(() => this.inputRoomId.focus(), 100);
    });

    document.getElementById('btn-join-cancel').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this.joinModal.classList.add('hidden');
    });

    document.getElementById('btn-join-confirm').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.blur();
      this.sound.playClick();
      this.sound.startBgm();
      btn.disabled = true;
      this.joinErrorMsg.textContent = 'せつぞく中…';
      this.joinErrorMsg.classList.remove('hidden');

      try {
        const roomId = await this.network.joinRoom(this.inputRoomId.value);
        this.joinModal.classList.add('hidden');
        this.joinErrorMsg.classList.add('hidden');
        this.startGame('guest', roomId);
      } catch (err) {
        this.joinErrorMsg.textContent = err.message || '接続に失敗しました';
        this.joinErrorMsg.classList.remove('hidden');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-copy-room').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      const id = this.roomIdValue.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(() => {
          this._showToast(`ID「${id}」をコピーしました`, 2.2);
        }).catch(() => {
          this._showToast(`ID: ${id}`, 2.2);
        });
      } else {
        this._showToast(`ID: ${id}`, 2.2);
      }
    });

    this.btnWarpPartner.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!this.isPlaying || this.isPaused || !this.remotePlayer) return;
      this.sound.playRespawn();
      this._sendSe('respawn');
      this._warpToPartner();
    });

    // チャットボタン・消去ボタン・モーダル
    this.btnChat.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!this.isPlaying || this.isPaused) return;
      this.sound.playClick();
      this.isPaused = true;
      this.controls.reset();
      this.inputChatText.value = '';
      this._updateChatCounter();
      this.chatModal.classList.remove('hidden');
      setTimeout(() => this.inputChatText.focus(), 80);
    });

    this.btnChatClear.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!this.isPlaying || this.isPaused) return;
      this.sound.playClick();
      this.player.setChatText('');
      this.btnChatClear.classList.add('hidden');
      this._sendStatePacket();
      this._updateChatBubbles();
    });

    this.inputChatText.addEventListener('input', () => {
      const chars = [...this.inputChatText.value];
      if (chars.length > 20) {
        this.inputChatText.value = chars.slice(0, 20).join('');
      }
      this._updateChatCounter();
    });

    this.inputChatText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        this._submitChat();
      }
    });

    document.getElementById('btn-chat-send').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this._submitChat();
    });

    document.getElementById('btn-chat-cancel').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this._closeChatModal();
    });

    document.getElementById('btn-settings').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this.isPaused = true;
      this.settingsModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this.isPaused = false;
      this.settingsModal.classList.add('hidden');
    });

    document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
      e.currentTarget.blur();
      const next = !this.sound.enabled;
      this.sound.setEnabled(next);
      if (next) this.sound.playClick();
      this.soundStatusEl.textContent = next ? 'ON' : 'OFF';
      this.soundStatusEl.classList.toggle('on', next);
    });

    document.getElementById('btn-toggle-fullscreen').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this._toggleFullscreen();
    });

    document.getElementById('btn-back-title').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.sound.playClick();
      this.backToTitle();
    });

    document.addEventListener('fullscreenchange', () => this._syncFullscreenUI());
    document.addEventListener('webkitfullscreenchange', () => this._syncFullscreenUI());
  }

  _updateChatCounter() {
    const len = [...this.inputChatText.value].length;
    this.chatCharCount.textContent = `${len} / 20`;
  }

  _submitChat() {
    const trimmed = this.inputChatText.value.trim();
    if (!trimmed) {
      this._closeChatModal();
      return;
    }
    this.player.setChatText(trimmed);
    this.btnChatClear.classList.remove('hidden');
    this._sendStatePacket();
    this._closeChatModal();
    this._updateChatBubbles();
  }

  _closeChatModal() {
    this.inputChatText.blur();
    this.chatModal.classList.add('hidden');
    this.isPaused = false;
  }

  _setTitleStatus(msg) {
    if (!msg) {
      this.titleStatusMsg.classList.add('hidden');
      this.titleStatusMsg.textContent = '';
    } else {
      this.titleStatusMsg.textContent = msg;
      this.titleStatusMsg.classList.remove('hidden');
    }
  }

  _showToast(msg, duration = 2.6) {
    this.toastBanner.textContent = msg;
    this.toastBanner.classList.remove('hidden');
    this.toastTimer = duration;
  }

  _warpToPartner() {
    if (!this.remotePlayer) return;
    this.respawnFlash.classList.add('active');
    const target = this.remotePlayer.position.clone().add(new THREE.Vector3(0, 2.0, 0));

    this.world.updateChunks(
      target,
      0.016,
      this.gameMode === 'guest' && this.network.isConnected,
      this.remoteHeartState,
      this.remoteStarState
    );

    this.player.safeCloud = null;
    this.player.safeFallbackPos.copy(target);
    this.player.resetTo(target);
    this.player.airJumpsLeft = 1;
    setTimeout(() => {
      this.respawnFlash.classList.remove('active');
    }, 220);
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

  _showDialogue(message, duration = 4.5, speaker = 'heart') {
    const isStar = speaker === 'star';
    this.dialogueBox.classList.toggle('star', isStar);
    this.dialogueSpeaker.textContent = isStar ? 'スターくん' : 'ハートちゃん';
    this.dialogueAvatarHeart.classList.toggle('hidden', isStar);
    this.dialogueAvatarStar.classList.toggle('hidden', !isStar);
    this.dialogueText.textContent = message;
    this.dialogueBox.classList.remove('hidden');
    this.dialogueTimer = duration;
  }

  _hideDialogue() {
    this.dialogueBox.classList.add('hidden');
    this.dialogueTimer = 0;
  }

  startGame(mode = 'solo', roomId = '') {
    this.gameMode = mode;
    this.titleScreen.classList.add('hidden');
    this.joinModal.classList.add('hidden');
    this.chatModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.controls.reset();
    this._hideDialogue();
    this.isTouchingHeart = false;
    this.isTouchingStar = false;
    this.rideCooldown = 0;

    const isYellow = mode === 'guest';
    this.player.setColorTheme(isYellow ? 'yellow' : 'red');
    this.player.setChatText('');
    this.btnChatClear.classList.add('hidden');
    this.localBubble.classList.add('hidden');
    this.remoteBubble.classList.add('hidden');
    this.joystickKnob.classList.toggle('yellow', isYellow);

    if (mode === 'solo') {
      this.roomBadge.classList.add('hidden');
      this.btnWarpPartner.classList.add('hidden');
      this._removeRemotePlayer();
    } else {
      this.roomBadge.classList.remove('hidden');
      this.roomIdValue.textContent = roomId;
      if (mode === 'host') {
        this.roomPartnerStatus.textContent = 'あいてをまっています…';
        this.roomPartnerStatus.classList.remove('online');
        this.btnWarpPartner.classList.add('hidden');
      } else {
        this.roomPartnerStatus.textContent = '2人プレイ中';
        this.roomPartnerStatus.classList.add('online');
        this.btnWarpPartner.classList.remove('hidden');
      }
    }

    this.player.resetTo(new THREE.Vector3(0, 4.5, 0));
    this.player.safeCloud = null;
    this.player.safeLocalOffset.set(0, 3.5, 0);
    this.player.safeFallbackPos.set(0, 4.5, 0);
    this.world.heartBuddy.reset();
    this.world.starBuddy.reset();
    this.camYaw = 0;
    this.camPitch = 0.36;

    this.isPlaying = true;
    this.isPaused = false;
  }

  backToTitle() {
    this.network.disconnect();
    this._removeRemotePlayer();
    this.gameMode = 'solo';

    this.isPlaying = false;
    this.isPaused = false;
    this.chatModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.roomBadge.classList.add('hidden');
    this.btnWarpPartner.classList.add('hidden');
    this.btnChatClear.classList.add('hidden');
    this.toastBanner.classList.add('hidden');
    this.localBubble.classList.add('hidden');
    this.remoteBubble.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
    this.controls.reset();
    this._hideDialogue();
    this.isTouchingHeart = false;
    this.isTouchingStar = false;
    this.rideCooldown = 0;

    this.player.setColorTheme('red');
    this.player.setChatText('');
    this.joystickKnob.classList.remove('yellow');
    this.player.resetTo(new THREE.Vector3(0, 4.5, 0));
    this.world.heartBuddy.reset();
    this.world.starBuddy.reset();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _loop(now) {
    requestAnimationFrame(this._boundLoop);

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.isPlaying && !this.isPaused) {
      this._updateGame(dt);
    } else if (this.isPlaying && this.isPaused) {
      this._syncNetwork(dt);
      if (this.remotePlayer) {
        const rShadow = this.world.getShadowGroundInfo(
          this.remotePlayer.position.x,
          this.remotePlayer.position.y,
          this.remotePlayer.position.z
        );
        this.remotePlayer.updateRemoteVisuals(
          dt,
          rShadow,
          this.remotePlayer.isRidingPartner ? this.player.position : null
        );
      }
      this._updateChatBubbles();
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

  _syncNetwork(dt) {
    if (this.gameMode === 'solo' || !this.network.isConnected) return;

    this.netSendTimer += dt;
    if (this.netSendTimer >= 0.033) {
      this.netSendTimer = 0;
      this._sendStatePacket();
    }
  }

  _updateGame(dt) {
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) {
        this._hideDialogue();
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastBanner.classList.add('hidden');
      }
    }

    if (this.bumpCooldown > 0) this.bumpCooldown -= dt;
    if (this.rideCooldown > 0) this.rideCooldown -= dt;

    const camD = this.controls.consumeCameraDelta();
    this.camYaw -= camD.x * 0.0055;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + camD.y * 0.0045, 0.08, 1.15);

    this.world.updateChunks(
      this.player.position,
      dt,
      this.gameMode === 'guest' && this.network.isConnected,
      this.remoteHeartState,
      this.remoteStarState
    );

    const prevRiding = this.player.isRidingPartner;

    // 相手プレイヤーの位置・ビジュアルを先に更新（頭上固定時は同期遅れを防ぐ）
    if (this.remotePlayer) {
      const rShadow = this.world.getShadowGroundInfo(
        this.remotePlayer.position.x,
        this.remotePlayer.position.y,
        this.remotePlayer.position.z
      );
      this.remotePlayer.updateRemoteVisuals(
        dt,
        rShadow,
        this.remotePlayer.isRidingPartner ? this.player.position : null
      );
    } else {
      this.player.isRidingPartner = false;
    }

    const move = this.controls.getMoveVector();
    const inputMag = Math.min(1, Math.hypot(move.x, move.y));
    const jumpPressed = this.controls.consumeJump();
    if (jumpPressed) {
      this.player.jumpBufferTimer = 0.14;
    } else if (this.player.jumpBufferTimer > 0) {
      this.player.jumpBufferTimer -= dt;
    }

    // 仲間の頭に乗っている間の固定処理
    if (this.player.isRidingPartner && this.remotePlayer) {
      if (this.player.jumpBufferTimer > 0) {
        this.player.isRidingPartner = false;
        this.rideCooldown = 0.28;
        this.player.velocity.y = 14.5;
        this.player.isGrounded = false;
        this.player.groundCloud = null;
        this.player.airJumpsLeft = 1;
        this.player.jumpBufferTimer = 0;
        this.player.coyoteTimer = 0;
        this.player.triggerSquash(1.38);
        this.player.setExpression('jump', 0.4);
        this.sound.playJump();
        this._sendSe('jump');
      } else if (inputMag > 0.06) {
        this.player.isRidingPartner = false;
        this.rideCooldown = 0.28;
      } else {
        const rp = this.remotePlayer.position;
        this.player.position.set(rp.x, rp.y + this.player.radius + this.remotePlayer.radius - 0.04, rp.z);
        this.player.velocity.set(0, 0, 0);
        this.player.isGrounded = true;
        this.player.coyoteTimer = 0.12;
        this.player.airJumpsLeft = 1;
      }
    }

    // 通常移動・物理処理
    if (!this.player.isRidingPartner) {
      if (this.player.isGrounded && this.player.groundCloud) {
        this.player.position.add(this.player.groundCloud.deltaPos);
      }

      const forward = this._tmpForward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      const right = this._tmpRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));

      const wishDir = this._tmpWishDir
        .set(0, 0, 0)
        .addScaledVector(right, move.x)
        .addScaledVector(forward, -move.y);

      const maxSpeed = 10.5;

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
          this._sendSe('jump');
        } else if (this.player.airJumpsLeft > 0) {
          this.player.velocity.y = 13.6;
          this.player.airJumpsLeft--;
          this.player.jumpBufferTimer = 0;
          this.player.triggerSquash(1.42);
          this.player.setExpression('happy', 0.45);
          this.player.spawnDoubleJumpRing();
          this.sound.playDoubleJump();
          if (this.network.isConnected) {
            this.network.send({ type: 'dj' });
          }
        }
      }

      this.player.velocity.y -= 32.0 * dt;
      this.player.velocity.y = Math.max(this.player.velocity.y, -28);

      this.player.position.addScaledVector(this.player.velocity, dt);

      const wasGrounded = this.player.isGrounded;
      this.player.isGrounded = false;
      this.player.groundCloud = null;

      this._resolveCollisions(wasGrounded);

      if (this.remotePlayer) {
        this._resolvePlayerInteraction(wasGrounded);
      }
    }

    // 自分の移動後に相手が自分の頭に乗っていた場合、即座に相手の見た目位置も追従させる
    if (this.remotePlayer && this.remotePlayer.isRidingPartner) {
      const rShadow = this.world.getShadowGroundInfo(
        this.remotePlayer.position.x,
        this.remotePlayer.position.y,
        this.remotePlayer.position.z
      );
      this.remotePlayer.updateRemoteVisuals(0, rShadow, this.player.position);
    }

    const heartDist = this.player.position.distanceTo(this.world.heartBuddy.group.position);
    if (heartDist < 2.4) {
      if (!this.isTouchingHeart) {
        this.isTouchingHeart = true;
        this.world.heartBuddy.setExpression('happy', 3.5);
        this.player.setExpression('happy', 1.2);
        this.sound.playHeartGreet();
        this._sendSe('heart');
        this._showDialogue('あ、まいまい！遊びに来てくれたの？', 4.5, 'heart');
      }
    } else if (heartDist > 4.2) {
      this.isTouchingHeart = false;
    }

    const starDist = this.player.position.distanceTo(this.world.starBuddy.position);
    if (starDist < 2.1) {
      if (!this.isTouchingStar) {
        this.isTouchingStar = true;
        this.world.starBuddy.setExpression('happy', 3.5);
        this.player.setExpression('happy', 1.2);
        this.sound.playStarGreet();
        this._sendSe('star');
        this._showDialogue('やあ、まいまい！ボクと遊ぶ？', 4.5, 'star');
      }
    } else if (starDist > 3.8) {
      this.isTouchingStar = false;
    }

    const safeY = this.player.safeCloud
      ? this.player.safeCloud.position.y + this.player.safeLocalOffset.y
      : this.player.safeFallbackPos.y;

    if (!this.isRespawning && !this.player.isRidingPartner && this.player.position.y < Math.min(-18, safeY - 22)) {
      this._respawn();
    }

    const shadowInfo = this.world.getShadowGroundInfo(
      this.player.position.x,
      this.player.position.y,
      this.player.position.z
    );
    this.player.updateVisuals(dt, shadowInfo);

    // 乗り降りが発生したフレームは即座に状態送信
    if (prevRiding !== this.player.isRidingPartner) {
      this._sendStatePacket();
    } else {
      this._syncNetwork(dt);
    }

    this._updateCamera(dt);
    this._updateChatBubbles();
  }

  _updateChatBubbles() {
    this.camera.updateMatrixWorld();
    this._updateSingleBubble(this.player, this.localBubble, this.localBubbleText);
    this._updateSingleBubble(this.remotePlayer, this.remoteBubble, this.remoteBubbleText);
  }

  _updateSingleBubble(playerObj, bubbleEl, textEl) {
    if (!playerObj || !playerObj.chatText) {
      bubbleEl.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.set(
      playerObj.position.x,
      playerObj.position.y + playerObj.radius + 0.3,
      playerObj.position.z
    );

    const dist = this.camera.position.distanceTo(this._tmpBubblePos);
    if (dist > 110) {
      bubbleEl.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.applyMatrix4(this.camera.matrixWorldInverse);
    if (this._tmpBubblePos.z >= -0.2) {
      bubbleEl.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.applyMatrix4(this.camera.projectionMatrix);

    const sx = (this._tmpBubblePos.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this._tmpBubblePos.y * 0.5 + 0.5) * window.innerHeight;
    const scale = THREE.MathUtils.clamp(10.5 / Math.max(4, dist), 0.65, 1.05);

    if (textEl.textContent !== playerObj.chatText) {
      textEl.textContent = playerObj.chatText;
    }
    bubbleEl.classList.toggle('yellow', playerObj.colorTheme === 'yellow');
    bubbleEl.classList.remove('hidden');
    bubbleEl.style.transform = `translate3d(${sx + 16 * scale}px, ${sy - 10 * scale}px, 0) translate(0, -100%) scale(${scale})`;
  }

  _resolvePlayerInteraction(wasGrounded) {
    if (this.remotePlayer.isRidingPartner) return;

    const p = this.player.position;
    const rp = this.remotePlayer.position;

    const dx = p.x - rp.x;
    const dy = p.y - rp.y;
    const dz = p.z - rp.z;
    const dist = Math.hypot(dx, dy, dz);
    const minDist = this.player.radius + this.remotePlayer.radius;

    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      const penetration = minDist - dist;

      if (this.rideCooldown <= 0 && ny > 0.45 && this.player.velocity.y <= 2.0 && p.y > rp.y + 0.25) {
        this.player.isRidingPartner = true;
        p.set(rp.x, rp.y + minDist - 0.04, rp.z);
        this.player.velocity.set(0, 0, 0);
        this.player.isGrounded = true;
        this.player.airJumpsLeft = 1;

        if (!wasGrounded) {
          this.player.triggerSquash(0.76);
          this.sound.playLand();
          this._sendSe('land');
        }
      } else {
        p.x += nx * penetration * 0.65;
        p.y += ny * penetration * 0.35;
        p.z += nz * penetration * 0.65;

        const vn =
          this.player.velocity.x * nx +
          this.player.velocity.y * ny +
          this.player.velocity.z * nz;

        if (vn < 0) {
          this.player.velocity.x -= nx * vn;
          this.player.velocity.y -= ny * vn;
          this.player.velocity.z -= nz * vn;
        }

        const hLen = Math.hypot(nx, nz) || 1;
        this.player.velocity.x += (nx / hLen) * 3.4;
        this.player.velocity.z += (nz / hLen) * 3.4;

        if (ny < -0.5 && this.player.velocity.y > 0) {
          this.player.velocity.y = -1.2;
        }

        if (this.bumpCooldown <= 0) {
          this.bumpCooldown = 0.28;
          this.player.triggerSquash(0.82);
          this.sound.playLand();
          this._sendSe('land');
        }
      }
    }
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
              this._sendSe('bounce');
            } else {
              this.player.isGrounded = true;
              this.player.groundCloud = cloud;
              this.player.airJumpsLeft = 1;

              if (!wasGrounded && vn < -4.5) {
                this.player.triggerSquash(0.66);
                this.player.setExpression('land', 0.25);
                this.sound.playLand();
                this._sendSe('land');
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
    this._sendSe('respawn');

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
    this._tmpCamTarget.set(
      this.player.position.x,
      this.player.position.y + 0.9,
      this.player.position.z
    );
    this.camLookTarget.lerp(this._tmpCamTarget, Math.min(1, dt * 10));

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