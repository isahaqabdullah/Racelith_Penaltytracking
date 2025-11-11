export const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE
    : 'http://localhost:8000';

async function request<T>(
  path: string,
  init?: RequestInit & { parseJson?: boolean }
): Promise<T> {
  const { parseJson = true, headers, ...rest } = init ?? {};
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    ...rest,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Request failed (${response.status} ${response.statusText}): ${message}`
    );
  }

  if (!parseJson) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export interface InfringementRecord {
  id: number;
  kart_number: number;
  turn_number: number | null;
  description: string;
  observer: string | null;
  warning_count: number;
  penalty_due: 'Yes' | 'No';
  penalty_description: string | null;
  penalty_taken: string | null;
  timestamp: string;
}

export interface PendingPenalty {
  id: number;
  kart_number: number;
  description: string;
  penalty_description: string | null;
  timestamp: string;
  observer: string | null;
}

export interface HistoryRecord {
  id: number;
  infringement_id: number;
  action: string;
  performed_by: string;
  observer: string | null;
  details: string | null;
  timestamp: string;
}

export interface SessionSummary {
  name: string;
  status: string;
  started_at: string | null;
}

export interface CreateInfringementPayload {
  kart_number: number;
  turn_number?: number | null;
  description: string;
  observer: string;
  performed_by: string;
  penalty_description?: string | null;
}

export type UpdateInfringementPayload = CreateInfringementPayload;

export interface ApplyPenaltyResponse {
  kart_number: number;
  status: string;
  infringement_id?: number;
  penalty_description?: string | null;
}

export async function fetchInfringements(): Promise<InfringementRecord[]> {
  return request<InfringementRecord[]>(`/infringements/`);
}

export async function createInfringement(
  payload: CreateInfringementPayload
): Promise<InfringementRecord> {
  return request<InfringementRecord>('/infringements/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateInfringement(
  id: number,
  payload: UpdateInfringementPayload
): Promise<InfringementRecord> {
  return request<InfringementRecord>(`/infringements/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteInfringement(id: number): Promise<void> {
  await request(`/infringements/${id}`, {
    method: 'DELETE',
    parseJson: false,
  });
}

export async function fetchPendingPenalties(): Promise<PendingPenalty[]> {
  return request<PendingPenalty[]>('/penalties/pending');
}

export async function applyIndividualPenalty(
  infringementId: number,
  performedBy: string
): Promise<ApplyPenaltyResponse> {
  return request<ApplyPenaltyResponse>(`/penalties/apply_individual/${infringementId}`, {
    method: 'POST',
    body: JSON.stringify({ performed_by: performedBy }),
  });
}

export async function applyKartPenalties(
  kartNumber: number,
  performedBy: string
): Promise<ApplyPenaltyResponse> {
  return request<ApplyPenaltyResponse>(`/penalties/apply/${kartNumber}`, {
    method: 'POST',
    body: JSON.stringify({ performed_by: performedBy }),
  });
}

export async function fetchHistory(kartNumber: number): Promise<HistoryRecord[]> {
  return request<HistoryRecord[]>(`/history/${kartNumber}`);
}

export async function startSession(name: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/session/start?name=${encodeURIComponent(name)}`, {
    method: 'POST',
  });
}

export async function loadSession(name: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/session/load?name=${encodeURIComponent(name)}`, {
    method: 'POST',
  });
}

export async function closeSession(name: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/session/close?name=${encodeURIComponent(name)}`, {
    method: 'POST',
  });
}

export async function deleteSession(name: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/session/delete?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function listSessions(): Promise<{ sessions: SessionSummary[] }> {
  return request<{ sessions: SessionSummary[] }>('/session/');
}

