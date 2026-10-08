import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateAcceptance } from './check-final-acceptance.mjs';
const baseline=JSON.parse(await readFile('docs/reviews/V2-10_ACCEPTANCE_MATRIX.json','utf8'));
const copy=()=>structuredClone(baseline);
test('complete evidence register is valid while mandatory external gaps remain strict NO-GO',()=>{
  const result=validateAcceptance(copy());assert.equal(result.decision,'NO-GO FOR REAL CUSTOMER DATA');assert.ok(result.mandatoryBlockers.length);
});
test('GO cannot hide a mandatory failed or blocked gate',()=>{
  const matrix=copy();matrix.decision='GO FOR CONTROLLED PILOT';matrix.realCustomerDataPermitted=true;matrix.operatorPilotApproval=true;
  assert.throws(()=>validateAcceptance(matrix),/every mandatory PASS/);
});
test('removing or relabeling an essential gate cannot obtain acceptance',()=>{
  for(const essential of baseline.gates.filter(gate=>gate.pilotMandatory)){
    for(const mutation of ['remove','exclude','scope','optional']){
      const matrix=copy(),gate=matrix.gates.find(g=>g.id===essential.id);
      if(mutation==='remove')matrix.gates=matrix.gates.filter(g=>g!==gate);
      else if(mutation==='exclude')gate.status='NOT APPLICABLE';
      else if(mutation==='optional')gate.pilotMandatory=false;
      else gate.scope=gate.scope==='LOCAL'?'HOSTED_PROVIDER':'LOCAL';
      assert.throws(()=>validateAcceptance(matrix),`cannot weaken ${essential.id}: ${mutation}`);
    }
  }
});
test('PASS without evidence and BLOCKED without next action are rejected',()=>{
  const a=copy();a.gates.find(g=>g.status==='PASS').evidence=[];assert.throws(()=>validateAcceptance(a),/specific evidence/);
  const b=copy();delete b.gates.find(g=>g.status==='BLOCKED').nextAction;assert.throws(()=>validateAcceptance(b),/actionable/);
});
test('NO-GO cannot permit real data or use nonstandard statuses',()=>{
  const a=copy();a.realCustomerDataPermitted=true;assert.throws(()=>validateAcceptance(a));
  const b=copy();b.gates[0].status='MOSTLY PASS';assert.throws(()=>validateAcceptance(b));
});
