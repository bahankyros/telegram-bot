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
        }).then(async resp => {
            log(TAG, 'ai response', resp);
            
            let replyText = "";
            if (typeof resp === 'string') {
                replyText = resp;
            } else if (resp.choices && resp.choices.length > 0 && resp.choices[0].message) {
                replyText = resp.choices[0].message.content;
            } else if (resp.response) {
                replyText = resp.response;
            } else {
                replyText = JSON.stringify(resp);
            }

            // --- THE 5-CABINET DATABASE INTERCEPTOR ---
            try {
                const data = JSON.parse(replyText.trim());
                
                if (data.type === 'expense') {
                    await metadata.env.DB.prepare(
                        'INSERT INTO expenses (amount, category, description, owner) VALUES (?, ?, ?, ?)'
                    ).bind(data.amount, data.category, data.description, data.owner).run();
                    replyText = `✅ **Expense Logged!**\n💰 RM${data.amount} - ${data.category}\n📝 ${data.description}\n👤 ${data.owner}`;
                
                } else if (data.type === 'baby_log') {
                    await metadata.env.DB.prepare(
                        'INSERT INTO baby_logs (log_type, details, duration_minutes) VALUES (?, ?, ?)'
                    ).bind(data.log_type, data.details, data.duration_minutes || null).run();
                    replyText = `🍼 **Baby Logged!**\n📋 ${data.log_type}\n📝 ${data.details}`;
                
                } else if (data.type === 'task') {
                    await metadata.env.DB.prepare(
                        'INSERT INTO tasks (title, category, assignee, due_date) VALUES (?, ?, ?, ?)'
                    ).bind(data.title, data.category, data.assignee, data.due_date || null).run();
                    replyText = `✅ **Task Added!**\n📌 ${data.title}\n👤 ${data.assignee}`;
                
                } else if (data.type === 'shopping') {
                    await metadata.env.DB.prepare(
                        'INSERT INTO shopping_list (item_name, category) VALUES (?, ?)'
                    ).bind(data.item_name, data.category).run();
                    replyText = `🛒 **Added to Shopping List!**\n🛍️ ${data.item_name} (${data.category})`;
                
                } else if (data.type === 'schedule') {
                    await metadata.env.DB.prepare(
                        'INSERT INTO schedule (event_title, event_date, attendees, notes) VALUES (?, ?, ?, ?)'
                    ).bind(data.event_title, data.event_date, data.attendees, data.notes || null).run();
                    replyText = `📅 **Event Scheduled!**\n🎉 ${data.event_title}\n⏰ ${data.event_date}`;
                }

            } catch (e) {
                // If the AI outputs normal conversational text (like asking a follow-up question),
                // this catch block lets it pass straight through to Telegram!
                log(TAG, 'Not a JSON command, sending normal text.');
            }
            // -------------------------------------
            
            const chunks = chunkString(replyText);
            
            log(TAG, 'forwarding to telegram', chunks);
            return chunks.reduce((chain, chunk) => {
                return chain.then(() => {
                    return repo.sendMessage({
                        chat_id: metadata.chat_id, text: chunk,
                        reply_to_message_id: metadata.message_id,
                        parse_mode: "Markdown"
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
