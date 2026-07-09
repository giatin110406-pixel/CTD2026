import os
import sys
if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
import json
import csv
import time
import urllib.request
import pandas as pd
from dotenv import load_dotenv
from datasets import Dataset


# Hack to bypass Ragas v0.4.3 import bug with modern langchain-community versions
from types import ModuleType
dummy_vertexai = ModuleType("langchain_community.chat_models.vertexai")
dummy_vertexai.ChatVertexAI = object
sys.modules["langchain_community.chat_models.vertexai"] = dummy_vertexai


try:
    from ragas import evaluate
    # ragas.metrics is deprecated in 0.4.x → use ragas.metrics.collections
    from ragas.metrics import faithfulness, answer_relevancy, context_precision, answer_correctness
    from ragas.llms import LangchainLLMWrapper
    from ragas.embeddings import LangchainEmbeddingsWrapper
except ImportError:
    print("Error: Ragas is not installed or import failed.")
    print("Please ensure your virtual environment is active and run: pip install ragas")
    sys.exit(1)


# Import LangChain integrations
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    print("Error: langchain-google-genai is not installed. Run: pip install langchain-google-genai")
    sys.exit(1)


# HuggingFaceEmbeddings: prefer langchain_huggingface (new), fallback to langchain_community (old)
try:
   
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    try:
        from langchain_community.embeddings import HuggingFaceEmbeddings
    except ImportError:
        print("Error: HuggingFaceEmbeddings not found. Run: pip install langchain-huggingface")
        sys.exit(1)


# Dynamically import OpenAI / Anthropic integrations to prevent immediate crashes if not installed
try:
    from langchain_openai import ChatOpenAI
except ImportError:
    # Fallback to langchain_community if langchain_openai is not installed
    try:
        from langchain_community.chat_models import ChatOpenAI
    except ImportError:
        print("Warning: ChatOpenAI cannot be imported. We will attempt generic imports later.")
        ChatOpenAI = None


try:
   
    from langchain_anthropic import ChatAnthropic


except ImportError:
    ChatAnthropic = None




# 1. LOAD CONFIGURATION
load_dotenv(r"backend/.env")


API_URL = "http://127.0.0.1:8001/api/chat"
INPUT_CSV = "golden_dataset.csv"
CACHE_JSON = "cached_rag_responses.json"
SUMMARY_CSV = "ragas_judges_comparison.csv"


# 2. COLLECT OR LOAD CHATBOT ANSWERS
rag_results = []


if os.path.exists(CACHE_JSON):
    print(f"Found cached chatbot responses in '{CACHE_JSON}'. Loading from cache to save time...")
    with open(CACHE_JSON, "r", encoding="utf-8") as f:
        rag_results = json.load(f)
    print(f"Loaded {len(rag_results)} cached responses.")
else:
    if not os.path.exists(INPUT_CSV):
        print(f"Error: {INPUT_CSV} not found!")
        sys.exit(1)


    questions_data = []
    with open(INPUT_CSV, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            questions_data.append(row)


    print(f"Loaded {len(questions_data)} test cases. Querying Chatbot API on {API_URL}...")
   
    for idx, item in enumerate(questions_data):
        q = item["question"]
        gt = item["ground_truth"]
       
        q_safe = q[:50].encode('ascii', errors='replace').decode('ascii')
        print(f"[{idx+1}/{len(questions_data)}] Querying: {q_safe}...")
       
        payload = {"message": q}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(API_URL, data=data, headers={"Content-Type": "application/json"})
       
        success = False
        retries = 3
        while not success and retries > 0:
            try:
                with urllib.request.urlopen(req) as res:
                    response = json.loads(res.read().decode("utf-8"))
                   
                answer = response.get("answer", "")
                contexts = response.get("contexts", [])
               
                rag_results.append({
                    "question": q,
                    "answer": answer,
                    "contexts": contexts,
                    "ground_truth": gt
                })
                success = True
                time.sleep(2) # Prevent rate limiting on generator LLM
            except Exception as e:
                err_safe = str(e)[:150].encode('ascii', errors='replace').decode('ascii')
                print(f"  Error querying API (retries left: {retries-1}): {err_safe}")
                retries -= 1
                time.sleep(4)
               
    # Save cache so we don't have to query backend again if evaluation fails
    if rag_results:
        with open(CACHE_JSON, "w", encoding="utf-8") as f:
            json.dump(rag_results, f, ensure_ascii=False, indent=2)
        print(f"Successfully saved chatbot responses to cache: '{CACHE_JSON}'")


if not rag_results:
    print("Error: No answers collected from Chatbot!")
    sys.exit(1)


# Convert to HuggingFace Dataset
dataset = Dataset.from_pandas(pd.DataFrame(rag_results))


# 3. SETUP EMBEDDINGS (shared by all Ragas runs)
print("Initializing embeddings model...")
local_emb = HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    model_kwargs={'device': 'cpu'}
)
ragas_embeddings = LangchainEmbeddingsWrapper(local_emb)




# 4. DEFINE JUDGE MODELS INITIALIZATION FUNCTIONS
def get_gemini_judge():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("Missing GEMINI_API_KEY in .env")
    return ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=key, temperature=0)


def get_claude_judge():
    # Attempt 1: Official Anthropic API
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        if ChatAnthropic is None:
            raise ImportError("langchain-anthropic is not installed. Run: pip install langchain-anthropic")
        return ChatAnthropic(model="claude-sonnet-5", api_key=anthropic_key, temperature=0)
       
       
    raise ValueError("Missing ANTHROPIC_API_KEY or GITHUB_TOKEN in .env for Claude Judge")


def get_claude_haiku_judge():
    # Attempt 1: Official Anthropic API
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        if ChatAnthropic is None:
            raise ImportError("langchain-anthropic is not installed. Run: pip install langchain-anthropic")
        return ChatAnthropic(model="claude-haiku-4-5-20251001", api_key=anthropic_key, temperature=0)
       
       
    raise ValueError("Missing ANTHROPIC_API_KEY or GITHUB_TOKEN in .env for Claude Judge")




def get_llama_groq_judge():
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise ValueError("Missing GROQ_API_KEY in .env")
    if ChatOpenAI is None:
        raise ImportError("langchain-openai is not installed. Run: pip install langchain-openai")
    return ChatOpenAI(
        model="llama-3.3-70b-versatile",
        api_key=groq_key,
        base_url="https://api.groq.com/openai/v1",
        temperature=0
    )


def get_qwen3_next_openrouter_judge():
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise ValueError("Missing OPENROUTER_API_KEY in .env for Qwen 3 Next Judge")
    if ChatOpenAI is None:
        raise ImportError("langchain-openai is not installed. Run: pip install langchain-openai")
    return ChatOpenAI(
        model="qwen/qwen3-next-80b-a3b-instruct",
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0
    )


# Dictionary of judge setup functions
judges_config = {
    "Gemini 2.5 Flash": get_gemini_judge,
    "Claude 5 Sonnet": get_claude_judge,
    "Claude 4.5 Haiku": get_claude_haiku_judge,
    "Llama 3.3 70B (Groq)": get_llama_groq_judge,
    "Qwen 3 Next (OpenRouter)": get_qwen3_next_openrouter_judge
}


comparison_summary = []


# 5. RUN EVALUATION FOR EACH MODEL
for name, init_fn in judges_config.items():
    print(f"\n==================================================")
    print(f" Starting Evaluation with Judge: {name}")
    print(f"==================================================")
   
    try:
        # Initialize the Langchain LLM
        llm = init_fn()
        ragas_judge = LangchainLLMWrapper(llm)
       
        # Evaluate
        # batch_size=1: process questions sequentially to avoid free-tier rate limits (429)
        # column_map: Ragas 0.4.x renamed columns (question→user_input, answer→response,
        #             contexts→retrieved_contexts, ground_truth→reference)
        print("Running Ragas metrics (faithfulness, answer_relevancy, context_precision, answer_correctness)...")
        result = evaluate(
            dataset=dataset,
            metrics=[faithfulness, answer_relevancy, context_precision, answer_correctness],
            llm=ragas_judge,
            embeddings=ragas_embeddings,
            column_map={
                "user_input": "question",
                "response": "answer",
                "retrieved_contexts": "contexts",
                "reference": "ground_truth"
            },
            batch_size=1
        )
       
        # Save individual CSV
        safe_name = name.lower().replace(" ", "_").replace("(", "").replace(")", "").replace("/", "_")
        output_file = f"ragas_results_{safe_name}.csv"
        df_res = result.to_pandas()
        df_res.to_csv(output_file, index=False, encoding="utf-8-sig")
        print(f"Detailed scores saved to '{output_file}'")
       
        # Save summary
        # Ragas 0.4.x: EvaluationResult has no _repr_dict; use to_pandas() to compute metric means
        METRIC_COLS = ["faithfulness", "answer_relevancy", "context_precision", "answer_correctness"]
        scores_dict = {}
        try:
            # Try dict-like access first (some Ragas builds support this)
            scores_dict = {m: float(result[m]) for m in METRIC_COLS if m in result}
        except (TypeError, KeyError):
            pass
        if not scores_dict:
            # Fallback: compute per-row means from DataFrame
            df_scores = result.to_pandas()
            scores_dict = {
                m: round(float(df_scores[m].mean()), 4)
                for m in METRIC_COLS if m in df_scores.columns
            }
        summary_row = {"Judge Model": name}
        print("\nOverall Scores:")
        for metric, score in scores_dict.items():
            summary_row[metric] = round(score, 4)
            print(f"  {metric:<20} : {score:.4f}")
        comparison_summary.append(summary_row)
       
        # Pause slightly between models to clear rate limits
        print("Waiting 15 seconds to prevent rate limits for the next model...")
        time.sleep(15)
       
    except Exception as e:
        import traceback
        print(f"❌ Error evaluating with {name}: {traceback.format_exc()}")
        comparison_summary.append({
            "Judge Model": name,
            "Error": str(e)[:100]
        })


# 6. SAVE AND DISPLAY COMPARISON SUMMARY TABLE
if comparison_summary:
    df_summary = pd.DataFrame(comparison_summary)
    df_summary.to_csv(SUMMARY_CSV, index=False, encoding="utf-8-sig")
   
    print("\n\n==================================================")
    print("             JUDGES COMPARISON SUMMARY            ")
    print("==================================================")
    print(df_summary.to_string(index=False))
    print("==================================================")
    print(f"Comparison summary saved to '{SUMMARY_CSV}'.")



