// Structural reduction of the inspected getActiveMemberRole return declaration.
// Local helpers are synthetic; no installed dependency declaration is changed.
interface OrganizationOptions {
  teams?: { enabled?: boolean };
  schema?: { member?: { additionalFields: Record<string, { type: string }> } };
  roles?: Record<string, unknown>;
}
type InferOrganizationRolesFromOption<O> =
  O extends { roles: infer R } ? Extract<keyof R, string> : 'owner' | 'admin' | 'member';
type FieldAttributeToObject<F> = { [K in keyof F]: string };
type Member<O extends OrganizationOptions> = (
  (O['teams'] extends {enabled: true} ? {role: InferOrganizationRolesFromOption<O>;teamId?: string} : {role: InferOrganizationRolesFromOption<O>})
  & (O['schema'] extends {member?: {additionalFields: infer Field extends Record<string, {type: string}>} | undefined} ? FieldAttributeToObject<Field> : {})
) extends infer T ? {[K in keyof T]: T[K]} : never;
export type BrokenRole<O extends OrganizationOptions> = (Member<O> & {user: {id: string}})['role'];
