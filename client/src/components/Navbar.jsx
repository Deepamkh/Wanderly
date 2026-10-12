import { NavLink, Link } from 'react-router-dom';
import { Compass, Sparkles } from 'lucide-react';
import Logo from './Logo.jsx';

export default function Navbar() {
  return (
    <header className="nav">
      <Link to="/" className="brand" aria-label="Wanderly home">
        <Logo size={36} />
        <span>Wanderly</span>
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end><Compass size={17} /> <span>Explore</span></NavLink>
        <NavLink to="/planner" className="nav-cta"><Sparkles size={17} /> <span>AI Trip Planner</span></NavLink>
      </nav>
    </header>
  );
}
