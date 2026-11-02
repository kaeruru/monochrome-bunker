import * as THREE from 'three';
import { SUIT_COLORS, getTintedSoldierTexture } from './models.js';

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
    // 1. 고출력 플라즈마 에너지 셀
    const capGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.045, 8);
    const bottomCap = new THREE.Mesh(capGeo, darkSteelMat);
    bottomCap.position.y = -0.14;
    group.add(bottomCap);

    const topCap = new THREE.Mesh(capGeo, darkSteelMat);
    topCap.position.y = 0.14;
    group.add(topCap);

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

    const ringGeo = new THREE.TorusGeometry(0.076, 0.008, 8, 16);
    for (const ry of [-0.06, 0, 0.06]) {
      const ring = new THREE.Mesh(ringGeo, brushedMetalMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      group.add(ring);
    }

    const strutGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.26, 8);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const strut = new THREE.Mesh(strutGeo, brushedMetalMat);
      strut.position.set(Math.cos(a) * 0.095, 0, Math.sin(a) * 0.095);
      group.add(strut);
    }

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
    // 2. 보안 암호 디크립터 키카드
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.23, 0.024),
      darkSteelMat
    );
    group.add(body);

    const connector = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.035, 0.028),
      brushedMetalMat
    );
    connector.position.set(0, 0.105, 0);
    group.add(connector);

    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.007, 0.09, 8),
      brushedMetalMat
    );
    ant.position.set(0.068, 0.14, 0);
    group.add(ant);

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

    const scanLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.115, 0.012),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scanLine.position.set(0, 0.015, 0.014);
    group.add(scanLine);

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
    };
  } else if (itemType === 'coolant_valve') {
    // 3. 냉각수 수동 압력 밸브
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12),
      darkSteelMat
    );
    group.add(hub);

    const hexNut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.035, 6),
      brushedMetalMat
    );
    hexNut.position.y = 0.07;
    group.add(hexNut);

    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.022, 10, 24),
      brushedMetalMat
    );
    wheelRim.rotation.x = Math.PI / 2;
    wheelRim.position.y = 0.025;
    group.add(wheelRim);

    const spokeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.15, 8);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const spoke = new THREE.Mesh(spokeGeo, darkSteelMat);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = a;
      spoke.position.set(Math.cos(a) * 0.075, 0.025, Math.sin(a) * 0.075);
      group.add(spoke);
    }

    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x992222,
      roughness: 0.6,
      metalness: 0.2
    });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const notch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 0.036, 10),
        gripMat
      );
      notch.rotation.x = Math.PI / 2;
      notch.position.set(Math.cos(a) * 0.155, 0.025, Math.sin(a) * 0.155);
      group.add(notch);
    }

    updateItemAnim = (t) => {
      wheelRim.rotation.z = t * 1.2;
    };
  } else if (itemType === 'flare') {
    // 4. 전술 비상 조명탄
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.26, 12),
      new THREE.MeshStandardMaterial({
        color: 0xcc3322,
        roughness: 0.5,
        metalness: 0.2
      })
    );
    group.add(tube);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.045, 12),
      gripRubberMat
    );
    cap.position.y = -0.12;
    group.add(cap);

    const igniter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.035, 10),
      brushedMetalMat
    );
    igniter.position.y = 0.135;
    group.add(igniter);

    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 8, 8),
      sparkMat
    );
    tip.position.y = 0.155;
    group.add(tip);

    updateItemAnim = (t) => {
      sparkMat.color.setHex((Math.sin(t * 18) > 0) ? 0xffffff : 0xffaa44);
    };
  }

  return { group, updateItemAnim };
}

/**
 * 인체공학적 마디 관절을 갖춘 고품질 전술 장갑(Operator Combat Glove) & 소매 조립기
 * @param {boolean} isLeft 좌측 손 여부
 * @param {THREE.Material} sleeveMat 전투복 패브릭 머티리얼 (팀 컬러 반영)
 * @param {THREE.Material} gloveMat 전술 장갑 가죽 머티리얼
 * @param {THREE.Material} armorMat 탄소섬유 너클 보호대 머티리얼
 */
function createTacticalArmAndHand(isLeft, sleeveMat, gloveMat, armorMat) {
  const armRoot = new THREE.Group();

  // 1. 전술 전투복 전완근 소매 (부드러운 테이퍼 원단)
  const sleeveGeo = new THREE.CylinderGeometry(0.044, 0.056, 0.32, 14);
  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeve.rotation.x = Math.PI / 2.22;
  sleeve.rotation.z = isLeft ? -0.22 : 0.22;
  sleeve.position.set(isLeft ? -0.045 : 0.045, -0.075, 0.13);
  armRoot.add(sleeve);

  // 소매 끝단 접힘단 밴드(Cuff)
  const cuffGeo = new THREE.CylinderGeometry(0.047, 0.048, 0.032, 14);
  const cuff = new THREE.Mesh(cuffGeo, sleeveMat);
  cuff.rotation.x = Math.PI / 2.22;
  cuff.rotation.z = isLeft ? -0.22 : 0.22;
  cuff.position.set(isLeft ? -0.022 : 0.022, -0.035, 0.04);
  armRoot.add(cuff);

  // 2. 손목 전술 벨크로 스트랩
  const strapGeo = new THREE.CylinderGeometry(0.041, 0.042, 0.028, 14);
  const strap = new THREE.Mesh(strapGeo, armorMat);
  strap.rotation.x = Math.PI / 2.22;
  strap.rotation.z = isLeft ? -0.22 : 0.22;
  strap.position.set(isLeft ? -0.012 : 0.012, -0.018, 0.01);
  armRoot.add(strap);

  // 3. 전술 장갑 손바닥 및 손등 폼 패드
  const palmGeo = new THREE.BoxGeometry(0.068, 0.044, 0.078);
  const palm = new THREE.Mesh(palmGeo, gloveMat);
  palm.position.set(isLeft ? 0.005 : -0.005, 0.005, -0.035);
  palm.rotation.z = isLeft ? -0.15 : 0.15;
  armRoot.add(palm);

  // 탄소섬유 너클 가드 (Knuckle Guard)
  const knuckleGeo = new THREE.BoxGeometry(0.064, 0.014, 0.048);
  const knuckle = new THREE.Mesh(knuckleGeo, armorMat);
  knuckle.position.set(isLeft ? 0.005 : -0.005, 0.028, -0.035);
  knuckle.rotation.z = isLeft ? -0.15 : 0.15;
  armRoot.add(knuckle);

  // 4. 마디 관절이 살아있는 5개 손가락 (2~3 Joint Articulated Fingers)
  const fingersGroup = new THREE.Group();
  fingersGroup.position.set(isLeft ? 0.005 : -0.005, 0.005, -0.035);
  fingersGroup.rotation.z = isLeft ? -0.15 : 0.15;
  armRoot.add(fingersGroup);

  // 엄지손가락 (Thumb) - 2단 관절: 손잡이/아이템을 단단히 감싸쥐는 전술 파지
  const thumbBase = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.020, 0.032), gloveMat);
  if (isLeft) {
    thumbBase.position.set(-0.036, 0.010, -0.012);
    thumbBase.rotation.set(0.25, -0.65, -0.35);
  } else {
    // 오른손: 아이템 상단을 단단히 누르며 감싸는 파지
    thumbBase.position.set(0.034, 0.008, -0.015);
    thumbBase.rotation.set(0.38, 0.78, 0.42);
  }
  fingersGroup.add(thumbBase);

  const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.018, 0.026), gloveMat);
  thumbTip.position.set(0, -0.006, -0.026);
  thumbTip.rotation.x = isLeft ? 0.55 : 0.75;
  thumbBase.add(thumbTip);

  // 4개 손가락 (검지, 중지, 약지, 소지) - 각각 3단 관절로 원형 파지(Tight Grip Loop)
  const fingerOffsets = isLeft
    ? [-0.022, -0.007, 0.008, 0.023] // 검지 -> 소지
    : [0.022, 0.007, -0.008, -0.023];

  const fingerLengths = [0.032, 0.036, 0.034, 0.028]; // 중지가 가장 긺

  for (let i = 0; i < 4; i++) {
    const fx = fingerOffsets[i];
    const fl = fingerLengths[i];

    // 기저 마디 (Base Phalanx) - 아이템을 향해 아래/안쪽으로 깊게 꺾임
    const joint1 = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, fl), gloveMat);
    joint1.position.set(fx, 0.002, -0.040);
    joint1.rotation.x = isLeft ? (0.65 + i * 0.04) : (0.88 + i * 0.05);
    fingersGroup.add(joint1);

    // 중간 마디 (Middle Phalanx) - 아이템 둘레를 감싸안음
    const joint2 = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.014, fl * 0.85), gloveMat);
    joint2.position.set(0, -0.006, -fl * 0.85);
    joint2.rotation.x = isLeft ? 0.85 : 1.15;
    joint1.add(joint2);

    // 끝 마디 (Distal Phalanx) - 손바닥 안쪽으로 확실히 말려들어가 꽉 쥠
    const joint3 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.013, fl * 0.70), gloveMat);
    joint3.position.set(0, -0.005, -fl * 0.70);
    joint3.rotation.x = isLeft ? 0.65 : 0.85;
    joint2.add(joint3);
  }

  return { armRoot, sleeve, cuff, strap, palm, knuckle, fingersGroup };
}

/**
 * 1인칭 뷰모델 시스템 (FirstPersonViewModel)
 * - 화면 시야를 가리는 3인칭 몸통/어깨를 완전히 배제하고,
 *   화면 좌하단(손전등/음파 감지기)과 우하단(아이템 파지)에
 *   정교한 전술 장갑과 전투복 소매를 1인칭 전용 시야각에 완벽하게 정렬하여 렌더링합니다.
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
    this.suitColor = 'steel';

    // 애니메이션 상태값
    this.equipProgress = 1.0;
    this.actionTimer = 0;
    this.flashlightClickTimer = 0;
    this.sonarInspectRatio = 1.0;
    this.radarSweepAngle = 0;
    this.radarRedrawAccum = 0;

    // 시선 회전 관성(Sway)
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.swayX = 0;
    this.swayY = 0;

    this.initMaterials();
    this.buildLeftArmFlashlight();
    this.buildRightArmItemHolder();
  }

  initMaterials() {
    // 전투복 소매 원단 (Trooper.png UV 텍스처 + 팀 컬러 바인딩)
    const suitTex = getTintedSoldierTexture(this.suitColor || 'steel');
    this.sleeveMat = new THREE.MeshStandardMaterial({
      map: suitTex,
      roughness: 0.74,
      metalness: 0.22,
      color: 0xffffff
    });

    // 전술 가죽 장갑
    this.gloveMat = new THREE.MeshStandardMaterial({
      color: 0x16181b,
      roughness: 0.62,
      metalness: 0.28
    });

    // 탄소섬유 너클 가드 및 금속 프레임
    this.armorPlateMat = new THREE.MeshStandardMaterial({
      color: 0x2e3338,
      roughness: 0.38,
      metalness: 0.82
    });

    this.pdaScreenMat = new THREE.MeshStandardMaterial({
      color: 0xb8f4d8,
      emissive: 0x38b878,
      emissiveIntensity: 0.85,
      roughness: 0.25
    });

    this.lensMat = new THREE.MeshBasicMaterial({ color: 0xf4faff });
  }

  setSuitColor(suitColorKey) {
    this.suitColor = suitColorKey;
    const tex = getTintedSoldierTexture(suitColorKey);
    if (this.sleeveMat) {
      this.sleeveMat.map = tex;
      this.sleeveMat.color.setHex(0xffffff);
      this.sleeveMat.needsUpdate = true;
    }
  }

  buildLeftArmFlashlight() {
    this.leftArmGroup = new THREE.Group();
    // 화면 좌하단 배치 (시야 중심을 전혀 가리지 않는 자연스러운 전술 파지 위치)
    this.leftArmGroup.position.set(-0.25, -0.22, -0.42);
    this.root.add(this.leftArmGroup);

    // 1. 고품질 전술 손 & 소매 모델 조립
    const leftArmData = createTacticalArmAndHand(true, this.sleeveMat, this.gloveMat, this.armorPlateMat);
    this.leftArmGroup.add(leftArmData.armRoot);
    this.leftArmData = leftArmData;

    // 2. 왼손 손목 전술 단말기(PDA)
    const pdaBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.062, 0.020, 0.078),
      this.armorPlateMat
    );
    pdaBody.position.set(-0.016, -0.012, 0.035);
    pdaBody.rotation.z = -0.32;
    pdaBody.rotation.x = 0.18;
    this.leftArmGroup.add(pdaBody);

    const pdaScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.048, 0.062),
      this.pdaScreenMat
    );
    pdaScreen.rotation.x = -Math.PI / 2;
    pdaScreen.position.set(0, 0.011, 0);
    pdaBody.add(pdaScreen);

    // 3. 전술 손전등 본체 (챕터 1 / 챕터 3 전용)
    this.torchGroup = new THREE.Group();
    this.torchGroup.position.set(0.020, 0.024, -0.075);
    this.leftArmGroup.add(this.torchGroup);

    const torchBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.020, 0.018, 0.17, 12),
      this.armorPlateMat
    );
    torchBody.rotation.x = Math.PI / 2;
    this.torchGroup.add(torchBody);

    const torchHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030, 0.022, 0.052, 14),
      this.armorPlateMat
    );
    torchHead.rotation.x = Math.PI / 2;
    torchHead.position.z = -0.095;
    this.torchGroup.add(torchHead);

    this.torchLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.026, 14),
      this.lensMat
    );
    this.torchLens.rotation.y = Math.PI;
    this.torchLens.position.z = -0.122;
    this.torchGroup.add(this.torchLens);

    // 4. 챕터 2 전용: 직육면체 수중 음파 레이더 감지기 + 상단 발광 작업등
    this.sonarDeviceGroup = new THREE.Group();
    this.sonarDeviceGroup.position.set(0.028, 0.038, -0.070);
    this.sonarDeviceGroup.visible = false;
    this.leftArmGroup.add(this.sonarDeviceGroup);

    const sonarBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.090, 0.140, 0.042),
      this.armorPlateMat
    );
    this.sonarDeviceGroup.add(sonarBody);

    for (const by of [-0.065, 0.065]) {
      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(0.096, 0.018, 0.046),
        this.gloveMat
      );
      bumper.position.y = by;
      this.sonarDeviceGroup.add(bumper);
    }

    const topHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.014, 0.036),
      this.armorPlateMat
    );
    topHousing.position.set(0, 0.076, 0);
    this.sonarDeviceGroup.add(topHousing);

    this.sonarTopLightMat = new THREE.MeshBasicMaterial({ color: 0xffe4b0 });
    const topDiffuserBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.074, 0.010, 0.028),
      this.sonarTopLightMat
    );
    topDiffuserBar.position.set(0, 0.081, 0);
    this.sonarDeviceGroup.add(topDiffuserBar);

    const sonarAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.007, 0.052, 8),
      this.armorPlateMat
    );
    sonarAntenna.position.set(0.035, 0.092, -0.01);
    this.sonarDeviceGroup.add(sonarAntenna);

    this.radarCanvas = document.createElement('canvas');
    this.radarCanvas.width = 128;
    this.radarCanvas.height = 128;
    this.radarCtx = this.radarCanvas.getContext('2d');
    this.radarTex = new THREE.CanvasTexture(this.radarCanvas);
    this.radarScreenMat = new THREE.MeshBasicMaterial({ map: this.radarTex });

    const radarScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.074, 0.084),
      this.radarScreenMat
    );
    radarScreenMesh.position.set(0, 0.012, 0.0225);
    this.sonarDeviceGroup.add(radarScreenMesh);

    for (let bi = -1; bi <= 1; bi++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.012, 0.006),
        bi === 0 ? this.pdaScreenMat : this.gloveMat
      );
      btn.position.set(bi * 0.024, -0.045, 0.022);
      this.sonarDeviceGroup.add(btn);
    }

    this.updateSonarRadar(0.1, 99, 0, false);
  }

  buildRightArmItemHolder() {
    this.rightArmGroup = new THREE.Group();
    // 화면 우하단 배치 (시야 중심을 전혀 가리지 않는 자연스러운 전술 파지 위치)
    this.rightArmGroup.position.set(0.26, -0.23, -0.44);
    this.root.add(this.rightArmGroup);

    // 1. 고품질 전술 손 & 소매 모델 조립
    const rightArmData = createTacticalArmAndHand(false, this.sleeveMat, this.gloveMat, this.armorPlateMat);
    this.rightArmGroup.add(rightArmData.armRoot);
    this.rightArmData = rightArmData;

    // 2. 들고 있는 3D 아이템이 장착되는 앵커 (손바닥 중심 및 굽혀진 손가락 관절 고리 안쪽에 정확히 밀착)
    this.heldItemAnchor = new THREE.Group();
    this.heldItemAnchor.position.set(-0.005, 0.008, -0.048);
    this.rightArmGroup.add(this.heldItemAnchor);

    this.itemPool = {};
    const itemTypes = ['energy_cell', 'security_keycard', 'coolant_valve', 'flare'];
    for (const type of itemTypes) {
      const { group, updateItemAnim } = buildItemMesh3D(type);
      if (type === 'energy_cell') {
        group.scale.setScalar(0.64);
        group.rotation.set(0.15, -0.42, 0.06);
        group.position.set(0, 0.002, 0.005);
      } else if (type === 'security_keycard') {
        group.scale.setScalar(0.72);
        group.rotation.set(-0.16, -0.34, 0.08);
        group.position.set(0, 0.004, 0.006);
      } else if (type === 'coolant_valve') {
        group.scale.setScalar(0.66);
        group.rotation.set(0.18, -0.46, 0.12);
        group.position.set(-0.006, 0.006, 0.004);
      } else if (type === 'flare') {
        group.scale.setScalar(0.72);
        group.rotation.set(0.24, -0.16, 0.10);
        group.position.set(0, -0.004, 0.012);
      }
      group.visible = false;
      this.heldItemAnchor.add(group);
      this.itemPool[type] = { group, updateItemAnim };
    }
  }

  setChapterMode(chapterId) {
    this.chapterId = chapterId || 'chapter1';
    const isCh2 = this.chapterId === 'chapter2';
    if (this.torchGroup) this.torchGroup.visible = !isCh2;
    if (this.sonarDeviceGroup) this.sonarDeviceGroup.visible = isCh2;
    this.sonarInspectRatio = 1.0;
  }

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

    ctx.fillStyle = '#0c0703';
    ctx.fillRect(0, 0, w, h);

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

    const sx = cx + Math.sin(this.radarSweepAngle) * maxR;
    const sy = cy - Math.cos(this.radarSweepAngle) * maxR;
    ctx.strokeStyle = 'rgba(255, 182, 72, 0.78)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    ctx.fillStyle = '#ffd280';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const blips = (Array.isArray(extraBlips) && extraBlips.length > 0
      ? extraBlips
      : (monsterActive ? [{ dist: distToMonster, relAngle, role: 'ripper' }] : [])
    ).filter(b => b.role !== 'snare');

    let closestDist = distToMonster;
    for (const b of blips) {
      if (b.dist >= 28) continue;
      if (b.dist < closestDist) closestDist = b.dist;
      const clampedR = Math.min(maxR - 3, (b.dist / 26) * maxR);
      const bx = cx + Math.sin(b.relAngle) * clampedR;
      const by = cy - Math.cos(b.relAngle) * clampedR;

      const pulse = 0.5 + 0.5 * Math.sin(this.time * (b.dist < 10 ? 16 : 9));
      const isRipper = b.role === 'ripper' || b.role === 'stalker';

      ctx.fillStyle = isRipper
        ? (b.dist < 10 ? '#ff3b1f' : '#ff9a2e')
        : '#ffcc33';
      ctx.beginPath();
      ctx.arc(bx, by, (isRipper ? 3.8 : 3.0) + pulse * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isRipper
        ? 'rgba(255, 68, 34, 0.85)'
        : 'rgba(255, 204, 51, 0.75)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(bx, by, (isRipper ? 6.5 : 5.2) + pulse * 3.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    const isDanger = monsterActive && closestDist < 28;

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

  triggerSonarPulseAnim() {
    this.sonarPulseRecoil = 0.28;
    if (this.sonarTopLightMat) {
      this.sonarTopLightMat.color.setHex(0xffffff);
      setTimeout(() => {
        if (this.sonarTopLightMat) this.sonarTopLightMat.color.setHex(0xffe4b0);
      }, 250);
    }
  }

  setHeldItem(itemType) {
    if (this.currentItemType === itemType) return;
    this.currentItemType = itemType;
    this.equipProgress = 0.0;

    for (const [type, data] of Object.entries(this.itemPool)) {
      data.group.visible = (type === itemType);
    }
    this.currentItemUpdater = itemType && this.itemPool[itemType] ? this.itemPool[itemType].updateItemAnim : null;
  }

  triggerInteractAnim() {
    this.actionTimer = 0.36;
  }

  triggerFlashlightAnim(isOn) {
    this.flashlightClickTimer = 0.22;
    if (this.torchLens) {
      this.torchLens.material.color.setHex(isOn ? 0xf4faff : 0x22262a);
    }
  }

  update(dt, { isMoving, isSprinting, walkCycle, yaw, pitch }) {
    this.time += dt;

    // 1. 시선 회전 관성(Sway)
    const dYaw = yaw - this.lastYaw;
    const dPitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;

    this.swayX = THREE.MathUtils.lerp(this.swayX, THREE.MathUtils.clamp(-dYaw * 0.45, -0.045, 0.045), Math.min(1, dt * 10));
    this.swayY = THREE.MathUtils.lerp(this.swayY, THREE.MathUtils.clamp(dPitch * 0.45, -0.045, 0.045), Math.min(1, dt * 10));

    // 2. 호흡 + 보행/질주 바빙(Bobbing)
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
        sprintTilt = 0.28;
        sprintDropY = -0.055;
        sprintArmPump = Math.sin(walkCycle * 0.5) * 0.045;
      }
    }

    let torchClickOffset = 0;
    if (this.flashlightClickTimer > 0) {
      this.flashlightClickTimer = Math.max(0, this.flashlightClickTimer - dt);
      torchClickOffset = Math.sin((this.flashlightClickTimer / 0.22) * Math.PI) * 0.028;
    }
    if (this.sonarPulseRecoil > 0) {
      this.sonarPulseRecoil = Math.max(0, this.sonarPulseRecoil - dt * 1.8);
      torchClickOffset += Math.sin((this.sonarPulseRecoil / 0.28) * Math.PI) * 0.045;
    }

    const isCh2 = this.chapterId === 'chapter2';
    const targetInspect = (isCh2 && !isMoving) ? 1.0 : 0.0;
    this.sonarInspectRatio = THREE.MathUtils.lerp(
      this.sonarInspectRatio,
      targetInspect,
      Math.min(1, dt * 7.5)
    );

    const inspectRaiseX = isCh2 ? this.sonarInspectRatio * 0.095 : 0;
    const inspectRaiseY = isCh2 ? this.sonarInspectRatio * 0.078 : 0;
    const inspectPullZ = isCh2 ? this.sonarInspectRatio * 0.055 : 0;

    // 3. 왼손(손전등 / 음파 감지기) 위치 및 회전
    this.leftArmGroup.position.set(
      -0.25 + inspectRaiseX + breathX + bobX * 0.9 + this.swayX,
      -0.22 + inspectRaiseY + sprintDropY + breathY - bobY * 1.1 + this.swayY - torchClickOffset * 0.5,
      -0.42 + inspectPullZ + torchClickOffset + sprintArmPump
    );
    this.leftArmGroup.rotation.set(
      -sprintTilt * 0.6 + this.swayY * 1.4,
      this.swayX * 1.5,
      bobX * 1.5 - (isSprinting ? 0.12 : 0)
    );

    if (isCh2 && this.sonarDeviceGroup) {
      const devicePitch = THREE.MathUtils.lerp(-1.18, -0.12, this.sonarInspectRatio);
      const deviceYaw = THREE.MathUtils.lerp(0.08, 0.26, this.sonarInspectRatio);
      const deviceRoll = THREE.MathUtils.lerp(0.0, -0.08, this.sonarInspectRatio);
      this.sonarDeviceGroup.rotation.set(devicePitch, deviceYaw, deviceRoll);
    }

    // 4. 오른손(아이템 파지 손) 장착 & 상호작용 모션
    if (this.equipProgress < 1.0) {
      this.equipProgress = Math.min(1.0, this.equipProgress + dt * 3.8);
    }
    const easeEquip = 1 - Math.pow(1 - this.equipProgress, 3);
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
      -0.44 + actionReachZ - sprintArmPump
    );
    this.rightArmGroup.rotation.set(
      actionPitchX - sprintTilt * 0.75 + Math.sin(this.time * 1.8) * 0.025,
      this.swayX * 1.6,
      equipRollZ - bobX * 1.6 + (isSprinting ? 0.14 : 0)
    );

    // 아이템 애니메이션 업데이트
    if (this.currentItemUpdater) {
      this.currentItemUpdater(this.time);
    }
  }
}
