import type { Readable } from 'stream';
import type {
	IPollResponse,
	ITriggerResponse,
	IWorkflowSettings as IWorkflowSettingsWorkflow,
	BinaryMetadata,
	ValidationResult,
} from 'n8n-workflow';

export interface IProcessMessage {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data?: any;
	type: string;
}

export interface IResponseError extends Error {
	statusCode?: number;
}

export interface IUserSettings {
	encryptionKey?: string;
	tunnelSubdomain?: string;
	instanceId?: string;
}

export interface IWorkflowSettings extends IWorkflowSettingsWorkflow {
	errorWorkflow?: string;
	timezone?: string;
	saveManualRuns?: boolean;
}

export interface IWorkflowData {
	pollResponses?: IPollResponse[];
	triggerResponses?: ITriggerResponse[];
}

export type BinaryDataBackend = 'default' | 'filesystem';
export interface IBinaryDataConfig {
	mode: BinaryDataBackend;
	availableModes: string;
	localStoragePath: string;
	binaryDataTTL: number;
	persistedBinaryDataTTL: number;
}

export interface IBinaryDataManager {
	init(startPurger: boolean): Promise<void>;

	getMetadata(identifier: string): Promise<BinaryMetadata>;
	storeMetadata(identifier: string, metadata: BinaryMetadata): Promise<void>;

	getPath(identifier: string): string;
	getSize(filePath: string): Promise<number>;
	readAsBuffer(identifier: string): Promise<Buffer>;
	readAsStream(identifier: string, chunkSize?: number): Readable;
	store(binaryData: Buffer | Readable, executionId: string): Promise<string>;
	clone(binaryDataId: string, prefix: string): Promise<string>;
	copyFromFile(filePath: string, executionId: string): Promise<string>;
	delete(identifier: string): Promise<void>;
	deleteMany(executionIds: string[]): Promise<string[]>;

	flagForDeletion(executionId: string): Promise<void>;
	removeDeletionFlag(executionId: string): Promise<void>;
}

export namespace n8n {
	export interface PackageJson {
		name: string;
		version: string;
		n8n?: {
			credentials?: string[];
			nodes?: string[];
		};
		author?: {
			name?: string;
			email?: string;
		};
	}
}

export type ExtendedValidationResult = Partial<ValidationResult> & { fieldName?: string };
