import type { Job } from "bullmq";
import type { CircuitBreaker } from "@fluxpipe/shared";
import { callExternalService } from "../externalService.js";

export interface ProcessJobDeps {
  breaker: CircuitBreaker;
  externalServiceUrl: string;
}

export interface JobData {
  type: string;
  payload: Record<string, unknown>;
  correlationId: string;
}

export async function processJob(job: Job<JobData>, deps: ProcessJobDeps): Promise<Record<string, unknown>> {
  return deps.breaker.execute(() =>
    callExternalService(job.data.payload, { baseUrl: deps.externalServiceUrl }),
  );
}
