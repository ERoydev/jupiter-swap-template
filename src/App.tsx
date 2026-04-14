import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletButton } from "./ui/WalletButton";
import { SOLANA_RPC_URL } from "./config/env";

import "@solana/wallet-adapter-react-ui/styles.css";

export function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-[420px] space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-foreground">Swap</h1>
                <WalletButton />
              </div>
              <p className="text-sm text-muted-foreground">
                Connect your wallet to start swapping.
              </p>
            </div>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
