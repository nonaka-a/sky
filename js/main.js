class MaimaiGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');

    this.isPlaying = false;
    this.isPaused = false;
    this.isRespawning = false;

    // 通貨（スカイ）と所持アイテム管理
    this.skyCount = this._loadSkyCount();
    this.ownedItems = this._loadOwnedItems();
    this.wingsDesired = false;
    this.isAtShopCounter = false;
    this.isShopAsking = false;

    // エリア管理（'sky' | 'castle' | 'giant_island' | 'mini_skySlider' | 'mini_flyContest'）
    this.currentArea = 'sky';
    this.remoteArea = 'sky';
    this.isAreaTransitioning = false;
    this.areaPortalCooldown = 0;

    // 協力プレイ管理
    this.gameMode = 'solo'; // 'solo' | 'host' | 'guest'
    this.remotePlayer = null;
    this.remoteHeartState = null;
    this.remoteStarState = null;
    this.remoteGiantState = null;
    this.netSendTimer = 0;

    // 巨大まいまい乗り状態
    this._ridingGiantMaimai = null;

    // NPCふれあい状態
    this.isTouchingHeart = false;
    this.isTouchingStar = false;
    this.isTouchingPurple = false;
    this.isTouchingPink = false;
    this.isStarAsking = false;
    this.isPinkAsking = false;
    this.pinkDialogueIndex = 0;

    // 豆の木イベントカットシーン状態
    this.beanstalkCutscene = {
      active: false,
      timer: 0,
      seedThrown: false,
      seedLanded: false,
      rumbleStarted: false,
      surprised: false
    };

    // スカイスライダー用カメラオフセット
    this.sliderCamYawOffset = 0;
    this.sliderCamPitchOffset = 0;

    // 計算用一時オブジェクト（GC抑制）
    this._boundLoop = (t) => this._loop(t);
    this._tmpCamTarget = new THREE.Vector3();
    this._tmpCutsceneQuat1 = new THREE.Quaternion();
    this._tmpCutsceneQuat2 = new THREE.Quaternion();
    this._tmpAxisX = new THREE.Vector3(1, 0, 0);
    this._tmpAxisY = new THREE.Vector3(0, 1, 0);

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
    this.world.gardenIsland.setBeanstalkGrown(!!this.ownedItems.beanstalk_grown);
    this.castleInterior = new CastleInterior();
    this.giantIsland = new GiantIsland();
    this.miniSkySlider = new MiniSkySlider();
    this.miniFlyContest = new MiniFlyContest();
    this.player = new Player(this.scene, { colorTheme: 'red' });
    this.controls = new ControlsManager();
    this.physics = new PhysicsSystem();
    this.ui = new UIManager(this);
    this.ui.updateSkyCount(this.skyCount, false);
    this._syncWingsButtonAndEquip();

    this.world.starBuddy.onTagStarted = () => {
      if (!this.isPlaying) return;
      this.sound.playStarGreet();
      this.ui.showDialogue('ボクをつかまえてね！', 4.0, 'star', false);
      if (this.gameMode === 'host' && this.network.isConnected) {
        this.network.send({ type: 'star_msg', msg: 'ボクをつかまえてね！', se: 'star' });
      }
    };

    this.lastTime = performance.now();

    this._bindNetworkEvents();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (e.repeat) return;
      if (e.key === '^') {
        this.addSky(100);
        this.ui.refreshShopUI();
        this.sound.playCoin();
      }
    });

    this.world.updateChunks(this.player.position, 0.016);
    this._updateCamera(1.0);

    requestAnimationFrame(this._boundLoop);
  }

  _loadSkyCount() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem('maimai_sky_currency') : null;
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
    } catch (e) {}
    return 0;
  }

  _saveSkyCount() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem('maimai_sky_currency', String(this.skyCount));
      }
    } catch (e) {}
  }

  _loadOwnedItems() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem('maimai_owned_items') : null;
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') return obj;
      }
    } catch (e) {}
    return {};
  }

  _saveOwnedItems() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem('maimai_owned_items', JSON.stringify(this.ownedItems));
      }
    } catch (e) {}
  }

  addSky(amount) {
    if (!amount || amount <= 0) return;
    this.skyCount += amount;
    this._saveSkyCount();
    this.ui.updateSkyCount(this.skyCount, true);
  }

  resetSkyAndItems() {
    this.skyCount = 0;
    this._saveSkyCount();
    this.ownedItems = {};
    this._saveOwnedItems();
    this.wingsDesired = false;
    this.isPinkAsking = false;
    this.pinkDialogueIndex = 0;
    if (this.world && this.world.gardenIsland) {
      this.world.gardenIsland.setBeanstalkGrown(false);
    }
    if (this.player) {
      this.player.clearJumpCharge();
    }
    this._syncWingsButtonAndEquip();
    this.ui.updateSkyCount(this.skyCount, false);
    this.ui.refreshShopUI();
    this.sendStatePacket();
  }

  _syncWingsButtonAndEquip() {
    const inSlider = this.currentArea === 'mini_skySlider';
    const inFly = this.currentArea === 'mini_flyContest';
    const canUseWings = !!this.ownedItems.angel_wings && !inSlider && !inFly;
    const equipped = inFly ? !!this.ownedItems.angel_wings : (canUseWings && this.wingsDesired);
    if (this.player) {
      this.player.setWingsEquipped(equipped);
    }
    if (this.ui) {
      this.ui.updateWingsButton(canUseWings, equipped);
    }
  }

  toggleWingsEquipped() {
    if (!this.ownedItems.angel_wings || this.currentArea === 'mini_skySlider' || this.currentArea === 'mini_flyContest') return;
    this.wingsDesired = !this.wingsDesired;
    this._syncWingsButtonAndEquip();
    if (this.wingsDesired) {
      this.sound.playWingFlap();
      this.sendSe('wing');
    } else {
      this.sound.playClick();
    }
    this.sendStatePacket();
  }

  openShopFromDialogue() {
    this.isShopAsking = false;
    this.ui.showDialogue('いらっしゃい、買いたいものはある？', 0, 'angel', false);
    this.ui.openShopModal();
  }

  buyAngelWings() {
    if (this.ownedItems.angel_wings) return;
    const price = 100;
    if (this.skyCount < price) {
      this.sound.playClick();
      this.ui.showToast('スカイがたりないよ！', 2.2);
      return;
    }

    this.skyCount -= price;
    this._saveSkyCount();
    this.ownedItems.angel_wings = true;
    this._saveOwnedItems();

    this.ui.updateSkyCount(this.skyCount, true);
    this.ui.refreshShopUI();
    this._syncWingsButtonAndEquip();
    this.sound.playBuy();
    this.ui.showToast('「天使のはね」をかったよ！', 3.0);
  }

  buySuperballGummy() {
    if (this.ownedItems.superball_gummy) return;
    const price = 150;
    if (this.skyCount < price) {
      this.sound.playClick();
      this.ui.showToast('スカイがたりないよ！', 2.2);
      return;
    }

    this.skyCount -= price;
    this._saveSkyCount();
    this.ownedItems.superball_gummy = true;
    this._saveOwnedItems();

    this.ui.updateSkyCount(this.skyCount, true);
    this.ui.refreshShopUI();
    this.sound.playBuy();
    this.ui.showToast('「スーパーボールグミ」をかったよ！', 3.0);
  }

  buyMagicSeed() {
    if (this.ownedItems.magic_seed) return;
    const price = 200;
    if (this.skyCount < price) {
      this.sound.playClick();
      this.ui.showToast('スカイがたりないよ！', 2.2);
      return;
    }

    this.skyCount -= price;
    this._saveSkyCount();
    this.ownedItems.magic_seed = true;
    this._saveOwnedItems();

    this.ui.updateSkyCount(this.skyCount, true);
    this.ui.refreshShopUI();
    this.sound.playBuy();
    this.ui.showToast('「まほうのタネ」をかったよ！', 3.0);
  }

  startBeanstalkCutscene() {
    if (this.beanstalkCutscene.active || this.currentArea !== 'sky') return;
    const garden = this.world.gardenIsland;
    if (!garden) return;

    this.isPinkAsking = false;
    this.isStarAsking = false;
    this.isShopAsking = false;
    this.controls.reset();
    this.player.clearJumpCharge();
    this.player.isRidingPartner = false;
    this.player.velocity.set(0, 0, 0);
    this.ui.setCutsceneMode(true);

    this.beanstalkCutscene = {
      active: true,
      phase: 'wait',
      phaseTimer: 0,
      timer: 0,
      seedThrown: false,
      seedLanded: false,
      rumbleStarted: false,
      surprised: false
    };
  }

  _beginBeanstalkCutscenePlay() {
    const garden = this.world.gardenIsland;
    if (!garden) return;

    const soil = garden.soilCenterWorld;
    const groundY = garden.groundWorldY;

    this.player.position.set(soil.x - 2.9, groundY + this.player.radius, soil.z);
    this.player.velocity.set(0, 0, 0);
    this.player.isGrounded = true;
    this.player.facingYaw = Math.PI / 2;
    this.player.setExpression('normal');

    const pinkStart = new THREE.Vector3(
      soil.x + 2.9,
      groundY + this.world.pinkBuddy.radius,
      soil.z
    );
    this.world.pinkBuddy.setCutscenePose(pinkStart, -Math.PI / 2, 0, 0, 1.0);
    this.world.pinkBuddy.setExpression('normal');

    garden.hideThrowSeed();
    garden.setBeanstalkGrowthProgress(0);

    // 1カット目開始時の俯瞰横位置カメラを即座に反映
    this.camera.position.set(soil.x, groundY + 4.9, soil.z + 11.2);
    this.camLookTarget.set(soil.x, groundY + 0.65, soil.z);
    this.camera.lookAt(this.camLookTarget);
  }

  _endBeanstalkCutscene(aborted = false) {
    const garden = this.world.gardenIsland;
    if (garden) {
      garden.hideThrowSeed();
      if (!aborted) {
        garden.setBeanstalkGrown(true);
        this.ownedItems.beanstalk_grown = true;
        this._saveOwnedItems();
      } else {
        garden.setBeanstalkGrown(!!this.ownedItems.beanstalk_grown);
      }
    }

    if (this.world && this.world.pinkBuddy) {
      this.world.pinkBuddy.clearCutscenePose();
      this.world.pinkBuddy.setExpression('normal');
    }

    if (!aborted && garden) {
      const soil = garden.soilCenterWorld;
      const groundY = garden.groundWorldY;
      this.player.position.set(soil.x - 2.8, groundY + this.player.radius, soil.z - 4.2);
      this.player.velocity.set(0, 0, 0);
      this.player.isGrounded = true;
      this.player.facingYaw = Math.atan2(2.8, 4.2);
      this.player.setExpression('happy', 1.2);
      this.camYaw = 0;
      this.camPitch = 0.36;
      this.camLookTarget.set(this.player.position.x, this.player.position.y + 0.9, this.player.position.z);
      this._updateCamera(1.0);
      this.isTouchingPink = false;
      this.pinkDialogueIndex = 0;

      if (this.isPlaying && this.sound.enabled) {
        this.sound.startBgm();
      }
    }

    this.ui.setRespawnFlash(false);
    this.beanstalkCutscene.active = false;
    if (this.isPlaying) {
      this.ui.setCutsceneMode(false);
    }
  }

  _updateBeanstalkCutscene(dt) {
    const cs = this.beanstalkCutscene;
    const garden = this.world.gardenIsland;
    if (!garden) {
      this._endBeanstalkCutscene(true);
      return;
    }

    const soil = garden.soilCenterWorld;
    const groundY = garden.groundWorldY;
    const partnerHere = !!(this.remotePlayer && this.remoteArea === this.currentArea);

    // 世界（空・雲・ピンクまいまい含む）は動かし続ける
    this.world.updateChunks(
      this.player.position,
      dt,
      this.gameMode === 'guest' && this.network.isConnected,
      this.remoteHeartState,
      this.remoteStarState,
      partnerHere ? this.remotePlayer.position : null
    );

    if (this.remotePlayer) {
      this.remotePlayer.group.visible = partnerHere;
      if (partnerHere) {
        const rShadow = this._getCurrentShadowInfo(
          this.remotePlayer.position.x,
          this.remotePlayer.position.y,
          this.remotePlayer.position.z
        );
        this.remotePlayer.updateRemoteVisuals(dt, rShadow, null);
      } else {
        this.remotePlayer.dropShadow.visible = false;
      }
    }

    // 「うん」選択後の1秒停止 → 白飛び遷移
    if (cs.phase === 'wait' || cs.phase === 'fade') {
      cs.phaseTimer += dt;

      const waitShadow = this._getCurrentShadowInfo(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z
      );
      this.player.updateVisuals(dt, waitShadow);
      this._updateCamera(dt);
      this._syncNetwork(dt);

      if (cs.phase === 'wait' && cs.phaseTimer >= 1.0) {
        cs.phase = 'fade';
        cs.phaseTimer = 0;
        this.sound.stopBgm();
        this.ui.setRespawnFlash(true);
      } else if (cs.phase === 'fade' && cs.phaseTimer >= 0.32) {
        this._beginBeanstalkCutscenePlay();
        this.ui.setRespawnFlash(false);
        cs.phase = 'play';
        cs.timer = 0;
      }
      return;
    }

    cs.timer += dt;
    const t = cs.timer;

    // 0.8s: プレイヤーがタネを投げ入れる
    if (!cs.seedThrown && t >= 0.8) {
      cs.seedThrown = true;
      this.player.triggerSquash(1.32);
      this.player.setExpression('jump', 0.45);
      this.sound.playSeedThrow();
    }

    if (t >= 0.8 && t <= 1.65) {
      const seedT = THREE.MathUtils.clamp((t - 0.8) / 0.85, 0, 1);
      const throwOrigin = new THREE.Vector3(
        soil.x - 2.35,
        groundY + this.player.radius + 0.2,
        soil.z
      );
      garden.updateThrowSeed(seedT, throwOrigin);
    } else if (!cs.seedLanded && t > 1.65) {
      cs.seedLanded = true;
      garden.hideThrowSeed();
      this.sound.playLand(0.95);
    }

    // 4.65s: 地響き開始＆あわてふためき開始（タネ着地から3秒の間）
    if (!cs.rumbleStarted && t >= 4.65) {
      cs.rumbleStarted = true;
      this.sound.playBeanstalkRumble();
      this.sound.playSurprise();
      this.player.setExpression('fall', 9.8);
      this.world.pinkBuddy.setExpression('surprised', 9.8);
    }

    // 5.1s 〜 9.4s: 巨大な豆の木が伸びる
    let growT = 0;
    if (t >= 5.1) {
      growT = THREE.MathUtils.clamp((t - 5.1) / 4.3, 0, 1);
      garden.setBeanstalkGrowthProgress(growT);
    }

    if (!cs.surprised && t >= 5.3) {
      cs.surprised = true;
      this.sound.playSurprise();
    }

    // 揺れ始め(4.65s)以降のあわてふためく動きと配置
    const isTopViewCut = t >= 9.5;
    let playerX = soil.x - 2.9;
    let playerZ = soil.z;
    let playerYaw = Math.PI / 2;
    let playerHopY = 0;
    let playerPitch = 0;

    let pinkX = soil.x + 2.9;
    let pinkZ = soil.z;
    let pinkYaw = -Math.PI / 2;
    let pinkHopY = 0;
    let pinkPitch = 0;
    let pinkSquash = 1.0;

    if (t >= 4.65 && t < 9.5) {
      // カット1〜2：激しくあわてふためく（バタバタ小ジャンプ＋左右キョロキョロ＋横揺れ）
      const pt = t - 4.65;
      playerHopY = Math.abs(Math.sin(pt * 17.5)) * 0.56;
      pinkHopY = Math.abs(Math.cos(pt * 16.5)) * 0.56;
      playerX += Math.sin(pt * 25.0) * 0.22;
      playerZ += Math.cos(pt * 21.0) * 0.14;
      pinkX -= Math.sin(pt * 24.0) * 0.22;
      pinkZ += Math.sin(pt * 20.0) * 0.14;

      playerYaw = Math.PI / 2 + Math.sin(pt * 19.0) * 0.65;
      pinkYaw = -Math.PI / 2 - Math.sin(pt * 18.0 + 0.7) * 0.65;
      pinkSquash = 1.0 + Math.sin(pt * 26.0) * 0.22;

      if (t >= 5.3) {
        playerPitch = 0.65;
        pinkPitch = 0.65;
      }
    } else if (isTopViewCut) {
      // カット3（真俯瞰）：左上に赤、右上にピンク、中央下部に豆の木。驚いて見上げる
      const pt = t - 9.5;
      const shakeDecay = THREE.MathUtils.clamp(1.0 - pt / 2.2, 0.15, 1.0);
      playerX = soil.x - 2.8 + Math.sin(pt * 28.0) * 0.06 * shakeDecay;
      playerZ = soil.z - 4.2;
      pinkX = soil.x + 2.8 - Math.sin(pt * 27.0) * 0.06 * shakeDecay;
      pinkZ = soil.z - 4.2;

      playerHopY = Math.abs(Math.sin(pt * 14.0)) * 0.14 * shakeDecay;
      pinkHopY = Math.abs(Math.cos(pt * 14.0)) * 0.14 * shakeDecay;
      pinkSquash = 1.0 + Math.sin(pt * 20.0) * 0.08 * shakeDecay;

      playerYaw = Math.atan2(2.8, 4.2);
      pinkYaw = Math.atan2(-2.8, 4.2);
      playerPitch = 1.15;
      pinkPitch = 1.15;
    }

    // プレイヤー・ピンクまいまいの姿勢反映
    this.player.position.set(playerX, groundY + this.player.radius + playerHopY, playerZ);
    this.player.facingYaw = playerYaw;

    const pinkPos = new THREE.Vector3(
      pinkX,
      groundY + this.world.pinkBuddy.radius,
      pinkZ
    );
    this.world.pinkBuddy.setCutscenePose(pinkPos, pinkYaw, pinkPitch, pinkHopY, pinkSquash);
    this.world.pinkBuddy.update(this.world.time, dt, this.player.position);

    const shadowInfo = this._getCurrentShadowInfo(
      this.player.position.x,
      this.player.position.y,
      this.player.position.z
    );
    this.player.updateVisuals(dt, shadowInfo);

    // カットシーン中の向き・見上げ角度を反映
    this._tmpCutsceneQuat1.setFromAxisAngle(this._tmpAxisY, playerYaw);
    this._tmpCutsceneQuat2.setFromAxisAngle(this._tmpAxisX, -playerPitch);
    this._tmpCutsceneQuat1.multiply(this._tmpCutsceneQuat2);
    this.player.rollQuat.copy(this._tmpCutsceneQuat1);
    this.player.rollHolder.quaternion.copy(this._tmpCutsceneQuat1);

    // 世界の揺れ
    let shakeAmp = 0;
    if (t >= 4.65 && t < 10.6) {
      const rampIn = THREE.MathUtils.clamp((t - 4.65) / 0.45, 0, 1);
      const rampOut = THREE.MathUtils.clamp((10.6 - t) / 1.1, 0, 1);
      shakeAmp = 0.26 * Math.min(rampIn, rampOut);
    }
    const shakeX = shakeAmp > 0 ? Math.sin(t * 45.0) * shakeAmp : 0;
    const shakeY = shakeAmp > 0 ? Math.cos(t * 59.0) * shakeAmp * 0.8 : 0;

    // 3段階のカメラワーク
    if (t < 5.3) {
      // 1カット目：俯瞰横位置からじんわりズームイン
      const zoomP = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(t / 5.3, 0, 1), 0, 1);
      this.camera.position.set(
        soil.x + shakeX,
        groundY + THREE.MathUtils.lerp(4.9, 3.1, zoomP) + shakeY,
        soil.z + THREE.MathUtils.lerp(11.2, 7.2, zoomP)
      );
      this.camLookTarget.set(
        soil.x + shakeX * 0.5,
        groundY + THREE.MathUtils.lerp(0.65, 0.78, zoomP) + shakeY * 0.5,
        soil.z
      );
    } else if (t < 9.5) {
      // 2カット目：あおりカメラへカット切り替え（後半2秒でさらに豆の木の上の方を映す）
      const upP = THREE.MathUtils.clamp((t - 5.3) / 4.2, 0, 1);
      this.camera.position.set(
        soil.x + shakeX,
        groundY + 0.75 + shakeY,
        soil.z + 9.2
      );
      this.camLookTarget.set(
        soil.x + shakeX * 0.5,
        groundY + THREE.MathUtils.lerp(3.2, 24.5, upP) + shakeY * 0.5,
        soil.z
      );
    } else {
      // 3カット目：真俯瞰へカット切り替え（中央下部に豆の木、左上に赤、右上にピンク）＋じんわり引く
      const pullP = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((t - 9.5) / 4.2, 0, 1), 0, 1);
      this.camera.position.set(
        soil.x + shakeX * 0.6,
        groundY + THREE.MathUtils.lerp(11.2, 26.5, pullP) + shakeY * 0.6,
        soil.z - 2.2
      );
      this.camLookTarget.set(
        soil.x + shakeX * 0.3,
        groundY + 1.0,
        soil.z - 3.4
      );
    }
    this.camera.lookAt(this.camLookTarget);

    this._syncNetwork(dt);

    if (t >= 13.8) {
      this._endBeanstalkCutscene(false);
    }
  }

  _updateWarpPartnerVisibility() {
    const canWarp =
      this.gameMode !== 'solo' &&
      this.network.isConnected &&
      !!this.remotePlayer &&
      this.currentArea !== 'mini_skySlider' &&
      this.remoteArea !== 'mini_skySlider' &&
      this.currentArea !== 'mini_flyContest' &&
      this.remoteArea !== 'mini_flyContest';
    this.ui.updateWarpPartnerVisibility(canWarp);
  }

  _getActiveScene() {
    if (this.currentArea === 'castle') return this.castleInterior.scene;
    if (this.currentArea === 'giant_island') return this.giantIsland.scene;
    if (this.currentArea === 'mini_skySlider') return this.miniSkySlider.scene;
    if (this.currentArea === 'mini_flyContest') return this.miniFlyContest.scene;
    return this.scene;
  }

  _getRemoteSoundScale() {
    if (!this.remotePlayer || this.remoteArea !== this.currentArea) return 0;
    const dist = this.player.position.distanceTo(this.remotePlayer.position);
    if (dist > 75) return 0;
    return THREE.MathUtils.clamp(1 - dist / 80, 0.18, 0.8);
  }

  sendSe(name) {
    if (this.network.isConnected) {
      this.network.send({ type: 'se', name });
    }
  }

  sendStatePacket() {
    if (this.gameMode === 'solo' || !this.network.isConnected) return;
    const p = this.player.position;
    const v = this.player.velocity;
    const q = this.player.rollQuat;
    const payload = {
      type: 'state',
      ar: this.currentArea,
      p: [p.x, p.y, p.z],
      v: [v.x, v.y, v.z],
      q: [q.x, q.y, q.z, q.w],
      sq: this.player.squashY,
      ex: this.player.expression,
      g: this.player.isGrounded,
      rd: this.player.isRidingPartner ? 1 : 0,
      cg: this.player.isChargingJump ? 1 : 0,
      wg: this.player.hasWingsEquipped ? 1 : 0,
      ch: this.player.chatText
    };
    if (this.gameMode === 'host') {
      payload.wt = this.world.time;
      payload.heart = this.world.heartBuddy.getSyncState();
      payload.star = this.world.starBuddy.getSyncState();
      if (this.currentArea === 'giant_island' || this.remoteArea === 'giant_island') {
        payload.giant = this.giantIsland.getSyncState();
      }
    }
    this.network.send(payload);
  }

  _bindNetworkEvents() {
    this.network.onConnected = () => {
      const partnerTheme = this.gameMode === 'host' ? 'yellow' : 'red';
      this._spawnRemotePlayer(partnerTheme);

      this.ui.setPartnerStatus('2人プレイ中', true);
      this._updateWarpPartnerVisibility();

      if (this.gameMode === 'host') {
        this.ui.showToast('きいろまいまいが遊びに来たよ！', 3.2);
        this.sound.playHeartGreet();
        this.network.send({
          type: 'welcome',
          wt: this.world.time,
          ar: this.currentArea,
          hp: [this.player.position.x, this.player.position.y, this.player.position.z],
          hc: this.player.chatText,
          wg: this.player.hasWingsEquipped ? 1 : 0,
          heart: this.world.heartBuddy.getSyncState(),
          star: this.world.starBuddy.getSyncState(),
          giant: this.currentArea === 'giant_island' ? this.giantIsland.getSyncState() : null
        });
      } else if (this.gameMode === 'guest') {
        this.ui.showToast('あかまいまいと合流しました！', 3.0);
        this.sound.playHeartGreet();
      }
    };

    this.network.onDisconnected = () => {
      this._removeRemotePlayer();
      this.player.isRidingPartner = false;
      this.remoteArea = 'sky';
      this.ui.updateWarpPartnerVisibility(false);
      this.ui.setPartnerStatus('あいてが退出しました', false);

      if (this.gameMode === 'guest' && this.isPlaying) {
        this.ui.showToast('ホストとの通信が切れました', 3.5);
      } else if (this.gameMode === 'host' && this.isPlaying) {
        this.ui.showToast('きいろまいまいが退出しました', 3.0);
      }
    };

    this.network.onData = (data) => {
      if (!data || !data.type) return;

      if (data.type === 'welcome' && this.gameMode === 'guest') {
        this.world.syncTime(data.wt);
        this.remoteHeartState = data.heart;
        this.remoteStarState = data.star;
        if (data.giant) this.remoteGiantState = data.giant;
        const hostArea =
          data.ar === 'castle'
            ? 'castle'
            : data.ar === 'giant_island'
              ? 'giant_island'
              : data.ar === 'mini_skySlider'
                ? 'mini_skySlider'
                : 'sky';
        this.remoteArea = hostArea;

        if (hostArea === 'castle') {
          this.currentArea = 'castle';
          this.ui.hideSliderTimer();
          this.player.setScene(this.castleInterior.scene);
          if (this.remotePlayer) this.remotePlayer.setScene(this.castleInterior.scene);
          const spawnPos = data.hp
            ? new THREE.Vector3(data.hp[0] + 1.2, Math.max(0.6, data.hp[1]), data.hp[2] - 0.8)
            : new THREE.Vector3(1.2, 0.6, 10.5);
          this.player.resetTo(spawnPos);
          this.camLookTarget.set(spawnPos.x, spawnPos.y + 0.9, spawnPos.z);
        } else if (hostArea === 'giant_island') {
          this.currentArea = 'giant_island';
          this.sound.setBgmMode('giant_island');
          this.ui.hideSliderTimer();
          this.player.setScene(this.giantIsland.scene);
          if (this.remotePlayer) this.remotePlayer.setScene(this.giantIsland.scene);
          if (data.giant) {
            this.giantIsland.applySyncState(data.giant, 1.0);
          }
          const spawnPos = data.hp
            ? new THREE.Vector3(data.hp[0] + 1.4, data.hp[1] + 1.0, data.hp[2])
            : this.giantIsland.getStartPosition(this.player.radius);
          this.player.resetTo(spawnPos);
          this.camLookTarget.set(spawnPos.x, spawnPos.y + 0.9, spawnPos.z);
        } else if (hostArea === 'mini_skySlider') {
          this.currentArea = 'mini_skySlider';
          this.sound.setBgmMode('mini_skySlider');
          this.player.setScene(this.miniSkySlider.scene);
          if (this.remotePlayer) this.remotePlayer.setScene(this.miniSkySlider.scene);
          this.miniSkySlider.startNewRun(this.player);
          this.ui.showSliderTimer('00:00.00', false);
        } else if (data.hp) {
          this.ui.hideSliderTimer();
          const spawnPos = new THREE.Vector3(data.hp[0] + 1.4, data.hp[1] + 2.2, data.hp[2]);
          this.world.updateChunks(spawnPos, 0.016, true, this.remoteHeartState, this.remoteStarState);
          this.player.resetTo(spawnPos);
          this.player.safeFallbackPos.copy(spawnPos);
        }

        this._syncWingsButtonAndEquip();

        if (this.remotePlayer && data.hp) {
          this.remotePlayer.position.set(data.hp[0], data.hp[1], data.hp[2]);
          this.remotePlayer.remoteTargetPos.set(data.hp[0], data.hp[1], data.hp[2]);
          if (typeof data.wg !== 'undefined') {
            this.remotePlayer.setWingsEquipped(!!data.wg);
          }
          if (typeof data.hc === 'string') {
            this.remotePlayer.setChatText(data.hc);
          }
        }
      } else if (data.type === 'state') {
        if (data.ar) {
          this.remoteArea =
            data.ar === 'castle'
              ? 'castle'
              : data.ar === 'giant_island'
                ? 'giant_island'
                : data.ar === 'mini_skySlider'
                  ? 'mini_skySlider'
                  : data.ar === 'mini_flyContest'
                    ? 'mini_flyContest'
                    : 'sky';
        }
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
          if (data.giant) {
            this.remoteGiantState = data.giant;
          }
        }
      } else if (data.type === 'star_tag' && this.gameMode === 'host') {
        if (data.action === 'start' && this.world.starBuddy.tagState !== 'chasing' && this.world.starBuddy.tagState !== 'preparing') {
          const triggerPos = this.remotePlayer ? this.remotePlayer.position : this.player.position;
          this.world.starBuddy.startTagPrepare(triggerPos, this.world);
          this.isStarAsking = false;
          this.ui.showDialogue('じゃあ、鬼ごっこしよう！', 4.0, 'star', false);
          this.sound.playStarGreet();
          this.network.send({ type: 'star_msg', msg: 'じゃあ、鬼ごっこしよう！', se: 'star' });
        } else if (data.action === 'catch' && this.world.starBuddy.tagState === 'chasing') {
          this._finishStarTag(true);
        }
      } else if (data.type === 'star_msg' && this.gameMode === 'guest') {
        this.isStarAsking = false;
        this.ui.showDialogue(data.msg, 4.5, 'star', false);
        if (data.se === 'star_win') this.sound.playStarWin();
        else if (data.se === 'star') this.sound.playStarGreet();
      } else if (data.type === 'dj') {
        if (this.remotePlayer && this.remoteArea === this.currentArea) {
          this.remotePlayer.spawnDoubleJumpRing();
          if (this.remotePlayer.hasWingsEquipped) {
            this.remotePlayer.triggerWingFlap();
          }
          const scale = this._getRemoteSoundScale();
          if (scale > 0) {
            if (this.remotePlayer.hasWingsEquipped) this.sound.playWingFlap(scale);
            else this.sound.playDoubleJump(scale);
          }
        }
      } else if (data.type === 'sj') {
        if (this.remotePlayer && this.remoteArea === this.currentArea) {
          this.remotePlayer.spawnSuperJumpEffect(!!data.max);
        }
      } else if (data.type === 'se') {
        const scale = this._getRemoteSoundScale();
        if (scale <= 0) return;
        if (data.name === 'jump') this.sound.playJump(scale);
        else if (data.name === 'wing') this.sound.playWingFlap(scale);
        else if (data.name === 'gummy_ready') this.sound.playGummyChargeMax(scale);
        else if (data.name === 'gummy_jump') this.sound.playGummyJump(false, scale);
        else if (data.name === 'gummy_max') this.sound.playGummyJump(true, scale);
        else if (data.name === 'bounce') this.sound.playBounce(scale);
        else if (data.name === 'land') this.sound.playLand(scale);
        else if (data.name === 'respawn') this.sound.playRespawn(scale);
        else if (data.name === 'heart') this.sound.playHeartGreet(scale);
        else if (data.name === 'star') this.sound.playStarGreet(scale);
        else if (data.name === 'star_win') this.sound.playStarWin(scale);
      }
    };
  }

  _spawnRemotePlayer(colorTheme) {
    if (this.remotePlayer) {
      this.remotePlayer.dispose();
    }
    this.remotePlayer = new Player(this._getActiveScene(), {
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
    this.remoteGiantState = null;
    this.ui.hideRemoteBubble();
  }

  acceptStarTag() {
    this.isStarAsking = false;
    this.isTouchingStar = true;
    this.ui.showDialogue('じゃあ、鬼ごっこしよう！', 5.0, 'star', false);

    if (this.gameMode === 'guest' && this.network.isConnected) {
      this.network.send({ type: 'star_tag', action: 'start' });
    } else {
      this.world.starBuddy.startTagPrepare(this.player.position, this.world);
      if (this.gameMode === 'host' && this.network.isConnected) {
        this.network.send({ type: 'star_msg', msg: 'じゃあ、鬼ごっこしよう！', se: 'star' });
      }
    }
  }

  _finishStarTag(notifyGuest = false) {
    this.isTouchingStar = true;
    this.isStarAsking = false;
    this.world.starBuddy.catchInTag();
    this.player.setExpression('happy', 1.5);
    this.sound.playStarWin();
    this.ui.showDialogue('すごいね！まいまいのかち！', 4.5, 'star', false);
    if (notifyGuest && this.gameMode === 'host' && this.network.isConnected) {
      this.network.send({ type: 'star_msg', msg: 'すごいね！まいまいのかち！', se: 'star_win' });
    }
  }

  _enterCastleInterior() {
    if (this.isAreaTransitioning || this.currentArea === 'castle') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.2;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'castle';
      this.sound.setBgmMode('default');
      this.ui.hideSliderTimer();
      this.player.setScene(this.castleInterior.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.castleInterior.scene);
      }

      this._syncWingsButtonAndEquip();
      this.castleInterior.resetDoor();
      const spawnPos = new THREE.Vector3(0, this.player.radius, 11.4);
      this.player.facingYaw = Math.PI;
      this.player.resetTo(spawnPos);
      this.camYaw = Math.PI;
      this.camPitch = 0.24;
      this.camLookTarget.set(spawnPos.x, spawnPos.y + 0.9, spawnPos.z);
      this._updateCamera(1.0);
      this.castleInterior.updateFloorVisibility(this.camera.position, this.camLookTarget);
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 220);
  }

  _exitCastleInterior() {
    if (this.isAreaTransitioning || this.currentArea === 'sky') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.2;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'sky';
      this.ui.hideSliderTimer();
      this.player.setScene(this.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.scene);
      }

      const castlePos = this.world.castleIsland
        ? this.world.castleIsland.position
        : new THREE.Vector3(0, 3.5, -74);
      const groundY = this.world.castleIsland
        ? this.world.castleIsland.groundWorldY
        : 4.7;

      const exitPos = new THREE.Vector3(
        castlePos.x,
        groundY + this.player.radius,
        castlePos.z + 2.6
      );

      this.world.updateChunks(
        exitPos,
        0.016,
        this.gameMode === 'guest' && this.network.isConnected,
        this.remoteHeartState,
        this.remoteStarState,
        this.remotePlayer && this.remoteArea === 'sky' ? this.remotePlayer.position : null
      );

      this._syncWingsButtonAndEquip();
      this.player.facingYaw = 0;
      this.player.resetTo(exitPos);
      this.player.safeCloud = null;
      this.player.safeFallbackPos.copy(exitPos);
      this.camYaw = 0;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch, -0.78, 1.15);
      this.camLookTarget.set(exitPos.x, exitPos.y + 0.9, exitPos.z);
      this._updateCamera(1.0);
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 220);
  }

  _enterGiantIsland() {
    if (this.isAreaTransitioning || this.currentArea === 'giant_island') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.2;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.isPinkAsking = false;
    this.isStarAsking = false;
    this.isShopAsking = false;
    this.ui.hideDialogue();
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'giant_island';
      this.sound.setBgmMode('giant_island');
      this.ui.hideSliderTimer();
      this.player.setScene(this.giantIsland.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.giantIsland.scene);
      }

      this._syncWingsButtonAndEquip();
      const startPos = this.giantIsland.getStartPosition(this.player.radius);
      const lookYaw = Math.atan2(-startPos.x, -startPos.z);
      this.player.facingYaw = lookYaw;
      this.player.resetTo(startPos);
      this.player.velocity.set(0, -1.5, 0);
      this.camYaw = Math.atan2(startPos.x, startPos.z);
      this.camPitch = -0.14;
      this.camLookTarget.set(startPos.x, startPos.y + 0.9, startPos.z);
      this._updateCamera(1.0);
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 240);
  }

  _exitGiantIslandToWorld() {
    if (this.isAreaTransitioning || this.currentArea !== 'giant_island') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.4;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'sky';
      this.sound.setBgmMode('default');
      this.ui.hideSliderTimer();
      this.player.setScene(this.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.scene);
      }

      const garden = this.world.gardenIsland;
      const safePos = garden
        ? garden.getSafeSpot(this.player.position, this.player.radius)
        : new THREE.Vector3(48.4, 8.3, -47.2);

      this.world.updateChunks(
        safePos,
        0.016,
        this.gameMode === 'guest' && this.network.isConnected,
        this.remoteHeartState,
        this.remoteStarState,
        this.remotePlayer && this.remoteArea === 'sky' ? this.remotePlayer.position : null
      );

      this._syncWingsButtonAndEquip();
      this.player.facingYaw = 0;
      this.player.resetTo(safePos);
      this.player.safeCloud = null;
      this.player.safeFallbackPos.copy(safePos);
      this.camYaw = 0;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch, -0.78, 1.15);
      this.camLookTarget.set(safePos.x, safePos.y + 0.9, safePos.z);
      this._updateCamera(1.0);
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 240);
  }

  _enterMiniSkySlider() {
    if (this.isAreaTransitioning || this.currentArea === 'mini_skySlider') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.2;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'mini_skySlider';
      this.sound.setBgmMode('mini_skySlider');
      this.player.setScene(this.miniSkySlider.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.miniSkySlider.scene);
      }

      this._syncWingsButtonAndEquip();
      this.sliderCamYawOffset = 0;
      this.sliderCamPitchOffset = 0;
      this.miniSkySlider.startNewRun(this.player);

      this.ui.showSliderTimer('00:00.00', false);

      this.camLookTarget.set(this.player.position.x, this.player.position.y + 0.9, this.player.position.z);
      this.miniSkySlider.updateCamera(
        this.camera,
        this.camLookTarget,
        this.player,
        1.0,
        this.sliderCamYawOffset,
        this.sliderCamPitchOffset
      );
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 220);
  }

  _returnToCastleFromSlider() {
    if (this.isAreaTransitioning || this.currentArea === 'castle') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.2;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'castle';
      this.sound.setBgmMode('default');
      this.ui.hideSliderTimer();
      this.player.setScene(this.castleInterior.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.castleInterior.scene);
      }

      this._syncWingsButtonAndEquip();
      const spawnPos = new THREE.Vector3(0, 4.8, this.castleInterior.portalZ + 3.4);
      this.player.facingYaw = 0;
      this.player.resetTo(spawnPos);
      this.camYaw = 0;
      this.camPitch = 0.24;
      this.camLookTarget.set(spawnPos.x, spawnPos.y + 0.9, spawnPos.z);
      this._updateCamera(1.0);
      this.castleInterior.updateFloorVisibility(this.camera.position, this.camLookTarget);
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 240);
  }

  _enterMiniFlyContest() {
    if (this.isAreaTransitioning || this.currentArea === 'mini_flyContest') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.2;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'mini_flyContest';
      this.sound.setBgmMode('mini_flyContest');
      this.player.setScene(this.miniFlyContest.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.miniFlyContest.scene);
        this.remotePlayer.group.visible = false;
        this.remotePlayer.dropShadow.visible = false;
      }

      this._syncWingsButtonAndEquip();
      this.miniFlyContest.startNewRun(this.player);

      this.ui.hideFlyResult();
      this.ui.showFlyHud(
        this.miniFlyContest.formatDistance(0),
        this.player.airJumpsLeft,
        this.player.getMaxAirJumps()
      );

      this.camLookTarget.set(this.player.position.x, this.player.position.y + 0.9, this.player.position.z);
      this.miniFlyContest.updateCamera(this.camera, this.camLookTarget, this.player, 1.0);
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 220);
  }

  _returnToCastleFromFlyContest() {
    if (this.isAreaTransitioning || this.currentArea === 'castle') return;
    this.isAreaTransitioning = true;
    this.areaPortalCooldown = 1.2;
    this.player.isRidingPartner = false;
    this._ridingGiantMaimai = null;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      this.currentArea = 'castle';
      this.sound.setBgmMode('default');
      this.ui.hideFlyHud();
      this.ui.hideFlyResult();
      this.player.setScene(this.castleInterior.scene);
      if (this.remotePlayer) {
        this.remotePlayer.setScene(this.castleInterior.scene);
      }

      this._syncWingsButtonAndEquip();
      const fx = this.castleInterior.flyPortalX;
      const fz = this.castleInterior.flyPortalZ;
      const fLen = Math.hypot(fx, fz) || 1;
      const spawnDist = Math.max(2.0, fLen - 3.4);
      const spawnPos = new THREE.Vector3((fx / fLen) * spawnDist, 4.8, (fz / fLen) * spawnDist);
      const faceYaw = Math.atan2(-fx, -fz);
      this.player.facingYaw = faceYaw;
      this.player.resetTo(spawnPos);
      this.camYaw = faceYaw;
      this.camPitch = 0.24;
      this.camLookTarget.set(spawnPos.x, spawnPos.y + 0.9, spawnPos.z);
      this._updateCamera(1.0);
      this.castleInterior.updateFloorVisibility(this.camera.position, this.camLookTarget);
      this.sendStatePacket();

      this.ui.setRespawnFlash(false);
      this.isAreaTransitioning = false;
    }, 240);
  }

  warpToPartner() {
    if (
      !this.remotePlayer ||
      this.beanstalkCutscene.active ||
      this.currentArea === 'mini_skySlider' ||
      this.remoteArea === 'mini_skySlider' ||
      this.currentArea === 'mini_flyContest' ||
      this.remoteArea === 'mini_flyContest'
    ) return;
    this.ui.setRespawnFlash(true);
    this._ridingGiantMaimai = null;

    if (this.remoteArea === 'castle') {
      this.currentArea = 'castle';
      this.sound.setBgmMode('default');
      this.ui.hideSliderTimer();
      this.player.setScene(this.castleInterior.scene);
      this.remotePlayer.setScene(this.castleInterior.scene);
      const rp = this.remotePlayer.position;
      const clampedDist = Math.min(this.castleInterior.floorRadius - 2.0, Math.hypot(rp.x, rp.z));
      const ang = Math.atan2(rp.z, rp.x);
      const target = new THREE.Vector3(
        Math.cos(ang) * clampedDist,
        Math.max(this.player.radius, rp.y + 0.8),
        Math.sin(ang) * clampedDist
      );
      this._syncWingsButtonAndEquip();
      this.player.resetTo(target);
      this.camLookTarget.set(target.x, target.y + 0.9, target.z);
    } else if (this.remoteArea === 'giant_island') {
      this.currentArea = 'giant_island';
      this.sound.setBgmMode('giant_island');
      this.ui.hideSliderTimer();
      this.player.setScene(this.giantIsland.scene);
      this.remotePlayer.setScene(this.giantIsland.scene);
      const rp = this.remotePlayer.position;
      const groundY = this.giantIsland.getGroundHeightAt(rp.x, rp.z);
      const target = new THREE.Vector3(
        rp.x,
        Math.max(groundY + this.player.radius + 0.5, rp.y + 1.5),
        rp.z
      );
      this._syncWingsButtonAndEquip();
      this.player.resetTo(target);
      this.camLookTarget.set(target.x, target.y + 0.9, target.z);
    } else if (this.remoteArea === 'mini_skySlider') {
      this.currentArea = 'mini_skySlider';
      this.sound.setBgmMode('mini_skySlider');
      this.player.setScene(this.miniSkySlider.scene);
      this.remotePlayer.setScene(this.miniSkySlider.scene);
      this._syncWingsButtonAndEquip();
      this.sliderCamYawOffset = 0;
      this.sliderCamPitchOffset = 0;
      this.miniSkySlider.warpToPartnerPosition(this.remotePlayer.position, this.player);
      this.ui.showSliderTimer(
        this.miniSkySlider.formatTime(this.miniSkySlider.elapsedTime),
        this.miniSkySlider.timerFinished
      );
      this.camLookTarget.set(this.player.position.x, this.player.position.y + 0.9, this.player.position.z);
    } else {
      this.currentArea = 'sky';
      this.sound.setBgmMode('default');
      this.ui.hideSliderTimer();
      this.player.setScene(this.scene);
      this.remotePlayer.setScene(this.scene);
      this.camPitch = THREE.MathUtils.clamp(this.camPitch, -0.78, 1.15);
      const target = this.remotePlayer.position.clone().add(new THREE.Vector3(0, 2.0, 0));

      this.world.updateChunks(
        target,
        0.016,
        this.gameMode === 'guest' && this.network.isConnected,
        this.remoteHeartState,
        this.remoteStarState,
        this.remotePlayer.position
      );

      this._syncWingsButtonAndEquip();
      this.player.safeCloud = null;
      this.player.safeFallbackPos.copy(target);
      this.player.resetTo(target);
      this.player.airJumpsLeft = this.player.getMaxAirJumps();
    }

    this.sendStatePacket();
    setTimeout(() => {
      this.ui.setRespawnFlash(false);
    }, 220);
  }

  startGame(mode = 'solo', roomId = '') {
    this.gameMode = mode;
    this.currentArea = 'sky';
    this.remoteArea = 'sky';
    this.sound.setBgmMode('default');
    this.isAreaTransitioning = false;
    this.areaPortalCooldown = 0;
    this._ridingGiantMaimai = null;
    this.remoteGiantState = null;

    this._endBeanstalkCutscene(true);
    this.controls.reset();
    this.physics.resetCooldowns();
    this.isTouchingHeart = false;
    this.isTouchingStar = false;
    this.isTouchingPurple = false;
    this.isTouchingPink = false;
    this.isPinkAsking = false;
    this.pinkDialogueIndex = 0;

    const isYellow = mode === 'guest';
    this.player.setScene(this.scene);
    this.player.setColorTheme(isYellow ? 'yellow' : 'red');
    this.player.setChatText('');
    this.ui.applyStartGameUI(mode, roomId, isYellow);
    this.ui.updateSkyCount(this.skyCount, false);
    this._syncWingsButtonAndEquip();

    if (mode === 'solo') {
      this._removeRemotePlayer();
    }

    this.player.resetTo(new THREE.Vector3(0, 4.5, 0));
    this.player.safeCloud = null;
    this.player.safeLocalOffset.set(0, 3.5, 0);
    this.player.safeFallbackPos.set(0, 4.5, 0);
    this.world.resetSessionCoins();
    this.giantIsland.resetCoins();
    this.giantIsland.resetMaimais();
    this.world.gardenIsland.setBeanstalkGrown(!!this.ownedItems.beanstalk_grown);
    this.world.heartBuddy.reset();
    this.world.starBuddy.reset();
    this.world.purpleBuddy.reset();
    this.world.pinkBuddy.reset();
    this.camYaw = 0;
    this.camPitch = 0.36;

    this.isPlaying = true;
    this.isPaused = false;
  }

  backToTitle() {
    this.network.disconnect();
    this._removeRemotePlayer();
    this.gameMode = 'solo';
    this.currentArea = 'sky';
    this.remoteArea = 'sky';
    this.sound.setBgmMode('default');
    this.isAreaTransitioning = false;
    this.areaPortalCooldown = 0;
    this._ridingGiantMaimai = null;
    this.remoteGiantState = null;

    this._endBeanstalkCutscene(true);
    this.isPlaying = false;
    this.isPaused = false;
    this.ui.applyBackToTitleUI();
    this.controls.reset();
    this.physics.resetCooldowns();
    this.isTouchingHeart = false;
    this.isTouchingStar = false;
    this.isTouchingPurple = false;
    this.isTouchingPink = false;
    this.isStarAsking = false;
    this.isPinkAsking = false;
    this.pinkDialogueIndex = 0;
    this.isAtShopCounter = false;
    this.wingsDesired = false;

    this.player.setScene(this.scene);
    this.player.setColorTheme('red');
    this.player.setChatText('');
    this._syncWingsButtonAndEquip();
    this.player.resetTo(new THREE.Vector3(0, 4.5, 0));
    this.world.resetSessionCoins();
    this.giantIsland.resetCoins();
    this.giantIsland.resetMaimais();
    this.world.gardenIsland.setBeanstalkGrown(!!this.ownedItems.beanstalk_grown);
    this.world.heartBuddy.reset();
    this.world.starBuddy.reset();
    this.world.purpleBuddy.reset();
    this.world.pinkBuddy.reset();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _getCurrentShadowInfo(px, py, pz) {
    if (this.currentArea === 'castle') {
      return this.castleInterior.getShadowGroundInfo(px, py, pz);
    }
    if (this.currentArea === 'giant_island') {
      return this.giantIsland.getShadowGroundInfo(px, py, pz);
    }
    if (this.currentArea === 'mini_skySlider') {
      return this.miniSkySlider.getShadowGroundInfo(px, py, pz);
    }
    if (this.currentArea === 'mini_flyContest') {
      return this.miniFlyContest.getShadowGroundInfo(px, py, pz);
    }
    return this.world.getShadowGroundInfo(px, py, pz);
  }

  _loop(now) {
    requestAnimationFrame(this._boundLoop);

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.isPlaying && !this.isPaused) {
      this._updateGame(dt);
    } else if (this.isPlaying && this.isPaused) {
      if (this.player.isChargingJump) {
        this.player.clearJumpCharge();
      }
      this._syncNetwork(dt);
      const partnerHere = !!(this.remotePlayer && this.remoteArea === this.currentArea);
      this._updateWarpPartnerVisibility();
      if (this.remotePlayer) {
        this.remotePlayer.group.visible = partnerHere;
        if (!partnerHere) this.remotePlayer.dropShadow.visible = false;
      }
      if (this.currentArea === 'castle') {
        this.castleInterior.updateFloorVisibility(this.camera.position, this.camLookTarget);
      }
      if (partnerHere) {
        const rShadow = this._getCurrentShadowInfo(
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
      if (this.currentArea === 'castle') {
        this.castleInterior.update(
          dt,
          this.player.position,
          partnerHere ? this.remotePlayer.position : null,
          this.player,
          this.remotePlayer,
          partnerHere
        );
        if (this.castleInterior.isFloorHidden) {
          this.player.dropShadow.visible = false;
          if (this.remotePlayer) this.remotePlayer.dropShadow.visible = false;
        }
      }
      this.ui.updateChatBubbles();
    } else if (!this.isPlaying) {
      this.camYaw += dt * 0.18;
      this.world.updateChunks(this.player.position, dt);
      this.world.updateAndCollectCoins(this.player.position, this.player.radius, dt, false);
      const shadowInfo = this.world.getShadowGroundInfo(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z
      );
      this.player.updateVisuals(dt, shadowInfo);
      this._updateCamera(dt);
    }

    this.renderer.render(this._getActiveScene(), this.camera);
  }

  _syncNetwork(dt) {
    if (this.gameMode === 'solo' || !this.network.isConnected) return;

    this.netSendTimer += dt;
    if (this.netSendTimer >= 0.033) {
      this.netSendTimer = 0;
      this.sendStatePacket();
    }
  }

  _updateGame(dt) {
    if (this.beanstalkCutscene.active) {
      this._updateBeanstalkCutscene(dt);
      return;
    }

    this.ui.updateTimers(dt, this.isStarAsking || this.isShopAsking || this.isPinkAsking);
    this.physics.updateCooldowns(dt);
    if (this.areaPortalCooldown > 0) this.areaPortalCooldown -= dt;

    const partnerHere = !!(this.remotePlayer && this.remoteArea === this.currentArea);
    this._updateWarpPartnerVisibility();

    // ホスト時は他エリアにいてもワールド側の時間とNPC同期を保つ
    if (this.currentArea !== 'sky' && this.gameMode === 'host' && this.network.isConnected) {
      const refPos = this.remotePlayer && this.remoteArea === 'sky'
        ? this.remotePlayer.position
        : this.world.castleIsland.position;
      this.world.updateChunks(refPos, dt, false, null, null, null);
    }

    // ホスト時はゲストだけがジャイアントアイランドにいる場合も巨大まいまいを更新して同期を送る
    if (
      this.currentArea !== 'giant_island' &&
      this.gameMode === 'host' &&
      this.network.isConnected &&
      this.remotePlayer &&
      this.remoteArea === 'giant_island'
    ) {
      this.giantIsland.update(dt, this.remotePlayer.position, false, null, this.sound, false);
    }

    // ミニゲーム「スカイスライダー」専用更新ループ
    if (this.currentArea === 'mini_skySlider') {
      const camD = this.controls.consumeCameraDelta();
      if (this.miniSkySlider.runState === 'goal_walk') {
        this.sliderCamYawOffset -= camD.x * 0.0055;
      } else {
        this.sliderCamYawOffset = THREE.MathUtils.clamp(
          this.sliderCamYawOffset - camD.x * 0.0055,
          -1.6,
          1.6
        );
      }
      this.sliderCamPitchOffset = THREE.MathUtils.clamp(
        this.sliderCamPitchOffset + camD.y * 0.0045,
        -0.25,
        0.75
      );

      if (this.remotePlayer) {
        this.remotePlayer.group.visible = partnerHere;
        if (partnerHere) {
          const rShadow = this._getCurrentShadowInfo(
            this.remotePlayer.position.x,
            this.remotePlayer.position.y,
            this.remotePlayer.position.z
          );
          this.remotePlayer.updateRemoteVisuals(dt, rShadow, null);
        } else {
          this.remotePlayer.dropShadow.visible = false;
        }
      }

      const res = this.miniSkySlider.update(
        dt,
        this.player,
        this.controls,
        this.sound,
        (name) => this.sendSe(name)
      );

      this.ui.updateSliderTimerValue(
        this.miniSkySlider.formatTime(res.elapsedTime),
        res.justFinished ? true : null
      );
      if (res.gotSky > 0) {
        this.addSky(res.gotSky);
        this.sound.playCoin();
      }
      if (res.justFinished) {
        this.ui.showToast(`ゴール！ タイム ${this.miniSkySlider.formatTime(res.elapsedTime)}`, 3.5);
      }

      this.miniSkySlider.updateCamera(
        this.camera,
        this.camLookTarget,
        this.player,
        dt,
        this.sliderCamYawOffset,
        this.sliderCamPitchOffset
      );

      if ((res.courseOut || res.enteredGoalPortal) && !this.isAreaTransitioning && this.areaPortalCooldown <= 0) {
        this._returnToCastleFromSlider();
      }

      this._syncNetwork(dt);
      this.ui.updateChatBubbles();
      return;
    }

    // ミニゲーム「フライコンテスト」専用更新ループ
    if (this.currentArea === 'mini_flyContest') {
      const camD = this.controls.consumeCameraDelta();
      this.miniFlyContest.camYawOffset = THREE.MathUtils.clamp(
        this.miniFlyContest.camYawOffset - camD.x * 0.0055,
        -1.2,
        1.2
      );
      this.miniFlyContest.camPitchOffset = THREE.MathUtils.clamp(
        this.miniFlyContest.camPitchOffset + camD.y * 0.0045,
        -0.35,
        0.85
      );

      if (this.remotePlayer) {
        this.remotePlayer.group.visible = false;
        this.remotePlayer.dropShadow.visible = false;
      }

      const res = this.miniFlyContest.update(
        dt,
        this.player,
        this.controls,
        this.physics,
        this.sound,
        (name) => this.sendSe(name)
      );

      this.ui.updateFlyHud(
        this.miniFlyContest.formatDistance(res.distance),
        res.airJumpsLeft,
        res.maxAirJumps
      );
      if (res.gotSky > 0) {
        this.addSky(res.gotSky);
        this.sound.playCoin();
      }
      if (res.justFinished) {
        this.ui.showFlyResult(
          this.miniFlyContest.formatDistance(res.distance),
          this.miniFlyContest.isNewRecord
        );
      }

      this.miniFlyContest.updateCamera(this.camera, this.camLookTarget, this.player, dt);

      if (res.shouldReturnCastle && !this.isAreaTransitioning && this.areaPortalCooldown <= 0) {
        this._returnToCastleFromFlyContest();
      }

      this._syncNetwork(dt);
      this.ui.updateChatBubbles();
      return;
    }

    const minPitch = -0.78;
    const camD = this.controls.consumeCameraDelta();
    this.camYaw -= camD.x * 0.0055;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + camD.y * 0.0045, minPitch, 1.15);

    let giantRes = null;
    if (this.currentArea === 'sky') {
      this.world.updateChunks(
        this.player.position,
        dt,
        this.gameMode === 'guest' && this.network.isConnected,
        this.remoteHeartState,
        this.remoteStarState,
        partnerHere ? this.remotePlayer.position : null
      );
    } else if (this.currentArea === 'giant_island') {
      giantRes = this.giantIsland.update(
        dt,
        this.player.position,
        this.gameMode === 'guest' && this.network.isConnected,
        this.remoteGiantState,
        this.sound,
        !this.isRespawning && !this.isAreaTransitioning
      );
    }

    const prevRiding = this.player.isRidingPartner;

    // 相手プレイヤーの可視性・位置・ビジュアルを同期
    if (this.remotePlayer) {
      this.remotePlayer.group.visible = partnerHere;
      if (partnerHere) {
        const rShadow = this._getCurrentShadowInfo(
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
        this.remotePlayer.dropShadow.visible = false;
        this.player.isRidingPartner = false;
      }
    } else {
      this.player.isRidingPartner = false;
    }

    const move = this.controls.getMoveVector();
    const inputMag = Math.min(1, Math.hypot(move.x, move.y));
    const jumpPressed = this.controls.consumeJump();
    const jumpReleased = this.controls.consumeJumpRelease();
    const isJumpHolding = this.controls.isJumpHolding();
    if (jumpPressed) {
      this.player.jumpBufferTimer = 0.14;
    } else if (this.player.jumpBufferTimer > 0) {
      this.player.jumpBufferTimer -= dt;
    }

    // 仲間の頭に乗っている間の固定処理
    if (this.player.isRidingPartner && partnerHere) {
      this.player.clearJumpCharge();
      if (this.player.jumpBufferTimer > 0) {
        this.player.isRidingPartner = false;
        this.physics.setRideCooldown(0.28);
        this.player.velocity.y = this.player.hasWingsEquipped ? 13.8 : 14.5;
        this.player.isGrounded = false;
        this.player.groundCloud = null;
        this.player.airJumpsLeft = this.player.getMaxAirJumps();
        this.player.jumpBufferTimer = 0;
        this.player.coyoteTimer = 0;
        this.player.triggerSquash(1.38);
        this.player.setExpression('jump', 0.4);
        if (this.player.hasWingsEquipped) {
          this.player.triggerWingFlap();
          this.sound.playWingFlap();
          this.sendSe('wing');
        } else {
          this.sound.playJump();
          this.sendSe('jump');
        }
      } else if (inputMag > 0.06) {
        this.player.isRidingPartner = false;
        this.physics.setRideCooldown(0.28);
      } else {
        const rp = this.remotePlayer.position;
        this.player.position.set(rp.x, rp.y + this.player.radius + this.remotePlayer.radius - 0.04, rp.z);
        this.player.velocity.set(0, 0, 0);
        this.player.isGrounded = true;
        this.player.coyoteTimer = 0.12;
        this.player.airJumpsLeft = this.player.getMaxAirJumps();
      }
    }

    // 巨大まいまいの頭に乗っている間の移動追従
    if (this.currentArea === 'giant_island' && this.player.isGrounded && this._ridingGiantMaimai) {
      this.player.position.add(this._ridingGiantMaimai.deltaPos);
    }

    // 通常移動・物理処理
    if (!this.player.isRidingPartner) {
      const isGummyActive =
        !!this.ownedItems.superball_gummy &&
        (this.currentArea === 'sky' || this.currentArea === 'castle' || this.currentArea === 'giant_island');

      const moveRes = this.physics.stepMovement(
        this.player,
        move,
        inputMag,
        this.camYaw,
        dt,
        this.sound,
        (name) => this.sendSe(name),
        this.currentArea === 'sky',
        {
          enabled: isGummyActive,
          isJumpHolding,
          jumpReleased
        }
      );
      if (moveRes && moveRes.didDoubleJump && this.network.isConnected) {
        this.network.send({ type: 'dj' });
      }
      if (moveRes && moveRes.superJumpType && this.network.isConnected) {
        this.network.send({ type: 'sj', max: moveRes.superJumpType === 'max' ? 1 : 0 });
      }

      const wasGrounded = this.player.isGrounded;
      this.player.isGrounded = false;
      this.player.groundCloud = null;
      this._ridingGiantMaimai = null;

      if (this.currentArea === 'castle') {
        const hit = this.castleInterior.resolveCollisions(
          this.player.position,
          this.player.velocity,
          this.player.radius
        );
        if (hit.hitGround) {
          this.player.isGrounded = true;
          this.player.airJumpsLeft = this.player.getMaxAirJumps();
          if (!wasGrounded && hit.hardLandingVn < -4.5) {
            this.player.triggerSquash(0.66);
            this.player.setExpression('land', 0.25);
            this.sound.playLand();
            this.sendSe('land');
          }
        }
      } else if (this.currentArea === 'giant_island') {
        const hit = this.giantIsland.resolveCollisions(
          this.player.position,
          this.player.velocity,
          this.player.radius,
          wasGrounded,
          this.sound,
          (name) => this.sendSe(name)
        );
        if (hit.hitGround) {
          this.player.isGrounded = true;
          this.player.airJumpsLeft = this.player.getMaxAirJumps();
          this._ridingGiantMaimai = hit.rodeMaimai || null;
          if (!wasGrounded && hit.hardLandingVn < -4.5) {
            this.player.triggerSquash(0.66);
            this.player.setExpression('land', 0.25);
            this.sound.playLand();
            this.sendSe('land');
          }
        }
      } else {
        this.physics.resolveWorldCollisions(
          this.player,
          this.world,
          this.sound,
          (name) => this.sendSe(name),
          wasGrounded
        );
      }

      if (partnerHere) {
        this.physics.resolvePlayerInteraction(
          this.player,
          this.remotePlayer,
          this.sound,
          (name) => this.sendSe(name),
          wasGrounded
        );
      }
    }

    if (partnerHere && this.remotePlayer.isRidingPartner) {
      const rShadow = this._getCurrentShadowInfo(
        this.remotePlayer.position.x,
        this.remotePlayer.position.y,
        this.remotePlayer.position.z
      );
      this.remotePlayer.updateRemoteVisuals(0, rShadow, this.player.position);
    }

    if (this.currentArea === 'giant_island' && giantRes) {
      if (giantRes.gotSky > 0) {
        this.addSky(giantRes.gotSky);
        this.sound.playCoin();
        this.player.setExpression('happy', 0.45);
      }
      if (giantRes.fellOut && !this.isAreaTransitioning && this.areaPortalCooldown <= 0) {
        this._exitGiantIslandToWorld();
      }
    }

    if (this.currentArea === 'sky') {
      // 硬貨（スカイ）のアニメーション更新と取得判定
      const gotSky = this.world.updateAndCollectCoins(
        this.player.position,
        this.player.radius,
        dt,
        !this.isRespawning && !this.isAreaTransitioning
      );
      if (gotSky > 0) {
        this.addSky(gotSky);
        this.sound.playCoin();
        this.player.setExpression('happy', 0.45);
      }

      // お店のカウンター前判定（「かいものする」「またこんど」の選択肢を表示）
      const atCounter = this.world.shopIsland && this.world.shopIsland.isPlayerAtCounter(this.player.position);
      if (atCounter) {
        if (!this.isAtShopCounter && !this.isRespawning && !this.isAreaTransitioning) {
          this.isAtShopCounter = true;
          this.isShopAsking = true;
          this.isStarAsking = false;
          this.isPinkAsking = false;
          this.world.starBuddy.cancelAsking();
          this.sound.playHeartGreet();
          this.ui.showDialogue('いらっしゃい、買いたいものはある？', 0, 'angel', true, 'かいものする', 'またこんど');
        }
      } else {
        if (this.isShopAsking) {
          this.isShopAsking = false;
          this.ui.hideDialogue();
        }
        this.isAtShopCounter = false;
      }

      const heartDist = this.player.position.distanceTo(this.world.heartBuddy.group.position);
      if (heartDist < 2.4) {
        if (!this.isTouchingHeart) {
          this.isTouchingHeart = true;
          this.isStarAsking = false;
          this.isPinkAsking = false;
          this.world.starBuddy.cancelAsking();
          this.world.heartBuddy.setExpression('happy', 3.5);
          this.player.setExpression('happy', 1.2);
          this.sound.playHeartGreet();
          this.sendSe('heart');
          this.ui.showDialogue('あ、まいまい！遊びに来てくれたの？', 4.5, 'heart', false);
        }
      } else if (heartDist > 4.2) {
        this.isTouchingHeart = false;
      }

      const purpleDist = this.player.position.distanceTo(this.world.purpleBuddy.anchorPos);
      if (purpleDist < 2.6) {
        if (!this.isTouchingPurple) {
          this.isTouchingPurple = true;
          this.isStarAsking = false;
          this.isPinkAsking = false;
          this.world.starBuddy.cancelAsking();
          this.world.purpleBuddy.setExpression('happy', 4.5);
          this.player.setExpression('happy', 1.4);
          this.sound.playHeartGreet();
          this.sendSe('heart');
          this.ui.showDialogue(
            'あれ？こんな高いところのぼれるのボクだけだと思ってた。やるね！',
            5.0,
            'purple',
            false
          );
        }
      } else if (purpleDist > 4.4) {
        this.isTouchingPurple = false;
      }

      const pinkDist = this.player.position.distanceTo(this.world.pinkBuddy.anchorPos);
      if (pinkDist < 2.6) {
        if (!this.isTouchingPink) {
          this.isTouchingPink = true;
          this.isStarAsking = false;
          this.world.starBuddy.cancelAsking();
          this.world.pinkBuddy.setExpression('happy', 4.5);
          this.player.setExpression('happy', 1.4);
          this.sound.playHeartGreet();
          this.sendSe('heart');

          if (this.ownedItems.beanstalk_grown) {
            this.isPinkAsking = false;
            const lines = [
              'この豆の木、どこまでつづいているのかしら？',
              '大きな葉っぱは上にのれそうね、でもあんなに高くジャンプできないなぁ'
            ];
            const line = lines[this.pinkDialogueIndex % lines.length];
            this.pinkDialogueIndex = (this.pinkDialogueIndex + 1) % lines.length;
            this.ui.showDialogue(line, 5.5, 'pink', false);
          } else if (this.ownedItems.magic_seed) {
            this.isPinkAsking = true;
            this.ui.showDialogue(
              'あ！それ、しょくぶつのタネ？ここの土にうえてみない？',
              0,
              'pink',
              true,
              'うん',
              'またこんど'
            );
          } else {
            this.isPinkAsking = false;
            this.ui.showDialogue(
              'ここ、何かしょくぶつを育てられそうだよね、なにかちょうどよいタネはないかしら？',
              5.5,
              'pink',
              false
            );
          }
        }
      } else if (pinkDist > 4.4) {
        this.isTouchingPink = false;
        if (this.isPinkAsking) {
          this.isPinkAsking = false;
          this.ui.hideDialogue();
        }
      }

      const starDist = this.player.position.distanceTo(this.world.starBuddy.position);
      const starState = this.world.starBuddy.tagState;

      if (starState === 'chasing') {
        if (starDist < 2.15) {
          if (this.gameMode === 'guest' && this.network.isConnected) {
            this.isTouchingStar = true;
            this.player.setExpression('happy', 1.5);
            this.sound.playStarWin();
            this.ui.showDialogue('すごいね！まいまいのかち！', 4.5, 'star', false);
            this.network.send({ type: 'star_tag', action: 'catch' });
          } else {
            this._finishStarTag(true);
          }
        }
      } else if (starState !== 'preparing') {
        if (starDist < 2.1) {
          if (!this.isTouchingStar) {
            this.isTouchingStar = true;
            this.isStarAsking = true;
            this.isPinkAsking = false;
            this.world.starBuddy.startAsking();
            this.player.setExpression('happy', 1.2);
            this.sound.playStarGreet();
            this.sendSe('star');
            this.ui.showDialogue('やあ、まいまい！ボクと遊ぶ？', 0, 'star', true);
          }
        } else if (starDist > 4.2) {
          this.isTouchingStar = false;
          if (this.isStarAsking) {
            this.isStarAsking = false;
            this.world.starBuddy.cancelAsking();
            this.ui.hideDialogue();
          }
        }
      }

      const safeY = this.player.safeCloud
        ? this.player.safeCloud.position.y + this.player.safeLocalOffset.y
        : this.player.safeFallbackPos.y;

      if (!this.isRespawning && !this.player.isRidingPartner && this.player.position.y < Math.min(-18, safeY - 22)) {
        this._respawn();
      }
    }

    // カメラを先に確定させ、城内の床が手前に来て非表示になるか判定する
    this._updateCamera(dt);
    let floorHidden = false;
    if (this.currentArea === 'castle') {
      floorHidden = this.castleInterior.updateFloorVisibility(this.camera.position, this.camLookTarget);
    }

    const shadowInfo = this._getCurrentShadowInfo(
      this.player.position.x,
      this.player.position.y,
      this.player.position.z
    );
    this.player.updateVisuals(dt, floorHidden ? null : shadowInfo);
    if (floorHidden && this.remotePlayer) {
      this.remotePlayer.dropShadow.visible = false;
    }

    // 城内空間の扉・ポータル・反射更新とエリア行き来判定
    if (this.currentArea === 'castle') {
      this.castleInterior.update(
        dt,
        this.player.position,
        partnerHere ? this.remotePlayer.position : null,
        this.player,
        this.remotePlayer,
        partnerHere
      );

      if (
        !this.isAreaTransitioning &&
        this.areaPortalCooldown <= 0 &&
        this.castleInterior.openAmount >= 0.55 &&
        Math.abs(this.player.position.x) < 1.42 &&
        this.player.position.z >= this.castleInterior.doorZ - 0.15
      ) {
        this._exitCastleInterior();
      } else if (
        !this.isAreaTransitioning &&
        this.areaPortalCooldown <= 0 &&
        this.castleInterior.isPlayerInPortal(this.player.position)
      ) {
        this._enterMiniSkySlider();
      } else if (
        !this.isAreaTransitioning &&
        this.areaPortalCooldown <= 0 &&
        this.castleInterior.isPlayerInFlyPortal(this.player.position)
      ) {
        if (!this.ownedItems.angel_wings) {
          this.areaPortalCooldown = 1.6;
          this.sound.playClick();
          this.ui.showToast('「天使のはね」をショップでかうとあそべるよ！', 2.8);
        } else {
          this._enterMiniFlyContest();
        }
      }
    } else if (this.currentArea === 'sky' && !this.isAreaTransitioning && this.areaPortalCooldown <= 0) {
      const entranceArea = this.world.checkStructureEntrances(this.player.position);
      if (entranceArea === 'castle') {
        this._enterCastleInterior();
      } else if (entranceArea === 'giant_island') {
        this._enterGiantIsland();
      }
    }

    if (prevRiding !== this.player.isRidingPartner) {
      this.sendStatePacket();
    } else {
      this._syncNetwork(dt);
    }

    this.ui.updateChatBubbles();
  }

  _respawn() {
    this.isRespawning = true;
    this.ui.setRespawnFlash(true);
    this.sound.playRespawn();
    this.sendSe('respawn');

    setTimeout(() => {
      let targetPos;
      if (this.player.safeCloud && this.world.clouds.includes(this.player.safeCloud)) {
        targetPos = this.player.safeCloud.position.clone().add(this.player.safeLocalOffset);
      } else {
        targetPos = this.player.safeFallbackPos.clone();
      }

      this.player.resetTo(targetPos);
      this.ui.setRespawnFlash(false);
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