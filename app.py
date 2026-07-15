import streamlit as st
import os
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from google import genai
from google.genai import types
from google.genai.errors import APIError
from dotenv import load_dotenv
import time

# 1. CẤU HÌNH TRANG WEB STREAMLIT
st.set_page_config(
    page_title="Trợ Lý Ảo Pháp Luật Việt Nam",
    page_icon="⚖️",
    layout="wide"
)

st.title("⚖️ Trợ Lý Ảo Pháp Luật Việt Nam")
st.caption("🚀 Hệ thống RAG tìm kiếm, sửa lỗi OCR và trả lời tự động dựa trên kho dữ liệu pháp luật toàn văn")

# 2. KHỞI TẠO HỆ THỐNG CACHING
@st.cache_resource
def init_rag_system():
    load_dotenv(override=True)
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        model_kwargs={'device': 'cpu'}
    )
    if not os.path.exists("kho_vector_phap_luat"):
        return None, None, "❌ Không tìm thấy thư mục 'kho_vector_phap_luat'!"
    vector_db = FAISS.load_local("kho_vector_phap_luat", embeddings, allow_dangerous_deserialization=True)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None, None, "❌ Thiếu biến GEMINI_API_KEY trong file .env hoặc hệ thống!"
    client = genai.Client(api_key=api_key)
    return vector_db, client, "✅ Hệ thống RAG đã sẵn sàng!"

vector_db, client, status_msg = init_rag_system()

with st.sidebar:
    st.header("⚙️ Cấu Hình Hệ Thống")
    st.info(status_msg)

if vector_db is None or client is None:
    st.error("Vui lòng kiểm tra lại cấu hình hệ thống.")
    st.stop()

# 3. QUẢN LÝ LỊCH SỬ CHAT
if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "assistant", "content": "Xin chào! Tôi là Trợ lý ảo chuyên gia Pháp luật Việt Nam. Bạn cần tôi tra cứu hoặc giải đáp điều luật nào hôm nay?"}
    ]

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# 4. HÀM XỬ LÝ TRUY VẤN RAG TỐI ƯU CÂN BẰNG
def process_rag_query(query):
    try:
        # Tìm kiếm 3 mảnh tương đồng nhất
        docs_and_scores = vector_db.similarity_search_with_score(query, k=3)
        context_parts = []
        sources = []
        for doc, score in docs_and_scores:
            context_parts.append(doc.page_content)
            sources.append((doc, score)) # Lưu cả Object Document và Score độ khớp

        context_text = "\n\n-------------------------\n\n".join(context_parts)

        # PROMPT CÂN BẰNG CAO CẤP: Ép sửa lỗi font OCR và xử lý thông tin chuẩn xác
        prompt_template = f'''Bạn là một chuyên gia tư vấn pháp luật chính xác và chuyên nghiệp tại Việt Nam.
Hãy sử dụng 'NGỮ CẢNH PHÁP LÝ' dưới đây để trả lời 'CÂU HỎI NGƯỜI DÙNG'.

⚠️ QUY TẮC DIỄN ĐẠT CHÍ MẠNG:
1. Trình bày câu trả lời đầy đủ, rõ ràng bằng các dấu đầu dòng. Tuyệt đối không dừng câu giữa chừng, không viết cụt ngủn.
2. Nếu các con số hoặc câu từ trong 'NGỮ CẢNH PHÁP LÝ' bị thiếu chữ, dính từ hoặc sai chính tả do lỗi quét ảnh OCR (Ví dụ: 'Bộ Bộ nghiệp và Môi trường' thực chất là 'Bộ Nông nghiệp và Phát triển nông thôn', 'Nghị quyệt' là 'Nghị quyết', 'Điêu' là 'Điều'), hãy tự động hoàn thiện và chuẩn hóa nó một cách hợp lý theo chuẩn văn bản pháp luật khi trả lời.
3. Tuyệt đối KHÔNG tự bịa ra các thông tin, điều khoản không có thật nếu ngữ cảnh không nhắc tới.
4. Chỉ từ chối nếu ngữ cảnh hoàn toàn không liên quan đến chủ đề câu hỏi.

[NGỮ CẢNH PHÁP LÝ]:
{context_text}

[CÂU HỎI NGƯỜI DÙNG]:
{query}

Trả lời:'''

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model="gemini-3.5-flash",
                    contents=prompt_template,
                    config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=2500)
                )
                return response.text, sources
            except APIError as api_err:
                if api_err.code == 503 and attempt < max_retries - 1:
                    time.sleep(2)
                    continue
                else:
                    raise api_err
    except Exception as e:
        return f"❌ Lỗi xử lý hệ thống: {e}", []

# 5. KHUNG NHẬP CÂU HỎI VÀ HIỂN THỊ KẾT QUẢ ĐA TẦNG METADATA
if user_query := st.chat_input("Nhập câu hỏi pháp luật tại đây..."):
    with st.chat_message("user"):
        st.markdown(user_query)
    st.session_state.messages.append({"role": "user", "content": user_query})

    with st.chat_message("assistant"):
        with st.spinner("⚖️ Đang tổng hợp câu trả lời..."):
            bot_answer, bot_sources = process_rag_query(user_query)
            st.markdown(bot_answer)

            # ĐÚNG CHUẨN ĐỒ ÁN: Render giao diện hiển thị nguồn trích dẫn phân cấp rõ ràng
            if bot_sources:
                with st.expander("📚 Xem nguồn trích dẫn gốc (Hệ thống Metadata nâng cao)"):
                    for idx, (doc, score) in enumerate(bot_sources):
                        meta = doc.metadata
                        st.markdown(f"**Nguồn {idx+1}:** {meta.get('title', 'Văn bản không rõ tên')}")
                        st.markdown(f"- **Số hiệu:** `{meta.get('so_hieu', 'N/A')}` | **Cơ quan ban hành:** {meta.get('co_quan_ban_hanh', 'N/A')} | **Loại văn bản:** {meta.get('loai_van_ban', 'N/A')}")
                        st.markdown(f"- **Độ tương đồng Vector:** Khoảng cách score `{score:.2f}`")
                        st.markdown(f"- [Xem văn bản gốc trực tuyến trên Web Chính Phủ]({meta.get('source_url', '#')})")
                        st.text_area(f"Đoạn văn bản gốc từ file OCR (Mảnh {idx+1})", doc.page_content, height=100)
                        st.markdown("---")

    # Lưu câu trả lời của trợ lý ảo vào lịch sử phiên làm việc
    st.session_state.messages.append({"role": "assistant", "content": bot_answer})
