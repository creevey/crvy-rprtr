import React, { createContext, useContext } from "react";
import type { CreeveySuite } from "../types";

export type SuitePath = string[];
export type FocusableItem = null | SuitePath;

export interface CreeveyContextType {
  isReport: boolean;
  isRunning: boolean;
  isUpdateMode: boolean;
  onImageNext?: () => void;
  onImageApprove?: () => void;
  onApproveAll: () => void;
  onStart: (rootSuite: CreeveySuite) => void;
  onStop: () => void;
  onSuiteOpen: (path: string[], opened: boolean) => void;
  onSuiteToggle: (path: string[], checked: boolean) => void;
  sidebarFocusedItem: FocusableItem;
  setSidebarFocusedItem: (item: FocusableItem) => void;
}

export const CreeveyContext = createContext<CreeveyContextType>({
  isReport: true,
  isRunning: false,
  isUpdateMode: false,
  onImageNext: undefined,
  onImageApprove: undefined,
  onApproveAll: () => undefined,
  onStart: () => undefined,
  onStop: () => undefined,
  onSuiteOpen: () => undefined,
  onSuiteToggle: () => undefined,
  sidebarFocusedItem: [],
  setSidebarFocusedItem: () => undefined,
});

export const useCreeveyContext = (): CreeveyContextType => useContext(CreeveyContext);
