class HeartBuddy {
  constructor(centerPos) {
    this.initialPos = centerPos.clone();
    this.anchorPos = centerPos.clone();
    this.homeCloud = null;
    this.radiusX = 4.6;
    this.radiusZ = 4.0;
    this.speed = 0.42;
    this.phase = 0.5;
    this.prevPos = centerPos.clone();

    // 表情管理
    this.expression = 'normal';
    this.exprTimer = 0;
    this.moodTimer = 3.2;
    this.blinkTimer = 2.4;
    this.isBlinking = false;

    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);

    this._createVisuals();

    this.group.position.copy(centerPos);
    // 従来の1.05の80%サイズ
    this.group.scale.setScalar(0.84);
  }

  setHomeCloud(cloud, immediate = false) {
    this.homeCloud = cloud;
    if (immediate && cloud) {
      const topY = cloud.position.y + cloud.colliders[0].ry + 1.55;
      this.anchorPos.set(cloud.position.x, topY, cloud.position.z);
      this.group.position.copy(this.anchorPos);
      this.prevPos.copy(this.anchorPos);
    }
  }

  reset() {
    this.homeCloud = null;
    this.anchorPos.copy(this.initialPos);
    this.group.position.copy(this.initialPos);
    this.prevPos.copy(this.initialPos);
    this.setExpression('normal');
  }

  _createVisuals() {
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.78);
    heartShape.bezierCurveTo(-0.18, -0.64, -0.82, -0.22, -0.82, 0.30);
    heartShape.bezierCurveTo(-0.82, 0.72, -0.34, 0.84, 0, 0.44);
    heartShape.bezierCurveTo(0.34, 0.84, 0.82, 0.72, 0.82, 0.30);
    heartShape.bezierCurveTo(0.82, -0.22, 0.18, -0.64, 0, -0.78);

    const rawGeo = new THREE.ExtrudeGeometry(heartShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.58,
      bevelSize: 0.24,
      bevelSegments: 10,
      curveSegments: 28
    });
    rawGeo.center();
    rawGeo.computeBoundingBox();

    const size = new THREE.Vector3();
    rawGeo.boundingBox.getSize(size);
    const minY = rawGeo.boundingBox.min.y;
    const maxY = rawGeo.boundingBox.max.y;
    const heightRange = maxY - minY || 1;
    const span = Math.max(size.x, size.y) * 1.04;

    const rawPos = rawGeo.attributes.position;
    for (let i = 0; i < rawPos.count; i++) {
      const y = rawPos.getY(i);
      const z = rawPos.getZ(i);
      const t = THREE.MathUtils.clamp((y - minY) / heightRange, 0, 1);
      const zScale = 0.08 + 1.06 * Math.sin(t * Math.PI * 0.56);
      rawPos.setZ(i, z * zScale);
    }

    const heartGeo = rawGeo.toNonIndexed();
    heartGeo.computeVertexNormals();
    const posAttr = heartGeo.attributes.position;
    const uvArray = new Float32Array(posAttr.count * 2);

    for (let i = 0; i < posAttr.count; i += 3) {
      const z0 = posAttr.getZ(i);
      const z1 = posAttr.getZ(i + 1);
      const z2 = posAttr.getZ(i + 2);
      const isFront = (z0 + z1 + z2) / 3 >= 0;

      for (let k = 0; k < 3; k++) {
        const idx = i + k;
        const vx = posAttr.getX(idx);
        const vy = posAttr.getY(idx);
        const u = isFront
          ? 0.25 + (vx / span) * 0.46
          : 0.75 + (-vx / span) * 0.46;
        const v = 0.5 + (vy / span) * 0.92;
        uvArray[idx * 2] = u;
        uvArray[idx * 2 + 1] = v;
      }
    }
    heartGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));

    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.encoding = THREE.sRGBEncoding;

    this._drawTexture('normal', false);

    const heartMat = new THREE.MeshBasicMaterial({ map: this.texture });
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x450b20,
      side: THREE.BackSide
    });

    const heartMesh = new THREE.Mesh(heartGeo, heartMat);
    this.bodyGroup.add(heartMesh);

    const heartOutline = new THREE.Mesh(heartGeo, outlineMat);
    heartOutline.scale.set(1.075, 1.075, 1.09);
    this.bodyGroup.add(heartOutline);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.02);
    wingShape.bezierCurveTo(-0.18, 0.08, -0.45, 0.36, -0.78, 0.34);
    wingShape.bezierCurveTo(-0.98, 0.32, -1.04, 0.14, -0.84, 0.04);
    wingShape.bezierCurveTo(-0.96, -0.02, -0.94, -0.18, -0.72, -0.20);
    wingShape.bezierCurveTo(-0.82, -0.28, -0.74, -0.44, -0.46, -0.34);
    wingShape.bezierCurveTo(-0.26, -0.26, -0.10, -0.14, 0, -0.12);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 3,
      curveSegments: 16
    });
    wingGeo.translate(0, 0, -0.04);

    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.leftWingPivot = new THREE.Group();
    this.leftWingPivot.position.set(-0.22, -0.02, -0.35);
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    const leftWingOutline = new THREE.Mesh(wingGeo, outlineMat);
    leftWingOutline.scale.set(1.09, 1.09, 1.25);
    this.leftWingPivot.add(leftWing);
    this.leftWingPivot.add(leftWingOutline);
    this.bodyGroup.add(this.leftWingPivot);

    this.rightWingPivot = new THREE.Group();
    this.rightWingPivot.position.set(0.22, -0.02, -0.35);
    this.rightWingPivot.scale.x = -1;
    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    const rightWingOutline = new THREE.Mesh(wingGeo, outlineMat);
    rightWingOutline.scale.set(1.09, 1.09, 1.25);
    this.rightWingPivot.add(rightWing);
    this.rightWingPivot.add(rightWingOutline);
    this.bodyGroup.add(this.rightWingPivot);
  }

  _drawHalfBase(offsetX) {
    const ctx = this.ctx;

    ctx.fillStyle = '#f4538a';
    ctx.fillRect(offsetX, 0, 512, 512);

    ctx.fillStyle = '#d62c6d';
    ctx.beginPath();
    ctx.moveTo(offsetX, 340);
    ctx.quadraticCurveTo(offsetX + 256, 445, offsetX + 512, 340);
    ctx.lineTo(offsetX + 512, 512);
    ctx.lineTo(offsetX, 512);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 198, 224, 0.58)';
    ctx.beginPath();
    ctx.ellipse(offsetX + 150, 148, 56, 26, -0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawTexture(expr, blinking) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 1024, 512);

    this._drawHalfBase(0);
    this._drawHalfBase(512);

    const cx = 256;
    const cy = 256;
    const eyeY = cy - 18;
    const eyeOffX = 60;

    ctx.fillStyle = 'rgba(255, 180, 206, 0.72)';
    ctx.beginPath();
    ctx.ellipse(cx - 88, cy + 20, 22, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 88, cy + 20, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawOpenEye = (ex, ey, r = 20) => {
      ctx.fillStyle = '#3b0c1b';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 6, ey - 7, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawHappyArc = (ex, ey) => {
      ctx.strokeStyle = '#3b0c1b';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ey + 6, 17, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    };

    const drawClosedBlink = (ex, ey) => {
      ctx.strokeStyle = '#3b0c1b';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 16, ey + 2);
      ctx.quadraticCurveTo(ex, ey + 10, ex + 16, ey + 2);
      ctx.stroke();
    };

    if (blinking) {
      drawClosedBlink(cx - eyeOffX, eyeY);
      drawClosedBlink(cx + eyeOffX, eyeY);
    } else if (expr === 'happy') {
      drawHappyArc(cx - eyeOffX, eyeY);
      drawHappyArc(cx + eyeOffX, eyeY);
    } else if (expr === 'wink') {
      drawOpenEye(cx - eyeOffX, eyeY, 20);
      drawHappyArc(cx + eyeOffX, eyeY);
    } else if (expr === 'curious') {
      drawOpenEye(cx - eyeOffX, eyeY, 23);
      drawOpenEye(cx + eyeOffX, eyeY, 23);
    } else {
      drawOpenEye(cx - eyeOffX, eyeY, 20);
      drawOpenEye(cx + eyeOffX, eyeY, 20);
    }

    const mouthY = cy + 24;
    ctx.strokeStyle = '#3b0c1b';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (expr === 'curious') {
      ctx.fillStyle = '#d93829';
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + 18, 16, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const mw = expr === 'happy' ? 60 : 52;
      const mh = expr === 'happy' ? 42 : 34;
      ctx.fillStyle = '#d93829';
      ctx.beginPath();
      ctx.moveTo(cx - mw, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + 12, cx + mw, mouthY);
      ctx.quadraticCurveTo(cx + mw * 0.72, mouthY + mh * 1.9, cx, mouthY + mh * 1.9);
      ctx.quadraticCurveTo(cx - mw * 0.72, mouthY + mh * 1.9, cx - mw, mouthY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    this.texture.needsUpdate = true;
  }

  setExpression(expr, duration = 0) {
    if (this.expression !== expr) {
      this.expression = expr;
      this._drawTexture(this.expression, this.isBlinking);
    }
    if (duration > 0) {
      this.exprTimer = duration;
    }
  }

  getSyncState() {
    return {
      p: [this.group.position.x, this.group.position.y, this.group.position.z],
      ry: this.group.rotation.y,
      ex: this.expression
    };
  }

  applySyncState(state, time, dt) {
    if (!state) return;
    const target = new THREE.Vector3(state.p[0], state.p[1], state.p[2]);
    const alpha = 1 - Math.exp(-10 * dt);
    if (this.group.position.distanceTo(target) > 20) {
      this.group.position.copy(target);
    } else {
      this.group.position.lerp(target, alpha);
    }

    this.group.rotation.y = state.ry;
    if (state.ex && this.expression !== state.ex) {
      this.setExpression(state.ex);
    }

    const t = time * this.speed + this.phase;
    this.bodyGroup.rotation.z = Math.sin(t * 2.1) * 0.1;
    this.bodyGroup.rotation.x = Math.cos(t * 1.6) * 0.08;

    const flap = Math.sin(time * 6.5 + this.phase * 2.0) * 0.42;
    this.leftWingPivot.rotation.y = 0.35 + flap;
    this.leftWingPivot.rotation.z = Math.sin(time * 6.5 + this.phase * 2.0) * 0.14;
    this.rightWingPivot.rotation.y = -0.35 - flap;
    this.rightWingPivot.rotation.z = -Math.sin(time * 6.5 + this.phase * 2.0) * 0.14;

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.11 : (2.4 + Math.random() * 2.8);
      this._drawTexture(this.expression, this.isBlinking);
    }
  }

  update(time, dt, playerPos) {
    if (this.homeCloud) {
      const targetX = this.homeCloud.position.x;
      const targetY = this.homeCloud.position.y + this.homeCloud.colliders[0].ry + 1.55;
      const targetZ = this.homeCloud.position.z;
      const lerpFactor = 1 - Math.exp(-3.0 * dt);
      this.anchorPos.x = THREE.MathUtils.lerp(this.anchorPos.x, targetX, lerpFactor);
      this.anchorPos.y = THREE.MathUtils.lerp(this.anchorPos.y, targetY, lerpFactor);
      this.anchorPos.z = THREE.MathUtils.lerp(this.anchorPos.z, targetZ, lerpFactor);
    }

    const t = time * this.speed + this.phase;
    const nx = this.anchorPos.x + Math.sin(t) * this.radiusX;
    const nz = this.anchorPos.z + Math.sin(t * 0.5) * this.radiusZ;
    const ny = this.anchorPos.y + Math.sin(t * 2.1) * 0.55;

    this.prevPos.copy(this.group.position);
    this.group.position.set(nx, ny, nz);

    const dx = nx - this.prevPos.x;
    const dz = nz - this.prevPos.z;
    if (dx * dx + dz * dz > 0.00001) {
      this.group.rotation.y = Math.atan2(dx, dz);
    }

    this.bodyGroup.rotation.z = Math.sin(t * 2.1) * 0.1;
    this.bodyGroup.rotation.x = Math.cos(t * 1.6) * 0.08;

    const flap = Math.sin(time * 6.5 + this.phase * 2.0) * 0.42;
    this.leftWingPivot.rotation.y = 0.35 + flap;
    this.leftWingPivot.rotation.z = Math.sin(time * 6.5 + this.phase * 2.0) * 0.14;
    this.rightWingPivot.rotation.y = -0.35 - flap;
    this.rightWingPivot.rotation.z = -Math.sin(time * 6.5 + this.phase * 2.0) * 0.14;

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.11 : (2.4 + Math.random() * 2.8);
      this._drawTexture(this.expression, this.isBlinking);
    }

    const distPlayer = this.group.position.distanceTo(playerPos);
    if (this.exprTimer > 0) {
      this.exprTimer -= dt;
      if (this.exprTimer <= 0) {
        this.setExpression('normal');
      }
    } else if (distPlayer < 9.5) {
      this.setExpression('happy', 1.8);
    } else {
      this.moodTimer -= dt;
      if (this.moodTimer <= 0) {
        this.moodTimer = 3.5 + Math.random() * 3.5;
        const r = Math.random();
        if (r < 0.35) this.setExpression('wink', 1.6);
        else if (r < 0.65) this.setExpression('happy', 1.8);
        else if (r < 0.8) this.setExpression('curious', 1.2);
      }
    }
  }
}

class SkyWorld {
  constructor(scene) {
    this.scene = scene;
    this.chunkSize = 48;
    this.activeRadiusChunks = 2; // 周囲 5x5 チャンクを表示
    this.clouds = [];
    this.chunks = new Map();
    this.time = 0;

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

    this._createSkyEnvironment();

    // ワールドに1人だけのハートちゃんを生成
    this.heartBuddy = new HeartBuddy(new THREE.Vector3(16, 5.5, -42));
    this.scene.add(this.heartBuddy.group);
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

  updateChunks(playerPos, dt, isGuest = false, remoteHeartState = null) {
    this.time += dt;
    this.skyDome.position.copy(playerPos);

    const cx = Math.round(playerPos.x / this.chunkSize);
    const cz = Math.round(playerPos.z / this.chunkSize);

    const neededKeys = new Set();

    for (let dx = -this.activeRadiusChunks; dx <= this.activeRadiusChunks; dx++) {
      for (let dz = -this.activeRadiusChunks; dz <= this.activeRadiusChunks; dz++) {
        const gx = cx + dx;
        const gz = cz + dz;
        const key = `${gx},${gz}`;
        neededKeys.add(key);

        if (!this.chunks.has(key)) {
          this._generateChunk(gx, gz, key);
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

    return {
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
            const normal = new THREE.Vector3(normX, normY, normZ).normalize();
            bestInfo = { y: surfaceY, normal };
          }
        }
      }
    }

    return bestInfo;
  }
}