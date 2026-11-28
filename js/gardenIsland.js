class GardenIsland extends StructureBase {
  constructor(centerPos) {
    super('garden', centerPos, {
      boundingRadius: 10.0,
      noCloudRadius: 18.5,
      bridgeTargetRadius: 10.0,
      bridgeSurfaceOffsetY: 1.25
    });

    this.islandRadius = 10.0;
    this.groundLocalY = 1.2;
    this.groundWorldY = this.position.y + this.groundLocalY;

    this.soilRadius = 2.4;
    this.soilHeight = 0.16;
    this.soilCenterWorld = new THREE.Vector3(
      this.position.x,
      this.groundWorldY + this.soilHeight,
      this.position.z
    );

    this.beanstalkHeight = 116;
    this.beanstalkColliders = [];
    this.isBeanstalkGrown = false;

    this.buildFloatingIslandPlatform(this.islandRadius, this.groundLocalY, true);
    this._buildSoilBed();
    this._buildFoliage();
    this._buildBeanstalk();
    this._buildThrowSeed();
    this.setBeanstalkGrown(false);
  }

  _buildSoilBed() {
    const y0 = this.groundLocalY;

    const soilMainMat = new THREE.MeshToonMaterial({ color: 0x7d4e2d });
    const soilDarkMat = new THREE.MeshToonMaterial({ color: 0x613a1f });
    const stoneRimMat = new THREE.MeshToonMaterial({ color: 0xc2c8d4 });

    // 島中央の茶色い土（底の少し広い土盛り）
    const baseSoilGeo = new THREE.CylinderGeometry(
      this.soilRadius - 0.12,
      this.soilRadius + 0.12,
      this.soilHeight,
      28
    );
    const baseSoil = new THREE.Mesh(baseSoilGeo, soilMainMat);
    baseSoil.position.set(0, y0 + this.soilHeight * 0.5, 0);
    this.group.add(baseSoil);

    // 中心部のふっくらした耕土盛り
    const moundGeo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const mound = new THREE.Mesh(moundGeo, soilDarkMat);
    mound.position.set(0, y0 + this.soilHeight * 0.72, 0);
    mound.scale.set(this.soilRadius * 0.74, 0.22, this.soilRadius * 0.74);
    this.group.add(mound);

    // 土の質感を出す小さな土くれ
    const clodGeo = new THREE.DodecahedronGeometry(0.14, 0);
    const clodOffsets = [
      [-0.85, 0.42], [0.95, -0.35], [-0.35, -0.95], [0.52, 0.88],
      [-1.25, -0.45], [1.15, 0.55], [0.12, -1.35], [-0.45, 1.25]
    ];
    clodOffsets.forEach(([cx, cz], idx) => {
      const clod = new THREE.Mesh(clodGeo, idx % 2 === 0 ? soilMainMat : soilDarkMat);
      clod.position.set(cx, y0 + this.soilHeight + 0.02, cz);
      clod.rotation.set(idx * 0.7, idx * 1.1, idx * 0.4);
      clod.scale.set(1.1, 0.6, 0.9);
      this.group.add(clod);
    });

    // 外周を囲む丸い石の縁取り
    const stoneCount = 16;
    const stoneGeo = new THREE.SphereGeometry(0.28, 10, 8);
    for (let i = 0; i < stoneCount; i++) {
      const ang = (i / stoneCount) * Math.PI * 2;
      const dist = this.soilRadius + 0.14;
      const stone = new THREE.Mesh(stoneGeo, stoneRimMat);
      stone.position.set(
        Math.cos(ang) * dist,
        y0 + 0.11,
        Math.sin(ang) * dist
      );
      stone.scale.set(1.15, 0.72, 1.0);
      stone.rotation.y = -ang;
      this.group.add(stone);
    }

    this.addCylinderCollider(0, 0, y0 - 0.1, y0 + this.soilHeight, this.soilRadius + 0.22);
  }

  _buildFoliage() {
    const spots = [
      [-7.4, 2.2], [-6.5, 4.8], [-4.4, 6.8], [-1.8, 7.6],
      [7.4, 2.2], [6.5, 4.8], [4.4, 6.8], [1.8, 7.6],
      [-7.6, -2.4], [-6.2, -5.2], [-3.6, -7.0],
      [7.6, -2.4], [6.2, -5.2], [3.6, -7.0],
      [-4.6, 1.2], [4.6, 1.2], [-4.2, -2.8], [4.2, -2.8]
    ];

    spots.forEach(([x, z], idx) => {
      this.addGrassTuft(x, this.groundLocalY, z, 0.8 + (idx % 3) * 0.18);
      if (idx % 2 === 0) {
        this.addFlower(x + 0.28, this.groundLocalY, z + 0.22, idx);
      }
      if (idx % 5 === 0) {
        this.addBush(x - 0.34, this.groundLocalY, z - 0.3, 0.75 + (idx % 2) * 0.16);
      }
    });
  }

  _buildBeanstalk() {
    const y0 = this.groundLocalY;
    this.beanstalkGroup = new THREE.Group();
    this.beanstalkGroup.position.set(0, y0, 0);
    this.group.add(this.beanstalkGroup);

    const stemMainMat = new THREE.MeshToonMaterial({ color: 0x3db854 });
    const stemSubMat = new THREE.MeshToonMaterial({ color: 0x2a8f40 });
    const leafMat = new THREE.MeshToonMaterial({ color: 0x5cd669 });
    const leafVeinMat = new THREE.MeshToonMaterial({ color: 0x90f08b });
    const tendrilMat = new THREE.MeshToonMaterial({ color: 0x6ce372 });

    // 太い2本の螺旋ツル（ジャックと豆の木風の絡み合い）
    const totalHeight = this.beanstalkHeight;
    const vineSpecs = [
      { phase: 0, radius: 0.92, tubeR: 0.64, turns: 6.2, mat: stemMainMat },
      { phase: Math.PI, radius: 0.88, tubeR: 0.56, turns: 6.2, mat: stemSubMat }
    ];

    for (const v of vineSpecs) {
      const pts = [];
      const segs = 48;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const ang = v.phase + t * Math.PI * 2 * v.turns;
        const r = v.radius * (1.0 - t * 0.22);
        pts.push(new THREE.Vector3(Math.cos(ang) * r, t * totalHeight, Math.sin(ang) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 72, v.tubeR, 10, false);
      this.beanstalkGroup.add(new THREE.Mesh(tubeGeo, v.mat));
    }

    // 中央の芯となる太い茎
    const coreGeo = new THREE.CylinderGeometry(0.55, 0.92, totalHeight, 14);
    const coreMesh = new THREE.Mesh(coreGeo, stemSubMat);
    coreMesh.position.y = totalHeight * 0.5;
    this.beanstalkGroup.add(coreMesh);

    // 大きな足場用葉っぱの共通ジオメトリ（付け根が原点、+Z方向に長さ5.8m・幅4.5m）
    const bigLeafShape = new THREE.Shape();
    bigLeafShape.moveTo(0, 0);
    bigLeafShape.bezierCurveTo(2.1, 0.8, 2.7, 3.0, 1.6, 4.7);
    bigLeafShape.bezierCurveTo(0.9, 5.5, 0.25, 5.9, 0, 6.1);
    bigLeafShape.bezierCurveTo(-0.25, 5.9, -0.9, 5.5, -1.6, 4.7);
    bigLeafShape.bezierCurveTo(-2.7, 3.0, -2.1, 0.8, 0, 0);
    bigLeafShape.closePath();

    const bigLeafGeo = new THREE.ExtrudeGeometry(bigLeafShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 2,
      curveSegments: 14
    });
    bigLeafGeo.rotateX(Math.PI / 2);

    const veinGeo = new THREE.BoxGeometry(0.22, 0.12, 4.8);
    const stemBridgeGeo = new THREE.CylinderGeometry(0.22, 0.32, 1.45, 8);
    stemBridgeGeo.rotateX(Math.PI / 2);

    // MAX大ジャンプ（約27.5m）で繰り返し登れる高さ間隔（21.0m刻み）で4枚の足場葉を配置
    const platformHeights = [21.0, 42.0, 63.0, 84.0];
    const platformAngles = [0.45, 2.05, 3.65, 5.25];

    platformHeights.forEach((h, idx) => {
      const ang = platformAngles[idx];
      const leafPivot = new THREE.Group();
      leafPivot.position.set(0, h, 0);
      leafPivot.rotation.y = ang;
      this.beanstalkGroup.add(leafPivot);

      // 幹と葉っぱを繋ぐ太い茎の枝
      const branch = new THREE.Mesh(stemBridgeGeo, stemMainMat);
      branch.position.set(0, -0.1, 0.8);
      leafPivot.add(branch);

      // 葉っぱ本体（上面が概ね y = h + 0.12 付近になるように配置）
      const leafMesh = new THREE.Mesh(bigLeafGeo, leafMat);
      leafMesh.position.set(0, 0.04, 0.95);
      leafPivot.add(leafMesh);

      const veinMesh = new THREE.Mesh(veinGeo, leafVeinMat);
      veinMesh.position.set(0, 0.11, 3.6);
      leafPivot.add(veinMesh);

      // 葉の向き（local +Z が world (sin(ang), cos(ang))）に合わせてフラットな足場コライダーを2つ配置
      const dirX = Math.sin(ang);
      const dirZ = Math.cos(ang);
      this.beanstalkColliders.push(
        this.addCylinderCollider(dirX * 2.85, dirZ * 2.85, y0 + h - 0.55, y0 + h + 0.14, 1.85, false),
        this.addCylinderCollider(dirX * 4.85, dirZ * 4.85, y0 + h - 0.55, y0 + h + 0.14, 1.55, false)
      );
    });

    // 見栄え用の小さな飾り葉・巻きヒゲを中間高さに配置
    const smallLeafGeo = new THREE.SphereGeometry(1, 10, 8);
    const tendrilGeo = new THREE.TorusGeometry(0.45, 0.09, 6, 14, Math.PI * 1.45);
    for (let i = 0; i < 16; i++) {
      const h = 5.5 + i * 6.5;
      const ang = i * 1.45 + 0.9;
      const decLeaf = new THREE.Mesh(smallLeafGeo, i % 2 === 0 ? leafMat : tendrilMat);
      decLeaf.position.set(Math.sin(ang) * 1.65, h, Math.cos(ang) * 1.65);
      decLeaf.rotation.y = ang;
      decLeaf.rotation.x = 0.25;
      decLeaf.scale.set(0.85, 0.16, 1.35);
      this.beanstalkGroup.add(decLeaf);

      if (i % 2 === 0) {
        const tendril = new THREE.Mesh(tendrilGeo, tendrilMat);
        tendril.position.set(Math.sin(ang + 1.2) * 1.25, h + 1.8, Math.cos(ang + 1.2) * 1.25);
        tendril.rotation.set(0.6, ang, 0.4);
        this.beanstalkGroup.add(tendril);
      }
    }

    // 太い幹の衝突判定（地面から頂上まで）
    this.beanstalkColliders.push(
      this.addCylinderCollider(0, 0, y0, y0 + totalHeight, 1.32, false)
    );
  }

  _buildThrowSeed() {
    const seedGroup = new THREE.Group();
    const seedGeo = new THREE.SphereGeometry(0.18, 12, 10);
    seedGeo.scale(0.88, 1.28, 0.88);
    const seedMat = new THREE.MeshToonMaterial({ color: 0xe3a857 });
    const sproutGeo = new THREE.ConeGeometry(0.08, 0.18, 6);
    const sproutMat = new THREE.MeshToonMaterial({ color: 0x8be055 });

    const body = new THREE.Mesh(seedGeo, seedMat);
    seedGroup.add(body);

    const sprout = new THREE.Mesh(sproutGeo, sproutMat);
    sprout.position.set(0.04, 0.22, 0);
    sprout.rotation.z = -0.35;
    seedGroup.add(sprout);

    seedGroup.visible = false;
    this.group.add(seedGroup);
    this.throwSeedMesh = seedGroup;
  }

  updateThrowSeed(t, startWorldPos) {
    if (!this.throwSeedMesh) return;
    if (t < 0 || t > 1) {
      this.throwSeedMesh.visible = false;
      return;
    }

    this.throwSeedMesh.visible = true;
    const lx0 = startWorldPos.x - this.position.x;
    const ly0 = startWorldPos.y - this.position.y;
    const lz0 = startWorldPos.z - this.position.z;

    const targetY = this.groundLocalY + this.soilHeight;
    const lx = THREE.MathUtils.lerp(lx0, 0, t);
    const lz = THREE.MathUtils.lerp(lz0, 0, t);
    const ly = THREE.MathUtils.lerp(ly0, targetY, t) + Math.sin(t * Math.PI) * 1.95;

    this.throwSeedMesh.position.set(lx, ly, lz);
    this.throwSeedMesh.rotation.z = t * Math.PI * 3.0;
    this.throwSeedMesh.rotation.x = t * Math.PI * 2.0;
  }

  hideThrowSeed() {
    if (this.throwSeedMesh) {
      this.throwSeedMesh.visible = false;
    }
  }

  setBeanstalkGrowthProgress(t) {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    if (!this.beanstalkGroup) return;
    if (clamped <= 0) {
      this.beanstalkGroup.visible = false;
      this.beanstalkGroup.scale.set(0.01, 0.01, 0.01);
      return;
    }
    this.beanstalkGroup.visible = true;
    const eased = 1 - Math.pow(1 - clamped, 2.2);
    const xzScale = THREE.MathUtils.lerp(0.28, 1.0, Math.min(1, clamped * 1.45));
    const yScale = Math.max(0.01, eased);
    this.beanstalkGroup.scale.set(xzScale, yScale, xzScale);
  }

  setBeanstalkGrown(grown) {
    this.isBeanstalkGrown = !!grown;
    if (this.beanstalkGroup) {
      this.beanstalkGroup.visible = this.isBeanstalkGrown;
      if (this.isBeanstalkGrown) {
        this.beanstalkGroup.scale.set(1, 1, 1);
      } else {
        this.beanstalkGroup.scale.set(0.01, 0.01, 0.01);
      }
    }
    for (const col of this.beanstalkColliders) {
      col.active = this.isBeanstalkGrown;
    }
  }

  getPinkBuddyAnchor(radius = 0.6) {
    const lx = -2.85;
    const lz = 2.05;
    return {
      position: new THREE.Vector3(
        this.position.x + lx,
        this.groundWorldY + radius,
        this.position.z + lz
      ),
      lookTarget: this.soilCenterWorld.clone()
    };
  }

  isPlayerNearSoil(playerPos, range = 3.4) {
    if (!playerPos) return false;
    const dx = playerPos.x - this.soilCenterWorld.x;
    const dz = playerPos.z - this.soilCenterWorld.z;
    const dy = playerPos.y - this.groundWorldY;
    return Math.hypot(dx, dz) <= range && dy >= -0.5 && dy <= 3.5;
  }

  getSafeSpot(playerPos, radius) {
    return new THREE.Vector3(
      this.position.x - 3.6,
      this.groundWorldY + radius + 0.6,
      this.position.z + 4.8
    );
  }
}