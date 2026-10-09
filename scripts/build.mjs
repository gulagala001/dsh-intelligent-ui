import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {writeReferences} from '../src/host/skill.mjs';
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
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
await writeFile(new URL('../release-manifest.json',import.meta.url),JSON.stringify({package:pkg.name,version:pkg.version,hostVersion:pkg.devDependencies['@deepseek-ai/dsh'],protocolVersion:1,componentsVersion:1,license:'MIT'},null,2)+'\n');
