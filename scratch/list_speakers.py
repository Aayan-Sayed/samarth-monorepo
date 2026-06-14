import os
import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv("../.env")

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

def list_speakers():
    if not SARVAM_API_KEY:
        print("No SARVAM_API_KEY found.")
        return
        
    # Test a simple GET or check supported speaker models
    # Wait, let's call TTS with a few speakers to see what works
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    
    speakers = ["meera", "shubh", "aditya", "arvind", "neha", "shreya"]
    for spk in speakers:
        payload = {
            "text": "Hello, this is a test.",
            "model": "bulbul:v3",
            "target_language_code": "en-IN",
            "speaker": spk,
            "pace": 1.0
        }
        r = httpx.post(url, json=payload, headers=headers)
        print(f"Speaker: {spk} -> Status: {r.status_code}")
        if r.status_code != 200:
            print(r.text)

if __name__ == "__main__":
    list_speakers()
