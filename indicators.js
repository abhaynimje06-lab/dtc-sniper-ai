// ═══════════════════════════════════════════════════
//  TECHNICAL INDICATORS ENGINE
// ═══════════════════════════════════════════════════

const Indicators = {

  ema(arr, period) {
    const k = 2 / (period + 1);
    let e = arr[0];
    const out = [e];
    for (let i = 1; i < arr.length; i++) {
      e = arr[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  },

  sma(arr, period) {
    const out = new Array(arr.length).fill(null);
    for (let i = period - 1; i < arr.length; i++) {
      const slice = arr.slice(i - period + 1, i + 1);
      out[i] = slice.reduce((a, b) => a + (b || 0), 0) / period;
    }
    return out;
  },

  rsi(closes, period = 14) {
    if (closes.length < period + 1) return new Array(closes.length).fill(50);
    let gains = 0, lossesSum = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else lossesSum += Math.abs(d);
    }
    let ag = gains / period, al = lossesSum / period;
    const rsiArr = new Array(period + 1).fill(null);
    rsiArr[period] = 100 - 100 / (1 + (al === 0 ? 9999 : ag / al));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
      al = (al * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
      rsiArr.push(100 - 100 / (1 + (al === 0 ? 9999 : ag / al)));
    }
    return rsiArr;
  },

  atr(highs, lows, closes, period = 14) {
    const tr = [highs[0] - lows[0]];
    for (let i = 1; i < closes.length; i++) {
      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    const out = new Array(tr.length).fill(null);
    let a = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
    out[period - 1] = a;
    for (let i = period; i < tr.length; i++) {
      a = (a * (period - 1) + tr[i]) / period;
      out[i] = a;
    }
    return out;
  },

  adx(highs, lows, closes, period = 14) {
    const n = closes.length;
    if (n < period * 2) return { adx: new Array(n).fill(0), diP: new Array(n).fill(0), diM: new Array(n).fill(0) };
    const dmP = [], dmM = [], trArr = [];
    for (let i = 1; i < n; i++) {
      const up = highs[i] - highs[i - 1];
      const dn = lows[i - 1] - lows[i];
      dmP.push(up > dn && up > 0 ? up : 0);
      dmM.push(dn > up && dn > 0 ? dn : 0);
      trArr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    const smooth = (arr, p) => {
      let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
      const r = [s];
      for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; r.push(s); }
      return r;
    };
    const str = smooth(trArr, period);
    const sP  = smooth(dmP, period);
    const sM  = smooth(dmM, period);
    const diP = str.map((v, i) => v ? (sP[i] / v) * 100 : 0);
    const diM = str.map((v, i) => v ? (sM[i] / v) * 100 : 0);
    const dx  = diP.map((v, i) => {
      const s = v + diM[i];
      return s ? (Math.abs(v - diM[i]) / s) * 100 : 0;
    });
    let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const adxArr = new Array(period).fill(0);
    adxArr.push(adxVal);
    for (let i = period; i < dx.length; i++) {
      adxVal = (adxVal * (period - 1) + dx[i]) / period;
      adxArr.push(adxVal);
    }
    return {
      adx: [0, ...adxArr],
      diP: [0, ...diP],
      diM: [0, ...diM]
    };
  },

  macd(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.ema(closes, fast);
    const emaSlow = this.ema(closes, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = this.ema(macdLine, signal);
    const hist = macdLine.map((v, i) => v - signalLine[i]);
    return { macdLine, signalLine, hist };
  },

  // ─── FULL STRATEGY ANALYZER ─────────────────────
  analyze(candles, htf1h, htf4h, config) {
    const MIN_SCORE = config.minScore || 6;
    const ATR_MULT  = config.atrMult  || 1.5;
    const RR_RATIO  = config.rrRatio  || 2.5;
    const MODE      = config.mode     || 'normal';

    if (!candles || candles.length < 220) return null;

    const closes = candles.map(c => c.close);
    const opens  = candles.map(c => c.open);
    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);
    const vols   = candles.map(c => c.volume);
    const n      = closes.length;
    const i      = n - 1;

    // EMAs
    const ema9   = this.ema(closes, 9);
    const ema21  = this.ema(closes, 21);
    const ema50  = this.ema(closes, 50);
    const ema200 = this.ema(closes, 200);

    // HTF 1h
    let htf_bull = false, htf_bear = false;
    if (htf1h && htf1h.length >= 200 && htf4h && htf4h.length >= 200) {
      const h1ema = this.ema(htf1h.map(c => c.close), 200);
      const h4ema = this.ema(htf4h.map(c => c.close), 200);
      htf_bull = htf1h[htf1h.length-1].close > h1ema[h1ema.length-1] &&
                 htf4h[htf4h.length-1].close > h4ema[h4ema.length-1];
      htf_bear = htf1h[htf1h.length-1].close < h1ema[h1ema.length-1] &&
                 htf4h[htf4h.length-1].close < h4ema[h4ema.length-1];
    }

    // Trend
    const bull_trend = ema9[i] > ema21[i] && ema21[i] > ema200[i];
    const bear_trend = ema9[i] < ema21[i] && ema21[i] < ema200[i];
    let emaStatus = 'NEUTRAL';
    if (ema9[i] > ema21[i] && ema21[i] > ema50[i]) emaStatus = 'BULLISH';
    if (ema9[i] < ema21[i] && ema21[i] < ema50[i]) emaStatus = 'BEARISH';

    // RSI
    const rsiArr = this.rsi(closes, 14);
    const rsi_val = rsiArr[i] || 50;
    const bull_rsi = rsi_val > 55 && rsi_val < 75;
    const bear_rsi = rsi_val < 45 && rsi_val > 25;
    let rsiStatus = 'NEUTRAL';
    if (bull_rsi) rsiStatus = 'BULLISH';
    if (bear_rsi) rsiStatus = 'BEARISH';
    if (rsi_val >= 70) rsiStatus = 'OVERBOUGHT';
    if (rsi_val <= 30) rsiStatus = 'OVERSOLD';

    // ATR
    const atrArr  = this.atr(highs, lows, closes, 14);
    const atr_val = atrArr[i] || 100;
    const atrSMA  = this.sma(atrArr.map(v => v || 0), 20);
    const atr_ok  = atr_val > (atrSMA[i] || 0);

    // ADX
    const adxData    = this.adx(highs, lows, closes, 14);
    const adx_val    = adxData.adx[i] || 0;
    const trend_strong = adx_val > 20;
    let adxStatus = 'WEAK';
    if (adx_val > 25) adxStatus = 'STRONG';
    if (adx_val > 40) adxStatus = 'VERY STRONG';

    // Volume
    const volSMA  = this.sma(vols, 20);
    const volEMA  = this.ema(vols, 10);
    const vSMA    = volSMA[i] || 1;
    const high_vol = vols[i] > vSMA * 1.5;
    const vol_inc  = vols[i] > vols[i-1] && volEMA[i] > volEMA[i-1];
    const bull_vol = closes[i] > opens[i] && vols[i] > vSMA;
    const bear_vol = closes[i] < opens[i] && vols[i] > vSMA;
    const bull_vol_c = high_vol && vol_inc && bull_vol;
    const bear_vol_c = high_vol && vol_inc && bear_vol;
    const volStatus = high_vol ? 'HIGH' : vols[i] > vSMA ? 'NORMAL' : 'LOW';

    // MACD
    const macdData = this.macd(closes);
    const hist_val = macdData.hist[i];
    const bull_macd = hist_val > 0 && hist_val > macdData.hist[i-1];
    const bear_macd = hist_val < 0 && hist_val < macdData.hist[i-1];
    let macdStatus = 'NEUTRAL';
    if (bull_macd) macdStatus = 'BULLISH';
    if (bear_macd) macdStatus = 'BEARISH';

    // Market Structure
    const bull_struct = closes[i] > Math.max(...highs.slice(Math.max(0,i-6), i));
    const bear_struct = closes[i] < Math.min(...lows.slice(Math.max(0,i-6),  i));
    let structStatus = 'RANGE';
    if (bull_struct) structStatus = 'HH + HL (BULLISH)';
    if (bear_struct) structStatus = 'LH + LL (BEARISH)';

    // EMA Touch
    const touch_buy  = lows[i]  <= ema9[i] && closes[i] > ema9[i];
    const touch_sell = highs[i] >= ema9[i] && closes[i] < ema9[i];

    // Engulfing
    const bull_engulf = closes[i] > opens[i] && closes[i-1] < opens[i-1] && closes[i] > opens[i-1];
    const bear_engulf = closes[i] < opens[i] && closes[i-1] > opens[i-1] && closes[i] < opens[i-1];

    // FVG
    const bull_fvg = lows[i]  > highs[i-2];
    const bear_fvg = highs[i] < lows[i-2];

    // Strong candle
    const body  = Math.abs(closes[i] - opens[i]);
    const range = (highs[i] - lows[i]) || 0.001;
    const strong_bull = closes[i] > opens[i] && body > range * 0.6;
    const strong_bear = closes[i] < opens[i] && body > range * 0.6;

    // Liquidity Sweep
    const buy_liq  = lows[i]  < Math.min(...lows.slice(Math.max(0,i-5), i))  && closes[i] > lows[i-1];
    const sell_liq = highs[i] > Math.max(...highs.slice(Math.max(0,i-5), i)) && closes[i] < highs[i-1];

    // SMC: Order blocks (simplified)
    const bullOB = bull_fvg && touch_buy;
    const bearOB = bear_fvg && touch_sell;

    // Scores
    let bull_score = [bull_rsi, bull_vol_c, atr_ok, bull_struct, touch_buy, bull_fvg, bull_macd, buy_liq].filter(Boolean).length;
    let bear_score = [bear_rsi, bear_vol_c, atr_ok, bear_struct, touch_sell, bear_fvg, bear_macd, sell_liq].filter(Boolean).length;

    // Mode adjustment
    let minScoreAdj = MIN_SCORE;
    if (MODE === 'safe')       minScoreAdj = Math.min(8, MIN_SCORE + 1);
    if (MODE === 'aggressive') minScoreAdj = Math.max(1, MIN_SCORE - 1);

    // SL / TP
    const swing_low  = Math.min(...lows.slice(Math.max(0,i-4),  i+1));
    const swing_high = Math.max(...highs.slice(Math.max(0,i-4), i+1));
    const price = closes[i];

    const buy_sl  = swing_low  - atr_val * ATR_MULT;
    const buy_tp1 = price + (price - buy_sl)  * 1.5;    // Partial TP
    const buy_tp2 = price + (price - buy_sl)  * RR_RATIO; // Full TP
    const sell_sl = swing_high + atr_val * ATR_MULT;
    const sell_tp1 = price - (sell_sl - price) * 1.5;
    const sell_tp2 = price - (sell_sl - price) * RR_RATIO;

    // Breakeven
    const buy_be  = price + (price - buy_sl) * 1.0;
    const sell_be = price - (sell_sl - price) * 1.0;

    // Signals
    const raw_buy  = htf_bull && bull_trend && bull_engulf && strong_bull && trend_strong && bull_score >= minScoreAdj;
    const raw_sell = htf_bear && bear_trend && bear_engulf && strong_bear && trend_strong && bear_score >= minScoreAdj;

    // Confidence score
    let confidence = 0;
    if (raw_buy)  confidence = Math.round(50 + (bull_score / 8) * 35 + (adx_val > 25 ? 10 : 5) + (htf_bull ? 5 : 0));
    if (raw_sell) confidence = Math.round(50 + (bear_score / 8) * 35 + (adx_val > 25 ? 10 : 5) + (htf_bear ? 5 : 0));
    confidence = Math.min(95, confidence);

    // Trade quality
    let quality = 'C';
    if (confidence >= 80) quality = 'A+';
    else if (confidence >= 70) quality = 'A';
    else if (confidence >= 60) quality = 'B';

    // Reasoning
    const reasoning = buildReasoning({
      raw_buy, raw_sell, bull_score, bear_score,
      rsi_val, adx_val, htf_bull, htf_bear,
      emaStatus, macdStatus, volStatus, structStatus,
      bull_engulf, bear_engulf, strong_bull, strong_bear,
      bull_fvg, bear_fvg, buy_liq, sell_liq,
      trend_strong, MODE
    });

    return {
      signal: raw_buy ? 'BUY' : raw_sell ? 'SELL' : 'NONE',
      price, rsi: rsi_val, adx: adx_val, atr: atr_val,
      bull_score, bear_score, htf_bull, htf_bear,
      emaStatus, macdStatus, macdBull: bull_macd, macdBear: bear_macd,
      volStatus, volHigh: high_vol,
      structStatus, adxStatus, rsiStatus,
      buy_sl, buy_tp1, buy_tp2, buy_be,
      sell_sl, sell_tp1, sell_tp2, sell_be,
      confidence, quality, reasoning,
      trend_strong, minScoreAdj
    };
  }
};

function buildReasoning(d) {
  const lines = [];
  lines.push(`Mode: ${d.MODE || 'normal'} | Min Score: ${d.minScoreAdj || 6}/8`);
  lines.push(`HTF Bias: ${d.htf_bull ? '🟢 BULLISH (1H+4H above EMA200)' : d.htf_bear ? '🔴 BEARISH' : '⚪ NEUTRAL'}`);
  lines.push(`EMA Stack: ${d.emaStatus} | Trend Strength: ADX ${d.adx_val?.toFixed(1)} (${d.trend_strong ? 'STRONG ✓' : 'WEAK ✗'})`);
  lines.push(`RSI: ${d.rsi_val?.toFixed(1)} — ${d.rsi_val > 70 ? 'Overbought ⚠️' : d.rsi_val < 30 ? 'Oversold ⚠️' : d.rsi_val > 55 ? 'Bullish momentum' : d.rsi_val < 45 ? 'Bearish momentum' : 'Neutral'}`);
  lines.push(`MACD: ${d.macdStatus} | Volume: ${d.volStatus}`);
  lines.push(`Structure: ${d.structStatus}`);
  lines.push(`SMC: FVG=${d.bull_fvg||d.bear_fvg?'✓':'✗'} | Liquidity=${d.buy_liq||d.sell_liq?'✓ SWEEP DETECTED':'✗'}`);
  lines.push(`Engulfing: ${d.bull_engulf?'🟢 BULL':''}${d.bear_engulf?'🔴 BEAR':''}${!d.bull_engulf&&!d.bear_engulf?'None':''}`);
  lines.push(`Bull Score: ${d.bull_score}/8 | Bear Score: ${d.bear_score}/8`);
  if (d.raw_buy)  lines.push(`✅ ALL CONDITIONS MET → EXECUTE BUY`);
  else if (d.raw_sell) lines.push(`✅ ALL CONDITIONS MET → EXECUTE SELL`);
  else lines.push(`❌ Insufficient confluence — NO TRADE`);
  return lines.join('\n');
}
