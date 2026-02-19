import { expect } from "bun:test";
import { allMatchers } from "./matchers/index.ts";

expect.extend(allMatchers);
