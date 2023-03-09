import type * as FormData from 'form-data';

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

export interface ICredentialTestRequest {
	request: any; //DeclarativeRestApiSettings.HttpRequestOptions;
	rules?: any; //IAuthenticateRuleResponseCode[] | IAuthenticateRuleResponseSuccessBody[];
}

export interface ICredentialTestRequestData {
	nodeType?: INodeType;
	testRequest: ICredentialTestRequest;
}

export interface ICredentialType {
	name: string;
	displayName: string;
	icon?: string;
	iconUrl?: string;
	extends?: string[];
	// properties: INodeProperties[];
	documentationUrl?: string;
	__overwrittenProperties?: string[];
	// authenticate?: IAuthenticate;
	// preAuthentication?: (
	// 	this: IHttpRequestHelper,
	// 	credentials: ICredentialDataDecryptedObject,
	// ) => Promise<IDataObject>;
	test?: ICredentialTestRequest;
	genericAuth?: boolean;
}

export interface INodeType {
	// description: INodeTypeDescription;
	// execute?(
	// 	this: IExecuteFunctions,
	// ): Promise<INodeExecutionData[][] | NodeExecutionWithMetadata[][] | null>;
	// executeSingle?(this: IExecuteSingleFunctions): Promise<INodeExecutionData>;
	// poll?(this: IPollFunctions): Promise<INodeExecutionData[][] | null>;
	// trigger?(this: ITriggerFunctions): Promise<ITriggerResponse | undefined>;
	// webhook?(this: IWebhookFunctions): Promise<IWebhookResponseData>;
	// hooks?: {
	// 	[key: string]: (this: IHookFunctions) => Promise<boolean>;
	// };
	// methods?: {
	// 	loadOptions?: {
	// 		[key: string]: (this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>;
	// 	};
	// 	listSearch?: {
	// 		[key: string]: (
	// 			this: ILoadOptionsFunctions,
	// 			filter?: string,
	// 			paginationToken?: string,
	// 		) => Promise<INodeListSearchResult>;
	// 	};
	// 	credentialTest?: {
	// 		// Contains a group of functions that test credentials.
	// 		[functionName: string]: ICredentialTestFunction;
	// 	};
	// };
	// webhookMethods?: {
	// 	[key: string]: IWebhookSetupMethods;
	// };
}

export type IHttpRequestMethods = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT';

export interface IHttpRequestOptions {
	url: string;
	baseURL?: string;
	headers?: IDataObject;
	method?: IHttpRequestMethods;
	body?: FormData | GenericValue | GenericValue[] | Buffer | URLSearchParams;
	qs?: IDataObject;
	arrayFormat?: 'indices' | 'brackets' | 'repeat' | 'comma';
	auth?: {
		username: string;
		password: string;
	};
	disableFollowRedirect?: boolean;
	encoding?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
	skipSslCertificateValidation?: boolean;
	returnFullResponse?: boolean;
	ignoreHttpStatusErrors?: boolean;
	proxy?: {
		host: string;
		port: number;
		auth?: {
			username: string;
			password: string;
		};
		protocol?: string;
	};
	timeout?: number;
	json?: boolean;
}

export type NodePropertyTypes =
	| 'boolean'
	| 'collection'
	| 'color'
	| 'dateTime'
	| 'fixedCollection'
	| 'hidden'
	| 'json'
	| 'notice'
	| 'multiOptions'
	| 'number'
	| 'options'
	| 'string'
	| 'credentialsSelect'
	| 'resourceLocator'
	| 'curlImport';

export interface INodePropertyTypeOptions {
	// alwaysOpenEditWindow?: boolean; // Supported by: json
	// codeAutocomplete?: CodeAutocompleteTypes; // Supported by: string
	// editor?: EditorTypes; // Supported by: string
	// loadOptionsDependsOn?: string[]; // Supported by: options
	// loadOptionsMethod?: string; // Supported by: options
	// loadOptions?: ILoadOptions; // Supported by: options
	// maxValue?: number; // Supported by: number
	// minValue?: number; // Supported by: number
	// multipleValues?: boolean; // Supported by: <All>
	// multipleValueButtonText?: string; // Supported when "multipleValues" set to true
	// numberPrecision?: number; // Supported by: number
	password?: boolean; // Supported by: string
	// rows?: number; // Supported by: string
	// showAlpha?: boolean; // Supported by: color
	// sortable?: boolean; // Supported when "multipleValues" set to true
	// expirable?: boolean; // Supported by: hidden (only in the credentials)
}

export type NodeParameterValue = string | number | boolean | undefined | null;
export type NodeParameterValueType =
	// TODO: Later also has to be possible to add multiple ones with the name name. So array has to be possible
	NodeParameterValue;
// | INodeParameters
// | INodeParameterResourceLocator
// | NodeParameterValue[]
// | INodeParameters[]
// | INodeParameterResourceLocator[];

export interface INodeProperties {
	displayName: string;
	name: string;
	type: NodePropertyTypes;
	typeOptions?: INodePropertyTypeOptions;
	default: NodeParameterValueType;
	description?: string;
	hint?: string;
	// displayOptions?: IDisplayOptions;
	// options?: Array<INodePropertyOptions | INodeProperties | INodePropertyCollection>;
	placeholder?: string;
	isNodeSetting?: boolean;
	noDataExpression?: boolean;
	required?: boolean;
	// routing?: INodePropertyRouting;
	credentialTypes?: Array<
		'extends:oAuth2Api' | 'extends:oAuth1Api' | 'has:authenticate' | 'has:genericAuth'
	>;
	// extractValue?: INodePropertyValueExtractor;
	// modes?: INodePropertyMode[];
	requiresDataPath?: 'single' | 'multiple';
}

export interface IRequestOptionsSimplifiedAuth {
	auth?: {
		username: string;
		password: string;
	};
	body?: IDataObject;
	headers?: IDataObject;
	qs?: IDataObject;
	url?: string;
	skipSslCertificateValidation?: boolean | string;
}

export interface IAuthenticateBase {
	type: string;
	properties:
		| {
				[key: string]: string;
		  }
		| IRequestOptionsSimplifiedAuth;
}

export interface IAuthenticateGeneric extends IAuthenticateBase {
	type: 'generic';
	properties: IRequestOptionsSimplifiedAuth;
}
