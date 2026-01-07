export type ZodSchemaLike<Input, Output> = {
    parse: (input: Input) => Output;
};

export type InferZodSchemaLikeOutput<T> = T extends ZodSchemaLike<any, infer Output> ? Output : never;
