# Scheduling, provenance, and reproducibility

## Research objects

The version 1 backup has the identifier `law-ai-roadmap`, a settings object, and four collections: questions, tasks, experiments, and reflections. Tasks and experiments may reference an existing question. Tasks may reference existing prerequisite tasks. Identifiers, enumeration values, URLs, dates, numeric bounds, collection sizes, and graph integrity are checked before accepting a backup.

Research task completion is a user judgment. The interface flags a completed task without an artifact link but does not require researchers to publish private work. An artifact link points to a file, repository, source, or report of the user's choice; the tool does not inspect it.

## Forecast

1. Start on the later of the configured date and the current local calendar date.
2. Treat completed tasks as satisfied prerequisites.
3. Among remaining tasks with satisfied predecessors, choose the earliest deadline. Tasks without deadlines sort last. Title order breaks ties.
4. Allocate `max(0, estimated hours − logged hours)` into a single person's daily capacity, skipping nonworking days.
5. Mark the allocated task satisfied for forecasting and continue.
6. Compare the forecast finish with its deadline; report late tasks and bound allocation to two years. If any work cannot be fully scheduled, retain the full remaining workload and report the finish as beyond the forecast horizon, rather than displaying a completion date.

This serial heuristic has no claim of optimality. It assumes an estimate is the total expected workload and logged hours are already spent, without automatically interpreting them as intellectual progress. Deadline changes, missing legal materials, revisions, and interruptions can invalidate an estimate. Update them as research develops.

Dates use calendar values and UTC midday arithmetic internally, avoiding daylight-saving or midnight rollover errors. The interface's current date is the browser's local calendar date. The all-day calendar format exports `DTSTART` and exclusive next-day `DTEND`, not appointments at a guessed timezone. Chinese/English text is folded by UTF-8 byte length for calendar interoperability.

## Reading-list interoperability

`04-literature-library` exports metadata with `format: "law-ai-reading-list"`, `version: 1`, and `papers`. Each paper becomes a new reading task. Authors, year, journal, keywords, themes, and abstract are retained as notes; the source URL or DOI resolver is retained as a link. Default estimates are 2 hours and should be edited. Original files remain in the Library and are not duplicated into the planner.

## Experiments

An experiment record should identify a research question, sampling decisions, a dataset version, model or method version, a comparison baseline, metrics, observed results, errors, and an artifact. A favorable benchmark score does not itself establish a legal conclusion. Keep normative arguments and measurement claims separately supported in the linked artifact.

The planner records information supplied by its user. It performs no inference and does not authenticate supplied results. Its role in a Law × AI portfolio is transparent research organization and reproducibility.

## Validation and persistence

Imports are capped at 5 MB. Core collections and field lengths are bounded. State is normalized and validated without mutating the current workspace. Browser storage must succeed before the new state becomes active. Import rejection and storage failure preserve the previous data. Broken or older stored data is preserved verbatim at startup. A persistent recovery panel exports its raw JSON; ordinary edits and examples are blocked from overwriting it. Only an explicitly confirmed valid backup restore or workspace clear releases that protection. User-entered calendar dates are restricted to 1900–2199 to keep arithmetic and exports representable.

CSV cells escape double quotes and prefix formula-like text. Source URLs are restricted to HTTP(S); UI content is assigned with DOM text nodes rather than interpreted as HTML. Calendar and Markdown exports preserve user notes, so researchers should review the exported content before sharing it.

## 中文要点

排期将未完成任务按前置依赖和截止日期安排到可研究日期，消耗剩余估计工时。它是启发式预测，并不保证最优，也不判断研究质量。实验记录保留用户填写的方法与结果，不自行核实其真实性。所有导入先校验后保存；保存失败时保留已有记录。
