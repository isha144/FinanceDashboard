// Global variables
const form = document.getElementById('transactionForm');
const totalBalanceEl = document.getElementById('totalBalance');
const monthlyIncomeEl = document.getElementById('monthlyIncome');
const monthlyExpensesEl = document.getElementById('monthlyExpenses');
const investmentValueEl = document.getElementById('investmentValue');
const tableBody = document.getElementById('transactionTableBody');
const filterCategoryEl = document.getElementById('filterCategory');

// NEW: Select the date input and month filter elements
const dateInputEl = document.getElementById('date');
const filterMonthEl = document.getElementById('filterMonth'); 
const formErrorEl = document.getElementById('formError');

let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let chartInstances = {};

// Helper function to format currency (Updated for INR)
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
};

// --- CORE DATA AND SUMMARY FUNCTIONS ---

const saveTransactions = () => {
    localStorage.setItem('transactions', JSON.stringify(transactions));
};

/**
 * Calculates summary data from transactions, filtered by month.
 * @param {string} filterMonthYear - Month and Year string (e.g., "Oct 2025") or 'all'.
 */
const calculateSummary = (filterMonthYear = 'all') => {
    let monthlyIncome = 0;
    let monthlyExpenses = 0;
    let investmentValue = 0;

    // FILTER TRANSACTIONS: Only transactions for the selected month are used for monthly totals 
    const transactionsToCalculate = transactions.filter(t => {
        if (filterMonthYear === 'all') return true;
        const tMonthYear = new Date(t.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        return tMonthYear === filterMonthYear;
    });

    // Calculate totals for the filtered subset
    transactionsToCalculate.forEach(t => {
        const amount = parseFloat(t.amount);
        if (t.type === 'income') {
            monthlyIncome += amount;
        } else if (t.type === 'expense') {
            monthlyExpenses += amount;
        } else if (t.type === 'investment') {
            investmentValue += amount;
        }
    });
    
    // Calculate the TRUE running total balance across all time (used for the main card)
    const grandTotal = transactions.reduce((acc, t) => {
        const amount = parseFloat(t.amount);
        if (t.type === 'income') return acc + amount;
        if (t.type === 'expense' || t.type === 'investment') return acc - amount;
        return acc;
    }, 0);

    return { totalBalance: grandTotal, monthlyIncome, monthlyExpenses, investmentValue };
};


/**
 * Updates all Dashboard Summary Cards based on the selected month.
 */
const updateSummaryCards = () => {
    const selectedMonth = filterMonthEl.value;
    
    // Calculate stats based on the selected filter
    const { totalBalance, monthlyIncome, monthlyExpenses, investmentValue } = calculateSummary(selectedMonth);

    // Update text elements
    totalBalanceEl.textContent = formatCurrency(totalBalance); // Grand total (always accurate)
    monthlyIncomeEl.textContent = formatCurrency(monthlyIncome); 
    monthlyExpensesEl.textContent = formatCurrency(monthlyExpenses); 
    investmentValueEl.textContent = formatCurrency(investmentValue); 
};

// ... (renderTransactionHistory function remains as last updated) ...
const renderTransactionHistory = (filterCategory = 'all', filterMonthYear = 'all') => {
    tableBody.innerHTML = '';
    
    let filteredTransactions = transactions
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filterCategory !== 'all') {
        filteredTransactions = filteredTransactions.filter(t => t.category === filterCategory);
    }
    
    if (filterMonthYear !== 'all') {
        filteredTransactions = filteredTransactions.filter(t => {
            const tMonthYear = new Date(t.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
            return tMonthYear === filterMonthYear;
        });
    }
    
    filteredTransactions.forEach(t => {
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${t.date}</td>
            <td>${t.description}</td>
            <td>${t.category}</td>
            <td class="${t.type === 'expense' ? 'expense' : 'income'}">${formatCurrency(t.amount)}</td>
            <td>${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</td>
            <td><button class="delete-btn" data-id="${t.id}">Delete</button></td>
        `;
    });

    // Add event listeners for delete buttons
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const idToDelete = parseInt(e.target.getAttribute('data-id'));
            transactions = transactions.filter(t => t.id !== idToDelete);
            saveTransactions();
            updateApp();
        });
    });
};


/* Populates the category and month filter dropdowns. */
const populateFilterDropdown = () => {
    // Category Filter Logic
    const categories = new Set(transactions.map(t => t.category));
    filterCategoryEl.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        filterCategoryEl.appendChild(option);
    });
    
    // Month Filter Logic 
    const monthYears = new Set(transactions.map(t => 
        new Date(t.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    ));
    
    filterMonthEl.innerHTML = '<option value="all">All Time</option>';
    
    const sortedMonths = Array.from(monthYears).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB - dateA; 
    });
    
    sortedMonths.forEach(monthYear => {
        const option = document.createElement('option');
        option.value = monthYear;
        option.textContent = monthYear;
        filterMonthEl.appendChild(option);
    });
};

// --- CHART.JS INTEGRATION ---

/**
 * Generates structured data required for Chart.js visualizations.
 * This function processes the array of transactions passed to it.
 */
const generateChartData = (txns) => {
    const expenseCategories = {};
    const monthlyData = {};

    txns.forEach(t => {
        const monthYear = new Date(t.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        
        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { income: 0, expense: 0 };
        }

        const amount = parseFloat(t.amount);

        if (t.type === 'expense') {
            expenseCategories[t.category] = (expenseCategories[t.category] || 0) + amount;
            monthlyData[monthYear].expense += amount;
        } else if (t.type === 'income') {
            monthlyData[monthYear].income += amount;
        }
    });

    // Sort months chronologically for the Line Chart
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateA - dateB;
    });

    const monthlyLabels = sortedMonths;
    const expenseData = sortedMonths.map(month => monthlyData[month].expense);
    const incomeData = sortedMonths.map(month => monthlyData[month].income);

    return { 
        expenseData: { categories: expenseCategories, monthly: expenseData },
        incomeData: incomeData, 
        monthlyLabels: monthlyLabels 
    };
};

/* Clears and initializes Chart.js instances, filtering Pie/Bar charts by month. */
const initCharts = () => {
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const selectedMonth = filterMonthEl.value;

    // Filter transactions for month-specific charts (Pie/Bar)
    const filteredMonthlyTxns = transactions.filter(t => {
        if (selectedMonth === 'all') return true; // Show aggregate for Pie/Bar if 'All Time' is selected
        const tMonthYear = new Date(t.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        return tMonthYear === selectedMonth;
    });

    // --- Data Generation ---
    const { expenseData: monthlyExpenseData } = generateChartData(filteredMonthlyTxns);
    const allHistoricalData = generateChartData(transactions); // Always use ALL for trend lines

    // 1. Expense Breakdown by Categories (Pie Chart) - MONTHLY VIEW
    const pieCtx = document.getElementById('expensePieChart').getContext('2d');
    chartInstances.expensePie = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(monthlyExpenseData.categories), 
            datasets: [{
                data: Object.values(monthlyExpenseData.categories),
                backgroundColor: [
                    '#dc3545', '#ffc107', '#20c997', '#6f42c1', '#fd7e14', '#e83e8c'
                ],
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: false }
            }
        }
    });

    // 2. Income vs Expenses Comparison (Bar Chart) - MONTHLY VIEW
    const { monthlyIncome, monthlyExpenses } = calculateSummary(selectedMonth); 

    const barCtx = document.getElementById('incomeVsExpensesBarChart').getContext('2d');
    chartInstances.incomeBar = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: ['Income', 'Expenses'],
            datasets: [{
                label: 'Total',
                data: [monthlyIncome, monthlyExpenses], 
                backgroundColor: ['#28a745', '#dc3545'],
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } },
            plugins: {
                legend: { display: false },
                title: { display: false }
            }
        }
    });

    // 3. Monthly Spending Trends (Line Chart) - HISTORICAL VIEW
    const lineCtx = document.getElementById('spendingTrendsLineChart').getContext('2d');
    chartInstances.spendingLine = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: allHistoricalData.monthlyLabels,
            datasets: [
                {
                    label: 'Income',
                    data: allHistoricalData.incomeData,
                    borderColor: '#28a745',
                    tension: 0.3
                },
                {
                    label: 'Expenses',
                    data: allHistoricalData.expenseData.monthly,
                    borderColor: '#dc3545',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } },
            plugins: { title: { display: false } }
        }
    });
};

// --- EVENT HANDLERS ---

/* Handles the transaction form submission.*/
const handleTransactionSubmit = (e) => {
    e.preventDefault();

    const type = document.getElementById('type').value;
    const description = document.getElementById('description').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const category = document.getElementById('category').value;
    const selectedDate = dateInputEl.value; 

    formErrorEl.textContent = '';
    if (!selectedDate || !description || isNaN(amount) || amount <= 0) {
        formErrorEl.textContent = 'Please fill out all fields correctly.';
        return;
    }

    const newTransaction = {
        id: Date.now(),
        type,
        description,
        amount: amount.toFixed(2),
        category,
        date: selectedDate
    };

    transactions.push(newTransaction);
    saveTransactions();
    updateApp();
    form.reset();
    
    // Reset default date after submission
    const today = new Date().toISOString().split('T')[0];
    dateInputEl.value = today;
};

/**
 * Handles filtering the transaction history table and updating summary cards/charts.
 */
const handleFilterChange = () => {
    const selectedCategory = filterCategoryEl.value;
    const selectedMonth = filterMonthEl.value; 
    
    updateSummaryCards(); 
    renderTransactionHistory(selectedCategory, selectedMonth); 
    initCharts(); //  This redraws the Pie and Bar charts based on the selected month
};

/**
 * The main function to update the entire application state.
 */
const updateApp = () => {
    updateSummaryCards();
    renderTransactionHistory();
    populateFilterDropdown();
    initCharts(); // Called on load
};

// --- INITIALIZATION ---

form.addEventListener('submit', handleTransactionSubmit);
filterCategoryEl.addEventListener('change', handleFilterChange);
filterMonthEl.addEventListener('change', handleFilterChange); // Listen to new month filter

const clearDataBtn = document.getElementById('clearDataBtn');
const toastEl = document.getElementById('toast');

/**
 * Shows a toast notification with given message for a short duration.
 * @param {string} message - The message to display in the toast.
 */
const showToast = (message) => {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
};

/**
 * Updates the clear data button's disabled state based on transactions availability.
 */
const updateClearDataBtnState = () => {
    clearDataBtn.disabled = transactions.length === 0;
};

clearDataBtn.addEventListener('click', () => {
    if (transactions.length === 0) {
        showToast('No data to clear.');
        return;
    }
    if (confirm('Are you absolutely sure you want to clear all saved transactions? This action cannot be undone.')) {
        transactions = [];
        saveTransactions();

        // Reset filters to default "all"
        filterCategoryEl.value = 'all';
        filterMonthEl.value = 'all';

        updateApp();
        updateClearDataBtnState();
        showToast('All transactions have been cleared.');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today's date
    const today = new Date().toISOString().split('T')[0];
    dateInputEl.value = today;
    
    updateApp();
});

document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today's date
    const today = new Date().toISOString().split('T')[0];
    dateInputEl.value = today;
    
    updateApp();
});
