import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Intro from './components/Intro.jsx';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Explore from './pages/Explore.jsx';
import Destinations from './pages/Destinations.jsx';
import Planner from './pages/Planner.jsx';

// The intro plays once per browser: on the first visit, and only when that visit lands on the home page.
// Add ?intro=1 to the URL to see it again.
const INTRO_KEY = 'wanderly:intro-seen';

function shouldPlayIntro() {
  const { pathname, search } = window.location;
  if (new URLSearchParams(search).get('intro') === '1') return true;
  if (pathname !== '/') return false;
  try {
    return !localStorage.getItem(INTRO_KEY);
  } catch {
    return false; // storage blocked (private mode etc.) → don't risk replaying on every load
  }
}

export default function App() {
  const [introDone, setIntroDone] = useState(() => !shouldPlayIntro());
  const finishIntro = useCallback(() => setIntroDone(true), []);

  // Remember as soon as it starts, so a refresh mid-animation doesn't replay it either.
  useEffect(() => {
    if (introDone) return;
    try {
      localStorage.setItem(INTRO_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
