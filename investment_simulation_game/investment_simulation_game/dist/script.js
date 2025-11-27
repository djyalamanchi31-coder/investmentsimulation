// ===== GAME CONFIG =====
const STARTING_CASH = 10000;
const GOAL_NET_WORTH = 12000;
const MAX_DAYS = 30;

const STOCKS = [
  { symbol: "TECH",   name: "TechNova Labs",      volatility: 0.05,  sector: "Technology" },
  { symbol: "GREEN",  name: "GreenLeaf Energy",   volatility: 0.035, sector: "Energy" },
  { symbol: "SHOP",   name: "ShopLink Online",    volatility: 0.04,  sector: "Consumer" },
  { symbol: "HEALTH", name: "BrightSide Health",  volatility: 0.03,  sector: "Healthcare" },
  { symbol: "AUTO",   name: "FutureDrive Motors", volatility: 0.06,  sector: "Automotive" }
];

// ===== STATE =====
let day = 1;
let cash = STARTING_CASH;
let prices = {};
let prevPrices = {};
let portfolio = {};        // symbol -> shares
let priceHistory = {};     // symbol -> [prices]
let realizedPL = 0;

let currentTrade = null;   // { type, symbol, price }

const lessons = [
  {
    title: "Diversification reduces risk",
    body:
      "Owning several different companies can protect you if one stock performs badly. " +
      "In this game, try not to let a single stock be more than about half of your total value.",
    trigger: "High concentration or low diversification"
  },
  {
    title: "Cash is also a position",
    body:
      "Holding some cash means you can take advantage of future opportunities and reduces risk. " +
      "But holding too much can keep you from reaching your goal.",
    trigger: "Cash% very high or very low"
  },
  {
    title: "Volatility moves prices faster",
    body:
      "High-volatility stocks can jump up or down quickly. Mix slower, steadier companies " +
      "with a few high-volatility ones to balance reward and risk.",
    trigger: "Owning mostly high-volatility stocks"
  },
  {
    title: "Realized vs. unrealized profit",
    body:
      "Profits only become realized when you sell. A big unrealized gain can disappear if " +
      "the price drops. Think about when to lock in profits vs. when to keep holding.",
    trigger: "You closed a position"
  },
  {
    title: "Have a simple plan",
    body:
      "Before you click buy, decide why you are buying and when you would sell. " +
      "For example: “If it rises 15% or falls 10%, I’ll review my decision.”",
    trigger: "General trading activity"
  },
  {
    title: "Emotions in the market",
    body:
      "Real investors sometimes chase what just went up or panic-sell after drops. " +
      "Practice staying calm and using your plan instead of fear or FOMO.",
    trigger: "Large swings in net worth"
  }
];

// ===== UTILITIES =====
function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function formatMoney(value) {
  return "$" + value.toFixed(2);
}

function calculateRandomPriceMove(basePrice, volatility) {
  const pctChange = randBetween(-volatility, volatility);
  const newPrice = Math.max(1, basePrice * (1 + pctChange));
  return { newPrice, pctChange };
}

function calcPortfolioValue() {
  let sum = 0;
  for (const stock of STOCKS) {
    const shares = portfolio[stock.symbol] || 0;
    sum += shares * prices[stock.symbol];
  }
  return sum;
}

function calcNetWorth() {
  return cash + calcPortfolioValue();
}

function calcConcentration() {
  const total = calcPortfolioValue();
  if (total === 0) return 0;
  let maxHolding = 0;
  for (const stock of STOCKS) {
    const value = (portfolio[stock.symbol] || 0) * prices[stock.symbol];
    if (value > maxHolding) maxHolding = value;
  }
  return maxHolding / total;
}

function calcCashPercent() {
  const net = calcNetWorth();
  if (net === 0) return 0;
  return cash / net;
}

function showToast(message, isDanger = false) {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMsg");
  msg.textContent = message;

  if (isDanger) {
    toast.classList.add("toast-danger");
  } else {
    toast.classList.remove("toast-danger");
  }

  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

// ===== RENDERING =====
function renderStocksTable() {
  const tbody = document.getElementById("stocks-body");
  tbody.innerHTML = "";

  STOCKS.forEach((stock) => {
    const tr = document.createElement("tr");

    const lastPrice = prevPrices[stock.symbol];
    const currentPrice = prices[stock.symbol];
    let changeText = "-";
    let changeClass = "";

    if (lastPrice != null) {
      const diff = currentPrice - lastPrice;
      const pct = (diff / lastPrice) * 100;
      changeText = `${diff >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      changeClass = diff >= 0 ? "change-pos" : "change-neg";
    }

    const ownedShares = portfolio[stock.symbol] || 0;

    tr.innerHTML = `
      <td>
        <div class="stock-symbol">${stock.symbol}</div>
        <div class="stock-name">${stock.name}</div>
      </td>
      <td>${formatMoney(currentPrice)}</td>
      <td class="${changeClass}">${changeText}</td>
      <td>
        <span class="pill buy">${(stock.volatility * 100).toFixed(1)}% / day</span>
      </td>
      <td>
        <span class="pill shares">${ownedShares} sh</span>
      </td>
    `;

    const tradeTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "actions";

    const buyBtn = document.createElement("button");
    buyBtn.className = "btn btn-outline btn-sm";
    buyBtn.textContent = "Buy";
    buyBtn.addEventListener("click", () => openTradeOverlay("buy", stock));

    const sellBtn = document.createElement("button");
    sellBtn.className = "btn btn-outline btn-sm";
    sellBtn.textContent = "Sell";
    sellBtn.disabled = ownedShares === 0;
    sellBtn.style.opacity = ownedShares === 0 ? 0.4 : 1;
    sellBtn.addEventListener("click", () => openTradeOverlay("sell", stock));

    actions.appendChild(buyBtn);
    actions.appendChild(sellBtn);
    tradeTd.appendChild(actions);
    tr.appendChild(tradeTd);

    tbody.appendChild(tr);
  });
}

function renderStats() {
  const net = calcNetWorth();
  const invested = calcPortfolioValue();
  const returnPct = ((net - STARTING_CASH) / STARTING_CASH) * 100;

  document.getElementById("statNetWorth").textContent = formatMoney(net);
  document.getElementById("statCash").textContent = formatMoney(cash);
  document.getElementById("statInvested").textContent = formatMoney(invested);
  document.getElementById("statRealized").textContent = formatMoney(realizedPL);

  const returnTag = document.getElementById("statReturnTag");
  returnTag.textContent = `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%`;
  returnTag.className = "stat-tag " + (returnPct >= 0 ? "positive" : "negative");

  const cashPct = calcCashPercent();
  const cashTag = document.getElementById("statCashTag");
  if (cashPct > 0.7) {
    cashTag.textContent = "Very high";
    cashTag.className = "stat-tag";
  } else if (cashPct < 0.1) {
    cashTag.textContent = "Very low";
    cashTag.className = "stat-tag negative";
  } else {
    cashTag.textContent = "Healthy";
    cashTag.className = "stat-tag positive";
  }

  const concentration = calcConcentration();
  const diversifyTag = document.getElementById("statDiversifyTag");
  if (invested === 0) {
    diversifyTag.textContent = "No holdings";
    diversifyTag.className = "stat-tag";
  } else if (concentration > 0.6) {
    diversifyTag.textContent = "Too concentrated";
    diversifyTag.className = "stat-tag negative";
  } else if (concentration < 0.35) {
    diversifyTag.textContent = "Well diversified";
    diversifyTag.className = "stat-tag positive";
  } else {
    diversifyTag.textContent = "OK";
    diversifyTag.className = "stat-tag";
  }

  const realizedTag = document.getElementById("statRealizedTag");
  if (realizedPL > 0) {
    realizedTag.textContent = "Profitable";
    realizedTag.className = "stat-tag positive";
  } else if (realizedPL < 0) {
    realizedTag.textContent = "Loss so far";
    realizedTag.className = "stat-tag negative";
  } else {
    realizedTag.textContent = "Neutral";
    realizedTag.className = "stat-tag";
  }

  const riskChip = document.getElementById("riskChip");
  let avgVol = 0;
  let ownedCount = 0;
  STOCKS.forEach((s) => {
    if ((portfolio[s.symbol] || 0) > 0) {
      avgVol += s.volatility;
      ownedCount++;
    }
  });
  if (ownedCount > 0) {
    avgVol = avgVol / ownedCount;
  }

  if (ownedCount === 0) {
    riskChip.textContent = "Risk: Not invested";
  } else if (avgVol > 0.05) {
    riskChip.textContent = "Risk: Aggressive";
  } else if (avgVol < 0.035) {
    riskChip.textContent = "Risk: Conservative";
  } else {
    riskChip.textContent = "Risk: Balanced";
  }

  document.getElementById("dayLabel").textContent = day;
  document.getElementById("maxDayLabel").textContent = MAX_DAYS;
  const progress = ((day - 1) / MAX_DAYS) * 100;
  document.getElementById("dayProgress").style.width = progress + "%";

  const nextBtn = document.getElementById("nextDayBtn");
  if (day > MAX_DAYS) {
    nextBtn.disabled = true;
    nextBtn.textContent = "Simulation complete";
  } else {
    nextBtn.disabled = false;
    nextBtn.textContent = "Next Day ▶";
  }

  if (net >= GOAL_NET_WORTH) {
    showToast("Nice! You reached the $12,000 goal. Keep experimenting!", false);
  }
}

function renderHoldings() {
  const list = document.getElementById("holdingsList");
  const empty = document.getElementById("holdingsEmpty");
  list.innerHTML = "";

  let hasHoldings = false;
  STOCKS.forEach((stock) => {
    const shares = portfolio[stock.symbol] || 0;
    if (shares > 0) {
      hasHoldings = true;
      const row = document.createElement("div");
      row.className = "holding-row";

      const value = shares * prices[stock.symbol];
      const costBasis = (priceHistory[stock.symbol] && priceHistory[stock.symbol][0]) || prices[stock.symbol];
      const pnl = value - shares * costBasis;

      const main = document.createElement("div");
      main.className = "holding-main";
      main.innerHTML = `
        <span class="holding-symbol">${stock.symbol}</span>
        <span class="holding-meta">${shares} sh • ${stock.name}</span>
      `;

      const pnlSpan = document.createElement("span");
      pnlSpan.className = "holding-pnl";
      pnlSpan.textContent = (pnl >= 0 ? "+" : "") + pnl.toFixed(2);
      pnlSpan.style.color = pnl >= 0 ? "var(--success)" : "var(--danger)";

      row.appendChild(main);
      row.appendChild(pnlSpan);
      list.appendChild(row);
    }
  });

  empty.style.display = hasHoldings ? "none" : "block";
}

function showLesson(lesson, hint) {
  document.getElementById("lessonTitle").textContent = lesson.title;
  document.getElementById("lessonBody").textContent = lesson.body;
  document.getElementById("lessonHint").textContent = "Triggered by: " + hint;
}

function pickLessonBasedOnState(reason) {
  const net = calcNetWorth();
  const returnPct = ((net - STARTING_CASH) / STARTING_CASH) * 100;
  const concentration = calcConcentration();
  const cashPct = calcCashPercent();
  const invested = calcPortfolioValue();

  let chosen = null;

  if (concentration > 0.55 && invested > 0) {
    chosen = lessons[0];
    reason = "High concentration in one stock";
  } else if (cashPct > 0.7 || cashPct < 0.1) {
    chosen = lessons[1];
    reason = cashPct > 0.7 ? "Very high cash percentage" : "Very low cash percentage";
  } else if (invested > 0) {
    let weightedVol = 0;
    let totalVal = 0;
    STOCKS.forEach((s) => {
      const val = (portfolio[s.symbol] || 0) * prices[s.symbol];
      weightedVol += val * s.volatility;
      totalVal += val;
    });
    if (totalVal > 0) weightedVol /= totalVal;
    if (weightedVol > 0.05) {
      chosen = lessons[2];
      reason = "Portfolio leaning toward high-volatility stocks";
    }
  }

  if (!chosen) {
    if (Math.abs(returnPct) > 10) {
      chosen = lessons[5];
      reason = "Large swings in net worth";
    } else {
      chosen = lessons[4];
      reason = "General trading activity";
    }
  }

  showLesson(chosen, reason);
}

// ===== TRADE OVERLAY =====
function openTradeOverlay(type, stock) {
  const overlay = document.getElementById("tradeOverlay");
  const title = document.getElementById("tradeTitle");
  const subtitle = document.getElementById("tradeSubtitle");
  const input = document.getElementById("tradeQuantityInput");
  const hint = document.getElementById("tradeHint");

  currentTrade = {
    type,
    symbol: stock.symbol,
    price: prices[stock.symbol]
  };

  if (type === "buy") {
    title.textContent = `Buy ${stock.symbol}`;
    subtitle.textContent = `Current price: ${formatMoney(prices[stock.symbol])}`;
    hint.textContent = `You have ${formatMoney(cash)} available.`;
    input.value = "";
    input.min = 1;
  } else {
    const owned = portfolio[stock.symbol] || 0;
    title.textContent = `Sell ${stock.symbol}`;
    subtitle.textContent = `Current price: ${formatMoney(prices[stock.symbol])}`;
    hint.textContent = `You own ${owned} shares.`;
    input.value = owned > 0 ? owned : "";
    input.min = 1;
    input.max = owned;
  }

  overlay.classList.add("show");
  input.focus();
}

function closeTradeOverlay() {
  const overlay = document.getElementById("tradeOverlay");
  overlay.classList.remove("show");
  currentTrade = null;
}

function confirmTrade() {
  const input = document.getElementById("tradeQuantityInput");
  const qty = parseInt(input.value, 10);

  if (!currentTrade || isNaN(qty) || qty <= 0) {
    showToast("Enter a valid quantity.", true);
    return;
  }

  const { type, symbol, price } = currentTrade;

  if (type === "buy") {
    const cost = qty * price;
    if (cost > cash + 1e-6) {
      showToast("Not enough cash for that trade.", true);
      return;
    }
    cash -= cost;
    portfolio[symbol] = (portfolio[symbol] || 0) + qty;
    if (!priceHistory[symbol]) {
      priceHistory[symbol] = [];
    }
    priceHistory[symbol].push(price);
    showToast(`Bought ${qty} ${symbol} at ${formatMoney(price)}.`);
  } else {
    const owned = portfolio[symbol] || 0;
    if (qty > owned) {
      showToast("You don't own that many shares.", true);
      return;
    }
    const revenue = qty * price;
    cash += revenue;
    portfolio[symbol] = owned - qty;
    const costBasis = (priceHistory[symbol] && priceHistory[symbol][0]) || price;
    const profit = qty * (price - costBasis);
    realizedPL += profit;
    const profitMsg =
      profit >= 0
        ? `You realized a profit of ${formatMoney(profit)}.`
        : `You realized a loss of ${formatMoney(profit)}.`;
    showToast(`Sold ${qty} ${symbol}. ${profitMsg}`, profit < 0);

    showLesson(lessons[3], "You closed a position");
  }

  closeTradeOverlay();
  renderStocksTable();
  renderStats();
  renderHoldings();
}

// ===== GAME LOOP =====
function nextDay() {
  if (day > MAX_DAYS) {
    showToast("The simulation is finished. Reset to play again.");
    return;
  }
  day++;

  STOCKS.forEach((stock) => {
    const symbol = stock.symbol;
    const lastPrice = prices[symbol];
    prevPrices[symbol] = lastPrice;

    const { newPrice } = calculateRandomPriceMove(lastPrice, stock.volatility);
    prices[symbol] = newPrice;

    if (!priceHistory[symbol]) priceHistory[symbol] = [];
    priceHistory[symbol].push(newPrice);
  });

  renderStocksTable();
  renderStats();
  renderHoldings();
  pickLessonBasedOnState("End of day review");
}

function resetGame() {
  day = 1;
  cash = STARTING_CASH;
  portfolio = {};
  priceHistory = {};
  realizedPL = 0;

  prevPrices = {};
  prices = {};
  STOCKS.forEach((stock) => {
    prices[stock.symbol] = randBetween(20, 150); // starting price
    priceHistory[stock.symbol] = [prices[stock.symbol]];
  });

  renderStocksTable();
  renderStats();
  renderHoldings();
  showLesson(
    {
      title: "Welcome to the simulation",
      body:
        "Start by buying small amounts of 2–3 different companies instead of putting all your money into one stock. " +
        "This is called diversification and it helps manage risk."
    },
    "Game start"
  );
}

// ===== EVENT LISTENERS =====
document.getElementById("nextDayBtn").addEventListener("click", nextDay);

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Reset the simulation and start over?")) {
    resetGame();
    showToast("Game reset. Fresh start!");
  }
});

document.getElementById("tradeCancelBtn").addEventListener("click", closeTradeOverlay);
document.getElementById("tradeConfirmBtn").addEventListener("click", confirmTrade);

document.getElementById("newTipBtn").addEventListener("click", () => {
  pickLessonBasedOnState("You requested a new tip");
});

document.getElementById("tradeOverlay").addEventListener("click", (e) => {
  if (e.target.id === "tradeOverlay") {
    closeTradeOverlay();
  }
});

document.getElementById("tradeQuantityInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmTrade();
  }
});

// ===== INIT =====
resetGame();