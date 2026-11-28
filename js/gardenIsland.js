class GardenIsland extends StructureBase {
  constructor(centerPos) {
    super('garden', centerPos, {
      boundingRadius: 10.0,
      noCloudRadius: 18.5,
      bridgeTargetRadius: 10.0,
      bridgeSurfaceOffsetY: 1.2
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

    this.buildFloatingIslandPlatform(this.islandRadius, this.groundLocalY);
    this._buildSoilBed();
    this._buildFoliage();
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