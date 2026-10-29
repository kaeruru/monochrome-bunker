// =====================================================================
// The Skeld 기반 3D 타일맵 데이터 & 유틸리티
// - 1 타일 = 가로 2.5m x 세로 2.5m, 천장 높이 = 3.2m
// - 문(D)은 반드시 1칸(1 타일)만 차지하며 위아래(수직)로 여닫힙니다.
//
// [타일 기호 범례]
//  ' ' : 빈 공간 (외부 심연)
//  '#' : 강철 방호벽 (바닥~천장 일체형 벽)
//  '.' : 복도 바닥
//  'R' : 일반 구역/방 바닥 (엔진실, 의무실, 창고 등)
//  'B' : 중앙 벙커(식당) 바닥
//  'D' : 1칸 상하 개폐식 방호문 (Vertical Blast Door)
//  'S' : 플레이어 스폰 위치 (벙커 내부)
//  'G' : 중앙 비상 발전기 코어
//  'C' : CCTV 관제 콘솔 데스크
//  'L' : 천장 형광등 조명
//  '1'~'4' : CCTV 감시 카메라 (1~4번)
// =====================================================================

export const TILE_SIZE = 2.5;
export const WALL_HEIGHT = 3.2;
export const MAP_STORAGE_KEY = 'monochrome_bunker_map_v3';

export const MAP_COLS = 48;
export const MAP_ROWS = 30;

// 구역 이름 정의 (플레이어 현재 위치 표시용)
export const ZONE_REGIONS = [
  { name: '벙커 (중앙 식당)', c0: 19, r0: 2, c1: 29, r1: 10 },
  { name: '상부 엔진실', c0: 4, r0: 2, c1: 10, r1: 7 },
  { name: '의무실', c0: 12, r0: 8, c1: 17, r1: 13 },
  { name: '원자로실', c0: 1, r0: 11, c1: 5, r1: 18 },
  { name: '보안실', c0: 10, r0: 13, c1: 14, r1: 17 },
  { name: '하부 엔진실', c0: 4, r0: 21, c1: 10, r1: 26 },
  { name: '전기실', c0: 13, r0: 19, c1: 18, r1: 24 },
  { name: '중앙 창고', c0: 20, r0: 18, c1: 27, r1: 26 },
  { name: '관리실', c0: 27, r0: 12, c1: 32, r1: 16 },
  { name: '통신실', c0: 29, r0: 23, c1: 34, r1: 27 },
  { name: '무기고', c0: 34, r0: 2, c1: 40, r1: 7 },
  { name: '산소공급실', c0: 32, r0: 9, c1: 36, r1: 13 },
  { name: '항해실', c0: 41, r0: 12, c1: 46, r1: 17 },
  { name: '보호막 제어실', c0: 34, r0: 19, c1: 40, r1: 24 }
];

// 프로그래밍 방식으로 오차 없이 기본 맵 생성 후 외벽(#) 자동 마감
function generateCleanSkeldMap() {
  const g = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(' '));

  const fill = (c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) {
          g[r][c] = ch;
        }
      }
    }
  };
  const set = (c, r, ch) => {
    if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) g[r][c] = ch;
  };

  // 1. 중앙 벙커 (식당): cols 20..28, rows 3..9 (9x7 내부)
  fill(20, 3, 28, 9, 'B');
  set(24, 3, 'C'); // 북쪽 벽 앞 CCTV 콘솔
  set(24, 6, 'G'); // 중앙 발전기 코어
  set(24, 8, 'S'); // 플레이어 스폰
  set(21, 5, 'L');
  set(27, 5, 'L');

  // 2. 방(Rooms) 내부 바닥 ('R')
  fill(5, 3, 9, 6, 'R');     // 상부 엔진실
  set(7, 4, 'L');
  fill(13, 9, 16, 12, 'R');  // 의무실
  set(14, 10, 'L');
  fill(2, 12, 4, 17, 'R');   // 원자로실
  set(3, 14, 'L');
  fill(11, 14, 13, 16, 'R'); // 보안실
  set(12, 15, 'L');
  fill(5, 22, 9, 25, 'R');   // 하부 엔진실
  set(7, 23, 'L');
  fill(14, 20, 17, 23, 'R'); // 전기실
  set(15, 21, 'L');
  fill(21, 19, 26, 25, 'R'); // 중앙 창고
  set(23, 22, 'L');
  fill(28, 13, 31, 15, 'R'); // 관리실
  set(29, 14, 'L');
  fill(30, 24, 33, 26, 'R'); // 통신실
  fill(35, 3, 39, 6, 'R');   // 무기고
  set(37, 4, 'L');
  fill(33, 10, 35, 12, 'R'); // 산소공급실
  fill(42, 13, 45, 16, 'R'); // 항해실
  set(43, 14, 'L');
  fill(35, 20, 39, 23, 'R'); // 보호막 제어실
  set(37, 21, 'L');

  // 3. 복도 통로 ('.') - 모든 주요 복도와 입구를 폭 2칸(5.0m)으로 확장하여 시야 및 회피 공간 확보
  // [북서 3번 복도] 상부 엔진(9,5) <-> 벙커 서쪽문(19,6)
  fill(10, 5, 18, 6, '.');
  fill(14, 7, 15, 8, '.'); // 의무실 입구

  // [서쪽 4번 교차 복도] 상부엔진(7,6) <-> 하부엔진(7,22)
  fill(7, 7, 8, 21, '.');
  fill(5, 14, 6, 15, '.');  // 원자로 입구
  fill(9, 15, 10, 16, '.'); // 보안실 입구 (폭 2칸)

  // [남서 복도] 하부엔진(9,24) <-> 창고(21,24)
  fill(10, 24, 20, 25, '.'); // 남서 주 복도 (폭 2칸으로 확장)
  fill(15, 24, 16, 24, '.'); // 전기실 입구

  // [남쪽 2번 복도] 벙커 남쪽문(24,10) <-> 창고(24,18)
  fill(23, 11, 24, 18, '.');
  fill(25, 14, 27, 15, '.'); // 관리실 입구 (폭 2칸)

  // [동쪽 복도] 벙커 동쪽문(29,6) <-> 무기고(35,5)
  fill(30, 5, 34, 6, '.');

  // [동쪽 1번 허브 복도] 무기고(37,6) <-> 보호막실(37,20)
  fill(37, 7, 38, 19, '.');
  fill(36, 10, 36, 11, '.'); // 산소실 입구 (폭 2칸)
  fill(39, 14, 41, 15, '.'); // 항해실 입구

  // [남동 복도] 창고(26,22) <-> 보호막실(35,22) & 통신실
  fill(27, 21, 34, 22, '.'); // 남동 주 복도 (폭 2칸으로 확장)
  fill(31, 23, 32, 23, '.'); // 통신실 입구 (폭 2칸)

  // 4. 벙커 3대 방호문 (반드시 1칸 'D' 차지, 양옆은 벽 '#')
  set(19, 6, 'D'); // 서쪽 방호문 (1칸)
  set(29, 6, 'D'); // 동쪽 방호문 (1칸)
  set(24, 10, 'D'); // 남쪽 방호문 (1칸)

  // 5. CCTV 카메라 4대 (1~4번 복도 교차로)
  set(38, 14, '1'); // CAM 1: 동쪽 허브 복도
  set(23, 14, '2'); // CAM 2: 남쪽 창고-관리실 복도
  set(14, 5, '3');  // CAM 3: 북서 의무실-상부엔진 복도
  set(8, 15, '4');  // CAM 4: 서쪽 원자로-보안실 복도

  // 6. 모든 바닥/문/오브젝트 타일 주변의 빈 공간(' ')을 강철 벽('#')으로 자동 마감!
  return autoWrapWalls(g).map(row => row.join(''));
}

/**
 * 보행 가능한 타일(., R, B, D, S, G, C, L, 1~4)과 인접한 빈칸(' ')을
 * 자동으로 강철 벽('#')으로 둘러쌉니다. (방이나 복도를 그릴 때 벽이 비는 현상 완전 방지)
 */
export function autoWrapWalls(grid2D) {
  const rows = grid2D.length;
  const cols = grid2D[0].length;
  const out = grid2D.map(r => [...r]);

  const isFloorLike = (ch) => ch && ch !== ' ' && ch !== '#';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (out[r][c] !== ' ') continue;

      let touchesFloor = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (isFloorLike(grid2D[nr][nc])) {
              touchesFloor = true;
              break;
            }
          }
        }
        if (touchesFloor) break;
      }

      if (touchesFloor) {
        out[r][c] = '#';
      }
    }
  }
  return out;
}

/**
 * 1칸 문(D)의 방향을 주변 타일 상태로 정확히 판별합니다.
 * 반환값:
 *  'NS' : 북-남으로 통행하는 문 (문틀과 문짝은 동-서 가로로 놓임)
 *  'EW' : 동-서로 통행하는 문 (문틀과 문짝은 북-남 세로로 놓임)
 */
export function getDoorOrientation(grid, c, r) {
  const get = (col, row) => {
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return '#';
    return grid[row][col] || ' ';
  };
  const isWalk = (ch) => ch !== ' ' && ch !== '#';
  const isWall = (ch) => ch === '#' || ch === ' ';

  const n = get(c, r - 1);
  const s = get(c, r + 1);
  const w = get(c - 1, r);
  const e = get(c + 1, r);

  // 북-남 통행 점수 (북/남이 바닥이고 서/동이 벽일수록 높음)
  const scoreNS = (isWalk(n) ? 2 : 0) + (isWalk(s) ? 2 : 0) + (isWall(w) ? 2 : 0) + (isWall(e) ? 2 : 0);
  // 동-서 통행 점수 (동/서가 바닥이고 북/남이 벽일수록 높음)
  const scoreEW = (isWalk(e) ? 2 : 0) + (isWalk(w) ? 2 : 0) + (isWall(n) ? 2 : 0) + (isWall(s) ? 2 : 0);

  return scoreNS >= scoreEW ? 'NS' : 'EW';
}

export function normalizeMapStrings(lines) {
  const clean = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const raw = (lines && lines[r]) ? String(lines[r]) : '';
    clean.push(raw.padEnd(MAP_COLS, ' ').slice(0, MAP_COLS));
  }
  return clean;
}

export const TILE_MAP = generateCleanSkeldMap();

export function tileToWorld(col, row) {
  const offsetX = (MAP_COLS * TILE_SIZE) / 2;
  const offsetZ = (MAP_ROWS * TILE_SIZE) / 2;
  return {
    x: col * TILE_SIZE - offsetX + TILE_SIZE / 2,
    z: row * TILE_SIZE - offsetZ + TILE_SIZE / 2
  };
}

export function worldToTile(x, z) {
  const offsetX = (MAP_COLS * TILE_SIZE) / 2;
  const offsetZ = (MAP_ROWS * TILE_SIZE) / 2;
  return {
    col: Math.floor((x + offsetX) / TILE_SIZE),
    row: Math.floor((z + offsetZ) / TILE_SIZE)
  };
}

export function getTile(col, row) {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return '#';
  return TILE_MAP[row]?.[col] || ' ';
}

export function getZoneName(col, row, char) {
  if (char === 'D') return '방호문 통로';
  for (const z of ZONE_REGIONS) {
    if (col >= z.c0 && col <= z.c1 && row >= z.r0 && row <= z.r1) {
      return z.name;
    }
  }
  if (['B', 'S', 'G', 'C'].includes(char)) return '벙커 (중앙 식당)';
  if (char === 'R') return '내부 구역 (방)';
  return `시설 복도 [${col}, ${row}]`;
}
