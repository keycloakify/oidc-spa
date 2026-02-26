import { z } from "zod";

export const DecodedIdTokenSchema = z.object({
    sub: z.string(),
    name: z.string(),
    picture: z.string().optional(),
    email: z.email().optional(),
    preferred_username: z.string().optional(),
    realm_access: z.object({ roles: z.array(z.string()) }).optional()
});

export type DecodedIdToken = z.infer<typeof DecodedIdTokenSchema>;
