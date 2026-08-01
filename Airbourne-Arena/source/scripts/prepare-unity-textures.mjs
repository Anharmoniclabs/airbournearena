#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'../..');
const assets=path.join(project,'assets');
const contractPath=path.join(project,'source-assets/blender/starter-coast-asset-contract.json');
const write=process.argv.includes('--write');
const includeArg=process.argv.indexOf('--include');
const include=includeArg>=0
  ?new Set(process.argv[includeArg+1].split(',').map(x=>x.trim()).filter(Boolean))
  :null;
const outputArg=process.argv.indexOf('--output');
const output=outputArg>=0?path.resolve(process.cwd(),process.argv[outputArg+1])
  :path.join(project,'unity-import/textures');
const reportArg=process.argv.indexOf('--report');
const report=reportArg>=0?path.resolve(process.cwd(),process.argv[reportArg+1])
  :path.resolve(project,'../docs/data/unity-textures.json');
const contract=JSON.parse(fs.readFileSync(contractPath));
const membership=new Map();
for(const family of contract.surface_families)
  for(const image of family.images)membership.set(image,family.family);
for(const group of contract.non_mesh_assets)
  for(const image of group.images)membership.set(image,group.class);
const aliases={roads_and_airbases:'architecture',vegetation:'terrain',ocean:'terrain'};
const lifted={
  'volcanic-terrain-v2.webp':{screen:'#78787a',colour:'#c0ab86'},
  'city-roofs-diffusion-v1.webp':{screen:'#353a3c',colour:'#899398'},
  'conifer-foliage-diffusion-v1.webp':{screen:'#46513d',colour:'#91a978'},
  'bunker-concrete-diffusion-v1.webp':{screen:'#3b3d3a',colour:'#9b9c92'}
};
const files=fs.readdirSync(assets)
  .filter(x=>/\.(webp|png)$/i.test(x))
  .filter(x=>!include||include.has(x))
  .sort();
if(include){
  const missing=[...include].filter(file=>!files.includes(file));
  if(missing.length)throw new Error(`Requested Unity textures were not found: ${missing.join(', ')}`);
}
const rows=[];
for(const file of files){
  const input=path.join(assets,file);
  const family=membership.get(file)??(file.includes('fighter')?'aircraft':'ui_and_briefing');
  const budgetClass=aliases[family]??family;
  const budget=contract.unity.texture_budgets[budgetClass]??contract.unity.texture_budgets.ui_and_briefing;
  const image=sharp(input,{failOn:'error'});
  const meta=await image.metadata();
  const scale=Math.min(1,budget.max_dimension/Math.max(meta.width,meta.height));
  const width=Math.max(1,Math.round(meta.width*scale));
  const height=Math.max(1,Math.round(meta.height*scale));
  const outputName=file.replace(/\.(webp|png)$/i,'.png');
  const destination=path.join(output,budgetClass,outputName);
  if(write){
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    let pipeline=image.resize({width,height,fit:'fill'});
    const grade=lifted[file];
    if(grade){
      const screened=await pipeline.composite([
        {input:{create:{width,height,channels:4,background:grade.screen}},blend:'screen'}
      ]).png().toBuffer();
      /* sharp/libvips does not expose Canvas' `color` blend. Tinting the
         screened luminance is its deterministic equivalent for this pipeline:
         preserve the lifted light/dark detail while replacing hue/saturation. */
      pipeline=sharp(screened).tint(grade.colour);
    }
    await pipeline.png({compressionLevel:9,adaptiveFiltering:true}).toFile(destination);
  }
  rows.push({source:file,class:budgetClass,sourceBytes:fs.statSync(input).size,
    sourceSize:[meta.width,meta.height],targetSize:[width,height],
    transform:lifted[file]??null,
    output:path.relative(project,destination),written:write,
    outputBytes:write?fs.statSync(destination).size:null});
}
const totals=rows.reduce((x,r)=>({
  sourceBytes:x.sourceBytes+r.sourceBytes,
  outputBytes:x.outputBytes+(r.outputBytes??0)
}),{sourceBytes:0,outputBytes:0});
fs.mkdirSync(path.dirname(report),{recursive:true});
fs.writeFileSync(report,JSON.stringify({
  schemaVersion:1,mode:write?'write':'plan',
  note:'Unity performs final platform GPU compression; PNG files are import intermediates.',
  totals,assets:rows
},null,2)+'\n');
console.log(`${write?'Converted':'Planned'} ${rows.length} textures; report: ${path.relative(process.cwd(),report)}`);
