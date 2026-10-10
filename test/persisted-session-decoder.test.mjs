import test from 'node:test';
import assert from 'node:assert/strict';
import { zstdCompressSync, constants } from 'node:zlib';
import { decodeZstdJSONL } from './fixtures/zstd-jsonl.mjs';

test('fixture durable Session decoder reads later independent frames and refuses torn/corrupt evidence',()=>{
  const rows=[{kind:'header',version:4},{type:'assistant/message',partial:'独立首批 PARTIAL_ACCEPTED'},{type:'assistant/message',text:'CONTINUED_ACCEPTED 最后批'}];
  const frames=rows.map(row=>zstdCompressSync(JSON.stringify(row)+'\n',{params:{[constants.ZSTD_c_checksumFlag]:1}}));
  const bytes=Buffer.concat(frames),decoded=decodeZstdJSONL(bytes);
  assert.equal(decoded.frames,3);assert.deepEqual(decoded.text.trim().split('\n').map(JSON.parse),rows);
  assert.ok(decoded.text.includes('PARTIAL_ACCEPTED'));assert.ok(decoded.text.includes('CONTINUED_ACCEPTED'));
  assert.throws(()=>decodeZstdJSONL(bytes.subarray(0,bytes.length-1)),/Incomplete/);
  const badMagic=Buffer.from(bytes);badMagic[frames[0].length]=0;assert.throws(()=>decodeZstdJSONL(badMagic),/magic/);
  const badChecksum=Buffer.from(bytes);badChecksum[badChecksum.length-1]^=1;assert.throws(()=>decodeZstdJSONL(badChecksum));
});
