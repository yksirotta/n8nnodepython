import type { ICredentialType, INodeProperties } from '@n8n_io/nodes-sdk';

export class TwakeServerApi implements ICredentialType {
	name = 'twakeServerApi';

	displayName = 'Twake Server API';

	documentationUrl = 'twake';

	properties: INodeProperties[] = [
		{
			displayName: 'Host URL',
			name: 'hostUrl',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Public ID',
			name: 'publicId',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Private API Key',
			name: 'privateApiKey',
			type: 'string',
			default: '',
		},
	];
}
