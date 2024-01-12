import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import { getGoogleAccessToken } from '../../../GenericFunctions';
import type { GoogleApiCredential } from '@credentials/GoogleApi.credentials';

export async function googleApiCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted<GoogleApiCredential>,
): Promise<INodeCredentialTestResult> {
	try {
		const tokenRequest = await getGoogleAccessToken.call(this, credential.data!, 'sheetV2');
		if (!tokenRequest.access_token) {
			return {
				status: 'Error',
				message: 'Could not generate a token from your private key.',
			};
		}
	} catch (err) {
		return {
			status: 'Error',
			message: `Private key validation failed: ${err.message}`,
		};
	}

	return {
		status: 'OK',
		message: 'Connection successful!',
	};
}
