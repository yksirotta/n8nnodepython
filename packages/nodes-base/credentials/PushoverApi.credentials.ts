import type {
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export interface PushoverApiCredential {
	apiKey: string;
}

export class PushoverApi implements ICredentialType {
	name = 'pushoverApi';

	displayName = 'Pushover API';

	documentationUrl = 'pushover';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];

	async authenticate(
		{ apiKey }: PushoverApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		if (requestOptions.method === 'GET' && requestOptions.qs) {
			Object.assign(requestOptions.qs, { token: apiKey });
		} else if (requestOptions.body) {
			Object.assign(requestOptions.body, { token: apiKey });
		}
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.pushover.net/1',
			url: '=/licenses.json?token={{$credentials?.apiKey}}',
			method: 'GET',
		},
	};
}
