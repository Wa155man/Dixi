export interface WordItem {
  id: string;
  term: string;
  definition?: string;
}

// Assign Enum to global namespace for runtime access
(window as any).Dixi.types.AppMode = {
  MENU: 'MENU',
  CREATE_LIST: 'CREATE_LIST',
  PREVIEW: 'PREVIEW',
  PRACTICE: 'PRACTICE',
  TEST: 'TEST',
  RESULT: 'RESULT',
};

export interface TestResult {
  wordId: string;
  term: string;
  userAnswer: string;
  isCorrect: boolean;
}