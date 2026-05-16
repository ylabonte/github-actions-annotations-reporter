import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../../src/core/config.js';

describe('loadConfig', () => {
  it('returns defaults when no config file is found', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ghaar-config-'));
    try {
      const cfg = await loadConfig({ cwd: tmp });
      expect(cfg.minSeverity).toBe('notice');
      expect(cfg.autoClose.enabled).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('reads a JSON config file', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ghaar-config-'));
    try {
      await fs.writeFile(
        path.join(tmp, '.ghaarrc.json'),
        JSON.stringify({ minSeverity: 'error', autoClose: { afterDays: 30 } }),
      );
      const cfg = await loadConfig({ cwd: tmp });
      expect(cfg.minSeverity).toBe('error');
      expect(cfg.autoClose.afterDays).toBe(30);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
