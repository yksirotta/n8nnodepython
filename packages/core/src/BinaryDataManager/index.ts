import { readFile, stat } from 'fs/promises';
import type { BinaryMetadata, IBinaryData, INodeExecutionData } from 'n8n-workflow';
import prettyBytes from 'pretty-bytes';
import type { Readable } from 'stream';
import { BINARY_ENCODING } from 'n8n-workflow';
import type { BinaryDataBackend, IBinaryDataConfig, IBinaryDataManager } from '../Interfaces';
import { binaryToBuffer } from './utils';

export class BinaryDataManager {
	static instance: BinaryDataManager | undefined;

	private managers: Partial<Record<BinaryDataBackend, IBinaryDataManager>>;

	private binaryDataMode: BinaryDataBackend;

	private availableModes: BinaryDataBackend[];

	constructor(config: IBinaryDataConfig) {
		this.binaryDataMode = config.mode;
		this.availableModes = config.availableModes.split(',') as BinaryDataBackend[];
		this.managers = {};
	}

	static async init(config: IBinaryDataConfig, mainManager = false): Promise<void> {
		if (BinaryDataManager.instance) {
			throw new Error('Binary Data Manager already initialized');
		}

		BinaryDataManager.instance = new BinaryDataManager(config);

		if (BinaryDataManager.instance.availableModes.includes('filesystem')) {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			const { BinaryDataFileSystem } = await import('./FileSystem');
			BinaryDataManager.instance.managers.filesystem = new BinaryDataFileSystem(config);
			await BinaryDataManager.instance.managers.filesystem.init(mainManager);
		}

		return undefined;
	}

	static getInstance(): BinaryDataManager {
		if (!BinaryDataManager.instance) {
			throw new Error('Binary Data Manager not initialized');
		}

		return BinaryDataManager.instance;
	}

	async copyBinaryFile(
		binaryData: IBinaryData,
		filePath: string,
		executionId: string,
	): Promise<IBinaryData> {
		// If a manager handles this binary, copy over the binary file and return its reference id.
		const manager = this.managers[this.binaryDataMode];
		if (manager) {
			const identifier = await manager.copyFromFile(filePath, executionId);
			// Add data manager reference id.
			binaryData.id = this.generateBinaryId(identifier);

			// Prevent preserving data in memory if handled by a data manager.
			binaryData.data = this.binaryDataMode;

			const fileSize = await manager.getSize(identifier);
			binaryData.fileSize = prettyBytes(fileSize);

			await manager.storeMetadata(identifier, {
				fileName: binaryData.fileName,
				mimeType: binaryData.mimeType,
				fileSize,
			});
		} else {
			const { size } = await stat(filePath);
			binaryData.fileSize = prettyBytes(size);
			binaryData.data = await readFile(filePath, { encoding: BINARY_ENCODING });
		}

		return binaryData;
	}

	async storeBinaryData(
		binaryData: IBinaryData,
		input: Buffer | Readable,
		executionId: string,
	): Promise<IBinaryData> {
		// If a manager handles this binary, return the binary data with its reference id.
		const manager = this.managers[this.binaryDataMode];
		if (manager) {
			const identifier = await manager.store(input, executionId);

			// Add data manager reference id.
			binaryData.id = this.generateBinaryId(identifier);

			// Prevent preserving data in memory if handled by a data manager.
			binaryData.data = this.binaryDataMode;

			const fileSize = await manager.getSize(identifier);
			binaryData.fileSize = prettyBytes(fileSize);

			await manager.storeMetadata(identifier, {
				fileName: binaryData.fileName,
				mimeType: binaryData.mimeType,
				fileSize,
			});
		} else {
			const buffer = await binaryToBuffer(input);
			binaryData.data = buffer.toString(BINARY_ENCODING);
			binaryData.fileSize = prettyBytes(buffer.length);
		}

		return binaryData;
	}

	getBinaryStream(identifier: string, chunkSize?: number): Readable {
		const { mode, id } = this.splitBinaryModeFileId(identifier);
		const manager = this.managers[mode];
		if (manager) {
			return manager.readAsStream(id, chunkSize);
		}

		throw new Error('Storage mode used to store binary data not available');
	}

	async getBinaryDataBuffer(binaryData: IBinaryData): Promise<Buffer> {
		if (binaryData.id) {
			const { mode, id } = this.splitBinaryModeFileId(binaryData.id);
			const manager = this.managers[mode];
			if (manager) {
				return manager.readAsBuffer(id);
			}
			throw new Error('Storage mode used to store binary data not available');
		}

		return Buffer.from(binaryData.data, BINARY_ENCODING);
	}

	getBinaryPath(identifier: string): string {
		const { mode, id } = this.splitBinaryModeFileId(identifier);
		const manager = this.managers[mode];
		if (manager) {
			return manager.getPath(id);
		}

		throw new Error('Storage mode used to store binary data not available');
	}

	async getBinaryMetadata(identifier: string): Promise<BinaryMetadata> {
		const { mode, id } = this.splitBinaryModeFileId(identifier);
		const manager = this.managers[mode];
		if (manager) {
			return manager.getMetadata(id);
		}

		throw new Error('Storage mode used to store binary data not available');
	}

	async flagForDeletion(executionId: string): Promise<void> {
		const manager = this.managers[this.binaryDataMode];
		if (manager) {
			await manager.flagForDeletion(executionId);
		}
	}

	async flagManyForDeletion(executionIds: string[]): Promise<void> {
		const manager = this.managers[this.binaryDataMode];
		if (manager) {
			await Promise.all(executionIds.map(async (id) => manager.flagForDeletion(id)));
		}
	}

	async removeDeletionFlag(executionId: string): Promise<void> {
		const manager = this.managers[this.binaryDataMode];
		if (manager) {
			await manager.removeDeletionFlag(executionId);
		}
	}

	async deleteMany(executionIds: string[]): Promise<void> {
		const manager = this.managers[this.binaryDataMode];
		if (manager) {
			await manager.deleteMany(executionIds);
		}
	}

	async duplicateBinaryData(
		inputData: Array<INodeExecutionData[] | null>,
		executionId: string,
	): Promise<INodeExecutionData[][]> {
		if (inputData && this.binaryDataMode in this.managers) {
			const returnInputData = (inputData as INodeExecutionData[][]).map(
				async (executionDataArray) => {
					if (executionDataArray) {
						return Promise.all(
							executionDataArray.map(async (executionData) =>
								executionData.binary
									? this.duplicateBinaryDataInExecData(executionData, executionId)
									: executionData,
							),
						);
					}

					return executionDataArray;
				},
			);

			return Promise.all(returnInputData);
		}

		return inputData as INodeExecutionData[][];
	}

	private generateBinaryId(filename: string) {
		return `${this.binaryDataMode}:${filename}`;
	}

	private splitBinaryModeFileId(fileId: string): { mode: BinaryDataBackend; id: string } {
		const [mode, id] = fileId.split(':');
		return { mode: mode as BinaryDataBackend, id };
	}

	private async duplicateBinaryDataInExecData(
		executionData: INodeExecutionData,
		executionId: string,
	): Promise<INodeExecutionData> {
		const manager = this.managers[this.binaryDataMode];

		if (executionData.binary) {
			const binaryDataKeys = Object.keys(executionData.binary);
			const promises = binaryDataKeys.map(async (key: string) => {
				if (!executionData.binary) {
					return { key, newId: undefined };
				}

				const binaryDataId = executionData.binary[key].id;
				if (!binaryDataId) {
					return { key, newId: undefined };
				}

				return manager
					?.clone(this.splitBinaryModeFileId(binaryDataId).id, executionId)
					.then((filename) => ({
						newId: this.generateBinaryId(filename),
						key,
					}));
			});

			return Promise.all(promises).then((b) =>
				b.reduce((acc, curr) => {
					if (acc.binary && curr) {
						acc.binary[curr.key].id = curr.newId;
					}
					return acc;
				}, executionData),
			);
		}

		return executionData;
	}
}
