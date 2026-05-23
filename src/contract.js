export const CONTRACT_ADDRESS = "0x0495542b784eE53E574C539908B09C534b837A76";

export const CONTRACT_ABI = [
  "function createMarket(string question, string matchId, uint256 duration) returns (uint256)",
  "function placeBet(uint256 marketId, bool isYes) payable",
  "function settleMarket(uint256 marketId, bool result)",
  "function claimWinnings(uint256 marketId)",
  "function getAllMarkets() view returns (tuple(uint256 id, string question, string matchId, uint256 closesAt, uint256 totalYes, uint256 totalNo, uint8 outcome, bool settled)[])",
  "function getMarket(uint256 marketId) view returns (tuple(uint256 id, string question, string matchId, uint256 closesAt, uint256 totalYes, uint256 totalNo, uint8 outcome, bool settled))",
  "event MarketCreated(uint256 indexed id, string question, string matchId, uint256 closesAt)",
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, uint256 amount)",
  "event MarketSettled(uint256 indexed marketId, uint8 outcome)"
];

export const XLAYER_TESTNET = {
  id: 1952,
  name: "X Layer Testnet",
  network: "xlayer-testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://testrpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer-test" } },
};
