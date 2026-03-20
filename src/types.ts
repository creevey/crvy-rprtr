export interface Images {
  actual: string;
  expect?: string;
  diff?: string;
  error?: string;
}

export interface Attachment {
  name: string;
  path: string;
  contentType: string;
}

export interface Location {
  file: string;
  line: number;
}

export interface PlaywrightTestResult {
  id: string;
  title: string;
  location: Location;
  status: "passed" | "failed" | "skipped";
  attachments: Attachment[];
  error?: string;
  duration?: number;
}

export interface WebSocketMessage {
  type: "test-begin" | "test-end" | "run-end" | "approve" | "sync";
  data: unknown;
}

export interface TestBeginMessage {
  type: "test-begin";
  data: { id: string; title: string; location: Location };
}

export interface TestEndMessage {
  type: "test-end";
  data: PlaywrightTestResult;
}

export interface RunEndMessage {
  type: "run-end";
  data: { status: "passed" | "failed" | "skipped"; count: number };
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
  attachments?: Attachment[];
  title?: string;
  location?: Location;
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

export interface OfflineEvent {
  type: "test-begin" | "test-end" | "run-end";
  data: TestBeginMessage["data"] | TestEndMessage["data"] | RunEndMessage["data"];
  timestamp: number;
  workerIndex: number;
}

export interface OfflineReport {
  version: number;
  generatedAt: string;
  workers: number;
  events: OfflineEvent[];
}
