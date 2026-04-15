import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, PocketIcServer } from "@dfinity/pic";
import { resolve } from "path";
import { Principal } from "@icp-sdk/core/principal";
import { IDL } from "@icp-sdk/core/candid";
import { Icrc21Agent } from "../src/icrc21-agent";
import { MockIcrc21Identity } from "./mock-icrc21-identity";
import { _SERVICE, idlFactory } from "./icrc21-canister/idl";

const WASM_PATH = resolve(__dirname, "icrc21-canister", "icrc21_canister.wasm");

describe("Icrc21Agent", () => {
  let picServer: PocketIcServer;
  let pic: PocketIc;
  let canisterId: Principal;
  let gatewayUrl: string;
  let identity: MockIcrc21Identity;

  beforeAll(async () => {
    picServer = await PocketIcServer.start();
    pic = await PocketIc.create(picServer.getUrl());

    const fixture = await pic.setupCanister<_SERVICE>({
      idlFactory,
      wasm: WASM_PATH,
    });
    canisterId = fixture.canisterId;

    const port = await pic.makeLive();
    gatewayUrl = `http://localhost:${port}`;

    identity = new MockIcrc21Identity();
  }, 30_000);

  afterAll(async () => {
    await pic.tearDown();
    await picServer.stop();
  });

  it("should call a canister through the ICRC-21 consent flow", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    const arg = IDL.encode(
      [IDL.Text, IDL.Text, IDL.Nat64],
      ["ICP", "ckBTC", BigInt(100_000_000)]
    );

    const result = await agent.call(canisterId, {
      methodName: "swap",
      arg: new Uint8Array(arg),
      effectiveCanisterId: canisterId,
    });

    expect(result.requestId).toBeDefined();
    expect(result.response).toBeDefined();
  });

  it("should update a canister through the ICRC-21 consent flow and return the reply", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    const arg = IDL.encode(
      [IDL.Text, IDL.Text, IDL.Nat64],
      ["ckBTC", "ICP", BigInt(10_000_000)]
    );

    const result = await agent.update(canisterId, {
      methodName: "swap",
      arg: new Uint8Array(arg),
      effectiveCanisterId: canisterId,
    });

    expect(result.reply).toBeDefined();
    expect(result.certificate).toBeDefined();

    const decoded = IDL.decode([IDL.Text], result.reply)[0] as string;
    expect(decoded).toBe("Swapped 10000000 ckBTC for ICP");
  });

  it("should throw on ICRC-21 error via update()", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(
      agent.update(canisterId, {
        methodName: "some_other_method",
        arg: new Uint8Array(),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("UnsupportedCanisterCall");
  });

  it("should throw on canister rejection via update()", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    const arg = IDL.encode(
      [IDL.Text, IDL.Text, IDL.Nat64],
      ["ICP", "ckBTC", BigInt(2_000_000_000)]
    );

    await expect(
      agent.update(canisterId, {
        methodName: "swap",
        arg: new Uint8Array(arg),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("rejection");
  });

  it("should invoke flagUpcomingIcrc21 on the identity", async () => {
    const freshIdentity = new MockIcrc21Identity();
    const agent = await Icrc21Agent.create(freshIdentity, new URL(gatewayUrl));

    const arg = IDL.encode(
      [IDL.Text, IDL.Text, IDL.Nat64],
      ["ICP", "ckBTC", BigInt(100_000_000)]
    );

    await agent.call(canisterId, {
      methodName: "swap",
      arg: new Uint8Array(arg),
      effectiveCanisterId: canisterId,
    });

    expect(freshIdentity.flagCallCount).toBe(1);
  });

  it("should reset ICRC-21 flag after signing rejection", async () => {
    const rejectIdentity = new MockIcrc21Identity();
    const agent = await Icrc21Agent.create(rejectIdentity, new URL(gatewayUrl));

    const arg = IDL.encode(
      [IDL.Text, IDL.Text, IDL.Nat64],
      ["ICP", "ckBTC", BigInt(100_000_000)]
    );

    // Simulate user rejecting on the device
    rejectIdentity.rejectNextSign = true;

    await expect(
      agent.call(canisterId, {
        methodName: "swap",
        arg: new Uint8Array(arg),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("User rejected signing on device");

    // Flag should be cleared despite the rejection
    expect(rejectIdentity.icrc21Flag).toBe(false);

    // Subsequent call should succeed
    const result = await agent.call(canisterId, {
      methodName: "swap",
      arg: new Uint8Array(arg),
      effectiveCanisterId: canisterId,
    });
    expect(result.requestId).toBeDefined();
  });

  it("should throw on canister consent message error", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    const arg = new Uint8Array();

    await expect(
      agent.call(canisterId, {
        methodName: "some_other_method",
        arg,
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("UnsupportedCanisterCall");
  });

  it("should throw ConsentMessageUnavailable for internal methods", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(
      agent.call(canisterId, {
        methodName: "internal_method",
        arg: new Uint8Array(),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("ConsentMessageUnavailable");
  });

  it("should throw InsufficientPayment when payment is required", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(
      agent.call(canisterId, {
        methodName: "paid_method",
        arg: new Uint8Array(),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("InsufficientPayment");
  });

  it("should throw GenericError for generic failures", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(
      agent.call(canisterId, {
        methodName: "broken_method",
        arg: new Uint8Array(),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("GenericError");
  });

  it("should throw on malformed args", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(
      agent.call(canisterId, {
        methodName: "swap",
        arg: new Uint8Array([0, 1, 2]),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("UnsupportedCanisterCall");
  });

  it("should throw when the canister call is rejected", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    const arg = IDL.encode(
      [IDL.Text, IDL.Text, IDL.Nat64],
      ["ICP", "ckBTC", BigInt(2_000_000_000)]
    );

    await expect(
      agent.call(canisterId, {
        methodName: "swap",
        arg: new Uint8Array(arg),
        effectiveCanisterId: canisterId,
      })
    ).rejects.toThrow("rejection");
  });

  it("should return the signing identity's principal", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    const principal = await agent.getPrincipal();
    const expectedPrincipal = await identity.getPrincipal();

    expect(principal.toText()).toBe(expectedPrincipal.toText());
  });

  it("should throw on query()", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(
      agent.query(canisterId, { methodName: "swap", arg: new Uint8Array() })
    ).rejects.toThrow("does not implement query()");
  });

  it("should throw on readState()", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(agent.readState(canisterId, { paths: [] })).rejects.toThrow(
      "does not implement readState()"
    );
  });

  it("should throw on status()", async () => {
    const agent = await Icrc21Agent.create(identity, new URL(gatewayUrl));

    await expect(agent.status()).rejects.toThrow("does not implement status()");
  });
});
