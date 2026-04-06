import { mount } from "svelte";
import App from "./client/App.svelte";
import type { CreeveySuite, TestData } from "./types";
import { treeifyTests } from "./client/helpers";

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

const handleApprove = async (id: string, retry: number, image: string): Promise<void> => {
  await fetch("/api/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, retry, image }),
  });
};

const handleApproveAll = async (): Promise<void> => {
  await fetch("/api/approve-all", { method: "POST" });
};

const root = document.getElementById("root")!;
root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#808080;font-size:14px">Loading\u2026</div>`;

const initialState = await loadReportData();

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
