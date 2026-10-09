/* =======================================================================
 * effects.js —— 枪口火光、曳光弹、弹孔贴花、火花、爆炸
 * 全部使用对象池，避免运行时频繁创建销毁
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils;

  function Effects(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    this.decals = [];
    this.rings = [];
    this.flashes = [];
    this.numbers = [];          // 头顶伤害数字
    this.numTexCache = {};
    this.time = 0;

    this.glowTex = Utils.glowTexture();
    this.decalTex = Utils.decalTexture();
    this.UP = new THREE.Vector3(0, 1, 0);

    this.tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.matCache = {};

    // 全局枪口闪光灯（复用一盏灯，性能友好）
    this.flashLight = new THREE.PointLight(0xffca7a, 0, 16, 2);
    scene.add(this.flashLight);
    this.flashLightTimer = 0;

    this.ringGeo = new THREE.RingGeometry(0.4, 0.62, 20);
  }

  Effects.prototype.mat = function (color, opacity, blending) {
    var key = color + '_' + opacity + '_' + (blending || 0);
    if (!this.matCache[key]) {
      this.matCache[key] = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        blending: blending === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false
      });
    }
    return this.matCache[key];
  };

  /* ------------------------------------------------------------ 枪口火光 */
  Effects.prototype.muzzleFlash = function (pos, dir) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex,
      color: 0xffd98a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    }));
    s.position.copy(pos);
    var size = Utils.rand(0.2, 0.3);
    s.scale.set(size, size, 1);
    this.scene.add(s);
    this.flashes.push({ obj: s, life: 0.06, max: 0.06, base: size });

    this.flashLight.position.copy(pos).addScaledVector(dir, 0.6);
    this.flashLight.intensity = 1.1;
    this.flashLightTimer = 0.045;
  };

  /* ------------------------------------------------------------ 曳光弹 */
  Effects.prototype.tracer = function (from, to, color) {
    var dir = new THREE.Vector3().subVectors(to, from);
    var len = dir.length();
    if (len < 0.01) return;

    var m = new THREE.Mesh(this.tracerGeo, this.mat(color || 0xffe3a0, 0.9, 1));
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.scale.set(0.022, len, 0.022);
    m.quaternion.setFromUnitVectors(this.UP, dir.clone().normalize());
    this.scene.add(m);
    this.tracers.push({ obj: m, life: 0.055, max: 0.055 });
  };

  /* ------------------------------------------------------------ 火花 */
  Effects.prototype.sparks = function (pos, normal, color, count, power) {
    count = count || 7;
    power = power || 3.2;
    for (var i = 0; i < count; i++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex,
        color: color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      sp.position.copy(pos);
      var size = Utils.rand(0.05, 0.13);
      sp.scale.set(size, size, 1);
      this.scene.add(sp);

      var v = new THREE.Vector3(
        Utils.rand(-1, 1), Utils.rand(-0.4, 1), Utils.rand(-1, 1)
      ).normalize().multiplyScalar(Utils.rand(0.35, 1) * power);
      if (normal) v.addScaledVector(normal, power * 0.65);

      this.particles.push({
        obj: sp, vel: v, life: Utils.rand(0.22, 0.5), max: 0.5,
        base: size, gravity: -9
      });
    }
  };

  /* ------------------------------------------------------------ 弹孔 */
  Effects.prototype.decal = function (point, normal) {
    var geo = new THREE.PlaneGeometry(1, 1);
    var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: this.decalTex, transparent: true, opacity: 0.92, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    }));
    var size = Utils.rand(0.16, 0.26);
    m.scale.set(size, size, 1);
    m.position.copy(point).addScaledVector(normal, 0.012);
    var look = point.clone().add(normal);
    m.lookAt(look);
    m.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(m);
    var rec = { obj: m, life: 26, max: 26, size: size };
    this.decals.push(rec);

    // 超过上限就回收最老的
    while (this.decals.length > 70) {
      var old = this.decals.shift();
      this.scene.remove(old.obj);
      old.obj.geometry.dispose();
      old.obj.material.dispose();
    }
  };

  /* ------------------------------------------------------------ 命中特效 */
  Effects.prototype.impact = function (point, normal, color) {
    this.sparks(point, normal, color || 0xffc46b, 6, 2.6);
    if (normal) this.decal(point, normal);
  };

  Effects.prototype.hitEnemy = function (point, normal, color) {
    this.sparks(point, normal, color || 0x7ff0ff, 8, 3.4);
  };

  /* ---------------------------------------------------- 头顶伤害数字 */
  Effects.prototype._numTexture = function (text, isHead) {
    var key = text + (isHead ? 'h' : '');
    if (this.numTexCache[key]) return this.numTexCache[key];
    var c = document.createElement('canvas');
    c.width = 192; c.height = 96;
    var ctx = c.getContext('2d');
    ctx.font = 'bold 64px Consolas, ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, 96, 48);
    ctx.fillStyle = isHead ? '#ffd166' : '#ffffff';
    ctx.fillText(text, 96, 48);
    var tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    this.numTexCache[key] = tex;
    return tex;
  };

  /* 伤害数字：头顶出现 -> 向上飘 -> 0.5 秒后消失 */
  Effects.prototype.damageNumber = function (pos, amount, isHead) {
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._numTexture(String(amount), isHead),
      transparent: true, depthTest: false, depthWrite: false, opacity: 1
    }));
    sprite.position.copy(pos);
    var base = isHead ? 0.95 : 0.8;
    sprite.scale.set(base, base * 0.5, 1);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.numbers.push({
      obj: sprite, life: 0.5, max: 0.5, vy: 1.1,
      base: base, drift: Utils.rand(-0.3, 0.3)
    });
  };

  /* ------------------------------------------------------------ 爆炸 */
  Effects.prototype.explosion = function (pos, color, scale) {
    color = color || 0xff8a3d;
    scale = scale || 1;

    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.position.copy(pos);
    s.scale.set(0.6 * scale, 0.6 * scale, 1);
    this.scene.add(s);
    this.flashes.push({ obj: s, life: 0.26, max: 0.26, base: 2.6 * scale, grow: true });

    var ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.5 * scale);
    this.scene.add(ring);
    this.rings.push({ obj: ring, life: 0.5, max: 0.5, base: 3.6 * scale });

    this.sparks(pos, null, color, 16, 5.5 * scale);
  };

  /* ------------------------------------------------------------ 出生特效 */
  Effects.prototype.spawnBurst = function (pos, color) {
    var ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: color || 0x7ff0ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    ring.position.copy(pos).setY(pos.y + 0.05);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.rings.push({ obj: ring, life: 0.6, max: 0.6, base: 2.2 });
    this.sparks(pos, null, color || 0x7ff0ff, 10, 3);
  };

  /* ------------------------------------------------------------ 每帧更新 */
  Effects.prototype.update = function (dt) {
    this.time += dt;
    var i, o;

    // 枪口闪光灯
    if (this.flashLightTimer > 0) {
      this.flashLightTimer -= dt;
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 60);
      if (this.flashLightTimer <= 0) this.flashLight.intensity = 0;
    }

    for (i = this.flashes.length - 1; i >= 0; i--) {
      o = this.flashes[i];
      o.life -= dt;
      var t = 1 - o.life / o.max;
      var size = o.grow ? Utils.lerp(o.base * 0.35, o.base, t) : o.base * (1 - t * 0.6);
      o.obj.scale.set(size, size, 1);
      o.obj.material.opacity = Math.max(0, 1 - t);
      if (o.life <= 0) {
        this.scene.remove(o.obj);
        o.obj.material.dispose();
        this.flashes.splice(i, 1);
      }
    }

    for (i = this.tracers.length - 1; i >= 0; i--) {
      o = this.tracers[i];
      o.life -= dt;
      o.obj.material.opacity = Math.max(0, 0.9 * (o.life / o.max));
      if (o.life <= 0) {
        this.scene.remove(o.obj);
        this.tracers.splice(i, 1);
      }
    }

    for (i = this.particles.length - 1; i >= 0; i--) {
      o = this.particles[i];
      o.life -= dt;
      o.vel.y += o.gravity * dt;
      o.obj.position.addScaledVector(o.vel, dt);
      var k = Math.max(0, o.life / o.max);
      o.obj.material.opacity = k;
      var sc = o.base * (0.35 + k * 0.65);
      o.obj.scale.set(sc, sc, 1);
      if (o.life <= 0) {
        this.scene.remove(o.obj);
        o.obj.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    for (i = this.rings.length - 1; i >= 0; i--) {
      o = this.rings[i];
      o.life -= dt;
      var rt = 1 - o.life / o.max;
      o.obj.scale.setScalar(Utils.lerp(0.5, o.base, rt));
      o.obj.material.opacity = Math.max(0, 0.9 * (1 - rt));
      if (o.life <= 0) {
        this.scene.remove(o.obj);
        o.obj.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    for (i = this.decals.length - 1; i >= 0; i--) {
      o = this.decals[i];
      o.life -= dt;
      if (o.life < 3) o.obj.material.opacity = Math.max(0, 0.92 * (o.life / 3));
      if (o.life <= 0) {
        this.scene.remove(o.obj);
        o.obj.geometry.dispose();
        o.obj.material.dispose();
        this.decals.splice(i, 1);
      }
    }

    // 头顶伤害数字：向上飘 + 淡出
    for (i = this.numbers.length - 1; i >= 0; i--) {
      o = this.numbers[i];
      o.life -= dt;
      o.obj.position.y += o.vy * dt;
      o.obj.position.x += o.drift * dt * 0.4;
      o.vy = Utils.damp(o.vy, 0.15, 4, dt);
      var nk = Math.max(0, o.life / o.max);
      o.obj.material.opacity = nk;
      var nsc = o.base * (1 + (1 - nk) * 0.18);
      o.obj.scale.set(nsc, nsc * 0.5, 1);
      if (o.life <= 0) {
        this.scene.remove(o.obj);
        o.obj.material.dispose();
        this.numbers.splice(i, 1);
      }
    }
  };

  Effects.prototype.clear = function () {
    var i;
    for (i = this.tracers.length - 1; i >= 0; i--) this.scene.remove(this.tracers[i].obj);
    for (i = this.particles.length - 1; i >= 0; i--) this.scene.remove(this.particles[i].obj);
    for (i = this.decals.length - 1; i >= 0; i--) this.scene.remove(this.decals[i].obj);
    for (i = this.rings.length - 1; i >= 0; i--) this.scene.remove(this.rings[i].obj);
    for (i = this.flashes.length - 1; i >= 0; i--) this.scene.remove(this.flashes[i].obj);
    this.tracers = []; this.particles = []; this.decals = [];
    this.rings = []; this.flashes = [];
    for (i = this.numbers.length - 1; i >= 0; i--) this.scene.remove(this.numbers[i].obj);
    this.numbers = [];
    this.flashLight.intensity = 0;
  };

  FPS.Effects = Effects;
})(window.FPS);
