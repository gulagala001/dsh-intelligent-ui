import {mkdir,mkdtemp,cp,readFile,writeFile,rm,rename,lstat,realpath} from 'node:fs/promises';
import {resolve,join,sep,basename} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {parse,stringify} from 'yaml';
import {hostPins} from './host-versions.mjs';
import {packageManager} from './package-manager.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const host=process.argv[2],pins=hostPins(host),pnpm=packageManager();
execFileSync(process.execPath,[join(root,'scripts/check-public-files.mjs')],{cwd:root,stdio:'inherit',timeout:120000});
const buildRoot=resolve(process.env.IUI_BUILD_ROOT??resolve(root,'work','builds')),out=resolve(process.env.IUI_PACKAGE_OUT??resolve(root,'work','packages'));
await mkdir(buildRoot,{recursive:true});await mkdir(out,{recursive:true});
const buildBase=await realpath(buildRoot),target=join(buildBase,host),packageOut=await realpath(out),source=await realpath(root);
const contains=(parent,path)=>path===parent||path.startsWith(parent+sep);
const copied=['src','scripts','skills','presets','docs','test','README.md','README_EN.md','LICENSE','CHANGELOG.md','THIRD_PARTY_NOTICES.md','cordis.patch.yml'];
if(buildBase===resolve(buildBase,sep)||packageOut===resolve(packageOut,sep)||buildBase===source||packageOut===source||contains(target,source)||copied.some(name=>contains(join(source,name),buildBase)||contains(join(source,name),packageOut))||contains(target,packageOut)||contains(packageOut,target))throw Error('Build and package outputs must be separate from source and from each other');
let previous;
try{previous=await lstat(target);if(!previous.isDirectory()||previous.isSymbolicLink())throw Error('The host build output must be a directory, not a link');}catch(error){if(error.code!=='ENOENT')throw error;}
// Only these unique directories are recursively removed. An older unmarked output is preserved.
const dir=await mkdtemp(join(buildBase,'.iui-'+host+'-'));
let packDir;
const marker='.iui-package-host.json',owner=JSON.stringify({script:'iui-package-host',source,host});
let backup,installed=false;
try{
packDir=await mkdtemp(join(packageOut,'.iui-pack-'));
for(const name of copied)await cp(join(root,name),join(dir,name),{recursive:true,force:true});
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const revision=pkg.version.match(/\.iui\.(\d+\.\d+\.\d+)$/)?.[1];if(!revision)throw Error('Package version must include a complete IUI semantic version');
pkg.version=host+'.iui.'+revision;pkg.engines.dsh=host;pkg.devDependencies['@deepseek-ai/dsh']=host;pkg.peerDependencies['@deepseek-ai/dsh']=host;
for(const section of ['devDependencies','peerDependencies']){pkg[section]['@deepseek-ai/cordis']=pins.cordis;pkg[section]['@deepseek-ai/schemastery']=pins.schema;}
const workspace=parse(await readFile(join(root,'pnpm-workspace.yaml'),'utf8'));
workspace.overrides={...workspace.overrides,...pins.framework};
await writeFile(join(dir,'pnpm-workspace.yaml'),stringify(workspace,{lineWidth:0}));
await writeFile(join(dir,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const presetPath=join(dir,'presets','cordis.patch.yml'),preset=parse(await readFile(presetPath,'utf8'));
const persona=preset[0]?.insert?.find(row=>row.id==='preset-intelligent-chat')?.config?.plugins?.find(row=>row.id==='persona');
if(!persona?.config)throw Error('The dedicated native persona must exist before host adaptation');
if(pins.personaCwd)persona.config.suffix='Your working directory is {{cwd}}.';else delete persona.config.suffix;
await writeFile(presetPath,stringify(preset,{lineWidth:0}));
const lock=join(root,'scripts','locks',host+'.yaml');
let frozen=false;
try{await cp(lock,join(dir,'pnpm-lock.yaml'));frozen=true;}catch(error){if(error.code!=='ENOENT')throw error;await cp(join(root,'pnpm-lock.yaml'),join(dir,'pnpm-lock.yaml'));}
const run=args=>execFileSync(process.execPath,args,{cwd:dir,stdio:'inherit',timeout:300000});
pnpm(['install','--ignore-scripts',frozen?'--frozen-lockfile':'--no-frozen-lockfile'],{cwd:dir,stdio:'inherit'});
run(['scripts/build.mjs']);
run(['scripts/check-public-files.mjs']);
const packed=JSON.parse(pnpm(['--config.ignore-scripts=true','pack','--json','--pack-destination',packDir],{cwd:dir,encoding:'utf8'}));
if(!packed?.filename||resolve(packDir,basename(packed.filename))!==resolve(packDir,packed.filename))throw Error('pnpm returned an invalid package filename');
packed.filename=basename(packed.filename);
run(['scripts/check-public-files.mjs','--archive',join(packDir,packed.filename)]);
await writeFile(join(dir,marker),owner+'\n');
if(previous){
  const reserved=await mkdtemp(join(buildBase,'.iui-previous-'+host+'-'));
  await rm(reserved,{recursive:true});await rename(target,reserved);backup=reserved;
}
await rename(dir,target);installed=true;
try{await rename(join(packDir,packed.filename),join(packageOut,packed.filename));}
catch(error){await rename(target,dir);installed=false;if(backup){await rename(backup,target);backup=null;}throw error;}
if(backup){
  let owned=false;try{owned=(await readFile(join(backup,marker),'utf8')).trim()===owner;}catch{}
  if(owned){await rm(backup,{recursive:true});backup=null;}
}
console.log(JSON.stringify({host,version:pkg.version,package:join(packageOut,packed.filename),buildDirectory:target,...(backup?{previousBuildDirectory:backup}:{})}));
}catch(error){
  if(backup&&!installed){await rename(backup,target);backup=null;}
  throw error;
}finally{
  if(!installed)await rm(dir,{recursive:true,force:true});
  if(packDir)await rm(packDir,{recursive:true,force:true});
}
