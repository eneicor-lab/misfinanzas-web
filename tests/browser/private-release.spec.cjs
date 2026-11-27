const {test,expect}=require('@playwright/test');
const OLD='11111111-1111-4111-8111-111111111111',FINAL='22222222-2222-4222-8222-222222222222',JOB='33333333-3333-4333-8333-333333333333';
const receipt={phase:'completed',test_mode:false,can_launch:false,test_owner:OLD,final_owner:FINAL,job_id:JOB,manifest_sha:'a'.repeat(64),backup_cipher_sha:'b'.repeat(64)};
async function setup(page,{phase='testing',finalLogin=false}={}){
 const fixture={state:phase==='completed'?{...receipt}:{phase,test_mode:true,can_launch:true,test_owner:OLD,job_id:phase==='testing'?null:JOB,final_owner:phase==='cleaned'?FINAL:null,manifest_sha:'a'.repeat(64),backup_cipher_sha:'b'.repeat(64)},verified:false,signup:0,finalize:0,puts:0,gets:[],owner:finalLogin?FINAL:OLD,rows:{},failModule:null};
 page.on('dialog',d=>d.accept());
 await page.route('https://qa-misfinanzas.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,data=req.postDataJSON?.()||{};let body=[],status=200;
  if(path.endsWith('/token'))body={access_token:'synthetic-only-session',user:{id:fixture.owner,email_confirmed_at:'2026-01-01T00:00:00Z'}};
  else if(path.endsWith('/signup')){fixture.signup++;body={user:{id:FINAL,email_confirmed_at:null}};}
  else if(path.endsWith('/user'))body={id:fixture.owner,email_confirmed_at:'2026-01-01T00:00:00Z'};
  else if(path.endsWith('/release_status'))body=fixture.state;
  else if(path.endsWith('/book_sync_contract'))body={version:1,protected:true,enabled:true,authorized:true};
  else if(path.endsWith('/get_module_state')){const name=url.searchParams.get('p_module');fixture.gets.push(name);if(fixture.failModule===name){status=503;body={message:'Synthetic interrupted recovery'};}else body=fixture.rows[name]?[fixture.rows[name]]:[];}
  else if(path.endsWith('/put_module_state')){fixture.puts++;fixture.rows[data.p_module]={revision:data.p_expected_revision+1,payload:data.p_payload};body=data.p_expected_revision+1;}
  else if(path.endsWith('/misfinanzas-release')){
   const {action,payload={}}=data;
   if(action==='prepare'){fixture.state={...fixture.state,phase:'prepared',job_id:JOB,counts:{mf_events:1}};body={status:fixture.state,snapshot:{public:{mf_events:[{id:'synthetic-event'}]},mf_next:{module_state:[{module:'catalogs'}]}}};}
   else if(action==='ack_backup'){fixture.state={...fixture.state,phase:'backup_ready',backup_cipher_sha:payload.cipher_sha};body=fixture.state;}
   else if(action==='reserve_target'){fixture.state={...fixture.state,phase:'awaiting_signup',target_email:payload.email};body=fixture.state;}
   else if(action==='finalize'){fixture.finalize++;if(!fixture.verified&&fixture.state.phase!=='cleaned'){status=409;body={message:'Final account email is not verified'};}else{fixture.state={...receipt};body=fixture.state;}}
   else body=fixture.state;
  }
  await route.fulfill({status,json:body});
 });
 await open(page,true);return fixture;
}
async function open(page,create=false){await page.goto('/');await page.locator('#vaultPassword').fill('Synthetic+Vault!123');if(create)await page.locator('#vaultConfirmation').fill('Synthetic+Vault!123');await page.locator('#vaultOpen').click();await expect.poll(()=>page.evaluate(()=>window.MF_APP_READY)).toBe(true);}
async function login(page,fixture,expectClose=false){const app=page.frameLocator('#mfPrivateApp');await app.locator('body').evaluate(()=>navTo('movimientos'));await app.locator('#mfdev-confirm').check();await app.locator('#mfdev-open').click();const auth=app.frameLocator('#mfdev-frame');await auth.locator('#url').fill('https://qa-misfinanzas.supabase.co');await auth.locator('#key').fill('sb_publishable_synthetic_qa');await auth.locator('#email').fill(fixture.owner===FINAL?'final@example.invalid':'test@example.invalid');await auth.locator('#password').fill('SyntheticOnly!12345');await auth.locator('#login').click();if(!expectClose)await expect(auth.locator('#shell')).toBeVisible();return app;}
async function about(app){await app.locator('body').evaluate(()=>navTo('acerca'));}
test('owner wizard requires recoverable backup, normal signup, verified email and explicit confirmation',async({page})=>{
 const f=await setup(page),app=await login(page,f);await about(app);await expect(app.locator('#mfLaunchDefinitive')).toBeVisible();expect(f.finalize).toBe(0);
 await app.locator('#mfLaunchDefinitive').click();const download=page.waitForEvent('download');await app.locator('#mfReleaseBackup').click();await download;await expect(app.locator('#mfReleaseManifest')).toContainText('synthetic-event');expect(f.puts).toBe(6);
 await app.locator('#mfReleaseEmail').fill('final@example.invalid');await app.locator('#mfReleasePassword').fill('SyntheticOnly!12345');await app.locator('#mfReleaseRegister').click();expect(f.signup).toBe(0);
 await app.locator('#mfReleaseBackupStored').check();await app.locator('#mfReleaseRegister').click();await expect.poll(()=>f.signup).toBe(1);await expect(app.locator('#mfReleasePassword')).toHaveValue('');
 await app.locator('#mfReleaseExecute').click();expect(f.finalize).toBe(0);await app.locator('#mfReleaseIdentified').check();await app.locator('#mfReleasePhrase').fill('LANZAR DEFINITIVA');await app.locator('#mfReleaseExecute').click();await expect(app.locator('#mfReleaseStatus')).toContainText('not verified');expect(f.state.phase).toBe('awaiting_signup');
 f.verified=true;await app.locator('#mfReleaseExecute').click();await expect(page.locator('#mfPrivateApp')).toHaveCount(0);expect(f.state.phase).toBe('completed');expect(f.signup).toBe(1);
});
test('cleaned transition resumes without repeating confirmation or automatic cleanup',async({page})=>{
 const f=await setup(page,{phase:'cleaned'}),app=await login(page,f);await about(app);await expect(app.locator('#mfReleaseResume')).toBeVisible();expect(f.finalize).toBe(0);await app.locator('#mfReleaseResume').click();await expect(page.locator('#mfPrivateApp')).toHaveCount(0);expect(f.finalize).toBe(1);
});
test('definitive recovery preserves local copy and remains blocked after interrupted module pull',async({page})=>{
 const f=await setup(page,{phase:'completed',finalLogin:true});const app=page.frameLocator('#mfPrivateApp');
 const fresh=await app.locator('body').evaluate(()=>MF_APP_ENGINE.fresh());f.rows={book:{revision:1,payload:fresh},catalogs:{revision:1,payload:{categories:[],people:[],bills:[]}},preferences:{revision:1,payload:{version:1,notificationDays:3,periods:[]}},planning:{revision:1,payload:{version:1,budgets:[],goals:[],reservations:[]}},reminders:{revision:1,payload:[]},notifications:{revision:1,payload:[]}};f.failModule='planning';
 await login(page,f);await expect(app.locator('#mfFinalRecoveryDialog')).toBeVisible();await expect(app.locator('#mfFinalRecoveryStatus')).toContainText('pendiente');expect(await app.locator('body').evaluate(()=>MF_RELEASE_LOCKED)).toBe(true);expect(await app.locator('body').evaluate(()=>!!MF_VAULT_CONTEXT.storage.getItem('mf_release_before_final_sync'))).toBe(true);
 f.failModule=null;await app.locator('#mfFinalRecoveryRetry').click();await expect(app.locator('#mfFinalRecoveryDialog')).not.toBeVisible();expect(await app.locator('body').evaluate(()=>MF_RELEASE_LOCKED)).toBe(false);expect(await app.locator('body').evaluate(()=>MF_VAULT_CONTEXT.storage.getItem('mf_release_initialized_33333333-3333-4333-8333-333333333333'))).toBe('true');expect(f.finalize).toBe(0);
 await about(app);await expect(app.locator('#mfReleaseCard')).toBeHidden();
});
test('unclassified local data is not replaced when recovery consent is declined',async({page})=>{
 const f=await setup(page,{phase:'completed',finalLogin:true});page.removeAllListeners('dialog');page.on('dialog',d=>d.dismiss());const app=page.frameLocator('#mfPrivateApp');await app.locator('body').evaluate(()=>localStorage.setItem('misfinanzas_planning_v1',JSON.stringify({version:1,budgets:[],goals:[{id:'local-preserve'}],reservations:[]})));await login(page,f);await expect(app.locator('#mfFinalRecoveryStatus')).toContainText('cancelada');expect(f.gets).not.toContain('book');expect(await app.locator('body').evaluate(()=>localStorage.getItem('misfinanzas_planning_v1'))).toContain('local-preserve');expect(await app.locator('body').evaluate(()=>MF_RELEASE_LOCKED)).toBe(true);
});
test('existing test-owner device archives its encrypted vault before switching to the verified final account',async({page})=>{
 const f=await setup(page),app=await login(page,f);await app.locator('body').evaluate(async()=>{await document.getElementById('mfdev-frame').contentWindow.MF_BOOK_SESSION.ensureOwner();localStorage.setItem('mf_synthetic_archive_marker','PRESERVE_TEST_DEVICE');});
 const fresh=await app.locator('body').evaluate(()=>MF_APP_ENGINE.fresh());f.rows={book:{revision:1,payload:fresh},catalogs:{revision:1,payload:{categories:[],people:[],bills:[]}},preferences:{revision:1,payload:{version:1,notificationDays:3,periods:[]}},planning:{revision:1,payload:{version:1,budgets:[],goals:[],reservations:[]}},reminders:{revision:1,payload:[]},notifications:{revision:1,payload:[]}};f.state={...receipt};f.owner=FINAL;
 await page.locator('#vaultLock').click();await open(page);await login(page,f,true);await expect(page.locator('#mfPrivateApp')).toHaveCount(0);const archives=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('__mf_release_archive_')));expect(archives).toHaveLength(1);expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('PRESERVE_TEST_DEVICE');
 await open(page);const finalApp=await login(page,f);await expect.poll(()=>finalApp.locator('body').evaluate(()=>MF_VAULT_CONTEXT.storage.getItem('mf_release_initialized_33333333-3333-4333-8333-333333333333'))).toBe('true');expect(await finalApp.locator('body').evaluate(()=>localStorage.getItem('mf_synthetic_archive_marker'))).toBeNull();expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('__mf_release_archive_')).length)).toBe(1);expect(f.finalize).toBe(0);
});
test('reserved final email can retry normal registration after reopening an interrupted transition',async({page})=>{
 const f=await setup(page,{phase:'awaiting_signup'});f.state.target_email='final@example.invalid';const app=await login(page,f);await expect(app.locator('#mfReleaseDialog')).toBeVisible();await expect(app.locator('#mfReleaseEmail')).toHaveValue('final@example.invalid');await expect(app.locator('#mfReleaseRegister')).toBeEnabled();await app.locator('#mfReleaseBackupStored').check();await app.locator('#mfReleasePassword').fill('SyntheticOnly!12345');await app.locator('#mfReleaseRegister').click();await expect.poll(()=>f.signup).toBe(1);expect(f.finalize).toBe(0);await expect(app.locator('#mfReleasePassword')).toHaveValue('');
});
test('missing definitive book never marks an incomplete recovery as initialized',async({page})=>{
 const f=await setup(page,{phase:'completed',finalLogin:true}),app=await login(page,f);await expect(app.locator('#mfFinalRecoveryStatus')).toContainText('libro definitivo');expect(await app.locator('body').evaluate(()=>MF_RELEASE_LOCKED)).toBe(true);expect(await app.locator('body').evaluate(()=>MF_VAULT_CONTEXT.storage.getItem('mf_release_initialized_33333333-3333-4333-8333-333333333333'))).toBeNull();expect(f.finalize).toBe(0);
});
