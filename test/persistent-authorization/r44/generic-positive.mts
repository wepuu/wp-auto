// Control model: infer role names directly, as described by upstream fix #11637.
// This is not a deployed fix, package patch, or a complete upstream implementation.
type Roles<O> = O extends {roles: infer R} ? Extract<keyof R, string> : 'owner' | 'admin' | 'member';
type Equal<A,B> = (<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2) ? true : false;
type Assert<T extends true> = T;
export type DefaultRoles = Assert<Equal<Roles<{}>, 'owner' | 'admin' | 'member'>>;
export type CustomRoles = Assert<Equal<Roles<{roles: {viewer: {}; editor: {}}}>, 'viewer' | 'editor'>>;
// @ts-expect-error Unknown roles must remain rejected.
export const deniedDefault: Roles<{}> = 'superadmin';
// @ts-expect-error Custom roles must not silently regain default roles.
export const deniedCustom: Roles<{roles: {viewer: {}}}> = 'owner';
