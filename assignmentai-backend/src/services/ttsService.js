/**
 * ttsService.js
 *
 * Integrates with ElevenLabs Text-to-Speech API.
 * Used by the /viva/tts route to convert AI questions
 * to high-quality spoken audio for the Viva Exam page.
 */

const axios = require('axios');

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// "Rachel" — a clear, professional female voice.
// Override via ELEVENLABS_VOICE_ID env var if needed.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

/**
 * Convert text to speech using ElevenLabs API.
 * @param {string} text - The text to convert to speech.
 * @returns {Promise<Buffer>} - Audio buffer (MP3).
 */
async function generateTTS(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set in environment variables');
  }

  const response = await axios.post(
    `${ELEVENLABS_API_URL}/${VOICE_ID}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'arraybuffer',
    }
  );

  return Buffer.from(response.data);
}

module.exports = { generateTTS };
