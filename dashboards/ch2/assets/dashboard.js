import {
  initialState,
  clone,
  manualFilter,
  selectOrganizations,
  clearChart,
  viewData,
} from "./model.mjs";

const $ = (id) => document.getElementById(id),
  RC = window.ReportCharts,
  E = window.echarts;
const C = RC?.colors,
  charts = {},
  selections = {};
const organizationColors = {
  Amazon: "#758F73",
  "Alphabet / Google": "#70869A",
  Meta: "#A37462",
  Microsoft: "#867895",
  NVIDIA: "#9B8C51",
  "Alibaba / Qwen": "#568A8E",
  OpenAI: "#E63946",
  Anthropic: "#FB8C00",
  "xAI": "#1E88E5",
  "Mistral AI": "#43A047",
  "Z.ai": "#8E24AA",
};
let data,
  state,
  views,
  ignoreClickUntil = 0;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (v, d = 1) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const compact = (v) =>
  Math.abs(v) >= 1000 ? `${num(v / 1000, 1)}k` : num(v, 0);
const color = (name) => organizationColors[name] || RC.orgColor(name),
  opacity = (name) => (state.organizations.includes(name) ? 1 : 0.2);
const names = (rows) =>
  data.entities.filter((name) => rows.some((r) => r.org === name));
const years = () =>
  Array.from(
    { length: state.years[1] - state.years[0] + 1 },
    (_, i) => state.years[0] + i,
  );
const withinDate = () => ({
  min: `${state.years[0]}-01-01T00:00:00Z`,
  max: `${state.years[1]}-12-31T23:59:59Z`,
});
const utcDate = (date) => date + "T00:00:00Z";
const xAxis = (gridIndex = 0) => ({
  gridIndex,
  type: "time",
  ...withinDate(),
  minInterval: 31536000000,
  axisLabel: {
    fontSize: 11,
    formatter: (value) => String(new Date(value).getUTCFullYear()),
  },
  splitLine: { show: false },
});
const yAxis = (gridIndex = 0) => ({
  gridIndex,
  type: "value",
  axisLabel: { fontSize: 11, formatter: compact },
  splitLine: { lineStyle: { color: C.grid } },
  axisLine: { show: false },
});
const labelTitle = (text, left, top) => ({
  text,
  left,
  top,
  textAlign: "center",
  textStyle: {
    fontFamily: RC.font,
    fontSize: 11,
    fontWeight: 500,
    color: C.ink,
  },
});
function base() {
  return {
    animation: false,
    useUTC: true,
    textStyle: { fontFamily: RC.font, color: C.ink },
    tooltip: {
      trigger: "item",
      confine: true,
      appendToBody: true,
      formatter: tooltip,
    },
    series: [],
  };
}
function empty(message) {
  return {
    type: "text",
    left: "center",
    top: "middle",
    style: {
      text: message,
      fill: C.muted,
      font: `12px ${RC.font}`,
      textAlign: "center",
      lineHeight: 18,
    },
  };
}
function tooltip(p) {
  const r = p.data;
  if (!r?.org) return "";
  const title = `<b>${esc(r.org)}</b><br>`;
  if (r.metric === "market")
    return (
      title +
      `${esc(r.date)}<br>Market cap: $${num(r.amount)}B<br>Shares reported on ${esc(r.shareDate)}: ${num(r.sharesBn, 2)}B`
    );
  if (r.metric === "revenue")
    return (
      title +
      `Fiscal year-end: ${r.year}<br>Revenue: $${num(r.amount)}B<br>Period: ${esc(r.start)} to ${esc(r.end)}`
    );
  if (r.metric === "marketShare" || r.metric === "revenueShare")
    return (
      title +
      (r.metric === "marketShare"
        ? `${r.year}<br>Market cap`
        : `Fiscal year-end: ${r.year}<br>Revenue`) +
      `: $${num(r.amount)}B<br>Share of all listed companies shown: ${num(r.share)}%`
    );
  if (r.metric === "lab")
    return (
      title +
      `Reported: ${esc(r.date)}<br>Annualized revenue run rate: $${num(r.amount, 2)}B`
    );
  if (r.metric === "tile")
    return title + `${esc(r.description)}<br>Revenue: $${num(r.amount, 2)}B`;
  if (r.metric === "publication")
    return (
      title +
      `${r.year}: ${num(r.amount, 0)} ETO-recorded publications<br>Source status: ${r.complete ? "Complete" : "Incomplete"}`
    );
  return title;
}
function legend(id, organizations) {
  $(id).innerHTML = organizations
    .map(
      (name) =>
        `<span class="legend-item" style="opacity:${opacity(name)}"><i class="legend-swatch" style="background:${color(name)}"></i>${esc(name)}</span>`,
    )
    .join("");
}
function apply(id, option, points = []) {
  selections[id] = points;
  charts[id].setOption(option, { notMerge: true, lazyUpdate: false });
}
function line(org, rows, x, metric, index = 0) {
  return {
    id: `${metric}-${org}`,
    name: org,
    type: "line",
    xAxisIndex: index,
    yAxisIndex: index,
    showSymbol: true,
    symbol: "circle",
    symbolSize: 5,
    connectNulls: false,
    lineStyle: { color: color(org), width: 2.2, opacity: opacity(org) },
    itemStyle: { color: color(org), opacity: opacity(org) },
    data: [...rows]
      .sort((a, b) => String(x(a)).localeCompare(String(x(b))))
      .map((r) => ({
        ...r,
        org,
        amount: r.value,
        metric,
        value: [x(r), r.value],
      })),
    emphasis: { focus: "series" },
  };
}
function renderScale() {
  const id = "scale-graph",
    o = base(),
    visibleNames = names([...views.market, ...views.revenue]);
  if (
    !state.retain &&
    !state.organizations.some((n) => data.groups["Big companies"].includes(n))
  ) {
    apply(id, {
      ...o,
      graphic: [
        empty(
          "Scale Change shows public-company data.\nSelect a Big company or keep unselected data to compare.",
        ),
      ],
    });
    legend("scale-legend", []);
    return;
  }
  o.title = [
    labelTitle("a. Market cap · USD bn", "25.5%", 4),
    labelTitle("b. Revenue · USD bn", "79%", 4),
    labelTitle("c. Market cap share", "25.5%", "53%"),
    labelTitle("d. Revenue share", "79%", "53%"),
  ];
  o.grid = [
    { left: 46, right: "54%", top: 32, height: "40%", containLabel: false },
    { left: "59%", right: 10, top: 32, height: "40%" },
    { left: 46, right: "54%", top: "60%", bottom: 32 },
    { left: "59%", right: 10, top: "60%", bottom: 32 },
  ];
  o.xAxis = [
    xAxis(0),
    {
      gridIndex: 1,
      type: "category",
      data: years().map(String),
      axisLabel: { fontSize: 11 },
      boundaryGap: false,
    },
    ...[2, 3].map((gridIndex) => ({
      gridIndex,
      type: "category",
      data: years().map(String),
      axisLabel: { fontSize: 11 },
    })),
  ];
  o.yAxis = [
    yAxis(0),
    yAxis(1),
    ...[2, 3].map((index) => ({
      ...yAxis(index),
      min: 0,
      max: 100,
      axisLabel: { fontSize: 11, formatter: (v) => `${v}%` },
    })),
  ];
  const points = [];
  visibleNames.forEach((org) => {
    for (const [rows, x, metric, index] of [
      [views.market, (r) => utcDate(r.date), "market", 0],
      [views.revenue, (r) => String(r.year), "revenue", 1],
    ]) {
      const subset = rows.filter((r) => r.org === org);
      if (!subset.length) continue;
      o.series.push(line(org, subset, x, metric, index));
      subset.forEach((r) =>
        points.push({ org, axis: index, point: [x(r), r.value] }),
      );
    }
  });
  for (const [rows, index, metric] of [
    [views.marketShare, 2, "marketShare"],
    [views.revenueShare, 3, "revenueShare"],
  ]) {
    const cumulative = new Map();
    names(rows).forEach((org) => {
      const subset = rows.filter((r) => r.org === org),
        series = {
          id: `${metric}-${org}`,
          name: org,
          type: "bar",
          stack: metric,
          xAxisIndex: index,
          yAxisIndex: index,
          barMaxWidth: 42,
          itemStyle: { color: color(org), opacity: opacity(org) },
          emphasis: { focus: "series" },
          data: [],
        };
      years().forEach((year) => {
        const r = subset.find((r) => r.year === year);
        if (!r) {
          series.data.push([String(year), null]);
          return;
        }
        const floor = cumulative.get(year) || 0;
        cumulative.set(year, floor + r.share);
        points.push({
          org,
          axis: index,
          point: [String(year), floor + r.share / 2],
          bar: true,
        });
        series.data.push({
          ...r,
          org,
          amount: r.value,
          metric,
          value: [String(year), r.share],
        });
      });
      o.series.push(series);
    });
  }
  // Empty subpanels retain their metric context instead of inventing zero data.
  const emptyPanels = [
    [views.market, "No listed-company market-cap data", 0],
    [views.revenue, "No listed-company revenue records", 1],
    [views.marketShare, "No market-cap values", 2],
    [views.revenueShare, "No revenue share", 3],
  ];
  o.graphic = emptyPanels
    .filter(([rows]) => !rows.length)
    .map(([, text, index]) => ({
      type: "text",
      left: index % 2 ? "62%" : "8%",
      top: index < 2 ? "25%" : "76%",
      style: {
        text,
        fill: C.muted,
        font: `11px ${RC.font}`,
        width: 130,
        overflow: "break",
      },
    }));
  apply(id, o, points);
  legend("scale-legend", visibleNames);
}
function renderLabs() {
  const id = "lab-revenue-graph",
    o = base(),
    orgs = names(views.labs),
    points = [];
  if (!views.labs.length) {
    const noLab = !state.organizations.some((n) =>
      data.groups["AI labs"].includes(n),
    );
    apply(id, {
      ...o,
      graphic: [
        empty(
          noLab
            ? "AI Lab Revenue Run Rate shows AI-lab data.\nSelect an AI lab or keep unselected data to compare."
            : "No reported lab revenue snapshots\nfor the selected organizations and years.",
        ),
      ],
    });
    legend("lab-revenue-legend", []);
    return;
  }
  o.grid = { left: 58, right: 9, top: 25, bottom: 29 };
  o.xAxis = xAxis();
  o.yAxis = {
    ...yAxis(),
    name: "Run rate · USD bn",
    nameLocation: "middle",
    nameRotate: 90,
    nameGap: 38,
    nameTextStyle: { fontSize: 11 },
    type: state.labScale === "log" ? "log" : "value",
    ...(state.labScale === "log" ? { logBase: 10 } : { min: 0 }),
  };
  o.series = orgs.map((org) => {
    const rows = views.labs.filter((r) => r.org === org);
    rows.forEach((r) =>
      points.push({ org, axis: 0, point: [utcDate(r.date), r.value] }),
    );
    return line(org, rows, (r) => utcDate(r.date), "lab");
  });
  apply(id, o, points);
  legend("lab-revenue-legend", orgs);
}
function renderRevenueScale() {
  const id = "revenue-comparison-graph",
    o = base(),
    groups = [
      ["public", views.latestPublic],
      ["labs", views.latestLabs],
    ],
    points = [];
  const total = groups.reduce(
    (sum, [, rows]) => sum + rows.reduce((s, r) => s + r.value, 0),
    0,
  );
  o.title = [
    {
      text: `Max year: ${state.years[1]}`,
      left: 8,
      top: 3,
      textAlign: "left",
      textStyle: { fontSize: 11, color: C.muted, fontFamily: RC.font },
    },
  ];
  if (total <= 0) {
    apply(id, {
      ...o,
      graphic: [empty(`No revenue snapshots available by ${state.years[1]}.`)],
    });
    return;
  }
  const hasPublic = views.latestPublic.length > 0,
    hasLabs = views.latestLabs.length > 0;
  const tileWidth =
    state.retain || (hasPublic && hasLabs) ? 0.7 : hasPublic ? 1 : 0.55;
  o.grid = { left: 1, right: 1, top: 31, bottom: 6 };
  o.xAxis = { type: "value", min: 0, max: 1, show: false };
  o.yAxis = { type: "value", min: 0, max: 1, show: false };
  let cursor = 0;
  const tiles = [],
    callouts = [];
  groups.forEach(([group, rows]) => {
    const groupTotal = rows.reduce((s, r) => s + r.value, 0);
    if (groupTotal <= 0) return;
    const width = (tileWidth * groupTotal) / total;
    let y = 0.03;
    rows.forEach((r) => {
      const height = (0.92 * r.value) / groupTotal;
      const tile = {
        ...r,
        amount: r.value,
        metric: "tile",
        group,
        x0: cursor,
        x1: cursor + width,
        y0: y,
        y1: y + height,
        description:
          group === "public"
            ? `SEC fiscal-year revenue, FY${r.year}`
            : `Annualized run rate reported ${r.date}`,
      };
      tile.value = [tile.x0, tile.y0, tile.x1, tile.y1];
      tiles.push(tile);
      points.push({
        org: r.org,
        axis: 0,
        rect: [tile.x0, tile.y0, tile.x1, tile.y1],
      });
      if (group === "labs") callouts.push(tile);
      y += height;
    });
    cursor += width;
  });
  callouts.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  callouts.forEach(
    (r, i) =>
      (r.calloutY =
        callouts.length === 1
          ? 0.5
          : 0.08 + (i * 0.84) / (callouts.length - 1)),
  );
  o.series = [
    {
      id: "revenue-tiles",
      type: "custom",
      name: "Revenue scale",
      coordinateSystem: "cartesian2d",
      data: tiles,
      renderItem(params, api) {
        const r = tiles[params.dataIndex],
          a = api.coord([r.x0, r.y0]),
          b = api.coord([r.x1, r.y1]);
        const shape = E.graphic.clipRectByRect(
          { x: a[0], y: b[1], width: b[0] - a[0], height: a[1] - b[1] },
          params.coordSys,
        );
        if (!shape) return null;
        const children = [
          {
            type: "rect",
            shape,
            style: {
              fill: color(r.org),
              stroke: "white",
              lineWidth: 1.5,
              opacity: opacity(r.org),
            },
          },
        ];
        if (r.group === "public" && r.y1 - r.y0 >= 0.09 && r.x1 - r.x0 >= 0.4)
          children.push({
            type: "text",
            silent: true,
            style: {
              x: (a[0] + b[0]) / 2,
              y: (a[1] + b[1]) / 2,
              text: r.org,
              fill: "white",
              font: `11px ${RC.font}`,
              align: "center",
              verticalAlign: "middle",
              opacity: opacity(r.org),
            },
          });
        if (r.group === "labs") {
          const target = api.coord([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]),
            label = api.coord([Math.min(tileWidth + 0.03, 0.76), r.calloutY]);
          children.push({
            type: "line",
            silent: true,
            shape: { x1: target[0], y1: target[1], x2: label[0], y2: label[1] },
            style: {
              stroke: color(r.org),
              lineWidth: 1,
              opacity: opacity(r.org),
            },
          });
          children.push({
            type: "text",
            silent: true,
            style: {
              x: label[0] + 2,
              y: label[1],
              text: r.org,
              fill: C.ink,
              font: `11px ${RC.font}`,
              verticalAlign: "middle",
              opacity: opacity(r.org),
            },
          });
        }
        return { type: "group", children };
      },
    },
  ];
  apply(id, o, points);
}
function renderPublications() {
  const id = "eto-graph",
    o = base(),
    orgs = names(views.publications),
    points = [];
  if (!orgs.length) {
    apply(id, {
      ...o,
      graphic: [
        empty(
          "No ETO AI-publication records\nfor the selected organizations and years.",
        ),
      ],
    });
    legend("eto-legend", []);
    return;
  }
  const start = Math.min(state.years[0], 2025),
    end = Math.max(start, Math.min(state.years[1], 2025)),
    xs = Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
  o.grid = { left: 68, right: 12, top: 25, bottom: 27 };
  o.xAxis = {
    type: "category",
    data: xs,
    boundaryGap: true,
    axisLabel: { fontSize: 11 },
  };
  o.yAxis = {
    ...yAxis(),
    name: "Publications",
    nameLocation: "middle",
    nameRotate: 90,
    nameGap: 38,
    nameTextStyle: { fontSize: 11 },
  };
  orgs.forEach((org) => {
    const rows = views.publications
        .filter((r) => r.org === org)
        .sort((a, b) => a.year - b.year),
      byYear = new Map(rows.map((r) => [r.year, r]));
    for (const [first, second, dash] of [
      [2023, 2024, false],
      [2024, 2025, true],
    ]) {
      if (!byYear.has(first) || !byYear.has(second)) continue;
      o.series.push({
        id: `publication-segment-${org}-${first}`,
        name: org,
        type: "line",
        silent: true,
        showSymbol: false,
        lineStyle: {
          color: color(org),
          type: dash ? "dashed" : "solid",
          width: 2.2,
          opacity: opacity(org),
        },
        data: [first, second].map((year) => [
          String(year),
          byYear.get(year).value,
        ]),
        tooltip: { show: false },
      });
    }
    o.series.push({
      id: `publication-points-${org}`,
      name: org,
      type: "scatter",
      symbolSize: 7,
      data: rows.map((r) => ({
        ...r,
        amount: r.value,
        metric: "publication",
        value: [String(r.year), r.value],
        itemStyle: {
          color: r.complete ? color(org) : "white",
          borderColor: color(org),
          borderWidth: 2,
          opacity: opacity(org),
        },
      })),
      emphasis: { focus: "series" },
    });
    rows.forEach((r) =>
      points.push({
        org,
        axis: 0,
        point: [String(r.year), r.value],
      }),
    );
  });
  apply(id, o, points);
  legend("eto-legend", orgs);
}
function syncControls() {
  $("group-filter").value = state.group;
  const available =
    state.group === "All" ? data.entities : data.groups[state.group];
  $("organization-filter").innerHTML = available
    .map(
      (name) =>
        `<option value="${esc(name)}"${state.organizations.includes(name) ? " selected" : ""}>${esc(name)}</option>`,
    )
    .join("");
  $("retain-unselected").checked = state.retain;
  document
    .querySelectorAll('[name="lab-axis"]')
    .forEach((input) => (input.checked = input.value === state.labScale));
  $("selection-summary").textContent =
    `${state.group === "All" ? "All groups" : state.group} · ${state.organizations.length} orgs · ${state.years[0]}–${state.years[1]}`;
  window.Chapter2UI?.sync(state, data);
}
function render() {
  views = viewData(data, state);
  syncControls();
  renderScale();
  renderLabs();
  renderRevenueScale();
  renderPublications();
}
function choose(id, names) {
  selectOrganizations(data, state, id, names);
  render();
}
function restore(id) {
  clearChart(state, id);
  render();
}

/** A rectangular mark selection, independent of engine-internal series indices.
 * ECharts owns all marks; its coordinate conversion keeps brush geometry aligned
 * across four axes, log scales, stacked bars and revenue rectangles.
 */
function bindSelection(id) {
  const host = $(id),
    chart = charts[id];
  let drag = null,
    box;
  chart.on("click", (p) => {
    if (Date.now() < ignoreClickUntil) return;
    if (p.data?.org) choose(id, [p.data.org]);
  });
  const position = (e) => {
    const r = host.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  host.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    drag = { start: position(e), end: position(e), active: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.end = position(e);
    const [a, b] = drag.start,
      [x, y] = drag.end;
    if (Math.hypot(x - a, y - b) > 5) {
      drag.active = true;
      ignoreClickUntil = Date.now() + 300;
      if (!box) {
        box = document.createElement("div");
        box.className = "selection-rectangle";
        host.appendChild(box);
      }
      Object.assign(box.style, {
        left: `${Math.min(a, x)}px`,
        top: `${Math.min(b, y)}px`,
        width: `${Math.abs(x - a)}px`,
        height: `${Math.abs(y - b)}px`,
      });
    }
  });
  window.addEventListener("pointerup", () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    box?.remove();
    box = null;
    if (!current.active) return;
    ignoreClickUntil = Date.now() + 300;
    const lo = [
        Math.min(current.start[0], current.end[0]),
        Math.min(current.start[1], current.end[1]),
      ],
      hi = [
        Math.max(current.start[0], current.end[0]),
        Math.max(current.start[1], current.end[1]),
      ];
    const inside = (p) =>
      p &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]) &&
      p[0] >= lo[0] &&
      p[0] <= hi[0] &&
      p[1] >= lo[1] &&
      p[1] <= hi[1];
    const selected = (selections[id] || [])
      .filter((mark) => {
        const finder = { xAxisIndex: mark.axis, yAxisIndex: mark.axis };
        if (mark.rect) {
          const [x0, y0, x1, y1] = mark.rect,
            a = chart.convertToPixel(finder, [x0, y0]),
            b = chart.convertToPixel(finder, [x1, y1]);
          return (
            Math.max(a[0], b[0]) >= lo[0] &&
            Math.min(a[0], b[0]) <= hi[0] &&
            Math.max(a[1], b[1]) >= lo[1] &&
            Math.min(a[1], b[1]) <= hi[1]
          );
        }
        return inside(chart.convertToPixel(finder, mark.point));
      })
      .map((mark) => mark.org);
    if (selected.length) choose(id, selected);
    else restore(id);
  });
  window.addEventListener("pointercancel", () => {
    drag = null;
    box?.remove();
    box = null;
  });
}
async function boot() {
  try {
    if (!RC || !E)
      throw Error("The shared chart engine or theme is unavailable.");
    const response = await fetch("api/data");
    if (!response.ok) throw Error(`Data request failed (${response.status})`);
    data = await response.json();
    state = initialState(data);
    document.body.style.fontFamily = RC.font;
    [
      "scale-graph",
      "lab-revenue-graph",
      "revenue-comparison-graph",
      "eto-graph",
    ].forEach((id) => {
      charts[id] = RC.init($(id));
      bindSelection(id);
    });
    $("group-filter").addEventListener("change", (e) => {
      manualFilter(data, state, "group", e.target.value);
      render();
    });
    $("organization-filter").addEventListener("change", (e) => {
      manualFilter(
        data,
        state,
        "organizations",
        [...e.target.selectedOptions].map((o) => o.value),
      );
      render();
    });
    for (const [id, key] of [
      ["year-min-range", "min"],
      ["year-max-range", "max"],
    ])
      $(id).addEventListener("input", (e) => {
        manualFilter(data, state, key, e.target.value);
        render();
      });
    $("retain-unselected").addEventListener("change", (e) => {
      state.retain = e.target.checked;
      render();
    });
    document.querySelectorAll('[name="lab-axis"]').forEach((input) =>
      input.addEventListener("change", (e) => {
        state.labScale = e.target.value;
        render();
      }),
    );
    for (const [button, id] of [
      ["clear-scale", "scale-graph"],
      ["clear-lab-revenue", "lab-revenue-graph"],
      ["clear-revenue-comparison", "revenue-comparison-graph"],
      ["clear-eto", "eto-graph"],
    ])
      $(button).addEventListener("click", () => restore(id));
    $("clear-all").addEventListener("click", () => {
      const { retain, labScale } = state;
      state = { ...initialState(data), retain, labScale };
      render();
    });
    Object.entries(charts).forEach(([id, chart]) =>
      new ResizeObserver(() => chart.resize()).observe($(id)),
    );
    render();
    window.CH2 = {
      charts,
      getState: () => clone(state),
      getViews: () => clone(views),
      getData: () => clone(data),
      selectOrganizations: choose,
    };
  } catch (error) {
    $("load-error").hidden = false;
    $("load-error").textContent = error.message;
    console.error(error);
  }
}
boot();
