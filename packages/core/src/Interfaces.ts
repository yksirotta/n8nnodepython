import type {
	IPinData,
	IPollResponse,
	IRunData,
	IRunExecutionData,
	ITriggerResponse,
	IWorkflowBase,
	IWorkflowSettings as IWorkflowSettingsWorkflow,
	ValidationResult,
	WorkflowExecuteMode,
} from 'n8n-workflow';

export type Class<T = object, A extends unknown[] = unknown[]> = new (...args: A) => T;

export interface IResponseError extends Error {
	statusCode?: number;
}

export interface IWorkflowExecutionDataProcess {
	destinationNode?: string;
	isResumedFromWait?: boolean;
	executionMode: WorkflowExecuteMode;
	executionData?: IRunExecutionData;
	runData?: IRunData;
	pinData?: IPinData;
	retryOf?: string;
	sessionId?: string;
	startNodes?: string[];
	workflowData: IWorkflowBase;
	userId: string;
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
