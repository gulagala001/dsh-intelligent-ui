import React from 'react';
import { Button, Checklist, Counter, Form, InputControl, Tabs } from './controls.jsx';
import { Chart, Table } from './data.jsx';
import { Calculator, Diagram, Game, Scene, Simulation } from './interactive.jsx';
import { display, ErrorMessage } from './shared.jsx';

function ImageContent({ props: p }) {
  const [failedSource, setFailedSource] = React.useState(null);
  const failed = failedSource === p.src;
  return <figure className="iui-image"><img src={p.src} alt={p.alt} hidden={failed} loading="lazy" referrerPolicy="no-referrer" className={`iui-image-${p.aspect || 'auto'}`} onError={() => setFailedSource(p.src)} />{failed && <span className="iui-image-fallback">图片暂时无法显示 · {p.alt}</span>}{p.caption && <figcaption>{p.caption}</figcaption>}</figure>;
}

const implementations = {
  Stack: ({ props: p, children }) => <div className={`iui-stack iui-gap-${p.gap || 'md'}`}>{children}</div>,
  Row: ({ props: p, children }) => <div className={`iui-row iui-gap-${p.gap || 'md'} iui-align-${p.align || 'center'}`}>{children}</div>,
  Grid: ({ props: p, children }) => <div className={`iui-grid iui-gap-${p.gap || 'md'}`} style={{ '--iui-columns': p.columns || 2 }}>{children}</div>,
  Card: ({ props: p, children }) => <section className={`iui-card iui-card-${p.variant || 'default'}`}>{p.title && <h3 className="iui-card-title">{p.title}</h3>}{p.description && <p className="iui-muted iui-card-description">{p.description}</p>}<div className="iui-card-content">{children}</div></section>,
  Text: ({ props: p }) => <p className={`iui-text iui-text-${p.size || 'md'} iui-tone-${p.tone || 'neutral'}`}>{p.text}</p>,
  Heading: ({ props: p }) => React.createElement(`h${p.level || 2}`, { className: 'iui-heading' }, p.text),
  Divider: () => <hr className="iui-divider" />,
  Image: ImageContent,
  Badge: ({ props: p }) => <span className={`iui-badge iui-tone-${p.tone || 'neutral'}`}>{p.text}</span>,
  Metric: ({ props: p }) => <div className={`iui-metric iui-tone-${p.tone || 'neutral'}`}><span className="iui-muted">{p.label}</span><div className="iui-metric-value">{display(p.value)}{p.unit && <span className="iui-metric-unit">{p.unit}</span>}</div>{p.detail && <span className="iui-hint">{p.detail}</span>}</div>,
  Facts: ({ props: p }) => <section className="iui-facts">{p.title && <h3>{p.title}</h3>}<dl>{p.items.map((item, index) => <div key={index}><dt>{item.label}{item.detail && <span className="iui-hint">{item.detail}</span>}</dt><dd>{display(item.value)}{item.unit && <span> {item.unit}</span>}</dd></div>)}</dl></section>,
  Table, Chart, Button, Counter, Checklist, Form, Tabs, Calculator, Diagram, Scene, Simulation, Game,
  Input: attributes => <InputControl {...attributes} kind="text" />,
  NumberInput: attributes => <InputControl {...attributes} kind="number" />,
  Select: attributes => <InputControl {...attributes} kind="select" />,
  Slider: attributes => <InputControl {...attributes} kind="slider" />,
  Checkbox: attributes => <InputControl {...attributes} kind="checkbox" />,
};

export function renderComponent(name, props = {}, children = [], api = {}) {
  const Component = implementations[name];
  if (!Component) return <ErrorMessage>无法显示组件：{name}</ErrorMessage>;
  return <Component props={props} api={api}>{children}</Component>;
}

export const componentNames = Object.freeze(Object.keys(implementations));
