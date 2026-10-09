import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantNodeView as Alpha, AssistantMarkdown as AlphaMarkdown } from './native-alpha1.jsx';
import { AssistantNodeView as Alpha2, AssistantMarkdown as Alpha2Markdown } from './native-alpha2.jsx';
import { AssistantNodeView as RC2, AssistantMarkdown as RC2Markdown } from './native-rc2.jsx';
import { primitives } from './native-support.jsx';
import { createAssistantAdapter } from '../../../src/client/host/assistant.jsx';
import { IntelligentEntrance, entranceStyles } from '../../../src/client/host/entrance.jsx';
import { installArtifactPane } from '../../../src/client/host/pane.jsx';

window.submissions = []; window.expands = []; window.images = []; window.originalClicks = 0;
window.adapterDiagnostics = []; window.reasoningSlotCalls = [];
if (window.minifyNativeNames) [Alpha.type, AlphaMarkdown.type, Alpha2.type, Alpha2Markdown.type, RC2.type, RC2Markdown.type, primitives.MarkdownText.type]
  .forEach((component, index) => Object.defineProperty(component, 'name', { value: `_${index}`, configurable: true }));
function Surface({ source, streaming, sessionId, blockId, onSubmit, onExpand }) {
  return <section className="iui-surface" data-source={source} data-session={sessionId}
    data-block={blockId} data-streaming={String(streaming)}>
    <p>{source}</p><button disabled={streaming} onClick={() => onSubmit('submitted fields')}>提交交互</button>
    <button onClick={onExpand}>展开作品</button>
  </section>;
}
const bridge = { submit: async (...args) => { window.submissions.push(args); } };
const nativeOptions = { Surface, bridge, MarkdownText: primitives.MarkdownText,
  onUnsupported: metadata => window.adapterDiagnostics.push(metadata), expand: item => window.expands.push(item) };
const adapters = { alpha1: createAssistantAdapter(Alpha, nativeOptions), alpha2: createAssistantAdapter(Alpha2, nativeOptions), rc2: createAssistantAdapter(RC2, nativeOptions) };
const initial = { text: 'ordinary response', status: 'running', groupPart: undefined, processOpen: true, preview: true };
function useDisclosure() { const [expanded, setExpanded] = useState(false); return { expanded, setExpanded, toggle: () => setExpanded(value => !value) }; }
function useGroupAction(hidden, reveal) {
  const ref = useRef(null);
  useLayoutEffect(() => { if (hidden) ref.current?.setAttribute('hidden', 'until-found'); else ref.current?.removeAttribute('hidden'); }, [hidden]);
  useEffect(() => { const element = ref.current; element?.addEventListener('beforematch', reveal); return () => element?.removeEventListener('beforematch', reveal); }, [reveal]);
  return ref;
}
function renderSlot(name, props) {
  window.reasoningSlotCalls.push({ name, ...props });
  return <primitives.MarkdownText text={props.text} streaming={props.running} variant="compact" />;
}
function App() {
  const [state, setState] = useState(initial);
  window.updateResponse = patch => setState(value => ({ ...value, ...patch }));
  const Native = adapters[window.hostVersion ?? 'alpha1'];
  const finalNode = state.status === 'settled' ? { seq: 13 } : undefined;
  const node = { location: { kind: 'step', turn: { status: state.status === 'settled' ? 'closed' : 'open' } },
    data: { turn: 4, step: 2, status: state.status, finalNode,
      blocks: [{ kind: 'reasoning', text: 'Reasoning must retain native disclosure\n\n```openui\nroot = Text("never render reasoning")\n```' },
        { kind: 'tool-call', callId: 'native-tool', name: 'read' }, { kind: 'text', text: state.text },
        { kind: 'image', attachment: { id: 'image1' } }, { kind: 'image', attachment: { id: 'image2' } },
        { kind: 'unknown', block: { keep: 'native unknown' } }] } };
  return <Native node={node} sessionId="session-alpha" groupPart={state.groupPart}
    useTurnData={() => ({ closing: { finalNode: { seq: 13 } } })} useDisclosure={useDisclosure} useGroupAction={useGroupAction} renderSlot={renderSlot}
    usePresentation={selector => selector({ settledReasoningPreview: state.preview })}
    turnProcess={{ foldable: true, spec: { answerStep: 2, inlineReasoning: true }, open: state.processOpen,
      setOpen: processOpen => setState(value => ({ ...value, processOpen })) }}
    openFile={() => {}} fileMentions={() => ({ resolve: () => '/native-file' })}
    renderMessageImages={props => <div data-native-images>{props.images.map(item => item.attachment.id).join(',')}</div>}
    t={key => key === 'message.think' ? '思考' : key === 'message.stopped' ? '已停止' : key} />;
}
const root = createRoot(document.getElementById('root'));
root.render(<App />);
window.unmountResponse = () => root.unmount();

const entranceRoot = createRoot(document.getElementById('entrance'));
const listeners = new Set();
let entranceState = { busy: false, error: null };
let createCalls = 0;
window.entranceCreationCount = () => createCalls;
const entranceBridge = { subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => entranceState,
  create: () => { createCalls++; return Promise.resolve('smart-session'); } };
window.mountEntrance = () => { const style = document.createElement('style'); style.textContent = entranceStyles;
  style.id = 'entrance-style'; document.head.append(style); entranceRoot.render(<IntelligentEntrance bridge={entranceBridge} />); };
window.setEntranceBusy = value => { entranceState = { busy: value, error: null }; for (const listener of listeners) listener(); };
window.unmountEntrance = () => { entranceRoot.unmount(); document.getElementById('entrance-style')?.remove(); };

window.artifactOpens = []; window.artifactDisposals = []; window.artifactSelected = 'session-alpha';
window.mountArtifact = () => {
  let Body, publishNavigation;
  const signal = new AbortController();
  const ctx = {
    uiSession: { adapter: { current: { getSnapshot: () => ({ key: window.artifactSelected }) } } },
    sidebarRightTabs: { register: definition => { window.artifactDefinition = definition; return () => window.artifactDisposals.push('type'); } },
    slots: { inject: (_, callback) => callback(), register: (options, Component) => {
      window.artifactSlot = options; Body = Component; return () => window.artifactDisposals.push('body'); } },
    sidebarRight: { openTab: (kind, options) => { window.artifactOpens.push({ kind, options }); publishNavigation(options.params); } },
  };
  const pane = installArtifactPane(ctx, { Surface, bridge });
  window.expandArtifact = item => pane.expand(item); window.updateArtifact = item => pane.update(item);
  function ArtifactHarness() {
    const [params, setParams] = useState({}); publishNavigation = setParams;
    return <Body sessionId="session-alpha" useTabInfo={() => ({ tab: { signal: signal.signal,
      navigation: { params } } })} />;
  }
  const artifactRoot = createRoot(document.getElementById('artifact')); artifactRoot.render(<ArtifactHarness />);
  window.unmountArtifact = () => { artifactRoot.unmount(); pane.dispose(); signal.abort(); };
};
