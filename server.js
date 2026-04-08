const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs/promises');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'orders.json');
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const mapTikTokStatus = (tiktokStatus = '') => {
  const status = tiktokStatus.toLowerCase();

  if (status === 'pending' || status === 'ready_to_ship') {
    return { mapped_status: 'CHƯA ĐƯỢC LẤY', is_picked: false, is_canceled: false };
  }
  if (status === 'shipped' || status === 'in_transit') {
    return { mapped_status: 'ĐÃ ĐƯỢC LẤY', is_picked: true, is_canceled: false };
  }
  if (status === 'delivered') {
    return { mapped_status: 'ĐÃ GIAO', is_picked: true, is_canceled: false };
  }
  if (status === 'cancelled') {
    return { mapped_status: 'ĐƠN HỦY', is_picked: false, is_canceled: true };
  }

  return { mapped_status: 'KHÔNG XÁC ĐỊNH', is_picked: false, is_canceled: false };
};

const mockStatuses = ['pending', 'ready_to_ship', 'shipped', 'in_transit', 'delivered', 'cancelled'];
const pickMockStatus = (orderId) => {
  const seed = [...orderId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return mockStatuses[seed % mockStatuses.length];
};

async function getTikTokAccessToken() {
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    throw new Error('Thiếu TIKTOK_ACCESS_TOKEN trong .env');
  }
  return process.env.TIKTOK_ACCESS_TOKEN;
}

async function getTikTokOrderStatus(orderId) {
  const useMock = String(process.env.TIKTOK_MOCK || 'true').toLowerCase() === 'true';

  if (useMock) {
    return {
      order_id: orderId,
      tiktok_status: pickMockStatus(orderId),
      source: 'mock'
    };
  }

  const token = await getTikTokAccessToken();
  const baseUrl = process.env.TIKTOK_API_BASE_URL || 'https://open-api.tiktokglobalshop.com';

  // Endpoint thực tế có thể thay đổi theo app/shop region của bạn.
  const response = await fetch(`${baseUrl}/order/202309/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TikTok API lỗi (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const tiktokStatus = payload?.data?.order_status || payload?.data?.status;

  if (!tiktokStatus) {
    throw new Error('Không đọc được trạng thái đơn từ TikTok API');
  }

  return {
    order_id: orderId,
    tiktok_status: tiktokStatus,
    source: 'tiktok'
  };
}

async function ensureDbFile() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify({ orders: [] }, null, 2), 'utf8');
  }
}

async function readDb() {
  await ensureDbFile();
  const raw = await fs.readFile(DB_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeDb(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.post('/check-order', async (req, res) => {
  try {
    const orderId = String(req.body?.order_id || '').trim();
    if (!orderId) {
      return res.status(400).json({ message: 'order_id là bắt buộc' });
    }

    const db = await readDb();
    const now = Date.now();

    const isDuplicate = db.orders.some(
      (item) => item.order_id === orderId && now - new Date(item.scanned_at).getTime() <= FIVE_DAYS_MS
    );

    const tiktok = await getTikTokOrderStatus(orderId);
    const mapped = mapTikTokStatus(tiktok.tiktok_status);

    const record = {
      order_id: orderId,
      scanned_at: new Date(now).toISOString(),
      tiktok_status: tiktok.tiktok_status,
      mapped_status: mapped.mapped_status,
      is_duplicate: isDuplicate,
      is_canceled: mapped.is_canceled,
      is_picked: mapped.is_picked
    };

    db.orders.unshift(record);
    await writeDb(db);

    return res.json(record);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Lỗi server nội bộ' });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const { q = '', date = '', status = '' } = req.query;
    const db = await readDb();

    const rows = db.orders.filter((item) => {
      const matchedQ = q ? item.order_id.toLowerCase().includes(String(q).toLowerCase()) : true;
      const matchedDate = date ? item.scanned_at.startsWith(String(date)) : true;
      const matchedStatus = status ? item.mapped_status === status : true;
      return matchedQ && matchedDate && matchedStatus;
    });

    res.json({ total: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Lỗi server nội bộ' });
  }
});

app.get('/stats', async (_req, res) => {
  try {
    const db = await readDb();

    const stats = db.orders.reduce(
      (acc, item) => {
        acc.total += 1;
        if (!item.is_duplicate && !item.is_canceled) acc.valid += 1;
        if (item.is_duplicate) acc.duplicate += 1;
        if (item.is_canceled) acc.canceled += 1;
        if (item.is_picked) acc.picked += 1;
        if (!item.is_picked && !item.is_canceled) acc.notPicked += 1;
        if (item.mapped_status === 'ĐÃ GIAO') acc.delivered += 1;
        return acc;
      },
      {
        total: 0,
        valid: 0,
        duplicate: 0,
        canceled: 0,
        picked: 0,
        notPicked: 0,
        delivered: 0
      }
    );

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Lỗi server nội bộ' });
  }
});

app.get('/missing-picked', async (_req, res) => {
  try {
    const db = await readDb();
    const missing = db.orders.filter((item) => !item.is_picked && !item.is_canceled);
    res.json({ total_missing: missing.length, data: missing });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Lỗi server nội bộ' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
