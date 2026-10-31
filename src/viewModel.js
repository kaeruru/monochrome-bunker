import * as THREE from 'three';

/**
 * 월드 배치용 & 1인칭 손 파지용 공용 고디테일 3D 아이템 메쉬 생성기
 * @param {'energy_cell'|'security_keycard'|'coolant_valve'|'flare'} itemType
 * @returns {{ group: THREE.Group, updateItemAnim: (t: number) => void }}
 */
export function buildItemMesh3D(itemType) {
  const group = new THREE.Group();

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x24282c,
    roughness: 0.42,
    metalness: 0.82
  });
  const brushedMetalMat = new THREE.MeshStandardMaterial({
    color: 0x687078,
    roughness: 0.35,
    metalness: 0.88
  });
  const gripRubberMat = new THREE.MeshStandardMaterial({
    color: 0x151719,
    roughness: 0.82,
    metalness: 0.15
  });

  let updateItemAnim = () => {};

  if (itemType === 'energy_cell') {
    // 1. 고출력 플라즈마 에너지 셀 (원통형 중장비 배터리 + 발광 코어 + 상단 손잡이)
    const capGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.045, 8);
    const bottomCap = new THREE.Mesh(capGeo, darkSteelMat);
    bottomCap.position.y = -0.14;
    group.add(bottomCap);

    const topCap = new THREE.Mesh(capGeo, darkSteelMat);
    topCap.position.y = 0.14;
    group.add(topCap);

    // 내부 발광 플라즈마 코어 실린더
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xe0f7ff,
      emissive: 0x88dcff,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.1
    });
    const coreMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.072, 0.24, 16),
      coreMat
    );
    group.add(coreMesh);

    // 내부 나선 코일 링 3개
    const ringGeo = new THREE.TorusGeometry(0.076, 0.008, 8, 16);
    for (const ry of [-0.06, 0, 0.06]) {
      const ring = new THREE.Mesh(ringGeo, brushedMetalMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      group.add(ring);
    }

    // 외곽 보호 프레임 기둥 4개
    const strutGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.26, 8);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const strut = new THREE.Mesh(strutGeo, brushedMetalMat);
      strut.position.set(Math.cos(a) * 0.095, 0, Math.sin(a) * 0.095);
      group.add(strut);
    }

    // 상단 D형 운반 손잡이
    const handleBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.018, 0.022),
      gripRubberMat
    );
    handleBar.position.set(0, 0.205, 0);
    group.add(handleBar);

    for (const sx of [-0.055, 0.055]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8),
        brushedMetalMat
      );
      post.position.set(sx, 0.18, 0);
      group.add(post);
    }

    updateItemAnim = (t) => {
      coreMat.emissiveIntensity = 1.35 + Math.sin(t * 5.2) * 0.45;
    };
  } else if (itemType === 'security_keycard') {
    // 2. 보안 암호 디크립터 키카드 (전술 단말기형 카드 + 디지털 해독 디스플레이 + 안테나)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.23, 0.024),
      darkSteelMat
    );
    group.add(body);

    // 상단 금색/은색 마그네틱 IC 접촉 단자부
    const connector = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.035, 0.028),
      brushedMetalMat
    );
    connector.position.set(0, 0.105, 0);
    group.add(connector);

    // 우측 소형 수신 안테나
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.007, 0.09, 8),
      brushedMetalMat
    );
    ant.position.set(0.068, 0.14, 0);
    group.add(ant);

    // 전면 해독 OLED 스크린
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0xb8ffda,
      emissive: 0x44ee88,
      emissiveIntensity: 1.25,
      roughness: 0.25
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.125, 0.11),
      screenMat
    );
    screen.position.set(0, 0.015, 0.013);
    group.add(screen);

    // 스캔 라인 바 (위아래로 움직이는 애니메이션 요소)
    const scanLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.115, 0.012),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scanLine.position.set(0, 0.015, 0.014);
    group.add(scanLine);

    // 하단 키패드 버튼 6개
    const keyGeo = new THREE.BoxGeometry(0.028, 0.018, 0.008);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const keyMesh = new THREE.Mesh(keyGeo, brushedMetalMat);
        keyMesh.position.set((c - 1) * 0.038, -0.065 - r * 0.026, 0.014);
        group.add(keyMesh);
      }
    }

    updateItemAnim = (t) => {
      scanLine.position.y = 0.015 + Math.sin(t * 4.5) * 0.042;
      screenMat.emissiveIntensity = 1.05 + Math.sin(t * 8.0) * 0.25;
    };
  } else if (itemType === 'coolant_valve') {
    // 3. 초저온 냉각 밸브 휠 (중공업 주철 4스포크 핸드휠 + 중앙 육각 스핀들 너트)
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x483232,
      roughness: 0.52,
      metalness: 0.72
    });

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.135, 0.022, 12, 28),
      wheelMat
    );
    group.add(rim);

    // 십자 스포크 2개 (4방향)
    for (let i = 0; i < 2; i++) {
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.013, 0.26, 8),
        brushedMetalMat
      );
      spoke.rotation.z = (i * Math.PI) / 2;
      group.add(spoke);
    }

    // 중앙 육각 결합 허브
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.065, 6),
      darkSteelMat
    );
    hub.rotation.x = Math.PI / 2;
    group.add(hub);

    // 전면 손잡이 노브
    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.012, 0.055, 10),
      gripRubberMat
    );
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0.115, 0.06, 0.032);
    group.add(knob);

    // 중앙 압력 코어 표시 링
    const indicatorMat = new THREE.MeshStandardMaterial({
      color: 0xd8ecff,
      emissive: 0x77bbff,
      emissiveIntensity: 0.9
    });
    const centerDot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.07, 12),
      indicatorMat
    );
    centerDot.rotation.x = Math.PI / 2;
    group.add(centerDot);

    updateItemAnim = (t) => {
      indicatorMat.emissiveIntensity = 0.75 + Math.sin(t * 3.8) * 0.25;
    };
  } else if (itemType === 'flare') {
    // 4. 비상 전술 조명탄 (원통 스틱 + 발화부 캡)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x582424,
      roughness: 0.58,
      metalness: 0.35
    });
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.25, 12),
      bodyMat
    );
    group.add(stick);

    // 하단 그립 링
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.031, 0.031, 0.09, 12),
      gripRubberMat
    );
    grip.position.y = -0.07;
    group.add(grip);

    // 상단 발화 팁
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xffd0c8,
      emissive: 0xff5544,
      emissiveIntensity: 1.5,
      roughness: 0.3
    });
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.029, 0.035, 12),
      tipMat
    );
    tip.position.y = 0.135;
    group.add(tip);

    updateItemAnim = (t) => {
      tipMat.emissiveIntensity = 1.2 + Math.sin(t * 14.0) * 0.45;
    };
  }

  return { group, updateItemAnim };
}

/**
 * 1인칭 뷰모델 시스템 (FirstPersonViewModel)
 * - 플레이어 카메라 하위에 부착되어 좌측 손(전술 손전등 + 손목 단말기)과
 *   우측 손(현재 선택된 파밍 아이템: 에너지 셀, 보안 키카드, 냉각 밸브, 조명탄)을
 *   자연스러운 호흡/보행/시선 흔들림(Sway)/장착 및 상호작용 애니메이션과 함께 렌더링합니다.
 */
export class FirstPersonViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.camera.add(this.root);

    this.time = 0;
    this.chapterId = 'chapter1';
    this.currentItemType = null;
    this.currentItemUpdater = null;

    // 애니메이션 상태값
    this.equipProgress = 1.0;    // 0 -> 1 (아이템 들기 모션)
    this.actionTimer = 0;        // > 0 이면 앞으로 손을 뻗어 조작하는 모션
    this.flashlightClickTimer = 0;
    this.sonarInspectRatio = 1.0; // 1.0 = 정지 시 화면을 들어 레이더 확인, 0.0 = 이동 시 상단 발광면을 전방으로 기울임
    this.radarSweepAngle = 0;
    this.radarRedrawAccum = 0;

    // 시선 회전 관성(Sway) 계산용 이전 카메라 각도
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.swayX = 0;
    this.swayY = 0;

    this.initMaterials();
    this.buildLeftArmFlashlight();
    this.buildRightArmItemHolder();
  }

  initMaterials() {
    this.sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x222629,
      roughness: 0.78,
      metalness: 0.15
    });
    this.gloveMat = new THREE.MeshStandardMaterial({
      color: 0x141618,
      roughness: 0.65,
      metalness: 0.25
    });
    this.armorPlateMat = new THREE.MeshStandardMaterial({
      color: 0x3a4046,
      roughness: 0.42,
      metalness: 0.78
    });
    this.pdaScreenMat = new THREE.MeshStandardMaterial({
      color: 0xb8f4d8,
      emissive: 0x38b878,
      emissiveIntensity: 0.85,
      roughness: 0.25
    });
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0xf4faff });
  }

  buildLeftArmFlashlight() {
    this.leftArmGroup = new THREE.Group();
    // 화면 좌하단 배치
    this.leftArmGroup.position.set(-0.26, -0.23, -0.42);
    this.root.add(this.leftArmGroup);

    // 1. 전술 전투복 전완근 소매
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.052, 0.28, 12),
      this.sleeveMat
    );
    forearm.rotation.x = Math.PI / 2.2;
    forearm.rotation.z = -0.22;
    forearm.position.set(-0.04, -0.06, 0.11);
    this.leftArmGroup.add(forearm);

    // 2. 왼손 손목 전술 단말기(PDA)
    const pdaBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.022, 0.085),
      this.armorPlateMat
    );
    pdaBody.position.set(-0.018, -0.015, 0.04);
    pdaBody.rotation.z = -0.35;
    pdaBody.rotation.x = 0.2;
    this.leftArmGroup.add(pdaBody);

    const pdaScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.068),
      this.pdaScreenMat
    );
    pdaScreen.rotation.x = -Math.PI / 2;
    pdaScreen.position.set(0, 0.012, 0);
    pdaBody.add(pdaScreen);

    // 3. 왼손 장갑 & 손등 보호대
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.048, 0.085),
      this.gloveMat
    );
    hand.position.set(0.01, 0.005, -0.04);
    this.leftArmGroup.add(hand);

    const knuckleGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.015, 0.055),
      this.armorPlateMat
    );
    knuckleGuard.position.set(0.01, 0.03, -0.04);
    this.leftArmGroup.add(knuckleGuard);

    // 4. 전술 손전등 본체 (챕터 1 / 챕터 3 전용)
    this.torchGroup = new THREE.Group();
    this.torchGroup.position.set(0.025, 0.022, -0.08);
    this.leftArmGroup.add(this.torchGroup);

    const torchBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.02, 0.18, 12),
      this.armorPlateMat
    );
    torchBody.rotation.x = Math.PI / 2;
    this.torchGroup.add(torchBody);

    const torchHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.024, 0.055, 14),
      this.armorPlateMat
    );
    torchHead.rotation.x = Math.PI / 2;
    torchHead.position.z = -0.1;
    this.torchGroup.add(torchHead);

    this.torchLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.028, 14),
      this.lensMat
    );
    this.torchLens.rotation.y = Math.PI;
    this.torchLens.position.z = -0.129;
    this.torchGroup.add(this.torchLens);

    // 5. 챕터 2 전용: 직육면체 수중 음파 레이더 감지기 + 상단 발광 작업등 (Cuboid Sonar Tracker & Top Worklight)
    this.sonarDeviceGroup = new THREE.Group();
    this.sonarDeviceGroup.position.set(0.032, 0.042, -0.075);
    this.sonarDeviceGroup.visible = false;
    this.leftArmGroup.add(this.sonarDeviceGroup);

    // 직육면체 본체 하우징
    const sonarBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.092, 0.142, 0.044),
      this.armorPlateMat
    );
    this.sonarDeviceGroup.add(sonarBody);

    // 상/하단 충격 흡수 고무 범퍼
    for (const by of [-0.066, 0.066]) {
      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(0.098, 0.018, 0.048),
        this.gloveMat
      );
      bumper.position.y = by;
      this.sonarDeviceGroup.add(bumper);
    }

    // 기기 윗면(+Y) 발광 디퓨저 작업등 바 (이동 시 기기를 앞으로 기울여 약한 손전등 역할 수행)
    const topHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.084, 0.014, 0.038),
      this.armorPlateMat
    );
    topHousing.position.set(0, 0.078, 0);
    this.sonarDeviceGroup.add(topHousing);

    this.sonarTopLightMat = new THREE.MeshBasicMaterial({ color: 0xffe4b0 });
    const topDiffuserBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.076, 0.010, 0.030),
      this.sonarTopLightMat
    );
    topDiffuserBar.position.set(0, 0.083, 0);
    this.sonarDeviceGroup.add(topDiffuserBar);

    // 우측 상단 음파 수신 안테나
    const sonarAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.007, 0.055, 8),
      this.armorPlateMat
    );
    sonarAntenna.position.set(0.036, 0.095, -0.01);
    this.sonarDeviceGroup.add(sonarAntenna);

    // 전면(+Z, 정지 시 플레이어를 향하는 면) 실시간 음파 레이더 디스플레이 캔버스
    this.radarCanvas = document.createElement('canvas');
    this.radarCanvas.width = 128;
    this.radarCanvas.height = 128;
    this.radarCtx = this.radarCanvas.getContext('2d');
    this.radarTex = new THREE.CanvasTexture(this.radarCanvas);
    this.radarScreenMat = new THREE.MeshBasicMaterial({ map: this.radarTex });

    const radarScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.076, 0.086),
      this.radarScreenMat
    );
    radarScreenMesh.position.set(0, 0.012, 0.0235);
    this.sonarDeviceGroup.add(radarScreenMesh);

    // 전면 하단 조작 버튼 3개
    for (let bi = -1; bi <= 1; bi++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.012, 0.006),
        bi === 0 ? this.pdaScreenMat : this.gloveMat
      );
      btn.position.set(bi * 0.024, -0.046, 0.023);
      this.sonarDeviceGroup.add(btn);
    }

    this.updateSonarRadar(0.1, 99, 0, false);
  }

  buildRightArmItemHolder() {
    this.rightArmGroup = new THREE.Group();
    // 화면 우하단 배치 (아이템 파지 손)
    this.rightArmGroup.position.set(0.27, -0.24, -0.44);
    this.root.add(this.rightArmGroup);

    // 1. 오른팔 전완근 소매
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.054, 0.3, 12),
      this.sleeveMat
    );
    forearm.rotation.x = Math.PI / 2.25;
    forearm.rotation.z = 0.25;
    forearm.position.set(0.055, -0.075, 0.13);
    this.rightArmGroup.add(forearm);

    // 2. 오른손 전술 글러브 + 손가락 디테일
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.052, 0.09),
      this.gloveMat
    );
    palm.position.set(0, -0.01, -0.02);
    palm.rotation.z = 0.22;
    this.rightArmGroup.add(palm);

    const armorBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.016, 0.06),
      this.armorPlateMat
    );
    armorBack.position.set(0.008, 0.022, -0.02);
    armorBack.rotation.z = 0.22;
    this.rightArmGroup.add(armorBack);

    // 엄지 및 파지 손가락 마디
    const thumb = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.024, 0.055),
      this.gloveMat
    );
    thumb.position.set(-0.036, 0.015, -0.045);
    thumb.rotation.y = -0.35;
    this.rightArmGroup.add(thumb);

    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.022, 0.058),
        this.gloveMat
      );
      finger.position.set(-0.022 + i * 0.016, -0.012, -0.072);
      finger.rotation.x = 0.35;
      this.rightArmGroup.add(finger);
    }

    // 3. 들고 있는 3D 아이템이 장착되는 앵커 및 사전 생성(Pool)
    this.heldItemAnchor = new THREE.Group();
    this.heldItemAnchor.position.set(-0.015, 0.075, -0.065);
    this.rightArmGroup.add(this.heldItemAnchor);

    // 아이템 습득 시 WebGL 셰이더 실시간 컴파일 멈춤(렉)을 방지하기 위해 4종류 아이템을 시작 시 사전 생성
    this.itemPool = {};
    const itemTypes = ['energy_cell', 'security_keycard', 'coolant_valve', 'flare'];
    for (const type of itemTypes) {
      const { group, updateItemAnim } = buildItemMesh3D(type);
      if (type === 'energy_cell') {
        group.scale.setScalar(0.68);
        group.rotation.set(0.18, -0.45, 0.08);
        group.position.set(0, 0.02, 0);
      } else if (type === 'security_keycard') {
        group.scale.setScalar(0.76);
        group.rotation.set(-0.28, -0.38, 0.12);
        group.position.set(0, 0.015, 0.01);
      } else if (type === 'coolant_valve') {
        group.scale.setScalar(0.72);
        group.rotation.set(0.22, -0.52, 0.15);
        group.position.set(-0.01, 0.025, 0);
      } else if (type === 'flare') {
        group.scale.setScalar(0.78);
        group.rotation.set(0.28, -0.2, 0.12);
        group.position.set(0, 0.03, 0);
      }
      group.visible = false;
      this.heldItemAnchor.add(group);
      this.itemPool[type] = { group, updateItemAnim };
    }
  }

  /**
   * 챕터별 좌측 손 장비 전환:
   * - 챕터 2: 손전등 비활성화 -> 직육면체 음파 레이더 감지기 + 상단 발광 작업등 장착
   * - 챕터 1 / 3: 기존 전술 손전등 장착
   */
  setChapterMode(chapterId) {
    this.chapterId = chapterId || 'chapter1';
    const isCh2 = this.chapterId === 'chapter2';
    if (this.torchGroup) this.torchGroup.visible = !isCh2;
    if (this.sonarDeviceGroup) this.sonarDeviceGroup.visible = isCh2;
    this.sonarInspectRatio = 1.0;
  }

  /**
   * 챕터 2 직육면체 감지기 전면 레이더 디스플레이 캔버스 갱신 (갤럭시 탭 S9 FE 최적화: 15FPS 스로틀링)
   * @param {number} dt
   * @param {number} distToMonster
   * @param {number} relAngle 플레이어 시선 기준 괴물의 상대 방위각 (라디안, 0 = 정면)
   * @param {boolean} monsterActive
   */
  updateSonarRadar(dt, distToMonster = 99, relAngle = 0, monsterActive = false, extraBlips = null) {
    if (!this.radarCtx) return;
    this.radarSweepAngle = (this.radarSweepAngle + dt * 3.8) % (Math.PI * 2);
    this.radarRedrawAccum += dt;
    if (this.radarRedrawAccum < 0.065) return;
    this.radarRedrawAccum = 0;

    const ctx = this.radarCtx;
    const w = 128;
    const h = 128;
    const cx = 64;
    const cy = 56;
    const maxR = 46;

    // 1. 어두운 앰버 CRT 배경
    ctx.fillStyle = '#0c0703';
    ctx.fillRect(0, 0, w, h);

    // 2. 동심원 거리 링 (8m, 16m, 24m) & 십자선
    ctx.strokeStyle = 'rgba(255, 148, 42, 0.36)';
    ctx.lineWidth = 1.2;
    for (const rFrac of [0.35, 0.68, 1.0]) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * rFrac, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 148, 42, 0.22)';
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    // 3. 회전하는 레이더 스윕 라인
    const sx = cx + Math.sin(this.radarSweepAngle) * maxR;
    const sy = cy - Math.cos(this.radarSweepAngle) * maxR;
    ctx.strokeStyle = 'rgba(255, 182, 72, 0.78)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    // 4. 플레이어 중심점 마커
    ctx.fillStyle = '#ffd280';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 5. 크롤러 삼두 괴수 음파 타겟 블립 표시 (28m 이내 감지)
    const blips = Array.isArray(extraBlips) && extraBlips.length > 0
      ? extraBlips
      : (monsterActive ? [{ dist: distToMonster, relAngle, role: 'ripper' }] : []);

    let closestDist = distToMonster;
    for (const b of blips) {
      if (b.dist >= 28) continue;
      if (b.dist < closestDist) closestDist = b.dist;
      const clampedR = Math.min(maxR - 3, (b.dist / 26) * maxR);
      const bx = cx + Math.sin(b.relAngle) * clampedR;
      const by = cy - Math.cos(b.relAngle) * clampedR;

      const pulse = 0.5 + 0.5 * Math.sin(this.time * (b.dist < 10 ? 16 : 9));
      const isRipper = b.role === 'ripper' || b.role === 'stalker';
      const isSnare = b.role === 'snare';

      ctx.fillStyle = isRipper
        ? (b.dist < 10 ? '#ff3b1f' : '#ff9a2e')
        : (isSnare ? '#ff4488' : '#ffcc33');
      ctx.beginPath();
      ctx.arc(bx, by, (isRipper ? 3.8 : 3.0) + pulse * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isRipper
        ? 'rgba(255, 68, 34, 0.85)'
        : (isSnare ? 'rgba(255, 68, 136, 0.75)' : 'rgba(255, 204, 51, 0.75)');
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(bx, by, (isRipper ? 6.5 : 5.2) + pulse * 3.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    const isDanger = monsterActive && closestDist < 28;

    // 6. 하단 디지털 상태창 (거리 및 경고 표시)
    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(6, 106, 116, 18);
    ctx.strokeStyle = 'rgba(255, 148, 42, 0.48)';
    ctx.strokeRect(6, 106, 116, 18);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    if (isDanger) {
      ctx.fillStyle = closestDist < 10 ? '#ff4422' : '#ffb84d';
      ctx.fillText(`DIST: ${closestDist.toFixed(1)}m`, 64, 119);
    } else {
      ctx.fillStyle = '#c88232';
      ctx.fillText('SONAR: CLEAR', 64, 119);
    }

    this.radarTex.needsUpdate = true;
  }

  /**
   * 우측 손에 들고 있을 아이템을 교체하고 장착 애니메이션을 재생합니다.
   * - 이미 사전 생성된 메쉬의 visible만 토글하므로 런타임 멈춤이 전혀 발생하지 않습니다.
   * @param {string|null} itemType
   */
  setHeldItem(itemType) {
    if (this.currentItemType === itemType) return;
    this.currentItemType = itemType;
    this.equipProgress = 0.0;

    for (const [type, data] of Object.entries(this.itemPool)) {
      data.group.visible = (type === itemType);
    }
    this.currentItemUpdater = itemType && this.itemPool[itemType] ? this.itemPool[itemType].updateItemAnim : null;
  }

  /**
   * 상호작용(E키) 시 오른손을 앞으로 뻗는 액션 모션 트리거
   */
  triggerInteractAnim() {
    this.actionTimer = 0.36;
  }

  /**
   * 손전등 토글(F키) 시 왼손 클릭 반동 모션 트리거
   */
  triggerFlashlightAnim(isOn) {
    this.flashlightClickTimer = 0.22;
    if (this.torchLens) {
      this.torchLens.material.color.setHex(isOn ? 0xf4faff : 0x22262a);
    }
  }

  /**
   * 매 프레임 1인칭 손 & 아이템 애니메이션 업데이트
   */
  update(dt, { isMoving, isSprinting, walkCycle, yaw, pitch }) {
    this.time += dt;

    // 1. 시선 회전 관성(Mouse/Touch Look Sway)
    const dYaw = yaw - this.lastYaw;
    const dPitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;

    this.swayX = THREE.MathUtils.lerp(this.swayX, THREE.MathUtils.clamp(-dYaw * 0.45, -0.045, 0.045), Math.min(1, dt * 10));
    this.swayY = THREE.MathUtils.lerp(this.swayY, THREE.MathUtils.clamp(dPitch * 0.45, -0.045, 0.045), Math.min(1, dt * 10));

    // 2. 호흡(Idle Breathing) + 보행/질주 흔들림(Walk/Sprint Bobbing)
    const breathY = Math.sin(this.time * 2.2) * 0.0045;
    const breathX = Math.cos(this.time * 1.1) * 0.0025;

    let bobX = 0;
    let bobY = 0;
    let sprintTilt = 0;
    let sprintDropY = 0;
    let sprintArmPump = 0;

    if (isMoving) {
      const ampX = isSprinting ? 0.032 : 0.011;
      const ampY = isSprinting ? 0.034 : 0.012;
      bobX = Math.cos(walkCycle * 0.5) * ampX;
      bobY = Math.abs(Math.sin(walkCycle)) * ampY;
      if (isSprinting) {
        sprintTilt = 0.28; // 전력 질주 시 상체 전방 숙임
        sprintDropY = -0.055; // 손을 살짝 내려 시야 확보 및 로우-레디
        sprintArmPump = Math.sin(walkCycle * 0.5) * 0.045; // 보폭에 맞춘 격렬한 팔 펌핑
      }
    }

    // 3. 왼손(손전등 or 챕터 2 직육면체 감지기) 위치/각도 애니메이션
    let torchClickOffset = 0;
    if (this.flashlightClickTimer > 0) {
      this.flashlightClickTimer = Math.max(0, this.flashlightClickTimer - dt);
      torchClickOffset = Math.sin((this.flashlightClickTimer / 0.22) * Math.PI) * 0.028;
    }

    const isCh2 = this.chapterId === 'chapter2';
    // 챕터 2: 멈추면(isMoving=false) 기기를 세워 들어(sonarInspectRatio -> 1) 레이더 화면을 보여주고,
    // 움직이면(isMoving=true) 기기를 앞으로 눕혀(sonarInspectRatio -> 0) 기기 윗면 발광부가 전방을 비추게 함!
    const targetInspect = (isCh2 && !isMoving) ? 1.0 : 0.0;
    this.sonarInspectRatio = THREE.MathUtils.lerp(
      this.sonarInspectRatio,
      targetInspect,
      Math.min(1, dt * 7.5)
    );

    const inspectRaiseX = isCh2 ? this.sonarInspectRatio * 0.095 : 0;
    const inspectRaiseY = isCh2 ? this.sonarInspectRatio * 0.078 : 0;
    const inspectPullZ = isCh2 ? this.sonarInspectRatio * 0.055 : 0;

    this.leftArmGroup.position.set(
      -0.26 + inspectRaiseX + breathX + bobX * 0.9 + this.swayX,
      -0.23 + inspectRaiseY + sprintDropY + breathY - bobY * 1.1 + this.swayY - torchClickOffset * 0.5,
      -0.42 + inspectPullZ + torchClickOffset + sprintArmPump
    );
    this.leftArmGroup.rotation.set(
      -sprintTilt * 0.6 + this.swayY * 1.4,
      this.swayX * 1.5,
      bobX * 1.5 - (isSprinting ? 0.12 : 0)
    );

    if (isCh2 && this.sonarDeviceGroup) {
      // 이동 시(ratio=0): 상단 LED 작업등(+Y)이 전방(-Z)을 향하도록 -1.18 rad 기울임
      // 정지 시(ratio=1): 전면 레이더 스크린(+Z)이 플레이어 시선을 정면으로 향하도록 -0.12 rad 세움
      const devicePitch = THREE.MathUtils.lerp(-1.18, -0.12, this.sonarInspectRatio);
      const deviceYaw = THREE.MathUtils.lerp(0.08, 0.26, this.sonarInspectRatio);
      const deviceRoll = THREE.MathUtils.lerp(0.0, -0.08, this.sonarInspectRatio);
      this.sonarDeviceGroup.rotation.set(devicePitch, deviceYaw, deviceRoll);
    }

    // 4. 오른손(아이템 파지 손) 장착 & 액션 & 아이들 모션
    if (this.equipProgress < 1.0) {
      this.equipProgress = Math.min(1.0, this.equipProgress + dt * 3.8);
    }
    const easeEquip = 1 - Math.pow(1 - this.equipProgress, 3);

    // 아이템이 없으면 오른손을 살짝 아래로 내려 시야를 넓히고, 아이템이 있으면 화면 우하단으로 들어 올림
    const hasItem = Boolean(this.currentItemType);
    const baseRightY = hasItem ? -0.21 : -0.31;
    const equipDropY = (1 - easeEquip) * -0.18;
    const equipRollZ = (1 - easeEquip) * 0.45;

    let actionReachZ = 0;
    let actionReachY = 0;
    let actionPitchX = 0;
    if (this.actionTimer > 0) {
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      const wave = Math.sin((this.actionTimer / 0.36) * Math.PI);
      actionReachZ = -wave * 0.11;
      actionReachY = wave * 0.045;
      actionPitchX = -wave * 0.28;
    }

    this.rightArmGroup.position.set(
      0.26 - breathX + bobX + this.swayX,
      baseRightY + sprintDropY + breathY - bobY * 1.1 + this.swayY + equipDropY + actionReachY,
      -0.43 + actionReachZ - sprintArmPump
    );
    this.rightArmGroup.rotation.set(
      actionPitchX - sprintTilt * 0.75 + Math.sin(this.time * 1.8) * 0.025,
      this.swayX * 1.6,
      equipRollZ - bobX * 1.6 + (isSprinting ? 0.14 : 0)
    );

    // 들고 있는 아이템 자체의 발광/스캔 애니메이션 업데이트
    if (this.currentItemUpdater) {
      this.currentItemUpdater(this.time);
    }
  }
}

