/* =======================================================================
 * gadgets.js —— 投掷物 / 烟雾 / C4
 *
 *   破片手雷：掷出后 2.6 秒爆炸，中心 120 伤害，边缘 60，再往外递减到 0
 *   烟雾弹  ：落地生成半径 6 米的浓烟，持续 18 秒；机器人无法透过烟雾看到玩家
 *             手雷在烟雾里爆炸会让烟雾消散 2 秒（18 秒没到就再回来）
 *   C4 炸弹 ：只能在 A / B 包点放置（长按左键 4 秒），60 秒后爆炸，
 *             中心 200 伤害，向外递减到 0（半径 50 米，约半张地图）
 *             放置后所有机器人都会来找你；你死了 C4 就消失
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils, Collide = FPS.Collide, Sound = FPS.Sound;

  var GRENADE = {
    fuse: 2.6, radius: 9.0, centerDamage: 120, edgeDamage: 60, power: 17
  };
  var SMOKE = {
    radius: 6.0, life: 18, duration: 1.2, power: 13
  };
  var C4 = {
    plantTime: 4.0, fuse: 60, radius: 50, centerDamage: 200
  };

  function GadgetManager(scene, world, effects) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.projectiles = [];    // 飞行中的手雷 / 烟雾弹
    this.smokes = [];         // 已生效的烟雾
    this.c4 = null;           // 已放置的 C4
    this.onExplode = null;    // (pos, radius, centerDamage) -> 伤害结算由 main 处理
    this.onC4Change = null;
    this._geoBall = new THREE.SphereGeometry(0.11, 10, 8);
    this._geoCan = new THREE.CylinderGeometry(0.075, 0.075, 0.24, 10);
    this._darkMat = new THREE.MeshStandardMaterial({ color: 0x3d4a34, roughness: 0.6, metalness: 0.5 });
    this._smokeMat = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.5, metalness: 0.4 });
    this.smokeTex = FPS.Textures.get('smoke');
  }

  GadgetManager.prototype.reset = function () {
    var i;
    for (i = this.projectiles.length - 1; i >= 0; i--) this.scene.remove(this.projectiles[i].mesh);
    for (i = 0; i < this.smokes.length; i++) this._removeSmoke(this.smokes[i]);
    this.projectiles = [];
    this.smokes = [];
    if (this.c4) { this.scene.remove(this.c4.group); this.c4 = null; }
  };

  /* ------------------------------------------------------------- 投掷 */
  GadgetManager.prototype.throwItem = function (kind, origin, dir, power) {
    var mesh;
    if (kind === 'smoke') {
      mesh = new THREE.Mesh(this._geoCan, this._smokeMat);
    } else {
      mesh = new THREE.Mesh(this._geoBall, this._darkMat);
    }
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);

    var p = power || (kind === 'smoke' ? SMOKE.power : GRENADE.power);
    this.projectiles.push({
      kind: kind, mesh: mesh,
      vel: dir.clone().multiplyScalar(p).add(new THREE.Vector3(0, 4.2, 0)),
      life: 4.0, fuse: (kind === 'smoke' ? 1.6 : GRENADE.fuse),
      armed: false, prev: origin.clone(), spin: Utils.rand(4, 9)
    });
    Sound.jump();
  };

  GadgetManager.prototype._hitWorld = function (from, to) {
    var boxes = this.world.colliders;
    var best = -1, bestBox = null;
    for (var i = 0; i < boxes.length; i++) {
      var t = Collide.segmentAABB(from, to, boxes[i]);
      if (t >= 0 && t <= 1 && (best < 0 || t < best)) { best = t; bestBox = boxes[i]; }
    }
    return best;
  };

  /* ------------------------------------------------------------- 烟雾 */
  GadgetManager.prototype._spawnSmoke = function (pos) {
    var group = new THREE.Group();
    group.position.copy(pos);
    var puffs = [];
    var n = 46;
    for (var i = 0; i < n; i++) {
      // 用普通混合 + 不透明贴图，堆成一团看得见、能穿过去的浓烟
      var s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.smokeTex, color: 0xeef2f5,
        transparent: true, opacity: 0, depthWrite: true, depthTest: true
      }));
      var a = Math.random() * Math.PI * 2;
      var r = Math.pow(Math.random(), 0.45) * SMOKE.radius * 0.85;
      var vAng = (Math.random() - 0.5) * Math.PI * 0.9;
      var py = 1.6 + Math.sin(vAng) * SMOKE.radius * 0.55;
      s.position.set(Math.cos(a) * r, Math.max(0.6, py), Math.sin(a) * r);
      var size = Utils.rand(3.2, 5.4);
      s.scale.set(size, size, 1);
      s.userData.baseSize = size;
      group.add(s);
      puffs.push(s);
    }
    this.scene.add(group);
    var smoke = {
      group: group, puffs: puffs, pos: pos.clone(),
      radius: SMOKE.radius, life: SMOKE.life, maxLife: SMOKE.life,
      suppress: 0, phase: 0, grow: 0
    };
    this.smokes.push(smoke);
    Sound.enemyCharge();
    return smoke;
  };

  GadgetManager.prototype._removeSmoke = function (smoke) {
    this.scene.remove(smoke.group);
    for (var i = 0; i < smoke.puffs.length; i++) smoke.puffs[i].material.dispose();
    var idx = this.smokes.indexOf(smoke);
    if (idx >= 0) this.smokes.splice(idx, 1);
  };

  /* 手雷在烟雾里爆炸 -> 烟雾消散 2 秒 */
  GadgetManager.prototype._disperseSmoke = function (pos) {
    for (var i = 0; i < this.smokes.length; i++) {
      var s = this.smokes[i];
      if (s.pos.distanceTo(pos) < s.radius * 1.6) s.suppress = 2.0;
    }
  };

  /* 机器人视线是否被烟雾挡住 */
  GadgetManager.prototype.smokeBlocks = function (from, to) {
    for (var i = 0; i < this.smokes.length; i++) {
      var s = this.smokes[i];
      if (s.suppress > 0 || s.grow < 0.5) continue;
      // 线段到球心距离
      var dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      var len2 = dx * dx + dy * dy + dz * dz;
      if (len2 < 1e-6) continue;
      var t = ((s.pos.x - from.x) * dx + (s.pos.y + 1.2 - from.y) * dy + (s.pos.z - from.z) * dz) / len2;
      t = Utils.clamp(t, 0, 1);
      var cx = from.x + dx * t - s.pos.x;
      var cy = from.y + dy * t - (s.pos.y + 1.2);
      var cz = from.z + dz * t - s.pos.z;
      if (cx * cx + cy * cy + cz * cz < s.radius * s.radius) return true;
    }
    return false;
  };

  /* 某个位置被烟雾笼罩的程度（0~1），用于玩家在烟里的视野遮挡 */
  GadgetManager.prototype.smokeDensityAt = function (pos, target) {
    var best = 0;
    for (var i = 0; i < this.smokes.length; i++) {
      var s = this.smokes[i];
      if (s.suppress > 0 || s.grow < 0.3) continue;
      var dx = pos.x - s.pos.x;
      var dy = (pos.y + (target === undefined ? 1.6 : target)) - (s.pos.y + 1.6);
      var dz = pos.z - s.pos.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var k = Utils.clamp(1 - d / (s.radius * 1.25), 0, 1) * s.grow;
      if (k > best) best = k;
    }
    return best;
  };

  /* ------------------------------------------------------------- C4 */
  GadgetManager.prototype.canPlantC4 = function (pos) {
    var t = this.world.worldToTile(pos.x, pos.z);
    var ch = this.world.tileAt(t.col, t.row);
    return ch === 'A' || ch === 'B';
  };

  GadgetManager.prototype.plantC4 = function (pos) {
    if (this.c4) return false;
    if (!this.canPlantC4(pos)) return false;
    var group = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.7, metalness: 0.3 }));
    body.position.y = 0.16;
    body.castShadow = true;
    group.add(body);
    var light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
    light.position.set(0, 0.34, 0);
    group.add(light);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.glowTex, color: 0xff4040, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8
    }));
    glow.scale.set(1.2, 1.2, 1);
    glow.position.set(0, 0.34, 0);
    group.add(glow);
    group.position.copy(pos);
    group.position.y = this.world._settleY(pos.x, pos.z);
    this.scene.add(group);
    this.c4 = { group: group, light: light, pos: group.position.clone(), fuse: C4.fuse, plantedAt: 0 };
    if (this.onC4Change) this.onC4Change(this.c4);
    Sound.pickup();
    return true;
  };

  GadgetManager.prototype.removeC4 = function (byDeath) {
    if (!this.c4) return;
    this.scene.remove(this.c4.group);
    this.c4 = null;
    if (this.onC4Change) this.onC4Change(null, byDeath);
  };

  /* ------------------------------------------------------------- 每帧 */
  GadgetManager.prototype.update = function (dt, player) {
    var i, j;

    /* 投掷物飞行 */
    for (i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];
      p.life -= dt;
      p.prev.copy(p.mesh.position);
      p.vel.y -= 20 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * p.spin;
      p.mesh.rotation.z += dt * p.spin * 0.7;

      // 撞到地面/墙
      var t = this._hitWorld(p.prev, p.mesh.position);
      if (t >= 0) {
        var hitPoint = p.prev.clone().lerp(p.mesh.position, t);
        p.mesh.position.copy(hitPoint);
        p.vel.multiplyScalar(-0.28);
        p.vel.y = Math.abs(p.vel.y) * 0.35;
        p.vel.x *= 0.6; p.vel.z *= 0.6;
        if (!p.armed) { p.armed = true; p.fuse = Math.min(p.fuse, p.kind === 'smoke' ? 0.7 : 1.6); }
      }
      var grounded = p.mesh.position.y <= this.world._settleY(p.mesh.position.x, p.mesh.position.z) + 0.12;
      if (grounded) {
        p.vel.multiplyScalar(0.82);
        if (!p.armed) { p.armed = true; p.fuse = Math.min(p.fuse, p.kind === 'smoke' ? 0.7 : 1.6); }
      }

      p.fuse -= dt;
      if (p.fuse <= 0 || p.life <= 0) {
        var pos = p.mesh.position.clone();
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        if (p.kind === 'smoke') {
          this._spawnSmoke(pos);
        } else {
          this.effects.explosion(pos, 0xffa040, 1.8);
          Sound.kill();
          this._disperseSmoke(pos);
          if (this.onExplode) this.onExplode(pos, GRENADE.radius, GRENADE.centerDamage, GRENADE.edgeDamage);
        }
      }
    }

    /* 烟雾计时 */
    for (i = this.smokes.length - 1; i >= 0; i--) {
      var s = this.smokes[i];
      s.life -= dt;
      s.phase += dt;
      if (s.grow < 1) s.grow = Math.min(1, s.grow + dt / 1.2);
      if (s.suppress > 0) s.suppress -= dt;

      var k = Math.min(1, s.life / 3) * s.grow;
      if (s.suppress > 0) k = 0;
      for (j = 0; j < s.puffs.length; j++) {
        var puff = s.puffs[j];
        puff.material.opacity = 0.98 * k;
        var wob = 1 + Math.sin(s.phase * 1.4 + j) * 0.05;
        var bs = puff.userData.baseSize || 4;
        puff.scale.set(bs * s.grow * wob, bs * s.grow * wob, 1);
        puff.position.y += Math.sin(s.phase * 0.9 + j * 1.7) * dt * 0.3;
        puff.position.x += Math.cos(s.phase * 0.7 + j * 2.1) * dt * 0.25;
      }
      if (s.life <= 0) this._removeSmoke(s);
    }

    /* C4 倒计时 */
    if (this.c4) {
      this.c4.fuse -= dt;
      var blink = (Math.sin(this.c4.fuse * 8) > 0);
      this.c4.light.material.color.setHex(blink ? 0xff2d2d : 0x551111);
      if (this.c4.fuse <= 0) {
        var cpos = this.c4.pos.clone();
        this.removeC4(false);
        this.effects.explosion(cpos, 0xffd166, 6);
        this.effects.explosion(cpos, 0xff6a2a, 9);
        Sound.gameOver();
        if (this.onExplode) this.onExplode(cpos, C4.radius, C4.centerDamage, 0);
      }
    }
  };

  FPS.GRENADE_CFG = GRENADE;
  FPS.SMOKE_CFG = SMOKE;
  FPS.C4_CFG = C4;
  FPS.GadgetManager = GadgetManager;
})(window.FPS);
