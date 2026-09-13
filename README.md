# 🚀 OPC Freedom Community Client (Phiên Bản Miễn Phí Tặng Cộng Đồng)

**Hệ Điều Hành Tự Động Hóa Vận Hành & Tiếp Thị Đa Kênh 1-Click Dành Cho Mọi Doanh Nghiệp**

Được phát triển và đóng gói bởi đội ngũ **OPC Freedom**, phiên bản này được phát hành hoàn toàn miễn phí theo **Giấy phép mã nguồn mở MIT** nhằm giúp các chủ doanh nghiệp, nhà bán hàng, chuyên viên tiếp thị và lập trình viên tự động hóa toàn diện quy trình tiếp cận khách hàng trên Internet.

---

## 🌟 7 Tính Năng Tự Động Hóa Vượt Trội

1. **🖥️ Màn Hình Máy Tính Ảo (Cloud Desktop 1600x900 HD+ - Cổng 6080):**
   - Tích hợp sẵn giao diện máy tính Linux ảo hóa chạy trực tiếp trên trình duyệt web với độ phân giải **1600x900 HD+** sắc nét, tự động co giãn màn hình (Auto Scaling).
   - Tự động duy trì và điều khiển đồng thời **11 Kênh Mạng Xã Hội** (Facebook, TikTok, YouTube, Threads, X, Instagram, Zalo, Telegram...).
2. **📊 Bảng Điều Khiển Quản Trị Trung Tâm (Web Dashboard - Cổng 3001):**
   - Quản lý kênh tiếp thị, chiến dịch nội dung tự động, danh mục sản phẩm và hồ sơ chăm sóc khách hàng (CRM).
3. **⚡ Bộ Kịch Bản Tự Động Hóa Sẵn Có (Pre-built Automation Workflows):**
   - **Kịch bản 1 - Sáng Tạo & Đăng Bài Tự Động (DAG 01):** AI tự viết bài, gắn hình ảnh và tự động phân phối nội dung lên nhiều nền tảng cùng lúc.
   - **Kịch bản 2 - Tối Ưu Chiến Dịch Quảng Cáo (DAG 02 - Facebook Ads CBO):** Tự động theo dõi ngân sách, tối ưu chi phí và điều chỉnh chiến dịch quảng cáo.
   - **Kịch bản 3 - Chatbot Tư Vấn & Sàng Lọc Khách Hàng (DAG 03):** Tự động chào đón, giải đáp thắc mắc, tư vấn sản phẩm và thu thập thông tin khách hàng 24/7 với cơ chế chống nghẽn và khử trùng tin nhắn.
   - **Kịch bản Mẫu - Bất Động Sản AutoPilot:** Quy trình mẫu giúp doanh nghiệp dễ dàng tùy biến cho ngành nghề riêng.
4. **🧪 Phòng Thử Nghiệm Trực Quan (Visual Test Studio - Cổng 3001/test-studio.html):**
   - Nút bấm **1-Click Mở Nhanh Đa Kênh** (Telegram Web, Gemini AI, Zalo, Facebook, GitHub) trực tiếp cho từng hồ sơ profile trên màn hình noVNC.
   - Hỗ trợ chạy kiểm thử trực quan (Visual Test) và kiểm thử ngầm (Headless Test) cho từng kịch bản tự động hóa.
5. **🍪 Bộ Công Cụ Nạp Cookie 1-Click (Bypass Quét Mã QR):**
   - Hỗ trợ nạp trực tiếp file JSON Cookie (src/import-cookies.js) vào profile trình duyệt, tự động đăng nhập nhanh chóng mà không cần thao tác thủ công.
6. **🤖 Trợ Lý Telegram Điều Khiển Từ Xa (Cổng 3003):**
   - Nhận báo cáo hoạt động và ra lệnh điều khiển hệ thống trực tiếp từ điện thoại thông qua ứng dụng Telegram cá nhân.
7. **🎨 Trình Thiết Kế Website Bán Hàng 1-Click (Web Studio - Cổng 5173):**
   - Tự động tạo và xuất bản Landing Page / Website bán hàng chuyên nghiệp chỉ trong vài phút.

---

## 🛠️ Hướng Dẫn Cài Đặt 1-Click (Cực Kỳ Đơn Giản)

### Yêu Cầu Trước Khi Cài:
- Máy tính hoặc máy chủ VPS đã cài đặt **Docker** & **Docker Compose** (Hỗ trợ tốt trên Windows, Linux Ubuntu, macOS).
- Cấu hình đề xuất: RAM từ 4GB trở lên.

### 3 Bước Khởi Chạy Nhanh:
```bash
# Bước 1: Tải mã nguồn về máy
git clone https://github.com/Army-Phan/opcfreedom-client-community.git
cd opcfreedom-client-community

# Bước 2: Tạo file cấu hình từ mẫu
cp .env.example .env

# Bước 3: Khởi chạy toàn bộ hệ thống bằng 1 lệnh duy nhất
docker compose up -d
```

Sau khi chạy xong, bạn mở trình duyệt và truy cập các cổng:
- 🌐 **Bảng điều khiển quản trị:** `http://localhost:3001`
- 🧪 **Phòng thử nghiệm trực quan (Test Studio):** `http://localhost:3001/test-studio.html`
- 🖥️ **Màn hình máy tính ảo (11 kênh mạng xã hội):** `http://localhost:6080`
- 🎨 **Trình thiết kế website bán hàng:** `http://localhost:5173`

---

## 💡 So Sánh Bản Miễn Phí & Gói Thành Viên Nâng Cao

| Hạng Mục | 🎁 Bản Cộng Đồng (Free Community) | 👑 Gói Thành Viên Nâng Cao (VIP Membership) |
|---|---|---|
| **Mã Nguồn Cài Đặt** | Miễn phí 100% (Mã nguồn mở MIT) | Miễn phí 100% + Mã kích hoạt VIP |
| **Kịch Bản Sẵn Có** | Bộ kịch bản cốt lõi (Đăng bài, Chạy Ads, Chatbot, Mẫu BĐS) | Toàn bộ bộ kịch bản tự động hóa nâng cao chuyên sâu |
| **Mở Rộng Tính Năng** | • Tự lập trình thêm kịch bản<br>• Hoặc thuê **Dịch vụ May Đo Theo Yêu Cầu** | Được đội ngũ kỹ sư hỗ trợ nạp sẵn và nâng cấp định kỳ |
| **Hỗ Trợ Kỹ Thuật** | Hỗ trợ qua nhóm cộng đồng | Hỗ trợ kỹ thuật 1-1 chuyên sâu từ chuyên gia |

---

## 🆕 Nhật Ký Bản Cập Nhật (Release Highlights - v4.2.1)

- 🖥️ **Hiển Thị Chuẩn 1600x900 HD+:** Tối ưu hóa độ phân giải noVNC, tự động co giãn (Scale) vừa vặn khung hình và bổ sung cờ bàn phím ảo `-xkb`.
- ⚡ **Khử Trùng Lặp & Hàng Đợi Đa Kênh:** Chat Gateway trang bị cơ chế tuần tự hóa hàng đợi tin nhắn (Queue Serialization) và bộ lọc trùng lặp (Deduplication Guard) chống spam tin nhắn.
- 🛡️ **Chống Đơ / Freeze Ứng Dụng SPA:** Nâng cấp phương thức tiêm lắng nghe DOM an toàn sau khi trang tải xong, tương thích hoàn hảo với Zalo Web, Telegram Web A, TikTok.
- 🚀 **Nút Khởi Chạy Nhanh trên Test Studio:** 1-Click mở trực tiếp các tài khoản Telegram, Gemini AI, Zalo, Facebook, GitHub trên giao diện Visual Test Studio.
- 🍪 **Công Cụ Nạp Cookie Tiện Lợi:** Thêm script `src/import-cookies.js` nạp file JSON cookie tự động.

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
