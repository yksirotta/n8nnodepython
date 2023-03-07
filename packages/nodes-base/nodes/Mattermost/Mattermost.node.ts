import type { INodeTypeBaseDescription, IVersionedNodeType } from '@n8n_io/nodes-sdk';
import { VersionedNodeType } from '@n8n_io/nodes-sdk';

import { MattermostV1 } from './v1/MattermostV1.node';

export class Mattermost extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'Mattermost',
			name: 'mattermost',
			icon: 'file:mattermost.svg',
			group: ['output'],
			subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
			description: 'Sends data to Mattermost',
			defaultVersion: 1,
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new MattermostV1(baseDescription),
		};

		super(nodeVersions, baseDescription);
	}
}
