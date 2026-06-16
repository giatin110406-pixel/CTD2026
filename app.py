import streamlit as st
import time
from sentence_transformers import SentenceTransformer
import chromadb
from google import genai
from google.genai import types

# ══════════════════════════════════════
# CONFIG
# ══════════════════════════════════════
st.set_page_config(
    page_title="UEH Thesis Knowledge",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ══════════════════════════════════════
# CSS — Sửa lỗi chữ trắng trên nền trắng
# ══════════════════════════════════════
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@300;400&family=Instrument+Sans:wght@300;400;500&display=swap');

/* Hide Streamlit default UI */
#MainMenu, footer, header {visibility: hidden}
.stDeployButton {display: none}

/* Root colors */
:root {
    --teal: #005f69;
    --orange: #f26f33;
    --white: #ffffff;
    --paper: #f4f1ec;
}

/* App background */
.stApp {background: #f4f1ec !important}

/* Sidebar */
[data-testid="stSidebar"] {
    background: #005f69 !important;
    border-right: none !important;
}
[data-testid="stSidebar"] * {color: rgba(255,255,255,0.75) !important}
[data-testid="stSidebar"] h1,
[data-testid="stSidebar"] h2,
[data-testid="stSidebar"] h3 {
    color: #ffffff !important;
    font-family: "Cormorant Garamond", serif !important;
}

/* === SỬA LỖI HIỂN THỊ CHAT MẶC ĐỊNH === */
/* Bong bóng chat chung (Mặc định cho Assistant) */
[data-testid="stChatMessage"] {
    background: #ffffff !important;
    border: 1px solid rgba(0,95,105,0.1) !important;
    border-radius: 12px !important;
    box-shadow: 0 2px 12px rgba(0,95,105,0.06) !important;
}
/* Ép TẤT CẢ thành phần chữ (p, li, span,...) của Chatbot thành màu xám đen để rõ trên nền trắng */
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] * {
    color: #222222 !important;
}

/* Bong bóng chat của Người dùng (User) */
[data-testid="stChatMessage"][data-testid*="user"] {
    background: #005f69 !important;
}
/* Ép TẤT CẢ thành phần chữ của Người dùng thành màu TRẮNG để nổi bật trên nền xanh */
[data-testid="stChatMessage"][data-testid*="user"] [data-testid="stMarkdownContainer"] * {
    color: #ffffff !important;
}

/* Input box */
[data-testid="stChatInput"] textarea {
    background: #ffffff !important;
    border: 1.5px solid rgba(0,95,105,0.15) !important;
    border-radius: 12px !important;
    font-family: "Instrument Sans", sans-serif !important;
    font-size: 14px !important;
    color: #222222 !important;
}
[data-testid="stChatInput"] textarea:focus {
    border-color: #005f69 !important;
    box-shadow: 0 0 0 3px rgba(0,95,105,0.08) !important;
}

/* Send button */
[data-testid="stChatInput"] button {
    background: #005f69 !important;
    border-radius: 8px !important;
}

/* Metrics */
[data-testid="stMetric"] {
    background: rgba(255,255,255,0.08) !important;
    border-radius: 8px !important;
    padding: 8px 12px !important;
}

/* Spinner */
.stSpinner > div {border-top-color: #f26f33 !important}

/* Source tags */
.source-tag {
    display: inline-block;
    padding: 2px 8px;
    background: rgba(0,95,105,0.08);
    border: 1px solid rgba(0,95,105,0.15);
    border-radius: 4px;
    font-family: "DM Mono", monospace;
    font-size: 11px;
    color: #005f69;
    margin: 2px;
}
</style>
""", unsafe_allow_html=True)


# ══════════════════════════════════════
# LOAD MODELS (cache để không reload)
# ══════════════════════════════════════
@st.cache_resource
def load_embedding_model():
    return SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

@st.cache_resource
def load_chromadb():
    DB_PATH = "./chroma_db"
    client = chromadb.PersistentClient(path=DB_PATH)
    return client.get_or_create_collection(
        name="thesis_knowledge",
        metadata={"hnsw:space": "cosine"}
    )

@st.cache_resource
def load_gemini():
    import os
    api_key = "AIzaSyAfi_-o2ojDAJ1JitL2VCnIb2Ita8Tq6TA"
    return genai.Client(api_key=api_key)


# ══════════════════════════════════════
# RAG FUNCTION
# ══════════════════════════════════════
def rag_query(question, chat_history, n_results=5):
    embedding_model = load_embedding_model()
    collection = load_chromadb()
    client = load_gemini()

    # Embed câu hỏi
    q_vec = embedding_model.encode(question).tolist()

    # Tìm chunks
    results = collection.query(query_embeddings=[q_vec], n_results=n_results)
    chunks = results["documents"][0]
    metas = results["metadatas"][0]

    # Tạo knowledge context
    knowledge = ""
    sources = []
    for i, (chunk, meta) in enumerate(zip(chunks, metas)):
        knowledge += f"\n[Đoạn {i+1}] {meta['source']} - Trang {meta['page']}\n{chunk}\n"
        sources.append(f"{meta['source']} · Trang {meta['page']}")

    # Tạo conversation context (30 lượt gần nhất)
    conv = ""
    if chat_history:
        conv = "\n=== LỊCH SỬ HỘI THOẠI ===\n"
        for h in chat_history[-30:]:
            conv += f"Người dùng: {h['role'] == 'user' and h['content'] or ''}\n"
            conv += f"Trợ lý: {h['role'] == 'assistant' and h['content'] or ''}\n"
        conv += "=== KẾT THÚC ===\n"

    # Prompt
    prompt = f"""Bạn là trợ lý nghiên cứu học thuật của UEH.
{conv}
=== TRI THỨC TỪ LUẬN VĂN ===
{knowledge}
=== KẾT THÚC ===

Câu hỏi: {question}

Yêu cầu:
- Trả lời ĐẦY ĐỦ, CHI TIẾT, có cấu trúc rõ ràng
- Dùng thông tin từ luận văn, bổ sung kiến thức nền nếu cần
- Nếu câu hỏi liên quan câu trước, khai thác lịch sử hội thoại
- Trả lời tiếng Việt, trừ khi user hỏi tiếng Anh
- Ghi rõ nguồn trích dẫn cuối câu trả lời
"""

    # Gọi Gemini
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    max_output_tokens=8192,
                    temperature=0.3,
                )
            )
            return response.text, list(set(sources))
        except Exception as e:
            if "503" in str(e) or "429" in str(e):
                time.sleep((attempt + 1) * 10)
            else:
                return f"Lỗi: {e}", []

    return "Server không phản hồi, thử lại sau.", []


# ══════════════════════════════════════
# SIDEBAR
# ══════════════════════════════════════
with st.sidebar:
    st.markdown("""
    <div style="padding:8px 0 20px">
      <div style="font-family:Cormorant Garamond,serif;font-size:22px;font-weight:600;color:#fff;margin-bottom:4px">
        Thesis Knowledge
      </div>
      <div style="font-family:DM Mono,monospace;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:.15em">
        UEH · RAG SYSTEM
      </div>
    </div>
    """, unsafe_allow_html=True)

    # Stats
    collection = load_chromadb()
    col1, col2, col3 = st.columns(3)
    col1.metric("Luận văn", "3")
    col2.metric("Chunks", collection.count())
    col3.metric("Câu hỏi", len(st.session_state.get("messages", [])) // 2)

    st.divider()

    # Model info
    st.markdown("""
    <div style="font-family:DM Mono,monospace;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:.1em;margin-bottom:8px">
    MÔ HÌNH ĐANG DÙNG
    </div>
    """, unsafe_allow_html=True)
    st.caption("🟠 LLM: gemini-2.5-flash")
    st.caption("🟠 Embed: multilingual-MiniLM-L12-v2")
    st.caption("🟠 VectorDB: ChromaDB")

    st.divider()

    # Clear button
    if st.button("🗑 Xóa lịch sử", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

    # Context info
    msg_count = len(st.session_state.get("messages", []))
    if msg_count > 0:
        ctx = min(msg_count // 2, 30)
        st.markdown(f"""
        <div style="margin-top:12px;padding:6px 10px;background:rgba(242,111,51,0.15);border-radius:6px;font-size:11px;color:rgba(255,255,255,0.6);font-family:DM Mono,monospace">
        🧠 Context: {ctx}/30 lượt
        </div>
        """, unsafe_allow_html=True)


# ══════════════════════════════════════
# MAIN CHAT
# ══════════════════════════════════════
st.markdown("""
<div style="padding:0 0 20px">
  <span style="font-family:Cormorant Garamond,serif;font-size:26px;font-weight:400;color:#005f69">
    Trợ lý <i>nghiên cứu</i>
  </span>
  &nbsp;
  <span style="font-family:DM Mono,monospace;font-size:10px;padding:3px 8px;background:rgba(0,95,105,0.08);color:#005f69;border-radius:20px;border:1px solid rgba(0,95,105,0.12)">
    RAG · Luận văn UEH
  </span>
</div>
""", unsafe_allow_html=True)

# Init session
if "messages" not in st.session_state:
    st.session_state.messages = []

# Welcome state
if not st.session_state.messages:
    st.markdown("""
    <div style="text-align:center;padding:60px 20px">
      <div style="font-family:Cormorant Garamond,serif;font-size:42px;font-weight:300;color:#005f69;line-height:1.2;margin-bottom:12px">
        Khám phá <i><b>tri thức</b></i><br>từ luận văn UEH
      </div>
      <div style="color:#999;font-size:14px;max-width:400px;margin:0 auto;line-height:1.65">
        Tìm kiếm, tổng hợp và kế thừa tri thức từ kho luận văn học thuật.
      </div>
    </div>
    """, unsafe_allow_html=True)

    # Suggestion chips
    st.markdown("<div style='text-align:center'>", unsafe_allow_html=True)
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        if st.button("🤖 AI trong giáo dục?"):
            st.session_state.prefill = "AI ứng dụng trong giáo dục như thế nào?"
    with c2:
        if st.button("📊 Phương pháp định tính?"):
            st.session_state.prefill = "Phương pháp nghiên cứu định tính là gì?"
    with c3:
        if st.button("🔬 Machine learning?"):
            st.session_state.prefill = "Machine learning ứng dụng trong phân tích dữ liệu?"
    with c4:
        if st.button("📈 Chuyển đổi số?"):
            st.session_state.prefill = "Chuyển đổi số trong doanh nghiệp Việt Nam?"
    st.markdown("</div>", unsafe_allow_html=True)

# Hiển thị messages
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if "sources" in msg and msg["sources"]:
            srcs_html = " ".join([f'<span class="source-tag">📄 {s}</span>' for s in msg["sources"]])
            st.markdown(f'<div style="margin-top:8px">{srcs_html}</div>', unsafe_allow_html=True)

# Chat input
if question := st.chat_input("Hỏi về nội dung luận văn..."):
    # User message
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)

    # Bot response
    with st.chat_message("assistant"):
        with st.spinner("Đang tìm kiếm trong kho luận văn..."):
            answer, sources = rag_query(question, st.session_state.messages)
        st.markdown(answer)
        if sources:
            srcs_html = " ".join([f'<span class="source-tag">📄 {s}</span>' for s in sources])
            st.markdown(f'<div style="margin-top:8px">{srcs_html}</div>', unsafe_allow_html=True)
        st.session_state.messages.append({
            "role": "assistant",
            "content": answer,
            "sources": sources
        })
