import { Principal } from "@icp-sdk/core/principal";
import { IDL } from "@icp-sdk/core/candid";
import {
  Certificate,
  lookupResultToBuffer,
  SubmitRequestType,
} from "@icp-sdk/core/agent";
import type { CallRequest, Identity } from "@icp-sdk/core/agent";
import type {
  icrc21_consent_message_request,
  icrc21_consent_message_response,
  Value,
} from "./icrc21.did";
import {
  AnonymousIdentity,
  Identity,
  Cbor,
  requestIdOf,
} from "@icp-sdk/core/agent";
import { hexStringToBytes, bytesToHexString } from "./utils";
import { arrayOfNumberToUint8Array } from "@dfinity/utils";

// TextEncoder for converting strings to UTF-8 bytes
const textEncoder = new TextEncoder();

// Define ICRC-21 IDL types directly
const icrc21_consent_message_metadata = IDL.Record({
  utc_offset_minutes: IDL.Opt(IDL.Int16),
  language: IDL.Text,
});

const icrc21_consent_message_spec = IDL.Record({
  metadata: icrc21_consent_message_metadata,
  device_spec: IDL.Opt(
    IDL.Variant({ GenericDisplay: IDL.Null, FieldsDisplay: IDL.Null })
  ),
});

const icrc21_consent_message_request = IDL.Record({
  arg: IDL.Vec(IDL.Nat8),
  method: IDL.Text,
  user_preferences: icrc21_consent_message_spec,
});

const TextValue = IDL.Record({ content: IDL.Text });
const TokenAmount = IDL.Record({
  decimals: IDL.Nat8,
  amount: IDL.Nat64,
  symbol: IDL.Text,
});
const TimestampSeconds = IDL.Record({ amount: IDL.Nat64 });
const DurationSeconds = IDL.Record({ amount: IDL.Nat64 });
const Value = IDL.Variant({
  Text: TextValue,
  TokenAmount: TokenAmount,
  TimestampSeconds: TimestampSeconds,
  DurationSeconds: DurationSeconds,
});

const icrc21_consent_message = IDL.Variant({
  FieldsDisplayMessage: IDL.Record({
    fields: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    intent: IDL.Text,
  }),
  GenericDisplayMessage: IDL.Text,
});

const icrc21_consent_info = IDL.Record({
  metadata: icrc21_consent_message_metadata,
  consent_message: icrc21_consent_message,
});

const icrc21_error_info = IDL.Record({ description: IDL.Text });

const icrc21_error = IDL.Variant({
  GenericError: IDL.Record({
    description: IDL.Text,
    error_code: IDL.Nat,
  }),
  InsufficientPayment: icrc21_error_info,
  UnsupportedCanisterCall: icrc21_error_info,
  ConsentMessageUnavailable: icrc21_error_info,
});

const icrc21_consent_message_response = IDL.Variant({
  Ok: icrc21_consent_info,
  Err: icrc21_error,
});

/**
 * Calls the ICRC-21 consent message endpoint for a canister method.
 *
 * @param canisterId - The canister to query
 * @param method - The method name to get consent for
 * @param argHex - The method arguments in hex format
 * @param agentFn - Function to get the agent
 * @param identity - The identity to use for the call
 * @returns The consent message response
 */
export async function callConsentMessage(
  canisterId: Principal,
  method: string,
  argHex: string,
  agentFn: (identity: Identity) => Promise<import("@icp-sdk/core/agent").Agent>,
  identity: Identity
): Promise<icrc21_consent_message_response> {
  console.log(`calling consent message to canister ${canisterId.toText()}`);
  const fetch = global.fetch.bind(global);

  // Get the agent using the provided function
  const agent = await agentFn(new AnonymousIdentity());

  console.log(
    "1. Sending a request to the target canister to get the consent message"
  );
  const request: icrc21_consent_message_request = {
    method: method,
    arg: arrayOfNumberToUint8Array(hexStringToBytes(argHex)),
    user_preferences: {
      metadata: {
        language: "en",
        utc_offset_minutes: [],
      },
      device_spec: [{ FieldsDisplay: null }],
    },
  };

  // Encode the request
  const encodedArgs = IDL.encode([icrc21_consent_message_request], [request]);

  // Call the canister using agent.call()
  console.log("calling...");
  const callResponse = await agent.call(canisterId, {
    methodName: "icrc21_canister_call_consent_message",
    arg: encodedArgs,
    effectiveCanisterId: canisterId,
  });

  console.log("response");
  console.log(callResponse);

  console.log("2. Extracting the certificate from the response...");
  const certificateBytes = callResponse.response.body!.certificate;

  console.log("certificate:");
  console.log(bytesToHexString(Array.from(certificateBytes)));

  console.log("3. Extract the response from the certificate...");
  // Create a Certificate and look up the reply
  const certificate = await Certificate.create({
    certificate: certificateBytes,
    rootKey: agent.rootKey!,
    principal: { canisterId },
    agent,
  });

  // Look up the request status and reply from the certificate
  const path = [textEncoder.encode("request_status"), callResponse.requestId];
  const status = new TextDecoder().decode(
    lookupResultToBuffer(certificate.lookup_path([...path, "status"]))
  );

  console.log("status:", status);

  if (status !== "replied") {
    throw new Error(`Unexpected status: ${status}`);
  }

  const reply = lookupResultToBuffer(
    certificate.lookup_path([...path, "reply"])
  );

  // Decode the response
  const decoded = IDL.decode([icrc21_consent_message_response], reply);
  const response = decoded[0] as icrc21_consent_message_response;

  console.log(`Response:`);
  console.log(response);

  // We now have everything we need to make the call to the wallet.
  /*const consentRequestArgs = bytesToHexString(encodedArgs);

  console.log("consentrequest args");
  console.log(consentRequestArgs);*/
  //const canisterCall =

  const consentRequest = callResponse.requestDetails;
  console.log("consentrequest");
  console.log(consentRequest);

  const consentRequestHex = bytesToHexString(
    Cbor.encode({ content: consentRequest })
  );
  console.log(consentRequestHex);

  const canisterCallContent = {
    request_type: "call",
    arg: arrayOfNumberToUint8Array(hexStringToBytes(argHex)),
    method_name: method,
    canister_id: canisterId,
    ingress_expiry: consentRequest.ingress_expiry,
    sender: identity.getPrincipal(),
    nonce: consentRequest.nonce, // FIXME: compute another nonce?
  };

  const canisterCall = Cbor.encode({
    content: canisterCallContent,
  });

  const canisterCallHex = bytesToHexString(canisterCall);
  console.log(`canister call: ${canisterCallHex}`);

  const certificateHex = bytesToHexString(certificateBytes);

  console.log("certificate hex:");
  console.log(certificateHex);

  console.log("asking for signature");
  const signature = await identity.signBls(
    consentRequestHex,
    canisterCallHex,
    certificateHex
  );
  console.log(`BLS signature: ${bytesToHexString(signature)}`);

  console.log("4. Assembling request and sending it to the IC...");

  const request2 = {
    content: canisterCallContent,
    sender_pubkey: identity.getPublicKey().toDer(),
    sender_sig: signature,
  };

  console.log("request body");
  console.log(request2);

  console.log("request body cbor");
  const requestBodyCbor = Cbor.encode(request2);
  console.log(bytesToHexString(requestBodyCbor));

  const url = new URL(
    `/api/v4/canister/${canisterId.toText()}/call`,
    agent.host
  );
  console.log(`fetching "${url.pathname}" with request:`, request2);

  const response2 = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/cbor",
    },
    body: requestBodyCbor,
  });

  console.log("response 2");
  console.log(response2);

  const responseBodyCbor = await response2.arrayBuffer();

  console.log("response cbor");
  console.log(bytesToHexString(Array.from(new Uint8Array(responseBodyCbor))));

  const responseBody = Cbor.decode(new Uint8Array(responseBodyCbor));

  console.log("Response body:", responseBody);
  console.log("Extracting the certificate from the response...");
  const certificateBytes2 = responseBody.certificate;

  console.log("certificate:");
  console.log(bytesToHexString(Array.from(certificateBytes2)));

  console.log("3. Extract the response from the certificate...");
  // Create a Certificate and look up the reply
  const certificate2 = await Certificate.create({
    certificate: certificateBytes2,
    rootKey: agent.rootKey!,
    principal: { canisterId },
    agent,
  });

  const submit: CallRequest = {
    request_type: SubmitRequestType.Call,
    canister_id: canisterId,
    method_name: method,
    arg: arrayOfNumberToUint8Array(hexStringToBytes(argHex)),
    sender: identity.getPrincipal(),
    ingress_expiry: consentRequest!.ingress_expiry!,
    nonce: consentRequest!.nonce,
  };

  console.log("Submit:");
  console.log(submit);

  const requestId = requestIdOf(submit);

  console.log("requestId:");
  console.log(bytesToHexString(Array.from(requestId)));

  // Look up the request status and reply from the certificate
  const path2 = [textEncoder.encode("request_status"), requestId];
  const reply2 = lookupResultToBuffer(
    certificate2.lookup_path([...path2, "reply"])
  )!;

  // Decode the response
  console.log("result");
  console.log(bytesToHexString(Array.from(reply2)));

  return response2;
}

/**
 * Pretty-prints the ICRC-21 consent message response.
 */
export function formatConsentResponse(
  response: icrc21_consent_message_response
): string {
  if ("Ok" in response) {
    const { consent_message, metadata } = response.Ok;
    if ("GenericDisplayMessage" in consent_message) {
      return `Consent Message:\n${consent_message.GenericDisplayMessage}`;
    } else {
      const { intent, fields } = consent_message.FieldsDisplayMessage;
      let result = `Intent: ${intent}\nFields:\n`;
      for (const [key, value] of fields) {
        result += `  ${key}: ${formatValue(value)}\n`;
      }
      return result;
    }
  } else {
    const error = response.Err;
    if ("GenericError" in error) {
      return `Error (${error.GenericError.error_code}): ${error.GenericError.description}`;
    } else if ("UnsupportedCanisterCall" in error) {
      return `Unsupported Canister Call: ${error.UnsupportedCanisterCall.description}`;
    } else if ("ConsentMessageUnavailable" in error) {
      return `Consent Message Unavailable: ${error.ConsentMessageUnavailable.description}`;
    } else if ("InsufficientPayment" in error) {
      return `Insufficient Payment: ${error.InsufficientPayment.description}`;
    } else {
      return `Error: ${JSON.stringify(error)}`;
    }
  }
}

function formatValue(value: Value): string {
  // Format Value union type for display
  if ("Text" in value) {
    return value.Text.content;
  }
  if ("TokenAmount" in value) {
    const { amount, decimals, symbol } = value.TokenAmount;
    return `${Number(amount) / Math.pow(10, decimals)} ${symbol}`;
  }
  if ("TimestampSeconds" in value) {
    const timestamp = Number(value.TimestampSeconds.amount);
    return `${new Date(timestamp * 1000).toISOString()}`;
  }
  if ("DurationSeconds" in value) {
    const seconds = Number(value.DurationSeconds.amount);
    return `${seconds} seconds`;
  }
  return JSON.stringify(value);
}
