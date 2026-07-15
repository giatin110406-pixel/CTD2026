import os
import sys
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# Configure console encoding for Windows
if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Run offline mode for Hugging Face and Transformers
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# Load environment variables from .env
# Resolves .env path relative to this file to handle any working directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)
load_dotenv(override=True)

# Initialize Gemini LLM with Key Rotation Support
class RotatingChatGoogleGenerativeAI:
    def __init__(self, model="gemini-3.5-flash", temperature=0.3, **kwargs):
        self.model = model
        self.temperature = temperature
        self.kwargs = kwargs
        
        # Load keys from environment (comma-separated list)
        keys_str = os.getenv("GEMINI_API_KEYS", "")
        self.api_keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        
        if not self.api_keys:
            single_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if single_key:
                self.api_keys = [single_key]
                
        if not self.api_keys:
            raise ValueError("No Gemini/Google API keys found in the environment variables!")
            
        self.current_key_index = 0
        self.llm = self._create_llm_client()

    def _create_llm_client(self):
        current_key = self.api_keys[self.current_key_index]
        masked_key = current_key[:6] + "..." + current_key[-4:] if len(current_key) > 10 else "..."
        print(f"[Rotating API Key] Initializing ChatGoogleGenerativeAI with key index {self.current_key_index} ({masked_key})")
        return ChatGoogleGenerativeAI(
            model=self.model,
            temperature=self.temperature,
            google_api_key=current_key,
            **self.kwargs
        )

    def rotate_key(self):
        if len(self.api_keys) <= 1:
            print("[Rotating API Key] Only one API key is configured. Cannot rotate key.")
            return False
            
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
        self.llm = self._create_llm_client()
        return True

    def invoke(self, messages, *args, **kwargs):
        max_attempts = len(self.api_keys)
        for attempt in range(max_attempts):
            try:
                return self.llm.invoke(messages, *args, **kwargs)
            except Exception as e:
                err_msg = str(e).lower()
                # Check for rate limit, billing/permission blocks (403), unauthorized keys (401), unsupported models (404), or transient server errors
                should_rotate = any(x in err_msg for x in [
                    "429", "resource_exhausted", "rate_limit", "quota",
                    "403", "permission_denied", "forbidden",
                    "401", "unauthorized",
                    "404", "not_found", "no longer available",
                    "503", "service_unavailable",
                    "500", "internal_server_error"
                ])
                
                if should_rotate and attempt < max_attempts - 1:
                    print(f"[Rotating API Key] Key index {self.current_key_index} failed. Rotating to next key...")
                    rotated = self.rotate_key()
                    if not rotated:
                        raise e
                else:
                    raise e
        raise RuntimeError("All configured API keys have been exhausted due to rate limits.")

    def __getattr__(self, name):
        return getattr(self.llm, name)

llm = RotatingChatGoogleGenerativeAI(model="gemini-3.5-flash", temperature=0.3, max_retries=3)
