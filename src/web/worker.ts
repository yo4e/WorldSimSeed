import { WorldWorkerService } from "./service.js";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ): void;
  postMessage(message: WorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
const service = new WorldWorkerService();

scope.addEventListener("message", (event) => {
  void service.handle(event.data).then((response) => {
    scope.postMessage(response);
  });
});
