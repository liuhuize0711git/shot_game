/* =======================================================================
 * enemies.js —— 机器人：4 种类型 + 分组巡逻 + 发现玩家后包夹
 *
 * 设计原则（按需求）：攻击越快 → 单次伤害越低
 *   冲锋兵  攻击间隔 0.45s  单发 4 伤害   跑得最快，贴身骚扰
 *   步枪兵  攻击间隔 1.30s  三连发 4x3   中距离主力
 *   重装兵  攻击间隔 2.20s  霰弹 6x6     血厚、移动慢、近距离爆发
 *   狙击手  攻击间隔 3.40s  单发 42      远距离一枪残血，开火前有激光预警
 *
 * 机器人被击杀后会在 T 阵营出生点复活，场上数量维持在设置的上限。
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils, Collide = FPS.Collide, Sound = FPS.Sound;

  var BOT_TYPES = {
    rusher: {
      id: 'rusher', name: '冲锋兵', color: 0xd2622a, eye: 0xff7a2a, accent: 0xffb347,
      body: 0x8a4420, hp: 90, speed: 5.3, radius: 0.28, height: 1.8, scale: 0.94,
      attackRange: 16, desiredRange: 5.5, cooldown: 0.45, burst: 1, burstGap: 0,
      damage: 4, projSpeed: 34, projSpread: 0.055, chargeTime: 0, score: 80
    },
    rifleman: {
      id: 'rifleman', name: '步枪兵', color: 0x3c6ea8, eye: 0x66e0ff, accent: 0x8fd4ff,
      body: 0x2b4d75, hp: 130, speed: 4.1, radius: 0.31, height: 1.9, scale: 1.0,
      attackRange: 26, desiredRange: 11, cooldown: 1.3, burst: 3, burstGap: 0.12,
      damage: 4, projSpeed: 46, projSpread: 0.022, chargeTime: 0.28, score: 100
    },
    heavy: {
      id: 'heavy', name: '重装兵', color: 0x6b7280, eye: 0xffd166, accent: 0xffd166,
      body: 0x474e57, hp: 250, speed: 2.9, radius: 0.39, height: 2.05, scale: 1.16,
      attackRange: 18, desiredRange: 7, cooldown: 2.2, burst: 6, burstGap: 0.06,
      damage: 6, projSpeed: 28, projSpread: 0.10, chargeTime: 0.5, score: 160
    },
    sniper: {
      id: 'sniper', name: '狙击手', color: 0x7a4fa8, eye: 0xff5470, accent: 0xff5470,
      body: 0x4a3566, hp: 100, speed: 3.1, radius: 0.29, height: 1.92, scale: 1.02,
      attackRange: 72, desiredRange: 32, cooldown: 3.4, burst: 1, burstGap: 0,
      damage: 42, projSpeed: 92, projSpread: 0.004, chargeTime: 1.0, score: 220,
      laser: true
    }
  };

  var TYPE_KEYS = ['rusher', 'rifleman', 'heavy', 'sniper'];
  var SPAWN_WEIGHTS = [0.34, 0.32, 0.16, 0.18];

  function pickType() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < TYPE_KEYS.length; i++) {
      acc += SPAWN_WEIGHTS[i];
      if (r <= acc) return TYPE_KEYS[i];
    }
    return 'rusher';
  }

  /* ===================================================================== */
  /*                              单个机器人                                */
  /* ===================================================================== */
  function Bot(manager, typeId, pos, squad) {
    this.manager = manager;
    this.scene = manager.scene;
    this.world = manager.world;
    this.nav = manager.nav;
    this.effects = manager.effects;
    this.type = BOT_TYPES[typeId] || BOT_TYPES.rusher;
    this.squad = squad;

    this.maxHealth = this.type.hp;
    this.health = this.maxHealth;
    this.radius = this.type.radius;
    this.height = this.type.height;
    this.baseScale = this.type.scale;

    this.state = 'spawning';
    this.spawnTimer = 0.5;
    this.dead = false;
    this.stagger = 0;
    this.hitFlash = 0;
    this.kick = 0;
    this.walkPhase = 0;
    this.offsetAngle = 0;

    this.attackCooldown = Utils.rand(0.6, 2.2);
    this.charging = false;
    this.chargeTimer = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.losTimer = 0;
    this.hasLOS = false;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = Utils.rand(0.8, 1.8);

    this.path = null;
    this.pathIndex = 0;
    this.repathTimer = Utils.rand(0.1, 0.5);
    this.lastGoal = { x: pos.x, z: pos.z };
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.yaw = 0;
    this.vel = new THREE.Vector3(0, 0, 0);
    this.onGround = false;
    this.ctx = {
      radius: this.radius, height: this.height, colliders: this.world.colliders,
      stepHeight: 0.32, stepped: false, grounded: false, hitCeiling: false
    };

    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._losRay = new THREE.Raycaster();
    this._losFrom = new THREE.Vector3();
    this._losTo = new THREE.Vector3();
    this._losDir = new THREE.Vector3();

    this._build(pos);
  }

  /* ------------------------------------------------------------- 外观 */
  Bot.prototype._build = function (pos) {
    var t = this.type;
    var root = new THREE.Group();
    root.position.copy(pos);
    var pivot = new THREE.Group();
    root.add(pivot);

    this.matBody = new THREE.MeshStandardMaterial({ color: t.body, roughness: 0.55, metalness: 0.62 });
    this.matPlate = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.42, metalness: 0.75 });
    this.matDark = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.72, metalness: 0.45 });
    this.matEye = new THREE.MeshBasicMaterial({ color: t.eye });
    this.matAccent = new THREE.MeshBasicMaterial({ color: t.accent });
    this.matLaser = new THREE.LineBasicMaterial({ color: 0xff3b4d, transparent: true, opacity: 0.55 });
    this.materials = [this.matBody, this.matPlate, this.matDark, this.matEye, this.matAccent, this.matLaser];

    function box(parent, w, h, d, x, y, z, mat) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    }

    /* ---- 人形士兵：头 + 头盔 + 躯干 + 防弹衣 + 手臂持枪 + 双腿 ---- */
    var wide = (t.id === 'heavy') ? 1.25 : 1;

    // 腿（大腿 + 小腿 + 靴子）
    this.legL = box(pivot, 0.18 * wide, 0.44, 0.22, -0.15 * wide, 0.68, 0, this.matDark);
    this.legR = box(pivot, 0.18 * wide, 0.44, 0.22, 0.15 * wide, 0.68, 0, this.matDark);
    box(pivot, 0.16 * wide, 0.44, 0.2, -0.15 * wide, 0.24, 0, this.matDark);
    box(pivot, 0.16 * wide, 0.44, 0.2, 0.15 * wide, 0.24, 0, this.matDark);
    box(pivot, 0.2 * wide, 0.1, 0.3, -0.15 * wide, 0.05, 0.04, this.matBody);
    box(pivot, 0.2 * wide, 0.1, 0.3, 0.15 * wide, 0.05, 0.04, this.matBody);

    // 腰 + 躯干 + 防弹衣
    box(pivot, 0.46 * wide, 0.18, 0.28, 0, 0.94, 0, this.matDark);
    this.torso = box(pivot, 0.54 * wide, 0.62, 0.3, 0, 1.28, 0, this.matBody);
    box(pivot, 0.6 * wide, 0.44, 0.34, 0, 1.32, 0.02, this.matPlate);
    box(pivot, 0.26, 0.14, 0.06, 0, 1.42, 0.2, this.matAccent);

    // 肩膀 + 手臂（前臂向前伸，做持枪姿势）
    box(pivot, 0.2 * wide, 0.2, 0.26, -0.34 * wide, 1.48, 0, this.matPlate);
    box(pivot, 0.2 * wide, 0.2, 0.26, 0.34 * wide, 1.48, 0, this.matPlate);
    box(pivot, 0.15, 0.34, 0.16, -0.34 * wide, 1.28, 0.02, this.matBody);
    box(pivot, 0.15, 0.34, 0.16, 0.34 * wide, 1.28, 0.02, this.matBody);
    box(pivot, 0.14, 0.15, 0.4, -0.3 * wide, 1.18, 0.22, this.matBody);
    box(pivot, 0.14, 0.15, 0.4, 0.3 * wide, 1.2, 0.24, this.matBody);

    // 头 + 头盔 + 面罩
    this.head = box(pivot, 0.28, 0.3, 0.28, 0, 1.74, 0, this.matPlate);
    box(pivot, 0.34, 0.14, 0.32, 0, 1.9, -0.01, this.matDark);
    var eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.03), this.matEye);
    eye.position.set(0, 1.76, 0.15);
    pivot.add(eye);
    this.eye = eye;
    box(pivot, 0.22, 0.1, 0.06, 0, 1.66, 0.14, this.matDark);

    /* ---- 各自拿不同的枪 ---- */
    var gunMat = this.matDark, gunMat2 = this.matPlate;
    if (t.id === 'rusher') {
      // 冲锋枪：短小精悍
      box(pivot, 0.07, 0.1, 0.46, 0.26, 1.16, 0.42, gunMat);
      box(pivot, 0.05, 0.16, 0.07, 0.26, 1.02, 0.36, gunMat);
      box(pivot, 0.06, 0.05, 0.16, 0.26, 1.22, 0.2, gunMat2);
      box(pivot, 0.03, 0.03, 0.1, 0.26, 1.19, 0.66, this.matAccent);
    } else if (t.id === 'rifleman') {
      // 步枪
      box(pivot, 0.07, 0.1, 0.78, 0.26, 1.18, 0.5, gunMat);
      box(pivot, 0.05, 0.2, 0.09, 0.26, 1.0, 0.42, gunMat);
      box(pivot, 0.06, 0.06, 0.2, 0.26, 1.25, 0.28, gunMat2);
      box(pivot, 0.05, 0.06, 0.22, 0.26, 1.24, 0.92, gunMat2);
      box(pivot, 0.03, 0.03, 0.12, 0.26, 1.22, 1.02, this.matAccent);
    } else if (t.id === 'heavy') {
      // 机枪：粗枪管 + 弹箱 + 两脚架
      box(pivot, 0.11, 0.14, 0.9, 0.24, 1.16, 0.55, gunMat);
      box(pivot, 0.16, 0.16, 0.22, 0.24, 1.06, 0.3, gunMat);
      box(pivot, 0.09, 0.09, 0.4, 0.24, 1.2, 1.0, gunMat2);
      box(pivot, 0.05, 0.22, 0.05, 0.24, 0.98, 0.9, gunMat2);
      box(pivot, 0.05, 0.22, 0.05, 0.24, 0.98, 0.72, gunMat2);
      box(pivot, 0.05, 0.05, 0.16, 0.24, 1.26, 0.24, this.matAccent);
    } else if (t.id === 'sniper') {
      // 狙击枪：长枪管 + 瞄准镜
      box(pivot, 0.06, 0.09, 1.15, 0.24, 1.18, 0.62, gunMat);
      box(pivot, 0.05, 0.18, 0.08, 0.24, 1.02, 0.3, gunMat);
      var scope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), gunMat2);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.24, 1.3, 0.5);
      pivot.add(scope);
      box(pivot, 0.03, 0.03, 0.1, 0.24, 1.3, 0.72, this.matEye);
    }

    this.torso.userData.enemy = this; this.torso.userData.part = 'body';
    this.head.userData.enemy = this; this.head.userData.part = 'head';
    this.legL.userData.enemy = this; this.legL.userData.part = 'body';
    this.legR.userData.enemy = this; this.legR.userData.part = 'body';
    this.hitMeshes = [this.torso, this.head, this.legL, this.legR];

    var topY = this.height + 0.5;
    var tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.16),
      new THREE.MeshBasicMaterial({ color: t.color, depthWrite: false, transparent: true, opacity: 0.95 })
    );
    tag.position.set(0, topY + 0.26, 0);
    root.add(tag);
    this.tagMesh = tag;

    var bar = new THREE.Group();
    bar.position.set(0, topY, 0);
    var barBgMat = new THREE.MeshBasicMaterial({ color: 0x0a0e14, transparent: true, opacity: 0.8, depthWrite: false });
    bar.add(new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.11), barBgMat));
    var barFillMat = new THREE.MeshBasicMaterial({ color: t.color, depthWrite: false, transparent: true });
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.07), barFillMat);
    this.barFill.position.z = 0.002;
    bar.add(this.barFill);
    this.barGroup = bar;
    this.barWidth = 0.88;
    this.materials.push(barBgMat, barFillMat);
    root.add(bar);

    if (t.laser) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      this.laserLine = new THREE.Line(geo, this.matLaser);
      this.laserLine.visible = false;
      this.laserLine.frustumCulled = false;
      this.scene.add(this.laserLine);
    }

    root.scale.setScalar(0.15 * this.baseScale);
    this.scene.add(root);
    this.root = root;
    this.pivot = pivot;
    // 机器人整体收窄 30%（只压 X/Z 轴，身高不变）
    pivot.scale.set(0.7, 1, 0.7);
  };

  Bot.prototype.getPosition = function () { return this.root.position; };

  /* ------------------------------------------------------------- 受伤 */
  Bot.prototype.takeDamage = function (amount, point, dir, isHead, attacker) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 1;
    this.stagger = Math.max(this.stagger, isHead ? 0.2 : 0.08);
    if (this.health <= 0) {
      this.die(dir, isHead, attacker);
    } else {
      if (this.squad) this.squad.alert(this.manager.playerPos, this);
      this.hasLOS = true;
      this.losTimer = 0.15;
    }
  };

  Bot.prototype.die = function (dir, isHead, attacker) {
    if (this.dead) return;
    this.dead = true;
    this.state = 'dead';
    var p = this.root.position;
    this.effects.explosion(new THREE.Vector3(p.x, p.y + 1.2, p.z), this.type.eye, 1.05);
    Sound.kill();
    if (this.squad) this.squad.removeMember(this);
    if (this.manager.onKill) this.manager.onKill(this, isHead, attacker);
    this.remove();
  };

  Bot.prototype.remove = function () {
    if (this.laserLine) this.scene.remove(this.laserLine);
    this.scene.remove(this.root);
    this.root.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    for (var i = 0; i < this.materials.length; i++) this.materials[i].dispose();
    this.hitMeshes = [];
    this.manager = null;
  };

  /* ------------------------------------------------------------- 每帧 */
  Bot.prototype.update = function (dt, player, camera) {
    if (this.dead) return;

    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      var t = 1 - Utils.clamp(this.spawnTimer / 0.5, 0, 1);
      this.root.scale.setScalar(Utils.lerp(0.15, 1, t * (2 - t)) * this.baseScale);
      if (this.spawnTimer <= 0) {
        this.state = 'patrol';
        this.root.scale.setScalar(this.baseScale);
      }
      this._visuals(dt, camera);
      return;
    }

    var pos = this.root.position;
    var toPlayerX = player.pos.x - pos.x;
    var toPlayerZ = player.pos.z - pos.z;
    var distToPlayer = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.14;
      this.hasLOS = this._checkLOS(player, distToPlayer);
    }
    if (this.hasLOS && this.squad) this.squad.alert(player.pos, this);

    var goal = this._goal(player, distToPlayer);
    this._follow(goal, dt, player, distToPlayer);
    this._combat(dt, player, distToPlayer);

    var faceX = this.hasLOS ? toPlayerX : (goal.x - pos.x);
    var faceZ = this.hasLOS ? toPlayerZ : (goal.z - pos.z);
    if (Math.abs(faceX) + Math.abs(faceZ) > 0.05) {
      var targetYaw = Math.atan2(faceX, faceZ);
      var d = ((targetYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += d * Math.min(1, dt * 7);
      this.pivot.rotation.y = this.yaw;
    }

    this._visuals(dt, camera);
  };

  Bot.prototype._goal = function (player, distToPlayer) {
    if (this.squad && this.squad.state === 'alert') {
      var lk = this.squad.lastKnown || player.pos;
      return {
        x: lk.x + Math.cos(this.squad.spreadAngle + this.offsetAngle) * this.squad.spreadRadius,
        z: lk.z + Math.sin(this.squad.spreadAngle + this.offsetAngle) * this.squad.spreadRadius
      };
    }
    var wp = this.squad ? this.squad.currentWaypoint() : this.world.botSpawnCenter;
    return {
      x: wp.x + Math.cos(this.offsetAngle) * 2.4,
      z: wp.z + Math.sin(this.offsetAngle) * 2.4
    };
  };

  Bot.prototype._follow = function (goal, dt, player, distToPlayer) {
    var pos = this.root.position;
    var inCombat = this.squad && this.squad.state === 'alert' && this.hasLOS
      && distToPlayer < this.type.desiredRange * 1.5;

    var desiredX = 0, desiredZ = 0;

    if (inCombat) {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = Utils.rand(0.9, 2.0); this.strafeDir *= -1; }
      var dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
      var d = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
      dx /= d; dz /= d;
      var want = this.type.desiredRange;
      var push = 0;
      if (d > want + 2) push = 1;
      else if (d < want - 2) push = -1;
      desiredX = dx * push - dz * this.strafeDir * 0.85;
      desiredZ = dz * push + dx * this.strafeDir * 0.85;
      this.path = null;
    } else {
      this.repathTimer -= dt;
      var goalMoved = Math.abs(goal.x - this.lastGoal.x) + Math.abs(goal.z - this.lastGoal.z);
      if (!this.path || this.repathTimer <= 0 || goalMoved > 4.5 || this.stuckTimer > 1.1) {
        this.repathTimer = Utils.rand(0.55, 1.1);
        this.lastGoal.x = goal.x; this.lastGoal.z = goal.z;
        this.path = this.nav.findPath(pos, { x: goal.x, z: goal.z });
        this.pathIndex = 0;
        this.stuckTimer = 0;
      }

      var wp = null;
      if (this.path && this.path.length) {
        if (this.pathIndex >= this.path.length) this.pathIndex = this.path.length - 1;
        wp = this.path[this.pathIndex];
        var wdx = wp.x - pos.x, wdz = wp.z - pos.z;
        if (Math.sqrt(wdx * wdx + wdz * wdz) < 1.3 && this.pathIndex < this.path.length - 1) {
          this.pathIndex++;
          wp = this.path[this.pathIndex];
        }
      }
      if (!wp) wp = goal;

      var dx2 = wp.x - pos.x, dz2 = wp.z - pos.z;
      var d2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
      if (d2 > 0.001) { desiredX = dx2 / d2; desiredZ = dz2 / d2; }
    }

    var sepX = 0, sepZ = 0;
    var list = this.manager.bots;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === this || o.dead) continue;
      var sx = pos.x - o.root.position.x, sz = pos.z - o.root.position.z;
      var sd = sx * sx + sz * sz;
      var minD = (this.radius + o.radius) * 1.9;
      if (sd < minD * minD && sd > 0.0001) {
        var inv = 1 / Math.sqrt(sd);
        sepX += sx * inv; sepZ += sz * inv;
      }
    }
    desiredX += sepX * 1.5;
    desiredZ += sepZ * 1.5;

    var dl = Math.sqrt(desiredX * desiredX + desiredZ * desiredZ);
    if (dl > 0.001) { desiredX /= dl; desiredZ /= dl; }

    var speed = this.type.speed * (this.stagger > 0 ? 0.2 : 1) * (this.charging ? 0.45 : 1);
    this.vel.x = Utils.damp(this.vel.x, desiredX * speed, 8, dt);
    this.vel.z = Utils.damp(this.vel.z, desiredZ * speed, 8, dt);
    this.vel.y -= 22 * dt;
    if (this.vel.y < -40) this.vel.y = -40;

    this.ctx.grounded = false;
    this.ctx.stepped = false;
    Collide.moveAxis(pos, this.vel.x * dt, 'x', this.ctx);
    Collide.moveAxis(pos, this.vel.z * dt, 'z', this.ctx);
    Collide.moveAxis(pos, this.vel.y * dt, 'y', this.ctx);
    if (this.ctx.grounded || this.ctx.stepped) { this.vel.y = 0; this.onGround = true; }
    else this.onGround = false;

    var moved = pos.distanceTo(this.lastPos);
    if (moved < 0.03 * dt * 60) this.stuckTimer += dt; else this.stuckTimer = 0;
    this.lastPos.copy(pos);

    if (this.stagger > 0) this.stagger -= dt;
    if (pos.y < -20) this.manager.despawn(this);
  };

  Bot.prototype._checkLOS = function (player, dist) {
    if (dist > this.type.attackRange * 1.15) return false;
    var from = this._losFrom.set(this.root.position.x, this.root.position.y + this.type.height - 0.25, this.root.position.z);
    var to = this._losTo.set(player.pos.x, player.pos.y + player.eyeHeight() - 0.1, player.pos.z);
    // 烟雾会挡住视线：看不见就不能开枪
    if (this.manager.gadgets && this.manager.gadgets.smokeBlocks(from, to)) return false;
    var dir = this._losDir.subVectors(to, from);
    var len = dir.length();
    if (len < 0.001) return true;
    dir.multiplyScalar(1 / len);
    this._losRay.set(from, dir);
    this._losRay.far = len - 0.35;
    return this._losRay.intersectObjects(this.world.meshes, false).length === 0;
  };

  /* ------------------------------------------------------------- 开火 */
  Bot.prototype._combat = function (dt, player, dist) {
    var t = this.type;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this._shoot(player);
        this.burstLeft--;
        this.burstTimer = t.burstGap;
      }
      return;
    }

    if (this.charging) {
      this.chargeTimer -= dt;
      if (t.laser && this.laserLine) this._updateLaser(player);
      if (this.chargeTimer <= 0) {
        this.charging = false;
        if (this.laserLine) this.laserLine.visible = false;
        this.burstLeft = t.burst;
        this.burstTimer = 0;
      }
      return;
    }

    var canSee = this.hasLOS && !player.dead;
    if (canSee && this.attackCooldown <= 0 && dist <= t.attackRange) {
      this.charging = true;
      this.chargeTimer = t.chargeTime;
      if (t.chargeTime > 0) Sound.enemyCharge();
    }
  };

  Bot.prototype._updateLaser = function (player) {
    var from = this._tmp.set(this.root.position.x, this.root.position.y + 1.5, this.root.position.z);
    var to = this._tmp2.set(player.pos.x, player.pos.y + player.eyeHeight() - 0.2, player.pos.z);
    var arr = this.laserLine.geometry.attributes.position.array;
    arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
    arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
    this.laserLine.geometry.attributes.position.needsUpdate = true;
    this.laserLine.visible = true;
    this.matLaser.opacity = 0.25 + Math.random() * 0.5;
  };

  Bot.prototype._shoot = function (player) {
    var t = this.type;
    var from = new THREE.Vector3(
      this.root.position.x + Math.sin(this.yaw) * 0.6,
      this.root.position.y + 1.35,
      this.root.position.z + Math.cos(this.yaw) * 0.6
    );
    var to = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeHeight() - 0.2, player.pos.z);
    var dir = new THREE.Vector3().subVectors(to, from).normalize();
    var sp = t.projSpread;
    dir.x += Utils.rand(-sp, sp);
    dir.y += Utils.rand(-sp, sp);
    dir.z += Utils.rand(-sp, sp);
    dir.normalize();

    this.manager.spawnProjectile(from, dir, t.damage, t.projSpeed, t.id);
    Sound.enemyShoot();
    this.kick = 0.14;
    if (this.burstLeft <= 1) this.attackCooldown = t.cooldown * Utils.rand(0.85, 1.2);
  };

  /* ------------------------------------------------------------- 视觉 */
  Bot.prototype._visuals = function (dt, camera) {
    this.barGroup.quaternion.copy(camera.quaternion);
    this.tagMesh.quaternion.copy(camera.quaternion);
    var ratio = Utils.clamp(this.health / this.maxHealth, 0, 1);
    this.barFill.scale.x = Math.max(0.001, ratio);
    this.barFill.position.x = -this.barWidth * (1 - ratio) / 2;
    this.barGroup.visible = ratio < 0.999;

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
      this.matBody.emissive.setHex(0xffffff);
      this.matBody.emissiveIntensity = this.hitFlash * 0.9;
      this.matPlate.emissive.setHex(0xffffff);
      this.matPlate.emissiveIntensity = this.hitFlash * 0.7;
    } else if (this.matBody.emissiveIntensity !== 0) {
      this.matBody.emissiveIntensity = 0;
      this.matPlate.emissiveIntensity = 0;
    }

    var charging = this.charging || this.burstLeft > 0;
    this.matEye.color.setHex(charging ? 0xfff0a0 : this.type.eye);
    this.matAccent.color.setHex(charging ? 0xfff0a0 : this.type.accent);

    var walk = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z) / 3;
    this.walkPhase += dt * (4 + walk * 8);
    var swing = Math.sin(this.walkPhase) * 0.3 * Utils.clamp(walk, 0, 1.2);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;

    if (this.kick > 0) this.kick = Utils.damp(this.kick, 0, 8, dt);
    this.torso.position.z = -this.kick * 0.5;
  };

  /* ===================================================================== */
  /*                              小队系统                                  */
  /* ===================================================================== */
  function Squad(manager, route, index) {
    this.manager = manager;
    this.route = route;
    this.index = index;
    this.members = [];
    this.wpIndex = 0;
    this.wpTimer = 0;
    this.state = 'patrol';
    this.alertTimer = 0;
    this.lastKnown = null;
    this.spreadAngle = Math.random() * Math.PI * 2;
    this.spreadRadius = 4.5;
  }

  Squad.prototype.currentWaypoint = function () {
    var pts = this.route.points;
    return pts[this.wpIndex % pts.length];
  };

  Squad.prototype.add = function (bot) {
    this.members.push(bot);
    bot.offsetAngle = (this.members.length - 1) / 4 * Math.PI * 2;
  };

  Squad.prototype.removeMember = function (bot) {
    var i = this.members.indexOf(bot);
    if (i >= 0) this.members.splice(i, 1);
  };

  /* 发现玩家：整队进入警戒，并呼叫附近的小队一起包夹 */
  Squad.prototype.alert = function (pos, from) {
    if (!pos) return;
    this.state = 'alert';
    this.alertTimer = 9;
    if (!this.lastKnown) this.lastKnown = { x: pos.x, z: pos.z };
    else { this.lastKnown.x = pos.x; this.lastKnown.z = pos.z; }
    this.spreadAngle += 0.02;

    var list = this.manager.squads;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s === this || s.state === 'alert') continue;
      var d = Math.hypot(s.centerX() - pos.x, s.centerZ() - pos.z);
      if (d < 55 && Math.random() < 0.75) s.alert(pos, from);
    }
  };

  Squad.prototype.centerX = function () {
    var s = 0, n = 0;
    for (var i = 0; i < this.members.length; i++) { s += this.members[i].root.position.x; n++; }
    return n ? s / n : 0;
  };
  Squad.prototype.centerZ = function () {
    var s = 0, n = 0;
    for (var i = 0; i < this.members.length; i++) { s += this.members[i].root.position.z; n++; }
    return n ? s / n : 0;
  };

  Squad.prototype.update = function (dt) {
    if (this.state === 'alert') {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) {
        this.state = 'patrol';
        this.lastKnown = null;
      }
      return;
    }
    this.wpTimer += dt;
    var wp = this.currentWaypoint();
    var near = 0;
    for (var i = 0; i < this.members.length; i++) {
      var p = this.members[i].root.position;
      if (Math.hypot(p.x - wp.x, p.z - wp.z) < 6) near++;
    }
    if ((this.members.length && near >= Math.ceil(this.members.length * 0.6)) || this.wpTimer > 26) {
      this.wpIndex = (this.wpIndex + 1) % this.route.points.length;
      this.wpTimer = 0;
    }
  };

  /* ===================================================================== */
  /*                             机器人管理器                               */
  /* ===================================================================== */
  function EnemyManager(scene, world, nav, effects) {
    this.scene = scene;
    this.world = world;
    this.nav = nav;
    this.effects = effects;

    this.bots = [];
    this.squads = [];
    this.projectiles = [];
    this.hitMeshes = [];

    this.maxBots = 8;
    this.running = true;
    this.kills = 0;
    this.headshots = 0;
    this.respawnTimer = 2.0;
    this.elapsed = 0;
    this.playerPos = { x: 0, z: 0 };
    this.pickups = null;

    this.onKill = null;
    this.onPlayerDamage = null;
    this.onPlayerKilled = null;
    this.onSpawn = null;

    this.projGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.projMats = {
      rusher: new THREE.MeshBasicMaterial({ color: 0xff9a3c }),
      rifleman: new THREE.MeshBasicMaterial({ color: 0x7fd8ff }),
      heavy: new THREE.MeshBasicMaterial({ color: 0xffd166 }),
      sniper: new THREE.MeshBasicMaterial({ color: 0xff5470 })
    };

    this.reset();   // 建好小队与状态，避免未初始化就被 update
  }

  EnemyManager.prototype.setMaxBots = function (n) {
    this.maxBots = Math.max(2, Math.min(20, n | 0));
  };

  EnemyManager.prototype.reset = function () {
    var i;
    for (i = this.bots.length - 1; i >= 0; i--) if (!this.bots[i].dead) this.bots[i].remove();
    for (i = this.projectiles.length - 1; i >= 0; i--) this.scene.remove(this.projectiles[i].mesh);
    this.bots = [];
    this.projectiles = [];
    this.hitMeshes = [];
    this.kills = 0;
    this.headshots = 0;
    this.elapsed = 0;
    this.respawnTimer = 2.0;
    this.squads = [];
    for (i = 0; i < this.world.routes.length; i++) {
      this.squads.push(new Squad(this, this.world.routes[i], i));
    }
    this.running = true;
  };

  EnemyManager.prototype.stop = function () { this.running = false; };

  EnemyManager.prototype.despawn = function (bot) {
    if (bot.squad) bot.squad.removeMember(bot);
    bot.dead = true;
    bot.remove();
  };

  EnemyManager.prototype._spawnBot = function () {
    var sp = this.world.pickSpawn(this.playerPos, 24);
    var pos = new THREE.Vector3(sp.x, sp.y + 0.05, sp.z);
    var typeId = pickType();

    var squad = this.squads[0];
    for (var i = 1; i < this.squads.length; i++) {
      if (this.squads[i].members.length < squad.members.length) squad = this.squads[i];
    }
    var bot = new Bot(this, typeId, pos, squad);
    squad.add(bot);
    this.bots.push(bot);
    this.effects.spawnBurst(pos, BOT_TYPES[typeId].color);
    Sound.spawn();
    if (this.onSpawn) this.onSpawn(bot);
    return bot;
  };

  EnemyManager.prototype.spawnProjectile = function (from, dir, damage, speed, typeId) {
    var mat = this.projMats[typeId] || this.projMats.rifleman;
    var mesh = new THREE.Mesh(this.projGeo, mat);
    mesh.position.copy(from);
    this.scene.add(mesh);

    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.glowTex, color: mat.color,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    var gs = typeId === 'sniper' ? 1.0 : 0.6;
    glow.scale.set(gs, gs, 1);
    mesh.add(glow);

    this.projectiles.push({
      mesh: mesh,
      vel: dir.clone().multiplyScalar(speed),
      damage: damage,
      kind: typeId,
      life: 3.0,
      prev: from.clone()
    });
  };

  EnemyManager.prototype._updateProjectiles = function (dt, player) {
    var playerBox = Collide.boxFromPoint(player.pos, player.radius + 0.1, player.height);
    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];
      p.life -= dt;
      p.prev.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 1.2 * dt;

      var gone = false;

      if (!player.dead) {
        var t = Collide.segmentAABB(p.prev, p.mesh.position, playerBox);
        if (t >= 0 && t <= 1) {
          var hp = p.prev.clone().lerp(p.mesh.position, t);
          var wasAlive = !player.dead;
          player.takeDamage(p.damage, p.vel);
          if (player.dead && wasAlive && this.onPlayerKilled) this.onPlayerKilled();
          this.effects.sparks(hp, p.vel.clone().negate().normalize(), 0xff5470, 8, 3);
          if (this.onPlayerDamage) this.onPlayerDamage(p.damage, p.kind);
          gone = true;
        }
      }

      if (!gone) {
        var boxes = this.world.colliders;
        for (var c = 0; c < boxes.length; c++) {
          var box = boxes[c];
          var t2 = Collide.segmentAABB(p.prev, p.mesh.position, box);
          if (t2 >= 0 && t2 <= 1) {
            var hpt = p.prev.clone().lerp(p.mesh.position, t2);
            this.effects.sparks(hpt, p.vel.clone().negate().normalize(), 0xffb04d, 5, 2.2);
            gone = true;
            break;
          }
        }
      }

      if (p.life <= 0 || gone) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  };

  EnemyManager.prototype.update = function (dt, player, camera) {
    this.playerPos = player.pos;
    if (!this.running) return;
    this.elapsed += dt;

    if (this.bots.length < this.maxBots) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this._spawnBot();
        this.respawnTimer = Utils.rand(1.2, 2.6);
      }
    } else {
      this.respawnTimer = 1.0;
    }

    var i;
    for (i = 0; i < this.squads.length; i++) this.squads[i].update(dt);

    for (i = this.bots.length - 1; i >= 0; i--) {
      var bot = this.bots[i];
      if (bot.dead) { this.bots.splice(i, 1); continue; }
      bot.update(dt, player, camera);
      if (bot.dead) this.bots.splice(i, 1);
    }

    this._updateProjectiles(dt, player);

    this.hitMeshes.length = 0;
    for (i = 0; i < this.bots.length; i++) {
      var arr = this.bots[i].hitMeshes;
      for (var j = 0; j < arr.length; j++) this.hitMeshes.push(arr[j]);
    }
  };

  FPS.BOT_TYPES = BOT_TYPES;
  FPS.Bot = Bot;
  FPS.Squad = Squad;
  FPS.EnemyManager = EnemyManager;
})(window.FPS);
