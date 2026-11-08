import axiosClient from './axiosClient';

/**
 * Normalizes API response defensively, extracting payload from standard wrapper.
 */
function unwrap(res, fallback = null) {
  if (!res) return fallback;
  const body = res.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data ?? fallback;
  }
  return body ?? fallback;
}

/**
 * Sends a message to the Kirana & Wholesale AI Copilot.
 *
 * @param {object} params
 * @param {string} params.message - User prompt text
 * @param {Array<{role: string, content: string}>} [params.history] - Prior messages
 * @returns {Promise<{ reply: string, suggestedPrompts: Array<string>, isGeminiPowered?: boolean, timestamp: string }>}
 */
export async function sendChatMessage({ message, history = [] }) {
  const res = await axiosClient.post('/chat', { message, history });

  return unwrap(res, {
    reply: "I am having trouble answering right now. Please explore our Group Buys or Wholesaler Catalogue.",
    suggestedPrompts: [
      "Where is my order?",
      "Check my payment and refund status",
      "Suggest products for my store",
      "How does Group Buying save money?",
    ],
  });
}

export const chatApi = {
  sendChatMessage,
};

export default chatApi;
