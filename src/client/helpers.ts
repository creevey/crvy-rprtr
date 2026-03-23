import {
  type CreeveySuite,
  type CreeveyTest,
  type TestData,
  type TestStatus,
  isTest,
  isDefined,
} from "../types";

export interface CreeveyViewFilter {
  status: TestStatus | null;
  subStrings: string[];
}

export interface CreeveyTestsStatus {
  successCount: number;
  failedCount: number;
  pendingCount: number;
  approvedCount: number;
}

const statusUpdatesMap = new Map<TestStatus | undefined, RegExp>([
  [undefined, /(unknown|success|approved|failed|pending|running)/],
  ["unknown", /(success|approved|failed|pending|running)/],
  ["success", /(approved|failed|pending|running)/],
  ["approved", /(failed|pending|running)/],
  ["failed", /(pending|running)/],
  ["pending", /running/],
]);

function makeEmptySuiteNode(path: string[] = []): CreeveySuite {
  return {
    path,
    skip: true,
    opened: false,
    checked: true,
    indeterminate: false,
    children: {},
  };
}

export function calcStatus(oldStatus?: TestStatus, newStatus?: TestStatus): TestStatus | undefined {
  return newStatus && statusUpdatesMap.get(oldStatus)?.test(newStatus) ? newStatus : oldStatus;
}

export function getTestPath(test: Pick<TestData, "browser" | "title" | "titlePath">): string[] {
  return [...test.titlePath, test.title, test.browser].filter(isDefined);
}

export function getSuiteByPath(
  suite: CreeveySuite,
  path: string[],
): CreeveySuite | CreeveyTest | undefined {
  return path.reduce(
    (suiteOrTest: CreeveySuite | CreeveyTest | undefined, pathToken: string) =>
      isTest(suiteOrTest) ? suiteOrTest : suiteOrTest?.children[pathToken],
    suite as CreeveySuite | CreeveyTest | undefined,
  );
}

export function getTestByPath(suite: CreeveySuite, path: string[]): CreeveyTest | null {
  const test = getSuiteByPath(suite, path) ?? suite;
  return isTest(test) ? test : null;
}

export function getFailedTests(suite: CreeveySuite): CreeveyTest[] {
  return Object.values(suite.children)
    .filter(isDefined)
    .flatMap((suiteOrTest) => {
      if (isTest(suiteOrTest)) return suiteOrTest.status === "failed" ? suiteOrTest : [];
      return getFailedTests(suiteOrTest);
    });
}

export function getCheckedTests(suite: CreeveySuite): CreeveyTest[] {
  return Object.values(suite.children)
    .filter(isDefined)
    .flatMap((suiteOrTest) => {
      if (isTest(suiteOrTest)) return suiteOrTest.checked ? suiteOrTest : [];
      if (!suiteOrTest.checked && !suiteOrTest.indeterminate) return [];
      return getCheckedTests(suiteOrTest);
    });
}

function checkTests(suiteOrTest: CreeveySuite | CreeveyTest, checked: boolean): void {
  suiteOrTest.checked = checked;
  if (!isTest(suiteOrTest)) {
    suiteOrTest.indeterminate = false;
    Object.values(suiteOrTest.children)
      .filter(isDefined)
      .forEach((child) => checkTests(child, checked));
  }
}

function updateChecked(suite: CreeveySuite): void {
  const children = Object.values(suite.children)
    .filter(isDefined)
    .filter((child) => !child.skip);
  const checkedEvery = children.every((test) => test.checked);
  const checkedSome = children.some((test) => test.checked);
  const indeterminate =
    children.some((test) => (isTest(test) ? false : test.indeterminate)) ||
    (!checkedEvery && checkedSome);
  const checked = indeterminate || suite.checked === checkedEvery ? suite.checked : checkedEvery;
  suite.checked = checked;
  suite.indeterminate = indeterminate;
}

export function checkSuite(suite: CreeveySuite, path: string[], checked: boolean): void {
  const subSuite = getSuiteByPath(suite, path);
  if (subSuite) checkTests(subSuite, checked);
  path
    .slice(0, -1)
    .map((_, index, tokens) => tokens.slice(0, tokens.length - index))
    .forEach((parentPath) => {
      const parentSuite = getSuiteByPath(suite, parentPath);
      if (isTest(parentSuite)) return;
      if (parentSuite) updateChecked(parentSuite);
    });
  updateChecked(suite);
}

export function openSuite(suite: CreeveySuite, path: string[], opened: boolean): void {
  const subSuite = path.reduce(
    (suiteOrTest: CreeveySuite | CreeveyTest | undefined, pathToken: string) => {
      if (suiteOrTest && !isTest(suiteOrTest)) {
        if (opened) suiteOrTest.opened = opened;
        return suiteOrTest.children[pathToken];
      }
    },
    suite as CreeveySuite | CreeveyTest | undefined,
  );
  if (subSuite && !isTest(subSuite)) subSuite.opened = opened;
}

export function filterTests(suite: CreeveySuite, filter: CreeveyViewFilter): CreeveySuite {
  const { status, subStrings } = filter;
  if (!status && !subStrings.length) return suite;
  const filteredSuite: CreeveySuite = { ...suite, children: {} };
  Object.entries(suite.children).forEach(([title, suiteOrTest]) => {
    if (!suiteOrTest || suiteOrTest.skip) return;
    if (!status && subStrings.some((sub) => title.toLowerCase().includes(sub))) {
      filteredSuite.children[title] = suiteOrTest;
    } else if (isTest(suiteOrTest)) {
      if (
        status &&
        suiteOrTest.status &&
        ["pending", "running", status].includes(suiteOrTest.status)
      )
        filteredSuite.children[title] = suiteOrTest;
    } else {
      const filteredSubSuite = filterTests(suiteOrTest, filter);
      if (Object.keys(filteredSubSuite.children).length === 0) return;
      filteredSuite.children[title] = filteredSubSuite;
    }
  });
  return filteredSuite;
}

export function flattenSuite(
  suite: CreeveySuite,
): { title: string; suite: CreeveySuite | CreeveyTest }[] {
  if (!suite.opened) return [];
  return Object.entries(suite.children).flatMap(([title, subSuite]) =>
    subSuite
      ? [{ title, suite: subSuite }, ...(isTest(subSuite) ? [] : flattenSuite(subSuite))]
      : [],
  );
}

export function countTestsStatus(suite: CreeveySuite): CreeveyTestsStatus {
  let successCount = 0;
  let failedCount = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  const cases: (CreeveySuite | CreeveyTest)[] = Object.values(suite.children).filter(isDefined);
  let suiteOrTest;
  while ((suiteOrTest = cases.pop())) {
    if (isTest(suiteOrTest)) {
      if (!hasScreenshots(suiteOrTest)) continue;
      if (suiteOrTest.status === "approved") approvedCount++;
      if (suiteOrTest.status === "success") successCount++;
      if (suiteOrTest.status === "failed") failedCount++;
      if (suiteOrTest.status === "pending") pendingCount++;
    } else {
      cases.push(...Object.values(suiteOrTest.children).filter(isDefined));
    }
  }
  return { approvedCount, successCount, failedCount, pendingCount };
}

export function updateTestStatus(
  suite: CreeveySuite,
  path: string[],
  update: Partial<TestData>,
): void {
  const title = path.shift();
  if (!title) return;
  const suiteOrTest =
    suite.children[title] ??
    (suite.children[title] = {
      ...(path.length === 0 ? (update as TestData) : makeEmptySuiteNode([...suite.path, title])),
      checked: suite.checked,
    });
  if (isTest(suiteOrTest)) {
    const test = suiteOrTest;
    const { skip, status, results, approved } = update;
    if (isDefined(skip)) test.skip = skip;
    if (isDefined(status)) test.status = status;
    if (isDefined(results)) {
      if (test.results) test.results.push(...results);
      else test.results = results;
    }
    if (approved === null) test.approved = null;
    else if (approved !== undefined)
      Object.entries(approved).forEach(
        ([image, retry]) =>
          retry !== undefined && ((test.approved = test.approved ?? {})[image] = retry),
      );
  } else {
    updateTestStatus(suiteOrTest, path, update);
  }
  suite.skip = Object.values(suite.children)
    .filter(isDefined)
    .map(({ skip }) => skip)
    .every(Boolean);
  suite.status = Object.values(suite.children)
    .filter(isDefined)
    .map(({ status }) => status)
    .reduce(calcStatus);
}

export function removeTests(suite: CreeveySuite, path: string[]): void {
  const title = path.shift();
  if (!title) return;
  const suiteOrTest = suite.children[title];
  if (suiteOrTest && !isTest(suiteOrTest)) removeTests(suiteOrTest, path);
  if (isTest(suiteOrTest) || Object.keys(suiteOrTest?.children ?? {}).length === 0) {
    delete suite.children[title];
  }
  if (Object.keys(suite.children).length === 0) return;
  updateChecked(suite);
  suite.skip = Object.values(suite.children)
    .filter(isDefined)
    .map(({ skip }) => skip)
    .every(Boolean);
  suite.status = Object.values(suite.children)
    .filter(isDefined)
    .map(({ status }) => status)
    .reduce(calcStatus);
}

export function setSearchParams(testPath: string[]): void {
  const params = new URLSearchParams();
  testPath.forEach((p, i) => params.set(`testPath[${i}]`, p));
  window.history.pushState({ testPath }, "", `?${params.toString()}`);
}

export function getTestPathFromSearch(): string[] {
  const params = new URLSearchParams(window.location.search);
  const path: string[] = [];
  let i = 0;
  while (params.has(`testPath[${i}]`)) {
    path.push(params.get(`testPath[${i}]`)!);
    i++;
  }
  return path;
}

export function parseFilterString(value: string): CreeveyViewFilter {
  let status: TestStatus | null = null;
  const subStrings: string[] = [];
  value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.toLowerCase())
    .forEach((word) => {
      const [, matchedStatus] = /^status:(failed|success|pending|approved)$/i.exec(word) ?? [];
      if (matchedStatus) {
        status = matchedStatus as TestStatus;
        return;
      }
      subStrings.push(word);
    });
  return { status, subStrings };
}

export function hasScreenshots(item: CreeveySuite | CreeveyTest): boolean {
  if (isTest(item)) {
    return item.results?.some((r) => r.images && Object.keys(r.images).length > 0) ?? false;
  }
  return Object.values(item.children)
    .filter(isDefined)
    .some((child) => hasScreenshots(child as CreeveySuite | CreeveyTest));
}
