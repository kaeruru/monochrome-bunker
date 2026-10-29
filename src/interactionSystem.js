import * as THREE from 'three';
import { tileToWorld } from './tilemapData.js';
import { buildItemMesh3D } from './viewModel.js';
import { sound } from './audio.js';

export const ITEM_METADATA = {
  energy_cell: {
    id: 'energy_cell',
    name: '플라즈마 에너지 셀',
    shortName: '에너지 셀',
    tag: '[BATTERY]',
    isCorePart: true,
    desc: '중앙 코어 가동용 고출력 배터리 셀입니다. [중앙 코어 소켓에 장착]'
  },
  security_keycard: {
    id: 'security_keycard',
    name: '보안 암호 디크립터',
    shortName: '보안 키카드',
    tag: '[KEYCARD]',
    isCorePart: true,
    desc: '중앙 코어 잠금을 해제하는 암호 해독 단말기입니다. [중앙 코어 소켓에 장착]'
  },
  coolant_valve: {
    id: 'coolant_valve',
    name: '초저온 냉각 밸브',
    shortName: '냉각 밸브',
    tag: '[VALVE]',
    isCorePart: true,
    desc: '중앙 코어 냉각 회로를 연결하는 고압 밸브 휠입니다. [중앙 코어 소켓에 장착]'
  },
  flare: {
    id: 'flare',
    name: '비상 전술 조명탄',
    shortName: '조명탄',
    tag: '[FLARE]',
    isCorePart: false,
    desc: '[Q / 투하] 키로 바닥에 점화 투하하여 45초 동안 주변 시야를 확보합니다.'
  }
};

// 매 판 무작위로 아이템이 배치될 14개 구역 후보 스폰 지점 풀
const CANDIDATE_SPAWN_SPOTS = [
  { col: 21, row: 19, zone: '중앙 창고 (북서 선반)', isLocker: false },
  { col: 26, row: 25, zone: '중앙 창고 (남동 캐비닛)', isLocker: true },
  { col: 16, row: 9,  zone: '의무실 (약품 보관함)', isLocker: true },
  { col: 13, row: 12, zone: '의무실 (수술대 선반)', isLocker: false },
  { col: 11, row: 14, zone: '보안실 (비상 캐비닛)', isLocker: true },
  { col: 5,  row: 3,  zone: '상부 엔진실 (정비 작업대)', isLocker: false },
  { col: 5,  row: 25, zone: '하부 엔진실 (연료 제어대)', isLocker: false },
  { col: 2,  row: 12, zone: '원자로실 (냉각 콘솔)', isLocker: false },
  { col: 31, row: 14, zone: '관리실 (데이터 테이블)', isLocker: false },
  { col: 39, row: 3,  zone: '무기고 (전술 무장 캐비닛)', isLocker: true },
  { col: 34, row: 10, zone: '산소공급실 (필터 선반)', isLocker: false },
  { col: 45, row: 14, zone: '항해실 (주 조종석 선반)', isLocker: false },
  { col: 39, row: 23, zone: '보호막 제어실 (배전 캐비닛)', isLocker: true },
  { col: 32, row: 26, zone: '통신실 (무전 장비 선반)', isLocker: false }
];

export class InteractionAndEscapeSystem {
  constructor(map, viewModel, callbacks = {}) {
    this.map = map;
    this.viewModel = viewModel;
    this.callbacks = callbacks; // { onToast, onEscapeSuccess, onBlackoutChange }

    this.group = new THREE.Group();
    this.map.mapGroup.add(this.group);

    // 플레이어 3슬롯 인벤토리
    this.inventory = [null, null, null];
    this.selectedSlot = 0;

    // 월드에 놓인 줍기 가능 아이템 목록
    this.worldItems = [];
    // 조사 가능한 전술 캐비닛(락커) 목록
    this.lockers = [];
    // 구역 스캔 단말기
    this.scannerTerminal = null;
    // 바닥에 점화된 조명탄 목록
    this.activeFlares = [];

    // 중앙 코어 조립 진행도 (총 4개 부품: 에너지 셀 x2, 보안 디크립터 x1, 냉각 밸브 x1)
    this.coreState = {
      energyCells: 0,      // 최대 2
      securityKeycard: 0,  // 최대 1
      coolantValve: 0,     // 최대 1
      totalInstalled: 0,
      maxTotal: 4,
      socketMeshes: []
    };

    // 비상 탈출 게이트 상태
    this.escapeGate = null;
    this.isEscapeOpen = false;
    this.isGameCleared = false;

    // 정전(블랙아웃) & 전기실 배전반 상태
    this.isBlackout = false;
    this.blackoutTransitionTimer = 0;
    this.breakerState = {
      x: 0,
      z: 0,
      leversPulled: 3, // 정상일 때는 3/3 올라가 있음, 정전 시 0/3으로 떨어짐
      leverMeshes: [],
      sparkLight: null,
      beaconLight: null,
      statusLed: null
    };

    // 자동 정전 이벤트 타이머 (약 4.5분~5.5분 간격으로 완화)
    this.autoBlackoutTimer = 280 + Math.random() * 80;
    this.blackoutCount = 0;

    this.time = 0;
    this.initSharedMaterials();
    this.setupNewMatch();
  }

  initSharedMaterials() {
    this.cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x262a2e,
      roughness: 0.62,
      metalness: 0.72
    });
    this.cabinetDoorMat = new THREE.MeshStandardMaterial({
      color: 0x32383e,
      roughness: 0.55,
      metalness: 0.76
    });
    this.crateMat = new THREE.MeshStandardMaterial({
      color: 0x1e2226,
      roughness: 0.75,
      metalness: 0.45
    });
    this.socketEmptyMat = new THREE.MeshStandardMaterial({
      color: 0x2a1818,
      emissive: 0x661111,
      emissiveIntensity: 0.7,
      roughness: 0.4
    });
    this.socketFilledMat = new THREE.MeshStandardMaterial({
      color: 0xd8fff0,
      emissive: 0x44ff99,
      emissiveIntensity: 1.4,
      roughness: 0.25
    });
  }

  /**
   * 매 판 새로운 아이템 무작위 배치 및 오브젝트 초기화
   */
  setupNewMatch() {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }

    this.inventory = [null, null, null];
    this.selectedSlot = 0;
    this.worldItems = [];
    this.lockers = [];
    this.activeFlares = [];

    this.coreState = {
      energyCells: 0,
      securityKeycard: 0,
      coolantValve: 0,
      totalInstalled: 0,
      maxTotal: 4,
      socketMeshes: []
    };

    this.isEscapeOpen = false;
    this.isGameCleared = false;
    this.isBlackout = false;
    this.autoBlackoutTimer = 280 + Math.random() * 80;

    // 1. 중앙 코어 부품 장착 슬롯 4개 생성 (벙커 중앙 발전기 주변)
    this.buildCentralCoreReceptors();

    // 2. 벙커 북쪽 벽 비상 탈출 엘리베이터 게이트 생성 (col 21, row 3)
    this.buildEscapeGate(21, 3);

    // 3. 벙커 북동쪽 부품 위치 스캔 단말기 생성 (col 27, row 3)
    this.buildScannerTerminal(27, 3);

    // 4. 전기실 주 배전반(차단기 레버 3개) 생성 (col 16, row 20)
    this.buildElectricalBreakerPanel(16, 20);

    // 5. 14개 후보 스팟 중 무작위 셔플하여 필수 코어 부품 4개 + 조명탄 배치
    this.spawnRandomizedItemsAndLockers();

    // 6. 벙커 스폰 지점 바로 옆 보급 상자에 기본 조명탄 1개 배치 (시작하자마자 1인칭 파지 테스트 가능!)
    const starterPos = tileToWorld(22, 8);
    this.buildSupplyCrateProp(starterPos.x, starterPos.z);
    this.spawnWorldItem('flare', starterPos.x, 0.62, starterPos.z, '벙커 내부 보급 상자');

    this.syncViewModelAndHUD();
  }

  /**
   * 중앙 발전기 코어(G) 둘레에 4개의 부품 장착 홀더를 생성합니다.
   */
  buildCentralCoreReceptors() {
    const genTile = tileToWorld(24, 6);
    this.corePos = { x: genTile.x, z: genTile.z };

    const slotAngles = [
      { angle: 0, label: '배터리 슬롯 #1', reqType: 'energy_cell' },
      { angle: Math.PI / 2, label: '배터리 슬롯 #2', reqType: 'energy_cell' },
      { angle: Math.PI, label: '보안 디크립터 슬롯', reqType: 'security_keycard' },
      { angle: -Math.PI / 2, label: '냉각 밸브 슬롯', reqType: 'coolant_valve' }
    ];

    this.coreState.socketMeshes = [];

    for (let i = 0; i < slotAngles.length; i++) {
      const s = slotAngles[i];
      const radius = 1.02;
      const sx = genTile.x + Math.sin(s.angle) * radius;
      const sz = genTile.z + Math.cos(s.angle) * radius;

      const pedestal = new THREE.Group();
      pedestal.position.set(sx, 0, sz);
      pedestal.rotation.y = s.angle;
      this.group.add(pedestal);

      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.96, 0.28),
        this.cabinetMat
      );
      post.position.y = 0.48;
      pedestal.add(post);

      const indicator = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.08, 0.04),
        this.socketEmptyMat.clone()
      );
      indicator.position.set(0, 0.86, 0.14);
      pedestal.add(indicator);

      const mountAnchor = new THREE.Group();
      mountAnchor.position.set(0, 1.08, 0);
      pedestal.add(mountAnchor);

      this.coreState.socketMeshes.push({
        reqType: s.reqType,
        filled: false,
        indicator,
        mountAnchor
      });
    }
  }

  /**
   * 벙커 북쪽 벽 비상 탈출 게이트 (코어 부품 4/4 조립 시 개방)
   */
  buildEscapeGate(col, row) {
    const pos = tileToWorld(col, row);
    const gateGroup = new THREE.Group();
    gateGroup.position.set(pos.x, 0, pos.z - 0.95);
    this.group.add(gateGroup);

    // 게이트 외곽 프레임
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 2.9, 0.32),
      this.cabinetMat
    );
    frame.position.y = 1.45;
    gateGroup.add(frame);

    // 상하 개폐식 탈출 장갑 셔터
    const shutter = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 2.45, 0.18),
      this.cabinetDoorMat
    );
    shutter.position.set(0, 1.25, 0.08);
    gateGroup.add(shutter);

    // 게이트 내부 탈출구 백라이트 (개방 시 밝은 백색광 방출)
    const interiorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.68, 2.4),
      new THREE.MeshBasicMaterial({ color: 0x090b0d })
    );
    interiorGlow.position.set(0, 1.25, 0.02);
    gateGroup.add(interiorGlow);

    // 상단 상태 표시등
    const statusBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.12, 0.06),
      this.socketEmptyMat.clone()
    );
    statusBar.position.set(0, 2.72, 0.17);
    gateGroup.add(statusBar);

    const gateLight = new THREE.PointLight(0xff3333, 1.2, 5, 1.8);
    gateLight.position.set(0, 2.5, 0.5);
    gateGroup.add(gateLight);

    this.escapeGate = {
      x: pos.x,
      z: pos.z - 0.65,
      shutter,
      interiorGlow,
      statusBar,
      gateLight,
      openRatio: 0
    };
  }

  /**
   * 부품 스캔 단말기: 아직 회수하지 못한 코어 부품이 어느 구역에 있는지 힌트 제공
   */
  buildScannerTerminal(col, row) {
    const pos = tileToWorld(col, row);
    const termGroup = new THREE.Group();
    termGroup.position.set(pos.x, 0, pos.z - 0.8);
    this.group.add(termGroup);

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.15, 0.55),
      this.cabinetMat
    );
    stand.position.y = 0.575;
    termGroup.add(stand);

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0xb8ffda,
      emissive: 0x22aa66,
      emissiveIntensity: 0.9
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.36),
      screenMat
    );
    screen.position.set(0, 1.32, 0.12);
    screen.rotation.x = -0.25;
    termGroup.add(screen);

    this.scannerTerminal = {
      x: pos.x,
      z: pos.z - 0.65,
      screenMat
    };
  }

  /**
   * 전기실(Electrical Room) 주 배전반 및 수동 복구 차단기 레버 3개 생성
   */
  buildElectricalBreakerPanel(col, row) {
    const pos = tileToWorld(col, row);
    const panelGroup = new THREE.Group();
    panelGroup.position.set(pos.x, 0, pos.z - 0.88);
    this.group.add(panelGroup);

    // 배전반 본체 캐비닛
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.85, 0.38),
      this.cabinetMat
    );
    box.position.y = 1.15;
    panelGroup.add(box);

    // 상단 비상 경광등
    const statusLed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.14, 12),
      this.socketFilledMat.clone()
    );
    statusLed.position.set(0, 2.15, 0.05);
    panelGroup.add(statusLed);

    const beaconLight = new THREE.PointLight(0x44ff99, 1.4, 6.5, 1.8);
    beaconLight.position.set(0, 2.2, 0.45);
    panelGroup.add(beaconLight);

    // 3개의 물리적 차단기 레버 스위치
    const leverMeshes = [];
    for (let i = 0; i < 3; i++) {
      const lx = (i - 1) * 0.34;
      const slotTrack = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.38, 0.06),
        this.crateMat
      );
      slotTrack.position.set(lx, 1.25, 0.19);
      panelGroup.add(slotTrack);

      const pivot = new THREE.Group();
      pivot.position.set(lx, 1.25, 0.21);
      // 기본 정상 상태: 위쪽(-0.55 rad)으로 올라가 있음
      pivot.rotation.x = -0.55;
      panelGroup.add(pivot);

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.18, 0.14),
        this.cabinetDoorMat
      );
      arm.position.set(0, 0, 0.06);
      pivot.add(arm);

      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10),
        new THREE.MeshStandardMaterial({ color: 0xcc4433, roughness: 0.45 })
      );
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0, 0, 0.13);
      pivot.add(handle);

      leverMeshes.push(pivot);
    }

    this.breakerState = {
      x: pos.x,
      z: pos.z - 0.55,
      leversPulled: 3,
      leverMeshes,
      beaconLight,
      statusLed
    };
  }

  buildSupplyCrateProp(x, z) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.56, 0.62),
      this.crateMat
    );
    crate.position.set(x, 0.28, z);
    crate.castShadow = true;
    crate.receiveShadow = true;
    this.group.add(crate);
  }

  /**
   * 14개 후보 스팟을 셔플하여 필수 코어 부품 4개 + 조명탄 2개 + 빈 캐비닛들을 배치합니다.
   */
  spawnRandomizedItemsAndLockers() {
    const shuffled = [...CANDIDATE_SPAWN_SPOTS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 매 판 무작위로 배정될 아이템 큐 (코어 필수 부품 4개 + 조명탄 2개)
    const itemsToSpawn = [
      'energy_cell',
      'energy_cell',
      'security_keycard',
      'coolant_valve',
      'flare',
      'flare'
    ];

    for (let i = 0; i < shuffled.length; i++) {
      const spot = shuffled[i];
      const pos = tileToWorld(spot.col, spot.row);
      const itemType = i < itemsToSpawn.length ? itemsToSpawn[i] : null;

      if (spot.isLocker) {
        this.buildInteractiveLocker(pos.x, pos.z, spot.zone, itemType);
      } else {
        this.buildSupplyCrateProp(pos.x, pos.z);
        if (itemType) {
          this.spawnWorldItem(itemType, pos.x, 0.62, pos.z, spot.zone);
        }
      }
    }
  }

  /**
   * 문을 열어 내부를 조사할 수 있는 철제 전술 보관함(Locker) 생성
   */
  buildInteractiveLocker(x, z, zoneName, hiddenItemType = null) {
    const lockerGroup = new THREE.Group();
    lockerGroup.position.set(x, 0, z);
    this.group.add(lockerGroup);

    // 캐비닛 몸체
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 1.95, 0.64),
      this.cabinetMat
    );
    body.position.set(0, 0.975, -0.04);
    lockerGroup.add(body);

    // 선반 판
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.04, 0.56),
      this.crateMat
    );
    shelf.position.set(0, 0.92, 0);
    lockerGroup.add(shelf);

    // 경첩으로 열리는 앞문
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.42, 0.975, 0.28);
    lockerGroup.add(doorPivot);

    const doorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 1.86, 0.05),
      this.cabinetDoorMat
    );
    doorMesh.position.set(0.42, 0, 0);
    doorPivot.add(doorMesh);

    const lockerObj = {
      x,
      z,
      zoneName,
      isOpen: false,
      openAngle: 0,
      doorPivot,
      hiddenItemType
    };
    this.lockers.push(lockerObj);
  }

  /**
   * 월드 바닥/선반에 3D 아이템 스폰
   */
  spawnWorldItem(itemType, x, y, z, zoneName = '시설 내부') {
    const { group, updateItemAnim } = buildItemMesh3D(itemType);
    group.position.set(x, y, z);

    // 어두운 방에서도 아이템 위치를 선명히 식별하는 네온 오라 비콘 (동적 PointLight 대신 사용해 쉐이더 재컴파일 프레임드랍 원천 방지)
    const glowColor = itemType === 'energy_cell' ? 0x88dcff : itemType === 'security_keycard' ? 0x55ff99 : (itemType === 'flare' ? 0xff5544 : 0xffaa77);
    const auraGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const auraMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.position.set(0, 0.12, 0);
    group.add(auraMesh);

    this.group.add(group);

    const itemEntry = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: itemType,
      x,
      y,
      z,
      baseY: y,
      zoneName,
      mesh: group,
      updateItemAnim
    };
    this.worldItems.push(itemEntry);
    return itemEntry;
  }

  /**
   * 정전(블랙아웃) 사태 발동!
   * - 모든 복도/벙커 전등이 지직거리며 꺼짐
   * - 모든 상하 방호문(D)이 고장나며 강제로 열림 (괴물 침입 가능)
   * - 전기실 배전반 차단기 레버가 0/3으로 내려감
   */
  triggerBlackout(reasonText = '괴물이 주 전력망을 습격하여 시설 전체가 정전되었습니다!') {
    if (this.isBlackout || this.isGameCleared) return;
    this.isBlackout = true;
    this.blackoutTransitionTimer = 0.85;
    this.blackoutCount++;

    sound.playBlackoutPowerDown();

    // 전기실 배전반 레버 3개를 모두 아래(OFF: +0.55 rad)로 떨어뜨리고 적색 경보등 점등
    this.breakerState.leversPulled = 0;
    for (const pivot of this.breakerState.leverMeshes) {
      pivot.rotation.x = 0.55;
    }
    if (this.breakerState.statusLed) {
      this.breakerState.statusLed.material.color.setHex(0xff3333);
      this.breakerState.statusLed.material.emissive.setHex(0xff1111);
    }
    if (this.breakerState.beaconLight) {
      this.breakerState.beaconLight.color.setHex(0xff2222);
      this.breakerState.beaconLight.intensity = 2.6;
    }

    // 맵의 모든 방호문 강제 개방 및 정전 모드 적용
    this.map.setBlackoutState(true);

    if (this.callbacks.onBlackoutChange) {
      this.callbacks.onBlackoutChange(true);
    }
    this.notifyToast(`[ALERT] ${reasonText} 전기실 배전반 차단기 레버(0/3)를 수동 복구하십시오.`, 'danger');
    this.updateObjectiveHUD();
  }

  /**
   * 전기실 배전반 차단기 레버 1단계씩 올리기 (3개 모두 올리면 전력 복구!)
   */
  pullNextBreakerLever() {
    if (!this.isBlackout) {
      this.notifyToast('[INFO] 시설 전력망이 정상 가동 중입니다.', 'info');
      return;
    }

    const idx = this.breakerState.leversPulled;
    if (idx < 3) {
      const pivot = this.breakerState.leverMeshes[idx];
      if (pivot) {
        pivot.rotation.x = -0.55;
      }
      this.breakerState.leversPulled++;
      this.viewModel.triggerInteractAnim();
      sound.playBreakerSwitch(this.breakerState.leversPulled);

      if (this.breakerState.leversPulled < 3) {
        this.notifyToast(
          `[BREAKER] 차단기 복구 중 (${this.breakerState.leversPulled}/3) - [E] 키를 눌러 다음 레버를 올리십시오.`,
          'warn'
        );
      } else {
        // 3/3 복구 완료!
        this.isBlackout = false;
        sound.playPowerRestore();
        this.map.setBlackoutState(false);
        this.autoBlackoutTimer = 280 + Math.random() * 80;

        if (this.breakerState.statusLed) {
          this.breakerState.statusLed.material.color.setHex(0xd8fff0);
          this.breakerState.statusLed.material.emissive.setHex(0x44ff99);
        }
        if (this.breakerState.beaconLight) {
          this.breakerState.beaconLight.color.setHex(0x44ff99);
          this.breakerState.beaconLight.intensity = 1.4;
        }

        if (this.callbacks.onBlackoutChange) {
          this.callbacks.onBlackoutChange(false);
        }
        this.notifyToast('[RESTORED] 주 전력 복구 완료. 조명, 방호문 및 CCTV 통제 시스템이 재가동되었습니다.', 'success');
      }
      this.updateObjectiveHUD();
    }
  }

  /**
   * 인벤토리 슬롯 선택 (0, 1, 2)
   */
  selectSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex > 2) return;
    if (this.selectedSlot !== slotIndex) {
      this.selectedSlot = slotIndex;
      sound.playItemEquip();
      this.syncViewModelAndHUD();
    }
  }

  getHeldItem() {
    return this.inventory[this.selectedSlot];
  }

  /**
   * 월드 아이템 줍기
   */
  pickupWorldItem(itemEntry) {
    // 현재 선택된 슬롯이 비어 있으면 거기에 우선 넣고, 아니면 빈 슬롯 탐색
    let targetSlot = this.inventory[this.selectedSlot] === null
      ? this.selectedSlot
      : this.inventory.findIndex(s => s === null);

    if (targetSlot === -1) {
      this.notifyToast('[INVENTORY FULL] 슬롯이 가득 찼습니다. [Q] 키로 소지품을 내려놓으십시오.', 'warn');
      return false;
    }

    // 월드에서 제거
    const idx = this.worldItems.indexOf(itemEntry);
    if (idx !== -1) {
      this.worldItems.splice(idx, 1);
    }
    this.group.remove(itemEntry.mesh);

    this.inventory[targetSlot] = itemEntry.type;
    this.selectedSlot = targetSlot;

    sound.playItemPickup(itemEntry.type);
    this.viewModel.triggerInteractAnim();
    this.syncViewModelAndHUD();

    const meta = ITEM_METADATA[itemEntry.type];
    this.notifyToast(`[ACQUIRED] ${meta.name} 습득 완료 // ${meta.desc}`, 'success');
    if (this.callbacks.onItemPickup) {
      this.callbacks.onItemPickup(itemEntry.id, targetSlot);
    }
    return true;
  }

  /**
   * 현재 손에 들고 있는 아이템 내려놓기 또는 조명탄(Flare) 점화 투하 ([Q] 키)
   */
  dropOrUseHeldItem(playerPos, forwardVec) {
    const heldType = this.inventory[this.selectedSlot];
    if (!heldType) return false;

    this.inventory[this.selectedSlot] = null;
    this.viewModel.triggerInteractAnim();
    this.syncViewModelAndHUD();

    const dropX = playerPos.x + forwardVec.x * 0.85;
    const dropZ = playerPos.z + forwardVec.z * 0.85;

    if (heldType === 'flare') {
      sound.playFlareIgnite();
      this.spawnIgnitedFlare(dropX, dropZ);
      this.notifyToast('[FLARE] 비상 조명탄을 점화하여 바닥에 투하했습니다. (45초간 유효)', 'info');
    } else {
      sound.playItemDrop();
      this.spawnWorldItem(heldType, dropX, 0.22, dropZ, '바닥에 내려놓음');
      const meta = ITEM_METADATA[heldType];
      this.notifyToast(`[DROPPED] ${meta.name}을(를) 바닥에 내려놓았습니다.`, 'info');
    }
    if (this.callbacks.onCoreInsert) {
      this.callbacks.onCoreInsert(heldType, this.coreState.totalInstalled);
    }
    return true;
  }

  getHeldItemType() {
    return this.inventory[this.selectedSlot] || null;
  }

  spawnIgnitedFlare(x, z) {
    const { group } = buildItemMesh3D('flare');
    group.position.set(x, 0.06, z);
    group.rotation.x = Math.PI / 2;
    group.rotation.z = Math.random() * Math.PI;

    const flareLight = new THREE.PointLight(0xff6655, 6.5, 13, 1.5);
    flareLight.position.set(0, 0.25, 0);
    group.add(flareLight);

    this.group.add(group);
    this.activeFlares.push({
      mesh: group,
      light: flareLight,
      life: 45.0
    });
  }

  /**
   * 중앙 발전기 코어에 손에 든 부품 장착
   */
  tryInstallIntoCentralCore() {
    const heldType = this.inventory[this.selectedSlot];
    const meta = heldType ? ITEM_METADATA[heldType] : null;

    if (!heldType || !meta || !meta.isCorePart) {
      const remaining = this.coreState.maxTotal - this.coreState.totalInstalled;
      if (remaining === 0) {
        this.notifyToast('[READY] 중앙 코어가 100% 가동되었습니다. 북쪽 비상 탈출 게이트로 이동하십시오.', 'success');
      } else {
        this.notifyToast(
          `[CORE REQUIREMENT] 코어 재가동에 부품 ${remaining}개가 더 필요합니다. (배터리, 키카드, 밸브 파지 후 작동)`,
          'warn'
        );
      }
      return false;
    }

    // 해당 타입의 비어 있는 소켓 찾기
    const targetSocket = this.coreState.socketMeshes.find(
      s => s.reqType === heldType && !s.filled
    );

    if (!targetSocket) {
      this.notifyToast(`[WARNING] 이미 해당 부품(${meta.name})은 모두 결합되었습니다.`, 'warn');
      return false;
    }

    // 소켓에 부품 장착!
    targetSocket.filled = true;
    targetSocket.indicator.material = this.socketFilledMat.clone();

    const { group: mountedMesh } = buildItemMesh3D(heldType);
    mountedMesh.scale.setScalar(0.85);
    targetSocket.mountAnchor.add(mountedMesh);

    if (heldType === 'energy_cell') this.coreState.energyCells++;
    else if (heldType === 'security_keycard') this.coreState.securityKeycard++;
    else if (heldType === 'coolant_valve') this.coreState.coolantValve++;

    this.coreState.totalInstalled++;
    this.inventory[this.selectedSlot] = null;

    this.viewModel.triggerInteractAnim();
    sound.playCoreInsert(this.coreState.totalInstalled, this.coreState.maxTotal);
    this.syncViewModelAndHUD();

    if (this.coreState.totalInstalled >= this.coreState.maxTotal) {
      this.unlockEscapeGate();
    } else {
      this.notifyToast(
        `[CORE ONLINE] ${meta.name} 결합 완료 (진행도: ${this.coreState.totalInstalled} / ${this.coreState.maxTotal})`,
        'success'
      );
    }
    if (this.callbacks.onCoreInsert) {
      this.callbacks.onCoreInsert(heldType, this.coreState.totalInstalled);
    }
    return true;
  }

  /**
   * 원격 동료 대원이 코어 부품 장착 시 동기화
   */
  applyRemoteCoreInsert(partType, totalInstalled) {
    const targetSocket = this.coreState.socketMeshes.find(
      s => s.reqType === partType && !s.filled
    );
    if (targetSocket) {
      targetSocket.filled = true;
      targetSocket.indicator.material = this.socketFilledMat.clone();
      const { group: mountedMesh } = buildItemMesh3D(partType);
      mountedMesh.scale.setScalar(0.85);
      targetSocket.mountAnchor.add(mountedMesh);
    }
    this.coreState.totalInstalled = totalInstalled || (this.coreState.totalInstalled + 1);
    sound.playCoreInsert(this.coreState.totalInstalled, this.coreState.maxTotal);
    this.updateHUDObjectives();
    if (this.coreState.totalInstalled >= this.coreState.maxTotal && !this.isEscapeOpen) {
      this.unlockEscapeGate();
    }
  }

  unlockEscapeGate() {
    this.isEscapeOpen = true;
    sound.playEscapeSiren();

    if (this.escapeGate) {
      this.escapeGate.statusBar.material = this.socketFilledMat.clone();
      this.escapeGate.gateLight.color.setHex(0x66ffaa);
      this.escapeGate.gateLight.intensity = 4.5;
      this.escapeGate.interiorGlow.material.color.setHex(0xd8ffee);
    }

    this.notifyToast(
      '[CRITICAL] 중앙 코어 가동 완료. 벙커 북쪽 벽의 비상 탈출 게이트가 개방되었습니다. 즉시 탈출하십시오.',
      'success'
    );
    this.updateObjectiveHUD();
  }

  /**
   * 벙커 스캔 단말기 작동: 아직 남아 있는 필수 코어 부품의 위치를 스캔하여 힌트 표시
   */
  scanForRemainingParts() {
    sound.playTerminalScan();
    this.viewModel.triggerInteractAnim();

    const remainingHints = [];
    for (const wi of this.worldItems) {
      if (ITEM_METADATA[wi.type]?.isCorePart) {
        remainingHints.push(`${ITEM_METADATA[wi.type].shortName} -> [${wi.zoneName}]`);
      }
    }
    for (const lk of this.lockers) {
      if (!lk.isOpen && lk.hiddenItemType && ITEM_METADATA[lk.hiddenItemType]?.isCorePart) {
        remainingHints.push(`${ITEM_METADATA[lk.hiddenItemType].shortName} -> [${lk.zoneName}]`);
      }
    }

    if (remainingHints.length === 0) {
      this.notifyToast('[SCAN REPORT] 모든 코어 부품이 회수되었거나 인벤토리에 있습니다.', 'success');
    } else {
      const sample = remainingHints[Math.floor(Math.random() * remainingHints.length)];
      this.notifyToast(`[SCAN DETECTED] ${sample} (미회수 잔여 부품: ${remainingHints.length}개)`, 'info');
    }
  }

  /**
   * 플레이어 주변에서 가장 가까운 상호작용 대상 탐색
   */
  findNearestInteractable(playerPos, maxDist = 2.85) {
    let best = null;
    let bestDist = maxDist;

    // 1. 월드 바닥/선반 아이템
    for (const item of this.worldItems) {
      const d = Math.hypot(playerPos.x - item.x, playerPos.z - item.z);
      if (d < Math.min(bestDist, 2.35)) {
        bestDist = d;
        const meta = ITEM_METADATA[item.type];
        best = {
          type: 'world_item',
          item,
          keyText: '[ E / PICKUP ]',
          descText: `${meta.name} 획득`
        };
      }
    }

    // 2. 전술 보관함(Locker) 문 열기
    for (const locker of this.lockers) {
      if (locker.isOpen) continue;
      const d = Math.hypot(playerPos.x - locker.x, playerPos.z - locker.z);
      if (d < bestDist) {
        bestDist = d;
        best = {
          type: 'locker',
          locker,
          keyText: '[ E / INSPECT ]',
          descText: `${locker.zoneName} 개방 및 내부 조사`
        };
      }
    }

    // 3. 전기실 주 배전반
    if (this.breakerState) {
      const d = Math.hypot(playerPos.x - this.breakerState.x, playerPos.z - this.breakerState.z);
      if (d < bestDist) {
        bestDist = d;
        best = {
          type: 'breaker',
          keyText: '[ E / OVERRIDE ]',
          descText: this.isBlackout
            ? `비상 배전반 차단기 레버 복구 (${this.breakerState.leversPulled}/3)`
            : '전기실 주 배전반 (전력 정상 가동 중)'
        };
      }
    }

    // 4. 중앙 발전기 코어
    if (this.corePos) {
      const d = Math.hypot(playerPos.x - this.corePos.x, playerPos.z - this.corePos.z);
      if (d < bestDist + 0.35) {
        bestDist = d;
        const held = this.getHeldItem();
        const heldMeta = held ? ITEM_METADATA[held] : null;
        const desc = (heldMeta && heldMeta.isCorePart)
          ? `중앙 코어에 [${heldMeta.name}] 결합 (${this.coreState.totalInstalled}/${this.coreState.maxTotal})`
          : `중앙 코어 조립 콘솔 (${this.coreState.totalInstalled}/${this.coreState.maxTotal} 결합됨)`;
        best = {
          type: 'central_core',
          keyText: '[ E / INSTALL ]',
          descText: desc
        };
      }
    }

    // 5. 벙커 부품 위치 스캔 단말기
    if (this.scannerTerminal) {
      const d = Math.hypot(playerPos.x - this.scannerTerminal.x, playerPos.z - this.scannerTerminal.z);
      if (d < bestDist) {
        bestDist = d;
        best = {
          type: 'scanner_terminal',
          keyText: '[ E / SCAN ]',
          descText: '부품 위치 추적 스캐너 가동'
        };
      }
    }

    // 6. 비상 탈출 게이트
    if (this.escapeGate) {
      const d = Math.hypot(playerPos.x - this.escapeGate.x, playerPos.z - this.escapeGate.z);
      if (d < bestDist) {
        bestDist = d;
        best = {
          type: 'escape_gate',
          keyText: '[ E / ESCAPE ]',
          descText: this.isEscapeOpen
            ? '비상 탈출 게이트 진입 (탈출 완료)'
            : `비상 탈출 게이트 잠김 (코어 부품 ${this.coreState.totalInstalled}/${this.coreState.maxTotal} 필요)`
        };
      }
    }

    return { item: best, dist: bestDist };
  }

  /**
   * 상호작용 실행 처리
   */
  executeInteract(target) {
    if (!target) return false;

    if (target.type === 'world_item') {
      return this.pickupWorldItem(target.item);
    }

    if (target.type === 'locker') {
      const lk = target.locker;
      lk.isOpen = true;
      sound.playLockerOpen();
      this.viewModel.triggerInteractAnim();

      if (lk.hiddenItemType) {
        this.spawnWorldItem(lk.hiddenItemType, lk.x, 0.96, lk.z + 0.05, lk.zoneName);
        const meta = ITEM_METADATA[lk.hiddenItemType];
        this.notifyToast(`[DISCOVERED] 보관함 내부에서 ${meta.name}을(를) 확인했습니다.`, 'success');
      } else {
        this.notifyToast('[INSPECT] 보관함을 개방했습니다. 비어 있습니다.', 'info');
      }
      return true;
    }

    if (target.type === 'breaker') {
      this.pullNextBreakerLever();
      return true;
    }

    if (target.type === 'central_core') {
      return this.tryInstallIntoCentralCore();
    }

    if (target.type === 'scanner_terminal') {
      this.scanForRemainingParts();
      return true;
    }

    if (target.type === 'escape_gate') {
      if (!this.isEscapeOpen) {
        this.notifyToast(
          `[LOCKED] 탈출 게이트가 잠겨 있습니다. 중앙 코어에 부품 4개를 먼저 결합하십시오. (${this.coreState.totalInstalled}/4)`,
          'warn'
        );
        return false;
      }
      this.isGameCleared = true;
      if (this.callbacks.onEscapeSuccess) {
        this.callbacks.onEscapeSuccess();
      }
      return true;
    }

    return false;
  }

  /**
   * 매 프레임 애니메이션 업데이트 (월드 아이템 부유/발광, 캐비닛 문 열림, 조명탄 불꽃, 자동 정전 타이머)
   */
  update(dt) {
    this.time += dt;

    // 1. 자동 정전 타이머 (완화된 간격으로 발생)
    if (!this.isBlackout && !this.isGameCleared) {
      this.autoBlackoutTimer -= dt;
      if (this.autoBlackoutTimer <= 0) {
        this.autoBlackoutTimer = 280 + Math.random() * 80;
        this.triggerBlackout('괴물이 전기실 배전 선로를 파손하여 시설 전체가 정전되었습니다.');
      }
    }

    // 2. 월드 아이템 미세 회전 및 발광 업데이트
    for (const item of this.worldItems) {
      item.mesh.rotation.y += dt * 1.1;
      item.mesh.position.y = item.baseY + Math.sin(this.time * 2.6 + item.x) * 0.035;
      if (item.updateItemAnim) {
        item.updateItemAnim(this.time);
      }
    }

    // 3. 열린 전술 보관함(Locker) 문 회전 애니메이션
    for (const lk of this.lockers) {
      if (lk.isOpen && lk.openAngle < 2.05) {
        lk.openAngle = Math.min(2.05, lk.openAngle + dt * 5.2);
        lk.doorPivot.rotation.y = -lk.openAngle;
      }
    }

    // 4. 정전 시 전기실 배전반 적색 경광등 점멸
    if (this.isBlackout && this.breakerState.beaconLight) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 10.0);
      this.breakerState.beaconLight.intensity = 0.6 + pulse * 3.2;
    }

    // 5. 탈출 게이트 셔터 수직 개방 애니메이션
    if (this.escapeGate && this.isEscapeOpen && this.escapeGate.openRatio < 1.0) {
      this.escapeGate.openRatio = Math.min(1.0, this.escapeGate.openRatio + dt * 0.85);
      const r = this.escapeGate.openRatio;
      this.escapeGate.shutter.position.y = 1.25 + r * 2.15;
      this.escapeGate.shutter.scale.y = Math.max(0.1, 1.0 - r * 0.85);
    }

    // 6. 바닥에 투하된 조명탄(Flare) 스파크 및 수명 업데이트
    for (let i = this.activeFlares.length - 1; i >= 0; i--) {
      const f = this.activeFlares[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        this.activeFlares.splice(i, 1);
      } else {
        const fade = Math.min(1.0, f.life / 5.0);
        f.light.intensity = (5.5 + Math.sin(this.time * 24.0) * 1.2) * fade;
      }
    }
  }

  /**
   * 1인칭 손 뷰모델 및 화면 하단 인벤토리/목표 HUD 동기화
   */
  syncViewModelAndHUD() {
    const heldType = this.inventory[this.selectedSlot];
    if (this.viewModel) {
      this.viewModel.setHeldItem(heldType);
    }

    for (let i = 0; i < 3; i++) {
      const slotEl = document.getElementById(`inv-slot-${i}`);
      if (!slotEl) continue;
      const itemType = this.inventory[i];
      slotEl.classList.toggle('active', i === this.selectedSlot);
      slotEl.classList.toggle('filled', Boolean(itemType));

      const nameEl = slotEl.querySelector('.slot-name');
      if (itemType && ITEM_METADATA[itemType]) {
        const meta = ITEM_METADATA[itemType];
        if (nameEl) nameEl.textContent = meta.shortName;
      } else {
        if (nameEl) nameEl.textContent = 'EMPTY';
      }
    }

    const dropBtn = document.getElementById('btn-touch-drop');
    if (dropBtn) {
      dropBtn.style.display = heldType ? 'flex' : 'none';
      const labelEl = dropBtn.querySelector('.btn-label');
      if (labelEl) {
        labelEl.textContent = heldType === 'flare' ? 'IGNITE [Q]' : 'DROP [Q]';
      }
    }

    this.updateObjectiveHUD();
  }

  updateObjectiveHUD() {
    const coreProgressEl = document.getElementById('obj-core-progress');
    const powerStatusEl = document.getElementById('obj-power-status');
    const escapeStatusEl = document.getElementById('obj-escape-status');

    if (coreProgressEl) {
      coreProgressEl.textContent = `[CORE] 중앙 코어 부품: ${this.coreState.totalInstalled} / ${this.coreState.maxTotal} (셀 ${this.coreState.energyCells}/2 · 키카드 ${this.coreState.securityKeycard}/1 · 밸브 ${this.coreState.coolantValve}/1)`;
    }

    if (powerStatusEl) {
      if (this.isBlackout) {
        powerStatusEl.textContent = `[PWR: FAILURE] 비상 전력 차단: 전기실 배전반 레버 복구 필요 (${this.breakerState.leversPulled}/3)`;
        powerStatusEl.classList.add('danger');
      } else {
        powerStatusEl.textContent = '[PWR: ONLINE] 주 전력망: 정상 가동 중 (방호문/CCTV 통제 활성)';
        powerStatusEl.classList.remove('danger');
      }
    }

    if (escapeStatusEl) {
      if (this.isEscapeOpen) {
        escapeStatusEl.textContent = '[GATE: UNLOCKED] 비상 탈출 게이트: 개방됨 (벙커 북쪽 벽)';
        escapeStatusEl.classList.add('ready');
      } else {
        escapeStatusEl.textContent = '[GATE: LOCKED] 비상 탈출 게이트: 잠김 (코어 복구율 100% 필요)';
        escapeStatusEl.classList.remove('ready');
      }
    }
  }

  notifyToast(msg, level = 'info') {
    let handled = false;
    if (this.callbacks && typeof this.callbacks.onToast === 'function') {
      try {
        this.callbacks.onToast(msg, level);
        handled = true;
      } catch (err) {
        console.warn('Toast callback failed:', err);
      }
    }
    if (!handled) {
      try {
        const toast = document.getElementById('game-toast');
        if (toast) {
          toast.textContent = msg;
          toast.className = '';
          if (level === 'danger') toast.classList.add('toast-danger');
          else if (level === 'warn') toast.classList.add('toast-warn');
          else if (level === 'success') toast.classList.add('toast-success');
          setTimeout(() => toast.classList.add('hidden'), 4000);
        }
      } catch (_) {}
    }
  }
}

