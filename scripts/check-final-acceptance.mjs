import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const statuses=new Set(['PASS','FAIL','BLOCKED','NOT APPLICABLE']);
const categories=new Set(['Functional','Security','Tenancy','Commercial','Database','Deployment','Recovery','Monitoring','Operational readiness']);
const scopes=new Set(['LOCAL','CI','HOSTED_PUBLIC','HOSTED_AUTHENTICATED','HOSTED_PROVIDER','BACKUP','RECOVERY','OPERATIONS']);
// Explicit V2-10 policy: removing/reclassifying even one mandatory gate cannot
// manufacture GO. This contract certifies register structure, not evidence truth.
const requiredScopes={
  backend_quality:'LOCAL',frontend_quality:'LOCAL',database_regressions:'LOCAL',browser_regressions:'LOCAL',
  role_tenant_matrix:'LOCAL',optional_entitlements:'LOCAL',money_stock:'LOCAL',identity_security:'LOCAL',
  socket_local:'LOCAL',security_privacy:'LOCAL',audits:'LOCAL',docker_runtime:'LOCAL',local_logs:'LOCAL',
  public_ui:'HOSTED_PUBLIC',public_headers:'HOSTED_PUBLIC',public_health:'HOSTED_PUBLIC',
  hosted_migrations:'HOSTED_PROVIDER',normal_pg_authority:'LOCAL',scheduled_backups:'BACKUP',
  encrypted_artifact:'BACKUP',recovery_verifier:'LOCAL',recovery_cleanup:'RECOVERY',backup_watchdog:'BACKUP',
  checker_safety:'LOCAL',hosted_frontend_revision:'HOSTED_PROVIDER',hosted_backend_revision:'HOSTED_PROVIDER',
  hosted_two_tenant:'HOSTED_AUTHENTICATED',hosted_role_entitlement:'HOSTED_AUTHENTICATED',
  hosted_session:'HOSTED_AUTHENTICATED',hosted_socket:'HOSTED_AUTHENTICATED',hosted_smtp:'HOSTED_AUTHENTICATED',
  hosted_logs_config:'HOSTED_PROVIDER',manifest_mime:'HOSTED_PUBLIC',commercial_latch:'HOSTED_PROVIDER',
  restore_through_020:'RECOVERY',provider_recovery:'HOSTED_PROVIDER',alert_delivery:'OPERATIONS',
  independent_monitoring:'OPERATIONS',operational_owners:'OPERATIONS',hosting_class:'OPERATIONS',
  capacity_cost:'HOSTED_PROVIDER',rollback:'HOSTED_PROVIDER',final_ci:'CI',
};

export function validateAcceptance(matrix) {
  if(matrix.schemaVersion!==1||matrix.acceptanceId!=='V2-10'||!Array.isArray(matrix.gates))throw new Error('Invalid acceptance contract');
  const ids=new Set(),seenCategories=new Set();
  for(const gate of matrix.gates) {
    if(!gate.id||ids.has(gate.id)||!statuses.has(gate.status)||!categories.has(gate.category)||!scopes.has(gate.scope)
      ||typeof gate.pilotMandatory!=='boolean'||!Array.isArray(gate.evidence))throw new Error('Invalid or duplicate evidence gate');
    ids.add(gate.id);seenCategories.add(gate.category);
    if(gate.status==='PASS'&&!gate.evidence.some(value=>typeof value==='string'&&value.trim()))throw new Error('PASS requires specific evidence');
    if(['BLOCKED','FAIL'].includes(gate.status)&&['reason','missingPrerequisite','responsibleRole','nextAction'].some(key=>!gate[key]?.trim()))throw new Error('Blocked/failed gate requires actionable prerequisites and ownership');
    if(gate.pilotMandatory&&gate.status==='NOT APPLICABLE')throw new Error('Mandatory gate cannot be silently excluded');
    if(gate.id.startsWith('hosted_')&&gate.scope==='LOCAL')throw new Error('Local evidence cannot become hosted proof');
  }
  if([...categories].some(category=>!seenCategories.has(category)))throw new Error('Acceptance categories are incomplete');
  if(Object.entries(requiredScopes).some(([id,scope])=>!matrix.gates.some(gate=>gate.id===id&&gate.pilotMandatory&&gate.scope===scope)))throw new Error('Mandatory release gate is missing or reclassified');
  const blockers=matrix.gates.filter(gate=>gate.pilotMandatory&&gate.status!=='PASS');
  const go=matrix.decision==='GO FOR CONTROLLED PILOT';
  if(!go&&matrix.decision!=='NO-GO FOR REAL CUSTOMER DATA')throw new Error('Unrecognized release decision');
  if(go&&(blockers.length||matrix.operatorPilotApproval!==true||matrix.realCustomerDataPermitted!==true))throw new Error('GO requires every mandatory PASS and explicit human approval');
  if(!go&&matrix.realCustomerDataPermitted!==false)throw new Error('NO-GO cannot permit real customer data');
  return {status:'PASS',contract:'evidence register valid',decision:matrix.decision,mandatoryBlockers:blockers.map(gate=>({id:gate.id,status:gate.status}))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(validateAcceptance(JSON.parse(await readFile('docs/reviews/V2-10_ACCEPTANCE_MATRIX.json','utf8'))),null,2));}
  catch {console.error('Final acceptance evidence contract failed; no data or secrets printed');process.exitCode=1;}
}
