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
      island: new THREE.MeshToonMaterial({ color: 0xffffff }),
      gold: new THREE.MeshToonMaterial({ color: 0xffd166 })
    };

    this.rainbowMaterial = this._createRainbowMaterial();

    this._createSkyEnvironment();

    // お城の浮島（スタート地点正面から見える位置に常駐）
    this.castleIsland = this.addStructure(new CastleIsland(new THREE.Vector3(0, 3.5, -74)));

    // ワールドに1人だけのハートちゃんとスターくんを生成
    this.heartBuddy = new HeartBuddy(new THREE.Vector3(16, 5.5, -42));
    this.scene.add(this.heartBuddy.group);

    this.starBuddy = new StarBuddy(new THREE.Vector3(15, 4.0, 4));
    this.scene.add(this.starBuddy.group);
    this.scene.add(this.starBuddy.dropShadow);
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
      if (cloud.type === 'bouncy') continue;
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
    // 雲がアンロードされた橋を削除
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

      // 構造物の上を横切る場合は架けない
      const midX = (p0.x + p1.x) * 0.5;
      const midZ = (p0.z + p1.z) * 0.5;
      for (const st of this.structures) {
        const blockR = (st.bridgeTargetRadius || st.boundingRadius) + 1.5;
        if (Math.hypot(midX - st.position.x, midZ - st.position.z) < blockR) return;
      }

      const bridge = new RainbowBridge(id, p0, p1, this.rainbowMaterial, c1, c2);
      this.scene.add(bridge.mesh);
      this.rainbowBridges.push(bridge);
      this.bridgeIds.add(id);
    };

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

      // 構造物周辺の大きな雲同士をつなぐ
      for (let i = 0; i < nearIslands.length; i++) {
        for (let j = i + 1; j < nearIslands.length; j++) {
          addCloudBridge(nearIslands[i], nearIslands[j]);
        }
      }

      // 手前側（+Z側）の大きな雲を優先し、なければ最寄りの大きな雲から構造物へ橋を架ける
      let connectCloud = null;
      let bestFrontDist = Infinity;
      for (const c of nearIslands) {
        if (c.basePos.z > stPos.z + 6.0) {
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
  }

  updateChunks(playerPos, dt, isGuest = false, remoteHeartState = null, remoteStarState = null, partnerPos = null) {
    this.time += dt;
    this.skyDome.position.copy(playerPos);

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

      cloud.deltaPos.subVectors(cloud.position, cloud.prevPos);
      cloud.group.position.copy(cloud.position);

      const dist = cloud.position.distanceTo(playerPos);
      const appearFactor = THREE.MathUtils.clamp(1.0 - (dist - 72) / 38, 0.01, 1.0);
      const targetScale = THREE.MathUtils.smoothstep(appearFactor, 0, 1);
      cloud.visualScale = THREE.MathUtils.lerp(cloud.visualScale, targetScale, Math.min(1, dt * 6));
      cloud.group.scale.setScalar(cloud.visualScale);
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
  }

  resolveStructureCollisions(pos, vel, radius) {
    let hitGround = false;
    let hardLandingVn = 0;

    for (const st of this.structures) {
      const res = st.resolveCollisions(pos, vel, radius);
      if (res.hitGround) hitGround = true;
      if (res.hardLandingVn < hardLandingVn) hardLandingVn = res.hardLandingVn;
    }

    for (const bridge of this.rainbowBridges) {
      const res = bridge.resolveCollision(pos, vel, radius);
      if (res.hitGround) hitGround = true;
      if (res.hardLandingVn < hardLandingVn) hardLandingVn = res.hardLandingVn;
    }

    return { hitGround, hardLandingVn };
  }

  checkStructureEntrances(playerPos) {
    for (const st of this.structures) {
      const targetArea = st.checkEntrance(playerPos);
      if (targetArea) return targetArea;
    }
    return null;
  }

  _generateChunk(gx, gz, key) {
    const chunkClouds = [];

    if (gx === 0 && gz === 0) {
      chunkClouds.push(this._createCloud(0, 0, 0, 'island', 0));
      chunkClouds.push(this._createCloud(0, 1.0, -14, 'normal', 1));
      chunkClouds.push(this._createCloud(10, 2.0, -19, 'bouncy', 2));
      chunkClouds.push(this._createCloud(-12, 1.5, -16, 'moving', 3));
      chunkClouds.push(this._createCloud(15, 0.8, 4, 'island', 4));
      chunkClouds.push(this._createCloud(-14, 1.0, 8, 'normal', 5));
      chunkClouds.push(this._createCloud(0, 1.6, 16, 'bouncy', 6));
    } else if (gx === 0 && gz === -1) {
      const heartIsland = this._createCloud(16, 1.5, -42, 'island', 77);
      heartIsland.isHeartHome = true;
      chunkClouds.push(heartIsland);
      chunkClouds.push(this._createCloud(8, 1.2, -29, 'normal', 78));
      chunkClouds.push(this._createCloud(-8, 1.8, -36, 'bouncy', 79));
      chunkClouds.push(this._createCloud(-14, 1.2, -52, 'island', 80));
      chunkClouds.push(this._createCloud(18, 2.2, -62, 'moving', 81));
    } else {
      const count = 5 + Math.floor(this._hash(gx, gz, 1) * 3);
      for (let i = 0; i < count; i++) {
        const rx = (this._hash(gx, gz, i * 10 + 2) - 0.5) * (this.chunkSize - 8);
        const rz = (this._hash(gx, gz, i * 10 + 3) - 0.5) * (this.chunkSize - 8);
        const ry = (this._hash(gx, gz, i * 10 + 4) - 0.45) * 8.0;

        const wx = gx * this.chunkSize + rx;
        const wz = gz * this.chunkSize + rz;

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

        chunkClouds.push(this._createCloud(wx, ry, wz, type, i + gx * 3 + gz * 7));
      }
    }

    this.chunks.set(key, chunkClouds);
    for (const c of chunkClouds) {
      this.clouds.push(c);
      this.scene.add(c.group);
    }
  }

  _createCloud(x, y, z, type, seed) {
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

    if (type === 'island') {
      const baseR = 8.4 + h2 * 3.0;
      addPuff(0, 0, 0, baseR, 2.5, baseR, this.materials.island);
      addPuff(-baseR * 0.62, -0.25, baseR * 0.35, baseR * 0.58, 1.9, baseR * 0.58, this.materials.normalShade);
      addPuff(baseR * 0.64, -0.25, -baseR * 0.32, baseR * 0.6, 2.0, baseR * 0.6, this.materials.normalShade);
      addPuff(baseR * 0.4, -0.3, baseR * 0.58, baseR * 0.52, 1.7, baseR * 0.52, this.materials.island);
      addPuff(-baseR * 0.45, -0.3, -baseR * 0.55, baseR * 0.54, 1.8, baseR * 0.54, this.materials.island);

      const star = new THREE.Mesh(this.starGeo, this.materials.gold);
      star.position.set(baseR * 0.38, 3.1, -baseR * 0.28);
      star.matrixAutoUpdate = false;
      star.updateMatrix();
      group.add(star);
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
    } else {
      const shapeRoll = h1;
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

    return {
      id,
      type,
      group,
      basePos: new THREE.Vector3(x, y, z),
      position: new THREE.Vector3(x, y, z),
      prevPos: new THREE.Vector3(x, y, z),
      deltaPos: new THREE.Vector3(),
      colliders,
      bobPhase: h2 * Math.PI * 2,
      movePhase: h1 * Math.PI * 2,
      moveSpeed: 0.85 + h2 * 0.45,
      moveRange: 3.5 + h1 * 2.5,
      moveAxis,
      visualScale: 0.05
    };
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

      for (const col of cloud.colliders) {
        const cx = cloud.position.x + col.offset.x;
        const cy = cloud.position.y + col.offset.y;
        const cz = cloud.position.z + col.offset.z;

        const dx = px - cx;
        const dz = pz - cz;
        const nx = dx / col.rx;
        const nz = dz / col.rz;
        const sq = nx * nx + nz * nz;

        if (sq < 0.98) {
          const dy = col.ry * Math.sqrt(1.0 - sq);
          const surfaceY = cy + dy;

          if (surfaceY <= py + 0.3 && (bestInfo === null || surfaceY > bestInfo.y)) {
            const normX = dx / (col.rx * col.rx);
            const normY = dy / (col.ry * col.ry);
            const normZ = dz / (col.rz * col.rz);
            this._tmpShadowNormal.set(normX, normY, normZ).normalize();
            bestInfo = { y: surfaceY, normal: this._tmpShadowNormal };
          }
        }
      }
    }

    return bestInfo;
  }
}