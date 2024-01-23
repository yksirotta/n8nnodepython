import { constants as fsConstants, mkdirSync, accessSync } from 'fs';
import type { Logger } from '@/Logger';

export abstract class SourceControlBaseService {
	constructor(protected readonly logger: Logger) {}

	checkIfFoldersExists(folders: string[], createIfNotExists = true): boolean {
		// running these file access function synchronously to avoid race conditions
		let existed = true;
		folders.forEach((folder) => {
			try {
				accessSync(folder, fsConstants.F_OK);
			} catch {
				existed = false;
				if (createIfNotExists) {
					try {
						mkdirSync(folder, { recursive: true });
					} catch (error) {
						this.logger.error((error as Error).message);
					}
				}
			}
		});
		return existed;
	}
}
