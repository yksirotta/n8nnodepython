import type { INodeExecuteFunctions } from 'n8n-workflow';

import { getCredentialTestFunctions } from './credentialTest.functions';
import { getAdditionalKeys } from './expressions.helpers';
import { getExecutePollFunctions } from './poll.functions';
import { getExecuteTriggerFunctions } from './trigger.functions';
import { getExecuteFunctions } from './execute.functions';
import { getExecuteHookFunctions } from './executeHook.functions';
import { getExecuteSingleFunctions } from './executeSingle.functions';
import { getExecuteWebhookFunctions } from './executeWebhook.functions';
import { getLoadOptionsFunctions } from './loadOptions.functions';

export const NodeExecuteFunctions: INodeExecuteFunctions = {
	getAdditionalKeys,
	getCredentialTestFunctions,
	getLoadOptionsFunctions,
	getExecutePollFunctions,
	getExecuteTriggerFunctions,
	getExecuteFunctions,
	getExecuteSingleFunctions,
	getExecuteHookFunctions,
	getExecuteWebhookFunctions,
};
