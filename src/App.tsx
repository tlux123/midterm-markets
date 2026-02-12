import KalshiMarketPriceChart from './KalshiMarketPriceChart';

export default function App() {
  const apiBaseUrl = `${window.location.origin}/api/kalshi/trade-api/v2`;

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, background: '#f8fafc' }}>
      <div style={{ width: '100%', height: '100%' }}>
      <KalshiMarketPriceChart
        marketId="CONTROLH-2026-D"
        seriesTicker="CONTROLH"
        marketTitle="Will Democrats Win the U.S. House in 2026?"
        projectionSeriesTicker="KXDHOUSESEATS"
        projectionEventTicker="KXDHOUSESEATS-27"
        projectionLabel="Expected Dem Seats Market"
        controlsMarketId="CONTROLS-2026-D"
        controlsSeriesTicker="CONTROLS"
        controlsLabel="Democrats Control Senate Market"
        apiBaseUrl={apiBaseUrl}
        showVolume
      />
      </div>
    </div>
  );
}
