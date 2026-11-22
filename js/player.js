class Player {
  constructor(scene) {
    this.scene = scene;
    this.radius = 0.6;

    this.position = new THREE.Vector3(0, 4, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = false;
    this.groundCloud = null;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.airJumpsLeft = 1; // 2段ジャンプ用

    // 最後に安全に着地していた情報
    this.safeCloud = null;
    this.safeLocalOffset = new THREE.Vector3(0, 3.5, 0);
    this.safeFallbackPos = new THREE.Vector3(0, 4.5, 0);

    // 転がり回転と向き管理（案A）
    this.rollQuat = new THREE.Quaternion();
    this.facingYaw = 0;
    this.isMoving = false;

    // ぽよん（Squash & Stretch）用スプリング
    this.squashY = 1.0;
    this.squashVel = 0;

    // 表情管理
    this.expression = 'normal';
    this.exprTimer = 0;
    this.blinkTimer = 2.5;
    this.isBlinking = false;

    // 2段ジャンプエフェクト用リング管理
    this.jumpRings = [];

    this.group = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    this._createVisuals();
    this.scene.add(this.group);
  }

  _createVisuals() {
    // 球面UV比率(2:1)に合わせて1024x512で作成し、顔や目が横長にならないようにする
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 1024;
    this.faceCanvas.height = 512;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.encoding = THREE.sRGBEncoding;

    this._drawFace('normal', false);

    // 赤い球体（本体表面はハイライト・陰影なしのフラット質感）
    const sphereGeo = new THREE.SphereGeometry(this.radius, 36, 36);
    const sphereMat = new THREE.MeshBasicMaterial({
      map: this.faceTexture
    });
    this.sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.sphereMesh.rotation.y = -Math.PI / 2;

    this.rollHolder = new THREE.Group();
    this.rollHolder.add(this.sphereMesh);
    this.bodyPivot.add(this.rollHolder);

    // イラスト風の太い濃茶色の輪郭線（アウトライン）
    const outlineGeo = new THREE.SphereGeometry(this.radius * 1.075, 32, 32);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x3b0d0c,
      side: THREE.BackSide
    });
    this.outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
    this.bodyPivot.add(this.outlineMesh);

    // 雲の上に落ちる丸影
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

  _drawFace(expr, blinking) {
    const ctx = this.faceCtx;
    const w = 1024;
    const h = 512;
    ctx.clearRect(0, 0, w, h);

    // ベースの赤（ハイライト・影なしのクリアな赤）
    ctx.fillStyle = '#f23b3b';
    ctx.fillRect(0, 0, w, h);

    // 顔の基準座標（2:1キャンバス上で1:1スケール）
    const cx = w * 0.5;
    const cy = h * 0.49;

    // ほっぺ
    ctx.fillStyle = 'rgba(255, 130, 150, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx - 82, cy + 20, 20, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 82, cy + 20, 20, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // 目を描画（まんまる）
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

        // 瞳の白い点
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

    // 口を描画
    const mouthY = cy + 20;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#330808';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (expr === 'fall') {
      // おどろきの「○」口
      ctx.fillStyle = '#5e1111';
      ctx.beginPath();
      ctx.arc(cx, mouthY + 20, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (expr === 'land') {
      // むにゅ口
      ctx.beginPath();
      ctx.moveTo(cx - 32, mouthY + 10);
      ctx.quadraticCurveTo(cx - 16, mouthY + 24, cx, mouthY + 10);
      ctx.quadraticCurveTo(cx + 16, mouthY + 24, cx + 32, mouthY + 10);
      ctx.stroke();
    } else {
      // 元気な笑顔の口
      const mouthW = expr === 'jump' || expr === 'happy' ? 66 : 58;
      const mouthH = expr === 'jump' || expr === 'happy' ? 38 : 32;

      ctx.fillStyle = '#4a0b0b';
      ctx.beginPath();
      ctx.moveTo(cx - mouthW, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + 10, cx + mouthW, mouthY);
      ctx.quadraticCurveTo(cx + mouthW * 0.75, mouthY + mouthH * 1.4, cx, mouthY + mouthH * 1.4);
      ctx.quadraticCurveTo(cx - mouthW * 0.75, mouthY + mouthH * 1.4, cx - mouthW, mouthY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 口の中の舌風トーン
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#8f1d1d';
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
    this.velocity.set(0, 0, 0);
    this.isGrounded = false;
    this.groundCloud = null;
    this.airJumpsLeft = 1;
    this.rollQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.facingYaw);
    this.triggerSquash(1.3);
    this.setExpression('happy', 0.6);
  }

  updateVisuals(dt, shadowInfo = null) {
    // 2段ジャンプ雲リングのアニメーション更新
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

    // 瞬きタイマー
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = !this.isBlinking;
      this.blinkTimer = this.isBlinking ? 0.11 : (2.2 + Math.random() * 2.5);
      this._drawFace(this.expression, this.isBlinking);
    }

    // 時限表情の復帰
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

    // ぽよんスプリング更新
    const k = 190;
    const damp = 14;
    const force = (1.0 - this.squashY) * k - this.squashVel * damp;
    this.squashVel += force * dt;
    this.squashY += this.squashVel * dt;
    this.squashY = THREE.MathUtils.clamp(this.squashY, 0.55, 1.55);

    const xzScale = 1 / Math.sqrt(this.squashY);
    this.bodyPivot.scale.set(xzScale, this.squashY, xzScale);

    // 下側接地基準で潰れるように少し位置補正
    const bottomOffset = (this.squashY - 1.0) * this.radius * 0.65;
    this.group.position.set(this.position.x, this.position.y + bottomOffset, this.position.z);

    // 案A：移動時は物理的に転がり、停止時・ジャンプ時は顔が正面（進行方向）へ戻る
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizSpeed > 0.35) {
      this.facingYaw = Math.atan2(this.velocity.x, this.velocity.z);
    }

    if (horizSpeed > 0.5 && this.isGrounded) {
      const moveDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
      const rollAxis = new THREE.Vector3(0, 1, 0).cross(moveDir).normalize();
      const angle = (horizSpeed * dt) / this.radius;
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(rollAxis, angle);
      this.rollQuat.premultiply(deltaQ).normalize();
    } else {
      const targetQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.facingYaw
      );
      const recoverSpeed = this.isGrounded ? 10.0 : 5.5;
      this.rollQuat.slerp(targetQuat, Math.min(1, recoverSpeed * dt));
    }

    this.rollHolder.quaternion.copy(this.rollQuat);

    // 雲に落ちる影の更新
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
          new THREE.Vector3(0, 0, 1),
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
}