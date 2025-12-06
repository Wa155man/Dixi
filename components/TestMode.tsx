import React, { useState, useEffect, useRef } from 'react';
import { WordItem, TestResult } from '../types';
import { playTextToSpeech } from '../services/geminiService';
import { checkAnswer } from '../utils';

interface TestModeProps {
  words: WordItem[];
  onComplete: (results: TestResult[]) => void;
  onCancel: () => void;
}

export const TestMode: React.FC<TestModeProps> = ({ words, onComplete, onCancel }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = words[currentIndex];

  useEffect(() => {
    // Reset state for new word
    setUserInput('');
    setHasPlayedOnce(false);
    
    // Auto play audio after a short delay to allow transition
    const timer = setTimeout(() => {
        playAudio();
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const playAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    // If there is a definition, read the definition (user guesses word).
    // If no definition, read the word (standard dictation).
    const textToSpeak = currentWord.definition ? currentWord.definition : currentWord.term;
    
    await playTextToSpeech(textToSpeak);
    setIsPlaying(false);
    setHasPlayedOnce(true);
    
    // Focus input after audio
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
        
        {/* Audio Visualizer Placeholder / Speaker Icon */}
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
            {currentWord.definition 
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