export interface WordItem {
  id: string;
  term: string;
  definition?: string;
}

export enum AppMode {
  MENU = 'MENU',
  CREATE_LIST = 'CREATE_LIST',
  PREVIEW = 'PREVIEW',
  PRACTICE = 'PRACTICE',
  TEST = 'TEST',
  RESULT = 'RESULT',
}

export interface TestResult {
  wordId: string;
  term: string;
  userAnswer: string;
  isCorrect: boolean;
}
