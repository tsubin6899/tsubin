(function () {
  "use strict";

  var storageKey = "sud-italia-expense-app-v2";
  var legacyStorageKey = "sud-italia-expense-app-v1";
  var codeKey = "sud-italia-expense-trip-code";
  var firebaseSettings = window.TRIP_EXPENSE_FIREBASE || {};
  var db = null;
  var unsubscribeExpenses = null;
  var unsubscribeSettings = null;
  var syncMode = "local";
  var isRemoteUpdate = false;

  var money = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  });

  var defaults = {
    eurRate: 35.2,
    tripCode: firebaseSettings.tripCode || "SOUTH-ITALY-2026",
    people: ["祖斌", "旅伴 2", "旅伴 3", "旅伴 4"],
    expenses: []
  };

  var state = loadState();
  var elements = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    setDefaultDate();
    bindEvents();
    render();
    startSync();
  }

  function bindElements() {
    [
      "syncStatus",
      "tripCodeForm",
      "tripCode",
      "totalSpent",
      "expenseCount",
      "averageShare",
      "travelerCount",
      "settleCount",
      "eurRate",
      "expenseForm",
      "date",
      "title",
      "category",
      "amount",
      "currency",
      "paidBy",
      "splitWith",
      "selectAll",
      "selectNone",
      "personForm",
      "personName",
      "personList",
      "settlements",
      "balances",
      "categories",
      "ledger",
      "filterCategory",
      "exportCsv",
      "resetData"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    elements.expenseForm.addEventListener("submit", addExpense);
    elements.personForm.addEventListener("submit", addPerson);
    elements.tripCodeForm.addEventListener("submit", changeTripCode);
    elements.eurRate.addEventListener("change", updateRate);
    elements.filterCategory.addEventListener("change", renderLedger);
    elements.selectAll.addEventListener("click", function () {
      setAllSplit(true);
    });
    elements.selectNone.addEventListener("click", function () {
      setAllSplit(false);
    });
    elements.exportCsv.addEventListener("click", exportCsv);
    elements.resetData.addEventListener("click", resetData);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) raw = localStorage.getItem(legacyStorageKey);
      var savedCode = localStorage.getItem(codeKey);
      if (!raw) {
        var initial = clone(defaults);
        if (savedCode) initial.tripCode = savedCode;
        return initial;
      }
      var parsed = JSON.parse(raw);
      return {
        eurRate: Number(parsed.eurRate) || defaults.eurRate,
        tripCode: savedCode || parsed.tripCode || defaults.tripCode,
        people: Array.isArray(parsed.people) && parsed.people.length ? parsed.people : clone(defaults.people),
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeExpense) : []
      };
    } catch (error) {
      return clone(defaults);
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    localStorage.setItem(codeKey, state.tripCode);
  }

  function startSync() {
    elements.tripCode.value = state.tripCode;
    if (!firebaseSettings.enabled) {
      setSyncStatus("本機模式：請先在 firebase-config.js 啟用 Firebase。");
      return;
    }
    if (!firebaseSettings.config || !firebaseSettings.config.apiKey || !window.firebase) {
      setSyncStatus("本機模式：Firebase 設定尚未完成，或目前無法載入 Firebase。");
      return;
    }
    try {
      if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseSettings.config);
      db = window.firebase.firestore();
      db.settings({ experimentalAutoDetectLongPolling: true });
      syncMode = "firebase";
      subscribeTrip();
    } catch (error) {
      syncMode = "local";
      setSyncStatus("本機模式：Firebase 初始化失敗。");
    }
  }

  function subscribeTrip() {
    stopSubscriptions();
    setSyncStatus("同步中：" + state.tripCode);
    var root = tripRef();

    unsubscribeSettings = root.collection("settings").doc("main").onSnapshot({ includeMetadataChanges: true }, function (doc) {
      isRemoteUpdate = true;
      if (doc.exists) {
        var data = doc.data() || {};
        state.people = Array.isArray(data.people) && data.people.length ? data.people : state.people;
        state.eurRate = Number(data.eurRate) || state.eurRate;
      } else {
        root.collection("settings").doc("main").set({
          people: state.people,
          eurRate: Number(state.eurRate) || defaults.eurRate,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      saveState();
      render();
      isRemoteUpdate = false;
    }, function (error) {
      setSyncStatus("同步失敗：" + readableError(error));
    });

    unsubscribeExpenses = root.collection("expenses").onSnapshot({ includeMetadataChanges: true }, function (snapshot) {
      isRemoteUpdate = true;
      state.expenses = snapshot.docs.map(function (doc) {
        return normalizeExpense(Object.assign({ id: doc.id }, doc.data()));
      }).sort(function (a, b) {
        return expenseTime(b) - expenseTime(a);
      });
      saveState();
      render();
      setSyncStatus(syncStatusText(snapshot));
      isRemoteUpdate = false;
    }, function (error) {
      setSyncStatus("同步失敗：" + readableError(error));
    });
  }

  function stopSubscriptions() {
    if (unsubscribeExpenses) unsubscribeExpenses();
    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeExpenses = null;
    unsubscribeSettings = null;
  }

  function tripRef() {
    return db.collection("tripExpenseBooks").doc(safeTripCode(state.tripCode));
  }

  function safeTripCode(code) {
    return String(code || defaults.tripCode).trim().replace(/[\/#?[\]]/g, "-").toUpperCase().slice(0, 40) || defaults.tripCode;
  }

  function writeSettings() {
    if (syncMode !== "firebase" || isRemoteUpdate) return Promise.resolve();
    return tripRef().collection("settings").doc("main").set({
      people: state.people,
      eurRate: Number(state.eurRate) || defaults.eurRate,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  function setSyncStatus(text) {
    elements.syncStatus.textContent = text;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setDefaultDate() {
    elements.date.value = new Date().toISOString().slice(0, 10);
  }

  function currency(value) {
    return money.format(Math.round(value || 0)).replace("NT$", "NT$ ");
  }

  function toTwd(amount, currencyCode) {
    return currencyCode === "EUR" ? Number(amount) * state.eurRate : Number(amount);
  }

  function normalizeExpense(expense) {
    var amount = Number(expense.amount || 0);
    var currencyCode = expense.currency || "TWD";
    return {
      id: expense.id || "expense-" + Date.now(),
      date: expense.date || "",
      title: expense.title || "",
      category: expense.category || "其他",
      amount: amount,
      currency: currencyCode,
      paidBy: expense.paidBy || "",
      splitWith: Array.isArray(expense.splitWith) ? expense.splitWith : [],
      createdAt: expense.createdAt || null,
      clientCreatedAt: Number(expense.clientCreatedAt || 0),
      twd: toTwd(amount, currencyCode)
    };
  }

  function addExpense(event) {
    event.preventDefault();
    var splitWith = Array.from(elements.splitWith.querySelectorAll("input:checked")).map(function (input) {
      return input.value;
    });
    if (!splitWith.length) {
      alert("請至少選一位分攤對象。");
      return;
    }
    var expense = normalizeExpense({
      id: "expense-" + Date.now(),
      date: elements.date.value,
      title: elements.title.value.trim(),
      category: elements.category.value,
      amount: Number(elements.amount.value),
      currency: elements.currency.value,
      paidBy: elements.paidBy.value,
      splitWith: splitWith
    });
    if (syncMode === "firebase") {
      tripRef().collection("expenses").add({
        date: expense.date,
        title: expense.title,
        category: expense.category,
        amount: expense.amount,
        currency: expense.currency,
        paidBy: expense.paidBy,
        splitWith: expense.splitWith,
        clientCreatedAt: Date.now(),
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () {
        afterExpenseSaved();
        setSyncStatus("新增成功，等待其他裝置同步：" + state.tripCode);
      }).catch(function (error) {
        setSyncStatus("新增失敗：" + readableError(error));
      });
    } else {
      state.expenses.unshift(expense);
      saveState();
      afterExpenseSaved();
      render();
    }
  }

  function afterExpenseSaved() {
    elements.expenseForm.reset();
    setDefaultDate();
  }

  function addPerson(event) {
    event.preventDefault();
    var name = elements.personName.value.trim();
    if (!name || state.people.indexOf(name) >= 0) return;
    state.people.push(name);
    elements.personName.value = "";
    saveState();
    writeSettings();
    render();
  }

  function removePerson(name) {
    var isUsed = state.expenses.some(function (expense) {
      return expense.paidBy === name || expense.splitWith.indexOf(name) >= 0;
    });
    if (isUsed) {
      alert("這位旅伴已有支出紀錄，請先刪除相關支出。");
      return;
    }
    state.people = state.people.filter(function (person) {
      return person !== name;
    });
    saveState();
    writeSettings();
    render();
  }

  function deleteExpense(id) {
    if (syncMode === "firebase") {
      tripRef().collection("expenses").doc(id).delete().catch(function (error) {
        setSyncStatus("刪除失敗：" + readableError(error));
      });
      return;
    }
    state.expenses = state.expenses.filter(function (expense) {
      return expense.id !== id;
    });
    saveState();
    render();
  }

  function updateRate() {
    state.eurRate = Number(elements.eurRate.value) || defaults.eurRate;
    state.expenses = state.expenses.map(normalizeExpense);
    saveState();
    writeSettings();
    render();
  }

  function changeTripCode(event) {
    event.preventDefault();
    state.tripCode = safeTripCode(elements.tripCode.value);
    elements.tripCode.value = state.tripCode;
    saveState();
    if (syncMode === "firebase") subscribeTrip();
    render();
  }

  function setAllSplit(checked) {
    Array.from(elements.splitWith.querySelectorAll("input")).forEach(function (input) {
      input.checked = checked;
    });
  }

  function resetData() {
    if (!confirm("確定要清空目前帳本？Firebase 模式會清空這個旅行代碼底下的雲端支出。")) return;
    if (syncMode === "firebase") {
      tripRef().collection("expenses").get().then(function (snapshot) {
        var batch = db.batch();
        snapshot.docs.forEach(function (doc) {
          batch.delete(doc.ref);
        });
        return batch.commit();
      }).then(function () {
        state.expenses = [];
        saveState();
        render();
      }).catch(function (error) {
        setSyncStatus("清空失敗：" + readableError(error));
      });
      return;
    }
    state.expenses = [];
    saveState();
    render();
  }

  function render() {
    elements.tripCode.value = state.tripCode;
    elements.eurRate.value = state.eurRate;
    renderPeopleControls();
    renderSummary();
    renderSettlements();
    renderBalances();
    renderCategories();
    renderLedger();
  }

  function renderPeopleControls() {
    elements.paidBy.innerHTML = state.people.map(optionHtml).join("");
    elements.splitWith.innerHTML = state.people.map(function (person) {
      return '<label class="check-card"><input type="checkbox" value="' + escapeHtml(person) + '" checked>' +
        '<span>' + escapeHtml(person) + "</span></label>";
    }).join("");
    elements.personList.innerHTML = state.people.map(function (person) {
      return '<div class="person-row"><strong>' + escapeHtml(person) + "</strong>" +
        '<button type="button" data-person="' + escapeHtml(person) + '">移除</button></div>';
    }).join("");
    Array.from(elements.personList.querySelectorAll("button")).forEach(function (button) {
      button.addEventListener("click", function () {
        removePerson(button.dataset.person);
      });
    });
  }

  function optionHtml(value) {
    return '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>";
  }

  function renderSummary() {
    var total = state.expenses.reduce(sumTwd, 0);
    var settlements = calculateSettlements();
    elements.totalSpent.textContent = currency(total);
    elements.expenseCount.textContent = state.expenses.length + " 筆支出";
    elements.averageShare.textContent = currency(state.people.length ? total / state.people.length : 0);
    elements.travelerCount.textContent = state.people.length + " 位旅伴";
    elements.settleCount.textContent = settlements.length + " 筆";
  }

  function calculateBalances() {
    var balances = {};
    state.people.forEach(function (person) {
      balances[person] = { paid: 0, share: 0, net: 0 };
    });
    state.expenses.forEach(function (expense) {
      if (!balances[expense.paidBy]) balances[expense.paidBy] = { paid: 0, share: 0, net: 0 };
      balances[expense.paidBy].paid += expense.twd;
      var share = expense.splitWith.length ? expense.twd / expense.splitWith.length : 0;
      expense.splitWith.forEach(function (person) {
        if (!balances[person]) balances[person] = { paid: 0, share: 0, net: 0 };
        balances[person].share += share;
      });
    });
    Object.keys(balances).forEach(function (person) {
      balances[person].net = balances[person].paid - balances[person].share;
    });
    return balances;
  }

  function calculateSettlements() {
    var balances = calculateBalances();
    var debtors = [];
    var creditors = [];
    Object.keys(balances).forEach(function (person) {
      var net = Math.round(balances[person].net);
      if (net < 0) debtors.push({ person: person, amount: Math.abs(net) });
      if (net > 0) creditors.push({ person: person, amount: net });
    });
    debtors.sort(byAmountDesc);
    creditors.sort(byAmountDesc);
    var settlements = [];
    var i = 0;
    var j = 0;
    while (i < debtors.length && j < creditors.length) {
      var amount = Math.min(debtors[i].amount, creditors[j].amount);
      if (amount > 0) settlements.push({ from: debtors[i].person, to: creditors[j].person, amount: amount });
      debtors[i].amount -= amount;
      creditors[j].amount -= amount;
      if (debtors[i].amount <= 0) i += 1;
      if (creditors[j].amount <= 0) j += 1;
    }
    return settlements;
  }

  function renderSettlements() {
    var settlements = calculateSettlements();
    if (!settlements.length) {
      elements.settlements.innerHTML = emptyHtml("目前不用轉帳");
      return;
    }
    elements.settlements.innerHTML = settlements.map(function (item) {
      return '<div class="settlement-row"><span>' + escapeHtml(item.from) + " 轉給 " +
        escapeHtml(item.to) + '</span><strong>' + currency(item.amount) + "</strong></div>";
    }).join("");
  }

  function renderBalances() {
    var balances = calculateBalances();
    var rows = Object.keys(balances).map(function (person) {
      return { person: person, data: balances[person] };
    });
    rows.sort(function (a, b) {
      return b.data.net - a.data.net;
    });
    elements.balances.innerHTML = rows.map(function (row) {
      var className = row.data.net >= 0 ? "positive" : "negative";
      return '<div class="balance-row"><div><strong>' + escapeHtml(row.person) + "</strong>" +
        '<div class="ledger-meta">已付 ' + currency(row.data.paid) + " / 應分攤 " +
        currency(row.data.share) + '</div></div><strong class="balance-amount ' + className + '">' +
        currency(row.data.net) + "</strong></div>";
    }).join("") || emptyHtml("目前沒有明細");
  }

  function renderCategories() {
    var total = state.expenses.reduce(sumTwd, 0);
    var groups = {};
    state.expenses.forEach(function (expense) {
      groups[expense.category] = (groups[expense.category] || 0) + expense.twd;
    });
    var rows = Object.keys(groups).map(function (name) {
      return { name: name, amount: groups[name] };
    }).sort(byAmountDesc);
    elements.categories.innerHTML = rows.map(function (row) {
      var width = total ? Math.round(row.amount / total * 100) : 0;
      return '<div class="category-row"><div class="category-top"><strong>' + escapeHtml(row.name) +
        "</strong><span>" + currency(row.amount) + "</span></div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%"></div></div></div>';
    }).join("") || emptyHtml("目前沒有分類資料");
  }

  function renderLedger() {
    var category = elements.filterCategory.value || "全部";
    var rows = state.expenses.filter(function (expense) {
      return category === "全部" || expense.category === category;
    });
    elements.ledger.innerHTML = rows.map(function (expense) {
      var original = expense.currency === "EUR" ? "EUR " + Number(expense.amount).toFixed(2) : currency(expense.amount);
      return '<div class="ledger-row"><div class="ledger-main"><span class="ledger-title">' +
        escapeHtml(expense.title) + '</span><span class="ledger-meta">' + escapeHtml(expense.date) +
        " / " + escapeHtml(expense.category) + " / " + escapeHtml(expense.paidBy) +
        " 先付 / 分攤 " + expense.splitWith.map(escapeHtml).join("、") +
        '</span></div><div class="ledger-amount">' + currency(expense.twd) +
        '<div class="ledger-meta">' + original + '</div></div><button type="button" data-id="' +
        escapeHtml(expense.id) + '">刪除</button></div>';
    }).join("") || emptyHtml("目前沒有支出紀錄");
    Array.from(elements.ledger.querySelectorAll("button")).forEach(function (button) {
      button.addEventListener("click", function () {
        deleteExpense(button.dataset.id);
      });
    });
  }

  function exportCsv() {
    var header = ["date", "title", "category", "amount", "currency", "twd", "paidBy", "splitWith"];
    var rows = state.expenses.map(function (expense) {
      return [
        expense.date,
        expense.title,
        expense.category,
        expense.amount,
        expense.currency,
        Math.round(expense.twd),
        expense.paidBy,
        expense.splitWith.join("|")
      ].map(csvCell).join(",");
    });
    var csv = "\ufeff" + header.join(",") + "\n" + rows.join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "south-italy-expenses.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
  }

  function sumTwd(total, expense) {
    return total + Number(expense.twd || 0);
  }

  function byAmountDesc(a, b) {
    return b.amount - a.amount;
  }

  function expenseTime(expense) {
    if (expense.clientCreatedAt) return expense.clientCreatedAt;
    if (expense.createdAt && typeof expense.createdAt.toMillis === "function") return expense.createdAt.toMillis();
    if (expense.createdAt && expense.createdAt.seconds) return expense.createdAt.seconds * 1000;
    return 0;
  }

  function syncStatusText(snapshot) {
    var source = snapshot.metadata.fromCache ? "本機快取" : "雲端";
    var pending = snapshot.metadata.hasPendingWrites ? "，尚有資料待上傳" : "，雲端已確認";
    return "已同步：" + state.tripCode + "（" + source + pending + "，共 " + state.expenses.length + " 筆支出）";
  }

  function readableError(error) {
    return (error && (error.code || error.message)) ? (error.code || error.message) : "請檢查 Firebase 權限或網路。";
  }

  function emptyHtml(text) {
    return '<div class="empty-state"><strong>' + escapeHtml(text) +
      '</strong><span>新增資料後會自動整理。</span></div>';
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
