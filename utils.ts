export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

export const normalizeString = (str: string): string => {
  if (!str) return '';
  // Remove punctuation, extra spaces, and convert to lowercase
  // Specifically handles Hebrew by not being too aggressive on unicode ranges for letters,
  // but removing standard punctuation.
  return str
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLowerCase();
};

export const checkAnswer = (correct: string, actual: string): boolean => {
  return normalizeString(correct) === normalizeString(actual);
};
