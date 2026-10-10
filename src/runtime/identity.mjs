// Compact deterministic component identities. These keys do not grant access or
// authenticate content; source ownership is verified separately by the host.
const rounds = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
];
const rotate=(value,bits)=>(value>>>bits)|(value<<(32-bits));
export function identityDigest(text) {
  const input=new TextEncoder().encode(text),bytes=new Uint8Array(Math.ceil((input.length+9)/64)*64);
  bytes.set(input);bytes[input.length]=0x80;
  const data=new DataView(bytes.buffer),bitLength=input.length*8;
  data.setUint32(bytes.length-8,Math.floor(bitLength/4294967296));data.setUint32(bytes.length-4,bitLength>>>0);
  const hash=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],words=new Uint32Array(64);
  for(let offset=0;offset<bytes.length;offset+=64){
    for(let i=0;i<16;i++)words[i]=data.getUint32(offset+i*4);
    for(let i=16;i<64;i++){const a=words[i-15],b=words[i-2];words[i]=(words[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+words[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))>>>0;}
    let [a,b,c,d,e,f,g,h]=hash;
    for(let i=0;i<64;i++){
      const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+rounds[i]+words[i])>>>0;
      const second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;
    }
    for(const [i,value] of [a,b,c,d,e,f,g,h].entries())hash[i]=(hash[i]+value)>>>0;
  }
  return hash.map(value=>value.toString(16).padStart(8,'0')).join('');
}
const filteredSources=new WeakMap();
export function rememberFilteredCollection(result,source,positions){
  const origin=filteredSources.get(source);
  filteredSources.set(result,{source:origin?.source??source,positions:origin?positions.map(index=>origin.positions[index]):positions});
  return result;
}
function canonical(value,b,depth){
  b.step(depth);
  if(Array.isArray(value))return '['+value.map(item=>canonical(item,b,depth+1)).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],b,depth+1)).join(',')+'}';
  return JSON.stringify(value);
}
export function collectionIdentities(list,b,depth=0){
  const origin=filteredSources.get(list),source=origin?.source??list;
  const ids=source.map(item=>item&&typeof item==='object'&&!Array.isArray(item)&&Object.hasOwn(item,'id')&&['string','number','boolean'].includes(typeof item.id)?canonical(item.id,b,depth):null);
  const counts=new Map();for(const id of ids)if(id!==null)counts.set(id,(counts.get(id)||0)+1);
  const occurrences=new Map();
  const keys=source.map((item,index)=>{
    const explicit=ids[index]!==null&&counts.get(ids[index])===1;
    const text=explicit?ids[index]:canonical(item,b,depth);b.step(depth,Math.ceil(text.length/16));
    const digest=(explicit?'id:':'value:')+identityDigest(text),occurrence=occurrences.get(digest)||0;
    occurrences.set(digest,occurrence+1);return digest+':'+occurrence;
  });
  return origin?origin.positions.map(index=>keys[index]):keys;
}
