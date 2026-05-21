# CLAUDE.md

Hướng dẫn cho Claude khi làm việc với repo này.

## Tổng quan

App nhật ký thi công hàng ngày (tiếng Việt) cho công ty chiếu sáng, dùng để in/lưu PDF báo cáo ngày công. Toàn bộ là **một file `index.html` tĩnh** — không build step, không backend, không npm. Mọi state lưu trong `localStorage` của trình duyệt.

## Cấu trúc file

```
diary/
├── index.html       # Toàn bộ app (HTML + CSS + JS inline)
├── huong-dan.html   # Hướng dẫn người dùng (tiếng Việt)
└── CLAUDE.md        # File này
```

## Dependencies (chỉ runtime, qua CDN)

- **html2pdf.js v0.10.1** — gọi khi bấm "Kết thúc cuốn" để xuất PDF. Cần online lúc đó. Nếu offline, app báo lỗi và cho phép xóa thủ công.
- **Open-Meteo API** (`api.open-meteo.com`) — tự động lấy nhiệt độ địa phương qua geolocation. Không cần API key. Dùng 2 endpoint:
  - `hourly=temperature_2m,weather_code&forecast_days=1` → nhiệt độ sáng/chiều của hôm nay (`fetchLocalTemperature`)
  - `daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&forecast_days=N` → dự báo N ngày tới (`loadForecast`, N do user nhập, default 7, max 16)

## Mô hình dữ liệu (localStorage key: `nktc_lavipco_v2`)

```js
appState = {
  projects: {
    [projectId]: {
      id, name, createdAt, endedAt,
      startDate,   // 'YYYY-MM-DD', ngày = trang đầu tiên
      startPage,   // số trang của ngày bắt đầu (sticky base cho computePagenum)
      items,       // template hạng mục, đồng bộ từ entry hiện tại (qua syncItemsStructureToProject)
      rep_a, rep_b,// chữ ký mặc định, sticky từ entry mới nhất
      entries: {
        ['YYYY-MM-DD']: {
          date, day, month, year,
          w_morning, w_afternoon, t_morning, t_afternoon,
          workers, workers_other, equipment,
          env, safe, note_a, note_b,
          rep_a, rep_b, pagenum,
          items   // bản sao đầy đủ tại thời điểm tạo entry; sau đó qty edit độc lập theo entry
        }
      }
    }
  },
  currentProjectId,
  currentDate
}
```

Khóa cũ `nktc_lavipco_v1` được auto-migrate sang v2 trong `migrateFromV1()` — giữ lại cho đến khi user manually clear.

## Nguyên tắc thiết kế cần biết

- **1 cuốn = 1 công trình. 1 entry = 1 ngày.** Không trộn.
- **`pagenum` là computed**, không lưu user-editable. `computePagenum(p, dateISO)` = `startPage + sortedIndex(date, entries ≥ startDate)`. Ô `#pagenum` là `readonly`.
- **Date picker giới hạn `min=startDate`** để không tạo entry trước ngày bắt đầu cuốn (sẽ làm lệch số trang).
- **`_isNew` flag** trên entry: dùng nội bộ để biết entry vừa tạo lần đầu → trigger auto-fetch nhiệt độ nếu ngày là hôm nay. Phải `delete` trước khi `persist()` để không leak vào localStorage.
- **`items` global var** là tham chiếu tới `currentEntry.items`. `renderTable()` đọc từ đây. `syncItemsStructureToProject()` đẩy thay đổi name/unit/group/add/del sang `project.items` (template) nhưng KHÔNG đẩy qty (qty là số liệu hàng ngày).
- **Auto-save debounce 800ms** trên `input` event của document, có filter để bỏ qua `#projectSelect`, `#datePicker`, `#importFile` (3 control này có handler riêng).
- **Chuyển cuốn/ngày** luôn `clearTimeout(window._sv)` rồi `collectForm()` trước khi switch — không thì debounce sẽ ghi đè entry mới bằng form cũ.

## Kết thúc cuốn

`endProject()` flow:
1. Confirm × 2
2. `collectForm()` + `persist()` để save form hiện tại
3. `exportBookAsWord(p)` — sync, blob `application/msword` + UTF-8 BOM + namespace MS Office, đuôi `.doc`
4. `await exportBookAsPDF(p)` — render mỗi entry vào container ẩn `position:absolute; left:-99999px`, dùng html2pdf với `pagebreak: { mode: ['css','legacy'] }` và CSS `.page { page-break-after: always }`
5. Nếu xuất file lỗi, hỏi user có vẫn muốn xóa cuốn không
6. Xóa project, switch sang cuốn còn lại (hoặc tạo "Công trình 1" nếu hết)

## Khi sửa code

- **Đừng tách file.** Single-file đơn giản hơn để mobile/offline dùng. Nếu cần thêm util lớn, cân nhắc inline trước.
- **Đừng thêm framework.** Vanilla JS đủ dùng. Đừng React/Vue/build step.
- **CSS in/print** rất quan trọng — mọi thay đổi UI phải test ở chế độ `window.print()` xem có vỡ A4 không.
- **Vietnamese diacritics** ở mọi nơi (filename sanitize, escape, search). Đừng strip.
- **Geolocation/CDN** chỉ work qua HTTPS hoặc localhost — nếu test bằng `file://`, các tính năng đó sẽ fail. Đó là expected, không phải bug.

## Modal dự báo thời tiết

`#forecastModal` là overlay fixed full-viewport, ẩn mặc định (`display: none`), bật bằng class `.open`. Nút <span>🔮 Dự báo thời tiết</span> mở qua `openForecast()`. Đóng bằng nút ×, click overlay, hoặc phím <kbd>Esc</kbd>.

- Số ngày: `<input type="number" id="forecastDays">` (1–16, default 7). Enter trên ô này = trigger `loadForecast()`.
- Mỗi dòng dự báo có nút **"Dùng cho ngày này"** gọi `applyForecastToEntry(dateISO, tmin, tmax, code)` — `collectForm()` ngày hiện tại, switch sang ngày được chọn (tạo entry nếu chưa có), ghi nhiệt độ & mô tả thời tiết vào cả Sáng + Chiều, đóng modal.
- `#forecastDays` cũng phải nằm trong allow-list bỏ qua của debounced auto-save (cùng `projectSelect`, `datePicker`, `importFile`).

## Test thủ công khi đổi code

- [ ] Tạo cuốn mới với ngày bắt đầu khác hôm nay → ngày đầu = trang `startPage`
- [ ] Chuyển ngày bằng date picker, prev/next → pagenum tăng đúng
- [ ] Sửa hạng mục, đổi tên item → ngày khác đã có không bị ảnh hưởng (item đã copy)
- [ ] Sửa qty ngày này → ngày khác giữ nguyên qty cũ của ngày đó
- [ ] Bấm Kết thúc → tải về `.doc` và `.pdf` rồi cuốn biến mất
- [ ] Mở file `.doc` trong Word/LibreOffice → định dạng bảng còn nguyên
- [ ] Mở PDF → mỗi ngày 1 trang A4
- [ ] In (Ctrl+P) → toolbar ẩn, form khớp A4
- [ ] Bấm "🔮 Dự báo thời tiết" → modal mở, gõ số ngày → bảng dự báo hiện ra
- [ ] Bấm "Dùng cho ngày này" trên 1 dòng dự báo → chuyển sang ngày đó, nhiệt độ + thời tiết được áp dụng
