import "./shared.css";
import { ethers }                                                             from "ethers";
import { getRegistryContract, getSubscriptionContract, getLedgerContract,
         getAddress, $, setStatus, fmtDate, fmtEth, initWalletBanner }      from "./utils";
import { TIER_NAMES, TIER_COLORS }                                           from "./config";

let userAddress = "";

document.addEventListener("DOMContentLoaded", async () => {
  await loadTierPrices();
  await loadReferralBonus();
  await loadFacilityCards();
  userAddress = (await initWalletBanner("wallet-banner")) ?? "";
  if (!userAddress) return;

  try {
    const reg  = await getRegistryContract();
    const adminAddr   = await reg.admin();
    const isFacility  = await reg.isWhitelisted(userAddress);
    const isAdmin     = adminAddr.toLowerCase() === userAddress.toLowerCase();

    if (isAdmin) {
      document.querySelector("main")!.innerHTML =
        `<p style="color:#ef4444;font-size:1.1rem;padding:2rem">
          ⛔ Access denied.<br>Admin wallets should use the
          <a href="admin.html">Admin Portal</a>.<br>
          <small style="color:#94a3b8">Connected: ${userAddress}</small>
        </p>`;
      return;
    }
    if (isFacility) {
      document.querySelector("main")!.innerHTML =
        `<p style="color:#ef4444;font-size:1.1rem;padding:2rem">
          ⛔ Access denied.<br>Facility wallets should use the
          <a href="facility.html">Facility Portal</a>.<br>
          <small style="color:#94a3b8">Connected: ${userAddress}</small>
        </p>`;
      return;
    }
  } catch (e: any) {
    setStatus("wallet-banner", e.message, false);
    return;
  }

  await populateFacilityDropdowns();
  await refreshAll();
});

async function refreshAll() {
  await Promise.all([loadSubscription(), loadTierPrices(), populateFacilityDropdowns(), loadFacilityCards()]);
}

// load and display the member's current subscription
async function loadSubscription() {
  if (!userAddress) return;
  try {
    const sub    = await getSubscriptionContract();
    const subData = await sub.subscriptions(userAddress);
    const tierN   = Number(subData.tierID);
    const balance = await sub.getBalance(userAddress);
    const active  = await sub.isActive(userAddress);

    $("subTier").textContent    = tierN > 0 ? TIER_NAMES[tierN] : "None";
    $("subTier").style.color    = TIER_COLORS[tierN] ?? "";
    $("subExpiry").textContent  = tierN > 0 ? fmtDate(subData.expiry) : "—";
    $("subCredits").textContent = balance.toString();
    $("subActive").textContent  = active ? "✅ Active" : "❌ Expired";
  } catch (e: any) {
    if (e?.code === "BAD_DATA" || String(e?.message).includes("BAD_DATA")) {
      setStatus("statusSub", "⚠️ Contracts not deployed on this network. Switch MetaMask to Localhost 8545.", false);
    } else {
      setStatus("statusSub", e.message, false);
    }
  }
}

const TIER_DEFAULTS = [
  null,
  { price: "0.05", credits: "40"  },
  { price: "0.09", credits: "80"  },
  { price: "0.15", credits: "150" },
];

async function loadTierPrices() {
  try {
    const sub = await getSubscriptionContract();
    for (let t = 1; t <= 3; t++) {
      const cfg = await sub.tiers(t);
      const el  = document.getElementById(`price${t}`);
      if (el) el.textContent = `${fmtEth(cfg.price)} / ${cfg.credits} credits`;
    }
  } catch {
    // Contract unreachable – show hardcoded defaults
    for (let t = 1; t <= 3; t++) {
      const el = document.getElementById(`price${t}`);
      const d  = TIER_DEFAULTS[t]!;
      if (el) el.textContent = `${d.price} ETH / ${d.credits} credits (default)`;
    }
  }
}

// subscribe button
$("btnSubscribe").addEventListener("click", async () => {
  const tierNum = Number(($("subTierSel") as HTMLSelectElement).value);
  try {
    const sub = await getSubscriptionContract();
    const cfg = await sub.tiers(tierNum);
    const subW = await getSubscriptionContract(true);
    const tx   = await subW.subscribe(tierNum, { value: cfg.price });
    setStatus("statusSub", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusSub", `✅ Subscribed to ${TIER_NAMES[tierNum]}!`);
    await loadSubscription();
  } catch (e: any) {
    setStatus("statusSub", e.reason ?? e.message, false);
  }
});

// renew button
$("btnRenew").addEventListener("click", async () => {
  try {
    const sub     = await getSubscriptionContract();
    const subData = await sub.subscriptions(userAddress);
    const cfg     = await sub.tiers(subData.tierID);
    const subW    = await getSubscriptionContract(true);
    const tx      = await subW.renewSubscription({ value: cfg.price });
    setStatus("statusSub", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusSub", "✅ Subscription renewed!");
    await loadSubscription();
  } catch (e: any) {
    setStatus("statusSub", e.reason ?? e.message, false);
  }
});

async function loadReferralBonus() {
  try {
    const sub   = await getSubscriptionContract();
    const bonus = await sub.referralBonus();
    const el    = document.getElementById("refBonusDisplay");
    if (el) el.textContent = bonus.toString();
  } catch { /* network not ready */ }
}

// subscribe with referral button
$("btnSubscribeRef").addEventListener("click", async () => {
  const tierNum  = Number(($("refTierSel")    as HTMLSelectElement).value);
  const referrer = ($("referrerAddr") as HTMLInputElement).value.trim();
  if (!referrer) { setStatus("statusRef", "Enter your referrer's wallet address.", false); return; }
  try {
    const sub = await getSubscriptionContract();
    const cfg = await sub.tiers(tierNum);
    const subW = await getSubscriptionContract(true);
    const tx   = await subW.subscribeWithReferral(tierNum, referrer, { value: cfg.price });
    setStatus("statusRef", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusRef", `✅ Subscribed to ${TIER_NAMES[tierNum]} with referral bonus!`);
    await loadSubscription();
  } catch (e: any) {
    setStatus("statusRef", e.reason ?? e.message, false);
  }
});
async function updatePeakBanner(facilityAddr: string) {
  const banner = document.getElementById("peakBanner")!;
  if (!facilityAddr) { banner.style.display = "none"; return; }
  try {
    const reg    = await getRegistryContract();
    const ledger = await getLedgerContract();
    const [startHour, endHour, multiplier, isSet] = await reg.getPeakHours(facilityAddr);
    const acct        = await ledger.facilityAccounts(facilityAddr);
    const sessionPrice = Number(acct.sessionPrice);

    if (!isSet || Number(multiplier) <= 100) {
      banner.style.display = "none";
      return;
    }

    const nowHour    = new Date().getUTCHours();
    const inPeak     = nowHour >= Number(startHour) && nowHour < Number(endHour);
    const mult       = Number(multiplier);
    const actualCost = Math.ceil((sessionPrice * mult) / 100);
    const extra      = actualCost - sessionPrice;

    if (inPeak) {
      banner.style.cssText = [
        "display:block", "margin-bottom:0.75rem", "padding:0.75rem 1rem",
        "border-radius:8px", "font-size:0.85rem", "line-height:1.6",
        "background:#fff3cd", "border:1px solid #ffc107", "color:#7a4f00"
      ].join(";");
      banner.innerHTML =
        `⚠️ <strong>Peak Hours Active</strong> (${startHour}:00–${endHour}:00 UTC)<br>` +
        `Multiplier: <strong>${(mult / 100).toFixed(2)}×</strong> &nbsp;|&nbsp; ` +
        `Base price: <strong>${sessionPrice} cr</strong> &nbsp;→&nbsp; ` +
        `You will pay: <strong>${actualCost} cr</strong> &nbsp;` +
        `<span style="color:#c0392b">(+${extra} cr peak surcharge)</span>`;
    } else {
      banner.style.cssText = [
        "display:block", "margin-bottom:0.75rem", "padding:0.75rem 1rem",
        "border-radius:8px", "font-size:0.85rem", "line-height:1.6",
        "background:#e8f5e9", "border:1px solid #4caf50", "color:#1b5e20"
      ].join(";");
      banner.innerHTML =
        `✅ <strong>Off-Peak</strong> — normal rate applies.<br>` +
        `Cost: <strong>${sessionPrice} cr</strong> &nbsp;` +
        `<span style="color:#555">(Peak hours: ${startHour}:00–${endHour}:00 UTC · ${(mult / 100).toFixed(2)}× surcharge during peak)</span>`;
    }
  } catch {
    document.getElementById("peakBanner")!.style.display = "none";
  }
}

($("checkInFac") as HTMLSelectElement).addEventListener("change", async (e) => {
  await updatePeakBanner((e.target as HTMLSelectElement).value);
});

// check-in button
$("btnCheckIn").addEventListener("click", async () => {
  const addr = ($("checkInFac") as HTMLSelectElement).value;
  if (!addr) { setStatus("statusCheckIn", "Select a facility.", false); return; }
  try {
    const ledgerW = await getLedgerContract(true);
    const tx      = await ledgerW.checkIn(addr);
    setStatus("statusCheckIn", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusCheckIn", "✅ Check-in recorded!");
    await loadSubscription();
    await loadVisitStats();
  } catch (e: any) {
    setStatus("statusCheckIn", e.reason ?? e.message, false);
  }
});

// visit stats panel
async function loadVisitStats() {
  if (!userAddress) return;
  const sel = $("statFacSel") as HTMLSelectElement;
  const facAddr = sel.value;
  if (!facAddr) { setStatus("statusStats", "Select a facility first.", false); return; }
  try {
    const reg    = await getRegistryContract();
    const ledger = await getLedgerContract();
    const [name,, category] = await reg.getFacility(facAddr);
    const [totalUsed, totalRem] = await ledger.getMonthlyVisitStatus(userAddress);
    const [catUsed, catRem]     = await ledger.getCategoryVisitStatus(userAddress, category);
    $("statCatUsed").textContent  = catUsed.toString();
    $("statCatRem").textContent   = catRem.toString();
    $("statVendUsed").textContent = totalUsed.toString();
    $("statVendRem").textContent  = totalRem.toString();
    setStatus("statusStats", `✅ Category: ${category} | Facility: ${name}`);
  } catch (e: any) {
    setStatus("statusStats", e.reason ?? e.message, false);
  }
}

$("btnStats").addEventListener("click", async () => { await loadVisitStats(); });
($("statFacSel") as HTMLSelectElement).addEventListener("change", async () => { await loadVisitStats(); });

async function loadFacilityCards() {
  const grid = document.getElementById("facilitiesGrid")!;
  try {
    const reg    = await getRegistryContract();
    const ledger = await getLedgerContract();
    const addrs: string[] = await reg.getAllFacilities();
    const active = addrs.filter(async a => await reg.isWhitelisted(a));

    const cards: string[] = [];
    for (const addr of addrs) {
      const ok = await reg.isWhitelisted(addr);
      if (!ok) continue;

      const [name, vendor, category] = await reg.getFacility(addr);
      const acct = await ledger.facilityAccounts(addr);
      const [peakStart, peakEnd, peakMult, peakSet] = await reg.getPeakHours(addr);

      const basePrice = Number(acct.sessionPrice);
      const mult      = Number(peakMult);
      const isSet     = Boolean(peakSet) && mult > 100;
      const nowHour   = new Date().getUTCHours();
      const inPeak    = isSet && nowHour >= Number(peakStart) && nowHour < Number(peakEnd);

      let peakBadge  = `<span class="fac-peak-badge none">No peak hours</span>`;
      let peakDetail = "";

      if (isSet) {
        const peakPrice = Math.ceil((basePrice * mult) / 100);
        const extra     = peakPrice - basePrice;
        if (inPeak) {
          peakBadge  = `<span class="fac-peak-badge active">🔴 Peak Now · ${(mult/100).toFixed(2)}×</span>`;
          peakDetail = `<div class="fac-peak-detail">${peakStart}:00–${peakEnd}:00 UTC &nbsp;·&nbsp; <strong style="color:#f59e0b">${peakPrice} cr</strong> during peak (+${extra} cr)</div>`;
        } else {
          peakBadge  = `<span class="fac-peak-badge inactive">✅ Off-Peak · ${(mult/100).toFixed(2)}×</span>`;
          peakDetail = `<div class="fac-peak-detail">Peak: ${peakStart}:00–${peakEnd}:00 UTC &nbsp;·&nbsp; ${peakPrice} cr during peak (+${extra} cr)</div>`;
        }
      }

      cards.push(`
        <div class="fac-card">
          <div class="fac-card-name">${name}</div>
          <div class="fac-card-meta">${category} &nbsp;·&nbsp; ${vendor}</div>
          <div class="fac-card-price">Session: <strong>${basePrice} cr</strong></div>
          ${peakBadge}
          ${peakDetail}
        </div>`);
    }

    grid.innerHTML = cards.length
      ? cards.join("")
      : `<p style="color:var(--muted);font-size:0.85rem">No active facilities found.</p>`;
  } catch {
    grid.innerHTML = `<p style="color:var(--muted);font-size:0.85rem">Could not load facilities — make sure your wallet is connected.</p>`;
  }
}

async function populateFacilityDropdowns() {
  const selCheckIn = $("checkInFac") as HTMLSelectElement;
  const selStats   = $("statFacSel") as HTMLSelectElement;
  selCheckIn.innerHTML = '<option value="">Select facility…</option>';
  selStats.innerHTML   = '<option value="">Select facility…</option>';
  try {
    const reg    = await getRegistryContract();
    const ledger = await getLedgerContract();
    const addrs: string[] = await reg.getAllFacilities();
    for (const addr of addrs) {
      const ok = await reg.isWhitelisted(addr);
      if (!ok) continue;
      const [name, vendor, category] = await reg.getFacility(addr);
      const acct   = await ledger.facilityAccounts(addr);
      const label  = `${name} (${category}) – ${acct.sessionPrice} cr`;
      selCheckIn.appendChild(new Option(label, addr));
      selStats.appendChild(new Option(`${name} – ${category} / ${vendor}`, addr));
    }
  } catch { /* network not ready */ }
}
