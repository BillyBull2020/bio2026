export type OperatorTaskType =
  | "prospect_research"
  | "social_calendar"
  | "sales_sequence"
  | "crm_hygiene"
  | "send_email"
  | "social_publish";

export type OperatorStatus =
  | "queued"
  | "running"
  | "done"
  | "needs_approval"
  | "approved"
  | "rejected"
  | "failed";

export interface OperatorTask {
  id: string;
  type: OperatorTaskType;
  prompt: string;
  status: OperatorStatus;
  createdAt: string;
  updatedAt: string;
  output?: string;
  error?: string;
  model?: string;
  provider?: string;
  durationMs?: number;
  meta: {
    to?: string;
    subject?: string;
    platforms?: string[];
    imageUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    altText?: string;
    scheduledAt?: string;
    channelIds?: string[];
    approvedAt?: string;
    deliveredAt?: string;
    deliveryId?: string;
  };
}
