/* Local encrypted storage. AES-GCM implementation is pinned, licensed and hashed in vendor/. */
import {gcm} from './vendor/noble-ciphers/aes.js';
export const KEY='mf_private_vault_v1',LEASE='misfinanzas_private_vault_session_v1';
const KDF_ITERATIONS=600000,LIMIT=3*1024*1024,encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const b64=a=>{let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);};
const bytes=s=>{if(typeof s!=='string'||s.length>8*1024*1024)throw Error('Copia cifrada inválida');return Uint8Array.from(atob(s),x=>x.charCodeAt(0));};
export function protectedKey(k){return k!==KEY&&/^(misfinanzas_|mf_|MF_|minorte_|presupuesto_demo_)/.test(k);}
export function strongPassphrase(s){return typeof s==='string'&&s.length>=12&&s.length<=1024&&/[A-Z]/.test(s)&&/[a-z]/.test(s)&&/[0-9]/.test(s)&&/[^A-Za-z0-9]/.test(s);}
export class Vault{
 #native;#crypto;#locks;#key=null;#release=null;#meta=null;#epoch=0;#leaseDone=null;
 constructor({storage,crypto=globalThis.crypto,locks=globalThis.navigator?.locks}){
  this.#native=storage;this.#crypto=crypto;this.#locks=locks;
  const api={getItem:k=>this.get(String(k)),setItem:(k,v)=>this.set(String(k),String(v)),removeItem:k=>this.remove(String(k)),clear:()=>{throw Error('El borrado requiere una transición privada revisada');},key:i=>this.keys()[i]??null};
  Object.defineProperty(api,'length',{get:()=>this.keys().length,configurable:true});
  this.storage=new Proxy(api,{ownKeys:()=>this.keys(),getOwnPropertyDescriptor:(_,k)=>this.keys().includes(k)?{enumerable:true,configurable:true,value:this.get(k)}:undefined,get:(o,k)=>k in o?o[k]:typeof k==='string'?this.get(k):undefined});
 }
 get exists(){return this.#native.getItem(KEY)!==null;}
 get unlocked(){return this.#key!==null;}
 async #lease(){if(!this.#locks?.request)throw Error('Este navegador no permite un acceso local exclusivo y seguro');if(this.#leaseDone)await this.#leaseDone.catch(()=>{});await new Promise((resolve,reject)=>{this.#leaseDone=this.#locks.request(LEASE,{ifAvailable:true},async lock=>{if(!lock){reject(Error('MisFinanzas ya está abierta en otra pestaña de este dispositivo'));return;}await new Promise(release=>{this.#release=release;resolve();});});this.#leaseDone.catch(reject);});}
 #aad(meta){return encoder.encode(JSON.stringify({format:1,kdf:'PBKDF2-SHA256',iterations:meta.iterations,salt:meta.salt,owner:meta.owner??null}));}
 #opened(){if(!this.#key)throw Error('Abre tu bóveda privada para acceder a los datos');}
 #decode(envelope){
  if(!envelope||envelope.format!==1||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==KDF_ITERATIONS||bytes(envelope.salt).length!==16||bytes(envelope.nonce).length!==12)throw Error('Formato de bóveda no compatible');
  const plain=gcm(this.#key,bytes(envelope.nonce),this.#aad(envelope)).decrypt(bytes(envelope.ciphertext));
  try{const value=JSON.parse(decoder.decode(plain));if(value.format!==1||!Number.isSafeInteger(value.revision)||value.revision<1||!value.values||Array.isArray(value.values)||typeof value.values!=='object'||Object.entries(value.values).some(([k,v])=>!protectedKey(k)||typeof v!=='string'))throw Error('Contenido de bóveda inválido');return value;}finally{plain.fill(0);}
 }
 #read(){this.#opened();const raw=this.#native.getItem(KEY);if(raw===null)throw Error('La copia cifrada desapareció; protege el respaldo antes de continuar');const meta=JSON.parse(raw);if(meta.salt!==this.#meta.salt||meta.owner!==this.#meta.owner)throw Error('La identidad de la bóveda cambió en otra operación');return {raw,data:this.#decode(meta),meta};}
 #write(data,meta,expected){
  this.#opened();const plain=encoder.encode(JSON.stringify(data));if(plain.length>LIMIT)throw Error('La copia local supera 3 MiB: conserva el respaldo y revisa el almacenamiento');
  let encoded;try{const nonce=this.#crypto.getRandomValues(new Uint8Array(12)),ciphertext=gcm(this.#key,nonce,this.#aad(meta)).encrypt(plain);encoded=JSON.stringify({...meta,nonce:b64(nonce),ciphertext:b64(ciphertext)});const roundtrip=this.#decode(JSON.parse(encoded));if(JSON.stringify(roundtrip)!==JSON.stringify(data))throw Error('No se pudo comprobar el cifrado');}finally{plain.fill(0);}
  if(this.#native.getItem(KEY)!==expected)throw Error('La bóveda cambió: conserva ambas versiones antes de continuar');
  this.#native.setItem(KEY,encoded);if(this.#native.getItem(KEY)!==encoded)throw Error('No se confirmó la escritura cifrada');this.#meta={...meta};
 }
 async unlock(passphrase,{create=false}={}){
  if(this.unlocked)throw Error('La bóveda ya está abierta');if(!strongPassphrase(passphrase))throw Error('Usa al menos 12 caracteres con mayúsculas, minúsculas, números y símbolos');
  const epoch=++this.#epoch;await this.#lease();try{
   if(epoch!==this.#epoch)throw Error('El acceso se canceló al bloquear la aplicación');
   const raw=this.#native.getItem(KEY);if(raw===null&&!create)throw Error('Primero protege la información de este dispositivo');if(raw!==null&&create)throw Error('La bóveda existe; no se sobrescribirá');
   const meta=raw===null?{format:1,kdf:'PBKDF2-SHA256',iterations:KDF_ITERATIONS,salt:b64(this.#crypto.getRandomValues(new Uint8Array(16))),owner:null}:JSON.parse(raw);
   if(meta.format!==1||meta.kdf!=='PBKDF2-SHA256'||meta.iterations!==KDF_ITERATIONS||bytes(meta.salt).length!==16)throw Error('Formato de bóveda no compatible');
   const material=await this.#crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveBits']);const derived=new Uint8Array(await this.#crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(meta.salt),iterations:KDF_ITERATIONS,hash:'SHA-256'},material,256));if(epoch!==this.#epoch){derived.fill(0);throw Error('El acceso se canceló al bloquear la aplicación');}this.#key=derived;this.#meta={...meta};
   const data=raw===null?{format:1,revision:1,values:{}}:this.#decode(meta),legacy=[];
   for(let i=0;i<this.#native.length;i++){const k=this.#native.key(i);if(protectedKey(k)){const value=this.#native.getItem(k);if(Object.prototype.hasOwnProperty.call(data.values,k)&&data.values[k]!==value)throw Error('Hay dos versiones locales diferentes: deben conciliarse antes de abrir');data.values[k]=value;legacy.push(k);}}
   if(raw===null||legacy.length)this.#write(data,meta,raw);
   for(const k of legacy){this.#native.removeItem(k);if(this.#native.getItem(k)!==null)throw Error('No se retiró la copia local sin cifrar; el respaldo cifrado está conservado');}
   return true;
  }catch(error){this.lock();throw Error(/tag|decrypt/i.test(error.message)?'La clave no coincide o la copia fue alterada':error.message);}
 }
 lock(){this.#epoch++;if(this.#key)this.#key.fill(0);this.#key=null;this.#meta=null;if(this.#release)this.#release();this.#release=null;}
 keys(){const {data}=this.#read();const keys=Object.keys(data.values);for(let i=0;i<this.#native.length;i++){const k=this.#native.key(i);if(k!==KEY&&!protectedKey(k))keys.push(k);}return keys;}
 get(k){this.#opened();if(k===KEY)throw Error('La copia cifrada se exporta desde la pantalla de acceso');if(!protectedKey(k))return this.#native.getItem(k);const {data}=this.#read();if(this.#native.getItem(k)!==null)throw Error('Otra versión está escribiendo sin cifrar; cierra esa pestaña y conserva el respaldo');return data.values[k]??null;}
 set(k,v){this.#opened();if(k===KEY)throw Error('No se puede reemplazar la bóveda desde un módulo');if(!protectedKey(k)){this.#native.setItem(k,v);return;}const current=this.#read();current.data.values[k]=v;current.data.revision++;this.#write(current.data,current.meta,current.raw);}
 remove(k){this.#opened();if(k===KEY)throw Error('No se puede eliminar la bóveda desde un módulo');if(!protectedKey(k)){this.#native.removeItem(k);return;}const c=this.#read();delete c.data.values[k];c.data.revision++;this.#write(c.data,c.meta,c.raw);}
 async bindOwner(owner){this.#opened();const epoch=this.#epoch;if(typeof owner!=='string'||!owner)throw Error('Se requiere el titular autenticado');const hash=b64(new Uint8Array(await this.#crypto.subtle.digest('SHA-256',encoder.encode(owner))));this.#opened();if(epoch!==this.#epoch)throw Error('La sesión privada cambió; identidad descartada');const c=this.#read();if(c.meta.owner&&c.meta.owner!==hash)throw Error('Esta bóveda pertenece a otra identidad: no se mezclarán sus datos');if(!c.meta.owner){c.meta.owner=hash;c.data.revision++;this.#write(c.data,c.meta,c.raw);}}
 verifyEncryptedBackup(raw){this.#opened();const meta=JSON.parse(raw);if(meta.salt!==this.#meta.salt||meta.owner!==this.#meta.owner)throw Error('La copia no corresponde a esta boveda');this.#decode(meta);return true;}
 async switchReleaseOwner(owner,receipt,{confirmed=false}={}){
  this.#opened();if(!confirmed||receipt?.phase!=='completed'||receipt.test_mode!==false||!receipt.job_id||receipt.test_owner===receipt.final_owner||!/^[a-f0-9]{64}$/.test(receipt.manifest_sha||'')||!/^[a-f0-9]{64}$/.test(receipt.backup_cipher_sha||''))throw Error('Se requiere transicion definitiva confirmada por el servidor');
  const split=owner.lastIndexOf(':'),base=owner.slice(0,split+1);if(owner.slice(split+1)!==receipt.final_owner||!new RegExp('^https:'+'//[a-z0-9-]+[.]supabase[.]co:$').test(base))throw Error('Titular definitivo no coincide');
  const epoch=this.#epoch,hash=async text=>b64(new Uint8Array(await this.#crypto.subtle.digest('SHA-256',encoder.encode(text)))),target=await hash(owner),prior=await hash(base+receipt.test_owner);this.#opened();if(epoch!==this.#epoch)throw Error('La sesion local cambio');const current=this.#read();if(current.meta.owner===target)return {already:true};if(current.meta.owner!==prior)throw Error('La boveda no pertenece al usuario de pruebas identificado');
  const rawHash=await hash(current.raw);this.#opened();if(epoch!==this.#epoch||this.#native.getItem(KEY)!==current.raw)throw Error('La copia local cambio durante la transicion');const archive='__mf_release_archive_'+receipt.job_id+'_'+rawHash;
  const existing=this.#native.getItem(archive);if(existing!==null&&existing!==current.raw)throw Error('Ya existe otra copia de transicion');if(existing===null)this.#native.setItem(archive,current.raw);if(this.#native.getItem(archive)!==current.raw)throw Error('No se confirmo la copia local previa');
  const values={mf_release_receipt:JSON.stringify(receipt),mf_release_archive_key:archive,mf_release_recovery_pending:receipt.job_id};if(current.data.values.mf_native_reminders_enabled!==undefined)values.mf_native_reminders_enabled=current.data.values.mf_native_reminders_enabled;
  this.#write({format:1,revision:current.data.revision+1,values},{...current.meta,owner:target},current.raw);return {archived:true,archive};
 }
 exportEncrypted(){const raw=this.#native.getItem(KEY);if(!raw)throw Error('Aún no existe una copia cifrada');return raw;}
}
