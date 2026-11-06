import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TicketRecord } from "../data/tickets";
import { asText, getRecordValue } from "../data/tickets";

const SLA_DAYS: Record<string, number> = {
  critical: 1,
  high: 3,
  medium: 5,
  low: 7,
};

const STUCK_COLORS = [
  "#fb7185",
  "#f59e0b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#a78bfa",
];
const AGE_COLORS = ["#22c55e", "#84cc16", "#f59e0b", "#ef4444"];
const CHART_GRID = "color-mix(in srgb, #94a3b8 16%, transparent)";

interface TicketAnalyticsProps {
  records: TicketRecord[];
}

interface StuckReason {
  name: string;
  value: number;
}

interface WorkloadDatum {
  name: string;
  tickets: number;
  overloaded: boolean;
}

interface ResolutionDatum {
  name: string;
  minutes: number;
}

interface AgeDatum {
  name: string;
  tickets: number;
  fill: string;
}

function isOpen(record: TicketRecord): boolean {
  const status = asText(getRecordValue(record, "status")).toLowerCase();
  return status !== "closed" && status !== "resolved" && status !== "—";
}

function getAgeDaysFromOriginal(record: TicketRecord): number | null {
  const raw = getRecordValue(record, "OriginalCreatedTime");
  if (!raw) return null;
  const timestamp = new Date(String(raw)).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}

function getMinutes(record: TicketRecord): number | null {
  const raw = getRecordValue(record, "ResolutionMinutes");
  if (raw === null || raw === undefined || raw === "") return null;
  const minutes = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function formatDuration(minutes: number): string {
  if (minutes >= 1_440) return `${(minutes / 1_440).toFixed(1)}d`;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = Math.round(minutes % 60);
    return `${hours}h ${remainder}m`;
  }
  return `${Math.round(minutes)}m`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatTicketCountTooltip(value: unknown): [string, string] {
  return [`${String(value ?? 0)} tickets`, "Tickets"];
}

function formatOpenCountTooltip(value: unknown): [string, string] {
  return [`${String(value ?? 0)} open`, "Tickets"];
}

function formatAverageTooltip(value: unknown): [string, string] {
  return [formatDuration(Number(value ?? 0)), "Average"];
}

function ChartEmpty({ message }: { message: string }) {
  return <div className="analytics-empty">{message}</div>;
}

export function TicketAnalytics({ records }: TicketAnalyticsProps) {
  const openRecords = records.filter(isOpen);
  const totalOpen = openRecords.length;
  const slaBreaches = openRecords.filter((record) => {
    const priority = asText(getRecordValue(record, "priority")).toLowerCase();
    const threshold = SLA_DAYS[priority];
    const age = getAgeDaysFromOriginal(record);
    return threshold !== undefined && age !== null && age > threshold;
  }).length;
  const breachRate = totalOpen ? (slaBreaches / totalOpen) * 100 : 0;

  const resolutionValues = records
    .map(getMinutes)
    .filter((minutes): minutes is number => minutes !== null);
  const averageResolution = resolutionValues.length
    ? resolutionValues.reduce((sum, minutes) => sum + minutes, 0) /
      resolutionValues.length
    : 0;

  const stuckReasons = Array.from(
    openRecords.reduce((counts, record) => {
      const reason = asText(getRecordValue(record, "reasonForDelay"));
      if (reason !== "—") counts.set(reason, (counts.get(reason) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value) as StuckReason[];
  const topBlocker = stuckReasons[0];

  const workload = Array.from(
    openRecords.reduce((counts, record) => {
      const assignee = asText(getRecordValue(record, "assignee"));
      if (assignee !== "—")
        counts.set(assignee, (counts.get(assignee) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .map(([name, tickets]) => ({ name, tickets, overloaded: tickets > 25 }))
    .sort((a, b) => b.tickets - a.tickets)
    .slice(0, 8) as WorkloadDatum[];

  const categoryResolution = Array.from(
    records.reduce((groups, record) => {
      const minutes = getMinutes(record);
      const category = asText(getRecordValue(record, "category"));
      if (minutes !== null && category !== "—") {
        const group = groups.get(category) ?? [];
        group.push(minutes);
        groups.set(category, group);
      }
      return groups;
    }, new Map<string, number[]>()),
  )
    .map(([name, values]) => ({
      name,
      minutes: values.reduce((sum, value) => sum + value, 0) / values.length,
    }))
    .sort((a, b) => b.minutes - a.minutes) as ResolutionDatum[];
  const slowestCategory = categoryResolution[0]?.name;

  const ageBuckets = [
    { name: "<1d", tickets: 0, fill: AGE_COLORS[0] },
    { name: "1–3d", tickets: 0, fill: AGE_COLORS[1] },
    { name: "3–7d", tickets: 0, fill: AGE_COLORS[2] },
    { name: "7+d", tickets: 0, fill: AGE_COLORS[3] },
  ] as AgeDatum[];
  openRecords.forEach((record) => {
    const age = getAgeDaysFromOriginal(record);
    if (age === null) return;
    if (age < 1) ageBuckets[0].tickets += 1;
    else if (age < 3) ageBuckets[1].tickets += 1;
    else if (age < 7) ageBuckets[2].tickets += 1;
    else ageBuckets[3].tickets += 1;
  });

  return (
    <section className="analytics-layer" aria-label="Ticket analytics">
      <div className="analytics-kpi-grid">
        <article className="analytics-kpi-card">
          <span className="analytics-kpi-label">Total open tickets</span>
          <strong>{totalOpen.toLocaleString()}</strong>
          <small>Active backlog across the team</small>
        </article>
        <article
          className={`analytics-kpi-card ${slaBreaches ? "analytics-kpi-danger" : ""}`}
        >
          <span className="analytics-kpi-label">SLA breaches</span>
          <strong>{slaBreaches.toLocaleString()}</strong>
          <small>
            {formatPercent(breachRate)} of open · priority thresholds applied
          </small>
        </article>
        <article className="analytics-kpi-card">
          <span className="analytics-kpi-label">Avg resolution time</span>
          <strong>
            {averageResolution ? formatDuration(averageResolution) : "—"}
          </strong>
          <small>Based on {resolutionValues.length} recorded resolutions</small>
        </article>
      </div>

      <div className="analytics-grid">
        <article className="analytics-panel analytics-panel-stuck">
          <div className="analytics-panel-heading">
            <div>
              <p className="eyebrow analytics-eyebrow">BLOCKER ANALYSIS</p>
              <h2>Why tickets are stuck</h2>
              <p>Open tickets with a recorded reason for delay.</p>
            </div>
            {topBlocker ? (
              <div className="blocker-callout">
                <span>Top blocker</span>
                <strong>{formatFieldLabel(topBlocker.name)}</strong>
                <small>
                  {topBlocker.value} ticket{topBlocker.value === 1 ? "" : "s"}
                </small>
              </div>
            ) : null}
          </div>
          <div className="stuck-chart-layout">
            <div className="stuck-chart-wrap">
              {stuckReasons.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stuckReasons}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="82%"
                      paddingAngle={3}
                      stroke="none"
                    >
                      {stuckReasons.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={STUCK_COLORS[index % STUCK_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={formatTicketCountTooltip}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #334155",
                        background: "#111827",
                        color: "#f8fafc",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No delay reasons recorded for open tickets." />
              )}
            </div>
            <div className="stuck-legend">
              {stuckReasons.map((entry, index) => (
                <div className="legend-row" key={entry.name}>
                  <span
                    className="legend-swatch"
                    style={{
                      background: STUCK_COLORS[index % STUCK_COLORS.length],
                    }}
                  />
                  <span
                    className="legend-label"
                    title={formatFieldLabel(entry.name)}
                  >
                    {formatFieldLabel(entry.name)}
                  </span>
                  <strong>{entry.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="analytics-panel">
          <div className="analytics-panel-heading compact-heading">
            <div>
              <p className="eyebrow">WORKLOAD</p>
              <h2>Tickets per agent</h2>
            </div>
            <span className="analytics-caption">Top 8 open</span>
          </div>
          {workload.length ? (
            <div className="chart-area chart-area-agent">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={workload}
                  layout="vertical"
                  margin={{ top: 2, right: 38, left: 4, bottom: 2 }}
                >
                  <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={122}
                    tick={{
                      fill: "var(--color-muted-foreground)",
                      fontSize: 10,
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{
                      fill: "color-mix(in srgb, #64748b 9%, transparent)",
                    }}
                    formatter={formatOpenCountTooltip}
                  />
                  <Bar dataKey="tickets" radius={[0, 4, 4, 0]}>
                    {workload.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.overloaded ? "#fb7185" : "#6366f1"}
                      />
                    ))}
                    <LabelList
                      dataKey="tickets"
                      position="right"
                      fill="var(--color-foreground)"
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="No assigned open tickets." />
          )}
          <p className="chart-note">
            <span className="note-dot note-dot-danger" /> Red highlights agents
            above 25 open tickets.
          </p>
        </article>

        <article className="analytics-panel">
          <div className="analytics-panel-heading compact-heading">
            <div>
              <p className="eyebrow">EFFICIENCY</p>
              <h2>Avg resolution time per category</h2>
            </div>
            {slowestCategory ? (
              <span className="analytics-caption">
                Slowest: {formatFieldLabel(slowestCategory)}
              </span>
            ) : null}
          </div>
          {categoryResolution.length ? (
            <div className="chart-area chart-area-category">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryResolution}
                  layout="vertical"
                  margin={{ top: 2, right: 62, left: 4, bottom: 2 }}
                >
                  <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={104}
                    tickFormatter={formatFieldLabel}
                    tick={{
                      fill: "var(--color-muted-foreground)",
                      fontSize: 10,
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip formatter={formatAverageTooltip} />
                  <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                    {categoryResolution.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={index === 0 ? "#f59e0b" : "#0ea5e9"}
                      />
                    ))}
                    <LabelList
                      dataKey="minutes"
                      position="right"
                      fill="var(--color-foreground)"
                      fontSize={10}
                      formatter={(value: unknown) =>
                        formatDuration(Number(value))
                      }
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty message="No ResolutionMinutes values are available." />
          )}
        </article>

        <article className="analytics-panel analytics-panel-age">
          <div className="analytics-panel-heading compact-heading">
            <div>
              <p className="eyebrow">BACKLOG AGE</p>
              <h2>Tickets by age</h2>
            </div>
            <span className="analytics-caption">
              Open tickets · OriginalCreatedTime
            </span>
          </div>
          <div className="chart-area chart-area-age">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ageBuckets}
                margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
              >
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={24}
                />
                <Tooltip formatter={formatTicketCountTooltip} />
                <Bar dataKey="tickets" radius={[4, 4, 0, 0]}>
                  {ageBuckets.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="tickets"
                    position="top"
                    fill="var(--color-foreground)"
                    fontSize={10}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}

function formatFieldLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}
