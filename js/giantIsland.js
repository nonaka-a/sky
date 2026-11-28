class GiantMaimai {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.radius = 9.6; // 通常まいまい(0.6)の16倍
    this.colorHex = options.colorHex || '#f23b3b';
    this.cheekColor = options.cheekColor || 'rgba(255, 130, 150, 0.45)';
    this.outlineColor = options.outlineColor || 0x3b0d0c;
    this.mouthInnerColor = options.mouthInnerColor || '#4a0b0b';
    this.mouthTongueColor = options.mouthTongueColor || '#8f1d1d';

    this.initialPos = (options.startPos || new THREE.Vector3(0, 10, 0)).clone();
    this.position = this.initialPos.clone();
    this.prevPos = this.initialPos.clone();
    this.deltaPos = new THREE.Vector3();
    this.velocity = new THREE.Vector3(0, 0, 0);

    this.facingYaw = typeof options.yaw === 'number' ? options.yaw : Math.random() * Math.PI * 2;
    this.targetYaw = this.facingYaw;
    this.rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.facingYaw);

    this.moveSpeed = options.moveSpeed || (2.1 + Math.random() * 0.7);
    this.isGrounded = false;
    this.isMoving = true;
    this.stateTimer = 2.0 + Math.random() * 3.5;
    this.jumpCooldown = 3.5 + Math.random() * 5.0;
    this.isPreparingJump = false;
    this.prepareJumpTimer = 0;

    this.squashY = 1.0;
    this.squashVel = 0;

    this.expression = 'normal';
    this.exprTimer = 0;
    this.blinkTimer = 3.2 + Math.random() * 3.0;
    this.isBlinking = false;

    this.remoteTargetPos = this.initialPos.clone();
    this.remoteTargetQuat = this.rollQuat.clone();
    this.remoteTargetSquash = 1.0;

    this._tmpVec1 = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._tmpAxisY = new THREE.Vector3(0, 1, 0);
    this._tmpZAxis = new THREE.Vector3(0, 0, 1);
    this._tmpQuat = new THREE.Quaternion();

    this.group = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    this._createVisuals();
    this.scene.add(this.group);
    this.scene.add(this.dropShadow);
  }

  _createVisuals() {
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 1024;
    this.faceCanvas.height = 512;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.encoding = THREE.sRGBEncoding;

    this._drawFace('normal', false);

    const sphereGeo = new THREE.SphereGeometry(this.radius, 40, 36);
    const sphereMat = new THREE.MeshBasicMaterial({ map: this.faceTexture });
    this.sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.sphereMesh.rotation.y = -Math.PI / 2;

    this.rollHolder = new THREE.Group();
    this.rollHolder.add(this.sphereMesh);
    this.bodyPivot.add(this.rollHolder);

    const outlineGeo = new THREE.SphereGeometry(this.radius * 1.055, 34, 30);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: this.outlineColor,
      side: THREE.BackSide
    });
    this.outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
    this.bodyPivot.add(this.outlineMesh);

    const shadowGeo = new THREE.CircleGeometry(this.radius * 0.95, 28);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x4c785c,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    this.dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.dropShadow.visible = false;
  }

  _drawFace(expr, blinking) {
    const ctx = this.faceCtx;
    const w = 1024;
    const h = 512;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = this.colorHex;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.49;

    ctx.fillStyle = this.cheekColor;
    ctx.beginPath();
    ctx.ellipse(cx - 82, cy + 20, 20, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 82, cy + 20, 20, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    const eyeY = cy - 24;
    const eyeOffsetX = 48;

    if (blinking || expr === 'land') {
      ctx.strokeStyle = '#330808';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        if (expr === 'land') {
          if (side < 0) {
            ctx.moveTo(cx - eyeOffsetX - 14, eyeY - 9);
            ctx.lineTo(cx - eyeOffsetX + 12, eyeY + 2);
            ctx.lineTo(cx - eyeOffsetX - 14, eyeY + 13);
          } else {
            ctx.moveTo(cx + eyeOffsetX + 14, eyeY - 9);
            ctx.lineTo(cx + eyeOffsetX - 12, eyeY + 2);
            ctx.lineTo(cx + eyeOffsetX + 14, eyeY + 13);
          }
        } else {
          ctx.arc(cx + side * eyeOffsetX, eyeY + 6, 17, Math.PI * 1.1, Math.PI * 1.9);
        }
        ctx.stroke();
      });
    } else {
      [-1, 1].forEach((side) => {
        const ex = cx + side * eyeOffsetX;
        const ey = eyeY;
        const eyeRadius = 22;

        const eyeGrad = ctx.createLinearGradient(ex, ey - eyeRadius, ex, ey + eyeRadius);
        eyeGrad.addColorStop(0, '#1e0404');
        eyeGrad.addColorStop(0.7, '#330808');
        eyeGrad.addColorStop(1, '#6b1919');

        ctx.fillStyle = eyeGrad;
        ctx.beginPath();
        ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex - 7, ey - 8, expr === 'jump' ? 8.5 : 7, 0, Math.PI * 2);
        ctx.fill();

        if (expr === 'jump' || expr === 'happy') {
          ctx.beginPath();
          ctx.arc(ex + 7, ey + 8, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    const mouthY = cy + 20;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#330808';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (expr === 'land') {
      ctx.beginPath();
      ctx.moveTo(cx - 32, mouthY + 10);
      ctx.quadraticCurveTo(cx - 16, mouthY + 24, cx, mouthY + 10);
      ctx.quadraticCurveTo(cx + 16, mouthY + 24, cx + 32, mouthY + 10);
      ctx.stroke();
    } else {
      const mouthW = expr === 'jump' || expr === 'happy' ? 66 : 58;
      const mouthH = expr === 'jump' || expr === 'happy' ? 38 : 32;

      ctx.fillStyle = this.mouthInnerColor;
      ctx.beginPath();
      ctx.moveTo(cx - mouthW, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + 10, cx + mouthW, mouthY);
      ctx.quadraticCurveTo(cx + mouthW * 0.75, mouthY + mouthH * 1.4, cx, mouthY + mouthH * 1.4);
      ctx.quadraticCurveTo(cx - mouthW * 0.75, mouthY + mouthH * 1.4, cx - mouthW, mouthY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = this.mouthTongueColor;
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + mouthH * 1.25, mouthW * 0.7, mouthH * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this.faceTexture.needsUpdate = true;
  }

  setExpression(expr, duration = 0) {
    if (this.expression !== expr) {
      this.expression = expr;
      this._drawFace(this.expression, this.isBlinking);
    }
    if (duration > 0) {
      this.exprTimer = duration;
    }
  }

  triggerSquash(targetScaleY) {
    this.squashY = targetScaleY;
    this.squashVel = 0;
  }

  reset(island) {
    const gy = island.getGroundHeightAt(this.initialPos.x, this.initialPos.z);
    this.position.set(this.initialPos.x, gy + this.radius, this.initialPos.z);
    this.prevPos.copy(this.position);
    this.deltaPos.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
    this.isMoving = true;
    this.isPreparingJump = false;
    this.prepareJumpTimer = 0;
    this.squashY = 1.0;
    this.squashVel = 0;
    this.remoteTargetPos.copy(this.position);
    this.remoteTargetQuat.copy(this.rollQuat);
    this.remoteTargetSquash = 1.0;
    this.setExpression('normal');
    this._syncVisual(0, island);
  }

  update(dt, island, allMaimais, sound, playerPos) {
    this.prevPos.copy(this.position);

    if (this.exprTimer > 0) {
      this.exprTimer -= dt;
      if (this.exprTimer <= 0) {
        this.setExpression('normal');
      }
    }

    // まばたきも通常サイズよりゆったり
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.24 : (3.6 + Math.random() * 4.2);
      this._drawFace(this.expression, this.isBlinking);
    }

    // 島内をゆっくり散策＆ときどき重いジャンプ
    if (this.isGrounded) {
      if (this.isPreparingJump) {
        this.prepareJumpTimer -= dt;
        this.velocity.x *= Math.exp(-6.0 * dt);
        this.velocity.z *= Math.exp(-6.0 * dt);
        // 溜め動作（ゆっくり沈み込む）
        this.squashY = THREE.MathUtils.lerp(this.squashY, 0.78, Math.min(1, dt * 4.5));
        if (this.prepareJumpTimer <= 0) {
          this.isPreparingJump = false;
          this.isGrounded = false;
          this.velocity.y = 9.2 + Math.random() * 2.0;
          this.velocity.x = Math.sin(this.facingYaw) * (this.moveSpeed * 1.15);
          this.velocity.z = Math.cos(this.facingYaw) * (this.moveSpeed * 1.15);
          this.triggerSquash(1.24);
          this.setExpression('jump', 1.2);
          this.jumpCooldown = 5.0 + Math.random() * 6.0;
        }
      } else {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.isMoving = !this.isMoving;
          this.stateTimer = this.isMoving ? (4.0 + Math.random() * 5.0) : (2.2 + Math.random() * 2.8);
          if (this.isMoving) {
            this.targetYaw += (Math.random() - 0.5) * 1.8;
          }
        }

        this.jumpCooldown -= dt;
        if (this.jumpCooldown <= 0) {
          this.isPreparingJump = true;
          this.prepareJumpTimer = 0.75;
        }

        // 島の端や豆の木の付近に近づいたら内側へゆっくり向き直す
        const distCenter = Math.hypot(this.position.x, this.position.z);
        const distBean = Math.hypot(
          this.position.x - island.beanstalkCenter.x,
          this.position.z - island.beanstalkCenter.z
        );
        if (distCenter > island.islandRadius - (this.radius + 5.5)) {
          this.targetYaw = Math.atan2(-this.position.x, -this.position.z) + (Math.random() - 0.5) * 0.7;
        } else if (distBean < this.radius + 8.5) {
          this.targetYaw = Math.atan2(
            this.position.x - island.beanstalkCenter.x,
            this.position.z - island.beanstalkCenter.z
          );
        }

        const yawDiff = Math.atan2(
          Math.sin(this.targetYaw - this.facingYaw),
          Math.cos(this.targetYaw - this.facingYaw)
        );
        this.facingYaw += yawDiff * Math.min(1, dt * 1.2);

        if (this.isMoving) {
          const tvx = Math.sin(this.facingYaw) * this.moveSpeed;
          const tvz = Math.cos(this.facingYaw) * this.moveSpeed;
          const alpha = 1 - Math.exp(-3.2 * dt);
          this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, tvx, alpha);
          this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, tvz, alpha);
        } else {
          const decay = Math.exp(-4.5 * dt);
          this.velocity.x *= decay;
          this.velocity.z *= decay;
        }
      }
    }

    // 巨大まいまい同士・巨木などの障害物回避
    for (const other of allMaimais) {
      if (other === this) continue;
      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      const d = Math.hypot(dx, dz);
      const minD = this.radius + other.radius + 1.2;
      if (d < minD && d > 0.001) {
        const push = (minD - d) * 1.6;
        const nx = dx / d;
        const nz = dz / d;
        this.velocity.x += nx * push * dt * 4.0;
        this.velocity.z += nz * push * dt * 4.0;
        this.targetYaw = Math.atan2(nx, nz);
      }
    }

    // スローで重い重力
    const gravity = 10.8;
    this.velocity.y = Math.max(this.velocity.y - gravity * dt, -14.0);
    this.position.addScaledVector(this.velocity, dt);

    // 巨木・大岩との側面衝突押し出し
    island.resolveGiantMobStaticObstacles(this.position, this.velocity, this.radius);

    // 島の縁からの落下防止クランプ
    const curR = Math.hypot(this.position.x, this.position.z);
    const maxAllowedR = island.islandRadius - this.radius - 1.5;
    if (curR > maxAllowedR && curR > 0.001) {
      const nx = this.position.x / curR;
      const nz = this.position.z / curR;
      this.position.x = nx * maxAllowedR;
      this.position.z = nz * maxAllowedR;
      const vn = this.velocity.x * nx + this.velocity.z * nz;
      if (vn > 0) {
        this.velocity.x -= nx * vn;
        this.velocity.z -= nz * vn;
      }
    }

    // 地形との接地判定
    const groundY = island.getGroundHeightAt(this.position.x, this.position.z);
    const wasGrounded = this.isGrounded;
    if (this.position.y - this.radius <= groundY) {
      const impactVy = this.velocity.y;
      this.position.y = groundY + this.radius;
      this.velocity.y = 0;
      this.isGrounded = true;

      if (!wasGrounded && impactVy < -3.2) {
        this.triggerSquash(0.74);
        this.setExpression('land', 0.65);
        if (sound && playerPos) {
          const distP = this.position.distanceTo(playerPos);
          if (distP < 85) {
            const vol = THREE.MathUtils.clamp(1.0 - distP / 90, 0.15, 0.9);
            sound.playTone(115, 55, 0.24, 'sine', 0.14 * vol);
          }
        }
      }
    } else if (this.position.y - this.radius > groundY + 0.15) {
      this.isGrounded = false;
    }

    // ぽよんスプリングも巨大なのでゆっくり重く
    if (!this.isPreparingJump) {
      const k = 58;
      const damp = 8.5;
      const force = (1.0 - this.squashY) * k - this.squashVel * damp;
      this.squashVel += force * dt;
      this.squashY += this.squashVel * dt;
      this.squashY = THREE.MathUtils.clamp(this.squashY, 0.65, 1.32);
    }

    // 転がり回転
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizSpeed > 0.15 && this.isGrounded) {
      this._tmpVec1.set(this.velocity.x, 0, this.velocity.z).normalize();
      this._tmpVec2.crossVectors(this._tmpAxisY, this._tmpVec1).normalize();
      const angle = (horizSpeed * dt) / this.radius;
      this._tmpQuat.setFromAxisAngle(this._tmpVec2, angle);
      this.rollQuat.premultiply(this._tmpQuat).normalize();
    } else {
      this._tmpQuat.setFromAxisAngle(this._tmpAxisY, this.facingYaw);
      this.rollQuat.slerp(this._tmpQuat, Math.min(1, 2.5 * dt));
    }

    this.deltaPos.subVectors(this.position, this.prevPos);
    this._syncVisual(dt, island);
  }

  _syncVisual(dt, island) {
    const xzScale = 1 / Math.sqrt(this.squashY);
    this.bodyPivot.scale.set(xzScale, this.squashY, xzScale);

    const bottomOffset = (this.squashY - 1.0) * this.radius * 0.65;
    this.group.position.set(this.position.x, this.position.y + bottomOffset, this.position.z);
    this.rollHolder.quaternion.copy(this.rollQuat);

    const shadowGround = island.getGroundHeightAt(this.position.x, this.position.z);
    const dist = Math.max(0, this.position.y - this.radius - shadowGround);
    if (dist < 36) {
      this.dropShadow.visible = true;
      const normal = island.getGroundNormalAt(this.position.x, this.position.z, this._tmpVec1);
      this.dropShadow.position.set(
        this.position.x + normal.x * 0.08,
        shadowGround + normal.y * 0.08,
        this.position.z + normal.z * 0.08
      );
      this.dropShadow.quaternion.setFromUnitVectors(this._tmpZAxis, normal);
      const s = Math.max(0.45, 1.0 - dist * 0.02);
      this.dropShadow.scale.set(s, s, 1);
      this.dropShadow.material.opacity = Math.max(0.06, 0.3 - dist * 0.008);
    } else {
      this.dropShadow.visible = false;
    }
  }

  getSyncState() {
    return {
      p: [this.position.x, this.position.y, this.position.z],
      q: [this.rollQuat.x, this.rollQuat.y, this.rollQuat.z, this.rollQuat.w],
      sq: this.squashY,
      ex: this.expression
    };
  }

  applySyncState(state, dt, island) {
    if (!state) return;
    this.prevPos.copy(this.position);

    this.remoteTargetPos.set(state.p[0], state.p[1], state.p[2]);
    this.remoteTargetQuat.set(state.q[0], state.q[1], state.q[2], state.q[3]);
    this.remoteTargetSquash = state.sq || 1.0;

    const alpha = 1 - Math.exp(-12 * dt);
    if (this.position.distanceTo(this.remoteTargetPos) > 15) {
      this.position.copy(this.remoteTargetPos);
    } else {
      this.position.lerp(this.remoteTargetPos, alpha);
    }

    this.rollQuat.slerp(this.remoteTargetQuat, alpha);
    this.squashY = THREE.MathUtils.lerp(this.squashY, this.remoteTargetSquash, alpha);
    if (state.ex && this.expression !== state.ex) {
      this.setExpression(state.ex);
    }

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.24 : (3.6 + Math.random() * 4.2);
      this._drawFace(this.expression, this.isBlinking);
    }

    this.deltaPos.subVectors(this.position, this.prevPos);
    this._syncVisual(dt, island);
  }
}

class GiantIsland {
  constructor() {
    this.scene = new THREE.Scene();
    this.time = 0;

    this.islandRadius = 60.0;
    this.beanstalkCenter = new THREE.Vector3(-42.0, 0, 38.0);
    this.staticColliders = [];
    this.skyCoins = [];
    this.collectedCoins = new Set();

    this._tmpNormal = new THREE.Vector3(0, 1, 0);
    this._tmpVec = new THREE.Vector3();

    this._createSkyAndLights();
    this._buildSurroundingClouds();
    this._buildIslandTerrain();
    this._buildBeanstalkTip();
    this._buildGiantTreesAndRocks();
    this._buildGiantFoliage();
    this._buildCoins();
    this._buildGiantMaimais();
  }

  _createSkyAndLights() {
    const skyGeo = new THREE.SphereGeometry(320, 32, 24);
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
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);

    this.scene.fog = new THREE.Fog(0xd8f4ff, 95, 240);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffd4eb, 0.88);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfffdf5, 0.78);
    dir.position.set(45, 75, 35);
    this.scene.add(dir);
  }

  _buildSurroundingClouds() {
    const puffGeo = new THREE.SphereGeometry(1, 14, 10);
    const matMain = new THREE.MeshToonMaterial({ color: 0xffffff });
    const matShade = new THREE.MeshToonMaterial({ color: 0xedf6ff });

    this.bgClouds = [];
    const specs = [
      [-92, 6, -42, 2.6],
      [-76, -10, -88, 2.2],
      [88, 4, -56, 2.8],
      [96, -8, 34, 2.4],
      [40, 10, -105, 3.0],
      [-28, -12, -102, 2.3],
      [74, 8, 86, 2.6],
      [-86, -6, 68, 2.1],
      [10, -14, 104, 2.5]
    ];

    specs.forEach(([cx, cy, cz, sc], idx) => {
      const g = new THREE.Group();
      g.position.set(cx, cy, cz);
      g.scale.setScalar(sc);
      g.rotation.y = idx * 0.9;

      const p1 = new THREE.Mesh(puffGeo, matMain);
      p1.scale.set(7.5, 2.4, 6.2);
      g.add(p1);

      const p2 = new THREE.Mesh(puffGeo, matShade);
      p2.position.set(-4.8, -0.35, 1.2);
      p2.scale.set(4.8, 1.8, 4.4);
      g.add(p2);

      const p3 = new THREE.Mesh(puffGeo, matShade);
      p3.position.set(5.0, -0.3, -1.0);
      p3.scale.set(5.0, 1.9, 4.6);
      g.add(p3);

      this.scene.add(g);
      this.bgClouds.push({ group: g, baseY: cy, phase: idx * 0.8 });
    });
  }

  getGroundHeightAt(x, z) {
    const smoothBump = (cx, cz, radius, height) => {
      const d = Math.hypot(x - cx, z - cz);
      if (d >= radius) return 0;
      const t = 1 - d / radius;
      return height * (t * t * (3 - 2 * t));
    };

    const flatPlateau = (cx, cz, innerR, outerR, height) => {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= innerR) return height;
      if (d >= outerR) return 0;
      const t = 1 - (d - innerR) / (outerR - innerR);
      return height * (t * t * (3 - 2 * t));
    };

    let h = 0;
    // 北側の大きな小丘
    h += smoothBump(-10, -25, 23, 5.8);
    // 東側の段差テラス
    h += flatPlateau(27, -4, 9.5, 18.5, 3.8);
    // 北東の段差・小丘
    h += flatPlateau(24, -30, 6.5, 14.5, 2.6);
    // 南西の小丘
    h += smoothBump(-22, 18, 17, 3.6);
    // 中央南寄りのゆるやかな小山
    h += smoothBump(12, 26, 15, 2.4);

    // 全体のゆるやかな起伏（端や豆の木周辺では落ち着かせる）
    const r = Math.hypot(x, z);
    const edgeFade = THREE.MathUtils.clamp(1.0 - (r - 42) / 16, 0, 1);
    h += (Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.45 + 0.45) * edgeFade;

    return h;
  }

  getGroundNormalAt(x, z, outNormal) {
    const e = 0.45;
    const hL = this.getGroundHeightAt(x - e, z);
    const hR = this.getGroundHeightAt(x + e, z);
    const hD = this.getGroundHeightAt(x, z - e);
    const hU = this.getGroundHeightAt(x, z + e);
    outNormal.set(hL - hR, 2 * e, hD - hU).normalize();
    return outNormal;
  }

  _rockNoise(x, y, z) {
    const n1 = Math.sin(x * 2.13 + y * 1.71 + z * 2.57);
    const n2 = Math.cos(x * 3.77 - y * 2.91 + z * 1.83);
    return n1 * 0.6 + n2 * 0.4;
  }

  _createCraggyRockGeo(radius, detail = 1, yScale = 1.0, seed = 0, topFlatten = 1.0, maxLocalY = Infinity) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const qx = Math.round(vx * 1000) / 1000;
      const qy = Math.round(vy * 1000) / 1000;
      const qz = Math.round(vz * 1000) / 1000;
      const n = this._rockNoise(qx + seed, qy - seed * 0.7, qz + seed * 1.3);
      const scale = 1.0 + n * 0.24;
      const yFactor = vy > 0 ? yScale * topFlatten : yScale;
      const ny = Math.min(maxLocalY, vy * scale * yFactor);
      pos.setXYZ(i, vx * scale, ny, vz * scale);
    }
    geo.computeVertexNormals();
    return geo;
  }

  _buildIslandTerrain() {
    const R = this.islandRadius;
    const rings = 36;
    const segs = 72;

    const grassTopMat = new THREE.MeshToonMaterial({ color: 0x57c966 });
    const grassEdgeMat = new THREE.MeshToonMaterial({ color: 0x3da84e });
    const soilMat = new THREE.MeshToonMaterial({ color: 0x9c7258 });
    const rockMatMain = new THREE.MeshToonMaterial({ color: 0x8d99ae, flatShading: true });
    const rockMatDark = new THREE.MeshToonMaterial({ color: 0x6f7b91, flatShading: true });
    const rockMatLight = new THREE.MeshToonMaterial({ color: 0xa3afc2, flatShading: true });

    // 1. 起伏のある草の上面メッシュ（放射状グリッド）
    const positions = [];
    const indices = [];
    positions.push(0, this.getGroundHeightAt(0, 0), 0);

    for (let rIdx = 1; rIdx <= rings; rIdx++) {
      const r = (rIdx / rings) * R;
      for (let sIdx = 0; sIdx < segs; sIdx++) {
        const ang = (sIdx / segs) * Math.PI * 2;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        positions.push(x, this.getGroundHeightAt(x, z), z);
      }
    }

    // 中心ファン
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      const next = (sIdx + 1) % segs;
      indices.push(0, 1 + next, 1 + sIdx);
    }

    // 外周リング
    for (let rIdx = 1; rIdx < rings; rIdx++) {
      const ringStart = 1 + (rIdx - 1) * segs;
      const nextRingStart = 1 + rIdx * segs;
      for (let sIdx = 0; sIdx < segs; sIdx++) {
        const next = (sIdx + 1) % segs;
        const a = ringStart + sIdx;
        const b = ringStart + next;
        const c = nextRingStart + sIdx;
        const d = nextRingStart + next;
        indices.push(a, b, d, a, d, c);
      }
    }

    const topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    topGeo.setIndex(indices);
    topGeo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(topGeo, grassTopMat));

    // 2. 草の縁取りリング＆土の側面スカート
    const rimMesh = new THREE.Mesh(
      new THREE.TorusGeometry(R - 0.35, 0.72, 10, 64),
      grassEdgeMat
    );
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = -0.25;
    this.scene.add(rimMesh);

    const soilMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.3, R - 2.8, 3.6, 56),
      soilMat
    );
    soilMesh.position.y = -2.1;
    this.scene.add(soilMesh);

    // 3. 浮島下部の巨大な岩盤
    const coreRockGeo = this._createCraggyRockGeo(R * 0.88, 1, 0.32, 2.2, 0.3, 0);
    const coreRock = new THREE.Mesh(coreRockGeo, rockMatMain);
    coreRock.position.y = -3.6;
    this.scene.add(coreRock);

    const sideRockCount = 20;
    for (let i = 0; i < sideRockCount; i++) {
      const ang = (i / sideRockCount) * Math.PI * 2 + (i % 2) * 0.1;
      const dist = R * 0.72 + (i % 3) * 3.2;
      const size = 9.5 + (i % 3) * 2.4;
      const py = -3.8 - (i % 2) * 1.4;
      const geo = this._createCraggyRockGeo(size, 0, 0.65, i * 2.7, 0.45, 1.2);
      const mat = i % 3 === 0 ? rockMatLight : (i % 2 === 0 ? rockMatMain : rockMatDark);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(ang) * dist, py, Math.sin(ang) * dist);
      mesh.rotation.y = ang;
      this.scene.add(mesh);
    }

    const midRock = new THREE.Mesh(
      this._createCraggyRockGeo(R * 0.62, 1, 0.45, 5.1, 0.4, 0),
      rockMatDark
    );
    midRock.position.set(1.5, -11.5, -1.0);
    this.scene.add(midRock);

    const tipRock = new THREE.Mesh(
      this._createCraggyRockGeo(R * 0.32, 0, 0.72, 9.4, 0.5, 4.0),
      rockMatDark
    );
    tipRock.position.set(-1.0, -22.5, 0.8);
    this.scene.add(tipRock);
  }

  _buildBeanstalkTip() {
    const bx = this.beanstalkCenter.x;
    const bz = this.beanstalkCenter.z;
    const groundY = this.getGroundHeightAt(bx, bz);

    const beanGroup = new THREE.Group();
    beanGroup.position.set(bx, groundY, bz);
    this.scene.add(beanGroup);

    const stemMainMat = new THREE.MeshToonMaterial({ color: 0x3db854 });
    const stemSubMat = new THREE.MeshToonMaterial({ color: 0x2a8f40 });
    const leafMat = new THREE.MeshToonMaterial({ color: 0x5cd669 });
    const leafVeinMat = new THREE.MeshToonMaterial({ color: 0x90f08b });

    // 下から島の隅を突き抜けて生えている2本螺旋のツル先端
    const vineSpecs = [
      { phase: 0, radius: 1.0, tubeR: 0.72, mat: stemMainMat },
      { phase: Math.PI, radius: 0.92, tubeR: 0.62, mat: stemSubMat }
    ];
    for (const v of vineSpecs) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const y = THREE.MathUtils.lerp(-28.0, 5.8, t);
        const ang = v.phase + t * Math.PI * 3.8;
        const r = v.radius * (1.0 - Math.max(0, t - 0.72) * 2.2);
        pts.push(new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      beanGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, v.tubeR, 10, false), v.mat));
    }

    // 芯
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.15, 33.0, 12), stemSubMat);
    core.position.y = -11.0;
    beanGroup.add(core);

    // 豆の木の先端のくるんと巻いた芽先
    const tipBud = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.2, 10), leafVeinMat);
    tipBud.position.set(0, 6.4, 0);
    tipBud.rotation.z = -0.22;
    beanGroup.add(tipBud);

    // 先端から広がる大きな葉（内側方向にも伸びてスタート時の目印になる）
    const bigLeafShape = new THREE.Shape();
    bigLeafShape.moveTo(0, 0);
    bigLeafShape.bezierCurveTo(2.0, 0.8, 2.5, 2.8, 1.5, 4.4);
    bigLeafShape.bezierCurveTo(0.8, 5.2, 0.25, 5.6, 0, 5.8);
    bigLeafShape.bezierCurveTo(-0.25, 5.6, -0.8, 5.2, -1.5, 4.4);
    bigLeafShape.bezierCurveTo(-2.5, 2.8, -2.0, 0.8, 0, 0);
    bigLeafShape.closePath();

    const bigLeafGeo = new THREE.ExtrudeGeometry(bigLeafShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 2,
      curveSegments: 12
    });
    bigLeafGeo.rotateX(Math.PI / 2);

    const veinGeo = new THREE.BoxGeometry(0.2, 0.12, 4.5);

    const leafAngles = [-0.75, 1.35, 3.45];
    const leafHeights = [2.4, 3.6, 4.4];
    leafAngles.forEach((ang, idx) => {
      const h = leafHeights[idx];
      const pivot = new THREE.Group();
      pivot.position.set(0, h, 0);
      pivot.rotation.y = ang;
      beanGroup.add(pivot);

      const leaf = new THREE.Mesh(bigLeafGeo, leafMat);
      leaf.position.set(0, 0.04, 0.8);
      pivot.add(leaf);

      const vein = new THREE.Mesh(veinGeo, leafVeinMat);
      vein.position.set(0, 0.12, 3.3);
      pivot.add(vein);

      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      this.staticColliders.push(
        { kind: 'cylinder', x: bx + dx * 2.6, z: bz + dz * 2.6, yMin: groundY + h - 0.5, yMax: groundY + h + 0.14, r: 1.75 },
        { kind: 'cylinder', x: bx + dx * 4.5, z: bz + dz * 4.5, yMin: groundY + h - 0.5, yMax: groundY + h + 0.14, r: 1.45 }
      );
    });

    // 幹のコライダー
    this.staticColliders.push({
      kind: 'cylinder',
      x: bx,
      z: bz,
      yMin: groundY - 2.0,
      yMax: groundY + 6.5,
      r: 1.45
    });
  }

  _buildGiantTreesAndRocks() {
    const trunkMat = new THREE.MeshToonMaterial({ color: 0x875638 });
    const canopyMatA = new THREE.MeshToonMaterial({ color: 0x35ab4f });
    const canopyMatB = new THREE.MeshToonMaterial({ color: 0x56cf68 });
    const rockMatA = new THREE.MeshToonMaterial({ color: 0x97a4b8, flatShading: true });
    const rockMatB = new THREE.MeshToonMaterial({ color: 0x7d8a9e, flatShading: true });

    // 巨大な木（5本）
    const treeSpecs = [
      { x: -18, z: -34, scale: 1.35 },
      { x: 34, z: -22, scale: 1.2 },
      { x: 24, z: 32, scale: 1.45 },
      { x: -34, z: -6, scale: 1.15 },
      { x: 4, z: -42, scale: 1.25 }
    ];

    const puffGeo = new THREE.SphereGeometry(1, 14, 12);

    treeSpecs.forEach((t) => {
      const gy = this.getGroundHeightAt(t.x, t.z);
      const s = t.scale;
      const tree = new THREE.Group();
      tree.position.set(t.x, gy, t.z);
      this.scene.add(tree);

      const trunkH = 9.5 * s;
      const trunkRTop = 1.15 * s;
      const trunkRBot = 1.85 * s;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkRTop, trunkRBot, trunkH, 12),
        trunkMat
      );
      trunk.position.y = trunkH * 0.5 - 0.4;
      tree.add(trunk);

      const canopyY = trunkH + 1.2 * s;
      const canopyPuffs = [
        [0, canopyY, 0, 5.2 * s, 4.0 * s, 5.2 * s, canopyMatA],
        [-3.2 * s, canopyY - 1.2 * s, 1.8 * s, 3.8 * s, 3.1 * s, 3.8 * s, canopyMatB],
        [3.3 * s, canopyY - 1.0 * s, -1.6 * s, 4.0 * s, 3.2 * s, 4.0 * s, canopyMatB],
        [1.2 * s, canopyY - 1.1 * s, 3.1 * s, 3.6 * s, 2.9 * s, 3.6 * s, canopyMatA],
        [-1.0 * s, canopyY + 2.1 * s, -0.5 * s, 3.5 * s, 2.9 * s, 3.5 * s, canopyMatB]
      ];
      for (const [px, py, pz, rx, ry, rz, mat] of canopyPuffs) {
        const m = new THREE.Mesh(puffGeo, mat);
        m.position.set(px, py, pz);
        m.scale.set(rx, ry, rz);
        tree.add(m);
      }

      // 幹コライダー
      this.staticColliders.push({
        kind: 'cylinder',
        x: t.x,
        z: t.z,
        yMin: gy - 1.0,
        yMax: gy + trunkH,
        r: trunkRBot * 0.88
      });
      // 樹冠上にも乗れるよう楕円体コライダー
      this.staticColliders.push({
        kind: 'ellipsoid',
        cx: t.x,
        cy: gy + canopyY,
        cz: t.z,
        rx: 5.2 * s,
        ry: 4.0 * s,
        rz: 5.2 * s
      });
    });

    // 巨大な岩（7個）
    const rockSpecs = [
      { x: 14, z: -12, r: 3.6, yScale: 0.82 },
      { x: -24, z: 22, r: 3.1, yScale: 0.78 },
      { x: 38, z: 12, r: 4.2, yScale: 0.88 },
      { x: -6, z: 38, r: 3.4, yScale: 0.75 },
      { x: 22, z: -38, r: 2.8, yScale: 0.8 },
      { x: -42, z: 12, r: 3.2, yScale: 0.84 },
      { x: 2, z: 10, r: 2.7, yScale: 0.72 }
    ];

    rockSpecs.forEach((rk, idx) => {
      const gy = this.getGroundHeightAt(rk.x, rk.z);
      const geo = this._createCraggyRockGeo(rk.r, 1, rk.yScale, idx * 4.3, 0.75, rk.r * rk.yScale * 0.9);
      const mesh = new THREE.Mesh(geo, idx % 2 === 0 ? rockMatA : rockMatB);
      mesh.position.set(rk.x, gy + rk.r * rk.yScale * 0.35, rk.z);
      mesh.rotation.y = idx * 1.1;
      this.scene.add(mesh);

      this.staticColliders.push({
        kind: 'ellipsoid',
        cx: rk.x,
        cy: gy + rk.r * rk.yScale * 0.35,
        cz: rk.z,
        rx: rk.r * 0.95,
        ry: rk.r * rk.yScale * 0.92,
        rz: rk.r * 0.95
      });
    });
  }

  _buildGiantFoliage() {
    const bladeGeo = new THREE.ConeGeometry(0.42, 2.2, 5);
    const grassMatA = new THREE.MeshToonMaterial({ color: 0x359648 });
    const grassMatB = new THREE.MeshToonMaterial({ color: 0x6dd668 });
    const stemMat = new THREE.MeshToonMaterial({ color: 0x45b557 });
    const petalGeo = new THREE.SphereGeometry(0.62, 10, 8);
    const centerGeo = new THREE.SphereGeometry(0.55, 10, 8);
    const centerMat = new THREE.MeshToonMaterial({ color: 0xffe04d });
    const flowerColors = [0xff5c97, 0xffcf33, 0xffffff, 0x4ec3ff, 0xc48aff];
    const flowerMats = flowerColors.map((c) => new THREE.MeshToonMaterial({ color: c }));

    // 巨大な草の茂み
    const grassSpots = [
      [-15, -14], [18, -16], [30, 4], [-28, 30], [8, 34],
      [-40, -18], [40, -10], [16, -44], [-18, 44], [36, 26],
      [-8, -4], [28, -32], [-30, 8], [4, -22], [44, 0]
    ];
    grassSpots.forEach(([gx, gz], idx) => {
      const gy = this.getGroundHeightAt(gx, gz);
      const scale = 1.2 + (idx % 3) * 0.45;
      const tuft = new THREE.Group();
      tuft.position.set(gx, gy, gz);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2 + idx * 0.4;
        const blade = new THREE.Mesh(bladeGeo, k % 2 === 0 ? grassMatA : grassMatB);
        blade.position.set(Math.cos(ang) * 0.45 * scale, 0.95 * scale, Math.sin(ang) * 0.45 * scale);
        blade.rotation.set(Math.sin(ang) * 0.28, ang, -Math.cos(ang) * 0.28);
        blade.scale.setScalar(scale);
        tuft.add(blade);
      }
      this.scene.add(tuft);
    });

    // 巨大な花（背が高く、上に乗れるサイズ感のものも混ぜる）
    const flowerSpots = [
      { x: -12, z: -26, s: 1.5 },
      { x: 24, z: -2, s: 1.7 },
      { x: -20, z: 16, s: 1.4 },
      { x: 10, z: 24, s: 1.6 },
      { x: 30, z: -28, s: 1.35 },
      { x: -34, z: 18, s: 1.45 },
      { x: 4, z: -12, s: 1.3 },
      { x: 42, z: -14, s: 1.55 },
      { x: -24, z: -36, s: 1.5 },
      { x: 18, z: 42, s: 1.4 }
    ];

    flowerSpots.forEach((f, idx) => {
      const gy = this.getGroundHeightAt(f.x, f.z);
      const s = f.s;
      const h = 2.4 * s;
      const fg = new THREE.Group();
      fg.position.set(f.x, gy, f.z);
      this.scene.add(fg);

      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 * s, 0.24 * s, h, 8),
        stemMat
      );
      stem.position.y = h * 0.5;
      fg.add(stem);

      const head = new THREE.Group();
      head.position.y = h;
      head.rotation.x = 0.14;
      fg.add(head);

      const pMat = flowerMats[idx % flowerMats.length];
      for (let p = 0; p < 5; p++) {
        const ang = (p / 5) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, pMat);
        petal.position.set(Math.cos(ang) * 0.72 * s, 0, Math.sin(ang) * 0.72 * s);
        petal.scale.set(1.1 * s, 0.35 * s, 1.1 * s);
        head.add(petal);
      }

      const center = new THREE.Mesh(centerGeo, centerMat);
      center.scale.set(1.0 * s, 0.55 * s, 1.0 * s);
      center.position.y = 0.08 * s;
      head.add(center);

      // 花の頭に乗れるコライダー
      this.staticColliders.push({
        kind: 'cylinder',
        x: f.x,
        z: f.z,
        yMin: gy + h - 0.35 * s,
        yMax: gy + h + 0.28 * s,
        r: 1.25 * s
      });
    });
  }

  _buildCoins() {
    const coinGeo = new THREE.OctahedronGeometry(0.65, 0);
    coinGeo.scale(0.92, 1.12, 0.55);
    const coinMat = new THREE.MeshToonMaterial({ color: 0xffd84d, emissive: 0x422d00 });

    const spots = [
      { id: 'giant_coin_0', x: -10, z: -25, yOff: 1.0 },
      { id: 'giant_coin_1', x: -14, z: -25, yOff: 1.0 },
      { id: 'giant_coin_2', x: 27, z: -4, yOff: 1.0 },
      { id: 'giant_coin_3', x: 30, z: -4, yOff: 1.0 },
      { id: 'giant_coin_4', x: 24, z: -30, yOff: 1.0 },
      { id: 'giant_coin_5', x: -22, z: 18, yOff: 1.0 },
      { id: 'giant_coin_6', x: 12, z: 26, yOff: 1.0 },
      { id: 'giant_coin_7', x: 14, z: -12, yOff: 3.8 },
      { id: 'giant_coin_8', x: 38, z: 12, yOff: 4.5 },
      { id: 'giant_coin_9', x: -18, z: -34, yOff: 19.2 },
      { id: 'giant_coin_10', x: 24, z: 32, yOff: 20.5 },
      { id: 'giant_coin_11', x: 0, z: 0, yOff: 1.0 }
    ];

    spots.forEach((sp, idx) => {
      const gy = this.getGroundHeightAt(sp.x, sp.z);
      const basePos = new THREE.Vector3(sp.x, gy + sp.yOff, sp.z);
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.position.copy(basePos);
      this.scene.add(mesh);
      this.skyCoins.push({
        id: sp.id,
        mesh,
        basePos,
        phase: idx * 0.75,
        collecting: false,
        collectAge: 0
      });
    });
  }

  _buildGiantMaimais() {
    this.giantMaimais = [
      new GiantMaimai(this.scene, {
        colorHex: '#f23b3b',
        cheekColor: 'rgba(255, 130, 150, 0.45)',
        outlineColor: 0x3b0d0c,
        mouthInnerColor: '#4a0b0b',
        mouthTongueColor: '#8f1d1d',
        startPos: new THREE.Vector3(-2, 12, -12),
        moveSpeed: 2.3
      }),
      new GiantMaimai(this.scene, {
        colorHex: '#ffd32c',
        cheekColor: 'rgba(255, 128, 96, 0.52)',
        outlineColor: 0x452805,
        mouthInnerColor: '#8f251b',
        mouthTongueColor: '#d9483b',
        startPos: new THREE.Vector3(24, 12, -12),
        moveSpeed: 2.6
      }),
      new GiantMaimai(this.scene, {
        colorHex: '#ff82b8',
        cheekColor: 'rgba(255, 206, 228, 0.72)',
        outlineColor: 0x470f28,
        mouthInnerColor: '#7a1941',
        mouthTongueColor: '#e04884',
        startPos: new THREE.Vector3(4, 12, 22),
        moveSpeed: 2.1
      }),
      new GiantMaimai(this.scene, {
        colorHex: '#9954ff',
        cheekColor: 'rgba(255, 130, 195, 0.48)',
        outlineColor: 0x290c42,
        mouthInnerColor: '#47126b',
        mouthTongueColor: '#8b32b8',
        startPos: new THREE.Vector3(-24, 12, 6),
        moveSpeed: 2.4
      }),
      new GiantMaimai(this.scene, {
        colorHex: '#59c7ff',
        cheekColor: 'rgba(255, 155, 195, 0.52)',
        outlineColor: 0x103652,
        mouthInnerColor: '#1f4e78',
        mouthTongueColor: '#4992cc',
        startPos: new THREE.Vector3(12, 12, -32),
        moveSpeed: 2.2
      })
    ];

    for (const gm of this.giantMaimais) {
      gm.reset(this);
    }
  }

  getStartPosition(playerRadius = 0.6) {
    // 豆の木にカメラが被らず、かつ近くに見える位置へ降ろす
    const sx = this.beanstalkCenter.x + 21.5;
    const sz = this.beanstalkCenter.z - 6.0;
    const gy = this.getGroundHeightAt(sx, sz);
    return new THREE.Vector3(sx, gy + playerRadius + 2.2, sz);
  }

  resetCoins() {
    this.collectedCoins.clear();
    for (const c of this.skyCoins) {
      c.collecting = false;
      c.collectAge = 0;
      c.mesh.scale.setScalar(1.0);
      c.mesh.position.copy(c.basePos);
      c.mesh.visible = true;
    }
  }

  resetMaimais() {
    for (const gm of this.giantMaimais) {
      gm.reset(this);
    }
  }

  getSyncState() {
    return this.giantMaimais.map((gm) => gm.getSyncState());
  }

  applySyncState(list, dt) {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < this.giantMaimais.length && i < list.length; i++) {
      this.giantMaimais[i].applySyncState(list[i], dt, this);
    }
  }

  resolveGiantMobStaticObstacles(pos, vel, mobRadius) {
    for (const col of this.staticColliders) {
      if (col.kind === 'cylinder') {
        if (pos.y + mobRadius <= col.yMin || pos.y - mobRadius >= col.yMax) continue;
        const dx = pos.x - col.x;
        const dz = pos.z - col.z;
        const d = Math.hypot(dx, dz);
        if (d < col.r + mobRadius && d > 0.001) {
          const nx = dx / d;
          const nz = dz / d;
          const pen = col.r + mobRadius - d;
          pos.x += nx * pen;
          pos.z += nz * pen;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) {
            vel.x -= nx * vn;
            vel.z -= nz * vn;
          }
        }
      }
    }
  }

  resolveCollisions(pos, vel, radius, wasGrounded = false, sound = null, sendSeFn = null) {
    let hitGround = false;
    let hardLandingVn = 0;
    let rodeMaimai = null;

    // 1. 島の起伏地形（半径 60m 以内）
    const rCenter = Math.hypot(pos.x, pos.z);
    if (rCenter <= this.islandRadius + radius * 0.45) {
      const groundY = this.getGroundHeightAt(pos.x, pos.z);
      if (pos.y - radius <= groundY && pos.y >= groundY - 2.8 && vel.y <= 3.5) {
        if (vel.y < hardLandingVn) hardLandingVn = vel.y;
        pos.y = groundY + radius;
        if (vel.y < 0) vel.y = 0;
        hitGround = true;
      } else if (pos.y < groundY - 2.8 && pos.y > -5.0) {
        // 島の側面（崖）からの押し出し
        const penR = this.islandRadius + radius - rCenter;
        if (penR > 0 && rCenter > 0.001) {
          const nx = pos.x / rCenter;
          const nz = pos.z / rCenter;
          pos.x += nx * penR;
          pos.z += nz * penR;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) {
            vel.x -= nx * vn;
            vel.z -= nz * vn;
          }
        }
      }
    }

    // 2. 巨木・大岩・巨大花・豆の木先端コライダー
    for (const col of this.staticColliders) {
      if (col.kind === 'cylinder') {
        if (pos.y + radius <= col.yMin || pos.y - radius >= col.yMax) continue;
        const dx = pos.x - col.x;
        const dz = pos.z - col.z;
        const horizDist = Math.hypot(dx, dz);
        if (horizDist >= col.r + radius) continue;

        if (pos.y >= col.yMax - 0.85 && vel.y <= 3.5 && horizDist < col.r + radius * 0.85) {
          pos.y = col.yMax + radius;
          if (vel.y < hardLandingVn) hardLandingVn = vel.y;
          if (vel.y < 0) vel.y = 0;
          hitGround = true;
          continue;
        }

        const nx = horizDist > 0.0001 ? dx / horizDist : 0;
        const nz = horizDist > 0.0001 ? dz / horizDist : 1;
        const pen = col.r + radius - horizDist;
        if (pen > 0) {
          pos.x += nx * pen;
          pos.z += nz * pen;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) {
            vel.x -= nx * vn;
            vel.z -= nz * vn;
          }
        }
      } else if (col.kind === 'ellipsoid') {
        const dx = pos.x - col.cx;
        const dy = pos.y - col.cy;
        const dz = pos.z - col.cz;
        const maxR = Math.max(col.rx, col.ry, col.rz) + radius;
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
        let pen = 0;
        if (k0 >= 1.0) {
          if (distSurf < radius) pen = radius - distSurf;
        } else {
          pen = radius + distSurf;
        }

        if (pen > 0) {
          pos.x += nx * pen;
          pos.y += ny * pen;
          pos.z += nz * pen;
          const vn = vel.x * nx + vel.y * ny + vel.z * nz;
          if (vn < 0) {
            if (ny > 0.45 && vn < hardLandingVn) hardLandingVn = vn;
            vel.x -= nx * vn;
            vel.y -= ny * vn;
            vel.z -= nz * vn;
          }
          if (ny > 0.45) hitGround = true;
        }
      }
    }

    // 3. 巨大なまいまいたちとの衝突（壁のように押される＋頭の上に乗れる）
    for (const gm of this.giantMaimais) {
      const dx = pos.x - gm.position.x;
      const dy = pos.y - gm.position.y;
      const dz = pos.z - gm.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const minDist = radius + gm.radius;
      if (distSq >= minDist * minDist || distSq < 0.00001) continue;

      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      const pen = minDist - dist;

      pos.x += nx * pen;
      pos.y += ny * pen;
      pos.z += nz * pen;

      const vn = vel.x * nx + vel.y * ny + vel.z * nz;
      if (vn < 0) {
        if (ny > 0.42 && vn < hardLandingVn) hardLandingVn = vn;
        vel.x -= nx * vn;
        vel.y -= ny * vn;
        vel.z -= nz * vn;
      }

      if (ny > 0.42 && vel.y <= 3.5) {
        hitGround = true;
        rodeMaimai = gm;
        if (!wasGrounded && vn < -4.0) {
          gm.triggerSquash(0.86);
          gm.setExpression('happy', 1.4);
          if (sound) sound.playLand();
          if (sendSeFn) sendSeFn('land');
        }
      }
    }

    return { hitGround, hardLandingVn, rodeMaimai };
  }

  update(dt, playerPos, isGuest = false, remoteGiantState = null, sound = null, canCollect = true) {
    this.time += dt;
    this.skyDome.position.copy(playerPos);

    for (const bc of this.bgClouds) {
      bc.group.position.y = bc.baseY + Math.sin(this.time * 0.8 + bc.phase) * 0.45;
    }

    if (isGuest && remoteGiantState) {
      this.applySyncState(remoteGiantState, dt);
    } else {
      for (const gm of this.giantMaimais) {
        gm.update(dt, this, this.giantMaimais, sound, playerPos);
      }
    }

    // コイン更新＆取得判定
    let gotSky = 0;
    const hitR = 0.6 + 1.0;
    const hitRSq = hitR * hitR;

    for (const coin of this.skyCoins) {
      if (coin.collecting) {
        coin.collectAge += dt;
        const t = coin.collectAge / 0.34;
        if (t >= 1.0) {
          coin.collecting = false;
          coin.mesh.visible = false;
          coin.mesh.scale.setScalar(1.0);
        } else {
          coin.mesh.visible = true;
          coin.mesh.position.y = coin.basePos.y + Math.sin(t * Math.PI * 0.5) * 1.45;
          coin.mesh.rotation.y += dt * 16.0;
          const sc = t < 0.25
            ? THREE.MathUtils.lerp(1.0, 1.35, t / 0.25)
            : THREE.MathUtils.lerp(1.35, 0.0, (t - 0.25) / 0.75);
          coin.mesh.scale.setScalar(Math.max(0.001, sc));
        }
        continue;
      }

      if (this.collectedCoins.has(coin.id)) {
        coin.mesh.visible = false;
        continue;
      }

      coin.mesh.visible = true;
      const bob = Math.sin(this.time * 2.4 + coin.phase) * 0.16;
      coin.mesh.position.y = coin.basePos.y + bob;
      coin.mesh.rotation.y = this.time * 2.2 + coin.phase;

      if (canCollect) {
        const dx = playerPos.x - coin.basePos.x;
        const dy = playerPos.y - (coin.basePos.y + bob);
        const dz = playerPos.z - coin.basePos.z;
        if (dx * dx + dy * dy + dz * dz <= hitRSq) {
          coin.collecting = true;
          coin.collectAge = 0;
          this.collectedCoins.add(coin.id);
          gotSky++;
        }
      }
    }

    const fellOut = playerPos.y < -22.0;

    return { gotSky, fellOut };
  }

  getShadowGroundInfo(px, py, pz) {
    let bestY = null;
    let bestNormal = this._tmpNormal;

    const rCenter = Math.hypot(px, pz);
    if (rCenter <= this.islandRadius) {
      const gy = this.getGroundHeightAt(px, pz);
      if (gy <= py + 0.35) {
        bestY = gy;
        this.getGroundNormalAt(px, pz, bestNormal);
      }
    }

    for (const col of this.staticColliders) {
      if (col.kind === 'cylinder') {
        const dSq = (px - col.x) * (px - col.x) + (pz - col.z) * (pz - col.z);
        if (dSq <= col.r * col.r && col.yMax <= py + 0.35 && (bestY === null || col.yMax > bestY)) {
          bestY = col.yMax;
          bestNormal.set(0, 1, 0);
        }
      } else if (col.kind === 'ellipsoid') {
        const ex = px - col.cx;
        const ez = pz - col.cz;
        const nx = ex / col.rx;
        const nz = ez / col.rz;
        const sq = nx * nx + nz * nz;
        if (sq < 0.98) {
          const ey = col.ry * Math.sqrt(1.0 - sq);
          const surfY = col.cy + ey;
          if (surfY <= py + 0.35 && (bestY === null || surfY > bestY)) {
            bestY = surfY;
            bestNormal
              .set(ex / (col.rx * col.rx), ey / (col.ry * col.ry), ez / (col.rz * col.rz))
              .normalize();
          }
        }
      }
    }

    for (const gm of this.giantMaimais) {
      const ex = px - gm.position.x;
      const ez = pz - gm.position.z;
      const dSq = ex * ex + ez * ez;
      if (dSq < gm.radius * gm.radius * 0.96) {
        const ey = Math.sqrt(gm.radius * gm.radius - dSq);
        const surfY = gm.position.y + ey;
        if (surfY <= py + 0.35 && (bestY === null || surfY > bestY)) {
          bestY = surfY;
          bestNormal.set(ex / gm.radius, ey / gm.radius, ez / gm.radius).normalize();
        }
      }
    }

    if (bestY === null) return null;
    return { y: bestY, normal: bestNormal };
  }
}