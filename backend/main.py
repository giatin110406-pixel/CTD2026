import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv


from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np




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




class CompareTopicRequest(BaseModel):
    """
    Cấu trúc yêu cầu đối với endpoint so sánh đề tài.
    """
    title: str
    description: str




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




@app.post("/api/compare-topic")
async def compare_topic(request: CompareTopicRequest):
    """
    Endpoint so sánh đề tài nghiên cứu của người dùng với kho luận văn FAISS hiện có.
    Thực hiện đối khớp ngữ nghĩa, xếp hạng độ tương đồng và dùng Gemini để phân tích khoảng trống nghiên cứu.
    """
    try:
        user_title = request.title
        user_desc = request.description


        # BƯỚC 1: Validate input chi tiết
        if not user_title or not isinstance(user_title, str):
            raise HTTPException(status_code=400, detail="title phải là string không rỗng")
        if not user_desc or not isinstance(user_desc, str):
            raise HTTPException(status_code=400, detail="description phải là string không rỗng")


        user_title = user_title.strip()
        user_desc = user_desc.strip()


        if len(user_title) < 5:
            raise HTTPException(status_code=400, detail="Tiêu đề quá ngắn (tối thiểu 5 ký tự)")
        if len(user_desc) < 20:
            raise HTTPException(status_code=400, detail="Mô tả quá ngắn (tối thiểu 20 ký tự)")
        if len(user_desc) > 1000:
            raise HTTPException(status_code=400, detail="Mô tả quá dài (tối đa 1000 ký tự)")


        # BƯỚC 2: Tạo câu truy vấn kết hợp
        combined_query = f"{user_title}. {user_desc}"


        # BƯỚC 3: Truy vấn top 10 luận văn tương tự nhất từ FAISS
        docs_with_scores = vector_db.similarity_search_with_score(combined_query, k=10)


        # BƯỚC 4: Định dạng kết quả so sánh
        similar_theses = []
        max_similarity = 0.0


        for doc, distance_score in docs_with_scores:
            meta = doc.metadata
            # FAISS L2 distance score sang similarity % (0-100)
            similarity_percent = float(round(max(0.0, (1.0 - float(distance_score))) * 100.0, 1))
            max_similarity = max(max_similarity, similarity_percent)


            similar_theses.append({
                "title": meta.get("title", "N/A"),
                "authors": meta.get("authors", "N/A"),
                "year": meta.get("year", "N/A"),
                "journal": meta.get("journal", "N/A"),
                "similarity": similarity_percent,
                "summary": doc.page_content[:300] if doc.page_content else "N/A"
            })


        # BƯỚC 5: Tổng hợp danh sách tài liệu tương đồng cho Gemini phân tích
        similar_titles_list = "\n".join([f"- {t['title']} ({t['year']})" for t in similar_theses[:5]])


        # BƯỚC 6: Gọi Gemini với Prompt tối ưu hóa
        gap_prompt = f"""Phân tích nhanh đề tài: "{user_title}"


Các thesis tìm thấy:
{similar_titles_list}


Trả lời với 3 phần:
1. ĐÁNH GIÁ: Độ trùng cao/trung bình/thấp
2. KHOẢNG TRỐNG: 3 hướng nghiên cứu mới
3. ĐỀ XUẤT: Cách làm độc đáo


(Tiếng Việt, ngắn gọn)"""


        gap_response = llm.invoke(gap_prompt)
        gap_analysis = gap_response.content


        # BƯỚC 7: Phân cấp độ overlap
        if max_similarity > 75:
            overlap_level = "CAO - Cần điều chỉnh để tránh trùng lặp"
        elif max_similarity > 50:
            overlap_level = "TRUNG BÌNH - Có thể phát triển hướng mới"
        else:
            overlap_level = "THẤP - Đề tài mới, có tiềm năng"


        return {
            "status": "success",
            "user_topic": user_title,
            "similar_theses": similar_theses,
            "gap_analysis": gap_analysis,
            "overlap_level": overlap_level,
            "top_match_similarity": max_similarity
        }


    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        print(f"Lỗi hệ thống trong endpoint so sánh: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ: {str(e)}")




# Endpoint kiểm tra sức khỏe hệ thống
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database_loaded": True, "total_chunks": "7117"}

