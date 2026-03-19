import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CreeveySuite, CreeveyTest, Images, ImagesViewMode } from "../types";
import { useCreeveyContext } from "./CreeveyContext";

export interface AppProps {
  initialState: {
    tests: CreeveySuite;
    isReport: boolean;
    isUpdateMode: boolean;
  };
  onApprove: (id: string, retry: number, image: string) => void;
  onApproveAll: () => void;
}

interface TestItemProps {
  test: CreeveySuite | CreeveyTest;
  level: number;
  selectedId?: string;
  onSelect: (test: CreeveyTest) => void;
}

function isTest(x: unknown): x is CreeveyTest {
  return (
    x !== null &&
    typeof x === "object" &&
    "id" in x &&
    "storyId" in x &&
    typeof (x as CreeveyTest).id === "string" &&
    typeof (x as CreeveyTest).storyId === "string"
  );
}

function TestItem({ test, level, selectedId, onSelect }: TestItemProps): React.ReactElement {
  const { onSuiteOpen, onSuiteToggle } = useCreeveyContext();
  const isTestItem = isTest(test);
  const hasChildren = !isTestItem && Object.keys(test.children).length > 0;

  const handleClick = (): void => {
    if (isTestItem) {
      onSelect(test);
    } else {
      onSuiteOpen(test.path, !test.opened);
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    e.stopPropagation();
    if (!isTestItem) {
      onSuiteToggle(test.path, e.target.checked);
    }
  };

  return (
    <>
      <div
        className={`test-item ${selectedId && isTestItem && test.id === selectedId ? "selected" : ""}`}
        style={{ paddingLeft: `${16 + level * 16}px` }}
        onClick={handleClick}
      >
        {hasChildren && <span className={`chevron ${test.opened ? "expanded" : ""}`}>▶</span>}
        <input
          type="checkbox"
          className="checkbox"
          checked={test.checked}
          ref={(el) => {
            if (el && !isTestItem) el.indeterminate = (test as CreeveySuite).indeterminate;
          }}
          onChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="title">
          {isTestItem
            ? (test.testName ?? test.storyId)
            : (test.path[test.path.length - 1] ?? "Tests")}
        </span>
        {test.status && <span className={`status-icon status-dot ${test.status}`} />}
      </div>
      {!isTestItem &&
        test.opened &&
        Object.values(test.children)
          .filter(Boolean)
          .map((child) => (
            <TestItem
              key={isTest(child) ? child.id : (child as CreeveySuite).path.join("/")}
              test={child as CreeveySuite | CreeveyTest}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
    </>
  );
}

export function App({
  initialState,
  onApprove,
  onApproveAll: _onApproveAll,
}: AppProps): React.ReactElement {
  const { tests } = initialState;
  const [selectedTest, setSelectedTest] = useState<CreeveyTest | null>(null);
  const [retry, setRetry] = useState(0);
  const [imageName, setImageName] = useState("");
  const [viewMode, setViewMode] = useState<ImagesViewMode>("side-by-side");

  const testResults = useMemo(() => {
    if (!selectedTest?.results?.length) return null;
    return selectedTest.results[retry - 1] ?? null;
  }, [selectedTest, retry]);

  const currentImage = useMemo(() => {
    if (!testResults?.images || !imageName) return null;
    return testResults.images[imageName];
  }, [testResults, imageName]);

  const canApprove = useMemo(() => {
    if (!selectedTest || !testResults || !currentImage) return false;
    return testResults.status !== "success" && selectedTest.approved?.[imageName] !== retry - 1;
  }, [selectedTest, testResults, currentImage, retry, imageName]);

  const handleSelectTest = useCallback((test: CreeveyTest) => {
    setSelectedTest(test);
    const r = test.results?.length ?? 0;
    setRetry(r);
    const images = test.results?.[r - 1]?.images;
    setImageName(images ? (Object.keys(images)[0] ?? "") : "");
  }, []);

  useEffect(() => {
    if (testResults?.images) {
      const keys = Object.keys(testResults.images);
      if (keys.length > 0 && !keys.includes(imageName)) {
        setImageName(keys[0]);
      }
    }
  }, [testResults, imageName]);

  const handleApprove = (): void => {
    if (selectedTest && canApprove) {
      onApprove(selectedTest.id, retry - 1, imageName);
    }
  };

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Creevey Reporter</h1>
          <div className="tests-status">
            <div className="status-item">
              <span className="status-dot success" />
              <span>{countByStatus(tests, "success")}</span>
            </div>
            <div className="status-item">
              <span className="status-dot failed" />
              <span>{countByStatus(tests, "failed")}</span>
            </div>
            <div className="status-item">
              <span className="status-dot pending" />
              <span>{countByStatus(tests, "pending")}</span>
            </div>
          </div>
        </div>
        <div className="test-list">
          {Object.values(tests.children)
            .filter(Boolean)
            .map((child) => (
              <TestItem
                key={isTest(child) ? child.id : (child as CreeveySuite).path.join("/")}
                test={child as CreeveySuite | CreeveyTest}
                level={0}
                selectedId={selectedTest?.id}
                onSelect={handleSelectTest}
              />
            ))}
        </div>
      </div>
      <div className="main-content">
        {selectedTest && testResults ? (
          <>
            <div className="header">
              <div>
                <h2 className="header-title">{selectedTest.testName ?? selectedTest.storyId}</h2>
                {testResults.images && Object.keys(testResults.images).length > 1 && (
                  <div className="image-tabs">
                    {Object.keys(testResults.images).map((name) => (
                      <button
                        key={name}
                        className={`image-tab ${name === imageName ? "active" : ""}`}
                        onClick={() => setImageName(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="view-modes">
                {(["side-by-side", "swap", "slide", "blend"] as ImagesViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`view-mode-btn ${viewMode === mode ? "active" : ""}`}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="content">
              <ImageViewer image={currentImage} viewMode={viewMode} canApprove={canApprove} />
            </div>
            <div className="footer">
              <span className="nav-hint">Use ← → to navigate, Enter to approve</span>
              <button className="approve-btn" disabled={!canApprove} onClick={handleApprove}>
                {canApprove ? "Approve" : "Approved"}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">Select a test to view results</div>
        )}
      </div>
    </div>
  );
}

interface ImageViewerProps {
  image: Images | null | undefined;
  viewMode: ImagesViewMode;
  canApprove: boolean;
}

function ImageViewer({ image, viewMode }: ImageViewerProps): React.ReactElement {
  if (!image) {
    return <div className="empty-state">No image to display</div>;
  }

  if (viewMode === "side-by-side") {
    return (
      <div className="image-container">
        {image.expect && (
          <div className="image-panel">
            <h3>Expected</h3>
            <img src={image.expect} alt="Expected" />
          </div>
        )}
        {image.actual && (
          <div className="image-panel">
            <h3>Actual</h3>
            <img src={image.actual} alt="Actual" />
          </div>
        )}
        {image.diff && (
          <div className="image-panel">
            <h3>Diff</h3>
            <img src={image.diff} alt="Diff" />
          </div>
        )}
      </div>
    );
  }

  if (viewMode === "swap") {
    return (
      <div className="image-container">
        <div className="image-panel" style={{ flex: 2 }}>
          <h3>Swap View (click or press Space)</h3>
          <div style={{ position: "relative", flex: 1 }}>
            {image.expect && (
              <img
                src={image.expect}
                alt="Expected"
                style={{ position: "absolute", top: 0, left: 0, width: "100%" }}
              />
            )}
            {image.actual && (
              <img
                src={image.actual}
                alt="Actual"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", opacity: 0.5 }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "blend") {
    return (
      <div className="image-container">
        <div className="image-panel" style={{ flex: 2 }}>
          <h3>Blend (Difference)</h3>
          <div style={{ position: "relative", flex: 1 }}>
            {image.expect && (
              <img
                src={image.expect}
                alt="Expected"
                style={{ position: "absolute", top: 0, left: 0, width: "100%" }}
              />
            )}
            {image.actual && (
              <img
                src={image.actual}
                alt="Actual"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  mixBlendMode: "difference",
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="image-container">
      {image.actual && (
        <div className="image-panel" style={{ flex: 2 }}>
          <h3>Actual</h3>
          <img src={image.actual} alt="Actual" />
        </div>
      )}
    </div>
  );
}

function countByStatus(suite: CreeveySuite, status: string): number {
  let count = 0;
  const stack: (CreeveySuite | CreeveyTest)[] = Object.values(suite.children).filter(Boolean) as (
    | CreeveySuite
    | CreeveyTest
  )[];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) continue;
    if (isTest(item)) {
      if (item.status === status) count++;
    } else {
      stack.push(
        ...(Object.values(item.children).filter(Boolean) as (CreeveySuite | CreeveyTest)[]),
      );
    }
  }
  return count;
}
