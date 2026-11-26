/* Same-origin typed bridge: credentials remain in the authenticated frame. */
(function(root){'use strict';
 function session(){if(!token||!sessionOwner)throw Error('Inicia sesión con correo verificado en la consulta Supabase');return {owner:base+':'+sessionOwner,epoch:sessionEpoch}}
 const allowed=new Set(['book','planning','catalogs','reminders']);
 const headers={'Accept-Profile':'mf_next','Content-Profile':'mf_next'};
 async function authorizeVault(){const c=session(),vault=root.parent?.MF_VAULT_CONTEXT;if(vault?.bindOwner)await vault.bindOwner(c.owner);if(session().epoch!==c.epoch)throw Error('La sesión cambió');return c}
 async function contract(){await authorizeVault();return req('/rest/v1/rpc/book_sync_contract','GET',undefined,headers)}
 async function get(module){if(!allowed.has(module))throw Error('Operación no permitida');await authorizeVault();const rows=await req('/rest/v1/rpc/get_module_state?p_module='+encodeURIComponent(module),'GET',undefined,headers);if(!Array.isArray(rows)||rows.length>1)throw Error('Respuesta de libro inválida');return rows[0]||null}
 async function put(module,revision,payload){if(!allowed.has(module))throw Error('Operación no permitida');const c=session(),gate=await contract();if(session().epoch!==c.epoch)throw Error('La sesión cambió');if(gate?.version!==1||!gate.protected||!gate.enabled||!gate.authorized)throw Error('Escrituras remotas bloqueadas: entorno no habilitado');const response=await fetch(base+'/rest/v1/rpc/put_module_state',{method:'POST',headers:{...headers,apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_module:module,p_expected_revision:revision,p_payload:payload}),credentials:'omit',cache:'no-store',redirect:'error'});const data=await response.json().catch(()=>null);if(sessionEpoch!==c.epoch)throw Error('Respuesta descartada: la sesión cambió');if(!response.ok){if(response.status===401)clearSession({eraseCredentials:true});const e=Error(data?.message||'No se sincronizó el libro');e.code=data?.code;e.status=response.status;throw e}return data}
 root.MF_BOOK_SESSION=Object.freeze({session,contract,get,put});
})(window);
