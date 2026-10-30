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
  { name: '중앙 저류조 광장', c0: 19, r0: 10, c1: 29, r1: 18 },
  { name: '고대 벽돌 아치 회랑', c0: 6, r0: 9, c1: 18, r1: 21 },
  { name: '제1 대형 방류 암거', c0: 21, r0: 2, c1: 27, r1: 10 },
  { name: '남측 방류 터널', c0: 21, r0: 18, c1: 27, r1: 26 },
  { name: '수문 밸브 가압실', c0: 5, r0: 2, c1: 14, r1: 8 },
  { name: '사이펀 집수정', c0: 4, r0: 22, c1: 14, r1: 28 },
  { name: '서측 원형 배수관', c0: 2, r0: 3, c1: 5, r1: 27 },
  { name: '침전 여과 집수조', c0: 31, r0: 2, c1: 42, r1: 9 },
  { name: '제2 저류조 침수 수로', c0: 30, r0: 9, c1: 38, r1: 19 },
  { name: '비상 차단 격벽실', c0: 38, r0: 10, c1: 46, r1: 18 },
  { name: '오폐수 슬러지 처리장', c0: 30, r0: 20, c1: 42, r1: 28 }
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

// 2. 제2장: 침수 수로 터널 (Flooded Drainage Tunnel & Ancient Cistern)
// - 레퍼런스 1번: 웅장한 로마/빅토리아 양식의 붉은 벽돌 볼트 기둥 회랑
// - 레퍼런스 2번: 원형 콘크리트 리브 벽과 허벅지까지 차오르는 탁한 침수 수로('W')
// - 주황빛 나트륨 형광등, 중앙 저류조 광장, 4방향 수문 격벽
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

  // 1. [중앙 저류조 광장 (Central Cistern Terrace)]
  // - 플레이어 스폰, 중앙 배수 터빈 코어, 주 수문 통제 콘솔이 있는 고지대 건조 석조 테라스 ('B')
  fill(20, 11, 28, 17, 'B');
  set(24, 12, 'C'); // CCTV / 유량 관제 콘솔
  set(24, 14, 'G'); // 중앙 배수 터빈 코어
  set(24, 16, 'S'); // 플레이어 스폰 위치
  set(21, 14, 'L'); // 서쪽 오렌지 나트륨등
  set(27, 14, 'L'); // 동쪽 오렌지 나트륨등

  // 2. [고대 붉은 벽돌 아치 회랑 및 기둥 미로 (Ancient Brick Vault & Pillar Hall)]
  // - 레퍼런스 1: 웅장한 붉은 벽돌 볼트 천장과 거대한 2x2 벽돌 기둥들이 시야를 가로막는 은신 구역 ('R')
  fill(6, 9, 18, 21, 'R');
  // 거대한 2x2 구조 지지 기둥들 ('#') - 시야 차단 및 괴물과의 심리전
  fill(8, 11, 9, 12, '#');
  fill(14, 11, 15, 12, '#');
  fill(8, 17, 9, 18, '#');
  fill(14, 17, 15, 18, '#');
  // 회랑 기둥 사이 주황색 산업용 형광등 ('L')
  set(11, 11, 'L');
  set(11, 17, 'L');
  set(11, 14, '3'); // CAM 03: 아치 회랑 감시 카메라

  // 3. [제1 대형 방류 암거 - 북측 수로 (North Storm Drainage Flume)]
  // - 레퍼런스 2: 원형 콘크리트 리브 벽과 허벅지까지 차오르는 탁한 침수 수로 ('W')
  fill(23, 3, 25, 9, 'W');
  fill(22, 3, 22, 9, '.'); // 수로 좌측 정비용 캣워크 보행로
  set(22, 6, 'L'); // 북측 암거 조명

  // 4. [남측 방류 터널 - 침수 수로 (South Outfall Canal)]
  fill(23, 19, 25, 25, 'W');
  fill(26, 19, 26, 25, '.'); // 수로 우측 캣워크
  set(26, 22, 'L'); // 남측 암거 조명
  set(24, 25, '2'); // CAM 02: 남측 방류 터널 카메라

  // 5. [수문 밸브 가압실 (North-West Valve & Pressure Chamber)]
  fill(6, 3, 13, 7, 'R');
  set(9, 5, 'L');
  fill(14, 4, 21, 5, '.'); // 중앙 북서 연결 통로

  // 6. [사이펀 집수정 (South-West Siphon Well)]
  fill(5, 23, 13, 27, 'R');
  fill(7, 24, 11, 26, 'W'); // 중앙 깊은 집수 웅덩이
  set(9, 23, 'L');
  fill(14, 23, 21, 24, '.'); // 중앙 남서 연결 통로

  // 7. [서측 원형 배수관 (Western Flume Conduit)]
  // - 북서 밸브실에서 남서 사이펀정까지 꿰뚫는 깊은 침수 관로 ('W')
  fill(3, 4, 4, 26, 'W');
  fill(5, 7, 5, 22, '.'); // 서측 캣워크
  set(5, 14, 'L');
  set(4, 14, '4'); // CAM 04: 서측 배수관 카메라
  fill(5, 5, 5, 5, 'W');
  fill(5, 14, 6, 14, '.');
  fill(5, 24, 5, 24, 'W');

  // 8. [침전 여과 집수조 (North-East Settling Basin)]
  fill(32, 3, 41, 8, 'R');
  fill(34, 4, 39, 7, 'W'); // 여과조 침수 웅덩이
  set(36, 3, 'L');
  fill(26, 4, 31, 5, '.'); // 북동 연결 통로

  // 9. [제2 저류조 침수 수로 및 계단식 테라스 (Eastern Flooded Flume Canal)]
  fill(31, 10, 36, 18, 'W'); // 동쪽 대형 침수 수로
  fill(37, 10, 37, 18, '.'); // 캣워크
  set(37, 14, 'L');
  set(34, 14, '1'); // CAM 01: 동쪽 저류 수로 카메라

  // 10. [비상 차단 격벽실 (Emergency Sluice Bulkhead Station)]
  fill(39, 11, 45, 17, 'R');
  set(42, 14, 'L');
  fill(37, 14, 38, 14, '.'); // 수평 연결로

  // 11. [오폐수 슬러지 처리장 (South-East Sludge Vault)]
  fill(31, 21, 41, 27, 'R');
  fill(33, 23, 39, 25, 'W'); // 슬러지 침수조
  set(36, 22, 'L');
  fill(27, 23, 30, 24, '.'); // 남동 연결 통로
  fill(37, 19, 37, 20, '.'); // 동쪽 남북 통로

  // 12. [중앙 저류조 사방 방수 수문 (Hydraulic Sluice Floodgates 'D')]
  set(19, 14, 'D'); // 서쪽: 고대 벽돌 아치 회랑 차단 수문
  set(29, 14, 'D'); // 동쪽: 제2 침수 저류조 차단 수문
  set(24, 10, 'D'); // 북쪽: 제1 대형 방류 암거 수문
  set(24, 18, 'D'); // 남쪽: 남측 방류 터널 수문

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
      { id: 'vent_ch2_valves',  col: 9,  row: 5,  zone: '수문 밸브 가압실' },
      { id: 'vent_ch2_pillar',  col: 11, row: 14, zone: '고대 벽돌 아치 회랑' },
      { id: 'vent_ch2_siphon',  col: 9,  row: 24, zone: '사이펀 집수정' },
      { id: 'vent_ch2_west',    col: 4,  row: 14, zone: '서측 원형 배수관' },
      { id: 'vent_ch2_basin',   col: 36, row: 5,  zone: '침전 여과 집수조' },
      { id: 'vent_ch2_east',    col: 42, row: 14, zone: '비상 차단 격벽실' },
      { id: 'vent_ch2_sludge',  col: 36, row: 24, zone: '오폐수 슬러지 처리장' },
      { id: 'vent_ch2_north_f', col: 24, row: 6,  zone: '제1 대형 방류 암거' }
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
