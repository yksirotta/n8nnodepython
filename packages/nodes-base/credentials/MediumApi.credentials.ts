import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class MediumApi implements ICredentialType {
	name = 'mediumApi';

	displayName = 'Medium API';

	documentationUrl = 'medium';

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
