import type { IDataObject } from '@n8n_io/nodes-sdk';
import type { IMembershipDto } from './CommonDtos';

enum UserStatusEnum {
	ACTIVE,
	PENDING_EMAIL_VERIFICATION,
	DELETED,
}

export interface IUserDto {
	activeWorkspace: string;
	defaultWorkspace: string;
	email: string;
	id: string;
	memberships: IMembershipDto[];
	name: string;
	profilePicture: string;
	settings: IDataObject;
	status: UserStatusEnum;
}
