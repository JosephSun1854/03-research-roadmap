import test from "node:test";
import assert from "node:assert/strict";
import {
  blankState,
  isDate,
  addDays,
  validateState,
  forecast,
  template,
  topologicalOrder,
  importReadingList,
  exportCalendar,
  foldIcs,
  exportCsv,
  exportMarkdown,
  taskReadiness,
  safeUrl,
} from "../core.mjs";
const task = (id, changes = {}) => ({
  id,
  title: id,
  type: "reading",
  questionId: "",
  status: "todo",
  deadline: "",
  estimateHours: 2,
  actualHours: 0,
  dependsOn: [],
  artifact: "",
  notes: "",
  ...changes,
});
const state = () => {
  const s = blankState();
  s.settings = {
    startDate: "2026-10-05",
    dailyHours: 2,
    workDays: [1, 2, 3, 4, 5],
  };
  return s;
};
test("calendar validation rejects impossible and malformed dates", () => {
  assert.equal(isDate("2024-02-29"), true);
  for (const d of ["2025-02-29", "2026-99-01", "2026-04-31", "x", null, 42])
    assert.equal(isDate(d), false);
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("round trip template preserves valid records", () => {
  const s = template("2026-10-05");
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), s);
  assert.equal(s.tasks.length, 8);
});
test("cycles and missing dependency references are rejected", () => {
  const s = state();
  s.tasks = [task("a", { dependsOn: ["b"] }), task("b", { dependsOn: ["a"] })];
  assert.throws(() => validateState(s), /cycle/);
  s.tasks = [task("a", { dependsOn: ["missing"] })];
  assert.throws(() => validateState(s), /does not exist/);
});
test("duplicate identifiers and invalid values cannot replace state", () => {
  const s = state();
  s.tasks = [task("a"), task("a")];
  assert.throws(() => validateState(s), /Duplicate/);
  s.tasks = [task("a", { actualHours: -1 })];
  assert.throws(() => validateState(s), /hours/);
  s.tasks = [task("a", { id: 'x" onclick="evil' })];
  assert.throws(() => validateState(s), /identifier/);
});
test("workday validation prevents stalled forecasts", () => {
  const s = state();
  for (const days of [[], [1, 1], [9]]) {
    s.settings.workDays = days;
    assert.throws(() => validateState(s));
  }
});
test("remaining hours respect weekday capacity and completed task dependencies", () => {
  const s = state();
  s.tasks = [
    task("done", { status: "done" }),
    task("a", { estimateHours: 5, actualHours: 1, dependsOn: ["done"] }),
  ];
  const result = forecast(s, "2026-10-09");
  assert.equal(result.schedule[0].start, "2026-10-09");
  assert.equal(result.schedule[0].end, "2026-10-12");
  assert.equal(result.totalHours, 4);
  assert.deepEqual(result.schedule[0].blocks, [
    { date: "2026-10-09", hours: 2 },
    { date: "2026-10-12", hours: 2 },
  ]);
});
test("successor starts after prerequisite allocation", () => {
  const s = state();
  s.tasks = [
    task("successor", { dependsOn: ["predecessor"], deadline: "2026-10-05" }),
    task("predecessor", { estimateHours: 3 }),
  ];
  const result = forecast(s, "2026-10-05");
  assert.deepEqual(
    result.schedule.map((t) => t.id),
    ["predecessor", "successor"],
  );
  assert.equal(result.schedule[1].start, "2026-10-06");
  assert.equal(result.schedule[1].end, "2026-10-07");
  assert.equal(result.schedule[1].late, true);
});
test("deadline ordering prioritizes ready tasks", () => {
  const s = state();
  s.tasks = [
    task("later", { deadline: "2026-10-20" }),
    task("earlier", { deadline: "2026-10-06" }),
  ];
  assert.equal(forecast(s, "2026-10-05").schedule[0].id, "earlier");
});
test("already logged estimate leaves no phantom capacity", () => {
  const s = state();
  s.tasks = [task("a", { estimateHours: 1, actualHours: 4 }), task("b")];
  const r = forecast(s, "2026-10-05");
  assert.equal(r.totalHours, 2);
  assert.equal(r.schedule[1].end, "2026-10-05");
});
test("forecast horizon is bounded rather than freezing", () => {
  const s = state();
  s.settings.dailyHours = 0.25;
  s.settings.workDays = [1];
  s.tasks = [
    task("a", { estimateHours: 1000 }),
    task("b", { dependsOn: ["a"] }),
  ];
  const r = forecast(s, "2026-10-05");
  assert.ok(r.failures.length);
  assert.equal(r.schedule[0].complete, false);
});
test("readiness records unfinished prerequisites", () => {
  const tasks = [task("a"), task("b", { dependsOn: ["a"] })];
  assert.deepEqual(taskReadiness(tasks[1], tasks), {
    ready: false,
    unfinished: ["a"],
  });
  tasks[0].status = "done";
  assert.equal(taskReadiness(tasks[1], tasks).ready, true);
});
test("reading-list integration adds metadata with no mutation of prior work", () => {
  const s = state();
  const r = importReadingList(s, {
    format: "law-ai-reading-list",
    version: 1,
    papers: [
      {
        title: "A paper",
        authors: ["Example Author"],
        year: 2024,
        journal: "Example Journal",
        keywords: ["governance"],
        themes: ["social law"],
        abstract: "Illustrative abstract",
        doi: "10.1000/test",
        sourceUrl: "",
      },
    ],
  });
  assert.equal(s.tasks.length, 0);
  assert.equal(r.tasks.length, 1);
  assert.ok(r.tasks[0].notes.includes("Illustrative abstract"));
  assert.equal(r.tasks[0].type, "reading");
});
test("invalid reading list is atomic", () => {
  const s = state();
  assert.throws(() =>
    importReadingList(s, {
      format: "law-ai-reading-list",
      version: 1,
      papers: [{ title: "ok" }, { title: 42 }],
    }),
  );
  assert.equal(s.tasks.length, 0);
});
test("CSV protects spreadsheet formula prefixes and quotes", () => {
  const s = state();
  s.tasks = [
    task("a", { title: '=HYPERLINK("https://example.com")', notes: "@bad" }),
  ];
  const out = exportCsv(s);
  assert.ok(out.includes("\"'=HYPERLINK"));
  assert.ok(out.includes('"\'@bad"'));
});
test("unsafe links are rejected", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  const s = state();
  s.tasks = [task("a", { artifact: "data:text/html,bad" })];
  assert.throws(() => validateState(s), /URL/);
});
test("calendar is all-day, escaped, stable, and excludes completed tasks", () => {
  const s = state();
  s.tasks = [
    task("a", { title: "One, two; three\nfour", deadline: "2026-10-05" }),
    task("b", { deadline: "2026-10-06", status: "done" }),
  ];
  const out = exportCalendar(s, new Date("2026-10-01T10:00:00Z"));
  assert.ok(out.includes("DTSTART;VALUE=DATE:20261005"));
  assert.ok(out.includes("DTEND;VALUE=DATE:20261006"));
  assert.ok(out.includes("SUMMARY:One\\, two\\; three\\nfour"));
  assert.equal((out.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(out.endsWith("END:VCALENDAR\r\n"));
});
test("UTF-8 calendar line folding respects byte limits", () => {
  const folded = foldIcs("SUMMARY:" + "研究与证据".repeat(40));
  for (const line of folded.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(
    folded.replaceAll("\r\n ", ""),
    "SUMMARY:" + "研究与证据".repeat(40),
  );
});
test("Markdown contains evidence and experiment limitations, not generated research claims", () => {
  const s = template("2026-10-05");
  const out = exportMarkdown(s, "2026-10-05");
  assert.ok(out.includes("Research questions"));
  assert.ok(out.includes("not a guaranteed completion date"));
  assert.ok(out.includes("Example research question only"));
});
test("artifact URLs cannot inject calendar events or raw Markdown markup", () => {
  const s = state();
  s.tasks = [
    task("a", {
      artifact: "https://example.com/\r\nBEGIN:VEVENT\r\nSUMMARY:Injected",
    }),
  ];
  assert.throws(() => validateState(s), /URL/);
  s.tasks[0].artifact = "https://example.com/<script>";
  const cleaned = validateState(s);
  assert.equal(cleaned.tasks[0].artifact, "https://example.com/%3Cscript%3E");
  assert.ok(!exportMarkdown(cleaned, "2026-10-05").includes("<script>"));
});
test("zero remaining work is not delayed after a full-capacity predecessor", () => {
  const s = state();
  s.tasks = [
    task("a"),
    task("b", { estimateHours: 0, dependsOn: ["a"], deadline: "2026-10-05" }),
  ];
  const result = forecast(s, "2026-10-05");
  assert.equal(result.schedule[1].end, "2026-10-05");
  assert.equal(result.schedule[1].late, false);
});
test("incomplete forecasts retain all remaining hours and never report a completion date", () => {
  const s = state();
  s.settings.dailyHours = 0.25;
  s.settings.workDays = [1];
  s.tasks = [
    task("a", { estimateHours: 1000 }),
    task("b", { dependsOn: ["a"] }),
  ];
  const result = forecast(s, "2026-10-05");
  assert.equal(result.totalHours, 1002);
  assert.equal(result.finish, null);
  assert.equal(result.complete, false);
  assert.ok(
    exportMarkdown(s, "2026-10-05").includes("Beyond forecast horizon"),
  );
});
test("unsupported extreme years are rejected before scheduling or calendar export", () => {
  const s = state();
  s.settings.startDate = "9999-12-31";
  assert.throws(() => validateState(s), /date/);
  assert.equal(isDate("9999-12-31"), false);
  s.settings.startDate = "2026-10-05";
  s.tasks = [task("a", { deadline: "9999-12-31" })];
  assert.throws(() => validateState(s), /date/);
});
