import React, { memo } from 'react';

export const primitives = {
  MarkdownText: memo(function MarkdownText({ text, streaming, fileMentions, pathImages, variant }) {
    return <div className="native-markdown" data-native-streaming={streaming || undefined}
      data-mentions={fileMentions ? 'present' : undefined} data-path-images={pathImages ? 'present' : undefined}
      data-variant={variant}>{text}</div>;
  }),
  JsonBlock: ({ payload }) => <pre data-native-unknown>{JSON.stringify(payload)}</pre>,
  TextShimmer: ({ children }) => <span>{children}</span>,
  IconThinkOutlineRegular: () => <span aria-hidden="true">◌</span>,
  DisclosureRow: ({ title, open, onToggle, collapsedContent, children }) => <>
    <button type="button" className="native-reasoning-toggle" aria-expanded={open} onClick={onToggle}>{title}</button>
    {open ? children : collapsedContent}
  </>,
};
