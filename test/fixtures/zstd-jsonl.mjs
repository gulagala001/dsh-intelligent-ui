import { zstdDecompressSync } from 'node:zlib';

// Test-only complete-frame reader. Follows the native persistence backend's
// Zstandard header/block framing; no dependency on an external source checkout.
export function decodeZstdJSONL(bytes) {
  if(bytes.length>32*1024*1024)throw Error('Fixture persisted log exceeds decoder limit');
  let offset=0;const frames=[];
  const take=count=>{if(offset+count>bytes.length)throw Error('Incomplete native persisted Zstandard frame');const start=offset;offset+=count;return start;};
  while(offset<bytes.length){
    const start=offset;
    if(bytes.readUInt32LE(take(4))!==0xfd2fb528)throw Error('Invalid native persisted Zstandard frame magic');
    const descriptor=bytes[take(1)];if(descriptor&0x18)throw Error('Reserved native persisted Zstandard header bits');
    const single=Boolean(descriptor&0x20),sizeFlag=descriptor>>>6,dictFlag=descriptor&3;
    take((single?0:1)+(dictFlag===3?4:dictFlag)+(sizeFlag===0?(single?1:0):1<<sizeFlag));
    for(;;){
      const block=bytes.readUIntLE(take(3),3),kind=(block>>>1)&3;
      if(kind===3)throw Error('Reserved native persisted Zstandard block type');
      take(kind===1?1:block>>>3);if(block&1)break;
    }
    if(descriptor&4)take(4);
    frames.push({start,end:offset});if(frames.length>4096)throw Error('Fixture persisted log exceeds frame limit');
  }
  if(!frames.length)throw Error('Empty native persisted Zstandard log');
  const chunks=[];let total=0;
  for(const frame of frames){
    const remaining=32*1024*1024-total;if(remaining<=0)throw Error('Fixture decoded log exceeds size limit');
    const chunk=zstdDecompressSync(bytes.subarray(frame.start,frame.end),{maxOutputLength:Math.min(16*1024*1024,remaining)});
    total+=chunk.length;if(total>32*1024*1024)throw Error('Fixture decoded log exceeds size limit');chunks.push(chunk);
  }
  return {text:Buffer.concat(chunks).toString('utf8'),frames:frames.length};
}
