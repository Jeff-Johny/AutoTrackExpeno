import OpenAI from 'openai';
import { DEFAULT_CATEGORIES } from '../utils/constants';

import { DEEPSEEK_API_KEY } from '@env';

const openai = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
});

export const aiService = {
    async categorizeSms(smsText: string) {
        try {
            console.log('[AI Service] Calling DeepSeek API...');

            const completion = await openai.chat.completions.create({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expense tracker assistant. Extract financial transaction details from SMS messages and return ONLY valid JSON, nothing else.'
                    },
                    {
                        role: 'user',
                        content: `Analyze the following SMS and extract financial transaction details. Return ONLY valid JSON.

SMS: "${smsText}"

Rules:
- ONLY mark isSpending=true for COMPLETED, SUCCESSFUL debit/spending transactions (money leaving the account).
- Mark isSpending=false for ALL of the following:
  * OTP messages (e.g. "Your OTP is 123456", "Use this code", "Do not share this OTP")
  * Credit/refund/cashback messages (money coming IN)
  * Balance inquiry messages
  * Failed or declined transactions
  * Pending or processing transactions
  * Promotional or marketing messages
  * Login alerts or security notifications
  * Any message that does NOT confirm a completed debit

Return ONLY a JSON object with these keys:
- isSpending: boolean (true ONLY for confirmed completed debit transactions)
- amount: number (the amount spent, 0 if isSpending is false)
- category: string (one of: ${DEFAULT_CATEGORIES.join(', ')})
- description: string (a short description of the expense)
- isCertain: boolean (true if you are very sure about the category, false if it's a guess)

Return ONLY the JSON object, no markdown, no code blocks.`
                    }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            });

            const responseText = completion.choices[0]?.message?.content;
            console.log('[AI Service] DeepSeek Raw Response:', responseText);

            if (!responseText) {
                console.log('[AI Service] No response from DeepSeek');
                return null;
            }

            // Parse JSON response
            const parsed = JSON.parse(responseText);
            console.log('[AI Service] DeepSeek Parsed JSON:', parsed);
            return parsed;
        } catch (error) {
            console.error('[AI Service] DeepSeek Categorization Error:', error);
            return null;
        }
    },
};

// Keep geminiService export for backwards compatibility
export const geminiService = aiService;
