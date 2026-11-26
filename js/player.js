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
    this.isRidingPartner = false; // 仲間の頭に乗っている状態

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

    // 2段ジャンプエフェクト用リング管理
    this.jumpRings = [];

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
      this.airJumpsLeft = this.isGrounded ? 5 : Math.max(this.airJumpsLeft, 5);
      this.triggerWingFlap();
    } else {
      this.airJumpsLeft = Math.min(this.airJumpsLeft, 1);
    }
  }

  triggerWingFlap() {
    this.wingFlapTimer = 0.36;
  }

  _updateWingAnimation(dt) {
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
      life: 0.36
    });
  }

  resetTo(pos) {
    this.position.copy(pos);
    this.remoteTargetPos.copy(pos);
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.groundCloud = null;
    this.isRidingPartner = false;
    this.airJumpsLeft = this.getMaxAirJumps();
    this.rollQuat.setFromAxisAngle(this._tmpAxisY, this.facingYaw);
    this.remoteTargetQuat.copy(this.rollQuat);
    this.triggerSquash(1.3);
    this.setExpression('happy', 0.6);
  }

  _updateRingsAndBlink(dt) {
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
        const s = 1 + t * 1.9;
        ring.mesh.scale.set(s, s, 1);
        ring.mesh.material.opacity = 0.85 * (1 - t);
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
    this._updateRingsAndBlink(dt);

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
    this.squashY = THREE.MathUtils.clamp(this.squashY, 0.55, 1.55);

    const xzScale = 1 / Math.sqrt(this.squashY);
    this.bodyPivot.scale.set(xzScale, this.squashY, xzScale);

    const bottomOffset = (this.squashY - 1.0) * this.radius * 0.65;
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
    this._updateRingsAndBlink(dt);

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

    const bottomOffset = (this.squashY - 1.0) * this.radius * 0.65;
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
    }
    this.scene = nextScene;
    this.scene.add(this.group);
    this.scene.add(this.dropShadow);
    for (const ring of this.jumpRings) {
      this.scene.add(ring.mesh);
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
  }
}

Player._wingGeo = null;