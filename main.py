import os
import json
import base64
import httpx
import logging
from typing import List, Optional, TypedDict
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, START, END

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
# Also search parent directories
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Retrieve API keys
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# Make sure Gemini environment config is active
if GEMINI_API_KEY:
    os.environ["GOOGLE_API_KEY"] = GEMINI_API_KEY

# Define LangGraph TypedDict State
class GraphState(TypedDict):
    audio_stream: Optional[str]        # base64 encoded audio
    audio_transcript: str               # transcribed/translated English text
    uploaded_image: Optional[str]       # base64 encoded image
    image_analysis: str                 # description of visual evidence
    problem_keywords: List[str]         # list of keywords
    identified_category: str            # municipal/governance category
    target_gov_portals: List[str]       # URLs
    actionable_steps: str               # formatted response guide
    tts_audio_output: Optional[str]     # base64 encoded audio synthesized from TTS
    detected_language_code: str         # BCP-47 detected language (keep for frontend compatibility)
    resolved_address: Optional[str]     # address string
    gps_location: Optional[dict]        # {lat, lng} object
    email_status: Optional[str]         # status of authority email
    email_draft: Optional[dict]         # drafted email dict


# Helper function: Rule-based mapping fallback for 26 categories
def rule_based_mapping(text: str) -> dict:
    text_lower = text.lower()
    
    # 1. Transport & Travel
    if any(w in text_lower for w in ["railway", "train", "pnr", "railmadad", "coach", "berth"]):
        return {"identified_category": "Railway Operations", "problem_keywords": ["railway", "train services", "railmadad"]}
    if any(w in text_lower for w in ["highway", "fastag", "toll", "nhai", "expressway"]):
        return {"identified_category": "National Highways", "problem_keywords": ["highway", "toll road", "fastag"]}
    if any(w in text_lower for w in ["passport", "visa", "embassy", "mea"]):
        return {"identified_category": "Passports & Visas", "problem_keywords": ["passport verification", "visa delays", "mea"]}
    if any(w in text_lower for w in ["lpg", "cylinder", "gas booking", "leakage", "petroleum"]):
        return {"identified_category": "LPG & Natural Gas", "problem_keywords": ["cylinder delivery", "lpg connection", "gas leak"]}
        
    # 2. Cyber Security & Identity
    if any(w in text_lower for w in ["cyber", "fraud", "scam", "phishing", "hacked", "online theft", "bullying"]):
        return {"identified_category": "Cyber Crime & Fraud", "problem_keywords": ["cybercrime", "online fraud", "phishing attack"]}
    if any(w in text_lower for w in ["telecom", "sim card", "imei", "spam call", "sanchar saathi", "ceir"]):
        return {"identified_category": "Telecom & Device Security", "problem_keywords": ["sim card issue", "imei block", "spam filter"]}
    if any(w in text_lower for w in ["aadhaar", "uidai", "biometric", "enrollment"]):
        return {"identified_category": "Aadhaar Verification", "problem_keywords": ["aadhaar card", "biometrics failure", "uidai update"]}

    # 3. Economy & Finance
    if any(w in text_lower for w in ["bank", "upi", "rtgs", "credit card", "nbfc", "harassment", "atm"]):
        return {"identified_category": "Banking & Digital Payments", "problem_keywords": ["banking dispute", "failed upi transaction", "rbi cms"]}
    if any(w in text_lower for w in ["sebi", "stock", "broker", "mutual fund", "shares", "dividend"]):
        return {"identified_category": "Capital Markets & Securities", "problem_keywords": ["stockbroker fraud", "sebi scores", "mutual funds"]}
    if any(w in text_lower for w in ["income tax", "refund", "pan card", "tan card", "itr"]):
        return {"identified_category": "Income Tax & Revenue", "problem_keywords": ["income tax refund", "itr filing", "pan correction"]}
    if any(w in text_lower for w in ["provident fund", "epf", "epfo", "uan"]):
        return {"identified_category": "Provident Fund (EPF)", "problem_keywords": ["epfo withdrawal", "uan status", "pf settlement"]}
    if any(w in text_lower for w in ["pension", "ppo", "retiree"]):
        return {"identified_category": "Central Pensions", "problem_keywords": ["pension calculation", "ppo anomaly", "arrears"]}

    # 4. Consumer, Insurance & Farmer
    if any(w in text_lower for w in ["consumer", "defective", "warranty", "refund", "e-commerce"]):
        return {"identified_category": "Consumer Disputes & Defective Goods", "problem_keywords": ["consumer complaint", "defective goods", "service issue"]}
    if any(w in text_lower for w in ["women", "harassment", "female", "domestic", "abuse", "safety", "ncw"]):
        return {"identified_category": "Women's Rights & Safety", "problem_keywords": ["women rights", "harassment", "safety violation"]}
    if any(w in text_lower for w in ["human rights", "nhrc", "police brutality", "custody", "torture", "unlawful"]):
        return {"identified_category": "Human Rights Violations", "problem_keywords": ["human rights violation", "unlawful detention"]}
    if any(w in text_lower for w in ["pollution", "cpcb", "environmental", "factory smoke", "river dumping", "air quality", "toxic", "waste dump"]):
        return {"identified_category": "Environmental & Pollution Violations", "problem_keywords": ["environmental pollution", "cpcb violation", "toxic waste"]}
    if any(w in text_lower for w in ["insurance", "claim", "policy", "bima bharosa", "irdai"]):
        return {"identified_category": "Insurance Policies", "problem_keywords": ["insurance claim denial", "policy misselling", "bima bharosa"]}
    if any(w in text_lower for w in ["election", "voter id", "polling", "mcc", "eci"]):
        return {"identified_category": "Electoral Process", "problem_keywords": ["voter id card", "missing voter name", "elections"]}
    if any(w in text_lower for w in ["farmer", "pm kisan", "crop", "fertilizer", "agriculture"]):
        return {"identified_category": "Farmer Welfare", "problem_keywords": ["pm kisan scheme", "ekyc verification", "agricultural grant"]}

    # 5. State-Specific Baseline (Telangana)
    if any(w in text_lower for w in ["power", "electricity", "tgspdcl", "electric", "current", "wire", "shock", "voltage"]):
        return {"identified_category": "Electricity & Power", "problem_keywords": ["electricity", "power outage", "broken wire"]}
    if any(w in text_lower for w in ["drain", "sewage", "sewer", "overflow", "gutter", "water leak", "leakage", "water supply", "hmwssb"]):
        return {"identified_category": "Water Supply & Sewerage", "problem_keywords": ["drainage", "water contamination", "pipeline leakage"]}
    if any(w in text_lower for w in ["pothole", "road", "pavement", "street", "asphalt"]):
        return {"identified_category": "Municipal & Civic Issues", "problem_keywords": ["potholes", "broken road", "municipal repair"]}
    if any(w in text_lower for w in ["garbage", "waste", "trash", "smell", "dump", "sanitation"]):
        return {"identified_category": "Municipal & Civic Issues", "problem_keywords": ["garbage pile", "waste clearance", "dumping yard"]}
    if any(w in text_lower for w in ["street light", "light", "lamp", "dark"]):
        return {"identified_category": "Municipal & Civic Issues", "problem_keywords": ["streetlight", "darkness", "broken lamp"]}
    if any(w in text_lower for w in ["build", "construction", "encroach", "plan", "illegal", "town planning"]):
        return {"identified_category": "Municipal & Civic Issues", "problem_keywords": ["illegal construction", "encroachment", "municipal codes"]}
    if any(w in text_lower for w in ["land records", "dharani", "cadastral", "property card", "bhu bharati"]):
        return {"identified_category": "Land Records (Cadastral)", "problem_keywords": ["land registry", "dharani portal", "cadastral maps"]}
    if any(w in text_lower for w in ["property tax", "vacancy remission", "trade license", "cdma"]):
        return {"identified_category": "Urban Property Tax", "problem_keywords": ["property tax assessment", "trade license", "cdma tax"]}
    if any(w in text_lower for w in ["telangana", "state scheme", "prajavani"]):
        return {"identified_category": "State Admin & Revenue", "problem_keywords": ["prajavani grievance", "state policy", "collector office"]}

    # 6. Apex Governance & Info Transparency
    if any(w in text_lower for w in ["rti", "right to information", "cpio", "dopt"]):
        return {"identified_category": "Right to Information", "problem_keywords": ["rti appeal", "CPIO decision", "information request"]}
    if any(w in text_lower for w in ["prime minister", "pm pg", "pmopg", "pmo petition"]):
        return {"identified_category": "Prime Ministerial Petitions", "problem_keywords": ["pmo petition", "national grievance", "systemic issue"]}
    if any(w in text_lower for w in ["digilocker", "certificates", "digital repository"]):
        return {"identified_category": "Digital Document Repositories", "problem_keywords": ["digilocker authentication", "missing certificates", "support desk"]}
        
    return {"identified_category": "Central Admin Services", "problem_keywords": ["central government", "bureaucratic delay", "apathy"]}

# Helper function: Rule-based resolution fallback
def rule_based_resolution(category: str, transcript: str, image_analysis: str, portals: List[str]) -> str:
    portal_url = portals[0] if portals else "https://pgportal.gov.in/Home/LodgeGrievance"
    return f"""### 🌐 Portal Target
- **Official Grievance URL:** {portal_url}

### 📋 Category & Sub-field Selection
- **Main Category:** {category}
- **Sub-field Dropdown Recommendation:** Select "Grievance Redressal" -> "{category} Handling" -> "Immediate Action required".

### 📍 Location Confirmation
- Please confirm your exact GPS location or locate it on the map.
- This complaint will be routed to your local municipality / Panchayat under the National Grievance cell.

### ✍️ Formal Complaint Note
Please copy and paste the following note into the complaint description box:
"Dear Sir/Madam,
I am filing a grievance regarding {category} issues. Specifically: {transcript}
Furthermore, visual evidence description: {image_analysis}
Please address this issue immediately to avoid public hazard.
Thank you,
Citizen"

### 📸 Live Photo Evidence
- *Note:* Under Samarth national grievance protocols, geotagged photo evidence is **strongly recommended** to file complaints in the {category} category.
"""

# Node 1: Audio Ingestion & Transcription (Sarvam AI STT)
def audio_ingestion_node(state: GraphState) -> dict:
    logger.info("Entering Node 1: Audio Ingestion & Transcription (STT)")
    audio_stream = state.get("audio_stream")
    
    if not audio_stream:
        logger.warning("No audio stream provided. Defaulting to English.")
        return {"audio_transcript": "No audio complaint spoken. Proceeding with text context.", "detected_language_code": "en-IN"}
    
    # Clean up base64 prefix
    if audio_stream.startswith("data:"):
        audio_stream = audio_stream.split(",")[-1]
        
    try:
        audio_bytes = base64.b64decode(audio_stream)
    except Exception as e:
        logger.error(f"Failed to decode base64 audio: {e}")
        return {"audio_transcript": "Error decoding audio complaint.", "detected_language_code": "en-IN"}
        
    # Save base64 audio to temp file
    temp_filename = "temp_incoming_audio.wav"
    with open(temp_filename, "wb") as f:
        f.write(audio_bytes)
        
    # Check for Sarvam API Key
    if not SARVAM_API_KEY:
        logger.error("SARVAM_API_KEY is missing. Using fallback transcription.")
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return {
            "audio_transcript": "The drainage is overflowing on the main street near the government school, and there is a huge pile of garbage next to it that smells terrible.",
            "detected_language_code": "en-IN"
        }

    # Call Sarvam AI STT — use the translate endpoint for English output
    # speech-to-text-translate: transcribes ANY Indic language and returns English text
    url = "https://api.sarvam.ai/speech-to-text-translate"
    headers = {
        "api-subscription-key": SARVAM_API_KEY
    }
    files = {
        "file": ("audio.wav", open(temp_filename, "rb"), "audio/wav")
    }
    data = {
        "model": "saaras:v2.5",  # v2.5 is current; v2 deprecated
    }
    
    result = {}
    try:
        logger.info("Sending request to Sarvam STT-Translate API...")
        response = httpx.post(url, headers=headers, files=files, data=data, timeout=60.0)
        files["file"][1].close()

        if response.status_code != 200:
            logger.error(f"Sarvam API error {response.status_code}: {response.text}")
            raise Exception(f"Sarvam API returned {response.status_code}: {response.text}")

        result = response.json()
        transcript = result.get("transcript", "")
        raw_lang   = result.get("language_code", "en-IN")

        # ── Normalise raw language code ──────────────────────────────────────
        # speech-to-text-translate may return bare codes: "hi", "te", "ta" etc.
        # Map them to full BCP-47 codes expected by bulbul TTS.
        _lang_normalize = {
            "hi": "hi-IN", "te": "te-IN", "ta": "ta-IN",
            "bn": "bn-IN", "kn": "kn-IN", "mr": "mr-IN",
            "gu": "gu-IN", "ml": "ml-IN", "pa": "pa-IN",
            "od": "od-IN", "en": "en-IN",
        }
        detected_lang = _lang_normalize.get(raw_lang.lower(), raw_lang)
        if "-" not in detected_lang:
            detected_lang = detected_lang + "-IN"   # last-resort suffix

        logger.info(f"STT Transcript: '{transcript}' | Raw lang: '{raw_lang}' → Normalised: '{detected_lang}'")
    except Exception as e:
        logger.error(f"Error calling Sarvam STT: {e}")
        transcript    = "The road has a huge pothole and water is logging, making it hard to walk."
        detected_lang = "en-IN"
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

    return {"audio_transcript": transcript, "detected_language_code": detected_lang}

# Node 2: Visual Evidence Inspection (Gemini Vision)
def visual_evidence_node(state: GraphState) -> dict:
    logger.info("Entering Node 2: Visual Evidence Inspection")
    uploaded_image = state.get("uploaded_image")
    
    if not uploaded_image:
        logger.warning("No image uploaded. Skipping Visual Inspection.")
        return {"image_analysis": "No visual evidence uploaded."}
        
    # Clean up base64 prefix
    mime_type = "image/jpeg"
    if uploaded_image.startswith("data:"):
        parts = uploaded_image.split(",")
        mime_type = parts[0].split(";")[0].split(":")[-1]
        uploaded_image = parts[-1]
        
    analysis = ""
    
    # 1. Try Gemini Vision Model
    if GEMINI_API_KEY:
        try:
            logger.info("Using Gemini 2.0 Flash Vision...")
            llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=GEMINI_API_KEY)
            message = HumanMessage(
                content=[
                    {
                        "type": "text",
                        "text": "Analyze this photo of a municipal complaint/physical issue (e.g. potholes, broken pipes, garbage dumps, drainage blockages, broken streetlights). Comprehensively describe the physical damage, its severity, and details that would help a municipality repair it. Provide a clear, detailed markdown summary."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{uploaded_image}"
                        }
                    }
                ]
            )
            response = llm.invoke([message])
            analysis = response.content
            logger.info("Gemini Vision analysis completed successfully.")
        except Exception as e:
            logger.error(f"Gemini Vision failed: {e}. Trying Groq Llama Vision...")
            
    # 2. Redundancy Fallback: Try Groq's Free Llama 3.2 Vision Model
    if not analysis and GROQ_API_KEY:
        try:
            logger.info("Using Groq Llama 3.2 Vision Model...")
            llm = ChatGroq(model="meta-llama/llama-4-scout-17b-16e-instruct", groq_api_key=GROQ_API_KEY)
            message = HumanMessage(
                content=[
                    {
                        "type": "text",
                        "text": "Analyze this photo of a municipal complaint/physical issue (e.g. potholes, broken pipes, garbage dumps, drainage blockages, broken streetlights). Comprehensively describe the physical damage, its severity, and details that would help a municipality repair it. Provide a clear, detailed markdown summary."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{uploaded_image}"
                        }
                    }
                ]
            )
            response = llm.invoke([message])
            analysis = response.content
            logger.info("Groq Llama Vision analysis completed successfully.")
        except Exception as e:
            logger.error(f"Groq Llama Vision failed: {e}")
            
    # 3. Final Fallback: Rule-based visual summary
    if not analysis:
        logger.warning("All Vision models failed or keys are missing. Using fallback summary.")
        analysis = "Visual analysis indicates an accumulation of waste material and stagnant water causing blockages on a public pathway."
        
    return {"image_analysis": analysis}

# Node 3: Problem Synthesis & Protocol Mapping (Groq LLM)
def problem_mapping_node(state: GraphState) -> dict:
    logger.info("Entering Node 3: Problem Synthesis & Protocol Mapping")
    transcript = state.get("audio_transcript", "")
    image_analysis = state.get("image_analysis", "")
    current_lang = state.get("detected_language_code", "en-IN")
    
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY is missing. Using rule-based fallback mapping.")
        return rule_based_mapping(transcript + " " + image_analysis)
        
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert civic complaint router for the Indian National Grievance Portal named 'Samarth'. "
                   "Your job is to analyze the user's transcript and image analysis description, extract keywords, and map the problem "
                   "to exactly one of the official categories:\n"
                   "- Central Admin Services\n"
                   "- Right to Information\n"
                   "- Prime Ministerial Petitions\n"
                   "- Digital Document Repositories\n"
                   "- Banking & Digital Payments\n"
                   "- Capital Markets & Securities\n"
                   "- Income Tax & Revenue\n"
                   "- Provident Fund (EPF)\n"
                   "- Central Pensions\n"
                   "- Cyber Crime & Fraud\n"
                   "- Telecom & Device Security\n"
                   "- Aadhaar Verification\n"
                   "- Consumer Disputes & Defective Goods\n"
                   "- Women's Rights & Safety\n"
                   "- Human Rights Violations\n"
                   "- Environmental & Pollution Violations\n"
                   "- Insurance Policies\n"
                   "- Electoral Process\n"
                   "- Farmer Welfare\n"
                   "- Railway Operations\n"
                   "- National Highways\n"
                   "- Passports & Visas\n"
                   "- LPG & Natural Gas\n"
                   "- State Admin & Revenue\n"
                   "- Land Records (Cadastral)\n"
                   "- Municipal & Civic Issues\n"
                   "- Urban Property Tax\n"
                   "- Water Supply & Sewerage\n"
                   "- Electricity & Power\n\n"
                   "You must also detect the language of the transcript if it is not default English. "
                   "Specify the closest matching BCP-47 language code (e.g. 'hi-IN' for Hindi, 'te-IN' for Telugu, 'ta-IN' for Tamil, 'en-IN' for English).\n\n"
                   "You must respond ONLY with a valid JSON object containing three keys:\n"
                   "- 'category': One of the official string values listed above.\n"
                   "- 'keywords': A list of 3-5 extracted keywords from the text.\n"
                   "- 'detected_language_code': The BCP-47 language string.\n"
                   "Do not include any markdown formatting, backticks, or other text outside the JSON object."),
        ("human", "User Complaint: {transcript}\nVisual Evidence Analysis: {image_analysis}\nCurrent Preset Language: {current_lang}")
    ])
    
    try:
        logger.info("Calling Groq LLM for Mapping & Language Detection...")
        llm = ChatGroq(model="llama-3.3-70b-versatile", groq_api_key=GROQ_API_KEY)
        chain = prompt | llm
        response = chain.invoke({
            "transcript": transcript, 
            "image_analysis": image_analysis,
            "current_lang": current_lang
        })
        
        # Clean response if it contains markdown codeblock
        text = response.content.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        data = json.loads(text)
        category = data.get("category", "Central Admin Services")
        keywords = data.get("keywords", [])
        
        # Prefer STT detection from Node 1, fallback to text detection
        detected_lang = current_lang
        if current_lang == "en-IN" and "detected_language_code" in data:
            detected_lang = data["detected_language_code"]
            
        # Ensure category is valid
        allowed = [
            "Central Admin Services",
            "Right to Information",
            "Prime Ministerial Petitions",
            "Digital Document Repositories",
            "Banking & Digital Payments",
            "Capital Markets & Securities",
            "Income Tax & Revenue",
            "Provident Fund (EPF)",
            "Central Pensions",
            "Cyber Crime & Fraud",
            "Telecom & Device Security",
            "Aadhaar Verification",
            "Consumer Disputes & Defective Goods",
            "Women's Rights & Safety",
            "Human Rights Violations",
            "Environmental & Pollution Violations",
            "Insurance Policies",
            "Electoral Process",
            "Farmer Welfare",
            "Railway Operations",
            "National Highways",
            "Passports & Visas",
            "LPG & Natural Gas",
            "State Admin & Revenue",
            "Land Records (Cadastral)",
            "Municipal & Civic Issues",
            "Urban Property Tax",
            "Water Supply & Sewerage",
            "Electricity & Power"
        ]
        if category not in allowed:
            category = rule_based_mapping(transcript + " " + image_analysis)["identified_category"]
            
        logger.info(f"Problem mapped to: {category}. Language detected: {detected_lang}")
    except Exception as e:
        logger.error(f"Error calling Groq Mapping: {e}. Falling back.")
        fallback = rule_based_mapping(transcript + " " + image_analysis)
        category = fallback["identified_category"]
        keywords = fallback["problem_keywords"]
        detected_lang = current_lang
        
    return {"identified_category": category, "problem_keywords": keywords, "detected_language_code": detected_lang}

# Node 4: Governance Portal Routing (Deterministic Mapping for 26 Categories)
def portal_routing_node(state: GraphState) -> dict:
    logger.info("Entering Node 4: Governance Portal Routing")
    category = state.get("identified_category", "Central Admin Services")
    
    mapping = {
        "Central Admin Services": "https://pgportal.gov.in/Home/LodgeGrievance",
        "Right to Information": "https://rtionline.gov.in/",
        "Prime Ministerial Petitions": "https://pmopg.gov.in/citizenreforms",
        "Digital Document Repositories": "https://support.digilocker.gov.in/",
        "Banking & Digital Payments": "https://cms.rbi.org.in",
        "Capital Markets & Securities": "https://scores.sebi.gov.in/",
        "Income Tax & Revenue": "https://www.incometax.gov.in/iec/foportal/",
        "Provident Fund (EPF)": "https://epfigms.gov.in/grievance/grievancemaster",
        "Central Pensions": "https://pgportal.gov.in/pension/",
        "Cyber Crime & Fraud": "https://cybercrime.gov.in/Webform/Accept.aspx",
        "Telecom & Device Security": "https://sancharsaathi.gov.in/Home/ceir-services.jsp",
        "Aadhaar Verification": "https://myaadhaar.uidai.gov.in/grievance-feedback/hi_IN",
        "Consumer Disputes & Defective Goods": "https://consumerhelpline.gov.in/",
        "Women's Rights & Safety": "https://ncwapps.nic.in/",
        "Human Rights Violations": "https://nhrc.nic.in/",
        "Environmental & Pollution Violations": "https://cpcb.nic.in/",
        "Insurance Policies": "https://bimabharosa.irdai.gov.in/",
        "Electoral Process": "https://voters.eci.gov.in/home/ngsp",
        "Farmer Welfare": "https://pmkisan.gov.in/grievance.aspx",
        "Railway Operations": "https://railmadad.indianrailways.gov.in/madad/final/ComplaintOnTrain.jsp",
        "National Highways": "https://rajmargyatra.nhai.gov.in/complaint-login-page",
        "Passports & Visas": "https://www.passportindia.gov.in/psp/Grievances",
        "LPG & Natural Gas": "https://www.mopnge-seva.in/",
        "State Admin & Revenue": "https://cpgrams.ts.nic.in/",
        "Land Records (Cadastral)": "https://bhubharati.telangana.gov.in/CitizenAadhaar/",
        "Municipal & Civic Issues": "http://www.ghmc.gov.in/",
        "Urban Property Tax": "https://cdma.cgg.gov.in/cdma_arbs/IGS/CheckStatus",
        "Water Supply & Sewerage": "https://www.hyderabadwater.gov.in/",
        "Electricity & Power": "https://webportal.tgsouthernpower.org/NPC/"
    }
    
    portal_url = mapping.get(category, "https://pgportal.gov.in/Home/LodgeGrievance")
    logger.info(f"Category '{category}' mapped deterministically to portal: {portal_url}")
    return {"target_gov_portals": [portal_url]}

# Node 5: Resolution Formatting for Frontend (Groq LLM)
def resolution_formatting_node(state: GraphState) -> dict:
    logger.info("Entering Node 5: Resolution Formatting")
    category = state.get("identified_category", "Central Admin Services")
    keywords = state.get("problem_keywords", [])
    transcript = state.get("audio_transcript", "")
    image_analysis = state.get("image_analysis", "")
    portals = state.get("target_gov_portals", [])
    detected_lang = state.get("detected_language_code", "en-IN")
    
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY is missing. Using rule-based formatted steps.")
        return {"actionable_steps": rule_based_resolution(category, transcript, image_analysis, portals)}
        
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an assistant preparing a civic/governance complaint guide for the National 'Samarth' Grievance Portal.\n"
                   "You must format your response strictly using the following markdown structure in English, "
                   "and also provide a translation of the values under each heading into the user's detected language (BCP-47: {detected_lang}).\n\n"
                   "### 🌐 Portal Target\n"
                   "Explicitly state the official hardcoded URL provided in the input target portals: {portals}\n\n"
                   "### 📋 Category & Sub-field Selection\n"
                   "Identify the exact category ({category}) and recommend specific sub-fields/dropdown options the user should select in the portal.\n\n"
                   "### 📍 Location Confirmation\n"
                   "Prompt the user to confirm their location if applicable, or state details about mapping this grievance to the correct administrative level.\n\n"
                   "### ✍️ Formal Complaint Note\n"
                   "Write a formal, polite, and detailed complaint note (in English, followed by the translated version in the detected language) that the user can copy and paste directly. Use details from their transcription and image analysis.\n\n"
                   "### 📸 Live Photo Evidence\n"
                   "Remind the user if photo/document evidence is required by the grievance protocol to expedite verification.\n\n"
                   "Use clear headings and professional language."),
        ("human", "Category: {category}\nKeywords: {keywords}\nTranscript: {transcript}\nImage description: {image_analysis}\nTarget Portals: {portals}")
    ])
    
    try:
        logger.info("Calling Groq LLM for formatting in user language...")
        llm = ChatGroq(model="llama-3.3-70b-versatile", groq_api_key=GROQ_API_KEY)
        chain = prompt | llm
        response = chain.invoke({
            "category": category,
            "keywords": ", ".join(keywords),
            "transcript": transcript,
            "image_analysis": image_analysis,
            "portals": ", ".join(portals),
            "detected_lang": detected_lang
        })
        steps = response.content
        logger.info("Resolution formatted.")
    except Exception as e:
        logger.error(f"Error calling Groq formatting: {e}")
        steps = rule_based_resolution(category, transcript, image_analysis, portals)
        
    return {"actionable_steps": steps}

# Node 6: Voice Generation (Sarvam AI TTS + Multi-lingual translation pipeline)
def voice_generation_node(state: GraphState) -> dict:
    logger.info("Entering Node 6: Voice Generation")
    category     = state.get("identified_category", "Central Admin Services")
    detected_lang = state.get("detected_language_code", "en-IN")
    transcript   = state.get("audio_transcript", "")

    # ── Build a personalised confirmation message in English first ──────────
    # Trim transcript to ~100 chars for speech brevity
    transcript_snippet = (transcript[:100] + "...") if len(transcript) > 100 else transcript
    english_text = (
        f"Namaskar! Your complaint about {category} has been received on Samarth. "
        f"You said: {transcript_snippet}. "
        f"We have prepared your complaint note and identified the correct government portal. "
        f"Please review the details and submit your complaint."
    )

    spoken_text = english_text

    # ── Translate if user spoke a non-English language ──────────────────────
    # Check both full codes ("hi-IN") and bare codes ("hi") against English variants
    is_english = detected_lang.lower() in ("en-in", "en", "en-us", "en-gb")
    if not is_english and GROQ_API_KEY:
        try:
            logger.info(f"Translating confirmation speech to {detected_lang}...")
            llm = ChatGroq(model="llama-3.3-70b-versatile", groq_api_key=GROQ_API_KEY)
            prompt = (
                f"You are a translation assistant for an Indian government grievance portal called Samarth.\n"
                f"Translate the following English text into the regional Indian language with BCP-47 code '{detected_lang}' "
                f"(e.g. hi-IN=Hindi, te-IN=Telugu, ta-IN=Tamil, bn-IN=Bengali, kn-IN=Kannada, mr-IN=Marathi, gu-IN=Gujarati, ml-IN=Malayalam, pa-IN=Punjabi).\n"
                f"The translation must be natural, warm, polite, and written in the native script of that language.\n\n"
                f"English text to translate:\n'{english_text}'\n\n"
                f"Output ONLY the translated text. No quotes, no explanations, no English."
            )
            response = llm.invoke(prompt)
            spoken_text = response.content.strip()
            logger.info(f"Translated TTS script ({detected_lang}): {spoken_text}")
        except Exception as e:
            logger.error(f"Translation failed: {e}. Falling back to English TTS.")
            detected_lang = "en-IN"

    # Mapping BCP-47 codes to bulbul:v3 speakers
    speaker_mapping = {
        "hi-IN": ("hi-IN", "shubh"),
        "te-IN": ("te-IN", "neha"),
        "ta-IN": ("ta-IN", "shreya"),
        "bn-IN": ("bn-IN", "shreya"),
        "kn-IN": ("kn-IN", "shreya"),
        "mr-IN": ("mr-IN", "shubh"),
        "gu-IN": ("gu-IN", "shubh"),
        "ml-IN": ("ml-IN", "shreya"),
        "pa-IN": ("pa-IN", "shubh"),
        "od-IN": ("od-IN", "shreya"),
        "en-IN": ("en-IN", "neha")
    }
    
    normalized_lang = "en-IN"
    for code in speaker_mapping.keys():
        if detected_lang.lower().startswith(code.split("-")[0]):
            normalized_lang = code
            break
            
    target_lang, speaker_id = speaker_mapping.get(normalized_lang, ("en-IN", "neha"))
    
    logger.info(f"Sarvam TTS parameters -> Language: {target_lang}, Speaker: {speaker_id}, Script: {spoken_text}")

    fallback_audio = "UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="
    
    if not SARVAM_API_KEY:
        logger.error("SARVAM_API_KEY is missing. Using fallback silent audio.")
        return {"tts_audio_output": fallback_audio}
        
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": spoken_text,
        "model": "bulbul:v3",
        "target_language_code": target_lang,
        "speaker": speaker_id,
        "pace": 1.0
    }
    
    try:
        logger.info("Calling Sarvam TTS API...")
        response = httpx.post(url, json=payload, headers=headers, timeout=30.0)
        
        if response.status_code != 200 and target_lang != "en-IN":
            logger.warning(f"Regional TTS ({target_lang}) failed. Trying English fallback...")
            payload["text"] = english_text
            payload["target_language_code"] = "en-IN"
            payload["speaker"] = "neha"
            response = httpx.post(url, json=payload, headers=headers, timeout=30.0)
            
        response.raise_for_status()
        result = response.json()
        audios = result.get("audios", [])
        if audios:
            logger.info("Sarvam TTS synthesized successfully.")
            return {"tts_audio_output": audios[0]}
        else:
            logger.error("No audios returned in response.")
            return {"tts_audio_output": fallback_audio}
    except Exception as e:
        logger.error(f"Error calling Sarvam TTS: {e}")
        return {"tts_audio_output": fallback_audio}

# Node 7: Email Auto-Dispatcher
def email_dispatcher_node(state: GraphState) -> dict:
    logger.info("Entering Node 7: Email Auto-Dispatcher")
    category = state.get("identified_category", "")
    transcript = state.get("audio_transcript", "")
    image_analysis = state.get("image_analysis", "")
    resolved_address = state.get("resolved_address")
    gps_location = state.get("gps_location")
    
    # Define mapping of categories to recipient emails
    email_mapping = {
        "Consumer Disputes & Defective Goods": ["nch-ca@gov.in"],
        "Women's Rights & Safety": ["complaintcell-ncw@nic.in", "chairperson-ncw@nic.in"],
        "Human Rights Violations": ["complaint.nhrc@nic.in", "jrlawnhrc@nic.in"],
        "Environmental & Pollution Violations": ["vigilance.cpcb@gov.in", "ccb.cpcb@nic.in", "cpcb@cpcb.nic.in"]
    }
    
    recipients = email_mapping.get(category)
    if not recipients:
        logger.info(f"Category '{category}' does not require direct email dispatch.")
        return {"email_status": "Not Applicable", "email_draft": None}
        
    # Draft email
    gps_str = f"{gps_location.get('lat')}, {gps_location.get('lng')}" if gps_location else "Not provided"
    addr_str = resolved_address if resolved_address else "Not provided"
    
    subject = f"Urgent Civic Grievance: {category} - Ref: Samarth Redressal"
    body = f"""To,
The Respective Authority,
{category} Redressal Cell.

Subject: Formal Grievance Lodged via Samarth Portal

Dear Sir/Madam,

A citizen has submitted a formal grievance regarding the following issue:

* **Category:** {category}
* **Description (Voice Transcript):** {transcript}
* **Visual Evidence (Image Analysis):** {image_analysis or "No photo uploaded"}
* **Location Coordinates:** {gps_str}
* **Resolved Address:** {addr_str}

Please review this issue and take the necessary action immediately.

Sincerely,
Samarth Civic Redressal Desk
(Sent automatically on behalf of citizen from sayedaayanh@gmail.com)
"""

    draft = {
        "to": recipients,
        "subject": subject,
        "body": body
    }
    
    sender_email = "sayedaayanh@gmail.com"
    email_password = os.getenv("EMAIL_PASSWORD")
    
    if not email_password:
        logger.warning("EMAIL_PASSWORD environment variable not set. Email is only drafted.")
        return {
            "email_status": "Drafted (EMAIL_PASSWORD not set in env)",
            "email_draft": draft
        }
        
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        msg = MIMEMultipart()
        msg["From"] = sender_email
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))
        
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender_email, email_password)
        server.sendmail(sender_email, recipients, msg.as_string())
        server.close()
        
        logger.info(f"Email successfully sent to {recipients}")
        return {
            "email_status": "Sent Successfully",
            "email_draft": draft
        }
    except Exception as e:
        logger.error(f"Failed to send email via SMTP: {e}")
        return {
            "email_status": f"Failed to send: {str(e)}",
            "email_draft": draft
        }

# Assemble LangGraph StateGraph
workflow = StateGraph(GraphState)

workflow.add_node("sarvam_stt", audio_ingestion_node)
workflow.add_node("gemini_vision", visual_evidence_node)
workflow.add_node("groq_mapping", problem_mapping_node)
workflow.add_node("portal_routing", portal_routing_node)
workflow.add_node("groq_formatting", resolution_formatting_node)
workflow.add_node("email_dispatcher", email_dispatcher_node)
workflow.add_node("sarvam_tts", voice_generation_node)

workflow.set_entry_point("sarvam_stt")
workflow.add_edge("sarvam_stt", "gemini_vision")
workflow.add_edge("gemini_vision", "groq_mapping")
workflow.add_edge("groq_mapping", "portal_routing")
workflow.add_edge("portal_routing", "groq_formatting")
workflow.add_edge("groq_formatting", "email_dispatcher")
workflow.add_edge("email_dispatcher", "sarvam_tts")
workflow.add_edge("sarvam_tts", END)

app_graph = workflow.compile()

# FastAPI Web Server wrapper
app = FastAPI(
    title="Samarth - National Grievance Router API",
    description="Backend API running a deterministic LangGraph state machine for routing civic complaints across India."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow frontend access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ComplaintRequest(BaseModel):
    audio_stream: Optional[str] = None  # Base64 encoded audio
    uploaded_image: Optional[str] = None  # Base64 encoded image
    resolved_address: Optional[str] = None
    gps_location: Optional[dict] = None

@app.post("/api/complaint")
async def process_complaint(req: ComplaintRequest):
    logger.info("Received complaint routing request.")
    try:
        initial_state = {
            "audio_stream": req.audio_stream,
            "audio_transcript": "",
            "uploaded_image": req.uploaded_image,
            "image_analysis": "",
            "problem_keywords": [],
            "identified_category": "",
            "target_gov_portals": [],
            "actionable_steps": "",
            "tts_audio_output": None,
            "detected_language_code": "en-IN",
            "resolved_address": req.resolved_address,
            "gps_location": req.gps_location,
            "email_status": None,
            "email_draft": None
        }
        
        # Execute the StateGraph
        final_state = app_graph.invoke(initial_state)
        
        return {
            "success": True,
            "category": final_state.get("identified_category"),
            "keywords": final_state.get("problem_keywords"),
            "actionable_steps": final_state.get("actionable_steps"),
            "audio_transcript": final_state.get("audio_transcript"),
            "image_analysis": final_state.get("image_analysis"),
            "target_gov_portals": final_state.get("target_gov_portals"),
            "tts_audio_output": final_state.get("tts_audio_output"),
            "detected_language_code": final_state.get("detected_language_code"),
            "email_status": final_state.get("email_status"),
            "email_draft": final_state.get("email_draft")
        }
    except Exception as e:
        logger.error(f"Failed to process complaint graph: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing complaint router workflow: {str(e)}"
        )

@app.get("/api/config")
def get_config():
    # Return Google Maps API Key to the frontend
    return {
        "google_maps_api_key": GOOGLE_MAPS_API_KEY or ""
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app_name": "Samarth",
        "api_keys_configured": {
            "GROQ_API_KEY": GROQ_API_KEY is not None,
            "GEMINI_API_KEY": GEMINI_API_KEY is not None,
            "SARVAM_API_KEY": SARVAM_API_KEY is not None,
            "GOOGLE_MAPS_API_KEY": GOOGLE_MAPS_API_KEY is not None
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
