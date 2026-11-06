import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
} from "@uipath/apollo-wind/components/ui/alert";
import { Badge } from "@uipath/apollo-wind/components/ui/badge";
import { Button } from "@uipath/apollo-wind/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@uipath/apollo-wind/components/ui/card";
import { Spinner } from "@uipath/apollo-wind/components/ui/spinner";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ThemeToggle } from "./components/Theme";
import { AttachmentValue } from "./components/AttachmentValue";
import { TicketAnalytics } from "./components/TicketAnalytics";
import {
  asText,
  createTicket,
  fetchTicketData,
  formatAge,
  formatFieldLabel,
  getAgeDays,
  getCreatedAt,
  getFieldName,
  getRecordValue,
  isFileField,
  type TicketCreateInput,
  type TicketField,
  type TicketRecord,
} from "./data/tickets";
import { Entities } from "@uipath/uipath-typescript/entities";

const TABLE_PAGE_SIZE = 25;

type SortKey =
  | "subject"
  | "assignee"
  | "status"
  | "priority"
  | "category"
  | "age"
  | "created";
type SortDirection = "asc" | "desc";

const tableColumns: Array<{ key: SortKey; label: string }> = [
  { key: "subject", label: "Subject" },
  { key: "assignee", label: "Assignee" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "category", label: "Category" },
  { key: "age", label: "Age" },
];

const statusOptions = ["Open", "InProgress", "WaitingOnCustomer", "Escalated"];
const priorityOptions = ["Critical", "High", "Medium", "Low"];
const categoryOptions = [
  "Account",
  "Billing",
  "FeatureRequest",
  "Other",
  "Technical",
];
const delayReasonOptions = [
  "AwaitingApproval",
  "AwaitingCustomer",
  "AwaitingEngineering",
  "KnowledgeGap",
  "PendingRefundApproval",
];

const emptyTicketForm: TicketCreateInput = {
  subject: "",
  description: "",
  customerEmail: "",
  assignee: "",
  status: "Open",
  priority: "Medium",
  category: "Technical",
  reasonForDelay: "",
};

function isBlockedStatus(status: string): boolean {
  return status === "WaitingOnCustomer";
}

function statusVariant(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("closed") || normalized.includes("resolved"))
    return "success" as const;
  if (normalized.includes("waiting")) return "warning" as const;
  if (normalized.includes("progress")) return "info" as const;
  return "default" as const;
}

function priorityVariant(priority: string) {
  const normalized = priority.toLowerCase();
  if (normalized.includes("critical")) return "error" as const;
  if (normalized.includes("high")) return "warning" as const;
  if (normalized.includes("low")) return "secondary" as const;
  return "info" as const;
}

function compareTickets(
  a: TicketRecord,
  b: TicketRecord,
  key: SortKey,
  direction: SortDirection,
) {
  let left: string | number = "";
  let right: string | number = "";

  if (key === "age") {
    left = getAgeDays(a);
    right = getAgeDays(b);
  } else if (key === "created") {
    left = getCreatedAt(a)?.getTime() ?? 0;
    right = getCreatedAt(b)?.getTime() ?? 0;
  } else {
    left = asText(getRecordValue(a, key)).toLowerCase();
    right = asText(getRecordValue(b, key)).toLowerCase();
  }

  if (left < right) return direction === "asc" ? -1 : 1;
  if (left > right) return direction === "asc" ? 1 : -1;
  return 0;
}

function AppContent() {
  const {
    sdk,
    isAuthenticated,
    isLoading: authLoading,
    login,
    logout,
    error: authError,
  } = useAuth();
  const entities = useMemo(() => new Entities(sdk), [sdk]);
  const [records, setRecords] = useState<TicketRecord[]>([]);
  const [fields, setFields] = useState<TicketField[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TicketRecord | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<TicketCreateInput>(emptyTicketForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadTickets = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setDataError(null);
    try {
      const data = await fetchTicketData(entities);
      setRecords(data.records);
      setFields(data.schema.fields as TicketField[]);
      setPage(1);
      return true;
    } catch (err) {
      setDataError(
        err instanceof Error ? err.message : "Unable to load tickets",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, [entities]);

  const assigneeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          records
            .map((record) => asText(getRecordValue(record, "assignee")))
            .filter((assignee) => assignee !== "—"),
        ),
      ).sort(),
    [records],
  );

  const filterStatusOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...statusOptions,
          ...records
            .map((record) => asText(getRecordValue(record, "status")))
            .filter((status) => status !== "—"),
        ]),
      ).sort(),
    [records],
  );

  const openCreatePanel = () => {
    setCreateForm({ ...emptyTicketForm, assignee: assigneeOptions[0] ?? "" });
    setCreateError(null);
    setCreateSuccess(null);
    setIsCreateOpen(true);
  };

  const closeCreatePanel = () => {
    if (creating) return;
    setIsCreateOpen(false);
    setCreateError(null);
  };

  const updateCreateField = (field: keyof TicketCreateInput, value: string) => {
    setCreateForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreateTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    const requiredFields: Array<[string, string]> = [
      ["Subject", createForm.subject],
      ["Description", createForm.description],
      ["Customer email", createForm.customerEmail],
      ["Assignee", createForm.assignee],
      ["Priority", createForm.priority],
      ["Category", createForm.category],
    ];
    const missingField = requiredFields.find(([, value]) => !value.trim());
    if (missingField) {
      setCreateError(`${missingField[0]} is required.`);
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(createForm.customerEmail.trim())) {
      setCreateError("Enter a valid customer email address.");
      return;
    }
    if (
      isBlockedStatus(createForm.status) &&
      !createForm.reasonForDelay?.trim()
    ) {
      setCreateError(
        "Reason for delay is required when the ticket starts in a blocked state.",
      );
      return;
    }

    setCreating(true);
    try {
      const created = await createTicket(entities, fields, createForm);
      const refreshed = await loadTickets();
      if (!refreshed) {
        throw new Error(
          "Ticket was created, but the table could not be refreshed. Use Refresh to try again.",
        );
      }
      setCreateSuccess(
        `Ticket “${asText(getRecordValue(created, "subject"))}” created successfully.`,
      );
      setCreateForm({ ...emptyTicketForm, assignee: assigneeOptions[0] ?? "" });
      setIsCreateOpen(false);
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "Unable to create ticket. Check your connection and try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) void loadTickets();
  }, [isAuthenticated, loadTickets]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = records.filter((record) => {
      const searchableText = [
        "subject",
        "assignee",
        "status",
        "priority",
        "category",
      ]
        .map((fieldName) => asText(getRecordValue(record, fieldName)))
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      const matchesStatus =
        !statusFilter ||
        asText(getRecordValue(record, "status")) === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return [...filtered].sort((a, b) =>
      compareTickets(a, b, sortKey, sortDirection),
    );
  }, [records, search, sortDirection, sortKey, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / TABLE_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const visibleRecords = filteredRecords.slice(
    (safePage - 1) * TABLE_PAGE_SIZE,
    safePage * TABLE_PAGE_SIZE,
  );
  const updateSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "age" || key === "created" ? "desc" : "asc");
    }
    setPage(1);
  };

  if (authLoading) {
    return (
      <div className="auth-loading">
        <Spinner label="Initializing UiPath sign-in…" showLabel />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="sign-in-shell">
        <Card className="sign-in-card">
          <CardHeader className="sign-in-header">
            <div className="brand-mark">
              <ShieldCheck size={27} />
            </div>
            <CardTitle>Support operations, at a glance</CardTitle>
            <CardDescription>
              Sign in with your UiPath account to access your team’s live ticket
              queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="sign-in-content">
            {authError ? (
              <Alert variant="destructive">
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              onClick={() => void login()}
              size="lg"
              className="sign-in-button"
            >
              <ShieldCheck size={17} /> Sign in with UiPath
            </Button>
            <p className="security-note">
              <CheckCircle2 size={14} /> Secure OAuth access · Westcon Comstor
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-mark brand-mark-small">
            <ShieldCheck size={18} />
          </div>
          <div className="brand-copy">
            <strong>Support Desk</strong>
            <span>Westcon Comstor · Operations</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="live-indicator">
            <span className="live-dot" /> Live data
          </span>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut size={15} />
            <span className="button-label">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="page-intro">
          <div>
            <p className="eyebrow">TEAM WORKSPACE / TICKETS</p>
            <h1>Support tickets</h1>
            <p className="intro-copy">
              A focused view of every ticket currently being worked by your
              team.
            </p>
          </div>
          <div className="page-actions">
            <Button size="sm" onClick={openCreatePanel}>
              <Plus size={15} /> New ticket
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadTickets()}
              disabled={loading}
            >
              <RefreshCw className={loading ? "spin" : ""} size={15} /> Refresh
            </Button>
          </div>
        </section>

        {dataError ? (
          <Alert variant="destructive" className="data-alert">
            <AlertDescription>{dataError}</AlertDescription>
          </Alert>
        ) : null}
        {createSuccess ? (
          <Alert className="data-alert create-success">
            <AlertDescription>{createSuccess}</AlertDescription>
          </Alert>
        ) : null}

        <TicketAnalytics records={records} />

        <section className="table-card">
          <div className="table-toolbar">
            <div>
              <h2>All tickets</h2>
              <p>
                {sortKey === "created" && sortDirection === "desc"
                  ? "Newest first"
                  : `Sorted by ${formatFieldLabel(sortKey)} · ${sortDirection === "asc" ? "ascending" : "descending"}`}
              </p>
            </div>
            <div className="filter-controls">
              <label className="search-field">
                <Search size={16} />
                <span className="sr-only">
                  Search tickets by subject, assignee, status, priority, or
                  category
                </span>
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search tickets…"
                />
              </label>
              <label className="status-filter">
                <span className="sr-only">Filter tickets by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {filterStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatFieldLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="table-scroll">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th className="row-indicator" aria-label="Select" />
                  {tableColumns.map((column) => (
                    <SortableHeader
                      key={column.key}
                      column={column}
                      active={sortKey === column.key}
                      direction={sortDirection}
                      onSort={updateSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length + 1}
                      className="table-state"
                    >
                      <Spinner label="Loading tickets…" showLabel />
                    </td>
                  </tr>
                ) : null}
                {!loading && visibleRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length + 1}
                      className="table-state"
                    >
                      <Search size={22} />
                      <strong>No tickets found</strong>
                      <span>
                        {search || statusFilter
                          ? "Try a different search or status filter."
                          : "No tickets are available yet."}
                      </span>
                    </td>
                  </tr>
                ) : null}
                {!loading
                  ? visibleRecords.map((record) => (
                      <TicketRow
                        key={String(record.Id)}
                        record={record}
                        onClick={() => setSelected(record)}
                      />
                    ))
                  : null}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              Showing{" "}
              {filteredRecords.length
                ? (safePage - 1) * TABLE_PAGE_SIZE + 1
                : 0}
              –{Math.min(safePage * TABLE_PAGE_SIZE, filteredRecords.length)} of{" "}
              {filteredRecords.length}
            </span>
            <div className="pagination">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </Button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={safePage >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {selected ? (
        <TicketDetailPanel
          key={String(selected.Id)}
          selected={selected}
          fields={fields}
          entities={entities}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {isCreateOpen ? (
        <TicketCreatePanel
          form={createForm}
          assigneeOptions={assigneeOptions}
          creating={creating}
          error={createError}
          onChange={updateCreateField}
          onClose={closeCreatePanel}
          onSubmit={handleCreateTicket}
        />
      ) : null}
    </div>
  );
}

function TicketCreatePanel({
  form,
  assigneeOptions,
  creating,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  form: TicketCreateInput;
  assigneeOptions: string[];
  creating: boolean;
  error: string | null;
  onChange: (field: keyof TicketCreateInput, value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const blocked = isBlockedStatus(form.status);

  return (
    <div
      className="panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="detail-panel create-panel"
        aria-label="Create new ticket"
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">NEW TICKET</p>
            <h2>Create a ticket</h2>
            <span className="panel-subtitle">
              Add a ticket to the live support queue.
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={creating}
            aria-label="Close create ticket form"
          >
            <X size={18} />
          </Button>
        </div>
        <form className="create-form" onSubmit={onSubmit} noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="form-grid">
            <label className="form-field form-field-full">
              <span>
                Subject <em>*</em>
              </span>
              <input
                value={form.subject}
                onChange={(event) => onChange("subject", event.target.value)}
                placeholder="Short summary of the issue"
                required
                autoFocus
              />
            </label>
            <label className="form-field form-field-full">
              <span>
                Description <em>*</em>
              </span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  onChange("description", event.target.value)
                }
                placeholder="Describe the customer issue and relevant context"
                rows={4}
                required
              />
            </label>
            <label className="form-field form-field-full">
              <span>
                Customer email <em>*</em>
              </span>
              <input
                type="email"
                value={form.customerEmail}
                onChange={(event) =>
                  onChange("customerEmail", event.target.value)
                }
                placeholder="customer@example.com"
                required
              />
            </label>
            <label className="form-field">
              <span>
                Assignee <em>*</em>
              </span>
              <select
                value={form.assignee}
                onChange={(event) => onChange("assignee", event.target.value)}
                required
              >
                <option value="">Select an assignee</option>
                {assigneeOptions.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
              {!assigneeOptions.length ? (
                <small>No existing assignees found.</small>
              ) : null}
            </label>
            <label className="form-field">
              <span>Starting status</span>
              <select
                value={form.status}
                onChange={(event) => onChange("status", event.target.value)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatFieldLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>
                Priority <em>*</em>
              </span>
              <select
                value={form.priority}
                onChange={(event) => onChange("priority", event.target.value)}
                required
              >
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>
                Category <em>*</em>
              </span>
              <select
                value={form.category}
                onChange={(event) => onChange("category", event.target.value)}
                required
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {formatFieldLabel(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field form-field-full">
              <span>
                Reason for delay{" "}
                {blocked ? (
                  <em>*</em>
                ) : (
                  <small>(required only when blocked)</small>
                )}
              </span>
              <select
                value={form.reasonForDelay ?? ""}
                onChange={(event) =>
                  onChange("reasonForDelay", event.target.value)
                }
                required={blocked}
              >
                <option value="">
                  {blocked ? "Select a reason" : "Not blocked"}
                </option>
                {delayReasonOptions.map((reason) => (
                  <option key={reason} value={reason}>
                    {formatFieldLabel(reason)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="create-form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={creating || !assigneeOptions.length}
            >
              {creating ? (
                <Spinner label="Creating…" showLabel />
              ) : (
                "Create ticket"
              )}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function SortableHeader({
  column,
  active,
  direction,
  onSort,
}: {
  column: { key: SortKey; label: string };
  active: boolean;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th>
      <button
        className={`sort-button ${active ? "sort-active" : ""}`}
        onClick={() => onSort(column.key)}
      >
        {column.label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp size={13} />
          ) : (
            <ArrowDown size={13} />
          )
        ) : null}
      </button>
    </th>
  );
}

function TicketRow({
  record,
  onClick,
}: {
  record: TicketRecord;
  onClick: () => void;
}) {
  const subject = asText(getRecordValue(record, "subject"));
  const assignee = asText(getRecordValue(record, "assignee"));
  const status = asText(getRecordValue(record, "status"));
  const priority = asText(getRecordValue(record, "priority"));
  const category = asText(getRecordValue(record, "category"));
  return (
    <tr
      className="ticket-row"
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick();
      }}
    >
      <td className="row-indicator">
        <span className="row-chevron">›</span>
      </td>
      <td className="subject-cell">
        <span className="subject-title" title={subject}>
          {subject}
        </span>
        <span className="ticket-id">#{String(record.Id).slice(0, 8)}</span>
      </td>
      <td>
        <span className="assignee">
          <span className="avatar">
            <UserRound size={13} />
          </span>
          <span className="truncate" title={assignee}>
            {assignee}
          </span>
        </span>
      </td>
      <td>
        <Badge variant={statusVariant(status)}>
          {formatFieldLabel(status)}
        </Badge>
      </td>
      <td>
        <Badge variant={priorityVariant(priority)}>
          {formatFieldLabel(priority)}
        </Badge>
      </td>
      <td>
        <span className="category-text">{formatFieldLabel(category)}</span>
      </td>
      <td>
        <span className="age-text">{formatAge(record)}</span>
      </td>
    </tr>
  );
}

function TicketDetailPanel({
  selected,
  fields,
  entities,
  onClose,
}: {
  selected: TicketRecord;
  fields: TicketField[];
  entities: Entities;
  onClose: () => void;
}) {
  const [record, setRecord] = useState(selected);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void entities
      .getRecordById(
        "1401fd68-24d9-f111-91f2-6045bdd07952",
        String(selected.Id),
        { folderKey: "9d8a5316-e56a-4f6a-839f-a8526c6841fc" },
      )
      .then((detail) => {
        if (active) setRecord(detail);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Unable to load full ticket",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entities, selected.Id]);

  return (
    <div
      className="panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="detail-panel" aria-label="Ticket details">
        <div className="panel-header">
          <div>
            <p className="eyebrow">TICKET DETAIL</p>
            <h2 title={asText(getRecordValue(record, "subject"))}>
              {asText(getRecordValue(record, "subject"))}
            </h2>
            <span className="panel-ticket-id">#{String(record.Id)}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close ticket details"
          >
            <X size={18} />
          </Button>
        </div>
        <div className="panel-scroll">
          {loading ? (
            <div className="panel-loading">
              <Spinner label="Loading full ticket…" showLabel />
            </div>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="detail-grid">
            {fields.map((field) => {
              const fieldName = getFieldName(field);
              const value = getRecordValue(record, fieldName);
              if (isFileField(field) && value && record.Id)
                return (
                  <div className="detail-field" key={fieldName}>
                    <span>
                      {formatFieldLabel(field.displayName ?? fieldName)}
                    </span>
                    <AttachmentValue
                      entities={entities}
                      recordId={String(record.Id)}
                      fieldName={fieldName}
                      value={value}
                    />
                  </div>
                );
              return (
                <div className="detail-field" key={fieldName}>
                  <span>
                    {formatFieldLabel(field.displayName ?? fieldName)}
                  </span>
                  <strong title={asText(value)}>{asText(value)}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
