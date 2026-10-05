# 🚀 OPC Freedom Community Client (Phiên Bản Miễn Phí Tặng Cộng Đồng)

**Hệ Điều Hành Tự Động Hóa Vận Hành & Tiếp Thị Đa Kênh 1-Click Dành Cho Mọi Doanh Nghiệp**

Được phát triển và đóng gói bởi đội ngũ **OPC Freedom**, phiên bản này được phát hành hoàn toàn miễn phí theo **Giấy phép mã nguồn mở MIT** nhằm giúp các chủ doanh nghiệp, nhà bán hàng, chuyên viên tiếp thị và lập trình viên tự động hóa toàn diện quy trình tiếp cận khách hàng trên Internet.

---

## 🌟 Các Tính Năng Tự Động Hóa Vượt Trội

1. **🖥️ Màn Hình Máy Tính Ảo (Cloud Desktop 1600x900 HD+ - Cổng 6080):**
   - Tích hợp sẵn giao diện máy tính Linux ảo hóa chạy trực tiếp trên trình duyệt web với độ phân giải **1600x900 HD+** sắc nét, tự động co giãn màn hình (Auto Scaling).
   - Tự động duy trì và điều khiển đồng thời **11 Kênh Mạng Xã Hội** (Facebook, TikTok, YouTube, Threads, X, Instagram, Zalo, Telegram...).
2. **📊 Bảng Điều Khiển Quản Trị Trung Tâm (Web Dashboard - Cổng 3001):**
   - Quản lý kênh tiếp thị, chiến dịch nội dung tự động, danh mục sản phẩm và hồ sơ chăm sóc khách hàng (CRM).
3. **⚡ Bộ Kịch Bản Tự Động Hóa Cốt Lõi (Pre-built Automation Workflows):**
   - **Kịch bản 1 - Sáng Tạo & Đăng Bài Tự Động (DAG 01):** AI tự viết bài, gắn hình ảnh và tự động phân phối nội dung lên nhiều nền tảng cùng lúc.
   - **Kịch bản 2 - Tối Ưu Chiến Dịch Quảng Cáo (DAG 02 - Facebook Ads CBO):** Tự động theo dõi ngân sách, tối ưu chi phí và điều chỉnh chiến dịch quảng cáo.
   - **Kịch bản 3 - Chatbot Tư Vấn & Sàng Lọc Khách Hàng (DAG 03):** Tự động chào đón, giải đáp thắc mắc, tư vấn sản phẩm và thu thập thông tin khách hàng 24/7 với cơ chế chống nghẽn và khử trùng tin nhắn.
   - **Kịch bản Mẫu - Bất Động Sản AutoPilot:** Quy trình mẫu giúp doanh nghiệp dễ dàng tùy biến cho ngành nghề riêng.
4. **🍪 Bộ Công Cụ Nạp Cookie 1-Click (Bypass Quét Mã QR):**
   - Hỗ trợ nạp trực tiếp file JSON Cookie (`src/import-cookies.js`) vào profile trình duyệt, tự động đăng nhập nhanh chóng mà không cần thao tác thủ công.
5. **🤖 Trợ Lý Telegram Điều Khiển Từ Xa (Cổng 3003):**
   - Nhận báo cáo hoạt động và ra lệnh điều khiển hệ thống trực tiếp từ điện thoại thông qua ứng dụng Telegram cá nhân.
6. **🎨 Trình Thiết Kế Website Bán Hàng 1-Click (Web Studio - Cổng 5173):**
   - Tự động tạo và xuất bản Landing Page / Website bán hàng chuyên nghiệp chỉ trong vài phút.

---

## 🛠️ Hướng Dẫn Cài Đặt & Triển Khai Docker 1-Click

### 1. Yêu Cầu Môi Trường:
- Máy tính cá nhân (Windows Docker Desktop, macOS) hoặc máy chủ VPS (Ubuntu 22.04 / 24.04 LTS).
- Đã cài đặt **Docker** & **Docker Compose**.
- Cấu hình đề xuất: RAM từ **4GB** trở lên, ổ cứng trống từ **15GB**.

### 2. Cấu Hình Tường Lửa UFW (Dành cho VPS Ubuntu):
Nếu bạn triển khai trên máy chủ VPS Public, hãy mở các cổng dịch vụ cần thiết:
```bash
sudo ufw allow 22/tcp      # SSH quản trị
sudo ufw allow 3001/tcp    # Web Dashboard quản trị
sudo ufw allow 6080/tcp    # Màn hình máy tính ảo noVNC
sudo ufw allow 5173/tcp    # Web Studio thiết kế Landing Page
sudo ufw allow 3003/tcp    # Telegram Bot Runner
sudo ufw enable
```

### 3. Khởi Chạy Nhanh Trong 3 Bước:
```bash
# Bước 1: Tải mã nguồn về máy
git clone https://github.com/Army-Phan/opcfreedom-client-community.git
cd opcfreedom-client-community

# Bước 2: Tạo file cấu hình từ mẫu
cp .env.example .env

# Bước 3: Khởi chạy toàn bộ hệ thống bằng Docker Compose
docker compose up -d
```

Sau khi khởi chạy xong, bạn mở trình duyệt và truy cập các cổng:
- 🌐 **Bảng điều khiển quản trị:** `http://localhost:3001` (hoặc `http://<IP_VPS>:3001`)
- 🖥️ **Màn hình máy tính ảo (11 kênh mạng xã hội):** `http://localhost:6080` (hoặc `http://<IP_VPS>:6080/vnc.html`)
- 🎨 **Trình thiết kế website bán hàng:** `http://localhost:5173` (hoặc `http://<IP_VPS>:5173`)

### 4. Đăng Nhập & Bảo Lưu Phiên Mạng Xã Hội:
* **Cách 1 (Trực quan qua màn hình ảo):** Truy cập `http://localhost:6080/vnc.html`, mở trình duyệt Chromium và đăng nhập tài khoản Zalo, Facebook, TikTok, YouTube... Phiên đăng nhập được tự động bảo lưu bền vững trong thư mục `./data/browser_profiles/` trên máy của bạn.
* **Cách 2 (Nạp Cookies JSON 1-Click):** Xuất cookie dạng JSON (từ tiện ích J2Team hoặc EditThisCookie) và chạy lệnh:
  ```bash
  docker compose exec opc-client-dashboard node src/import-cookies.js /app/data/my_cookies.json
  ```

---

## 💡 So Sánh Bản Miễn Phí & Gói Thành Viên Nâng Cao

| Hạng Mục | 🎁 Bản Cộng Đồng (Free Community) | 👑 Gói Thành Viên Nâng Cao (VIP Membership) |
|---|---|---|
| **Mã Nguồn Cài Đặt** | Miễn phí 100% (Mã nguồn mở MIT) | Miễn phí 100% + Mã kích hoạt VIP |
| **Quy Trình Triển Khai** | Tự dựng Docker và tự quản trị hạ tầng | **DA (DevOps Agent)** tự động SSH cài đặt trọn gói A-Z trong <3 phút |
| **Kịch Bản Sẵn Có** | Bộ kịch bản cốt lõi (Đăng bài, Chạy Ads, Chatbot, Mẫu BĐS) | Toàn bộ bộ kịch bản tự động hóa nâng cao chuyên sâu (DAG 04 - 20) |
| **Tự Vá Lỗi Giao Diện (Self-Healing)** | Tự kiểm tra qua noVNC hoặc cập nhật selector thủ công | **TA (Tester Agent)** tự động phát hiện lỗi DOM và bắn bản vá hot-patch từ xa |
| **Quản Trị & Cảnh Báo Hạ Tầng** | Tự theo dõi RAM, CPU và restart container | **DA** quét nhịp tim 24/7, tự dọn Chrome zombie, giải phóng RAM |
| **Pháp Lý & Tín Dụng** | Tự quản lý | Được **BA (BizOps Agent)** bảo trợ thuế Mắt Bão và hỗ trợ hồ sơ tín dụng 1.5 Tỷ |
| **Hỗ Trợ Kỹ Thuật** | Hỗ trợ qua nhóm cộng đồng | Hỗ trợ kỹ thuật 1-1 chuyên sâu từ chuyên gia |

---

## 🆕 Nhật Ký Bản Cập Nhật (Release Highlights - v4.2.1)

- 🖥️ **Hiển Thị Chuẩn 1600x900 HD+:** Tối ưu hóa độ phân giải noVNC, tự động co giãn (Scale) vừa vặn khung hình và bổ sung cờ bàn phím ảo `-xkb`.
- ⚡ **Khử Trùng Lặp & Hàng Đợi Đa Kênh:** Chat Gateway trang bị cơ chế tuần tự hóa hàng đợi tin nhắn (Queue Serialization) và bộ lọc trùng lặp (Deduplication Guard) chống spam tin nhắn.
- 🛡️ **Chống Đơ / Freeze Ứng Dụng SPA:** Nâng cấp phương thức tiêm lắng nghe DOM an toàn sau khi trang tải xong, tương thích hoàn hảo với Zalo Web, Telegram Web A, TikTok.
- 🍪 **Công Cụ Nạp Cookie Tiện Lợi:** Thêm script `src/import-cookies.js` nạp file JSON cookie tự động.
- 🔒 **Độc Lập & Bảo Mật 100% (Standalone):** Loại bỏ toàn bộ phụ thuộc máy chủ trung ương, đảm bảo quyền riêng tư tuyệt đối cho người tự host.

---

## 🚀 Dịch Vụ Lập Trình & May Đo Kịch Bản Theo Yêu Cầu

Nếu doanh nghiệp của bạn có quy trình vận hành đặc thù (như: cào dữ liệu thị trường tự động, tích hợp phần mềm kế toán/ERP nội bộ, bot chốt đơn tự động chuyên ngành):

👉 Bạn có thể liên hệ với **Đội ngũ Kỹ sư OPC Freedom** để được tư vấn và may đo giải pháp:
1. Đội ngũ kỹ sư sẽ phân tích nhu cầu và lên giải pháp tối ưu cho doanh nghiệp của bạn.
2. Lập trình, kiểm thử an toàn và bàn giao tích hợp trực tiếp vào hệ thống của bạn.

---

## 📜 Giấy Phép & Bản Quyền (MIT License)

Mã nguồn **OPC Freedom Community Client** được phát hành công khai và miễn phí theo **[Giấy phép MIT (MIT License)](LICENSE)**.

* **Quyền hạn của bạn:** Bạn được toàn quyền sử dụng miễn phí, sao chép, chỉnh sửa, tích hợp vào các dự án cá nhân hoặc thương mại.