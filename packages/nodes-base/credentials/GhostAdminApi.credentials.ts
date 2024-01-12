import type {
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import jwt from 'jsonwebtoken';

export interface GhostAdminApiCredential {
	url: string;
	apiKey: string;
}

export class GhostAdminApi implements ICredentialType {
	name = 'ghostAdminApi';

	displayName = 'Ghost Admin API';

	documentationUrl = 'ghost';

	properties: INodeProperties[] = [
		{
			displayName: 'URL',
			name: 'url',
			type: 'string',
			default: '',
			placeholder: 'http://localhost:3001',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];

	async authenticate(
		{ apiKey }: GhostAdminApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const [id, secret] = apiKey.split(':');
		const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
			keyid: id,
			algorithm: 'HS256',
			expiresIn: '5m',
			audience: '/v2/admin/',
		});

		requestOptions.headers = {
			...requestOptions.headers,
			Authorization: `Ghost ${token}`,
		};
		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url}}',
			url: '/ghost/api/v2/admin/pages/',
		},
	};
}
