import { mount } from "svelte";
import App from "./client/App.svelte";
import type { CreeveySuite, CreeveyTest, TestData } from "./types";
import { calcStatus } from "./client/helpers";

interface InitialState {
  tests: CreeveySuite;
  isReport: boolean;
  isUpdateMode: boolean;
}

async function loadReportData(): Promise<InitialState> {
  const response = await fetch("/api/report");
  const data = await response.json();
  return {
    tests: treeifyTests(data.tests as Record<string, TestData>),
    isReport: true,
    isUpdateMode: data.isUpdateMode ?? false,
  };
}

function treeifyTests(testsById: Record<string, TestData>): CreeveySuite {
  const rootSuite: CreeveySuite = {
    path: [],
    skip: false,
    opened: true,
    checked: true,
    indeterminate: false,
    children: {},
  };

  Object.values(testsById).forEach((test) => {
    if (!test) return;

    const storyPath = test.storyPath ?? [];
    const browser = test.browser ?? "";
    const testName = test.testName;

    const pathParts: string[] = [...storyPath, testName, browser].filter((p): p is string =>
      Boolean(p),
    );
    const [browserName, ...testPathParts] = pathParts.reverse();
    if (!browserName) return;

    const lastSuite = testPathParts.reverse().reduce<CreeveySuite>((suite, token) => {
      if (!suite.children[token]) {
        suite.children[token] = {
          path: [...suite.path, token],
          skip: false,
          opened: false,
          checked: true,
          indeterminate: false,
          children: {},
        };
      }
      const subSuite = suite.children[token] as CreeveySuite;
      subSuite.status = calcStatus(subSuite.status, test.status);
      suite.status = calcStatus(suite.status, subSuite.status);
      if (!test.skip) subSuite.skip = false;
      return subSuite;
    }, rootSuite);

    lastSuite.children[browserName] = {
      ...test,
      checked: true,
    } as CreeveyTest;
  });

  return rootSuite;
}

const handleApprove = async (id: string, retry: number, image: string): Promise<void> => {
  await fetch("/api/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, retry, image }),
  });
  window.location.reload();
};

const handleApproveAll = async (): Promise<void> => {
  await fetch("/api/approve-all", { method: "POST" });
  window.location.reload();
};

const root = document.getElementById("root")!;
root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#808080;font-size:14px">Loading\u2026</div>`;

const initialState = await loadReportData();

const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${wsProtocol}//${location.host}`;

const ws = new WebSocket(wsUrl);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "test-update" || msg.type === "run-end") {
    window.location.reload();
  }
};

root.innerHTML = "";
mount(App, {
  target: root,
  props: {
    initialTests: initialState.tests,
    isReport: initialState.isReport,
    isUpdateMode: initialState.isUpdateMode,
    onApprove: handleApprove,
    onApproveAll: handleApproveAll,
  },
});
