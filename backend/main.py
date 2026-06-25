import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

# Tạo chuỗi xử lý RAG thủ công nhưng chạy cực kỳ ổn định

def custom_stuff_documents(llm, prompt, docs, query):
    # 1. Duyệt qua từng tài liệu để gộp cả Metadata (Tiêu đề, Tác giả) vào Context
    context_chunks = []
    for doc in docs:
        meta = doc.metadata
        title = meta.get("title", "Không rõ tiêu đề")
        authors = meta.get("authors", "Không rõ tác giả")
        year = meta.get("year", "2026")
        journal = meta.get("journal", "N/A")
        
        # Đóng gói thành một cụm thông tin hoàn chỉnh, rõ ràng
        chunk_info = (
            f"--- BÀI BÁO TÌM THẤY ---\n"
            f"Tiêu đề: {title}\n"
            f"Tác giả: {authors}\n"
            f"Năm xuất bản: {year}\n"
            f"Tạp chí/Phân hệ gốc: {journal} | Thư mục: {doc.page_content}"
        )
        context_chunks.append(chunk_info)
    
    # Nối tất cả các cụm thông tin bài báo lại với nhau bằng dấu xuống dòng
    full_context = "\n\n".join(context_chunks)
    
    # 2. Sử dụng format_messages (Chuẩn Chat thế hệ mới, thay vì format_prompt)
    messages = prompt.format_messages(context=full_context, input=query)
    
    # 3. Gọi Gemini xử lý thẳng danh sách tin nhắn
    response = llm.invoke(messages)
    return response.content


# 1. TẢI CẤU HÌNH BẢO MẬT (.env)
load_dotenv()

# 2. KHỞI TẠO FASTAPI
app = FastAPI(title="Thesis Chatbot API")

# 3. CẤU HÌNH CORS (Cho phép React cổng 3000 gọi sang Python cổng 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. NẠP KHO VECTOR FAISS (7.117 mảnh dữ liệu của bạn)
FAISS_DB_PATH = "kho_vector_thesis"
encode_kwargs = {'normalize_embeddings': True}
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    model_kwargs={'device': 'cpu'},
    encode_kwargs=encode_kwargs
)

# Tải kho vector cứng từ folder lên RAM để truy vấn siêu tốc
vector_db = FAISS.load_local(FAISS_DB_PATH, embeddings, allow_dangerous_deserialization=True)
retriever = vector_db.as_retriever(search_kwargs={"k": 4}) 

# 5. KHAI BÁO CẤU TRÚC DỮ LIỆU ĐẦU VÀO TỪ REACT
class ChatRequest(BaseModel):
    message: str

# 6. THIẾT LẬP PROMPT VÀ MÔ HÌNH GEMINI
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3)

# Cập nhật lại đoạn Prompt trong main.py của bạn
system_prompt = """Bạn là một trợ lý AI chuyên nghiệp và thông minh, có nhiệm vụ hỗ trợ nghiên cứu luận văn của ĐHQG-HCM.
Nhiệm vụ của bạn là đọc kỹ các đoạn ngữ cảnh (Context) được cung cấp, đặc biệt là thông tin tiêu đề bài báo, tác giả, lĩnh vực để tổng hợp thành câu trả lời cho người dùng.

HƯỚNG DẪN XỬ LÝ LOGIC (BẮT BUỘC):
1. Khi người dùng hỏi về các hướng nghiên cứu, đề tài nghiên cứu chính hoặc xu hướng của một phân hệ (ví dụ: Khoa học Sức khỏe / Health Sci.), bạn KHÔNG ĐƯỢC từ chối nếu ngữ cảnh đã có sẵn các bài báo thuộc lĩnh vực đó.
2. Hãy chủ động ĐỌC TIÊU ĐỀ của các bài báo xuất hiện trong ngữ cảnh (Context), dịch nghĩa/phân tích chúng và tự tổng hợp lại thành các hướng nghiên cứu lớn bằng tiếng Việt.
   - Ví dụ nếu thấy bài về "PERITONSILLAR ABSCESS", hãy đúc kết là hướng nghiên cứu lâm sàng Tai Mũi Họng.
   - Nếu thấy bài về "GLUCOSE MONITORING", hãy đúc kết là hướng nghiên cứu Sản khoa/Rối loạn chuyển hóa.
   - Nếu thấy bài về "PCR conditions", hãy đúc kết là hướng ứng dụng Công nghệ sinh học.
3. Tuyệt đối KHÔNG trả lời theo kiểu "ngữ cảnh không có thông tin chi tiết" khi danh sách bài báo đã hiển thị rõ ràng. Hãy làm việc như một chuyên gia phân tích dữ liệu thực thụ.

Ngữ cảnh (Context):
{context}"""

prompt_template = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
])


# 7. ENDPOINT API CHÍNH (React sẽ gọi vào đây để chat)
@app.post("/api/chat")
async def chat_with_thesis(request: ChatRequest):
    try:
        user_query = request.message
        
        # 1. Tìm kiếm các mảnh tài liệu liên quan từ kho FAISS
        docs = vector_db.similarity_search(user_query, k=4)
        
        # 2. Đưa vào hàm custom để Gemini trả lời dựa trên ngữ cảnh
        answer = custom_stuff_documents(llm, prompt_template, docs, user_query)
        
        # 3. Thu thập thông tin nguồn trích dẫn
        sources = []
        for doc in docs:
            meta = doc.metadata
            source_info = {
                "title": meta.get("title", "N/A"),
                "authors": meta.get("authors", "N/A"),
                "year": meta.get("year", "N/A"),
                "journal": meta.get("journal", "N/A")
            }
            if source_info not in sources:
                sources.append(source_info)
                
        return {"status": "success", "answer": answer, "sources": sources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint kiểm tra sức khỏe hệ thống
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database_loaded": True, "total_chunks": "7117"}