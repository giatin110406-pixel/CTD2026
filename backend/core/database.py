import os
import json
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from sklearn.feature_extraction.text import TfidfVectorizer
from langchain_core.documents import Document
import numpy as np

# BASE_DIR should point to 'backend/' folder (one level up from core/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FAISS_DB_PATH = os.path.join(BASE_DIR, "kho_vector_thesis_pdr")
if not os.path.exists(FAISS_DB_PATH):
    FAISS_DB_PATH = os.path.join(BASE_DIR, "kho_vector_thesis")

# Initialize Embedding Model
encode_kwargs = {'normalize_embeddings': True}
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    model_kwargs={'device': 'cpu'},
    encode_kwargs=encode_kwargs
)

# Load FAISS database to RAM
vector_db = FAISS.load_local(FAISS_DB_PATH, embeddings, allow_dangerous_deserialization=True)
retriever = vector_db.as_retriever(search_kwargs={"k": 10})

# TF-IDF Initialization (PDR Support)
PARENT_STORE_PATH = os.path.join(BASE_DIR, "kho_parent_thesis.json")
parent_store = {}
if os.path.exists(PARENT_STORE_PATH):
    try:
        with open(PARENT_STORE_PATH, "r", encoding="utf-8") as f:
            parent_store = json.load(f)
    except Exception as e:
        print(f"⚠️ Lỗi đọc file parent store: {e}")

print("Fitting TF-IDF on database documents...")
all_docs = list(vector_db.docstore._dict.values())

if parent_store:
    print("Using Parent Document Store for TF-IDF indexing...")
    pdr_parent_docs = []
    all_parent_texts = []
    for parent_id, p_data in parent_store.items():
        p_doc = Document(page_content=p_data["page_content"], metadata=p_data["metadata"])
        pdr_parent_docs.append(p_doc)
        all_parent_texts.append(p_data["page_content"])
    
    tfidf_vectorizer = TfidfVectorizer()
    tfidf_matrix = tfidf_vectorizer.fit_transform(all_parent_texts)
else:
    print("Using Child Document Store for TF-IDF indexing (fallback)...")
    pdr_parent_docs = all_docs
    all_texts = [doc.page_content for doc in all_docs]
    tfidf_vectorizer = TfidfVectorizer()
    tfidf_matrix = tfidf_vectorizer.fit_transform(all_texts)

print("TF-IDF Matrix fitted successfully.")
