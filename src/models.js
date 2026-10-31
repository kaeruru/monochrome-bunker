import * as THREE from 'three';
import { sound } from './audio.js';

// ============================================================================
// 고밀도 생체-엔도스켈레톤(Xenomorph + FNaF Endoskeleton 하이브리드) &
// 성인 비율 특수 방호 대원(CBRN Tactical Operative) 3D 모델링 모듈 (src/models.js)
// ============================================================================

function chaoticNoise(t, seed = 0) {
  return (
    Math.sin(t * 1.37 + seed) * 0.45 +
    Math.sin(t * 2.93 - seed * 1.7) * 0.3 +
    Math.cos(t * 5.17 + Math.sin(t * 0.73 + seed) * 2.2) * 0.25
  );
}

function createBiomechanicalMaterials() {
  const size = 512;
  const exoCanvas = document.createElement('canvas');
  exoCanvas.width = size;
  exoCanvas.height = size;
  const ctx = exoCanvas.getContext('2d');

  ctx.fillStyle = '#26292c';
  ctx.fillRect(0, 0, size, size);

  // 가로 방향 생체 주름관 및 엔도스켈레톤 기계 마디 패턴
  for (let y = 0; y < size; y += 8) {
    const grad = ctx.createLinearGradient(0, y, 0, y + 8);
    grad.addColorStop(0, '#0e1012');
    grad.addColorStop(0.35, '#42474c');
    grad.addColorStop(0.55, '#545b62');
    grad.addColorStop(1, '#121416');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, size, 8);
  }

  // 세로 힘줄 및 기계 스크래치 결
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const h = 60 + Math.random() * 180;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(95, 102, 110, 0.28)' : 'rgba(8, 10, 12, 0.48)';
    ctx.lineWidth = 1.5 + Math.random() * 3.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 35, y + h * 0.3,
      x + (Math.random() - 0.5) * 35, y + h * 0.7,
      x + (Math.random() - 0.5) * 18, y + h
    );
    ctx.stroke();
  }

  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 38;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const exoColorTex = new THREE.CanvasTexture(exoCanvas);
  exoColorTex.wrapS = THREE.RepeatWrapping;
  exoColorTex.wrapT = THREE.RepeatWrapping;
  exoColorTex.repeat.set(2, 2);
  exoColorTex.colorSpace = THREE.SRGBColorSpace;

  // 성인 대원 전술 전투복(Tactical Ripstop Fabric) 실사 텍스처
  const suitCanvas = document.createElement('canvas');
  suitCanvas.width = 512;
  suitCanvas.height = 512;
  const sctx = suitCanvas.getContext('2d');

  sctx.fillStyle = '#484b4e';
  sctx.fillRect(0, 0, 512, 512);
  sctx.strokeStyle = 'rgba(20, 22, 24, 0.45)';
  sctx.lineWidth = 1;
  for (let i = 0; i < 512; i += 6) {
    sctx.beginPath();
    sctx.moveTo(i, 0); sctx.lineTo(i, 512);
    sctx.moveTo(0, i); sctx.lineTo(512, i);
    sctx.stroke();
  }
  const suitImg = sctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < suitImg.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 24;
    suitImg.data[i] = Math.max(0, Math.min(255, suitImg.data[i] + n));
    suitImg.data[i + 1] = Math.max(0, Math.min(255, suitImg.data[i + 1] + n));
    suitImg.data[i + 2] = Math.max(0, Math.min(255, suitImg.data[i + 2] + n));
  }
  sctx.putImageData(suitImg, 0, 0);

  const suitColorTex = new THREE.CanvasTexture(suitCanvas);
  suitColorTex.wrapS = THREE.RepeatWrapping;
  suitColorTex.wrapT = THREE.RepeatWrapping;
  suitColorTex.colorSpace = THREE.SRGBColorSpace;

  return {
    // [산안드레아스풍 레트로 로우폴리 머티리얼 세트]
    // 외골격 주 갑피 (매트한 생체 키틴질)
    exoChitin: new THREE.MeshLambertMaterial({
      color: 0x585e66,
      map: exoColorTex
    }),
    // 엔도스켈레톤 금속 갈비뼈 / 피스톤 / 척추 프레임
    endoSteel: new THREE.MeshLambertMaterial({
      color: 0x8a929a,
      map: exoColorTex
    }),
    // 어두운 생체 전선 및 근육 다발
    exoSinew: new THREE.MeshLambertMaterial({
      color: 0x24282c,
      map: exoColorTex
    }),
    // 두개골 전면 스모크 돔
    exoCarapaceDome: new THREE.MeshLambertMaterial({
      color: 0x1c2024
    }),
    // 크롬 금속 이빨 & 꼬리 칼날 & 발톱
    exoChromeTeeth: new THREE.MeshLambertMaterial({
      color: 0xd8dee4
    }),
    // 흉곽 내부 맥동하는 심장 코어(Heart Core) - 어둠 속에서 뚜렷하게 발광
    heartCoreMat: new THREE.MeshLambertMaterial({
      color: 0x111111,
      emissive: 0xdbe8ff
    }),
    // 심장 코어 혈관/케이블
    heartVeinMat: new THREE.MeshLambertMaterial({
      color: 0x667788
    }),

    // 성인 특수 대원(Tactical CBRN Operative) 방호복 재질
    suitFabric: new THREE.MeshLambertMaterial({
      color: 0x5c6064,
      map: suitColorTex
    }),
    suitArmor: new THREE.MeshLambertMaterial({
      color: 0x282b2e
    }),
    suitWebbing: new THREE.MeshLambertMaterial({
      color: 0x181a1c
    }),
    suitMetal: new THREE.MeshLambertMaterial({
      color: 0x888e94
    }),
    visorGlass: new THREE.MeshLambertMaterial({
      color: 0x101214
    }),
    visorHudSlit: new THREE.MeshBasicMaterial({
      color: 0xd8e4ec
    }),
    // FNAF 나이트메어 삼두 괴수(The Flooded Trio) 전용 안구/코어/부식 철근 재질
    nightmareEyeRing: new THREE.MeshBasicMaterial({
      color: 0xff2a1a
    }),
    nightmarePupil: new THREE.MeshBasicMaterial({
      color: 0xffffff
    }),
    lurkerEyeGlow: new THREE.MeshBasicMaterial({
      color: 0xffaa22
    }),
    mangleEyeGlow: new THREE.MeshBasicMaterial({
      color: 0xff3366
    }),
    rustedRebar: new THREE.MeshLambertMaterial({
      color: 0x3a2d27,
      map: exoColorTex
    })
  };
}

let sharedMaterials = null;
function getMaterials() {
  if (!sharedMaterials) {
    sharedMaterials = createBiomechanicalMaterials();
  }
  return sharedMaterials;
}

function deformGeometry(geo, deformFn) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    deformFn(v, i);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createSculptedBioLimb(points, rStart, rEnd, opts = {}) {
  const {
    segments = 26,
    radialSegs = 14,
    flutes = 6,
    fluteDepth = 0.12,
    ribFreq = 22,
    ribAmp = 0.06,
    bulge = 0.14,
    mat = null
  } = opts;

  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, segments, 1.0, radialSegs, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const muscleProfile = Math.sin(t * Math.PI) * bulge;
    const baseR = rStart * (1 - t) + rEnd * t + muscleProfile * ((rStart + rEnd) * 0.5);
    const ribWave = 1.0 + Math.sin(t * Math.PI * ribFreq) * ribAmp;

    for (let j = 0; j <= radialSegs; j++) {
      const idx = i * (radialSegs + 1) + j;
      if (idx < pos.count) {
        const angle = (j / radialSegs) * Math.PI * 2;
        const fluteWave = 1.0 + Math.cos(angle * flutes) * fluteDepth;
        const finalR = Math.max(0.002, baseR * ribWave * fluteWave);

        v.fromBufferAttribute(pos, idx);
        v.sub(center).multiplyScalar(finalR).add(center);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
  }

  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat || getMaterials().exoChitin);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ============================================================================
// 1. 괴물 모델: [제노-엔도스켈레톤 스토커 (Xeno-Endoskeleton Stalker)]
// - 제노모프의 유선형 포식자 골격 + FNaF 엔도스켈레톤의 노출된 금속 늑골(갈비뼈),
//   유압 피스톤, 전선 다발, 그리고 흉곽 한가운데 매달려 고동치는 [심장 코어(Heart Core)] 결합!
// - 실제 무게감(발 디딤 충격, 골반 침하, 상체 역회전, 네발 짐승에 가까운 폭주 질주,
//   전갈식 오버헤드 꼬리 공격)과 실시간 괴물 사운드(발소리, 심장 박동, 괴성 포효)가 연동됩니다.
// ============================================================================
export class MonsterEntity {
  constructor() {
    this.mats = getMaterials();
    this.root = new THREE.Group();
    this.time = Math.random() * 10;
    this.animMode = 'stalk';
    this.lastMode = 'stalk';

    this.whipImpulse = 0;
    this.nextWhipTime = 1.2 + Math.random() * 2.2;

    // 사운드 동기화 상태
    this.enableSound = false;
    this.soundVolume = 0.25;
    this.lastStepIndex = -1;
    this.lastBeatIndex = -1;

    this.tailNodes = [];
    this.tendrils = [];
    this.clawsLeft = [];
    this.clawsRight = [];
    this.coreRings = [];
    this.walkCyclePhase = 0;

    this.buildAnatomy();
  }

  buildAnatomy() {
    // 1. 골반(Pelvis) - 엔도스켈레톤 금속 프레임 + 장골 갑피 + 측면 5포트
    this.pelvisGroup = new THREE.Group();
    this.pelvisGroup.position.set(0, 1.16, 0);
    this.root.add(this.pelvisGroup);

    // 엔도스켈레톤 중심 골반 블록 & 유압 실린더 마운트
    const endoPelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.09, 0.18, 8),
      this.mats.endoSteel
    );
    this.pelvisGroup.add(endoPelvis);

    for (let side of [-1, 1]) {
      const iliacCrest = createSculptedBioLimb(
        [
          [0, -0.08, 0.12],
          [side * 0.16, 0.02, 0.08],
          [side * 0.22, 0.08, -0.05],
          [0, 0.04, -0.14]
        ],
        0.058,
        0.042,
        { segments: 18, flutes: 4, ribFreq: 16, ribAmp: 0.08, mat: this.mats.exoChitin }
      );
      this.pelvisGroup.add(iliacCrest);

      for (let p = 0; p < 5; p++) {
        const port = new THREE.Mesh(
          new THREE.TorusGeometry(0.022, 0.007, 8, 12),
          this.mats.endoSteel
        );
        port.position.set(side * 0.2, -0.02 - p * 0.042, 0.04 - p * 0.018);
        port.rotation.y = (side * Math.PI) / 2;
        this.pelvisGroup.add(port);
      }
    }

    // 2. 상체(Thorax): 노출된 엔도스켈레톤 척추 & 유압 피스톤 허리 + 뚫려있는 금속 갈비뼈 + 심장 코어!
    this.thoraxGroup = new THREE.Group();
    this.thoraxGroup.position.set(0, 0.06, 0);
    this.pelvisGroup.add(this.thoraxGroup);

    // S자 엔도스켈레톤 금속 척추 기둥
    const spinePts = [
      [0, -0.04, -0.08],
      [0, 0.24, -0.1],
      [0, 0.55, -0.06],
      [0, 0.84, 0.08],
      [0, 1.04, 0.24]
    ];
    const spineColumn = createSculptedBioLimb(spinePts, 0.078, 0.064, {
      segments: 28,
      flutes: 8,
      ribFreq: 30,
      ribAmp: 0.14,
      bulge: 0.04,
      mat: this.mats.endoSteel
    });
    this.thoraxGroup.add(spineColumn);

    // 척추에서 골반을 잇는 엔도스켈레톤 허리 유압 피스톤 로드 4개 (프레디 엔도스켈레톤 감성!)
    for (let side of [-1, 1]) {
      for (let front of [-1, 1]) {
        const pistonOuter = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8),
          this.mats.endoSteel
        );
        pistonOuter.position.set(side * 0.09, 0.12, front * 0.05 - 0.02);
        pistonOuter.rotation.z = side * -0.12;
        pistonOuter.rotation.x = front * 0.15;
        this.thoraxGroup.add(pistonOuter);

        const pistonInner = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.38, 8),
          this.mats.exoChromeTeeth
        );
        pistonInner.position.set(side * 0.1, 0.2, front * 0.06 - 0.02);
        pistonInner.rotation.z = side * -0.12;
        pistonInner.rotation.x = front * 0.15;
        this.thoraxGroup.add(pistonInner);
      }
    }

    // -------------------------------------------------------------------------
    // 엔도스켈레톤 갈비뼈(Open Ribcage) & 고동치는 심장 코어(Heart Core)
    // -------------------------------------------------------------------------
    this.ribcageGroup = new THREE.Group();
    this.ribcageGroup.position.set(0, 0.44, 0.05);
    this.thoraxGroup.add(this.ribcageGroup);

    // (A) 흉곽 정중앙 허공에 매달린 [심장 코어 (Biomechanical Heart Core)]
    this.heartGroup = new THREE.Group();
    this.heartGroup.position.set(0, 0.24, 0.05);
    this.ribcageGroup.add(this.heartGroup);

    const coreGeo = deformGeometry(new THREE.IcosahedronGeometry(0.115, 2), (v) => {
      // 실제 심장처럼 위쪽이 넓고 아래쪽이 뾰족한 비대칭 생체 코어 형상
      v.y *= 1.25;
      if (v.y < 0) {
        v.x *= 1.0 + v.y * 0.35;
        v.z *= 1.0 + v.y * 0.35;
      }
      const ridge = 1.0 + 0.12 * Math.sin(v.x * 22) * Math.cos(v.y * 22);
      v.multiplyScalar(ridge);
    });
    this.heartMesh = new THREE.Mesh(coreGeo, this.mats.heartCoreMat);
    this.heartGroup.add(this.heartMesh);

    // 심장 코어를 감싸며 불규칙하게 회전하는 엔도스켈레톤 금속 구속 링 2개
    for (let rIdx = 0; rIdx < 2; rIdx++) {
      const cageRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.145 + rIdx * 0.018, 0.01, 8, 20),
        this.mats.endoSteel
      );
      cageRing.rotation.x = rIdx === 0 ? Math.PI / 3 : -Math.PI / 4;
      cageRing.rotation.y = rIdx * 0.8;
      this.heartGroup.add(cageRing);
      this.coreRings.push(cageRing);
    }

    // 심장 코어에서 뿜어져 나오는 은은한 내부 조명 (갈비뼈 그림자를 드리움)
    this.heartLight = new THREE.PointLight(0xdbe8ff, 2.2, 3.2, 1.8);
    this.heartGroup.add(this.heartLight);

    // 심장 코어를 척추와 갈비뼈에 매달아 고정하는 6가닥의 동맥/전선 케이블
    const arteryTargets = [
      [-0.18, 0.18, -0.06], [0.18, 0.18, -0.06],
      [-0.2, -0.14, 0.04],  [0.2, -0.14, 0.04],
      [0, 0.24, -0.14],     [0, -0.22, -0.12]
    ];
    for (const [ax, ay, az] of arteryTargets) {
      const artery = createSculptedBioLimb(
        [[0, 0, 0], [ax * 0.5, ay * 0.6, az * 0.5], [ax, ay, az]],
        0.022,
        0.012,
        { segments: 10, flutes: 4, ribFreq: 14, ribAmp: 0.12, bulge: 0, mat: this.mats.heartVeinMat }
      );
      this.heartGroup.add(artery);
    }

    // (B) 좌우 8쌍(총 16개)의 예리하게 분리된 엔도스켈레톤 금속 갈비뼈!
    // 심장 코어가 선명하게 보이도록 내부 근육 덩어리를 제거하고 갈비뼈 사이 공간을 완전히 개방했습니다.
    for (let side of [-1, 1]) {
      for (let r = 0; r < 8; r++) {
        const t = r / 7;
        const ry = t * 0.48 - 0.02;
        const profile = Math.sin(t * Math.PI);
        const spread = 0.22 + profile * 0.13;
        const fwd = 0.14 + profile * 0.12;
        const backZ = -0.11 + t * 0.12;

        // 갈비뼈 본체 (척추에서 옆구리를 돌아 가슴 앞쪽까지 감싸되, 중앙은 열려 있어 심장이 보임)
        const rib = createSculptedBioLimb(
          [
            [side * 0.04, ry + 0.03, backZ],
            [side * spread * 0.75, ry + 0.02, backZ + fwd * 0.35],
            [side * spread, ry - 0.01, fwd * 0.65],
            [side * (spread * 0.38), ry - 0.04, fwd]
          ],
          0.026,
          0.011,
          { segments: 18, flutes: 4, ribFreq: 16, ribAmp: 0.08, bulge: 0.02, mat: this.mats.endoSteel }
        );
        this.ribcageGroup.add(rib);

        // 갈비뼈 끝단의 날카로운 금속 흉골 클로(Rib Tip Claw)
        const ribTip = new THREE.Mesh(
          new THREE.ConeGeometry(0.012, 0.055, 5),
          this.mats.exoChromeTeeth
        );
        ribTip.position.set(side * (spread * 0.32), ry - 0.045, fwd + 0.01);
        ribTip.rotation.z = side * (Math.PI / 2 - 0.3);
        ribTip.rotation.y = -side * 0.4;
        this.ribcageGroup.add(ribTip);
      }
    }

    // 쇄골 엔도스켈레톤 프레임
    for (let side of [-1, 1]) {
      const clavicle = createSculptedBioLimb(
        [
          [0, 0.94, 0.2],
          [side * 0.18, 0.98, 0.16],
          [side * 0.35, 0.92, 0.08]
        ],
        0.04,
        0.045,
        { segments: 14, flutes: 5, ribFreq: 14, ribAmp: 0.08, mat: this.mats.endoSteel }
      );
      this.thoraxGroup.add(clavicle);
    }

    // 3. 등 뒤의 4대 곡선 배기 파이프 + 불규칙(Chaotic) 채찍 촉수
    this.dorsalGroup = new THREE.Group();
    this.dorsalGroup.position.set(0, 0.72, -0.04);
    this.thoraxGroup.add(this.dorsalGroup);

    const pipeSpecs = [
      { side: -1, y: 0.14, len: 0.56, spread: 0.22, lift: 0.44 },
      { side: 1,  y: 0.14, len: 0.56, spread: 0.22, lift: 0.44 },
      { side: -1, y: -0.04, len: 0.44, spread: 0.28, lift: 0.28 },
      { side: 1,  y: -0.04, len: 0.44, spread: 0.28, lift: 0.28 }
    ];

    for (const ps of pipeSpecs) {
      const pipePts = [
        [ps.side * 0.06, ps.y, 0],
        [ps.side * (ps.spread * 0.7), ps.y + ps.lift * 0.35, -ps.len * 0.55],
        [ps.side * ps.spread, ps.y + ps.lift * 0.75, -ps.len * 0.88],
        [ps.side * (ps.spread * 0.92), ps.y + ps.lift, -ps.len]
      ];
      const pipeMesh = createSculptedBioLimb(pipePts, 0.05, 0.036, {
        segments: 20,
        flutes: 6,
        ribFreq: 24,
        ribAmp: 0.1,
        bulge: 0,
        mat: this.mats.exoChitin
      });
      this.dorsalGroup.add(pipeMesh);

      const tipRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.01, 8, 14),
        this.mats.endoSteel
      );
      tipRing.position.set(ps.side * (ps.spread * 0.92), ps.y + ps.lift, -ps.len);
      tipRing.rotation.x = Math.PI / 3;
      this.dorsalGroup.add(tipRing);
    }

    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = Math.floor(i / 2);
      const tPivot = new THREE.Group();
      tPivot.position.set(side * (0.14 + tier * 0.08), 0.18 - tier * 0.14, 0.02);

      const tendril = createSculptedBioLimb(
        [
          [0, 0, 0],
          [side * 0.24, 0.16, -0.22],
          [side * 0.46, 0.28, -0.44],
          [side * 0.62, 0.12, -0.62]
        ],
        0.026,
        0.004,
        { segments: 18, flutes: 4, ribFreq: 20, ribAmp: 0.08, bulge: 0, mat: this.mats.exoSinew }
      );
      tPivot.add(tendril);
      this.dorsalGroup.add(tPivot);

      this.tendrils.push({
        pivot: tPivot,
        seedX: 1.7 + i * 3.1,
        seedY: 4.3 + i * 2.7,
        seedZ: 8.9 + i * 1.9,
        baseZ: side * 0.2
      });
    }

    // 4. 목(Neck) & 장두형 엔도-제노모프 두개골
    this.neckGroup = new THREE.Group();
    this.neckGroup.position.set(0, 0.96, 0.22);
    this.thoraxGroup.add(this.neckGroup);

    const neckColumn = createSculptedBioLimb(
      [[0, -0.04, -0.04], [0, 0.1, 0.08], [0, 0.22, 0.18]],
      0.082,
      0.068,
      { segments: 14, flutes: 6, ribFreq: 18, ribAmp: 0.14, mat: this.mats.endoSteel }
    );
    this.neckGroup.add(neckColumn);

    for (let side of [-1, 1]) {
      const neckPiston = createSculptedBioLimb(
        [[side * 0.09, -0.05, -0.02], [side * 0.07, 0.09, 0.05], [side * 0.05, 0.2, 0.14]],
        0.022,
        0.016,
        { segments: 12, flutes: 4, ribFreq: 18, ribAmp: 0.1, mat: this.mats.exoChromeTeeth }
      );
      this.neckGroup.add(neckPiston);
    }

    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.22, 0.18);
    this.neckGroup.add(this.headGroup);

    const skullMain = createSculptedBioLimb(
      [
        [0, -0.02, 0.28],
        [0, 0.09, 0.16],
        [0, 0.19, -0.08],
        [0, 0.25, -0.36],
        [0, 0.21, -0.58]
      ],
      0.112,
      0.06,
      { segments: 32, radialSegs: 20, flutes: 8, fluteDepth: 0.08, ribFreq: 28, ribAmp: 0.07, bulge: 0.22, mat: this.mats.exoChitin }
    );
    skullMain.scale.x = 0.78;
    this.headGroup.add(skullMain);

    const frontDome = createSculptedBioLimb(
      [
        [0, -0.01, 0.29],
        [0, 0.11, 0.15],
        [0, 0.19, -0.04],
        [0, 0.22, -0.22]
      ],
      0.102,
      0.082,
      { segments: 20, radialSegs: 18, flutes: 2, fluteDepth: 0.02, ribFreq: 4, ribAmp: 0.01, bulge: 0.18, mat: this.mats.exoCarapaceDome }
    );
    frontDome.scale.x = 0.76;
    this.headGroup.add(frontDome);

    // 두개골 안와 틈새 깊숙이 박힌 엔도스켈레톤 미세 핀포인트 광학 센서 2개 (만화 같은 눈알이 아닌 날카로운 기계 안구 링)
    for (let side of [-1, 1]) {
      const eyeRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.016, 0.004, 6, 12),
        this.mats.exoChromeTeeth
      );
      eyeRing.position.set(side * 0.048, 0.02, 0.255);
      eyeRing.rotation.y = side * 0.35;
      this.headGroup.add(eyeRing);

      const pinLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.007, 8, 8),
        this.mats.heartCoreMat
      );
      pinLight.position.set(side * 0.048, 0.02, 0.255);
      this.headGroup.add(pinLight);
    }

    // 점프스케어 시 암흑 속에서 번쩍이는 두개골 안면 광학 조명 (평상시 0)
    this.faceLight = new THREE.PointLight(0xffeedd, 0, 5.5, 1.4);
    this.faceLight.position.set(0, 0.06, 0.52);
    this.headGroup.add(this.faceLight);

    const crestCenter = createSculptedBioLimb(
      [
        [0, 0.16, 0.04],
        [0, 0.24, -0.18],
        [0, 0.29, -0.4],
        [0, 0.23, -0.59]
      ],
      0.035,
      0.02,
      { segments: 22, flutes: 4, ribFreq: 26, ribAmp: 0.15, bulge: 0.06, mat: this.mats.endoSteel }
    );
    this.headGroup.add(crestCenter);

    for (let i = -6; i <= 6; i++) {
      const t = Math.abs(i) / 6;
      const tx = i * 0.013;
      const tz = 0.27 - t * 0.13;
      const ty = -0.055 + t * 0.015;
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.008, 0.048 - t * 0.012, 6),
        this.mats.exoChromeTeeth
      );
      tooth.position.set(tx, ty, tz);
      tooth.rotation.x = Math.PI + 0.12;
      this.headGroup.add(tooth);
    }

    this.jawGroup = new THREE.Group();
    this.jawGroup.position.set(0, -0.05, 0.05);
    this.headGroup.add(this.jawGroup);

    for (let side of [-1, 1]) {
      const jawBone = createSculptedBioLimb(
        [
          [side * 0.085, 0.01, -0.02],
          [side * 0.075, -0.06, 0.1],
          [side * 0.02, -0.07, 0.21]
        ],
        0.032,
        0.02,
        { segments: 14, flutes: 4, ribFreq: 14, ribAmp: 0.08, mat: this.mats.endoSteel }
      );
      this.jawGroup.add(jawBone);

      for (let k = 0; k < 3; k++) {
        const tendon = createSculptedBioLimb(
          [
            [side * 0.08, 0.05, 0.04 + k * 0.03],
            [side * 0.075, -0.04, 0.06 + k * 0.035]
          ],
          0.008,
          0.007,
          { segments: 6, flutes: 3, ribFreq: 8, ribAmp: 0.05, mat: this.mats.endoSteel }
        );
        this.jawGroup.add(tendon);
      }
    }

    for (let i = -5; i <= 5; i++) {
      const t = Math.abs(i) / 5;
      const tx = i * 0.012;
      const tz = 0.2 - t * 0.11;
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.007, 0.042 - t * 0.01, 6),
        this.mats.exoChromeTeeth
      );
      tooth.position.set(tx, -0.042, tz);
      tooth.rotation.x = -0.15;
      this.jawGroup.add(tooth);
    }

    this.innerJaw = new THREE.Group();
    this.innerJaw.position.set(0, -0.04, 0.08);
    this.headGroup.add(this.innerJaw);

    const pistonRod = createSculptedBioLimb(
      [[0, 0, -0.08], [0, 0, 0.16]],
      0.018,
      0.022,
      { segments: 10, flutes: 4, ribFreq: 16, ribAmp: 0.1, mat: this.mats.endoSteel }
    );
    this.innerJaw.add(pistonRod);

    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const fang = new THREE.Mesh(
        new THREE.ConeGeometry(0.007, 0.032, 5),
        this.mats.exoChromeTeeth
      );
      fang.position.set(Math.cos(ang) * 0.014, Math.sin(ang) * 0.014, 0.17);
      fang.rotation.x = Math.PI / 2;
      this.innerJaw.add(fang);
    }

    // 5. 좌/우 팔다리 & 24마디 칼날 꼬리
    this.leftArm = this.buildXenomorphArm(-1);
    this.rightArm = this.buildXenomorphArm(1);
    this.thoraxGroup.add(this.leftArm.shoulderGroup);
    this.thoraxGroup.add(this.rightArm.shoulderGroup);

    this.leftLeg = this.buildXenomorphLeg(-1);
    this.rightLeg = this.buildXenomorphLeg(1);
    this.pelvisGroup.add(this.leftLeg.hipGroup);
    this.pelvisGroup.add(this.rightLeg.hipGroup);

    this.buildSegmentedWhipTail();
  }

  buildXenomorphArm(side) {
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(side * 0.34, 0.88, 0.1);

    for (let archIdx = 0; archIdx < 2; archIdx++) {
      const offsetZ = (archIdx - 0.5) * 0.055;
      const offsetY = archIdx * 0.035;
      const crescentRidge = createSculptedBioLimb(
        [
          [side * -0.08, 0.06 + offsetY, offsetZ - 0.04],
          [side * 0.04, 0.1 + offsetY, offsetZ + 0.02],
          [side * 0.12, 0.02 + offsetY, offsetZ + 0.05],
          [side * 0.09, -0.12 + offsetY, offsetZ + 0.02]
        ],
        0.036,
        0.022,
        { segments: 16, flutes: 4, ribFreq: 18, ribAmp: 0.12, bulge: 0.08, mat: this.mats.endoSteel }
      );
      shoulderGroup.add(crescentRidge);
    }

    const upperArm = createSculptedBioLimb(
      [
        [0, 0, 0],
        [side * 0.05, -0.26, 0.02],
        [side * 0.03, -0.54, 0.05]
      ],
      0.068,
      0.048,
      { segments: 20, flutes: 6, fluteDepth: 0.15, ribFreq: 24, ribAmp: 0.08, bulge: 0.15, mat: this.mats.exoChitin }
    );
    shoulderGroup.add(upperArm);

    // 노출된 엔도스켈레톤 상완 유압 로드
    const hydraulic = createSculptedBioLimb(
      [
        [side * -0.03, -0.05, 0.04],
        [side * 0.01, -0.28, 0.08],
        [side * 0.02, -0.5, 0.06]
      ],
      0.02,
      0.016,
      { segments: 12, flutes: 4, ribFreq: 18, ribAmp: 0.1, bulge: 0, mat: this.mats.endoSteel }
    );
    shoulderGroup.add(hydraulic);

    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(side * 0.03, -0.54, 0.05);
    shoulderGroup.add(elbowGroup);

    const elbowBlade = createSculptedBioLimb(
      [
        [0, 0.02, -0.02],
        [0, -0.04, -0.16],
        [0, 0.06, -0.28],
        [0, 0.14, -0.24]
      ],
      0.026,
      0.005,
      { segments: 14, flutes: 4, ribFreq: 12, ribAmp: 0.06, bulge: 0, mat: this.mats.endoSteel }
    );
    elbowGroup.add(elbowBlade);

    const forearmMain = createSculptedBioLimb(
      [
        [0, 0, 0],
        [side * 0.02, -0.28, 0.08],
        [0, -0.56, 0.16]
      ],
      0.052,
      0.034,
      { segments: 20, flutes: 6, fluteDepth: 0.16, ribFreq: 24, ribAmp: 0.08, bulge: 0.14, mat: this.mats.exoChitin }
    );
    elbowGroup.add(forearmMain);

    const forearmEndoRod = createSculptedBioLimb(
      [
        [side * -0.025, -0.02, 0.03],
        [side * -0.02, -0.28, 0.12],
        [0, -0.54, 0.17]
      ],
      0.024,
      0.018,
      { segments: 14, flutes: 4, ribFreq: 18, ribAmp: 0.09, bulge: 0.04, mat: this.mats.endoSteel }
    );
    elbowGroup.add(forearmEndoRod);

    const wristGroup = new THREE.Group();
    wristGroup.position.set(0, -0.56, 0.16);
    elbowGroup.add(wristGroup);

    const clawList = [];
    for (let f = 0; f < 5; f++) {
      const fingerPivot = new THREE.Group();
      if (f === 4) {
        fingerPivot.position.set(side * -0.035, -0.02, 0.04);
      } else {
        const zOff = (f - 1.5) * 0.026;
        const metacarpal = createSculptedBioLimb(
          [[0, 0, 0], [side * 0.01, -0.08, zOff + 0.02]],
          0.013,
          0.011,
          { segments: 6, flutes: 4, ribFreq: 6, ribAmp: 0.05, bulge: 0, mat: this.mats.endoSteel }
        );
        wristGroup.add(metacarpal);
        fingerPivot.position.set(side * 0.01, -0.08, zOff + 0.02);
      }

      const len = f === 1 || f === 2 ? 0.28 : 0.22;
      const clawFinger = createSculptedBioLimb(
        [
          [0, 0, 0],
          [side * 0.02, -len * 0.45, 0.06],
          [side * -0.01, -len * 0.82, 0.03],
          [side * -0.05, -len, -0.02]
        ],
        0.015,
        0.002,
        { segments: 14, flutes: 4, ribFreq: 10, ribAmp: 0.08, bulge: 0, mat: this.mats.exoChromeTeeth }
      );
      fingerPivot.add(clawFinger);
      wristGroup.add(fingerPivot);
      clawList.push(fingerPivot);
    }

    if (side < 0) this.clawsLeft = clawList;
    else this.clawsRight = clawList;

    return { shoulderGroup, elbowGroup, wristGroup };
  }

  buildXenomorphLeg(side) {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(side * 0.19, -0.04, 0);

    const thigh = createSculptedBioLimb(
      [
        [0, 0, 0],
        [side * 0.04, -0.24, 0.14],
        [side * 0.03, -0.48, 0.24]
      ],
      0.1,
      0.065,
      { segments: 22, flutes: 8, fluteDepth: 0.14, ribFreq: 26, ribAmp: 0.08, bulge: 0.18, mat: this.mats.exoChitin }
    );
    hipGroup.add(thigh);

    const thighPiston = createSculptedBioLimb(
      [
        [side * 0.05, -0.04, -0.04],
        [side * 0.07, -0.25, 0.06],
        [side * 0.04, -0.45, 0.18]
      ],
      0.026,
      0.02,
      { segments: 14, flutes: 4, ribFreq: 20, ribAmp: 0.1, bulge: 0, mat: this.mats.endoSteel }
    );
    hipGroup.add(thighPiston);

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(side * 0.03, -0.48, 0.24);
    hipGroup.add(kneeGroup);

    const kneeCap = createSculptedBioLimb(
      [
        [0, -0.05, 0.03],
        [0, 0.02, 0.08],
        [0, 0.09, 0.05]
      ],
      0.04,
      0.015,
      { segments: 10, flutes: 4, ribFreq: 10, ribAmp: 0.1, bulge: 0.1, mat: this.mats.endoSteel }
    );
    kneeGroup.add(kneeCap);

    const shin = createSculptedBioLimb(
      [
        [0, 0, 0],
        [0, -0.22, -0.14],
        [0, -0.45, -0.26]
      ],
      0.065,
      0.044,
      { segments: 22, flutes: 6, fluteDepth: 0.14, ribFreq: 32, ribAmp: 0.1, bulge: 0.12, mat: this.mats.exoChitin }
    );
    kneeGroup.add(shin);

    const calfPiston = createSculptedBioLimb(
      [
        [0, -0.02, -0.05],
        [0, -0.22, -0.2],
        [0, -0.43, -0.3]
      ],
      0.02,
      0.015,
      { segments: 12, flutes: 4, ribFreq: 16, ribAmp: 0.08, bulge: 0, mat: this.mats.endoSteel }
    );
    kneeGroup.add(calfPiston);

    const ankleGroup = new THREE.Group();
    ankleGroup.position.set(0, -0.45, -0.26);
    kneeGroup.add(ankleGroup);

    const footArch = createSculptedBioLimb(
      [
        [0, 0, 0],
        [0, -0.12, 0.06],
        [0, -0.21, 0.16]
      ],
      0.046,
      0.036,
      { segments: 12, flutes: 5, ribFreq: 14, ribAmp: 0.08, bulge: 0.05, mat: this.mats.endoSteel }
    );
    ankleGroup.add(footArch);

    for (let t = -1; t <= 1; t++) {
      const talon = createSculptedBioLimb(
        [
          [t * 0.028, -0.2, 0.15],
          [t * 0.048, -0.22, 0.26],
          [t * 0.06, -0.23, 0.35]
        ],
        0.022,
        0.003,
        { segments: 10, flutes: 4, ribFreq: 10, ribAmp: 0.08, bulge: 0, mat: this.mats.exoChromeTeeth }
      );
      ankleGroup.add(talon);
    }

    const heelSpur = createSculptedBioLimb(
      [
        [0, -0.16, 0.02],
        [0, -0.19, -0.08],
        [0, -0.15, -0.15]
      ],
      0.02,
      0.003,
      { segments: 8, flutes: 4, ribFreq: 6, ribAmp: 0.05, bulge: 0, mat: this.mats.endoSteel }
    );
    ankleGroup.add(heelSpur);

    return { hipGroup, kneeGroup, ankleGroup };
  }

  buildSegmentedWhipTail() {
    const numSegments = 24;
    const segLen = 0.085;
    let parentNode = this.pelvisGroup;

    for (let i = 0; i < numSegments; i++) {
      const t = i / (numSegments - 1);
      const node = new THREE.Group();
      if (i === 0) {
        node.position.set(0, -0.06, -0.12);
      } else {
        node.position.set(0, 0, -segLen);
      }

      const radius = 0.056 * (1 - t * 0.72);

      const segCore = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.88, radius, segLen * 1.05, 10),
        this.mats.exoChitin
      );
      segCore.rotation.x = Math.PI / 2;
      segCore.position.z = -segLen * 0.5;
      segCore.castShadow = true;
      node.add(segCore);

      const spineH = 0.055 * (1 - t * 0.5);
      const dorsalSpine = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.45, spineH, 5),
        this.mats.endoSteel
      );
      dorsalSpine.position.set(0, radius + spineH * 0.35, -segLen * 0.5);
      dorsalSpine.rotation.x = -0.45;
      node.add(dorsalSpine);

      for (let side of [-1, 1]) {
        const latRib = new THREE.Mesh(
          new THREE.ConeGeometry(radius * 0.32, radius * 1.2, 4),
          this.mats.endoSteel
        );
        latRib.position.set(side * (radius * 1.1), 0, -segLen * 0.5);
        latRib.rotation.z = -side * (Math.PI / 2 - 0.25);
        node.add(latRib);
      }

      if (i === numSegments - 1) {
        const stingerBlade = createSculptedBioLimb(
          [
            [0, 0, -segLen],
            [0, 0.04, -segLen - 0.14],
            [0, 0.11, -segLen - 0.28],
            [0, 0.06, -segLen - 0.38]
          ],
          0.028,
          0.002,
          { segments: 14, flutes: 4, fluteDepth: 0.25, ribFreq: 4, ribAmp: 0.02, bulge: 0.15, mat: this.mats.exoChromeTeeth }
        );
        stingerBlade.scale.x = 0.35;
        node.add(stingerBlade);
      }

      parentNode.add(node);
      this.tailNodes.push(node);
      parentNode = node;
    }
  }

  /**
   * 현실적이고 육중한 생체-엔도스켈레톤 물리 애니메이션 & 사운드 연동
   * @param {number} dt 델타 타임
   * @param {string} mode 애니메이션 모드 ('idle', 'stalk', 'chase', 'attack', 'jumpscare')
   * @param {number|null} moveDist 실제 월드에서 이동한 물리적 거리(m) - 발 미끄러짐 방지 1:1 동기화
   */
  update(dt, mode = this.animMode, moveDist = null) {
    // 폭주(chase)나 공격(attack) 전환 시 즉각 괴성 포효음 재생!
    if (mode !== this.lastMode) {
      if (this.enableSound && (mode === 'chase' || mode === 'attack')) {
        sound.playMonsterScreech(this.soundVolume * 1.15);
      }
      if (mode === 'jumpscare') {
        this.jumpscareProgress = 0;
      } else if (this.lastMode === 'jumpscare') {
        this.headGroup.position.set(0, 0.22, 0.18);
        this.pelvisGroup.position.set(0, 1.14, 0);
      }
      this.lastMode = mode;
    }
    this.animMode = mode;

    const speedMult = mode === 'chase' ? 2.6 : mode === 'attack' ? 2.1 : mode === 'stalk' ? 1.18 : 0.75;
    this.time += dt * speedMult;
    const t = this.time;

    // 불규칙 채찍질 임펄스
    this.nextWhipTime -= dt;
    if (this.nextWhipTime <= 0) {
      this.whipImpulse = 1.0;
      this.nextWhipTime = (mode === 'chase' || mode === 'attack') ? (0.6 + Math.random() * 1.2) : (1.5 + Math.random() * 2.8);
    }
    this.whipImpulse = Math.max(0, this.whipImpulse - dt * 2.4);

    // -----------------------------------------------------------------------
    // 1. 흉곽 내부 [심장 코어(Heart Core)] 실제 심장 박동(Lub-Dub) 리듬 & 사운드
    // -----------------------------------------------------------------------
    const beatRate = mode === 'chase' ? 3.2 : mode === 'attack' ? 3.6 : 1.35;
    const beatCycle = (this.time * beatRate) % 1.0;
    const curBeatIdx = Math.floor(this.time * beatRate);
    if (this.enableSound && curBeatIdx !== this.lastBeatIndex) {
      this.lastBeatIndex = curBeatIdx;
      if (mode === 'idle' || mode === 'stalk') {
        sound.playMonsterHeartbeat(this.soundVolume * 0.65);
      }
    }

    // 실제 심장 수축 파형 (두-근! 수축 후 이완)
    const lub = Math.exp(-Math.pow((beatCycle - 0.12) * 14, 2));
    const dub = Math.exp(-Math.pow((beatCycle - 0.28) * 16, 2)) * 0.75;
    const heartPulse = 1.0 + (lub + dub) * (mode === 'chase' || mode === 'attack' ? 0.34 : 0.22);

    if (this.heartMesh) {
      this.heartMesh.scale.setScalar(heartPulse);
    }
    if (this.heartLight) {
      if (mode === 'jumpscare') {
        this.heartLight.color.setHex(0xff0000);
        this.heartLight.intensity = 14.0;
      } else {
        this.heartLight.intensity = 1.6 + (lub + dub) * (mode === 'chase' ? 3.5 : 2.0);
      }
    }
    if (this.faceLight) {
      if (mode === 'jumpscare') {
        this.faceLight.color.setHex(0xffffff);
        this.faceLight.intensity = Math.random() > 0.08 ? 26.0 : 10.0;
      } else {
        this.faceLight.intensity = 0;
      }
    }
    if (this.coreRings.length >= 2) {
      this.coreRings[0].rotation.z += dt * (mode === 'chase' ? 6.5 : 2.2);
      this.coreRings[1].rotation.x -= dt * (mode === 'chase' ? 5.2 : 1.7);
    }

    const breath = Math.sin(t * 2.4) * 0.03 + (lub + dub) * 0.025;
    this.ribcageGroup.scale.set(1 + breath, 1 + breath * 0.4, 1 + breath * 1.1);

    // -----------------------------------------------------------------------
    // 2. 두개골 시선 고정, 엔도스켈레톤 미세 경련(Micro-Twitch), 턱/내턱 모션
    // -----------------------------------------------------------------------
    const headNoiseX = chaoticNoise(t * 1.5, 10.1);
    const headNoiseY = chaoticNoise(t * 1.2, 20.3);
    // 프레디 엔도스켈레톤 특유의 순간적인 고개 꺾임(Snap Glitch)
    const endoGlitch = Math.pow(Math.max(0, chaoticNoise(t * 6.5, 33.7)), 5) * 0.48;

    if (mode === 'jumpscare') {
      this.jumpscareProgress = (this.jumpscareProgress || 0) + dt;
      const jp = this.jumpscareProgress;
      // 0.08초까지 암흑 대기 -> 0.08~0.32초 폭발적 쇄도
      const lunge = THREE.MathUtils.clamp((jp - 0.08) / 0.24, 0, 1);
      const surge = 1 - Math.pow(1 - lunge, 3);

      this.headGroup.position.set(0, 0.22 + surge * 0.16, 0.18 + surge * 0.42);
      this.headGroup.rotation.x = -0.18 + (Math.random() - 0.5) * 0.15;
      this.headGroup.rotation.y = (Math.random() - 0.5) * 0.12;
      this.headGroup.rotation.z = (Math.random() - 0.5) * 0.22; // 격렬한 기계 경련
      this.jawGroup.rotation.x = 0.94 + Math.sin(jp * 32) * 0.18;
      this.innerJaw.position.z = 0.12 + surge * 0.32 + Math.sin(jp * 44) * 0.05;
    } else if (mode === 'attack') {
      const lungeCycle = Math.sin(t * 4.2);
      this.headGroup.rotation.x = -0.25 + lungeCycle * 0.32;
      this.headGroup.rotation.y = headNoiseY * 0.25;
      this.headGroup.rotation.z = endoGlitch;
      this.jawGroup.rotation.x = 0.62 + Math.abs(chaoticNoise(t * 6.0, 5.5)) * 0.28;
      this.innerJaw.position.z = 0.08 + Math.max(0, Math.sin(t * 9.5)) * 0.18;
    } else if (mode === 'chase') {
      // 폭주 시 상체는 앞으로 깊숙이 숙이되, 머리는 사냥감(정면)을 집요하게 노려봄
      this.headGroup.rotation.x = -0.32 + headNoiseX * 0.15;
      this.headGroup.rotation.y = headNoiseY * 0.22;
      this.headGroup.rotation.z = endoGlitch * 0.9;
      this.jawGroup.rotation.x = 0.48 + Math.abs(headNoiseX) * 0.25;
      this.innerJaw.position.z = 0.08 + Math.max(0, Math.sin(t * 7.5)) * 0.14;
    } else {
      this.headGroup.rotation.x = 0.06 + headNoiseX * 0.1;
      this.headGroup.rotation.y = headNoiseY * 0.38;
      this.headGroup.rotation.z = headNoiseX * 0.1 + endoGlitch * 0.75;
      this.jawGroup.rotation.x = 0.12 + Math.max(0, chaoticNoise(t * 2.2, 9.2)) * 0.22;
      this.innerJaw.position.z = 0.06 + (this.whipImpulse > 0.6 ? 0.12 : 0);
    }

    // -----------------------------------------------------------------------
    // 3. 등 뒤의 4가닥 촉수 (비주기 랜덤 채찍질)
    // -----------------------------------------------------------------------
    for (const td of this.tendrils) {
      const nx = chaoticNoise(t * 1.9, td.seedX);
      const ny = chaoticNoise(t * 2.2, td.seedY);
      const nz = chaoticNoise(t * 1.7, td.seedZ);
      const burst = this.whipImpulse * Math.sin(t * 15 + td.seedX) * 0.4;

      td.pivot.rotation.x = nx * 0.48 + burst;
      td.pivot.rotation.y = ny * 0.52;
      td.pivot.rotation.z = td.baseZ + nz * 0.42 + burst * 0.5;
    }

    // -----------------------------------------------------------------------
    // 4. 24마디 칼날 꼬리: 평상시/추격 시 불규칙 파동 vs 공격 시 전갈식 오버헤드 내려찍기!
    // -----------------------------------------------------------------------
    const numTail = this.tailNodes.length;
    for (let i = 0; i < numTail; i++) {
      const ratio = i / numTail;
      const lag = i * 0.22;
      const nYaw = chaoticNoise(t * 1.7 - lag * 0.5, 50.0);
      const nPitch = chaoticNoise(t * 1.4 - lag * 0.45, 80.0);
      const whipSnap = this.whipImpulse * Math.sin(t * 13 - i * 0.35) * (0.16 * ratio);

      if (mode === 'attack') {
        // 전갈(Scorpion)처럼 등 위로 꼬리를 아치형으로 말아 올려 정면으로 칼날을 내리꽂는 공격 모션!
        const strikeWave = Math.sin(t * 4.2);
        const scorpionArc = i < 10 ? 0.16 : i < 18 ? 0.14 : 0.08 + strikeWave * 0.12;
        this.tailNodes[i].rotation.x = scorpionArc + nPitch * 0.05;
        this.tailNodes[i].rotation.y = nYaw * 0.08;
      } else {
        const baseLift = i < 8 ? 0.09 : i < 16 ? 0.03 : -0.05;
        const chaseSwing = mode === 'chase' ? Math.sin(t * 3.8 - i * 0.25) * (0.12 * ratio) : 0;
        this.tailNodes[i].rotation.x = baseLift + nPitch * (0.09 + ratio * 0.12) + whipSnap * 0.6;
        this.tailNodes[i].rotation.y = nYaw * (0.12 + ratio * 0.18) + whipSnap + chaseSwing;
      }
    }

    // -----------------------------------------------------------------------
    // 5. 무게감 있는 보행(Stalk) vs 짐승 같은 폭주 질주(Chase) vs 처형 공격(Attack)
    // - 실제 바닥 이동 거리(moveDist)와 발걸음 위상을 1:1로 물리 동기화(Root-Motion)하여
    //   미끄러짐(스케이트 현상)과 벽에 막혔을 때의 헛발질을 원천 방지합니다.
    // -----------------------------------------------------------------------
    if (mode === 'stalk' || mode === 'chase') {
      const isChase = mode === 'chase';
      const stride = isChase ? 0.84 : 0.52;
      const stepMeters = isChase ? 1.45 : 0.95;

      let isMoving = false;
      if (typeof moveDist === 'number') {
        if (moveDist > 0.0003) {
          isMoving = true;
          this.walkCyclePhase = (this.walkCyclePhase || 0) + (moveDist / stepMeters) * Math.PI;
        }
      } else {
        isMoving = true;
        const fallbackSpeed = isChase ? 7.6 : 3.15;
        this.walkCyclePhase = (this.walkCyclePhase || 0) + (dt * fallbackSpeed / stepMeters) * Math.PI;
      }

      const phaseL = this.walkCyclePhase || 0;
      const phaseR = phaseL + Math.PI;

      // 발이 땅을 딛는 순간(sin(phase)가 정점을 지날 때) 사운드 재생 및 쿵 하는 무게 침하(Impact Drop)
      const stepIdx = Math.floor((phaseL + Math.PI / 2) / Math.PI);
      if (this.enableSound && stepIdx !== this.lastStepIndex && isMoving) {
        this.lastStepIndex = stepIdx;
        sound.playMonsterFootstep(this.soundVolume, isChase);
      }

      // 날카로운 착지 충격 곡선 (둥둥 떠다니는 사인파 대신 쿵 찍히는 중량감)
      const impactWave = isMoving ? Math.pow(Math.abs(Math.sin(phaseL)), 1.8) : 0;
      const dropY = isChase ? 0.15 : 0.075;
      this.pelvisGroup.position.y = (isChase ? 1.06 : 1.15) - impactWave * dropY;
      this.pelvisGroup.rotation.z = isMoving ? Math.sin(phaseL) * (isChase ? 0.13 : 0.075) : 0;
      this.pelvisGroup.rotation.y = isMoving ? Math.sin(phaseL) * (isChase ? 0.16 : 0.09) : 0;

      // 폭주 추격(Chase) 시 상체를 거의 수평에 가깝게 앞으로 숙이고 척추를 꿈틀거리며 질주!
      this.thoraxGroup.rotation.x = isChase
        ? 0.52 + (isMoving ? Math.sin(phaseL * 2) * 0.12 : 0)
        : 0.18 + (isMoving ? Math.sin(phaseL * 2) * 0.04 : 0);
      this.thoraxGroup.rotation.y = isMoving ? -Math.sin(phaseL) * (isChase ? 0.24 : 0.12) : 0;
      this.thoraxGroup.rotation.z = isMoving ? -Math.sin(phaseL) * (isChase ? 0.1 : 0.04) : 0;

      this.animateWeightedLeg(this.leftLeg, phaseL, stride, isChase, isMoving);
      this.animateWeightedLeg(this.rightLeg, phaseR, stride, isChase, isMoving);

      if (isChase) {
        // 폭주 질주 시 양팔을 앞으로 크게 뻗어 바닥을 할퀴듯 휘젓는 광폭한 모션
        this.leftArm.shoulderGroup.rotation.x = -0.85 + (isMoving ? Math.sin(phaseR) * 0.78 : 0);
        this.leftArm.shoulderGroup.rotation.z = -0.25 - (isMoving ? Math.max(0, Math.cos(phaseR)) * 0.2 : 0);
        this.leftArm.elbowGroup.rotation.x = -0.45 + (isMoving ? Math.sin(phaseR - 0.6) * 0.45 : 0);

        this.rightArm.shoulderGroup.rotation.x = -0.85 + (isMoving ? Math.sin(phaseL) * 0.78 : 0);
        this.rightArm.shoulderGroup.rotation.z = 0.25 + (isMoving ? Math.max(0, Math.cos(phaseL)) * 0.2 : 0);
        this.rightArm.elbowGroup.rotation.x = -0.45 + (isMoving ? Math.sin(phaseL - 0.6) * 0.45 : 0);
      } else {
        // 순찰 보행 시 손끝을 늘어뜨린 채 묵직하게 흔들림
        this.leftArm.shoulderGroup.rotation.x = -0.28 + (isMoving ? Math.sin(phaseR) * 0.34 : 0);
        this.leftArm.shoulderGroup.rotation.z = -0.15;
        this.leftArm.elbowGroup.rotation.x = -0.58 + (isMoving ? Math.cos(phaseR) * 0.18 : 0);

        this.rightArm.shoulderGroup.rotation.x = -0.28 + (isMoving ? Math.sin(phaseL) * 0.34 : 0);
        this.rightArm.shoulderGroup.rotation.z = 0.15;
        this.rightArm.elbowGroup.rotation.x = -0.58 + (isMoving ? Math.cos(phaseL) * 0.18 : 0);
      }
    } else if (mode === 'jumpscare') {
      // 점프스케어 모션: 어둠 속에서 상체와 거대한 발톱이 플레이어의 화면 전체를 덮침!
      const jp = this.jumpscareProgress || 0;
      const lunge = THREE.MathUtils.clamp((jp - 0.08) / 0.24, 0, 1);
      const surge = 1 - Math.pow(1 - lunge, 3);

      this.pelvisGroup.position.set(0, 1.14 + surge * 0.16, surge * 0.42);
      this.thoraxGroup.rotation.x = 0.22 + surge * 0.36;
      this.thoraxGroup.rotation.y = (Math.random() - 0.5) * 0.1;

      // 양손 발톱이 카메라 좌우에서 플레이어의 목을 조르듯 뻗어나옴
      this.leftArm.shoulderGroup.rotation.x = -1.68;
      this.leftArm.shoulderGroup.rotation.y = 0.52;
      this.leftArm.shoulderGroup.rotation.z = -0.58 + Math.sin(jp * 32) * 0.12;
      this.leftArm.elbowGroup.rotation.x = -0.74;

      this.rightArm.shoulderGroup.rotation.x = -1.68;
      this.rightArm.shoulderGroup.rotation.y = -0.52;
      this.rightArm.shoulderGroup.rotation.z = 0.58 - Math.sin(jp * 32) * 0.12;
      this.rightArm.elbowGroup.rotation.x = -0.74;

      for (let i = 0; i < this.tailNodes.length; i++) {
        this.tailNodes[i].rotation.x = 0.22 + Math.sin(jp * 18 + i * 0.2) * 0.04;
        this.tailNodes[i].rotation.y = (Math.random() - 0.5) * 0.04;
      }
    } else if (mode === 'attack') {
      // 공격: 상체를 뒤로 젖혀 포효한 뒤 앞으로 급격히 덮치며 양손 발톱으로 찢어발기는 모션
      const cycle = t * 4.2;
      const lunge = Math.sin(cycle);
      this.pelvisGroup.position.y = 1.14 + lunge * 0.08;
      this.pelvisGroup.position.z = Math.max(0, lunge) * 0.18;
      this.thoraxGroup.rotation.x = 0.15 + lunge * 0.38;
      this.thoraxGroup.rotation.y = Math.cos(cycle) * 0.28;

      this.leftArm.shoulderGroup.rotation.x = -1.45 + Math.sin(cycle + 0.4) * 0.95;
      this.leftArm.shoulderGroup.rotation.z = -0.48 + lunge * 0.35;
      this.leftArm.elbowGroup.rotation.x = -0.35 + Math.cos(cycle) * 0.4;

      this.rightArm.shoulderGroup.rotation.x = -1.45 - Math.sin(cycle + 0.4) * 0.95;
      this.rightArm.shoulderGroup.rotation.z = 0.48 - lunge * 0.35;
      this.rightArm.elbowGroup.rotation.x = -0.35 - Math.cos(cycle) * 0.4;

      this.animateWeightedLeg(this.leftLeg, 0.3, 0.22, false);
      this.animateWeightedLeg(this.rightLeg, Math.PI + 0.3, 0.22, false);
    } else {
      // 대기(Idle): 낮게 도사린 채 흉곽을 들썩이며 경련하는 모션
      this.pelvisGroup.position.y = 1.14 + Math.sin(t * 2.0) * 0.025;
      this.pelvisGroup.position.z = 0;
      this.pelvisGroup.rotation.z = chaoticNoise(t * 0.8, 3.3) * 0.04;
      this.pelvisGroup.rotation.y = 0;
      this.thoraxGroup.rotation.x = 0.16 + Math.sin(t * 2.0) * 0.04;
      this.thoraxGroup.rotation.y = chaoticNoise(t * 0.7, 6.6) * 0.12;
      this.thoraxGroup.rotation.z = 0;

      this.leftArm.shoulderGroup.rotation.x = -0.25 + chaoticNoise(t * 1.3, 2.1) * 0.1;
      this.leftArm.shoulderGroup.rotation.z = -0.14;
      this.leftArm.elbowGroup.rotation.x = -0.52 + chaoticNoise(t * 1.5, 5.1) * 0.08;

      this.rightArm.shoulderGroup.rotation.x = -0.22 + chaoticNoise(t * 1.4, 8.1) * 0.1;
      this.rightArm.shoulderGroup.rotation.z = 0.14;
      this.rightArm.elbowGroup.rotation.x = -0.5 + chaoticNoise(t * 1.6, 9.1) * 0.08;

      this.animateWeightedLeg(this.leftLeg, 0, 0.04, false);
      this.animateWeightedLeg(this.rightLeg, Math.PI, 0.04, false);
    }

    // 6. 손가락 갈퀴 개별 꿈틀거림
    for (let i = 0; i < this.clawsLeft.length; i++) {
      const curlL = 0.2 + chaoticNoise(t * 3.0, i * 1.7) * 0.28;
      const curlR = 0.2 + chaoticNoise(t * 3.0, i * 2.3 + 5) * 0.28;
      this.clawsLeft[i].rotation.x = curlL;
      this.clawsRight[i].rotation.x = curlR;
    }
  }

  /**
   * 비대칭 보행 궤적: 다리를 들어 올릴 때는 빠르게 무릎을 굽히고,
   * 땅을 딛고 밀어낼 때는 강하게 뻗는 현실적인 역관절 보행 곡선.
   * 이동이 멈추었을 때는 바닥에 단단히 발을 디딘 대기 자세를 취합니다.
   */
  animateWeightedLeg(leg, phase, stride, isChase, isMoving = true) {
    if (!isMoving) {
      leg.hipGroup.rotation.x = 0;
      leg.kneeGroup.rotation.x = isChase ? 0.22 : 0.12;
      leg.ankleGroup.rotation.x = isChase ? -0.14 : -0.08;
      return;
    }

    const swing = Math.sin(phase);
    const lift = Math.max(0, Math.cos(phase));
    const kneeFlex = Math.pow(lift, 1.3) * (isChase ? 1.15 : 0.92);

    leg.hipGroup.rotation.x = -swing * stride;
    leg.kneeGroup.rotation.x = kneeFlex * stride;
    leg.ankleGroup.rotation.x = -kneeFlex * stride * 0.65 + swing * 0.18;
  }
}

// ============================================================================
// 1-B. 제2장 전용 수로 괴물 모델: [심해 수로 악어형 생체기계 크롤러 (Bio-Mechanical Sewer Crocodile Crawler)]
// - 침수된 원통형 하수관(수면 Y=0.56m) 내부에서만 서식하는 수중 매복 포식자.
// ============================================================================
// 1-B. 제2장(침수 수로) 삼두 괴수 #1: [스토커 악어 / 더 리퍼 (CrawlerCrocodileEntity)]
// - FNAF 4 나이트메어 프레디(Nightmare Freddy) + 팩맨 블링키(Blinky) 포지션의 주력 처형 포식자입니다.
// - 반쯤 뜯겨나간 부식 외피 사이로 노출된 엔도스켈레톤 척추와 늑골, 수면 위로 솟은 녹슨 철근(Rebar) 가시와
//   철조망 링, 깊게 파인 암흑 안와 속에서 번뜩이는 나이트메어 붉은 링 안구, 추격/공격 시 좌·우·하단 3갈래로
//   기괴하게 쪼개지는 분할 하악(Tri-Split Mandible)과 이중 바늘 치열, 구강 내부의 제2 엔도스켈레톤 내턱을 갖춥니다.
// ============================================================================
export class CrawlerCrocodileEntity {
  constructor() {
    this.mats = getMaterials();
    this.root = new THREE.Group();
    this.time = Math.random() * 10;
    this.animMode = 'stalk';
    this.lastMode = 'stalk';

    this.enableSound = false;
    this.soundVolume = 0.25;
    this.walkCyclePhase = 0;
    this.lastStepIndex = -1;
    this.lastBeatIndex = -1;
    this.jumpscareProgress = 0;

    this.tailNodes = [];
    this.dorsalScutes = [];
    this.coreRings = [];
    this.nightmareEyes = [];

    this.buildCrocodileAnatomy();
  }

  buildCrocodileAnatomy() {
    // 1. 수중 잠복 중심 몸통 (수면 Y=0.56m 기준 등줄기 철근 가시와 나이트메어 안구가 수면 위로 드러나도록 Y=0.40m 배치)
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.set(0, 0.40, 0);
    this.root.add(this.bodyGroup);

    // 뜯겨나간 외피 아래로 노출된 내부 엔도스켈레톤 강철 척추 기둥
    const endoSpine = createSculptedBioLimb(
      [
        [0, 0.05, -0.72],
        [0, 0.09, -0.25],
        [0, 0.11, 0.15],
        [0, 0.07, 0.68]
      ],
      0.11,
      0.09,
      {
        segments: 24,
        radialSegs: 10,
        flutes: 6,
        fluteDepth: 0.18,
        ribFreq: 32,
        ribAmp: 0.14,
        bulge: 0.08,
        mat: this.mats.endoSteel
      }
    );
    this.bodyGroup.add(endoSpine);

    // 비대칭으로 찢어지고 파손된 나이트메어 외골격 갑피 (전후 길이 약 1.38m)
    const torsoCore = createSculptedBioLimb(
      [
        [0, -0.02, -0.68],
        [0, 0.02, -0.32],
        [0, 0.04, 0.08],
        [0, 0.03, 0.42],
        [0, 0.01, 0.66]
      ],
      0.24,
      0.19,
      {
        segments: 28,
        radialSegs: 14,
        flutes: 8,
        fluteDepth: 0.16,
        ribFreq: 22,
        ribAmp: 0.10,
        bulge: 0.22,
        mat: this.mats.exoChitin
      }
    );
    torsoCore.scale.set(1.42, 0.64, 1.0);
    this.bodyGroup.add(torsoCore);

    // 등 상부 파손된 장갑판 조각들 (중간중간 틈새로 내부 기계 척추 노출)
    for (let p = 0; p < 4; p++) {
      const zCenter = -0.48 + p * 0.32;
      const armorShard = new THREE.Mesh(
        new THREE.BoxGeometry(0.38 - p * 0.02, 0.055, 0.21),
        p % 2 === 0 ? this.mats.exoCarapaceDome : this.mats.rustedRebar
      );
      armorShard.position.set((p % 2 === 0 ? 1 : -1) * 0.02, 0.135, zCenter);
      armorShard.rotation.set(-0.08, (p - 1.5) * 0.08, (p % 2 === 0 ? 1 : -1) * 0.09);
      this.bodyGroup.add(armorShard);
    }

    // 옆구리를 감싸는 노출형 엔도스켈레톤 강철 늑골 프레임 & 얽힌 고압 전선 (좌우 6쌍)
    for (let side of [-1, 1]) {
      for (let r = 0; r < 6; r++) {
        const zPos = -0.46 + r * 0.18;
        const spread = 0.30 + Math.sin((r / 5) * Math.PI) * 0.09;
        const rib = createSculptedBioLimb(
          [
            [side * 0.08, 0.14, zPos],
            [side * spread, 0.03, zPos + 0.03],
            [side * (spread * 0.78), -0.11, zPos + 0.01]
          ],
          0.026,
          0.014,
          { segments: 10, flutes: 4, ribFreq: 14, ribAmp: 0.09, mat: this.mats.endoSteel }
        );
        this.bodyGroup.add(rib);
      }
    }

    // 등 중앙에 매립된 생체 반응로 코어 (수면 위에서 불길하게 맥동)
    this.heartGroup = new THREE.Group();
    this.heartGroup.position.set(0, 0.18, 0.04);
    this.bodyGroup.add(this.heartGroup);

    const coreGeo = new THREE.OctahedronGeometry(0.088, 1);
    this.heartMesh = new THREE.Mesh(coreGeo, this.mats.heartCoreMat);
    this.heartMesh.scale.set(0.88, 0.58, 1.65);
    this.heartGroup.add(this.heartMesh);

    for (let rIdx = 0; rIdx < 2; rIdx++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.098 + rIdx * 0.02, 0.009, 6, 16),
        this.mats.endoSteel
      );
      ring.rotation.x = Math.PI / 2;
      this.heartGroup.add(ring);
      this.coreRings.push(ring);
    }

    this.heartLight = new THREE.PointLight(0xdbe8ff, 1.8, 3.2, 1.8);
    this.heartLight.position.set(0, 0.12, 0);
    this.heartGroup.add(this.heartLight);

    // 수면(Y=0.56m) 위로 날카롭게 솟아오른 나이트메어 녹슨 철근(Rebar) 등가시 & 철조망 코일
    for (let i = 0; i < 7; i++) {
      const zPos = 0.54 - i * 0.18;
      const scuteH = 0.22 + Math.sin((i / 6) * Math.PI) * 0.10;
      const centerScute = new THREE.Mesh(
        new THREE.ConeGeometry(0.052, scuteH, 4),
        this.mats.endoSteel
      );
      centerScute.position.set(0, 0.16 + scuteH * 0.45, zPos);
      centerScute.rotation.x = -0.35;
      centerScute.rotation.y = Math.PI / 4;
      this.bodyGroup.add(centerScute);
      this.dorsalScutes.push(centerScute);

      // 등가시를 휘감는 날카로운 철조망 링 & 삐죽 튀어나온 녹슨 철근 핀
      const wireLoop = new THREE.Mesh(
        new THREE.TorusGeometry(0.052, 0.005, 5, 10),
        this.mats.exoChromeTeeth
      );
      wireLoop.position.set(0, 0.17 + scuteH * 0.3, zPos);
      wireLoop.rotation.set(0.5 + i * 0.3, i * 0.4, 0.3);
      this.bodyGroup.add(wireLoop);

      // 좌우 비대칭 철근/칼날 돌기
      for (let side of [-1, 1]) {
        const rebarSpike = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.022, scuteH * 0.85, 5),
          this.mats.rustedRebar
        );
        rebarSpike.position.set(side * 0.165, 0.14 + scuteH * 0.32, zPos - 0.02);
        rebarSpike.rotation.x = -0.28 + (i % 2) * 0.14;
        rebarSpike.rotation.z = -side * (0.38 + (i % 3) * 0.08);
        this.bodyGroup.add(rebarSpike);
      }
    }

    // 2. 목(Neck) & 나이트메어 악어 두개골(HeadGroup) + 3분할 크래셔 하악(JawGroup)
    this.neckGroup = new THREE.Group();
    this.neckGroup.position.set(0, 0.06, 0.64);
    this.bodyGroup.add(this.neckGroup);

    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.04, 0.06);
    this.neckGroup.add(this.headGroup);

    // 2-1. 상악 두개골 및 흉측하게 갈라진 악어 주둥이 (Snout, 길이 0.84m)
    const upperSnout = createSculptedBioLimb(
      [
        [0, 0.06, -0.06],
        [0, 0.07, 0.18],
        [0, 0.04, 0.48],
        [0, 0.03, 0.74],
        [0, 0.01, 0.86]
      ],
      0.172,
      0.098,
      {
        segments: 24,
        radialSegs: 14,
        flutes: 8,
        fluteDepth: 0.14,
        ribFreq: 24,
        ribAmp: 0.09,
        bulge: 0.09,
        mat: this.mats.exoChitin
      }
    );
    upperSnout.scale.set(1.28, 0.52, 1.0);
    this.headGroup.add(upperSnout);

    // 주둥이 상단 노출된 엔도스켈레톤 강철 브릿지 & 피스톤 레일
    const snoutBridge = createSculptedBioLimb(
      [
        [0, 0.13, 0.02],
        [0, 0.11, 0.38],
        [0, 0.085, 0.76]
      ],
      0.09,
      0.068,
      { segments: 14, flutes: 4, ribFreq: 18, ribAmp: 0.10, mat: this.mats.endoSteel }
    );
    snoutBridge.scale.set(1.12, 0.46, 1.0);
    this.headGroup.add(snoutBridge);

    // FNAF 나이트메어 특유의 깊게 파인 암흑 안와(Hollow Eye Socket) + 붉은 발광 링 + 백색 핀포인트 동공
    for (let side of [-1, 1]) {
      const eyeTurret = new THREE.Mesh(
        new THREE.BoxGeometry(0.088, 0.082, 0.145),
        this.mats.exoCarapaceDome
      );
      eyeTurret.position.set(side * 0.112, 0.142, 0.12);
      eyeTurret.rotation.y = side * 0.16;
      this.headGroup.add(eyeTurret);

      // 안와 주변을 감싸는 톱니형 강철 가드
      const browSpike = new THREE.Mesh(
        new THREE.ConeGeometry(0.024, 0.075, 4),
        this.mats.endoSteel
      );
      browSpike.position.set(side * 0.125, 0.19, 0.10);
      browSpike.rotation.set(-0.3, 0, -side * 0.35);
      this.headGroup.add(browSpike);

      const eyeNode = new THREE.Group();
      eyeNode.position.set(side * 0.118, 0.145, 0.188);
      eyeNode.rotation.y = side * 0.18;
      this.headGroup.add(eyeNode);

      // 붉은 나이트메어 홍채 링
      const irisRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.022, 0.0055, 6, 14),
        this.mats.nightmareEyeRing
      );
      eyeNode.add(irisRing);

      // 중앙 백색 핀포인트 동공
      const pinPupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.0085, 6, 6),
        this.mats.nightmarePupil
      );
      pinPupil.position.z = 0.004;
      eyeNode.add(pinPupil);

      this.nightmareEyes.push(eyeNode);
    }

    // 점프스케어 시 주둥이 정면을 비추는 강렬한 라이트 (평상시 0)
    this.faceLight = new THREE.PointLight(0xffeedd, 0, 5.5, 1.4);
    this.faceLight.position.set(0, 0.08, 0.92);
    this.headGroup.add(this.faceLight);

    // 상악 2중 바늘 치열 (외열 24개 거대 칼날 송곳니 + 내열 18개 바늘 이빨 = 상악만 42개!)
    for (let side of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const tz = 0.12 + t * 0.68;
        const widthAtZ = (0.152 - t * 0.055) * (i % 3 === 1 ? 1.07 : 0.96);
        const isBigFang = (i === 1 || i === 4 || i === 7 || i === 10);
        const toothLen = isBigFang ? 0.085 : 0.056;
        const toothRad = isBigFang ? 0.013 : 0.0085;

        const tooth = new THREE.Mesh(
          new THREE.ConeGeometry(toothRad, toothLen, 5),
          this.mats.exoChromeTeeth
        );
        tooth.position.set(side * widthAtZ, -0.025 - toothLen * 0.38, tz);
        tooth.rotation.x = Math.PI - 0.06;
        tooth.rotation.z = -side * 0.14;
        this.headGroup.add(tooth);

        // 내측 제2열 바늘 송곳니 (FNAF Nightmare 이중 치열)
        if (i < 9) {
          const innerTooth = new THREE.Mesh(
            new THREE.ConeGeometry(0.0065, 0.048, 4),
            this.mats.exoChromeTeeth
          );
          innerTooth.position.set(side * (widthAtZ * 0.68), -0.02 - 0.02, tz + 0.03);
          innerTooth.rotation.x = Math.PI - 0.12;
          innerTooth.rotation.z = side * 0.08;
          this.headGroup.add(innerTooth);
        }
      }
    }

    // 2-2. 3갈래 분할 나이트메어 하악 (Tri-Split Lower Mandible: 중앙 프레임 + 좌/우 분할 턱)
    this.jawGroup = new THREE.Group();
    this.jawGroup.position.set(0, -0.03, 0.02);
    this.headGroup.add(this.jawGroup);

    // 중앙 엔도스켈레톤 하악 코어 레일
    const centerMandible = createSculptedBioLimb(
      [
        [0, -0.02, 0.0],
        [0, -0.045, 0.30],
        [0, -0.035, 0.68]
      ],
      0.065,
      0.042,
      { segments: 14, flutes: 4, ribFreq: 18, ribAmp: 0.08, mat: this.mats.endoSteel }
    );
    this.jawGroup.add(centerMandible);

    // 좌/우로 쩍 벌어지는 분할 하악 (Split Mandibles)
    this.jawLeftGroup = new THREE.Group();
    this.jawRightGroup = new THREE.Group();
    this.jawGroup.add(this.jawLeftGroup);
    this.jawGroup.add(this.jawRightGroup);

    for (let side of [-1, 1]) {
      const targetSplitGroup = side < 0 ? this.jawLeftGroup : this.jawRightGroup;

      const splitJawBranch = createSculptedBioLimb(
        [
          [side * 0.06, -0.015, 0.02],
          [side * 0.115, -0.035, 0.32],
          [side * 0.088, -0.025, 0.62],
          [side * 0.045, -0.01, 0.80]
        ],
        0.072,
        0.046,
        {
          segments: 18,
          radialSegs: 10,
          flutes: 5,
          fluteDepth: 0.12,
          ribFreq: 18,
          ribAmp: 0.08,
          bulge: 0.08,
          mat: this.mats.exoChitin
        }
      );
      targetSplitGroup.add(splitJawBranch);

      // 하악 좌우 유압 피스톤 실린더
      const jawPiston = createSculptedBioLimb(
        [
          [side * 0.135, 0.065, 0.04],
          [side * 0.125, -0.03, 0.24]
        ],
        0.019,
        0.014,
        { segments: 8, flutes: 4, ribFreq: 10, ribAmp: 0.06, mat: this.mats.exoChromeTeeth }
      );
      targetSplitGroup.add(jawPiston);

      // 분할 하악 2중 크롬 바늘 송곳니 배열 (좌우 각 18개 = 총 36개)
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        const tz = 0.13 + t * 0.64;
        const widthAtZ = 0.132 - t * 0.052;
        const isBigFang = (i === 0 || i === 3 || i === 6 || i === 9);
        const toothLen = isBigFang ? 0.076 : 0.048;
        const toothRad = isBigFang ? 0.012 : 0.008;

        const tooth = new THREE.Mesh(
          new THREE.ConeGeometry(toothRad, toothLen, 5),
          this.mats.exoChromeTeeth
        );
        tooth.position.set(side * widthAtZ, 0.012 + toothLen * 0.36, tz);
        tooth.rotation.x = 0.12;
        tooth.rotation.z = side * 0.14;
        targetSplitGroup.add(tooth);

        if (i < 7) {
          const innerFang = new THREE.Mesh(
            new THREE.ConeGeometry(0.006, 0.042, 4),
            this.mats.exoChromeTeeth
          );
          innerFang.position.set(side * (widthAtZ * 0.65), 0.01 + 0.018, tz + 0.02);
          innerFang.rotation.x = 0.18;
          innerFang.rotation.z = -side * 0.12;
          targetSplitGroup.add(innerFang);
        }
      }
    }

    // 구강 내부에서 뻗어나오는 나이트메어 제2 엔도스켈레톤 해골 내턱 & 회전 작살 (Inner Nightmare Endo-Skull Jaw)
    this.innerJaw = new THREE.Group();
    this.innerJaw.position.set(0, 0.01, 0.12);
    this.headGroup.add(this.innerJaw);

    const harpoonRod = createSculptedBioLimb(
      [[0, 0, 0], [0, 0, 0.46]],
      0.032,
      0.024,
      { segments: 10, flutes: 6, ribFreq: 18, ribAmp: 0.12, mat: this.mats.endoSteel }
    );
    this.innerJaw.add(harpoonRod);

    // 내턱 끝에 달린 소형 엔도스켈레톤 금속 아가리와 6개의 갈고리 이빨
    const innerSkullRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.038, 0.009, 6, 12),
      this.mats.endoSteel
    );
    innerSkullRing.position.z = 0.44;
    this.innerJaw.add(innerSkullRing);

    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const barb = new THREE.Mesh(
        new THREE.ConeGeometry(0.011, 0.058, 5),
        this.mats.exoChromeTeeth
      );
      barb.position.set(Math.cos(ang) * 0.034, Math.sin(ang) * 0.034, 0.47);
      barb.rotation.x = Math.PI / 2;
      this.innerJaw.add(barb);
    }

    // 3. 양옆으로 넓게 뻗은 4개의 파충류 물갈퀴 관절 다리 (전방 2, 후방 2)
    this.frontLeftLeg = this.buildCrocLimb(-1, 0.38, true);
    this.frontRightLeg = this.buildCrocLimb(1, 0.38, true);
    this.rearLeftLeg = this.buildCrocLimb(-1, -0.42, false);
    this.rearRightLeg = this.buildCrocLimb(1, -0.42, false);
    this.bodyGroup.add(this.frontLeftLeg.hipGroup);
    this.bodyGroup.add(this.frontRightLeg.hipGroup);
    this.bodyGroup.add(this.rearLeftLeg.hipGroup);
    this.bodyGroup.add(this.rearRightLeg.hipGroup);

    // 4. 14마디 편평 수중 추진 꼬리 (Segmented Crocodilian Paddle Tail)
    this.buildCrocodilePaddleTail();
  }

  buildCrocLimb(side, zOffset, isFront) {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(side * 0.28, -0.02, zOffset);

    // 양옆으로 넓게 벌어져 뻗는 파충류 상완/대퇴골 + 노출된 강철 피스톤
    const upperLimb = createSculptedBioLimb(
      [
        [0, 0, 0],
        [side * 0.14, -0.06, isFront ? 0.04 : -0.04],
        [side * 0.24, -0.14, isFront ? 0.06 : -0.06]
      ],
      isFront ? 0.068 : 0.078,
      0.052,
      { segments: 14, flutes: 6, ribFreq: 16, ribAmp: 0.08, bulge: 0.14, mat: this.mats.exoChitin }
    );
    hipGroup.add(upperLimb);

    // 관절 부위 튀어나온 녹슨 철근 스파이크
    const jointSpike = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.09, 4),
      this.mats.rustedRebar
    );
    jointSpike.position.set(side * 0.22, -0.08, isFront ? 0.05 : -0.05);
    jointSpike.rotation.z = -side * 0.85;
    hipGroup.add(jointSpike);

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(side * 0.24, -0.14, isFront ? 0.06 : -0.06);
    hipGroup.add(kneeGroup);

    // 바닥을 짚고 물살을 밀어내는 하완/정강이
    const lowerLimb = createSculptedBioLimb(
      [
        [0, 0, 0],
        [side * 0.04, -0.12, 0.03],
        [side * 0.05, -0.22, 0.06]
      ],
      0.052,
      0.038,
      { segments: 12, flutes: 5, ribFreq: 14, ribAmp: 0.08, bulge: 0.08, mat: this.mats.endoSteel }
    );
    kneeGroup.add(lowerLimb);

    const ankleGroup = new THREE.Group();
    ankleGroup.position.set(side * 0.05, -0.22, 0.06);
    kneeGroup.add(ankleGroup);

    // 4개의 거대하고 날카로운 크롬 갈퀴 발톱
    for (let c = -1.5; c <= 1.5; c += 1.0) {
      const claw = createSculptedBioLimb(
        [
          [c * 0.024, 0, 0],
          [c * 0.038, -0.02, 0.10],
          [c * 0.048, -0.035, 0.19]
        ],
        0.018,
        0.003,
        { segments: 8, flutes: 4, ribFreq: 8, ribAmp: 0.05, mat: this.mats.exoChromeTeeth }
      );
      ankleGroup.add(claw);
    }

    return { hipGroup, kneeGroup, ankleGroup, side, isFront };
  }

  buildCrocodilePaddleTail() {
    const numSegments = 14;
    const segLen = 0.115;
    let parentNode = this.bodyGroup;

    for (let i = 0; i < numSegments; i++) {
      const t = i / (numSegments - 1);
      const node = new THREE.Group();
      if (i === 0) {
        node.position.set(0, 0.0, -0.68);
      } else {
        node.position.set(0, 0, -segLen);
      }

      const radius = 0.135 * (1 - t * 0.78);
      const segCore = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.86, radius, segLen * 1.08, 10),
        i % 2 === 0 ? this.mats.exoChitin : this.mats.endoSteel
      );
      segCore.rotation.x = Math.PI / 2;
      segCore.position.z = -segLen * 0.5;
      segCore.scale.set(0.68, 1.24, 1.0);
      segCore.castShadow = true;
      node.add(segCore);

      // 수면 위로 솟아오르는 꼬리 상단 삼각 톱니 골판 (Tail Scute Fin)
      const scuteH = 0.15 * (1 - t * 0.52);
      const tailScute = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.44, scuteH, 4),
        this.mats.exoChromeTeeth
      );
      tailScute.position.set(0, radius * 1.15 + scuteH * 0.35, -segLen * 0.5);
      tailScute.rotation.x = -0.35;
      tailScute.rotation.y = Math.PI / 4;
      node.add(tailScute);

      parentNode.add(node);
      this.tailNodes.push(node);
      parentNode = node;
    }
  }

  update(dt, mode = this.animMode, moveDist = null) {
    if (mode !== this.lastMode) {
      if (this.enableSound && (mode === 'chase' || mode === 'attack')) {
        sound.playCrawlerScreech(this.soundVolume * 1.15);
      }
      if (mode === 'jumpscare') {
        this.jumpscareProgress = 0;
      } else if (this.lastMode === 'jumpscare') {
        this.bodyGroup.position.set(0, 0.40, 0);
        this.bodyGroup.rotation.set(0, 0, 0);
        this.headGroup.position.set(0, 0.04, 0.06);
      }
      this.lastMode = mode;
    }
    this.animMode = mode;

    const speedMult = mode === 'chase' ? 2.6 : mode === 'attack' ? 2.1 : mode === 'stalk' ? 1.25 : 0.75;
    this.time += dt * speedMult;
    const t = this.time;

    // 1. 등 코어 및 나이트메어 안구 떨림 업데이트
    const beatRate = mode === 'chase' ? 3.2 : mode === 'attack' ? 3.5 : 1.35;
    const beatCycle = (this.time * beatRate) % 1.0;
    const curBeatIdx = Math.floor(this.time * beatRate);
    if (this.enableSound && curBeatIdx !== this.lastBeatIndex) {
      this.lastBeatIndex = curBeatIdx;
      if (mode === 'idle' || mode === 'stalk') {
        sound.playCrawlerGrowl(this.soundVolume * 0.7);
      }
    }

    const lub = Math.exp(-Math.pow((beatCycle - 0.12) * 14, 2));
    const dub = Math.exp(-Math.pow((beatCycle - 0.28) * 16, 2)) * 0.75;
    const heartPulse = 1.0 + (lub + dub) * (mode === 'chase' || mode === 'attack' ? 0.35 : 0.22);

    if (this.heartMesh) {
      this.heartMesh.scale.set(0.85 * heartPulse, 0.55 * heartPulse, 1.65 * heartPulse);
    }
    if (this.heartLight) {
      if (mode === 'jumpscare') {
        this.heartLight.color.setHex(0xff0000);
        this.heartLight.intensity = 12.0;
      } else {
        this.heartLight.intensity = 1.5 + (lub + dub) * (mode === 'chase' ? 3.2 : 1.8);
      }
    }
    if (this.faceLight) {
      if (mode === 'jumpscare') {
        this.faceLight.color.setHex(0xffffff);
        this.faceLight.intensity = Math.random() > 0.08 ? 24.0 : 10.0;
      } else {
        this.faceLight.intensity = 0;
      }
    }
    if (this.coreRings.length >= 2) {
      this.coreRings[0].rotation.z += dt * (mode === 'chase' ? 6.0 : 2.0);
      this.coreRings[1].rotation.z -= dt * (mode === 'chase' ? 4.8 : 1.6);
    }

    // 나이트메어 안구 고주파 마이크로 트위칭
    for (let eIdx = 0; eIdx < this.nightmareEyes.length; eIdx++) {
      const eye = this.nightmareEyes[eIdx];
      const jitter = mode === 'chase' || mode === 'attack' || mode === 'jumpscare' ? 0.12 : 0.04;
      eye.rotation.x = (Math.random() - 0.5) * jitter;
      eye.rotation.z += dt * 8.0 * (eIdx === 0 ? 1 : -1);
    }

    // 2. 모드별 3분할 하악(Tri-Split Jaw) 개폐, S자 수중 유영 파동 & 4족 보행 애니메이션
    if (mode === 'jumpscare') {
      this.jumpscareProgress = (this.jumpscareProgress || 0) + dt;
      const jp = this.jumpscareProgress;
      const lunge = THREE.MathUtils.clamp((jp - 0.06) / 0.22, 0, 1);
      const surge = 1 - Math.pow(1 - lunge, 3);

      // 수면 아래에서 카메라 정면을 향해 상체를 우악스럽게 쳐들며 덮침!
      this.bodyGroup.position.set(0, 0.44 + surge * 0.62, surge * 0.36);
      this.bodyGroup.rotation.x = -0.34 * surge;
      this.bodyGroup.rotation.y = (Math.random() - 0.5) * 0.10;

      this.headGroup.position.set(0, 0.06 + surge * 0.14, 0.08 + surge * 0.26);
      this.headGroup.rotation.x = -0.18 + (Math.random() - 0.5) * 0.12;
      this.headGroup.rotation.y = (Math.random() - 0.5) * 0.12;
      this.headGroup.rotation.z = (Math.random() - 0.5) * 0.18;

      // 거대한 악어 하악이 아래로 꺾이면서 동시에 좌우 턱이 양옆으로 쩍 갈라짐!
      this.jawGroup.rotation.x = 1.05 + Math.sin(jp * 34) * 0.16;
      if (this.jawLeftGroup && this.jawRightGroup) {
        const splitAngle = 0.38 + Math.sin(jp * 40) * 0.08;
        this.jawLeftGroup.rotation.y = -splitAngle;
        this.jawRightGroup.rotation.y = splitAngle;
        this.jawLeftGroup.rotation.z = -0.22;
        this.jawRightGroup.rotation.z = 0.22;
      }
      this.innerJaw.position.z = 0.18 + surge * 0.38 + Math.sin(jp * 42) * 0.05;
      this.innerJaw.rotation.z += dt * 18.0;

      for (let i = 0; i < this.tailNodes.length; i++) {
        this.tailNodes[i].rotation.y = Math.sin(jp * 20 - i * 0.4) * 0.18;
      }
      return;
    }

    const isChase = mode === 'chase';
    const isAttack = mode === 'attack';
    const stepMeters = isChase ? 1.15 : 0.82;

    let isMoving = false;
    if (typeof moveDist === 'number') {
      if (moveDist > 0.0003) {
        isMoving = true;
        this.walkCyclePhase = (this.walkCyclePhase || 0) + (moveDist / stepMeters) * Math.PI;
      }
    } else if (mode === 'stalk' || mode === 'chase') {
      isMoving = true;
      const fallbackSpeed = isChase ? 7.8 : 4.2;
      this.walkCyclePhase = (this.walkCyclePhase || 0) + (dt * fallbackSpeed / stepMeters) * Math.PI;
    }

    const phase = this.walkCyclePhase || 0;

    // 이동 시 묵직한 수중 물살 가르기 & 발걸음 사운드 재생
    const stepIdx = Math.floor((phase + Math.PI / 2) / Math.PI);
    if (this.enableSound && stepIdx !== this.lastStepIndex && isMoving) {
      this.lastStepIndex = stepIdx;
      sound.playCrawlerFootstep(this.soundVolume, isChase);
    }

    // 몸통 S자 좌우 유영 파동
    const swimWave = isMoving
      ? Math.sin(phase) * (isChase ? 0.18 : 0.10)
      : Math.sin(t * 1.6) * 0.03;
    const bobY = isMoving
      ? Math.abs(Math.cos(phase)) * (isChase ? 0.045 : 0.022)
      : Math.sin(t * 2.0) * 0.012;

    this.bodyGroup.position.set(0, (isChase ? 0.43 : 0.40) + bobY, 0);
    this.bodyGroup.rotation.x = isAttack ? -0.18 + Math.sin(t * 5.0) * 0.08 : 0;
    this.bodyGroup.rotation.y = swimWave;
    this.bodyGroup.rotation.z = isMoving ? Math.cos(phase) * (isChase ? 0.06 : 0.03) : 0;

    // 두개골 및 3분할 나이트메어 하악(Tri-Split Jaw) 개폐 모션
    if (isAttack) {
      const snap = Math.max(0, Math.sin(t * 7.5));
      this.headGroup.rotation.x = -0.28 - snap * 0.18;
      this.headGroup.rotation.y = chaoticNoise(t * 2.2, 11.3) * 0.28;
      this.headGroup.rotation.z = chaoticNoise(t * 3.5, 22.1) * 0.12;
      this.jawGroup.rotation.x = 0.28 + Math.pow(snap, 0.6) * 0.74;
      if (this.jawLeftGroup && this.jawRightGroup) {
        const split = snap * 0.34;
        this.jawLeftGroup.rotation.y = -split;
        this.jawRightGroup.rotation.y = split;
        this.jawLeftGroup.rotation.z = -split * 0.5;
        this.jawRightGroup.rotation.z = split * 0.5;
      }
      this.innerJaw.position.z = 0.12 + snap * 0.30;
      this.innerJaw.rotation.z += dt * 12.0;
    } else if (isChase) {
      const chomp = 0.5 + 0.5 * Math.sin(t * 8.5);
      this.headGroup.rotation.x = -0.12 + Math.sin(phase * 2) * 0.06;
      this.headGroup.rotation.y = -swimWave * 0.65;
      this.headGroup.rotation.z = 0;
      this.jawGroup.rotation.x = 0.42 + chomp * 0.42;
      if (this.jawLeftGroup && this.jawRightGroup) {
        const split = 0.14 + chomp * 0.24;
        this.jawLeftGroup.rotation.y = -split;
        this.jawRightGroup.rotation.y = split;
        this.jawLeftGroup.rotation.z = -split * 0.45;
        this.jawRightGroup.rotation.z = split * 0.45;
      }
      this.innerJaw.position.z = 0.14 + chomp * 0.24;
      this.innerJaw.rotation.z += dt * 10.0;
    } else {
      this.headGroup.rotation.x = 0.02 + Math.sin(t * 1.5) * 0.02;
      this.headGroup.rotation.y = -swimWave * 0.55 + chaoticNoise(t * 0.9, 14.2) * 0.16;
      this.headGroup.rotation.z = 0;
      this.jawGroup.rotation.x = 0.08 + Math.max(0, chaoticNoise(t * 1.8, 7.7)) * 0.14;
      if (this.jawLeftGroup && this.jawRightGroup) {
        this.jawLeftGroup.rotation.y = 0;
        this.jawRightGroup.rotation.y = 0;
        this.jawLeftGroup.rotation.z = 0;
        this.jawRightGroup.rotation.z = 0;
      }
      this.innerJaw.position.z = 0.08;
    }

    // 14마디 편평 꼬리 S자 수중 추진 파동
    const numTail = this.tailNodes.length;
    for (let i = 0; i < numTail; i++) {
      const ratio = (i + 1) / numTail;
      const wavePhase = (isMoving ? phase * 1.35 : t * 2.2) - i * 0.42;
      const amp = isMoving
        ? (isChase ? 0.24 : 0.15) * (0.55 + ratio * 0.75)
        : (isAttack ? 0.20 : 0.06) * (0.4 + ratio * 0.8);
      this.tailNodes[i].rotation.y = Math.sin(wavePhase) * amp;
      this.tailNodes[i].rotation.x = Math.cos(wavePhase * 0.5) * 0.025;
    }

    // 대각선 교차 4족 파충류 보행/유영 모션
    const stride = isChase ? 0.58 : 0.38;
    this.animateCrocLimb(this.frontLeftLeg, phase, stride, isMoving);
    this.animateCrocLimb(this.rearRightLeg, phase, stride, isMoving);
    this.animateCrocLimb(this.frontRightLeg, phase + Math.PI, stride, isMoving);
    this.animateCrocLimb(this.rearLeftLeg, phase + Math.PI, stride, isMoving);
  }

  animateCrocLimb(limb, phase, stride, isMoving) {
    if (!isMoving) {
      limb.hipGroup.rotation.y = 0;
      limb.hipGroup.rotation.z = 0;
      limb.kneeGroup.rotation.z = 0;
      return;
    }
    const swing = Math.sin(phase);
    const lift = Math.max(0, Math.cos(phase));
    limb.hipGroup.rotation.y = -limb.side * swing * stride;
    limb.hipGroup.rotation.z = limb.side * lift * 0.26;
    limb.kneeGroup.rotation.z = -limb.side * lift * 0.34;
    limb.ankleGroup.rotation.x = swing * 0.22;
  }
}

// ============================================================================
// 1-C. 제2장(침수 수로) 삼두 괴수 #2: [매복자 악어 / 더 러커 (LurkerCrocodileEntity)]
// - FNAF 4 프레들(Freddles - 손전등으로 확인/퇴치해야 하는 매복 괴물) + 팩맨 핑키(Pinky - 앞길/퇴로 차단)
//   포지션의 수로 탈출구(경사로 M / 사다리 H) 잠복 포식자입니다.
// - 평상시('idle'/'stalk')에는 납작한 곰덫(Bear-Trap) 형태의 몸통 전체가 수면(Y=0.56m) 아래에 완전히 잠겨 있고,
//   수면 위로는 전선이 감긴 비대칭 잠망경 안구 기둥 2개(Periscope Eye Stalks)와 등줄기 바늘 안테나만 솟아올라
//   두리번거립니다. 플레이어가 손전등을 비추지 않고 접근하면('chase'/'attack') 수면을 뚫고 솟구치며 180도
//   강철 곰덫 아가리를 벌려 물어뜯습니다.
// ============================================================================
export class LurkerCrocodileEntity {
  constructor() {
    this.mats = getMaterials();
    this.root = new THREE.Group();
    this.time = Math.random() * 10;
    this.animMode = 'stalk';
    this.lastMode = 'stalk';

    this.enableSound = false;
    this.soundVolume = 0.22;
    this.eyeStalks = [];
    this.tailNodes = [];
    this.limbs = [];

    this.buildLurkerAnatomy();
  }

  buildLurkerAnatomy() {
    // 잠복 시(Y=0.14m) 몸통은 수면(0.56m) 아래에 완전히 잠기고, 높이 0.56m의 잠망경 눈기둥만 수면 위로 노출(Y=0.70m)
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.set(0, 0.14, 0);
    this.root.add(this.bodyGroup);

    // 1. 넓고 극단적으로 납작한 아귀/악어 거북형 매복 몸통
    const flatCarapace = createSculptedBioLimb(
      [
        [0, 0.02, -0.58],
        [0, 0.05, -0.15],
        [0, 0.06, 0.25],
        [0, 0.03, 0.55]
      ],
      0.26,
      0.22,
      {
        segments: 20,
        radialSegs: 12,
        flutes: 8,
        fluteDepth: 0.15,
        ribFreq: 18,
        ribAmp: 0.09,
        bulge: 0.18,
        mat: this.mats.rustedRebar
      }
    );
    flatCarapace.scale.set(1.65, 0.38, 1.0);
    this.bodyGroup.add(flatCarapace);

    // 등 위에 촘촘히 박힌 수면 돌파용 바늘 안테나 스파이크 (수면 위로 가시 끝만 살짝 드러남)
    for (let i = 0; i < 6; i++) {
      const zPos = 0.36 - i * 0.16;
      for (let side of [-1, 1]) {
        const needlePin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.003, 0.015, 0.42, 4),
          this.mats.endoSteel
        );
        needlePin.position.set(side * (0.14 + (i % 2) * 0.06), 0.28, zPos);
        needlePin.rotation.z = -side * 0.12;
        needlePin.rotation.x = -0.15;
        this.bodyGroup.add(needlePin);
      }
    }

    // 2. 수면(0.56m) 위로 불쑥 솟아올라 사방을 감시하는 비대칭 잠망경 안구 기둥 (Periscope Eye Stalks)
    for (let side of [-1, 1]) {
      const stalkGroup = new THREE.Group();
      const stalkHeight = side < 0 ? 0.54 : 0.49; // 비대칭 높이로 기괴함 강조
      stalkGroup.position.set(side * 0.14, 0.10, 0.38 + (side > 0 ? 0.04 : -0.02));
      this.bodyGroup.add(stalkGroup);

      // 유연하게 휘어진 강철 주름관 + 전선 기둥
      const stalkTube = createSculptedBioLimb(
        [
          [0, 0, 0],
          [side * 0.03, stalkHeight * 0.5, -0.02],
          [0, stalkHeight, 0.03]
        ],
        0.026,
        0.020,
        { segments: 12, flutes: 4, ribFreq: 20, ribAmp: 0.12, mat: this.mats.endoSteel }
      );
      stalkGroup.add(stalkTube);

      // 기둥 상단의 카메라 조리개형 안구 하우징 (수면 Y=0.56m 바로 위 Y=0.64~0.68m에 위치)
      const turretHead = new THREE.Group();
      turretHead.position.set(0, stalkHeight, 0.03);
      stalkGroup.add(turretHead);

      const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.036, 0.085, 8),
        this.mats.exoCarapaceDome
      );
      hood.rotation.x = Math.PI / 2;
      turretHead.add(hood);

      // 호박색/진홍색으로 빛나는 잠망경 링 홍채
      const eyeRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.026, 0.006, 6, 14),
        this.mats.lurkerEyeGlow
      );
      eyeRing.position.z = 0.044;
      turretHead.add(eyeRing);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.010, 6, 6),
        this.mats.nightmarePupil
      );
      pupil.position.z = 0.048;
      turretHead.add(pupil);

      this.eyeStalks.push({ stalkGroup, turretHead, side });
    }

    // 3. 180도 벌어지는 곰덫(Bear-Trap) 상악 & 하악 프레임
    this.upperTrapJaw = new THREE.Group();
    this.upperTrapJaw.position.set(0, 0.05, 0.46);
    this.bodyGroup.add(this.upperTrapJaw);

    this.lowerTrapJaw = new THREE.Group();
    this.lowerTrapJaw.position.set(0, -0.02, 0.46);
    this.bodyGroup.add(this.lowerTrapJaw);

    for (let isUpper of [true, false]) {
      const jawTarget = isUpper ? this.upperTrapJaw : this.lowerTrapJaw;
      const ySign = isUpper ? 1 : -1;

      // 반원형 강철 곰덫 턱 프레임
      const jawArch = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.032, 6, 14, Math.PI),
        this.mats.endoSteel
      );
      jawArch.rotation.x = Math.PI / 2;
      jawArch.scale.set(1.05, 1.35, 0.8);
      jawTarget.add(jawArch);

      // 곰덫 테두리를 따라 빽빽하게 솟은 15개의 장검형 크롬 이빨
      for (let i = 0; i < 15; i++) {
        const ang = (i / 14) * Math.PI;
        const tx = Math.cos(ang) * 0.34;
        const tz = Math.sin(ang) * 0.45;
        const isLong = i % 2 === 0;
        const fangLen = isLong ? 0.11 : 0.072;

        const fang = new THREE.Mesh(
          new THREE.ConeGeometry(isLong ? 0.014 : 0.009, fangLen, 4),
          this.mats.exoChromeTeeth
        );
        fang.position.set(tx, -ySign * fangLen * 0.42, tz);
        fang.rotation.x = isUpper ? Math.PI - 0.12 : 0.12;
        jawTarget.add(fang);
      }
    }

    // 구강 한가운데 박힌 발광 미끼 코어 (Anglerfish Lure Core)
    const lureCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.055, 0),
      this.mats.lurkerEyeGlow
    );
    lureCore.position.set(0, 0.02, 0.62);
    this.bodyGroup.add(lureCore);

    // 4. 바닥에 납작하게 밀착된 4개의 게/악어 혼합형 갈고리 다리
    for (let side of [-1, 1]) {
      for (let isFront of [true, false]) {
        const legGroup = new THREE.Group();
        legGroup.position.set(side * 0.36, -0.02, isFront ? 0.26 : -0.28);
        const legMesh = createSculptedBioLimb(
          [
            [0, 0, 0],
            [side * 0.22, -0.04, isFront ? 0.08 : -0.08],
            [side * 0.34, -0.14, isFront ? 0.14 : -0.12]
          ],
          0.052,
          0.022,
          { segments: 10, flutes: 4, ribFreq: 14, ribAmp: 0.08, mat: this.mats.exoChitin }
        );
        legGroup.add(legMesh);
        this.bodyGroup.add(legGroup);
        this.limbs.push({ legGroup, side, isFront });
      }
    }

    // 5. 짧은 8마디 톱니 꼬리
    let parentTail = this.bodyGroup;
    for (let i = 0; i < 8; i++) {
      const node = new THREE.Group();
      node.position.set(0, 0, i === 0 ? -0.58 : -0.11);
      const r = 0.12 * (1 - i / 9);
      const seg = new THREE.Mesh(
        new THREE.ConeGeometry(r, 0.13, 5),
        this.mats.exoChitin
      );
      seg.rotation.x = -Math.PI / 2;
      seg.position.z = -0.055;
      node.add(seg);
      parentTail.add(node);
      this.tailNodes.push(node);
      parentTail = node;
    }
  }

  update(dt, mode = this.animMode) {
    this.animMode = mode;
    this.time += dt * (mode === 'chase' || mode === 'attack' ? 2.4 : 1.0);
    const t = this.time;

    const isErupting = mode === 'chase' || mode === 'attack' || mode === 'jumpscare';

    if (isErupting) {
      // 기습 시: 수면 위로 몸통 전체가 솟구쳐 오르며 곰덫 아가리를 쩍 벌리고 물어뜯음!
      const snapWave = Math.abs(Math.sin(t * 7.5));
      this.bodyGroup.position.y = THREE.MathUtils.lerp(this.bodyGroup.position.y, 0.56 + snapWave * 0.14, dt * 10);
      this.bodyGroup.rotation.x = -0.25 + Math.sin(t * 9.0) * 0.12;
      this.upperTrapJaw.rotation.x = -0.65 - snapWave * 0.35;
      this.lowerTrapJaw.rotation.x = 0.65 + snapWave * 0.35;
    } else {
      // 잠복 시('idle'/'stalk'): 몸통은 수면(0.56m) 아래 Y=0.14m에 완전히 숨고, 잠망경 눈기둥만 수면 위에서 스캔!
      this.bodyGroup.position.y = THREE.MathUtils.lerp(this.bodyGroup.position.y, 0.14 + Math.sin(t * 1.8) * 0.012, dt * 6);
      this.bodyGroup.rotation.x = 0;
      this.upperTrapJaw.rotation.x = -0.05;
      this.lowerTrapJaw.rotation.x = 0.05;
    }

    // 잠망경 안구 기둥이 서로 다른 주기로 기괴하게 두리번거림
    for (let i = 0; i < this.eyeStalks.length; i++) {
      const es = this.eyeStalks[i];
      const lookYaw = Math.sin(t * (1.7 + i * 0.6) + i * 2.1) * 0.55;
      const lookPitch = Math.cos(t * (2.3 - i * 0.4)) * 0.16;
      es.turretHead.rotation.y = lookYaw;
      es.turretHead.rotation.x = lookPitch;
      es.stalkGroup.rotation.z = Math.sin(t * 2.0 + i) * 0.08;
    }

    for (let i = 0; i < this.tailNodes.length; i++) {
      this.tailNodes[i].rotation.y = Math.sin(t * 3.2 - i * 0.5) * (isErupting ? 0.22 : 0.08);
    }

    for (let i = 0; i < this.limbs.length; i++) {
      const l = this.limbs[i];
      l.legGroup.rotation.y = Math.sin(t * 4.0 + i * 1.5) * (isErupting ? 0.35 : 0.08);
    }
  }
}

// ============================================================================
// 1-D. 제2장(침수 수로) 삼두 괴수 #3: [맹글 악어 / 더 스네어 (SnareMangleEntity)]
// - FNAF 2/4 맹글(Mangle - 천장에 거꾸로 매달려 라디오 전파 잡음을 내며 덮치는 고철 괴물) 포지션의
//   천장 낙하 결박(Bind/Snare) 디버퍼입니다.
// - 배수관 천장 파이프에 매달리는 4개의 긴 거미형 기계 다리, 전선과 호스가 뒤엉킨 기형적인 엔도스켈레톤 척추,
//   거꾸로 매달린 메인 악어 해골 머리 옆에 전선 목으로 대롱대롱 매달려 흔들리는 '두 번째 부서진 내골격 머리',
//   그리고 아래쪽 플레이어를 향해 길게 뻗어 내려온 2개의 작살 포획 팔(Snare Harpoon Arms)을 갖춥니다.
// ============================================================================
export class SnareMangleEntity {
  constructor() {
    this.mats = getMaterials();
    this.root = new THREE.Group();
    this.time = Math.random() * 10;
    this.animMode = 'stalk';
    this.lastMode = 'stalk';

    this.ceilingLegs = [];
    this.snareArms = [];
    this.cableTendrils = [];

    this.buildMangleAnatomy();
  }

  buildMangleAnatomy() {
    // 중심 코어 그룹 (쇼케이스 및 인게임에서 Y=1.15m 전후에 매달린 기괴한 고철 덩어리)
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.set(0, 1.15, 0);
    this.root.add(this.bodyGroup);

    // 1. 뒤엉킨 엔도스켈레톤 흉곽 & 꼬인 척추 코어
    const mangledSpine = createSculptedBioLimb(
      [
        [0, 0.48, -0.22],
        [0.08, 0.22, 0.0],
        [-0.06, -0.05, 0.14],
        [0, -0.24, 0.22]
      ],
      0.11,
      0.085,
      {
        segments: 20,
        radialSegs: 10,
        flutes: 6,
        fluteDepth: 0.18,
        ribFreq: 26,
        ribAmp: 0.14,
        mat: this.mats.endoSteel
      }
    );
    this.bodyGroup.add(mangledSpine);

    // 노출된 강철 갈비뼈 케이지 & 라디오 송수신 코어 박스
    for (let r = 0; r < 5; r++) {
      const ribRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.22 - r * 0.015, 0.016, 6, 12),
        r % 2 === 0 ? this.mats.endoSteel : this.mats.rustedRebar
      );
      ribRing.position.set((r % 2 === 0 ? 1 : -1) * 0.03, 0.28 - r * 0.09, -0.02 + r * 0.04);
      ribRing.rotation.set(0.4 + r * 0.2, r * 0.3, 0.2);
      this.bodyGroup.add(ribRing);
    }

    // 2. 천장 아치를 움켜쥐는 4개의 긴 거미/박쥐형 기계 관절 다리 (위로 뻗음)
    for (let side of [-1, 1]) {
      for (let zDir of [-1, 1]) {
        const legAnchor = new THREE.Group();
        legAnchor.position.set(side * 0.16, 0.36, zDir * 0.16);
        this.bodyGroup.add(legAnchor);

        const spiderLeg = createSculptedBioLimb(
          [
            [0, 0, 0],
            [side * 0.38, 0.32, zDir * 0.22],
            [side * 0.56, 0.58, zDir * 0.36],
            [side * 0.42, 0.72, zDir * 0.42]
          ],
          0.038,
          0.018,
          { segments: 14, flutes: 4, ribFreq: 18, ribAmp: 0.10, mat: this.mats.endoSteel }
        );
        legAnchor.add(spiderLeg);
        this.ceilingLegs.push({ legAnchor, side, zDir });
      }
    }

    // 3. 거꾸로 매달린 제1 메인 악어 해골 머리 (Upside-Down Primary Croc Skull)
    this.mainHeadGroup = new THREE.Group();
    this.mainHeadGroup.position.set(0, -0.22, 0.26);
    // 천장에서 내려다보듯 뒤집힌 각도
    this.mainHeadGroup.rotation.z = Math.PI * 0.92;
    this.bodyGroup.add(this.mainHeadGroup);

    const skullUpper = createSculptedBioLimb(
      [
        [0, 0.04, 0],
        [0, 0.03, 0.32],
        [0, 0.01, 0.58]
      ],
      0.13,
      0.075,
      { segments: 14, flutes: 6, ribFreq: 16, ribAmp: 0.08, mat: this.mats.exoChitin }
    );
    skullUpper.scale.set(1.15, 0.55, 1.0);
    this.mainHeadGroup.add(skullUpper);

    for (let side of [-1, 1]) {
      const mEye = new THREE.Mesh(
        new THREE.TorusGeometry(0.020, 0.005, 6, 12),
        this.mats.mangleEyeGlow
      );
      mEye.position.set(side * 0.095, 0.08, 0.14);
      mEye.rotation.y = side * 0.25;
      this.mainHeadGroup.add(mEye);

      for (let i = 0; i < 8; i++) {
        const fang = new THREE.Mesh(
          new THREE.ConeGeometry(0.009, 0.058, 4),
          this.mats.exoChromeTeeth
        );
        fang.position.set(side * (0.11 - i * 0.005), -0.03, 0.12 + i * 0.055);
        fang.rotation.x = Math.PI;
        this.mainHeadGroup.add(fang);
      }
    }

    this.mainJaw = new THREE.Group();
    this.mainJaw.position.set(0, -0.02, 0.02);
    this.mainHeadGroup.add(this.mainJaw);

    const jawBar = createSculptedBioLimb(
      [[0, -0.02, 0], [0, -0.02, 0.52]],
      0.095,
      0.055,
      { segments: 12, flutes: 4, ribFreq: 14, ribAmp: 0.08, mat: this.mats.endoSteel }
    );
    jawBar.scale.set(1.05, 0.45, 1.0);
    this.mainJaw.add(jawBar);

    // 4. FNAF 맹글의 상징: 전선 목 끝에 대롱대롱 매달린 '두 번째 부서진 엔도스켈레톤 머리' (Second Broken Endo-Head)
    this.secondNeckGroup = new THREE.Group();
    this.secondNeckGroup.position.set(0.24, -0.10, 0.12);
    this.bodyGroup.add(this.secondNeckGroup);

    const cableNeck = createSculptedBioLimb(
      [
        [0, 0, 0],
        [0.12, -0.18, 0.08],
        [0.06, -0.36, 0.16]
      ],
      0.028,
      0.022,
      { segments: 10, flutes: 4, ribFreq: 20, ribAmp: 0.12, mat: this.mats.exoSinew }
    );
    this.secondNeckGroup.add(cableNeck);

    this.secondHeadGroup = new THREE.Group();
    this.secondHeadGroup.position.set(0.06, -0.36, 0.16);
    this.secondHeadGroup.rotation.set(0.3, -0.4, 2.2); // 기괴하게 꺾인 모가지
    this.secondNeckGroup.add(this.secondHeadGroup);

    const endoCrania = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.15, 0.18),
      this.mats.endoSteel
    );
    this.secondHeadGroup.add(endoCrania);

    // 한쪽 눈만 남아 깜빡거리는 맹글 서브 헤드 안구
    const loneEyeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.006, 6, 12),
      this.mats.mangleEyeGlow
    );
    loneEyeRing.position.set(-0.038, 0.02, 0.092);
    this.secondHeadGroup.add(loneEyeRing);

    const lonePupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 6, 6),
      this.mats.nightmarePupil
    );
    lonePupil.position.set(-0.038, 0.02, 0.096);
    this.secondHeadGroup.add(lonePupil);

    // 5. 아래쪽 플레이어를 움켜쥐기 위해 길게 늘어뜨린 2개의 포획 작살 팔 (Snare Harpoon Arms)
    for (let side of [-1, 1]) {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.24, -0.12, 0.18);
      this.bodyGroup.add(armGroup);

      const upperArm = createSculptedBioLimb(
        [
          [0, 0, 0],
          [side * 0.12, -0.36, 0.10],
          [side * 0.06, -0.74, 0.22]
        ],
        0.045,
        0.028,
        { segments: 14, flutes: 5, ribFreq: 18, ribAmp: 0.10, mat: this.mats.endoSteel }
      );
      armGroup.add(upperArm);

      // 끝부분 3갈래 포획 클램프 갈고리
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2;
        const hook = new THREE.Mesh(
          new THREE.ConeGeometry(0.014, 0.16, 4),
          this.mats.exoChromeTeeth
        );
        hook.position.set(
          side * 0.06 + Math.cos(ang) * 0.045,
          -0.80,
          0.22 + Math.sin(ang) * 0.045
        );
        hook.rotation.x = Math.PI - 0.35;
        armGroup.add(hook);
      }

      this.snareArms.push({ armGroup, side });
    }

    // 6. 아래로 축 늘어진 끊어진 전선 가닥들
    for (let c = 0; c < 5; c++) {
      const tendril = createSculptedBioLimb(
        [
          [(c - 2) * 0.08, 0.0, -0.05],
          [(c - 2) * 0.11, -0.42, 0.04],
          [(c - 2) * 0.09, -0.78, -0.02]
        ],
        0.012,
        0.005,
        { segments: 10, flutes: 3, ribFreq: 12, ribAmp: 0.06, mat: this.mats.exoSinew }
      );
      this.bodyGroup.add(tendril);
      this.cableTendrils.push(tendril);
    }
  }

  update(dt, mode = this.animMode) {
    this.animMode = mode;
    const isSnaring = mode === 'chase' || mode === 'attack' || mode === 'jumpscare';
    this.time += dt * (isSnaring ? 3.2 : 1.15);
    const t = this.time;

    // 몸통 전체가 천장에서 불규칙한 진자 운동 + 기계 경련
    this.bodyGroup.rotation.y = Math.sin(t * 1.4) * (isSnaring ? 0.35 : 0.18);
    this.bodyGroup.rotation.z = Math.cos(t * 1.9) * (isSnaring ? 0.18 : 0.06);

    // 메인 악어 해골 턱 딱딱거림
    if (this.mainJaw) {
      this.mainJaw.rotation.x = 0.25 + Math.abs(Math.sin(t * (isSnaring ? 11.0 : 3.5))) * (isSnaring ? 0.65 : 0.22);
    }

    // 두 번째 부서진 엔도스켈레톤 머리가 전선 목에 매달려 덜렁거림
    if (this.secondNeckGroup && this.secondHeadGroup) {
      this.secondNeckGroup.rotation.z = Math.sin(t * 2.8) * 0.28;
      this.secondNeckGroup.rotation.x = Math.cos(t * 2.1) * 0.22;
      this.secondHeadGroup.rotation.z = 2.2 + chaoticNoise(t * 4.5, 9.1) * 0.45;
    }

    // 아래로 뻗은 2개의 작살 포획 팔이 허공을 휘젓거나 플레이어를 조임
    for (let i = 0; i < this.snareArms.length; i++) {
      const arm = this.snareArms[i];
      if (isSnaring) {
        arm.armGroup.rotation.x = -0.45 + Math.sin(t * 9.0 + i * Math.PI) * 0.38;
        arm.armGroup.rotation.z = -arm.side * (0.28 + Math.sin(t * 7.0) * 0.22);
      } else {
        arm.armGroup.rotation.x = Math.sin(t * 2.0 + i * 1.8) * 0.18;
        arm.armGroup.rotation.z = Math.cos(t * 1.6 + i) * 0.12;
      }
    }

    // 천장 거미 다리 꿈틀거림
    for (let i = 0; i < this.ceilingLegs.length; i++) {
      const leg = this.ceilingLegs[i];
      leg.legAnchor.rotation.z = Math.sin(t * 3.0 + i * 1.2) * (isSnaring ? 0.22 : 0.07);
    }
  }
}

// ============================================================================
// 2. 플레이어 / 친구 캐릭터 모델: [특수 방호 기동대원 (Adult CBRN Tactical Operative)]
// - 유아틱해 보이던 짧은 비율과 귀여운 픽셀 눈을 완전히 폐기했습니다!
// - 성인 7.5등신 전술 비율(신장 1.82m, 넓은 어깨와 긴 하체), 각진 방탄 헬멧 & 파노라마 다크 바이저,
//   듀얼 필터 군용 방독면, MOLLE 방탄 플레이트 캐리어(무전기·탄입대·케미라이트),
//   성형된 전투복 주름과 하드쉘 무릎 보호대, 전술 부츠로 성숙하고 진지한 호러 대원 외형을 구현합니다.
// ============================================================================
function createCurvedTube(points, radius = 0.04, tubularSegments = 16, radialSegments = 8, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class PlayerCharacterEntity {
  constructor(name = '기동대원 #02', enableLight = true) {
    this.mats = getMaterials();
    this.name = name;
    this.enableLight = enableLight;
    this.root = new THREE.Group();
    this.time = Math.random() * 5;
    this.animMode = 'idle';
    this.flashlightOn = true;
    this.torchGroup = null;
    this.torchBeamCone = null;
    this.torchSpot = null;
    this.torchLens = null;

    this.buildAdultTacticalOperative();
  }

  buildAdultTacticalOperative() {
    // 1. 성인 비율 골반 & 전술 워벨트 (높이 0.98m - 긴 다리 비율)
    this.hipsGroup = new THREE.Group();
    this.hipsGroup.position.set(0, 0.98, 0);
    this.root.add(this.hipsGroup);

    const pelvisGeo = deformGeometry(new THREE.CylinderGeometry(0.165, 0.155, 0.18, 14), (v) => {
      v.z *= 0.72;
    });
    const pelvis = new THREE.Mesh(pelvisGeo, this.mats.suitFabric);
    pelvis.castShadow = true;
    this.hipsGroup.add(pelvis);

    // 전술 워벨트 & 덤프 파우치
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.065, 0.25),
      this.mats.suitWebbing
    );
    belt.position.y = 0.04;
    this.hipsGroup.add(belt);

    for (let side of [-1, 1]) {
      const sidePouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.12, 0.11),
        this.mats.suitArmor
      );
      sidePouch.position.set(side * 0.19, 0.02, 0.01);
      this.hipsGroup.add(sidePouch);
    }

    // 2. 성인 역삼각형 상체 & MOLLE 방탄 플레이트 캐리어 조끼
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.08, 0);
    this.hipsGroup.add(this.torsoGroup);

    // 성인 흉부/복부 (허리는 날렵하고 어깨/가슴은 탄탄한 V-Taper 조형)
    const torsoMesh = createSculptedBioLimb(
      [
        [0, 0, 0],
        [0, 0.25, 0.01],
        [0, 0.5, 0]
      ],
      0.155,
      0.205,
      { segments: 16, radialSegs: 16, flutes: 6, fluteDepth: 0.04, ribFreq: 10, ribAmp: 0.03, bulge: 0.06, mat: this.mats.suitFabric }
    );
    torsoMesh.scale.z = 0.68;
    this.torsoGroup.add(torsoMesh);

    // 전면/후면 각진 방탄 플레이트 캐리어 (Plate Carrier Vest)
    const frontPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.34, 0.06),
      this.mats.suitArmor
    );
    frontPlate.position.set(0, 0.28, 0.12);
    frontPlate.castShadow = true;
    this.torsoGroup.add(frontPlate);

    // 가슴 전면 탄입대/배터리 파우치 3연장
    for (let i = -1; i <= 1; i++) {
      const magPouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.13, 0.045),
        this.mats.suitWebbing
      );
      magPouch.position.set(i * 0.09, 0.2, 0.16);
      this.torsoGroup.add(magPouch);
    }

    // 가슴 상단 전술 무전기(좌) & 발광 케미라이트 스틱(우)
    const radioBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.11, 0.04),
      this.mats.suitWebbing
    );
    radioBox.position.set(-0.1, 0.38, 0.155);
    this.torsoGroup.add(radioBox);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.002, 0.28, 6),
      this.mats.suitMetal
    );
    antenna.position.set(-0.12, 0.54, 0.15);
    this.torsoGroup.add(antenna);

    const chemLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8),
      this.mats.visorHudSlit
    );
    chemLight.rotation.z = Math.PI / 3;
    chemLight.position.set(0.08, 0.37, 0.16);
    this.torsoGroup.add(chemLight);

    // 방탄 조끼 어깨 패드 스트랩
    for (let side of [-1, 1]) {
      const shoulderStrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.06, 0.28),
        this.mats.suitArmor
      );
      shoulderStrap.position.set(side * 0.13, 0.49, 0);
      this.torsoGroup.add(shoulderStrap);
    }

    // 3. 등 뒤의 군용 CBRN 공기 정화 팩 & 트윈 산소 실린더
    this.backpackGroup = new THREE.Group();
    this.backpackGroup.position.set(0, 0.28, -0.15);
    this.torsoGroup.add(this.backpackGroup);

    const backPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.36, 0.09),
      this.mats.suitArmor
    );
    backPlate.castShadow = true;
    this.backpackGroup.add(backPlate);

    for (let side of [-1, 1]) {
      const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.058, 0.34, 14),
        this.mats.suitMetal
      );
      cylinder.position.set(side * 0.085, -0.01, -0.065);
      cylinder.castShadow = true;
      this.backpackGroup.add(cylinder);

      const valve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8),
        this.mats.suitWebbing
      );
      valve.position.set(side * 0.085, 0.18, -0.065);
      this.backpackGroup.add(valve);
    }

    // 백팩 상태 표시 슬릿 LED
    const statusSlit = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.16, 0.015),
      this.mats.visorHudSlit
    );
    statusSlit.position.set(0, 0.02, -0.115);
    this.backpackGroup.add(statusSlit);

    // 4. 성인 비율 전술 방탄 헬멧(Fast-MT) + 다크 발리스틱 바이저 + 군용 양구 방독면 (유아틱함 제로!)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.52, 0);
    this.torsoGroup.add(this.headGroup);

    // 목 방호 카라(Neck Gaiter)
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 0.1, 12),
      this.mats.suitWebbing
    );
    neck.position.y = 0.04;
    this.headGroup.add(neck);

    // 각진 전술 방탄 헬멧 쉘 (성인 머리 크기에 맞춘 컴팩트한 비율)
    const helmetGeo = deformGeometry(new THREE.SphereGeometry(0.135, 18, 16), (v) => {
      v.x *= 0.92;
      v.y *= 1.05;
      v.z *= 1.12;
      // 헬멧 하단 귀 부위 컷아웃 및 후면 각진 실루엣
      if (v.y < -0.04 && v.z > 0.02) {
        v.y = -0.04;
      }
    });
    const helmetShell = new THREE.Mesh(helmetGeo, this.mats.suitArmor);
    helmetShell.position.set(0, 0.16, -0.01);
    helmetShell.castShadow = true;
    this.headGroup.add(helmetShell);

    // 헬멧 이마 NVG 야간투시경 마운트 슈라우드
    const nvgMount = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.055, 0.03),
      this.mats.suitMetal
    );
    nvgMount.position.set(0, 0.22, 0.13);
    nvgMount.rotation.x = -0.2;
    this.headGroup.add(nvgMount);

    // 헬멧 좌우 전술 레일 & 헤드셋(Peltor 스타일)
    for (let side of [-1, 1]) {
      const earCup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.035, 10),
        this.mats.suitWebbing
      );
      earCup.rotation.z = Math.PI / 2;
      earCup.position.set(side * 0.125, 0.13, 0.0);
      this.headGroup.add(earCup);
    }

    // 각진 파노라마 다크 방탄 고글/바이저 + 날카로운 수평 전술 HUD 광학 슬릿 (귀여운 네모 눈 완전 삭제!)
    const goggleFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.075, 0.09),
      this.mats.suitWebbing
    );
    goggleFrame.position.set(0, 0.155, 0.095);
    this.headGroup.add(goggleFrame);

    const goggleLens = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.055, 0.02),
      this.mats.visorGlass
    );
    goggleLens.position.set(0, 0.155, 0.135);
    this.headGroup.add(goggleLens);

    // 고글 내부에 비치는 날카롭고 진지한 한 줄의 택티컬 HUD 바이저 라인
    for (let side of [-1, 1]) {
      const opticSlit = new THREE.Mesh(
        new THREE.PlaneGeometry(0.052, 0.012),
        this.mats.visorHudSlit
      );
      opticSlit.position.set(side * 0.045, 0.155, 0.146);
      this.headGroup.add(opticSlit);
    }

    // 하단 각진 M50 스타일 군용 방독면 & 양측 정화통 필터 (Dual Canister Respirator)
    const maskFacepiece = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.065, 0.1, 6),
      this.mats.suitWebbing
    );
    maskFacepiece.rotation.x = Math.PI / 2 + 0.35;
    maskFacepiece.position.set(0, 0.085, 0.115);
    this.headGroup.add(maskFacepiece);

    for (let side of [-1, 1]) {
      const filterCanister = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.036, 0.065, 10),
        this.mats.suitArmor
      );
      filterCanister.rotation.z = side * 0.65;
      filterCanister.rotation.x = Math.PI / 2;
      filterCanister.position.set(side * 0.068, 0.075, 0.11);
      this.headGroup.add(filterCanister);

      // 방독면에서 등 뒤 정화 팩으로 이어지는 굵은 주름 호스
      const hose = createCurvedTube(
        [
          [side * 0.07, 0.065, 0.11],
          [side * 0.14, 0.02, 0.06],
          [side * 0.16, -0.06, -0.04],
          [side * 0.09, -0.1, -0.18]
        ],
        0.018,
        14,
        8,
        this.mats.suitWebbing
      );
      this.headGroup.add(hose);
    }

    // 5. 성인 비율 다관절 팔 & 전술 손전등
    this.leftArm = this.buildTacticalArm(-1, false);
    this.rightArm = this.buildTacticalArm(1, true);
    this.torsoGroup.add(this.leftArm.shoulderGroup);
    this.torsoGroup.add(this.rightArm.shoulderGroup);

    // 6. 성인 비율 긴 다리 & 각진 하드쉘 무릎 보호대 & 컴뱃 부츠
    this.leftLeg = this.buildTacticalLeg(-1);
    this.rightLeg = this.buildTacticalLeg(1);
    this.hipsGroup.add(this.leftLeg.hipGroup);
    this.hipsGroup.add(this.rightLeg.hipGroup);
  }

  buildTacticalArm(side, hasFlashlight) {
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(side * 0.23, 0.45, 0);

    // 각진 전술 견갑 패드 (Pauldron)
    const shoulderArmor = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.12, 0.13),
      this.mats.suitArmor
    );
    shoulderArmor.position.set(side * 0.015, -0.02, 0);
    shoulderArmor.rotation.z = side * 0.15;
    shoulderGroup.add(shoulderArmor);

    // 상완 (옷주름이 조각된 전투복 소매)
    const upperArm = createSculptedBioLimb(
      [[0, 0, 0], [0, -0.15, 0], [0, -0.3, 0]],
      0.058,
      0.048,
      { segments: 12, flutes: 5, fluteDepth: 0.05, ribFreq: 10, ribAmp: 0.04, bulge: 0.1, mat: this.mats.suitFabric }
    );
    shoulderGroup.add(upperArm);

    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, -0.3, 0);
    shoulderGroup.add(elbowGroup);

    const elbowPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.08, 0.065),
      this.mats.suitWebbing
    );
    elbowPad.position.set(0, 0, -0.015);
    elbowGroup.add(elbowPad);

    const forearm = createSculptedBioLimb(
      [[0, 0, 0], [0, -0.14, 0.01], [0, -0.27, 0.02]],
      0.048,
      0.038,
      { segments: 12, flutes: 5, fluteDepth: 0.04, ribFreq: 8, ribAmp: 0.03, bulge: 0.08, mat: this.mats.suitFabric }
    );
    elbowGroup.add(forearm);

    // 왼쪽 손목 전술 PDA/단말기
    if (side < 0) {
      const wristPda = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.065, 0.02),
        this.mats.suitArmor
      );
      wristPda.position.set(-0.025, -0.21, 0.035);
      elbowGroup.add(wristPda);

      const pdaScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.032, 0.048),
        this.mats.visorHudSlit
      );
      pdaScreen.position.set(-0.025, -0.21, 0.046);
      elbowGroup.add(pdaScreen);
    }

    // 전술 장갑 손
    const glove = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.085, 0.065),
      this.mats.suitWebbing
    );
    glove.position.set(0, -0.3, 0.02);
    elbowGroup.add(glove);

    if (hasFlashlight) {
      const torchGroup = new THREE.Group();
      torchGroup.position.set(0, -0.3, 0.06);
      elbowGroup.add(torchGroup);
      this.torchGroup = torchGroup;

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.019, 0.2, 10),
        this.mats.suitArmor
      );
      body.rotation.x = Math.PI / 2;
      torchGroup.add(body);

      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.034, 0.024, 0.055, 10),
        this.mats.suitMetal
      );
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.11;
      torchGroup.add(head);

      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.03, 10),
        this.mats.visorHudSlit
      );
      lens.position.z = 0.139;
      torchGroup.add(lens);
      this.torchLens = lens;

      const beamConeGeo = new THREE.ConeGeometry(0.38, 1.9, 14, 1, true);
      beamConeGeo.translate(0, -0.95, 0);
      beamConeGeo.rotateX(-Math.PI / 2);
      const beamConeMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const beamCone = new THREE.Mesh(beamConeGeo, beamConeMat);
      beamCone.position.z = 0.14;
      torchGroup.add(beamCone);
      this.torchBeamCone = beamCone;

      if (this.enableLight) {
        const spot = new THREE.SpotLight(0xffffff, 6, 12, Math.PI / 5.5, 0.55, 1.5);
        spot.position.set(0, 0, 0.14);
        const target = new THREE.Object3D();
        target.position.set(0, 0, 5);
        torchGroup.add(spot);
        torchGroup.add(target);
        spot.target = target;
        this.torchSpot = spot;
      }
    }

    return { shoulderGroup, elbowGroup };
  }

  buildTacticalLeg(side) {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(side * 0.1, -0.02, 0);

    // 성인 비율 허벅지 (길이 0.46m)
    const thigh = createSculptedBioLimb(
      [[0, 0, 0], [0, -0.23, 0.01], [0, -0.46, 0]],
      0.082,
      0.065,
      { segments: 14, flutes: 6, fluteDepth: 0.05, ribFreq: 10, ribAmp: 0.04, bulge: 0.12, mat: this.mats.suitFabric }
    );
    hipGroup.add(thigh);

    // 우측 허벅지 전술 레그 홀스터 & 스트랩
    if (side > 0) {
      const holster = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.16, 0.095),
        this.mats.suitWebbing
      );
      holster.position.set(0.075, -0.22, 0.01);
      hipGroup.add(holster);
    }

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.46, 0);
    hipGroup.add(kneeGroup);

    // 각진 하드쉘 전술 무릎 보호대
    const kneePad = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.11, 0.05),
      this.mats.suitArmor
    );
    kneePad.position.set(0, 0, 0.055);
    kneeGroup.add(kneePad);

    // 정강이 (길이 0.42m)
    const shin = createSculptedBioLimb(
      [[0, 0, 0], [0, -0.21, -0.01], [0, -0.42, 0]],
      0.064,
      0.052,
      { segments: 14, flutes: 5, fluteDepth: 0.04, ribFreq: 8, ribAmp: 0.03, bulge: 0.08, mat: this.mats.suitFabric }
    );
    kneeGroup.add(shin);

    // 군용 전술 컴뱃 부츠 (발목 가드 + 밑창 아웃솔)
    const ankleBoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.058, 0.1, 10),
      this.mats.suitWebbing
    );
    ankleBoot.position.set(0, -0.41, 0);
    kneeGroup.add(ankleBoot);

    const bootFoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.085, 0.23),
      this.mats.suitWebbing
    );
    bootFoot.position.set(0, -0.455, 0.045);
    bootFoot.castShadow = true;
    kneeGroup.add(bootFoot);

    return { hipGroup, kneeGroup };
  }

  /**
   * 사망 시 복도 바닥에 자연스럽게 쓰러진 자세 (Fallen Ragdoll Posture)
   */
  setFallenPose() {
    this.animMode = 'fallen';
    this.root.position.y = 0.14;
    this.root.rotation.set(-Math.PI / 2, 0, (Math.random() - 0.5) * 0.45);

    this.hipsGroup.position.set(0, 0.1, 0);
    this.torsoGroup.rotation.set(0.08, 0.22, 0.05);
    this.headGroup.rotation.set(-0.25, 0.55, -0.15);

    if (this.leftArm) {
      this.leftArm.shoulderGroup.rotation.set(0.42, 0.35, 0.2);
      this.leftArm.elbowGroup.rotation.set(-0.15, 0, 0);
    }
    if (this.rightArm) {
      this.rightArm.shoulderGroup.rotation.set(0.75, -0.38, -0.22);
      this.rightArm.elbowGroup.rotation.set(-0.35, 0, 0);
    }
    if (this.leftLeg) {
      this.leftLeg.hipGroup.rotation.set(0.22, 0.28, 0.1);
      this.leftLeg.kneeGroup.rotation.set(0.35, 0, 0);
    }
    if (this.rightLeg) {
      this.rightLeg.hipGroup.rotation.set(-0.18, -0.2, -0.1);
      this.rightLeg.kneeGroup.rotation.set(0.15, 0, 0);
    }
  }

  update(dt, mode = this.animMode) {
    if (mode === 'fallen' || this.animMode === 'fallen') {
      return;
    }
    this.animMode = mode;
    this.time += dt;
    const t = this.time;

    if (mode === 'sprint') {
      const freq = 8.6;
      const phase = t * freq;
      const s = Math.sin(phase);

      // 전술 전력 질주: 상체를 20도 가량 숙이고 격렬한 보폭 펌핑
      this.hipsGroup.position.y = 0.98 + Math.abs(Math.cos(phase)) * 0.058;
      this.torsoGroup.rotation.y = -s * 0.16;
      this.torsoGroup.rotation.x = 0.22;

      this.leftLeg.hipGroup.rotation.x = s * 0.88;
      this.leftLeg.kneeGroup.rotation.x = Math.max(0, -Math.cos(phase)) * 0.95;

      this.rightLeg.hipGroup.rotation.x = -s * 0.88;
      this.rightLeg.kneeGroup.rotation.x = Math.max(0, Math.cos(phase)) * 0.95;

      this.leftArm.shoulderGroup.rotation.x = -s * 0.72;
      this.leftArm.elbowGroup.rotation.x = -0.75;

      this.rightArm.shoulderGroup.rotation.x = -0.42 + s * 0.62;
      this.rightArm.elbowGroup.rotation.x = -1.22;

      this.headGroup.rotation.y = Math.sin(t * 1.5) * 0.08;
      this.headGroup.rotation.x = -0.12 + Math.abs(Math.sin(phase)) * 0.04;
    } else if (mode === 'walk') {
      const freq = 4.8;
      const phase = t * freq;
      const s = Math.sin(phase);

      this.hipsGroup.position.y = 0.98 + Math.abs(Math.cos(phase)) * 0.035;
      this.torsoGroup.rotation.y = -s * 0.07;
      this.torsoGroup.rotation.x = 0.06;

      this.leftLeg.hipGroup.rotation.x = s * 0.48;
      this.leftLeg.kneeGroup.rotation.x = Math.max(0, -Math.cos(phase)) * 0.55;

      this.rightLeg.hipGroup.rotation.x = -s * 0.48;
      this.rightLeg.kneeGroup.rotation.x = Math.max(0, Math.cos(phase)) * 0.55;

      this.leftArm.shoulderGroup.rotation.x = -s * 0.36;
      this.leftArm.elbowGroup.rotation.x = -0.32;

      // 오른팔은 전술 로우-레디 자세로 손전등을 정면에 유지
      this.rightArm.shoulderGroup.rotation.x = -0.32 + Math.sin(phase * 0.5) * 0.06;
      this.rightArm.elbowGroup.rotation.x = -1.18;

      this.headGroup.rotation.y = Math.sin(t * 1.2) * 0.15;
    } else if (mode === 'look') {
      this.hipsGroup.position.y = 0.98 + Math.sin(t * 2.0) * 0.01;
      const sweep = Math.sin(t * 1.1);
      this.torsoGroup.rotation.y = sweep * 0.22;
      this.headGroup.rotation.y = sweep * 0.32;
      this.headGroup.rotation.x = Math.sin(t * 1.8) * 0.06;

      this.rightArm.shoulderGroup.rotation.x = -0.38 + Math.sin(t * 1.8) * 0.1;
      this.rightArm.shoulderGroup.rotation.y = sweep * 0.18;
      this.rightArm.elbowGroup.rotation.x = -1.15;

      this.leftArm.shoulderGroup.rotation.x = Math.sin(t * 1.6) * 0.05;
      this.leftArm.elbowGroup.rotation.x = -0.28;
      this.leftLeg.hipGroup.rotation.x = 0;
      this.rightLeg.hipGroup.rotation.x = 0;
    } else {
      this.hipsGroup.position.y = 0.98 + Math.sin(t * 2.0) * 0.01;
      this.torsoGroup.rotation.y = Math.sin(t * 0.7) * 0.05;
      this.torsoGroup.rotation.x = 0.02;

      this.headGroup.rotation.y = Math.sin(t * 1.0) * 0.12;
      this.headGroup.rotation.x = Math.sin(t * 1.5) * 0.03;

      this.leftArm.shoulderGroup.rotation.x = Math.sin(t * 1.6) * 0.04;
      this.leftArm.elbowGroup.rotation.x = -0.28;

      this.rightArm.shoulderGroup.rotation.x = -0.3;
      this.rightArm.shoulderGroup.rotation.y = 0;
      this.rightArm.elbowGroup.rotation.x = -1.15 + Math.sin(t * 2.0) * 0.03;

      this.leftLeg.hipGroup.rotation.x = 0;
      this.leftLeg.kneeGroup.rotation.x = 0;
      this.rightLeg.hipGroup.rotation.x = 0;
      this.rightLeg.kneeGroup.rotation.x = 0;
    }
  }

  setFlashlight(enabled) {
    this.flashlightOn = !!enabled;
    if (this.torchBeamCone) this.torchBeamCone.visible = this.flashlightOn;
    if (this.torchSpot) this.torchSpot.visible = this.flashlightOn;
    if (this.torchLens) this.torchLens.visible = this.flashlightOn;
  }
}
