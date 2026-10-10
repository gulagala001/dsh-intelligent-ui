import React, { useEffect, useId, useRef, useState } from 'react';

// View-local magnification only: the same SVG stays mounted, with its original
// coordinates and event handlers. No document or playback state is involved.
export function FigureViewport({ width, height, label, children }) {
  const viewport = useRef(null);
  const id = useId();
  const [narrow, setNarrow] = useState(false);
  const [original, setOriginal] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setNarrow(element.clientWidth > 0 && element.clientWidth + 1 < width);
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [width]);
  return <div className="iui-figure-viewport">
    <div className="iui-figure-scroll" ref={viewport} id={id} data-original={original}
      role={original ? 'region' : undefined}
      aria-label={original ? `${label || '图形'}，原尺寸，可滚动查看` : undefined}
      tabIndex={original ? 0 : undefined}>
      <div className="iui-figure-content" data-original={original} style={original ? { width, height } : undefined}>{children}</div>
    </div>
    {(narrow || original) && <div className="iui-figure-tools"><button type="button" className="iui-figure-toggle"
      aria-controls={id} aria-pressed={original}
      title={original ? '以自适应宽度查看图形' : '以原尺寸查看图形细节'}
      onClick={() => setOriginal(previous => !previous)}>{original ? '适应宽度' : '放大图形'}</button></div>}
  </div>;
}
