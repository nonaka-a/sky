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