/* ==========================================================================
   Expense Tracker - script.js
   STAGE 1: Add transactions, display them, and update the dashboard
   STAGE 2: Edit and delete transactions
   STAGE 3: Filter transactions by type and category
   STAGE 4: Save transactions in the browser's Local Storage

   NOTE: The <form> in index.html has novalidate="false". In HTML, the mere
   presence of the "novalidate" attribute turns browser validation OFF, so
   all validation is done in JavaScript below.
   ========================================================================== */

"use strict";

/* ---------- 1. DOM ELEMENTS (existing IDs / classes from index.html) ---------- */

// Form and form fields
const transactionForm = document.getElementById("transaction-form");
const transactionIdInput = document.getElementById("transaction-id"); // hidden field: holds the ID while editing
const amountInput = document.getElementById("amount");
const categorySelect = document.getElementById("category");
const dateInput = document.getElementById("date");
const descriptionInput = document.getElementById("description");
const formMessage = document.getElementById("form-message");

// Form heading and buttons (used to show edit mode)
const formSection = document.getElementById("form-section");
const formHeading = document.getElementById("form-heading");
const submitButton = document.getElementById("submit-btn");
const cancelEditButton = document.getElementById("cancel-edit-btn");

// Transaction type radio buttons (#type-income and #type-expense, name="type")
const typeIncomeRadio = document.getElementById("type-income");

// Filter controls
const filterTypeSelect = document.getElementById("filter-type");
const filterCategorySelect = document.getElementById("filter-category");
const clearFiltersButton = document.getElementById("clear-filters-btn");

// Transaction list / empty state
const transactionList = document.getElementById("transaction-list"); // <tbody>
const tableWrapper = document.getElementById("table-wrapper");
const emptyState = document.getElementById("empty-state");
const emptyStateMessage = emptyState.querySelector("p"); // the <p> inside the empty state

// Dashboard
const totalIncomeEl = document.getElementById("total-income");
const totalExpensesEl = document.getElementById("total-expenses");
const currentBalanceEl = document.getElementById("current-balance");

/* ---------- 2. APPLICATION STATE ---------- */

// STAGE 4: The one key under which all transactions are stored in Local Storage
const STORAGE_KEY = "expenseTrackerTransactions";

// All transactions live in this array.
// STAGE 4: It starts empty here and is filled from Local Storage in init().
let transactions = [];

// Used to hide the success message after a few seconds
let messageTimeoutId = null;

// Text used for the form in normal (add) mode and in edit mode
const ADD_MODE_HEADING = "Add Transaction";
const ADD_MODE_BUTTON_TEXT = "Add Transaction";
const EDIT_MODE_HEADING = "Edit Transaction";
const EDIT_MODE_BUTTON_TEXT = "Update Transaction";

// Messages for the empty state
// (1) no transactions at all  (2) transactions exist but none match the filters
const NO_TRANSACTIONS_MESSAGE = emptyStateMessage.textContent; // original text from index.html
const NO_MATCH_MESSAGE = "No transactions match the selected filters.";

// Special value used by both filters for "show everything"
const FILTER_ALL = "all";

/* ---------- 3. HELPER FUNCTIONS ---------- */

// Format a number with exactly two decimal places (e.g. 5 -> "5.00")
function formatAmount(number) {
  return number.toFixed(2);
}

// Create a reasonably unique id for each transaction
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Turn "income" into "Income" and "expense" into "Expense"
function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Get the readable label of the selected category (e.g. "Food" for value "food")
function getCategoryLabel(categoryValue) {
  const option = categorySelect.querySelector('option[value="' + categoryValue + '"]');
  return option ? option.textContent : capitalize(categoryValue);
}

// Read which transaction type radio button is selected ("income" or "expense")
function getSelectedType() {
  const checkedRadio = transactionForm.querySelector('input[name="type"]:checked');
  return checkedRadio ? checkedRadio.value : "";
}

// Find one transaction in the array by its id (returns undefined if not found)
function findTransactionById(id) {
  return transactions.find(function (transaction) {
    return transaction.id === id;
  });
}

// Returns true when the form is currently in edit mode.
// The hidden #transaction-id field stores the id of the transaction being edited.
function isEditing() {
  return transactionIdInput.value !== "";
}

/* ---------- 4. FORM MESSAGES ---------- */

// Show a message under the form. messageType is "success" or "error".
function showMessage(text, messageType) {
  clearTimeout(messageTimeoutId);

  formMessage.textContent = text;
  formMessage.classList.remove("success", "error");
  formMessage.classList.add(messageType);

  // Success messages disappear automatically after 3 seconds
  if (messageType === "success") {
    messageTimeoutId = setTimeout(clearMessage, 3000);
  }
}

// Remove any message from under the form
function clearMessage() {
  clearTimeout(messageTimeoutId);
  formMessage.textContent = "";
  formMessage.classList.remove("success", "error");
}

/* ---------- 5. VALIDATION ---------- */

/*
  Reads the form values, checks them, and returns an object:
    { isValid: true,  data: { type, amount, category, date, description } }
    { isValid: false, message: "...", field: <element to focus> }
*/
function validateForm() {
  const type = getSelectedType();
  const amount = Math.round(parseFloat(amountInput.value) * 100) / 100; // round to 2 decimals
  const category = categorySelect.value;
  const date = dateInput.value;
  const description = descriptionInput.value.trim();

  if (type !== "income" && type !== "expense") {
    return { isValid: false, message: "Please select a transaction type.", field: typeIncomeRadio };
  }

  // Number.isFinite also catches NaN (empty or invalid input)
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      isValid: false,
      message: "Amount must be greater than 0.",
      field: amountInput
    };
  }

  if (category === "") {
    return { isValid: false, message: "Please select a category.", field: categorySelect };
  }

  if (date === "") {
    return { isValid: false, message: "Please choose a date.", field: dateInput };
  }

  if (description === "") {
    return { isValid: false, message: "Please enter a description.", field: descriptionInput };
  }

  return {
    isValid: true,
    data: { type, amount, category, date, description }
  };
}

/* ---------- 6. LOCAL STORAGE (STAGE 4) ---------- */

/*
  Local Storage can only store text (strings), so:
    - SAVING:  array -> JSON.stringify() -> text stored under STORAGE_KEY
    - LOADING: text  -> JSON.parse()     -> array again
*/

// Checks that one item loaded from storage looks like a real transaction.
// This protects the app from half-broken or manually edited data.
function isValidStoredTransaction(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.id === "string" && item.id !== "" &&
    (item.type === "income" || item.type === "expense") &&
    Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 &&
    typeof item.category === "string" && item.category !== "" &&
    typeof item.date === "string" && item.date !== "" &&
    typeof item.description === "string"
  );
}

// Save the current transactions array to Local Storage
function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (error) {
    // Storage can fail (e.g. private mode or storage full). The app keeps working in memory.
    console.warn("Could not save transactions to Local Storage:", error);
  }
}

// Read the saved transactions from Local Storage.
// Always returns an array: an empty one if nothing is saved or the data is corrupted.
function loadTransactions() {
  try {
    const savedText = localStorage.getItem(STORAGE_KEY);

    // Nothing saved yet -> start with an empty list
    if (savedText === null) {
      return [];
    }

    // Convert the saved text back into JavaScript data (throws an error if the text is broken)
    const savedData = JSON.parse(savedText);

    // The saved data must be an array
    if (!Array.isArray(savedData)) {
      return [];
    }

    // Keep only valid transactions and make sure each amount is a real number
    return savedData.filter(isValidStoredTransaction).map(function (item) {
      return {
        id: item.id,
        type: item.type,
        amount: Number(item.amount),
        category: item.category,
        date: item.date,
        description: item.description
      };
    });
  } catch (error) {
    // Corrupted JSON (or storage not available) -> use an empty list instead of crashing
    console.warn("Could not read saved transactions. Starting with an empty list.", error);
    return [];
  }
}

/* ---------- 7. TRANSACTION LOGIC ---------- */

// Build a transaction object, add it to the transactions array, and save
function addTransaction(data) {
  const transaction = {
    id: generateId(),
    type: data.type,
    amount: data.amount,
    category: data.category,
    date: data.date,
    description: data.description
  };

  transactions.push(transaction);
  saveTransactions(); // STAGE 4: keep Local Storage in sync
}

// Replace an existing transaction with the edited data.
// The ID stays the same, so no duplicate is created. Returns true if it worked.
function updateTransaction(id, data) {
  const index = transactions.findIndex(function (transaction) {
    return transaction.id === id;
  });

  if (index === -1) {
    return false; // transaction no longer exists
  }

  transactions[index] = {
    id: id, // keep the original id
    type: data.type,
    amount: data.amount,
    category: data.category,
    date: data.date,
    description: data.description
  };

  saveTransactions(); // STAGE 4: keep Local Storage in sync
  return true;
}

// Remove only the transaction with the given id, then save
function deleteTransaction(id) {
  transactions = transactions.filter(function (transaction) {
    return transaction.id !== id;
  });

  saveTransactions(); // STAGE 4: keep Local Storage in sync
}

// Calculate totals from the transactions array.
// This always uses ALL transactions, so the dashboard is never affected by filters.
function calculateTotals() {
  let totalIncome = 0;
  let totalExpenses = 0;

  transactions.forEach(function (transaction) {
    if (transaction.type === "income") {
      totalIncome += transaction.amount;
    } else {
      totalExpenses += transaction.amount;
    }
  });

  return {
    income: totalIncome,
    expenses: totalExpenses,
    balance: totalIncome - totalExpenses // income adds, expenses subtract
  };
}

/* ---------- 8. FILTERING ---------- */

/*
  Returns a NEW array containing only the transactions that match BOTH filters.
  Array.filter() never changes the original "transactions" array, so filtering
  never changes the data that is saved in Local Storage.

    Type filter     "all" -> every type, otherwise transaction.type must match
    Category filter "all" -> every category, otherwise transaction.category must match

  Because both checks are combined with AND (&&), the filters work together.
  Example: Type = "expense" and Category = "food" keeps only food expenses.
*/
function getFilteredTransactions() {
  const selectedType = filterTypeSelect.value;
  const selectedCategory = filterCategorySelect.value;

  return transactions.filter(function (transaction) {
    const matchesType = selectedType === FILTER_ALL || transaction.type === selectedType;
    const matchesCategory =
      selectedCategory === FILTER_ALL || transaction.category === selectedCategory;

    return matchesType && matchesCategory;
  });
}

/*
  Rebuilds the Category filter dropdown from the categories that actually
  appear in the transaction data (instead of using a fixed list).
  The user's current selection is kept when that category still exists;
  otherwise the filter falls back to "All Categories".
*/
function updateCategoryFilter() {
  const previousSelection = filterCategorySelect.value;

  // Collect each category only once
  const uniqueCategories = [];
  transactions.forEach(function (transaction) {
    if (uniqueCategories.indexOf(transaction.category) === -1) {
      uniqueCategories.push(transaction.category);
    }
  });

  // Sort by the readable label (Food, Salary, ...) so the list is easy to scan
  uniqueCategories.sort(function (a, b) {
    return getCategoryLabel(a).localeCompare(getCategoryLabel(b));
  });

  // Remove the old options, then add "All Categories" first
  filterCategorySelect.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = FILTER_ALL;
  allOption.textContent = "All Categories";
  filterCategorySelect.appendChild(allOption);

  // Add one option for each category found in the data
  uniqueCategories.forEach(function (category) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = getCategoryLabel(category);
    filterCategorySelect.appendChild(option);
  });

  // Restore the previous selection if it still exists, otherwise use "All Categories"
  if (uniqueCategories.indexOf(previousSelection) !== -1) {
    filterCategorySelect.value = previousSelection;
  } else {
    filterCategorySelect.value = FILTER_ALL;
  }
}

/* ---------- 9. DISPLAY (RENDERING) ---------- */

// Update the three dashboard cards
function updateDashboard() {
  const totals = calculateTotals();

  totalIncomeEl.textContent = formatAmount(totals.income);
  totalExpensesEl.textContent = formatAmount(totals.expenses);
  currentBalanceEl.textContent = formatAmount(totals.balance);
}

// Create one table cell with text and a CSS class
function createCell(className, text) {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = text; // textContent keeps user input safe (no HTML injection)
  return cell;
}

// Create one table row (<tr>) for a transaction
function createTransactionRow(transaction) {
  const row = document.createElement("tr");
  row.className = "transaction-row " + transaction.type; // "income" or "expense" for colours
  row.dataset.id = transaction.id; // becomes data-id="..."

  // Highlight the row that is currently being edited (uses the existing .editing style)
  if (transaction.id === transactionIdInput.value) {
    row.classList.add("editing");
  }

  row.appendChild(createCell("transaction-date", transaction.date));
  row.appendChild(createCell("transaction-description", transaction.description));
  row.appendChild(createCell("transaction-category", getCategoryLabel(transaction.category)));
  row.appendChild(createCell("transaction-type", capitalize(transaction.type)));
  row.appendChild(createCell("transaction-amount", formatAmount(transaction.amount)));

  // Actions cell: each button stores the transaction id in data-id,
  // so the click handler knows which transaction to edit or delete.
  const actionsCell = document.createElement("td");
  actionsCell.className = "transaction-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn btn-edit";
  editButton.dataset.id = transaction.id;
  editButton.textContent = "Edit";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn btn-delete";
  deleteButton.dataset.id = transaction.id;
  deleteButton.textContent = "Delete";

  actionsCell.appendChild(editButton);
  actionsCell.appendChild(deleteButton);
  row.appendChild(actionsCell);

  return row;
}

// Redraw the transaction list (only the transactions that match the filters)
// and toggle the empty-state message
function renderTransactions() {
  // Get only the transactions that match the current filters
  const visibleTransactions = getFilteredTransactions();

  // Remove all existing rows
  transactionList.textContent = "";

  // Add a row for every visible transaction
  visibleTransactions.forEach(function (transaction) {
    transactionList.appendChild(createTransactionRow(transaction));
  });

  // Show the empty-state message only when there is nothing to display
  const hasVisibleTransactions = visibleTransactions.length > 0;
  emptyState.hidden = hasVisibleTransactions;
  tableWrapper.hidden = !hasVisibleTransactions;

  // Choose the right message for the empty state
  if (transactions.length === 0) {
    emptyStateMessage.textContent = NO_TRANSACTIONS_MESSAGE; // nothing added yet
  } else {
    emptyStateMessage.textContent = NO_MATCH_MESSAGE; // transactions exist, but none match
  }
}

// Refresh everything the user sees
function updateUI() {
  updateCategoryFilter(); // keep the category list in sync with the data
  renderTransactions();
  updateDashboard();
}

/* ---------- 10. EDIT MODE ---------- */

// Switch the form into edit mode for the given transaction
function enterEditMode(transaction) {
  // Fill the form with the transaction's existing data
  const typeRadio = transactionForm.querySelector(
    'input[name="type"][value="' + transaction.type + '"]'
  );
  if (typeRadio) {
    typeRadio.checked = true;
  }
  amountInput.value = transaction.amount;
  categorySelect.value = transaction.category;
  dateInput.value = transaction.date;
  descriptionInput.value = transaction.description;

  // Remember which transaction is being edited (kept in the hidden field)
  transactionIdInput.value = transaction.id;

  // Make it clear that the form is in edit mode
  formHeading.textContent = EDIT_MODE_HEADING;
  submitButton.textContent = EDIT_MODE_BUTTON_TEXT;
  cancelEditButton.hidden = false;

  // Highlight the row being edited
  renderTransactions();

  // Bring the form into view and start at the amount field
  clearMessage();
  formSection.scrollIntoView({ behavior: "smooth", block: "start" });
  amountInput.focus();
}

// Leave edit mode and return the form to "Add" mode.
// (This only restores the labels/state; clearing the fields is done by form.reset().)
function exitEditMode() {
  transactionIdInput.value = ""; // hidden inputs are not cleared by reset(), so clear it here
  formHeading.textContent = ADD_MODE_HEADING;
  submitButton.textContent = ADD_MODE_BUTTON_TEXT;
  cancelEditButton.hidden = true;

  // Remove the "editing" highlight from any row
  const editingRow = transactionList.querySelector(".transaction-row.editing");
  if (editingRow) {
    editingRow.classList.remove("editing");
  }
}

/* ---------- 11. EVENT HANDLERS ---------- */

// Runs when the user submits the form (adds a new transaction OR updates one)
function handleFormSubmit(event) {
  event.preventDefault(); // stop the page from reloading

  const result = validateForm();

  if (!result.isValid) {
    showMessage(result.message, "error");
    result.field.focus();
    return;
  }

  if (isEditing()) {
    // ----- UPDATE an existing transaction (saved inside updateTransaction) -----
    const wasUpdated = updateTransaction(transactionIdInput.value, result.data);

    if (!wasUpdated) {
      showMessage("This transaction no longer exists.", "error");
      exitEditMode();
      transactionForm.reset();
      updateUI();
      return;
    }

    exitEditMode(); // back to "Add Transaction" mode
    updateUI();
    transactionForm.reset();
    showMessage("Transaction updated successfully.", "success");
  } else {
    // ----- ADD a new transaction (saved inside addTransaction) -----
    addTransaction(result.data);
    updateUI();

    transactionForm.reset(); // clears the fields; type goes back to "Income"
    showMessage("Transaction added successfully.", "success");
  }
}

// Runs when the form is reset ("Clear Form" button or form.reset()).
// Clearing the form also cancels edit mode, so a cleared form can never overwrite a transaction.
function handleFormReset() {
  clearMessage();
  exitEditMode();
}

// Runs when the user clicks "Cancel Edit"
function handleCancelEdit() {
  exitEditMode();
  transactionForm.reset();
}

// One click listener for the whole table body ("event delegation").
// It works for rows that are created dynamically (including filtered rows).
function handleTransactionListClick(event) {
  // Find the button that was clicked (if any)
  const button = event.target.closest("button[data-id]");
  if (!button) {
    return;
  }

  const id = button.dataset.id;

  if (button.classList.contains("btn-edit")) {
    handleEdit(id);
  } else if (button.classList.contains("btn-delete")) {
    handleDelete(id);
  }
}

// Start editing the selected transaction
function handleEdit(id) {
  const transaction = findTransactionById(id);

  if (!transaction) {
    return;
  }

  enterEditMode(transaction);
}

// Delete the selected transaction after the user confirms
function handleDelete(id) {
  const transaction = findTransactionById(id);

  if (!transaction) {
    return;
  }

  const confirmed = window.confirm(
    'Delete "' + transaction.description + '"? This cannot be undone.'
  );

  if (!confirmed) {
    return; // user clicked Cancel
  }

  // If the transaction being deleted is the one in the form, leave edit mode first
  if (transactionIdInput.value === id) {
    exitEditMode();
    transactionForm.reset();
  }

  deleteTransaction(id); // removes it from the array and saves to Local Storage
  updateUI(); // redraws the list, updates totals, and shows the empty state if needed
  showMessage("Transaction deleted.", "success");
}

// Runs whenever the Type or Category filter changes.
// Only the list needs redrawing: the dashboard always shows totals for ALL transactions,
// and filtering never touches the saved data.
function handleFilterChange() {
  renderTransactions();
}

// Runs when the user clicks "Reset Filters"
function handleResetFilters() {
  filterTypeSelect.value = FILTER_ALL;     // back to "All Transactions"
  filterCategorySelect.value = FILTER_ALL; // back to "All Categories"
  renderTransactions();                    // show every transaction again
}

/* ---------- 12. INITIALISE THE APP ---------- */

function init() {
  // STAGE 4: Load any saved transactions BEFORE the first display.
  // (An empty array is used if nothing is saved or the saved data is broken.)
  transactions = loadTransactions();

  // Each event listener is added only once, here
  transactionForm.addEventListener("submit", handleFormSubmit);
  transactionForm.addEventListener("reset", handleFormReset);
  cancelEditButton.addEventListener("click", handleCancelEdit);
  transactionList.addEventListener("click", handleTransactionListClick);

  // Filter events ("change" fires as soon as the user picks a new option)
  filterTypeSelect.addEventListener("change", handleFilterChange);
  filterCategorySelect.addEventListener("change", handleFilterChange);
  clearFiltersButton.addEventListener("click", handleResetFilters);

  // Show the saved transactions, rebuild the category filter, and restore the totals.
  // With no saved data this shows the empty state and 0.00 totals.
  updateUI();
}

init();