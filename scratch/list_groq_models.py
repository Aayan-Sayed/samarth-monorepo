import os
import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv("../.env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def list_models():
    if not GROQ_API_KEY:
        print("No GROQ_API_KEY found.")
        return
        
    url = "https://api.groq.com/openai/v1/models"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}"
    }
    
    r = httpx.get(url, headers=headers)
    if r.status_code == 200:
        data = r.json()
        models = [m["id"] for m in data.get("data", [])]
        print("Available Groq Models:")
        for m in sorted(models):
            print(f" - {m}")
    else:
        print(f"Error {r.status_code}: {r.text}")

if __name__ == "__main__":
    list_models()
