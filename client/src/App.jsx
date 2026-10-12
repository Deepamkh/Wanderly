import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Intro from './components/Intro.jsx';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Explore from './pages/Explore.jsx';
import Destinations from './pages/Destinations.jsx';
import Planner from './pages/Planner.jsx';

export default function App() {
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);
  const { pathname, search } = useLocation();

  useEffect(() => window.scrollTo({ top: 0 }), [pathname, search]);

  return (
    <>
      <AnimatePresence>{!introDone && <Intro key="intro" onDone={finishIntro} />}</AnimatePresence>
      <div className={`app-shell ${introDone ? 'is-ready' : ''}`} aria-hidden={!introDone}>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home ready={introDone} />} />
          <Route path="/destinations" element={<Destinations />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="*" element={<Home ready={introDone} />} />
        </Routes>
      </div>
    </>
  );
}
