import { test, expect } from "@playwright/test";

test.describe("Creevey Reporter API", () => {
  test("server responds on port 3000", async ({ request }) => {
    const response = await request.get("http://localhost:3000/");
    expect(response.status()).toBe(200);
  });

  test("returns index.html", async ({ request }) => {
    const response = await request.get("http://localhost:3000/");
    const content = await response.text();
    expect(content).toContain("<!doctype html>");
    expect(content).toContain("Creevey Reporter");
  });

  test("API report endpoint returns JSON", async ({ request }) => {
    const response = await request.get("http://localhost:3000/api/report");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("tests");
    expect(data).toHaveProperty("browsers");
  });

  test("app.css is served", async ({ request }) => {
    const response = await request.get("http://localhost:3000/src/client/app.css");
    expect(response.status()).toBe(200);
    const content = await response.text();
    expect(content).toContain("body");
  });
});
