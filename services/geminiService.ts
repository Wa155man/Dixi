import { GoogleGenAI, Modality } from "@google/genai";

// Access global utils
const { decode, decodeAudioData } = (window as any).Dixi.services.audioUtils;

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

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

const playTextToSpeech = async (text: string): Promise<void> => {
  const ctx = getAudioContext();
  const cleanText = text?.trim();

  if (!cleanText) return;
  
  const fallbackToBrowserTTS = () => {
    return new Promise<void>((resolve) => {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.9;
        utterance.lang = 'en-US'; 
        
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

// Expose to global namespace
(window as any).Dixi.services.geminiService = {
  playTextToSpeech
};