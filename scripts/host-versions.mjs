export const hostVersions = Object.freeze({
  '0.2.1-rc.5': { cordis: '4.0.5', schema: '3.18.5', personaCwd: false },
  '0.2.1-rc.3': { cordis: '4.0.5', schema: '3.18.5', personaCwd: false },
  '0.2.1-rc.1': { cordis: '4.0.5', schema: '3.18.5', personaCwd: false },
  '0.2.1-rc.2': { cordis: '4.0.5', schema: '3.18.5', personaCwd: false },
});

export function hostPins(host) {
  const pins = hostVersions[host];
  if (!pins) throw Error(`Choose a pinned full DSH version: ${Object.keys(hostVersions).join(', ')}`);
  return { ...pins, framework: {
    '@deepseek-ai/cordis': pins.cordis,
    '@deepseek-ai/schemastery': pins.schema,
    '@deepseek-ai/cosmokit': '1.8.6',
    '@deepseek-ai/cordis-plugin-group': '1.0.5',
    '@deepseek-ai/cordis-plugin-hmr': '1.0.20',
    '@deepseek-ai/cordis-plugin-include': '1.0.10',
    '@deepseek-ai/cordis-plugin-loader': '1.0.6',
    '@deepseek-ai/cordis-plugin-logger-console': '1.0.5',
    '@deepseek-ai/cordis-plugin-timer': '1.1.7',
  } };
}
