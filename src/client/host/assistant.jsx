import React, { cloneElement, isValidElement, memo } from 'react';
import { splitResponse } from '../../protocol/split.mjs';

const MEMO = Symbol.for('react.memo');
const unwrap = component => component?.$$typeof === MEMO ? component.type : component;

/** Only traverse already-produced elements. Never execute arbitrary child components. */
export function mapPresentation(element, replace) {
  if (Array.isArray(element)) return element.map(child => mapPresentation(child, replace));
  if (!isValidElement(element)) return element;
  const replacement = replace(element);
  if (replacement !== element) return replacement;
  const children = element.props.children;
  if (children === undefined) return element;
  const next = mapPresentation(children, replace);
  if (next === children) return element;
  return cloneElement(element, undefined, next);
}

/** Fixed Host render chain: AssistantNodeView → AssistantMarkdown → MarkdownText. */
export function createAssistantAdapter(Native, { Surface, bridge, expand, MarkdownText, onUnsupported }) {
  const renderNative = unwrap(Native);
  if (typeof renderNative !== 'function') return Native;
  let markdownType;
  const reported = new Set();
  const unsupported = (stage, props, element) => {
    if (reported.has(stage) || !props.node?.data?.blocks?.some(block => block.kind === 'text' && /(?:openui|intelligent-ui)/.test(block.text))) return;
    reported.add(stage);
    onUnsupported?.({ stage, nativeName: renderNative.name, markdownName: unwrap(element?.type)?.name,
      sessionIdType: typeof props.sessionId, propKeys: Object.keys(props), dataKeys: Object.keys(props.node.data) });
  };
  function NativeMarkdownAdapter({ nativeProps, identity }) {
    // Always call this exact native function, including plain-text updates.
    const tree = unwrap(markdownType)(nativeProps);
    if (nativeProps.groupPart === 'reasoning') return tree;
    const blocks = nativeProps.blocks;
    let uiCount = 0;
    const leaves = [];
    const presentation = mapPresentation(tree, element => {
      if (typeof element.props.text === 'string') leaves.push({ name: unwrap(element.type)?.name,
        exactMarkdown: element.type === MarkdownText, key: element.key, props: Object.keys(element.props) });
      if (element.type !== MarkdownText || typeof element.props.text !== 'string'
        || !Object.hasOwn(element.props, 'fileMentions') || !Object.hasOwn(element.props, 'pathImages')) return element;
      const index = Number(element.key);
      if (!Number.isSafeInteger(index) || blocks[index]?.kind !== 'text' || blocks[index].text !== element.props.text) return element;
      const segments = splitResponse(element.props.text, { streaming: nativeProps.streaming });
      if (!segments.some(part => part.kind === 'ui')) return element;
      uiCount++;
      return <React.Fragment key={element.key}>{segments.map((part, ordinal) => {
        if (part.kind === 'text') return cloneElement(element, { key: `text:${ordinal}`, text: part.text });
        const blockId = `${identity.turn}:${identity.step}:${index}:${part.ordinal}`;
        const item = { source: part.text, streaming: nativeProps.streaming,
          sessionId: identity.sessionId, blockId };
        return <Surface key={`ui:${part.ordinal}`} {...item}
          onSubmit={text => bridge.submit(identity.sessionId, blockId, text)}
          onExpand={() => expand(item)} />;
      })}</React.Fragment>;
    });
    if (!uiCount && !reported.has('markdown-text') && blocks.some(block => block.kind === 'text'
      && splitResponse(block.text, { streaming: nativeProps.streaming }).some(part => part.kind === 'ui'))) {
      reported.add('markdown-text');
      onUnsupported?.({ stage: 'markdown-text', markdownTextName: unwrap(MarkdownText)?.name, leaves });
    }
    return presentation;
  }
  function AssistantAdapter(props) {
    // Native hooks remain in fixed order throughout streaming and pure-text transitions.
    const rendered = renderNative(props);
    if (!isValidElement(rendered) || !Array.isArray(rendered.props.blocks)
      || rendered.props.blocks !== props.node.data.blocks
      || rendered.props.groupPart !== props.groupPart
      || rendered.props.useDisclosure !== props.useDisclosure
      || rendered.props.usePresentation !== props.usePresentation
      || rendered.props.renderMessageImages !== props.renderMessageImages
      || rendered.props.streaming !== (props.node.data.status === 'running')
      || rendered.props.interrupted !== (props.node.data.status === 'interrupted')) {
      unsupported('assistant-presentation', props, rendered); return rendered;
    }
    if (markdownType === undefined) markdownType = rendered.type;
    if (rendered.type !== markdownType || typeof unwrap(markdownType) !== 'function') {
      unsupported('markdown-presentation', props, rendered); return rendered;
    }
    const data = props.node.data;
    if (!Number.isSafeInteger(data.turn) || data.turn < 0 || !Number.isSafeInteger(data.step) || data.step < 0 || typeof props.sessionId !== 'string') {
      unsupported('session-identity', props, rendered); return rendered;
    }
    return <NativeMarkdownAdapter nativeProps={rendered.props}
      identity={{ sessionId: props.sessionId, turn: data.turn, step: data.step }} />;
  }
  return memo(AssistantAdapter);
}
