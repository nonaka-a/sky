class FountainCloud extends StructureBase {
  constructor(id, centerPos) {
    super(id, centerPos, {
      boundingRadius: 9.5,
      noCloudRadius: 19.0,
      bridgeTargetRadius: null
    });

    this.poolRadius = 4.55;
    this.waterLocalY = 0.22;
    this.poolFloorLocalY = -0.05;

    this.droplets = [];
    this.ripples = [];
    this.splashes = [];

    this._splashCooldownLocal = 0;
    this._splashCooldownPartner = 0;
    this._prevLocalPos = new THREE.Vector3();
    this._prevPartnerPos = new THREE.Vector3();
    this._hasPrevLocal = false;
    this._hasPrevPartner = false;
    this._fountainRippleTimer = 0;

    this._buildCloudAndPool();
    this._buildCloudFountain();
    this._buildWaterEffects();
    this._buildRain();
  }

  _buildCloudAndPool() {
    const puffGeo = new THREE.SphereGeometry(1, 16, 12);
    const whiteMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const shadeMat = new THREE.MeshToonMaterial({ color: 0xedf6ff });
    const midGrayMat = new THREE.MeshToonMaterial({ color: 0xc2ccd9 });
    const rainGrayMat = new THREE.MeshToonMaterial({ color: 0x828e9e });
    const darkRainMat = new THREE.MeshToonMaterial({ color: 0x6b7687 });

    // 下層の雨雲ベース（グレー）
    const rainBase = new THREE.Mesh(puffGeo, darkRainMat);
    rainBase.position.set(0, -1.6, 0);
    rainBase.scale.set(7.1, 1.45, 7.1);
    this.group.add(rainBase);
    this.addEllipsoidCollider(0, -1.5, 0, 7.1, 1.35, 7.1);

    // 外周下側のグレー雨雲パフ
    const underCount = 8;
    for (let i = 0; i < underCount; i++) {
      const ang = (i / underCount) * Math.PI * 2 + 0.2;
      const dist = 4.65;
      const r = 2.25 + (i % 2) * 0.3;
      const puff = new THREE.Mesh(puffGeo, i % 2 === 0 ? rainGrayMat : darkRainMat);
      puff.position.set(Math.cos(ang) * dist, -1.12, Math.sin(ang) * dist);
      puff.scale.set(r, r * 0.56, r);
      this.group.add(puff);
    }

    // 中層のつなぎ雲（池の底の下地）
    const midLayer = new THREE.Mesh(puffGeo, midGrayMat);
    midLayer.position.set(0, -0.78, 0);
    midLayer.scale.set(6.3, 0.82, 6.3);
    this.group.add(midLayer);

    // 上面の凹みを作る外周の白い雲リム（ドーナツ状）
    const rimCount = 10;
    const rimDist = 5.25;
    for (let i = 0; i < rimCount; i++) {
      const ang = (i / rimCount) * Math.PI * 2;
      const lx = Math.cos(ang) * rimDist;
      const lz = Math.sin(ang) * rimDist;
      const rx = 2.05 + (i % 2) * 0.18;
      const ry = 1.08 + (i % 3) * 0.08;

      const puff = new THREE.Mesh(puffGeo, i % 2 === 0 ? whiteMat : shadeMat);
      puff.position.set(lx, 0.02, lz);
      puff.scale.set(rx, ry, rx);
      this.group.add(puff);

      this.addEllipsoidCollider(lx, 0.02, lz, rx * 0.96, ry * 0.96, rx * 0.96);
    }

    // 池の底（歩ける浅い床）
    this.addCylinderCollider(0, 0, -2.0, this.poolFloorLocalY, 5.25);

    // 池の水面
    const waterGeo = new THREE.CircleGeometry(this.poolRadius, 28);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshBasicMaterial({
      color: 0x5ccdff,
      transparent: true,
      opacity: 0.72
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = this.waterLocalY;
    this.group.add(this.waterMesh);
  }

  _buildCloudFountain() {
    // 雲だけでできた中央の噴水口
    const puffGeo = new THREE.SphereGeometry(1, 12, 10);
    const whiteMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const shadeMat = new THREE.MeshToonMaterial({ color: 0xe6f3ff });

    const baseCenter = new THREE.Mesh(puffGeo, whiteMat);
    baseCenter.position.set(0, 0.34, 0);
    baseCenter.scale.set(1.05, 0.65, 1.05);
    this.group.add(baseCenter);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const p = new THREE.Mesh(puffGeo, i % 2 === 0 ? shadeMat : whiteMat);
      p.position.set(Math.cos(a) * 0.62, 0.32, Math.sin(a) * 0.62);
      p.scale.set(0.58, 0.42, 0.58);
      this.group.add(p);
    }

    const spoutCloud = new THREE.Mesh(puffGeo, whiteMat);
    spoutCloud.position.set(0, 0.78, 0);
    spoutCloud.scale.set(0.68, 0.52, 0.68);
    this.group.add(spoutCloud);

    // 噴水口の上にも乗れるコライダー
    this.addCylinderCollider(0, 0, -0.2, 1.24, 1.02);
  }

  _buildWaterEffects() {
    // 中央から吹き上がるシンプルな水柱
    const jetGeo = new THREE.CylinderGeometry(0.14, 0.3, 1.85, 10);
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0xc2f2ff,
      transparent: true,
      opacity: 0.72
    });
    this.jetMesh = new THREE.Mesh(jetGeo, jetMat);
    this.jetMesh.position.set(0, 1.95, 0);
    this.group.add(this.jetMesh);

    // 放物線で飛び散る水滴（12個をループ再利用）
    const dropGeo = new THREE.SphereGeometry(0.12, 6, 5);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0xd9f7ff,
      transparent: true,
      opacity: 0.85
    });

    const dropCount = 12;
    for (let i = 0; i < dropCount; i++) {
      const mesh = new THREE.Mesh(dropGeo, dropMat);
      this.group.add(mesh);
      const ang = (i / dropCount) * Math.PI * 2;
      const spread = 1.65 + (i % 3) * 0.55;
      this.droplets.push({
        mesh,
        phase: i / dropCount,
        dirX: Math.cos(ang),
        dirZ: Math.sin(ang),
        spread,
        peakY: 2.75 + (i % 2) * 0.35
      });
    }

    // プール用の波紋リング（噴水着水＋歩行時共用）
    this.rippleGeo = new THREE.RingGeometry(0.2, 0.33, 18);
    this.rippleGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(this.rippleGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.ripples.push({ mesh, mat, active: false, age: 0, life: 0.85, maxScale: 3.0 });
    }

    // 歩行時の水しぶき粒プール
    const splashGeo = new THREE.SphereGeometry(0.09, 5, 4);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffffff : 0xb3eeff,
        transparent: true,
        opacity: 0
      });
      const mesh = new THREE.Mesh(splashGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.splashes.push({
        mesh,
        mat,
        active: false,
        age: 0,
        life: 0.45,
        vx: 0,
        vy: 0,
        vz: 0
      });
    }
  }

  _buildRain() {
    this.rainCount = 46;
    this.rainTopY = -1.9;
    this.rainBottomY = -27.0;
    this.rainDrops = [];

    const positions = new Float32Array(this.rainCount * 6);
    let seed = this.id === 'fountain_left' ? 13 : 59;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < this.rainCount; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * 6.3;
      const rx = Math.cos(ang) * dist;
      const rz = Math.sin(ang) * dist;
      const y = this.rainBottomY + rand() * (this.rainTopY - this.rainBottomY);
      const speed = 17.5 + rand() * 5.5;
      const len = 1.15 + rand() * 0.55;

      this.rainDrops.push({ x: rx, y, z: rz, speed, len });

      const idx = i * 6;
      positions[idx] = rx;
      positions[idx + 1] = y;
      positions[idx + 2] = rz;
      positions[idx + 3] = rx;
      positions[idx + 4] = y - len;
      positions[idx + 5] = rz;
    }

    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xd9eeff,
      transparent: true,
      opacity: 0.48
    });
    this.rainMesh = new THREE.LineSegments(this.rainGeo, rainMat);
    this.group.add(this.rainMesh);
  }

  _spawnRipple(lx, lz, maxScale = 3.2, life = 0.85) {
    for (const r of this.ripples) {
      if (!r.active) {
        r.active = true;
        r.age = 0;
        r.life = life;
        r.maxScale = maxScale;
        r.mesh.position.set(lx, this.waterLocalY + 0.02, lz);
        r.mesh.scale.setScalar(0.5);
        r.mesh.visible = true;
        r.mat.opacity = 0.68;
        return;
      }
    }
  }

  _spawnSplashBurst(lx, lz) {
    let spawned = 0;
    for (const s of this.splashes) {
      if (!s.active) {
        s.active = true;
        s.age = 0;
        s.life = 0.36 + Math.random() * 0.14;
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.3 + Math.random() * 1.4;
        s.vx = Math.cos(ang) * spd;
        s.vy = 2.6 + Math.random() * 1.6;
        s.vz = Math.sin(ang) * spd;
        s.mesh.position.set(lx, this.waterLocalY + 0.05, lz);
        s.mesh.visible = true;
        s.mat.opacity = 0.9;
        spawned++;
        if (spawned >= 4) break;
      }
    }
  }

  _checkWalkerInPool(pos, prevPos, hasPrev, dt, cooldownKey) {
    if (!pos) return false;
    const lx = pos.x - this.position.x;
    const ly = pos.y - this.position.y;
    const lz = pos.z - this.position.z;
    const distCenter = Math.hypot(lx, lz);

    if (distCenter > 1.1 && distCenter < this.poolRadius - 0.35 && ly >= 0.1 && ly <= 1.05) {
      if (this[cooldownKey] > 0) {
        this[cooldownKey] -= dt;
      }
      if (hasPrev && this[cooldownKey] <= 0) {
        const moved = Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z);
        if (moved > 0.025) {
          this[cooldownKey] = 0.18;
          this._spawnRipple(lx, lz, 2.5, 0.7);
          this._spawnSplashBurst(lx, lz);
        }
      }
      prevPos.copy(pos);
      return true;
    }

    prevPos.copy(pos);
    return false;
  }

  update(time, dt, playerPos, partnerPos = null) {
    // 水柱のわずかな伸縮
    this.jetMesh.scale.y = 0.94 + Math.sin(time * 8.5) * 0.08;
    this.jetMesh.scale.x = 0.96 + Math.cos(time * 7.0) * 0.06;
    this.jetMesh.scale.z = this.jetMesh.scale.x;

    // 噴水の水滴の放物線アニメーション
    const startY = 2.75;
    const endY = this.waterLocalY;
    for (const d of this.droplets) {
      const t = (time * 0.95 + d.phase) % 1.0;
      const r = 0.25 + d.spread * t;
      const arcY = THREE.MathUtils.lerp(startY, endY, t * t) + Math.sin(t * Math.PI) * 0.9;
      d.mesh.position.set(d.dirX * r, arcY, d.dirZ * r);
    }

    // 噴水着水地点の定期波紋
    this._fountainRippleTimer += dt;
    if (this._fountainRippleTimer >= 0.48) {
      this._fountainRippleTimer = 0;
      const a = time * 2.1;
      this._spawnRipple(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 2.8, 0.8);
    }

    // プレイヤー・仲間の歩行水しぶき＆波紋
    this._hasPrevLocal = this._checkWalkerInPool(
      playerPos,
      this._prevLocalPos,
      this._hasPrevLocal,
      dt,
      '_splashCooldownLocal'
    );
    this._hasPrevPartner = this._checkWalkerInPool(
      partnerPos,
      this._prevPartnerPos,
      this._hasPrevPartner,
      dt,
      '_splashCooldownPartner'
    );

    // 波紋アニメーション更新
    for (const r of this.ripples) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
      } else {
        const s = 0.5 + t * r.maxScale;
        r.mesh.scale.setScalar(s);
        r.mat.opacity = 0.65 * (1 - t);
      }
    }

    // 水しぶき粒更新
    for (const s of this.splashes) {
      if (!s.active) continue;
      s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) {
        s.active = false;
        s.mesh.visible = false;
      } else {
        s.vy -= 14.0 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.mat.opacity = 0.9 * (1 - t);
      }
    }

    // 雨の落下ループ更新
    const posArr = this.rainGeo.attributes.position.array;
    const span = this.rainTopY - this.rainBottomY;
    for (let i = 0; i < this.rainCount; i++) {
      const drop = this.rainDrops[i];
      drop.y -= drop.speed * dt;
      if (drop.y < this.rainBottomY) {
        drop.y += span;
      }
      // 下端付近で少し短くフェードさせて唐突に消えるのを抑える
      const fade = THREE.MathUtils.clamp((drop.y - this.rainBottomY) / 4.0, 0.05, 1.0);
      const curLen = drop.len * fade;

      const idx = i * 6;
      posArr[idx + 1] = drop.y;
      posArr[idx + 4] = drop.y - curLen;
    }
    this.rainGeo.attributes.position.needsUpdate = true;
  }
}