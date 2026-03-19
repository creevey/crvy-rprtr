import type { CreeveySuite } from '../types';

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

export type FocusableItem = null | string[];

const defaultContext: CreeveyContextType = {
  isReport: true,
  isRunning: false,
  isUpdateMode: false,
  onImageNext: undefined,
  onImageApprove: undefined,
  onApproveAll: () => {},
  onStart: () => {},
  onStop: () => {},
  onSuiteOpen: () => {},
  onSuiteToggle: () => {},
  sidebarFocusedItem: null,
  setSidebarFocusedItem: () => {},
};

export function createCreeveyContext(initial: Partial<CreeveyContextType> = {}): CreeveyContextType {
  return { ...defaultContext, ...initial };
}

export function provideCreeveyContext(initial?: Partial<CreeveyContextType>): void {
  const ctx = createCreeveyContext(initial);
  (window as unknown as { __creevey_context__?: CreeveyContextType }).__creevey_context__ = ctx;
}

export function useCreeveyContext(): CreeveyContextType {
  const ctx = (window as unknown as { __creevey_context__?: CreeveyContextType }).__creevey_context__;
  return ctx ?? createCreeveyContext();
}