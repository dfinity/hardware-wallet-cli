import { Principal } from '@icp-sdk/core/principal';
import { IDL } from '@icp-sdk/core/candid';
import { Certificate, lookupResultToBuffer } from '@icp-sdk/core/agent';
import type { Identity } from '@icp-sdk/core/agent';
import type {
  icrc21_consent_message_request,
  icrc21_consent_message_response,
  Value,
} from './icrc21.did';
import { AnonymousIdentity, Identity, Cbor } from "@icp-sdk/core/agent";
import { hexStringToBytes, bytesToHexString } from './utils';
import { arrayOfNumberToUint8Array } from "@dfinity/utils";

// TextEncoder for converting strings to UTF-8 bytes
const textEncoder = new TextEncoder();

// Define ICRC-21 IDL types directly
const icrc21_consent_message_metadata = IDL.Record({
  'utc_offset_minutes': IDL.Opt(IDL.Int16),
  'language': IDL.Text,
});

const icrc21_consent_message_spec = IDL.Record({
  'metadata': icrc21_consent_message_metadata,
  'device_spec': IDL.Opt(
    IDL.Variant({ 'GenericDisplay': IDL.Null, 'FieldsDisplay': IDL.Null })
  ),
});

const icrc21_consent_message_request = IDL.Record({
  'arg': IDL.Vec(IDL.Nat8),
  'method': IDL.Text,
  'user_preferences': icrc21_consent_message_spec,
});

const TextValue = IDL.Record({ 'content': IDL.Text });
const TokenAmount = IDL.Record({
  'decimals': IDL.Nat8,
  'amount': IDL.Nat64,
  'symbol': IDL.Text,
});
const TimestampSeconds = IDL.Record({ 'amount': IDL.Nat64 });
const DurationSeconds = IDL.Record({ 'amount': IDL.Nat64 });
const Value = IDL.Variant({
  'Text': TextValue,
  'TokenAmount': TokenAmount,
  'TimestampSeconds': TimestampSeconds,
  'DurationSeconds': DurationSeconds,
});

const icrc21_consent_message = IDL.Variant({
  'FieldsDisplayMessage': IDL.Record({
    'fields': IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    'intent': IDL.Text,
  }),
  'GenericDisplayMessage': IDL.Text,
});

const icrc21_consent_info = IDL.Record({
  'metadata': icrc21_consent_message_metadata,
  'consent_message': icrc21_consent_message,
});

const icrc21_error_info = IDL.Record({ 'description': IDL.Text });

const icrc21_error = IDL.Variant({
  'GenericError': IDL.Record({
    'description': IDL.Text,
    'error_code': IDL.Nat,
  }),
  'InsufficientPayment': icrc21_error_info,
  'UnsupportedCanisterCall': icrc21_error_info,
  'ConsentMessageUnavailable': icrc21_error_info,
});

const icrc21_consent_message_response = IDL.Variant({
  'Ok': icrc21_consent_info,
  'Err': icrc21_error,
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
  agentFn: (identity: Identity) => Promise<import('@icp-sdk/core/agent').Agent>,
  identity: Identity
): Promise<icrc21_consent_message_response> {
  console.log("calling consent message");
  // Get the agent using the provided function
  const agent = await agentFn(new AnonymousIdentity());

  // Build the consent message request
  const request: icrc21_consent_message_request = {
    method: method,
    arg: arrayOfNumberToUint8Array(hexStringToBytes(argHex)),
    user_preferences: {
      metadata: {
        language: 'en',
        utc_offset_minutes: [],
      },
      device_spec: [{ FieldsDisplay: null }],
    },
  };

  console.log("request:");
  console.log(request);

  // Encode the request
  const encodedArgs = IDL.encode([icrc21_consent_message_request], [request]);

  // Call the canister using agent.call()
  console.log("calling...");
  const callResponse = await agent.call(canisterId, {
    methodName: 'icrc21_canister_call_consent_message',
    arg: encodedArgs,
    effectiveCanisterId: canisterId,
  });

  console.log("response");
  console.log(callResponse);

  // Extract the certificate from v4 response body
  const certificateBytes = callResponse.response.body.certificate;

  console.log("certificate:");
  console.log(bytesToHexString(Array.from(certificateBytes)));

  // Create a Certificate and look up the reply
  const certificate = await Certificate.create({
    certificate: certificateBytes,
    rootKey: agent.rootKey!,
    principal: { canisterId },
    agent,
  });

  // Look up the request status and reply from the certificate
  const path = [textEncoder.encode('request_status'), callResponse.requestId];
  const status = new TextDecoder().decode(
    lookupResultToBuffer(certificate.lookup_path([...path, 'status']))
  );

  console.log("status:", status);

  if (status !== 'replied') {
    throw new Error(`Unexpected status: ${status}`);
  }

  const reply = lookupResultToBuffer(certificate.lookup_path([...path, 'reply']));

  // Decode the response
  const decoded = IDL.decode([icrc21_consent_message_response], reply);
  const response = decoded[0] as icrc21_consent_message_response;

  // We now have everything we need to make the call to the wallet.
  /*const consentRequestArgs = bytesToHexString(encodedArgs);

  console.log("consentrequest args");
  console.log(consentRequestArgs);*/
  //const canisterCall = 

  const consentRequest = callResponse.requestDetails;
  console.log("consentrequest");
  console.log(consentRequest);

  const consentRequestHex = bytesToHexString(Cbor.encode({ content: consentRequest }));
  console.log(consentRequestHex);

  const canisterCall = Cbor.encode({
    content: {
      arg: arrayOfNumberToUint8Array(hexStringToBytes(argHex)),
      method_name: method,
      canister_id: canisterId,
      ingress_expiry: consentRequest.ingress_expiry,
      sender: identity.getPrincipal(),
      nonce: consentRequest.nonce // FIXME: compute another nonce?
    }
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

  return response;
}

/**
 * Pretty-prints the ICRC-21 consent message response.
 */
export function formatConsentResponse(
  response: icrc21_consent_message_response
): string {
  if ('Ok' in response) {
    const { consent_message, metadata } = response.Ok;
    if ('GenericDisplayMessage' in consent_message) {
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
    if ('GenericError' in error) {
      return `Error (${error.GenericError.error_code}): ${error.GenericError.description}`;
    } else if ('UnsupportedCanisterCall' in error) {
      return `Unsupported Canister Call: ${error.UnsupportedCanisterCall.description}`;
    } else if ('ConsentMessageUnavailable' in error) {
      return `Consent Message Unavailable: ${error.ConsentMessageUnavailable.description}`;
    } else if ('InsufficientPayment' in error) {
      return `Insufficient Payment: ${error.InsufficientPayment.description}`;
    } else {
      return `Error: ${JSON.stringify(error)}`;
    }
  }
}

function formatValue(value: Value): string {
  // Format Value union type for display
  if ('Text' in value) {
    return value.Text.content;
  }
  if ('TokenAmount' in value) {
    const { amount, decimals, symbol } = value.TokenAmount;
    return `${Number(amount) / Math.pow(10, decimals)} ${symbol}`;
  }
  if ('TimestampSeconds' in value) {
    const timestamp = Number(value.TimestampSeconds.amount);
    return `${new Date(timestamp * 1000).toISOString()}`;
  }
  if ('DurationSeconds' in value) {
    const seconds = Number(value.DurationSeconds.amount);
    return `${seconds} seconds`;
  }
  return JSON.stringify(value);
}
