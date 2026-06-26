import { chunkString, log, loge, TelegramApi } from '#main';
import { prompts } from '../../res.mjs';

const TAG = 'cloudflareLLMAiApi';
const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const AI_ROLE = prompts.mainSystem;
const CHAT_ACTION = 'typing';

export default function call(metadata) {
    log(TAG, 'api request');

    // Grab the full sentence so the first word isn't deleted!
    const userMessage = metadata.update?.message?.text || metadata.msg;

    if (!userMessage) {
        throw new Error(`user prompt is empty`);
    }

    const repo = new TelegramApi(metadata.env.TELEGRAM_BOT_TOKEN);

    return repo.sendChatAction({ chat_id: metadata.chat_id, action: CHAT_ACTION })
        .then(() => {
            log(TAG, 'ai request', AI_MODEL, AI_ROLE, userMessage);
            
            // Use native Cloudflare AI binding (No buggy wrapper needed!)
            return metadata.env.AI.run(AI_MODEL, {
                messages: [
                    { role: 'system', content: AI_ROLE },
                    { role: 'user', content: userMessage }
                ]
            });
        }).then(resp => {
            log(TAG, 'ai response', resp);
            
            // Safety check: Grab the response text depending on how the model formats it
            const replyText = resp.response || resp; 
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
