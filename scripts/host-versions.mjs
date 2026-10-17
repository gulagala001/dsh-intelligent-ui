export const hostVersions = Object.freeze({
  '0.2.0-rc.2': { cordis: '4.0.4', schema: '3.18.4', personaCwd: true },
  '0.2.1-alpha.1': { cordis: '4.0.5-alpha.1', schema: '3.18.5-alpha.1', personaCwd: true },
  '0.2.1-alpha.2': { cordis: '4.0.5-alpha.1', schema: '3.18.5-alpha.1', personaCwd: false },
  '0.2.1-alpha.3': { cordis: '4.0.5-alpha.2', schema: '3.18.5-alpha.2', personaCwd: false },
  '0.2.1-rc.1': { cordis: '4.0.5', schema: '3.18.5', personaCwd: false },
  '0.2.1-rc.2': { cordis: '4.0.5', schema: '3.18.5', personaCwd: false },
});

export function hostPins(host) {
  const pins = hostVersions[host];
  if (!pins) throw Error(`Choose a pinned full DSH version: ${Object.keys(hostVersions).join(', ')}`);
  const modern = host !== '0.2.0-rc.2', suffix = host.startsWith('0.2.1-rc.') ? '' : host === '0.2.1-alpha.3' ? '-alpha.2' : '-alpha.1';
  const version = (stable, current) => modern ? current + suffix : stable;
  return { ...pins, framework: {
    '@deepseek-ai/cordis': pins.cordis,
    '@deepseek-ai/schemastery': pins.schema,
    '@deepseek-ai/cosmokit': version('1.8.5', '1.8.6'),
    '@deepseek-ai/cordis-plugin-group': version('1.0.4', '1.0.5'),
    '@deepseek-ai/cordis-plugin-hmr': version('1.0.19', '1.0.20'),
    '@deepseek-ai/cordis-plugin-include': version('1.0.9', '1.0.10'),
    '@deepseek-ai/cordis-plugin-loader': version('1.0.5', '1.0.6'),
    '@deepseek-ai/cordis-plugin-logger-console': version('1.0.4', '1.0.5'),
    '@deepseek-ai/cordis-plugin-timer': version('1.1.6', '1.1.7'),
  } };
}
