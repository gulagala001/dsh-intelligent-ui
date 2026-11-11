import {build} from 'esbuild';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {writeReferences} from '../src/host/skill.mjs';
import {protocolVersion,componentsVersion} from '../src/protocol/version.mjs';
import {hostPins} from './host-versions.mjs';
import {createRequire} from 'node:module';
import {parse} from 'yaml';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const hostVersion=pkg.devDependencies['@deepseek-ai/dsh'],pins=hostPins(hostVersion),require=createRequire(import.meta.url);
const expected={'@deepseek-ai/dsh':hostVersion,'@deepseek-ai/cordis':pins.cordis,'@deepseek-ai/schemastery':pins.schema};
for(const [name,version] of Object.entries(expected)){
  const installed=JSON.parse(await readFile(require.resolve(name+'/package.json'),'utf8')).version;
  if(installed!==version||pkg.devDependencies[name]!==version||pkg.peerDependencies[name]!==version)throw Error(`Host build requires ${name}@${version}, installed ${installed}`);
}
const lock=parse(await readFile(new URL('../pnpm-lock.yaml',import.meta.url),'utf8'));
const importer = {...lock.importers['.'].dependencies, ...lock.importers['.'].devDependencies};
for (const [name, entry] of Object.entries(importer)) {
  if (!entry.version.startsWith('link:')) continue;
  if (!entry.version.startsWith('link:../.local/dsh-sdk-ddac9676/') || entry.specifier !== entry.version) throw Error('Unexpected source SDK link for ' + name);
  const file = new URL('../' + entry.version.slice(5) + '/package.json', import.meta.url);
  const metadata = JSON.parse(await readFile(file));
  if (metadata.name !== name || metadata.version !== pkg.devDependencies[name] || await realpath(file) !== await realpath(require.resolve(name + '/package.json'))) throw Error('Source SDK identity differs for ' + name);
}
for(const [name,version] of Object.entries(pins.framework)){
  const versions=Object.keys(lock.packages).filter(key=>key.startsWith(name+'@')).map(key=>key.slice(name.length+1));
  if((versions.length===0&&(!Object.hasOwn(expected,name)||importer[name]?.version.startsWith('link:')))||(versions.length===1&&versions[0]===version))continue;
  throw Error(`Host lock requires only ${name}@${version}, found ${versions.join(', ')}`);
}
const sdkVersions=Object.keys(lock.packages).filter(key=>key.startsWith('@deepseek-ai/dsh-')||key.startsWith('@deepseek-ai/dsh@'));
for(const key of sdkVersions){
  if(key.endsWith('@'+hostVersion))continue;
  const entry=lock.packages[key],tarball=entry.resolution?.tarball;
  if(entry.version!==hostVersion||!tarball?.startsWith('file:')||!key.endsWith('@'+tarball))throw Error('Host lock mixes DSH SDK versions');
  const path=fileURLToPath(new URL(tarball.slice(5),new URL('../',import.meta.url)));
  const integrity='sha512-'+createHash('sha512').update(await readFile(path)).digest('base64');
  const source=JSON.parse(execFileSync('tar',['-xOf',path,'package/package.json'],{encoding:'utf8',maxBuffer:1024*1024}));
  if(entry.resolution.integrity!==integrity||source.version!==hostVersion||key!==source.name+'@'+tarball)throw Error('Local Host SDK archive identity or integrity differs from the lock');
}
await writeReferences();
await mkdir(new URL('../lib/',import.meta.url),{recursive:true});
await build({
  entryPoints:[fileURLToPath(new URL('../src/client/index.jsx',import.meta.url))],
  outfile:fileURLToPath(new URL('../lib/client.js',import.meta.url)),
  bundle:true,format:'cjs',platform:'browser',target:'es2022',jsx:'transform',minifySyntax:true,minifyWhitespace:true,keepNames:true,
  external:['react','react-dom','react/jsx-runtime','@deepseek-ai/*'],
  banner:{js:'window.__ModuleLoader__.load({id:"dsh-intelligent-ui",factory:(require)=>{var module={exports:{}};var exports=module.exports;'},
  footer:{js:'return module.exports;}});'},
  plugins:[{name:'css-string',setup(b){b.onLoad({filter:/\.css$/},async args=>({contents:`export default ${JSON.stringify(await readFile(args.path,'utf8'))}`,loader:'js'}));}}],
});
await writeFile(new URL('../release-manifest.json',import.meta.url),JSON.stringify({package:pkg.name,version:pkg.version,hostVersion,cordisVersion:pins.cordis,schemasteryVersion:pins.schema,protocolVersion,componentsVersion,license:'MIT'},null,2)+'\n');
