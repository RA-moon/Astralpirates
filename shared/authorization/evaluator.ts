import { AUTHORIZATION_CAPABILITIES, type AuthorizationCapability } from './capabilities';
import {
  buildAuthorizationContext,
  type AuthorizationContext,
  type AuthorizationContextInput,
} from './context';
import { evaluateCapabilityBinding } from './bindings';

export type AuthorizationResource = Record<string, unknown> | null | undefined;

export type AuthorizationDecision = {
  capability: AuthorizationCapability;
  allowed: boolean;
  context: AuthorizationContext;
};

const AUTHORIZATION_CAPABILITY_SET: ReadonlySet<AuthorizationCapability> = new Set(
  AUTHORIZATION_CAPABILITIES,
);

const assertCapability = (capability: string): AuthorizationCapability => {
  if (AUTHORIZATION_CAPABILITY_SET.has(capability as AuthorizationCapability)) {
    return capability as AuthorizationCapability;
  }
  throw new Error(`Unknown authorization capability: ${capability}`);
};

export const can = (
  capability: AuthorizationCapability,
  context: AuthorizationContextInput,
  resource?: AuthorizationResource,
): boolean => {
  const normalizedContext = buildAuthorizationContext(context);
  return evaluateCapabilityBinding(capability, normalizedContext, resource as any);
};

export const evaluateAuthorization = (
  capability: AuthorizationCapability | string,
  context: AuthorizationContextInput,
  resource?: AuthorizationResource,
): AuthorizationDecision => {
  const normalizedCapability = assertCapability(capability);
  const normalizedContext = buildAuthorizationContext(context);
  const allowed = evaluateCapabilityBinding(
    normalizedCapability,
    normalizedContext,
    resource as any,
  );
  return {
    capability: normalizedCapability,
    allowed,
    context: normalizedContext,
  };
};
