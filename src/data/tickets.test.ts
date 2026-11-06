import { afterEach, describe, expect, it, vi } from "vitest";
import type { TicketField, TicketRecord } from "./tickets";
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
} from "./tickets";

function record(values: Record<string, unknown>): TicketRecord {
  return values as TicketRecord;
}

const ticketFields: TicketField[] = [
  "subject",
  "description",
  "customerEmail",
  "assignee",
  "status",
  "priority",
  "category",
  "reasonForDelay",
].map((name) => ({ id: name, name }));

afterEach(() => {
  vi.useRealTimers();
});

describe("ticket data helpers", () => {
  it("reads exact, PascalCase, and case-insensitive record fields", () => {
    expect(getRecordValue(record({ subject: "Exact" }), "subject")).toBe(
      "Exact",
    );
    expect(getRecordValue(record({ Subject: "Pascal" }), "subject")).toBe(
      "Pascal",
    );
    expect(getRecordValue(record({ SUBJECT: "Insensitive" }), "subject")).toBe(
      "Insensitive",
    );
    expect(getRecordValue(record({}), "subject")).toBeUndefined();
  });

  it("formats empty, file-like, and nested values for display", () => {
    expect(asText(null)).toBe("—");
    expect(asText({ name: "invoice.pdf" })).toBe("invoice.pdf");
    expect(asText({ id: "file-123" })).toBe("file-123");
    expect(asText({ contentType: "application/pdf" })).toBe(
      "Content Type: application/pdf",
    );
    expect(asText({ status: "Open", count: 2 })).toBe(
      "Status: Open · Count: 2",
    );
    expect(formatFieldLabel("WaitingOnCustomer")).toBe("Waiting On Customer");
  });

  it("recognizes file fields and resolves creation dates", () => {
    expect(
      isFileField({
        id: "attachment",
        name: "attachment",
        fieldDisplayType: "File",
      }),
    ).toBe(true);
    expect(
      isFileField({
        id: "attachment",
        name: "attachment",
        fieldDataType: { name: "FILE" },
      }),
    ).toBe(true);
    expect(
      isFileField({ id: "attachment", name: "attachment", isAttachment: true }),
    ).toBe(true);
    expect(isFileField({ id: "status", name: "status" })).toBe(false);
    expect(getFieldName({ id: "subject", name: "subject" })).toBe("subject");
    expect(getFieldName(undefined)).toBe("");
    expect(
      getCreatedAt(record({ OriginalCreatedTime: "2026-01-02T00:00:00Z" })),
    ).toEqual(new Date("2026-01-02T00:00:00Z"));
    expect(
      getCreatedAt(record({ CreateTime: "2026-01-03T00:00:00Z" })),
    ).toEqual(new Date("2026-01-03T00:00:00Z"));
    expect(getCreatedAt(record({}))).toBeNull();
    expect(getCreatedAt(record({ CreateTime: "not-a-date" }))).toBeNull();
  });

  it("formats ticket age for today, one day, older tickets, and invalid dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T00:00:00Z"));
    expect(
      getAgeDays(record({ OriginalCreatedTime: "2026-01-10T00:00:00Z" })),
    ).toBe(0);
    expect(
      formatAge(record({ OriginalCreatedTime: "2026-01-10T00:00:00Z" })),
    ).toBe("Today");
    expect(
      formatAge(record({ OriginalCreatedTime: "2026-01-09T00:00:00Z" })),
    ).toBe("1 day");
    expect(
      formatAge(record({ OriginalCreatedTime: "2026-01-01T00:00:00Z" })),
    ).toBe("9 days");
    expect(getAgeDays(record({ OriginalCreatedTime: "not-a-date" }))).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(formatAge(record({ OriginalCreatedTime: "not-a-date" }))).toBe("—");
  });

  it("fetches all ticket pages with the folder scope", async () => {
    const getById = vi.fn().mockResolvedValue({ fields: [] });
    const getAllRecords = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ Id: "1" }],
        hasNextPage: true,
        nextCursor: { value: "next-page" },
      })
      .mockResolvedValueOnce({ items: [{ Id: "2" }], hasNextPage: false });
    const data = await fetchTicketData({ getById, getAllRecords } as never);

    expect(data.records).toEqual([{ Id: "1" }, { Id: "2" }]);
    expect(getById).toHaveBeenCalledWith(
      "1401fd68-24d9-f111-91f2-6045bdd07952",
      {
        folderKey: "9d8a5316-e56a-4f6a-839f-a8526c6841fc",
      },
    );
    expect(getAllRecords).toHaveBeenNthCalledWith(
      2,
      "1401fd68-24d9-f111-91f2-6045bdd07952",
      {
        pageSize: 100,
        cursor: { value: "next-page" },
        folderKey: "9d8a5316-e56a-4f6a-839f-a8526c6841fc",
      },
    );
  });

  it("creates a trimmed ticket payload with the configured folder", async () => {
    const insertRecord = vi.fn().mockResolvedValue({ Id: "new-ticket" });
    const entities = { insertRecord } as never;
    const created = await createTicket(entities, ticketFields, {
      subject: "  Login issue  ",
      description: "  Cannot sign in  ",
      customerEmail: "customer@example.com",
      assignee: "Alex",
      status: "Open",
      priority: "High",
      category: "Technical",
      reasonForDelay: "AwaitingEngineering",
    });

    expect(created).toEqual({ Id: "new-ticket" });
    expect(insertRecord).toHaveBeenCalledWith(
      { id: "1401fd68-24d9-f111-91f2-6045bdd07952" },
      {
        subject: "Login issue",
        description: "Cannot sign in",
        customerEmail: "customer@example.com",
        assignee: "Alex",
        status: "Open",
        priority: "High",
        category: "Technical",
        reasonForDelay: "AwaitingEngineering",
      },
      { folderKey: "9d8a5316-e56a-4f6a-839f-a8526c6841fc" },
    );
  });

  it("omits a blank optional delay reason", async () => {
    const insertRecord = vi.fn().mockResolvedValue({ Id: "new-ticket" });
    await createTicket({ insertRecord } as never, ticketFields, {
      subject: "Subject",
      description: "Description",
      customerEmail: "customer@example.com",
      assignee: "Alex",
      status: "Open",
      priority: "High",
      category: "Technical",
      reasonForDelay: "   ",
    });

    expect(insertRecord.mock.calls[0][1]).not.toHaveProperty("reasonForDelay");
  });

  it("rejects a ticket schema without a required field", async () => {
    const entities = { insertRecord: vi.fn() } as never;
    await expect(
      createTicket(
        entities,
        ticketFields.filter((field) => field.name !== "priority"),
        {
          subject: "Subject",
          description: "Description",
          customerEmail: "customer@example.com",
          assignee: "Alex",
          status: "Open",
          priority: "High",
          category: "Technical",
        },
      ),
    ).rejects.toThrow("missing the 'priority' field");
  });
});
