import type { INodeProperties, INodePropertyTypeOptions } from 'n8n-workflow';

type Type = 'number' | 'string' | 'options';

abstract class Property<T> {
	abstract type: Type;

	protected _name: string | undefined; // TODO: make mandatory

	protected _displayName: string | undefined; // TODO: make mandatory

	protected _defaultValue: T | undefined; // TODO: make mandatory

	protected _required: boolean = false;

	protected _typeOptions: INodePropertyTypeOptions | undefined;

	name(value: string) {
		this._name = value;
		return this;
	}

	displayName(value: string) {
		this._displayName = value;
		return this;
	}

	default(value: T) {
		this._defaultValue = value;
		return this;
	}

	required(value: boolean = true) {
		this._required = value;
		return this;
	}

	typeOptions(value: INodePropertyTypeOptions) {
		this._typeOptions = value;
		return this;
	}

	toNodeProperty(): INodeProperties {
		const toReturn: INodeProperties = {
			type: this.type,
			name: this._name!,
			displayName: this._displayName!,
			default: this._defaultValue!,
		};
		if (this._typeOptions) toReturn.typeOptions = this._typeOptions;
		return toReturn;
	}
}

class NumberProperty extends Property<number> {
	override type = 'number' as Type;
}

class StringProperty extends Property<string> {
	override type = 'string' as Type;

	override _defaultValue = '';
}

class OptionsProperty extends Property<string> {
	override type = 'options' as Type;

	private _values: Record<string, string> = {};

	values(optionValues: Record<string, string>) {
		this._values = optionValues;
		return this;
	}

	toNodeProperty(): INodeProperties {
		const toReturn = super.toNodeProperty();
		if (this._values)
			toReturn.options = Object.entries(this._values).map(([value, name]) => ({ name, value }));
		return toReturn;
	}
}

class PropertiesObject {
	constructor(readonly properties: Record<string, Property<any>>) {}

	toNodeProperties(): INodeProperties[] {
		const toReturn: INodeProperties[] = [];
		for (const [name, prop] of Object.entries(this.properties)) {
			toReturn.push(prop.name(name).toNodeProperty());
		}
		return toReturn;
	}
}

export const number = () => new NumberProperty();
export const string = () => new StringProperty();
export const options = () => new OptionsProperty();
export const object = (fields: Record<string, Property<any>>) => new PropertiesObject(fields);

export type InferProps<T> = any;
