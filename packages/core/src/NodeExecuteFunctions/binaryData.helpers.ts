import { Container } from 'typedi';
import FileType from 'file-type';
import { IncomingMessage } from 'http';
import { extension, lookup } from 'mime-types';
import path from 'path';
import type { Readable } from 'stream';
import { URL } from 'url';
import type {
	BinaryHelperFunctions,
	IBinaryData,
	INode,
	ITaskDataConnections,
	IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';
import { ApplicationError, NodeOperationError, fileTypeFromMimeType } from 'n8n-workflow';

import { BinaryDataService } from '../BinaryData/BinaryData.service';
import type { BinaryData } from '../BinaryData/types';

export function getBinaryPath(binaryDataId: string): string {
	return Container.get(BinaryDataService).getPath(binaryDataId);
}

/**
 * Returns binary file metadata
 */
export async function getBinaryMetadata(binaryDataId: string): Promise<BinaryData.Metadata> {
	return Container.get(BinaryDataService).getMetadata(binaryDataId);
}

/**
 * Returns binary file stream for piping
 */
export async function getBinaryStream(binaryDataId: string, chunkSize?: number): Promise<Readable> {
	return Container.get(BinaryDataService).getAsStream(binaryDataId, chunkSize);
}

export function assertBinaryData(
	inputData: ITaskDataConnections,
	node: INode,
	itemIndex: number,
	propertyName: string,
	inputIndex: number,
): IBinaryData {
	const binaryKeyData = inputData.main[inputIndex]![itemIndex]!.binary;
	if (binaryKeyData === undefined) {
		throw new NodeOperationError(node, 'No binary data exists on item!', {
			itemIndex,
		});
	}

	const binaryPropertyData = binaryKeyData[propertyName];
	if (binaryPropertyData === undefined) {
		throw new NodeOperationError(node, `Item has no binary property called "${propertyName}"`, {
			itemIndex,
		});
	}

	return binaryPropertyData;
}

/**
 * Returns binary data buffer for given item index and property name.
 */
export async function getBinaryDataBuffer(
	inputData: ITaskDataConnections,
	itemIndex: number,
	propertyName: string,
	inputIndex: number,
): Promise<Buffer> {
	const binaryData = inputData.main[inputIndex]![itemIndex]!.binary![propertyName]!;
	return Container.get(BinaryDataService).getAsBuffer(binaryData);
}

/** Store an incoming IBinaryData & related buffer using the configured binary data manager */
export async function setBinaryDataBuffer(
	binaryData: IBinaryData,
	bufferOrStream: Buffer | Readable,
	workflowId: string,
	executionId: string,
): Promise<IBinaryData> {
	return Container.get(BinaryDataService).store(
		workflowId,
		executionId,
		bufferOrStream,
		binaryData,
	);
}

export async function copyBinaryFile(
	workflowId: string,
	executionId: string,
	filePath: string,
	fileName: string,
	mimeType?: string,
): Promise<IBinaryData> {
	let fileExtension: string | undefined;
	if (!mimeType) {
		// If no mime type is given figure it out

		if (filePath) {
			// Use file path to guess mime type
			const mimeTypeLookup = lookup(filePath);
			if (mimeTypeLookup) {
				mimeType = mimeTypeLookup;
			}
		}

		if (!mimeType) {
			// read the first bytes of the file to guess mime type
			const fileTypeData = await FileType.fromFile(filePath);
			if (fileTypeData) {
				mimeType = fileTypeData.mime;
				fileExtension = fileTypeData.ext;
			}
		}
	}

	if (!fileExtension && mimeType) {
		fileExtension = extension(mimeType) || undefined;
	}

	if (!mimeType) {
		// Fall back to text
		mimeType = 'text/plain';
	}

	const returnData: IBinaryData = {
		mimeType,
		fileType: fileTypeFromMimeType(mimeType),
		fileExtension,
		data: '',
	};

	if (fileName) {
		returnData.fileName = fileName;
	} else if (filePath) {
		returnData.fileName = path.parse(filePath).base;
	}

	return Container.get(BinaryDataService).copyBinaryFile(
		workflowId,
		executionId,
		returnData,
		filePath,
	);
}

/**
 * Takes a buffer and converts it into the format n8n uses.
 * It encodes the binary data as base64 and adds metadata.
 */
export async function prepareBinaryData(
	binaryData: Buffer | Readable,
	executionId: string,
	workflowId: string,
	filePath?: string,
	mimeType?: string,
): Promise<IBinaryData> {
	let fileExtension: string | undefined;
	if (binaryData instanceof IncomingMessage) {
		if (!filePath) {
			try {
				const { responseUrl } = binaryData;
				filePath =
					binaryData.contentDisposition?.filename ??
					((responseUrl && new URL(responseUrl).pathname) ?? binaryData.req?.path)?.slice(1);
			} catch {}
		}
		if (!mimeType) {
			mimeType = binaryData.contentType;
		}
	}

	if (!mimeType) {
		// If no mime type is given figure it out

		if (filePath) {
			// Use file path to guess mime type
			const mimeTypeLookup = lookup(filePath);
			if (mimeTypeLookup) {
				mimeType = mimeTypeLookup;
			}
		}

		if (!mimeType) {
			if (Buffer.isBuffer(binaryData)) {
				// Use buffer to guess mime type
				const fileTypeData = await FileType.fromBuffer(binaryData);
				if (fileTypeData) {
					mimeType = fileTypeData.mime;
					fileExtension = fileTypeData.ext;
				}
			} else if (binaryData instanceof IncomingMessage) {
				mimeType = binaryData.headers['content-type'];
			} else {
				// TODO: detect filetype from other kind of streams
			}
		}
	}

	if (!fileExtension && mimeType) {
		fileExtension = extension(mimeType) || undefined;
	}

	if (!mimeType) {
		// Fall back to text
		mimeType = 'text/plain';
	}

	const returnData: IBinaryData = {
		mimeType,
		fileType: fileTypeFromMimeType(mimeType),
		fileExtension,
		data: '',
	};

	if (filePath) {
		if (filePath.includes('?')) {
			// Remove maybe present query parameters
			filePath = filePath.split('?').shift();
		}

		const filePathParts = path.parse(filePath as string);

		if (filePathParts.dir !== '') {
			returnData.directory = filePathParts.dir;
		}
		returnData.fileName = filePathParts.base;

		// Remove the dot
		const fileExtension = filePathParts.ext.slice(1);
		if (fileExtension) {
			returnData.fileExtension = fileExtension;
		}
	}

	return setBinaryDataBuffer(returnData, binaryData, workflowId, executionId);
}

export const getBinaryHelperFunctions = (
	{ executionId }: IWorkflowExecuteAdditionalData,
	workflowId: string,
): BinaryHelperFunctions => ({
	getBinaryPath,
	getBinaryStream,
	getBinaryMetadata,
	binaryToBuffer: async (body: Buffer | Readable) =>
		Container.get(BinaryDataService).toBuffer(body),
	prepareBinaryData: async (binaryData, filePath, mimeType) =>
		prepareBinaryData(binaryData, executionId!, workflowId, filePath, mimeType),
	setBinaryDataBuffer: async (data, binaryData) =>
		setBinaryDataBuffer(data, binaryData, workflowId, executionId!),
	copyBinaryFile: async () => {
		throw new ApplicationError('`copyBinaryFile` has been removed. Please upgrade this node.');
	},
});
