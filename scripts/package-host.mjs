import {mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const host=process.argv[2];const pins={'0.2.0-rc.2':{cordis:'4.0.4',schema:'3.18.4'},'0.2.1-alpha.1':{cordis:'4.0.5-alpha.1',schema:'3.18.5-alpha.1'}};
if(!pins[host])throw Error('Choose a verified full DSH version: 0.2.0-rc.2 or 0.2.1-alpha.1');
const dir=resolve(root,'work','builds',host),out=resolve(root,'work','packages');await mkdir(dir,{recursive:true});await mkdir(out,{recursive:true});
for(const name of ['src','scripts','skills','presets','docs','test','README.md','LICENSE','CHANGELOG.md','THIRD_PARTY_NOTICES.md','cordis.patch.yml'])await cp(join(root,name),join(dir,name),{recursive:true,force:true});
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
pkg.version=host+'.iui.1.0.0';pkg.devDependencies['@deepseek-ai/dsh']=host;pkg.peerDependencies['@deepseek-ai/dsh']=host;
for(const section of ['devDependencies','peerDependencies']){pkg[section]['@deepseek-ai/cordis']=pins[host].cordis;pkg[section]['@deepseek-ai/schemastery']=pins[host].schema;}
await writeFile(join(dir,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const run=(command,args)=>execFileSync(command,args,{cwd:dir,stdio:'inherit',timeout:300000,shell:process.platform==='win32'});
run(process.platform==='win32'?'npm.cmd':'npm',['install','--ignore-scripts','--no-audit','--no-fund']);run(process.execPath,['scripts/build.mjs']);
const packed=JSON.parse(execFileSync(process.platform==='win32'?'npm.cmd':'npm',['pack','--ignore-scripts','--json','--pack-destination',out],{cwd:dir,encoding:'utf8',shell:process.platform==='win32'}))[0];
console.log(JSON.stringify({host,version:pkg.version,package:join(out,packed.filename),buildDirectory:dir}));
