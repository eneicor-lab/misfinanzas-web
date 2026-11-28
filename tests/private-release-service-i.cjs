/* Isolated runner adapter. Private implementation is supplied only through a masked repository secret. */
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto');
(async()=>{const dir=process.env.RUNNER_TEMP;if(!dir||!process.env.MF_PRIVATE_RELEASE_QA)throw Error('Private QA input is not configured');
 const bundle=JSON.parse(Buffer.from(process.env.MF_PRIVATE_RELEASE_QA,'base64').toString('utf8'));if(typeof bundle.sql!=='string'||typeof bundle.edge!=='string')throw Error('Private QA input invalid');
 fs.writeFileSync(dir+'/mf-release-private.sql',bundle.sql,{mode:0o600});
 if(process.argv[2]==='prepare'){console.log('Private QA implementation prepared in ephemeral runner storage.');return;}
 const {createHandler}=await import('data:text/javascript;base64,'+Buffer.from(bundle.edge).toString('base64'));
 const jwtSecret=process.env.GOTRUE_JWT_SECRET,enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const head=enc({alg:'HS256',typ:'JWT'}),payload=enc({role:'service_role',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600});const signature=crypto.createHmac('sha256',jwtSecret).update(head+'.'+payload).digest('base64url');const service=head+'.'+payload+'.'+signature;
 const env=k=>({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:service,MF_WEB_ORIGIN:'http://127.0.0.1:8765'})[k];
 let interruptedDelete=false,interruptedFinish=false;
 const handler=createHandler({env,fetch:(url,o)=>{const u=new URL(url),auth=u.pathname.startsWith('/auth/v1/');
  // Controlled transport failures prove resumption around real SQL/Auth operations.
  if(o.method==='DELETE'&&u.pathname.startsWith('/auth/v1/admin/users/')&&!interruptedDelete){interruptedDelete=true;return Promise.resolve(Response.json({},{status:503}));}
  if(u.pathname.endsWith('/release_admin')&&o.body&&JSON.parse(o.body).p_action==='finish'&&!interruptedFinish){interruptedFinish=true;return Promise.resolve(Response.json({},{status:503}));}
  return fetch((auth?'http://127.0.0.1:9999':'http://127.0.0.1:3001')+u.pathname.replace(auth?'/auth/v1':'/rest/v1','')+u.search,o);}});
 http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request('http://127.0.0.1:3002'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"message":"Isolated private service failed"}');}}).listen(3002,'127.0.0.1',()=>console.log('Isolated private transition service ready.'));
})().catch(()=>{console.error('Isolated private QA configuration failed; private implementation not logged.');process.exitCode=1;});
