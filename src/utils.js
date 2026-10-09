/* =======================================================================
 * utils.js —— 通用数学工具、程序化贴图、AABB 碰撞
 * ===================================================================== */
window.FPS = window.FPS || {};

(function (FPS) {
  'use strict';

  var Utils = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /* 与帧率无关的平滑插值 */
    damp: function (a, b, lambda, dt) { return Utils.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    choose: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle: function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    formatTime: function (sec) {
      var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    },

    /* 用 canvas 画贴图，避免依赖外部图片资源 */
    canvasTexture: function (w, h, draw, repeatX, repeatY) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;
      if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      if (repeatX || repeatY) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX || 1, repeatY || 1);
      }
      return tex;
    },

    /* 地面钢板贴图 */
    floorTexture: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#232b34';
        ctx.fillRect(0, 0, w, h);
        // 噪点
        for (var i = 0; i < 2600; i++) {
          var v = Math.random() * 26 | 0;
          ctx.fillStyle = 'rgba(' + (40 + v) + ',' + (48 + v) + ',' + (56 + v) + ',0.6)';
          ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
        // 网格线
        ctx.strokeStyle = 'rgba(120, 165, 190, 0.28)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        ctx.strokeStyle = 'rgba(120, 165, 190, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
        ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
        ctx.stroke();
        // 铆钉
        ctx.fillStyle = 'rgba(150, 185, 205, 0.35)';
        [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].forEach(function (p) {
          ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2); ctx.fill();
        });
      }, 24, 24);
    },

    /* 金属箱体贴图 */
    crateTexture: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#3a4450';
        ctx.fillRect(0, 0, w, h);
        for (var i = 0; i < 1800; i++) {
          var v = Math.random() * 22 | 0;
          ctx.fillStyle = 'rgba(' + (60 + v) + ',' + (70 + v) + ',' + (80 + v) + ',0.5)';
          ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
        ctx.strokeStyle = 'rgba(15, 20, 26, 0.85)';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.strokeStyle = 'rgba(150, 185, 205, 0.18)';
        ctx.lineWidth = 3;
        ctx.strokeRect(18, 18, w - 36, h - 36);
        ctx.beginPath();
        ctx.moveTo(18, 18); ctx.lineTo(w - 18, h - 18);
        ctx.moveTo(w - 18, 18); ctx.lineTo(18, h - 18);
        ctx.stroke();
      }, 1, 1);
    },

    /* 弹孔贴图 */
    decalTexture: function () {
      return Utils.canvasTexture(128, 128, function (ctx, w, h) {
        var g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
        g.addColorStop(0, 'rgba(6, 8, 12, 0.98)');
        g.addColorStop(0.32, 'rgba(18, 22, 30, 0.85)');
        g.addColorStop(0.62, 'rgba(60, 70, 82, 0.42)');
        g.addColorStop(1, 'rgba(60, 70, 82, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(180, 200, 215, 0.35)';
        ctx.lineWidth = 2;
        for (var i = 0; i < 7; i++) {
          var a = Math.random() * Math.PI * 2, r1 = 20 + Math.random() * 8, r2 = 34 + Math.random() * 22;
          ctx.beginPath();
          ctx.moveTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
          ctx.lineTo(64 + Math.cos(a) * r2, 64 + Math.sin(a) * r2);
          ctx.stroke();
        }
      });
    },

    /* 光点贴图（枪口火光、火花、光晕） */
    glowTexture: function () {
      return Utils.canvasTexture(128, 128, function (ctx, w, h) {
        var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(0.25, 'rgba(255, 226, 150, 0.85)');
        g.addColorStop(0.55, 'rgba(255, 150, 60, 0.32)');
        g.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
    }
  };

  /* ---------------------------------------------------------------------
   * 程序化贴图库：小镇风格（石板路 / 灰泥墙 / 砖石 / 木箱 / 沙土地 / 陶瓦屋顶）
   * 全部是灰阶+轻微色调，实际颜色由材质的 color 决定，方便换配色
   * ------------------------------------------------------------------- */
  function noiseInto(ctx, w, h, count, base, spread, size) {
    for (var i = 0; i < count; i++) {
      var v = Math.random() * spread | 0;
      ctx.fillStyle = 'rgba(' + (base + v) + ',' + (base + v) + ',' + (base + v) + ',0.45)';
      ctx.fillRect(Math.random() * w, Math.random() * h, size || 2, size || 2);
    }
  }

  var Textures = {
    cache: {},
    get: function (name) {
      if (!this.cache[name]) this.cache[name] = this['make_' + name]();
      return this.cache[name];
    },

    /* 石板路 */
    make_cobble: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#8d8577';
        ctx.fillRect(0, 0, w, h);
        var cell = 32;
        for (var y = 0; y < h; y += cell) {
          for (var x = 0; x < w; x += cell) {
            var jx = (Math.random() - 0.5) * 5, jy = (Math.random() - 0.5) * 5;
            var g = 150 + Math.random() * 55 | 0;
            ctx.fillStyle = 'rgb(' + g + ',' + (g - 6) + ',' + (g - 18) + ')';
            ctx.beginPath();
            var cx = x + cell / 2 + jx, cy = y + cell / 2 + jy, r = cell * (0.42 + Math.random() * 0.08);
            var seg = 7;
            for (var i = 0; i <= seg; i++) {
              var a = i / seg * Math.PI * 2;
              var rr = r * (0.85 + Math.random() * 0.25);
              var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }
        }
        noiseInto(ctx, w, h, 1400, 90, 40, 2);
      }, 1, 1);
    },

    /* 灰泥墙面（可染色） */
    make_plaster: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#cfc6b6';
        ctx.fillRect(0, 0, w, h);
        noiseInto(ctx, w, h, 2600, 150, 70, 3);
        // 水渍 / 污迹
        for (var i = 0; i < 22; i++) {
          var x = Math.random() * w, y = Math.random() * h, r = 12 + Math.random() * 46;
          var g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(120,108,92,0.16)');
          g.addColorStop(1, 'rgba(120,108,92,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // 墙根积灰
        var gb = ctx.createLinearGradient(0, h - 60, 0, h);
        gb.addColorStop(0, 'rgba(90,78,64,0)');
        gb.addColorStop(1, 'rgba(90,78,64,0.38)');
        ctx.fillStyle = gb;
        ctx.fillRect(0, h - 60, w, 60);
      }, 1, 1);
    },

    /* 砖石（用于墙裙、拱门） */
    make_stone: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#b7ada0';
        ctx.fillRect(0, 0, w, h);
        var bh = 22, bw = 46;
        for (var y = 0, row = 0; y < h; y += bh, row++) {
          var off = (row % 2) * bw / 2;
          for (var x = -bw; x < w + bw; x += bw) {
            var g = 145 + Math.random() * 45 | 0;
            ctx.fillStyle = 'rgb(' + g + ',' + (g - 8) + ',' + (g - 20) + ')';
            ctx.fillRect(x + off + 1.5, y + 1.5, bw - 3, bh - 3);
          }
        }
        noiseInto(ctx, w, h, 1500, 110, 50, 2);
      }, 1, 1);
    },

    /* 木板（木箱、地板） */
    make_wood: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#a87841';
        ctx.fillRect(0, 0, w, h);
        var pw = 42;
        for (var x = 0; x < w; x += pw) {
          var g = 150 + Math.random() * 45 | 0;
          ctx.fillStyle = 'rgb(' + (g + 30) + ',' + (g - 10) + ',' + (g - 70) + ')';
          ctx.fillRect(x + 2, 0, pw - 4, h);
          ctx.strokeStyle = 'rgba(70,48,26,0.55)';
          ctx.lineWidth = 2;
          for (var i = 0; i < 4; i++) {
            ctx.beginPath();
            var yy = Math.random() * h;
            ctx.moveTo(x + 4, yy);
            ctx.bezierCurveTo(x + pw * 0.4, yy + 6, x + pw * 0.6, yy - 6, x + pw - 4, yy + 2);
            ctx.stroke();
          }
        }
        noiseInto(ctx, w, h, 1200, 120, 60, 2);
      }, 1, 1);
    },

    /* 沙土地（包点地面） */
    make_sand: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#c9ac72';
        ctx.fillRect(0, 0, w, h);
        noiseInto(ctx, w, h, 3200, 165, 70, 3);
        for (var i = 0; i < 260; i++) {
          var g = 120 + Math.random() * 60 | 0;
          ctx.fillStyle = 'rgba(' + g + ',' + (g - 14) + ',' + (g - 44) + ',0.7)';
          var r = 1 + Math.random() * 2.6;
          ctx.beginPath();
          ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }, 1, 1);
    },

    /* 水泥（出生点、楼梯） */
    make_concrete: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#a6a49c';
        ctx.fillRect(0, 0, w, h);
        noiseInto(ctx, w, h, 3000, 130, 70, 2);
        ctx.strokeStyle = 'rgba(110,108,102,0.5)';
        ctx.lineWidth = 2;
        for (var i = 0; i < 9; i++) {
          ctx.beginPath();
          var x = Math.random() * w, y = Math.random() * h;
          ctx.moveTo(x, y);
          for (var s = 0; s < 4; s++) {
            x += (Math.random() - 0.5) * 60;
            y += (Math.random() - 0.5) * 60;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }, 1, 1);
    },

    /* 陶瓦屋顶 */
    make_roof: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#a4462f';
        ctx.fillRect(0, 0, w, h);
        var th = 26;
        for (var y = 0; y < h; y += th) {
          for (var x = 0; x < w; x += 22) {
            var g = 120 + Math.random() * 70 | 0;
            ctx.fillStyle = 'rgb(' + (g + 60) + ',' + (g - 10) + ',' + (g - 40) + ')';
            ctx.beginPath();
            ctx.ellipse(x + 11 + (y / th % 2) * 11, y + th / 2, 10, th / 2 - 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        noiseInto(ctx, w, h, 900, 100, 60, 2);
      }, 1, 1);
    },

    /* 金属（集装箱、汽车） */
    make_metal: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#8c9298';
        ctx.fillRect(0, 0, w, h);
        for (var i = 0; i < 700; i++) {
          var g = 110 + Math.random() * 80 | 0;
          ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.35)';
          ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 26, 1.6);
        }
        // 锈迹
        for (var j = 0; j < 16; j++) {
          var x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 26;
          var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, 'rgba(150,84,44,0.5)');
          rg.addColorStop(1, 'rgba(150,84,44,0)');
          ctx.fillStyle = rg;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }, 1, 1);
    },

    /* 木质室内地板 */
    make_floorwood: function () {
      return Utils.canvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#9a7546';
        ctx.fillRect(0, 0, w, h);
        var ph = 30;
        for (var y = 0; y < h; y += ph) {
          var g = 145 + Math.random() * 40 | 0;
          ctx.fillStyle = 'rgb(' + (g + 20) + ',' + (g - 20) + ',' + (g - 70) + ')';
          ctx.fillRect(0, y + 1.5, w, ph - 3);
          ctx.strokeStyle = 'rgba(80,56,30,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, y + ph);
          ctx.lineTo(w, y + ph);
          ctx.stroke();
        }
        noiseInto(ctx, w, h, 1400, 110, 60, 2);
      }, 1, 1);
    },

    /* 招牌贴图（文字） */
    signTexture: function (text, bg, fg, border) {
      return Utils.canvasTexture(256, 96, function (ctx, w, h) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = border || 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = fg;
        ctx.font = 'bold 54px "Microsoft YaHei", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 3);
      });
    },

    /* 烟雾贴图：灰白色的一团，中心基本不透明 */
    make_smoke: function () {
      return Utils.canvasTexture(128, 128, function (ctx, w, h) {
        var g = ctx.createRadialGradient(64, 64, 3, 64, 64, 63);
        g.addColorStop(0, 'rgba(240, 244, 247, 0.99)');
        g.addColorStop(0.5, 'rgba(228, 234, 238, 0.95)');
        g.addColorStop(0.8, 'rgba(214, 222, 228, 0.55)');
        g.addColorStop(1, 'rgba(210, 218, 224, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(64, 64, 63, 0, Math.PI * 2);
        ctx.fill();
        for (var i = 0; i < 260; i++) {
          var a = Math.random() * Math.PI * 2;
          var r = Math.random() * 54;
          var x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
          var s = 3 + Math.random() * 8;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + Math.random() * 0.1).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },

    /* 理学院墙上的高斯公式 */
    make_formula: function () {
      return Utils.canvasTexture(256, 128, function (ctx, w, h) {
        ctx.fillStyle = '#16223a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.65)';
        ctx.lineWidth = 5;
        ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = '#cfe4ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 30px "Cambria Math", Georgia, serif';
        ctx.fillText('∮ E · dA = Q / ε₀', w / 2, h / 2 - 16);
        ctx.font = 'bold 24px "Cambria Math", Georgia, serif';
        ctx.fillText('∇ · B = 0', w / 2, h / 2 + 26);
      });
    }
  };

  /* ---------------------------------------------------------------------
   * 碰撞：所有障碍物都是轴对齐包围盒(AABB)，角色也是包围盒。
   * 分轴推进 + 逐轴解算，简单稳定，还支持自动上台阶。
   * ------------------------------------------------------------------- */
  var Collide = {
    EPS: 0.001,

    overlaps: function (box, p, r, h) {
      return (p.x + r > box.min.x && p.x - r < box.max.x &&
              p.z + r > box.min.z && p.z - r < box.max.z &&
              p.y + h > box.min.y && p.y < box.max.y);
    },

    overlapsAny: function (colliders, p, r, h) {
      for (var i = 0; i < colliders.length; i++) {
        if (Collide.overlaps(colliders[i], p, r, h)) return colliders[i];
      }
      return null;
    },

    /* 线段与 AABB 求交，返回 [0,1] 的命中参数，未命中返回 -1 */
    segmentAABB: function (p0, p1, box) {
      var tmin = 0, tmax = 1, axes = ['x', 'y', 'z'];
      for (var i = 0; i < 3; i++) {
        var ax = axes[i];
        var d = p1[ax] - p0[ax];
        var lo = box.min[ax], hi = box.max[ax];
        if (Math.abs(d) < 1e-8) {
          if (p0[ax] < lo || p0[ax] > hi) return -1;
        } else {
          var t1 = (lo - p0[ax]) / d, t2 = (hi - p0[ax]) / d, tmp;
          if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return -1;
        }
      }
      return tmin;
    },

    /* 把一点扩展成盒子，用于射线检测角色 */
    boxFromPoint: function (p, r, h) {
      return {
        min: new THREE.Vector3(p.x - r, p.y, p.z - r),
        max: new THREE.Vector3(p.x + r, p.y + h, p.z + r)
      };
    },

    /**
     * 单轴移动 + 解算碰撞。
     * @param pos    角色脚底位置 {x,y,z}，会被直接修改
     * @param delta  本帧位移量
     * @param axis   'x' | 'y' | 'z'
     * @param ctx    {radius, height, colliders, stepHeight, stepped, grounded, hitCeiling}
     */
    moveAxis: function (pos, delta, axis, ctx) {
      if (delta === 0) return false;
      pos[axis] += delta;

      var r = ctx.radius, h = ctx.height, blocked = false;

      for (var iter = 0; iter < 6; iter++) {
        var hit = null;
        for (var i = 0; i < ctx.colliders.length; i++) {
          var b = ctx.colliders[i];
          if (b.disabled) continue;
          if (Collide.overlaps(b, pos, r, h)) { hit = b; break; }
        }
        if (!hit) break;

        // 水平移动被挡住时，尝试自动抬腿上台阶
        if (ctx.stepHeight > 0 && axis !== 'y') {
          var top = hit.max.y;
          var lift = top - pos.y;
          if (lift > 0 && lift <= ctx.stepHeight) {
            var probe = { x: pos.x, y: top + 0.002, z: pos.z };
            if (!Collide.overlapsAny(ctx.colliders, probe, r, h)) {
              pos.y = top + 0.002;
              ctx.stepped = true;
              blocked = true;
              continue;
            }
          }
        }

        blocked = true;
        if (axis === 'y') {
          if (delta > 0) {
            pos.y = hit.min.y - h - Collide.EPS;
            ctx.hitCeiling = true;
          } else {
            pos.y = hit.max.y + Collide.EPS;
            ctx.grounded = true;
          }
          return true;
        }
        if (axis === 'x') {
          if (delta > 0) pos.x = hit.min.x - r - Collide.EPS;
          else pos.x = hit.max.x + r + Collide.EPS;
        } else {
          if (delta > 0) pos.z = hit.min.z - r - Collide.EPS;
          else pos.z = hit.max.z + r + Collide.EPS;
        }
      }
      return blocked;
    }
  };

  FPS.Utils = Utils;
  FPS.Collide = Collide;
  FPS.Textures = Textures;
})(window.FPS);
