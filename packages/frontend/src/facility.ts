import "./shared.css";
import { ethers }                                                        from "ethers";
import { getRegistryContract, getLedgerContract, getAddress,
         $, setStatus, fmtEth, initWalletBanner }                       from "./utils";

let facilityAddress = "";

document.addEventListener("DOMContentLoaded", async () => {
  facilityAddress = (await initWalletBanner("wallet-banner")) ?? "";
  if (!facilityAddress) return;

  try {
    const reg       = await getRegistryContract();
    const adminAddr = await reg.admin();

    if (adminAddr.toLowerCase() === facilityAddress.toLowerCase()) {
      document.querySelector("main")!.innerHTML =
        `<p style="color:#ef4444;font-size:1.1rem;padding:2rem">
          ⛔ Access denied.<br>Admin wallets should use the
          <a href="admin.html">Admin Portal</a>.<br>
          <small style="color:#94a3b8">Connected: ${facilityAddress}</small>
        </p>`;
      return;
    }

    const whitelisted = await reg.isWhitelisted(facilityAddress);
    if (!whitelisted) {
      document.querySelector("main")!.innerHTML =
        `<p style="color:#ef4444;font-size:1.1rem;padding:2rem">
          ⛔ Access denied.<br>Your address is not a registered facility.<br>
          <small style="color:#94a3b8">Connected: ${facilityAddress}</small>
        </p>`;
      return;
    }
  } catch (e: any) {
    setStatus("wallet-banner", e.message, false);
    return;
  }

  await loadFacilityInfo();
});

// fetch and display this facility's info
async function loadFacilityInfo() {
  if (!facilityAddress) return;
  try {
    const reg    = await getRegistryContract();
    const ledger = await getLedgerContract();

    const whitelisted = await reg.isWhitelisted(facilityAddress);
    if (!whitelisted) {
      $("facStatus").textContent = "⚠️ Your address is not a registered active facility.";
      return;
    }
    $("facStatus").textContent = "";

    const [name, vendor, category] = await reg.getFacility(facilityAddress);
    const acct   = await ledger.facilityAccounts(facilityAddress);
    const ethVal = await ledger.getEarningsInEth(facilityAddress);

    $("infoName").textContent     = name;
    $("infoVendor").textContent   = vendor;
    $("infoCategory").textContent = category;
    $("infoPrice").textContent    = acct.sessionPrice.toString() + " credits";
    $("infoEarnings").textContent =
      acct.earnings.toString() + " credits (~" + fmtEth(ethVal) + ")";

    // Peak hours
    const [peakStart, peakEnd, peakMult, peakSet] = await reg.getPeakHours(facilityAddress);
    if (peakSet && Number(peakMult) > 100) {
      const nowHour  = new Date().getUTCHours();
      const inPeak   = nowHour >= Number(peakStart) && nowHour < Number(peakEnd);
      const basePrice = Number(acct.sessionPrice);
      const peakPrice = Math.ceil((basePrice * Number(peakMult)) / 100);
      const extra     = peakPrice - basePrice;
      $("infoPeakWindow").textContent =
        `${peakStart}:00 – ${peakEnd}:00` + (inPeak ? " 🔴 NOW" : "");
      $("infoPeakWindow").style.color = inPeak ? "#f59e0b" : "";
      $("infoPeakPrice").textContent  =
        `${peakPrice} cr (+${extra} cr · ${(Number(peakMult)/100).toFixed(2)}×)`;
      $("infoPeakPrice").style.color  = inPeak ? "#f59e0b" : "";
    } else {
      $("infoPeakWindow").textContent = "Not configured";
      $("infoPeakPrice").textContent  = "Normal rate only";
    }
  } catch (e: any) {
    setStatus("statusInfo", e.message, false);
  }
}

// set session price button
$("btnSetPrice").addEventListener("click", async () => {
  const newPrice = BigInt(($("newPrice") as HTMLInputElement).value || "0");
  if (newPrice <= 0n) {
    setStatus("statusPrice", "Enter a positive credit price.", false); return;
  }
  try {
    const ledgerW = await getLedgerContract(true);
    const tx      = await ledgerW.setSessionPrice(newPrice);
    setStatus("statusPrice", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusPrice", `✅ Session price updated to ${newPrice} credits.`);
    await loadFacilityInfo();
  } catch (e: any) {
    setStatus("statusPrice", e.reason ?? e.message, false);
  }
});

// set peak hours button
$("btnSetPeakHours").addEventListener("click", async () => {
  const startHour  = Number(($("peakStart")      as HTMLInputElement).value);
  const endHour    = Number(($("peakEnd")        as HTMLInputElement).value);
  const multiplier = Number(($("peakMultiplier") as HTMLInputElement).value);

  if (isNaN(startHour) || isNaN(endHour) || isNaN(multiplier) ||
      ($("peakStart") as HTMLInputElement).value === "" ||
      ($("peakEnd")   as HTMLInputElement).value === "") {
    setStatus("statusPeakHours", "Fill all peak hours fields.", false); return;
  }
  if (multiplier < 100) { setStatus("statusPeakHours", "Multiplier must be ≥ 100.", false); return; }
  try {
    const reg = await getRegistryContract(true);
    const tx  = await reg.setPeakHours(startHour, endHour, multiplier);
    setStatus("statusPeakHours", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusPeakHours", `✅ Peak hours set: ${startHour}:00–${endHour}:00 (${multiplier}% multiplier).`);
    await loadFacilityInfo();
  } catch (e: any) {
    setStatus("statusPeakHours", e.reason ?? e.message, false);
  }
});

// withdraw earnings button
$("btnWithdraw").addEventListener("click", async () => {
  try {
    const ledger = await getLedgerContract();
    const acct   = await ledger.facilityAccounts(facilityAddress);
    if (acct.earnings === 0n) {
      setStatus("statusWithdraw", "No earnings to withdraw.", false); return;
    }
    const ethVal = await ledger.getEarningsInEth(facilityAddress);
    if (!confirm(`Withdraw ${acct.earnings} credits → ~${fmtEth(ethVal)}?`)) return;

    const ledgerW = await getLedgerContract(true);
    const tx      = await ledgerW.withdrawEarnings();
    setStatus("statusWithdraw", `⏳ Tx sent: ${tx.hash}`);
    await tx.wait();
    setStatus("statusWithdraw", `✅ Withdrew ~${fmtEth(ethVal)}.`);
    await loadFacilityInfo();
  } catch (e: any) {
    setStatus("statusWithdraw", e.reason ?? e.message, false);
  }
});

$("btnRefresh").addEventListener("click", async () => {
  facilityAddress = await getAddress();
  await loadFacilityInfo();
});
