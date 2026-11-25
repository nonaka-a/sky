class CumulonimbusCloud extends StructureBase {
  constructor(centerPos) {
    super('cumulonimbus', centerPos, {
      boundingRadius: 50,
      noCloudRadius: 52,
      bridgeTargetRadius: 34.5,
      bridgeSurfaceOffsetY: 2.3
    });

    this.steps = [];
    this.summitLocalY = 57.0;

    this._createMaterials();
    this._buildCloudVolumeAndSteps();
    this._buildSummitFlag();
  }

  _createToonGradient() {
    const data = new Uint8Array([
      115, 115, 130, 255,
      168, 174, 192, 255,
      218, 224, 236, 255,
      255, 255, 255, 255
    ]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  _createCloudsMaterial(colorHex, gradientMap) {
    const mat = new THREE.MeshToonMaterial({
      color: colorHex,
      gradientMap
    });
    // 遠景でも立体的な陰影が視認できるよう、フォグの影響度を上限38%に抑える
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * 0.38;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif`
      );
    };
    return mat;
  }

  _createMaterials() {
    const gradMap = this._createToonGradient();
    this.matBright = this._createCloudsMaterial(0xffffff, gradMap);
    this.matMid = this._createCloudsMaterial(0xeaf4ff, gradMap);
    this.matShade = this._createCloudsMaterial(0xc6dcf5, gradMap);
    this.matDeepShade = this._createCloudsMaterial(0xaec8ea, gradMap);

    this.puffGeo = new THREE.SphereGeometry(1, 14, 10);
  }

  _addCloudPuff(lx, ly, lz, rx, ry, rz, mat, withCollider = true) {
    const mesh = new THREE.Mesh(this.puffGeo, mat);
    mesh.position.set(lx, ly, lz);
    mesh.scale.set(rx, ry, rz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);

    if (withCollider) {
      this.addEllipsoidCollider(lx, ly, lz, rx, ry, rz);
    }
  }

  _buildCloudVolumeAndSteps() {
    // 1. 巨大な下層ボリューム（雲の裾野：底直径 約78m）
    this._addCloudPuff(0, -5.25, 0, 31.5, 9.3, 31.5, this.matDeepShade, true);

    const baseRimCount = 12;
    for (let i = 0; i < baseRimCount; i++) {
      const ang = (i / baseRimCount) * Math.PI * 2 + 0.15;
      const dist = 25.5 + (i % 3) * 2.7;
      const lx = Math.cos(ang) * dist;
      const lz = Math.sin(ang) * dist;
      const rx = 9.3 + (i % 2) * 2.1;
      const ry = 4.8 + (i % 3) * 0.68;
      const ly = -4.2 - (i % 2) * 0.9;
      const mat = i % 2 === 0 ? this.matShade : this.matDeepShade;
      this._addCloudPuff(lx, ly, lz, rx, ry, rx, mat, true);
    }

    // 2. 入道雲の芯となる巨大タワー構造（足場の内側に収めてルートを塞がない）
    const coreLayers = [
      { y: 6.75, rx: 21.75, ry: 9.75, rz: 21.75, mat: this.matMid },
      { y: 18.0, rx: 18.3, ry: 9.3, rz: 18.3, mat: this.matMid },
      { y: 29.25, rx: 14.4, ry: 8.7, rz: 14.4, mat: this.matBright },
      { y: 40.2, rx: 11.1, ry: 7.8, rz: 11.1, mat: this.matBright },
      { y: 48.75, rx: 8.1, ry: 6.3, rz: 8.1, mat: this.matBright }
    ];
    for (const c of coreLayers) {
      this._addCloudPuff(0, c.y, 0, c.rx, c.ry, c.rz, c.mat, true);
    }

    // 芯をモコモコに見せる中・上層の補助膨らみ（足場の内側半径に配置）
    const lobeSpecs = [
      { ang: 0.4, y: 11.25, dist: 16.8, r: 8.1, mat: this.matMid },
      { ang: 2.1, y: 12.3, dist: 16.5, r: 7.8, mat: this.matShade },
      { ang: 3.9, y: 10.5, dist: 17.1, r: 8.25, mat: this.matShade },
      { ang: 5.3, y: 12.75, dist: 16.2, r: 7.5, mat: this.matMid },
      { ang: 1.1, y: 23.7, dist: 13.5, r: 6.9, mat: this.matBright },
      { ang: 3.1, y: 24.75, dist: 13.2, r: 6.75, mat: this.matMid },
      { ang: 4.8, y: 23.1, dist: 13.8, r: 7.05, mat: this.matMid },
      { ang: 0.6, y: 35.7, dist: 9.9, r: 6.0, mat: this.matBright },
      { ang: 2.8, y: 36.6, dist: 9.6, r: 5.7, mat: this.matMid },
      { ang: 4.9, y: 35.25, dist: 9.75, r: 5.85, mat: this.matBright },
      { ang: 1.7, y: 45.3, dist: 6.6, r: 5.1, mat: this.matBright },
      { ang: 4.3, y: 46.2, dist: 6.45, r: 4.95, mat: this.matBright }
    ];
    for (const l of lobeSpecs) {
      this._addCloudPuff(
        Math.cos(l.ang) * l.dist,
        l.y,
        Math.sin(l.ang) * l.dist,
        l.r,
        l.r * 0.82,
        l.r,
        l.mat,
        true
      );
    }

    // 3. 螺旋登山ルート（正面 -Z 側の登山口から頂上まで全25段＋頂上テラス）
    const totalSteps = 24;
    let theta = -Math.PI * 0.5; // -Z方向（手前）からスタート

    for (let i = 0; i <= totalSteps; i++) {
      const t = i / totalSteps;
      const r = i === 0 ? 32.25 : THREE.MathUtils.lerp(30.8, 6.2, t);
      const topY = THREE.MathUtils.lerp(2.4, 54.6, t);

      if (i > 0) {
        const stepArc = 8.4;
        theta += stepArc / Math.max(7.2, r);
      }

      const lx = Math.cos(theta) * r;
      const lz = Math.sin(theta) * r;
      const rx = i === 0 ? 7.0 : THREE.MathUtils.lerp(6.5, 4.6, t);
      const ry = i === 0 ? 2.1 : 2.0;
      const cy = topY - ry;

      const stepMat = i % 3 === 1 ? this.matMid : this.matBright;
      this._addCloudPuff(lx, cy, lz, rx, ry, rx, stepMat, true);

      // 足場の下に影色パフを少し添えて段差の立体感を強調
      if (i % 2 === 0 && i > 0) {
        this._addCloudPuff(
          lx * 1.04,
          cy - 1.5,
          lz * 1.04,
          rx * 0.78,
          1.45,
          rx * 0.78,
          this.matShade,
          false
        );
      }

      this.steps.push({ lx, topY, lz, r: rx });
    }

    // 4. 頂上テラス（てっぺんの広場）
    const summitRx = 7.8;
    const summitRy = 2.2;
    const summitCy = this.summitLocalY - summitRy;
    this._addCloudPuff(0, summitCy, 0, summitRx, summitRy, summitRx, this.matBright, true);
    this.steps.push({ lx: 0, topY: this.summitLocalY, lz: 0, r: summitRx });
  }

  _buildSummitFlag() {
    const poleMat = new THREE.MeshToonMaterial({ color: 0xf0c45a });
    const finialMat = new THREE.MeshToonMaterial({ color: 0xffe066 });
    const flagMat = new THREE.MeshToonMaterial({
      color: 0xff5e8a,
      side: THREE.DoubleSide
    });
    const flagTrimMat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });

    const y0 = this.summitLocalY - 0.1;

    // 旗のポール
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.8, 10), poleMat);
    pole.position.set(0, y0 + 1.4, 0);
    this.group.add(pole);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), finialMat);
    finial.position.set(0, y0 + 2.86, 0);
    this.group.add(finial);

    // 旗本体（ポール側を原点にして揺らす）
    this.flagPivot = new THREE.Group();
    this.flagPivot.position.set(0, y0 + 2.4, 0);
    this.group.add(this.flagPivot);

    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0.38);
    flagShape.lineTo(1.45, 0.02);
    flagShape.lineTo(0, -0.36);
    flagShape.closePath();

    const flagGeo = new THREE.ShapeGeometry(flagShape);
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    this.flagPivot.add(flagMesh);

    const starMark = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), flagTrimMat);
    starMark.position.set(0.44, 0.01, 0.015);
    this.flagPivot.add(starMark);

    const starMarkBack = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), flagTrimMat);
    starMarkBack.position.set(0.44, 0.01, -0.015);
    this.flagPivot.add(starMarkBack);
  }

  getSafeSpot(playerPos, radius) {
    const localY = playerPos.y - this.position.y;
    const localX = playerPos.x - this.position.x;
    const localZ = playerPos.z - this.position.z;

    let bestStep = this.steps[0];
    let bestScore = Infinity;

    for (const s of this.steps) {
      if (s.topY > localY + 2.6) continue;
      const dist = Math.hypot(localX - s.lx, localZ - s.lz) + Math.abs(localY - s.topY) * 0.8;
      if (dist < bestScore) {
        bestScore = dist;
        bestStep = s;
      }
    }

    return new THREE.Vector3(
      this.position.x + bestStep.lx,
      this.position.y + bestStep.topY + radius + 0.6,
      this.position.z + bestStep.lz
    );
  }

  update(time, dt, playerPos, partnerPos = null) {
    if (this.flagPivot) {
      this.flagPivot.rotation.y = 0.25 + Math.sin(time * 3.8) * 0.28;
      this.flagPivot.rotation.z = Math.cos(time * 2.9) * 0.06;
    }
  }
}