class StructureBase {
  constructor(id, centerPos, options = {}) {
    this.id = id;
    this.position = centerPos.clone();
    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    this.boundingRadius = typeof options.boundingRadius === 'number' ? options.boundingRadius : 16;
    this.noCloudRadius = typeof options.noCloudRadius === 'number' ? options.noCloudRadius : 0;
    this.bridgeTargetRadius = typeof options.bridgeTargetRadius === 'number' ? options.bridgeTargetRadius : null;
    this.bridgeSurfaceOffsetY = typeof options.bridgeSurfaceOffsetY === 'number' ? options.bridgeSurfaceOffsetY : 0;

    this.staticColliders = [];
    this._foliageAssets = null;
  }

  _rockNoise(x, y, z) {
    const n1 = Math.sin(x * 2.13 + y * 1.71 + z * 2.57);
    const n2 = Math.cos(x * 3.77 - y * 2.91 + z * 1.83);
    return n1 * 0.6 + n2 * 0.4;
  }

  _createCraggyRockGeo(radius, detail = 1, yScale = 1.0, seed = 0, topFlatten = 1.0, maxLocalY = Infinity) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
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

  _ensureFoliageAssets() {
    if (this._foliageAssets) return this._foliageAssets;
    const flowerColors = [0xff5c97, 0xffcf33, 0xffffff, 0x4ec3ff];
    this._foliageAssets = {
      bushMatA: new THREE.MeshToonMaterial({ color: 0x3aa350 }),
      bushMatB: new THREE.MeshToonMaterial({ color: 0x6dd668 }),
      stemMat: new THREE.MeshToonMaterial({ color: 0x359648 }),
      tuftGeo: new THREE.ConeGeometry(0.14, 0.42, 5),
      puffGeo: new THREE.SphereGeometry(0.45, 10, 8),
      petalGeo: new THREE.SphereGeometry(0.11, 8, 6),
      flowerMats: flowerColors.map((c) => new THREE.MeshBasicMaterial({ color: c }))
    };
    return this._foliageAssets;
  }

  addGrassTuft(x, localY, z, scale = 1.0) {
    const assets = this._ensureFoliageAssets();
    const tuftGroup = new THREE.Group();
    tuftGroup.position.set(x, localY, z);
    for (let k = 0; k < 3; k++) {
      const blade = new THREE.Mesh(assets.tuftGeo, k === 1 ? assets.bushMatB : assets.stemMat);
      const angle = (k / 3) * Math.PI * 2;
      blade.position.set(Math.cos(angle) * 0.1, 0.16 * scale, Math.sin(angle) * 0.1);
      blade.rotation.set(Math.sin(angle) * 0.26, angle, -Math.cos(angle) * 0.26);
      blade.scale.setScalar(scale);
      tuftGroup.add(blade);
    }
    this.group.add(tuftGroup);
    return tuftGroup;
  }

  addFlower(x, localY, z, colorIdx = 0) {
    const assets = this._ensureFoliageAssets();
    const f = new THREE.Mesh(assets.petalGeo, assets.flowerMats[colorIdx % assets.flowerMats.length]);
    f.position.set(x, localY + 0.09, z);
    f.scale.set(1.2, 0.55, 1.2);
    this.group.add(f);
    return f;
  }

  addBush(x, localY, z, s = 1.0) {
    const assets = this._ensureFoliageAssets();
    const b = new THREE.Mesh(assets.puffGeo, s > 0.9 ? assets.bushMatA : assets.bushMatB);
    b.position.set(x, localY + 0.26 * s, z);
    b.scale.set(1.15 * s, 0.85 * s, 1.15 * s);
    this.group.add(b);
    return b;
  }

  // 浮島土台（岩・土・草原・地面コライダー）を生成する共通ヘルパー
  buildFloatingIslandPlatform(radius = 12.6, groundLocalY = 1.2, flatRim = false) {
    const rScale = radius / 12.6;
    const rockMatMain = new THREE.MeshToonMaterial({ color: 0x8d99ae, flatShading: true });
    const rockMatDark = new THREE.MeshToonMaterial({ color: 0x6f7b91, flatShading: true });
    const rockMatLight = new THREE.MeshToonMaterial({ color: 0xa3afc2, flatShading: true });
    const soilMat = new THREE.MeshToonMaterial({ color: 0x9c7258 });
    const grassTopMat = new THREE.MeshToonMaterial({ color: 0x57c966 });
    const grassEdgeMat = new THREE.MeshToonMaterial({ color: 0x3da84e });

    const soilGeo = new THREE.CylinderGeometry(radius - 0.15 * rScale, radius - 1.0 * rScale, 0.9 * rScale, 32);
    const soilMesh = new THREE.Mesh(soilGeo, soilMat);
    soilMesh.position.set(0, groundLocalY - 0.7 * rScale, 0);
    this.group.add(soilMesh);

    const topCapY = groundLocalY - 0.5;

    const coreY = -0.35 * rScale;
    const coreRockGeo = this._createCraggyRockGeo(11.3 * rScale, 1, 0.38, 1.4, 0.35, topCapY - coreY);
    const coreRock = new THREE.Mesh(coreRockGeo, rockMatMain);
    coreRock.position.set(0, coreY, 0);
    this.group.add(coreRock);

    const sideCount = 14;
    for (let i = 0; i < sideCount; i++) {
      const ang = (i / sideCount) * Math.PI * 2 + (i % 2) * 0.12;
      const dist = (8.4 + (i % 3) * 0.85) * rScale;
      const rSize = (2.3 + (i % 3) * 0.45) * rScale;
      const posY = (-0.35 - (i % 2) * 0.32) * rScale;
      const rockGeo = this._createCraggyRockGeo(rSize, 0, 0.68 + (i % 2) * 0.16, i * 3.1, 0.48, topCapY - 0.05 - posY);
      const mat = i % 3 === 0 ? rockMatLight : (i % 2 === 0 ? rockMatMain : rockMatDark);
      const mesh = new THREE.Mesh(rockGeo, mat);
      mesh.position.set(Math.cos(ang) * dist, posY, Math.sin(ang) * dist);
      mesh.rotation.set(0, ang, 0);
      this.group.add(mesh);
    }

    const midY = -2.8 * rScale;
    const midRockGeo = this._createCraggyRockGeo(8.2 * rScale, 1, 0.58, 4.2, 0.55, topCapY - 0.4 - midY);
    const midRock = new THREE.Mesh(midRockGeo, rockMatDark);
    midRock.position.set(0.3 * rScale, midY, -0.2 * rScale);
    this.group.add(midRock);

    const tipY = -6.1 * rScale;
    const tipRockGeo = this._createCraggyRockGeo(4.2 * rScale, 0, 0.92, 8.7, 0.5, 2.5 * rScale);
    const tipRock = new THREE.Mesh(tipRockGeo, rockMatDark);
    tipRock.position.set(-0.2 * rScale, tipY, 0.1 * rScale);
    this.group.add(tipRock);

    const grassGeo = new THREE.CylinderGeometry(radius, radius - 0.12 * rScale, 0.5, 36);
    const grassMesh = new THREE.Mesh(grassGeo, grassTopMat);
    grassMesh.position.set(0, groundLocalY - 0.25, 0);
    this.group.add(grassMesh);

    const rimGeo = flatRim
      ? new THREE.TorusGeometry(radius - 0.18, 0.22, 8, 36)
      : new THREE.TorusGeometry(radius - 0.25, 0.28, 8, 36);
    const rimMesh = new THREE.Mesh(rimGeo, grassEdgeMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(0, flatRim ? groundLocalY - 0.215 : groundLocalY - 0.16, 0);
    this.group.add(rimMesh);

    this.addCylinderCollider(0, 0, -4.0 * rScale, groundLocalY, radius);
  }

  // 雲の上に乗る建物用の雲土台を生成する共通ヘルパー
  buildCloudPlatform(options = {}) {
    const rx = options.rx || 9.0;
    const ry = options.ry || 2.5;
    const rz = options.rz || 9.0;
    const color = options.color || 0xffffff;
    const shadeColor = options.shadeColor || 0xedf6ff;
    const offsetY = typeof options.offsetY === 'number' ? options.offsetY : -ry;

    const puffGeo = new THREE.SphereGeometry(1, 20, 16);
    const mainMat = new THREE.MeshToonMaterial({ color });
    const shadeMat = new THREE.MeshToonMaterial({ color: shadeColor });

    const addCloudPuff = (lx, ly, lz, prx, pry, prz, mat) => {
      const mesh = new THREE.Mesh(puffGeo, mat);
      mesh.position.set(lx, ly, lz);
      mesh.scale.set(prx, pry, prz);
      this.group.add(mesh);
      this.addEllipsoidCollider(lx, ly, lz, prx, pry, prz);
    };

    addCloudPuff(0, offsetY, 0, rx, ry, rz, mainMat);
    addCloudPuff(-rx * 0.6, offsetY - 0.25, rz * 0.35, rx * 0.56, ry * 0.76, rz * 0.56, shadeMat);
    addCloudPuff(rx * 0.62, offsetY - 0.25, -rz * 0.32, rx * 0.58, ry * 0.78, rz * 0.58, shadeMat);
    addCloudPuff(rx * 0.38, offsetY - 0.3, rz * 0.56, rx * 0.5, ry * 0.68, rz * 0.5, mainMat);
    addCloudPuff(-rx * 0.42, offsetY - 0.3, -rz * 0.54, rx * 0.52, ry * 0.7, rz * 0.52, mainMat);
  }

  addCylinderCollider(lx, lz, lyMin, lyMax, r, active = true) {
    const col = {
      kind: 'cylinder',
      x: this.position.x + lx,
      z: this.position.z + lz,
      yMin: this.position.y + lyMin,
      yMax: this.position.y + lyMax,
      r,
      active
    };
    this.staticColliders.push(col);
    return col;
  }

  addBoxCollider(cx, cy, cz, w, h, d, active = true) {
    const col = {
      kind: 'box',
      minX: this.position.x + cx - w * 0.5,
      maxX: this.position.x + cx + w * 0.5,
      minY: this.position.y + cy - h * 0.5,
      maxY: this.position.y + cy + h * 0.5,
      minZ: this.position.z + cz - d * 0.5,
      maxZ: this.position.z + cz + d * 0.5,
      active
    };
    this.staticColliders.push(col);
    return col;
  }

  addEllipsoidCollider(lx, ly, lz, rx, ry, rz, active = true) {
    const col = {
      kind: 'ellipsoid',
      cx: this.position.x + lx,
      cy: this.position.y + ly,
      cz: this.position.z + lz,
      rx,
      ry,
      rz,
      active
    };
    this.staticColliders.push(col);
    return col;
  }

  update(time, dt, playerPos, partnerPos = null) {
    // サブクラスで必要に応じてオーバーライド
  }

  checkEntrance(playerPos) {
    return null;
  }

  getSafeSpot(playerPos, radius) {
    return null;
  }

  resolveCollisions(pos, vel, radius) {
    let hitGround = false;
    let hardLandingVn = 0;

    const dxCenter = pos.x - this.position.x;
    const dzCenter = pos.z - this.position.z;
    const cullR = this.boundingRadius + radius + 4;
    if (dxCenter * dxCenter + dzCenter * dzCenter > cullR * cullR) {
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

        if (horizDist > col.r && pos.y > col.yMax - 0.25 && pos.y < col.yMax + radius) {
          const radialOver = horizDist - col.r;
          const vertOver = pos.y - col.yMax;
          const edgeDist = Math.hypot(radialOver, vertOver);
          if (edgeDist >= radius) continue;
          if (edgeDist > 0.0001) {
            const hnx = horizDist > 0.0001 ? dx / horizDist : 0;
            const hnz = horizDist > 0.0001 ? dz / horizDist : 1;
            const nRad = radialOver / edgeDist;
            const ny = vertOver / edgeDist;
            const nx = hnx * nRad;
            const nz = hnz * nRad;
            const pen = radius - edgeDist;
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
            continue;
          }
        }

        if (pos.y <= col.yMin + 0.35 && vel.y > 0 && horizDist < col.r + radius * 0.55) {
          pos.y = col.yMin - radius;
          vel.y = 0;
          continue;
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
      } else if (col.kind === 'ellipsoid') {
        const dx = pos.x - col.cx;
        const dy = pos.y - col.cy;
        const dz = pos.z - col.cz;

        const maxR = Math.max(col.rx, col.ry, col.rz) + radius;
        if (dx * dx + dy * dy + dz * dz > maxR * maxR) continue;

        const k0 = Math.sqrt(
          (dx / col.rx) * (dx / col.rx) +
          (dy / col.ry) * (dy / col.ry) +
          (dz / col.rz) * (dz / col.rz)
        );
        if (k0 < 0.0001) continue;

        const sx = dx / k0;
        const sy = dy / k0;
        const sz = dz / k0;

        const nxRaw = dx / (col.rx * col.rx);
        const nyRaw = dy / (col.ry * col.ry);
        const nzRaw = dz / (col.rz * col.rz);
        const nLen = Math.hypot(nxRaw, nyRaw, nzRaw) || 1;
        const nx = nxRaw / nLen;
        const ny = nyRaw / nLen;
        const nz = nzRaw / nLen;

        const distSurf = Math.hypot(dx - sx, dy - sy, dz - sz);
        let penetration = 0;

        if (k0 >= 1.0) {
          if (distSurf < radius) {
            penetration = radius - distSurf;
          }
        } else {
          penetration = radius + distSurf;
        }

        if (penetration > 0) {
          pos.x += nx * penetration;
          pos.y += ny * penetration;
          pos.z += nz * penetration;

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

  getShadowInfo(px, py, pz, outNormal) {
    const dx = px - this.position.x;
    const dz = pz - this.position.z;
    const cullR = this.boundingRadius + 2;
    if (dx * dx + dz * dz > cullR * cullR) {
      return null;
    }

    let bestY = null;
    let bestNx = 0;
    let bestNy = 1;
    let bestNz = 0;

    for (const col of this.staticColliders) {
      if (!col.active) continue;
      if (col.kind === 'cylinder') {
        const dSq = (px - col.x) * (px - col.x) + (pz - col.z) * (pz - col.z);
        if (dSq <= col.r * col.r && col.yMax <= py + 0.3) {
          if (bestY === null || col.yMax > bestY) {
            bestY = col.yMax;
            bestNx = 0;
            bestNy = 1;
            bestNz = 0;
          }
        }
      } else if (col.kind === 'box') {
        if (px >= col.minX && px <= col.maxX && pz >= col.minZ && pz <= col.maxZ && col.maxY <= py + 0.3) {
          if (bestY === null || col.maxY > bestY) {
            bestY = col.maxY;
            bestNx = 0;
            bestNy = 1;
            bestNz = 0;
          }
        }
      } else if (col.kind === 'ellipsoid') {
        const ex = px - col.cx;
        const ez = pz - col.cz;
        const nx = ex / col.rx;
        const nz = ez / col.rz;
        const sq = nx * nx + nz * nz;
        if (sq < 0.98) {
          const ey = col.ry * Math.sqrt(1.0 - sq);
          const surfaceY = col.cy + ey;
          if (surfaceY <= py + 0.3 && (bestY === null || surfaceY > bestY)) {
            bestY = surfaceY;
            const normX = ex / (col.rx * col.rx);
            const normY = ey / (col.ry * col.ry);
            const normZ = ez / (col.rz * col.rz);
            const len = Math.hypot(normX, normY, normZ) || 1;
            bestNx = normX / len;
            bestNy = normY / len;
            bestNz = normZ / len;
          }
        }
      }
    }

    if (bestY === null) return null;
    outNormal.set(bestNx, bestNy, bestNz);
    return { y: bestY, normal: outNormal };
  }
}