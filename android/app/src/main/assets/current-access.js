/* Authentication precedes every device open. Old ciphertext is preserved, never pushed after recovery. */
export async function openCurrentAccess({api,vault,password,validators,checkBook}){
 const identity=api.session();
 try{await vault.unlock(password,{create:!vault.exists,authenticated:true});return {recovered:false};}
 catch(error){if(error.code!=='VAULT_KEY_MISMATCH')throw error;}
 const gate=await api.contract();
 if(gate?.version!==1||!gate.protected||!gate.authorized)throw Error('La sesión es válida, pero el servidor no autoriza recuperar la información de este titular. La copia local se conserva intacta.');
 const receipt=await api.releaseStatus(),rows=new Map();
 for(const name of ['book',...Object.keys(validators)]){
  const row=await api.get(name);
  if(row!==null){if(!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Revisión compartida inválida; la copia local no se modificó');if(name==='book')checkBook(row.payload);else validators[name](row.payload);}
  if(name==='book'&&row===null)throw Error('No se encontró el libro sincronizado. La copia local anterior permanece intacta; no se iniciará un libro vacío.');
  rows.set(name,row);
 }
 const now=api.session();if(identity.owner!==now.owner||identity.epoch!==now.epoch)throw Error('La sesión cambió durante la recuperación');
 const result=await vault.recoverRemote(identity.owner,password,{confirmed:true,receipt,authenticated:true});
 return {recovered:true,rows,archive:result.archive};
}
