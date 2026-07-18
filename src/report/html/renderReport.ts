import { createTwoFilesPatch } from "diff";
import { html as renderDiffHtml } from "diff2html";
import { EXCLUDED, NOT_DEPLOYED } from "../../mapper/specialValues/specialValues.js";
import { ENVIRONMENTS, type EnvironmentName } from "../../shared/environment.js";
import {
  buildAttentionShortlist,
  diffId,
  stableRowId,
  type EnvironmentState,
  type MappedStackInstance,
  type ReportStatus,
  type StackComparisonReport,
  type StackDiff,
} from "../../stacks/stackComparison/stackComparison.js";

/** Statuses shown in the filter control. `unavailable` is omitted — auth failures fail the report. */
const FILTER_STATUSES = ["current", "outdated", "not_deployed", "excluded"] as const;

const STATUS_LABELS: Record<ReportStatus, string> = {
  current: "Current",
  outdated: "Outdated",
  not_deployed: "Not deployed",
  excluded: "Excluded",
  unavailable: "Unavailable",
};
const ENVIRONMENT_LABELS: Record<EnvironmentName, string> = {
  dev: "Dev",
  test: "Test",
  prod: "Prod",
};

export interface RenderReportAssets {
  reportCss: string;
  diffCss: string;
}

export interface RenderReportOptions {
  assets: RenderReportAssets;
  outputPath: string;
  outputFileUri: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value?: string): string {
  if (!value) return "No activity recorded";
  return `${new Date(value).toISOString().replace("T", " ").replace(/:\d\d\.\d+Z$/, "").replace(/Z$/, "")} UTC`;
}

function isoAttr(value?: string): string {
  return value ? ` datetime="${escapeHtml(value)}"` : "";
}

/** Attention severity, lower is more urgent. */
function severity(status: ReportStatus, newerSide?: string): number {
  if (status === "not_deployed") return 0;
  if (status === "outdated" && newerSide === "target") return 1;
  if (status === "outdated") return 2;
  return 9;
}

function instanceSeverity(instance: MappedStackInstance): number {
  return Math.min(
    9,
    ...ENVIRONMENTS.map((environment) => {
      const state = instance.environments[environment];
      const diff = instance.diffs.find((candidate) => candidate.toEnv === environment);
      return severity(state.status, diff?.newerSide);
    }),
  );
}

function attentionSorted(instances: readonly MappedStackInstance[]): MappedStackInstance[] {
  return [...instances].sort(
    (left, right) =>
      instanceSeverity(left) - instanceSeverity(right) ||
      left.templateName.localeCompare(right.templateName) ||
      left.instanceId.localeCompare(right.instanceId),
  );
}

function renderCell(instance: MappedStackInstance, environment: EnvironmentName): string {
  const state: EnvironmentState = instance.environments[environment];
  const rowId = stableRowId(instance);
  const diff = instance.diffs.find((candidate) => candidate.toEnv === environment);
  const title = [
    state.shortHash ? `hash ${state.shortHash}` : null,
    state.lastActivity ? `updated ${formatTime(state.lastActivity)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const diffControl =
    state.status === "outdated" && diff
      ? `<a class="diff-link" href="#${diffId(rowId, diff.fromEnv, diff.toEnv)}" data-diff-open="${diffId(rowId, diff.fromEnv, diff.toEnv)}">View diff</a>`
      : "";

  const showStackName =
    state.status !== "excluded" &&
    state.stackName !== EXCLUDED &&
    state.stackName !== NOT_DEPLOYED;

  const stackName = showStackName
    ? `<code class="cell-stack"${title ? ` title="${escapeHtml(title)}"` : ""}>${escapeHtml(state.stackName)}</code>`
    : "";

  const activity = state.lastActivity
    ? `<span class="cell-activity"><span class="activity-label">Last activity</span> <time${isoAttr(state.lastActivity)}>${escapeHtml(formatTime(state.lastActivity))}</time></span>`
    : "";

  return `<td class="cell status-${state.status}">
    ${stackName}
    <span class="status-chip"><span class="dot" aria-hidden="true"></span>${STATUS_LABELS[state.status]}</span>
    ${diffControl}
    ${activity}
  </td>`;
}

function renderRow(instance: MappedStackInstance): string {
  const rowId = stableRowId(instance);
  const needsAction = ENVIRONMENTS.some((environment) => {
    const status = instance.environments[environment].status;
    return status === "outdated" || status === "not_deployed";
  });
  const searchText = [
    instance.templateName,
    instance.instanceId,
    ...ENVIRONMENTS.map((environment) => instance.environments[environment].stackName),
  ]
    .join(" ")
    .toLocaleLowerCase();
  const statusData = ENVIRONMENTS.map(
    (environment) => `${environment}:${instance.environments[environment].status}`,
  ).join(" ");

  return `<tr class="mapped-row${needsAction ? " row-attention" : ""}" id="${rowId}" data-report-row data-attention="${needsAction ? "1" : "0"}" data-search="${escapeHtml(searchText)}" data-statuses="${escapeHtml(statusData)}">
    <th scope="row" class="identity">
      <span class="tpl">${escapeHtml(instance.templateName)}</span>
      <code class="inst">${escapeHtml(instance.instanceId)}</code>
      ${needsAction ? `<span class="needs-label">Needs action</span>` : ""}
    </th>
    ${renderCell(instance, "dev")}
    ${renderCell(instance, "test")}
    ${renderCell(instance, "prod")}
  </tr>`;
}

function renderDiffLayer(instance: MappedStackInstance, diff: StackDiff): string {
  const rowId = stableRowId(instance);
  const id = diffId(rowId, diff.fromEnv, diff.toEnv);
  const fromLabel = ENVIRONMENT_LABELS[diff.fromEnv];
  const toLabel = ENVIRONMENT_LABELS[diff.toEnv];
  const flow = `${fromLabel} → ${toLabel}`;
  const stacks = `${escapeHtml(diff.sourceStackName)} → ${escapeHtml(diff.targetStackName)}`;
  const targetNewer =
    diff.newerSide === "target"
      ? `<p class="target-newer">Target is newer; review before promotion.</p>`
      : "";

  const patch = createTwoFilesPatch(
    flow,
    flow,
    diff.targetTemplate,
    diff.sourceTemplate,
    "",
    "",
    { context: 5 },
  );
  const sideBySide = renderDiffHtml(patch, { drawFileList: false, matching: "lines", outputFormat: "side-by-side" });
  const lineByLine = renderDiffHtml(patch, { drawFileList: false, matching: "lines", outputFormat: "line-by-line" });
  const body = `${targetNewer}
    <p class="diff-orientation">Left: ${toLabel} (current). Right: ${fromLabel} (proposed for promotion).</p>
    <div class="diff-wide">${sideBySide}</div>
    <div class="diff-narrow">${lineByLine}</div>`;

  return `<div class="diff-layer" id="${id}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="${id}-title" data-return="${rowId}">
    <a class="diff-scrim" href="#matrix" data-diff-close aria-label="Close diff" tabindex="-1"></a>
    <div class="diff-panel">
      <div class="diff-panel-head">
        <div>
          <h3 id="${id}-title">${escapeHtml(flow)}</h3>
          <p class="diff-stacks"><code>${stacks}</code></p>
        </div>
        <a class="diff-close" href="#matrix" data-diff-close>Close</a>
      </div>
      <div class="diff-panel-body">${body}</div>
    </div>
  </div>`;
}

function renderFilters(total: number): string {
  return `<div class="filters" role="search" aria-label="Filter mapped stacks">
    <input type="search" id="stack-search" class="filter-search" placeholder="Search template, instance, or stack name" aria-label="Search mapped stacks" autocomplete="off">
    <select id="status-filter" aria-label="Filter by status">
      <option value="">All statuses</option>
      ${FILTER_STATUSES.map((value) => `<option value="${value}">${STATUS_LABELS[value]}</option>`).join("")}
    </select>
    <label class="toggle"><input type="checkbox" id="attention-filter"> Needs action only</label>
    <button type="button" id="clear-filters">Clear</button>
    <span id="filter-result" class="filter-result" aria-live="polite">Showing ${total} of ${total}</span>
  </div>`;
}

function renderIgnored(report: StackComparisonReport): string {
  const stacks = [...report.unmappedStacks].sort(
    (left, right) =>
      ENVIRONMENTS.indexOf(left.environment) - ENVIRONMENTS.indexOf(right.environment) ||
      left.stackName.localeCompare(right.stackName),
  );
  const body =
    stacks.length === 0
      ? `<p class="empty-inline">No ignored stacks found.</p>`
      : `<div class="ignored-toolbar">
          <label>
            <span class="visually-hidden">Filter ignored stacks by environment</span>
            <select id="ignored-env-filter" aria-label="Filter ignored stacks by environment">
              <option value="">All environments</option>
              <option value="dev">Dev</option>
              <option value="test">Test</option>
              <option value="prod">Prod</option>
            </select>
          </label>
          <span id="ignored-filter-result" class="filter-result" aria-live="polite">Showing ${stacks.length} of ${stacks.length}</span>
        </div>
        <div class="table-scroll table-scroll-static">
          <table class="ignored-table">
            <caption>Stacks present in AWS but not tracked for promotion</caption>
            <thead><tr><th scope="col">Environment</th><th scope="col">Stack</th><th scope="col">CloudFormation status</th><th scope="col">Last activity</th></tr></thead>
            <tbody>${stacks
              .map(
                (stack) =>
                  `<tr data-ignored-row data-env="${stack.environment}">
                    <td class="env-name">${ENVIRONMENT_LABELS[stack.environment]}</td>
                    <td><code>${escapeHtml(stack.stackName)}</code></td>
                    <td>${escapeHtml(stack.cloudFormationStatus)}</td>
                    <td class="activity-cell"><span class="activity-label">Last activity</span> <time${isoAttr(stack.lastActivity)}>${escapeHtml(formatTime(stack.lastActivity))}</time></td>
                  </tr>`,
              )
              .join("")}</tbody>
          </table>
        </div>
        <p class="empty-inline" id="ignored-empty" hidden>No ignored stacks in this environment.</p>`;

  return `<div class="section-head">
      <h2 id="ignored-heading">Ignored stacks</h2>
      <p class="section-intro">These stacks exist in AWS but are not tracked for promotion — they are outside the mapper, so PromoteOps does not compare or promote them.</p>
    </div>
    ${body}`;
}

function renderScript(): string {
  return `<script>
(() => {
  const rows = [...document.querySelectorAll("[data-report-row]")];
  const search = document.querySelector("#stack-search");
  const status = document.querySelector("#status-filter");
  const attention = document.querySelector("#attention-filter");
  const result = document.querySelector("#filter-result");
  const empty = document.querySelector("#matrix-empty");
  const ignoredRows = [...document.querySelectorAll("[data-ignored-row]")];
  const ignoredEnv = document.querySelector("#ignored-env-filter");
  const ignoredResult = document.querySelector("#ignored-filter-result");
  const ignoredEmpty = document.querySelector("#ignored-empty");
  let scrollLockY = 0;

  const clearLocationHash = () => {
    history.replaceState(null, "", location.pathname + location.search);
  };

  const apply = () => {
    const term = search.value.trim().toLocaleLowerCase();
    let shown = 0;
    rows.forEach((row) => {
      const statuses = row.dataset.statuses.split(" ");
      const statusMatch = !status.value || statuses.some((item) => item.endsWith(":" + status.value));
      const attentionMatch = !attention.checked || row.dataset.attention === "1";
      const visible = (!term || row.dataset.search.includes(term)) && statusMatch && attentionMatch;
      row.hidden = !visible;
      if (visible) shown += 1;
    });
    result.textContent = "Showing " + shown + " of " + rows.length;
    empty.hidden = shown !== 0;
  };

  const applyIgnored = () => {
    if (!ignoredEnv) return;
    let shown = 0;
    ignoredRows.forEach((row) => {
      const visible = !ignoredEnv.value || row.dataset.env === ignoredEnv.value;
      row.hidden = !visible;
      if (visible) shown += 1;
    });
    if (ignoredResult) ignoredResult.textContent = "Showing " + shown + " of " + ignoredRows.length;
    if (ignoredEmpty) ignoredEmpty.hidden = shown !== 0;
  };

  const openDrawer = (id) => {
    const layer = document.getElementById(id);
    if (!layer) return;
    document.querySelectorAll(".diff-layer.is-open").forEach((el) => el.classList.remove("is-open"));
    if (!document.body.classList.contains("drawer-open")) {
      scrollLockY = window.scrollY;
      document.body.style.top = "-" + scrollLockY + "px";
      document.body.classList.add("drawer-open");
    }
    layer.classList.add("is-open");
    history.replaceState(null, "", "#" + id);
    const closeBtn = layer.querySelector(".diff-close");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  };

  const closeDrawer = () => {
    document.querySelectorAll(".diff-layer.is-open").forEach((el) => el.classList.remove("is-open"));
    if (document.body.classList.contains("drawer-open")) {
      document.body.classList.remove("drawer-open");
      document.body.style.top = "";
      window.scrollTo(0, scrollLockY);
    }
    clearLocationHash();
  };

  [search, status].forEach((control) => control.addEventListener("input", apply));
  attention.addEventListener("change", apply);
  document.querySelector("#clear-filters").addEventListener("click", () => {
    search.value = "";
    status.value = "";
    attention.checked = false;
    apply();
    search.focus();
  });
  if (ignoredEnv) ignoredEnv.addEventListener("input", applyIgnored);

  document.addEventListener("click", (event) => {
    const openLink = event.target.closest("[data-diff-open]");
    if (openLink) {
      event.preventDefault();
      openDrawer(openLink.getAttribute("data-diff-open"));
      return;
    }
    if (event.target.closest("[data-diff-close]")) {
      event.preventDefault();
      closeDrawer();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector(".diff-layer.is-open")) {
      event.preventDefault();
      closeDrawer();
    }
  });

  if (location.hash.startsWith("#stack-") && location.hash.includes("-diff-")) {
    const id = location.hash.slice(1);
    if (document.getElementById(id)) openDrawer(id);
  }
})();
</script>`;
}

/** Renders the portable, self-contained operations report. */
export function renderReport(report: StackComparisonReport, options: RenderReportOptions): string {
  const generatedAt = formatTime(report.generatedAt);
  const ordered = attentionSorted(report.mappedInstances);
  const needsAction = buildAttentionShortlist(report).length;
  const rows = ordered.map(renderRow).join("");
  const diffLayers = ordered
    .flatMap((instance) =>
      instance.diffs
        .filter((diff) => instance.environments[diff.toEnv].status === "outdated")
        .map((diff) => renderDiffLayer(instance, diff)),
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>PromoteOps stack report — ${escapeHtml(generatedAt)}</title>
  <style>${options.assets.diffCss}\n${options.assets.reportCss}</style>
</head>
<body>
  <a class="skip-link" href="#matrix">Skip to stack matrix</a>
  <header class="report-header">
    <div class="header-inner">
      <div class="header-top">
        <div class="header-id">
          <h1 class="product-mark">PromoteOps</h1>
          <p class="report-subtitle">Stack report</p>
        </div>
        <dl class="report-meta">
          <div><dt>Generated</dt><dd><time${isoAttr(report.generatedAt)}>${escapeHtml(generatedAt)}</time></dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(report.source)}</dd></div>
          <div><dt>Region</dt><dd>${escapeHtml(report.region)}</dd></div>
          <div><dt>Flow</dt><dd>Dev → Test → Prod</dd></div>
        </dl>
      </div>
      <p class="summary-line">
        <span class="attention-metric${needsAction > 0 ? " is-active" : ""}"><strong>${needsAction}</strong> need action</span>
      </p>
    </div>
  </header>
  <main>
    <section id="matrix" aria-labelledby="matrix-heading">
      <div class="section-head">
        <h2 id="matrix-heading">Mapped stacks</h2>
        <p class="section-intro">Sorted with anything needing action first. Content hashes decide equality; timestamps only show which side is newer.</p>
      </div>
      ${renderFilters(report.mappedInstances.length)}
      <div class="table-scroll" tabindex="0" aria-label="Scrollable mapped stack matrix">
        <table class="matrix">
          <caption>Mapped CloudFormation stacks by environment</caption>
          <thead><tr><th scope="col">Template / Instance</th><th scope="col">Dev</th><th scope="col">Test</th><th scope="col">Prod</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="empty-state" id="matrix-empty" hidden><strong>No mapped stacks match these filters.</strong><p>Clear filters or broaden your search.</p></div>
    </section>
    <section class="ignored-section" aria-labelledby="ignored-heading">
      ${renderIgnored(report)}
    </section>
    <details class="methodology">
      <summary>How to read this report</summary>
      <div class="methodology-body">
        <p><strong>Equality:</strong> normalized template content and SHA-256 hashes determine whether a target is current.</p>
        <p><strong>Recency:</strong> CloudFormation activity timestamps identify the newer side; they never override content equality.</p>
        <p><strong>File:</strong> <code>${escapeHtml(options.outputPath)}</code> — <a href="${escapeHtml(options.outputFileUri)}">open this report</a></p>
      </div>
    </details>
  </main>
  <footer>Generated locally by PromoteOps · No runtime network requests</footer>
  <noscript><div class="noscript-note">JavaScript is disabled. All rows and diffs remain available; filters are inactive.</div></noscript>
  ${diffLayers}
  ${renderScript()}
</body>
</html>`;
}
