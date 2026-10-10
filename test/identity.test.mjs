import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {identityDigest,collectionIdentities} from '../src/runtime/identity.mjs';import {budget} from '../src/runtime/limits.mjs';
test('compact identity digest matches independent SHA-256 across UTF-8 and block boundaries',()=>{
  for(const text of ['', 'abc', '中文与😀', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(128000)])assert.equal(identityDigest(text),createHash('sha256').update(text).digest('hex'));
});
test('collection identities keep unique typed IDs and canonical values stable under filtering and reordering',()=>{
  const identities=list=>collectionIdentities(list,budget());
  const original=identities([{id:'A',data:1},{id:'B',data:2}]);
  assert.deepEqual(identities([{id:'B',data:9},{id:'A',data:7}]),[original[1],original[0]]);
  assert.deepEqual(identities([{id:'B',data:3}]),[original[1]]);
  const values=identities([{x:1,y:2},{x:3,y:4}]);assert.deepEqual(identities([{y:4,x:3}]),[values[1]]);
  assert.notEqual(identities([{id:1},{id:'1'}])[0],identities([{id:1},{id:'1'}])[1]);
  const duplicate=identities([{id:'same',v:1},{id:'same',v:2}]);assert.notEqual(duplicate[0],duplicate[1]);
  const repeated=identities(['A','A','B']);assert.notEqual(repeated[0],repeated[1]);assert.deepEqual(identities(['B','A','A']),[repeated[2],repeated[0],repeated[1]]);
});
