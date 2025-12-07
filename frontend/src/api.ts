// Dynamically determine API base URL
// This allows the app to work from any device on the network by detecting the hostname
const getApiBase = (): string => {
  // Check if VITE_API_BASE is explicitly set in environment
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) {
    const envBase = import.meta.env.VITE_API_BASE;
    // If it's set to a relative path, use it (works with nginx proxy)
    if (envBase.startsWith('/')) {
      return envBase;
    }
    // If it's an absolute URL and not localhost, use it
    if (!envBase.includes('localhost') && !envBase.includes('127.0.0.1')) {
      return envBase;
    }
    // If it's localhost but we're in browser, we'll detect hostname instead
  }

  // In browser, detect from current location to work on any network
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname;
    
    // Use the same hostname with backend port 8000
    // This works when accessing from any device on the network
    return `${protocol}//${hostname}:8000`;
  }

  // Fallback for SSR or build time
  return 'http://localhost:8000';
};

export const API_BASE = getApiBase();

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
  turn_number: number | string | null;
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
  turn_number?: string | null;
  description?: string | null;
  observer?: string | null;
  performed_by?: string | null;
  penalty_description?: string | null;
}

export type UpdateInfringementPayload = CreateInfringementPayload;

export interface ApplyPenaltyResponse {
  kart_number: number;
  status: string;
  infringement_id?: number;
  penalty_description?: string | null;
}

export interface PaginatedInfringements {
  items: InfringementRecord[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function fetchInfringements(page: number = 1, limit: number = 300): Promise<PaginatedInfringements> {
  return request<PaginatedInfringements>(`/infringements/?page=${page}&limit=${limit}`);
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

export async function importSession(file: File): Promise<{ status: string; session_name: string; imported: { infringements: number; history: number } }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/session/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Import failed (${response.status} ${response.statusText}): ${message}`
    );
  }

  return (await response.json()) as { status: string; session_name: string; imported: { infringements: number; history: number } };
}

export async function exportSession(
  name: string,
  format: 'json' | 'csv' | 'excel' = 'json'
): Promise<void> {
  const url = `${API_BASE}/session/export?name=${encodeURIComponent(name)}&format=${format}`;
  console.log('🌐 Export API call:', { url, name, format, API_BASE });
  
  try {
    console.log('📡 Fetching export from:', url);
    const response = await fetch(url, {
      method: 'GET',
    });
    console.log('📥 Response received:', { status: response.status, statusText: response.statusText, ok: response.ok });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `Export failed (${response.status} ${response.statusText}): ${message}`
      );
    }

    // Get filename from Content-Disposition header or generate one
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `${name}_${new Date().toISOString().split('T')[0]}.${format}`;
    
    // Map format to file extension
    const extensionMap: Record<string, string> = {
      json: 'json',
      csv: 'csv',
      excel: 'xlsx'
    };
    const extension = extensionMap[format] || format;
    
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    } else {
      // Fallback: use session name and current date
      filename = `${name}_${new Date().toISOString().split('T')[0]}.${extension}`;
    }

    // Download the file
    const blob = await response.blob();
    
    if (blob.size === 0) {
      throw new Error('Received empty file from server');
    }
    
    console.log(`Saving file: ${filename} (${blob.size} bytes)`);
    
    // Try to use File System Access API for "Save As" dialog (modern browsers)
    // @ts-ignore - File System Access API types may not be available
    if ('showSaveFilePicker' in window) {
      try {
        // @ts-ignore
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: format === 'excel' ? 'Excel Spreadsheet' : format === 'csv' ? 'CSV File' : 'JSON File',
              accept: {
                [format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 
                 format === 'csv' ? 'text/csv' : 'application/json']: [`.${extension}`]
              }
            }
          ]
        });
        
        // Write the blob to the selected file
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        console.log(`✅ File saved successfully via File System Access API`);
        return;
      } catch (error: any) {
        // User cancelled the dialog or API failed - fall back to download
        if (error.name === 'AbortError') {
          console.log('User cancelled file save');
          return; // User cancelled, don't show error
        }
        console.warn('File System Access API failed, falling back to download:', error);
        // Fall through to download method
      }
    }
    
    // Fallback: Use traditional download method (for older browsers or if File System API fails)
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.style.display = 'none';
    
    // Add to DOM, click, then remove
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up after a delay to ensure download starts
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(downloadUrl);
    }, 200);
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
}

export interface AppConfig {
  warning_expiry_minutes: number;
}

export async function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('/api/config');
}

export async function updateConfig(config: AppConfig): Promise<AppConfig> {
  return request<AppConfig>('/api/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}
