import { chunkString, log, loge, TelegramApi } from '#main';
import { prompts } from '../../res.mjs';

const TAG = 'cloudflareLLMAiApi';
const AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const AI_ROLE = prompts.mainSystem;
const CHAT_ACTION = 'typing';

export default function call(metadata) {
    log(TAG, 'api request');

    const userMessage = metadata.update?.message?.text || metadata.msg;

    if (!userMessage) {
        throw new Error(`user prompt is empty`);
    }

    const repo = new TelegramApi(metadata.env.TELEGRAM_BOT_TOKEN);

    return repo.sendChatAction({ chat_id: metadata.chat_id, action: CHAT_ACTION })
        .then(() => {
            log(TAG, 'ai request', AI_MODEL, AI_ROLE, userMessage);
            
            return metadata.env.AI.run(AI_MODEL, {
                messages: [
                    { role: 'system', content: AI_ROLE },
                    { role: 'user', content: userMessage }
                ]
            });
        }).then(resp => {
            log(TAG, 'ai response', resp);
            
            // FIX: Safely open the box depending on which AI model you are using
            let replyText = "";
            if (typeof resp === 'string') {
                replyText = resp;
            } else if (resp.choices && resp.choices.length > 0 && resp.choices[0].message) {
                replyText = resp.choices[0].message.content; // Gemma / Newer format
            } else if (resp.response) {
                replyText = resp.response; // Old Llama format
            } else {
                replyText = JSON.stringify(resp); // Ultimate fallback
            }
            
            const chunks = chunkString(replyText);
            
            log(TAG, 'forwarding to telegram', chunks);
            return chunks.reduce((chain, chunk) => {
                return chain.then(() => {
                    return repo.sendMessage({
                        chat_id: metadata.chat_id, text: chunk,
                        reply_to_message_id: metadata.message_id
                    });
                });
            }, Promise.resolve());
        }).then(resp => {
            log(TAG, 'api success', resp);
        }).catch(e => {
            loge(TAG, 'CRITICAL AI ERROR:', e.message, e.stack);
            throw new Error('api fail', { cause: e });
        });
}
