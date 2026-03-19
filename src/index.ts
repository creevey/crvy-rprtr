export interface CreeveyReporter {
  onTestEnd: (test: TestInfo) => void;
}

export interface TestInfo {
  id: string;
  title: string;
  status: "passed" | "failed" | "skipped";
}
