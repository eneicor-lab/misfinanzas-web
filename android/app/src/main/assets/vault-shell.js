import {Vault} from './private-vault.js';
const form=document.getElementById('vaultForm'),status=document.getElementById('vaultStatus'),panel=document.getElementById('vaultPanel'),toolbar=document.getElementById('privateToolbar'),password=document.getElementById('vaultPassword'),confirmation=document.getElementById('vaultConfirmation');
const vault=new Vault({storage:window.localStorage});let frame=null,idle=null;
window.MF_VAULT=vault;
function configure(){const create=!vault.exists;document.getElementById('confirmationLabel').hidden=!create;confirmation.required=create;document.getElementById('vaultOpen').textContent=create?'Proteger y abrir':'Abrir MisFinanzas';document.getElementById('vaultCopy').disabled=create;password.autocomplete=create?'new-password':'current-password';}
function resetIdle(){clearTimeout(idle);idle=setTimeout(()=>lock('La aplicación se bloqueó por inactividad.'),5*60*1000);}
function lock(message='Aplicación bloqueada. Tus datos locales permanecen cifrados.'){
 try{const bridge=frame?.contentWindow?.document.getElementById('mfdev-frame')?.contentWindow?.MF_BOOK_SESSION;if(bridge?.logout)void bridge.logout({lockPrivate:false});}catch{}
 clearTimeout(idle);vault.lock();window.MF_APP_READY=false;if(frame){frame.remove();frame=null;}panel.hidden=false;toolbar.hidden=true;status.textContent=message;password.value=confirmation.value='';configure();
}
window.MF_PRIVATE_LOCK=message=>lock(typeof message==='string'?message:undefined);
form.addEventListener('submit',async event=>{event.preventDefault();const open=document.getElementById('vaultOpen');open.disabled=true;status.textContent='Abriendo tu información privada…';
 try{const create=!vault.exists;if(create&&password.value!==confirmation.value)throw Error('Las claves no coinciden');await vault.unlock(password.value,{create});password.value=confirmation.value='';frame=document.createElement('iframe');frame.id='mfPrivateApp';frame.title='MisFinanzas — información privada';frame.src='./app.html';frame.addEventListener('load',()=>{if(!vault.unlocked||!frame)return;try{const app=frame.contentWindow;window.MF_APP_READY=!!(app.MF_APP_STORE&&app.MF_APP_ENGINE.check(app.MF_APP_STORE.read().state));for(const event of ['pointerdown','keydown','input','wheel'])app.addEventListener(event,resetIdle,{passive:true});if(!window.MF_APP_READY)throw Error('No se confirmó la apertura de la aplicación');}catch(error){lock('No fue posible abrir la aplicación: '+error.message);}});document.body.append(frame);panel.hidden=true;toolbar.hidden=false;resetIdle();
 }catch(error){lock(error.message);}finally{password.value=confirmation.value='';open.disabled=false;}
});
document.getElementById('vaultLock').addEventListener('click',()=>lock());
document.getElementById('vaultCopy').addEventListener('click',()=>{try{const blob=new Blob([vault.exportEncrypted()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='MisFinanzas_copia_local_cifrada.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Copia cifrada descargada. Necesitarás la misma clave local para recuperarla.';}catch(error){status.textContent=error.message;}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});
window.addEventListener('pagehide',()=>vault.lock());
configure();window.MF_VAULT_READY=true;

// Native bridge accepts main-frame messages only. A user must opt in while unlocked.
if(window.MF_NATIVE){
 const button=document.createElement('button');button.type='button';button.textContent='Recordatorios Android';toolbar.append(button);
 let refreshing=false,generation=0;
 async function refresh(){if(!vault.unlocked||!frame||refreshing)return;refreshing=true;const current=generation;try{const enabled=vault.storage.getItem('mf_native_reminders_enabled')==='true';const rows=enabled?await window.MF_NATIVE_REMINDERS.plan(JSON.parse(vault.storage.getItem('presupuesto_demo_obligaciones_v12')||'[]'),frame.contentWindow.MF_SCHEDULE_ENGINE):[];if(current===generation)window.MF_NATIVE.postMessage(JSON.stringify({type:'replace',rows}));}catch(error){status.textContent=error.message;}finally{refreshing=false;if(current!==generation)queueMicrotask(refresh);}}
 const originalSet=vault.storage.setItem;
 vault.storage.setItem=(key,value)=>{originalSet(key,value);if(['presupuesto_demo_obligaciones_v12','mf_native_reminders_enabled'].includes(key)){generation++;window.MF_NATIVE.postMessage(JSON.stringify({type:'replace',rows:[]}));void refresh();}};
 button.addEventListener('click',async()=>{if(!vault.unlocked)return;const enabled=vault.storage.getItem('mf_native_reminders_enabled')==='true';vault.storage.setItem('mf_native_reminders_enabled',String(!enabled));if(!enabled)window.MF_NATIVE.postMessage(JSON.stringify({type:'enable'}));await refresh();button.textContent=enabled?'Activar recordatorios Android':'Desactivar recordatorios Android';status.textContent=enabled?'Recordatorios Android desactivados.':'Recordatorios privados programados hasta 179 dias; Android puede retrasarlos. Reabre la aplicacion para renovar el horizonte.';});
 setInterval(refresh,10000);window.addEventListener('pointerdown',()=>{void refresh();},{passive:true});
}
