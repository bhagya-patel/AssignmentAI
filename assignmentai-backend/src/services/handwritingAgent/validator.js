/**
 * validator.js
 *
 * Final validation layer for handwritten evaluation results.
 * Ensures marks integrity, computes overall statistics, and flags
 * low-confidence evaluations for manual review.
 */

/**
 * Validate and finalize evaluation results.
 *
 * @param {Array}  questionResults - Array of per-question evaluation objects
 * @param {Object} metadata
 * @param {number} metadata.maxMarks       - Total max marks for the assignment
 * @param {number} metadata.totalQuestions - Expected number of questions
 * @param {number} metadata.ocrConfidence  - Average OCR confidence
 * @returns {Object} Validated and finalized report
 */
function validateAndFinalize(questionResults, metadata) {
  const { maxMarks = 100, totalQuestions = 0, ocrConfidence = 0 } = metadata;

  // 1. Validate individual question marks
  const validatedResults = questionResults.map((q) => {
    let marks = Math.max(0, q.marks_obtained || 0);
    marks = Math.min(marks, q.max_marks || 0);
    marks = Math.round(marks * 100) / 100; // Round to 2 decimal places

    return {
      ...q,
      marks_obtained: marks,
      percentage: q.max_marks > 0 ? Math.round((marks / q.max_marks) * 100) : 0,
      needs_manual_review:
        q.needs_manual_review ||
        (q.ocr_confidence !== undefined && q.ocr_confidence < 0.4) ||
        (q.eval_confidence !== undefined && q.eval_confidence < 0.4),
    };
  });

  // 2. Compute totals
  const totalObtained = validatedResults.reduce((sum, q) => sum + q.marks_obtained, 0);
  const totalMax = validatedResults.reduce((sum, q) => sum + (q.max_marks || 0), 0);

  // Ensure total doesn't exceed max marks
  const finalTotal = Math.min(totalObtained, maxMarks);
  const overallPercentage = maxMarks > 0 ? Math.round((finalTotal / maxMarks) * 100) : 0;

  // 3. Determine performance level
  let performanceLevel;
  if (overallPercentage >= 90) performanceLevel = 'Excellent';
  else if (overallPercentage >= 75) performanceLevel = 'Very Good';
  else if (overallPercentage >= 60) performanceLevel = 'Good';
  else if (overallPercentage >= 45) performanceLevel = 'Average';
  else if (overallPercentage >= 30) performanceLevel = 'Below Average';
  else performanceLevel = 'Needs Improvement';

  // 4. Identify strong and weak areas
  const sortedByPercentage = [...validatedResults].sort(
    (a, b) => (b.percentage || 0) - (a.percentage || 0)
  );

  const strongAreas = sortedByPercentage
    .filter((q) => q.percentage >= 70)
    .slice(0, 3)
    .map((q) => `Q${q.question_number}: ${q.percentage}% — ${(q.correct_points || [])[0] || 'Good performance'}`);

  const weakAreas = sortedByPercentage
    .filter((q) => q.percentage < 50)
    .slice(-3)
    .map((q) => `Q${q.question_number}: ${q.percentage}% — ${(q.missing_points || [])[0] || 'Needs improvement'}`);

  // 5. Collect improvement suggestions
  const suggestions = validatedResults
    .filter((q) => q.improvement_feedback && q.improvement_feedback.trim())
    .slice(0, 5)
    .map((q) => `Q${q.question_number}: ${q.improvement_feedback}`);

  // 6. Check if manual review is needed
  const needsManualReview = validatedResults.some((q) => q.needs_manual_review) || ocrConfidence < 0.4;

  // 7. Validate math: total should equal sum of parts
  const sumOfParts = validatedResults.reduce((s, q) => s + q.marks_obtained, 0);
  if (Math.abs(finalTotal - sumOfParts) > 0.01 && sumOfParts <= maxMarks) {
    console.warn(
      `[Validator] Total mismatch: finalTotal=${finalTotal}, sumOfParts=${sumOfParts}. Using sum.`
    );
  }

  const report = {
    question_results: validatedResults,
    total_marks: Math.round(Math.min(sumOfParts, maxMarks) * 100) / 100,
    max_marks: maxMarks,
    overall_percentage: overallPercentage,
    performance_level: performanceLevel,
    strong_areas: strongAreas,
    weak_areas: weakAreas,
    suggestions,
    ocr_confidence: Math.round(ocrConfidence * 100) / 100,
    needs_manual_review: needsManualReview,
    questions_evaluated: validatedResults.length,
    questions_expected: totalQuestions || validatedResults.length,
  };

  console.log(
    `[Validator] ✓ Final: ${report.total_marks}/${report.max_marks} (${report.overall_percentage}%) — ${report.performance_level}`
  );

  return report;
}

module.exports = { validateAndFinalize };
