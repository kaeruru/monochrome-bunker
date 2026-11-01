import * as THREE from 'three';
import {
  MonsterEntity,
  CrawlerCrocodileEntity,
  LurkerCrocodileEntity,
  SnareMangleEntity
} from './models.js';
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

    this.activeVentNodes = [...VENT_NODES];
    this.chapterId = 'chapter1';
    this.monsterType = 'stalker';

    // 1. 괴물 3D 모델 인스턴스 생성 (인게임에서는 monsterAI 단일 컨트롤러가 3D 사운드를 제어하므로 엔티티 자체 사운드는 false)
    this.stalkerEntity = new MonsterEntity();
    this.stalkerEntity.enableSound = false;
    this.stalkerEntity.soundVolume = 0.0;
    this.rootGroup.add(this.stalkerEntity.root);

    this.crawlerEntity = new CrawlerCrocodileEntity();
    this.crawlerEntity.enableSound = false;
    this.crawlerEntity.soundVolume = 0.0;
    this.crawlerEntity.root.visible = false;
    this.rootGroup.add(this.crawlerEntity.root);

    // 제2장 삼두 괴수 #2: 매복자 악어 (경사로/사다리 입구 잠복 & 손전등 카운터플레이)
    this.lurkerEntity = new LurkerCrocodileEntity();
    this.lurkerEntity.root.visible = false;
    this.rootGroup.add(this.lurkerEntity.root);

    // 제2장 삼두 괴수 #3: 맹글 악어 (수로 천장 매달림 & 낙하 결박 + 스토커 호출)
    this.snareEntity = new SnareMangleEntity();
    this.snareEntity.root.visible = false;
    this.rootGroup.add(this.snareEntity.root);

    this.monster = this.stalkerEntity;

    // 제2장 삼두 괴수(#2 매복자, #3 맹글) 전용 상태 및 순찰 경로 변수
    this.lurkerNodes = [];
    this.allWaterNodes = [];
    this.lurkerPos = new THREE.Vector3(0, -10, 0);
    this.lurkerYaw = 0;
    this.lurkerState = 'LURK_PATROL'; // 'LURK_WAIT' | 'LURK_PATROL' | 'LURK_ATTACK' | 'LURK_RELOCATE'
    this.lurkerTimer = 0;
    this.lurkerTargetNode = null;
    this.lurkerWaterSplashTimer = 0;
    this.lurkerLightExposure = 0;

    this.snareNodes = [];
    this.allCeilingNodes = [];
    this.snarePos = new THREE.Vector3(0, -10, 0);
    this.snareYaw = 0;
    this.snareState = 'SNARE_CRAWL'; // 'SNARE_CEILING' | 'SNARE_CRAWL' | 'SNARE_HOLD' | 'SNARE_COOLDOWN'
    this.snareTimer = 0;
    this.snareTargetNode = null;
    this.snareStaticTimer = 1.5;
    this.snareAlarmTimer = 0;
    this.isPlayerSnared = false;
    this.snareEscapeProgress = 0;

    // 2. 환기구(Vent) 3D 그릴 메쉬 생성
    this.ventMeshes = [];
    this.buildVentNetworkMeshes();

    // 3. AI 상태 변수 초기화
    this.state = 'VENT_LURK';
    this.stateTimer = 0;
    this.pos = new THREE.Vector3(0, 4.4, 0);
    this.yaw = 0;
    this.targetYaw = 0;
    this.radius = 0.44;
    this.waterEdgeFrustrationTimer = 0;

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

    // 지상 타일 경로 탐색(BFS) 전용 제로-가비지 고정 버퍼
    const totalBfsTiles = MAP_ROWS * MAP_COLS;
    this._bfsVisited = new Uint8Array(totalBfsTiles);
    this._bfsParent = new Int16Array(totalBfsTiles);
    this._bfsQueue = new Int16Array(totalBfsTiles);
    this._bfsToken = 1;

    // 카운터플레이 (방호문 강타 & 조명탄 스턴)
    this.bashingDoor = null;
    this.bashHitTimer = 0;

    // 가비지 컬렉션(GC) 방지용 재사용 임시 벡터 캐시
    this._tmpHeadWorld = new THREE.Vector3();
    this._tmpFwd = new THREE.Vector3();
    this._tmpUpAxis = new THREE.Vector3(0, 1, 0);
    this.stunCooldown = 0;
    this.sabotageCooldown = 45; // 초반 45초 동안은 괴물 직접 정전 습격 유예

    // 스토커 엿보기(STALK_PEEK) 및 지상 발소리 타이머
    this.stalkPeekTimer = 0;
    this.footstepTimer = 0;

    // 처형 연출 상태
    this.isKillingPlayer = false;
    this.killTimer = 0;

    // 난이도 및 이동 속도 밸런스 설정 (괴물이 걸어서 도망칠 수 없는 긴박한 속도)
    this.difficulty = 'normal';
    this.patrolSpeed = 4.8;
    this.investigateSpeed = 6.2;
    this.chaseSpeed = 10.2;
    this.hearingSprintRadius = 22.0;

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
   * 새 매치 시작 시 괴물 초기화
   * - 챕터 1: 가장 먼 환기구(항해실/원자로실)에 잠복 상태로 초기화
   * - 챕터 2: 수로 삼두 괴수(#1 스토커 악어, #2 매복자 악어, #3 맹글 악어)를 침수 수로 각 포인트에 배치
   */
  resetForNewMatch() {
    this.isKillingPlayer = false;
    this.killTimer = 0;
    this.stunCooldown = 0;
    this.bashingDoor = null;
    this.path = [];
    this.pathIndex = 0;
    this.waterEdgeFrustrationTimer = 0;
    this.isPlayerSnared = false;
    this.snareEscapeProgress = 0;

    if (this.chapterId === 'chapter2') {
      this.buildChapter2TrioNodes();
      const startSpawns = [
        { col: 24, row: 3 },
        { col: 4, row: 4 },
        { col: 42, row: 4 }
      ];
      const pick = startSpawns[Math.floor(Math.random() * startSpawns.length)];
      const wPos = tileToWorld(pick.col, pick.row);
      this.pos.set(wPos.x, 0.0, wPos.z);
      this.monster.root.position.copy(this.pos);
      this.state = 'PATROL';
      this.stateTimer = 0;
      this.patrolDuration = 9999;
      this.setHeartCoreColor(0xdbe8ff);
      this.pickRandomPatrolPoint();

      this.lurkerEntity.root.visible = true;
      this.snareEntity.root.visible = true;
      this.relocateLurker(null, false);
      this.relocateSnare(null, false);

      this.updateBioSignHUD();
      return;
    }

    this.lurkerEntity.root.visible = false;
    this.snareEntity.root.visible = false;

    // 항해실(6) 또는 원자로실(0)에서 환기구 잠복 상태로 시작 (초반 10초 안전 유예)
    const count = this.activeVentNodes.length;
    this.currentVentIdx = count > 6 ? 6 : 0;
    this.targetVentIdx = this.pickNextVentIndex(this.currentVentIdx);
    this.ventProgress = 0;
    this.ventHopsRemaining = 2;

    const startVent = this.activeVentNodes[this.currentVentIdx % count];
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
      this.patrolSpeed = 3.8;
      this.investigateSpeed = 5.0;
      this.chaseSpeed = 8.8;
      this.hearingSprintRadius = 16.0;
    } else if (diff === 'hard') {
      this.patrolSpeed = 5.6;
      this.investigateSpeed = 7.2;
      this.chaseSpeed = 11.2;
      this.hearingSprintRadius = 26.0;
    } else {
      this.patrolSpeed = 4.8;
      this.investigateSpeed = 6.2;
      this.chaseSpeed = 10.2;
      this.hearingSprintRadius = 22.0;
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

  setChapter(chapterConfig) {
    if (!chapterConfig) return;
    this.chapterId = chapterConfig.id || 'chapter1';
    this.monsterType = chapterConfig.monsterType || 'stalker';
    if (chapterConfig.ventNodes && chapterConfig.ventNodes.length > 0) {
      this.activeVentNodes = [...chapterConfig.ventNodes];
    }

    // 챕터별 전용 괴물 모델 전환 (챕터 1: 스토커, 챕터 2: 수로 삼두 괴수)
    if (this.chapterId === 'chapter2') {
      this.monster = this.crawlerEntity;
      this.stalkerEntity.root.visible = false;
      this.crawlerEntity.root.visible = true;
      this.lurkerEntity.root.visible = true;
      this.snareEntity.root.visible = true;
    } else {
      this.monster = this.stalkerEntity;
      this.stalkerEntity.root.visible = true;
      this.crawlerEntity.root.visible = false;
      this.lurkerEntity.root.visible = false;
      this.snareEntity.root.visible = false;
      this.isPlayerSnared = false;
    }

    this.rebuildVentNetworkMeshes();
    this.resetForNewMatch();
  }

  /**
   * 제2장 전용: 맵 전체를 스캔하여
   * - #2 매복자 악어가 잠복할 '경사로(M)/사다리(H) 바로 앞 수로 입구 타일'(lurkerNodes)
   * - #2 매복자 악어가 순찰하며 헤엄칠 '전체 수로 네트워크 타일'(allWaterNodes)
   * - #3 맹글 악어가 천장에 매달릴 요충지(snareNodes) 및 기어다닐 '천장 배관 네트워크 타일'(allCeilingNodes) 자동 추출
   */
  buildChapter2TrioNodes() {
    this.lurkerNodes = [];
    this.allWaterNodes = [];
    this.snareNodes = [];
    this.allCeilingNodes = [];
    const readTile = (c, r) => (this.map && this.map.getTileChar ? this.map.getTileChar(c, r) : getTile(c, r));
    const dirs = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 }
    ];

    for (let r = 2; r < MAP_ROWS - 2; r++) {
      for (let c = 2; c < MAP_COLS - 2; c++) {
        if (!this.isCrawlerWaterTile(c, r)) continue;
        const w = tileToWorld(c, r);

        // 전체 수로 타일 보관 (헤엄 순찰용)
        this.allWaterNodes.push({ col: c, row: r, x: w.x, z: w.z });
        this.allCeilingNodes.push({ col: c, row: r, x: w.x, z: w.z });

        // 경사로('M') 또는 사다리('H')와 맞닿은 수로 타일인지 검사
        let exitTile = null;
        for (const { dc, dr } of dirs) {
          const nc = c + dc;
          const nr = r + dr;
          const nch = readTile(nc, nr);
          if (nch === 'M' || nch === 'H') {
            exitTile = tileToWorld(nc, nr);
            break;
          }
        }

        if (exitTile) {
          this.lurkerNodes.push({
            col: c,
            row: r,
            x: w.x,
            z: w.z,
            exitX: exitTile.x,
            exitZ: exitTile.z
          });
        } else if ((c + r) % 2 === 0 && Math.hypot(c - 24, r - 15) > 5) {
          this.snareNodes.push({
            col: c,
            row: r,
            x: w.x,
            z: w.z
          });
        }
      }
    }
  }

  /**
   * 제2장 #2 매복자 악어(The Lurker)를 수로 내에 재배치하고 순찰 또는 잠복 시작
   */
  relocateLurker(playerPos = null, excludeCurrent = true) {
    const pool = (this.allWaterNodes && this.allWaterNodes.length > 0) ? this.allWaterNodes : this.lurkerNodes;
    if (!pool || pool.length === 0) return;

    let candidates = pool.filter(n => {
      if (excludeCurrent && Math.hypot(n.x - this.lurkerPos.x, n.z - this.lurkerPos.z) < 4.0) {
        return false;
      }
      if (playerPos) {
        const d = Math.hypot(n.x - playerPos.x, n.z - playerPos.z);
        return d >= 7.0 && d <= 26.0;
      }
      return true;
    });

    if (candidates.length === 0) {
      candidates = pool;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.lurkerPos.set(pick.x, 0.02, pick.z);
    this.lurkerYaw = Math.random() * Math.PI * 2;
    this.lurkerState = Math.random() < 0.5 ? 'LURK_PATROL' : 'LURK_WAIT';
    this.lurkerTimer = this.lurkerState === 'LURK_PATROL' ? 12.0 + Math.random() * 8.0 : 8.0 + Math.random() * 6.0;
    this.lurkerTargetNode = null;
    this.lurkerLightExposure = 0;
    this.lurkerEntity.root.position.copy(this.lurkerPos);
    this.lurkerEntity.root.rotation.y = this.lurkerYaw;
  }

  /**
   * 제2장 #3 맹글 악어(The Snare)를 천장 배관 네트워크에 재배치하고 천장 기어가기/순찰 시작
   */
  relocateSnare(playerPos = null, excludeCurrent = true) {
    const pool = (this.allCeilingNodes && this.allCeilingNodes.length > 0) ? this.allCeilingNodes : this.snareNodes;
    if (!pool || pool.length === 0) return;

    let candidates = pool.filter(n => {
      if (excludeCurrent && Math.hypot(n.x - this.snarePos.x, n.z - this.snarePos.z) < 4.5) {
        return false;
      }
      if (Math.hypot(n.x - this.lurkerPos.x, n.z - this.lurkerPos.z) < 4.5) {
        return false;
      }
      if (playerPos) {
        const d = Math.hypot(n.x - playerPos.x, n.z - playerPos.z);
        return d >= 7.0 && d <= 25.0;
      }
      return true;
    });

    if (candidates.length === 0) {
      candidates = pool;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.snarePos.set(pick.x, 1.32, pick.z);
    this.snareYaw = Math.random() * Math.PI * 2;
    this.snareState = Math.random() < 0.6 ? 'SNARE_CRAWL' : 'SNARE_CEILING';
    this.snareTimer = this.snareState === 'SNARE_CRAWL' ? 14.0 + Math.random() * 8.0 : 7.0 + Math.random() * 5.0;
    this.snareTargetNode = null;
    this.snareEntity.root.position.copy(this.snarePos);
    this.snareEntity.root.rotation.y = this.snareYaw;
  }

  /**
   * 플레이어가 #3 맹글 악어에게 결박되었을 때(isPlayerSnared === true) 키 연타로 탈출 게이지 증가
   */
  addSnareStruggle(amount = 22) {
    if (!this.isPlayerSnared || this.snareState !== 'SNARE_HOLD') return false;
    this.snareEscapeProgress = Math.min(100, this.snareEscapeProgress + amount);
    if (sound.playMangleStruggle) sound.playMangleStruggle();
    return true;
  }

  /**
   * 플레이어가 음파 감지기로 강력 소나 펄스(Sonar Pulse Blast)를 발사했을 때:
   * 1) 전방/주변의 수중 매복자 악어를 수중 깊이 잠수 퇴각시킴
   * 2) 엄청난 수중 진동 소음으로 인해 스토커 악어(#1 The Ripper)를 즉시 플레이어 위치로 호출!
   */
  repelLurkerBySonarPulse(playerPos, forwardVec) {
    if (this.chapterId !== 'chapter2') return false;

    // 소나 펄스는 수로 전역에 막대한 충격파 소음을 방출하여 무조건 추격자 악어(#1)를 유인!
    this.notifyPlayerSound(playerPos.x, playerPos.z, 38.0, '소나 펄스 충격파');

    // 매복자가 이미 처형 중이거나 없으면 매복자 퇴각은 생략
    if (this.isKillingPlayer || this.lurkerState === 'LURK_ATTACK') return false;

    const dx = this.lurkerPos.x - playerPos.x;
    const dz = this.lurkerPos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 9.5) return false;

    const dirX = dx / Math.max(0.01, dist);
    const dirZ = dz / Math.max(0.01, dist);
    const dot = forwardVec.x * dirX + forwardVec.z * dirZ;
    // 전방 120도 이내이거나 3.5m 초근접 시 퇴치
    if (dot < 0.15 && dist > 3.5) return false;

    // 강력 소나 펄스 충격파 직격: 매복자 급잠수 퇴각
    sound.playLurkerSubmerge();
    this.lurkerState = 'LURK_RELOCATE';
    this.lurkerTimer = 1.3;
    this.relocateLurker(playerPos, true);
    return true;
  }

  /**
   * 소나 레이더 표시용: 수중에서 유영하는 괴물 위치 목록 반환 (스토커 악어 & 매복자 악어)
   * - 맹글 악어(#3)는 수중이 아니라 배수관 천장에 매달려 있으므로 수중 음파 레이더에 절대 감지되지 않습니다!
   */
  getTrioPositions() {
    if (this.chapterId !== 'chapter2') {
      return [{ pos: this.pos, role: 'stalker', state: this.state }];
    }
    return [
      { pos: this.pos, role: 'ripper', state: this.state },
      { pos: this.lurkerPos, role: 'lurker', state: this.lurkerState }
    ];
  }

  rebuildVentNetworkMeshes() {
    for (const vm of this.ventMeshes) {
      if (vm.group && vm.group.parent) {
        vm.group.parent.remove(vm.group);
      }
    }
    this.ventMeshes = [];
    this.buildVentNetworkMeshes();
  }

  /**
   * 환기구 노드에 바닥 그릴(개폐 회전 애니메이션 포함) 및 천장 덕트 설치
   * - 챕터 2의 악어 크롤러는 천장 환기구를 쓰지 않고 침수 수로('W') 내부에서만 서식하므로 생성 생략
   */
  buildVentNetworkMeshes() {
    if (this.chapterId === 'chapter2') return;
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

    for (let i = 0; i < this.activeVentNodes.length; i++) {
      const node = this.activeVentNodes[i];
      const w = tileToWorld(node.col, node.row);
      const floorY = this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(w.x, w.z) : 0;
      const ventGroup = new THREE.Group();
      ventGroup.position.set(w.x, floorY + 0.01, w.z);
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
        group: ventGroup,
        node,
        x: w.x,
        y: floorY,
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
   * 챕터 2 전용: 해당 타일이 수로 크롤러가 유영/진입 가능한 저지대 침수 하수관('W')인지 판별
   */
  isCrawlerWaterTile(col, row) {
    if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return false;
    if (this.map && this.map.isWaterTile && this.map.isWaterTile(col, row)) return true;
    const ch = this.map && this.map.getTileChar ? this.map.getTileChar(col, row) : getTile(col, row);
    return ch === 'W';
  }

  /**
   * 괴물이 (x, z) 월드 좌표로 이동 가능한지 검사 (챕터 2에서는 침수 수로 밖으로 절대 나가지 않도록 제한)
   */
  canMonsterOccupy(x, z) {
    if (this.map && this.map.checkCollision(x, z, this.radius)) return false;
    if (this.chapterId === 'chapter2') {
      const t = worldToTile(x, z);
      if (!this.isCrawlerWaterTile(t.col, t.row)) return false;
    }
    return true;
  }

  /**
   * 플레이어가 달리기, 문 조작, 캐비닛 열기 등 소음을 냈을 때 호출
   */
  notifyPlayerSound(px, pz, hearingRadius, soundLabel = '소음') {
    if (this.isKillingPlayer || this.state === 'STUNNED' || this.state === 'CHASE') return;

    const isCh2 = this.chapterId === 'chapter2';
    const inWater = this.map && this.map.isWaterAt ? this.map.isWaterAt(px, pz) : false;
    const isSonarShockwave = soundLabel.includes('소나') || soundLabel.includes('충격파');

    // 챕터 2 수로 크롤러는 물속 진동에 극도로 민감하며, 고지대(건조 구역)의 일반 발소리는 무시함 (단, 소나 충격파는 대폭음이므로 전역 감지)
    if (isCh2 && !inWater && !isSonarShockwave) {
      const playerFootY = this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(px, pz) : 1.4;
      if (playerFootY >= 0.60) return;
    }

    // 수로 물살을 걷거나 달리면 소음이 파이프라인을 타고 훨씬 멀리 전달됨!
    const effectiveHearingRadius = inWater ? hearingRadius * 1.45 : hearingRadius;

    const dist = Math.hypot(px - this.pos.x, pz - this.pos.z);
    if (dist > effectiveHearingRadius) return;

    if (isSonarShockwave && isCh2) {
      // 소나 펄스 충격파 발생 시: 22m 이내면 즉시 폭주 추격(CHASE)으로 플레이어 위치로 쇄도!
      if (dist <= 22.0) {
        this.startChase({ x: px, z: pz });
        return;
      }
    }

    if (this.state === 'VENT_LURK') {
      // 벤트 잠복 중 소리를 들으면 소음 지점과 가장 가까운 벤트로 즉시 방향을 틀어 출현 준비!
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < this.activeVentNodes.length; i++) {
        const vw = tileToWorld(this.activeVentNodes[i].col, this.activeVentNodes[i].row);
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
      // 지상/수로 순찰 중 소리를 들으면 즉시 해당 좌표로 수색 경로 설정
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
    const count = this.activeVentNodes.length;
    if (count <= 1) return 0;

    if (preferNearPlayerPos && Math.random() < 0.55) {
      // 55% 확률로 플레이어 주변(단, 너무 코앞이 아닌 10~28m 거리) 벤트를 선택해 긴장감 유지
      const candidates = [];
      for (let i = 0; i < count; i++) {
        if (i === excludeIdx) continue;
        const w = tileToWorld(this.activeVentNodes[i].col, this.activeVentNodes[i].row);
        const d = Math.hypot(preferNearPlayerPos.x - w.x, preferNearPlayerPos.z - w.z);
        if (d >= 9.0 && d <= 32.0) {
          candidates.push(i);
        }
      }
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    let next = Math.floor(Math.random() * count);
    if (next === excludeIdx) {
      next = (excludeIdx + 1 + Math.floor(Math.random() * (count - 1))) % count;
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

    // 2. 타일 그리드 차폐 검사 (무할당 스칼라 인라인 최적화)
    const steps = Math.ceil(dist / 0.45);
    const halfMapW = (MAP_COLS * TILE_SIZE) / 2;
    const halfMapH = (MAP_ROWS * TILE_SIZE) / 2;
    let prevCol = -999;
    let prevRow = -999;

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = x0 + dx * t;
      const sz = z0 + dz * t;
      const col = Math.floor((sx + halfMapW) / TILE_SIZE);
      const row = Math.floor((sz + halfMapH) / TILE_SIZE);
      if (col === prevCol && row === prevRow) continue;
      prevCol = col;
      prevRow = row;

      const ch = this.map && this.map.getTileChar ? this.map.getTileChar(col, row) : getTile(col, row);

      if (ch === '#' || ch === ' ' || ch === 'G' || ch === 'C') return false;
      if (ch === 'D') {
        const door = this.findDoorAtTile(col, row);
        if (door && !door.isOpen) return false;
      }
    }
    return true;
  }

  /**
   * 괴물이 플레이어를 시각적으로 발견했는지 판정
   * - 손전등 ON: 17.5m (챕터 2 약한 작업등은 12.5m) 거리까지 발각
   * - 손전등 OFF: 6.0m (정전 시 4.2m) 이내로 접근해야만 발각 -> 손전등을 끄고 숨는 전략 유효!
   * - 챕터 2: 수로 크롤러는 수면 아래(Y=0.0~0.56m)에 있으므로 고지대(Y >= 0.65m)에 올라간 플레이어는 시야로 포착하지 못함
   */
  canSeePlayer(playerPos, flashlightOn, isBlackout) {
    const isCh2 = this.chapterId === 'chapter2';
    if (isCh2 && this.map && this.map.getFloorHeightAt) {
      const playerFootY = this.map.getFloorHeightAt(playerPos.x, playerPos.z);
      if (playerFootY >= 0.65) return false;
    }

    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // 안개 가시거리(10.5m)와 괴물 시야 거리를 정밀 일치시켜 보이지 않는 원거리 억까 원천 차단
    // 챕터 2는 맵 자체가 손전등과 괴물이 무관하므로 손전등 온오프에 영향받지 않고 10.5m 기준 일정
    const maxSightDist = isCh2
      ? 10.5
      : (flashlightOn ? 15.0 : (isBlackout ? 3.5 : 5.2));
    if (dist > maxSightDist) return false;

    // 초근접(2.4m 이내)이 아니면 괴물의 정면 시야각 이내여야 함
    if (dist > 2.4) {
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const dot = fwdX * dirX + fwdZ * dirZ;

      // 챕터 1: 손전등을 켜고 괴물 근처(9m)를 비추면 시야각이 넓어짐
      // 챕터 2: 손전등과 무관하게 0.48 고정 시야각
      const minDot = isCh2 ? 0.48 : ((flashlightOn && dist < 9.0) ? 0.35 : 0.55);
      if (dot < minDot) return false;
    }

    return this.hasGridLineOfSight(this.pos.x, this.pos.z, playerPos.x, playerPos.z);
  }

  findDoorAtTile(col, row) {
    if (this.map && this.map.getDoorAt) return this.map.getDoorAt(col, row);
    if (!this.map || !this.map.doors) return null;
    for (const d of this.map.doors) {
      if (d.col === col && d.row === row) return d;
    }
    return null;
  }

  /**
   * 타일맵 BFS 최단 경로 탐색 (사전 할당 고정 TypedArray 제로-가비지 최적화)
   * - 챕터 2의 악어 크롤러는 오직 저지대 침수 수로('W') 타일로만 경로를 탐색하며,
   *   목표가 고지대에 있을 경우 목표와 가장 가까운 수로 경계(경사로/사다리 입구)까지만 접근합니다.
   * @param {number} targetX
   * @param {number} targetZ
   * @param {boolean} allowClosedDoors 추격(CHASE) 시 닫힌 문 앞까지 가서 부술 수 있도록 허용할지 여부
   */
  computePathToWorld(targetX, targetZ, allowClosedDoors = false) {
    const half = TILE_SIZE / 2;
    const halfMapW = (MAP_COLS * TILE_SIZE) / 2;
    const halfMapH = (MAP_ROWS * TILE_SIZE) / 2;
    const startCol = Math.floor((this.pos.x + halfMapW) / TILE_SIZE);
    const startRow = Math.floor((this.pos.z + halfMapH) / TILE_SIZE);
    let goalCol = Math.floor((targetX + halfMapW) / TILE_SIZE);
    let goalRow = Math.floor((targetZ + halfMapH) / TILE_SIZE);
    const isCh2 = this.chapterId === 'chapter2';
    const readTile = (c, r) => (this.map && this.map.getTileChar ? this.map.getTileChar(c, r) : getTile(c, r));

    // 목표 지점이 발전기 코어(G)나 콘솔(C) 등 진입 불가 타일 내부인 경우 주변 통행 가능한 바닥으로 목표 자동 보정
    const goalCh = readTile(goalCol, goalRow);
    if (goalCh === ' ' || goalCh === '#' || goalCh === 'G' || goalCh === 'C') {
      const adjCols = [goalCol, goalCol, goalCol + 1, goalCol - 1, goalCol + 1, goalCol - 1, goalCol + 1, goalCol - 1];
      const adjRows = [goalRow + 1, goalRow - 1, goalRow, goalRow, goalRow + 1, goalRow + 1, goalRow - 1, goalRow - 1];
      for (let i = 0; i < 8; i++) {
        const ach = readTile(adjCols[i], adjRows[i]);
        if (ach !== ' ' && ach !== '#' && ach !== 'G' && ach !== 'C') {
          goalCol = adjCols[i];
          goalRow = adjRows[i];
          break;
        }
      }
    }

    if (startCol === goalCol && startRow === goalRow) {
      if (!isCh2 || this.isCrawlerWaterTile(goalCol, goalRow)) {
        this.path = [{ x: targetX, z: targetZ, col: goalCol, row: goalRow }];
        this.pathIndex = 0;
        return;
      }
    }

    const startIdx = startRow * MAP_COLS + startCol;
    const goalIdx = goalRow * MAP_COLS + goalCol;

    this._bfsToken++;
    if (this._bfsToken >= 250) {
      this._bfsVisited.fill(0);
      this._bfsToken = 1;
    }

    let head = 0;
    let tail = 0;
    if (startRow >= 0 && startRow < MAP_ROWS && startCol >= 0 && startCol < MAP_COLS) {
      this._bfsVisited[startIdx] = this._bfsToken;
      this._bfsParent[startIdx] = -1;
      this._bfsQueue[tail++] = startIdx;
    }

    let found = false;
    let closestIdx = startIdx;
    let closestDist = Infinity;

    while (head < tail) {
      const curIdx = this._bfsQueue[head++];
      if (curIdx === goalIdx) {
        found = true;
        closestIdx = curIdx;
        break;
      }

      const curCol = curIdx % MAP_COLS;
      const curRow = Math.floor(curIdx / MAP_COLS);
      const dToGoal = Math.hypot(curCol - goalCol, curRow - goalRow);
      if (dToGoal < closestDist) {
        closestDist = dToGoal;
        closestIdx = curIdx;
      }

      const nCols = [curCol, curCol, curCol - 1, curCol + 1];
      const nRows = [curRow - 1, curRow + 1, curRow, curRow];

      for (let i = 0; i < 4; i++) {
        const nc = nCols[i];
        const nr = nRows[i];
        if (nr < 0 || nr >= MAP_ROWS || nc < 0 || nc >= MAP_COLS) continue;
        const nIdx = nr * MAP_COLS + nc;
        if (this._bfsVisited[nIdx] === this._bfsToken) continue;

        const ch = readTile(nc, nr);
        if (ch === ' ' || ch === '#' || ch === 'G' || ch === 'C') continue;
        if (isCh2 && !this.isCrawlerWaterTile(nc, nr)) continue;
        if (this.map && this.map.canStepBetweenTiles && !this.map.canStepBetweenTiles(curCol, curRow, nc, nr)) continue;

        if (ch === 'D' && !allowClosedDoors) {
          const door = this.findDoorAtTile(nc, nr);
          if (door && !door.isOpen) continue;
        }

        this._bfsVisited[nIdx] = this._bfsToken;
        this._bfsParent[nIdx] = curIdx;
        this._bfsQueue[tail++] = nIdx;
      }
    }

    const revPath = [];
    let currIdx = closestIdx;
    while (currIdx >= 0 && currIdx !== startIdx) {
      const c = currIdx % MAP_COLS;
      const r = Math.floor(currIdx / MAP_COLS);
      revPath.push({
        x: c * TILE_SIZE - halfMapW + half,
        z: r * TILE_SIZE - halfMapH + half,
        col: c,
        row: r
      });
      currIdx = this._bfsParent[currIdx];
    }

    revPath.reverse();
    if (found && (!isCh2 || this.isCrawlerWaterTile(goalCol, goalRow))) {
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
        revPath.push({ x: targetX, z: targetZ, col: goalCol, row: goalRow });
      }
    }
    this.path = revPath;
    this.pathIndex = 0;
  }

  /**
   * 가장 가까운 환기구(Vent) 또는 챕터 2 원거리 수로로 도주하는 경로 설정
   */
  retreatToNearestVent() {
    if (this.chapterId === 'chapter2') {
      this.state = 'PATROL';
      this.patrolDuration = 9999;
      this.setHeartCoreColor(0xdbe8ff);
      this.pickRandomPatrolPoint(true);
      this.updateBioSignHUD();
      return;
    }

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.activeVentNodes.length; i++) {
      const w = tileToWorld(this.activeVentNodes[i].col, this.activeVentNodes[i].row);
      const d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    this.targetVentIdx = bestIdx;
    const vw = tileToWorld(this.activeVentNodes[bestIdx].col, this.activeVentNodes[bestIdx].row);
    this.state = 'PATROL';
    this.patrolDuration = 0; // 벤트 도착 즉시 진입하도록 설정
    this.setHeartCoreColor(0xdbe8ff);
    this.computePathToWorld(vw.x, vw.z, false);
    this.updateBioSignHUD();
  }

  /**
   * 무작위 순찰 목적지 선택
   * - 챕터 1: 식당(중앙 벙커) 내부에 있을 때는 외부 복도나 타 격실로 이동하도록 유도
   * - 챕터 2: 수로 전용 악어 크롤러는 오직 원통형 침수 하수관('W') 타일 중에서만 순찰지를 선택하여 수로를 유영
   */
  pickRandomPatrolPoint(preferFar = false) {
    const candidates = [];
    const curTile = worldToTile(this.pos.x, this.pos.z);
    const isCh2 = this.chapterId === 'chapter2';
    const readTile = (c, r) => (this.map && this.map.getTileChar ? this.map.getTileChar(c, r) : getTile(c, r));

    if (isCh2) {
      const minD = preferFar ? 12 : 6;
      for (let r = 2; r < MAP_ROWS - 2; r++) {
        for (let c = 2; c < MAP_COLS - 2; c++) {
          if (!this.isCrawlerWaterTile(c, r)) continue;
          const distTiles = Math.hypot(c - curTile.col, r - curTile.row);
          if (distTiles >= minD && distTiles <= 28) {
            candidates.push({ col: c, row: r });
          }
        }
      }
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const w = tileToWorld(pick.col, pick.row);
        this.computePathToWorld(w.x, w.z, false);
      }
      return;
    }

    const inCafeteria = (curTile.col >= 19 && curTile.col <= 29 && curTile.row >= 2 && curTile.row <= 10);

    for (let r = 2; r < MAP_ROWS - 2; r++) {
      for (let c = 2; c < MAP_COLS - 2; c++) {
        const ch = readTile(c, r);
        if (ch === 'G' || ch === 'C' || ch === 'S') continue;

        if (ch === '.' || ch === 'R' || ch === 'B' || ch === 'W') {
          if (inCafeteria && ch === 'B' && Math.random() < 0.88) {
            continue;
          }

          const distTiles = Math.hypot(c - curTile.col, r - curTile.row);
          if (distTiles >= 4 && distTiles <= 16) {
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
    // 1. 직접 이동 시도 (챕터 2에서는 침수 수로 타일 내부로만 이동 제한)
    if (this.canMonsterOccupy(nextX, nextZ)) {
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
            if (this.canMonsterOccupy(tryX, tryZ)) {
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
        if (this.canMonsterOccupy(nextX, this.pos.z)) {
          this.pos.x = nextX;
          moved = true;
        } else if (this.canMonsterOccupy(this.pos.x, nextZ)) {
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
   * 좌측 상단 작전 목표 패널에 괴물 생체 신호(BIO-SIGN) 상태 업데이트 (미니멀 호러 - 스포일러 방지)
   */
  updateBioSignHUD() {
    if (!this.bioSignEl) {
      this.bioSignEl = document.getElementById('obj-monster-status');
    }
    if (!this.bioSignEl) return;
    this.bioSignEl.textContent = '';
    this.bioSignEl.style.display = 'none';
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
      const progress = 1.0 - Math.max(0, this.killTimer / 1.75);

      if (this.killerType === 'lurker') {
        // 매복자 악어의 솟구치는 곰덫 안면과 강철 이빨을 카메라가 정면 응시
        if (this.lurkerEntity.upperTrapJaw) {
          this.lurkerEntity.upperTrapJaw.getWorldPosition(this._tmpHeadWorld);
          this._tmpHeadWorld.y -= 0.08; // 쩍 벌어진 위턱과 아래턱 사이 입안 정중앙을 정확히 직시
        } else {
          this.lurkerEntity.root.getWorldPosition(this._tmpHeadWorld);
          this._tmpHeadWorld.y += 0.82;
        }

        const jitter = (1.0 - progress * 0.35) * 0.035;
        playerCamera.position.x = playerPos.x + (Math.random() - 0.5) * jitter;
        playerCamera.position.y = (this.lurkerPos.y + 1.42) + (Math.random() - 0.5) * jitter; // 눈높이를 1.42m로 상향하여 배가 아닌 안면/아가리가 화면에 선명하게 프레이밍
        playerCamera.position.z = playerPos.z + (Math.random() - 0.5) * jitter;
        playerCamera.lookAt(this._tmpHeadWorld);

        this.lurkerEntity.update(dt, 'jumpscare');
      } else {
        // 플레이어 카메라가 괴물의 안면 두개골과 날카로운 내턱을 강제로 정면 응시
        this.monster.headGroup.getWorldPosition(this._tmpHeadWorld);
        this._tmpHeadWorld.y -= 0.08; // 안면과 턱, 이빨이 정중앙에 위치하도록 보정

        // Euler 회전 왜곡 방지를 위해 카메라 위치에 미세 충격 지터를 적용하고 헤드를 직시
        const jitter = (1.0 - progress * 0.35) * 0.024;
        const killCamHeight = this.chapterId === 'chapter2' ? 1.24 : 1.62;
        playerCamera.position.x = playerPos.x + (Math.random() - 0.5) * jitter;
        playerCamera.position.y = (this.pos.y + killCamHeight) + (Math.random() - 0.5) * jitter;
        playerCamera.position.z = playerPos.z + (Math.random() - 0.5) * jitter;
        playerCamera.lookAt(this._tmpHeadWorld);

        this.monster.update(dt, 'jumpscare');
      }

      if (this.killTimer <= 0) {
        this.isKillingPlayer = false;
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
        this._tmpFwd.set(0, 0, -1).applyAxisAngle(this._tmpUpAxis, this.yaw);
        const prevX = this.pos.x;
        const prevZ = this.pos.z;
        this.pos.x += this._tmpFwd.x * dt * 0.95;
        this.pos.z += this._tmpFwd.z * dt * 0.95;
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
        const fromNode = this.activeVentNodes[this.currentVentIdx % this.activeVentNodes.length];
        const toNode = this.activeVentNodes[this.targetVentIdx % this.activeVentNodes.length];
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
        const groundY = vm && vm.y !== undefined ? vm.y : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);
        if (vm) {
          // 벤트 뚜껑이 젖혀지며 열림
          vm.gratePivot.rotation.x = THREE.MathUtils.lerp(vm.gratePivot.rotation.x, -1.25, dt * 8);
          this.pos.x = vm.x;
          this.pos.z = vm.z;
        }
        // 천장/바닥 환기구에서 지면(groundY)으로 부드럽게 착지
        const ratio = 1.0 - Math.max(0, this.stateTimer / 1.25);
        this.pos.y = THREE.MathUtils.lerp(groundY + 2.4, groundY, Math.min(1, ratio * 1.2));

        if (this.stateTimer <= 0) {
          this.pos.y = groundY;
          if (vm) vm.gratePivot.rotation.x = 0;

          // 만약 전기실(vent_elec)에 출현했고 정전 쿨다운이 끝났다면 60% 확률로 전력망 습격
          if (
            this.currentVentIdx === 3 &&
            this.sabotageCooldown <= 0 &&
            this.interactionSystem &&
            !this.interactionSystem.isBlackout &&
            Math.random() < 0.6
          ) {
            this.sabotageCooldown = 80;
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
        const groundY = vm && vm.y !== undefined ? vm.y : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);
        if (vm) {
          vm.gratePivot.rotation.x = THREE.MathUtils.lerp(vm.gratePivot.rotation.x, -1.2, dt * 8);
        }
        const ratio = 1.0 - Math.max(0, this.stateTimer / 1.1);
        this.pos.y = THREE.MathUtils.lerp(groundY, groundY + 3.2, Math.min(1, ratio));

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
        const isCh2 = this.chapterId === 'chapter2';
        const speedMult = isCh2 ? 0.92 : 1.0;
        this.pos.y = isCh2 ? 0.0 : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);
        this.patrolDuration -= dt;

        // 시야 내 플레이어 발각 검사
        if (this.canSeePlayer(playerPos, flashlightOn, isBlackout)) {
          if (distToPlayer <= 4.8 || isCh2) {
            this.startChase(playerPos);
          } else {
            this.startStalkPeek(playerPos);
          }
          break;
        }

        const arrived = this.moveAlongPath(dt, (this.patrolSpeed || 3.15) * speedMult, false);
        if (arrived) {
          this.pos.y = isCh2 ? 0.0 : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);
          if (isCh2) {
            // 챕터 2 악어 크롤러는 환기구에 들어가지 않고 침수 수로 네트워크를 계속 유영하며 순찰
            this.pickRandomPatrolPoint();
          } else if (this.patrolDuration <= 0) {
            // 순찰 시간이 끝나면 가장 가까운 환기구로 들어가 다른 구역으로 이동
            let nearIdx = 0;
            let nearDist = Infinity;
            for (let i = 0; i < this.activeVentNodes.length; i++) {
              const vw = tileToWorld(this.activeVentNodes[i].col, this.activeVentNodes[i].row);
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
              const vw = tileToWorld(this.activeVentNodes[nearIdx].col, this.activeVentNodes[nearIdx].row);
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
        const isCh2 = this.chapterId === 'chapter2';
        const speedMult = isCh2 ? 0.98 : 1.0;
        this.pos.y = isCh2 ? 0.0 : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);

        if (this.canSeePlayer(playerPos, flashlightOn, isBlackout)) {
          if (distToPlayer <= 4.8 || isCh2) {
            this.startChase(playerPos);
          } else {
            this.startStalkPeek(playerPos);
          }
          break;
        }

        const arrived = this.moveAlongPath(dt, (this.investigateSpeed || 4.35) * speedMult, !isCh2);
        this.pos.y = isCh2 ? 0.0 : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);
        if (arrived) {
          // 소음 지점 도착 후 주변을 두리번거리며 수색
          animMode = 'idle';
          this.stateTimer += dt;
          this.targetYaw += Math.sin(this.stateTimer * 2.6) * dt * 1.8;

          if (this.stateTimer >= (isCh2 ? 3.4 : 4.2)) {
            this.investigateTarget = null;
            this.state = 'PATROL';
            this.patrolDuration = isCh2 ? 9999 : (12 + Math.random() * 8);
            this.setHeartCoreColor(0xdbe8ff);
            this.pickRandomPatrolPoint();
            this.updateBioSignHUD();
          }
        }
        break;
      }

      case 'STALK_PEEK': {
        animMode = 'idle';
        const isCh2 = this.chapterId === 'chapter2';
        this.pos.y = isCh2 ? 0.0 : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);
        this.targetYaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
        this.stalkPeekTimer -= dt;

        // 플레이어가 손전등을 켜고 있거나, 움직이거나(걷기/달리기), 너무 근접(<= 4.5m)하면 즉시 추격 돌입!
        if (flashlightOn || isMoving || isSprinting || distToPlayer <= 4.5) {
          this.startChase(playerPos);
          break;
        }

        // 손전등을 끄고 가만히 멈춰 서서 3.2초를 버티면 괴물이 플레이어를 놓치고 순찰 복귀!
        if (this.stalkPeekTimer <= 0) {
          this.state = 'PATROL';
          this.patrolDuration = isCh2 ? 9999 : (12 + Math.random() * 8);
          this.setHeartCoreColor(0xdbe8ff);
          this.pickRandomPatrolPoint();
          this.updateBioSignHUD();
        }
        break;
      }

      case 'CHASE': {
        animMode = 'chase';
        const isCh2 = this.chapterId === 'chapter2';
        const speedMult = isCh2 ? 0.80 : 1.0;
        this.pos.y = isCh2 ? 0.0 : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);

        const playerFootY = this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(playerPos.x, playerPos.z) : 0;

        // 플레이어 포획 판정:
        // 챕터 1: 반경 1.65m 이내
        // 챕터 2 수로 크롤러: 거대한 4m 주둥이 공격 사정거리 2.35m 이내
        const catchRadius = isCh2 ? 2.35 : 1.65;
        const elevDiff = Math.abs(this.pos.y - playerFootY);
        // 플레이어가 수로에 있든, 경사로나 물가 턱에 걸쳐 있든 크롤러 2.35m 이내면 덮쳐서 처형!
        const canCatchElevation = isCh2 ? (elevDiff < 1.65) : (elevDiff < 0.95);

        if (distToPlayer < catchRadius && canCatchElevation) {
          this.triggerPlayerKill(playerPos, playerCamera);
          return;
        }

        // 챕터 2 전용: 플레이어가 고지대 깊숙이(거리 3.2m 이상, 고도 1.20m 이상) 도망쳤을 때만 물가에서 위협 후 순찰 복귀
        if (isCh2 && playerFootY >= 1.20 && distToPlayer > 3.2) {
          const arrivedEdge = this.moveAlongPath(dt, (this.chaseSpeed || 7.6) * speedMult, false);
          this.pos.y = 0.0;
          if (arrivedEdge || distToPlayer < 4.8) {
            animMode = 'attack'; // 물가 경계에서 고지대를 향해 악어 턱을 딱딱거리며 위협
            this.targetYaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
            this.waterEdgeFrustrationTimer = (this.waterEdgeFrustrationTimer || 0) + dt;
            if (this.waterEdgeFrustrationTimer >= 2.5) {
              this.waterEdgeFrustrationTimer = 0;
              this.state = 'PATROL';
              this.patrolDuration = 9999;
              this.setHeartCoreColor(0xdbe8ff);
              this.pickRandomPatrolPoint(true);
              if (this.callbacks.onToast) {
                this.callbacks.onToast('[SAFE ZONE] 고지대 통로 깊숙이 대피하여 수로 크롤러의 추격을 따돌렸습니다!', 'info');
              }
              this.updateBioSignHUD();
            }
          }
          break;
        }

        this.waterEdgeFrustrationTimer = 0;
        const seesPlayer = this.canSeePlayer(playerPos, flashlightOn, isBlackout);
        if (seesPlayer) {
          this.lastSeenPlayerPos.copy(playerPos);
          this.loseSightTimer = 0;
        } else {
          // 챕터 1: 손전등을 끄고 코너를 돌면 시야 상실 보너스, 챕터 2: 손전등과 무관
          this.loseSightTimer += dt * (isCh2 ? 1.0 : (flashlightOn ? 1.0 : 1.55));
        }

        // 주기적으로 플레이어의 마지막 목격 위치로 경로 갱신
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.35;
          this.computePathToWorld(this.lastSeenPlayerPos.x, this.lastSeenPlayerPos.z, !isCh2);
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

        this.moveAlongPath(dt, (this.chaseSpeed || 7.6) * speedMult, !isCh2);
        this.pos.y = isCh2 ? 0.0 : (this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0);
        break;
      }

      case 'DOOR_BASH': {
        animMode = 'attack';
        this.pos.y = this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0;
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
        this.pos.y = this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(this.pos.x, this.pos.z) : 0;
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

    // 지상 이동 시 3D 발소리 루프 (벽 너머에서 들리는 묵직한 쿵... 쿵... 소리)
    if (['PATROL', 'INVESTIGATE', 'CHASE'].includes(this.state) && actualDist > 0.005) {
      this.footstepTimer = (this.footstepTimer || 0) + dt;
      const stepInterval = (this.state === 'CHASE') ? 0.34 : 0.68;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0;
        if (distToPlayer < 24.0) {
          const dx = this.pos.x - playerPos.x;
          const dz = this.pos.z - playerPos.z;
          const camYaw = playerCamera.rotation ? playerCamera.rotation.y : 0;
          const localX = dx * Math.cos(camYaw) - dz * Math.sin(camYaw);
          const pan = Math.max(-1, Math.min(1, localX / 8.0));
          const vol = Math.max(0.04, (1.0 - distToPlayer / 24.0) * (this.state === 'CHASE' ? 0.50 : 0.28));
          sound.playMonsterFootstep3D(vol, pan, this.state === 'CHASE');
        }
      }
    }

    // 6. 제2장 전용: 삼두 괴수 #2(매복자 악어) & #3(맹글 악어) 상태 머신 업데이트
    if (this.chapterId === 'chapter2') {
      this.updateChapter2Trio(dt, playerPos, playerCamera, flashlightOn);
    }
  }

  /**
   * 제2장 수로 삼두 괴수 중 보조 포식자 2종(#2 매복자 악어, #3 맹글 악어) 업데이트
   * - 매복자 악어: 수로를 유유히 헤엄쳐 순찰(LURK_PATROL)하거나 입구에 잠복(LURK_WAIT)하며, 2.35m 내 접근 시 100% 즉시 1인칭 안면 점프스케어 처형 발동!
   * - 맹글 악어: 천장 배관을 삐걱거리며 기어서 순찰(SNARE_CRAWL)하거나 매달려(SNARE_CEILING) 정전기 잡음을 내며, 머리 위에서 낙하하여 결박!
   */
  updateChapter2Trio(dt, playerPos, playerCamera, flashlightOn) {
    const playerFootY = this.map && this.map.getFloorHeightAt
      ? this.map.getFloorHeightAt(playerPos.x, playerPos.z)
      : 0;

    // -------------------------------------------------------------------------
    // [A] #2 매복자 악어 (LurkerCrocodileEntity - 수중 헤엄 순찰 & 경사로 잠복 & 점프스케어)
    // -------------------------------------------------------------------------
    const dLurk = Math.hypot(playerPos.x - this.lurkerPos.x, playerPos.z - this.lurkerPos.z);

    // 1) 조명탄(Flare) 6.5m 이내 투척 시 수중 깊이 잠수 퇴각
    let repelledByFlare = false;
    if (this.interactionSystem && this.interactionSystem.activeFlares) {
      for (const flare of this.interactionSystem.activeFlares) {
        if (flare.life > 0 && Math.hypot(flare.mesh.position.x - this.lurkerPos.x, flare.mesh.position.z - this.lurkerPos.z) <= 6.5) {
          repelledByFlare = true;
          break;
        }
      }
    }

    if (repelledByFlare && this.lurkerState !== 'LURK_ATTACK') {
      sound.playLurkerSubmerge();
      this.lurkerState = 'LURK_RELOCATE';
      this.lurkerTimer = 1.2;
    } else if (dLurk < 2.35 && playerFootY < 1.45 && !this.isKillingPlayer && !this.isPlayerSnared) {
      // [점프스케어] 조명탄/소나 없이 매복자 2.35m 이내에 접근 시 수면을 박차고 솟구쳐 즉시 1인칭 안면 곰덫 처형!
      this.triggerPlayerKill(playerPos, playerCamera, 'lurker');
      return;
    } else if (this.lurkerState === 'LURK_PATROL') {
      // 수로를 따라 수면을 가르며 헤엄쳐 순찰 및 수중 플레이어 스토킹
      this.lurkerTimer -= dt;
      this.lurkerWaterSplashTimer = (this.lurkerWaterSplashTimer || 0) - dt;

      // 주기적 물살 소리 (플레이어가 18m 이내에 있을 때 입체 음향)
      if (this.lurkerWaterSplashTimer <= 0) {
        this.lurkerWaterSplashTimer = 3.2 + Math.random() * 1.5;
        if (dLurk < 18.0 && sound.playFootstepWater) {
          sound.playFootstepWater(0.24);
        }
      }

      // 목표 노드 선정
      if (!this.lurkerTargetNode || Math.hypot(this.lurkerTargetNode.x - this.lurkerPos.x, this.lurkerTargetNode.z - this.lurkerPos.z) < 0.65) {
        // 플레이어가 수로(물 속, Y < 0.65)에 있으면 플레이어 방향으로 헤엄침
        if (playerFootY < 0.65 && dLurk < 24.0) {
          this.lurkerTargetNode = { x: playerPos.x, z: playerPos.z };
        } else if (this.allWaterNodes && this.allWaterNodes.length > 0) {
          // 인접 수로 노드 무작위 탐색
          const nearby = this.allWaterNodes.filter(n => {
            const dist = Math.hypot(n.x - this.lurkerPos.x, n.z - this.lurkerPos.z);
            return dist >= 1.8 && dist <= 7.0;
          });
          if (nearby.length > 0) {
            this.lurkerTargetNode = nearby[Math.floor(Math.random() * nearby.length)];
          } else {
            this.lurkerTargetNode = this.allWaterNodes[Math.floor(Math.random() * this.allWaterNodes.length)];
          }

          // 경사로/사다리 근처라면 일정 확률로 잠복 대기 모드로 전환
          if (Math.random() < 0.35 && this.lurkerNodes.some(ln => Math.hypot(ln.x - this.lurkerPos.x, ln.z - this.lurkerPos.z) < 2.5)) {
            this.lurkerState = 'LURK_WAIT';
            this.lurkerTimer = 6.0 + Math.random() * 6.0;
          }
        }
      }

      if (this.lurkerTargetNode) {
        const dx = this.lurkerTargetNode.x - this.lurkerPos.x;
        const dz = this.lurkerTargetNode.z - this.lurkerPos.z;
        const targetYaw = Math.atan2(dx, dz);
        let yawDiff = targetYaw - this.lurkerYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.lurkerYaw += yawDiff * Math.min(1.0, dt * 4.5);

        const swimSpeed = (playerFootY < 0.65 && dLurk < 20.0) ? 3.2 : 2.2;
        this.lurkerPos.x += Math.sin(this.lurkerYaw) * swimSpeed * dt;
        this.lurkerPos.z += Math.cos(this.lurkerYaw) * swimSpeed * dt;
        this.lurkerPos.y = 0.02;
      }

      if (this.lurkerTimer <= 0 && dLurk > 10.0) {
        this.relocateLurker(playerPos, true);
      }

      this.lurkerEntity.root.position.copy(this.lurkerPos);
      this.lurkerEntity.root.rotation.y = this.lurkerYaw;
      this.lurkerEntity.update(dt, 'stalk');
    } else if (this.lurkerState === 'LURK_WAIT') {
      // 경사로/사다리 밑 수면 아래 잠복
      this.lurkerTimer -= dt;
      this.lurkerPos.y = -0.12;

      if (this.lurkerTimer <= 0) {
        this.lurkerState = 'LURK_PATROL';
        this.lurkerTimer = 12.0 + Math.random() * 8.0;
        this.lurkerTargetNode = null;
      }

      this.lurkerEntity.root.position.copy(this.lurkerPos);
      this.lurkerEntity.root.rotation.y = this.lurkerYaw;
      this.lurkerEntity.update(dt, 'idle');
    } else if (this.lurkerState === 'LURK_ATTACK') {
      this.lurkerTimer -= dt;
      this.lurkerEntity.root.position.copy(this.lurkerPos);
      this.lurkerEntity.root.rotation.y = this.lurkerYaw;
      this.lurkerEntity.update(dt, 'attack');
      if (this.lurkerTimer <= 0) {
        this.lurkerState = 'LURK_RELOCATE';
        this.lurkerTimer = 1.0;
      }
    } else if (this.lurkerState === 'LURK_RELOCATE') {
      this.lurkerTimer -= dt;
      this.lurkerPos.y -= dt * 0.95;
      this.lurkerEntity.root.position.copy(this.lurkerPos);
      this.lurkerEntity.update(dt, 'idle');
      if (this.lurkerTimer <= 0) {
        this.relocateLurker(playerPos, true);
      }
    }

    // -------------------------------------------------------------------------
    // [B] #3 맹글 악어 (SnareMangleEntity - 천장 배관 기어가기 순찰 & 라디오 잡음 & 낙하 결박)
    // -------------------------------------------------------------------------
    const dSnare = Math.hypot(playerPos.x - this.snarePos.x, playerPos.z - this.snarePos.z);

    // 주기적 FNAF Mangle 풍 기괴한 라디오 정전기 잡음
    this.snareStaticTimer -= dt;
    if (this.snareStaticTimer <= 0) {
      this.snareStaticTimer = 2.4 + Math.random() * 1.4;
      if (dSnare < 19.0) {
        const sVol = Math.pow(1 - dSnare / 19.0, 1.4) * 0.38;
        sound.playMangleStatic(sVol);
      }
    }

    // 조명탄 퇴치
    if (repelledByFlare && this.snareState !== 'SNARE_HOLD') {
      this.snareState = 'SNARE_COOLDOWN';
      this.snareTimer = 2.5;
      sound.playLurkerSubmerge();
    } else if (dSnare < 1.95 && playerFootY < 0.75 && !this.isKillingPlayer && !this.isPlayerSnared && this.snareState !== 'SNARE_COOLDOWN') {
      // 머리 위에서 낙하하여 결박 발동!
      this.snareState = 'SNARE_HOLD';
      this.snareTimer = 4.5;
      this.snareAlarmTimer = 0.85;
      this.isPlayerSnared = true;
      this.snareEscapeProgress = 0;
      sound.playSnareGrab();
      this.startChase(playerPos);
      if (this.callbacks.onToast) {
        this.callbacks.onToast(
          '[SNARED] 천장의 맹글 크롤러에게 붙잡혔습니다! [SPACE / E / 클릭] 연타로 탈출하십시오! 스토커 악어가 접근합니다!',
          'danger'
        );
      }
    } else if (this.snareState === 'SNARE_CRAWL') {
      // 천장 배관/철골을 따라 거꾸로 매달려 스멀스멀 기어서 순찰
      this.snareTimer -= dt;

      if (!this.snareTargetNode || Math.hypot(this.snareTargetNode.x - this.snarePos.x, this.snareTargetNode.z - this.snarePos.z) < 0.65) {
        // 플레이어가 근처(16m)에서 소음을 내면 플레이어 머리 위로 기어감
        if (dSnare < 16.0) {
          this.snareTargetNode = { x: playerPos.x, z: playerPos.z };
        } else if (this.allCeilingNodes && this.allCeilingNodes.length > 0) {
          const nearby = this.allCeilingNodes.filter(n => {
            const dist = Math.hypot(n.x - this.snarePos.x, n.z - this.snarePos.z);
            return dist >= 2.0 && dist <= 7.0;
          });
          if (nearby.length > 0) {
            this.snareTargetNode = nearby[Math.floor(Math.random() * nearby.length)];
          } else {
            this.snareTargetNode = this.allCeilingNodes[Math.floor(Math.random() * this.allCeilingNodes.length)];
          }

          if (Math.random() < 0.28) {
            this.snareState = 'SNARE_CEILING';
            this.snareTimer = 5.0 + Math.random() * 4.0;
          }
        }
      }

      if (this.snareTargetNode) {
        const dx = this.snareTargetNode.x - this.snarePos.x;
        const dz = this.snareTargetNode.z - this.snarePos.z;
        const targetYaw = Math.atan2(dx, dz);
        let yawDiff = targetYaw - this.snareYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.snareYaw += yawDiff * Math.min(1.0, dt * 3.8);

        const crawlSpeed = (dSnare < 14.0) ? 2.4 : 1.7;
        this.snarePos.x += Math.sin(this.snareYaw) * crawlSpeed * dt;
        this.snarePos.z += Math.cos(this.snareYaw) * crawlSpeed * dt;
        this.snarePos.y = 1.32;
      }

      if (this.snareTimer <= 0 && dSnare > 9.0) {
        this.relocateSnare(playerPos, true);
      }

      this.snareEntity.root.position.copy(this.snarePos);
      this.snareEntity.root.rotation.y = this.snareYaw;
      this.snareEntity.update(dt, 'chase');
    } else if (this.snareState === 'SNARE_CEILING') {
      // 천장에서 멈춰서 정전기 잡음을 내며 주변 탐색
      this.snareTimer -= dt;
      if (this.snareTimer <= 0) {
        this.snareState = 'SNARE_CRAWL';
        this.snareTimer = 12.0 + Math.random() * 8.0;
        this.snareTargetNode = null;
      }

      this.snareEntity.root.position.copy(this.snarePos);
      this.snareEntity.root.rotation.y = this.snareYaw;
      this.snareEntity.update(dt, 'stalk');
    } else if (this.snareState === 'SNARE_HOLD') {
      this.snareTimer -= dt;
      this.snareEscapeProgress = Math.min(100, this.snareEscapeProgress + dt * 18.0);

      const dirToSnareX = this.snarePos.x - playerPos.x;
      const dirToSnareZ = this.snarePos.z - playerPos.z;
      const len = Math.max(0.01, Math.hypot(dirToSnareX, dirToSnareZ));
      this.snarePos.x = playerPos.x + (dirToSnareX / len) * 0.82;
      this.snarePos.z = playerPos.z + (dirToSnareZ / len) * 0.82;
      this.snarePos.y = THREE.MathUtils.lerp(this.snarePos.y, -0.12, dt * 14);
      this.snareYaw = Math.atan2(playerPos.x - this.snarePos.x, playerPos.z - this.snarePos.z);

      this.snareEntity.root.position.copy(this.snarePos);
      this.snareEntity.root.rotation.y = this.snareYaw;
      this.snareEntity.update(dt, 'attack');

      // 결박 중 0.9초마다 라디오 괴성
      this.snareAlarmTimer -= dt;
      if (this.snareAlarmTimer <= 0) {
        this.snareAlarmTimer = 0.92;
        sound.playMangleStatic(0.38);
        this.lastSeenPlayerPos.copy(playerPos);
        if (this.state !== 'CHASE') {
          this.startChase(playerPos);
        }
      }

      // 탈출 연타 실패 시 천장 맹글 악어가 플레이어를 낚아채 즉시 처형!
      if (this.snareTimer <= 0 && this.snareEscapeProgress < 100 && !this.isKillingPlayer) {
        this.triggerPlayerKill(playerPos, playerCamera);
        return;
      }

      if (this.snareEscapeProgress >= 100 || this.isKillingPlayer) {
        const escapedAlive = !this.isKillingPlayer;
        this.isPlayerSnared = false;
        this.snareEscapeProgress = 0;
        this.snareState = 'SNARE_COOLDOWN';
        this.snareTimer = 3.5;
        if (escapedAlive) {
          sound.playLurkerSubmerge();
          if (this.callbacks.onToast) {
            this.callbacks.onToast(
              '[ESCAPED] 맹글 크롤러의 작살 팔을 뿌리치고 결박에서 탈출했습니다! 어서 고지대로 피하십시오!',
              'success'
            );
          }
        }
      }
    } else if (this.snareState === 'SNARE_COOLDOWN') {
      this.snareTimer -= dt;
      this.snarePos.y += dt * 2.6;
      this.snareEntity.root.position.copy(this.snarePos);
      this.snareEntity.update(dt, 'idle');
      if (this.snareTimer <= 0) {
        this.relocateSnare(playerPos, true);
      }
    }
  }

  /**
   * 원거리 플레이어 최초 목격 시 엿보기 스토킹 상태 돌입 (3초간 관찰 & 숨죽이기 기회 제공)
   */
  startStalkPeek(playerPos) {
    if (this.state === 'STALK_PEEK' || this.state === 'CHASE') return;
    this.state = 'STALK_PEEK';
    this.stateTimer = 0;
    this.stalkPeekTimer = 3.2; // 3.2초 동안 가만히 관찰
    this.setHeartCoreColor(0xff1111);
    this.path = []; // 즉시 이동 정지
    this.targetYaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);

    // 어둠 속에서 낮게 울리는 으르렁 소리
    sound.playMonsterStalkGrowl(0.42);

    this.updateBioSignHUD();
  }

  /**
   * 플레이어 발각 시 추격 상태 돌입
   */
  startChase(playerPos) {
    if (this.state === 'CHASE') return;
    this.state = 'CHASE';
    this.loseSightTimer = 0;
    this.repathTimer = 0;
    this.waterEdgeFrustrationTimer = 0;
    this.lastSeenPlayerPos.copy(playerPos);
    this.setHeartCoreColor(0xff2222);
    const isCh2 = this.chapterId === 'chapter2';
    if (isCh2) {
      sound.playCrawlerScreech(0.55);
    } else {
      sound.playMonsterScreech(0.45);
    }
    this.computePathToWorld(playerPos.x, playerPos.z, !isCh2);
    if (this.callbacks.onToast) {
      this.callbacks.onToast(
        isCh2
          ? '[WATER ALERT] 수로 크롤러에게 발각되었습니다! 경사로·사다리로 올라가거나 조명탄[Q]을 던지십시오!'
          : '[ALERT] 괴물에게 발각되었습니다! 방호문을 닫거나 조명탄[Q]을 던지십시오!',
        'danger'
      );
    }
    this.updateBioSignHUD();
  }

  /**
   * 괴물에게 붙잡혔을 때 암전 및 1인칭 안면 고정 점프스케어 연출 시작
   * @param {THREE.Vector3} playerPos
   * @param {THREE.Camera} playerCamera
   * @param {'main'|'lurker'} killerType 처형 주체 괴물 종류 ('main': 스토커/크롤러, 'lurker': 매복자 악어)
   */
  triggerPlayerKill(playerPos, playerCamera, killerType = 'main') {
    this.isKillingPlayer = true;
    this.killerType = killerType;
    this.killTimer = 1.75;
    this.isPlayerSnared = false;
    if (this.snareState === 'SNARE_HOLD') {
      this.snareState = 'SNARE_COOLDOWN';
      this.snareTimer = 3.0;
    }

    this._tmpFwd.set(0, 0, -1).applyQuaternion(playerCamera.quaternion);
    this._tmpFwd.y = 0;
    if (this._tmpFwd.lengthSq() > 0.001) this._tmpFwd.normalize();

    if (killerType === 'lurker' && this.lurkerEntity) {
      // #2 매복자 악어 점프스케어: 플레이어 바로 정면 1.12m 위치로 수면을 뚫고 솟구쳐 곰덫 아가리로 안면 가격
      const offsetDist = 1.12;
      const floorY = (this.map && this.map.getFloorHeightAt) ? this.map.getFloorHeightAt(playerPos.x, playerPos.z) : 0.0;
      this.lurkerPos.x = playerPos.x + this._tmpFwd.x * offsetDist;
      this.lurkerPos.z = playerPos.z + this._tmpFwd.z * offsetDist;
      this.lurkerPos.y = floorY;
      this.lurkerYaw = Math.atan2(-this._tmpFwd.x, -this._tmpFwd.z);

      this.lurkerEntity.root.position.copy(this.lurkerPos);
      this.lurkerEntity.root.rotation.y = this.lurkerYaw;
      this.lurkerEntity.root.visible = true;
      this.lurkerState = 'LURK_ATTACK';
      this.lurkerTimer = 2.0;

      sound.playLurkerBite();
      sound.playCrawlerJumpscare();
    } else {
      // 일반 스토커 / 크롤러 괴물 점프스케어
      const isCh2 = this.chapterId === 'chapter2';
      const offsetDist = isCh2 ? 1.62 : 1.35;
      const groundY = this.map && this.map.getFloorHeightAt ? this.map.getFloorHeightAt(playerPos.x, playerPos.z) : 0;
      this.pos.x = playerPos.x + this._tmpFwd.x * offsetDist;
      this.pos.z = playerPos.z + this._tmpFwd.z * offsetDist;
      this.pos.y = isCh2 ? 0.0 : groundY;
      this.yaw = Math.atan2(-this._tmpFwd.x, -this._tmpFwd.z);

      this.monster.root.position.copy(this.pos);
      this.monster.root.rotation.y = this.yaw;
      this.setHeartCoreColor(0xff0000);

      if (this.chapterId === 'chapter2') {
        sound.playCrawlerJumpscare();
      } else {
        sound.playJumpscare();
      }
    }

    // 주변 조명 완전 암전 콜백 트리거
    if (this.callbacks.onKillStart) {
      this.callbacks.onKillStart();
    }
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
