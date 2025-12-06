import React, { useState, useRef } from 'react';
import { WordItem, AppMode, TestResult } from './types';
import { InputSection } from './components/InputSection';
import { PracticeMode } from './components/PracticeMode';
import { TestMode } from './components/TestMode';
import { ResultScreen } from './components/ResultScreen';

export default function App() {
  const [words, setWords] = useState<WordItem[]>([]);
  const [mode, setMode] = useState<AppMode>(AppMode.MENU);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveList = (newList: WordItem[]) => {
    setWords(newList);
    setMode(AppMode.PREVIEW);
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
                        setMode(AppMode.PREVIEW);
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
            onCancel={() => setMode(AppMode.MENU)} 
            initialList={words}
          />
        );

      case AppMode.PRACTICE:
        return <PracticeMode words={words} onBack={() => setMode(AppMode.PREVIEW)} />;

      case AppMode.TEST:
        return (
          <TestMode 
            words={words} 
            onComplete={(results) => {
                setTestResults(results);
                setMode(AppMode.RESULT);
            }} 
            onCancel={() => setMode(AppMode.PREVIEW)} 
          />
        );

      case AppMode.RESULT:
        return (
            <ResultScreen 
                results={testResults} 
                onHome={() => setMode(AppMode.MENU)}
                onRetry={() => setMode(AppMode.TEST)}
            />
        );

      case AppMode.PREVIEW:
        return (
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-4xl w-full mx-auto flex flex-col h-[80vh]">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">סקירת מילים</h2>
                <div className="flex gap-2">
                     <button onClick={downloadList} className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded text-sm font-medium">
                        שמור לקובץ
                     </button>
                     <button onClick={() => setMode(AppMode.CREATE_LIST)} className="text-gray-600 hover:bg-gray-100 px-3 py-2 rounded text-sm font-medium">
                        ערוך רשימה
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

            <div className="mt-6 flex justify-between gap-4">
                <button 
                    onClick={() => setMode(AppMode.MENU)}
                    className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl"
                >
                    חזרה
                </button>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setMode(AppMode.PRACTICE)}
                        className="px-6 py-3 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200 transition-colors"
                    >
                        תרגול כרטיסיות
                    </button>
                    <button 
                        onClick={() => setMode(AppMode.TEST)}
                        className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
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
          <div className="text-center max-w-lg mx-auto w-full">
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-l from-indigo-600 to-purple-600 mb-2">Dixi</h1>
            <p className="text-gray-500 mb-10 text-lg">שפר את אוצר המילים והכתיב שלך.</p>
            
            <div className="space-y-4">
                <button 
                    onClick={() => setMode(AppMode.CREATE_LIST)}
                    className="w-full bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-indigo-500 hover:shadow-md transition-all group flex items-center justify-between"
                >
                    <span className="text-xl font-bold text-gray-800 group-hover:text-indigo-600">צור רשימה חדשה</span>
                    <span className="text-2xl">📝</span>
                </button>

                <div className="relative">
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        accept=".json"
                        className="hidden" 
                        onChange={uploadList}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-indigo-500 hover:shadow-md transition-all group flex items-center justify-between"
                    >
                        <span className="text-xl font-bold text-gray-800 group-hover:text-indigo-600">טען רשימה שמורה</span>
                        <span className="text-2xl">📂</span>
                    </button>
                </div>

                {words.length > 0 && (
                     <button 
                        onClick={() => setMode(AppMode.PREVIEW)}
                        className="w-full bg-indigo-600 p-6 rounded-2xl shadow-lg hover:bg-indigo-700 transition-all text-white flex items-center justify-between"
                    >
                        <span className="text-xl font-bold">המשך עם הרשימה הנוכחית</span>
                        <span className="text-2xl">👉</span>
                    </button>
                )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 py-4 px-6 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold text-indigo-600 cursor-pointer" onClick={() => setMode(AppMode.MENU)}>Dixi</h1>
            {mode !== AppMode.MENU && (
                <button onClick={() => setMode(AppMode.MENU)} className="text-sm text-gray-500 hover:text-indigo-600">
                    יציאה לתפריט
                </button>
            )}
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        {renderContent()}
      </main>
    </div>
  );
}