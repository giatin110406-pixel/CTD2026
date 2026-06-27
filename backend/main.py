import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
load_dotenv(override=True)


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
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3, max_retries=3)


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
       
        # 3. Lấy danh sách tên file PDF độc nhất từ metadata của các docs tìm thấy
        sources_list = []
        for doc in docs:
            # Lấy tên file thực tế từ metadata (ví dụ: file_name, hoặc trích xuất từ source/pdf_path)
            file_name = doc.metadata.get("file_name")
            if not file_name:
                pdf_path = doc.metadata.get("source") or doc.metadata.get("pdf_path")
                if pdf_path:
                    file_name = os.path.basename(pdf_path)
            if not file_name:
                file_name = doc.metadata.get("title", "document") + ".pdf"
            
            # Đảm bảo tên file sạch, kết thúc bằng đuôi .pdf
            if file_name and not file_name.endswith(".pdf"):
                file_name = file_name + ".pdf"
                
            # Đảm bảo không bị trùng lặp
            if file_name not in sources_list:
                sources_list.append(file_name)
                
        # Cấu trúc dữ liệu phản hồi mới (Response Payload)
        return {
            "answer": answer,
            "sources": sources_list
        }
    except Exception as e:
        import traceback
        err_msg = str(e)
        print(f"Lỗi chat_with_thesis: {traceback.format_exc()}")
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            raise HTTPException(
                status_code=429,
                detail="Tài khoản Gemini của bạn bị giới hạn lượt gọi (Rate Limit 429). Vui lòng thử lại sau 1-2 phút."
            )
        elif "API_KEY" in err_msg or "API key not valid" in err_msg:
            raise HTTPException(
                status_code=400,
                detail="Khóa API Gemini (GEMINI_API_KEY) trong file .env không hợp lệ hoặc đã hết hạn."
            )
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ: {err_msg}")




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


import json
from fastapi import File, Form, UploadFile
from langchain_core.messages import SystemMessage, HumanMessage
from viva_agents import EXAMINERS_CONFIG

# Viva schemas
class VivaStartRequest(BaseModel):
    pdf_title: str
    pdf_url: str | None = None

class VivaChatHistoryItem(BaseModel):
    sender: str  # "user" or "bot"
    examiner_id: str | None = None
    text: str

class VivaChatRequest(BaseModel):
    history: list[VivaChatHistoryItem]
    user_answer: str
    current_examiner_id: str
    pdf_title: str
    pdf_url: str | None = None
    pdf_context: str | None = None


# Helper utility to parse JSON from LLM output (cleaning markdown blocks if present)
def parse_json_from_llm(content: str):
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    return json.loads(content)


@app.post("/api/viva/start")
async def start_viva(
    file: UploadFile = File(None),
    pdf_title: str = Form(...),
    pdf_url: str = Form(None)
):
    try:
        # 1. Trích xuất văn bản từ tệp PDF nếu có tải lên
        pdf_context = ""
        if file is not None:
            try:
                import fitz
                pdf_bytes = await file.read()
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                extracted_pages = []
                for page in doc[:4]:  # Lấy tối đa 4 trang đầu (chứa tiêu đề, tóm tắt, mục lục, phương pháp luận)
                    extracted_pages.append(page.get_text())
                pdf_context = "\n".join(extracted_pages)[:6000] # Giới hạn 6000 ký tự tránh tràn context cửa sổ LLM
                print(f"Trích xuất thành công {len(pdf_context)} ký tự từ PDF tải lên: {file.filename}")
            except Exception as pdf_err:
                print(f"Lỗi khi giải nén văn bản PDF: {pdf_err}")
                pdf_context = ""

        # 2. Query RAG vào FAISS để so khớp đề tài
        docs_with_scores = vector_db.similarity_search_with_score(pdf_title, k=4)
        
        is_completely_new = True
        top_similarity = 0.0
        if docs_with_scores:
            distance = docs_with_scores[0][1]
            top_similarity = max(0.0, (1.0 - float(distance))) * 100.0
            if top_similarity > 35.0:
                is_completely_new = False
                
        # 3. Tạo thông tin tham khảo RAG
        rag_context = ""
        for i, (doc, score) in enumerate(docs_with_scores[:3]):
            meta = doc.metadata
            title = meta.get("title", "Không rõ tiêu đề")
            authors = meta.get("authors", "Không rõ tác giả")
            year = meta.get("year", "N/A")
            rag_context += f"Tài liệu liên quan {i+1}: {title} - Tác giả: {authors} ({year})\nNội dung: {doc.page_content[:200]}...\n\n"
            
        # 4. Gộp ngữ cảnh nghiên cứu
        final_pdf_context = pdf_context if pdf_context else (rag_context if not is_completely_new else "")
        
        # 5. Khởi tạo giám khảo đầu tiên
        current_examiner = EXAMINERS_CONFIG["examiner_methodology"]
        
        novelty_status = (
            "Đề tài này mới hoàn toàn so với cơ sở dữ liệu hiện hành (is_completely_new = True)."
            if is_completely_new else
            f"Đề tài này có liên quan tới các nghiên cứu hiện có (Độ tương tự cao nhất: {top_similarity:.1f}%)."
        )
        
        pdf_details = (
            f"NỘI DUNG TÀI LIỆU CỦA SINH VIÊN (PDF):\n{final_pdf_context}\n"
            if final_pdf_context else
            "Sinh viên chưa tải lên nội dung tài liệu chi tiết, chỉ cung cấp tiêu đề đề tài."
        )

        system_instruction = (
            f"{current_examiner['system_prompt']}\n\n"
            f"Đề tài bảo vệ luận văn của sinh viên: '{pdf_title}'.\n"
            f"Trạng thái đề tài: {novelty_status}\n\n"
            f"{pdf_details}\n\n"
            "Nhiệm vụ: Hãy phân tích kỹ loại hình tài liệu của sinh viên (Ví dụ: đây là bài nghiên cứu thực nghiệm hay là bài viết nghiên cứu lý thuyết/khái niệm).\n"
            "Sau đó, hãy đặt câu hỏi chất vấn số 1 cực kỳ sắc bén, học thuật và phù hợp với đúng loại hình đề tài này."
        )
        
        messages = [
            SystemMessage(content=system_instruction),
            HumanMessage(content="Hãy đặt câu hỏi chất vấn đầu tiên của bạn về đề tài luận văn này.")
        ]
        
        response = llm.invoke(messages)
        first_question = response.content
        
        return {
            "status": "success",
            "is_completely_new": is_completely_new,
            "top_similarity": top_similarity,
            "current_examiner_id": current_examiner["id"],
            "question": first_question,
            "pdf_context": final_pdf_context,
            "history": [
                {"sender": "bot", "examiner_id": current_examiner["id"], "text": first_question}
            ]
        }
    except Exception as e:
        import traceback
        err_msg = str(e)
        print(f"Lỗi start_viva: {traceback.format_exc()}")
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            raise HTTPException(
                status_code=429,
                detail="Hội đồng AI đang bận (Tài khoản Google Gemini của bạn bị giới hạn lượt gọi - Rate Limit 429). Vui lòng đợi 1-2 phút rồi nhấn 'Làm lại từ đầu' để thử lại."
            )
        elif "API_KEY" in err_msg or "API key not valid" in err_msg:
            raise HTTPException(
                status_code=400,
                detail="Khóa API Gemini (GEMINI_API_KEY) trong file .env không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại."
            )
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ: {err_msg}")


@app.post("/api/viva/chat")
async def chat_viva(request: VivaChatRequest):
    try:
        history = request.history
        user_answer = request.user_answer
        current_examiner_id = request.current_examiner_id
        pdf_title = request.pdf_title
        pdf_context = request.pdf_context
        
        # 1. Đếm số câu hỏi của giám khảo hiện tại trong lịch sử chat
        questions_by_current = [m for m in history if m.sender == "bot" and m.examiner_id == current_examiner_id]
        questions_count = len(questions_by_current)
        
        examiner_order = ["examiner_methodology", "examiner_novelty", "examiner_practical"]
        current_index = examiner_order.index(current_examiner_id)
        
        pdf_context_str = f"NỘI DUNG TÀI LIỆU CỦA SINH VIÊN (PDF):\n{pdf_context}\n\n" if pdf_context else ""

        # Check if we can still ask a follow-up (max questions per examiner = 3)
        if questions_count < 3:
            examiner = EXAMINERS_CONFIG[current_examiner_id]
            
            conversation_context = ""
            for item in history:
                role = "Hội đồng" if item.sender == "bot" else "Sinh viên"
                conversation_context += f"{role}: {item.text}\n"
            
            system_instruction = (
                f"{examiner['system_prompt']}\n\n"
                f"Đề tài của sinh viên: '{pdf_title}'.\n"
                f"{pdf_context_str}"
                f"Cuộc hội thoại phản biện cho đến nay:\n{conversation_context}\n"
                f"Sinh viên vừa trả lời: '{user_answer}'\n\n"
                "Nhiệm vụ: Đánh giá câu trả lời mới nhất này của sinh viên.\n"
                "- Nếu câu trả lời còn yếu, né tránh, thiếu số liệu hay thiếu lập luận thuyết phục, hãy chọn is_satisfactory = false và đưa ra câu hỏi phản biện phụ (follow_up_question) sắc sảo, dồn dập, phù hợp với định hướng khoa học của bạn.\n"
                "- Nếu câu trả lời đã thuyết phục và trả lời trực diện câu hỏi, hoặc bạn không có ý kiến phản đối nào thêm, hãy chọn is_satisfactory = true.\n\n"
                "Bạn BẮT BUỘC phải phản hồi ở định dạng JSON thô duy nhất có dạng:\n"
                "{\n"
                "  \"is_satisfactory\": true_or_false_boolean,\n"
                "  \"evaluation\": \"Nhận xét ngắn gọn và mang tính chuyên môn cao về câu trả lời\",\n"
                "  \"follow_up_question\": \"Câu hỏi xoáy tiếp theo phù hợp với đề tài (để trống nếu is_satisfactory = true)\"\n"
                "}"
            )
            
            messages = [
                SystemMessage(content=system_instruction),
                HumanMessage(content="Đánh giá câu trả lời của tôi và phản hồi bằng JSON.")
            ]
            
            response = llm.invoke(messages)
            
            try:
                eval_result = parse_json_from_llm(response.content)
                is_satisfactory = eval_result.get("is_satisfactory", True)
                evaluation = eval_result.get("evaluation", "")
                follow_up = eval_result.get("follow_up_question", "")
            except Exception as json_err:
                print(f"Lỗi phân tích JSON đánh giá: {json_err}. Raw: {response.content}")
                is_satisfactory = True
                evaluation = "Câu trả lời tạm chấp nhận được."
                follow_up = ""
                
            if not is_satisfactory and follow_up and questions_count < 3:
                return {
                    "is_finished": False,
                    "current_examiner_id": current_examiner_id,
                    "transition": False,
                    "evaluation": evaluation,
                    "question": follow_up
                }
                
        # 2. Chuyển lượt sang giám khảo tiếp theo
        if current_index + 1 < len(examiner_order):
            next_examiner_id = examiner_order[current_index + 1]
            next_examiner = EXAMINERS_CONFIG[next_examiner_id]
            
            conversation_context = ""
            for item in history:
                role = "Hội đồng" if item.sender == "bot" else "Sinh viên"
                conversation_context += f"{role}: {item.text}\n"
            conversation_context += f"Sinh viên: {user_answer}\n"
            
            system_instruction = (
                f"{next_examiner['system_prompt']}\n\n"
                f"Đề tài của sinh viên: '{pdf_title}'.\n"
                f"{pdf_context_str}"
                f"Cuộc hội thoại phản biện trước đó:\n{conversation_context}\n"
                "Nhiệm vụ: Hãy bắt đầu phần phản biện của bạn. Đưa ra câu hỏi đầu tiên của bạn chất vấn sinh viên dựa trên nội dung đề tài và cuộc trao đổi vừa rồi. Giữ đúng phong cách và văn phong khoa học học thuật đặc trưng của bạn."
            )
            
            messages = [
                SystemMessage(content=system_instruction),
                HumanMessage(content="Hãy đặt câu hỏi chất vấn đầu tiên của bạn.")
            ]
            
            response = llm.invoke(messages)
            next_question = response.content
            
            return {
                "is_finished": False,
                "current_examiner_id": next_examiner_id,
                "transition": True,
                "evaluation": f"Chuyển lượt sang vị giám khảo tiếp theo: {next_examiner['name']}.",
                "question": next_question
            }
            
        else:
            # 3. Kết thúc buổi phản biện, Hội đồng họp đánh giá và ra Scorecard
            conversation_context = ""
            for item in history:
                role = "Hội đồng" if item.sender == "bot" else "Sinh viên"
                conversation_context += f"{role}: {item.text}\n"
            conversation_context += f"Sinh viên: {user_answer}\n"
            
            system_instruction = (
                "Bạn đang đóng vai toàn bộ Hội đồng phản biện luận văn tốt nghiệp ĐHQG-HCM.\n"
                "Nhiệm vụ: Tổng hợp toàn bộ cuộc phản biện dưới đây và đưa ra đánh giá, điểm số cuối cùng.\n\n"
                f"Tên đề tài: '{pdf_title}'\n"
                f"{pdf_context_str}"
                f"Cuộc hội thoại bảo vệ luận văn:\n{conversation_context}\n\n"
                "Yêu cầu:\n"
                "- Cho điểm khách quan từ 0.0 đến 10.0 (score) dựa trên thái độ học tập và kiến thức chuyên môn sinh viên đã thể hiện.\n"
                "- Nêu rõ ít nhất 3 điểm mạnh học thuật (strengths) và 3 điểm yếu kỹ thuật/nội dung cần sửa đổi (weaknesses) của luận văn.\n"
                "- Đưa ra danh sách các câu hỏi chất vấn khó nhất kèm theo gợi ý câu trả lời mẫu chuẩn học thuật (ideal_answers) giúp sinh viên hoàn thiện bài nghiên cứu.\n\n"
                "Bạn BẮT BUỘC phải phản hồi ở định dạng JSON thô duy nhất có cấu trúc chính xác như sau:\n"
                "{\n"
                "  \"score\": float_score,\n"
                "  \"strengths\": [\"điểm mạnh 1\", \"điểm mạnh 2\", ...],\n"
                "  \"weaknesses\": [\"điểm yếu 1\", \"điểm yếu 2\", ...],\n"
                "  \"ideal_answers\": [\n"
                "     {\n"
                "       \"question\": \"câu hỏi khó 1\",\n"
                "       \"answer\": \"trả lời mẫu chuẩn học thuật\"\n"
                "     },\n"
                "     ...\n"
                "  ]\n"
                "}\n"
                "Tuyệt đối chỉ trả về chuỗi JSON thô, không kèm bất kỳ markdown nào."
            )
            
            messages = [
                SystemMessage(content=system_instruction),
                HumanMessage(content="Tổng hợp và chấm điểm phản biện luận văn bằng JSON.")
            ]
            
            response = llm.invoke(messages)
            
            try:
                scorecard = parse_json_from_llm(response.content)
            except Exception as json_err:
                print(f"Lỗi phân tích JSON scorecard: {json_err}. Raw: {response.content}")
                scorecard = {
                    "score": 7.5,
                    "strengths": ["Cố gắng trả lời đầy đủ các câu hỏi", "Đề tài có hướng phát triển tốt"],
                    "weaknesses": ["Một số câu trả lời còn chung chung", "Cần làm rõ phương pháp luận"],
                    "ideal_answers": [
                        {
                            "question": "Vấn đề kỹ thuật chính trong bài là gì?",
                            "answer": "Sinh viên nên tập trung vào quy trình chuẩn hóa và thiết kế mẫu tối ưu."
                        }
                    ]
                }
                
            return {
                "is_finished": True,
                "scorecard": scorecard
            }
            
    except Exception as e:
        import traceback
        err_msg = str(e)
        print(f"Lỗi chat_viva: {traceback.format_exc()}")
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            raise HTTPException(
                status_code=429,
                detail="Lượt chất vấn bị gián đoạn do tài khoản Gemini bị giới hạn (Rate Limit 429). Hãy đợi 1-2 phút rồi gửi lại câu trả lời."
            )
        elif "API_KEY" in err_msg or "API key not valid" in err_msg:
            raise HTTPException(
                status_code=400,
                detail="Khóa API Gemini không hợp lệ. Vui lòng kiểm tra lại cấu hình."
            )
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ: {err_msg}")


PDF_STORAGE_DIR = os.path.join(os.path.dirname(__file__), "du_lieu_thesis", "pdf_files")

@app.get("/api/pdf/{filename}")
async def get_pdf(filename: str):
    file_path = os.path.join(PDF_STORAGE_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File không tồn tại")
    return FileResponse(file_path, media_type="application/pdf")



