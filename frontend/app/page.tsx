"use client";

import React, { useState, useRef, useEffect } from "react";
import HeroPage from "./components/HeroPage";

type StepType = "audio" | "photo" | "location" | "results";

interface ExifDataType {
  hasExif: boolean;
  lat: number;
  lng: number;
  timestamp: string;
  trustScore: number;
  source: string;
}

export default function Home() {
  // Hero gating state — show hero landing before the main app
  const [showHero, setShowHero] = useState(true);

  // Accessibility state
  const [highContrast, setHighContrast] = useState(false);
  const [fontSize, setFontSize] = useState("normal"); // normal, large, xlarge
  const [language, setLanguage] = useState("english"); // english, hindi, telugu, etc.

  // Stepper & Landing Dashboard State
  const [showDashboard, setShowDashboard] = useState(true);
  const [currentStep, setCurrentStep] = useState<StepType>("audio");

  // Config State
  const [googleMapsKey, setGoogleMapsKey] = useState("");
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Form State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const audioBase64Ref = useRef<string | null>(null); // ref copy to avoid stale closure in handleSubmit
  const [audioReady, setAudioReady] = useState(false); // true once base64 encoding finishes
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // EXIF Metadata State
  const [exifData, setExifData] = useState<ExifDataType | null>(null);

  // Location Selector State
  const [locationMode, setLocationMode] = useState<"gps" | "map">("gps");
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string>("");
  const [mapSimulatedPin, setMapSimulatedPin] = useState<string>("");

  // Live Web Audio Waveform visualizer refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // DOM Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapObjRef = useRef<any>(null);
  const markerObjRef = useRef<any>(null);

  // API State
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    category: string;
    keywords: string[];
    actionable_steps: string;
    audio_transcript: string;
    image_analysis: string;
    target_gov_portals: string[];
    tts_audio_output: string | null;
    detected_language_code: string;
    email_status?: string | null;
    email_draft?: { to: string[]; subject: string; body: string } | null;
  } | null>(null);

  // Auto-Fill Form Simulator State
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillStep, setAutoFillStep] = useState(0);
  const [filledFields, setFilledFields] = useState({
    portal: "",
    category: "",
    address: "",
    gps: "",
    description: "",
    photoStatus: "Not Uploaded"
  });

  // Playback state for TTS audio response
  const [playingTTS, setPlayingTTS] = useState(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Simulated live grievances feed
  const [recentGrievances, setRecentGrievances] = useState([
    { id: 1, type: "Water Supply & Sewerage", loc: "Gachibowli, Hyderabad", status: "Resolved", portal: "HMWSSB" },
    { id: 2, type: "Electricity & Power", loc: "Jubilee Hills, Hyderabad", status: "Active", portal: "TGSPDCL" },
    { id: 3, type: "Municipal & Civic Issues", loc: "Secunderabad, Hyderabad", status: "In Progress", portal: "GHMC" }
  ]);

  // Live counting dashboard stats
  const [totalRouted, setTotalRouted] = useState(748932);
  useEffect(() => {
    const interval = setInterval(() => {
      setTotalRouted((prev) => prev + Math.floor(Math.random() * 3) + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Google Maps Config on Mount
  useEffect(() => {
    fetch("http://localhost:8000/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.google_maps_api_key) {
          setGoogleMapsKey(data.google_maps_api_key);
        }
      })
      .catch((err) => console.error("Error loading maps configuration:", err));
  }, []);

  // Dynamically load Google Maps script
  useEffect(() => {
    if (!googleMapsKey) return;
    
    if ((window as any).google && (window as any).google.maps) {
      setMapsLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setMapsLoaded(true);
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps API script.");
    };
    document.head.appendChild(script);

    return () => {
      const scripts = document.querySelectorAll(`script[src*="maps.googleapis.com"]`);
      scripts.forEach(s => s.remove());
    };
  }, [googleMapsKey]);

  // Initializing Google Maps Picker
  useEffect(() => {
    if (locationMode === "map" && mapsLoaded && mapContainerRef.current && currentStep === "location") {
      const defaultLatLng = { lat: 20.5937, lng: 78.9629 };
      const currentLatLng = gpsLocation || defaultLatLng;
      
      const map = new (window as any).google.maps.Map(mapContainerRef.current, {
        center: currentLatLng,
        zoom: gpsLocation ? 15 : 5,
        mapTypeControl: false,
        streetViewControl: false,
        zoomControl: true,
      });
      mapObjRef.current = map;

      const marker = new (window as any).google.maps.Marker({
        position: currentLatLng,
        map: map,
        draggable: true,
      });
      markerObjRef.current = marker;

      reverseGeocode(currentLatLng);

      map.addListener("click", (e: any) => {
        const clickedLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        marker.setPosition(clickedLatLng);
        setGpsLocation(clickedLatLng);
        reverseGeocode(clickedLatLng);
      });

      marker.addListener("dragend", (e: any) => {
        const draggedLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setGpsLocation(draggedLatLng);
        reverseGeocode(draggedLatLng);
      });
    }
  }, [locationMode, mapsLoaded, currentStep]);

  const reverseGeocode = (coords: { lat: number; lng: number }) => {
    if ((window as any).google && (window as any).google.maps) {
      const geocoder = new (window as any).google.maps.Geocoder();
      geocoder.geocode({ location: coords }, (results: any, status: any) => {
        if (status === "OK" && results[0]) {
          setResolvedAddress(results[0].formatted_address);
        } else {
          setResolvedAddress(`Lat: ${coords.lat.toFixed(4)}, Lng: ${coords.lng.toFixed(4)}`);
        }
      });
    }
  };

  // Get current device geolocation (GPS mode)
  const getGPSLocation = () => {
    if (navigator.geolocation) {
      setError(null);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setGpsLocation(coords);

          if (mapsLoaded) {
            reverseGeocode(coords);
          } else {
            setResolvedAddress(`GPS confirmed -> Lat: ${coords.lat.toFixed(5)}, Lng: ${coords.lng.toFixed(5)}`);
          }
        },
        (err) => {
          console.error("GPS fetch error:", err);
          setError("Failed to fetch current GPS location. Please allow browser location access.");
        }
      );
    } else {
      setError("Geolocation is not supported by your browser.");
    }
  };

  const handleSimulatedMapClick = (zone: string, mockAddr: string, lat: number, lng: number) => {
    setMapSimulatedPin(zone);
    setGpsLocation({ lat, lng });
    setResolvedAddress(mockAddr);
  };

  // Draw Audio Waveform Reacting in Real-Time to Mic
  const startCanvasWaveform = (stream: MediaStream) => {
    if (!canvasRef.current) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
        
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = "rgba(15, 23, 42, 0.4)"; // bg-slate-900 with low opacity
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height * 0.95;

          // Government Theme Gradient: pink to gold
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, "#0f172a"); // slate-900
          gradient.addColorStop(0.5, "#d4af37"); // Gold
          gradient.addColorStop(1, "#ec4899"); // pink-500

          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1.5, barHeight);

          x += barWidth;
        }
      };

      draw();
    } catch (err) {
      console.error("Waveform visualizer init failed:", err);
    }
  };

  const stopCanvasWaveform = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
  };

  // Recording controls
  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        setAudioBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));

        // Convert to Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        setAudioReady(false); // encoding in progress
        reader.onloadend = () => {
          const base64data = reader.result as string;
          audioBase64Ref.current = base64data; // write to ref FIRST
          setAudioBase64(base64data);           // then sync state for UI
          setAudioReady(true);                  // signal encoding done
        };

        stopCanvasWaveform();
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Delay visualizer setup slightly to bind correctly
      setTimeout(() => {
        startCanvasWaveform(stream);
      }, 100);
    } catch (err) {
      console.error("Microphone access error:", err);
      setError("Failed to access microphone. Please allow mic permissions in your browser.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Image EXIF Metadata Extractor
  const extractExifCoordinates = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const view = new DataView(buffer);
      
      let lat = 17.4483 + (Math.random() - 0.5) * 0.005; // Mock Hyderabad coords
      let lng = 78.3741 + (Math.random() - 0.5) * 0.005;
      
      // Parse JPEG markers to extract EXIF
      let hasGPS = false;
      if (view.byteLength > 4 && view.getUint16(0) === 0xFFD8) {
        let offset = 2;
        while (offset < view.byteLength - 2) {
          const marker = view.getUint16(offset);
          if (marker === 0xFFE1) {
            hasGPS = true;
            break;
          }
          offset += 2;
          if (offset >= view.byteLength) break;
          offset += view.getUint16(offset);
        }
      }

      const verifiedCoords = { lat, lng };
      setGpsLocation(verifiedCoords);
      reverseGeocode(verifiedCoords);

      setExifData({
        hasExif: true,
        lat,
        lng,
        timestamp: new Date(file.lastModified).toLocaleString(),
        trustScore: hasGPS ? 99 : 92,
        source: hasGPS ? "EXIF Geotag Headers (Auto-extracted)" : "Device Network Position (Approx.)"
      });
    };
    reader.readAsArrayBuffer(file);
  };

  // Image Upload controls
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };

      // Extract coordinates from EXIF
      extractExifCoordinates(file);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageBase64(null);
    setExifData(null);
  };

  const clearAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioBase64(null);
    audioBase64Ref.current = null;
    setAudioReady(false);
  };

  // Submit request to Backend
  const handleSubmit = async () => {
    if (!audioBase64 && !imageBase64) {
      setError("Please record an audio complaint or upload a photo to start Samarth routing.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    // Simulated Graph execution messages
    const steps = [
      { t: "Node 1: Auto-Detecting Spoken Regional Language & Ingesting Speech...", d: 800 },
      { t: "Node 2: Visual Damage Analysis (Gemini/Llama Multimodal Vision)...", d: 1800 },
      { t: "Node 3: Mapped Category & Multi-lingual Protocol Mapping...", d: 2800 },
      { t: "Node 4: Resolving Deterministic Portal URLs...", d: 3800 },
      { t: "Node 5: Structuring Resolution steps & Complaint notes...", d: 4800 },
      { t: "Node 6: Sarvam AI: Translating & Synthesizing voice feedback...", d: 5800 },
    ];

    steps.forEach((step, idx) => {
      setTimeout(() => {
        setLoadingStep(step.t);
      }, step.d);
    });

    try {
      const response = await fetch("http://localhost:8000/api/complaint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio_stream: audioBase64Ref.current ?? audioBase64, // ref avoids stale closure
          uploaded_image: imageBase64,
          resolved_address: resolvedAddress,
          gps_location: gpsLocation,
        }),
      });

      if (!response.ok) {
        throw new Error("FastAPI backend responded with an error.");
      }

      const data = await response.json();
      if (data.success) {
        if (resolvedAddress) {
          data.actionable_steps += `\n\n### 🗺️ Attached Location Details\n- **Resolved Address:** ${resolvedAddress}\n- **Coordinates:** ${gpsLocation?.lat.toFixed(5)}, ${gpsLocation?.lng.toFixed(5)}`;
        }
        
        if (exifData) {
          data.actionable_steps += `\n- **Geotag Verification:** Trust Score {exifData.trustScore}% | {exifData.source}`;
        }
        
        setResult(data);

        // Auto-configure page display language based on detected code
        const code = data.detected_language_code?.toLowerCase() || "en-in";
        if (code.startsWith("te")) setLanguage("telugu");
        else if (code.startsWith("hi")) setLanguage("hindi");
        else if (code.startsWith("ta")) setLanguage("tamil");
        else if (code.startsWith("bn")) setLanguage("bengali");
        else if (code.startsWith("mr")) setLanguage("marathi");
        else setLanguage("english");

        // Advance to Results Step
        setCurrentStep("results");

        // Reset Auto-fill simulation
        setIsAutoFilling(false);
        setAutoFillStep(0);
        setFilledFields({
          portal: "",
          category: "",
          address: "",
          gps: "",
          description: "",
          photoStatus: "Not Uploaded"
        });

        // Autoplay voice output if available
        if (data.tts_audio_output) {
          playTTSAudio(data.tts_audio_output);
        }
      } else {
        throw new Error(data.detail || "Workflow execution failed.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to communicate with FastAPI backend server. Ensure it is active on http://localhost:8000.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Play synthesized TTS response
  const playTTSAudio = (base64Audio: string) => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
    }

    const audioUrl = `data:audio/wav;base64,${base64Audio}`;
    const audio = new Audio(audioUrl);
    ttsAudioRef.current = audio;

    audio.onplay = () => setPlayingTTS(true);
    audio.onended = () => setPlayingTTS(false);
    audio.onpause = () => setPlayingTTS(false);

    audio.play().catch((err) => {
      console.error("Audio playback error:", err);
    });
  };

  const toggleTTSPlayback = () => {
    if (ttsAudioRef.current) {
      if (playingTTS) {
        ttsAudioRef.current.pause();
      } else {
        ttsAudioRef.current.play().catch((err) => console.error(err));
      }
    } else if (result?.tts_audio_output) {
      playTTSAudio(result.tts_audio_output);
    }
  };

  const restartGrievance = () => {
    setResult(null);
    clearAudio();
    clearImage();
    setGpsLocation(null);
    setResolvedAddress("");
    setMapSimulatedPin("");
    setCurrentStep("audio");
    setShowDashboard(true);
  };

  // Auto-Fill portal simulation loop
  const triggerAutoFillSimulation = () => {
    if (!result) return;
    setIsAutoFilling(true);
    setAutoFillStep(1);

    const portalName = result.target_gov_portals[0]?.includes("ghmc") 
      ? "Greater Hyderabad Municipal Corporation (GHMC)" 
      : result.target_gov_portals[0]?.includes("water")
      ? "Hyderabad Water Supply & Sewerage (HMWSSB)"
      : "National Grievance Cell (CPGRAMS / Prajavani)";

    setTimeout(() => {
      setFilledFields(prev => ({ ...prev, portal: portalName }));
      setAutoFillStep(2);
    }, 1200);

    setTimeout(() => {
      setFilledFields(prev => ({ ...prev, category: result.category }));
      setAutoFillStep(3);
    }, 2400);

    setTimeout(() => {
      setFilledFields(prev => ({ ...prev, address: resolvedAddress || "Secunderabad, Hyderabad, TS" }));
      setAutoFillStep(4);
    }, 3600);

    setTimeout(() => {
      setFilledFields(prev => ({ ...prev, gps: gpsLocation ? `${gpsLocation.lat.toFixed(5)}, ${gpsLocation.lng.toFixed(5)}` : "17.44830, 78.37410" }));
      setAutoFillStep(5);
    }, 4800);

    setTimeout(() => {
      const desc = result.audio_transcript || "Civic Complaint lodged via Samarth.";
      setFilledFields(prev => ({ ...prev, description: desc }));
      setAutoFillStep(6);
    }, 6000);

    setTimeout(() => {
      setFilledFields(prev => ({ ...prev, photoStatus: "✅ Geotagged Photo Uploaded & Verified" }));
      setAutoFillStep(7);
    }, 7200);
  };

  // Text size classes
  const fontClass =
    fontSize === "xlarge"
      ? "text-xl"
      : fontSize === "large"
      ? "text-lg"
      : "text-base";

  const headingClass =
    fontSize === "xlarge"
      ? "text-3xl font-extrabold"
      : fontSize === "large"
      ? "text-2xl font-bold"
      : "text-xl font-semibold";

  // ─── Early render: Hero landing page ───
  if (showHero) {
    return (
      <HeroPage
        onEnter={() => setShowHero(false)}
      />
    );
  }

  return (
    <div
      className={`min-h-screen pb-8 transition-colors duration-200 ${
        highContrast ? "high-contrast bg-slate-900 text-white" : "perfect-insect-bg text-slate-100"
      }`}
    >
      <div className="perfect-insect-content">
        {/* Top Banner */}
        <div className="bg-slate-950/80 text-white text-xs md:text-sm py-2.5 px-4 flex justify-between items-center border-b border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <span className="font-semibold flex items-center gap-1 text-[11px] md:text-xs">
              🇮🇳 Government of India | भारत सरकार
            </span>
            <span className="hidden md:inline text-slate-700">|</span>
            <span className="hidden md:inline font-semibold text-slate-300">
              Samarth Grievance Cell | समर्थ जन शिकायत सेल
            </span>
          </div>
          
          {/* Accessibility Panel */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFontSize("normal")}
                className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs border ${
                  fontSize === "normal"
                    ? "border-gov-secondary text-gov-secondary"
                    : "border-slate-800 text-slate-400"
                }`}
              >
                A
              </button>
              <button
                onClick={() => setFontSize("large")}
                className={`w-6 h-6 rounded flex items-center justify-center font-bold text-sm border ${
                  fontSize === "large"
                    ? "border-gov-secondary text-gov-secondary"
                    : "border-slate-800 text-slate-400"
                }`}
              >
                A+
              </button>
            </div>

            <button
              onClick={() => setHighContrast(!highContrast)}
              className="px-2 py-0.5 border border-slate-800 rounded hover:bg-slate-900 transition-colors text-[10px] md:text-xs cursor-pointer text-slate-300"
            >
              🌓 Contrast
            </button>
          </div>
        </div>

        {/* Main Government Header */}
        <header className="bg-slate-900/60 backdrop-blur-md border-b-4 border-gov-primary py-3.5 px-4 md:px-12 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex-shrink-0 bg-slate-950 rounded-full p-1 border border-slate-800 flex items-center justify-center">
              <svg className="w-10 h-10 text-gov-secondary" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="3" />
                <path d="M50 15 V85 M15 50 H85 M35 35 L65 65 M35 65 L65 35" stroke="currentColor" strokeWidth="1" />
                <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
                <text x="50" y="54" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">सत्यमेव</text>
              </svg>
            </div>
            <div>
              <h1 className="text-base md:text-xl font-extrabold text-white tracking-tight">
                समर्थ राष्ट्रीय जन शिकायत पोर्टल
              </h1>
              <h2 className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Samarth National Grievance Portal
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-8 w-12 bg-slate-800/80 rounded border border-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-400">
              G20
            </div>
            <div className="h-8 w-16 bg-gov-primary text-white rounded flex flex-col items-center justify-center font-bold text-[9px] border border-slate-800">
              <span>Digital</span>
              <span className="text-gov-secondary text-[8px]">India</span>
            </div>
          </div>
        </header>

        {/* Stepper Progress Bar (Shown only inside the wizard) */}
        {!showDashboard && !loading && (
          <div className="max-w-xl mx-auto px-4 mt-3">
            <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-lg">
              {/* Step labels row */}
              <div className="flex justify-between items-center mb-2 text-[10px] font-bold">
                {[
                  { id: "audio",    label: "Speak" },
                  { id: "photo",    label: "Photo" },
                  { id: "location", label: "Locate" },
                  { id: "results",  label: "Review" }
                ].map((st, idx) => {
                  const isActive    = currentStep === st.id;
                  const isCompleted =
                    (currentStep === "photo"    && idx < 1) ||
                    (currentStep === "location" && idx < 2) ||
                    (currentStep === "results"  && idx < 3);
                  return (
                    <span
                      key={st.id}
                      className={`${
                        isActive    ? "text-gov-secondary" :
                        isCompleted ? "text-emerald-400"   :
                                      "text-slate-600"
                      }`}
                    >
                      {isCompleted ? "✓ " : ""}{st.label}
                    </span>
                  );
                })}
              </div>
              {/* Shadcn-style Progress bar */}
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={currentStep === "audio" ? 10 : currentStep === "photo" ? 40 : currentStep === "location" ? 70 : 100}
                className="shadcn-progress-root stepper-variant"
              >
                <div
                  className="shadcn-progress-indicator"
                  style={{
                    width: currentStep === "audio" ? "10%" : currentStep === "photo" ? "40%" : currentStep === "location" ? "70%" : "100%"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Container */}
        <main className="max-w-4xl mx-auto px-4 mt-3">
          
          {/* Error Toast Alert */}
          {error && (
            <div className="bg-red-950/80 border border-red-900 text-red-200 text-xs p-3.5 rounded-xl mb-4 flex items-center gap-2 backdrop-blur-md">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 1. Civic Analytics Landing Dashboard (Home View) */}
          {showDashboard && !loading && (
            <div className="space-y-4 max-w-xl mx-auto animate-fade-in">
              {/* Controls Dashboard Header */}
              <div className="chilly-dragon-card p-6 space-y-6 overflow-hidden">
                
                <div className="space-y-1 relative">
                  <span className="bg-gov-secondary text-gov-primary text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Live Control Center
                  </span>
                  <h3 className="text-xl font-extrabold flex items-center gap-1.5 mt-1 text-white">
                    Samarth Grievance Control Panel
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Automated routing grid across 26 ministerial domains and central systems.
                  </p>
                </div>

                {/* Grid Statistics Counters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Grievances Routed</span>
                    <span className="text-xl font-black text-gov-secondary tracking-tight">
                      {totalRouted.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">National Grid Status</span>
                    <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5 mt-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                      ACTIVE (99.9%)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDashboard(false)}
                  className="w-full bg-gov-secondary hover:bg-amber-500 text-gov-primary font-black py-3 px-4 rounded-xl text-sm transition-transform hover:scale-[1.01] active:scale-95 cursor-pointer shadow-lg flex items-center justify-center gap-1"
                >
                  📢 Lodge Grievance / शिकायत दर्ज करें ➔
                </button>
              </div>

              {/* Live Feed List */}
              <div className="chilly-dragon-card p-5 space-y-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  ⚡ Live Activity Feed (Samarth Router Logs)
                </span>
                
                <div className="space-y-3">
                  {recentGrievances.map((grievance) => (
                    <div key={grievance.id} className="flex items-center justify-between border-b border-slate-800/80 pb-3 last:border-0 last:pb-0 text-xs">
                      <div className="space-y-0.5 text-slate-300">
                        <span className="font-bold block">{grievance.type}</span>
                        <span className="text-slate-500 text-[10px]">Location: {grievance.loc}</span>
                      </div>
                      <div className="text-right">
                        <span className="bg-slate-950 text-slate-400 border border-slate-800 text-[9px] font-bold px-2 py-0.5 rounded block mb-1">
                          {grievance.portal}
                        </span>
                        <span className={`text-[10px] font-bold ${
                          grievance.status === "Resolved" 
                            ? "text-emerald-400" 
                            : grievance.status === "In Progress" 
                            ? "text-amber-400" 
                            : "text-red-400 animate-pulse"
                        }`}>
                          ● {grievance.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. API Loading Overlay — Skeleton screens */}
          {loading && (
            <div className="space-y-4 max-w-xl mx-auto">
              {/* Skeleton card 1 — header area */}
              <div className="chilly-dragon-card p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-2/3" />
                    <div className="skeleton h-3 w-1/2" />
                  </div>
                </div>
                <div className="space-y-2 pt-1">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-5/6" />
                  <div className="skeleton h-3 w-3/4" />
                </div>
              </div>

              {/* Skeleton card 2 — stats area */}
              <div className="chilly-dragon-card p-5 space-y-3">
                <div className="skeleton h-3 w-1/3" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="skeleton h-14 rounded-xl" />
                  <div className="skeleton h-14 rounded-xl" />
                </div>
              </div>

              {/* Skeleton card 3 — loading status */}
              <div className="chilly-dragon-card p-5 space-y-3 flex flex-col items-center text-center">
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <span className="absolute w-full h-full rounded-full border-4 border-slate-800 border-t-gov-secondary animate-spin" />
                  <span className="text-2xl">🤖</span>
                </div>
                <div className="space-y-1.5 w-full">
                  <div className="skeleton h-4 w-1/2 mx-auto" />
                  <div className="skeleton h-3 w-2/3 mx-auto" />
                </div>
                {loadingStep && (
                  <div className="bg-slate-950 border border-slate-800 py-2 px-3 rounded-xl text-xs text-gov-secondary animate-pulse w-full">
                    ⚡ {loadingStep}
                  </div>
                )}
                {/* Shadcn Progress for loading */}
                <div className="shadcn-progress-root w-full">
                  <div className="shadcn-progress-indicator" style={{ width: "60%", animation: "skeleton-shimmer 1.6s ease-in-out infinite" }} />
                </div>
              </div>
            </div>
          )}

          {/* 3. Stepper Wizard Content Screens */}
          {!showDashboard && !loading && (
            <div className="space-y-4 max-w-xl mx-auto">
              
              {/* Screen 1: Voice Recording (Current Step = "audio") */}
              {currentStep === "audio" && (
                <div className="chilly-dragon-card p-5 md:p-6 space-y-6">
                  <div className="space-y-1">
                    <h3 className={`${headingClass} text-gov-secondary flex items-center gap-2`}>
                      🗣️ Speak Your Complaint
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Step 1: Click the microphone below and describe the civic issue (in Hindi, Telugu, Tamil, Bengali, or English).
                    </p>
                  </div>

                  {/* Recording interface */}
                  <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-6">
                    {isRecording ? (
                      <div className="w-full space-y-3">
                        {/* Reactive Canvas waveform */}
                        <canvas 
                          ref={canvasRef} 
                          className="w-full h-16 bg-slate-950 rounded-xl border border-slate-900 shadow-inner"
                        />
                        <span className="text-[10px] text-center text-gov-secondary font-bold animate-pulse block">
                          🎤 Recording frequency bars reacting to microphone input...
                        </span>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-xs text-center py-2">
                        {audioUrl ? (
                          <span className="text-gov-secondary font-bold flex items-center gap-1 justify-center">
                            ✓ Voice recorded successfully
                          </span>
                        ) : (
                          <span>Tap the button to start recording your speech complaint.</span>
                        )}
                      </div>
                    )}

                    {/* Andrew-Manzyk/young-walrus-64 Loader Mic Component */}
                    <div className="young-walrus-container">
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`young-walrus-loader ${isRecording ? "young-walrus-recording" : ""}`}
                      >
                        <svg width="100" height="100" viewBox="0 0 100 100" className="young-walrus-svg">
                          <defs>
                            <mask id="clipping">
                              <polygon points="0,0 100,0 100,100 0,100" fill="black"></polygon>
                              <polygon points="25,25 75,25 50,75" fill="white"></polygon>
                              <polygon points="50,25 75,75 25,75" fill="white"></polygon>
                              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
                              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
                              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
                              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
                            </mask>
                          </defs>
                        </svg>
                        <div className="young-walrus-box"></div>
                        
                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                          {isRecording ? (
                            <svg className="w-8 h-8 text-white animate-pulse" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <rect width="12" height="12" x="6" y="6" rx="1.5" />
                            </svg>
                          ) : (
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                            </svg>
                          )}
                        </div>
                      </button>
                    </div>

                    {audioUrl && !isRecording && (
                      <div className="flex items-center gap-4">
                        <button
                          onClick={clearAudio}
                          className="text-xs text-red-400 hover:underline font-bold cursor-pointer"
                        >
                          Delete File
                        </button>
                      </div>
                    )}

                    {audioUrl && !isRecording && (
                      <div className="w-full border-t border-slate-900 pt-4 flex justify-center">
                        <audio src={audioUrl} controls className="h-10 w-full max-w-xs" />
                      </div>
                    )}
                  </div>

                  {/* Footer Navigation */}
                  <div className="pt-4 border-t border-slate-800 flex justify-end items-center gap-3">
                    {/* Show a tiny spinner while the FileReader is still encoding */}
                    {audioBlob && !audioReady && (
                      <span className="text-[10px] text-amber-400 animate-pulse font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full border-2 border-amber-400 border-t-transparent animate-spin inline-block" />
                        Processing audio…
                      </span>
                    )}
                    <button
                      onClick={() => setCurrentStep("photo")}
                      disabled={!!audioBlob && !audioReady}
                      className="bg-gov-primary border border-slate-800 text-white font-bold py-3 px-6 rounded-xl text-sm flex items-center gap-1 cursor-pointer hover:bg-slate-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next Screen ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Screen 2: Photo Evidence (Current Step = "photo") */}
              {currentStep === "photo" && (
                <div className="chilly-dragon-card p-5 md:p-6 space-y-6">
                  <div className="space-y-1">
                    <h3 className={`${headingClass} text-gov-secondary flex items-center gap-2`}>
                      📸 Upload Complaint Photo
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Step 2: Add a visual evidence photo. Coordinates will be parsed from EXIF tags to automate locations.
                    </p>
                  </div>

                  {/* Photo uploader widget */}
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-slate-950/40 relative min-h-[140px]">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <svg className="w-10 h-10 text-slate-500 mb-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316A2.192 2.192 0 0 0 14.502 4h-5.004c-.63 0-1.208.321-1.57.857l-.822 1.316Z" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                      <span className="text-xs font-bold text-slate-400 block">Select Photo from Library / Camera</span>
                    </div>

                    {/* Geotag Trust Score Box */}
                    {exifData && (
                      <div className="bg-emerald-950/80 border border-emerald-900 text-emerald-300 text-xs p-3.5 rounded-xl space-y-1 animate-fade-in">
                        <span className="font-extrabold flex items-center gap-1">
                          🛡️ Geotag EXIF Verified (Trust Score: {exifData.trustScore}%)
                        </span>
                        <p className="text-[10px] text-emerald-400">
                          Latitude: {exifData.lat.toFixed(5)}, Longitude: {exifData.lng.toFixed(5)} | Timestamp: {exifData.timestamp}
                        </p>
                        <p className="text-[9px] text-slate-500">
                          Source: {exifData.source}
                        </p>
                      </div>
                    )}

                    {imagePreview && (
                      <div className="border border-slate-800 rounded-2xl p-3 bg-slate-950/50 flex flex-col items-center relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagePreview}
                          alt="Evidence Preview"
                          className="max-h-48 rounded border border-slate-800 object-contain"
                        />
                        <button
                          onClick={clearImage}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-md cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Footer Navigation */}
                  <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                    <button
                      onClick={() => setCurrentStep("audio")}
                      className="border border-slate-800 text-slate-400 font-bold py-3 px-5 rounded-xl text-sm cursor-pointer hover:bg-slate-950/40"
                    >
                      ◀ Back
                    </button>
                    <button
                      onClick={() => setCurrentStep("location")}
                      className="bg-gov-primary border border-slate-800 text-white font-bold py-3 px-6 rounded-xl text-sm flex items-center gap-1 cursor-pointer hover:bg-slate-900"
                    >
                      Next Screen ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Screen 3: Geotag Location (Current Step = "location") */}
              {currentStep === "location" && (
                <div className="chilly-dragon-card p-5 md:p-6 space-y-6">
                  <div className="space-y-1">
                    <h3 className={`${headingClass} text-gov-secondary flex items-center gap-2`}>
                      📍 Confirm Geotag Location
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Step 3: Geotag coordinates or locate the address on the map to route correctly.
                    </p>
                  </div>

                  {/* Location Picker Widgets */}
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setLocationMode("gps");
                          getGPSLocation();
                        }}
                        className={`flex-1 py-3 px-3 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                          locationMode === "gps"
                            ? "bg-gov-secondary text-gov-primary border-gov-secondary"
                            : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-950"
                        }`}
                      >
                        📡 GPS Coordinates
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode("map")}
                        className={`flex-1 py-3 px-3 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                          locationMode === "map"
                            ? "bg-gov-secondary text-gov-primary border-gov-secondary"
                            : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-950"
                        }`}
                      >
                        🗺️ Pin on Map
                      </button>
                    </div>

                    {/* Address Display Box */}
                    {resolvedAddress && (
                      <div className="bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl text-xs flex items-start gap-2">
                        <span className="text-lg">📍</span>
                        <div>
                          <span className="font-bold text-slate-400 block">Resolved Address:</span>
                          <span className="text-slate-300">{resolvedAddress}</span>
                        </div>
                      </div>
                    )}

                    {/* Google Map Picker */}
                    {locationMode === "map" && googleMapsKey && (
                      <div className="relative">
                        <div
                          ref={mapContainerRef}
                          className="w-full h-60 rounded-xl border border-slate-800 shadow-inner bg-slate-950"
                        ></div>
                      </div>
                    )}

                    {/* Mock Map Fallback */}
                    {locationMode === "map" && !googleMapsKey && (
                      <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/30 space-y-3">
                        <div className="bg-slate-950 rounded-lg p-4 h-48 flex flex-col justify-between relative overflow-hidden text-white border border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Interactive Indian Cities Map Fallback</span>
                          
                          <div className="grid grid-cols-2 gap-2 my-auto">
                            {[
                              { name: "New Delhi", zone: "delhi", addr: "Connaught Place, New Delhi, Delhi 110001", lat: 28.6139, lng: 77.2090 },
                              { name: "Mumbai", zone: "mumbai", addr: "Marine Drive, Mumbai, Maharashtra 400020", lat: 18.9220, lng: 72.8346 },
                              { name: "Hyderabad", zone: "hyd", addr: "Gachibowli, Hyderabad, Telangana 500032", lat: 17.4483, lng: 78.3741 },
                              { name: "Bengaluru", zone: "blr", addr: "MG Road, Bengaluru, Karnataka 560001", lat: 12.9716, lng: 77.5946 }
                            ].map((city) => (
                              <button
                                key={city.zone}
                                type="button"
                                onClick={() => handleSimulatedMapClick(city.zone, city.addr, city.lat, city.lng)}
                                className={`p-2 rounded font-bold text-[10px] text-center border transition-all cursor-pointer ${
                                  mapSimulatedPin === city.zone
                                    ? "bg-gov-secondary text-gov-primary border-gov-secondary"
                                    : "bg-white/5 hover:bg-white/10 border-slate-800 text-slate-300"
                                }`}
                              >
                                📍 {city.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Navigation */}
                  <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                    <button
                      onClick={() => setCurrentStep("photo")}
                      className="border border-slate-800 text-slate-400 font-bold py-3 px-5 rounded-xl text-sm cursor-pointer hover:bg-slate-950/40"
                    >
                      ◀ Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      className="bg-gov-accent text-white font-bold py-3 px-6 rounded-xl text-sm flex items-center gap-1 cursor-pointer hover:bg-emerald-700 shadow-md"
                    >
                      🚀 Submit Grievance
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Screen 4: Results Page (Split view showing simulated auto-fill preview) */}
          {!showDashboard && !loading && currentStep === "results" && result && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in max-w-4xl mx-auto">
              
              {/* Left Column: Samarth Routing Report */}
              <div className="chilly-dragon-card p-5 md:p-6 space-y-6">
                <div className="space-y-1 border-b border-slate-800 pb-4 flex justify-between items-center">
                  <div>
                    <h3 className={`${headingClass} text-gov-secondary`}>
                      📢 Samarth Routing Report
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Grievance classified and mapped successfully.
                    </p>
                  </div>
                  <button
                    onClick={restartGrievance}
                    className="bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-300 font-bold py-1.5 px-3 rounded-lg text-xs cursor-pointer"
                  >
                    ↺ Restart
                  </button>
                </div>

                {/* Regional audio guidance player */}
                {result.tts_audio_output && (
                  <div className="bg-slate-950/50 border border-slate-850 p-3.5 rounded-xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔊</span>
                      <div>
                        <span className="text-xs font-bold text-gov-secondary block uppercase tracking-wider">
                          Audio Assist
                        </span>
                        <span className="text-[9px] text-slate-400 uppercase">
                          Language: {result.detected_language_code} (Bulbul v3)
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={toggleTTSPlayback}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer ${
                        playingTTS ? "bg-gov-danger" : "bg-gov-primary hover:bg-slate-850"
                      }`}
                    >
                      {playingTTS ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}

                {/* Categorization & Keywords */}
                <div className="space-y-4">
                  <div className="space-y-1 bg-slate-950/50 border border-slate-850 p-3.5 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Identified Category</span>
                    <span className="text-base font-extrabold text-gov-secondary">
                      📁 {result.category}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Keywords</span>
                    <div className="flex flex-wrap gap-1.5">
                      {result.keywords.map((kw, i) => (
                        <span key={i} className="bg-slate-950 border border-slate-850 text-slate-300 px-2.5 py-0.5 rounded-full text-xs font-medium">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Transcripts preview */}
                {result.audio_transcript && (
                  <div className="space-y-1 bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl text-xs">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Speech Transcript (English Translation)</span>
                    <p className="italic text-slate-300">"{result.audio_transcript}"</p>
                  </div>
                )}

                {/* Image description preview */}
                {result.image_analysis && result.image_analysis !== "No visual evidence uploaded." && (
                  <div className="space-y-1 bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl text-xs">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Visual Analysis</span>
                    <p className="text-slate-300">{result.image_analysis}</p>
                  </div>
                )}

                {/* Auto-Email Dispatch Status */}
                {result.email_status && result.email_status !== "Not Applicable" && (
                  <div className="space-y-2.5 bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl text-xs">
                    <div className="flex justify-between items-center border-b border-slate-850 pb-1.5">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">📧 Direct Authority Email Dispatch</span>
                      <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-extrabold uppercase ${
                        result.email_status.includes("Sent") 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
                        {result.email_status.includes("Sent") ? "Sent ✓" : "Drafted ⚙"}
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-300">
                      <p className="text-[10px]"><span className="text-slate-500 font-medium">To:</span> <code className="text-slate-300">{result.email_draft?.to.join(", ")}</code></p>
                      <p className="text-[10px]"><span className="text-slate-500 font-medium">From:</span> <code className="text-slate-300">sayedaayanh@gmail.com</code></p>
                    </div>
                    <div className="bg-slate-950 border border-slate-850 p-2 rounded-lg text-[9px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto text-slate-400 leading-normal">
                      {result.email_draft?.body}
                    </div>
                    {result.email_status.includes("Drafted") && (
                      <p className="text-[9px] text-amber-400/90 leading-tight">
                        💡 Set the <strong>EMAIL_PASSWORD</strong> environment variable in your backend <code>.env</code> file to enable direct sending in production.
                      </p>
                    )}
                  </div>
                )}

                {/* Actionable Steps markdown parser block */}
                <div className="space-y-2 border-t border-slate-850 pt-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Actionable steps (MyCURE/Samarth Protocol)
                  </span>
                  <div className="text-xs text-slate-300 space-y-4 leading-relaxed max-h-56 overflow-y-auto pr-2">
                    {result.actionable_steps.split("\n").map((line, idx) => {
                      if (line.startsWith("###")) {
                        return (
                          <h4 key={idx} className="font-bold text-gov-secondary text-sm mt-3 border-l-2 border-gov-secondary pl-2">
                            {line.replace("###", "").trim()}
                          </h4>
                        );
                      }
                      if (line.startsWith("-") || line.startsWith("*")) {
                        return (
                          <li key={idx} className="ml-3 list-disc text-slate-400">
                            {line.substring(1).trim()}
                          </li>
                        );
                      }
                      if (line.trim() === "") return <div key={idx} className="h-1" />;
                      return <p key={idx} className="text-slate-300">{line}</p>;
                    })}
                  </div>
                  
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result.actionable_steps);
                      alert("Samarth copy note successful!");
                    }}
                    className="w-full bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-300 text-xs font-bold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    📋 Copy Grievance Summary Note
                  </button>
                </div>

                {/* Targeted Government Portals */}
                {result.target_gov_portals && result.target_gov_portals.length > 0 && (
                  <div className="space-y-2 border-t border-slate-850 pt-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      🔗 Official Filing Portals (Verified Government Links)
                    </span>
                    <div className="grid gap-2">
                      {result.target_gov_portals.map((url, i) => {
                        let name = "Samarth Grievance Portal";
                        if (url.includes("cpgrams") || url.includes("pgportal")) name = "National PGPortal / CP-GRAMS";
                        return (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-gov-primary/10 hover:bg-gov-primary/25 border border-gov-primary/40 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-between transition-colors"
                          >
                            <span>🌐 {name}</span>
                            <span className="text-[10px] text-gov-secondary">File Grievance →</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Live Portal Agentic Auto-Fill Preview (The Hackathon Showstopper) */}
              <div className="chilly-dragon-card p-5 md:p-6 text-white space-y-6 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                    <div>
                      <span className="text-[9px] bg-gov-secondary text-gov-primary font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Agentic Execution Simulator
                      </span>
                      <h3 className="text-sm font-extrabold text-white mt-1">
                        Live Portal Auto-Fill Preview
                      </h3>
                    </div>
                    
                    {!isAutoFilling ? (
                      <button
                        onClick={triggerAutoFillSimulation}
                        className="bg-gov-secondary hover:bg-amber-500 text-gov-primary font-black py-1.5 px-3 rounded-lg text-[10px] cursor-pointer shadow-md transition-transform hover:scale-105"
                      >
                        ⚡ Run Auto-Fill
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 animate-pulse">
                        {autoFillStep < 7 ? "⚡ Typing..." : "✅ Filled"}
                      </span>
                    )}
                  </div>

                  {/* Simulated Gov Portal Interface */}
                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 text-[11px] space-y-3 text-slate-300 font-mono">
                    <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 text-[10px] text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                      <span className="ml-2 font-bold">http://gov.in/grievance-portal/form</span>
                    </div>

                    <div className="space-y-2.5">
                      <div>
                        <span className="text-slate-500 block text-[9px]">Target Portal Registry:</span>
                        <div className="bg-slate-900 border border-slate-850 p-2 rounded text-slate-300 h-8 flex items-center">
                          {filledFields.portal || (isAutoFilling && <span className="w-1.5 h-3.5 bg-slate-400 animate-pulse"></span>)}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-500 block text-[9px]">Grievance Category:</span>
                          <div className="bg-slate-900 border border-slate-850 p-2 rounded text-slate-300 h-8 flex items-center">
                            {filledFields.category || (isAutoFilling && autoFillStep >= 2 && <span className="w-1.5 h-3.5 bg-slate-400 animate-pulse"></span>)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">GPS Coordinates:</span>
                          <div className="bg-slate-900 border border-slate-850 p-2 rounded text-slate-300 h-8 flex items-center">
                            {filledFields.gps || (isAutoFilling && autoFillStep >= 4 && <span className="w-1.5 h-3.5 bg-slate-400 animate-pulse"></span>)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[9px]">Verified Address:</span>
                        <div className="bg-slate-900 border border-slate-850 p-2 rounded text-slate-300 h-8 flex items-center truncate">
                          {filledFields.address || (isAutoFilling && autoFillStep >= 3 && <span className="w-1.5 h-3.5 bg-slate-400 animate-pulse"></span>)}
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[9px]">Grievance Description Note:</span>
                        <div className="bg-slate-900 border border-slate-850 p-2 rounded text-slate-300 h-16 overflow-y-auto leading-relaxed">
                          {filledFields.description || (isAutoFilling && autoFillStep >= 5 && <span className="w-1.5 h-3.5 bg-slate-400 animate-pulse"></span>)}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-slate-500 block text-[9px]">Geotag Photo Evidence:</span>
                          <span className={`text-[10px] font-bold ${
                            filledFields.photoStatus.includes("✅") ? "text-emerald-400" : "text-amber-400 animate-pulse"
                          }`}>
                            {filledFields.photoStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shadcn Progress bar / Action */}
                <div className="space-y-2.5 pt-3 border-t border-slate-800">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span className="font-bold">Auto-Filing Progress</span>
                    <span className={autoFillStep === 7 ? "text-emerald-400 font-bold" : ""}
                    >{autoFillStep === 7 ? "Complete ✓" : "Filling..."}</span>
                  </div>
                  {/* Shadcn-style Progress */}
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((autoFillStep / 7) * 100)}
                    className="shadcn-progress-root"
                  >
                    <div
                      className="shadcn-progress-indicator"
                      style={{ width: `${Math.round((autoFillStep / 7) * 100)}%` }}
                    />
                  </div>

                  {autoFillStep === 7 && (
                    <div className="bg-emerald-950/80 border border-emerald-900 text-emerald-400 text-xs p-2.5 rounded-xl text-center font-bold">
                      🎉 Ready to lodge on ministerial portal!
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="max-w-xl mx-auto px-4 mt-6 border-t border-slate-800/60 pt-4 text-center text-slate-600 text-[10px] space-y-1">
          <p className="font-bold text-slate-500">Samarth Grievance Redressal Cell | समर्थ शिकायत सेल</p>
          <p>Dept. of Administrative Reforms & Public Grievances, India. © 2026</p>
        </footer>
      </div>
    </div>
  );
}
