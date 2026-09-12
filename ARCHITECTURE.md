# 🏗️ KIẾN TRÚC HỆ THỐNG OPC CLIENT COMMUNITY NODE

Tài liệu này mô tả chi tiết kiến trúc của **OPC Freedom Community Client Node**, sự tương thích với hệ thống **Core HQ** và quy trình may đo mở rộng thông qua **DAG 17**.

---

## 1. Cấu Trúc 3-Container Độc Lập

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      OPC CLIENT COMMUNITY NODE (DOCKER)                         │
├────────────────────────────────┬────────────────────────┬───────────────────────┤
│ Container 1: Web Dashboard     │ Container 2: OS Agent  │ Container 3: Master   │
│ (Port 3001 / noVNC 6080)       │ (Port 3002)            │ Telegram Bot (Port 3003)
├────────────────────────────────┼────────────────────────┼───────────────────────┤
│ • Xubuntu Mini-OS + noVNC      │ • OS Automation Runner │ • Telegram Bot riêng  │
│ • Local DAG Engine (20 DAGs)   │ • Mouse/Keyboard Ctrler│ • Quản trị từ xa      │
│ • Local Store (CME, CRM, Chan) │ • Health Monitor       │ • Báo cáo sự cố       │
│ • Web Studio (Port 5173)       │                        │                       │
└────────────────────────────────┴────────────────────────┴───────────────────────┘
                                 │
                         (Volume Mount: ./data)
                                 │
                                 ▼
                     Cơ sở dữ liệu cục bộ & DAGs
```

---

## 2. Quy Trình May Đo Mở Rộng Qua DAG 17 (Custom R&D Lifecycle)

Khi khách hàng hoặc thành viên cộng đồng có nhu cầu mở rộng thêm các DAGs mới:

1. **Khách hàng Fork/Clone** repo này lên tài khoản GitHub riêng.
2. **Tạo Ticket DAG 17** tại hệ sinh thái OPC Freedom.
3. **Core HQ / Client 0** tiếp nhận, AI thẩm định độ phức tạp, báo giá và nhận cọc 50%.
4. **Dev Pool** nhận task, lập trình các node/handler mới và kiểm thử trên Sandbox.
5. **Nghiệm thu & Bàn giao:** Code được commit trực tiếp vào GitHub của khách hàng và nạp vào thư mục `data/dags/` trên máy trạm của họ.

---

## 3. Liên Hệ & Hỗ Trợ
- **Website:** https://opcfreedom.com
- **Trung tâm Hỗ trợ Kỹ thuật & May đo DAG 17:** Contact qua Master Bot hoặc Hotline Core HQ.
