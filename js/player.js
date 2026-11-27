class Player {
  static _getSharedWingGeo() {
    if (Player._wingGeo) return Player._wingGeo;

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(-0.16, 0.16, -0.44, 0.34, -0.68, 0.25);
    wingShape.bezierCurveTo(-0.80, 0.17, -0.72, -0.02, -0.50, -0.08);
    wingShape.bezierCurveTo(-0.57, -0.18, -0.45, -0.30, -0.23, -0.20);
    wingShape.bezierCurveTo(-0.12, -0.14, -0.05, -0.07, 0, -0.07);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.018,
      bevelSegments: 2,
      curveSegments: 10
    });
    wingGeo.translate(0, 0, -0.0225);
    Player._wingGeo = wingGeo;
    return wingGeo;
  }

  static _getSharedStarGeo() {
    if (Player._starGeo) return Player._starGeo;
    Player._starGeo = new THREE.OctahedronGeometry(0.18, 0);
    return Player._starGeo;
  }

  constructor(scene, options = {}) {
    this.scene = scene;
    this.radius = 0.6;
    this.colorTheme = options.colorTheme || 'red';
    this.isRemote = !!options.isRemote;

    this.position = new THREE.Vector3(0, 4, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = false;
    this.groundCloud = null;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.hasWingsEquipped = false;
    this.wingFlapTimer = 0;
    this.wingAnimTime = 0;
    this.airJumpsLeft = 1; // 2段ジャンプ（羽装備時は5回）
    this.savedWingJumpsInAir = 5;
    this.unequippedWingsInAir = false;
    this.isRidingPartner = false; // 仲間の頭に乗っている状態

    // スーパーボールグミ タメ状態管理
    this.jumpPreHoldTimer = 0;
    this.isChargingJump = false;
    this.chargeTimer = 0;
    this.chargeRatio = 0;
    this.chargeMaxAnnounced = false;
    this.chargeShakeTime = 0;
    this.chargeSparkTimer = 0;

    // リモート補間ターゲット
    this.remoteTargetPos = new THREE.Vector3(0, 4, 0);
    this.remoteTargetQuat = new THREE.Quaternion();
    this.remoteTargetSquash = 1.0;

    // 最後に安全に着地していた情報
    this.safeCloud = null;
    this.safeLocalOffset = new THREE.Vector3(0, 3.5, 0);
    this.safeFallbackPos = new THREE.Vector3(0, 4.5, 0);

    // 転がり回転と向き管理（案A）
    this.rollQuat = new THREE.Quaternion();
    this.facingYaw = 0;
    this.isMoving = false;

    // 計算用一時オブジェクト（GC抑制）
    this._tmpVec1 = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._tmpAxisY = new THREE.Vector3(0, 1, 0);
    this._tmpZAxis = new THREE.Vector3(0, 0, 1);
    this._tmpQuat1 = new THREE.Quaternion();

    // ぽよん（Squash & Stretch）用スプリング
    this.squashY = 1.0;
    this.squashVel = 0;

    // 表情・吹き出し管理
    this.expression = 'normal';
    this.exprTimer = 0;
    this.blinkTimer = 2.5;
    this.isBlinking = false;
    this.chatText = '';

    // エフェクト用リング＆パーティクル管理
    this.jumpRings = [];
    this.chargeParticles = [];

    this.group = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    this._createVisuals();
    this.scene.add(this.group);
  }

  _createVisuals() {
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 1024;
    this.faceCanvas.height = 512;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.encoding = THREE.sRGBEncoding;

    this._drawFace('normal', false);

    const sphereGeo = new THREE.SphereGeometry(this.radius, 36, 36);
    const sphereMat = new THREE.MeshBasicMaterial({
      map: this.faceTexture
    });
    this.sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.sphereMesh.rotation.y = -Math.PI / 2;

    this.rollHolder = new THREE.Group();
    this.rollHolder.add(this.sphereMesh);
    this.bodyPivot.add(this.rollHolder);

    const outlineGeo = new THREE.SphereGeometry(this.radius * 1.075, 32, 32);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x3b0d0c,
      side: THREE.BackSide
    });
    this.outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
    this.bodyPivot.add(this.outlineMesh);

    this._createWings();
    this._createChargeAura();

    const shadowGeo = new THREE.CircleGeometry(this.radius * 0.95, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x628eb8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    this.dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.dropShadow.visible = false;
    this.scene.add(this.dropShadow);
  }

  _createWings() {
    const wingGeo = Player._getSharedWingGeo();
    const wingMat = new THREE.MeshToonMaterial({ color: 0xf4f9ff });
    const wingOutlineMat = new THREE.MeshBasicMaterial({
      color: 0x465275,
      side: THREE.BackSide
    });

    this.wingHolder = new THREE.Group();
    this.wingHolder.visible = false;
    this.rollHolder.add(this.wingHolder);

    this.leftWingPivot = new THREE.Group();
    this.leftWingPivot.position.set(-0.14, 0.12, -0.52);
    this.leftWingPivot.add(new THREE.Mesh(wingGeo, wingMat));
    const leftWingOut = new THREE.Mesh(wingGeo, wingOutlineMat);
    leftWingOut.scale.set(1.08, 1.08, 1.28);
    this.leftWingPivot.add(leftWingOut);
    this.wingHolder.add(this.leftWingPivot);

    this.rightWingPivot = new THREE.Group();
    this.rightWingPivot.position.set(0.14, 0.12, -0.52);
    this.rightWingPivot.scale.x = -1;
    this.rightWingPivot.add(new THREE.Mesh(wingGeo, wingMat));
    const rightWingOut = new THREE.Mesh(wingGeo, wingOutlineMat);
    rightWingOut.scale.set(1.08, 1.08, 1.28);
    this.rightWingPivot.add(rightWingOut);
    this.wingHolder.add(this.rightWingPivot);
  }

  _createChargeAura() {
    const innerGeo = new THREE.RingGeometry(0.46, 0.84, 30);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xff3355,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    this.chargeAuraMesh = new THREE.Mesh(innerGeo, innerMat);
    this.chargeAuraMesh.rotation.x = -Math.PI / 2;
    this.chargeAuraMesh.visible = false;
    this.group.add(this.chargeAuraMesh);

    const outerGeo = new THREE.RingGeometry(0.88, 1.18, 30);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff708d,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    this.chargeAuraOuterMesh = new THREE.Mesh(outerGeo, outerMat);
    this.chargeAuraOuterMesh.rotation.x = -Math.PI / 2;
    this.chargeAuraOuterMesh.visible = false;
    this.group.add(this.chargeAuraOuterMesh);
  }

  getMaxAirJumps() {
    return this.hasWingsEquipped ? 5 : 1;
  }

  setWingsEquipped(equipped) {
    const next = !!equipped;
    if (this.hasWingsEquipped === next) return;
    this.hasWingsEquipped = next;
    if (this.wingHolder) {
      this.wingHolder.visible = next;
    }
    if (next) {
      if (this.isGrounded) {
        this.airJumpsLeft = 5;
        this.savedWingJumpsInAir = 5;
        this.unequippedWingsInAir = false;
      } else if (this.unequippedWingsInAir) {
        // 空中で外して再装備しても、着地するまでは元の残り回数以上に回復しない
        const usedWhileOff = this.airJumpsLeft === 0 && this.savedWingJumpsInAir > 0 ? 1 : 0;
        this.airJumpsLeft = Math.max(0, Math.min(5, this.savedWingJumpsInAir - usedWhileOff));
        this.unequippedWingsInAir = false;
      }
      this.triggerWingFlap();
    } else {
      if (!this.isGrounded) {
        this.savedWingJumpsInAir = this.airJumpsLeft;
        this.unequippedWingsInAir = true;
      }
      this.airJumpsLeft = Math.min(this.airJumpsLeft, 1);
    }
  }

  triggerWingFlap() {
    this.wingFlapTimer = 0.36;
  }

  _updateWingAnimation(dt) {
    if (this.isGrounded) {
      this.savedWingJumpsInAir = this.hasWingsEquipped ? 5 : 1;
      this.unequippedWingsInAir = false;
    }
    if (!this.wingHolder) return;
    this.wingHolder.visible = this.hasWingsEquipped;
    if (!this.hasWingsEquipped) return;

    if (this.wingFlapTimer > 0) {
      this.wingFlapTimer = Math.max(0, this.wingFlapTimer - dt);
    }

    const isFlappingHard = this.wingFlapTimer > 0;
    const flapSpeed = isFlappingHard ? 20.0 : (!this.isGrounded ? 12.0 : 5.2);
    const flapAmp = isFlappingHard ? 0.64 : (!this.isGrounded ? 0.42 : 0.18);

    this.wingAnimTime += dt * flapSpeed;
    const flap = Math.sin(this.wingAnimTime) * flapAmp;
    const liftZ = Math.sin(this.wingAnimTime) * (flapAmp * 0.32);

    this.leftWingPivot.rotation.y = -0.58 + flap * 0.62;
    this.leftWingPivot.rotation.z = liftZ;
    this.rightWingPivot.rotation.y = 0.58 - flap * 0.62;
    this.rightWingPivot.rotation.z = -liftZ;
  }

  setColorTheme(theme) {
    if (this.colorTheme !== theme) {
      this.colorTheme = theme;
      this._drawFace(this.expression, this.isBlinking);
    }
  }

  setChatText(text) {
    const clean = typeof text === 'string' ? [...text].slice(0, 20).join('') : '';
    this.chatText = clean;
  }

  _drawFace(expr, blinking) {
    const ctx = this.faceCtx;
    const w = 1024;
    const h = 512;
    ctx.clearRect(0, 0, w, h);

    const isYellow = this.colorTheme === 'yellow';

    ctx.fillStyle = isYellow ? '#ffd32c' : '#f23b3b';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.49;

    ctx.fillStyle = isYellow ? 'rgba(255, 128, 96, 0.52)' : 'rgba(255, 130, 150, 0.45)';
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
        const eyeRadius = expr === 'fall' ? 25 : 22;

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

    if (expr === 'fall') {
      ctx.fillStyle = isYellow ? '#b53424' : '#5e1111';
      ctx.beginPath();
      ctx.arc(cx, mouthY + 20, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (expr === 'land') {
      ctx.beginPath();
      ctx.moveTo(cx - 32, mouthY + 10);
      ctx.quadraticCurveTo(cx - 16, mouthY + 24, cx, mouthY + 10);
      ctx.quadraticCurveTo(cx + 16, mouthY + 24, cx + 32, mouthY + 10);
      ctx.stroke();
    } else {
      const mouthW = expr === 'jump' || expr === 'happy' ? 66 : 58;
      const mouthH = expr === 'jump' || expr === 'happy' ? 38 : 32;

      ctx.fillStyle = isYellow ? '#8f251b' : '#4a0b0b';
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
      ctx.fillStyle = isYellow ? '#d9483b' : '#8f1d1d';
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

  clearJumpCharge() {
    this.jumpPreHoldTimer = 0;
    this.isChargingJump = false;
    this.chargeTimer = 0;
    this.chargeRatio = 0;
    this.chargeMaxAnnounced = false;
    this.chargeSparkTimer = 0;
    if (this.bodyPivot) {
      this.bodyPivot.position.set(0, 0, 0);
    }
    if (this.chargeAuraMesh) {
      this.chargeAuraMesh.visible = false;
    }
    if (this.chargeAuraOuterMesh) {
      this.chargeAuraOuterMesh.visible = false;
    }
  }

  spawnDoubleJumpRing() {
    const geo = new THREE.RingGeometry(0.28, 0.56, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.position.x, this.position.y - this.radius * 0.8, this.position.z);
    this.scene.add(mesh);

    this.jumpRings.push({
      mesh,
      age: 0,
      life: 0.36,
      maxGrow: 1.9,
      riseSpeed: 0
    });
  }

  spawnSuperJumpEffect(isMax = false) {
    const baseY = this.position.y - this.radius * 0.72;
    const ringConfigs = isMax
      ? [
          { inner: 0.40, outer: 0.86, color: 0xff1f4b, life: 0.68, grow: 5.4, rise: 1.0 },
          { inner: 0.34, outer: 0.70, color: 0xff5470, life: 0.60, grow: 4.3, rise: 2.8 },
          { inner: 0.28, outer: 0.60, color: 0xff859d, life: 0.54, grow: 3.4, rise: 4.8 },
          { inner: 0.24, outer: 0.50, color: 0xffb3c1, life: 0.48, grow: 2.6, rise: 6.8 },
          { inner: 0.22, outer: 0.44, color: 0xffffff, life: 0.42, grow: 2.0, rise: 8.6 }
        ]
      : [
          { inner: 0.34, outer: 0.68, color: 0xff3b5c, life: 0.48, grow: 3.4, rise: 0.8 },
          { inner: 0.26, outer: 0.54, color: 0xff758f, life: 0.42, grow: 2.5, rise: 2.0 },
          { inner: 0.20, outer: 0.42, color: 0xffccd5, life: 0.36, grow: 1.8, rise: 3.2 }
        ];

    for (const cfg of ringConfigs) {
      const geo = new THREE.RingGeometry(cfg.inner, cfg.outer, 30);
      const mat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(this.position.x, baseY, this.position.z);
      this.scene.add(mesh);
      this.jumpRings.push({
        mesh,
        age: 0,
        life: cfg.life,
        maxGrow: cfg.grow,
        riseSpeed: cfg.rise
      });
    }

    const starGeo = Player._getSharedStarGeo();
    const palette = isMax
      ? [0xff1e42, 0xff4769, 0xff708d, 0xff9eb3, 0xffd1d9, 0xffffff]
      : [0xff3355, 0xff6b85, 0xffa6b8, 0xffffff];
    const count = isMax ? 34 : 14;

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: palette[i % palette.length],
        transparent: true,
        opacity: 0.98
      });
      const mesh = new THREE.Mesh(starGeo, mat);
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const isFountain = isMax && i % 2 === 1;
      const horizSpeed = isMax
        ? (isFountain ? (1.8 + Math.random() * 3.4) : (5.2 + Math.random() * 5.2))
        : (3.2 + Math.random() * 2.8);
      const upSpeed = isMax
        ? (isFountain ? (9.5 + Math.random() * 8.5) : (3.8 + Math.random() * 6.0))
        : (2.4 + Math.random() * 3.8);
      const startScale = isMax ? (1.05 + Math.random() * 0.9) : (0.75 + Math.random() * 0.5);

      mesh.position.set(
        this.position.x + Math.cos(ang) * 0.35,
        baseY + 0.15,
        this.position.z + Math.sin(ang) * 0.35
      );
      mesh.scale.setScalar(startScale);
      this.scene.add(mesh);

      this.chargeParticles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(ang) * horizSpeed, upSpeed, Math.sin(ang) * horizSpeed),
        rotVel: (Math.random() - 0.5) * 16,
        age: 0,
        life: isMax ? (0.68 + Math.random() * 0.32) : (0.44 + Math.random() * 0.2),
        startScale
      });
    }
  }

  _spawnChargeSpark(isMax) {
    const starGeo = Player._getSharedStarGeo();
    const redPalette = [0xff1e42, 0xff4769, 0xff758f, 0xffb3c1];
    const spawnCount = isMax ? 3 : 2;

    for (let i = 0; i < spawnCount; i++) {
      const color = redPalette[Math.floor(Math.random() * redPalette.length)];
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(starGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const rDist = isMax ? (0.55 + Math.random() * 0.95) : (0.55 + Math.random() * 0.65);
      mesh.position.set(
        this.position.x + Math.cos(ang) * rDist,
        this.position.y - this.radius * 0.42,
        this.position.z + Math.sin(ang) * rDist
      );
      const startScale = isMax ? (0.78 + Math.random() * 0.45) : (0.52 + Math.random() * 0.32);
      mesh.scale.setScalar(startScale);
      this.scene.add(mesh);

      this.chargeParticles.push({
        mesh,
        vel: new THREE.Vector3(
          -Math.cos(ang) * (isMax ? 0.5 : 0.9),
          isMax ? (3.8 + Math.random() * 2.8) : (2.4 + Math.random() * 1.8),
          -Math.sin(ang) * (isMax ? 0.5 : 0.9)
        ),
        rotVel: (Math.random() - 0.5) * 12,
        age: 0,
        life: isMax ? 0.46 : 0.38,
        startScale
      });
    }
  }

  resetTo(pos) {
    this.position.copy(pos);
    this.remoteTargetPos.copy(pos);
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.groundCloud = null;
    this.isRidingPartner = false;
    this.clearJumpCharge();
    this.airJumpsLeft = this.getMaxAirJumps();
    this.rollQuat.setFromAxisAngle(this._tmpAxisY, this.facingYaw);
    this.remoteTargetQuat.copy(this.rollQuat);
    this.triggerSquash(1.3);
    this.setExpression('happy', 0.6);
  }

  _updateEffectsAndBlink(dt) {
    for (let i = this.jumpRings.length - 1; i >= 0; i--) {
      const ring = this.jumpRings[i];
      ring.age += dt;
      const t = ring.age / ring.life;
      if (t >= 1) {
        this.scene.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
        this.jumpRings.splice(i, 1);
      } else {
        const s = 1 + t * (ring.maxGrow || 1.9);
        ring.mesh.scale.set(s, s, 1);
        if (ring.riseSpeed) {
          ring.mesh.position.y += ring.riseSpeed * dt;
        }
        ring.mesh.material.opacity = 0.9 * (1 - t);
      }
    }

    for (let i = this.chargeParticles.length - 1; i >= 0; i--) {
      const p = this.chargeParticles[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.chargeParticles.splice(i, 1);
      } else {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 6.5 * dt;
        p.mesh.rotation.y += p.rotVel * dt;
        p.mesh.rotation.x += p.rotVel * 0.6 * dt;
        const sc = p.startScale * (1 - t * 0.72);
        p.mesh.scale.setScalar(Math.max(0.02, sc));
        p.mesh.material.opacity = 0.96 * (1 - t);
      }
    }

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.11 : (2.2 + Math.random() * 2.5);
      this._drawFace(this.expression, this.isBlinking);
    }
  }

  _updateDropShadow(shadowInfo) {
    if (shadowInfo) {
      const dist = Math.max(0, this.position.y - this.radius - shadowInfo.y);
      if (dist < 18) {
        this.dropShadow.visible = true;
        this.dropShadow.position.set(
          this.position.x + shadowInfo.normal.x * 0.04,
          shadowInfo.y + shadowInfo.normal.y * 0.04,
          this.position.z + shadowInfo.normal.z * 0.04
        );
        this.dropShadow.quaternion.setFromUnitVectors(
          this._tmpZAxis,
          shadowInfo.normal
        );
        const s = Math.max(0.35, 1.0 - dist * 0.045);
        this.dropShadow.scale.set(s, s, 1);
        this.dropShadow.material.opacity = Math.max(0.04, 0.3 - dist * 0.016);
      } else {
        this.dropShadow.visible = false;
      }
    } else {
      this.dropShadow.visible = false;
    }
  }

  updateVisuals(dt, shadowInfo = null) {
    this._updateEffectsAndBlink(dt);

    if (this.isChargingJump) {
      this.chargeShakeTime += dt;
      this.setExpression('land');

      const targetSquash = THREE.MathUtils.lerp(0.92, 0.38, this.chargeRatio);
      this.squashY = THREE.MathUtils.lerp(this.squashY, targetSquash, Math.min(1, dt * 14));
      this.squashVel = 0;

      const shakeAmp = 0.016 + this.chargeRatio * 0.052;
      this.bodyPivot.position.set(
        Math.sin(this.chargeShakeTime * 48) * shakeAmp,
        0,
        Math.cos(this.chargeShakeTime * 57) * shakeAmp
      );

      const isMax = this.chargeRatio >= 1.0;
      const auraY = -(this.squashY * this.radius) + 0.08;

      if (this.chargeAuraMesh) {
        this.chargeAuraMesh.visible = true;
        const pulse = isMax
          ? (1.28 + Math.sin(this.chargeShakeTime * 20) * 0.2)
          : (0.78 + this.chargeRatio * 0.45);
        this.chargeAuraMesh.scale.setScalar(pulse);
        this.chargeAuraMesh.position.y = auraY;
        this.chargeAuraMesh.material.color.setHex(isMax ? 0xff1e42 : 0xff4769);
        this.chargeAuraMesh.material.opacity = isMax
          ? (0.8 + Math.sin(this.chargeShakeTime * 22) * 0.18)
          : (0.45 + this.chargeRatio * 0.4);
      }

      if (this.chargeAuraOuterMesh) {
        this.chargeAuraOuterMesh.visible = this.chargeRatio > 0.25 || isMax;
        if (this.chargeAuraOuterMesh.visible) {
          const outerPulse = isMax
            ? (1.52 + Math.cos(this.chargeShakeTime * 16) * 0.24)
            : (0.85 + this.chargeRatio * 0.55);
          this.chargeAuraOuterMesh.scale.setScalar(outerPulse);
          this.chargeAuraOuterMesh.position.y = auraY + 0.02;
          this.chargeAuraOuterMesh.material.color.setHex(isMax ? 0xff859d : 0xff9eb3);
          this.chargeAuraOuterMesh.material.opacity = isMax ? 0.72 : (0.25 + this.chargeRatio * 0.35);
        }
      }

      this.chargeSparkTimer -= dt;
      if (this.chargeSparkTimer <= 0) {
        this.chargeSparkTimer = isMax ? 0.055 : 0.1;
        this._spawnChargeSpark(isMax);
      }
    } else {
      this.bodyPivot.position.set(0, 0, 0);
      if (this.chargeAuraMesh) {
        this.chargeAuraMesh.visible = false;
      }
      if (this.chargeAuraOuterMesh) {
        this.chargeAuraOuterMesh.visible = false;
      }

      if (this.exprTimer > 0) {
        this.exprTimer -= dt;
        if (this.exprTimer <= 0) {
          this.setExpression('normal');
        }
      } else if (!this.isGrounded) {
        if (this.velocity.y < -12) {
          this.setExpression('fall');
        } else if (this.velocity.y > 2) {
          this.setExpression('jump');
        }
      } else if (this.expression !== 'normal' && this.expression !== 'land') {
        this.setExpression('normal');
      }

      const k = 190;
      const damp = 14;
      const force = (1.0 - this.squashY) * k - this.squashVel * damp;
      this.squashVel += force * dt;
      this.squashY += this.squashVel * dt;
      this.squashY = THREE.MathUtils.clamp(this.squashY, 0.35, 1.72);
    }

    const xzScale = 1 / Math.sqrt(this.squashY);
    this.bodyPivot.scale.set(xzScale, this.squashY, xzScale);

    const bottomOffset = (this.squashY - 1.0) * this.radius * (this.isChargingJump ? 0.94 : 0.65);
    this.group.position.set(this.position.x, this.position.y + bottomOffset, this.position.z);

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizSpeed > 0.35) {
      this.facingYaw = Math.atan2(this.velocity.x, this.velocity.z);
    }

    if (horizSpeed > 0.5 && this.isGrounded && !this.isRidingPartner) {
      this._tmpVec1.set(this.velocity.x, 0, this.velocity.z).normalize();
      this._tmpVec2.crossVectors(this._tmpAxisY, this._tmpVec1).normalize();
      const angle = (horizSpeed * dt) / this.radius;
      this._tmpQuat1.setFromAxisAngle(this._tmpVec2, angle);
      this.rollQuat.premultiply(this._tmpQuat1).normalize();
    } else {
      this._tmpQuat1.setFromAxisAngle(this._tmpAxisY, this.facingYaw);
      const recoverSpeed = this.isGrounded ? 10.0 : 5.5;
      this.rollQuat.slerp(this._tmpQuat1, Math.min(1, recoverSpeed * dt));
    }

    this.rollHolder.quaternion.copy(this.rollQuat);
    this._updateWingAnimation(dt);
    this._updateDropShadow(shadowInfo);
  }

  applyRemoteState(state) {
    if (!state) return;
    this.remoteTargetPos.set(state.p[0], state.p[1], state.p[2]);
    this.velocity.set(state.v[0], state.v[1], state.v[2]);
    this.remoteTargetQuat.set(state.q[0], state.q[1], state.q[2], state.q[3]);
    this.remoteTargetSquash = state.sq;
    this.isGrounded = !!state.g;
    this.isRidingPartner = !!state.rd;
    this.isChargingJump = !!state.cg;
    if (typeof state.wg !== 'undefined') {
      this.setWingsEquipped(!!state.wg);
    }
    if (state.ex && this.expression !== state.ex) {
      this.setExpression(state.ex);
    }
    if (typeof state.ch === 'string') {
      this.setChatText(state.ch);
    }
  }

  updateRemoteVisuals(dt, shadowInfo = null, ridingHostPos = null) {
    this._updateEffectsAndBlink(dt);

    const posAlpha = 1 - Math.exp(-18 * dt);

    if (this.isRidingPartner && ridingHostPos) {
      // 相手が自分の頭に乗っている間は、遅延なく自分の頭上にダイレクト固定する
      this.position.set(
        ridingHostPos.x,
        ridingHostPos.y + this.radius * 2 - 0.04,
        ridingHostPos.z
      );
      this.remoteTargetPos.copy(this.position);
    } else if (this.position.distanceTo(this.remoteTargetPos) > 12) {
      this.position.copy(this.remoteTargetPos);
    } else {
      this.position.lerp(this.remoteTargetPos, posAlpha);
    }

    this.rollQuat.slerp(this.remoteTargetQuat, posAlpha);
    this.squashY = THREE.MathUtils.lerp(this.squashY, this.remoteTargetSquash, posAlpha);

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizSpeed > 0.35) {
      this.facingYaw = Math.atan2(this.velocity.x, this.velocity.z);
    }

    const xzScale = 1 / Math.sqrt(this.squashY);
    this.bodyPivot.scale.set(xzScale, this.squashY, xzScale);

    if (this.isChargingJump) {
      this.chargeShakeTime += dt;
      const isMax = this.squashY <= 0.44;
      const shakeAmp = isMax ? 0.05 : 0.03;
      this.bodyPivot.position.set(
        Math.sin(this.chargeShakeTime * 48) * shakeAmp,
        0,
        Math.cos(this.chargeShakeTime * 57) * shakeAmp
      );

      this.chargeSparkTimer -= dt;
      if (this.chargeSparkTimer <= 0) {
        this.chargeSparkTimer = isMax ? 0.07 : 0.13;
        this._spawnChargeSpark(isMax);
      }
    } else {
      this.bodyPivot.position.set(0, 0, 0);
    }

    const bottomOffset = (this.squashY - 1.0) * this.radius * (this.isChargingJump ? 0.94 : 0.65);
    this.group.position.set(this.position.x, this.position.y + bottomOffset, this.position.z);
    this.rollHolder.quaternion.copy(this.rollQuat);
    this._updateWingAnimation(dt);
    this._updateDropShadow(shadowInfo);
  }

  setScene(nextScene) {
    if (!nextScene || this.scene === nextScene) return;
    if (this.scene) {
      this.scene.remove(this.group);
      this.scene.remove(this.dropShadow);
      for (const ring of this.jumpRings) {
        this.scene.remove(ring.mesh);
      }
      for (const p of this.chargeParticles) {
        this.scene.remove(p.mesh);
      }
    }
    this.scene = nextScene;
    this.scene.add(this.group);
    this.scene.add(this.dropShadow);
    for (const ring of this.jumpRings) {
      this.scene.add(ring.mesh);
    }
    for (const p of this.chargeParticles) {
      this.scene.add(p.mesh);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.dropShadow);
    for (const ring of this.jumpRings) {
      this.scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      ring.mesh.material.dispose();
    }
    this.jumpRings = [];
    for (const p of this.chargeParticles) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this.chargeParticles = [];
  }
}

Player._wingGeo = null;
Player._starGeo = null;