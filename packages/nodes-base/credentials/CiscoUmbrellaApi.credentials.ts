import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestHelper,
	INodeProperties,
} from 'n8n-workflow';

export interface CiscoUmbrellaApiCredential {
	apiKey: string;
	secret: string;
}

export class CiscoUmbrellaApi implements ICredentialType {
	name = 'ciscoUmbrellaApi';

	displayName = 'Cisco Umbrella API';

	documentationUrl = 'ciscoumbrella';

	icon = 'file:icons/Cisco.svg';

	httpRequestNode = {
		name: 'Cisco Umbrella',
		docsUrl: 'https://developer.cisco.com/docs/cloud-security/',
		apiBaseUrl: 'https://api.umbrella.com/',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Session Token',
			name: 'sessionToken',
			type: 'hidden',
			typeOptions: {
				expirable: true,
			},
			default: '',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
		{
			displayName: 'Secret',
			name: 'secret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
		},
	];

	async preAuthentication(this: IHttpRequestHelper, credentials: CiscoUmbrellaApiCredential) {
		const url = 'https://api.umbrella.com';
		const { access_token } = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${
				url.endsWith('/') ? url.slice(0, -1) : url
			}/auth/v2/token?grant_type=client_credentials`,
			auth: {
				username: credentials.apiKey,
				password: credentials.secret,
			},
			headers: {
				'Content-Type': 'x-www-form-urlencoded',
			},
		})) as { access_token: string };
		return { sessionToken: access_token };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.sessionToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.umbrella.com',
			url: '/users',
		},
	};
}
