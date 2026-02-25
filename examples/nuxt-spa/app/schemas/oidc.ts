import { z } from "zod";

export const DecodedIdTokenSchema = z.object({
    sub: z.string(),
    name: z.string(),
    preferred_username: z.string().optional()
});

export type DecodedIdToken = z.infer<typeof DecodedIdTokenSchema>;
