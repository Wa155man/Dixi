import React, { useState } from 'react';
import { WordItem } from '../types.ts';
import { generateId } from '../utils.ts';

interface InputSectionProps {
  onSave: (list: WordItem[]) => void;
  onCancel: () => void;
  initialList?: WordItem[];
}

export const InputSection: React.FC<InputSectionProps> = ({ onSave, onCancel, initialList }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'paste' | 'pairs'>('manual');
  
  // Manual Input State
  const [manualInputs, setManualInputs] = useState<{term: string}[]>(
     initialList && initialList.length > 0 
     ? initialList.map(w => ({term: w.term})) 
     : Array(10).fill({ term: '' })
  );

  // Paste Input State
  const [pasteContent, setPasteContent] = useState('');

  // Pairs Input State
  const [pairsContent, setPairsContent] = useState('');

  const handleManualChange = (index: number, value: string) => {
    const newInputs = [...manualInputs];
    newInputs[index] = { term: value };
    setManualInputs(newInputs);
  };

  const addMoreManual = () => {
    setManualInputs([...manualInputs, ...Array(10).fill({ term: '' })]);
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
          הזנה ידנית
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