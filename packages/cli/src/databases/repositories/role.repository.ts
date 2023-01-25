import type { EntityManager, FindOneOptions } from 'typeorm';
import type { RoleNames, RoleScopes } from '../entities/Role';
import { Role } from '../entities/Role';
import { AbstractRepository } from './abstract.repository';

export class RoleRepository extends AbstractRepository<Role> {
	constructor(manager: EntityManager) {
		super(manager, Role);
	}

	async findGlobalOwnerRoleOrFail(): Promise<Role> {
		return this.findRoleOrFail('global', 'owner');
	}

	async findGlobalMemberRole(): Promise<Role | null> {
		return this.findRole('global', 'member');
	}

	async findGlobalMemberRoleOrFail(): Promise<Role> {
		return this.findRoleOrFail('global', 'member');
	}

	async findWorkflowOwnerRole(): Promise<Role | null> {
		return this.findRole('workflow', 'owner');
	}

	async findWorkflowOwnerRoleOrFail(): Promise<Role> {
		return this.findRoleOrFail('workflow', 'owner');
	}

	async findWorkflowEditorRoleOrFail(): Promise<Role> {
		return this.findRoleOrFail('workflow', 'editor');
	}

	async findCredentialOwnerRole(): Promise<Role | null> {
		return this.findRole('credential', 'owner');
	}

	async findCredentialOwnerRoleOrFail(): Promise<Role> {
		return this.findRoleOrFail('credential', 'owner');
	}

	async findCredentialUserRole(): Promise<Role | null> {
		return this.findRole('credential', 'user');
	}

	private async findRole(scope: RoleScopes, name: RoleNames): Promise<Role | null> {
		return this.manager.findOne(this.entity, this.findIdOptions(scope, name));
	}

	private async findRoleOrFail(scope: RoleScopes, name: RoleNames): Promise<Role> {
		return this.manager.findOneOrFail(this.entity, this.findIdOptions(scope, name));
	}

	private findIdOptions(scope: RoleScopes, name: RoleNames): FindOneOptions<Role> {
		return { where: { scope, name } };
	}
}
