import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SIZE,
  MAP_COLS,
  MAP_ROWS,
  CHAPTER_CONFIGS,
  tileToWorld,
  worldToTile,
  getZoneName,
  getDoorOrientation
} from '../src/tilemapData.js';

test('CHAPTER_CONFIGS defines chapters 1, 2, and 3 with valid grids', () => {
  for (const key of ['chapter1', 'chapter2', 'chapter3']) {
    const cfg = CHAPTER_CONFIGS[key];
    assert.ok(cfg, `Missing config for ${key}`);
    assert.equal(cfg.id, key);
    assert.ok(Array.isArray(cfg.data), `${key}.data must be an array`);
    assert.equal(cfg.data.length, MAP_ROWS, `${key} row count mismatch`);

    let hasSpawn = false;
    let hasCore = false;
    for (let r = 0; r < MAP_ROWS; r++) {
      assert.equal(cfg.data[r].length, MAP_COLS, `${key} row ${r} col count mismatch`);
      if (cfg.data[r].includes('S')) hasSpawn = true;
      if (cfg.data[r].includes('G')) hasCore = true;
    }
    assert.ok(hasSpawn, `${key} must contain a spawn tile S`);
    assert.ok(hasCore, `${key} must contain a generator core tile G`);
  }
  assert.equal(CHAPTER_CONFIGS.chapter3.monsterType, 'geo_goliath');
});

test('tileToWorld and worldToTile round-trip cleanly across bounds', () => {
  for (const [col, row] of [[0, 0], [24, 8], [24, 14], [47, 29]]) {
    const world = tileToWorld(col, row);
    const back = worldToTile(world.x, world.z);
    assert.equal(back.col, col);
    assert.equal(back.row, row);
  }
  assert.equal(TILE_SIZE, 2.5);
});

test('getZoneName returns chapter-specific Korean labels', () => {
  assert.equal(getZoneName(24, 8, 'S', 'chapter1'), '벙커 (중앙 식당)');
  assert.equal(getZoneName(24, 14, 'B', 'chapter2'), '중앙 저류조 광장 (고지대)');
  assert.equal(getZoneName(24, 3, 'S', 'chapter3'), '25층 - 비상 곤돌라 승강장 (최상층)');
  assert.equal(getZoneName(10, 10, 'D', 'chapter1'), '방호문/수문 통로');
});

test('getDoorOrientation identifies NS vs EW passage alignment', () => {
  const nsGrid = [
    '#.#',
    '#D#',
    '#.#',
    '###'
  ];
  assert.equal(getDoorOrientation(nsGrid, 1, 1), 'NS');

  const ewGrid = [
    '###',
    '.D.',
    '###'
  ];
  assert.equal(getDoorOrientation(ewGrid, 1, 1), 'EW');
});
