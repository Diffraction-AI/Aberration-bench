import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {demo} from '../examples/demo.ts';
import {adjudicationPacket} from '../src/adjudication.ts';

function fixture(root:string) {
 const data=demo(),runs=join(root,'runs');mkdirSync(runs);
 const bytes=JSON.stringify({events:[{action:'click',target:'checkout',outcome:'confirmation'}]});
 const artifact={path:'trajectory.json',sha256:createHash('sha256').update(bytes).digest('hex'),kind:'trace' as const};
 for(const trial of data.trials) {
  trial.transcript=artifact;trial.charges=trial.charges.map(c=>({...c,receipt:c.receipt?artifact:null}));
  trial.review.findings=trial.review.findings.map(f=>({...f,evidence:[artifact]}));
  const dir=join(runs,trial.slotId);mkdirSync(join(dir,'artifacts'),{recursive:true});
  writeFileSync(join(dir,'artifacts',artifact.path),bytes);writeFileSync(join(dir,'trial.json'),JSON.stringify(trial));
 }
 return {data,runs,bytes,artifact};
}
test('clean and finding packets preserve verified coverage separately from blinded claims',()=>{
 const root=mkdtempSync(join(tmpdir(),'aberration-adjudication-'));
 try {
  const {data,runs,bytes,artifact}=fixture(root),output=join(root,'packets');
  const result=adjudicationPacket(data.plan,runs,output);
  const mapping=JSON.parse(readFileSync(result.mapping,'utf8')) as {alias:string;slotId:string}[];
  assert.equal(mapping.length,data.trials.length);
  for(const {alias,slotId} of mapping) {
   const dir=join(result.coverageDirectory,alias),index=JSON.parse(readFileSync(join(dir,'index.json'),'utf8'));
   assert.equal(readFileSync(join(dir,index.transcript.path),'utf8'),bytes);
   assert.equal(index.transcript.sha256,artifact.sha256);
   const trial=data.trials.find(t=>t.slotId===slotId)!;
   assert.deepEqual(JSON.parse(readFileSync(join(result.reviewerDirectory,alias,'review.json'),'utf8')),trial.review);
   assert.equal(existsSync(join(result.reviewerDirectory,alias,'transcript.json')),false);
   if(!trial.review.findings.length)assert.equal(existsSync(join(result.reviewerDirectory,alias,'evidence')),false);
  }
  assert.match(result.instructions,/traces may identify participants/);
 }finally {rmSync(root,{recursive:true,force:true});}
});
test('tampered coverage traces cannot become grading evidence even for a clean review',()=>{
 const root=mkdtempSync(join(tmpdir(),'aberration-adjudication-'));
 try {
  const {data,runs}=fixture(root),clean=data.trials.find(t=>!t.review.findings.length)!;
  writeFileSync(join(runs,clean.slotId,'artifacts','trajectory.json'),'tampered');
  assert.throws(()=>adjudicationPacket(data.plan,runs,join(root,'packets')),/Artifact hash mismatch/);
 }finally {rmSync(root,{recursive:true,force:true});}
});

test('an incomplete batch exports available evidence and preserves every missing planned slot',()=>{
 const root=mkdtempSync(join(tmpdir(),'aberration-adjudication-'));
 try {
  const {data,runs}=fixture(root),missing=data.trials[0]!;
  rmSync(join(runs,missing.slotId,'trial.json'));
  const result=adjudicationPacket(data.plan,runs,join(root,'packets'));
  const mapping=JSON.parse(readFileSync(result.mapping,'utf8')) as {alias:string;slotId:string;status:string}[];
  assert.equal(result.expectedSlots,data.plan.slots.length);assert.equal(result.missingSlots,1);assert.equal(result.packets,data.trials.length-1);
  const entry=mapping.find(row=>row.slotId===missing.slotId)!;assert.equal(entry.status,'missing');
  assert.equal(existsSync(join(result.reviewerDirectory,entry.alias)),false);
  assert.equal(mapping.length,data.plan.slots.length);
 }finally {rmSync(root,{recursive:true,force:true});}
});
