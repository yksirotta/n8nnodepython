import type {
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export interface WooCommerceCredential {
	consumerKey: string;
	consumerSecret: string;
	url: string;
	includeCredentialsInQuery: boolean;
}

export class WooCommerceApi implements ICredentialType {
	name = 'wooCommerceApi';

	displayName = 'WooCommerce API';

	documentationUrl = 'wooCommerce';

	properties: INodeProperties[] = [
		{
			displayName: 'Consumer Key',
			name: 'consumerKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Consumer Secret',
			name: 'consumerSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'WooCommerce URL',
			name: 'url',
			type: 'string',
			default: '',
			placeholder: 'https://example.com',
		},
		{
			displayName: 'Include Credentials in Query',
			name: 'includeCredentialsInQuery',
			type: 'boolean',
			default: false,
			description:
				'Whether credentials should be included in the query. Occasionally, some servers may not parse the Authorization header correctly (if you see a “Consumer key is missing” error when authenticating over SSL, you have a server issue). In this case, you may provide the consumer key/secret as query string parameters instead.',
		},
	];

	async authenticate(
		credentials: WooCommerceCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		requestOptions.auth = {
			// @ts-ignore
			user: credentials.consumerKey,
			password: credentials.consumerSecret,
		};
		if (credentials.includeCredentialsInQuery && requestOptions.qs) {
			delete requestOptions.auth;
			Object.assign(requestOptions.qs, {
				consumer_key: credentials.consumerKey,
				consumer_secret: credentials.consumerSecret,
			});
		}
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url}}/wp-json/wc/v3',
			url: '/products/categories',
		},
	};
}
