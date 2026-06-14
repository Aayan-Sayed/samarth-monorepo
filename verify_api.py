import requests
import json

def test_endpoints():
    print("=== Verifying FastAPI Server Endpoints ===")
    
    # 1. Test Health Check
    health_url = "http://127.0.0.1:8000/api/health"
    try:
        r_health = requests.get(health_url)
        print(f"\n1. Health Check status: {r_health.status_code}")
        print(json.dumps(r_health.json(), indent=2))
    except Exception as e:
        print(f"Failed to connect to health endpoint: {e}")
        return

    # 2. Test Complaint Endpoint
    complaint_url = "http://127.0.0.1:8000/api/complaint"
    payload = {
        "audio_stream": None, # base64 mock
        "uploaded_image": None # base64 mock
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        print("\n2. Submitting Mock Complaint Request...")
        r_complaint = requests.post(complaint_url, json=payload, headers=headers, timeout=60.0)
        print(f"Complaint Endpoint status: {r_complaint.status_code}")
        
        response_data = r_complaint.json()
        print("\n=== Success! Response Details ===")
        print(f"Success Status: {response_data.get('success')}")
        print(f"Category Routed: {response_data.get('category')}")
        print(f"Keywords Extracted: {response_data.get('keywords')}")
        print(f"Speech Transcript: {response_data.get('audio_transcript')}")
        print(f"Image Description: {response_data.get('image_analysis')}")
        print(f"Target Portals: {response_data.get('target_gov_portals')}")
        print(f"TTS Audio Output Base64 Length: {len(response_data.get('tts_audio_output', '')) if response_data.get('tts_audio_output') else 0}")
    except Exception as e:
        print(f"Failed to process complaint request: {e}")

if __name__ == "__main__":
    test_endpoints()
