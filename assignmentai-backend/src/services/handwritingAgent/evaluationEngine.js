/**
 * evaluationEngine.js
 *
 * Core AI evaluation logic for handwritten answers.
 * Takes structured Q&A pairs + rubric/answer key and calls Grok AI
 * for academic content evaluation. Marks are based on correctness,
 * concepts, completeness, and explanation quality — NOT handwriting appearance.
 */

const fetch = require('node-fetch');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Evaluate a single question-answer pair.
 *
 * @param {Object} params
 * @param {number} params.questionNumber
 * @param {string} params.questionText     - The actual question from the paper
 * @param {string} params.studentAnswer    - Extracted handwritten answer
 * @param {string} params.referenceAnswer  - Expected answer / answer key content
 * @param {number} params.maxMarks         - Maximum marks for this question
 * @param {string} [params.model]          - AI model to use
 * @param {number} [params.temperature]    - Model temperature
 * @param {string} [params.strictness]     - 'strict', 'balanced', or 'lenient'
 * @returns {Promise<Object>} Evaluation result
 */
async function evaluateAnswer(params) {
  const {
    questionNumber,
    questionText,
    studentAnswer,
    referenceAnswer,
    maxMarks,
    model = 'grok-3',
    temperature = 0.2,
    strictness = 'balanced',
  } = params;

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('GROK_API_KEY is not set');

  if (!studentAnswer || studentAnswer.trim().length < 3) {
    return {
      question_number: questionNumber,
      question_text: questionText,
      extracted_answer: studentAnswer || '',
      max_marks: maxMarks,
      marks_obtained: 0,
      percentage: 0,
      evaluation: 'No answer provided or answer is too short to evaluate.',
      correct_points: [],
      missing_points: ['Answer not attempted or unreadable'],
      incorrect_points: [],
      improvement_feedback: 'Please attempt this question with a clear, detailed answer.',
      eval_confidence: 1.0,
      needs_manual_review: false,
    };
  }

  const prompt = `You are an expert academic evaluator. Evaluate the student's HANDWRITTEN answer that was extracted via OCR.

IMPORTANT RULES:
- Evaluate ACADEMIC CONTENT only, NOT handwriting quality.
- Do NOT reduce marks because handwriting is messy, slow-looking, or stylistically different.
- **STRICT REQUIREMENT**: If the answer is missing key concepts asked in the question, you MUST deduct marks for those missing points. Do not give full marks for incomplete answers.
- **STRICT REQUIREMENT**: Only award marks for correct, relevant points. If the student answers a completely different question or topic, award 0 marks.
- Award partial marks for partially correct answers.
- Do NOT penalize the same mistake twice.
- If the reference answer is not available, use the question context and subject knowledge.
- Be ${strictness} in grading.

QUESTION ${questionNumber}:
---
${questionText || 'Question text not available'}
---

REFERENCE/EXPECTED ANSWER:
---
${referenceAnswer || 'No reference answer provided. Grade based on academic standards and the question.'}
---

STUDENT'S EXTRACTED ANSWER:
---
${studentAnswer}
---

MAXIMUM MARKS: ${maxMarks}

Evaluate and respond ONLY with valid JSON in this exact schema:
{
  "marks_obtained": <number, must be >= 0 and <= ${maxMarks}>,
  "percentage": <number, 0-100>,
  "evaluation": "<2-3 sentence overall evaluation>",
  "correct_points": ["<point 1>", "<point 2>"],
  "missing_points": ["<what the student missed>"],
  "incorrect_points": ["<what the student got wrong>"],
  "improvement_feedback": "<specific, constructive feedback>",
  "marking_breakdown": {
    "correctness": { "score": <n>, "max": <n> },
    "concepts": { "score": <n>, "max": <n> },
    "explanation": { "score": <n>, "max": <n> },
    "completeness": { "score": <n>, "max": <n> }
  },
  "eval_confidence": <0.0-1.0>
}`;

  const res = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Grok API error ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  const rawContent = json.choices?.[0]?.message?.content || '';
  const cleaned = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn(`[EvalEngine] Q${questionNumber}: Could not parse Grok response as JSON`);
    return {
      question_number: questionNumber,
      question_text: questionText,
      extracted_answer: studentAnswer,
      max_marks: maxMarks,
      marks_obtained: 0,
      percentage: 0,
      evaluation: 'Evaluation failed — AI response could not be parsed.',
      correct_points: [],
      missing_points: [],
      incorrect_points: [],
      improvement_feedback: '',
      eval_confidence: 0,
      needs_manual_review: true,
    };
  }

  // Clamp marks to valid range
  const marksObtained = Math.min(Math.max(parsed.marks_obtained || 0, 0), maxMarks);

  return {
    question_number: questionNumber,
    question_text: questionText,
    extracted_answer: studentAnswer,
    max_marks: maxMarks,
    marks_obtained: marksObtained,
    percentage: maxMarks > 0 ? Math.round((marksObtained / maxMarks) * 100) : 0,
    evaluation: parsed.evaluation || '',
    correct_points: parsed.correct_points || [],
    missing_points: parsed.missing_points || [],
    incorrect_points: parsed.incorrect_points || [],
    improvement_feedback: parsed.improvement_feedback || '',
    marking_breakdown: parsed.marking_breakdown || null,
    eval_confidence: parsed.eval_confidence || 0.5,
    needs_manual_review: (parsed.eval_confidence || 0.5) < 0.5,
  };
}

/**
 * Evaluate all question-answer pairs.
 *
 * @param {Array} pairs              - Parsed Q&A pairs from answerParser
 * @param {Object} evaluationContext
 * @param {string} evaluationContext.questionText    - Full question paper text
 * @param {string} evaluationContext.answerKeyText   - Full answer key text
 * @param {number} evaluationContext.maxMarks        - Total max marks
 * @param {number} evaluationContext.totalQuestions  - Expected question count
 * @param {string} [evaluationContext.model]
 * @param {number} [evaluationContext.temperature]
 * @param {string} [evaluationContext.strictness]
 * @param {Function} [onProgress] - Progress callback (0-100)
 * @returns {Promise<Array>} Array of evaluation results
 */
async function evaluateAllAnswers(pairs, evaluationContext, onProgress = async () => {}) {
  const {
    questionText = '',
    answerKeyText = '',
    maxMarks = 100,
    totalQuestions = pairs.length,
    model,
    temperature,
    strictness,
  } = evaluationContext;

  const perQuestionMax = totalQuestions > 0 ? Math.round(maxMarks / totalQuestions) : 10;
  const results = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];

    console.log(`[EvalEngine] Evaluating Q${pair.questionNumber} (${i + 1}/${pairs.length})...`);

    const result = await evaluateAnswer({
      questionNumber: pair.questionNumber,
      questionText: pair.questionLabel || `Question ${pair.questionNumber} from: ${questionText.slice(0, 500)}`,
      studentAnswer: pair.answer,
      referenceAnswer: answerKeyText,
      maxMarks: perQuestionMax,
      model,
      temperature,
      strictness,
    });

    results.push(result);

    // Report progress (evaluation is 60-90% of the total pipeline)
    const evalProgress = 60 + Math.round(((i + 1) / pairs.length) * 30);
    await onProgress(evalProgress);
  }

  console.log(`[EvalEngine] ✓ Evaluated ${results.length} answers`);
  return results;
}

module.exports = { evaluateAnswer, evaluateAllAnswers };
