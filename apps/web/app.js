const el = (id) => document.getElementById(id);

const originInput = el('origin');
const destinationInput = el('destination');
const dateInput = el('date');
const tripDaysInput = el('tripDays');
const statusEl = el('status');

const lowestPlanEl = el('lowestPlan');
const comfortPlanEl = el('comfortPlan');
const bookingWindowEl = el('bookingWindow');
const travelWindowEl = el('travelWindow');
const priceTrendEl = el('priceTrend');
const tripCostEl = el('tripCost');
const hotelListEl = el('hotelList');
const explanationsEl = el('explanations');
const chartEl = el('sparkline');
const chartLegendEl = el('chartLegend');

function formatMoney(value) {
  if (value == null) return '—';
  return `¥${Number(value).toLocaleString('zh-CN')}`;
}

function formatPlan(plan) {
  if (!plan) return '暂无';
  const flight = plan.flight ? `机票 ${formatMoney(plan.flight.price)}` : '机票—';
  const hotel = plan.hotel ? `酒店 ${formatMoney(plan.hotel.total_price)}` : '酒店—';
  const delta = plan.delta_vs_lowest != null ? `差价 ${formatMoney(plan.delta_vs_lowest)}` : '';
  return `${formatMoney(plan.total_price)} · ${flight} · ${hotel} ${delta}`.trim();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function renderHotels(hotels) {
  hotelListEl.innerHTML = '';
  if (!hotels?.length) {
    hotelListEl.textContent = '暂无酒店数据';
    return;
  }
  for (const h of hotels) {
    const card = document.createElement('div');
    card.className = 'hotel-card';
    const title = h.hotel_name || h.hotel_id || '酒店';
    card.innerHTML = `
      <strong>${title}</strong>
      <div>总价 ${formatMoney(h.total_price)}</div>
      <div>每晚 ${formatMoney(h.nightly_price)}</div>
      <div>星级 ${h.star_rating ?? '—'} · 评分 ${h.review_score ?? '—'}</div>
    `;
    hotelListEl.appendChild(card);
  }
}

function renderExplanations(explanations) {
  explanationsEl.innerHTML = '';
  if (!explanations?.length) {
    explanationsEl.innerHTML = '<li>暂无解释信息</li>';
    return;
  }
  for (const item of explanations) {
    const li = document.createElement('li');
    li.textContent = item;
    explanationsEl.appendChild(li);
  }
}

function renderSparkline(series) {
  chartEl.innerHTML = '';
  if (!series?.length) {
    chartLegendEl.textContent = '暂无价格序列';
    return;
  }
  const width = 360;
  const height = 120;
  const values = series.map((d) => d.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = series.map((d, i) => {
    const x = (i / (series.length - 1 || 1)) * width;
    const y = height - ((d.price - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#0f766e');
  polyline.setAttribute('stroke-width', '3');
  polyline.setAttribute('points', points.join(' '));

  chartEl.appendChild(polyline);
  chartLegendEl.textContent = `最小 ${formatMoney(min)} · 最大 ${formatMoney(max)} · 共 ${series.length} 天`;
}

function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

async function fetchRecommendation() {
  const qs = getQueryParams();
  const apiBase = (qs.get('api_base') ?? 'http://localhost:3000').replace(/\/$/, '');
  const origin = originInput.value.trim();
  const destination = destinationInput.value.trim();
  const date = dateInput.value || new Date().toISOString().slice(0, 10);
  const tripDays = tripDaysInput.value.trim();
  const mock = qs.get('mock');
  const source = mock ? 'sample' : (qs.get('source') ?? 'snapshots');

  const params = new URLSearchParams({
    origin,
    destination,
    date,
    source
  });
  if (tripDays) params.set('trip_length_days', tripDays);

  setStatus('请求中...');
  try {
    const res = await fetch(`${apiBase}/recommendations?${params.toString()}`);
    const data = await res.json();

    lowestPlanEl.textContent = formatPlan(data.lowest_plan);
    comfortPlanEl.textContent = formatPlan(data.comfort_plan);

    bookingWindowEl.textContent = data.booking_window
      ? `P10 ${formatMoney(data.booking_window.p10)} / P50 ${formatMoney(data.booking_window.p50)}`
      : '暂无';

    travelWindowEl.textContent = data.travel_window?.start_date
      ? `${data.travel_window.start_date} → ${data.travel_window.end_date}`
      : '暂无';

    priceTrendEl.textContent = data.price_trend?.trend
      ? `${data.price_trend.trend} · 波动 ${data.price_trend.volatility}`
      : '暂无';

    tripCostEl.textContent = data.trip_cost_summary?.best_date
      ? `${data.trip_cost_summary.best_date} · ${formatMoney(data.trip_cost_summary.min_total_price)}`
      : '暂无';

    renderHotels(data.comfort_hotels);
    renderExplanations(data.explanations);
    renderSparkline(data.price_series_summary?.total_daily_min);
    setStatus('完成');
  } catch (err) {
    setStatus(`失败: ${err?.message ?? err}`);
  }
}

document.getElementById('run').addEventListener('click', fetchRecommendation);

dateInput.value = new Date().toISOString().slice(0, 10);
fetchRecommendation();
