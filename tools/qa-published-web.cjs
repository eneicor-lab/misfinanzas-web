// Read-only production delivery smoke. Browser-local synthetic vault; never authenticates or writes to Supabase.
const {chromium}=require('@playwright/test'),fs=require('fs');
const base='https://eneicor-lab.github.io/misfinanzas-web/';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),result={url:base,backendWrites:false,authenticated:false,cases:[]};
 try{for(const viewport of[{width:1365,height:900},{width:390,height:844}]){const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});if(!response||response.status()!==200)throw Error('Published HTTPS entry did not return HTTP200');
  await page.waitForURL(/\/web\/index\.html(?:[?#]|$)/,{timeout:20000});await page.locator('#vaultForm').waitFor({state:'visible',timeout:20000});await page.waitForFunction(()=>window.MF_VAULT_READY===true,null,{timeout:20000});
  await page.locator('#vaultPassword').fill('BrowserOnly+QA2026!');await page.locator('#vaultConfirmation').fill('BrowserOnly+QA2026!');await page.locator('#vaultOpen').click();await page.waitForFunction(()=>window.MF_APP_READY===true,null,{timeout:20000});
  const app=page.frameLocator('#mfPrivateApp');await app.locator('body').evaluate(()=>navTo('acerca'));const text=await app.locator('#acerca').innerText();if(!text.includes('Creado por: Eduardo Neisa Cortés'))throw Error('Published creator attribution differs');
  const feature=await app.locator('body').evaluate(()=>!!window.MF_RELEASE_TRANSITION);if(!feature)throw Error('Published release transition client missing');if(errors.length)throw Error('Published application JavaScript error');
  result.cases.push({viewport,httpsLoaded:true,encryptedVaultOpened:true,appReady:true,attribution:true,transitionClientLoaded:true,privateTransitionExecuted:false,javascriptErrors:errors.length});await context.close();}
  result.status='APROBADO';
 }catch(e){result.status='FALLIDO';result.error=e.message;process.exitCode=1;}finally{await browser.close();fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/published-web.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
