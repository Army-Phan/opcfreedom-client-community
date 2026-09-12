# 🏗️ KIẾN TRÚC HỆ THỐNG OPC FREEDOM CLIENT

Tài liệu này mô tả cấu trúc kỹ thuật của hệ thống **OPC Freedom Client**, cách các thành phần phối hợp với nhau và hướng dẫn mở rộng kịch bản tự động hóa cho doanh nghiệp.

---

## 1. Cấu Trúc 3 Thành Phần Ảo Hóa (Docker Microservices)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        HỆ ĐIỀU HÀNH OPC FREEDOM CLIENT                          │
├────────────────────────────────┬────────────────────────┬───────────────────────┤
│ Thành phần 1: Web Dashboard    │ Thành phần 2: OS Agent │ Thành phần 3: Master  │
│ (Cổng 3001 / noVNC 6080)       │ (Cổng 3002)            │ Telegram Bot (Cổng 3003)
├────────────────────────────────┼────────────────────────┼───────────────────────┤
│ • Giao diện máy tính ảo noVNC  │ • Robot điều khiển máy │ • Trợ lý Telegram     │
│ • Động cơ kịch bản tự động hóa │ • Thao tác chuột/phím  │ • Báo cáo từ xa       │
│ • Quản lý kênh, nội dung, CRM  │ • Giám sát tiến trình  │ • Nhận lệnh điều khiển│
│ • Trình thiết kế Web (Cổng 5173)│                        │                       │
└────────────────────────────────┴────────────────────────┴───────────────────────┘
                                 │
                         (Thư mục lưu trữ: ./data)
                                 │
                                 ▼
                 Dữ liệu hoạt động, cấu hình & kịch bản
```

---

## 2. Quy Trình May Đo & Nâng Cấp Kịch Bản Tự Động Hóa

Khi doanh nghiệp có nhu cầu mở rộng thêm các kịch bản tự động hóa mới:

1. **Khách hàng cung cấp yêu cầu:** Nêu rõ quy trình cần tự động hóa (Ví dụ: Chốt đơn tự động, cào dữ liệu đối thủ, đồng bộ kho hàng).
2. **Đội ngũ Kỹ sư OPC Freedom tiếp nhận:** Phân tích quy trình, lên kịch bản mẫu và báo giá triển khai.
3. **Phát triển & Kiểm thử:** Kỹ sư tiến hành lập trình kịch bản và chạy thử nghiệm an toàn trong môi trường cách ly.
4. **Bàn giao & Vận hành:** Kịch bản hoàn chỉnh được nạp thẳng vào thư mục `data/dags/` trên máy của khách hàng và bắt đầu tự động vận hành.

---

## 3. Thông Tin Liên Hệ & Hỗ Trợ
- **Website chính thức:** https://opcfreedom.com
- **Nhóm Cộng đồng & Hỗ trợ Kỹ thuật:** Liên hệ qua Telegram Bot hoặc hotline hỗ trợ OPC Freedom.
