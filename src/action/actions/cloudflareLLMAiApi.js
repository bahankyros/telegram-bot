import { Ai } from '@cloudflare/ai';
import { chunkString, log, loge, TelegramApi } from '#main';
import { prompts } from '../../res.mjs';

const TAG = 'cloudflareLLMAiApi';
const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const AI_ROLE = prompts.mainSystem;
const CHAT_ACTION = 'typing';

export default function call(metadata) {
    log(TAG, 'api request');

    // FIX: Grab the full sentence so the first word isn't deleted!
    const userMessage = metadata.update?.message?.text || metadata.msg;

    if (!userMessage) {
        throw new Error(`user prompt is empty`);
    }

    // FIX: Restored the Ai wrapper
    const ai = new Ai(metadata.env.AI);
    const repo = new TelegramApi(metadata.env.TELEGRAM_BOT_TOKEN);

    return repo.sendChatAction({ chat_id: metadata.chat_id, action: CHAT_ACTION })
        .then(() => {
            log(TAG, 'ai request', AI_MODEL, AI_ROLE, userMessage);
            return ai.run(AI_MODEL, {
                messages: [
                    { role: 'system', content: AI_ROLE },
                    { role: 'user', content: userMessage }
                ]
            });
        }).then(resp => {
            log(TAG, 'ai response', resp);
            const chunks = chunkString(resp.response);
            chunks.unshift(`model: ${AI_MODEL}`);
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
            // FIX: Print the actual error message so we can see it!
            loge(TAG, 'CRITICAL AI ERROR:', e.message, e.stack);
            throw new Error('api fail', { cause: e });
        });
}
