import { type ComputedRef, inject, type InjectionKey } from 'vue';

export type FormFieldState = 'default' | 'success' | 'error';

export type FormFieldContext = {
  id: ComputedRef<string>;
  describedBy: ComputedRef<string | undefined>;
  state: ComputedRef<FormFieldState>;
  disabled: ComputedRef<boolean>;
  required: ComputedRef<boolean>;
};

const formFieldKey: InjectionKey<FormFieldContext> = Symbol('ui-form-field');

export const provideFormFieldContext = (context: FormFieldContext) => context;

export const useFormFieldContext = () => inject(formFieldKey, null);

export const formFieldInjectionKey = formFieldKey;
