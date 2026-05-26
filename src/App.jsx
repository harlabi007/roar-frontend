import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, XLAYER_TESTNET } from "./contract";
import "./App.css";

function useCountdown(closesAt) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = Number(closesAt) * 1000 - Date.now();
      if (diff <= 0) { setTimeLeft("Closed"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [closesAt]);
  return timeLeft;
}

function MarketCard({ market, contract, account }) {
  const [betAmount, setBetAmount] = useState("0.01");
  const [loading, setLoading] = useState(false);
  const timeLeft = useCountdown(market.closesAt);
  const totalPool = Number(ethers.formatEther(market.totalYes + market.totalNo));
  const yesPool = Number(ethers.formatEther(market.totalYes));
  const noPool = Number(ethers.formatEther(market.totalNo));
  const yesPct = totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50;
  const isOpen = !market.settled && timeLeft !== "Closed";

  async function bet(isYes) {
    if (!contract || !account) return alert("Connect wallet first!");
    const amt = parseFloat(betAmount);
    if (!betAmount || isNaN(amt) || amt <= 0) return alert("Enter a valid bet amount!");
    setLoading(true);
    try {
      const tx = await contract.placeBet(market.id, isYes, {
        value: ethers.parseEther(String(amt))
      });
      await tx.wait();
      alert("Bet placed! 🦁");
    } catch (e) {
      alert("Error: " + (e.reason || e.message));
    }
    setLoading(false);
  }

  async function claim() {
    if (!contract || !account) return alert("Connect wallet first!");
    setLoading(true);
    try {
      const tx = await contract.claimWinnings(market.id);
      await tx.wait();
      alert("Winnings claimed! 🎉");
    } catch (e) {
      alert("Error: " + (e.reason || e.message));
    }
    setLoading(false);
  }

  const outcomeLabel =
    market.outcome === 1n ? "✅ YES WON" :
    market.outcome === 2n ? "❌ NO WON" :
    "CANCELLED";

  return (
    <div className={`market-card ${isOpen ? "open" : ""} ${market.settled ? "settled" : ""}`}>
      <div className="market-header">
        <div className="match-id">⚽ {market.matchId.replace(/_/g, " ")}</div>
        <div className={`market-status ${isOpen ? "status-open" : market.settled ? "status-settled" : "status-closed"}`}>
          {isOpen ? `⏱ ${timeLeft}` : market.settled ? outcomeLabel : "CLOSED"}
        </div>
      </div>
      <p className="question">{market.question}</p>
      <div className="pool-bar">
        <div className="pool-fill-yes" style={{ width: yesPct + "%" }} />
      </div>
      <div className="pool-labels">
        <span className="label-yes">YES {yesPct}% · {yesPool.toFixed(3)} OKB</span>
        <span className="label-no">NO {100 - yesPct}% · {noPool.toFixed(3)} OKB</span>
      </div>
      {isOpen && (
        <div className="bet-section">
          <div className="quick-amounts">
            {[0.01, 0.05, 0.1, 0.5].map(a => (
              <button
                key={a}
                className={`quick-amt ${betAmount === String(a) ? "selected" : ""}`}
                onClick={() => setBetAmount(String(a))}
              >{a}</button>
            ))}
          </div>
          <div className="bet-row">
            <input
              type="number"
              value={betAmount}
              onChange={e => setBetAmount(e.target.value)}
              min="0.001"
              step="0.001"
              className="bet-input"
              placeholder="OKB"
            />
            <span className="bet-label">OKB</span>
          </div>
          <div className="bet-buttons">
            <button className="btn-yes" onClick={() => bet(true)} disabled={loading}>
              {loading ? "..." : "✅ YES"}
            </button>
            <button className="btn-no" onClick={() => bet(false)} disabled={loading}>
              {loading ? "..." : "❌ NO"}
            </button>
          </div>
        </div>
      )}
      {market.settled && market.outcome !== 3n && (
        <button className="btn-claim" onClick={claim} disabled={loading}>
          {loading ? "Claiming..." : "🏆 Claim Winnings"}
        </button>
      )}
      <div className="market-footer">
        <span className="vol-label">Vol: {totalPool.toFixed(3)} OKB</span>
      </div>
    </div>
  );
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("auto"); // auto | open | settled

  async function connectWallet() {
    if (!window.ethereum) return alert("Install MetaMask!");
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: "0x7A0", chainName: "X Layer Testnet", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: ["https://testrpc.xlayer.tech"], blockExplorerUrls: ["https://www.oklink.com/xlayer-test"] }]
      });
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setAccount(accounts[0]);
      setContract(c);
      loadMarkets(c);
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  async function loadMarkets(c) {
    setLoading(true);
    try {
      const all = await (c || contract).getAllMarkets();
      setMarkets([...all].reverse());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  // ─── SMART FILTER LOGIC ───────────────────────────────────────────────
  // 1. ALWAYS hide cancelled markets (settled + outcome === 3n)
  // 2. Auto mode:
  //    - If open/live markets exist → show only those
  //    - If none → show recently settled (non-cancelled) markets
  // 3. Manual filters work independently
  const now = Date.now() / 1000;
  const nonCancelled = markets.filter(m => !(m.settled && m.outcome === 3n));
  const openMarkets = nonCancelled.filter(m => !m.settled && Number(m.closesAt) > now);
  const settledMarkets = nonCancelled.filter(m => m.settled);

  let displayed = [];
  let sectionLabel = "";

  if (filter === "open") {
    displayed = openMarkets;
  } else if (filter === "settled") {
    displayed = settledMarkets;
  } else {
    // AUTO: live first, fall back to recent settled
    if (openMarkets.length > 0) {
      displayed = openMarkets;
      sectionLabel = "🔴 LIVE MARKETS";
    } else if (settledMarkets.length > 0) {
      displayed = settledMarkets.slice(0, 12);
      sectionLabel = "🕐 RECENT MATCHES — No live matches right now";
    }
  }

  const short = account ? account.slice(0, 6) + "..." + account.slice(-4) : null;

  return (
    <div className="app">
      <header className="header">
        <div className="logo">ROAR<span>.</span></div>
        <div className="header-right">
          {openMarkets.length > 0 && <span className="live-badge">● LIVE</span>}
          {!account ? (
            <button className="connect-btn" onClick={connectWallet}>Connect wallet</button>
          ) : (
            <div className="account-badge">{short}</div>
          )}
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat">
          <div className="stat-label">Live</div>
          <div className="stat-value">{openMarkets.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Settled</div>
          <div className="stat-value">{settledMarkets.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total</div>
          <div className="stat-value">{nonCancelled.length}</div>
        </div>
      </div>

      <main className="main">
        {!account && (
          <div className="empty-state">
            <div className="empty-icon">🦁</div>
            <h2>Feel the match. Own the moment.</h2>
            <p>AI-powered live prediction markets for the 2026 World Cup — built on X Layer</p>
            <button className="connect-btn-lg" onClick={connectWallet}>Connect wallet to start</button>
          </div>
        )}

        {account && loading && <div className="loading">Loading markets...</div>}

        {account && !loading && (
          <>
            {/* Filter buttons */}
            <div className="filter-bar">
              <button
                className={`filter-btn ${filter === "auto" ? "active" : ""}`}
                onClick={() => setFilter("auto")}
              >🔴 Live</button>
              <button
                className={`filter-btn ${filter === "open" ? "active" : ""}`}
                onClick={() => setFilter("open")}
              >🟢 Open</button>
              <button
                className={`filter-btn ${filter === "settled" ? "active" : ""}`}
                onClick={() => setFilter("settled")}
              >✅ Settled</button>
            </div>

            {/* Section label */}
            {sectionLabel && filter === "auto" && (
              <div className="section-label">{sectionLabel}</div>
            )}

            {/* Markets */}
            {displayed.length === 0 ? (
              <div className="empty-state">
                <p>
                  {filter === "open"
                    ? "No live markets right now. Markets appear automatically when matches kick off."
                    : filter === "settled"
                    ? "No settled markets yet."
                    : "No markets available right now. Check back when matches start!"}
                </p>
                <button className="refresh-btn" onClick={() => loadMarkets()}>🔄 Refresh</button>
              </div>
            ) : (
              <>
                <div className="markets-grid">
                  {displayed.map((m, i) => (
                    <MarketCard key={i} market={m} contract={contract} account={account} />
                  ))}
                </div>
                <button className="refresh-btn" onClick={() => loadMarkets()}>🔄 Refresh Markets</button>
              </>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <a href={`https://www.oklink.com/xlayer-test/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
          View contract on explorer ↗
        </a>
      </footer>
    </div>
  );
}
