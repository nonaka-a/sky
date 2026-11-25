class RainbowBridge {
  constructor(id, p0, p1, material, cloudA = null, cloudB = null) {
    this.id = id;
    this.p0 = p0.clone();
    this.p1 = p1.clone();
    this.cloudA = cloudA;
    this.cloudB = cloudB;

    const dx = this.p1.x - this.p0.x;
    const dz = this.p1.z - this.p0.z;
    this.lenXZ = Math.max(0.01, Math.hypot(dx, dz));
    this.dirX = dx / this.lenXZ;
    this.dirZ = dz / this.lenXZ;
    this.rightX = -this.dirZ;
    this.rightZ = this.dirX;

    this.halfWidth = 2.18;
    this.thickness = 0.28;
    this.archHeight = THREE.MathUtils.clamp(this.lenXZ * 0.14, 1.35, 3.6);

    const pad = this.halfWidth + 1.0;
    this.minX = Math.min(this.p0.x, this.p1.x) - pad;
    this.maxX = Math.max(this.p0.x, this.p1.x) + pad;
    this.minZ = Math.min(this.p0.z, this.p1.z) - pad;
    this.maxZ = Math.max(this.p0.z, this.p1.z) + pad;
    this.minY = Math.min(this.p0.y, this.p1.y) - this.thickness - 1.0;
    this.maxY = Math.max(this.p0.y, this.p1.y) + this.archHeight + 1.0;

    this.mesh = this._createMesh(material);
  }

  getSurfaceY(s) {
    return this.p0.y + (this.p1.y - this.p0.y) * s + Math.sin(Math.PI * s) * this.archHeight;
  }

  getNormalAt(s, outNormal) {
    const dyDs = (this.p1.y - this.p0.y) + Math.PI * this.archHeight * Math.cos(Math.PI * s);
    const slope = dyDs / this.lenXZ;
    outNormal.set(-this.dirX * slope, 1, -this.dirZ * slope).normalize();
    return outNormal;
  }

  _createMesh(material) {
    const segments = 24;
    const hw = this.halfWidth;
    const th = this.thickness;

    const positions = [];
    const uvs = [];
    const indices = [];

    const addStrip = (sideType) => {
      const baseVertex = positions.length / 3;
      for (let i = 0; i <= segments; i++) {
        const s = i / segments;
        const cx = this.p0.x + this.dirX * (s * this.lenXZ);
        const cz = this.p0.z + this.dirZ * (s * this.lenXZ);
        const topY = this.getSurfaceY(s);
        const botY = topY - th;

        if (sideType === 'top') {
          positions.push(cx - this.rightX * hw, topY, cz - this.rightZ * hw);
          positions.push(cx + this.rightX * hw, topY, cz + this.rightZ * hw);
          uvs.push(0, s, 1, s);
        } else if (sideType === 'bottom') {
          positions.push(cx - this.rightX * hw, botY, cz - this.rightZ * hw);
          positions.push(cx + this.rightX * hw, botY, cz + this.rightZ * hw);
          uvs.push(0, s, 1, s);
        } else if (sideType === 'left') {
          positions.push(cx - this.rightX * hw, topY, cz - this.rightZ * hw);
          positions.push(cx - this.rightX * hw, botY, cz - this.rightZ * hw);
          uvs.push(0.04, s, 0.04, s);
        } else {
          positions.push(cx + this.rightX * hw, topY, cz + this.rightZ * hw);
          positions.push(cx + this.rightX * hw, botY, cz + this.rightZ * hw);
          uvs.push(0.96, s, 0.96, s);
        }

        if (i < segments) {
          const a = baseVertex + i * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;

          if (sideType === 'top' || sideType === 'right') {
            indices.push(a, b, c, b, d, c);
          } else {
            indices.push(a, c, b, b, c, d);
          }
        }
      }
    };

    addStrip('top');
    addStrip('bottom');
    addStrip('left');
    addStrip('right');

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, material);
  }

  updateVisibility() {
    const visA = !this.cloudA || this.cloudA.group.visible;
    const visB = !this.cloudB || this.cloudB.group.visible;
    this.mesh.visible = visA && visB;
  }

  resolveCollision(pos, vel, radius) {
    if (
      pos.x < this.minX - radius || pos.x > this.maxX + radius ||
      pos.z < this.minZ - radius || pos.z > this.maxZ + radius ||
      pos.y < this.minY - radius || pos.y > this.maxY + radius
    ) {
      return { hitGround: false, hardLandingVn: 0 };
    }

    const dx = pos.x - this.p0.x;
    const dz = pos.z - this.p0.z;
    const proj = dx * this.dirX + dz * this.dirZ;
    const s = proj / this.lenXZ;
    const u = dx * this.rightX + dz * this.rightZ;

    if (s < -radius / this.lenXZ || s > 1 + radius / this.lenXZ || Math.abs(u) > this.halfWidth + radius) {
      return { hitGround: false, hardLandingVn: 0 };
    }

    const sC = THREE.MathUtils.clamp(s, 0, 1);
    const topY = this.getSurfaceY(sC);
    const botY = topY - this.thickness;

    let hitGround = false;
    let hardLandingVn = 0;

    if (s >= -0.01 && s <= 1.01 && Math.abs(u) <= this.halfWidth + radius * 0.65) {
      if (pos.y >= topY - this.thickness * 0.55 && pos.y - radius <= topY + 0.04 && vel.y <= 3.5) {
        if (vel.y < hardLandingVn) hardLandingVn = vel.y;
        pos.y = topY + radius;
        if (vel.y < 0) vel.y = 0;
        hitGround = true;
      } else if (pos.y < botY && pos.y + radius > botY && vel.y > 0) {
        pos.y = botY - radius;
        vel.y = 0;
      }
    }

    if (!hitGround && s >= 0 && s <= 1 && pos.y > botY - radius * 0.35 && pos.y < topY - radius * 0.35) {
      const absU = Math.abs(u);
      if (absU > this.halfWidth && absU < this.halfWidth + radius) {
        const sign = u >= 0 ? 1 : -1;
        const pen = this.halfWidth + radius - absU;
        const nx = this.rightX * sign;
        const nz = this.rightZ * sign;
        pos.x += nx * pen;
        pos.z += nz * pen;
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) {
          vel.x -= nx * vn;
          vel.z -= nz * vn;
        }
      }
    }

    return { hitGround, hardLandingVn };
  }

  getShadowInfo(px, py, pz, outNormal) {
    if (px < this.minX || px > this.maxX || pz < this.minZ || pz > this.maxZ) {
      return null;
    }

    const dx = px - this.p0.x;
    const dz = pz - this.p0.z;
    const s = (dx * this.dirX + dz * this.dirZ) / this.lenXZ;
    const u = dx * this.rightX + dz * this.rightZ;

    if (s >= 0 && s <= 1 && Math.abs(u) <= this.halfWidth) {
      const surfaceY = this.getSurfaceY(s);
      if (surfaceY <= py + 0.3) {
        this.getNormalAt(s, outNormal);
        return { y: surfaceY, normal: outNormal };
      }
    }
    return null;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}