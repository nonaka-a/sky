class ShopIsland extends StructureBase {
  constructor(centerPos, scene, options = {}) {
    super('shop', centerPos, {
      boundingRadius: 15.2,
      noCloudRadius: 19.5,
      bridgeTargetRadius: null,
      bridgeSurfaceOffsetY: 0.2
    });

    this.shopScale = 1.16;
    this.yaw = typeof options.yaw === 'number' ? options.yaw : 0.68;
    this.group.rotation.y = this.yaw;

    this.floorLocalY = 0.5 * this.shopScale;
    this.floorWorldY = this.position.y + this.floorLocalY;

    this._tmpLocalPos = new THREE.Vector3();
    this._tmpLocalVel = new THREE.Vector3();

    this.buildCloudPlatform({
      rx: 11.4 * this.shopScale,
      ry: 2.6 * this.shopScale,
      rz: 10.6 * this.shopScale,
      offsetY: -2.4 * this.shopScale
    });

    this._buildShopBuilding();
    this._buildShopColliders();

    const keeperLocalX = 0;
    const keeperLocalZ = -2.35 * this.shopScale;
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);

    this.shopkeeper = new AngelMob(scene, {
      homeType: 'shop',
      shopYaw: this.yaw,
      shopAnchor: new THREE.Vector3(
        this.position.x + keeperLocalX * cosY + keeperLocalZ * sinY,
        this.floorWorldY,
        this.position.z - keeperLocalX * sinY + keeperLocalZ * cosY
      )
    });
  }

  _buildShopBuilding() {
    const wallCreamMat = new THREE.MeshToonMaterial({ color: 0xe8d4c3 });
    const wallPinkMat = new THREE.MeshToonMaterial({ color: 0xe6bcc6 });
    const wallMintMat = new THREE.MeshToonMaterial({ color: 0xb9dccb });
    const plinthMat = new THREE.MeshToonMaterial({ color: 0xb89f8b });
    const floorMat = new THREE.MeshToonMaterial({ color: 0xf4ece4 });
    const roofBlueMat = new THREE.MeshToonMaterial({ color: 0x3b9cf0 });
    const roofPinkMat = new THREE.MeshToonMaterial({ color: 0xf0528c });
    const roofMintMat = new THREE.MeshToonMaterial({ color: 0x2ec998 });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x4b6a94 });
    const woodMat = new THREE.MeshToonMaterial({ color: 0x9b6542 });
    const woodTopMat = new THREE.MeshToonMaterial({ color: 0xf7e7d4 });
    const goldMat = new THREE.MeshToonMaterial({ color: 0xffd84d });
    const whiteMat = new THREE.MeshToonMaterial({ color: 0xffffff });

    const y0 = 0.5;
    this.shopGroup = new THREE.Group();
    this.shopGroup.scale.setScalar(this.shopScale);
    this.group.add(this.shopGroup);

    const addBox = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.shopGroup.add(m);
      return m;
    };

    // 店舗の白い石畳テラス床＋正面ステップ
    addBox(12.0, 0.5, 9.2, 0, y0 - 0.25, -0.7, floorMat);
    addBox(6.2, 0.28, 1.4, 0, 0.14, 4.4, plinthMat);

    // 連結した左右の8角形ドーム棟
    const octGeo = new THREE.CylinderGeometry(1, 1.02, 1, 8);
    octGeo.rotateY(Math.PI / 8);
    const domeGeo = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);

    const addOctWing = (lx, lz, radius, wallH, wallMat, roofMat) => {
      const wing = new THREE.Group();
      wing.position.set(lx, y0, lz);
      this.shopGroup.add(wing);

      const plinth = new THREE.Mesh(octGeo, plinthMat);
      plinth.position.y = 0.14;
      plinth.scale.set(radius * 1.04, 0.28, radius * 1.04);
      wing.add(plinth);

      const wall = new THREE.Mesh(octGeo, wallMat);
      wall.position.y = wallH * 0.5;
      wall.scale.set(radius, wallH, radius);
      wing.add(wall);

      const eave = new THREE.Mesh(octGeo, roofMat);
      eave.position.y = wallH + 0.1;
      eave.scale.set(radius * 1.06, 0.2, radius * 1.06);
      wing.add(eave);

      const dome = new THREE.Mesh(domeGeo, roofMat);
      dome.position.y = wallH + 0.16;
      dome.scale.set(radius * 0.96, radius * 0.88, radius * 0.96);
      wing.add(dome);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), goldMat);
      finial.position.y = wallH + 0.16 + radius * 0.88 + 0.1;
      wing.add(finial);

      const apothem = radius * 0.924 + 0.02;
      for (const ang of [0, Math.PI * 0.5, -Math.PI * 0.5, Math.PI]) {
        const wGroup = new THREE.Group();
        wGroup.position.set(Math.sin(ang) * apothem, wallH * 0.54, Math.cos(ang) * apothem);
        wGroup.rotation.y = ang;
        const rect = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.06), windowMat);
        const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 10), windowMat);
        arch.rotation.x = Math.PI / 2;
        arch.position.y = 0.29;
        wGroup.add(rect);
        wGroup.add(arch);
        wing.add(wGroup);
      }
    };

    addOctWing(-4.2, -1.6, 2.25, 3.7, wallPinkMat, roofBlueMat);
    addOctWing(4.2, -1.6, 2.25, 3.7, wallMintMat, roofPinkMat);

    // 中央の大きくくり抜かれたショップ本棟（壁を少し高くして存在感アップ）
    addBox(6.8, 4.6, 0.7, 0, y0 + 2.3, -4.25, wallCreamMat);
    addBox(0.7, 4.6, 5.2, -3.05, y0 + 2.3, -1.4, wallCreamMat);
    addBox(0.7, 4.6, 5.2, 3.05, y0 + 2.3, -1.4, wallCreamMat);
    addBox(7.4, 0.5, 5.8, 0, y0 + 4.85, -1.4, wallCreamMat);

    // 正面くり抜きアーチ上の梁＋看板飾り
    addBox(0.65, 4.6, 0.7, -2.75, y0 + 2.3, 1.15, plinthMat);
    addBox(0.65, 4.6, 0.7, 2.75, y0 + 2.3, 1.15, plinthMat);
    addBox(6.4, 0.85, 0.82, 0, y0 + 4.25, 1.15, wallCreamMat);

    // 中央屋上の大きなドーム屋根
    const mainEave = new THREE.Mesh(octGeo, roofMintMat);
    mainEave.position.set(0, y0 + 5.18, -1.7);
    mainEave.scale.set(2.85, 0.26, 2.85);
    this.shopGroup.add(mainEave);

    const mainDome = new THREE.Mesh(domeGeo, roofMintMat);
    mainDome.position.set(0, y0 + 5.28, -1.7);
    mainDome.scale.set(2.65, 2.35, 2.65);
    this.shopGroup.add(mainDome);

    const topStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), goldMat);
    topStar.position.set(0, y0 + 5.28 + 2.35 + 0.28, -1.7);
    this.shopGroup.add(topStar);

    // 看板プレート＆天使のはねシンボル
    addBox(2.5, 0.68, 0.14, 0, y0 + 4.28, 1.62, roofPinkMat);
    addBox(2.26, 0.48, 0.16, 0, y0 + 4.28, 1.64, whiteMat);

    const signWingShape = new THREE.Shape();
    signWingShape.moveTo(0, 0);
    signWingShape.bezierCurveTo(-0.14, 0.14, -0.36, 0.26, -0.52, 0.18);
    signWingShape.bezierCurveTo(-0.58, 0.10, -0.50, -0.05, -0.34, -0.08);
    signWingShape.bezierCurveTo(-0.22, -0.18, -0.08, -0.10, 0, -0.04);
    signWingShape.closePath();
    const signWingGeo = new THREE.ExtrudeGeometry(signWingShape, { depth: 0.06, bevelEnabled: false });

    const swL = new THREE.Mesh(signWingGeo, goldMat);
    swL.position.set(-0.08, y0 + 4.28, 1.72);
    this.shopGroup.add(swL);

    const swR = new THREE.Mesh(signWingGeo, goldMat);
    swR.position.set(0.08, y0 + 4.28, 1.72);
    swR.scale.x = -1;
    this.shopGroup.add(swR);

    // 大きくくり抜かれた店先のカウンター
    addBox(4.5, 1.0, 0.78, 0, y0 + 0.5, -1.1, woodMat);
    addBox(4.85, 0.14, 1.02, 0, y0 + 1.05, -1.1, woodTopMat);

    // カウンター上のディスプレイ飾り
    const dispWingL = new THREE.Mesh(signWingGeo, whiteMat);
    dispWingL.position.set(-1.35, y0 + 1.38, -1.05);
    dispWingL.scale.set(0.75, 0.75, 0.75);
    this.shopGroup.add(dispWingL);

    const dispWingR = new THREE.Mesh(signWingGeo, whiteMat);
    dispWingR.position.set(-1.25, y0 + 1.38, -1.05);
    dispWingR.scale.set(-0.75, 0.75, 0.75);
    this.shopGroup.add(dispWingR);

    const coinDecoGeo = new THREE.OctahedronGeometry(0.16, 0);
    coinDecoGeo.scale(0.9, 1.1, 0.55);
    for (let i = 0; i < 3; i++) {
      const cd = new THREE.Mesh(coinDecoGeo, goldMat);
      cd.position.set(1.15 + i * 0.28, y0 + 1.24, -1.08 + (i % 2) * 0.12);
      this.shopGroup.add(cd);
    }
  }

  _buildShopColliders() {
    const s = this.shopScale;
    const y0 = 0.5 * s;

    // 店舗テラス床と入口ステップ
    this.addBoxCollider(0, y0 - 0.25 * s, -0.7 * s, 12.0 * s, 0.5 * s, 9.2 * s);
    this.addBoxCollider(0, 0.14 * s, 4.4 * s, 6.2 * s, 0.28 * s, 1.4 * s);

    // 左右8角形ドーム棟
    this.addCylinderCollider(-4.2 * s, -1.6 * s, y0, y0 + 4.0 * s, 2.22 * s);
    this.addCylinderCollider(4.2 * s, -1.6 * s, y0, y0 + 4.0 * s, 2.22 * s);

    // 奥壁・左右壁・天井・正面柱・カウンター
    this.addBoxCollider(0, y0 + 2.3 * s, -4.25 * s, 6.8 * s, 4.6 * s, 0.75 * s);
    this.addBoxCollider(-3.05 * s, y0 + 2.3 * s, -1.4 * s, 0.75 * s, 4.6 * s, 5.2 * s);
    this.addBoxCollider(3.05 * s, y0 + 2.3 * s, -1.4 * s, 0.75 * s, 4.6 * s, 5.2 * s);
    this.addBoxCollider(0, y0 + 4.85 * s, -1.4 * s, 7.4 * s, 0.5 * s, 5.8 * s);
    this.addBoxCollider(-2.75 * s, y0 + 2.3 * s, 1.15 * s, 0.68 * s, 4.6 * s, 0.72 * s);
    this.addBoxCollider(2.75 * s, y0 + 2.3 * s, 1.15 * s, 0.68 * s, 4.6 * s, 0.72 * s);
    this.addBoxCollider(0, y0 + 0.55 * s, -1.1 * s, 4.85 * s, 1.1 * s, 1.02 * s);
  }

  resolveCollisions(pos, vel, radius) {
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;

    this._tmpLocalPos.set(
      this.position.x + (dx * cosY - dz * sinY),
      pos.y,
      this.position.z + (dx * sinY + dz * cosY)
    );
    this._tmpLocalVel.set(
      vel.x * cosY - vel.z * sinY,
      vel.y,
      vel.x * sinY + vel.z * cosY
    );

    const res = super.resolveCollisions(this._tmpLocalPos, this._tmpLocalVel, radius);

    const rx = this._tmpLocalPos.x - this.position.x;
    const rz = this._tmpLocalPos.z - this.position.z;
    pos.set(
      this.position.x + (rx * cosY + rz * sinY),
      this._tmpLocalPos.y,
      this.position.z + (-rx * sinY + rz * cosY)
    );
    vel.set(
      this._tmpLocalVel.x * cosY + this._tmpLocalVel.z * sinY,
      this._tmpLocalVel.y,
      -this._tmpLocalVel.x * sinY + this._tmpLocalVel.z * cosY
    );

    return res;
  }

  getShadowInfo(px, py, pz, outNormal) {
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const dx = px - this.position.x;
    const dz = pz - this.position.z;

    const lx = this.position.x + (dx * cosY - dz * sinY);
    const lz = this.position.z + (dx * sinY + dz * cosY);

    const info = super.getShadowInfo(lx, py, lz, outNormal);
    if (info && outNormal) {
      const nx = outNormal.x;
      const nz = outNormal.z;
      outNormal.x = nx * cosY + nz * sinY;
      outNormal.z = -nx * sinY + nz * cosY;
    }
    return info;
  }

  isPlayerAtCounter(playerPos) {
    if (!playerPos) return false;
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const dxW = playerPos.x - this.position.x;
    const dzW = playerPos.z - this.position.z;

    const lx = dxW * cosY - dzW * sinY;
    const lz = dxW * sinY + dzW * cosY;
    const dy = playerPos.y - this.floorWorldY;
    const s = this.shopScale;
    return Math.abs(lx) < 2.35 * s && lz >= -0.6 * s && lz <= 1.85 * s && dy >= 0 && dy < 3.0 * s;
  }

  getSafeSpot(playerPos, radius) {
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const lz = 2.4 * this.shopScale;
    return new THREE.Vector3(
      this.position.x + lz * sinY,
      this.floorWorldY + radius + 0.6,
      this.position.z + lz * cosY
    );
  }

  update(time, dt, playerPos, partnerPos = null) {
    if (this.shopkeeper) {
      this.shopkeeper.update(time, dt, playerPos);
    }
  }
}