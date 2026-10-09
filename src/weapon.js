/* =======================================================================
 * weapon.js —— 武器系统：步枪 / 狙击枪 / 机枪 / 霰弹枪 / 刀
 *
 * 移速系数（数值越大跑得越快）：
 *   步枪 80   狙击枪 60   机枪 60   霰弹枪 90   刀 150
 * 数字键 1 切主武器，数字键 3 切刀；复活时选择主武器。
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils, Sound = FPS.Sound;

  /* ------------------------------------------------------------- 武器数据 */
  var WEAPON_LIST = [
    {
      id: 'rifle', slot: 1, name: 'KX-7 突击步枪', short: '步枪', icon: '🔫',
      mag: 42, interval: 0.093, damage: 24, headMul: 4.0, pellets: 1,
      spread: 0.0016, spreadPerShot: 0.0032, maxSpread: 0.030, moveSpread: 0.011,
      reload: 2.2, speed: 80, range: 220, auto: true, recoil: 0.011, kick: 0.035,
      ads: { speed: 0.90, spread: 0.34, recoil: 1.0, fov: 62, sight: 0.088, hideModel: true },
      desc: '全能主力枪，42 发弹匣；右键机瞄提高精准度，移速 -10%'
    },
    {
      id: 'sniper', slot: 1, name: 'M-90 狙击枪', short: '狙击枪', icon: '🎯',
      mag: 15, interval: 0.44, damage: 230, headMul: 4.0, pellets: 1,
      spread: 0.0012, spreadPerShot: 0.02, maxSpread: 0.03, moveSpread: 0.02,
      reload: 2.1, speed: 60, range: 400, auto: false, recoil: 0.048, kick: 0.09,
      ads: { speed: 0.5, spread: 0.05, recoil: 0.5, fov: 20, scope: true, hideModel: true },
      desc: '右键开镜（开镜时隐藏枪身不挡视野），15 发弹匣，一枪一个'
    },
    {
      id: 'mg', slot: 1, name: 'M-249 机枪', short: '机枪', icon: '💥',
      mag: 150, interval: 0.075, damage: 19, headMul: 4.0, pellets: 1,
      spread: 0.0038, spreadPerShot: 0.0022, maxSpread: 0.055, moveSpread: 0.016,
      reload: 5.0, speed: 60, range: 240, auto: true, recoil: 0.008, kick: 0.028,
      ads: { speed: 0.60, spread: 0.40, recoil: 0.20, fov: 68, sight: 0.085, hideModel: true },
      desc: '150 发弹鼓；右键机瞄精准度提升、后坐力 -80%，移速 -40%'
    },
    {
      id: 'shotgun', slot: 1, name: 'SPAS-12 霰弹枪', short: '霰弹枪', icon: '🌟',
      mag: 18, interval: 0.43, damage: 20, headMul: 4.0, pellets: 15,
      spread: 0.052, spreadPerShot: 0.01, maxSpread: 0.07, moveSpread: 0.012,
      reload: 3.4, speed: 90, range: 45, auto: false, recoil: 0.035, kick: 0.07,
      ads: { speed: 0.9, spread: 0.3, recoil: 1.0, fov: 70, sight: 0.068, pellets: 6, hideModel: true },
      desc: '左键一次 15 颗弹丸；右键"聚焦射击"只打 6 颗但散布减少 70%'
    },
    {
      id: 'knife', slot: 3, name: '战术匕首', short: '刀', icon: '🔪',
      mag: Infinity, interval: 0.5, damage: 999, headMul: 4.0, pellets: 1,
      spread: 0, spreadPerShot: 0, maxSpread: 0, moveSpread: 0,
      reload: 0, speed: 150, range: 2.6, auto: false, recoil: 0.004, kick: 0.05,
      melee: true, desc: '移速最快，近身一刀毙命'
    }
  ];

  /* 投掷物与 C4（复用同一套切枪/换装备逻辑） */
  WEAPON_LIST.push({
    id: 'grenade', slot: 4, name: '破片手雷', short: '手雷', icon: '💣',
    mag: Infinity, interval: 0.9, damage: 0, headMul: 1, pellets: 0,
    spread: 0, spreadPerShot: 0, maxSpread: 0, moveSpread: 0,
    reload: 0, speed: 100, range: 0, auto: false, recoil: 0, kick: 0.02,
    throwable: true, count: 3, power: 17,
    desc: '按 4 切出，左键投掷；2.6 秒后爆炸，中心 120 / 边缘 60 的范围伤害'
  });
  WEAPON_LIST.push({
    id: 'smoke', slot: 9, name: '烟雾弹', short: '烟雾', icon: '🌫',
    mag: Infinity, interval: 0.9, damage: 0, headMul: 1, pellets: 0,
    spread: 0, spreadPerShot: 0, maxSpread: 0, moveSpread: 0,
    reload: 0, speed: 100, range: 0, auto: false, recoil: 0, kick: 0.02,
    throwable: true, smoke: true, count: 3, power: 13,
    desc: '按 E 切出，左键投掷；落地生成半径 6 米的浓烟，持续 18 秒'
  });
  WEAPON_LIST.push({
    id: 'c4', slot: 5, name: 'C4 炸弹', short: 'C4', icon: '🧨',
    mag: Infinity, interval: 0, damage: 0, headMul: 1, pellets: 0,
    spread: 0, spreadPerShot: 0, maxSpread: 0, moveSpread: 0,
    reload: 0, speed: 60, range: 0, auto: false, recoil: 0, kick: 0,
    plantable: true,
    desc: '按 5 切出；只能在 A / B 包点长按左键 4 秒下包，60 秒后爆炸'
  });

  function byId(id) {
    for (var i = 0; i < WEAPON_LIST.length; i++) if (WEAPON_LIST[i].id === id) return WEAPON_LIST[i];
    return WEAPON_LIST[0];
  }

  /* ===================================================================== */
  function WeaponSystem(camera, viewCamera, viewScene, world, effects) {
    this.camera = camera;
    this.viewCamera = viewCamera;
    this.viewScene = viewScene;
    this.world = world;
    this.effects = effects;

    this.defs = WEAPON_LIST;
    this.primaryId = 'rifle';     // 复活时选择的枪
    this.def = byId('rifle');
    this.mag = this.def.mag;
    this.fireTimer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.spread = 0;
    this.kick = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.shotsFired = 0;
    this.kills = 0;

    this.switchTimer = 0;
    this.switchDuration = 0.42;
    this.pendingDef = null;
    this.meleeSwing = 0;
    this.inspectTimer = 0;
    this.inspectDuration = 1.15;
    this.plantProgress = 0;
    this.items = { grenade: Infinity, smoke: Infinity };   // 无限投掷
    this.gadgets = null;          // 由 main 注入

    this.ads = 0;                 // 开镜插值 0..1
    this.adsHeld = false;

    this.getTargets = function () { return []; };
    this.onHit = null;
    this.onKill = null;
    this.onDryFire = null;
    this.onSwitch = null;
    this.onShoot = null;

    this._ray = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._muzzleWorld = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._bx = new THREE.Vector3();
    this._by = new THREE.Vector3();
    this._bz = new THREE.Vector3();

    this.models = {};
    this.group = new THREE.Group();
    this.viewCamera.add(this.group);
    this._equipModel(this.def, true);
  }

  /* ------------------------------------------------------------- 枪械模型 */
  WeaponSystem.prototype._materials = function () {
    if (this._mats) return this._mats;
    this._mats = {
      metal: new THREE.MeshStandardMaterial({ color: 0x4a545f, roughness: 0.38, metalness: 0.88 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x24292f, roughness: 0.66, metalness: 0.55 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.72, metalness: 0.05 }),
      accent: new THREE.MeshStandardMaterial({
        color: 0x57e0ff, emissive: 0x2ea8cc, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4
      }),
      blade: new THREE.MeshStandardMaterial({ color: 0xd8e4ec, roughness: 0.16, metalness: 1.0 }),
      scope: new THREE.MeshStandardMaterial({
        color: 0x1d2a30, emissive: 0x2ad4ff, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.7
      })
    };
    return this._mats;
  };

  WeaponSystem.prototype._model = function (id) {
    if (this.models[id]) return this.models[id];
    var m = this._materials();
    var gun = new THREE.Group();

    function part(parent, w, h, d, x, y, z, mat, rx, ry, rz) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
      parent.add(mesh);
      return mesh;
    }
    function cyl(parent, r1, r2, h, x, y, z, mat, rx) {
      var mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), mat);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      parent.add(mesh);
      return mesh;
    }

    var muzzleZ = -0.6;

    if (id === 'rifle') {
      part(gun, 0.072, 0.096, 0.44, 0, 0, -0.02, m.metal);
      part(gun, 0.05, 0.022, 0.34, 0, 0.058, -0.06, m.dark);
      part(gun, 0.038, 0.038, 0.44, 0, 0.012, -0.45, m.dark);
      part(gun, 0.054, 0.054, 0.075, 0, 0.012, -0.70, m.metal);
      part(gun, 0.062, 0.068, 0.26, 0, 0.004, -0.28, m.metal);
      part(gun, 0.052, 0.185, 0.07, 0, -0.14, -0.045, m.dark, 0.16);
      part(gun, 0.052, 0.145, 0.062, 0, -0.10, 0.105, m.dark, -0.22);
      part(gun, 0.062, 0.086, 0.24, 0, 0.0, 0.26, m.dark);
      part(gun, 0.026, 0.048, 0.042, 0, 0.088, -0.42, m.metal);
      part(gun, 0.024, 0.042, 0.04, 0, 0.086, 0.10, m.metal);
      part(gun, 0.006, 0.013, 0.30, 0.037, 0.006, -0.12, m.accent);
      part(gun, 0.006, 0.013, 0.30, -0.037, 0.006, -0.12, m.accent);
      muzzleZ = -0.74;

    } else if (id === 'sniper') {
      part(gun, 0.068, 0.09, 0.5, 0, 0, 0.02, m.dark);
      part(gun, 0.034, 0.034, 0.82, 0, 0.012, -0.62, m.metal);
      part(gun, 0.05, 0.05, 0.1, 0, 0.012, -1.05, m.dark);
      var scope = cyl(gun, 0.052, 0.052, 0.44, 0, 0.10, -0.18, m.scope, Math.PI / 2);
      scope.rotation.z = 0;
      part(gun, 0.03, 0.03, 0.06, 0, 0.058, -0.02, m.metal);
      part(gun, 0.03, 0.03, 0.06, 0, 0.058, -0.34, m.metal);
      part(gun, 0.06, 0.12, 0.30, 0, -0.03, 0.32, m.wood);
      part(gun, 0.05, 0.16, 0.062, 0, -0.11, 0.02, m.dark, -0.2);
      part(gun, 0.05, 0.06, 0.12, 0, -0.07, -0.22, m.dark);
      // 两脚架
      part(gun, 0.018, 0.16, 0.018, 0.05, -0.10, -0.52, m.metal, 0, 0, 0.3);
      part(gun, 0.018, 0.16, 0.018, -0.05, -0.10, -0.52, m.metal, 0, 0, -0.3);
      part(gun, 0.006, 0.013, 0.4, 0.036, 0.006, -0.3, m.accent);
      muzzleZ = -1.12;

    } else if (id === 'mg') {
      part(gun, 0.095, 0.12, 0.5, 0, 0, 0.0, m.metal);
      part(gun, 0.055, 0.055, 0.7, 0, 0.02, -0.55, m.dark);
      part(gun, 0.07, 0.07, 0.16, 0, 0.02, -0.92, m.metal);
      // 散热孔
      for (var i = 0; i < 5; i++) {
        part(gun, 0.062, 0.012, 0.03, 0, 0.02, -0.42 - i * 0.08, m.dark);
      }
      // 弹鼓
      var drum = cyl(gun, 0.16, 0.16, 0.12, 0.02, -0.16, -0.02, m.dark, 0);
      drum.rotation.z = Math.PI / 2;
      part(gun, 0.08, 0.10, 0.26, 0, 0.0, 0.30, m.dark);
      part(gun, 0.06, 0.14, 0.07, 0, -0.11, 0.12, m.dark, -0.2);
      part(gun, 0.03, 0.05, 0.05, 0, 0.085, -0.60, m.metal);
      part(gun, 0.018, 0.14, 0.018, 0.07, -0.12, -0.62, m.metal, 0, 0, 0.35);
      part(gun, 0.018, 0.14, 0.018, -0.07, -0.12, -0.62, m.metal, 0, 0, -0.35);
      part(gun, 0.006, 0.015, 0.4, 0.049, 0.006, -0.35, m.accent);
      muzzleZ = -1.0;

    } else if (id === 'shotgun') {
      part(gun, 0.078, 0.09, 0.46, 0, 0, 0.0, m.dark);
      part(gun, 0.05, 0.05, 0.5, 0, 0.03, -0.46, m.metal);
      part(gun, 0.04, 0.04, 0.42, 0, -0.03, -0.44, m.dark);   // 弹管
      part(gun, 0.062, 0.055, 0.18, 0, -0.01, -0.26, m.wood);  // 前护木
      part(gun, 0.06, 0.1, 0.30, 0, -0.02, 0.30, m.wood);      // 枪托
      part(gun, 0.054, 0.135, 0.06, 0, -0.10, 0.10, m.wood, -0.22);
      part(gun, 0.026, 0.03, 0.03, 0, 0.068, -0.66, m.metal);
      part(gun, 0.006, 0.013, 0.3, 0.041, 0.01, -0.4, m.accent);
      muzzleZ = -0.72;

    } else if (id === 'grenade') {
      var ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.dark);
      ball.position.set(0, 0, 0);
      gun.add(ball);
      part(gun, 0.05, 0.05, 0.09, 0, 0.1, 0, m.metal);
      part(gun, 0.07, 0.02, 0.07, 0, 0.14, 0, m.accent);
      muzzleZ = -0.2;

    } else if (id === 'smoke') {
      var can = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 10), m.metal);
      can.rotation.z = Math.PI / 2;
      can.position.set(0, 0, 0);
      gun.add(can);
      part(gun, 0.06, 0.06, 0.1, 0, 0, 0.02, m.accent);
      muzzleZ = -0.2;

    } else if (id === 'c4') {
      part(gun, 0.36, 0.22, 0.16, 0, 0, 0, m.dark);
      part(gun, 0.16, 0.1, 0.05, -0.06, 0.03, 0.09, m.metal);
      part(gun, 0.05, 0.05, 0.03, 0.1, 0.06, 0.09, m.accent);
      part(gun, 0.4, 0.03, 0.03, 0, -0.1, 0, m.metal);
      muzzleZ = -0.2;

    } else { // knife
      part(gun, 0.03, 0.035, 0.14, 0, -0.01, 0.10, m.dark);    // 刀柄
      part(gun, 0.055, 0.02, 0.04, 0, 0.005, 0.03, m.metal);   // 护手
      var blade = part(gun, 0.045, 0.012, 0.34, 0, 0.012, -0.16, m.blade);
      blade.geometry = new THREE.BoxGeometry(0.045, 0.012, 0.34);
      part(gun, 0.02, 0.006, 0.16, 0, 0.012, -0.38, m.blade);
      part(gun, 0.006, 0.006, 0.1, 0.026, 0.006, -0.05, m.accent);
      muzzleZ = -0.4;
    }

    var muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.012, muzzleZ);
    gun.add(muzzle);

    var flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.glowTex, color: 0xffd08a, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0
    }));
    flash.scale.set(0.34, 0.34, 1);
    flash.position.copy(muzzle.position);
    gun.add(flash);

    gun.traverse(function (o) { o.renderOrder = 10; });
    gun.userData.muzzle = muzzle;
    gun.userData.flash = flash;
    this.models[id] = gun;
    return gun;
  };

  WeaponSystem.prototype._equipModel = function (def, immediate) {
    var model = this._model(def.id);
    if (this.activeModel) this.group.remove(this.activeModel);
    this.group.add(model);
    this.activeModel = model;
    this.muzzle = model.userData.muzzle;
    this.flashSprite = model.userData.flash;
    this.flashTimer = 0;

    this.basePos = {
      rifle: new THREE.Vector3(0.235, -0.235, -0.60),
      sniper: new THREE.Vector3(0.225, -0.235, -0.52),
      mg: new THREE.Vector3(0.25, -0.25, -0.58),
      shotgun: new THREE.Vector3(0.235, -0.24, -0.56),
      knife: new THREE.Vector3(0.22, -0.26, -0.42)
    }[def.id] || new THREE.Vector3(0.235, -0.235, -0.6);
    // 机瞄位置：把枪上的准星抬到屏幕正中
    if (def.throwable || def.plantable) {
      this.adsPos = new THREE.Vector3(0.16, -0.22, -0.40);
    } else if (def.ads && def.ads.sight) {
      this.adsPos = new THREE.Vector3(0, -def.ads.sight, -0.44);
    } else {
      this.adsPos = new THREE.Vector3(0, -0.10, -0.44);
    }

    if (immediate) {
      this.group.position.copy(this.basePos);
      this.group.rotation.set(0.012, 0.05, 0);
    }
  };

  /* ------------------------------------------------------------- 切换武器 */
  WeaponSystem.prototype.defForSlot = function (slot) {
    if (slot === 3) return byId('knife');
    if (slot === 4) return byId('grenade');
    if (slot === 5) return byId('c4');
    if (slot === 9) return byId('smoke');
    if (slot === 1) return byId(this.primaryId);
    return null;
  };

  WeaponSystem.prototype.selectSlot = function (slot, instant) {
    var def = this.defForSlot(slot);
    if (!def) return false;
    // 正在切换途中也允许立即切到另一个装备（手雷/烟雾/C4 随时可用）
    if (def.id === this.def.id && !this.pendingDef) return false;
    if (this.pendingDef && def.id === this.pendingDef.id) return true;
    if (instant) {
      this.def = def;
      this.mag = def.mag;
      this.reloading = false;
      this.reloadTimer = 0;
      this.switchTimer = 0;
      this.pendingDef = null;
      this._equipModel(def, true);
      return true;
    }
    this.pendingDef = def;
    this.switchTimer = this.switchDuration;
    this.reloading = false;
    this.reloadTimer = 0;
    Sound.reloadOut();
    return true;
  };

  WeaponSystem.prototype.setPrimary = function (id, instant) {
    this.primaryId = byId(id).id;
    this.def = byId(id);
    this.mag = this.def.mag;
    this.reloading = false;
    this.reloadTimer = 0;
    this.switchTimer = 0;
    this.pendingDef = null;
    this._equipModel(this.def, true);
    if (this.onSwitch) this.onSwitch(this.def);
  };

  /* ------------------------------------------------------------- 换弹 */
  WeaponSystem.prototype.startReload = function () {
    if (this.def.melee || this.reloading || this.mag >= this.def.mag) return false;
    if (this.switchTimer > 0 || this.pendingDef) return false;
    this.reloading = true;
    this.reloadTimer = this.def.reload;
    Sound.reloadOut();
    return true;
  };

  /* ------------------------------------------------------------- 开火 */
  WeaponSystem.prototype.currentSpread = function () {
    var moving = Utils.clamp(this._moveRatio || 0, 0, 1);
    var adsSpread = (this.def.ads && this.def.ads.spread) || 0.3;
    var adsMul = Utils.lerp(1, adsSpread, this.ads);
    return (this.def.spread + this.spread + this.def.moveSpread * moving) * adsMul;
  };

  /* 当前应该使用的视野（机瞄/开镜会拉近） */
  WeaponSystem.prototype.adsFov = function (baseFov) {
    var target = (this.def.ads && this.def.ads.fov) || baseFov;
    return Utils.lerp(baseFov, target, this.ads);
  };

  WeaponSystem.prototype.isScoped = function () {
    return !!(this.def.ads && this.def.ads.scope && this.ads > 0.55);
  };

  WeaponSystem.prototype._computeMuzzleWorld = function (out) {
    var cam = this.camera;
    cam.updateMatrixWorld(true);
    cam.getWorldPosition(out);
    cam.matrixWorld.extractBasis(this._bx, this._by, this._bz);
    this._bz.negate();
    var p = this.basePos;
    out.addScaledVector(this._bx, p.x * (1 - this.ads * 0.9));
    out.addScaledVector(this._by, p.y);
    out.addScaledVector(this._bz, -p.z + this.kick * 0.2);
    return out;
  };

  WeaponSystem.prototype.tryFire = function (player) {
    if (this.reloading || this.switchTimer > 0 || this.pendingDef) return false;
    if (this.fireTimer > 0) return false;
    var def = this.def;

    /* 投掷物：手雷 / 烟雾弹 */
    if (def.throwable) {
      if ((this.items[def.id] || 0) <= 0) {     // 无限投掷时永远为真
        Sound.dryFire();
        this.fireTimer = 0.4;
        return false;
      }
      if (!this.gadgets) return false;
      this.items[def.id]--;
      this.fireTimer = def.interval;
      this.inspectTimer = 0;
      var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      var origin = new THREE.Vector3();
      this._computeMuzzleWorld(origin);
      this.gadgets.throwItem(def.smoke ? 'smoke' : 'grenade', origin, dir, def.power);
      this.selectSlot(1);                 // 掷出后自动切回主武器
      return true;
    }

    /* C4：长按左键下包，由 update 处理 */
    if (def.plantable) return false;

    if (!def.melee && this.mag <= 0) {
      this.fireTimer = 0.3;
      Sound.dryFire();
      this.startReload();
      return false;
    }

    this.fireTimer = def.interval;
    if (!def.melee) this.mag--;
    this.shotsFired++;
    this.inspectTimer = 0;               // 射击会中断检视
    this._computeMuzzleWorld(this._muzzleWorld);
    this.camera.getWorldPosition(this._origin);

    if (def.melee) this._melee(player);
    else this._shoot(player);

    // 近战武器不喷枪口火光
    if (!def.melee) {
      this.effects.muzzleFlash(this._muzzleWorld, this._dir);
      this.flashTimer = 0.05;
    }
    if (this.onShoot) this.onShoot(def);
    return true;
  };

  WeaponSystem.prototype._shoot = function (player) {
    var def = this.def;
    Sound.shoot();

    var spread = this.currentSpread();
    // 霰弹枪右键"聚焦射击"：弹丸变少但更集中
    var pellets = def.pellets;
    if (def.ads && def.ads.pellets && this.ads > 0.5) pellets = def.ads.pellets;
    var targets = this.getTargets();
    var closest = null;

    for (var p = 0; p < pellets; p++) {
      this._dir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      if (spread > 0) {
        this._dir.x += Utils.rand(-1, 1) * spread;
        this._dir.y += Utils.rand(-1, 1) * spread;
        this._dir.z += Utils.rand(-1, 1) * spread;
        this._dir.normalize();
      }
      this._ray.set(this._origin, this._dir);
      this._ray.far = def.range;

      var hits = this._ray.intersectObjects(targets, false);
      var hit = hits.length ? hits[0] : null;
      var endPoint;

      if (hit) {
        endPoint = hit.point;
        var enemy = hit.object.userData.enemy;
        if (enemy) {
          var isHead = hit.object.userData.part === 'head';
          var dmg = def.damage * (isHead ? def.headMul : 1) * player.damageMultiplier();
          enemy.takeDamage(dmg, hit.point, this._dir, isHead, player);
          this.effects.hitEnemy(hit.point, this._dir.clone().negate(), isHead ? 0xffd166 : 0x7ff0ff);
          // 头顶飘伤害数字
          var ep = enemy.getPosition();
          this.effects.damageNumber(
            new THREE.Vector3(ep.x, ep.y + (enemy.height || 1.9) + 0.5, ep.z),
            Math.round(dmg), isHead
          );
          if (this.onHit) this.onHit(enemy, isHead, dmg);
        } else {
          if (hit.face) this._normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          else this._normal.copy(this._dir).negate();
          this.effects.impact(hit.point, this._normal, 0xffc46b);
        }
      } else {
        endPoint = this._tmp.copy(this._origin).addScaledVector(this._dir, def.range);
      }

      if (p === 0 || !closest) {
        closest = endPoint.clone();
      }
      this.effects.tracer(this._muzzleWorld, endPoint, def.id === 'sniper' ? 0xa8f0ff : 0xffe3a0);
    }

    // 后坐力（机瞄/开镜会明显降低后坐）
    var adsMul = Utils.lerp(1, (def.ads && def.ads.recoil) || 1, this.ads);
    player.addRecoil(def.recoil * adsMul * (0.85 + Math.random() * 0.3),
      Utils.rand(-0.0035, 0.0035) * adsMul);
    this.kick = Math.min(0.11, this.kick + def.kick);
    this.spread = Math.min(def.maxSpread, this.spread + def.spreadPerShot);
  };

  /* 近战：范围 + 角度判定，命中即秒杀 */
  WeaponSystem.prototype._melee = function (player) {
    Sound.reloadIn();
    this.meleeSwing = 1;
    var def = this.def;
    var targets = this.getTargets();
    var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    var origin = this._origin;
    var best = null, bestDist = Infinity;

    for (var i = 0; i < targets.length; i++) {
      var mesh = targets[i];
      var enemy = mesh.userData.enemy;
      if (!enemy || enemy.dead) continue;
      var wp = enemy.getPosition();
      var dx = wp.x - origin.x, dz = wp.z - origin.z;
      var dy = (wp.y + 1.2) - origin.y;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > def.range) continue;
      var dot = (dx * fwd.x + dz * fwd.z) / Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
      if (dot < 0.35) continue;
      if (dist < bestDist) { bestDist = dist; best = enemy; }
    }

    if (best) {
      var point = best.getPosition().clone();
      point.y += 1.3;
      best.takeDamage(def.damage, point, fwd, true, player);
      this.effects.hitEnemy(point, fwd.clone().negate(), 0xff9a3c);
      if (this.onHit) this.onHit(best, true, def.damage);
      Sound.headshot();
    }
  };

  /* ------------------------------------------------------------- 每帧更新 */
  WeaponSystem.prototype.update = function (dt, player, input) {
    var def = this.def;
    this._moveRatio = Utils.clamp(player.speed / 6.5, 0, 1.4);
    // 移速系数随武器变化（步枪 0.8 / 狙击 0.6 / 机枪 0.6 / 霰弹 0.9 / 刀 1.5）
    player.moveSpeedRatio = def.speed / 100;

    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.switchTimer > 0) {
      this.switchTimer -= dt;
      if (this.switchTimer <= 0 && this.pendingDef) {
        this.def = this.pendingDef;
        this.mag = this.def.mag;
        this.pendingDef = null;
        this._equipModel(this.def, true);
        if (this.onSwitch) this.onSwitch(this.def);
      }
    }

    // 开镜
    this.adsHeld = !!(input.ads && def.ads && this.switchTimer <= 0 && !this.pendingDef && !player.dead);
    this.ads = Utils.damp(this.ads, this.adsHeld ? 1 : 0, 12, dt);
    player.adsSpeedMul = def.ads ? Utils.lerp(1, def.ads.speed, this.ads) : 1;

    // 开火：全自动按住连发，半自动点射
    var wantFire = input.fire;
    if (wantFire && (def.auto || input.firePressed) && !this.reloading) {
      this.tryFire(player);
    }

    // F 键检视武器（射击会中断检视）
    if (input.inspect && this.inspectTimer <= 0 && !this.reloading &&
        this.switchTimer <= 0 && !this.pendingDef && !player.dead) {
      this.inspectTimer = this.inspectDuration;
    }
    if (this.inspectTimer > 0) this.inspectTimer -= dt;

    // C4 下包：站在 A/B 包点长按左键 4 秒
    if (def.plantable) {
      var canPlant = this.gadgets && !this.gadgets.c4 &&
        this.gadgets.canPlantC4(player.pos) && !player.dead;
      if (input.fire && canPlant) {
        this.plantProgress += dt;
        if (this.plantProgress >= FPS.C4_CFG.plantTime) {
          this.gadgets.plantC4(player.pos);
          this.plantProgress = 0;
          this.selectSlot(1);
        }
      } else {
        this.plantProgress = 0;
      }
    } else {
      this.plantProgress = 0;
    }

    // 换弹
    if (this.reloading) {
      var prev = this.reloadTimer;
      this.reloadTimer -= dt;
      if (prev > def.reload * 0.45 && this.reloadTimer <= def.reload * 0.45) Sound.reloadIn();
      if (this.reloadTimer <= 0) {
        this.mag = def.mag;
        this.reloading = false;
        this.reloadTimer = 0;
      }
    }

    this.spread = Utils.damp(this.spread, 0, 6.5, dt);
    this.kick = Utils.damp(this.kick, 0, 10, dt);
    this.swayX = Utils.damp(this.swayX, 0, 8, dt);
    this.swayY = Utils.damp(this.swayY, 0, 8, dt);
    if (this.meleeSwing > 0) this.meleeSwing = Math.max(0, this.meleeSwing - dt * 3.2);

    // 枪口火光
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flashSprite.material.opacity = Utils.clamp(this.flashTimer / 0.05, 0, 1) * 0.5;
      var fs = (def.id === 'shotgun' ? 0.34 : 0.2) + Math.random() * 0.1;
      this.flashSprite.scale.set(fs, fs, 1);
    } else {
      this.flashSprite.material.opacity = 0;
    }

    /* ---------------- 视角模型姿态 ---------------- */
    var t = performance.now() * 0.001;
    var speedRatio = Utils.clamp(player.speed / 6.5, 0, 1.6);
    var bobX = Math.sin(player.bobPhase) * 0.012 * speedRatio * (1 - this.ads * 0.8);
    var bobY = Math.abs(Math.cos(player.bobPhase)) * 0.010 * speedRatio * (1 - this.ads * 0.8);
    var breatheX = Math.sin(t * 1.3) * 0.0035;
    var breatheY = Math.cos(t * 1.7) * 0.003;

    var reloadDrop = 0, reloadRot = 0;
    if (this.reloading) {
      var pr = 1 - this.reloadTimer / def.reload;
      var curve = Math.sin(Math.PI * Utils.clamp(pr * 1.15, 0, 1));
      reloadDrop = curve * 0.14;
      reloadRot = curve * 0.85;
    }

    var switchDrop = 0;
    if (this.switchTimer > 0) {
      switchDrop = Math.sin(Math.PI * (1 - this.switchTimer / this.switchDuration)) * 0.28;
    }

    var meleeRot = this.meleeSwing > 0 ? Math.sin(this.meleeSwing * Math.PI) * 1.1 : 0;
    var crouchDrop = player.crouching ? 0.012 : 0;
    var adsT = this.ads;

    /* 检视动画：抬枪 → 转一圈 → 放回 */
    var inspLift = 0, inspSpin = 0, inspTilt = 0;
    if (this.inspectTimer > 0) {
      var ip = 1 - this.inspectTimer / this.inspectDuration;   // 0 -> 1
      var ease = Math.sin(Math.PI * Utils.clamp(ip, 0, 1));
      inspLift = ease * 0.16;
      inspSpin = Math.PI * 2 * ip;
      inspTilt = ease * 0.5;
    }

    var px = Utils.lerp(this.basePos.x, this.adsPos.x, adsT) + bobX + breatheX * (1 - adsT) + this.swayX;
    var py = Utils.lerp(this.basePos.y, this.adsPos.y, adsT) + bobY + breatheY * (1 - adsT)
      + reloadDrop - switchDrop - crouchDrop - this.kick * 0.12 + inspLift;
    var pz = Utils.lerp(this.basePos.z, this.adsPos.z, adsT) + this.kick * 0.16;

    this.group.position.set(px, py, pz);
    this.group.rotation.set(
      0.012 + reloadRot * 0.5 + this.kick * 1.4 + meleeRot * 0.5 - switchDrop * 1.2 - inspTilt,
      0.05 * (1 - adsT) + this.swayX * 1.4 + meleeRot * 0.4 + inspSpin,
      0.0 + reloadRot - this.swayX * 2.0 + meleeRot * 0.7 + inspTilt * 0.8
    );

    // 开镜到一定程度隐藏枪身，避免瞄准镜挡住屏幕中央
    var hideModel = !!(def.ads && def.ads.hideModel) && this.ads > 0.55;
    this.group.visible = !hideModel;
  };

  WeaponSystem.prototype.onLookInput = function (dx, dy) {
    var mul = this.ads > 0.5 ? 0.35 : 1;
    this.swayX = Utils.clamp(this.swayX - dx * 0.00022 * mul, -0.05, 0.05);
    this.swayY = Utils.clamp(this.swayY - dy * 0.00016 * mul, -0.05, 0.05);
  };

  WeaponSystem.prototype.reset = function () {
    this.setPrimary(this.primaryId, true);
    this.spread = 0;
    this.kick = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.fireTimer = 0;
    this.ads = 0;
    this.shotsFired = 0;
  };

  WeaponSystem.prototype.hudInfo = function () {
    return {
      name: this.def.name,
      short: this.def.short,
      mag: this.mag,
      magSize: this.def.mag,
      reloading: this.reloading,
      isKnife: !!this.def.melee,
      speed: this.def.speed,
      ads: this.ads,
      scoped: this.isScoped(),
      hasAds: !!this.def.ads,
      isThrowable: !!this.def.throwable,
      isPlantable: !!this.def.plantable,
      count: this.def.throwable ? (this.items[this.def.id] || 0) : -1,
      grenades: this.items.grenade,
      smokes: this.items.smoke,
      plantProgress: this.plantProgress,
      inspecting: this.inspectTimer > 0
    };
  };

  FPS.WEAPONS = WEAPON_LIST;
  FPS.WeaponSystem = WeaponSystem;
})(window.FPS);
