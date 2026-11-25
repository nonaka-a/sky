class MiniSkySlider {
  constructor() {
    this.scene = new THREE.Scene();
    this.time = 0;

    this.nodes = [];
    this.obstacleSpecs = [];
    this.obstacleClouds = [];
    this.goalCloudCenter = new THREE.Vector3();
    this.goalCloudRadius = 14.5;
    this.goalForward = new THREE.Vector3(0, 0, -1);
    this.goalRight = new THREE.Vector3(1, 0, 0);
    this.goalPortalPos = new THREE.Vector3();
    this.goalS = 0;

    this.bestTimes = this._loadBestTimes();
    this.nightRatio = 0;

    // プレイヤー滑走ラン状態
    this.runState = 'idle'; // 'intro_fall' | 'sliding' | 'gap_air' | 'falling_out' | 'goal_walk'
    this.timerStarted = false;
    this.timerFinished = false;
    this.elapsedTime = 0;

    this.trackS = 4.0;
    this.trackU = 0.0;
    this.trackH = 11.0;
    this.vForward = 0;
    this.vSide = 0;
    this.vUp = 0;
    this.boostCooldown = 0;
    this.loopCameraYaw = 0;
    this.goalCamYaw = 0;
    this.goalBaseYaw = 0;

    this._tmpVec1 = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpNormal = new THREE.Vector3();

    this._createSkyAndLights();
    this._buildCourse();
    this._buildCourseMeshes();
    this._buildStarParticles();
    this._buildGoalArea();
  }

  _loadBestTimes() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem('maimai_skySlider_top3') : null;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return arr.filter((n) => typeof n === 'number' && n > 0 && isFinite(n)).slice(0, 3);
        }
      }
    } catch (e) {}
    return [];
  }

  _saveBestTimes() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem('maimai_skySlider_top3', JSON.stringify(this.bestTimes));
      }
    } catch (e) {}
  }

  recordFinishTime(sec) {
    if (typeof sec !== 'number' || sec <= 0 || !isFinite(sec)) return false;
    const prevFirst = this.bestTimes.length > 0 ? this.bestTimes[0] : Infinity;
    this.bestTimes.push(sec);
    this.bestTimes.sort((a, b) => a - b);
    this.bestTimes = this.bestTimes.slice(0, 3);
    this._saveBestTimes();
    this._drawLeaderboardTexture(sec);
    return sec < prevFirst;
  }

  clearBestTimes() {
    this.bestTimes = [];
    try {
      if (window.localStorage) {
        window.localStorage.removeItem('maimai_skySlider_top3');
      }
    } catch (e) {}
    this._drawLeaderboardTexture(null);
  }

  formatTime(sec) {
    const clamped = Math.max(0, sec || 0);
    const totalCs = Math.floor(clamped * 100);
    const cs = totalCs % 100;
    const totalS = Math.floor(totalCs / 100);
    const s = totalS % 60;
    const m = Math.floor(totalS / 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  _createSkyAndLights() {
    this.daySkyTop = new THREE.Color(0x4cbfff);
    this.daySkyMid = new THREE.Color(0xc4eeff);
    this.daySkyBot = new THREE.Color(0xffe6f4);
    this.nightSkyTop = new THREE.Color(0x070b24);
    this.nightSkyMid = new THREE.Color(0x13204f);
    this.nightSkyBot = new THREE.Color(0x222c66);

    this.dayFogColor = new THREE.Color(0xd2f2ff);
    this.nightFogColor = new THREE.Color(0x141d46);
    this.scene.fog = new THREE.Fog(this.dayFogColor.clone(), 68, 175);

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xffd8ec, 0.88);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffdf5, 0.78);
    this.dirLight.position.set(30, 55, 25);
    this.scene.add(this.dirLight);

    this.skyUniforms = {
      uTop: { value: this.daySkyTop.clone() },
      uMid: { value: this.daySkyMid.clone() },
      uBot: { value: this.daySkyBot.clone() }
    };

    const skyGeo = new THREE.SphereGeometry(320, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uBot;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = mix(uMid, uTop, smoothstep(0.0, 0.65, h));
          col = mix(uBot, col, smoothstep(-0.35, 0.06, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);
  }

  _buildCourse() {
    const nodes = [];
    let s = 0;
    const pos = new THREE.Vector3(0, 76, 0);
    let yaw = 0;
    let pitch = -0.22;
    const upVec = new THREE.Vector3(0, 1, 0);

    const pushNode = (p, T, N, B, opts = {}) => {
      nodes.push({
        s,
        pos: p.clone(),
        T: T.clone().normalize(),
        N: N.clone().normalize(),
        B: B.clone().normalize(),
        halfWidth: opts.halfWidth || 2.8,
        style: opts.style || 'cloud', // 'cloud' | 'rainbow' | 'boost' | 'jump' | 'gap'
        guardL: !!opts.guardL,
        guardR: !!opts.guardR,
        tunnel: !!opts.tunnel,
        tunnelClouds: !!opts.tunnelClouds,
        isLoop: !!opts.isLoop,
        nightRatio: opts.nightRatio || 0,
        launchY: typeof opts.launchY === 'number' ? opts.launchY : 11.2
      });
    };

    const advanceNormal = (length, targetYaw, targetPitch, opts = {}) => {
      const steps = Math.max(1, Math.round(length));
      const stepLen = length / steps;
      const startYaw = yaw;
      const startPitch = pitch;

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const smoothT = t * t * (3 - 2 * t);
        yaw = THREE.MathUtils.lerp(startYaw, targetYaw, smoothT);
        pitch = THREE.MathUtils.lerp(startPitch, targetPitch, smoothT);

        const cp = Math.cos(pitch);
        const T = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
        const B = new THREE.Vector3().crossVectors(T, upVec).normalize();
        const N = new THREE.Vector3().crossVectors(B, T).normalize();

        pos.addScaledVector(T, stepLen);
        s += stepLen;

        const hw = typeof opts.halfWidthEnd === 'number'
          ? THREE.MathUtils.lerp(opts.halfWidth || 2.8, opts.halfWidthEnd, t)
          : (opts.halfWidth || 2.8);

        const nr = typeof opts.nightRatioEnd === 'number'
          ? THREE.MathUtils.lerp(opts.nightRatioStart || 0, opts.nightRatioEnd, t)
          : (opts.nightRatio || 0);

        pushNode(pos, T, N, B, {
          halfWidth: hw,
          style: opts.style || 'cloud',
          guardL: opts.guardL,
          guardR: opts.guardR,
          tunnel: opts.tunnel,
          tunnelClouds: opts.tunnelClouds,
          isLoop: false,
          nightRatio: nr,
          launchY: opts.launchY
        });
      }
    };

    // 初期ノード
    {
      const cp = Math.cos(pitch);
      const T0 = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
      const B0 = new THREE.Vector3().crossVectors(T0, upVec).normalize();
      const N0 = new THREE.Vector3().crossVectors(B0, T0).normalize();
      pushNode(pos, T0, N0, B0, { halfWidth: 3.6, style: 'cloud' });
    }

    // 1. スタート落下受け止め＆直線導入（0 〜 34m）
    advanceNormal(16, 0, -0.22, { halfWidth: 3.6, halfWidthEnd: 2.9, style: 'cloud' });
    advanceNormal(18, 0, -0.24, { halfWidth: 2.9, style: 'cloud' });
    this.obstacleSpecs.push({ s: s - 8, u: 0.0 });

    // 2. 左カーブ＋雲ガードレール（34 〜 84m）
    advanceNormal(50, 1.05, -0.23, { halfWidth: 2.9, style: 'cloud', guardL: true, guardR: true });

    // 3. 雲のトンネル 1回目（84 〜 118m）
    advanceNormal(34, 1.05, -0.24, { halfWidth: 2.8, style: 'cloud', guardL: true, guardR: true, tunnel: true });
    this.obstacleSpecs.push({ s: s - 15, u: 0.65 });

    // 4. 加速床 → ジャンプ台 → 途切れギャップ → 受け止めスライダー（118 〜 198m）
    advanceNormal(12, 1.05, -0.18, { halfWidth: 2.9, style: 'boost', guardL: true, guardR: true });
    advanceNormal(10, 1.05, 0.34, { halfWidth: 2.9, style: 'jump', guardL: true, guardR: true });

    // ギャップ（16m、高さは着地先が4m下がるように配置）
    {
      const gapSteps = 16;
      const fwdXZ = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      const rightXZ = new THREE.Vector3().crossVectors(fwdXZ, upVec).normalize();
      const startGapPos = pos.clone();
      const endGapPos = startGapPos.clone().addScaledVector(fwdXZ, 16.0).add(new THREE.Vector3(0, -4.0, 0));

      for (let i = 1; i <= gapSteps; i++) {
        const t = i / gapSteps;
        pos.lerpVectors(startGapPos, endGapPos, t);
        s += 1.0;
        const T = fwdXZ.clone();
        const B = rightXZ.clone();
        const N = upVec.clone();
        pushNode(pos, T, N, B, { halfWidth: 3.4, style: 'gap' });
      }
      pitch = -0.20;
    }

    // 着地後の広め受け止め＆右カーブ（ガードレール付き）
    advanceNormal(18, 1.05, -0.20, { halfWidth: 4.1, halfWidthEnd: 3.0, style: 'cloud', guardL: true, guardR: true });
    this.obstacleSpecs.push({ s: s - 5, u: -0.65 });
    advanceNormal(42, 0.15, -0.18, { halfWidth: 3.0, style: 'cloud', guardL: true, guardR: true });

    const advanceLoop = (R, sideShift, opts = {}) => {
      const loopSteps = 72;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, upVec).normalize();
      const loopStart = pos.clone();

      for (let i = 1; i <= loopSteps; i++) {
        const t = i / loopSteps;
        const phi = t * Math.PI * 2;
        const nextPos = loopStart
          .clone()
          .addScaledVector(fwd, R * Math.sin(phi))
          .addScaledVector(upVec, R * (1 - Math.cos(phi)))
          .addScaledVector(right, sideShift * t);

        const segLen = nextPos.distanceTo(pos);
        pos.copy(nextPos);
        s += segLen;

        const T = new THREE.Vector3()
          .addScaledVector(fwd, R * Math.cos(phi))
          .addScaledVector(upVec, R * Math.sin(phi))
          .addScaledVector(right, sideShift / (Math.PI * 2))
          .normalize();
        const N = new THREE.Vector3()
          .addScaledVector(fwd, -Math.sin(phi))
          .addScaledVector(upVec, Math.cos(phi))
          .normalize();
        const B = new THREE.Vector3().crossVectors(T, N).normalize();
        N.crossVectors(B, T).normalize();

        pushNode(pos, T, N, B, {
          halfWidth: opts.halfWidth || 2.9,
          style: opts.style || 'cloud',
          guardL: true,
          guardR: true,
          isLoop: true,
          nightRatio: opts.nightRatio || 0
        });
      }
      pitch = -0.16;
    };

    // 5. 加速床 → 縦一回転ループ 1回目
    advanceNormal(14, 0.15, -0.02, { halfWidth: 3.0, style: 'boost', guardL: true, guardR: true });
    advanceLoop(11.2, 8.2, { style: 'cloud' });

    // 6. 連続ミニジャンプ台（小さいジャンプ台が3つ続く区間）
    {
      const pushMiniGap = (gapLen, dropY, launchY) => {
        const gapSteps = Math.max(4, Math.round(gapLen));
        const fwdXZ = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        const rightXZ = new THREE.Vector3().crossVectors(fwdXZ, upVec).normalize();
        const startGapPos = pos.clone();
        const endGapPos = startGapPos.clone().addScaledVector(fwdXZ, gapLen).add(new THREE.Vector3(0, dropY, 0));
        for (let i = 1; i <= gapSteps; i++) {
          const t = i / gapSteps;
          pos.lerpVectors(startGapPos, endGapPos, t);
          s += gapLen / gapSteps;
          pushNode(pos, fwdXZ.clone(), upVec.clone(), rightXZ.clone(), {
            halfWidth: 3.3,
            style: 'gap',
            launchY
          });
        }
        pitch = -0.18;
      };

      // 小ジャンプ1回目
      advanceNormal(10, 0.15, -0.14, { halfWidth: 3.0, style: 'boost', guardL: true, guardR: true });
      advanceNormal(7, 0.15, 0.22, { halfWidth: 3.0, style: 'jump', guardL: true, guardR: true });
      pushMiniGap(9, -2.0, 7.2);
      advanceNormal(16, 0.15, -0.16, { halfWidth: 3.6, halfWidthEnd: 3.0, style: 'cloud', guardL: true, guardR: true });

      // 小ジャンプ2回目
      advanceNormal(8, 0.15, -0.12, { halfWidth: 3.0, style: 'boost', guardL: true, guardR: true });
      advanceNormal(7, 0.15, 0.22, { halfWidth: 3.0, style: 'jump', guardL: true, guardR: true });
      pushMiniGap(9, -2.0, 7.2);
      advanceNormal(16, 0.15, -0.16, { halfWidth: 3.6, halfWidthEnd: 3.0, style: 'cloud', guardL: true, guardR: true });

      // 小ジャンプ3回目
      advanceNormal(8, 0.15, -0.12, { halfWidth: 3.0, style: 'boost', guardL: true, guardR: true });
      advanceNormal(7, 0.15, 0.22, { halfWidth: 3.0, style: 'jump', guardL: true, guardR: true });
      pushMiniGap(9, -2.0, 7.2);
      advanceNormal(20, 0.15, -0.20, { halfWidth: 3.6, halfWidthEnd: 2.9, style: 'cloud', guardL: true, guardR: true });
      this.obstacleSpecs.push({ s: s - 6, u: 0.0 });
    }

    // 7. 虹の連続4回カーブ（左右S字スラローム）
    advanceNormal(34, -0.55, -0.22, { halfWidth: 2.9, style: 'rainbow', guardL: true, guardR: true });
    advanceNormal(36, 0.45, -0.22, { halfWidth: 2.9, style: 'rainbow', guardL: true, guardR: true });
    advanceNormal(36, -0.65, -0.22, { halfWidth: 2.9, style: 'rainbow', guardL: true, guardR: true });
    advanceNormal(34, -0.10, -0.22, { halfWidth: 2.9, style: 'rainbow', guardL: true, guardR: true });

    // 8. 雲のトンネル 2回目：周囲に大きな雲を配置し、昼 → 夜に変化
    advanceNormal(42, -0.10, -0.22, {
      halfWidth: 2.8,
      style: 'cloud',
      guardL: true,
      guardR: true,
      tunnel: true,
      tunnelClouds: true,
      nightRatioStart: 0.0,
      nightRatioEnd: 1.0
    });
    this.obstacleSpecs.push({ s: s - 18, u: -0.55 });

    // 9. 星屑スライダー（夜区間をさらに長く＋2回目縦ループ）
    advanceNormal(36, 0.45, -0.20, { halfWidth: 3.0, style: 'cloud', guardL: true, guardR: true, nightRatio: 1.0 });
    advanceNormal(28, 0.45, -0.18, { halfWidth: 3.0, style: 'cloud', guardL: true, guardR: true, nightRatio: 1.0 });
    this.obstacleSpecs.push({ s: s - 10, u: -0.6 });

    // 加速床 → 縦一回転ループ 2回目（星空レインボーループ）
    advanceNormal(14, 0.45, -0.02, { halfWidth: 3.0, style: 'boost', guardL: true, guardR: true, nightRatio: 1.0 });
    advanceLoop(11.8, -8.2, { style: 'rainbow', nightRatio: 1.0 });

    // ループ抜け後のロングスラローム＆直線おじゃま雲
    advanceNormal(42, -0.40, -0.20, { halfWidth: 3.0, style: 'cloud', guardL: true, guardR: true, nightRatio: 1.0 });
    advanceNormal(32, -0.40, -0.18, { halfWidth: 3.0, style: 'cloud', guardL: true, guardR: true, nightRatio: 1.0 });
    this.obstacleSpecs.push({ s: s - 20, u: 0.65 });
    this.obstacleSpecs.push({ s: s - 8, u: -0.65 });
    advanceNormal(38, 0.0, -0.18, { halfWidth: 3.0, style: 'rainbow', guardL: true, guardR: true, nightRatio: 1.0 });

    // 10. ラストスパート加速 → ゴールへの直線アプローチ
    advanceNormal(16, 0.0, -0.14, { halfWidth: 3.1, style: 'boost', guardL: true, guardR: true, nightRatio: 1.0 });
    advanceNormal(28, 0.0, -0.05, { halfWidth: 3.4, halfWidthEnd: 4.0, style: 'cloud', nightRatio: 1.0 });
    this.obstacleSpecs.push({ s: s - 14, u: 0.0 });

    this.nodes = nodes;
    this.goalS = s;

    const lastNode = nodes[nodes.length - 1];
    this.goalForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
    this.goalRight.crossVectors(this.goalForward, upVec).normalize();
    this.goalCloudCenter
      .copy(lastNode.pos)
      .addScaledVector(this.goalForward, this.goalCloudRadius - 1.2)
      .add(new THREE.Vector3(0, -0.05, 0));
  }

  _createRainbowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const stripes = [
      '#ffffff',
      '#ff708d',
      '#ffa84c',
      '#ffe152',
      '#6fe37e',
      '#57d2ff',
      '#6d94ff',
      '#b87dff',
      '#ffffff'
    ];
    const weights = [0.45, 1, 1, 1, 1, 1, 1, 1, 0.45];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let x = 0;
    for (let i = 0; i < stripes.length; i++) {
      const w = (weights[i] / totalWeight) * canvas.width;
      ctx.fillStyle = stripes[i];
      ctx.fillRect(x, 0, w + 1, canvas.height);
      x += w;
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  _createBoostTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3ad6ff';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#fff56b';
    for (let row = 0; row < 2; row++) {
      const y = 24 + row * 64;
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(114, y + 36);
      ctx.lineTo(94, y + 36);
      ctx.lineTo(64, y + 14);
      ctx.lineTo(34, y + 36);
      ctx.lineTo(14, y + 36);
      ctx.closePath();
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  _createJumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#ff68a8');
    g.addColorStop(1, '#ffb56b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(64, 18);
    ctx.lineTo(110, 62);
    ctx.lineTo(86, 62);
    ctx.lineTo(86, 108);
    ctx.lineTo(42, 108);
    ctx.lineTo(42, 62);
    ctx.lineTo(18, 62);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  _buildCourseMeshes() {
    const buildTrackMesh = (filterFn, mat) => {
      const positions = [];
      const uvs = [];
      const indices = [];
      const thickness = 0.55;

      let vOffset = 0;
      let i = 0;
      while (i < this.nodes.length - 1) {
        if (!filterFn(this.nodes[i])) {
          i++;
          continue;
        }
        let j = i;
        while (j < this.nodes.length - 1 && filterFn(this.nodes[j])) {
          j++;
        }
        // j 番目のノードまで繋ぐ（端点を綺麗に閉じる）
        const endIdx = Math.min(this.nodes.length - 1, j);
        const segCount = endIdx - i;
        if (segCount <= 0) {
          i++;
          continue;
        }

        const addStrip = (stripKind) => {
          const base = vOffset;
          for (let k = i; k <= endIdx; k++) {
            const n = this.nodes[k];
            const hw = n.halfWidth;
            const tU = (k - i) / segCount;

            const pLTop = n.pos.clone().addScaledVector(n.B, -hw);
            const pRTop = n.pos.clone().addScaledVector(n.B, hw);
            const pLBot = pLTop.clone().addScaledVector(n.N, -thickness);
            const pRBot = pRTop.clone().addScaledVector(n.N, -thickness);

            if (stripKind === 'top') {
              positions.push(pLTop.x, pLTop.y, pLTop.z, pRTop.x, pRTop.y, pRTop.z);
              uvs.push(0, tU, 1, tU);
            } else if (stripKind === 'bottom') {
              positions.push(pLBot.x, pLBot.y, pLBot.z, pRBot.x, pRBot.y, pRBot.z);
              uvs.push(0, tU, 1, tU);
            } else if (stripKind === 'left') {
              positions.push(pLTop.x, pLTop.y, pLTop.z, pLBot.x, pLBot.y, pLBot.z);
              uvs.push(0.05, tU, 0.05, tU);
            } else {
              positions.push(pRTop.x, pRTop.y, pRTop.z, pRBot.x, pRBot.y, pRBot.z);
              uvs.push(0.95, tU, 0.95, tU);
            }
            vOffset += 2;
          }

          for (let k = 0; k < segCount; k++) {
            const a = base + k * 2;
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            if (stripKind === 'top' || stripKind === 'right') {
              indices.push(a, b, c, b, d, c);
            } else {
              indices.push(a, c, b, b, c, d);
            }
          }
        };

        addStrip('top');
        addStrip('bottom');
        addStrip('left');
        addStrip('right');

        i = j + 1;
      }

      if (positions.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      return mesh;
    };

    const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const rainbowMat = new THREE.MeshToonMaterial({ map: this._createRainbowTexture() });
    this.boostTex = this._createBoostTexture();
    const boostMat = new THREE.MeshBasicMaterial({ map: this.boostTex });
    const jumpMat = new THREE.MeshBasicMaterial({ map: this._createJumpTexture() });

    buildTrackMesh((n) => n.style === 'cloud', cloudMat);
    buildTrackMesh((n) => n.style === 'rainbow', rainbowMat);
    buildTrackMesh((n) => n.style === 'boost', boostMat);
    buildTrackMesh((n) => n.style === 'jump', jumpMat);

    // 雲ガードレールを InstancedMesh で一括描画（軽量）
    const guardTransforms = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.nodes.length; i += 2) {
      const n = this.nodes[i];
      if (n.style === 'gap') continue;
      if (n.guardL) {
        const gp = n.pos.clone().addScaledVector(n.B, -(n.halfWidth + 0.15)).addScaledVector(n.N, 0.35);
        guardTransforms.push({ pos: gp, scale: 0.72 + (i % 3) * 0.08 });
      }
      if (n.guardR) {
        const gp = n.pos.clone().addScaledVector(n.B, n.halfWidth + 0.15).addScaledVector(n.N, 0.35);
        guardTransforms.push({ pos: gp, scale: 0.72 + ((i + 1) % 3) * 0.08 });
      }
    }

    if (guardTransforms.length > 0) {
      const puffGeo = new THREE.SphereGeometry(1, 10, 8);
      const guardMat = new THREE.MeshToonMaterial({ color: 0xf4f9ff });
      const inst = new THREE.InstancedMesh(puffGeo, guardMat, guardTransforms.length);
      guardTransforms.forEach((item, idx) => {
        dummy.position.copy(item.pos);
        dummy.scale.set(item.scale, item.scale * 0.85, item.scale * 1.15);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.scene.add(inst);
    }

    // 雲のトンネル（2か所）をアーチシェル＋入口のふわっとリングとして構築
    const tunnelPositions = [];
    const tunnelIndices = [];
    const archSegs = 12;
    let tvOffset = 0;
    let ti = 0;
    while (ti < this.nodes.length - 1) {
      if (!this.nodes[ti].tunnel) {
        ti++;
        continue;
      }
      let tj = ti;
      while (tj < this.nodes.length - 1 && this.nodes[tj].tunnel) {
        tj++;
      }
      const endIdx = Math.min(this.nodes.length - 1, tj);

      const base = tvOffset;
      for (let k = ti; k <= endIdx; k++) {
        const n = this.nodes[k];
        const rx = n.halfWidth + 0.75;
        const ry = 4.0;
        for (let a = 0; a <= archSegs; a++) {
          const theta = (a / archSegs) * Math.PI;
          const xOff = -Math.cos(theta) * rx;
          const yOff = Math.sin(theta) * ry - 0.2;
          const p = n.pos.clone().addScaledVector(n.B, xOff).addScaledVector(n.N, yOff);
          tunnelPositions.push(p.x, p.y, p.z);
          tvOffset++;
        }
      }

      const ringStride = archSegs + 1;
      for (let k = 0; k < endIdx - ti; k++) {
        for (let a = 0; a < archSegs; a++) {
          const p0 = base + k * ringStride + a;
          const p1 = p0 + 1;
          const p2 = p0 + ringStride;
          const p3 = p2 + 1;
          tunnelIndices.push(p0, p1, p2, p1, p3, p2);
        }
      }

      ti = tj + 1;
    }

    if (tunnelPositions.length > 0) {
      const tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tunnelPositions, 3));
      tGeo.setIndex(tunnelIndices);
      tGeo.computeVertexNormals();
      const tMat = new THREE.MeshToonMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
      });
      this.scene.add(new THREE.Mesh(tGeo, tMat));
    }

    // 2個目のトンネル周囲を覆う大きな雲（奥の星を隠す）
    const bigCloudTransforms = [];
    let cSeed = 37;
    const cRand = () => {
      cSeed = (cSeed * 1664525 + 1013904223) % 4294967296;
      return cSeed / 4294967296;
    };
    for (let i = 0; i < this.nodes.length; i += 4) {
      const n = this.nodes[i];
      if (!n.tunnelClouds) continue;
      const rx = n.halfWidth + 0.75;
      const ry = 4.0;
      const ringAngles = [-0.22, 0.05, 0.35, 0.65, 0.95, 1.22];
      for (let aIdx = 0; aIdx < ringAngles.length; aIdx++) {
        const theta = ringAngles[aIdx] * Math.PI;
        const r = 5.4 + cRand() * 2.8;
        const radialPad = r * 1.08 + 1.4;
        const xOff = -Math.cos(theta) * (rx + radialPad);
        const yOff = Math.sin(theta) * (ry + radialPad) - 0.5;
        const p = n.pos.clone().addScaledVector(n.B, xOff).addScaledVector(n.N, yOff);
        bigCloudTransforms.push({ pos: p, scale: r });
      }
      // さらに左右外側に張り出す雲を追加して斜め視線でも奥の星を隠す
      for (const side of [-1, 1]) {
        const r = 6.8 + cRand() * 3.0;
        const p = n.pos
          .clone()
          .addScaledVector(n.B, side * (rx + r * 1.2 + 8.5))
          .addScaledVector(n.N, 1.5 + (cRand() - 0.3) * 7.5);
        bigCloudTransforms.push({ pos: p, scale: r });
      }
    }

    if (bigCloudTransforms.length > 0) {
      const bigCloudGeo = new THREE.SphereGeometry(1, 14, 10);
      const bigCloudMat = new THREE.MeshToonMaterial({ color: 0xf7fbff });
      const bigCloudInst = new THREE.InstancedMesh(bigCloudGeo, bigCloudMat, bigCloudTransforms.length);
      bigCloudTransforms.forEach((item, idx) => {
        dummy.position.copy(item.pos);
        dummy.scale.set(item.scale * 1.15, item.scale * 0.9, item.scale * 1.15);
        dummy.updateMatrix();
        bigCloudInst.setMatrixAt(idx, dummy.matrix);
      });
      bigCloudInst.instanceMatrix.needsUpdate = true;
      this.scene.add(bigCloudInst);
    }

    // コース上の小さい障害物雲（当たるとスピードダウン、ジャンプで回避可能）
    const obsMainGeo = new THREE.SphereGeometry(0.56, 12, 10);
    const obsSideGeo = new THREE.SphereGeometry(0.4, 10, 8);
    const obsTopGeo = new THREE.SphereGeometry(0.36, 10, 8);
    const obsShadowGeo = new THREE.CircleGeometry(0.95, 16);
    const obsCloudMat = new THREE.MeshToonMaterial({ color: 0x7d8ea3 });
    const obsCloudShadeMat = new THREE.MeshToonMaterial({ color: 0x5e6e82 });
    const obsShadowMat = new THREE.MeshBasicMaterial({
      color: 0x3b4859,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });

    for (const spec of this.obstacleSpecs) {
      const n = this.sampleAtS(spec.s);
      if (!n) continue;
      const obsGroup = new THREE.Group();
      const basePos = n.pos.clone().addScaledVector(n.B, spec.u);
      obsGroup.position.copy(basePos);

      // コース面に合わせた向き
      const basis = new THREE.Matrix4().makeBasis(n.B, n.N, n.T.clone().negate());
      obsGroup.quaternion.setFromRotationMatrix(basis);

      const shadowMesh = new THREE.Mesh(obsShadowGeo, obsShadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.y = 0.03;
      obsGroup.add(shadowMesh);

      const puffWrap = new THREE.Group();
      puffWrap.position.y = 0.52;
      obsGroup.add(puffWrap);

      const cCenter = new THREE.Mesh(obsMainGeo, obsCloudMat);
      cCenter.scale.set(1.15, 0.9, 1.0);
      puffWrap.add(cCenter);

      const cLeft = new THREE.Mesh(obsSideGeo, obsCloudShadeMat);
      cLeft.position.set(-0.52, -0.08, 0.05);
      puffWrap.add(cLeft);

      const cRight = new THREE.Mesh(obsSideGeo, obsCloudShadeMat);
      cRight.position.set(0.52, -0.08, -0.04);
      puffWrap.add(cRight);

      const cTop = new THREE.Mesh(obsTopGeo, obsCloudMat);
      cTop.position.set(0.08, 0.34, 0);
      puffWrap.add(cTop);

      this.scene.add(obsGroup);
      this.obstacleClouds.push({
        s: spec.s,
        u: spec.u,
        group: obsGroup,
        puffWrap,
        hitCooldown: 0,
        hitAnim: 0
      });
    }
  }

  _buildStarParticles() {
    // 2回目のトンネル抜け後〜ゴール上空に煌めく多数の星・光の粒を配置
    const pts = [];
    const phases = [];
    const sizes = [];
    const colors = [];

    let seed = 91;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const palette = [
      new THREE.Color(0xfff6a8),
      new THREE.Color(0xa6e8ff),
      new THREE.Color(0xffb8e6),
      new THREE.Color(0xffffff)
    ];

    for (let i = 0; i < this.nodes.length; i += 2) {
      const n = this.nodes[i];
      if (n.nightRatio < 0.75) continue;

      for (let k = 0; k < 5; k++) {
        const sideSign = rand() < 0.5 ? -1 : 1;
        // コースの少し上や左右を通過する光の粒（コースど真ん中は少し避けつつ周りから頭上へ散らす）
        const lateral = (rand() < 0.35 ? (rand() - 0.5) * 4.5 : sideSign * (2.6 + rand() * 8.5));
        const height = (rand() < 0.35 ? 2.4 + rand() * 5.0 : 0.6 + rand() * 8.0);
        const p = n.pos
          .clone()
          .addScaledVector(n.B, lateral)
          .addScaledVector(n.N, height);

        pts.push(p.x, p.y, p.z);
        phases.push(rand() * Math.PI * 2);
        sizes.push(3.5 + rand() * 5.5);
        const c = palette[Math.floor(rand() * palette.length)];
        colors.push(c.r, c.g, c.b);
      }
    }

    // ゴール雲周辺上空にも光の粒を追加
    for (let i = 0; i < 65; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = 4 + rand() * 24;
      const h = 2.0 + rand() * 14.0;
      pts.push(
        this.goalCloudCenter.x + Math.cos(ang) * dist,
        this.goalCloudCenter.y + h,
        this.goalCloudCenter.z + Math.sin(ang) * dist
      );
      phases.push(rand() * Math.PI * 2);
      sizes.push(3.5 + rand() * 6.0);
      const c = palette[Math.floor(rand() * palette.length)];
      colors.push(c.r, c.g, c.b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));

    this.starUniforms = {
      uTime: { value: 0 },
      uNight: { value: 0 }
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        attribute vec3 aColor;
        uniform float uTime;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vAlpha = 0.55 + 0.45 * sin(uTime * 3.0 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(24.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uNight;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float glow = smoothstep(0.5, 0.04, d);
          float vis = mix(0.25, 1.0, uNight);
          gl_FragColor = vec4(vColor, glow * vAlpha * vis);
        }
      `
    });

    this.starPoints = new THREE.Points(geo, mat);
    this.scene.add(this.starPoints);
  }

  _buildGoalArea() {
    const lastNode = this.nodes[this.nodes.length - 1];
    const yaw = Math.atan2(-this.goalForward.x, -this.goalForward.z);

    // ゴールラインのチェッカーアーチ
    const goalGate = new THREE.Group();
    goalGate.position.copy(lastNode.pos);
    goalGate.rotation.y = yaw;
    this.scene.add(goalGate);

    const poleMat = new THREE.MeshToonMaterial({ color: 0xffd166 });
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 4.6, 12);
    const poleL = new THREE.Mesh(poleGeo, poleMat);
    poleL.position.set(-4.2, 2.3, 0);
    goalGate.add(poleL);

    const poleR = new THREE.Mesh(poleGeo, poleMat);
    poleR.position.set(4.2, 2.3, 0);
    goalGate.add(poleR);

    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 128;
    const bCtx = bannerCanvas.getContext('2d');
    const sq = 32;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 16; x++) {
        bCtx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#ff6b9d';
        bCtx.fillRect(x * sq, y * sq, sq, sq);
      }
    }
    bCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    bCtx.fillRect(156, 26, 200, 76);
    bCtx.fillStyle = '#e04274';
    bCtx.font = '900 54px sans-serif';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText('GOAL!', 256, 66);

    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    bannerTex.encoding = THREE.sRGBEncoding;
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 1.4, 0.25),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    banner.position.set(0, 4.2, 0);
    goalGate.add(banner);

    // 広めのゴール雲プラットフォーム
    const cloudGroup = new THREE.Group();
    cloudGroup.position.copy(this.goalCloudCenter);
    this.scene.add(cloudGroup);

    const cloudTopMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const cloudShadeMat = new THREE.MeshToonMaterial({ color: 0xe9f3ff });

    const topCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(this.goalCloudRadius, this.goalCloudRadius * 0.94, 2.4, 36),
      cloudTopMat
    );
    topCylinder.position.y = -1.2;
    cloudGroup.add(topCylinder);

    // 雲らしさを出す外周の丸いコブ
    const puffGeo = new THREE.SphereGeometry(3.2, 16, 12);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const puff = new THREE.Mesh(puffGeo, i % 2 === 0 ? cloudTopMat : cloudShadeMat);
      puff.position.set(
        Math.cos(a) * (this.goalCloudRadius - 0.6),
        -1.15,
        Math.sin(a) * (this.goalCloudRadius - 0.6)
      );
      puff.scale.set(1.1, 0.65, 1.1);
      cloudGroup.add(puff);
    }

    // ベストタイム トップ3 掲示板（ゴール雲の奥左側）
    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = 512;
    this.boardCanvas.height = 384;
    this.boardCtx = this.boardCanvas.getContext('2d');
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.encoding = THREE.sRGBEncoding;
    this._drawLeaderboardTexture(null);

    const boardPos = this.goalCloudCenter
      .clone()
      .addScaledVector(this.goalForward, 6.2)
      .addScaledVector(this.goalRight, -5.2);

    const boardGroup = new THREE.Group();
    boardGroup.position.copy(boardPos);
    boardGroup.rotation.y = yaw - 0.32;
    this.scene.add(boardGroup);

    const woodMat = new THREE.MeshToonMaterial({ color: 0xf4a2c0 });
    const creamMat = new THREE.MeshToonMaterial({ color: 0xfff7ee });
    const postGeo = new THREE.CylinderGeometry(0.16, 0.19, 3.9, 12);
    const postL = new THREE.Mesh(postGeo, woodMat);
    postL.position.set(-1.75, 1.95, 0);
    boardGroup.add(postL);
    const postR = new THREE.Mesh(postGeo, woodMat);
    postR.position.set(1.75, 1.95, 0);
    boardGroup.add(postR);

    // 柱のてっぺんに丸いポンポン飾り＋足元に小さな雲
    const capGeo = new THREE.SphereGeometry(0.24, 12, 10);
    const capMat = new THREE.MeshToonMaterial({ color: 0xffe066 });
    const capL = new THREE.Mesh(capGeo, capMat);
    capL.position.set(-1.75, 4.02, 0);
    boardGroup.add(capL);
    const capR = new THREE.Mesh(capGeo, capMat);
    capR.position.set(1.75, 4.02, 0);
    boardGroup.add(capR);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.55, 3.25, 0.24), woodMat);
    frame.position.set(0, 2.75, 0);
    boardGroup.add(frame);

    const innerFrame = new THREE.Mesh(new THREE.BoxGeometry(4.28, 3.0, 0.25), creamMat);
    innerFrame.position.set(0, 2.75, 0.01);
    boardGroup.add(innerFrame);

    // 掲示板の頂上にもくもく雲と星の飾り
    const bCloudGeo = new THREE.SphereGeometry(0.36, 12, 10);
    const bCloudMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const bCloudOffsets = [
      [-0.65, 4.46, 0.05, 0.9],
      [-0.25, 4.58, 0.06, 1.15],
      [0.25, 4.58, 0.06, 1.15],
      [0.65, 4.46, 0.05, 0.9]
    ];
    for (const [bx, by, bz, bs] of bCloudOffsets) {
      const c = new THREE.Mesh(bCloudGeo, bCloudMat);
      c.position.set(bx, by, bz);
      c.scale.setScalar(bs);
      boardGroup.add(c);
    }

    const starOrnament = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshToonMaterial({ color: 0xffd43b })
    );
    starOrnament.position.set(0, 4.66, 0.26);
    starOrnament.rotation.z = Math.PI / 4;
    boardGroup.add(starOrnament);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 2.75),
      new THREE.MeshBasicMaterial({ map: this.boardTex })
    );
    face.position.set(0, 2.75, 0.15);
    boardGroup.add(face);

    // 城内へ戻るワープポータル（ゴール雲の奥右側）
    this.goalPortalPos
      .copy(this.goalCloudCenter)
      .addScaledVector(this.goalForward, 7.2)
      .addScaledVector(this.goalRight, 4.4);

    const pCanvas = document.createElement('canvas');
    pCanvas.width = 256;
    pCanvas.height = 256;
    const pCtx = pCanvas.getContext('2d');
    const pGrad = pCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
    pGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
    pGrad.addColorStop(0.35, 'rgba(148, 232, 255, 0.86)');
    pGrad.addColorStop(0.72, 'rgba(255, 165, 224, 0.65)');
    pGrad.addColorStop(0.92, 'rgba(130, 225, 255, 0.42)');
    pGrad.addColorStop(1.0, 'rgba(130, 225, 255, 0.0)');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 256, 256);

    pCtx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    pCtx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * Math.PI * 2;
      pCtx.beginPath();
      pCtx.arc(128, 128, 52 + i * 16, a0, a0 + Math.PI * 0.9);
      pCtx.stroke();
    }

    const pTex = new THREE.CanvasTexture(pCanvas);
    pTex.encoding = THREE.sRGBEncoding;

    this.goalPortalGroup = new THREE.Group();
    this.goalPortalGroup.position.set(this.goalPortalPos.x, this.goalPortalPos.y + 1.75, this.goalPortalPos.z);
    this.goalPortalGroup.rotation.y = yaw + 0.24;
    this.scene.add(this.goalPortalGroup);

    this.goalPortalDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.48, 36),
      new THREE.MeshBasicMaterial({
        map: pTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    this.goalPortalGroup.add(this.goalPortalDisc);

    this.goalPortalGroup.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.075, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0xbef2ff })
      )
    );
    this.goalPortalGroup.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(1.22, 0.035, 8, 36),
        new THREE.MeshBasicMaterial({ color: 0xffd0ee })
      )
    );
  }

  _drawLeaderboardTexture(latestTime = null) {
    const ctx = this.boardCtx;
    const w = 512;
    const h = 384;

    const roundRectPath = (x, y, rw, rh, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + rw - r, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + r);
      ctx.lineTo(x + rw, y + rh - r);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
      ctx.lineTo(x + r, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    const drawStar = (cx, cy, outerR, innerR, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? outerR : innerR;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };

    // やさしいパステル背景＋ドット模様
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#fff7fb');
    bgGrad.addColorStop(1, '#f0f8ff');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255, 190, 220, 0.28)';
    for (let dy = 24; dy < h; dy += 36) {
      for (let dx = 24; dx < w; dx += 36) {
        ctx.beginPath();
        ctx.arc(dx + ((dy / 36) % 2) * 18, dy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 外枠（角丸パステルピンク）
    roundRectPath(12, 12, w - 24, h - 24, 24);
    ctx.strokeStyle = '#ffbdd6';
    ctx.lineWidth = 8;
    ctx.stroke();

    // ヘッダー帯（角丸グラデーション）
    const headGrad = ctx.createLinearGradient(28, 24, w - 28, 24);
    headGrad.addColorStop(0, '#ff77aa');
    headGrad.addColorStop(0.5, '#ff6398');
    headGrad.addColorStop(1, '#ffa0c6');
    roundRectPath(30, 24, w - 60, 62, 20);
    ctx.fillStyle = headGrad;
    ctx.fill();

    drawStar(64, 55, 14, 6.5, '#fff3a1');
    drawStar(w - 64, 55, 14, 6.5, '#fff3a1');

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BEST TIME TOP 3', w * 0.5, 56);

    const rankColors = ['#f5b427', '#8aa0b8', '#d48653'];
    const rankBgColors = ['#fff5cc', '#eef4fb', '#fff0e6'];
    const rankLabels = ['1st', '2nd', '3rd'];
    let matchedHighlight = false;

    for (let i = 0; i < 3; i++) {
      const y = 132 + i * 78;
      const val = this.bestTimes[i];
      const isLatest = latestTime !== null && !matchedHighlight && typeof val === 'number' && Math.abs(val - latestTime) < 0.005;
      if (isLatest) matchedHighlight = true;

      roundRectPath(38, y - 28, w - 76, 62, 18);
      ctx.fillStyle = isLatest ? '#fff0ba' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = isLatest ? '#f5b427' : '#e4eef9';
      ctx.lineWidth = isLatest ? 4 : 2.5;
      ctx.stroke();

      // 左側メダルバッジ
      ctx.fillStyle = rankBgColors[i];
      ctx.beginPath();
      ctx.arc(74, y + 3, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rankColors[i];
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = rankColors[i];
      ctx.font = '900 21px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rankLabels[i], 74, y + 4);

      if (isLatest) {
        drawStar(114, y + 3, 10, 4.8, '#ff77aa');
      }

      ctx.fillStyle = '#533b42';
      ctx.font = '900 32px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(typeof val === 'number' ? this.formatTime(val) : '--:--.--', w - 60, y + 4);
    }

    this.boardTex.needsUpdate = true;
  }

  startNewRun(player) {
    this.runState = 'intro_fall';
    this.timerStarted = false;
    this.timerFinished = false;
    this.elapsedTime = 0;
    this.trackS = 4.0;
    this.trackU = 0.0;
    this.trackH = 11.0;
    this.vForward = 0;
    this.vSide = 0;
    this.vUp = 0;
    this.boostCooldown = 0;
    this.nightRatio = 0;
    this._applyEnvironmentNight(0);
    for (const obs of this.obstacleClouds) {
      obs.hitCooldown = 0;
      obs.hitAnim = 0;
      obs.puffWrap.scale.set(1, 1, 1);
    }

    const sample = this.sampleAtS(this.trackS);
    const startPos = sample.pos
      .clone()
      .addScaledVector(sample.N, this.trackH);

    player.facingYaw = Math.atan2(-sample.T.x, -sample.T.z) + Math.PI;
    player.resetTo(startPos);
    player.airJumpsLeft = 1;
    this.loopCameraYaw = Math.atan2(sample.T.x, sample.T.z) + Math.PI;
    this.goalBaseYaw = this.loopCameraYaw;
    this.goalCamYaw = this.loopCameraYaw;
  }

  warpToPartnerPosition(partnerPos, player) {
    // 相手がゴール雲付近ならゴール雲上に、コース上なら相手の少し後ろ・上に合流
    const dGoal = Math.hypot(
      partnerPos.x - this.goalCloudCenter.x,
      partnerPos.z - this.goalCloudCenter.z
    );
    if (dGoal <= this.goalCloudRadius && Math.abs(partnerPos.y - this.goalCloudCenter.y) < 12) {
      this.runState = 'goal_walk';
      this.timerStarted = true;
      this.timerFinished = true;
      this.nightRatio = 1.0;
      this._applyEnvironmentNight(1.0);
      const goalYaw = Math.atan2(this.goalForward.x, this.goalForward.z) + Math.PI;
      this.goalBaseYaw = goalYaw;
      this.goalCamYaw = goalYaw;
      const target = partnerPos.clone().add(new THREE.Vector3(0, 1.5, 0));
      player.resetTo(target);
      return;
    }

    // コース上の最近接ノードを探す
    let bestIdx = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.style === 'gap') continue;
      const dSq = n.pos.distanceToSquared(partnerPos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    const n = this.nodes[bestIdx];
    this.runState = 'sliding';
    this.timerStarted = true;
    this.timerFinished = false;
    this.trackS = n.s;
    this.trackU = 0;
    this.trackH = player.radius + 1.2;
    this.vForward = 18.0;
    this.vSide = 0;
    this.vUp = 0;
    this.nightRatio = n.nightRatio;
    this._applyEnvironmentNight(n.nightRatio);

    const spawnPos = n.pos.clone().addScaledVector(n.N, this.trackH);
    player.resetTo(spawnPos);
  }

  sampleAtS(s) {
    if (this.nodes.length === 0) return null;
    if (s <= this.nodes[0].s) {
      const n = this.nodes[0];
      return {
        pos: n.pos.clone(),
        T: n.T.clone(),
        N: n.N.clone(),
        B: n.B.clone(),
        halfWidth: n.halfWidth,
        style: n.style,
        guardL: n.guardL,
        guardR: n.guardR,
        isLoop: n.isLoop,
        nightRatio: n.nightRatio,
        launchY: n.launchY
      };
    }
    const last = this.nodes[this.nodes.length - 1];
    if (s >= last.s) {
      return {
        pos: last.pos.clone(),
        T: last.T.clone(),
        N: last.N.clone(),
        B: last.B.clone(),
        halfWidth: last.halfWidth,
        style: last.style,
        guardL: last.guardL,
        guardR: last.guardR,
        isLoop: last.isLoop,
        nightRatio: last.nightRatio,
        launchY: last.launchY
      };
    }

    // 二分探索で区間を取得
    let lo = 0;
    let hi = this.nodes.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.nodes[mid].s <= s) lo = mid;
      else hi = mid;
    }

    const a = this.nodes[lo];
    const b = this.nodes[hi];
    const span = Math.max(0.0001, b.s - a.s);
    const t = THREE.MathUtils.clamp((s - a.s) / span, 0, 1);

    const pos = new THREE.Vector3().lerpVectors(a.pos, b.pos, t);
    const T = new THREE.Vector3().lerpVectors(a.T, b.T, t).normalize();
    const N = new THREE.Vector3().lerpVectors(a.N, b.N, t).normalize();
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    N.crossVectors(B, T).normalize();

    return {
      pos,
      T,
      N,
      B,
      halfWidth: THREE.MathUtils.lerp(a.halfWidth, b.halfWidth, t),
      style: t < 0.5 ? a.style : b.style,
      guardL: a.guardL || b.guardL,
      guardR: a.guardR || b.guardR,
      isLoop: a.isLoop || b.isLoop,
      nightRatio: THREE.MathUtils.lerp(a.nightRatio, b.nightRatio, t),
      launchY: t < 0.5 ? a.launchY : b.launchY
    };
  }

  _applyEnvironmentNight(ratio) {
    const r = THREE.MathUtils.clamp(ratio, 0, 1);
    this.skyUniforms.uTop.value.lerpColors(this.daySkyTop, this.nightSkyTop, r);
    this.skyUniforms.uMid.value.lerpColors(this.daySkyMid, this.nightSkyMid, r);
    this.skyUniforms.uBot.value.lerpColors(this.daySkyBot, this.nightSkyBot, r);
    this.scene.fog.color.lerpColors(this.dayFogColor, this.nightFogColor, r);

    this.hemiLight.intensity = THREE.MathUtils.lerp(0.88, 0.62, r);
    this.dirLight.intensity = THREE.MathUtils.lerp(0.78, 0.45, r);
    this.starUniforms.uNight.value = r;
  }

  isPlayerInGoalPortal(pos) {
    if (this.runState !== 'goal_walk' || !pos) return false;
    const dx = pos.x - this.goalPortalPos.x;
    const dz = pos.z - this.goalPortalPos.z;
    const dy = pos.y - this.goalPortalPos.y;
    return Math.hypot(dx, dz) < 1.38 && dy >= 0 && dy < 3.4;
  }

  _findLandingNodeNearPos(pos, minS) {
    let bestNode = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.style === 'gap' || n.s < minS) continue;
      const dSq = n.pos.distanceToSquared(pos);
      if (dSq < 18 * 18 && dSq < bestDistSq) {
        bestDistSq = dSq;
        bestNode = n;
      }
    }
    return bestNode;
  }

  update(dt, player, controls, sound, sendSeFn) {
    this.time += dt;
    if (this.boostCooldown > 0) this.boostCooldown -= dt;

    this.starUniforms.uTime.value = this.time;
    if (this.boostTex) {
      this.boostTex.offset.y -= dt * 2.2;
    }

    for (const obs of this.obstacleClouds) {
      if (obs.hitCooldown > 0) obs.hitCooldown -= dt;
      if (obs.hitAnim > 0) {
        obs.hitAnim = Math.max(0, obs.hitAnim - dt);
        const sPulse = 1.0 + Math.sin((obs.hitAnim / 0.35) * Math.PI) * 0.25;
        obs.puffWrap.scale.set(sPulse, 1.0 / sPulse, sPulse);
      } else {
        obs.puffWrap.scale.set(1, 1, 1);
      }
    }

    // ゴールポータルアニメーション
    const pFloatY = Math.sin(this.time * 1.8) * 0.09;
    const pulse = 1.0 + Math.sin(this.time * 2.6) * 0.035;
    this.goalPortalGroup.position.y = this.goalPortalPos.y + 1.75 + pFloatY;
    this.goalPortalGroup.scale.setScalar(pulse);
    this.goalPortalDisc.rotation.z = this.time * 0.85;

    if (this.timerStarted && !this.timerFinished) {
      this.elapsedTime += dt;
    }

    const move = controls.getMoveVector();
    const jumpPressed = controls.consumeJump();
    if (jumpPressed) {
      player.jumpBufferTimer = 0.14;
    } else if (player.jumpBufferTimer > 0) {
      player.jumpBufferTimer -= dt;
    }

    let courseOut = false;
    let justFinished = false;
    let enteredGoalPortal = false;

    if (this.runState === 'intro_fall') {
      const sample = this.sampleAtS(this.trackS);
      this.vUp -= 28.0 * dt;
      this.trackH += this.vUp * dt;

      if (this.trackH <= player.radius) {
        this.trackH = player.radius;
        this.vUp = 0;
        this.vForward = 14.0;
        this.runState = 'sliding';
        this.timerStarted = true;
        this.elapsedTime = 0;
        player.isGrounded = true;
        player.airJumpsLeft = 1;
        player.triggerSquash(0.64);
        player.setExpression('land', 0.28);
        if (sound) sound.playLand();
        if (sendSeFn) sendSeFn('land');
      }

      player.position
        .copy(sample.pos)
        .addScaledVector(sample.N, this.trackH)
        .addScaledVector(sample.B, this.trackU);
      player.velocity.set(0, this.vUp, 0);
      player.facingYaw = Math.atan2(sample.T.x, sample.T.z);
    } else if (this.runState === 'sliding') {
      const sample = this.sampleAtS(this.trackS);

      // 昼→夜への滑らかな環境補間
      this.nightRatio = THREE.MathUtils.lerp(this.nightRatio, sample.nightRatio, Math.min(1, dt * 3.5));
      this._applyEnvironmentNight(this.nightRatio);

      // ループ用カメラ基準角更新
      if (!sample.isLoop) {
        this.loopCameraYaw = Math.atan2(sample.T.x, sample.T.z) + Math.PI;
      }

      // 加速・ブレーキ入力（move.y < 0 が前＝加速、move.y > 0 が後＝ブレーキ）
      const accelInput = -move.y;
      let targetSpeed = 20.5;
      if (sample.T.y < -0.15) targetSpeed += 3.0;
      if (accelInput > 0.08) {
        targetSpeed += accelInput * 9.5;
      } else if (accelInput < -0.08) {
        targetSpeed += accelInput * 10.5;
      }

      if (sample.style === 'boost') {
        targetSpeed = 36.5;
        if (this.vForward < 34.0) {
          this.vForward = Math.min(36.5, this.vForward + 55.0 * dt);
        }
        if (this.boostCooldown <= 0) {
          this.boostCooldown = 0.7;
          player.triggerSquash(1.32);
          player.setExpression('happy', 0.5);
          if (sound) sound.playBounce(0.85);
          if (sendSeFn) sendSeFn('bounce');
        }
      } else if (sample.style === 'jump') {
        targetSpeed = Math.max(targetSpeed, 33.0);
        if (this.vForward < 31.0) {
          this.vForward = Math.min(34.0, this.vForward + 40.0 * dt);
        }
      } else if (sample.isLoop) {
        targetSpeed = Math.max(targetSpeed, 29.0);
      }

      const speedRate = accelInput > 0.1 ? 3.5 : 2.4;
      this.vForward = THREE.MathUtils.lerp(this.vForward, targetSpeed, Math.min(1, dt * speedRate));
      if (sample.isLoop) {
        this.vForward = Math.max(25.0, this.vForward);
      }

      // 左右ライン取り操作
      const targetSideVel = move.x * 11.5;
      this.vSide = THREE.MathUtils.lerp(this.vSide, targetSideVel, Math.min(1, dt * 11.0));

      this.trackS += this.vForward * dt;
      this.trackU += this.vSide * dt;

      // コース上の小さい障害物雲との衝突判定（ジャンプで飛び越えれば回避）
      for (const obs of this.obstacleClouds) {
        if (
          obs.hitCooldown <= 0 &&
          Math.abs(this.trackS - obs.s) < 1.15 &&
          Math.abs(this.trackU - obs.u) < 1.15 &&
          this.trackH < player.radius + 0.92
        ) {
          obs.hitCooldown = 1.2;
          obs.hitAnim = 0.35;
          this.vForward = Math.max(7.5, this.vForward * 0.42);
          player.triggerSquash(0.62);
          player.setExpression('fall', 0.6);
          if (sound) sound.playLand(1.4);
          if (sendSeFn) sendSeFn('land');
        }
      }

      // ジャンプ処理（接地時・2段ジャンプ対応）
      const isOnGround = this.trackH <= player.radius + 0.06 && this.vUp <= 0.5;
      player.isGrounded = isOnGround;
      if (isOnGround) {
        player.coyoteTimer = 0.12;
        player.airJumpsLeft = 1;
      } else if (player.coyoteTimer > 0) {
        player.coyoteTimer -= dt;
      }

      if (player.jumpBufferTimer > 0) {
        if (player.coyoteTimer > 0) {
          this.vUp = 13.0;
          player.isGrounded = false;
          player.coyoteTimer = 0;
          player.jumpBufferTimer = 0;
          player.triggerSquash(1.36);
          player.setExpression('jump', 0.4);
          if (sound) sound.playJump();
          if (sendSeFn) sendSeFn('jump');
        } else if (player.airJumpsLeft > 0) {
          this.vUp = 12.2;
          player.airJumpsLeft--;
          player.jumpBufferTimer = 0;
          player.triggerSquash(1.4);
          player.setExpression('happy', 0.45);
          player.spawnDoubleJumpRing();
          if (sound) sound.playDoubleJump();
        }
      }

      const gravity = sample.isLoop ? 18.0 : 28.0;
      this.vUp -= gravity * dt;
      this.trackH += this.vUp * dt;

      const nextSample = this.sampleAtS(this.trackS);

      // ギャップ区間への突入（ジャンプ台から飛び出す！）
      if (nextSample.style === 'gap') {
        this.runState = 'gap_air';
        const launchSpeed = Math.max(this.vForward, 26.5);
        const launchVel = nextSample.T
          .clone()
          .multiplyScalar(launchSpeed)
          .addScaledVector(nextSample.B, this.vSide)
          .addScaledVector(nextSample.N, Math.max(0, this.vUp));
        // 確実に気持ちよく飛び越えるため上向きブーストも保障
        const minLaunchY = typeof nextSample.launchY === 'number' ? nextSample.launchY : 11.2;
        launchVel.y = Math.max(launchVel.y, minLaunchY);
        player.velocity.copy(launchVel);
        player.position
          .copy(nextSample.pos)
          .addScaledVector(nextSample.N, Math.max(player.radius, this.trackH))
          .addScaledVector(nextSample.B, this.trackU);
        player.isGrounded = false;
        player.triggerSquash(1.4);
        player.setExpression('happy', 0.6);
        if (sound) sound.playBounce();
        if (sendSeFn) sendSeFn('bounce');
      } else if (this.trackS >= this.goalS) {
        // ゴールライン通過！
        this.runState = 'goal_walk';
        this.goalBaseYaw = Math.atan2(nextSample.T.x, nextSample.T.z) + Math.PI;
        this.timerFinished = true;
        justFinished = true;
        this.recordFinishTime(this.elapsedTime);

        player.position
          .copy(nextSample.pos)
          .addScaledVector(nextSample.N, Math.max(player.radius, this.trackH))
          .addScaledVector(nextSample.B, this.trackU);
        player.velocity.copy(nextSample.T).multiplyScalar(Math.min(12.0, this.vForward * 0.5));
        player.isGrounded = true;
        player.airJumpsLeft = 1;
        player.setExpression('happy', 2.2);
        if (sound) sound.playStarWin();
        if (sendSeFn) sendSeFn('star_win');
      } else {
        // ガードレール・コースアウト判定
        const maxU = nextSample.halfWidth - player.radius * 0.7;
        if (this.trackH < 1.5) {
          let hitGuard = false;
          let impactSpeed = 0;
          if (this.trackU < -maxU && nextSample.guardL) {
            this.trackU = -maxU;
            hitGuard = true;
            if (this.vSide < 0) {
              impactSpeed = -this.vSide;
              this.vSide = -this.vSide * 0.35;
            }
          }
          if (this.trackU > maxU && nextSample.guardR) {
            this.trackU = maxU;
            hitGuard = true;
            if (this.vSide > 0) {
              impactSpeed = Math.max(impactSpeed, this.vSide);
              this.vSide = -this.vSide * 0.35;
            }
          }
          if (hitGuard) {
            const minGuardSpeed = nextSample.isLoop ? 25.0 : 12.0;
            if (impactSpeed > 1.5) {
              this.vForward = Math.max(minGuardSpeed, this.vForward * 0.88);
            } else {
              this.vForward = Math.max(minGuardSpeed, this.vForward - 9.0 * dt);
            }
          }
        }

        // ガードレールがない場所で大きく外れたら落下
        const fallLimit = nextSample.halfWidth + player.radius * 0.45;
        if (
          (!nextSample.guardL && this.trackU < -fallLimit) ||
          (!nextSample.guardR && this.trackU > fallLimit)
        ) {
          this.runState = 'falling_out';
          player.velocity
            .copy(nextSample.T)
            .multiplyScalar(this.vForward * 0.6)
            .addScaledVector(nextSample.B, this.vSide)
            .addScaledVector(nextSample.N, this.vUp);
          player.isGrounded = false;
          player.setExpression('fall', 1.2);
        } else {
          // 路面着地判定
          if (this.trackH <= player.radius) {
            if (!isOnGround && this.vUp < -5.5) {
              player.triggerSquash(0.66);
              player.setExpression('land', 0.22);
              if (sound) sound.playLand();
              if (sendSeFn) sendSeFn('land');
            }
            this.trackH = player.radius;
            this.vUp = 0;
            player.isGrounded = true;
          }

          player.position
            .copy(nextSample.pos)
            .addScaledVector(nextSample.N, this.trackH)
            .addScaledVector(nextSample.B, this.trackU);
          player.velocity
            .copy(nextSample.T)
            .multiplyScalar(this.vForward)
            .addScaledVector(nextSample.B, this.vSide);
          player.facingYaw = Math.atan2(nextSample.T.x, nextSample.T.z);
        }
      }
    } else if (this.runState === 'gap_air') {
      // ジャンプ台からの空中放物線飛行
      if (player.jumpBufferTimer > 0 && player.airJumpsLeft > 0) {
        player.velocity.y = Math.max(player.velocity.y, 0) + 10.5;
        player.airJumpsLeft--;
        player.jumpBufferTimer = 0;
        player.triggerSquash(1.38);
        player.setExpression('happy', 0.45);
        player.spawnDoubleJumpRing();
        if (sound) sound.playDoubleJump();
      }

      player.velocity.y -= 28.0 * dt;
      player.position.addScaledVector(player.velocity, dt);

      const landNode = this._findLandingNodeNearPos(player.position, this.trackS + 6.0);
      if (landNode) {
        const rel = this._tmpVec1.subVectors(player.position, landNode.pos);
        const h = rel.dot(landNode.N);
        const u = rel.dot(landNode.B);
        if (
          h <= player.radius + 0.35 &&
          h >= -2.5 &&
          Math.abs(u) <= landNode.halfWidth + player.radius * 0.5 &&
          player.velocity.y <= 3.0
        ) {
          this.runState = 'sliding';
          this.trackS = landNode.s;
          this.trackU = THREE.MathUtils.clamp(u, -landNode.halfWidth + 0.5, landNode.halfWidth - 0.5);
          this.trackH = player.radius;
          this.vForward = Math.max(18.0, Math.hypot(player.velocity.x, player.velocity.z));
          this.vSide = player.velocity.dot(landNode.B) * 0.4;
          this.vUp = 0;
          player.isGrounded = true;
          player.airJumpsLeft = 1;
          player.triggerSquash(0.64);
          player.setExpression('land', 0.25);
          if (sound) sound.playLand();
          if (sendSeFn) sendSeFn('land');
        }
      }

      if (this.runState === 'gap_air' && player.position.y < this.sampleAtS(this.trackS).pos.y - 22.0) {
        courseOut = true;
      }
    } else if (this.runState === 'falling_out') {
      player.velocity.y -= 30.0 * dt;
      player.position.addScaledVector(player.velocity, dt);
      const refSample = this.sampleAtS(this.trackS);
      if (player.position.y < refSample.pos.y - 14.0) {
        courseOut = true;
      }
    } else if (this.runState === 'goal_walk') {
      this._applyEnvironmentNight(1.0);
      const inputMag = Math.min(1, Math.hypot(move.x, move.y));
      const camYaw = this.goalCamYaw;
      const forward = this._tmpVec1.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const right = this._tmpVec2.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
      const wishDir = new THREE.Vector3()
        .addScaledVector(right, move.x)
        .addScaledVector(forward, -move.y);

      const maxSpeed = 10.5;
      if (inputMag > 0.05 && wishDir.lengthSq() > 0.0001) {
        wishDir.normalize();
        const grip = player.isGrounded ? 15.0 : 5.5;
        const alpha = 1 - Math.exp(-grip * dt);
        player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, wishDir.x * maxSpeed * inputMag, alpha);
        player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, wishDir.z * maxSpeed * inputMag, alpha);
      } else {
        const stopRate = player.isGrounded ? 16.0 : 4.0;
        const decay = Math.exp(-stopRate * dt);
        player.velocity.x *= decay;
        player.velocity.z *= decay;
      }

      if (player.isGrounded) player.coyoteTimer = 0.12;
      else if (player.coyoteTimer > 0) player.coyoteTimer -= dt;

      if (player.jumpBufferTimer > 0) {
        if (player.coyoteTimer > 0) {
          player.velocity.y = 14.5;
          player.isGrounded = false;
          player.airJumpsLeft = 1;
          player.jumpBufferTimer = 0;
          player.coyoteTimer = 0;
          player.triggerSquash(1.38);
          player.setExpression('jump', 0.4);
          if (sound) sound.playJump();
          if (sendSeFn) sendSeFn('jump');
        } else if (player.airJumpsLeft > 0) {
          player.velocity.y = 13.6;
          player.airJumpsLeft--;
          player.jumpBufferTimer = 0;
          player.triggerSquash(1.42);
          player.setExpression('happy', 0.45);
          player.spawnDoubleJumpRing();
          if (sound) sound.playDoubleJump();
        }
      }

      player.velocity.y -= 32.0 * dt;
      player.velocity.y = Math.max(player.velocity.y, -28);
      player.position.addScaledVector(player.velocity, dt);

      const wasGrounded = player.isGrounded;
      player.isGrounded = false;

      const dCloud = Math.hypot(
        player.position.x - this.goalCloudCenter.x,
        player.position.z - this.goalCloudCenter.z
      );
      if (
        dCloud <= this.goalCloudRadius + player.radius * 0.4 &&
        player.position.y - player.radius <= this.goalCloudCenter.y &&
        player.position.y >= this.goalCloudCenter.y - 2.4 &&
        player.velocity.y <= 0
      ) {
        const vn = player.velocity.y;
        player.position.y = this.goalCloudCenter.y + player.radius;
        player.velocity.y = 0;
        player.isGrounded = true;
        player.airJumpsLeft = 1;
        if (!wasGrounded && vn < -4.5) {
          player.triggerSquash(0.66);
          player.setExpression('land', 0.25);
          if (sound) sound.playLand();
          if (sendSeFn) sendSeFn('land');
        }
      }

      // ゴール雲から外に落ちたらコースアウト復帰
      if (player.position.y < this.goalCloudCenter.y - 14.0) {
        courseOut = true;
      }

      // ゴールポータル判定
      if (this.isPlayerInGoalPortal(player.position)) {
        enteredGoalPortal = true;
      }
    }

    this.skyDome.position.copy(player.position);

    const shadowInfo = this.getShadowGroundInfo(player.position.x, player.position.y, player.position.z);
    player.updateVisuals(dt, shadowInfo);

    return {
      courseOut,
      justFinished,
      enteredGoalPortal,
      elapsedTime: this.elapsedTime,
      timerStarted: this.timerStarted,
      timerFinished: this.timerFinished
    };
  }

  getShadowGroundInfo(px, py, pz) {
    // ゴール雲の上
    const dGoal = Math.hypot(px - this.goalCloudCenter.x, pz - this.goalCloudCenter.z);
    if (dGoal <= this.goalCloudRadius && py + 0.3 >= this.goalCloudCenter.y) {
      this._tmpNormal.set(0, 1, 0);
      return { y: this.goalCloudCenter.y, normal: this._tmpNormal };
    }

    // 現在のスライダー付近の影
    if (this.runState !== 'goal_walk') {
      const sample = this.sampleAtS(this.trackS);
      if (sample && sample.style !== 'gap' && Math.abs(this.trackU) <= sample.halfWidth) {
        const surf = sample.pos.clone().addScaledVector(sample.B, this.trackU);
        this._tmpNormal.copy(sample.N);
        return { y: surf.y, normal: this._tmpNormal };
      }
    }
    return null;
  }

  updateCamera(camera, camLookTarget, player, dt, yawOffset, pitchOffset) {
    const targetLook = new THREE.Vector3(player.position.x, player.position.y + 0.9, player.position.z);
    camLookTarget.lerp(targetLook, Math.min(1, dt * 14));

    let baseYaw = this.goalBaseYaw || 0;
    let basePitch = 0.28;
    let dist = 10.5;

    if (this.runState === 'intro_fall' || this.runState === 'sliding' || this.runState === 'gap_air') {
      const sample = this.sampleAtS(this.trackS);
      if (sample.isLoop) {
        // 縦ループ中は反転酔いを防ぐため進入方向基準の斜め横後ろから見守る
        baseYaw = this.loopCameraYaw + 0.55;
        basePitch = 0.14;
        dist = 13.8;
      } else {
        baseYaw = Math.atan2(sample.T.x, sample.T.z) + Math.PI;
        basePitch = 0.24;
        dist = 10.0;
      }
      this.goalBaseYaw = baseYaw;
    } else if (this.runState === 'falling_out') {
      baseYaw = this.loopCameraYaw;
      basePitch = 0.45;
      dist = 12.0;
    }

    const totalYaw = baseYaw + yawOffset;
    const totalPitch = THREE.MathUtils.clamp(basePitch + pitchOffset, -0.35, 1.1);
    this.goalCamYaw = totalYaw;

    const horizDist = Math.cos(totalPitch) * dist;
    const vertDist = Math.sin(totalPitch) * dist;

    const camX = camLookTarget.x + Math.sin(totalYaw) * horizDist;
    const camY = camLookTarget.y + vertDist;
    const camZ = camLookTarget.z + Math.cos(totalYaw) * horizDist;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(camLookTarget);
  }
}