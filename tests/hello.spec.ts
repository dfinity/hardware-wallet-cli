import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, PocketIcServer } from "@dfinity/pic";
import { resolve } from "path";
import { _SERVICE, idlFactory } from "./test-canister/idl";

const WASM_PATH = resolve(__dirname, "test-canister", "test_canister.wasm");

describe("hello world", () => {
  let picServer: PocketIcServer;
  let pic: PocketIc;
  let actor: import("@dfinity/pic").Actor<_SERVICE>;

  beforeAll(async () => {
    picServer = await PocketIcServer.start();
    pic = await PocketIc.create(picServer.getUrl());

    const fixture = await pic.setupCanister<_SERVICE>({
      idlFactory,
      wasm: WASM_PATH,
    });
    actor = fixture.actor;
  });

  afterAll(async () => {
    await pic.tearDown();
    await picServer.stop();
  });

  it("should greet", async () => {
    const result = await actor.greet("World");
    expect(result).toBe("Hello, World!");
  });
});
