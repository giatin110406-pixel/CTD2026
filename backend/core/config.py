import os
import sys
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

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

# Initialize DeepSeek LLM as Fallback
deepseek_fallback_llm = None
try:
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    if deepseek_key:
        deepseek_fallback_llm = ChatOpenAI(
            model="deepseek-chat",
            openai_api_key=deepseek_key,
            openai_api_base="https://api.deepseek.com",
            temperature=0.3,
            max_retries=3
        )
except Exception as ds_init_err:
    print(f"[Fallback Config] Cannot configure DeepSeek fallback LLM: {ds_init_err}")

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

    def remove_current_key(self):
        """Permanently remove the current failed key from the active pool in memory."""
        if len(self.api_keys) <= 1:
            print(f"[Rotating API Key] [CRITICAL] Key index {self.current_key_index} failed, but it is the last key in the pool. Cannot remove.")
            return False
            
        dead_key = self.api_keys.pop(self.current_key_index)
        masked_key = dead_key[:6] + "..." + dead_key[-4:] if len(dead_key) > 10 else "..."
        print(f"[Rotating API Key] [CRITICAL ALERT] Key index {self.current_key_index} ({masked_key}) failed permanently (403/401/404). REMOVED from the active pool.")
        
        # Adjust index to prevent index out of range
        self.current_key_index = self.current_key_index % len(self.api_keys)
        self.llm = self._create_llm_client()
        return True

    def invoke(self, messages, *args, **kwargs):
        max_attempts = len(self.api_keys)
        response = None
        for attempt in range(max_attempts):
            if not self.api_keys:
                break
            try:
                response = self.llm.invoke(messages, *args, **kwargs)
                break
            except Exception as e:
                err_msg = str(e).lower()
                
                # Identify if error is a permanent key restriction (unauthorized, permission denied, model deprecated)
                is_permanent_failure = any(x in err_msg for x in [
                    "403", "permission_denied", "forbidden",
                    "401", "unauthorized",
                    "404", "not_found", "no longer available"
                ])
                
                # Identify if error is transient (rate limit 429, gateway timeout, etc.)
                is_transient_failure = any(x in err_msg for x in [
                    "429", "resource_exhausted", "rate_limit", "quota",
                    "503", "service_unavailable",
                    "500", "internal_server_error"
                ])
                
                should_rotate = is_permanent_failure or is_transient_failure
                
                if should_rotate and attempt < max_attempts - 1:
                    if is_permanent_failure:
                        print(f"[Rotating API Key] Permanent error detected on key index {self.current_key_index}. Blacklisting key...")
                        self.remove_current_key()
                    else:
                        print(f"[Rotating API Key] Transient error detected on key index {self.current_key_index}. Rotating key...")
                        self.rotate_key()
                else:
                    # Raise the error to handle deepseek fallback outside the loop
                    raise e
                    
        # If all Gemini keys fail, try DeepSeek fallback
        if response is None:
            global deepseek_fallback_llm
            if deepseek_fallback_llm:
                print("[Rotating API Key] [Fallback] All Gemini API keys failed or were blacklisted. Attempting fallback call to DeepSeek...")
                try:
                    response = deepseek_fallback_llm.invoke(messages, *args, **kwargs)
                except Exception as ds_err:
                    print(f"[Rotating API Key] [Fallback] DeepSeek fallback call also failed: {ds_err}")
                    raise ds_err
            else:
                raise RuntimeError("All configured Gemini API keys have been exhausted and no fallback LLM is configured.")

        # Normalize response.content to be a plain string if it is a list of blocks
        if response and hasattr(response, "content") and isinstance(response.content, list):
            text_parts = []
            for block in response.content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
                elif isinstance(block, str):
                    text_parts.append(block)
            response.content = "".join(text_parts)

        return response

    def __getattr__(self, name):
        return getattr(self.llm, name)

llm = RotatingChatGoogleGenerativeAI(model="gemini-3.5-flash", temperature=0.3, max_retries=3)
