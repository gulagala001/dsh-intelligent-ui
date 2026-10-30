import { applySessionTimeZone } from './session-time-zone.mjs';
import React, { useEffect } from 'react';
import { Button, IconNewChatOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { IntelligentSurface } from './Surface.jsx';
import { disposeDocuments } from './document-store.mjs';
import surfaceStyles from './styles/surface.css';
import { createAssistantAdapter } from './host/assistant.jsx';
import { IntelligentEntrance, entranceStyles } from './host/entrance.jsx';
import { installArtifactPane } from './host/pane.jsx';
import { createSessionBridge } from './host/session.mjs';
import { decorateAssistantSlot } from './host/slots.mjs';

export const inject = ['slots', 'sessions', 'workspaces', 'uiSession', 'uiWorkspace', 'layout',
  'sidebarRightTabs', 'sidebarRight', 'fileUpload', 'remote', 'remote.session', 'remote.agentPresets'];

export function apply(ctx) {
  ctx.inject(['remote.session', 'remote.subagents'], scope => applySessionTimeZone(scope));
  const bridge = createSessionBridge(ctx);
  ctx.effect(() => () => { bridge.dispose(); disposeDocuments(); }, 'intelligent-ui: native Session bridge');
  const pane = installArtifactPane(ctx, { Surface: IntelligentSurface, bridge, Button });
  function InlineSurface(props) {
    const { source, streaming, sessionId, blockId } = props;
    useEffect(() => { pane.update({ source, streaming, sessionId, blockId }); }, [source, streaming, sessionId, blockId]);
    return <IntelligentSurface {...props} />;
  }
  ctx.effect(() => () => pane.dispose(), 'intelligent-ui: artifact tab');
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'dsh-intelligent-ui/entrance';
    style.textContent = surfaceStyles + entranceStyles + '.iui-artifact-pane{padding:16px;min-width:0}.iui-artifact-placeholder{padding:20px;font-size:14px;color:var(--dsw-alias-label-secondary)}';
    document.head.append(style); return () => style.remove();
  }, 'intelligent-ui: local entrance styles');
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay',
    id: 'dsh-intelligent-ui/entrance', order: 30 }, () => <IntelligentEntrance bridge={bridge} Button={Button} ChatIcon={IconNewChatOutlineRegular} />));
  ctx.slots.inject('conversation.chat.node', () => decorateAssistantSlot(ctx.slots, Native =>
    createAssistantAdapter(Native, { Surface: InlineSurface, bridge, MarkdownText,
      onUnsupported: info => console.warn('[intelligent-ui] Unsupported native presentation', info),
      expand: item => pane.expand(item) })));
}
