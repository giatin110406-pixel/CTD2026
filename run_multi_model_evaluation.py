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
    from ragas.run_config import RunConfig
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


# Rate limiter for Cerebras to stay under 5 RPM limit (1 request per 12 seconds)
cerebras_rate_limiter = None
# Rate limiter for Groq to stay under 6K TPM limit (1 request per 12.5 seconds to space out keys completely)
groq_rate_limiter = None
# Rate limiter for OpenRouter to keep requests spaced out safely (1 request per 10 seconds)
openrouter_rate_limiter = None
# Rate limiter for Nvidia NIM to keep requests spaced out safely under the 40 RPM limit (1 request per 2 seconds)
nvidia_rate_limiter = None
try:
    from langchain_core.rate_limiters import InMemoryRateLimiter
    cerebras_rate_limiter = InMemoryRateLimiter(
        requests_per_second=0.08,  # ~1 request every 12.5 seconds
        check_every_n_seconds=0.1,
        max_bucket_size=1
    )
    groq_rate_limiter = InMemoryRateLimiter(
        requests_per_second=0.08,  # ~1 request every 12.5 seconds
        check_every_n_seconds=0.1,
        max_bucket_size=1
    )
    openrouter_rate_limiter = InMemoryRateLimiter(
        requests_per_second=0.066,  # ~1 request every 15 seconds to stay safe from IP-level 16 RPM limit
        check_every_n_seconds=0.1,
        max_bucket_size=1
    )
    nvidia_rate_limiter = InMemoryRateLimiter(
        requests_per_second=0.5,  # ~1 request every 2 seconds to keep requests moderate and safe
        check_every_n_seconds=0.1,
        max_bucket_size=1
    )
except ImportError:
    pass


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

from langchain_core.language_models.chat_models import BaseChatModel

class SequentialCompletionsChatGoogleGenerativeAI(ChatGoogleGenerativeAI):
    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        n = kwargs.get("n", 1)
        if n == 1 and hasattr(self, "n") and self.n is not None:
            n = self.n
        if n > 1:
            print(f"\n⚠️ Google API does not support n={n} directly for Gemma. Simulating by making {n} sequential calls with n=1...")
            kwargs_copy = kwargs.copy()
            kwargs_copy["n"] = 1
            generations = []
            for _ in range(n):
                res = super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs_copy)
                generations.extend(res.generations)
            from langchain_core.outputs import ChatResult
            return ChatResult(generations=generations)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        n = kwargs.get("n", 1)
        if n == 1 and hasattr(self, "n") and self.n is not None:
            n = self.n
        if n > 1:
            print(f"\n⚠️ Google API does not support async n={n} directly for Gemma. Simulating by making {n} sequential calls with n=1...")
            kwargs_copy = kwargs.copy()
            kwargs_copy["n"] = 1
            generations = []
            for _ in range(n):
                res = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs_copy)
                generations.extend(res.generations)
            from langchain_core.outputs import ChatResult
            return ChatResult(generations=generations)
        return await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)


class RotatingGeminiChat(BaseChatModel):
    _models: list = []
    _current_index: int = 0
    _lock = None
    
    def __init__(self, api_keys: list, chat_class=ChatGoogleGenerativeAI, **kwargs):
        super().__init__()
        self._models = [
            chat_class(api_key=key, **kwargs)
            for key in api_keys
        ]
        self._current_index = 0
        self._lock = None
        
    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        retries = len(self._models)
        while retries > 0:
            model = self._models[self._current_index]
            try:
                result = model._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
                # Rotate for the next call even on success to distribute load
                self._current_index = (self._current_index + 1) % len(self._models)
                return result
            except Exception as e:
                print(f"\n⚠️ API Key index {self._current_index} failed with error: {str(e)[:200]}")
                print(f"🔄 Rotating to next key (remaining retries: {retries-1})...")
                self._current_index = (self._current_index + 1) % len(self._models)
                retries -= 1
                time.sleep(1)
        raise RuntimeError("All Gemini API keys in the rotation list failed!")
        
    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        import asyncio
        if self._lock is None:
            self._lock = asyncio.Lock()
            
        async with self._lock:
            # Set retries to at least 10 to ensure single-key setups can retry through temporary limits
            retries = max(len(self._models) * 3, 10)
            while retries > 0:
                model = self._models[self._current_index]
                try:
                    result = await model._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
                    self._current_index = (self._current_index + 1) % len(self._models)
                    # Giãn cách 2 giây sau mỗi câu thành công để tránh lỗi dồn dập (Burst RPM/TPM)
                    await asyncio.sleep(2)
                    return result
                except Exception as e:
                    print(f"\n⚠️ Async API Key index {self._current_index} failed with error: {str(e)[:200]}")
                    print(f"🔄 Rotating to next key (remaining retries: {retries-1})...")
                    self._current_index = (self._current_index + 1) % len(self._models)
                    retries -= 1
                    # Nghỉ 5 giây khi lỗi để API "nguội" bớt trước khi thử lại
                    await asyncio.sleep(5)
            raise RuntimeError("All async Gemini API keys in the rotation list failed!")
        
    @property
    def _llm_type(self) -> str:
        return "rotating-gemini-chat"


class RotatingKeyChatOpenAI(BaseChatModel):
    _models: list = []
    _current_index: int = 0
    _provider_name: str = "API"
    _lock = None
    
    def __init__(self, api_keys: list, provider_name: str = "API", chat_class=ChatOpenAI, **kwargs):
        super().__init__()
        self._provider_name = provider_name
        self._models = [
            chat_class(api_key=key, **kwargs)
            for key in api_keys
        ]
        self._current_index = 0
        self._lock = None
        
    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        retries = len(self._models)
        while retries > 0:
            model = self._models[self._current_index]
            try:
                result = model._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
                self._current_index = (self._current_index + 1) % len(self._models)
                return result
            except Exception as e:
                print(f"\n⚠️ {self._provider_name} API Key index {self._current_index} failed with error: {str(e)[:200]}")
                print(f"🔄 Rotating to next {self._provider_name} key (remaining retries: {retries-1})...")
                self._current_index = (self._current_index + 1) % len(self._models)
                retries -= 1
                time.sleep(1)
        raise RuntimeError(f"All {self._provider_name} API keys in the rotation list failed!")
        
    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        import asyncio
        if self._lock is None:
            self._lock = asyncio.Lock()
            
        async with self._lock:
            # Set retries to at least 10 to ensure single-key setups can retry through temporary limits
            retries = max(len(self._models) * 3, 10)
            while retries > 0:
                model = self._models[self._current_index]
                try:
                    result = await model._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
                    self._current_index = (self._current_index + 1) % len(self._models)
                    # Giãn cách 2 giây sau mỗi câu thành công để tránh lỗi dồn dập (Burst RPM/TPM)
                    await asyncio.sleep(2)
                    return result
                except Exception as e:
                    print(f"\n⚠️ Async {self._provider_name} API Key index {self._current_index} failed with error: {str(e)[:200]}")
                    print(f"🔄 Rotating to next {self._provider_name} key (remaining retries: {retries-1})...")
                    self._current_index = (self._current_index + 1) % len(self._models)
                    retries -= 1
                    # Nghỉ 5 giây khi lỗi để API "nguội" bớt trước khi thử lại
                    await asyncio.sleep(5)
            raise RuntimeError(f"All async {self._provider_name} API keys in the rotation list failed!")
        
    @property
    def _llm_type(self) -> str:
        return f"rotating-{self._provider_name.lower()}-chat"


def get_gemini_judge():
    keys_str = os.getenv("GEMINI_API_KEYS", "")
    api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    
    if not api_keys:
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if gemini_key:
            api_keys = [gemini_key]
            
    if not api_keys:
        raise ValueError("Missing GEMINI_API_KEY or GEMINI_API_KEYS in .env")
        
    if len(api_keys) == 1:
        return ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            api_key=api_keys[0],
            temperature=0,
            max_retries=10
        )
        
    return RotatingGeminiChat(
        api_keys=api_keys,
        model="gemini-2.5-flash",
        temperature=0,
        max_retries=10
    )


class TemperatureFreeChatAnthropic(ChatAnthropic if ChatAnthropic is not None else object):
    def _get_request_payload(self, messages, *, stop=None, **kwargs):
        kwargs.pop("temperature", None)
        payload = super()._get_request_payload(messages, stop=stop, **kwargs)
        payload.pop("temperature", None)
        return payload


def get_claude_judge():
    # Official Anthropic API
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if not anthropic_key:
        raise ValueError("Missing ANTHROPIC_API_KEY in .env for Claude Judge")
        
    if ChatAnthropic is None:
        raise ImportError("langchain-anthropic is not installed. Run: pip install langchain-anthropic")
    return TemperatureFreeChatAnthropic(model="claude-sonnet-5", api_key=anthropic_key)


def get_gpt4_1_mini_github_judge():
    github_token = os.getenv("GITHUB_TOKEN")
    if not github_token:
        raise ValueError("Missing GITHUB_TOKEN in .env")
    return ChatOpenAI(
        model="gpt-4.1-mini",
        api_key=github_token,
        base_url="https://models.inference.ai.azure.com",
        temperature=0,
        max_retries=10,
        timeout=60
    )


def get_llama_groq_judge():
    keys_str = os.getenv("GROQ_API_KEYS", "")
    api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    
    if not api_keys:
        # Fallback: check individual keys
        key_llama = os.getenv("GROQ_API_KEY_LLAMA")
        key_qwen = os.getenv("GROQ_API_KEY_QWEN")
        api_keys = [k for k in [key_llama, key_qwen] if k]
        
    if not api_keys:
        raise ValueError("Missing GROQ_API_KEYS or GROQ_API_KEY_LLAMA/QWEN in .env")
        
    if len(api_keys) == 1:
        kwargs = {
            "model": "llama-3.3-70b-versatile",
            "api_key": api_keys[0],
            "base_url": "https://api.groq.com/openai/v1",
            "temperature": 0,
            "max_retries": 10,
            "timeout": 60,
            "max_tokens": 3000
        }
        if groq_rate_limiter is not None:
            kwargs["rate_limiter"] = groq_rate_limiter
        return ChatOpenAI(**kwargs)
        
    kwargs = {
        "model": "llama-3.3-70b-versatile",
        "base_url": "https://api.groq.com/openai/v1",
        "temperature": 0,
        "max_retries": 10,
        "timeout": 60,
        "max_tokens": 3000
    }
    if groq_rate_limiter is not None:
        kwargs["rate_limiter"] = groq_rate_limiter
    return RotatingKeyChatOpenAI(api_keys=api_keys, provider_name="Groq", **kwargs)


def get_qwen_groq_judge():
    keys_str = os.getenv("GROQ_API_KEYS", "")
    api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    
    if not api_keys:
        groq_key = os.getenv("GROQ_API_KEY_QWEN")
        if groq_key:
            api_keys = [groq_key]
            
    if not api_keys:
        raise ValueError("Missing GROQ_API_KEYS or GROQ_API_KEY_QWEN in .env")
        
    if len(api_keys) == 1:
        kwargs = {
            "model": "qwen/qwen3-32b", # Khớp với MODEL ID trên Groq Console
            "api_key": api_keys[0],
            "base_url": "https://api.groq.com/openai/v1",
            "temperature": 0,
            "max_retries": 12, # Tăng số lần thử lại khi gặp lỗi 429
            "timeout": 60,
            "max_tokens": 3000
        }
        if groq_rate_limiter is not None:
            kwargs["rate_limiter"] = groq_rate_limiter
        return ChatOpenAI(**kwargs)
        
    kwargs = {
        "model": "qwen/qwen3-32b",
        "base_url": "https://api.groq.com/openai/v1",
        "temperature": 0,
        "max_retries": 12,
        "timeout": 60,
        "max_tokens": 3000
    }
    if groq_rate_limiter is not None:
        kwargs["rate_limiter"] = groq_rate_limiter
    return RotatingKeyChatOpenAI(api_keys=api_keys, provider_name="Groq", **kwargs)

class SequentialCompletionsChatOpenAI(ChatOpenAI):
    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        # Kiểm tra nếu 'n' được truyền trong kwargs hoặc được đặt ở class level và > 1
        n = kwargs.get("n", 1)
        if n == 1 and hasattr(self, "n") and self.n is not None:
            n = self.n
            
        if n > 1:
            print(f"\n⚠️ Endpoint does not support n={n}. Simulating by making {n} sequential calls with n=1...")
            kwargs_copy = kwargs.copy()
            kwargs_copy["n"] = 1
            generations = []
            for _ in range(n):
                res = super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs_copy)
                generations.extend(res.generations)
            from langchain_core.outputs import ChatResult
            return ChatResult(generations=generations)
            
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        n = kwargs.get("n", 1)
        if n == 1 and hasattr(self, "n") and self.n is not None:
            n = self.n
            
        if n > 1:
            print(f"\n⚠️ Endpoint does not support async n={n}. Simulating by making {n} sequential calls with n=1...")
            kwargs_copy = kwargs.copy()
            kwargs_copy["n"] = 1
            generations = []
            for _ in range(n):
                res = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs_copy)
                generations.extend(res.generations)
            from langchain_core.outputs import ChatResult
            return ChatResult(generations=generations)
            
        return await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)


def get_zai_glm_cerebras_judge():
    cerebras_key = os.getenv("CEREBRAS_API_KEY")
    if not cerebras_key:
        raise ValueError("Missing CEREBRAS_API_KEY in .env")
    
    kwargs = {
        "model": "zai-glm-4.7",
        "api_key": cerebras_key,
        "base_url": "https://api.cerebras.ai/v1",
        "temperature": 0,
        "max_retries": 10,
        "timeout": 60
    }
    if cerebras_rate_limiter is not None:
        kwargs["rate_limiter"] = cerebras_rate_limiter
        
    return SequentialCompletionsChatOpenAI(**kwargs)


def get_gemma_google_judge():
    keys_str = os.getenv("GEMINI_API_KEYS", "")
    api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    
    if not api_keys:
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if gemini_key:
            api_keys = [gemini_key]
            
    if not api_keys:
        raise ValueError("Missing GEMINI_API_KEY or GEMINI_API_KEYS in .env")
        
    model_name = "gemma-4-31b-it"
    
    if len(api_keys) == 1:
        return SequentialCompletionsChatGoogleGenerativeAI(
            model=model_name,
            api_key=api_keys[0],
            temperature=0,
            timeout=180,      # Thiết lập timeout lớn để g Gemma có thời gian suy nghĩ
            max_retries=15
        )
        
    return RotatingGeminiChat(
        api_keys=api_keys,
        chat_class=SequentialCompletionsChatGoogleGenerativeAI,
        model=model_name,
        temperature=0,
        timeout=180,      # Thiết lập timeout lớn cho cả bộ xoay vòng
        max_retries=15
    )


def get_deepseek_official_judge():
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    if not deepseek_key:
        raise ValueError("Missing DEEPSEEK_API_KEY in .env. Vui lòng điền API key chính chủ của DeepSeek.")
        
    kwargs = {
        "model": "deepseek-v4-pro",
        "base_url": "https://api.deepseek.com",
        "temperature": 0,
        "max_retries": 10,
        "timeout": 180,
        "max_tokens": 3000
    }
    
    # Sử dụng RotatingKeyChatOpenAI với 1 key duy nhất để kế thừa bộ khóa tuần tự (asyncio.Lock)
    return RotatingKeyChatOpenAI(
        api_keys=[deepseek_key],
        provider_name="DeepSeekOfficial",
        chat_class=SequentialCompletionsChatOpenAI,
        **kwargs
    )


# Dictionary of judge setup functions
judges_config = {
    # "Gemini 2.5 Flash (Google)": get_gemini_judge, # Tạm thời ẩn theo yêu cầu của user
    "Claude Sonnet 5 (Official API)": get_claude_judge,
    # "GPT-4.1 Mini (GitHub)": get_gpt4_1_mini_github_judge, # Đã chạy xong và lưu file ragas_results_gpt-4.1_mini_github.csv
    # "Qwen 3 (Groq)": get_qwen_groq_judge, # Đã chạy xong và lưu file ragas_results_qwen_3_groq.csv
    # "Llama 3.3 70B (Groq)": get_llama_groq_judge, # Đã chạy xong và lưu file ragas_results_llama_3.3_70b_groq.csv
    # "Zai GLM (Cerebras)": get_zai_glm_cerebras_judge, # Đã chạy xong và lưu file ragas_results_zai_glm_cerebras.csv
    # "Gemma 4 31B (Google AI Studio)": get_gemma_google_judge, # Đã chạy xong và lưu file ragas_results_gemma_4_31b_google_ai_studio.csv
    # "DeepSeek-V4 Pro (Official API)": get_deepseek_official_judge
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
       
        # Define run config to control concurrency and retries to avoid rate limits (429)
        run_config = RunConfig(
            max_workers=1,  # limit concurrency to stay under strict Groq TPM limits
            timeout=480,    # Tăng lên 480 giây (8 phút) cho các model suy luận chậm như Gemma
            max_retries=10
        )

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
            batch_size=1,
            run_config=run_config
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



