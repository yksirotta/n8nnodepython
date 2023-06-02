import glob from 'fast-glob';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { Readable } from 'stream';
import type { BinaryMetadata } from 'n8n-workflow';
import { jsonParse } from 'n8n-workflow';

import type { IBinaryDataConfig, IBinaryDataManager } from '../Interfaces';
import { FileNotFoundError } from '../errors';

const PREFIX_METAFILE = 'binarymeta';
const PREFIX_PERSISTED_METAFILE = 'persistedmeta';

const executionExtractionRegexp =
	/^(\w+)(?:[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})$/;

export class BinaryDataFileSystem implements IBinaryDataManager {
	private storagePath: string;

	private binaryDataTTL: number;

	private persistedBinaryDataTTL: number;

	constructor(config: IBinaryDataConfig) {
		this.storagePath = config.localStoragePath;
		this.binaryDataTTL = config.binaryDataTTL;
		this.persistedBinaryDataTTL = config.persistedBinaryDataTTL;
	}

	async init(startPurger = false): Promise<void> {
		if (startPurger) {
			setInterval(async () => this.deleteFlaggedFiles(), this.binaryDataTTL * 30000);
			setInterval(
				async () => this.deleteMarkedPersistedFiles(),
				this.persistedBinaryDataTTL * 30000,
			);
		}

		await this.assertFolder(this.storagePath);
		await this.assertFolder(this.getBinaryDataMetaPath());
		await this.assertFolder(this.getBinaryDataPersistMetaPath());

		await this.deleteFlaggedFiles();
		await this.deleteMarkedPersistedFiles();
	}

	async getMetadata(identifier: string): Promise<BinaryMetadata> {
		return jsonParse(await fs.readFile(this.getMetadataPath(identifier), 'utf-8'));
	}

	async storeMetadata(identifier: string, metadata: BinaryMetadata) {
		await fs.writeFile(this.getMetadataPath(identifier), JSON.stringify(metadata), 'utf-8');
	}

	private getMetadataPath(identifier: string): string {
		return this.resolveStoragePath(`${identifier}.metadata`);
	}

	getPath(identifier: string): string {
		return this.resolveStoragePath(identifier);
	}

	async getSize(identifier: string): Promise<number> {
		const stats = await fs.stat(this.getPath(identifier));
		return stats.size;
	}

	async copyFromFile(filePath: string, executionId: string): Promise<string> {
		const binaryDataId = await this.generateFileName(executionId);
		await this.addBinaryIdToPersistMeta(executionId, binaryDataId);
		await fs.cp(filePath, this.getPath(binaryDataId));
		return binaryDataId;
	}

	async clone(binaryDataId: string, executionId: string): Promise<string> {
		const newBinaryDataId = await this.generateFileName(executionId);
		await fs.copyFile(
			this.resolveStoragePath(binaryDataId),
			this.resolveStoragePath(newBinaryDataId),
		);
		// TODO: copy metadata
		// TODO: flag the new files
		return newBinaryDataId;
	}

	async store(binaryData: Buffer | Readable, executionId: string): Promise<string> {
		const binaryDataId = await this.generateFileName(executionId);
		await this.addBinaryIdToPersistMeta(executionId, binaryDataId);
		await this.saveToLocalStorage(binaryData, binaryDataId);
		return binaryDataId;
	}

	readAsStream(identifier: string, chunkSize?: number): Readable {
		return createReadStream(this.getPath(identifier), { highWaterMark: chunkSize });
	}

	async readAsBuffer(identifier: string): Promise<Buffer> {
		return this.retrieveFromLocalStorage(identifier);
	}

	async flagForDeletion(executionId: string): Promise<void> {
		const tt = new Date(new Date().getTime() + this.binaryDataTTL * 60000);
		return fs.writeFile(
			this.resolveStoragePath('meta', `${PREFIX_METAFILE}_${executionId}_${tt.valueOf()}`),
			'',
		);
	}

	private async deleteFlaggedFiles(): Promise<void> {
		return this.deleteMarkedFilesByMeta(this.getBinaryDataMetaPath(), PREFIX_METAFILE);
	}

	async deleteMarkedPersistedFiles(): Promise<void> {
		return this.deleteMarkedFilesByMeta(
			this.getBinaryDataPersistMetaPath(),
			PREFIX_PERSISTED_METAFILE,
		);
	}

	private async addBinaryIdToPersistMeta(executionId: string, identifier: string): Promise<void> {
		const currentTime = new Date().getTime();
		const timeAtNextHour = currentTime + 3600000 - (currentTime % 3600000);
		const timeoutTime = timeAtNextHour + this.persistedBinaryDataTTL * 60000;

		const filePath = this.resolveStoragePath(
			'persistMeta',
			`${PREFIX_PERSISTED_METAFILE}_${executionId}_${timeoutTime}`,
		);

		try {
			await fs.access(filePath);
		} catch {
			await fs.writeFile(filePath, identifier);
		}
	}

	private async deleteMarkedFilesByMeta(metaPath: string, filePrefix: string): Promise<void> {
		const currentTimeValue = new Date().valueOf();
		const metaFileNames = await glob(`${filePrefix}_*`, { cwd: metaPath });

		const executionIds = metaFileNames
			.map((f) => f.split('_') as [string, string, string])
			.filter(([prefix, , ts]) => {
				if (prefix !== filePrefix) return false;
				const execTimestamp = parseInt(ts, 10);
				return execTimestamp < currentTimeValue;
			})
			.map((e) => e[1]);

		const filesToDelete = [];
		const deletedIds = await this.deleteMany(executionIds);
		for (const executionId of deletedIds) {
			filesToDelete.push(
				...(await glob(`${filePrefix}_${executionId}_`, {
					absolute: true,
					cwd: metaPath,
				})),
			);
		}
		await Promise.all(filesToDelete.map(async (file) => fs.rm(file)));
	}

	async deleteMany(executionIds: string[]): Promise<string[]> {
		const set = new Set(executionIds);
		const fileNames = await fs.readdir(this.storagePath);
		const deletedIds = [];
		for (const fileName of fileNames) {
			const executionId = fileName.match(executionExtractionRegexp)?.[1];
			if (executionId && set.has(executionId)) {
				const filePath = this.resolveStoragePath(fileName);
				await Promise.all([fs.rm(filePath), fs.rm(`${filePath}.metadata`)]);
				deletedIds.push(executionId);
			}
		}
		return deletedIds;
	}

	async delete(identifier: string): Promise<void> {
		return this.deleteFromLocalStorage(identifier);
	}

	async removeDeletionFlag(executionId: string): Promise<void> {
		const dir = this.getBinaryDataPersistMetaPath();
		const metaFiles = await fs.readdir(dir);
		const promises = metaFiles.reduce<Array<Promise<void>>>((prev, curr) => {
			if (curr.startsWith(`${PREFIX_PERSISTED_METAFILE}_${executionId}_`)) {
				prev.push(fs.rm(path.join(dir, curr)));
			}
			return prev;
		}, []);
		await Promise.all(promises);
	}

	private async assertFolder(folder: string): Promise<void> {
		try {
			await fs.access(folder);
		} catch {
			await fs.mkdir(folder, { recursive: true });
		}
	}

	private async generateFileName(executionId: string): Promise<string> {
		const prefix = `execution=${executionId}`;
		await fs.mkdir(path.join(this.storagePath, prefix));
		return `${prefix}/${uuid()}`;
	}

	private getBinaryDataMetaPath() {
		return path.join(this.storagePath, 'meta');
	}

	private getBinaryDataPersistMetaPath() {
		return path.join(this.storagePath, 'persistMeta');
	}

	private async deleteFromLocalStorage(identifier: string) {
		return fs.rm(this.getPath(identifier));
	}

	private async saveToLocalStorage(binaryData: Buffer | Readable, identifier: string) {
		await fs.writeFile(this.getPath(identifier), binaryData);
	}

	private async retrieveFromLocalStorage(identifier: string): Promise<Buffer> {
		const filePath = this.getPath(identifier);
		try {
			return await fs.readFile(filePath);
		} catch (e) {
			throw new Error(`Error finding file: ${filePath}`);
		}
	}

	private resolveStoragePath(...args: string[]) {
		const returnPath = path.join(this.storagePath, ...args);
		if (path.relative(this.storagePath, returnPath).startsWith('..'))
			throw new FileNotFoundError('Invalid path detected');
		return returnPath;
	}
}
