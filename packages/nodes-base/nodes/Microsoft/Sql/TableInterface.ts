import type { IDataObject } from '@n8n_io/nodes-sdk';

export interface ITables {
	[key: string]: {
		[key: string]: IDataObject[];
	};
}
