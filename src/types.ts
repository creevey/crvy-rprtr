export interface Images {
  actual: string;
  expect?: string;
  diff?: string;
  error?: string;
}

export type TestStatus =
  | "unknown"
  | "pending"
  | "running"
  | "failed"
  | "approved"
  | "success"
  | "retrying";

export interface TestResult {
  status: "failed" | "success";
  retries: number;
  images?: Partial<Record<string, Images>>;
  error?: string;
  duration?: number;
}

export interface TestData {
  id: string;
  storyPath: string[];
  browser: string;
  testName?: string;
  storyId: string;
  skip?: boolean | string;
  retries?: number;
  status?: TestStatus;
  results?: TestResult[];
  approved?: Partial<Record<string, number>> | null;
}

export interface CreeveyTest extends TestData {
  checked: boolean;
}

export interface CreeveySuite {
  path: string[];
  skip: boolean;
  status?: TestStatus;
  opened: boolean;
  checked: boolean;
  indeterminate: boolean;
  children: Partial<Record<string, CreeveySuite | CreeveyTest>>;
}

export type ImagesViewMode = "side-by-side" | "swap" | "slide" | "blend";

export interface CreeveyStatus {
  isRunning: boolean;
  tests: Partial<Record<string, TestData>>;
  browsers: string[];
  isUpdateMode: boolean;
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isTest(x: unknown): x is CreeveyTest {
  return (
    x !== null &&
    typeof x === "object" &&
    "id" in x &&
    "storyId" in x &&
    typeof (x as CreeveyTest).id === "string" &&
    typeof (x as CreeveyTest).storyId === "string"
  );
}

export interface CreeveyViewFilter {
  status: TestStatus | null;
  subStrings: string[];
}
