import { N8N_IO_BASE_URL } from '@/constants';
import { IOnboardingCallPrompt, IUser } from '@/Interface';
import { get, post } from '@/utils/apiUtils';

const ONBOARDING_PROMPTS_ENDPOINT = '/prompts/onboarding';
const CONTACT_EMAIL_SUBMISSION_ENDPOINT = '/accounts/onboarding';

export async function fetchNextOnboardingPrompt(
	instanceId: string,
	currentUer: IUser,
): Promise<IOnboardingCallPrompt> {
	return await get(N8N_IO_BASE_URL, ONBOARDING_PROMPTS_ENDPOINT, {
		instance_id: instanceId,
		user_id: `${instanceId}#${currentUer.id}`,
		is_owner: currentUer.isOwner,
		survey_results: currentUer.personalizationAnswers,
	});
}

export async function applyForOnboardingCall(
	instanceId: string,
	currentUer: IUser,
	email: string,
): Promise<string> {
	try {
		const response = await post(N8N_IO_BASE_URL, ONBOARDING_PROMPTS_ENDPOINT, {
			instance_id: instanceId,
			user_id: `${instanceId}#${currentUer.id}`,
			email,
		});
		return response;
	} catch (e) {
		throw e;
	}
}

export async function submitEmailOnSignup(
	instanceId: string,
	currentUer: IUser,
	email: string | undefined,
	agree: boolean,
): Promise<string> {
	return await post(N8N_IO_BASE_URL, CONTACT_EMAIL_SUBMISSION_ENDPOINT, {
		instance_id: instanceId,
		user_id: `${instanceId}#${currentUer.id}`,
		email,
		agree,
	});
}
