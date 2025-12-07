import React from 'react';
import { WordItem } from '../types.ts';

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

const LandingPage: React.FC<LandingPageProps> = ({
  hasWords,
  onCreateList,
  onLoadList,
  onContinue,
  reviewCount,
  onLoadReview,
  fileInputRef,
  onFileUpload
}) => {
  return (
    <div className="text-center max-w-lg mx-auto w-full px-4 flex flex-col items-center justify-center h-full">
      <div className="mb-8 md:mb-12">
        <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-l from-indigo-600 to-purple-600 mb-4 tracking-tight">Dixi</h1>
        <p className="text-gray-500 text-lg md:text-xl font-light">שפר את אוצר המילים והכתיב שלך</p>
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
      
      <div className="mt-12 text-xs text-gray-400">
        פועל בדפדפן ובמובייל • גרסה 1.2
      </div>
    </div>
  );
};

// Register
(window as any).Dixi.components.LandingPage = LandingPage;