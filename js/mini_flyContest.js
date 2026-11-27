class MiniFlyContest {
  constructor() {
    this.scene = new THREE.Scene();
    this.time = 0;

    this.bestDistances = this._loadBestDistances();

    // ラン状態: 'idle' | 'intro_fall' | 'ready' | 'flying' | 'result_wait'
    this.runState = 'idle';
    this.currentDistance = 0;
    this.finalDistance = 0;
    this.isNewRecord = false;
    this.resultTimer = 0;
    this.hasLeftStartCloud = false;
    this.boostTimer = 0;

    // カメラオフセット（プレイヤー操作で少し回せる）
    this.camYawOffset = 0;
    this.camPitchOffset = 0;

    // スタート地点の小さめの雲
    this.startCloudCenter = new THREE.Vector3(0, 0, 0);
    this.startCloudRadius = 4.6;
    this.startCloudTopY = 0.85;

    // 光の輪（リング）プール・生成状態
    this.rings = [];
    this.ringParticles = [];
    this.nextRingZ = -18;
    this.lastRingX = 0;
    this.lastRingY = 3.2;
    this.ringSeq = 0;

    // 背景用の乗れない装飾雲（ワールド同等の立体トゥーン雲を夜空色にしたもの）
    this.bgClouds = [];
    this.nextBgCloudZ = -24;
    this.bgCloudPuffGeo = new THREE.SphereGeometry(1, 16, 12);
    this.bgCloudTopMat = new THREE.MeshToonMaterial({ color: 0x6249a8 });
    this.bgCloudShadeMat = new THREE.MeshToonMaterial({ color: 0x422e7d });

    // 200m〜400mの花火演出（打ち上げ＆ライン付き球状開花）
    this.fireworkRockets = [];
    this.fireworkBursts = [];
    this.fireworkTimer = 0.25;

    // 500m以降の寄り道スカイ
    this.skyCoins = [];
    this.skyCoinGeo = new THREE.OctahedronGeometry(0.68, 0);
    this.skyCoinGeo.scale(0.92, 1.12, 0.55);
    this.skyCoinMat = new THREE.MeshToonMaterial({ color: 0xffd84d, emissive: 0x422d00 });

    // 流れ星（右上→左下、グラデーション尾＋星光ヘッド）
    this.shootingStars = [];
    this.shootingStarTimer = 1.6;
    this._createMeteorTextures();

    // プレイヤー飛行トレイル＆空間ダスト
    this.flightTrails = [];
    this.flightTrailTimer = 0;

    this._tmpVec1 = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();

    this._createSkyAndLights();
    this._buildStartCloud();
    this._buildLeaderboard();
  }

  _createMeteorTextures() {
    // 流れ星の尾（先端が白く太く、後ろへ向かって細く透明になるグラデーション）
    const tailCanvas = document.createElement('canvas');
    tailCanvas.width = 256;
    tailCanvas.height = 32;
    const tCtx = tailCanvas.getContext('2d');
    const grad = tCtx.createLinearGradient(0, 16, 256, 16);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(0.88, 'rgba(255, 255, 255, 0.88)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 1.0)');
    tCtx.fillStyle = grad;
    tCtx.beginPath();
    tCtx.moveTo(0, 16);
    tCtx.lineTo(250, 5);
    tCtx.arc(250, 16, 11, -Math.PI / 2, Math.PI / 2, false);
    tCtx.lineTo(0, 16);
    tCtx.closePath();
    tCtx.fill();

    this.meteorTailTex = new THREE.CanvasTexture(tailCanvas);
    this.meteorTailTex.encoding = THREE.sRGBEncoding;

    // 流れ星・花火コア用のキラキラ光点テクスチャ
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const gCtx = glowCanvas.getContext('2d');
    const gGrad = gCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
    gGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    gGrad.addColorStop(0.28, 'rgba(255, 255, 255, 0.85)');
    gGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.22)');
    gGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 64, 64);

    this.sparkGlowTex = new THREE.CanvasTexture(glowCanvas);
    this.sparkGlowTex.encoding = THREE.sRGBEncoding;
  }

  _loadBestDistances() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem('maimai_flyContest_top3') : null;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return arr.filter((n) => typeof n === 'number' && n > 0 && isFinite(n)).slice(0, 3);
        }
      }
    } catch (e) {}
    return [];
  }

  _saveBestDistances() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem('maimai_flyContest_top3', JSON.stringify(this.bestDistances));
      }
    } catch (e) {}
  }

  recordBestDistance(dist) {
    if (typeof dist !== 'number' || dist <= 0 || !isFinite(dist)) return false;
    const rounded = Math.round(dist * 10) / 10;
    const prevFirst = this.bestDistances.length > 0 ? this.bestDistances[0] : 0;
    this.bestDistances.push(rounded);
    this.bestDistances.sort((a, b) => b - a);
    this.bestDistances = this.bestDistances.slice(0, 3);
    this._saveBestDistances();
    this._drawLeaderboardTexture(rounded);
    return rounded > prevFirst;
  }

  clearBestDistances() {
    this.bestDistances = [];
    try {
      if (window.localStorage) {
        window.localStorage.removeItem('maimai_flyContest_top3');
      }
    } catch (e) {}
    this._drawLeaderboardTexture(null);
  }

  formatDistance(dist) {
    const val = Math.max(0, dist || 0);
    return `${val.toFixed(1)} m`;
  }

  _createSkyAndLights() {
    this.scene.fog = new THREE.Fog(0x28175e, 95, 260);

    const hemi = new THREE.HemisphereLight(0xd8ccff, 0x35226e, 0.92);
    this.scene.add(hemi);

    const moonDir = new THREE.DirectionalLight(0xfff4d6, 0.82);
    moonDir.position.set(45, 70, -60);
    this.scene.add(moonDir);

    // プレイヤーに追従する夜空スカイドーム・星・三日月グループ
    this.skyFollowGroup = new THREE.Group();
    this.scene.add(this.skyFollowGroup);

    const skyGeo = new THREE.SphereGeometry(280, 40, 28);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x160a38) },
        uMid: { value: new THREE.Color(0x2f1a6b) },
        uBot: { value: new THREE.Color(0x502c94) }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
          col = mix(uBot, col, smoothstep(-0.35, 0.08, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.renderOrder = -10;
    this.skyFollowGroup.add(skyDome);

    // きらめく星々
    const starCount = 750;
    const starPositions = new Float32Array(starCount * 3);
    const starPhases = new Float32Array(starCount);
    const starSizes = new Float32Array(starCount);

    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < starCount; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 1.45 - 0.45);
      const r = 210 + rand() * 45;
      starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      starPositions[i * 3 + 1] = Math.cos(phi) * r;
      starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      starPhases[i] = rand() * Math.PI * 2;
      starSizes[i] = 2.6 + rand() * 5.2;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));

    this.starUniforms = { uTime: { value: 0 } };
    const starMat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vAlpha = 0.45 + 0.55 * sin(uTime * 2.8 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (270.0 / max(40.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(1.0, 0.97, 0.85, core * vAlpha);
        }
      `
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.renderOrder = -8;
    this.skyFollowGroup.add(stars);

    // 三日月と柔らかな月光ハロー（進行方向の右前方に配置）
    const moonPos = new THREE.Vector3(64, 72, -145);
    const moonHaloCanvas = document.createElement('canvas');
    moonHaloCanvas.width = 256;
    moonHaloCanvas.height = 256;
    const mCtx = moonHaloCanvas.getContext('2d');
    const mGrad = mCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
    mGrad.addColorStop(0, 'rgba(255, 248, 200, 0.72)');
    mGrad.addColorStop(0.35, 'rgba(210, 228, 255, 0.30)');
    mGrad.addColorStop(1, 'rgba(160, 195, 255, 0.0)');
    mCtx.fillStyle = mGrad;
    mCtx.fillRect(0, 0, 256, 256);

    const moonHaloTex = new THREE.CanvasTexture(moonHaloCanvas);
    moonHaloTex.encoding = THREE.sRGBEncoding;

    const moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonHaloTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    moonGlow.position.copy(moonPos);
    moonGlow.scale.set(52, 52, 1);
    moonGlow.renderOrder = -6;
    this.skyFollowGroup.add(moonGlow);

    const rOuter = 10.5;
    const rInner = 9.0;
    const offsetX = 4.2;
    const ix = (rInner * rInner - rOuter * rOuter - offsetX * offsetX) / (2 * offsetX);
    const iy = Math.sqrt(Math.max(0.001, rOuter * rOuter - ix * ix));
    const outerAngle = Math.atan2(iy, ix);
    const innerAngle = Math.atan2(iy, ix + offsetX);

    const crescentShape = new THREE.Shape();
    crescentShape.absarc(0, 0, rOuter, -outerAngle, outerAngle, false);
    crescentShape.absarc(-offsetX, 0, rInner, innerAngle, -innerAngle, true);
    crescentShape.closePath();

    const moonGeo = new THREE.ExtrudeGeometry(crescentShape, {
      depth: 1.2,
      bevelEnabled: false,
      curveSegments: 36
    });
    moonGeo.center();
    const moonMesh = new THREE.Mesh(
      moonGeo,
      new THREE.MeshBasicMaterial({ color: 0xfff3b8, depthWrite: false })
    );
    moonMesh.position.copy(moonPos);
    moonMesh.lookAt(0, 0, 0);
    moonMesh.rotateZ(0.28);
    moonMesh.renderOrder = -5;
    this.skyFollowGroup.add(moonMesh);
  }

  _buildStartCloud() {
    this.startCloudGroup = new THREE.Group();
    this.startCloudGroup.position.copy(this.startCloudCenter);
    this.scene.add(this.startCloudGroup);

    const cloudMat = new THREE.MeshToonMaterial({ color: 0xf7fbff });
    const mainPuff = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), cloudMat);
    mainPuff.scale.set(this.startCloudRadius, this.startCloudTopY, this.startCloudRadius);
    this.startCloudGroup.add(mainPuff);

    const puffSpecs = [
      [-2.8, -0.1, 1.8, 1.8, 0.75],
      [2.8, -0.1, 1.8, 1.8, 0.75],
      [-2.9, -0.1, -1.7, 1.7, 0.72],
      [2.9, -0.1, -1.7, 1.7, 0.72],
      [0, -0.2, 3.0, 1.9, 0.72],
      [0, -0.2, -3.0, 1.9, 0.72]
    ];
    for (const [px, py, pz, pr, sy] of puffSpecs) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(pr, 16, 12), cloudMat);
      m.position.set(px, py, pz);
      m.scale.set(1, sy, 1);
      this.startCloudGroup.add(m);
    }

    // 進行方向を示す薄くて分かりやすい黄色い矢印（雲の前方端の上）
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 1.35);
    arrowShape.lineTo(1.15, 0.15);
    arrowShape.lineTo(0.46, 0.15);
    arrowShape.lineTo(0.46, -1.05);
    arrowShape.lineTo(-0.46, -1.05);
    arrowShape.lineTo(-0.46, 0.15);
    arrowShape.lineTo(-1.15, 0.15);
    arrowShape.closePath();

    const arrowGeo = new THREE.ExtrudeGeometry(arrowShape, {
      depth: 0.14,
      bevelEnabled: false
    });
    arrowGeo.center();
    const arrowMat = new THREE.MeshToonMaterial({ color: 0xffdf4d });
    this.startArrow = new THREE.Mesh(arrowGeo, arrowMat);
    this.startArrowBaseY = this.startCloudTopY + 0.38;
    this.startArrowBaseZ = -this.startCloudRadius + 1.25;
    this.startArrow.position.set(0, this.startArrowBaseY, this.startArrowBaseZ);
    this.startArrow.rotation.x = -Math.PI / 2;
    this.startCloudGroup.add(this.startArrow);
  }

  _buildLeaderboard() {
    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = 512;
    this.boardCanvas.height = 384;
    this.boardCtx = this.boardCanvas.getContext('2d');
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.encoding = THREE.sRGBEncoding;
    this._drawLeaderboardTexture(null);

    const boardGroup = new THREE.Group();
    boardGroup.position.set(2.85, this.startCloudTopY - 0.12, -1.35);
    boardGroup.rotation.y = -0.44;
    boardGroup.scale.setScalar(0.68);
    this.scene.add(boardGroup);

    const frameMat = new THREE.MeshToonMaterial({ color: 0x6f7fe8 });
    const creamMat = new THREE.MeshToonMaterial({ color: 0xfff8f0 });
    const postGeo = new THREE.CylinderGeometry(0.16, 0.19, 3.6, 12);

    const postL = new THREE.Mesh(postGeo, frameMat);
    postL.position.set(-1.75, 1.8, 0);
    boardGroup.add(postL);
    const postR = new THREE.Mesh(postGeo, frameMat);
    postR.position.set(1.75, 1.8, 0);
    boardGroup.add(postR);

    const capGeo = new THREE.SphereGeometry(0.24, 12, 10);
    const capMat = new THREE.MeshToonMaterial({ color: 0xffe066 });
    const capL = new THREE.Mesh(capGeo, capMat);
    capL.position.set(-1.75, 3.72, 0);
    boardGroup.add(capL);
    const capR = new THREE.Mesh(capGeo, capMat);
    capR.position.set(1.75, 3.72, 0);
    boardGroup.add(capR);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.55, 3.25, 0.24), frameMat);
    frame.position.set(0, 2.55, 0);
    boardGroup.add(frame);

    const innerFrame = new THREE.Mesh(new THREE.BoxGeometry(4.28, 3.0, 0.25), creamMat);
    innerFrame.position.set(0, 2.55, 0.01);
    boardGroup.add(innerFrame);

    const starOrnament = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.30, 0),
      new THREE.MeshToonMaterial({ color: 0xffd43b })
    );
    starOrnament.position.set(0, 4.38, 0.24);
    starOrnament.rotation.z = Math.PI / 4;
    boardGroup.add(starOrnament);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 2.75),
      new THREE.MeshBasicMaterial({ map: this.boardTex })
    );
    face.position.set(0, 2.55, 0.15);
    boardGroup.add(face);
  }

  _drawLeaderboardTexture(latestDist = null) {
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

    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#f4f6ff');
    bgGrad.addColorStop(1, '#fff9ee');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(130, 155, 255, 0.20)';
    for (let dy = 24; dy < h; dy += 36) {
      for (let dx = 24; dx < w; dx += 36) {
        ctx.beginPath();
        ctx.arc(dx + ((dy / 36) % 2) * 18, dy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    roundRectPath(12, 12, w - 24, h - 24, 24);
    ctx.strokeStyle = '#9aa8ff';
    ctx.lineWidth = 8;
    ctx.stroke();

    const headGrad = ctx.createLinearGradient(28, 24, w - 28, 24);
    headGrad.addColorStop(0, '#4d5fe0');
    headGrad.addColorStop(0.5, '#6a63f5');
    headGrad.addColorStop(1, '#9d7bff');
    roundRectPath(30, 24, w - 60, 62, 20);
    ctx.fillStyle = headGrad;
    ctx.fill();

    drawStar(64, 55, 14, 6.5, '#ffe875');
    drawStar(w - 64, 55, 14, 6.5, '#ffe875');

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 26px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FLY DISTANCE TOP 3', w * 0.5, 56);

    const rankColors = ['#f5b427', '#8aa0b8', '#d48653'];
    const rankBgColors = ['#fff5cc', '#eef4fb', '#fff0e6'];
    const rankLabels = ['1st', '2nd', '3rd'];
    let matchedHighlight = false;

    for (let i = 0; i < 3; i++) {
      const y = 132 + i * 78;
      const val = this.bestDistances[i];
      const isLatest = latestDist !== null && !matchedHighlight && typeof val === 'number' && Math.abs(val - latestDist) < 0.05;
      if (isLatest) matchedHighlight = true;

      roundRectPath(38, y - 28, w - 76, 62, 18);
      ctx.fillStyle = isLatest ? '#fff0ba' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = isLatest ? '#f5b427' : '#dfe6fb';
      ctx.lineWidth = isLatest ? 4 : 2.5;
      ctx.stroke();

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
        drawStar(114, y + 3, 10, 4.8, '#6a63f5');
      }

      ctx.fillStyle = '#363b5e';
      ctx.font = '900 32px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(typeof val === 'number' ? this.formatDistance(val) : '---.- m', w - 60, y + 4);
    }

    this.boardTex.needsUpdate = true;
  }

  _clearRings() {
    for (const r of this.rings) {
      this.scene.remove(r.group);
    }
    this.rings = [];
    for (const p of this.ringParticles) {
      this.scene.remove(p.mesh);
    }
    this.ringParticles = [];
    for (const c of this.bgClouds) {
      this.scene.remove(c.group);
    }
    this.bgClouds = [];
    for (const rk of this.fireworkRockets) {
      this.scene.remove(rk.mesh);
    }
    this.fireworkRockets = [];
    for (const fw of this.fireworkBursts) {
      this.scene.remove(fw.group);
    }
    this.fireworkBursts = [];
    for (const tr of this.flightTrails) {
      this.scene.remove(tr.mesh);
    }
    this.flightTrails = [];
    for (const sc of this.skyCoins) {
      this.scene.remove(sc.group);
    }
    this.skyCoins = [];
    this.nextRingZ = -18;
    this.nextBgCloudZ = -24;
    this.fireworkTimer = 0.25;
    this.lastRingX = 0;
    this.lastRingY = 3.2;
    this.ringSeq = 0;
  }

  _ensureBgCloudsAhead(playerZ) {
    while (this.nextBgCloudZ > playerZ - 210) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const isFarLarge = Math.random() < 0.26;
      const x = isFarLarge
        ? side * (42 + Math.random() * 30)
        : side * (14 + Math.random() * 20);
      const y = isFarLarge
        ? (-20 + Math.random() * 42)
        : (-16 + Math.random() * 30);
      const z = this.nextBgCloudZ;
      const scale = isFarLarge
        ? (2.3 + Math.random() * 1.3)
        : (0.85 + Math.random() * 0.8);

      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.scale.setScalar(scale);
      group.rotation.y = Math.random() * Math.PI * 2;

      // ワールドと同じく下面の影パーツ＋上面の立体パフを組み合わせる（不透明）
      const baseSpecs = [
        [0, -0.45, 0, 3.0, 1.05, 2.3],
        [-1.9, -0.55, 0.3, 2.1, 0.95, 1.8],
        [1.9, -0.55, -0.2, 2.2, 0.95, 1.9]
      ];
      for (const [px, py, pz, sx, sy, sz] of baseSpecs) {
        const m = new THREE.Mesh(this.bgCloudPuffGeo, this.bgCloudShadeMat);
        m.position.set(px, py, pz);
        m.scale.set(sx, sy, sz);
        group.add(m);
      }

      const topSpecs = [
        [0, 0.35, 0, 2.6, 1.45, 2.0],
        [-1.65, 0.05, 0.4, 1.95, 1.25, 1.65],
        [1.7, 0.1, -0.25, 2.05, 1.3, 1.75],
        [-0.65, 0.75, -0.35, 1.65, 1.2, 1.45],
        [0.85, 0.65, 0.45, 1.55, 1.15, 1.4]
      ];
      for (const [px, py, pz, sx, sy, sz] of topSpecs) {
        const m = new THREE.Mesh(this.bgCloudPuffGeo, this.bgCloudTopMat);
        m.position.set(px, py, pz);
        m.scale.set(sx, sy, sz);
        group.add(m);
      }

      this.scene.add(group);
      this.bgClouds.push({ group, z });
      this.nextBgCloudZ -= 18 + Math.random() * 14;
    }

    for (let i = this.bgClouds.length - 1; i >= 0; i--) {
      if (this.bgClouds[i].z > playerZ + 45) {
        this.scene.remove(this.bgClouds[i].group);
        this.bgClouds.splice(i, 1);
      }
    }
  }

  _spawnNextRing() {
    const dist = Math.max(0, -this.nextRingZ);
    const tier = Math.min(1.0, dist / 420);
    const midTier = Math.min(1.0, Math.max(0, dist - 500) / 450);
    const ultraTier = Math.min(1.0, Math.max(0, dist - 1000) / 800);

    const baseRadius = THREE.MathUtils.lerp(3.15, 2.20, tier);
    const radius = THREE.MathUtils.lerp(baseRadius, 1.35, ultraTier);
    const baseSpacing = THREE.MathUtils.lerp(18.5, 30.0, tier);
    const spacing = THREE.MathUtils.lerp(baseSpacing, 64.0, ultraTier) + (Math.random() - 0.5) * 4.0;
    const maxLat = THREE.MathUtils.lerp(4.0, 12.5, tier);
    const stepLat = THREE.MathUtils.lerp(3.8, 8.2, tier);
    const x = THREE.MathUtils.clamp(
      this.lastRingX + (Math.random() * 2 - 1) * stepLat,
      -maxLat,
      maxLat
    );

    const minY = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.6, -3.5, tier), -11.5, midTier);
    const maxY = THREE.MathUtils.lerp(THREE.MathUtils.lerp(6.5, 10.5, tier), 17.5, midTier);
    const stepY = THREE.MathUtils.lerp(3.0, 7.6, midTier);
    let deltaY = (Math.random() * 2 - 1) * stepY;
    if (midTier > 0.25 && Math.abs(deltaY) < stepY * 0.45) {
      deltaY = (deltaY >= 0 ? 1 : -1) * stepY * (0.55 + Math.random() * 0.45);
    }
    const y = THREE.MathUtils.clamp(this.lastRingY + deltaY, minY, maxY);

    const group = new THREE.Group();
    group.position.set(x, y, this.nextRingZ);

    const isGold = this.ringSeq % 4 === 3;
    const outerColor = isGold ? 0xffe169 : 0x8ae8ff;
    const innerColor = isGold ? 0xfff5b8 : 0xe4b8ff;

    const torusMat = new THREE.MeshBasicMaterial({
      color: outerColor,
      transparent: true,
      opacity: 0.92
    });
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.14, 12, 36),
      torusMat
    );
    group.add(torus);

    const innerMat = new THREE.MeshBasicMaterial({
      color: innerColor,
      transparent: true,
      opacity: 0.65
    });
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.84, 0.055, 8, 32),
      innerMat
    );
    group.add(innerRing);

    const discMat = new THREE.MeshBasicMaterial({
      color: outerColor,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.92, 24), discMat);
    group.add(disc);

    // 輪の周りに輝く星飾り（2つ）
    const starMat = new THREE.MeshBasicMaterial({
      color: isGold ? 0xffffff : 0xfff5aa,
      transparent: true,
      opacity: 0.95
    });
    const starGeo = new THREE.OctahedronGeometry(0.24, 0);
    const starA = new THREE.Mesh(starGeo, starMat);
    starA.position.set(radius, 0, 0);
    group.add(starA);
    const starB = new THREE.Mesh(starGeo, starMat);
    starB.position.set(-radius, 0, 0);
    group.add(starB);

    this.scene.add(group);

    // 距離が進むとゆっくり揺れ動く輪が出現
    let swayType = 'none';
    let swayAmp = 0;
    let swaySpeed = 0.65;
    if (dist > 140 && Math.random() < THREE.MathUtils.lerp(0.25, 0.65, tier)) {
      swayType = Math.random() < 0.5 ? 'x' : 'y';
      swayAmp = THREE.MathUtils.lerp(1.6, 3.4, tier);
      swaySpeed = 0.52 + Math.random() * 0.38;
    }

    this.rings.push({
      group,
      torusMat,
      innerMat,
      discMat,
      baseX: x,
      baseY: y,
      z: this.nextRingZ,
      radius,
      phase: Math.random() * Math.PI * 2,
      swayType,
      swayAmp,
      swaySpeed,
      collected: false,
      vanishTimer: 0
    });

    // 500m以降、輪と輪の間にたまに寄り道用のスカイを配置（少し離れたランダム位置）
    if (dist >= 500 && Math.random() < 0.42) {
      const midZ = this.nextRingZ + spacing * 0.5;
      const sideDir = Math.random() < 0.5 ? -1 : 1;
      const offsetX = sideDir * (5.5 + Math.random() * 6.0);
      const offsetY = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 4.5);
      const cx = THREE.MathUtils.clamp((this.lastRingX + x) * 0.5 + offsetX, -15, 15);
      const cy = THREE.MathUtils.clamp((this.lastRingY + y) * 0.5 + offsetY, -12, 18);

      const coinGroup = new THREE.Group();
      coinGroup.position.set(cx, cy, midZ);

      const mesh = new THREE.Mesh(this.skyCoinGeo, this.skyCoinMat);
      coinGroup.add(mesh);

      const glowMat = new THREE.SpriteMaterial({
        map: this.sparkGlowTex,
        color: 0xffe878,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(2.4);
      coinGroup.add(glow);

      this.scene.add(coinGroup);
      this.skyCoins.push({
        group: coinGroup,
        mesh,
        baseY: cy,
        z: midZ,
        phase: Math.random() * Math.PI * 2,
        collected: false
      });
    }

    this.lastRingX = x;
    this.lastRingY = y;
    this.nextRingZ -= spacing;
    this.ringSeq++;
  }

  _ensureRingsAhead(playerZ) {
    while (this.nextRingZ > playerZ - 210) {
      this._spawnNextRing();
    }
    // 後方の不要な輪を掃除
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (r.z > playerZ + 38 || (r.collected && r.vanishTimer >= 0.35)) {
        this.scene.remove(r.group);
        this.rings.splice(i, 1);
      }
    }
    // 後方の不要なスカイを掃除
    for (let i = this.skyCoins.length - 1; i >= 0; i--) {
      const sc = this.skyCoins[i];
      if (sc.collected || sc.z > playerZ + 35) {
        this.scene.remove(sc.group);
        this.skyCoins.splice(i, 1);
      }
    }
  }

  _spawnRingBurst(pos, color) {
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), mat);
      mesh.position.copy(pos);
      const ang = (i / 10) * Math.PI * 2;
      const spd = 4.0 + Math.random() * 4.0;
      this.scene.add(mesh);
      this.ringParticles.push({
        mesh,
        mat,
        vel: new THREE.Vector3(Math.cos(ang) * spd, (Math.random() - 0.2) * 4.5, Math.sin(ang) * spd * 0.5),
        life: 0,
        maxLife: 0.45
      });
    }
  }

  startNewRun(player) {
    this._clearRings();
    this.runState = 'intro_fall';
    this.currentDistance = 0;
    this.finalDistance = 0;
    this.isNewRecord = false;
    this.resultTimer = 0;
    this.hasLeftStartCloud = false;
    this.boostTimer = 0;
    this.camYawOffset = 0;
    this.camPitchOffset = 0;

    // スタート地点の雲の少し上から落下して着地する
    const startPos = new THREE.Vector3(0, 9.6, 1.8);
    player.facingYaw = 0;
    player.resetTo(startPos);
    player.velocity.set(0, -2.5, 0);
    player.airJumpsLeft = player.getMaxAirJumps();

    this._ensureRingsAhead(startPos.z);
    this._ensureBgCloudsAhead(startPos.z);
    this._drawLeaderboardTexture(null);
  }

  _spawnFireworkBurst(cx, cy, cz, sound) {
    const palettes = [
      [0xff7eb6, 0xffe066, 0x7af5ff, 0xffffff],
      [0x7af5ff, 0xc792ff, 0xff9ad5, 0xfff5aa],
      [0xffe066, 0xff708d, 0x9effc6, 0xffffff],
      [0xc792ff, 0x72f2eb, 0xffb36b, 0xffe885],
      [0xff6ec7, 0xffe66d, 0x5ce1e6, 0xa8ff9e]
    ];
    const scheme = palettes[Math.floor(Math.random() * palettes.length)];
    const schemeColors = scheme.map((hex) => new THREE.Color(hex));

    if (sound && typeof sound.playFirework === 'function') {
      sound.playFirework(1.0);
    }

    const group = new THREE.Group();
    const count = 180;
    const dirs = [];
    const speeds = [];
    const pointPositions = new Float32Array(count * 3);
    const pointColors = new Float32Array(count * 3);

    const trailGeo = new THREE.CylinderGeometry(0.065, 0.015, 1, 5);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const trailMesh = new THREE.InstancedMesh(trailGeo, trailMat, count);
    trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(trailMesh);

    const tmpColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // フィボナッチ球面分布＋少しランダムで綺麗な球状開花
      const y = 1 - (i / (count - 1)) * 2;
      const rXZ = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * 2.399963 + (Math.random() - 0.5) * 0.22;
      const dx = Math.cos(theta) * rXZ;
      const dz = Math.sin(theta) * rXZ;
      const dir = new THREE.Vector3(dx, y, dz).normalize();
      dirs.push(dir);

      const layer = i % 3;
      const spd = (layer === 0 ? 18.5 : layer === 1 ? 13.8 : 9.4) + (Math.random() - 0.5) * 2.2;
      speeds.push(spd);

      // 粒ごとにパレット色＋わずかな色相バリエーションを持たせる
      tmpColor.copy(schemeColors[(i + Math.floor(Math.random() * 2)) % schemeColors.length]);
      tmpColor.offsetHSL((Math.random() - 0.5) * 0.05, 0, 0);

      trailMesh.setColorAt(i, tmpColor);

      pointColors[i * 3 + 0] = tmpColor.r;
      pointColors[i * 3 + 1] = tmpColor.g;
      pointColors[i * 3 + 2] = tmpColor.b;

      pointPositions[i * 3 + 0] = cx;
      pointPositions[i * 3 + 1] = cy;
      pointPositions[i * 3 + 2] = cz;
    }
    if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true;

    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
    ptsGeo.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));
    const ptsMat = new THREE.PointsMaterial({
      size: 1.25,
      map: this.sparkGlowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(ptsGeo, ptsMat);
    group.add(pts);

    this.scene.add(group);
    this.fireworkBursts.push({
      group,
      origin: new THREE.Vector3(cx, cy, cz),
      dirs,
      speeds,
      trailGeo,
      trailMat,
      trailMesh,
      ptsGeo,
      ptsMat,
      life: 0,
      maxLife: 2.75
    });
  }

  _updateFireworks(dt, playerPos, sound) {
    const inZone =
      this.runState === 'flying' &&
      ((this.currentDistance >= 200 && this.currentDistance <= 400) || this.currentDistance >= 1000);
    if (inZone) {
      this.fireworkTimer -= dt;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 2.0 + Math.random() * 1.2;
        const tx = playerPos.x + (Math.random() - 0.5) * 14;
        const ty = playerPos.y + 1.5 + (Math.random() - 0.5) * 6;
        const tz = playerPos.z - 22 - Math.random() * 14;

        // 打ち上げ玉（下から光の尾を引いて上昇して爆発）
        const mat = new THREE.MeshBasicMaterial({
          color: 0xfff5aa,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), mat);
        mesh.position.set(tx, ty - 11, tz);
        this.scene.add(mesh);
        this.fireworkRockets.push({
          mesh,
          mat,
          targetX: tx,
          targetY: ty,
          targetZ: tz,
          life: 0,
          maxLife: 0.30
        });
      }
    }

    for (let i = this.fireworkRockets.length - 1; i >= 0; i--) {
      const rk = this.fireworkRockets[i];
      rk.life += dt;
      const t = Math.min(1, rk.life / rk.maxLife);
      rk.mesh.position.y = THREE.MathUtils.lerp(rk.targetY - 11, rk.targetY, t);
      if (t >= 1) {
        this.scene.remove(rk.mesh);
        this.fireworkRockets.splice(i, 1);
        this._spawnFireworkBurst(rk.targetX, rk.targetY, rk.targetZ, sound);
      }
    }

    const upVec = new THREE.Vector3(0, 1, 0);
    const headVec = new THREE.Vector3();
    const tailVec = new THREE.Vector3();
    const diffVec = new THREE.Vector3();
    const midVec = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3(1, 1, 1);

    for (let i = this.fireworkBursts.length - 1; i >= 0; i--) {
      const b = this.fireworkBursts[i];
      b.life += dt;
      const t = b.life / b.maxLife;
      if (t >= 1) {
        this.scene.remove(b.group);
        b.trailGeo.dispose();
        b.trailMat.dispose();
        b.ptsGeo.dispose();
        b.ptsMat.dispose();
        this.fireworkBursts.splice(i, 1);
        continue;
      }

      const pPos = b.ptsGeo.attributes.position.array;
      // ゆっくり優雅に広がり、尾がしなやかに追従する
      const headScale = 1 - Math.pow(1 - t, 2.2);
      const tailT = Math.max(0, t - 0.16);
      const tailScale = 1 - Math.pow(1 - tailT, 2.0);
      const gravityDropHead = 4.6 * t * t;
      const gravityDropTail = 4.6 * tailT * tailT;

      for (let j = 0; j < b.dirs.length; j++) {
        const dir = b.dirs[j];
        const distHead = b.speeds[j] * headScale;
        const distTail = b.speeds[j] * tailScale;

        headVec.set(
          b.origin.x + dir.x * distHead,
          b.origin.y + dir.y * distHead - gravityDropHead,
          b.origin.z + dir.z * distHead
        );
        tailVec.set(
          b.origin.x + dir.x * distTail,
          b.origin.y + dir.y * distTail - gravityDropTail,
          b.origin.z + dir.z * distTail
        );

        pPos[j * 3 + 0] = headVec.x;
        pPos[j * 3 + 1] = headVec.y;
        pPos[j * 3 + 2] = headVec.z;

        diffVec.subVectors(headVec, tailVec);
        const len = diffVec.length();
        if (len > 0.001) {
          midVec.addVectors(headVec, tailVec).multiplyScalar(0.5);
          diffVec.divideScalar(len);
          quat.setFromUnitVectors(upVec, diffVec);
          scaleVec.set(1, len, 1);
          this._tmpMatrix = this._tmpMatrix || new THREE.Matrix4();
          this._tmpMatrix.compose(midVec, quat, scaleVec);
          b.trailMesh.setMatrixAt(j, this._tmpMatrix);
        }
      }

      b.trailMesh.instanceMatrix.needsUpdate = true;
      b.ptsGeo.attributes.position.needsUpdate = true;

      const fade = t < 0.65 ? 1.0 : Math.max(0, 1 - (t - 0.65) / 0.35);
      b.trailMat.opacity = 0.52 * fade;
      b.ptsMat.opacity = 0.62 * fade;
    }
  }

  _updateShootingStars(dt, centerPos) {
    const isMeteorShower = this.runState === 'flying' && this.currentDistance >= 500;
    this.shootingStarTimer -= dt;
    if (this.shootingStarTimer <= 0) {
      this.shootingStarTimer = isMeteorShower ? (0.08 + Math.random() * 0.10) : (2.6 + Math.random() * 3.4);
      const spawnCount = isMeteorShower ? 2 : 1;
      const showerColors = [0xff8fd4, 0x7af5ff, 0xffe478, 0xc99eff, 0x9effc6, 0xffa67a];

      // 全て右上から左下に向かって同じ方向に流れる統一ベクトル
      const flowDir = new THREE.Vector3(-0.80, -0.58, 0.12).normalize();
      const angleZ = Math.atan2(flowDir.y, flowDir.x);

      for (let n = 0; n < spawnCount; n++) {
        const starColor = isMeteorShower
          ? showerColors[Math.floor(Math.random() * showerColors.length)]
          : 0xfff3b0;

        const group = new THREE.Group();
        const sx = centerPos.x + 15 + (Math.random() - 0.35) * 140;
        const sy = centerPos.y + 30 + Math.random() * 48;
        const sz = centerPos.z - 65 - Math.random() * 85;
        group.position.set(sx, sy, sz);

        const tailLen = isMeteorShower ? (13 + Math.random() * 7) : 9.5;
        const tailWidth = isMeteorShower ? (0.95 + Math.random() * 0.45) : 0.75;
        const tailMat = new THREE.MeshBasicMaterial({
          map: this.meteorTailTex,
          color: starColor,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        });
        const tailMesh = new THREE.Mesh(new THREE.PlaneGeometry(tailLen, tailWidth), tailMat);
        tailMesh.position.x = -tailLen * 0.48;
        tailMesh.rotation.z = 0;
        group.add(tailMesh);

        const headMat = new THREE.SpriteMaterial({
          map: this.sparkGlowTex,
          color: 0xffffff,
          transparent: true,
          opacity: 1.0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const headSprite = new THREE.Sprite(headMat);
        headSprite.scale.setScalar(isMeteorShower ? 2.6 : 2.1);
        group.add(headSprite);

        group.rotation.z = angleZ;
        this.scene.add(group);

        const speed = isMeteorShower ? (58 + Math.random() * 22) : 48;
        this.shootingStars.push({
          group,
          tailMat,
          headMat,
          vx: flowDir.x * speed,
          vy: flowDir.y * speed,
          vz: flowDir.z * speed,
          life: 0,
          maxLife: isMeteorShower ? 1.25 : 1.0
        });
      }
    }

    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      s.life += dt;
      s.group.position.x += s.vx * dt;
      s.group.position.y += s.vy * dt;
      s.group.position.z += s.vz * dt;
      const t = s.life / s.maxLife;
      const alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
      s.tailMat.opacity = 0.95 * alpha;
      s.headMat.opacity = alpha;
      if (t >= 1) {
        this.scene.remove(s.group);
        this.shootingStars.splice(i, 1);
      }
    }
  }

  update(dt, player, controls, physics, sound, sendSeFn) {
    this.time += dt;
    this.starUniforms.uTime.value = this.time;
    this.skyFollowGroup.position.copy(player.position);
    this._updateShootingStars(dt, player.position);
    this._updateFireworks(dt, player.position, sound);
    this._ensureBgCloudsAhead(player.position.z);

    // 飛行中の星屑トレイル
    if (this.runState === 'flying') {
      this.flightTrailTimer -= dt;
      if (this.flightTrailTimer <= 0) {
        this.flightTrailTimer = this.boostTimer > 0 ? 0.035 : 0.075;
        const mat = new THREE.SpriteMaterial({
          map: this.sparkGlowTex,
          color: this.boostTimer > 0 ? 0xffe878 : 0xb8d8ff,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const sp = new THREE.Sprite(mat);
        sp.position.set(
          player.position.x + (Math.random() - 0.5) * 0.55,
          player.position.y + (Math.random() - 0.5) * 0.4,
          player.position.z + 0.4
        );
        sp.scale.setScalar(this.boostTimer > 0 ? 0.85 : 0.55);
        this.scene.add(sp);
        this.flightTrails.push({ mesh: sp, mat, life: 0, maxLife: 0.45 });
      }
    }
    for (let i = this.flightTrails.length - 1; i >= 0; i--) {
      const tr = this.flightTrails[i];
      tr.life += dt;
      const t = tr.life / tr.maxLife;
      tr.mat.opacity = Math.max(0, 0.75 * (1 - t));
      tr.mesh.scale.setScalar(Math.max(0.1, 0.75 * (1 - t * 0.7)));
      if (t >= 1) {
        this.scene.remove(tr.mesh);
        this.flightTrails.splice(i, 1);
      }
    }
    if (this.startArrow) {
      this.startArrow.position.y = this.startArrowBaseY + Math.sin(this.time * 2.4) * 0.12;
      this.startArrow.position.z = this.startArrowBaseZ - Math.sin(this.time * 2.4) * 0.18;
    }

    let justFinished = false;
    let shouldReturnCastle = false;
    let gotSky = 0;

    if (this.runState === 'intro_fall') {
      player.velocity.y = Math.max(player.velocity.y - 24 * dt, -14);
      player.position.addScaledVector(player.velocity, dt);
      const groundY = this.startCloudTopY + player.radius;
      if (player.position.y <= groundY) {
        player.position.y = groundY;
        player.velocity.set(0, 0, 0);
        player.isGrounded = true;
        player.airJumpsLeft = player.getMaxAirJumps();
        player.triggerSquash(0.68);
        player.setExpression('land', 0.25);
        sound.playLand();
        this.runState = 'ready';
      }
      player.updateVisuals(dt, this.getShadowGroundInfo(player.position.x, player.position.y, player.position.z));
      return {
        distance: 0,
        airJumpsLeft: player.airJumpsLeft,
        maxAirJumps: player.getMaxAirJumps(),
        justFinished: false,
        shouldReturnCastle: false,
        gotSky: 0
      };
    }

    if (this.runState === 'result_wait') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        shouldReturnCastle = true;
      }
      // 落下後も少し余韻でゆっくり落ちる
      player.velocity.y = Math.max(player.velocity.y - 10 * dt, -7.6);
      player.position.addScaledVector(player.velocity, dt);
      player.updateVisuals(dt, null);
      return {
        distance: this.finalDistance,
        airJumpsLeft: player.airJumpsLeft,
        maxAirJumps: player.getMaxAirJumps(),
        justFinished: false,
        shouldReturnCastle,
        gotSky: 0
      };
    }

    // 通常操作（'ready' または 'flying'）
    const move = controls.getMoveVector();
    const inputMag = Math.min(1, Math.hypot(move.x, move.y));
    const jumpPressed = controls.consumeJump();
    if (jumpPressed) {
      player.jumpBufferTimer = 0.14;
    } else if (player.jumpBufferTimer > 0) {
      player.jumpBufferTimer -= dt;
    }

    physics.stepMovement(
      player,
      move,
      inputMag,
      this.camYawOffset,
      dt,
      sound,
      sendSeFn,
      false
    );

    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      const boostFactor = this.boostTimer / 0.85;
      const targetBoostVz = -16.8 * (0.65 + 0.35 * boostFactor);
      if (player.velocity.z > targetBoostVz) {
        player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, targetBoostVz, Math.min(1, dt * 8));
      }
    }

    const wasGrounded = player.isGrounded;
    player.isGrounded = false;
    player.groundCloud = null;

    // スタート地点の雲との衝突判定
    const rx = this.startCloudRadius;
    const ry = this.startCloudTopY;
    const rz = this.startCloudRadius;
    const dx = player.position.x - this.startCloudCenter.x;
    const dy = player.position.y - this.startCloudCenter.y;
    const dz = player.position.z - this.startCloudCenter.z;
    const k0 = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry) + (dz / rz) * (dz / rz));
    if (k0 > 0.0001) {
      const sx = dx / k0;
      const sy = dy / k0;
      const sz = dz / k0;
      const nxRaw = dx / (rx * rx);
      const nyRaw = dy / (ry * ry);
      const nzRaw = dz / (rz * rz);
      const nLen = Math.hypot(nxRaw, nyRaw, nzRaw) || 1;
      const nx = nxRaw / nLen;
      const ny = nyRaw / nLen;
      const nz = nzRaw / nLen;
      const distSurf = Math.hypot(dx - sx, dy - sy, dz - sz);
      let pen = 0;
      if (k0 >= 1.0) {
        if (distSurf < player.radius) pen = player.radius - distSurf;
      } else {
        pen = player.radius + distSurf;
      }
      if (pen > 0) {
        player.position.x += nx * pen;
        player.position.y += ny * pen;
        player.position.z += nz * pen;
        const vn = player.velocity.x * nx + player.velocity.y * ny + player.velocity.z * nz;
        if (vn < 0) {
          player.velocity.x -= nx * vn;
          player.velocity.y -= ny * vn;
          player.velocity.z -= nz * vn;
        }
        if (ny > 0.45) {
          player.isGrounded = true;
          player.airJumpsLeft = player.getMaxAirJumps();
          if (!wasGrounded && vn < -4.5) {
            player.triggerSquash(0.66);
            player.setExpression('land', 0.25);
            sound.playLand();
          }
        }
      }
    }

    // 雲から離れたら距離計測スタート
    if (this.runState === 'ready') {
      const horizFromCloud = Math.hypot(player.position.x, player.position.z);
      if (!player.isGrounded && (horizFromCloud > this.startCloudRadius - 0.2 || player.position.z < -this.startCloudRadius * 0.7)) {
        this.runState = 'flying';
        this.hasLeftStartCloud = true;
      }
    }

    if (this.runState === 'flying') {
      this.currentDistance = Math.max(this.currentDistance, Math.max(0, -player.position.z));
    }

    // 光の輪の更新・くぐり判定（手前3つだけ表示し、近づくと見えてくる）
    this._ensureRingsAhead(player.position.z);
    let visibleAheadCount = 0;
    for (const r of this.rings) {
      if (r.collected) {
        r.group.visible = true;
        r.vanishTimer += dt;
        const t = Math.min(1, r.vanishTimer / 0.35);
        r.group.scale.setScalar(1 + t * 0.75);
        r.torusMat.opacity = (1 - t) * 0.92;
        r.innerMat.opacity = (1 - t) * 0.65;
        r.discMat.opacity = (1 - t) * 0.14;
        continue;
      }

      if (r.z <= player.position.z + 2.5) {
        if (visibleAheadCount < 3) {
          r.group.visible = true;
          const distAhead = Math.max(0, player.position.z - r.z);
          const fadeAlpha = visibleAheadCount === 2
            ? THREE.MathUtils.clamp(1.0 - (distAhead - 35) / 45, 0.28, 1.0)
            : 1.0;
          r.torusMat.opacity = 0.92 * fadeAlpha;
          r.innerMat.opacity = 0.65 * fadeAlpha;
          r.discMat.opacity = 0.14 * fadeAlpha;
          visibleAheadCount++;
        } else {
          r.group.visible = false;
        }
      } else {
        r.group.visible = true;
      }

      if (r.swayType === 'x') {
        r.group.position.x = r.baseX + Math.sin(this.time * r.swaySpeed + r.phase) * r.swayAmp;
      } else if (r.swayType === 'y') {
        r.group.position.y = r.baseY + Math.sin(this.time * r.swaySpeed + r.phase) * r.swayAmp;
      }
      r.group.rotation.z = this.time * 0.9 + r.phase;

      // 輪をくぐったかチェック（Z平面付近かつ半径内）
      const rdz = Math.abs(player.position.z - r.z);
      if (rdz <= 1.35) {
        const rdx = player.position.x - r.group.position.x;
        const rdy = player.position.y - r.group.position.y;
        const hitR = r.radius + player.radius * 0.75;
        if (rdx * rdx + rdy * rdy <= hitR * hitR) {
          r.collected = true;
          r.vanishTimer = 0;
          player.airJumpsLeft = player.getMaxAirJumps();
          this.boostTimer = 0.85;
          player.velocity.z = Math.min(player.velocity.z, -16.8);
          player.velocity.y = Math.max(player.velocity.y, 4.2);
          player.setExpression('happy', 0.65);
          player.triggerSquash(1.26);
          sound.playRingPass();
          this._spawnRingBurst(r.group.position, 0xfff088);
        }
      }
    }

    // 寄り道スカイの回転・取得判定
    for (const sc of this.skyCoins) {
      if (sc.collected) continue;
      sc.mesh.rotation.y = this.time * 2.4 + sc.phase;
      sc.group.position.y = sc.baseY + Math.sin(this.time * 2.2 + sc.phase) * 0.35;
      const distSq = sc.group.position.distanceToSquared(player.position);
      const hitR = player.radius + 1.15;
      if (distSq <= hitR * hitR) {
        sc.collected = true;
        sc.group.visible = false;
        gotSky += 1;
        player.setExpression('happy', 0.45);
        this._spawnRingBurst(sc.group.position, 0xffe878);
      }
    }

    // 輪パーティクル更新
    for (let i = this.ringParticles.length - 1; i >= 0; i--) {
      const p = this.ringParticles[i];
      p.life += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 5;
      const t = p.life / p.maxLife;
      p.mat.opacity = Math.max(0, 1 - t);
      p.mesh.scale.setScalar(Math.max(0.1, 1 - t * 0.6));
      if (t >= 1) {
        this.scene.remove(p.mesh);
        this.ringParticles.splice(i, 1);
      }
    }

    // 落下判定
    if (player.position.y < -25) {
      this.runState = 'result_wait';
      this.finalDistance = Math.round(this.currentDistance * 10) / 10;
      this.isNewRecord = this.recordBestDistance(this.finalDistance);
      this.resultTimer = 2.6;
      justFinished = true;
      sound.playFlyResult(this.isNewRecord);
    }

    player.updateVisuals(dt, this.getShadowGroundInfo(player.position.x, player.position.y, player.position.z));

    return {
      distance: this.currentDistance,
      airJumpsLeft: player.airJumpsLeft,
      maxAirJumps: player.getMaxAirJumps(),
      justFinished,
      shouldReturnCastle,
      gotSky
    };
  }

  getShadowGroundInfo(px, py, pz) {
    if (Math.hypot(px, pz) <= this.startCloudRadius + 0.3 && py >= this.startCloudTopY - 0.5) {
      return { y: this.startCloudTopY, normal: new THREE.Vector3(0, 1, 0) };
    }
    return null;
  }

  updateCamera(camera, lookTarget, player, dt) {
    this._tmpVec1.set(
      player.position.x,
      player.position.y + 0.9,
      player.position.z
    );
    lookTarget.lerp(this._tmpVec1, Math.min(1, dt * 10));

    const pitch = THREE.MathUtils.clamp(-0.10 + this.camPitchOffset, -0.45, 0.78);
    const dist = 10.8;
    const horizDist = Math.cos(pitch) * dist;
    const vertDist = Math.sin(pitch) * dist;

    const camX = lookTarget.x + Math.sin(this.camYawOffset) * horizDist;
    const camY = lookTarget.y + vertDist;
    const camZ = lookTarget.z + Math.cos(this.camYawOffset) * horizDist;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(lookTarget);
  }
}
