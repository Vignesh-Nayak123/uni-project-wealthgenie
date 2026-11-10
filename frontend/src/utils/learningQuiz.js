export function evaluateQuizAnswer(quiz, selectedIndex) {
  if (!quiz || !Array.isArray(quiz.options) || quiz.options.length !== 3) {
    return null;
  }

  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= quiz.options.length
  ) {
    return null;
  }

  if (
    !Number.isInteger(quiz.correctIndex) ||
    quiz.correctIndex < 0 ||
    quiz.correctIndex >= quiz.options.length
  ) {
    return null;
  }

  return {
    isCorrect: selectedIndex === quiz.correctIndex,
    selectedOption: quiz.options[selectedIndex],
    correctOption: quiz.options[quiz.correctIndex],
    feedback: quiz.explanation,
  };
}

/**
 * True only when every question in a curated lesson quiz has been answered
 * correctly. Used to gate "complete concept" in the UI.
 */
export function isQuizSetComplete(quizSet, answers) {
  if (!Array.isArray(quizSet) || quizSet.length === 0) return false;
  if (!Array.isArray(answers) || answers.length !== quizSet.length) return false;

  return quizSet.every((quiz, index) => {
    const result = evaluateQuizAnswer(quiz, answers[index]);
    return Boolean(result?.isCorrect);
  });
}
