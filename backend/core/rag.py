import os
from langchain_core.prompts import ChatPromptTemplate

def extract_text(content) -> str:
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, dict) and "text" in part:
                text_parts.append(part["text"])
            elif isinstance(part, str):
                text_parts.append(part)
        return "".join(text_parts)
    return str(content)

def custom_stuff_documents(llm, prompt, docs, query):
    context_chunks = []
    for doc in docs:
        meta = doc.metadata
        title = meta.get("title", "Không rõ tiêu đề")
        authors = meta.get("authors", "Không rõ tác giả")
        year = meta.get("year", "2026")
        journal = meta.get("journal", "N/A")
       
        chunk_info = (
            f"--- BÀI BÁO TÌM THẤY ---\n"
            f"Tiêu đề: {title}\n"
            f"Tác giả: {authors}\n"
            f"Năm xuất bản: {year}\n"
            f"Tạp chí/Phân hệ gốc: {journal}\nNội dung đoạn trích: {doc.page_content}"
        )
        context_chunks.append(chunk_info)
    
    full_context = "\n\n".join(context_chunks)
    messages = prompt.format_messages(context=full_context, input=query)
    response = llm.invoke(messages)
    return extract_text(response.content)

# System Prompt & Prompt Template
system_prompt = """Bạn là một trợ lý AI chuyên nghiệp và thông minh hỗ trợ nghiên cứu khoa học. Nhiệm vụ của bạn là đọc kỹ các đoạn ngữ cảnh (Context) được cung cấp dưới đây để trả lời câu hỏi của người dùng.

HƯỚNG DẪN XỬ LÝ LOGIC (BẮT BUỘC):
1. TRẢ LỜI TRỰC TIẾP: Đi thẳng vào câu trả lời, tuyệt đối KHÔNG bắt đầu bằng các câu mở đầu thừa thãi như "Dựa trên ngữ cảnh được cung cấp...", "Theo tài liệu...", hoặc lời chào xã giao.
2. CHÍNH XÁC VÀ CỤ THỂ: Trích xuất chính xác các số liệu, tên phần mềm, phương pháp nghiên cứu, tên tác giả, năm công bố, cỡ mẫu (ví dụ: "PLS-SEM", "SmartPLS 4", "405 nhân viên y tế") có trong ngữ cảnh. Không tự ý suy diễn hoặc làm tròn số liệu.
3. NGẮN GỌN VÀ SÚC TÍCH: Chỉ tập trung trả lời đúng ý được hỏi. Tránh viết quá dài dòng hoặc đưa vào các phân tích lan man ngoài lề.
4. XỬ LÝ HƯỚNG NGHIÊN CỨU: Khi được hỏi về hướng nghiên cứu của một phân hệ/lĩnh vực, hãy chủ động đọc tiêu đề các bài báo trong Context, phân tích và tổng hợp thành các hướng nghiên cứu lớn bằng tiếng Việt.

Ngữ cảnh (Context):
{context}"""

prompt_template = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
])

def expand_query_vietnamese(query: str) -> str:
    expanded = query
    abbreviations = {
        "đổi mới sáng tạo": "ĐMST PII",
        "năng suất lao động": "NSLĐ PRO",
        "khoa học công nghệ": "KHCN",
        "kinh tế xã hội": "KT-XH",
        "kinh tế - xã hội": "KT-XH",
        "cơ sở hạ tầng": "CSHT",
        "tổng sản phẩm trên địa bàn": "GRDP",
        "năng lực cạnh tranh": "PCI",
        "hiệu quả công việc": "HQCV",
        "sự gắn kết công việc": "GK",
        "sự gắn bó tổ chức": "GB",
        "khoa học xã hội và nhân văn": "KHXH&NV USSH",
        "đại học quốc gia": "ĐHQG-HCM ĐHQG",
        "thành phố hồ chí minh": "TP.HCM TP. Hồ Chí Minh TP HCM"
    }
    query_lower = query.lower()
    for key, val in abbreviations.items():
        if key in query_lower:
            expanded += f" {val}"
    return expanded

def do_hybrid_search(user_query: str) -> list:
    from core.database import vector_db, tfidf_vectorizer, tfidf_matrix, pdr_parent_docs, parent_store
    from langchain_core.documents import Document
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np

    expanded_query = expand_query_vietnamese(user_query)
    
    # 1. Tìm kiếm Vector (Dense) - Lấy Top 15 ứng viên từ FAISS (đoạn Con)
    raw_vector_results = vector_db.similarity_search_with_score(expanded_query, k=15)
    
    # Nếu chạy chế độ PDR, ánh xạ các đoạn Con thành đoạn Cha tương ứng
    vector_results = []
    if parent_store:
        seen_parent_ids = set()
        for doc, score in raw_vector_results:
            parent_id = doc.metadata.get("parent_id")
            if parent_id and parent_id in parent_store:
                if parent_id not in seen_parent_ids:
                    seen_parent_ids.add(parent_id)
                    p_data = parent_store[parent_id]
                    p_doc = Document(page_content=p_data["page_content"], metadata=p_data["metadata"])
                    vector_results.append((p_doc, score))
            else:
                vector_results.append((doc, score))
    else:
        vector_results = raw_vector_results[:10]
    
    # 2. Tìm kiếm Từ khóa (Sparse) - Sử dụng TF-IDF (trên đoạn Cha)
    query_tfidf = tfidf_vectorizer.transform([expanded_query])
    tfidf_similarities = cosine_similarity(query_tfidf, tfidf_matrix).flatten()
    
    # Lọc lấy Top 10 ứng viên có điểm TF-IDF tương đồng cao nhất
    top_tfidf_indices = np.argsort(tfidf_similarities)[::-1][:10]
    tfidf_results = []
    for idx in top_tfidf_indices:
        score = float(tfidf_similarities[idx])
        if score > 0.05:  # Chỉ lấy các tài liệu có độ tương đồng từ khóa tối thiểu
            tfidf_results.append((pdr_parent_docs[idx], score))
    
    # 3. Phối hợp kết quả bằng Reciprocal Rank Fusion (RRF)
    rrf_scores = {}
    
    # Ranks từ Vector Search
    for rank, (doc, score) in enumerate(vector_results):
        key = doc.page_content
        if key not in rrf_scores:
            rrf_scores[key] = {"doc": doc, "score": 0.0}
        rrf_scores[key]["score"] += 1.0 / (60 + (rank + 1))
    
    # Ranks từ TF-IDF Search
    for rank, (doc, score) in enumerate(tfidf_results):
        key = doc.page_content
        if key not in rrf_scores:
            rrf_scores[key] = {"doc": doc, "score": 0.0}
        rrf_scores[key]["score"] += 1.0 / (60 + (rank + 1))
    
    # Sắp xếp và chọn tài liệu tối ưu dựa trên điểm RRF
    hybrid_results = list(rrf_scores.values())
    hybrid_results.sort(key=lambda x: x["score"], reverse=True)
    
    docs = [item["doc"] for item in hybrid_results[:5]]
    
    # Dự phòng: Nếu không tìm thấy bất kỳ tài liệu nào, lấy Top 1 của FAISS
    if not docs and vector_results:
        docs = [vector_results[0][0]]
    
    return docs
