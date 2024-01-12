import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export interface BitbucketApiCredential {
	username: string;
	appPassword: string;
}

export class BitbucketApi implements ICredentialType {
	name = 'bitbucketApi';

	displayName = 'Bitbucket API';

	documentationUrl = 'bitbucket';

	properties: INodeProperties[] = [
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
		},
		{
			displayName: 'App Password',
			name: 'appPassword',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];
}
