import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../../..');
const unity=path.join(root,'Airbourne-Arena/UnityProject');
const art=path.join(unity,'Assets/Art/Generated');

test('authored Unity FBX inputs pass their recorded geometry budgets',()=>{
  const audit=JSON.parse(fs.readFileSync(path.join(root,'docs/data/unity-fbx-audit.json')));
  const triangles=Object.fromEntries(audit.assets.map(x=>[path.basename(x.asset),x.triangles]));
  assert.equal(triangles['kestrel-mk1-authored-v3.fbx'],22044);
  assert.equal(triangles['starter-coast-world-authored-v2-lod1.fbx'],32044);
  assert.equal(triangles['blackwing-drone.fbx'],50);
  for(const file of Object.keys(triangles)){
    const header=fs.readFileSync(path.join(art,file)).subarray(0,18).toString('ascii');
    assert.equal(header,'Kaydara FBX Binary');
  }
});

test('FIRST FLIGHT preserves swept gates and inherited-velocity rounds',()=>{
  const mission=fs.readFileSync(path.join(unity,
    'Assets/AirbourneArena/Runtime/VerticalSlice/FirstFlightMission.cs'),'utf8');
  const gate=fs.readFileSync(path.join(unity,
    'Assets/AirbourneArena/Runtime/VerticalSlice/NavigationGate.cs'),'utf8');
  const guns=fs.readFileSync(path.join(unity,
    'Assets/AirbourneArena/Runtime/VerticalSlice/AircraftGuns.cs'),'utf8');
  assert.match(mission,/foreach \(var position in GatePositions\)/);
  assert.match(gate,/SegmentDistance\(previousPlayerPosition, current/);
  assert.match(guns,/flightBody\.WorldVelocity/);
});
