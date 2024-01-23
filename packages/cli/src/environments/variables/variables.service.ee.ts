import { Service } from 'typedi';
import type { IDataObject } from 'n8n-workflow';

import type { Variables } from '@db/entities/Variables';
import { generateNanoId } from '@db/utils/generators';
import { VariablesRepository } from '@db/repositories/variables.repository';
import { VariableCountLimitReachedError } from '@/errors/variable-count-limit-reached.error';
import { VariableValidationError } from '@/errors/variable-validation.error';
import { License } from '@/License';
import { InternalHooks } from '@/InternalHooks';
import { CacheService } from '@/services/cache/cache.service';

@Service()
export class VariablesService {
	constructor(
		private readonly cacheService: CacheService,
		private readonly variablesRepository: VariablesRepository,
		private readonly license: License,
		private readonly internalHooks: InternalHooks,
	) {}

	async getAllCached(): Promise<Variables[]> {
		const variables = await this.cacheService.get('variables', {
			refreshFn: async () => await this.findAll(),
		});
		return (variables as Array<Partial<Variables>>).map((v) => this.variablesRepository.create(v));
	}

	async getCount(): Promise<number> {
		return (await this.getAllCached()).length;
	}

	async getCached(id: string): Promise<Variables | null> {
		const variables = await this.getAllCached();
		const foundVariable = variables.find((variable) => variable.id === id);
		if (!foundVariable) {
			return null;
		}
		return this.variablesRepository.create(foundVariable as Partial<Variables>);
	}

	async getVariablesObject() {
		const variables = await this.getAllCached();
		return Object.freeze(
			variables.reduce((prev, curr) => {
				prev[curr.key] = curr.value;
				return prev;
			}, {} as IDataObject),
		);
	}

	async delete(id: string): Promise<void> {
		await this.variablesRepository.delete(id);
		await this.updateCache();
	}

	async updateCache(): Promise<void> {
		// TODO: log update cache metric
		const variables = await this.findAll();
		await this.cacheService.set('variables', variables);
	}

	async findAll(): Promise<Variables[]> {
		return await this.variablesRepository.find();
	}

	validateVariable(variable: Omit<Variables, 'id'>): void {
		if (variable.key.length > 50) {
			throw new VariableValidationError('key cannot be longer than 50 characters');
		}
		if (variable.key.replace(/[A-Za-z0-9_]/g, '').length !== 0) {
			throw new VariableValidationError('key can only contain characters A-Za-z0-9_');
		}
		if (variable.value?.length > 255) {
			throw new VariableValidationError('value cannot be longer than 255 characters');
		}
	}

	async create(variable: Omit<Variables, 'id'>): Promise<Variables> {
		if (!this.canCreateNewVariable(await this.getCount())) {
			throw new VariableCountLimitReachedError('Variables limit reached');
		}
		this.validateVariable(variable);

		void this.internalHooks.onVariableCreated({ variable_type: variable.type });
		const saveResult = await this.variablesRepository.save({
			...variable,
			id: generateNanoId(),
		});
		await this.updateCache();
		return saveResult;
	}

	async update(id: string, variable: Omit<Variables, 'id'>): Promise<Variables> {
		this.validateVariable(variable);
		await this.variablesRepository.update(id, variable);
		await this.updateCache();
		return (await this.getCached(id))!;
	}

	private canCreateNewVariable(variableCount: number): boolean {
		if (!this.license.isVariablesEnabled()) {
			return false;
		}
		// This defaults to -1 which is what we want if we've enabled
		// variables via the config
		const limit = this.license.getVariablesLimit();
		if (limit === -1) {
			return true;
		}
		return limit > variableCount;
	}
}
