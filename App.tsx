import React, { useState, useRef, useEffect } from 'react';
import { WordItem, AppMode, TestResult } from './types';
import { InputSection } from './components/InputSection';
import { PracticeMode } from './components/PracticeMode';
import { TestMode } from './components/TestMode';
import { ResultScreen } from './components/ResultScreen';
import { LandingPage } from './components/LandingPage';

export default function App() {
  const [words, setWords] = useState<WordItem[]>([]);
  const [mode, setMode] = useState<AppMode>(AppMode.MENU);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize from LocalStorage and URL
  useEffect(() => {
    try {
      const savedWords = localStorage.getItem('dixi_words');
      let loadedWords: WordItem[] = [];
      if (savedWords) {
        loadedWords = JSON.parse(savedWords);
        setWords(loadedWords);
      }

      const params = new URLSearchParams(window.location.search);
      const page = params.get('page');
      
      if (page && Object.values(AppMode).includes(page as AppMode)) {
        // Only allow navigation to functional modes if we have words
        if ((page === AppMode.PRACTICE || page === AppMode.TEST || page === AppMode.PREVIEW) && loadedWords.length === 0) {
           setMode(AppMode.MENU);
           updateUrl(AppMode.MENU);
        } else {
           setMode(page as AppMode);
        }
      }
    } catch (e) {
      console.error("Error initializing app:", e);
    }
  }, []);

  // Update LocalStorage whenever words change
  useEffect(() => {
    if (words.length > 0) {
      localStorage.setItem('dixi_words', JSON.stringify(words));
    }
  }, [words]);

  const updateUrl = (newMode: AppMode) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', newMode);
    window.history.pushState({}, '', url);
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    updateUrl(newMode);
  };

  const handleSaveList = (newList: WordItem[]) => {
    setWords(newList);
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
    }
  };

  const renderContent = () => {
    switch (mode) {
      case AppMode.CREATE_LIST:
        return (
          <InputSection 
            onSave={handleSaveList} 
            onCancel={() => handleModeChange(AppMode.MENU)} 
            initialList={words}
          />
        );

      case AppMode.PRACTICE:
        return <PracticeMode words={words} onBack={() => handleModeChange(AppMode.PREVIEW)} />;

      case AppMode.TEST:
        return (
          <TestMode 
            words={words} 
            onComplete={(results) => {
                setTestResults(results);
                handleModeChange(AppMode.RESULT);
            }} 
            onCancel={() => handleModeChange(AppMode.PREVIEW)} 
          />
        );

      case AppMode.RESULT:
        return (
            <ResultScreen 
                results={testResults} 
                onHome={() => handleModeChange(AppMode.MENU)}
                onRetry={() => handleModeChange(AppMode.TEST)}
            />
        );

      case AppMode.PREVIEW:
        return (
          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 max-w-4xl w-full mx-auto flex flex-col h-full max-h-[85dvh]">
            <div className="flex justify-between items-center mb-4 md:mb-6 shrink-0">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">סקירת מילים</h2>
                <div className="flex gap-2">
                     <button onClick={downloadList} className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded text-sm font-medium">
                        שמור
                     </button>
                     <button onClick={() => handleModeChange(AppMode.CREATE_LIST)} className="text-gray-600 hover:bg-gray-100 px-3 py-2 rounded text-sm font-medium">
                        ערוך
                     </button>
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
                <button 
                    onClick={() => handleModeChange(AppMode.MENU)}
                    className="w-full md:w-auto px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl"
                >
                    חזרה
                </button>
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <button 
                        onClick={() => handleModeChange(AppMode.PRACTICE)}
                        className="w-full md:w-auto px-6 py-3 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200 transition-colors"
                    >
                        תרגול כרטיסיות
                    </button>
                    <button 
                        onClick={() => handleModeChange(AppMode.TEST)}
                        className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
                    >
                        התחל מבחן
                    </button>
                </div>
            </div>
          </div>
        );

      case AppMode.MENU:
      default:
        return (
          <LandingPage 
            hasWords={words.length > 0}
            onCreateList={() => handleModeChange(AppMode.CREATE_LIST)}
            onLoadList={() => fileInputRef.current?.click()}
            onContinue={() => handleModeChange(AppMode.PREVIEW)}
            fileInputRef={fileInputRef}
            onFileUpload={uploadList}
          />
        );
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