import type { IWorkflowExecuteAdditionalData, NodeHelperFunctions } from 'n8n-workflow';
import { copyBinaryFile } from './binaryData.helpers';

export const getNodeHelperFunctions = (
	{ executionId }: IWorkflowExecuteAdditionalData,
	workflowId: string,
): NodeHelperFunctions => ({
	copyBinaryFile: async (filePath, fileName, mimeType) =>
		copyBinaryFile(workflowId, executionId!, filePath, fileName, mimeType),
});
