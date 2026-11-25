class CastleIsland extends StructureBase {
  constructor(centerPos) {
    super('castle', centerPos, {
      boundingRadius: 12.6,
      noCloudRadius: 26.6,
      bridgeTargetRadius: 12.6,
      bridgeSurfaceOffsetY: 1.2
    });

    this.islandRadius = 12.6;
    this.groundLocalY = 1.2;
    this.groundWorldY = this.position.y + this.groundLocalY;

    this.openAmount = 0;
    this.doorOpenAngle = Math.PI * 0.58;

    this.doorBlockCollider = null;
    this.leftDoorOpenCollider = null;
    this.rightDoorOpenCollider = null;

    this.buildFloatingIslandPlatform(this.islandRadius, this.groundLocalY);
    this._buildGrassAndFoliage();
    this._buildCastle();
    this._buildCastleColliders();
  }

  _buildGrassAndFoliage() {
    const decorSpots = [
      [-9.8, 3.2], [-8.6, 5.8], [-6.8, 8.2], [-4.2, 9.6],
      [9.8, 3.2], [8.6, 5.8], [6.8, 8.2], [4.2, 9.6],
      [-10.4, -1.5], [-9.8, -5.2], [-7.5, -8.4],
      [10.4, -1.5], [9.8, -5.2], [7.5, -8.4],
      [-5.6, 3.8], [5.6, 3.8], [-3.8, 5.5], [3.8, 5.5],
      [-7.2, 1.4], [7.2, 1.4], [-3.2, 8.2], [3.2, 8.2]
    ];

    decorSpots.forEach(([x, z], idx) => {
      this.addGrassTuft(x, this.groundLocalY, z, 0.85 + (idx % 3) * 0.22);
      if (idx % 2 === 0) {
        this.addFlower(x + 0.32, this.groundLocalY, z + 0.24, idx);
      }
      if (idx % 4 === 0) {
        this.addBush(x - 0.35, this.groundLocalY, z - 0.35, 0.72 + (idx % 3) * 0.15);
      }
    });

    this.addBush(-3.1, this.groundLocalY, 1.9, 1.05);
    this.addBush(3.1, this.groundLocalY, 1.9, 1.05);
    this.addBush(-5.8, this.groundLocalY, -0.6, 1.15);
    this.addBush(5.8, this.groundLocalY, -0.6, 1.15);
  }

  _buildCastle() {
    const wallMat = new THREE.MeshToonMaterial({ color: 0xf7f2f5 });
    const wallCreamMat = new THREE.MeshToonMaterial({ color: 0xf2dae6 });
    const roofPinkMat = new THREE.MeshToonMaterial({ color: 0xf25c93 });
    const roofSkyMat = new THREE.MeshToonMaterial({ color: 0x47b4f5 });
    const goldMat = new THREE.MeshToonMaterial({ color: 0xf5b82e });
    const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0x9ee0ff });
    const carpetMat = new THREE.MeshToonMaterial({ color: 0xeb5288 });
    const floorTileMat = new THREE.MeshToonMaterial({ color: 0xe8d5c8 });
    const woodDarkMat = new THREE.MeshToonMaterial({ color: 0x7a4728 });
    const woodFrameMat = new THREE.MeshToonMaterial({ color: 0x522b14 });
    const metalBeltMat = new THREE.MeshToonMaterial({ color: 0xd9a838 });

    const y0 = this.groundLocalY;
    this.castleGroup = new THREE.Group();
    this.group.add(this.castleGroup);

    const addBox = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y0 + y, z);
      this.castleGroup.add(mesh);
      return mesh;
    };

    addBox(3.4, 0.10, 4.1, 0, 0.05, 2.55, floorTileMat);
    addBox(8.2, 0.10, 7.0, 0, 0.05, -3.1, floorTileMat);
    addBox(8.4, 0.4, 7.2, 0, 5.1, -3.1, wallCreamMat);

    addBox(2.2, 0.04, 6.6, 0, 0.12, -0.7, carpetMat);

    addBox(2.7, 4.9, 0.8, -2.85, 2.45, 0.4, wallMat);
    addBox(2.7, 4.9, 0.8, 2.85, 2.45, 0.4, wallMat);
    addBox(3.0, 1.3, 0.8, 0, 4.25, 0.4, wallMat);

    addBox(0.8, 4.9, 7.2, -4.0, 2.45, -3.2, wallMat);
    addBox(0.8, 4.9, 7.2, 4.0, 2.45, -3.2, wallMat);
    addBox(8.8, 5.1, 0.8, 0, 2.55, -6.6, wallMat);

    addBox(0.45, 3.85, 0.96, -1.65, 1.925, 0.48, wallCreamMat);
    addBox(0.45, 3.85, 0.96, 1.65, 1.925, 0.48, wallCreamMat);
    addBox(3.75, 0.45, 0.96, 0, 3.82, 0.48, wallCreamMat);

    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), goldMat);
    emblem.position.set(0, y0 + 4.45, 0.95);
    emblem.scale.set(1.1, 1.1, 0.45);
    this.castleGroup.add(emblem);

    for (let bx = -3.6; bx <= 3.6; bx += 1.2) {
      addBox(0.65, 0.55, 0.55, bx, 5.15, 0.55, wallMat);
      addBox(0.65, 0.55, 0.55, bx, 5.15, -6.75, wallMat);
    }
    for (let bz = -6.0; bz <= -0.4; bz += 1.4) {
      addBox(0.55, 0.55, 0.65, -4.15, 5.15, bz, wallMat);
      addBox(0.55, 0.55, 0.65, 4.15, 5.15, bz, wallMat);
    }

    const addSideWindow = (wx, wz, rotY) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 1.2), windowGlowMat);
      win.position.set(wx, y0 + 2.5, wz);
      win.rotation.y = rotY;
      this.castleGroup.add(win);
    };
    addSideWindow(-3.55, -2.5, 0);
    addSideWindow(-3.55, -4.6, 0);
    addSideWindow(3.55, -2.5, 0);
    addSideWindow(3.55, -4.6, 0);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.24, 24), wallCreamMat);
    pedestal.position.set(0, y0 + 0.12, -5.0);
    this.castleGroup.add(pedestal);

    const pedRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 8, 28), goldMat);
    pedRing.rotation.x = Math.PI / 2;
    pedRing.position.set(0, y0 + 0.25, -5.0);
    this.castleGroup.add(pedRing);

    const portalArch = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.16, 10, 24, Math.PI), roofSkyMat);
    portalArch.position.set(0, y0 + 1.85, -5.5);
    this.castleGroup.add(portalArch);

    const portalColL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.85, 12), wallMat);
    portalColL.position.set(-1.35, y0 + 0.92, -5.5);
    this.castleGroup.add(portalColL);

    const portalColR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.85, 12), wallMat);
    portalColR.position.set(1.35, y0 + 0.92, -5.5);
    this.castleGroup.add(portalColR);

    const innerGlow = new THREE.Mesh(new THREE.CircleGeometry(1.18, 24), windowGlowMat);
    innerGlow.position.set(0, y0 + 1.8, -5.55);
    this.castleGroup.add(innerGlow);

    const addTower = (tx, tz, radius, height, roofMat, hasFlag = false) => {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, height, 20), wallMat);
      tower.position.set(tx, y0 + height * 0.5, tz);
      this.castleGroup.add(tower);

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.36, 20), wallCreamMat);
      collar.position.set(tx, y0 + height - 0.1, tz);
      this.castleGroup.add(collar);

      const roofH = radius * 2.25;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.24, roofH, 20), roofMat);
      roof.position.set(tx, y0 + height + roofH * 0.5, tz);
      this.castleGroup.add(roof);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.19, 12, 10), goldMat);
      finial.position.set(tx, y0 + height + roofH + radius * 0.14, tz);
      this.castleGroup.add(finial);

      const win = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.42, radius * 0.65, 0.16), windowGlowMat);
      win.position.set(tx, y0 + height * 0.68, tz + radius * 0.98);
      this.castleGroup.add(win);

      if (hasFlag) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), goldMat);
        pole.position.set(tx, y0 + height + roofH + 0.95, tz);
        this.castleGroup.add(pole);

        const flagGeo = new THREE.BoxGeometry(1.25, 0.62, 0.06);
        flagGeo.translate(0.625, 0, 0);
        this.flagMesh = new THREE.Mesh(flagGeo, roofPinkMat);
        this.flagMesh.position.set(tx, y0 + height + roofH + 1.5, tz);
        this.castleGroup.add(this.flagMesh);
      }
    };

    addTower(-4.4, 0.4, 1.15, 6.2, roofPinkMat, false);
    addTower(4.4, 0.4, 1.15, 6.2, roofPinkMat, false);
    addTower(-4.4, -6.6, 1.15, 7.2, roofSkyMat, false);
    addTower(4.4, -6.6, 1.15, 7.2, roofSkyMat, false);
    addTower(0, -5.6, 2.05, 9.6, roofPinkMat, true);

    const doorWidth = 1.40;
    const doorHeight = 3.56;
    const doorDepth = 0.22;

    const createDoorLeaf = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.415, y0, 0.62);

      const dir = -side;
      const leafGroup = new THREE.Group();
      leafGroup.position.set(dir * (doorWidth * 0.5), doorHeight * 0.5, 0);
      pivot.add(leafGroup);

      const frameThick = 0.14;

      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth - frameThick * 1.8, doorHeight - frameThick * 2.0, doorDepth),
        woodDarkMat
      );
      leafGroup.add(plank);

      const innerSpanW = doorWidth - frameThick * 2;
      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(innerSpanW, frameThick, doorDepth + 0.04), woodFrameMat);
      topFrame.position.y = doorHeight * 0.5 - frameThick * 0.5;
      leafGroup.add(topFrame);

      const botFrame = new THREE.Mesh(new THREE.BoxGeometry(innerSpanW, frameThick * 1.2, doorDepth + 0.04), woodFrameMat);
      botFrame.position.y = -doorHeight * 0.5 + frameThick * 0.6;
      leafGroup.add(botFrame);

      const outerSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, doorDepth + 0.04), woodFrameMat);
      outerSide.position.x = -dir * (doorWidth * 0.5 - frameThick * 0.5);
      leafGroup.add(outerSide);

      const innerSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, doorDepth + 0.04), woodFrameMat);
      innerSide.position.x = dir * (doorWidth * 0.5 - frameThick * 0.5);
      leafGroup.add(innerSide);

      for (const lx of [-0.30, 0.30]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, doorHeight - frameThick * 2.3, doorDepth + 0.025), woodFrameMat);
        rib.position.x = lx;
        leafGroup.add(rib);
      }

      for (const by of [-0.88, 0.82]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.04, 0.18, doorDepth + 0.06), metalBeltMat);
        strap.position.y = by;
        leafGroup.add(strap);
      }

      for (const fz of [doorDepth * 0.5 + 0.04, -doorDepth * 0.5 - 0.04]) {
        const ringBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12), metalBeltMat);
        ringBase.rotation.x = Math.PI / 2;
        ringBase.position.set(dir * (doorWidth * 0.5 - 0.28), -0.1, fz);
        leafGroup.add(ringBase);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 16), goldMat);
        ring.position.set(dir * (doorWidth * 0.5 - 0.28), -0.22, fz + (fz > 0 ? 0.03 : -0.03));
        leafGroup.add(ring);
      }

      this.castleGroup.add(pivot);
      return pivot;
    };

    this.leftDoorPivot = createDoorLeaf(-1);
    this.rightDoorPivot = createDoorLeaf(1);
  }

  _buildCastleColliders() {
    const addFloorBox = (cx, cy, cz, w, h, d, active = true) => {
      return this.addBoxCollider(cx, this.groundLocalY + cy, cz, w, h, d, active);
    };

    addFloorBox(-2.85, 2.45, 0.4, 2.7, 4.9, 0.85);
    addFloorBox(2.85, 2.45, 0.4, 2.7, 4.9, 0.85);
    addFloorBox(0, 4.25, 0.4, 3.0, 1.3, 0.85);
    addFloorBox(-4.0, 2.45, -3.2, 0.85, 4.9, 7.2);
    addFloorBox(4.0, 2.45, -3.2, 0.85, 4.9, 7.2);
    addFloorBox(0, 2.55, -6.6, 8.8, 5.1, 0.85);
    addFloorBox(0, 5.1, -3.1, 8.4, 0.4, 7.2);

    this.addCylinderCollider(0, -5.0, this.groundLocalY, this.groundLocalY + 0.25, 1.45);

    this.addCylinderCollider(-4.4, 0.4, this.groundLocalY, this.groundLocalY + 6.4, 1.2);
    this.addCylinderCollider(4.4, 0.4, this.groundLocalY, this.groundLocalY + 6.4, 1.2);
    this.addCylinderCollider(-4.4, -6.6, this.groundLocalY, this.groundLocalY + 7.4, 1.2);
    this.addCylinderCollider(4.4, -6.6, this.groundLocalY, this.groundLocalY + 7.4, 1.2);
    this.addCylinderCollider(0, -5.6, this.groundLocalY, this.groundLocalY + 9.8, 2.1);

    this.doorBlockCollider = addFloorBox(0, 1.8, 0.62, 3.0, 3.6, 0.34, true);
    this.leftDoorOpenCollider = addFloorBox(-1.68, 1.8, 1.42, 0.32, 3.6, 1.4, false);
    this.rightDoorOpenCollider = addFloorBox(1.68, 1.8, 1.42, 0.32, 3.6, 1.4, false);
  }

  update(time, dt, playerPos, partnerPos = null) {
    if (this.flagMesh) {
      this.flagMesh.rotation.y = Math.sin(time * 3.4) * 0.22;
    }

    const doorX = this.position.x;
    const doorY = this.groundWorldY + 1.6;
    const doorZ = this.position.z + 0.62;

    const getDistToDoor = (pos) => {
      if (!pos) return Infinity;
      const dy = pos.y - doorY;
      if (dy < -3.5 || dy > 6.5) return Infinity;
      return Math.hypot(pos.x - doorX, pos.z - doorZ);
    };

    const minDist = Math.min(getDistToDoor(playerPos), getDistToDoor(partnerPos));

    let shouldOpen = this.openAmount > 0.5 ? minDist < 9.5 : minDist < 8.2;
    if (!shouldOpen && minDist < 3.4) {
      shouldOpen = true;
    }

    const target = shouldOpen ? 1.0 : 0.0;
    const speed = shouldOpen ? 3.2 : 2.4;
    if (this.openAmount < target) {
      this.openAmount = Math.min(target, this.openAmount + dt * speed);
    } else if (this.openAmount > target) {
      this.openAmount = Math.max(target, this.openAmount - dt * speed);
    }

    const eased = this.openAmount * this.openAmount * (3 - 2 * this.openAmount);
    this.leftDoorPivot.rotation.y = -this.doorOpenAngle * eased;
    this.rightDoorPivot.rotation.y = this.doorOpenAngle * eased;

    const isPassable = this.openAmount >= 0.55;
    this.doorBlockCollider.active = !isPassable;
    this.leftDoorOpenCollider.active = isPassable;
    this.rightDoorOpenCollider.active = isPassable;
  }

  getSafeSpot(playerPos, radius) {
    return new THREE.Vector3(
      this.position.x,
      this.groundWorldY + radius + 0.6,
      this.position.z + 6.5
    );
  }

  checkEntrance(playerPos) {
    if (!playerPos) return null;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dy = playerPos.y - this.groundWorldY;
    if (this.openAmount >= 0.55 && Math.abs(dx) < 1.45 && dz <= 0.1 && dz >= -1.8 && dy >= 0 && dy < 3.8) {
      return 'castle';
    }
    return null;
  }
}