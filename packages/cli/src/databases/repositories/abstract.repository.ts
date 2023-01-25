import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

export abstract class AbstractRepository<Entity extends ObjectLiteral> {
	protected constructor(protected manager: EntityManager, protected entity: EntityTarget<Entity>) {}

	// TODO: make this protected after moving all add db code into repositories
	async transaction<T>(fn: (entityManager: EntityManager) => Promise<T>): Promise<T> {
		return this.manager.transaction(fn);
	}
}
