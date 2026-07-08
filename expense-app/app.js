(function () {
  "use strict";

  var storageKey = "sud-italia-expense-app-v1";
  var money = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  });

  var defaults = {
    eurRate: 35.2,
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
  }

  function bindElements() {
    [
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
      if (!raw) return clone(defaults);
      var parsed = JSON.parse(raw);
      return {
        eurRate: Number(parsed.eurRate) || defaults.eurRate,
        people: Array.isArray(parsed.people) && parsed.people.length ? parsed.people : clone(defaults.people),
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : []
      };
    } catch (error) {
      return clone(defaults);
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
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

  function addExpense(event) {
    event.preventDefault();
    var splitWith = Array.from(elements.splitWith.querySelectorAll("input:checked")).map(function (input) {
      return input.value;
    });
    if (!splitWith.length) {
      alert("請至少選一位分攤對象。");
      return;
    }
    var amount = Number(elements.amount.value);
    var currencyCode = elements.currency.value;
    var expense = {
      id: "expense-" + Date.now(),
      date: elements.date.value,
      title: elements.title.value.trim(),
      category: elements.category.value,
      amount: amount,
      currency: currencyCode,
      paidBy: elements.paidBy.value,
      splitWith: splitWith,
      twd: toTwd(amount, currencyCode)
    };
    state.expenses.unshift(expense);
    saveState();
    elements.expenseForm.reset();
    setDefaultDate();
    render();
  }

  function addPerson(event) {
    event.preventDefault();
    var name = elements.personName.value.trim();
    if (!name || state.people.indexOf(name) >= 0) return;
    state.people.push(name);
    elements.personName.value = "";
    saveState();
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
    render();
  }

  function deleteExpense(id) {
    state.expenses = state.expenses.filter(function (expense) {
      return expense.id !== id;
    });
    saveState();
    render();
  }

  function updateRate() {
    state.eurRate = Number(elements.eurRate.value) || defaults.eurRate;
    state.expenses = state.expenses.map(function (expense) {
      expense.twd = toTwd(expense.amount, expense.currency);
      return expense;
    });
    saveState();
    render();
  }

  function setAllSplit(checked) {
    Array.from(elements.splitWith.querySelectorAll("input")).forEach(function (input) {
      input.checked = checked;
    });
  }

  function resetData() {
    if (!confirm("確定要清空目前的記帳資料？")) return;
    state = clone(defaults);
    saveState();
    render();
  }

  function render() {
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
      var share = expense.twd / expense.splitWith.length;
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
      if (amount > 0) {
        settlements.push({ from: debtors[i].person, to: creditors[j].person, amount: amount });
      }
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
