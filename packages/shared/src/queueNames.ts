// BullMQ rejects queue names containing ":" (it uses colons as the separator
// in the Redis keys it builds internally, e.g. "bull:<queueName>:wait").
export const JOBS_QUEUE = "fluxpipe-jobs";
export const DLQ_QUEUE = "fluxpipe-jobs-dlq";

export const METRICS_PREFIX = "fluxpipe";

/**
 * The circuit breaker lives in the worker process. It publishes its current
 * state to this Redis key on every transition so the API (a separate
 * process) can read it back for the /stats endpoint without needing a
 * shared in-memory instance or a direct RPC hop between the two services.
 */
export const CIRCUIT_STATE_REDIS_KEY = "fluxpipe:circuit-breaker:state";
