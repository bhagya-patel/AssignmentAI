/**
 * relevanceChecker.js
 *
 * Checks if the student's uploaded submission is relevant to the assigned topic.
 * Prevents students from uploading assignments for a different subject (e.g., uploading TOC for AI).
 */

const fetch = require('node-fetch');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Verify if the student's extracted text broadly matches the teacher's question paper.
 *
 * @param {string} studentText - The full extracted text from the student's PDF
 * @param {string} questionText - The original question paper text or assignment description
 * @param {string} [model] - AI model to use (default: grok-3)
 * @returns {Promise<{ is_relevant: boolean, reason: string }>}
 */
async function checkRelevance(studentText, questionText, model = 'grok-3') {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('GROK_API_KEY is not set');

  // If there's barely any text, it's not relevant or it's unreadable
  if (!studentText || studentText.trim().length < 20) {
    return {
      is_relevant: false,
      reason: 'The uploaded document contains almost no readable text.',
    };
  }

  // If we don't have question text, we can't strictly compare, so we assume it's relevant
  // (or we could just return true and let the evaluator handle it).
  if (!questionText || questionText.trim().length < 10) {
    console.warn('[RelevanceChecker] No question text available for comparison. Assuming relevant.');
    return { is_relevant: true, reason: 'No question text provided to compare against.' };
  }

  const prompt = `You are a strict academic verification assistant. 
Your task is to determine if a student's submitted assignment belongs to the SAME SUBJECT and TOPIC as the assigned question paper.

If the student uploads an assignment for a completely different subject (e.g., uploading a "Theory of Computation" assignment for an "Artificial Intelligence" assignment), you MUST flag it as irrelevant.

TEACHER's ASSIGNED QUESTIONS / TOPIC:
---
${questionText.slice(0, 2000)} -- (truncated if too long)
---

STUDENT's EXTRACTED SUBMISSION (First 3000 chars):
---
${studentText.slice(0, 3000)}
---

Does the student's submission appear to be answering the teacher's assigned topic?
(Allow minor deviations, but reject completely different subjects like TOC vs AI).

Respond ONLY with a valid JSON object in this format:
{
  "is_relevant": <true or false>,
  "reason": "<1 sentence explaining why it is or isn't relevant>"
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
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[RelevanceChecker] API error: ${errBody}`);
    // If the API fails, default to true so we don't block legitimate grading.
    // The evaluation engine will catch if they didn't answer the specific questions anyway.
    return { is_relevant: true, reason: 'API validation failed, proceeding by default.' };
  }

  const json = await res.json();
  const rawContent = json.choices?.[0]?.message?.content || '';
  const cleaned = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    console.log(`[RelevanceChecker] Result: is_relevant=${parsed.is_relevant}, reason=${parsed.reason}`);
    return {
      is_relevant: parsed.is_relevant === true || parsed.is_relevant === 'true',
      reason: parsed.reason || '',
    };
  } catch (err) {
    console.warn(`[RelevanceChecker] Failed to parse JSON response: ${cleaned}`);
    return { is_relevant: true, reason: 'Failed to parse verification response.' };
  }
}

module.exports = { checkRelevance };
