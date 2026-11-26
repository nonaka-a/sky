class AngelMob {
  static getSharedAssets() {
    if (AngelMob._shared) return AngelMob._shared;

    // 共有顔＋髪テクスチャ（1枚のみ生成して全天使で共有）
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // 後頭部・ベースのハニーブロンド髪色
    ctx.fillStyle = '#ffd04d';
    ctx.fillRect(0, 0, 512, 256);

    // 正面側の肌エリア（U = 0.5 付近が正面）
    ctx.fillStyle = '#ffe6d2';
    ctx.beginPath();
    ctx.ellipse(256, 138, 108, 86, 0, 0, Math.PI * 2);
    ctx.fill();

    // ふんわり前髪カーブ
    ctx.fillStyle = '#ffd04d';
    ctx.beginPath();
    ctx.moveTo(140, 0);
    ctx.lineTo(372, 0);
    ctx.lineTo(372, 92);
    ctx.quadraticCurveTo(306, 72, 256, 98);
    ctx.quadraticCurveTo(206, 72, 140, 92);
    ctx.closePath();
    ctx.fill();

    // ほっぺ
    ctx.fillStyle = 'rgba(255, 130, 155, 0.6)';
    ctx.beginPath();
    ctx.ellipse(214, 152, 13, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(298, 152, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // つぶらな瞳
    const drawEye = (ex, ey) => {
      ctx.fillStyle = '#3b2420';
      ctx.beginPath();
      ctx.arc(ex, ey, 11.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 3.5, ey - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    };
    drawEye(228, 130);
    drawEye(284, 130);

    // 小さなにっこり口
    ctx.strokeStyle = '#9e504b';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(256, 150, 10, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();

    const faceTex = new THREE.CanvasTexture(canvas);
    faceTex.encoding = THREE.sRGBEncoding;

    // 共有ウィング形状
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(-0.14, 0.14, -0.36, 0.30, -0.56, 0.22);
    wingShape.bezierCurveTo(-0.66, 0.15, -0.60, -0.02, -0.42, -0.07);
    wingShape.bezierCurveTo(-0.48, -0.15, -0.38, -0.26, -0.19, -0.17);
    wingShape.bezierCurveTo(-0.10, -0.12, -0.04, -0.06, 0, -0.06);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.016,
      bevelSegments: 2,
      curveSegments: 10
    });
    wingGeo.translate(0, 0, -0.02);

    AngelMob._shared = {
      headGeo: new THREE.SphereGeometry(0.31, 18, 14),
      headMat: new THREE.MeshBasicMaterial({ map: faceTex }),
      hairGeo: new THREE.SphereGeometry(0.12, 10, 8),
      hairMat: new THREE.MeshToonMaterial({ color: 0xffd04d }),
      bodyGeo: new THREE.CylinderGeometry(0.14, 0.31, 0.52, 14),
      bodyMat: new THREE.MeshToonMaterial({ color: 0xffffff }),
      beltGeo: new THREE.CylinderGeometry(0.175, 0.20, 0.11, 14),
      beltMat: new THREE.MeshToonMaterial({ color: 0x6bc8ff }),
      haloGeo: new THREE.TorusGeometry(0.24, 0.038, 8, 20),
      haloMat: new THREE.MeshBasicMaterial({ color: 0xffd633 }),
      wingGeo,
      wingMat: new THREE.MeshToonMaterial({ color: 0xf2f8ff }),
      outlineMat: new THREE.MeshBasicMaterial({
        color: 0x465275,
        side: THREE.BackSide
      }),
      shadowGeo: new THREE.CircleGeometry(0.46, 16),
      shadowMat: new THREE.MeshBasicMaterial({
        color: 0x628eb8,
        transparent: true,
        opacity: 0.25,
        depthWrite: false
      })
    };

    return AngelMob._shared;
  }

  constructor(scene, options = {}) {
    this.scene = scene;
    this.homeType = options.homeType || 'cloud'; // 'cloud' | 'castle'
    this.castleIsland = options.castleIsland || null;
    this.homeCloud = null;

    this.baseScale = 1.32;
    this.localX = options.localX || 0;
    this.localZ = options.localZ || 0;
    this.position = new THREE.Vector3(0, 0, 0);
    this.facingYaw = Math.random() * Math.PI * 2;
    this.walkYaw = this.facingYaw;
    this.walkSpeed = 1.45 + Math.random() * 0.45;
    this.stateTimer = 1.5 + Math.random() * 2.5;
    this.isPaused = false;
    this.phase = Math.random() * Math.PI * 2;
    this.appearScale = this.homeType === 'castle' ? 1.0 : 0.05;

    // 挨拶アニメーション管理
    this.isPlayerNear = false;
    this.greetCooldown = 0;
    this.greetHopTimer = 0;
    this.greetDuration = 0.52;
    this.squashY = 1.0;

    this._createMesh();
  }

  _createMesh() {
    const s = AngelMob.getSharedAssets();

    this.group = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    // ドレス＋輪郭
    const bodyMesh = new THREE.Mesh(s.bodyGeo, s.bodyMat);
    bodyMesh.position.y = 0.26;
    this.bodyPivot.add(bodyMesh);

    const bodyOutline = new THREE.Mesh(s.bodyGeo, s.outlineMat);
    bodyOutline.position.y = 0.26;
    bodyOutline.scale.set(1.09, 1.05, 1.09);
    this.bodyPivot.add(bodyOutline);

    // 水色のリボン帯（視認性向上）
    const beltMesh = new THREE.Mesh(s.beltGeo, s.beltMat);
    beltMesh.position.y = 0.38;
    this.bodyPivot.add(beltMesh);

    // 頭＋輪郭（U=0.5が正面+Zに向くよう回転）
    const headMesh = new THREE.Mesh(s.headGeo, s.headMat);
    headMesh.position.y = 0.70;
    headMesh.rotation.y = -Math.PI / 2;
    this.bodyPivot.add(headMesh);

    const headOutline = new THREE.Mesh(s.headGeo, s.outlineMat);
    headOutline.position.y = 0.70;
    headOutline.scale.setScalar(1.085);
    this.bodyPivot.add(headOutline);

    // 横髪・おさげ風の丸み
    const hairL = new THREE.Mesh(s.hairGeo, s.hairMat);
    hairL.position.set(-0.26, 0.60, -0.04);
    hairL.scale.set(0.95, 1.3, 0.95);
    this.bodyPivot.add(hairL);

    const hairR = new THREE.Mesh(s.hairGeo, s.hairMat);
    hairR.position.set(0.26, 0.60, -0.04);
    hairR.scale.set(0.95, 1.3, 0.95);
    this.bodyPivot.add(hairR);

    // 天使の輪＋輪郭
    this.haloMesh = new THREE.Mesh(s.haloGeo, s.haloMat);
    this.haloMesh.rotation.x = Math.PI / 2;
    this.haloMesh.position.y = 1.16;
    this.bodyPivot.add(this.haloMesh);

    // 羽（左右＋輪郭）
    this.leftWingPivot = new THREE.Group();
    this.leftWingPivot.position.set(-0.08, 0.44, -0.23);
    this.leftWingPivot.add(new THREE.Mesh(s.wingGeo, s.wingMat));
    const leftWingOut = new THREE.Mesh(s.wingGeo, s.outlineMat);
    leftWingOut.scale.set(1.08, 1.08, 1.28);
    this.leftWingPivot.add(leftWingOut);
    this.bodyPivot.add(this.leftWingPivot);

    this.rightWingPivot = new THREE.Group();
    this.rightWingPivot.position.set(0.08, 0.44, -0.23);
    this.rightWingPivot.scale.x = -1;
    this.rightWingPivot.add(new THREE.Mesh(s.wingGeo, s.wingMat));
    const rightWingOut = new THREE.Mesh(s.wingGeo, s.outlineMat);
    rightWingOut.scale.set(1.08, 1.08, 1.28);
    this.rightWingPivot.add(rightWingOut);
    this.bodyPivot.add(this.rightWingPivot);

    // 足元の丸い影
    this.dropShadow = new THREE.Mesh(s.shadowGeo, s.shadowMat);
    this.dropShadow.rotation.x = -Math.PI / 2;
    this.dropShadow.visible = false;

    if (this.homeType === 'cloud') {
      this.group.visible = false;
    }

    this.scene.add(this.group);
    this.scene.add(this.dropShadow);
  }

  setHomeCloud(cloud) {
    this.homeCloud = cloud;
    if (!cloud) {
      this.group.visible = false;
      this.dropShadow.visible = false;
      return;
    }

    if (cloud.safeLocalSpot) {
      this.localX = cloud.safeLocalSpot.x;
      this.localZ = cloud.safeLocalSpot.z;
    } else {
      const col = cloud.colliders[0];
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * col.rx * 0.42;
      this.localX = Math.cos(ang) * dist;
      this.localZ = Math.sin(ang) * dist;
    }

    const localSurfY = this._getCloudSurfaceLocalY(cloud, this.localX, this.localZ);
    this.position.set(
      cloud.position.x + this.localX,
      cloud.position.y + localSurfY + 0.55,
      cloud.position.z + this.localZ
    );
    this.group.position.copy(this.position);

    this.walkYaw = Math.random() * Math.PI * 2;
    this.facingYaw = this.walkYaw;
    this.stateTimer = 1.0 + Math.random() * 2.5;
    this.isPaused = false;
    this.isPlayerNear = false;
    this.greetHopTimer = 0;
    this.appearScale = 0.08;
    this.group.visible = true;
  }

  _getCloudSurfaceLocalY(cloud, lx, lz) {
    let bestY = null;
    for (const col of cloud.colliders) {
      const dx = lx - col.offset.x;
      const dz = lz - col.offset.z;
      const nx = dx / col.rx;
      const nz = dz / col.rz;
      const sq = nx * nx + nz * nz;
      if (sq < 0.98) {
        const sy = col.offset.y + col.ry * Math.sqrt(1.0 - sq);
        if (bestY === null || sy > bestY) {
          bestY = sy;
        }
      }
    }
    if (bestY !== null) return bestY;
    const mainCol = cloud.colliders[0];
    return mainCol.offset.y + mainCol.ry * 0.2;
  }

  _isBlockedByCloudBuilding(cloud, lx, lz) {
    if (!cloud.buildingColliders || cloud.buildingColliders.length === 0) return false;
    for (const col of cloud.buildingColliders) {
      if (col.kind === 'cylinder') {
        if (Math.hypot(lx - col.lx, lz - col.lz) < col.r + 0.75) return true;
      } else if (col.kind === 'box') {
        const hw = col.w * 0.5 + 0.75;
        const hd = col.d * 0.5 + 0.75;
        if (Math.abs(lx - col.cx) < hw && Math.abs(lz - col.cz) < hd) return true;
      }
    }
    return false;
  }

  update(time, dt, playerPos) {
    if (this.homeType === 'cloud' && (!this.homeCloud || !this.homeCloud.group.visible)) {
      this.group.visible = false;
      this.dropShadow.visible = false;
      return;
    }

    this.group.visible = true;
    this.appearScale = THREE.MathUtils.lerp(this.appearScale, 1.0, Math.min(1, dt * 6));

    if (this.greetCooldown > 0) this.greetCooldown -= dt;

    // プレイヤーとの距離を確認して挨拶・振り向き判定
    const distToPlayer = this.position.distanceTo(playerPos);
    const nearNow = distToPlayer < 5.6 && this.appearScale > 0.65;

    if (nearNow) {
      if (!this.isPlayerNear && this.greetCooldown <= 0) {
        this.greetHopTimer = this.greetDuration;
        this.greetCooldown = 4.2;
      }
      this.isPlayerNear = true;
    } else if (distToPlayer > 6.8) {
      this.isPlayerNear = false;
    }

    // 浮遊散歩の移動更新（近くにいる間は立ち止まって挨拶＆見守り）
    if (!this.isPlayerNear) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.isPaused = !this.isPaused;
        this.stateTimer = this.isPaused ? (1.0 + Math.random() * 1.8) : (2.2 + Math.random() * 3.0);
        if (!this.isPaused) {
          this.walkYaw += (Math.random() - 0.5) * 2.2;
        }
      }

      if (!this.isPaused) {
        const step = this.walkSpeed * dt;
        const nextX = this.localX + Math.sin(this.walkYaw) * step;
        const nextZ = this.localZ + Math.cos(this.walkYaw) * step;

        if (this.homeType === 'castle') {
          const centerZ = 6.2;
          const dx = nextX;
          const dz = nextZ - centerZ;
          if (Math.hypot(dx / 5.2, dz / 3.6) > 1.0) {
            this.walkYaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.8;
          } else {
            this.localX = nextX;
            this.localZ = nextZ;
          }
        } else {
          const col = this.homeCloud.colliders[0];
          const maxR = Math.min(col.rx, col.rz) * 0.68;
          const distFromCenter = Math.hypot(nextX - col.offset.x, nextZ - col.offset.z);
          if (distFromCenter > maxR || this._isBlockedByCloudBuilding(this.homeCloud, nextX, nextZ)) {
            if (this.homeCloud.safeLocalSpot) {
              this.walkYaw = Math.atan2(
                this.homeCloud.safeLocalSpot.x - this.localX,
                this.homeCloud.safeLocalSpot.z - this.localZ
              ) + (Math.random() - 0.5) * 1.1;
            } else {
              this.walkYaw = Math.atan2(col.offset.x - this.localX, col.offset.z - this.localZ) + (Math.random() - 0.5) * 1.0;
            }
          } else {
            this.localX = nextX;
            this.localZ = nextZ;
          }
        }
      }
    }

    // 地面Yとワールド位置の確定
    let groundWorldY = 0;
    if (this.homeType === 'castle' && this.castleIsland) {
      this.position.x = this.castleIsland.position.x + this.localX;
      this.position.z = this.castleIsland.position.z + this.localZ;
      groundWorldY = this.castleIsland.groundWorldY;
    } else if (this.homeCloud) {
      const localSurfY = this._getCloudSurfaceLocalY(this.homeCloud, this.localX, this.localZ);
      this.position.x = this.homeCloud.position.x + this.localX;
      this.position.z = this.homeCloud.position.z + this.localZ;
      groundWorldY = this.homeCloud.position.y + localSurfY;
    }

    // 浮遊オフセット＋ぴょこん挨拶ホップ
    let hopY = 0;
    let targetSquash = 1.0;
    if (this.greetHopTimer > 0) {
      this.greetHopTimer = Math.max(0, this.greetHopTimer - dt);
      const p = 1.0 - this.greetHopTimer / this.greetDuration;
      hopY = Math.sin(p * Math.PI) * 0.72;
      targetSquash = p < 0.25 ? 1.18 : (p > 0.8 ? 0.84 : 1.04);
    }
    this.squashY = THREE.MathUtils.lerp(this.squashY, targetSquash, Math.min(1, dt * 16));

    const hoverY = 0.55 + Math.sin(time * 2.5 + this.phase) * 0.14 + hopY;
    this.position.y = groundWorldY + hoverY;
    this.group.position.copy(this.position);

    const sFactor = this.baseScale * this.appearScale;
    const xzScale = (1 / Math.sqrt(this.squashY)) * sFactor;
    this.bodyPivot.scale.set(xzScale, this.squashY * sFactor, xzScale);

    // 向き（プレイヤーが近ければプレイヤー方向、そうでなければ進行方向）
    let targetYaw = this.walkYaw;
    if (this.isPlayerNear) {
      targetYaw = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
    }
    const diff = Math.atan2(Math.sin(targetYaw - this.facingYaw), Math.cos(targetYaw - this.facingYaw));
    this.facingYaw += diff * Math.min(1, dt * 8);
    this.group.rotation.y = this.facingYaw;

    // 天使の輪のほのかな揺れ
    this.haloMesh.position.y = 1.16 + Math.sin(time * 3.2 + this.phase) * 0.03;

    // 羽パタパタアニメーション
    const flapSpeed = (this.isPlayerNear || this.greetHopTimer > 0) ? 13.0 : 7.8;
    const flap = Math.sin(time * flapSpeed + this.phase) * 0.45;
    this.leftWingPivot.rotation.y = 0.32 + flap;
    this.leftWingPivot.rotation.z = Math.sin(time * flapSpeed + this.phase) * 0.14;
    this.rightWingPivot.rotation.y = -0.32 - flap;
    this.rightWingPivot.rotation.z = -Math.sin(time * flapSpeed + this.phase) * 0.14;

    // 足元の影を更新
    this.dropShadow.visible = true;
    this.dropShadow.position.set(this.position.x, groundWorldY + 0.04, this.position.z);
    const shadowScale = THREE.MathUtils.clamp(1.0 - hoverY * 0.22, 0.5, 1.0) * this.appearScale;
    this.dropShadow.scale.setScalar(shadowScale);
  }
}

AngelMob._shared = null;