# TikTok Shop Warehouse Scan System

Hệ thống web quản lý quét đơn cho kho vận hành TikTok Shop.

## 1) Tính năng đã có

- Quét mã đơn (barcode scanner hoặc nhập tay) qua `POST /check-order`
- Mapping trạng thái TikTok sang trạng thái kho
- Gắn cờ đơn trùng trong vòng 5 ngày
- Dashboard thống kê tổng quan + biểu đồ Chart.js
- Danh sách đơn đã quét nhưng chưa được vận chuyển lấy (`/missing-picked`)
- Lịch sử quét + tìm kiếm mã đơn + lọc theo ngày/trạng thái
- Export Excel bằng XLSX trên frontend
- Ẩn token TikTok ở backend qua biến môi trường `.env`

## 2) Cấu trúc

- `server.js`: Express API + logic nghiệp vụ
- `public/index.html`: UI quét, dashboard, lịch sử
- `public/script.js`: gọi API, render bảng/biểu đồ, export Excel
- `data/orders.json`: lưu dữ liệu đơn (mức đơn giản)

## 3) Chạy local

```bash
npm install
cp .env.example .env
npm run dev
```

Mở: `http://localhost:3000`

## 4) API chính

### POST `/check-order`
Input:

```json
{ "order_id": "string" }
```

Output mẫu:

```json
{
  "order_id": "TT123",
  "scanned_at": "2026-04-08T10:00:00.000Z",
  "tiktok_status": "ready_to_ship",
  "mapped_status": "CHƯA ĐƯỢC LẤY",
  "is_duplicate": false,
  "is_canceled": false,
  "is_picked": false
}
```

### GET `/orders?q=&date=&status=`
Lấy lịch sử quét có filter.

### GET `/stats`
Lấy số liệu dashboard.

### GET `/missing-picked`
Lấy danh sách đơn đã quét nhưng chưa được lấy.

## 5) Kết nối TikTok API thật

- Đặt `TIKTOK_MOCK=false`
- Cập nhật `TIKTOK_ACCESS_TOKEN`
- Nếu endpoint/order version khác, sửa trong hàm `getTikTokOrderStatus`.

## 6) Deploy

### Backend (Render / Railway)

1. Push repo lên GitHub
2. Tạo service Node.js
3. Build command: `npm install`
4. Start command: `npm start`
5. Thêm env vars như `.env.example`

### Frontend GitHub Pages

Vì frontend hiện đang được serve từ backend Express để tránh CORS/phân tách API base URL, có 2 cách:

- **Khuyến nghị thực tế**: deploy cả fullstack trên Render/Railway (đơn giản hơn)
- **Nếu bắt buộc Pages**:
  - Tách `public/` thành repo frontend riêng
  - Đổi `API_BASE` trong `public/script.js` thành URL backend Render/Railway
  - Bật CORS ở backend

## 7) Mở rộng cho production

- Chuyển từ file JSON sang Firebase Realtime Database / PostgreSQL
- Thêm auth tài khoản nhân viên kho
- Thêm webhook đồng bộ trạng thái TikTok định kỳ (cron)
- Audit log + phân quyền role vận hành/leader
