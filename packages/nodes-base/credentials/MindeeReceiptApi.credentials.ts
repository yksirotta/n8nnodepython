import type { ICredentialType, IHttpRequestOptions, INodeProperties } from 'n8n-workflow';

export interface MindeeReceiptApiCredential {
	apiKey: string;
}

export class MindeeReceiptApi implements ICredentialType {
	name = 'mindeeReceiptApi';

	displayName = 'Mindee Receipt API';

	documentationUrl = 'mindee';

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
		{ apiKey }: MindeeReceiptApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		// @ts-ignore
		const url = requestOptions.url ? requestOptions.url : requestOptions.uri;
		if (url.includes('https://api.mindee.net/v1/')) {
			requestOptions.headers!.Authorization = `Token ${apiKey}`;
		} else {
			requestOptions.headers!['X-Inferuser-Token'] = `${apiKey}`;
		}
		return requestOptions;
	}
}
