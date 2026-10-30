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

export class Map3D {
  constructor(scene, customMapStrings = null) {
    this.scene = scene;
    this.materials = createIndustrialMaterials();

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.doors = [];
    this.cctvConfigs = [];
    this.propColliders = [];
    this.monsters = [];
    this.ceilingLamps = [];
    this.companion = null;
    this.consolePos = { x: 0, z: -8 };
    this.spawnPos = { x: 0, z: -2 };
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

  rebuildMap(newMapStrings) {
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
    this.cctvConfigs = [];
    this.propColliders = [];
    this.monsters = [];
    this.ceilingLamps = [];
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

  buildFromTileMap(mapArray) {
    let doorIndex = 1;

    // 대규모 지오메트리 병합 수집 버퍼 (드로우콜 2,000+개 -> 5개로 압축)
    const wallGeos = [];
    const floorCorridorGeos = [];
    const floorBunkerGeos = [];
    const floorRoomGeos = [];
    const ceilingGeos = [];

    const baseWallGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
    const baseFloorGeo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);

    for (let row = 0; row < MAP_ROWS; row++) {
      const line = mapArray[row] || '';
      for (let col = 0; col < MAP_COLS; col++) {
        const ch = line[col] || ' ';
        if (ch === ' ') continue;

        const pos = tileToWorld(col, row);

        // 1. 강철 방호벽 ('#')
        if (ch === '#') {
          const g = baseWallGeo.clone();
          g.applyMatrix4(new THREE.Matrix4().makeTranslation(pos.x, WALL_HEIGHT / 2, pos.z));
          wallGeos.push(g);
          continue;
        }

        // 2. 보행 가능 구역의 바닥 & 천장 지오메트리 수집
        const f = baseFloorGeo.clone();
        const fMat = new THREE.Matrix4();
        fMat.multiply(new THREE.Matrix4().makeTranslation(pos.x, 0, pos.z));
        fMat.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        f.applyMatrix4(fMat);

        if (['B', 'S', 'G', 'C'].includes(ch)) {
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

        // 3. 타일별 특수 오브젝트 배치
        if (ch === 'S') {
          this.spawnPos = { x: pos.x, z: pos.z };
        } else if (ch === 'G') {
          this.buildGenerator(pos.x, pos.z);
        } else if (ch === 'C') {
          this.consolePos = { x: pos.x, z: pos.z };
          this.buildCCTVConsole(pos.x, pos.z);
        } else if (ch === 'L') {
          this.buildCeilingLamp(pos.x, pos.z);
        } else if (ch === 'D') {
          this.buildVerticalDoor(doorIndex++, col, row, pos.x, pos.z);
        } else if (['1', '2', '3', '4'].includes(ch)) {
          this.buildCCTVCamera(parseInt(ch, 10), col, row, pos.x, pos.z);
        }
      }
    }

    // 드로우콜을 획기적으로 압축하는 통합 메쉬 생성
    if (wallGeos.length > 0) {
      const mergedWall = BufferGeometryUtils.mergeGeometries(wallGeos, false);
      const wallMesh = new THREE.Mesh(mergedWall, this.materials.wall);
      this.mapGroup.add(wallMesh);
      wallGeos.forEach(g => g.dispose());
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

    if (ceilingGeos.length > 0) {
      const mergedCeiling = BufferGeometryUtils.mergeGeometries(ceilingGeos, false);
      const ceilingMesh = new THREE.Mesh(mergedCeiling, this.materials.ceiling);
      this.mapGroup.add(ceilingMesh);
      ceilingGeos.forEach(g => g.dispose());
    }

    baseWallGeo.dispose();
    baseFloorGeo.dispose();

    // 카메라 번호순 정렬 (1 -> 2 -> 3 -> 4)
    this.cctvConfigs.sort((a, b) => a.id - b.id);

    // 4. 인게임 동료 캐릭터(벙커 내부) 및 심연 괴물(복도 순찰) 배치
    this.spawnEntities();
  }

  spawnEntities() {
    // 벙커 내부 동료 대원 (플레이어 스폰 좌측에서 주변 경계 - 협동 생존 컨셉)
    this.companion = new PlayerCharacterEntity('동료 대원 #02', true);
    this.companion.root.position.set(this.spawnPos.x - 2.3, 0, this.spawnPos.z - 1.2);
    this.companion.root.rotation.y = 0.45;
    this.mapGroup.add(this.companion.root);
    this.propColliders.push({
      x: this.companion.root.position.x,
      z: this.companion.root.position.z,
      r: 0.48
    });
  }

  /**
   * 1칸(1 타일) 상하 개폐식 강철 방호문 (Vertical Blast Door)
   * - 주변 벽/복도 배치를 분석해 가로(NS 통행) 또는 세로(EW 통행)로 자동 회전합니다.
   * - 문짝이 옆 타일을 침범하지 않고, 상단 헤더 박스 안으로 깔끔하게 수직 상승/하강합니다.
   */
  buildVerticalDoor(id, col, row, x, z) {
    const orientation = getDoorOrientation(this.activeMap, col, row);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
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
    if (id === 1) label = '서쪽 방호문';
    else if (id === 2) label = '동쪽 방호문';
    else if (id === 3) label = '남쪽 방호문';

    this.doors.push({
      id,
      name: label,
      col,
      row,
      x,
      z,
      orientation,
      isOpen: true,
      isMalfunctioning: false,
      openRatio: 1.0, // 1.0 = 완전히 열림(위), 0.0 = 완전히 닫힘(아래)
      clearHeight,
      shutter,
      ledFront,
      ledBack,
      doorLight: null
    });
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
      this.bunkerAmbient.color.setHex(flag ? 0xff3322 : 0xdde4ec);
      this.bunkerAmbient.intensity = flag ? 0.45 : 1.8;
    }
    if (this.genLight) {
      this.genLight.color.setHex(flag ? 0xff4422 : 0xeef4ff);
      this.genLight.intensity = flag ? 0.9 : 4.8;
    }
    if (this.consoleLight) {
      this.consoleLight.intensity = flag ? 0.25 : 2.1;
    }

    // 정전 직후 모든 천장등이 지직거리며 꺼지도록 플리커 타이머 강제 활성화
    for (const lamp of this.ceilingLamps) {
      lamp.flickerRemain = flag ? 0.75 : 0.35;
    }
  }

  buildGenerator(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

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

    // 중앙 발광 코어 기둥
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, WALL_HEIGHT - 0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0xe8e8e8 })
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
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.generatorCore.position.y = 1.6;
    this.generatorCore.rotation.x = Math.PI / 3;
    group.add(this.generatorCore);

    // 발전기 주 조명 (눈부심을 줄이고 주변만 은은하게 비추도록 감광)
    this.genLight = new THREE.PointLight(0xeef4ff, 4.8, 14, 1.7);
    this.genLight.position.set(0, 2.2, 0);
    group.add(this.genLight);

    this.mapGroup.add(group);
    this.propColliders.push({ x, z, r: 1.05 });
  }

  buildCCTVConsole(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

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

    // 콘솔 화면 불빛 (모바일 최적화: 자체 발광 스크린 메쉬로 충분히 표현하고 무거운 PointLight 제거)
    this.consoleLight = null;

    this.mapGroup.add(group);
    this.propColliders.push({ x, z, r: 0.78 });
  }

  buildCeilingLamp(x, z) {
    const group = new THREE.Group();
    group.position.set(x, WALL_HEIGHT - 0.06, z);

    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.08, 0.36),
      this.materials.doorFrame
    );
    group.add(fixture);

    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xbfc6cc });
    const tube = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.24),
      tubeMat
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.y = -0.045;
    group.add(tube);

    // 복도 천장등 (모바일 60FPS 최적화: 12개의 실시간 PointLight를 제거하고 자체 발광 튜브로 표현)
    this.mapGroup.add(group);

    this.ceilingLamps.push({
      x,
      z,
      light: null,
      tubeMat,
      baseIntensity: 2.2,
      nextFlickerIn: 2.5 + Math.random() * 9.0,
      flickerRemain: 0,
      soundCooldown: 0
    });
  }

  /**
   * CCTV 카메라 배치 및 가장 시야가 트인 복도 방향으로 자동 정렬
   */
  buildCCTVCamera(num, col, row, x, z) {
    // 4방향(북, 남, 동, 서) 중 가장 길게 뚫린 복도 방향을 계산
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

    // 카메라 본체 모델
    const camGroup = new THREE.Group();
    camGroup.position.set(x, WALL_HEIGHT - 0.28, z);
    camGroup.rotation.y = bestDir.yaw;

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

    // CCTV 카메라 본체 배치 (모바일 최적화: PointLight 제거)
    this.mapGroup.add(camGroup);

    const defaultNames = {
      1: 'CAM 01 - 동쪽 허브 복도',
      2: 'CAM 02 - 남쪽 관리실/창고 복도',
      3: 'CAM 03 - 북서 엔진/의무실 복도',
      4: 'CAM 04 - 서쪽 보안실/원자로 복도'
    };

    this.cctvConfigs.push({
      id: num,
      name: defaultNames[num] || `CAM 0${num} - 구역 감시`,
      pos: { x, y: WALL_HEIGHT - 0.38, z },
      baseYaw: bestDir.yaw,
      basePitch: -0.22
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

      // 괴물이 지상(y < 2.0)에서 전등 근처(6.5m 이내)를 지나가면 자기장 간섭으로 전등이 심하게 지직거림!
      let monsterNearLamp = false;
      if (monsterPos && monsterPos.y < 2.0) {
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

      if (lamp.flickerRemain > 0) {
        lamp.flickerRemain = Math.max(0, lamp.flickerRemain - dt);
        const onNow = Math.random() > 0.55;
        if (lamp.light) lamp.light.intensity = onNow ? lamp.baseIntensity * (0.3 + Math.random() * 0.7) : 0.05;
        lamp.tubeMat.color.setHex(onNow ? 0xbfc6cc : 0x22262a);

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
        if (lamp.light) lamp.light.intensity = 0;
        lamp.tubeMat.color.setHex(0x141618);
      } else {
        if (lamp.light) lamp.light.intensity = lamp.baseIntensity;
        lamp.tubeMat.color.setHex(0xbfc6cc);
      }
    }
  }

  /**
   * 플레이어 이동 충돌 판정 (원-타일 AABB + 오브젝트 원형 충돌)
   */
  checkCollision(x, z, radius = 0.42) {
    const center = worldToTile(x, z);
    const half = TILE_SIZE / 2;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = center.col + dc;
        const r = center.row + dr;
        const ch = this.getTileChar(c, r);

        if (ch === '#' || ch === ' ') {
          const tilePos = tileToWorld(c, r);
          const closestX = Math.max(tilePos.x - half, Math.min(x, tilePos.x + half));
          const closestZ = Math.max(tilePos.z - half, Math.min(z, tilePos.z + half));
          const dx = x - closestX;
          const dz = z - closestZ;
          if (dx * dx + dz * dz < radius * radius) {
            return true;
          }
        } else if (ch === 'D') {
          const door = this.doors.find(d => d.col === c && d.row === r);
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
}
