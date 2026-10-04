// Optional integration check. Requires Playwright and a running local HTTP server.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8033/";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
try {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(base);
  await page.locator("#load-template").click();
  assert.equal(await page.locator(".task-card").count(), 8);
  await page.reload();
  assert.equal(await page.locator(".task-card").count(), 8);
  await page.locator("#add-task").click();
  await page.locator("#field-title").fill("Synthetic reproducible audit");
  await page.locator("#field-estimateHours").fill("3");
  await page
    .locator("#field-artifact")
    .fill("https://example.org/illustrative-artifact");
  await page.locator("#editor-form button[type=submit]").click();
  assert.equal(await page.locator(".task-card").count(), 9);
  const before = await page.evaluate(() =>
    localStorage.getItem("law-ai-roadmap-v1"),
  );
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"format":"law-ai-roadmap","version":1,"tasks":[{}]}',
      ),
    });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("law-ai-roadmap-v1")),
    before,
  );
  const list = {
    format: "law-ai-reading-list",
    version: 1,
    papers: [
      {
        title: "Synthetic reading-list record",
        authors: ["Example Author"],
        year: "2025",
        journal: "Fictional journal",
        keywords: ["governance"],
        themes: ["Social law"],
        abstract: "Synthetic educational metadata.",
        sourceUrl: "https://example.org/paper",
      },
    ],
  };
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "reading-list.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(list)),
    });
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".task-card").count(), 10);
  await page.locator("[data-view=experiments]").click();
  await page.locator("#add-experiment").click();
  await page.locator("#field-title").fill("Illustrative audit record");
  await page.locator("#field-model").fill("A deterministic baseline");
  await page.locator("#editor-form button[type=submit]").click();
  assert.equal(await page.locator("#experiment-list .record-card").count(), 1);
  await page.locator("#language").click();
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await page.locator("#language").click();
  await page.locator("[data-view=tasks]").click();
  await page
    .locator(".task-card")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.locator("#editor-form button[type=submit]").click();
  assert.equal(
    await page.evaluate(() => document.activeElement.tagName),
    "BUTTON",
  );
  const recoveredContext = await browser.newContext({ acceptDownloads: true });
  const recovered = await recoveredContext.newPage();
  recovered.on("dialog", (dialog) => dialog.accept());
  await recovered.goto(base);
  const original = JSON.stringify({
    format: "law-ai-roadmap",
    version: 99,
    notes: "Preserve this unreadable record.",
  });
  await recovered.evaluate(
    (value) => localStorage.setItem("law-ai-roadmap-v1", value),
    original,
  );
  await recovered.reload();
  await recovered.locator("#recovery-warning").waitFor({ state: "visible" });
  await recovered.locator("#load-template").click();
  assert.equal(
    await recovered.evaluate(() => localStorage.getItem("law-ai-roadmap-v1")),
    original,
  );
  const download = recovered.waitForEvent("download");
  await recovered.locator("#export-recovery").click();
  assert.equal(await readFile(await (await download).path(), "utf8"), original);
  await recovered.locator("#clear-workspace").click();
  assert.equal(await recovered.locator("#recovery-warning").isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser integration passed: persistence, editing, import atomicity, reading-list transfer, experiments, recovery, focus, bilingual UI, and mobile layout.",
  );
} finally {
  await browser.close();
}
