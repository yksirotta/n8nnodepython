export type GenericValue = string | object | number | boolean | undefined | null;

export interface IDataObject {
	[key: string]: GenericValue | IDataObject | GenericValue[] | IDataObject[];
}

// The encrypted credentials which the nodes can access
export type CredentialInformation = string | number | boolean | IDataObject | IDataObject[];

// The encrypted credentials which the nodes can access
export interface ICredentialDataDecryptedObject {
	[key: string]: CredentialInformation;
}
