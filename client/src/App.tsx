import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header.js';
import Nav from './components/Nav.js';
import Budgets from './pages/Budgets.js';
import Dashboard from './pages/Dashboard.js';
import Transactions from './pages/Transactions.js';
import { ThemeProvider } from './theme.js';

export default function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <Header />
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </ThemeProvider>
  );
}
