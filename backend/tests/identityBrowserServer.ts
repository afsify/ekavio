// Disposable local QA only: excluded from compiled dist and runtime routing.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { PostgresAccountRepository } from '../src/postgres/accountRepository.js';
import { initializeRuntimeConfig } from '../src/config/env.js';
import { runtimePostgresDatabase } from '../src/persistence/runtimePersistence.js';
import { IdentityAccountService } from '../src/services/identityAccountService.js';
import { createApp } from '../src/app.js';
import { EmailCapture } from './helpers/emailCapture.js';
import { setupSocket, closeSocket, disconnectUserSockets } from '../src/config/socket.js';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { DynamicFieldsService } from '../src/domains/dynamicFields/service.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';
const url=new URL(process.env.POSTGRES_TEST_URL ?? '');
if (!['localhost','127.0.0.1','postgres'].includes(url.hostname) || url.pathname!=='/postgres') throw new Error('Local maintenance database required');
const admin=new PostgresDatabase(url.toString());
const databaseName=`ekavio_v208b_browser_${randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE DATABASE "${databaseName}"`); url.pathname=`/${databaseName}`;
const database=new PostgresDatabase(url.toString()); await migrate(database);
const config=initializeRuntimeConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),JWT_SECRET:randomUUID(),REFRESH_TOKEN_SECRET:randomUUID(),HTTP_ALLOWED_ORIGINS:'http://127.0.0.1:4175',SOCKET_ALLOWED_ORIGINS:'http://127.0.0.1:4175',TRUST_PROXY_HOPS:'0'});
const capture=new EmailCapture(); const identity=new IdentityAccountService(database,capture,disconnectUserSockets);
let application=createApp({config,identityAccountService:identity});
const root=express(); root.use(express.json());
root.get('/__test/health',(_request,response) => response.json({ready:true}));
root.post('/__test/fixture',async(request,response,next) => {
  try {
    const phone=`+919${Math.floor(100000000+Math.random()*899999999)}`,password=randomUUID(),email=`${randomUUID()}@example.invalid`;
    const created=await new PostgresAccountRepository(database).registerAdmin({orgName:'Disposable browser workspace',orgType:'shop',userName:'QA owner',phone,passwordHash:await bcrypt.hash(password,4)});
    const userId=String(created.user.id),organizationId=String(created.user.tenantId);
    if(request.body?.seedCustomerField===true) {
      const membership=(await database.query('SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2',[organizationId,userId])).rows[0]!.id;
      await new DynamicFieldsService(database).saveDefinition({userId,organizationId,membershipId:membership,sessionId:'local-fixture',branchId:String((created.branch as {id:string}).id),role:'admin',permissions:permissionsForRole('admin'),platformOperator:false},'customer',{key:'local_note',label:'QA ordinary note',help:'Local fixture only',fieldType:'text',status:'active',required:true,searchable:true,filterable:true,reportable:false,defaultValue:null,options:[]});
    }
    await database.query("UPDATE branches SET timezone='Asia/Kolkata' WHERE organization_id=$1",[organizationId]);
    if(Array.isArray(request.body?.modules)) {
      const commercial=new PostgresCommercialRepository(database);await commercial.reconcileCatalogue();
      for(const module of request.body.modules) {
        if(!['queue','inventory','attendance','ledger','crm'].includes(module))throw new Error('Unsupported disposable QA module');
        await commercial.upsertEntitlement(organizationId,userId,module,{effect:'grant',status:'active',source:'pilot',reason:'Disposable local dynamic forms QA'});
      }
    }
    if(['owner','admin','manager','hr','staff'].includes(request.body?.role)) await database.query('UPDATE memberships SET role=$1 WHERE user_id=$2',[request.body.role,userId]);
    if(request.body?.operator===true) await database.query("UPDATE users SET platform_role='operator' WHERE id=$1",[userId]);
    if(Array.isArray(request.body?.permissions)) {
      const role=(await database.query("INSERT INTO organization_roles(organization_id,name) VALUES($1,'Disposable custom role') RETURNING id",[organizationId])).rows[0]!.id;
      for(const permission of request.body.permissions) await database.query('INSERT INTO organization_role_permissions(role_id,permission) VALUES($1,$2)',[role,permission]);
      await database.query("UPDATE memberships SET role='staff',custom_role_id=$1 WHERE user_id=$2",[role,userId]);
    }
    capture.messages=[];
    // Independent tests get independent middleware/limiter state. Ordinary
    // deployed thresholds and real PostgreSQL requests are unchanged within tests.
    application=createApp({config,identityAccountService:identity});
    response.setHeader('Cache-Control','no-store'); response.json({phone,email,password,userId:String(created.user.id),organizationId:String(created.user.tenantId),branchId:(created.branch as {id:string}).id});
  } catch(error) { next(error); }
});
root.get('/__test/mail',(_request,response) => { response.setHeader('Cache-Control','no-store'); response.json(capture.messages.map(({purpose,url}) => ({purpose,url}))); });
root.use((request,response,next) => application(request,response,next));
const server=createServer(root);
setupSocket(server,config);
server.listen(5011,process.env.IDENTITY_QA_BIND==='container'?'0.0.0.0':'127.0.0.1',() => console.log('Disposable identity browser QA ready'));
let stopping=false;
const shutdown=async() => {
  if(stopping) return; stopping=true;
  await identity.awaitPendingDeliveries();
  await closeSocket(); server.closeAllConnections();
  await runtimePostgresDatabase.close(); await database.close();
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[databaseName]);
  await admin.query(`DROP DATABASE "${databaseName}"`); await admin.close();
};
for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => { void shutdown().then(() => process.exit(0)); });
