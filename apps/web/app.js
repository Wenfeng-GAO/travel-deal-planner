const el = (id) => document.getElementById(id);

const originInput = el('origin');
const destinationInput = el('destination');
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
const lowestDetailEl = el('lowestDetail');
const comfortDetailEl = el('comfortDetail');

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

function formatDateTime(value) {
  if (!value) return '—';
  const date = value.split('T')[0];
  const time = value.includes('T') ? value.split('T')[1].slice(0, 5) : '';
  return time ? `${date} ${time}` : date;
}

function renderPlanDetails(plan, container, label, { origin, destination }) {
  if (!container) return;
  if (!plan) {
    container.innerHTML = `<div class="plan-title"><h3>${label}</h3></div><div class="metric">暂无方案</div>`;
    return;
  }

  const flight = plan.flight;
  const hotel = plan.hotel;
  const segments = flight?.segments ?? [];

  const flightLines = segments.length
    ? segments
        .map(
          (s, idx) => `
          <div class="segment">
            <strong>第 ${idx + 1} 段 ${s.from ?? '—'} → ${s.to ?? '—'}</strong>
            <span>${formatDateTime(s.depart_at)} → ${formatDateTime(s.arrive_at)}</span>
            <span>航司 ${s.carrier ?? '—'}</span>
          </div>
        `
        )
        .join('')
    : `
      <div class="segment">
        <strong>${origin} → ${destination}</strong>
        <span>${formatDateTime(flight?.depart_time)} → ${formatDateTime(flight?.arrive_time)}</span>
        <span>中转 ${flight?.layovers ?? '—'} 次 · 时长 ${flight?.total_duration ?? '—'}</span>
      </div>
    `;

  const hotelName = hotel?.hotel_name ?? hotel?.hotel_id ?? '酒店';
  const hotelStay = hotel?.check_in && hotel?.check_out
    ? `${hotel.check_in} → ${hotel.check_out}`
    : (hotel?.date ?? '待定');
  const hotelBlock = hotel
    ? `
      <div class="detail-block">
        <h4>酒店</h4>
        <div class="hotel-info">
          <div><strong>${hotelName}</strong></div>
          <div>入住 ${hotelStay}</div>
          <div>每晚 ${formatMoney(hotel?.nightly_price)} · 星级 ${hotel?.star_rating ?? '—'} · 评分 ${hotel?.review_score ?? '—'}</div>
        </div>
      </div>
    `
    : `
      <div class="detail-block">
        <h4>酒店</h4>
        <div class="hotel-info">本次仅考虑机票价格，酒店未纳入。</div>
      </div>
    `;

  const queryText = [
    `${origin} → ${destination}`,
    `行程 ${document.getElementById('tripDays')?.value || '5'} 天`,
    `出发 ${flight?.depart_time ? formatDateTime(flight.depart_time).split(' ')[0] : '待定'}`,
    `酒店 ${hotelName}`
  ].join(' / ');

  container.innerHTML = `
    <div class="plan-title">
      <h3>${label}</h3>
      <span class="plan-total">${formatMoney(plan.total_price)}</span>
    </div>
    <div class="plan-meta">
      <span>机票 ${formatMoney(flight?.price)}</span>
      <span>酒店 ${formatMoney(hotel?.total_price)}</span>
      <span>中转 ${flight?.layovers ?? '—'} 次</span>
    </div>
    <div class="detail-block">
      <h4>航班</h4>
      <div class="segment-list">${flightLines}</div>
    </div>
    ${hotelBlock}
    <div class="cta-row">
      <button class="copy-btn" data-query="${queryText}">复制检索条件</button>
      <span class="copy-hint">用于携程/飞猪/Booking 搜索</span>
    </div>
  `;

  const btn = container.querySelector('.copy-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(queryText);
        btn.textContent = '已复制';
        setTimeout(() => {
          btn.textContent = '复制检索条件';
        }, 1600);
      } catch (err) {
        btn.textContent = '复制失败';
        setTimeout(() => {
          btn.textContent = '复制检索条件';
        }, 1600);
      }
    });
  }
}

function renderTrendChart({ totalSeries, flightSeries, hotelSeries }) {
  chartEl.innerHTML = '';
  const activeSeries = [
    { key: 'total', label: '机票+酒店', color: '#0f766e', data: totalSeries ?? [] },
    { key: 'flight', label: '机票', color: '#4f46e5', data: flightSeries ?? [] },
    { key: 'hotel', label: '酒店', color: '#f97316', data: hotelSeries ?? [] },
  ].filter((s) => s.data.length > 0);

  if (!activeSeries.length) {
    chartLegendEl.textContent = '暂无价格序列';
    return;
  }
  const width = 360;
  const height = 120;
  const allValues = activeSeries.flatMap((s) => s.data.map((d) => d.price));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const total = activeSeries.find((s) => s.key === 'total');
  if (total) {
    const values = total.data.map((d) => d.price);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const points = total.data.map((d, i) => {
      const x = (i / (total.data.length - 1 || 1)) * width;
      const y = height - ((d.price - min) / range) * height;
      return { x, y, price: d.price };
    });
    const bandTop = points.map((p) => {
      const y = height - ((p.price + stddev - min) / range) * height;
      return { x: p.x, y };
    });
    const bandBottom = points
      .map((p) => {
        const y = height - ((p.price - stddev - min) / range) * height;
        return { x: p.x, y };
      })
      .reverse();
    const band = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    band.setAttribute(
      'points',
      [...bandTop, ...bandBottom].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
    );
    band.setAttribute('fill', 'rgba(15, 118, 110, 0.12)');
    band.setAttribute('stroke', 'none');
    chartEl.appendChild(band);
  }

  for (const series of activeSeries) {
    const points = series.data.map((d, i) => {
      const x = (i / (series.data.length - 1 || 1)) * width;
      const y = height - ((d.price - min) / range) * height;
      return { x, y, price: d.price };
    });
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', series.color);
    line.setAttribute('stroke-width', series.key === 'total' ? '3' : '2');
    line.setAttribute('points', points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
    chartEl.appendChild(line);
  }

  const legendItems = activeSeries
    .map((s) => {
      const values = s.data.map((d) => d.price);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      return `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${s.color}"></span>
          ${s.label} ${formatMoney(minVal)}-${formatMoney(maxVal)}
        </span>
      `;
    })
    .join('');
  chartLegendEl.innerHTML = `
    <div>对比区间：最小值到最大值</div>
    <div class="legend-items">${legendItems}</div>
  `;
}

function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

function defaultDate(offsetDays = 30) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function fetchRecommendation() {
  const qs = getQueryParams();
  const apiBase = (qs.get('api_base') ?? 'http://localhost:3000').replace(/\/$/, '');
  const origin = originInput.value.trim();
  const destination = destinationInput.value.trim();
  const tripDays = tripDaysInput.value.trim();
  const mock = qs.get('mock');
  const source = mock ? 'sample' : (qs.get('source') ?? 'amadeus');
  const flightOnly = qs.get('flight_only');
  const date = qs.get('date');
  const rangeDays = qs.get('date_range_days');

  const params = new URLSearchParams({
    origin,
    destination,
    source
  });
  if (tripDays) params.set('trip_length_days', tripDays);
  if (flightOnly) params.set('flight_only', flightOnly);
  if (date) {
    params.set('date', date);
  } else if (source === 'amadeus' && !rangeDays) {
    params.set('date_range_days', '14');
  } else if (rangeDays) {
    params.set('date_range_days', rangeDays);
  }

  setStatus('请求中...');
  try {
    const res = await fetch(`${apiBase}/recommendations?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      setStatus(`失败: ${data?.error ?? res.status}`);
      return;
    }

    lowestPlanEl.textContent = formatPlan(data.lowest_plan);
    comfortPlanEl.textContent = formatPlan(data.comfort_plan);

    bookingWindowEl.textContent = data.booking_window
      ? `P10 ${formatMoney(data.booking_window.p10)} / P50 ${formatMoney(data.booking_window.p50)}`
      : '暂无';

    travelWindowEl.textContent = data.travel_window?.start_date
      ? `${data.travel_window.start_date} → ${data.travel_window.end_date} · ${data.travel_window_basis === 'flight_plus_hotel' ? '机票+酒店' : '机票'}`
      : '暂无';

    priceTrendEl.textContent = data.price_trend?.trend
      ? `${data.price_trend.trend} · 波动 ${data.price_trend.volatility}`
      : '暂无';

    tripCostEl.textContent = data.trip_cost_summary?.best_date
      ? `${data.trip_cost_summary.best_date} · ${formatMoney(data.trip_cost_summary.min_total_price)}`
      : '暂无';

    renderHotels(data.comfort_hotels);
    renderExplanations(data.explanations);
    renderPlanDetails(data.lowest_plan, lowestDetailEl, '最低价方案', { origin, destination });
    renderPlanDetails(data.comfort_plan, comfortDetailEl, '体验性价比方案', { origin, destination });
    renderTrendChart({
      totalSeries: data.price_series_summary?.total_daily_min ?? [],
      flightSeries: data.price_series_summary?.flight_daily_min ?? [],
      hotelSeries: data.price_series_summary?.hotel_daily_min ?? [],
    });
    if (!data.price_series_summary?.flight_daily_min?.length) {
      setStatus('完成（无航班数据）');
    } else if (source === 'amadeus' && date) {
      setStatus(`完成（单日航班：${date}）`);
    } else if (source === 'amadeus') {
      const note = data?.note ?? '';
      setStatus(note.includes('range') ? `完成（${note}）` : '完成');
    } else {
      setStatus('完成');
    }
  } catch (err) {
    setStatus(`失败: ${err?.message ?? err}`);
  }
}

document.getElementById('run').addEventListener('click', fetchRecommendation);

fetchRecommendation();
