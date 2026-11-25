class CloudBuildingBuilder {
  constructor() {
    this.pureWhiteMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    this.wallCreamMat = new THREE.MeshToonMaterial({ color: 0xc9ad95 });
    this.plinthMat = new THREE.MeshToonMaterial({ color: 0xb59b87 });

    // 強いライト下でも白飛びせず淡い色味が残る壁カラーパレット
    const wallColors = [
      0xdcc2aa, // 淡いミルクベージュ
      0xe5bac4, // 淡いダスティピンク
      0xe4d5a3, // 淡いカスタードクリーム
      0xc7bfe3, // 淡いライラック
      0xb6dbc8  // 淡いセージミント
    ];
    this.wallMats = wallColors.map((c) => new THREE.MeshToonMaterial({ color: c }));

    this.windowMat = new THREE.MeshBasicMaterial({ color: 0x4b6a94 });
    this.doorMat = new THREE.MeshBasicMaterial({ color: 0x7aa9cc });
    this.trimGoldMat = new THREE.MeshToonMaterial({ color: 0xffe484 });

    // パステル系中心の屋根カラーパレット
    const roofColors = [
      0x52a8f7, // サントリーニ・パステルブルー
      0x7fd2ff, // パステルスカイブルー
      0xff94bd, // パステルピンク
      0x76e3be, // パステルミント
      0xffe073, // パステルレモン
      0xbfa3ff, // パステルラベンダー
      0xffab8c  // パステルピーチ
    ];
    this.roofMats = roofColors.map((c) => new THREE.MeshToonMaterial({ color: c }));

    // 共有ジオメトリ（メモリ・描画負荷軽減）
    this.octWallGeo = new THREE.CylinderGeometry(1, 1.02, 1, 8);
    this.octWallGeo.rotateY(Math.PI / 8);

    this.octPlinthGeo = new THREE.CylinderGeometry(1.05, 1.07, 1, 8);
    this.octPlinthGeo.rotateY(Math.PI / 8);

    this.octEaveGeo = new THREE.CylinderGeometry(1.07, 1.07, 1, 8);
    this.octEaveGeo.rotateY(Math.PI / 8);

    this.domeGeo = new THREE.SphereGeometry(1, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);

    this.finialBallGeo = new THREE.SphereGeometry(0.14, 8, 6);
    this.crossVGeo = new THREE.BoxGeometry(0.08, 0.34, 0.08);
    this.crossHGeo = new THREE.BoxGeometry(0.24, 0.08, 0.08);

    this.winRectGeo = new THREE.BoxGeometry(0.32, 0.44, 0.06);
    this.winArchGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10);
    this.winArchGeo.rotateX(Math.PI / 2);

    this.doorRectGeo = new THREE.BoxGeometry(0.42, 0.56, 0.06);
    this.doorArchGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.06, 10);
    this.doorArchGeo.rotateX(Math.PI / 2);
  }

  _hash(seed) {
    const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  _getCloudSurfaceY(mainCol, lx, lz) {
    const nx = lx / mainCol.rx;
    const nz = lz / mainCol.rz;
    const sq = nx * nx + nz * nz;
    if (sq >= 0.96) return mainCol.offset.y;
    return mainCol.offset.y + mainCol.ry * Math.sqrt(1.0 - sq);
  }

  _addArchPanel(parent, x, y, z, rotY, isDoor, scale = 1.0) {
    const mat = isDoor ? this.doorMat : this.windowMat;
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.rotation.y = rotY;
    holder.scale.setScalar(scale);

    const rect = new THREE.Mesh(isDoor ? this.doorRectGeo : this.winRectGeo, mat);
    holder.add(rect);

    const arch = new THREE.Mesh(isDoor ? this.doorArchGeo : this.winArchGeo, mat);
    arch.position.y = isDoor ? 0.28 : 0.22;
    holder.add(arch);

    parent.add(holder);
  }

  _addDomeUnit(cloud, lx, lz, radius, wallHeight, wallMat, roofMat, yaw, seed, addCross = true) {
    const mainCol = cloud.colliders[0];
    const surfY = this._getCloudSurfaceY(mainCol, lx, lz);
    const embedDepth = 0.45;
    const baseY = surfY - embedDepth;
    const effectiveH = wallHeight + embedDepth;

    const unitGroup = new THREE.Group();
    unitGroup.position.set(lx, baseY, lz);
    unitGroup.rotation.y = yaw;
    cloud.group.add(unitGroup);

    // 雲との境界をくっきりさせる足元の基礎縁取り
    const plinthH = embedDepth + 0.08;
    const plinthMesh = new THREE.Mesh(this.octPlinthGeo, this.plinthMat);
    plinthMesh.position.y = plinthH * 0.5;
    plinthMesh.scale.set(radius, plinthH, radius);
    unitGroup.add(plinthMesh);

    // 淡く色をつけた8角形の壁本体
    const wallMesh = new THREE.Mesh(this.octWallGeo, wallMat);
    wallMesh.position.y = effectiveH * 0.5;
    wallMesh.scale.set(radius, effectiveH, radius);
    unitGroup.add(wallMesh);

    // 屋根の下のカラー縁取り（軒）
    const eaveH = Math.max(0.12, radius * 0.08);
    const eaveMesh = new THREE.Mesh(this.octEaveGeo, roofMat);
    eaveMesh.position.y = effectiveH + eaveH * 0.4;
    eaveMesh.scale.set(radius, eaveH, radius);
    unitGroup.add(eaveMesh);

    // ドーム屋根（半球）
    const domeR = radius * 0.96;
    const domeHScale = 0.88 + this._hash(seed + 1.3) * 0.18;
    const domeMesh = new THREE.Mesh(this.domeGeo, roofMat);
    domeMesh.position.y = effectiveH + eaveH * 0.7;
    domeMesh.scale.set(domeR, domeR * domeHScale, domeR);
    unitGroup.add(domeMesh);

    // てっぺんの小さな飾り（十字または丸飾り）
    const topY = effectiveH + eaveH * 0.7 + domeR * domeHScale;
    if (addCross) {
      const cV = new THREE.Mesh(this.crossVGeo, this.pureWhiteMat);
      cV.position.y = topY + 0.14;
      unitGroup.add(cV);
      const cH = new THREE.Mesh(this.crossHGeo, this.pureWhiteMat);
      cH.position.y = topY + 0.2;
      unitGroup.add(cH);
    } else {
      const ball = new THREE.Mesh(this.finialBallGeo, this.trimGoldMat);
      ball.position.y = topY + 0.06;
      unitGroup.add(ball);
    }

    // 8角形の平らな面までの距離（アポセム）に合わせてアーチ窓・扉を貼る
    const apothem = radius * 0.92388 + 0.015;
    const panelScale = THREE.MathUtils.clamp(radius / 1.75, 0.65, 1.35);
    const doorY = embedDepth + 0.08 + 0.28 * panelScale;
    const winY = embedDepth + Math.max(0.55, wallHeight * 0.52);

    const sides = [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5];
    sides.forEach((ang, idx) => {
      const px = Math.sin(ang) * apothem;
      const pz = Math.cos(ang) * apothem;
      if (idx === 0) {
        this._addArchPanel(unitGroup, px, doorY, pz, ang, true, panelScale);
      } else if (idx === 1 || idx === 3 || this._hash(seed + idx * 7) > 0.35) {
        this._addArchPanel(unitGroup, px, winY, pz, ang, false, panelScale);
      }
    });

    // 当たり判定を追加（壁＝円柱、屋根＝球体）
    const worldTopWallY = baseY + effectiveH + eaveH * 0.7;
    cloud.buildingColliders.push({
      kind: 'cylinder',
      lx,
      lz,
      lyMin: baseY,
      lyMax: worldTopWallY,
      r: radius * 0.96
    });

    const domeColR = domeR * Math.min(1.0, domeHScale * 0.98);
    cloud.buildingColliders.push({
      kind: 'sphere',
      lx,
      ly: worldTopWallY,
      lz,
      r: domeColR
    });
  }

  _addTerraceBox(cloud, lx, lz, w, h, d, yaw = 0, mat = null) {
    const mainCol = cloud.colliders[0];
    const surfY = this._getCloudSurfaceY(mainCol, lx, lz);
    const embedDepth = 0.45;
    const baseY = surfY - embedDepth;
    const effectiveH = h + embedDepth;

    const mesh = new THREE.Mesh(this.boxGeo, mat || this.wallCreamMat);
    mesh.position.set(lx, baseY + effectiveH * 0.5, lz);
    mesh.rotation.y = yaw;
    mesh.scale.set(w, effectiveH, d);
    cloud.group.add(mesh);

    const rotW = Math.abs(Math.sin(yaw)) > 0.707 ? d : w;
    const rotD = Math.abs(Math.sin(yaw)) > 0.707 ? w : d;

    cloud.buildingColliders.push({
      kind: 'box',
      cx: lx,
      cy: baseY + effectiveH * 0.5,
      cz: lz,
      w: rotW,
      h: effectiveH,
      d: rotD
    });
  }

  attachBuildingsToCloud(cloud, seed, mode = 'auto') {
    if (!cloud || !cloud.colliders || cloud.colliders.length === 0) return;
    if (!cloud.buildingColliders) cloud.buildingColliders = [];

    const mainCol = cloud.colliders[0];
    const rCloud = Math.min(mainCol.rx, mainCol.rz);
    if (rCloud < 3.4) return;

    const hA = this._hash(seed + 3.1);
    const hB = this._hash(seed + 17.7);
    const hC = this._hash(seed + 41.3);
    const hD = this._hash(seed + 73.9);
    const hE = this._hash(seed + 97.5);

    let chosenMode = mode;
    if (chosenMode === 'auto') {
      if (cloud.type === 'island') {
        chosenMode = hA < 0.52 ? 'cluster' : 'single_large';
      } else {
        chosenMode = 'single_small';
      }
    }

    const wallIdx1 = Math.floor(hE * this.wallMats.length) % this.wallMats.length;
    const wallIdx2 = (wallIdx1 + 1 + Math.floor(hA * (this.wallMats.length - 1))) % this.wallMats.length;
    const wallMat1 = this.wallMats[wallIdx1];
    const wallMat2 = this.wallMats[wallIdx2];

    const roofIdx1 = Math.floor(hB * this.roofMats.length) % this.roofMats.length;
    const roofIdx2 = (roofIdx1 + 1 + Math.floor(hC * (this.roofMats.length - 1))) % this.roofMats.length;
    const roofIdx3 = (roofIdx2 + 1 + Math.floor(hD * (this.roofMats.length - 1))) % this.roofMats.length;
    const baseYaw = hC * Math.PI * 2;

    if (chosenMode === 'cluster') {
      const count = hD < 0.55 ? 3 : 2;
      const spread = Math.min(3.4, rCloud * 0.34);
      const dirX = Math.cos(baseYaw);
      const dirZ = Math.sin(baseYaw);
      const perpX = -dirZ;
      const perpZ = dirX;

      const mainX = -dirX * (spread * 0.35);
      const mainZ = -dirZ * (spread * 0.35);
      const mainR = 2.0 + hB * 0.55;
      const mainH = 2.3 + hC * 0.9;
      this._addDomeUnit(cloud, mainX, mainZ, mainR, mainH, wallMat1, this.roofMats[roofIdx1], baseYaw, seed + 1, true);

      this._addTerraceBox(cloud, mainX + perpX * (mainR * 0.85), mainZ + perpZ * (mainR * 0.85), 2.3, 1.35, 2.0, 0, this.wallCreamMat);

      const sub1X = mainX + perpX * (mainR + 1.05);
      const sub1Z = mainZ + perpZ * (mainR + 1.05);
      const sub1R = 1.45 + hC * 0.35;
      const sub1H = 1.65 + hD * 0.55;
      this._addDomeUnit(cloud, sub1X, sub1Z, sub1R, sub1H, wallMat2, this.roofMats[roofIdx2], baseYaw + 0.4, seed + 2, false);

      if (count === 3) {
        const sub2X = mainX - perpX * (mainR * 0.92) + dirX * (mainR * 0.55);
        const sub2Z = mainZ - perpZ * (mainR * 0.92) + dirZ * (mainR * 0.55);
        const sub2R = 1.2 + hD * 0.32;
        const sub2H = 1.35 + hB * 0.45;
        this._addDomeUnit(cloud, sub2X, sub2Z, sub2R, sub2H, wallMat1, this.roofMats[roofIdx3], baseYaw - 0.5, seed + 3, false);
      }

      const safeX = dirX * (rCloud * 0.54);
      const safeZ = dirZ * (rCloud * 0.54);
      cloud.safeLocalSpot = new THREE.Vector3(safeX, this._getCloudSurfaceY(mainCol, safeX, safeZ), safeZ);
    } else if (chosenMode === 'single_corner') {
      const offsetDist = rCloud * 0.46;
      const bx = Math.cos(baseYaw) * offsetDist;
      const bz = Math.sin(baseYaw) * offsetDist;
      const r = 1.35 + hB * 0.3;
      const h = 1.45 + hC * 0.45;
      this._addDomeUnit(cloud, bx, bz, r, h, wallMat1, this.roofMats[roofIdx1], baseYaw + Math.PI, seed + 4, hD > 0.4);

      const safeX = -Math.cos(baseYaw) * (rCloud * 0.35);
      const safeZ = -Math.sin(baseYaw) * (rCloud * 0.35);
      cloud.safeLocalSpot = new THREE.Vector3(safeX, this._getCloudSurfaceY(mainCol, safeX, safeZ), safeZ);
    } else {
      const isLarge = chosenMode === 'single_large';
      const maxOffset = isLarge ? rCloud * 0.22 : rCloud * 0.2;
      const bx = Math.cos(baseYaw) * maxOffset;
      const bz = Math.sin(baseYaw) * maxOffset;
      const r = isLarge ? (2.0 + hB * 0.65) : (1.35 + hB * 0.55);
      const h = isLarge ? (2.2 + hC * 1.0) : (1.45 + hC * 0.7);
      this._addDomeUnit(cloud, bx, bz, r, h, wallMat1, this.roofMats[roofIdx1], baseYaw, seed + 5, hD > 0.35);

      if (isLarge && hD > 0.45) {
        const tx = bx - Math.cos(baseYaw) * (r * 0.95);
        const tz = bz - Math.sin(baseYaw) * (r * 0.95);
        this._addTerraceBox(cloud, tx, tz, 1.9, 1.1, 1.9, 0, this.wallCreamMat);
      }

      const safeDist = Math.min(rCloud * 0.58, r + 1.85);
      const safeX = -Math.cos(baseYaw) * safeDist;
      const safeZ = -Math.sin(baseYaw) * safeDist;
      cloud.safeLocalSpot = new THREE.Vector3(safeX, this._getCloudSurfaceY(mainCol, safeX, safeZ), safeZ);
    }
  }

  static resolveCloudBuildings(cloud, pos, vel, radius) {
    if (!cloud.buildingColliders || cloud.buildingColliders.length === 0) {
      return { hitGround: false, hardLandingVn: 0 };
    }

    const ox = cloud.position.x;
    const oy = cloud.position.y;
    const oz = cloud.position.z;

    let hitGround = false;
    let hardLandingVn = 0;

    for (const col of cloud.buildingColliders) {
      if (col.kind === 'cylinder') {
        const yMin = oy + col.lyMin;
        const yMax = oy + col.lyMax;
        if (pos.y + radius <= yMin || pos.y - radius >= yMax) continue;

        const dx = pos.x - (ox + col.lx);
        const dz = pos.z - (oz + col.lz);
        const horizDist = Math.hypot(dx, dz);
        if (horizDist >= col.r + radius) continue;

        if (pos.y >= yMax - 0.75 && vel.y <= 3.5 && horizDist < col.r + radius * 0.85) {
          const penY = (yMax + radius) - pos.y;
          if (penY >= 0) {
            pos.y = yMax + radius;
            if (vel.y < hardLandingVn) hardLandingVn = vel.y;
            if (vel.y < 0) vel.y = 0;
            hitGround = true;
            continue;
          }
        }

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
        const minX = ox + col.cx - col.w * 0.5;
        const maxX = ox + col.cx + col.w * 0.5;
        const minY = oy + col.cy - col.h * 0.5;
        const maxY = oy + col.cy + col.h * 0.5;
        const minZ = oz + col.cz - col.d * 0.5;
        const maxZ = oz + col.cz + col.d * 0.5;

        const qx = THREE.MathUtils.clamp(pos.x, minX, maxX);
        const qy = THREE.MathUtils.clamp(pos.y, minY, maxY);
        const qz = THREE.MathUtils.clamp(pos.z, minZ, maxZ);

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
          const dTop = maxY - pos.y;
          const dLeft = pos.x - minX;
          const dRight = maxX - pos.x;
          const dBack = pos.z - minZ;
          const dFront = maxZ - pos.z;
          const minOverlap = Math.min(dTop, dLeft, dRight, dBack, dFront);
          if (minOverlap === dTop) { ny = 1; pen = radius + dTop; }
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
            if (ny > 0.45 && vn < hardLandingVn) hardLandingVn = vn;
            vel.x -= nx * vn;
            vel.y -= ny * vn;
            vel.z -= nz * vn;
          }
          if (ny > 0.45) hitGround = true;
        }
      } else if (col.kind === 'sphere') {
        const cx = ox + col.lx;
        const cy = oy + col.ly;
        const cz = oz + col.lz;
        if (pos.y < cy - 0.15) continue;

        const dx = pos.x - cx;
        const dy = pos.y - cy;
        const dz = pos.z - cz;
        const distSq = dx * dx + dy * dy + dz * dz;
        const minDist = col.r + radius;
        if (distSq >= minDist * minDist || distSq < 0.000001) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        const pen = minDist - dist;

        pos.x += nx * pen;
        pos.y += ny * pen;
        pos.z += nz * pen;

        const vn = vel.x * nx + vel.y * ny + vel.z * nz;
        if (vn < 0) {
          if (ny > 0.38 && vn < hardLandingVn) hardLandingVn = vn;
          vel.x -= nx * vn;
          vel.y -= ny * vn;
          vel.z -= nz * vn;
        }
        if (ny > 0.38) hitGround = true;
      }
    }

    return { hitGround, hardLandingVn };
  }

  static getShadowInfo(cloud, px, py, pz, outNormal) {
    if (!cloud.buildingColliders || cloud.buildingColliders.length === 0) return null;

    const ox = cloud.position.x;
    const oy = cloud.position.y;
    const oz = cloud.position.z;

    let bestY = null;
    let bestNx = 0;
    let bestNy = 1;
    let bestNz = 0;

    for (const col of cloud.buildingColliders) {
      if (col.kind === 'cylinder') {
        const dx = px - (ox + col.lx);
        const dz = pz - (oz + col.lz);
        const yTop = oy + col.lyMax;
        if (dx * dx + dz * dz <= col.r * col.r && yTop <= py + 0.3) {
          if (bestY === null || yTop > bestY) {
            bestY = yTop;
            bestNx = 0;
            bestNy = 1;
            bestNz = 0;
          }
        }
      } else if (col.kind === 'box') {
        const minX = ox + col.cx - col.w * 0.5;
        const maxX = ox + col.cx + col.w * 0.5;
        const minZ = oz + col.cz - col.d * 0.5;
        const maxZ = oz + col.cz + col.d * 0.5;
        const yTop = oy + col.cy + col.h * 0.5;
        if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ && yTop <= py + 0.3) {
          if (bestY === null || yTop > bestY) {
            bestY = yTop;
            bestNx = 0;
            bestNy = 1;
            bestNz = 0;
          }
        }
      } else if (col.kind === 'sphere') {
        const cx = ox + col.lx;
        const cy = oy + col.ly;
        const cz = oz + col.lz;
        const dx = px - cx;
        const dz = pz - cz;
        const dSq = dx * dx + dz * dz;
        if (dSq < col.r * col.r) {
          const dy = Math.sqrt(col.r * col.r - dSq);
          const surfaceY = cy + dy;
          if (surfaceY <= py + 0.3 && (bestY === null || surfaceY > bestY)) {
            bestY = surfaceY;
            const len = col.r || 1;
            bestNx = dx / len;
            bestNy = dy / len;
            bestNz = dz / len;
          }
        }
      }
    }

    if (bestY === null) return null;
    outNormal.set(bestNx, bestNy, bestNz);
    return { y: bestY, normal: outNormal };
  }
}