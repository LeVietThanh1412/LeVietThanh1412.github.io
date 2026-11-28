# DynamicView 3DGS

Viewer cho Gaussian Splatting, PLY, GLB và USDZ. Bản web mở file tại thiết bị. Bản LAN chạy trên máy tính để chia sẻ model cho điện thoại cùng Wi-Fi. Mỗi thiết bị dùng góc nhìn riêng.

## Bản web

Mở [thanhtech.cloud/viewer](https://thanhtech.cloud/viewer/) rồi bấm **Thêm model** hoặc kéo thả file. File được đọc trong tab và sẽ rời thư viện khi tải lại trang. Trang dùng HTTPS để mở camera và WebXR trực tiếp trên thiết bị được hỗ trợ. Để đồng bộ model từ PC sang điện thoại, dùng bản LAN.

GitHub Actions của portfolio chạy kiểm thử rồi build viewer vào thư mục **viewer/** của GitHub Pages. Có thể tạo bản tĩnh bằng các lệnh sau.

```sh
npm ci
npm test
npm run build
```

## Chiều model, ánh sáng và bóng

- PLY 3DGS dạng checkpoint gốc Graphdeco/COLMAP được xoay 180° quanh trục X khi mở. Nếu file đã được chỉnh trục sẵn, dùng nút **↶** để đảo lại hoặc đặt metadata `comment dynamicview_up_axis y` trong header khi xuất PLY. File ghi trục +Z, −Z hoặc −Y tường minh được đặt theo trục đó.
- Mesh GLB, USDZ và PLY có môi trường sáng trung tính, tự đổ bóng và chiếu bóng lên sàn. Bấm **Ánh sáng** (☼) để đổi hướng, chỉnh cường độ hoặc bật tắt bóng. 3DGS giữ màu và thông tin hướng nhìn có trong file.
- Android WebXR chiếu bóng mesh lên mặt phẳng ngang được chọn, và dùng ánh sáng môi trường khi trình duyệt cấp `light-estimation`. AR Quick Look trên iOS dùng ánh sáng, phản xạ và bóng do hệ thống render cho USDZ. Chế độ **Chồng model lên camera** dùng ánh sáng của viewer. [WebXR Light Estimation](https://immersive-web.github.io/lighting-estimation/) · [Ánh sáng Quick Look](https://developer.apple.com/documentation/arkit/specifying-a-lighting-environment-in-ar-quick-look)

## Chạy trên Windows

Yêu cầu Node.js 22 trở lên. Chạy trong thư mục project.

```powershell
npm ci
npm start
```

Khi thư mục `node_modules/` đã có, có thể khởi động trực tiếp bằng `node server.mjs`.

1. Trên máy tính, mở [http://localhost:4173](http://localhost:4173).
2. Bấm **Thêm model** hoặc thả file vào ô thêm model. Tệp được lưu vào `.data/` và tự chọn sau khi nhập. Ba model Orbit có sẵn để thử GLB, 3DGS PLY và USDZ.
3. Bấm **Kết nối điện thoại**, rồi quét QR hoặc mở địa chỉ IP của máy tính trên điện thoại. Nếu máy có nhiều card mạng, dùng địa chỉ IPv4 của Wi-Fi được in trong terminal.
4. Chọn model khác trên máy tính để cập nhật điện thoại. Khi xem 3D, kéo để xoay, cuộn hoặc chụm để zoom. Nút **↶** lật model 180° quanh trục X.

### Bật camera qua Wi-Fi

Tạo chứng chỉ LAN một lần. Script dùng OpenSSL từ Git for Windows hoặc từ PATH. Nếu IP máy tính thay đổi, chạy lại script để cấp chứng chỉ cho IP mới. Điện thoại đã tin cậy cùng CA có thể dùng tiếp.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\New-LanCertificate.ps1
npm start
```

Nếu server đã chạy, dừng phiên cũ bằng `Ctrl+C` trước khi khởi động lại. HTTPS dùng cổng **4443** mặc định. Từ điện thoại, mở trang HTTP qua QR, bấm **Kết nối điện thoại** và tải `rootCA.crt`. Sau khi cài chứng chỉ, mở liên kết HTTPS được hiển thị trong hộp thoại.

- **Android** · Trong Cài đặt, tìm **Cài đặt chứng chỉ** → **Chứng chỉ CA** và chọn tệp vừa tải. Mở bằng Chrome. Để đặt model trên bề mặt bằng WebXR, thiết bị cần hỗ trợ ARCore và có Google Play Services for AR. [Điều kiện WebXR của Google](https://developers.google.com/ar/develop/webxr/requirements)
- **iPhone / iPad** · Tải chứng chỉ trong Safari, cài hồ sơ trong Cài đặt, rồi vào **Cài đặt → Cài đặt chung → Giới thiệu → Cài đặt tin cậy chứng chỉ** để bật tin cậy đầy đủ cho DynamicView Local CA. [Hướng dẫn của Apple](https://support.apple.com/en-us/102390)

Nếu đã có chứng chỉ TLS mà điện thoại tin cậy, đặt `HTTPS_CERT` và `HTTPS_KEY` thành đường dẫn PEM thay cho script. Có thể đổi cổng bằng `PORT` và `HTTPS_PORT`, chọn địa chỉ bind bằng `HOST`, hoặc đổi thư mục lưu model bằng `DATA_DIR`.

### Chế độ AR

| Thiết bị | Nút AR | Hỗ trợ |
|---|---|---|
| Chrome Android có ARCore | **Đặt model bằng WebXR** | Di chuyển camera để dò bề mặt rồi chạm để đặt. Dùng nút `−` và `+` để chỉnh kích thước. Dùng được cho mesh, cloud và splat. |
| Safari iPhone / iPad | **Mở bằng AR Quick Look** | USDZ dùng tệp gốc. Với GLB hoặc PLY dạng mesh, bấm **Tạo bản Quick Look** rồi mở. Bản xuất chuyển hình học và vật liệu tương thích sang USDZ. |
| Android và iOS qua HTTPS | **Chồng model lên camera** | Camera sau làm nền cho model. Kéo hoặc chụm để điều chỉnh, kể cả với 3DGS PLY trên iPhone. Chế độ này dùng thao tác tay, không neo model vào bề mặt. |

Quick Look có thể hiển thị khác viewer do vật liệu và animation. Nếu bản chuyển từ GLB chưa đạt kết quả mong muốn, nhập USDZ đã xuất từ công cụ dựng model. [AR Quick Look](https://developer.apple.com/quick-look-gallery/) · [USDZExporter](https://threejs.org/docs/pages/USDZExporter.html)

### Khi điện thoại chưa vào được

Kiểm tra hai thiết bị cùng Wi-Fi và dùng đúng IP. Nếu Windows Firewall chặn, mở hai cổng cho mạng Wi-Fi hiện tại. Ví dụ sau chạy trong PowerShell với quyền quản trị. Thay `Wi-Fi 3` bằng tên card mạng đang dùng nếu tên khác.

```powershell
New-NetFirewallRule -DisplayName 'DynamicView LAN' -Direction Inbound -Action Allow `
  -InterfaceAlias 'Wi-Fi 3' -RemoteAddress LocalSubnet -Protocol TCP -LocalPort 4173,4443
```

Nếu HTTP vào được nhưng HTTPS báo lỗi, kiểm tra CA đã được tin cậy và IP trong URL có trong chứng chỉ. Nếu dùng guest Wi-Fi, một số router chặn kết nối giữa các thiết bị.

## Định dạng và kết nối

- **PLY** · Tự nhận diện trường Gaussian để dùng Spark. PLY có mặt được xem dạng mesh, PLY chỉ có đỉnh được xem dạng point cloud. Các tệp **SPLAT**, **KSPLAT** và **SPZ** cũng dùng Spark. [Định dạng của Spark](https://sparkjs.dev/docs/loading-splats/)
- **GLB** · Đọc mesh, vật liệu, texture nhúng và phát animation đầu tiên nếu có. Hỗ trợ bộ giải mã Draco, Meshopt và KTX2. **USDZ** đọc qua USDLoader. [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) · [USDLoader](https://threejs.org/docs/pages/USDLoader.html)
- **WebSocket** · Viewer tự kết nối tới `ws://<ip>:4173/ws` hoặc `wss://<ip>:4443/ws`. Server gửi danh sách và ID model đang chọn. Trình duyệt tải tệp qua HTTP(S) rồi tự render trên GPU. Video camera được xử lý ngay trên thiết bị.
- **Thư viện LAN** · Điện thoại trong mạng có thể mở và tải các model trong thư viện. Chỉ trình duyệt mở qua địa chỉ loopback trên máy tính có quyền thêm tệp và đổi lựa chọn chia sẻ. Mỗi upload tối đa 1 GiB. Model lớn còn phụ thuộc bộ nhớ và GPU của điện thoại.

Các thư viện JavaScript được phục vụ từ máy tính sau `npm ci`. Có thể tạo lại model mẫu bằng `npm run make-demos`.
