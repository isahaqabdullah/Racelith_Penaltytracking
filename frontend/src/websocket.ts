/**
 * Shared WebSocket connection manager for real-time updates
 * This ensures only one WebSocket connection is maintained across the application
 */

import { API_BASE } from './api';

type WebSocketMessageType =
  | 'connected'
  | 'new_infringement'
  | 'update_infringement'
  | 'delete_infringement'
  | 'penalty_applied'
  | 'session_started'
  | 'session_loaded'
  | 'session_closed'
  | 'session_deleted'
  | 'session_imported';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data?: any;
  session?: { name: string };
  imported?: { infringements: number; history: number };
}

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketManager {
  private socket: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 100; // Start with 100ms for faster reconnection
  private readonly initialDelay = 100; // Small delay before first connection attempt
  private handlers: Set<MessageHandler> = new Set();
  private isConnecting = false;
  private url: string;
  private hasConnectedOnce = false; // Track if we've ever successfully connected

  constructor() {
    this.url = this.getWebSocketUrl();
  }

  private getWebSocketUrl(): string {
    // Simple and reliable URL conversion
    // Convert http:// to ws:// and https:// to wss://
    if (!API_BASE || API_BASE.trim() === '' || API_BASE.startsWith('/')) {
      // Relative path or empty - use same origin
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }
    
    // Convert HTTP/HTTPS to WS/WSS and ensure no trailing slash
    const base = API_BASE.replace(/\/$/, '');
    // Replace http with ws (works for both http and https)
    const url = `${base.replace(/^http/, 'ws')}/ws`;
    console.log(`[WebSocket] Constructed URL: ${url} from API_BASE: ${API_BASE}`);
    return url;
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
      return; // Already connected or connecting
    }

    // Clear any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isConnecting = true;
    // Only log connection attempts if we've tried before or if it's a retry
    if (this.reconnectAttempts > 0 || this.hasConnectedOnce) {
      console.log(`[WebSocket] Connecting to ${this.url}...`);
    }
    
    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log(`[WebSocket] ✓ Connected`);
        this.isConnecting = false;
        this.reconnectAttempts = 0; // Reset on successful connection
        this.hasConnectedOnce = true; // Mark that we've successfully connected
      };

      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          // Only log non-connection messages to reduce noise
          if (message.type !== 'connected') {
            console.log('[WebSocket] Message received:', message.type);
          }
          // Notify all handlers
          this.handlers.forEach((handler) => {
            try {
              handler(message);
            } catch (error) {
              console.error('[WebSocket] Error in message handler:', error);
            }
          });
        } catch (error) {
          console.error('[WebSocket] Malformed message:', error, event.data);
        }
      };

      this.socket.onerror = (error) => {
        // Don't log errors during initial connection - they're often network timing issues
        // Only log if we've connected before (indicating a real problem)
        if (this.hasConnectedOnce) {
          console.error('[WebSocket] Error:', error);
        }
        this.isConnecting = false;
      };

      this.socket.onclose = (event) => {
        // Only log if it's not the initial connection failure (1006 is common on first attempt)
        if (event.code !== 1006 || this.hasConnectedOnce) {
          console.log('[WebSocket] Closed', event.code, event.reason);
        }
        this.isConnecting = false;
        this.socket = null;

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          // Use faster reconnection for initial attempts, then exponential backoff
          let delay: number;
          if (this.reconnectAttempts === 0) {
            // First retry: very fast (100ms)
            delay = this.baseReconnectDelay;
          } else if (this.reconnectAttempts < 3) {
            // Next few retries: still fast (200ms, 400ms)
            delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
          } else {
            // Later retries: exponential backoff with max
            delay = Math.min(
              this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
              5000 // Max 5 seconds instead of 30
            );
          }
          
          if (event.code !== 1006 || this.hasConnectedOnce) {
            console.log(
              `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
            );
          }
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[WebSocket] Max reconnection attempts reached');
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to establish connection', error);
      this.isConnecting = false;
      // Retry connection after delay
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(
          this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
          30000
        );
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, delay);
      }
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close(1000, 'Client disconnecting');
      this.socket = null;
    }
    this.handlers.clear();
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    // Ensure connection is established with a small delay to avoid race conditions
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Add a small delay before first connection to ensure page is ready
      if (!this.hasConnectedOnce && this.reconnectAttempts === 0) {
        setTimeout(() => {
          if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.connect();
          }
        }, this.initialDelay);
      } else {
        this.connect();
      }
    }
    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    wsManager.disconnect();
  });
}

