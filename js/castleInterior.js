class CastleInterior {
  constructor() {
    this.scene = new THREE.Scene();
    this.floorRadius = 14.5;
    this.time = 0;

    this.doorZ = 14.1;
    this.openAmount = 0;
    this.doorOpenAngle = Math.PI * 0.58;
    this.isFloorHidden = false;

    this.reflectionPool = new Map();

    this._createLighting();
    this._createDayNightSky();
    this._createMarbleFloor();
    this._createFloatingDoor();
  }

  _createLighting() {
    const hemi = new THREE.HemisphereLight(0xf6f8ff, 0x3b4875, 0.9);
    this.scene.add(hemi);

    // 左側（昼・太陽側）から差し込む柔らかい光
    const sunDir = new THREE.DirectionalLight(0xfff5dc, 0.78);
    sunDir.position.set(-45, 55, -35);
    this.scene.add(sunDir);
  }

  _createDayNightSky() {
    // 昼（左: -X）と夜（右: +X）が中央で滑らかに繋がるスカイドーム
    const skyGeo = new THREE.SphereGeometry(280, 48, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        dayTop: { value: new THREE.Color(0x37a8ff) },
        dayMid: { value: new THREE.Color(0x9be2ff) },
        dayBot: { value: new THREE.Color(0xe6f8ff) },
        twilightCol: { value: new THREE.Color(0xc58be8) },
        twilightHorizon: { value: new THREE.Color(0xffb5c8) },
        nightTop: { value: new THREE.Color(0x0a0f2c) },
        nightMid: { value: new THREE.Color(0x182557) },
        nightBot: { value: new THREE.Color(0x28356e) }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 dayTop;
        uniform vec3 dayMid;
        uniform vec3 dayBot;
        uniform vec3 twilightCol;
        uniform vec3 twilightHorizon;
        uniform vec3 nightTop;
        uniform vec3 nightMid;
        uniform vec3 nightBot;
        varying vec3 vDir;

        void main() {
          float h = vDir.y;
          float side = smoothstep(-0.36, 0.36, vDir.x);

          vec3 dCol = mix(dayMid, dayTop, smoothstep(0.0, 0.65, h));
          dCol = mix(dayBot, dCol, smoothstep(-0.35, 0.08, h));

          vec3 nCol = mix(nightMid, nightTop, smoothstep(0.0, 0.65, h));
          nCol = mix(nightBot, nCol, smoothstep(-0.35, 0.08, h));

          // 中央の境界付近を夕暮れ・薄明のグラデーションで繋ぐ
          float band = exp(-pow(vDir.x * 3.4, 2.0));
          vec3 baseCol = mix(dCol, nCol, side);
          vec3 twi = mix(twilightHorizon, twilightCol, smoothstep(-0.15, 0.55, h));
          vec3 finalCol = mix(baseCol, twi, band * 0.52);

          gl_FragColor = vec4(finalCol, 1.0);
        }
      `
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);

    // 左側上空の太陽と光の輪
    const sunPos = new THREE.Vector3(-92, 82, -96);
    const sunHaloCanvas = document.createElement('canvas');
    sunHaloCanvas.width = 256;
    sunHaloCanvas.height = 256;
    const sCtx = sunHaloCanvas.getContext('2d');
    const sGrad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 126);
    sGrad.addColorStop(0, 'rgba(255, 250, 210, 1.0)');
    sGrad.addColorStop(0.28, 'rgba(255, 232, 145, 0.85)');
    sGrad.addColorStop(0.6, 'rgba(255, 210, 110, 0.28)');
    sGrad.addColorStop(1, 'rgba(255, 210, 110, 0.0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 256, 256);

    const sunTex = new THREE.CanvasTexture(sunHaloCanvas);
    sunTex.encoding = THREE.sRGBEncoding;

    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.sunGlow.position.copy(sunPos);
    this.sunGlow.scale.set(56, 56, 1);
    this.sunGlow.renderOrder = -6;
    this.scene.add(this.sunGlow);

    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(8.5, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, depthWrite: false })
    );
    sunCore.position.copy(sunPos);
    sunCore.renderOrder = -5;
    this.scene.add(sunCore);

    // 右側上空の三日月と月光ハロー
    const moonPos = new THREE.Vector3(92, 84, -96);
    const moonHaloCanvas = document.createElement('canvas');
    moonHaloCanvas.width = 256;
    moonHaloCanvas.height = 256;
    const mCtx = moonHaloCanvas.getContext('2d');
    const mGrad = mCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
    mGrad.addColorStop(0, 'rgba(255, 250, 215, 0.65)');
    mGrad.addColorStop(0.35, 'rgba(220, 235, 255, 0.28)');
    mGrad.addColorStop(1, 'rgba(180, 210, 255, 0.0)');
    mCtx.fillStyle = mGrad;
    mCtx.fillRect(0, 0, 256, 256);

    const moonHaloTex = new THREE.CanvasTexture(moonHaloCanvas);
    moonHaloTex.encoding = THREE.sRGBEncoding;

    const moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonHaloTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    moonGlow.position.copy(moonPos);
    moonGlow.scale.set(42, 42, 1);
    moonGlow.renderOrder = -6;
    this.scene.add(moonGlow);

    // 2つの円の厳密な交点から先端まで綺麗な三日月シェイプを作成
    const rOuter = 9.2;
    const rInner = 8.0;
    const offsetX = 3.8;
    const ix = (rInner * rInner - rOuter * rOuter - offsetX * offsetX) / (2 * offsetX);
    const iy = Math.sqrt(Math.max(0.001, rOuter * rOuter - ix * ix));
    const outerAngle = Math.atan2(iy, ix);
    const innerAngle = Math.atan2(iy, ix + offsetX);

    const crescentShape = new THREE.Shape();
    crescentShape.absarc(0, 0, rOuter, -outerAngle, outerAngle, false);
    crescentShape.absarc(-offsetX, 0, rInner, innerAngle, -innerAngle, true);
    crescentShape.closePath();

    const moonGeo = new THREE.ExtrudeGeometry(crescentShape, {
      depth: 1.2,
      bevelEnabled: false,
      curveSegments: 36
    });
    moonGeo.center();
    const moonMesh = new THREE.Mesh(
      moonGeo,
      new THREE.MeshBasicMaterial({ color: 0xfff4ba, depthWrite: false })
    );
    moonMesh.position.copy(moonPos);
    moonMesh.lookAt(0, 2, 0);
    moonMesh.rotateZ(0.24);
    moonMesh.renderOrder = -5;
    this.scene.add(moonMesh);

    // 右側（夜側）に輝く大小の星々
    const starCount = 220;
    const starPositions = new Float32Array(starCount * 3);
    const starPhases = new Float32Array(starCount);
    const starSizes = new Float32Array(starCount);

    let idx = 0;
    let seed = 17;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    while (idx < starCount) {
      const dir = new THREE.Vector3(
        (rand() * 1.12) - 0.08,
        (rand() * 1.18) - 0.22,
        (rand() - 0.5) * 2.0
      ).normalize();

      if (dir.x < -0.05 && rand() < 0.7) continue;

      const r = 215 + rand() * 35;
      starPositions[idx * 3] = dir.x * r;
      starPositions[idx * 3 + 1] = dir.y * r;
      starPositions[idx * 3 + 2] = dir.z * r;
      starPhases[idx] = rand() * Math.PI * 2;
      starSizes[idx] = 2.4 + rand() * 4.4;
      idx++;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));

    this.starUniforms = {
      uTime: { value: 0 }
    };

    const starMat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vAlpha = 0.52 + 0.48 * sin(uTime * 2.6 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / max(40.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float glow = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(1.0, 0.98, 0.86, glow * vAlpha);
        }
      `
    });

    const starPoints = new THREE.Points(starGeo, starMat);
    starPoints.renderOrder = -7;
    this.scene.add(starPoints);
  }

  _createMarbleTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cx = size * 0.5;
    const cy = size * 0.5;

    // 上品な白〜極淡ブルー＆クリームの大理石ベース
    const bg = ctx.createRadialGradient(cx, cy, 40, cx, cy, size * 0.5);
    bg.addColorStop(0, '#fcfaff');
    bg.addColorStop(0.68, '#f3f1f8');
    bg.addColorStop(1, '#e6e2f0');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // 大理石のマーブル脈
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < 34; i++) {
      ctx.beginPath();
      let x = rand() * size;
      let y = rand() * size;
      let ang = rand() * Math.PI * 2;
      ctx.moveTo(x, y);
      for (let s = 0; s < 14; s++) {
        ang += (rand() - 0.5) * 0.85;
        x += Math.cos(ang) * 48;
        y += Math.sin(ang) * 48;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 3 === 0
        ? 'rgba(210, 195, 224, 0.34)'
        : (i % 3 === 1 ? 'rgba(176, 196, 222, 0.28)' : 'rgba(228, 200, 152, 0.26)');
      ctx.lineWidth = 1.5 + rand() * 5.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 中央のさりげない金の魔法陣風リング
    ctx.strokeStyle = 'rgba(218, 178, 92, 0.48)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * size * 0.14, cy + Math.sin(a) * size * 0.14);
      ctx.lineTo(cx + Math.cos(a) * size * 0.38, cy + Math.sin(a) * size * 0.38);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  _createMarbleFloor() {
    const marbleTex = this._createMarbleTexture();

    // transparent: true(opacity:1), depthWrite: false にして実体オブジェクト描画後に描くことで、
    // 実体キャラクターの上に反射が上書きされるのを防ぐ
    const topGeo = new THREE.CircleGeometry(this.floorRadius, 64);
    topGeo.rotateX(-Math.PI / 2);

    const topMat = new THREE.MeshBasicMaterial({
      map: marbleTex,
      transparent: true,
      opacity: 1.0,
      depthTest: true,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp
    });

    this.floorTopMesh = new THREE.Mesh(topGeo, topMat);
    this.floorTopMesh.position.y = 0;
    this.floorTopMesh.renderOrder = -2;
    this.scene.add(this.floorTopMesh);

    // 大理石プラットフォームの厚み・底面（下から浮いているように見える台座）
    const baseGeo = new THREE.CylinderGeometry(this.floorRadius, this.floorRadius * 0.9, 0.72, 64);
    const baseMat = new THREE.MeshToonMaterial({ color: 0xd9d4e8 });
    this.floorBaseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.floorBaseMesh.position.y = -0.37;
    this.floorBaseMesh.renderOrder = 0;
    this.scene.add(this.floorBaseMesh);

    // 外周の金の縁取りリング
    const rimGeo = new THREE.TorusGeometry(this.floorRadius, 0.14, 12, 64);
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = new THREE.MeshToonMaterial({ color: 0xebc25c });
    this.floorRimMesh = new THREE.Mesh(rimGeo, rimMat);
    this.floorRimMesh.position.y = 0.02;
    this.floorRimMesh.renderOrder = 0;
    this.scene.add(this.floorRimMesh);
  }

  _createFloatingDoor() {
    const stoneMat = new THREE.MeshToonMaterial({ color: 0xf6f2fa });
    const stoneTrimMat = new THREE.MeshToonMaterial({ color: 0xe6d8eb });
    const goldMat = new THREE.MeshToonMaterial({ color: 0xf5c042 });
    const woodDarkMat = new THREE.MeshToonMaterial({ color: 0x7a4728 });
    const woodFrameMat = new THREE.MeshToonMaterial({ color: 0x522b14 });
    const metalBeltMat = new THREE.MeshToonMaterial({ color: 0xd9a838 });
    const exitGlowMat = new THREE.MeshBasicMaterial({
      color: 0xfff9e6,
      side: THREE.DoubleSide
    });

    // 床の縁の少し先（z = doorZ）に浮いている門と扉
    this.doorGroup = new THREE.Group();
    this.doorGroup.position.set(0, 0.16, this.doorZ);
    this.scene.add(this.doorGroup);

    // 浮遊する石造り門枠（左右ピラー＋アーチ上枠）
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.1, 0.75), stoneMat);
    pillarL.position.set(-1.82, 2.05, 0);
    this.doorGroup.add(pillarL);

    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.1, 0.75), stoneMat);
    pillarR.position.set(1.82, 2.05, 0);
    this.doorGroup.add(pillarR);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.65, 0.85), stoneTrimMat);
    lintel.position.set(0, 4.15, 0);
    this.doorGroup.add(lintel);

    const topGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), goldMat);
    topGem.position.set(0, 4.7, 0);
    topGem.scale.set(1.0, 1.2, 0.55);
    this.doorGroup.add(topGem);

    // 扉の向こう側の光の幕
    const portalGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.65), exitGlowMat);
    portalGlow.position.set(0, 1.85, 0.18);
    this.doorGroup.add(portalGlow);

    // 両開きの重厚な木の扉（内側 -Z 方向へ開く）
    const doorWidth = 1.48;
    const doorHeight = 3.56;
    const doorDepth = 0.22;

    const buildDoorPair = (parentGroup, isReflection = false) => {
      const makeMat = (mat) => {
        if (!isReflection) return mat;
        return new THREE.MeshBasicMaterial({
          color: mat.color.getHex(),
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          depthTest: true,
          side: THREE.BackSide,
          stencilWrite: true,
          stencilRef: 1,
          stencilFunc: THREE.EqualStencilFunc
        });
      };

      const mDark = makeMat(woodDarkMat);
      const mFrame = makeMat(woodFrameMat);
      const mBelt = makeMat(metalBeltMat);
      const mGold = makeMat(goldMat);

      const createLeaf = (side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 1.49, 0, -0.14);

        const dir = -side;
        const leafGroup = new THREE.Group();
        leafGroup.position.set(dir * (doorWidth * 0.5), doorHeight * 0.5, 0);
        pivot.add(leafGroup);

        leafGroup.add(new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth), mDark));

        const frameThick = 0.14;
        const topF = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, frameThick, doorDepth + 0.04), mFrame);
        topF.position.y = doorHeight * 0.5 - frameThick * 0.5;
        leafGroup.add(topF);

        const botF = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, frameThick * 1.2, doorDepth + 0.04), mFrame);
        botF.position.y = -doorHeight * 0.5 + frameThick * 0.6;
        leafGroup.add(botF);

        const outerS = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, doorDepth + 0.04), mFrame);
        outerS.position.x = -dir * (doorWidth * 0.5 - frameThick * 0.5);
        leafGroup.add(outerS);

        const innerS = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, doorDepth + 0.04), mFrame);
        innerS.position.x = dir * (doorWidth * 0.5 - frameThick * 0.5);
        leafGroup.add(innerS);

        for (const by of [-0.88, 0.82]) {
          const strap = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.06, 0.18, doorDepth + 0.06), mBelt);
          strap.position.y = by;
          leafGroup.add(strap);
        }

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 16), mGold);
        ring.position.set(dir * (doorWidth * 0.5 - 0.28), -0.22, -doorDepth * 0.5 - 0.05);
        leafGroup.add(ring);

        parentGroup.add(pivot);
        return pivot;
      };

      return {
        left: createLeaf(-1),
        right: createLeaf(1)
      };
    };

    const realLeaves = buildDoorPair(this.doorGroup, false);
    this.leftDoorPivot = realLeaves.left;
    this.rightDoorPivot = realLeaves.right;

    // 扉と門枠の床面反射メッシュ
    this.doorReflectGroup = new THREE.Group();
    this.doorReflectGroup.position.set(0, -0.16, this.doorZ);
    this.doorReflectGroup.scale.set(1, -1, 1);
    this.doorReflectGroup.renderOrder = -1;
    this.scene.add(this.doorReflectGroup);

    const reflStoneMat = new THREE.MeshBasicMaterial({
      color: 0xf6f2fa,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.EqualStencilFunc
    });

    const rpL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.1, 0.75), reflStoneMat);
    rpL.position.set(-1.82, 2.05, 0);
    this.doorReflectGroup.add(rpL);

    const rpR = new THREE.Mesh(new THREE.BoxGeometry(0.65, 4.1, 0.75), reflStoneMat);
    rpR.position.set(1.82, 2.05, 0);
    this.doorReflectGroup.add(rpR);

    const rLintel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.65, 0.85), reflStoneMat);
    rLintel.position.set(0, 4.15, 0);
    this.doorReflectGroup.add(rLintel);

    const reflLeaves = buildDoorPair(this.doorReflectGroup, true);
    this.reflLeftDoorPivot = reflLeaves.left;
    this.reflRightDoorPivot = reflLeaves.right;
  }

  _syncPlayerReflection(key, playerObj, visible) {
    let entry = this.reflectionPool.get(key);
    if (!entry && playerObj) {
      const root = new THREE.Group();
      root.scale.set(1, -1, 1);
      root.renderOrder = -1;

      const bodyPivot = new THREE.Group();
      root.add(bodyPivot);

      const rollHolder = new THREE.Group();
      bodyPivot.add(rollHolder);

      const geo = new THREE.SphereGeometry(playerObj.radius, 28, 24);
      const mat = new THREE.MeshBasicMaterial({
        map: playerObj.faceTexture,
        transparent: true,
        opacity: 0.30,
        depthWrite: false,
        depthTest: true,
        side: THREE.BackSide,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.EqualStencilFunc
      });

      const sphere = new THREE.Mesh(geo, mat);
      sphere.rotation.y = -Math.PI / 2;
      rollHolder.add(sphere);

      this.scene.add(root);
      entry = { root, bodyPivot, rollHolder, mat };
      this.reflectionPool.set(key, entry);
    }

    if (!entry) return;

    if (!visible || !playerObj || this.isFloorHidden) {
      entry.root.visible = false;
      return;
    }

    if (entry.mat.map !== playerObj.faceTexture) {
      entry.mat.map = playerObj.faceTexture;
      entry.mat.needsUpdate = true;
    }

    entry.root.visible = true;
    const xzScale = 1 / Math.sqrt(playerObj.squashY);
    entry.bodyPivot.scale.set(xzScale, playerObj.squashY, xzScale);

    const bottomOffset = (playerObj.squashY - 1.0) * playerObj.radius * 0.65;
    entry.root.position.set(
      playerObj.position.x,
      -(playerObj.position.y + bottomOffset),
      playerObj.position.z
    );
    entry.rollHolder.quaternion.copy(playerObj.rollQuat);
  }

  updateFloorVisibility(camPos, lookTarget) {
    let hideFloor = false;
    if (camPos && lookTarget && camPos.y < 0.08) {
      const denom = lookTarget.y - camPos.y;
      if (denom > 0.001) {
        const t = THREE.MathUtils.clamp((0.0 - camPos.y) / denom, 0, 1);
        const ix = camPos.x + (lookTarget.x - camPos.x) * t;
        const iz = camPos.z + (lookTarget.z - camPos.z) * t;
        if (Math.hypot(ix, iz) <= this.floorRadius + 0.8) {
          hideFloor = true;
        }
      } else {
        hideFloor = true;
      }
    }

    this.isFloorHidden = hideFloor;
    this.floorTopMesh.visible = !hideFloor;
    this.floorBaseMesh.visible = !hideFloor;
    this.floorRimMesh.visible = !hideFloor;
    this.doorReflectGroup.visible = !hideFloor;

    if (hideFloor) {
      for (const entry of this.reflectionPool.values()) {
        entry.root.visible = false;
      }
    }
    return hideFloor;
  }

  resetDoor() {
    this.openAmount = 0;
    this.leftDoorPivot.rotation.y = 0;
    this.rightDoorPivot.rotation.y = 0;
    this.reflLeftDoorPivot.rotation.y = 0;
    this.reflRightDoorPivot.rotation.y = 0;
  }

  update(dt, playerPos, partnerPos, localPlayer, remotePlayer, isPartnerInCastle) {
    this.time += dt;
    this.starUniforms.uTime.value = this.time;

    // 浮いている扉がふわふわわずかに揺れる
    const floatY = Math.sin(this.time * 1.4) * 0.08;
    this.doorGroup.position.y = 0.16 + floatY;
    this.doorReflectGroup.position.y = -(0.16 + floatY);

    // 扉の自動開閉（内側 -Z 側に開くため広めに反応）
    const distLocal = playerPos
      ? Math.hypot(playerPos.x, playerPos.z - this.doorZ)
      : Infinity;
    const distPartner = partnerPos
      ? Math.hypot(partnerPos.x, partnerPos.z - this.doorZ)
      : Infinity;
    const minDist = Math.min(distLocal, distPartner);

    let shouldOpen = this.openAmount > 0.5 ? minDist < 9.0 : minDist < 7.6;
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
    this.leftDoorPivot.rotation.y = this.doorOpenAngle * eased;
    this.rightDoorPivot.rotation.y = -this.doorOpenAngle * eased;
    this.reflLeftDoorPivot.rotation.y = this.doorOpenAngle * eased;
    this.reflRightDoorPivot.rotation.y = -this.doorOpenAngle * eased;

    // 床面へのプレイヤー反射を同期
    this._syncPlayerReflection('local', localPlayer, true);
    this._syncPlayerReflection('remote', remotePlayer, !!(remotePlayer && isPartnerInCastle));
  }

  resolveCollisions(pos, vel, radius) {
    let hitGround = false;
    let hardLandingVn = 0;

    // 大理石の床面（y = 0）への着地
    const horizDist = Math.hypot(pos.x, pos.z);
    if (pos.y - radius <= 0.0 && horizDist <= this.floorRadius + radius * 0.5) {
      if (vel.y < hardLandingVn) hardLandingVn = vel.y;
      pos.y = radius;
      if (vel.y < 0) vel.y = 0;
      hitGround = true;
    }

    // 扉の左右の石柱の押し出し
    const pillarMinY = 0;
    const pillarMaxY = 4.4;
    if (pos.y + radius > pillarMinY && pos.y - radius < pillarMaxY) {
      const pillars = [
        { minX: -2.15, maxX: -1.49, minZ: this.doorZ - 0.38, maxZ: this.doorZ + 0.38 },
        { minX: 1.49, maxX: 2.15, minZ: this.doorZ - 0.38, maxZ: this.doorZ + 0.38 }
      ];

      for (const col of pillars) {
        const qx = THREE.MathUtils.clamp(pos.x, col.minX, col.maxX);
        const qz = THREE.MathUtils.clamp(pos.z, col.minZ, col.maxZ);
        const dx = pos.x - qx;
        const dz = pos.z - qz;
        const distSq = dx * dx + dz * dz;
        if (distSq < radius * radius && distSq > 0.000001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const pen = radius - dist;
          pos.x += nx * pen;
          pos.z += nz * pen;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) {
            vel.x -= nx * vn;
            vel.z -= nz * vn;
          }
        }
      }
    }

    // 扉が閉まっている間は扉を通れない
    if (this.openAmount < 0.55 && pos.y < 3.8) {
      const doorPlaneZ = this.doorZ - 0.25;
      if (Math.abs(pos.x) < 1.55 && pos.z + radius > doorPlaneZ) {
        pos.z = doorPlaneZ - radius;
        if (vel.z > 0) vel.z = 0;
      }
    }

    // 外周の見えない壁（扉の開口部正面の脱出ゾーンを除き、丸い床から絶対に落ちない）
    const inDoorwayCorridor = pos.z > this.floorRadius - 2.0 && Math.abs(pos.x) < 1.42 && this.openAmount >= 0.55;
    if (!inDoorwayCorridor) {
      const maxWalkR = this.floorRadius - radius - 0.15;
      const d = Math.hypot(pos.x, pos.z);
      if (d > maxWalkR && d > 0.0001) {
        const nx = pos.x / d;
        const nz = pos.z / d;
        pos.x = nx * maxWalkR;
        pos.z = nz * maxWalkR;
        const vn = vel.x * nx + vel.z * nz;
        if (vn > 0) {
          vel.x -= nx * vn;
          vel.z -= nz * vn;
        }
      }
    }

    return { hitGround, hardLandingVn };
  }

  getShadowGroundInfo(px, py, pz) {
    if (this.isFloorHidden) return null;
    if (Math.hypot(px, pz) <= this.floorRadius && py + 0.3 >= 0) {
      return { y: 0, normal: new THREE.Vector3(0, 1, 0) };
    }
    return null;
  }
}