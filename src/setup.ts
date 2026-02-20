import { expect } from "bun:test";
import { allMatchers } from "./matchers/index.js";

expect.extend(allMatchers);
