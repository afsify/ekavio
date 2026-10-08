import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const run = env => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/check-hosted-acceptance.mjs'], {
    env: { SystemRoot:process.env.SystemRoot, PATH:process.env.PATH, ...env },
    windowsHide:true, stdio:['ignore','pipe','pipe'],
  });
  let stdout='',stderr='';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject); child.on('close', code => resolve({code,stdout,stderr}));
});

test('hosted checker refuses missing credentials and arbitrary credential destinations', async () => {
  assert.equal((await run({})).code, 2);
  const rejected = await run({EKAVIO_ACCEPTANCE_LOCAL_QA:'1',EKAVIO_ACCEPTANCE_LOCAL_ORIGIN:'https://example.invalid'});
  assert.notEqual(rejected.code, 0);
});

// Disposable HTTP contract fixtures: NOT real application/hosted proof.
for (const staging of [false,true]) test(`checker ${staging?'requires positive resources':'refuses real-tenant enumeration'}`, async () => {
  let domainReads=0;
  const server=createServer(async (req,res) => {
    res.setHeader('Content-Type','application/json');
    const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    if(req.url==='/api/auth/login') {
      let body='';for await(const chunk of req) body+=chunk;
      const foreign=JSON.parse(body).phone==='synthetic-foreign';
      const id=foreign?'fixture-b':'fixture-a';
      res.setHeader('Set-Cookie',`ekavio_refresh=${id}; Secure; HttpOnly; SameSite=Lax; Path=/api/auth`);
      return send(200,{accessToken:id,organizationId:id,branchId:id,memberships:[{organizationId:id,branchIds:[id]}]});
    }
    if(req.url==='/api/auth/logout')return send(200,{});
    if(req.url==='/api/auth/refresh') {
      if(req.headers.cookie?.includes('rotated'))return send(401,{});
      res.setHeader('Set-Cookie','ekavio_refresh=rotated; Secure; HttpOnly; SameSite=Lax; Path=/api/auth');
      return send(200,{accessToken:'fixture-a'});
    }
    const actor=req.headers.authorization?.endsWith('fixture-b')?'fixture-b':'fixture-a';
    if(req.headers['x-tenant-id']!==actor||req.headers['x-branch-id']!==actor)return send(403,{});
    if(req.url==='/api/organization')return send(200,{data:{name:staging?'STAGING V210 synthetic':'Not a disposable organization'}});
    domainReads++;return send(200,{data:[]});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const result=await run({EKAVIO_ACCEPTANCE_LOCAL_QA:'1',EKAVIO_ACCEPTANCE_LOCAL_ORIGIN:`http://127.0.0.1:${server.address().port}`,
      EKAVIO_STAGING_PRIMARY_PHONE:'synthetic-primary',EKAVIO_STAGING_PRIMARY_PASSWORD:'synthetic-password',
      EKAVIO_STAGING_FOREIGN_PHONE:'synthetic-foreign',EKAVIO_STAGING_FOREIGN_PASSWORD:'synthetic-password'});
    assert.equal(result.code,1);
    const rows=result.stdout.trim().split('\n').map(line=>JSON.parse(line));
    if(!staging)assert.equal(domainReads,0);
    else {
      assert.ok(rows.some(row=>row.name==='HR self schedule foreign context'&&row.status==='PASS'));
      assert.equal(rows.filter(row=>row.status==='BLOCKED').length,3);
      assert.ok(rows.filter(row=>row.name.startsWith('foreign ')&&row.name.endsWith(' rejected')).every(row=>row.status==='BLOCKED'||!row.name.includes('resource')));
      assert.ok(!rows.some(row=>row.status==='FAIL'));
    }
    assert.ok(!result.stdout.includes('synthetic-password'));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
