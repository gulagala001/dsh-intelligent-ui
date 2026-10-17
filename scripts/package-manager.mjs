import { accessSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, delimiter, isAbsolute } from 'node:path';

export function packageManager() {
  const entry = process.env.IUI_PNPM_ENTRY ?? process.env.npm_execpath;
  if (!entry || !isAbsolute(entry) || !/pnpm(?:\.[cm]?js)?$/i.test(entry)) {
    throw Error('Set IUI_PNPM_ENTRY to the bundled pnpm script, or invoke this script through pnpm.');
  }
  accessSync(entry, constants.R_OK);
  return (args, options = {}) => execFileSync(process.execPath, [entry, ...args], {
    timeout: 300000, maxBuffer: 32 * 1024 * 1024, ...options,
    env: { ...process.env, ...options.env, IUI_PNPM_ENTRY: entry,
      PATH: dirname(process.execPath) + delimiter + (options.env?.PATH ?? process.env.PATH ?? '') },
  });
}
