// SPDX-License-Identifier: Apache-2.0

declare const Plotly: any;

/**
 * Group raw JSON data into groups by matching podName substrings.
 * Pods whose podName contains one of the provided group strings are summed into that group.
 * Pods that don't match any provided group are placed into the 'other' group.
 *
 * Returns an object with keysMs (sorted timestamps), groupNames (input groups + 'other'),
 * groupedCpuSeries and groupedMemSeries (maps of groupName -> number[] aligned with keysMs).
 */
function groupJsonData(raw: any, groups: string[]) {
  // produce a deep copy of the raw object so we don't mutate the original
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const out = structuredClone(raw || {});

  // normalized group list and ensure 'other' exists
  const groupList = [...(groups || [])];
  if (!groupList.includes('other')) {
    groupList.push('other');
  }

  // iterate timestamps
  // eslint-disable-next-line unicorn/no-array-sort
  const keys = Object.keys(out).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  for (const k of keys) {
    const entry = out[k];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const clusterMetrics = entry.clusterMetrics || [];
    const clusters = Array.isArray(clusterMetrics) ? clusterMetrics : [clusterMetrics];

    // process each cluster separately
    for (const cluster of clusters) {
      if (!cluster || typeof cluster !== 'object') {
        continue;
      }

      const pm = cluster.podMetrics;
      // accumulator map group -> { cpu, mem }
      const accum: Record<string, {cpu: number; mem: number}> = {};
      for (const g of groupList) {
        accum[g] = {cpu: 0, mem: 0};
      }

      if (Array.isArray(pm)) {
        for (const pod of pm) {
          const podName = (pod && (pod.podName || pod.name)) || '';
          const cpu = (pod && pod.cpuInMillicores) || 0;
          const mem = (pod && pod.memoryInMebibytes) || 0;
          let matched = false;
          for (const g of groups) {
            if (!g) {
              continue;
            }
            if (podName.includes(g)) {
              accum[g].cpu += cpu;
              accum[g].mem += mem;
              matched = true;
              break;
            }
          }
          if (!matched) {
            accum['other'].cpu += cpu;
            accum['other'].mem += mem;
          }
        }
      } else if (pm && typeof pm === 'object') {
        for (const podName of Object.keys(pm)) {
          const metrics = (pm as any)[podName] || {};
          const cpu = metrics.cpuInMillicores || 0;
          const mem = metrics.memoryInMebibytes || 0;
          let matched = false;
          for (const g of groups) {
            if (!g) {
              continue;
            }
            if (podName.includes(g)) {
              accum[g].cpu += cpu;
              accum[g].mem += mem;
              matched = true;
              break;
            }
          }
          if (!matched) {
            accum['other'].cpu += cpu;
            accum['other'].mem += mem;
          }
        }
      }

      // Build new grouped podMetrics array - include groups that have non-zero totals
      const groupedPods: any[] = [];
      for (const g of groupList) {
        const totals = accum[g];
        if (!totals) {
          continue;
        }
        // include group if there is any usage recorded (or always include 'other' to show absence)
        if (totals.cpu !== 0 || totals.mem !== 0 || g === 'other') {
          groupedPods.push({
            namespace: 'grouped',
            podName: g,
            cpuInMillicores: totals.cpu,
            memoryInMebibytes: totals.mem,
          });
        }
      }

      // replace cluster.podMetrics with groupedPods
      cluster.podMetrics = groupedPods;
    }

    // if original clusterMetrics was not an array, preserve that shape
    if (!Array.isArray(entry.clusterMetrics) && entry.clusterMetrics) {
      entry.clusterMetrics = Array.isArray(entry.clusterMetrics) ? entry.clusterMetrics : entry.clusterMetrics;
    }
  }

  return out;
}

async function loadJson(path: string): Promise<any> {
  // eslint-disable-next-line
  const response: Response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.statusText}`);
  }
  return response.json();
}

function parseData(data: any) {
  const keysMs: number[] = Object.keys(data)
    .map(k => Number.parseInt(k, 10))
    // eslint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => a - b);

  const transaction_counts = keysMs.map(k => data[String(k)].transactionCount || 0);

  // collect events per timestamp (join multiple events into a single string or empty)
  const eventsPerTime: string[] = keysMs.map(k => {
    const entry = data[String(k)] || {};
    const event = entry.events || [];
    if (!Array.isArray(event)) {
      return '';
    }
    return event.length > 0 ? event.join('; ') : '';
  });

  // Collect pod names and per-time pod metrics
  const podNamesSet = new Set<string>();
  const podMetricsByTime: Array<Record<string, {cpuInMillicores: number; memoryInMebibytes: number}>> = [];

  for (const k of keysMs) {
    const entry = data[String(k)] || {};
    const cluster = entry.clusterMetrics || [];
    const clusters = Array.isArray(cluster) ? cluster : [cluster];
    const merged: Record<string, {cpuInMillicores: number; memoryInMebibytes: number}> = {};

    for (const c of clusters) {
      if (!c || typeof c !== 'object') {
        continue;
      }
      const pm = c.podMetrics;
      if (Array.isArray(pm)) {
        for (const pod of pm) {
          const podName = pod.podName || pod.name;
          if (!podName) {
            continue;
          }
          if (!merged[podName]) {
            merged[podName] = {cpuInMillicores: 0, memoryInMebibytes: 0};
          }
          merged[podName].cpuInMillicores += pod.cpuInMillicores || 0;
          merged[podName].memoryInMebibytes += pod.memoryInMebibytes || 0;
          podNamesSet.add(podName);
        }
      } else if (pm && typeof pm === 'object') {
        for (const podName of Object.keys(pm)) {
          const metrics = (pm as any)[podName];
          if (!metrics || typeof metrics !== 'object') {
            continue;
          }
          if (!merged[podName]) {
            merged[podName] = {cpuInMillicores: 0, memoryInMebibytes: 0};
          }
          merged[podName].cpuInMillicores += metrics.cpuInMillicores || 0;
          merged[podName].memoryInMebibytes += metrics.memoryInMebibytes || 0;
          podNamesSet.add(podName);
        }
      }
    }

    podMetricsByTime.push(merged);
  }

  // eslint-disable-next-line unicorn/no-array-sort
  const podNames = [...podNamesSet].sort();

  const podCpuSeries: Record<string, number[]> = {};
  const podMemSeries: Record<string, number[]> = {};
  for (const pod of podNames) {
    podCpuSeries[pod] = [];
    podMemSeries[pod] = [];
  }

  for (const pm of podMetricsByTime) {
    for (const pod of podNames) {
      const m = pm[pod] || {cpuInMillicores: 0, memoryInMebibytes: 0};
      podCpuSeries[pod].push(m.cpuInMillicores || 0);
      podMemSeries[pod].push(m.memoryInMebibytes || 0);
    }
  }

  // compute tx per sec
  const tx_per_sec: number[] = [];
  for (let index = 0; index < transaction_counts.length; index++) {
    if (index === 0) {
      tx_per_sec.push(0);
      continue;
    }
    const deltaTx = transaction_counts[index] - transaction_counts[index - 1];
    const deltaMs = keysMs[index] - keysMs[index - 1];
    tx_per_sec.push(deltaMs > 0 ? deltaTx / (deltaMs / 1000) : 0);
  }

  return {keysMs, podNames, podCpuSeries, podMemSeries, tx_per_sec, eventsPerTime};
}

function makeTracesForPods(
  podNames: string[],
  seriesMap: Record<string, number[]>,
  keysX: number[],
  keysText: string[],
  stackGroup: string,
) {
  // produce stacked filled-area (scatter) traces using Plotly stackgroup
  const traces: any[] = [];

  // palette and helper
  const palette = [
    '#1f77b4',
    '#ff7f0e',
    '#2ca02c',
    '#d62728',
    '#9467bd',
    '#8c564b',
    '#e377c2',
    '#7f7f7f',
    '#bcbd22',
    '#17becf',
  ];
  function hexToRgba(hex: string, alpha: number) {
    const h = (hex || '#000000').replace('#', '');
    const bigint = Number.parseInt(h, 16) || 0;
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  for (const [index, pod] of podNames.entries()) {
    const color = palette[index % palette.length];
    traces.push({
      x: keysX,
      y: seriesMap[pod],
      text: keysText,
      name: pod,
      type: 'scatter',
      // include a lightweight line so hover works
      mode: 'lines',
      stackgroup: stackGroup,
      fill: 'tonexty',
      hoveron: 'fills+points',
      // store base fillcolor with alpha 0.6 and save base color for hover handler
      fillcolor: hexToRgba(color, 0.6),
      opacity: 0.85,
      line: {color: color, width: 1},
      _baseColor: color,
      _baseFillAlpha: 0.6,
      hovertemplate: '%{fullData.name}<br>Elapsed: %{text}<br>%{y} <extra></extra>',
    });
  }
  return traces;
}

// helper to format seconds into human-friendly elapsed string
function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return '';
  }
  const s = Math.round(seconds);
  if (s < 60) {
    return s + 's';
  }
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return hrs + 'h' + (mins > 0 ? ' ' + mins + 'm' : '');
  }
  // minutes >=1 and <1 hour
  return mins + 'm' + (rem > 0 ? ' ' + rem + 's' : '');
}

// helper to convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '#000000').replace('#', '');
  const bigint = Number.parseInt(h, 16) || 0;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function attachHoverHandlers(divId: string) {
  const container: any = document.querySelector(`#${divId}`);
  if (!container) {
    return;
  }

  container.on('plotly_hover', (eventData: any) => {
    if (!eventData || !eventData.points || eventData.points.length === 0) {
      return;
    }
    const pt = eventData.points[0];
    const traceIndex = pt.curveNumber;
    const trace = container.data[traceIndex];
    if (!trace) {
      return;
    }

    // highlight fulfilled area for stacked-area traces
    if (trace.type === 'scatter' && trace.stackgroup) {
      const allStackIndices: number[] = [];
      for (let index = 0; index < container.data.length; index++) {
        const t = container.data[index];
        if (t && t.type === 'scatter' && t.stackgroup) {
          allStackIndices.push(index);
        }
      }
      const dimIndices = allStackIndices.filter(index => index !== traceIndex);

      // hovered: set fill alpha to 1.0 (keep same RGB)
      const baseColor = trace._baseColor || (trace.line && trace.line.color) || '#1f77b4';
      Plotly.restyle(container, {fillcolor: hexToRgba(baseColor, 1), opacity: 0.9, 'line.width': 2}, [traceIndex]);

      // dim others by lowering opacity (preserve their fillcolor RGB)
      if (dimIndices.length > 0) {
        Plotly.restyle(container, {opacity: 0.25}, dimIndices);
      }

      return;
    }

    // fallback: emphasize non-stacked scatter lines/markers
    if (trace.type === 'scatter' && !trace.stackgroup) {
      Plotly.restyle(container, {'line.width': 4}, [traceIndex]);
      return;
    }
  });

  container.on('plotly_unhover', (_eventData: any) => {
    if (!container || !container.data) {
      return;
    }
    const stackIndices: number[] = [];
    for (let index = 0; index < container.data.length; index++) {
      const t = container.data[index];
      if (!t) {
        continue;
      }
      if (t.type === 'scatter') {
        if (t.stackgroup) {
          stackIndices.push(index);
        } else {
          Plotly.restyle(container, {'line.width': 2}, [index]);
        }
      }
    }

    // restore original fill alpha and opacity for stacked traces
    for (const index of stackIndices) {
      const t = container.data[index];
      const baseColor = (t && (t._baseColor || (t.line && t.line.color))) || '#1f77b4';
      const baseAlpha = t && (typeof t._baseFillAlpha === 'number' ? t._baseFillAlpha : 0.6);
      Plotly.restyle(container, {fillcolor: hexToRgba(baseColor, baseAlpha), opacity: 0.85, 'line.width': 1}, [index]);
    }
  });
}

async function render(filePath: string, divCpu: string, divMem: string, dataGroups: string[] = []) {
  let raw = await loadJson(filePath);
  if (dataGroups.length > 0) {
    raw = groupJsonData(raw, dataGroups);
  }
  const parsed = parseData(raw);
  createPlots(parsed, filePath, divCpu, divMem);
}

function createPlots(parsed: any, filePath: string, divCpu: string, divMem: string) {
  const {keysMs, podNames, podCpuSeries, podMemSeries, tx_per_sec} = parsed;
  const eventsPerTime: string[] = parsed.eventsPerTime || [];

  // compute elapsed seconds relative to the first timestamp
  const startMs = keysMs.length > 0 ? keysMs[0] : 0;
  const elapsedSec = keysMs.map(ms => (ms - startMs) / 1000);
  const elapsedText = elapsedSec.map(s => formatDuration(s));

  // compute tick values and labels for the elapsed axis (6 ticks)
  const maxSec = elapsedSec.length > 0 ? Math.max(...elapsedSec) : 0;
  const numberTicks = 6;
  const tickVals: number[] = [];
  const tickText: string[] = [];
  for (let index = 0; index <= numberTicks; index++) {
    const v = (maxSec * index) / numberTicks;
    tickVals.push(Math.round(v));
    tickText.push(formatDuration(Math.round(v)));
  }

  // no bar width needed for filled-area charts

  // CPU chart (stacked filled area)
  const cpuTraces = makeTracesForPods(podNames, podCpuSeries, elapsedSec, elapsedText, 'cpu');
  // compute total CPU per timestamp so we can place event markers above the stacked bars
  const totalCpu: number[] = elapsedSec.map((_, index) =>
    podNames.reduce((accumulator, p) => accumulator + (podCpuSeries[p][index] || 0), 0),
  );
  // place event markers in paper coordinates so they stay visually at the bottom of the chart
  // paper y is 0..1 where 0 is bottom of plotting area; use a small offset (0.03)
  const cpuTpsTrace = {
    x: elapsedSec,
    y: tx_per_sec,
    text: elapsedText,
    name: 'Transactions/sec',
    type: 'scatter',
    mode: 'lines+markers',
    marker: {color: 'red'},
    yaxis: 'y2',
    // show formatted elapsed time in tooltip
    hovertemplate: '%{fullData.name}<br>Elapsed: %{text}<br>%{y:.2f} <extra></extra>',
  };
  const cpuEventsTrace = {
    x: elapsedSec,
    y: totalCpu.map((_, index) => (eventsPerTime[index] ? 0.03 : Number.NaN)),
    text: eventsPerTime,
    customdata: elapsedText,
    name: 'Events',
    type: 'scatter',
    mode: 'markers',
    marker: {color: 'green', symbol: 'circle', size: 10, line: {color: 'black', width: 1}},
    hovertemplate: 'Event: %{text}<br>Elapsed: %{customdata}<extra></extra>',
    // use paper coordinates for vertical placement so y is fraction of plotting area
    yref: 'paper',
    showlegend: false,
  };
  const cpuData = [...cpuTraces, cpuTpsTrace, cpuEventsTrace];

  // add event markers after TPS so they render on top of areas/lines
  const cpuShapes: any[] = [];
  for (const [index, element] of elapsedSec.entries()) {
    if (!eventsPerTime[index]) {
      continue;
    }
    cpuShapes.push({
      type: 'line',
      x0: element,
      x1: element,
      y0: 0,
      y1: 1,
      xref: 'x',
      yref: 'paper',
      line: {color: 'green', width: 3, dash: 'dot'},
      opacity: 0.9,
    });
  }

  // build annotations (visible labels) for CPU events
  // helper to build a Plotly annotation for an event marker (defaults to top-of-chart, no angle)
  function buildEventAnnotation(x: number, text: string, yPaper: number = 1.06) {
    // place the annotation just above the plotting area (paper coords > 1)
    const a: any = {
      x: x,
      y: yPaper,
      xref: 'x',
      yref: 'paper',
      text: text,
      font: {size: 10, color: 'green'},
      align: 'center',
      showarrow: false,
    };
    return a;
  }

  const cpuAnnotations: any[] = [];
  for (const [index, element] of elapsedSec.entries()) {
    const event = eventsPerTime[index];
    if (!event) {
      continue;
    }
    // pick the first event and truncate for brevity in-chart; full text remains on hover of the marker
    const first = (event.split(';')[0] || '').trim();
    const shortLabel = first.length > 40 ? first.slice(0, 40) + '…' : first + (event.includes(';') ? '…' : '');
    // place at the top of the chart with no angle
    cpuAnnotations.push(buildEventAnnotation(element, shortLabel));
  }
  const cpuLayout = {
    title: 'CPU Metrics',
    // stacked area, no barmode
    hovermode: 'closest',
    shapes: cpuShapes,
    annotations: cpuAnnotations,
    legend: {orientation: 'h', x: 0.5, xanchor: 'center', y: -0.2},
    xaxis: {
      type: 'linear',
      tickvals: tickVals,
      ticktext: tickText,
      tickangle: -45,
      automargin: true,
    },
    yaxis: {title: 'CPU (millicores)'},
    yaxis2: {title: 'Transactions/sec', overlaying: 'y', side: 'right'},
    margin: {t: 70, b: 140},
  };

  Plotly.newPlot(divCpu, cpuData, cpuLayout, {responsive: true});
  attachHoverHandlers(divCpu);

  // Memory chart (stacked filled area)
  const memTraces = makeTracesForPods(podNames, podMemSeries, elapsedSec, elapsedText, 'mem');
  // compute total Memory per timestamp for event placement
  const totalMem: number[] = elapsedSec.map((_, index) =>
    podNames.reduce((accumulator, p) => accumulator + (podMemSeries[p][index] || 0), 0),
  );
  // place memory event markers in paper coordinates at the bottom (same fraction)
  const memTpsTrace = {
    x: elapsedSec,
    y: tx_per_sec,
    text: elapsedText,
    name: 'Transactions/sec',
    type: 'scatter',
    mode: 'lines+markers',
    marker: {color: 'red'},
    yaxis: 'y2',
    hovertemplate: '%{fullData.name}<br>Elapsed: %{text}<br>%{y:.2f} <extra></extra>',
  };
  // restore memory event markers as circles as well
  const memEventsTrace = {
    x: elapsedSec,
    y: totalMem.map((_, index) => (eventsPerTime[index] ? 0.03 : Number.NaN)),
    text: eventsPerTime,
    customdata: elapsedText,
    name: 'Events',
    type: 'scatter',
    mode: 'markers',
    marker: {color: 'green', symbol: 'circle', size: 10, line: {color: 'black', width: 1}},
    hovertemplate: 'Event: %{text}<br>Elapsed: %{customdata}<extra></extra>',
    yref: 'paper',
    showlegend: false,
  };
  const memData = [...memTraces, memTpsTrace, memEventsTrace];
  // Build vertical line shapes for memory events
  const memShapes: any[] = [];
  for (const [index, element] of elapsedSec.entries()) {
    if (!eventsPerTime[index]) {
      continue;
    }
    memShapes.push({
      type: 'line',
      x0: element,
      x1: element,
      y0: 0,
      y1: 1,
      xref: 'x',
      yref: 'paper',
      line: {color: 'green', width: 3, dash: 'dot'},
      opacity: 0.9,
    });
  }

  // build annotations (visible labels) for Memory events
  const memAnnotations: any[] = [];
  for (const [index, element] of elapsedSec.entries()) {
    const event = eventsPerTime[index];
    if (!event) {
      continue;
    }
    const first = (event.split(';')[0] || '').trim();
    const shortLabel = first.length > 40 ? first.slice(0, 40) + '…' : first + (event.includes(';') ? '…' : '');
    // place under the chart and angle the label
    memAnnotations.push(buildEventAnnotation(element, shortLabel));
  }
  const memLayout = {
    title: 'Memory Metrics',
    // stacked area, no barmode
    hovermode: 'closest',
    shapes: memShapes,
    annotations: memAnnotations,
    legend: {orientation: 'h', x: 0.5, xanchor: 'center', y: -0.2},
    xaxis: {
      type: 'linear',
      tickvals: tickVals,
      ticktext: tickText,
      tickangle: -45,
      automargin: true,
    },
    yaxis: {title: 'Memory (MiB)'},
    yaxis2: {title: 'Transactions/sec', overlaying: 'y', side: 'right'},
    margin: {t: 70, b: 140},
  };

  Plotly.newPlot(divMem, memData, memLayout, {responsive: true});
  attachHoverHandlers(divMem);
}

function renderFromObject(object: any, divCpu: string, divMem: string, dataGroups: string[] = []) {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  let copiedObject: any = structuredClone(object);
  if (dataGroups.length > 0) {
    copiedObject = groupJsonData(copiedObject, dataGroups);
  }

  const parsed = parseData(copiedObject);

  createPlots(parsed, 'uploaded-file.json', divCpu, divMem);
}

// Expose a global boot function for the HTML page
(globalThis as any).renderMetrics = render;
(globalThis as any).renderMetricsFromObject = renderFromObject;
(globalThis as any).dataGroups = ['network-node', 'mirror', 'relay', 'explorer', 'block-node'];

function resolveDefaultFile(): string {
  const parameters = new URLSearchParams(globalThis.location.search);
  const fileParameter = parameters.get('data');
  return fileParameter ? `/data/${fileParameter}.json` : undefined;
}

function loadDefaultCharts() {
  // run on load after Plotly is available
  window.addEventListener('load', () => {
    try {
      // determine default grouping from GET params: ?grouped=1|true or ?mode=grouped
      const parameters = new URLSearchParams(globalThis.location.search);
      const groupedDefault = (parameters.get('grouped') || '').toLowerCase() === 'true';

      // if the page has the toggle button, set its state/text before rendering
      const tg = (globalThis as any).toggleGrouping;
      if (tg) {
        tg.grouped = groupedDefault;
        tg.textContent = groupedDefault ? 'Show all data' : 'Show grouped data';
      }

      const defaultFile = resolveDefaultFile();
      if (defaultFile) {
        (globalThis as any).renderMetrics(
          defaultFile,
          'cpuDiv',
          'memDiv',
          (globalThis as any).toggleGrouping && (globalThis as any).toggleGrouping.grouped
            ? (globalThis as any).dataGroups
            : [],
        );
      }
    } catch (error) {
      console.error('Failed to render:', error);
    }
  });
}

(globalThis as any).loadDefaultCharts = loadDefaultCharts;

// If loaded directly, auto-run with example data
if (globalThis.window !== undefined) {
  loadDefaultCharts();
}
