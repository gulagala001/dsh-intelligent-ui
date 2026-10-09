import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StateStorage } from './host/storage.mjs';
import { createApiHandler } from './host/service.mjs';
import { installSkill } from './host/skill.mjs';

export const name = 'intelligent-ui';
export const inject = ['sessions', 'sessionPersistence', 'skills'];

export async function apply(ctx, config = {}) {
  const homeProvider = ctx.get('dshHomePath');
  const home = typeof homeProvider === 'function' ? homeProvider() : homeProvider;
  if (!home && !config.dataDir) throw new Error('intelligent-ui requires the native host data directory');
  const storage = new StateStorage(config.dataDir ?? join(home, 'intelligent-ui', 'state'));
  await storage.initialize();
  ctx.effect(() => () => storage.close(), 'intelligent-ui.storage');
  installSkill(ctx);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const sdkVersion = manifest.devDependencies['@deepseek-ai/dsh'];
  let hostVersion = null;
  const resolver = ctx.get('loader')?.internal;
  if (resolver && ctx.baseUrl) {
    try {
      const request = { specifier: '@deepseek-ai/dsh/package.json', attributes: {} };
      const resolved = resolver.version === 'v2' ? resolver.resolveSync(ctx.baseUrl, request) : resolver.resolveSync(request.specifier, ctx.baseUrl, {});
      const installed = JSON.parse(await readFile(new URL(resolved.url), 'utf8'));
      if (installed.name === '@deepseek-ai/dsh' && typeof installed.version === 'string') hostVersion = installed.version;
    } catch { /* A desktop or embedded host may not install the CLI manifest. */ }
  }
  ctx.inject(['webServer', 'connection'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: '/intelligent-ui/api', handler: createApiHandler(web, storage, { version: manifest.version, hostVersion, sdkVersion }) }), 'intelligent-ui.api');
  });
}
