import type { IDataObject } from '@n8n_io/nodes-sdk';

export interface ICompany {
	address?: IDataObject;
	company_name?: string;
	email_address?: string;
	fax_number?: IDataObject;
	notes?: string;
	opt_in_reason?: string;
	phone_number?: IDataObject;
	website?: string;
}
