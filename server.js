// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Import cors

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'public/expenses.json');
const TODO_DATA_FILE = path.join(__dirname, 'public/todos.json'); // New todo list data file

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());

// Helper function to read expenses from the JSON file
const readExpenses = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist or is empty/corrupt, return an empty array
        return [];
    }
};

// Helper function to write expenses to the JSON file
const writeExpenses = (expenses) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(expenses, null, 2), 'utf8');
};

// New helper function to read todos from the JSON file
const readTodos = () => {
    try {
        const data = fs.readFileSync(TODO_DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist or is empty/corrupt, return an empty array
        return [];
    }
};

// New helper function to write todos to the JSON file
const writeTodos = (todos) => {
    fs.writeFileSync(TODO_DATA_FILE, JSON.stringify(todos, null, 2), 'utf8');
};


// Ensure the data files exist on startup
if (!fs.existsSync(DATA_FILE)) {
    writeExpenses([]);
}
if (!fs.existsSync(TODO_DATA_FILE)) {
    writeTodos([]); // Initialize new todo list file
}

// API Endpoints

// 1. Get all expenses
app.get('/expenses', (req, res) => {
    const expenses = readExpenses();
    res.json(expenses);
});

// 2. Create a new expense
app.post('/expenses', (req, res) => {
    const expenses = readExpenses();
    const newExpense = {
        id: Date.now().toString(), // Simple unique ID
        date: req.body.date, // YYYY-MM-DD format expected
        amount: parseFloat(req.body.amount),
        category: req.body.category,
        description: req.body.description,
        notes: req.body.notes || ''
    };

    if (!newExpense.date || isNaN(newExpense.amount) || !newExpense.category) {
        return res.status(400).json({ message: 'Date, amount, and category are required.' });
    }

    expenses.push(newExpense);
    writeExpenses(expenses);
    res.status(201).json(newExpense);
});

// 3. Get a single expense by ID
app.get('/expenses/:id', (req, res) => {
    const expenses = readExpenses();
    const expense = expenses.find(exp => exp.id === req.params.id);
    if (expense) {
        res.json(expense);
    } else {
        res.status(404).json({ message: 'Expense not found' });
    }
});

// 4. Modify an expense
app.put('/expenses/:id', (req, res) => {
    const expenses = readExpenses();
    const index = expenses.findIndex(exp => exp.id === req.params.id);

    if (index !== -1) {
        const updatedExpense = {
            ...expenses[index],
            date: req.body.date || expenses[index].date,
            amount: req.body.amount !== undefined ? parseFloat(req.body.amount) : expenses[index].amount,
            category: req.body.category || expenses[index].category,
            description: req.body.description || expenses[index].description,
            notes: req.body.notes !== undefined ? req.body.notes : expenses[index].notes
        };

        if (isNaN(updatedExpense.amount)) {
            return res.status(400).json({ message: 'Invalid amount provided.' });
        }

        expenses[index] = updatedExpense;
        writeExpenses(expenses);
        res.json(updatedExpense);
    } else {
        res.status(404).json({ message: 'Expense not found' });
    }
});

// 5. Delete an expense
app.delete('/expenses/:id', (req, res) => {
    let expenses = readExpenses();
    const initialLength = expenses.length;
    expenses = expenses.filter(exp => exp.id !== req.params.id);

    if (expenses.length < initialLength) {
        writeExpenses(expenses);
        res.status(204).send(); // No Content
    } else {
        res.status(404).json({ message: 'Expense not found' });
    }
});

// 6. Get monthly report page
app.get('/reports/monthly', (req, res) => {
    const expenses = readExpenses();
    const monthlyReport = {};

    expenses.forEach(exp => {
        const date = new Date(exp.date);
        const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        if (!monthlyReport[yearMonth]) {
            monthlyReport[yearMonth] = { total: 0, categories: {} };
        }
        monthlyReport[yearMonth].total += exp.amount;
        if (!monthlyReport[yearMonth].categories[exp.category]) {
            monthlyReport[yearMonth].categories[exp.category] = 0;
        }
        monthlyReport[yearMonth].categories[exp.category] += exp.amount;
    });

    // Sort by yearMonth
    const sortedReport = Object.keys(monthlyReport).sort().reduce(
        (obj, key) => {
            obj[key] = monthlyReport[key];
            return obj;
        }, {}
    );

    res.json(sortedReport);
});

// 7. Ability to compare monthly expenses with details
app.get('/reports/compare', (req, res) => {
    const { month1, month2 } = req.query; // e.g., month1=2023-01, month2=2023-02
    if (!month1 || !month2) {
        return res.status(400).json({ message: 'Please provide two months for comparison (e.g., ?month1=YYYY-MM&month2=YYYY-MM)' });
    }

    const expenses = readExpenses();
    const comparisonData = {};

    [month1, month2].forEach(month => {
        comparisonData[month] = {
            total: 0,
            categories: {},
            details: [] // To store individual expenses for the month
        };
    });

    expenses.forEach(exp => {
        const date = new Date(exp.date);
        const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        if (yearMonth === month1 || yearMonth === month2) {
            const currentMonthData = comparisonData[yearMonth];
            if (currentMonthData) {
                currentMonthData.total += exp.amount;
                if (!currentMonthData.categories[exp.category]) {
                    currentMonthData.categories[exp.category] = 0;
                }
                currentMonthData.categories[exp.category] += exp.amount;
                currentMonthData.details.push(exp); // Add the expense detail
            }
        }
    });

    res.json(comparisonData);
});

// 8. Get recurring expenses for the last N months (from actual expenses)
app.get('/reports/recurring', (req, res) => {
    const { months: numMonthsParam } = req.query;
    const numMonths = parseInt(numMonthsParam || '3', 10); // Default to last 3 months

    if (isNaN(numMonths) || numMonths <= 0) {
        return res.status(400).json({ message: 'Invalid number of months specified.' });
    }

    const expenses = readExpenses();
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - numMonths, 1); // Start of the month N months ago

    // Filter expenses for the last N months
    const recentExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= cutoffDate && expDate <= now;
    });

    // Group expenses by a unique key (description + category + amount)
    // and track which months they appeared in
    const expenseOccurrences = {}; // Key: "desc|cat|amount", Value: { expense: Expense, months: Set<string> }

    recentExpenses.forEach(exp => {
        const key = `${exp.description}|${exp.category}|${exp.amount}`;
        const date = new Date(exp.date);
        const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        if (!expenseOccurrences[key]) {
            expenseOccurrences[key] = { expense: { ...exp, id: undefined, date: undefined, notes: undefined }, months: new Set() };
            // Store a generic recurring expense template, removing date, id, notes
        }
        expenseOccurrences[key].months.add(yearMonth);
    });

    // Identify recurring expenses (appeared in at least 2 distinct months)
    const recurringExpenses = Object.values(expenseOccurrences).filter(item => item.months.size >= 2);

    // Map to a cleaner output format
    const result = recurringExpenses.map(item => ({
        description: item.expense.description,
        category: item.expense.category,
        amount: item.expense.amount,
        // You might want to include the months they appeared in for debugging/info
        // appearedInMonths: Array.from(item.months).sort()
    }));

    res.json(result);
});

// 9. Get unique expense tags from last N months
app.get('/tags', (req, res) => {
    const { months: numMonthsParam } = req.query;
    const numMonths = parseInt(numMonthsParam || '2', 10); // Default to last 2 months

    if (isNaN(numMonths) || numMonths <= 0) {
        return res.status(400).json({ message: 'Invalid number of months specified.' });
    }

    const expenses = readExpenses();
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - numMonths, 1); // Start of the month N months ago

    const recentExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= cutoffDate && expDate <= now;
    });

    const uniqueTags = new Map(); // Key: "description|category|amount", Value: { description, category, amount }

    recentExpenses.forEach(exp => {
        const key = `${exp.description}|${exp.category}|${exp.amount}`;
        if (!uniqueTags.has(key)) {
            uniqueTags.set(key, {
                description: exp.description,
                category: exp.category,
                amount: exp.amount
            });
        }
    });

    res.json(Array.from(uniqueTags.values()));
});

// New API Endpoints for Todo List Management

// 14. Get all todos
app.get('/todos', (req, res) => {
    const todos = readTodos();
    res.json(todos);
});

// 15. Add a new todo
app.post('/todos', (req, res) => {
    const todos = readTodos();
    const newTodo = {
        id: Date.now().toString(),
        text: req.body.text,
        completed: req.body.completed || false,
        createdAt: new Date().toISOString() // Store as ISO string
    };

    if (!newTodo.text) {
        return res.status(400).json({ message: 'Todo text is required.' });
    }

    todos.push(newTodo);
    writeTodos(todos);
    res.status(201).json(newTodo);
});

// 16. Update a todo
app.put('/todos/:id', (req, res) => {
    const todos = readTodos();
    const index = todos.findIndex(todo => todo.id === req.params.id);

    if (index !== -1) {
        const updatedTodo = {
            ...todos[index],
            text: req.body.text !== undefined ? req.body.text : todos[index].text,
            completed: req.body.completed !== undefined ? req.body.completed : todos[index].completed
        };
        todos[index] = updatedTodo;
        writeTodos(todos);
        res.json(updatedTodo);
    } else {
        res.status(404).json({ message: 'Todo not found' });
    }
});

// 17. Delete a todo
app.delete('/todos/:id', (req, res) => {
    let todos = readTodos();
    const initialLength = todos.length;
    todos = todos.filter(todo => todo.id !== req.params.id);

    if (todos.length < initialLength) {
        writeTodos(todos);
        res.status(204).send(); // No Content
    } else {
        res.status(404).json({ message: 'Todo not found' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Expenses data stored in: ${DATA_FILE}`);
    console.log(`Todo list data stored in: ${TODO_DATA_FILE}`);
});
