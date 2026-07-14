import os
import sys
if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
import time
import json
import uuid
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 1. CẤU HÌNH ĐƯỜNG DẪN THƯ MỤC
DATA_DIR = "backend/du_lieu_thesis"
PDF_DIR = os.path.join(DATA_DIR, "pdf_files")
FAISS_DB_PATH = "backend/kho_vector_thesis_pdr"
PARENT_STORE_PATH = "backend/kho_parent_thesis.json"

print("🧠 Đang khởi tạo bộ nhúng ngữ nghĩa với mô hình MiniLM-L12-v2...")
encode_kwargs = {'normalize_embeddings': True}
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    model_kwargs={'device': 'cpu'},
    encode_kwargs=encode_kwargs
)

print("✂️ Đang cấu hình bộ chia tài liệu Cha - Con (Semantic Parent - Recursive Child Splitter)...")
from langchain_experimental.text_splitter import SemanticChunker
# Parent chunks: Cắt theo mạch ý nghĩa ngữ nghĩa (Semantic Chunker) giúp giữ nguyên ngữ cảnh đầy đủ
parent_splitter = SemanticChunker(
    embeddings=embeddings,
    breakpoint_threshold_type="standard_deviation",
    breakpoint_threshold_amount=1.25
)
# Child chunks: Cắt cực mịn (250 ký tự) giúp khớp ngữ nghĩa và từ khóa chính xác nhất
child_splitter = RecursiveCharacterTextSplitter(chunk_size=250, chunk_overlap=50)


all_child_chunks = []
parent_store = {}

print("🗂️ Bắt đầu tiến trình băm nhỏ tài liệu theo mô hình Parent-Child...")
if os.path.exists(PDF_DIR):
    pdf_files = [f for f in os.listdir(PDF_DIR) if f.endswith('.pdf')]
    
    for idx, pdf_file in enumerate(pdf_files):
        base_name = os.path.splitext(pdf_file)[0]
        pdf_path = os.path.join(PDF_DIR, pdf_file)
        json_path = os.path.join(DATA_DIR, f"{base_name}.json")
        
        # Đọc dữ liệu Metadata học thuật từ file JSON
        metadata_addon = {}
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    metadata_addon = json.load(f)
            except Exception as e:
                print(f"⚠️ Không thể đọc file JSON {json_path}: {e}")
        
        try:
            # 1. Đọc nội dung PDF
            loader = PyMuPDFLoader(pdf_path)
            docs = loader.load()
            
            # 2. Cắt thành các đoạn Cha (Parent)
            parent_docs = parent_splitter.split_documents(docs)
            
            # 3. Phân mảnh Con (Child) từ mỗi đoạn Cha
            for parent_doc in parent_docs:
                parent_id = str(uuid.uuid4())
                
                # Cập nhật Metadata học thuật cho đoạn Cha
                parent_metadata = {
                    "title": metadata_addon.get("title", "N/A"),
                    "authors": metadata_addon.get("authors", "N/A"),
                    "year": metadata_addon.get("year", "2026"),
                    "journal": metadata_addon.get("journal", "N/A"),
                    "source_url": metadata_addon.get("source_url", ""),
                    "file_name": pdf_file,
                    "parent_id": parent_id
                }
                parent_doc.metadata.update(parent_metadata)
                
                # Lưu đoạn Cha vào Parent Store để truy hồi sau này
                parent_store[parent_id] = {
                    "page_content": parent_doc.page_content,
                    "metadata": parent_doc.metadata
                }
                
                # Cắt đoạn Cha thành các đoạn Con
                child_docs = child_splitter.split_documents([parent_doc])
                for child_doc in child_docs:
                    # Kế thừa toàn bộ Metadata từ đoạn Cha (chứa parent_id để liên kết ngược)
                    child_doc.metadata.update(parent_doc.metadata)
                    all_child_chunks.append(child_doc)
                    
            print(f"[{idx+1}/{len(pdf_files)}] 🔥 Đã xử lý Parent-Child: {pdf_file} -> Tạo ra {len(parent_docs)} đoạn Cha, {len(child_docs)} đoạn Con.")
        except Exception as e:
            print(f"❌ Lỗi khi xử lý file {pdf_file}: {e}")

print(f"\n🎯 HOÀN THÀNH PHÂN MẢNH: Có tổng cộng {len(parent_store)} đoạn Cha và {len(all_child_chunks)} đoạn Con.")

# 4. EMBEDDING VÀ LƯU VECTOR DATABASE FAISS (Cho đoạn Con)
print("\n⏳ Bắt đầu mã hóa các đoạn Con bằng CPU và tạo kho Vector FAISS...")
start_time = time.time()
vector_db = FAISS.from_documents(all_child_chunks, embeddings)
vector_db.save_local(FAISS_DB_PATH)
end_time = time.time()
print(f"✅ Đã lưu kho Vector Con tại '{FAISS_DB_PATH}' (Thời gian: {end_time - start_time:.2f} giây).")

# 5. LƯU PARENT STORE DICTIONARY DƯỚI DẠNG FILE JSON
print("💾 Đang lưu trữ kho tài liệu Cha (Parent Store) làm file JSON...")
with open(PARENT_STORE_PATH, "w", encoding="utf-8") as f:
    json.dump(parent_store, f, ensure_ascii=False, indent=2)
print(f"✅ Đã lưu file kho tài liệu Cha tại '{PARENT_STORE_PATH}'.")
print("🎉 HỆ THỐNG ĐÃ CẤU TRÚC PDR HOÀN TẤT THÀNH CÔNG!")
