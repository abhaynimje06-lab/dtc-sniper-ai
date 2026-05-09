// ═══════════════════════════════════════════════════
//  UI ENGINE
// ═══════════════════════════════════════════════════

const UI = {

  setScanStatus(s) {
    const el = document.getElementById('scanStatus');
    if (!el) return;
    if (s === 'scanning') { el.textContent = '⟳ Scanning...'; el.className = 'scan-status scanning'; }
    else if (s === 'live') { el.textContent = '✓ Live'; el.className = 'scan-status live'; const t = new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}); const ls = document.getElementById('lastScan'); if(ls) ls.textContent = `Last: ${t}`; }
    else { el.textContent = '✗ Error'; el.className = 'scan-status error'; }
  },

  updateCountdown(secs) {
    const mm = String(Math.floor(secs / 60)).padStart(2,'0');
    const ss = String(secs % 60).padStart(2,'0');
    const el = document.getElementById('countdown');
    if (el) { el.textContent = `${mm}:${ss}`; el.style.color = secs < 30 ? '#f59e0b' : '#10b981'; }
    const pf = document.getElementById('progressFill');
    if (pf) pf.style.width = `${((300 - secs) / 300) * 100}%`;
  },

  updateIndicators(r) {
    const set = (id, val, cls) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = val; if(cls) el.className = `ind-val ${cls}`; }
    };
    const setSub = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

    // Price
    const lp = document.getElementById('livePrice');
    if (lp) lp.textContent = `$${r.price.toLocaleString(undefined,{maximumFractionDigits:0})}`;

    // RSI
    const rsiCls = r.rsi > 70 ? 'red-text' : r.rsi < 30 ? 'green-text' : r.rsiStatus === 'BULLISH' ? 'green-text' : r.rsiStatus === 'BEARISH' ? 'red-text' : 'white';
    set('rsiVal', r.rsi.toFixed(1), rsiCls); setSub('rsiStatus', r.rsiStatus);

    // ADX
    const adxCls = r.adx > 25 ? 'green-text' : 'yellow-text';
    set('adxVal', r.adx.toFixed(1), adxCls); setSub('adxStatus', r.adxStatus);

    // MACD
    const macdCls = r.macdBull ? 'green-text' : r.macdBear ? 'red-text' : 'white';
    set('macdStatus', r.macdStatus, macdCls); setSub('macdDetail', r.macdBull ? '▲ Hist rising' : r.macdBear ? '▼ Hist falling' : 'Flat');

    // Volume
    const volCls = r.volHigh ? 'green-text' : r.volStatus === 'NORMAL' ? 'yellow-text' : 'red-text';
    set('volStatus', r.volStatus, volCls); setSub('volDetail', r.volHigh ? 'Institutional' : 'Retail level');

    // EMA
    const emaCls = r.emaStatus === 'BULLISH' ? 'green-text' : r.emaStatus === 'BEARISH' ? 'red-text' : 'white';
    set('emaStatus', r.emaStatus, emaCls); setSub('emaDetail', r.bull_trend ? '9>21>200' : r.bear_trend ? '9<21<200' : 'Mixed');

    // HTF
    const htfCls = r.htf_bull ? 'green-text' : r.htf_bear ? 'red-text' : 'white';
    set('htfStatus', r.htf_bull ? 'BULL' : r.htf_bear ? 'BEAR' : 'NEUTRAL', htfCls);
    setSub('htfDetail', r.htf_bull ? '1H+4H above EMA200' : r.htf_bear ? '1H+4H below EMA200' : 'Mixed HTF');

    // AI reasoning
    const ar = document.getElementById('aiReasoning');
    if (ar && r.reasoning) ar.textContent = r.reasoning;

    // CB lights
    this.updateCBLights(Bot.state.consLosses, Bot.config.maxLosses);
  },

  updateScores(r) {
    const bb = document.getElementById('bullBar');
    const br = document.getElementById('bearBar');
    const bs = document.getElementById('bullScoreNum');
    const be = document.getElementById('bearScoreNum');
    if (bb) bb.style.width = `${(r.bull_score / 8) * 100}%`;
    if (br) br.style.width = `${(r.bear_score / 8) * 100}%`;
    if (bs) bs.textContent = `${r.bull_score}/8`;
    if (be) be.textContent = `${r.bear_score}/8`;
  },

  updateCBLights(count, max) {
    for (let i = 0; i < 5; i++) {
      const dot = document.getElementById(`cb${i}`);
      if (!dot) continue;
      dot.className = 'cb-dot ' + (i < count ? (count >= max ? 'red' : count >= max - 1 ? 'yellow' : 'yellow') : 'gray');
    }
    const lbl = document.getElementById('cbLabel');
    if (lbl) lbl.textContent = `${count}/${max} losses`;
    const warn = document.getElementById('cbWarning');
    const cnt  = document.getElementById('cbCount');
    if (warn && cnt) {
      cnt.textContent = count;
      warn.classList.toggle('hidden', count < max - 1);
    }
  },

  showSignal(trade, result) {
    const box = document.getElementById('signalBox');
    const icon = document.getElementById('signalIcon');
    const text = document.getElementById('signalText');
    const sub  = document.getElementById('signalSub');
    if (!box) return;

    if (trade.signal === 'BUY') {
      box.className = 'card signal-card buy-signal';
      icon.textContent = '🟢'; text.textContent = 'BUY SIGNAL'; text.className = 'signal-text green-signal-text';
      sub.textContent  = `Score: ${trade.score}/8 | Confidence: ${trade.confidence}%`;
    } else {
      box.className = 'card signal-card sell-signal';
      icon.textContent = '🔴'; text.textContent = 'SELL SIGNAL'; text.className = 'signal-text red-signal-text';
      sub.textContent  = `Score: ${trade.score}/8 | Confidence: ${trade.confidence}%`;
    }

    const fmt = n => n ? `$${n.toLocaleString(undefined,{maximumFractionDigits:0})}` : '—';
    const rr  = `1 : ${Bot.config.rrRatio}`;
    const pos = `${trade.qty} BTC (~$${(trade.qty * trade.entry).toFixed(2)})`;

    this.setLevel('entryPrice', fmt(trade.entry), 'white');
    this.setLevel('slPrice',    fmt(trade.sl),    'red-text');
    this.setLevel('tp1Price',   fmt(trade.signal==='BUY'?trade.tp1:trade.tp1), 'green-text');
    this.setLevel('tp2Price',   fmt(trade.signal==='BUY'?trade.tp2:trade.tp2), 'green-text');
    this.setLevel('rrVal',      rr,   'yellow-text');
    this.setLevel('posSize',    pos,  'white');
    this.setLevel('confVal',    `${trade.confidence}%`, 'yellow-text');
    this.setLevel('qualityVal', trade.quality, 'yellow-text');
  },

  showNoSignal(result) {
    const box  = document.getElementById('signalBox');
    const icon = document.getElementById('signalIcon');
    const text = document.getElementById('signalText');
    const sub  = document.getElementById('signalSub');
    if (!box) return;
    box.className  = 'card signal-card neutral-signal';
    icon.textContent = '⚪'; text.textContent = 'NO SIGNAL'; text.className = 'signal-text';
    sub.textContent  = `Bull: ${result.bull_score}/8 | Bear: ${result.bear_score}/8 | Need ${result.minScoreAdj}`;
    this.clearLevels();
  },

  setLevel(id, val, cls) {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; el.className = `level-val ${cls}`; }
  },

  clearLevels() {
    ['entryPrice','slPrice','tp1Price','tp2Price','rrVal','posSize','confVal','qualityVal'].forEach(id => {
      const el = document.getElementById(id); if(el) el.textContent = '—';
    });
  },

  showActiveTrade(trade) {
    const mon = document.getElementById('activeTradeMon');
    if (!mon) return;
    mon.classList.remove('hidden');
    const fmt = n => `$${n.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    const ms  = document.getElementById('monSignal');
    if (ms) { ms.textContent = trade.signal; ms.className = `level-val ${trade.signal==='BUY'?'green-text':'red-text'}`; }
    this.setLevel('monEntry',   fmt(trade.entry), 'white');
    this.setLevel('monSL',      fmt(trade.sl),    'red-text');
    this.setLevel('monTP',      fmt(trade.tp2),   'green-text');
  },

  updateLivePnl(trade, currentPrice) {
    const pnl = trade.signal === 'BUY'
      ? (currentPrice - trade.entry) * trade.qty
      : (trade.entry - currentPrice) * trade.qty;
    const el  = document.getElementById('livePnl');
    const box = document.getElementById('livePnlBox');
    const cur = document.getElementById('monCurrent');
    if (el) { el.textContent = `${pnl>=0?'+':'-'}$${Math.abs(pnl).toFixed(2)}`; el.style.color = pnl >= 0 ? '#10b981' : '#ef4444'; }
    if (box) box.style.background = pnl >= 0 ? '#052e16' : '#2a0a0a';
    if (cur) cur.textContent = `$${currentPrice.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  },

  clearActiveTrade() {
    const mon = document.getElementById('activeTradeMon');
    if (mon) mon.classList.add('hidden');
    const box  = document.getElementById('signalBox');
    const icon = document.getElementById('signalIcon');
    const text = document.getElementById('signalText');
    const sub  = document.getElementById('signalSub');
    if (box) { box.className = 'card signal-card neutral-signal'; icon.textContent='⚪'; text.textContent='SCANNING...'; sub.textContent='Waiting for next signal'; }
    this.clearLevels();
  },

  renderAll(state, config) {
    // Balance
    const b = document.getElementById('balance');
    if (b) b.textContent = `$${state.balance.toFixed(2)}`;

    // PnL
    const p = document.getElementById('totalPnl');
    if (p) { p.textContent = `${state.totalPnl>=0?'+':''}$${state.totalPnl.toFixed(2)}`; p.className = `pnl-value ${state.totalPnl>0?'positive':state.totalPnl<0?'negative':'neutral'}`; }

    // Stats
    const total = state.totalWins + state.totalLosses;
    const wr    = total ? ((state.totalWins / total) * 100).toFixed(1) : '0.0';
    const tt = document.getElementById('totalTrades'); if(tt) tt.textContent = total;
    const wrt = document.getElementById('winRate');    if(wrt) wrt.textContent = `${wr}%`;
    const tw = document.getElementById('totalWins');   if(tw) tw.textContent = state.totalWins;
    const tl = document.getElementById('totalLosses'); if(tl) tl.textContent = state.totalLosses;

    this.updateCBLights(state.consLosses, config.maxLosses);
  },

  renderJournal(state) {
    const hist = document.getElementById('tradeHistory');
    if (hist) {
      if (state.trades.length === 0) {
        hist.innerHTML = '<div class="no-trades">No trades yet. System scanning...</div>';
      } else {
        hist.innerHTML = state.trades.slice(0, 20).map(t => `
          <div class="trade-row">
            <div class="trade-left">
              <div class="trade-dir" style="color:${t.signal==='BUY'?'#10b981':'#ef4444'}">#${t.id} ${t.signal} ${t.result==='WIN'?'✅':'❌'}</div>
              <div class="trade-meta">${t.openDate||''} | Score:${t.score}/8 | Conf:${t.confidence}%</div>
            </div>
            <div class="trade-right">
              <div class="trade-pnl" style="color:${t.pnl>=0?'#10b981':'#ef4444'}">${t.pnl>=0?'+':''}$${t.pnl?.toFixed(2)}</div>
              <div class="trade-reason">${t.reason||''}</div>
            </div>
          </div>`).join('');
      }
    }

    // Perf stats
    const trades = state.trades;
    if (trades.length > 0) {
      const wins  = trades.filter(t => t.result === 'WIN');
      const losses = trades.filter(t => t.result === 'LOSS');
      const grossW = wins.reduce((s,t)  => s + (t.pnl||0), 0);
      const grossL = Math.abs(losses.reduce((s,t) => s + (t.pnl||0), 0));
      const pf     = grossL > 0 ? (grossW / grossL).toFixed(2) : wins.length > 0 ? '∞' : '—';
      const maxDD  = this.calcMaxDD(trades);

      const pfe = document.getElementById('profitFactor'); if(pfe) pfe.textContent = pf;
      const rre = document.getElementById('avgRR');        if(rre) rre.textContent = `1:${Bot.config.rrRatio}`;
      const dde = document.getElementById('maxDD');        if(dde) dde.textContent = `$${maxDD.toFixed(2)}`;
      const bte = document.getElementById('bestTrade');
      if (bte && wins.length) {
        const best = wins.reduce((a,b) => (a.pnl||0) > (b.pnl||0) ? a : b);
        bte.textContent = `+$${(best.pnl||0).toFixed(2)}`;
      }
    }

    // Learning log
    const ll = document.getElementById('learningLog');
    if (ll) {
      ll.innerHTML = state.learningLog.slice(0, 30).map(l => `
        <div class="log-item ${l.type}">[${l.ts}] ${l.msg}</div>`).join('');
    }
  },

  calcMaxDD(trades) {
    let peak = 0, dd = 0, running = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      running += trades[i].pnl || 0;
      if (running > peak) peak = running;
      const cur = peak - running;
      if (cur > dd) dd = cur;
    }
    return dd;
  },

  addLogEntry(log) {
    const ll = document.getElementById('learningLog');
    if (!ll) return;
    const div = document.createElement('div');
    div.className = `log-item ${log.type}`;
    div.textContent = `[${log.ts}] ${log.msg}`;
    ll.prepend(div);
    while (ll.children.length > 50) ll.removeChild(ll.lastChild);
  },

  showCircuitBreaker(count) {
    const ov = document.getElementById('cbOverlay');
    if (ov) ov.classList.remove('hidden');
    const lc = document.getElementById('cbLossCount');
    if (lc) lc.textContent = count;
    const sd = document.getElementById('systemStatus');
    if (sd) sd.className = 'status-dot red';
    const sl = document.getElementById('statusLabel');
    if (sl) { sl.textContent = 'OFF'; sl.style.color = '#ef4444'; }
  },

  setSystemStatus(on) {
    const sd = document.getElementById('systemStatus');
    if (sd) sd.className = 'status-dot ' + (on ? 'green' : 'red');
    const sl = document.getElementById('statusLabel');
    if (sl) { sl.textContent = on ? 'LIVE' : 'OFF'; sl.style.color = on ? '#10b981' : '#ef4444'; }
  },

  updateNotifStatus(status) {
    const el = document.getElementById('notifStatus');
    if (!el) return;
    if (status === 'granted') { el.textContent = '✅ Enabled'; el.style.color = '#10b981'; }
    else if (status === 'denied') { el.textContent = '❌ Denied'; el.style.color = '#ef4444'; }
    else { el.textContent = '⚠️ Not enabled'; el.style.color = '#f59e0b'; }
  },

  showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
  }
};

// ── GLOBAL FUNCTIONS ─────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  const tabs = document.querySelectorAll('.tab');
  const map  = { dashboard: 0, signal: 1, journal: 2, settings: 3 };
  if (tabs[map[tab]]) tabs[map[tab]].classList.add('active');
  if (tab === 'journal') UI.renderJournal(Bot.state);
}

function startBot()       { Bot.applySettings(); Bot.start(); UI.showToast('▶ Bot started'); }
function stopBot()        { Bot.stop(); UI.showToast('⏹ Bot stopped'); }
function resetBot()       { Bot.reset(); }
function resetCircuit()   { Bot.resetCircuit(); UI.showToast('✅ Circuit breaker reset'); }
function manualExit()     { Bot.manualExit(); }
function exportJournal()  { Bot.exportJournal(); }
function requestNotif()   { Notif.request(); }
function setMode(m)       { Bot.setMode(m); }
function installPWA()     {
  if (window._deferredInstall) window._deferredInstall.prompt();
  else UI.showToast('Open in Chrome → tap ⋮ → "Add to Home Screen"');
}

// ── PWA INSTALL PROMPT ───────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window._deferredInstall = e;
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.remove('hidden');
  const btn = document.getElementById('installBtn');
  if (btn) btn.onclick = () => { e.prompt(); banner.classList.add('hidden'); };
});

document.getElementById('dismissBanner')?.addEventListener('click', () => {
  document.getElementById('installBanner')?.classList.add('hidden');
});

// ── START ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  Bot.init();
  if (Notification.permission === 'granted') UI.updateNotifStatus('granted');
});
