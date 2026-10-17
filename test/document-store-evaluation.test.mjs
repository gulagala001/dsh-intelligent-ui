import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore } from '../src/client/document-store.mjs';

test('streaming defaults still reevaluate dependent components and explicit state wins', t => {
  const store = new DocumentStore('evaluation-defaults', 'test');
  t.after(() => store.dispose());
  store.update('root = Stack([Input("Name","name","Ada"),Text($name)])', true);
  assert.equal(store.snapshot.state.name, 'Ada');
  assert.equal(store.snapshot.tree.props.children[1].props.text, 'Ada');
  store.state = { name: 'Grace' };
  store.update(store.snapshot.source, true, { reload: true });
  assert.equal(store.snapshot.state.name, 'Grace');
  assert.equal(store.snapshot.tree.props.children[1].props.text, 'Grace');
});

test('streaming trees without new defaults stay complete and enforce the state budget', t => {
  const store = new DocumentStore('evaluation-static', 'test');
  t.after(() => store.dispose());
  store.update('root = Stack([Text("one"),Text("two")])', true);
  assert.equal(store.snapshot.tree.props.children.length, 2);
  assert.equal(store.snapshot.status, 'streaming');
  const previous = store.snapshot;
  store.update(previous.source, true);
  assert.equal(store.snapshot, previous);
  store.update('$value = "ok"; root = Text($value)', true);
  store.state = { ...store.state, oversized: 'x'.repeat(32001) };
  store.update(store.snapshot.source, true, { reload: true });
  assert.equal(store.snapshot.tree, null);
});
