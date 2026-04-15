import { LedgerWalletIdentity } from "@dfinity/ledger-wallet-identity";
import { Icrc21Agent } from "@dfinity/icrc21-agent";
import { Actor } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";

const CANISTER_ID = Principal.fromText("xxydu-fqaaa-aaaam-ad2ka-cai");

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    swap: IDL.Func([IDL.Text, IDL.Text, IDL.Nat64], [IDL.Text], []),
  });
};

const statusEl = document.getElementById("status")!;
const resultEl = document.getElementById("result")!;
const swapBtn = document.getElementById("swap-btn") as HTMLButtonElement;

function setStatus(msg: string) {
  statusEl.textContent = msg;
  resultEl.textContent = "";
}

function setResult(msg: string) {
  resultEl.textContent = msg;
  statusEl.textContent = "";
}

function setError(msg: string) {
  resultEl.textContent = "";
  statusEl.textContent = `Error: ${msg}`;
}

swapBtn.addEventListener("click", async () => {
  const from = (document.getElementById("from") as HTMLInputElement).value;
  const to = (document.getElementById("to") as HTMLInputElement).value;
  const DECIMALS = 8;
  const amountFloat = parseFloat(
    (document.getElementById("amount") as HTMLInputElement).value
  );
  const amount = BigInt(Math.round(amountFloat * 10 ** DECIMALS));

  swapBtn.disabled = true;

  try {
    setStatus("Connecting to Ledger...");
    const identity = await LedgerWalletIdentity.create();

    setStatus("Creating ICRC-21 agent...");
    const agent = await Icrc21Agent.create(identity);

    const actor = Actor.createActor(idlFactory, {
      agent,
      canisterId: CANISTER_ID,
    });

    setStatus("Approve the transaction on your Ledger device...");
    const result = await actor.swap(from, to, amount);

    setResult(result);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    swapBtn.disabled = false;
  }
});
