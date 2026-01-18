import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// =================================================================================
// TYPES & CONSTANTS
// =================================================================================

const AppMode = {
  MENU: 'MENU',
  CREATE_LIST: 'CREATE_LIST',
  PREVIEW: 'PREVIEW',
  PRACTICE: 'PRACTICE',
  TEST: 'TEST',
  RESULT: 'RESULT',
} as const;

type Mode = typeof AppMode[keyof typeof AppMode];

interface WordItem {
  id: string;
  term: string;
  definition?: string;
  nikud?: string; // Word with Hebrew vowels
}

interface TestResult {
  wordId: string;
  term: string;
  userAnswer: string;
  isCorrect: boolean;
}

// =================================================================================
// UTILITIES
// =================================================================================

const generateId = () => Math.random().toString(36).substring(2, 9);

const normalizeString = (str: string) => {
  if (!str) return '';
  // Remove Hebrew Nikud and standard punctuation for comparison
  const withoutNikud = str.replace(/[\u0591-\u05C7]/g, "");
  return withoutNikud.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "").replace(/\s{2,}/g, " ").trim().toLowerCase();
};

const checkAnswer = (correct: string, actual: string) => normalizeString(correct) === normalizeString(actual);

// =================================================================================
// NATIVE TTS SERVICE (Standalone - Optimized for High Quality & Hebrew)
// =================================================================================

let currentUtterance: SpeechSynthesisUtterance | null = null;

const playTTS = (text: string, onPlayStateChange?: (playing: boolean) => void): void => {
  const cleanText = text?.trim();
  if (!cleanText || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  currentUtterance = utterance; 
  
  const isHebrew = /[\u0590-\u05FF]/.test(cleanText);
  // Some browsers use iw-IL, others use he-IL
  utterance.lang = isHebrew ? 'he-IL' : 'en-US';
  
  const voices = window.speechSynthesis.getVoices();
  const femaleVoiceKeywords = ['google', 'siri', 'natural', 'premium', 'samantha', 'victoria', 'heather', 'karen', 'carmit', 'עברית'];
  
  const sortedVoices = voices
    .filter(v => {
        const lowerLang = v.lang.toLowerCase();
        // Check for both modern 'he' and legacy 'iw' Hebrew codes
        if (isHebrew) {
            return lowerLang.startsWith('he') || lowerLang.startsWith('iw');
        }
        return lowerLang.startsWith('en');
    })
    .sort((a, b) => {
      const getScore = (voice: SpeechSynthesisVoice) => {
        const name = voice.name.toLowerCase();
        let score = 0;
        if (femaleVoiceKeywords.some(k => name.includes(k))) score += 10;
        if (name.includes('natural') || name.includes('premium') || name.includes('enhanced')) score += 20;
        if (name.includes('google')) score += 15;
        if (voice.localService) score += 5;
        return score;
      };
      return getScore(b) - getScore(a);
    });

  if (sortedVoices.length > 0) {
    utterance.voice = sortedVoices[0];
  }

  // Soft, girly tone settings
  utterance.rate = 0.82;   
  utterance.pitch = 1.18;  
  utterance.volume = 1.0;

  utterance.onstart = () => onPlayStateChange?.(true);
  utterance.onend = () => {
    onPlayStateChange?.(false);
    currentUtterance = null;
  };
  utterance.onerror = (e) => {
    console.error("SpeechSynthesis Error:", e);
    onPlayStateChange?.(false);
    currentUtterance = null;
  };

  setTimeout(() => {
    window.speechSynthesis.speak(utterance);
  }, 50);
};

// =================================================================================
// GEMINI SERVICE
// =================================================================================

// Fix: Corrected typing of 'words' parameter and return object to include 'nikud' to avoid TS errors in handleVocalize.
const vocalizeWords = async (words: {term: string, definition: string, nikud?: string}[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const hebrewWords = words.filter(w => /[\u0590-\u05FF]/.test(w.term)).map(w => w.term);
  
  if (hebrewWords.length === 0) return words;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `For the following list of Hebrew words, provide the version with full Nikud (vowels). 
    Words: ${hebrewWords.join(", ")}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            original: { type: Type.STRING },
            nikud: { type: Type.STRING, description: "Word with full Hebrew vowels (Nikud)" }
          },
          required: ["original", "nikud"]
        }
      }
    }
  });

  try {
    const nikudMap: Record<string, string> = {};
    const data = JSON.parse(response.text || '[]');
    data.forEach((item: any) => {
      nikudMap[item.original] = item.nikud;
    });

    return words.map(w => ({
      ...w,
      nikud: nikudMap[w.term] || w.nikud || w.term
    }));
  } catch (e) {
    console.error("Failed to parse Nikud response", e);
    return words;
  }
};

// =================================================================================
// COMPONENTS
// =================================================================================

const SpeakerIcon = ({ className = "h-8 w-8", isPlaying = false }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`${className} ${isPlaying ? 'animate-pulse scale-110 text-indigo-400' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

const LandingPage = ({ hasWords, onCreate, onFileSelect, onContinue, reviewCount, onLoadReview }: any) => (
  <div className="text-center max-w-lg mx-auto px-4 flex flex-col items-center justify-center h-full space-y-8 animate-screen-entry">
    <div className="mb-4">
      <div className="bg-indigo-600 text-white w-20 h-20 rounded-3xl flex items-center justify-center font-black text-4xl shadow-2xl mx-auto mb-6 rotate-3">D</div>
      <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2">Dixi</h1>
      <p className="text-slate-500 font-medium text-lg">עוזר הכתבה חכם ללימוד מילים</p>
    </div>
    <div className="w-full space-y-4">
      <button onClick={onCreate} className="w-full bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-indigo-500 flex justify-between items-center group transition-all transform active:scale-95">
        <span className="text-xl font-bold text-slate-800 group-hover:text-indigo-600">צור רשימה חדשה</span>
        <span className="text-3xl">📝</span>
      </button>
      <button onClick={onFileSelect} className="w-full bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-indigo-500 flex justify-between items-center group transition-all transform active:scale-95">
        <span className="text-xl font-bold text-slate-800 group-hover:text-indigo-600">טען קובץ רשימה</span>
        <span className="text-3xl">📂</span>
      </button>
      {reviewCount > 0 && (
        <button onClick={onLoadReview} className="w-full bg-amber-50 p-6 rounded-2xl border-2 border-amber-200 hover:border-amber-400 flex justify-between items-center group transition-all transform active:scale-95">
          <span className="text-xl font-bold text-slate-800 group-hover:text-amber-700">מילים לסקירה ({reviewCount})</span>
          <span className="text-3xl">⭐</span>
        </button>
      )}
      {hasWords && (
        <button onClick={onContinue} className="w-full bg-indigo-600 p-6 rounded-2xl text-white shadow-xl hover:bg-indigo-700 flex justify-between items-center transition-all transform active:scale-95 ring-4 ring-indigo-50">
          <span className="text-xl font-bold">המשך לרשימה שלי</span>
          <span className="text-3xl">🚀</span>
        </button>
      )}
    </div>
  </div>
);

const InputSection = ({ onSave, onCancel, initialList }: any) => {
  const [tab, setTab] = useState('manual');
  const [loadingNikud, setLoadingNikud] = useState(false);
  const [inputs, setInputs] = useState(() => {
    let list = initialList?.length ? initialList.map((w: any) => ({term: w.term, definition: w.definition || '', nikud: w.nikud || ''})) : [];
    while (list.length < 10) list.push({ term: '', definition: '', nikud: '' });
    return list;
  });
  const [paste, setPaste] = useState('');

  // Fix: Improved update logic using a mapping strategy to correctly align vocalized results with the original word entries.
  const handleVocalize = async () => {
    setLoadingNikud(true);
    try {
      const itemsToVocalize = inputs.filter(i => i.term.trim());
      const vocalized = await vocalizeWords(itemsToVocalize);
      
      const newInputs = inputs.map(input => {
        // Find matching vocalized word by term
        const found = vocalized.find(v => v.term === input.term);
        return found ? { ...input, nikud: found.nikud } : input;
      });
      setInputs(newInputs);
    } catch (e) {
      alert("שגיאה בהוספת ניקוד");
    } finally {
      setLoadingNikud(false);
    }
  };

  const process = () => {
    const list = inputs.filter((i: any) => i.term.trim()).map((i: any) => ({ 
      id: generateId(), 
      term: i.term.trim(), 
      definition: i.definition?.trim(),
      nikud: i.nikud || i.term.trim()
    }));
    if (!list.length) return alert('הזן לפחות מילה אחת');
    onSave(list);
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-xl w-full max-w-5xl mx-auto flex flex-col h-[85vh] animate-screen-entry overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 shrink-0 gap-4">
        <div>
          <h2 className="text-3xl font-black text-indigo-800">בניית רשימת הכתבה</h2>
          <p className="text-slate-400 font-medium">הזן מילים והגדרות לתרגול. ניתן להוסיף ניקוד אוטומטית!</p>
        </div>
        <div className="flex bg-slate-100 rounded-2xl p-1 w-full md:w-auto">
          <button onClick={() => setTab('manual')} className={`flex-1 md:flex-none px-8 py-3 rounded-xl text-sm font-bold transition-all ${tab === 'manual' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>ידני</button>
          <button onClick={() => setTab('paste')} className={`flex-1 md:flex-none px-8 py-3 rounded-xl text-sm font-bold transition-all ${tab === 'paste' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>הדבקה</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
        {tab === 'manual' ? (
          <div className="space-y-4 pr-1">
            <div className="hidden md:grid grid-cols-[30px_1fr_1fr_1fr_50px] gap-4 px-2 text-slate-400 font-bold text-sm">
              <span>#</span>
              <span>המילה</span>
              <span>עם ניקוד (אופציונלי)</span>
              <span>הגדרה / הסבר</span>
              <span></span>
            </div>
            {inputs.map((inp, i) => (
              <div key={i} className="flex flex-col md:grid md:grid-cols-[30px_1fr_1fr_1fr_50px] gap-3 md:gap-4 items-center bg-slate-50/50 p-3 md:p-0 rounded-2xl md:bg-transparent">
                <span className="hidden md:block w-6 text-slate-300 font-bold text-center">{i+1}</span>
                <input 
                  placeholder="המילה..." 
                  className="w-full border-2 border-slate-100 rounded-2xl px-5 py-4 focus:border-indigo-500 focus:bg-white outline-none text-lg font-bold transition-all" 
                  value={inp.term} 
                  onChange={e => {
                    const n = [...inputs]; n[i].term = e.target.value; setInputs(n);
                  }} 
                />
                <input 
                  placeholder="ניקוד..." 
                  className="w-full border-2 border-slate-100 rounded-2xl px-5 py-4 focus:border-indigo-500 focus:bg-white outline-none text-lg font-medium text-indigo-600 transition-all" 
                  value={inp.nikud} 
                  onChange={e => {
                    const n = [...inputs]; n[i].nikud = e.target.value; setInputs(n);
                  }} 
                />
                <input 
                  placeholder="הגדרה..." 
                  className="w-full border-2 border-slate-100 rounded-2xl px-5 py-4 focus:border-indigo-500 focus:bg-white outline-none text-lg transition-all" 
                  value={inp.definition} 
                  onChange={e => {
                    const n = [...inputs]; n[i].definition = e.target.value; setInputs(n);
                  }} 
                />
                <button 
                  onClick={() => {
                    const n = inputs.filter((_, idx) => idx !== i);
                    setInputs(n);
                  }}
                  className="hidden md:flex p-3 text-rose-300 hover:text-rose-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
            <div className="flex gap-4">
              <button onClick={() => setInputs([...inputs, ...Array(5).fill({term:'', definition:'', nikud:''})])} className="flex-1 py-5 text-indigo-600 border-2 border-dashed border-indigo-100 bg-indigo-50/30 rounded-2xl font-black hover:bg-indigo-50 transition-all">+ הוסף עוד שורות</button>
              <button 
                onClick={handleVocalize} 
                disabled={loadingNikud}
                className="flex-1 py-5 text-amber-700 border-2 border-dashed border-amber-100 bg-amber-50/30 rounded-2xl font-black hover:bg-amber-100 transition-all disabled:opacity-50"
              >
                {loadingNikud ? 'מנקד... ✨' : 'הוסף ניקוד אוטומטית ✨'}
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <p className="mb-4 text-sm text-slate-400">הדבק רשימה (מילה - הגדרה) או פשוט רשימת מילים שורה אחר שורה</p>
            <textarea className="flex-1 w-full border-2 border-slate-100 rounded-3xl p-6 font-mono focus:border-indigo-500 outline-none text-xl resize-none leading-relaxed" placeholder="תפוח&#10;בננה - פרי צהוב ומזין&#10;חתול - חיה בעלת פרווה שאוהבת לישון" value={paste} onChange={e => setPaste(e.target.value)} />
          </div>
        )}
      </div>
      <div className="mt-8 pt-6 border-t flex flex-col md:flex-row justify-end gap-4 shrink-0">
        <button onClick={onCancel} className="px-10 py-4 rounded-2xl text-slate-500 font-bold hover:bg-slate-100 transition-colors">ביטול</button>
        <button onClick={process} className="px-16 py-4 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200">שמור רשימה</button>
      </div>
    </div>
  );
};

const PracticeMode = ({ words, onBack, onMark }: any) => {
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [playing, setPlaying] = useState(false);
  const word = words[idx];

  const next = () => { setFlip(false); setIdx((idx + 1) % words.length); };
  const prev = () => { setFlip(false); setIdx((idx - 1 + words.length) % words.length); };
  
  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    playTTS(flip && word.definition ? word.definition : word.term, setPlaying);
  };

  return (
    <div className="max-w-2xl w-full mx-auto p-4 flex flex-col h-[75vh] justify-center animate-screen-entry">
      <div className="flex justify-between items-center mb-8">
        <button onClick={onBack} className="bg-white px-5 py-2 rounded-xl text-indigo-600 font-bold shadow-sm border border-slate-100">← חזרה</button>
        <span className="text-slate-400 font-black text-lg">{idx + 1} / {words.length}</span>
      </div>
      <div 
        onClick={() => word.definition && setFlip(!flip)} 
        className="relative flex-1 bg-white rounded-[3rem] shadow-2xl flex flex-col items-center justify-center p-12 cursor-pointer border-4 border-white perspective-1000 group overflow-hidden"
      >
        <div className={`w-full h-full transform-style-3d transition-transform duration-500 ${flip ? 'rotate-y-180' : ''}`}>
           <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center bg-white p-8 text-center">
              <div className="text-indigo-400 font-black uppercase tracking-widest mb-6 opacity-50">המילה</div>
              <h2 className="text-6xl md:text-8xl font-black text-slate-800 break-words w-full leading-tight">{word.nikud || word.term}</h2>
              {word.definition && (
                <div className="mt-12 flex items-center gap-2 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-full font-bold animate-pulse text-sm">
                   <span>הקש כדי לראות הגדרה</span>
                   <span>🔄</span>
                </div>
              )}
           </div>
           <div className="absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-3xl text-center">
              <div className="text-indigo-200 font-black uppercase tracking-widest mb-6 opacity-50">הגדרה</div>
              <h2 className="text-3xl md:text-5xl font-bold text-white break-words w-full leading-relaxed">{word.definition}</h2>
           </div>
        </div>
        <div className="absolute top-8 left-8 z-20">
          <button 
            onClick={handlePlay} 
            className={`p-6 bg-indigo-600 text-white rounded-3xl shadow-xl hover:scale-110 active:scale-95 transition-all ${playing ? 'ring-8 ring-indigo-200' : ''}`}
          >
            <SpeakerIcon className="h-10 w-10" isPlaying={playing} />
          </button>
        </div>
      </div>
      <div className="flex gap-4 mt-12">
        <button onClick={prev} className="flex-1 py-5 rounded-3xl border-2 border-indigo-100 text-indigo-600 font-bold hover:bg-indigo-50 transition-colors">הקודם</button>
        <button onClick={() => { onMark(word); next(); }} className="flex-1 py-5 rounded-3xl bg-amber-100 text-amber-700 font-bold hover:bg-amber-200">⭐ לסקירה</button>
        <button onClick={next} className="flex-1 py-5 rounded-3xl bg-indigo-600 text-white font-black hover:bg-indigo-700 shadow-xl">הבא</button>
      </div>
    </div>
  );
};

const TestMode = ({ words, onDone, onCancel }: any) => {
  const [idx, setIdx] = useState(0);
  const [val, setVal] = useState('');
  const [res, setRes] = useState<TestResult[]>([]);
  const [started, setStarted] = useState(false);
  const [testType, setTestType] = useState<'term' | 'definition'>('term');
  const [playing, setPlaying] = useState(false);
  const inpRef = useRef<HTMLInputElement>(null);

  const current = words[idx];

  const play = useCallback(() => {
    if (!current) return;
    playTTS(testType === 'definition' && current.definition ? current.definition : current.term, setPlaying);
    setTimeout(() => inpRef.current?.focus(), 100);
  }, [current, testType]);

  useEffect(() => { 
    if (started) {
      const timer = setTimeout(play, 400);
      return () => clearTimeout(timer);
    } 
  }, [idx, started, play]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!val.trim()) return;
    const nextRes = [...res, { wordId: current.id, term: current.term, userAnswer: val, isCorrect: checkAnswer(current.term, val) }];
    setRes(nextRes);
    setVal('');
    if (idx < words.length - 1) setIdx(idx + 1);
    else onDone(nextRes);
  };

  if (!started) return (
    <div className="text-center p-12 bg-white rounded-[3rem] shadow-2xl max-w-xl w-full mx-auto border-4 border-indigo-50 animate-screen-entry">
      <div className="text-8xl mb-8">🎯</div>
      <h2 className="text-4xl font-black mb-4 text-slate-800">מוכנים למבחן?</h2>
      <p className="text-slate-500 mb-10 text-lg">בחר את סוג המבחן שתרצה לבצע:</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        <button 
          onClick={() => setTestType('term')} 
          className={`p-6 rounded-3xl border-4 transition-all flex flex-col items-center gap-3 ${testType === 'term' ? 'border-indigo-600 bg-indigo-50 scale-105' : 'border-slate-100 hover:border-indigo-200'}`}
        >
          <span className="text-4xl">✍️</span>
          <span className="font-black text-xl">הכתבה קלאסית</span>
          <span className="text-xs text-slate-400">הקשב למילה וכתוב אותה</span>
        </button>
        <button 
          disabled={!words.some((w: any) => w.definition)}
          onClick={() => setTestType('definition')} 
          className={`p-6 rounded-3xl border-4 transition-all flex flex-col items-center gap-3 disabled:opacity-40 ${testType === 'definition' ? 'border-indigo-600 bg-indigo-50 scale-105' : 'border-slate-100 hover:border-indigo-200'}`}
        >
          <span className="text-4xl">🧠</span>
          <span className="font-black text-xl">מבחן הגדרות</span>
          <span className="text-xs text-slate-400">הקשב להגדרה וכתוב את המילה</span>
        </button>
      </div>

      <button onClick={() => setStarted(true)} className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black text-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all">התחל עכשיו</button>
      <button onClick={onCancel} className="mt-8 text-slate-400 font-bold hover:text-indigo-600 transition-colors">ביטול וחזרה</button>
    </div>
  );

  return (
    <div className="max-w-xl w-full mx-auto px-4 animate-screen-entry">
      <div className="flex justify-between mb-8 items-center bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
        <span className="text-indigo-600 font-black text-lg">שאלה {idx + 1} מתוך {words.length}</span>
        <button 
          onClick={play} 
          disabled={playing} 
          className={`flex items-center gap-3 font-black px-6 py-3 rounded-2xl transition-all shadow-sm ${playing ? 'bg-indigo-100 text-indigo-700 animate-pulse' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:shadow-md'}`}
        >
          <SpeakerIcon className="h-6 w-6" isPlaying={playing} />
          <span>השמע שוב</span>
        </button>
      </div>
      <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-indigo-50 text-center mb-6">
        <div className="mb-4 text-slate-400 font-bold text-lg uppercase tracking-widest">
          {testType === 'definition' ? 'כתוב את המילה שמתאימה להגדרה' : 'כתוב את המילה ששמעת'}
        </div>
        
        {/* Spelling assistance hint like Nakdan.com */}
        <div className="mb-8 min-h-[3rem] flex items-center justify-center">
            {val.length > 0 && (
                <div className="text-indigo-300 font-medium text-xl bg-indigo-50/50 px-6 py-2 rounded-2xl border border-indigo-100 animate-pulse">
                    {val} {current.nikud && current.nikud !== current.term && <span className="mr-2 opacity-50">({current.nikud})</span>}
                </div>
            )}
        </div>

        <form onSubmit={submit}>
          <input 
            ref={inpRef} 
            autoFocus 
            value={val} 
            onChange={e => setVal(e.target.value)} 
            className="w-full text-center text-5xl font-black p-6 border-b-8 border-slate-50 focus:border-indigo-600 outline-none mb-12 transition-all bg-transparent" 
            placeholder="..." 
            dir="auto" 
            autoComplete="off" 
          />
          <button type="submit" className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black text-2xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all">אישור והמשך</button>
        </form>
      </div>
    </div>
  );
};

const ResultScreen = ({ res, onHome }: any) => {
  const score = Math.round((res.filter((r: any) => r.isCorrect).length / res.length) * 100);
  return (
    <div className="max-w-4xl w-full mx-auto bg-white rounded-[3rem] shadow-2xl p-10 h-[85vh] flex flex-col border-4 border-indigo-50 animate-screen-entry overflow-hidden">
      <div className="text-center mb-10 shrink-0">
        <div className={`text-9xl font-black mb-2 ${score >= 80 ? 'text-green-500' : score >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{score}%</div>
        <div className="text-slate-500 font-bold text-xl uppercase tracking-widest">הציון שלך במבחן</div>
      </div>
      <div className="flex-1 overflow-auto border-2 border-slate-50 rounded-3xl custom-scrollbar mb-8">
        <table className="w-full text-right border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="p-6 font-black text-indigo-800 border-b-2 border-slate-100">המילה</th>
              <th className="p-6 font-black text-indigo-800 border-b-2 border-slate-100">התשובה שלך</th>
              <th className="p-6 font-black text-indigo-800 border-b-2 border-slate-100 text-center">תוצאה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {res.map((r: any, i: number) => (
              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6 font-black text-slate-800 text-2xl">{r.term}</td>
                <td className={`p-6 font-bold text-xl ${r.isCorrect ? 'text-green-600' : 'text-rose-500'}`}>{r.userAnswer || '-'}</td>
                <td className="p-6 text-center text-4xl">{r.isCorrect ? '✅' : '❌'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onHome} className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black text-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all shrink-0">סיום וחזרה למסך הבית</button>
    </div>
  );
};

// =================================================================================
// MAIN APP COMPONENT
// =================================================================================

const App = () => {
  const [words, setWords] = useState<WordItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('dixi_words') || '[]'); } catch { return []; }
  });
  const [reviews, setReviews] = useState<WordItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('dixi_review_words') || '[]'); } catch { return []; }
  });
  const [mode, setMode] = useState<Mode>(AppMode.MENU);
  const [results, setResults] = useState<TestResult[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialize voices
  useEffect(() => {
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        const handleVoicesChanged = () => window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    }
  }, []);

  const saveList = (list: WordItem[]) => {
    setWords(list);
    localStorage.setItem('dixi_words', JSON.stringify(list));
    setMode(AppMode.PREVIEW);
  };

  const addReview = (w: WordItem) => {
    if (!reviews.some(r => r.term === w.term)) {
      const updated = [...reviews, w];
      setReviews(updated);
      localStorage.setItem('dixi_review_words', JSON.stringify(updated));
    }
  };

  const PageContent = () => {
    switch(mode) {
      case AppMode.CREATE_LIST: return <InputSection onSave={saveList} onCancel={() => setMode(AppMode.MENU)} initialList={words} />;
      case AppMode.PRACTICE: return <PracticeMode words={words} onBack={() => setMode(AppMode.PREVIEW)} onMark={addReview} />;
      case AppMode.TEST: return <TestMode words={words} onDone={(r: any) => { setResults(r); setMode(AppMode.RESULT); }} onCancel={() => setMode(AppMode.PREVIEW)} />;
      case AppMode.RESULT: return <ResultScreen res={results} onHome={() => setMode(AppMode.MENU)} />;
      case AppMode.PREVIEW: return (
        <div className="max-w-5xl mx-auto w-full p-4 h-[85vh] flex flex-col animate-screen-entry overflow-hidden">
          <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 mb-6 shrink-0">
            <h2 className="font-black text-3xl text-slate-800">הרשימה שלי ({words.length})</h2>
            <div className="flex gap-3">
                <button onClick={() => {
                    const dataStr = JSON.stringify(words, null, 2);
                    const link = document.createElement('a');
                    link.setAttribute('href', 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr));
                    link.setAttribute('download', 'dixi_list.json');
                    link.click();
                }} className="bg-slate-100 text-slate-600 font-bold px-8 py-3 rounded-2xl hover:bg-slate-200 transition-colors">שמור קובץ</button>
                <button onClick={() => setMode(AppMode.CREATE_LIST)} className="bg-indigo-50 text-indigo-700 font-bold px-8 py-3 rounded-2xl hover:bg-indigo-100 transition-colors">עריכה</button>
            </div>
          </div>
          <div className="flex-1 bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border-4 border-indigo-50">
            <div className="overflow-auto flex-1 p-8 custom-scrollbar">
              {words.length === 0 ? (
                <div className="flex flex-col items-center justify-center mt-20 space-y-6">
                    <div className="text-9xl">🏜️</div>
                    <div className="text-center text-slate-400 text-3xl font-black">הרשימה ריקה.</div>
                    <button onClick={() => setMode(AppMode.CREATE_LIST)} className="bg-indigo-600 text-white px-12 py-5 rounded-3xl font-black shadow-2xl text-xl">בואו נצור מילים!</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {words.map((w, i) => (
                    <div key={i} className="p-8 bg-slate-50/50 rounded-[2rem] border-2 border-slate-100 flex flex-col group hover:border-indigo-200 transition-all hover:bg-white hover:shadow-xl hover:shadow-indigo-50/50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                            <span className="font-black text-3xl text-slate-800">{w.term}</span>
                            {w.nikud && w.nikud !== w.term && <span className="block text-indigo-500 font-bold mt-1">{w.nikud}</span>}
                        </div>
                        <button onClick={() => playTTS(w.term, setIsSpeaking)} className="text-indigo-600 p-3 bg-white rounded-2xl shadow-sm hover:scale-110 active:scale-95 transition-all">
                            <SpeakerIcon className="h-7 w-7" isPlaying={isSpeaking} />
                        </button>
                      </div>
                      {w.definition && <p className="text-slate-500 font-medium leading-relaxed mt-2 border-t border-slate-100 pt-3">{w.definition}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-8 border-t bg-slate-50/30 flex flex-col md:flex-row gap-4 shrink-0">
              <button onClick={() => setMode(AppMode.MENU)} className="px-12 py-6 rounded-3xl bg-white text-slate-700 font-bold border-2 border-slate-100 hover:bg-slate-50 transition-colors">בית</button>
              {words.length > 0 && (
                <div className="flex-1 flex gap-4">
                    <button onClick={() => setMode(AppMode.PRACTICE)} className="flex-1 py-6 rounded-3xl bg-indigo-100 text-indigo-700 font-black hover:bg-indigo-200 transition-all text-xl">תרגול כרטיסיות</button>
                    <button onClick={() => setMode(AppMode.TEST)} className="flex-1 py-6 rounded-3xl bg-indigo-600 text-white font-black hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all scale-105 text-xl">התחל מבחן</button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
      default: return (
        <LandingPage 
          hasWords={words.length > 0} 
          onCreate={() => setMode(AppMode.CREATE_LIST)} 
          onFileSelect={() => fileRef.current?.click()} 
          onContinue={() => setMode(AppMode.PREVIEW)} 
          reviewCount={reviews.length} 
          onLoadReview={() => { setWords(reviews); setMode(AppMode.PREVIEW); }} 
        />
      );
    }
  };

  return (
    <div className="h-full flex flex-col selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
      <header className="p-6 bg-white flex justify-between items-center z-20 border-b-2 border-slate-50 shrink-0">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setMode(AppMode.MENU)}>
          <div className="bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-3xl shadow-lg group-hover:rotate-12 transition-transform">D</div>
          <div>
            <h1 className="font-black text-3xl text-slate-800 tracking-tight leading-none">Dixi</h1>
            <span className="text-xs text-indigo-500 font-bold uppercase tracking-widest">Master Dictation</span>
          </div>
        </div>
        {mode !== AppMode.MENU && <button onClick={() => setMode(AppMode.MENU)} className="text-slate-400 font-bold hover:text-rose-500 px-6 py-3 rounded-2xl hover:bg-rose-50 transition-all">יציאה מהשיעור</button>}
      </header>
      <main className="flex-1 relative flex items-center justify-center bg-slate-50 w-full overflow-hidden">
        <input 
            type="file" 
            ref={fileRef}
            accept=".json"
            className="hidden" 
            onChange={(e) => {
                const fr = new FileReader();
                if (e.target.files?.[0]) {
                    fr.onload = (ev) => { try { saveList(JSON.parse(ev.target?.result as string)); } catch { alert("שגיאה בטעינת הקובץ"); } };
                    fr.readAsText(e.target.files[0]);
                }
            }}
        />
        <div key={mode} className="w-full h-full flex items-center justify-center p-2 md:p-6 overflow-hidden">
          <PageContent />
        </div>
      </main>
    </div>
  );
};

// =================================================================================
// RENDER
// =================================================================================
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'none';
}
