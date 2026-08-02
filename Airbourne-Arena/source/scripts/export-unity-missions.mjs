#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';

const here=path.dirname(fileURLToPath(import.meta.url));
const gameDir=path.resolve(here,'../../src/game');
const outputs=[
  path.resolve(here,'../../../docs/data/missions.json'),
  path.resolve(here,'../../UnityProject/Assets/AirbourneArena/Resources/missions.json')
];
const files=fs.readdirSync(gameDir).filter(x=>/^4[1-6]-chapter-.*\.js$/.test(x)).sort();
const primitives=new Set([
  'say','addRep','spawnFlier','hostilesLeft','addUnity','convoyAlive','makeSite',
  'sitesLeft','addTrust','convoyArrived','gatesLeft','factionKey','allWorked',
  'sitesWorked','sitesToWork','openChoice','makeGate','distanceTo','stepCore',
  'namedFlier','toCampaignHangar','saveGame','decideEnding','banner','radioBusy'
]);

function vector(node){
  return node?.type==='NewExpression' && node.callee?.type==='MemberExpression' &&
    node.callee.object?.name==='THREE' && node.callee.property?.name==='Vector3';
}
function key(node){return node.computed?encode(node.property):node.property.name;}
function flippedZ(value){return typeof value==='number'?-value:{op:'negate',value};}
function encode(node){
  if(node==null)return null;
  if(vector(node)){
    const xyz=node.arguments.map(encode);
    return {op:'vector3',x:xyz[0]??0,y:xyz[1]??0,z:flippedZ(xyz[2]??0)};
  }
  switch(node.type){
    case 'Literal': return node.value;
    case 'Identifier': return {op:'ref',name:node.name};
    case 'ArrayExpression': return node.elements.map(encode);
    case 'ObjectExpression': return Object.fromEntries(node.properties.map(p=>[
      p.computed?JSON.stringify(encode(p.key)):p.key.name??p.key.value,encode(p.value)]));
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return {op:'program',params:node.params.map(p=>p.name),body:encode(node.body)};
    case 'BlockStatement': return node.body.map(encode);
    case 'ExpressionStatement': return encode(node.expression);
    case 'ReturnStatement': return {op:'return',value:encode(node.argument)};
    case 'VariableDeclaration': return {op:'declare',kind:node.kind,bindings:node.declarations.map(encode)};
    case 'VariableDeclarator': return {name:node.id.name,value:encode(node.init)};
    case 'CallExpression': {
      const name=node.callee.type==='Identifier'?node.callee.name:null;
      const args=node.arguments.map(encode);
      // makeGate is the one campaign primitive that accepts loose x/y/z
      // scalars instead of a Vector3, so its third argument needs the same
      // handedness conversion as explicit vector nodes.
      if(name==='makeGate'&&args.length>=3)args[2]=flippedZ(args[2]);
      return {op:primitives.has(name)?'primitive':'call',
        target:name??encode(node.callee),args};
    }
    case 'NewExpression': return {op:'construct',target:encode(node.callee),args:node.arguments.map(encode)};
    case 'MemberExpression': return {op:'member',target:encode(node.object),key:key(node)};
    case 'AssignmentExpression': return {op:'assign',operator:node.operator,target:encode(node.left),value:encode(node.right)};
    case 'UpdateExpression': return {op:'update',operator:node.operator,prefix:node.prefix,target:encode(node.argument)};
    case 'BinaryExpression':
    case 'LogicalExpression': return {op:'binary',operator:node.operator,left:encode(node.left),right:encode(node.right)};
    case 'UnaryExpression': return {op:'unary',operator:node.operator,value:encode(node.argument)};
    case 'ConditionalExpression': return {op:'conditional',test:encode(node.test),then:encode(node.consequent),else:encode(node.alternate)};
    case 'IfStatement': return {op:'if',test:encode(node.test),then:encode(node.consequent),else:encode(node.alternate)};
    case 'ForStatement': return {op:'for',init:encode(node.init),test:encode(node.test),update:encode(node.update),body:encode(node.body)};
    case 'ForInStatement': return {op:'forIn',left:encode(node.left),right:encode(node.right),body:encode(node.body)};
    case 'WhileStatement': return {op:'while',test:encode(node.test),body:encode(node.body)};
    case 'TemplateLiteral': return {op:'template',parts:node.quasis.map((q,i)=>({
      text:q.value.cooked,value:i<node.expressions.length?encode(node.expressions[i]):null}))};
    case 'SequenceExpression': return {op:'sequence',items:node.expressions.map(encode)};
    case 'BreakStatement': return {op:'break'};
    case 'EmptyStatement': return {op:'noop'};
    default: throw new Error(`Unsupported campaign syntax: ${node.type}`);
  }
}

const missions=[];
for(const file of files){
  const source=fs.readFileSync(path.join(gameDir,file),'utf8');
  const ast=parse(source,{ecmaVersion:2022,sourceType:'script'});
  for(const statement of ast.body){
    const call=statement.type==='ExpressionStatement'&&statement.expression.type==='CallExpression'
      ?statement.expression:null;
    if(call?.callee?.name!=='M')continue;
    const mission=encode(call.arguments[0]);
    mission.source=file;
    missions.push(mission);
  }
}
const payload={
  schemaVersion:1,
  coordinateSystem:{
    source:'three.js right-handed, Y up, forward -Z',
    target:'Unity left-handed, Y up, forward +Z',
    conversion:'(x, y, z) -> (x, y, -z)',
    vectorsConverted:true
  },
  callbackEncoding:'Interpreter operation tree; no JavaScript source is embedded.',
  runtimePrimitives:[...primitives],
  missionCount:missions.length,
  missions
};
if(missions.length!==32)throw new Error(`Expected 32 missions, found ${missions.length}`);
const serialized=JSON.stringify(payload,null,2)+'\n';
for(const output of outputs){
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,serialized);
  console.log(`Exported ${missions.length} missions to ${path.relative(process.cwd(),output)}`);
}
