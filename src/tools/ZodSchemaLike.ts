export type ZodSchemaLike<Input, Output> = {
    parse: (input: Input) => Output;
};
