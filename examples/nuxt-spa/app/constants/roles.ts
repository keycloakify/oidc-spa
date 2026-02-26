export const Roles = {
    admin: "realm-admin"
} as const;

export type Roles = (typeof Roles)[keyof typeof Roles];
