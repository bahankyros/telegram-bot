//import {Ai} from '@cloudflare/ai';
import {log, loge, TelegramApi} from '#main';

// TODO Cloudflare timeout, maybe bug on their side
// review feature later
// this is not working for the moment
const TAG = 'cloudflareSDAiApi';
const AI_MODEL = '@cf/stabilityai/stable-diffusion-xl-base-1.0';
const AI_STEPS = 20
const CHAT_ACTION = 'upload_photo';

//TODO Disabled until cloudflare bundle module correctly
// and make gateway working
// and fix timeout problem
export default function call(metadata) {
	log(TAG, 'api request'); // REMOVED the "return"
	if (!metadata.msg) {
		throw new Error(`user prompt is empty msg: ${metadata.msg}`)
	}
	
	const repo = new TelegramApi(metadata.env.TELEGRAM_BOT_TOKEN);
	return repo.sendChatAction({chat_id: metadata.chat_id, action: CHAT_ACTION})
		.then(() => {
			log(TAG, 'ai request');
            // UPDATED to use native Cloudflare AI syntax
			return metadata.env.AI.run(AI_MODEL, {
				prompt: metadata.msg,
				num_steps: AI_STEPS
			});
		}).then(resp => {
			log(TAG, 'creating blob file');
			const blob = new Blob([resp], {type: 'image/png'});
			log(TAG, 'forwarding to telegram');
			return repo.sendPhoto({
				chat_id: metadata.chat_id, photo: blob,
				reply_to_message_id: metadata.message_id
			});
		}).then(resp => {
			log(TAG, 'api success', resp);
		})
		.catch(e => {
			throw new Error('api fail', { cause: e });
		});
}
