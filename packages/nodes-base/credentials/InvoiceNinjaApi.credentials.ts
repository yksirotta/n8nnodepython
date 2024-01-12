import type {
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export interface InvoiceNinjaApiCredential {
	url: string;
	apiToken: string;
	secret: string;
}

export class InvoiceNinjaApi implements ICredentialType {
	name = 'invoiceNinjaApi';

	displayName = 'Invoice Ninja API';

	documentationUrl = 'invoiceNinja';

	properties: INodeProperties[] = [
		{
			displayName: 'URL',
			name: 'url',
			type: 'string',
			default: '',
			hint: 'Default URL for v4 is https://app.invoiceninja.com, for v5 it is https://invoicing.co',
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Secret',
			name: 'secret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			hint: 'This is optional, enter only if you did set a secret in your app and only if you are using v5',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.url}}',
			url: '/api/v1/clients',
			method: 'GET',
		},
	};

	async authenticate(
		{ apiToken, secret }: InvoiceNinjaApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const VERSION_5_TOKEN_LENGTH = 64;
		const tokenLength = apiToken.length;

		if (tokenLength < VERSION_5_TOKEN_LENGTH) {
			requestOptions.headers = {
				Accept: 'application/json',
				'X-Ninja-Token': apiToken,
			};
		} else {
			requestOptions.headers = {
				'Content-Type': 'application/json',
				'X-API-TOKEN': apiToken,
				'X-Requested-With': 'XMLHttpRequest',
				'X-API-SECRET': secret || '',
			};
		}
		return requestOptions;
	}
}
