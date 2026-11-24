class CastleIsland {
  constructor(centerPos) {
    this.position = centerPos.clone();
    this.islandRadius = 12.6;
    this.groundLocalY = 1.2;
    this.groundWorldY = this.position.y + this.groundLocalY;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    this.openAmount = 0; // 0: 閉, 1: 開
    this.doorOpenAngle = Math.PI * 0.58; // 手前外側へ約104度開く

    // ワールド座標系の静的コライダー群
    this.staticColliders = [];
    this.doorBlockCollider = null;
    this.leftDoorOpenCollider = null;
    this.rightDoorOpenCollider = null;

    this._buildIslandBase();
    this._buildGrassAndFoliage();
    this._buildCastle();
    this._buildColliders();
  }

  _rockNoise(x, y, z) {
    const n1 = Math.sin(x * 2.13 + y * 1.71 + z * 2.57);
    const n2 = Math.cos(x * 3.77 - y * 2.91 + z * 1.83);
    return (n1 * 0.6 + n2 * 0.4);
  }

  _createCraggyRockGeo(radius, detail = 1, yScale = 1.0, seed = 0, topFlatten = 1.0, maxLocalY = Infinity) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      // 同一座標の頂点には同一オフセットを与え、隙間を防ぐ
      const qx = Math.round(vx * 1000) / 1000;
      const qy = Math.round(vy * 1000) / 1000;
      const qz = Math.round(vz * 1000) / 1000;
      const n = this._rockNoise(qx + seed, qy - seed * 0.7, qz + seed * 1.3);
      const scale = 1.0 + n * 0.24;
      const yFactor = vy > 0 ? yScale * topFlatten : yScale;
      const ny = Math.min(maxLocalY, vy * scale * yFactor);
      pos.setXYZ(i, vx * scale, ny, vz * scale);
    }
    geo.computeVertexNormals();
    return geo;
  }

  _buildIslandBase() {
    const rockMatMain = new THREE.MeshToonMaterial({ color: 0x8d99ae, flatShading: true });
    const rockMatDark = new THREE.MeshToonMaterial({ color: 0x6f7b91, flatShading: true });
    const rockMatLight = new THREE.MeshToonMaterial({ color: 0xa3afc2, flatShading: true });
    const soilMat = new THREE.MeshToonMaterial({ color: 0x9c7258 });

    // 草原のすぐ下の土層（下端 y = 0.05 までしっかり厚みを確保）
    const soilGeo = new THREE.CylinderGeometry(this.islandRadius - 0.15, this.islandRadius - 1.0, 0.9, 32);
    const soilMesh = new THREE.Mesh(soilGeo, soilMat);
    soilMesh.position.set(0, 0.5, 0);
    this.group.add(soilMesh);

    // 土層にしっかり食い込む中央のゴツゴツ岩土台（上面は y <= 0.70 に抑えて草原を突き抜けない）
    const coreY = -0.35;
    const coreRockGeo = this._createCraggyRockGeo(11.3, 1, 0.38, 1.4, 0.35, 0.70 - coreY);
    const coreRock = new THREE.Mesh(coreRockGeo, rockMatMain);
    coreRock.position.set(0, coreY, 0);
    this.group.add(coreRock);

    // 外周から土層の下端に隙間なく密着するゴツゴツした張り出し岩
    const sideCount = 14;
    for (let i = 0; i < sideCount; i++) {
      const ang = (i / sideCount) * Math.PI * 2 + (i % 2) * 0.12;
      const dist = 8.4 + (i % 3) * 0.85;
      const rSize = 2.3 + (i % 3) * 0.45;
      const posY = -0.35 - (i % 2) * 0.32;
      const rockGeo = this._createCraggyRockGeo(rSize, 0, 0.68 + (i % 2) * 0.16, i * 3.1, 0.48, 0.65 - posY);
      const mat = i % 3 === 0 ? rockMatLight : (i % 2 === 0 ? rockMatMain : rockMatDark);
      const mesh = new THREE.Mesh(rockGeo, mat);
      mesh.position.set(
        Math.cos(ang) * dist,
        posY,
        Math.sin(ang) * dist
      );
      mesh.rotation.set(0, ang, 0);
      this.group.add(mesh);
    }

    // 逆円錐状に下へ連なる岩塊群
    const midY = -2.8;
    const midRockGeo = this._createCraggyRockGeo(8.2, 1, 0.58, 4.2, 0.55, 0.30 - midY);
    const midRock = new THREE.Mesh(midRockGeo, rockMatDark);
    midRock.position.set(0.3, midY, -0.2);
    this.group.add(midRock);

    const tipY = -6.1;
    const tipRockGeo = this._createCraggyRockGeo(4.2, 0, 0.92, 8.7, 0.5, 2.5);
    const tipRock = new THREE.Mesh(tipRockGeo, rockMatDark);
    tipRock.position.set(-0.2, tipY, 0.1);
    this.group.add(tipRock);
  }

  _buildGrassAndFoliage() {
    const grassTopMat = new THREE.MeshToonMaterial({ color: 0x57c966 });
    const grassEdgeMat = new THREE.MeshToonMaterial({ color: 0x3da84e });
    const bushMatA = new THREE.MeshToonMaterial({ color: 0x3aa350 });
    const bushMatB = new THREE.MeshToonMaterial({ color: 0x6dd668 });
    const stemMat = new THREE.MeshToonMaterial({ color: 0x359648 });

    // 平らな草原上面
    const grassGeo = new THREE.CylinderGeometry(this.islandRadius, this.islandRadius - 0.12, 0.5, 36);
    const grassMesh = new THREE.Mesh(grassGeo, grassTopMat);
    grassMesh.position.set(0, this.groundLocalY - 0.25, 0);
    this.group.add(grassMesh);

    // 草原のふちの丸い芝生リム
    const rimGeo = new THREE.TorusGeometry(this.islandRadius - 0.25, 0.28, 8, 36);
    const rimMesh = new THREE.Mesh(rimGeo, grassEdgeMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(0, this.groundLocalY - 0.16, 0);
    this.group.add(rimMesh);

    // 城の周囲や前庭の脇に草の束・低木・小花を配置
    const tuftGeo = new THREE.ConeGeometry(0.14, 0.42, 5);
    const puffGeo = new THREE.SphereGeometry(0.45, 10, 8);
    const flowerColors = [0xff5c97, 0xffcf33, 0xffffff, 0x4ec3ff];
    const flowerMats = flowerColors.map((c) => new THREE.MeshBasicMaterial({ color: c }));
    const petalGeo = new THREE.SphereGeometry(0.11, 8, 6);

    const addGrassTuft = (x, z, scale = 1.0) => {
      const tuftGroup = new THREE.Group();
      tuftGroup.position.set(x, this.groundLocalY, z);
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.Mesh(tuftGeo, k === 1 ? bushMatB : stemMat);
        const angle = (k / 3) * Math.PI * 2;
        blade.position.set(Math.cos(angle) * 0.1, 0.16 * scale, Math.sin(angle) * 0.1);
        blade.rotation.set(Math.sin(angle) * 0.26, angle, -Math.cos(angle) * 0.26);
        blade.scale.setScalar(scale);
        tuftGroup.add(blade);
      }
      this.group.add(tuftGroup);
    };

    const addFlower = (x, z, colorIdx) => {
      const f = new THREE.Mesh(petalGeo, flowerMats[colorIdx % flowerMats.length]);
      f.position.set(x, this.groundLocalY + 0.09, z);
      f.scale.set(1.2, 0.55, 1.2);
      this.group.add(f);
    };

    const addBush = (x, z, s = 1.0) => {
      const b = new THREE.Mesh(puffGeo, s > 0.9 ? bushMatA : bushMatB);
      b.position.set(x, this.groundLocalY + 0.26 * s, z);
      b.scale.set(1.15 * s, 0.85 * s, 1.15 * s);
      this.group.add(b);
    };

    // 前庭と外周にバランスよく草や花を配置（中央参道 x=-2.2..2.2 は空ける）
    const decorSpots = [
      [-9.8, 3.2], [-8.6, 5.8], [-6.8, 8.2], [-4.2, 9.6],
      [9.8, 3.2], [8.6, 5.8], [6.8, 8.2], [4.2, 9.6],
      [-10.4, -1.5], [-9.8, -5.2], [-7.5, -8.4],
      [10.4, -1.5], [9.8, -5.2], [7.5, -8.4],
      [-5.6, 3.8], [5.6, 3.8], [-3.8, 5.5], [3.8, 5.5],
      [-7.2, 1.4], [7.2, 1.4], [-3.2, 8.2], [3.2, 8.2]
    ];

    decorSpots.forEach(([x, z], idx) => {
      addGrassTuft(x, z, 0.85 + (idx % 3) * 0.22);
      if (idx % 2 === 0) {
        addFlower(x + 0.32, z + 0.24, idx);
      }
      if (idx % 4 === 0) {
        addBush(x - 0.35, z - 0.35, 0.72 + (idx % 3) * 0.15);
      }
    });

    // お城の正面両脇の可愛い丸低木
    addBush(-3.1, 1.9, 1.05);
    addBush(3.1, 1.9, 1.05);
    addBush(-5.8, -0.6, 1.15);
    addBush(5.8, -0.6, 1.15);
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

    // 前庭から扉へ続く石畳風ステップと城内の床（上面 y=0.10 に揃えてZ前後で離す）
    addBox(3.4, 0.10, 4.1, 0, 0.05, 2.55, floorTileMat);
    addBox(8.2, 0.10, 7.0, 0, 0.05, -3.1, floorTileMat);
    addBox(8.4, 0.4, 7.2, 0, 5.1, -3.1, wallCreamMat);

    // 可愛いピンクの絨毯（床・石畳より +0.04 上に出してZファイティングを防止）
    addBox(2.2, 0.04, 6.6, 0, 0.12, -0.7, carpetMat);

    // 城壁（正面開口部 x=-1.5..+1.5, y=0..3.6 を空ける）
    addBox(2.7, 4.9, 0.8, -2.85, 2.45, 0.4, wallMat);
    addBox(2.7, 4.9, 0.8, 2.85, 2.45, 0.4, wallMat);
    addBox(3.0, 1.3, 0.8, 0, 4.25, 0.4, wallMat);

    // 左右側壁・奥壁
    addBox(0.8, 4.9, 7.2, -4.0, 2.45, -3.2, wallMat);
    addBox(0.8, 4.9, 7.2, 4.0, 2.45, -3.2, wallMat);
    addBox(8.8, 5.1, 0.8, 0, 2.55, -6.6, wallMat);

    // 入口を囲む可愛い装飾ピラーとアーチ枠
    addBox(0.45, 3.85, 0.96, -1.65, 1.925, 0.48, wallCreamMat);
    addBox(0.45, 3.85, 0.96, 1.65, 1.925, 0.48, wallCreamMat);
    addBox(3.75, 0.45, 0.96, 0, 3.82, 0.48, wallCreamMat);

    // アーチ上のゴールドエンブレム
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), goldMat);
    emblem.position.set(0, y0 + 4.45, 0.95);
    emblem.scale.set(1.1, 1.1, 0.45);
    this.castleGroup.add(emblem);

    // 城壁上部のクレネレーション（凸凹の胸壁）
    for (let bx = -3.6; bx <= 3.6; bx += 1.2) {
      addBox(0.65, 0.55, 0.55, bx, 5.15, 0.55, wallMat);
      addBox(0.65, 0.55, 0.55, bx, 5.15, -6.75, wallMat);
    }
    for (let bz = -6.0; bz <= -0.4; bz += 1.4) {
      addBox(0.55, 0.55, 0.65, -4.15, 5.15, bz, wallMat);
      addBox(0.55, 0.55, 0.65, 4.15, 5.15, bz, wallMat);
    }

    // 城の内部装飾（開いた扉の奥に見える明るい部屋・窓・将来のワープ台座）
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

    // 奥の小さな台座＆光のアーチ
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

    // 丸い塔をつくるヘルパー
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

    // 両開きの重厚な木の扉（ヒンジを左右外側に置き、手前 +Z に開く）
    const doorWidth = 1.48;
    const doorHeight = 3.56;
    const doorDepth = 0.22;

    const createDoorLeaf = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.49, y0, 0.62);

      const dir = -side;
      const leafGroup = new THREE.Group();
      leafGroup.position.set(dir * (doorWidth * 0.5), doorHeight * 0.5, 0);
      pivot.add(leafGroup);

      const plank = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth), woodDarkMat);
      leafGroup.add(plank);

      const frameThick = 0.14;
      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, frameThick, doorDepth + 0.04), woodFrameMat);
      topFrame.position.y = doorHeight * 0.5 - frameThick * 0.5;
      leafGroup.add(topFrame);

      const botFrame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, frameThick * 1.2, doorDepth + 0.04), woodFrameMat);
      botFrame.position.y = -doorHeight * 0.5 + frameThick * 0.6;
      leafGroup.add(botFrame);

      const outerSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, doorDepth + 0.04), woodFrameMat);
      outerSide.position.x = -dir * (doorWidth * 0.5 - frameThick * 0.5);
      leafGroup.add(outerSide);

      const innerSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, doorDepth + 0.04), woodFrameMat);
      innerSide.position.x = dir * (doorWidth * 0.5 - frameThick * 0.5);
      leafGroup.add(innerSide);

      for (const lx of [-0.32, 0.32]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, doorHeight - 0.3, doorDepth + 0.03), woodFrameMat);
        rib.position.x = lx;
        leafGroup.add(rib);
      }

      for (const by of [-0.88, 0.82]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.06, 0.18, doorDepth + 0.06), metalBeltMat);
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

  _buildColliders() {
    const px = this.position.x;
    const py = this.position.y;
    const pz = this.position.z;
    const y0 = this.groundWorldY;

    const addCylinder = (lx, lz, lyMin, lyMax, r) => {
      const col = {
        kind: 'cylinder',
        x: px + lx,
        z: pz + lz,
        yMin: py + lyMin,
        yMax: py + lyMax,
        r,
        active: true
      };
      this.staticColliders.push(col);
      return col;
    };

    const addBox = (cx, cy, cz, w, h, d, active = true) => {
      const col = {
        kind: 'box',
        minX: px + cx - w * 0.5,
        maxX: px + cx + w * 0.5,
        minY: y0 + cy - h * 0.5,
        maxY: y0 + cy + h * 0.5,
        minZ: pz + cz - d * 0.5,
        maxZ: pz + cz + d * 0.5,
        active
      };
      this.staticColliders.push(col);
      return col;
    };

    // 浮島の平らな地面
    addCylinder(0, 0, -4.0, this.groundLocalY, this.islandRadius);

    // 城壁（入口開口部を除いた囲い）
    addBox(-2.85, 2.45, 0.4, 2.7, 4.9, 0.85);
    addBox(2.85, 2.45, 0.4, 2.7, 4.9, 0.85);
    addBox(0, 4.25, 0.4, 3.0, 1.3, 0.85);
    addBox(-4.0, 2.45, -3.2, 0.85, 4.9, 7.2);
    addBox(4.0, 2.45, -3.2, 0.85, 4.9, 7.2);
    addBox(0, 2.55, -6.6, 8.8, 5.1, 0.85);
    addBox(0, 5.1, -3.1, 8.4, 0.4, 7.2);

    // 内部の台座（低段なので乗れる）
    addCylinder(0, -5.0, this.groundLocalY, this.groundLocalY + 0.25, 1.45);

    // 4隅の塔と中央塔
    addCylinder(-4.4, 0.4, this.groundLocalY, this.groundLocalY + 6.4, 1.2);
    addCylinder(4.4, 0.4, this.groundLocalY, this.groundLocalY + 6.4, 1.2);
    addCylinder(-4.4, -6.6, this.groundLocalY, this.groundLocalY + 7.4, 1.2);
    addCylinder(4.4, -6.6, this.groundLocalY, this.groundLocalY + 7.4, 1.2);
    addCylinder(0, -5.6, this.groundLocalY, this.groundLocalY + 9.8, 2.1);

    // 閉鎖中の扉コライダー（openAmount < 0.55 のとき有効）
    this.doorBlockCollider = addBox(0, 1.8, 0.62, 3.0, 3.6, 0.34, true);

    // 手前に開いた左右扉の端コライダー（扉が十分開いたら有効）
    this.leftDoorOpenCollider = addBox(-1.68, 1.8, 1.42, 0.32, 3.6, 1.4, false);
    this.rightDoorOpenCollider = addBox(1.68, 1.8, 1.42, 0.32, 3.6, 1.4, false);
  }

  update(time, dt, playerPos, partnerPos = null) {
    if (this.flagMesh) {
      this.flagMesh.rotation.y = Math.sin(time * 3.4) * 0.22;
    }

    // 扉中心のワールド座標
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

    // 手前に開くため開閉範囲より広め（8.2m）で開き始め、離れる（9.5m超）かつ敷居付近に誰もいない時に閉まる
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

    // イージングで滑らかに開閉
    const eased = this.openAmount * this.openAmount * (3 - 2 * this.openAmount);
    this.leftDoorPivot.rotation.y = -this.doorOpenAngle * eased;
    this.rightDoorPivot.rotation.y = this.doorOpenAngle * eased;

    // 扉コライダーの切り替え
    const isPassable = this.openAmount >= 0.55;
    this.doorBlockCollider.active = !isPassable;
    this.leftDoorOpenCollider.active = isPassable;
    this.rightDoorOpenCollider.active = isPassable;
  }

  resolveCollisions(pos, vel, radius) {
    let hitGround = false;
    let hardLandingVn = 0;

    // 広域カリング
    const dxCenter = pos.x - this.position.x;
    const dzCenter = pos.z - this.position.z;
    if (dxCenter * dxCenter + dzCenter * dzCenter > (this.islandRadius + 4) * (this.islandRadius + 4)) {
      return { hitGround: false, hardLandingVn: 0 };
    }

    for (const col of this.staticColliders) {
      if (!col.active) continue;

      if (col.kind === 'cylinder') {
        if (pos.y + radius <= col.yMin || pos.y - radius >= col.yMax) continue;

        const dx = pos.x - col.x;
        const dz = pos.z - col.z;
        const horizDist = Math.hypot(dx, dz);

        if (horizDist >= col.r + radius) continue;

        // 上面への着地・歩行判定
        if (pos.y >= col.yMax - 0.85 && vel.y <= 3.5 && horizDist < col.r + radius * 0.85) {
          const penY = (col.yMax + radius) - pos.y;
          if (penY >= 0) {
            pos.y = col.yMax + radius;
            if (vel.y < hardLandingVn) hardLandingVn = vel.y;
            if (vel.y < 0) vel.y = 0;
            hitGround = true;
            continue;
          }
        }

        // 下面への衝突判定
        if (pos.y <= col.yMin + 0.35 && vel.y > 0 && horizDist < col.r + radius * 0.55) {
          pos.y = col.yMin - radius;
          vel.y = 0;
          continue;
        }

        // 側面からの押し出し
        const nx = horizDist > 0.0001 ? dx / horizDist : 0;
        const nz = horizDist > 0.0001 ? dz / horizDist : 1;
        const pen = col.r + radius - horizDist;
        if (pen > 0) {
          pos.x += nx * pen;
          pos.z += nz * pen;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) {
            vel.x -= nx * vn;
            vel.z -= nz * vn;
          }
        }
      } else if (col.kind === 'box') {
        const qx = THREE.MathUtils.clamp(pos.x, col.minX, col.maxX);
        const qy = THREE.MathUtils.clamp(pos.y, col.minY, col.maxY);
        const qz = THREE.MathUtils.clamp(pos.z, col.minZ, col.maxZ);

        const dx = pos.x - qx;
        const dy = pos.y - qy;
        const dz = pos.z - qz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq >= radius * radius) continue;

        let nx = 0;
        let ny = 0;
        let nz = 0;
        let pen = 0;

        if (distSq > 0.000001) {
          const dist = Math.sqrt(distSq);
          nx = dx / dist;
          ny = dy / dist;
          nz = dz / dist;
          pen = radius - dist;
        } else {
          // 中心がボックス内部にある場合、最短脱出方向を選ぶ
          const dLeft = pos.x - col.minX;
          const dRight = col.maxX - pos.x;
          const dBottom = pos.y - col.minY;
          const dTop = col.maxY - pos.y;
          const dBack = pos.z - col.minZ;
          const dFront = col.maxZ - pos.z;

          const minOverlap = Math.min(dLeft, dRight, dBottom, dTop, dBack, dFront);
          if (minOverlap === dTop) { ny = 1; pen = radius + dTop; }
          else if (minOverlap === dBottom) { ny = -1; pen = radius + dBottom; }
          else if (minOverlap === dLeft) { nx = -1; pen = radius + dLeft; }
          else if (minOverlap === dRight) { nx = 1; pen = radius + dRight; }
          else if (minOverlap === dBack) { nz = -1; pen = radius + dBack; }
          else { nz = 1; pen = radius + dFront; }
        }

        if (pen > 0) {
          pos.x += nx * pen;
          pos.y += ny * pen;
          pos.z += nz * pen;

          const vn = vel.x * nx + vel.y * ny + vel.z * nz;
          if (vn < 0) {
            if (ny > 0.45 && vn < hardLandingVn) {
              hardLandingVn = vn;
            }
            vel.x -= nx * vn;
            vel.y -= ny * vn;
            vel.z -= nz * vn;
          }

          if (ny > 0.45) {
            hitGround = true;
          }
        }
      }
    }

    return { hitGround, hardLandingVn };
  }

  getShadowY(px, py, pz) {
    const dx = px - this.position.x;
    const dz = pz - this.position.z;
    if (dx * dx + dz * dz > (this.islandRadius + 1) * (this.islandRadius + 1)) {
      return null;
    }

    let bestY = null;
    for (const col of this.staticColliders) {
      if (!col.active) continue;
      if (col.kind === 'cylinder') {
        const dSq = (px - col.x) * (px - col.x) + (pz - col.z) * (pz - col.z);
        if (dSq <= col.r * col.r && col.yMax <= py + 0.3) {
          if (bestY === null || col.yMax > bestY) bestY = col.yMax;
        }
      } else if (col.kind === 'box') {
        if (px >= col.minX && px <= col.maxX && pz >= col.minZ && pz <= col.maxZ && col.maxY <= py + 0.3) {
          if (bestY === null || col.maxY > bestY) bestY = col.maxY;
        }
      }
    }
    return bestY;
  }
}

class SkyWorld {
  constructor(scene) {
    this.scene = scene;
    this.chunkSize = 48;
    this.activeRadiusChunks = 2; // 周囲 5x5 チャンクを表示
    this.clouds = [];
    this.chunks = new Map();
    this.time = 0;
    this._tmpShadowNormal = new THREE.Vector3();

    this.puffGeo = new THREE.SphereGeometry(1, 20, 16);
    this.starGeo = new THREE.OctahedronGeometry(0.55, 0);

    this.materials = {
      normal: new THREE.MeshToonMaterial({ color: 0xffffff }),
      normalShade: new THREE.MeshToonMaterial({ color: 0xedf6ff }),
      bouncy: new THREE.MeshToonMaterial({ color: 0xff70a6 }),
      moving: new THREE.MeshToonMaterial({ color: 0x8ae0ff }),
      island: new THREE.MeshToonMaterial({ color: 0xffffff }),
      gold: new THREE.MeshToonMaterial({ color: 0xffd166 })
    };

    this._createSkyEnvironment();

    // お城の浮島（スタート地点正面から見える位置に常駐）
    this.castleIsland = new CastleIsland(new THREE.Vector3(0, 3.5, -74));
    this.scene.add(this.castleIsland.group);

    // ワールドに1人だけのハートちゃんとスターくんを生成
    this.heartBuddy = new HeartBuddy(new THREE.Vector3(16, 5.5, -42));
    this.scene.add(this.heartBuddy.group);

    this.starBuddy = new StarBuddy(new THREE.Vector3(15, 4.0, 4));
    this.scene.add(this.starBuddy.group);
    this.scene.add(this.starBuddy.dropShadow);
  }

  _createSkyEnvironment() {
    const skyGeo = new THREE.SphereGeometry(300, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x5ec8ff) },
        midColor: { value: new THREE.Color(0xcff2ff) },
        bottomColor: { value: new THREE.Color(0xffe6f2) }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = mix(midColor, topColor, smoothstep(0.0, 0.65, h));
          col = mix(bottomColor, col, smoothstep(-0.35, 0.05, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    this.scene.fog = new THREE.Fog(0xd8f4ff, 54, 124);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffd4eb, 0.85);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfffdf5, 0.75);
    dir.position.set(25, 45, 20);
    this.scene.add(dir);
  }

  _hash(x, z, seed = 0) {
    let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  syncTime(hostTime) {
    if (typeof hostTime === 'number') {
      if (Math.abs(hostTime - this.time) > 0.5) {
        this.time = hostTime;
      } else {
        this.time = THREE.MathUtils.lerp(this.time, hostTime, 0.25);
      }
    }
  }

  _assignHeartHomeCloud(playerPos) {
    let bestCloud = null;
    let bestScore = Infinity;

    for (const cloud of this.clouds) {
      if (cloud.type !== 'island') continue;
      if (cloud.isHeartHome) {
        this.heartBuddy.setHomeCloud(cloud, this.heartBuddy.homeCloud === null);
        return;
      }

      const d = Math.hypot(cloud.position.x - playerPos.x, cloud.position.z - playerPos.z);
      const score = Math.abs(d - 50);
      if (d > 22 && score < bestScore) {
        bestScore = score;
        bestCloud = cloud;
      }
    }

    if (bestCloud) {
      this.heartBuddy.setHomeCloud(bestCloud, this.heartBuddy.homeCloud === null);
    }
  }

  _assignStarHomeCloud(playerPos) {
    let bestCloud = null;
    let bestScore = Infinity;

    for (const cloud of this.clouds) {
      if (cloud.type === 'bouncy') continue;
      const d = Math.hypot(cloud.position.x - playerPos.x, cloud.position.z - playerPos.z);
      const score = Math.abs(d - 36);
      if (d > 14 && score < bestScore) {
        bestScore = score;
        bestCloud = cloud;
      }
    }

    if (bestCloud) {
      this.starBuddy.placeOnCloud(bestCloud);
    }
  }

  updateChunks(playerPos, dt, isGuest = false, remoteHeartState = null, remoteStarState = null, partnerPos = null) {
    this.time += dt;
    this.skyDome.position.copy(playerPos);

    const cx = Math.round(playerPos.x / this.chunkSize);
    const cz = Math.round(playerPos.z / this.chunkSize);

    const neededKeys = new Set();

    for (let dx = -this.activeRadiusChunks; dx <= this.activeRadiusChunks; dx++) {
      for (let dz = -this.activeRadiusChunks; dz <= this.activeRadiusChunks; dz++) {
        const gx = cx + dx;
        const gz = cz + dz;
        const key = `${gx},${gz}`;
        neededKeys.add(key);

        if (!this.chunks.has(key)) {
          this._generateChunk(gx, gz, key);
        }
      }
    }

    for (const [key, chunkClouds] of this.chunks.entries()) {
      if (!neededKeys.has(key)) {
        for (const c of chunkClouds) {
          this.scene.remove(c.group);
          const idx = this.clouds.indexOf(c);
          if (idx !== -1) this.clouds.splice(idx, 1);
        }
        this.chunks.delete(key);
      }
    }

    for (const cloud of this.clouds) {
      cloud.prevPos.copy(cloud.position);

      if (cloud.type === 'moving') {
        const offset = Math.sin(this.time * cloud.moveSpeed + cloud.movePhase) * cloud.moveRange;
        cloud.position.x = cloud.basePos.x + cloud.moveAxis.x * offset;
        cloud.position.y = cloud.basePos.y + cloud.moveAxis.y * offset;
        cloud.position.z = cloud.basePos.z + cloud.moveAxis.z * offset;
      } else {
        cloud.position.y = cloud.basePos.y + Math.sin(this.time * 1.1 + cloud.bobPhase) * 0.14;
      }

      cloud.deltaPos.subVectors(cloud.position, cloud.prevPos);
      cloud.group.position.copy(cloud.position);

      const dist = cloud.position.distanceTo(playerPos);
      const appearFactor = THREE.MathUtils.clamp(1.0 - (dist - 72) / 38, 0.01, 1.0);
      const targetScale = THREE.MathUtils.smoothstep(appearFactor, 0, 1);
      cloud.visualScale = THREE.MathUtils.lerp(cloud.visualScale, targetScale, Math.min(1, dt * 6));
      cloud.group.scale.setScalar(cloud.visualScale);
      cloud.group.visible = cloud.visualScale > 0.03;
    }

    if (this.castleIsland) {
      this.castleIsland.update(this.time, dt, playerPos, partnerPos);
    }

    if (isGuest && remoteHeartState) {
      this.heartBuddy.applySyncState(remoteHeartState, this.time, dt);
    } else {
      const home = this.heartBuddy.homeCloud;
      const homeMissing = !home || !this.clouds.includes(home);
      const tooFar = home
        ? Math.hypot(playerPos.x - home.position.x, playerPos.z - home.position.z) > 120
        : false;

      if (homeMissing || tooFar) {
        this._assignHeartHomeCloud(playerPos);
      }
      this.heartBuddy.update(this.time, dt, playerPos);
    }

    if (isGuest && remoteStarState) {
      this.starBuddy.applySyncState(remoteStarState, dt, this);
    } else {
      const starTooFar =
        Math.hypot(playerPos.x - this.starBuddy.position.x, playerPos.z - this.starBuddy.position.z) > 110;
      const safeMissing = this.starBuddy.safeCloud && !this.clouds.includes(this.starBuddy.safeCloud);
      if (starTooFar || safeMissing) {
        this._assignStarHomeCloud(playerPos);
      }
      this.starBuddy.update(dt, playerPos, this, partnerPos);
    }
  }

  resolveStructureCollisions(pos, vel, radius) {
    if (!this.castleIsland) return { hitGround: false, hardLandingVn: 0 };
    return this.castleIsland.resolveCollisions(pos, vel, radius);
  }

  _generateChunk(gx, gz, key) {
    const chunkClouds = [];

    if (gx === 0 && gz === 0) {
      chunkClouds.push(this._createCloud(0, 0, 0, 'island', 0));
      chunkClouds.push(this._createCloud(0, 1.0, -14, 'normal', 1));
      chunkClouds.push(this._createCloud(10, 2.0, -19, 'bouncy', 2));
      chunkClouds.push(this._createCloud(-12, 1.5, -16, 'moving', 3));
      chunkClouds.push(this._createCloud(15, 0.8, 4, 'island', 4));
      chunkClouds.push(this._createCloud(-14, 1.0, 8, 'normal', 5));
      chunkClouds.push(this._createCloud(0, 1.6, 16, 'bouncy', 6));
    } else if (gx === 0 && gz === -1) {
      const heartIsland = this._createCloud(16, 1.5, -42, 'island', 77);
      heartIsland.isHeartHome = true;
      chunkClouds.push(heartIsland);
      chunkClouds.push(this._createCloud(8, 1.2, -29, 'normal', 78));
      chunkClouds.push(this._createCloud(-8, 1.8, -36, 'bouncy', 79));
      chunkClouds.push(this._createCloud(-14, 1.2, -52, 'island', 80));
      chunkClouds.push(this._createCloud(18, 2.2, -62, 'moving', 81));
    } else {
      const count = 5 + Math.floor(this._hash(gx, gz, 1) * 3);
      for (let i = 0; i < count; i++) {
        const rx = (this._hash(gx, gz, i * 10 + 2) - 0.5) * (this.chunkSize - 8);
        const rz = (this._hash(gx, gz, i * 10 + 3) - 0.5) * (this.chunkSize - 8);
        const ry = (this._hash(gx, gz, i * 10 + 4) - 0.45) * 8.0;

        const wx = gx * this.chunkSize + rx;
        const wz = gz * this.chunkSize + rz;

        // お城の浮島の周囲にはランダム雲を生成しない
        if (this.castleIsland) {
          const distCastle = Math.hypot(wx - this.castleIsland.position.x, wz - this.castleIsland.position.z);
          if (distCastle < this.castleIsland.islandRadius + 14) {
            continue;
          }
        }

        const rType = this._hash(gx, gz, i * 10 + 5);
        let type = 'normal';
        if (rType > 0.62) type = 'island';
        else if (rType > 0.44) type = 'bouncy';
        else if (rType > 0.28) type = 'moving';

        chunkClouds.push(this._createCloud(wx, ry, wz, type, i + gx * 3 + gz * 7));
      }
    }

    this.chunks.set(key, chunkClouds);
    for (const c of chunkClouds) {
      this.clouds.push(c);
      this.scene.add(c.group);
    }
  }

  _createCloud(x, y, z, type, seed) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const colliders = [];
    const mat = this.materials[type] || this.materials.normal;

    const addPuff = (lx, ly, lz, rx, ry, rz, customMat = mat) => {
      const mesh = new THREE.Mesh(this.puffGeo, customMat);
      mesh.position.set(lx, ly, lz);
      mesh.scale.set(rx, ry, rz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      colliders.push({
        offset: new THREE.Vector3(lx, ly, lz),
        rx,
        ry,
        rz
      });
    };

    const h1 = this._hash(x, z, seed + 11);
    const h2 = this._hash(x, z, seed + 22);

    if (type === 'island') {
      const baseR = 8.4 + h2 * 3.0;
      addPuff(0, 0, 0, baseR, 2.5, baseR, this.materials.island);
      addPuff(-baseR * 0.62, -0.25, baseR * 0.35, baseR * 0.58, 1.9, baseR * 0.58, this.materials.normalShade);
      addPuff(baseR * 0.64, -0.25, -baseR * 0.32, baseR * 0.6, 2.0, baseR * 0.6, this.materials.normalShade);
      addPuff(baseR * 0.4, -0.3, baseR * 0.58, baseR * 0.52, 1.7, baseR * 0.52, this.materials.island);
      addPuff(-baseR * 0.45, -0.3, -baseR * 0.55, baseR * 0.54, 1.8, baseR * 0.54, this.materials.island);

      const star = new THREE.Mesh(this.starGeo, this.materials.gold);
      star.position.set(baseR * 0.38, 3.1, -baseR * 0.28);
      star.matrixAutoUpdate = false;
      star.updateMatrix();
      group.add(star);
    } else if (type === 'bouncy') {
      const r = 4.2 + h2 * 1.4;
      addPuff(0, 0, 0, r, 1.8, r, this.materials.bouncy);
      addPuff(-r * 0.56, -0.2, 0.9, r * 0.62, 1.35, r * 0.62, this.materials.bouncy);
      addPuff(r * 0.58, -0.2, -0.8, r * 0.62, 1.35, r * 0.62, this.materials.bouncy);
    } else if (type === 'moving') {
      const r = 4.0 + h2 * 1.2;
      addPuff(0, 0, 0, r, 1.6, r * 0.92, this.materials.moving);
      addPuff(-r * 0.64, -0.15, 0.3, r * 0.62, 1.25, r * 0.62, this.materials.moving);
      addPuff(r * 0.64, -0.15, -0.3, r * 0.62, 1.25, r * 0.62, this.materials.moving);
    } else {
      const shapeRoll = h1;
      if (shapeRoll < 0.32) {
        const w = 6.8 + h2 * 2.4;
        const d = 5.8 + h1 * 2.2;
        addPuff(0, 0, 0, w, 2.0, d, mat);
        addPuff(-w * 0.55, -0.2, d * 0.3, w * 0.5, 1.5, d * 0.5, this.materials.normalShade);
        addPuff(w * 0.55, -0.2, -d * 0.3, w * 0.5, 1.5, d * 0.5, this.materials.normalShade);
      } else if (shapeRoll < 0.64) {
        const yaw = h2 * Math.PI;
        addPuff(0, 0, 0, 3.6, 1.65, 3.6, mat);
        for (const i of [-1, 1]) {
          const lx = Math.cos(yaw) * i * 3.8;
          const lz = -Math.sin(yaw) * i * 3.8;
          addPuff(lx, -0.1, lz, 3.4, 1.55, 3.4, this.materials.normalShade);
        }
      } else {
        const s = 5.2 + h2 * 2.0;
        addPuff(0, 0, 0, s, s * 0.44, s, mat);
        addPuff(-s * 0.55, -0.2, 0.4, s * 0.6, s * 0.36, s * 0.6, this.materials.normalShade);
        addPuff(s * 0.55, -0.2, -0.4, s * 0.6, s * 0.36, s * 0.6, this.materials.normalShade);
        addPuff(0.2, -0.2, s * 0.52, s * 0.55, s * 0.34, s * 0.55, mat);
      }
    }

    const moveAxis = h1 > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);

    return {
      type,
      group,
      basePos: new THREE.Vector3(x, y, z),
      position: new THREE.Vector3(x, y, z),
      prevPos: new THREE.Vector3(x, y, z),
      deltaPos: new THREE.Vector3(),
      colliders,
      bobPhase: h2 * Math.PI * 2,
      movePhase: h1 * Math.PI * 2,
      moveSpeed: 0.85 + h2 * 0.45,
      moveRange: 3.5 + h1 * 2.5,
      moveAxis,
      visualScale: 0.05
    };
  }

  getShadowGroundInfo(px, py, pz) {
    let bestInfo = null;

    if (this.castleIsland) {
      const castleShadowY = this.castleIsland.getShadowY(px, py, pz);
      if (castleShadowY !== null) {
        this._tmpShadowNormal.set(0, 1, 0);
        bestInfo = { y: castleShadowY, normal: this._tmpShadowNormal };
      }
    }

    for (const cloud of this.clouds) {
      if (!cloud.group.visible) continue;
      if (Math.abs(cloud.position.x - px) > 28 || Math.abs(cloud.position.z - pz) > 28) {
        continue;
      }

      for (const col of cloud.colliders) {
        const cx = cloud.position.x + col.offset.x;
        const cy = cloud.position.y + col.offset.y;
        const cz = cloud.position.z + col.offset.z;

        const dx = px - cx;
        const dz = pz - cz;
        const nx = dx / col.rx;
        const nz = dz / col.rz;
        const sq = nx * nx + nz * nz;

        if (sq < 0.98) {
          const dy = col.ry * Math.sqrt(1.0 - sq);
          const surfaceY = cy + dy;

          if (surfaceY <= py + 0.3 && (bestInfo === null || surfaceY > bestInfo.y)) {
            const normX = dx / (col.rx * col.rx);
            const normY = dy / (col.ry * col.ry);
            const normZ = dz / (col.rz * col.rz);
            this._tmpShadowNormal.set(normX, normY, normZ).normalize();
            bestInfo = { y: surfaceY, normal: this._tmpShadowNormal };
          }
        }
      }
    }

    return bestInfo;
  }
}