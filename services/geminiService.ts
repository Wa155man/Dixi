import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData } from "./audioUtils";

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

// We cache audio to avoid hitting the API repeatedly for the same word in a session
const audioCache: Record<string, AudioBuffer> = {};

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

export const playTextToSpeech = async (text: string): Promise<void> => {
  const ctx = getAudioContext();
  const cleanText = text?.trim();

  if (!cleanText) return;
  
  // Browser TTS Fallback function
  const fallbackToBrowserTTS = () => {
    return new Promise<void>((resolve) => {
        // Cancel any pending speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.9;
        utterance.lang = 'en-US'; // Set default language
        
        // Simple heuristic for Hebrew detection to switch voice/lang if needed
        if (/[\u0590-\u05FF]/.test(cleanText)) {
            utterance.lang = 'he-IL';
        }

        utterance.onend = () => resolve();
        utterance.onerror = (e) => {
            console.warn("Browser TTS error:", e);
            resolve();
        };
        window.speechSynthesis.speak(utterance);
    });
  };

  try {
    let buffer = audioCache[cleanText];

    if (!buffer) {
      // Use gemini-2.5-flash as it is more robust for general multimodal output
      // and less prone to "OTHER" finish reasons on simple prompts compared to the preview TTS model.
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", 
        contents: [{ parts: [{ text: `Say the following word or phrase clearly: ${cleanText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO], 
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      
      // Check if the model returned text (e.g. safety refusal or fallback) instead of audio
      if (part?.text) {
          console.warn("Gemini returned text instead of audio. Using fallback.");
          return fallbackToBrowserTTS();
      }

      const base64Audio = part?.inlineData?.data;
      
      if (!base64Audio) {
        console.warn("Gemini returned empty response. Using fallback.");
        return fallbackToBrowserTTS();
      }

      const audioBytes = decode(base64Audio);
      buffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
      audioCache[cleanText] = buffer;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();

    return new Promise((resolve) => {
      source.onended = () => resolve();
    });

  } catch (error) {
    console.warn("Gemini API error, falling back to browser TTS:", error);
    return fallbackToBrowserTTS();
  }
};