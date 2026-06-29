import { ethers, BrowserProvider, Contract, Signer } from "ethers";
import { REGISTRY_ABI, SUBSCRIPTION_ABI, LEDGER_ABI, CONTRACT_ADDRESSES } from "./config";

declare global {
  interface Window { ethereum?: any; }
}

export async function getProvider(): Promise<BrowserProvider> {
  if (!window.ethereum) throw new Error("MetaMask not detected. Please install it.");
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner(): Promise<Signer> {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

export async function getAddress(): Promise<string> {
  const signer = await getSigner();
  return signer.getAddress();
}

export async function getRegistryContract(write = false): Promise<Contract> {
  const runner = write ? await getSigner() : await getProvider();
  return new Contract(CONTRACT_ADDRESSES.registry, REGISTRY_ABI, runner);
}

export async function getSubscriptionContract(write = false): Promise<Contract> {
  const runner = write ? await getSigner() : await getProvider();
  return new Contract(CONTRACT_ADDRESSES.subscription, SUBSCRIPTION_ABI, runner);
}

export async function getLedgerContract(write = false): Promise<Contract> {
  const runner = write ? await getSigner() : await getProvider();
  return new Contract(CONTRACT_ADDRESSES.ledger, LEDGER_ABI, runner);
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

export function setStatus(id: string, msg: string, ok = true) {
  const el = $(id);
  el.textContent  = msg;
  el.className    = ok ? "status ok" : "status err";
  el.style.display = "block";
}

export function clearStatus(id: string) {
  const el = $(id);
  el.textContent   = "";
  el.style.display = "none";
}

export function setLoading(id: string, loading: boolean) {
  const el = $(id) as HTMLButtonElement;
  el.disabled  = loading;
  el.textContent = loading ? "⏳ Waiting…" : el.dataset["label"] ?? el.textContent;
}

export function fmtDate(ts: bigint): string {
  if (!ts) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export function fmtEth(wei: bigint): string {
  return ethers.formatEther(wei) + " ETH";
}

export function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export async function initWalletBanner(bannerId: string) {
  const banner = $(bannerId);
  if (!window.ethereum) {
    banner.innerHTML = '⚠️ MetaMask not detected. <a href="https://metamask.io" target="_blank">Install it</a>.';
    return null;
  }

  // Reload page automatically on account or network switch
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged",    () => location.reload());

  try {
    const addr = await getAddress();
    banner.innerHTML = `✅ Connected: <strong>${addr}</strong>`;
    return addr;
  } catch {
    banner.innerHTML = '🔌 <button id="btnConnect">Connect Wallet</button>';
    $("btnConnect").addEventListener("click", async () => {
      try {
        const a = await getAddress();
        banner.innerHTML = `✅ Connected: <strong>${a}</strong>`;
      } catch (e: any) {
        setStatus(bannerId, e.message, false);
      }
    });
    return null;
  }
}
