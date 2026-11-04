export const hostVersions = Object.freeze({
  "0.2.2-rc.1": {"cordis":"4.1.0","schema":"3.19.0","personaCwd":false,"framework":{"@deepseek-ai/cordis":"4.1.0","@deepseek-ai/schemastery":"3.19.0","@deepseek-ai/cosmokit":"1.9.0","@deepseek-ai/cordis-plugin-group":"1.1.0","@deepseek-ai/cordis-plugin-hmr":"1.1.0","@deepseek-ai/cordis-plugin-include":"1.1.0","@deepseek-ai/cordis-plugin-loader":"1.1.0","@deepseek-ai/cordis-plugin-logger-console":"1.1.0","@deepseek-ai/cordis-plugin-timer":"1.2.0"}},
  "0.2.2-alpha.3": {"cordis":"4.0.6-alpha.2","schema":"3.18.6-alpha.2","personaCwd":false,"framework":{"@deepseek-ai/cordis":"4.0.6-alpha.2","@deepseek-ai/schemastery":"3.18.6-alpha.2","@deepseek-ai/cosmokit":"1.8.7-alpha.2","@deepseek-ai/cordis-plugin-group":"1.0.6-alpha.2","@deepseek-ai/cordis-plugin-hmr":"1.0.21-alpha.2","@deepseek-ai/cordis-plugin-include":"1.0.11-alpha.2","@deepseek-ai/cordis-plugin-loader":"1.0.7-alpha.2","@deepseek-ai/cordis-plugin-logger-console":"1.0.6-alpha.2","@deepseek-ai/cordis-plugin-timer":"1.1.8-alpha.2"}},
  "0.2.2-alpha.2": {"cordis": "4.0.6-alpha.1", "schema": "3.18.6-alpha.1", "personaCwd": false, "framework": {"@deepseek-ai/cordis-plugin-logger-console": "1.0.6-alpha.1", "@deepseek-ai/cordis-plugin-group": "1.0.6-alpha.1", "@deepseek-ai/cordis-plugin-hmr": "1.0.21-alpha.1", "@deepseek-ai/cordis-plugin-include": "1.0.11-alpha.1", "@deepseek-ai/cosmokit": "1.8.7-alpha.1", "@deepseek-ai/cordis-plugin-timer": "1.1.8-alpha.1", "@deepseek-ai/cordis-plugin-loader": "1.0.7-alpha.1", "@deepseek-ai/cordis": "4.0.6-alpha.1", "@deepseek-ai/schemastery": "3.18.6-alpha.1"}},
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
    ...pins.framework,
  } };
}
