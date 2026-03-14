import { logger } from '../utils/logger.js';

export interface ConversationState {
  conversation_id: string;
  last_user_request: string;
  last_search_term_candidate: string | null;
  clarification_pending: boolean;
  clarification_type: string | null;
  clarification_options: string[] | null;
  clarification_question: string | null;
  timestamp: number;
}

const EXPIRATION_MS = 60 * 1000; // 60 seconds
const CLEANUP_INTERVAL_MS = 30 * 1000; // Clean up every 30 seconds

/**
 * In-memory conversation store with automatic expiration.
 */
class ConversationStore {
  private conversations: Map<string, ConversationState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Generate a new conversation ID.
   */
  generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get a conversation by ID. Returns null if expired or not found.
   */
  get(conversationId: string): ConversationState | null {
    const state = this.conversations.get(conversationId);
    
    if (!state) {
      return null;
    }

    // Check expiration
    if (Date.now() - state.timestamp > EXPIRATION_MS) {
      this.conversations.delete(conversationId);
      logger.debug({ conversation_id: conversationId }, 'Conversation expired');
      return null;
    }

    return state;
  }

  /**
   * Create or update a conversation.
   */
  set(state: ConversationState): void {
    state.timestamp = Date.now();
    this.conversations.set(state.conversation_id, state);
    logger.debug({ 
      conversation_id: state.conversation_id,
      clarification_pending: state.clarification_pending 
    }, 'Conversation state updated');
  }

  /**
   * Clear clarification state (when resolved or abandoned).
   */
  clearClarification(conversationId: string): void {
    const state = this.get(conversationId);
    if (state) {
      state.clarification_pending = false;
      state.clarification_type = null;
      state.clarification_options = null;
      state.clarification_question = null;
      this.set(state);
    }
  }

  /**
   * Delete a conversation.
   */
  delete(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Clean up expired conversations.
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, state] of this.conversations) {
      if (now - state.timestamp > EXPIRATION_MS) {
        this.conversations.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned_count: cleaned }, 'Cleaned up expired conversations');
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup interval (for graceful shutdown).
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get stats for debugging.
   */
  getStats(): { active_conversations: number } {
    return {
      active_conversations: this.conversations.size,
    };
  }
}

// Singleton instance
export const conversationStore = new ConversationStore();

