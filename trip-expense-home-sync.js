(function () {
  "use strict";

  var firebaseSettings = window.TRIP_EXPENSE_FIREBASE || {};
  var tripData = window.TRIP_DATA || null;
  var state = {
    people: [],
    expenses: [],
    eurRate: 35.2,
    usdRate: 31.5
  };
  var tones = ["ink", "sage", "red", "sand"];

  if (!tripData || !firebaseSettings.enabled || !firebaseSettings.config || !window.firebase) {
    setStatus("分帳同步尚未啟用", "neutral");
    return;
  }

  var app = window.firebase.apps && window.firebase.apps.length
    ? window.firebase.app()
    : window.firebase.initializeApp(firebaseSettings.config);
  var db = app.firestore();
  var tripCode = safeTripCode(firebaseSettings.tripCode || "SOUTH-ITALY-2026");
  var root = db.collection("tripExpenseBooks").doc(tripCode);

  root.collection("settings").doc("main").onSnapshot(function (doc) {
    var settings = doc.exists ? doc.data() || {} : {};
    state.people = cleanPeople(settings.people);
    state.eurRate = Number(settings.eurRate) || 35.2;
    state.usdRate = Number(settings.usdRate) || 31.5;
    render();
  }, function () {
    setStatus("無法讀取分帳設定", "alert");
  });

  root.collection("expenses").onSnapshot(function (snapshot) {
    state.expenses = snapshot.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data() || {});
    });
    render();
    setStatus("已即時同步", "success");
  }, function () {
    setStatus("分帳同步失敗", "alert");
  });

  function render() {
    var expenses = state.expenses.map(normalizeExpense);
    var people = state.people.slice();
    expenses.forEach(function (expense) {
      people.push(expense.paidBy);
      expense.splitWith.forEach(function (person) { people.push(person); });
    });
    people = cleanPeople(people);

    var sharedTotal = expenses.reduce(function (sum, expense) { return sum + expense.twd; }, 0);
    var openExpenses = expenses.filter(function (expense) { return !expense.settlementId; });
    var openTotal = openExpenses.reduce(function (sum, expense) { return sum + expense.twd; }, 0);
    var peopleCount = people.length || Number(tripData.travelers || 0) || 1;
    var categories = categoryTotals(expenses);

    setText("known-total", money(sharedTotal));
    setText("paid-total", money(sharedTotal));
    setText("pending-total", money(0));
    setText("per-person", money(sharedTotal / peopleCount));
    setText("paid-caption", "共同分帳已記錄 " + expenses.length + " 筆");
    setText("pending-caption", "目前沒有待付款項目");
    setText("per-day", peopleCount + " 位旅伴平均");
    setText("donut-percent", sharedTotal ? "100%" : "0%");
    setText("paid-side", money(sharedTotal));
    setText("pending-side", money(0));
    setDonut(sharedTotal ? "100" : "0");
    renderCategoryBars("category-bars", categories, sharedTotal);

    setText("shared-expense-total", money(sharedTotal));
    setText("shared-expense-count", expenses.length + " 筆共同支出");
    setText("shared-expense-average", money(sharedTotal / peopleCount));
    setText("shared-expense-people", peopleCount + " 位旅伴");
    setText("shared-open-total", money(openTotal));
    setText("shared-open-count", openExpenses.length + " 筆尚未結帳");
    renderCategoryBars("shared-category-bars", categories, sharedTotal);

    setText("personal-total", money(sharedTotal / peopleCount));
    setText("daily-average", expenses.length + " 筆");
    setText("pending-average", money(openTotal));
    renderPeople(people, expenses);
  }

  function normalizeExpense(expense) {
    var amount = Number(expense.amount || 0);
    var currency = expense.currency || "TWD";
    return {
      paidBy: String(expense.paidBy || "").trim(),
      splitWith: Array.isArray(expense.splitWith) ? expense.splitWith : [],
      splitMode: expense.splitMode === "custom" ? "custom" : "equal",
      splitShares: expense.splitShares && typeof expense.splitShares === "object" ? expense.splitShares : {},
      category: expense.category || "其他",
      settlementId: expense.settlementId || null,
      amount: amount,
      currency: currency,
      twd: toTwd(amount, currency)
    };
  }

  function renderPeople(people, expenses) {
    var balances = {};
    people.forEach(function (person) { balances[person] = { paid: 0, share: 0 }; });
    expenses.forEach(function (expense) {
      if (!balances[expense.paidBy]) balances[expense.paidBy] = { paid: 0, share: 0 };
      balances[expense.paidBy].paid += expense.twd;
      expense.splitWith.forEach(function (person) {
        if (!balances[person]) balances[person] = { paid: 0, share: 0 };
        balances[person].share += shareTwd(expense, person);
      });
    });
    var target = document.getElementById("personal-bars");
    if (!target) return;
    target.innerHTML = Object.keys(balances).map(function (person) {
      var balance = balances[person];
      var net = balance.paid - balance.share;
      var label = net >= 0 ? "應收" : "應付";
      return '<div class="personal-line"><span>' + escapeHtml(person) + '</span><strong>' + label + " " + money(Math.abs(net)) +
        '</strong><small>先付 ' + money(balance.paid) + " / 分攤 " + money(balance.share) + "</small></div>";
    }).join("") || '<div class="personal-line"><span>尚無共同分帳資料</span><strong>--</strong><small>新增支出後會自動顯示</small></div>';
  }

  function categoryTotals(expenses) {
    var groups = {};
    expenses.forEach(function (expense) {
      groups[expense.category] = (groups[expense.category] || 0) + expense.twd;
    });
    return Object.keys(groups).map(function (name, index) {
      return { name: name, amount: groups[name], tone: tones[index % tones.length] };
    }).sort(function (a, b) { return b.amount - a.amount; });
  }

  function renderCategoryBars(id, categories, total) {
    var target = document.getElementById(id);
    if (!target) return;
    target.innerHTML = categories.map(function (category) {
      var share = percent(category.amount, total);
      return '<div class="bar-line"><div><span>' + escapeHtml(category.name) + '</span><strong>' + money(category.amount) +
        '</strong></div><div class="bar"><i class="' + category.tone + '" style="width:' + share + '%"></i></div><small>' + share + "%</small></div>";
    }).join("") || '<p class="calculation-note">尚無共同分帳資料</p>';
  }

  function shareTwd(expense, person) {
    if (expense.splitMode === "custom") return toTwd(Number(expense.splitShares[person] || 0), expense.currency);
    return expense.splitWith.length ? expense.twd / expense.splitWith.length : 0;
  }

  function toTwd(amount, currency) {
    if (currency === "EUR") return Number(amount) * state.eurRate;
    if (currency === "USD") return Number(amount) * state.usdRate;
    return Number(amount);
  }

  function safeTripCode(code) {
    return String(code || "SOUTH-ITALY-2026").trim().replace(/[\/#?\[\]]/g, "-").toUpperCase().slice(0, 40) || "SOUTH-ITALY-2026";
  }

  function cleanPeople(people) {
    var seen = {};
    return (Array.isArray(people) ? people : []).map(function (person) { return String(person || "").trim(); }).filter(function (person) {
      if (!person || seen[person]) return false;
      seen[person] = true;
      return true;
    });
  }

  function percent(value, total) {
    return total ? Math.min(100, Math.max(0, Number(value || 0) / total * 100)).toFixed(1) : "0.0";
  }

  function money(value) {
    return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(value || 0)).replace("NT$", "NT$ ");
  }

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setDonut(value) {
    var donut = document.getElementById("payment-donut");
    if (donut) donut.style.setProperty("--paid", value + "%");
  }

  function setStatus(text, tone) {
    var element = document.getElementById("shared-sync-status");
    if (!element) return;
    element.textContent = text;
    element.className = "pill " + (tone || "neutral");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
    });
  }
}());
