import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/transactions', label: 'Transactions' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/dashboard', label: 'Dashboard' },
];

export default function Nav() {
  return (
    <nav aria-label="Main navigation">
      <ul>
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to}>{link.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
