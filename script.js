// Defaults, overridable from the "Settings" table in data/timeline.md.
const DEFAULT_START = 1950;
const DEFAULT_END = 2026;
// Without `year_width` the whole span fits PLOT_X1, as in the original chart.
const DEFAULT_HEIGHT = 668.2; // height of the plot above the axis, in pixels

const AXIS_X0 = 11.8;
const PLOT_X0 = 11.7;
const PLOT_X1 = 1451.1;
const TOP_MARGIN = 20;
const RIGHT_PAD = 40;
const BASE_PAD = 14;
const LINE_H = 16;
const CHAR_W = 6.6;
const GAP = 6;
const FONT_SIZE = 14;
const FOOT_ROW_H = 17;
const MIN_TICK_PX = 50;

// Vertical positions depend on the plot height set in Settings; render()
// assigns them before any layout runs.
let AXIS_Y, FOOT_Y, VIEW_H_MIN, TREND_Y_BASE, TREND_Y_TOP, PHASE_DASH_TOP;
function setHeight(plotHeight) {
  AXIS_Y = TOP_MARGIN + plotHeight;
  FOOT_Y = AXIS_Y + 45.4; // first row of branch/phase labels under the axis
  VIEW_H_MIN = AXIS_Y + 81;
  TREND_Y_BASE = AXIS_Y - 9;
  // The curve uses the lower ~58% of the plot, as in the original chart.
  TREND_Y_TOP = AXIS_Y - 0.582 * plotHeight;
  PHASE_DASH_TOP = AXIS_Y - 0.5 * plotHeight;
}
const DEFAULT_CURVE_COLORS = ["#0000FF", "#000000"];

function parseTables(md) {
  const tables = {};
  const lines = md.split("\n");
  let currentHeading = null;
  let buffer = [];
  function flush() {
    if (currentHeading && buffer.length)
      tables[currentHeading] = parseTable(buffer);
    buffer = [];
  }
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      flush();
      currentHeading = h[1].trim();
      continue;
    }
    if (line.trim().startsWith("|")) buffer.push(line);
  }
  flush();
  return tables;
}

function parseTable(lines) {
  if (lines.length < 2) return [];
  const split = (l) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (/^[-:\s|]+$/.test(lines[i])) continue;
    const cells = split(lines[i]);
    const row = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ""));
    rows.push(row);
  }
  return rows;
}

// Items are coloured by type; without a type colour they take the branch's.
function itemColor(type, typeRow, branch) {
  if (typeRow && typeRow.color) return typeRow.color;
  if (/^#/.test(type)) return type;
  return branch ? branch.color : "#333333";
}


// Measure labels with the real chart font when available.
const measureCtx = document.createElement("canvas").getContext("2d");
// Wraps a label in a link when it has one, so every label in the chart can
// be clicked.
function linked(parent, href) {
  if (!href) return parent;
  return parent
    .append("a")
    .attr("href", href)
    .attr("target", "_blank")
    .attr("class", "item-link");
}

function estimateWidth(label) {
  if (measureCtx) {
    measureCtx.font = `${FONT_SIZE}px "ABC Areal Mono", Arial, sans-serif`;
    return Math.ceil(measureCtx.measureText(label).width);
  }
  return Math.ceil(label.length * CHAR_W);
}

// Lays out the branches as growing staircases. Each branch starts on the axis
// at its first date; every following item sits at least one line above the
// previous item of the same branch, and never lower. Its target height is the
// branch diagonal (rising by `rise` % by the last year) or one line above the
// previous item, whichever is higher. Items of all branches are placed in date
// order against one shared list of boxes (the curve labels are reserved
// first); an item that would overlap something moves further up, never down.
function layoutBranches(branchList, xScale, endYear, reserved = []) {
  const maxRise = AXIS_Y - BASE_PAD - TOP_MARGIN;
  const yMax = AXIS_Y - BASE_PAD;
  const placed = [...reserved];
  const result = {};
  const lastY = {};

  const collides = (x1, x2, y) =>
    placed.some(
      (p) => x1 < p.x2 && x2 > p.x1 && Math.abs(y - p.y) < LINE_H,
    );

  const all = [];
  for (const { branch, items } of branchList) {
    const riseFrac = branch.rise / 100;
    const startYear = d3.min(items, (it) => it.date);
    const span = endYear - startYear || 1;
    const sorted = [...items].sort((a, b) => a.date - b.date);
    for (const it of sorted) {
      const frac = Math.max(0, Math.min(1, (it.date - startYear) / span));
      it.x = xScale(it.date);
      it.y0 = yMax - riseFrac * frac * maxRise;
      it.branchId = branch.id;
      all.push(it);
    }
    result[branch.id] = sorted;
  }

  all.sort((a, b) => a.date - b.date);
  for (const it of all) {
    const x1 = it.x - GAP;
    const x2 = it.x + estimateWidth(it.label) + GAP;
    const prev = lastY[it.branchId];
    let y = prev === undefined ? yMax : Math.min(it.y0, prev - LINE_H);
    while (collides(x1, x2, y)) y -= LINE_H;
    placed.push({ x1, x2, y });
    it.y = y;
    lastY[it.branchId] = y;
  }
  return result;
}

// Places labels under the axis in rows. Each label hangs from a vertical line
// starting at the axis, so a label must sit below every label to its right
// whose line would otherwise cut through its text (a staircase, right to left).
function layoutFootLabels(labels, firstRow = 0) {
  const done = [];
  for (const l of [...labels].sort((a, b) => b.x - a.x)) {
    const x2 = l.x + 8 + estimateWidth(l.text) + GAP;
    const blocking = done.filter((d) => d.x < x2);
    l.row = blocking.length
      ? 1 + Math.max(...blocking.map((d) => d.row))
      : firstRow;
    l.y = FOOT_Y + l.row * FOOT_ROW_H;
    done.push(l);
  }
  return labels;
}

function tickStep(pxPerYear) {
  return [1, 2, 5, 10, 20].find((s) => s * pxPerYear >= MIN_TICK_PX) || 50;
}

async function loadCurves(curveRows) {
  const rows = curveRows.length
    ? curveRows
    : [{ label: "", file: "data/ngrams.json", color: "" }];
  const curves = await Promise.all(
    rows
      .filter((r) => r.file)
      .map(async (r, i) => {
        const res = await fetch(r.file);
        if (!res.ok) throw new Error(`${r.file}: HTTP ${res.status}`);
        const data = await res.json();
        return {
          label: r.label || data.label || "",
          color: r.color || DEFAULT_CURVE_COLORS[i] || "#0000FF",
          link: r.link || "",
          startYear: Number(data.startYear),
          values: data.values || [],
        };
      }),
  );
  return curves.filter((c) => c.values.length);
}

async function render() {
  const wrap = d3.select("#chart-wrap");
  const errorBox = document.getElementById("error");
  let md, curves;
  try {
    const mdRes = await fetch("data/timeline.md");
    if (!mdRes.ok) throw new Error(`HTTP ${mdRes.status}`);
    md = await mdRes.text();
    curves = await loadCurves(parseTables(md)["Curves"] || []);
    if (document.fonts) await document.fonts.ready;
  } catch (e) {
    errorBox.textContent =
      "Couldn't load chart data (" +
      e.message +
      ").\n" +
      "Browsers block fetch() of local files opened directly — serve this folder instead, e.g.:\n" +
      "  cd " +
      location.pathname.replace(/\/index\.html$/, "") +
      "\n  python3 -m http.server 8000\nthen open http://localhost:8000/";
    return;
  }

  const tables = parseTables(md);
  const settings = {};
  for (const r of tables["Settings"] || []) settings[r.key] = r.value;
  const YEAR_X0 = parseFloat(settings.start) || DEFAULT_START;
  const YEAR_X1 = parseFloat(settings.end) || DEFAULT_END;
  const yearWidth = parseFloat(settings.year_width);
  setHeight(parseFloat(settings.height) || DEFAULT_HEIGHT);

  const xScale = d3
    .scaleLinear()
    .domain([YEAR_X0, YEAR_X1])
    .range([
      PLOT_X0,
      yearWidth ? PLOT_X0 + (YEAR_X1 - YEAR_X0) * yearWidth : PLOT_X1,
    ]);

  const branchRows = tables["Branches"] || [];
  const typeRows = tables["Types"] || [];
  const phaseRows = tables["Phases"] || [];
  const itemRows = tables["Items"] || [];

  const branches = {};
  for (const r of branchRows) {
    branches[r.id] = {
      id: r.id,
      label: r.label,
      rise: parseFloat(r.rise),
      color: r.color || "#9B9B9B",
    };
  }

  const types = {};
  for (const r of typeRows) types[r.type] = r;

  const items = itemRows
    .filter((r) => r.date && r.label)
    .map((r) => ({
      date: parseFloat(r.date),
      label: r.label,
      branch: r.branch,
      type: r.type,
      link: r.link,
      color: itemColor(r.type, types[r.type], branches[r.branch]),
    }));

  const maxDate = Math.max(YEAR_X1, ...items.map((it) => it.date));

  const branchList = Object.values(branches)
    .map((branch) => ({
      branch,
      items: items.filter((it) => it.branch === branch.id),
    }))
    .filter((b) => b.items.length);
  // Curves share one y scale so that two terms stay comparable. Their end
  // labels are placed before the timeline items, so each label stays next to
  // the end of its line and the items move around it. If the branches end up
  // above the top of the plot, the plot grows by that amount and is laid out
  // again, so no label is ever cut off.
  const allValues = curves.flatMap((c) => c.values);
  let plotHeight = parseFloat(settings.height) || DEFAULT_HEIGHT;
  let yScale, curveLabels, laidOutByBranch;
  for (let attempt = 0; attempt < 6; attempt++) {
    setHeight(plotHeight);
    yScale = d3
      .scaleLinear()
      .domain(d3.extent(allValues))
      .range([TREND_Y_BASE, TREND_Y_TOP]);
    curveLabels = curves
      .filter((c) => c.label)
      .map((c) => ({
        c,
        x: xScale(c.startYear + c.values.length - 1) + 10,
        y: yScale(c.values[c.values.length - 1]) - 6,
      }))
      .sort((a, b) => b.y - a.y);
    for (let i = 1; i < curveLabels.length; i++)
      if (curveLabels[i - 1].y - curveLabels[i].y < LINE_H)
        curveLabels[i].y = curveLabels[i - 1].y - LINE_H;
    const reserved = curveLabels.map((l) => ({
      x1: l.x - GAP,
      x2: l.x + estimateWidth(l.c.label) + GAP,
      y: l.y,
    }));
    laidOutByBranch = layoutBranches(branchList, xScale, maxDate, reserved);
    const topY = d3.min(Object.values(laidOutByBranch).flat(), (it) => it.y);
    const overflow = TOP_MARGIN + LINE_H - topY;
    if (!(overflow > 0)) break;
    plotHeight += Math.ceil(overflow);
  }

  let maxX2 = xScale(maxDate);
  for (const laidOut of Object.values(laidOutByBranch))
    maxX2 = Math.max(
      maxX2,
      ...laidOut.map((it) => it.x + estimateWidth(it.label)),
    );

  const AXIS_X1 = Math.max(xScale(YEAR_X1), maxX2) + RIGHT_PAD;
  const VIEW_W = AXIS_X1 + 20;

  // Branch labels sit on the first row under the axis; phase labels go on the
  // rows below them.
  const foot = [];
  for (const p of phaseRows) {
    if (!p.date) continue;
    foot.push({
      kind: "phase",
      x: xScale(parseFloat(p.date)),
      text: p.label,
      dashed: (p.style || "").toLowerCase() === "dashed",
      link: p.link || "",
      reaches: p.reaches || "",
    });
  }
  for (const { branch } of branchList) {
    const laidOut = laidOutByBranch[branch.id];
    foot.push({
      kind: "branch",
      x: xScale(d3.min(laidOut, (it) => it.date)),
      text: branch.label,
      color: branch.color,
    });
  }
  // Branch names share one row and hang from the line at the branch start.
  // A name normally sits right of its line; when the next branch starts too
  // close, it moves to the left of its line. Only if neither side fits does
  // it shift right, keeping a short tick at the start date.
  const branchFoot = foot
    .filter((f) => f.kind === "branch")
    .sort((a, b) => a.x - b.x);
  let rowEnd = -Infinity;
  branchFoot.forEach((f, i) => {
    const w = estimateWidth(f.text);
    const next = branchFoot[i + 1];
    f.row = 0;
    f.y = FOOT_Y;
    const nextClose = next && f.x + 8 + w + 2 * GAP > next.x;
    const leftStart = f.x - 8 - w;
    const leftFits = leftStart >= Math.max(0, rowEnd + 2 * GAP);
    if (f.dropped || f.x + 8 < rowEnd + 2 * GAP) {
      // No room on the first row: the name drops to the row below, right of
      // its own line, which still runs from the axis at its date.
      f.row = 1;
      f.y = FOOT_Y + FOOT_ROW_H;
      f.tx = f.x + 8;
      return;
    }
    if (nextClose && leftFits) {
      f.tx = leftStart;
    } else {
      f.tx = f.x + 8;
      // The next branch starts too close: its name goes to the row below.
      if (nextClose) next.dropped = true;
    }
    rowEnd = f.tx + w;
  });
  // Phase names sit on the same row as the branch names when they fit there
  // (no overlap with a branch name, and no branch line crossing them);
  // otherwise they drop to the rows below.
  const phases = foot.filter((f) => f.kind === "phase");
  const leftover = [];
  for (const p of phases) {
    const p1 = p.x + 8 - GAP;
    const p2 = p.x + 8 + estimateWidth(p.text) + GAP;
    const fits = branchFoot.every((b) => {
      const b1 = b.tx;
      const b2 = b.tx + estimateWidth(b.text);
      const lineInside = b.x > p1 && b.x < p2;
      return (p2 <= b1 || p1 >= b2) && !lineInside && !(p.x > b1 && p.x < b2);
    });
    if (fits) {
      p.row = 0;
      p.y = FOOT_Y;
    } else leftover.push(p);
  }
  layoutFootLabels(leftover, branchFoot.length ? 1 : 0);
  const VIEW_H = Math.max(VIEW_H_MIN, d3.max(foot, (f) => f.y + 12) || 0);

  wrap.selectAll("*").remove();
  const svg = wrap
    .append("svg")
    .attr("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`)
    .attr("width", VIEW_W)
    .attr("height", VIEW_H)
    .attr("xmlns", "http://www.w3.org/2000/svg");

  const axisG = svg.append("g");
  axisG
    .append("path")
    .attr("d", `M${AXIS_X1},${AXIS_Y}H${AXIS_X0}`)
    .attr("fill", "none")
    .attr("stroke", "#000")
    .attr("stroke-width", 0.5)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round");
  const step = tickStep(xScale(YEAR_X0 + 1) - xScale(YEAR_X0));
  axisG
    .selectAll("text")
    .data(d3.range(Math.ceil(YEAR_X0 / step) * step, Math.ceil(maxDate) + 1, step))
    .join("text")
    .attr("x", (d) => xScale(d))
    .attr("y", AXIS_Y + 18)
    .attr("font-size", FONT_SIZE)
    .text((d) => d);

  const lineG = svg.append("g");
  for (const c of curves) {
    const trendLine = d3
      .line()
      .x((_, i) => xScale(c.startYear + i))
      .y((d) => yScale(d))
      .curve(d3.curveCatmullRom.alpha(0.5));
    lineG
      .append("path")
      .attr("d", trendLine(c.values))
      .attr("fill", "none")
      .attr("stroke", c.color)
      .attr("stroke-width", 0.5);

    const lastX = xScale(c.startYear + c.values.length - 1);
    const lastY = yScale(c.values[c.values.length - 1]);
    if (AXIS_X1 - RIGHT_PAD > lastX) {
      lineG
        .append("path")
        .attr("d", `M${lastX},${lastY}L${AXIS_X1 - RIGHT_PAD},${lastY}`)
        .attr("fill", "none")
        .attr("stroke", c.color)
        .attr("stroke-width", 0.5)
        .attr("stroke-dasharray", "2,4");
    }
  }
  for (const l of curveLabels)
    linked(lineG, l.c.link)
      .append("text")
      .attr("x", l.x)
      .attr("y", l.y)
      .attr("fill", l.c.color)
      .attr("font-size", 14.91)
      .text(l.c.label);

  const phaseG = svg.append("g");
  for (const p of foot.filter((f) => f.kind === "phase")) {
    // The line stops short of any branch label it would cross, then resumes
    // below it down to its own label.
    const crossed = branchFoot.filter(
      (b) => b.tx <= p.x && p.x <= b.tx + estimateWidth(b.text) + 2,
    );
    // With `reaches`, the line rises from its name only up to that item,
    // stopping just under its label; otherwise it uses the default height.
    const target = p.reaches
      ? Object.values(laidOutByBranch)
          .flat()
          .find((it) => it.label === p.reaches)
      : null;
    const top = target
      ? target.y + 4
      : p.dashed
        ? PHASE_DASH_TOP
        : TOP_MARGIN;
    const segments = [[top, p.y - 0.6]];
    for (const b of crossed.sort((a, b) => a.y - b.y)) {
      const last = segments.pop();
      segments.push([last[0], b.y - FONT_SIZE]);
      segments.push([b.y + 5, last[1]]);
    }
    for (const [y1, y2] of segments) {
      const line = phaseG
        .append("line")
        .attr("x1", p.x)
        .attr("y1", y1)
        .attr("x2", p.x)
        .attr("y2", y2)
        .attr("stroke", "#000")
        .attr("stroke-width", 0.5)
        .attr("stroke-linecap", "round");
      if (p.dashed) line.attr("stroke-dasharray", "0,0,3,10");
    }
    linked(phaseG, p.link)
      .append("text")
      .attr("x", p.x + 8)
      .attr("y", p.y)
      .attr("font-size", FONT_SIZE)
      .text(p.text);
  }

  const branchG = svg.append("g");
  for (const f of branchFoot) {
    // A line that runs down past a name on the first row breaks around it.
    const crossed = branchFoot.filter(
      (b) =>
        b !== f &&
        b.row < f.row &&
        b.tx <= f.x &&
        f.x <= b.tx + estimateWidth(b.text) + 2,
    );
    const segs = [[AXIS_Y, f.y - 0.6]];
    for (const b of crossed) {
      const last = segs.pop();
      segs.push([last[0], b.y - FONT_SIZE]);
      segs.push([b.y + 5, last[1]]);
    }
    for (const [y1, y2] of segs)
      branchG
        .append("line")
        .attr("x1", f.x)
        .attr("y1", y1)
        .attr("x2", f.x)
        .attr("y2", y2)
        .attr("stroke", f.color)
        .attr("stroke-width", 0.5)
        .attr("stroke-linejoin", "round");
    branchG
      .append("text")
      .attr("x", f.tx)
      .attr("y", f.y)
      .attr("fill", f.color)
      .attr("font-size", FONT_SIZE)
      .text(f.text);
  }
  for (const { branch } of branchList) {
    for (const it of laidOutByBranch[branch.id]) {
      linked(branchG, it.link)
        .append("text")
        .attr("x", it.x)
        .attr("y", it.y)
        .attr("fill", it.color)
        .attr("font-size", FONT_SIZE)
        .text(it.label);
    }
  }
}

render();
