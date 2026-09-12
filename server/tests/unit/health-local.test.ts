import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

describe('health report without PostgreSQL', () => {
  it('reports healthy browser-local mode when DATABASE_URL is absent', () => {
    const result = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        '-e',
        `import { initializeAuthStore } from './server/db/auth.js';
         import { getHealthReport } from './server/services/health.js';
         await initializeAuthStore();
         const report = await getHealthReport();
         console.log(JSON.stringify({
           ok: report.ok,
           productionMode: report.productionMode,
           configured: report.postgresql.configured,
           reachable: report.postgresql.reachable,
           browserLocalModeActive: report.production.browserLocalModeActive,
           authMode: report.authentication.mode,
         }));`,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: '' },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim().split('\n').pop()!);
    assert.equal(payload.ok, true);
    assert.equal(payload.productionMode, 'browser_local');
    assert.equal(payload.configured, false);
    assert.equal(payload.reachable, null);
    assert.equal(payload.browserLocalModeActive, true);
    assert.equal(payload.authMode, 'sqlite_local');
  });
});
