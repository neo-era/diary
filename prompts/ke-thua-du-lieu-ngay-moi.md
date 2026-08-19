# Prompt — Ngày mới kế thừa dữ liệu ngày làm việc gần nhất

> Prompt tự chứa cho repo `diary` (app nhật ký thi công, một file `index.html` tĩnh).
> Đã thực hiện ngày 2026-08-19. Giữ lại để chạy lại, đối chiếu, hoặc giao cho session khác.

---

## Bối cảnh

`ensureEntry()` trong `index.html` dựng entry ngày mới bằng **hằng số cứng** (`workers: '07'`, `equipment: ''`, `env: 'Bình thường'`…). Chỉ chữ ký (`p.rep_a/rep_b`) và cấu trúc hạng mục (`p.items`) là mang sang — người dùng phải gõ lại toàn bộ mỗi ngày.

Khối lượng của mẫu 2/3 còn sai so với ý định đã ghi trong comment ("template chụp lại khối lượng của ngày đang mở"): `syncItemsStructureToProject()` chỉ chạy khi sửa **tên/ĐVT**, `addRow`, `delRow`. Handler sửa **số** thoát sớm (`if (k) { setQ(...); return; }`) nên không bao giờ chụp lại ⇒ ngày mới nhận **số mặc định gốc của `Q8_RAW`**, không phải số vừa nhập hôm qua. Mỗi ngày phải gõ lại 38×6 ô.

**Mục tiêu:** mọi mẫu (1, 2, 3) đều lấy khối lượng và các trường lặp lại từ entry của **ngày làm việc gần nhất trước đó** trong cùng cuốn, không phụ thuộc việc `p.items` có được sync hay không.

## Ràng buộc: ngày nghỉ / nghỉ lễ

`onRestDayChange()` **không xóa số**, chỉ khóa ô nhập trên UI — entry ngày nghỉ vẫn là entry bình thường trong `p.entries`. Nếu chỉ lấy "ngày liền trước" thì sau đợt nghỉ lễ dài (Tết, 30/4–1/5 → 3–5 entry `restDay: true` liên tiếp), ngày đi làm lại sẽ kế thừa từ **ngày nghỉ cuối cùng**: `Công nhân = 0`, thiết bị rỗng, khối lượng có thể đã bị xóa — đúng cái thay đổi này định tránh.

⇒ Hàm tìm nguồn kế thừa phải **lùi qua mọi entry `restDay === true`**, dừng ở ngày làm việc gần nhất. Không tìm được → về mặc định `p.items` + hằng số cứng như cũ.

Bản thân entry ngày nghỉ vẫn kế thừa bình thường (không tự về 0) — bảng in ra đã trống sẵn, và bỏ tick thì số liệu còn nguyên.

## Phạm vi kế thừa

| Trường | Nguồn ngày mới |
|---|---|
| Khối lượng — **cả 3 mẫu** (`lavipco`, `q8`, `q8th`) | ngày làm việc gần nhất; không có → `p.items` = số mặc định của template (`DEFAULT_ITEMS` / `Q8_RAW`) — **không** phải 0 |
| `workers`, `workers_other`, `equipment` | ngày làm việc gần nhất (fallback `'07'` / `''` / `''`) |
| `env`, `safe` | ngày làm việc gần nhất (fallback `'Bình thường'`) |
| Thời tiết + nhiệt độ (`w_*`, `t_*`) | **giữ nguyên** hằng số cứng + auto-fetch API khi ngày = hôm nay |
| `note_a`, `note_b`, `restDay` | **không kế thừa** (rỗng / `false`) |
| `rep_a`, `rep_b` | giữ nguyên cơ chế sticky cấp cuốn |

Cờ `keepQty` **giữ nguyên, không xóa** — sau thay đổi này nó chỉ còn chi phối snapshot khối lượng vào `p.items` trong `syncItemsStructureToProject`, tức chỉ ảnh hưởng **ngày đầu cuốn**.

---

## Các bước thực hiện

Mọi call site (`changeDate`, `newProject`, `onProjectChange`, `applyForecastToEntry`, import, khởi động) đều đi qua `ensureEntry` nên phần chính chỉ sửa một chỗ.

### 1. `index.html` — thêm `prevWorkEntryOf(p, dateISO)`

Đặt ngay trước `ensureEntry`. Dùng `< dateISO` (không phải "ngày cuối cuốn") để chèn ngày vào giữa vẫn kế thừa đúng nguồn.

```js
// Nguồn kế thừa cho một ngày mới: ngày LÀM VIỆC gần nhất trước đó.
// Bỏ qua entry ngày nghỉ — sau đợt nghỉ lễ dài vẫn phải lấy được số liệu
// của ngày đi làm cuối cùng, không phải mớ rỗng của ngày nghỉ.
function prevWorkEntryOf(p, dateISO) {
  const ds = Object.keys(p.entries || {}).filter(k => k < dateISO).sort();
  for (let i = ds.length - 1; i >= 0; i--) {
    const e = p.entries[ds[i]];
    if (e && !e.restDay) return e;
  }
  return null;
}
```

### 2. `index.html` — thêm `inheritQty(p, dst, src)`

Khớp theo **vị trí** trước (cấu trúc hầu như không đổi), lệch thì dò theo **tên**. Đọc/ghi qua `getQ`/`setQ` với `qtyKeys(p)` theo đúng quy ước trong `CLAUDE.md` — nhờ vậy dùng chung cho mẫu 1 (`['qty']`) và mẫu 2/3 (`['th0'…'nt2']`). Bỏ qua dòng `group`; bỏ qua key `undefined` (ngày cũ thiếu cột sau khi `addZone`).

```js
// Chép khối lượng ngày nguồn sang danh sách hạng mục của ngày mới.
// Khớp theo vị trí trước (cấu trúc hầu như không đổi), lệch thì dò theo tên.
// Đi qua getQ/setQ nên dùng chung được cho mẫu 1 cột lẫn mẫu nhiều địa bàn.
function inheritQty(p, dst, src) {
  const keys = qtyKeys(p);
  const byName = new Map();
  src.forEach(it => { if (it.group === undefined && !byName.has(it.name)) byName.set(it.name, it); });
  dst.forEach((it, i) => {
    if (it.group !== undefined) return;
    const at = src[i];
    const s = (at && at.group === undefined && at.name === it.name) ? at : byName.get(it.name);
    if (!s) return;
    keys.forEach(k => { const v = getQ(s, k); if (v !== undefined) setQ(it, k, v); });
  });
}
```

### 3. `index.html` — sửa `ensureEntry`

- Lấy `const prev = prevWorkEntryOf(p, dateISO);` trước khi dựng object.
- `workers` / `workers_other` / `equipment` / `env` / `safe` → `prev ? prev.X : <mặc định cũ>`.
- Dựng object vào biến `e` (thay vì gán thẳng `p.entries[dateISO]`), sau đó:
  `if (prev && Array.isArray(prev.items)) inheritQty(p, e.items, prev.items);` rồi mới `p.entries[dateISO] = e;`
  — **không gate theo `tpl.keepQty`**, áp dụng cho cả 3 mẫu.
- Giữ nguyên `_isNew: true`, `pagenum`, `restDay: false`, `rep_a/rep_b`, và các trường thời tiết.
- Đổi `JSON.parse(JSON.stringify(p.items))` → `deepCopy(p.items)` cho khớp helper sẵn có.

### 4. `index.html` — ngày nghỉ bỏ trống mục 2 khi xuất file

Trong `buildEntryHTML`, giữ **nguyên số dòng** để chiều cao trang A4 không đổi (trang đang khít — xem "Giới hạn vật lý đã đo" trong `CLAUDE.md`), chỉ bỏ phần giá trị:

```js
<div style="padding-left:10mm">- Công nhân: ${e.restDay ? '' : escapeHtml(e.workers) + ' người'}</div>
<div style="padding-left:10mm">- Nhân lực khác: ${e.restDay ? '' : escapeHtml(e.workers_other)}</div>
<div class="subsection">2.2. Thiết bị thi công:</div>
<div style="padding-left:10mm">${e.restDay ? '' : escapeHtml(e.equipment)}</div>
```

Chỉ tác động lúc xuất PDF/Word — màn hình nhập vẫn hiện đủ để sửa, giống cách `visibleItems` xử lý bảng khối lượng.

### 5. `index.html` — sửa comment ở `syncItemsStructureToProject`

Giữ nguyên logic. Comment phải nói rõ `p.items` là *giá trị khởi tạo của cuốn* (fallback cho ngày đầu / sau chuỗi ngày nghỉ), còn kế thừa hằng ngày do `ensureEntry` + `prevWorkEntryOf` lo.

### 6. `sw.js` — tăng `VERSION`

Bắt buộc theo `CLAUDE.md` để cache PWA cũ bị dọn.

### 7. `CLAUDE.md`

- Mục "Cấu trúc file": thêm dòng `prompts/`.
- Mục "Mẫu quyển": sửa mô tả `keepQty` — không còn là "ngày mới kế thừa khối lượng thay vì về 0" mà là snapshot vào `p.items`, chỉ ảnh hưởng ngày đầu cuốn.
- Mục "Nguyên tắc thiết kế cần biết": thêm gạch đầu dòng mô tả `prevWorkEntryOf` + `inheritQty` (kế thừa gì, bỏ qua ngày nghỉ, không kế thừa gì).
- Cùng mục: thêm gạch đầu dòng ngày nghỉ bỏ trống mục 2 khi xuất, giữ nguyên số dòng.
- Checklist "Test thủ công": thêm nhóm `**Kế thừa ngày mới:**`.

---

## Kiểm tra

Chạy Live Server (`http://localhost:...`, **không** dùng `file://` — geolocation/CDN/service worker sẽ fail). Hard-reload `Ctrl+Shift+R` để tránh cache cũ.

1. **Kế thừa cơ bản (mẫu 2)** — cuốn mới mẫu 2 → khối lượng hạng mục 1 = 99, hạng mục 5 = 0, `Công nhân = 12`, `Thiết bị = "Xe nâng"`, `Môi trường = Tốt` → bấm `>` → ngày mới hiện **99, 0, 12, "Xe nâng", Tốt**; thời tiết/ghi chú về mặc định, `Ngày nghỉ` bỏ tick.
2. **Mẫu 1 cũng kế thừa** — cuốn mẫu 1, ngày đầu nhập `5, 8, 0` → ngày sau hiện **đúng 5, 8, 0** (trước đây về 0).
3. **Ngày đầu cuốn mẫu 1** — cuốn mẫu 1 mới toanh, ngày `startDate` → khối lượng = số mặc định `DEFAULT_ITEMS` (**1 / 2 / 133…**, không phải 0 — `syncItemsStructureToProject` chỉ đưa về 0 sau khi sửa cấu trúc).
4. **Nghỉ lễ dài** — ngày 01 làm việc (số liệu đầy đủ) → ngày 02, 03, 04 tick `Ngày nghỉ` + xóa `Công nhân` về 0 → tạo ngày 05 → kế thừa từ **ngày 01**, không phải 04.
5. **Toàn bộ trước đó là ngày nghỉ** — cuốn chỉ có ngày nghỉ, tạo ngày mới → về mặc định `p.items` + `Công nhân = 07`, không lỗi JS.
6. **Không rò ngược** — quay lại ngày trước sửa số → ngày sau giữ nguyên số của nó.
7. **Chèn ngày giữa** — đã có ngày 01 và 05, tạo ngày 03 → kế thừa từ **01**.
8. **Đổi cấu trúc giữa chừng** — ngày 01 nhập số → ngày 02 sửa **tên** một hạng mục + `+ Thêm địa bàn` → ngày 03: tên mới khớp theo vị trí, cột địa bàn mới = 0, cột cũ giữ số của ngày 02.
9. **Xóa địa bàn giữa** (chỉ số 1) rồi tạo ngày mới → số không dồn lệch cột.
10. **Xuất ngày nghỉ** — mở một ngày nghỉ → `📄 Xuất PDF ngày này` → mục 2.1/2.2 trống, bảng khối lượng trống nhưng đủ tên hạng mục, **vẫn đúng 2 trang**, lề 2cm.
11. **Áp dự báo** — `🔮 Dự báo thời tiết` → "Dùng cho ngày này" cho ngày tương lai chưa có entry → entry mới có kế thừa khối lượng, nhiệt độ bị dự báo ghi đè.
12. **Không hồi quy** — mở cuốn cũ trong localStorage: dữ liệu nguyên vẹn, số trang liên tục, xuất PDF vẫn đúng.
