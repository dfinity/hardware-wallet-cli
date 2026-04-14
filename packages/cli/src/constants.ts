import { SnsNeuronPermissionType } from "@icp-sdk/canisters/sns";

// Version published in January 2023
export const CANDID_PARSER_VERSION = "2.2.1";

// Version PENDING to be published
export const FULL_CANDID_PARSER_VERSION = "2.4.3";
export const DEFAULT_TRANSACTION_FEE_E8S = 10_000;

export const HOTKEY_PERMISSIONS = [
  SnsNeuronPermissionType.NEURON_PERMISSION_TYPE_VOTE,
  SnsNeuronPermissionType.NEURON_PERMISSION_TYPE_SUBMIT_PROPOSAL,
];
