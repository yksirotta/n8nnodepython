import { Service } from 'typedi';
import { type PackageDirectoryLoader } from 'n8n-core';
import { InstalledNodesRepository } from '@db/repositories/installedNodes.repository';
import { InstalledPackagesRepository } from '@db/repositories/installedPackages.repository';
import { type InstalledPackages } from '@db/entities/InstalledPackages';

@Service()
export class CommunityNodesService {
	constructor(
		private readonly installedPackagesRepository: InstalledPackagesRepository,
		private readonly installedNodesRepository: InstalledNodesRepository,
	) {}

	async isPackageInstalled(packageName: string): Promise<boolean> {
		return this.installedPackagesRepository.exist({ where: { packageName } });
	}

	async findInstalledPackage(packageName: string): Promise<InstalledPackages | null> {
		return this.installedPackagesRepository.findOne({
			where: { packageName },
			relations: ['installedNodes'],
		});
	}

	async getAllInstalledPackages(): Promise<InstalledPackages[]> {
		return this.installedPackagesRepository.find({ relations: ['installedNodes'] });
	}

	async saveInstalledPackage(packageLoader: PackageDirectoryLoader): Promise<InstalledPackages> {
		const { packageJson, nodeTypes, loadedNodes } = packageLoader;
		const { name: packageName, version: installedVersion, author } = packageJson;
		const { installedPackagesRepository, installedNodesRepository } = this;

		return installedPackagesRepository.manager.transaction(async (transactionManager) => {
			const installedPackage = installedPackagesRepository.create({
				packageName,
				installedVersion,
				authorName: author?.name,
				authorEmail: author?.email,
			});
			await transactionManager.save(installedPackage);
			installedPackage.installedNodes = loadedNodes.map((loadedNode) =>
				installedNodesRepository.create({
					name: nodeTypes[loadedNode.name].type.description.displayName,
					type: loadedNode.name,
					latestVersion: String(loadedNode.version),
					package: installedPackage,
				}),
			);
			await transactionManager.save(installedPackage.installedNodes);
			return installedPackage;
		});
	}

	async removePackage(installedPackage: InstalledPackages): Promise<InstalledPackages> {
		return this.installedPackagesRepository.remove(installedPackage);
	}
}
