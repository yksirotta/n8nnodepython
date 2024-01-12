import type {
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export interface ZendeskApiCredential {
	subdomain: string;
	email: string;
	apiToken: string;
}

export class ZendeskApi implements ICredentialType {
	name = 'zendeskApi';

	displayName = 'Zendesk API';

	documentationUrl = 'zendesk';

	properties: INodeProperties[] = [
		{
			displayName: 'Subdomain',
			name: 'subdomain',
			type: 'string',
			description: 'The subdomain of your Zendesk work environment',
			placeholder: 'company',
			default: '',
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			placeholder: 'name@email.com',
			default: '',
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
		},
	];

	async authenticate(
		credentials: ZendeskApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		requestOptions.auth = {
			username: `${credentials.email}/token`,
			password: credentials.apiToken,
		};
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '=https://{{$credentials.subdomain}}.zendesk.com/api/v2',
			url: '/ticket_fields.json',
		},
	};
}
