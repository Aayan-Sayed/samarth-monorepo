import os
import sys

# Reconfigure stdout to use UTF-8 to prevent charmap encoding errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Ensure backend directory is in path
sys.path.append(os.path.dirname(__file__))

from main import app_graph, rule_based_mapping, rule_based_resolution

def run_test():
    print("=== Testing LangGraph Workflow with 26 Domains ===")
    
    # 1. Test rule-based mapping function directly
    print("\n1. Testing Rule-based Mapping Fallbacks...")
    test_texts = [
        ("My UPI transaction failed and the bank is refusing to refund my money", "Banking & Digital Payments"),
        ("I want to report an online scam and credit card hacking on a phishing site", "Cyber Crime & Fraud"),
        ("There is dirty sewage water leaking from the pipe and overflowing on the street", "Water Supply & Sewerage"),
        ("The road has a huge pothole damaging cars", "Municipal & Civic Issues"),
        ("The train has been delayed for 6 hours and there is no food on board", "Railway Operations")
    ]
    for text, expected in test_texts:
        res = rule_based_mapping(text)
        print(f"Text: '{text}' -> Mapped to: {res['identified_category']} (Expected: {expected})")

    # 2. Test full Graph invoke with Mock Data
    print("\n2. Executing LangGraph Workflow with Mock Input...")
    mock_initial_state = {
        "audio_stream": None,
        "audio_transcript": "There is a digital payment error on my phone and the transaction failed.",
        "uploaded_image": None,
        "image_analysis": "",
        "problem_keywords": [],
        "identified_category": "",
        "target_gov_portals": [],
        "actionable_steps": "",
        "tts_audio_output": None,
        "detected_language_code": "en-IN"
    }
    
    try:
        final_state = app_graph.invoke(mock_initial_state)
        print("\nWorkflow Execution Successful!")
        print(f"Identified Category: {final_state.get('identified_category')}")
        print(f"Keywords: {final_state.get('problem_keywords')}")
        print(f"Target Portals: {final_state.get('target_gov_portals')}")
        print("Actionable Steps preview:")
        steps = final_state.get('actionable_steps', '')
        print("\n".join(steps.split("\n")[:12])) # Print first 12 lines
        print(f"TTS Audio Base64 Length: {len(final_state.get('tts_audio_output', '')) if final_state.get('tts_audio_output') else 0}")
    except Exception as e:
        print(f"Workflow execution failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_test()
