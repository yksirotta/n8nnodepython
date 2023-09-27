import { Service } from 'typedi';
import { NextFunction, Response } from 'express';
import type {
	INodeListSearchResult,
	INodePropertyOptions,
	ResourceMapperFields,
} from 'n8n-workflow';
import { jsonParse } from 'n8n-workflow';
import { LoadNodeDetails } from 'n8n-core';

import { Authorized, Get, Middleware, RestController } from '@/decorators';
import {
	NodeListSearchRequest,
	NodeParameterOptionsRequest,
	NodesOptionsRequest,
	ResourceMapperRequest,
} from '@/requests';
import { getBase } from '@/WorkflowExecuteAdditionalData';
import { NodeTypes } from '@/NodeTypes';
import { BadRequestError } from '@/ResponseHelper';

@Service()
@Authorized()
@RestController('/node-details')
export class NodeDetailsController {
	constructor(private readonly nodeTypes: NodeTypes) {}

	@Middleware()
	parseQueryParams(req: NodesOptionsRequest, res: Response, next: NextFunction) {
		const { credentials, currentNodeParameters, nodeTypeAndVersion } = req.query;
		if (!nodeTypeAndVersion) {
			throw new BadRequestError('Parameter nodeTypeAndVersion is required.');
		}
		if (!currentNodeParameters) {
			throw new BadRequestError('Parameter currentNodeParameters is required.');
		}

		req.params = {
			nodeTypeAndVersion: jsonParse(nodeTypeAndVersion),
			currentNodeParameters: jsonParse(currentNodeParameters),
			credentials: credentials !== undefined ? jsonParse(credentials) : undefined,
		};

		next();
	}

	/** Returns parameter values which normally get loaded from an external API or get generated dynamically */
	@Get('/parameter-options')
	async getParameterOptions(req: NodeParameterOptionsRequest): Promise<INodePropertyOptions[]> {
		const { path, methodName, loadOptions } = req.query;
		const { credentials, currentNodeParameters, nodeTypeAndVersion } = req.params;
		const additionalData = await getBase(req.user.id, currentNodeParameters);
		const loadDataInstance = new LoadNodeDetails(
			nodeTypeAndVersion,
			this.nodeTypes,
			currentNodeParameters,
			credentials,
		);

		if (methodName) {
			return loadDataInstance.getParamOptionsViaMethodName(methodName, path, additionalData);
		}

		if (loadOptions) {
			return loadDataInstance.getParamOptionsViaLoadOptions(jsonParse(loadOptions), additionalData);
		}

		return [];
	}

	@Get('/list-search')
	async listSearch(req: NodeListSearchRequest): Promise<INodeListSearchResult | undefined> {
		const { path, methodName, filter, paginationToken } = req.query;
		if (!methodName) {
			throw new BadRequestError('Parameter methodName is required.');
		}

		const { credentials, currentNodeParameters, nodeTypeAndVersion } = req.params;
		const additionalData = await getBase(req.user.id, currentNodeParameters);
		const listSearchInstance = new LoadNodeDetails(
			nodeTypeAndVersion,
			this.nodeTypes,
			currentNodeParameters,
			credentials,
		);
		return listSearchInstance.getNodeListSearchResult(
			methodName,
			path,
			additionalData,
			filter,
			paginationToken,
		);
	}

	@Get('/mapping-fields')
	async getMappingFields(req: ResourceMapperRequest): Promise<ResourceMapperFields | undefined> {
		const { path, methodName } = req.query;
		if (!methodName) {
			throw new BadRequestError('Parameter methodName is required.');
		}

		const { credentials, currentNodeParameters, nodeTypeAndVersion } = req.params;
		const additionalData = await getBase(req.user.id, currentNodeParameters);
		const loadMappingOptionsInstance = new LoadNodeDetails(
			nodeTypeAndVersion,
			this.nodeTypes,
			currentNodeParameters,
			credentials,
		);

		return loadMappingOptionsInstance.getMapperFields(methodName, path, additionalData);
	}
}
