import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueries,
} from '@tanstack/react-query';
import {
  Chart as ChartJS,
  BarController,
  CategoryScale,
  LinearScale,
  LineController,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  type Plugin,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Chart as ReactChart } from 'react-chartjs-2';

const dragSelectionPlugin: Plugin<'bar' | 'line'> = {
  id: 'dragSelection',
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const opts = pluginOptions as { enabled?: boolean; startTs?: number; endTs?: number };
    if (!opts?.enabled || opts.startTs == null || opts.endTs == null) return;

    const xScale = chart.scales?.x;
    const area = chart.chartArea;
    if (!xScale || !area) return;

    let x1 = xScale.getPixelForValue(opts.startTs);
    let x2 = xScale.getPixelForValue(opts.endTs);
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;

    x1 = Math.max(area.left, Math.min(area.right, x1));
    x2 = Math.max(area.left, Math.min(area.right, x2));

    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, area.top);
    ctx.lineTo(x1, area.bottom);
    ctx.moveTo(x2, area.top);
    ctx.lineTo(x2, area.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

const lineHeadGlowPlugin: Plugin<'bar' | 'line'> = {
  id: 'lineHeadGlow',
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const opts = pluginOptions as { enabled?: boolean; xTs?: number; yVal?: number; radius?: number };
    if (!opts?.enabled || opts.xTs == null || opts.yVal == null) return;
    const xScale = chart.scales?.x;
    const yScale = chart.scales?.yPrice;
    if (!xScale || !yScale) return;

    const x = xScale.getPixelForValue(opts.xTs);
    const y = yScale.getPixelForValue(opts.yVal);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const radius = opts.radius ?? 28;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
    halo.addColorStop(0, 'rgba(255,255,255,1)');
    halo.addColorStop(0.35, 'rgba(255,255,255,0.72)');
    halo.addColorStop(0.7, 'rgba(255,255,255,0.22)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

const chartBackdropPlugin: Plugin<'bar' | 'line'> = {
  id: 'chartBackdrop',
  beforeDatasetsDraw(chart) {
    const area = chart.chartArea;
    const yScale = chart.scales?.yPrice;
    if (!area || !yScale) return;

    const { ctx } = chart;
    ctx.save();

    const topColor = 'rgba(220, 38, 38, 0.32)';
    const midColor = 'rgba(100, 116, 139, 0.16)';
    const bottomColor = 'rgba(37, 99, 235, 0.32)';
    const vertical = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    vertical.addColorStop(0, topColor);
    vertical.addColorStop(0.5, midColor);
    vertical.addColorStop(1, bottomColor);
    ctx.fillStyle = vertical;
    ctx.fillRect(area.left, area.top, area.right - area.left, area.bottom - area.top);

    const midY = yScale.getPixelForValue(50);
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(area.left, midY);
    ctx.lineTo(area.right, midY);
    ctx.stroke();

    ctx.restore();
  },
};

const lineGlowPlugin: Plugin<'bar' | 'line'> = {
  id: 'lineGlow',
  beforeDatasetDraw(chart, args, pluginOptions) {
    const dataset = chart.data.datasets[args.index];
    if (dataset.type !== 'line' || dataset.label === 'Measured Range') return;
    const opts = pluginOptions as
      | { blur?: number; alpha?: number; colorsByLabel?: Record<string, string> }
      | undefined;
    const ctx = chart.ctx;
    const alpha = opts?.alpha ?? 0.8;
    const label = String(dataset.label || '');
    const baseColor =
      opts?.colorsByLabel?.[label] || (label === 'Price' ? '#ffffff' : '#94a3b8');
    const [r, g, b] = hexToRgb(baseColor);
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.shadowBlur = opts?.blur ?? 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  },
  afterDatasetDraw(chart, args) {
    const dataset = chart.data.datasets[args.index];
    if (dataset.type !== 'line' || dataset.label === 'Measured Range') return;
    chart.ctx.shadowColor = 'rgba(0,0,0,0)';
    chart.ctx.shadowBlur = 0;
    chart.ctx.shadowOffsetX = 0;
    chart.ctx.shadowOffsetY = 0;
  },
  afterDatasetsDraw(chart) {
    chart.ctx.shadowColor = 'rgba(0,0,0,0)';
    chart.ctx.shadowBlur = 0;
    chart.ctx.shadowOffsetX = 0;
    chart.ctx.shadowOffsetY = 0;
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [148, 163, 184];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

ChartJS.register(
  BarController,
  LineController,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  dragSelectionPlugin,
  chartBackdropPlugin,
  lineGlowPlugin,
  lineHeadGlowPlugin
);

type Timeframe = '1D' | '7D' | '30D' | 'ALL' | 'CUSTOM';

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  updates: number;
};

type PriceResponse = {
  marketId: string;
  candles: Candle[];
  metadata?: {
    points_requested?: number;
    points_returned?: number;
    start?: number;
    end?: number;
  };
};

type KalshiCandlestickField = {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  open_dollars?: string;
  high_dollars?: string;
  low_dollars?: string;
  close_dollars?: string;
};

type KalshiCandlestick = {
  end_period_ts: number;
  price?: KalshiCandlestickField;
  yes_bid?: KalshiCandlestickField;
  volume?: number;
  volume_fp?: string;
};

type KalshiCandlestickResponse = {
  ticker: string;
  candlesticks: KalshiCandlestick[];
};

type KalshiEventMarket = {
  ticker: string;
  custom_strike?: Record<string, string>;
};

type KalshiEventResponse = {
  event: {
    event_ticker: string;
    series_ticker: string;
  };
  markets: KalshiEventMarket[];
};

type ProjectionPoint = {
  timestamp: number;
  value: number;
};

type FredObservation = {
  date: string;
  value: string;
};

type FredSeriesResponse = {
  observations?: FredObservation[];
};

type CivicApprovalResponse = {
  polls?: Array<{
    date?: string;
    end_date?: string;
    answers?: Array<{ choice?: string; percent?: number }>;
  }>;
};

type RssHeadline = {
  title: string;
  link: string;
  pubDate: string;
};
type ChartErrorBoundaryProps = {
  children: ReactNode;
};

type ChartErrorBoundaryState = {
  errorMessage: string | null;
};

class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { errorMessage: error?.message || 'Unknown render error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Chart render error:', error, info);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            padding: 16,
            background: '#0f172a',
            color: '#fecaca',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            overflow: 'auto',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Chart crashed during render</div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {this.state.errorMessage}
          </pre>
          <div style={{ color: '#cbd5e1', marginTop: 10, fontSize: 12 }}>
            Hard refresh after deploy. If this persists, send this exact message.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type CustomCompareMarket = {
  id: string;
  ticker: string;
  seriesTicker: string;
  label: string;
  colorTop: string;
  colorBottom: string;
  enabled: boolean;
};

const CUSTOM_OVERLAY_COLORS: Array<{ top: string; bottom: string }> = [
  { top: '#38bdf8', bottom: '#0ea5e9' },
  { top: '#a3e635', bottom: '#65a30d' },
  { top: '#fda4af', bottom: '#e11d48' },
  { top: '#fcd34d', bottom: '#d97706' },
  { top: '#c4b5fd', bottom: '#7c3aed' },
  { top: '#5eead4', bottom: '#0f766e' },
];

export type KalshiMarketPriceChartProps = {
  marketId: string;
  apiBaseUrl: string;
  apiKey?: string;
  showVolume?: boolean;
  seriesTicker?: string;
  marketTitle?: string;
  projectionMarketId?: string;
  projectionSeriesTicker?: string;
  projectionEventTicker?: string;
  projectionLabel?: string;
  comboMarketId?: string;
  comboSeriesTicker?: string;
  comboLabel?: string;
  controlsMarketId?: string;
  controlsSeriesTicker?: string;
  controlsLabel?: string;
  trumpApprovalLabel?: string;
  trumpApprovalEndpoint?: string;
  fredApiKey?: string;
  fredEndpoint?: string;
  sp500Label?: string;
  unemploymentLabel?: string;
};

const TIMEFRAME_CONFIG: Record<
  Timeframe,
  { points: number; startMs?: number; periodInterval: 1 | 60 | 1440 }
> = {
  '1D': { points: 50, startMs: 24 * 60 * 60 * 1000, periodInterval: 60 },
  '7D': { points: 100, startMs: 7 * 24 * 60 * 60 * 1000, periodInterval: 60 },
  '30D': { points: 150, startMs: 30 * 24 * 60 * 60 * 1000, periodInterval: 1440 },
  ALL: { points: 200, startMs: 365 * 24 * 60 * 60 * 1000, periodInterval: 1440 },
  CUSTOM: { points: 250, periodInterval: 60 },
};

function toDateTimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function inferCustomPeriodInterval(startMs: number, endMs: number): 1 | 60 | 1440 {
  const span = Math.max(0, endMs - startMs);
  if (span <= 36 * 60 * 60 * 1000) return 1;
  if (span <= 21 * 24 * 60 * 60 * 1000) return 60;
  return 1440;
}

function getTimeWindow(timeframe: Timeframe, customRange?: { startMs: number; endMs: number }): { startMs: number; endMs: number } {
  const now = Date.now();
  if (timeframe === 'CUSTOM' && customRange) return customRange;
  if (timeframe === 'ALL') return { startMs: 0, endMs: now };
  const cfg = TIMEFRAME_CONFIG[timeframe];
  return { startMs: now - (cfg.startMs ?? 365 * 24 * 60 * 60 * 1000), endMs: now };
}

function clipPointsToRange<T extends { timestamp: number }>(
  points: T[],
  range: { startMs: number; endMs: number } | null
): T[] {
  if (!range) return points;
  return points.filter((p) => p.timestamp >= range.startMs && p.timestamp <= range.endMs);
}

function nearestPointByTimestamp(points: ProjectionPoint[], targetTs: number): ProjectionPoint | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const ts = points[mid].timestamp;
    if (ts === targetTs) return points[mid];
    if (ts < targetTs) lo = mid + 1;
    else hi = mid - 1;
  }
  if (lo <= 0) return points[0];
  if (lo >= points.length) return points[points.length - 1];
  return Math.abs(points[lo].timestamp - targetTs) < Math.abs(points[lo - 1].timestamp - targetTs)
    ? points[lo]
    : points[lo - 1];
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

function nearestIndexByTimestamp(timestamps: number[], target: number): number {
  if (timestamps.length === 0) return 0;
  let lo = 0;
  let hi = timestamps.length - 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const value = timestamps[mid];
    if (value === target) return mid;
    if (value < target) lo = mid + 1;
    else hi = mid - 1;
  }

  if (lo <= 0) return 0;
  if (lo >= timestamps.length) return timestamps.length - 1;
  return Math.abs(timestamps[lo] - target) < Math.abs(timestamps[lo - 1] - target) ? lo : lo - 1;
}

function findCloseAtOrBefore(candles: Candle[], targetTs: number): number | null {
  if (candles.length === 0) return null;
  let lo = 0;
  let hi = candles.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (candles[mid].timestamp <= targetTs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  return candles[best].close;
}

function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpointPx;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsMobile(mediaQuery.matches);

    onChange();
    mediaQuery.addEventListener('change', onChange);

    return () => mediaQuery.removeEventListener('change', onChange);
  }, [breakpointPx]);

  return isMobile;
}

function parseDollar(value?: string): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferSeriesTicker(marketId: string): string | null {
  const firstDash = marketId.indexOf('-');
  if (firstDash <= 0) return null;
  return marketId.slice(0, firstDash);
}

async function fetchJsonOrThrow<T>(
  url: URL,
  headers: Record<string, string>,
  requestLabel: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url.toString(), { headers, mode: 'cors' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Network error while fetching ${requestLabel}.\nURL: ${url.toString()}\nDetails: ${message}\nHint: likely CORS or network blocking.`
    );
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }

    const bodySnippet = body ? `\nResponse: ${body.slice(0, 300)}` : '';
    throw new Error(
      `Request failed for ${requestLabel}.\nURL: ${url.toString()}\nStatus: ${response.status} ${response.statusText}${bodySnippet}`
    );
  }

  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const snippet = raw ? `\nResponse: ${raw.slice(0, 300)}` : '';
    const contentType = response.headers.get('content-type');
    throw new Error(
      `Invalid JSON while fetching ${requestLabel}.\nURL: ${url.toString()}\nStatus: ${response.status} ${response.statusText}${contentType ? `\nContent-Type: ${contentType}` : ''}${snippet}`
    );
  }
}

async function fetchTextOrThrow(
  url: URL,
  headers: Record<string, string>,
  requestLabel: string
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url.toString(), { headers, mode: 'cors' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Network error while fetching ${requestLabel}.\nURL: ${url.toString()}\nDetails: ${message}\nHint: likely CORS or network blocking.`
    );
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }
    const bodySnippet = body ? `\nResponse: ${body.slice(0, 300)}` : '';
    throw new Error(
      `Request failed for ${requestLabel}.\nURL: ${url.toString()}\nStatus: ${response.status} ${response.statusText}${bodySnippet}`
    );
  }

  return response.text();
}

function decodeHtmlEntities(value: string): string {
  if (typeof window === 'undefined') return value;
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return (doc.documentElement.textContent || '').trim();
}

async function fetchPoliticalHeadlines(limit = 4): Promise<RssHeadline[]> {
  const url = new URL('/api/news/rss/search', window.location.origin);
  url.searchParams.set('q', 'US midterm election Congress House Senate');
  url.searchParams.set('hl', 'en-US');
  url.searchParams.set('gl', 'US');
  url.searchParams.set('ceid', 'US:en');

  const xmlText = await fetchTextOrThrow(url, {}, 'political headlines feed');
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parseError = xml.querySelector('parsererror');
  if (parseError) throw new Error('Invalid RSS XML in political headlines feed.');

  return Array.from(xml.querySelectorAll('item'))
    .map((item) => {
      const title = decodeHtmlEntities(item.querySelector('title')?.textContent || '');
      const link = item.querySelector('link')?.textContent?.trim() || '';
      const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
      if (!title || !link) return null;
      return { title, link, pubDate };
    })
    .filter((h): h is RssHeadline => h !== null)
    .slice(0, limit);
}

function normalizeCandles(data: PriceResponse | KalshiCandlestickResponse, marketId: string): PriceResponse {
  if ('candles' in data) {
    return data;
  }

  const candles: Candle[] = (data.candlesticks || [])
    .map((c) => {
      const source = c.price ?? c.yes_bid;
      if (!source) return null;

      const open = parseDollar(source.open_dollars) ?? (typeof source.open === 'number' ? source.open / 100 : null);
      const high = parseDollar(source.high_dollars) ?? (typeof source.high === 'number' ? source.high / 100 : null);
      const low = parseDollar(source.low_dollars) ?? (typeof source.low === 'number' ? source.low / 100 : null);
      const close = parseDollar(source.close_dollars) ?? (typeof source.close === 'number' ? source.close / 100 : null);

      if (
        open == null ||
        high == null ||
        low == null ||
        close == null ||
        typeof c.end_period_ts !== 'number'
      ) {
        return null;
      }

      return {
        timestamp: c.end_period_ts * 1000,
        open,
        high,
        low,
        close,
        updates: c.volume ?? Number(c.volume_fp ?? 0),
      };
    })
    .filter((c): c is Candle => c !== null);

  return {
    marketId: data.ticker || marketId,
    candles,
  };
}

async function fetchMarketPrices(
  apiBaseUrl: string,
  marketId: string,
  timeframe: Timeframe,
  apiKey?: string,
  seriesTicker?: string,
  customRange?: { startMs: number; endMs: number }
): Promise<PriceResponse> {
  const nowMs = Date.now();
  const config = TIMEFRAME_CONFIG[timeframe];
  const normalizedBase = apiBaseUrl.replace(/\/$/, '');

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const isKalshi =
    Boolean(seriesTicker) ||
    normalizedBase.includes('kalshi.com') ||
    normalizedBase.includes('kalshi.co') ||
    normalizedBase.includes('/trade-api') ||
    normalizedBase.includes('/kalshi-api') ||
    normalizedBase.includes('/api/kalshi');

  if (isKalshi) {
    const resolvedSeries = seriesTicker || inferSeriesTicker(marketId);
    if (!resolvedSeries) {
      throw new Error('Kalshi mode requires seriesTicker or a marketId format like SERIES-...');
    }

    const startMs =
      timeframe === 'CUSTOM' && customRange
        ? customRange.startMs
        : nowMs - (config.startMs ?? 365 * 24 * 60 * 60 * 1000);
    const endMs = timeframe === 'CUSTOM' && customRange ? customRange.endMs : nowMs;
    const startSec = Math.floor(startMs / 1000);
    const endSec = Math.floor(endMs / 1000);
    const periodInterval =
      timeframe === 'CUSTOM' && customRange
        ? inferCustomPeriodInterval(customRange.startMs, customRange.endMs)
        : config.periodInterval;
    const url = new URL(
      `${normalizedBase}/series/${encodeURIComponent(resolvedSeries)}/markets/${encodeURIComponent(
        marketId
      )}/candlesticks`
    );

    url.searchParams.set('start_ts', String(startSec));
    url.searchParams.set('end_ts', String(endSec));
    url.searchParams.set('period_interval', String(periodInterval));
    url.searchParams.set('include_latest_before_start', 'true');

    const data = await fetchJsonOrThrow<KalshiCandlestickResponse>(url, headers, 'Kalshi candlesticks');
    return normalizeCandles(data, marketId);
  }

  const url = new URL(`${normalizedBase}/markets/${encodeURIComponent(marketId)}/prices`);
  url.searchParams.set('points', String(config.points));
  if (timeframe === 'CUSTOM' && customRange) {
    url.searchParams.set('start', String(customRange.startMs));
  } else if (config.startMs) {
    url.searchParams.set('start', String(nowMs - config.startMs));
  }

  const data = await fetchJsonOrThrow<PriceResponse>(url, headers, 'market prices');
  return normalizeCandles(data, marketId);
}

async function fetchExpectedSeatsProjection(
  apiBaseUrl: string,
  eventTicker: string,
  timeframe: Timeframe,
  apiKey?: string,
  seriesTickerHint?: string,
  referenceTimestamps?: number[]
): Promise<ProjectionPoint[]> {
  const normalizedBase = apiBaseUrl.replace(/\/$/, '');
  const eventUrl = new URL(`${normalizedBase}/events/${encodeURIComponent(eventTicker)}`);

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const eventData = await fetchJsonOrThrow<KalshiEventResponse>(eventUrl, headers, 'Kalshi event markets');
  const resolvedSeriesTicker = seriesTickerHint || eventData.event?.series_ticker;
  if (!resolvedSeriesTicker) {
    throw new Error('Missing series ticker for expected seats projection.');
  }

  const seatMarkets = (eventData.markets || [])
    .map((m) => {
      const seatRaw = m.custom_strike?.Seats ?? m.custom_strike?.seats;
      const seats = seatRaw != null ? Number(seatRaw) : NaN;
      return Number.isFinite(seats) ? { ticker: m.ticker, seats } : null;
    })
    .filter((m): m is { ticker: string; seats: number } => m !== null)
    .sort((a, b) => a.seats - b.seats);

  if (seatMarkets.length === 0) {
    throw new Error('No seat-strike markets found for this event.');
  }

  const candleResults = await Promise.all(
    seatMarkets.map(async (m) => {
      const data = await fetchMarketPrices(apiBaseUrl, m.ticker, timeframe, apiKey, resolvedSeriesTicker);
      return { ...m, candles: data.candles };
    })
  );

  const baseTimestamps =
    referenceTimestamps && referenceTimestamps.length > 0
      ? referenceTimestamps
      : Array.from(
          new Set(
            candleResults.flatMap((r) => r.candles.map((c) => c.timestamp))
          )
        ).sort((a, b) => a - b);

  const points: ProjectionPoint[] = [];
  for (const ts of baseTimestamps) {
    let weighted = 0;
    let totalProb = 0;
    for (const market of candleResults) {
      const p = findCloseAtOrBefore(market.candles, ts);
      if (p == null) continue;
      weighted += market.seats * p;
      totalProb += p;
    }
    if (totalProb > 0) {
      points.push({ timestamp: ts, value: weighted / totalProb });
    }
  }

  return points;
}

async function fetchTrumpApprovalProjection(
  endpoint: string,
  timeframe: Timeframe,
  customRange?: { startMs: number; endMs: number }
): Promise<ProjectionPoint[]> {
  const url = endpoint.startsWith('http') ? new URL(endpoint) : new URL(endpoint, window.location.origin);
  const data = await fetchJsonOrThrow<CivicApprovalResponse>(url, {}, 'Trump approval polls');
  const { startMs, endMs } = getTimeWindow(timeframe, customRange);

  const raw = (data.polls || [])
    .map((poll) => {
      const dateString = poll.date || poll.end_date;
      if (!dateString) return null;
      const ts = new Date(dateString).getTime();
      if (!Number.isFinite(ts) || ts < startMs || ts > endMs) return null;
      const approve = (poll.answers || []).find((a) => (a.choice || '').toLowerCase() === 'approve');
      if (!approve || !Number.isFinite(Number(approve.percent))) return null;
      return { timestamp: ts, value: Number(approve.percent) };
    })
    .filter((p): p is ProjectionPoint => p !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  // 1) Collapse multiple same-day polls into one average point.
  const dayBuckets = new Map<number, { sum: number; count: number }>();
  for (const p of raw) {
    const d = new Date(p.timestamp);
    const dayTs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const bucket = dayBuckets.get(dayTs) || { sum: 0, count: 0 };
    bucket.sum += p.value;
    bucket.count += 1;
    dayBuckets.set(dayTs, bucket);
  }

  const daily = Array.from(dayBuckets.entries())
    .map(([timestamp, bucket]) => ({
      timestamp,
      value: bucket.sum / bucket.count,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (daily.length <= 2) return daily;

  // 2) Apply EMA smoothing to reduce poll noise while preserving trend direction.
  const alpha = 0.35;
  const smoothed: ProjectionPoint[] = [];
  let ema = daily[0].value;
  for (const p of daily) {
    ema = alpha * p.value + (1 - alpha) * ema;
    smoothed.push({ timestamp: p.timestamp, value: Math.max(0, Math.min(100, ema)) });
  }

  return smoothed;
}

async function fetchFredSeriesProjection(
  endpoint: string,
  seriesId: string,
  timeframe: Timeframe,
  customRange?: { startMs: number; endMs: number },
  apiKey?: string
): Promise<ProjectionPoint[]> {
  const { startMs, endMs } = getTimeWindow(timeframe, customRange);
  const url = endpoint.startsWith('http') ? new URL(endpoint) : new URL(endpoint, window.location.origin);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'asc');
  url.searchParams.set('observation_start', new Date(startMs).toISOString().slice(0, 10));
  url.searchParams.set('observation_end', new Date(endMs).toISOString().slice(0, 10));
  if (apiKey) url.searchParams.set('api_key', apiKey);

  const data = await fetchJsonOrThrow<FredSeriesResponse>(url, {}, `FRED ${seriesId}`);
  return (data.observations || [])
    .map((o) => {
      const ts = new Date(`${o.date}T00:00:00Z`).getTime();
      const v = Number(o.value);
      if (!Number.isFinite(ts) || !Number.isFinite(v)) return null;
      return { timestamp: ts, value: v };
    })
    .filter((p): p is ProjectionPoint => p !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function ChartContent({
  marketId,
  apiBaseUrl,
  apiKey,
  showVolume = true,
  seriesTicker,
  marketTitle,
  projectionMarketId,
  projectionSeriesTicker,
  projectionEventTicker,
  projectionLabel = 'Seat Projection',
  comboMarketId,
  comboSeriesTicker,
  comboLabel = 'Blue Wave Combo',
  controlsMarketId,
  controlsSeriesTicker,
  controlsLabel = 'Dem Control',
  trumpApprovalLabel = 'Trump Approval',
  trumpApprovalEndpoint = '/api/civic/api/v2/poll/approval/donald-trump',
  fredApiKey,
  fredEndpoint = '/api/fred/fred/series/observations',
  sp500Label = 'S&P 500',
  unemploymentLabel = 'US Unemployment',
}: KalshiMarketPriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('7D');
  const [customStartDraft, setCustomStartDraft] = useState<string>(() => toDateTimeLocal(Date.now() - 14 * 24 * 60 * 60 * 1000));
  const [customEndDraft, setCustomEndDraft] = useState<string>(() => toDateTimeLocal(Date.now()));
  const [customRangeApplied, setCustomRangeApplied] = useState<{ startMs: number; endMs: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSelection, setDragSelection] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [showProjection, setShowProjection] = useState(false);
  const [showCombo, setShowCombo] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showTrumpApproval, setShowTrumpApproval] = useState(false);
  const [showSp500, setShowSp500] = useState(false);
  const [showUnemployment, setShowUnemployment] = useState(false);
  const [compareTickerInput, setCompareTickerInput] = useState('');
  const [compareInputError, setCompareInputError] = useState<string | null>(null);
  const [customCompareMarkets, setCustomCompareMarkets] = useState<CustomCompareMarket[]>([]);
  const [revealProgress, setRevealProgress] = useState(1);
  const isMobile = useIsMobile();
  const chartRef = useRef<any>(null);

  const query = useQuery({
    queryKey: [
      'market-prices',
      marketId,
      timeframe,
      apiBaseUrl,
      seriesTicker,
      customRangeApplied?.startMs ?? null,
      customRangeApplied?.endMs ?? null,
    ],
    queryFn: () =>
      fetchMarketPrices(apiBaseUrl, marketId, timeframe, apiKey, seriesTicker, customRangeApplied ?? undefined),
    staleTime: 30_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
    retry: 1,
    enabled: Boolean(marketId && apiBaseUrl),
  });

  const projectionQuery = useQuery({
    queryKey: [
      'projection-prices',
      projectionMarketId,
      projectionEventTicker,
      timeframe,
      apiBaseUrl,
      projectionSeriesTicker,
      marketId,
      query.data?.candles?.length ?? 0,
    ],
    queryFn: async () => {
      if (projectionEventTicker) {
        const points = await fetchExpectedSeatsProjection(
          apiBaseUrl,
          projectionEventTicker,
          timeframe,
          apiKey,
          projectionSeriesTicker || seriesTicker,
          query.data?.candles?.map((c) => c.timestamp)
        );
        return { mode: 'seats' as const, points };
      }
      const single = await fetchMarketPrices(
        apiBaseUrl,
        projectionMarketId as string,
        timeframe,
        apiKey,
        projectionSeriesTicker || seriesTicker,
        customRangeApplied ?? undefined
      );
      return {
        mode: 'percent' as const,
        points: single.candles.map((c) => ({ timestamp: c.timestamp, value: c.close * 100 })),
      };
    },
    staleTime: 30_000,
    retry: 1,
    enabled: Boolean(
      showProjection &&
        apiBaseUrl &&
        ((projectionEventTicker && (projectionSeriesTicker || seriesTicker)) || projectionMarketId)
    ),
  });

  const comboQuery = useQuery({
    queryKey: ['combo-prices', comboMarketId, timeframe, apiBaseUrl, comboSeriesTicker, seriesTicker],
    queryFn: () =>
      fetchMarketPrices(
        apiBaseUrl,
        comboMarketId as string,
        timeframe,
        apiKey,
        comboSeriesTicker || seriesTicker,
        customRangeApplied ?? undefined
      ),
    staleTime: 30_000,
    retry: 1,
    enabled: Boolean(showCombo && comboMarketId && apiBaseUrl),
  });

  const controlsQuery = useQuery({
    queryKey: ['controls-prices', controlsMarketId, timeframe, apiBaseUrl, controlsSeriesTicker, seriesTicker],
    queryFn: () =>
      fetchMarketPrices(
        apiBaseUrl,
        controlsMarketId as string,
        timeframe,
        apiKey,
        controlsSeriesTicker || seriesTicker,
        customRangeApplied ?? undefined
      ),
    staleTime: 30_000,
    retry: 1,
    enabled: Boolean(showControls && controlsMarketId && apiBaseUrl),
  });

  const trumpApprovalQuery = useQuery({
    queryKey: [
      'trump-approval',
      timeframe,
      trumpApprovalEndpoint,
      customRangeApplied?.startMs ?? null,
      customRangeApplied?.endMs ?? null,
    ],
    queryFn: () => fetchTrumpApprovalProjection(trumpApprovalEndpoint, timeframe, customRangeApplied ?? undefined),
    staleTime: 60_000,
    retry: 1,
    enabled: Boolean(showTrumpApproval && trumpApprovalEndpoint),
  });

  const sp500Query = useQuery({
    queryKey: ['fred-sp500', timeframe, fredEndpoint, customRangeApplied?.startMs ?? null, customRangeApplied?.endMs ?? null, !!fredApiKey],
    queryFn: () => fetchFredSeriesProjection(fredEndpoint, 'SP500', timeframe, customRangeApplied ?? undefined, fredApiKey),
    staleTime: 60_000,
    retry: 1,
    enabled: Boolean(showSp500 && fredEndpoint),
  });

  const unemploymentQuery = useQuery({
    queryKey: ['fred-unrate', timeframe, fredEndpoint, customRangeApplied?.startMs ?? null, customRangeApplied?.endMs ?? null, !!fredApiKey],
    queryFn: () => fetchFredSeriesProjection(fredEndpoint, 'UNRATE', timeframe, customRangeApplied ?? undefined, fredApiKey),
    staleTime: 60_000,
    retry: 1,
    enabled: Boolean(showUnemployment && fredEndpoint),
  });

  const customCompareQueries = useQueries({
    queries: customCompareMarkets.map((overlay) => ({
      queryKey: [
        'custom-compare',
        overlay.ticker,
        timeframe,
        apiBaseUrl,
        overlay.seriesTicker,
        customRangeApplied?.startMs ?? null,
        customRangeApplied?.endMs ?? null,
      ],
      queryFn: () =>
        fetchMarketPrices(
          apiBaseUrl,
          overlay.ticker,
          timeframe,
          apiKey,
          overlay.seriesTicker,
          customRangeApplied ?? undefined
        ),
      staleTime: 30_000,
      retry: 1,
      enabled: Boolean(apiBaseUrl && overlay.enabled),
    })),
  });

  const headlinesQuery = useQuery({
    queryKey: ['political-headlines'],
    queryFn: () => fetchPoliticalHeadlines(4),
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });

  const candles = query.data?.candles ?? [];
  const projectionPointsRaw = projectionQuery.data?.points ?? [];
  const projectionMode = projectionQuery.data?.mode ?? null;
  const comboPointsRaw = comboQuery.data?.candles?.map((c) => ({ timestamp: c.timestamp, value: c.close * 100 })) ?? [];
  const controlsPointsRaw =
    controlsQuery.data?.candles?.map((c) => ({ timestamp: c.timestamp, value: c.close * 100 })) ?? [];
  const trumpApprovalPointsRaw = trumpApprovalQuery.data ?? [];
  const sp500PointsRaw = sp500Query.data ?? [];
  const unemploymentPointsRaw = unemploymentQuery.data ?? [];
  const timestamps = useMemo(() => candles.map((c) => c.timestamp), [candles]);
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const liveVolume = latestCandle?.updates ?? 0;
  const liveProbability = latestCandle ? latestCandle.close * 100 : null;
  const liveProbabilityClamped =
    liveProbability == null ? null : Math.max(0, Math.min(100, liveProbability));
  const headlines = headlinesQuery.data ?? [];
  const hasData = candles.length > 0;
  const showVolumeBars = Boolean(showVolume && !isMobile);
  const marketRange = useMemo(() => {
    if (candles.length === 0) return null;
    return { startMs: candles[0].timestamp, endMs: candles[candles.length - 1].timestamp };
  }, [candles]);
  const projectionPoints = useMemo(() => clipPointsToRange(projectionPointsRaw, marketRange), [projectionPointsRaw, marketRange]);
  const comboPoints = useMemo(() => clipPointsToRange(comboPointsRaw, marketRange), [comboPointsRaw, marketRange]);
  const controlsPoints = useMemo(() => clipPointsToRange(controlsPointsRaw, marketRange), [controlsPointsRaw, marketRange]);
  const trumpApprovalPoints = useMemo(() => clipPointsToRange(trumpApprovalPointsRaw, marketRange), [trumpApprovalPointsRaw, marketRange]);
  const sp500Points = useMemo(() => clipPointsToRange(sp500PointsRaw, marketRange), [sp500PointsRaw, marketRange]);
  const unemploymentPoints = useMemo(
    () => clipPointsToRange(unemploymentPointsRaw, marketRange),
    [unemploymentPointsRaw, marketRange]
  );
  const customCompareOverlays = useMemo(
    () =>
      customCompareMarkets.map((overlay, idx) => {
        const q = customCompareQueries[idx];
        const rawPoints =
          q?.data?.candles?.map((c) => ({ timestamp: c.timestamp, value: c.close * 100 })) ?? [];
        return {
          ...overlay,
          points: clipPointsToRange(rawPoints, marketRange),
          isLoading: Boolean(q?.isLoading),
          isError: Boolean(q?.isError),
        };
      }),
    [customCompareMarkets, customCompareQueries, marketRange]
  );
  const customOverlayColorMap = useMemo(
    () =>
      customCompareOverlays.reduce<Record<string, string>>((acc, overlay) => {
        acc[overlay.label] = overlay.colorTop;
        return acc;
      }, {}),
    [customCompareOverlays]
  );
  const tickerTapeText = useMemo(() => {
    const base = `LIVE VOLUME ${formatCompact(liveVolume)} | UPDATED ${
      latestCandle ? new Date(latestCandle.timestamp).toLocaleTimeString() : '--:--'
    } | News De Jure`;
    if (headlines.length > 0) {
      const headlineText = headlines
        .map((h) => {
          const date = h.pubDate ? new Date(h.pubDate) : null;
          const datePart = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : null;
          return datePart ? `${h.title} (${datePart})` : h.title;
        })
        .join('   •   ');
      return `${base}   •   ${headlineText}`;
    }
    if (headlinesQuery.isLoading) return `${base}   •   LOADING POLITICAL HEADLINES`;
    if (headlinesQuery.isError) return `${base}   •   HEADLINES TEMPORARILY UNAVAILABLE`;
    return base;
  }, [headlines, headlinesQuery.isError, headlinesQuery.isLoading, liveVolume, latestCandle]);

  const addCustomCompareMarket = () => {
    const ticker = compareTickerInput.trim().toUpperCase();
    if (!ticker) {
      setCompareInputError('Enter a Kalshi ticker (example: CONTROLS-2026-D).');
      return;
    }
    if (customCompareMarkets.some((m) => m.ticker === ticker)) {
      setCompareInputError('That market is already added.');
      return;
    }
    const derivedSeries = inferSeriesTicker(ticker);
    if (!derivedSeries) {
      setCompareInputError('Ticker format is invalid. Expected format like SERIES-... .');
      return;
    }
    const color = CUSTOM_OVERLAY_COLORS[customCompareMarkets.length % CUSTOM_OVERLAY_COLORS.length];
    setCustomCompareMarkets((prev) => [
      ...prev,
      {
        id: ticker,
        ticker,
        seriesTicker: derivedSeries,
        label: `${ticker} Market`,
        colorTop: color.top,
        colorBottom: color.bottom,
        enabled: true,
      },
    ]);
    setCompareInputError(null);
    setCompareTickerInput('');
  };

  useEffect(() => {
    setIsDragging(false);
    setDragSelection(null);
  }, [marketId, timeframe, candles.length]);

  useEffect(() => {
    if (timeframe !== 'CUSTOM') return;
    if (customRangeApplied) return;
    const now = Date.now();
    setCustomRangeApplied({ startMs: now - 14 * 24 * 60 * 60 * 1000, endMs: now });
  }, [timeframe, customRangeApplied]);

  useEffect(() => {
    if (candles.length < 2) {
      setRevealProgress(1);
      return;
    }
    let raf = 0;
    const started = performance.now();
    const duration = 1700;
    const minFrameMs = 1000 / 45;
    let lastCommitted = 0;
    setRevealProgress(0);

    const tick = (ts: number) => {
      const elapsed = ts - started;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      if (ts - lastCommitted >= minFrameMs || p >= 1) {
        setRevealProgress(eased);
        lastCommitted = ts;
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [marketId, timeframe, candles.length]);

  const getIndexFromClientX = (clientX: number): number | null => {
    const chart = chartRef.current;
    if (!chart || timestamps.length === 0) return null;

    const rect = chart.canvas.getBoundingClientRect();
    const area = chart.chartArea;
    const xScale = chart.scales?.x;
    if (!area || !xScale) return null;

    const xInCanvas = clientX - rect.left;
    const clampedX = Math.max(area.left, Math.min(area.right, xInCanvas));
    const ts = Number(xScale.getValueForPixel(clampedX));
    if (!Number.isFinite(ts)) return null;
    return nearestIndexByTimestamp(timestamps, ts);
  };

  const startDrag = (clientX: number) => {
    const index = getIndexFromClientX(clientX);
    if (index == null) return;
    setIsDragging(true);
    setDragSelection({ startIndex: index, endIndex: index });
  };

  const moveDrag = (clientX: number) => {
    if (!isDragging) return;
    const index = getIndexFromClientX(clientX);
    if (index == null) return;
    setDragSelection((prev) => (prev ? { ...prev, endIndex: index } : prev));
  };

  const endDrag = () => {
    setIsDragging(false);
    setDragSelection(null);
  };

  const selectionRange = useMemo(() => {
    if (!dragSelection) return null;
    const start = Math.min(dragSelection.startIndex, dragSelection.endIndex);
    const end = Math.max(dragSelection.startIndex, dragSelection.endIndex);
    if (start < 0 || end >= candles.length) return null;
    return { start, end };
  }, [dragSelection, candles.length]);

  const selectionSummary = useMemo(() => {
    if (!selectionRange) return null;
    const startCandle = candles[selectionRange.start];
    const endCandle = candles[selectionRange.end];
    if (!startCandle || !endCandle) return null;

    const startPrice = startCandle.close * 100;
    const endPrice = endCandle.close * 100;
    const deltaPoints = endPrice - startPrice;
    const relativeChange = startPrice === 0 ? null : (deltaPoints / startPrice) * 100;
    const volume = candles
      .slice(selectionRange.start, selectionRange.end + 1)
      .reduce((sum, c) => sum + (c.updates ?? 0), 0);

    return {
      startTs: startCandle.timestamp,
      endTs: endCandle.timestamp,
      startPrice,
      endPrice,
      deltaPoints,
      relativeChange,
      volume,
      candleCount: selectionRange.end - selectionRange.start + 1,
      durationMs: Math.max(0, endCandle.timestamp - startCandle.timestamp),
    };
  }, [selectionRange, candles]);

  const revealedEndIndex = useMemo(() => {
    if (candles.length <= 1) return candles.length - 1;
    if (revealProgress >= 0.995) return candles.length - 1;
    return Math.max(1, Math.floor(revealProgress * (candles.length - 1)));
  }, [candles.length, revealProgress]);
  const showIntroDraw = revealProgress < 0.995;

  const introHeadPoint = useMemo(() => {
    if (candles.length === 0) return null;
    if (!showIntroDraw) return null;
    const i = Math.max(0, Math.min(revealedEndIndex, candles.length - 1));
    const c = candles[i];
    return c ? { ts: c.timestamp, price: c.close * 100 } : null;
  }, [candles, revealedEndIndex, showIntroDraw]);

  const chartData = useMemo<ChartData<'bar' | 'line'>>(() => {
    const labels = candles.map((c) => c.timestamp);
    const pricePoints = candles.map((c) => c.close * 100);
    const animatedPricePoints = showIntroDraw
      ? pricePoints.map((p, i) => (i <= revealedEndIndex ? p : null))
      : pricePoints;
    const volumePoints = candles.map((c) => c.updates ?? 0);
    const highlightedPricePoints = pricePoints.map((_p, i) => {
      if (!isDragging || !selectionRange) return null;
      return i >= selectionRange.start && i <= selectionRange.end ? pricePoints[i] : null;
    });

    return {
      labels,
      datasets: [
        ...(showVolumeBars
          ? [
              {
                type: 'bar' as const,
                label: 'Volume',
                data: volumePoints,
                yAxisID: 'yVolume',
                backgroundColor: 'rgba(148, 163, 184, 0.35)',
                borderColor: 'rgba(148, 163, 184, 0.55)',
                borderWidth: 1,
                barPercentage: 0.85,
                categoryPercentage: 0.9,
                order: 1,
              },
            ]
          : []),
        {
          type: 'line' as const,
          label: 'Price',
          data: animatedPricePoints,
          yAxisID: 'yPrice',
          borderColor: (context: any) => {
            const area = context.chart?.chartArea;
            if (!area) return '#ffffff';
            const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(1, 'rgba(255,255,255,0.92)');
            return gradient;
          },
          backgroundColor: 'rgba(148, 163, 184, 0.12)',
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 10,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#ffffff',
          pointBorderWidth: 0,
          borderWidth: 2.6,
          order: 2,
        },
        {
          type: 'line' as const,
          label: 'Measured Range',
          data: highlightedPricePoints,
          yAxisID: 'yPrice',
          borderColor: (context: any) => {
            const area = context.chart?.chartArea;
            if (!area) return '#1e3a8a';
            const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            gradient.addColorStop(0, '#b91c1c');
            gradient.addColorStop(0.5, '#475569');
            gradient.addColorStop(1, '#1e3a8a');
            return gradient;
          },
          backgroundColor: 'rgba(14, 165, 233, 0.12)',
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 0,
          borderWidth: 3,
          order: 3,
          spanGaps: false,
        },
        ...(showProjection && projectionPoints.length > 0
          ? [
              {
                type: 'line' as const,
                label: `${projectionLabel} Glow`,
                data: projectionPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: projectionMode === 'seats' ? 'yProjection' : 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return 'rgba(245, 158, 11, 0.42)';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, 'rgba(251,191,36,0.45)');
                  g.addColorStop(1, 'rgba(217,119,6,0.45)');
                  return g;
                },
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                borderWidth: 8,
                order: 4,
              },
              {
                type: 'line' as const,
                label: projectionLabel,
                data: projectionPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: projectionMode === 'seats' ? 'yProjection' : 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return '#f59e0b';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, '#fbbf24');
                  g.addColorStop(1, '#d97706');
                  return g;
                },
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 8,
                borderWidth: 2.2,
                order: 4.1,
              },
            ]
          : []),
        ...(showCombo && comboPoints.length > 0
          ? [
              {
                type: 'line' as const,
                label: `${comboLabel} Glow`,
                data: comboPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return 'rgba(34, 197, 94, 0.42)';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, 'rgba(52,211,153,0.45)');
                  g.addColorStop(1, 'rgba(21,128,61,0.45)');
                  return g;
                },
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                borderWidth: 8,
                order: 5,
              },
              {
                type: 'line' as const,
                label: comboLabel,
                data: comboPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return '#22c55e';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, '#34d399');
                  g.addColorStop(1, '#15803d');
                  return g;
                },
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 8,
                borderWidth: 2.1,
                order: 5.1,
              },
            ]
          : []),
        ...(showControls && controlsPoints.length > 0
          ? [
              {
                type: 'line' as const,
                label: `${controlsLabel} Glow`,
                data: controlsPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return 'rgba(168, 85, 247, 0.42)';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, 'rgba(192,132,252,0.45)');
                  g.addColorStop(1, 'rgba(126,34,206,0.45)');
                  return g;
                },
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                borderWidth: 8,
                order: 6,
              },
              {
                type: 'line' as const,
                label: controlsLabel,
                data: controlsPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return '#a855f7';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, '#c084fc');
                  g.addColorStop(1, '#7e22ce');
                  return g;
                },
                backgroundColor: 'rgba(168, 85, 247, 0.2)',
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 8,
                borderWidth: 2.1,
                order: 6.1,
              },
            ]
          : []),
        ...(showTrumpApproval && trumpApprovalPoints.length > 0
          ? [
              {
                type: 'line' as const,
                label: `${trumpApprovalLabel} Glow`,
                data: trumpApprovalPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return 'rgba(244, 63, 94, 0.42)';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, 'rgba(251,113,133,0.45)');
                  g.addColorStop(1, 'rgba(190,24,93,0.45)');
                  return g;
                },
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                borderWidth: 8,
                order: 7,
              },
              {
                type: 'line' as const,
                label: trumpApprovalLabel,
                data: trumpApprovalPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yPrice',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return '#f43f5e';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, '#fb7185');
                  g.addColorStop(1, '#be185d');
                  return g;
                },
                backgroundColor: 'rgba(244, 63, 94, 0.2)',
                fill: false,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 8,
                borderWidth: 2.1,
                order: 7.1,
              },
            ]
          : []),
        ...(showSp500 && sp500Points.length > 0
          ? [
              {
                type: 'line' as const,
                label: `${sp500Label} Glow`,
                data: sp500Points.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'ySp500',
                borderColor: 'rgba(14, 165, 233, 0.38)',
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                borderWidth: 8,
                order: 8,
              },
              {
                type: 'line' as const,
                label: sp500Label,
                data: sp500Points.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'ySp500',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return '#0ea5e9';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, '#67e8f9');
                  g.addColorStop(1, '#0284c7');
                  return g;
                },
                backgroundColor: 'rgba(14, 165, 233, 0.2)',
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 8,
                borderWidth: 2.1,
                order: 8.1,
              },
            ]
          : []),
        ...(showUnemployment && unemploymentPoints.length > 0
          ? [
              {
                type: 'line' as const,
                label: `${unemploymentLabel} Glow`,
                data: unemploymentPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yUnemployment',
                borderColor: 'rgba(249, 115, 22, 0.36)',
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                borderWidth: 8,
                order: 9,
              },
              {
                type: 'line' as const,
                label: unemploymentLabel,
                data: unemploymentPoints.map((p) => ({ x: p.timestamp, y: p.value })),
                yAxisID: 'yUnemployment',
                borderColor: (context: any) => {
                  const area = context.chart?.chartArea;
                  if (!area) return '#f97316';
                  const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, '#fdba74');
                  g.addColorStop(1, '#ea580c');
                  return g;
                },
                backgroundColor: 'rgba(249, 115, 22, 0.2)',
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 8,
                borderWidth: 2.1,
                order: 9.1,
              },
            ]
          : []),
        ...customCompareOverlays.flatMap((overlay, index) => {
          if (!overlay.enabled || overlay.points.length === 0) return [];
          return [
            {
              type: 'line' as const,
              label: `${overlay.label} Glow`,
              data: overlay.points.map((p) => ({ x: p.timestamp, y: p.value })),
              yAxisID: 'yPrice',
              borderColor: (context: any) => {
                const area = context.chart?.chartArea;
                if (!area) return hexToRgba(overlay.colorTop, 0.24);
                const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                g.addColorStop(0, hexToRgba(overlay.colorTop, 0.24));
                g.addColorStop(1, hexToRgba(overlay.colorBottom, 0.24));
                return g;
              },
              fill: false,
              tension: 0.22,
              pointRadius: 0,
              pointHoverRadius: 0,
              pointHitRadius: 0,
              borderDash: [7, 5],
              borderWidth: 5,
              order: 10 + index,
            },
            {
              type: 'line' as const,
              label: overlay.label,
              data: overlay.points.map((p) => ({ x: p.timestamp, y: p.value })),
              yAxisID: 'yPrice',
              borderColor: (context: any) => {
                const area = context.chart?.chartArea;
                if (!area) return overlay.colorTop;
                const g = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                g.addColorStop(0, overlay.colorTop);
                g.addColorStop(1, overlay.colorBottom);
                return g;
              },
              backgroundColor: hexToRgba(overlay.colorTop, 0.2),
              fill: false,
              tension: 0.22,
              pointRadius: 0,
              pointHoverRadius: 3,
              pointHitRadius: 8,
              borderDash: [7, 5],
              borderWidth: 2.1,
              order: 10.1 + index,
            },
          ];
        }),
      ],
    };
  }, [
    candles,
    showVolumeBars,
    isDragging,
    selectionRange,
    revealedEndIndex,
    showIntroDraw,
    showProjection,
    projectionPoints,
    projectionMode,
    projectionLabel,
    showCombo,
    comboPoints,
    comboLabel,
    showControls,
    controlsPoints,
    controlsLabel,
    showTrumpApproval,
    trumpApprovalPoints,
    trumpApprovalLabel,
    showSp500,
    sp500Points,
    sp500Label,
    showUnemployment,
    unemploymentPoints,
    unemploymentLabel,
    customCompareOverlays,
  ]);

  const projectionBounds = useMemo(() => {
    if (!(showProjection && projectionMode === 'seats' && projectionPoints.length > 0)) return null;
    const values = projectionPoints.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, (max - min) * 0.12);
    return { min: Math.floor(min - pad), max: Math.ceil(max + pad) };
  }, [showProjection, projectionMode, projectionPoints]);

  const sp500Bounds = useMemo(() => {
    if (!(showSp500 && sp500Points.length > 0)) return null;
    const values = sp500Points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(20, (max - min) * 0.08);
    return { min: Math.floor(min - pad), max: Math.ceil(max + pad) };
  }, [showSp500, sp500Points]);

  const unemploymentBounds = useMemo(() => {
    if (!(showUnemployment && unemploymentPoints.length > 0)) return null;
    const values = unemploymentPoints.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.2, (max - min) * 0.18);
    return { min: Math.max(0, min - pad), max: max + pad };
  }, [showUnemployment, unemploymentPoints]);

  const chartOptions = useMemo<ChartOptions<'bar' | 'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0,
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: ({
        legend: { display: false },
        dragSelection: {
          enabled: Boolean(isDragging && selectionSummary),
          startTs: selectionSummary?.startTs,
          endTs: selectionSummary?.endTs,
        },
        lineGlow: {
          blur: revealProgress < 1 ? 8 : 16,
          alpha: revealProgress < 1 ? 0.55 : 0.8,
          colorsByLabel: {
            Price: '#ffffff',
            [projectionLabel]: '#f59e0b',
            [comboLabel]: '#22c55e',
            [controlsLabel]: '#a855f7',
            [trumpApprovalLabel]: '#f43f5e',
            [sp500Label]: '#0ea5e9',
            [unemploymentLabel]: '#f97316',
            ...customOverlayColorMap,
          },
        },
        lineHeadGlow: {
          enabled: Boolean(showIntroDraw && introHeadPoint),
          xTs: introHeadPoint?.ts,
          yVal: introHeadPoint?.price,
          radius: showIntroDraw ? 18 : 28,
        },
        tooltip: {
          filter: (item: any) => {
            const label = String(item?.dataset?.label || '');
            return label !== 'Measured Range' && !label.includes(' Glow');
          },
          enabled: false,
          external: (context: any) => {
            const { chart, tooltip } = context;
            const parent = chart.canvas.parentNode as HTMLElement;
            if (!parent) return;

            let el = parent.querySelector('.market-tooltip') as HTMLDivElement | null;
            if (!el) {
              el = document.createElement('div');
              el.className = 'market-tooltip';
              el.style.position = 'absolute';
              el.style.pointerEvents = 'none';
              el.style.transition = 'all 80ms ease';
              el.style.zIndex = '30';
              parent.appendChild(el);
            }

            if (!tooltip || tooltip.opacity === 0) {
              el.style.opacity = '0';
              return;
            }

            const title = (tooltip.title || []).join(' ');
            const rows: string[] = [];
            for (const dp of tooltip.dataPoints || []) {
              const label = dp.dataset.label || '';
              const value = Number(dp.parsed.y);
              if (label === 'Measured Range' || String(label).includes(' Glow')) continue;
              if (dp.dataset.yAxisID === 'yPrice') rows.push(`${label}: ${formatPercent(value)}`);
              else if (dp.dataset.yAxisID === 'yProjection') rows.push(`${label}: ${value.toFixed(1)} seats`);
              else if (dp.dataset.yAxisID === 'ySp500') rows.push(`${label}: ${Math.round(value).toLocaleString()}`);
              else if (dp.dataset.yAxisID === 'yUnemployment') rows.push(`${label}: ${value.toFixed(1)}%`);
              else rows.push(`${label}: ${formatCompact(value)}`);
            }

            let extra = '';
            if (isDragging && selectionSummary) {
              const change =
                selectionSummary.relativeChange != null
                  ? `${selectionSummary.relativeChange >= 0 ? '+' : ''}${selectionSummary.relativeChange.toFixed(2)}%`
                  : 'N/A';
              const changeColor = selectionSummary.relativeChange != null && selectionSummary.relativeChange >= 0
                ? '#22c55e'
                : '#ef4444';
              extra = [
                `<div style="margin-top:6px;border-top:1px solid rgba(148,163,184,.28);padding-top:6px;">`,
                `<div style="color:${changeColor};font-weight:700;">Price Change: ${change}</div>`,
                `<div style="color:#22c55e;font-weight:700;">Total Volume: ${formatCompact(selectionSummary.volume)}</div>`,
                `</div>`,
              ].join('');
            }

            const body = rows.map((r) => `<div style="color:#e2e8f0;">${r}</div>`).join('');
            const hoveredTsRaw = (tooltip.dataPoints || [])[0]?.parsed?.x;
            const hoveredTs = Number(hoveredTsRaw);
            const projectionPoint =
              showProjection && projectionMode === 'seats'
                ? nearestPointByTimestamp(
                    projectionPoints,
                    Number.isFinite(hoveredTs)
                      ? hoveredTs
                      : projectionPoints[projectionPoints.length - 1]?.timestamp ?? 0
                  )
                : null;
            const demSeats =
              projectionPoint && Number.isFinite(Number(projectionPoint.value))
                ? Number(projectionPoint.value)
                : null;
            const repSeats = demSeats != null ? Math.max(0, 435 - demSeats) : null;
            const seatsBlock =
              demSeats != null
                ? [
                    `<div style="margin-top:6px;border-top:1px solid rgba(148,163,184,.28);padding-top:6px;">`,
                    `<div style="display:flex;align-items:center;gap:6px;color:#93c5fd;font-weight:700;">`,
                    `<span style="width:9px;height:9px;border-radius:2px;background:#2563eb;display:inline-block;"></span>`,
                    `Expected Dem Seats: ${demSeats.toFixed(1)}`,
                    `</div>`,
                    `<div style="display:flex;align-items:center;gap:6px;color:#fca5a5;font-weight:700;margin-top:2px;">`,
                    `<span style="width:9px;height:9px;border-radius:2px;background:#dc2626;display:inline-block;"></span>`,
                    `Expected Republican Seats: ${repSeats?.toFixed(1)}`,
                    `</div>`,
                    `</div>`,
                  ].join('')
                : '';
            el.innerHTML = [
              `<div style="min-width:170px;background:rgba(15,23,42,.94);border:1px solid rgba(148,163,184,.28);`,
              `border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.35;box-shadow:0 8px 24px rgba(2,6,23,.35);">`,
              `<div style="color:#cbd5e1;font-weight:700;margin-bottom:6px;">${title}</div>`,
              body,
              seatsBlock,
              extra,
              `</div>`,
            ].join('');

            const left = tooltip.caretX + 12;
            const top = tooltip.caretY + 12;
            el.style.opacity = '1';
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
          },
          callbacks: {
            label: (context: TooltipItem<'bar' | 'line'>) => {
              const label = context.dataset.label || '';
              if (String(label).includes(' Glow') || label === 'Measured Range') return '';
              const value = Number(context.parsed.y);

              if (context.dataset.yAxisID === 'yPrice') {
                return `${label}: ${formatPercent(value)}`;
              }
              if (context.dataset.yAxisID === 'yProjection') {
                return `${label}: ${value.toFixed(1)} seats`;
              }
              if (context.dataset.yAxisID === 'ySp500') {
                return `${label}: ${Math.round(value).toLocaleString()}`;
              }
              if (context.dataset.yAxisID === 'yUnemployment') {
                return `${label}: ${value.toFixed(1)}%`;
              }

              return `${label}: ${formatCompact(value)}`;
            },
          },
        },
      } as any),
      scales: {
        x: {
          type: 'time',
          time: {
            tooltipFormat: 'PPpp',
          },
          border: {
            color: 'rgba(148, 163, 184, 0.3)',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.18)',
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            color: '#cbd5e1',
            font: {
              size: 11,
              weight: 600,
            },
          },
        },
        yPrice: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: 100,
          border: {
            color: 'rgba(148, 163, 184, 0.3)',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.18)',
          },
          ticks: {
            callback: (value) => `${value}%`,
            color: '#cbd5e1',
            font: {
              size: 11,
              weight: 600,
            },
          },
          title: {
            display: true,
            text: 'Price',
            color: '#e2e8f0',
            font: {
              size: 12,
              weight: 700,
            },
          },
        },
        yVolume: {
          type: 'linear',
          position: 'right',
          display: showVolumeBars,
          border: {
            color: 'rgba(148, 163, 184, 0.3)',
          },
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            callback: (value) => formatCompact(Number(value)),
            color: '#94a3b8',
            font: {
              size: 10,
              weight: 600,
            },
          },
          title: {
            display: showVolumeBars,
            text: 'Volume',
            color: '#94a3b8',
            font: {
              size: 11,
              weight: 700,
            },
          },
        },
        yProjection: {
          type: 'linear',
          position: 'right',
          display: Boolean(showProjection && projectionMode === 'seats'),
          min: projectionBounds?.min,
          max: projectionBounds?.max,
          border: {
            color: 'rgba(148, 163, 184, 0.3)',
          },
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            callback: (value) => `${value}`,
            color: '#fcd34d',
            font: {
              size: 10,
              weight: 700,
            },
          },
          title: {
            display: Boolean(showProjection && projectionMode === 'seats'),
            text: 'Projected Dem Seats',
            color: '#fcd34d',
            font: {
              size: 11,
              weight: 700,
            },
          },
        },
        ySp500: {
          type: 'linear',
          position: 'right',
          display: Boolean(showSp500),
          min: sp500Bounds?.min,
          max: sp500Bounds?.max,
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            callback: (value) => `${Math.round(Number(value)).toLocaleString()}`,
            color: '#67e8f9',
            font: { size: 10, weight: 700 },
          },
          title: {
            display: Boolean(showSp500),
            text: 'S&P 500',
            color: '#67e8f9',
            font: { size: 11, weight: 700 },
          },
        },
        yUnemployment: {
          type: 'linear',
          position: 'right',
          display: Boolean(showUnemployment),
          min: unemploymentBounds?.min,
          max: unemploymentBounds?.max,
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            callback: (value) => `${Number(value).toFixed(1)}%`,
            color: '#fdba74',
            font: { size: 10, weight: 700 },
          },
          title: {
            display: Boolean(showUnemployment),
            text: 'Unemployment',
            color: '#fdba74',
            font: { size: 11, weight: 700 },
          },
        },
      },
    }),
    [
      showVolumeBars,
      selectionSummary,
      isDragging,
      introHeadPoint,
      revealProgress,
      showProjection,
      projectionMode,
      projectionBounds,
      showSp500,
      sp500Bounds,
      showUnemployment,
      unemploymentBounds,
      customOverlayColorMap,
    ]
  );

  return (
    <div
      className="h-screen w-screen border border-slate-200 bg-white p-4 shadow-sm"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #1f2937',
        background:
          'radial-gradient(1200px 300px at 15% -50%, rgba(37,99,235,0.4), transparent), radial-gradient(1200px 300px at 85% -50%, rgba(239,68,68,0.4), transparent), linear-gradient(180deg, #0b1220 0%, #0f172a 100%)',
        padding: 14,
      }}
    >
      <style>{`
        @keyframes marketTickerSlide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="mb-3"
        style={{
          background: 'rgba(15,23,42,0.68)',
          border: '1px solid rgba(100,116,139,0.35)',
          borderRadius: 14,
          padding: '12px 14px',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div>
            <h3
              style={{
                margin: 0,
                color: '#f8fafc',
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: 0.2,
                textAlign: 'center',
                fontFamily: '"Times New Roman", Times, serif',
              }}
            >
              {marketTitle || 'Will Democrats Win the House of Representatives?'}
            </h3>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
              {marketId} · project by{' '}
              <a
                href="https://www.linkedin.com/in/tanner-lux-0ba791173/"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#7dd3fc', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                Tanner Lux
              </a>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                flex: 1,
                minWidth: 260,
                minHeight: 56,
                border: '1px solid rgba(71,85,105,0.65)',
                borderRadius: 10,
                background: 'rgba(2,6,23,0.75)',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  width: 'max-content',
                  minWidth: '100%',
                  animation: 'marketTickerSlide 16.8s linear infinite',
                  color: '#a5f3fc',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 0.35,
                  padding: '0',
                  lineHeight: 1.2,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                }}
              >
                <div style={{ flex: '0 0 auto', whiteSpace: 'nowrap', paddingLeft: 12, paddingRight: 48 }}>
                  {tickerTapeText}
                </div>
                <div style={{ flex: '0 0 auto', whiteSpace: 'nowrap', paddingLeft: 12, paddingRight: 48 }}>
                  {tickerTapeText}
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  boxShadow: 'inset 0 0 26px rgba(6,182,212,0.12)',
                  pointerEvents: 'none',
                }}
              />
            </div>
            <div
              style={{
                minWidth: 185,
                border: '1px solid rgba(56,189,248,0.55)',
                borderRadius: 10,
                background: 'linear-gradient(180deg, rgba(2,132,199,0.35), rgba(2,6,23,0.7))',
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                boxShadow: '0 0 18px rgba(56,189,248,0.2)',
              }}
            >
              <div style={{ color: '#bae6fd', fontSize: 11, fontWeight: 700, letterSpacing: 0.35 }}>
                CURRENT PROBABILITY
              </div>
              <div
                style={{
                  marginTop: 6,
                  background: 'linear-gradient(180deg, rgba(2,6,23,0.92), rgba(15,23,42,0.86))',
                  border: '1px solid rgba(56,189,248,0.45)',
                  borderRadius: 7,
                  padding: '7px 8px',
                  boxShadow: 'inset 0 0 14px rgba(14,165,233,0.2), 0 0 14px rgba(14,165,233,0.22)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    marginBottom: 6,
                    color: '#7dd3fc',
                    fontFamily: '"Lucida Console", "Courier New", monospace',
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    textShadow:
                      '0 0 6px rgba(125,211,252,0.95), 0 0 12px rgba(56,189,248,0.75), 0 0 18px rgba(14,165,233,0.45)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <span style={{ fontSize: 23 }}>
                    {liveProbability != null ? `${liveProbability.toFixed(1)}%` : '--'}
                  </span>
                </div>
                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    border: '1px solid rgba(125,211,252,0.45)',
                    background: 'rgba(15,23,42,0.95)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${liveProbabilityClamped ?? 0}%`,
                      height: '100%',
                      borderRadius: 999,
                      background:
                        'linear-gradient(90deg, rgba(14,165,233,0.95), rgba(56,189,248,1), rgba(125,211,252,0.95))',
                      boxShadow: '0 0 10px rgba(56,189,248,0.65), 0 0 18px rgba(56,189,248,0.35)',
                      transition: 'width 420ms ease',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mb-3"
        style={{
          background: 'rgba(15,23,42,0.55)',
          border: '1px solid rgba(71,85,105,0.45)',
          borderRadius: 10,
          padding: '8px 10px',
        }}
      >
        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.35 }}>
          DATA OVERLAYS
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'nowrap',
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(71,85,105,0.6)',
              borderRadius: 8,
              padding: '5px 8px',
            }}
          >
            <input
              type="text"
              value={compareTickerInput}
              onChange={(e) => {
                setCompareTickerInput(e.target.value);
                if (compareInputError) setCompareInputError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomCompareMarket();
                }
              }}
              placeholder="Add ticker (e.g. CONTROLS-2026-D)"
              style={{
                border: '1px solid rgba(71,85,105,0.8)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                color: '#e2e8f0',
                background: 'rgba(2,6,23,0.85)',
                minWidth: 220,
              }}
            />
            <button
              type="button"
              onClick={addCustomCompareMarket}
              style={{
                border: '1px solid rgba(56,189,248,0.8)',
                borderRadius: 7,
                padding: '4px 9px',
                fontSize: 12,
                fontWeight: 700,
                color: '#e0f2fe',
                background: 'linear-gradient(180deg,#0284c7,#0369a1)',
                cursor: 'pointer',
              }}
            >
              Add Market
            </button>
          </div>
          {compareInputError && (
            <span style={{ color: '#fca5a5', fontSize: 12, fontWeight: 600 }}>{compareInputError}</span>
          )}
          {customCompareOverlays.map((overlay) => (
            <label
              key={overlay.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#cbd5e1',
                userSelect: 'none',
                background: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(71,85,105,0.6)',
                borderRadius: 8,
                padding: '5px 8px',
              }}
            >
              <input
                type="checkbox"
                checked={overlay.enabled}
                onChange={(e) =>
                  setCustomCompareMarkets((prev) =>
                    prev.map((m) =>
                      m.id === overlay.id ? { ...m, enabled: e.target.checked } : m
                    )
                  )
                }
              />
              Overlay {overlay.label}
              {overlay.isLoading ? ' (loading...)' : ''}
              {overlay.isError ? ' (error)' : ''}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCustomCompareMarkets((prev) => prev.filter((m) => m.id !== overlay.id));
                }}
                style={{
                  border: '1px solid rgba(248,113,113,0.7)',
                  borderRadius: 6,
                  background: 'rgba(127,29,29,0.45)',
                  color: '#fecaca',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 6px',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </label>
          ))}
          {(projectionEventTicker || projectionMarketId) && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#cbd5e1',
                userSelect: 'none',
                background: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(71,85,105,0.6)',
                borderRadius: 8,
                padding: '5px 8px',
              }}
            >
              <input
                type="checkbox"
                checked={showProjection}
                onChange={(e) => setShowProjection(e.target.checked)}
              />
              Overlay {projectionLabel}
              {showProjection && projectionQuery.isLoading ? ' (loading...)' : ''}
              {showProjection && projectionQuery.isError ? ' (error)' : ''}
            </label>
          )}
          {comboMarketId && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#cbd5e1',
                userSelect: 'none',
                background: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(71,85,105,0.6)',
                borderRadius: 8,
                padding: '5px 8px',
              }}
            >
              <input
                type="checkbox"
                checked={showCombo}
                onChange={(e) => setShowCombo(e.target.checked)}
              />
              Overlay {comboLabel}
              {showCombo && comboQuery.isLoading ? ' (loading...)' : ''}
              {showCombo && comboQuery.isError ? ' (error)' : ''}
            </label>
          )}
          {controlsMarketId && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#cbd5e1',
                userSelect: 'none',
                background: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(71,85,105,0.6)',
                borderRadius: 8,
                padding: '5px 8px',
              }}
            >
              <input
                type="checkbox"
                checked={showControls}
                onChange={(e) => setShowControls(e.target.checked)}
              />
              Overlay {controlsLabel}
              {showControls && controlsQuery.isLoading ? ' (loading...)' : ''}
              {showControls && controlsQuery.isError ? ' (error)' : ''}
            </label>
          )}
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#cbd5e1',
              userSelect: 'none',
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(71,85,105,0.6)',
              borderRadius: 8,
              padding: '5px 8px',
            }}
          >
            <input
              type="checkbox"
              checked={showTrumpApproval}
              onChange={(e) => setShowTrumpApproval(e.target.checked)}
            />
            Overlay {trumpApprovalLabel}
            {showTrumpApproval && trumpApprovalQuery.isLoading ? ' (loading...)' : ''}
            {showTrumpApproval && trumpApprovalQuery.isError ? ' (error)' : ''}
          </label>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#cbd5e1',
              userSelect: 'none',
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(71,85,105,0.6)',
              borderRadius: 8,
              padding: '5px 8px',
            }}
          >
            <input
              type="checkbox"
              checked={showSp500}
              onChange={(e) => setShowSp500(e.target.checked)}
            />
            Overlay {sp500Label}
            {showSp500 && sp500Query.isLoading ? ' (loading...)' : ''}
            {showSp500 && sp500Query.isError ? ' (error)' : ''}
          </label>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#cbd5e1',
              userSelect: 'none',
              background: 'rgba(15,23,42,0.55)',
              border: '1px solid rgba(71,85,105,0.6)',
              borderRadius: 8,
              padding: '5px 8px',
            }}
          >
            <input
              type="checkbox"
              checked={showUnemployment}
              onChange={(e) => setShowUnemployment(e.target.checked)}
            />
            Overlay {unemploymentLabel}
            {showUnemployment && unemploymentQuery.isLoading ? ' (loading...)' : ''}
            {showUnemployment && unemploymentQuery.isError ? ' (error)' : ''}
          </label>
        </div>
      </div>

      {query.isLoading ? (
        <div
          className="animate-pulse rounded-md bg-slate-100"
          style={{ flex: 1, minHeight: 360, borderRadius: 12, background: 'rgba(15,23,42,0.45)' }}
          aria-label="Loading chart"
        />
      ) : query.isError ? (
        <div
          className="overflow-auto rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          style={{
            flex: 1,
            minHeight: 360,
            overflow: 'auto',
            borderRadius: 12,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            padding: 16,
            color: '#b91c1c',
          }}
        >
          <p className="mb-2 font-medium">Could not load chart data.</p>
          <p className="whitespace-pre-wrap break-words">
            {(query.error as Error)?.message || 'Something went wrong while loading chart data.'}
          </p>
        </div>
      ) : !hasData ? (
        <div
          className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"
          style={{
            flex: 1,
            minHeight: 360,
            borderRadius: 12,
            border: '1px solid rgba(71,85,105,0.6)',
            background: 'rgba(15,23,42,0.45)',
            padding: 16,
            color: '#cbd5e1',
          }}
        >
          No market price data available for this timeframe.
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 360,
            cursor: isDragging ? 'grabbing' : 'crosshair',
            userSelect: 'none',
            position: 'relative',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.56), rgba(2,6,23,0.6))',
            border: '1px solid rgba(100,116,139,0.35)',
            borderRadius: 14,
            padding: 10,
            backdropFilter: 'blur(6px)',
          }}
          onMouseDown={(e) => startDrag(e.clientX)}
          onMouseMove={(e) => moveDrag(e.clientX)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={(e) => startDrag(e.touches[0].clientX)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX)}
          onTouchEnd={endDrag}
          onDoubleClick={() => setDragSelection(null)}
        >
          <ReactChart ref={chartRef} type="bar" data={chartData} options={chartOptions} />
        </div>
      )}

      <div
        className="mt-3"
        style={{
          background: 'rgba(15,23,42,0.55)',
          border: '1px solid rgba(71,85,105,0.45)',
          borderRadius: 10,
          padding: '8px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div
            className="inline-flex rounded-md border border-slate-200 p-1"
            style={{
              width: 'fit-content',
              background: 'rgba(2,6,23,0.65)',
              border: '1px solid rgba(71,85,105,0.6)',
              borderRadius: 12,
              padding: 4,
            }}
          >
            {(Object.keys(TIMEFRAME_CONFIG) as Timeframe[]).map((tf) => {
              const active = tf === timeframe;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  style={{
                    borderRadius: 9,
                    padding: '6px 11px',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    border: active ? '1px solid rgba(14,165,233,0.65)' : '1px solid transparent',
                    background: active ? 'linear-gradient(180deg,#38bdf8,#0284c7)' : 'transparent',
                    color: active ? '#fff' : '#cbd5e1',
                    cursor: 'pointer',
                    transition: 'all 160ms ease',
                  }}
                >
                  {tf}
                </button>
              );
            })}
          </div>
          <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.35 }}>TIME HORIZON</span>
        </div>
        {timeframe === 'CUSTOM' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <input
              type="datetime-local"
              value={customStartDraft}
              onChange={(e) => setCustomStartDraft(e.target.value)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '4px 6px',
                fontSize: 12,
                color: '#e2e8f0',
                background: 'rgba(15,23,42,0.7)',
              }}
            />
            <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
            <input
              type="datetime-local"
              value={customEndDraft}
              onChange={(e) => setCustomEndDraft(e.target.value)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '4px 6px',
                fontSize: 12,
                color: '#e2e8f0',
                background: 'rgba(15,23,42,0.7)',
              }}
            />
            <button
              type="button"
              onClick={() => {
                const start = new Date(customStartDraft).getTime();
                const end = new Date(customEndDraft).getTime();
                if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return;
                setCustomRangeApplied({ startMs: start, endMs: end });
              }}
              style={{
                border: '1px solid rgba(14,165,233,0.75)',
                borderRadius: 8,
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: '#e0f2fe',
                background: 'linear-gradient(180deg,#0284c7,#0369a1)',
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KalshiMarketPriceChart(props: KalshiMarketPriceChartProps) {
  const clientRef = useRef<QueryClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new QueryClient();
  }

  return (
    <QueryClientProvider client={clientRef.current}>
      <ChartErrorBoundary>
        <ChartContent {...props} />
      </ChartErrorBoundary>
    </QueryClientProvider>
  );
}




