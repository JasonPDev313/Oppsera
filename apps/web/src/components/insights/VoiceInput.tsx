'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';

// ── Web Speech API type declarations ───────────────────────────────

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// ── Filler word cleaning ───────────────────────────────────────────

const FILLER_WORDS = new Set([
  'um', 'uh', 'like', 'so', 'you know', 'basically', 'actually',
  'literally', 'right', 'i mean', 'well',
]);

// Word-boundary-aware filler removal. Multi-word fillers are handled
// first by replacing them with empty strings, then single-word fillers
// are removed via split/filter/join.
function cleanTranscript(raw: string): string {
  let text = raw.trim().toLowerCase();

  // Remove multi-word fillers first
  for (const filler of FILLER_WORDS) {
    if (filler.includes(' ')) {
      // Use word boundary regex for multi-word fillers
      const pattern = new RegExp(`\\b${filler}\\b`, 'gi');
      text = text.replace(pattern, '');
    }
  }

  // Remove single-word fillers via split
  const words = text.split(/\s+/).filter((word) => {
    const lower = word.replace(/[.,!?;:]/g, '');
    return lower.length > 0 && !FILLER_WORDS.has(lower);
  });

  const cleaned = words.join(' ').trim();
  if (cleaned.length === 0) return '';

  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ── Props ──────────────────────────────────────────────────────────

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const SILENCE_TIMEOUT_MS = 10_000;
const ERROR_DISPLAY_MS = 3_000;

// ── Component ──────────────────────────────────────────────────────

export function VoiceInput({ onTranscript, disabled, className }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect support on mount
  useEffect(() => {
    const SpeechRecognitionApi = getSpeechRecognitionApi();
    setIsSupported(SpeechRecognitionApi !== null);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = setTimeout(() => {
      setError(null);
      errorTimerRef.current = null;
    }, ERROR_DISPLAY_MS);
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    const SpeechRecognitionApi = getSpeechRecognitionApi();
    if (!SpeechRecognitionApi) {
      showError('Voice input not supported in this browser');
      return;
    }

    // Stop any existing session
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Clear silence timer on result
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      const lastResult = event.results[event.results.length - 1];
      if (lastResult && lastResult[0]) {
        const rawText = lastResult[0].transcript;
        const cleaned = cleanTranscript(rawText);
        if (cleaned.length > 0) {
          onTranscript(cleaned);
        } else {
          showError('No speech detected');
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      switch (event.error) {
        case 'no-speech':
          showError('No speech detected');
          break;
        case 'audio-capture':
          showError('No microphone found');
          break;
        case 'not-allowed':
          showError('Microphone access denied');
          break;
        case 'aborted':
          // User-initiated abort — no error needed
          break;
        default:
          showError('Voice input failed');
          break;
      }

      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    setError(null);

    try {
      recognition.start();
    } catch {
      showError('Failed to start voice input');
      setIsRecording(false);
      recognitionRef.current = null;
      return;
    }

    // Auto-stop after silence timeout
    silenceTimerRef.current = setTimeout(() => {
      stopRecording();
    }, SILENCE_TIMEOUT_MS);
  }, [onTranscript, showError, stopRecording]);

  const handleClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Unsupported browser — show disabled mic with tooltip
  if (!isSupported) {
    return (
      <div className={`relative ${className ?? ''}`}>
        <button
          type="button"
          disabled
          className="p-2 rounded-full text-gray-300 cursor-not-allowed"
          title="Voice input not supported in this browser"
          aria-label="Voice input not supported"
        >
          <MicOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`p-2 rounded-full transition-colors ${
          isRecording
            ? 'bg-red-500/10 text-red-500 animate-pulse'
            : 'text-gray-500 hover:bg-gray-200/50 hover:text-gray-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={isRecording ? 'Stop recording' : 'Start voice input'}
        aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
      >
        <Mic className="h-4 w-4" />
      </button>

      {isRecording && (
        <span className="text-xs text-red-500 font-medium animate-pulse whitespace-nowrap">
          Listening...
        </span>
      )}

      {error && !isRecording && (
        <span className="text-xs text-red-500 whitespace-nowrap">
          {error}
        </span>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function getSpeechRecognitionApi(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}
