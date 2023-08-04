/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Method used to hash the the OAuth and form/querystring data.
 */
export type HashFunction = (base_string: string, key: string) => string;

/**
 * Method used to generate the body hash.
 *
 * Note: the key is used for implementation HMAC algorithms for the body hash,
 * but typically it should return SHA1 hash of base_string.
 */
export type BodyHashFunction = (base_string: string, key: string) => string;

/** OAuth key/secret pair */
export interface Consumer {
	key: string;
	secret: string;
}

/** OAuth token key/secret pair */
export interface Token {
	key: string;
	secret: string;
}

/** OAuth data, excluding the signature */
export interface Data {
	oauth_consumer_key: string;
	oauth_nonce: string;
	oauth_signature_method: string;
	oauth_timestamp: number;
	oauth_version: string;
	oauth_token?: string;
	oauth_body_hash?: string;
}

/** OAuth data, including the signature */
export interface Authorization extends Data {
	oauth_signature: string;
}

/** Authorization header */
export interface Header {
	Authorization: string;
}

type SignatureMethod = 'PLAINTEXT' | 'HMAC-SHA256' | 'HMAC-SHA512';

/** Extra data */
type Param = Record<string, string | string[]>;

/** Request options */
export interface RequestOptions {
	url: string;
	method: string;
	data?: string | Record<string, unknown>;
	includeBodyHash?: boolean;
}

/**
 * OAuth options.
 */
export interface Options {
	consumer: Consumer;
	last_ampersand?: boolean;
	nonce_length?: number;
	parameter_separator?: string;
	realm?: string;
	signature_method?: SignatureMethod;
	version?: string;
	hash_function?: HashFunction;
	body_hash_function?: BodyHashFunction;
}

export class OAuth1Client {
	private readonly consumer: Consumer;

	private readonly nonce_length: number;

	private readonly version: string;

	private readonly parameter_separator: string;

	private readonly realm?: string;

	private readonly last_ampersand: boolean;

	private readonly signature_method: SignatureMethod;

	private readonly hash_function: HashFunction;

	private readonly body_hash_function: BodyHashFunction;

	constructor(opts: Options) {
		this.consumer = opts.consumer;
		this.nonce_length = opts.nonce_length ?? 32;
		this.version = opts.version ?? '1.0';
		this.parameter_separator = opts.parameter_separator ?? ', ';
		this.realm = opts.realm;
		this.last_ampersand = opts.last_ampersand ?? true;
		this.signature_method = opts.signature_method ?? 'PLAINTEXT';

		if (this.signature_method === 'PLAINTEXT' && !opts.hash_function) {
			opts.hash_function = (_, key) => key;
		}

		if (!opts.hash_function) {
			throw new Error('hash_function option is required');
		}

		this.hash_function = opts.hash_function;
		this.body_hash_function = opts.body_hash_function ?? opts.hash_function;
	}

	/** Sign a request */
	authorize(request: RequestOptions, token?: Token): Authorization {
		const oauth_data: Data = {
			oauth_consumer_key: this.consumer.key,
			oauth_nonce: this.getNonce(),
			oauth_signature_method: this.signature_method,
			oauth_timestamp: this.getTimeStamp(),
			oauth_version: this.version,
		};

		if (!token) {
			token = {};
		}

		if (token.key !== undefined) {
			oauth_data.oauth_token = token.key;
		}

		if (!request.data) {
			request.data = {};
		}

		if (request.includeBodyHash) {
			oauth_data.oauth_body_hash = this.getBodyHash(request, token.secret);
		}

		return {
			...oauth_data,
			oauth_signature: this.getSignature(request, token.secret, oauth_data),
		};
	}

	/** Generate the oauth signature (i.e. oauth_signature) */
	getSignature(
		request: RequestOptions,
		token_secret: string | undefined,
		oauth_data: Data,
	): string {
		return this.hash_function(
			this.getBaseString(request, oauth_data),
			this.getSigningKey(token_secret),
		);
	}

	/** Generate the body signature (i.e. oauth_body_hash) */
	getBodyHash(request: RequestOptions, token_secret?: string): string {
		const body = typeof request.data === 'string' ? request.data : JSON.stringify(request.data);
		return this.body_hash_function(body, this.getSigningKey(token_secret));
	}

	/** Encode the request attributes */
	getBaseString(request: RequestOptions, oauth_data: Data): string {
		return (
			request.method.toUpperCase() +
			'&' +
			this.percentEncode(this.getBaseUrl(request.url)) +
			'&' +
			this.percentEncode(this.getParameterString(request, oauth_data))
		);
	}

	/** Encode the oauth data and the request parameter */
	getParameterString(request: RequestOptions, oauth_data: Data): string {
		let base_string_data;
		if (oauth_data.oauth_body_hash) {
			base_string_data = this.sortObject(
				this.percentEncodeData({
					...oauth_data,
					...this.deParamUrl(request.url),
				}),
			);
		} else {
			base_string_data = this.sortObject(
				this.percentEncodeData({
					...oauth_data,
					...(typeof request.data === 'string' ? {} : request.data),
					...this.deParamUrl(request.url),
				}),
			);
		}

		let data_str = '';

		//base_string_data to string
		for (let i = 0; i < base_string_data.length; i++) {
			const key = base_string_data[i].key;
			const value = base_string_data[i].value;
			// check if the value is an array
			// this means that this key has multiple values
			if (value && Array.isArray(value)) {
				// sort the array first
				value.sort();

				let valString = '';
				// serialize all values for this key: e.g. formkey=formvalue1&formkey=formvalue2
				value.forEach(
					function (item, i) {
						valString += key + '=' + item;
						if (i < value.length) {
							valString += '&';
						}
					}.bind(this),
				);
				data_str += valString;
			} else {
				data_str += key + '=' + value + '&';
			}
		}

		//remove the last character
		return data_str.substring(0, data_str.length - 1);
	}

	/** Generate the signing key */
	getSigningKey(token_secret: string | undefined): string {
		token_secret = token_secret ?? '';

		if (!this.last_ampersand && !token_secret) {
			return this.percentEncode(this.consumer.secret);
		}

		return this.percentEncode(this.consumer.secret) + '&' + this.percentEncode(token_secret);
	}

	/** Return the the URL without its querystring */
	getBaseUrl(url: string): string {
		return url.split('?')[0];
	}

	/** Parse querystring / form data */
	deParam(str: string): Param {
		const arr = str.split('&');
		const data = {};

		for (let i = 0; i < arr.length; i++) {
			const item = arr[i].split('=');

			// '' value
			item[1] = item[1] || '';

			// check if the key already exists
			// this can occur if the QS part of the url contains duplicate keys like this: ?formkey=formvalue1&formkey=formvalue2
			if (data[item[0]]) {
				// the key exists already
				if (!Array.isArray(data[item[0]])) {
					// replace the value with an array containing the already present value
					data[item[0]] = [data[item[0]]];
				}
				// and add the new found value to it
				data[item[0]].push(decodeURIComponent(item[1]));
			} else {
				// it doesn't exist, just put the found value in the data object
				data[item[0]] = decodeURIComponent(item[1]);
			}
		}

		return data;
	}

	/** Parse querystring from an url */
	deParamUrl(url: string): Param {
		const tmp = url.split('?');
		return this.deParam(tmp[1]) ?? {};
	}

	/** Form data encoding */
	percentEncode(str: string): string {
		return encodeURIComponent(str)
			.replace(/\!/g, '%21')
			.replace(/\*/g, '%2A')
			.replace(/\'/g, '%27')
			.replace(/\(/g, '%28')
			.replace(/\)/g, '%29');
	}

	/** Percent Encode Object */
	private percentEncodeData(data: Param) {
		const result: Param = {};

		for (const key in data) {
			const value = data[key];
			result[this.percentEncode(key)] = Array.isArray(value)
				? value.map((val) => this.percentEncode(val))
				: this.percentEncode(value);
		}

		return result;
	}

	/** Convert OAuth authorization data to an http header */
	toHeader(oauth_data: Authorization): Header {
		const sorted = this.sortObject(oauth_data);

		let header_value = 'OAuth ';

		if (this.realm) {
			header_value += 'realm="' + this.realm + '"' + this.parameter_separator;
		}

		for (let i = 0; i < sorted.length; i++) {
			if (sorted[i].key.indexOf('oauth_') !== 0) continue;

			header_value +=
				this.percentEncode(sorted[i].key) +
				'="' +
				this.percentEncode(sorted[i].value) +
				'"' +
				this.parameter_separator;
		}

		return {
			//cut the last chars
			Authorization: header_value.substring(
				0,
				header_value.length - this.parameter_separator.length,
			),
		};
	}

	/** Create a random word characters string with input length */
	getNonce(): string {
		const word_characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let result = '';

		for (let i = 0; i < this.nonce_length; i++) {
			const index = Math.floor(Math.random() * word_characters.length);
			result += word_characters[index];
		}

		return result;
	}

	/** Get Current Unix TimeStamp */
	getTimeStamp(): number {
		return Math.floor(Date.now() / 1000);
	}

	////////////////////// HELPER FUNCTIONS //////////////////////
	/** Sort an object properties by keys */
	sortObject<O extends Record<string, unknown>, K extends string>(
		data: O,
	): Array<{ key: keyof O; value: O[K] }> {
		const keys = Object.keys(data);
		const result = [];

		keys.sort();

		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			result.push({
				key,
				value: data[key],
			});
		}

		return result;
	}
}
