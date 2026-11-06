import type { Entities } from "@uipath/uipath-typescript/entities";
import type {
  EntityGetResponse,
  EntityRecord,
} from "@uipath/uipath-typescript/entities";

export const TICKETS_ENTITY_ID = "1401fd68-24d9-f111-91f2-6045bdd07952";
export const TICKETS_FOLDER_KEY = "9d8a5316-e56a-4f6a-839f-a8526c6841fc";
export const PAGE_SIZE = 100;

export type TicketRecord = EntityRecord;

export interface TicketField {
  id: string;
  name: string;
  displayName?: string;
  fieldDisplayType?: string;
  fieldDataType?: { name?: string };
  isSystemField?: boolean;
  isAttachment?: boolean;
}

export interface TicketData {
  schema: EntityGetResponse;
  records: TicketRecord[];
}

export interface TicketCreateInput {
  subject: string;
  description: string;
  customerEmail: string;
  assignee: string;
  status: string;
  priority: string;
  category: string;
  reasonForDelay?: string;
}

type PaginatedTicketPage = {
  items: TicketRecord[];
  hasNextPage: boolean;
  nextCursor?: { value: string };
};

export function getRecordValue(
  record: TicketRecord,
  fieldName: string,
): unknown {
  if (fieldName in record) return record[fieldName];
  const pascalName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  if (pascalName in record) return record[pascalName];
  const match = Object.keys(record).find(
    (key) => key.toLowerCase() === fieldName.toLowerCase(),
  );
  return match ? record[match] : undefined;
}

export function getFieldName(field: TicketField | undefined): string {
  return field?.name ?? "";
}

export function isFileField(field: TicketField | undefined): boolean {
  return (
    field?.fieldDisplayType === "File" ||
    field?.fieldDataType?.name === "FILE" ||
    field?.isAttachment === true
  );
}

export function asText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const file = value as { name?: string; id?: string; contentType?: string };
    if (file.name || file.id) return file.name ?? file.id ?? "Attached file";
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${formatFieldLabel(key)}: ${asText(entry)}`)
      .join(" · ");
  }
  return String(value);
}

export function formatFieldLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

export function getCreatedAt(record: TicketRecord): Date | null {
  const raw =
    getRecordValue(record, "OriginalCreatedTime") ??
    getRecordValue(record, "CreateTime");
  if (!raw) return null;
  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getAgeDays(record: TicketRecord): number {
  const createdAt = getCreatedAt(record);
  if (!createdAt) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / 86_400_000),
  );
}

export function formatAge(record: TicketRecord): string {
  const days = getAgeDays(record);
  if (!Number.isFinite(days)) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export async function fetchTicketData(entities: Entities): Promise<TicketData> {
  const schema = await entities.getById(TICKETS_ENTITY_ID, {
    folderKey: TICKETS_FOLDER_KEY,
  });
  const records: TicketRecord[] = [];
  let page = (await entities.getAllRecords(TICKETS_ENTITY_ID, {
    pageSize: PAGE_SIZE,
    folderKey: TICKETS_FOLDER_KEY,
  })) as unknown as PaginatedTicketPage;

  while (true) {
    records.push(...page.items);
    if (!page.hasNextPage || !page.nextCursor) break;
    page = (await entities.getAllRecords(TICKETS_ENTITY_ID, {
      pageSize: PAGE_SIZE,
      cursor: page.nextCursor,
      folderKey: TICKETS_FOLDER_KEY,
    })) as unknown as PaginatedTicketPage;
  }

  return { schema, records };
}

function getSchemaFieldName(
  fields: TicketField[],
  expectedName: string,
): string {
  const field = fields.find(
    (candidate) => candidate.name.toLowerCase() === expectedName.toLowerCase(),
  );
  if (!field)
    throw new Error(
      `The Tickets entity is missing the '${expectedName}' field.`,
    );
  return field.name;
}

export async function createTicket(
  entities: Entities,
  fields: TicketField[],
  input: TicketCreateInput,
): Promise<TicketRecord> {
  const subjectField = getSchemaFieldName(fields, "subject");
  const descriptionField = getSchemaFieldName(fields, "description");
  const customerEmailField = getSchemaFieldName(fields, "customerEmail");
  const assigneeField = getSchemaFieldName(fields, "assignee");
  const statusField = getSchemaFieldName(fields, "status");
  const priorityField = getSchemaFieldName(fields, "priority");
  const categoryField = getSchemaFieldName(fields, "category");
  const reasonForDelayField = getSchemaFieldName(fields, "reasonForDelay");

  const payload: Record<string, string> = {
    [subjectField]: input.subject.trim(),
    [descriptionField]: input.description.trim(),
    [customerEmailField]: input.customerEmail.trim(),
    [assigneeField]: input.assignee,
    [statusField]: input.status,
    [priorityField]: input.priority,
    [categoryField]: input.category,
  };

  if (input.reasonForDelay?.trim())
    payload[reasonForDelayField] = input.reasonForDelay.trim();

  return entities.insertRecord({ id: TICKETS_ENTITY_ID }, payload, {
    folderKey: TICKETS_FOLDER_KEY,
  });
}
