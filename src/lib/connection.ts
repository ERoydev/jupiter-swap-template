import { Connection } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "../config/env";

export const connection = new Connection(SOLANA_RPC_URL, "confirmed");
