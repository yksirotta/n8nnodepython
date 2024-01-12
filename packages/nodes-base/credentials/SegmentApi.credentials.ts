import type { ICredentialType, IHttpRequestOptions, INodeProperties } from 'n8n-workflow';

export interface SegmentApiCredential {
	writekey: string;
}

export class SegmentApi implements ICredentialType {
	name = 'segmentApi';

	displayName = 'Segment API';

	documentationUrl = 'segment';

	properties: INodeProperties[] = [
		{
			displayName: 'Write Key',
			name: 'writekey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];

	async authenticate(
		{ writekey }: SegmentApiCredential,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const base64Key = Buffer.from(`${writekey}:`).toString('base64');
		requestOptions.headers!.Authorization = `Basic ${base64Key}`;
		return requestOptions;
	}
}
