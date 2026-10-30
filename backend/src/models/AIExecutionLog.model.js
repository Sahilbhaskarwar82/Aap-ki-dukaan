import mongoose from "mongoose";

/**
 * Task SAH-03: AIExecutionLog Model
 *
 * Implements an immutable, append-only observability log for all server-side AI executions
 * (OCR extraction, normalization, catalogue matching, quote summaries, and under-MOQ advisories).
 *
 * Follows mongodb-schema-design and mongoose-optimization best practices:
 * - Append-only: { createdAt: true, updatedAt: false } ensures write-once auditability.
 * - Indexed correlationId enables distributed tracing across HTTP requests and AI operations.
 * - Compound index on { operation: 1, status: 1, createdAt: -1 } for analytics and latency queries.
 * - Safe error recording: stores normalized error codes without leaking API secrets or PII.
 */

export const AI_OPERATIONS = [
  "EXTRACT_REQUIREMENT",
  "NORMALIZE_PRODUCT",
  "MATCH_PRODUCTS",
  "SUMMARIZE_QUOTES",
  "UNDER_MOQ_RECOMMENDATION",
];

export const AI_EXECUTION_STATUSES = [
  "SUCCESS",
  "SCHEMA_VALIDATION_FAILED",
  "TIMEOUT",
  "PROVIDER_ERROR",
  "FALLBACK_USED",
];

const aiExecutionLogSchema = new mongoose.Schema(
  {
    correlationId: {
      type: String,
      required: [true, "Correlation ID is required for traceability."],
      index: true,
      trim: true,
    },
    triggeredByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null,
      index: true,
    },
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      default: null,
      index: true,
    },
    operation: {
      type: String,
      enum: {
        values: AI_OPERATIONS,
        message: "{VALUE} is not a recognized AI operation.",
      },
      required: [true, "AI operation type is required."],
      index: true,
    },
    provider: {
      type: String,
      required: [true, "AI provider name (e.g., gemini, openai, mock) is required."],
      trim: true,
    },
    model: {
      type: String,
      required: [true, "Model identifier is required."],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: AI_EXECUTION_STATUSES,
        message: "{VALUE} is not a valid AI execution status.",
      },
      required: [true, "Execution status is required."],
      index: true,
    },
    latencyMs: {
      type: Number,
      required: [true, "Execution latency in milliseconds is required."],
      min: [0, "Latency cannot be negative."],
    },
    schemaValidated: {
      type: Boolean,
      required: true,
      default: false,
    },
    safeErrorCode: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    // Append-only schema: AI execution logs must be immutable
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for observability dashboards, latency metrics, and failure diagnostics
aiExecutionLogSchema.index({ operation: 1, status: 1, createdAt: -1 });
aiExecutionLogSchema.index({ correlationId: 1, createdAt: -1 });

export const AIExecutionLog = mongoose.model("AIExecutionLog", aiExecutionLogSchema);
export default AIExecutionLog;

