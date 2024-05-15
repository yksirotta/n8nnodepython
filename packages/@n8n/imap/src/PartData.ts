/* eslint-disable @typescript-eslint/no-use-before-define */
import * as qp from 'quoted-printable';
import * as iconvlite from 'iconv-lite';
import * as utf8 from 'utf8';
import type { MessagePart } from './types';

export abstract class PartData {
	constructor(readonly buffer: Buffer) {}

	toString() {
		return this.buffer.toString();
	}

	static fromData(data: string, encoding: MessagePart['encoding'], charset?: string): PartData {
		if (encoding === 'BASE64') {
			return new Base64PartData(data);
		}

		if (encoding === 'QUOTED-PRINTABLE') {
			return new QuotedPrintablePartData(data, charset);
		}

		if (encoding === '7BIT') {
			return new SevenBitPartData(data);
		}

		if (encoding === '8BIT' || encoding === 'BINARY') {
			return new BinaryPartData(data, charset);
		}

		// if it gets here, the encoding is not currently supported
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		throw new Error(`Unknown encoding ${encoding}`);
	}
}

export class Base64PartData extends PartData {
	constructor(data: string) {
		super(Buffer.from(data, 'base64'));
	}
}

export class QuotedPrintablePartData extends PartData {
	constructor(data: string, charset?: string) {
		const decoded =
			charset?.toUpperCase() === 'UTF-8' ? utf8.decode(qp.decode(data)) : qp.decode(data);
		super(Buffer.from(decoded));
	}
}

export class SevenBitPartData extends PartData {
	constructor(data: string) {
		super(Buffer.from(data));
	}

	toString() {
		return this.buffer.toString('ascii');
	}
}

export class BinaryPartData extends PartData {
	constructor(
		data: string,
		readonly charset: string = 'utf-8',
	) {
		super(Buffer.from(data));
	}

	toString() {
		return iconvlite.decode(this.buffer, this.charset);
	}
}
