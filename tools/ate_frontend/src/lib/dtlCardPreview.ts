/** Presentation matrix matching the DTL agent three-month recommendation table. */

export type DtlMonthKey = "2026-01" | "2026-02" | "2026-03";

export type DtlCardCell = {
  value: string;
  unit: string;
};

export type DtlCardRow = {
  parameter: string;
  /** Highlight rows whose recommended limit changes across months. */
  changesAcrossMonths: boolean;
  months: Record<DtlMonthKey, DtlCardCell>;
};

export const DTL_CARD_MONTHS: { key: DtlMonthKey; label: string }[] = [
  { key: "2026-01", label: "January 2026" },
  { key: "2026-02", label: "February 2026" },
  { key: "2026-03", label: "March 2026" },
];

function cell(value: string, unit: string): DtlCardCell {
  return { value, unit };
}

export const DTL_CARD_ROWS: DtlCardRow[] = [
  {
    parameter: "IR_DROP_MV",
    changesAcrossMonths: true,
    months: {
      "2026-01": cell("50", "mV"),
      "2026-02": cell("72", "mV"),
      "2026-03": cell("55", "mV"),
    },
  },
  {
    parameter: "THERMAL_C",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("92", "°C"),
      "2026-02": cell("92", "°C"),
      "2026-03": cell("92", "°C"),
    },
  },
  {
    parameter: "VMIN",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("1", "V"),
      "2026-02": cell("1", "V"),
      "2026-03": cell("1", "V"),
    },
  },
  {
    parameter: "VMAX",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("1.05", "V"),
      "2026-02": cell("1.05", "V"),
      "2026-03": cell("1.05", "V"),
    },
  },
  {
    parameter: "IDDQ",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("100", "uA"),
      "2026-02": cell("100", "uA"),
      "2026-03": cell("100", "uA"),
    },
  },
  {
    parameter: "SUPPLY_CURRENT",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("200", "mA"),
      "2026-02": cell("200", "mA"),
      "2026-03": cell("200", "mA"),
    },
  },
  {
    parameter: "CONTACT_RESISTANCE",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("10", "ohm"),
      "2026-02": cell("10", "ohm"),
      "2026-03": cell("10", "ohm"),
    },
  },
  {
    parameter: "INTERCONNECT_RESISTANCE",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("25", "ohm"),
      "2026-02": cell("25", "ohm"),
      "2026-03": cell("25", "ohm"),
    },
  },
  {
    parameter: "ON_RESISTANCE",
    changesAcrossMonths: false,
    months: {
      "2026-01": cell("50", "ohm"),
      "2026-02": cell("50", "ohm"),
      "2026-03": cell("50", "ohm"),
    },
  },
];

export function formatDtlCell(cellValue: DtlCardCell): string {
  return `${cellValue.value} ${cellValue.unit}`;
}
