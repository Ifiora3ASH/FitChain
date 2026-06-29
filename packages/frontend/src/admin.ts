import "./shared.css";
import { ethers }                                                          from "ethers";
import { getRegistryContract, getLedgerContract, getSubscriptionContract,
         getAddress, $, setStatus, fmtEth, initWalletBanner }             from "./utils";
import { TIER_NAMES, CATEGORY_NAMES }                                     from "./config";

document.addEventListener("DOMContentLoaded", async () => {
  const addr = await initWalletBanner("wallet-banner");
  if (!addr) return;

  try {
    const reg      = await getRegistryContract();
    const adminAddr = await reg.admin();
    const isAdmin   = adminAddr.toLowerCase() === addr.toLowerCase();
    if (!isAdmin) {
      document.querySelector("main")!.innerHTML =
        `<p style="color:#ef4444;font-size:1.1rem;padding:2rem">
          ⛔ Access denied.<br>This portal is only for the contract admin.<br>
          <small style="color:#94a3b8">Connected: ${addr}</small>
        </p>`;
      return;
    }
  } catch (e: any) {
    setStatus("wallet-banner", e.message, false);
    return;
  }

  await loadAll();
});

// register facility button
$("btnRegisterFacility").addEventListener("click", async () => {
  const addr     = ($("facAddr")     as HTMLInputElement).value.trim();
  const name     = ($("facName")     as HTMLInputElement).value.trim();
  const vendor   = ($("facVendor")   as HTMLInputElement).value.trim();
  const category = ($("facCategory") as HTMLSelectElement).value;

  if (!addr || !name || !vendor) {
    setStatus("statusRegister", "Fill all required fields.", false); return;
  }
  try {
    const reg = await getRegistryContract(true);
    const tx  = await reg.registerFacility(addr, name, vendor, category);
    setStatus("statusRegister", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusRegister", `✅ Facility "${name}" registered.`);
    await loadFacilities();
    await populateFacilityDropdowns();
  } catch (e: any) {
    setStatus("statusRegister", e.reason ?? e.message, false);
  }
});

// remove facility button
$("btnRemoveFacility").addEventListener("click", async () => {
  const addr = ($("removeFacAddr") as HTMLSelectElement).value;
  if (!addr) { setStatus("statusRemove", "Select a facility.", false); return; }
  try {
    const reg = await getRegistryContract(true);
    const tx  = await reg.removeFacility(addr);
    setStatus("statusRemove", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusRemove", "✅ Facility removed from whitelist.");
    await loadFacilities();
    await populateFacilityDropdowns();
  } catch (e: any) {
    setStatus("statusRemove", e.reason ?? e.message, false);
  }
});

// configure subscription tier button
$("btnConfigTier").addEventListener("click", async () => {
  const tierID   = Number(($("tierNum")     as HTMLSelectElement).value);
  const credits  = BigInt(($("tierCredits") as HTMLInputElement).value  || "0");
  const priceEth = ($("tierPrice") as HTMLInputElement).value;

  if (!priceEth || !credits) {
    setStatus("statusTier", "Fill all tier fields.", false); return;
  }
  try {
    const sub  = await getSubscriptionContract(true);
    const tx   = await sub.setTier(tierID, credits, ethers.parseEther(priceEth));
    setStatus("statusTier", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusTier", `✅ ${TIER_NAMES[tierID]} tier updated.`);
    await loadTierInfo();
  } catch (e: any) {
    setStatus("statusTier", e.reason ?? e.message, false);
  }
});

// set credit-to-ETH exchange rate
$("btnSetRate").addEventListener("click", async () => {
  const rateEth = ($("creditRate") as HTMLInputElement).value;
  if (!rateEth) { setStatus("statusRate", "Enter a rate.", false); return; }
  try {
    const ledger = await getLedgerContract(true);
    const tx     = await ledger.updateCreditToEthRate(ethers.parseEther(rateEth));
    setStatus("statusRate", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusRate", `✅ Rate set to ${rateEth} ETH/credit.`);
    await loadTierInfo();
  } catch (e: any) {
    setStatus("statusRate", e.reason ?? e.message, false);
  }
});

async function loadAll() {
  await Promise.all([loadFacilities(), loadTierInfo(), populateFacilityDropdowns()]);
}

async function populateFacilityDropdowns(selected?: string) {
  const selRemove = $("removeFacAddr") as HTMLSelectElement;
  selRemove.innerHTML = '<option value="">Select a facility…</option>';
  try {
    const reg   = await getRegistryContract();
    const addrs: string[] = await reg.getAllFacilities();
    for (const addr of addrs) {
      const ok = await reg.isWhitelisted(addr);
      if (!ok) continue;
      const [name,, category] = await reg.getFacility(addr);
      selRemove.appendChild(new Option(`${name} (${category})`, addr));
    }
    if (selected) selRemove.value = selected;
  } catch { /* network not ready */ }
}

async function loadFacilities() {
  const tbody = document.querySelector<HTMLTableSectionElement>("#facTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='5'>Loading…</td></tr>";
  try {
    const reg    = await getRegistryContract();
    const ledger = await getLedgerContract();
    const allAddrs: string[] = await reg.getAllFacilities();

    const rows: { addr: string; name: string; vendor: string; category: string; price: bigint; peakStart: number; peakEnd: number; peakMult: number; peakSet: boolean }[] = [];
    for (const addr of allAddrs) {
      const whitelisted = await reg.isWhitelisted(addr);
      if (!whitelisted) continue;
      const [name, vendor, category] = await reg.getFacility(addr);
      const acct = await ledger.facilityAccounts(addr);
      const [peakStart, peakEnd, peakMult, peakSet] = await reg.getPeakHours(addr);
      rows.push({ addr, name, vendor, category, price: acct.sessionPrice,
                  peakStart: Number(peakStart), peakEnd: Number(peakEnd),
                  peakMult: Number(peakMult), peakSet: Boolean(peakSet) });
    }

    if (rows.length === 0) {
      tbody.innerHTML = "<tr><td colspan='6'>No active facilities.</td></tr>";
      return;
    }
    tbody.innerHTML = "";
    for (const r of rows) {
      let peakCell = "—";
      if (r.peakSet && r.peakMult > 100) {
        const nowHour  = new Date().getUTCHours();
        const inPeak   = nowHour >= r.peakStart && nowHour < r.peakEnd;
        const peakCost = Math.ceil((Number(r.price) * r.peakMult) / 100);
        const extra    = peakCost - Number(r.price);
        const badge    = inPeak ? `<span style="color:#f59e0b;font-weight:600"> 🔴 NOW</span>` : "";
        peakCell = `${r.peakStart}:00–${r.peakEnd}:00 UTC · ${(r.peakMult/100).toFixed(2)}×${badge}<br>` +
                   `<small style="color:#94a3b8">${peakCost} cr during peak (+${extra} cr)</small>`;
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td title="${r.addr}">${r.addr.slice(0,8)}…</td>
        <td>${r.name}</td>
        <td>${r.vendor}</td>
        <td>${r.category}</td>
        <td>${r.price} cr</td>
        <td>${peakCell}</td>
        <td><button class="secondary" data-addr="${r.addr}">Remove</button></td>`;
      tr.querySelector("button")!.addEventListener("click", (ev) => {
        const a = (ev.target as HTMLButtonElement).dataset["addr"]!;
        ($("removeFacAddr") as HTMLSelectElement).value = a;
      });
      tbody.appendChild(tr);
    }
  } catch (e: any) {
    tbody.innerHTML = `<tr><td colspan='5'>${e.message}</td></tr>`;
  }
}

async function loadTierInfo() {
  try {
    const sub    = await getSubscriptionContract();
    const ledger = await getLedgerContract();

    const rate   = await ledger.creditToEthRate();
    const rateEl = document.getElementById("currentRate");
    if (rateEl) rateEl.textContent = fmtEth(rate) + " per credit";

    for (let t = 1; t <= 3; t++) {
      const cfg = await sub.tiers(t);
      const el  = document.getElementById(`tierInfo${t}`);
      if (el) el.textContent = `${cfg.credits} cr | ${fmtEth(cfg.price)}`;
    }

    const bonus   = await sub.referralBonus();
    const bonusEl = document.getElementById("currentReferralBonus");
    if (bonusEl) bonusEl.textContent = bonus.toString();
  } catch { /* network not ready */ }
}

// set referral bonus button
$('btnSetReferralBonus').addEventListener('click', async () => {
  const val = ($('referralBonusInput') as HTMLInputElement).value;
  if (val === '') { setStatus('statusReferralBonus', 'Enter a bonus amount (0 to disable).', false); return; }
  try {
    const sub = await getSubscriptionContract(true);
    const tx  = await sub.setReferralBonus(BigInt(val));
    setStatus('statusReferralBonus', `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus('statusReferralBonus', `✅ Referral bonus set to ${val} credits.`);
    await loadTierInfo();
  } catch (e: any) {
    setStatus('statusReferralBonus', e.reason ?? e.message, false);
  }
});
