import { expect as baseExpect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

const SCREENSHOTS_DIR = "./screenshots";

interface ScreenshotOptions {
  timeout?: number;
  animations?: "disabled" | "allowed";
  caret?: "hide" | "initial";
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
  threshold?: number;
}

type ScreenshotReceiver = Page | Locator;

async function saveScreenshot(receiver: ScreenshotReceiver, name: string): Promise<void> {
  const screenshot = await receiver.screenshot();
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const screenshotPath = join(SCREENSHOTS_DIR, name);
  await mkdir(dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, screenshot);
  console.log(`[Creevey] Saved screenshot: ${screenshotPath}`);
}

export const expect = baseExpect.extend({
  async toHaveScreenshot(receiver: ScreenshotReceiver, name: string, options?: ScreenshotOptions) {
    await saveScreenshot(receiver, name);
    
    try {
      const expectation = this.isNot ? baseExpect(receiver).not : baseExpect(receiver);
      await (expectation as any).toHaveScreenshot(name, options);
      return { pass: true, message: () => "" };
    } catch (e: any) {
      throw {
        matcherResult: e.matcherResult,
      };
    }
  },
});

export { test } from "@playwright/test";