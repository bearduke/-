import { createHashRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import InterestCalc from './pages/InterestCalc';
import Distribution from './pages/Distribution';
import Cases from './pages/Cases';
import LegalRef from './pages/LegalRef';

export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'calculate', element: <InterestCalc /> },
      { path: 'distribution', element: <Distribution /> },
      { path: 'cases', element: <Cases /> },
      { path: 'legal', element: <LegalRef /> },
    ],
  },
]);
