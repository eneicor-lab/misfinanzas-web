const http=require('http'),fs=require('fs'),path=require('path');
function createServer(root){const base=path.resolve(root);return http.createServer((req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let name;try{name=decodeURIComponent((req.url||'/').split('?')[0]);}catch{res.writeHead(400);res.end();return;}
 if(name.includes('\\')||name.includes('\0')||name.split('/').some(p=>p==='..'||p.startsWith('.'))){res.writeHead(403);res.end();return;}
 const target=path.resolve(base,'.'+(name==='/'?'/index.html':name));if(!target.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(target,(err,data)=>{if(err){res.writeHead(err.code==='ENOENT'?'404':500);res.end();return;}const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.setHeader('Content-Length',data.length);res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);});
 });}
module.exports={createServer};
if(require.main===module){const server=createServer(path.join(__dirname,'../web'));server.on('error',e=>{console.error('Servidor local no disponible: '+e.message);process.exitCode=1});server.listen(8765,'127.0.0.1',()=>console.log('MisFinanzas candidata: http://127.0.0.1:8765 (Ctrl+C para detener)'));}
