import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./client/App.js";
import type { CreeveySuite, CreeveyTest, TestData } from "./types.js";

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

    const _id = test.id;
    const storyPath = test.storyPath ?? [];
    const browser = test.browser ?? "";
    const testName = test.testName;
    const _storyId = test.storyId;

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
      return suite.children[token] as CreeveySuite;
    }, rootSuite);

    lastSuite.children[browserName] = {
      ...test,
      checked: true,
    } as CreeveyTest;
  });

  return rootSuite;
}

const AppAsync = lazy(async () => {
  const initialState = await loadReportData();

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

  return {
    default() {
      return (
        <App
          initialState={initialState}
          onApprove={handleApprove}
          onApproveAll={handleApproveAll}
        />
      );
    },
  };
});

function Loader(): React.ReactElement {
  return <div className="empty-state">Loading...</div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <Suspense fallback={<Loader />}>
    <AppAsync />
  </Suspense>,
);
