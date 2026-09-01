const MS_PER_HOUR = 3_600_000;

function formatTestTime(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return "—";
  const n = Number(ms);
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
  if (n >= 1) return `${n.toFixed(2)} ms`;
  return `${n.toFixed(4)} ms`;
}

function formatUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const value = Number(n);
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatHours(h) {
  if (h == null || Number.isNaN(Number(h))) return "—";
  const n = Number(h);
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} h`;
}

function formatMb(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(2)} MB`;
}

function parseNonNeg(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export default function CostSavingsPanel({
  done,
  ateBurdenRate,
  diesPerYear,
  onAteBurdenRateChange,
  onDiesPerYearChange,
}) {
  const rate = parseNonNeg(ateBurdenRate, 0);
  const dies = parseNonNeg(diesPerYear, 0);

  const fullMs = Number(done?.full_ms) || 0;
  const lstmMs = Number(done?.lstm_ms) || 0;
  const savedMs = fullMs - lstmMs;
  const savedPct = fullMs > 0 ? (100 * savedMs) / fullMs : 0;
  const fullPeak = Number(done?.full_peak_mb) || 0;
  const lstmPeak = Number(done?.lstm_peak_mb) || 0;
  const savedMb =
    done?.saved_mb != null ? Number(done.saved_mb) : fullPeak - lstmPeak;
  const savedMbPct =
    done?.saved_pct != null
      ? Number(done.saved_pct)
      : fullPeak > 0
        ? (100 * savedMb) / fullPeak
        : 0;

  const fullHours = fullMs / MS_PER_HOUR;
  const lstmHours = lstmMs / MS_PER_HOUR;
  const hoursSaved = savedMs / MS_PER_HOUR;
  const perDieWithout = fullHours * rate;
  const perDieWith = lstmHours * rate;
  const savingsPerDie = hoursSaved * rate;
  const annualSavings = savingsPerDie * dies;
  const annualWithout = perDieWithout * dies;
  const annualWith = perDieWith * dies;
  const annualHoursWithout = fullHours * dies;
  const annualHoursWith = lstmHours * dies;
  const annualHoursSaved = hoursSaved * dies;

  return (
    <div className="layout">
      <aside className="panel">
        <div className="process-panel-tag cost">Cost savings</div>
        <h2>Cost prediction</h2>
        <p className="field-hint">
          Convert the last pre-process simulation into ATE cost. Savings per
          die = test time saved (hours) × burden rate. Annual = per-die × dies
          per year.
        </p>
        <div className="field">
          <label htmlFor="ate-burden-rate">ATE burden rate ($/hour)</label>
          <input
            id="ate-burden-rate"
            type="number"
            min="0"
            step="1"
            value={ateBurdenRate}
            onChange={(e) => onAteBurdenRateChange(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="dies-per-year">Dies per year</label>
          <input
            id="dies-per-year"
            type="number"
            min="0"
            step="1"
            value={diesPerYear}
            onChange={(e) => onDiesPerYearChange(e.target.value)}
          />
        </div>
        {!done && (
          <p className="field-hint warn">
            Run Pre-process (STIL → live simulation) first. These fields stay
            ready; the headline and tables fill from that result.
          </p>
        )}
      </aside>

      <main>
        {!done && (
          <div className="post-empty">
            <h2>Estimated annual savings</h2>
            <p>
              Cost savings uses the Verilumen agent&apos;s last pre-process
              result: baseline vs. kept-pattern test time and vector RAM.
            </p>
            <ol>
              <li>Open Pre-process and upload a STIL file</li>
              <li>Run live simulation until it completes</li>
              <li>Return here — annual $ updates as you change rate and volume</li>
            </ol>
            <p className="field-hint">
              Defaults: $200/hour burden rate and 1,000,000 dies per year.
            </p>
          </div>
        )}

        {done && (
          <>
            <div className="cost-headline">
              <div className="k">Estimated annual savings</div>
              <div className="amount">{formatUsd(annualSavings)}</div>
              <div className="sub">
                {formatUsd(savingsPerDie)} per die ×{" "}
                {dies.toLocaleString("en-US")} dies/year
                {" · "}
                {formatTestTime(savedMs)} test time cut
                {" · "}
                {formatMb(savedMb)} vector RAM
              </div>
            </div>

            <div className="metrics cost-metrics">
              <div className="metric highlight">
                <div className="k">Per-die savings</div>
                <div className="v">{formatUsd(savingsPerDie)}</div>
              </div>
              <div className="metric">
                <div className="k">Test time cut</div>
                <div className="v">
                  {formatTestTime(savedMs)}
                  <span className="v-sub"> ({savedPct.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="metric">
                <div className="k">Vector RAM saved</div>
                <div className="v">
                  {formatMb(savedMb)}
                  <span className="v-sub"> ({savedMbPct.toFixed(1)}%)</span>
                </div>
              </div>
            </div>

            <div className="cost-table-wrap">
              <h3>Per-die comparison</h3>
              <table className="fail-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Without agent</th>
                    <th>With agent</th>
                    <th>Savings</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Test time</td>
                    <td>{formatTestTime(fullMs)}</td>
                    <td>{formatTestTime(lstmMs)}</td>
                    <td className="save">{formatTestTime(savedMs)}</td>
                  </tr>
                  <tr>
                    <td>Vector RAM</td>
                    <td>{formatMb(fullPeak)}</td>
                    <td>{formatMb(lstmPeak)}</td>
                    <td className="save">{formatMb(savedMb)}</td>
                  </tr>
                  <tr>
                    <td>Cost</td>
                    <td>{formatUsd(perDieWithout)}</td>
                    <td>{formatUsd(perDieWith)}</td>
                    <td className="save">{formatUsd(savingsPerDie)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="cost-table-wrap">
              <h3>Annual comparison</h3>
              <table className="fail-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Without agent</th>
                    <th>With agent</th>
                    <th>Savings</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Test hours</td>
                    <td>{formatHours(annualHoursWithout)}</td>
                    <td>{formatHours(annualHoursWith)}</td>
                    <td className="save">{formatHours(annualHoursSaved)}</td>
                  </tr>
                  <tr>
                    <td>Cost</td>
                    <td>{formatUsd(annualWithout)}</td>
                    <td>{formatUsd(annualWith)}</td>
                    <td className="save">{formatUsd(annualSavings)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
