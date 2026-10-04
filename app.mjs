import {
  blankState,
  validateState,
  today,
  uid,
  forecast,
  taskReadiness,
  template,
  importReadingList,
  exportCsv,
  exportMarkdown,
  exportCalendar,
  safeUrl,
} from "./core.mjs";
const KEY = "law-ai-roadmap-v1",
  LANG = "law-ai-roadmap-language";
const $ = (id) => document.getElementById(id);
let state = blankState(),
  lang = "en",
  view = "tasks",
  editing = null,
  timer,
  lastFocus,
  unreadableStoredRaw = null;
const tr = (en, zh) => (lang === "zh" ? zh : en);
const types = {
  reading: ["Reading", "阅读"],
  analysis: ["Analysis", "分析"],
  experiment: ["Experiment", "实验"],
  writing: ["Writing", "写作"],
  application: ["Application", "申请"],
};
const statuses = {
  todo: ["To do", "待开始"],
  doing: ["In progress", "进行中"],
  done: ["Done", "已完成"],
};
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function notify(text) {
  clearTimeout(timer);
  $("toast").textContent = text;
  $("toast").hidden = false;
  timer = setTimeout(() => ($("toast").hidden = true), 6000);
}
try {
  lang = localStorage.getItem(LANG) === "zh" ? "zh" : "en";
  const saved = localStorage.getItem(KEY);
  if (saved) {
    unreadableStoredRaw = saved;
    state = validateState(JSON.parse(saved));
    unreadableStoredRaw = null;
  }
} catch {
  setTimeout(
    () =>
      notify(
        "Stored data could not be read. Export or recover it before replacing this workspace. / 无法读取已有数据，请先恢复或备份。",
      ),
    0,
  );
}
function commit(candidate, message, allowRecoveryReplace = false) {
  if (unreadableStoredRaw && !allowRecoveryReplace) {
    notify(
      tr(
        "Existing data is unreadable. Export its raw JSON first, then explicitly restore a valid backup or clear the workspace.",
        "已有数据无法读取。请先导出原始 JSON，再明确恢复有效备份或清空工作区。",
      ),
    );
    return false;
  }
  try {
    const checked = validateState(candidate);
    localStorage.setItem(KEY, JSON.stringify(checked));
    state = checked;
    unreadableStoredRaw = null;
    render();
    if (message) notify(message);
    return true;
  } catch (e) {
    notify(`${tr("Not saved", "未保存")}: ${e.message}`);
    return false;
  }
}
function language() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document
    .querySelectorAll("[data-en]")
    .forEach((n) => (n.textContent = n.dataset[lang]));
  $("language").textContent = lang === "en" ? "中文" : "English";
  try {
    localStorage.setItem(LANG, lang);
  } catch {}
}
function stat(value, en, zh) {
  const n = el("div", undefined, "stat");
  n.append(el("strong", String(value)), el("span", tr(en, zh)));
  return n;
}
function action(label, callback, cls = "") {
  const b = el("button", label, cls);
  b.type = "button";
  b.addEventListener("click", callback);
  return b;
}
function empty(parent, en, zh) {
  const box = el("div", undefined, "empty");
  box.append(
    el("h3", tr(en, zh)),
    el(
      "p",
      tr(
        "Start with your own research, or load the editable example.",
        "新建研究记录，或载入可编辑示例。",
      ),
    ),
  );
  parent.append(box);
}
function questionText(id) {
  return state.questions.find((q) => q.id === id)?.text || "";
}
function artifact(url) {
  const a = el("a", tr("Open artifact ↗", "打开成果 ↗"));
  a.href = safeUrl(url);
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function renderSettings() {
  $("start-date").value = state.settings.startDate;
  $("daily-hours").value = state.settings.dailyHours;
  const days = $("weekdays");
  days.replaceChildren();
  const labels =
    lang === "zh"
      ? ["日", "一", "二", "三", "四", "五", "六"]
      : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  for (let i = 0; i < 7; i++) {
    const label = el("label", undefined, "day-check"),
      input = el("input");
    input.type = "checkbox";
    input.value = String(i);
    input.checked = state.settings.workDays.includes(i);
    input.setAttribute("aria-label", labels[i]);
    label.append(input, el("span", labels[i]));
    days.append(label);
  }
}
function renderTasks(plan) {
  const parent = $("task-list");
  parent.replaceChildren();
  const q = $("search").value.toLowerCase(),
    status = $("status-filter").value,
    type = $("type-filter").value;
  const list = state.tasks.filter(
    (t) =>
      (!q ||
        `${t.title} ${t.notes} ${questionText(t.questionId)}`
          .toLowerCase()
          .includes(q)) &&
      (!status || t.status === status) &&
      (!type || t.type === type),
  );
  if (!list.length) {
    empty(
      parent,
      state.tasks.length
        ? "No tasks match these filters."
        : "Give your question a first step.",
      state.tasks.length
        ? "没有符合筛选条件的任务。"
        : "为研究问题安排第一步。",
    );
    return;
  }
  for (const t of list) {
    const card = el("article", undefined, "card task-card");
    card.dataset.recordId = t.id;
    const ready = taskReadiness(t, state.tasks),
      f = plan.schedule.find((s) => s.id === t.id);
    const heading = el("div", undefined, "task-heading"),
      check = el("input");
    check.type = "checkbox";
    check.checked = t.status === "done";
    check.setAttribute(
      "aria-label",
      tr(`Mark ${t.title} complete`, `将 ${t.title} 标为完成`),
    );
    check.addEventListener("change", () => {
      const candidate = structuredClone(state);
      candidate.tasks.find((x) => x.id === t.id).status = check.checked
        ? "done"
        : "todo";
      commit(candidate);
    });
    heading.append(check, el("h3", t.title));
    card.append(heading);
    const tags = el("div", undefined, "chip-list");
    tags.append(
      el("span", tr(...types[t.type]), "badge"),
      el("span", tr(...statuses[t.status]), "badge"),
    );
    if (t.status !== "done" && !ready.ready)
      tags.append(
        el(
          "span",
          tr(
            `${ready.unfinished.length} prerequisite(s)`,
            `等待 ${ready.unfinished.length} 个前置任务`,
          ),
          "badge warning",
        ),
      );
    if (t.status !== "done" && t.deadline && t.deadline < today())
      tags.append(el("span", tr("Overdue", "已过截止日期"), "badge error"));
    if (f?.complete && f.late)
      tags.append(
        el(
          "span",
          tr("Forecast after deadline", "预计晚于截止日期"),
          "badge warning",
        ),
      );
    if (t.status === "done" && !t.artifact)
      tags.append(
        el(
          "span",
          tr("Artifact not linked", "尚未附成果链接"),
          "badge warning",
        ),
      );
    card.append(tags);
    if (t.questionId)
      card.append(el("p", questionText(t.questionId), "question-ref"));
    const meta = el("div", undefined, "task-meta");
    meta.append(
      el(
        "span",
        `${tr("Due", "截止")}: ${t.deadline || tr("Unscheduled", "未设置")}`,
      ),
      el("span", `${t.actualHours} / ${t.estimateHours} h`),
    );
    if (f?.complete)
      meta.append(el("span", `${tr("Forecast", "预计")}: ${f.end}`));
    else if (t.status !== "done")
      meta.append(
        el("span", tr("Beyond forecast horizon", "超出预测范围"), "error-text"),
      );
    card.append(meta);
    const progress = el("progress");
    progress.max = Math.max(t.estimateHours, 1);
    progress.value =
      t.status === "done"
        ? progress.max
        : Math.min(t.actualHours, progress.max);
    progress.setAttribute(
      "aria-label",
      tr("Logged hours compared with estimate", "已记录工时与预计工时"),
    );
    card.append(progress);
    if (t.notes) {
      const details = el("details");
      details.append(
        el("summary", tr("Notes & evidence", "笔记与证据")),
        el("p", t.notes, "task-notes"),
      );
      card.append(details);
    }
    const controls = el("div", undefined, "actions");
    if (t.artifact) controls.append(artifact(t.artifact));
    const select = el("select");
    select.setAttribute(
      "aria-label",
      tr(`Status for ${t.title}`, `${t.title} 的状态`),
    );
    Object.entries(statuses).forEach(([value, labels]) => {
      const option = el("option", tr(...labels));
      option.value = value;
      option.selected = value === t.status;
      select.append(option);
    });
    select.addEventListener("change", () => {
      const c = structuredClone(state);
      c.tasks.find((x) => x.id === t.id).status = select.value;
      commit(c);
    });
    controls.append(
      select,
      action(tr("Edit", "编辑"), () => openEditor("task", t)),
      action(tr("Remove", "删除"), () => remove("task", t.id), "danger"),
    );
    card.append(controls);
    parent.append(card);
  }
}
function renderForecast(plan) {
  const parent = $("forecast-list");
  parent.replaceChildren();
  if (!plan.schedule.length) {
    empty(
      parent,
      "No unfinished work to forecast.",
      "没有待预测的未完成任务。",
    );
    return;
  }
  if (plan.failures.length)
    parent.append(
      el(
        "p",
        tr(
          "Some tasks exceed the forecast horizon or have unfinished dependencies.",
          "部分任务超过预测时限或依赖无法排期。",
        ),
        "error-text",
      ),
    );
  for (const f of plan.schedule) {
    const t = state.tasks.find((t) => t.id === f.id);
    const row = el("article", undefined, "forecast-row");
    row.append(
      el(
        "div",
        f.complete
          ? `${f.start} → ${f.end}`
          : tr("Beyond forecast horizon", "超出预测范围"),
        "forecast-date",
      ),
      el("h3", t.title),
      el(
        "p",
        `${f.hours.toFixed(1)} h · ${f.blocks.length} ${tr("working day(s)", "个研究日")}${f.late ? " · " + tr("after deadline", "晚于截止日期") : ""}`,
        f.late ? "error-text note" : "note",
      ),
    );
    const blocks = el("div", undefined, "forecast-blocks");
    f.blocks
      .slice(0, 30)
      .forEach((b) =>
        blocks.append(
          el(
            "span",
            `${b.date.slice(5)} · ${Number(b.hours.toFixed(2))} h`,
            "tag",
          ),
        ),
      );
    if (f.blocks.length > 30)
      blocks.append(el("span", `+${f.blocks.length - 30}`, "tag"));
    row.append(blocks);
    parent.append(row);
  }
}
function renderQuestions() {
  const parent = $("question-list");
  parent.replaceChildren();
  if (!state.questions.length)
    empty(
      parent,
      "Begin with a precise question.",
      "先提出一个明确的研究问题。",
    );
  for (const q of state.questions) {
    const card = el("article", undefined, "card record-card");
    card.dataset.recordId = q.id;
    const tasks = state.tasks.filter((t) => t.questionId === q.id);
    card.append(
      el("p", q.lens, "eyebrow"),
      el("h3", q.text),
      el("p", q.notes, "task-notes"),
      el(
        "p",
        `${tasks.filter((t) => t.status === "done").length} / ${tasks.length} ${tr("tasks complete", "任务已完成")}`,
        "note",
      ),
    );
    const buttons = el("div", undefined, "actions");
    buttons.append(
      action(tr("Edit", "编辑"), () => openEditor("question", q)),
      action(tr("Remove", "删除"), () => remove("question", q.id), "danger"),
    );
    card.append(buttons);
    parent.append(card);
  }
}
function renderExperiments() {
  const parent = $("experiment-list");
  parent.replaceChildren();
  if (!state.experiments.length)
    empty(
      parent,
      "Keep a reproducible experiment record.",
      "保存可复现的实验记录。",
    );
  for (const e of [...state.experiments].reverse()) {
    const card = el("article", undefined, "card record-card");
    card.dataset.recordId = e.id;
    card.append(el("p", e.createdAt, "eyebrow"), el("h3", e.title));
    for (const [key, en, zh] of [
      ["model", "Model / method", "模型 / 方法"],
      ["dataset", "Dataset & version", "数据集与版本"],
      ["baseline", "Baseline", "基线"],
      ["metrics", "Metrics", "评价指标"],
      ["observation", "Observations", "观察结果"],
    ]) {
      const p = el("p", undefined, "experiment-field");
      p.append(el("strong", tr(en, zh) + ": "), el("span", e[key] || "—"));
      card.append(p);
    }
    if (e.artifact) card.append(artifact(e.artifact));
    const buttons = el("div", undefined, "actions");
    buttons.append(
      action(tr("Edit", "编辑"), () => openEditor("experiment", e)),
      action(tr("Remove", "删除"), () => remove("experiment", e.id), "danger"),
    );
    card.append(buttons);
    parent.append(card);
  }
}
function renderReviews() {
  const parent = $("review-list");
  parent.replaceChildren();
  if (!state.reviews.length)
    empty(
      parent,
      "What changed in your understanding this week?",
      "本周对研究问题的理解发生了什么变化？",
    );
  for (const r of [...state.reviews].sort((a, b) =>
    b.date.localeCompare(a.date),
  )) {
    const card = el("article", undefined, "card record-card");
    card.dataset.recordId = r.id;
    card.append(el("p", r.date, "eyebrow"));
    for (const [k, en, zh] of [
      ["progress", "Progress", "进展"],
      ["obstacles", "Obstacles", "障碍"],
      ["next", "Next steps", "下一步"],
    ]) {
      card.append(el("h3", tr(en, zh)), el("p", r[k] || "—", "task-notes"));
    }
    const buttons = el("div", undefined, "actions");
    buttons.append(
      action(tr("Edit", "编辑"), () => openEditor("review", r)),
      action(tr("Remove", "删除"), () => remove("review", r.id), "danger"),
    );
    card.append(buttons);
    parent.append(card);
  }
}
function render() {
  language();
  $("recovery-warning").hidden = !unreadableStoredRaw;
  renderSettings();
  const plan = forecast(state);
  const pending = state.tasks.filter((t) => t.status !== "done");
  $("stats").replaceChildren(
    stat(
      `${state.tasks.filter((t) => t.status === "done").length}/${state.tasks.length}`,
      "Tasks complete",
      "已完成任务",
    ),
    stat(
      pending.filter((t) => taskReadiness(t, state.tasks).ready).length,
      "Ready to begin",
      "可开始任务",
    ),
    stat(
      Number(plan.totalHours.toFixed(1)),
      "Remaining estimated hours",
      "剩余预计工时",
    ),
    stat(
      !plan.complete
        ? tr("Beyond horizon", "超出范围")
        : plan.schedule.length
          ? plan.finish
          : "—",
      "Forecast finish",
      "预计完成日期",
    ),
  );
  renderTasks(plan);
  renderForecast(plan);
  renderQuestions();
  renderExperiments();
  renderReviews();
  setView(view);
}
function setView(next) {
  view = next;
  for (const name of [
    "tasks",
    "forecast",
    "questions",
    "experiments",
    "reviews",
  ])
    $(name + "-view").hidden = name !== view;
  document
    .querySelectorAll("[data-view]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.view === view)),
    );
}
function field(name, en, zh, value = "", kind = "input", options = {}) {
  const box = el("div", undefined, "field"),
    label = el("label", tr(en, zh));
  label.htmlFor = "field-" + name;
  const input = el(kind);
  input.id = "field-" + name;
  input.name = name;
  if (kind === "select") {
    for (const [v, t] of options.choices) {
      const o = el("option", t);
      o.value = v;
      input.append(o);
    }
    input.multiple = Boolean(options.multiple);
    if (options.multiple) {
      input.size = 5;
      for (const o of input.options) o.selected = value.includes(o.value);
    } else input.value = value;
  } else {
    if (kind === "input") input.type = options.type || "text";
    input.value = value;
    input.maxLength = options.max || 20000;
    if (options.min !== undefined) input.min = options.min;
    if (options.maxNumber !== undefined) input.max = options.maxNumber;
    if (options.step) input.step = options.step;
    input.required = Boolean(options.required);
  }
  box.append(label, input);
  return box;
}
function qField(value) {
  return field(
    "questionId",
    "Research question",
    "关联研究问题",
    value,
    "select",
    {
      choices: [
        ["", tr("No question assigned", "未关联问题")],
        ...state.questions.map((q) => [q.id, q.text]),
      ],
    },
  );
}
function openEditor(kind, item = null) {
  editing = { kind, id: item?.id };
  lastFocus = document.activeElement;
  $("editor-error").textContent = "";
  const fields = $("editor-fields");
  fields.replaceChildren();
  $("editor-title").textContent = tr(
    item ? "Edit record" : "New record",
    item ? "编辑记录" : "新建记录",
  );
  if (kind === "task") {
    const t = item || {
      title: "",
      type: "reading",
      status: "todo",
      questionId: "",
      deadline: "",
      estimateHours: 2,
      actualHours: 0,
      dependsOn: [],
      artifact: "",
      notes: "",
    };
    fields.append(
      field(
        "title",
        "Task / deliverable",
        "任务 / 阶段成果",
        t.title,
        "input",
        { required: true, max: 1000 },
      ),
      field("type", "Work type", "工作类型", t.type, "select", {
        choices: Object.entries(types).map(([k, l]) => [k, tr(...l)]),
      }),
      qField(t.questionId),
      field("status", "Status", "状态", t.status, "select", {
        choices: Object.entries(statuses).map(([k, l]) => [k, tr(...l)]),
      }),
      field(
        "deadline",
        "Deadline (optional)",
        "截止日期（可选）",
        t.deadline,
        "input",
        { type: "date" },
      ),
    );
    const hours = el("div", undefined, "field-row");
    hours.append(
      field(
        "estimateHours",
        "Estimated hours",
        "预计工时",
        t.estimateHours,
        "input",
        { type: "number", min: 0, maxNumber: 1000, step: 0.25, required: true },
      ),
      field(
        "actualHours",
        "Hours already logged",
        "已投入工时",
        t.actualHours,
        "input",
        { type: "number", min: 0, maxNumber: 1000, step: 0.25, required: true },
      ),
    );
    fields.append(
      hours,
      field(
        "dependsOn",
        "Prerequisites (Ctrl / Cmd to select several)",
        "前置任务（按 Ctrl / Cmd 多选）",
        t.dependsOn,
        "select",
        {
          multiple: true,
          choices: state.tasks
            .filter((x) => x.id !== t.id)
            .map((x) => [x.id, x.title]),
        },
      ),
      field(
        "artifact",
        "Artifact / evidence link (optional)",
        "成果 / 证据链接（可选）",
        t.artifact,
        "input",
        { type: "url", max: 4000 },
      ),
      field(
        "notes",
        "Notes / evidence trail",
        "笔记 / 证据记录",
        t.notes,
        "textarea",
      ),
    );
  }
  if (kind === "question") {
    const q = item || { text: "", lens: "", notes: "" };
    fields.append(
      field("text", "Research question", "研究问题", q.text, "textarea", {
        required: true,
        max: 1000,
      }),
      field(
        "lens",
        "Research lens / theme",
        "研究视角 / 主题",
        q.lens,
        "input",
        { max: 200 },
      ),
      field(
        "notes",
        "Scope, jurisdiction, and open questions",
        "范围、法域与待解决问题",
        q.notes,
        "textarea",
      ),
    );
  }
  if (kind === "review") {
    const r = item || { date: today(), progress: "", obstacles: "", next: "" };
    fields.append(
      field("date", "Review date", "回顾日期", r.date, "input", {
        type: "date",
        required: true,
      }),
      field(
        "progress",
        "What moved forward? What did you learn?",
        "有哪些进展？理解发生了什么变化？",
        r.progress,
        "textarea",
      ),
      field(
        "obstacles",
        "Uncertainty, contradictory evidence, obstacles",
        "不确定性、相反证据与障碍",
        r.obstacles,
        "textarea",
      ),
      field(
        "next",
        "Concrete next steps",
        "下一步具体行动",
        r.next,
        "textarea",
      ),
    );
  }
  if (kind === "experiment") {
    const e = item || {
      title: "",
      questionId: "",
      model: "",
      dataset: "",
      baseline: "",
      metrics: "",
      observation: "",
      artifact: "",
      createdAt: today(),
    };
    fields.append(
      field(
        "title",
        "Experiment / audit title",
        "实验 / 核验题目",
        e.title,
        "input",
        { required: true, max: 1000 },
      ),
      qField(e.questionId),
      field("createdAt", "Record date", "记录日期", e.createdAt, "input", {
        type: "date",
        required: true,
      }),
      field(
        "model",
        "Model name, version, or deterministic method",
        "模型名称、版本或确定性方法",
        e.model,
        "input",
        { max: 500 },
      ),
      field(
        "dataset",
        "Dataset, version, provenance, and sampling",
        "数据集、版本、来源与抽样",
        e.dataset,
        "textarea",
        { max: 4000 },
      ),
      field(
        "baseline",
        "Baseline and comparison setup",
        "基线与对照设置",
        e.baseline,
        "textarea",
        { max: 4000 },
      ),
      field(
        "metrics",
        "Metrics, sample size, and results",
        "指标、样本量与结果",
        e.metrics,
        "textarea",
        { max: 4000 },
      ),
      field(
        "observation",
        "Observations, errors, and limitations",
        "观察结果、误差与局限",
        e.observation,
        "textarea",
      ),
      field(
        "artifact",
        "Reproducible artifact link",
        "可复现成果链接",
        e.artifact,
        "input",
        { type: "url", max: 4000 },
      ),
    );
  }
  $("editor").showModal();
  fields.querySelector("input,textarea,select")?.focus();
}
function closeEditor() {
  const recordId = editing?.id;
  $("editor").close();
  if (lastFocus?.isConnected) lastFocus.focus();
  else if (recordId) {
    const card = document.querySelector(`[data-record-id="${recordId}"]`);
    card?.querySelector("button")?.focus();
  } else $("add-task").focus();
  editing = null;
}
$("editor").addEventListener("cancel", () => {
  lastFocus?.focus();
  editing = null;
});
$("editor-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const c = structuredClone(state),
    kind = editing.kind,
    collection = {
      task: "tasks",
      question: "questions",
      review: "reviews",
      experiment: "experiments",
    }[kind];
  let record = { id: editing.id || uid(), ...data };
  if (kind === "task") {
    record.estimateHours = Number(data.estimateHours);
    record.actualHours = Number(data.actualHours);
    record.dependsOn = Array.from(
      $("field-dependsOn").selectedOptions,
      (o) => o.value,
    );
  }
  const index = c[collection].findIndex((r) => r.id === record.id);
  if (index < 0) c[collection].push(record);
  else c[collection][index] = record;
  try {
    const checked = validateState(c);
    if (commit(checked, tr("Saved in this browser.", "已保存在当前浏览器。")))
      closeEditor();
  } catch (e) {
    $("editor-error").textContent = e.message;
  }
});
function remove(kind, id) {
  if (
    !confirm(
      tr(
        "Remove this record? Dependencies and question links will be detached where necessary.",
        "删除这条记录？相关前置任务与研究问题关联会解除。",
      ),
    )
  )
    return;
  const c = structuredClone(state),
    collection = {
      task: "tasks",
      question: "questions",
      review: "reviews",
      experiment: "experiments",
    }[kind];
  c[collection] = c[collection].filter((r) => r.id !== id);
  if (kind === "task")
    c.tasks.forEach((t) => (t.dependsOn = t.dependsOn.filter((d) => d !== id)));
  if (kind === "question") {
    c.tasks.forEach((t) => {
      if (t.questionId === id) t.questionId = "";
    });
    c.experiments.forEach((e) => {
      if (e.questionId === id) e.questionId = "";
    });
  }
  commit(c, tr("Record removed.", "已删除记录。"));
}
function download(name, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$("language").addEventListener("click", () => {
  lang = lang === "en" ? "zh" : "en";
  render();
});
$("view-tabs").addEventListener("click", (event) => {
  const b = event.target.closest("[data-view]");
  if (b) setView(b.dataset.view);
});
["search", "status-filter", "type-filter"].forEach((id) =>
  $(id).addEventListener("input", () => renderTasks(forecast(state))),
);
["task", "question", "experiment", "review"].forEach((kind) =>
  $("add-" + kind).addEventListener("click", () => openEditor(kind)),
);
$("close-editor").addEventListener("click", closeEditor);
$("cancel-editor").addEventListener("click", closeEditor);
$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const c = structuredClone(state);
  c.settings = {
    startDate: $("start-date").value,
    dailyHours: Number($("daily-hours").value),
    workDays: Array.from($("weekdays").querySelectorAll("input:checked"), (x) =>
      Number(x.value),
    ),
  };
  commit(c, tr("Forecast updated.", "已更新预测。"));
});
$("load-template").addEventListener("click", () => {
  if (
    state.tasks.length ||
    state.questions.length ||
    state.experiments.length ||
    state.reviews.length
  ) {
    if (
      !confirm(
        tr(
          "Replace this workspace with an illustrative plan? Export your backup first.",
          "用示例计划替换当前工作区？请先导出已有记录。",
        ),
      )
    )
      return;
  }
  commit(
    template(state.settings.startDate),
    tr(
      "Example loaded. Edit it to match your research.",
      "示例已载入，请按实际研究修改。",
    ),
  );
});
$("export-recovery").addEventListener("click", () => {
  if (unreadableStoredRaw)
    download(
      `research-roadmap-recovery-${today()}.json`,
      unreadableStoredRaw,
      "application/json",
    );
});
$("export-json").addEventListener("click", () =>
  download(
    `research-roadmap-${today()}.json`,
    unreadableStoredRaw || JSON.stringify(state, null, 2),
    "application/json",
  ),
);
$("export-markdown").addEventListener("click", () =>
  download(`research-roadmap-${today()}.md`, exportMarkdown(state)),
);
$("export-csv").addEventListener("click", () =>
  download(
    `research-roadmap-${today()}.csv`,
    exportCsv(state),
    "text/csv;charset=utf-8",
  ),
);
$("export-calendar").addEventListener("click", () =>
  download(
    "research-deadlines.ics",
    exportCalendar(state),
    "text/calendar;charset=utf-8",
  ),
);
$("import-button").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Maximum JSON file size is 5 MB");
    const input = JSON.parse(await file.text());
    if (input.format === "law-ai-reading-list") {
      const c = importReadingList(state, input);
      if (
        confirm(
          tr(
            `Add ${input.papers.length} reading task(s)?`,
            `新增 ${input.papers.length} 个阅读任务？`,
          ),
        )
      )
        commit(c, tr("Reading list added.", "已导入阅读清单。"));
    } else {
      const c = validateState(input);
      if (
        confirm(
          tr(
            "Replace the current roadmap with this validated backup?",
            "用此已校验备份替换当前路线图？",
          ),
        )
      )
        commit(c, tr("Backup restored.", "已恢复备份。"), true);
    }
  } catch (e) {
    notify(
      `${tr("Import rejected; current work kept", "导入失败，已保留原有记录")}: ${e.message}`,
    );
  } finally {
    event.target.value = "";
  }
});
$("clear-workspace").addEventListener("click", () => {
  if (
    confirm(
      tr(
        "Clear all research questions, tasks, experiments, and reflections? Export a backup first.",
        "清空所有研究问题、任务、实验与回顾？请先导出备份。",
      ),
    )
  )
    commit(blankState(), tr("Workspace cleared.", "已清空工作区。"), true);
});
render();
