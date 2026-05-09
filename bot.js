// ═══════════════════════════════════════════════════
//  DTC BTC SNIPER — MAIN BOT ENGINE
// ═══════════════════════════════════════════════════

const Bot = {
  // ── STATE ──────────────────────────────────────
  running:         false,
  config: {
    capital:       10,
    riskPct:       1,
    leverage:      5,
    minScore:      6,
    maxLosses:     5,
    atrMult:       1.5,
    rrRatio:       2.5,
    mode:          'normal',
    sound:         true,
  },
  state: {
    balance:         10,
    totalPnl:        0,
    trades:          [],
    activeTrade:     null,
    consLosses:      0,
    totalWins:       0,
    totalLosses:     0,
    systemOff:       false,
    lastResult:      null,
    learningLog:     [],
    aiMemory:        { winPatterns: [], lossPatterns: [], scoreHistory: [] },
  },
  countdownTimer: null,
  scanTimer:      null,

  // ── INIT ────────────────────────────────────────
  init() {
    this.loadState();
    this.startCountdown();
    if (!this.state.systemOff) {
      this.running = true;
      this.scan();
    }
    this.addLog('System initialized. DTC BTC Sniper v2.0 ready.', 'info');
    UI.renderAll(this.state, this.config);
  },

  // ── FETCH CANDLES ───────────────────────────────
  async fetchCandles(interval, limit = 300) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
    const r   = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return d.map(c => ({
      time:   c[0],
      open:   +c[1],
      high:   +c[2],
      low:    +c[3],
      close:  +c[4],
      volume: +c[5],
    }));
  },

  // ── MAIN SCAN ───────────────────────────────────
  async scan() {
    if (!this.running || this.state.systemOff) return;
    UI.setScanStatus('scanning');

    try {
      const [df, df1h, df4h] = await Promise.all([
        this.fetchCandles('5m',  300),
        this.fetchCandles('1h',  300),
        this.fetchCandles('4h',  300),
      ]);

      const result = Indicators.analyze(df, df1h, df4h, this.config);
      if (!result) { UI.setScanStatus('error'); return; }

      this.state.lastResult = result;
      UI.updateIndicators(result);
      UI.updateScores(result);

      // Monitor active trade first
      if (this.state.activeTrade) {
        this.monitorTrade(result.price);
      }

      // Look for new signal only when no active trade
      if (!this.state.activeTrade) {
        if (result.signal !== 'NONE') {
          this.openTrade(result);
        } else {
          UI.showNoSignal(result);
        }
      }

      UI.setScanStatus('live');
      this.saveState();

    } catch (e) {
      console.error('Scan error:', e);
      UI.setScanStatus('error');
      this.addLog(`❌ Fetch error: ${e.message}`, 'loss');
    }
  },

  // ── OPEN TRADE ──────────────────────────────────
  openTrade(result) {
    const sig    = result.signal;
    const entry  = result.price;
    const sl     = sig === 'BUY' ? result.buy_sl  : result.sell_sl;
    const tp1    = sig === 'BUY' ? result.buy_tp1 : result.sell_tp1;
    const tp2    = sig === 'BUY' ? result.buy_tp2 : result.sell_tp2;
    const be     = sig === 'BUY' ? result.buy_be  : result.sell_be;
    const score  = sig === 'BUY' ? result.bull_score : result.bear_score;
    const riskAmt = this.state.balance * (this.config.riskPct / 100);
    const slDist  = Math.abs(entry - sl);
    const qty     = slDist > 0 ? +(riskAmt / slDist).toFixed(6) : 0.0001;

    this.state.activeTrade = {
      id:        this.state.trades.length + 1,
      signal:    sig,
      entry,
      sl,
      tp1,
      tp2,
      be,
      qty,
      score,
      confidence: result.confidence,
      quality:    result.quality,
      openTime:   new Date().toLocaleTimeString('en-IN'),
      openDate:   new Date().toLocaleDateString('en-IN'),
      tp1Hit:     false,
      beSet:      false,
    };

    const icon = sig === 'BUY' ? '🟢' : '🔴';
    this.addLog(`${icon} ${sig} SIGNAL @ $${entry.toLocaleString()} | SL:$${Math.round(sl).toLocaleString()} TP:$${Math.round(tp2).toLocaleString()} | Score:${score}/8 | Conf:${result.confidence}%`, sig === 'BUY' ? 'win' : 'loss');

    // Notification
    Notif.send(
      `${icon} ${sig} SIGNAL — BTC`,
      `Entry: $${entry.toLocaleString(undefined,{maximumFractionDigits:0})}\nSL: $${Math.round(sl).toLocaleString()} | TP: $${Math.round(tp2).toLocaleString()}\nScore: ${score}/8 | Confidence: ${result.confidence}%`
    );

    UI.showSignal(this.state.activeTrade, result);
    UI.showActiveTrade(this.state.activeTrade);
    UI.showToast(`${icon} ${sig} SIGNAL DETECTED!`);

    if (this.config.sound) this.playAlert(sig);
  },

  // ── MONITOR ACTIVE TRADE ────────────────────────
  monitorTrade(currentPrice) {
    const t   = this.state.activeTrade;
    if (!t) return;

    // Move to breakeven at TP1 distance
    if (!t.beSet && !t.tp1Hit) {
      const beTriggered = t.signal === 'BUY'
        ? currentPrice >= t.be
        : currentPrice <= t.be;
      if (beTriggered) {
        t.sl    = t.entry;  // move SL to breakeven
        t.beSet = true;
        this.addLog(`🔒 Breakeven set @ $${t.entry.toLocaleString()} for Trade #${t.id}`, 'warn');
        Notif.send('🔒 Breakeven Set', `Trade #${t.id} SL moved to breakeven @ $${t.entry.toLocaleString(undefined,{maximumFractionDigits:0})}`);
      }
    }

    // TP1 partial (informational in paper mode)
    if (!t.tp1Hit) {
      const tp1Hit = t.signal === 'BUY' ? currentPrice >= t.tp1 : currentPrice <= t.tp1;
      if (tp1Hit) {
        t.tp1Hit = true;
        this.addLog(`🎯 TP1 HIT @ $${Math.round(currentPrice).toLocaleString()} for Trade #${t.id} — trailing remaining`, 'win');
        Notif.send('🎯 TP1 HIT!', `Trade #${t.id} reached first target. Trailing to TP2.`);
      }
    }

    // SL check
    const slHit = t.signal === 'BUY'
      ? currentPrice <= t.sl
      : currentPrice >= t.sl;

    // TP2 check
    const tp2Hit = t.signal === 'BUY'
      ? currentPrice >= t.tp2
      : currentPrice <= t.tp2;

    if (slHit)  this.closeTrade(t.sl,  'SL HIT');
    else if (tp2Hit) this.closeTrade(t.tp2, 'TP HIT');
    else UI.updateLivePnl(t, currentPrice);
  },

  // ── CLOSE TRADE ─────────────────────────────────
  closeTrade(exitPrice, reason) {
    const t = this.state.activeTrade;
    if (!t) return;

    const pnl = t.signal === 'BUY'
      ? (exitPrice - t.entry) * t.qty
      : (t.entry - exitPrice) * t.qty;

    const result = pnl > 0 ? 'WIN' : 'LOSS';

    const closed = {
      ...t,
      exitPrice,
      reason,
      pnl:       +pnl.toFixed(4),
      result,
      closeTime: new Date().toLocaleTimeString('en-IN'),
    };

    this.state.trades.unshift(closed);
    this.state.activeTrade = null;
    this.state.totalPnl   += pnl;
    this.state.balance    += pnl;

    if (result === 'WIN') {
      this.state.totalWins++;
      this.state.consLosses = 0;
      this.addLog(`✅ WIN — ${t.signal} closed @ $${Math.round(exitPrice).toLocaleString()} | PnL: +$${pnl.toFixed(2)}`, 'win');
      Notif.send('✅ TRADE WIN!', `${t.signal} closed @ $${Math.round(exitPrice).toLocaleString()}\nProfit: +$${pnl.toFixed(2)}`);
      this.aiLearn(closed, 'WIN');
    } else {
      this.state.totalLosses++;
      this.state.consLosses++;
      this.addLog(`❌ LOSS — ${t.signal} closed @ $${Math.round(exitPrice).toLocaleString()} | PnL: -$${Math.abs(pnl).toFixed(2)}`, 'loss');
      Notif.send('❌ TRADE LOSS', `${t.signal} SL hit @ $${Math.round(exitPrice).toLocaleString()}\nLoss: -$${Math.abs(pnl).toFixed(2)}`);
      this.aiLearn(closed, 'LOSS');

      // Circuit breaker
      if (this.state.consLosses >= this.config.maxLosses) {
        this.triggerCircuitBreaker();
      }
    }

    UI.renderAll(this.state, this.config);
    UI.renderJournal(this.state);
    UI.clearActiveTrade();
    this.saveState();
  },

  // ── MANUAL EXIT ─────────────────────────────────
  manualExit() {
    if (!this.state.activeTrade || !this.state.lastResult) return;
    this.closeTrade(this.state.lastResult.price, 'MANUAL EXIT');
    this.addLog(`⛔ Manual exit by user`, 'warn');
  },

  // ── CIRCUIT BREAKER ─────────────────────────────
  triggerCircuitBreaker() {
    this.state.systemOff = true;
    this.running = false;
    this.addLog(`🚨 CIRCUIT BREAKER: ${this.config.maxLosses} consecutive losses. System OFF.`, 'loss');
    Notif.send('🚨 SYSTEM HALTED', `${this.config.maxLosses} consecutive losses.\nTrading stopped to protect capital.`);
    UI.showCircuitBreaker(this.state.consLosses);
    this.saveState();
  },

  resetCircuit() {
    this.state.systemOff  = false;
    this.state.consLosses = 0;
    this.running = true;
    document.getElementById('cbOverlay').classList.add('hidden');
    this.addLog('✅ Circuit breaker reset. System restarted.', 'win');
    UI.updateCBLights(0, this.config.maxLosses);
    this.saveState();
    this.scan();
  },

  // ── AI LEARNING ─────────────────────────────────
  aiLearn(trade, result) {
    const mem   = this.state.aiMemory;
    const entry = { score: trade.score, confidence: trade.confidence, result, signal: trade.signal };

    if (result === 'WIN') {
      mem.winPatterns.push(entry);
      mem.winPatterns = mem.winPatterns.slice(-20);
    } else {
      mem.lossPatterns.push(entry);
      mem.lossPatterns = mem.lossPatterns.slice(-20);
    }
    mem.scoreHistory.push({ score: trade.score, result });
    mem.scoreHistory = mem.scoreHistory.slice(-50);

    // Generate learning insight
    const allTrades = this.state.trades;
    const total     = allTrades.length;
    if (total >= 3) {
      const recent3   = allTrades.slice(0, 3);
      const recent3wr = recent3.filter(t => t.result === 'WIN').length / 3;
      if (recent3wr === 0) {
        this.addLog('🧠 AI: 3 recent losses detected. Analyzing entry quality...', 'learn');
        if (allTrades[0].score < 7) {
          this.addLog('🧠 AI: Low score trades losing. Recommend raising min score to 7.', 'learn');
        }
      }
      if (recent3wr === 1) {
        this.addLog('🧠 AI: 3 consecutive wins. Current conditions favorable.', 'learn');
      }
    }

    if (result === 'LOSS') {
      const avgLossScore = mem.lossPatterns.reduce((s, t) => s + t.score, 0) / (mem.lossPatterns.length || 1);
      this.addLog(`🧠 AI: Loss pattern avg score: ${avgLossScore.toFixed(1)}/8. ${avgLossScore < 6.5 ? 'Borderline entries losing.' : 'High-score setup failed — market condition issue.'}`, 'learn');
    }
  },

  // ── COUNTDOWN ───────────────────────────────────
  startCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      const ms   = 5 * 60 * 1000;
      const secs = Math.ceil((ms - (Date.now() % ms)) / 1000);
      UI.updateCountdown(secs);
      // Scan on candle close
      if (secs === 300 && this.running && !this.state.systemOff) {
        this.scan();
      }
    }, 1000);
  },

  // ── CONTROLS ────────────────────────────────────
  start() {
    if (this.state.systemOff) { UI.showToast('⚠️ Reset circuit breaker first'); return; }
    this.running = true;
    UI.setSystemStatus(true);
    this.addLog('▶ Bot started by user', 'info');
    this.scan();
  },

  stop() {
    this.running = false;
    UI.setSystemStatus(false);
    this.addLog('⏹ Bot stopped by user', 'warn');
  },

  reset() {
    if (!confirm('Reset all data? This cannot be undone.')) return;
    this.state = {
      balance: this.config.capital, totalPnl: 0, trades: [], activeTrade: null,
      consLosses: 0, totalWins: 0, totalLosses: 0, systemOff: false,
      lastResult: null, learningLog: [], aiMemory: { winPatterns: [], lossPatterns: [], scoreHistory: [] }
    };
    this.saveState();
    UI.renderAll(this.state, this.config);
    UI.renderJournal(this.state);
    UI.showToast('✅ Bot reset successfully');
    this.addLog('🔄 Bot reset. Starting fresh.', 'info');
  },

  applySettings() {
    this.config.capital   = +document.getElementById('setCapital').value   || 10;
    this.config.riskPct   = +document.getElementById('setRisk').value      || 1;
    this.config.leverage  = +document.getElementById('setLeverage').value  || 5;
    this.config.minScore  = +document.getElementById('setMinScore').value  || 6;
    this.config.maxLosses = +document.getElementById('setMaxLosses').value || 5;
    this.config.atrMult   = +document.getElementById('setAtrMult').value   || 1.5;
    this.config.rrRatio   = +document.getElementById('setRR').value        || 2.5;
    this.config.sound     = document.getElementById('soundToggle').checked;
    localStorage.setItem('dtc_config', JSON.stringify(this.config));
    UI.showToast('✅ Settings saved');
  },

  setMode(mode) {
    this.config.mode = mode;
    localStorage.setItem('dtc_config', JSON.stringify(this.config));
    ['safe','normal','aggressive'].forEach(m => document.getElementById(`mode${m.charAt(0).toUpperCase()+m.slice(1)}`)?.classList.remove('active'));
    const btn = { safe: 'modeSafe', normal: 'modeNormal', aggressive: 'modeAggr' }[mode];
    document.getElementById(btn)?.classList.add('active');
    this.addLog(`⚙️ AI mode changed to: ${mode.toUpperCase()}`, 'info');
  },

  // ── SOUND ────────────────────────────────────────
  playAlert(signal) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(signal === 'BUY' ? 880 : 440, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  },

  // ── LOG ──────────────────────────────────────────
  addLog(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    this.state.learningLog.unshift({ msg, type, ts });
    this.state.learningLog = this.state.learningLog.slice(0, 80);
    UI.addLogEntry({ msg, type, ts });
  },

  // ── PERSIST ──────────────────────────────────────
  saveState() {
    try {
      const s = { ...this.state };
      s.learningLog = s.learningLog.slice(0, 30);
      s.trades      = s.trades.slice(0, 50);
      localStorage.setItem('dtc_state', JSON.stringify(s));
    } catch(e) {}
  },

  loadState() {
    try {
      const sc = localStorage.getItem('dtc_config');
      const ss = localStorage.getItem('dtc_state');
      if (sc) {
        const c = JSON.parse(sc);
        Object.assign(this.config, c);
        document.getElementById('setCapital').value   = c.capital   || 10;
        document.getElementById('setRisk').value      = c.riskPct   || 1;
        document.getElementById('setLeverage').value  = c.leverage  || 5;
        document.getElementById('setMinScore').value  = c.minScore  || 6;
        document.getElementById('setMaxLosses').value = c.maxLosses || 5;
        document.getElementById('setAtrMult').value   = c.atrMult   || 1.5;
        document.getElementById('setRR').value        = c.rrRatio   || 2.5;
        document.getElementById('soundToggle').checked = c.sound !== false;
        if (c.mode) this.setMode(c.mode);
      }
      if (ss) {
        const s = JSON.parse(ss);
        Object.assign(this.state, s);
        if (this.state.systemOff) {
          setTimeout(() => UI.showCircuitBreaker(this.state.consLosses), 500);
        }
      }
    } catch(e) {}
  },

  exportJournal() {
    const rows = ['ID,Signal,Entry,Exit,SL,TP,PnL,Result,Reason,Score,Confidence,Date'];
    this.state.trades.forEach(t => {
      rows.push([t.id,t.signal,t.entry,t.exitPrice||'',t.sl,t.tp2||t.tp1||'',t.pnl||'',t.result||'',t.reason||'',t.score,t.confidence,t.openDate].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `DTC_Journal_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }
};

// ── Notification Helper ──────────────────────────
const Notif = {
  async request() {
    if (!('Notification' in window)) return 'unsupported';
    const p = await Notification.requestPermission();
    UI.updateNotifStatus(p);
    return p;
  },
  send(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'assets/icon.png',
        badge: 'assets/icon.png',
        tag: 'dtc-signal',
        renotify: true,
        requireInteraction: true,
      });
    }
  }
};
