import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BAR, plateSize, layout } from '../../src/ui/barbell3d.js';

test('power bar dimensions add up', () => {
  assert.ok(Math.abs(2 * BAR.sleeveLength + 2 * BAR.collarLength + BAR.innerLength - BAR.length) < 0.001);
  assert.ok(BAR.sleeveLength >= 0.40 && BAR.sleeveLength <= 0.43);
  assert.equal(BAR.shaftDiameter, 0.029);
  assert.equal(BAR.sleeveDiameter, 0.05);
  assert.equal(BAR.ring * 2, 0.81);
});
test('plate sizes use catalogue dimensions and kg fallback table', () => {
  assert.deepEqual(plateSize({ value:25, unit:'kg', drawHeightMm:440, thicknessMm:30 }), { diameter:0.44, thickness:0.03 });
  const values=[25,20,15,10,5,2.5,1.25,1,0.5,0.25];
  const diameters=[450,450,450,450,230,190,160,145,130,110];
  const thicknesses=[27,22.5,21,21,21.5,16,12,10,8,6];
  values.forEach((value,i)=>assert.deepEqual(plateSize({value,unit:'kg'}), {diameter:diameters[i]/1000,thickness:thicknesses[i]/1000}));
  assert.deepEqual(plateSize({value:45,unit:'lb'}),plateSize({value:20,unit:'kg'}));
  assert.deepEqual(plateSize({value:5,unit:'lb'}),plateSize({value:2.5,unit:'kg'}));
});
test('layout preserves input indexes, spaces plates and adds the collar', () => {
  const plates=[{value:25,unit:'kg'},{value:20,unit:'kg'},{value:5,unit:'kg'}];
  const original=structuredClone(plates), result=layout(plates,{collar:true});
  assert.deepEqual(plates,original);
  assert.deepEqual(result.plates.map(p=>p.index),[0,1,2]);
  assert.equal(result.plates[0].x,BAR.innerLength/2+BAR.collarLength);
  for(let i=1;i<3;i++) assert.ok(Math.abs(result.plates[i].x-result.plates[i-1].x-result.plates[i-1].thickness-0.001)<1e-9);
  assert.ok(Math.abs(result.collarX-result.plates[2].x-result.plates[2].thickness-0.001)<1e-9);
  assert.equal(result.overflow,false);
  assert.equal(layout(plates).collarX,null);
  assert.equal(layout(Array(20).fill(plates[0]),{collar:true}).overflow,true);
  assert.deepEqual(layout([]),{plates:[],collarX:null,overflow:false});
  assert.equal(layout([],{collar:true}).overflow,false);
});
test('three stays lazy and Node can import pure geometry helpers', async () => {
  const src=await readFile(new URL('../../src/ui/barbell3d.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/^import .*from ['"].*three/gm);
  assert.match(src,/import\('..\/..\/vendor\/three\/build\/three.module.min.js'\)/);
});
