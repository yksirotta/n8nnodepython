import type { IDataObject } from '@n8n_io/nodes-sdk';

export interface IIdentify {
	userId?: string;
	anonymousId?: string;
	traits?: IDataObject;
	context?: IDataObject;
	integrations?: IDataObject;
	timestamp?: string;
}
