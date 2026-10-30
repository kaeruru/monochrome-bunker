import * as THREE from 'three';
import { MonsterEntity } from './models.js';
import {
  TILE_MAP,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
  WALL_HEIGHT,
  tileToWorld,
  worldToTile,
  getTile,
  getZoneName
} from './tilemapData.js';
import { sound } from './audio.js';

/**
 * 스켈드 벙커 내 8개 주요 환기구(Vent) 노드 좌표
 * - 플레이어 초기 스폰 구역(중앙 식당)에는 벤트를 두지 않아 초반 억까를 방지하고,
 *   외곽 주요 방에 배치하여 괴물이 벤트를 타고 신출귀몰하게 이동하도록 설계
 */
export const VENT_NODES = [
  { id: 'vent_reactor',   col: 3,  row: 16, zone: '원자로실' },
  { id: 'vent_upper_eng', col: 6,  row: 4,  zone: '상부 엔진실' },
  { id: 'vent_medbay',    col: 15, row: 11, zone: '의무실' },
  { id: 'vent_elec',      col: 16, row: 21, zone: '전기실' },
  { id: 'vent_admin',     col: 29, row: 14, zone: '관리실' },
  { id: 'vent_weapons',   col: 36, row: 5,  zone: '무기고' },
  { id: 'vent_nav',       col: 43, row: 15, zone: '항해실' },
  { id: 'vent_shields',   col: 36, row: 22, zone: '보호막 제어실' }
];

/**
 * 스켈드 벤트(환기구) 잠복 & 청각/시각 기반 전술 괴물 AI 시스템
 *
 * [핵심 상태 머신 (FSM)]
 * - VENT_LURK    : 천장 환기구(y=4.4m) 내부를 기어 다니며 쿵쿵 소리를 냄 (맵 압박 완화 & 공포감 조성)
 * - VENT_EMERGE  : 환기구 그릴 뚜껑을 젖히고 지상으로 내려오는 연출 (1.25초)
 * - VENT_ENTER   : 지상에서 환기구 속으로 다시 기어 올라가는 연출 (1.1초)
 * - PATROL       : 지상 구역을 묵직하게 순찰 (3.15 m/s - 걷는 플레이어보다 느림)
 * - INVESTIGATE  : 달리기 발소리/문 소리 등 소음이 발생한 좌표를 향해 이동 후 주변 수색 (4.4 m/s)
 * - CHASE        : 플레이어를 시야로 포착 시 괴성과 함께 전력 추격 (7.6 m/s - 플레이어 달리기 9.4 m/s보다 느려 도주 가능)
 * - DOOR_BASH    : 추격 중 닫힌 방호문(Blast Door)에 막히면 3.6초 동안 문을 쾅쾅 강타한 뒤 강제 개방
 * - STUNNED      : 점화된 조명탄(Flare) 섬광에 노출 시 4.5초간 시각 센서 마비 후 환기구로 도주
 * - KILL_ANIM    : 플레이어 포획 시 1.25초간 카메라를 고정하며 처형 모션 재생
 */
export class MonsterAI {
  constructor(scene, map, interactionSystem, callbacks = {}) {
    this.scene = scene;
    this.map = map;
    this.interactionSystem = interactionSystem;
    this.callbacks = callbacks; // { onToast, onPlayerCaught }

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // 1. 괴물 3D 모델 인스턴스 생성 (쉐이더 재컴파일 방지를 위해 항상 씬에 유지)
    this.monster = new MonsterEntity();
    this.monster.enableSound = true;
    this.monster.soundVolume = 0.0;
    this.rootGroup.add(this.monster.root);

    // 2. 8개 구역 환기구(Vent) 3D 그릴 메쉬 생성
    this.ventMeshes = [];
    this.buildVentNetworkMeshes();

    // 3. AI 상태 변수 초기화
    this.state = 'VENT_LURK';
    this.stateTimer = 0;
    this.pos = new THREE.Vector3(0, 4.4, 0);
    this.yaw = 0;
    this.targetYaw = 0;
    this.radius = 0.44;

    // 벤트 이동 관련
    this.currentVentIdx = 6; // 항해실(플레이어와 가장 먼 곳)에서 시작
    this.targetVentIdx = 5;
    this.ventProgress = 0;
    this.ventHopsRemaining = 2;
    this.ventClankTimer = 0;

    // 지상 타일 경로 탐색(A* / BFS) 관련
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.patrolDuration = 0;
    this.investigateTarget = null;
    this.lastSeenPlayerPos = new THREE.Vector3();
    this.loseSightTimer = 0;

    // 카운터플레이 (방호문 강타 & 조명탄 스턴)
    this.bashingDoor = null;
    this.bashHitTimer = 0;
    this.stunCooldown = 0;
    this.sabotageCooldown = 95; // 초반 95초 동안은 괴물 직접 정전 습격 유예

    // 처형 연출 상태
    this.isKillingPlayer = false;
    this.killTimer = 0;

    // 난이도 및 이동 속도 밸런스 설정
    this.difficulty = 'normal';
    this.patrolSpeed = 3.15;
    this.investigateSpeed = 4.35;
    this.chaseSpeed = 7.6;
    this.hearingSprintRadius = 21.0;

    // UI 엘리먼트 캐시
    this.bioSignEl = document.getElementById('obj-monster-status');
    this.vignetteEl = document.getElementById('vignette-overlay');

    // 멀티플레이 원격 제어 및 보간 상태
    this.isRemoteControlled = false;
    this.targetSyncPos = new THREE.Vector3(0, -10, 0);
    this.targetSyncYaw = 0;
    this.syncAnimMode = 'stalk';

    this.resetForNewMatch();
  }

  /**
   * 새 매치 시작 시 괴물을 가장 먼 환기구(항해실/원자로실)에 잠복 상태로 초기화
   */
  resetForNewMatch() {
    this.isKillingPlayer = false;
    this.killTimer = 0;
    this.stunCooldown = 0;
    this.bashingDoor = null;
    this.path = [];
    this.pathIndex = 0;

    // 항해실(6) 또는 원자로실(0)에서 환기구 잠복 상태로 시작 (초반 10초 안전 유예)
    this.currentVentIdx = Math.random() < 0.5 ? 6 : 0;
    this.targetVentIdx = this.pickNextVentIndex(this.currentVentIdx);
    this.ventProgress = 0;
    this.ventHopsRemaining = 2;

    const startVent = VENT_NODES[this.currentVentIdx];
    const wPos = tileToWorld(startVent.col, startVent.row);
    this.pos.set(wPos.x, 4.4, wPos.z);
    this.monster.root.position.copy(this.pos);
    this.state = 'VENT_LURK';
    this.stateTimer = 0;

    // 모든 벤트 뚜껑 닫기
    for (const vm of this.ventMeshes) {
      vm.gratePivot.rotation.x = 0;
    }

    this.setHeartCoreColor(0xdbe8ff);
    this.updateBioSignHUD();
  }

  setDifficulty(diff) {
    this.difficulty = diff;
    if (diff === 'easy') {
      this.patrolSpeed = 2.65;
      this.investigateSpeed = 3.8;
      this.chaseSpeed = 6.4;
      this.hearingSprintRadius = 15.0;
    } else if (diff === 'hard') {
      this.patrolSpeed = 3.65;
      this.investigateSpeed = 5.2;
      this.chaseSpeed = 8.6;
      this.hearingSprintRadius = 26.0;
    } else {
      this.patrolSpeed = 3.15;
      this.investigateSpeed = 4.35;
      this.chaseSpeed = 7.6;
      this.hearingSprintRadius = 21.0;
    }
  }

  applySyncData(data) {
    if (this.isKillingPlayer) return;
    this.isRemoteControlled = true;
    this.state = data.state;
    if (data.pos) {
      this.targetSyncPos.set(data.pos.x, data.pos.y, data.pos.z);
    }
    if (data.yaw !== undefined) {
      this.targetSyncYaw = data.yaw;
    }
    if (data.animMode) {
      this.syncAnimMode = data.animMode;
    }
    if (data.currentVent !== undefined) this.currentVentIdx = data.currentVent;
    if (data.targetVent !== undefined) this.targetVentIdx = data.targetVent;
    this.updateBioSignHUD();
  }

  /**
   * 8개 환기구 노드에 바닥 그릴(개폐 회전 애니메이션 포함) 및 천장 덕트 설치
   */
  buildVentNetworkMeshes() {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x22262a,
      roughness: 0.55,
      metalness: 0.82
    });
    const louverMat = new THREE.MeshStandardMaterial({
      color: 0x3a4046,
      roughness: 0.42,
      metalness: 0.88
    });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x020304 });

    for (let i = 0; i < VENT_NODES.length; i++) {
      const node = VENT_NODES[i];
      const w = tileToWorld(node.col, node.row);
      const ventGroup = new THREE.Group();
      ventGroup.position.set(w.x, 0.01, w.z);
      this.rootGroup.add(ventGroup);

      // 1. 바닥 심연 구멍
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.85), holeMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.005;
      ventGroup.add(hole);

      // 2. 외곽 강철 베젤 프레임
      const borderGeo = new THREE.BoxGeometry(1.28, 0.04, 0.98);
      const border = new THREE.Mesh(borderGeo, frameMat);
      border.position.y = 0.01;
      ventGroup.add(border);

      // 3. 경첩으로 열리는 상단 그릴 뚜껑 (gratePivot)
      const gratePivot = new THREE.Group();
      gratePivot.position.set(0, 0.03, -0.44);
      ventGroup.add(gratePivot);

      const lidFrame = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.03, 0.86), louverMat);
      lidFrame.position.set(0, 0, 0.43);
      gratePivot.add(lidFrame);

      // 통풍구 슬릿 살대 5개
      for (let s = -2; s <= 2; s++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.038, 0.06), frameMat);
        slat.position.set(0, 0.01, 0.43 + s * 0.14);
        gratePivot.add(slat);
      }

      // 4. 천장 환기구 덕트 그릴 (위쪽 천장에서도 벤트 위치가 보이도록 배치)
      const ceilVent = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.0), frameMat);
      ceilVent.position.set(0, WALL_HEIGHT - 0.05, 0);
      ventGroup.add(ceilVent);

      this.ventMeshes.push({
        node,
        x: w.x,
        z: w.z,
        gratePivot
      });
    }
  }

  /**
   * 괴물 심장 코어 색상 변경 (상태별 시각적 피드백)
   * - 평상시/순찰: 차가운 청백색 (0xdbe8ff)
   * - 소음 수색: 경계 주황색 (0xffaa33)
   * - 광폭 추격: 핏빛 적색 (0xff2222)
   * - 조명탄 스턴: 청록 스파크 (0x55ffff)
   */
  setHeartCoreColor(hexColor) {
    if (this.monster.mats && this.monster.mats.heartCoreMat) {
      if (this.monster.mats.heartCoreMat.color) {
        this.monster.mats.heartCoreMat.color.setHex(hexColor);
      }
      if (this.monster.mats.heartCoreMat.emissive) {
        this.monster.mats.heartCoreMat.emissive.setHex(hexColor);
      }
    }
    if (this.monster.heartLight) {
      this.monster.heartLight.color.setHex(hexColor);
    }
  }

  /**
   * 플레이어가 달리기, 문 조작, 캐비닛 열기 등 소음을 냈을 때 호출
   */
  notifyPlayerSound(px, pz, hearingRadius, soundLabel = '소음') {
    if (this.isKillingPlayer || this.state === 'STUNNED' || this.state === 'CHASE') return;

    const dist = Math.hypot(px - this.pos.x, pz - this.pos.z);
    if (dist > hearingRadius) return;

    if (this.state === 'VENT_LURK') {
      // 벤트 잠복 중 소리를 들으면 소음 지점과 가장 가까운 벤트로 즉시 방향을 틀어 출현 준비!
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < VENT_NODES.length; i++) {
        const vw = tileToWorld(VENT_NODES[i].col, VENT_NODES[i].row);
        const d = Math.hypot(px - vw.x, pz - vw.z);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      this.targetVentIdx = bestIdx;
      this.ventHopsRemaining = 0; // 다음 벤트 도착 즉시 지상으로 강하!
      this.investigateTarget = { x: px, z: pz };
    } else if (this.state === 'PATROL' || this.state === 'INVESTIGATE') {
      // 지상 순찰 중 소리를 들으면 즉시 해당 좌표로 수색 경로 설정
      this.investigateTarget = { x: px, z: pz };
      this.state = 'INVESTIGATE';
      this.stateTimer = 0;
      this.setHeartCoreColor(0xffaa33);
      this.computePathToWorld(px, pz, false);
      this.updateBioSignHUD();
    }
  }

  /**
   * 다음 이동할 환기구 노드 선택
   */
  pickNextVentIndex(excludeIdx, preferNearPlayerPos = null) {
    if (preferNearPlayerPos && Math.random() < 0.55) {
      // 55% 확률로 플레이어 주변(단, 너무 코앞이 아닌 10~28m 거리) 벤트를 선택해 긴장감 유지
      const candidates = [];
      for (let i = 0; i < VENT_NODES.length; i++) {
        if (i === excludeIdx) continue;
        const w = tileToWorld(VENT_NODES[i].col, VENT_NODES[i].row);
        const d = Math.hypot(preferNearPlayerPos.x - w.x, preferNearPlayerPos.z - w.z);
        if (d >= 9.0 && d <= 32.0) {
          candidates.push(i);
        }
      }
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    let next = Math.floor(Math.random() * VENT_NODES.length);
    if (next === excludeIdx) {
      next = (excludeIdx + 1 + Math.floor(Math.random() * (VENT_NODES.length - 1))) % VENT_NODES.length;
    }
    return next;
  }

  /**
   * 점화된 조명탄(Flare)이 괴물 근처에 있는지 검사하여 스턴 발동
   */
  checkFlareStun() {
    if (this.stunCooldown > 0) return false;
    if (this.state === 'VENT_LURK' || this.state === 'VENT_EMERGE' || this.state === 'VENT_ENTER' || this.state === 'STUNNED') {
      return false;
    }
    if (!this.interactionSystem || !this.interactionSystem.activeFlares) return false;

    for (const flare of this.interactionSystem.activeFlares) {
      if (flare.life <= 0) continue;
      const fx = flare.mesh.position.x;
      const fz = flare.mesh.position.z;
      const dist = Math.hypot(fx - this.pos.x, fz - this.pos.z);

      if (dist <= 6.2 && this.hasGridLineOfSight(this.pos.x, this.pos.z, fx, fz)) {
        // 조명탄 섬광에 의해 괴물 실명/스턴!
        this.state = 'STUNNED';
        this.stateTimer = 4.5;
        this.stunCooldown = 11.0; // 연속 무한 스턴 방지(벤트 도주 시간 확보)
        this.path = [];
        this.bashingDoor = null;
        this.setHeartCoreColor(0x55ffff);
        sound.playMonsterStun(0.48);
        if (this.callbacks.onToast) {
          this.callbacks.onToast('[COUNTERMEASURE] 조명탄의 강렬한 섬광이 괴물의 시각 센서를 마비시켰습니다! (4.5초 스턴)', 'success');
        }
        this.updateBioSignHUD();
        return true;
      }
    }
    return false;
  }

  /**
   * 두 월드 좌표 사이에 벽('#'), 심연(' '), 중앙 발전기 코어('G'), CCTV 콘솔('C'),
   * 닫힌 문('D') 및 원형 프랍 콜라이더가 없는지 엄격히 레이캐스트 검사
   */
  hasGridLineOfSight(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) return true;

    // 1. 프랍 콜라이더(중앙 발전기 코어, CCTV 콘솔 등) 실린더 차폐 검사
    if (this.map && this.map.propColliders) {
      const lenSq = dx * dx + dz * dz;
      if (lenSq > 0.0001) {
        for (const prop of this.map.propColliders) {
          const t = Math.max(0, Math.min(1, ((prop.x - x0) * dx + (prop.z - z0) * dz) / lenSq));
          const projX = x0 + t * dx;
          const projZ = z0 + t * dz;
          const dSq = (projX - prop.x) * (projX - prop.x) + (projZ - prop.z) * (projZ - prop.z);
          const blockR = prop.r * 0.88;
          if (dSq < blockR * blockR) {
            return false; // 거대한 발전기 코어나 콘솔에 시야가 완전히 차단됨!
          }
        }
      }
    }

    // 2. 타일 그리드 차폐 검사
    const steps = Math.ceil(dist / 0.45);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = x0 + dx * t;
      const sz = z0 + dz * t;
      const tile = worldToTile(sx, sz);
      const ch = getTile(tile.col, tile.row);

      if (ch === '#' || ch === ' ' || ch === 'G' || ch === 'C') return false;
      if (ch === 'D') {
        const door = this.findDoorAtTile(tile.col, tile.row);
        if (door && !door.isOpen) return false;
      }
    }
    return true;
  }

  /**
   * 괴물이 플레이어를 시각적으로 발견했는지 판정
   * - 손전등 ON: 17.5m 거리까지 발각
   * - 손전등 OFF: 6.0m (정전 시 4.2m) 이내로 접근해야만 발각 -> 손전등을 끄고 숨는 전략 유효!
   */
  canSeePlayer(playerPos, flashlightOn, isBlackout) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    const maxSightDist = flashlightOn ? 17.5 : (isBlackout ? 4.2 : 6.0);
    if (dist > maxSightDist) return false;

    // 초근접(2.1m 이내)이 아니면 괴물의 정면 시야각(약 104도, 반각 52도) 이내여야 함
    if (dist > 2.1) {
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const dot = fwdX * dirX + fwdZ * dirZ;

      // 손전등을 켜고 괴물 근처(9m)를 비추면 시야각이 넓어짐
      const minDot = (flashlightOn && dist < 9.0) ? 0.35 : 0.58;
      if (dot < minDot) return false;
    }

    return this.hasGridLineOfSight(this.pos.x, this.pos.z, playerPos.x, playerPos.z);
  }

  findDoorAtTile(col, row) {
    if (!this.map || !this.map.doors) return null;
    for (const d of this.map.doors) {
      if (d.col === col && d.row === row) return d;
    }
    return null;
  }

  /**
   * 타일맵 BFS 최단 경로 탐색
   * @param {number} targetX
   * @param {number} targetZ
   * @param {boolean} allowClosedDoors 추격(CHASE) 시 닫힌 문 앞까지 가서 부술 수 있도록 허용할지 여부
   */
  computePathToWorld(targetX, targetZ, allowClosedDoors = false) {
    const start = worldToTile(this.pos.x, this.pos.z);
    let goal = worldToTile(targetX, targetZ);

    // 목표 지점이 발전기 코어(G)나 콘솔(C) 등 진입 불가 타일 내부인 경우 주변 통행 가능한 바닥으로 목표 자동 보정
    const goalCh = getTile(goal.col, goal.row);
    if (goalCh === ' ' || goalCh === '#' || goalCh === 'G' || goalCh === 'C') {
      const adjTiles = [
        { col: goal.col, row: goal.row + 1 },
        { col: goal.col, row: goal.row - 1 },
        { col: goal.col + 1, row: goal.row },
        { col: goal.col - 1, row: goal.row },
        { col: goal.col + 1, row: goal.row + 1 },
        { col: goal.col - 1, row: goal.row + 1 },
        { col: goal.col + 1, row: goal.row - 1 },
        { col: goal.col - 1, row: goal.row - 1 }
      ];
      for (const adj of adjTiles) {
        const ach = getTile(adj.col, adj.row);
        if (ach !== ' ' && ach !== '#' && ach !== 'G' && ach !== 'C') {
          goal = adj;
          break;
        }
      }
    }

    if (start.col === goal.col && start.row === goal.row) {
      this.path = [{ x: targetX, z: targetZ, col: goal.col, row: goal.row }];
      this.pathIndex = 0;
      return;
    }

    const visited = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(false));
    const parent = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(null));
    const queue = [{ col: start.col, row: start.row }];
    if (start.row >= 0 && start.row < MAP_ROWS && start.col >= 0 && start.col < MAP_COLS) {
      visited[start.row][start.col] = true;
    }

    const dirs = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 }
    ];

    let found = false;
    let closestNode = { col: start.col, row: start.row, dist: Infinity };

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.col === goal.col && cur.row === goal.row) {
        found = true;
        break;
      }

      const dToGoal = Math.hypot(cur.col - goal.col, cur.row - goal.row);
      if (dToGoal < closestNode.dist) {
        closestNode = { col: cur.col, row: cur.row, dist: dToGoal };
      }

      for (const { dc, dr } of dirs) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (nr < 0 || nr >= MAP_ROWS || nc < 0 || nc >= MAP_COLS) continue;
        if (visited[nr][nc]) continue;

        const ch = getTile(nc, nr);
        // 발전기 코어(G) 및 CCTV 콘솔(C)을 통과 불가능한 고체 장애물로 엄격히 제외
        if (ch === ' ' || ch === '#' || ch === 'G' || ch === 'C') continue;

        if (ch === 'D' && !allowClosedDoors) {
          const door = this.findDoorAtTile(nc, nr);
          if (door && !door.isOpen) continue;
        }

        visited[nr][nc] = true;
        parent[nr][nc] = cur;
        queue.push({ col: nc, row: nr });
      }
    }

    const endNode = found ? goal : closestNode;
    const revPath = [];
    let curr = { col: endNode.col, row: endNode.row };
    while (curr && !(curr.col === start.col && curr.row === start.row)) {
      const w = tileToWorld(curr.col, curr.row);
      revPath.push({ x: w.x, z: w.z, col: curr.col, row: curr.row });
      curr = parent[curr.row]?.[curr.col];
    }

    revPath.reverse();
    if (found) {
      // 최종 타깃이 프랍 콜라이더(발전기 등) 내부이거나 너무 가까울 경우 프랍 중심 좌표를 경로에 넣지 않음
      let insideProp = false;
      if (this.map && this.map.propColliders) {
        for (const prop of this.map.propColliders) {
          if (Math.hypot(targetX - prop.x, targetZ - prop.z) < prop.r + 0.45) {
            insideProp = true;
            break;
          }
        }
      }
      if (!insideProp) {
        revPath.push({ x: targetX, z: targetZ, col: goal.col, row: goal.row });
      }
    }
    this.path = revPath;
    this.pathIndex = 0;
  }

  /**
   * 가장 가까운 환기구(Vent)로 돌아가는 경로 설정
   */
  retreatToNearestVent() {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < VENT_NODES.length; i++) {
      const w = tileToWorld(VENT_NODES[i].col, VENT_NODES[i].row);
      const d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    this.targetVentIdx = bestIdx;
    const vw = tileToWorld(VENT_NODES[bestIdx].col, VENT_NODES[bestIdx].row);
    this.state = 'PATROL';
    this.patrolDuration = 0; // 벤트 도착 즉시 진입하도록 설정
    this.setHeartCoreColor(0xdbe8ff);
    this.computePathToWorld(vw.x, vw.z, false);
    this.updateBioSignHUD();
  }

  /**
   * 무작위 순찰 목적지 선택
   * - 식당(중앙 벙커) 내부에 있을 때는 외부 복도나 타 격실로 이동하도록 유도
   * - 중앙 발전기 코어 및 CCTV 콘솔 바로 주변은 순찰 지점에서 원천 배제
   */
  pickRandomPatrolPoint() {
    const candidates = [];
    const curTile = worldToTile(this.pos.x, this.pos.z);
    const inCafeteria = (curTile.col >= 19 && curTile.col <= 29 && curTile.row >= 2 && curTile.row <= 10);

    for (let r = 2; r < MAP_ROWS - 2; r++) {
      for (let c = 2; c < MAP_COLS - 2; c++) {
        // 중앙 코어(24, 6) 및 콘솔(24, 3) 바로 앞은 목적지 배제
        if ((c === 24 && r === 6) || (c === 24 && r === 3)) continue;

        const ch = getTile(c, r);
        if (ch === '.' || ch === 'R' || ch === 'B') {
          // 이미 식당(벙커) 내부에 있다면 88% 확률로 'B'를 건너뛰고 복도('.') 및 다른 방('R')으로 나가도록 유도
          if (inCafeteria && ch === 'B' && Math.random() < 0.88) {
            continue;
          }

          const distTiles = Math.hypot(c - curTile.col, r - curTile.row);
          if (distTiles >= 4 && distTiles <= 15) {
            candidates.push({ col: c, row: r });
          }
        }
      }
    }

    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const w = tileToWorld(pick.col, pick.row);
      this.computePathToWorld(w.x, w.z, false);
    }
  }

  /**
   * 경로를 따라 지상에서 괴물 이동 처리
   * - 원형 프랍(발전기 코어, CCTV 콘솔 등)과의 접촉 시 매끄러운 둘레 접선(Tangent) 슬라이딩
   * - 막힘 감지 및 타임아웃 기반 자동 웨이포인트 스킵/재순찰 전환
   */
  moveAlongPath(dt, speed, allowDoorBash = false) {
    if (!this.path || this.pathIndex >= this.path.length) return true;

    const target = this.path[this.pathIndex];

    // 이동 중 앞에 닫힌 방호문(D)이 있는지 확인
    for (const door of this.map.doors) {
      if (!door.isOpen) {
        const dDist = Math.hypot(door.x - this.pos.x, door.z - this.pos.z);
        if (dDist < 1.55) {
          if (allowDoorBash) {
            // 추격/수색 중 닫힌 문에 막히면 문을 강타하는 DOOR_BASH 상태로 전환!
            this.state = 'DOOR_BASH';
            this.stateTimer = 3.5;
            this.bashHitTimer = 0.15;
            this.bashingDoor = door;
            if (this.callbacks.onToast) {
              this.callbacks.onToast('[DOOR IMPACT] 괴물이 폐쇄된 방호문을 강타하고 있습니다! 문이 뚫리기 전에 도망치십시오!', 'danger');
            }
            this.updateBioSignHUD();
            return false;
          } else {
            // 일반 순찰 중 닫힌 문을 만나면 다른 곳으로 우회
            this.pickRandomPatrolPoint();
            return false;
          }
        }
      }
    }

    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // 웨이포인트 통과 판정 (기본 0.42m, 혹은 좁은 공간에서 막힘 감지 시 1.35m)
    if (dist < 0.42 || (dist < 1.35 && (this.stuckTimer || 0) > 0.35)) {
      this.pathIndex++;
      this.stuckTimer = 0;
      return this.pathIndex >= this.path.length;
    }

    const dirX = dx / dist;
    const dirZ = dz / dist;
    this.targetYaw = Math.atan2(dirX, dirZ);

    const step = Math.min(dist, speed * dt);
    const nextX = this.pos.x + dirX * step;
    const nextZ = this.pos.z + dirZ * step;

    let moved = false;
    // 1. 직접 이동 시도
    if (!this.map.checkCollision(nextX, nextZ, this.radius)) {
      this.pos.x = nextX;
      this.pos.z = nextZ;
      moved = true;
    } else {
      // 2. 원형 프랍(발전기 코어 등) 외곽 접선(Tangent) 슬라이딩
      let slidOnProp = false;
      if (this.map && this.map.propColliders) {
        for (const prop of this.map.propColliders) {
          const pdx = this.pos.x - prop.x;
          const pdz = this.pos.z - prop.z;
          const pDist = Math.hypot(pdx, pdz);
          const clearance = this.radius + prop.r + 0.12;
          if (pDist < clearance + 0.6) {
            const nx = pDist > 0.001 ? pdx / pDist : 1;
            const nz = pDist > 0.001 ? pdz / pDist : 0;
            const t1x = -nz;
            const t1z = nx;
            const dot = t1x * dirX + t1z * dirZ;
            const tanX = dot >= 0 ? t1x : -t1x;
            const tanZ = dot >= 0 ? t1z : -t1z;

            const tryX = this.pos.x + tanX * step;
            const tryZ = this.pos.z + tanZ * step;
            if (!this.map.checkCollision(tryX, tryZ, this.radius)) {
              this.pos.x = tryX;
              this.pos.z = tryZ;
              moved = true;
              slidOnProp = true;
              break;
            }
          }
        }
      }

      // 3. 직선 벽면 축 분리 슬라이딩 (X축 또는 Z축)
      if (!slidOnProp) {
        if (!this.map.checkCollision(nextX, this.pos.z, this.radius)) {
          this.pos.x = nextX;
          moved = true;
        } else if (!this.map.checkCollision(this.pos.x, nextZ, this.radius)) {
          this.pos.z = nextZ;
          moved = true;
        }
      }
    }

    if (!moved) {
      this.stuckTimer = (this.stuckTimer || 0) + dt;
      if (this.stuckTimer > 0.45) {
        this.stuckTimer = 0;
        if (this.pathIndex < this.path.length - 1) {
          this.pathIndex++;
        } else {
          return true; // 목적지 도달 불가 시 경로 종료 처리하여 새로운 순찰/추격 유도
        }
      }
    } else {
      this.stuckTimer = 0;
    }

    return false;
  }

  /**
   * 좌측 상단 작전 목표 패널에 괴물 생체 신호(BIO-SIGN) 상태 업데이트
   */
  updateBioSignHUD() {
    if (!this.bioSignEl) {
      this.bioSignEl = document.getElementById('obj-monster-status');
    }
    if (!this.bioSignEl) return;

    if (this.state === 'VENT_LURK') {
      const targetNode = VENT_NODES[this.targetVentIdx] || VENT_NODES[0];
      this.bioSignEl.textContent = `[BIO-SIGN] 환기구 진동 감지: ${targetNode.zone} 방면 상부 덕트 이동 중`;
      this.bioSignEl.className = 'obj-line';
    } else if (this.state === 'VENT_EMERGE') {
      const node = VENT_NODES[this.currentVentIdx] || VENT_NODES[0];
      this.bioSignEl.textContent = `[BIO-SIGN] 경고: ${node.zone} 환기구 그릴 개방 감지!`;
      this.bioSignEl.className = 'obj-line danger';
    } else if (this.state === 'PATROL' || this.state === 'VENT_ENTER') {
      const t = worldToTile(this.pos.x, this.pos.z);
      const zName = getZoneName(t.col, t.row, getTile(t.col, t.row));
      this.bioSignEl.textContent = `[BIO-SIGN] 괴물 지상 배회 감지: ${zName}`;
      this.bioSignEl.className = 'obj-line';
    } else if (this.state === 'INVESTIGATE') {
      this.bioSignEl.textContent = `[BIO-SIGN] 주의: 괴물이 소음을 감지하고 수색 중입니다! (손전등 소등 권장)`;
      this.bioSignEl.className = 'obj-line danger';
    } else if (this.state === 'CHASE' || this.state === 'DOOR_BASH') {
      this.bioSignEl.textContent = `[BIO-SIGN] 위험! 괴물 추격 중! 방호문을 닫거나 조명탄[Q]을 투척하십시오!`;
      this.bioSignEl.className = 'obj-line danger';
    } else if (this.state === 'STUNNED') {
      this.bioSignEl.textContent = `[BIO-SIGN] 괴물 시각 센서 마비됨 (조명탄 섬광 효과 - 환기구로 퇴각 중)`;
      this.bioSignEl.className = 'obj-line ready';
    }
  }

  /**
   * 매 프레임 괴물 AI 업데이트
   */
  update(dt, playerPos, playerCamera, flashlightOn, isSprinting, isMoving) {
    if (this.interactionSystem && this.interactionSystem.isGameCleared) return;

    if (this.isRemoteControlled) {
      const prevX = this.pos.x;
      const prevZ = this.pos.z;
      // 비-호스트 멀티플레이 클라이언트: 무거운 AI 길찾기/레이캐스트를 건너뛰고 부드러운 위치/회전 보간만 처리
      this.pos.lerp(this.targetSyncPos, Math.min(1, dt * 14));
      let diff = this.targetSyncYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 14);

      const actualDist = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
      this.monster.root.position.copy(this.pos);
      this.monster.root.rotation.y = this.yaw;
      this.monster.root.visible = (this.state !== 'VENT_MOVE');
      this.monster.update(dt, this.syncAnimMode || 'stalk', actualDist);
      this.updateBioSignHUD();
      return;
    }

    const frameStartPos = this.pos.clone();

    if (this.stunCooldown > 0) this.stunCooldown -= dt;
    if (this.sabotageCooldown > 0) this.sabotageCooldown -= dt;

    // 1. 플레이어 처형(Jumpscare) 애니메이션 진행 중일 때
    if (this.isKillingPlayer) {
      this.killTimer -= dt;
      const progress = 1.0 - Math.max(0, this.killTimer / 1.65);

      // 플레이어 카메라가 괴물의 안면 두개골과 날카로운 내턱을 강제로 정면 응시
      const headWorld = new THREE.Vector3();
      this.monster.headGroup.getWorldPosition(headWorld);
      playerCamera.lookAt(headWorld);

      // 극도의 공포감과 충격을 전달하는 불규칙 카메라 셰이크 & Z축 왜곡 진동
      const shakeAmp = Math.sin(this.killTimer * 48) * 0.042 * (1.0 - progress * 0.4);
      playerCamera.rotation.z = shakeAmp;
      playerCamera.rotation.x += (Math.random() - 0.5) * 0.02;

      this.monster.update(dt, 'jumpscare');

      if (this.killTimer <= 0) {
        this.isKillingPlayer = false;
        playerCamera.rotation.z = 0;
        if (this.callbacks.onPlayerCaught) {
          this.callbacks.onPlayerCaught();
        }
      }
      return;
    }

    // 1-1. 처형 직후 CCTV 시점 전환 시 괴물의 사후 연출 (시신 주위 위협적 대치 후 복도 이탈)
    if (this.state === 'POST_KILL') {
      this.postKillTimer = (this.postKillTimer || 3.6) - dt;
      let diff = (this.postKillTargetYaw || 0) - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 2.2);
      this.monster.root.rotation.y = this.yaw;

      if (this.postKillTimer > 1.8) {
        this.monster.update(dt, 'stalk', 0);
      } else {
        const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        const prevX = this.pos.x;
        const prevZ = this.pos.z;
        this.pos.x += fwd.x * dt * 0.95;
        this.pos.z += fwd.z * dt * 0.95;
        const actualDist = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
        this.monster.root.position.copy(this.pos);
        this.monster.update(dt, 'stalk', actualDist);
      }
      return;
    }

    // 2. 플레이어 이동 소음 자동 감지 (달리기: 난이도별 반경, 걷기: 3.6m)
    if (isMoving) {
      if (isSprinting) {
        this.notifyPlayerSound(playerPos.x, playerPos.z, this.hearingSprintRadius || 21.0, '전력 질주 발소리');
      } else {
        this.notifyPlayerSound(playerPos.x, playerPos.z, 3.6, '발소리');
      }
    }

    // 3. 점화된 조명탄(Flare)에 의한 스턴 체크
    this.checkFlareStun();

    // 4. 플레이어와의 거리 기반 입체 음향 볼륨 계산
    const distToPlayer = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const maxHearDist = 26.0;
    const spatialVol = Math.max(0, Math.pow(1 - Math.min(distToPlayer, maxHearDist) / maxHearDist, 1.6)) * 0.48;
    this.monster.soundVolume = (this.state === 'VENT_LURK') ? 0 : spatialVol;

    // 위협 근접 비네트 연출 (지상에 있는 괴물이 14m 이내로 다가오면 화면 테두리에 붉은 맥박 긴장감 부여)
    if (this.vignetteEl) {
      if (this.state !== 'VENT_LURK' && distToPlayer < 14.0) {
        const threat = Math.pow(1 - distToPlayer / 14.0, 1.5);
        const redAlpha = (this.state === 'CHASE' ? 0.42 : 0.22) * threat;
        this.vignetteEl.style.boxShadow = `inset 0 0 ${90 + threat * 50}px rgba(${Math.floor(180 * threat)}, 0, 0, ${0.92 + redAlpha * 0.08})`;
      } else {
        this.vignetteEl.style.boxShadow = 'inset 0 0 90px rgba(0, 0, 0, 0.95)';
      }
    }

    const isBlackout = this.interactionSystem ? this.interactionSystem.isBlackout : false;
    let animMode = 'idle';

    // -------------------------------------------------------------------------
    // 상태별 FSM 행동 처리
    // -------------------------------------------------------------------------
    switch (this.state) {
      case 'VENT_LURK': {
        animMode = 'stalk';
        const fromNode = VENT_NODES[this.currentVentIdx];
        const toNode = VENT_NODES[this.targetVentIdx];
        const fromW = tileToWorld(fromNode.col, fromNode.row);
        const toW = tileToWorld(toNode.col, toNode.row);

        const segDist = Math.max(1.0, Math.hypot(toW.x - fromW.x, toW.z - fromW.z));
        const ventSpeed = 7.2; // 환기구 내부 이동 속도 (m/s)
        this.ventProgress += (ventSpeed * dt) / segDist;

        // 천장 위(y=4.4m)에서 이동하여 씬 광원 개수(NUM_POINT_LIGHTS) 변화를 원천 방지!
        const curX = THREE.MathUtils.lerp(fromW.x, toW.x, Math.min(1, this.ventProgress));
        const curZ = THREE.MathUtils.lerp(fromW.z, toW.z, Math.min(1, this.ventProgress));
        this.pos.set(curX, 4.4, curZ);
        this.targetYaw = Math.atan2(toW.x - fromW.x, toW.z - fromW.z);

        // 천장 환기구 철판 쾅쾅거리는 소리 재생
        this.ventClankTimer -= dt;
        if (this.ventClankTimer <= 0) {
          this.ventClankTimer = 0.68 + Math.random() * 0.35;
          const d = Math.hypot(playerPos.x - curX, playerPos.z - curZ);
          if (d < 25.0) {
            const vVol = Math.pow(1 - d / 25.0, 1.5) * 0.36;
            sound.playVentClank(vVol);
          }
        }

        if (this.ventProgress >= 1.0) {
          this.currentVentIdx = this.targetVentIdx;
          this.ventProgress = 0;

          if (this.ventHopsRemaining > 0) {
            this.ventHopsRemaining--;
            this.targetVentIdx = this.pickNextVentIndex(this.currentVentIdx, playerPos);
            this.updateBioSignHUD();
          } else {
            // 목표 환기구 도착 -> 그릴 뚜껑을 열고 지상으로 출현!
            this.state = 'VENT_EMERGE';
            this.stateTimer = 1.25;
            const d = Math.hypot(playerPos.x - toW.x, playerPos.z - toW.z);
            if (d < 26.0) {
              sound.playVentGrate(Math.max(0.08, (1 - d / 26.0) * 0.42));
            }
            this.updateBioSignHUD();
          }
        }
        break;
      }

      case 'VENT_EMERGE': {
        animMode = 'idle';
        this.stateTimer -= dt;
        const vm = this.ventMeshes[this.currentVentIdx];
        if (vm) {
          // 벤트 뚜껑이 젖혀지며 열림
          vm.gratePivot.rotation.x = THREE.MathUtils.lerp(vm.gratePivot.rotation.x, -1.25, dt * 8);
          this.pos.x = vm.x;
          this.pos.z = vm.z;
        }
        // 천장/바닥 환기구에서 지면(y=0)으로 부드럽게 착지
        const ratio = 1.0 - Math.max(0, this.stateTimer / 1.25);
        this.pos.y = THREE.MathUtils.lerp(2.4, 0.0, Math.min(1, ratio * 1.2));

        if (this.stateTimer <= 0) {
          this.pos.y = 0;
          if (vm) vm.gratePivot.rotation.x = 0;

          // 만약 전기실(vent_elec)에 출현했고 정전 쿨다운이 끝났다면 35% 확률로 전력망 습격
          if (
            this.currentVentIdx === 3 &&
            this.sabotageCooldown <= 0 &&
            this.interactionSystem &&
            !this.interactionSystem.isBlackout &&
            Math.random() < 0.35
          ) {
            this.sabotageCooldown = 240;
            this.interactionSystem.triggerBlackout('전기실 환기구에서 출현한 괴물이 주 배전반을 습격하여 정전이 발생했습니다!');
          }

          if (this.investigateTarget) {
            this.state = 'INVESTIGATE';
            this.setHeartCoreColor(0xffaa33);
            this.computePathToWorld(this.investigateTarget.x, this.investigateTarget.z, false);
          } else {
            this.state = 'PATROL';
            this.patrolDuration = 18 + Math.random() * 10;
            this.setHeartCoreColor(0xdbe8ff);
            this.pickRandomPatrolPoint();
          }
          this.updateBioSignHUD();
        }
        break;
      }

      case 'VENT_ENTER': {
        animMode = 'idle';
        this.stateTimer -= dt;
        const vm = this.ventMeshes[this.currentVentIdx];
        if (vm) {
          vm.gratePivot.rotation.x = THREE.MathUtils.lerp(vm.gratePivot.rotation.x, -1.2, dt * 8);
        }
        const ratio = 1.0 - Math.max(0, this.stateTimer / 1.1);
        this.pos.y = THREE.MathUtils.lerp(0.0, 3.2, Math.min(1, ratio));

        if (this.stateTimer <= 0) {
          if (vm) vm.gratePivot.rotation.x = 0;
          this.pos.y = 4.4;
          this.state = 'VENT_LURK';
          this.ventHopsRemaining = 1 + Math.floor(Math.random() * 2);
          this.targetVentIdx = this.pickNextVentIndex(this.currentVentIdx, playerPos);
          this.ventProgress = 0;
          this.setHeartCoreColor(0xdbe8ff);
          this.updateBioSignHUD();
        }
        break;
      }

      case 'PATROL': {
        animMode = 'stalk';
        this.pos.y = 0;
        this.patrolDuration -= dt;

        // 시야 내 플레이어 발각 검사
        if (this.canSeePlayer(playerPos, flashlightOn, isBlackout)) {
          this.startChase(playerPos);
          break;
        }

        const arrived = this.moveAlongPath(dt, this.patrolSpeed || 3.15, false);
        if (arrived) {
          if (this.patrolDuration <= 0) {
            // 순찰 시간이 끝나면 가장 가까운 환기구로 들어가 다른 구역으로 이동
            let nearIdx = 0;
            let nearDist = Infinity;
            for (let i = 0; i < VENT_NODES.length; i++) {
              const vw = tileToWorld(VENT_NODES[i].col, VENT_NODES[i].row);
              const d = Math.hypot(vw.x - this.pos.x, vw.z - this.pos.z);
              if (d < nearDist) {
                nearDist = d;
                nearIdx = i;
              }
            }
            if (nearDist < 1.8) {
              this.currentVentIdx = nearIdx;
              this.state = 'VENT_ENTER';
              this.stateTimer = 1.1;
              if (distToPlayer < 24.0) {
                sound.playVentGrate(Math.max(0.08, (1 - distToPlayer / 24.0) * 0.36));
              }
              this.updateBioSignHUD();
            } else {
              const vw = tileToWorld(VENT_NODES[nearIdx].col, VENT_NODES[nearIdx].row);
              this.computePathToWorld(vw.x, vw.z, false);
            }
          } else {
            this.pickRandomPatrolPoint();
          }
        }
        break;
      }

      case 'INVESTIGATE': {
        animMode = 'stalk';
        this.pos.y = 0;

        if (this.canSeePlayer(playerPos, flashlightOn, isBlackout)) {
          this.startChase(playerPos);
          break;
        }

        const arrived = this.moveAlongPath(dt, this.investigateSpeed || 4.35, true);
        if (arrived) {
          // 소음 지점 도착 후 4초 동안 주변을 두리번거리며 수색
          animMode = 'idle';
          this.stateTimer += dt;
          this.targetYaw += Math.sin(this.stateTimer * 2.6) * dt * 1.8;

          if (this.stateTimer >= 4.2) {
            this.investigateTarget = null;
            this.state = 'PATROL';
            this.patrolDuration = 12 + Math.random() * 8;
            this.setHeartCoreColor(0xdbe8ff);
            this.pickRandomPatrolPoint();
            this.updateBioSignHUD();
          }
        }
        break;
      }

      case 'CHASE': {
        animMode = 'chase';
        this.pos.y = 0;

        // 플레이어 포획 판정 (거리 1.15m 이내 & 벽 없음)
        if (distToPlayer < 1.15 && this.hasGridLineOfSight(this.pos.x, this.pos.z, playerPos.x, playerPos.z)) {
          this.triggerPlayerKill(playerPos, playerCamera);
          return;
        }

        const seesPlayer = this.canSeePlayer(playerPos, flashlightOn, isBlackout);
        if (seesPlayer) {
          this.lastSeenPlayerPos.copy(playerPos);
          this.loseSightTimer = 0;
        } else {
          // 손전등을 끄고 코너를 돌면 시야 상실 타이머가 더 빠르게 흐르도록 보너스 부여!
          this.loseSightTimer += dt * (flashlightOn ? 1.0 : 1.55);
        }

        // 주기적으로 플레이어의 마지막 목격 위치로 경로 갱신
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.35;
          this.computePathToWorld(this.lastSeenPlayerPos.x, this.lastSeenPlayerPos.z, true);
        }

        // 플레이어 시야를 6.2초 이상 놓치면 추격 종료 -> 마지막 위치 수색으로 전환
        if (this.loseSightTimer >= 6.2) {
          this.state = 'INVESTIGATE';
          this.stateTimer = 0;
          this.investigateTarget = { x: this.lastSeenPlayerPos.x, z: this.lastSeenPlayerPos.z };
          this.setHeartCoreColor(0xffaa33);
          if (this.callbacks.onToast) {
            this.callbacks.onToast('[EVADED] 괴물의 시야에서 벗어났습니다. 조용히 현장을 이탈하십시오.', 'info');
          }
          this.updateBioSignHUD();
          break;
        }

        // 추격 속도: 7.55 m/s (플레이어 걷기 5.4보다 빠르고, 달리기 9.4보다 느려 거리 벌리기 가능!)
        this.moveAlongPath(dt, this.chaseSpeed || 7.6, true);
        break;
      }

      case 'DOOR_BASH': {
        animMode = 'attack';
        this.pos.y = 0;
        this.stateTimer -= dt;
        this.bashHitTimer -= dt;

        // 만약 플레이어가 문을 다시 열었으면 즉시 추격 재개
        if (!this.bashingDoor || this.bashingDoor.isOpen) {
          this.state = 'CHASE';
          this.updateBioSignHUD();
          break;
        }

        this.targetYaw = Math.atan2(this.bashingDoor.x - this.pos.x, this.bashingDoor.z - this.pos.z);

        if (this.bashHitTimer <= 0) {
          this.bashHitTimer = 1.05;
          const bVol = Math.max(0.12, (1 - Math.min(distToPlayer, 26) / 26) * 0.55);
          sound.playDoorBash(bVol);
        }

        if (this.stateTimer <= 0) {
          // 3.5초 동안 문을 두드린 후 강제로 방호문을 열어젖힘!
          if (this.bashingDoor && !this.bashingDoor.isOpen) {
            this.map.toggleDoor(this.bashingDoor.id);
            if (sound && typeof sound.playDoorMalfunction === 'function') {
              sound.playDoorMalfunction();
            } else if (sound && typeof sound.playDoorSound === 'function') {
              sound.playDoorSound(true);
            }
          }
          this.bashingDoor = null;

          // 그 사이 플레이어가 멀리 도망쳤다면 수색(INVESTIGATE)으로, 아직 근처면 추격(CHASE)으로 전환
          if (distToPlayer > 11.5 && !this.canSeePlayer(playerPos, flashlightOn, isBlackout)) {
            this.state = 'INVESTIGATE';
            this.stateTimer = 0;
            this.setHeartCoreColor(0xffaa33);
          } else {
            this.state = 'CHASE';
            this.loseSightTimer = 2.0;
          }
          this.updateBioSignHUD();
        }
        break;
      }

      case 'STUNNED': {
        animMode = 'attack';
        this.pos.y = 0;
        this.stateTimer -= dt;
        // 고통스러워하며 좌우로 몸부림침
        this.targetYaw += Math.sin(this.stateTimer * 14.0) * dt * 5.0;

        if (this.stateTimer <= 0) {
          // 스턴 해제 후 가장 가까운 환기구로 즉시 도주!
          this.retreatToNearestVent();
        }
        break;
      }
    }

    // 5. 괴물 방향 회전 보간 및 3D 모델 트랜스폼/애니메이션 적용
    let angleDiff = this.targetYaw - this.yaw;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.yaw += angleDiff * Math.min(1, dt * 10);

    const actualDist = Math.hypot(this.pos.x - frameStartPos.x, this.pos.z - frameStartPos.z);
    this.monster.root.position.copy(this.pos);
    this.monster.root.rotation.y = this.yaw;
    this.monster.update(dt, animMode, actualDist);
  }

  /**
   * 플레이어 발각 시 추격 상태 돌입
   */
  startChase(playerPos) {
    if (this.state === 'CHASE') return;
    this.state = 'CHASE';
    this.loseSightTimer = 0;
    this.repathTimer = 0;
    this.lastSeenPlayerPos.copy(playerPos);
    this.setHeartCoreColor(0xff2222);
    sound.playMonsterScreech(0.45);
    this.computePathToWorld(playerPos.x, playerPos.z, true);
    if (this.callbacks.onToast) {
      this.callbacks.onToast('[ALERT] 괴물에게 발각되었습니다! 방호문을 닫거나 조명탄[Q]을 던지십시오!', 'danger');
    }
    this.updateBioSignHUD();
  }

  /**
   * 괴물에게 붙잡혔을 때 암전 및 1인칭 안면 고정 점프스케어 연출 시작
   */
  triggerPlayerKill(playerPos, playerCamera) {
    this.isKillingPlayer = true;
    this.killTimer = 1.65;

    // 플레이어 시야 정면 0.82m 위치에 괴물을 즉각 배치하여 플레이어를 마주보게 정렬
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(playerCamera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() > 0.001) fwd.normalize();

    this.pos.x = playerPos.x + fwd.x * 0.82;
    this.pos.z = playerPos.z + fwd.z * 0.82;
    this.pos.y = 0;
    this.yaw = Math.atan2(-fwd.x, -fwd.z);

    this.monster.root.position.copy(this.pos);
    this.monster.root.rotation.y = this.yaw;
    this.setHeartCoreColor(0xff0000);

    // 주변 조명 완전 암전 콜백 트리거
    if (this.callbacks.onKillStart) {
      this.callbacks.onKillStart();
    }

    sound.playJumpscare();
  }

  /**
   * 처형 점프스케어 종료 후 CCTV 화면에서 괴물이 대치하다가 천천히 이탈하는 모드 진입
   */
  enterPostKillStalk(bodyPos) {
    this.isKillingPlayer = false;
    this.state = 'POST_KILL';
    this.postKillTimer = 3.6;
    this.postKillTargetYaw = this.yaw + Math.PI * 0.85;
    this.setHeartCoreColor(0x992200);
  }
}
