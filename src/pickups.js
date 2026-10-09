/* =======================================================================
 * pickups.js —— 地图道具
 *
 * 规则（按需求）：每 30 秒在地图某个区域刷新 1 个道具，道具存在 60 秒，
 * 玩家 60 秒内没捡走就消失。道具在小地图上显示为绿点。
 *
 *   医疗包  立刻回血 50
 *   伤害强化 20 秒内武器伤害 +60%
 *   速度强化 20 秒内移动速度 +40%
 *   弹跳强化 20 秒内跳跃高度 +42%
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils, Sound = FPS.Sound;

  var TYPES = {
    heal: {
      id: 'heal', name: '医疗包', color: 0x2bd67b, duration: 0, shape: 'box',
      desc: '立刻回复 50 点生命值'
    },
    damage: {
      id: 'damage', name: '伤害强化', color: 0xff5470, duration: 20, shape: 'octa',
      desc: '20 秒内武器伤害 +60%'
    },
    speed: {
      id: 'speed', name: '速度强化', color: 0x5fd8ff, duration: 20, shape: 'octa',
      desc: '20 秒内移动速度 +40%'
    },
    jump: {
      id: 'jump', name: '弹跳强化', color: 0xffd166, duration: 20, shape: 'octa',
      desc: '20 秒内跳跃更高'
    }
  };

  var TYPE_KEYS = ['heal', 'damage', 'speed', 'jump'];
  var SPAWN_WEIGHTS = [0.34, 0.24, 0.22, 0.20];

  /* 刷新区域：每个区域给几个候选点（保证不会刷到墙里） */
  var ZONES = [
    { name: 'A 包点', cols: [[26, 8], [29, 10], [25, 11]] },
    { name: 'B 包点', cols: [[5, 7], [8, 10], [4, 11]] },
    { name: '香蕉道', cols: [[4, 17], [5, 23], [4, 27]] },
    { name: '中路', cols: [[16, 16], [16, 24], [16, 13]] },
    { name: '公寓', cols: [[12, 8], [16, 8]] },
    { name: 'A 小道', cols: [[20, 12], [22, 12]] },
    { name: 'CT 出生点', cols: [[13, 2], [20, 2]] },
    { name: 'T 出生点', cols: [[11, 30], [20, 31]] },
    { name: '图书馆', cols: [[28, 5]] },
    { name: 'T 拱门', cols: [[25, 20], [25, 26]] }
  ];

  function PickupManager(scene, world, effects) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.items = [];
    this.timer = 6;          // 开局 6 秒先刷第一个
    this.interval = 30;      // 每 30 秒刷新一个
    this.lifetime = 60;      // 存在 60 秒
    this.onPickup = null;
    this._geoBox = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this._geoOcta = new THREE.OctahedronGeometry(0.36, 0);
    this._geoRing = new THREE.RingGeometry(0.55, 0.75, 20);
  }

  PickupManager.prototype.reset = function () {
    for (var i = this.items.length - 1; i >= 0; i--) this.scene.remove(this.items[i].mesh);
    this.items = [];
    this.timer = 6;
  };

  PickupManager.prototype._zonePoint = function () {
    for (var attempt = 0; attempt < 24; attempt++) {
      var zone = Utils.choose(ZONES);
      var cell = Utils.choose(zone.cols);
      var p = this.world.tileToWorld(cell[0], cell[1]);
      // 别和其他道具重叠
      var tooClose = false;
      for (var i = 0; i < this.items.length; i++) {
        if (Math.hypot(this.items[i].x - p.x, this.items[i].z - p.z) < 8) { tooClose = true; break; }
      }
      if (tooClose) continue;
      return { x: p.x, z: p.z, zone: zone.name };
    }
    var fallback = this.world.tileToWorld(16, 20);
    return { x: fallback.x, z: fallback.z, zone: '中路' };
  };

  PickupManager.prototype.spawnRandom = function () {
    var typeId = this._weightedType();
    var p = this._zonePoint();
    return this.spawn(typeId, p.x, p.z, p.zone);
  };

  PickupManager.prototype._weightedType = function () {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < TYPE_KEYS.length; i++) {
      acc += SPAWN_WEIGHTS[i];
      if (r <= acc) return TYPE_KEYS[i];
    }
    return 'heal';
  };

  PickupManager.prototype.spawn = function (typeId, x, z, zone) {
    var type = TYPES[typeId] || TYPES.heal;
    var geo = type.shape === 'box' ? this._geoBox : this._geoOcta;
    var mat = new THREE.MeshStandardMaterial({
      color: type.color, emissive: type.color, emissiveIntensity: 0.85,
      roughness: 0.32, metalness: 0.35
    });
    var mesh = new THREE.Mesh(geo, mat);
    var y = this.world._settleY(x, z) + 0.75;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.glowTex, color: type.color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75
    }));
    glow.scale.set(2.0, 2.0, 1);
    mesh.add(glow);

    var ring = new THREE.Mesh(this._geoRing, new THREE.MeshBasicMaterial({
      color: type.color, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, this.world._settleY(x, z) + 0.06, z);
    this.scene.add(ring);

    var item = {
      type: type, mesh: mesh, ring: ring, x: x, z: z, y: y,
      life: this.lifetime, phase: Math.random() * 6, zone: zone || ''
    };
    this.items.push(item);
    return item;
  };

  PickupManager.prototype.update = function (dt, player) {
    // 定时刷新
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      this.spawnRandom();
    }

    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      it.life -= dt;
      it.phase += dt * 2.4;
      it.mesh.rotation.y += dt * 1.4;
      it.mesh.position.y = it.y + Math.sin(it.phase) * 0.16;
      it.ring.scale.setScalar(1 + Math.sin(it.phase * 1.3) * 0.08);

      var dx = it.mesh.position.x - player.pos.x;
      var dz = it.mesh.position.z - player.pos.z;
      var dy = it.mesh.position.y - (player.pos.y + 0.9);
      var taken = (dx * dx + dz * dz < 2.4) && Math.abs(dy) < 2.2 && !player.dead;

      if (taken) {
        this._apply(it, player);
        this._remove(i);
      } else if (it.life <= 0) {
        this._remove(i);
      }
    }
  };

  PickupManager.prototype._apply = function (item, player) {
    var t = item.type;
    if (t.id === 'heal') {
      var healed = player.heal(50);
      if (this.onPickup) this.onPickup(t, healed);
    } else {
      player.buffs[t.id] = t.duration;
      if (this.onPickup) this.onPickup(t, 0);
    }
    Sound.pickup();
    this.effects.explosion(
      new THREE.Vector3(item.mesh.position.x, item.mesh.position.y, item.mesh.position.z),
      t.color, 0.6
    );
  };

  PickupManager.prototype._remove = function (index) {
    var it = this.items[index];
    this.scene.remove(it.mesh);
    this.scene.remove(it.ring);
    it.mesh.material.dispose();
    it.ring.material.dispose();
    this.items.splice(index, 1);
  };

  FPS.PICKUP_TYPES = TYPES;
  FPS.PickupManager = PickupManager;
})(window.FPS);
