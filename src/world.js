/* =======================================================================
 * world.js —— 地图：按雷达图重建的意大利小镇
 *
 * 地图用「字符图块」定义，一格 3 米，32 x 34 格 = 96m x 102m。
 * 直接改下面的 MAP 字符画就能改地图：
 *
 *   #  实心建筑（雷达图上的黑色区域，不可进入，自动生成窗户/门/屋顶）
 *   .  可通行的街道与巷子（雷达图上的灰色/蓝色区域）
 *   B  B 包点（雷达图左上方）        A  A 包点（雷达图右下方）
 *   P  玩家出生点（黄色圆圈）        T  机器人出生点（蓝色圆圈）
 *   a  带屋顶的室内通道
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils, Collide = FPS.Collide, Textures = FPS.Textures;

  var TILE = 2;                          // 2 米一格，精度更高，斜向街道更平滑
  var ORIGIN_X = -50, ORIGIN_Z = -50;    // 50 x 50 格 = 100m x 100m

  /* ------------------------------------------------------------- 地图数据 */
  var MAP = [
    '##################################################', // 0
    '#########################....#####################', // 1
    '#########################......###################', // 2
    '#########################.......##################', // 3
    '#########################2####..##################', // 4
    '####################.####2###......###############', // 5
    '####################...#.2##.......###############', // 6
    '####################...AAA######..###222222....###', // 7
    '####################...AAAAAAA##....#2.........###', // 8
    '####################...AAAAAAA##...............###', // 9
    '####################...AoAAAAAAA...............###', // 10
    '####################...AAAAAAA2222.###.#.......###', // 11
    '####################...AAAAAAA##33####.#.22.T..T##', // 12
    '####################..2222AAAA##33####.#.22.TTTTT#', // 13
    '###########################AAA##33####.#.22.TTTTT#', // 14
    '############################AA##33####.#....TTTTT#', // 15
    '############################...#33####.#....TTTTT#', // 16
    '#########################......#33####.#####TTTTT#', // 17
    '########################.......#33####.#####TTTTT#', // 18
    '#######################........#33####.#####TTTTT#', // 19
    '###################..##..##..#.#33####......TTTTT#', // 20
    '###################..#...#######33####......TTTTT#', // 21
    '###################..#...#######33####........####', // 22
    '###################..#..########33####.........###', // 23
    '###################.....########33#####..####....#', // 24
    '###################....#########33#####..####....#', // 25
    '###################.....########3..####..#####...#', // 26
    '###################.....########3...###..######..#', // 27
    '###################....#########33...............#', // 28
    '###################.....########33#..............#', // 29
    '###################.....########33#...#####....###', // 30
    '#PPPP#########........#############..#######...###', // 31
    '#PPPP######...........#############..#######...###', // 32
    '#PPPP######.....####....###.#######..#####BBBBB###', // 33
    '#PPPP######.....#####..........###...###.#BBBBB###', // 34
    '#PPPP#..........#####................###.BBBBBBB2#', // 35
    '#PPPP#..###....######................###.BwBBBBB2#', // 36
    '#PPPP#..###...2222222###.......cp22..###.BcBBBBB2#', // 37
    '#PPPP#..###...2222222###.......pc2#..###.BBBBBBB2#', // 38
    '#PPPP..###....22222222##.......ow2#..###.BBBBBBB2#', // 39
    '#PPPP#####....2222p.....####...222#......BBBBBBB2#', // 40
    '#PPPP.####.....2...............222#......BBBBBBB2#', // 41
    '#PPPP...##.....................o22#.....wc22.....#', // 42
    '###..#..##.....................222######2222.....#', // 43
    '#######.#......22..####........##22222222#2......#', // 44
    '#######.......#22..####.#####..##22222222##......#', // 45
    '#######......##22.......#####..##2#########......#', // 46
    '###############22######.#####..##2#########......#', // 47
    '###############22######.......22222###############', // 48
    '##################################################', // 49
  ];

  /* 旧的 32x34 手绘地图（保留作参考，不再使用）
  var MAP_OLD = [
    '############......##############', // 0  北巷
    '############......##############', // 1
    '############......##############', // 2
    '############......##############', // 3
    '##########BBBBBBBBBB############', // 4  B 包点
    '##########BBBBBBBBBB############', // 5
    '############BBBBBBBB........####', // 6
    '############BBBBBBBB........####', // 7
    '############BBBBBBBB......TTTT##', // 8  机器人出生点（蓝圈）
    '############BBBBBBBB......TTTT##', // 9
    '############..............TTTT##', // 10
    '############..............TTTT##', // 11
    '############....aaaa........####', // 12 中路 + 室内通道
    '############....aaaa........####', // 13
    '############....aaaa........####', // 14
    '############....aaaa........####', // 15
    '##########......##..........####', // 16
    '##########......##..........####', // 17
    '########....##......######AAAA##', // 18 A 包点
    '########....##......######AAAA##', // 19
    'PPPP....##..##......######AAAA##', // 20 玩家出生点（黄圈）
    'PPPP....##..##......######AAAA##', // 21
    'PPPP....##.......##...####AAAA##', // 22
    'PPPP....##.......##...####AAAA##', // 23
    '##........####..........########', // 24 南城
    '##........####..........########', // 25
    '##....##........##..##......####', // 26
    '##....##........##..##......####', // 27
    '####............##....##......##', // 28
    '####............##....##......##', // 29
    '####............####......##..##', // 30
    '####............####......##..##', // 31
    '################################', // 32
    '################################'  // 33
  ]; */

  var LABELS = [
    { text: 'A', col: 27.5, row: 11.0, kind: 'site' },
    { text: 'B', col: 45.5, row: 37.5, kind: 'site' },
    { text: '出生点', col: 3.0, row: 36.0, kind: 'spawn' },
    { text: '机器人', col: 47.0, row: 16.0, kind: 'botspawn' }
  ];

  /* 手工摆放的地标道具： [类型, 列, 行]（地图字符里的 o/w/c/p 会自动变成小建筑） */
  /* 建筑功能：不同功能有不同的招牌和墙面配色，让小镇更丰富 */
  var ROLES = [
    { id: 'home', w: 10 },
    { id: 'shop', text: '杂货铺', bg: '#b8384a', fg: '#fff', mat: 1, deco: 'awning' },
    { id: 'tea', text: '奶茶店', bg: '#f0a8c4', fg: '#3a2030', mat: 7, deco: 'awning' },
    { id: 'cafe', text: '咖啡', bg: '#6b4a2a', fg: '#ffe9c0', mat: 3, deco: 'awning' },
    { id: 'clinic', text: '医疗站', bg: '#f4f7f5', fg: '#1f9d55', mat: 6, deco: 'cross' },
    { id: 'bank', text: '银行', bg: '#e0cf9a', fg: '#3a2f10', mat: 5, deco: 'columns' },
    { id: 'hotel', text: '旅馆', bg: '#2f6b62', fg: '#f0f7f5', mat: 4, deco: 'awning' },
    { id: 'toilet', text: '厕所', bg: '#5a8fb8', fg: '#ffffff', mat: 4, deco: 'none' },
    { id: 'mech', text: '机械学院', bg: '#4a5a6a', fg: '#ffd166', mat: 5, deco: 'gear' },
    { id: 'auto', text: '自动化学院', bg: '#2f5a6a', fg: '#7ff0ff', mat: 6, deco: 'motor' },
    { id: 'science', text: '理学院', bg: '#3a4a7a', fg: '#ffffff', mat: 0, deco: 'formula' },
    { id: 'sport', text: '体育部', bg: '#2f8a5a', fg: '#ffffff', mat: 4, deco: 'dumbbell' },
    { id: 'gym', text: '健身房', bg: '#8a3a2a', fg: '#ffe0a0', mat: 2, deco: 'dumbbell' },
    { id: 'zhili', text: '至理楼', bg: '#5a3a8a', fg: '#ffffff', mat: 0, deco: 'none' },
    { id: 'zhizhi', text: '至知楼', bg: '#3a6a8a', fg: '#ffffff', mat: 4, deco: 'none' },
    { id: 'zhishan', text: '至善楼', bg: '#6a4a2a', fg: '#ffe9c0', mat: 3, deco: 'none' },
    { id: 'hotpot', text: '勇哥小火锅', bg: '#c0392b', fg: '#ffe9a0', mat: 2, deco: 'lantern' },
    { id: 'jing', text: '精小何', bg: '#2f2f3a', fg: '#ffd166', mat: 5, deco: 'lantern' }
  ];

  var PROPS = [
    ['fountain', 45, 37],                                  // B 包点喷泉
    ['statue', 27, 10],                                    // A 包点雕像
    ['umbrella', 25, 9], ['umbrella', 33, 9], ['umbrella', 43, 39],
    ['planter', 26, 9], ['planter', 42, 11], ['planter', 47, 13],
    ['planter', 13, 34], ['planter', 30, 40], ['planter', 40, 28],
    ['bench', 28, 9], ['bench', 44, 40], ['bench', 22, 27],
    ['crate', 21, 36], ['crate', 40, 22], ['crate', 12, 41]
  ];

  var SOLID = '#';
  var WALKABLE = '.ABPTo2wc';       // 一层可通行（2 = 二层平台下方也是通的）
  var SMALL_PROPS = 'owcp';         // 地图里的小建筑字符
  var PLATFORM = '23';              // 二层平台：2 = 地面上的台子，3 = 建筑墙顶的台子

  /* ===================================================================== */
  function World() {
    this.colliders = [];
    this.meshes = [];
    this.decor = null;
    this.buildingRects = [];
    this.stairFootprints = [];     // 楼梯占位（放道具时避开）
    this.tile = TILE;
    this.cols = MAP[0].length;
    this.rows = MAP.length;
    this.originX = ORIGIN_X;
    this.originZ = ORIGIN_Z;
    this.bounds = {
      minX: ORIGIN_X, maxX: ORIGIN_X + this.cols * TILE,
      minZ: ORIGIN_Z, maxZ: ORIGIN_Z + this.rows * TILE
    };
    this.playerSpawn = { x: 0, y: 0, z: 0 };
    this.playerSpawnYaw = -Math.PI / 2;   // 出生点朝东（面向地图内部）
    this.spawnPoints = [];
    this.routes = [];
    this.mapInfo = null;
  }

  World.prototype.tileAt = function (col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return SOLID;
    return MAP[row].charAt(col);
  };
  World.prototype.isSolidTile = function (col, row) {
    return this.tileAt(col, row) === SOLID;
  };
  World.prototype.isWalkableTile = function (col, row) {
    return WALKABLE.indexOf(this.tileAt(col, row)) >= 0;
  };
  World.prototype.isPlatformTile = function (col, row) {
    return PLATFORM.indexOf(this.tileAt(col, row)) >= 0;
  };
  World.prototype.isSolidTile2 = function (col, row) {
    return this.isSolidTile(col, row) || this.tileAt(col, row) === '3';
  };
  World.prototype.tileToWorld = function (col, row) {
    return {
      x: ORIGIN_X + (col + 0.5) * TILE,
      z: ORIGIN_Z + (row + 0.5) * TILE
    };
  };
  World.prototype.worldToTile = function (x, z) {
    return {
      col: Math.floor((x - ORIGIN_X) / TILE),
      row: Math.floor((z - ORIGIN_Z) / TILE)
    };
  };
  /* 格子边界坐标 */
  World.prototype.colX = function (col) { return ORIGIN_X + col * TILE; };
  World.prototype.rowZ = function (row) { return ORIGIN_Z + row * TILE; };

  /* ===================================================================== */
  World.prototype.build = function (scene) {
    this.scene = scene;
    this._checkMap();
    this._materials();
    this._buildSky(scene);
    this._buildGround(scene);
    this._buildBuildings(scene);
    this._buildInteriors(scene);
    this._buildAreaFloors(scene);
    this._decorateFacades(scene);
    this._buildTerraces(scene);
    this._buildArcades(scene);
    this._buildProps(scene);
    this._buildDetails(scene);
    this._defineSpawns();
    this._buildMapInfo();
    return this;
  };

  World.prototype._checkMap = function () {
    var w = MAP[0].length;
    for (var i = 0; i < MAP.length; i++) {
      if (MAP[i].length !== w) {
        console.error('地图第 ' + i + ' 行宽度错误：' + MAP[i].length + '，应为 ' + w);
      }
    }
  };

  /* ------------------------------------------------------------- 材质 */
  World.prototype._materials = function () {
    function tex(n, rx, ry) {
      var t = Textures.get(n);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx || 1, ry || rx || 1);
      return t;
    }
    function std(o) { return new THREE.MeshStandardMaterial(o); }

    /* 小镇墙面：灰泥 + 石材，颜色参考照片里的赭黄/陶红/米白/灰绿 */
    this.wallMats = [
      std({ map: tex('plaster', 3, 2), color: 0xe8d5ac, roughness: 0.95, metalness: 0.02 }), // 米白
      std({ map: tex('plaster', 3, 2), color: 0xd6a24f, roughness: 0.95, metalness: 0.02 }), // 赭黄
      std({ map: tex('plaster', 3, 2), color: 0xbb6a4c, roughness: 0.95, metalness: 0.02 }), // 陶红
      std({ map: tex('plaster', 3, 2), color: 0xc3ad84, roughness: 0.95, metalness: 0.02 }), // 沙褐
      std({ map: tex('plaster', 3, 2), color: 0x93a189, roughness: 0.95, metalness: 0.02 }), // 灰绿
      std({ map: tex('stone', 3, 2), color: 0xb9b2a4, roughness: 0.98, metalness: 0.02 }),    // 石砌
      std({ map: tex('plaster', 3, 2), color: 0xf2f5f2, roughness: 0.93, metalness: 0.02 }),  // 医疗站白
      std({ map: tex('plaster', 3, 2), color: 0xdfa8b8, roughness: 0.94, metalness: 0.02 })   // 奶茶粉
    ];
    this.mat = {
      street: std({ map: tex('cobble', 32, 34), color: 0xb0a189, roughness: 0.97, metalness: 0.03 }),
      siteA: std({ map: tex('sand', 5, 5), color: 0xf0e2c4, roughness: 1, metalness: 0 }),
      siteB: std({ map: tex('sand', 4, 3), color: 0xe8d6b4, roughness: 1, metalness: 0 }),
      spawnP: std({ map: tex('concrete', 4, 4), color: 0xbcc6c8, roughness: 0.95, metalness: 0.05 }),
      spawnT: std({ map: tex('concrete', 4, 4), color: 0xb0bec6, roughness: 0.95, metalness: 0.05 }),
      interior: std({ map: tex('floorwood', 5, 5), color: 0xffffff, roughness: 0.85, metalness: 0.04 }),
      roof: std({ map: tex('roof', 4, 4), color: 0xffffff, roughness: 0.87, metalness: 0.04 }),
      stone: std({ map: tex('stone', 3, 2), color: 0xc9c2b2, roughness: 0.92, metalness: 0.04 }),
      wood: std({ map: tex('wood', 1, 1), color: 0xffffff, roughness: 0.82, metalness: 0.03 }),
      woodDark: std({ map: tex('wood', 2, 1), color: 0xa07a4c, roughness: 0.85, metalness: 0.03 }),
      metal: std({ map: tex('metal', 1, 1), color: 0xffffff, roughness: 0.5, metalness: 0.7 }),
      iron: std({ color: 0x2e3238, roughness: 0.45, metalness: 0.85 }),
      concrete: std({ map: tex('concrete', 2, 2), color: 0xffffff, roughness: 0.9, metalness: 0.06 }),
      glass: std({ color: 0x22343d, roughness: 0.16, metalness: 0.55, emissive: 0x122530, emissiveIntensity: 0.45 }),
      water: std({ color: 0x69c0d8, roughness: 0.12, metalness: 0.35, emissive: 0x0d3a4a, emissiveIntensity: 0.3 }),
      foliage: std({ color: 0x4f7a3c, roughness: 1, metalness: 0, flatShading: true }),
      trunk: std({ map: tex('wood'), color: 0x7a5a3a, roughness: 0.95 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xffe6b0 }),
      shutterA: std({ color: 0x5c7a4a, roughness: 0.8 }),   // 绿色百叶窗
      shutterB: std({ color: 0x3f6b8a, roughness: 0.8 }),   // 蓝色百叶窗
      shutterC: std({ color: 0x8a6a44, roughness: 0.8 }),   // 木色百叶窗
      clothRed: std({ color: 0xb8384a, roughness: 0.85 }),
      clothBlue: std({ color: 0x3f78b8, roughness: 0.85 }),
      clothCream: std({ color: 0xe0d2b0, roughness: 0.85 })
    };
  };

  /* ------------------------------------------------------------- 天空与光照 */
  World.prototype._buildSky = function (scene) {
    scene.background = new THREE.Color(0x9cc6e8);
    scene.fog = new THREE.Fog(0xc4d8e8, 70, 240);

    scene.add(new THREE.HemisphereLight(0xd2e6fa, 0x7d6b4d, 0.72));

    var sun = new THREE.DirectionalLight(0xfff0d2, 1.0);
    sun.position.set(62, 96, 42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -75;
    sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75;
    sun.shadow.camera.bottom = -75;
    sun.shadow.bias = -0.0011;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    var bounce = new THREE.DirectionalLight(0xa8c4e0, 0.28);
    bounce.position.set(-50, 30, -60);
    scene.add(bounce);
  };

  /* ------------------------------------------------------------- 地面 */
  World.prototype._buildGround = function (scene) {
    var w = this.cols * TILE, d = this.rows * TILE;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.mat.street);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ORIGIN_X + w / 2, 0, ORIGIN_Z + d / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    this.meshes.push(floor);
    this._collider(ORIGIN_X + w / 2, -0.5, ORIGIN_Z + d / 2, w, 1, d);

    this.decor = new THREE.Group();
    scene.add(this.decor);
  };

  /* ------------------------------------------------- 建筑（合并 + 屋顶） */
  World.prototype._buildBuildings = function (scene) {
    var self = this;
    var heights = [7.2, 8.6, 10.2, 6.4, 9.4];
    var used = [], r, c;
    for (r = 0; r < this.rows; r++) {
      used.push([]);
      for (c = 0; c < this.cols; c++) used[r].push(false);
    }

    /* 1) 先算出所有建筑矩形 */
    var rects = [];
    for (var r1 = 0; r1 < this.rows; r1++) {
      for (var c1 = 0; c1 < this.cols; c1++) {
        if (!this.isSolidTile(c1, r1) || used[r1][c1]) continue;

        var wCells = 1;
        while (c1 + wCells < this.cols && this.isSolidTile(c1 + wCells, r1) && !used[r1][c1 + wCells]) wCells++;

        var hCells = 1;
        outer:
        while (r1 + hCells < this.rows) {
          for (var k = 0; k < wCells; k++) {
            if (!this.isSolidTile(c1 + k, r1 + hCells) || used[r1 + hCells][c1 + k]) break outer;
          }
          hCells++;
        }
        for (var rr = r1; rr < r1 + hCells; rr++) {
          for (var cc = c1; cc < c1 + wCells; cc++) used[rr][cc] = true;
        }
        rects.push({ c: c1, r: r1, w: wCells, h: hCells });
      }
    }

    /* 2) 分配建筑功能：特殊招牌每种最多一栋，其余是居民楼 */
    var pool = Utils.shuffle(ROLES.filter(function (x) { return x.id !== 'home'; })
      .map(function (x) { return x; }));
    rects.forEach(function (rect, idx) {
      var big = rect.w * rect.h >= 4;
      rect.role = (big && idx % 3 === 0 && pool.length) ? pool.pop() : ROLES[0];
    });

    /* 3) 生成建筑本体 */
    rects.forEach(function (rect) {
        var c1 = rect.c, r1 = rect.r, wCells = rect.w, hCells = rect.h;

        var cx = ORIGIN_X + (c1 + wCells / 2) * TILE;
        var cz = ORIGIN_Z + (r1 + hCells / 2) * TILE;
        var w = wCells * TILE, d = hCells * TILE;
        var height = heights[(c1 * 7 + hCells * 13 + r1 * 3) % heights.length];
        var role = rect.role;
        var baseMat = self.wallMats[(role.mat !== undefined) ? role.mat
          : ((c1 * 5 + r1 * 11) % 5)];

        var mat = baseMat.clone();
        mat.map = baseMat.map.clone();
        mat.map.needsUpdate = true;
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(height / 4)));

        var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
        mesh.position.set(cx, height / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.surface = 'wall';
        scene.add(mesh);
        self.meshes.push(mesh);
        self.colliders.push({
          min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
          max: new THREE.Vector3(cx + w / 2, height, cz + d / 2),
          mesh: mesh, nav: true
        });

        /* 陶瓦屋顶（带出檐） */
        var roofMat = self.mat.roof.clone();
        roofMat.map = self.mat.roof.map.clone();
        roofMat.map.needsUpdate = true;
        roofMat.map.wrapS = roofMat.map.wrapT = THREE.RepeatWrapping;
        roofMat.map.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(d / 4)));
        var roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.5, d + 0.9), roofMat);
        roof.position.set(cx, height + 0.25, cz);
        roof.castShadow = true;
        roof.receiveShadow = true;
        scene.add(roof);
        self.meshes.push(roof);
        // 屋顶也要能站人（飞行功能上去不会穿模）
        self.colliders.push({
          min: new THREE.Vector3(cx - (w + 0.9) / 2, height + 0.02, cz - (d + 0.9) / 2),
          max: new THREE.Vector3(cx + (w + 0.9) / 2, height + 0.5, cz + (d + 0.9) / 2),
          mesh: roof, nav: false
        });

        self.buildingRects.push({
          c: c1, r: r1, w: wCells, h: hCells,
          cx: cx, cz: cz, ww: w, dd: d, height: height, role: role
        });
    });
  };

  /* --------------------------------------------- 室内（带屋顶的通道） */
  World.prototype._buildInteriors = function (scene) {
    var self = this;
    var ceilH = 3.5;
    var rects = this._mergeCells(function (c, r) { return self.tileAt(c, r) === 'a'; });
    rects.forEach(function (rect) {
      var cx = ORIGIN_X + (rect.c + rect.w / 2) * TILE;
      var cz = ORIGIN_Z + (rect.r + rect.h / 2) * TILE;
      var w = rect.w * TILE, d = rect.h * TILE;

      var floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), self.mat.interior);
      floor.position.set(cx, 0.07, cz);
      floor.receiveShadow = true;
      scene.add(floor);
      self.meshes.push(floor);

      var ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), self.mat.concrete);
      ceil.position.set(cx, ceilH, cz);
      ceil.castShadow = true;
      ceil.receiveShadow = true;
      scene.add(ceil);
      self.meshes.push(ceil);

      var n = Math.max(1, Math.round(Math.max(w, d) / 8));
      for (var i = 0; i < n; i++) {
        var t = (i + 0.5) / n;
        var lx = w > d ? (cx - w / 2 + w * t) : cx;
        var lz = w > d ? cz : (cz - d / 2 + d * t);
        var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), self.mat.lamp);
        lamp.position.set(lx, ceilH - 0.4, lz);
        scene.add(lamp);
        var pl = new THREE.PointLight(0xffd9a0, 0.85, 20, 2);
        pl.position.set(lx, ceilH - 0.6, lz);
        scene.add(pl);
      }
    });
  };

  /* ------------------------------------------------------------- 包点地面 */
  World.prototype._buildAreaFloors = function (scene) {
    var self = this;
    var table = { A: this.mat.siteA, B: this.mat.siteB, P: this.mat.spawnP, T: this.mat.spawnT };
    Object.keys(table).forEach(function (ch) {
      var rects = self._mergeCells(function (c, r) { return self.tileAt(c, r) === ch; });
      rects.forEach(function (rect) {
        var w = rect.w * TILE, d = rect.h * TILE;
        var cx = ORIGIN_X + (rect.c + rect.w / 2) * TILE;
        var cz = ORIGIN_Z + (rect.r + rect.h / 2) * TILE;
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), table[ch]);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cx, 0.02, cz);
        mesh.receiveShadow = true;
        scene.add(mesh);
        self.meshes.push(mesh);
      });
    });
  };

  /* --------------------------------------------------- 网格合并工具 */
  World.prototype._mergeCells = function (test) {
    var used = [], rects = [], r, c;
    for (r = 0; r < this.rows; r++) {
      used.push([]);
      for (c = 0; c < this.cols; c++) used[r].push(false);
    }
    for (var r1 = 0; r1 < this.rows; r1++) {
      for (var c1 = 0; c1 < this.cols; c1++) {
        if (!test(c1, r1) || used[r1][c1]) continue;
        var w = 1;
        while (c1 + w < this.cols && test(c1 + w, r1) && !used[r1][c1 + w]) w++;
        var h = 1;
        outer:
        while (r1 + h < this.rows) {
          for (var k = 0; k < w; k++) {
            if (!test(c1 + k, r1 + h) || used[r1 + h][c1 + k]) break outer;
          }
          h++;
        }
        for (var rr = r1; rr < r1 + h; rr++) {
          for (var cc = c1; cc < c1 + w; cc++) used[rr][cc] = true;
        }
        rects.push({ c: c1, r: r1, w: w, h: h });
      }
    }
    return rects;
  };

  /* ------------------------------------------------------------- 通用工具 */
  World.prototype.box = function (scene, o) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d),
      (typeof o.mat === 'string') ? (this.mat[o.mat] || this.mat.concrete) : o.mat);
    mesh.position.set(o.x, o.y, o.z);
    if (o.rx || o.ry || o.rz) mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.meshes.push(mesh);
    this.colliders.push({
      min: new THREE.Vector3(o.x - o.w / 2, o.y - o.h / 2, o.z - o.d / 2),
      max: new THREE.Vector3(o.x + o.w / 2, o.y + o.h / 2, o.z + o.d / 2),
      mesh: mesh, nav: o.nav !== false
    });
    return mesh;
  };

  World.prototype._collider = function (x, yCenter, z, w, h, d) {
    this.colliders.push({
      min: new THREE.Vector3(x - w / 2, yCenter - h / 2, z - d / 2),
      max: new THREE.Vector3(x + w / 2, yCenter + h / 2, z + d / 2),
      mesh: null
    });
  };

  /* 楼梯：最高一级与 topStart 齐平，逐级向外降低 */
  World.prototype.stairs = function (scene, o) {
    for (var i = 0; i < o.steps; i++) {
      var top = (o.topStart !== undefined) ? (o.topStart - i * o.rise) : ((i + 1) * o.rise);
      if (top < o.rise) top = o.rise;
      var cx = o.x + o.dirX * (i + 0.5) * o.run;
      var cz = o.z + o.dirZ * (i + 0.5) * o.run;
      var w = o.dirX !== 0 ? o.run : o.width;
      var d = o.dirZ !== 0 ? o.run : o.width;
      this.box(scene, {
        x: cx, y: top / 2, z: cz, w: w, h: top, d: d,
        mat: o.mat || 'stone'
      });
    }
  };

  FPS.World = World;
  /* ---------------------------------------------------------------------
   * 立面装饰：给每栋建筑朝街的一面加上窗户、百叶窗、窗台、门
   * 用 InstancedMesh 一次性画完，性能友好
   * ------------------------------------------------------------------- */
  World.prototype._decorateFacades = function (scene) {
    var self = this;
    var windows = [], shutters = [], sills = [], doors = [];
    var shutterMats = [this.mat.shutterA, this.mat.shutterB, this.mat.shutterC];

    this.buildingRects.forEach(function (b) {
      var signPlaced = false;
      var sides = [
        { axis: 'x', from: b.cx - b.ww / 2 + 1.6, to: b.cx + b.ww / 2 - 1.6, fixed: b.cz - b.dd / 2, out: -1, rot: 0 },
        { axis: 'x', from: b.cx - b.ww / 2 + 1.6, to: b.cx + b.ww / 2 - 1.6, fixed: b.cz + b.dd / 2, out: 1, rot: 0 },
        { axis: 'z', from: b.cz - b.dd / 2 + 1.6, to: b.cz + b.dd / 2 - 1.6, fixed: b.cx - b.ww / 2, out: -1, rot: Math.PI / 2 },
        { axis: 'z', from: b.cz - b.dd / 2 + 1.6, to: b.cz + b.dd / 2 - 1.6, fixed: b.cx + b.ww / 2, out: 1, rot: Math.PI / 2 }
      ];

      sides.forEach(function (side) {
        var len = side.to - side.from;
        if (len < 1) return;
        var count = Math.max(1, Math.floor(len / 3));
        for (var i = 0; i < count; i++) {
          var t = side.from + (i + 0.5) * (len / count);
          var x, z;
          if (side.axis === 'x') { x = t; z = side.fixed; } else { x = side.fixed; z = t; }

          // 外侧那格必须是可通行区域，否则说明被其他建筑挡住，不开窗
          var probe = side.axis === 'x' ? { x: x, z: z + side.out * 2.0 } : { x: x + side.out * 2.0, z: z };
          var tile = self.worldToTile(probe.x, probe.z);
          if (!self.isWalkableTile(tile.col, tile.row) && !self.isPlatformTile(tile.col, tile.row)) return;

          var px = side.axis === 'x' ? x : x + side.out * 0.06;
          var pz = side.axis === 'x' ? z + side.out * 0.06 : z;
          var seed = Math.abs(Math.round(x * 7 + z * 13));

          // 底层偶尔做成一扇门
          if (i % 3 === 0 && b.height >= 6) {
            var doorX = side.axis === 'x' ? x : x + side.out * 0.07;
            var doorZ = side.axis === 'x' ? z + side.out * 0.07 : z;
            doors.push({ x: doorX, y: 1.15, z: doorZ, rot: side.rot, mat: (seed % 2) ? self.mat.woodDark : self.mat.wood });
            // 有功能的建筑在门上方挂招牌（被墙挡住的位置直接跳过）
            if (b.role && b.role.text && !signPlaced && self._facadeOpen(side, x, z)) {
              signPlaced = true;
              self._placeSign(scene, side, x, z, b);
            }
          }

          var rows = b.height >= 7.5 ? [2.9, 5.6] : [2.9];
          rows.forEach(function (wy) {
            windows.push({ x: px, y: wy, z: pz, rot: side.rot });
            var sx = side.axis === 'x' ? 0.92 : 0;
            var sz = side.axis === 'x' ? 0 : 0.92;
            shutters.push({ x: px + sx, y: wy, z: pz + sz, rot: side.rot, mat: shutterMats[seed % 3] });
            shutters.push({ x: px - sx, y: wy, z: pz - sz, rot: side.rot, mat: shutterMats[seed % 3] });
            var sillX = side.axis === 'x' ? x : x + side.out * 0.16;
            var sillZ = side.axis === 'x' ? z + side.out * 0.16 : z;
            sills.push({ x: sillX, y: wy - 0.86, z: sillZ, rot: side.rot });
            // 窗台是有实体的，可以跳上去站着
            self.colliders.push({
              min: new THREE.Vector3(
                sillX - (side.axis === 'x' ? 0.8 : 0.17), wy - 0.95,
                sillZ - (side.axis === 'x' ? 0.17 : 0.8)),
              max: new THREE.Vector3(
                sillX + (side.axis === 'x' ? 0.8 : 0.17), wy - 0.79,
                sillZ + (side.axis === 'x' ? 0.17 : 0.8)),
              mesh: null, nav: false
            });
          });
        }
      });
    });

    var dummy = new THREE.Object3D();
    function makeInstanced(geo, mat, list, castShadow) {
      if (!list.length) return null;
      var inst = new THREE.InstancedMesh(geo, mat, list.length);
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, it.rot || 0, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = !!castShadow;
      inst.receiveShadow = true;
      scene.add(inst);
      return inst;
    }

    makeInstanced(new THREE.BoxGeometry(1.3, 1.62, 0.16), this.mat.glass, windows, false);
    makeInstanced(new THREE.BoxGeometry(0.5, 1.5, 0.1), this.mat.shutterA, shutters, false);
    makeInstanced(new THREE.BoxGeometry(1.6, 0.14, 0.34), this.mat.stone, sills, false);

    // 门（分两种材质各建一次实例）
    var woodDoors = doors.filter(function (d) { return d.mat === self.mat.wood; });
    var darkDoors = doors.filter(function (d) { return d.mat === self.mat.woodDark; });
    makeInstanced(new THREE.BoxGeometry(1.2, 2.3, 0.18), this.mat.wood, woodDoors, false);
    makeInstanced(new THREE.BoxGeometry(1.2, 2.3, 0.18), this.mat.woodDark, darkDoors, false);
  };

  /* ---------------------------------------------------------------------
   * 二层平台：直接由雷达图上的黄色区域自动生成
   * 每块平台都会自动找位置摆楼梯，栏杆也会自动给楼梯口留空
   * ------------------------------------------------------------------- */
  World.prototype._findStairSpot = function (rect, y) {
    var steps = Math.round(y / 0.25);
    var run = 0.45;
    var need = Math.ceil((steps * run) / TILE) + 1;   // 楼梯需要占用的格数
    var dirs = [
      { dx: 0, dz: -1, side: 'n' }, { dx: 0, dz: 1, side: 's' },
      { dx: -1, dz: 0, side: 'w' }, { dx: 1, dz: 0, side: 'e' }
    ];
    for (var di = 0; di < dirs.length; di++) {
      var dir = dirs[di];
      var edgeLen = dir.dx !== 0 ? rect.h : rect.w;
      var mid = Math.floor(edgeLen / 2);
      for (var k = 0; k < edgeLen; k++) {
        var off = mid + (k % 2 === 0 ? Math.floor(k / 2) : -Math.ceil(k / 2));
        if (off < 0 || off >= edgeLen) continue;
        var c, r;
        if (dir.dx !== 0) {
          c = dir.dx > 0 ? rect.c + rect.w : rect.c - 1;
          r = rect.r + off;
        } else {
          c = rect.c + off;
          r = dir.dz > 0 ? rect.r + rect.h : rect.r - 1;
        }
        var ok = true;
        for (var s = 0; s < need; s++) {
          var ch = this.tileAt(c + dir.dx * s, r + dir.dz * s);
          // 楼梯经过的格子必须是一层空地（不能是墙、二层平台或摆了道具的格子）
          if (ch !== '.' && ch !== 'A' && ch !== 'B' && ch !== 'P' && ch !== 'T') { ok = false; break; }
        }
        if (!ok) continue;
        var base = this.tileToWorld(c, r);
        return {
          side: dir.side, dirX: dir.dx, dirZ: dir.dz, width: TILE * 1.4,
          x: dir.dx !== 0
            ? (dir.dx > 0 ? this.colX(rect.c + rect.w) : this.colX(rect.c))
            : base.x,
          z: dir.dz !== 0
            ? (dir.dz > 0 ? this.rowZ(rect.r + rect.h) : this.rowZ(rect.r))
            : base.z
        };
      }
    }
    return null;
  };

  World.prototype._buildTerraces = function (scene) {
    var self = this;
    var y = 3.0;
    var built = 0;
    /* kind: '2' 地面上的平台（下面是通的）；'3' 建筑墙顶的平台（下面实心） */
    function buildOne(rect, overSolid) {
      if (rect.w * rect.h < 3) return;                  // 太小的黄色块不生成平台
      var t = {
        x0: self.colX(rect.c), x1: self.colX(rect.c + rect.w),
        z0: self.rowZ(rect.r), z1: self.rowZ(rect.r + rect.h), y: y
      };
      var spot = self._findStairSpot(rect, y);
      if (!spot) return;                                 // 没有地方放楼梯就不生成，保证一定上得去
      built++;
      var w = t.x1 - t.x0, d = t.z1 - t.z0;
      var cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;

      if (overSolid) {
        // 墙顶平台：整块实心到 3 米，顶面就是二层地面
        self.box(scene, { x: cx, y: t.y / 2, z: cz, w: w, h: t.y, d: d, mat: 'stone' });
      } else {
        // 地面上方的台面（离地 2.56~3.0 米，下面是通的，可以走人）
        self.box(scene, { x: cx, y: t.y - 0.22, z: cz, w: w, h: 0.44, d: d, mat: 'stone' });

        // 边缘支撑柱（每 ~6 米一根）
        var nx = Math.max(1, Math.round(w / 6)), nz = Math.max(1, Math.round(d / 6));
        for (var i = 0; i <= nx; i++) {
          for (var j = 0; j <= nz; j++) {
            var isEdge = (i === 0 || i === nx || j === 0 || j === nz);
            if (!isEdge) continue;
            self.box(scene, {
              x: t.x0 + 0.45 + (w - 0.9) * (i / nx),
              y: (t.y - 0.44) / 2,
              z: t.z0 + 0.45 + (d - 0.9) * (j / nz),
              w: 0.5, h: t.y - 0.44, d: 0.5, mat: 'stone'
            });
          }
        }
      }

      /* 栏杆：分段铺设，楼梯口自动留口，避免把上楼的路堵死 */
      var railH = 1.05, railY = t.y + railH / 2;
      var opening = null;
      if (spot) {
        var st = spot;
        if (st.dirX !== 0) {
          opening = {
            minX: t.x1 - 0.7, maxX: t.x1 + 0.7,
            minZ: st.z - st.width / 2 - 0.5, maxZ: st.z + st.width / 2 + 0.5
          };
        } else {
          opening = {
            minZ: t.z1 - 0.7, maxZ: t.z1 + 0.7,
            minX: st.x - st.width / 2 - 0.5, maxX: st.x + st.width / 2 + 0.5
          };
        }
      }
      function inOpening(px, pz, rw, rd) {
        if (!opening) return false;
        return (px + rw / 2 > opening.minX && px - rw / 2 < opening.maxX &&
                pz + rd / 2 > opening.minZ && pz - rd / 2 < opening.maxZ);
      }
      function railRun(horizontal, fixed, from, to) {
        var len = to - from;
        if (len <= 0.1) return;
        var segs = Math.max(1, Math.round(len / 1.2));
        for (var i = 0; i < segs; i++) {
          var a = from + i * len / segs;
          var b = from + (i + 1) * len / segs;
          var m = (a + b) / 2;
          var px = horizontal ? m : fixed;
          var pz = horizontal ? fixed : m;
          if (inOpening(px, pz, horizontal ? (b - a) : 0.16, horizontal ? 0.16 : (b - a))) continue;
          self.box(scene, { x: px, y: railY, z: pz, w: horizontal ? (b - a) : 0.14, h: 0.1, d: horizontal ? 0.14 : (b - a), mat: 'iron', nav: false });
          self.box(scene, { x: px, y: railY - 0.45, z: pz, w: horizontal ? (b - a) : 0.14, h: 0.07, d: horizontal ? 0.14 : (b - a), mat: 'iron', nav: false });
        }
      }
      railRun(true, t.z0 + 0.1, t.x0 + 0.05, t.x1 - 0.05);
      railRun(true, t.z1 - 0.1, t.x0 + 0.05, t.x1 - 0.05);
      railRun(false, t.x0 + 0.1, t.z0 + 0.05, t.z1 - 0.05);
      railRun(false, t.x1 - 0.1, t.z0 + 0.05, t.z1 - 0.05);

      // 楼梯（自动找到的位置）
      var steps = Math.round(t.y / 0.25);
      self.stairs(scene, {
        x: spot.x, z: spot.z, dirX: spot.dirX, dirZ: spot.dirZ,
        steps: steps, run: 0.45, rise: 0.25, width: spot.width, topStart: t.y
      });
      var sp = { x: self.colX(rect.c) + (rect.w * TILE) / 2, z: self.rowZ(rect.r) + (rect.h * TILE) / 2 };
      self.stairFootprints.push({
        x: spot.x + spot.dirX * 2.7, z: spot.z + spot.dirZ * 2.7,
        w: spot.dirX !== 0 ? 6.0 : spot.width + 1.0,
        d: spot.dirZ !== 0 ? 6.0 : spot.width + 1.0
      });
      void sp;
    }
    this._mergeCells(function (c, r) { return self.tileAt(c, r) === '3'; })
      .forEach(function (rect) { buildOne(rect, true); });
    this._mergeCells(function (c, r) { return self.tileAt(c, r) === '2'; })
      .forEach(function (rect) { buildOne(rect, false); });
    this.terraceCount = built;
  };

  /* ---------------------------------------------------------------------
   * 拱廊（参考照片里的连拱柱廊），给包点广场增加层次
   * ------------------------------------------------------------------- */
  World.prototype._buildArcades = function (scene) {
    var self = this;
    function arcade(x0, x1, z0, z1, along, y) {
      // along = 'x' 表示柱廊沿 x 方向延伸
      var len = along === 'x' ? (x1 - x0) : (z1 - z0);
      var bays = Math.max(3, Math.round(len / 6));
      var step = len / bays;

      for (var i = 0; i <= bays; i++) {
        var t = (along === 'x' ? x0 : z0) + i * step;
        var px = along === 'x' ? t : x0;
        var pz = along === 'x' ? z0 : t;
        self.box(scene, { x: px, y: y / 2, z: pz, w: 0.8, h: y, d: 0.8, mat: 'stone' });

        if (i < bays) {
          // 拱：下半段用两块斜的方砖拼出弧线
          var mx = along === 'x' ? (t + step / 2) : x0;
          var mz = along === 'x' ? z0 : (t + step / 2);
          for (var k = -1; k <= 1; k += 2) {
            var qx = along === 'x' ? (t + step / 2 + k * step * 0.22) : x0;
            var qz = along === 'x' ? z0 : (t + step / 2 + k * step * 0.22);
            self.box(scene, {
              x: qx, y: y - 0.55, z: qz,
              w: along === 'x' ? 0.55 : 0.8, h: 1.1, d: along === 'x' ? 0.8 : 0.55,
              mat: 'stone', rz: along === 'x' ? (k * 0.5) : 0,
              rx: along === 'x' ? 0 : (k * -0.5)
            });
          }
          void mx; void mz;
        }
      }

      // 柱廊顶（离地 3.2 米以上，不挡地面通行）
      self.box(scene, {
        x: (x0 + x1) / 2, y: y + 0.3, z: (z0 + z1) / 2,
        w: along === 'x' ? (x1 - x0 + 1.2) : 3.4,
        h: 0.6, d: along === 'x' ? 3.4 : (z1 - z0 + 1.2),
        mat: 'stone', nav: false
      });
    }

    /* A 包点东侧：一排拱廊（照片 5 的那种） */
    arcade(this.colX(32), this.colX(32), this.rowZ(8), this.rowZ(15), 'z', 3.2);
    /* B 包点北侧 */
    arcade(this.colX(42), this.colX(48), this.rowZ(33), this.rowZ(33), 'x', 3.2);
  };

  /* --------------------------------------------------------------- 道具 */
  World.prototype._solidProp = function (scene, mesh, x, z, w, d, h) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.meshes.push(mesh);
    this.colliders.push({
      min: new THREE.Vector3(x - w / 2, 0, z - d / 2),
      max: new THREE.Vector3(x + w / 2, h, z + d / 2),
      mesh: mesh, nav: true
    });
    return mesh;
  };

  World.prototype._visual = function (scene, mesh) {
    mesh.castShadow = true;
    scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  };

  World.prototype._buildProps = function (scene) {
    var i, p, seed;
    var self = this;
    /* 避开楼梯：楼梯上/旁边不放道具，避免遮阳伞压在台阶上 */
    function avoidStairs(x, z) {
      for (var k = 0; k < self.stairFootprints.length; k++) {
        var f = self.stairFootprints[k];
        if (x > f.x - f.w / 2 && x < f.x + f.w / 2 && z > f.z - f.d / 2 && z < f.z + f.d / 2) {
          // 往侧面挪开
          var push = (f.d > f.w) ? [f.w / 2 + 2.2, 0] : [0, f.d / 2 + 2.2];
          return { x: x + push[0], z: z + push[1] };
        }
      }
      return { x: x, z: z };
    }
    /* 1) 地图字符里的小建筑：矮墙 w / 箱子 o / 石柱 c / 花坛 p */
    var charToType = { o: 'crate', w: 'lowwall', c: 'column', p: 'planter' };
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var ch = this.tileAt(c, r);
        if (SMALL_PROPS.indexOf(ch) < 0) continue;
        p = this.tileToWorld(c, r);
        seed = (c * 37 + r * 71) % 89;
        var adj = avoidStairs(p.x, p.z);
        this._prop(scene, charToType[ch], adj.x, adj.z, seed);
      }
    }
    /* 2) 手工摆放的地标道具 */
    for (i = 0; i < PROPS.length; i++) {
      var def = PROPS[i];
      p = this.tileToWorld(def[1], def[2]);
      seed = (def[1] * 37 + def[2] * 71 + i * 13) % 89;
      var adj2 = avoidStairs(p.x, p.z);
      this._prop(scene, def[0], adj2.x + ((seed % 5) - 2) * 0.1, adj2.z + ((seed * 3 % 5) - 2) * 0.1, seed);
    }
  };

  World.prototype._prop = function (scene, type, x, z, seed) {
    var m = this.mat, i;
    switch (type) {
      case 'lowwall': {
        var lw = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 0.5), m.stone);
        lw.position.set(x, 0.5, z);
        lw.rotation.y = (seed % 2) * Math.PI / 2;
        var lwW = (seed % 2) ? 0.5 : 1.9, lwD = (seed % 2) ? 1.9 : 0.5;
        this._solidProp(scene, lw, x, z, lwW, lwD, 1.0);
        break;
      }
      case 'column': {
        var col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 2.9, 10), m.stone);
        col.position.set(x, 1.45, z);
        this._solidProp(scene, col, x, z, 0.75, 0.75, 2.9);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.22, 0.94), m.stone);
        cap.position.set(x, 3.0, z);
        this._visual(scene, cap);
        break;
      }
      case 'crate': {
        var box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 1.5), m.wood);
        box.position.set(x, 0.53, z);
        box.rotation.y = ((seed % 5) - 2) * 0.07;
        this._solidProp(scene, box, x, z, 1.5, 1.5, 1.05);
        break;
      }
      case 'barrel': {
        var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.98, 12), m.woodDark);
        barrel.position.set(x, 0.49, z);
        this._solidProp(scene, barrel, x, z, 0.9, 0.9, 0.98);
        break;
      }
      case 'plant': {
        var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.6, 10), m.stone);
        pot.position.set(x, 0.3, z);
        this._solidProp(scene, pot, x, z, 0.7, 0.7, 0.6);
        var bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), m.foliage);
        bush.position.set(x, 0.95, z);
        this._visual(scene, bush);
        break;
      }
      case 'planter': {
        var base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.62, 1.0), m.stone);
        base.position.set(x, 0.31, z);
        this._solidProp(scene, base, x, z, 2.4, 1.0, 0.62);
        for (i = -1; i <= 1; i++) {
          var b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), m.foliage);
          b2.position.set(x + i * 0.75, 0.95, z);
          this._visual(scene, b2);
        }
        break;
      }
      case 'umbrella': {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 8), m.iron);
        pole.position.set(x, 1.25, z);
        this._solidProp(scene, pole, x, z, 0.35, 0.35, 2.5);
        var cloth = (seed % 2 === 0) ? m.clothBlue : m.clothCream;
        var canopy = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.62, 8), cloth);
        canopy.position.set(x, 2.62, z);
        this._visual(scene, canopy);
        var tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 12), m.wood);
        tableTop.position.set(x, 0.74, z);
        this._solidProp(scene, tableTop, x, z, 1.24, 1.24, 0.78);
        break;
      }
      case 'table': {
        var top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.09, 10), m.wood);
        top.position.set(x, 0.74, z);
        this._solidProp(scene, top, x, z, 1.2, 1.2, 0.78);
        break;
      }
      case 'statue': {
        var ped = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), m.stone);
        ped.position.set(x, 0.55, z);
        this._solidProp(scene, ped, x, z, 1.3, 1.3, 1.1);
        var body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.5, 8), m.stone);
        body.position.set(x, 1.85, z);
        this._solidProp(scene, body, x, z, 0.72, 0.72, 2.6);
        var head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), m.stone);
        head.position.set(x, 2.75, z);
        this._visual(scene, head);
        break;
      }
      case 'bench': {
        var seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), m.wood);
        seat.position.set(x, 0.48, z);
        this._solidProp(scene, seat, x, z, 2.0, 0.5, 0.55);
        var back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.1), m.wood);
        back.position.set(x, 0.82, z - 0.2);
        this._visual(scene, back);
        break;
      }
      case 'fountain': {
        var basin = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.75, 20), m.stone);
        basin.position.set(x, 0.37, z);
        this._solidProp(scene, basin, x, z, 4.3, 4.3, 0.78);
        var water = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.12, 20), m.water);
        water.position.set(x, 0.7, z);
        scene.add(water);
        this.meshes.push(water);
        var column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.6, 12), m.stone);
        column.position.set(x, 1.45, z);
        this._solidProp(scene, column, x, z, 0.8, 0.8, 1.6);
        var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.45, 0.3, 14), m.stone);
        bowl.position.set(x, 2.3, z);
        this._solidProp(scene, bowl, x, z, 1.6, 1.6, 2.45);
        break;
      }
      default:
        break;
    }
  };

  /* --------------------------------------------------- 街道细节与出生点标记 */
  World.prototype._buildDetails = function (scene) {
    var self = this;

    /* 出生点地面标记：玩家黄色圆环 + 机器人蓝色圆环（和雷达图一致） */
    function marker(worldPos, color, r) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.86, r, 40),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(worldPos.x, 0.06, worldPos.z);
      scene.add(ring);
      var inner = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.5, r * 0.58, 40),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
      );
      inner.rotation.x = -Math.PI / 2;
      inner.position.set(worldPos.x, 0.06, worldPos.z);
      scene.add(inner);
    }
    if (this.playerSpawnMarker) marker({ x: this.playerSpawnMarker.x, z: this.playerSpawnMarker.z }, 0xffd23c, 3.6);
    if (this.botSpawnMarker) marker({ x: this.botSpawnMarker.x, z: this.botSpawnMarker.z }, 0x3fd2ff, 3.6);

    /* 旗帜 */
    if (this.playerSpawnMarker) this._flag(scene, { x: this.playerSpawnMarker.x, z: this.playerSpawnMarker.z - 6 }, 0x3f78b8);
    if (this.botSpawnMarker) this._flag(scene, { x: this.botSpawnMarker.x, z: this.botSpawnMarker.z + 6 }, 0xc03a4c);

    /* 路灯（沿街） */
    var lamps = [[27, 6], [24, 12], [33, 11], [38, 10], [46, 13], [45, 20], [44, 26],
      [38, 29], [43, 32], [46, 40], [35, 36], [25, 30], [20, 36], [10, 36], [6, 40], [16, 24]];
    for (var i = 0; i < lamps.length; i++) {
      var p = this.tileToWorld(lamps[i][0], lamps[i][1]);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.4, 8), this.mat.iron);
      pole.position.set(p.x, 2.2, p.z);
      pole.castShadow = true;
      scene.add(pole);
      this.meshes.push(pole);
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.26, 0.42), this.mat.lamp);
      head.position.set(p.x, 4.45, p.z);
      scene.add(head);
      this.colliders.push({
        min: new THREE.Vector3(p.x - 0.2, 0, p.z - 0.2),
        max: new THREE.Vector3(p.x + 0.2, 4.4, p.z + 0.2),
        mesh: pole, nav: false
      });
    }

    /* 挂在建筑外墙上的雨棚（不悬空） */
    var awnings = [
      [10, 8, 'E', 0xb8384a], [12, 6, 'W', 0x3f78b8], [19, 6, 'S', 0xdca63c],
      [20, 13, 'W', 0x3f78b8], [26, 22, 'N', 0xb8384a], [14, 18, 'S', 0xdca63c],
      [10, 24, 'W', 0x3f78b8], [22, 26, 'N', 0xb8384a], [16, 10, 'E', 0xdca63c]
    ];
    for (var j = 0; j < awnings.length; j++) {
      var a = awnings[j];
      var q = this.tileToWorld(a[0], a[1]);
      var mat = new THREE.MeshStandardMaterial({ color: a[3], roughness: 0.9 });
      var aw = new THREE.Mesh(new THREE.BoxGeometry(a[2] === 'E' || a[2] === 'W' ? 1.6 : 3.0, 0.12, a[2] === 'N' || a[2] === 'S' ? 1.6 : 3.0), mat);
      var ox = a[2] === 'E' ? 0.9 : (a[2] === 'W' ? -0.9 : 0);
      var oz = a[2] === 'S' ? 0.9 : (a[2] === 'N' ? -0.9 : 0);
      aw.position.set(q.x + ox, 3.3, q.z + oz);
      aw.rotation.z = a[2] === 'E' ? -0.12 : (a[2] === 'W' ? 0.12 : 0);
      aw.rotation.x = a[2] === 'S' ? 0.12 : (a[2] === 'N' ? -0.12 : 0);
      aw.castShadow = true;
      scene.add(aw);
      this.meshes.push(aw);
    }
  };

  /* 招牌所在立面是不是敞开的（前面几格都不能是实心建筑，否则不挂招牌） */
  World.prototype._facadeOpen = function (side, x, z) {
    for (var d = 1.0; d <= 3.2; d += 1.1) {
      var px = side.axis === 'x' ? x : x + side.out * d;
      var pz = side.axis === 'x' ? z + side.out * d : z;
      var t = this.worldToTile(px, pz);
      var ch = this.tileAt(t.col, t.row);
      if (ch === '#' || ch === '3') return false;
    }
    return true;
  };

  /* 挂招牌 + 按建筑功能加装饰（齿轮 / 电机 / 公式 / 哑铃 / 灯笼…） */
  World.prototype._placeSign = function (scene, side, x, z, b) {
    var self = this;
    var role = b.role;
    var sgx = side.axis === 'x' ? x : x + side.out * 0.2;
    var sgz = side.axis === 'x' ? z + side.out * 0.2 : z;
    var sw = side.rot ? 0.16 : 2.6, sd = side.rot ? 2.6 : 0.16;

    var signMat = new THREE.MeshStandardMaterial({
      map: Textures.signTexture(role.text, role.bg, role.fg),
      roughness: 0.75, metalness: 0.05
    });
    var sign = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.9, sd), signMat);
    sign.position.set(sgx, 3.5, sgz);
    sign.castShadow = true;
    scene.add(sign);
    this.meshes.push(sign);
    this.colliders.push({
      min: new THREE.Vector3(sgx - sw / 2, 3.05, sgz - sd / 2),
      max: new THREE.Vector3(sgx + sw / 2, 3.95, sgz + sd / 2),
      mesh: sign, nav: false
    });

    // 招牌下的雨棚 / 装饰
    var decoMat = new THREE.MeshStandardMaterial({ color: role.bg, roughness: 0.85 });
    var ox = side.axis === 'x' ? 0 : side.out * 0.55;
    var oz = side.axis === 'x' ? side.out * 0.55 : 0;
    if (role.deco === 'awning' || role.deco === 'lantern') {
      var awn = new THREE.Mesh(new THREE.BoxGeometry(
        side.rot ? 1.2 : 3.0, 0.1, side.rot ? 3.0 : 1.2), decoMat);
      awn.position.set(x + ox, 2.95, z + oz);
      awn.castShadow = true;
      scene.add(awn);
      this.meshes.push(awn);
    }
    if (role.deco === 'lantern') {
      for (var li = -1; li <= 1; li += 2) {
        var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
        lamp.position.set(sgx + (side.rot ? 0 : li * 1.35), 3.0, sgz + (side.rot ? li * 1.35 : 0));
        scene.add(lamp);
        this.meshes.push(lamp);
      }
    }

    var wallX = side.axis === 'x' ? x : x + side.out * 0.25;
    var wallZ = side.axis === 'x' ? z + side.out * 0.25 : z;

    function addMesh(mesh) {
      mesh.castShadow = true;
      scene.add(mesh);
      self.meshes.push(mesh);
      return mesh;
    }

    if (role.deco === 'gear') {
      // 机械学院：墙上的齿轮 + 扳手
      var gearMat = new THREE.MeshStandardMaterial({ color: 0xc8a23c, roughness: 0.4, metalness: 0.85 });
      for (var gi = 0; gi < 2; gi++) {
        var gx = wallX + (side.rot ? 0 : (gi === 0 ? -2.4 : 2.4));
        var gz = wallZ + (side.rot ? (gi === 0 ? -2.4 : 2.4) : 0);
        var gear = new THREE.Mesh(new THREE.TorusGeometry(0.72 - gi * 0.16, 0.16, 8, 18), gearMat);
        gear.position.set(gx, 4.8, gz);
        gear.rotation.y = side.axis === 'x' ? 0 : Math.PI / 2;
        addMesh(gear);
        for (var ti = 0; ti < 8; ti++) {
          var ta = ti / 8 * Math.PI * 2;
          var tooth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.16), gearMat);
          var rr2 = 0.72 - gi * 0.16;
          tooth.position.set(gx + Math.cos(ta) * rr2, 4.8 + Math.sin(ta) * rr2, gz);
          tooth.rotation.z = ta;
          addMesh(tooth);
        }
      }
    } else if (role.deco === 'motor') {
      // 自动化学院：墙上的电机
      var mmMat = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.35, metalness: 0.9 });
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 16), mmMat);
      body.position.set(wallX, 4.9, wallZ);
      body.rotation.z = side.axis === 'x' ? Math.PI / 2 : 0;
      body.rotation.y = side.axis === 'x' ? 0 : Math.PI / 2;
      addMesh(body);
      var rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 10), this.mat.accentWarm);
      rotor.position.set(wallX + (side.rot ? 0 : 0.85), 4.35, wallZ + (side.rot ? 0.85 : 0));
      rotor.rotation.z = side.axis === 'x' ? Math.PI / 2 : 0;
      rotor.rotation.y = side.axis === 'x' ? 0 : Math.PI / 2;
      addMesh(rotor);
      void rotor;
    } else if (role.deco === 'formula') {
      // 理学院：墙上的高斯公式
      var board = new THREE.Mesh(new THREE.BoxGeometry(side.rot ? 0.12 : 3.4, 1.7, side.rot ? 3.4 : 0.12),
        new THREE.MeshStandardMaterial({ map: Textures.get('formula'), roughness: 0.7 }));
      board.position.set(wallX, 5.0, wallZ);
      addMesh(board);
    } else if (role.deco === 'dumbbell') {
      // 体育部 / 健身房：墙上的杠铃
      var barMat2 = new THREE.MeshStandardMaterial({ color: 0x9aa4ac, roughness: 0.3, metalness: 0.9 });
      var bar = new THREE.Mesh(new THREE.BoxGeometry(side.rot ? 0.16 : 3.2, 0.16, side.rot ? 3.2 : 0.16), barMat2);
      bar.position.set(wallX, 4.9, wallZ);
      addMesh(bar);
      for (var wi = -1; wi <= 1; wi += 2) {
        var wgt = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.28, 12), barMat2);
        wgt.position.set(wallX + (side.rot ? 0 : wi * 1.5), 4.9, wallZ + (side.rot ? wi * 1.5 : 0));
        wgt.rotation.z = side.axis === 'x' ? 0 : Math.PI / 2;
        addMesh(wgt);
      }
    } else if (role.deco === 'cross') {
      // 医疗站：白底绿十字
      var crossMat = new THREE.MeshBasicMaterial({ color: 0x1f9d55 });
      var c1 = new THREE.Mesh(new THREE.BoxGeometry(side.rot ? 0.1 : 1.1, 0.34, side.rot ? 1.1 : 0.1), crossMat);
      c1.position.set(wallX, 4.9, wallZ);
      addMesh(c1);
      var c2 = new THREE.Mesh(new THREE.BoxGeometry(side.rot ? 0.1 : 0.34, 1.1, side.rot ? 0.34 : 0.1), crossMat);
      c2.position.set(wallX, 4.9, wallZ);
      addMesh(c2);
    }
  };

  World.prototype._flag = function (scene, p, color) {
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 7, 8), this.mat.metal);
    pole.position.set(p.x, 3.5, p.z);
    pole.castShadow = true;
    scene.add(pole);
    this.meshes.push(pole);
    var banner = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.5),
      new THREE.MeshStandardMaterial({ color: color, roughness: 0.9, side: THREE.DoubleSide })
    );
    banner.position.set(p.x + 1.1, 6.0, p.z);
    scene.add(banner);
  };

  /* ------------------------------------------------------------- 出生点 */
  /* 取地图上某种字符区域的中心（用于出生点、地面标记） */
  World.prototype._regionCenter = function (ch) {
    var cells = [];
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (this.tileAt(c, r) === ch) cells.push([c, r]);
      }
    }
    if (!cells.length) return null;
    var sc = 0, sr = 0;
    var minC = 999, maxC = -1;
    cells.forEach(function (p) {
      sc += p[0]; sr += p[1];
      if (p[0] < minC) minC = p[0];
      if (p[0] > maxC) maxC = p[0];
    });
    var mc = Math.round(sc / cells.length), mr = Math.round(sr / cells.length);
    var w = this.tileToWorld(mc, mr);
    return { x: w.x, z: w.z, col: mc, row: mr, cells: cells, wide: (maxC - minC) };
  };

  World.prototype._defineSpawns = function () {
    var self = this;

    /* 玩家出生点：雷达图上的蓝色区域 */
    var pRegion = this._regionCenter('P');
    if (pRegion) {
      // 选一个"朝东有通路"的格子当出生点，避免一出生就贴墙
      var dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      var chosen = null, chosenDir = null;
      for (var di = 0; di < dirs.length && !chosen; di++) {
        for (var ci = 0; ci < pRegion.cells.length; ci++) {
          var cell = pRegion.cells[ci];
          if (this.isWalkableTile(cell[0] + dirs[di][0], cell[1] + dirs[di][1]) &&
              this.isWalkableTile(cell[0] + dirs[di][0] * 2, cell[1] + dirs[di][1] * 2)) {
            chosen = cell; chosenDir = dirs[di]; break;
          }
        }
      }
      var sw = chosen ? this.tileToWorld(chosen[0], chosen[1]) : { x: pRegion.x, z: pRegion.z };
      this.playerSpawn = { x: sw.x, y: this._settleY(sw.x, sw.z), z: sw.z };
      // 朝向 = 通路方向（相机 forward 为 (-sin, -cos)，所以要取反）
      this.playerSpawnYaw = chosenDir ? Math.atan2(-chosenDir[0], -chosenDir[1]) : -Math.PI / 2;
      this.playerSpawnMarker = pRegion;
    }

    /* 机器人出生点：雷达图上的绿色区域 */
    var tRegion = this._regionCenter('T');
    if (tRegion) {
      this.botSpawnMarker = tRegion;
      this.botSpawnCenter = { x: tRegion.x, z: tRegion.z };
      var list = Utils.shuffle(tRegion.cells.slice()).slice(0, 16);
      for (var i = 0; i < list.length; i++) {
        var w = this.tileToWorld(list[i][0], list[i][1]);
        this.spawnPoints.push({ x: w.x, y: this._settleY(w.x, w.z), z: w.z });
      }
    }
    if (!this.spawnPoints.length) {
      var c = this.tileToWorld(Math.floor(this.cols / 2), Math.floor(this.rows / 2));
      this.spawnPoints.push({ x: c.x, y: 0.01, z: c.z });
      this.botSpawnCenter = { x: c.x, z: c.z };
    }

    /* 巡逻路线（每队一条，覆盖全图） */
    function P(cc, rr) { var t = self.tileToWorld(cc, rr); return { x: t.x, z: t.z }; }
    this.routes = [
      { name: 'A区', points: [P(26, 9), P(27, 13), P(29, 16), P(33, 9)] },
      { name: 'A到东走廊', points: [P(33, 9), P(38, 9), P(43, 10), P(45, 12)] },
      { name: '东走廊到机器人', points: [P(45, 12), P(47, 15), P(47, 19), P(46, 21)] },
      { name: '机器人到B', points: [P(46, 23), P(47, 26), P(44, 30), P(45, 33), P(45, 36)] },
      { name: 'B区', points: [P(44, 35), P(46, 38), P(43, 40), P(45, 42)] },
      { name: '中路到南城', points: [P(35, 28), P(36, 30), P(33, 35), P(25, 44)] },
      { name: '西区', points: [P(6, 36), P(12, 38), P(14, 35), P(12, 42)] },
      { name: '玩家出生点', points: [P(3, 32), P(3, 36), P(3, 40), P(6, 42)] }
    ];
  };

  /* 把一个 xz 坐标落到最近的可站立表面上 */
  World.prototype._settleY = function (x, z) {
    var r = 0.5, h = 1.95;
    var tops = [0];
    for (var i = 0; i < this.colliders.length; i++) {
      var b = this.colliders[i];
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) {
        if (b.max.y > 0 && b.max.y < 7.5) tops.push(b.max.y);
      }
    }
    tops.sort(function (a, b) { return b - a; });
    for (var j = 0; j < tops.length; j++) {
      var p = { x: x, y: tops[j] + 0.01, z: z };
      if (!Collide.overlapsAny(this.colliders, p, r, h)) return p.y;
    }
    return 0.01;
  };

  World.prototype.pickSpawn = function (playerPos, minDist) {
    var far = [], all = this.spawnPoints;
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      var dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      if (Math.sqrt(dx * dx + dz * dz) >= minDist) far.push(p);
    }
    return Utils.choose(far.length ? far : all);
  };

  /* --------------------------------------------------- 小地图数据 */
  World.prototype._buildMapInfo = function () {
    var solid = [];
    for (var r = 0; r < this.rows; r++) {
      solid.push([]);
      for (var c = 0; c < this.cols; c++) solid[r].push(this.tileAt(c, r) === SOLID);
    }
    this.mapInfo = {
      cols: this.cols, rows: this.rows, tile: TILE,
      originX: ORIGIN_X, originZ: ORIGIN_Z,
      solid: solid, labels: LABELS
    };
  };

  FPS.World = World;
  FPS.MAP_DATA = { rows: MAP, tile: TILE, originX: ORIGIN_X, originZ: ORIGIN_Z, props: PROPS };
})(window.FPS);
