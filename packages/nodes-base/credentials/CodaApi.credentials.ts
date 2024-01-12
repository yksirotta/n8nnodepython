import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export interface CodaApiCredential {
	accessToken: string;
}

export class CodaApi implements ICredentialType {
	name = 'codaApi';

	displayName = 'Coda API';

	documentationUrl = 'coda';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];
}
