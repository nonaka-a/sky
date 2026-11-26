class SkyWorld {
  constructor(scene) {
    this.scene = scene;
    this.chunkSize = 48;
    this.activeRadiusChunks = 2; // 周囲 5x5 チャンクを表示
    this.clouds = [];
    this.chunks = new Map();
    this.structures = [];
    this.rainbowBridges = [];
    this.bridgeIds = new Set();
    this.contrails = [];
    this.time = 0;
    this._tmpShadowNormal = new THREE.Vector3();
    this._tmpBridgeNormal = new THREE.Vector3();

    this.puffGeo = new THREE.SphereGeometry(1, 20, 16);
    this.starGeo = new THREE.OctahedronGeometry(0.55, 0);

    this.materials = {
      normal: new THREE.MeshToonMaterial({ color: 0xffffff }),
      normalShade: new THREE.MeshToonMaterial({ color: 0xedf6ff }),
      bouncy: new THREE.MeshToonMaterial({ color: 0xff70a6 }),
      moving: new THREE.MeshToonMaterial({ color: 0x8ae0ff }),
      yellow: new THREE.MeshToonMaterial({ color: 0xffe878 }),
      yellowShade: new THREE.MeshToonMaterial({ color: 0xfad45a }),
      island: new THREE.MeshToonMaterial({ color: 0xffffff }),
      gold: new THREE.MeshToonMaterial({ color: 0xffd166 })
    };

    this.rainbowMaterial = this._createRainbowMaterial();
    this.buildingBuilder = new CloudBuildingBuilder();

    this._createSkyEnvironment();
    this._createContrails();

    // お城の浮島（スタート地点正面から見える位置に常駐）
    this.castleIsland = this.addStructure(new CastleIsland(new THREE.Vector3(0, 3.5, -74)));

    // スタート地点後方の巨大な入道雲（登山できる）
    this.cumulonimbus = this.addStructure(new CumulonimbusCloud(new THREE.Vector3(0, 0, 165)));

    // お城の左右の噴水雲＋お城と繋ぐ虹の橋
    this.leftFountainCloud = this.addStructure(
      new FountainCloud('fountain_left', new THREE.Vector3(-26.5, 4.4, -72))
    );
    this.rightFountainCloud = this.addStructure(
      new FountainCloud('fountain_right', new THREE.Vector3(26.5, 4.4, -72))
    );

    const leftCastleBridge = new RainbowBridge(
      'castle|fountain_left',
      new THREE.Vector3(-11.9, 4.62, -72.5),
      new THREE.Vector3(-20.2, 4.95, -72.0),
      this.rainbowMaterial,
      null,
      null
    );
    this.scene.add(leftCastleBridge.mesh);
    this.rainbowBridges.push(leftCastleBridge);
    this.bridgeIds.add('castle|fountain_left');

    const rightCastleBridge = new RainbowBridge(
      'castle|fountain_right',
      new THREE.Vector3(11.9, 4.62, -72.5),
      new THREE.Vector3(20.2, 4.95, -72.0),
      this.rainbowMaterial,
      null,
      null
    );
    this.scene.add(rightCastleBridge.mesh);
    this.rainbowBridges.push(rightCastleBridge);
    this.bridgeIds.add('castle|fountain_right');

    // ワールドに1人だけのハートちゃんとスターくんを生成
    this.heartBuddy = new HeartBuddy(new THREE.Vector3(16, 5.5, -42));
    this.scene.add(this.heartBuddy.group);

    this.starBuddy = new StarBuddy(new THREE.Vector3(15, 4.0, 4));
    this.scene.add(this.starBuddy.group);
    this.scene.add(this.starBuddy.dropShadow);

    // モブの天使（計10体：お城の島に1体＋周囲の雲に9体）
    this.angels = [];
    this.angels.push(
      new AngelMob(this.scene, {
        homeType: 'castle',
        castleIsland: this.castleIsland,
        localX: -2.4,
        localZ: 6.4
      })
    );
    for (let i = 0; i < 9; i++) {
      this.angels.push(new AngelMob(this.scene, { homeType: 'cloud' }));
    }
  }

  addStructure(structure) {
    this.structures.push(structure);
    this.scene.add(structure.group);
    return structure;
  }

  _createRainbowMaterial() {
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
    return new THREE.MeshToonMaterial({
      map: tex,
      transparent: true,
      opacity: 0.93
    });
  }

  _createSkyEnvironment() {
    const skyGeo = new THREE.SphereGeometry(300, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x5ec8ff) },
        midColor: { value: new THREE.Color(0xcff2ff) },
        bottomColor: { value: new THREE.Color(0xffe6f2) }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = mix(midColor, topColor, smoothstep(0.0, 0.65, h));
          col = mix(bottomColor, col, smoothstep(-0.35, 0.05, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    this.scene.fog = new THREE.Fog(0xd8f4ff, 54, 124);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffd4eb, 0.85);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfffdf5, 0.75);
    dir.position.set(25, 45, 20);
    this.scene.add(dir);
  }

  _createContrailTexture() {
    const w = 512;
    const h = 64;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, w, h);

    // 尾端（左）は淡く広がり、先端（右）に向かって細く白い飛行機雲の筋を描く
    const steps = 110;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = 12 + t * (w - 28);
      const yJitter = Math.sin(t * 28.0) * (1 - t) * 2.2 + Math.cos(t * 17.0) * (1 - t) * 1.4;
      const y = h * 0.5 + yJitter;

      const r = THREE.MathUtils.lerp(22, 5.5, Math.pow(t, 0.75));
      const alpha = Math.sin(Math.pow(t, 0.65) * Math.PI * 0.94) * (0.14 + t * 0.24);

      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0.0, `rgba(255, 255, 255, ${Math.min(0.65, alpha * 1.5)})`);
      grad.addColorStop(0.45, `rgba(255, 255, 255, ${alpha * 0.75})`);
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  _createContrails() {
    this.contrailGroup = new THREE.Group();
    this.scene.add(this.contrailGroup);

    const tex = this._createContrailTexture();
    const specs = [
      {
        length: 230,
        width: 7.2,
        dist: 170,
        height: 52,
        anchorAngle: -0.45,
        yaw: 0.35,
        pitch: 0.08,
        speed: 3.4,
        phase: 0.15,
        baseOpacity: 0.88
      },
      {
        length: 260,
        width: 8.0,
        dist: 185,
        height: 64,
        anchorAngle: 1.95,
        yaw: -0.85,
        pitch: 0.06,
        speed: 2.9,
        phase: 0.52,
        baseOpacity: 0.82
      },
      {
        length: 205,
        width: 6.4,
        dist: 162,
        height: 44,
        anchorAngle: -2.35,
        yaw: 1.45,
        pitch: -0.05,
        speed: 3.8,
        phase: 0.78,
        baseOpacity: 0.78
      }
    ];

    const dotGeo = new THREE.SphereGeometry(0.48, 8, 6);

    for (const s of specs) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: s.baseOpacity,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      });

      const planeGeo = new THREE.PlaneGeometry(s.length, s.width);
      const ribbonA = new THREE.Mesh(planeGeo, mat);
      const ribbonB = new THREE.Mesh(planeGeo, mat);
      ribbonB.rotation.x = Math.PI / 2;

      const trailHolder = new THREE.Group();
      trailHolder.add(ribbonA);
      trailHolder.add(ribbonB);

      // 先端（+X側）に小さな飛行機のキラッとした点
      const leadMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: s.baseOpacity,
        fog: false
      });
      const leadDot = new THREE.Mesh(dotGeo, leadMat);
      leadDot.position.set(s.length * 0.485, 0, 0);
      trailHolder.add(leadDot);

      trailHolder.rotation.order = 'YXZ';
      trailHolder.rotation.y = s.yaw;
      trailHolder.rotation.z = s.pitch;

      this.contrailGroup.add(trailHolder);
      this.contrails.push({
        holder: trailHolder,
        mat,
        leadMat,
        spec: s,
        dirX: Math.cos(s.yaw),
        dirZ: -Math.sin(s.yaw),
        baseX: Math.sin(s.anchorAngle) * s.dist,
        baseZ: -Math.cos(s.anchorAngle) * s.dist
      });
    }
  }

  _updateContrails(playerPos) {
    this.contrailGroup.position.set(playerPos.x, 0, playerPos.z);

    const cycleSpan = 340;
    for (const c of this.contrails) {
      const s = c.spec;
      const t = (this.time * (s.speed / cycleSpan) + s.phase) % 1.0;
      const offsetAlong = (t - 0.5) * cycleSpan;

      c.holder.position.set(
        c.baseX + c.dirX * offsetAlong,
        s.height + offsetAlong * Math.sin(s.pitch) * 0.35,
        c.baseZ + c.dirZ * offsetAlong
      );

      // 周期の最初と最後だけ自然にフェードさせて途切れをなくす
      const edgeFade = Math.min(1.0, Math.min(t / 0.12, (1.0 - t) / 0.12));
      const op = s.baseOpacity * edgeFade;
      c.mat.opacity = op;
      c.leadMat.opacity = op;
    }
  }

  _hash(x, z, seed = 0) {
    let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  syncTime(hostTime) {
    if (typeof hostTime === 'number') {
      if (Math.abs(hostTime - this.time) > 0.5) {
        this.time = hostTime;
      } else {
        this.time = THREE.MathUtils.lerp(this.time, hostTime, 0.25);
      }
    }
  }

  _assignHeartHomeCloud(playerPos) {
    let bestCloud = null;
    let bestScore = Infinity;

    for (const cloud of this.clouds) {
      if (cloud.type !== 'island') continue;
      if (cloud.isHeartHome) {
        this.heartBuddy.setHomeCloud(cloud, this.heartBuddy.homeCloud === null);
        return;
      }

      const d = Math.hypot(cloud.position.x - playerPos.x, cloud.position.z - playerPos.z);
      const score = Math.abs(d - 50);
      if (d > 22 && score < bestScore) {
        bestScore = score;
        bestCloud = cloud;
      }
    }

    if (bestCloud) {
      this.heartBuddy.setHomeCloud(bestCloud, this.heartBuddy.homeCloud === null);
    }
  }

  _assignStarHomeCloud(playerPos) {
    let bestCloud = null;
    let bestScore = Infinity;

    for (const cloud of this.clouds) {
      if (cloud.type === 'bouncy' || cloud.type === 'yellow') continue;
      const d = Math.hypot(cloud.position.x - playerPos.x, cloud.position.z - playerPos.z);
      const score = Math.abs(d - 36);
      if (d > 14 && score < bestScore) {
        bestScore = score;
        bestCloud = cloud;
      }
    }

    if (bestCloud) {
      this.starBuddy.placeOnCloud(bestCloud);
    }
  }

  _syncStructureRainbowBridges() {
    for (let i = this.rainbowBridges.length - 1; i >= 0; i--) {
      const br = this.rainbowBridges[i];
      const hasA = !br.cloudA || this.clouds.includes(br.cloudA);
      const hasB = !br.cloudB || this.clouds.includes(br.cloudB);
      if (!hasA || !hasB) {
        this.scene.remove(br.mesh);
        br.dispose();
        this.bridgeIds.delete(br.id);
        this.rainbowBridges.splice(i, 1);
      }
    }

    const nearRange = 64;

    const getCloudAnchor = (cloud, ux, uz) => {
      const col = cloud.colliders[0];
      const ratio = 0.68;
      const surfaceOffsetY = col.ry * Math.sqrt(1 - ratio * ratio);
      return new THREE.Vector3(
        cloud.basePos.x + ux * (col.rx * ratio),
        cloud.basePos.y + surfaceOffsetY - 0.28,
        cloud.basePos.z + uz * (col.rx * ratio)
      );
    };

    const distPointSeg2D = (px, pz, sx0, sz0, sx1, sz1) => {
      const vx = sx1 - sx0;
      const vz = sz1 - sz0;
      const lenSq = vx * vx + vz * vz;
      if (lenSq < 0.0001) return Math.hypot(px - sx0, pz - sz0);
      const t = THREE.MathUtils.clamp(((px - sx0) * vx + (pz - sz0) * vz) / lenSq, 0, 1);
      return Math.hypot(px - (sx0 + vx * t), pz - (sz0 + vz * t));
    };

    const cross2D = (ax, az, bx, bz, cx, cz) => {
      return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    };

    const conflictsWithExistingBridge = (p0, p1, c1, c2) => {
      const dirX = p1.x - p0.x;
      const dirZ = p1.z - p0.z;
      const len = Math.hypot(dirX, dirZ) || 1;
      const ux = dirX / len;
      const uz = dirZ / len;

      for (const br of this.rainbowBridges) {
        const shareA = (c1 && (br.cloudA === c1 || br.cloudB === c1));
        const shareB = (c2 && (br.cloudA === c2 || br.cloudB === c2));

        // 同じ島から近い角度（約44度以内）で2本目の橋が出ないようにする
        if (shareA || shareB) {
          const bdx = br.p1.x - br.p0.x;
          const bdz = br.p1.z - br.p0.z;
          const bLen = Math.hypot(bdx, bdz) || 1;
          let bx = bdx / bLen;
          let bz = bdz / bLen;
          // 共有している島から外向きベクトル同士の角度を比較
          if ((c1 && br.cloudB === c1) || (c2 && br.cloudA === c2)) {
            bx = -bx;
            bz = -bz;
          }
          const dot = ux * bx + uz * bz;
          if (dot > 0.72) return true;
        }

        // 2D平面上での交差または近接重複判定
        const c1v = cross2D(p0.x, p0.z, p1.x, p1.z, br.p0.x, br.p0.z);
        const c2v = cross2D(p0.x, p0.z, p1.x, p1.z, br.p1.x, br.p1.z);
        const c3v = cross2D(br.p0.x, br.p0.z, br.p1.x, br.p1.z, p0.x, p0.z);
        const c4v = cross2D(br.p0.x, br.p0.z, br.p1.x, br.p1.z, p1.x, p1.z);
        if (c1v * c2v < 0 && c3v * c4v < 0) {
          return true;
        }

        const midX = (p0.x + p1.x) * 0.5;
        const midZ = (p0.z + p1.z) * 0.5;
        if (distPointSeg2D(midX, midZ, br.p0.x, br.p0.z, br.p1.x, br.p1.z) < 6.0) {
          return true;
        }
        const bMidX = (br.p0.x + br.p1.x) * 0.5;
        const bMidZ = (br.p0.z + br.p1.z) * 0.5;
        if (distPointSeg2D(bMidX, bMidZ, p0.x, p0.z, p1.x, p1.z) < 6.0) {
          return true;
        }
      }
      return false;
    };

    const addCloudBridge = (c1, c2) => {
      const id = c1.id < c2.id ? `${c1.id}|${c2.id}` : `${c2.id}|${c1.id}`;
      if (this.bridgeIds.has(id)) return;

      const dx = c2.basePos.x - c1.basePos.x;
      const dz = c2.basePos.z - c1.basePos.z;
      const dist = Math.hypot(dx, dz);
      const r1 = c1.colliders[0].rx;
      const r2 = c2.colliders[0].rx;
      if (dist <= r1 + r2 + 3.0 || dist > 46.0) return;

      const ux = dx / dist;
      const uz = dz / dist;
      const p0 = getCloudAnchor(c1, ux, uz);
      const p1 = getCloudAnchor(c2, -ux, -uz);

      // 構造物や他の島の上を跨ぐ橋を除外
      const midX = (p0.x + p1.x) * 0.5;
      const midZ = (p0.z + p1.z) * 0.5;
      for (const st of this.structures) {
        const blockR = (st.bridgeTargetRadius || st.boundingRadius) + 1.5;
        if (Math.hypot(midX - st.position.x, midZ - st.position.z) < blockR) return;
      }

      for (const other of this.clouds) {
        if (other === c1 || other === c2 || other.type !== 'island') continue;
        const orx = other.colliders[0] ? other.colliders[0].rx : 8.5;
        if (distPointSeg2D(other.basePos.x, other.basePos.z, p0.x, p0.z, p1.x, p1.z) < orx + 3.5) {
          return;
        }
      }

      if (conflictsWithExistingBridge(p0, p1, c1, c2)) return;

      const bridge = new RainbowBridge(id, p0, p1, this.rainbowMaterial, c1, c2);
      this.scene.add(bridge.mesh);
      this.rainbowBridges.push(bridge);
      this.bridgeIds.add(id);
    };

    const structureNearGroups = [];

    // 1パス目：構造物（お城・入道雲）と手前雲島を繋ぐメインの橋を先に確定する
    for (const st of this.structures) {
      if (st.bridgeTargetRadius === null) continue;

      const stPos = st.position;
      const stRadius = st.bridgeTargetRadius;
      const nearIslands = [];

      for (const c of this.clouds) {
        if (c.type !== 'island') continue;
        const dSt = Math.hypot(c.basePos.x - stPos.x, c.basePos.z - stPos.z);
        if (dSt <= nearRange) {
          nearIslands.push(c);
        }
      }
      structureNearGroups.push(nearIslands);

      let connectCloud = null;
      let bestFrontDist = Infinity;
      for (const c of nearIslands) {
        const isFrontSide = st.id === 'cumulonimbus'
          ? c.basePos.z < stPos.z - 6.0
          : c.basePos.z > stPos.z + 6.0;
        if (isFrontSide) {
          const d = Math.hypot(c.basePos.x - stPos.x, c.basePos.z - stPos.z);
          if (d < bestFrontDist) {
            bestFrontDist = d;
            connectCloud = c;
          }
        }
      }

      if (!connectCloud && st.id !== 'castle') {
        let bestAnyDist = Infinity;
        for (const c of nearIslands) {
          const d = Math.hypot(c.basePos.x - stPos.x, c.basePos.z - stPos.z);
          if (d > stRadius + c.colliders[0].rx + 2.0 && d < bestAnyDist) {
            bestAnyDist = d;
            connectCloud = c;
          }
        }
      }

      if (connectCloud) {
        const id = `${connectCloud.id}|${st.id}`;
        if (!this.bridgeIds.has(id)) {
          const dx = stPos.x - connectCloud.basePos.x;
          const dz = stPos.z - connectCloud.basePos.z;
          const dist = Math.hypot(dx, dz);
          const ux = dx / dist;
          const uz = dz / dist;

          const p0 = getCloudAnchor(connectCloud, ux, uz);
          const p1 = new THREE.Vector3(
            stPos.x - ux * (stRadius - 0.75),
            stPos.y + st.bridgeSurfaceOffsetY - 0.08,
            stPos.z - uz * (stRadius - 0.75)
          );

          const bridge = new RainbowBridge(id, p0, p1, this.rainbowMaterial, connectCloud, null);
          this.scene.add(bridge.mesh);
          this.rainbowBridges.push(bridge);
          this.bridgeIds.add(id);
        }
      }
    }

    // 2パス目：雲島同士の橋を距離が短い順に配置し、既存橋との重複・上跨ぎを防ぐ
    const candidatePairs = [];
    for (const nearIslands of structureNearGroups) {
      for (let i = 0; i < nearIslands.length; i++) {
        for (let j = i + 1; j < nearIslands.length; j++) {
          const c1 = nearIslands[i];
          const c2 = nearIslands[j];
          const dist = Math.hypot(c2.basePos.x - c1.basePos.x, c2.basePos.z - c1.basePos.z);
          candidatePairs.push({ c1, c2, dist });
        }
      }
    }
    candidatePairs.sort((a, b) => a.dist - b.dist);

    for (const pair of candidatePairs) {
      addCloudBridge(pair.c1, pair.c2);
    }
  }

  updateChunks(playerPos, dt, isGuest = false, remoteHeartState = null, remoteStarState = null, partnerPos = null) {
    this.time += dt;
    this.skyDome.position.copy(playerPos);
    this._updateContrails(playerPos);

    const cx = Math.round(playerPos.x / this.chunkSize);
    const cz = Math.round(playerPos.z / this.chunkSize);

    const neededKeys = new Set();
    let chunkChanged = false;

    for (let dx = -this.activeRadiusChunks; dx <= this.activeRadiusChunks; dx++) {
      for (let dz = -this.activeRadiusChunks; dz <= this.activeRadiusChunks; dz++) {
        const gx = cx + dx;
        const gz = cz + dz;
        const key = `${gx},${gz}`;
        neededKeys.add(key);

        if (!this.chunks.has(key)) {
          this._generateChunk(gx, gz, key);
          chunkChanged = true;
        }
      }
    }

    for (const [key, chunkClouds] of this.chunks.entries()) {
      if (!neededKeys.has(key)) {
        for (const c of chunkClouds) {
          this.scene.remove(c.group);
          const idx = this.clouds.indexOf(c);
          if (idx !== -1) this.clouds.splice(idx, 1);
        }
        this.chunks.delete(key);
        chunkChanged = true;
      }
    }

    for (const cloud of this.clouds) {
      cloud.prevPos.copy(cloud.position);

      if (cloud.type === 'moving') {
        const offset = Math.sin(this.time * cloud.moveSpeed + cloud.movePhase) * cloud.moveRange;
        cloud.position.x = cloud.basePos.x + cloud.moveAxis.x * offset;
        cloud.position.y = cloud.basePos.y + cloud.moveAxis.y * offset;
        cloud.position.z = cloud.basePos.z + cloud.moveAxis.z * offset;
      } else {
        cloud.position.y = cloud.basePos.y + Math.sin(this.time * 1.1 + cloud.bobPhase) * 0.14;
      }

      if (cloud.type === 'yellow') {
        const tPulse = 0.5 + 0.5 * Math.sin(this.time * cloud.pulseSpeed + cloud.pulsePhase);
        cloud.pulseScale = THREE.MathUtils.lerp(cloud.pulseMin, cloud.pulseMax, tPulse);
      } else {
        cloud.pulseScale = 1.0;
      }

      cloud.deltaPos.subVectors(cloud.position, cloud.prevPos);
      cloud.group.position.copy(cloud.position);

      const dist = cloud.position.distanceTo(playerPos);
      const appearFactor = THREE.MathUtils.clamp(1.0 - (dist - 72) / 38, 0.01, 1.0);
      const targetScale = THREE.MathUtils.smoothstep(appearFactor, 0, 1);
      cloud.visualScale = THREE.MathUtils.lerp(cloud.visualScale, targetScale, Math.min(1, dt * 6));
      cloud.group.scale.setScalar(cloud.visualScale * cloud.pulseScale);
      cloud.group.visible = cloud.visualScale > 0.03;
    }

    if (chunkChanged) {
      this._syncStructureRainbowBridges();
    }

    for (const bridge of this.rainbowBridges) {
      bridge.updateVisibility();
    }

    for (const st of this.structures) {
      st.update(this.time, dt, playerPos, partnerPos);
    }

    if (isGuest && remoteHeartState) {
      this.heartBuddy.applySyncState(remoteHeartState, this.time, dt);
    } else {
      const home = this.heartBuddy.homeCloud;
      const homeMissing = !home || !this.clouds.includes(home);
      const tooFar = home
        ? Math.hypot(playerPos.x - home.position.x, playerPos.z - home.position.z) > 120
        : false;

      if (homeMissing || tooFar) {
        this._assignHeartHomeCloud(playerPos);
      }
      this.heartBuddy.update(this.time, dt, playerPos);
    }

    if (isGuest && remoteStarState) {
      this.starBuddy.applySyncState(remoteStarState, dt, this);
    } else {
      const starTooFar =
        Math.hypot(playerPos.x - this.starBuddy.position.x, playerPos.z - this.starBuddy.position.z) > 110;
      const safeMissing = this.starBuddy.safeCloud && !this.clouds.includes(this.starBuddy.safeCloud);
      if (starTooFar || safeMissing) {
        this._assignStarHomeCloud(playerPos);
      }
      this.starBuddy.update(dt, playerPos, this, partnerPos);
    }

    this._updateAngels(dt, playerPos);
  }

  _updateAngels(dt, playerPos) {
    const usedClouds = new Set();
    for (const angel of this.angels) {
      if (angel.homeType !== 'cloud') continue;
      if (angel.homeCloud) {
        const missing = !this.clouds.includes(angel.homeCloud);
        const dist = Math.hypot(
          angel.homeCloud.position.x - playerPos.x,
          angel.homeCloud.position.z - playerPos.z
        );
        if (missing || dist > 82) {
          angel.setHomeCloud(null);
        } else {
          usedClouds.add(angel.homeCloud);
        }
      }
    }

    for (const angel of this.angels) {
      if (angel.homeType === 'cloud' && !angel.homeCloud) {
        let bestCloud = null;
        let bestScore = Infinity;

        for (const c of this.clouds) {
          if ((c.type !== 'island' && c.type !== 'normal') || usedClouds.has(c)) continue;
          if (c.isHeartHome) continue;
          const d = Math.hypot(c.position.x - playerPos.x, c.position.z - playerPos.z);
          if (d < 6 || d > 72) continue;
          const score = Math.abs(d - 20) + (c.type === 'island' ? 0 : 6);
          if (score < bestScore) {
            bestScore = score;
            bestCloud = c;
          }
        }

        if (bestCloud) {
          angel.setHomeCloud(bestCloud);
          usedClouds.add(bestCloud);
        }
      }

      angel.update(this.time, dt, playerPos);
    }
  }

  resolveStructureCollisions(pos, vel, radius) {
    let hitGround = false;
    let hardLandingVn = 0;
    let hitStructure = null;

    for (const st of this.structures) {
      const res = st.resolveCollisions(pos, vel, radius);
      if (res.hitGround) {
        hitGround = true;
        hitStructure = st;
      }
      if (res.hardLandingVn < hardLandingVn) hardLandingVn = res.hardLandingVn;
    }

    for (const bridge of this.rainbowBridges) {
      const res = bridge.resolveCollision(pos, vel, radius);
      if (res.hitGround) hitGround = true;
      if (res.hardLandingVn < hardLandingVn) hardLandingVn = res.hardLandingVn;
    }

    return { hitGround, hardLandingVn, hitStructure };
  }

  checkStructureEntrances(playerPos) {
    for (const st of this.structures) {
      const targetArea = st.checkEntrance(playerPos);
      if (targetArea) return targetArea;
    }
    return null;
  }

  _canPlaceYellowCloud(wx, wz, chunkClouds) {
    for (const st of this.structures) {
      if (st.noCloudRadius > 0) {
        if (Math.hypot(wx - st.position.x, wz - st.position.z) < st.noCloudRadius) {
          return false;
        }
      }
    }
    for (const c of chunkClouds) {
      const minGap = (c.colliders[0] ? c.colliders[0].rx : 4.5) + 5.2;
      if (Math.hypot(wx - c.basePos.x, wz - c.basePos.z) < minGap) {
        return false;
      }
    }
    return true;
  }

  _generateChunk(gx, gz, key) {
    const chunkClouds = [];

    if (gx === 0 && gz === 0) {
      chunkClouds.push(this._createCloud(0, 0, 0, 'island', 0, false));
      chunkClouds.push(this._createCloud(0, 1.0, -14, 'normal', 1, false));
      chunkClouds.push(this._createCloud(10, 2.0, -19, 'bouncy', 2, false));
      chunkClouds.push(this._createCloud(-12, 1.5, -16, 'moving', 3, false));
      chunkClouds.push(this._createCloud(15, 0.8, 4, 'island', 4, 'single_corner'));
      chunkClouds.push(this._createCloud(-14, 1.0, 8, 'normal', 5, 'single_small'));
      chunkClouds.push(this._createCloud(0, 1.6, 16, 'bouncy', 6, false));

      // 既存の雲の間の空きスペースに黄色い雲を配置
      chunkClouds.push(this._createCloud(10, 1.5, -7, 'yellow', 201, false));
      chunkClouds.push(this._createCloud(-15, 1.4, -3.5, 'yellow', 202, false));
      chunkClouds.push(this._createCloud(9.5, 1.5, 15.5, 'yellow', 203, false));
    } else if (gx === 0 && gz === -1) {
      const heartIsland = this._createCloud(16, 1.5, -42, 'island', 77, false);
      heartIsland.isHeartHome = true;
      chunkClouds.push(heartIsland);
      chunkClouds.push(this._createCloud(8, 1.2, -29, 'normal', 78, 'single_small'));
      chunkClouds.push(this._createCloud(-8, 1.8, -36, 'bouncy', 79, false));
      chunkClouds.push(this._createCloud(-14, 1.2, -52, 'island', 80, 'cluster'));
      chunkClouds.push(this._createCloud(18, 2.2, -62, 'moving', 81, false));

      // 既存の雲の間の空きスペースに黄色い雲を配置
      chunkClouds.push(this._createCloud(-2, 1.5, -45, 'yellow', 204, false));
    } else {
      if (gx === 0 && gz === 2) {
        // 入道雲の手前（z = 108）に虹の橋で繋がる案内用の雲島を確定配置
        chunkClouds.push(this._createCloud(0, 0.8, 108, 'island', 91, false));
      }

      const count = 5 + Math.floor(this._hash(gx, gz, 1) * 3);
      for (let i = 0; i < count; i++) {
        const rx = (this._hash(gx, gz, i * 10 + 2) - 0.5) * (this.chunkSize - 8);
        const rz = (this._hash(gx, gz, i * 10 + 3) - 0.5) * (this.chunkSize - 8);
        const ry = (this._hash(gx, gz, i * 10 + 4) - 0.45) * 8.0;

        const wx = gx * this.chunkSize + rx;
        const wz = gz * this.chunkSize + rz;

        if (gx === 0 && gz === 2 && Math.hypot(wx, wz - 108) < 16) {
          continue;
        }

        let tooCloseToStructure = false;
        for (const st of this.structures) {
          if (st.noCloudRadius > 0) {
            const distSt = Math.hypot(wx - st.position.x, wz - st.position.z);
            if (distSt < st.noCloudRadius) {
              tooCloseToStructure = true;
              break;
            }
          }
        }
        if (tooCloseToStructure) continue;

        const rType = this._hash(gx, gz, i * 10 + 5);
        let type = 'normal';
        if (rType > 0.62) type = 'island';
        else if (rType > 0.44) type = 'bouncy';
        else if (rType > 0.28) type = 'moving';

        chunkClouds.push(this._createCloud(wx, ry, wz, type, i + gx * 3 + gz * 7, 'auto'));
      }

      // 既存雲を生成した後で、重ならない隙間に黄色い雲を配置
      for (let j = 0; j < 2; j++) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const seedBase = 300 + j * 20 + attempt * 5;
          const rx = (this._hash(gx, gz, seedBase + 1) - 0.5) * (this.chunkSize - 6);
          const rz = (this._hash(gx, gz, seedBase + 2) - 0.5) * (this.chunkSize - 6);
          const ry = (this._hash(gx, gz, seedBase + 3) - 0.45) * 8.0;
          const wx = gx * this.chunkSize + rx;
          const wz = gz * this.chunkSize + rz;

          if (this._canPlaceYellowCloud(wx, wz, chunkClouds)) {
            chunkClouds.push(this._createCloud(wx, ry, wz, 'yellow', seedBase + gx * 5 + gz * 11, false));
            break;
          }
        }
      }
    }

    this.chunks.set(key, chunkClouds);
    for (const c of chunkClouds) {
      this.clouds.push(c);
      this.scene.add(c.group);
    }
  }

  _createCloud(x, y, z, type, seed, buildingMode = 'auto') {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const colliders = [];
    const mat = this.materials[type] || this.materials.normal;

    const addPuff = (lx, ly, lz, rx, ry, rz, customMat = mat) => {
      const mesh = new THREE.Mesh(this.puffGeo, customMat);
      mesh.position.set(lx, ly, lz);
      mesh.scale.set(rx, ry, rz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      colliders.push({
        offset: new THREE.Vector3(lx, ly, lz),
        rx,
        ry,
        rz
      });
    };

    const h1 = this._hash(x, z, seed + 11);
    const h2 = this._hash(x, z, seed + 22);
    const h3 = this._hash(x, z, seed + 33);

    let wantsBuilding = false;
    if (buildingMode && buildingMode !== 'auto') {
      wantsBuilding = true;
    } else if (buildingMode === 'auto') {
      if (type === 'island' && h3 < 0.78) wantsBuilding = true;
      else if (type === 'normal' && h3 < 0.56) wantsBuilding = true;
    }

    if (type === 'island') {
      const baseR = 8.4 + h2 * 3.0;
      addPuff(0, 0, 0, baseR, 2.5, baseR, this.materials.island);
      addPuff(-baseR * 0.62, -0.25, baseR * 0.35, baseR * 0.58, 1.9, baseR * 0.58, this.materials.normalShade);
      addPuff(baseR * 0.64, -0.25, -baseR * 0.32, baseR * 0.6, 2.0, baseR * 0.6, this.materials.normalShade);
      addPuff(baseR * 0.4, -0.3, baseR * 0.58, baseR * 0.52, 1.7, baseR * 0.52, this.materials.island);
      addPuff(-baseR * 0.45, -0.3, -baseR * 0.55, baseR * 0.54, 1.8, baseR * 0.54, this.materials.island);

      if (!wantsBuilding) {
        const star = new THREE.Mesh(this.starGeo, this.materials.gold);
        star.position.set(baseR * 0.38, 3.1, -baseR * 0.28);
        star.matrixAutoUpdate = false;
        star.updateMatrix();
        group.add(star);
      }
    } else if (type === 'bouncy') {
      const r = 4.2 + h2 * 1.4;
      addPuff(0, 0, 0, r, 1.8, r, this.materials.bouncy);
      addPuff(-r * 0.56, -0.2, 0.9, r * 0.62, 1.35, r * 0.62, this.materials.bouncy);
      addPuff(r * 0.58, -0.2, -0.8, r * 0.62, 1.35, r * 0.62, this.materials.bouncy);
    } else if (type === 'moving') {
      const r = 4.0 + h2 * 1.2;
      addPuff(0, 0, 0, r, 1.6, r * 0.92, this.materials.moving);
      addPuff(-r * 0.64, -0.15, 0.3, r * 0.62, 1.25, r * 0.62, this.materials.moving);
      addPuff(r * 0.64, -0.15, -0.3, r * 0.62, 1.25, r * 0.62, this.materials.moving);
    } else if (type === 'yellow') {
      const r = 3.2 + h2 * 0.9;
      addPuff(0, 0, 0, r, 1.45, r, this.materials.yellow);
      addPuff(-r * 0.52, -0.15, 0.4, r * 0.62, 1.15, r * 0.62, this.materials.yellowShade);
      addPuff(r * 0.52, -0.15, -0.4, r * 0.62, 1.15, r * 0.62, this.materials.yellowShade);
    } else {
      const shapeRoll = wantsBuilding ? (h1 < 0.5 ? 0.15 : 0.8) : h1;
      if (shapeRoll < 0.32) {
        const w = 6.8 + h2 * 2.4;
        const d = 5.8 + h1 * 2.2;
        addPuff(0, 0, 0, w, 2.0, d, mat);
        addPuff(-w * 0.55, -0.2, d * 0.3, w * 0.5, 1.5, d * 0.5, this.materials.normalShade);
        addPuff(w * 0.55, -0.2, -d * 0.3, w * 0.5, 1.5, d * 0.5, this.materials.normalShade);
      } else if (shapeRoll < 0.64) {
        const yaw = h2 * Math.PI;
        addPuff(0, 0, 0, 3.6, 1.65, 3.6, mat);
        for (const i of [-1, 1]) {
          const lx = Math.cos(yaw) * i * 3.8;
          const lz = -Math.sin(yaw) * i * 3.8;
          addPuff(lx, -0.1, lz, 3.4, 1.55, 3.4, this.materials.normalShade);
        }
      } else {
        const s = 5.2 + h2 * 2.0;
        addPuff(0, 0, 0, s, s * 0.44, s, mat);
        addPuff(-s * 0.55, -0.2, 0.4, s * 0.6, s * 0.36, s * 0.6, this.materials.normalShade);
        addPuff(s * 0.55, -0.2, -0.4, s * 0.6, s * 0.36, s * 0.6, this.materials.normalShade);
        addPuff(0.2, -0.2, s * 0.52, s * 0.55, s * 0.34, s * 0.55, mat);
      }
    }

    const moveAxis = h1 > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const id = `${Math.round(x * 10)}_${Math.round(y * 10)}_${Math.round(z * 10)}`;

    const cloud = {
      id,
      type,
      group,
      basePos: new THREE.Vector3(x, y, z),
      position: new THREE.Vector3(x, y, z),
      prevPos: new THREE.Vector3(x, y, z),
      deltaPos: new THREE.Vector3(),
      colliders,
      buildingColliders: [],
      safeLocalSpot: null,
      bobPhase: h2 * Math.PI * 2,
      movePhase: h1 * Math.PI * 2,
      moveSpeed: 0.85 + h2 * 0.45,
      moveRange: 3.5 + h1 * 2.5,
      moveAxis,
      pulseMin: 0.55,
      pulseMax: 1.25,
      pulseSpeed: 0.38 + h2 * 0.16,
      pulsePhase: h1 * Math.PI * 2,
      pulseScale: 1.0,
      visualScale: 0.05
    };

    if (wantsBuilding && (type === 'island' || type === 'normal')) {
      this.buildingBuilder.attachBuildingsToCloud(cloud, seed + x * 0.37 + z * 0.71, buildingMode);
    }

    return cloud;
  }

  getShadowGroundInfo(px, py, pz) {
    let bestInfo = null;

    for (const st of this.structures) {
      const stShadow = st.getShadowInfo(px, py, pz, this._tmpBridgeNormal);
      if (stShadow && (bestInfo === null || stShadow.y > bestInfo.y)) {
        this._tmpShadowNormal.copy(stShadow.normal);
        bestInfo = { y: stShadow.y, normal: this._tmpShadowNormal };
      }
    }

    for (const bridge of this.rainbowBridges) {
      if (!bridge.mesh.visible) continue;
      const bShadow = bridge.getShadowInfo(px, py, pz, this._tmpBridgeNormal);
      if (bShadow && (bestInfo === null || bShadow.y > bestInfo.y)) {
        this._tmpShadowNormal.copy(bShadow.normal);
        bestInfo = { y: bShadow.y, normal: this._tmpShadowNormal };
      }
    }

    for (const cloud of this.clouds) {
      if (!cloud.group.visible) continue;
      if (Math.abs(cloud.position.x - px) > 28 || Math.abs(cloud.position.z - pz) > 28) {
        continue;
      }

      const ps = cloud.pulseScale || 1.0;

      for (const col of cloud.colliders) {
        const rx = col.rx * ps;
        const ry = col.ry * ps;
        const rz = col.rz * ps;
        const cx = cloud.position.x + col.offset.x * ps;
        const cy = cloud.position.y + col.offset.y * ps;
        const cz = cloud.position.z + col.offset.z * ps;

        const dx = px - cx;
        const dz = pz - cz;
        const nx = dx / rx;
        const nz = dz / rz;
        const sq = nx * nx + nz * nz;

        if (sq < 0.98) {
          const dy = ry * Math.sqrt(1.0 - sq);
          const surfaceY = cy + dy;

          if (surfaceY <= py + 0.3 && (bestInfo === null || surfaceY > bestInfo.y)) {
            const normX = dx / (rx * rx);
            const normY = dy / (ry * ry);
            const normZ = dz / (rz * rz);
            this._tmpShadowNormal.set(normX, normY, normZ).normalize();
            bestInfo = { y: surfaceY, normal: this._tmpShadowNormal };
          }
        }
      }

      if (cloud.buildingColliders && cloud.buildingColliders.length > 0) {
        const bShadow = CloudBuildingBuilder.getShadowInfo(cloud, px, py, pz, this._tmpBridgeNormal);
        if (bShadow && (bestInfo === null || bShadow.y > bestInfo.y)) {
          this._tmpShadowNormal.copy(bShadow.normal);
          bestInfo = { y: bShadow.y, normal: this._tmpShadowNormal };
        }
      }
    }

    return bestInfo;
  }
}