export const FORMAT = "law-ai-roadmap";
export const TYPES = [
  "reading",
  "analysis",
  "experiment",
  "writing",
  "application",
];
export const STATUSES = ["todo", "doing", "done"];
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function isDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "2199-12-31"
  )
    return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dayOfWeek(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function blankState() {
  return {
    format: FORMAT,
    version: 1,
    settings: { startDate: today(), dailyHours: 2, workDays: [1, 2, 3, 4, 5] },
    questions: [],
    tasks: [],
    reviews: [],
    experiments: [],
  };
}
const text = (value, field, max = 20000) => {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`Invalid ${field}`);
  return value;
};
const id = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new Error("Invalid identifier");
  return value;
};
const number = (value, field, max = 10000) => {
  if (!Number.isFinite(value) || value < 0 || value > max)
    throw new Error(`Invalid ${field}`);
  return value;
};
export function safeUrl(value) {
  try {
    if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value))
      return "";
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}
const url = (value) => {
  const s = text(value || "", "URL", 4000),
    normalized = s ? safeUrl(s) : "";
  if (s && !normalized)
    throw new Error(
      "URL must be a single HTTP(S) address without control characters",
    );
  return normalized;
};
const date = (value, optional = false) => {
  if (optional && value === "") return "";
  if (!isDate(value)) throw new Error("Invalid date");
  return value;
};
const array = (value, field, max = 1000) => {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`Invalid ${field}`);
  return value;
};
const uniqueIds = (rows) => {
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error("Duplicate identifiers");
    ids.add(row.id);
  }
  return ids;
};
export function topologicalOrder(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set(),
    active = new Set(),
    ordered = [];
  function visit(task) {
    if (active.has(task.id))
      throw new Error("Task dependencies contain a cycle");
    if (visited.has(task.id)) return;
    active.add(task.id);
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency))
        throw new Error("A task dependency does not exist");
      visit(byId.get(dependency));
    }
    active.delete(task.id);
    visited.add(task.id);
    ordered.push(task);
  }
  for (const task of tasks) visit(task);
  return ordered;
}
export function validateState(input) {
  if (!input || input.format !== FORMAT || input.version !== 1)
    throw new Error("This is not a supported research roadmap backup");
  const s = input.settings;
  if (
    !s ||
    !Array.isArray(s.workDays) ||
    !s.workDays.length ||
    s.workDays.length > 7 ||
    s.workDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    new Set(s.workDays).size !== s.workDays.length
  )
    throw new Error("Select at least one distinct working day");
  const dailyHours = number(s.dailyHours, "daily capacity", 24);
  if (dailyHours < 0.25)
    throw new Error("Daily capacity must be at least 0.25 hours");
  const questions = array(input.questions, "questions", 200).map((q) => ({
    id: id(q.id),
    text: text(q.text, "research question", 1000),
    lens: text(q.lens || "", "lens", 200),
    notes: text(q.notes || "", "question notes"),
  }));
  const qids = uniqueIds(questions);
  const tasks = array(input.tasks, "tasks").map((t) => ({
    id: id(t.id),
    title: text(t.title, "task title", 1000),
    type: TYPES.includes(t.type)
      ? t.type
      : (() => {
          throw new Error("Invalid task type");
        })(),
    questionId: t.questionId ? id(t.questionId) : "",
    status: STATUSES.includes(t.status)
      ? t.status
      : (() => {
          throw new Error("Invalid status");
        })(),
    deadline: date(t.deadline || "", true),
    estimateHours: number(t.estimateHours, "estimated hours", 1000),
    actualHours: number(t.actualHours, "actual hours", 1000),
    dependsOn: array(t.dependsOn, "dependencies", 1000).map(id),
    artifact: url(t.artifact || ""),
    notes: text(t.notes || "", "task notes"),
  }));
  uniqueIds(tasks);
  for (const task of tasks) {
    if (task.questionId && !qids.has(task.questionId))
      throw new Error("Task points to an unknown research question");
    if (new Set(task.dependsOn).size !== task.dependsOn.length)
      throw new Error("Repeated dependency");
    if (!task.title.trim()) throw new Error("A task title is required");
  }
  topologicalOrder(tasks);
  const reviews = array(input.reviews, "reviews", 500).map((r) => ({
    id: id(r.id),
    date: date(r.date),
    progress: text(r.progress || "", "review progress"),
    obstacles: text(r.obstacles || "", "review obstacles"),
    next: text(r.next || "", "review next steps"),
  }));
  uniqueIds(reviews);
  const experiments = array(input.experiments || [], "experiments", 500).map(
    (e) => ({
      id: id(e.id),
      title: text(e.title, "experiment title", 1000),
      questionId: e.questionId ? id(e.questionId) : "",
      model: text(e.model || "", "model", 500),
      dataset: text(e.dataset || "", "dataset", 4000),
      baseline: text(e.baseline || "", "baseline", 4000),
      metrics: text(e.metrics || "", "metrics", 4000),
      observation: text(e.observation || "", "observation"),
      artifact: url(e.artifact || ""),
      createdAt: date(e.createdAt),
    }),
  );
  uniqueIds(experiments);
  for (const e of experiments)
    if (e.questionId && !qids.has(e.questionId))
      throw new Error("Experiment points to an unknown research question");
  return {
    format: FORMAT,
    version: 1,
    settings: {
      startDate: date(s.startDate),
      dailyHours,
      workDays: [...s.workDays],
    },
    questions,
    tasks,
    reviews,
    experiments,
  };
}
export function taskReadiness(task, tasks) {
  const unfinished = task.dependsOn.filter(
    (d) => tasks.find((t) => t.id === d)?.status !== "done",
  );
  return { ready: unfinished.length === 0, unfinished };
}
/** Single-person, capacity-limited, dependency-aware forecast; never an optimality claim. */
export function forecast(state, from = today()) {
  validateState(state);
  const start =
    state.settings.startDate > from ? state.settings.startDate : from;
  const pending = state.tasks.filter((t) => t.status !== "done");
  const finished = new Set(
    state.tasks.filter((t) => t.status === "done").map((t) => t.id),
  );
  let cursor = start,
    used = 0;
  const schedule = [],
    failures = [];
  const working = () => {
    let moves = 0;
    while (!state.settings.workDays.includes(dayOfWeek(cursor))) {
      cursor = addDays(cursor, 1);
      if (++moves > 7) throw new Error("No working days");
    }
  };
  working();
  let iterations = 0;
  while (pending.length) {
    const ready = pending
      .filter((t) => t.dependsOn.every((d) => finished.has(d)))
      .sort(
        (a, b) =>
          (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
          a.title.localeCompare(b.title),
      );
    if (!ready.length) {
      failures.push(
        ...pending.map((t) => ({
          id: t.id,
          reason: "Dependencies cannot be scheduled",
        })),
      );
      break;
    }
    const task = ready[0];
    pending.splice(pending.indexOf(task), 1);
    const remaining = Math.max(0, task.estimateHours - task.actualHours),
      blocks = [];
    let hours = remaining;
    if (remaining > 0.000001 && used >= state.settings.dailyHours - 0.000001) {
      cursor = addDays(cursor, 1);
      used = 0;
      working();
    }
    const taskStart = cursor;
    while (hours > 0.000001) {
      if (++iterations > 15000 || cursor > addDays(start, 730)) {
        failures.push({ id: task.id, reason: "Forecast exceeds two years" });
        break;
      }
      const amount = Math.min(hours, state.settings.dailyHours - used);
      blocks.push({ date: cursor, hours: Math.round(amount * 10000) / 10000 });
      hours -= amount;
      used += amount;
      if (hours > 0.000001) {
        cursor = addDays(cursor, 1);
        used = 0;
        working();
      }
    }
    const complete = hours <= 0.000001;
    schedule.push({
      id: task.id,
      start: taskStart,
      end: cursor,
      hours: remaining,
      blocks,
      late: Boolean(task.deadline && cursor > task.deadline),
      complete,
    });
    if (complete) finished.add(task.id);
  }
  const complete = failures.length === 0 && schedule.every((t) => t.complete);
  return {
    start,
    schedule,
    failures,
    complete,
    totalHours: state.tasks
      .filter((t) => t.status !== "done")
      .reduce(
        (sum, t) => sum + Math.max(0, t.estimateHours - t.actualHours),
        0,
      ),
    finish: complete ? schedule.at(-1)?.end || start : null,
  };
}
export function template(start = today()) {
  const state = blankState();
  state.settings.startDate = start;
  const question = {
    id: uid(),
    text: "How should AI systems used in employment be governed to protect workers and enable meaningful review? / 就业场景中的 AI 如何保障劳动者权益与有效复核？",
    lens: "Social law × AI governance",
    notes:
      "Example research question only. Select a jurisdiction, define a narrower problem, and verify primary sources.",
  };
  state.questions.push(question);
  const items = [
    ["Define scope and jurisdiction / 明确范围与法域", "analysis", 6, 7],
    ["Build a primary-source map / 建立一手规范来源表", "reading", 10, 14],
    [
      "Review literature and record disagreements / 文献综述与分歧整理",
      "reading",
      16,
      28,
    ],
    ["Design a small reproducible audit / 设计可复现实验", "experiment", 8, 35],
    [
      "Run baseline and document errors / 基线实验与误差记录",
      "experiment",
      12,
      49,
    ],
    [
      "Draft the argument and counterarguments / 论证与反论证初稿",
      "writing",
      18,
      63,
    ],
    ["Revise evidence and limitations / 复核证据与研究局限", "writing", 10, 77],
    ["Prepare a research proposal / 整理研究计划", "application", 8, 84],
  ];
  items.forEach(([title, type, hours, day], i) => {
    const previous = state.tasks.at(-1);
    state.tasks.push({
      id: uid(),
      title,
      type,
      questionId: question.id,
      status: "todo",
      deadline: addDays(start, day),
      estimateHours: hours,
      actualHours: 0,
      dependsOn: i ? [previous.id] : [],
      artifact: "",
      notes:
        "Illustrative workload; edit estimates and dependencies for your project. / 示例工作量，请按实际研究修改。",
    });
  });
  return state;
}
export function importReadingList(state, input) {
  if (!input || input.format !== "law-ai-reading-list" || input.version !== 1)
    throw new Error("Expected a Law × AI reading-list export");
  const papers = array(input.papers, "papers", 300);
  const copy = structuredClone(state);
  for (const p of papers) {
    const title = text(p.title, "paper title", 1000);
    if (!title.trim()) throw new Error("Paper title is missing");
    const authors = array(p.authors || [], "authors", 100).map((a) =>
      text(a, "author", 500),
    );
    const keywords = array(p.keywords || [], "keywords", 100).map((k) =>
      text(k, "keyword", 500),
    );
    const themes = array(p.themes || [], "themes", 100).map((k) =>
      text(k, "theme", 500),
    );
    const source = url(p.sourceUrl || "");
    const doi = text(p.doi || "", "DOI", 500);
    const abstract = text(p.abstract || "", "abstract", 20000);
    copy.tasks.push({
      id: uid(),
      title: `Read / 阅读：${title}`,
      type: "reading",
      questionId: "",
      status: "todo",
      deadline: "",
      estimateHours: 2,
      actualHours: 0,
      dependsOn: [],
      artifact:
        source ||
        (/^10\.\d{4,9}\/\S+$/.test(doi)
          ? `https://doi.org/${encodeURIComponent(doi)}`
          : ""),
      notes: [
        authors.join("; "),
        p.year ? String(p.year) : "",
        text(p.journal || "", "journal", 1000),
        `Keywords / 关键词: ${keywords.join(", ")}`,
        `Themes / 主题: ${themes.join(", ")}`,
        abstract,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  return validateState(copy);
}
export function csvCell(value) {
  let v = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replaceAll('"', '""')}"`;
}
export function exportCsv(state) {
  const rows = [
    [
      "Title",
      "Type",
      "Status",
      "Research question",
      "Deadline",
      "Estimated hours",
      "Actual hours",
      "Dependency IDs",
      "Artifact",
      "Notes",
    ],
  ];
  for (const t of state.tasks)
    rows.push([
      t.title,
      t.type,
      t.status,
      state.questions.find((q) => q.id === t.questionId)?.text || "",
      t.deadline,
      t.estimateHours,
      t.actualHours,
      t.dependsOn.join(";"),
      t.artifact,
      t.notes,
    ]);
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
const md = (value) =>
  String(value)
    .replaceAll("\\", "\\\\")
    .replace(/([\[\]<>`*#])/g, "\\$1");
export function exportMarkdown(state, from = today()) {
  const plan = forecast(state, from);
  let out = `# Research roadmap / 研究路线图\n\nExported: ${from}\n\n## Research questions / 研究问题\n\n`;
  state.questions.forEach((q) => {
    out += `### ${md(q.text)}\n\n${md(q.lens)}\n\n${md(q.notes)}\n\n`;
  });
  out += `## Work plan / 工作计划\n\nDaily capacity: ${state.settings.dailyHours} hours. Forecast finish: ${plan.finish || "Beyond forecast horizon / 超出预测范围"}. This is a workload forecast, not a guaranteed completion date.\n\n`;
  for (const t of state.tasks) {
    const f = plan.schedule.find((s) => s.id === t.id);
    out += `- [${t.status === "done" ? "x" : " "}] **${md(t.title)}** — ${t.type}; due ${t.deadline || "unspecified"}; ${t.actualHours}/${t.estimateHours} h${f?.complete ? `; forecast ${f.start} → ${f.end}${f.late ? " (after deadline)" : ""}` : t.status !== "done" ? "; beyond forecast horizon / 超出预测范围" : ""}\n`;
    if (t.artifact) out += `  - Artifact: ${safeUrl(t.artifact)}\n`;
    if (t.notes)
      out += `  - Notes: ${md(t.notes).replaceAll("\n", "\n    ")}\n`;
  }
  out += "\n## Experiment records / 实验记录\n\n";
  for (const e of state.experiments)
    out += `### ${md(e.title)}\n\n- Model / method: ${md(e.model)}\n- Dataset and version: ${md(e.dataset)}\n- Baseline: ${md(e.baseline)}\n- Metrics: ${md(e.metrics)}\n- Observation: ${md(e.observation)}\n- Artifact: ${e.artifact}\n\n`;
  out += "## Weekly reflections / 周回顾\n\n";
  for (const r of [...state.reviews].sort((a, b) =>
    b.date.localeCompare(a.date),
  ))
    out += `### ${r.date}\n\nProgress / 进展: ${md(r.progress)}\n\nObstacles / 障碍: ${md(r.obstacles)}\n\nNext / 下周: ${md(r.next)}\n\n`;
  return out;
}
const icsEscape = (s) =>
  String(s)
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
export function foldIcs(line) {
  let lines = [],
    part = "",
    bytes = 0;
  for (const c of line) {
    const n = new TextEncoder().encode(c).length;
    if (bytes + n > 75) {
      lines.push(part);
      part = " " + c;
      bytes = 1 + n;
    } else {
      part += c;
      bytes += n;
    }
  }
  lines.push(part);
  return lines.join("\r\n");
}
export function exportCalendar(state, now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Law AI Research Tools//Research Roadmap//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const t of state.tasks.filter((t) => t.deadline && t.status !== "done"))
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@research-roadmap.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${t.deadline.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${addDays(t.deadline, 1).replaceAll("-", "")}`,
      `SUMMARY:${icsEscape(t.title)}`,
      `DESCRIPTION:${icsEscape(`${t.type}; estimated ${t.estimateHours} h.\n${t.notes}`)}`,
      ...(safeUrl(t.artifact) ? [`URL:${safeUrl(t.artifact)}`] : []),
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.map(foldIcs).join("\r\n") + "\r\n";
}
