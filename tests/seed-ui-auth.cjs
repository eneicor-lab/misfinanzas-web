/* Isolated CI Auth + SMTP only. Never emits a session, password or verification link. */
const assert=require('node:assert/strict');
const base='http://127.0.0.1:9999',sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let healthy=false;for(let i=0;i<60;i++){try{healthy=(await fetch(base+'/health')).ok;}catch{}if(healthy)break;await sleep(1000);}assert(healthy,'Isolated Auth did not start');
const signup=await fetch(base+'/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'synthetic-ui@example.invalid',password:'Synthetic+UI!123456'})});assert(signup.ok,'Synthetic signup failed');let token;
for(let i=0;i<30&&!token;i++){const inbox=await(await fetch('http://127.0.0.1:8025/api/v1/messages')).json();for(const m of inbox.messages||[]){const d=await(await fetch('http://127.0.0.1:8025/api/v1/message/'+m.ID)).json();const text=(d.HTML||'')+' '+(d.Text||'');for(const match of text.replace(/&amp;/g,'&').matchAll(/https?:\/\/[^\s<>"\)]+/g)){try{const u=new URL(match[0]);if(u.origin===base&&u.searchParams.get('type')==='signup')token=u.searchParams.get('token');}catch{}}}if(!token)await sleep(1000);}assert(token,'Synthetic SMTP confirmation absent');
const verified=await fetch(base+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token_hash:token,type:'signup'})});assert(verified.ok,'Synthetic email confirmation failed');console.log('PASS isolated UI account created and email verified through real Auth and captured SMTP.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
