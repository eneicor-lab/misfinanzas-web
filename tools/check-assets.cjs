const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=path.resolve(__dirname,'..');
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);}
let count=0;for(const f of walk(path.join(root,'web'))){const relative=path.relative(path.join(root,'web'),f),target=path.join(root,'android/app/src/main/assets',relative);if(!fs.existsSync(target)||!fs.readFileSync(f).equals(fs.readFileSync(target)))throw Error('Web/Android asset mismatch: '+relative);count++;}
const icon=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'web/brand-icon.png'))).digest('hex');if(icon!=='2d3ea14e55f5aa5896212b63ec239ad9142d79349658744363818cb7b8f6a78b')throw Error('Original bank icon changed');
console.log('PASS '+count+' web/Android assets equal, original bank icon SHA256 '+icon);
