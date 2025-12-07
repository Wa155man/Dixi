import React, { useState } from 'react';
import { WordItem } from '../types.ts';
import { playTextToSpeech } from '../services/geminiService.ts';

interface PracticeModeProps {
  words: WordItem[];
  onBack: () => void;
}

export const PracticeMode: React.FC<PracticeModeProps> = ({ words, onBack }) => {
  const [queue, setQueue] = useState<WordItem[]>(words);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentWord = queue[currentIndex];

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
    
    // Add current word to the end of the queue for review
    const newQueue = [...queue, currentWord];
    setQueue(newQueue);
    
    // Move to next word immediately
    setCurrentIndex((prev) => (prev + 1) % newQueue.length);
  };

  const handleSpeak = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    
    setIsPlaying(true);
    // Speak definition if visible and available, otherwise speak term
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

      <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full justify-center items-center">
        <button 
          onClick={handlePrev}
          className="order-1 sm:order-none bg-white border border-gray-200 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-50 font-medium transition-all shadow-sm w-full sm:w-32"
        >
          הקודם
        </button>
        
        <button 
          onClick={handleForgot}
          className="order-3 sm:order-none bg-orange-100 text-orange-700 border border-orange-200 px-6 py-3 rounded-xl hover:bg-orange-200 font-medium transition-all shadow-sm w-full sm:w-auto flex items-center justify-center gap-2"
        >
          <span className="text-xl">↺</span>
          לתרגל שוב
        </button>

        <button 
          onClick={handleNext}
          className="order-2 sm:order-none bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 font-medium transition-all shadow-md w-full sm:w-32"
        >
          הבא
        </button>
      </div>
    </div>
  );
};