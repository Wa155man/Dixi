import React from 'react';
import { TestResult } from '../types.ts';

interface ResultScreenProps {
  results: TestResult[];
  onHome: () => void;
  onRetry: () => void;
}

const ResultScreen: React.FC<ResultScreenProps> = ({ results, onHome, onRetry }) => {
  const correctCount = results.filter(r => r.isCorrect).length;
  const percentage = Math.round((correctCount / results.length) * 100);

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

// Register
(window as any).Dixi.components.ResultScreen = ResultScreen;