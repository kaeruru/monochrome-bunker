import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TILE_MAP,
  TILE_SIZE,
  WALL_HEIGHT,
  MAP_COLS,
  MAP_ROWS,
  tileToWorld,
  worldToTile,
  getDoorOrientation,
  normalizeMapStrings
} from './tilemapData.js';
import { createIndustrialMaterials } from './textures.js';
import { MonsterEntity, PlayerCharacterEntity } from './models.js';
import { sound } from './audio.js';

export const CH2_HIGH_Y = 1.40;
export const CH2_WATER_Y = 0.56;

const TRANSITION_DIRS = {
  S: { dx: 0, dz: 1, yaw: 0 },
  N: { dx: 0, dz: -1, yaw: Math.PI },
  E: { dx: 1, dz: 0, yaw: Math.PI / 2 },
  W: { dx: -1, dz: 0, yaw: -Math.PI / 2 },
  DEFAULT: { dx: 0, dz: 1, yaw: 0 }
};

export class Map3D {
  constructor(scene, customMapStrings = null, chapterId = 'chapter1') {
    this.scene = scene;
    this.chapterId = chapterId;
    this.materials = createIndustrialMaterials();

    this.halfMapW = (MAP_COLS * TILE_SIZE) / 2;
    this.halfMapH = (MAP_ROWS * TILE_SIZE) / 2;

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.doors = [];
    this.doorGrid = new Map();
    this.ladders = [];
    this.cctvConfigs = [];
    this.propColliders = [];
    this.monsters = [];
    this.ceilingLamps = [];
    this.lampLightPool = [];
    this.companion = null;
    this.consolePos = { x: 0, y: 0, z: -8 };
    this.spawnPos = { x: 0, y: 0, z: -2 };
    this.generatorCore = null;
    this.bunkerAmbient = null;
    this.genLight = null;
    this.consoleLight = null;
    this.isBlackout = false;

    // 공유 기본 지오메트리
    this.wallGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
    this.floorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);

    const initialMap = customMapStrings ? normalizeMapStrings(customMapStrings) : TILE_MAP;
    this.activeMap = initialMap;
    this.buildFromTileMap(this.activeMap);
  }

  rebuildMap(newMapStrings, chapterId = 'chapter1') {
    this.chapterId = chapterId;
    this.clearMap();
    this.activeMap = normalizeMapStrings(newMapStrings);
    this.buildFromTileMap(this.activeMap);
  }

  clearMap() {
    while (this.mapGroup.children.length > 0) {
      const obj = this.mapGroup.children[0];
      this.mapGroup.remove(obj);
    }
    this.doors = [];
    this.doorGrid = new Map();
    this.ladders = [];
    this.cctvConfigs = [];
    this.propColliders = [];
    this.monsters = [];
    this.ceilingLamps = [];
    this.lampLightPool = [];
    this.companion = null;
    this.generatorCore = null;
    this.bunkerAmbient = null;
    this.genLight = null;
    this.consoleLight = null;
    this.isBlackout = false;
  }

  getTileChar(col, row) {
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return '#';
    return this.activeMap[row]?.[col] || ' ';
  }

  /**
   * 해당 타일이 저지대 침수 하수관(Level 0)에 속하는지 판별
   * - 'W' 타일이거나, 챕터 2에서 'W' 한가운데에 배치된 조명('L') 및 카메라('1'~'4') 포함
   */
  isWaterTile(col, row) {
    const ch = this.getTileChar(col, row);
    if (ch === 'W') return true;
    if (this.chapterId === 'chapter2' && ['L', '1', '2', '3', '4'].includes(ch)) {
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dc, dr] of dirs) {
        if (this.getTileChar(col + dc, row + dr) === 'W') return true;
      }
    }
    return false;
  }

  /**
   * 챕터 2 수직 레벨 구분:
   * - 'WALL'   : 벽/기둥 ('#', ' ')
   * - 'LOW'    : 저지대 침수 원통 하수관 (Y = 0.0m, 수면 0.56m)
   * - 'HIGH'   : 고지대 아치형 건조 회랑/광장 (Y = 1.40m)
   * - 'RAMP'   : 오르막 경사로 ('M', 0.0m <-> 1.40m)
   * - 'LADDER' : 벽면 철제 사다리 ('H', 0.0m <-> 1.40m)
   */
  getTileLevel(col, row) {
    const ch = this.getTileChar(col, row);
    if (ch === '#' || ch === ' ') return 'WALL';
    if (this.chapterId !== 'chapter2') return 'FLAT';
    if (ch === 'M') return 'RAMP';
    if (ch === 'H') return 'LADDER';
    if (this.isWaterTile(col, row)) return 'LOW';
    return 'HIGH';
  }

  /**
   * 경사로('M') 또는 사다리('H') 타일에서 저지대(LOW) -> 고지대(HIGH)로 올라가는 방향 벡터 반환
   */
  getTransitionDir(col, row) {
    const nLvl = this.getTileLevel(col, row - 1);
    const sLvl = this.getTileLevel(col, row + 1);
    const wLvl = this.getTileLevel(col - 1, row);
    const eLvl = this.getTileLevel(col + 1, row);

    // 1. 고지대(HIGH)가 인접한 방향을 우선 탐색 (Three.js 로컬 +Z를 (dx, dz) 방향으로 정렬)
    // Three.js 좌표계: +Z = 남(dz=1, yaw=0), -Z = 북(dz=-1, yaw=PI), +X = 동(dx=1, yaw=PI/2), -X = 서(dx=-1, yaw=-PI/2)
    if (sLvl === 'HIGH') return TRANSITION_DIRS.S;
    if (nLvl === 'HIGH') return TRANSITION_DIRS.N;
    if (eLvl === 'HIGH') return TRANSITION_DIRS.E;
    if (wLvl === 'HIGH') return TRANSITION_DIRS.W;

    // 2. 인접한 저지대(LOW)의 반대편 방향으로 상승
    if (nLvl === 'LOW') return TRANSITION_DIRS.S;
    if (sLvl === 'LOW') return TRANSITION_DIRS.N;
    if (wLvl === 'LOW') return TRANSITION_DIRS.E;
    if (eLvl === 'LOW') return TRANSITION_DIRS.W;

    return TRANSITION_DIRS.DEFAULT;
  }

  /**
   * 두 인접 타일 사이를 걸어서(또는 경사로/사다리로) 이동 가능한지 판별 (AI 경로 탐색 및 충돌용)
   */
  canStepBetweenTiles(c0, r0, c1, r1) {
    if (this.chapterId !== 'chapter2') return true;
    const l0 = this.getTileLevel(c0, r0);
    const l1 = this.getTileLevel(c1, r1);
    if (l0 === 'WALL' || l1 === 'WALL') return false;
    // 저지대(LOW)와 고지대(HIGH) 사이는 1.40m 수직 콘크리트 턱이 가로막고 있으므로 직접 이동 불가!
    if ((l0 === 'LOW' && l1 === 'HIGH') || (l0 === 'HIGH' && l1 === 'LOW')) {
      return false;
    }
    return true;
  }

  /**
   * 월드 (x, z) 좌표에서의 실제 바닥 높이(Y) 계산 (무할당 인라인 스칼라 최적화)
   */
  getFloorHeightAt(x, z) {
    if (this.chapterId !== 'chapter2') return 0.0;
    const col = Math.floor((x + this.halfMapW) / TILE_SIZE);
    const row = Math.floor((z + this.halfMapH) / TILE_SIZE);
    const lvl = this.getTileLevel(col, row);
    if (lvl === 'LOW') return 0.0;
    if (lvl === 'HIGH') return CH2_HIGH_Y;

    const tileCenterX = col * TILE_SIZE - this.halfMapW + TILE_SIZE / 2;
    const tileCenterZ = row * TILE_SIZE - this.halfMapH + TILE_SIZE / 2;
    const tDir = this.getTransitionDir(col, row);
    const lx = (x - tileCenterX) / TILE_SIZE;
    const lz = (z - tileCenterZ) / TILE_SIZE;
    const proj = lx * tDir.dx + lz * tDir.dz; // -0.5 (저지대 끝) ~ +0.5 (고지대 끝)

    if (lvl === 'RAMP') {
      const prog = Math.max(0, Math.min(1, proj + 0.5));
      return prog * CH2_HIGH_Y;
    }
    if (lvl === 'LADDER') {
      // 사다리 타일 진입 후 고지대 벽면 쪽(-0.28 -> +0.38)으로 전진하면 사다리를 타고 부드럽게 상승!
      const prog = Math.max(0, Math.min(1, (proj + 0.28) / 0.66));
      return prog * CH2_HIGH_Y;
    }
    return 0.0;
  }

  buildFromTileMap(mapArray) {
    let doorIndex = 1;
    const isCh2 = this.chapterId === 'chapter2';

    // 대규모 지오메트리 병합 수집 버퍼 (드로우콜 2,000+개 -> 6개 내외로 압축)
    const wallGeos = [];
    const wallBrickGeos = [];
    const wallFlumeGeos = [];
    const floorCorridorGeos = [];
    const floorBunkerGeos = [];
    const floorRoomGeos = [];
    const floorStoneWalkwayGeos = [];
    const floorWaterGeos = [];
    const floorWaterBedGeos = [];
    const ceilingGeos = [];

    const baseWallGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
    const baseFloorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);

    // 챕터 2 전용 3D 아키텍처 지오메트리 헬퍼 (BoxGeometry 변환 후 병합하여 속성 100% 호환 보장)
    const addBoxTo = (targetArr, w, h, d, tx, ty, tz, rx = 0, ry = 0, rz = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Matrix4();
      m.makeTranslation(tx, ty, tz);
      if (ry !== 0) m.multiply(new THREE.Matrix4().makeRotationY(ry));
      if (rx !== 0) m.multiply(new THREE.Matrix4().makeRotationX(rx));
      if (rz !== 0) m.multiply(new THREE.Matrix4().makeRotationZ(rz));
      g.applyMatrix4(m);
      targetArr.push(g);
    };

    const addPlaneTo = (targetArr, w, h, tx, ty, tz, rx = -Math.PI / 2, ry = 0, rz = 0) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Matrix4();
      m.makeTranslation(tx, ty, tz);
      if (ry !== 0) m.multiply(new THREE.Matrix4().makeRotationY(ry));
      if (rx !== 0) m.multiply(new THREE.Matrix4().makeRotationX(rx));
      if (rz !== 0) m.multiply(new THREE.Matrix4().makeRotationZ(rz));
      g.applyMatrix4(m);
      targetArr.push(g);
    };

    // 타일의 주 진행 축('NS' 또는 'EW') 판별
    const getDominantAxis = (col, row, targetLevel = null) => {
      const checkOpen = (c, r) => {
        const l = this.getTileLevel(c, r);
        if (targetLevel === 'LOW') return l === 'LOW' || l === 'RAMP' || l === 'LADDER';
        return l !== 'WALL';
      };
      const openNS = (checkOpen(col, row - 1) ? 1 : 0) + (checkOpen(col, row + 1) ? 1 : 0);
      const openEW = (checkOpen(col - 1, row) ? 1 : 0) + (checkOpen(col + 1, row) ? 1 : 0);
      return openEW > openNS ? 'EW' : 'NS';
    };

    // 고대 붉은 벽돌 배럴 볼트(위로만 둥근 아치형 천장) 생성 (레퍼런스 이미지 2번 구현)
    const buildBarrelVaultCeiling = (tx, tz, axis, springY = 3.25, crownY = 4.42) => {
      const rotY = axis === 'EW' ? Math.PI / 2 : 0;
      const archAngles = [-1.08, -0.65, -0.22, 0.22, 0.65, 1.08];
      const radiusX = TILE_SIZE * 0.56;
      const riseY = crownY - springY;
      for (const ang of archAngles) {
        const lx = Math.sin(ang) * radiusX;
        const ly = springY + Math.cos(ang) * riseY;
        const facetW = 0.68;
        const g = new THREE.BoxGeometry(facetW, 0.14, TILE_SIZE + 0.04);
        const m = new THREE.Matrix4();
        m.makeTranslation(tx, ly, tz);
        if (rotY !== 0) m.multiply(new THREE.Matrix4().makeRotationY(rotY));
        m.multiply(new THREE.Matrix4().makeTranslation(lx, 0, 0));
        m.multiply(new THREE.Matrix4().makeRotationZ(-ang * 0.85));
        g.applyMatrix4(m);
        ceilingGeos.push(g);
      }
      // 아치 천장을 가로지르는 붉은 벽돌 보강 아치 리브(Transverse Arch Rib)
      for (const ang of [-0.95, -0.32, 0.32, 0.95]) {
        const lx = Math.sin(ang) * (radiusX - 0.05);
        const ly = springY + Math.cos(ang) * (riseY - 0.04);
        const g = new THREE.BoxGeometry(0.72, 0.18, 0.24);
        const m = new THREE.Matrix4();
        m.makeTranslation(tx, ly, tz);
        if (rotY !== 0) m.multiply(new THREE.Matrix4().makeRotationY(rotY));
        m.multiply(new THREE.Matrix4().makeTranslation(lx, 0, 0));
        m.multiply(new THREE.Matrix4().makeRotationZ(-ang * 0.85));
        g.applyMatrix4(m);
        wallBrickGeos.push(g);
      }
    };

    // 로우폴리 10각 원통형 하수관 터널 쉘 생성 (레퍼런스 이미지 1번 구현)
    const buildCylindricalSewerPipe = (col, row, tx, tz) => {
      const axis = getDominantAxis(col, row, 'LOW');
      const rotY = axis === 'EW' ? Math.PI / 2 : 0;

      // 1) 상부 원통형 콘크리트 아치 천장 (6분할 다각형 링)
      const topAngles = [-1.15, -0.70, -0.24, 0.24, 0.70, 1.15];
      const pipeR = TILE_SIZE * 0.56;
      const centerH = 1.82;
      const archRise = 1.62;
      for (const ang of topAngles) {
        const lx = Math.sin(ang) * pipeR;
        const ly = centerH + Math.cos(ang) * archRise;
        const g = new THREE.BoxGeometry(0.70, 0.16, TILE_SIZE + 0.04);
        const m = new THREE.Matrix4();
        m.makeTranslation(tx, ly, tz);
        if (rotY !== 0) m.multiply(new THREE.Matrix4().makeRotationY(rotY));
        m.multiply(new THREE.Matrix4().makeTranslation(lx, 0, 0));
        m.multiply(new THREE.Matrix4().makeRotationZ(-ang));
        g.applyMatrix4(m);
        wallFlumeGeos.push(g);
      }

      // 2) 타일당 2개씩 돌출된 원형 콘크리트 세그먼트 링 리브 (하수관 특유의 둥근 마디 실루엣)
      for (const zOff of [-0.58, 0.58]) {
        for (const ang of [-1.22, -0.74, -0.25, 0.25, 0.74, 1.22]) {
          const lx = Math.sin(ang) * (pipeR - 0.07);
          const ly = centerH + Math.cos(ang) * (archRise - 0.06);
          const g = new THREE.BoxGeometry(0.68, 0.18, 0.18);
          const m = new THREE.Matrix4();
          m.makeTranslation(tx, ly, tz);
          if (rotY !== 0) m.multiply(new THREE.Matrix4().makeRotationY(rotY));
          m.multiply(new THREE.Matrix4().makeTranslation(lx, 0, zOff));
          m.multiply(new THREE.Matrix4().makeRotationZ(-ang));
          g.applyMatrix4(m);
          wallFlumeGeos.push(g);
        }
      }

      // 3) 막혀있는 방향(벽 또는 고지대 절벽과 접한 면)에 원통형 곡면 하부/중부 내벽 생성
      const sides = [
        { dc: -1, dr: 0, sideRotY: 0 },           // 서쪽 벽
        { dc: 1, dr: 0, sideRotY: Math.PI },      // 동쪽 벽
        { dc: 0, dr: -1, sideRotY: -Math.PI / 2 },// 북쪽 벽
        { dc: 0, dr: 1, sideRotY: Math.PI / 2 }   // 남쪽 벽
      ];
      for (const s of sides) {
        const nLvl = this.getTileLevel(col + s.dc, row + s.dr);
        if (nLvl !== 'LOW' && nLvl !== 'RAMP' && nLvl !== 'LADDER') {
          // 수면 아래에서 벽면으로 둥글게 말려 올라가는 하단 곡면 (y: 0.05 -> 0.85)
          const gBot = new THREE.BoxGeometry(0.22, 0.92, TILE_SIZE + 0.02);
          const mBot = new THREE.Matrix4();
          mBot.makeTranslation(tx, 0.42, tz);
          mBot.multiply(new THREE.Matrix4().makeRotationY(s.sideRotY));
          mBot.multiply(new THREE.Matrix4().makeTranslation(-TILE_SIZE * 0.43, 0, 0));
          mBot.multiply(new THREE.Matrix4().makeRotationZ(-0.36));
          gBot.applyMatrix4(mBot);
          wallFlumeGeos.push(gBot);

          // 중간 원통 측벽 (y: 0.80 -> 1.88)
          const gMid = new THREE.BoxGeometry(0.20, 1.15, TILE_SIZE + 0.02);
          const mMid = new THREE.Matrix4();
          mMid.makeTranslation(tx, 1.34, tz);
          mMid.multiply(new THREE.Matrix4().makeRotationY(s.sideRotY));
          mMid.multiply(new THREE.Matrix4().makeTranslation(-TILE_SIZE * 0.48, 0, 0));
          mMid.multiply(new THREE.Matrix4().makeRotationZ(-0.08));
          gMid.applyMatrix4(mMid);
          wallFlumeGeos.push(gMid);

          // 상부 아치와 이어지는 곡면 내벽 (y: 1.82 -> 2.65)
          const gTop = new THREE.BoxGeometry(0.20, 0.95, TILE_SIZE + 0.02);
          const mTop = new THREE.Matrix4();
          mTop.makeTranslation(tx, 2.22, tz);
          mTop.multiply(new THREE.Matrix4().makeRotationY(s.sideRotY));
          mTop.multiply(new THREE.Matrix4().makeTranslation(-TILE_SIZE * 0.44, 0, 0));
          mTop.multiply(new THREE.Matrix4().makeRotationZ(0.28));
          gTop.applyMatrix4(mTop);
          wallFlumeGeos.push(gTop);
        }
      }
    };

    for (let row = 0; row < MAP_ROWS; row++) {
      const line = mapArray[row] || '';
      for (let col = 0; col < MAP_COLS; col++) {
        const ch = line[col] || ' ';
        if (ch === ' ') continue;

        const pos = tileToWorld(col, row);

        // 1. 방호벽 및 구조 지지 기둥 ('#')
        if (ch === '#') {
          if (isCh2) {
            // 레퍼런스 2번 구현: 하부는 묵직한 석조 기단(0~2.75m), 상부는 돌출 코벨 장식과 붉은 벽돌 아치 기둥(2.75~4.55m)
            addBoxTo(wallFlumeGeos, TILE_SIZE, 2.75, TILE_SIZE, pos.x, 1.375, pos.z);
            addBoxTo(wallBrickGeos, TILE_SIZE + 0.18, 0.46, TILE_SIZE + 0.18, pos.x, 2.98, pos.z);
            addBoxTo(wallBrickGeos, TILE_SIZE, 1.35, TILE_SIZE, pos.x, 3.88, pos.z);
          } else {
            const g = baseWallGeo.clone();
            g.applyMatrix4(new THREE.Matrix4().makeTranslation(pos.x, WALL_HEIGHT / 2, pos.z));
            wallGeos.push(g);
          }
          continue;
        }

        // 2. 챕터 2 전용 입체 다층 지오메트리 (원통형 수로 LOW vs 고지대 벽돌 회랑 HIGH vs 경사로 RAMP vs 사다리 LADDER)
        if (isCh2) {
          const lvl = this.getTileLevel(col, row);
          const domAxis = getDominantAxis(col, row, lvl);

          if (lvl === 'LOW') {
            // 저지대 원통형 침수 하수관 (바닥 Y=0.0m, 수면 Y=0.56m)
            addPlaneTo(floorWaterBedGeos, TILE_SIZE, TILE_SIZE, pos.x, 0.015, pos.z);
            addPlaneTo(floorWaterGeos, TILE_SIZE, TILE_SIZE, pos.x, 0, pos.z);
            buildCylindricalSewerPipe(col, row, pos.x, pos.z);
          } else if (lvl === 'HIGH') {
            // 고지대 건조 석판 회랑 및 기둥 홀 (바닥 Y=1.40m, 아치 천장 Y=3.25~4.42m)
            addBoxTo(floorStoneWalkwayGeos, TILE_SIZE, 0.08, TILE_SIZE, pos.x, CH2_HIGH_Y - 0.04, pos.z);
            buildBarrelVaultCeiling(pos.x, pos.z, domAxis, 3.25, 4.42);

            // 저지대(LOW/RAMP/LADDER)와 맞닿는 가장자리에 1.40m 수직 석조 절벽 옹벽 + 추락 방지 턱 생성
            const edges = [
              { dc: 0, dr: -1, ox: 0, oz: -TILE_SIZE / 2 + 0.11, w: TILE_SIZE, d: 0.22 },
              { dc: 0, dr: 1, ox: 0, oz: TILE_SIZE / 2 - 0.11, w: TILE_SIZE, d: 0.22 },
              { dc: -1, dr: 0, ox: -TILE_SIZE / 2 + 0.11, oz: 0, w: 0.22, d: TILE_SIZE },
              { dc: 1, dr: 0, ox: TILE_SIZE / 2 - 0.11, oz: 0, w: 0.22, d: TILE_SIZE }
            ];
            for (const e of edges) {
              const nLvl = this.getTileLevel(col + e.dc, row + e.dr);
              if (nLvl === 'LOW' || nLvl === 'RAMP' || nLvl === 'LADDER') {
                // 0.0m ~ 1.40m 수직 콘크리트/석조 절벽 옹벽
                addBoxTo(wallFlumeGeos, e.w, CH2_HIGH_Y, e.d, pos.x + e.ox, CH2_HIGH_Y / 2, pos.z + e.oz);
                // 경사로/사다리 통로가 아닌 일반 절벽 경계에는 0.24m 높이의 벽돌 경계석(Curb) 추가
                if (nLvl === 'LOW') {
                  addBoxTo(wallBrickGeos, e.w, 0.24, e.d, pos.x + e.ox, CH2_HIGH_Y + 0.12, pos.z + e.oz);
                }
              }
            }
          } else if (lvl === 'RAMP') {
            // 저지대 수로(0.0m)와 고지대 회랑(1.40m)을 잇는 돌출 슬로프 경사로 ('M')
            const tDir = this.getTransitionDir(col, row);
            const slopeLen = Math.hypot(TILE_SIZE, CH2_HIGH_Y);
            const pitch = Math.atan2(CH2_HIGH_Y, TILE_SIZE);

            // 경사로 하단 물바닥 및 수면
            addPlaneTo(floorWaterBedGeos, TILE_SIZE, TILE_SIZE, pos.x, 0.015, pos.z);
            addPlaneTo(floorWaterGeos, TILE_SIZE, TILE_SIZE, pos.x, 0, pos.z);

            // 경사 슬래브 본체 (저지대 0.0m -> 고지대 1.40m를 향해 위로 상승하도록 -pitch 적용)
            const rampGeo = new THREE.BoxGeometry(TILE_SIZE - 0.08, 0.22, slopeLen);
            const rMat = new THREE.Matrix4();
            rMat.makeTranslation(pos.x, CH2_HIGH_Y / 2, pos.z);
            rMat.multiply(new THREE.Matrix4().makeRotationY(tDir.yaw));
            rMat.multiply(new THREE.Matrix4().makeRotationX(-pitch));
            rampGeo.applyMatrix4(rMat);
            floorStoneWalkwayGeos.push(rampGeo);

            // 미끄럼 방지 석조 단차(Tread Bars) 5단 배치
            for (let s = -2; s <= 2; s++) {
              const frac = s / 5.2;
              const barGeo = new THREE.BoxGeometry(TILE_SIZE - 0.24, 0.065, 0.14);
              const bMat = new THREE.Matrix4();
              bMat.makeTranslation(pos.x, CH2_HIGH_Y / 2, pos.z);
              bMat.multiply(new THREE.Matrix4().makeRotationY(tDir.yaw));
              bMat.multiply(new THREE.Matrix4().makeRotationX(-pitch));
              bMat.multiply(new THREE.Matrix4().makeTranslation(0, 0.12, frac * slopeLen));
              barGeo.applyMatrix4(bMat);
              wallBrickGeos.push(barGeo);
            }

            buildBarrelVaultCeiling(pos.x, pos.z, domAxis, 3.25, 4.42);
          } else if (lvl === 'LADDER') {
            // 벽면 철제 수직 사다리 ('H') — 다가가서 앞으로 전진하면 자동으로 등반
            const tDir = this.getTransitionDir(col, row);
            addPlaneTo(floorWaterBedGeos, TILE_SIZE, TILE_SIZE, pos.x, 0.015, pos.z);
            addPlaneTo(floorWaterGeos, TILE_SIZE, TILE_SIZE, pos.x, 0, pos.z);
            buildBarrelVaultCeiling(pos.x, pos.z, domAxis, 3.25, 4.42);

            // 고지대 벽면 쪽에 부착된 철제 사다리 프레임(좌우 레일 + 8단 가로 발판)
            const ladderOffset = TILE_SIZE * 0.36;
            const lxBase = pos.x + tDir.dx * ladderOffset;
            const lzBase = pos.z + tDir.dz * ladderOffset;

            for (const railSide of [-0.32, 0.32]) {
              const railGeo = new THREE.BoxGeometry(0.07, CH2_HIGH_Y + 0.65, 0.07);
              const mRail = new THREE.Matrix4();
              mRail.makeTranslation(lxBase, (CH2_HIGH_Y + 0.65) / 2, lzBase);
              mRail.multiply(new THREE.Matrix4().makeRotationY(tDir.yaw));
              mRail.multiply(new THREE.Matrix4().makeTranslation(railSide, 0, 0));
              railGeo.applyMatrix4(mRail);
              wallBrickGeos.push(railGeo);
            }
            for (let rungIdx = 0; rungIdx < 8; rungIdx++) {
              const ry = 0.16 + rungIdx * 0.18;
              const rungGeo = new THREE.BoxGeometry(0.66, 0.045, 0.045);
              const mRung = new THREE.Matrix4();
              mRung.makeTranslation(lxBase, ry, lzBase);
              mRung.multiply(new THREE.Matrix4().makeRotationY(tDir.yaw));
              rungGeo.applyMatrix4(mRung);
              wallBrickGeos.push(rungGeo);
            }

            this.ladders.push({
              col,
              row,
              x: pos.x,
              z: pos.z,
              dx: tDir.dx,
              dz: tDir.dz
            });
          }
        } else {
          // 챕터 1 / 챕터 3 기존 평면 타일 지오메트리
          const f = baseFloorGeo.clone();
          const fMat = new THREE.Matrix4();
          fMat.multiply(new THREE.Matrix4().makeTranslation(pos.x, 0, pos.z));
          fMat.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
          f.applyMatrix4(fMat);

          if (ch === 'W') {
            floorWaterGeos.push(f);
          } else if (['B', 'S', 'G', 'C'].includes(ch)) {
            floorBunkerGeos.push(f);
          } else if (ch === 'R') {
            floorRoomGeos.push(f);
          } else {
            floorCorridorGeos.push(f);
          }

          const c = baseFloorGeo.clone();
          const cMat = new THREE.Matrix4();
          cMat.multiply(new THREE.Matrix4().makeTranslation(pos.x, WALL_HEIGHT, pos.z));
          cMat.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
          c.applyMatrix4(cMat);
          ceilingGeos.push(c);
        }

        // 3. 타일별 특수 오브젝트 배치 (챕터 2의 다층 바닥 높이 baseY 자동 반영)
        const baseY = this.getFloorHeightAt(pos.x, pos.z);
        if (ch === 'S') {
          this.spawnPos = { x: pos.x, y: baseY, z: pos.z };
        } else if (ch === 'G') {
          this.buildGenerator(pos.x, pos.z, baseY);
        } else if (ch === 'C') {
          this.consolePos = { x: pos.x, y: baseY, z: pos.z };
          this.buildCCTVConsole(pos.x, pos.z, baseY);
        } else if (ch === 'L') {
          this.buildCeilingLamp(pos.x, pos.z, col, row);
        } else if (ch === 'D') {
          this.buildVerticalDoor(doorIndex++, col, row, pos.x, pos.z, baseY);
        } else if (['1', '2', '3', '4'].includes(ch)) {
          this.buildCCTVCamera(parseInt(ch, 10), col, row, pos.x, pos.z);
        }
      }
    }

    // 드로우콜을 획기적으로 압축하는 통합 메쉬 생성
    if (wallBrickGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(wallBrickGeos, false);
      const mesh = new THREE.Mesh(merged, this.materials.wallBrick);
      this.mapGroup.add(mesh);
      wallBrickGeos.forEach(g => g.dispose());
    }

    if (wallFlumeGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(wallFlumeGeos, false);
      const mesh = new THREE.Mesh(merged, this.materials.wallFlume);
      this.mapGroup.add(mesh);
      wallFlumeGeos.forEach(g => g.dispose());
    }

    if (wallGeos.length > 0) {
      const mergedWall = BufferGeometryUtils.mergeGeometries(wallGeos, false);
      const wallMesh = new THREE.Mesh(mergedWall, this.materials.wall);
      this.mapGroup.add(wallMesh);
      wallGeos.forEach(g => g.dispose());
    }

    if (floorStoneWalkwayGeos.length > 0) {
      const merged = BufferGeometryUtils.mergeGeometries(floorStoneWalkwayGeos, false);
      const mesh = new THREE.Mesh(merged, this.materials.floorStoneWalkway);
      this.mapGroup.add(mesh);
      floorStoneWalkwayGeos.forEach(g => g.dispose());
    }

    if (floorCorridorGeos.length > 0) {
      const mergedFloor = BufferGeometryUtils.mergeGeometries(floorCorridorGeos, false);
      const floorMesh = new THREE.Mesh(mergedFloor, this.materials.floorCorridor);
      this.mapGroup.add(floorMesh);
      floorCorridorGeos.forEach(g => g.dispose());
    }

    if (floorBunkerGeos.length > 0) {
      const mergedFloor = BufferGeometryUtils.mergeGeometries(floorBunkerGeos, false);
      const floorMesh = new THREE.Mesh(mergedFloor, this.materials.floorBunker);
      this.mapGroup.add(floorMesh);
      floorBunkerGeos.forEach(g => g.dispose());
    }

    if (floorRoomGeos.length > 0) {
      const mergedFloor = BufferGeometryUtils.mergeGeometries(floorRoomGeos, false);
      const floorMesh = new THREE.Mesh(mergedFloor, this.materials.floorRoom);
      this.mapGroup.add(floorMesh);
      floorRoomGeos.forEach(g => g.dispose());
    }

    if (floorWaterBedGeos.length > 0) {
      const mergedBed = BufferGeometryUtils.mergeGeometries(floorWaterBedGeos, false);
      const bedMesh = new THREE.Mesh(mergedBed, this.materials.floorRoom);
      this.mapGroup.add(bedMesh);
      floorWaterBedGeos.forEach(g => g.dispose());
    }

    if (floorWaterGeos.length > 0) {
      const mergedWater = BufferGeometryUtils.mergeGeometries(floorWaterGeos, false);
      const waterMat = isCh2 ? this.materials.floorWaterDeep : this.materials.floorWater;
      const waterMesh = new THREE.Mesh(mergedWater, waterMat);
      // 챕터 2에서는 허벅지 깊이(CH2_WATER_Y = 0.56m)로 수면이 차오름
      waterMesh.position.y = isCh2 ? CH2_WATER_Y : 0.04;
      this.mapGroup.add(waterMesh);
      floorWaterGeos.forEach(g => g.dispose());
    }

    if (ceilingGeos.length > 0) {
      const mergedCeiling = BufferGeometryUtils.mergeGeometries(ceilingGeos, false);
      const ceilMat = isCh2 ? this.materials.ceilingBrick : this.materials.ceiling;
      const ceilingMesh = new THREE.Mesh(mergedCeiling, ceilMat);
      this.mapGroup.add(ceilingMesh);
      ceilingGeos.forEach(g => g.dispose());
    }

    baseWallGeo.dispose();
    baseFloorGeo.dispose();

    // 카메라 번호순 정렬 (1 -> 2 -> 3 -> 4)
    this.cctvConfigs.sort((a, b) => a.id - b.id);

    // 챕터 2: 동적 전등 조명 풀(Light Pool) 구성 (개별 28개 PointLight 대신 플레이어 인근 3개만 동적 활성화하여 GPU 부하 90% 절감)
    this.lampLightPool = [];
    if (isCh2) {
      for (let i = 0; i < 3; i++) {
        const pLight = new THREE.PointLight(0xff8c28, 0, 16.0, 1.6);
        this.mapGroup.add(pLight);
        this.lampLightPool.push(pLight);
      }
    }

    // 4. 인게임 동료 캐릭터(벙커 내부) 및 메인 벙커 상시 전술 지도판 배치
    this.spawnEntities();
    this.buildTacticalMapBoard();
  }

  spawnEntities() {
    // 더미 동료 대원 생성 제거 (실제 멀티플레이 플레이어만 스폰)
    this.companion = null;
  }

  /**
   * 메인 벙커 서쪽 벽면에 항상 설치되는 대형 발광 전술 시설 지도판 (Tactical Map Display Board)
   * - 혼자 플레이하는 솔로 유저들이 언제든 시설 구조, 수로 경로, 경사로/사다리 위치를 확인할 수 있습니다.
   */
  buildTacticalMapBoard() {
    const isCh2 = this.chapterId === 'chapter2';
    // 스폰 지점 서쪽 벽면 앞 위치
    const mapTileCol = 20;
    const mapTileRow = isCh2 ? 16 : 8;
    const wallWorld = tileToWorld(mapTileCol, mapTileRow);
    const baseY = this.getFloorHeightAt(wallWorld.x, wallWorld.z);

    const boardGroup = new THREE.Group();
    // 서쪽 벽면(x - 0.5) 살짝 앞 (+0.42m)에 동쪽(+X 방향)을 향하도록 배치
    const boardX = wallWorld.x + 0.38;
    const boardZ = wallWorld.z;
    const boardY = baseY + 1.62;
    boardGroup.position.set(boardX, boardY, boardZ);
    boardGroup.rotation.y = Math.PI / 2; // 동쪽을 바라봄

    // 1. 외곽 강철 베젤 하우징 프레임
    const frameGeo = new THREE.BoxGeometry(2.7, 1.65, 0.12);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e242c,
      roughness: 0.45,
      metalness: 0.85
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    boardGroup.add(frameMesh);

    // 2. 상/하단 고정 브래킷 및 비상 LED 바
    for (const by of [-0.80, 0.80]) {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(2.74, 0.08, 0.16),
        this.materials.doorFrame
      );
      bracket.position.y = by;
      boardGroup.add(bracket);
    }

    const ledMat = new THREE.MeshBasicMaterial({ color: isCh2 ? 0xffaa33 : 0x44ddaa });
    const ledBar = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.03, 0.02),
      ledMat
    );
    ledBar.position.set(0, 0.80, 0.07);
    boardGroup.add(ledBar);

    // 3. 정적 캔버스 캐시 (배경 그리드, 복도, 수로, 경사로, 사다리, 라벨)
    const staticCanvas = document.createElement('canvas');
    staticCanvas.width = 1024;
    staticCanvas.height = 640;
    this.drawTacticalMapStatic(staticCanvas, isCh2);
    this.tacticalMapStaticCanvas = staticCanvas;

    // 4. 고해상도 2D 전술 캔버스 지도 생성 및 텍스처 매핑
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    this.drawTacticalMapToCanvas(canvas, isCh2);
    this.tacticalMapCanvas = canvas;

    const screenTex = new THREE.CanvasTexture(canvas);
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTex,
      roughness: 0.32,
      metalness: 0.2,
      emissive: isCh2 ? 0x442a12 : 0x143238,
      emissiveIntensity: 0.72
    });
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.52, 1.48),
      screenMat
    );
    screenMesh.position.z = 0.065;
    boardGroup.add(screenMesh);

    this.mapGroup.add(boardGroup);

    this.tacticalMapBoard = {
      x: boardX,
      y: boardY,
      z: boardZ,
      canvas,
      screenTex,
      isCh2
    };
  }

  /**
   * 전술 지도 캔버스 정적 배경 도면 드로잉 (그리드, 구역, 수로, 경사로, 사다리, 라벨, 범례)
   */
  drawTacticalMapStatic(canvas, isCh2) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. 군용 터미널 짙은 차콜/그리드 배경
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(38, 55, 75, 0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. 상단 헤더
    ctx.fillStyle = isCh2 ? '#ff9822' : '#44e5a0';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FACILITY TACTICAL MAP // 시설 종합 작전 배치도', 28, 38);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#8ca2b8';
    const subTitle = isCh2
      ? 'SECTOR-02: SUB-SURFACE FLOODED CISTERN & CONDUIT NETWORK'
      : 'SECTOR-01: SKELD SUB-SURFACE BUNKER & SERVICE CORRIDORS';
    ctx.fillText(subTitle, 28, 62);

    // 3. 맵 타일 그리드 축척 투영
    const mapRows = MAP_ROWS;
    const mapCols = MAP_COLS;
    const gridOffsetX = 32;
    const gridOffsetY = 84;
    const gridW = w - 64;
    const gridH = h - 140;
    const cellW = gridW / mapCols;
    const cellH = gridH / mapRows;

    // 3-1. 타일별 기본 블록 렌더링
    for (let r = 0; r < mapRows; r++) {
      const line = this.activeMap[r] || '';
      for (let c = 0; c < mapCols; c++) {
        const ch = line[c] || ' ';
        const px = gridOffsetX + c * cellW;
        const py = gridOffsetY + r * cellH;

        if (ch === '#') {
          ctx.fillStyle = '#1c2430';
          ctx.fillRect(px, py, cellW, cellH);
        } else if (ch === 'B' || ch === 'S') {
          ctx.fillStyle = isCh2 ? '#422814' : '#14383a';
          ctx.fillRect(px, py, cellW, cellH);
        } else if (ch === 'R') {
          ctx.fillStyle = isCh2 ? '#3a2018' : '#222838';
          ctx.fillRect(px, py, cellW, cellH);
        } else if (ch === '.') {
          ctx.fillStyle = '#181e28';
          ctx.fillRect(px, py, cellW, cellH);
        } else if (ch === 'W' || ch === 'L') {
          ctx.fillStyle = isCh2 ? '#0d47a1' : '#181e28';
          ctx.fillRect(px, py, cellW, cellH);
        }
      }
    }

    // 3-2. 특수 오브젝트 및 텍스트 마커 강조
    for (let r = 0; r < mapRows; r++) {
      const line = this.activeMap[r] || '';
      for (let c = 0; c < mapCols; c++) {
        const ch = line[c] || ' ';
        const px = gridOffsetX + c * cellW;
        const py = gridOffsetY + r * cellH;

        if (ch === 'M') {
          // 경사로 (주황 사선)
          ctx.fillStyle = '#ff9800';
          ctx.fillRect(px, py, cellW, cellH);
          ctx.strokeStyle = '#fff';
          ctx.strokeRect(px, py, cellW, cellH);
        } else if (ch === 'H') {
          // 사다리 (노랑)
          ctx.fillStyle = '#ffd600';
          ctx.fillRect(px, py, cellW, cellH);
          ctx.strokeStyle = '#fff';
          ctx.strokeRect(px, py, cellW, cellH);
        } else if (ch === 'D') {
          // 수문/방호문 (녹색 바)
          ctx.fillStyle = '#00e676';
          ctx.fillRect(px, py, cellW, cellH);
        } else if (ch === 'G') {
          // 발전기 코어
          ctx.fillStyle = '#ff3d00';
          ctx.beginPath();
          ctx.arc(px + cellW / 2, py + cellH / 2, cellW * 0.9, 0, Math.PI * 2);
          ctx.fill();
        } else if (ch === 'C') {
          // CCTV 콘솔
          ctx.fillStyle = '#00e5ff';
          ctx.fillRect(px, py, cellW, cellH);
        }
      }
    }

    // 4. 구역 라벨 표시
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    if (isCh2) {
      ctx.fillStyle = '#ffcc80';
      ctx.fillText('중앙 저류 펌프실 [CORE]', gridOffsetX + 24 * cellW, gridOffsetY + 14 * cellH - 12);
      ctx.fillText('← 고대 벽돌 아치 회랑', gridOffsetX + 12 * cellW, gridOffsetY + 14 * cellH);
      ctx.fillText('북서 수문실 ↑', gridOffsetX + 10 * cellW, gridOffsetY + 6 * cellH);
      ctx.fillText('남서 정화실 ↓', gridOffsetX + 10 * cellW, gridOffsetY + 22 * cellH);
      ctx.fillText('동측 기둥 홀 →', gridOffsetX + 41 * cellW, gridOffsetY + 14 * cellH);

      ctx.fillStyle = '#64b5f6';
      ctx.fillText('▲ 북측 대구경 하수관 (DEEP WATER)', gridOffsetX + 24 * cellW, gridOffsetY + 3.5 * cellH);
      ctx.fillText('▼ 남측 방류 터널 (DEEP WATER)', gridOffsetX + 24 * cellW, gridOffsetY + 26 * cellH);
    } else {
      ctx.fillStyle = '#80deea';
      ctx.fillText('중앙 식당 / 통제 벙커 [CORE]', gridOffsetX + 24 * cellW, gridOffsetY + 6 * cellH - 8);
      ctx.fillText('의무실', gridOffsetX + 14 * cellW, gridOffsetY + 10 * cellH);
      ctx.fillText('전기실', gridOffsetX + 15 * cellW, gridOffsetY + 21 * cellH);
      ctx.fillText('관리실', gridOffsetX + 29 * cellW, gridOffsetY + 14 * cellH);
      ctx.fillText('항해실', gridOffsetX + 43 * cellW, gridOffsetY + 14 * cellH);
    }

    // 5. 하단 범례 표시
    ctx.fillStyle = '#0e1622';
    ctx.fillRect(28, h - 46, w - 56, 36);
    ctx.strokeStyle = 'rgba(70, 95, 125, 0.45)';
    ctx.strokeRect(28, h - 46, w - 56, 36);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b0bec5';
    const legendText = isCh2
      ? '[W] 침수 수로(물)   [M] 오르막 경사로   [H] 철제 사다리   [1~4] 수로 감시 CCTV   [G] 터빈 코어   [C] 관제 콘솔'
      : '[B] 벙커 본부   [R] 격실   [.] 복도   [D] 방호문   [G] 발전기 코어   [C] CCTV 모니터';
    ctx.fillText(legendText, w / 2, h - 23);
  }

  /**
   * 전술 지도 캔버스 동적 오버레이 드로잉 (실시간 플레이어 위치, 시야각, 동료 대원, 방호문 개폐 상태)
   */
  drawTacticalMapToCanvas(canvas, isCh2, playerX, playerZ, playerYaw, remotePlayers, doors) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    if (this.tacticalMapStaticCanvas) {
      ctx.drawImage(this.tacticalMapStaticCanvas, 0, 0);
    } else {
      this.drawTacticalMapStatic(canvas, isCh2);
    }

    const mapRows = MAP_ROWS;
    const mapCols = MAP_COLS;
    const gridOffsetX = 32;
    const gridOffsetY = 84;
    const gridW = w - 64;
    const gridH = h - 140;
    const cellW = gridW / mapCols;
    const cellH = gridH / mapRows;
    const halfMapX = (mapCols * 2.0) / 2;
    const halfMapZ = (mapRows * 2.0) / 2;

    // 1. 방호문/수문 동적 상태 표시 (doors)
    const doorList = doors || this.doors || [];
    for (const d of doorList) {
      const c = (d.x + halfMapX) / 2.0;
      const r = (d.z + halfMapZ) / 2.0;
      const px = gridOffsetX + c * cellW;
      const py = gridOffsetY + r * cellH;
      ctx.fillStyle = d.isOpen ? '#00e676' : '#ff1744';
      ctx.fillRect(px, py, cellW, cellH);
    }

    // 2. 플레이어 및 동료 대원 위치 마커
    if (playerX !== undefined && playerZ !== undefined) {
      const pCol = (playerX + halfMapX) / 2.0;
      const pRow = (playerZ + halfMapZ) / 2.0;
      const spX = gridOffsetX + pCol * cellW;
      const spY = gridOffsetY + pRow * cellH;

      // 시야각 원뿔 (Yaw)
      if (playerYaw !== undefined) {
        const fov = Math.PI / 3.5;
        const viewLen = 22;
        const dirAngle = -playerYaw - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(spX, spY);
        ctx.arc(spX, spY, viewLen, dirAngle - fov / 2, dirAngle + fov / 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(118, 255, 3, 0.28)';
        ctx.fill();
      }

      // 펄싱 위치 인디케이터
      const pulse = (Math.sin(performance.now() * 0.007) + 1) * 0.5;
      ctx.fillStyle = '#76ff03';
      ctx.beginPath();
      ctx.arc(spX, spY, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(118, 255, 3, ${0.4 + 0.6 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(spX, spY, 8 + 5 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#76ff03';
      ctx.textAlign = 'left';
      ctx.fillText('YOU [현재 대원]', spX + 12, spY + 4);
    } else {
      // 기본 스폰 마커
      const spawnCol = 24;
      const spawnRow = isCh2 ? 16 : 8;
      const spX = gridOffsetX + spawnCol * cellW + cellW / 2;
      const spY = gridOffsetY + spawnRow * cellH + cellH / 2;
      ctx.fillStyle = '#76ff03';
      ctx.beginPath();
      ctx.arc(spX, spY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(spX, spY, 11, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#76ff03';
      ctx.textAlign = 'left';
      ctx.fillText('◀ YOU ARE HERE (현재 위치)', spX + 18, spY + 4);
    }

    // 3. 멀티플레이어 동료 대원들 마커
    if (remotePlayers && remotePlayers.size > 0) {
      for (const [id, rp] of remotePlayers) {
        if (!rp.position) continue;
        const rCol = (rp.position.x + halfMapX) / 2.0;
        const rRow = (rp.position.z + halfMapZ) / 2.0;
        const rx = gridOffsetX + rCol * cellW;
        const ry = gridOffsetY + rRow * cellH;

        ctx.fillStyle = '#00e5ff';
        ctx.beginPath();
        ctx.arc(rx, ry, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#00e5ff';
        ctx.textAlign = 'left';
        ctx.fillText(rp.name || '동료 대원', rx + 8, ry + 4);
      }
    }
  }

  /**
   * 1칸(1 타일) 상하 개폐식 강철 방호문 (Vertical Blast Door)
   * - 주변 벽/복도 배치를 분석해 가로(NS 통행) 또는 세로(EW 통행)로 자동 회전합니다.
   * - 문짝이 옆 타일을 침범하지 않고, 상단 헤더 박스 안으로 깔끔하게 수직 상승/하강합니다.
   */
  buildVerticalDoor(id, col, row, x, z, baseY = 0) {
    const orientation = getDoorOrientation(this.activeMap, col, row);
    const group = new THREE.Group();
    group.position.set(x, baseY, z);
    // NS 통행이면 동-서 방향(회전 0), EW 통행이면 남-북 방향(90도 회전)
    group.rotation.y = orientation === 'EW' ? Math.PI / 2 : 0;

    const pillarW = 0.24;
    const frameDepth = 0.44;
    const headerH = 0.55;
    const clearHeight = WALL_HEIGHT - headerH; // 2.65m 통행 높이
    const clearWidth = TILE_SIZE - pillarW * 2; // 2.02m 통행 폭

    // 좌/우 강철 가이드 기둥
    const pillarGeo = new THREE.BoxGeometry(pillarW, WALL_HEIGHT, frameDepth);
    const leftPillar = new THREE.Mesh(pillarGeo, this.materials.doorFrame);
    leftPillar.position.set(-(TILE_SIZE / 2 - pillarW / 2), WALL_HEIGHT / 2, 0);
    leftPillar.castShadow = true;
    group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, this.materials.doorFrame);
    rightPillar.position.set(TILE_SIZE / 2 - pillarW / 2, WALL_HEIGHT / 2, 0);
    rightPillar.castShadow = true;
    group.add(rightPillar);

    // 상단 유압 셔터 수납 헤더 박스
    const headerGeo = new THREE.BoxGeometry(TILE_SIZE, headerH, frameDepth + 0.06);
    const header = new THREE.Mesh(headerGeo, this.materials.doorFrame);
    header.position.set(0, WALL_HEIGHT - headerH / 2, 0);
    header.castShadow = true;
    group.add(header);

    // 바닥 문지방 플레이트
    const thresholdGeo = new THREE.BoxGeometry(clearWidth, 0.03, frameDepth);
    const threshold = new THREE.Mesh(thresholdGeo, this.materials.doorFrame);
    threshold.position.set(0, 0.015, 0);
    group.add(threshold);

    // 앞/뒤 개폐 상태 표시 LED 램프 바 (초록=열림, 빨강=잠김)
    const ledGeo = new THREE.BoxGeometry(0.9, 0.1, 0.04);
    const ledFront = new THREE.Mesh(ledGeo, this.materials.ledGreen);
    ledFront.position.set(0, WALL_HEIGHT - headerH / 2, (frameDepth + 0.08) / 2);
    group.add(ledFront);

    const ledBack = new THREE.Mesh(ledGeo, this.materials.ledGreen);
    ledBack.position.set(0, WALL_HEIGHT - headerH / 2, -(frameDepth + 0.08) / 2);
    group.add(ledBack);

    // 상하 이동식 블라스트 도어 패널 (1칸 내부에만 위치)
    const shutterHeight = clearHeight;
    const shutterGeo = new THREE.BoxGeometry(clearWidth + 0.08, shutterHeight, 0.22);
    const shutter = new THREE.Mesh(shutterGeo, this.materials.doorPanel);
    shutter.castShadow = true;
    shutter.receiveShadow = true;

    // 기본 상태: 열림(openRatio = 1) -> 상단 헤더 아래쪽에 수납된 상태
    shutter.position.set(0, clearHeight - 0.12, 0);
    shutter.scale.y = 0.09;
    group.add(shutter);

    // 문 앞 미약한 유도 조명 (모바일 최적화: 무거운 실시간 PointLight 대신 상단 LED 바로 상태 표시)
    this.mapGroup.add(group);

    let label = `방호문 ${id}`;
    if (this.chapterId === 'chapter2') {
      if (id === 1) label = '북쪽 수문 (중앙 펌프실 북측 격벽)';
      else if (id === 2) label = '서쪽 수문 (중앙 펌프실 서측 격벽)';
      else if (id === 3) label = '동쪽 수문 (중앙 펌프실 동측 격벽)';
      else if (id === 4) label = '남쪽 수문 (중앙 펌프실 남측 격벽)';
    } else {
      if (id === 1) label = '서쪽 방호문';
      else if (id === 2) label = '동쪽 방호문';
      else if (id === 3) label = '남쪽 방호문';
    }

    const doorObj = {
      id,
      name: label,
      col,
      row,
      x,
      z,
      baseY,
      orientation,
      isOpen: true,
      isMalfunctioning: false,
      openRatio: 1.0, // 1.0 = 완전히 열림(위), 0.0 = 완전히 닫힘(아래)
      clearHeight,
      shutter,
      ledFront,
      ledBack,
      doorLight: null
    };
    this.doors.push(doorObj);
    this.doorGrid.set(`${col}_${row}`, doorObj);
  }

  getDoorAt(col, row) {
    return this.doorGrid.get(`${col}_${row}`) || null;
  }

  toggleDoor(id) {
    const door = this.doors.find(d => d.id === id);
    if (!door) return false;
    // 정전(블랙아웃) 상태에서는 방호문이 무력화되어 닫을 수 없음
    if (this.isBlackout || door.isMalfunctioning) {
      door.isOpen = true;
      return true;
    }
    door.isOpen = !door.isOpen;
    const ledMat = door.isOpen ? this.materials.ledGreen : this.materials.ledRed;
    door.ledFront.material = ledMat;
    door.ledBack.material = ledMat;
    return door.isOpen;
  }

  /**
   * 정전(블랙아웃) 발생/복구 시 전체 방호문 및 주요 조명 상태 전환
   */
  setBlackoutState(flag) {
    this.isBlackout = flag;
    for (const door of this.doors) {
      door.isMalfunctioning = flag;
      if (flag) {
        // 정전 시 모든 문이 강제로 열리며 적색 경고등 점등
        door.isOpen = true;
        door.ledFront.material = this.materials.ledRed;
        door.ledBack.material = this.materials.ledRed;
        if (door.doorLight) door.doorLight.intensity = 0.15;
      } else {
        const ledMat = door.isOpen ? this.materials.ledGreen : this.materials.ledRed;
        door.ledFront.material = ledMat;
        door.ledBack.material = ledMat;
        if (door.doorLight) door.doorLight.intensity = 0.85;
      }
    }

    if (this.bunkerAmbient) {
      if (this.chapterId === 'chapter2') {
        this.bunkerAmbient.color.setHex(flag ? 0x441408 : 0x55321a);
        this.bunkerAmbient.intensity = flag ? 0.32 : 1.25;
      } else {
        this.bunkerAmbient.color.setHex(flag ? 0xff3322 : 0xdde4ec);
        this.bunkerAmbient.intensity = flag ? 0.45 : 1.8;
      }
    }
    if (this.genLight) {
      if (this.chapterId === 'chapter2') {
        this.genLight.color.setHex(flag ? 0xcc3311 : 0xffa044);
        this.genLight.intensity = flag ? 0.8 : 5.2;
      } else {
        this.genLight.color.setHex(flag ? 0xff4422 : 0xeef4ff);
        this.genLight.intensity = flag ? 0.9 : 4.8;
      }
    }
    if (this.consoleLight) {
      this.consoleLight.intensity = flag ? 0.25 : 2.1;
    }

    // 정전 직후 모든 천장등이 지직거리며 꺼지도록 플리커 타이머 강제 활성화
    for (const lamp of this.ceilingLamps) {
      lamp.flickerRemain = flag ? 0.75 : 0.35;
    }
  }

  buildGenerator(x, z, baseY = 0) {
    const isCh2 = this.chapterId === 'chapter2';
    const group = new THREE.Group();
    group.position.set(x, baseY, z);

    // 팔각 기단 베이스
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.45, 8),
      this.materials.doorFrame
    );
    base.position.y = 0.225;
    group.add(base);

    // 상단 캡
    const topCap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.0, 0.35, 8),
      this.materials.doorFrame
    );
    topCap.position.y = WALL_HEIGHT - 0.18;
    group.add(topCap);

    // 중앙 발광 코어 기둥 (챕터 2는 온화한 주황빛 증기/수압 터빈 코어)
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, WALL_HEIGHT - 0.5, 16),
      new THREE.MeshBasicMaterial({ color: isCh2 ? 0xffb866 : 0xe8e8e8 })
    );
    pillar.position.y = WALL_HEIGHT / 2;
    group.add(pillar);

    // 보호 케이지 기둥 4개
    const barGeo = new THREE.CylinderGeometry(0.05, 0.05, WALL_HEIGHT - 0.5, 8);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const bar = new THREE.Mesh(barGeo, this.materials.doorFrame);
      bar.position.set(Math.cos(angle) * 0.82, WALL_HEIGHT / 2, Math.sin(angle) * 0.82);
      group.add(bar);
    }

    // 회전하는 에너지 링
    this.generatorCore = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.07, 12, 32),
      new THREE.MeshBasicMaterial({ color: isCh2 ? 0xff9933 : 0xffffff })
    );
    this.generatorCore.position.y = 1.6;
    this.generatorCore.rotation.x = Math.PI / 3;
    group.add(this.generatorCore);

    // 발전기 / 터빈 주 조명
    const lightColor = isCh2 ? 0xffaa44 : 0xeef4ff;
    this.genLight = new THREE.PointLight(lightColor, isCh2 ? 5.2 : 4.8, 15, 1.6);
    this.genLight.position.set(0, 2.2, 0);
    group.add(this.genLight);

    this.mapGroup.add(group);
    this.propColliders.push({ x, z, r: 1.05 });
  }

  buildCCTVConsole(x, z, baseY = 0) {
    const group = new THREE.Group();
    group.position.set(x, baseY, z);

    // 콘솔 데스크 본체
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.05, 0.9),
      this.materials.doorFrame
    );
    desk.position.y = 0.525;
    desk.castShadow = true;
    group.add(desk);

    // 듀얼 CRT 모니터 하우징
    for (const offsetX of [-0.42, 0.42]) {
      const monitorBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.52, 0.4),
        this.materials.wall
      );
      monitorBox.position.set(offsetX, 1.34, -0.1);
      group.add(monitorBox);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.42),
        this.materials.consoleScreen
      );
      screen.position.set(offsetX, 1.34, 0.11);
      group.add(screen);
    }

    this.consoleLight = null;

    this.mapGroup.add(group);
    this.propColliders.push({ x, z, r: 0.78 });
  }

  buildCeilingLamp(x, z, col = 0, row = 0) {
    const isCh2 = this.chapterId === 'chapter2';
    const group = new THREE.Group();
    const inLowPipe = isCh2 && this.isWaterTile(col, row);
    const lampY = isCh2 ? (inLowPipe ? 3.12 : 4.18) : (WALL_HEIGHT - 0.06);
    group.position.set(x, lampY, z);

    const fixtureMat = isCh2 ? this.materials.lampOrangeFixture : this.materials.doorFrame;
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.10, 0.38),
      fixtureMat
    );
    group.add(fixture);

    const tubeColor = isCh2 ? 0xff9228 : 0xbfc6cc;
    const tubeMat = new THREE.MeshBasicMaterial({ color: tubeColor });
    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.06, 0.26),
      tubeMat
    );
    tube.position.y = -0.055;
    group.add(tube);

    this.mapGroup.add(group);

    this.ceilingLamps.push({
      x,
      y: lampY - 0.35,
      z,
      tubeMat,
      baseIntensity: isCh2 ? 3.4 : 2.2,
      currentIntensity: isCh2 ? 3.4 : 2.2,
      nextFlickerIn: 2.5 + Math.random() * 9.0,
      flickerRemain: 0,
      soundCooldown: 0
    });
  }

  /**
   * CCTV 카메라 배치 및 가장 시야가 트인 복도 방향으로 자동 정렬
   */
  buildCCTVCamera(num, col, row, x, z) {
    const dirs = [
      { name: '북쪽', dc: 0, dr: -1, yaw: 0 },
      { name: '남쪽', dc: 0, dr: 1, yaw: Math.PI },
      { name: '서쪽', dc: -1, dr: 0, yaw: Math.PI / 2 },
      { name: '동쪽', dc: 1, dr: 0, yaw: -Math.PI / 2 }
    ];

    let bestDir = dirs[1];
    let maxOpen = -1;

    for (const d of dirs) {
      let steps = 0;
      for (let k = 1; k <= 8; k++) {
        const ch = this.getTileChar(col + d.dc * k, row + d.dr * k);
        if (ch === '#' || ch === ' ') break;
        steps++;
      }
      if (steps > maxOpen) {
        maxOpen = steps;
        bestDir = d;
      }
    }

    const isCh2 = this.chapterId === 'chapter2';
    const inLowPipe = isCh2 && this.isWaterTile(col, row);
    const floorY = this.getFloorHeightAt(x, z);

    // 챕터 2 전용 전략적 수로 카메라 수동 정밀 각도 (벽 차폐 및 중앙 허브 조망 원천 방지)
    const ch2Overrides = {
      1: { yaw: -Math.PI / 2, pitch: -0.22, name: 'CAM 01 - 북측 대구경 원통 하수관' }, // 동쪽 조망
      2: { yaw: Math.PI / 2, pitch: -0.22, name: 'CAM 02 - 남측 침수 배수관' },         // 서쪽 조망
      3: { yaw: Math.PI, pitch: -0.24, name: 'CAM 03 - 동측 침수 저류 수로' },           // 남쪽 조망
      4: { yaw: Math.PI, pitch: -0.24, name: 'CAM 04 - 서측 원형 수로 합류부' }          // 남쪽 조망
    };

    const finalYaw = (isCh2 && ch2Overrides[num]) ? ch2Overrides[num].yaw : bestDir.yaw;
    const finalPitch = (isCh2 && ch2Overrides[num]) ? ch2Overrides[num].pitch : -0.18;

    // 카메라 설치 높이:
    // 챕터 2 수로 원통관(Low Pipe): 천장 아치 최상단(3.44m) 바로 아래인 camMountY = 3.12m 에 견고히 마운트하여
    // 바닥/물속으로 처박히지 않고 상공에서 수로 전체와 수면, 유영하는 악어가 한눈에 들어오도록 시원한 하이앵글 확보
    // 챕터 2 고대 벽돌 아치 회랑(High Ground): 바닥 1.40m, 아치 천장 4.42m -> camMountY = 3.50m
    // 챕터 1 벙커 복도: 바닥 0.0m, 천장 3.60m -> camMountY = 2.45m
    const camMountY = isCh2 ? (inLowPipe ? 3.12 : (floorY + 2.10)) : (floorY + 2.45);

    const camGroup = new THREE.Group();
    camGroup.position.set(x, camMountY, z);
    camGroup.rotation.y = finalYaw;

    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8),
      this.materials.doorFrame
    );
    mount.position.y = 0.12;
    camGroup.add(mount);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, 0.46),
      this.materials.wall
    );
    camGroup.add(body);

    const recLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      this.materials.ledRed
    );
    recLed.position.set(0.08, 0.08, -0.24);
    camGroup.add(recLed);

    this.mapGroup.add(camGroup);

    const defaultNamesCh1 = {
      1: 'CAM 01 - 동쪽 허브 복도',
      2: 'CAM 02 - 남쪽 관리실/창고 복도',
      3: 'CAM 03 - 북서 엔진/의무실 복도',
      4: 'CAM 04 - 서쪽 보안실/원자로 복도'
    };
    const defaultNamesCh2 = {
      1: 'CAM 01 - 북측 대구경 원통 하수관',
      2: 'CAM 02 - 남측 침수 배수관',
      3: 'CAM 03 - 동측 침수 저류 수로',
      4: 'CAM 04 - 서측 원형 수로 합류부'
    };
    const camName = isCh2
      ? (ch2Overrides[num]?.name || defaultNamesCh2[num] || `CAM 0${num} - 수로 감시`)
      : (defaultNamesCh1[num] || `CAM 0${num} - 구역 감시`);

    // 카메라 시점 위치를 카메라 하우징 전방으로 배치하여 자체 모델 및 천장/벽면 간섭 원천 방지
    const fwdX = -Math.sin(finalYaw) * 0.32;
    const fwdZ = -Math.cos(finalYaw) * 0.32;

    this.cctvConfigs.push({
      id: num,
      name: camName,
      pos: { x: x + fwdX, y: camMountY - 0.08, z: z + fwdZ },
      baseYaw: finalYaw,
      basePitch: finalPitch
    });
  }

  /**
   * 매 프레임 애니메이션 업데이트:
   * - 발전기 코어 회전
   * - 1칸 방호문 수직(위아래) 슬라이딩 개폐
   * - 동료 대원 애니메이션 및 괴물 근접 시 천장 형광등 전자기 간섭 지직거림
   */
  update(dt, playerPos = null, monsterPos = null) {
    if (this.generatorCore) {
      this.generatorCore.rotation.z += dt * 1.6;
      this.generatorCore.rotation.y += dt * 1.1;
    }

    for (const door of this.doors) {
      const targetRatio = door.isOpen ? 1.0 : 0.0;
      const speed = 3.2;
      if (Math.abs(door.openRatio - targetRatio) > 0.001) {
        if (door.openRatio < targetRatio) {
          door.openRatio = Math.min(1.0, door.openRatio + dt * speed);
        } else {
          door.openRatio = Math.max(0.0, door.openRatio - dt * speed);
        }
      } else {
        door.openRatio = targetRatio;
      }

      // openRatio === 0 (닫힘): 높이 전체(scale.y = 1)를 차지하며 바닥까지 내려옴
      // openRatio === 1 (열림): 상단 헤더 박스 바로 아래로 수직 상승하며 접힘 (천장 위로 절대 뚫고 나가지 않음)
      const r = door.openRatio;
      const scaleY = 1.0 - r * 0.91; // 1.0 -> 0.09
      const currentH = door.clearHeight * scaleY;
      door.shutter.scale.y = scaleY;
      door.shutter.position.y = door.clearHeight - currentH / 2;
    }

    // 동료 대원 애니메이션 업데이트
    if (this.companion) {
      this.companion.update(dt, 'look');
    }

    // 천장 형광등 지직거림(Flicker & Spark Buzz) 및 정전 연출 업데이트
    for (const lamp of this.ceilingLamps) {
      if (lamp.soundCooldown > 0) {
        lamp.soundCooldown = Math.max(0, lamp.soundCooldown - dt);
      }

      // 괴물이 지상(y < 2.2)에서 전등 근처(6.5m 이내)를 지나가면 자기장 간섭으로 전등이 심하게 지직거림!
      let monsterNearLamp = false;
      if (monsterPos && monsterPos.y < 2.2) {
        const dM = Math.hypot(monsterPos.x - lamp.x, monsterPos.z - lamp.z);
        if (dM < 6.5) {
          monsterNearLamp = true;
        }
      }

      if (monsterNearLamp && lamp.flickerRemain <= 0 && Math.random() < dt * 2.4) {
        lamp.flickerRemain = 0.18 + Math.random() * 0.25;
      }

      if (!this.isBlackout) {
        lamp.nextFlickerIn -= dt;
        if (lamp.nextFlickerIn <= 0) {
          lamp.nextFlickerIn = 4.5 + Math.random() * 11.0;
          lamp.flickerRemain = 0.12 + Math.random() * 0.24;
        }
      }

      const isCh2 = this.chapterId === 'chapter2';
      const onColor = isCh2 ? 0xff9228 : 0xbfc6cc;
      const offColor = isCh2 ? 0x241208 : 0x22262a;
      const deadColor = isCh2 ? 0x180c05 : 0x141618;

      if (lamp.flickerRemain > 0) {
        lamp.flickerRemain = Math.max(0, lamp.flickerRemain - dt);
        const onNow = Math.random() > 0.55;
        lamp.currentIntensity = onNow ? lamp.baseIntensity * (0.3 + Math.random() * 0.7) : 0.05;
        lamp.tubeMat.color.setHex(onNow ? onColor : offColor);

        // 플레이어가 이 전등 근처(14m 이내)에 있을 때 전등이 지직거리면 3D 거리 비례 스파크/안정기 사운드 재생
        if (playerPos && lamp.soundCooldown <= 0) {
          const distP = Math.hypot(playerPos.x - lamp.x, playerPos.z - lamp.z);
          if (distP < 14.5) {
            const vol = Math.max(0.02, (1 - distP / 14.5) * 0.16);
            sound.playLampFlickerBuzz(vol);
            lamp.soundCooldown = 0.22 + Math.random() * 0.18;
          }
        }
      } else if (this.isBlackout) {
        lamp.currentIntensity = 0;
        lamp.tubeMat.color.setHex(deadColor);
      } else {
        lamp.currentIntensity = lamp.baseIntensity;
        lamp.tubeMat.color.setHex(onColor);
      }
    }

    // 챕터 2: 플레이어 반경 20m 내 가장 가까운 전등 최대 3개에 동적 PointLight 할당 (셰이더 계산량 90% 절감)
    if (this.chapterId === 'chapter2' && playerPos && this.lampLightPool && this.lampLightPool.length > 0) {
      let b0 = null, d0 = 400; // 20m^2
      let b1 = null, d1 = 400;
      let b2 = null, d2 = 400;
      const px = playerPos.x;
      const pz = playerPos.z;
      const nLamps = this.ceilingLamps.length;

      for (let i = 0; i < nLamps; i++) {
        const l = this.ceilingLamps[i];
        const dx = l.x - px;
        const dz = l.z - pz;
        const dSq = dx * dx + dz * dz;
        if (dSq < d0) {
          b2 = b1; d2 = d1;
          b1 = b0; d1 = d0;
          b0 = l; d0 = dSq;
        } else if (dSq < d1) {
          b2 = b1; d2 = d1;
          b1 = l; d1 = dSq;
        } else if (dSq < d2) {
          b2 = l; d2 = dSq;
        }
      }

      const closest = [b0, b1, b2];
      for (let i = 0; i < 3; i++) {
        const pLight = this.lampLightPool[i];
        if (!pLight) continue;
        const l = closest[i];
        if (l && !this.isBlackout) {
          pLight.position.set(l.x, l.y, l.z);
          pLight.intensity = l.currentIntensity;
        } else {
          pLight.intensity = 0;
        }
      }
    }
  }

  /**
   * 플레이어 및 크롤러 이동 충돌 판정 (원-타일 AABB + 챕터 2 고저차 절벽 차단 + 오브젝트 원형 충돌, 무할당 최적화)
   */
  checkCollision(x, z, radius = 0.42) {
    const half = TILE_SIZE / 2;
    const centerCol = Math.floor((x + this.halfMapW) / TILE_SIZE);
    const centerRow = Math.floor((z + this.halfMapH) / TILE_SIZE);
    const isCh2 = this.chapterId === 'chapter2';

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = centerCol + dc;
        const r = centerRow + dr;
        const ch = this.getTileChar(c, r);

        // 챕터 2에서는 경사로('M')나 사다리('H')를 거치지 않고 LOW(0.0m) <-> HIGH(1.40m) 단차를 직접 넘는 것을 차단
        const isElevationCliff = isCh2 && (dr !== 0 || dc !== 0) && !this.canStepBetweenTiles(centerCol, centerRow, c, r);

        if (ch === '#' || ch === ' ' || isElevationCliff) {
          const tileMinX = c * TILE_SIZE - this.halfMapW;
          const tileMaxX = tileMinX + TILE_SIZE;
          const tileMinZ = r * TILE_SIZE - this.halfMapH;
          const tileMaxZ = tileMinZ + TILE_SIZE;
          const closestX = Math.max(tileMinX, Math.min(x, tileMaxX));
          const closestZ = Math.max(tileMinZ, Math.min(z, tileMaxZ));
          const dx = x - closestX;
          const dz = z - closestZ;
          if (dx * dx + dz * dz < radius * radius) {
            return true;
          }
        } else if (ch === 'D') {
          const door = this.getDoorAt(c, r);
          if (door) {
            // 1. 닫힌 셔터 판(두께 0.22m, 너비 2.1m) 정밀 AABB 충돌 체크
            if (door.openRatio < 0.65) {
              const shutterHalfThick = 0.22 / 2;
              const shutterHalfWidth = 2.10 / 2;
              let sMinX, sMaxX, sMinZ, sMaxZ;
              if (door.orientation === 'EW') {
                sMinX = door.x - shutterHalfThick;
                sMaxX = door.x + shutterHalfThick;
                sMinZ = door.z - shutterHalfWidth;
                sMaxZ = door.z + shutterHalfWidth;
              } else {
                sMinX = door.x - shutterHalfWidth;
                sMaxX = door.x + shutterHalfWidth;
                sMinZ = door.z - shutterHalfThick;
                sMaxZ = door.z + shutterHalfThick;
              }
              const cX = Math.max(sMinX, Math.min(x, sMaxX));
              const cZ = Math.max(sMinZ, Math.min(z, sMaxZ));
              const sDx = x - cX;
              const sDz = z - cZ;
              if (sDx * sDx + sDz * sDz < radius * radius) {
                return true;
              }
            }

            // 2. 좌우 강철 기둥 프레임 충돌 체크 (문이 열려 있어도 기둥 벽은 충돌)
            const pillarHalfW = 0.24 / 2;
            const pillarHalfD = 0.44 / 2;
            const pillarOffset = half - pillarHalfW; // 1.13m
            let p1x, p1z, p2x, p2z, pHalfX, pHalfZ;
            if (door.orientation === 'EW') {
              pHalfX = pillarHalfD;
              pHalfZ = pillarHalfW;
              p1x = door.x; p1z = door.z - pillarOffset;
              p2x = door.x; p2z = door.z + pillarOffset;
            } else {
              pHalfX = pillarHalfW;
              pHalfZ = pillarHalfD;
              p1x = door.x - pillarOffset; p1z = door.z;
              p2x = door.x + pillarOffset; p2z = door.z;
            }
            const c1x = Math.max(p1x - pHalfX, Math.min(x, p1x + pHalfX));
            const c1z = Math.max(p1z - pHalfZ, Math.min(z, p1z + pHalfZ));
            if ((x - c1x) ** 2 + (z - c1z) ** 2 < radius * radius) return true;

            const c2x = Math.max(p2x - pHalfX, Math.min(x, p2x + pHalfX));
            const c2z = Math.max(p2z - pHalfZ, Math.min(z, p2z + pHalfZ));
            if ((x - c2x) ** 2 + (z - c2z) ** 2 < radius * radius) return true;
          }
        }
      }
    }

    // 발전기 및 콘솔 데스크 충돌 체크
    for (const prop of this.propColliders) {
      const dx = x - prop.x;
      const dz = z - prop.z;
      const minDist = radius + prop.r;
      if (dx * dx + dz * dz < minDist * minDist) {
        return true;
      }
    }

    return false;
  }

  getTileAt(x, z) {
    const t = worldToTile(x, z);
    if (t.row < 0 || t.row >= MAP_ROWS || t.col < 0 || t.col >= MAP_COLS) return '#';
    const line = this.activeMap ? this.activeMap[t.row] : null;
    return line ? line[t.col] : ' ';
  }

  isWaterAt(x, z) {
    const t = worldToTile(x, z);
    if (this.chapterId === 'chapter2') {
      return this.isWaterTile(t.col, t.row) && this.getFloorHeightAt(x, z) < 0.35;
    }
    return this.getTileAt(x, z) === 'W';
  }
}
