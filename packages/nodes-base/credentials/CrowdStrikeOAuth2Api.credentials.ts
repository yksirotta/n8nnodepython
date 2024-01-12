import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestHelper,
	INodeProperties,
} from 'n8n-workflow';

export interface CrowdStrikeOAuth2ApiCredential {
	url: string;
	clientId: string;
	clientSecret: string;
}

export class CrowdStrikeOAuth2Api implements ICredentialType {
	name = 'crowdStrikeOAuth2Api';

	displayName = 'CrowdStrike OAuth2 API';

	documentationUrl = 'crowdstrike';

	icon = 'file:icons/CrowdStrike.svg';

	httpRequestNode = {
		name: 'CrowdStrike',
		docsUrl: 'https://developer.crowdstrike.com/',
		apiBaseUrl: '',
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
			displayName: 'URL',
			name: 'url',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
		},
	];

	async preAuthentication(this: IHttpRequestHelper, credentials: CrowdStrikeOAuth2ApiCredential) {
		const { url, clientId, clientSecret } = credentials;
		const { access_token } = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${
				url.endsWith('/') ? url.slice(0, -1) : url
			}/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}`,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
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
			baseURL: '={{$credentials?.url}}',
			url: 'user-management/queries/users/v1',
		},
	};
}
