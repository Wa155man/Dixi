const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

const normalizeString = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLowerCase();
};

const checkAnswer = (correct: string, actual: string): boolean => {
  return normalizeString(correct) === normalizeString(actual);
};

// Expose to global namespace
(window as any).Dixi.utils = {
  generateId,
  normalizeString,
  checkAnswer
};