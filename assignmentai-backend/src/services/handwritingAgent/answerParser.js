/**
 * answerParser.js
 *
 * Parses raw OCR-extracted text into structured question-answer pairs.
 * Detects question numbers, handles multi-page answers, and flags issues.
 */

/**
 * Common patterns for detecting question numbers in handwritten text.
 */
const QUESTION_PATTERNS = [
  /^(?:Q|Que|Question|Ques)[\s.:-]*(\d+)/im,
  /^(\d+)\s*[.):-]/m,
  /^(?:Ans|Answer|A)[\s.:-]*(\d+)/im,
  /^\((\d+)\)/m,
  /^#\s*(\d+)/m,
];

/**
 * Parse the full extracted text into structured question-answer pairs.
 *
 * @param {string} fullText         - Complete extracted text (all pages joined)
 * @param {Object} [options]
 * @param {number} [options.totalQuestions]  - Expected number of questions (from assignment)
 * @param {string} [options.questionText]   - Question paper text for matching
 * @returns {{ pairs: Array<{ questionNumber: number, questionLabel: string, answer: string }>, unmatchedText: string }}
 */
function parseAnswers(fullText, options = {}) {
  const { totalQuestions = 0 } = options;

  if (!fullText || fullText.trim().length < 5) {
    return {
      pairs: [],
      unmatchedText: fullText || '',
      parseConfidence: 0,
    };
  }

  // Remove page break markers
  const cleanedText = fullText.replace(/---PAGE BREAK---/g, '\n');

  // Split by lines and try to detect question boundaries
  const lines = cleanedText.split('\n');
  const segments = [];
  let currentSegment = { questionNumber: null, label: '', lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentSegment.lines.length > 0) currentSegment.lines.push('');
      continue;
    }

    // Try to detect a question number
    let detectedNumber = null;
    let detectedLabel = '';
    for (const pattern of QUESTION_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        detectedNumber = parseInt(match[1], 10);
        detectedLabel = trimmed;
        break;
      }
    }

    if (detectedNumber !== null && detectedNumber !== currentSegment.questionNumber) {
      // Save current segment if it has content
      if (currentSegment.questionNumber !== null || currentSegment.lines.length > 0) {
        segments.push({ ...currentSegment });
      }
      // Start new segment
      currentSegment = {
        questionNumber: detectedNumber,
        label: detectedLabel,
        lines: [],
      };
    } else {
      currentSegment.lines.push(trimmed);
    }
  }

  // Push the last segment
  if (currentSegment.questionNumber !== null || currentSegment.lines.length > 0) {
    segments.push({ ...currentSegment });
  }

  // Build structured pairs
  const pairs = [];
  let unmatchedLines = [];

  for (const seg of segments) {
    if (seg.questionNumber !== null) {
      pairs.push({
        questionNumber: seg.questionNumber,
        questionLabel: seg.label,
        answer: seg.lines.join('\n').trim(),
      });
    } else {
      unmatchedLines.push(...seg.lines);
    }
  }

  // Sort by question number
  pairs.sort((a, b) => a.questionNumber - b.questionNumber);

  // If we couldn't detect any question numbers, treat the whole text as a single answer
  if (pairs.length === 0 && cleanedText.trim().length > 10) {
    pairs.push({
      questionNumber: 1,
      questionLabel: 'Full Answer (no question numbers detected)',
      answer: cleanedText.trim(),
    });
  }

  // Calculate parse confidence
  let parseConfidence = 1.0;
  if (pairs.length === 0) parseConfidence = 0;
  else if (totalQuestions > 0 && pairs.length < totalQuestions * 0.5) parseConfidence = 0.5;
  else if (unmatchedLines.length > lines.length * 0.3) parseConfidence = 0.7;

  console.log(
    `[AnswerParser] Parsed ${pairs.length} Q&A pairs, ` +
    `${unmatchedLines.length} unmatched lines, confidence=${parseConfidence}`
  );

  return {
    pairs,
    unmatchedText: unmatchedLines.join('\n').trim(),
    parseConfidence,
  };
}

module.exports = { parseAnswers };
