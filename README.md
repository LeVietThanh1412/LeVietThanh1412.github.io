# thanhtech.cloud

Portfolio của Lê Việt Thành. HTML, CSS và JavaScript thuần; dữ liệu dự án lấy từ GitHub khi triển khai, không gọi GitHub API từ trình duyệt của khách.

## Chạy tại máy

```sh
python scripts/sync_projects.py --offline
python -m http.server 4173
```

Mở `http://localhost:4173`. Danh sách dự án có sẵn trong HTML nên vẫn xem được khi JavaScript bị tắt.

## Đồng bộ dự án

```sh
python scripts/sync_projects.py
```

Script phân trang toàn bộ repo **public** của `LeVietThanh1412`, bao gồm fork (có nhãn), và bỏ các repo trong danh sách `exclude` tại `scripts/projects.config.json`. Danh sách này gồm profile/portfolio và những dự án chủ website đã chọn ẩn; chúng không xuất hiện lại khi tự đồng bộ. Nó lấy tên, mô tả, ngôn ngữ, sao, trạng thái archive và Pages. Repo bật Pages sẽ tự có URL `https://thanhtech.cloud/<repo>/`, hoặc domain riêng từ `CNAME`. Repo có homepage dùng URL đó nếu chưa có Pages. Chỉ link trả về HTTP 200 được hiển thị dưới dạng bản web; những repo còn lại vẫn có link mã nguồn. Repo private không được công bố.

Tùy chỉnh tên hiển thị, mô tả, nhóm, thứ tự demo (`featured`), dự án ưu tiên (`pinned`) hoặc thêm `demo_url` tại `scripts/projects.config.json`. Repo mới không cần khai báo ở đây. Thứ tự: demo và dự án ưu tiên trước, các repo khác theo thời gian push gần nhất. Giao diện hiện 8 dự án mỗi lượt, có nút xem thêm; tìm kiếm và bộ lọc áp dụng trên toàn bộ danh sách. Mô tả trống dùng câu dự phòng; nên thêm description trên GitHub để nội dung hữu ích hơn.

Snapshot ở `assets/data/projects.json`. Chạy `--offline` để dựng lại HTML từ snapshot. Nếu GitHub API lỗi khi đồng bộ, workflow dừng và giữ nguyên lần triển khai trước.

## Triển khai

`.github/workflows/deploy.yml` tự đồng bộ và triển khai khi push `main`, chạy thủ công hoặc khoảng **07:17 mỗi ngày (giờ Việt Nam)**. Lịch GitHub Actions có thể trễ. Workflow dùng `GITHUB_TOKEN` có sẵn, không cần PAT hay secret mới. Token chỉ được gửi đến GitHub API trong bước build, không được ghi vào HTML/JSON.

Pages của repo portfolio dùng **GitHub Actions** làm nguồn, giữ custom domain `thanhtech.cloud`. Artifact chỉ gồm `index.html`, `CNAME`, `CV.pdf`, `assets/`, `anh/`, `icon/` và `.nojekyll`. Các repo web con tiếp tục deploy bằng workflow riêng và giữ nguyên đường dẫn. Workflow này chỉ lập danh mục và liên kết chúng, không sao chép hay build mã nguồn của repo khác.

Để tự đồng bộ vào site ngay sau khi tạo repo mới, chạy **Actions → Sync projects & deploy portfolio → Run workflow**, hoặc chờ lịch hằng ngày.
