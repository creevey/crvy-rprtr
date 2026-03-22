import { test as base, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { basename } from 'path';

/**
 * Extends the base test with a fixture that attaches baseline snapshot files
 * as actual screenshots for passing toHaveScreenshot tests. Playwright only
 * attaches images on failure; this fills the gap for the first passing run
 * after a failure (and any subsequent runs) so the reporter can display them.
 *
 * Works by intercepting testInfo.snapshotPath — the method toHaveScreenshot
 * calls internally to resolve the baseline file path — and collecting the
 * accessed paths. After the test completes successfully, each resolved
 * baseline file is attached as `{name}-actual.png`.
 */
export const test = base.extend<{ _screenshotCapture: void }>({
  // eslint-disable-next-line no-empty-pattern
  _screenshotCapture: [async ({}, use, testInfo) => {
    const accessedSnapshots: string[] = [];
    const original = testInfo.snapshotPath.bind(testInfo);

    // @ts-expect-error — patching a readonly method to intercept calls
    testInfo.snapshotPath = (...args: string[]): string => {
      const p = original(...args);
      if (!accessedSnapshots.includes(p)) accessedSnapshots.push(p);
      return p;
    };

    await use();

    if (testInfo.status !== 'passed') return;

    const projectName = testInfo.project.name;
    const platform = process.platform;
    const suffix = `-${projectName}-${platform}.png`;

    for (const snapshotPath of accessedSnapshots) {
      if (!existsSync(snapshotPath)) continue;
      const file = basename(snapshotPath);
      if (!file.endsWith(suffix)) continue;
      const baseName = file.slice(0, -suffix.length);
      await testInfo.attach(`${baseName}-actual.png`, {
        path: snapshotPath,
        contentType: 'image/png',
      });
    }
  }, { auto: true }],
});

export { expect };
