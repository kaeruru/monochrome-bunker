import * as THREE from 'three';

// =====================================================================
// [PS2 / GTA 산안드레아스 스타일] 로우폴리 실사 포토 텍스처(Photo-Texture) 엔진
// - 번들거리는 가짜 3D 반사광(PBR)을 완전히 걷어내고,
//   실제 지하 벙커의 녹물, 용접 자국, 기름때, 콘크리트 균열, 리벳 볼트와
//   은은한 그림자(AO)를 텍스처 자체에 정밀하게 베이킹합니다.
// - 픽셀당 무거운 노멀맵 연산 없이 MeshLambertMaterial을 사용하여
//   모바일 스마트폰에서도 가볍게 60 FPS를 유지하며, 특유의 2000년대 명작 호러 분위기를 연출합니다.
// =====================================================================

/**
 * 텍스처 캔버스 생성 및 Three.js 레트로 텍스처 최적화 헬퍼
 */
function makePhotoTexture(drawFn, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * 실사 질감을 살려주는 미세 입자 노이즈 & 스크래치 합성
 */
function addRealisticNoiseAndScratches(ctx, size, noiseAlpha = 0.12, scratches = 18) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;

  // 1. 거친 아날로그 필름/금속 입자 노이즈
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * 255 * noiseAlpha;
    d[i] = Math.max(0, Math.min(255, d[i] + grain));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + grain));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + grain));
  }
  ctx.putImageData(img, 0, 0);

  // 2. 표면 미세 스크래치 & 긁힌 선
  ctx.save();
  for (let i = 0; i < scratches; i++) {
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    const len = 15 + Math.random() * 45;
    const angle = (Math.random() - 0.5) * Math.PI * 0.4;
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;

    ctx.strokeStyle = Math.random() > 0.4 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.8 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 씬 기본 환경광 반사맵 (가볍고 차가운 인더스트리얼 톤)
 */
export function createIndustrialEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x181a1d);

  const panelGeo = new THREE.PlaneGeometry(10, 4);
  const brightMat = new THREE.MeshBasicMaterial({ color: 0x6e7882, side: THREE.DoubleSide });
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x1e2226, side: THREE.DoubleSide });

  const topPanel = new THREE.Mesh(panelGeo, brightMat);
  topPanel.position.set(0, 7, 0);
  topPanel.rotation.x = Math.PI / 2;
  envScene.add(topPanel);

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const sidePanel = new THREE.Mesh(panelGeo, dimMat);
    sidePanel.position.set(Math.cos(angle) * 8, 1, Math.sin(angle) * 8);
    sidePanel.lookAt(0, 1, 0);
    envScene.add(sidePanel);
  }

  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

/**
 * [산안드레아스풍 로우폴리 실사 텍스처 머티리얼 세트]
 */
export function createIndustrialMaterials() {
  // 1. 강철 방호벽 (녹슨 강철판, 용접 비드, 리벳 볼트, 흘러내린 적갈색 부식물)
  const wallTex = makePhotoTexture((ctx, s) => {
    // 묵직한 암회색 주철 베이스 그러데이션
    const bgGrad = ctx.createLinearGradient(0, 0, 0, s);
    bgGrad.addColorStop(0, '#363a3e');
    bgGrad.addColorStop(0.3, '#3c4045');
    bgGrad.addColorStop(0.7, '#2f3236');
    bgGrad.addColorStop(1, '#1e2022');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, s, s);

    // 모서리 앰비언트 오클루전 (자체 베이킹된 어두운 그림자 테두리)
    const edgeGrad = ctx.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s * 0.72);
    edgeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edgeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, s, s);

    // 상하좌우 강철 프레임 이음새
    ctx.strokeStyle = '#141618';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, s - 10, s - 10);
    ctx.strokeStyle = '#5a6066';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, s - 20, s - 20);

    // 중앙 가로 보강 거더(H빔 구조)
    const midY = s * 0.48;
    const beamH = s * 0.09;
    ctx.fillStyle = '#24272a';
    ctx.fillRect(10, midY, s - 20, beamH);
    ctx.strokeStyle = '#101214';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, midY, s - 20, beamH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(12, midY + 2, s - 24, 2);

    // 세로 용접선 & 패널 분할
    ctx.strokeStyle = '#181a1c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s / 2, 10); ctx.lineTo(s / 2, midY);
    ctx.moveTo(s / 2, midY + beamH); ctx.lineTo(s / 2, s - 55);
    ctx.stroke();

    // 굵직한 육각 리벳 볼트 (상단, 빔 주변, 하단)
    const rivets = [
      [28, 28], [s / 2 - 24, 28], [s / 2 + 24, 28], [s - 28, 28],
      [28, midY - 14], [s - 28, midY - 14],
      [28, midY + beamH + 14], [s - 28, midY + beamH + 14],
      [28, s - 68], [s / 2 - 24, s - 68], [s / 2 + 24, s - 68], [s - 28, s - 68]
    ];
    for (const [rx, ry] of rivets) {
      // 볼트 그림자 베이킹
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(rx + 2, ry + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      // 볼트 외형
      ctx.fillStyle = '#26292c';
      ctx.beginPath();
      ctx.arc(rx, ry, 5.5, 0, Math.PI * 2);
      ctx.fill();
      // 볼트 하이라이트
      ctx.fillStyle = '#7a828a';
      ctx.beginPath();
      ctx.arc(rx - 1.5, ry - 1.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 흘러내린 적갈색 녹물 얼룩 (Rust Runoff)
    const rustSpots = [
      { x: s * 0.22, y: 15, w: 22, h: 90 },
      { x: s * 0.52, y: midY + beamH - 2, w: 28, h: 110 },
      { x: s * 0.78, y: 15, w: 18, h: 75 }
    ];
    for (const rust of rustSpots) {
      const rGrad = ctx.createLinearGradient(rust.x, rust.y, rust.x, rust.y + rust.h);
      rGrad.addColorStop(0, 'rgba(120, 50, 20, 0.65)');
      rGrad.addColorStop(0.3, 'rgba(90, 40, 15, 0.45)');
      rGrad.addColorStop(1, 'rgba(60, 30, 10, 0)');
      ctx.fillStyle = rGrad;
      ctx.beginPath();
      ctx.moveTo(rust.x - rust.w / 2, rust.y);
      ctx.quadraticCurveTo(rust.x + (Math.random() - 0.5) * 8, rust.y + rust.h * 0.6, rust.x, rust.y + rust.h);
      ctx.quadraticCurveTo(rust.x + (Math.random() - 0.5) * 8, rust.y + rust.h * 0.4, rust.x + rust.w / 2, rust.y);
      ctx.closePath();
      ctx.fill();
    }

    // 하단 긁힌 경고 빗금(Hazard Stripe) 몰딩
    const kickY = s - 50;
    ctx.fillStyle = '#141618';
    ctx.fillRect(8, kickY, s - 16, 42);
    ctx.save();
    ctx.beginPath();
    ctx.rect(12, kickY + 4, s - 24, 34);
    ctx.clip();
    ctx.fillStyle = '#6c7278';
    for (let x = -s; x < s * 2; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, kickY + 38);
      ctx.lineTo(x + 20, kickY + 38);
      ctx.lineTo(x + 40, kickY);
      ctx.lineTo(x + 20, kickY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    addRealisticNoiseAndScratches(ctx, s, 0.14, 28);
  }, 512);

  // 2. 벙커 중앙 바닥 (금이 간 어두운 콘크리트 슬래브 타일)
  const bunkerFloorTex = makePhotoTexture((ctx, s) => {
    ctx.fillStyle = '#44484d';
    ctx.fillRect(0, 0, s, s);

    const half = s / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const x = gx * half;
        const y = gy * half;

        // 슬래브 타일별 불규칙한 톤 변화
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#494d52' : '#3e4247';
        ctx.fillRect(x + 4, y + 4, half - 8, half - 8);

        // 콘크리트 슬래브 모서리 음영
        ctx.strokeStyle = '#222528';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 4, y + 4, half - 8, half - 8);

        // 콘크리트 미세 균열(Crack) 라인
        if ((gx + gy) === 1 || gx === 0) {
          ctx.strokeStyle = 'rgba(20, 22, 24, 0.65)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x + 25, y + 30);
          ctx.lineTo(x + 55, y + 45);
          ctx.lineTo(x + 80, y + 40);
          ctx.lineTo(x + 115, y + 75);
          ctx.stroke();
        }
      }
    }

    // 슬래브 사이 검은 줄눈(Grout)
    ctx.strokeStyle = '#121416';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath();
    ctx.moveTo(half, 0); ctx.lineTo(half, s);
    ctx.moveTo(0, half); ctx.lineTo(s, half);
    ctx.stroke();

    addRealisticNoiseAndScratches(ctx, s, 0.15, 24);
  }, 512);

  // 3. 복도 바닥 (기름때 낀 낡은 다이아몬드 미끄럼 방지 철판)
  const corridorFloorTex = makePhotoTexture((ctx, s) => {
    ctx.fillStyle = '#26282b';
    ctx.fillRect(0, 0, s, s);

    // 격자형 다이아몬드 스터드 패턴
    const step = 28;
    for (let y = 14; y < s; y += step) {
      for (let x = 14; x < s; x += step) {
        // 다이아몬드 스터드 그림자
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 2, 7, 3.2, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        // 스터드 본체
        ctx.fillStyle = '#3a3e43';
        ctx.beginPath();
        ctx.ellipse(x, y, 6.5, 3, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        // 하이라이트
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.ellipse(x - 1, y - 1, 4, 1.8, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 복도 외곽 배수 홈 및 마모된 프레임
    ctx.strokeStyle = '#16181a';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, s - 12, s - 12);

    addRealisticNoiseAndScratches(ctx, s, 0.16, 32);
  }, 512);

  // 4. 일반 방 바닥 (오염된 에폭시 코팅 / 기계실 바닥)
  const roomFloorTex = makePhotoTexture((ctx, s) => {
    ctx.fillStyle = '#32363b';
    ctx.fillRect(0, 0, s, s);

    const step = s / 4;
    ctx.strokeStyle = '#1c1e21';
    ctx.lineWidth = 5;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0); ctx.lineTo(i * step, s);
      ctx.moveTo(0, i * step); ctx.lineTo(s, i * step);
      ctx.stroke();
    }

    // 모서리 오염 비네트
    const rad = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.7);
    rad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, s, s);

    addRealisticNoiseAndScratches(ctx, s, 0.13, 20);
  }, 512);

  // 5. 천장 (통풍 그릴 & 볼트 박힌 짙은 어둠의 패널)
  const ceilingTex = makePhotoTexture((ctx, s) => {
    ctx.fillStyle = '#1c1e20';
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = '#0e0f11';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, s - 10, s - 10);

    // 중앙 환기 덕트 슬릿 구멍들
    ctx.fillStyle = '#0a0b0c';
    for (let y = 60; y < s - 60; y += 22) {
      ctx.fillRect(50, y, s - 100, 8);
    }

    // 천장 모서리 짙은 그림자
    const cGrad = ctx.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s * 0.72);
    cGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    cGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = cGrad;
    ctx.fillRect(0, 0, s, s);

    addRealisticNoiseAndScratches(ctx, s, 0.12, 16);
  }, 512);

  // 6. 상하 개폐식 블라스트 도어 (스텐실 라벨 + 부식된 경고 빗금)
  const doorTex = makePhotoTexture((ctx, s) => {
    // 묵직한 강철 셔터 베이스
    const grad = ctx.createLinearGradient(0, 0, s, 0);
    grad.addColorStop(0, '#3e4246');
    grad.addColorStop(0.5, '#565b61');
    grad.addColorStop(1, '#3e4246');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // 가로 셔터 접합 홈
    for (let y = 0; y < s; y += 58) {
      ctx.fillStyle = '#1c1e20';
      ctx.fillRect(0, y, s, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, y + 8, s, 2);
    }

    // 좌우 가이드 레일 접점
    ctx.fillStyle = '#282b2e';
    ctx.fillRect(0, 0, 28, s);
    ctx.fillRect(s - 28, 0, 28, s);

    // 중앙 군사 스텐실 플레이트
    ctx.fillStyle = '#1c1e20';
    ctx.fillRect(s * 0.18, s * 0.42, s * 0.64, s * 0.16);
    ctx.strokeStyle = '#7c848c';
    ctx.lineWidth = 3;
    ctx.strokeRect(s * 0.18, s * 0.42, s * 0.64, s * 0.16);

    ctx.fillStyle = '#d0d8e0';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BLAST DOOR // SKELD', s / 2, s * 0.47);
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#9aa4ae';
    ctx.fillText('EMERGENCY BULKHEAD', s / 2, s * 0.53);

    // 하단 부식된 노란색/검은색 경고 빗금 (Hazard Stripe)
    const stripeH = 70;
    const stripeY = s - stripeH;
    ctx.fillStyle = '#16181a';
    ctx.fillRect(0, stripeY, s, stripeH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, stripeY + 4, s, stripeH - 8);
    ctx.clip();
    ctx.fillStyle = '#c49a2a'; // 낡고 바랜 황동/노란색
    for (let x = -s; x < s * 2; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + 22, s);
      ctx.lineTo(x + 44, stripeY);
      ctx.lineTo(x + 22, stripeY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    addRealisticNoiseAndScratches(ctx, s, 0.15, 26);
  }, 512);

  // [핵심] MeshLambertMaterial을 사용하여 픽셀당 PBR/노멀맵 연산을 완전히 제거하고,
  // 텍스처 자체에 구워진 질감과 명암으로 PS2 시대의 거칠고 매트한 아날로그 비주얼을 구현합니다.
  return {
    wall: new THREE.MeshLambertMaterial({
      map: wallTex,
      color: 0xffffff
    }),
    floorBunker: new THREE.MeshLambertMaterial({
      map: bunkerFloorTex,
      color: 0xffffff
    }),
    floorCorridor: new THREE.MeshLambertMaterial({
      map: corridorFloorTex,
      color: 0xffffff
    }),
    floorRoom: new THREE.MeshLambertMaterial({
      map: roomFloorTex,
      color: 0xffffff
    }),
    ceiling: new THREE.MeshLambertMaterial({
      map: ceilingTex,
      color: 0xffffff
    }),
    doorPanel: new THREE.MeshLambertMaterial({
      map: doorTex,
      color: 0xffffff
    }),
    doorFrame: new THREE.MeshLambertMaterial({
      color: 0x222528
    }),
    ledGreen: new THREE.MeshBasicMaterial({ color: 0x33ff77 }),
    ledRed: new THREE.MeshBasicMaterial({ color: 0xff3333 }),
    consoleScreen: new THREE.MeshBasicMaterial({ color: 0x90ffb8 })
  };
}
