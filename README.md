# 🚀 OPC Freedom Community Client Node (Official Client Release)

Chào mừng bạn đến với **OPC Freedom Community Client Node** — Hệ điều hành tự động hóa doanh nghiệp mini 1-Click (Autonomous Business OS) được đóng gói và phát hành chính thức bởi **OPC Freedom HQ**.

Phiên bản này được thiết kế để **tặng cộng đồng** trải nghiệm sức mạnh của mô hình tự động hóa quy trình đa kênh (Social Media, Content CME, CRM, Local DAG Engine, noVNC Cloud Desktop).

---

## 🌟 Tính Năng Nổi Bật

1. **🖥️ Xubuntu Cloud Desktop (noVNC Port 6080):**
   - Môi trường Desktop ảo hóa hoàn chỉnh chạy trong Docker.
   - Tự động duy trì 11 Tabs mạng xã hội (Facebook, TikTok, YouTube, Threads, X, Instagram, Zalo, Telegram...).
2. **📊 Client Web Dashboard (Port 3001):**
   - Quản lý kênh bán hàng, chiến dịch nội dung (CME), sản phẩm và CRM khách hàng cục bộ.
3. **⚡ Local DAG Engine (Động cơ Thực thi Quy trình Tự động):**
   - Bộ 20 DAG templates chuẩn hóa giúp tự động hóa từ A-Z (chăm sóc khách hàng, phân phối nội dung, nuôi kênh).
4. **🤖 Master Telegram Bot Riêng (Port 3003):**
   - Cho phép bạn chỉ huy và nhận báo cáo từ máy trạm trực tiếp qua Telegram cá nhân.
5. **🎨 Local Web Studio & Cloudflare Deployer (Port 5173):**
   - Thiết kế và xuất bản Landing Page / Website tự động hóa chỉ trong vài phút.

---

## 💎 Phân Định Gói Sử Dụng & Mở Rộng

| Hạng Mục | 🎁 Thành Viên Cộng Đồng (Free Community) | 👑 Thành Viên Trả Phí (Paid Membership / VIP) |
|---|---|---|
| **Mã Nguồn Cài Đặt** | Bản phát hành này (Độc lập 100%) | Bản phát hành này + Key VIP kích hoạt |
| **Số Lượng DAGs** | Bộ 20 Template DAGs cơ bản | Full DAGs nâng cao + Độc quyền từ Core |
| **Mở Rộng Tính Năng** | • Tự code thêm DAGs<br>• Hoặc thuê **Dịch vụ DAG 17 (Custom R&D)** | Được đội ngũ Core HQ / Client 0 hỗ trợ nạp sẵn và nâng cấp |
| **Hỗ Trợ Kỹ Thuật** | Hỗ trợ qua Group Cộng đồng | Hỗ trợ 1-1 chuyên sâu từ Mentor |

---

## 🛠️ Hướng Dẫn Cài Đặt 1-Click (Quick Start)

### Yêu Cầu Hệ Thống
- Đã cài đặt **Docker** và **Docker Compose** (trên Windows, Ubuntu VPS hoặc macOS).
- RAM tối thiểu 4GB (Khuyến nghị 8GB).

### Các Bước Khởi Chạy:
```bash
# 1. Clone repository
git clone https://github.com/opcfreedom/opcfreedom-client-community.git
cd opcfreedom-client-community

# 2. Tạo file cấu hình từ mẫu
cp .env.example .env

# 3. Khởi chạy 1 lệnh duy nhất
docker compose up -d
```

Sau khi khởi chạy thành công:
- 🌐 **Web Dashboard:** Truy cập `http://localhost:3001`
- 🖥️ **Màn hình noVNC Desktop:** Truy cập `http://localhost:6080`
- 🎨 **Web Studio:** Truy cập `http://localhost:5173`

---

## 🔒 Bản Quyền & Định Danh Máy Trạm (DRM)

Bản phát hành này tích hợp sẵn mã kích hoạt cộng đồng miễn phí: `OPC-COMMUNITY-FREE-2026`.
Khi máy trạm của bạn khởi chạy:
- Hệ thống sẽ gửi nhịp tim (Heartbeat) định kỳ về **Core HQ** để nhận thẻ bài hoạt động (`Lease Token` hiệu lực 72 giờ, hỗ trợ chạy Offline).
- Core HQ lưu trữ thông tin định danh máy trạm (HWID, IP, Hostname) để phục vụ hỗ trợ kỹ thuật và quản lý nâng cấp gói VIP khi bạn có nhu cầu.

---

## 🚀 Đặt Hàng May Đo Tính Năng Riêng (Dịch Vụ DAG 17)

Nếu doanh nghiệp của bạn có quy trình đặc thù cần tự động hóa riêng (ví dụ: cào dữ liệu sàn TMĐT, tích hợp ERP nội bộ, bot chốt sale tự động):
👉 Bạn hoàn toàn có thể sử dụng **Dịch vụ DAG 17 (Custom R&D & Handover)** từ đội ngũ **Client 0 (Genesis Hub)** của OPC Freedom:
1. Bạn chỉ cần cung cấp link GitHub repo riêng của bạn.
2. Đội ngũ AI & Dev chuyên nghiệp của OPC Freedom sẽ phân tích, lập trình, chạy kiểm thử tự động (Sandbox Tests) và chuyển giao module hoàn chỉnh trực tiếp vào máy trạm của bạn.

---


---

## 📜 Giấy Phép & Bản Quyền (MIT License)

Mã nguồn **OPC Freedom Community Client Node** được phát hành công khai và miễn phí theo **[Giấy phép MIT (MIT License)](LICENSE)**.

* **Quyền hạn của bạn:** Bạn được toàn quyền sử dụng miễn phí, sao chép, chỉnh sửa, phân phối và tích hợp vào các dự án cá nhân hoặc thương mại.
* **Quyền lợi mở rộng:** Bạn có thể tự do phát triển thêm các module DAGs riêng hoặc sử dụng dịch vụ **DAG 17 (Custom R&D)** từ đội ngũ Client 0 để được chuyển giao công nghệ may đo chuyên sâu.
