import { IDL } from "@icp-sdk/core/candid";

export interface _SERVICE {
  greet(name: string): Promise<string>;
}

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  });
};
