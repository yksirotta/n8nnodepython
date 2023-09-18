import {
	AfterLoad,
	AfterUpdate,
	BeforeUpdate,
	Column,
	Entity,
	Index,
	OneToMany,
	ManyToOne,
	PrimaryGeneratedColumn,
	BeforeInsert,
} from 'typeorm';
import { IsEmail, IsString, Length } from 'class-validator';
import type { IUser, IUserSettings } from 'n8n-workflow';
import { Role } from './Role';
import { NoXss } from '../utils/customValidators';
import { objectRetriever, lowerCaser } from '../utils/transformers';
import { WithTimestamps, jsonColumnType } from './AbstractEntity';
import type { IPersonalizationSurveyAnswers } from '@/Interfaces';
import type { AuthIdentity } from './AuthIdentity';

export const MIN_PASSWORD_LENGTH = 8;

export const MAX_PASSWORD_LENGTH = 64;

@Entity()
export class User extends WithTimestamps implements IUser {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({
		length: 254,
		nullable: true,
		transformer: lowerCaser,
	})
	@Index({ unique: true })
	@IsEmail()
	email: string;

	@Column({ length: 32, nullable: true })
	@NoXss()
	@IsString({ message: 'First name must be of type string.' })
	@Length(1, 32, { message: 'First name must be $constraint1 to $constraint2 characters long.' })
	firstName: string;

	@Column({ length: 32, nullable: true })
	@NoXss()
	@IsString({ message: 'Last name must be of type string.' })
	@Length(1, 32, { message: 'Last name must be $constraint1 to $constraint2 characters long.' })
	lastName: string;

	@Column({
		type: jsonColumnType,
		nullable: true,
		transformer: objectRetriever,
	})
	personalizationAnswers: IPersonalizationSurveyAnswers | null;

	@Column({
		type: jsonColumnType,
		nullable: true,
	})
	settings: IUserSettings | null;

	@Column({ type: Boolean, default: false })
	disabled: boolean;

	@BeforeInsert()
	@BeforeUpdate()
	preUpsertHook(): void {
		this.email = this.email?.toLowerCase() ?? null;
	}
}

@Entity({ name: 'user' })
export class AuthUser extends User {
	@Column({ nullable: true })
	@IsString({ message: 'Password must be of type string.' })
	password: string;

	@OneToMany('AuthIdentity', 'user')
	authIdentities: AuthIdentity[];

	@Column()
	globalRoleId: string;

	@ManyToOne('Role', 'globalForUsers')
	globalRole: Role;

	/**
	 * Whether the user is pending setup completion.
	 */
	isPending: boolean;

	@AfterLoad()
	@AfterUpdate()
	computeIsPending(): void {
		this.isPending = this.password === null;
	}

	/**
	 * Whether the user is instance owner
	 */
	isOwner: boolean;

	@AfterLoad()
	computeIsOwner(): void {
		this.isOwner = this.globalRole?.name === 'owner';
	}
}

@Entity({ name: 'user' })
export class PublicAPIUser extends AuthUser {
	@Column({ type: String, nullable: true })
	@Index({ unique: true })
	apiKey: string | null;
}

@Entity({ name: 'user' })
export class UserWithMFA extends AuthUser {
	@Column({ type: Boolean, default: false })
	mfaEnabled: boolean;

	@Column({ type: String, nullable: true })
	mfaSecret: string;

	@Column({ type: 'simple-array', default: '' })
	mfaRecoveryCodes: string[];
}
