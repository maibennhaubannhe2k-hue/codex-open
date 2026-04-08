const API_BASE = window.location.origin;

const orderInput = document.getElementById('orderInput');
const scanBtn = document.getElementById('scanBtn');
const filterBtn = document.getElementById('filterBtn');
const exportBtn = document.getElementById('exportBtn');
const searchInput = document.getElementById('searchInput');
const dateInput = document.getElementById('dateInput');
const statusInput = document.getElementById('statusInput');
const historyTable = document.getElementById('historyTable');
const statsBox = document.getElementById('stats');
const lastResult = document.getElementById('lastResult');
const missingTable = document.getElementById('missingTable');
const missingSummary = document.getElementById('missingSummary');

let chart;
let currentRows = [];

async function api(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Lỗi không xác định' }));
    throw new Error(err.message || 'Request thất bại');
  }
  return res.json();
}

function badge(value, type = 'ok') {
  return `<span class="${type}">${value}</span>`;
}

async function scanOrder() {
  const orderId = orderInput.value.trim();
  if (!orderId) return;

  try {
    const data = await api('/check-order', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId })
    });

    lastResult.innerHTML = `
      <b>${data.order_id}</b> - ${data.tiktok_status} → <b>${data.mapped_status}</b>
      ${data.is_duplicate ? badge('DUPLICATE', 'warn') : ''}
      ${data.is_canceled ? badge('HỦY', 'bad') : ''}
    `;

    orderInput.value = '';
    orderInput.focus();

    await Promise.all([loadHistory(), loadStats(), loadMissing()]);
  } catch (error) {
    lastResult.innerHTML = `<span class="bad">${error.message}</span>`;
  }
}

function renderHistory(rows) {
  historyTable.innerHTML = rows
    .map(
      (item) => `<tr>
      <td>${item.order_id}</td>
      <td>${new Date(item.scanned_at).toLocaleString('vi-VN')}</td>
      <td>${item.tiktok_status}</td>
      <td>${item.mapped_status}</td>
      <td>${item.is_duplicate ? badge('YES', 'warn') : 'NO'}</td>
      <td>${item.is_canceled ? badge('YES', 'bad') : 'NO'}</td>
      <td>${item.is_picked ? badge('YES', 'ok') : badge('NO', 'warn')}</td>
    </tr>`
    )
    .join('');
}

async function loadHistory() {
  const q = encodeURIComponent(searchInput.value.trim());
  const date = encodeURIComponent(dateInput.value);
  const status = encodeURIComponent(statusInput.value);

  const result = await api(`/orders?q=${q}&date=${date}&status=${status}`);
  currentRows = result.data;
  renderHistory(currentRows);
}

function renderStats(stats) {
  statsBox.innerHTML = `
    <div class="stat">Tổng quét: <b>${stats.total}</b></div>
    <div class="stat">Hợp lệ: <b class="ok">${stats.valid}</b></div>
    <div class="stat">Trùng: <b class="warn">${stats.duplicate}</b></div>
    <div class="stat">Hủy: <b class="bad">${stats.canceled}</b></div>
    <div class="stat">Đã lấy: <b class="ok">${stats.picked}</b></div>
    <div class="stat">Chưa lấy: <b class="warn">${stats.notPicked}</b></div>
    <div class="stat">Đã giao: <b class="ok">${stats.delivered}</b></div>
  `;

  const chartData = [
    stats.valid,
    stats.duplicate,
    stats.canceled,
    stats.picked,
    stats.notPicked,
    stats.delivered
  ];

  const ctx = document.getElementById('dashboardChart');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Hợp lệ', 'Trùng', 'Hủy', 'Đã lấy', 'Chưa lấy', 'Đã giao'],
      datasets: [{ label: 'Số lượng đơn', data: chartData }]
    }
  });
}

async function loadStats() {
  const stats = await api('/stats');
  renderStats(stats);
}

async function loadMissing() {
  const result = await api('/missing-picked');
  missingSummary.textContent = `Tổng đơn thiếu: ${result.total_missing}`;
  missingTable.innerHTML = result.data
    .slice(0, 200)
    .map(
      (item) => `<tr>
      <td>${item.order_id}</td>
      <td>${new Date(item.scanned_at).toLocaleString('vi-VN')}</td>
      <td>${item.tiktok_status}</td>
    </tr>`
    )
    .join('');
}

function exportExcel() {
  if (!currentRows.length) {
    alert('Không có dữ liệu để export.');
    return;
  }

  const exportRows = currentRows.map((item) => ({
    order_id: item.order_id,
    scanned_at: item.scanned_at,
    tiktok_status: item.tiktok_status,
    mapped_status: item.mapped_status,
    is_duplicate: item.is_duplicate,
    is_canceled: item.is_canceled,
    is_picked: item.is_picked
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');

  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `tiktok_orders_${dateTag}.xlsx`);
}

scanBtn.addEventListener('click', scanOrder);
filterBtn.addEventListener('click', loadHistory);
exportBtn.addEventListener('click', exportExcel);

orderInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') scanOrder();
});

(async function init() {
  await Promise.all([loadHistory(), loadStats(), loadMissing()]);
  orderInput.focus();
})();
