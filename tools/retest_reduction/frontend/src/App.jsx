import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import { OverviewTab } from './tabs/OverviewTab';
import { SingleEventTab } from './tabs/SingleEventTab';
import { BatchInferenceTab } from './tabs/BatchInferenceTab';
import { HistoricalValidationTab } from './tabs/HistoricalValidationTab';
import { ReferenceAuditTab } from './tabs/ReferenceAuditTab';
import { getMonth12Batch, getHistoricalValidation, loadDemoAnalysis } from './services/api';

function isDemoMode() {
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('overview');
  const [costPerHour, setCostPerHour] = useState(350.0);
  
  // Theme state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('retest_ai_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('retest_ai_theme', theme);
  }, [theme]);

  // Data state
  const [dfM12, setDfM12] = useState([]);
  const [costImpact, setCostImpact] = useState(null);
  const [predictionSourceLabel, setPredictionSourceLabel] = useState('Month 12 (unseen inference)');
  const [activeOutcomes, setActiveOutcomes] = useState(null);
  const [outcomesLoaded, setOutcomesLoaded] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [histValidation, setHistValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demoError, setDemoError] = useState(null);

  // Initial load — demo datasets when ?demo=1, otherwise bundled Month 12 preview
  useEffect(() => {
    if (isDemoMode()) {
      setDemoError(null);
      loadDemoAnalysis(costPerHour)
        .then((res) => {
          setDfM12(res.records || []);
          setCostImpact(res.cost_impact);
          setPredictionSourceLabel(res.prediction_source_label || 'Demo pre-retest dataset');
          if (res.validation) {
            setValidationData(res.validation);
            setOutcomesLoaded(Boolean(res.outcomes_loaded));
          }
        })
        .catch((err) => {
          const message =
            err?.response?.data?.detail ||
            err?.message ||
            'Failed to load demo datasets';
          console.error(err);
          setDemoError(String(message));
        })
        .finally(() => setLoading(false));
      getHistoricalValidation()
        .then((res) => setHistValidation(res))
        .catch(console.error);
      return;
    }

    Promise.all([
      getMonth12Batch(costPerHour).then(res => {
        setDfM12(res.records || []);
        setCostImpact(res.cost_impact);
      }),
      getHistoricalValidation().then(res => {
        setHistValidation(res);
      }),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Recalculate cost impact when costPerHour changes
  useEffect(() => {
    if (dfM12 && dfM12.length > 0) {
      getMonth12Batch(costPerHour).then(res => {
        setCostImpact(res.cost_impact);
      }).catch(console.error);
    }
  }, [costPerHour]);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />

      <main style={{ flex: 1, height: '100vh', overflowY: 'auto', padding: '1.5rem 2rem 2rem 2rem' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          <TopHeader theme={theme} setTheme={setTheme} />

          {demoError && (
            <div
              role="alert"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--accent-red, #f87171)',
                background: 'rgba(248, 113, 113, 0.12)',
                color: 'var(--text-main, #f8fafc)',
                fontSize: '0.9rem',
              }}
            >
              Demo load failed: {demoError}
            </div>
          )}

          {loading && isDemoMode() && !demoError && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--accent-cyan, #22d3ee)',
                background: 'rgba(34, 211, 238, 0.08)',
                color: 'var(--text-main, #f8fafc)',
                fontSize: '0.9rem',
              }}
            >
              Loading demo datasets…
            </div>
          )}

          {currentPage === 'overview' && (
            <OverviewTab
              dfM12={dfM12}
              setDfM12={setDfM12}
              costImpact={costImpact}
              setCostImpact={setCostImpact}
              costPerHour={costPerHour}
              predictionSourceLabel={predictionSourceLabel}
              setPredictionSourceLabel={setPredictionSourceLabel}
              activeOutcomes={activeOutcomes}
              setActiveOutcomes={setActiveOutcomes}
              outcomesLoaded={outcomesLoaded}
              setOutcomesLoaded={setOutcomesLoaded}
              validationData={validationData}
              setValidationData={setValidationData}
              histValidation={histValidation}
            />
          )}

          {currentPage === 'single' && (
            <SingleEventTab costPerHour={costPerHour} />
          )}

          {currentPage === 'batch' && (
            <BatchInferenceTab dfM12={dfM12} costPerHour={costPerHour} />
          )}

          {currentPage === 'models' && (
            <HistoricalValidationTab histValidation={histValidation} />
          )}

          {currentPage === 'info' && (
            <ReferenceAuditTab costPerHour={costPerHour} setCostPerHour={setCostPerHour} mode="info" />
          )}

          {currentPage === 'settings' && (
            <ReferenceAuditTab costPerHour={costPerHour} setCostPerHour={setCostPerHour} mode="settings" />
          )}

          {currentPage === 'reference' && (
            <ReferenceAuditTab costPerHour={costPerHour} setCostPerHour={setCostPerHour} mode="audit" />
          )}
        </div>
      </main>
    </div>
  );
}
