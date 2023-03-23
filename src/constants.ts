import { SnsNeuronPermissionType } from "@dfinity/sns";

// Version published in January 2023
export const CANDID_PARSER_VERSION = "2.2.1";
export const DEFAULT_TRANSACTION_FEE_E8S = 10_000;

export const HOTKEY_PERMISSIONS = [
  SnsNeuronPermissionType.NEURON_PERMISSION_TYPE_VOTE,
  SnsNeuronPermissionType.NEURON_PERMISSION_TYPE_SUBMIT_PROPOSAL,
];
