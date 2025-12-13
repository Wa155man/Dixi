import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

// =================================================================================
// ERROR BOUNDARY
// =================================================================================
interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-4 text-center" dir="rtl">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
             <div className="text-4xl mb-4">⚠️</div>
             <h2 className="text-xl font-bold text-red-600 mb-2">משהו השתבש</h2>
             <p className="text-gray-600 mb-6 text-sm">האפליקציה נתקלה בשגיאה לא צפויה.</p>
             
             <pre className="text-left text-xs bg-gray-100 p-4 rounded-lg mb-6 overflow-auto max-h-32 text-red-800 dir-ltr font-mono">
               {this.state.error?.message}
             </pre>

             <button 
               onClick={this.handleReset}
               className="w-full bg-red-600 text-white py-3 rounded-xl font-medium hover:bg-red-700 transition-colors shadow-sm"
             >
               אפס נתונים וטען מחדש
             </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// =================================================================================
// TYPES
// =================================================================================
interface WordItem {
  id: string;
  term: string;
  definition?: string;
}

const AppMode = {
  MENU: 'MENU',
  CREATE_LIST: 'CREATE_LIST',
  PREVIEW: 'PREVIEW',
  PRACTICE: 'PRACTICE',
  TEST: 'TEST',
  RESULT: 'RESULT',
};

interface TestResult {
  wordId: string;
  term: string;
  userAnswer: string;
  isCorrect: boolean;
}

// =================================================================================
// UTILS
// =================================================================================
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

const normalizeString = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLowerCase();
};

const checkAnswer = (correct: string, actual: string): boolean => {
  return normalizeString(correct) === normalizeString(actual);
};

// =================================================================================
// SERVICES
// =================================================================================

// --- Audio Utils ---
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Gemini Service ---
let aiClient: GoogleGenAI | null = null;
const getAiClient = () => {
    if (!aiClient) {
        try {
            const apiKey = process.env.API_KEY || '';
            aiClient = new GoogleGenAI({ apiKey });
        } catch (e) {
            console.error("Failed to init AI client", e);
        }
    }
    return aiClient;
};

const audioCache: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return audioContext;
};

const playTextToSpeech = async (text: string): Promise<void> => {
  const ctx = getAudioContext();
  
  // Ensure context is running
  if (ctx.state === 'suspended') {
    try {
        await ctx.resume();
    } catch (e) {
        console.warn("Could not resume audio context", e);
    }
  }

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
      const ai = getAiClient();
      if (!ai) return fallbackToBrowserTTS();
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts", 
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
          return fallbackToBrowserTTS();
      }

      const base64Audio = part?.inlineData?.data;
      if (!base64Audio) {
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


// =================================================================================
// COMPONENTS
// =================================================================================

// --- LandingPage Component ---
interface LandingPageProps {
  hasWords: boolean;
  onCreateList: () => void;
  onLoadList: () => void;
  onContinue: () => void;
  reviewCount: number;
  onLoadReview: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const LandingPage = ({
  hasWords,
  onCreateList,
  onLoadList,
  onContinue,
  reviewCount,
  onLoadReview,
  fileInputRef,
  onFileUpload
}: LandingPageProps) => {
  const [isStarted, setIsStarted] = useState(false);

  const handleStart = async () => {
    try {
      // 1. Resume Audio Context (unlocks playback)
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Removed Mic permission request
      
      setIsStarted(true);
    } catch (e) {
      console.error("Audio context start failed", e);
      setIsStarted(true);
    }
  };

  if (!isStarted) {
      return (
        <div className="text-center max-w-lg mx-auto w-full px-4 flex flex-col items-center justify-center h-full">
            <div className="mb-8 md:mb-12">
                <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-l from-indigo-600 to-purple-600 mb-4 tracking-tight">Dixi</h1>
                <p className="text-gray-500 text-lg md:text-xl font-light">שפר את אוצר המילים והכתיב שלך</p>
            </div>
            
            <button 
                 onClick={handleStart}
                 className="w-full bg-indigo-600 p-8 rounded-3xl shadow-xl hover:bg-indigo-700 hover:shadow-2xl transition-all text-white flex flex-col items-center justify-center gap-4 group ring-4 ring-indigo-50"
             >
                 <span className="text-2xl font-bold">התחל</span>
                 <div className="flex items-center gap-2 text-indigo-100 text-sm">
                    <span>לחץ להפעלת שמע</span>
                    <span className="text-xl">🔊</span>
                 </div>
             </button>
             
             <div className="mt-12 text-xs text-gray-400">
                נדרש אישור דפדפן להפעלת רמקולים
             </div>
        </div>
      );
  }

  return (
    <div className="text-center max-w-lg mx-auto w-full px-4 flex flex-col items-center justify-center h-full animate-fade-in">
      <div className="mb-6 md:mb-8">
        <h1 className="text-4xl font-extrabold text-indigo-600 mb-2">Dixi</h1>
        <p className="text-gray-400">תפריט ראשי</p>
      </div>
      
      <div className="space-y-4 w-full">
          <button 
              onClick={onCreateList}
              className="w-full bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-indigo-500 hover:shadow-md transition-all group flex items-center justify-between"
          >
              <span className="text-lg md:text-xl font-bold text-gray-800 group-hover:text-indigo-600">צור רשימה חדשה</span>
              <span className="text-3xl">📝</span>
          </button>

          <div className="relative w-full">
              <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".json"
                  className="hidden" 
                  onChange={onFileUpload}
              />
              <button 
                  onClick={onLoadList}
                  className="w-full bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-indigo-500 hover:shadow-md transition-all group flex items-center justify-between"
              >
                  <span className="text-lg md:text-xl font-bold text-gray-800 group-hover:text-indigo-600">טען רשימה שמורה</span>
                  <span className="text-3xl">📂</span>
              </button>
          </div>
          
          {reviewCount > 0 && (
             <button 
                 onClick={onLoadReview}
                 className="w-full bg-amber-50 p-6 rounded-2xl shadow-sm border-2 border-amber-200 hover:border-amber-400 hover:shadow-md transition-all group flex items-center justify-between"
             >
                 <span className="text-lg md:text-xl font-bold text-gray-800 group-hover:text-amber-700">תרגל מילים לסקירה ({reviewCount})</span>
                 <span className="text-3xl">⭐</span>
             </button>
          )}

          {hasWords && (
               <button 
                  onClick={onContinue}
                  className="w-full bg-indigo-600 p-6 rounded-2xl shadow-lg hover:bg-indigo-700 transition-all text-white flex items-center justify-between ring-4 ring-indigo-100"
              >
                  <span className="text-lg md:text-xl font-bold">המשך עם הרשימה</span>
                  <span className="text-3xl">👉</span>
              </button>
          )}
      </div>
      
      <div className="mt-8 text-xs text-gray-400">
        גרסה 2.3
      </div>
    </div>
  );
};

// --- InputSection Component ---
interface InputSectionProps {
  onSave: (list: WordItem[]) => void;
  onCancel: () => void;
  initialList?: WordItem[];
}

const InputSection: React.FC<InputSectionProps> = ({ onSave, onCancel, initialList }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'paste' | 'pairs'>('manual');
  
  const [manualInputs, setManualInputs] = useState<{term: string}[]>(() => {
     if (initialList && initialList.length > 0) {
        return initialList.map(w => ({term: w.term}));
     }
     // Create exactly 10 rows
     return Array.from({ length: 10 }).map(() => ({ term: '' }));
  });

  const [pasteContent, setPasteContent] = useState('');
  const [pairsContent, setPairsContent] = useState('');

  const handleManualChange = (index: number, value: string) => {
    setManualInputs(prev => {
        const newInputs = [...prev];
        newInputs[index] = { term: value };
        return newInputs;
    });
  };

  const addMoreManual = () => {
    // Add 10 more rows
    setManualInputs(prev => [...prev, ...Array.from({ length: 10 }).map(() => ({ term: '' }))]);
  };

  const processAndSave = () => {
    let finalList: WordItem[] = [];

    if (activeTab === 'manual') {
      finalList = manualInputs
        .filter(item => item.term.trim() !== '')
        .map(item => ({ id: generateId(), term: item.term.trim() }));
    } else if (activeTab === 'paste') {
      finalList = pasteContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
        .map(line => ({ id: generateId(), term: line }));
    } else if (activeTab === 'pairs') {
      finalList = pairsContent
        .split('\n')
        .map(line => {
          const parts = line.split('-');
          if (parts.length >= 2) {
            return {
              id: generateId(),
              term: parts[0].trim(),
              definition: parts.slice(1).join('-').trim()
            };
          }
          return null;
        })
        .filter((item): item is WordItem => item !== null);
    }

    if (finalList.length === 0) {
      alert("אנא הזן לפחות מילה אחת.");
      return;
    }

    onSave(finalList);
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg w-full max-w-4xl mx-auto flex flex-col h-full max-h-[85dvh]">
      <h2 className="text-xl md:text-2xl font-bold mb-4 text-indigo-700 shrink-0">יצירת רשימה</h2>
      
      <div className="flex flex-wrap border-b border-gray-200 mb-4 gap-1 shrink-0">
        <button
          className={`py-2 px-3 text-sm md:text-base font-medium transition-colors rounded-t-lg ${activeTab === 'manual' ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('manual')}
        >
          הזנה ידנית (10 מילים)
        </button>
        <button
          className={`py-2 px-3 text-sm md:text-base font-medium transition-colors rounded-t-lg ${activeTab === 'paste' ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('paste')}
        >
          הדבק רשימה
        </button>
        <button
          className={`py-2 px-3 text-sm md:text-base font-medium transition-colors rounded-t-lg ${activeTab === 'pairs' ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('pairs')}
        >
          זוגות
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pl-2 custom-scrollbar">
        {activeTab === 'manual' && (
          <div className="space-y-3 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {manualInputs.map((input, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm w-6 text-center">{idx + 1}.</span>
                  <input
                    type="text"
                    value={input.term}
                    onChange={(e) => handleManualChange(idx, e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-3 md:py-2 text-base focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="הקלד מילה"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={addMoreManual}
              className="mt-4 w-full sm:w-auto py-3 sm:py-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-1 border border-indigo-100 rounded-lg bg-indigo-50"
            >
              + הוסף 10 שורות נוספות
            </button>
          </div>
        )}

        {activeTab === 'paste' && (
          <div className="h-full pb-4">
            <textarea
              className="w-full h-full p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-base"
              placeholder="הדבק את רשימת המילים כאן, כל מילה בשורה חדשה..."
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
            />
          </div>
        )}

        {activeTab === 'pairs' && (
          <div className="h-full pb-4">
            <div className="mb-2 text-sm text-gray-500">פורמט: מילה - הגדרה (אחת בכל שורה)</div>
            <textarea
              className="w-full h-full p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-base"
              placeholder={'תפוח - פרי עגול ואדום\nפיל - חיה גדולה עם חדק'}
              value={pairsContent}
              onChange={(e) => setPairsContent(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="mt-4 shrink-0 flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onCancel}
          className="px-6 py-3 md:py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors text-sm md:text-base"
        >
          ביטול
        </button>
        <button
          onClick={processAndSave}
          className="px-6 py-3 md:py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors shadow-sm text-sm md:text-base"
        >
          צור רשימה
        </button>
      </div>
    </div>
  );
};

// --- PracticeMode Component ---
interface PracticeModeProps {
  words: WordItem[];
  onBack: () => void;
  onAddToReview: (word: WordItem) => void;
}

const PracticeMode: React.FC<PracticeModeProps> = ({ words, onBack, onAddToReview }) => {
  const [queue, setQueue] = useState<WordItem[]>(words);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Safety check
  if (!queue || queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
         <p className="text-gray-500 mb-4">אין מילים לתרגול.</p>
         <button onClick={onBack} className="text-indigo-600">חזרה</button>
      </div>
    );
  }

  const currentWord = queue[currentIndex];
  // Guard against index out of bounds if queue changes unexpectedly
  if (!currentWord) return null;

  const handleNext = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % queue.length);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + queue.length) % queue.length);
  };

  const handleForgot = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(false);
    
    const newQueue = [...queue, currentWord];
    setQueue(newQueue);
    
    setCurrentIndex((prev) => (prev + 1) % newQueue.length);
  };

  const handleSaveForReview = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToReview(currentWord);
    handleNext();
  };

  const handleSpeak = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    
    setIsPlaying(true);
    const textToSpeak = (isFlipped && currentWord.definition) ? currentWord.definition : currentWord.term;
    await playTextToSpeech(textToSpeak);
    setIsPlaying(false);
  };

  const hasDefinition = !!currentWord.definition;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full max-w-2xl mx-auto p-4">
       <div className="flex justify-between w-full mb-6 items-center">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1">
          &rarr; חזרה
        </button>
        <span className="text-gray-400 font-mono" dir="ltr">
          {currentIndex + 1} / {queue.length}
        </span>
      </div>

      <div 
        className="relative w-full aspect-[3/2] cursor-pointer perspective-1000 group"
        onClick={() => hasDefinition && setIsFlipped(!isFlipped)}
      >
        <div className={`relative w-full h-full duration-500 transform-style-3d shadow-xl rounded-2xl ${isFlipped ? 'rotate-y-180' : ''}`}>
          
          {/* Front Side */}
          <div className="absolute w-full h-full bg-white rounded-2xl p-8 flex flex-col items-center justify-center backface-hidden border-2 border-indigo-50">
             <div className="text-sm uppercase tracking-widest text-indigo-400 mb-4 font-bold">
                {hasDefinition ? 'מונח' : 'מילה'}
             </div>
             <h3 className="text-4xl md:text-5xl font-bold text-gray-800 text-center break-words max-w-full">
               {currentWord.term}
             </h3>
             {hasDefinition && (
               <p className="absolute bottom-4 text-gray-400 text-sm animate-pulse">לחץ כדי להפוך</p>
             )}
              <button 
                onClick={handleSpeak}
                disabled={isPlaying}
                className="absolute top-4 left-4 p-3 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors z-10"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </button>
          </div>

          {/* Back Side (Definition) */}
          <div className="absolute w-full h-full bg-indigo-600 rounded-2xl p-8 flex flex-col items-center justify-center backface-hidden rotate-y-180">
            <div className="text-sm uppercase tracking-widest text-indigo-200 mb-4 font-bold">הגדרה</div>
            <p className="text-2xl md:text-3xl font-medium text-white text-center leading-relaxed">
              {currentWord.definition}
            </p>
             <button 
                onClick={handleSpeak}
                disabled={isPlaying}
                className="absolute top-4 left-4 p-3 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white transition-colors z-10"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 mt-8 w-full justify-center items-center">
        <button 
          onClick={handlePrev}
          className="col-span-1 bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-50 font-medium transition-all shadow-sm w-full sm:w-28"
        >
          הקודם
        </button>
        <button 
          onClick={handleForgot}
          className="col-span-1 bg-orange-50 text-orange-700 border border-orange-200 px-4 py-3 rounded-xl hover:bg-orange-100 font-medium transition-all shadow-sm w-full sm:w-auto flex items-center justify-center gap-1"
        >
          <span className="text-lg">↺</span>
          שוב
        </button>
        <button 
          onClick={handleSaveForReview}
          className="col-span-1 bg-teal-50 text-teal-700 border border-teal-200 px-4 py-3 rounded-xl hover:bg-teal-100 font-medium transition-all shadow-sm w-full sm:w-auto flex items-center justify-center gap-1"
        >
          <span className="text-lg">⭐</span>
          לסקירה
        </button>
        <button 
          onClick={handleNext}
          className="col-span-1 bg-indigo-600 text-white px-4 py-3 rounded-xl hover:bg-indigo-700 font-medium transition-all shadow-md w-full sm:w-28"
        >
          הבא
        </button>
      </div>
    </div>
  );
};

// --- TestMode Component ---
interface TestModeProps {
  words: WordItem[];
  onComplete: (results: TestResult[]) => void;
  onCancel: () => void;
}

const TestMode: React.FC<TestModeProps> = ({ words, onComplete, onCancel }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Guard clause
  if (!words || words.length === 0) {
     return (
        <div className="flex flex-col items-center justify-center h-full">
            <p className="text-gray-500 mb-4">אין מילים למבחן.</p>
            <button onClick={onCancel} className="text-indigo-600">חזרה</button>
        </div>
     );
  }

  const currentWord = words[currentIndex];
  // Safe guard
  if (!currentWord) return null;

  useEffect(() => {
    setUserInput('');
    if (testStarted) {
      const timer = setTimeout(() => {
        playAudio();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, testStarted]);

  const playAudio = async () => {
    if (isPlaying) return;

    if (!testStarted) {
      setTestStarted(true);
    }

    setIsPlaying(true);
    const textToSpeak = currentWord.definition ? currentWord.definition : currentWord.term;
    await playTextToSpeech(textToSpeak);
    setIsPlaying(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isCorrect = checkAnswer(currentWord.term, userInput);
    
    const newResult: TestResult = {
      wordId: currentWord.id,
      term: currentWord.term,
      userAnswer: userInput,
      isCorrect,
    };

    const newResults = [...results, newResult];
    setResults(newResults);

    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onComplete(newResults);
    }
  };

  return (
    <div className="max-w-xl mx-auto w-full px-4">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-700">מבחן הכתבה</h2>
        <span className="text-sm font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded" dir="ltr">
          {currentIndex + 1} / {words.length}
        </span>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center">
        <button 
            onClick={playAudio}
            disabled={isPlaying}
            className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 transition-all duration-300 ${
                isPlaying 
                ? 'bg-indigo-100 text-indigo-600 scale-110 ring-4 ring-indigo-200' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/30'
            }`}
        >
             {isPlaying ? (
                 <div className="flex gap-1 h-8 items-center">
                    <div className="w-1 bg-current animate-[pulse_0.6s_ease-in-out_infinite] h-4"></div>
                    <div className="w-1 bg-current animate-[pulse_0.6s_ease-in-out_0.2s_infinite] h-8"></div>
                    <div className="w-1 bg-current animate-[pulse_0.6s_ease-in-out_0.4s_infinite] h-4"></div>
                 </div>
             ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
             )}
        </button>

        <p className="text-gray-500 text-sm mb-6 text-center">
          {!testStarted
            ? "לחץ על הרמקול כדי להתחיל."
            : currentWord.definition 
                ? "הקשב להגדרה והקלד את המילה." 
                : "הקשב למילה והקלד אותה."}
        </p>

        <form onSubmit={handleSubmit} className="w-full">
            <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="הקלד את התשובה..."
                className="w-full text-center text-xl p-4 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors mb-6"
                autoComplete="off"
                autoCapitalize="off"
            />
            
            <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-transform active:scale-95 shadow-md"
            >
                שלח תשובה
            </button>
        </form>
      </div>

      <div className="mt-6 text-center">
        <button 
            onClick={onCancel} 
            className="text-gray-400 hover:text-red-500 text-sm font-medium transition-colors"
        >
            בטל מבחן
        </button>
      </div>
    </div>
  );
};

// --- ResultScreen Component ---
interface ResultScreenProps {
  results: TestResult[];
  onHome: () => void;
  onRetry: () => void;
}

const ResultScreen: React.FC<ResultScreenProps> = ({ results, onHome, onRetry }) => {
  const correctCount = results.filter(r => r.isCorrect).length;
  const percentage = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-6 md:p-10 flex flex-col h-[85vh]">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">המבחן הסתיים!</h2>
        <div className="flex items-center justify-center gap-4" dir="ltr">
             <div className="text-6xl font-bold text-indigo-600">{percentage}%</div>
             <div className="text-gray-500 text-sm text-right">
                <div className="font-semibold text-gray-700">{correctCount} / {results.length}</div>
                <div>תשובות נכונות</div>
             </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pl-2 mb-6">
        <table className="w-full text-right border-collapse">
            <thead className="sticky top-0 bg-white z-10 border-b-2 border-gray-100">
                <tr>
                    <th className="py-3 px-2 text-gray-500 font-medium text-sm">שאלה</th>
                    <th className="py-3 px-2 text-gray-500 font-medium text-sm">התשובה שלך</th>
                    <th className="py-3 px-2 text-gray-500 font-medium text-sm text-left">סטטוס</th>
                </tr>
            </thead>
            <tbody>
                {results.map((result, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="py-4 px-2 font-medium text-gray-800">{result.term}</td>
                        <td className={`py-4 px-2 font-mono ${result.isCorrect ? 'text-green-600' : 'text-red-500 line-through'}`}>
                            {result.userAnswer || <span className="text-gray-300 italic">ריק</span>}
                        </td>
                        <td className="py-4 px-2 text-left">
                            {result.isCorrect ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    נכון
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    שגוי
                                </span>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-4 pt-4 border-t border-gray-100">
        <button 
            onClick={onHome}
            className="px-8 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition-colors"
        >
            חזרה לתפריט
        </button>
        <button 
            onClick={onRetry}
            className="px-8 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors shadow-md"
        >
            נסה שוב
        </button>
      </div>
    </div>
  );
};

// =================================================================================
// MAIN APP COMPONENT
// =================================================================================
const App = () => {
  const [words, setWords] = useState<WordItem[]>([]);
  
  const [reviewWords, setReviewWords] = useState<WordItem[]>(() => {
    try {
        const saved = localStorage.getItem('dixi_review_words');
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [mode, setMode] = useState<string>(AppMode.MENU);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateUrl = (newMode: string, replace = false) => {
    const url = new URL(window.location.href);
    if (newMode === AppMode.MENU) {
        url.searchParams.delete('page');
    } else {
        url.searchParams.set('page', newMode);
    }
    
    if (url.href !== window.location.href) {
        const stateAction = replace ? window.history.replaceState : window.history.pushState;
        stateAction.call(window.history, {}, '', url.toString());
    }
  };

  useEffect(() => {
    try {
      const savedWords = localStorage.getItem('dixi_words');
      let loadedWords: WordItem[] = [];
      if (savedWords) {
        loadedWords = JSON.parse(savedWords);
        setWords(loadedWords);
      }

      const redirectPath = sessionStorage.getItem('redirect');
      if (redirectPath) {
        sessionStorage.removeItem('redirect');
        const redirectUrl = new URL(redirectPath);
        const page = redirectUrl.searchParams.get('page') || AppMode.MENU;

        if (Object.values(AppMode).includes(page)) {
          if ([AppMode.PRACTICE, AppMode.TEST, AppMode.PREVIEW].includes(page) && loadedWords.length === 0) {
            setMode(AppMode.MENU);
            updateUrl(AppMode.MENU, true);
          } else {
            setMode(page);
            window.history.replaceState({}, '', redirectUrl.toString());
          }
          return;
        }
      }

      const params = new URLSearchParams(window.location.search);
      const page = params.get('page') || AppMode.MENU;
      
      if (Object.values(AppMode).includes(page)) {
        if ([AppMode.PRACTICE, AppMode.TEST, AppMode.PREVIEW].includes(page) && loadedWords.length === 0) {
           setMode(AppMode.MENU);
           updateUrl(AppMode.MENU, true);
        } else {
           setMode(page);
        }
      }
    } catch (e) {
      console.error("Error initializing app:", e);
    }
  }, []);

  useEffect(() => {
    if (words.length > 0) {
      localStorage.setItem('dixi_words', JSON.stringify(words));
    }
  }, [words]);

  useEffect(() => {
    localStorage.setItem('dixi_review_words', JSON.stringify(reviewWords));
  }, [reviewWords]);

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    updateUrl(newMode);
  };

  const handleSaveList = (newList: WordItem[]) => {
    setWords(newList);
    handleModeChange(AppMode.PREVIEW);
  };

  const handleAddToReview = (word: WordItem) => {
    setReviewWords(prev => {
        if (prev.some(w => w.term === word.term)) return prev;
        return [...prev, word];
    });
  };

  const handleLoadReview = () => {
      if (reviewWords.length === 0) return;
      setWords(reviewWords);
      handleModeChange(AppMode.PREVIEW);
  };

  const downloadList = () => {
    const dataStr = JSON.stringify(words, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'dixi_list.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const uploadList = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files.length > 0) {
        fileReader.readAsText(e.target.files[0], "UTF-8");
        fileReader.onload = (event) => {
            if(event.target?.result) {
                try {
                    const parsed = JSON.parse(event.target.result as string);
                    if(Array.isArray(parsed)) {
                        setWords(parsed);
                        handleModeChange(AppMode.PREVIEW);
                    }
                } catch (err) {
                    alert("קובץ לא תקין");
                }
            }
        };
        // Reset file input so the same file can be selected again
        e.target.value = '';
    }
  };

  const renderContent = () => {
    switch (mode) {
      case AppMode.CREATE_LIST:
        return <InputSection onSave={handleSaveList} onCancel={() => handleModeChange(AppMode.MENU)} initialList={words} />;
      case AppMode.PRACTICE:
        return <PracticeMode words={words} onBack={() => handleModeChange(AppMode.PREVIEW)} onAddToReview={handleAddToReview} />;
      case AppMode.TEST:
        return <TestMode words={words} onComplete={(results: TestResult[]) => { setTestResults(results); handleModeChange(AppMode.RESULT); }} onCancel={() => handleModeChange(AppMode.PREVIEW)} />;
      case AppMode.RESULT:
        return <ResultScreen results={testResults} onHome={() => handleModeChange(AppMode.MENU)} onRetry={() => handleModeChange(AppMode.TEST)} />;
      case AppMode.PREVIEW:
        return (
          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 max-w-4xl w-full mx-auto flex flex-col h-full max-h-[85dvh]">
            <div className="flex justify-between items-center mb-4 md:mb-6 shrink-0">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">סקירת מילים</h2>
                <div className="flex gap-2">
                     <button onClick={downloadList} className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded text-sm font-medium">שמור</button>
                     <button onClick={() => handleModeChange(AppMode.CREATE_LIST)} className="text-gray-600 hover:bg-gray-100 px-3 py-2 rounded text-sm font-medium">ערוך</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-lg border-gray-200">
                <table className="w-full text-right">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                            <th className="p-3 text-xs font-semibold tracking-wide text-gray-500 uppercase border-b">מילה</th>
                            <th className="p-3 text-xs font-semibold tracking-wide text-gray-500 uppercase border-b">הגדרה</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {words.map(w => (
                            <tr key={w.id} className="hover:bg-gray-50">
                                <td className="p-3 text-gray-800 font-medium">{w.term}</td>
                                <td className="p-3 text-gray-600 text-sm">{w.definition || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 md:mt-6 shrink-0 flex flex-col-reverse md:flex-row justify-between gap-3">
                <button onClick={() => handleModeChange(AppMode.MENU)} className="w-full md:w-auto px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl">חזרה</button>
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <button onClick={() => handleModeChange(AppMode.PRACTICE)} className="w-full md:w-auto px-6 py-3 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200 transition-colors">תרגול כרטיסיות</button>
                    <button onClick={() => handleModeChange(AppMode.TEST)} className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all">התחל מבחן</button>
                </div>
            </div>
          </div>
        );
      case AppMode.MENU:
      default:
        return <LandingPage hasWords={words.length > 0} onCreateList={() => handleModeChange(AppMode.CREATE_LIST)} onLoadList={() => fileInputRef.current?.click()} onContinue={() => handleModeChange(AppMode.PREVIEW)} fileInputRef={fileInputRef} onFileUpload={uploadList} reviewCount={reviewWords.length} onLoadReview={handleLoadReview}/>;
    }
  };

  return (
    <div className="h-[100dvh] bg-slate-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 py-3 md:py-4 px-4 md:px-6 shrink-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold text-indigo-600 cursor-pointer" onClick={() => handleModeChange(AppMode.MENU)}>Dixi</h1>
            {mode !== AppMode.MENU && (
                <button onClick={() => handleModeChange(AppMode.MENU)} className="text-sm text-gray-500 hover:text-indigo-600">
                    יציאה
                </button>
            )}
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-2 md:p-4 w-full relative">
        {renderContent()}
      </main>
    </div>
  );
}

// =================================================================================
// RENDER APP
// =================================================================================
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (e) {
  console.error("Failed to render app", e);
}