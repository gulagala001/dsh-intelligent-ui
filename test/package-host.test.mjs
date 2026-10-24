import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,symlink,rm,readdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {parse} from 'yaml';

const root=fileURLToPath(new URL('../',import.meta.url));
const hosts=['0.2.1-rc.1','0.2.1-rc.2','0.2.1-rc.3'];
// The fixture runs the complete packager; only install is replaced so it cannot fetch dependencies.
async function fixture(t){
  const base=await realpath(await mkdtemp(join(tmpdir(),'iui-host-package-')));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const source=join(base,'source'),builds=join(base,'builds'),out=join(base,'packages'),bin=join(base,'bin');
  for(const dir of [source,builds,out,bin,...['src','scripts','skills','presets','docs','test','node_modules'].map(name=>join(source,name))])await mkdir(dir,{recursive:true});
  for(const name of ['README.md','README_EN.md','LICENSE','CHANGELOG.md','THIRD_PARTY_NOTICES.md','cordis.patch.yml'])await writeFile(join(source,name),'Synthetic public fixture\n');
  for(const script of ['package-host.mjs','check-public-files.mjs','package-manager.mjs','host-versions.mjs'])await cp(join(root,'scripts',script),join(source,'scripts',script));
  await writeFile(join(source,'pnpm-lock.yaml'),'lockfileVersion: "9.0"\n');
  await writeFile(join(source,'pnpm-workspace.yaml'),'overrides: {}\n');
  await symlink(await realpath(join(root,'node_modules/yaml')),join(source,'node_modules/yaml'),'dir');
  await writeFile(join(source,'src/current.mjs'),'export const current = true;\n');
  await writeFile(join(source,'presets/cordis.patch.yml'),'\u002d insert:\n    - id: preset-intelligent-chat\n      config:\n        plugins:\n          - id: persona\n            config:\n              suffix: old suffix\n');
  await writeFile(join(source,'scripts/build.mjs'),`import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.IUI_FIXTURE_FAIL==='build')throw Error('Synthetic build failure');
await mkdir('lib',{recursive:true});await writeFile('lib/current.js','current');`);
  await writeFile(join(source,'package.json'),JSON.stringify({name:'iui-package-host-fixture',version:'0.2.1-rc.2.iui.1.0.0',files:['src','lib','presets'],engines:{},devDependencies:{},peerDependencies:{}}));
  const pnpm=process.env.IUI_PNPM_ENTRY??process.env.npm_execpath;
  assert.ok(pnpm,'run this test with the declared pnpm script');
  const launcher=join(bin,'pnpm.cjs');
  await writeFile(launcher,`const {execFileSync}=require('node:child_process');
const args=process.argv.slice(2);
if(args[0]==='install'){if(process.env.IUI_FIXTURE_FAIL==='install')process.exit(71);process.exit(0);}
if(args.includes('pack')&&!args.includes('--dry-run')&&process.env.IUI_FIXTURE_FAIL==='pack')process.exit(72);
try{process.stdout.write(execFileSync(process.execPath,[${JSON.stringify(pnpm)},...args],{encoding:'utf8',env:process.env}));}catch(e){process.exit(e.status||1);}
`);
  const env={...process.env,IUI_PNPM_ENTRY:launcher,IUI_BUILD_ROOT:builds,IUI_PACKAGE_OUT:out};
  const run=(host,extra={})=>spawnSync(process.execPath,[join(source,'scripts/package-host.mjs'),host],{env:{...env,...extra},encoding:'utf8',timeout:60000});
  const success=(host,extra={})=>{const result=run(host,extra);assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim().split('\n').at(-1));};
  return {base,source,builds,out,run,success};
}

test('fresh host packaging removes deleted source and generated files while preserving unowned old output', {skip:process.platform==='win32'},async t=>{
  const f=await fixture(t);
  for(const host of hosts){
    const target=join(f.builds,host);
    await mkdir(join(target,'src'),{recursive:true});await writeFile(join(target,'src/removed-module.mjs'),'old module');
    await writeFile(join(target,'user-data.json'),'preserve unknown old data');
    const result=f.success(host);
    assert.equal(result.buildDirectory,target);
    assert.equal(await readFile(join(result.previousBuildDirectory,'user-data.json'),'utf8'),'preserve unknown old data');
    const files=execFileSync('tar',['-tzf',result.package],{encoding:'utf8'}).split('\n');
    assert.ok(files.includes('package/src/current.mjs'));
    assert.ok(files.includes('package/lib/current.js'));
    assert.ok(!files.some(path=>/removed-module|user-data|iui-package-host\.json/.test(path)));
    const pkg=JSON.parse(execFileSync('tar',['-xOf',result.package,'package/package.json'],{encoding:'utf8'}));
    assert.equal(pkg.version,host+'.iui.1.0.0');
    for(const section of ['peerDependencies','devDependencies']){
      assert.equal(pkg[section]['@deepseek-ai/dsh'],host);
      assert.equal(pkg[section]['@deepseek-ai/cordis'],'4.0.5');
      assert.equal(pkg[section]['@deepseek-ai/schemastery'],'3.18.5');
    }
    const preset=parse(execFileSync('tar',['-xOf',result.package,'package/presets/cordis.patch.yml'],{encoding:'utf8'}));
    assert.equal(preset[0].insert[0].config.plugins[0].config.suffix,undefined);
    await writeFile(join(target,'src/stale.mjs'),'stale');await writeFile(join(target,'lib/stale.js'),'stale generated');
    const second=f.success(host);
    assert.equal(second.previousBuildDirectory,undefined);
    assert.deepEqual((await readdir(join(target,'src'))),['current.mjs']);
    assert.deepEqual((await readdir(join(target,'lib'))),['current.js']);
  }
  assert.ok(!(await readdir(f.out)).some(name=>name.startsWith('.iui-')));
});

test('install, build and pack failures keep the last complete host output and package', {skip:process.platform==='win32'},async t=>{
  const f=await fixture(t),host=hosts[1],initial=f.success(host);
  const bytes=await readFile(initial.package),pkg=await readFile(join(initial.buildDirectory,'package.json'));
  for(const phase of ['install','build','pack']){
    await writeFile(join(f.source,'src/current.mjs'),phase);
    const result=f.run(host,{IUI_FIXTURE_FAIL:phase});assert.notEqual(result.status,0);
    assert.deepEqual(await readFile(initial.package),bytes);
    assert.deepEqual(await readFile(join(initial.buildDirectory,'package.json')),pkg);
    assert.equal(await readFile(join(initial.buildDirectory,'src/current.mjs'),'utf8'),'export const current = true;\n');
    assert.deepEqual(await readdir(f.builds),[host]);
    assert.ok(!(await readdir(f.out)).some(name=>name.startsWith('.iui-')));
  }
});

test('unsafe source, filesystem-root, overlapping and linked output paths are rejected', {skip:process.platform==='win32'},async t=>{
  const f=await fixture(t),host=hosts[1];
  const cases=[{IUI_BUILD_ROOT:f.source},{IUI_BUILD_ROOT:'/'},{IUI_PACKAGE_OUT:'/'},{IUI_BUILD_ROOT:join(f.source,'src')},{IUI_PACKAGE_OUT:join(f.source,'docs')},{IUI_PACKAGE_OUT:join(f.builds,host)}];
  for(const env of cases){const result=f.run(host,env);assert.notEqual(result.status,0);assert.match(result.stderr,/outputs must be separate/);}
  await rm(join(f.builds,host),{recursive:true,force:true});
  await symlink(join(f.source,'src'),join(f.builds,host),'dir');
  const result=f.run(host);assert.notEqual(result.status,0);assert.match(result.stderr,/not a link/);
  assert.equal(await readFile(join(f.source,'src/current.mjs'),'utf8'),'export const current = true;\n');
});

test('failed package publication rolls back the completed host directory without touching unrelated output', {skip:process.platform==='win32'},async t=>{
  const f=await fixture(t),host=hosts[1],initial=f.success(host);
  const original=await readFile(join(initial.buildDirectory,'src/current.mjs'));
  // A directory occupying the package filename makes rename fail after build publication.
  await rm(initial.package);await mkdir(initial.package);await writeFile(join(initial.package,'user-data'),'preserve');
  await mkdir(join(f.builds,'unrelated-host'));await writeFile(join(f.builds,'unrelated-host','data'),'unrelated');
  await writeFile(join(f.source,'src/current.mjs'),'new source');
  assert.notEqual(f.run(host).status,0);
  assert.deepEqual(await readFile(join(initial.buildDirectory,'src/current.mjs')),original);
  assert.equal(await readFile(join(initial.package,'user-data'),'utf8'),'preserve');
  assert.equal(await readFile(join(f.builds,'unrelated-host','data'),'utf8'),'unrelated');
  assert.deepEqual((await readdir(f.builds)).sort(),[host,'unrelated-host'].sort());
  assert.ok(!(await readdir(f.out)).some(name=>name.startsWith('.iui-')));
});
