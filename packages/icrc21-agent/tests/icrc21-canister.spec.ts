import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, PocketIcServer } from "@dfinity/pic";
import { resolve } from "path";
import { IDL } from "@icp-sdk/core/candid";
import { _SERVICE, idlFactory } from "./icrc21-canister/idl";

const WASM_PATH = resolve(__dirname, "icrc21-canister", "icrc21_canister.wasm");

function encodeSwapArgs(from: string, to: string, amount: bigint): Uint8Array {
  return new Uint8Array(
    IDL.encode([IDL.Text, IDL.Text, IDL.Nat64], [from, to, amount])
  );
}

describe("icrc21 canister", () => {
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

  it("should swap", async () => {
    const result = await actor.swap("ICP", "ckBTC", 100_000_000n);
    expect(result).toBe("Swapped 100000000 ICP for ckBTC");
  });

  it("should return GenericDisplayMessage when GenericDisplay is requested", async () => {
    const result = await actor.icrc21_canister_call_consent_message({
      arg: encodeSwapArgs("ICP", "ckBTC", 100_000_000n),
      method: "swap",
      user_preferences: {
        metadata: { language: "en", utc_offset_minutes: [] },
        device_spec: [{ GenericDisplay: null }],
      },
    });

    expect(result).toHaveProperty("Ok");
    if ("Ok" in result) {
      expect(result.Ok.consent_message).toHaveProperty("GenericDisplayMessage");
      expect(
        (result.Ok.consent_message as { GenericDisplayMessage: string })
          .GenericDisplayMessage
      ).toBe("Swap 100000000 ICP for ckBTC");
    }
  });

  it("should return FieldsDisplayMessage when FieldsDisplay is requested", async () => {
    const result = await actor.icrc21_canister_call_consent_message({
      arg: encodeSwapArgs("ICP", "ckBTC", 100_000_000n),
      method: "swap",
      user_preferences: {
        metadata: { language: "en", utc_offset_minutes: [] },
        device_spec: [{ FieldsDisplay: null }],
      },
    });

    expect(result).toHaveProperty("Ok");
    if ("Ok" in result) {
      expect(result.Ok.consent_message).toHaveProperty("FieldsDisplayMessage");
      const msg = (
        result.Ok.consent_message as {
          FieldsDisplayMessage: {
            intent: string;
            fields: Array<[string, unknown]>;
          };
        }
      ).FieldsDisplayMessage;
      expect(msg.intent).toBe("Swap tokens");
      const fieldNames = msg.fields.map(([name]) => name);
      expect(fieldNames).toEqual([
        "From",
        "To",
        "Amount",
        "Created At",
        "Expires In",
      ]);
    }
  });

  it("should return supported standards including ICRC-21", async () => {
    const standards = await actor.icrc10_supported_standards();
    expect(standards).toEqual([
      {
        name: "ICRC-21",
        url: "https://github.com/dfinity/ICRC/blob/main/ICRCs/ICRC-21/ICRC-21.md",
      },
    ]);
  });

  it("should return UnsupportedCanisterCall for unsupported method", async () => {
    const result = await actor.icrc21_canister_call_consent_message({
      arg: new Uint8Array(),
      method: "some_other_method",
      user_preferences: {
        metadata: { language: "en", utc_offset_minutes: [] },
        device_spec: [{ FieldsDisplay: null }],
      },
    });

    expect(result).toHaveProperty("Err");
    if ("Err" in result) {
      const err = result.Err as Record<string, { description: string }>;
      expect(err).toHaveProperty("UnsupportedCanisterCall");
      expect(err.UnsupportedCanisterCall.description).toContain(
        "some_other_method"
      );
    }
  });

  it("should return UnsupportedCanisterCall for malformed args", async () => {
    const result = await actor.icrc21_canister_call_consent_message({
      arg: new Uint8Array([0, 1, 2]),
      method: "swap",
      user_preferences: {
        metadata: { language: "en", utc_offset_minutes: [] },
        device_spec: [{ FieldsDisplay: null }],
      },
    });

    expect(result).toHaveProperty("Err");
    if ("Err" in result) {
      const err = result.Err as Record<string, { description: string }>;
      expect(err).toHaveProperty("UnsupportedCanisterCall");
      expect(err.UnsupportedCanisterCall.description).toContain(
        "Failed to decode"
      );
    }
  });
});
