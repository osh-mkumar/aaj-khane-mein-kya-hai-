"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle, Globe, RefreshCw, Radio } from "lucide-react";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface VoiceInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (val: string) => void;
  isProcessing?: boolean;
}

export function VoiceInput({
  value,
  onChange,
  onSubmit,
  isProcessing = false,
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLang, setSelectedLang] = useState("hi-IN");
  const [speechMode, setSpeechMode] = useState<"whisper" | "browser">("whisper");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const browserRecognitionRef = useRef<any>(null);

  // Setup browser speech recognition fallback
  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as unknown as IWindow) : null;
    const SpeechRec = win?.SpeechRecognition || win?.webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLang;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript) {
            onChange(value ? `${value} ${finalTranscript.trim()}` : finalTranscript.trim());
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.warn("Browser Speech recognition error:", event.error);
          if (event.error === "not-allowed") {
            setSpeechError("Microphone access was denied. Please allow microphone permissions or type manually.");
          }
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        browserRecognitionRef.current = recognition;
      } catch (err) {
        console.warn("Browser SpeechRecognition init failed:", err);
      }
    }
  }, [selectedLang]);

  // Start recording audio for Groq Whisper
  const startWhisperRecording = async () => {
    setSpeechError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunksRef.current.length === 0) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendAudioToWhisper(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err: any) {
      console.warn("Microphone access error for Whisper:", err);
      setSpeechError(
        "Microphone access error. Falling back to browser speech or manual typing."
      );
      setSpeechMode("browser");
    }
  };

  const stopWhisperRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioToWhisper = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "kitchen_audio.webm");
      formData.append("language", selectedLang);

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Whisper transcription failed");
      }

      if (data.text) {
        onChange(value ? `${value} ${data.text.trim()}` : data.text.trim());
      }
    } catch (err: any) {
      console.error("Groq Whisper error:", err);
      setSpeechError(`Groq Whisper error: ${err.message}. You can type manually or use browser recognition.`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Toggle push-to-talk button
  const toggleRecording = () => {
    if (isRecording) {
      if (speechMode === "whisper") {
        stopWhisperRecording();
      } else {
        try {
          browserRecognitionRef.current?.stop();
        } catch {}
        setIsRecording(false);
      }
    } else {
      setSpeechError(null);
      if (speechMode === "whisper" && typeof navigator !== "undefined" && navigator.mediaDevices) {
        startWhisperRecording();
      } else if (browserRecognitionRef.current) {
        try {
          browserRecognitionRef.current.lang = selectedLang;
          browserRecognitionRef.current.start();
          setIsRecording(true);
        } catch (e: any) {
          setSpeechError("Microphone error. Please type manually.");
        }
      } else {
        setSpeechError("Audio recording not supported in this browser environment. Please type below.");
      }
    }
  };

  return (
    <div className="voice-input-card">
      <div className="voice-input-header">
        <div className="voice-lang-selector">
          <Globe size={16} />
          <label htmlFor="voice-lang" className="sr-only">Speech Language</label>
          <select
            id="voice-lang"
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value)}
            disabled={isRecording || isProcessing}
          >
            <option value="hi-IN">Hindi / Hinglish (hi-IN)</option>
            <option value="en-IN">English (India) (en-IN)</option>
            <option value="mr-IN">Marathi (mr-IN)</option>
          </select>

          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", marginLeft: "12px" }}>
            <Radio size={14} />
            <select
              value={speechMode}
              onChange={(e) => setSpeechMode(e.target.value as any)}
              disabled={isRecording || isProcessing}
              style={{ fontSize: "12px", padding: "4px 8px" }}
            >
              <option value="whisper">Groq Whisper (Accurate)</option>
              <option value="browser">Browser WebSpeech (Instant)</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          className={`button mic-button ${isRecording ? "listening" : "secondary"}`}
          onClick={toggleRecording}
          disabled={isProcessing || isTranscribing}
          title={isRecording ? "Stop recording" : "Start speaking"}
        >
          {isRecording ? (
            <>
              <MicOff size={18} className="pulse-icon" /> Stop speaking
            </>
          ) : isTranscribing ? (
            <>
              <RefreshCw size={18} className="spin" /> Transcribing Whisper...
            </>
          ) : (
            <>
              <Mic size={18} /> Speak command
            </>
          )}
        </button>
      </div>

      {speechError && (
        <div className="notice-box error">
          <AlertCircle size={16} />
          <span>{speechError}</span>
        </div>
      )}

      {isRecording && (
        <div className="listening-indicator">
          <span className="dot pulse" /> Listening ({speechMode === "whisper" ? "Groq Whisper HD" : "Browser WebSpeech"})... Speak naturally (e.g. &ldquo;Aaj paneer khatam ho gaya&rdquo;)
        </div>
      )}

      <div className="transcript-box">
        <label htmlFor="manual-transcript">
          <strong>Kitchen Command / Transcript:</strong>
        </label>
        <textarea
          id="manual-transcript"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Speak or type: e.g. 'Aaj paneer khatam ho gaya, palak aadha kilo hai, aur dadi ka vrat hai.'"
          disabled={isProcessing || isTranscribing}
        />
        <div className="transcript-actions">
          <button
            type="button"
            className="button secondary sm"
            onClick={() => onChange("")}
            disabled={!value || isProcessing || isTranscribing}
          >
            Clear
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => onSubmit(value)}
            disabled={!value.trim() || isProcessing || isTranscribing}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={16} className="spin" /> Interpreting AI...
              </>
            ) : (
              "Interpret with AI"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
