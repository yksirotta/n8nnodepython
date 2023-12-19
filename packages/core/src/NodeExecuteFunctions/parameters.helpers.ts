import get from 'lodash/get';
import type {
	FieldType,
	IDataObject,
	IExecuteData,
	IGetNodeParameterOptions,
	INode,
	INodeExecutionData,
	INodeProperties,
	INodePropertyCollection,
	INodePropertyOptions,
	INodeType,
	IRunExecutionData,
	IWorkflowDataProxyAdditionalKeys,
	NodeParameterValueType,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import {
	ExpressionError,
	ApplicationError,
	NodeHelpers,
	validateFieldType,
	isResourceMapperValue,
} from 'n8n-workflow';

import { extractValue } from '../ExtractValue';
import type { ExtendedValidationResult } from '../Interfaces';

/**
 * Clean up parameter data to make sure that only valid data gets returned
 * INFO: Currently only converts Luxon Dates as we know for sure it will not be breaking
 */
function cleanupParameterData(inputData: NodeParameterValueType): void {
	if (typeof inputData !== 'object' || inputData === null) {
		return;
	}

	if (Array.isArray(inputData)) {
		inputData.forEach((value) => cleanupParameterData(value as NodeParameterValueType));
		return;
	}

	if (typeof inputData === 'object') {
		Object.keys(inputData).forEach((key) => {
			if (typeof inputData[key as keyof typeof inputData] === 'object') {
				if (inputData[key as keyof typeof inputData]?.constructor.name === 'DateTime') {
					// Is a special luxon date so convert to string
					inputData[key as keyof typeof inputData] =
						inputData[key as keyof typeof inputData]?.toString();
				} else {
					cleanupParameterData(inputData[key as keyof typeof inputData]);
				}
			}
		});
	}
}

const validateResourceMapperValue = (
	parameterName: string,
	paramValues: { [key: string]: unknown },
	node: INode,
	skipRequiredCheck = false,
): ExtendedValidationResult => {
	const result: ExtendedValidationResult = { valid: true, newValue: paramValues };
	const paramNameParts = parameterName.split('.');
	if (paramNameParts.length !== 2) {
		return result;
	}
	const resourceMapperParamName = paramNameParts[0];
	const resourceMapperField = node.parameters[resourceMapperParamName];
	if (!resourceMapperField || !isResourceMapperValue(resourceMapperField)) {
		return result;
	}
	const schema = resourceMapperField.schema;
	const paramValueNames = Object.keys(paramValues);
	for (let i = 0; i < paramValueNames.length; i++) {
		const key = paramValueNames[i];
		const resolvedValue = paramValues[key];
		const schemaEntry = schema.find((s) => s.id === key);

		if (
			!skipRequiredCheck &&
			schemaEntry?.required === true &&
			schemaEntry.type !== 'boolean' &&
			!resolvedValue
		) {
			return {
				valid: false,
				errorMessage: `The value "${String(key)}" is required but not set`,
				fieldName: key,
			};
		}

		if (schemaEntry?.type) {
			const validationResult = validateFieldType(key, resolvedValue, schemaEntry.type, {
				valueOptions: schemaEntry.options,
			});
			if (!validationResult.valid) {
				return { ...validationResult, fieldName: key };
			} else {
				// If it's valid, set the casted value
				paramValues[key] = validationResult.newValue;
			}
		}
	}
	return result;
};

const validateCollection = (
	node: INode,
	runIndex: number,
	itemIndex: number,
	propertyDescription: INodeProperties,
	parameterPath: string[],
	validationResult: ExtendedValidationResult,
): ExtendedValidationResult => {
	let nestedDescriptions: INodeProperties[] | undefined;

	if (propertyDescription.type === 'fixedCollection') {
		nestedDescriptions = (propertyDescription.options as INodePropertyCollection[]).find(
			(entry) => entry.name === parameterPath[1],
		)?.values;
	}

	if (propertyDescription.type === 'collection') {
		nestedDescriptions = propertyDescription.options as INodeProperties[];
	}

	if (!nestedDescriptions) {
		return validationResult;
	}

	const validationMap: {
		[key: string]: { type: FieldType; displayName: string; options?: INodePropertyOptions[] };
	} = {};

	for (const prop of nestedDescriptions) {
		if (!prop.validateType || prop.ignoreValidationDuringExecution) continue;

		validationMap[prop.name] = {
			type: prop.validateType,
			displayName: prop.displayName,
			options:
				prop.validateType === 'options' ? (prop.options as INodePropertyOptions[]) : undefined,
		};
	}

	if (!Object.keys(validationMap).length) {
		return validationResult;
	}

	for (const value of Array.isArray(validationResult.newValue)
		? (validationResult.newValue as IDataObject[])
		: [validationResult.newValue as IDataObject]) {
		for (const key of Object.keys(value)) {
			if (!validationMap[key]) continue;

			const fieldValidationResult = validateFieldType(key, value[key], validationMap[key].type, {
				valueOptions: validationMap[key].options,
			});

			if (!fieldValidationResult.valid) {
				throw new ExpressionError(
					`Invalid input for field '${validationMap[key].displayName}' inside '${propertyDescription.displayName}' in [item ${itemIndex}]`,
					{
						description: fieldValidationResult.errorMessage,
						runIndex,
						itemIndex,
						nodeCause: node.name,
					},
				);
			}
			value[key] = fieldValidationResult.newValue;
		}
	}

	return validationResult;
};

export const validateValueAgainstSchema = (
	node: INode,
	nodeType: INodeType,
	parameterValue: string | number | boolean | object | null | undefined,
	parameterName: string,
	runIndex: number,
	itemIndex: number,
) => {
	const parameterPath = parameterName.split('.');

	const propertyDescription = nodeType.description.properties.find(
		(prop) =>
			parameterPath[0] === prop.name && NodeHelpers.displayParameter(node.parameters, prop, node),
	);

	if (!propertyDescription) {
		return parameterValue;
	}

	let validationResult: ExtendedValidationResult = { valid: true, newValue: parameterValue };

	if (
		parameterPath.length === 1 &&
		propertyDescription.validateType &&
		!propertyDescription.ignoreValidationDuringExecution
	) {
		validationResult = validateFieldType(
			parameterName,
			parameterValue,
			propertyDescription.validateType,
		);
	} else if (
		propertyDescription.type === 'resourceMapper' &&
		parameterPath[1] === 'value' &&
		typeof parameterValue === 'object'
	) {
		validationResult = validateResourceMapperValue(
			parameterName,
			parameterValue as { [key: string]: unknown },
			node,
			propertyDescription.typeOptions?.resourceMapper?.mode !== 'add',
		);
	} else if (['fixedCollection', 'collection'].includes(propertyDescription.type)) {
		validationResult = validateCollection(
			node,
			runIndex,
			itemIndex,
			propertyDescription,
			parameterPath,
			validationResult,
		);
	}

	if (!validationResult.valid) {
		throw new ExpressionError(
			`Invalid input for '${
				validationResult.fieldName
					? String(validationResult.fieldName)
					: propertyDescription.displayName
			}' [item ${itemIndex}]`,
			{
				description: validationResult.errorMessage,
				runIndex,
				itemIndex,
				nodeCause: node.name,
			},
		);
	}
	return validationResult.newValue;
};

/** Returns the requested resolved (all expressions replaced) node parameters */
export function getNodeParameter(
	workflow: Workflow,
	runExecutionData: IRunExecutionData | null,
	runIndex: number,
	connectionInputData: INodeExecutionData[],
	node: INode,
	parameterName: string,
	itemIndex: number,
	mode: WorkflowExecuteMode,
	additionalKeys: IWorkflowDataProxyAdditionalKeys,
	executeData?: IExecuteData,
	fallbackValue?: unknown,
	options?: IGetNodeParameterOptions,
): NodeParameterValueType | object {
	const nodeType = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
	if (nodeType === undefined) {
		throw new ApplicationError('Node type is unknown so cannot return parameter value', {
			tags: { nodeType: node.type },
		});
	}

	const value = get(node.parameters, parameterName, fallbackValue);

	if (value === undefined) {
		throw new ApplicationError('Could not get parameter', { extra: { parameterName } });
	}

	if (options?.rawExpressions) {
		return value;
	}

	let returnData;

	try {
		returnData = workflow.expression.getParameterValue(
			value as NodeParameterValueType,
			runExecutionData,
			runIndex,
			itemIndex,
			node.name,
			connectionInputData,
			mode,
			additionalKeys,
			executeData,
			false,
			{},
			options?.contextNode?.name,
		);
		cleanupParameterData(returnData);
	} catch (e) {
		if (e instanceof ExpressionError && node.continueOnFail && node.type === 'n8n-nodes-base.set') {
			// https://linear.app/n8n/issue/PAY-684
			returnData = [{ name: undefined, value: undefined }];
		} else {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if ('context' in e) e.context.parameter = parameterName;
			(e as Error).cause = value;
			throw e;
		}
	}

	// This is outside the try/catch because it throws errors with proper messages
	if (options?.extractValue) {
		returnData = extractValue(returnData, parameterName, node, nodeType, itemIndex);
	}

	// Validate parameter value if it has a schema defined(RMC) or validateType defined
	returnData = validateValueAgainstSchema(
		node,
		nodeType,
		returnData,
		parameterName,
		runIndex,
		itemIndex,
	);

	return returnData;
}
