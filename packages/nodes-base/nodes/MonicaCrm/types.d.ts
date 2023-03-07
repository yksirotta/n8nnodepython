import type { IDataObject } from '@n8n_io/nodes-sdk';

export type LoaderGetResponse = {
	data: Array<{
		id: string;
		name: string;
	}>;
} & IDataObject;

export type Option = {
	value: string;
	name: string;
};
