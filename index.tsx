import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// =================================================================================
// CONFIG & TYPES
// =================================================================================
const AppMode = {
  MENU: 'MENU',
  CREATE_LIST: 'CREATE_LIST',
  PREVIEW: 'PREVIEW',
  PRACTICE: 'PRACTICE',
  TEST: 'TEST',
  RESULT: 'RESULT',
};

interface WordItem {
  id: string;
  term: string;
  definition?: string;
}

interface TestResult {
  wordId: string;
  term: string;
  userAnswer: string;
  isCorrect: boolean;
}

// =================================================================================
// UTILS
// =================================================================================
const generateId = () => Math.random().toString(36).substring(2, 9);

const normalizeString = (str: string) => {
  if (!str) return '';
  return str.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "").replace(/\s{2,}/g, " ").trim().toLowerCase();
};

const checkAnswer = (correct: string, actual: string) => normalizeString(correct) === normalizeString(actual);

// Audio Utils
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext) {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < channelData.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  return buffer;
}

// =================================================================================
// SERVICES
// =================================================================================
const audioCache: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  return audioContext;
};

const playTextToSpeech = async (text: string): Promise<{ success: boolean; error?: string }> => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
          return { success: false, error: "Cannot resume audio context. Please interact with the page." };
      }
  }

  const cleanText = text?.trim();
  if (!cleanText) return { success: false, error: "No text to speak." };

  // Fallback function: Uses Browser's Native TTS
  const fallback = (): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            resolve({ success: false, error: "Browser does not support text-to-speech." });
            return;
        }

        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(cleanText);
        u.rate = 0.9;
        
        // Detect language roughly
        const isHebrew = /[\u0590-\u05FF]/.test(cleanText);
        u.lang = isHebrew ? 'he-IL' : 'en-US';

        // Some browsers need a short delay or they cancel immediately
        setTimeout(() => {
            u.onend = () => resolve({ success: true });
            u.onerror = (e) => resolve({ success: false, error: `Browser TTS error: ${e.error}` });
            
            try {
                window.speechSynthesis.speak(u);
            } catch (err) {
                resolve({ success: false, error: "Failed to invoke browser TTS." });
            }
        }, 10);
    });
  };

  try {
    // 1. Check if we already have it cached (GenAI audio only)
    if (audioCache[cleanText]) {
        const source = ctx.createBufferSource();
        source.buffer = audioCache[cleanText];
        source.connect(ctx.destination);
        source.start();
        return new Promise((resolve) => {
            source.onended = () => resolve({ success: true });
        });
    }

    // 2. Try GenAI
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        // No API Key, go straight to fallback
        return fallback();
    }
      
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts", 
        contents: [{ parts: [{ text: `Say: ${cleanText}` }] }],
        config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
    });

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("No audio data returned from API");

    const decodedBuffer = await decodeAudioData(decode(base64), ctx);
    audioCache[cleanText] = decodedBuffer;

    const source = ctx.createBufferSource();
    source.buffer = decodedBuffer;
    source.connect(ctx.destination);
    source.start();
    return new Promise((resolve) => {
        source.onended = () => resolve({ success: true });
    });

  } catch (e) {
    console.warn("AI TTS failed, switching to fallback:", e);
    // 3. GenAI Failed, Try Fallback
    return fallback();
  }
};

// =================================================================================
// COMPONENTS
// =================================================================================

const LandingPage = ({ hasWords, onCreate, onLoad, onReview, reviewCount, fileInputRef, onFile }: any) => (
  <div className="text-center max-w-lg mx-auto px-4 flex flex-col items-center justify-center h-full animate-fade-in">
    <div className="mb-8">
      <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2">Dixi</h1>
      <p className="text-gray-500">עוזר הכתבה חכם</p>
    </div>
    <div className="w-full space-y-4">
        <button onClick={onCreate} className="w-full bg-white p-5 rounded-xl shadow-sm border hover:border-indigo-500 flex justify-between items-center group transition-all">
            <span className="font-bold text-gray-800 group-hover:text-indigo-600">צור רשימה חדשה</span><span className="text-2xl">📝</span>
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white p-5 rounded-xl shadow-sm border hover:border-indigo-500 flex justify-between items-center group transition-all">
            <span className="font-bold text-gray-800 group-hover:text-indigo-600">טען קובץ</span><span className="text-2xl">📂</span>
        </button>
        <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={onFile} />
        
        {reviewCount > 0 && (
           <button onClick={onReview} className="w-full bg-amber-50 p-5 rounded-xl border border-amber-200 hover:border-amber-400 flex justify-between items-center group transition-all">
               <span className="font-bold text-gray-800 group-hover:text-amber-700">מילים לסקירה ({reviewCount})</span><span className="text-2xl">⭐</span>
           </button>
        )}
        
        {hasWords && (
           <button onClick={() => window.location.hash = AppMode.PREVIEW} className="w-full bg-indigo-600 p-5 rounded-xl text-white shadow-lg hover:bg-indigo-700 flex justify-between items-center transition-all">
               <span className="font-bold">המשך לתרגול</span><span className="text-2xl">👉</span>
           </button>
        )}
    </div>
    <div className="mt-12 text-xs text-gray-400">פועל בדפדפן ובמובייל • גרסה 1.3</div>
  </div>
);

const InputSection = ({ onSave, onCancel, initialList }: any) => {
  const [tab, setTab] = useState('manual');
  const [inputs, setInputs] = useState(() => {
     let list = initialList?.length ? initialList.map((w: any) => ({term: w.term, definition: w.definition || ''})) : [];
     if (list.length === 0) list = Array(10).fill({ term: '', definition: '' });
     else while (list.length < 10) list.push({ term: '', definition: '' });
     return list;
  });
  const [paste, setPaste] = useState('');
  const [pairs, setPairs] = useState('');

  const updateInput = (i: number, field: string, val: string) => {
    const newInputs = [...inputs];
    newInputs[i] = { ...newInputs[i], [field]: val };
    setInputs(newInputs);
  };

  const process = () => {
    let list: WordItem[] = [];
    if (tab === 'manual') {
        list = inputs
            .filter((i: any) => i.term.trim())
            .map((i: any) => ({ id: generateId(), term: i.term.trim(), definition: i.definition?.trim() || undefined }));
    } else if (tab === 'paste') {
        list = paste.split('\n')
            .filter(l => l.trim())
            .map(l => ({ id: generateId(), term: l.trim() }));
    } else if (tab === 'pairs') {
        list = pairs.split('\n')
            .map(l => {
                const parts = l.split('-');
                if(parts.length < 2) return null;
                return { id: generateId(), term: parts[0].trim(), definition: parts.slice(1).join('-').trim() };
            })
            .filter(i => i !== null) as WordItem[];
    }
    
    if (!list.length) return alert('הזן לפחות מילה אחת');
    onSave(list);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-4xl mx-auto flex flex-col h-[85vh]">
      <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 className="text-2xl font-bold text-indigo-800">יצירת רשימה</h2>
          <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={() => setTab('manual')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${tab === 'manual' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>ידני</button>
              <button onClick={() => setTab('paste')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${tab === 'paste' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>הדבקה</button>
              <button onClick={() => setTab('pairs')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${tab === 'pairs' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>זוגות</button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
        {tab === 'manual' && (
            <div className="space-y-3">
                {inputs.map((inp: any, i: number) => (
                    <div key={i} className="flex gap-2 items-center">
                        <span className="w-6 text-gray-400 text-sm font-mono">{i+1}.</span>
                        <input 
                            placeholder={`מילה ${i+1}`}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                            value={inp.term} 
                            onChange={e => updateInput(i, 'term', e.target.value)} 
                        />
                         <input 
                            placeholder="הגדרה (אופציונלי)" 
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                            value={inp.definition} 
                            onChange={e => updateInput(i, 'definition', e.target.value)} 
                        />
                    </div>
                ))}
                <div className="flex gap-2 mt-4">
                    <button onClick={() => setInputs([...inputs, ...Array(10).fill({term:'', definition:''})])} className="flex-1 py-2 text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors">+ הוסף 10 שורות</button>
                </div>
            </div>
        )}
        {tab === 'paste' && (
            <textarea className="w-full h-full border rounded-lg p-4 font-mono text-base focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="הדבק מילים כאן (כל מילה בשורה נפרדת)..." value={paste} onChange={e => setPaste(e.target.value)} />
        )}
        {tab === 'pairs' && (
            <div className="h-full flex flex-col">
                <div className="text-sm text-gray-500 mb-2">פורמט: מילה - הגדרה (אחת בכל שורה)</div>
                <textarea className="flex-1 w-full border rounded-lg p-4 font-mono text-base focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={'תפוח - פרי עגול\nכלב - חיה נובחת'} value={pairs} onChange={e => setPairs(e.target.value)} />
            </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t flex justify-end gap-3 shrink-0">
          <button onClick={onCancel} className="px-6 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors font-medium">ביטול</button>
          <button onClick={process} className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors shadow-sm">שמור רשימה</button>
      </div>
    </div>
  );
};

const PracticeMode = ({ words, onBack, onMark }: any) => {
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = words[idx];

  const next = () => { setFlip(false); setError(null); setIdx((idx + 1) % words.length); };
  const prev = () => { setFlip(false); setError(null); setIdx((idx - 1 + words.length) % words.length); };
  
  const speak = async (e: React.MouseEvent) => { 
      e.stopPropagation(); 
      setError(null);
      const text = (flip && word.definition) ? word.definition : word.term;
      const result = await playTextToSpeech(text);
      if (!result.success) setError(result.error || "שגיאה בניגון שמע");
  };

  const handleForgot = (e: React.MouseEvent) => {
      e.stopPropagation();
      onMark(word); // Mark for review automatically if forgotten
      next();
  };

  return (
    <div className="max-w-2xl w-full mx-auto p-4 flex flex-col h-[70vh] justify-center">
       <div className="flex justify-between mb-4">
           <button onClick={onBack} className="text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1">← חזרה</button>
           <span className="text-gray-400 font-mono">{idx + 1} / {words.length}</span>
       </div>

        {error && (
           <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-center justify-between animate-fade-in">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} className="font-bold px-2">✕</button>
           </div>
       )}
       
       <div onClick={() => word.definition && setFlip(!flip)} className="relative flex-1 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center p-8 cursor-pointer transition-transform duration-300 transform active:scale-[0.99] border-2 border-transparent hover:border-indigo-100">
           <button onClick={speak} className="absolute top-4 left-4 p-3 bg-indigo-50 text-indigo-600 rounded-full z-10 hover:bg-indigo-100 transition-colors">🔊</button>
           <div className="text-sm text-indigo-400 uppercase font-bold mb-4 tracking-wider">{flip ? 'הגדרה' : 'מילה'}</div>
           <h2 className="text-4xl md:text-5xl font-bold text-center text-gray-800 break-words w-full px-4">{flip ? word.definition : word.term}</h2>
           {word.definition && <p className="absolute bottom-6 text-gray-400 text-xs animate-pulse">לחץ כדי להפוך</p>}
       </div>

       <div className="flex gap-3 mt-8">
           <button onClick={prev} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">הקודם</button>
           <button onClick={handleForgot} className="flex-1 py-3 rounded-xl bg-orange-50 text-orange-700 border border-orange-100 font-bold hover:bg-orange-100 transition-colors">↺ שוב</button>
           <button onClick={(e) => { e.stopPropagation(); onMark(word); next(); }} className="flex-1 py-3 rounded-xl bg-amber-100 text-amber-700 font-bold hover:bg-amber-200 transition-colors border border-amber-200">⭐ לסקירה</button>
           <button onClick={next} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-md">הבא</button>
       </div>
    </div>
  );
};

const TestMode = ({ words, onDone, onCancel }: any) => {
  const [idx, setIdx] = useState(0);
  const [val, setVal] = useState('');
  const [res, setRes] = useState<TestResult[]>([]);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  useEffect(() => {
     if(started) {
         setVal('');
         setError(null);
         const t = setTimeout(() => play(), 600);
         return () => clearTimeout(t);
     }
  }, [idx, started]);

  const play = async () => {
     setError(null);
     setPlaying(true);
     const w = words[idx];
     const text = w.definition || w.term;
     const result = await playTextToSpeech(text);
     setPlaying(false);
     if (!result.success) {
         setError(result.error || "לא ניתן להשמיע שמע");
     } else {
        inp.current?.focus();
     }
  };

  const submit = (e: React.FormEvent) => {
      e.preventDefault();
      const w = words[idx];
      const nextRes = [...res, { wordId: w.id, term: w.term, userAnswer: val, isCorrect: checkAnswer(w.term, val) }];
      setRes(nextRes);
      if (idx < words.length - 1) setIdx(idx + 1);
      else onDone(nextRes);
  };

  if(!started) return (
      <div className="text-center p-8 md:p-12 bg-white rounded-2xl shadow-xl max-w-md w-full mx-auto">
          <div className="text-6xl mb-6">🎧</div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">מוכן למבחן הכתבה?</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">האפליקציה תשמיע את המילה (או ההגדרה), ועליך להקליד את התשובה המדויקת.</p>
          <button onClick={() => { setStarted(true); play(); }} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-colors shadow-lg transform active:scale-[0.98] transition-transform">התחל מבחן</button>
          <button onClick={onCancel} className="mt-6 text-gray-500 text-sm hover:text-gray-800 font-medium">ביטול וחזרה</button>
      </div>
  );

  return (
      <div className="max-w-xl w-full mx-auto px-4">
          <div className="flex justify-between mb-8 items-center">
              <span className="text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full text-sm">שאלה {idx + 1} מתוך {words.length}</span>
              <button onClick={play} disabled={playing} className="text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-3 py-1 rounded-full disabled:opacity-50">
                  {playing ? 'משמיע...' : 'השמע שוב 🔊'}
              </button>
          </div>
          
          {error && (
             <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 text-center animate-fade-in shadow-sm">
                 <div className="font-bold mb-1">❌ שגיאת שמע</div>
                 <div className="text-sm">{error}</div>
                 <button onClick={play} className="mt-2 text-sm underline text-red-800 hover:text-red-950">נסה שוב</button>
             </div>
          )}

          <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 text-center mb-6">
             <div className="mb-4 text-gray-400 text-sm">
                 {words[idx].definition ? 'הקשב להגדרה וכתוב את המילה' : 'הקשב למילה וכתוב אותה'}
             </div>
             <form onSubmit={submit}>
                <input ref={inp} autoFocus value={val} onChange={e => setVal(e.target.value)} className="w-full text-center text-2xl p-4 border-b-2 border-indigo-100 focus:border-indigo-600 outline-none mb-8 transition-colors bg-transparent" placeholder="הקלד כאן..." dir="auto" autoComplete="off" />
                <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-all text-lg">אישור</button>
             </form>
          </div>
      </div>
  );
};

const ResultScreen = ({ res, onHome }: any) => {
  const score = Math.round((res.filter((r: any) => r.isCorrect).length / res.length) * 100);
  return (
      <div className="max-w-2xl w-full mx-auto bg-white rounded-2xl shadow-xl p-6 h-[80vh] flex flex-col">
          <div className="text-center mb-6">
              <div className="text-6xl font-bold text-indigo-600 mb-2">{score}%</div>
              <div className="text-gray-500 font-medium">ציון סופי</div>
          </div>
          <div className="flex-1 overflow-auto border-t border-b custom-scrollbar">
              <table className="w-full text-right">
                  <thead className="bg-gray-50 sticky top-0">
                      <tr>
                          <th className="p-3 text-sm text-gray-500">שאלה</th>
                          <th className="p-3 text-sm text-gray-500">תשובה</th>
                          <th className="p-3 text-sm text-gray-500">סטטוס</th>
                      </tr>
                  </thead>
                  <tbody>
                    {res.map((r: any, i: number) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="p-3 font-bold text-gray-800">{r.term}</td>
                            <td className={`p-3 font-mono ${r.isCorrect ? 'text-green-600' : 'text-red-500 line-through'}`}>{r.userAnswer || '-'}</td>
                            <td className="p-3">{r.isCorrect ? '✅' : '❌'}</td>
                        </tr>
                    ))}
                  </tbody>
              </table>
          </div>
          <button onClick={onHome} className="mt-6 w-full bg-gray-100 text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors">חזרה לתפריט הראשי</button>
      </div>
  );
};

// =================================================================================
// MAIN APP
// =================================================================================

const App = () => {
  const [words, setWords] = useState(() => {
     try { return JSON.parse(localStorage.getItem('dixi_words') || '[]'); } catch { return []; }
  });
  const [reviews, setReviews] = useState(() => {
     try { return JSON.parse(localStorage.getItem('dixi_reviews') || '[]'); } catch { return []; }
  });
  const [mode, setMode] = useState(AppMode.MENU);
  const [results, setResults] = useState([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
     // Session redirect for Github Pages SPA 404 hack
     const redirect = sessionStorage.getItem('redirect');
     if(redirect) {
         sessionStorage.removeItem('redirect');
         const url = new URL(redirect);
         const page = url.searchParams.get('page');
         if(page && words.length > 0) setMode(page);
     } else {
         // Hash routing
         const handleHash = () => {
             const m = window.location.hash.replace('#', '');
             if(m && Object.values(AppMode).includes(m)) {
                 if((m === AppMode.PRACTICE || m === AppMode.TEST) && words.length === 0) setMode(AppMode.MENU);
                 else setMode(m);
             } else {
                 setMode(AppMode.MENU);
             }
         };
         window.addEventListener('hashchange', handleHash);
         handleHash();
         return () => window.removeEventListener('hashchange', handleHash);
     }
  }, [words.length]);

  const saveList = (list: WordItem[]) => {
      setWords(list);
      localStorage.setItem('dixi_words', JSON.stringify(list));
      window.location.hash = AppMode.PREVIEW;
  };

  const addReview = (w: WordItem) => {
      if(!reviews.some((r: any) => r.term === w.term)) {
          const newRev = [...reviews, w];
          setReviews(newRev);
          localStorage.setItem('dixi_reviews', JSON.stringify(newRev));
      }
  };

  const loadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const fr = new FileReader();
      fr.onload = (ev) => {
          try { 
            const result = ev.target?.result;
            if (typeof result === 'string') saveList(JSON.parse(result)); 
          } catch(e) { alert('שגיאה בקובץ'); }
      };
      if(e.target.files?.[0]) fr.readAsText(e.target.files[0]);
  };

  const downloadList = () => {
    const dataStr = JSON.stringify(words, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'dixi_list.json');
    linkElement.click();
  };

  const Page = () => {
      switch(mode) {
          case AppMode.CREATE_LIST: return <InputSection onSave={saveList} onCancel={() => window.history.back()} initialList={words} />;
          case AppMode.PRACTICE: return <PracticeMode words={words} onBack={() => window.history.back()} onMark={addReview} />;
          case AppMode.TEST: return <TestMode words={words} onDone={(r: any) => { setResults(r); window.location.hash = AppMode.RESULT; }} onCancel={() => window.history.back()} />;
          case AppMode.RESULT: return <ResultScreen res={results} onHome={() => window.location.hash = ''} />;
          case AppMode.PREVIEW: return (
              <div className="max-w-4xl mx-auto w-full p-4 h-[85vh] flex flex-col">
                  <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-4 shrink-0">
                      <h2 className="font-bold text-xl text-gray-800">רשימה נוכחית ({words.length})</h2>
                      <div className="flex gap-2">
                        <button onClick={downloadList} className="text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded text-sm font-medium">שמור</button>
                        <button onClick={() => window.location.hash = AppMode.CREATE_LIST} className="text-gray-600 hover:bg-gray-100 px-3 py-1 rounded text-sm font-medium">ערוך</button>
                      </div>
                  </div>
                  <div className="flex-1 bg-white rounded-xl shadow-lg overflow-hidden flex flex-col border border-gray-100">
                      <div className="overflow-auto flex-1 p-4 custom-scrollbar">
                          {words.length === 0 ? <div className="text-center text-gray-400 mt-10">הרשימה ריקה</div> : words.map((w: any, i: number) => (
                              <div key={i} className="border-b last:border-0 py-3 flex justify-between items-center hover:bg-gray-50 px-2 rounded transition-colors group">
                                  <span className="font-bold text-gray-800">{w.term}</span>
                                  <span className="text-gray-500 text-sm group-hover:text-indigo-500 transition-colors">{w.definition}</span>
                              </div>
                          ))}
                      </div>
                      <div className="p-4 border-t bg-gray-50 flex gap-3 shrink-0">
                          <button onClick={() => window.location.hash = ''} className="px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-100 transition-colors">תפריט</button>
                          <button onClick={() => window.location.hash = AppMode.PRACTICE} className="flex-1 py-3 rounded-xl bg-indigo-100 text-indigo-700 font-bold hover:bg-indigo-200 transition-colors border border-indigo-200">תרגול</button>
                          <button onClick={() => window.location.hash = AppMode.TEST} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm">מבחן</button>
                      </div>
                  </div>
              </div>
          );
          default: return <LandingPage hasWords={words.length > 0} onCreate={() => window.location.hash = AppMode.CREATE_LIST} fileInputRef={fileRef} onFile={loadFile} reviewCount={reviews.length} onReview={() => saveList(reviews)} />;
      }
  };

  return (
      <div className="h-full flex flex-col">
          <header className="p-4 bg-white shadow-sm flex justify-between items-center z-10 relative border-b border-gray-200">
              <h1 className="font-bold text-2xl text-indigo-600 cursor-pointer hover:text-indigo-700 transition-colors tracking-tight" onClick={() => window.location.hash = ''}>Dixi</h1>
              {mode !== AppMode.MENU && <button onClick={() => window.location.hash = ''} className="text-gray-500 text-sm hover:text-indigo-600 transition-colors font-medium">יציאה</button>}
          </header>
          <main className="flex-1 relative flex items-center justify-center bg-slate-50 w-full overflow-hidden">
             <Page />
          </main>
      </div>
  );
};

// Render
const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
    
    // Remove Loader
    const loader = document.getElementById('app-loader');
    if(loader) loader.style.display = 'none';
}
