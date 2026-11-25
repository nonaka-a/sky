class PhysicsSystem {
  constructor() {
    this.bumpCooldown = 0;
    this.rideCooldown = 0;

    this._tmpForward = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpWishDir = new THREE.Vector3();
  }

  resetCooldowns() {
    this.bumpCooldown = 0;
    this.rideCooldown = 0;
  }

  updateCooldowns(dt) {
    if (this.bumpCooldown > 0) this.bumpCooldown -= dt;
    if (this.rideCooldown > 0) this.rideCooldown -= dt;
  }

  setRideCooldown(val) {
    this.rideCooldown = val;
  }

  stepMovement(player, move, inputMag, camYaw, dt, sound, sendSeFn, applyCloudCarry = false) {
    if (applyCloudCarry && player.isGrounded && player.groundCloud) {
      player.position.add(player.groundCloud.deltaPos);
    }

    const forward = this._tmpForward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = this._tmpRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw));

    const wishDir = this._tmpWishDir
      .set(0, 0, 0)
      .addScaledVector(right, move.x)
      .addScaledVector(forward, -move.y);

    const maxSpeed = 10.5;

    if (inputMag > 0.05 && wishDir.lengthSq() > 0.0001) {
      wishDir.normalize();
      const targetVx = wishDir.x * maxSpeed * inputMag;
      const targetVz = wishDir.z * maxSpeed * inputMag;
      const grip = player.isGrounded ? 15.0 : 5.5;
      const alpha = 1 - Math.exp(-grip * dt);
      player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, targetVx, alpha);
      player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, targetVz, alpha);
    } else {
      const stopRate = player.isGrounded ? 22.0 : 4.0;
      const decay = Math.exp(-stopRate * dt);
      player.velocity.x *= decay;
      player.velocity.z *= decay;
      if (player.isGrounded && Math.hypot(player.velocity.x, player.velocity.z) < 0.08) {
        player.velocity.x = 0;
        player.velocity.z = 0;
      }
    }

    if (player.isGrounded) {
      player.coyoteTimer = 0.12;
    } else if (player.coyoteTimer > 0) {
      player.coyoteTimer -= dt;
    }

    let didDoubleJump = false;

    if (player.jumpBufferTimer > 0) {
      if (player.coyoteTimer > 0) {
        player.velocity.y = 14.5;
        player.isGrounded = false;
        player.groundCloud = null;
        player.airJumpsLeft = 1;
        player.jumpBufferTimer = 0;
        player.coyoteTimer = 0;
        player.triggerSquash(1.38);
        player.setExpression('jump', 0.4);
        sound.playJump();
        sendSeFn('jump');
      } else if (player.airJumpsLeft > 0) {
        player.velocity.y = 13.6;
        player.airJumpsLeft--;
        player.jumpBufferTimer = 0;
        player.triggerSquash(1.42);
        player.setExpression('happy', 0.45);
        player.spawnDoubleJumpRing();
        sound.playDoubleJump();
        didDoubleJump = true;
      }
    }

    player.velocity.y -= 32.0 * dt;
    player.velocity.y = Math.max(player.velocity.y, -28);

    player.position.addScaledVector(player.velocity, dt);

    return didDoubleJump;
  }

  resolveWorldCollisions(player, world, sound, sendSeFn, wasGrounded) {
    const p = player.position;
    const r = player.radius;

    const structHit = world.resolveStructureCollisions(p, player.velocity, r);
    if (structHit.hitGround) {
      player.isGrounded = true;
      player.groundCloud = null;
      player.airJumpsLeft = 1;

      if (!wasGrounded && structHit.hardLandingVn < -4.5) {
        player.triggerSquash(0.66);
        player.setExpression('land', 0.25);
        sound.playLand();
        sendSeFn('land');
      }

      if (structHit.hitStructure) {
        const safeSpot = structHit.hitStructure.getSafeSpot(p, r);
        if (safeSpot) {
          player.safeCloud = null;
          player.safeFallbackPos.copy(safeSpot);
        }
      }
    }

    for (const cloud of world.clouds) {
      if (Math.abs(cloud.position.x - p.x) > 28 || Math.abs(cloud.position.z - p.z) > 28) {
        continue;
      }

      const ps = cloud.pulseScale || 1.0;

      for (const col of cloud.colliders) {
        const rx = col.rx * ps;
        const ry = col.ry * ps;
        const rz = col.rz * ps;
        const cx = cloud.position.x + col.offset.x * ps;
        const cy = cloud.position.y + col.offset.y * ps;
        const cz = cloud.position.z + col.offset.z * ps;

        const dx = p.x - cx;
        const dy = p.y - cy;
        const dz = p.z - cz;

        const maxR = Math.max(rx, ry, rz) + r;
        if (dx * dx + dy * dy + dz * dz > maxR * maxR) continue;

        const k0 = Math.sqrt(
          (dx / rx) * (dx / rx) +
          (dy / ry) * (dy / ry) +
          (dz / rz) * (dz / rz)
        );

        if (k0 < 0.0001) continue;

        const sx = dx / k0;
        const sy = dy / k0;
        const sz = dz / k0;

        const nxRaw = dx / (rx * rx);
        const nyRaw = dy / (ry * ry);
        const nzRaw = dz / (rz * rz);
        const nLen = Math.hypot(nxRaw, nyRaw, nzRaw) || 1;
        const nx = nxRaw / nLen;
        const ny = nyRaw / nLen;
        const nz = nzRaw / nLen;

        const distSurf = Math.hypot(dx - sx, dy - sy, dz - sz);
        let penetration = 0;

        if (k0 >= 1.0) {
          if (distSurf < r) {
            penetration = r - distSurf;
          }
        } else {
          penetration = r + distSurf;
        }

        if (penetration > 0) {
          p.x += nx * penetration;
          p.y += ny * penetration;
          p.z += nz * penetration;

          const vn =
            player.velocity.x * nx +
            player.velocity.y * ny +
            player.velocity.z * nz;

          if (vn < 0) {
            player.velocity.x -= nx * vn;
            player.velocity.y -= ny * vn;
            player.velocity.z -= nz * vn;
          }

          if (ny > 0.45) {
            if (cloud.type === 'bouncy') {
              player.velocity.y = 22.0;
              player.isGrounded = false;
              player.airJumpsLeft = 1;
              player.triggerSquash(1.48);
              player.setExpression('happy', 0.55);
              sound.playBounce();
              sendSeFn('bounce');
            } else {
              player.isGrounded = true;
              player.groundCloud = cloud;
              player.airJumpsLeft = 1;

              if (!wasGrounded && vn < -4.5) {
                player.triggerSquash(0.66);
                player.setExpression('land', 0.25);
                sound.playLand();
                sendSeFn('land');
              }

              if (ny > 0.65) {
                const mainCol = cloud.colliders[0];
                const safeScale = cloud.type === 'yellow' ? (cloud.pulseMax || 1.25) : 1.0;
                player.safeCloud = cloud;
                if (cloud.safeLocalSpot) {
                  player.safeLocalOffset.set(
                    cloud.safeLocalSpot.x * safeScale,
                    cloud.safeLocalSpot.y * safeScale + r + 0.6,
                    cloud.safeLocalSpot.z * safeScale
                  );
                } else {
                  player.safeLocalOffset.set(
                    mainCol.offset.x * safeScale,
                    (mainCol.offset.y + mainCol.ry) * safeScale + r + 0.6,
                    mainCol.offset.z * safeScale
                  );
                }
                player.safeFallbackPos.copy(cloud.position).add(player.safeLocalOffset);
              }
            }
          }
        }
      }

      if (cloud.buildingColliders && cloud.buildingColliders.length > 0) {
        const bHit = CloudBuildingBuilder.resolveCloudBuildings(cloud, p, player.velocity, r);
        if (bHit.hitGround) {
          player.isGrounded = true;
          player.groundCloud = cloud;
          player.airJumpsLeft = 1;

          if (!wasGrounded && bHit.hardLandingVn < -4.5) {
            player.triggerSquash(0.66);
            player.setExpression('land', 0.25);
            sound.playLand();
            sendSeFn('land');
          }
        }
      }
    }
  }

  resolvePlayerInteraction(player, remotePlayer, sound, sendSeFn, wasGrounded) {
    if (remotePlayer.isRidingPartner) return;

    const p = player.position;
    const rp = remotePlayer.position;

    const dx = p.x - rp.x;
    const dy = p.y - rp.y;
    const dz = p.z - rp.z;
    const dist = Math.hypot(dx, dy, dz);
    const minDist = player.radius + remotePlayer.radius;

    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      const penetration = minDist - dist;

      if (this.rideCooldown <= 0 && ny > 0.45 && player.velocity.y <= 2.0 && p.y > rp.y + 0.25) {
        player.isRidingPartner = true;
        p.set(rp.x, rp.y + minDist - 0.04, rp.z);
        player.velocity.set(0, 0, 0);
        player.isGrounded = true;
        player.airJumpsLeft = 1;

        if (!wasGrounded) {
          player.triggerSquash(0.76);
          sound.playLand();
          sendSeFn('land');
        }
      } else {
        p.x += nx * penetration * 0.65;
        p.y += ny * penetration * 0.35;
        p.z += nz * penetration * 0.65;

        const vn =
          player.velocity.x * nx +
          player.velocity.y * ny +
          player.velocity.z * nz;

        if (vn < 0) {
          player.velocity.x -= nx * vn;
          player.velocity.y -= ny * vn;
          player.velocity.z -= nz * vn;
        }

        const hLen = Math.hypot(nx, nz) || 1;
        player.velocity.x += (nx / hLen) * 3.4;
        player.velocity.z += (nz / hLen) * 3.4;

        if (ny < -0.5 && player.velocity.y > 0) {
          player.velocity.y = -1.2;
        }

        if (this.bumpCooldown <= 0) {
          this.bumpCooldown = 0.28;
          player.triggerSquash(0.82);
          sound.playLand();
          sendSeFn('land');
        }
      }
    }
  }
}