import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IHttpRequestOptions,
	INodeCredentialTestResult,
} from 'n8n-workflow';
import type { BambooHrApiCredential } from '@credentials/BambooHrApi.credentials';

async function validateCredentials(
	this: ICredentialTestFunctions,
	decryptedCredentials: BambooHrApiCredential,
): Promise<any> {
	const credentials = decryptedCredentials;

	const { subdomain, apiKey } = credentials as {
		subdomain: string;
		apiKey: string;
	};

	const options: IHttpRequestOptions = {
		method: 'GET',
		auth: {
			username: apiKey,
			password: 'x',
		},
		url: `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/employees/directory`,
	};

	return await this.helpers.request(options);
}

export async function bambooHrApiCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted<BambooHrApiCredential>,
): Promise<INodeCredentialTestResult> {
	try {
		await validateCredentials.call(this, credential.data);
	} catch (error) {
		return {
			status: 'Error',
			message: 'The API Key included in the request is invalid',
		};
	}

	return {
		status: 'OK',
		message: 'Connection successful!',
	} as INodeCredentialTestResult;
}
