# Prompt — Tạo cuốn mới kế thừa cuốn đã có + modal chọn ngày

> Prompt tự chứa cho repo `diary` (app nhật ký thi công, một file `index.html` tĩnh).
> Đã thực hiện ngày 2026-08-19. Giữ lại để chạy lại, đối chiếu, hoặc giao cho session khác.
> Nối tiếp [ke-thua-du-lieu-ngay-moi.md](ke-thua-du-lieu-ngay-moi.md) — dùng lại `prevWorkEntryOf` từ lần đó.

---

## Bối cảnh

Hai vấn đề của luồng `+ Cuốn mới` cũ:

1. **Không kế thừa được gì.** `createProject()` luôn gán `items: deepCopy(tpl.items)`, `rep_a/rep_b` từ `tpl.sign`, rồi `ensureProjectMeta()` back-fill `zones`/`book` từ template. Mỗi lần mở quyển mới cho cùng một gói thầu (tháng sau, năm sau), người dùng phải dựng lại từ đầu: sửa lại tên/số địa bàn, gõ lại hạng mục đã tùy chỉnh, nhập lại bìa/Tr1/Tr2, đặt lại chữ ký, nhập lại khối lượng — trong khi quyển mới thường **giống hệt quyển cũ về cấu hình**, chỉ khác ngày bắt đầu.
2. **Nhập ngày bằng tay.** `newProject()` là một chuỗi 4 hộp `prompt()`, trong đó ngày bắt đầu phải gõ đúng dạng `YYYY-MM-DD` — dễ sai, không có lịch để bấm.

**Mục tiêu:** thay chuỗi `prompt()` bằng một modal có `<input type="date">`, và cho chọn một cuốn đã có làm nguồn để mang sang toàn bộ cấu hình — nhưng cuốn mới vẫn là **quyển nhật ký mới bắt đầu từ trang đầu**, không mang theo ngày nào.

## Phạm vi kế thừa

| Trường cấp cuốn | Kế thừa? | Ghi chú |
|---|---|---|
| `templateId` | ✅ | lấy theo cuốn nguồn, tham số `templateId` bị bỏ qua |
| `items` (hạng mục + ĐVT + khối lượng) | ✅ | số lấy từ **ngày làm việc cuối cùng** (`lastWorkEntryOf`), không phải `src.items` |
| `zones` (địa bàn) | ✅ | giữ đúng tên + số lượng đã tùy chỉnh |
| `book` (bìa · bìa tổng · Tr1 · Tr2) | ✅ | `{MM}`/`{YYYY}` giải theo `startDate` mới khi xuất nên tự khớp tháng |
| `rep_a`, `rep_b` | ✅ | chữ ký mặc định |
| `hideZeroRows` | ✅ | tùy chọn ẩn hạng mục khối lượng 0 |
| `name`, `startDate`, `startPage` | ❌ | người dùng nhập trong modal, `startPage` mặc định `1` |
| `entries` | ❌ | **luôn rỗng** — quyển mới bắt đầu từ trang đầu |
| `createdAt`, `endedAt`, `id` | ❌ | sinh mới |

Ngày đầu của cuốn mới còn được seed `workers`, `workers_other`, `equipment`, `env`, `safe` từ ngày làm việc cuối của cuốn nguồn — nhất quán với cơ chế kế thừa hằng ngày. **Không** seed thời tiết/nhiệt độ (để auto-fetch lo), `note_a`/`note_b`, `restDay`.

---

## Các bước thực hiện

### 1. `index.html` — thêm `lastWorkEntryOf(p)`

Đặt cạnh `prevWorkEntryOf`, tái dùng nguyên logic bỏ qua ngày nghỉ:

```js
// Ngày làm việc cuối cùng của một cuốn (bỏ qua ngày nghỉ). Dùng khi cuốn mới
// kế thừa cuốn cũ — phải lấy số thực tế mới nhất, không phải p.items khởi tạo.
function lastWorkEntryOf(p) { return p ? prevWorkEntryOf(p, '9999-12-31') : null; }
```

### 2. `index.html` — `createProject` nhận thêm `sourceId`

Chữ ký mới: `createProject(name, startDate, startPage, templateId, sourceId)`. Template lấy theo cuốn nguồn nếu có; các trường cấu hình ghi đè **sau khi** dựng object mặc định, **trước khi** gọi `ensureProjectMeta(p)` (vẫn là chỗ duy nhất back-fill, nên cuốn nguồn thiếu `zones`/`book` thì template tự bù):

```js
  const src = sourceId ? appState.projects[sourceId] : null;
  const tpl = TEMPLATES[(src && src.templateId) || templateId] || TEMPLATES.lavipco;
  /* … dựng p như cũ … */
  if (src) {
    const last = lastWorkEntryOf(src);
    const srcItems = (last && Array.isArray(last.items)) ? last.items : src.items;
    if (Array.isArray(srcItems)) p.items = deepCopy(srcItems);
    if (Array.isArray(src.zones) && src.zones.length) p.zones = [...src.zones];
    if (src.book) p.book = deepCopy(src.book);
    if (src.rep_a !== undefined) p.rep_a = src.rep_a;
    if (src.rep_b !== undefined) p.rep_b = src.rep_b;
    p.hideZeroRows = !!src.hideZeroRows;
  }
```

Không truyền `sourceId` thì hành vi y hệt trước (các call site khác: `migrateFromV1`, khởi động).

### 3. `index.html` — modal `#newBookModal`

Thêm markup cạnh `#forecastModal` / `#bookModal`, dùng lại class `.modal` / `.modal-overlay` / `.modal-body` / `.modal-header` sẵn có, cộng CSS mới `.nb-form` (grid 2 cột `150px 1fr`), `.nb-hint`, `.nb-actions`.

Các ô: **Khởi tạo từ** (`#nbSource`) · **Tên cuốn** (`#nbName`) · **Ngày bắt đầu** (`#nbStartDate`, `type="date"`) · **Số trang đầu** (`#nbStartPage`, `type="number" min="1"`). Nút *Hủy* / *Tạo cuốn*.

`#nbSource` là một `<select>` với 2 `<optgroup>`:
- **Tạo trắng từ mẫu** → `value="tpl:<templateId>"`, nhãn `tplLabel(id)`
- **Kế thừa từ cuốn đã có** → `value="src:<projectId>"`, nhãn `<tên> — <mẫu>, <n> ngày`, tiền tố `🏁` nếu `endedAt`. Nhóm này **tự ẩn khi chưa có cuốn nào**.

Mặc định chọn cuốn đang mở; chưa có cuốn nào thì rơi về mẫu cuối cùng trong `TEMPLATES`.

Media query `@media screen and (max-width: 820px)` cho grid về 1 cột, font `16px` (tránh iOS tự zoom).

### 4. `index.html` — thay `newProject()` bằng 4 hàm

- `newProject()` — dựng lại `#nbSource`, đặt giá trị mặc định, mở modal, focus `#nbName`.
- `closeNewBook()` — gỡ class `.open`.
- `onNewBookSourceChange()` — cập nhật dòng hint mô tả sẽ chép gì.
- `submitNewBook()` — validate (`/^\d{4}-\d{2}-\d{2}$/` + `new Date` để bắt ngày không tồn tại, `startPage >= 1`), `clearTimeout(window._sv)` + `collectForm()` + `persist()`, gọi `createProject(..., sourceId)`, `ensureEntry`, seed 5 trường nhân lực từ `lastWorkEntryOf(src)`, rồi `refreshProjectSelect()` / `refreshDatePicker()` / `renderForm()` / `persist()` / `flash()`.

Validate hỏng thì **alert và giữ modal mở** — không đóng, không tạo cuốn rác.

### 5. `index.html` — auto-save và phím tắt

- Auto-save debounce: đổi filter thành `ev.target.closest('#bookModal, #newBookModal')` — modal này có nút Tạo cuốn riêng.
- `Escape` đóng `#newBookModal` (kiểm **trước** `#bookModal` và `#forecastModal`).
- `Enter` trong modal = bấm *Tạo cuốn*.

### 6. `sw.js` — tăng `VERSION`

### 7. `CLAUDE.md`

- "Nguyên tắc thiết kế cần biết": 2 gạch đầu dòng — `createProject(..., sourceId)` kế thừa gì / `entries` luôn rỗng / số trang bắt đầu lại; và `#newBookModal` thay chuỗi `prompt()`, `<input type="date">`, quy ước `tpl:`/`src:`, bị loại khỏi auto-save.
- Checklist "Test thủ công": thêm nhóm `**Kế thừa cuốn mới:**`.

---

## Kiểm tra

Chạy qua `http://localhost:...` (**không** dùng `file://`), hard-reload `Ctrl+Shift+R`.

1. **Modal** — `+ Cuốn mới` mở modal; ô ngày bấm ra lịch; select có đúng 2 optgroup; mặc định chọn cuốn đang mở.
2. **Kế thừa đầy đủ** — cuốn A mẫu 2: đổi tên 1 hạng mục, thêm 1 địa bàn (8 cột), sửa `book.duToan`, đổi chữ ký, tick "Ẩn hạng mục khối lượng 0", nhập khối lượng → tạo B kế thừa A → B có đủ: hạng mục đã đổi tên, 8 cột, bìa đã sửa, chữ ký đã đổi, checkbox đã tick, khối lượng đúng.
3. **Bỏ qua ngày nghỉ** — ngày cuối của A là `restDay` với số đã xóa → B vẫn lấy số của ngày làm việc trước đó.
4. **Seed ngày đầu** — `Công nhân`/`Thiết bị`/`Môi trường`/`An toàn` của ngày đầu B = ngày làm việc cuối A; thời tiết + ghi chú về mặc định, `restDay` bỏ tick.
5. **Quyển mới bắt đầu lại** — B có đúng **1 ngày**, `startDate` = ngày đã chọn, `pagenum` theo `startPage` đã nhập, không nối tiếp số trang của A.
6. **Độc lập với nguồn** — sửa hạng mục/khối lượng/bìa trong B → cuốn A không đổi (deep copy).
7. **Tạo trắng từ mẫu** — về đúng mặc định template: 3 địa bàn, 6 cột, tên hạng mục gốc, chữ ký template, `hideZeroRows = false`, `Công nhân = 07`.
8. **Chưa có cuốn nào** — select chỉ còn nhóm "Tạo trắng từ mẫu".
9. **Validate** — ngày rỗng / số trang 0 → alert, modal vẫn mở, không tạo cuốn; Hủy / Esc → thoát sạch.
10. **Chữ ký** — lưu ý khi test bằng script: `rep_a` sticky theo chiều **entry → project** qua `collectForm`, nên phải set ở entry chứ không chỉ `p.rep_a`, nếu không `collectForm` ghi đè lại bằng giá trị template.
11. **Mobile 390px** — modal 1 cột, chữ ≥ 16px, không scroll ngang.
12. **Không hồi quy** — cuốn cũ trong localStorage mở bình thường; `migrateFromV1` và luồng khởi động (gọi `createProject` không có `sourceId`) vẫn đúng.
