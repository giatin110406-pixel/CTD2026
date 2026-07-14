# CTD2026 - RAG Thesis Chatbot & Multi-Model Evaluation

Hệ thống RAG Thesis Chatbot hỗ trợ tra cứu luận văn tốt nghiệp, tích hợp đánh giá chất lượng tự động đa mô hình sử dụng thư viện Ragas.

---

## 🚀 Hướng Dẫn Cài Đặt và Chạy Dự Án Local

### 📋 Yêu cầu hệ thống
* **Python**: Khuyên dùng phiên bản `3.10.x` hoặc `3.11.x` (Không khuyến khích chạy bản `3.12+` do một số thư viện như `faiss-cpu` hoặc `ragas` có thể gặp lỗi tương thích).
* **Node.js**: Phiên bản LTS mới nhất (để khởi chạy Frontend).

---

### 1. Clone Dự Án từ GitHub
Mở Terminal trên máy tính của bạn và chạy lệnh:
```bash
git clone https://github.com/giatin110406-pixel/CTD2026.git
cd CTD2026
```

---

### 2. Thiết lập Backend (Python FastAPI)

1. **Tạo môi trường ảo (Virtual Environment)**:
   * *Trên Windows (Command Prompt hoặc PowerShell):*
     ```powershell
     python -m venv .venv
     .venv\Scripts\activate
     ```
   * *Trên macOS / Linux:*
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

2. **Cài đặt các thư viện Backend**:
   Chuyển vào thư mục `backend` và tiến hành cài đặt các gói dependencies cốt lõi đã được kiểm thử:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. **Cấu hình biến môi trường (`.env`)**:
   Tạo một file có tên là **`.env`** nằm bên trong thư mục **`backend/`** (lưu ý: không đặt ở thư mục gốc của dự án) và điền API Key của bạn:
   ```env
   # Khóa gọi LLM Gemini (LangChain sử dụng GOOGLE_API_KEY)
   GOOGLE_API_KEY=điền_api_key_của_bạn
   GEMINI_API_KEY=điền_api_key_của_bạn
   
   # Cấu hình các API keys khác nếu chạy đánh giá Ragas (Tùy chọn)
   ANTHROPIC_API_KEY=điền_api_key_nếu_có
   NVIDIA_API_KEY=điền_api_key_nếu_có
   GITHUB_TOKEN=điền_token_nếu_có
   ```
   *(Khuyến khích điền giá trị giống nhau cho cả `GOOGLE_API_KEY` và `GEMINI_API_KEY` để tránh lỗi bất đồng bộ giữa backend và giao diện phụ).*

4. **Chạy Backend Server**:
   Khởi chạy server uvicorn (vẫn ở trong thư mục `backend` và môi trường ảo đang active):
   ```bash
   uvicorn main:app --reload --port 8001
   ```
   *(Backend sẽ lắng nghe tại cổng `http://127.0.0.1:8001`)*

---

### 3. Thiết lập Frontend (React + Vite)

1. **Mở một terminal mới và di chuyển vào thư mục `frontend`**:
   ```bash
   cd frontend
   ```

2. **Cài đặt các gói thư viện Node.js**:
   ```bash
   npm install
   ```

3. **Kiểm tra địa chỉ API**:
   Kiểm tra nội dung file `.env.development` trong thư mục `frontend/`, đảm bảo biến `VITE_API_BASE_URL` trỏ đúng về cổng của backend:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8001
   ```

4. **Chạy Frontend**:
   ```bash
   npm run dev
   ```
   Mở trình duyệt và truy cập vào địa chỉ local do Vite cung cấp (thông thường là `http://localhost:5173`).

---

### 4. (Tùy chọn) Chạy đánh giá Ragas
Để kiểm thử hiệu năng RAG trên tập dữ liệu Golden Dataset (21 câu hỏi) với các mô hình khác nhau:
1. Đảm bảo môi trường ảo `.venv` đang kích hoạt.
2. Từ thư mục gốc của dự án (`CTD2026`), chạy lệnh:
   ```bash
   python run_multi_model_evaluation.py
   ```
   *(Kết quả đánh giá chi tiết của từng model sẽ được lưu dưới dạng các file `ragas_results_*.csv`)*

---

### 5. (Tùy chọn) Rebuild Vector Database
Cơ sở dữ liệu Vector (`FAISS`) đã được đóng gói sẵn trong thư mục `backend/kho_vector_thesis_pdr` nên bạn có thể sử dụng ngay mà không cần làm gì thêm. 

Tuy nhiên, nếu bạn thêm tài liệu PDF mới vào thư mục `backend/du_lieu_thesis/pdf_files/`, hãy cập nhật cơ sở dữ liệu bằng cách chạy lệnh sau từ thư mục gốc của dự án:
```bash
python rebuild_db_pdr.py
```