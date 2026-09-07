import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatTurn, ChatTurnCard, ProposalStatus } from '@parcelguard/contracts';
import { ApiClientError, api } from '@/lib/api';

/**
 * Workspace state (Design.md §11 "Initialization and recovery order").
 *
 * Order: demo session -> bootstrap + orders -> conversation, then Send is
 * enabled. Initialization is guarded by a promise ref so React StrictMode's
 * double effect cannot create two conversations.
 */

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cards: ChatTurnCard[];
  /** Set on a user entry whose send failed, so the text is never lost. */
  failure?: { message: string; retryable: boolean };
  /** Reused when retrying, so a retry is never a second write. */
  clientMessageId?: string;
}

let initPromise: Promise<string> | null = null;

export function useWorkspace() {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initError, setInitError] = useState<ApiClientError | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  /** proposal_id -> status, so a card reflects the latest response state. */
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalStatus>>({});
  const idempotencyKeys = useRef(new Map<string, string>());

  const initialize = useCallback(async () => {
    setInitError(null);
    initPromise ??= (async () => {
      await api.startSession();
      const conversation = await api.createConversation();
      return conversation.id;
    })();
    try {
      const id = await initPromise;
      setConversationId(id);
    } catch (error) {
      initPromise = null;
      setInitError(
        error instanceof ApiClientError
          ? error
          : new ApiClientError({
              code: 'NETWORK',
              message: 'Setup failed.',
              status: 0,
              retryable: true,
            }),
      );
    }
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const bootstrap = useQuery({
    queryKey: ['bootstrap'],
    queryFn: api.bootstrap,
    enabled: conversationId !== null,
  });

  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: api.listOrders,
    enabled: conversationId !== null,
  });

  const actions = useQuery({
    queryKey: ['actions', conversationId],
    queryFn: () => api.listActions(conversationId as string),
    enabled: conversationId !== null,
  });

  const applyTurn = useCallback((turn: ChatTurn) => {
    setEntries((current) => [
      ...current,
      {
        id: turn.message.id,
        role: 'assistant',
        content: turn.message.content,
        cards: turn.cards,
      },
    ]);
    setProposalStatuses((current) => {
      const next = { ...current };
      for (const card of turn.cards) {
        if (card.type === 'address_change_proposal') next[card.proposal_id] = card.status;
      }
      return next;
    });
  }, []);

  const sendMessage = useMutation({
    mutationFn: async (input: { content: string; clientMessageId: string }) => {
      if (!conversationId) throw new Error('No conversation');
      return api.sendMessage(conversationId, input);
    },
    onSuccess: (turn) => {
      applyTurn(turn);
      void queryClient.invalidateQueries({ queryKey: ['actions', conversationId] });
    },
  });

  const send = useCallback(
    async (content: string, existingEntryId?: string) => {
      const clientMessageId =
        (existingEntryId && idempotencyKeys.current.get(existingEntryId)) ?? crypto.randomUUID();
      const entryId = existingEntryId ?? `local_${clientMessageId}`;
      idempotencyKeys.current.set(entryId, clientMessageId);

      setEntries((current) => {
        const withoutFailure = current.filter((entry) => entry.id !== entryId);
        return [
          ...withoutFailure,
          { id: entryId, role: 'user', content, cards: [], clientMessageId },
        ];
      });

      try {
        await sendMessage.mutateAsync({ content, clientMessageId });
      } catch (error) {
        const failure =
          error instanceof ApiClientError
            ? { message: error.message, retryable: error.retryable }
            : { message: 'Something went wrong.', retryable: true };
        setEntries((current) =>
          current.map((entry) => (entry.id === entryId ? { ...entry, failure } : entry)),
        );
      }
    },
    [sendMessage],
  );

  const confirmProposal = useMutation({
    mutationFn: async (proposalId: string) => {
      const key = idempotencyKeys.current.get(proposalId) ?? crypto.randomUUID();
      idempotencyKeys.current.set(proposalId, key);
      setProposalStatuses((current) => ({ ...current, [proposalId]: 'executing' }));
      return api.confirmProposal(proposalId, key);
    },
    onSuccess: (result) => {
      setProposalStatuses((current) => ({ ...current, [result.proposal_id]: result.status }));
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['actions', conversationId] });
    },
    onError: (error, proposalId) => {
      // The card must show what the server said, not a guess.
      const status: ProposalStatus =
        error instanceof ApiClientError && error.code === 'PROPOSAL_EXPIRED'
          ? 'expired'
          : error instanceof ApiClientError && error.code === 'ACTION_OUTCOME_UNKNOWN'
            ? 'outcome_unknown'
            : 'failed';
      setProposalStatuses((current) => ({ ...current, [proposalId]: status }));
      void queryClient.invalidateQueries({ queryKey: ['actions', conversationId] });
    },
  });

  const cancelProposal = useMutation({
    mutationFn: (proposalId: string) => api.cancelProposal(proposalId),
    onSuccess: (result) => {
      setProposalStatuses((current) => ({ ...current, [result.proposal_id]: 'cancelled' }));
      void queryClient.invalidateQueries({ queryKey: ['actions', conversationId] });
    },
  });

  const newConversation = useMutation({
    mutationFn: api.createConversation,
    onSuccess: (conversation) => {
      // Chat and activity reset; repository order data does not (Design.md §8.4).
      setConversationId(conversation.id);
      setEntries([]);
      setProposalStatuses({});
      idempotencyKeys.current.clear();
      initPromise = Promise.resolve(conversation.id);
    },
  });

  const busy =
    sendMessage.isPending || confirmProposal.isPending || cancelProposal.isPending;

  return {
    conversationId,
    initError,
    retryInit: initialize,
    bootstrap,
    orders,
    actions,
    entries,
    proposalStatuses,
    send,
    sending: sendMessage.isPending,
    confirmProposal,
    cancelProposal,
    newConversation,
    busy,
  };
}
