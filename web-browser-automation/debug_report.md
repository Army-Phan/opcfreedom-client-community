# Báo Cáo Phân Tích & Vá Lỗi Khẩn Cấp (Hotfix Report)
**Bug ID**: `BUG-RUNNER-TEMPLATE-RESOLVE`
**Quy trình áp dụng**: `hotfix_cycle.md`
**Đối tượng điều tra**: `src/runner.js` (Hàm `executeTool`)

---

## 1. Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis - Debugger Phase)

### Hiện tượng báo cáo:
Khi chạy quy trình tìm kiếm Google (`Test_1_Google Search`), thay vì điền từ khóa thực tế (ví dụ: `biztada` hay `xin chào`) vào ô tìm kiếm (`#APjFqb`), trình duyệt lại nhập nguyên văn chuỗi tham số **`{{query}}`** (hiển thị rõ trên màn hình Live Viewport: `q {{query}}`).

### Nguyên nhân kỹ thuật chính xác:
Trong vòng lặp thực thi các bước (`executeTool` trong `src/runner.js`), thứ tự xử lý biến mẫu (`Template Resolution`) và kiểm tra đầu vào (`Check And Prompt Input`) bị sai lệch:

```javascript
// Dòng 210-212 (HIỆN TẠI - BỊ LỖI):
const resolvedValueTemplate = resolveTemplate(step.value, runInputs);
let resolvedValue = resolvedValueTemplate;
let resolvedSelector = resolveTemplate(step.selector, runInputs);

// Dòng 266-267: Kiểm tra nếu thiếu biến thì tạm dừng để hỏi người dùng
await checkAndPromptInput(step.value);
await checkAndPromptInput(step.selector);

// Dòng 321: Thực thi nhập liệu
case 'fill':
  await humanType(page, currentSelector, resolvedValue);
```

1. **Lỗi thời điểm biên dịch biến**: Khi vòng lặp bước 2 (`fill #APjFqb` với `value: "{{query}}"`) bắt đầu, hàm `resolveTemplate(step.value, runInputs)` được gọi **NGAY ĐẦU TIÊN** (tại dòng 210).
2. Nếu tại thời điểm đó `runInputs` chưa có giá trị `query` (do người dùng bấm chạy nhanh hoặc chưa nhập trước), `resolveTemplate` sẽ trả về chuỗi nguyên văn `"{{query}}"`. Biến `resolvedValue` bị gán cứng bằng `"{{query}}"`.
3. Khi đến dòng 266, `await checkAndPromptInput(step.value)` phát hiện thiếu biến `query`, hệ thống tạm dừng và hiện hộp thoại yêu cầu người dùng nhập trên UI.
4. Người dùng gõ `biztada` và bấm gửi. Hàm `checkAndPromptInput` cập nhật thành công `runInputs['query'] = 'biztada'`.
5. **ĐIỂM GÃY (CRITICAL BUG)**: Sau khi `checkAndPromptInput` cập nhật `runInputs`, hệ thống **KHÔNG HỀ GỌI LẠI `resolveTemplate`** để biên dịch lại `resolvedValue` và `resolvedSelector`!
6. Do đó, `resolvedValue` vẫn giữ nguyên giá trị cũ là `"{{query}}"`. Đến dòng 321, lệnh `humanType(page, currentSelector, resolvedValue)` gõ thẳng chuỗi `"{{query}}"` vào Google!

---

## 2. Bản Vá Đề Xuất (Patch Proposal)

Để sửa triệt để lỗi này, chúng ta cần bổ sung bước **tái biên dịch biến (`Re-resolve templates`) ngay sau khi hoàn tất kiểm tra và nhận đầu vào từ người dùng (`checkAndPromptInput`)**.

### Đề xuất thay đổi code (`src/runner.js`):
```javascript
// Kiểm tra và hỏi người dùng nếu thiếu tham số
await checkAndPromptInput(step.value);
await checkAndPromptInput(step.selector);

// [HOTFIX] Tái biên dịch lại giá trị sau khi đã có đầy đủ đầu vào từ người dùng
resolvedValue = resolveTemplate(step.value, runInputs);
resolvedSelector = resolveTemplate(step.selector, runInputs);
```

---

## 3. Kế Hoạch Triển Khai Hotfix (Developer & Testing Phase)
1. **Developer**: Áp dụng bản vá vào `src/runner.js` tại dòng 268.
2. **Reviewer**: Đánh giá tính an toàn (không ảnh hưởng hiệu năng hay logic cũ).
3. **Tester**: Kiểm tra cú pháp (`node -c src/runner.js`) và xác nhận lỗi được khắc phục.
