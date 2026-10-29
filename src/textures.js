import * as THREE from 'three';

// =====================================================================
// 고해상도 프로시저럴 모노크롬 노멀맵(Normal Map) & 러프니스(Roughness) 생성기
// - 플라스틱 같은 인조적인 광택을 제거하기 위해, 하이트맵을 실제 RGB 노멀맵으로 변환하고
//   거친 무광 금속/콘크리트 질감과 PMREM 환경 반사맵을 생성합니다.
// =====================================================================

/**
 * 그레이스케일 캔버스(높이맵)를 Three.js용 탄젠트 공간 Normal Map 캔버스로 변환합니다.
 * 이를 통해 빛을 비췄을 때 플라스틱처럼 뭉개지지 않고 날카로운 철판/생체 요철이 살아납니다.
 */
export function heightToNormalCanvas(srcCanvas, strength = 2.8) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = w;
  dstCanvas.height = h;
  const dstCtx = dstCanvas.getContext('2d');
  const dstImg = dstCtx.createImageData(w, h);
  const dstData = dstImg.data;

  const getH = (x, y) => {
    const cx = (x + w) % w;
    const cy = (y + h) % h;
    return srcData[(cy * w + cx) * 4] / 255.0;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hL = getH(x - 1, y);
      const hR = getH(x + 1, y);
      const hU = getH(x, y - 1);
      const hD = getH(x, y + 1);

      let nx = (hL - hR) * strength;
      let ny = (hU - hD) * strength;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * w + x) * 4;
      dstData[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      dstData[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      dstData[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      dstData[idx + 3] = 255;
    }
  }

  dstCtx.putImageData(dstImg, 0, 0);
  return dstCanvas;
}

/**
 * 씬 전체의 플라스틱 느낌을 없애주는 프로시저럴 인더스트리얼 환경광(PMREM) 생성
 */
export function createIndustrialEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x141618);

  // 상단 차가운 형광 반사광 패널들
  const panelGeo = new THREE.PlaneGeometry(10, 3);
  const brightMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a6, side: THREE.DoubleSide });
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x2c3035, side: THREE.DoubleSide });

  const topPanel = new THREE.Mesh(panelGeo, brightMat);
  topPanel.position.set(0, 8, 0);
  topPanel.rotation.x = Math.PI / 2;
  envScene.add(topPanel);

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const sidePanel = new THREE.Mesh(panelGeo, dimMat);
    sidePanel.position.set(Math.cos(angle) * 9, 1, Math.sin(angle) * 9);
    sidePanel.lookAt(0, 1, 0);
    envScene.add(sidePanel);
  }

  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

function makeMaterialTextures(drawFn, size = 512, normalStrength = 3.0) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);

  const colorTex = new THREE.CanvasTexture(canvas);
  colorTex.wrapS = THREE.RepeatWrapping;
  colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.colorSpace = THREE.SRGBColorSpace;

  const normCanvas = heightToNormalCanvas(canvas, normalStrength);
  const normalTex = new THREE.CanvasTexture(normCanvas);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;

  return { colorTex, normalTex };
}

function addMicroGrain(ctx, size, alpha = 0.08) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * 255 * alpha;
    // 미세한 수평 브러시드 메탈 결 추가
    const streak = ((i / 4) % size < 256 ? 1 : -1) * 3;
    const delta = grain + streak;
    d[i] = Math.max(0, Math.min(255, d[i] + delta));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + delta));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + delta));
  }
  ctx.putImageData(img, 0, 0);
}

export function createIndustrialMaterials() {
  // 1. 무광 중공업 강철 방호벽 (노멀맵 + 거친 콘크리트/철판 질감)
  const wallTex = makeMaterialTextures((ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#323436');
    grad.addColorStop(0.15, '#404346');
    grad.addColorStop(0.5, '#36383b');
    grad.addColorStop(0.85, '#282a2c');
    grad.addColorStop(1, '#18191b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // 외곽 깊은 용접 홈
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, s - 10, s - 10);

    // 내부 패널 챔퍼 베벨
    ctx.strokeStyle = '#56595c';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, s - 36, s - 36);

    // 가로 보강 H빔
    ctx.fillStyle = '#222426';
    ctx.fillRect(12, s * 0.46, s - 24, s * 0.08);
    ctx.strokeStyle = '#525558';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, s * 0.46, s - 24, s * 0.08);

    // 세로 이음새
    ctx.strokeStyle = '#151618';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s / 2, 18);
    ctx.lineTo(s / 2, s * 0.46);
    ctx.moveTo(s / 2, s * 0.54);
    ctx.lineTo(s / 2, s - 56);
    ctx.stroke();

    // 리벳 볼트
    const rivets = [
      [32, 32], [s / 2 - 22, 32], [s / 2 + 22, 32], [s - 32, 32],
      [32, s * 0.42], [s - 32, s * 0.42],
      [32, s * 0.58], [s - 32, s * 0.58],
      [32, s - 70], [s / 2 - 22, s - 70], [s / 2 + 22, s - 70], [s - 32, s - 70]
    ];
    for (const [rx, ry] of rivets) {
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(rx, ry, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#686b6e';
      ctx.beginPath();
      ctx.arc(rx - 1.5, ry - 1.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 하단 경계 빗금 몰딩
    const kickY = s - 48;
    ctx.fillStyle = '#181818';
    ctx.fillRect(10, kickY, s - 20, 38);
    ctx.save();
    ctx.beginPath();
    ctx.rect(14, kickY + 6, s - 28, 26);
    ctx.clip();
    ctx.fillStyle = '#4f5255';
    for (let x = -s; x < s * 2; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, kickY + 32);
      ctx.lineTo(x + 18, kickY + 32);
      ctx.lineTo(x + 36, kickY + 6);
      ctx.lineTo(x + 18, kickY + 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    addMicroGrain(ctx, s, 0.1);
  }, 512, 3.4);

  // 2. 벙커 바닥 텍스처 (거친 무광 미끄럼 방지 논슬립 철판)
  const bunkerFloorTex = makeMaterialTextures((ctx, s) => {
    ctx.fillStyle = '#3d4043';
    ctx.fillRect(0, 0, s, s);

    const half = s / 2;
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        const x = gx * half;
        const y = gy * half;
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#424548' : '#383b3e';
        ctx.fillRect(x + 4, y + 4, half - 8, half - 8);

        ctx.strokeStyle = '#585b5e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 10, y + 10, half - 20, half - 20);

        // 체커 플레이트(다이아몬드 스터드) 요철
        ctx.fillStyle = '#2b2d30';
        for (let py = y + 28; py < y + half - 18; py += 24) {
          for (let px = x + 28; px < x + half - 18; px += 24) {
            ctx.fillRect(px - 4, py - 2, 8, 4);
          }
        }
      }
    }

    ctx.strokeStyle = '#18191a';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath();
    ctx.moveTo(half, 0); ctx.lineTo(half, s);
    ctx.moveTo(0, half); ctx.lineTo(s, half);
    ctx.stroke();

    addMicroGrain(ctx, s, 0.09);
  }, 512, 2.8);

  // 3. 복도 바닥 텍스처 (어두운 산업용 그레이팅 격자)
  const corridorFloorTex = makeMaterialTextures((ctx, s) => {
    ctx.fillStyle = '#242628';
    ctx.fillRect(0, 0, s, s);

    ctx.fillStyle = '#121314';
    const step = 32;
    for (let y = 16; y < s - 16; y += step) {
      for (let x = 16; x < s - 16; x += step) {
        ctx.fillRect(x, y, step - 8, step - 8);
      }
    }

    ctx.strokeStyle = '#383b3e';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, s - 14, s - 14);

    ctx.strokeStyle = '#101010';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, s, s);

    addMicroGrain(ctx, s, 0.09);
  }, 512, 3.2);

  // 4. 일반 방 바닥 텍스처
  const roomFloorTex = makeMaterialTextures((ctx, s) => {
    ctx.fillStyle = '#2d2f31';
    ctx.fillRect(0, 0, s, s);

    const step = s / 4;
    ctx.strokeStyle = '#18191b';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0); ctx.lineTo(i * step, s);
      ctx.moveTo(0, i * step); ctx.lineTo(s, i * step);
      ctx.stroke();
    }

    ctx.strokeStyle = '#3e4144';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, s - 20, s - 20);

    addMicroGrain(ctx, s, 0.09);
  }, 512, 2.6);

  // 5. 천장 텍스처
  const ceilingTex = makeMaterialTextures((ctx, s) => {
    ctx.fillStyle = '#1a1b1d';
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = '#0c0d0e';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, s - 8, s - 8);

    ctx.fillStyle = '#0e0f10';
    for (let y = 60; y < s - 60; y += 24) {
      ctx.fillRect(60, y, s - 120, 10);
    }

    addMicroGrain(ctx, s, 0.07);
  }, 512, 2.5);

  // 6. 1칸 상하 방호문 텍스처
  const doorTex = makeMaterialTextures((ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, s, 0);
    grad.addColorStop(0, '#44474a');
    grad.addColorStop(0.5, '#64686c');
    grad.addColorStop(1, '#44474a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    for (let y = 0; y < s; y += 64) {
      ctx.fillStyle = '#222426';
      ctx.fillRect(0, y, s, 9);
      ctx.fillStyle = '#7e8286';
      ctx.fillRect(0, y + 9, s, 4);
    }

    ctx.fillStyle = '#323436';
    ctx.fillRect(0, 0, 32, s);
    ctx.fillRect(s - 32, 0, 32, s);

    ctx.fillStyle = '#1e2022';
    ctx.fillRect(s * 0.24, s * 0.42, s * 0.52, s * 0.16);
    ctx.strokeStyle = '#aaaaaa';
    ctx.lineWidth = 4;
    ctx.strokeRect(s * 0.24, s * 0.42, s * 0.52, s * 0.16);

    ctx.fillStyle = '#d8d8d8';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BLAST DOOR', s / 2, s / 2);

    const stripeH = 64;
    const stripeY = s - stripeH;
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, stripeY, s, stripeH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, stripeY + 4, s, stripeH - 8);
    ctx.clip();
    ctx.fillStyle = '#b8b8b8';
    for (let x = -s; x < s * 2; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + 24, s);
      ctx.lineTo(x + 48, stripeY);
      ctx.lineTo(x + 24, stripeY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    addMicroGrain(ctx, s, 0.09);
  }, 512, 3.5);

  // roughness를 높이고 normalMap을 적용해 플라스틱 같은 번들거림을 완전히 제거합니다.
  return {
    wall: new THREE.MeshStandardMaterial({
      map: wallTex.colorTex,
      normalMap: wallTex.normalTex,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.82,
      metalness: 0.28
    }),
    floorBunker: new THREE.MeshStandardMaterial({
      map: bunkerFloorTex.colorTex,
      normalMap: bunkerFloorTex.normalTex,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.84,
      metalness: 0.22
    }),
    floorCorridor: new THREE.MeshStandardMaterial({
      map: corridorFloorTex.colorTex,
      normalMap: corridorFloorTex.normalTex,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.86,
      metalness: 0.25
    }),
    floorRoom: new THREE.MeshStandardMaterial({
      map: roomFloorTex.colorTex,
      normalMap: roomFloorTex.normalTex,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.85,
      metalness: 0.2
    }),
    ceiling: new THREE.MeshStandardMaterial({
      map: ceilingTex.colorTex,
      normalMap: ceilingTex.normalTex,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.9,
      metalness: 0.15
    }),
    doorPanel: new THREE.MeshStandardMaterial({
      map: doorTex.colorTex,
      normalMap: doorTex.normalTex,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.72,
      metalness: 0.42
    }),
    doorFrame: new THREE.MeshStandardMaterial({
      color: 0x222426,
      roughness: 0.78,
      metalness: 0.45
    }),
    ledGreen: new THREE.MeshBasicMaterial({ color: 0x33ff77 }),
    ledRed: new THREE.MeshBasicMaterial({ color: 0xff3333 }),
    consoleScreen: new THREE.MeshBasicMaterial({ color: 0xb8ffcc })
  };
}
