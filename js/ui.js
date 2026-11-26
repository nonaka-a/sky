class UIManager {
  constructor(game) {
    this.game = game;

    this.hud = document.getElementById('hud');
    this.titleScreen = document.getElementById('title-screen');
    this.joinModal = document.getElementById('join-modal');
    this.chatModal = document.getElementById('chat-modal');
    this.shopModal = document.getElementById('shop-modal');
    this.settingsModal = document.getElementById('settings-modal');
    this.respawnFlash = document.getElementById('respawn-flash');
    this.dialogueBox = document.getElementById('dialogue-box');
    this.dialogueSpeaker = document.getElementById('dialogue-speaker');
    this.dialogueText = document.getElementById('dialogue-text');
    this.dialogueAvatarHeart = document.getElementById('dialogue-avatar-heart');
    this.dialogueAvatarStar = document.getElementById('dialogue-avatar-star');
    this.dialogueAvatarPurple = document.getElementById('dialogue-avatar-purple');
    this.dialogueAvatarAngel = document.getElementById('dialogue-avatar-angel');
    this.dialogueChoices = document.getElementById('dialogue-choices');
    this.btnDialogueYes = document.getElementById('btn-dialogue-yes');
    this.btnDialogueNo = document.getElementById('btn-dialogue-no');

    this.roomBadge = document.getElementById('room-badge');
    this.roomIdValue = document.getElementById('room-id-value');
    this.roomPartnerStatus = document.getElementById('room-partner-status');
    this.toastBanner = document.getElementById('toast-banner');
    this.sliderTimerEl = document.getElementById('slider-timer');
    this.sliderTimerValueEl = document.getElementById('slider-timer-value');
    this.skyCounterEl = document.getElementById('sky-counter');
    this.skyCountValueEl = document.getElementById('sky-count-value');
    this.btnWarpPartner = document.getElementById('btn-warp-partner');
    this.btnWings = document.getElementById('btn-wings');
    this.wingsBtnLabel = document.getElementById('wings-btn-label');
    this.btnChat = document.getElementById('btn-chat');
    this.btnChatClear = document.getElementById('btn-chat-clear');
    this.joystickKnob = document.getElementById('joystick-knob');

    this.shopSkyBalanceEl = document.getElementById('shop-sky-balance');
    this.shopItemWingsCard = document.getElementById('shop-item-wings');
    this.btnBuyWings = document.getElementById('btn-buy-wings');

    this.localBubble = document.getElementById('local-chat-bubble');
    this.localBubbleText = document.getElementById('local-chat-bubble-text');
    this.remoteBubble = document.getElementById('remote-chat-bubble');
    this.remoteBubbleText = document.getElementById('remote-chat-bubble-text');
    this.portalInfoBubble = document.getElementById('portal-info-bubble');

    this.inputRoomId = document.getElementById('input-room-id');
    this.joinErrorMsg = document.getElementById('join-error-msg');
    this.titleStatusMsg = document.getElementById('title-status-msg');

    this.inputChatText = document.getElementById('input-chat-text');
    this.chatCharCount = document.getElementById('chat-char-count');

    this.soundStatusEl = document.getElementById('sound-status');
    this.fullscreenStatusEl = document.getElementById('fullscreen-status');

    this.toastTimer = 0;
    this.dialogueTimer = 0;
    this._tmpBubblePos = new THREE.Vector3();

    this._bindEvents();
  }

  _bindEvents() {
    const game = this.game;
    const stopProp = (el) => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    };
    stopProp(document.getElementById('btn-settings'));
    stopProp(this.btnWarpPartner);
    stopProp(this.btnWings);
    stopProp(this.btnChat);
    stopProp(this.btnChatClear);
    stopProp(this.roomBadge);
    stopProp(this.btnDialogueYes);
    stopProp(this.btnDialogueNo);

    this.btnDialogueYes.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!game.isPlaying) return;
      if (game.isShopAsking) {
        game.sound.playClick();
        game.openShopFromDialogue();
        return;
      }
      if (!game.isStarAsking) return;
      game.sound.playStarGreet();
      game.acceptStarTag();
    });

    this.btnDialogueNo.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!game.isPlaying) return;
      if (game.isShopAsking) {
        game.sound.playClick();
        game.isShopAsking = false;
        this.hideDialogue();
        return;
      }
      if (!game.isStarAsking) return;
      game.sound.playClick();
      game.isStarAsking = false;
      game.world.starBuddy.cancelAsking();
      this.hideDialogue();
    });

    document.getElementById('btn-start').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      game.sound.startBgm();
      game.network.disconnect();
      game.startGame('solo');
    });

    document.getElementById('btn-host-room').addEventListener('click', async (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      game.sound.startBgm();
      this.setTitleStatus('ルームを作成中…');
      try {
        const roomId = await game.network.hostRoom();
        this.setTitleStatus('');
        game.startGame('host', roomId);
      } catch (err) {
        this.setTitleStatus(err.message || 'ルームの作成に失敗しました');
      }
    });

    document.getElementById('btn-open-join').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      this.joinErrorMsg.classList.add('hidden');
      this.inputRoomId.value = '';
      this.joinModal.classList.remove('hidden');
      setTimeout(() => this.inputRoomId.focus(), 100);
    });

    document.getElementById('btn-join-cancel').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      this.joinModal.classList.add('hidden');
    });

    document.getElementById('btn-join-confirm').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.blur();
      game.sound.playClick();
      game.sound.startBgm();
      btn.disabled = true;
      this.joinErrorMsg.textContent = 'せつぞく中…';
      this.joinErrorMsg.classList.remove('hidden');

      try {
        const roomId = await game.network.joinRoom(this.inputRoomId.value);
        this.joinModal.classList.add('hidden');
        this.joinErrorMsg.classList.add('hidden');
        game.startGame('guest', roomId);
      } catch (err) {
        this.joinErrorMsg.textContent = err.message || '接続に失敗しました';
        this.joinErrorMsg.classList.remove('hidden');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('btn-copy-room').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      const id = this.roomIdValue.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(() => {
          this.showToast(`ID「${id}」をコピーしました`, 2.2);
        }).catch(() => {
          this.showToast(`ID: ${id}`, 2.2);
        });
      } else {
        this.showToast(`ID: ${id}`, 2.2);
      }
    });

    this.btnWarpPartner.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!game.isPlaying || game.isPaused || !game.remotePlayer || game.isAreaTransitioning) return;
      game.sound.playRespawn();
      game.sendSe('respawn');
      game.warpToPartner();
    });

    this.btnWings.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!game.isPlaying || game.isPaused || game.isAreaTransitioning) return;
      game.toggleWingsEquipped();
    });

    this.btnBuyWings.addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.buyAngelWings();
    });

    document.getElementById('btn-close-shop').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      this.closeShopModal();
    });

    this.btnChat.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!game.isPlaying || game.isPaused) return;
      game.sound.playClick();
      game.isPaused = true;
      game.controls.reset();
      this.inputChatText.value = '';
      this._updateChatCounter();
      this.chatModal.classList.remove('hidden');
      setTimeout(() => this.inputChatText.focus(), 80);
    });

    this.btnChatClear.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!game.isPlaying || game.isPaused) return;
      game.sound.playClick();
      game.player.setChatText('');
      this.btnChatClear.classList.add('hidden');
      game.sendStatePacket();
      this.updateChatBubbles();
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
      game.sound.playClick();
      this._submitChat();
    });

    document.getElementById('btn-chat-cancel').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      this._closeChatModal();
    });

    const btnClearTimes = document.getElementById('btn-clear-slider-times');
    const clearLabel = document.getElementById('clear-slider-label');
    const clearBadge = document.getElementById('clear-slider-badge');
    let clearConfirmTimer = null;
    let clearConfirmArmed = false;

    const resetClearButtonState = () => {
      clearConfirmArmed = false;
      if (clearConfirmTimer) {
        clearTimeout(clearConfirmTimer);
        clearConfirmTimer = null;
      }
      clearLabel.textContent = 'タイムきろくをけす';
      clearBadge.textContent = 'RESET';
      clearBadge.classList.remove('on');
    };

    const btnClearSky = document.getElementById('btn-clear-sky');
    const clearSkyLabel = document.getElementById('clear-sky-label');
    const clearSkyBadge = document.getElementById('clear-sky-badge');
    let clearSkyConfirmTimer = null;
    let clearSkyConfirmArmed = false;

    const resetClearSkyButtonState = () => {
      clearSkyConfirmArmed = false;
      if (clearSkyConfirmTimer) {
        clearTimeout(clearSkyConfirmTimer);
        clearSkyConfirmTimer = null;
      }
      clearSkyLabel.textContent = 'もってるスカイのきろくをけす';
      clearSkyBadge.textContent = 'RESET';
      clearSkyBadge.classList.remove('on');
    };

    document.getElementById('btn-settings').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      game.isPaused = true;
      resetClearButtonState();
      resetClearSkyButtonState();
      this.settingsModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      game.isPaused = false;
      resetClearButtonState();
      resetClearSkyButtonState();
      this.settingsModal.classList.add('hidden');
    });

    document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
      e.currentTarget.blur();
      const next = !game.sound.enabled;
      game.sound.setEnabled(next);
      if (next) game.sound.playClick();
      this.soundStatusEl.textContent = next ? 'ON' : 'OFF';
      this.soundStatusEl.classList.toggle('on', next);
    });

    document.getElementById('btn-toggle-fullscreen').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      this._toggleFullscreen();
    });

    btnClearTimes.addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      if (!clearConfirmArmed) {
        clearConfirmArmed = true;
        clearLabel.textContent = 'ほんとうにけす？';
        clearBadge.textContent = 'もう1回';
        clearBadge.classList.add('on');
        clearConfirmTimer = setTimeout(resetClearButtonState, 3500);
        return;
      }
      game.miniSkySlider.clearBestTimes();
      resetClearButtonState();
      game.isPaused = false;
      this.settingsModal.classList.add('hidden');
      this.showToast('タイムアタックのきろくをけしました', 2.8);
    });

    btnClearSky.addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      if (!clearSkyConfirmArmed) {
        clearSkyConfirmArmed = true;
        clearSkyLabel.textContent = 'ほんとうにけす？';
        clearSkyBadge.textContent = 'もう1回';
        clearSkyBadge.classList.add('on');
        clearSkyConfirmTimer = setTimeout(resetClearSkyButtonState, 3500);
        return;
      }
      game.resetSkyAndItems();
      resetClearSkyButtonState();
      game.isPaused = false;
      this.settingsModal.classList.add('hidden');
      this.showToast('もってるスカイとアイテムのきろくをけしました', 3.0);
    });

    document.getElementById('btn-back-title').addEventListener('click', (e) => {
      e.currentTarget.blur();
      game.sound.playClick();
      game.backToTitle();
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
    this.game.player.setChatText(trimmed);
    this.btnChatClear.classList.remove('hidden');
    this.game.sendStatePacket();
    this._closeChatModal();
    this.updateChatBubbles();
  }

  _closeChatModal() {
    this.inputChatText.blur();
    this.chatModal.classList.add('hidden');
    this.game.isPaused = false;
  }

  openShopModal() {
    this.game.isPaused = true;
    this.game.controls.reset();
    this.refreshShopUI();
    this.shopModal.classList.remove('hidden');
  }

  closeShopModal() {
    this.shopModal.classList.add('hidden');
    this.game.isPaused = false;
    this.hideDialogue();
  }

  refreshShopUI() {
    const game = this.game;
    const owned = !!game.ownedItems.angel_wings;
    if (this.shopSkyBalanceEl) {
      this.shopSkyBalanceEl.textContent = String(game.skyCount);
    }
    if (this.shopItemWingsCard) {
      this.shopItemWingsCard.classList.toggle('owned', owned);
    }
    if (this.btnBuyWings) {
      this.btnBuyWings.disabled = owned;
      const span = this.btnBuyWings.querySelector('span');
      if (span) {
        span.textContent = owned ? 'かったよ' : '100 スカイ';
      }
    }
  }

  updateWingsButton(visible, equipped) {
    if (!this.btnWings) return;
    this.btnWings.classList.toggle('hidden', !visible);
    this.btnWings.classList.toggle('equipped', !!equipped);
    if (this.wingsBtnLabel) {
      this.wingsBtnLabel.textContent = equipped ? 'はずす' : 'とぶ';
    }
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
    this.game.onResize();
  }

  updateSkyCount(count, animate = false) {
    if (!this.skyCountValueEl) return;
    this.skyCountValueEl.textContent = String(count);
    if (animate && this.skyCounterEl) {
      this.skyCounterEl.classList.remove('pop');
      void this.skyCounterEl.offsetWidth;
      this.skyCounterEl.classList.add('pop');
    }
  }

  setTitleStatus(msg) {
    if (!msg) {
      this.titleStatusMsg.classList.add('hidden');
      this.titleStatusMsg.textContent = '';
    } else {
      this.titleStatusMsg.textContent = msg;
      this.titleStatusMsg.classList.remove('hidden');
    }
  }

  showToast(msg, duration = 2.6) {
    this.toastBanner.textContent = msg;
    this.toastBanner.classList.remove('hidden');
    this.toastTimer = duration;
  }

  showDialogue(message, duration = 4.5, speaker = 'heart', showChoices = false, yesText = 'うん', noText = 'またこんど') {
    const isStar = speaker === 'star';
    const isPurple = speaker === 'purple';
    const isAngel = speaker === 'angel';
    this.dialogueBox.classList.toggle('star', isStar);
    this.dialogueBox.classList.toggle('purple', isPurple);
    this.dialogueBox.classList.toggle('angel', isAngel);
    this.dialogueSpeaker.textContent = isStar
      ? 'スターくん'
      : (isPurple ? 'むらさきまいまい' : (isAngel ? 'おみせの天使' : 'ハートちゃん'));
    this.dialogueAvatarHeart.classList.toggle('hidden', isStar || isPurple || isAngel);
    this.dialogueAvatarStar.classList.toggle('hidden', !isStar);
    this.dialogueAvatarPurple.classList.toggle('hidden', !isPurple);
    this.dialogueAvatarAngel.classList.toggle('hidden', !isAngel);
    this.dialogueText.textContent = message;
    this.btnDialogueYes.textContent = yesText;
    this.btnDialogueNo.textContent = noText;
    this.dialogueChoices.classList.toggle('hidden', !showChoices);
    this.dialogueBox.classList.remove('hidden');
    this.dialogueTimer = duration;
  }

  hideDialogue() {
    this.dialogueChoices.classList.add('hidden');
    this.dialogueBox.classList.add('hidden');
    this.dialogueTimer = 0;
  }

  setRespawnFlash(active) {
    this.respawnFlash.classList.toggle('active', active);
  }

  setPartnerStatus(text, isOnline) {
    this.roomPartnerStatus.textContent = text;
    this.roomPartnerStatus.classList.toggle('online', !!isOnline);
  }

  updateWarpPartnerVisibility(canWarp) {
    this.btnWarpPartner.classList.toggle('hidden', !canWarp);
  }

  showSliderTimer(text, finished = false) {
    this.sliderTimerEl.classList.remove('hidden');
    this.sliderTimerEl.classList.toggle('finished', !!finished);
    this.sliderTimerValueEl.textContent = text;
  }

  updateSliderTimerValue(text, finished = null) {
    this.sliderTimerValueEl.textContent = text;
    if (finished !== null) {
      this.sliderTimerEl.classList.toggle('finished', !!finished);
    }
  }

  hideSliderTimer() {
    this.sliderTimerEl.classList.add('hidden');
    this.sliderTimerEl.classList.remove('finished');
  }

  hideRemoteBubble() {
    this.remoteBubble.classList.add('hidden');
  }

  applyStartGameUI(mode, roomId, isYellow) {
    this.titleScreen.classList.add('hidden');
    this.joinModal.classList.add('hidden');
    this.chatModal.classList.add('hidden');
    this.shopModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.hideSliderTimer();
    this.hud.classList.remove('hidden');
    this.hideDialogue();

    this.btnChatClear.classList.add('hidden');
    this.localBubble.classList.add('hidden');
    this.remoteBubble.classList.add('hidden');
    this.portalInfoBubble.classList.add('hidden');
    this.joystickKnob.classList.toggle('yellow', isYellow);

    if (mode === 'solo') {
      this.roomBadge.classList.add('hidden');
      this.btnWarpPartner.classList.add('hidden');
    } else {
      this.roomBadge.classList.remove('hidden');
      this.roomIdValue.textContent = roomId;
      if (mode === 'host') {
        this.setPartnerStatus('あいてをまっています…', false);
        this.btnWarpPartner.classList.add('hidden');
      } else {
        this.setPartnerStatus('2人プレイ中', true);
        this.btnWarpPartner.classList.remove('hidden');
      }
    }
  }

  applyBackToTitleUI() {
    this.chatModal.classList.add('hidden');
    this.shopModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.hideSliderTimer();
    this.hud.classList.add('hidden');
    this.roomBadge.classList.add('hidden');
    this.btnWarpPartner.classList.add('hidden');
    this.btnWings.classList.add('hidden');
    this.btnChatClear.classList.add('hidden');
    this.toastBanner.classList.add('hidden');
    this.localBubble.classList.add('hidden');
    this.remoteBubble.classList.add('hidden');
    this.portalInfoBubble.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
    this.hideDialogue();
    this.joystickKnob.classList.remove('yellow');
  }

  updateTimers(dt, isStarAsking) {
    if (this.dialogueTimer > 0 && !isStarAsking) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) {
        this.hideDialogue();
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastBanner.classList.add('hidden');
      }
    }
  }

  updateChatBubbles() {
    const game = this.game;
    game.camera.updateMatrixWorld();
    this._updateSingleBubble(game.player, this.localBubble, this.localBubbleText);
    if (game.remotePlayer && game.remoteArea === game.currentArea) {
      this._updateSingleBubble(game.remotePlayer, this.remoteBubble, this.remoteBubbleText);
    } else {
      this.remoteBubble.classList.add('hidden');
    }
    this._updatePortalInfoBubble();
  }

  _updatePortalInfoBubble() {
    const game = this.game;
    if (!this.portalInfoBubble) return;
    if (!game.isPlaying || game.currentArea !== 'castle' || game.isAreaTransitioning) {
      this.portalInfoBubble.classList.add('hidden');
      return;
    }

    const pz = game.castleInterior.portalZ;
    const distToPlayer = Math.hypot(game.player.position.x, game.player.position.z - pz);
    if (distToPlayer > 6.8) {
      this.portalInfoBubble.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.set(0, 3.85, pz);
    const camDist = game.camera.position.distanceTo(this._tmpBubblePos);
    this._tmpBubblePos.applyMatrix4(game.camera.matrixWorldInverse);
    if (this._tmpBubblePos.z >= -0.2) {
      this.portalInfoBubble.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.applyMatrix4(game.camera.projectionMatrix);
    const sx = (this._tmpBubblePos.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this._tmpBubblePos.y * 0.5 + 0.5) * window.innerHeight;
    const scale = THREE.MathUtils.clamp(11.5 / Math.max(4.5, camDist), 0.72, 1.05);

    this.portalInfoBubble.classList.remove('hidden');
    this.portalInfoBubble.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%) scale(${scale})`;
  }

  _updateSingleBubble(playerObj, bubbleEl, textEl) {
    const camera = this.game.camera;
    if (!playerObj || !playerObj.chatText) {
      bubbleEl.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.set(
      playerObj.position.x,
      playerObj.position.y + playerObj.radius + 0.3,
      playerObj.position.z
    );

    const dist = camera.position.distanceTo(this._tmpBubblePos);
    if (dist > 110) {
      bubbleEl.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.applyMatrix4(camera.matrixWorldInverse);
    if (this._tmpBubblePos.z >= -0.2) {
      bubbleEl.classList.add('hidden');
      return;
    }

    this._tmpBubblePos.applyMatrix4(camera.projectionMatrix);

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
}