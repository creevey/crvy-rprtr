import type { TestStep } from '@playwright/test/reporter'

export function extractScreenshotNames(steps: TestStep[]): string[] {
  const names: string[] = []
  for (const step of steps) {
    const match = step.title.match(/toHaveScreenshot\((.+?)\)/)
    if (match?.[1] !== undefined && match[1] !== '') names.push(match[1])
    if (step.steps.length) names.push(...extractScreenshotNames(step.steps))
  }
  return names
}
