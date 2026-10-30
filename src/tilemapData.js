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
  { name: '중앙 배수 펌프장', c0: 19, r0: 2, c1: 29, r1: 10 },
  { name: '여과 정화실', c0: 4, r0: 2, c1: 10, r1: 7 },
  { name: '배수 밸브실', c0: 12, r0: 8, c1: 17, r1: 13 },
  { name: '수문 동력실', c0: 1, r0: 11, c1: 5, r1: 18 },
  { name: '유량 감시실', c0: 10, r0: 13, c1: 14, r1: 17 },
  { name: '제2 배수 펌프실', c0: 4, r0: 21, c1: 10, r1: 26 },
  { name: '침수 배전반실', c0: 13, r0: 19, c1: 18, r1: 24 },
  { name: '오폐수 정화조', c0: 20, r0: 18, c1: 27, r1: 26 },
  { name: '수문 통제실', c0: 27, r0: 12, c1: 32, r1: 16 },
  { name: '비상 배수 터널', c0: 29, r0: 23, c1: 34, r1: 27 },
  { name: '비상 잠수 도크', c0: 34, r0: 2, c1: 40, r1: 7 },
  { name: '환기 압축실', c0: 32, r0: 9, c1: 36, r1: 13 },
  { name: '수질 분석실', c0: 41, r0: 12, c1: 46, r1: 17 },
  { name: '제1 방수벽 통제소', c0: 34, r0: 19, c1: 40, r1: 24 }
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

// 2. 제2장: 침수 수로 터널 (Flooded Drainage Tunnel)
// - 깊은 지하 수로, 탁한 물살('W'), 수문 밸브, 펌프 제어 시설
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

  // 1. 중앙 배수 펌프장 (고지대 건조 구역)
  fill(20, 3, 28, 9, 'B');
  set(24, 3, 'C'); // CCTV 콘솔
  set(24, 6, 'G'); // 배수 펌프 주 발전기
  set(24, 8, 'S'); // 플레이어 스폰
  set(21, 5, 'L');
  set(27, 5, 'L');

  // 2. 주요 펌프 및 정화 시설 방들 ('R')
  fill(5, 3, 9, 6, 'R');     // 여과 정화실
  set(7, 4, 'L');
  fill(13, 9, 16, 12, 'R');  // 배수 밸브실
  set(14, 10, 'L');
  fill(2, 12, 4, 17, 'R');   // 수문 동력실
  set(3, 14, 'L');
  fill(11, 14, 13, 16, 'R'); // 유량 감시실
  set(12, 15, 'L');
  fill(5, 22, 9, 25, 'R');   // 제2 배수 펌프실
  set(7, 23, 'L');
  fill(14, 20, 17, 23, 'R'); // 침수 배전반실
  set(15, 21, 'L');
  fill(21, 19, 26, 25, 'R'); // 오폐수 정화조 (물과 슬러지 혼합)
  set(23, 22, 'L');
  fill(28, 13, 31, 15, 'R'); // 수문 통제실
  set(29, 14, 'L');
  fill(30, 24, 33, 26, 'R'); // 비상 배수 터널
  fill(35, 3, 39, 6, 'R');   // 비상 잠수 도크
  set(37, 4, 'L');
  fill(33, 10, 35, 12, 'R'); // 환기 압축실
  fill(42, 13, 45, 16, 'R'); // 수질 분석실
  set(43, 14, 'L');
  fill(35, 20, 39, 23, 'R'); // 제1 방수벽 통제소
  set(37, 21, 'L');

  // 3. 통행 복도 및 캣워크 ('.')
  // 북서쪽 캣워크
  fill(10, 5, 18, 5, '.');
  fill(14, 7, 15, 8, '.');
  // 서쪽 주 통로
  fill(7, 7, 7, 21, '.');
  fill(5, 14, 6, 15, '.');
  fill(9, 15, 10, 16, '.');
  // 남서쪽 통로
  fill(10, 24, 20, 24, '.');
  fill(15, 24, 16, 24, '.');
  // 중앙 남쪽 통로
  fill(23, 11, 23, 18, '.');
  fill(25, 14, 27, 15, '.');
  // 동쪽 통로
  fill(30, 5, 34, 5, '.');
  fill(37, 7, 37, 19, '.');
  fill(36, 10, 36, 11, '.');
  fill(39, 14, 41, 15, '.');
  fill(27, 21, 34, 21, '.');
  fill(31, 23, 32, 23, '.');

  // 4. [핵심] 침수 수로 운하 타일 ('W') - 물이 깊게 차올라 첨벙거리는 수로
  // 북서 침수 배수 수로
  fill(10, 6, 18, 6, 'W');
  // 서쪽 남북 관통 침수 수로
  fill(8, 7, 8, 21, 'W');
  // 남쪽 방류 수로
  fill(10, 25, 20, 25, 'W');
  // 중앙 남쪽 수문 하부 수로
  fill(24, 11, 24, 18, 'W');
  // 동쪽 저류조 범람 수로
  fill(30, 6, 34, 6, 'W');
  fill(38, 7, 38, 19, 'W');
  fill(27, 22, 34, 22, 'W');
  // 오폐수 정화조 내부 일부 침수
  fill(22, 23, 25, 24, 'W');

  // 5. 대형 차단 수문 (Sluice Blast Doors 'D')
  set(19, 6, 'D'); // 서쪽 1호 방수 수문
  set(29, 6, 'D'); // 동쪽 2호 방수 수문
  set(24, 10, 'D'); // 남쪽 주 배수로 격벽 수문
  set(24, 19, 'D'); // 정화조 비상 격벽

  // 6. CCTV 수중 감시 카메라
  set(38, 14, '1'); // 동쪽 방류 수로 카메라
  set(23, 14, '2'); // 남쪽 중앙 배수로 카메라
  set(14, 5, '3');  // 북서 여과 수로 카메라
  set(8, 15, '4');  // 서쪽 침수 터널 카메라

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
    title: '제2장: 어둠 속의 침수 수로',
    badge: 'CHAPTER 02',
    desc: '지하수가 차오른 방류 수로 터널. 물살을 가르는 소리가 괴물을 자극합니다.',
    diff: 'normal',
    data: generateChapter2WaterTunnelMap(),
    zoneRegions: ZONE_REGIONS_CH2,
    ventNodes: [
      { id: 'vent_ch2_pump1',  col: 6,  row: 4,  zone: '여과 정화실' },
      { id: 'vent_ch2_drain',  col: 15, row: 11, zone: '배수 밸브실' },
      { id: 'vent_ch2_elec',   col: 16, row: 21, zone: '침수 배전실' },
      { id: 'vent_ch2_clar',   col: 24, row: 23, zone: '오폐수 정화조' },
      { id: 'vent_ch2_dock',   col: 37, row: 5,  zone: '비상 도크' },
      { id: 'vent_ch2_canal',  col: 43, row: 15, zone: '수질 분석실' },
      { id: 'vent_ch2_sluice', col: 37, row: 21, zone: '방수벽 통제소' }
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
  const cfg = CHAPTER_CONFIGS[chapterId] || CHAPTER_CONFIGS.chapter1;
  const regions = cfg.zoneRegions || ZONE_REGIONS_CH1;
  for (const z of regions) {
    if (col >= z.c0 && col <= z.c1 && row >= z.r0 && row <= z.r1) {
      return z.name;
    }
  }
  if (['B', 'S', 'G', 'C'].includes(char)) {
    return chapterId === 'chapter2' ? '중앙 배수 펌프장' : chapterId === 'chapter3' ? '중앙 승강기 기동장' : '벙커 (중앙 식당)';
  }
  if (char === 'W') return '침수 수로 운하';
  if (char === 'R') return '내부 구역';
  return `구역 복도 [${col}, ${row}]`;
}
