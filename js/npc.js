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
    this._tmpSyncTarget = new THREE.Vector3();

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
    this.group.scale.setScalar(0.68);
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
    this._tmpSyncTarget.set(state.p[0], state.p[1], state.p[2]);
    const alpha = 1 - Math.exp(-10 * dt);
    if (this.group.position.distanceTo(this._tmpSyncTarget) > 20) {
      this.group.position.copy(this._tmpSyncTarget);
    } else {
      this.group.position.lerp(this._tmpSyncTarget, alpha);
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

class StarBuddy {
  constructor(startPos) {
    this.initialPos = startPos.clone();
    this.position = startPos.clone();
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.radius = 0.64;

    this.isGrounded = false;
    this.groundCloud = null;
    this.lastCloud = null;
    this.safeCloud = null;
    this.safeLocalOffset = new THREE.Vector3(0, 3.2, 0);
    this.safeFallbackPos = startPos.clone();

    this.facingYaw = 0.4;
    this.jumpWaitTimer = 0.6;
    this.squashY = 1.0;
    this.squashVel = 0;

    // 鬼ごっこ状態: 'idle' | 'asking' | 'preparing' | 'chasing'
    this.tagState = 'idle';
    this.prepareTimer = 0;
    this.onTagStarted = null;

    // 計算用一時オブジェクト（GC抑制）
    this._tmpSyncTarget = new THREE.Vector3();
    this._tmpZAxis = new THREE.Vector3(0, 0, 1);

    // 表情管理
    this.expression = 'normal';
    this.exprTimer = 0;
    this.moodTimer = 3.0;
    this.blinkTimer = 2.1;
    this.isBlinking = false;

    this.group = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    this._createVisuals();
    this.group.position.copy(startPos);
  }

  reset() {
    this.position.copy(this.initialPos);
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.groundCloud = null;
    this.lastCloud = null;
    this.safeCloud = null;
    this.safeLocalOffset.set(0, 3.2, 0);
    this.safeFallbackPos.copy(this.initialPos);
    this.facingYaw = 0.4;
    this.jumpWaitTimer = 0.6;
    this.squashY = 1.0;
    this.squashVel = 0;
    this.tagState = 'idle';
    this.prepareTimer = 0;
    this.group.position.copy(this.initialPos);
    this.group.rotation.y = this.facingYaw;
    this.setExpression('normal');
  }

  _createVisuals() {
    const starShape = new THREE.Shape();
    const outerR = 0.66;
    const innerR = 0.34;
    const points = 5;

    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points + Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();

    const rawGeo = new THREE.ExtrudeGeometry(starShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.28,
      bevelSize: 0.12,
      bevelSegments: 7,
      curveSegments: 12
    });
    rawGeo.center();
    rawGeo.computeBoundingBox();

    const size = new THREE.Vector3();
    rawGeo.boundingBox.getSize(size);
    const span = Math.max(size.x, size.y) * 1.02;

    const starGeo = rawGeo.toNonIndexed();
    starGeo.computeVertexNormals();
    const posAttr = starGeo.attributes.position;
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
          ? 0.25 + (vx / span) * 0.48
          : 0.75 + (-vx / span) * 0.48;
        const v = 0.5 + (vy / span) * 0.94;
        uvArray[idx * 2] = u;
        uvArray[idx * 2 + 1] = v;
      }
    }
    starGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));

    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.encoding = THREE.sRGBEncoding;

    this._drawTexture('normal', false);

    const starMat = new THREE.MeshBasicMaterial({ map: this.texture });
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x5c3306,
      side: THREE.BackSide
    });

    const starMesh = new THREE.Mesh(starGeo, starMat);
    this.bodyPivot.add(starMesh);

    const starOutline = new THREE.Mesh(starGeo, outlineMat);
    starOutline.scale.set(1.075, 1.075, 1.12);
    this.bodyPivot.add(starOutline);

    const shadowGeo = new THREE.CircleGeometry(this.radius * 0.9, 20);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x628eb8,
      transparent: true,
      opacity: 0.26,
      depthWrite: false
    });
    this.dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.dropShadow.visible = false;
  }

  _drawHalfBase(offsetX) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#ffe359');
    grad.addColorStop(0.65, '#ffca28');
    grad.addColorStop(1, '#ffa726');
    ctx.fillStyle = grad;
    ctx.fillRect(offsetX, 0, 512, 512);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(offsetX + 256, 118, 38, 18, 0, 0, Math.PI * 2);
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
    const eyeOffX = 48;

    ctx.fillStyle = 'rgba(255, 128, 102, 0.56)';
    ctx.beginPath();
    ctx.ellipse(cx - 72, cy + 16, 18, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 72, cy + 16, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawOpenEye = (ex, ey, r = 18) => {
      ctx.fillStyle = '#3b1e04';
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 5, ey - 6, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawHappyArc = (ex, ey) => {
      ctx.strokeStyle = '#3b1e04';
      ctx.lineWidth = 8.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ey + 6, 15, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    };

    const drawClosedBlink = (ex, ey) => {
      ctx.strokeStyle = '#3b1e04';
      ctx.lineWidth = 7.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 14, ey + 2);
      ctx.quadraticCurveTo(ex, ey + 9, ex + 14, ey + 2);
      ctx.stroke();
    };

    if (blinking) {
      drawClosedBlink(cx - eyeOffX, eyeY);
      drawClosedBlink(cx + eyeOffX, eyeY);
    } else if (expr === 'happy') {
      drawHappyArc(cx - eyeOffX, eyeY);
      drawHappyArc(cx + eyeOffX, eyeY);
    } else if (expr === 'wink') {
      drawOpenEye(cx - eyeOffX, eyeY, 18);
      drawHappyArc(cx + eyeOffX, eyeY);
    } else if (expr === 'jump') {
      drawOpenEye(cx - eyeOffX, eyeY, 20);
      drawOpenEye(cx + eyeOffX, eyeY, 20);
    } else {
      drawOpenEye(cx - eyeOffX, eyeY, 18);
      drawOpenEye(cx + eyeOffX, eyeY, 18);
    }

    const mouthY = cy + 16;
    ctx.strokeStyle = '#3b1e04';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (expr === 'happy' || expr === 'jump') {
      const mw = expr === 'happy' ? 46 : 40;
      const mh = expr === 'happy' ? 32 : 28;
      ctx.fillStyle = '#e05338';
      ctx.beginPath();
      ctx.moveTo(cx - mw, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + 8, cx + mw, mouthY);
      ctx.quadraticCurveTo(cx + mw * 0.72, mouthY + mh * 1.6, cx, mouthY + mh * 1.6);
      ctx.quadraticCurveTo(cx - mw * 0.72, mouthY + mh * 1.6, cx - mw, mouthY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, mouthY + 2, 26, 0.16 * Math.PI, 0.84 * Math.PI);
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

  triggerSquash(targetScaleY) {
    this.squashY = targetScaleY;
    this.squashVel = 0;
  }

  placeOnCloud(cloud) {
    if (!cloud) return;
    const col = cloud.colliders[0];
    const x = cloud.position.x + col.offset.x;
    const y = cloud.position.y + col.offset.y + col.ry + this.radius + 0.5;
    const z = cloud.position.z + col.offset.z;
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.groundCloud = cloud;
    this.safeCloud = cloud;
    this.safeLocalOffset.set(col.offset.x, col.offset.y + col.ry + this.radius + 0.5, col.offset.z);
    this.safeFallbackPos.copy(this.position);
    this.group.position.copy(this.position);
  }

  _launchToCloud(targetCloud, flightTime = null) {
    const col = targetCloud.colliders[0];
    const tx = targetCloud.position.x + col.offset.x;
    const ty = targetCloud.position.y + col.offset.y + col.ry + this.radius + 0.2;
    const tz = targetCloud.position.z + col.offset.z;

    const horizDist = Math.hypot(tx - this.position.x, tz - this.position.z);
    const T = flightTime || THREE.MathUtils.clamp(0.65 + horizDist * 0.025, 0.72, 1.32);

    const vx = (tx - this.position.x) / T;
    const vz = (tz - this.position.z) / T;
    const vy = (ty - this.position.y + 0.5 * 28.0 * T * T) / T;

    this.lastCloud = this.groundCloud;
    this.velocity.set(vx, vy, vz);
    this.facingYaw = Math.atan2(vx, vz);
    this.isGrounded = false;
    this.groundCloud = null;
    this.triggerSquash(1.38);
    this.setExpression('jump', 0.45);
  }

  startAsking() {
    if (this.tagState === 'idle') {
      this.tagState = 'asking';
      this.setExpression('happy', 3.5);
    }
  }

  cancelAsking() {
    if (this.tagState === 'asking') {
      this.tagState = 'idle';
      this.jumpWaitTimer = 0.5;
    }
  }

  startTagPrepare(playerPos, world) {
    this.tagState = 'preparing';
    this.prepareTimer = 0;
    this.setExpression('happy', 2.0);

    let bestCloud = null;
    let bestScore = Infinity;

    if (world) {
      for (const c of world.clouds) {
        if (c === this.groundCloud || c.type === 'bouncy') continue;
        const dToPlayer = Math.hypot(c.position.x - playerPos.x, c.position.z - playerPos.z);
        const dToStar = Math.hypot(c.position.x - this.position.x, c.position.z - this.position.z);
        if (dToPlayer >= 14 && dToPlayer <= 28 && dToStar >= 9 && dToStar <= 30) {
          const score = Math.abs(dToPlayer - 19);
          if (score < bestScore) {
            bestScore = score;
            bestCloud = c;
          }
        }
      }
    }

    if (bestCloud) {
      this._launchToCloud(bestCloud, 1.12);
    } else {
      const yaw = Math.atan2(this.position.x - playerPos.x, this.position.z - playerPos.z);
      this.facingYaw = yaw;
      this.velocity.set(Math.sin(yaw) * 10.5, 13.5, Math.cos(yaw) * 10.5);
      this.isGrounded = false;
      this.groundCloud = null;
      this.triggerSquash(1.4);
    }
  }

  catchInTag() {
    this.tagState = 'idle';
    this.prepareTimer = 0;
    this.jumpWaitTimer = 1.2;
    this.velocity.set(0, 8.0, 0);
    this.isGrounded = false;
    this.triggerSquash(1.42);
    this.setExpression('happy', 3.5);
  }

  getSyncState() {
    return {
      p: [this.position.x, this.position.y, this.position.z],
      ry: this.group.rotation.y,
      sq: this.squashY,
      ex: this.expression,
      ts: this.tagState
    };
  }

  _updateVisualCommon(dt, world) {
    const xzScale = 1 / Math.sqrt(this.squashY);
    this.bodyPivot.scale.set(xzScale, this.squashY, xzScale);

    const bottomOffset = (this.squashY - 1.0) * this.radius * 0.6;
    this.group.position.set(this.position.x, this.position.y + bottomOffset, this.position.z);

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.11 : (2.1 + Math.random() * 2.5);
      this._drawTexture(this.expression, this.isBlinking);
    }

    const shadowInfo = world ? world.getShadowGroundInfo(this.position.x, this.position.y, this.position.z) : null;
    if (shadowInfo) {
      const dist = Math.max(0, this.position.y - this.radius - shadowInfo.y);
      if (dist < 18) {
        this.dropShadow.visible = true;
        this.dropShadow.position.set(
          this.position.x + shadowInfo.normal.x * 0.04,
          shadowInfo.y + shadowInfo.normal.y * 0.04,
          this.position.z + shadowInfo.normal.z * 0.04
        );
        this.dropShadow.quaternion.setFromUnitVectors(this._tmpZAxis, shadowInfo.normal);
        const s = Math.max(0.35, 1.0 - dist * 0.045);
        this.dropShadow.scale.set(s, s, 1);
        this.dropShadow.material.opacity = Math.max(0.04, 0.28 - dist * 0.015);
      } else {
        this.dropShadow.visible = false;
      }
    } else {
      this.dropShadow.visible = false;
    }
  }

  applySyncState(state, dt, world) {
    if (!state) return;
    this._tmpSyncTarget.set(state.p[0], state.p[1], state.p[2]);
    const alpha = 1 - Math.exp(-16 * dt);
    if (this.position.distanceTo(this._tmpSyncTarget) > 15) {
      this.position.copy(this._tmpSyncTarget);
    } else {
      this.position.lerp(this._tmpSyncTarget, alpha);
    }

    this.group.rotation.y = state.ry;
    this.squashY = THREE.MathUtils.lerp(this.squashY, state.sq || 1.0, alpha);
    if (state.ex && this.expression !== state.ex) {
      this.setExpression(state.ex);
    }
    if (state.ts) {
      this.tagState = state.ts;
    }

    this._updateVisualCommon(dt, world);
  }

  _performAiJump(world) {
    let dirX = Math.sin(this.facingYaw);
    let dirZ = Math.cos(this.facingYaw);
    let horizSpeed = 3.4 + Math.random() * 2.0;
    let jumpVy = 9.5 + Math.random() * 2.5;

    if (this.groundCloud) {
      const cx = this.groundCloud.position.x;
      const cz = this.groundCloud.position.z;
      const dx = cx - this.position.x;
      const dz = cz - this.position.z;
      const distFromCenter = Math.hypot(dx, dz);
      const cloudRadius = this.groundCloud.colliders[0].rx;

      if (distFromCenter > cloudRadius * 0.58) {
        const toCenterYaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.7;
        this.facingYaw = toCenterYaw;
        dirX = Math.sin(toCenterYaw);
        dirZ = Math.cos(toCenterYaw);
      } else if (Math.random() < 0.28 && world) {
        let nearCloud = null;
        let nearDist = Infinity;
        for (const c of world.clouds) {
          if (c === this.groundCloud) continue;
          const cdx = c.position.x - this.position.x;
          const cdz = c.position.z - this.position.z;
          const cd = Math.hypot(cdx, cdz);
          if (cd > 9 && cd < 20 && c.position.y - this.position.y < 3.5 && cd < nearDist) {
            nearDist = cd;
            nearCloud = c;
          }
        }
        if (nearCloud) {
          this._launchToCloud(nearCloud);
          return;
        }
        this.facingYaw = Math.random() * Math.PI * 2;
        dirX = Math.sin(this.facingYaw);
        dirZ = Math.cos(this.facingYaw);
      } else {
        this.facingYaw += (Math.random() - 0.5) * 2.2;
        dirX = Math.sin(this.facingYaw);
        dirZ = Math.cos(this.facingYaw);
      }
    }

    this.velocity.x = dirX * horizSpeed;
    this.velocity.z = dirZ * horizSpeed;
    this.velocity.y = jumpVy;
    this.isGrounded = false;
    this.groundCloud = null;
    this.triggerSquash(1.36);
    this.setExpression('jump', 0.45);
  }

  _performEscapeJump(world, threatPos) {
    const threatDist = Math.hypot(this.position.x - threatPos.x, this.position.z - threatPos.z);

    if (threatDist > 42) {
      // 大きく離れたら現在いる雲の上で跳ねて待つ
      this._performAiJump(world);
      return;
    }

    let bestCloud = null;
    let bestScore = -Infinity;

    if (world) {
      for (const c of world.clouds) {
        if (c === this.groundCloud) continue;
        const dStar = Math.hypot(c.position.x - this.position.x, c.position.z - this.position.z);
        if (dStar < 7.5 || dStar > 23) continue;
        if (c.position.y - this.position.y > 5.0) continue;

        const dThreat = Math.hypot(c.position.x - threatPos.x, c.position.z - threatPos.z);
        let score = dThreat - dStar * 0.2;
        if (c === this.lastCloud) score -= 12;
        if (dThreat > 44) score -= (dThreat - 44) * 1.5;

        if (score > bestScore) {
          bestScore = score;
          bestCloud = c;
        }
      }
    }

    if (bestCloud) {
      this._launchToCloud(bestCloud);
      return;
    }

    // 周囲に適切な別雲がなければ、現在の雲上で脅威から離れる方向へジャンプ
    let awayYaw = Math.atan2(this.position.x - threatPos.x, this.position.z - threatPos.z);
    if (this.groundCloud) {
      const cx = this.groundCloud.position.x;
      const cz = this.groundCloud.position.z;
      const distCenter = Math.hypot(this.position.x - cx, this.position.z - cz);
      const cloudR = this.groundCloud.colliders[0].rx;
      if (distCenter > cloudR * 0.55) {
        awayYaw = Math.atan2(cx - this.position.x, cz - this.position.z) + (Math.random() - 0.5) * 1.1;
      }
    }

    this.facingYaw = awayYaw;
    this.velocity.x = Math.sin(awayYaw) * 6.2;
    this.velocity.z = Math.cos(awayYaw) * 6.2;
    this.velocity.y = 11.2;
    this.isGrounded = false;
    this.groundCloud = null;
    this.triggerSquash(1.38);
    this.setExpression('happy', 0.45);
  }

  _resolveCloudCollisions(world, wasGrounded) {
    const p = this.position;
    const r = this.radius;

    for (const cloud of world.clouds) {
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
            this.velocity.x * nx +
            this.velocity.y * ny +
            this.velocity.z * nz;

          if (vn < 0) {
            this.velocity.x -= nx * vn;
            this.velocity.y -= ny * vn;
            this.velocity.z -= nz * vn;
          }

          if (ny > 0.45) {
            if (cloud.type === 'bouncy') {
              this.velocity.y = 19.5;
              this.isGrounded = false;
              this.triggerSquash(1.45);
              this.setExpression('happy', 0.6);
            } else {
              this.isGrounded = true;
              this.groundCloud = cloud;

              if (!wasGrounded && vn < -4.0) {
                this.triggerSquash(0.68);
              }

              if (ny > 0.65) {
                const mainCol = cloud.colliders[0];
                this.safeCloud = cloud;
                this.safeLocalOffset.set(
                  mainCol.offset.x,
                  mainCol.offset.y + mainCol.ry + r + 0.5,
                  mainCol.offset.z
                );
                this.safeFallbackPos.copy(cloud.position).add(this.safeLocalOffset);
              }
            }
          }
        }
      }
    }
  }

  update(dt, playerPos, world, partnerPos = null) {
    let threatPos = playerPos;
    if (partnerPos) {
      const d1 = this.position.distanceToSquared(playerPos);
      const d2 = this.position.distanceToSquared(partnerPos);
      if (d2 < d1) threatPos = partnerPos;
    }

    if (this.isGrounded && this.groundCloud) {
      this.position.add(this.groundCloud.deltaPos);
      const decay = Math.exp(-16.0 * dt);
      this.velocity.x *= decay;
      this.velocity.z *= decay;

      if (this.tagState === 'idle') {
        this.jumpWaitTimer -= dt;
        if (this.jumpWaitTimer <= 0) {
          this.jumpWaitTimer = 0.45 + Math.random() * 0.9;
          this._performAiJump(world);
        }
      } else if (this.tagState === 'chasing') {
        this.jumpWaitTimer -= dt;
        if (this.jumpWaitTimer <= 0) {
          const td = Math.hypot(this.position.x - threatPos.x, this.position.z - threatPos.z);
          this.jumpWaitTimer = td > 38 ? 0.65 : (td < 9 ? 0.06 : 0.16 + Math.random() * 0.16);
          this._performEscapeJump(world, threatPos);
        }
      }
    }

    this.velocity.y -= 28.0 * dt;
    this.velocity.y = Math.max(this.velocity.y, -24);
    this.position.addScaledVector(this.velocity, dt);

    const wasGrounded = this.isGrounded;
    this.isGrounded = false;
    this.groundCloud = null;

    this._resolveCloudCollisions(world, wasGrounded);

    const safeY = this.safeCloud
      ? this.safeCloud.position.y + this.safeLocalOffset.y
      : this.safeFallbackPos.y;

    if (this.position.y < Math.min(-16, safeY - 18)) {
      if (this.safeCloud && world.clouds.includes(this.safeCloud)) {
        this.position.copy(this.safeCloud.position).add(this.safeLocalOffset);
      } else {
        this.position.copy(this.safeFallbackPos);
      }
      this.velocity.set(0, 0, 0);
      this.triggerSquash(1.3);
    }

    if (this.tagState === 'preparing') {
      this.prepareTimer += dt;
      const distReady = Math.hypot(this.position.x - threatPos.x, this.position.z - threatPos.z) >= 12.5;
      if ((this.prepareTimer > 0.6 && this.isGrounded && distReady) || this.prepareTimer >= 2.2) {
        this.tagState = 'chasing';
        this.jumpWaitTimer = 0.35;
        this.facingYaw = Math.atan2(threatPos.x - this.position.x, threatPos.z - this.position.z);
        this.setExpression('happy', 1.6);
        if (this.onTagStarted) {
          this.onTagStarted();
        }
      }
    }

    // 回転・ぽよんスプリング更新
    const k = 180;
    const damp = 14;
    const force = (1.0 - this.squashY) * k - this.squashVel * damp;
    this.squashVel += force * dt;
    this.squashY += this.squashVel * dt;
    this.squashY = THREE.MathUtils.clamp(this.squashY, 0.55, 1.5);

    const distPlayer = this.position.distanceTo(playerPos);
    if (this.tagState === 'asking' || (this.tagState === 'idle' && distPlayer < 6.0)) {
      const lookYaw = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
      const diff = Math.atan2(Math.sin(lookYaw - this.facingYaw), Math.cos(lookYaw - this.facingYaw));
      this.facingYaw += diff * Math.min(1, dt * 6);
    }
    this.group.rotation.y = this.facingYaw;

    if (this.exprTimer > 0) {
      this.exprTimer -= dt;
      if (this.exprTimer <= 0) {
        this.setExpression('normal');
      }
    } else if (this.tagState === 'chasing' || distPlayer < 7.5) {
      this.setExpression('happy', 1.6);
    } else {
      this.moodTimer -= dt;
      if (this.moodTimer <= 0) {
        this.moodTimer = 3.2 + Math.random() * 3.2;
        const r = Math.random();
        if (r < 0.4) this.setExpression('wink', 1.5);
        else if (r < 0.75) this.setExpression('happy', 1.5);
      }
    }

    this._updateVisualCommon(dt, world);
  }
}