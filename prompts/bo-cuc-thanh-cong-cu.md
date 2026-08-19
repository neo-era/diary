# Prompt — Thanh công cụ dọc bên trái (desktop) · menu trượt (mobile)

> Prompt tự chứa cho repo `diary` (app nhật ký thi công, một file `index.html` tĩnh).
> Đã thực hiện ngày 2026-08-19. Giữ lại để chạy lại, đối chiếu, hoặc giao cho session khác.

---

## Bối cảnh

`.toolbar` là một dải ngang `position: sticky` gồm 4 hàng nút, chiếm gần **1/3 chiều cao màn hình** ở laptop. Trang nhật ký `.page` nằm dưới nó nên vùng làm việc thật bị đẩy xuống và luôn phải cuộn.

**Mục tiêu:** máy tính → đưa toàn bộ công cụ sang **thanh dọc cố định bên trái**, bên phải hoàn toàn là trang nhật ký. Màn hình nhỏ → gom hết vào **menu trượt**, chỉ chừa một thanh mỏng cho thao tác dùng nhiều nhất là chuyển ngày.

`<body>` rất thuận lợi: chỉ có `.toolbar` → 3 modal → đúng **một** `.page#page`. Làm được gần như hoàn toàn bằng CSS, không đảo DOM, không đụng logic.

## Bố cục chốt

| | **≥ 1100px** | **< 1100px** |
|---|---|---|
| `.toolbar` | thanh dọc cố định bên **trái**, rộng **300px**, cuộn dọc riêng, luôn hiện | ngăn kéo trượt từ **trái**, ẩn mặc định, mở bằng nút menu |
| `.mobilebar` | ẩn | thanh mỏng cố định trên cùng: nút menu · `◀` · ô ngày · `▶` |
| `.page` | `margin: 14px auto` — tự canh giữa phần còn lại | như cũ |
| `body` | `padding-left: 300px` | `padding-top` = chiều cao `.mobilebar` |

**Ngưỡng 1100px, không phải 820px** — `.page` rộng cố định 210mm ≈ 794px; 794 + 300 + lề ⇒ hẹp hơn ~1100px là trang bị cuộn ngang. Style mobile sẵn có ở `max-width: 820px` giữ nguyên.

---

## Các bước thực hiện

### 1. DOM — thêm 2 khối, không di chuyển gì

Trước `.toolbar`:

```html
<div class="mobilebar">
  <button class="mb-menu" onclick="toggleMenu()" aria-label="Mở menu công cụ">☰</button>
  <button onclick="prevDay()" aria-label="Hôm trước">◀</button>
  <input type="date" id="datePickerTop" class="js-datepicker" onchange="onDatePickerChange(event)">
  <button onclick="nextDay()" aria-label="Hôm sau">▶</button>
</div>
```

Ngay sau `.toolbar`: `<div class="menu-overlay" onclick="closeMenu()"></div>`

Ngoài ra: `.toolbar` thêm `id="toolbar"`; `<h1>` thêm `<button class="tb-close" onclick="closeMenu()">×</button>`; `#datePicker` thêm class `js-datepicker`; thẻ `<a href="huong-dan.html">` bỏ inline style, đổi sang `class="tool-link"`.

### 2. CSS — 2 media query mới

Bắt buộc có chữ **`screen`** (thiếu là style lọt vào bản in — bẫy đã ghi trong `CLAUDE.md`):

- `@media screen and (min-width: 1100px)` — `body { padding-left: 300px }`; `.toolbar` fixed trái, `width: 300px`, `overflow-y: auto`, `flex-direction: column`, **`flex-wrap: nowrap`**; `.toolbar-row` cột; nút/select/`.tool-link` `width: 100%`.
- `@media screen and (max-width: 1099.98px)` — `.mobilebar { display: flex }`; `body { padding-top: calc(60px + env(safe-area-inset-top)) }`; `.toolbar` fixed trái, `width: min(320px, 88vw)`, `transform: translateX(-100%)`, `.toolbar.open { transform: translateX(0) }`, transition `.22s`; `.tb-close { display: block }`; font `16px`, `min-height: 44px`.

`@media print`: thêm `.mobilebar, .menu-overlay` vào danh sách `display: none !important`, và `body { padding: 0 !important }`.

### 3. JS

`toggleMenu()` / `openMenu()` / `closeMenu()` bật-tắt class `open` trên `#toolbar` + `.menu-overlay`. Thêm:

- listener `click` toàn cục: bấm `button`/`a.tool-link` **bên trong** ngăn kéo thì `closeMenu()` (bỏ qua `.tb-close` vì đã tự đóng); `select`/`input` thì giữ mở.
- `Escape` đóng ngăn kéo — chèn **sau** 3 modal trong handler `keydown` sẵn có (modal ưu tiên hơn).
- `resize` ≥ 1100px → `closeMenu()` để không kẹt lớp phủ.
- `refreshDatePicker()` đổi sang `querySelectorAll('.js-datepicker').forEach(...)` để đồng bộ cả 2 ô ngày (`value` + `min`).
- Filter auto-save debounce: thêm `'datePickerTop'`.

### 4. `sw.js` — tăng `VERSION`

---

## 3 cái bẫy đã trả giá — đừng lặp lại

1. **`flex-wrap: wrap` + `flex-direction: column` + chiều cao bị chặn = nút tràn sang cột thứ hai.** Base `.toolbar` có `flex-wrap: wrap`. Khi thành `position: fixed` với `bottom: 0` rồi xếp cột, các nút vượt chiều cao **wrap sang một cột mới nằm ngoài màn hình** — nhìn như một dải nút bị cắt ở mép phải. Phải `flex-wrap: nowrap` và để `overflow-y: auto` lo cuộn. Test đo `tb.scrollWidth > tb.clientWidth` sẽ bắt được.
2. **`.toolbar button` (0,2,0) đè `.tb-close` (0,1,0).** Quy tắc cho nút giãn hết bề ngang kéo luôn nút `×` rộng bằng cả ngăn kéo (280px). Viết `.toolbar button:not(.tb-close)` thay vì tăng specificity cho `.tb-close`.
3. **Đừng đo layout ngay sau `setViewport`.** Ngăn kéo có `transition: transform .22s`; đo ở 120ms sẽ bắt được trạng thái đang chạy dở và báo "ngăn kéo còn hiện". Chờ ≥ 350ms. Tương tự, `position: fixed` neo theo `clientWidth` (**không** kể thanh cuộn) nên assertion phải so với `document.documentElement.clientWidth`, không phải `window.innerWidth`.

---

## Kiểm tra

Chạy qua `http://localhost:...` (không `file://`), hard-reload `Ctrl+Shift+R`.

1. **1440 / 1280 / 1100px** — thanh dọc đúng 300px sát mép trái, xếp dọc, `body` có `padding-left: 300px`; **không nút nào tràn sang cột thứ hai** (`scrollWidth ≈ clientWidth`); trang nhật ký không bị đè; không cuộn ngang.
2. **1099 / 1024 / 820 / 390px** — thanh dọc trượt hẳn ra ngoài, `.mobilebar` hiện, `body` có `padding-top`, không cuộn ngang.
3. **Ngăn kéo** — nút menu mở; bấm nền mờ (phần **bên phải** ngăn kéo, không phải giữa màn hình vì chỗ đó bị ngăn kéo che) / `×` / `Esc` đều đóng.
4. **Bấm nút trong ngăn kéo** (VD `Hôm nay`) → thực thi **và** đóng; bấm `#projectSelect` → **không** đóng.
5. **Hai ô ngày đồng bộ** — đổi ở `.mobilebar` → `#datePicker` cùng giá trị và ngược lại; cả hai có `min = startDate`.
6. **Không kẹt trạng thái** — mở ngăn kéo ở 800px rồi kéo rộng ra 1400px → hết nền mờ, thanh dọc đúng chỗ.
7. **Chạm** — nút menu và nút `×` đều ≥ 44×44px; nút `×` không bị kéo giãn.
8. **Xuất PDF ở cả 2 breakpoint** — khung ẩn vẫn đúng 2 trang, bề rộng 794px, `left = -99999` (không bị `body { padding-left }` đẩy lệch). Đây là chỗ dễ vỡ nhất vì html2pdf từng dính lỗi lệch tọa độ.
9. **Ctrl+P** — `.toolbar`, `.mobilebar`, nền mờ đều ẩn; `body` không còn padding.
10. **Modal** — `+ Cuốn mới`, `Thông tin quyển`, `Dự báo` mở/đóng đúng ở cả 2 bố cục; `Esc` ưu tiên đóng modal trước ngăn kéo.
11. **Không hồi quy** — 2 bộ e2e cũ (kế thừa ngày mới, kế thừa cuốn mới) vẫn pass; không lỗi JS.
