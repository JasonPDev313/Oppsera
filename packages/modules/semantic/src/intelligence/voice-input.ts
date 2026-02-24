// ── Voice Input Processing ─────────────────────────────────────────
// V1 = server-side transcript normalization only.
// Actual voice recording and speech-to-text happens on the frontend
// via the Web Speech API (SpeechRecognition). This module cleans up
// raw transcriptions before feeding them to the semantic pipeline.

import type { IntentContext } from '../llm/types';

// ── Types ──────────────────────────────────────────────────────────

export interface VoiceResult {
  /** Cleaned transcript with filler words removed */
  cleanedText: string;
  /** Confidence score from the speech recognition (0-1, passthrough from frontend) */
  confidence: number;
  /** Whether this input originated from voice */
  isVoice: true;
  /** Original raw transcript before cleanup */
  originalText: string;
  /** Number of filler words removed */
  fillerWordsRemoved: number;
  /** Detected voice command type, if any */
  detectedCommand: VoiceCommand | null;
}

export type VoiceCommand =
  | 'clear'
  | 'new_chat'
  | 'repeat'
  | 'go_back'
  | 'show_data'
  | 'export';

// ── Constants ──────────────────────────────────────────────────────

/**
 * Common filler words to strip from voice transcriptions.
 * These add noise without semantic value for the intent resolver.
 */
const FILLER_WORDS = new Set([
  'um', 'uh', 'hmm', 'hm', 'ah', 'er', 'like',
  'so', 'well', 'you know', 'i mean', 'basically',
  'actually', 'literally', 'right', 'okay', 'ok',
]);

/**
 * Phrase-level filler patterns (multi-word).
 * Regex patterns matched case-insensitively.
 */
const FILLER_PHRASES: RegExp[] = [
  /\b(?:you know what i mean)\b/gi,
  /\b(?:you know)\b/gi,
  /\b(?:i mean)\b/gi,
  /\b(?:kind of|sort of)\b/gi,
  /\b(?:let me think)\b/gi,
  /\b(?:let me see)\b/gi,
  /\b(?:hold on)\b/gi,
];

/**
 * Voice command patterns mapped to their command types.
 * These are short commands that should be handled as actions
 * rather than sent to the semantic pipeline.
 */
const VOICE_COMMANDS: Array<{ pattern: RegExp; command: VoiceCommand }> = [
  { pattern: /^(?:clear|reset|start over|new conversation)$/i, command: 'clear' },
  { pattern: /^(?:new chat|fresh start)$/i, command: 'new_chat' },
  { pattern: /^(?:repeat|say that again|what did you say)$/i, command: 'repeat' },
  { pattern: /^(?:go back|previous|back)$/i, command: 'go_back' },
  { pattern: /^(?:show (?:me )?(?:the )?data|show (?:the )?table|show (?:the )?numbers)$/i, command: 'show_data' },
  { pattern: /^(?:export|download|save (?:as )?csv)$/i, command: 'export' },
];

// ── Normalization helpers ──────────────────────────────────────────

/**
 * Removes filler words from transcript text.
 * Handles both single-word fillers and multi-word phrases.
 */
function removeFiller(text: string): { cleaned: string; count: number } {
  let cleaned = text;
  let count = 0;

  // Remove phrase-level fillers first (longer patterns)
  for (const pattern of FILLER_PHRASES) {
    const matches = cleaned.match(pattern);
    if (matches) {
      count += matches.length;
      cleaned = cleaned.replace(pattern, ' ');
    }
  }

  // Remove single-word fillers
  const words = cleaned.split(/\s+/);
  const filtered: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase().replace(/[.,!?;:]+$/, '');
    if (FILLER_WORDS.has(lower)) {
      count++;
    } else {
      filtered.push(word);
    }
  }

  cleaned = filtered.join(' ');

  return { cleaned, count };
}

/**
 * Normalizes common voice dictation patterns to their typed equivalents.
 */
function normalizeVoicePatterns(text: string): string {
  let normalized = text;

  // Number word → digit conversion for common patterns
  const numberWords: Record<string, string> = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
    'twenty': '20', 'thirty': '30', 'fifty': '50', 'hundred': '100',
  };

  // Only convert when followed by percent or preceded by "top/last/past"
  for (const [word, digit] of Object.entries(numberWords)) {
    normalized = normalized.replace(
      new RegExp(`\\b(top|last|past|first)\\s+${word}\\b`, 'gi'),
      `$1 ${digit}`,
    );
    normalized = normalized.replace(
      new RegExp(`\\b${word}\\s+percent\\b`, 'gi'),
      `${digit}%`,
    );
  }

  // "dollar" / "dollars" after numbers
  normalized = normalized.replace(/(\d+)\s+dollars?/gi, '$$$1');

  // "percent" → "%"
  normalized = normalized.replace(/(\d+)\s+percent/gi, '$1%');

  // Common voice date patterns
  normalized = normalized.replace(/\bthis past week\b/gi, 'last week');
  normalized = normalized.replace(/\bthe other day\b/gi, 'recently');
  normalized = normalized.replace(/\btoday's\b/gi, "today's");

  // Collapse multiple spaces
  normalized = normalized.replace(/\s{2,}/g, ' ').trim();

  return normalized;
}

/**
 * Detects if the transcript is a short voice command (not a question
 * for the semantic pipeline).
 */
function detectCommand(text: string): VoiceCommand | null {
  const trimmed = text.trim();
  for (const { pattern, command } of VOICE_COMMANDS) {
    if (pattern.test(trimmed)) {
      return command;
    }
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Processes a voice transcription from the frontend Web Speech API.
 *
 * Steps:
 * 1. Check for voice commands (clear, repeat, etc.)
 * 2. Remove filler words (um, uh, like, so, etc.)
 * 3. Normalize voice patterns (number words, dollar signs, etc.)
 * 4. Return cleaned text ready for the semantic pipeline
 *
 * The actual voice recording is done on the frontend using the
 * Web Speech API (SpeechRecognition). This function only processes
 * the resulting transcript string.
 *
 * @param tenantId - Tenant context (unused in V1, reserved for future voice models)
 * @param transcript - Raw transcript from speech recognition
 * @param context - Intent context (for date/timezone awareness)
 * @returns VoiceResult with cleaned text and metadata
 */
export function processVoiceTranscription(
  _tenantId: string,
  transcript: string,
  _context: IntentContext,
): VoiceResult {
  const originalText = transcript.trim();

  // 1. Check for voice commands first
  const detectedCommand = detectCommand(originalText);

  // 2. Remove filler words
  const { cleaned: noFillers, count: fillerWordsRemoved } = removeFiller(originalText);

  // 3. Normalize voice patterns
  const cleanedText = normalizeVoicePatterns(noFillers);

  return {
    cleanedText: cleanedText || originalText, // fall back to original if cleaning emptied it
    confidence: 1.0, // Placeholder — real confidence comes from frontend SpeechRecognition
    isVoice: true,
    originalText,
    fillerWordsRemoved,
    detectedCommand,
  };
}
