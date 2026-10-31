// =====================================================================
// The Skeld 및 다중 챕터 기반 3D 타일맵 데이터 & 유틸리티
// - 1 타일 = 가로 2.5m x 세로 2.5m, 천장 높이 = 3.2m
// - 문(D)은 반드시 1칸(1 타일)만 차지하며 위아래(수직)로 여닫힙니다.
//
// [타일 기호 범례]
//  ' ' : 빈 공간 (외부 심연)
//  '#' : 강철 방호벽 (바닥~천장 일체형 벽)
//  '.' : 복도 및 건조 통로 바닥
//  'W' : 침수 수로 수면 바닥 (물살 소리, 청각 유인 반경 확대)
//  'R' : 일반 구역/방 바닥 (엔진실, 펌프실, 보일러실, 창고 등)
//  'B' : 중앙 벙커/펌프장/승강기 기동장 바닥
//  'D' : 1칸 상하 개폐식 방호문 / 수문 (Vertical Blast Door / Sluice Gate)
//  'S' : 플레이어 스폰 위치
//  'G' : 중앙 비상 발전기 / 증기 터빈 코어
//  'C' : CCTV 관제 콘솔 데스크
//  'L' : 천장 형광등 조명
//  '1'~'4' : CCTV 감시 카메라 (1~4번)
// =====================================================================

export const TILE_SIZE = 2.5;
export const WALL_HEIGHT = 3.2;
export const MAP_STORAGE_KEY = 'monochrome_bunker_map_v4';

export const MAP_COLS = 48;
export const MAP_ROWS = 30;

// [CHAPTER 1] 지하 격리 벙커 구역 정의
export const ZONE_REGIONS_CH1 = [
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

// [CHAPTER 2] 침수 수로 터널 구역 정의
export const ZONE_REGIONS_CH2 = [
  { name: '중앙 저류조 광장 (고지대)', c0: 19, r0: 10, c1: 29, r1: 18 },
  { name: '고대 벽돌 아치 회랑 (고지대)', c0: 6, r0: 9, c1: 18, r1: 20 },
  { name: '북측 원통 방류 암거 (침수 수로)', c0: 3, r0: 3, c1: 43, r1: 5 },
  { name: '남측 원통 방류 암거 (침수 수로)', c0: 3, r0: 24, c1: 43, r1: 26 },
  { name: '서측 원형 배수관 (침수 수로)', c0: 3, r0: 5, c1: 5, r1: 24 },
  { name: '동측 침수 저류 수로', c0: 32, r0: 5, c1: 36, r1: 24 },
  { name: '수문 밸브 가압실 (고지대)', c0: 6, r0: 6, c1: 15, r1: 7 },
  { name: '사이펀 집수정 (고지대)', c0: 6, r0: 22, c1: 15, r1: 23 },
  { name: '침전 여과 집수조 (고지대)', c0: 37, r0: 6, c1: 43, r1: 8 },
  { name: '비상 차단 격벽실 (고지대)', c0: 38, r0: 10, c1: 44, r1: 19 },
  { name: '오폐수 슬러지 처리장 (고지대)', c0: 37, r0: 21, c1: 43, r1: 23 }
];

// [CHAPTER 3] 심연 지열 갱도 구역 정의
export const ZONE_REGIONS_CH3 = [
  { name: '중앙 승강기 기동장', c0: 19, r0: 2, c1: 29, r1: 10 },
  { name: '제1 굴착 발파 구역', c0: 4, r0: 2, c1: 10, r1: 7 },
  { name: '지질 코어 보관소', c0: 12, r0: 8, c1: 17, r1: 13 },
  { name: '지열 발전 터빈실', c0: 1, r0: 11, c1: 5, r1: 18 },
  { name: '갱도 보안 초소', c0: 10, r0: 13, c1: 14, r1: 17 },
  { name: '광석 분쇄소', c0: 4, r0: 21, c1: 10, r1: 26 },
  { name: '지열 증기 보일러실', c0: 13, r0: 19, c1: 18, r1: 24 },
  { name: '광차 레일 환승 허브', c0: 20, r0: 18, c1: 27, r1: 26 },
  { name: '지질 통신실', c0: 27, r0: 12, c1: 32, r1: 16 },
  { name: '폐쇄 채굴 갱도', c0: 29, r0: 23, c1: 34, r1: 27 },
  { name: '화약 저장고', c0: 34, r0: 2, c1: 40, r1: 7 },
  { name: '환풍 통풍탑', c0: 32, r0: 9, c1: 36, r1: 13 },
  { name: '심부 시추실', c0: 41, r0: 12, c1: 46, r1: 17 },
  { name: '중장비 정비고', c0: 34, r0: 19, c1: 40, r1: 24 }
];

// 하위 호환용 기본 구역
export const ZONE_REGIONS = ZONE_REGIONS_CH1;

// 1. 제1장: 지하 격리 벙커 (Skeld 기반)
export function generateChapter1Map() {
  const g = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(' '));

  const fill = (c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) g[r][c] = ch;
      }
    }
  };
  const set = (c, r, ch) => {
    if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) g[r][c] = ch;
  };

  // 1. 중앙 벙커 (식당)
  fill(20, 3, 28, 9, 'B');
  set(24, 3, 'C'); // CCTV 콘솔
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

  // 3. 복도 통로 ('.')
  fill(10, 5, 18, 6, '.');
  fill(14, 7, 15, 8, '.');
  fill(7, 7, 8, 21, '.');
  fill(5, 14, 6, 15, '.');
  fill(9, 15, 10, 16, '.');
  fill(10, 24, 20, 25, '.');
  fill(15, 24, 16, 24, '.');
  fill(23, 11, 24, 18, '.');
  fill(25, 14, 27, 15, '.');
  fill(30, 5, 34, 6, '.');
  fill(37, 7, 38, 19, '.');
  fill(36, 10, 36, 11, '.');
  fill(39, 14, 41, 15, '.');
  fill(27, 21, 34, 22, '.');
  fill(31, 23, 32, 23, '.');

  // 4. 방호문
  set(19, 6, 'D'); // 서쪽 방호문
  set(29, 6, 'D'); // 동쪽 방호문
  set(24, 10, 'D'); // 남쪽 방호문

  // 5. CCTV 카메라
  set(38, 14, '1');
  set(23, 14, '2');
  set(14, 5, '3');
  set(8, 15, '4');

  return autoWrapWalls(g).map(row => row.join(''));
}

// 2. 제2장: 침수 수로 터널 (3D 원통형 하수관 + 고지대 아치형 벽돌 회랑 + 경사로/사다리 고저차 구조)
// - Level 0 (Y = 0.0m, 수면 Y = 0.56m): 10각 원통형 콘크리트 방류 암거 ('W')
// - Level 1 (Y = 1.40m): 반원 볼트 아치 천장의 고대 벽돌 회랑 ('R', 'B', '.')
// - 'M' (오르막 경사로), 'H' (전진 자동 등반 벽면 철제 사다리)로만 Level 0 <-> Level 1 이동 가능!
export function generateChapter2WaterTunnelMap() {
  const g = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(' '));

  const fill = (c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) g[r][c] = ch;
      }
    }
  };
  const set = (c, r, ch) => {
    if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) g[r][c] = ch;
  };

  // 1. [Level 0: 저지대 10각 원통형 침수 하수관 네트워크 ('W', 바닥 Y=0.0m, 수면 Y=0.56m)]
  fill(3, 3, 43, 4, 'W');    // 북측 주 원통 방류 암거 (동서 관통)
  fill(3, 25, 43, 26, 'W');  // 남측 주 원통 방류 암거 (동서 관통)
  fill(3, 3, 4, 26, 'W');    // 서측 원통 배수관 (남북 관통)
  fill(23, 5, 25, 8, 'W');   // 중앙 북측 유입 수로
  fill(23, 20, 25, 24, 'W'); // 중앙 남측 방류 수로
  fill(33, 5, 35, 24, 'W');  // 동측 대형 침수 저류 수로 (남북 관통)
  // 사다리 및 경사로 접합용 수로 포켓
  fill(16, 5, 17, 7, 'W');   // 북서 밸브실 연결 수로
  fill(16, 22, 17, 24, 'W'); // 남서 사이펀실 연결 수로
  fill(35, 13, 36, 15, 'W'); // 동측 격벽실 사다리 포켓

  // 2. [Level 1: 고지대 아치형 건조 구역 ('B', 'R', '.', 바닥 Y=1.40m, 상부 반원 벽돌 아치 천장)]
  // 2-1. 중앙 저류조 기동 광장 ('B')
  fill(20, 11, 28, 17, 'B');
  set(24, 10, 'D'); // 북쪽 수문 격벽 (1칸 단일 방호문)
  set(24, 18, 'D'); // 남쪽 수문 격벽 (1칸 단일 방호문)
  set(19, 14, 'D'); // 서쪽 아치 회랑 연결 수문
  set(29, 14, 'D'); // 동쪽 고가 캣워크 연결 수문
  fill(30, 14, 31, 14, '.'); // 동쪽 고지대 캣워크 교량

  set(24, 12, 'C'); // 유량 및 CCTV 관제 콘솔
  set(24, 14, 'G'); // 중앙 고압 배수 터빈 코어
  set(24, 16, 'S'); // 플레이어 스폰 지점
  set(21, 14, 'L');
  set(27, 14, 'L');

  // 2-2. 서측 고대 붉은 벽돌 아치 회랑 및 기둥 미로 ('R', Level 1)
  fill(6, 9, 18, 20, 'R');
  // 거대한 2x2 벽돌 아치 기둥 4개 ('#')
  fill(8, 11, 9, 12, '#');
  fill(14, 11, 15, 12, '#');
  fill(8, 16, 9, 17, '#');
  fill(14, 16, 15, 17, '#');
  set(11, 11, 'L');
  set(11, 17, 'L');
  set(16, 14, 'L');
  set(11, 14, '3'); // CAM 03: 고대 벽돌 아치 회랑

  // 2-3. 북서 수문 밸브 가압실 ('R', Level 1)
  fill(6, 6, 14, 7, 'R');
  set(10, 6, 'L');

  // 2-4. 남서 사이펀 집수정 제어실 ('R', Level 1)
  fill(6, 22, 14, 23, 'R');
  set(10, 22, 'L');

  // 2-5. 동측 비상 차단 격벽실 ('R', Level 1)
  fill(38, 10, 44, 19, 'R');
  fill(40, 13, 41, 16, '#'); // 중앙 사각 벽돌 기둥
  set(39, 12, 'L');
  set(43, 17, 'L');

  // 2-6. 북동 침전 여과 집수조 테라스 ('R', Level 1)
  fill(37, 6, 43, 8, 'R');
  set(40, 7, 'L');

  // 2-7. 남동 오폐수 슬러지 처리장 테라스 ('R', Level 1)
  fill(37, 21, 43, 23, 'R');
  set(40, 22, 'L');

  // 3. [유일한 고저차 전환 루트: 오르막 경사로('M') & 전진 등반 사다리('H')]
  // 오르막 경사로 ('M' : Level 0 수로 <-> Level 1 복도 완만한 경사 연결)
  set(24, 9, 'M');           // 중앙 광장 북측 경사로 (북=W, 남=D 수문)
  set(24, 19, 'M');          // 중앙 광장 남측 경사로 (북=D 수문, 남=W)
  set(32, 14, 'M');          // 동측 교량 경사로 (서=., 동=W)
  set(15, 6, 'M');           // 북서 밸브실 경사로 (서=R, 동=W)
  set(15, 22, 'M');          // 남서 사이펀실 경사로 (서=R, 동=W)
  set(36, 22, 'M');          // 남동 슬러지장 경사로 (서=W, 동=R)

  // 벽면 철제 사다리 ('H' : 수로에서 벽 쪽으로 전진하면 위로 기어오름)
  set(5, 6, 'H');            // 서측 배수관 북단 -> 북서 밸브실 사다리 (서=W, 동=R)
  set(5, 14, 'H');           // 서측 배수관 중앙 -> 고대 벽돌 아치 회랑 사다리 (서=W, 동=R)
  set(5, 22, 'H');           // 서측 배수관 남단 -> 남서 사이펀실 사다리 (서=W, 동=R)
  set(17, 8, 'H');           // 북서 수로 포켓 -> 벽돌 아치 회랑 북동 사다리 (북=W, 남=R)
  set(17, 21, 'H');          // 남서 수로 포켓 -> 벽돌 아치 회랑 남동 사다리 (북=R, 남=W)
  set(37, 14, 'H');          // 동측 저류 수로 -> 비상 차단 격벽실 사다리 (서=W, 동=R)
  set(36, 7, 'H');           // 동측 저류 수로 -> 북동 침전 여과조 사다리 (서=W, 동=R)

  // 4. [원통형 하수관('W') 내부 방폭 유도등('L') 및 감시 카메라('1', '2', '4')]
  set(8, 4, 'L');
  set(18, 4, 'L');
  set(24, 4, 'L');
  set(30, 4, 'L');
  set(38, 4, 'L');
  set(4, 10, 'L');
  set(4, 14, '4'); // CAM 04: 서측 원형 배수관
  set(4, 19, 'L');
  set(8, 25, 'L');
  set(18, 25, 'L');
  set(24, 25, '2'); // CAM 02: 남측 원통 방류 암거
  set(30, 25, 'L');
  set(38, 25, 'L');
  set(34, 10, 'L');
  set(34, 14, '1'); // CAM 01: 동측 침수 저류 수로
  set(34, 19, 'L');

  return autoWrapWalls(g).map(row => row.join(''));
}

// 3. 제3장: 심연 지열 갱도 (Geothermal Mine Shaft)
// - 심도 300m 지하 시추 갱도, 광차 레일 통로, 지열 증기 터빈, 암반 지대
export function generateChapter3MineShaftMap() {
  const g = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(' '));

  const fill = (c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) g[r][c] = ch;
      }
    }
  };
  const set = (c, r, ch) => {
    if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) g[r][c] = ch;
  };

  // 1. 중앙 승강기 기동장 (Elevator Hoist Station)
  fill(20, 3, 28, 9, 'B');
  set(24, 3, 'C'); // 승강기 통제 콘솔
  set(24, 6, 'G'); // 지열 증기 터빈 코어
  set(24, 8, 'S'); // 플레이어 스폰
  set(21, 5, 'L');
  set(27, 5, 'L');

  // 2. 갱도 주요 시설 및 채굴장 ('R')
  fill(5, 3, 9, 6, 'R');     // 제1 굴착 발파 구역
  set(7, 4, 'L');
  fill(13, 9, 16, 12, 'R');  // 지질 코어 보관소
  set(14, 10, 'L');
  fill(2, 12, 4, 17, 'R');   // 지열 발전 터빈실
  set(3, 14, 'L');
  fill(11, 14, 13, 16, 'R'); // 갱도 보안 초소
  set(12, 15, 'L');
  fill(5, 22, 9, 25, 'R');   // 광석 분쇄소
  set(7, 23, 'L');
  fill(14, 20, 17, 23, 'R'); // 지열 증기 보일러실
  set(15, 21, 'L');
  fill(21, 19, 26, 25, 'R'); // 광차 레일 환승 허브
  set(23, 22, 'L');
  fill(28, 13, 31, 15, 'R'); // 지질 통신실
  set(29, 14, 'L');
  fill(30, 24, 33, 26, 'R'); // 폐쇄 채굴 갱도
  fill(35, 3, 39, 6, 'R');   // 화약 저장고
  set(37, 4, 'L');
  fill(33, 10, 35, 12, 'R'); // 환풍 통풍탑
  fill(42, 13, 45, 16, 'R'); // 심부 시추실
  set(43, 14, 'L');
  fill(35, 20, 39, 23, 'R'); // 중장비 정비고
  set(37, 21, 'L');

  // 3. 광차 궤도 및 암반 갱도 통로 ('.')
  fill(10, 5, 18, 6, '.');
  fill(14, 7, 15, 8, '.');
  fill(7, 7, 8, 21, '.');
  fill(5, 14, 6, 15, '.');
  fill(9, 15, 10, 16, '.');
  fill(10, 24, 20, 25, '.');
  fill(15, 24, 16, 24, '.');
  fill(23, 11, 24, 18, '.');
  fill(25, 14, 27, 15, '.');
  fill(30, 5, 34, 6, '.');
  fill(37, 7, 38, 19, '.');
  fill(36, 10, 36, 11, '.');
  fill(39, 14, 41, 15, '.');
  fill(27, 21, 34, 22, '.');
  fill(31, 23, 32, 23, '.');

  // 4. 지열 갱도 고강도 방호문
  set(19, 6, 'D'); // 서쪽 갱도 차단문
  set(29, 6, 'D'); // 동쪽 갱도 차단문
  set(24, 10, 'D'); // 남쪽 광차 격벽문

  // 5. 갱도 CCTV 감시 카메라
  set(38, 14, '1'); // 동쪽 갱도 카메라
  set(23, 14, '2'); // 남쪽 레일 카메라
  set(14, 5, '3');  // 북서 채굴 카메라
  set(8, 15, '4');  // 서쪽 터빈 카메라

  return autoWrapWalls(g).map(row => row.join(''));
}

export const CHAPTER_CONFIGS = {
  chapter1: {
    id: 'chapter1',
    num: 1,
    name: '지하 격리 벙커',
    title: '제1장: 버려진 식당 벙커',
    badge: 'CHAPTER 01',
    desc: '비상 발전기가 침묵한 중앙 식당. 환기구의 신호음이 감지됩니다.',
    diff: 'easy',
    data: generateChapter1Map(),
    zoneRegions: ZONE_REGIONS_CH1,
    ventNodes: [
      { id: 'vent_reactor',   col: 3,  row: 16, zone: '원자로실' },
      { id: 'vent_upper_eng', col: 6,  row: 4,  zone: '상부엔진' },
      { id: 'vent_medbay',    col: 15, row: 11, zone: '의무실' },
      { id: 'vent_elec',      col: 16, row: 21, zone: '전기실' },
      { id: 'vent_admin',     col: 29, row: 14, zone: '관리실' },
      { id: 'vent_weapons',   col: 36, row: 5,  zone: '무기고' },
      { id: 'vent_nav',       col: 43, row: 15, zone: '항해실' },
      { id: 'vent_shields',   col: 36, row: 22, zone: '보호막실' }
    ],
    monsterType: 'stalker'
  },
  chapter2: {
    id: 'chapter2',
    num: 2,
    name: '침수 수로 터널',
    title: '제2장: 고대 저류조와 침수 수로',
    badge: 'CHAPTER 02',
    desc: '붉은 벽돌 볼트 기둥과 허벅지까지 차오른 침수 수로. 주황색 나트륨등 아래에서 물살을 가르는 소리가 괴물을 자극합니다.',
    diff: 'normal',
    data: generateChapter2WaterTunnelMap(),
    zoneRegions: ZONE_REGIONS_CH2,
    ventNodes: [
      { id: 'vent_ch2_valves',  col: 9,  row: 6,  zone: '수문 밸브 가압실' },
      { id: 'vent_ch2_pillar',  col: 11, row: 14, zone: '고대 벽돌 아치 회랑' },
      { id: 'vent_ch2_siphon',  col: 9,  row: 23, zone: '사이펀 집수정' },
      { id: 'vent_ch2_west',    col: 3,  row: 14, zone: '서측 원형 배수관' },
      { id: 'vent_ch2_basin',   col: 40, row: 6,  zone: '침전 여과 집수조' },
      { id: 'vent_ch2_east',    col: 42, row: 14, zone: '비상 차단 격벽실' },
      { id: 'vent_ch2_sludge',  col: 40, row: 22, zone: '오폐수 슬러지 처리장' },
      { id: 'vent_ch2_north_f', col: 24, row: 3,  zone: '북측 원통 방류 암거' }
    ],
    monsterType: 'hydro_lurker'
  },
  chapter3: {
    id: 'chapter3',
    num: 3,
    name: '심연 지열 갱도',
    title: '제3장: 심연의 지열 갱도',
    badge: 'CHAPTER 03',
    desc: '심도 300m 지하 광산. 증기 터빈과 광차 레일 너머에서 지진 같은 진동이 울립니다.',
    diff: 'hard',
    data: generateChapter3MineShaftMap(),
    zoneRegions: ZONE_REGIONS_CH3,
    ventNodes: [
      { id: 'vent_ch3_drill',  col: 6,  row: 4,  zone: '발파 굴착 구역' },
      { id: 'vent_ch3_crush',  col: 6,  row: 23, zone: '광석 분쇄소' },
      { id: 'vent_ch3_boiler', col: 16, row: 21, zone: '지열 보일러실' },
      { id: 'vent_ch3_rail',   col: 23, row: 22, zone: '광차 레일 허브' },
      { id: 'vent_ch3_mag',    col: 37, row: 5,  zone: '화약 저장고' },
      { id: 'vent_ch3_fan',    col: 43, row: 15, zone: '환풍 갱도' },
      { id: 'vent_ch3_depot',  col: 37, row: 21, zone: '중장비 정비고' }
    ],
    monsterType: 'geo_goliath'
  }
};

/**
 * 보행 가능한 타일(., W, R, B, D, S, G, C, L, 1~4)과 인접한 빈칸(' ')을
 * 자동으로 강철 벽('#')으로 둘러쌉니다.
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

  const scoreNS = (isWalk(n) ? 2 : 0) + (isWalk(s) ? 2 : 0) + (isWall(w) ? 2 : 0) + (isWall(e) ? 2 : 0);
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

// 기본 시작 맵: 챕터 1 격리 벙커
export const TILE_MAP = CHAPTER_CONFIGS.chapter1.data;

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

export function getTile(col, row, mapData = TILE_MAP) {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return '#';
  return (mapData && mapData[row]) ? mapData[row][col] || ' ' : ' ';
}

export function getZoneName(col, row, char, chapterId = 'chapter1') {
  if (char === 'D') return '방호문/수문 통로';
  if (char === 'M') return '오르막 연결 경사로';
  if (char === 'H') return '비상 철제 사다리';
  const cfg = CHAPTER_CONFIGS[chapterId] || CHAPTER_CONFIGS.chapter1;
  const regions = cfg.zoneRegions || ZONE_REGIONS_CH1;
  for (const z of regions) {
    if (col >= z.c0 && col <= z.c1 && row >= z.r0 && row <= z.r1) {
      return z.name;
    }
  }
  if (['B', 'S', 'G', 'C'].includes(char)) {
    return chapterId === 'chapter2' ? '중앙 저류조 광장 (고지대)' : chapterId === 'chapter3' ? '중앙 승강기 기동장' : '벙커 (중앙 식당)';
  }
  if (char === 'W') return '원통형 침수 하수관 (저지대)';
  if (char === 'R') return '아치형 내부 구역';
  return `구역 복도 [${col}, ${row}]`;
}
