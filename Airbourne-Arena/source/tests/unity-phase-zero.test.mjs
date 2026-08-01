import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../../..');

test('Unity mission export is complete and interpreter-friendly',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'docs/data/missions.json')));
  assert.equal(data.missionCount,32);
  assert.equal(data.missions[0].id,'ch1_m1');
  assert.equal(data.missions.at(-1).id,'ch6_m5');
  assert.equal(data.coordinateSystem.vectorsConverted,true);
  assert.match(JSON.stringify(data.missions),/"op":"primitive"/);
  assert.doesNotMatch(JSON.stringify(data),/function\s*\(/);
});

test('asset contract declares the Unity runtime target',()=>{
  const contract=JSON.parse(fs.readFileSync(path.join(root,
    'Airbourne-Arena/source-assets/blender/starter-coast-asset-contract.json')));
  assert.equal(contract.unity.handedness,'left');
  assert.equal(contract.unity.coordinate_conversion,'(x, y, z) -> (x, y, -z)');
  assert.ok(contract.unity.texture_budgets);
});
