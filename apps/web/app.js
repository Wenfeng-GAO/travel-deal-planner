const chartEl = document.getElementById('priceChart');
const chartLegendEl = document.getElementById('chartLegend');
let chartInstance = null;

function formatMoney(value) {
  if (!Number.isFinite(value)) return '—';
  return `¥${Number(value).toLocaleString('zh-CN')}`;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toStops(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatStops(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '直飞';
  return `${value} 次`;
}

function initChart() {
  if (!chartEl) return null;
  if (!window.echarts) {
    chartLegendEl.textContent = '图表库未加载，请检查网络或刷新页面。';
    return null;
  }
  if (!chartInstance) {
    chartInstance = window.echarts.init(chartEl, null, { renderer: 'canvas' });
    window.addEventListener('resize', () => chartInstance?.resize());
  }
  return chartInstance;
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? '';
    });
    return row;
  });
}

function buildPoint(row, kind) {
  const prefix = kind === 'direct' ? 'direct_' : '';
  const priceKey = kind === 'direct' ? 'direct_min_price' : 'min_price';
  const price = toNumber(row[priceKey]);
  if (!Number.isFinite(price)) return null;
  const stops = toStops(row[`${prefix}stops`]);
  return {
    value: [row.date, price],
    date: row.date,
    price,
    currency: row.currency || 'CNY',
    airline: row[`${prefix}airline`] || '—',
    flight_no: row[`${prefix}flight_no`] || '—',
    depart_time: row[`${prefix}depart_time`] || '—',
    arrive_time: row[`${prefix}arrive_time`] || '—',
    stops,
    transfer_details: kind === 'direct' ? '' : row.transfer_details || ''
  };
}

function renderCsvChart(rows) {
  const chart = initChart();
  if (!chart) return;

  const mainPoints = rows.map((row) => buildPoint(row, 'main')).filter(Boolean);
  const directPoints = rows.map((row) => buildPoint(row, 'direct')).filter(Boolean);

  if (!mainPoints.length && !directPoints.length) {
    chartLegendEl.textContent = '暂无 CSV 价格数据';
    return;
  }

  const series = [];
  if (mainPoints.length) {
    series.push({
      name: '最低价',
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#0f766e', width: 3 },
      areaStyle: { color: 'rgba(15, 118, 110, 0.12)' },
      data: mainPoints
    });
  }
  if (directPoints.length) {
    series.push({
      name: '直飞最低价',
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#f59e0b', width: 2 },
      data: directPoints
    });
  }

  chart.setOption(
    {
      animation: true,
      grid: { left: 52, right: 24, top: 24, bottom: 70 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          if (!items.length) return '';
          const date = items[0]?.data?.date || items[0]?.axisValueLabel || '';
          const lines = [date];
          for (const item of items) {
            const data = item.data || {};
            lines.push(`${item.marker}${item.seriesName}：${formatMoney(data.price)}`);
            lines.push(`航司：${data.airline || '—'}`);
            lines.push(`航班：${data.flight_no || '—'}`);
            lines.push(`起飞：${data.depart_time || '—'}`);
            lines.push(`到达：${data.arrive_time || '—'}`);
            lines.push(`经停：${formatStops(data.stops)}`);
            if (Number.isFinite(data.stops) && data.stops > 0) {
              lines.push(`转机：${data.transfer_details || '—'}`);
            }
          }
          return lines.join('<br/>');
        }
      },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#c9bda9' } },
        axisLabel: { color: '#606977' }
      },
      yAxis: {
        type: 'value',
        name: '价格 (CNY)',
        axisLine: { lineStyle: { color: '#c9bda9' } },
        axisLabel: { color: '#606977' },
        splitLine: { lineStyle: { color: 'rgba(15, 118, 110, 0.08)' } }
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        { type: 'slider', height: 24, bottom: 24 }
      ],
      series
    },
    true
  );

  const mainPrices = mainPoints.map((p) => p.price);
  const directPrices = directPoints.map((p) => p.price);
  const mainMin = mainPrices.length ? Math.min(...mainPrices) : null;
  const mainMax = mainPrices.length ? Math.max(...mainPrices) : null;
  const directMin = directPrices.length ? Math.min(...directPrices) : null;
  const directMax = directPrices.length ? Math.max(...directPrices) : null;

  const parts = [];
  if (mainPrices.length) {
    parts.push(`最低价 ${formatMoney(mainMin)} - ${formatMoney(mainMax)} · ${mainPoints.length} 天`);
  }
  if (directPrices.length) {
    parts.push(`直飞最低价 ${formatMoney(directMin)} - ${formatMoney(directMax)} · ${directPoints.length} 天`);
  }

  chartLegendEl.innerHTML = `
    <div>${parts.join(' · ')}</div>
    <div class="legend-items">
      ${
        mainPoints.length
          ? '<span class="legend-item"><span class="legend-swatch" style="background:#0f766e"></span>最低价曲线</span>'
          : ''
      }
      ${
        directPoints.length
          ? '<span class="legend-item"><span class="legend-swatch" style="background:#f59e0b"></span>直飞最低价曲线</span>'
          : ''
      }
    </div>
  `;
}

async function loadCsvChart() {
  const csvUrl = './data/ctrip_prices.csv';
  try {
    if (window.__CSV_DATA__) {
      const rows = parseCsv(window.__CSV_DATA__);
      renderCsvChart(rows);
      return;
    }
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`csv ${res.status}`);
    const text = await res.text();
    const rows = parseCsv(text);
    renderCsvChart(rows);
  } catch (err) {
    chartLegendEl.textContent = '暂无 CSV 数据（请确认 csv 路径或使用本地服务器打开页面）';
  }
}

loadCsvChart();
