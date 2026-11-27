/* One memory-only authenticated session for every application module. */
(function(root){'use strict';
 function create({base,key,fetch:request=root.fetch,onClose=()=>{},onReady=()=>{}}){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base))throw Error('Configuración de conexión inválida');
  if(!root.MF_SAFETY.publicKey(key))throw Error('La configuración requiere una clave pública');
  let current=null,epoch=0,refreshing=null;
  const profile={'Accept-Profile':'mf_next','Content-Profile':'mf_next'};
  function session(){if(!current)throw Error('Inicia sesión');return {owner:base+':'+current.user.id,epoch,user:{id:current.user.id,email:current.user.email}};}
  async function raw(path,{method='GET',body,token,headers={}}={}){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
   try{const response=await request(base+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
    const data=await response.json().catch(()=>null);if(!response.ok){const e=Error(path.includes('/auth/v1/token')?'No se pudo iniciar sesión. Revisa tus credenciales y la confirmación del correo.':data?.message||data?.error_description||'No se completó la solicitud');e.status=response.status;e.code=data?.code;throw e;}return data;
   }finally{clearTimeout(timer);}
  }
  function accept(d){if(!d?.access_token||!d.user?.id||!d.user.email_confirmed_at)throw Error('Se requiere una cuenta con correo verificado');return {access:d.access_token,refresh:d.refresh_token,user:d.user,expires:Date.now()+Math.max(0,Number(d.expires_in||3600))*1000};}
  async function login(email,password){const started=++epoch;current=null;const data=await raw('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(epoch!==started)throw Error('Acceso descartado: la sesión cambió');current=accept(data);onReady(session());return session();}
  async function access(){if(!current)throw Error('Inicia sesión');if(current.expires>Date.now()+60000)return current.access;
   if(!refreshing){const started=epoch,token=current.refresh;refreshing=(async()=>{try{const data=await raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:token}});if(epoch!==started)throw Error('La sesión cambió');current=accept(data);return current.access;}catch(e){if(epoch===started){current=null;epoch++;onClose();}throw e;}finally{refreshing=null;}})();}return refreshing;
  }
  async function authorized(path,options={}){const started=epoch,token=await access();const data=await raw(path,{...options,token});if(started!==epoch)throw Error('Respuesta descartada: la sesión cambió');return data;}
  async function logout(){const old=current;current=null;epoch++;onClose();if(old?.access)await raw('/auth/v1/logout?scope=local',{method:'POST',token:old.access});}
  const allowed=new Set(['book','catalogs','planning','reminders','preferences','notifications']);
  async function get(name){if(!allowed.has(name))throw Error('Módulo inválido');const rows=await authorized('/rest/v1/rpc/get_module_state?p_module='+encodeURIComponent(name),{headers:profile});if(!Array.isArray(rows)||rows.length>1)throw Error('Respuesta inválida');return rows[0]||null;}
  const contract=()=>authorized('/rest/v1/rpc/book_sync_contract',{headers:profile});
  async function put(name,revision,payload){if(!allowed.has(name))throw Error('Módulo inválido');const gate=await contract();if(gate?.version!==1||!gate.protected||!gate.enabled||!gate.authorized)throw Error('La sincronización no está habilitada para esta cuenta');return authorized('/rest/v1/rpc/put_module_state',{method:'POST',headers:profile,body:{p_module:name,p_expected_revision:revision,p_payload:payload}});}
  const releaseStatus=()=>authorized('/rest/v1/rpc/release_status',{headers:profile});
  async function release(action,payload={}){if(!['status','prepare','backup','ack_backup','reserve_target','cancel','finalize'].includes(action))throw Error('Operación no permitida');return authorized('/functions/v1/misfinanzas-release',{method:'POST',body:{action,payload}});}
  async function registerFinal(email,password){session();if(!root.MF_SAFETY.strongPassword(password))throw Error('Contraseña definitiva insegura');await raw('/auth/v1/signup',{method:'POST',body:{email,password}});}
  async function verifyFinal(email,password){const original=session();if(!email||!password)throw Error('Introduce las credenciales definitivas para verificar el acceso');const d=accept(await raw('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));if(epoch!==original.epoch)throw Error('La sesión cambió');if(d.user.id===current.user.id||d.user.email.toLowerCase()!==email.toLowerCase())throw Error('Usa la cuenta definitiva reservada');return d.access;}
  const revokeFinal=token=>raw('/auth/v1/logout?scope=local',{method:'POST',token}).catch(()=>{});
  return Object.freeze({session,login,logout,get,put,contract,release,releaseStatus,registerFinal,verifyFinal,revokeFinal,recover:email=>raw('/auth/v1/recover',{method:'POST',body:{email}}),ensureOwner:async()=>session()});
 }
 const api={create};root.MF_SESSION_CLIENT=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
