import type { ParamsOfBootstrap } from "../../src/tanstack-start/react/types";
import { tanstackStartBootstrapEnvPolicy } from "../../src/vite-plugin/handleTanstackStartBootstrapEnv";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type KeysOfUnion<T> = T extends T ? keyof T : never;

type Real = ParamsOfBootstrap.Real;
type Mock = ParamsOfBootstrap.Mock<false>;

assert<Equals<keyof typeof tanstackStartBootstrapEnvPolicy.real, keyof Real>>;
assert<Equals<keyof typeof tanstackStartBootstrapEnvPolicy.mock, keyof Mock>>;
assert<Equals<keyof typeof tanstackStartBootstrapEnvPolicy.real.server, KeysOfUnion<Real["server"]>>>;
assert<Equals<keyof typeof tanstackStartBootstrapEnvPolicy.real.client, keyof Real["client"]>>;
assert<
    Equals<keyof typeof tanstackStartBootstrapEnvPolicy.mock.server, keyof NonNullable<Mock["server"]>>
>;
assert<
    Equals<keyof typeof tanstackStartBootstrapEnvPolicy.mock.client, keyof NonNullable<Mock["client"]>>
>;
assert<Equals<typeof tanstackStartBootstrapEnvPolicy.real.server.clientSecret, "redact">>;
