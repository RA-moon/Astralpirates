let idCounter = 0;

export const useStableId = (prefix = 'ui'): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};
